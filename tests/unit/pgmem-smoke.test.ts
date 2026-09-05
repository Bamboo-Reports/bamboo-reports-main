import { describe, it, expect } from "vitest"
import { newDb } from "pg-mem"

function freshDb() {
  const db = newDb()
  const { Pool } = db.adapters.createPg()
  return new Pool()
}

describe("pg-mem primitives for the filter translation", () => {
  it("handles the value/keyword/cascade primitives", async () => {
    const pool = freshDb()
    await pool.query(`create table accounts (name text, country text, rev bigint, vis text)`)
    await pool.query(`create table tech (cn text, sw text)`)
    await pool.query(`create table centers (cn text, name text)`)
    await pool.query(
      `insert into accounts values ('Acme','United States',500,'include'),('Beta',null,null,'exclude'),('Gamma','India',0,'include')`
    )
    await pool.query(`insert into centers values ('c1','Acme'),('c2','Gamma')`)
    await pool.query(`insert into tech values ('c1','Salesforce CRM'),('c1','SAP'),('c2','Oracle')`)

    // = ANY with a null column value (null must NOT match -> excluded)
    const inc = await pool.query(`select name from accounts where country = any($1::text[]) order by 1`, [["United States", "India"]])
    expect(inc.rows.map((r: { name: string }) => r.name)).toEqual(["Acme", "Gamma"])

    // exclude with null passthrough: (col is null or not (col = any(...)))
    const exc = await pool.query(
      `select name from accounts where (country is null or not (country = any($1::text[]))) order by 1`,
      [["India"]]
    )
    expect(exc.rows.map((r: { name: string }) => r.name)).toEqual(["Acme", "Beta"])

    // LIKE literal substring (pattern pre-escaped + wrapped), case-insensitive
    const kw = await pool.query(`select cn from tech where lower(coalesce(sw,'')) like $1 order by 1`, ["%crm%"])
    expect(kw.rows.map((r: { cn: string }) => r.cn)).toEqual(["c1"])

    // range with null/zero bucket excluded (includeNull=false): rev 500 in, 0/null out
    const rng = await pool.query(
      `select name from accounts where coalesce(rev,0) <> 0 and coalesce(rev,0) between $1 and $2 order by 1`,
      [1, 1000000]
    )
    expect(rng.rows.map((r: { name: string }) => r.name)).toEqual(["Acme"])

    // chained CTE + IN + NOT IN + distinct
    const chained = await pool.query(
      `with sw_centers as (select distinct cn from tech where lower(coalesce(sw,'')) like $1)
       select name from centers where cn in (select cn from sw_centers) order by 1`,
      ["%oracle%"]
    )
    expect(chained.rows.map((r: { name: string }) => r.name)).toEqual(["Gamma"])

    // count(*)::int
    const cnt = await pool.query(`select count(*)::int as total from accounts`)
    expect(cnt.rows[0].total).toBe(3)
  })
})
