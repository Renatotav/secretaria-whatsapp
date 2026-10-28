// Importação de fatura/extrato (PDF ou print): projeta parcelas e assinaturas,
// evita repetidos, aplica a memória de categoria por loja, acerta as datas da
// fatura e avisa tetos estourados. Saiu de message-handlers.ts (28/10/2026) —
// sem estado de conversa.

import { prisma } from "./prisma";
import { type StatementEntry } from "./personal-router";
import { parseLocalDate, todayBRT } from "./dates";
import { brlMsg as brl } from "./format";
import { merchantKey } from "./finance-taxonomy";
import { categoryRuleFor } from "./personal-extras";
import { MONTH_NAMES, addMonths, budgetIcon, budgetStatus, isoDay } from "./finance-common";

/**
 * Depois de importar fatura/extrato: categorias do mês que passaram de 70%
 * do teto (o alerta por mensagem só existia no gasto lançado pelo WhatsApp).
 */
export async function budgetAlertsAfterImport(entries: StatementEntry[]): Promise<string> {
  const months = new Set(entries.filter((e) => e.type === "expense" && e.date).map((e) => (e.date as string).slice(0, 7)));
  const lines: string[] = [];
  for (const ym of months) {
    const [y, m] = ym.split("-").map(Number);
    const { items } = await budgetStatus(y, m - 1);
    const touched = new Set(entries.filter((e) => (e.date as string)?.startsWith(ym)).map((e) => e.category));
    for (const i of items) {
      const pct = (i.spent / i.limit) * 100;
      if (touched.has(i.category) && pct >= 70) {
        lines.push(`${budgetIcon(pct)} ${i.category} (${MONTH_NAMES[m - 1]}): ${brl(i.spent)} de ${brl(i.limit)} (${pct.toFixed(0)}%)`);
      }
    }
  }
  return lines.length ? `\n\n🎯 *Tetos chegando no limite:*\n${lines.join("\n")}` : "";
}

/**
 * Detecta "Parcela X/Y" (e opcionalmente "(compra em DD/MM)") numa descrição
 * — seja gerada pelo parser de extrato ou digitada à mão pelo usuário direto
 * no campo de edição — e devolve a descrição "base" sem esses pedaços (pra
 * comparar entradas da mesma compra parcelada entre si). Se a descrição não
 * tiver "(compra em DD/MM)" explícito, usa a data do próprio lançamento
 * (fallbackDate) como referência — é o caso de quem só digita "Parcela 3/12"
 * na edição, sem se preocupar com a data original da compra.
 */
export function parseInstallmentInfo(
  description: string,
  fallbackDate?: Date
): { current: number; total: number; purchaseDate: string; baseDescription: string } | null {
  const parcelaMatch = description.match(/Parcela (\d+)\/(\d+)/);
  if (!parcelaMatch) return null;
  const compraMatch = description.match(/\(compra em (\d{2})\/(\d{2})\)/);

  const baseDescription = description
    .replace(/\s*-?\s*Parcela \d+\/\d+/, "")
    .replace(/\s*\(compra em \d{2}\/\d{2}\)/, "")
    .replace(/\s*\(previsto\)/, "")
    .trim();

  const purchaseDate = compraMatch
    ? `${compraMatch[2]}-${compraMatch[1]}` // MM-DD, estável entre reimportações
    : fallbackDate
    ? `${String(fallbackDate.getMonth() + 1).padStart(2, "0")}-${String(fallbackDate.getDate()).padStart(2, "0")}`
    : null;
  if (!purchaseDate) return null;

  return {
    current: Number(parcelaMatch[1]),
    total: Number(parcelaMatch[2]),
    purchaseDate,
    baseDescription,
  };
}

export function installmentKey(baseDescription: string, purchaseDate: string, total: number, amount: number, targetDate: Date): string {
  return `${baseDescription}|${purchaseDate}|${total}|${amount.toFixed(2)}|${targetDate.getFullYear()}-${targetDate.getMonth()}`;
}

/** Parcela X/Y no mesmo mês, qualquer que seja o nome (o valor é comparado à parte, com tolerância). */
export function looseInstallmentKey(current: number, total: number, targetDate: Date): string {
  return `inst|${current}/${total}|${targetDate.getFullYear()}-${targetDate.getMonth()}`;
}

/** Assinatura no mesmo mês, qualquer que seja o nome (o valor é comparado à parte, com tolerância). */
export function looseSubscriptionKey(targetDate: Date): string {
  return `sub|${targetDate.getFullYear()}-${targetDate.getMonth()}`;
}

