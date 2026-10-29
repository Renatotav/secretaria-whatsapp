# CLAUDE.md — Secretaria no WhatsApp

Contrato do projeto para qualquer agente de IA que trabalhar aqui. Leia antes de mudar qualquer coisa.

> ⚠️ **Este repositório é público.** Nunca escreva aqui (nem em código, commits ou comentários) senhas, chaves de API, tokens, links de webhook, IPs/portas do servidor, telefones ou dados pessoais do dono.

## 1. Objetivo

Secretária pessoal que vive no WhatsApp do dono. Ele manda mensagem para o próprio número (texto, áudio, foto de nota fiscal, print/PDF de fatura) e ela registra e responde. Também tem um painel web.

Funções principais:
- **Financeiro:** gastos/receitas, parcelas, fatura do cartão, metas de economia, orçamento por categoria, simulador ("posso comprar…?", "e se meu salário for…?"), fechamento do mês.
- **Agenda/lembretes, diário com humor, CRM das conversas, resumo de grupos, chamados.**

## 2. Arquitetura

- **Next.js 16** (App Router) + **Prisma 7** + **PostgreSQL**. Node 20+.
- **WhatsApp via Evolution API** → webhook em `src/app/api/webhook/route.ts`.
- **IA:** OpenRouter / OpenAI / Groq / Google (configurado no `AgentConfig`, no banco). Transcrição de áudio: Groq > OpenAI > OpenRouter.
- **Agendador** in-process: `src/lib/scheduler.ts` (iniciado por `src/instrumentation.ts`). `scheduler.mjs` na raiz está inerte.
- **Deploy:** EasyPanel builda o `Dockerfile` a partir do GitHub (`master`). `start.sh` roda `prisma db push --accept-data-loss` a cada boot — **mudanças no schema precisam ser só aditivas**.

Arquivos-chave:
| Arquivo | O quê |
|---|---|
| `src/lib/message-handlers.ts` | Fluxo da conversa do canal pessoal: roteia a mensagem e guarda o que espera resposta (print esperando "sim", "quanto foi?", fatura, PDF com senha) |
| `src/lib/finance-reports.ts` | Relatórios e consultas sem IA (resumo do dia/semana, fechamento, contas a pagar, limite do cartão, orçamento, VR) |
| `src/lib/finance-common.ts` | Peças comuns: meses, totais e previsão do mês, tetos, séries (parcela/recorrente), períodos |
| `src/lib/statement-import.ts` | Importação de fatura/extrato (parcelas, repetidos, memória de categoria, datas) |
| `src/lib/finance-*.ts` | text (cartão do lançamento, valores), charts, goals, wishes, simulator, split, history |
| `src/lib/quoted-reply.ts`, `assistant-chat.ts`, `group-messages.ts`, `incoming-media.ts`, `owner-notify.ts` | Resposta citada, conversa com a IA, grupos, áudio/mídia, avisar o dono |
| `src/lib/personal-router.ts` | Prompt + parsing que classifica a mensagem (finance, agenda_add, agenda_query, diary, savings_add, finance_simulation…) |
| `src/lib/dates.ts` | `parseLocalDate`, `todayBRT`, `creditCardBillDate` |
| `src/lib/session-token.ts`, `src/lib/auth.ts`, `src/proxy.ts` | Login do painel (token assinado com HMAC) |
| `src/lib/auto-pay.ts` | Baixa automática só de compras no cartão com fatura vencida |
| `src/app/api/finance/route.ts` | CRUD do financeiro do painel |
| `src/app/(dashboard)/finance/`, `work/` | Telas: `page.tsx` tem o estado; tipos/formatos (`finance-utils.ts`, `work-ui.tsx`), gráficos e painéis ficam em arquivos ao lado |
| `src/app/(dashboard)/layout.tsx`, `mais/` | Casca do painel: barra lateral no computador, abas embaixo no celular (Hoje, Dinheiro, Trabalho, Scooter, ☰ Mais) |
| `src/app/api/config/route.ts` | Configurações: chaves mascaradas; chave nova da Evolution só grava se funcionar (o navegador já colou senha ali) |

