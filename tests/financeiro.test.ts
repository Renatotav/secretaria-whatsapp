// Testes dos módulos que saíram do message-handlers (28/10/2026). Sem banco.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseLocalDate } from "../src/lib/dates";
import { addMonths, budgetIcon, isInstallment, isRecurring, sobraDoMes, vrDisponivel } from "../src/lib/finance-common";
import { parseBrNumber, paymentLabel, formatFullDate } from "../src/lib/finance-text";
import { parseInstallmentInfo, applyInvoiceDates, avisosFatura, contaPeloNome, palavrasDaLoja, primeiraPalavra } from "../src/lib/statement-import";
import { parseQuotedChange } from "../src/lib/quoted-reply";
import { splitMethod, parseSplit } from "../src/lib/finance-split";
import { histValue } from "../src/lib/finance-history";
import { idadeDoDinheiro } from "../src/lib/idade-dinheiro";
import { lerCsvNubank, lerOfx, movimentoParaLancamento, jaNoApp, pagaFatura } from "../src/lib/extrato-banco";


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

test("idade do dinheiro: saída paga com a entrada mais antiga", () => {
  const d = (dia: number) => new Date(2026, 0, dia, 12);
  const movs = [
    { date: d(1), amount: 1000, type: "income" },
    { date: d(11), amount: 100, type: "expense" }, // 10 dias
    { date: d(21), amount: 100, type: "expense" }, // 20 dias
    { date: d(31), amount: 100, type: "expense" }, // 30 dias
  ];
  assert.equal(idadeDoDinheiro(movs), 20);
  // Gastou tudo e o salário novo é gasto no mesmo dia: a idade cai.
  const curta = [{ date: d(1), amount: 300, type: "income" }, ...[2, 3, 4].map((x) => ({ date: d(x), amount: 100, type: "expense" })), { date: d(10), amount: 300, type: "income" }, ...[10, 10, 10].map((x) => ({ date: d(x), amount: 100, type: "expense" }))];
  assert.equal(idadeDoDinheiro(curta, 3), 0);
  assert.equal(idadeDoDinheiro(movs.slice(0, 2)), null); // poucas saídas
});

test("sobra do teto: só o que sobrou passa; estouro não desconta", () => {
  const lim = new Map([["Alimentação", 900], ["Transporte", 150], ["Lazer", 200]]);
  const gasto = { Alimentação: 800, Transporte: 190 }; // Lazer sem gasto
  assert.deepEqual([...sobraDoMes(lim, gasto)], [["Alimentação", 100], ["Lazer", 200]]);
  assert.equal(sobraDoMes(lim, { Alimentação: 900.004, Transporte: 150, Lazer: 200 }).size, 0);
});

test("extrato do Nubank (CSV) e OFX: só gasto e entrada de verdade, sem repetir o que já foi anotado", () => {
  const csv = [
    "Data,Valor,Identificador,Descrição",
    "01/11/2026,-32.50,a1,Transferência enviada pelo Pix - PADARIA EXEMPLO - 12.345.678/0001-90 - BANCO X",
    "02/11/2026,-18.90,a2,Compra no débito - MERCADO TESTE",
    "03/11/2026,-900.00,a3,Pagamento de fatura",
    "04/11/2026,-100.00,a4,Aplicação RDB",
    "05/11/2026,250.00,a5,Transferência recebida pelo Pix - JOSE FICTICIO SILVA - •••.111.222-•• - BANCO Y",
    "06/11/2026,-50.00,a6,Transferência enviada pelo Pix - MARIA FICTICIA SOUZA - •••.333.444-•• - BANCO Z",
    '07/11/2026,-80.10,a7,"Pagamento de boleto efetuado - LUZ, AGUA E CIA"',
  ].join("\n");
  const movs = lerCsvNubank(csv)!;
  assert.equal(movs.length, 7);
  const ls = movs.map((m) => movimentoParaLancamento(m, "Maria Ficticia")).filter((l) => l !== null);
  assert.deepEqual(ls.map((l) => [l.description, l.amount, l.type, l.paymentMethod]), [
    ["Pix enviado - PADARIA EXEMPLO", 32.5, "expense", "pix"],
    ["MERCADO TESTE", 18.9, "expense", "débito"],
    ["Pix recebido - JOSE FICTICIO SILVA", 250, "income", "pix"],
    ["LUZ, AGUA E CIA", 80.1, "expense", "boleto"], // fatura, RDB e Pix para a própria conta ficam de fora
  ]);
  assert.equal(lerCsvNubank("date,title,amount\n2026-11-01,Loja,10"), null); // fatura do cartão não é extrato da conta

  const ofx = "OFXHEADER:100\n<OFX><BANKTRANLIST><STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261102000000[-3:BRT]<TRNAMT>-18.90<FITID>x<MEMO>Compra no débito - MERCADO TESTE</STMTTRN></BANKTRANLIST></OFX>";
  assert.deepEqual(lerOfx(ofx), [{ date: "2026-11-02", amount: -18.9, description: "Compra no débito - MERCADO TESTE" }]);

  const anotado = { type: "expense", amount: 18.9, date: new Date("2026-11-05T12:00:00Z"), purchaseDate: null, paymentMethod: "pix" };
  assert.equal(jaNoApp(ls[1], [anotado]), 0); // anotou "pix" 3 dias depois: mesmo gasto
  assert.equal(jaNoApp(ls[1], [{ ...anotado, paymentMethod: "cartão" }]), -1); // cartão vem pela fatura
  assert.equal(jaNoApp(ls[1], [{ ...anotado, amount: 19.9 }]), -1);
});

test("Pix para o titular do cartão com o valor da fatura é pagamento da fatura, não gasto", () => {
  const pix = movimentoParaLancamento({ date: "2026-11-07", amount: -1234.56, description: "Transferência enviada pelo Pix - FULANO FICTICIO - •••.111.222-••" }, "Maria Ficticia")!;
  const fatura = { due: new Date("2026-11-10T12:00:00Z"), total: 1234.56 };
  assert.equal(pagaFatura(pix, [fatura]), true);
  assert.equal(pagaFatura(pix, [{ ...fatura, total: 1200 }]), false); // outro valor: gasto de verdade
  assert.equal(pagaFatura(pix, [{ ...fatura, due: new Date("2026-12-10T12:00:00Z") }]), false); // fatura longe
});

test("'paguei a fatura' sem cartão: a que vence primeiro, de qualquer cartão (13/11)", async () => {
  const { escolherFatura } = await import("../src/lib/invoices");
  const open = [
    { card: "", dueDate: "2026-12-10", total: 2059.46, count: 26 },
    { card: "Santander do Bruno", dueDate: "2026-11-15", total: 308.18, count: 2 },
    { card: "Santander do Bruno", dueDate: "2026-12-15", total: 291, count: 1 },
  ];
  assert.equal((escolherFatura(open, null) as { card: string }).card, "Santander do Bruno"); // o lembrete era dela
  assert.equal((escolherFatura(open, "") as { dueDate: string }).dueDate, "2026-12-10"); // "paguei a fatura do C6"
  assert.equal(escolherFatura([open[0], { card: "X", dueDate: "2026-12-10", total: 1, count: 1 }], null), "ambigua");
  assert.equal(escolherFatura([], null), null);
});
