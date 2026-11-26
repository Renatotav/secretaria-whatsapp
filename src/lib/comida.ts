// O que ele comeu, cardápio e receitas (24/11/2026, parte do Corpo).
// "comi 2 coxinhas e uma coca" → a IA separa alimentos e gramas, a tabela de referência dá as calorias.
// Foto do prato com a legenda "comi isso" → faixa de calorias (por foto erra muito: nunca número exato).
// "monta meu cardápio" / "o que cozinho hoje?" → com o que ele comprou nas notas recentes.

import { prisma } from "./prisma";
import { todayBRT } from "./dates";
import { generateResponse, generateVisionResponse, type ProviderOptions } from "./openai";
import { normalizeItemCategory } from "./finance-taxonomy";
import { corpoNumeros } from "./corpo";

const DIA = 86_400_000;
const k = (v: number) => Math.round(v).toLocaleString("pt-BR");

/** "comi 2 coxinhas", "almocei arroz, feijão e frango", "jantei pizza" — sem dinheiro no meio. */
export const COMI_RE = /^\s*(?:hoje\s+)?(?:eu\s+)?(?:comi|almocei|jantei|lanchei|merendei|tomei\s+caf[eé](?:\s+da\s+manh[aã])?|caf[eé]\s+da\s+manh[aã]\s*:|bebi)\b\s*:?\s*(.{2,300})$/i;
export function ehComida(t: string): string | null {
  if (/\b\d+(?:[.,]\d+)?\s*(?:reais|conto|contos)\b|r\$|\b(pix|cart[aã]o|d[eé]bito|no vr|dinheiro|paguei|gastei)\b/i.test(t)) return null;
  // "almocei 25" é gasto sem meio, não refeição.
  if (/^\s*\S+\s+\d+(?:[.,]\d+)?\s*$/.test(t)) return null;
  return t.match(COMI_RE)?.[1]?.trim() ?? null;
}

type Item = { alimento: string; id: number | null; gramas: number };

async function tabela(): Promise<string> {
  return (await prisma.alimento.findMany({ select: { id: true, nome: true }, orderBy: { id: "asc" } })).map((a) => `${a.id} ${a.nome}`).join("\n");
}

/** Itens com gramas → calorias e proteína (só os que a tabela tem). */
async function somar(itens: Item[]) {
  const ids = itens.map((i) => i.id).filter((x): x is number => x != null);
  const al = new Map((await prisma.alimento.findMany({ where: { id: { in: ids } } })).map((a) => [a.id, a]));
  let kcal = 0, prot = 0;
  const linhas = itens.map((i) => {
    const a = i.id != null ? al.get(i.id) : null;
    if (!a) return `• ${i.alimento}: sem dado na tabela`;
    const c = (a.kcal * i.gramas) / 100, p = (a.proteina * i.gramas) / 100;
    kcal += c; prot += p;
    return `• ${i.alimento} (~${k(i.gramas)} g): ~${k(c)} kcal`;
  });
  return { kcal, prot, linhas };
}

async function registrar(texto: string, kcal: number, prot: number, faixa?: [number, number]) {
  await prisma.corpoLog.create({ data: { kind: "comida", value: Math.round(kcal), note: JSON.stringify({ texto: texto.slice(0, 200), prot: Math.round(prot), ...(faixa ? { faixa } : {}) }), at: todayBRT() } });
}

/** Total do dia contra a meta de calorias (se ele tem perfil). */
async function linhaDoDia(): Promise<string> {
  const hoje = todayBRT();
  const doDia = await prisma.corpoLog.findMany({ where: { kind: "comida", at: { gte: new Date(hoje.getTime() - DIA / 2), lt: new Date(hoje.getTime() + DIA / 2) } } });
  const total = doDia.reduce((s, r) => s + (r.value ?? 0), 0);
  const meta = (await corpoNumeros()).kcal?.meta;
  return `📊 Hoje: ~${k(total)} kcal${meta ? ` de ~${k(meta)} (${total <= meta ? `sobram ~${k(meta - total)}` : `passou ~${k(total - meta)}`})` : ""}`;
}

