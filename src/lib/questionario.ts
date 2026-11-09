// Respostas do questionário (docs/questionario-financeiro.md) → o que gravar numa
// instalação nova. Só monta o plano; quem grava é scripts/aplicar-questionario.ts.
import { normalizaPerfil, type PerfilFinanceiro } from "./finance-taxonomy";
import { isoDay } from "./finance-common";

export type Respostas = {
  nome: string;
  whatsapp: string;
  resumoDiario?: string;
  resumoSemanal?: string;
  cartao?: { nome?: string; vencimento: number; melhorDia: number };
  outrosCartoes?: { nome: string; vencimento: number; melhorDia: number }[];
  avisoFatura?: { nome?: string; whatsapp: string };
  perfil?: PerfilFinanceiro;
  salario?: { valor: number; dia: number };
  vale?: { valor: number; dia: number };
  contasFixas?: { nome: string; valor: number; dia: number; meio?: string; categoria: string; subcategoria?: string }[];
  tetos?: Record<string, number>;
  metas?: { nome: string; valor: number; atual?: number; prazo?: string }[];
};

type Lancamento = { type: "income" | "expense"; amount: number; category: string; subcategory: string; description: string; date: string; paymentMethod: string; account: string; status: "pending" };

const hora = (v: string | undefined, padrao: string) => (v && /^\d{2}:\d{2}$/.test(v) ? v : padrao);
const dia = (n: unknown) => typeof n === "number" && n >= 1 && n <= 31;

/** Próxima data com esse dia do mês (hoje conta), no formato AAAA-MM-DD. */
export function proximoDia(d: number, hoje: Date): string {
  const y = hoje.getFullYear(), m = hoje.getMonth();
  const ultimo = (yy: number, mm: number) => new Date(yy, mm + 1, 0).getDate();
  if (d >= hoje.getDate()) return isoDay(y, m, Math.min(d, ultimo(y, m)));
  const ny = m === 11 ? y + 1 : y, nm = (m + 1) % 12;
  return isoDay(ny, nm, Math.min(d, ultimo(ny, nm)));
}

export function planoDoQuestionario(r: Respostas, hoje: Date) {
  const erros: string[] = [];
  if (!r.nome?.trim()) erros.push("falta o nome");
  if (!/^\d{12,13}$/.test(r.whatsapp ?? "")) erros.push("whatsapp: só números com DDI e DDD (ex.: 5585999990000)");
  if (r.cartao && (!dia(r.cartao.vencimento) || !dia(r.cartao.melhorDia))) erros.push("cartão: vencimento e melhor dia entre 1 e 31");
  for (const c of r.outrosCartoes ?? []) if (!c.nome || !dia(c.vencimento) || !dia(c.melhorDia)) erros.push(`cartão "${c.nome || "?"}": nome, vencimento e melhor dia`);
  for (const c of r.contasFixas ?? []) if (!c.nome || !(c.valor > 0) || !dia(c.dia) || !c.categoria) erros.push(`conta "${c.nome || "?"}": nome, valor, dia e categoria`);
  if (r.salario && (!(r.salario.valor > 0) || !dia(r.salario.dia))) erros.push("salário: valor e dia");
  if (r.vale && (!(r.vale.valor > 0) || !dia(r.vale.dia))) erros.push("vale: valor e dia");

  // versao 1: instalação nova começa da lista genérica, não do jeito do Renato.
  const perfil = normalizaPerfil({ ...(r.perfil ?? {}), versao: 1, ...(r.cartao?.nome ? { cartaoPrincipal: r.cartao.nome } : {}) });
  const config = {
    ownerName: r.nome?.trim() ?? "",
    ownerPhone: r.whatsapp ?? "",
    summaryTime: hora(r.resumoDiario, "21:00"),
    weeklyTime: hora(r.resumoSemanal, "20:00"),
    creditCardDueDay: r.cartao?.vencimento ?? 10,
    creditCardBestDay: r.cartao?.melhorDia ?? 5,
    cardBillDays: (r.outrosCartoes ?? []).map((c) => ({ card: c.nome, due: c.vencimento, best: c.melhorDia })),
    invoiceBuddyName: r.avisoFatura?.nome ?? "",
    invoiceBuddyPhone: r.avisoFatura?.whatsapp ?? "",
    perfilFinanceiro: perfil,
  };

  // "(recorrente)": a importação projeta os próximos 11 meses sozinha.
  const lancamentos: Lancamento[] = [];
  if (r.salario) lancamentos.push({ type: "income", amount: r.salario.valor, category: "Salário", subcategory: "Salário fixo", description: "Salário (recorrente)", date: proximoDia(r.salario.dia, hoje), paymentMethod: "pix", account: "Principal", status: "pending" });
  if (r.vale) lancamentos.push({ type: "income", amount: r.vale.valor, category: "Salário", subcategory: "Vale Alimentação", description: "Crédito VR (recorrente)", date: proximoDia(r.vale.dia, hoje), paymentMethod: "ticket", account: "VR", status: "pending" });
  for (const c of r.contasFixas ?? []) {
    lancamentos.push({ type: "expense", amount: c.valor, category: c.categoria, subcategory: c.subcategoria ?? "", description: `${c.nome} (recorrente)`, date: proximoDia(c.dia, hoje), paymentMethod: c.meio ?? "pix", account: "Principal", status: "pending" });
  }

  const tetos = Object.entries(r.tetos ?? {}).filter(([, v]) => v > 0).map(([category, amount]) => ({ category, amount }));
  const metas = (r.metas ?? []).filter((m) => m.nome && m.valor > 0);
  return { erros, config, lancamentos, tetos, metas };
}
