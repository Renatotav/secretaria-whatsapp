import { prisma } from "./prisma";
import { generateDailySummary } from "./summarizer";
import { generateWeeklyReport } from "./weekly-report";
import { checkPendingReminders, checkDueReminders } from "./reminder";
import { sendTextWithTyping } from "./evolution";
import type { ProviderOptions } from "./openai";
import { buildMonthClosing, sendMonthChart, buildBillsDue, applyMonthResultToReserve, notifyAffordableWishes, buildDailyDigest, sendBudgetChart } from "./message-handlers";

let lastSummaryDate = "";
let lastWeeklyDate = "";
let lastFinanceReminderDate = "";
let lastMonthClosingDate = "";
let lastWishCheckDate = "";
let lastReminderHour = -1;
let lastWorkBriefDate = "";
let lastWorkAlertSlot = "";
let lastEscalaSync: number | null = null; // fim da última cópia do escala já vista
let lastAnsweredRequest = 0; // pedido do botão já respondido ("nada novo" sai uma vez só)

export function startScheduler(): void {
  setInterval(async () => {
    try {
      const config = await prisma.agentConfig.findFirst();
      if (!config) return;

      const now = new Date();
      const brtMillis = now.getTime() - (3 * 60 * 60 * 1000);
      const brtDate = new Date(brtMillis);

      const hhmm = `${String(brtDate.getUTCHours()).padStart(2, "0")}:${String(brtDate.getUTCMinutes()).padStart(2, "0")}`;
      const todayDate = brtDate.toISOString().split("T")[0];
      const isSunday = brtDate.getUTCDay() === 0;
      const currentHour = brtDate.getUTCHours();

      const providerOpts: ProviderOptions = {
        aiProvider: config.aiProvider,
        openaiApiKey: config.openaiApiKey,
        openaiModel: config.openaiModel,
        groqApiKey: config.groqApiKey,
        groqModel: config.groqModel,
        openrouterApiKey: config.openrouterApiKey,
        openrouterModel: config.openrouterModel,
      };
      const evolutionConfig = {
        evolutionUrl: config.evolutionUrl,
        evolutionApiKey: config.evolutionApiKey,
        instanceId: config.instanceId,
      };

      // Daily summary
      // Usa lógica `>=` em vez de `===` para evitar pular o minuto se o servidor estiver lento
      if (hhmm >= config.summaryTime && lastSummaryDate !== todayDate) {
        lastSummaryDate = todayDate;
        const groups = await prisma.groupConfig.findMany({ where: { active: true } });
        for (const group of groups) {
          try {
            await generateDailySummary(
              group.groupJid,
              group.groupName,
              group.focus,
              config.ownerName,
              config.ownerRole,
              config.ownerPhone,
              providerOpts,
              evolutionConfig
            );
          } catch (err) {
            console.error(`Erro ao gerar resumo para o grupo ${group.groupName}:`, err);
          }
        }

        // Resumo do SEU dia (gastos, tetos, previsão, VR, o que vence amanhã).
        // Fica salvo na aba "Resumos Diários"; um por dia (confere no banco,
        // então um reinício depois do horário não manda de novo).
        try {
          // Só conta como "já enviado" o resumo feito a partir do horário
          // agendado: um "Gerar Resumo Agora" no meio do dia não pula o da noite.
          const [sh, sm] = config.summaryTime.split(":").map(Number);
          const scheduledUtc = new Date(`${todayDate}T00:00:00Z`);
          scheduledUtc.setUTCHours(sh + 3, sm, 0, 0);
          const already = await prisma.dailySummary.findFirst({ where: { groupJid: "self", date: todayDate, createdAt: { gte: scheduledUtc } } });
          if (!already && config.ownerPhone) {
            const text = await buildDailyDigest();
            await prisma.dailySummary.create({ data: { groupJid: "self", groupName: "Seu dia", date: todayDate, summary: text, sentAt: new Date() } });
            await sendTextWithTyping(
              evolutionConfig.evolutionUrl,
              evolutionConfig.evolutionApiKey,
              evolutionConfig.instanceId,
              config.ownerPhone,
              text,
              20,
              5
            );
            await sendBudgetChart(config); // gráfico dos tetos
          }
        } catch (err) {
          console.error("Erro ao enviar o resumo do dia:", err);
        }
      }

      // Weekly report (Sundays)
      if (isSunday && hhmm >= config.weeklyTime && lastWeeklyDate !== todayDate) {
        lastWeeklyDate = todayDate;
        try {
          await generateWeeklyReport(
            config.ownerName,
            config.ownerRole,
            config.ownerPhone,
            providerOpts,
            evolutionConfig
          );
        } catch (err) {
          console.error(`Erro ao gerar relatório semanal:`, err);
        }
      }

      // Lembretes do CRM do WhatsApp Web ("retornar para fulano às 10h").
      if (config.ownerPhone) {
        try {
          const { dueContactReminders } = await import("./work-crm");
          for (const msg of await dueContactReminders())
            await sendTextWithTyping(evolutionConfig.evolutionUrl, evolutionConfig.evolutionApiKey, evolutionConfig.instanceId, config.ownerPhone, msg, 20, 5);
        } catch (err) {
          console.error("Erro nos lembretes de contato:", err);
        }
      }

      // Grupo do erro dos chamados com texto (Jev, poucos por minuto).
      try {
        const { classifyPendingGroups } = await import("./work-groups");
        await classifyPendingGroups(5);
      } catch (err) {
        console.error("Erro ao agrupar chamados:", err);
      }

      // Trabalho (Central do Atendente): briefing às 08:00 em dia útil e, logo
      // depois de cada atualização do escala (11h e 16h), só as novidades.
      const weekday = brtDate.getUTCDay() >= 1 && brtDate.getUTCDay() <= 5;
      // Janela 08:00–08:59 (se o minuto exato passar com o servidor ocupado, não perde o dia).
      if (weekday && hhmm >= "08:00" && hhmm < "09:00" && lastWorkBriefDate !== todayDate && config.workBriefDate !== todayDate && config.ownerPhone) {
        lastWorkBriefDate = todayDate;
        await prisma.agentConfig.update({ where: { id: config.id }, data: { workBriefDate: todayDate } });
        try {
          const { buildWorkBriefing } = await import("./work");
          const msg = await buildWorkBriefing(true);
          if (msg) await sendTextWithTyping(evolutionConfig.evolutionUrl, evolutionConfig.evolutionApiKey, evolutionConfig.instanceId, config.ownerPhone, msg, 20, 5);
        } catch (err) {
          console.error("Erro no briefing do trabalho:", err);
        }
      }
      // Alertas logo depois de cada cópia do escala (agendada às 11h/16h ou
      // pedida pelo botão "Atualizar do escala"). Na 1ª volta só memoriza.
      const syncedAt = config.workSyncedAt ? config.workSyncedAt.getTime() : 0;
      const justSynced = lastEscalaSync !== null && syncedAt > lastEscalaSync;
      const requestedAt = config.workSyncRequested ? config.workSyncRequested.getTime() : 0;
      const askedByHim = justSynced && requestedAt > lastAnsweredRequest && syncedAt - requestedAt < 15 * 60_000 && syncedAt >= requestedAt;
      if (askedByHim) lastAnsweredRequest = requestedAt;
      lastEscalaSync = syncedAt;
      const workSlot = justSynced ? `sync ${syncedAt}` : hhmm === "11:10" || hhmm === "16:10" ? `${todayDate} ${hhmm}` : "";
      if (workSlot && lastWorkAlertSlot !== workSlot && config.ownerPhone) {
        lastWorkAlertSlot = workSlot;
        try {
          const { buildWorkNewAlerts } = await import("./work");
          const fresh = await buildWorkNewAlerts();
          const msg = fresh || (askedByHim ? "🔄 Escala atualizado. Nada novo nos seus chamados. 👍" : "");
          if (msg) await sendTextWithTyping(evolutionConfig.evolutionUrl, evolutionConfig.evolutionApiKey, evolutionConfig.instanceId, config.ownerPhone, msg, 20, 5);
        } catch (err) {
          console.error("Erro nos alertas do trabalho:", err);
        }
      }

      // Contas vencendo (09:00): vencidas e as que vencem em até 3 dias, com a
      // fatura do cartão numa linha só. Nada vencendo = nenhuma mensagem.
      if (hhmm === "09:00" && lastFinanceReminderDate !== todayDate && config.ownerPhone) {
        lastFinanceReminderDate = todayDate;
        try {
          const msg = await buildBillsDue("reminder");
          if (msg) {
            await sendTextWithTyping(
              evolutionConfig.evolutionUrl,
              evolutionConfig.evolutionApiKey,
              evolutionConfig.instanceId,
              config.ownerPhone,
              msg,
              20,
              5
            );
          }
        } catch (err) {
          console.error("Erro ao enviar lembrete de contas:", err);
        }
      }

      // Fechamento do mês anterior (todo dia 1º, 09:05)
      if (brtDate.getUTCDate() === 1 && hhmm >= "09:05" && lastMonthClosingDate !== todayDate && config.ownerPhone) {
        lastMonthClosingDate = todayDate;
        try {
          const last = new Date(Date.UTC(brtDate.getUTCFullYear(), brtDate.getUTCMonth() - 1, 1));
          const msg =
            (await buildMonthClosing(last.getUTCFullYear(), last.getUTCMonth())) +
            (await applyMonthResultToReserve(last.getUTCFullYear(), last.getUTCMonth()));
          await sendTextWithTyping(
            evolutionConfig.evolutionUrl,
            evolutionConfig.evolutionApiKey,
            evolutionConfig.instanceId,
            config.ownerPhone,
            msg,
            20,
            5
          );
          await sendMonthChart(config, last.getUTCFullYear(), last.getUTCMonth());
        } catch (err) {
          console.error("Erro ao enviar fechamento do mês:", err);
        }
      }

      // Lista de desejos (09:10): avisa o desejo que passou a caber — no
      // máximo um aviso por item por mês (gravado no próprio item).
      if (hhmm >= "09:10" && lastWishCheckDate !== todayDate && config.ownerPhone) {
        lastWishCheckDate = todayDate;
        try {
          await notifyAffordableWishes(config);
        } catch (err) {
          console.error("Erro ao conferir a lista de desejos:", err);
        }
      }

      // Lembretes pessoais com data/hora: confere a cada ciclo.
      await checkDueReminders(config.ownerPhone, evolutionConfig);

      // Hourly reminders
      if (currentHour !== lastReminderHour) {
        lastReminderHour = currentHour;
        await checkPendingReminders(config.ownerPhone, config.reminderHours, evolutionConfig);
      }
    } catch {
      // scheduler errors are non-fatal
    }
  }, 60_000);
}
