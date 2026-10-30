// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { AccountPicker } from "@/components/filters/account-picker"
import { fetchAccountAutocomplete } from "@/lib/dashboard/api-client"
import { createQueryWrapper } from "../fixtures/query-client"

vi.mock("@/lib/dashboard/api-client", () => ({ fetchAccountAutocomplete: vi.fn() }))

const fetchMock = vi.mocked(fetchAccountAutocomplete)

beforeAll(() => {
  global.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
})

function openPicker(onChange = vi.fn()) {
  render(<AccountPicker value={null} onChange={onChange} />, { wrapper: createQueryWrapper() })
  fireEvent.click(screen.getByRole("combobox"))
  return screen.getByLabelText("Search accounts")
}

describe("AccountPicker", () => {
  beforeEach(() => {
    fetchMock.mockReset()
  })

  afterEach(() => {
    cleanup()
  })

  it("asks for two characters before searching", () => {
    const input = openPicker()
    fireEvent.change(input, { target: { value: "a" } })
    expect(screen.getByText("Type at least 2 characters to search")).toBeTruthy()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("searches the debounced term and lets a result be picked", async () => {
    fetchMock.mockResolvedValue({ suggestions: [{ value: "Infosys Ltd." }] })
    const onChange = vi.fn()
    const input = openPicker(onChange)
    fireEvent.change(input, { target: { value: "Infosys" } })
    expect(screen.getByText("Searching...")).toBeTruthy()

    fireEvent.click(await screen.findByRole("option", { name: /Infosys Ltd\./ }))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith("infosys")
    expect(onChange).toHaveBeenCalledWith("Infosys Ltd.")
  })

  it("stops searching and shows no results when the lookup fails", async () => {
    fetchMock.mockRejectedValue(new Error("Request failed (500)"))
    const input = openPicker()
    fireEvent.change(input, { target: { value: "acme" } })
    await waitFor(() => expect(screen.getByText("No accounts found")).toBeTruthy())
  })
})
