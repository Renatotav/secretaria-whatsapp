// Testes dos módulos que saíram do message-handlers (28/10/2026). Sem banco.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseLocalDate } from "../src/lib/dates";
import { addMonths, budgetIcon, isInstallment, isRecurring, vrDisponivel } from "../src/lib/finance-common";
import { parseBrNumber, paymentLabel, formatFullDate } from "../src/lib/finance-text";
import { parseInstallmentInfo, applyInvoiceDates, avisosFatura, contaPeloNome, palavrasDaLoja, primeiraPalavra } from "../src/lib/statement-import";
import { parseQuotedChange } from "../src/lib/quoted-reply";
import { splitMethod, parseSplit } from "../src/lib/finance-split";
import { histValue } from "../src/lib/finance-history";
import { planoDoQuestionario, proximoDia } from "../src/lib/questionario";
import { normalizaPerfil, taxonomyPrompt, despesasDoPerfil } from "../src/lib/finance-taxonomy";

const iso = (d: Date) => d.toISOString().slice(0, 10);

test("addMonths não pula mês curto (recorrente no dia 31)", () => {
  assert.equal(iso(addMonths(parseLocalDate("2026-01-31"), 1)), "2026-02-28");
  assert.equal(iso(addMonths(parseLocalDate("2028-01-31"), 1)), "2028-02-29"); // bissexto
  assert.equal(iso(addMonths(parseLocalDate("2026-01-31"), 2)), "2026-03-31");
  assert.equal(iso(addMonths(parseLocalDate("2026-11-10"), 3)), "2027-02-10"); // fatura: dia 10, vira o ano
});

test("valores escritos do jeito brasileiro", () => {
  assert.deepEqual(["1.234,56", "25,90", "230", "1.200"].map(parseBrNumber), [1234.56, 25.9, 230, 1200]);
});

test("forma de pagamento: dinheiro não vira débito", () => {
  assert.equal(splitMethod("dinheiro").paymentMethod, "dinheiro");
  assert.equal(splitMethod("débito").paymentMethod, "débito");
  assert.equal(splitMethod("vr").account, "VR");
  assert.equal(splitMethod("vale antigo").account, "Vale antigo");
  const r = parseSplit("50 no dinheiro e o resto no cartão", 120);
  assert.ok(Array.isArray(r));
  assert.deepEqual(r.map((p) => [p.amount, p.paymentMethod]), [[50, "dinheiro"], [70, "cartão"]]);
});

test("texto do pagamento e data por extenso", () => {
  assert.equal(paymentLabel("pix", parseLocalDate("2026-10-24")), "Pix, pago em 24/10");
  assert.equal(paymentLabel("cartão", parseLocalDate("2026-11-10")), "💳 cartão, fatura de 10/11");
  assert.equal(formatFullDate(parseLocalDate("2026-10-24")), "24/10/2026");
});

test("parcela da fatura: lê X/Y e a data da compra", () => {
  assert.deepEqual(parseInstallmentInfo("AMAZON BR - Parcela 3/10 (compra em 14/02)"), { current: 3, total: 10, purchaseDate: "02-14", baseDescription: "AMAZON BR" });
  assert.equal(parseInstallmentInfo("AMAZON BR - Parcela 3/10", parseLocalDate("2026-10-24"))?.purchaseDate, "10-24");
  assert.equal(parseInstallmentInfo("AMAZON BR 03/10"), null);
  assert.equal(isInstallment("X - Parcela 2/5"), true);
  assert.equal(isRecurring({ description: "Netflix", category: "Assinaturas" }), true);
  assert.equal(isRecurring({ description: "Mercado", category: "Alimentação" }), false);
});

test("datas da fatura: compra de dezembro na fatura de janeiro fica no ano certo", () => {
  const e = applyInvoiceDates({ date: "x", purchaseDate: "2026-12-20", description: "LOJA" } as never, parseLocalDate("2027-01-10"));
  assert.equal(e.date, "2027-01-10");
  assert.equal(e.purchaseDate, "2026-12-20");
  assert.equal(e.paymentMethod, "cartão");
});

test("corrigir pela mensagem citada", () => {
  assert.deepEqual(parseQuotedChange("na verdade foi 230"), { amount: 230 });
  assert.deepEqual(parseQuotedChange("era pix"), { paymentMethod: "pix" });
  assert.deepEqual(parseQuotedChange("foi no débito"), { paymentMethod: "débito" });
});

test("histórico e teto em linguagem dele", () => {
  assert.equal(histValue("amount", 25.9), "R$ 25,90");
  assert.equal(histValue("status", "paid"), "pago");
  assert.deepEqual([69, 70, 100].map(budgetIcon), ["🟢", "🟡", "🔴"]);
});

test("vrDisponivel: crédito do fim do mês só paga a comida do mês seguinte", () => {
  const dia = (m: number, d: number, y = 2026) => new Date(y, m - 1, d, 12);
  const vr = [
    { type: "income", amount: 600, status: "paid", date: dia(10, 30) },
    { type: "expense", amount: 580, status: "paid", date: dia(11, 3) },
    { type: "income", amount: 700, status: "pending", date: dia(11, 30) },
    { type: "income", amount: 700, status: "pending", date: dia(12, 30) },
  ];
  assert.equal(vrDisponivel(vr, 2026, 10).toFixed(2), "20.00"); // novembro: só o saldo
  assert.equal(vrDisponivel(vr, 2026, 11).toFixed(2), "720.00"); // dezembro: saldo + crédito de 30/11
  assert.equal(vrDisponivel(vr, 2027, 0).toFixed(2), "720.00"); // janeiro: não acumula os dois créditos
  assert.equal(vrDisponivel([{ type: "expense", amount: 10, status: "paid", date: dia(11, 3) }], 2026, 10), 0);
});