export function subscriptionKey(description: string, amount: number, targetDate: Date): string {
  return `sub|${description}|${amount.toFixed(2)}|${targetDate.getFullYear()}-${targetDate.getMonth()}`;
}

export const SUBSCRIPTION_PROJECTION_MONTHS = 11;

/**
 * Núcleo compartilhado: expande parcelas restantes e assinaturas recorrentes
 * em entradas futuras "(previsto)", dedupe contra o banco, e insere o que é
 * novo. Não notifica o dono — quem chama decide se/como avisar (o fluxo de
 * extrato via WhatsApp avisa; edição manual no painel não precisa).
 */
// Marketplaces vendem de tudo: o nome da loja não diz o que foi comprado.
export const MARKETPLACE_RE = /^(AMAZON|MERCADO ?LIVRE|MERCADO\*|MERCADOPAGO|SHOPEE|ALIEXPRESS|MAGALU|SHEIN|PAYPAL|PG \*|PAGSEGURO|PIX)/;

/**
 * Memória por loja: compra de uma loja que já apareceu antes (com categoria e
 * subcategoria) recebe a mesma classificação — decidida pelo código, não pela
 * IA, então "DL*UBERRIDES" é sempre Transporte › Uber/Taxi.
 */
export async function applyMerchantMemory(entries: StatementEntry[]): Promise<StatementEntry[]> {
  if (!entries.some((e) => e.type === "expense")) return entries;
  const history = await prisma.financeEntry.findMany({
    where: { type: "expense", subcategory: { not: "" } },
    select: { description: true, category: true, subcategory: true },
    orderBy: { createdAt: "desc" },
    take: 3000,
  });
  const known = new Map<string, { category: string; subcategory: string }>();
  for (const h of history) {
    const key = merchantKey(h.description);
    if (key && !known.has(key)) known.set(key, { category: h.category, subcategory: h.subcategory });
  }
  const out: StatementEntry[] = [];
  const porRegra = new Set<StatementEntry>();
  for (const e of entries) {
    // Regra aprovada por ele vem antes da memória por loja.
    const regra = e.type === "expense" ? await categoryRuleFor(e.description).catch(() => null) : null;
    const x = regra ? { ...e, category: regra.category, subcategory: regra.subcategory } : e;
    if (regra) porRegra.add(x);
    out.push(x);
  }
  return out.map((e) => {
    if (e.type !== "expense" || porRegra.has(e)) return e;
    const key = merchantKey(e.description);
    if (!key || MARKETPLACE_RE.test(key)) return e;
    const k = known.get(key);
    return k ? { ...e, category: k.category, subcategory: k.subcategory } : e;
  });
}

