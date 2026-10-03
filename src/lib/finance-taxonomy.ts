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
    "Transporte": ["Uber/Taxi", "Combustível", "Veículo", "Manutenção veículo", "Seguro", "Transporte público"],
    "Saúde": ["Farmácia", "Plano de saúde", "Consultas"],
    // "Assinaturas" = cobrança que se repete todo mês: o sistema projeta os
    // próximos meses só para esta categoria (ver isRecurring/projeção).
    "Assinaturas": ["Streaming", "Apps/Softwares", "Academia"],
    "Compras": ["Eletrônicos", "Casa", "Roupas", "Online"],
    "Pessoal": ["Lazer", "Beleza/Cuidados", "Presentes"],
    "Educação": ["Cursos", "Livros", "Mensalidade"],
    "Impostos e taxas": ["IOF", "IR", "IPVA", "Tarifas bancárias", "Juros", "Empréstimos"],
    "Família": ["Mesada", "Gastos com filhos"],
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
  continua na categoria do produto (parcela da moto = Transporte › Veículo; celular ou
  teclado = Compras › Eletrônicos). "Impostos e taxas" só para IOF, juros, tarifas,
  impostos e empréstimos.
- Exemplos: Uber/99 = Transporte › Uber/Taxi; farmácia = Saúde › Farmácia; academia =
  Assinaturas › Academia (cobrança mensal); Spotify/Netflix = Assinaturas › Streaming; Claude/ChatGPT/hospedagem
  de site = Assinaturas › Apps/Softwares; IOF de compra internacional = Impostos e taxas › IOF;
  marmita/restaurante/bar = Alimentação › Restaurantes; iFood = Alimentação › Delivery;
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
