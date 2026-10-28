# Secretária Eletrônica Pessoal — WhatsApp IA

Projeto full-stack: dashboard Next.js que conecta OpenAI GPT-4.1-mini ao WhatsApp via Evolution API. Recebe mensagens via webhook, analisa com IA e notifica o dono em "Mensagens para mim". **Nunca responde automaticamente** — só age após aprovação explícita do dono via código REP-XXX. Inclui painel web para testar o agente, visualizar conversas e configurar tudo.

> Desenvolvido para uso pessoal de um **Supervisor de Atendimento**: monitora grupos de trabalho, organiza agenda, rastreia chamados e envia notificações inteligentes. O dono mantém controle total — a secretária só responde quando ele aprova.

---

## Stack

| Camada | Tecnologia | Versão |
|--------|-----------|--------|
| Framework | Next.js App Router, `output: "standalone"` | 16.2.5 |
| UI | React | 19.2.4 |
| Linguagem | TypeScript | ^5 |
| Banco de dados | SQLite (arquivo) | — |
| ORM | Prisma | ^7.8.0 |
| Driver SQLite dev | better-sqlite3 | ^12.9.0 |
| Driver SQLite prod | @libsql/client | ^0.17.3 |
| IA | OpenAI SDK, modelo `gpt-4.1-mini` | ^6.36.0 |
| CSS | Tailwind CSS v4 | ^4 |
| Runtime Docker | Node.js 22-alpine | — |
| Auth | Cookie httpOnly `agent_session`, sem NextAuth | — |

---

## Estrutura de arquivos

```
src/
  app/
    api/
      auth/route.ts
      chat/route.ts              ← mantido (chat de teste no painel)
      config/route.ts
      conversations/route.ts
      briefings/route.ts         ← NOVO: contatos privados
      agenda/route.ts            ← NOVO: agenda pessoal + urgentes de grupos
      tickets/route.ts           ← NOVO: base de chamados
      daily-summary/route.ts     ← NOVO: resumos diários
      weekly-report/route.ts     ← NOVO: relatório semanal
      groups/route.ts            ← NOVO: gerenciar grupos monitorados
      webhook/route.ts           ← MODIFICADO
    (dashboard)/
      layout.tsx                 ← MODIFICADO: sidebar expandida
      page.tsx                   ← Chat de Teste (mantido)
      config/page.tsx            ← MODIFICADO: novos campos
      conversations/page.tsx     ← MODIFICADO: inclui grupos
      briefings/page.tsx         ← NOVO
      agenda/page.tsx            ← NOVO
      tickets/page.tsx           ← NOVO
      daily-summary/page.tsx     ← NOVO
      weekly-report/page.tsx     ← NOVO
      groups/page.tsx            ← NOVO
    login/page.tsx
    layout.tsx
    globals.css                  ← MODIFICADO: novas variáveis CSS
  lib/
    auth.ts
    openai.ts
    evolution.ts
    prisma.ts
    analyzer.ts                  ← NOVO: analisa mensagens privadas
    classifier.ts                ← NOVO: classifica mensagens de grupos
    agenda-parser.ts             ← NOVO: interpreta mensagens para si mesmo
    summarizer.ts                ← NOVO: resumo diário às 18h
    weekly-report.ts             ← NOVO: relatório semanal
    ticket-extractor.ts          ← NOVO: extrai chamados das mensagens
    reminder.ts                  ← NOVO: lembrete de tarefas pendentes
    scheduler.ts                 ← NOVO: agendador (18h, domingo, lembretes)
prisma/schema.prisma             ← MODIFICADO: novos modelos
migrate.mjs                      ← MODIFICADO: novas tabelas
start.sh                         ← MODIFICADO: inicia scheduler
Dockerfile                       ← sem alteração
prisma.config.ts                 ← sem alteração
next.config.ts                   ← sem alteração
tsconfig.json                    ← sem alteração
.env.example                     ← sem alteração
.gitignore                       ← sem alteração
package.json                     ← sem alteração
```

---

## Sistema de Aprovação — REP-XXX

Toda notificação enviada ao dono em "Mensagens para mim" inclui um código único `REP-XXX` e uma sugestão de resposta gerada pela IA. O dono mantém controle total — a secretária só envia quando ele aprova.

**O dono tem 3 opções:**

