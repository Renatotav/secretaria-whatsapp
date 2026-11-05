// Testes das regras que mexem com dinheiro e datas (sem banco: nada aqui conecta).
// Rodar: npm test   (TZ=UTC, igual ao container)
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseLocalDate, creditCardBillDate } from "../src/lib/dates";
import { merchantKey, isBesteiraItem, productKey } from "../src/lib/finance-taxonomy";
import { maskPersonalData, normalizeTicketId } from "../src/lib/work-privacy";
import { parseIcs, meetingsOn } from "../src/lib/outlook-calendar";
import { looksLikeSecret, parseSplit } from "../src/lib/message-handlers";
import { parseDeleteText, parseDidLogText, parseEditText, parseQuotedChange } from "../src/lib/quoted-reply";
import { parsePaymentReply, splitRequests } from "../src/lib/finance-commands";
import { brl } from "../src/lib/format";
import { analisarPadroes } from "../src/lib/padroes";
import { sqlSeguro } from "../src/lib/assistant-chat";
import { kwhPorDia, spentSince } from "../src/lib/aircon";

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

test("pergunta livre do financeiro: comentário não esconde função proibida", () => {
  assert.ok(!sqlSeguro(`SELECT query_to_xml/**/('select 1', true, true, '')`));
  assert.ok(!sqlSeguro(`SELECT query_to_xml--x\n('select 1', true, true, '')`));
  assert.ok(sqlSeguro(`SELECT SUM(amount) FROM "FinanceEntry" WHERE description ILIKE '%uber%'`));
});

test("ar: período com a chave vencida é dividido entre os dias (mês e hoje não zeram)", () => {
  const c = { days: { "2026-10-29": 1000, "2026-10-30": 9000, "2026-11-03": 41000 }, last: { at: "2026-11-03T15:00:00Z", wh: 42000, w: 0 } };
  const d = kwhPorDia(c);
  assert.deepEqual(d.map((x) => [x.dia, x.kwh, x.ate]), [
    ["2026-10-29", 8, null], ["2026-10-30", 8, "2026-11-03"], ["2026-10-31", 8, "2026-11-03"],
    ["2026-11-01", 8, "2026-11-03"], ["2026-11-02", 8, "2026-11-03"], ["2026-11-03", 1, null],
  ]);
  assert.equal(spentSince(c, "2026-11-01"), 17000); // 2 dias estimados + o medido hoje
  assert.equal(spentSince(c, "2026-11-03"), 1000);
  // Dias vindos do app ficam com o valor dele; o resto do intervalo vai para os outros.
  const comApp = kwhPorDia({ ...c, arDias: { "2026-10-30": 8.3, "2026-10-31": 6.5 } }).filter((x) => x.dia >= "2026-10-30" && x.dia < "2026-11-03");
  assert.deepEqual(comApp.map((x) => [x.dia, Math.round(x.kwh * 100) / 100, x.ate]), [
    ["2026-10-30", 8.3, null], ["2026-10-31", 6.5, null], ["2026-11-01", 8.6, "2026-11-03"], ["2026-11-02", 8.6, "2026-11-03"],
  ]);
  // Todos os dias do intervalo vindos do app: a sobra (manhã antes da 1ª leitura) vai para o dia seguinte.
  const todos = { ...c, arDias: { "2026-10-30": 8.3, "2026-10-31": 6.5, "2026-11-01": 8, "2026-11-02": 7 } };
  assert.equal(spentSince(todos, "2026-11-03"), 3200); // manhã: 32000 − 29800 = 2200, + 1000 medido

});

test("meio de pagamento logo depois do gasto: número, palavra ou frase; 'os dois' pega os 2 últimos", () => {
  assert.deepEqual(parsePaymentReply("5"), { choice: "ticket", count: 1 });
  assert.deepEqual(parsePaymentReply("foi no pix"), { choice: "pix", count: 1 });
  assert.deepEqual(parsePaymentReply("Os dois foram VR"), { choice: "ticket", count: 2 });
  assert.equal(parsePaymentReply("almoço 32 no pix"), null);
  assert.equal(parsePaymentReply("vale a pena"), null);
});

test("apagar por texto: valor e nome, sem cortar palavra com acento", () => {
  assert.deepEqual(parseDeleteText("Apaga almoço 32"), { amount: 32, name: "almoço" });
  assert.deepEqual(parseDeleteText("almoço 32 apaga"), { amount: 32, name: "almoço" });
  assert.deepEqual(parseDeleteText("apaga o uber de 18,50"), { amount: 18.5, name: "uber" });
  assert.equal(parseDeleteText("apaga o último"), null);
  assert.equal(parseDeleteText("almoço 32"), null);
});

