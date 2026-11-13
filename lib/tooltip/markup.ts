/**
 * Chart tooltip markup, shared by the Highcharts formatters (which take an HTML
 * string) and the React chart tooltips. The look lives in the .br-tip classes
 * in app/globals.css: a name on top, an optional large figure, then muted
 * detail lines such as "Accounts: 1,184".
 */

export interface ChartTooltipLine {
  label?: string
  /** Drawn in the text colour at weight 500. */
  value: string
}

export interface ChartTooltipContent {
  title: string
  /** Fill of a small swatch before the title, tying the tooltip to its mark. */
  swatch?: string
  /** The large figure, used where the tooltip answers "how much". */
  lead?: string
  /** A muted unit after the large figure, as in "1,284 centres". */
  leadUnit?: string
  /** A muted line under the title, as in a map card's country. */
  subtitle?: string
  lines?: ChartTooltipLine[]
  variant?: "chart" | "card"
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

// Swatch fills come from our own palette; anything else is dropped rather than
// written into a style attribute.
const SAFE_COLOR = /^(#[0-9a-f]{3,8}|(rgb|hsl)a?\([\d\s.,%/a-z()-]+\))$/i

/** The HTML string for a chart or card tooltip. Every piece of text is escaped. */
export function chartTooltipHtml(content: ChartTooltipContent): string {
  const { title, swatch, lead, leadUnit, subtitle, lines = [], variant = "chart" } = content
  const swatchHtml = swatch && SAFE_COLOR.test(swatch)
    ? `<span class="br-tip-swatch" style="background:${swatch}"></span>`
    : ""
  const parts = [
    `<div class="br-tip-title">${swatchHtml}<span>${escapeHtml(title)}</span></div>`,
  ]
  if (subtitle) parts.push(`<div class="br-tip-sub">${escapeHtml(subtitle)}</div>`)
  if (lead) {
    const unit = leadUnit ? `<span class="br-tip-unit">${escapeHtml(leadUnit)}</span>` : ""
    parts.push(`<span class="br-tip-lead">${escapeHtml(lead)}${unit}</span>`)
  }
  if (lines.length) {
    const rows = lines
      .map(({ label, value }) =>
        label
          ? `<div class="br-tip-line">${escapeHtml(label)}: <b>${escapeHtml(value)}</b></div>`
          : `<div class="br-tip-line">${escapeHtml(value)}</div>`
      )
      .join("")
    parts.push(`<div class="br-tip-lines">${rows}</div>`)
  }
  return `<div class="br-tip br-tip-${variant}">${parts.join("")}</div>`
}

/**
 * Highcharts tooltip options for the shared surface: Highcharts draws nothing
 * itself (no box, border or shadow), and the formatter returns chartTooltipHtml.
 * `outside` renders it on the page so small chart cards never clip it.
 */
export const HIGHCHARTS_TOOLTIP_BASE = {
  useHTML: true,
  outside: true,
  backgroundColor: "transparent",
  borderWidth: 0,
  shadow: false,
  padding: 0,
  hideDelay: 100,
  animation: false,
  style: { pointerEvents: "none" },
} as const