/** "quantas calorias tem 100g de arroz?", "calorias da banana", "proteína do frango": consulta na tabela. */
export const CONSULTA_RE = /^\s*(?:quantas?\s+)?(calorias?|kcal|prote[ií]nas?)\s+(?:tem\s+|d[eoa]s?\s+|n[oa]s?\s+)*(?:(\d+(?:[.,]\d+)?)\s*(?:g|gr|gramas|ml)\s+(?:de\s+)?)?(.{2,40}?)\s*\??\s*$/i;
async function consultaAlimento(t: string): Promise<string | null> {
  const m = t.match(CONSULTA_RE);
  if (!m) return null;
  const g = m[2] ? Number(m[2].replace(",", ".")) : 100;
  const ws = m[3].normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3).map((w) => (w.length > 5 ? w.slice(0, 5) : w));
  if (!ws.length) return null;
  const todos = await prisma.alimento.findMany();
  const achados = todos
    .map((a) => ({ a, pts: ws.filter((w) => a.nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().includes(w)).length }))
    .filter((x) => x.pts === ws.length)
    // Primeiro o que começa com a palavra ("Arroz, tipo 1…" antes de "Bolinho de arroz"), depois o preparo
    // comum (cozido, grelhado, assado, cru) e por fim o nome mais curto.
    .map((x) => {
      const nm = x.a.nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
      return { ...x, ord: (nm.startsWith(ws[0]) ? 0 : 10) + (/cozid|grelhad|assad/.test(nm) ? 0 : /\bcru/.test(nm) ? 1 : 3) + (/figado|coracao|moela|pe,|pele|miud/.test(nm) ? 5 : 0) };
    })
    .sort((x, y) => x.ord - y.ord || x.a.nome.length - y.a.nome.length)
    .slice(0, 4);
  if (!achados.length) return `🔎 Não achei "${m[3]}" na tabela. Tente um nome simples (ex.: *calorias da banana*).`;
  return `🔎 *${m[3]}* — em ${k(g)} g:\n${achados.map(({ a }) => `• ${a.nome}: ~${k((a.kcal * g) / 100)} kcal · ${k((a.proteina * g) / 100)} g proteína · ${k((a.carbo * g) / 100)} g carbo · ${k((a.gordura * g) / 100)} g gordura`).join("\n")}`;
}

/** "comi …": calcula, guarda e responde. */
export async function applyComidaCommand(text: string, opts: ProviderOptions): Promise<string | null> {
  const t = text.trim();
  if (/^\s*(?:quanto\s+(?:eu\s+)?comi|calorias)\s+(?:de\s+)?hoje\s*\??\s*$/i.test(t)) return linhaDoDia();
  if (/^\s*(?:monta|faz|sugere)\s+(?:um\s+|meu\s+|o\s+)?card[aá]pio\b|^\s*o\s+que\s+(?:eu\s+)?(?:cozinho|fa[cç]o\s+(?:pra|para)\s+comer|como)\s+hoje\s*\??\s*$|^\s*receita\s+(?:com|de)\s+/i.test(t)) return cardapio(t, opts);
  const consulta = await consultaAlimento(t);
  if (consulta) return consulta;
  const comeu = ehComida(t);
  if (!comeu) return null;
  const { content } = await generateResponse(
    [{ role: "user", content: `TABELA (id nome, por 100 g):\n${await tabela()}\n\nO que ele comeu: "${comeu}"\nSepare cada alimento, estime as gramas de uma porção brasileira comum (coxinha média 80 g, prato de arroz 150 g, concha de feijão 140 g, pão francês 50 g, lata 350, long neck 330) e escolha o id da TABELA mais parecido no estado em que foi comido (cozido, frito…); null se não houver.\nResponda só JSON: [{"alimento":"coxinha de frango","id":123,"gramas":160}]` }],
    "Você estima porções e casa alimentos com uma tabela nutricional. Responda só JSON.",
    0,
    700,
    opts,
  );
  const itens = (JSON.parse(content.match(/\[[\s\S]*\]/)?.[0] ?? "[]") as Item[]).filter((i) => i.alimento && i.gramas > 0 && i.gramas < 5000);
  if (!itens.length) return "🍽️ Não entendi o que você comeu. Ex.: *comi 2 coxinhas e uma coca*.";
  const s = await somar(itens);
  await registrar(comeu, s.kcal, s.prot);
  return `🍽️ Anotado: ~*${k(s.kcal)} kcal* · ${k(s.prot)} g de proteína\n${s.linhas.join("\n")}\n${await linhaDoDia()}\n_Estimativa pela porção comum; se foi bem mais ou menos, diga (ex.: comi 3 coxinhas grandes)._`;
}

