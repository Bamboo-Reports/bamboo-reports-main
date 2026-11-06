import {
  buildSummaryReportFilename,
  formatSharePercent,
  type ReportChart,
  type ReportChartGroup,
  type ReportFilterGroup,
  type ReportFilterRow,
  type SummaryReportModel,
} from "@/lib/reports/summary-report"
import { DONUT_CHART_COLORS } from "@/lib/utils/chart-helpers"

/**
 * Renders a SummaryReportModel to an A4 PDF and triggers a browser download.
 * jsPDF and the autotable-free layout are imported lazily so they stay out of
 * the dashboard bundle until someone asks for a report.
 *
 * The report follows the app: DM Sans, grey chrome, brand blue only for the
 * share bars, the dashboard's orange scale for the data, sentence case.
 * Page 1 carries the headline figures, scope and filters. Each section
 * (Accounts, Centres, Prospects) then gets one page with its charts in a
 * two-column grid of ranked bars.
 */

type RGB = [number, number, number]
type Weight = "regular" | "medium" | "semibold"

/** Optional assets; the report falls back to Helvetica and no logo without them. */
export interface SummaryReportPdfAssets {
  /** DM Sans TTF files as base64. */
  fonts?: { regular: string; medium: string; semibold: string }
  /** The product mark as a PNG data URL. */
  logoPng?: string
}

const PAGE_MARGIN = 48
const FONT_FAMILY = "DMSans"

// App tokens (light theme) as RGB.
const INK: RGB = [21, 36, 56]
const SECONDARY: RGB = [80, 95, 119]
const MUTED: RGB = [128, 139, 156]
const RULE: RGB = [223, 229, 236]
const TRACK: RGB = [237, 241, 245]
const PRIMARY: RGB = [0, 130, 209]
const INCLUDE: RGB = [29, 134, 69]
const INCLUDE_BG: RGB = [231, 244, 235]
const EXCLUDE: RGB = [202, 33, 33]
const EXCLUDE_BG: RGB = [251, 234, 234]
const OTHERS_BAR: RGB = [206, 213, 222]

// Bars by rank, in the same orange steps as the dashboard's donut charts:
// the deepest for the largest, getting lighter. The two palest steps are left
// out because a pale yellow bar barely shows on white paper; "Others" stays grey.
const BAR_STEPS: RGB[] = DONUT_CHART_COLORS.slice(2).reverse().map(hexToRgb)

const COMPANY_LINE = "Bamboo Reports, a Research NXT product"
const GROUP_TITLE: Record<Exclude<ReportFilterGroup, "Scope">, string> = {
  Account: "Accounts",
  Center: "Centres",
  Prospect: "Prospects",
}

// Pinned locale so the PDF reads the same on every machine.
const REPORT_LOCALE = "en-GB"
const formatNumber = (value: number) => value.toLocaleString(REPORT_LOCALE)
const formatDate = (date: Date) =>
  date.toLocaleDateString(REPORT_LOCALE, { year: "numeric", month: "long", day: "numeric" })
const formatDateTime = (date: Date) =>
  date.toLocaleString(REPORT_LOCALE, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })

