import { prisma } from "./prisma";
import { routePersonalMessage } from "./personal-router";
import { runWorkSkill } from "./work-ai";

// Laboratório da IA: casos INVENTADOS (nada de dado real) com a resposta
// certa conhecida, para comparar modelos antes de trocar um. "testa a ia"
// roda os modelos atuais; "testa a ia com <modelo>" roda um candidato no
// lugar dos dois. ~15 chamadas pequenas (centavos).

type RouterCase = { text: string; type: string; amount?: number; paymentMethod?: string; financeType?: string };
const ROUTER_CASES: RouterCase[] = [
  { text: "almoço 32,50 no pix", type: "finance", amount: 32.5, paymentMethod: "pix" },
  { text: "gastei 120 no mercado no cartão", type: "finance", amount: 120, paymentMethod: "cartão" },
  { text: "uber 18 no débito", type: "finance", amount: 18, paymentMethod: "débito" },
  { text: "recebi 500 de um freela", type: "finance", amount: 500, financeType: "income" },
  { text: "padaria 9,90 no dinheiro", type: "finance", amount: 9.9, paymentMethod: "dinheiro" },
  { text: "me lembra de pagar a internet amanhã às 9h", type: "agenda_add" },
  { text: "o que eu tenho amanhã?", type: "agenda_query" },
  { text: "hoje foi um dia cansativo, fiquei meio triste", type: "diary" },
  { text: "posso comprar uma tv de 2000 em 10x?", type: "finance_simulation" },
  { text: "quanto gastei com alimentação esse mês?", type: "agenda_query" },
];

// Texto com erro de português + termos que não podem mudar.
type FixCase = { text: string; keep: string[]; fixed: string[] };
const FIX_CASES: FixCase[] = [
  { text: "o usuario nao consegue assinar o documento no processo 0201234-17.2025.8.06.0001, aparece erro na tarefa [Assinar decisão].", keep: ["0201234-17.2025.8.06.0001", "[Assinar decisão]"], fixed: ["usuário", "não"] },
  { text: "foi orientado a limpar o cache e tentar denovo, chamado 2510229876 continua aberto ate o retorno.", keep: ["2510229876"], fixed: ["de novo", "até"] },
  { text: "a servidora informou que o processo 3004567-28.2024.8.06.1234 sumiu da caixa [Minutar sentença] apos a redistribuicao.", keep: ["3004567-28.2024.8.06.1234", "[Minutar sentença]"], fixed: ["após", "redistribuição"] },
  { text: "verifiquei no Assyst e no Redmine 45678 que o erro ja foi corrigido na versao nova do PJe.", keep: ["Assyst", "Redmine 45678", "PJe"], fixed: ["já", "versão"] },
  { text: "o advogado nao consegue peticionar no 0012345-37.2025.8.06.0112 pois o botao [Juntar documentos] nao aparece.", keep: ["0012345-37.2025.8.06.0112", "[Juntar documentos]"], fixed: ["não", "botão"] },
];

const DOLAR = 5.5; // conversão aproximada só para mostrar em reais

async function precos(): Promise<Map<string, { in: number; out: number }>> {
  const r = await fetch("https://openrouter.ai/api/v1/models", { signal: AbortSignal.timeout(15000) }).catch(() => null);
  const j = (await r?.json().catch(() => null)) as { data?: { id: string; pricing?: { prompt?: string; completion?: string } }[] } | null;
  return new Map((j?.data ?? []).map((m) => [m.id, { in: Number(m.pricing?.prompt) || 0, out: Number(m.pricing?.completion) || 0 }]));
}

const ms = (t: number) => `${(t / 1000).toFixed(1).replace(".", ",")} s`;
const reais = (usd: number) => `R$ ${(usd * DOLAR).toFixed(4).replace(".", ",")}`;

