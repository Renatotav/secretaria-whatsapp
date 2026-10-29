// Testes das regras que mexem com dinheiro e datas (sem banco: nada aqui conecta).
// Rodar: npm test   (TZ=UTC, igual ao container)
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseLocalDate, creditCardBillDate } from "../src/lib/dates";
import { merchantKey, isBesteiraItem, productKey } from "../src/lib/finance-taxonomy";
import { maskPersonalData, normalizeTicketId } from "../src/lib/work-privacy";
import { parseIcs, meetingsOn } from "../src/lib/outlook-calendar";
import { parseSplit, splitRequests } from "../src/lib/message-handlers";
import { brl } from "../src/lib/format";
import { analisarPadroes } from "../src/lib/padroes";
import { sqlSeguro } from "../src/lib/assistant-chat";

const iso = (d: Date) => d.toISOString().slice(0, 10);

test("fatura: compra antes do melhor dia cai no vencimento do mês; a partir dele, no seguinte", () => {
  assert.equal(iso(creditCardBillDate(parseLocalDate("2026-10-03"), 10, 4)), "2026-10-10");
  assert.equal(iso(creditCardBillDate(parseLocalDate("2026-10-04"), 10, 4)), "2026-11-10");
  assert.equal(iso(creditCardBillDate(parseLocalDate("2026-10-24"), 10, 4)), "2026-11-10");
  assert.equal(iso(creditCardBillDate(parseLocalDate("2026-12-20"), 10, 4)), "2027-01-10"); // vira o ano
});

test("data local fica ao meio-dia (não volta um dia no fuso)", () => {
  assert.equal(parseLocalDate("2026-10-24").toISOString(), "2026-10-24T12:00:00.000Z");
});

test("pagamento dividido: '100 no pix e o resto no cartão'", () => {
  const r = parseSplit("100 no pix e o resto no cartão", 250);
  assert.ok(Array.isArray(r));
  assert.deepEqual(r.map((p) => [p.amount, p.paymentMethod]), [[100, "pix"], [150, "cartão"]]);
});

test("vários pedidos numa mensagem só separam quando cada pedaço é um pedido", () => {
  assert.deepEqual(splitRequests("Gastei 25 no mercado, registra 120 km na scooter e me lembra de calibrar sábado"),
    ["Gastei 25 no mercado", "registra 120 km na scooter", "me lembra de calibrar sábado"]);
  assert.deepEqual(splitRequests("gastei 30 no uber e 20 na padaria"), []); // "20 na padaria" não é pedido sozinho
  assert.deepEqual(splitRequests("gastei 600 na tv e anota 120 km na scooter"), []); // gasto alto vai sozinho (pede "sim")
});

test("loja da fatura sem parcela/previsto (memória de categoria)", () => {
  assert.equal(merchantKey("AMAZON BR - Parcela 8/10 (compra em 14/02) (previsto)"), "AMAZON BR");
});

test("Besteira: cerveja e salgadinho sim; refrigerante não", () => {
  assert.equal(isBesteiraItem({ name: "CERV HEINEKEN 350ML", category: "" }), true);
  assert.equal(isBesteiraItem({ name: "SALG PIPPOS 70G", category: "" }), true);
  assert.equal(isBesteiraItem({ name: "REFRIG COCA COLA 2L", category: "" }), false);
});

test("LGPD: CPF mascarado, número de processo preservado", () => {
  const t = maskPersonalData("CPF 123.456.789-09 no processo 0053044-16.2020.8.06.0001");
  assert.match(t, /xxx\.xxx\.xxx-xx/);
  assert.match(t, /0053044-16\.2020\.8\.06\.0001/);
  assert.equal(normalizeTicketId(" r2484992 "), "R2484992");
});

test("Outlook: 2ª terça, última sexta e fuso UTC", () => {
  const ev = (uid: string, start: string, rr = "") => `BEGIN:VEVENT\r\nUID:${uid}\r\nSUMMARY:${uid}\r\n${start}\r\n${rr ? `RRULE:${rr}\r\n` : ""}END:VEVENT\r\n`;
  const e = parseIcs("BEGIN:VCALENDAR\r\n" + ev("2a-terca", "DTSTART;TZID=SA Eastern Standard Time:20260113T090000", "FREQ=MONTHLY;BYDAY=2TU") +
    ev("ultima-sexta", "DTSTART;TZID=SA Eastern Standard Time:20260130T090000", "FREQ=MONTHLY;BYDAY=-1FR") + ev("utc", "DTSTART;TZID=UTC:20261027T170000") + "END:VCALENDAR\r\n");
  assert.deepEqual(meetingsOn(e, "2026-10-13").map((m) => m.title), ["2a-terca"]);
  assert.deepEqual(meetingsOn(e, "2026-10-14"), []);
  assert.deepEqual(meetingsOn(e, "2026-10-30").map((m) => m.title), ["ultima-sexta"]);
  assert.equal(meetingsOn(e, "2026-10-27")[0].start, "14:00"); // 17h UTC = 14h em Fortaleza
});

