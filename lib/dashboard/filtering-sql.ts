import type { Filters, FilterValue, AccountVisibilityMode } from "@/lib/types"

/**
 * Server-side SQL translation of the client filter engine in
 * lib/dashboard/filtering.ts (`getFilteredData`).
 *
 * The client loads the full warehouse into the browser and filters it in
 * memory. This module reproduces the SAME semantics as parameterized SQL so
 * the data can be filtered and paginated on the server instead. It is verified
 * against the client engine by golden-parity tests
 * (tests/unit/filtering-sql-parity.test.ts).
 *
 * Semantics that MUST match the client engine exactly:
 *  - value matchers (createValueMatcher): include = OR whitelist, exclude =
 *    blacklist (exclude wins), a NULL column value passes only when there are
 *    no include values.
 *  - keyword matchers (createKeywordMatcher): case-insensitive LITERAL
 *    substring (LIKE with escaped metacharacters), OR across includes, NOT any
 *    exclude, NULL treated as "".
 *  - range matchers (rangeFilterMatch): a real 0 is treated like NULL and
 *    gated by the includeNull flag.
 *  - account visibility: gcc => 'include', nonGcc => 'exclude', all => no
 *    filter; skipped entirely when an explicit account-name search is active.
 *  - the bidirectional cascade: account filters narrow centers/prospects;
 *    prospect filters narrow back to accounts/centers; the services-offered
 *    (functions) and software (tech) filters narrow centers; and, when centers
 *    are enabled, an account only survives if it has at least one surviving
 *    center.
 *
 * Cascade is expressed with NON-correlated `IN (SELECT ...)` CTEs, mirroring
 * the engine's Set logic (accountNameSet, centerKeySet) one-for-one.
 */

export type FilterAccess = {
  accountsEnabled?: boolean
  centersEnabled?: boolean
  prospectsEnabled?: boolean
}

export type SqlQuery = { text: string; values: unknown[] }

export type EntityQueryOptions = {
  /** Raw SQL column list to select. Defaults to the entity id column. */
  columns?: string
  /** ORDER BY expression, or null to omit ordering. */
  orderBy?: string | null
  /** LIMIT value; when set, OFFSET is also emitted. */
  limit?: number
  /** OFFSET value (defaults to 0 when limit is set). */
  offset?: number
  /**
   * Emit CTEs as `AS MATERIALIZED` (default true). Materialization is a pure
   * planner hint (no effect on results) that avoids a nested-loop explosion
   * from the planner under-estimating the CTE cardinalities on the real
   * warehouse. Set false for pg-mem, which does not parse the keyword.
   */
  materialized?: boolean
}

export const ACCOUNT_ID_COLUMN = "account_global_legal_name"
export const CENTER_ID_COLUMN = "cn_unique_key"
export const PROSPECT_ID_COLUMN = "ps_unique_key"

// ---------------------------------------------------------------------------
// Parameter accumulator
// ---------------------------------------------------------------------------

class Params {
  readonly values: unknown[] = []
  add(value: unknown): string {
    this.values.push(value)
    return `$${this.values.length}`
  }
}

// ---------------------------------------------------------------------------
// Clause builders (each mirrors a matcher in filtering.ts)
// ---------------------------------------------------------------------------

function splitValues(fvs: FilterValue[]): { include: string[]; exclude: string[] } {
  const include: string[] = []
  const exclude: string[] = []
  for (const f of fvs) {
    if (f.mode === "exclude") exclude.push(f.value)
    else include.push(f.value)
  }
  return { include: [...new Set(include)], exclude: [...new Set(exclude)] }
}

