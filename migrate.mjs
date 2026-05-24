import { createClient } from "@libsql/client";

const url = process.env.DATABASE_URL ?? "file:/app/data/prod.db";
const db = createClient({ url });

await db.executeMultiple(`
  CREATE TABLE IF NOT EXISTS "AgentConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL DEFAULT 'Assistente IA',
    "systemPrompt" TEXT NOT NULL DEFAULT 'Voce e um assistente prestativo e amigavel.',
    "temperature" REAL NOT NULL DEFAULT 0.7,
    "maxTokens" INTEGER NOT NULL DEFAULT 1024,
    "historyLimit" INTEGER NOT NULL DEFAULT 10,
    "enabled" INTEGER NOT NULL DEFAULT 1,
    "allowedPhones" TEXT NOT NULL DEFAULT '',
    "evolutionUrl" TEXT NOT NULL DEFAULT '',
    "evolutionApiKey" TEXT NOT NULL DEFAULT '',
    "instanceId" TEXT NOT NULL DEFAULT '',
    "aiProvider" TEXT NOT NULL DEFAULT 'openai',
    "openaiApiKey" TEXT NOT NULL DEFAULT '',
    "openaiModel" TEXT NOT NULL DEFAULT 'gpt-4.1-mini',
    "groqApiKey" TEXT NOT NULL DEFAULT '',
    "groqModel" TEXT NOT NULL DEFAULT 'llama-3.3-70b-versatile',
    "ownerPhone" TEXT NOT NULL DEFAULT '',
    "ownerName" TEXT NOT NULL DEFAULT '',
    "ownerRole" TEXT NOT NULL DEFAULT '',
    "summaryTime" TEXT NOT NULL DEFAULT '18:00',
    "weeklyTime" TEXT NOT NULL DEFAULT '20:00',
    "reminderHours" INTEGER NOT NULL DEFAULT 3,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS "Conversation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "source" TEXT NOT NULL DEFAULT 'chat',
    "phone" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS "Message" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "conversationId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "tokens" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS "GroupConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "groupJid" TEXT NOT NULL UNIQUE,
    "groupName" TEXT NOT NULL DEFAULT '',
    "focus" TEXT NOT NULL DEFAULT '',
    "active" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS "Briefing" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "phone" TEXT NOT NULL,
    "contactName" TEXT NOT NULL DEFAULT '',
    "rawMessage" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "urgency" TEXT NOT NULL DEFAULT 'normal',
    "suggestion" TEXT NOT NULL DEFAULT '',
    "repCode" TEXT NOT NULL DEFAULT '',
    "replied" INTEGER NOT NULL DEFAULT 0,
    "receivedAt" DATETIME NOT NULL,
    "notified" INTEGER NOT NULL DEFAULT 0,
    "read" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS "AgendaItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "source" TEXT NOT NULL DEFAULT 'group',
    "groupJid" TEXT,
    "groupName" TEXT NOT NULL DEFAULT '',
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "dueDate" DATETIME,
    "senderName" TEXT NOT NULL DEFAULT '',
    "rawMessage" TEXT NOT NULL,
    "suggestion" TEXT NOT NULL DEFAULT '',
    "repCode" TEXT NOT NULL DEFAULT '',
    "replied" INTEGER NOT NULL DEFAULT 0,
    "notified" INTEGER NOT NULL DEFAULT 0,
    "reminded" INTEGER NOT NULL DEFAULT 0,
    "done" INTEGER NOT NULL DEFAULT 0,
    "followUpNote" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS "GroupMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "groupJid" TEXT NOT NULL,
    "groupName" TEXT NOT NULL DEFAULT '',
    "senderName" TEXT NOT NULL DEFAULT '',
    "content" TEXT NOT NULL,
    "receivedAt" DATETIME NOT NULL,
    "summarized" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS "DailySummary" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "groupJid" TEXT NOT NULL,
    "groupName" TEXT NOT NULL DEFAULT '',
    "date" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "sentAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS "WeeklyReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "weekStart" TEXT NOT NULL,
    "weekEnd" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "sentAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS "Ticket" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ticketId" TEXT NOT NULL,
    "prefix" TEXT NOT NULL DEFAULT '',
    "groupJid" TEXT NOT NULL DEFAULT '',
    "groupName" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'open',
    "title" TEXT NOT NULL DEFAULT '',
    "mentions" TEXT NOT NULL DEFAULT '[]',
    "lastSeen" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS "PendingReply" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL UNIQUE,
    "targetPhone" TEXT NOT NULL,
    "targetType" TEXT NOT NULL DEFAULT 'private',
    "suggestion" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "used" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

// Colunas incrementais — seguras para rodar em banco já existente
const incremental = [
  `ALTER TABLE "AgentConfig" ADD COLUMN "historyLimit" INTEGER NOT NULL DEFAULT 10`,
  `ALTER TABLE "AgentConfig" ADD COLUMN "enabled" INTEGER NOT NULL DEFAULT 1`,
  `ALTER TABLE "AgentConfig" ADD COLUMN "allowedPhones" TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE "AgentConfig" ADD COLUMN "aiProvider" TEXT NOT NULL DEFAULT 'openai'`,
  `ALTER TABLE "AgentConfig" ADD COLUMN "openaiApiKey" TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE "AgentConfig" ADD COLUMN "openaiModel" TEXT NOT NULL DEFAULT 'gpt-4.1-mini'`,
  `ALTER TABLE "AgentConfig" ADD COLUMN "groqApiKey" TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE "AgentConfig" ADD COLUMN "groqModel" TEXT NOT NULL DEFAULT 'llama-3.3-70b-versatile'`,
  `ALTER TABLE "AgentConfig" ADD COLUMN "ownerPhone" TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE "AgentConfig" ADD COLUMN "ownerName" TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE "AgentConfig" ADD COLUMN "ownerRole" TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE "AgentConfig" ADD COLUMN "summaryTime" TEXT NOT NULL DEFAULT '18:00'`,
  `ALTER TABLE "AgentConfig" ADD COLUMN "weeklyTime" TEXT NOT NULL DEFAULT '20:00'`,
  `ALTER TABLE "AgentConfig" ADD COLUMN "reminderHours" INTEGER NOT NULL DEFAULT 3`,
  `ALTER TABLE "Briefing" ADD COLUMN "suggestion" TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE "Briefing" ADD COLUMN "repCode" TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE "Briefing" ADD COLUMN "replied" INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE "AgendaItem" ADD COLUMN "suggestion" TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE "AgendaItem" ADD COLUMN "repCode" TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE "AgendaItem" ADD COLUMN "replied" INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE "AgentConfig" ADD COLUMN "googleApiKey" TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE "AgentConfig" ADD COLUMN "googleModel" TEXT NOT NULL DEFAULT 'gemini-2.0-flash'`,
];

for (const sql of incremental) {
  try {
    await db.execute(sql);
  } catch {
    // coluna já existe
  }
}

console.log("[migrate] Tables OK");
db.close();
