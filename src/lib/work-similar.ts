import { prisma } from "./prisma";

// Chamados parecidos, sem IA: palavras em comum (sem acento e sem palavras
// vazias) entre o texto novo e o que a Central já tem. Serve para avisar
// Redmine repetido e para mostrar "como resolvi parecidos".

const VAZIAS = new Set(
  "a o e de da do das dos em no na nos nas um uma uns umas para por com sem que se ao aos as os foi ser esta está estao estão nao não sim mais muito ja já tambem também ou como quando onde qual quais seu sua seus suas meu minha ele ela eles elas isso este esse essa aquele usuario usuário relata informa processo processos chamado erro sistema pje favor verificar solicita".split(" ")
);
const palavras = (t: string) =>
  new Set(
    (t || "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/\d{7}-?\d{2}\.?\d{4}\.?\d\.?\d{2}\.?\d{4}/g, " ") // número de processo não conta
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 3 && !VAZIAS.has(w))
  );
function parecenca(a: Set<string>, b: Set<string>) {
  if (!a.size || !b.size) return 0;
  let comum = 0;
  for (const w of a) if (b.has(w)) comum++;
  return comum / Math.min(a.size, b.size); // 1 = todas as palavras do menor estão no outro
}

/** Redmines já abertos que parecem o mesmo problema do texto (até 3). */
export async function redminesParecidos(texto: string) {
  const alvo = palavras(texto);
  if (alvo.size < 3) return [];
  const rows = await prisma.workTicket.findMany({
    where: { redmine: { not: "" } },
    select: { ticketId: true, redmine: true, redmineStatus: true, errorType: true, description: true, redmineText: true },
    take: 500,
    orderBy: { updatedAt: "desc" },
  });
  return rows
    .map((t) => ({ t, p: parecenca(alvo, palavras(`${t.errorType} ${t.description} ${t.redmineText}`)) }))
    .filter((x) => x.p >= 0.35)
    .sort((a, b) => b.p - a.p)
    .slice(0, 3)
    .map(({ t, p }) => ({ ticketId: t.ticketId, redmine: t.redmine, redmineStatus: t.redmineStatus, tipo: t.errorType, parecenca: Math.round(p * 100) }));
}
