import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

function readSql(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8")
    .toLowerCase()
    .replace(/\s+/g, " ")
}

const hardeningSql = readSql(
  "documentation/sql/supabase-security-hardening-migration.sql"
)
const filterSharesSql = readSql("documentation/sql/filter-shares-migration.sql")
const userExportsSql = readSql("documentation/user-exports-schema.sql")

describe("Supabase security migrations", () => {
  it("removes broad profile reads and keeps direct access owner-scoped", () => {
    expect(hardeningSql).toContain(
      'drop policy if exists "authenticated users can look up profiles by email"'
    )
    expect(hardeningSql).toContain("using (auth.uid() = user_id)")
    expect(hardeningSql).not.toContain("using (true)")
    expect(filterSharesSql).not.toContain("using (true)")
  })

  it("provides a narrowly scoped authenticated email lookup", () => {
    for (const sql of [hardeningSql, filterSharesSql]) {
      expect(sql).toContain("security definer")
      expect(sql).toContain("set search_path = ''")
      expect(sql).toContain(
        "revoke all on function public.lookup_profile_by_email(text) from public, anon"
      )
      expect(sql).toContain(
        "grant execute on function public.lookup_profile_by_email(text) to authenticated"
      )
    }
  })

  it("resolves shared-filter owner emails via a scoped definer function", () => {
    for (const sql of [hardeningSql, filterSharesSql]) {
      expect(sql).toContain(
        "create or replace function public.lookup_shared_filter_owner_emails()"
      )
      expect(sql).toContain("security definer")
      expect(sql).toContain("set search_path = ''")
      expect(sql).toContain("where fs.shared_with_user_id = auth.uid()")
      expect(sql).toContain(
        "revoke all on function public.lookup_shared_filter_owner_emails() from public, anon"
      )
      expect(sql).toContain(
        "grant execute on function public.lookup_shared_filter_owner_emails() to authenticated"
      )
    }
  })

  it("enforces row level security on all browser-exposed tables", () => {
    for (const table of [
      "public.profiles",
      "public.saved_filters",
      "public.filter_shares",
      "public.user_favorites",
      "public.user_exports",
    ]) {
      expect(hardeningSql).toContain(
        `alter table ${table} enable row level security`
      )
    }
  })

  it("removes broad browser grants and protects server-managed exports", () => {
    expect(hardeningSql).toContain("from anon")
    expect(hardeningSql).toContain("from authenticated")
    expect(hardeningSql).not.toContain(
      "grant insert on table public.user_exports to authenticated"
    )
    expect(userExportsSql).toContain(
      "revoke all on table public.user_exports from anon, authenticated"
    )
    expect(userExportsSql).not.toContain(
      'create policy "users insert own exports"'
    )
    expect(userExportsSql).not.toContain(
      'create policy "users read own export objects"'
    )
  })

  it("prevents browser clients from changing authorization fields", () => {
    expect(hardeningSql).toContain("tour_completed_at")
    expect(hardeningSql).toContain("tour_version")
    expect(hardeningSql).not.toContain("grant update (role")
    expect(hardeningSql).not.toContain("grant update (credits_remaining")
  })
})
