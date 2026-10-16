// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { SlidingTabsList, Tabs, TabsTrigger } from "@/components/ui/tabs"

function Example() {
  return (
    <Tabs defaultValue="info">
      <SlidingTabsList aria-label="Account sections">
        <TabsTrigger value="info">Account Info</TabsTrigger>
        <TabsTrigger value="centers">Centres</TabsTrigger>
        <TabsTrigger value="prospects">Prospects</TabsTrigger>
      </SlidingTabsList>
    </Tabs>
  )
}

const indicator = () => screen.getByRole("tablist").querySelector<HTMLElement>('span[aria-hidden="true"]')!

describe("SlidingTabsList", () => {
  afterEach(() => cleanup())

  it("renders one hidden highlight and shows it under the active tab", () => {
    render(<Example />)
    expect(screen.getByRole("tablist").querySelectorAll('span[aria-hidden="true"]')).toHaveLength(1)
    expect(indicator().style.opacity).toBe("1")
    expect(screen.getAllByRole("tab")).toHaveLength(3)
  })

  it("keeps the highlight visible when the active tab changes", async () => {
    render(<Example />)
    await act(async () => {
      fireEvent.mouseDown(screen.getByRole("tab", { name: "Centres" }), { button: 0 })
    })
    expect(screen.getByRole("tab", { name: "Centres" }).getAttribute("data-state")).toBe("active")
    expect(indicator().style.opacity).toBe("1")
  })
})
