import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

function readSql(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8")
    .toLowerCase()
    .replace(/\s+/g, " ")
}

const rateLimitsSql = readSql("documentation/sql/rate-limits-migration.sql")

describe("rate limits migration", () => {
  it("creates a per-user, per-bucket, per-window counter table", () => {
    expect(rateLimitsSql).toContain("create table if not exists public.rate_limit_counters")
    expect(rateLimitsSql).toContain("primary key (user_id, bucket_key, window_start)")
    expect(rateLimitsSql).toContain("references auth.users(id) on delete cascade")
  })

  it("locks the table down to server-side (service role) access only", () => {
    expect(rateLimitsSql).toContain("alter table public.rate_limit_counters enable row level security")
    expect(rateLimitsSql).toContain(
      "revoke all on table public.rate_limit_counters from anon, authenticated"
    )
  })

  it("exposes an atomic increment via a scoped security-definer function", () => {
    expect(rateLimitsSql).toContain(
      "create or replace function public.increment_rate_limit(" +
        " p_user_id uuid, p_bucket text, p_window_start timestamptz )"
    )
    expect(rateLimitsSql).toContain("security definer")
    expect(rateLimitsSql).toContain("set search_path = ''")
    expect(rateLimitsSql).toContain("on conflict (user_id, bucket_key, window_start)")
  })

  it("grants execution of the increment only to the service role", () => {
    expect(rateLimitsSql).toContain(
      "revoke all on function public.increment_rate_limit(uuid, text, timestamptz) from public, anon, authenticated"
    )
    expect(rateLimitsSql).toContain(
      "grant execute on function public.increment_rate_limit(uuid, text, timestamptz) to service_role"
    )
  })
})
