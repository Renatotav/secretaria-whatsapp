import { prisma } from "./prisma";
import { choose } from "./jev";

// Grupo do erro de cada chamado, escolhido pelo Jev (modelo de decisão), para
// ver o que mais se repete. Os tipos de erro da planilha são frases livres;
// os grupos juntam os parecidos. Só grava com certeza ≥ 60%.

export const ERROR_GROUPS: Record<string, string> = {
  "MNI / integração": "consulta, peticionamento ou avisos via MNI; integração com MP/MPCE, Defensoria ou outros sistemas",
  "Peticionamento / protocolo": "petição, manifestação ou documento protocolado que não aparece nos autos; erro ao protocolar ou peticionar",
  "Processo não encontrado": "processo não encontrado ou inexistente na consulta",
  "Intimações e avisos": "intimações, citações, avisos pendentes, expedientes em duplicidade ou não recebidos, ciência",
  "Acesso, perfil e sigilo": "usuário sem acesso, perfil, permissão, cadastro de usuário, peças ou processos sigilosos, visualizadores",
  "Migração SAJ → PJe": "processo ou configuração após a migração do SAJ/e-SAJ para o PJe",
  "Assinatura / certificado": "assinatura digital, token, certificado, PJeOffice",
  "Dúvida negocial": "dúvida sobre regra de negócio, procedimento ou funcionamento do sistema, sem erro técnico",
  "Outros": "nenhum dos outros grupos",
};

const NO_GROUP = "Sem grupo"; // tentou e não teve certeza: não tenta de novo

function textOf(t: { errorType: string; description: string; chatLog: string; queue: string }) {
  // Categoria genérica do escala ("Erro/Falha · PJe1G") sozinha não diz qual é o erro.
  const type = /^erro\/falha/i.test(t.errorType) ? "" : t.errorType;
  return [type, t.description, t.chatLog.slice(-3000)].filter((x) => x && x.trim()).join("\n").slice(0, 6000);
}

export async function classifyTicketGroup(ticketId: string): Promise<string | null> {
  const t = await prisma.workTicket.findUnique({ where: { ticketId }, select: { errorType: true, description: true, chatLog: true, queue: true } });
  if (!t) return null;
  const text = textOf(t);
  if (text.length < 15) return null;
  const r = await choose(text, "Qual é o grupo do erro deste chamado de suporte do PJe?", ERROR_GROUPS, 0.6);
  const group = r?.choice ?? NO_GROUP;
  await prisma.workTicket.update({ where: { ticketId }, data: { errorGroup: group } });
  return group;
}

/** Agrupa aos poucos os chamados que têm texto e ainda não têm grupo (chamado pelo agendador). */
export async function classifyPendingGroups(limit = 5): Promise<number> {
  const pending = await prisma.workTicket.findMany({
    where: {
      errorGroup: "",
      OR: [{ description: { not: "" } }, { chatLog: { not: "" } }, { NOT: { errorType: { startsWith: "Erro/Falha" } }, errorType: { not: "" } }],
    },
    select: { ticketId: true },
    take: limit,
  });
  let n = 0;
  for (const p of pending) {
    try {
      if (await classifyTicketGroup(p.ticketId)) n++;
    } catch (err) {
      console.error("[trabalho] grupo do erro:", err instanceof Error ? err.message : err);
      break; // sem rede/crédito: tenta no próximo minuto
    }
  }
  return n;
}
