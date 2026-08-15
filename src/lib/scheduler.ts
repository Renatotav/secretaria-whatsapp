import { prisma } from "./prisma";
import { generateDailySummary } from "./summarizer";
import { generateWeeklyReport } from "./weekly-report";
import { checkPendingReminders } from "./reminder";
import { sendTextWithTyping } from "./evolution";
import type { ProviderOptions } from "./openai";

let lastSummaryDate = "";
let lastWeeklyDate = "";
let lastFinanceReminderDate = "";
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

      // Finance reminders (09:00)
      if (hhmm === "09:00" && lastFinanceReminderDate !== todayDate) {
        lastFinanceReminderDate = todayDate;
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
        
        const pendings = await prisma.financeEntry.findMany({
          where: {
            type: "expense",
            status: "pending",
            date: { lte: endOfToday } // Hoje ou atrasado
          }
        });

        if (pendings.length > 0) {
          const lines = pendings.map(p => `- ${p.description || p.category} (R$ ${p.amount.toFixed(2)})`).join("\n");
          const msg = `🚨 *Lembrete Financeiro*\nVocê tem ${pendings.length} conta(s) pendente(s) para hoje ou atrasadas:\n\n${lines}\n\nResponda dizendo "paguei a conta X" para eu dar baixa!`;
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
      }

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
