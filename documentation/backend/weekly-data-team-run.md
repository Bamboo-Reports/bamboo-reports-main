# Weekly Data Team Run

> **Scope:** The weekly steps from the data team's new spreadsheet to the production dashboard. How the tools work is in [ETL Pipeline](etl-pipeline.md) (§7 sheet tools, §8 sync, §5b a busy sheet).

The data team sends a new copy of their spreadsheet ("CM/SM-Centers Master") every week. Its `BR`, `CM` and `SM` tabs become the main sheet's `accounts`, `centers` and `services`. Run every command from the repo root.

---

## 1. Share the new sheet with the service account

In the data team's new sheet: **Share**, add `br-ingest-five@bamboo-reports.iam.gserviceaccount.com` as an **Editor** (cleanup writes to their sheet), untick "Notify people", **Share**.

## 2. Point the ETL at it

Copy the spreadsheet ID from the sheet's URL, the part between `/d/` and `/edit`:

```
https://docs.google.com/spreadsheets/d/1dy-wMoT5zGtNKP4Bm108l7c2jmpk6mAi3k7YI__F6Zc/edit
                                       └──────────────── the ID ───────────────────┘
```

Set it in `etl/.env`:

```
DATA_TEAM_SPREADSHEET_ID=<new id>
```

## 3. Clean and check their sheet

```bash
etl/cleanup.sh  --source data-team               # preview what it fixes
etl/cleanup.sh  --source data-team --apply       # write the fixes (asks y/N)
etl/validate.sh --source data-team --force       # must end in PASSED
```

Cleanup fixes formatting on its own: invisible characters, dropdowns, link tidying, short month names, typed-number formulas, `india` to `India`. Whatever validate still lists needs a person: fix it in **their** sheet, then run validate again until it passes. `--highlight` colours the failing rows and cells in their sheet.

**Renamed headers.** When the data team renames a column, or a year rolls over ("HQ Forbes 2026" becoming 2027, "Employees Count Linkedin ( June 2026 )"), validate's Phase 0 reports `Missing column` or `Unmapped column`. Update that line in `etl/sources/data-team.toml` (our column on the left, their header on the right) and run validate again.

## 4. Sync into the main sheet

```bash
etl/sync.sh --source data-team                   # preview: new rows, what each column gets, the cells that change
etl/sync.sh --source data-team --apply           # back up the main sheet, then replace its rows (asks y/N)
```

Read the preview before applying. Expect a handful of new accounts and centers and some field changes; a large unexpected number means something shifted in their sheet.

`--apply` first copies the whole main sheet into the Shared Drive (`Backups/YYYY-MM/`) and prints the backup's link; nothing is written if the backup fails. Sync fills `cn_unique_key` and lat/lng by itself, and keeps your formula columns.

**If the main sheet freezes.** `! Still waiting on Google Sheets ...` and `Retrying ...` lines are normal while it recalculates. If the run gives up, run the same command again: it replaces rather than appends, so a repeat is safe. `--sheets centers,services` runs only the sheets that were left.

**A new city.** Sync looks it up on OpenStreetMap and adds it to `etl/sources/geo.csv`; the summary names it. If it says `No coordinates found`, add a row for that place to `geo.csv` by hand and sync again.

## 5. Update the sheets the data team does not send

Their sheet has no `alias`, `ticker` or `tech` tab, so in the **main** sheet:

- **New accounts:** add a row to `alias` and to `ticker` for each one (uuid, account name, and the rest of the research).
- **`tech`:** update it for new or changed centers.
- **Renamed accounts:** a name changed in `accounts` must change in `alias`, `ticker` and `prospects` too.

Validate (next step) names everything still missing.

## 6. Check the main sheet

```bash
etl/validate.sh --force                          # must end in PASSED
```

Delete any helper column you added while working (a column with no header fails Phase 0).

## 7. Import

```bash
etl/import.sh --dry-run                          # preview against dev, nothing written
etl/import.sh                                    # dev
etl/import.sh --target prod                      # prod (asks to confirm), then purges the dashboard cache
```

After the dev import, check the app locally: the new accounts, a few new centers, the GCC / NON-GCC toggle. If it still shows last week's numbers, restart `npm run dev` (it keeps an in-memory copy for up to 5 minutes). The prod import purges the cache for every environment, so the live dashboard is current from its next load.

---

## Quick reference

```bash
# after sharing the sheet and setting DATA_TEAM_SPREADSHEET_ID in etl/.env
etl/cleanup.sh  --source data-team --apply
etl/validate.sh --source data-team --force
etl/sync.sh     --source data-team --apply
#   alias, ticker, tech in the main sheet
etl/validate.sh --force
etl/import.sh
etl/import.sh --target prod
```

## Rolling back

- **The main sheet:** open the backup sync printed (Shared Drive, `Backups/YYYY-MM/`) and copy its `accounts`, `centers` and `services` tabs back over the main sheet's.
- **The database:** fix the sheet, then import again. Each import replaces the tables.
