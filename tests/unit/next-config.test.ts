import { describe, expect, it } from "vitest"
import nextConfig from "../../next.config.mjs"

describe("next.config redirects", () => {
  it("sends the removed signup page to sign in (#304)", async () => {
    const redirects = await nextConfig.redirects?.()
    expect(redirects).toContainEqual({ source: "/signup", destination: "/signin", permanent: true })
  })
})
