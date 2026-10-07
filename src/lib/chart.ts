/**
 * Gráfico de barras horizontais como PNG, para mandar no WhatsApp.
 * Desenha um SVG na mão e converte com o sharp (já vem com o Next). O texto
 * usa DejaVu Sans — o Dockerfile instala a fonte no container (Alpine não
 * vem com nenhuma, e sem fonte o texto some da imagem). Emoji não renderiza
 * no SVG: use só texto no título/legenda.
 */
export interface ChartBar {
  label: string;
  value: number;
  /** Valor de comparação (ex: mês anterior), desenhado como marca fina. */
  compare?: number;
  /** Cor fixa da barra (senão, a paleta em sequência). */
  color?: string;
  /** Texto ao lado da barra (senão, o valor em R$). */
  valueLabel?: string;
}

const COLORS = ["#7c6dff", "#2fb380", "#f2a541", "#e5606a", "#3fa7d6", "#a26bd8", "#8c9aa8"];

const escapeXml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const brl = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function barChartSvg(title: string, subtitle: string, bars: ChartBar[], compareLabel?: string): string {
  const width = 800;
  const left = 230;
  const barHeight = 34;
  const gap = 18;
  const top = 110;
  const items = bars.slice(0, 8);
  // Espaço à direita para o texto do valor (~10px por caractere na fonte 17).
  const right = Math.max(170, ...items.map((b) => (b.valueLabel ?? "").length * 10 + 30));
  const height = top + items.length * (barHeight + gap) + (compareLabel ? 60 : 30);
  // A escala segue os valores do mês; uma comparação muito maior (ex: a
  // entrada de R$ 12 mil da scooter no mês anterior) é cortada na borda com o
  // valor escrito, em vez de achatar todas as barras.
  const maxValue = Math.max(1, ...items.map((b) => b.value));
  const maxCompare = Math.max(0, ...items.map((b) => b.compare ?? 0));
  const max = Math.max(maxValue, Math.min(maxCompare, maxValue * 1.5));
  const scale = (v: number) => (Math.min(v, max) / max) * (width - left - right);

  const rows = items
    .map((b, i) => {
      const y = top + i * (barHeight + gap);
      const w = Math.max(2, scale(b.value));
      const label = b.label.length > 26 ? `${b.label.slice(0, 25)}…` : b.label;
      const clipped = (b.compare ?? 0) > max;
      const compare =
        b.compare !== undefined && b.compare > 0
          ? `<rect x="${left + scale(b.compare) - 2}" y="${y - 4}" width="4" height="${barHeight + 8}" rx="2" fill="#1f2430" opacity="0.55"/>${
              clipped
                ? `<text x="${left + scale(b.compare) - 8}" y="${y - 8}" text-anchor="end" font-size="13" fill="#5b6270">${escapeXml(`${brl(b.compare)} ▸`)}</text>`
                : ""
            }`
          : "";
      return `
    <text x="${left - 14}" y="${y + barHeight / 2 + 6}" text-anchor="end" font-size="18" fill="#1f2430">${escapeXml(label)}</text>
    <rect x="${left}" y="${y}" width="${w}" height="${barHeight}" rx="6" fill="${b.color ?? COLORS[i % COLORS.length]}"/>
    ${compare}
    <text x="${left + Math.max(w, b.compare && !clipped ? scale(b.compare) : 0) + 12}" y="${y + barHeight / 2 + 6}" font-size="17" font-weight="bold" fill="#1f2430">${escapeXml(b.valueLabel ?? brl(b.value))}</text>`;
    })
    .join("");

  const legend = compareLabel
    ? `<rect x="${left}" y="${height - 38}" width="4" height="18" rx="2" fill="#1f2430" opacity="0.55"/>
    <text x="${left + 12}" y="${height - 24}" font-size="15" fill="#5b6270">${escapeXml(compareLabel)}</text>`
    : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="DejaVu Sans, Arial, sans-serif">
  <rect width="100%" height="100%" fill="#ffffff"/>
  <text x="32" y="48" font-size="28" font-weight="bold" fill="#1f2430">${escapeXml(title)}</text>
  <text x="32" y="80" font-size="18" fill="#5b6270">${escapeXml(subtitle)}</text>
  ${rows}
  ${legend}
</svg>`;
}

export async function barChartPng(title: string, subtitle: string, bars: ChartBar[], compareLabel?: string): Promise<Buffer> {
  const sharp = (await import("sharp")).default;
  return sharp(Buffer.from(barChartSvg(title, subtitle, bars, compareLabel)), { density: 144 }).png().toBuffer();
}

export interface ProgressBar {
  label: string;
  current: number;
  target: number;
  color?: string;
}

/** Barras de progresso das metas (trilho cinza + preenchimento até a %). */
export function progressChartSvg(title: string, goals: ProgressBar[]): string {
  const width = 800;
  const rowHeight = 108;
  const top = 96;
  const items = goals.slice(0, 6);
  const height = top + items.length * rowHeight + 20;
  const trackX = 32;
  const trackW = width - 64;

  const rows = items
    .map((g, i) => {
      const y = top + i * rowHeight;
      const pct = g.target > 0 ? Math.min(1, g.current / g.target) : 0;
      const done = g.current >= g.target;
      const color = g.color || COLORS[i % COLORS.length];
      const status = done ? "Conquistada!" : `${(pct * 100).toFixed(0)}%`;
      return `
    <text x="${trackX}" y="${y}" font-size="20" font-weight="bold" fill="#1f2430">${escapeXml(g.label)}</text>
    <text x="${trackX + trackW}" y="${y}" text-anchor="end" font-size="18" font-weight="bold" fill="${done ? "#2fb380" : "#1f2430"}">${escapeXml(status)}</text>
    <rect x="${trackX}" y="${y + 14}" width="${trackW}" height="26" rx="13" fill="#e8eaf0"/>
    <rect x="${trackX}" y="${y + 14}" width="${Math.max(26, trackW * pct)}" height="26" rx="13" fill="${color}"/>
    <text x="${trackX}" y="${y + 64}" font-size="16" fill="#5b6270">${escapeXml(`${brl(g.current)} de ${brl(g.target)}`)}${done ? "" : escapeXml(` · faltam ${brl(g.target - g.current)}`)}</text>`;
    })
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="DejaVu Sans, Arial, sans-serif">
  <rect width="100%" height="100%" fill="#ffffff"/>
  <text x="32" y="52" font-size="28" font-weight="bold" fill="#1f2430">${escapeXml(title)}</text>
  ${rows}
</svg>`;
}

export async function progressChartPng(title: string, goals: ProgressBar[]): Promise<Buffer> {
  const sharp = (await import("sharp")).default;
  return sharp(Buffer.from(progressChartSvg(title, goals)), { density: 144 }).png().toBuffer();
}
