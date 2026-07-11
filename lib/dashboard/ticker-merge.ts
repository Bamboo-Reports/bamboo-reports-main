import type { Account, Ticker } from "@/lib/types"

/**
 * Merges account_hq_stock_ticker from the ticker table onto account rows,
 * keyed by account_global_legal_name. Accounts without a ticker row get null.
 */
export function mergeTickersIntoAccounts(
  accounts: Account[],
  tickers: Pick<Ticker, "account_global_legal_name" | "account_hq_stock_ticker">[]
): Account[] {
  if (accounts.length === 0) return accounts
  const tickerByAccount = new Map(
    tickers.map((t) => [t.account_global_legal_name, t.account_hq_stock_ticker])
  )
  return accounts.map((account) => ({
    ...account,
    account_hq_stock_ticker: tickerByAccount.get(account.account_global_legal_name) ?? null,
  }))
}
