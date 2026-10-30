import { describe, expect, it } from "vitest"
import { getPageItems } from "@/components/tables/data-table"

describe("getPageItems", () => {
  it("lists every page when there are seven or fewer", () => {
    expect(getPageItems(1, 1)).toEqual([1])
    expect(getPageItems(2, 2)).toEqual([1, 2])
    expect(getPageItems(4, 7)).toEqual([1, 2, 3, 4, 5, 6, 7])
  })

  it("keeps the first five pages together near the start", () => {
    expect(getPageItems(1, 250)).toEqual([1, 2, 3, 4, 5, "end-ellipsis", 250])
    expect(getPageItems(4, 250)).toEqual([1, 2, 3, 4, 5, "end-ellipsis", 250])
  })

  it("shows the current page with a neighbour on each side in the middle", () => {
    expect(getPageItems(5, 250)).toEqual([1, "start-ellipsis", 4, 5, 6, "end-ellipsis", 250])
    expect(getPageItems(49, 250)).toEqual([1, "start-ellipsis", 48, 49, 50, "end-ellipsis", 250])
  })

  it("keeps the last five pages together near the end", () => {
    expect(getPageItems(247, 250)).toEqual([1, "start-ellipsis", 246, 247, 248, 249, 250])
    expect(getPageItems(250, 250)).toEqual([1, "start-ellipsis", 246, 247, 248, 249, 250])
  })

  it("always returns seven items once there are more than seven pages", () => {
    for (let page = 1; page <= 20; page++) expect(getPageItems(page, 20)).toHaveLength(7)
  })
})
