// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render } from "@testing-library/react"
import { AccountDetailsDialog } from "@/components/dialogs/account-details-tabbed-dialog"
import { requestAccountFinancialInfo } from "@/lib/finance/request-client"
import type { Account } from "@/lib/types"

vi.mock("@/lib/finance/request-client", () => ({ requestAccountFinancialInfo: vi.fn() }))
vi.mock("@/lib/analytics/client", () => ({ captureEvent: vi.fn() }))
vi.mock("@/contexts/record-history-context", () => ({ useRecordHistory: () => () => {} }))
vi.mock("@/hooks/use-account-related", () => ({
  useAccountRelated: () => ({ data: null, loading: false, error: null, retry: () => {} }),
}))
vi.mock("@/components/maps/centers-map", () => ({ CentersMap: () => null }))
vi.mock("@/components/charts/tech-treemap", () => ({ TechTreemap: () => null }))
vi.mock("@/components/dialogs/center-details-dialog", () => ({ CenterDetailsDialog: () => null }))
vi.mock("@/components/dialogs/prospect-details-dialog", () => ({ ProspectDetailsDialog: () => null }))

const requestMock = vi.mocked(requestAccountFinancialInfo)

beforeAll(() => {
  global.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
})

const account = (name: string, ticker: string) =>
  ({
    account_global_legal_name: name,
    account_hq_stock_ticker: ticker,
    account_hq_country: "United States",
  }) as unknown as Account

function renderDialog(initial: Account) {
  const props = { centers: [], prospects: [], services: [], tech: [], open: true, onOpenChange: () => {} }
  const view = render(<AccountDetailsDialog account={initial} {...props} />)
  return { ...view, show: (next: Account) => view.rerender(<AccountDetailsDialog account={next} {...props} />) }
}

const settle = () => act(async () => {
  await Promise.resolve()
  await Promise.resolve()
})

describe("AccountDetailsDialog financials", () => {
  beforeEach(() => {
    requestMock.mockReset()
    requestMock.mockResolvedValue({ success: true, data: { exchange: "NYSE" } } as never)
  })

  afterEach(() => {
    cleanup()
  })

  it("loads once per account when switching to an account with another ticker", async () => {
    const { show } = renderDialog(account("Acme Corp", "ACME"))
    await settle()
    expect(requestMock).toHaveBeenCalledTimes(1)
    expect(requestMock).toHaveBeenLastCalledWith("ACME", "United States", "Acme Corp")

    show(account("Globex Inc", "GLBX"))
    await settle()
    expect(requestMock).toHaveBeenCalledTimes(2)
    expect(requestMock).toHaveBeenLastCalledWith("GLBX", "United States", "Globex Inc")
  })

  it("loads again for another account that shares the ticker", async () => {
    const { show } = renderDialog(account("Acme Corp", "ACME"))
    await settle()
    show(account("Acme Holdings", "ACME"))
    await settle()
    expect(requestMock).toHaveBeenCalledTimes(2)
    expect(requestMock).toHaveBeenLastCalledWith("ACME", "United States", "Acme Holdings")
  })

  it("does not load again when the same account re-renders", async () => {
    const { show } = renderDialog(account("Acme Corp", "ACME"))
    await settle()
    show(account("Acme Corp", "ACME"))
    await settle()
    expect(requestMock).toHaveBeenCalledTimes(1)
  })
})
