// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { AccountAutocomplete } from "@/components/filters/account-autocomplete"
import { fetchAccountAutocomplete } from "@/lib/dashboard/api-client"
import { createQueryWrapper } from "../fixtures/query-client"

vi.mock("@/lib/analytics/client", () => ({ captureEvent: () => {} }))
vi.mock("@/lib/dashboard/api-client", () => ({ fetchAccountAutocomplete: vi.fn() }))

const fetchMock = vi.mocked(fetchAccountAutocomplete)

function renderAutocomplete() {
  render(<AccountAutocomplete accountNames={[]} selectedAccounts={[]} onChange={() => {}} serverSuggest />, {
    wrapper: createQueryWrapper(),
  })
  return screen.getByRole("combobox")
}

async function type(input: HTMLElement, value: string, waitMs: number) {
  await act(async () => {
    fireEvent.change(input, { target: { value } })
  })
  await act(async () => {
    await vi.advanceTimersByTimeAsync(waitMs)
  })
  // The debounced query only starts once React has rendered, and TanStack
  // Query delivers its result on a 0ms timer, so let that timer run too.
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0)
  })
}

describe("AccountAutocomplete: searching state (#288)", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    fetchMock.mockReset()
    fetchMock.mockResolvedValue({ suggestions: [] })
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it("shows searching until the lookup lands, then no results", async () => {
    const input = renderAutocomplete()
    await act(async () => {
      fireEvent.change(input, { target: { value: "zzqx" } })
    })
    expect(screen.getByText("Searching accounts…")).toBeTruthy()

    await type(input, "zzqx", 300)
    expect(screen.queryByText("Searching accounts…")).toBeNull()
    expect(screen.getByText(/No accounts found/)).toBeTruthy()
  })

  it("does not stick on searching when a character is typed and deleted within the debounce", async () => {
    const input = renderAutocomplete()
    await type(input, "zzqx", 300)

    await type(input, "zzqxa", 100)
    await type(input, "zzqx", 400)

    expect(screen.queryByText("Searching accounts…")).toBeNull()
    expect(screen.getByText(/No accounts found/)).toBeTruthy()
  })
})
