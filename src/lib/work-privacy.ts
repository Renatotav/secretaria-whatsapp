// Dados pessoais nos chamados do trabalho: o CPF vira xxx.xxx.xxx-xx e
// telefone/e-mail saem antes de gravar (regra do Renato, 08/10/2026).
// Número de processo CNJ (NNNNNNN-DD.AAAA.J.TR.OOOO) não é mexido.

const CNJ = /\d{7}-?\d{2}\.?\d{4}\.?\d\.?\d{2}\.?\d{4}/g;

// Erro corrigido (16/10/2026): a regra antiga achava que QUALQUER número de 10–11
// dígitos era telefone ou CPF — e apagava nº de chamado do GLPI, ID de documento
// e de processo. Agora só é telefone/CPF o que tem cara disso.
const CPF_RE = /(?<!\d)(?<!\d[.-])\d{3}[.\s]?\d{3}[.\s]?\d{3}[-\s]?\d{2}(?!\d)(?![.-]\d)/g;
const TEL_RE = /(?<!\d)(?:\+?55[\s.-]?)?\(?\d{2}\)?[\s.-]?9?\d{4}[\s.-]{0,3}\d{4}(?!\d)/g;
const EMAIL_RE = /[\w.+-]+@[\w-]+(\.[\w-]+)+/g;
/** Logo antes do número vem um rótulo de identificador (não é dado pessoal). */
const ROTULO_ID = /(?:\bid\b|glpi|chamado|protocolo|documento|\bdoc\b|processo|evento|matr[ií]cula|redmine|ticket|ramal|c[oó]digo|oab|pedido|registro|n[º°]|\bn\.)\s*(?:interno|externo|do\s+\w+|n[º°o]?)?\W{0,4}$/i;
/** Palavra de telefone por perto ("Fone:", "Cel:", "contato com Fulano …"). */
const PERTO_DE_TEL = /(?:tel|fone|celular|\bcel\b|whats|zap|contato|\bliga|telefone|ramal\s+e\s+cel)[^\n]{0,40}$/i;

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
const antes = (full: string, at: number, n: number) => full.slice(Math.max(0, at - n), at);
/** CPF formatado (000.000.000-00) é sempre CPF; número colado só com dígito certo e sem rótulo de ID. */
function ehCpf(m: string, full: string, at: number): boolean {
  if (/\d{3}\.\d{3}\.\d{3}-\d{2}/.test(m)) return true;
  if (ROTULO_ID.test(antes(full, at, 24))) return false;
  return cpfValido(m);
}
/** Telefone: +55, (DD), número separado por traço/espaço, ou palavra de telefone perto — nunca logo depois de rótulo de ID. */
function ehTelefone(m: string, full: string, at: number): boolean {
  if (ROTULO_ID.test(antes(full, at, 24))) return false;
  if (/^\+?55\D/.test(m) || /\(/.test(m) || /\d[\s.-]+\d/.test(m)) return true;
  return PERTO_DE_TEL.test(antes(full, at, 48));
}

/** Troca CPF/telefone/e-mail no texto (números de processo CNJ protegidos). */
function trocarDados(text: string, f: { cpf?: (m: string) => string; tel?: (m: string) => string; email?: (m: string) => string }): string {
  if (!text) return "";
  const saved: string[] = [];
  let t = text.replace(CNJ, (m) => {
    saved.push(m);
    return `\u0000${saved.length - 1}\u0000`;
  });
  if (f.email) t = t.replace(EMAIL_RE, (m) => f.email!(m));
  if (f.cpf) t = t.replace(CPF_RE, (m, off: number, full: string) => (ehCpf(m, full, off) ? f.cpf!(m) : m));
  if (f.tel) t = t.replace(TEL_RE, (m, off: number, full: string) => (ehTelefone(m, full, off) ? f.tel!(m) : m));
  return t.replace(/\u0000(\d+)\u0000/g, (_m, i) => saved[Number(i)]);
}

export function maskPersonalData(text: string): string {
  return trocarDados(text, { email: () => "[e-mail removido]", cpf: () => "xxx.xxx.xxx-xx", tel: () => "[telefone removido]" });
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
  const t = trocarDados(text, { email: marca, cpf: marca, tel: marca });
  return { text: t, count: vals.length, restore: (out: string) => out.replace(/⟦(\d+)⟧/g, (m, i) => vals[Number(i) - 1] ?? m) };
}

/** Só tira e-mail e telefone (o CPF fica): texto que vai para o Redmine — a TI usa o CPF. */
export function stripContacts(text: string): string {
  return trocarDados(text, { email: () => "[e-mail removido]", tel: () => "[telefone removido]" });
}

/** Número do chamado como chave: maiúsculo, sem espaços. */
export function normalizeTicketId(raw: string): string {
  return (raw || "").toUpperCase().replace(/\s+/g, "");
}
