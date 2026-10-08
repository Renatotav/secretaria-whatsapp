// Dados pessoais nos chamados do trabalho: o CPF vira xxx.xxx.xxx-xx e
// telefone/e-mail saem antes de gravar (regra do Renato, 08/10/2026).
// Número de processo CNJ (NNNNNNN-DD.AAAA.J.TR.OOOO) não é mexido.

const CNJ = /\d{7}-?\d{2}\.?\d{4}\.?\d\.?\d{2}\.?\d{4}/g;

export function maskPersonalData(text: string): string {
  if (!text) return "";
  // Protege os números de processo antes de procurar CPF/telefone.
  const saved: string[] = [];
  let t = text.replace(CNJ, (m) => {
    saved.push(m);
    return `\u0000${saved.length - 1}\u0000`;
  });
  t = t
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "[e-mail removido]")
    .replace(/(?<![\d.\-])\d{3}\.?\d{3}\.?\d{3}-?\d{2}(?![\d.\-])/g, "xxx.xxx.xxx-xx")
    .replace(/(\+?55\s?)?\(?\b\d{2}\)?\s?9?\d{4}[-\s]?\d{4}\b/g, "[telefone removido]");
  return t.replace(/\u0000(\d+)\u0000/g, (_m, i) => saved[Number(i)]);
}

/** Número do chamado como chave: maiúsculo, sem espaços. */
export function normalizeTicketId(raw: string): string {
  return (raw || "").toUpperCase().replace(/\s+/g, "");
}