/** Mirrors createValueMatcher: exact string equality with include/exclude sets. */
function valueClause(
  col: string,
  fvs: FilterValue[],
  p: Params,
  opts: { coalesceEmpty?: boolean } = {}
): string | null {
  if (fvs.length === 0) return null
  const { include, exclude } = splitValues(fvs)
  const val = opts.coalesceEmpty ? `coalesce(${col}, '')` : col
  const parts: string[] = []
  if (exclude.length > 0) {
    // exclude wins; a NULL value passes the exclude test (matches JS where the
    // exclude branch only rejects a concrete matching value).
    parts.push(`(${val} is null or not (${val} = any(${p.add(exclude)}::text[])))`)
  }
  if (include.length > 0) {
    // include required; NULL is not in the set so it is excluded (matches JS
    // where a NULL value fails when include values are present).
    parts.push(`${val} = any(${p.add(include)}::text[])`)
  }
  if (parts.length === 0) return null
  return `(${parts.join(" and ")})`
}

function escapeLike(s: string): string {
  return s.replace(/([\\%_])/g, "\\$1")
}

/**
 * Mirrors createKeywordMatcher: case-insensitive literal substring.
 *
 * Uses `col ILIKE '%kw%'` on the RAW column (not lower(coalesce(...))) so the
 * GIN pg_trgm indexes on account_global_legal_name / prospect_title /
 * software_in_use (created by the ETL, etl/V2/main.py) can be used; a
 * functional wrapper would force a seq scan. NULL is handled explicitly to
 * preserve the engine's "NULL treated as ''" semantics.
 */
function keywordClause(col: string, fvs: FilterValue[], p: Params): string | null {
  if (fvs.length === 0) return null
  const include: string[] = []
  const exclude: string[] = []
  for (const f of fvs) {
    if (f.mode === "exclude") exclude.push(f.value)
    else include.push(f.value)
  }
  const like = (kw: string) => `${col} ilike ${p.add(`%${escapeLike(kw)}%`)}`
  const parts: string[] = []
  if (exclude.length > 0) {
    // NULL (treated as "") never contains a non-empty exclude keyword, so it
    // passes the exclude test.
    parts.push(`(${col} is null or not (${exclude.map(like).join(" or ")}))`)
  }
  if (include.length > 0) {
    parts.push(`(${include.map(like).join(" or ")})`)
  }
  if (parts.length === 0) return null
  return `(${parts.join(" and ")})`
}

/** Mirrors rangeFilterMatch: a value of 0/NULL falls in the includeNull bucket. */
function rangeClause(col: string, range: [number, number], includeNull: boolean, p: Params): string {
  const v = `coalesce(${col}, 0)`
  const min = p.add(range[0])
  const max = p.add(range[1])
  if (includeNull) {
    return `(${v} = 0 or (${v} >= ${min} and ${v} <= ${max}))`
  }
  return `(${v} <> 0 and ${v} >= ${min} and ${v} <= ${max})`
}

/** Mirrors matchAccountVisibility, applied only when no explicit name search. */
function visibilityClause(mode: AccountVisibilityMode, apply: boolean): string | null {
  if (!apply) return null
  const resolved = mode ?? "gcc"
  if (resolved === "all") return null
  if (resolved === "nonGcc") return "account_visibility = 'exclude'"
  return "account_visibility = 'include'"
}

function andAll(clauses: (string | null)[]): string {
  const active = clauses.filter((c): c is string => c != null && c !== "")
  if (active.length === 0) return "true"
  return active.join(" and ")
}

function memberIn(col: string, cte: string): string {
  return `${col} in (select ${col} from ${cte})`
}

// ---------------------------------------------------------------------------
// Predicates
// ---------------------------------------------------------------------------

