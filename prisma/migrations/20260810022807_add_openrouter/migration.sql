-- AlterTable
ALTER TABLE "AgentConfig" ADD COLUMN     "openrouterApiKey" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "openrouterModel" TEXT NOT NULL DEFAULT 'openai/gpt-4o-mini';

