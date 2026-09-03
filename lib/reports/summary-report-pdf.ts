import {
  buildSummaryReportFilename,
  formatSharePercent,
  type ReportChart,
  type ReportChartGroup,
  type ReportFilterGroup,
  type SummaryReportModel,
} from "@/lib/reports/summary-report"
import { PIE_CHART_COLORS } from "@/lib/utils/chart-helpers"

/**
 * Renders a SummaryReportModel to an A4 PDF and triggers a browser download.
 * jsPDF and the autotable plugin are imported lazily so they stay out of the
 * main dashboard bundle until someone actually asks for a report.
 *
 * Layout: a cover page with the headline metrics, a filters page, then the
 * breakdown charts at two per page. Inner pages carry a running header.
 */

type RGB = [number, number, number]

const PAGE_MARGIN = 48
const NAVY: RGB = [20, 33, 61]
const INK: RGB = [31, 41, 55]
const SLATE: RGB = [74, 85, 104]
const MUTED: RGB = [120, 130, 146]
const RULE: RGB = [217, 222, 231]
const BAND: RGB = [242, 245, 249]
const ACCENT: RGB = hexToRgb(PIE_CHART_COLORS[0])
const WHITE: RGB = [255, 255, 255]
const COMPANY_LINE = "Bamboo Reports, a Research NXT product"

// Pinned locale so the PDF reads the same no matter which machine produced it.
const REPORT_LOCALE = "en-US"

const formatNumber = (value: number) => value.toLocaleString(REPORT_LOCALE)

const formatDate = (date: Date) =>
  date.toLocaleDateString(REPORT_LOCALE, { year: "numeric", month: "long", day: "numeric" })

const formatDateTime = (date: Date) =>
  date.toLocaleString(REPORT_LOCALE, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })

