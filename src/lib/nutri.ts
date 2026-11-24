// Calorias das compras (24/11/2026, parte do Corpo): cada produto das notas fiscais vira um alimento
// da tabela de referência (por 100 g). A IA casa o produto com o alimento uma vez; depois fica guardado.
// Mostra o que ENTROU em casa, não o que ele comeu.

import { prisma } from "./prisma";
import { generateResponse, type ProviderOptions } from "./openai";
import { normalizeItemCategory, productKey } from "./finance-taxonomy";

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const NAO_COMIDA = new Set(["Limpeza", "Higiene e beleza", "Farmácia", "Descontos"]);

/** Gramas escritas no nome ("330ML", "125G", "0.094KG", "1L"); ml conta como g. */
export function gramasDoNome(name: string): number | null {
  const m = fold(name).match(/(\d+(?:[.,]\d+)?)\s*(kg|g|gr|ml|l|lt)\b/);
  if (!m) return null;
  const v = Number(m[1].replace(",", "."));
  const g = /^(kg|l|lt)$/.test(m[2]) ? v * 1000 : v;
  return g > 0 && g <= 20000 ? g : null;
}

/** Gramas compradas de um item: por kg (quantidade fracionada), pelo nome × quantidade, ou pela estimativa guardada. */
export function gramasDoItem(i: { name: string; quantity: number }, gramasUnidade: number | null): number | null {
  if (i.quantity > 0 && i.quantity < 30 && i.quantity % 1 !== 0) return i.quantity * 1000; // vendido no peso
  const porUnidade = gramasDoNome(i.name) ?? gramasUnidade;
  return porUnidade != null ? porUnidade * Math.max(1, Math.round(i.quantity)) : null;
}

/**
 * Casa os produtos ainda sem par (em lotes de 20, uma chamada pequena de IA cada).
 * Produto de limpeza/higiene/farmácia nem vai para a IA. Devolve quantos casou.
 */
export async function casarProdutos(itens: { name: string; category: string }[], opts: ProviderOptions): Promise<number> {
  const alimentos = await prisma.alimento.findMany({ select: { id: true, nome: true } });
  if (!alimentos.length) return 0;
  const conhecidos = new Set((await prisma.produtoNutri.findMany({ select: { chave: true } })).map((p) => p.chave));
  const novos = new Map<string, string>();
  for (const i of itens) {
    const chave = productKey(i.name);
    if (!chave || conhecidos.has(chave) || novos.has(chave)) continue;
    if (NAO_COMIDA.has(normalizeItemCategory({ name: i.name, category: i.category }))) {
      await prisma.produtoNutri.upsert({ where: { chave }, create: { chave, alimentoId: null }, update: {} });
      conhecidos.add(chave);
      continue;
    }
    novos.set(chave, i.name);
  }
  let casados = 0;
  const lista = [...novos.entries()];
  // A tabela inteira vai junto (~600 linhas): a busca prévia por palavra errava os nomes abreviados
  // ("BARRIGA SUI … CONG" virava abacaxi congelado; arroz cru virava cozido), 24/11.
  const tabela = (await prisma.alimento.findMany({ select: { id: true, nome: true }, orderBy: { id: "asc" } })).map((a) => `${a.id} ${a.nome}`).join("\n");
  for (let k = 0; k < lista.length; k += 25) {
    const lote = lista.slice(k, k + 25);
    try {
      const { content } = await generateResponse(
        [{ role: "user", content: `TABELA (id nome, valores por 100 g):\n${tabela}\n\nPRODUTOS de nota fiscal de supermercado (nomes abreviados):\n${lote.map(([, nome], n) => `${n + 1}. ${nome}`).join("\n")}\n\nPara cada produto:\n- "alimento": o que é, em palavras comuns (ex.: "barriga de porco congelada", "nuggets de frango", "ovos").\n- "id": o alimento da TABELA do mesmo tipo, NO ESTADO EM QUE É COMPRADO (arroz/feijão/carne/frango = cru; biscoito/salgadinho = industrializado; refrigerante = refrigerante). Se não houver nada do mesmo tipo, null. Não é comida (tempero em pó, utensílio, sacola): null.\n- "gramas": gramas de UMA unidade se o nome não disser (long neck 330, bandeja de 10 ovos 500, lata 350); null se vendido no peso.\nResponda só JSON: [{"n":1,"alimento":"...","id":123,"gramas":null}]` }],
        "Você casa produtos de supermercado brasileiro com uma tabela nutricional. Responda só JSON.",
        0,
        1500,
        opts,
      );
      const resp = new Map((JSON.parse(content.match(/\[[\s\S]*\]/)?.[0] ?? "[]") as { n: number; id: number | null; gramas: number | null }[]).map((r) => [r.n, r]));
      for (const [n, [chave]] of lote.entries()) {
        const r = resp.get(n + 1);
        const valido = r?.id != null && alimentos.some((a) => a.id === r.id) ? r.id : null;
        const g = r?.gramas;
        await prisma.produtoNutri.upsert({ where: { chave }, create: { chave, alimentoId: valido, gramas: g && g > 0 && g < 20000 ? g : null }, update: {} });
        if (valido) casados++;
      }
    } catch (e) {
      console.error("[nutri] não casou um lote:", e instanceof Error ? e.message.slice(0, 120) : e); // tenta de novo na próxima nota
    }
  }
  return casados;
}

/** Calorias e proteína compradas por semana (segunda-feira → valores), pela data da compra. */
export async function comprasNutriPorSemana(desde: Date, segunda: (d: Date) => Date) {
  const itens = await prisma.invoiceItem.findMany({
    where: { amount: { gt: 0 }, financeEntry: { OR: [{ purchaseDate: { gte: desde } }, { purchaseDate: null, date: { gte: desde } }] } },
    select: { name: true, quantity: true, category: true, financeEntry: { select: { purchaseDate: true, date: true } } },
  });
  const pares = new Map((await prisma.produtoNutri.findMany()).map((p) => [p.chave, p]));
  const alimentos = new Map((await prisma.alimento.findMany()).map((a) => [a.id, a]));
  const out = new Map<string, { kcal: number; proteina: number; itens: number; contados: number }>();
  for (const i of itens) {
    if (NAO_COMIDA.has(normalizeItemCategory(i))) continue;
    const k = segunda(i.financeEntry.purchaseDate ?? i.financeEntry.date).toISOString().slice(0, 10);
    const s = out.get(k) ?? { kcal: 0, proteina: 0, itens: 0, contados: 0 };
    s.itens++;
    const par = pares.get(productKey(i.name));
    const al = par?.alimentoId != null ? alimentos.get(par.alimentoId) : null;
    const g = al ? gramasDoItem(i, par?.gramas ?? null) : null;
    // Refrigerante zero/diet casa com o "tipo cola" normal, mas não tem caloria.
    const zero = /\b(zero|diet)\b/i.test(i.name);
    if (al && g != null) {
      s.kcal += zero ? 0 : (al.kcal * g) / 100;
      s.proteina += (al.proteina * g) / 100;
      s.contados++;
    }
    out.set(k, s);
  }
  return out;
}