test("primeiraPalavra: casa a previsão com a linha real da fatura", () => {
  assert.equal(primeiraPalavra("SERVICO X, INC NE (estimado)"), "servico");
  assert.equal(primeiraPalavra("Serviço X Inc"), "servico");
  assert.equal(primeiraPalavra("DL *UBER"), ""); // curta demais para casar sozinha
});

test("avisosFatura: parcelado que veio à vista e data lida como parcela", () => {
  const d = (m: number, dia: number) => new Date(2026, m - 1, dia, 12);
  const linhas = [
    { id: "a", type: "expense", amount: 120.0, description: "LOJAX BR", purchaseDate: d(10, 9) },
    { id: "b", type: "expense", amount: 20.0, description: "Lojax — Tênis - Parcela 1/6", purchaseDate: d(10, 9) },
    { id: "c", type: "expense", amount: 15.5, description: "MERCADO Y - Parcela 11/12", purchaseDate: new Date(2025, 10, 2, 12) },
    { id: "d", type: "expense", amount: 15.5, description: "Nota Fiscal (16 itens)", purchaseDate: d(11, 2) },
    { id: "e", type: "expense", amount: 50, description: "OUTRA LOJA", purchaseDate: d(10, 20) },
  ];
  const avisos = avisosFatura(linhas, new Set(["a", "c", "e"]));
  assert.equal(avisos.length, 2);
  assert.match(avisos[0], /veio à vista/);
  assert.match(avisos[1], /lida como parcela/);
  assert.equal(avisosFatura(linhas, new Set(["e"])).length, 0); // nada da fatura parecido: sem aviso
});

test("palavrasDaLoja: acha a loja pelo nome, sem palavras genéricas", () => {
  assert.deepEqual(palavrasDaLoja("Pizzaria Suprema — pizza grande 8 pedaços"), ["suprema"]);
  assert.deepEqual(palavrasDaLoja("Supermercado Guará — compras"), ["guara"]);
  assert.deepEqual(palavrasDaLoja("Uber — ida ao trabalho"), []); // curta demais: sem palpite
});

test("contaPeloNome: 'paguei o seguro' acha a conta prevista pelo nome", () => {
  const contas = [
    { id: "a", description: "Aluguel (recorrente)" },
    { id: "b", description: "Seguro scooter Sura - Parcela 1/10 (compra em 10/2026)" },
    { id: "c", description: "Seguro do celular" },
  ];
  assert.equal(contaPeloNome("Paguei o seguro scooter Sura", contas), "b");
  assert.equal(contaPeloNome("paguei o aluguel", contas), "a");
  assert.equal(contaPeloNome("paguei o seguro", contas), null); // empate entre dois seguros: pergunta o valor
  assert.equal(contaPeloNome("paguei a luz", contas), null);
});

test("perfil: sem respostas fica igual ao original; categorias desligadas saem do prompt", () => {
  assert.equal(taxonomyPrompt({}).includes("Besteira"), true);
  const p = normalizaPerfil({ categoriasDesligadas: ["Besteira", "Scooter"], categoriasExtras: { Pets: ["Ração"] }, gastoAlto: "x" });
  assert.equal(p.gastoAlto, undefined); // tipo errado é ignorado
  assert.equal("Besteira" in despesasDoPerfil(p), false);
  assert.deepEqual(despesasDoPerfil(p).Pets, ["Ração"]);
  const prompt = taxonomyPrompt(p);
  assert.equal(/Besteira|Scooter/.test(prompt.replace("(não é Besteira)", "")), false);
  assert.equal(prompt.includes("Pets (Ração)"), true);
});

test("questionário: monta config, recorrentes e acusa resposta faltando", () => {
  const hoje = new Date(2026, 10, 20, 12);
  assert.equal(proximoDia(25, hoje), "2026-11-25");
  assert.equal(proximoDia(5, hoje), "2026-12-05");
  assert.equal(proximoDia(31, new Date(2026, 1, 1, 12)), "2026-02-28");
  const plano = planoDoQuestionario({
    nome: "Fulano", whatsapp: "5585999990000",
    cartao: { nome: "Nubank", vencimento: 10, melhorDia: 3 },
    salario: { valor: 2500, dia: 5 },
    contasFixas: [{ nome: "Aluguel", valor: 900, dia: 5, categoria: "Moradia", subcategoria: "Aluguel" }],
    tetos: { Alimentação: 700, Lixo: 0 },
  }, hoje);
  assert.deepEqual(plano.erros, []);
  assert.equal(plano.config.creditCardBestDay, 3);
  assert.equal(plano.config.perfilFinanceiro.cartaoPrincipal, "Nubank");
  assert.deepEqual(plano.lancamentos.map((l) => l.description), ["Salário (recorrente)", "Aluguel (recorrente)"]);
  assert.deepEqual(plano.tetos, [{ category: "Alimentação", amount: 700 }]);
  assert.equal(planoDoQuestionario({ nome: "", whatsapp: "123" }, hoje).erros.length, 2);
});

test("perfil configurado começa genérico; sem perfil fica como era", () => {
  assert.equal("Besteira" in despesasDoPerfil({}), true); // instalação antiga: igual a antes
  const nova = despesasDoPerfil({ versao: 1 });
  assert.equal("Besteira" in nova || "Scooter" in nova || "Saídas" in nova, false);
  assert.equal("Outros" in nova && "Moradia" in nova, true);
  const marcada = despesasDoPerfil({ versao: 1, categorias: ["Moradia", "Besteira"] });
  assert.deepEqual(Object.keys(marcada).sort(), ["Besteira", "Moradia", "Outros"]);
  assert.equal(taxonomyPrompt({ versao: 1 }).includes("Besteira"), false);
});
