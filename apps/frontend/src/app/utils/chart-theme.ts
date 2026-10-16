import { Chart } from 'chart.js/auto';

/**
 * Chart.js cannot read CSS custom properties, so we resolve the design-system
 * tokens (src/styles.css) at render time. Re-render charts on the
 * `themechange` window event (dispatched by ThemeService) to follow dark mode.
 *
 * Precision chart rules: Giriş = --chart-1, Çıkış = --chart-2; bars ≤ 14px with
 * 1px (near-square) tops; dashed grid in --chart-grid; 11px mono axis text in --chart-axis;
 * pop-style tooltip; a legend + summary numbers above every chart; no dual axes.
 */
export function cssVar(name: string, fallback = ''): string {
  if (typeof window === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

/** Categorical series palette (--chart-1 … --chart-6). */
export function chartPalette(): string[] {
  return [1, 2, 3, 4, 5, 6].map((i) => cssVar(`--chart-${i}`, '#0041ff'));
}

/** Adds alpha to a #rrggbb colour. */
export function withAlpha(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

export interface ChartTokens {
  text: string;
  muted: string;
  grid: string;
  surface: string;
  border: string;
  primary: string;
  success: string;
  warning: string;
  danger: string;
  palette: string[];
  fontSans: string;
  fontMono: string;
}

export function chartTokens(): ChartTokens {
  return {
    text: cssVar('--fg', '#0a0a0a'),
    muted: cssVar('--chart-axis', '#666666'),
    grid: cssVar('--chart-grid', '#ebebeb'),
    surface: cssVar('--surface', '#ffffff'),
    border: cssVar('--line-2', '#dcdcdc'),
    primary: cssVar('--chart-1', '#0041ff'),
    success: cssVar('--success-dot', '#16a34a'),
    warning: cssVar('--warning-dot', '#e08a0b'),
    danger: cssVar('--danger-dot', '#e11d48'),
    palette: chartPalette(),
    fontSans: cssVar('--font-sans', 'Inter, sans-serif'),
    fontMono: cssVar('--font-mono', 'JetBrains Mono, monospace'),
  };
}

/** Bar dataset defaults for the Precision look (spread into a dataset). */
export const PRECISION_BAR = { maxBarThickness: 14, borderRadius: { topLeft: 1, topRight: 1 }, borderSkipped: 'bottom' as const, categoryPercentage: 0.7, barPercentage: 0.9 };

/** Scale defaults: dashed grid, 11px mono ticks, no axis border. */
export function precisionScale(t: ChartTokens = chartTokens()) {
  return {
    border: { display: false },
    grid: { color: t.grid, drawTicks: false, tickBorderDash: [3, 3] },
    ticks: { color: t.muted, padding: 6, font: { family: t.fontMono, size: 11 } },
  };
}

/** Apply token-driven global defaults (font, colours, tooltip) to Chart.js. */
export function applyChartDefaults(): ChartTokens {
  const t = chartTokens();
  Chart.defaults.font.family = t.fontSans;
  Chart.defaults.font.size = 12;
  Chart.defaults.color = t.muted;
  Chart.defaults.borderColor = t.grid;
  const tooltip = Chart.defaults.plugins.tooltip;
  tooltip.backgroundColor = cssVar('--pop-bg', '#ffffff');
  tooltip.titleColor = t.text;
  tooltip.bodyColor = cssVar('--fg-2', '#3f3f3f');
  tooltip.borderColor = cssVar('--line-2', '#dcdcdc');
  tooltip.borderWidth = 1;
  tooltip.padding = 10;
  tooltip.cornerRadius = 5;
  tooltip.boxPadding = 4;
  tooltip.titleFont = { family: t.fontSans, size: 12, weight: 600 };
  tooltip.bodyFont = { family: t.fontSans, size: 12 };
  Chart.defaults.plugins.legend.labels.usePointStyle = true;
  Chart.defaults.plugins.legend.labels.pointStyle = 'rect';
  Chart.defaults.plugins.legend.labels.boxWidth = 8;
  Chart.defaults.plugins.legend.labels.boxHeight = 8;
  return t;
}
