// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render, screen } from "@testing-library/react"

type AuthCallback = (event: string, session: { access_token: string } | null) => void

const auth = vi.hoisted(() => ({
  listeners: [] as AuthCallback[],
  session: null as { access_token: string } | null,
}))

vi.mock("@/lib/supabase/client", () => ({
  getSupabaseBrowserClient: () => ({
    auth: {
      getSession: async () => ({ data: { session: auth.session } }),
      onAuthStateChange: (callback: AuthCallback) => {
        auth.listeners.push(callback)
        return { data: { subscription: { unsubscribe: vi.fn() } } }
      },
      updateUser: vi.fn(),
      signOut: vi.fn(),
    },
  }),
}))
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }))

import ResetPasswordPage from "@/app/(auth)/reset-password/page"

const signedIn = { access_token: "token-1" }
const form = () => screen.queryByLabelText("New password")
const invalid = () => screen.queryByText(/This reset link is invalid or has expired/)

async function renderAt(url: string) {
  window.history.replaceState(null, "", url)
  render(<ResetPasswordPage />)
  // Let getSession resolve, then pass the 3s wait for a recovery session.
  await act(async () => {
    await Promise.resolve()
  })
  await act(async () => {
    vi.advanceTimersByTime(3000)
  })
}

describe("reset password page", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    auth.listeners = []
    auth.session = null
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    window.history.replaceState(null, "", "/")
  })

  it("does not offer the form to an ordinary signed-in session without a reset link", async () => {
    auth.session = signedIn
    await renderAt("/reset-password")
    act(() => auth.listeners.forEach((listener) => listener("SIGNED_IN", signedIn)))

    expect(form()).toBeNull()
    expect(invalid()).not.toBeNull()
  })

  it("offers the form when the recovery event arrives", async () => {
    window.history.replaceState(null, "", "/reset-password#access_token=abc&type=recovery")
    render(<ResetPasswordPage />)
    act(() => auth.listeners.forEach((listener) => listener("PASSWORD_RECOVERY", signedIn)))

    expect(form()).not.toBeNull()
  })

  it("offers the form for a session that came with a recovery token in the URL", async () => {
    auth.session = signedIn
    await renderAt("/reset-password#access_token=abc&type=recovery")

    expect(form()).not.toBeNull()
    expect(invalid()).toBeNull()
  })

  it("accepts a PKCE recovery code in the query string", async () => {
    auth.session = signedIn
    await renderAt("/reset-password?code=abc")

    expect(form()).not.toBeNull()
  })
})