| Ação | O que fazer | O que acontece |
|---|---|---|
| ✅ Aprovar sugestão | Digitar `REP-001` em "Mensagens para mim" | Secretária envia a sugestão para o contato ou grupo |
| ✏️ Resposta própria | Ir direto no contato/grupo e digitar | Você mesmo envia, secretária registra como respondido |
| ❌ Ignorar | Não fazer nada | Fica registrado no painel como "aguardando" |

**Funciona para contatos privados E grupos:**
```
Grupo PJe — Amanda Alexandre - 09:31
📌 @Renato verifica chamado 1812793

💬 Sugestão: "Verificando agora, já retorno!"
↩️ REP-001 para enviar
```
Você digita `REP-001` em "Mensagens para mim"
→ Secretária envia no grupo: "Verificando agora, já retorno!"

**Regras:**
- Código gerado sequencialmente por dia: REP-001, REP-002, REP-003...
- Código expira após 24h
- Quando `fromMe === true` no webhook: se começa com `REP-` → processar aprovação; caso contrário → ignorar (são as próprias notificações da secretária, evitando loop)
- Após aprovação: marcar como `used: true` e registrar no painel

**Modelo adicional no prisma/schema.prisma:**
```prisma
model PendingReply {
  id          String   @id @default(cuid())
  code        String   @unique    // "REP-001"
  targetPhone String              // número do contato ou groupJid
  targetType  String              // "private" | "group"
  suggestion  String              // texto sugerido pela IA
  sourceId    String              // id do Briefing ou AgendaItem de origem
  used        Boolean  @default(false)
  expiresAt   DateTime
  createdAt   DateTime @default(now())
}
```

**Tabela adicional no migrate.mjs:**
```js
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
```

**Fluxo no webhook quando `fromMe === true`:**
```
1. Extrair texto da mensagem
2. Verificar se é REP-XXX (regex: /^REP-\d+$/i)
3. Se sim:
   a. Buscar PendingReply pelo code
   b. Se não encontrado, expirado ou used === true → ignorar
   c. sendWhatsAppMessage para targetPhone com suggestion
   d. Marcar used: true
   e. Atualizar Briefing ou AgendaItem como replied: true
4. Se não é REP- → ignorar (evita loop das notificações)
```

**Formato da notificação para contato privado:**
```
👤 *{contactName}* — 🕐 {hora}
📋 *{subject}*
{summary}
{badge de urgência}

💬 *Sugestão:*
"{suggestion}"

↩️ Digite *REP-001* aqui para enviar
✏️ Ou responda diretamente no contato
```

**Formato da notificação para grupo:**
```
👥 *{groupName}*
👤 {senderName} — 🕐 {hora}
📌 *{title}*
{description}
{badge de categoria}

💬 *Sugestão:*
"{suggestion}"

↩️ Digite *REP-001* aqui para enviar
✏️ Ou responda diretamente no grupo
```

**Geração da sugestão — adição ao system prompt de analyzer.ts e classifier.ts:**
```
Além da análise, gere uma sugestão de resposta curta, natural e profissional
que o {ownerName} poderia enviar. Máximo 2 frases. Tom adequado ao contexto:
mais formal para superiores, mais direto para colegas de equipe.
Adicione o campo "suggestion": "texto aqui" no JSON de retorno.
```

---

## package.json

Sem alteração — mesmas dependências do projeto original.

```json
{
  "name": "yt-agente-ia",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint"
  },
  "dependencies": {
    "@libsql/client": "^0.17.3",
    "@prisma/adapter-better-sqlite3": "^7.8.0",
    "@prisma/adapter-libsql": "^7.8.0",
    "@prisma/client": "^7.8.0",
    "better-sqlite3": "^12.9.0",
    "dotenv": "^17.4.2",
    "next": "16.2.5",
    "openai": "^6.36.0",
    "prisma": "^7.8.0",
    "react": "19.2.4",
    "react-dom": "19.2.4"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4",
    "@types/better-sqlite3": "^7.6.13",
    "@types/node": "^20",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "eslint": "^9",
    "eslint-config-next": "16.2.5",
    "tailwindcss": "^4",
    "typescript": "^5"
  }
}
```

---

## Arquivos de configuração

### next.config.ts — sem alteração
```ts
import type { NextConfig } from "next";
const nextConfig: NextConfig = { output: "standalone" };
export default nextConfig;
```

