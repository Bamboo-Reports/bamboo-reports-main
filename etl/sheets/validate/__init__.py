"""
sheets.validate
---------------
Validates Google Sheets data in several phases:

  Phase 0 - Table Format Validation
      Per-column format/enum/nullable checks driven by ALL_RULES for:
        accounts, centers, services, prospects, ticker, alias, functions, tech,
        subscribers
      plus the header row of each: data under a blank header, columns no rule
      covers, duplicated headers and rule columns missing from the sheet (the
      import drops unnamed and unknown columns without a word).

  Phase 0B - Invisible Characters
      Flags cells containing zero-width spaces, BOMs, or soft hyphens
      (paste artifacts that corrupt keys, sorting, and search downstream).

  Phase 0C - Chips and Dropdowns
      Every cell must be plain text: no smart chips (a people chip holding an
      email is skipped by VLOOKUP) and no dropdowns. Read from cell metadata,
      one extra API call per sheet.

  Phase 1 - Uniqueness Checks
      Ensures primary key columns contain no duplicates:
        - accounts.account_global_legal_name
        - centers.cn_unique_key
        - services.cn_unique_key
        - prospects.ps_unique_key
        - subscribers: prospect_email + prospect_engaged_campaign +
          prospect_engaged_date together (the same engagement twice)

  Phase 2 - Referential Integrity
      Rule 1 - "account_global_legal_name"
          Source of truth : accounts
          Validated in    : centers, services, prospects, tech, alias, ticker
          Completeness    : every accounts row must be present in alias and ticker

      Rule 2 - "center_name"
          Source of truth : centers
          Validated in    : services

      Rule 3 - "cn_unique_key"
          Source of truth : centers
          Validated in    : services, functions, tech

      Rule 4 - "prospect_email"
          Source of truth : prospects
          Validated in    : subscribers (case-insensitive, like the ETL join)

  Phase 2C - Engagement Flags (warning only)
      prospects.prospect_engaged must be Yes exactly when the prospect's email
      appears in subscribers.

  Phase 3 - Service Coverage
      Every row in services must have at least one service column filled
      (service_it, service_ai, service_erd, service_fna, service_hr,
      service_procurement, service_sales_marketing, service_customer_support,
      service_others).

Uses a Google service-account for authentication. Configuration is read
from etl/.env (SPREADSHEET_ID, GOOGLE_SA_FILE).

Run with:
    uv run --directory etl python -m sheets.validate

Flags:
    --force              Keep going after a phase fails instead of stopping early.
    --limit N            Rows shown in each detail table (default 20). The
                         summary tables always show every sheet and rule.
    --exclude a,b,c      Skip the named sheets in every phase. A rule whose
                         source of truth is excluded is skipped with a warning.
    --highlight          Write the findings back into the spreadsheet: every row
                         with an issue gets a yellow background and the offending
                         cell(s) get a red background. Before painting, the
                         background of every data row in each validated sheet is
                         reset so highlights from earlier runs do not linger.
                         Only the phases that actually ran are highlighted, so
                         combine with --force to cover every phase in one go.
                         Needs read/write access for the service account.

Dependencies come from etl/pyproject.toml; uv installs them on first run.
"""
