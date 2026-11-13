// Testes das regras que mexem com dinheiro e datas (sem banco: nada aqui conecta).
// Rodar: npm test   (TZ=UTC, igual ao container)
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseLocalDate, creditCardBillDate } from "../src/lib/dates";
import { merchantKey, isBesteiraItem, productKey, corrigeBebida, normalizeItemCategory } from "../src/lib/finance-taxonomy";
import { maskPersonalData, normalizeTicketId } from "../src/lib/work-privacy";
import { parseIcs, meetingsOn } from "../src/lib/outlook-calendar";
import { looksLikeSecret, parseSplit } from "../src/lib/message-handlers";
import { parseDeleteText, parseDidLogText, parseEditText, parseQuotedChange } from "../src/lib/quoted-reply";
import { parsePaymentReply, splitRequests } from "../src/lib/finance-commands";
import { brl } from "../src/lib/format";
import { analisarPadroes } from "../src/lib/padroes";
import { sqlSeguro } from "../src/lib/assistant-chat";
import { kwhPorDia, spentSince } from "../src/lib/aircon";
import { calibrarParada, corrigeOdo, linhaCalibracao } from "../src/lib/scooter";

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

test("calibrarParada: separa o gasto de rodar do gasto parada", () => {
  // Dados inventados: 30 Wh/km + 50 Wh/dia, exatos.
  const at = (dia: number) => new Date(Date.UTC(2026, 0, dia, 12));
  const cargas = [[1, 0], [8, 30], [15, 55], [28, 85], [35, 110]].map(([dia, odo]) => ({ at: at(dia), odo, kwh: 0 as number | null }));
  for (let i = 1; i < cargas.length; i++) {
    const km = cargas[i].odo - cargas[i - 1].odo, dias = (cargas[i].at.getTime() - cargas[i - 1].at.getTime()) / 86_400_000;
    cargas[i].kwh = (km * 30 + dias * 50) / 1000;
  }
  const c = calibrarParada(cargas)!;
  assert.equal(Math.round(c.whKm), 30);
  assert.equal(Math.round(c.whDia), 50);
  assert.equal(c.pronto, false); // só 4 ciclos
  assert.match(linhaCalibracao(c), /falta 2 carga\(s\)/);
  // Sem nenhuma semana parada: 6 ciclos de 4 a 9 dias já confirmam.
  const seis = [[1, 0], [6, 25], [13, 55], [21, 80], [30, 110], [36, 140], [40, 165]].map(([dia, odo]) => ({ at: at(dia), odo, kwh: 0 as number | null }));
  for (let i = 1; i < seis.length; i++) {
    const km = seis[i].odo - seis[i - 1].odo, dias = (seis[i].at.getTime() - seis[i - 1].at.getTime()) / 86_400_000;
    seis[i].kwh = (km * 30 + dias * 50) / 1000;
  }
  assert.equal(calibrarParada(seis)!.pronto, true);
  assert.equal(calibrarParada(cargas.slice(0, 3)), null); // 2 ciclos: pouco
});

test("corrigeBebida: refrigerante sai de Besteira, cerveja fica", () => {
  assert.deepEqual(corrigeBebida("Coca-Cola", "Besteira", "Bebida alcoólica"), { category: "Alimentação", subcategory: "Padaria/Lanche" });
  assert.deepEqual(corrigeBebida("Guaraná 2L", "Besteira", "Bebida alcoólica"), { category: "Alimentação", subcategory: "Padaria/Lanche" });
  assert.deepEqual(corrigeBebida("Cerveja Brahma", "Besteira", "Bebida alcoólica"), { category: "Besteira", subcategory: "Bebida alcoólica" });
  assert.deepEqual(corrigeBebida("Vodka com Coca", "Besteira", "Bebida alcoólica"), { category: "Besteira", subcategory: "Bebida alcoólica" });
  assert.deepEqual(corrigeBebida("Coca-Cola", "Alimentação", "Delivery"), { category: "Alimentação", subcategory: "Delivery" });
});