function accountPredicate(f: Filters, p: Params): string {
  const hasNameSearch = f.accountGlobalLegalNameKeywords.length > 0
  return andAll([
    valueClause("account_hq_region", f.accountHqRegionValues, p),
    valueClause("account_hq_country", f.accountHqCountryValues, p),
    valueClause("account_hq_industry", f.accountHqIndustryValues, p),
    valueClause("account_data_coverage", f.accountDataCoverageValues, p),
    valueClause("account_source", f.accountSourceValues, p),
    valueClause("account_type", f.accountTypeValues, p),
    valueClause("account_primary_category", f.accountPrimaryCategoryValues, p),
    valueClause("account_primary_nature", f.accountPrimaryNatureValues, p),
    valueClause("account_nasscom_status", f.accountNasscomStatusValues, p),
    valueClause("account_hq_employee_range", f.accountHqEmployeeRangeValues, p),
    valueClause("account_center_employees_range", f.accountCenterEmployeesRangeValues, p, { coalesceEmpty: true }),
    rangeClause("account_hq_revenue", f.accountHqRevenueRange, f.accountHqRevenueIncludeNull, p),
    rangeClause("years_in_india", f.accountYearsInIndiaRange, f.yearsInIndiaIncludeNull, p),
    keywordClause("account_global_legal_name", f.accountGlobalLegalNameKeywords, p),
    visibilityClause(f.accountVisibilityMode, !hasNameSearch),
  ])
}

function prospectPredicate(f: Filters, p: Params): string {
  return andAll([
    valueClause("prospect_department", f.prospectDepartmentValues, p),
    valueClause("head_type", f.prospectHeadTypeValues, p),
    valueClause("prospect_level", f.prospectLevelValues, p),
    valueClause("prospect_city", f.prospectCityValues, p),
    keywordClause("prospect_title", f.prospectTitleKeywords, p),
  ])
}

/** Center-in-use software filter, expressed as tech-row set membership. */
function softwareClause(f: Filters, p: Params): string | null {
  if (f.techSoftwareInUseKeywords.length === 0) return null
  const include: string[] = []
  const exclude: string[] = []
  for (const kw of f.techSoftwareInUseKeywords) {
    const v = kw.value.toLowerCase()
    if (kw.mode === "exclude") exclude.push(v)
    else include.push(v)
  }
  const techLike = (kws: string[]) =>
    kws.map((kw) => `software_in_use ilike ${p.add(`%${escapeLike(kw)}%`)}`).join(" or ")
  const parts: string[] = []
  if (exclude.length > 0) {
    parts.push(`cn_unique_key not in (select cn_unique_key from tech where ${techLike(exclude)})`)
  }
  if (include.length > 0) {
    parts.push(`cn_unique_key in (select cn_unique_key from tech where ${techLike(include)})`)
  }
  if (parts.length === 0) return null
  return `(${parts.join(" and ")})`
}

// ---------------------------------------------------------------------------
// Flags (mirror getFilteredData's hasAccountFilters / hasProspectFilters etc.)
// ---------------------------------------------------------------------------

type Flags = ReturnType<typeof computeFlags>

function computeFlags(f: Filters, access: FilterAccess) {
  const ae = access.accountsEnabled ?? true
  const ce = access.centersEnabled ?? true
  const pe = access.prospectsEnabled ?? true

  const hasNameSearch = f.accountGlobalLegalNameKeywords.length > 0

  const haf =
    f.accountHqRegionValues.length > 0 ||
    f.accountHqCountryValues.length > 0 ||
    f.accountHqIndustryValues.length > 0 ||
    f.accountDataCoverageValues.length > 0 ||
    f.accountSourceValues.length > 0 ||
    f.accountTypeValues.length > 0 ||
    f.accountPrimaryCategoryValues.length > 0 ||
    f.accountPrimaryNatureValues.length > 0 ||
    f.accountNasscomStatusValues.length > 0 ||
    f.accountHqEmployeeRangeValues.length > 0 ||
    f.accountCenterEmployeesRangeValues.length > 0 ||
    (f.accountVisibilityMode ?? "gcc") !== "all" ||
    f.accountHqRevenueRange[0] > 0 ||
    f.accountHqRevenueRange[1] < Number.MAX_SAFE_INTEGER ||
    f.accountHqRevenueIncludeNull ||
    f.accountYearsInIndiaRange[0] > 0 ||
    f.accountYearsInIndiaRange[1] < Number.MAX_SAFE_INTEGER ||
    f.yearsInIndiaIncludeNull ||
    f.accountGlobalLegalNameKeywords.length > 0

  const rawHpf =
    f.prospectDepartmentValues.length > 0 ||
    f.prospectHeadTypeValues.length > 0 ||
    f.prospectLevelValues.length > 0 ||
    f.prospectCityValues.length > 0 ||
    f.prospectTitleKeywords.length > 0

  const hff = f.functionNameValues.length > 0
  const hsf = f.techSoftwareInUseKeywords.length > 0

  return {
    ae,
    ce,
    pe,
    hasNameSearch,
    haf,
    rawHpf,
    hff,
    hsf,
    effHpf: rawHpf && pe,
    effHff: hff && ce,
  }
}

