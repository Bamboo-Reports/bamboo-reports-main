// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { render } from "@testing-library/react"
import { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent } from "@/components/ui/card"

describe("Card UI Components", () => {
  it("renders all card subcomponents", () => {
    const { container } = render(
      <Card data-testid="card" className="custom-card">
        <CardHeader className="custom-header">
          <CardTitle className="custom-title">Title</CardTitle>
          <CardDescription className="custom-desc">Desc</CardDescription>
        </CardHeader>
        <CardContent className="custom-content">Content</CardContent>
        <CardFooter className="custom-footer">Footer</CardFooter>
      </Card>
    )

    expect(container.querySelector(".custom-card")).not.toBeNull()
    expect(container.querySelector(".custom-header")).not.toBeNull()
    expect(container.querySelector(".custom-title")).not.toBeNull()
    expect(container.querySelector(".custom-desc")).not.toBeNull()
    expect(container.querySelector(".custom-content")).not.toBeNull()
    expect(container.querySelector(".custom-footer")).not.toBeNull()
  })
})
