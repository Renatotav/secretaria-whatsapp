// Lista ÚNICA de categorias/subcategorias do financeiro — usada pelo painel
// (seletor), pela IA (WhatsApp, fatura, nota fiscal) e pelos gráficos.
// Regra: a categoria é O QUE foi comprado, nunca COMO foi pago (compra
// parcelada no cartão continua sendo Transporte, Compras, etc.).

export const FINANCE_TAXONOMY_DATA: Record<"income" | "expense", Record<string, string[]>> = {
  income: {
    "Salário": ["Salário fixo", "Vale Alimentação", "Bônus"],
    "Renda Extra": ["Freelance", "Comissões", "Venda de produtos"],
    "Renda Passiva": ["Dividendos", "Rendimentos"],
    "Dinheiro em Conta": ["Nubank"],
    "Outros": ["Reembolso", "Restituição IR"],
  },
  expense: {
    "Moradia": ["Aluguel", "Condomínio", "Energia elétrica", "Água/Esgoto", "Internet", "Gás", "Plano de celular", "Manutenção da casa"],
    "Alimentação": ["Supermercado", "Restaurantes", "Delivery", "Padaria/Lanche"],
    // Scooter (elétrica) separada de Transporte, para ver quanto ela custa por
    // mês sem misturar com Uber. Sem "Combustível": recarga entra na luz.
    "Scooter": ["Entrada", "Parcela", "Seguro", "Manutenção/peças"],
    "Transporte": ["Uber/Taxi", "Transporte público"],
    "Saúde": ["Farmácia", "Plano de saúde", "Consultas"],
    // "Assinaturas" = cobrança que se repete todo mês: o sistema projeta os
    // próximos meses só para esta categoria (ver isRecurring/projeção).
    "Assinaturas": ["Streaming", "Apps/Softwares", "Academia"],
    "Compras": ["Eletrônicos", "Casa", "Roupas", "Online"],
    "Pessoal": ["Lazer", "Beleza/Cuidados", "Presentes"],
    // Gasto de vontade, com teto próprio (pedido dele, 22/10/2026): cerveja,
    // salgadinho, biscoito/bolacha, doce, delivery por impulso. Itens assim dentro da nota de
    // mercado também contam aqui (ver isBesteiraItem).
    "Besteira": ["Bebida alcoólica", "Salgadinho/Doces", "Delivery por vontade"],
    "Educação": ["Cursos", "Livros", "Mensalidade"],
    "Impostos e taxas": ["IOF", "IR", "IPVA", "Tarifas bancárias", "Juros", "Empréstimos"],
    "Outros": ["Imprevistos"],
  },
};

/** Texto da lista para o prompt da IA. */
export function taxonomyPrompt(): string {
  const fmt = (m: Record<string, string[]>) =>
    Object.entries(m).map(([cat, subs]) => `${cat} (${subs.join(", ")})`).join("; ");
  return `Categorias de RECEITA (income): ${fmt(FINANCE_TAXONOMY_DATA.income)}.
Categorias de DESPESA (expense): ${fmt(FINANCE_TAXONOMY_DATA.expense)}.
REGRAS:
- Use SEMPRE uma categoria E uma subcategoria desta lista (subcategoria nunca vazia).
- A categoria é O QUE foi comprado, nunca COMO foi pago: compra parcelada ou no cartão
  continua na categoria do produto (parcela da scooter = Scooter › Parcela; celular ou
  teclado = Compras › Eletrônicos). "Impostos e taxas" só para IOF, juros, tarifas,
  impostos e empréstimos.
- Exemplos: Uber/99 = Transporte › Uber/Taxi; MOVYX/scooter/moto elétrica = Scooter › Parcela; seguro
  da scooter = Scooter › Seguro; peças/acessórios da scooter ou moto = Scooter › Manutenção/peças; farmácia = Saúde › Farmácia; academia =
  Assinaturas › Academia (cobrança mensal); Spotify/Netflix = Assinaturas › Streaming; Claude/ChatGPT/hospedagem
  de site = Assinaturas › Apps/Softwares; IOF de compra internacional = Impostos e taxas › IOF;
  marmita/restaurante = Alimentação › Restaurantes; iFood = Alimentação › Delivery;
  cerveja/bebida alcoólica/bar/adega = Besteira › Bebida alcoólica; salgadinho, chocolate, doce, sorvete
  comprados à parte = Besteira › Salgadinho/Doces; se ele disser "besteira", use Besteira;
  Amazon/Mercado Livre = Compras (Eletrônicos, Casa, Roupas ou Online, pelo produto).
- Só use "Outros › Imprevistos" se nada da lista servir.`;
}

