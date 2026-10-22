// NFC-e do Ceará direto da SEFAZ (consulta pública pela chave de acesso, a
// mesma que a página do QR Code usa). Itens, quantidades e preços oficiais,
// sem a IA "ler" a foto — a foto continua valendo para tudo o resto (nota de
// outro estado, recibo, falha da consulta). Só as notas dele, uma por vez.

export type NfceItem = { name: string; quantity: number; unit: string; unitPrice: number; amount: number };
export type Nfce = { key: string; store: string; cnpj: string; date: string | null; total: number; payment: string; items: NfceItem[] };

/** Chave de 44 dígitos válida (dígito verificador módulo 11). */
export function validNfeKey(raw: string): string | null {
  const k = (raw || "").replace(/\D/g, "");
  if (k.length !== 44) return null;
  let soma = 0, peso = 2;
  for (let i = 42; i >= 0; i--) {
    soma += Number(k[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  const dv = resto < 2 ? 0 : 11 - resto;
  return dv === Number(k[43]) ? k : null;
}

/**
 * Chave lida com um dígito errado (a IA troca 9 por 3, 8 por 6…): refaz as
 * partes que também estão impressas na nota — CNPJ da loja (posições 7–20),
 * série (23–25) e número (26–34) — e confere o dígito de novo.
 */
export function repairNfeKey(raw: string, parts: { cnpj?: string; serie?: string; numero?: string }): string | null {
  const k = (raw || "").replace(/\D/g, "");
  if (validNfeKey(k)) return k;
  if (k.length !== 44) return null;
  const cnpj = (parts.cnpj || "").replace(/\D/g, "");
  const serie = (parts.serie || "").replace(/\D/g, "");
  const numero = (parts.numero || "").replace(/\D/g, "");
  const comCnpj = cnpj.length === 14 ? k.slice(0, 6) + cnpj + k.slice(20) : k;
  const comTudo =
    comCnpj.slice(0, 22) + (serie ? serie.padStart(3, "0").slice(-3) : comCnpj.slice(22, 25)) + (numero ? numero.padStart(9, "0").slice(-9) : comCnpj.slice(25, 34)) + comCnpj.slice(34);
  return validNfeKey(comCnpj) ?? validNfeKey(comTudo);
}

/** NFC-e (modelo 65) emitida no Ceará (código 23)? */
export const isCearaNfce = (key: string) => key.startsWith("23") && key.slice(20, 22) === "65";

const num = (s: string) => Number(s.replace(/\./g, "").replace(",", "."));
const limpa = (s: string) =>
  s.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#(\d+);/g, (_m, c) => String.fromCharCode(Number(c)))
    .replace(/&([a-z])(acute|grave|tilde|circ|cedil|uml);/gi, (_m, l) => l)
    .replace(/\s+/g, " ").trim();

/** Lê o HTML que a SEFAZ-CE devolve. null se não tiver itens. */
export function parseNfceHtml(key: string, html: string): Nfce | null {
  const items: NfceItem[] = [];
  for (const tr of html.split(/<tr id='Item/).slice(1)) {
    const g = (cls: string) => tr.match(new RegExp(`class='${cls}'>([\\s\\S]*?)</span>`))?.[1] ?? "";
    const name = limpa(g("txtTit"));
    const quantity = num(limpa(g("Rqtd")).replace(/^Qtde\.:\s*/i, ""));
    const unit = limpa(g("RUN")).replace(/^UN:\s*/i, "").replace(/\d+$/, "");
    const unitPrice = num(limpa(g("RvlUnit")).replace(/^Vl\. Unit\.:\s*/i, ""));
    const amount = num(limpa(g("valor")));
    if (name && amount > 0) items.push({ name, quantity: quantity || 1, unit, unitPrice: unitPrice || amount, amount });
  }
  if (!items.length) return null;
  const total = num(limpa(html.match(/class='totalNumb txtMax'>([^<]*)</)?.[1] ?? "")) || items.reduce((a, i) => a + i.amount, 0);
  const formas = [...html.matchAll(/<label class='tx'>([^<]*)<\/label>/g)].map((m) => limpa(m[1])).filter((f) => !/^troco/i.test(f));
  const emissao = limpa(html).match(/Emiss\w*o:\s*(\d{2})\/(\d{2})\/(\d{4})/i);
  const textos = [...html.matchAll(/<div class='text'>([^<]*)<\/div>/g)].map((m) => limpa(m[1]));
  return {
    key,
    store: limpa(html.match(/class='txtTopo'[^>]*>([^<]*)</)?.[1] ?? ""),
    cnpj: (textos.find((t) => /CNPJ/i.test(t)) ?? "").replace(/^CNPJ:\s*/i, ""),
    date: emissao ? `${emissao[3]}-${emissao[2]}-${emissao[1]}` : null,
    total: Math.round(total * 100) / 100,
    payment: formas.join(", "),
    items,
  };
}

/** Consulta a SEFAZ-CE pela chave. null se não achou, deu erro ou demorou. */
export async function fetchNfce(rawKey: string): Promise<Nfce | null> {
  const key = validNfeKey(rawKey);
  if (!key || !isCearaNfce(key)) return null;
  try {
    const r = await fetch("http://nfce.sefaz.ce.gov.br/nfce/api/notasFiscal/qrcodev3/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chave_acesso: key, versao_qrcode: "3", tipo_ambiente: "1" }),
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) return null;
    const j = (await r.json().catch(() => null)) as { xml?: string; erro?: string } | null;
    if (!j?.xml) {
      if (j?.erro) console.log(`[nfce] SEFAZ recusou: ${j.erro.slice(0, 80)}`);
      return null;
    }
    return parseNfceHtml(key, j.xml);
  } catch (e) {
    console.log(`[nfce] consulta falhou: ${e instanceof Error ? e.message : e}`);
    return null;
  }
}