test("correção citando a mensagem: meio, valor e apagar", () => {
  assert.deepEqual(parseQuotedChange("era vr"), { paymentMethod: "ticket" });
  assert.deepEqual(parseQuotedChange("na verdade foi 25"), { amount: 25 });
  assert.deepEqual(parseQuotedChange("apaga"), { remove: true });
  assert.equal(parseQuotedChange("esse gasto foi de fome"), null);
});

test("correção citando: categoria só com o nome exato da lista", () => {
  assert.deepEqual(parseQuotedChange("era besteira"), { category: "Besteira", subcategory: "" });
  assert.deepEqual(parseQuotedChange("Categoria saídas"), { category: "Saídas", subcategory: "" });
  assert.deepEqual(parseQuotedChange("era bar"), { category: "Saídas", subcategory: "Bar" });
  assert.deepEqual(parseQuotedChange("muda pra uber"), { category: "Transporte", subcategory: "Uber/Taxi" });
  assert.deepEqual(parseQuotedChange("era vr"), { paymentMethod: "ticket" });
  assert.deepEqual(parseQuotedChange("era 25"), { amount: 25 });
});

test("chave colada no WhatsApp não vai para a IA", () => {
  assert.equal(looksLikeSecret("chave do app 00000000-1111-2222-3333-444444444444"), true);
  assert.equal(looksLikeSecret("minha chave sk-teste-aaaaaaaaaaaaaaaaaaaaaaaa"), true);
  assert.equal(looksLikeSecret("almoço 32 no cartão"), false);
  assert.equal(looksLikeSecret("paguei o boleto 23793381286000000000"), false);
});

test("correção escrita sem citar: 'era' corrige; 'foi' só com data", () => {
  const c = parseEditText("O cupom de R$ 56,38 de 31/10 era vr");
  assert.equal(c?.amount, 56.38);
  assert.equal(c?.day?.getDate(), 31);
  assert.deepEqual(c?.change, { paymentMethod: "ticket" });
  assert.deepEqual(parseEditText("o uber de 18 era besteira")?.change, { category: "Besteira", subcategory: "" });
  assert.equal(parseEditText("almoço 32 foi no pix"), null);
  assert.equal(parseEditText("almoço 32 de 30/10 foi no pix")?.amount, 32);
  assert.equal(parseEditText("hoje foi bom"), null);
});

test("scooter: economia conta dias inteiros de Uber pelos km, não pelos dias entre leituras", async () => {
  const { diasDeScooter } = await import("../src/lib/scooter");
  // Leituras às 21h de Brasília (00h UTC do dia seguinte): seg a qui com 6 km por dia.
  const l = (dia: string, odo: number) => ({ at: new Date(`${dia}T00:00:00Z`), odo });
  const r = diasDeScooter([l("2026-10-06", 10), l("2026-10-07", 16), l("2026-10-08", 22), l("2026-10-09", 28),
    l("2026-10-31", 31), l("2026-11-04", 32)], "2026-11");
  assert.equal(r.kmIdaVolta, 6);
  assert.equal(r.dias, 4); // 3 dias de 6 km + 3 km em 3 semanas (meia ida e volta arredonda para 1)
  assert.equal(r.diasMes, 0); // 1 km em 2 dias úteis não vira corrida
  assert.equal(r.kmMes, 1);
  assert.equal(diasDeScooter([l("2026-10-06", 10), l("2026-10-20", 40)], "2026-10").kmIdaVolta, 6); // sem dados: 6 km
});

test("pergunta 'você anotou?' acha o valor e não vira gasto", () => {
  assert.equal(parseDidLogText("Olá, você anotou o gasto de 85.55?"), 85.55);
  assert.equal(parseDidLogText("lançou os 32,90 do almoço?"), 32.9);
  assert.equal(parseDidLogText("anotei 85,55 de mercado"), null); // afirmação, não pergunta
  assert.equal(parseDidLogText("você anotou?"), null); // sem valor: segue o fluxo normal
  assert.equal(parseDidLogText("você registrou o chamado 1812793?"), null); // trabalho segue o comando próprio
  assert.equal(parseDidLogText("anotou a senha abc123?"), null);
});

test("frases dele que a IA lia errado são ajustadas antes", async () => {
  const { ajustaFrase } = await import("../src/lib/personal-router");
  assert.equal(ajustaFrase("Mercantil 182, 58 e vencimento 10/09"), "Mercantil 182,58 e vencimento 10/09");
  assert.equal(ajustaFrase("como estão meus gases"), "como estão meus gastos");
  assert.equal(ajustaFrase("Agenda"), "o que tenho na agenda?");
  assert.equal(ajustaFrase("almoço 22, 30 de uber"), "almoço 22, 30 de uber"); // podem ser dois valores
  assert.equal(ajustaFrase("1, 2 e 3"), "1, 2 e 3");
  assert.equal(ajustaFrase("agenda reunião amanhã 14h"), "agenda reunião amanhã 14h");
});