/**
 * "Loja" de uma descrição de fatura, para lembrar a categoria da mesma loja:
 * "DL*UBERRIDES" e "AMAZON BR - Parcela 8/10 (compra em 14/02) (previsto)" →
 * "DL*UBERRIDES" / "AMAZON BR".
 */
export function merchantKey(description: string): string {
  return description
    .replace(/\s*-?\s*Parcela \d+\/\d+.*$/i, "")
    .replace(/\s*\((previsto|recorrente|compra em [^)]*)\)/gi, "")
    .replace(/\s*·\s*cartão final \d{4}$/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

/**
 * Item de nota fiscal que conta como Besteira (bebida alcoólica, salgadinho,
 * chocolate, doce, sorvete), pela categoria que a leitura deu ou pelo nome.
 */
export function isBesteiraItem(i: { name: string; category: string }): boolean {
  const n = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (/besteira|(?<!nao )alcoolic|cervej|destilad|vinho|salgadinh|petisco|biscoito|bolacha|chocolate|\bdoces?\b|sorvete|snack/.test(n(i.category))) return true;
  return /\b(cerv|cerveja|heineken|brahma|skol|budweiser|amstel|stella|corona|spaten|eisenbahn|vinho|vodka|whisky|whiskey|cachaca|gin|licor|espumante)\b|chips|doritos|ruffles|pringles|cheetos|fandangos|pippos|salgadinho|\bbisc\b|biscoito|bolacha|cookie|wafer|piraque|club social|chocolate|bombom|sorvete|picole/.test(n(i.name));
}

/**
 * Subcategorias FIXAS dos itens de nota (pedido dele, 23/10/2026: a IA
 * inventava "Petiscos", "Essenciais", "Enlatados"… para coisas iguais).
 * Vale para as notas novas (gravado assim) e para as antigas (na hora de mostrar).
 */
export const ITEM_CATEGORIES = ["Carnes", "Frios e laticínios", "Hortifruti", "Padaria", "Mercearia", "Congelados", "Bebidas", "Besteira", "Limpeza", "Higiene e beleza", "Descontos"] as const;

export function normalizeItemCategory(i: { name: string; category: string; amount?: number }): string {
  if (isBesteiraItem(i)) return "Besteira";
  const c = i.category.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (/desconto|ajuste|acrescimo/.test(c) || (i.amount ?? 0) < 0) return "Descontos";
  if (/carne|acougue|frango|peixe|bovin|suin/.test(c)) return "Carnes";
  if (/latic|frio|queijo|iogurte|leite/.test(c)) return "Frios e laticínios";
  if (/hortifruti|fruta|verdura|legume/.test(c)) return "Hortifruti";
  if (/padaria|panifica|paes|pao/.test(c)) return "Padaria";
  if (/congelad|salgados/.test(c)) return "Congelados";
  if (/bebida|refrigerante|suco|agua/.test(c)) return "Bebidas";
  if (/limpeza/.test(c)) return "Limpeza";
  if (/higiene|beleza|cuidado|perfum|cosmetic/.test(c)) return "Higiene e beleza";
  if (/mercearia|enlatad|tempero|condiment|essenciais|basico|alimento|alimentacao|biscoito|graos|massa|cereal|processad/.test(c)) return "Mercearia";
  return ITEM_CATEGORIES.find((x) => x.toLowerCase() === i.category.toLowerCase()) ?? "Mercearia";
}

/**
 * Desconto da nota (linha negativa, ex.: "Desconto da Nota −23,02") espalhado
 * entre os itens da MESMA nota, na proporção do valor de cada um: cada produto
 * fica com o preço pago de verdade e a linha de desconto some. O total da nota
 * não muda. Recebe os itens de uma nota só.
 */
export function spreadDiscount<T extends { amount: number; unitPrice?: number; name?: string }>(items: T[]): T[] {
  // Linha de ajuste = desconto (negativo) ou "Ajuste / Acréscimo" da nota.
  // "Itens não lidos" não é ajuste: é compra que a foto não mostrou.
  const ajuste = (i: T) => i.amount < 0 || /ajuste|acr[eé]scimo|desconto/i.test(i.name ?? "");
  const pos = items.filter((i) => !ajuste(i) && i.amount > 0);
  const delta = items.filter(ajuste).reduce((a, i) => a + i.amount, 0);
  const somaPos = pos.reduce((a, i) => a + i.amount, 0);
  if (!items.some(ajuste) || somaPos <= 0) return items;
  const f = Math.max(0, (somaPos + delta) / somaPos);
  return pos.map((i) => ({ ...i, amount: Math.round(i.amount * f * 100) / 100, ...(i.unitPrice ? { unitPrice: Math.round(i.unitPrice * f * 100) / 100 } : {}) }));
}
