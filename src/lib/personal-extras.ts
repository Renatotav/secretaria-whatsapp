import { prisma } from "./prisma";
import { FINANCE_TAXONOMY_DATA, merchantKey } from "./finance-taxonomy";

// Quatro ajudas do canal pessoal, todas sem IA:
// 1) regras de categoria aprovadas por ele; 2) lista de reposição pelas notas;
// 3) preço por quilo/litro; 4) caixa de ideias e links.

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const norm = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const dia = (d: Date) => `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
const DAY = 86400000;

async function kvGet<T>(key: string): Promise<T | null> {
  const r = await prisma.flowState.findUnique({ where: { key } });
  return (r?.value as T) ?? null;
}
async function kvSet(key: string, value: object): Promise<void> {
  await prisma.flowState.upsert({ where: { key }, create: { key, value }, update: { value } });
}

// ── 1) Regras de categoria ────────────────────────────────────────────────
/** "Saúde › Farmácia", "saude farmacia", "Farmácia" → par da lista única; null se não achar. */
export function resolveCategory(raw: string, type: "income" | "expense" = "expense"): { category: string; subcategory: string } | null {
  const t = norm(raw.replace(/[›>/,-]/g, " "));
  const tax = FINANCE_TAXONOMY_DATA[type];
  for (const [cat, subs] of Object.entries(tax)) {
    for (const sub of subs) if (t === norm(`${cat} ${sub}`) || t === norm(sub) || t.includes(norm(sub)) && t.includes(norm(cat))) return { category: cat, subcategory: sub };
  }
  for (const [cat, subs] of Object.entries(tax)) {
    if (t === norm(cat)) return { category: cat, subcategory: subs[0] };
    for (const sub of subs) if (t.includes(norm(sub))) return { category: cat, subcategory: sub };
  }
  for (const [cat, subs] of Object.entries(tax)) if (t.includes(norm(cat))) return { category: cat, subcategory: subs[0] };
  return null;
}

/** Regra que casa com o texto (a mais específica = trecho mais longo). Conta o uso. */
export async function categoryRuleFor(...texts: string[]): Promise<{ category: string; subcategory: string; pattern: string } | null> {
  const rules = await prisma.categoryRule.findMany();
  if (!rules.length) return null;
  const alvo = texts.map(norm).join(" | ");
  const r = rules.filter((x) => alvo.includes(x.pattern)).sort((a, b) => b.pattern.length - a.pattern.length)[0];
  if (!r) return null;
  await prisma.categoryRule.update({ where: { id: r.id }, data: { hits: { increment: 1 } } }).catch(() => {});
  return { category: r.category, subcategory: r.subcategory, pattern: r.pattern };
}

/** Lojas cuja categoria ele corrigiu 2+ vezes (pelo histórico) e que ainda não têm regra. */
async function ruleSuggestions(): Promise<string[]> {
  const logs = await prisma.financeLog.findMany({ where: { action: "update" }, orderBy: { at: "desc" }, take: 2000 });
  const conta = new Map<string, { n: number; category: string; subcategory: string }>();
  for (const l of logs) {
    const b = (l.before ?? {}) as Record<string, string>, a = (l.after ?? {}) as Record<string, string>;
    if (!b.category || !a.category || (b.category === a.category && b.subcategory === a.subcategory)) continue;
    const loja = merchantKey(l.description);
    if (!loja || loja.length < 3) continue;
    const c = conta.get(loja) ?? { n: 0, category: a.category, subcategory: a.subcategory };
    c.n++;
    conta.set(loja, c);
  }
  const rules = new Set((await prisma.categoryRule.findMany({ select: { pattern: true } })).map((r) => r.pattern));
  return [...conta].filter(([loja, c]) => c.n >= 2 && ![...rules].some((p) => norm(loja).includes(p))).slice(0, 5).map(([loja, c]) => `regra: ${loja.toLowerCase()} é ${c.category} › ${c.subcategory}`);
}

async function applyRuleCommand(text: string): Promise<string | null> {
  const t = text.trim();
  const cria = t.match(/^(?:regra|sempre\s+que\s+for|toda\s+compra\s+(?:n[ao]|d[ao]))\s*:?\s*(.{2,60}?)\s+(?:é|e|=|vai\s+(?:para|pra)|na\s+categoria|como)\s+(.{3,60}?)[.!]?$/i);
  if (cria) {
    const pattern = norm(cria[1]).replace(/^(o|a|os|as|no|na|do|da)\s+/, "");
    const cat = resolveCategory(cria[2]);
    if (!cat) return `🤔 Não achei a categoria "${cria[2]}". Use uma da lista, ex.: *regra: ${pattern} é Saúde › Farmácia*.\nCategorias: ${Object.keys(FINANCE_TAXONOMY_DATA.expense).join(", ")}.`;
    if (pattern.length < 3) return "🤔 O nome da loja ficou curto demais para virar regra.";
    await prisma.categoryRule.upsert({ where: { pattern }, create: { pattern, ...cat }, update: cat });
    return `📏 Regra criada: tudo com "${pattern}" vai para *${cat.category} › ${cat.subcategory}* (vale antes da IA e da memória por loja). Ver todas: *minhas regras*.`;
  }
  if (/^(?:minhas\s+)?regras(?:\s+de\s+categoria)?\s*\??$/i.test(t)) {
    const rules = await prisma.categoryRule.findMany({ orderBy: { createdAt: "asc" } });
    await kvSet("rules:last", { ids: rules.map((r) => r.id) });
    const sug = await ruleSuggestions();
    return [
      "📏 *Regras de categoria*",
      rules.length ? rules.map((r, i) => `*${i + 1}.* "${r.pattern}" → ${r.category} › ${r.subcategory}${r.hits ? ` (usada ${r.hits}×)` : ""}`).join("\n") : "Nenhuma ainda.",
      rules.length ? "Para apagar: *apaga regra N*." : "",
      sug.length ? `\n💡 Você corrigiu estas lojas mais de uma vez — para virar regra, mande:\n${sug.map((s) => `• ${s}`).join("\n")}` : "",
      'Criar: *regra: nome da loja é Categoria › Subcategoria*.',
    ].filter(Boolean).join("\n");
  }
  const apaga = t.match(/^apaga(?:r)?\s+(?:a\s+)?regra\s+(\d{1,2})[.!]?$/i);
  if (apaga) {
    const last = await kvGet<{ ids: string[] }>("rules:last");
    const id = last?.ids[Number(apaga[1]) - 1];
    if (!id) return "Peça *minhas regras* primeiro e use o número da lista.";
    const r = await prisma.categoryRule.delete({ where: { id } }).catch(() => null);
    return r ? `🗑️ Regra "${r.pattern}" apagada.` : "Essa regra já não existe.";
  }
  return null;
}

// ── 2) Lista de reposição e 3) preço por quilo/litro ─────────────────────
/** Nome do produto sem tamanho/marca de quantidade: "CAFE PILAO 500G" → "cafe pilao". */
function produto(nome: string): string {
  return norm(nome)
    .replace(/\b\d+(?:[.,]\d+)?\s*(?:kg|g|gr|grs|ml|l|lt|lts|un|und|unid|pct|cx|x)\b/g, " ")
    .replace(/[^a-z ]/g, " ")
    .split(" ")
    .filter((w) => w.length > 1)
    .slice(0, 3)
    .join(" ");
}

async function itensComData(where: object = {}) {
  const itens = await prisma.invoiceItem.findMany({
    where,
    select: { name: true, amount: true, quantity: true, unitPrice: true, financeEntry: { select: { purchaseDate: true, date: true, description: true } } },
    orderBy: { createdAt: "desc" },
    take: 4000,
  });
  return itens.map((i) => ({ ...i, quando: i.financeEntry.purchaseDate ?? i.financeEntry.date }));
}

async function restockList(): Promise<string> {
  const itens = await itensComData();
  const grupos = new Map<string, { nome: string; datas: number[] }>();
  for (const i of itens) {
    const k = produto(i.name);
    // Linhas que não são produto (ajuste, desconto, taxa, troco…).
    if (!k || /\b(ajuste|acrescimo|desconto|troco|taxa|arredond|servico|gorjeta|sacola)/.test(norm(i.name))) continue;
    const g = grupos.get(k) ?? { nome: i.name, datas: [] };
    const d = new Date(i.quando.getFullYear(), i.quando.getMonth(), i.quando.getDate()).getTime();
    if (!g.datas.includes(d)) g.datas.push(d);
    grupos.set(k, g);
  }
  const hoje = Date.now();
  const lista = [...grupos.values()]
    .filter((g) => g.datas.length >= 2)
    .map((g) => {
      const ds = g.datas.sort((a, b) => a - b);
      const media = (ds[ds.length - 1] - ds[0]) / (ds.length - 1) / DAY;
      const desde = (hoje - ds[ds.length - 1]) / DAY;
      return { nome: g.nome, media, desde, razao: media > 0 ? desde / media : 0, vezes: ds.length };
    })
    .filter((x) => x.media >= 3 && x.razao >= 0.85)
    .sort((a, b) => b.razao - a.razao)
    .slice(0, 15);
  if (!lista.length) return "🛒 Pelas notas fiscais, nada parece estar acabando agora. (Uso só o que você comprou 2+ vezes; mande fotos das notas para eu aprender.)";
  return `🛒 *Talvez esteja na hora de comprar* (pelas suas notas; não sei o que tem em casa)\n${lista
    .map((x) => `• ${x.nome} — costuma comprar a cada ~${Math.round(x.media)} dias; última há ${Math.round(x.desde)} dias${x.razao >= 1.5 ? " ⏰" : ""}`)
    .join("\n")}`;
}

/** Preço por kg/L (ou por unidade) do item; null se não deu para saber o tamanho. */
function precoPorUnidade(i: { name: string; quantity: number; unitPrice: number; amount: number }): { valor: number; unidade: string } | null {
  const m = norm(i.name).match(/\b(\d+(?:[.,]\d+)?)\s*(kg|g|gr|grs|ml|l|lt|lts)\b/);
  const unit = i.unitPrice || (i.quantity ? i.amount / i.quantity : i.amount);
  if (m) {
    const n = Number(m[1].replace(",", "."));
    const u = m[2];
    if (!(n > 0)) return null;
    const base = u === "kg" ? n : u.startsWith("g") ? n / 1000 : u === "ml" ? n / 1000 : n;
    return { valor: unit / base, unidade: u === "kg" || u.startsWith("g") ? "kg" : "L" };
  }
  // Vendido a peso (quantidade quebrada, ex.: 0,523): o preço unitário já é por kg.
  if (i.quantity && !Number.isInteger(i.quantity)) return { valor: unit, unidade: "kg" };
  return null;
}

async function unitPriceReport(q: string): Promise<string> {
  const palavras = norm(q).split(" ").filter((w) => w.length > 2);
  if (!palavras.length) return "Diga o produto, ex.: *preço do café*.";
  const itens = (await itensComData({ AND: palavras.map((w) => ({ name: { contains: w, mode: "insensitive" as const } })) })).slice(0, 30);
  // Nomes de nota vêm sem acento ("CAFE"): tenta de novo sem acento.
  const achados = itens.length ? itens : (await itensComData()).filter((i) => palavras.every((w) => norm(i.name).includes(w))).slice(0, 30);
  if (!achados.length) return `🔎 Não achei "${q}" nas notas fiscais guardadas.`;
  const linhas = achados.slice(0, 8).map((i) => {
    const pu = precoPorUnidade(i);
    return `• ${dia(i.quando)} · ${i.name} — ${brl(i.unitPrice || i.amount)}${pu ? ` (${brl(pu.valor)}/${pu.unidade})` : ""}`;
  });
  const comPu = achados.map((i) => ({ i, pu: precoPorUnidade(i) })).filter((x) => x.pu);
  let veredito = "";
  if (comPu.length >= 2) {
    const [ult, ...antes] = comPu;
    const mesmos = antes.filter((x) => x.pu!.unidade === ult.pu!.unidade).map((x) => x.pu!.valor).sort((a, b) => a - b);
    if (mesmos.length) {
      const mediana = mesmos[Math.floor(mesmos.length / 2)];
      const dif = (ult.pu!.valor - mediana) / mediana;
      const barato = comPu.reduce((a, b) => (b.pu!.valor < a.pu!.valor ? b : a));
      veredito =
        `\n\n📊 Última compra: ${brl(ult.pu!.valor)}/${ult.pu!.unidade} — ${Math.abs(dif) < 0.03 ? "igual ao normal" : dif > 0 ? `${Math.round(dif * 100)}% mais caro que o normal` : `${Math.round(-dif * 100)}% mais barato que o normal`} (${brl(mediana)}/${ult.pu!.unidade}).` +
        `\n💚 Mais barato: ${brl(barato.pu!.valor)}/${barato.pu!.unidade} em ${dia(barato.i.quando)} (${barato.i.name}).`;
    }
  } else veredito = "\n\n(Sem o tamanho da embalagem no nome do item, comparo só o preço da unidade.)";
  return `🏷️ *${q}* nas suas notas\n${linhas.join("\n")}${veredito}`;
}

// ── 4) Caixa de ideias e links ────────────────────────────────────────────
async function tituloDoLink(url: string): Promise<string> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(6000), redirect: "follow", headers: { "user-agent": "Mozilla/5.0" } });
    if (!r.ok || !/text\/html/.test(r.headers.get("content-type") || "")) return "";
    const html = (await r.text()).slice(0, 200_000);
    const m = html.match(/<title[^>]*>([^<]{1,200})<\/title>/i);
    return m ? m[1].replace(/\s+/g, " ").replace(/&amp;/g, "&").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').trim() : "";
  } catch {
    return "";
  }
}

async function applyNoteCommand(text: string): Promise<string | null> {
  const t = text.trim();
  // "guarda 100 na reserva" / "guarda" (resposta à sugestão) são da Reserva, não daqui.
  const salva = t.match(/^(?:(?:guarda|salva|anota)\s+(?:(?:essa|esta|a)\s+ideia|(?:esse|este|o)\s+link|(?:essa|esta)\s+(?:nota|informa[cç][aã]o)|isso|a[ií])?\s*:?|(?:ideia|nota|lembrete\s+solto)\s*:)\s*([\s\S]{3,1500})$/i);
  if (salva && !/^(?:guarda|anota)\s+(?:r\$\s*)?\d/i.test(t) && !/\breserva\b/i.test(t)) {
    const corpo = salva[1].trim();
    const url = corpo.match(/https?:\/\/\S+/)?.[0] ?? "";
    const title = url ? await tituloDoLink(url) : "";
    await prisma.note.create({ data: { text: corpo, url, title } });
    return `📥 Guardei${title ? `: *${title}*` : url ? " o link" : ""}.\nPara achar depois: *o que eu guardei sobre …?* ou *minhas notas*.`;
  }
  const busca = t.match(/^(?:o\s+que\s+(?:eu\s+)?guardei|minhas\s+(?:notas|ideias)|links\s+guardados|procura\s+nas\s+notas)(?:\s+(?:sobre|de|com|do|da)\s+(.+?))?\s*\??$/i);
  if (busca) {
    const q = busca[1]?.trim();
    const palavras = q ? norm(q).split(" ").filter((w) => w.length > 2) : [];
    const todas = await prisma.note.findMany({ orderBy: { createdAt: "desc" }, take: 500 });
    const achadas = (palavras.length ? todas.filter((n) => palavras.every((w) => norm(`${n.text} ${n.title} ${n.url}`).includes(w))) : todas).slice(0, 10);
    if (!achadas.length) return q ? `🔎 Nada guardado sobre "${q}".` : "📥 Caixa vazia. Guarde com *guarda: …* ou *guarda esse link https://…*.";
    await kvSet("notes:last", { ids: achadas.map((n) => n.id) });
    return `📥 *${q ? `Guardado sobre "${q}"` : "Últimas coisas guardadas"}*\n${achadas
      .map((n, i) => `*${i + 1}.* ${dia(n.createdAt)} · ${n.title ? `${n.title} — ` : ""}${n.text.slice(0, 160)}${n.text.length > 160 ? "…" : ""}`)
      .join("\n")}\nPara apagar: *apaga nota N*.`;
  }
  const apaga = t.match(/^apaga(?:r)?\s+(?:a\s+)?nota\s+(\d{1,2})[.!]?$/i);
  if (apaga) {
    const last = await kvGet<{ ids: string[] }>("notes:last");
    const id = last?.ids[Number(apaga[1]) - 1];
    if (!id) return "Peça *minhas notas* primeiro e use o número da lista.";
    const n = await prisma.note.delete({ where: { id } }).catch(() => null);
    return n ? `🗑️ Apaguei: ${n.title || n.text.slice(0, 60)}` : "Essa nota já não existe.";
  }
  return null;
}

/** Comandos deste módulo; null = não é nenhum deles. */
export async function applyExtrasCommand(text: string): Promise<string | null> {
  const t = text.trim();
  if (/^(?:o\s+que\s+(?:eu\s+)?(?:preciso|tenho\s+que|devo)\s+comprar(?:\s+no\s+mercado)?|lista\s+de\s+(?:compras|reposi[cç][aã]o)|o\s+que\s+est[aá]\s+acabando)\s*\??$/i.test(t)) return restockList();
  const preco = t.match(/^(?:pre[cç]o\s+(?:do|da|de|dos|das)\s+(.{2,40}?)|(?:o|a)\s+(.{2,40}?)\s+ficou\s+mais\s+car[oa](?:\s+.*)?|onde\s+(?:o|a)\s+(.{2,40}?)\s+(?:saiu|foi|est[aá])\s+mais\s+barat[oa].*?)\s*\??$/i);
  if (preco) return unitPriceReport((preco[1] || preco[2] || preco[3]).trim());
  return (await applyRuleCommand(t)) ?? (await applyNoteCommand(t));
}