test("item de nota: carne no peso vira Carnes mesmo vindo como Mercearia", () => {
  assert.equal(normalizeItemCategory({ name: "MAMIN ALCA BOV RESERVA PDC kg", category: "Mercearia" }), "Carnes");
  assert.equal(normalizeItemCategory({ name: "CALDO DE CARNE 57G", category: "Mercearia" }), "Mercearia");
  assert.equal(normalizeItemCategory({ name: "CERV HEINEKEN LN 330ML", category: "Bebidas" }), "Besteira");
});

test("item de nota: batata palha é Mercearia e peito de peru é frios", () => {
  assert.equal(normalizeItemCategory({ name: "BATATA PALHA SCRUSCH 105G TEMPERADA", category: "Hortifruti" }), "Mercearia");
  assert.equal(normalizeItemCategory({ name: "PEITO PERU SEARA DEF kg", category: "Carnes" }), "Frios e laticínios");
  assert.equal(normalizeItemCategory({ name: "LEVISSIMO SEARA kg", category: "Mercearia" }), "Frios e laticínios");
  assert.equal(normalizeItemCategory({ name: "BATATA INGLESA kg", category: "Hortifruti" }), "Hortifruti");
  assert.equal(normalizeItemCategory({ name: "PEITO FRANGO kg", category: "Mercearia" }), "Carnes");
});

test("prompt do banco: marcadores {{nome}} são preenchidos uma vez só", async () => {
  const { preenche } = await import("../src/lib/prompts");
  assert.equal(preenche("Oi {{dono}}, hoje é {{hoje}}.{{falta}}", { dono: "Fulano", hoje: "2026-11-11" }), "Oi Fulano, hoje é 2026-11-11.");
  assert.equal(preenche("{{a}}", { a: "{{b}}", b: "x" }), "{{b}}"); // valor não é preenchido de novo
});

test("ODO lido no vídeo: primeiro dígito perdido e o P grudado", () => {
  assert.equal(corrigeOdo(43, 138).odo, 143); // 143 lido como 43 (11/11)
  assert.equal(corrigeOdo(902, 88).odo, 90); // "00090" + P (23/10)
  assert.equal(corrigeOdo(145, 138).odo, 145); // leitura normal fica igual
  assert.equal(corrigeOdo(43, 300).odo, 343); // só 343 cabe até +100 do último
  assert.equal(corrigeOdo(43, 2000).odo, 43); // nenhum dígito cabe: não inventa (a leitura é recusada)
  assert.equal(corrigeOdo(5, 138).odo, 5); // 15..95, todos abaixo do último: não inventa
});

test("busca nos manuais: acha o trecho certo, sem acento e com sinônimo do atendimento", async () => {
  const { buscarManuais } = await import("../src/lib/busca-manuais");
  const t = (id: string, titulo: string, texto: string) => ({ id, nota: "n", manual: "Manual X – 1º Grau", arquivo: "x.pdf", tipo: "pagina" as const, paginas: [1], titulo, texto });
  const trechos = [
    t("a", "Remessa ao órgão de origem", "Para devolver o processo use Remeter ao órgão de origem."),
    t("b", "Horário do plantão", "O plantão funciona nos fins de semana e feriados."),
    t("c", "Auto de prisão em flagrante", "O APF começa em certificar antecedentes."),
  ];
  assert.equal(buscarManuais("como devolver o processo pra vara de origem?", trechos)[0].trecho.id, "a");
  assert.equal(buscarManuais("o flagrante foi pra onde", trechos)[0].trecho.id, "c");
  assert.equal(buscarManuais("xyz qwerty", trechos).length, 0);
});

