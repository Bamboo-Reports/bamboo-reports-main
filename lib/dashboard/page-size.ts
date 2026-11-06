/**
 * The one place the table page size is defined. The tables import the options
 * and default for their footer, and the query routes use the same default and
 * the cap when a request leaves the size out or sends one that is not a number.
 */
export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const
export type PageSizeOption = (typeof PAGE_SIZE_OPTIONS)[number]
export const DEFAULT_PAGE_SIZE: PageSizeOption = 25
/** The query API caps a page at this many rows. */
export const MAX_PAGE_SIZE = 100

export function isPageSizeOption(value: unknown): value is PageSizeOption {
  return (PAGE_SIZE_OPTIONS as readonly unknown[]).includes(value)
}
