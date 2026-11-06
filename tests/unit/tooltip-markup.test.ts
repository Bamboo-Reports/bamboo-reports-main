import { describe, expect, it } from "vitest"
import { chartTooltipHtml, escapeHtml } from "@/lib/tooltip/markup"

describe("chartTooltipHtml", () => {
  it("writes a title, a large figure and detail lines", () => {
    const html = chartTooltipHtml({
      title: "United States",
      swatch: "#dd6516",
      lead: "61%",
      lines: [{ label: "Accounts", value: "1,184" }],
    })
    expect(html).toContain('class="br-tip br-tip-chart"')
    expect(html).toContain('<span class="br-tip-swatch" style="background:#dd6516"></span>')
    expect(html).toContain('<span class="br-tip-lead">61%</span>')
    expect(html).toContain('<div class="br-tip-line">Accounts: <b>1,184</b></div>')
  })

  it("escapes every piece of text", () => {
    const html = chartTooltipHtml({ title: "<img src=x onerror=alert(1)>", lines: [{ value: "A & B" }] })
    expect(html).not.toContain("<img")
    expect(html).toContain("&lt;img")
    expect(html).toContain("A &amp; B")
  })

  it("drops a swatch that is not a plain colour", () => {
    const html = chartTooltipHtml({ title: "X", swatch: "red;background:url(x)" })
    expect(html).not.toContain("br-tip-swatch")
  })

  it("writes the card variant with a subtitle and a unit after the figure", () => {
    const html = chartTooltipHtml({ title: "Bengaluru", subtitle: "India", lead: "1,284", leadUnit: "centres", variant: "card" })
    expect(html).toContain('class="br-tip br-tip-card"')
    expect(html).toContain('<div class="br-tip-sub">India</div>')
    expect(html).toContain('1,284<span class="br-tip-unit">centres</span>')
  })
})

describe("escapeHtml", () => {
  it("escapes quotes too", () => {
    expect(escapeHtml(`"a" 'b'`)).toBe("&quot;a&quot; &#39;b&#39;")
  })
})