function hexToRgb(hex: string): RGB {
  const clean = hex.replace("#", "")
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean
  const n = Number.parseInt(full, 16)
  if (Number.isNaN(n)) return [...MUTED]
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export async function renderSummaryReportPdf(model: SummaryReportModel, assets: SummaryReportPdfAssets = {}) {
  const { jsPDF } = await import("jspdf")
  const doc = new jsPDF({ unit: "pt", format: "a4", compress: true })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const contentWidth = pageWidth - PAGE_MARGIN * 2
  const contentBottom = pageHeight - PAGE_MARGIN - 20
  const right = pageWidth - PAGE_MARGIN

  let hasBrandFont = false
  if (assets.fonts) {
    try {
      const files: Array<[string, string]> = [
        ["regular", assets.fonts.regular],
        ["medium", assets.fonts.medium],
        ["semibold", assets.fonts.semibold],
      ]
      for (const [style, data] of files) {
        doc.addFileToVFS(`DMSans-${style}.ttf`, data)
        doc.addFont(`DMSans-${style}.ttf`, FONT_FAMILY, style)
      }
      hasBrandFont = true
    } catch {
      hasBrandFont = false
    }
  }

  const setText = (size: number, color: RGB, weight: Weight = "regular") => {
    if (hasBrandFont) doc.setFont(FONT_FAMILY, weight)
    else doc.setFont("helvetica", weight === "regular" ? "normal" : "bold")
    doc.setFontSize(size)
    doc.setTextColor(...color)
  }

  const truncate = (text: string, maxWidth: number) => {
    if (doc.getTextWidth(text) <= maxWidth) return text
    let out = text
    while (out.length > 1 && doc.getTextWidth(`${out}…`) > maxWidth) out = out.slice(0, -1)
    return `${out.trimEnd()}…`
  }

  const generatedDate = formatDate(model.generatedAt)

  // Running header on every page after the first.
  const drawRunningHeader = () => {
    setText(8.5, MUTED)
    doc.text(model.title, PAGE_MARGIN, 32)
    doc.text(generatedDate, right, 32, { align: "right" })
    doc.setDrawColor(...RULE)
    doc.setLineWidth(0.5)
    doc.line(PAGE_MARGIN, 40, right, 40)
  }

  let cursorY = 0
  const newPage = () => {
    doc.addPage()
    drawRunningHeader()
    cursorY = 76
  }
  const ensureSpace = (needed: number) => {
    if (cursorY + needed > contentBottom) newPage()
  }

  // Section heading: 13pt medium title with an optional grey line under it.
  const sectionHeading = (title: string, subtitle?: string) => {
    setText(13, INK, "medium")
    doc.text(title, PAGE_MARGIN, cursorY)
    cursorY += 16
    if (subtitle) {
      setText(9.5, SECONDARY)
      const lines = doc.splitTextToSize(subtitle, contentWidth) as string[]
      lines.forEach((line, i) => doc.text(line, PAGE_MARGIN, cursorY + i * 13))
      cursorY += lines.length * 13
    }
    cursorY += 14
  }

  // ---------------------------------------------------------------- Page 1
  // Brand row: mark and wordmark on the left, date on the right.
  let wordmarkX = PAGE_MARGIN
  if (assets.logoPng) {
    try {
      doc.addImage(assets.logoPng, "PNG", PAGE_MARGIN, 43, 18, 18)
      wordmarkX = PAGE_MARGIN + 26
    } catch {
      wordmarkX = PAGE_MARGIN
    }
  }
  setText(11, INK, "medium")
  doc.text(model.productName, wordmarkX, 56)
  setText(9.5, SECONDARY)
  doc.text(generatedDate, right, 56, { align: "right" })

  setText(26, INK, "medium")
  doc.text(model.title, PAGE_MARGIN, 108)
  setText(9.5, SECONDARY)
  doc.text(
    `Generated ${formatDateTime(model.generatedAt)}${model.generatedBy ? ` by ${model.generatedBy}` : ""}`,
    PAGE_MARGIN,
    128
  )
  doc.setDrawColor(...RULE)
  doc.setLineWidth(0.5)
  doc.line(PAGE_MARGIN, 150, right, 150)

  // Headline figures: the app's "2,498 of 2,766" with a thin share bar.
  cursorY = 186
  sectionHeading(
    "Headline figures",
    model.activeFilterCount > 0
      ? "Counts that match the filters below, out of everything in Bamboo Reports"
      : "No filters are applied, so every count is the full total"
  )
  const metricCount = Math.max(model.metrics.length, 1)
  const metricGap = 16
  const metricWidth = (contentWidth - metricGap * (metricCount - 1)) / metricCount
  const metricTop = cursorY
  model.metrics.forEach((metric, index) => {
    const x = PAGE_MARGIN + index * (metricWidth + metricGap)
    setText(9, SECONDARY)
    doc.text(truncate(metric.label, metricWidth), x, metricTop)

    // Largest size that fits the column, so 3,974,487 never collides.
    let size = 20
    setText(size, INK, "medium")
    while (size > 12 && doc.getTextWidth(formatNumber(metric.filtered)) > metricWidth) {
      size -= 1
      setText(size, INK, "medium")
    }
    doc.text(formatNumber(metric.filtered), x, metricTop + 26)

    setText(8.5, MUTED)
    doc.text(truncate(`of ${formatNumber(metric.total)}`, metricWidth - 34), x, metricTop + 42)
    doc.text(formatSharePercent(metric.filtered, metric.total), x + metricWidth, metricTop + 42, { align: "right" })

    const share = metric.total > 0 ? Math.min(metric.filtered / metric.total, 1) : 0
    doc.setFillColor(...TRACK)
    doc.roundedRect(x, metricTop + 50, metricWidth, 3, 1.5, 1.5, "F")
    if (share > 0) {
      doc.setFillColor(...PRIMARY)
      doc.roundedRect(x, metricTop + 50, Math.max(metricWidth * share, 3), 3, 1.5, 1.5, "F")
    }
  })
  cursorY = metricTop + 92

  // Scope and filters.
  const scopeRows = model.filters.filter((row) => row.group === "Scope")
  const filterRows = model.filters.filter((row) => row.group !== "Scope")
  const LABEL_WIDTH = 132
  const valuesX = PAGE_MARGIN + LABEL_WIDTH + 12
  const valuesWidth = right - valuesX

  const scopeLine = (label: string, value: string) => {
    setText(9.5, SECONDARY)
    doc.text(label, PAGE_MARGIN, cursorY)
    setText(9.5, INK)
    doc.text(truncate(value, valuesWidth), valuesX, cursorY)
    cursorY += 18
  }

  sectionHeading(
    "Filters applied",
    filterRows.length > 0 ? "Values marked + are included and − are excluded" : undefined
  )
  for (const row of scopeRows) scopeLine(row.label, row.included.join(", "))

  // Chips like the sidebar's: a tinted tag with + or − in the mode colour.
  const CHIP_HEIGHT = 17
  const CHIP_GAP = 4
  const CHIP_LINE = CHIP_HEIGHT + 5
  const chipWidth = (text: string) => {
    setText(9, INK)
    return Math.min(doc.getTextWidth(`+ ${text}`) + 12, valuesWidth)
  }
  const drawChip = (text: string, mode: "include" | "exclude", x: number, y: number) => {
    const w = chipWidth(text)
    doc.setFillColor(...(mode === "include" ? INCLUDE_BG : EXCLUDE_BG))
    doc.roundedRect(x, y, w, CHIP_HEIGHT, 4, 4, "F")
    const sign = mode === "include" ? "+" : "−"
    setText(9, mode === "include" ? INCLUDE : EXCLUDE, "medium")
    doc.text(sign, x + 6, y + 11.5)
    const signWidth = doc.getTextWidth(`${sign} `)
    setText(9, INK)
    doc.text(truncate(text, w - 12 - signWidth), x + 6 + signWidth, y + 11.5)
    return w
  }
  // Lays chips out in rows and returns the height they need.
  const layoutChips = (row: ReportFilterRow) => {
    const chips = [
      ...row.included.map((text) => ({ text, mode: "include" as const })),
      ...row.excluded.map((text) => ({ text, mode: "exclude" as const })),
    ]
    const placed: Array<{ text: string; mode: "include" | "exclude"; dx: number; line: number }> = []
    let dx = 0
    let line = 0
    for (const chip of chips) {
      const w = chipWidth(chip.text)
      if (dx > 0 && dx + w > valuesWidth) {
        line += 1
        dx = 0
      }
      placed.push({ ...chip, dx, line })
      dx += w + CHIP_GAP
    }
    return { placed, height: (line + 1) * CHIP_LINE }
  }

  if (filterRows.length === 0) {
    scopeLine("Other filters", "None")
  } else {
    for (const group of ["Account", "Center", "Prospect"] as const) {
      const rows = filterRows.filter((row) => row.group === group)
      if (rows.length === 0) continue
      ensureSpace(52)
      cursorY += 18
      setText(10.5, INK, "medium")
      doc.text(GROUP_TITLE[group], PAGE_MARGIN, cursorY)
      cursorY += 10
      for (const row of rows) {
        const { placed, height } = layoutChips(row)
        ensureSpace(height + 4)
        setText(9.5, SECONDARY)
        doc.text(truncate(row.label, LABEL_WIDTH), PAGE_MARGIN, cursorY + 12)
        for (const chip of placed) drawChip(chip.text, chip.mode, valuesX + chip.dx, cursorY + chip.line * CHIP_LINE)
        cursorY += height + 4
      }
    }
  }

  // --------------------------------------------------------- Section pages
  const COLUMN_GAP = 32
  const columnWidth = (contentWidth - COLUMN_GAP) / 2
  const CHART_TITLE_HEIGHT = 24
  const ROW_HEIGHT = 30
  const chartHeight = (chart: ReportChart) => CHART_TITLE_HEIGHT + Math.max(chart.segments.length, 1) * ROW_HEIGHT

  const drawChart = (chart: ReportChart, x: number, y: number) => {
    setText(11.5, INK, "medium")
    doc.text(truncate(chart.title, columnWidth), x, y)

    if (chart.total <= 0 || chart.segments.length === 0) {
      setText(9.5, MUTED)
      doc.text("No data for these filters", x, y + CHART_TITLE_HEIGHT)
      return
    }

    const maxValue = Math.max(...chart.segments.map((segment) => segment.value), 1)
    let rank = 0
    chart.segments.forEach((segment, index) => {
      const rowY = y + CHART_TITLE_HEIGHT + index * ROW_HEIGHT
      const isOthers = segment.name === "Others"
      const percent = segment.percent < 1 ? "<1%" : `${Math.round(segment.percent)}%`

      setText(9, MUTED)
      doc.text(percent, x + columnWidth, rowY, { align: "right" })
      const percentWidth = doc.getTextWidth("100%") + 8
      setText(9.5, INK)
      doc.text(formatNumber(segment.value), x + columnWidth - percentWidth, rowY, { align: "right" })
      const valueWidth = doc.getTextWidth(formatNumber(segment.value))
      setText(9.5, isOthers ? SECONDARY : INK)
      doc.text(truncate(segment.name, columnWidth - percentWidth - valueWidth - 12), x, rowY)

      doc.setFillColor(...TRACK)
      doc.roundedRect(x, rowY + 6, columnWidth, 5, 2.5, 2.5, "F")
      const color = isOthers ? OTHERS_BAR : BAR_STEPS[Math.min(rank, BAR_STEPS.length - 1)]
      if (!isOthers) rank += 1
      doc.setFillColor(...color)
      doc.roundedRect(x, rowY + 6, Math.max((segment.value / maxValue) * columnWidth, 5), 5, 2.5, 2.5, "F")
    })
  }

  const drawGroupPage = (group: ReportChartGroup) => {
    newPage()
    setText(20, INK, "medium")
    doc.text(group.title, PAGE_MARGIN, cursorY + 4)
    setText(10, SECONDARY)
    const noun = group.title.toLowerCase()
    doc.text(
      model.activeFilterCount > 0
        ? `${formatNumber(group.matching)} of ${formatNumber(group.databaseTotal)} ${noun} match the filters`
        : `All ${formatNumber(group.databaseTotal)} ${noun}`,
      PAGE_MARGIN,
      cursorY + 22
    )
    cursorY += 60

    for (let i = 0; i < group.charts.length; i += 2) {
      const pair = group.charts.slice(i, i + 2)
      const rowHeight = Math.max(...pair.map(chartHeight))
      ensureSpace(rowHeight)
      pair.forEach((chart, j) => drawChart(chart, PAGE_MARGIN + j * (columnWidth + COLUMN_GAP), cursorY))
      cursorY += rowHeight + 32
    }
  }

  for (const group of model.chartGroups) drawGroupPage(group)

  // ---------------------------------------------------------------- Footer
  const pageCount = doc.getNumberOfPages()
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page)
    const footerY = pageHeight - 32
    setText(8, MUTED)
    doc.text(COMPANY_LINE, PAGE_MARGIN, footerY)
    doc.text(`Page ${page} of ${pageCount}`, right, footerY, { align: "right" })
  }

  return doc
}

