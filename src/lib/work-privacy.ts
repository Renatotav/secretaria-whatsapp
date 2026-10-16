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
    // CPF com ou sem pontos/traço/espaços; o ponto final da frase não impede a máscara.
      .replace(/(?<!\d)(?<!\d[.-])\d{3}[.\s]?\d{3}[.\s]?\d{3}[-\s]?\d{2}(?!\d)(?![.-]\d)/g, "xxx.xxx.xxx-xx")
    // Telefone: aceita "85 98768 -5641", "(85) 98768-5641", "+55 85 9…" e o número colado "558598765641".
    .replace(/(?<!\d)(?:\+?55[\s.-]?)?\(?\d{2}\)?[\s.-]?9?\d{4}[\s.-]{0,3}\d{4}(?!\d)/g, "[telefone removido]");
  return t.replace(/\u0000(\d+)\u0000/g, (_m, i) => saved[Number(i)]);
}

/**
 * Para a IA corrigir/reescrever sem ver dado pessoal: CPF, telefone e e-mail
 * viram ⟦1⟧, ⟦2⟧… e voltam depois, idênticos. O texto dele fica intacto.
 */
export function protectPersonalData(text: string): { text: string; restore: (out: string) => string; count: number } {
  const vals: string[] = [];
  const marca = (m: string) => {
    let i = vals.indexOf(m);
    if (i < 0) i = vals.push(m) - 1;
    return `⟦${i + 1}⟧`;
  };
  const cnj: string[] = [];
  let t = (text || "").replace(CNJ, (m) => {
    cnj.push(m);
    return `\u0000${cnj.length - 1}\u0000`;
  });
  t = t
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, marca)
    .replace(/(?<!\d)(?<!\d[.-])\d{3}[.\s]?\d{3}[.\s]?\d{3}[-\s]?\d{2}(?!\d)(?![.-]\d)/g, marca)
    .replace(/(?<!\d)(?:\+?55[\s.-]?)?\(?\d{2}\)?[\s.-]?9?\d{4}[\s.-]{0,3}\d{4}(?!\d)/g, marca);
  t = t.replace(/\u0000(\d+)\u0000/g, (_m, i) => cnj[Number(i)]);
  return {
    text: t,
    count: vals.length,
    restore: (out: string) => out.replace(/⟦(\d+)⟧/g, (m, i) => vals[Number(i) - 1] ?? m),
  };
}

/** Dígitos verificadores do CPF. */
function cpfValido(raw: string): boolean {
  const d = raw.replace(/\D/g, "");
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const dv = (n: number) => {
    let soma = 0;
    for (let i = 0; i < n; i++) soma += Number(d[i]) * (n + 1 - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
}

/** Só tira e-mail e telefone (o CPF fica): texto que vai para o Redmine — a TI usa o CPF. */
export function stripContacts(text: string): string {
  if (!text) return "";
  const saved: string[] = [];
  let t = text.replace(CNJ, (m) => {
    saved.push(m);
    return `\u0000${saved.length - 1}\u0000`;
  });
  // CPF guardado antes do telefone (11 dígitos colados pareceriam celular).
  t = t.replace(/(?<!\d)(?<!\d[.-])\d{3}[.\s]?\d{3}[.\s]?\d{3}[-\s]?\d{2}(?!\d)(?![.-]\d)/g, (m) => {
    if (!cpfValido(m)) return m; // não é CPF (ex.: celular colado): o telefone sai logo abaixo
    saved.push(m);
    return `\u0000${saved.length - 1}\u0000`;
  });
  t = t
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "[e-mail removido]")
    .replace(/(?<!\d)(?:\+?55[\s.-]?)?\(?\d{2}\)?[\s.-]?9?\d{4}[\s.-]{0,3}\d{4}(?!\d)/g, "[telefone removido]");
  return t.replace(/\u0000(\d+)\u0000/g, (_m, i) => saved[Number(i)]);
}

/** Número do chamado como chave: maiúsculo, sem espaços. */
export function normalizeTicketId(raw: string): string {
  return (raw || "").toUpperCase().replace(/\s+/g, "");
}
