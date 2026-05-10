/**
 * Standalone scheduler process — runs as a background job via start.sh
 * Imports compiled Next.js server-side code is not possible, so this
 * process uses @libsql/client directly for DB access and calls the
 * Next.js API routes internally via localhost HTTP.
 */

import { createClient } from "@libsql/client";

const DB_URL = process.env.DATABASE_URL ?? "file:/app/data/prod.db";
const NEXT_URL = process.env.NEXT_URL ?? "http://localhost:3000";

const db = createClient({ url: DB_URL });

let lastSummaryDate = "";
let lastWeeklyDate = "";
let lastReminderHour = -1;

async function getConfig() {
  const result = await db.execute('SELECT * FROM "AgentConfig" LIMIT 1');
  return result.rows[0] ?? null;
}

async function triggerDailySummaries() {
  const groups = await db.execute('SELECT * FROM "GroupConfig" WHERE "active" = 1');
  for (const group of groups.rows) {
    try {
      await fetch(`${NEXT_URL}/api/daily-summary`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-scheduler": "1" },
        body: JSON.stringify({ groupJid: group.groupJid }),
      });
    } catch {
      // ignore
    }
  }
}

async function triggerWeeklyReport() {
  try {
    await fetch(`${NEXT_URL}/api/weekly-report`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-scheduler": "1" },
    });
  } catch {
    // ignore
  }
}

async function triggerReminders() {
  try {
    await fetch(`${NEXT_URL}/api/agenda`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-scheduler": "1" },
      body: JSON.stringify({ action: "reminders" }),
    });
  } catch {
    // ignore
  }
}

async function tick() {
  try {
    const config = await getConfig();
    if (!config) return;

    const now = new Date();
    const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    const todayDate = now.toISOString().split("T")[0];
    const isSunday = now.getDay() === 0;
    const currentHour = now.getHours();

    const summaryTime = config.summaryTime ?? "18:00";
    const weeklyTime = config.weeklyTime ?? "20:00";

    if (hhmm === summaryTime && lastSummaryDate !== todayDate) {
      lastSummaryDate = todayDate;
      console.log(`[scheduler] Triggering daily summaries at ${hhmm}`);
      await triggerDailySummaries();
    }

    if (isSunday && hhmm === weeklyTime && lastWeeklyDate !== todayDate) {
      lastWeeklyDate = todayDate;
      console.log(`[scheduler] Triggering weekly report at ${hhmm}`);
      await triggerWeeklyReport();
    }

    if (currentHour !== lastReminderHour) {
      lastReminderHour = currentHour;
      console.log(`[scheduler] Checking reminders at hour ${currentHour}`);
      await triggerReminders();
    }
  } catch (err) {
    console.error("[scheduler] Error:", err);
  }
}

console.log("[scheduler] Started");
setInterval(tick, 60_000);
tick();
