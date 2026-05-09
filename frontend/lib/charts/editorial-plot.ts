/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Editorial Jurisprudence chart styling — single source of truth for any
 * Plotly figure on the platform. Colours mirror the OKLCH tokens in
 * `frontend/app/globals.css`; we use the resolved hex values here because
 * Plotly needs concrete RGB, not CSS variables.
 *
 * See docs/reference/DESIGN.md.
 */

const FONT_SANS =
  'Geist, "Geist Sans", system-ui, -apple-system, "Segoe UI", sans-serif';

export const editorialPalette = {
  ink: '#1A1A2E',
  inkSoft: '#5A5A75',
  parchment: '#F5F1E8',
  parchmentDeep: '#EFE9D8',
  rule: '#C9C2B0',
  ruleStrong: '#A89F88',
  oxblood: '#8B1E3F',
  oxbloodDeep: '#6F1230',
  gold: '#B8954A',
  goldSoft: '#E8DCB8',
} as const;

/** Two-jurisdiction palette: ink (UK, established) + oxblood (PL, authority). */
export const editorialSeries = {
  uk: editorialPalette.ink,
  pl: editorialPalette.oxblood,
  ukSoft: editorialPalette.inkSoft,
  plSoft: editorialPalette.oxbloodDeep,
} as const;

/**
 * Monochromatic categorical ramp for >2 categories (pie, judgment-types).
 * Replaces the Tailwind rainbow palette.
 */
export const editorialCategorical: string[] = [
  editorialPalette.ink,
  editorialPalette.oxblood,
  editorialPalette.gold,
  editorialPalette.inkSoft,
  editorialPalette.oxbloodDeep,
  editorialPalette.ruleStrong,
  editorialPalette.goldSoft,
  editorialPalette.parchmentDeep,
];

/**
 * Base Plotly layout — meant to be spread into per-chart layouts.
 *
 * Contrast policy (per docs/reference/DESIGN.md §7): all chart-axis text
 * uses `--ink` rather than `--ink-soft` because Plotly tick labels render
 * at 12 px or smaller, where ink-soft drops below WCAG AA on parchment.
 * Axis lines and grid rules stay on the rule tokens — they are decorative.
 */
export const editorialPlotLayout: Record<string, any> = {
  paper_bgcolor: 'transparent',
  plot_bgcolor: 'transparent',
  font: {
    family: FONT_SANS,
    size: 13,
    color: editorialPalette.ink,
  },
  margin: { l: 68, r: 28, t: 12, b: 64 },
  xaxis: {
    color: editorialPalette.ink,
    gridcolor: editorialPalette.rule,
    zerolinecolor: editorialPalette.ruleStrong,
    linecolor: editorialPalette.ruleStrong,
    tickfont: { family: FONT_SANS, size: 12, color: editorialPalette.ink },
    title: { font: { family: FONT_SANS, size: 12, color: editorialPalette.ink } },
  },
  yaxis: {
    color: editorialPalette.ink,
    gridcolor: editorialPalette.rule,
    zerolinecolor: editorialPalette.ruleStrong,
    linecolor: editorialPalette.ruleStrong,
    tickfont: { family: FONT_SANS, size: 12, color: editorialPalette.ink },
    title: { font: { family: FONT_SANS, size: 12, color: editorialPalette.ink } },
  },
  legend: {
    orientation: 'h',
    y: -0.22,
    x: 0,
    xanchor: 'left',
    yanchor: 'top',
    font: { family: FONT_SANS, size: 12, color: editorialPalette.ink },
    bgcolor: 'rgba(0,0,0,0)',
  },
  hoverlabel: {
    bgcolor: editorialPalette.ink,
    bordercolor: editorialPalette.ink,
    font: { family: FONT_SANS, size: 12, color: editorialPalette.parchment },
  },
  bargap: 0.28,
  bargroupgap: 0.08,
  autosize: true,
};

export const editorialPlotConfig: Record<string, any> = {
  displayModeBar: false,
  responsive: true,
};
