// Testes dos módulos que saíram do message-handlers (28/10/2026). Sem banco.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseLocalDate } from "../src/lib/dates";
import { addMonths, budgetIcon, isInstallment, isRecurring } from "../src/lib/finance-common";
import { parseBrNumber, paymentLabel, formatFullDate } from "../src/lib/finance-text";
import { parseInstallmentInfo, applyInvoiceDates } from "../src/lib/statement-import";
import { parseQuotedChange } from "../src/lib/quoted-reply";
import { splitMethod, parseSplit } from "../src/lib/finance-split";
import { histValue } from "../src/lib/finance-history";

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