### tsconfig.json — sem alteração
```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

### prisma.config.ts — sem alteração
```ts
import path from "node:path";
import { defineConfig } from "prisma/config";
export default defineConfig({
  earlyAccess: true,
  schema: path.join("prisma", "schema.prisma"),
});
```

---

## prisma/schema.prisma — MODIFICADO

Mantém todos os modelos originais e adiciona os novos.

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
}

// ─── MODELOS ORIGINAIS (mantidos) ────────────────────────────────────────────

model AgentConfig {
  id              String   @id @default(cuid())
  name            String   @default("Assistente IA")
  systemPrompt    String   @default("Você é um assistente prestativo e amigável.")
  temperature     Float    @default(0.7)
  maxTokens       Int      @default(1024)
  evolutionUrl    String   @default("")
  evolutionApiKey String   @default("")
  instanceId      String   @default("")
  historyLimit    Int      @default(10)
  enabled         Boolean  @default(true)
  allowedPhones   String   @default("")
  aiProvider      String   @default("openai")
  openaiApiKey    String   @default("")
  openaiModel     String   @default("gpt-4.1-mini")
  groqApiKey      String   @default("")
  groqModel       String   @default("llama-3.3-70b-versatile")
  // ── campos novos ──
  ownerPhone      String   @default("")   // ex: 5585999999999
  ownerName       String   @default("")   // nome como aparece nos grupos
  ownerRole       String   @default("")   // ex: Supervisor de Atendimento
  summaryTime     String   @default("18:00")
  weeklyTime      String   @default("20:00")
  reminderHours   Int      @default(3)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}

model Conversation {
  id        String    @id @default(cuid())
  source    String    @default("chat")   // "chat" | "whatsapp" | "group"
  phone     String?
  messages  Message[]
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
}

model Message {
  id             String       @id @default(cuid())
  conversationId String
  conversation   Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  role           String
  content        String
  tokens         Int?
  createdAt      DateTime     @default(now())
}

// ─── MODELOS NOVOS ────────────────────────────────────────────────────────────

// Perfil de cada grupo (contexto para a IA)
model GroupConfig {
  id          String   @id @default(cuid())
  groupJid    String   @unique
  groupName   String   @default("")
  focus       String   @default("")   // ex: "chamados, reuniões, escalações"
  active      Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

// Mensagens privadas recebidas de contatos
model Briefing {
  id          String   @id @default(cuid())
  phone       String
  contactName String   @default("")
  rawMessage  String
  summary     String
  subject     String
  urgency     String   @default("normal")  // low | normal | high | critical
  receivedAt  DateTime
  notified    Boolean  @default(false)
  read        Boolean  @default(false)
  createdAt   DateTime @default(now())
}

// Agenda pessoal (self) + itens urgentes de grupos
model AgendaItem {
  id           String    @id @default(cuid())
  source       String    @default("group")  // "self" | "group"
  groupJid     String?
  groupName    String    @default("")
  category     String    // mention | task | event | urgent_call | personal | reminder
  title        String
  description  String
  dueDate      DateTime?
  senderName   String    @default("")
  rawMessage   String
  notified     Boolean   @default(false)
  reminded     Boolean   @default(false)
  done         Boolean   @default(false)
  followUpNote String    @default("")
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt
}

// Todas as mensagens de grupos (acumuladas para resumo diário)
model GroupMessage {
  id         String   @id @default(cuid())
  groupJid   String
  groupName  String   @default("")
  senderName String   @default("")
  content    String
  receivedAt DateTime
  summarized Boolean  @default(false)
  createdAt  DateTime @default(now())
}

// Resumos diários gerados às 18h
model DailySummary {
  id        String    @id @default(cuid())
  groupJid  String
  groupName String    @default("")
  date      String                        // "2025-06-11"
  summary   String
  sentAt    DateTime?
  createdAt DateTime  @default(now())
}

// Relatório semanal (todo domingo às 20h)
model WeeklyReport {
  id        String    @id @default(cuid())
  weekStart String                        // "2025-06-09"
  weekEnd   String                        // "2025-06-15"
  content   String
  sentAt    DateTime?
  createdAt DateTime  @default(now())
}

// Base de chamados extraídos automaticamente
model Ticket {
  id        String   @id @default(cuid())
  ticketId  String                        // ex: S2058856, R2068294
  prefix    String   @default("")         // "S" | "R" | ""
  groupJid  String   @default("")
  groupName String   @default("")
  status    String   @default("open")     // open | resolved | pending | escalated
  title     String   @default("")
  mentions  String   @default("[]")       // JSON com histórico de menções
  lastSeen  DateTime
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

---

## Bibliotecas (src/lib/)

### prisma.ts — sem alteração
```ts
import { PrismaClient } from "@prisma/client";
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({ log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"] });
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
```

### auth.ts — sem alteração
Cookie `agent_session` (httpOnly, 7 dias). Sem NextAuth.
- `SESSION_COOKIE = "agent_session"`
- `isAuthenticated(request: Request): boolean`
- `createSession(): string`

### openai.ts — sem alteração
```ts
interface ProviderOptions {
  aiProvider?: string;
  openaiApiKey?: string;
  openaiModel?: string;
  groqApiKey?: string;
  groqModel?: string;
}

export async function generateResponse(
  messages: ChatMessage[],
  systemPrompt: string,
  temperature: number,
  maxTokens: number,
  providerOpts?: ProviderOptions
): Promise<{ content: string; tokens: number }>
```

### evolution.ts — sem alteração
```ts
export async function sendWhatsAppMessage(
  evolutionUrl: string,
  evolutionApiKey: string,
  instanceId: string,
  phone: string,
  text: string
): Promise<void>
```

### analyzer.ts — NOVO
Analisa mensagens privadas recebidas de contatos.

```ts
interface AnalysisResult {
  subject: string;       // assunto em até 6 palavras
  summary: string;       // resumo em 2-3 frases
  urgency: "low" | "normal" | "high" | "critical";
  urgencyReason: string;
  ticketIds: string[];   // chamados citados na mensagem
}

export async function analyzePrivateMessage(
  message: string,
  contactName: string,
  ownerRole: string,
  providerOpts: ProviderOptions
): Promise<AnalysisResult>
```

System prompt interno:
```
Você é secretária pessoal de um {ownerRole}.
Analise a mensagem recebida de "{contactName}".

Retorne APENAS JSON válido:
{
  "subject": "assunto em até 6 palavras",
  "summary": "resumo claro em 2-3 frases",
  "urgency": "low|normal|high|critical",
  "urgencyReason": "justificativa da urgência",
  "ticketIds": ["S2058856"]
}

Critérios de urgência:
- critical: emergência, prazo hoje, pedido urgente explícito
- high: prazo em até 2 dias, assunto importante de trabalho
- normal: assunto sem prazo imediato
- low: conversa informal, sem ação necessária
```

### classifier.ts — NOVO
Decide se mensagem de grupo merece notificação imediata.

```ts
interface ClassificationResult {
  urgent: boolean;
  category: "mention" | "task" | "event" | "urgent_call" | "ignore" | null;
  title: string;
  description: string;
  dueDate: string | null;
  ticketIds: string[];
  reason: string;
}

export async function classifyGroupMessage(
  message: string,
  senderName: string,
  groupName: string,
  groupFocus: string,
  ownerName: string,
  ownerRole: string,
  providerOpts: ProviderOptions
): Promise<ClassificationResult>
```

System prompt interno:
```
Você é secretária pessoal de {ownerName}, {ownerRole}.
Grupo: {groupName} | Foco: {groupFocus}
Enviado por: {senderName}

Exige notificação IMEDIATA se:
- Menciona diretamente @{ownerName} ou seu nome
- Atribui tarefa ao {ownerName}
- Convoca para reunião ou evento
- Chamado urgente que envolve {ownerName}
- Escalação ou problema crítico

NÃO exige notificação:
- Bom dia, boa tarde, figurinhas, brincadeiras
- Confirmações simples ("ok", "certo", "obrigado")
- Discussões que não envolvem {ownerName}

Extraia números de chamados citados (S######, R######, ou só números).

Retorne APENAS JSON válido:
{
  "urgent": boolean,
  "category": "mention|task|event|urgent_call|ignore|null",
  "title": "título curto se urgente",
  "description": "descrição clara se urgente",
  "dueDate": "ISO 8601 ou null",
  "ticketIds": [],
  "reason": "explicação"
}
```

### agenda-parser.ts — NOVO
Interpreta mensagens que o dono envia para o próprio número.

```ts
interface AgendaParseResult {
  type: "add" | "query";
  category: "task" | "event" | "reminder" | "personal";
  title: string;
  description: string;
  dueDate: string | null;
  queryIntent: "pending_today" | "open_tickets" | "group_summary" | null;
  confirmation: string;   // mensagem de confirmação formatada para WhatsApp
}

export async function parsePersonalMessage(
  message: string,
  ownerName: string,
  providerOpts: ProviderOptions
): Promise<AgendaParseResult>
```

System prompt interno:
```
Você é secretária pessoal de {ownerName}.
Ele enviou uma mensagem para si mesmo — pode ser para adicionar algo à agenda
ou consultar informações.

Exemplos de adição:
- "Reunião com Dr. Carlos amanhã às 14h" → event
- "Ligar para Isabela sobre chamado 1812793" → task
- "Pagar cartão sexta" → reminder

Exemplos de consulta:
- "O que tenho pendente hoje?" → queryIntent: pending_today
- "Quais chamados estão abertos?" → queryIntent: open_tickets
- "Resumo do grupo PJe ontem" → queryIntent: group_summary

Retorne APENAS JSON válido:
{
  "type": "add|query",
  "category": "task|event|reminder|personal",
  "title": "título do item",
  "description": "descrição detalhada",
  "dueDate": "ISO 8601 ou null",
  "queryIntent": "pending_today|open_tickets|group_summary|null",
  "confirmation": "✅ Anotado!\n📋 Título\nDetalhes formatados"
}
```

### summarizer.ts — NOVO
Gera resumo diário às 18h para cada grupo.

System prompt interno:
```
Você é secretária de {ownerName}, {ownerRole}.
Mensagens do grupo "{groupName}" de hoje. Foco: {groupFocus}

Inclua: principais assuntos, chamados (com números), decisões,
situação da equipe, pendências em aberto.

Ignore: bom dia, figurinhas, brincadeiras, confirmações simples.

Formato para WhatsApp:
📋 *Resumo — {groupName}*
_{data}_

*📌 Destaques do dia:*
[tópicos]

*🎫 Chamados mencionados:*
[lista ou "Nenhum"]

*👥 Equipe:*
[ausências, novidades]

*⏳ Pendências:*
[o que ficou em aberto ou "Nenhuma"]
```

### weekly-report.ts — NOVO
Gerado todo domingo às 20h com visão estratégica da semana.

System prompt interno:
```
Você é secretária de {ownerName}, {ownerRole}.
Analise a semana completa (resumos diários, agenda, chamados, contatos).

Inclua:
1. Visão geral da semana
2. Chamados: abertos, resolvidos, escalados, recorrentes
3. Tarefas: concluídas vs pendentes
4. Equipe: padrões (ausências, quem mais aciona você)
5. Alertas para a próxima semana
6. Uma sugestão de prioridade para segunda-feira

Formato para WhatsApp:
📊 *Relatório Semanal*
_{semana de DD/MM a DD/MM}_

*📈 Visão Geral:* [resumo executivo]
*🎫 Chamados:* Abertos: X | Resolvidos: X | Escalados: X
*✅ Tarefas:* Concluídas: X | Pendentes: X
*👥 Equipe:* [padrões observados]
*⚠️ Atenção:* [alertas]
*💡 Prioridade segunda:* [sugestão]
```

### ticket-extractor.ts — NOVO
```ts
export async function extractAndSaveTickets(
  ticketIds: string[],
  context: string,
  senderName: string,
  groupJid: string,
  groupName: string
): Promise<void>
```
- Busca ticket pelo `ticketId`; se não existe, cria com `status: "open"`
- Se existe, atualiza `lastSeen` e adiciona ao JSON de `mentions`
- Infere status pelo contexto: "resolvido/encerrado/feito" → `resolved`; "urgente/priorizar" → `escalated`

### reminder.ts — NOVO
Verifica a cada hora tarefas atribuídas ao dono não concluídas após `reminderHours`.
Envia ao dono:
```
🔄 *Lembrete de pendência*
📋 {title}
👥 {groupName} — {senderName}
⏱️ Atribuído há {X}h — ainda pendente
```

### scheduler.ts — NOVO
```
Todo dia às {summaryTime}   → resumo diário de cada grupo ativo
Todo domingo às {weeklyTime} → relatório semanal consolidado
A cada 1h                   → verificar tarefas pendentes (reminder.ts)
```

---

## API Routes

### api/auth/route.ts — sem alteração
- **POST** — compara senha com `ADMIN_PASSWORD`; seta cookie; retorna 200 ou 401
- **DELETE** — limpa cookie; retorna 200

### api/config/route.ts — MODIFICADO
Requer autenticação.
- **GET** — `prisma.agentConfig.findFirst()`; cria padrão se não existir
- **PUT** — upsert com todos os campos incluindo os novos (`ownerPhone`, `ownerName`, `ownerRole`, `summaryTime`, `weeklyTime`, `reminderHours`)

### api/chat/route.ts — sem alteração
Requer autenticação.
- **GET** — lista conversas `source: "chat"` com mensagens
- **POST** — `{ conversationId?, message }`; salva, chama `generateResponse`, salva resposta; retorna `{ conversationId, message }`

### api/conversations/route.ts — MODIFICADO
Requer autenticação.
- **GET** — query params: `phone` (opcional), `source` (opcional: `"whatsapp"` | `"group"`). Retorna conversas com mensagens ordenadas por `createdAt asc`, conversas por `updatedAt desc`

### api/briefings/route.ts — NOVO
Requer autenticação.
- **GET** — query params: `read` (boolean), `urgency`, `from`, `to`. Retorna `Briefing[]` por `receivedAt desc`
- **PATCH** `?id=` — atualiza `read: true`
- **DELETE** `?id=` — remove briefing

### api/agenda/route.ts — NOVO
Requer autenticação.
- **GET** — query params: `done`, `source`, `category`, `from`, `to`. Retorna `AgendaItem[]`
- **PATCH** `?id=` — atualiza `done`, `followUpNote`
- **DELETE** `?id=` — remove item

### api/tickets/route.ts — NOVO
Requer autenticação.
- **GET** — query params: `status`, `groupJid`. Retorna `Ticket[]` por `lastSeen desc`
- **PATCH** `?id=` — atualiza `status`, `title`
- **DELETE** `?id=` — remove ticket

### api/daily-summary/route.ts — NOVO
Requer autenticação.
- **GET** — query params: `groupJid`, `date`. Retorna `DailySummary[]`

### api/weekly-report/route.ts — NOVO
Requer autenticação.
- **GET** — query param: `weekStart`. Retorna `WeeklyReport`

### api/groups/route.ts — NOVO
Requer autenticação.
- **GET** — lista todos os `GroupConfig`
- **PATCH** `?id=` — atualiza `active`, `groupName`, `focus`

### api/webhook/route.ts — MODIFICADO
Sem autenticação (URL pública para a Evolution API).

Payload recebido:
```json
{
  "event": "messages.upsert",
  "data": {
    "key": { "remoteJid": "5511999999999@s.whatsapp.net", "fromMe": false },
    "pushName": "Nome do contato",
    "message": { "conversation": "texto da mensagem" },
    "messageTimestamp": 1718000000
  }
}
```

**Fluxo — Mensagem para Si Mesmo** (`phone === ownerPhone`, `fromMe === false`):
1. Chamar `parsePersonalMessage`
2. Se `type === "add"`: criar `AgendaItem` (`source: "self"`); enviar `confirmation` ao dono
3. Se `type === "query"`: buscar dados no banco conforme `queryIntent`; formatar e enviar resposta ao dono
4. Retornar `{ ok: true }`

**Fluxo — Mensagem Privada** (outros contatos, sem `@g.us`):
1. Ignorar se `fromMe === true`
2. Ignorar se `enabled === false`
3. Extrair `phone`, `contactName` (pushName), `text`, `receivedAt` (messageTimestamp)
4. Chamar `analyzePrivateMessage`
5. Se `ticketIds` não vazio → `extractAndSaveTickets`
6. Criar `Briefing`
7. Salvar conversa em `Conversation` (`source: "whatsapp"`) e `Message` (para visualização no painel)
8. Enviar notificação imediata ao dono:
```
👤 *{contactName}* ({phone})
🕐 {hora pt-BR}

📋 *{subject}*
{summary}

🚨 URGENTE  ← se critical
⚠️ IMPORTANTE  ← se high
```
9. Marcar `notified: true`; retornar `{ ok: true }`

**Fluxo — Mensagem de Grupo** (`remoteJid` com `@g.us`):
1. Ignorar se `fromMe === true`
2. Extrair `groupJid`, `senderName` (pushName ou key.participant), `text`, `receivedAt`
3. Buscar `GroupConfig` pelo `groupJid`; se não existir, criar com `active: true`
4. Se `active === false` → ignorar
5. Salvar em `GroupMessage` (sempre, para o resumo das 18h)
6. Salvar conversa em `Conversation` (`source: "group"`) e `Message` (para visualização no painel)
7. Chamar `classifyGroupMessage`
8. Se `ticketIds` não vazio → `extractAndSaveTickets`
9. Se `urgent === true`:
   - Criar `AgendaItem` (`source: "group"`)
   - Enviar notificação imediata ao dono:
```
👥 *{groupName}*
👤 {senderName} — 🕐 {hora pt-BR}

📌 *{title}*
{description}

📅 {data}  ← se dueDate
🔔 Você foi mencionado  ← se mention
📋 Tarefa atribuída  ← se task
📅 Evento com sua presença  ← se event
🚨 Chamado urgente  ← se urgent_call
```
   - Marcar `notified: true`
10. Retornar `{ ok: true }`

---

## Pages

### Design System (globals.css) — MODIFICADO

Manter todas as variáveis e classes originais. Adicionar:

```css
/* Urgency */
--urgency-critical: #F87171;
--urgency-critical-dim: rgba(248, 113, 113, 0.1);
--urgency-high: #FB923C;
--urgency-high-dim: rgba(251, 146, 60, 0.1);
--urgency-normal: #2DD4BF;
--urgency-normal-dim: rgba(45, 212, 191, 0.09);
--urgency-low: #7A7A9C;
--urgency-low-dim: rgba(122, 122, 156, 0.1);

/* Ticket status */
--ticket-open: #FB923C;
--ticket-resolved: #4ADE80;
--ticket-escalated: #F87171;
--ticket-pending: #A78BFA;

/* Categories */
--cat-mention: #A78BFA;
--cat-task: #F0A020;
--cat-event: #2DD4BF;
--cat-urgent-call: #F87171;
--cat-personal: #60A5FA;
```

### app/layout.tsx — sem alteração

### app/login/page.tsx — sem alteração

### app/(dashboard)/layout.tsx — MODIFICADO
`"use client"`. Sidebar fixa (largura 216px). Mesma lógica original. Links atualizados:

```
🏠  Painel
💬  Chat de Teste       /
👤  Contatos            /briefings
📅  Agenda              /agenda
🎫  Chamados            /tickets
📋  Resumos Diários     /daily-summary
📊  Relatório Semanal   /weekly-report
💬  Conversas           /conversations
👥  Grupos              /groups
⚙️  Configurações       /config
    [Sair]
```

Link ativo: `background: var(--accent-dim)`, `border: 1px solid var(--accent-border)`, `color: var(--accent)`.
Botão "Sair": `DELETE /api/auth` → `router.push("/login")` + `router.refresh()`.

### app/(dashboard)/page.tsx — Chat de Teste — sem alteração
Mantido exatamente como no projeto original. Serve para testar o comportamento da IA antes de conectar ao WhatsApp.

### app/(dashboard)/config/page.tsx — MODIFICADO
Mantém todas as seções originais. Adiciona nova seção **"Meu Perfil"** no topo:
- `ownerPhone` — número no formato `5585999999999`
- `ownerName` — nome como aparece nos grupos
- `ownerRole` — cargo (ex: Supervisor de Atendimento PJe)
- `summaryTime` — horário do resumo diário (padrão 18:00)
- `weeklyTime` — horário do relatório semanal (padrão 20:00, toda domingo)
- `reminderHours` — horas até lembrar tarefa pendente (padrão 3)

### app/(dashboard)/conversations/page.tsx — MODIFICADO
- Mantém layout original (dois painéis, busca por número)
- Adiciona filtro de `source`: "whatsapp" (privadas) | "group" (grupos)
- Grupos: exibe nome do grupo no lugar do número; mensagens mostram `senderName`

### app/(dashboard)/briefings/page.tsx — NOVO
Dois painéis: lista + detalhes.
- **Lista** com filtros: urgência, lido/não lido, intervalo de datas
- Cada item: nome, número, hora, assunto, badge de urgência colorido, ponto se não lido
- **Detalhes**: badge de urgência, assunto, resumo completo, mensagem original em bloco destacado, botão "Marcar como lido"

### app/(dashboard)/agenda/page.tsx — NOVO
Dois painéis: lista + detalhes.
- **Lista** com filtros: categoria, source (pessoal/grupo), status, data
- Ícones por categoria: 📅 evento, 📋 tarefa, ⏰ lembrete, 🗒️ pessoal, 🔔 menção
- **Detalhes**: título, grupo/origem, descrição, data do evento, mensagem original, campo textarea de nota de acompanhamento, botões "Concluído" e "Adiar"

### app/(dashboard)/tickets/page.tsx — NOVO
- Lista todos os chamados detectados automaticamente nas mensagens
- Filtros: status (open/resolved/escalated/pending), grupo, prefixo
- Cada item: ID do chamado, contexto, grupo de origem, quem mencionou, última vez visto, badge de status
- Status editável manualmente
- Linha do tempo de menções (histórico de quem citou e quando)
- Contadores no topo: Abertos | Resolvidos | Escalados | Pendentes

### app/(dashboard)/daily-summary/page.tsx — NOVO
- Seletor de grupo e data
- Exibe resumo gerado pela IA em formato legível
- Histórico de dias anteriores navegável

### app/(dashboard)/weekly-report/page.tsx — NOVO
- Seletor de semana
- Relatório completo gerado pela IA
- Histórico de semanas anteriores

### app/(dashboard)/groups/page.tsx — NOVO
- Lista grupos detectados automaticamente quando chegam mensagens
- Toggle ativo/inativo por grupo
- Nome editável
- Campo "Foco do grupo" (contexto para calibrar a IA, ex: "chamados, reuniões, equipe PJe")
- Contadores: mensagens hoje, itens urgentes, chamados detectados

---

## migrate.mjs — MODIFICADO

```js
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
];

for (const sql of incremental) {
  try { await db.execute(sql); } catch { /* coluna já existe */ }
}

console.log("[migrate] Tables OK");
db.close();
```

---

## start.sh — MODIFICADO

```sh
#!/bin/sh
node /app/migrate.mjs
node /app/scheduler.mjs &   # agendador em background (18h, domingo, lembretes)
node server.js
```

---

## Dockerfile — sem alteração

```dockerfile
FROM node:22-alpine AS base

FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder /app/node_modules/@libsql ./node_modules/@libsql
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/migrate.mjs ./migrate.mjs
COPY --from=builder /app/start.sh ./start.sh

RUN mkdir -p /app/data && chown nextjs:nodejs /app/data
RUN chmod +x start.sh

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV DATABASE_URL="file:/app/data/prod.db"

CMD ["sh", "start.sh"]
```

---

## .env.example — sem alteração

```
DATABASE_URL="file:./dev.db"
OPENAI_API_KEY="sk-..."
ADMIN_PASSWORD="sua-senha-aqui"
NEXTAUTH_SECRET="gere-um-segredo-aleatorio-aqui"
```

---

## Inicialização do projeto do zero

```bash
npm install
npx prisma generate
cp .env.example .env
# preencher .env com os valores reais
npm run dev
```

## Conectar ao GitHub

```bash
git init
git add .
git commit -m "feat: secretaria eletronica pessoal whatsapp"
gh repo create secretaria-whatsapp --private --source=. --remote=origin --push
```

## Deploy no Easypanel

1. Criar serviço **App** conectado ao repositório GitHub, branch `main`
2. Build method: **Dockerfile** (detectado automaticamente)
3. Variáveis de ambiente:
   ```
   OPENAI_API_KEY=sk-...
   ADMIN_PASSWORD=senha-forte
   NEXTAUTH_SECRET=string-aleatoria-longa
   ```
4. Volume persistente: container path `/app/data`
5. Porta: `3000`
6. Após deploy: acessar `/login` → **Configurações** → preencher "Meu Perfil" (`ownerPhone`, `ownerName`, `ownerRole`) → preencher credenciais Evolution API → copiar URL do webhook (`https://seudominio.com/api/webhook`) para configurar na Evolution API com evento `messages.upsert`
7. Após primeiras mensagens chegarem: acessar **Grupos** → preencher campo "Foco do grupo" para calibrar a IA

---

## Comportamento completo

| O que chega | O que a secretária faz |
|---|---|
| Contato privado | Analisa, resume, detecta urgência → notifica imediatamente |
| @menção sua no grupo | Detecta → notifica imediatamente |
| Tarefa atribuída a você | Detecta, agenda → notifica + lembrete se pendente após {X}h |
| Reunião com você | Detecta, agenda → notifica imediatamente |
| Chamado urgente | Detecta, registra na base → notifica imediatamente |
| Qualquer chamado citado | Extrai e registra na base de chamados silenciosamente |
| Discussão geral do grupo | Salva para o resumo das 18h |
| Bom dia, figurinhas, brincadeiras | Ignora completamente |
| Você escreve para si mesmo | Adiciona à agenda ou responde sua consulta |
| Todo dia às 18h | Resumo limpo de cada grupo ativo |
| Todo domingo às 20h | Relatório semanal com insights gerenciais |
| Tarefa pendente há +{X}h | Lembrete automático no WhatsApp |
| Você digita REP-001 em "Msgs para mim" | Secretária envia a sugestão para o contato ou grupo |
| Você responde direto no contato/grupo | Você mesmo envia, secretária registra |
| **Qualquer situação sem REP-XXX** | **NUNCA responde a ninguém automaticamente** |
