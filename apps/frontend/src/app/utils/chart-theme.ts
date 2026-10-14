import { Chart } from 'chart.js/auto';

/**
 * Chart.js cannot read CSS custom properties, so we resolve the design-system
 * tokens (src/styles.css) at render time. Re-render charts on the
 * `themechange` window event (dispatched by ThemeService) to follow dark mode.
 */
export function cssVar(name: string, fallback = ''): string {
  if (typeof window === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

/** Categorical series palette (--chart-1 … --chart-6). */
export function chartPalette(): string[] {
  return [1, 2, 3, 4, 5, 6].map((i) => cssVar(`--chart-${i}`, '#5f63f2'));
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
}

export function chartTokens(): ChartTokens {
  return {
    text: cssVar('--color-text', '#121722'),
    muted: cssVar('--chart-axis', '#6b7484'),
    grid: cssVar('--chart-grid', '#eef0f3'),
    surface: cssVar('--color-surface', '#ffffff'),
    border: cssVar('--color-border', '#e2e5ea'),
    primary: cssVar('--chart-1', '#5f63f2'),
    success: cssVar('--color-success', '#15803d'),
    warning: cssVar('--color-warning', '#d97706'),
    danger: cssVar('--color-danger', '#dc2626'),
    palette: chartPalette(),
  };
}

/** Apply token-driven global defaults (font, colours, tooltip) to Chart.js. */
export function applyChartDefaults(): ChartTokens {
  const t = chartTokens();
  Chart.defaults.font.family = cssVar('--font-sans', 'Inter, sans-serif');
  Chart.defaults.font.size = 12;
  Chart.defaults.color = t.muted;
  Chart.defaults.borderColor = t.grid;
  const tooltip = Chart.defaults.plugins.tooltip;
  tooltip.backgroundColor = cssVar('--gray-900', '#121722');
  tooltip.titleColor = '#ffffff';
  tooltip.bodyColor = '#e2e5ea';
  tooltip.borderColor = 'rgba(255,255,255,0.08)';
  tooltip.borderWidth = 1;
  tooltip.padding = 10;
  tooltip.cornerRadius = 8;
  tooltip.boxPadding = 4;
  Chart.defaults.plugins.legend.labels.usePointStyle = true;
  Chart.defaults.plugins.legend.labels.pointStyle = 'circle';
  Chart.defaults.plugins.legend.labels.boxWidth = 8;
  Chart.defaults.plugins.legend.labels.boxHeight = 8;
  return t;
}