/** Foto do prato com legenda "comi isso": faixa de calorias (foto erra muito). */
export async function comidaPorFoto(base64: string, mimetype: string, caption: string, opts: ProviderOptions): Promise<string> {
  const resp = await generateVisionResponse(
    base64,
    mimetype,
    `Foto de um prato de comida. Liste os alimentos visíveis e estime as gramas de cada um, e diga uma faixa de calorias do prato inteiro (mínimo e máximo realistas). Legenda dele: "${caption}". Estime também a proteína do prato em gramas. Responda só JSON: {"itens":[{"alimento":"arroz branco","gramas":150}],"min":500,"max":800,"prot":35}`,
    opts,
  );
  const j = JSON.parse(resp.match(/\{[\s\S]*\}/)?.[0] ?? "{}") as { itens?: { alimento: string; gramas: number }[]; min?: number; max?: number; prot?: number };
  if (!j.itens?.length || !j.min || !j.max) return "📸 Não consegui ver bem o prato. Se quiser, escreva: *comi arroz, feijão e frango*.";
  const meio = (j.min + j.max) / 2;
  const prot = j.prot && j.prot > 0 && j.prot < 300 ? j.prot : 0;
  await registrar(`foto: ${j.itens.map((i) => i.alimento).join(", ")}`, meio, prot, [j.min, j.max]);
  return `📸🍽️ Vi: ${j.itens.map((i) => `${i.alimento} (~${k(i.gramas)} g)`).join(", ")}.\nEntre *${k(j.min)} e ${k(j.max)} kcal* — anotei ~${k(meio)}${prot ? ` · ~${k(prot)} g de proteína` : ""}.\n${await linhaDoDia()}\n_Por foto a conta erra bastante; escrevendo (ex.: comi 2 conchas de feijão) fica mais certo._`;
}

/** Cardápio/receita com o que ele comprou nas notas dos últimos 14 dias e a meta de calorias. */
async function cardapio(pedido: string, opts: ProviderOptions): Promise<string> {
  const itens = await prisma.invoiceItem.findMany({
    where: { amount: { gt: 0 }, financeEntry: { OR: [{ purchaseDate: { gte: new Date(todayBRT().getTime() - 14 * DIA) } }, { purchaseDate: null, date: { gte: new Date(todayBRT().getTime() - 14 * DIA) } }] } },
    select: { name: true, category: true },
  });
  const comida = [...new Set(itens.filter((i) => !["Limpeza", "Higiene e beleza", "Farmácia", "Descontos"].includes(normalizeItemCategory(i))).map((i) => i.name))];
  const meta = (await corpoNumeros()).kcal?.meta;
  const { content } = await generateResponse(
    [{ role: "user", content: `Pedido dele: "${pedido}".\nO que ele comprou no mercado nas últimas 2 semanas (nomes de nota fiscal): ${comida.length ? comida.join("; ") : "(sem notas recentes)"}.\n${meta ? `Meta dele: ~${meta} kcal por dia, para perder peso.` : ""}\nResponda em português do WhatsApp, curto (até 15 linhas): use primeiro o que ele já tem em casa, comida brasileira simples de fazer, com calorias aproximadas por refeição${meta ? " somando perto da meta" : ""}. Se precisar comprar algo, diga no fim em uma linha. Sem sermão e sem falar de médico.` }],
    "Você é a secretária dele e ajuda a montar refeições práticas com o que tem em casa.",
    0.4,
    700,
    opts,
  );
  return `🥗 ${content.trim()}\n_Calorias aproximadas._`;
}