function hexToRgb(hex: string): RGB {
  const clean = hex.replace("#", "")
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean
  const n = Number.parseInt(full, 16)
  if (Number.isNaN(n)) return [120, 130, 146]
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export async function renderSummaryReportPdf(model: SummaryReportModel) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ])

  const doc = new jsPDF({ unit: "pt", format: "a4", compress: true })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const contentWidth = pageWidth - PAGE_MARGIN * 2
  const contentBottom = pageHeight - PAGE_MARGIN - 16

  const setText = (size: number, color: RGB, style: "normal" | "bold" | "italic" = "normal") => {
    doc.setFont("helvetica", style)
    doc.setFontSize(size)
    doc.setTextColor(...color)
  }

  const truncate = (text: string, maxWidth: number) => {
    if (doc.getTextWidth(text) <= maxWidth) return text
    let out = text
    while (out.length > 1 && doc.getTextWidth(`${out}...`) > maxWidth) {
      out = out.slice(0, -1)
    }
    return `${out.trimEnd()}...`
  }

  const getLastTableY = () =>
    (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY

  // Running header on every page after the cover.
  let currentSection = ""
  const drawRunningHeader = () => {
    setText(8.5, MUTED)
    doc.text(model.title, PAGE_MARGIN, 30)
    if (currentSection) {
      doc.text(currentSection, pageWidth - PAGE_MARGIN, 30, { align: "right" })
    }
    doc.setDrawColor(...RULE)
    doc.setLineWidth(0.5)
    doc.line(PAGE_MARGIN, 38, pageWidth - PAGE_MARGIN, 38)
  }

  let cursorY = 0
  const newPage = (section: string) => {
    currentSection = section
    doc.addPage()
    drawRunningHeader()
    cursorY = PAGE_MARGIN + 22
  }

  const ensureSpace = (needed: number) => {
    if (cursorY + needed > contentBottom) {
      newPage(currentSection)
    }
  }

  // Section heading: navy title over a short accent rule.
  const sectionHeading = (text: string, subtitle?: string) => {
    setText(15, NAVY, "bold")
    doc.text(text, PAGE_MARGIN, cursorY)
    doc.setDrawColor(...ACCENT)
    doc.setLineWidth(2)
    doc.line(PAGE_MARGIN, cursorY + 8, PAGE_MARGIN + 28, cursorY + 8)
    cursorY += 24
    if (subtitle) {
      setText(9.5, SLATE)
      const lines = doc.splitTextToSize(subtitle, contentWidth) as string[]
      lines.forEach((line, i) => doc.text(line, PAGE_MARGIN, cursorY + i * 12))
      cursorY += lines.length * 12 + 10
    }
  }

  const subHeading = (text: string) => {
    setText(11, NAVY, "bold")
    doc.text(text, PAGE_MARGIN, cursorY)
    cursorY += 14
  }

  // ---------------------------------------------------------------- Cover
  const HEADER_BOTTOM = 178
  setText(11, ACCENT, "bold")
  doc.text(model.productName, PAGE_MARGIN, 72)

  setText(28, NAVY, "bold")
  doc.text(model.title, PAGE_MARGIN, 112)

  setText(10.5, SLATE)
  doc.text(formatDate(model.generatedAt), PAGE_MARGIN, 136)
  const coverMeta = [
    `Generated ${formatDateTime(model.generatedAt)}`,
    model.generatedBy ? `Prepared by ${model.generatedBy}` : null,
  ].filter((line): line is string => Boolean(line))
  coverMeta.forEach((line, i) => {
    doc.text(line, pageWidth - PAGE_MARGIN, 136 + i * 14, { align: "right" })
  })

  doc.setDrawColor(...NAVY)
  doc.setLineWidth(1)
  doc.line(PAGE_MARGIN, HEADER_BOTTOM, pageWidth - PAGE_MARGIN, HEADER_BOTTOM)

  cursorY = HEADER_BOTTOM + 52
  sectionHeading(
    "Key metrics",
    model.activeFilterCount > 0
      ? "Matching figures reflect the filters listed on the next page. Database totals cover every record."
      : "No filters were applied, so matching figures equal the full database."
  )

  // Metric tiles: one column per metric, separated by hairlines.
  const tileCount = Math.max(model.metrics.length, 1)
  const tileWidth = contentWidth / tileCount
  const tileTop = cursorY + 6
  const tileHeight = 92
  doc.setDrawColor(...RULE)
  doc.setLineWidth(0.5)
  doc.line(PAGE_MARGIN, tileTop, pageWidth - PAGE_MARGIN, tileTop)
  doc.line(PAGE_MARGIN, tileTop + tileHeight, pageWidth - PAGE_MARGIN, tileTop + tileHeight)
  model.metrics.forEach((metric, index) => {
    const x = PAGE_MARGIN + index * tileWidth
    if (index > 0) {
      doc.line(x, tileTop + 12, x, tileTop + tileHeight - 12)
    }
    const innerX = x + (index === 0 ? 0 : 10)
    const innerWidth = tileWidth - (index === 0 ? 10 : 20)
    setText(9, SLATE)
    doc.text(truncate(metric.label, innerWidth), innerX, tileTop + 24)
    setText(metric.filtered >= 1_000_000 ? 18 : 22, NAVY, "bold")
    doc.text(formatNumber(metric.filtered), innerX, tileTop + 52)
    setText(8.5, MUTED)
    doc.text(truncate(`of ${formatNumber(metric.total)} total`, innerWidth), innerX, tileTop + 68)
    setText(8.5, ACCENT, "bold")
    doc.text(formatSharePercent(metric.filtered, metric.total), innerX, tileTop + 80)
  })
  cursorY = tileTop + tileHeight + 44

  // Scope block: what this report covers, in plain terms.
  const scopeRows = model.filters.filter((row) => row.group === "Scope")
  const filterRows = model.filters.filter((row) => row.group !== "Scope")
  const sectionNames = model.metrics
    .filter((metric) => ["accounts", "centers", "prospects"].includes(metric.id))
    .map((metric) => metric.label)
  const scopeLines: Array<[string, string]> = [
    ...scopeRows.map((row): [string, string] => [row.label, row.included.join(", ")]),
    ["Sections covered", sectionNames.length > 0 ? sectionNames.join(", ") : "None procured"],
  ]
  sectionHeading("Report scope")
  scopeLines.forEach(([label, value]) => {
    setText(9.5, MUTED)
    doc.text(label, PAGE_MARGIN, cursorY)
    setText(9.5, INK)
    doc.text(truncate(value, contentWidth - 130), PAGE_MARGIN + 130, cursorY)
    cursorY += 16
  })

  // ------------------------------------------------------------- Filters
  newPage("Filters applied")
  sectionHeading(
    "Filters applied",
    `${scopeRows.map((row) => `${row.label}: ${row.included.join(", ")}`).join(". ")}. Included values are shown in green, excluded values in red.`
  )

  const INCLUDE: RGB = [21, 128, 61]
  const EXCLUDE: RGB = [185, 28, 28]
  const EMPTY_CELL = "-"
  const FILTER_TABLES: Array<{ group: ReportFilterGroup; title: string; emptyText: string }> = [
    { group: "Account", title: "Account filters", emptyText: "No account filters applied." },
    { group: "Center", title: "Center filters", emptyText: "No center filters applied." },
    { group: "Prospect", title: "Prospect filters", emptyText: "No prospect filters applied." },
  ]

  for (const table of FILTER_TABLES) {
    const rows = filterRows.filter((row) => row.group === table.group)
    ensureSpace(80)
    subHeading(table.title)

    if (rows.length === 0) {
      setText(9.5, MUTED, "italic")
      doc.text(table.emptyText, PAGE_MARGIN, cursorY + 4)
      cursorY += 30
      continue
    }

    autoTable(doc, {
      startY: cursorY,
      margin: { left: PAGE_MARGIN, right: PAGE_MARGIN, top: PAGE_MARGIN + 22, bottom: PAGE_MARGIN + 16 },
      tableWidth: contentWidth,
      head: [["Filter", "Included", "Excluded"]],
      body: rows.map((row) => [
        row.label,
        row.included.length > 0 ? row.included.join(", ") : EMPTY_CELL,
        row.excluded.length > 0 ? row.excluded.join(", ") : EMPTY_CELL,
      ]),
      theme: "plain",
      styles: {
        font: "helvetica",
        fontSize: 9.5,
        textColor: INK,
        cellPadding: { top: 7, bottom: 7, left: 8, right: 8 },
        valign: "top",
        overflow: "linebreak",
        lineColor: RULE,
        lineWidth: { bottom: 0.5 },
      },
      headStyles: {
        fillColor: BAND,
        textColor: NAVY,
        fontStyle: "bold",
        fontSize: 9,
        lineColor: NAVY,
        lineWidth: { bottom: 1 },
      },
      columnStyles: {
        0: { cellWidth: contentWidth * 0.26, fontStyle: "bold", textColor: NAVY },
        1: { cellWidth: contentWidth * 0.44, textColor: INCLUDE },
        2: { cellWidth: contentWidth * 0.3, textColor: EXCLUDE },
      },
      didParseCell: (data) => {
        if (data.section === "body" && data.column.index > 0 && data.cell.raw === EMPTY_CELL) {
          data.cell.styles.textColor = MUTED
        }
      },
      didDrawPage: (data) => {
        if (data.pageNumber > 1) drawRunningHeader()
      },
    })

    cursorY = getLastTableY() + 26
  }

  // ---------------------------------------------------------- Breakdowns
  if (model.chartGroups.length > 0) {
    const CHARTS_PER_PAGE = 2
    const HEADER_HEIGHT = 30
    const ROW_HEIGHT = 26
    const BAR_HEIGHT = 12
    const LABEL_WIDTH = 160
    const VALUE_WIDTH = 96
    const CHART_GAP = 34

    const chartHeight = (chart: ReportChart) =>
      HEADER_HEIGHT + 10 + Math.max(chart.segments.length, 1) * ROW_HEIGHT

    const drawChart = (chart: ReportChart, group: ReportChartGroup, x: number, y: number) => {
      setText(11.5, NAVY, "bold")
      doc.text(truncate(chart.title, contentWidth - 200), x, y + 12)
      setText(9, SLATE)
      doc.text(
        `${formatNumber(group.matching)} of ${formatNumber(group.databaseTotal)} ${chart.countLabel.toLowerCase()}`,
        x + contentWidth,
        y + 12,
        { align: "right" }
      )
      doc.setDrawColor(...NAVY)
      doc.setLineWidth(0.75)
      doc.line(x, y + HEADER_HEIGHT - 8, x + contentWidth, y + HEADER_HEIGHT - 8)

      let rowY = y + HEADER_HEIGHT + 10
      if (chart.total <= 0 || chart.segments.length === 0) {
        setText(9.5, MUTED, "italic")
        doc.text("No data for the current filters", x, rowY + 8)
        return
      }

      const barX = x + LABEL_WIDTH + 12
      const barMaxWidth = contentWidth - LABEL_WIDTH - 12 - VALUE_WIDTH - 12
      const maxValue = Math.max(...chart.segments.map((segment) => segment.value), 1)

      for (const segment of chart.segments) {
        const centerY = rowY + BAR_HEIGHT / 2
        setText(10, INK)
        doc.text(truncate(segment.name, LABEL_WIDTH), x, centerY + 3.5)

        doc.setFillColor(...BAND)
        doc.rect(barX, rowY, barMaxWidth, BAR_HEIGHT, "F")
        const width = Math.max((segment.value / maxValue) * barMaxWidth, 2)
        doc.setFillColor(...ACCENT)
        doc.rect(barX, rowY, width, BAR_HEIGHT, "F")

        setText(9.5, SLATE)
        doc.text(
          `${formatNumber(segment.value)} (${segment.percent.toFixed(1)}%)`,
          x + contentWidth,
          centerY + 3.5,
          { align: "right" }
        )
        rowY += ROW_HEIGHT
      }
    }

    newPage("Breakdowns")
    sectionHeading("Breakdowns", "Distribution of matching records by category, largest first. Categories under 5% are grouped as Others.")

    let chartsOnPage = 0
    for (const group of model.chartGroups) {
      let groupHeadingPending = true
      for (const chart of group.charts) {
        const fits = cursorY + 22 + chartHeight(chart) <= contentBottom
        if (chartsOnPage >= CHARTS_PER_PAGE || (chartsOnPage > 0 && !fits)) {
          newPage("Breakdowns")
          chartsOnPage = 0
          groupHeadingPending = true
        }
        if (groupHeadingPending) {
          setText(10, SLATE, "bold")
          doc.text(chartsOnPage === 0 ? group.title : `${group.title} (continued)`, PAGE_MARGIN, cursorY)
          cursorY += 14
          groupHeadingPending = false
        }
        drawChart(chart, group, PAGE_MARGIN, cursorY)
        cursorY += chartHeight(chart) + CHART_GAP
        chartsOnPage += 1
      }
    }
  }

  // ---------------------------------------------------------------- Footer
  const pageCount = doc.getNumberOfPages()
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page)
    const footerY = pageHeight - PAGE_MARGIN + 14
    doc.setDrawColor(...RULE)
    doc.setLineWidth(0.5)
    doc.line(PAGE_MARGIN, footerY - 12, pageWidth - PAGE_MARGIN, footerY - 12)
    setText(8, MUTED)
    doc.text(COMPANY_LINE, PAGE_MARGIN, footerY)
    doc.text(`Page ${page} of ${pageCount}`, pageWidth - PAGE_MARGIN, footerY, { align: "right" })
  }

  return doc
}

export async function downloadSummaryReportPdf(model: SummaryReportModel): Promise<void> {
  const doc = await renderSummaryReportPdf(model)
  doc.save(buildSummaryReportFilename(model.generatedAt))
}
