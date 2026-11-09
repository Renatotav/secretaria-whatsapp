# Questionário do financeiro (instalação para outra pessoa)

Cada pessoa tem a própria instalação da secretária. As respostas abaixo trocam o que antes era fixo no código pelo jeito dela. Instalação sem respostas funciona como a original.

## Perguntas

1. **Quem é:** nome, WhatsApp (com DDI e DDD), horário do resumo do dia e da semana, a partir de quanto um gasto pede confirmação.
2. **Renda:** salário líquido e dia em que cai; vale-refeição ou alimentação (valor e dia do crédito).
3. **Cartões:** nome, dia do vencimento e melhor dia de compra de cada um; se alguém mais deve receber aviso no dia do vencimento.
4. **Contas fixas:** nome, valor, dia, meio de pagamento e categoria (aluguel, luz, internet, assinaturas).
5. **Categorias:** quais da lista padrão não usa, categorias próprias (nome e subcategorias), teto por mês e palavras da região ("mercantil = Alimentação › Supermercado").
6. **Metas:** nome, valor, quanto já tem e prazo.
7. **Jeito de escrever:** 5 exemplos reais de como anota um gasto (viram casos em `src/lib/ai-lab.ts`).

## Como aplicar

1. Passe as respostas para um JSON no formato de [questionario-exemplo.json](questionario-exemplo.json) (dados inventados).
2. Simule: `DATABASE_URL=... npx tsx scripts/aplicar-questionario.ts respostas.json`
3. Grave: o mesmo comando com `--gravar`. Ele recusa banco que já tem lançamentos.

O que cada resposta vira:

| Resposta | Onde fica |
|---|---|
| Nome, WhatsApp, horários, cartões, aviso da fatura | `AgentConfig` |
| Gasto alto, cartão principal, categorias desligadas/próprias, dicas | `AgentConfig.perfilFinanceiro` (tipo `PerfilFinanceiro` em `finance-taxonomy.ts`) |
| Salário, vale e contas fixas | Lançamentos "(recorrente)", projetados 12 meses à frente |
| Tetos | `Budget` (mês "default") |
| Metas | `SavingsGoal` |

Não muda por pessoa (ainda): a leitura em blocos da fatura do C6 (outros bancos usam a leitura genérica) e as correções de frase em `ajustaFrase`.
