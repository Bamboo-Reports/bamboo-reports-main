import { describe, expect, it } from "vitest"
import { getPageItems } from "@/components/tables/data-table"

describe("getPageItems", () => {
  it("starts the run of three at the current page", () => {
    expect(getPageItems(1, 250)).toEqual([1, 2, 3])
    expect(getPageItems(3, 250)).toEqual([3, 4, 5])
    expect(getPageItems(4, 250)).toEqual([4, 5, 6])
  })

  it("stops at the last page", () => {
    expect(getPageItems(249, 250)).toEqual([248, 249, 250])
    expect(getPageItems(250, 250)).toEqual([248, 249, 250])
  })

  it("shows only the pages that exist when there are fewer than three", () => {
    expect(getPageItems(1, 1)).toEqual([1])
    expect(getPageItems(2, 2)).toEqual([1, 2])
  })
})