/**
 * Print do resumo de treino (app Zepp do relógio, ou outro app): vira cardio no Corpo e conta como dia ativo.
 * Alternativa grátis ao Strava (24/11: a API pedia assinatura). null = o print não é de treino.
 */
export async function treinoPorPrint(base64: string, mimetype: string, opts: ProviderOptions): Promise<string | null> {
  const resp = await generateVisionResponse(
    base64,
    mimetype,
    'Este print é o resumo de um TREINO/ATIVIDADE FÍSICA de um app de relógio ou de academia (Zepp, Amazfit, Strava, Samsung Health…)? Se for, extraia. Responda só JSON: {"treino":true,"atividade":"caminhada|corrida|bike|esteira|musculação|natação|elíptico|outro","min":32,"km":3.4,"kcal":250,"fc":118,"data":"AAAA-MM-DD ou null"}. Se não for treino: {"treino":false}.',
    opts,
  );
  const j = JSON.parse(resp.match(/\{[\s\S]*\}/)?.[0] ?? "{}") as { treino?: boolean; atividade?: string; min?: number; km?: number | null; kcal?: number | null; fc?: number | null; data?: string | null };
  if (!j.treino || !(j.min && j.min > 0 && j.min < 600)) return null;
  const hoje = todayBRT();
  const at = j.data && /^\d{4}-\d{2}-\d{2}$/.test(j.data) && new Date(`${j.data}T12:00:00`) <= hoje ? new Date(`${j.data}T12:00:00`) : hoje;
  const peso = (await prisma.corpoLog.findFirst({ where: { kind: "peso", value: { not: null } }, orderBy: { at: "desc" } }))?.value ?? 80;
  const met: Record<string, number> = { corrida: 9.8, caminhada: 3.5, bike: 7.5, esteira: 5, "musculação": 5, "natação": 8, "elíptico": 5 };
  const kcal = Math.round(j.kcal && j.kcal > 0 ? j.kcal : ((met[j.atividade ?? ""] ?? 5) * peso * j.min) / 60);
  // Mesmo treino mandado duas vezes (mesmo dia, tipo e tempo) não duplica.
  const igual = await prisma.corpoLog.findFirst({ where: { kind: "cardio", at: { gte: new Date(at.getTime() - DIA / 2), lt: new Date(at.getTime() + DIA / 2) }, note: { contains: `"min":${Math.round(j.min)},` } } });
  if (!igual) {
    await prisma.corpoLog.create({ data: { kind: "cardio", value: kcal, at, note: JSON.stringify({ atividade: j.atividade ?? "treino", min: Math.round(j.min), km: j.km ?? null, fc: j.fc ?? null, fonte: "print" }) } });
    const ja = await prisma.corpoLog.findFirst({ where: { kind: "academia", at: { gte: new Date(at.getTime() - DIA / 2), lt: new Date(at.getTime() + DIA / 2) } } });
    if (!ja) await prisma.corpoLog.create({ data: { kind: "academia", at, note: "print" } });
  }
  const dd = `${String(at.getDate()).padStart(2, "0")}/${String(at.getMonth() + 1).padStart(2, "0")}`;
  return `⌚ ${igual ? "Esse treino já estava anotado" : "Treino anotado"} (${dd}): *${j.atividade ?? "treino"}* · ${Math.round(j.min)} min${j.km ? ` · ${String(j.km).replace(".", ",")} km` : ""} · ~${k(kcal)} kcal${j.fc ? ` · FC média ${j.fc}` : ""}. Conta como dia ativo.`;
}