// ---------------------------------------------------------------------------
// CTE assembly
// ---------------------------------------------------------------------------

const CTE_ORDER = ["acc0", "func_centers", "prospect_accounts", "surviving_centers", "final_accounts"] as const
type CteName = (typeof CTE_ORDER)[number]

function centerSurvivesPredicate(f: Filters, p: Params, flags: Flags): string {
  return andAll([
    valueClause("center_type", f.centerTypeValues, p),
    valueClause("center_focus", f.centerFocusValues, p),
    valueClause("center_city", f.centerCityValues, p),
    valueClause("center_state", f.centerStateValues, p),
    valueClause("center_country", f.centerCountryValues, p),
    valueClause("center_employees_range", f.centerEmployeesRangeValues, p),
    valueClause("center_status", f.centerStatusValues, p),
    rangeClause("center_inc_year", f.centerIncYearRange, f.centerIncYearIncludeNull, p),
    flags.hsf ? softwareClause(f, p) : null,
    flags.haf ? memberIn("account_global_legal_name", "acc0") : null,
    flags.effHff ? memberIn("cn_unique_key", "func_centers") : null,
    flags.effHpf ? memberIn("account_global_legal_name", "prospect_accounts") : null,
  ])
}

/**
 * Resolve the transitive set of CTEs referenced by `roots`, then emit them in
 * canonical order. Predicates (and their params) are built at emit time so the
 * parameter order always matches the SQL text order.
 */
function buildWith(roots: CteName[], f: Filters, p: Params, flags: Flags, materialized: boolean): string {
  const M = materialized ? "materialized " : ""
  const needed = new Set<CteName>(roots)
  // Expand dependents-first so nested deps are captured (canonical order has
  // dependents last, so walk it in reverse).
  if (needed.has("final_accounts")) {
    needed.add("acc0")
    if (flags.effHpf) needed.add("prospect_accounts")
    if (flags.ce) needed.add("surviving_centers")
  }
  if (needed.has("surviving_centers")) {
    if (flags.haf) needed.add("acc0")
    if (flags.effHff) needed.add("func_centers")
    if (flags.effHpf) needed.add("prospect_accounts")
  }

  const builders: Record<CteName, () => string> = {
    acc0: () => `acc0 as ${M}(select account_global_legal_name from accounts where ${accountPredicate(f, p)})`,
    func_centers: () =>
      `func_centers as ${M}(select distinct cn_unique_key from functions where ${
        valueClause("function_name", f.functionNameValues, p) ?? "true"
      })`,
    prospect_accounts: () =>
      `prospect_accounts as ${M}(select distinct account_global_legal_name from prospects where ${prospectPredicate(f, p)})`,
    surviving_centers: () =>
      `surviving_centers as ${M}(select cn_unique_key, account_global_legal_name from centers where ${centerSurvivesPredicate(
        f,
        p,
        flags
      )})`,
    final_accounts: () =>
      `final_accounts as ${M}(select account_global_legal_name from acc0 where ${andAll([
        flags.effHpf ? memberIn("account_global_legal_name", "prospect_accounts") : null,
        flags.ce ? memberIn("account_global_legal_name", "surviving_centers") : null,
      ])})`,
  }

  const parts = CTE_ORDER.filter((name) => needed.has(name)).map((name) => builders[name]())
  return `with ${parts.join(",\n")}`
}

