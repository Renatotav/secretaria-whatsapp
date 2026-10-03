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
}

const COLORS = ["#7c6dff", "#2fb380", "#f2a541", "#e5606a", "#3fa7d6", "#a26bd8", "#8c9aa8"];

const escapeXml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const brl = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function barChartSvg(title: string, subtitle: string, bars: ChartBar[], compareLabel?: string): string {
  const width = 800;
  const left = 230;
  const right = 170;
  const barHeight = 34;
  const gap = 18;
  const top = 110;
  const items = bars.slice(0, 8);
  const height = top + items.length * (barHeight + gap) + (compareLabel ? 60 : 30);
  const max = Math.max(1, ...items.map((b) => Math.max(b.value, b.compare ?? 0)));
  const scale = (v: number) => (v / max) * (width - left - right);

  const rows = items
    .map((b, i) => {
      const y = top + i * (barHeight + gap);
      const w = Math.max(2, scale(b.value));
      const label = b.label.length > 26 ? `${b.label.slice(0, 25)}…` : b.label;
      const compare =
        b.compare !== undefined && b.compare > 0
          ? `<rect x="${left + scale(b.compare) - 2}" y="${y - 4}" width="4" height="${barHeight + 8}" rx="2" fill="#1f2430" opacity="0.55"/>`
          : "";
      return `
    <text x="${left - 14}" y="${y + barHeight / 2 + 6}" text-anchor="end" font-size="18" fill="#1f2430">${escapeXml(label)}</text>
    <rect x="${left}" y="${y}" width="${w}" height="${barHeight}" rx="6" fill="${COLORS[i % COLORS.length]}"/>
    ${compare}
    <text x="${left + Math.max(w, b.compare ? scale(b.compare) : 0) + 12}" y="${y + barHeight / 2 + 6}" font-size="17" font-weight="bold" fill="#1f2430">${escapeXml(brl(b.value))}</text>`;
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