export async function runAiLab(candidate?: string): Promise<string> {
  const config = await prisma.agentConfig.findFirst();
  if (!config?.openrouterApiKey) return "🧪 Sem chave da OpenRouter configurada.";
  const routerModel = candidate || config.openrouterModel;
  const fixModel = candidate || config.workAiModel;
  const tabela = await precos();

  // 1) Entender mensagens (o roteador).
  let okRouter = 0;
  const erradas: string[] = [];
  const t0 = Date.now();
  for (const c of ROUTER_CASES) {
    try {
      const r = (await routePersonalMessage(c.text, "Renato", { aiProvider: "openrouter", openrouterApiKey: config.openrouterApiKey, openrouterModel: routerModel }, "", config.systemPrompt, 10, 4)) as Record<string, unknown>;
      const certo =
        r.type === c.type &&
        (c.amount === undefined || Math.abs(Number(r.amount) - c.amount) < 0.01) &&
        (c.paymentMethod === undefined || r.paymentMethod === c.paymentMethod) &&
        (c.financeType === undefined || r.financeType === c.financeType);
      if (certo) okRouter++;
      else erradas.push(`"${c.text}" → ${String(r.type)}${r.amount != null ? ` ${r.amount}` : ""}${r.paymentMethod ? ` ${r.paymentMethod}` : ""}`);
    } catch (e) {
      erradas.push(`"${c.text}" → erro: ${e instanceof Error ? e.message.slice(0, 60) : "?"}`);
    }
  }
  const tRouter = Date.now() - t0;

  // 2) Corretor do trabalho (termos intocáveis + correção feita).
  let okFix = 0, tokIn = 0, tokOut = 0;
  const falhas: string[] = [];
  const t1 = Date.now();
  for (const [i, c] of FIX_CASES.entries()) {
    try {
      const r = await runWorkSkill("corrigir", c.text, undefined, true, candidate ? { model: candidate } : undefined);
      tokIn += r.tokens.input;
      tokOut += r.tokens.output;
      const faltou = c.keep.filter((k) => !r.text.includes(k));
      const naoCorrigiu = c.fixed.filter((f) => !r.text.toLowerCase().includes(f.toLowerCase()));
      if (!faltou.length && !naoCorrigiu.length) okFix++;
      else falhas.push(`texto ${i + 1}: ${faltou.length ? `mudou ${faltou.join(", ")}` : ""}${faltou.length && naoCorrigiu.length ? "; " : ""}${naoCorrigiu.length ? `não corrigiu ${naoCorrigiu.join(", ")}` : ""}`);
    } catch (e) {
      falhas.push(`texto ${i + 1}: ${e instanceof Error ? e.message.slice(0, 80) : "erro"}`);
    }
  }
  const tFix = Date.now() - t1;
  const p = tabela.get(fixModel);
  const custoFix = p ? tokIn * p.in + tokOut * p.out : null;

  return [
    `🧪 *Laboratório da IA*${candidate ? ` — testando ${candidate}` : " — modelos atuais"}`,
    "",
    `*Entender mensagens* (${routerModel})`,
    `${okRouter === ROUTER_CASES.length ? "🟢" : okRouter >= ROUTER_CASES.length - 1 ? "🟡" : "🔴"} ${okRouter}/${ROUTER_CASES.length} certas · ${ms(tRouter / ROUTER_CASES.length)} por mensagem`,
    ...erradas.slice(0, 5).map((e) => `  ✗ ${e}`),
    "",
    `*Corretor do trabalho* (${fixModel})`,
    `${okFix === FIX_CASES.length ? "🟢" : okFix >= FIX_CASES.length - 1 ? "🟡" : "🔴"} ${okFix}/${FIX_CASES.length} perfeitos · ${ms(tFix / FIX_CASES.length)} por texto${custoFix != null ? ` · ${reais(custoFix / FIX_CASES.length)} por texto` : ""}`,
    ...falhas.slice(0, 5).map((f) => `  ✗ ${f}`),
    "",
    "Textos inventados (nada real). Para comparar: *testa a ia com <modelo>*.",
  ].join("\n");
}

/** "testa a ia" / "laboratório da ia" / "testa a ia com google/gemini-3.1-flash-lite". */
export async function applyAiLabCommand(text: string, notify: (t: string) => Promise<void>): Promise<string | null> {
  const m = text.trim().match(/^(?:testa(?:r)?\s+a\s+ia|laborat[oó]rio\s+da\s+ia)(?:\s+com\s+([\w./:-]+))?\s*[.!?]?$/i);
  if (!m) return null;
  await notify(`🧪 Rodando o laboratório${m[1] ? ` com ${m[1]}` : ""}… (uns 30 s, custo de centavos)`);
  return runAiLab(m[1]);
}
