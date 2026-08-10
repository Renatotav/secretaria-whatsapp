import { prisma } from "./prisma";
import { generateDailySummary } from "./summarizer";
import { generateWeeklyReport } from "./weekly-report";
import { checkPendingReminders } from "./reminder";
import type { ProviderOptions } from "./openai";

let lastSummaryDate = "";
let lastWeeklyDate = "";
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
      if (hhmm === config.summaryTime && lastSummaryDate !== todayDate) {
        lastSummaryDate = todayDate;
        const groups = await prisma.groupConfig.findMany({ where: { active: true } });
        for (const group of groups) {
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
        }
      }

      // Weekly report (Sundays)
      if (isSunday && hhmm === config.weeklyTime && lastWeeklyDate !== todayDate) {
        lastWeeklyDate = todayDate;
        await generateWeeklyReport(
          config.ownerName,
          config.ownerRole,
          config.ownerPhone,
          providerOpts,
          evolutionConfig
        );
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
