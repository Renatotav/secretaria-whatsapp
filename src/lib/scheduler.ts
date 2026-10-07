import { prisma } from "./prisma";
import { generateDailySummary } from "./summarizer";
import { generateWeeklyReport } from "./weekly-report";
import { checkPendingReminders, checkDueReminders } from "./reminder";
import { sendTextWithTyping } from "./evolution";
import type { ProviderOptions } from "./openai";
import { buildMonthClosing, sendMonthChart, buildBillsDue } from "./message-handlers";

let lastSummaryDate = "";
let lastWeeklyDate = "";
let lastFinanceReminderDate = "";
let lastMonthClosingDate = "";
let lastReminderHour = -1;

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
          const msg = await buildMonthClosing(last.getUTCFullYear(), last.getUTCMonth());
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
