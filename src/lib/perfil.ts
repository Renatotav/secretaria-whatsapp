import { prisma } from "./prisma";
import { normalizaPerfil, type PerfilFinanceiro } from "./finance-taxonomy";

// Perfil financeiro desta instalação (AgentConfig.perfilFinanceiro), guardado em
// memória para os prompts, que são montados sem esperar o banco.
let atual: PerfilFinanceiro = {};

export const perfil = (): PerfilFinanceiro => atual;

/** Relê do banco; chamado antes de rotear cada mensagem. Erro mantém o último perfil lido. */
export async function carregarPerfil(): Promise<PerfilFinanceiro> {
  try {
    const c = await prisma.agentConfig.findFirst({ select: { perfilFinanceiro: true } });
    atual = normalizaPerfil(c?.perfilFinanceiro);
  } catch (err) {
    console.error("[perfil] não consegui ler o perfil financeiro", err);
  }
  return atual;
}
