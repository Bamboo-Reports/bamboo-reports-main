import { describe, expect, it } from "vitest"
import {
  TECH_TREEMAP_SIZING,
  fitTechTreemapHeight,
  formatTechShare,
  groupTechByCategory,
  squarify,
  techShadeIndex,
} from "@/lib/charts/tech-treemap-layout"
import type { Tech } from "@/lib/types"

const row = (software_category: string | null, software_in_use: string | null) =>
  ({ software_category, software_in_use }) as Tech

// A plain width model: 7px per character, 3px per space.
const textWidth = (text: string) => text.replace(/ /g, "").length * 7 + (text.match(/ /g)?.length ?? 0) * 3

describe("groupTechByCategory", () => {
  it("counts each tool and orders categories and tools by count, then name", () => {
    const groups = groupTechByCategory([
      row("ERP", "SAP"),
      row("ERP", "SAP"),
      row("ERP", "Oracle"),
      row("CRM", "Salesforce"),
      row("Analytics", "Tableau"),
      row(null, null),
    ])
    expect(groups.map((g) => [g.name, g.total])).toEqual([
      ["ERP", 3],
      ["Analytics", 1],
      ["CRM", 1],
      ["Uncategorized", 1],
    ])
    expect(groups[0].tools).toEqual([
      { name: "SAP", count: 2 },
      { name: "Oracle", count: 1 },
    ])
    expect(groups[3].tools).toEqual([{ name: "Unknown", count: 1 }])
  })
})

describe("techShadeIndex", () => {
  it("uses one middle step when every count is the same", () => {
    expect(techShadeIndex(1, 1)).toBe(3)
  })

  it("runs from step 1 to the deepest step 5", () => {
    expect(techShadeIndex(1, 7)).toBe(1)
    expect(techShadeIndex(4, 7)).toBe(3)
    expect(techShadeIndex(7, 7)).toBe(5)
  })
})

describe("squarify", () => {
  it("fills the box exactly, with areas in proportion", () => {
    const rects = squarify([6, 3, 1], 0, 0, 100, 50)
    const areas = rects.map(([, , w, h]) => w * h)
    expect(areas.reduce((a, b) => a + b, 0)).toBeCloseTo(5000)
    expect(areas[0] / areas[2]).toBeCloseTo(6)
  })
})

describe("fitTechTreemapHeight", () => {
  it("keeps a small stack at the minimum height", () => {
    const groups = groupTechByCategory([row("Cloud", "Azure"), row("ERP", "SAP"), row("HR", "SAP HR")])
    expect(fitTechTreemapHeight(groups, 1000, textWidth)).toBe(TECH_TREEMAP_SIZING.minHeight)
  })

  it("grows for a large stack but never past the ceiling", () => {
    const rows: Tech[] = []
    for (let c = 0; c < 20; c++) {
      for (let t = 0; t < 3; t++) rows.push(row(`Category ${c}`, `Long tool name ${c}-${t}`))
    }
    const height = fitTechTreemapHeight(groupTechByCategory(rows), 1000, textWidth)
    expect(height).toBeGreaterThan(TECH_TREEMAP_SIZING.minHeight)
    expect(height).toBeLessThanOrEqual(TECH_TREEMAP_SIZING.maxHeight)
  })
})

describe("formatTechShare", () => {
  it("shows one decimal unless the share is whole", () => {
    expect(formatTechShare(7, 128)).toBe("5.5%")
    expect(formatTechShare(1, 4)).toBe("25%")
    expect(formatTechShare(1, 0)).toBe("0%")
  })
})