test("print do PJe: só tarefa, erro e perfil; nome, login e processo nunca entram", async () => {
  const { resumoPrintPJe } = await import("../src/lib/work-ocr");
  const ocr = [
    "Invent 1234567-89.2020.8.06.0001 - [Sec] - Certidão - ASSINAR CERTIDÃO DE DECURSO DE PRAZO",
    "FULANA DE TAL X CICRANO DA SILVA",
    "Data/Hora: 29-10-2026 | Login: 12345678909 | Nome do usuario: FULANA EXEMPLO",
    "Perfil: Diretor de Secretaria | Falha na movimentação do processo, favor entrar em contato com o atendimento ao usuário!",
    "[397] varupdate[${pje:fluxo:tarefa:validacao}=T] on Token(/)",
    "[403] task-assign[12345678909, TaskInstance([Sec] - Certidão - ASSINAR CERTIDÃO DE DECURSO DE PRAZO)] on Token(/)",
  ].join("\n");
  const r = resumoPrintPJe(ocr);
  assert.match(r, /ASSINAR CERTIDÃO DE DECURSO DE PRAZO/);
  assert.match(r, /Falha na movimentação do processo/);
  assert.match(r, /Perfil: Diretor de Secretaria/);
  for (const proibido of ["FULANA", "CICRANO", "12345678909", "1234567-89"]) assert.ok(!r.includes(proibido), proibido);
  assert.equal(resumoPrintPJe("foto de um gato no sofá"), "");
  assert.equal((r.match(/ASSINAR CERTIDÃO DE DECURSO DE PRAZO/g) || []).length, 1); // sem repetir a mesma tarefa
  assert.ok(!/Token/.test(r));
  assert.equal(resumoPrintPJe("continua no erro: 12:51"), ""); // legenda do WhatsApp não é mensagem da tela
});

test("item de nota: bala e drops são Besteira, como o chocolate (13/11)", () => {
  assert.equal(normalizeItemCategory({ name: "DC HERBISS", category: "Mercearia" }), "Besteira");
  assert.equal(normalizeItemCategory({ name: "BALA FINI 90G", category: "Mercearia" }), "Besteira");
  assert.equal(normalizeItemCategory({ name: "MENTOS STI", category: "Mercearia" }), "Besteira");
  assert.equal(normalizeItemCategory({ name: "BALANCA DE COZINHA", category: "Mercearia" }), "Mercearia"); // "bala" só palavra inteira
});

test("manual: divergência do manual sobre página que veio na busca vai junto", async () => {
  const { buscarManuais } = await import("../src/lib/busca-manuais");
  const t = (id: string, tipo: string, paginas: number[], texto: string) => ({ id, nota: "n", manual: "M", arquivo: "a.pdf", tipo, paginas, titulo: id, texto }) as never;
  const base = [
    t("p4", "pagina", [4], "tabela de horario do plantao civel sabado domingo"),
    t("p9", "pagina", [9], "horario do plantao criminal"),
    t("inc4", "incerto", [4], "a tabela mostra dois horarios para o sabado"),
    t("inc9", "incerto", [20], "remessa a instancia superior sabado"),
  ];
  const ids = buscarManuais("horario do plantao civel no sabado", base, 1).map((a) => a.trecho.id);
  assert.deepEqual(ids, ["p4", "inc4"]);
});

test("manual: págs. 21 a 23 do manual externo 1G avisam que o rodapé impresso diz 20", async () => {
  const { contextoParaIA } = await import("../src/lib/busca-manuais");
  const t = (nota: string, paginas: number[]) => ({ trecho: { id: "x", nota, manual: "M", arquivo: "a.pdf", tipo: "pagina", paginas, titulo: "T", texto: "..." }, pontos: 1 }) as never;
  const ctx = contextoParaIA([t("Plantao-1G-Usuarios-Externos_2026-08", [20, 21]), t("Plantao-2G-Usuarios-Externos_2026-08", [21])]);
  assert.match(ctx, /pág\. 20, 21 do PDF \(no rodapé impresso aparece "20"\)/);
  assert.match(ctx, /pág\. 21 —/);
});