## 3. Dados (o que cada campo significa)

`FinanceEntry`:
- `date` = **mês em que o dinheiro sai/entra**. Compra no cartão = **dia do vencimento da fatura** (regra em `creditCardBillDate`: compra antes do `creditCardBestDay` vai para o vencimento do mês; a partir dele, do mês seguinte).
- `purchaseDate` = dia real da compra.
- `status`: `pending` (a pagar/receber) ou `paid`.
- `paymentMethod`: `cartão` (crédito), `pix`, `débito`, `boleto`, `dinheiro`, `ticket`.
- Séries: descrição com `Parcela X/Y`, `(previsto)` ou `(recorrente)`, ou categoria `Assinaturas`. Parcelas futuras são projetadas automaticamente.

`AgentConfig`: uma linha só, com chaves das IAs, Evolution, telefone do dono, `creditCardDueDay`, `creditCardBestDay`.
`SavingsGoal`: metas (meta concluída quando `currentAmount >= targetAmount`).

## 4. Regras de ouro (guardrails)

1. **Produção é real.** Não existe ambiente de teste: o que vai para o `master` e é implantado chega direto no dono.
2. **Banco de produção: só leitura**, sempre em transação somente leitura. Nunca alterar dados do financeiro sem o "sim" explícito do dono.
3. **Fluxo de toda mudança:** `git pull` → mudança → `npx prisma generate` + `npm run build` (tem que passar) → commit/push no `master` → **perguntar ao dono antes de publicar** → deploy → conferir o log do container.
4. **Não mexer em código que funciona** sem pedido. Achou problema? Explique com `arquivo:linha` e espere.
5. **Schema:** só mudanças aditivas (coluna nova com default). Nada de renomear/remover coluna — o `db push --accept-data-loss` apagaria dados.
6. **Segredos fora do repositório**, sempre (ver aviso no topo).
7. **Import normal (estático) em código novo.** `await import("./x")` só quando há motivo (quebrar dependência circular com `message-handlers`/`scheduler`, ou lib pesada); o mapa do Graphify não enxerga chamadas feitas assim.
8. Datas: o container roda em **UTC**; "hoje" do dono é **horário de Brasília** → use `todayBRT()`.
9. Respostas ao dono: português simples, curtas, com emoji moderado.

## 5. Design

Regras visuais do painel em [DESIGN.md](DESIGN.md) e contexto do produto em [PRODUCT.md](PRODUCT.md) — as skills de design devem segui-los.

## 6. Como rodar

```bash
npm ci                 # dependências (não altera o package-lock)
npx prisma generate    # obrigatório antes do build
npm run build          # build de produção (inclui checagem de tipos)
npm test               # regras de dinheiro/datas/Outlook/LGPD (tests/, sem banco)
```

Não há ambiente local com banco. Antes de publicar: `npm run build` e `npm test` passando. Regra nova de dinheiro ou data ganha um teste em `tests/`.
Formato de reais: `brl`/`brlMsg` de `src/lib/format.ts` (não criar cópia).

<!-- graphify-rules-start (managed by `graphify init`) -->
## Use Graphify before grep

This repository is indexed by Graphify: a code graph over its call, dependency, and test structure, exposed through a connected Graphify MCP server. Before reaching for grep or reading files, use the Graphify tools your MCP client lists (their exact names and descriptions are in the server's tool list) for what the graph knows and a text search does not:

- find where a symbol, function, or class is defined (instead of grepping for it)
- understand how something works, or where a behavior is handled
- find who calls a function, or what it calls
- see what a change affects (its blast radius) and which tests cover it
- map a file's dependencies and dependents

Fall back to grep or file reads only for what the graph does not model: literal string or comment matches, non-indexed files, or reading a file you have already located. If no Graphify tools are listed, check the MCP server connection.
<!-- graphify-rules-end -->