test("dinheiro no formato brasileiro", () => {
  assert.equal(brl(1234.5).replace(/ /g, " "), "R$ 1.234,50");
});

test("Raio-X: o mesmo produto escrito de dois jeitos vira uma linha só", () => {
  assert.equal(productKey("CERV HEINEKEN LN 330ML"), productKey("Cerveja Heineken Ln"));
  assert.equal(productKey("COSTELA SUI SEARA RESERVA CONG kg"), "costela sui seara reserva cong");
  assert.notEqual(productKey("MINI COXINHA SUCRE 220G FRA"), productKey("MINI COXINHA SUCRE 220G QUE"));
});

test("padrões: dias ruins, gatilhos e gasto depois de dia ruim (sem IA)", () => {
  const diario = [
    { dia: "2026-10-01", humor: "ruim", texto: "Cansado do plantão, trabalho puxado" },
    { dia: "2026-10-08", humor: "pessimo", texto: "Exausto, plantão de novo" },
    { dia: "2026-10-15", humor: "ruim", texto: "Saudade e cansado" },
    { dia: "2026-10-20", humor: "neutro", texto: "ok" },
    { dia: "2026-10-21", humor: "neutro", texto: "ok" },
  ];
  const gastos = [
    { dia: "2026-10-02", valor: 20, categoria: "Alimentação" },
    { dia: "2026-10-09", valor: 30, categoria: "Alimentação" },
    { dia: "2026-10-16", valor: 40, categoria: "Alimentação" },
    { dia: "2026-10-22", valor: 50, categoria: "Alimentação" },
    { dia: "2026-10-23", valor: 11000, categoria: "Scooter" },
  ];
  const p = analisarPadroes(diario, gastos);
  assert.deepEqual(p.diasPesados, ["quinta"]);
  assert.ok(p.gatilhos.includes("plantão") && p.gatilhos.includes("cansado"));
  assert.equal(p.gastoDepoisRuim, 30);
  assert.equal(p.gastoMedio, 35); // a compra rara (scooter) fica de fora
  assert.ok(p.frases.some((f) => f.includes("não está puxando")));
});

test("pergunta livre do financeiro: só SELECT nas 4 tabelas do financeiro", () => {
  assert.ok(sqlSeguro(`SELECT SUM(amount) FROM "FinanceEntry" WHERE category ILIKE '%uber%'`));
  assert.ok(sqlSeguro(`WITH m AS (SELECT * FROM "InvoiceItem") SELECT name FROM m`));
  assert.ok(!sqlSeguro(`SELECT "evolutionApiKey" FROM "AgentConfig"`));
  assert.ok(!sqlSeguro(`SELECT value FROM "FlowState"`));
  assert.ok(!sqlSeguro(`SELECT * FROM "WorkTicket"`));
  assert.ok(!sqlSeguro(`SELECT * FROM U&"\\0041gentConfig"`));
  assert.ok(!sqlSeguro(`SELECT table_name FROM information_schema.tables`));
  assert.ok(!sqlSeguro(`DELETE FROM "FinanceEntry"`));
  assert.ok(!sqlSeguro(`SELECT 1; SELECT 2`));
});

test("pergunta livre do financeiro: recusa função que executa texto como consulta", () => {
  assert.ok(!sqlSeguro(`SELECT query_to_xml('select * from ' || quote_ident('Agent' || 'Config'), true, true, '')`));
  assert.ok(!sqlSeguro(`SELECT current_setting('server_version')`));
  assert.ok(!sqlSeguro(`SELECT "query_to_xml"('x', true, true, '')`));
  assert.ok(sqlSeguro(`SELECT date_trunc('month', date) AS mes, SUM(amount) FROM "FinanceEntry" WHERE EXTRACT(YEAR FROM date) = 2026 GROUP BY 1`));
  assert.ok(sqlSeguro(`SELECT category, COUNT(*) FILTER (WHERE status = 'paid') FROM "FinanceEntry" GROUP BY category`));
});
