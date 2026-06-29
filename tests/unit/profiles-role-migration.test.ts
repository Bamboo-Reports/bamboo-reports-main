import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const migrationSql = readFileSync(
  resolve(process.cwd(), "documentation/sql/profiles-role-migration.sql"),
  "utf8"
).replace(/\s+/g, " ")

describe("profiles role migration", () => {
  it("prevents browser clients from inserting admin profiles", () => {
    expect(migrationSql).toContain("with check (auth.uid() = user_id and role = 'viewer')")
    expect(migrationSql).toContain("grant insert (user_id, first_name, last_name, email, phone) on public.profiles to authenticated")
  })

  it("prevents browser clients from updating profile roles", () => {
    expect(migrationSql).toContain("revoke insert, update on public.profiles from authenticated")
    expect(migrationSql).toContain("tour_completed_at")
    expect(migrationSql).toContain("tour_version")
    expect(migrationSql).not.toContain("grant update (role)")
    expect(migrationSql).not.toContain("grant update (credits_remaining)")
  })
})