test("manual: limpeza depois da resposta (um ⚠️ só, aviso do rodapé, 'O que fazer' sem promessa)", async () => {
  const { limparRespostaManual } = await import("../src/lib/manuais-plantao");
  const resposta = [
    "🧭 *O que aconteceu*",
    "Explicação.",
    "",
    "⚠️ O alerta de sexta vale para todas as comarcas. Fortaleza: x. Interior: y.",
    "",
    "✅ *O que fazer*",
    "1. Confira a classe. Vou verificar o sistema.",
    "2. Verifique se houve instabilidade momentânea.",
    "3. Limpe o cache do navegador.",
    "4. Use a transição certa.",
    "",
    "📘 *Onde está no manual*",
    "- Manual Plantão PJe 1º Grau – Usuários Externos, pág. 21 e 22.",
    "",
    "⚠️ O Manual de Plantão 2º Grau – Usuários Internos diverge sobre outra coisa.",
    "",
    "💬 *Resposta pronta para o usuário*",
    "Vou verificar, um momento, por favor.",
  ].join("\n");
  const r = limparRespostaManual(resposta);
  assert.equal(r.match(/⚠️/g)?.length, 1);
  assert.match(r, /vale para todas as comarcas/);
  assert.match(r, /pág\. 21 e 22 \(no rodapé impresso: "20"\)\./);
  assert.match(r, /1\. Confira a classe\.\n2\. Use a transição certa\./);
  assert.doesNotMatch(r.split("💬")[0], /vou verificar|instabilidade|cache/i);
  assert.match(r, /💬 \*Resposta pronta para o usuário\*\nVou verificar, um momento, por favor\./);

  // Sem a linha fixa: fica o ⚠️ do manual citado; sai o de manual que não está no "Onde está".
  const outra = "📘 *Onde está no manual*\n- Manual de Plantão – 1º Grau – Fluxo Cível – Usuários Internos, pág. 4.\n⚠️ O Manual Plantão PJe 2º Grau – Usuários Externos diverge.\n⚠️ O 1º Grau – Fluxo Cível se contradiz na pág. 4.\n💬 *Resposta pronta para o usuário*\nVou confirmar.";
  const r2 = limparRespostaManual(outra);
  assert.match(r2, /⚠️ O 1º Grau – Fluxo Cível se contradiz/);
  assert.doesNotMatch(r2, /2º Grau – Usuários Externos diverge/);
  assert.doesNotMatch(r2, /rodapé/);

  // Aviso em duas linhas sai inteiro; página já marcada como "impresso" não ganha o aviso de novo.
  const r3 = limparRespostaManual("📘 *Onde está no manual*\n- Manual Plantão PJe 1º Grau – Usuários Externos, pág. 21 (pág. 20 do impresso).\n\n⚠️ O alerta de sexta vale para todas as comarcas.\n\n⚠️ *Nota:*\nHá divergência sobre outra coisa.\n\n💬 *Resposta pronta para o usuário*\nOk.");
  assert.doesNotMatch(r3, /Há divergência|Nota:/);
  assert.doesNotMatch(r3, /rodapé/);

  // Aviso logo depois da página, não no fim da linha; página trocada pelo modelo é corrigida; "pág." não quebra a frase.
  const r4 = limparRespostaManual("✅ *O que fazer*\n1. Veja a pág. 34 e vou verificar.\n2. Confira a classe.\n\n📘 *Onde está no manual*\n- Manual Plantão PJe 1º Grau – Usuários Externos, págs. 3, 4, 21 e 22.\n- Manual Plantão PJe 1º Grau – Usuários Externos, pág. 21 (pág. 20 do PDF).\n\n💬 *Resposta pronta para o usuário*\nOk.");
  assert.match(r4, /págs\. 3, 4, 21 e 22 \(no rodapé impresso: "20"\)\./);
  assert.match(r4, /pág\. 21 \(no rodapé impresso aparece "20"\)\./);
  assert.doesNotMatch(r4, /20 do PDF|Veja a pág\./);
  assert.match(r4, /✅ \*O que fazer\*\n1\. Confira a classe\./);
});