const toBase64 = (buffer: ArrayBuffer) => {
  const bytes = new Uint8Array(buffer)
  let binary = ""
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

/** DM Sans from /public/fonts; undefined if any file fails to load. */
async function loadReportFonts(): Promise<SummaryReportPdfAssets["fonts"]> {
  try {
    const load = async (name: string) => {
      const res = await fetch(`/fonts/DMSans-${name}.ttf`)
      if (!res.ok) throw new Error(`font ${name}: ${res.status}`)
      return toBase64(await res.arrayBuffer())
    }
    const [regular, medium, semibold] = await Promise.all([load("Regular"), load("Medium"), load("SemiBold")])
    return { regular, medium, semibold }
  } catch {
    return undefined
  }
}

/** The logo SVG rasterised to a crisp PNG; undefined if it cannot load. */
async function loadReportLogo(): Promise<string | undefined> {
  try {
    const image = new Image()
    image.decoding = "async"
    image.src = "/logo.svg"
    await image.decode()
    const size = 96
    const canvas = document.createElement("canvas")
    canvas.width = size
    canvas.height = size
    const context = canvas.getContext("2d")
    if (!context) return undefined
    context.drawImage(image, 0, 0, size, size)
    return canvas.toDataURL("image/png")
  } catch {
    return undefined
  }
}

export async function downloadSummaryReportPdf(model: SummaryReportModel): Promise<void> {
  const [fonts, logoPng] = await Promise.all([loadReportFonts(), loadReportLogo()])
  const doc = await renderSummaryReportPdf(model, { fonts, logoPng })
  doc.save(buildSummaryReportFilename(model.generatedAt))
}
