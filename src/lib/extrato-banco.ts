// Extrato da conta (Nubank em CSV, ou OFX de qualquer banco) mandado como
// arquivo no WhatsApp. Só a conta corrente: Pix, débito, boleto e entradas.
// Cartão continua pela fatura (PDF/print), para não lançar duas vezes.
import { holderMatches } from "./pdf";
import type { StatementEntry } from "./personal-router";

export type MovimentoBanco = { date: string; amount: number; description: string };

/** Separa uma linha de CSV respeitando aspas. */
function camposCsv(linha: string): string[] {
  const out: string[] = [];
  let cur = "", aspas = false;
  for (const ch of linha) {
    if (ch === '"') aspas = !aspas;
    else if (ch === "," && !aspas) { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

/** CSV da conta do Nubank: "Data,Valor,Identificador,Descrição" (data dd/mm/aaaa, valor com ponto). */
export function lerCsvNubank(texto: string): MovimentoBanco[] | null {
  const linhas = texto.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  if (!linhas.length || !/^data,valor,identificador,descri/i.test(linhas[0])) return null;
  return linhas.slice(1).flatMap((l) => {
    const [data, valor, , ...desc] = camposCsv(l);
    const m = data?.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    const amount = Number(valor);
    return m && Number.isFinite(amount) ? [{ date: `${m[3]}-${m[2]}-${m[1]}`, amount, description: desc.join(", ") }] : [];
  });
}

/** OFX (padrão dos bancos): cada <STMTTRN> com DTPOSTED, TRNAMT e MEMO/NAME. */
export function lerOfx(texto: string): MovimentoBanco[] | null {
  if (!/<OFX>/i.test(texto)) return null;
  const tag = (bloco: string, nome: string) => bloco.match(new RegExp(`<${nome}>([^<\\r\\n]*)`, "i"))?.[1].trim() ?? "";
  return [...texto.matchAll(/<STMTTRN>([\s\S]*?)(?=<\/STMTTRN>|<STMTTRN>|<\/BANKTRANLIST>)/gi)].flatMap(([, b]) => {
    const d = tag(b, "DTPOSTED").match(/^(\d{4})(\d{2})(\d{2})/);
    const amount = Number(tag(b, "TRNAMT").replace(",", "."));
    const description = tag(b, "MEMO") || tag(b, "NAME");
    return d && Number.isFinite(amount) && amount ? [{ date: `${d[1]}-${d[2]}-${d[3]}`, amount, description }] : [];
  });
}

/**
 * Movimento → lançamento, ou null quando não é gasto nem entrada de verdade:
 * pagamento da fatura do cartão (as compras vêm pela fatura), dinheiro
 * guardado/resgatado (caixinha, RDB) e Pix entre as contas do próprio dono.
 */
export function movimentoParaLancamento(m: MovimentoBanco, ownerName: string): StatementEntry | null {
  const partes = m.description.split(" - ").map((p) => p.trim());
  const tipo = partes[0] ?? "";
  if (/fatura|cart[aã]o de cr/i.test(tipo)) return null;
  if (/aplica[cç][aã]o|resgate|\bRDB\b|caixinha|dinheiro (guardado|resgatado)|invest|poupan[cç]a/i.test(tipo)) return null;
  const outro = partes[1] ?? "";
  if (/transfer|pix/i.test(tipo) && outro && ownerName && holderMatches(outro, ownerName)) return null;

  const saida = m.amount < 0;
  const meio = /pix/i.test(tipo) ? "pix" : /boleto/i.test(tipo) ? "boleto" : "débito";
  // "Transferência enviada pelo Pix - FULANO - •••.123..." → "Pix enviado - FULANO"
  const nome = /transfer[eê]ncia/i.test(tipo)
    ? `${meio === "pix" ? "Pix" : "Transferência"} ${saida ? "enviado" : "recebido"}${outro ? ` - ${outro}` : ""}`
    : /compra no d[eé]bito|pagamento de boleto/i.test(tipo) && outro ? outro : partes.slice(0, 2).filter(Boolean).join(" - ");
  return {
    date: m.date,
    purchaseDate: m.date,
    description: nome.replace(/\s+/g, " ").slice(0, 120),
    amount: Math.round(Math.abs(m.amount) * 100) / 100,
    type: saida ? "expense" : "income",
    category: "Outros",
    subcategory: saida ? "Imprevistos" : "Reembolso",
    paymentMethod: meio,
    account: "Principal",
    status: "paid",
  };
}

/**
 * Já está no app: mesmo tipo, valor (até R$ 0,10) e dia até 5 de diferença,
 * fora do cartão (ele às vezes anota uns dias depois, como na fatura).
 * Devolve o índice do lançamento que casou, ou -1.
 */
export function jaNoApp(
  l: StatementEntry,
  existentes: { type: string; amount: number; date: Date; purchaseDate: Date | null; paymentMethod: string }[],
): number {
  const dia = new Date(`${l.date}T12:00:00Z`).getTime();
  return existentes.findIndex(
    (e) =>
      e.type === l.type &&
      e.paymentMethod !== "cartão" &&
      Math.abs(e.amount - l.amount) <= 0.1 &&
      Math.abs((e.purchaseDate ?? e.date).getTime() - dia) <= 5 * 86_400_000,
  );
}
