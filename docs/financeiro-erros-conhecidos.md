# Financeiro: erros conhecidos da importação de fatura

Erros que já aconteceram de verdade ao importar a fatura do cartão (PDF ou print). Antes de mexer em `src/lib/statement-import.ts`, na leitura da fatura ou em uma conciliação feita à mão, confira esta lista. Cada erro novo entra aqui com o padrão, como reconhecer e o que fazer.

**Regra de conciliação:** a soma dos lançamentos da fatura (compras menos estornos) precisa bater no centavo com o "total deste cartão" do PDF. Se não bater, a importação não está pronta. Apagar ou mover lançamento só com o "sim" do dono, mostrando antes o que fica no lugar, e sempre com uma linha em `FinanceLog`.

| # | Padrão | Como aparece | O que fazer |
|---|---|---|---|
| 1 | A loja cancela o parcelamento e cobra à vista | Parcelas previstas "Parcela 1/N…N/N" e, na fatura, uma linha só com o valor cheio (≈ N × parcela) | Fica a linha à vista. Apagar a série parcelada inteira, inclusive as parcelas futuras |
| 2 | Previsão ou estimativa com valor diferente do real | "(estimado)"/"(previsto)" continua ao lado da linha real (ex.: assinatura em dólar ou IOF) | Fica a linha real, sai a previsão. A importação só casa a previsão pelo nome dentro de uma folga pequena de valor |
| 3 | Estorno anotado à mão com data diferente | Dois créditos iguais na mesma fatura: o anotado e o da importação | Fica o da fatura. A importação compara a data da compra e não acha o anotado |
| 4 | Série anotada à mão com outro valor por parcela | Série estimada (ex.: "6 itens") e a série real da fatura com outro valor por parcela | Fica a série real, apagar a estimada inteira |
| 5 | A leitura confunde data com parcela | "02/11" lido como "Parcela 11/12", com data de compra no ano anterior e uma "12/12" inventada no mês seguinte | É uma compra comum do dia. Apagar a parcela falsa e a projeção dela, e manter o lançamento que o dono anotou (nota fiscal, divisão VR + cartão) |
| 6 | IOF em dobro | Uma linha "IOF Transações Exterior" e outra com o nome do serviço, do mesmo valor | Fica uma só |
| 7 | Boleto lançado como cartão | Parcelas que "deveriam" estar na fatura e não estão | Trocar o meio de pagamento para boleto. Isso não é falta na fatura |
| 8 | Fechamento antes do melhor dia configurado | Compra do dia 2 entrou na fatura e a do dia 3 não | Antes de mexer em `creditCardBestDay`, conferir em mais de uma fatura |
| 9 | Cobrança por uso projetada como assinatura fixa | Serviço cobrado por recarga (créditos de IA) vira "(previsto)" em todos os meses seguintes | Perguntar ao dono se é mensal. Se não for, tirar as projeções |

## Próximo passo no código

- Ler o "total deste cartão" do PDF e avisar quando a soma importada não bater.
- Na importação, casar previsão e estorno anotados com o real mesmo com valor ou data diferentes (padrões 2 e 3).
- Não aceitar "Parcela X/Y" cuja data de compra caia mais de um ano antes da fatura (padrão 5).