// ---------------------------------------------------------------------------
// Public entity query builders
// ---------------------------------------------------------------------------

function emptyQuery(columns: string, table: string): SqlQuery {
  return { text: `select ${columns} from ${table} where false`, values: [] }
}

function withPagination(text: string, p: Params, opts: EntityQueryOptions): string {
  let out = text
  if (opts.orderBy !== null) {
    out += ` order by ${opts.orderBy ?? ""}`
  }
  if (opts.limit != null) {
    out += ` limit ${p.add(opts.limit)} offset ${p.add(opts.offset ?? 0)}`
  }
  return out
}

export function buildAccountsQuery(f: Filters, access: FilterAccess = {}, opts: EntityQueryOptions = {}): SqlQuery {
  const flags = computeFlags(f, access)
  const columns = opts.columns ?? ACCOUNT_ID_COLUMN
  if (!flags.ae) return emptyQuery(columns, "accounts")

  const p = new Params()
  const withClause = buildWith(["final_accounts"], f, p, flags, opts.materialized ?? true)
  const orderBy = opts.orderBy === undefined ? `${ACCOUNT_ID_COLUMN} asc` : opts.orderBy
  let text = `${withClause} select ${columns} from accounts where ${memberIn(
    ACCOUNT_ID_COLUMN,
    "final_accounts"
  )}`
  text = withPagination(text, p, { ...opts, orderBy })
  return { text, values: p.values }
}

export function buildAccountsCountQuery(f: Filters, access: FilterAccess = {}): SqlQuery {
  const flags = computeFlags(f, access)
  if (!flags.ae) return { text: `select 0 as total`, values: [] }
  const p = new Params()
  const withClause = buildWith(["final_accounts"], f, p, flags, true)
  return { text: `${withClause} select count(*)::int as total from final_accounts`, values: p.values }
}

export function buildCentersQuery(f: Filters, access: FilterAccess = {}, opts: EntityQueryOptions = {}): SqlQuery {
  const flags = computeFlags(f, access)
  const columns = opts.columns ?? CENTER_ID_COLUMN
  if (!flags.ce) return emptyQuery(columns, "centers")

  const p = new Params()
  const withClause = buildWith(["surviving_centers"], f, p, flags, opts.materialized ?? true)
  const orderBy = opts.orderBy === undefined ? `center_name asc` : opts.orderBy
  let text = `${withClause} select ${columns} from centers where ${memberIn(CENTER_ID_COLUMN, "surviving_centers")}`
  text = withPagination(text, p, { ...opts, orderBy })
  return { text, values: p.values }
}

export function buildCentersCountQuery(f: Filters, access: FilterAccess = {}): SqlQuery {
  const flags = computeFlags(f, access)
  if (!flags.ce) return { text: `select 0 as total`, values: [] }
  const p = new Params()
  const withClause = buildWith(["surviving_centers"], f, p, flags, true)
  return { text: `${withClause} select count(*)::int as total from surviving_centers`, values: p.values }
}

// finalAccountNameSet source, mirroring getFilteredData's precedence
// (accounts, else centers, else none when only prospects are enabled).
function prospectsRoots(flags: Flags): CteName[] {
  const roots: CteName[] = []
  if (flags.ae) roots.push("final_accounts")
  else if (flags.ce) roots.push("surviving_centers")
  if (flags.haf) roots.push("acc0")
  return roots
}

function prospectsWhereClause(f: Filters, p: Params, flags: Flags): string {
  const source = flags.ae
    ? memberIn("account_global_legal_name", "final_accounts")
    : flags.ce
      ? memberIn("account_global_legal_name", "surviving_centers")
      : null
  return andAll([
    flags.haf ? memberIn("account_global_legal_name", "acc0") : null,
    flags.rawHpf ? prospectPredicate(f, p) : null,
    source,
  ])
}

