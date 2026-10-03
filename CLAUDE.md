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
| `src/lib/message-handlers.ts` | Tudo que acontece com mensagem do canal pessoal (lançar gasto, nota fiscal, extrato/fatura, consultas, simulador, metas) |
| `src/lib/personal-router.ts` | Prompt + parsing que classifica a mensagem (finance, agenda_add, agenda_query, diary, savings_add, finance_simulation…) |
| `src/lib/dates.ts` | `parseLocalDate`, `todayBRT`, `creditCardBillDate` |
| `src/lib/session-token.ts`, `src/lib/auth.ts`, `src/middleware.ts` | Login do painel (token assinado com HMAC) |
| `src/lib/auto-pay.ts` | Baixa automática só de compras no cartão com fatura vencida |
| `src/app/api/finance/route.ts` | CRUD do financeiro do painel |

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
7. Datas: o container roda em **UTC**; "hoje" do dono é **horário de Brasília** → use `todayBRT()`.
8. Respostas ao dono: português simples, curtas, com emoji moderado.

## 5. Como rodar

```bash
npm ci                 # dependências (não altera o package-lock)
npx prisma generate    # obrigatório antes do build
npm run build          # build de produção (inclui checagem de tipos)
```

Não há testes automatizados nem ambiente local com banco; o build é a verificação mínima.