export async function projectAndInsertFinanceEntries(
  entries: StatementEntry[],
  source: "whatsapp" | "dashboard" = "whatsapp",
  creditCardDueDay?: number
): Promise<{ toInsert: StatementEntry[]; duplicates: number; projected: number; matchedManual: StatementEntry[]; adjusted: { description: string; from: number; to: number }[]; touchedIds: string[] }> {
  entries = await applyMerchantMemory(entries);
  // Junta as parcelas restantes (ex: Parcela 6/10 vira também 7/10..10/10 em
  // meses futuros) e assinaturas recorrentes (categoria "Assinaturas" sem
  // parcela — ex: Anthropic, Netflix) com as entradas reais desse extrato,
  // pra já projetar o fluxo de caixa dos próximos meses.
  const candidates: { entry: StatementEntry; date: Date; key: string | null }[] = [];

  for (const e of entries) {
    const baseDate = parseLocalDate(e.date);
    // Sem "(compra em ..)" na descrição (fatura), usa a data real da compra —
    // antes caía no vencimento e as parcelas futuras saíam "(compra em 10/10)".
    const info = parseInstallmentInfo(e.description, e.purchaseDate ? parseLocalDate(e.purchaseDate) : baseDate);

    if (info) {
      candidates.push({
        entry: e,
        date: baseDate,
        key: installmentKey(info.baseDescription, info.purchaseDate, info.total, e.amount, baseDate),
      });
      if (info.current < info.total) {
        for (let i = info.current + 1; i <= info.total; i++) {
          const futureDate = addMonths(baseDate, i - info.current);
          // Cartão de outra pessoa: a 1ª parcela já está no vencimento dele; o mês avança no mesmo dia.
          if (creditCardDueDay && !e.card && (e.category === "Cartão" || e.category === "Financeiro" || e.description.toLowerCase().includes("parcela"))) {
            futureDate.setDate(creditCardDueDay);
          }
          const futureDescription = `${info.baseDescription} - Parcela ${i}/${info.total} (compra em ${info.purchaseDate.split("-")[1]}/${info.purchaseDate.split("-")[0]}) (previsto)`;
          candidates.push({
            entry: { ...e, description: futureDescription, date: futureDate.toISOString(), status: "pending" },
            date: futureDate,
            key: installmentKey(info.baseDescription, info.purchaseDate, info.total, e.amount, futureDate),
          });
        }
      }
    } else if (e.category === "Assinaturas" || /\(recorrente\)/.test(e.description)) {
      // Assinatura (categoria "Assinaturas") ou qualquer lançamento marcado
      // "(recorrente)" pelo usuário (ex: salário) = repete todo mês, sem fim
      // previsto. Projeta um horizonte fixo; cada reimportação/edição futura
      // da mesma entrada estende a janela pra frente automaticamente.
      // Cancelar é só apagar a entrada daquele mês específico na tabela.
      const baseDescription = e.description.replace(/\s*\(recorrente\)/, "").trim();
      candidates.push({
        entry: { ...e, description: baseDescription },
        date: baseDate,
        key: subscriptionKey(baseDescription, e.amount, baseDate),
      });
      for (let i = 1; i <= SUBSCRIPTION_PROJECTION_MONTHS; i++) {
        const futureDate = addMonths(baseDate, i);
        candidates.push({
          entry: { ...e, description: `${baseDescription} (previsto)`, date: futureDate.toISOString(), status: "pending" },
          date: futureDate,
          key: subscriptionKey(baseDescription, e.amount, futureDate),
        });
      }
    } else {
      candidates.push({ entry: e, date: baseDate, key: null });
    }
  }

  // Dedupe contra o que já existe no banco (de uma importação anterior, real
  // ou projetada) e dentro do próprio lote que acabou de ser montado.
  const existing = await prisma.financeEntry.findMany({
    where: {
      OR: [
        { description: { contains: "Parcela " } },
        { category: "Assinaturas" },
        { description: { contains: "(recorrente)" } },
      ],
    },
    select: { id: true, description: true, date: true, amount: true, category: true },
  });
  const existingKeys = new Set<string>();
  // Chave sem o nome: a mesma parcela/assinatura anotada com outro nome
  // ("Moto Scooter Elétrica - Parcela 1/5" x "MOVYX MOBILIDADE - Parcela 1/5").
  const existingLooseKeys = new Map<string, { id: string; amount: number }[]>();
  const addLoose = (key: string, id: string, amount: number) =>
    existingLooseKeys.set(key, [...(existingLooseKeys.get(key) ?? []), { id, amount }]);
  for (const e of existing) {
    const info = parseInstallmentInfo(e.description, e.date);
    if (info) {
      existingKeys.add(installmentKey(info.baseDescription, info.purchaseDate, info.total, e.amount, e.date));
      addLoose(looseInstallmentKey(info.current, info.total, e.date), e.id, e.amount);
    } else if (e.category === "Assinaturas" || /\(recorrente\)/.test(e.description)) {
      const baseDescription = e.description.replace(/\s*\(previsto\)/, "").replace(/\s*\(recorrente\)/, "").trim();
      existingKeys.add(subscriptionKey(baseDescription, e.amount, e.date));
      addLoose(looseSubscriptionKey(e.date), e.id, e.amount);
    }
  }

  // Compras que o dono já anotou à mão, com o nome dele ("sopa", "almoço") e
  // qualquer meio de pagamento (às vezes anota "pix" e foi no cartão): mesmo
  // valor (até R$ 0,10 de diferença) e data de compra até 5 dias de diferença
  // (ele às vezes anota uns dias depois). Cada lançamento existente só "absorve" uma linha da fatura —
  // se ele anotou 1 almoço de R$ 26 e a fatura tem 2, o segundo entra.
  const realCard = candidates.filter((c) => c.entry.paymentMethod === "cartão" && !c.entry.description.includes("(previsto)"));
  const manualCard = realCard.length === 0 ? [] : await prisma.financeEntry.findMany({
    where: {
      date: {
        gte: new Date(Math.min(...realCard.map((c) => c.date.getTime())) - 40 * 86400000),
        lte: new Date(Math.max(...realCard.map((c) => c.date.getTime())) + 40 * 86400000),
      },
    },
    select: { id: true, amount: true, date: true, purchaseDate: true, type: true, description: true, status: true },
  });
  const usedManual = new Set<string>();
  // Previsão ou valor de cabeça (ex.: "FLEXPAG *ENELCE (previsto)" R$ 341,98)
  // com o mesmo nome da linha da fatura, na mesma fatura: troca pelo valor real.
  const nameKey = (d: string) =>
    d.replace(/\((?:previsto|estimado|recorrente)\)/gi, "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const adjusted: { description: string; from: number; to: number }[] = [];
  const byName: (typeof candidates)[number][] = [];
  const matchedManual: StatementEntry[] = [];
  // A fatura é a fonte confiável: o lançamento que já existia recebe o nome,
  // a data e o meio de pagamento do cartão (a categoria dele é mantida).
  const updates: { id: string; entry: StatementEntry }[] = [];
  const DAY_MS = 86400000;
  const AMOUNT_TOLERANCE = 0.1;

  const toInsert: StatementEntry[] = [];
  let duplicates = 0;
  let projected = 0;
  const seenThisBatch = new Set<string>();

  // Previsão que já existe com o mesmo nome no mesmo mês (o valor muda com o
  // dólar): não cria outra — a regra da fatura troca pelo valor real depois.
  const previstos = await prisma.financeEntry.findMany({
    where: { status: "pending", description: { contains: "(previsto)" } },
    select: { description: true, date: true },
  });
  const mesKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}`;
  const previstoNoMes = new Set(previstos.map((p) => `${nameKey(p.description)}|${mesKey(p.date)}`));
  for (const c of candidates) {
    const isProjection = c.entry.description.includes("(previsto)");
    if (isProjection && previstoNoMes.has(`${nameKey(c.entry.description)}|${mesKey(c.date)}`)) {
      duplicates++;
      continue;
    }
    if (c.key) {
      if (existingKeys.has(c.key) || seenThisBatch.has(c.key)) {
        duplicates++;
        continue;
      }
      seenThisBatch.add(c.key);
      const info = parseInstallmentInfo(c.entry.description, c.date);
      const loose = info ? looseInstallmentKey(info.current, info.total, c.date) : looseSubscriptionKey(c.date);
      const sameUnderOtherName = existingLooseKeys
        .get(loose)
        ?.find((x) => !usedManual.has(x.id) && Math.abs(x.amount - c.entry.amount) <= AMOUNT_TOLERANCE)?.id;
      if (sameUnderOtherName) {
        usedManual.add(sameUnderOtherName);
        if (isProjection) {
          duplicates++;
        } else {
          updates.push({ id: sameUnderOtherName, entry: c.entry });
          matchedManual.push(c.entry);
        }
        continue;
      }
    }
    // Estorno (crédito) também casa com o estorno que ele já anotou, pela data da fatura.
    if (!isProjection && c.entry.paymentMethod === "cartão") {
      const bought = c.entry.purchaseDate ? parseLocalDate(c.entry.purchaseDate) : c.date;
      const match = manualCard.find((m) =>
        !usedManual.has(m.id) &&
        m.type === c.entry.type &&
        Math.abs(m.amount - c.entry.amount) <= AMOUNT_TOLERANCE &&
        Math.abs((m.purchaseDate ?? m.date).getTime() - bought.getTime()) <= 5 * DAY_MS
      );
      if (match) {
        usedManual.add(match.id);
        updates.push({ id: match.id, entry: c.entry });
        matchedManual.push(c.entry);
        continue;
      }
      // Sem valor igual: tenta pelo nome depois que todos os valores iguais já casaram.
      byName.push(c);
      continue;
    }
    if (isProjection) projected++;
    toInsert.push(c.entry);
  }

  // Valor diferente, mesmo nome: só se houver UM pendente com esse nome nessa
  // fatura e o valor não for muito diferente (até 30% ou R$ 5) — senão almoços
  // de valores parecidos no mesmo lugar se misturariam.
  for (const c of byName) {
    const key = nameKey(c.entry.description);
    const sameName = key
      ? manualCard.filter((m) =>
          !usedManual.has(m.id) &&
          m.type === c.entry.type &&
          m.status === "pending" &&
          nameKey(m.description) === key &&
          Math.abs(m.date.getTime() - c.date.getTime()) <= 20 * DAY_MS &&
          Math.abs(m.amount - c.entry.amount) <= Math.max(5, m.amount * 0.3)
        )
      : [];
    if (sameName.length === 1) {
      const m = sameName[0];
      usedManual.add(m.id);
      updates.push({ id: m.id, entry: c.entry });
      adjusted.push({ description: c.entry.description, from: m.amount, to: c.entry.amount });
    } else {
      toInsert.push(c.entry);
    }
  }

  for (const u of updates) {
    const antes = await prisma.financeEntry.findUnique({ where: { id: u.id }, select: { description: true, date: true, card: true } });
    await prisma.financeEntry.update({
      where: { id: u.id },
      data: {
        description: u.entry.description,
        amount: u.entry.amount,
        date: parseLocalDate(u.entry.date),
        purchaseDate: u.entry.purchaseDate ? parseLocalDate(u.entry.purchaseDate) : undefined,
        paymentMethod: u.entry.paymentMethod,
        status: u.entry.status || "pending",
      },
    });
    // Parcela que ele anotou com outro nome ("Amazon — Tênis… Parcela 1/6") casou com a
    // da fatura ("AMAZON MARKETPLACE - Parcela 1/6"): as próximas da série ficam com o
    // nome da fatura também, para a série toda aparecer igual.
    // Nome da série = o que vem antes de "- Parcela X/Y" (o resto muda de parcela para parcela).
    const serie = (d: string) => { const m = d.match(/^(.*?)\s*-?\s*Parcela (\d+)\/(\d+)/); return m ? { nome: m[1].trim(), total: Number(m[3]) } : null; };
    const velho = antes ? serie(antes.description) : null;
    const novo = serie(u.entry.description);
    if (velho && novo && velho.nome && velho.total === novo.total && velho.nome !== novo.nome) {
      const futuras = await prisma.financeEntry.findMany({
        // Só a mesma série: mesmo cartão (o do Bruno é outro) e o mesmo nome antigo.
        where: { status: "pending", card: antes?.card ?? "", date: { gt: parseLocalDate(u.entry.date) }, description: { startsWith: velho.nome } },
        select: { id: true, description: true },
      });
      for (const f of futuras) {
        const sf = serie(f.description);
        if (!sf || sf.nome !== velho.nome || sf.total !== velho.total) continue;
        await prisma.financeEntry.update({ where: { id: f.id }, data: { description: novo.nome + f.description.slice(f.description.indexOf(velho.nome) + velho.nome.length) } });
      }
    }
  }

  if (toInsert.length > 0) {
    await prisma.financeEntry.createMany({
      data: toInsert.map((e) => ({
        type: e.type,
        amount: e.amount,
        category: e.category,
        subcategory: e.subcategory,
        description: e.description,
        date: parseLocalDate(e.date),
        purchaseDate: e.purchaseDate ? parseLocalDate(e.purchaseDate) : null,
        paymentMethod: e.paymentMethod || "pix",
        account: e.account || "Principal",
        status: e.status || "paid",
        card: e.card || "",
        source,
      })),
    });
  }

  return { toInsert, duplicates, projected, matchedManual, adjusted, touchedIds: updates.map((u) => u.id) };
}

/**
 * Compra de fatura com vencimento conhecido: data = vencimento, ano da compra
 * calculado (antes do vencimento; parcela X/Y ≈ X meses antes) e "a pagar"
 * até a fatura vencer — a baixa automática marca como paga depois.
 */
export function applyInvoiceDates(e: StatementEntry, due: Date): StatementEntry {
  let purchaseDate = e.purchaseDate;
  if (purchaseDate) {
    const pd = parseLocalDate(purchaseDate);
    const parcel = e.description.match(/Parcela (\d+)\/\d+/);
    const target = parcel ? new Date(due.getFullYear(), due.getMonth() - Number(parcel[1]), due.getDate()) : due;
    const options = [0, 1, 2]
      .map((back) => parseLocalDate(isoDay(due.getFullYear() - back, pd.getMonth(), pd.getDate())))
      .filter((d) => d.getTime() <= due.getTime());
    const best = options.reduce<Date | null>((b, d) => (!b || Math.abs(d.getTime() - target.getTime()) < Math.abs(b.getTime() - target.getTime()) ? d : b), null);
    if (best) purchaseDate = isoDay(best.getFullYear(), best.getMonth(), best.getDate());
  }
  return {
    ...e,
    date: isoDay(due.getFullYear(), due.getMonth(), due.getDate()),
    purchaseDate,
    paymentMethod: "cartão",
    status: due.getTime() >= todayBRT().getTime() ? "pending" : "paid",
  };
}