export function buildProspectsQuery(f: Filters, access: FilterAccess = {}, opts: EntityQueryOptions = {}): SqlQuery {
  const flags = computeFlags(f, access)
  const columns = opts.columns ?? PROSPECT_ID_COLUMN
  if (!flags.pe) return emptyQuery(columns, "prospects")

  const p = new Params()
  // The WITH is emitted before the WHERE, so build (and append params for) the
  // CTEs first, then the WHERE predicate, keeping param order aligned to text.
  const withClause = buildWith(prospectsRoots(flags), f, p, flags, opts.materialized ?? true)
  const where = prospectsWhereClause(f, p, flags)
  const orderBy = opts.orderBy === undefined ? `${PROSPECT_ID_COLUMN} asc` : opts.orderBy
  let text = `${withClause} select ${columns} from prospects where ${where}`
  text = withPagination(text, p, { ...opts, orderBy })
  return { text, values: p.values }
}

export function buildProspectsCountQuery(f: Filters, access: FilterAccess = {}): SqlQuery {
  const flags = computeFlags(f, access)
  if (!flags.pe) return { text: `select 0 as total`, values: [] }
  const p = new Params()
  const withClause = buildWith(prospectsRoots(flags), f, p, flags, true)
  const where = prospectsWhereClause(f, p, flags)
  return { text: `${withClause} select count(*)::int as total from prospects where ${where}`, values: p.values }
}

export type AggregateEntity = "accounts" | "centers" | "prospects" | "functions"

/**
 * Builds an aggregate/projection query over an entity's FILTERED set, reusing
 * the same cascade CTEs as the paginated queries. Powers the summary, facets
 * and charts endpoints.
 *
 * `select` (and optional `where`/`groupBy`) MUST be code-controlled SQL, never
 * user input. All user-supplied values enter only through `filters` (as bound
 * parameters).
 */
export function buildEntityAggregateQuery(
  entity: AggregateEntity,
  f: Filters,
  access: FilterAccess = {},
  select: string,
  opts: { groupBy?: string; where?: string; materialized?: boolean } = {}
): SqlQuery {
  const flags = computeFlags(f, access)
  const materialized = opts.materialized ?? true
  const tail = `${opts.where ? ` and (${opts.where})` : ""}${opts.groupBy ? ` group by ${opts.groupBy}` : ""}`
  const emptyText = `select ${select} from ${entity} where false${opts.groupBy ? ` group by ${opts.groupBy}` : ""}`
  const p = new Params()

  if (entity === "accounts") {
    if (!flags.ae) return { text: emptyText, values: [] }
    const withClause = buildWith(["final_accounts"], f, p, flags, materialized)
    return {
      text: `${withClause} select ${select} from accounts where ${memberIn(ACCOUNT_ID_COLUMN, "final_accounts")}${tail}`,
      values: p.values,
    }
  }

  if (entity === "centers") {
    if (!flags.ce) return { text: emptyText, values: [] }
    const withClause = buildWith(["surviving_centers"], f, p, flags, materialized)
    return {
      text: `${withClause} select ${select} from centers where ${memberIn(CENTER_ID_COLUMN, "surviving_centers")}${tail}`,
      values: p.values,
    }
  }

  if (entity === "functions") {
    // filteredFunctions = functions whose center survives (getFilteredData
    // re-filters functions by the final centerKeySet).
    if (!flags.ce) return { text: emptyText, values: [] }
    const withClause = buildWith(["surviving_centers"], f, p, flags, materialized)
    return {
      text: `${withClause} select ${select} from functions where ${memberIn(CENTER_ID_COLUMN, "surviving_centers")}${tail}`,
      values: p.values,
    }
  }

  if (!flags.pe) return { text: emptyText, values: [] }
  const withClause = buildWith(prospectsRoots(flags), f, p, flags, materialized)
  const where = prospectsWhereClause(f, p, flags)
  return { text: `${withClause} select ${select} from prospects where ${where}${tail}`, values: p.values }
}
