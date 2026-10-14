#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.10"
# dependencies = [
#     "google-auth",
#     "gspread",
#     "python-dotenv",
#     "rich",
# ]
# ///

"""
validate.py
--------------------
Validates Google Sheets data in several phases:

  Phase 0 - Table Format Validation
      Per-column format/enum/nullable checks driven by ALL_RULES for:
        accounts, centers, services, prospects, ticker, alias, functions, tech,
        subscribers

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
from `.env` in the same directory.

Run with:
    uv run validate.py

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

The dependencies are declared in the PEP 723 metadata above and are installed
automatically by uv.
"""

import os
import re
import sys
import time
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

# Force UTF-8 output on Windows
sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")

import gspread
from dotenv import load_dotenv
from google.oauth2.service_account import Credentials

import cell_meta

# tui.py sits one level up in etl/, shared with the ETL in etl/V2.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import tui  # noqa: E402
from tui import console  # noqa: E402

# -- Shared patterns ----------------------------------------------------------
# Practical email validator (not full RFC 5322, but rejects the common bad
# cases): non-empty local part, "@", a dotted domain, and a 2+ char TLD.
EMAIL_PATTERN = re.compile(r"^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$")

# One URL on a line: optional scheme or www., a dotted host, optional path,
# and no whitespace anywhere. Source data mixes "https://x.com/a" with bare
# "linkedin.com/in/name", so the scheme is optional.
URL_LINE_PATTERN = re.compile(r"^(https?://|www\.)?[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+(:\d+)?(/\S*)?$")

# Invisible characters that arrive via copy-paste from websites and PDFs. They
# render as nothing in Google Sheets but corrupt keys, joins, sorting, and
# search downstream (the "Freudenberg SE" incident, 2026-07-29).
INVISIBLE_CHARS = {
    "\u200b": "zero-width space",
    "\u200c": "zero-width non-joiner",
    "\u200d": "zero-width joiner",
    "\u2060": "word joiner",
    "\ufeff": "byte order mark",
    "\u00ad": "soft hyphen",
    # Bidirectional formatting controls. Just as invisible and just as
    # damaging as the zero-width characters above: centers!center_boardline
    # row 4286 and three prospects!prospect_title cells carry these and were
    # reported clean before they were added here.
    "\u200e": "left-to-right mark",
    "\u200f": "right-to-left mark",
    "\u202a": "left-to-right embedding",
    "\u202b": "right-to-left embedding",
    "\u202c": "pop directional formatting",
    "\u202d": "left-to-right override",
    "\u202e": "right-to-left override",
    "\u2066": "left-to-right isolate",
    "\u2067": "right-to-left isolate",
    "\u2068": "first strong isolate",
    "\u2069": "pop directional isolate",
}
INVISIBLE_CHARS_RE = re.compile("[" + "".join(INVISIBLE_CHARS) + "]")

# -- Validation Rule Definitions ----------------------------------------------
SERVICE_COVERAGE_RULES = [
    {
        "sheet": "services",
        "label_column": "cn_unique_key",
        "service_columns": [
            "service_it",
            "service_ai",
            "service_erd",
            "service_fna",
            "service_hr",
            "service_procurement",
            "service_sales_marketing",
            "service_customer_support",
            "service_others",
        ],
    },
]

ALL_SHEETS = ["accounts", "centers", "services", "prospects", "ticker", "alias", "functions", "tech", "subscribers"]

# Sheets skipped in every phase. Populated from --exclude in main().
EXCLUDED_SHEETS: set[str] = set()


def is_excluded(sheet_name: str) -> bool:
    return sheet_name.strip().lower() in EXCLUDED_SHEETS


UNIQUENESS_RULES = [
    {"sheet": "accounts", "column": "account_global_legal_name"},
    {"sheet": "centers", "column": "cn_unique_key"},
    {"sheet": "services", "column": "cn_unique_key"},
    {"sheet": "prospects", "column": "ps_unique_key"},
    # One row per engagement, so no single column is unique. The same
    # prospect, campaign and date twice is the same engagement entered twice.
    # Emails are compared case-insensitively, matching the ETL join.
    {
        "sheet": "subscribers",
        "columns": ["prospect_email", "prospect_engaged_campaign", "prospect_engaged_date"],
    },
]

VALIDATION_RULES = [
    {
        "source_sheet": "accounts",
        "column": "account_global_legal_name",
        "target_sheets": ["centers", "services", "prospects", "tech", "alias", "ticker"],
    },
    {
        "source_sheet": "centers",
        "column": "center_name",
        "target_sheets": ["services"],
    },
    {
        "source_sheet": "centers",
        "column": "cn_unique_key",
        "target_sheets": ["services", "functions", "tech"],
    },
    # Not a foreign key in the DB (prospect emails are not unique), but an
    # engagement whose email matches no prospect never shows up in the app.
    {
        "source_sheet": "prospects",
        "column": "prospect_email",
        "target_sheets": ["subscribers"],
    },
]

COMPLETENESS_RULES = [
    {
        "source_sheet": "accounts",
        "target_sheet": "alias",
        "column": "account_global_legal_name",
    },
    {
        "source_sheet": "accounts",
        "target_sheet": "ticker",
        "column": "account_global_legal_name",
    },
]

ALL_RULES = {
    "centers": {
        "uuid": {
            "Can Be Nullable": "No",
            "Can Have URL": "No",
            "Description": "CN followed by digits (for example, CN3)",
        },
        "last_update_date": {
            "Can Be Nullable": "No",
            "Can Have URL": "No",
            "Description": "Should Contain Only Date In This Exact Format||i.e 6-May-2025 non abbreviated month it shouldnot bt 06-May-2025, 06-May-25 or 06-Jan-2025 or 06-Jan-25",
        },
        "cn_unique_key": {
            "Can Be Nullable": "No",
            "Can Have URL": "No",
            "Description": "should contain proper string not domains or anything else some company names might have domain in their legal name so those are edge cases, cannot have urls",
        },
        "account_global_legal_name": {
            "Can Be Nullable": "No",
            "Can Have URL": "No",
            "Description": "should contain proper string not domains or anything else some company names might have domain in their legal name so those are edge cases, cannot have urls",
        },
        "center_status": {
            "Can Be Nullable": "No",
            "Can Have URL": "No",
            "Description": "should contain||Active Center||Upcoming||Non Operational",
        },
        "center_inc_year": {
            "Can Be Nullable": "Yes",
            "Can Have URL": "No",
            "Description": "should be valid year not exceeding 4 characters",
        },
        "announced_year": {
            "Can Be Nullable": "Yes",
            "Can Have URL": "No",
            "Description": "should be valid year not exceeding 4 characters",
        },
        "announced_month": {
            "Can Be Nullable": "Yes",
            "Can Have URL": "No",
            "Description": "should be a valid month non abbreviated",
        },
        "center_inc_year_notes": {
            "Can Be Nullable": "Yes",
            "Can Have URL": "Yes",
            "Description": "should be string",
        },
        "center_inc_year_updated_link": {
            "Can Be Nullable": "Yes",
            "Can Have URL": "Yes",
            "Description": "should be url",
        },
        "center_timeline": {
            "Can Be Nullable": "Yes",
            "Can Have URL": "No",
            "Description": "should have only these values||2011 - 2015||2016 - 2020||2021 - 2024||2025 - 2029||2030 - 2034||Till 2010",
        },
        "center_end_year": {
            "Can Be Nullable": "Yes",
            "Can Have URL": "No",
            "Description": "should be valid year not exceeding 4 characters",
        },
        "center_account_website": {
            "Can Be Nullable": "No",
            "Can Have URL": "Yes",
            "Description": "should be a valid url",
        },
        "center_name": {
            "Can Be Nullable": "No",
            "Can Have URL": "No",
            "Description": "should contain proper string not domains or anything else some company names might have domain in their legal name so those are edge cases, cannot have urls",
        },
        "center_management_partner": {
            "Can Be Nullable": "Yes",
            "Can Have URL": "No",
            "Description": "should contain proper string not domains or anything else some company names might have domain in their legal name so those are edge cases, cannot have urls",
        },
        "center_jv_status": {
            "Can Be Nullable": "Yes",
            "Can Have URL": "No",
            "Description": "should contain proper string not domains or anything else some company names might have domain in their legal name so those are edge cases, cannot have urls",
        },
        "center_jv_name": {
            "Can Be Nullable": "Yes",
            "Can Have URL": "No",
            "Description": "should contain proper string not domains or anything else some company names might have domain in their legal name so those are edge cases, cannot have urls",
        },
        "center_type": {
            "Can Be Nullable": "No",
            "Can Have URL": "No",
            "Description": "should contain ||BPO||CoE||Distribution||Engineering & Design||GBS||GCC/GIC||IT||Manufacturing||R&D||Sales & Marketing||SSC",
        },
        "center_focus": {
            "Can Be Nullable": "No",
            "Can Have URL": "No",
            "Description": "should contain||Both||Global Support Services||Local Support Services",
        },
        "center_source_link": {
            "Can Be Nullable": "No",
            "Can Have URL": "Yes",
            "Description": "should be a valid url or urls if urls should be line break",
        },
        "center_website": {
            "Can Be Nullable": "Yes",
            "Can Have URL": "Yes",
            "Description": "should be a valid url",
        },
        "center_linkedin": {
            "Can Be Nullable": "Yes",
            "Can Have URL": "Yes",
            "Description": "should be a valid linkedin should have linkedin.com somewhere url",
        },
        "center_address": {
            "Can Be Nullable": "Yes",
            "Can Have URL": "No",
            "Description": "should be a adress string",
        },
        "center_micro_location": {
            "Can Be Nullable": "Yes",
            "Can Have URL": "No",
            "Description": "should be a micro location string",
        },
        "center_city": {
            "Can Be Nullable": "Yes",
            "Can Have URL": "No",
            "Description": "should be valid city",
        },
        "center_state": {
            "Can Be Nullable": "Yes",
            "Can Have URL": "No",
            "Description": "should be a valid state",
        },
        "center_zip_code": {
            "Can Be Nullable": "Yes",
            "Can Have URL": "No",
            "Description": "should be a valid pincode 6 digit",
        },
        "center_country": {
            "Can Be Nullable": "No",
            "Can Have URL": "No",
            "Description": "should be a valid country india",
        },
        "center_country_iso2": {
            "Can Be Nullable": "No",
            "Can Have URL": "No",
            "Description": "should be valid iso code should  be IN",
        },
        "lat": {
            "Can Be Nullable": "No",
            "Can Have URL": "No",
            "Description": "should be valid lat",
        },
        "lng": {
            "Can Be Nullable": "No",
            "Can Have URL": "No",
            "Description": "should be valid longitude",
        },
        "center_boardline": {
            "Can Be Nullable": "Yes",
            "Can Have URL": "No",
            "Description": "should be number only",
        },
        "center_employees_article": {
            "Can Be Nullable": "Yes",
            "Can Have URL": "No",
            "Description": "should be number only",
        },
        "center_employees_article_source_link": {
            "Can Be Nullable": "Yes",
            "Can Have URL": "Yes",
            "Description": "should be valid url",
        },
        "center_employees_linkedin": {
            "Can Be Nullable": "Yes",
            "Can Have URL": "No",
            "Description": "should be number only",
        },
        "center_employees_range_linkedin_source_link": {
            "Can Be Nullable": "Yes",
            "Can Have URL": "Yes",
            "Description": "should be valid url",
        },
        "center_employees": {
            "Can Be Nullable": "Yes",
            "Can Have URL": "No",
            "Description": "should be number only",
        },
        "center_employees_range": {
            "Can Be Nullable": "No",
            "Can Have URL": "No",
            "Description": "can be only range||<50||>10K||101 - 200||1K - 5K||201 - 500||501 - 1K||51 - 100||5K - 10K",
        },
        "center_employees_comment": {
            "Can Be Nullable": "Yes",
            "Can Have URL": "Yes",
            "Description": "should be valid strings",
        },
        "center_services": {
            "Can Be Nullable": "Yes",
            "Can Have URL": "No",
            "Description": "should be string separated by commas",
        },
        "center_first_year": {
            "Can Be Nullable": "Yes",
            "Can Have URL": "No",
            "Description": "should be valid year not exceeding 4 characters",
        },
        "center_comments": {
            "Can Be Nullable": "Yes",
            "Can Have URL": "Yes",
            "Description": "should be valid strings",
        },
    },
    "services": {
        "uuid": {
            "Can Be Nullable": "No",
            "Can Have URL": "No",
            "Description": "CN followed by digits (for example, CN3)",
        },
        "last_update_date": {
            "Can Be Nullable": "No",
            "Can Have URL": "No",
            "Description": "Should Contain Only Date In This Exact Format||i.e 6-May-2025 non abbreviated month it shouldnot bt 06-May-2025, 06-May-25 or 06-Jan-2025 or 06-Jan-25",
        },
        "cn_unique_key": {
            "Can Be Nullable": "No",
            "Can Have URL": "No",
            "Description": "should contain proper string not domains or anything else some company names might have domain in their legal name so those are edge cases, cannot have urls",
        },
        "account_global_legal_name": {
            "Can Be Nullable": "No",
            "Can Have URL": "No",
            "Description": "should contain proper string not domains or anything else some company names might have domain in their legal name so those are edge cases, cannot have urls",
        },
        "center_name": {
            "Can Be Nullable": "No",
            "Can Have URL": "No",
            "Description": "should contain proper string not domains or anything else some company names might have domain in their legal name so those are edge cases, cannot have urls",
        },
        "center_type": {
            "Can Be Nullable": "No",
            "Can Have URL": "No",
            "Description": "should contain ||BPO||CoE||Distribution||Engineering & Design||GBS||GCC/GIC||IT||Manufacturing||R&D||Sales & Marketing||SSC",
        },
        "center_focus": {
            "Can Be Nullable": "No",
            "Can Have URL": "No",
            "Description": "should contain||Both||Global Support Services||Local Support Services",
        },
        "center_city": {
            "Can Be Nullable": "No",
            "Can Have URL": "No",
            "Description": "should be valid city",
        },
        "primary_service": {
            "Can Be Nullable": "Yes",
            "Can Have URL": "No",
            "Description": "should be proper string if multiple then should have line breaks",
        },
        "primary_service_link": {
            "Can Be Nullable": "Yes",
            "Can Have URL": "Yes",
            "Description": "should be a valid url or urls if urls should be line break",
        },
        "focus_region": {
            "Can Be Nullable": "Yes",
            "Can Have URL": "No",
            "Description": "should be proper string if multiple then should have line breaks",
        },
        "focus_region_link": {
            "Can Be Nullable": "Yes",
            "Can Have URL": "Yes",
            "Description": "should be a valid url or urls if urls should be line break",
        },
        "service_it": {
            "Can Be Nullable": "Yes",
            "Can Have URL": "No",
            "Description": "should be proper string if multiple then should have line breaks",
        },
        "service_it_link": {
            "Can Be Nullable": "Yes",
            "Can Have URL": "Yes",
            "Description": "should be a valid url or urls if urls should be line break",
        },
        "service_ai": {
            "Can Be Nullable": "Yes",
            "Can Have URL": "No",
            "Description": "should be proper string if multiple then should have line breaks",
        },
        "service_ai_link": {
            "Can Be Nullable": "Yes",
            "Can Have URL": "Yes",
            "Description": "should be a valid url or urls if urls should be line break",
        },
        "service_erd": {
            "Can Be Nullable": "Yes",
            "Can Have URL": "No",
            "Description": "should be proper string if multiple then should have line breaks",
        },
        "service_erd_link": {
            "Can Be Nullable": "Yes",
            "Can Have URL": "Yes",
            "Description": "should be a valid url or urls if urls should be line break",
        },
        "service_fna": {
            "Can Be Nullable": "Yes",
            "Can Have URL": "No",
            "Description": "should be proper string if multiple then should have line breaks",
        },
        "service_fna_link": {
            "Can Be Nullable": "Yes",
            "Can Have URL": "Yes",
            "Description": "should be a valid url or urls if urls should be line break",
        },
        "service_hr": {
            "Can Be Nullable": "Yes",
            "Can Have URL": "No",
            "Description": "should be proper string if multiple then should have line breaks",
        },
        "service_hr_link": {
            "Can Be Nullable": "Yes",
            "Can Have URL": "Yes",
            "Description": "should be a valid url or urls if urls should be line break",
        },
        "service_procurement": {
            "Can Be Nullable": "Yes",
            "Can Have URL": "No",
            "Description": "should be proper string if multiple then should have line breaks",
        },
        "service_procurement_link": {
            "Can Be Nullable": "Yes",
            "Can Have URL": "Yes",
            "Description": "should be a valid url or urls if urls should be line break",
        },
        "service_sales_marketing": {
            "Can Be Nullable": "Yes",
            "Can Have URL": "No",
            "Description": "should be proper string if multiple then should have line breaks",
        },
        "service_sales_marketing_link": {
            "Can Be Nullable": "Yes",
            "Can Have URL": "Yes",
            "Description": "should be a valid url or urls if urls should be line break",
        },
        "service_customer_support": {
            "Can Be Nullable": "Yes",
            "Can Have URL": "No",
            "Description": "should be proper string if multiple then should have line breaks",
        },
        "service_customer_support_link": {
            "Can Be Nullable": "Yes",
            "Can Have URL": "Yes",
            "Description": "should be a valid url or urls if urls should be line break",
        },
        "service_others": {
            "Can Be Nullable": "Yes",
            "Can Have URL": "No",
            "Description": "should be proper string if multiple then should have line breaks",
        },
        "service_others_link": {
            "Can Be Nullable": "Yes",
            "Can Have URL": "Yes",
            "Description": "should be a valid url or urls if urls should be line break",
        },
        "software_vendor": {
            "Can Be Nullable": "Yes",
            "Can Have URL": "No",
            "Description": "should be proper string if multiple then should have line breaks",
        },
        "software_in_use": {
            "Can Be Nullable": "Yes",
            "Can Have URL": "No",
            "Description": "should be proper string if multiple then should have line breaks",
        },
        "software_source_link": {
            "Can Be Nullable": "Yes",
            "Can Have URL": "Yes",
            "Description": "should be a valid url or urls if urls should be line break",
        },
        "service_comments": {
            "Can Be Nullable": "Yes",
            "Can Have URL": "Yes",
            "Description": "should be valid strings",
        },
    },
    "prospects": {
        "uuid": {
            "Can Be Nullable": "No",
            "Can Have URL": "No",
            "Description": "CD- followed by digits (for example, CD-4393)",
        },
        "last_update_date": {
            "Can Be Nullable": "No",
            "Can Have URL": "No",
            "Description": "Should Contain Only Date In This Exact Format||i.e 6-May-2025 non abbreviated month it shouldnot bt 06-May-2025, 06-May-25 or 06-Jan-2025 or 06-Jan-25",
        },
        "last_review_date": {
            "Can Be Nullable": "Yes",
            "Can Have URL": "No",
            "Description": "should be a date string (format not enforced: source data mixes 3-Jul-2026 and 1-July-2026)",
        },
        "email_verification_date": {
            "Can Be Nullable": "Yes",
            "Can Have URL": "No",
            "Description": "should be a date string or sentinel (format not enforced: mixes dates with TBA / Manual Email Check Pending)",
        },
        "contact_status": {
            "Can Be Nullable": "Yes",
            "Can Have URL": "No",
            "Description": "should contain||Verified||Verified-New||Verified New||Manual Email Check Pending||New Mails To Be Checked||TBA",
        },
        "ps_unique_key": {
            "Can Be Nullable": "No",
            "Can Have URL": "No",
            "Description": "should contain proper string not domains or anything else some company names might have domain in their legal name so those are edge cases, cannot have urls",
        },
        "account_global_legal_name": {
            "Can Be Nullable": "No",
            "Can Have URL": "No",
            "Description": "should contain proper string not domains or anything else some company names might have domain in their legal name so those are edge cases, cannot have urls",
        },
        "center_name": {
            "Can Be Nullable": "Yes",
            "Can Have URL": "No",
            "Description": "should contain proper string not domains or anything else some company names might have domain in their legal name so those are edge cases, cannot have urls",
        },
        "prospect_full_name": {
            "Can Be Nullable": "No",
            "Can Have URL": "No",
            "Description": "should contain proper string not domains or anything else some company names might have domain in their legal name so those are edge cases, cannot have urls",
        },
        "prospect_first_name": {
            "Can Be Nullable": "No",
            "Can Have URL": "No",
            "Description": "should contain proper string not domains or anything else some company names might have domain in their legal name so those are edge cases, cannot have urls",
        },
        "prospect_last_name": {
            "Can Be Nullable": "No",
            "Can Have URL": "No",
            "Description": "should contain proper string not domains or anything else some company names might have domain in their legal name so those are edge cases, cannot have urls",
        },
        "prospect_title": {
            "Can Be Nullable": "No",
            "Can Have URL": "No",
            "Description": "should contain proper string not domains or anything else some company names might have domain in their legal name so those are edge cases, cannot have urls",
        },
        "prospect_in_company_year": {
            "Can Be Nullable": "Yes",
            "Can Have URL": "No",
            "Description": "should be a valid year not exceeding 4 characters",
        },
        "prospect_current_year": {
            "Can Be Nullable": "Yes",
            "Can Have URL": "No",
            "Description": "should be a valid year not exceeding 4 characters",
        },
        "prospect_department": {
            "Can Be Nullable": "No",
            "Can Have URL": "No",
            "Description": "should contain||Admin||Analytics||Business||Center||CoE||Consulting||Country||Customer Support||Engineering||Facilities||FnA||GBS||GCC||HR||IT||Legal||Logistics||Manufacturing||Marketing||Operations||Others||Procurement||Product Management||Project Department||R&D||Sales||Senior Management||Service||Site||SSC||Supply Chain||Sustainability/ESG||Transportation||Workplace",
        },
        "prospect_level": {
            "Can Be Nullable": "No",
            "Can Have URL": "No",
            "Description": "should contain ||CXO||Director||EA||GM||Head||Junior||Lead||Leader||Manager||Others||Partner||Senior Management||Senior Manager||VP",
        },
        "head_type": {
            "Can Be Nullable": "No",
            "Can Have URL": "No",
            "Description": "should contain||Below Finance Manager ||Below GCC Manager ||Below HR Manager ||Below IT Manager ||Below Procurement Manager ||Below R&D Manager ||Finance Head||GCC Head||HR Head||IT Head||Others||Procurement Head||R&D Head",
        },
        "prospect_linkedin_url": {
            "Can Be Nullable": "Yes",
            "Can Have URL": "Yes",
            "Description": "should contain valid linkedin link",
        },
        "prospect_other_source_url": {
            "Can Be Nullable": "Yes",
            "Can Have URL": "Yes",
            "Description": "should contain url",
        },
        "prospect_email": {
            "Can Be Nullable": "No",
            "Can Have URL": "No",
            "Description": "should contain valid email",
        },
        "prospect_city": {
            "Can Be Nullable": "Yes",
            "Can Have URL": "No",
            "Description": "should be valid city",
        },
        "prospect_state": {
            "Can Be Nullable": "Yes",
            "Can Have URL": "No",
            "Description": "should be valid state",
        },
        "prospect_country": {
            "Can Be Nullable": "Yes",
            "Can Have URL": "No",
            "Description": "should be valid country",
        },
        "prospect_phone": {
            "Can Be Nullable": "Yes",
            "Can Have URL": "No",
            "Description": "should be a 10 digit phone number",
        },
        "prospect_engaged": {
            "Can Be Nullable": "No",
            "Can Have URL": "No",
            "Description": "should contain||Yes||No",
        },
    },
    "accounts": {
        "uuid": {
            "Can Be Nullable": "No",
            "Can Have URL": "No",
            "Description": "BR followed by digits (for example, BR64)",
        },
        "account_last_update_date": {
            "Can Be Nullable": "No",
            "Can Have URL": "No",
            "Description": "Should Contain Only Date In This Exact Format||i.e 6-May-2025 non abbreviated month it shouldnot bt 06-May-2025",
        },
        "account_nasscom_status": {
            "Can Be Nullable": "No",
            "Can Have URL": "No",
            "Description": "should contain||Yes||No",
        },
        "account_nasscom_member_status": {
            "Can Be Nullable": "No",
            "Can Have URL": "No",
            "Description": "should contain||Yes||No",
        },
        "account_data_coverage": {
            "Can Be Nullable": "No",
            "Can Have URL": "No",
            "Description": "should contain||L1||L2||L3",
        },
        "account_source": {
            "Can Be Nullable": "No",
            "Can Have URL": "No",
            "Description": "should contain||Bamboo Reports",
        },
        "account_type": {
            "Can Be Nullable": "No",
            "Can Have URL": "No",
            "Description": "should contain||Global Enterprise||Indian Enterprise",
        },
        "account_global_legal_name": {
            "Can Be Nullable": "No",
            "Can Have URL": "No",
            "Description": "string",
        },
        "account_about": {
            "Can Be Nullable": "No",
            "Can Have URL": "No",
            "Description": "string",
        },
        "account_hq_address": {
            "Can Be Nullable": "No",
            "Can Have URL": "No",
            "Description": "string",
        },
        "account_hq_city": {
            "Can Be Nullable": "No",
            "Can Have URL": "No",
            "Description": "no numbers",
        },
        "account_hq_state": {
            "Can Be Nullable": "No",
            "Can Have URL": "No",
            "Description": "no numbers",
        },
        "account_hq_zip_code": {
            "Can Be Nullable": "Yes",
            "Can Have URL": "No",
            "Description": "string",
        },
        "account_hq_country": {
            "Can Be Nullable": "No",
            "Can Have URL": "No",
            "Description": "no numbers",
        },
        "account_hq_region": {
            "Can Be Nullable": "No",
            "Can Have URL": "No",
            "Description": "should contain||APAC||Europe||LATAM||MEA||North America",
        },
        "account_hq_boardline": {
            "Can Be Nullable": "Yes",
            "Can Have URL": "No",
            "Description": "string or number; if string should not exceed 15 characters",
        },
        "account_hq_website": {
            "Can Be Nullable": "No",
            "Can Have URL": "Yes",
            "Description": "website",
        },
        "account_hq_linkedin_link": {
            "Can Be Nullable": "Yes",
            "Can Have URL": "Yes",
            "Description": "linkedin",
        },
        "account_hq_key_offerings": {
            "Can Be Nullable": "No",
            "Can Have URL": "No",
            "Description": "string",
        },
        "account_key_offerings_source_link": {
            "Can Be Nullable": "Yes",
            "Can Have URL": "Yes",
            "Description": "string",
        },
        "account_hq_sub_industry": {
            "Can Be Nullable": "No",
            "Can Have URL": "No",
            "Description": "string",
        },
        "account_hq_industry": {
            "Can Be Nullable": "No",
            "Can Have URL": "No",
            "Description": "string",
        },
        "account_primary_category": {
            "Can Be Nullable": "No",
            "Can Have URL": "No",
            "Description": "string",
        },
        "account_primary_nature": {
            "Can Be Nullable": "No",
            "Can Have URL": "No",
            "Description": "string",
        },
        "account_hq_forbes_2000_rank": {
            "Can Be Nullable": "Yes",
            "Can Have URL": "No",
            "Description": "only number",
        },
        "account_hq_fortune_500_rank": {
            "Can Be Nullable": "Yes",
            "Can Have URL": "No",
            "Description": "only number",
        },
        "account_hq_company_type": {
            "Can Be Nullable": "No",
            "Can Have URL": "No",
            "Description": "should contain||ACQMP||ACQSP||Bankrupt / In Liquidation||Merger||Private||Public||Subsidiary",
        },
        "account_hq_revenue": {
            "Can Be Nullable": "Yes",
            "Can Have URL": "No",
            "Description": "number",
        },
        "account_hq_revenue_range": {
            "Can Be Nullable": "No",
            "Can Have URL": "No",
            "Description": "should contain||<10Mn||>50Bn||101Mn - 250Mn||10Bn - 25Bn||10Mn - 50Mn||1Bn - 5Bn||251Mn - 500Mn||25Bn - 50Bn||501Mn - 1Bn||51Mn - 100Mn||5Bn - 10Bn",
        },
        "account_hq_fy_end": {
            "Can Be Nullable": "Yes",
            "Can Have URL": "No",
            "Description": "string",
        },
        "account_hq_revenue_year": {
            "Can Be Nullable": "Yes",
            "Can Have URL": "No",
            "Description": "valid year",
        },
        "account_hq_revenue_source_type": {
            "Can Be Nullable": "Yes",
            "Can Have URL": "No",
            "Description": "should contain||Annual Report||Company Website||Forbes||Fortune||Others||Reuters",
        },
        "account_hq_revenue_source_link": {
            "Can Be Nullable": "No",
            "Nullable When": {"column": "account_hq_revenue_source_type", "equals": "Others"},
            "Can Have URL": "Yes",
            "Description": "should be a valid url or urls if urls should be line break",
        },
        "account_hq_employee_count": {
            "Can Be Nullable": "Yes",
            "Can Have URL": "No",
            "Description": "only number",
        },
        "account_hq_employee_range": {
            "Can Be Nullable": "No",
            "Can Have URL": "No",
            "Description": "should contain||<50||>50K||101 - 200||10K - 25K||1K - 5K||201 - 500||25K - 50K||501 - 1K||51 - 100||5K - 10K",
        },
        "account_hq_employee_source_type": {
            "Can Be Nullable": "No",
            "Can Have URL": "No",
            "Description": "should contain||Annual Report||Company Website||Forbes||Fortune||Others||Reuters",
        },
        "account_hq_employee_source_link": {
            "Can Be Nullable": "No",
            "Nullable When": {"column": "account_hq_employee_source_type", "equals": "Others"},
            "Can Have URL": "Yes",
            "Description": "should be a valid url or urls if urls should be line break",
        },
        "account_center_employees": {
            "Can Be Nullable": "Yes",
            "Can Have URL": "No",
            "Description": "only number",
        },
        "account_center_employees_range": {
            "Can Be Nullable": "No",
            "Can Have URL": "No",
            "Description": "should contain||<50||>10K||101 - 200||1K - 5K||201 - 500||501 - 1K||51 - 100||5K - 10K",
        },
        "years_in_india": {
            "Can Be Nullable": "Yes",
            "Can Have URL": "No",
            "Description": "only number",
        },
        "account_first_center_year": {
            "Can Be Nullable": "Yes",
            "Can Have URL": "No",
            "Description": "valid year",
        },
        "account_primary_city": {
            "Can Be Nullable": "Yes",
            "Can Have URL": "No",
            "Description": "no numbers",
        },
        "account_hub_structure": {
            "Can Be Nullable": "Yes",
            "Can Have URL": "No",
            "Description": "should contain||Standalone||Hub-and-Spoke||Hub-dominant||Distributed||Single-city||No centres",
        },
        "account_comments": {
            "Can Be Nullable": "Yes",
            "Can Have URL": "Yes",
            "Description": "string",
        },
        "account_visibility": {
            "Can Be Nullable": "No",
            "Can Have URL": "No",
            # Accepts both the legacy include/exclude values and the
            # GCC / NON-GCC values used by the centers master sheet and updater app.
            "Description": "should contain||include||exclude||GCC||NON-GCC",
        },
        "account_visibility_note": {
            "Can Be Nullable": "Yes",
            "Can Have URL": "No",
            "Description": "string",
        },
    },
    "ticker": {
        "uuid": {
            "Can Be Nullable": "No",
            "Can Have URL": "No",
            "Description": "BR followed by digits (for example, BR64)",
        },
        "account_global_legal_name": {
            "Can Be Nullable": "No",
            "Can Have URL": "No",
            "Description": "string",
        },
        "account_hq_stock_ticker": {
            "Can Be Nullable": "Yes",
            "Can Have URL": "No",
            "Description": "string",
        },
        "notes": {
            "Can Be Nullable": "Yes",
            "Can Have URL": "Yes",
            "Description": "string",
        },
    },
    "alias": {
        "uuid": {
            "Can Be Nullable": "No",
            "Can Have URL": "No",
            "Description": "BR followed by digits (for example, BR64)",
        },
        "account_global_legal_name": {
            "Can Be Nullable": "No",
            "Can Have URL": "No",
            "Description": "string",
        },
        "short_legal_name": {
            "Can Be Nullable": "Yes",
            "Can Have URL": "No",
            "Description": "string",
        },
        "brand_name": {
            "Can Be Nullable": "Yes",
            "Can Have URL": "No",
            "Description": "string",
        },
        "abbreviated_name": {
            "Can Be Nullable": "Yes",
            "Can Have URL": "No",
            "Description": "string",
        },
        "flagship_products": {
            "Can Be Nullable": "Yes",
            "Can Have URL": "No",
            "Description": "string",
        },
        "currently_known_as": {
            "Can Be Nullable": "Yes",
            "Can Have URL": "No",
            "Description": "string",
        },
        "notes": {
            "Can Be Nullable": "Yes",
            "Can Have URL": "Yes",
            "Description": "string",
        },
    },
    "functions": {
        "uuid": {
            "Can Be Nullable": "No",
            "Can Have URL": "No",
            "Description": "CN followed by digits (for example, CN3)",
        },
        "cn_unique_key": {
            "Can Be Nullable": "No",
            "Can Have URL": "No",
            "Description": "should contain proper string not domains or anything else some company names might have domain in their legal name so those are edge cases, cannot have urls",
        },
        "function_name": {
            "Can Be Nullable": "No",
            "Can Have URL": "No",
            "Description": "should contain||IT||AI||ER&D||FnA||HR||Procurement & Supply Chain||Sales & Marketing||Customer Support||Others",
        },
    },
    "tech": {
        "uuid": {
            "Can Be Nullable": "No",
            "Can Have URL": "No",
            "Description": "CN followed by digits (for example, CN3)",
        },
        "account_global_legal_name": {
            "Can Be Nullable": "No",
            "Can Have URL": "No",
            "Description": "should contain proper string not domains or anything else some company names might have domain in their legal name so those are edge cases, cannot have urls",
        },
        "cn_unique_key": {
            "Can Be Nullable": "No",
            "Can Have URL": "No",
            "Description": "should contain proper string not domains or anything else some company names might have domain in their legal name so those are edge cases, cannot have urls",
        },
        "software_in_use": {
            "Can Be Nullable": "No",
            "Can Have URL": "No",
            "Description": "string",
        },
        "software_vendor": {
            "Can Be Nullable": "Yes",
            "Can Have URL": "No",
            "Description": "string",
        },
        "software_category": {
            "Can Be Nullable": "No",
            "Can Have URL": "No",
            "Description": "string",
        },
    },
    # One row per campaign engagement. uuid repeats and has no fixed shape
    # (campaign-specific ids), so it is only required to be filled.
    "subscribers": {
        "uuid": {
            "Can Be Nullable": "No",
            "Can Have URL": "No",
            "Description": "a non-empty identifier",
        },
        "prospect_engaged_date": {
            "Can Be Nullable": "No",
            "Can Have URL": "No",
            "Description": "Should Contain Only Date In This Exact Format||i.e 6-May-2025 non abbreviated month it shouldnot bt 06-May-2025, 06-May-25 or 06-Jan-2025 or 06-Jan-25",
        },
        "prospect_email": {
            "Can Be Nullable": "No",
            "Can Have URL": "No",
            "Description": "should contain valid email",
        },
        "prospect_engaged_campaign": {
            "Can Be Nullable": "No",
            "Can Have URL": "No",
            "Description": "string",
        },
    },
}

# -- Configuration ------------------------------------------------------------
SCRIPT_DIR = Path(__file__).resolve().parent
load_dotenv(SCRIPT_DIR / ".env")

SPREADSHEET_ID = os.getenv("SPREADSHEET_ID")
GOOGLE_SA_FILE = os.getenv("GOOGLE_SA_FILE")

if not SPREADSHEET_ID:
    console.print("[error][ERROR][/error] SPREADSHEET_ID is not set in .env")
    sys.exit(1)
if not GOOGLE_SA_FILE:
    console.print("[error][ERROR][/error] GOOGLE_SA_FILE is not set in .env")
    sys.exit(1)

SA_PATH = SCRIPT_DIR / GOOGLE_SA_FILE
if not SA_PATH.exists():
    console.print(f"[error][ERROR][/error] Service-account file not found: {SA_PATH}")
    sys.exit(1)


# -- Google Sheets Auth --------------------------------------------------------
HIGHLIGHT_MODE = "--highlight" in sys.argv

# Highlighting writes cell formatting, which the read-only scope does not allow.
SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets"
    if HIGHLIGHT_MODE
    else "https://www.googleapis.com/auth/spreadsheets.readonly",
]

credentials = Credentials.from_service_account_file(str(SA_PATH), scopes=SCOPES)
gc = gspread.authorize(credentials)


def safe_api_call(func):
    """Retry wrapper for Google Sheets API rate limits."""
    retries = 3
    while retries > 0:
        try:
            return func()
        except gspread.exceptions.APIError as e:
            if "429" in str(e) and retries > 1:
                console.print(
                    "  [muted]...API rate limit reached, cooling down for 10s...[/muted]"
                )
                time.sleep(10)
                retries -= 1
            else:
                raise


def get_worksheet_rows(
    worksheet: gspread.Worksheet,
) -> tuple[list[str], list[list[str]]]:
    """Fetch all data from a worksheet. Returns (headers, rows)."""
    all_data = safe_api_call(lambda: worksheet.get_all_values())
    if not all_data:
        return [], []
    headers = [str(h).strip().lower() for h in all_data[0]]
    return headers, all_data[1:]


class SheetCache:
    def __init__(self, spreadsheet: gspread.Spreadsheet):
        self.spreadsheet = spreadsheet
        self._cache = {}

    def get_data(self, sheet_name: str) -> tuple[list[str], list[list[str]]]:
        if sheet_name not in self._cache:
            ws = self.spreadsheet.worksheet(sheet_name)
            headers, rows = get_worksheet_rows(ws)
            self._cache[sheet_name] = (headers, rows)
            time.sleep(0.5)  # small buffer after a large read
        return self._cache[sheet_name]

    def preload(self, sheet_names: list[str]) -> None:
        """Read every sheet up front behind one progress bar, so the phases
        run on cached data without pausing between them."""
        timer = tui.Timer()
        missing: list[str] = []
        with tui.loading(len(sheet_names), "Loading sheets") as bar:
            for name in sheet_names:
                bar.start(f"Loading '{name}'")
                try:
                    self.get_data(name)
                except gspread.exceptions.WorksheetNotFound:
                    missing.append(name)
                bar.done()
        loaded = [n for n in sheet_names if n in self._cache]
        total_rows = sum(len(self._cache[n][1]) for n in loaded)
        tui.line(
            "pass",
            f"Loaded {tui.plural(len(loaded), 'sheet')}, {tui.plural(total_rows, 'row')} in {timer}",
        )
        if missing:
            tui.line("warn", f"Not found: {', '.join(missing)}")

    def get_column_values(
        self, sheet_name: str, column_name: str
    ) -> list[tuple[int, str]]:
        headers, rows = self.get_data(sheet_name)
        key = column_name.strip().lower()
        if key not in headers:
            available = ", ".join(headers) or "(no headers found)"
            console.print(
                f"[error][ERROR][/error] Column '{column_name}' not found in sheet '{sheet_name}'.\n"
                f"        Available columns: {available}"
            )
            sys.exit(1)

        col_idx = headers.index(key)
        results: list[tuple[int, str]] = []
        for idx, row in enumerate(rows, start=2):
            if col_idx < len(row):
                stripped = str(row[col_idx]).strip()
                if stripped:
                    results.append((idx, stripped))
        return results


# -- Issue highlighting -------------------------------------------------------
# Every phase records (sheet, row, column) for each failure it finds. With
# --highlight these are painted into the spreadsheet at the end of the run:
# the whole row yellow, the offending cell red.
HIGHLIGHT_ROW_COLOR = {"red": 1.0, "green": 0.949, "blue": 0.6}  # yellow
HIGHLIGHT_CELL_COLOR = {"red": 0.957, "green": 0.51, "blue": 0.51}  # red

# sheet -> row (1-based) -> set of 0-based column indices (empty set = row only)
ISSUE_CELLS: dict[str, dict[int, set[int]]] = {}


def record_issue(
    sheet: str,
    row: int,
    column: "str | int | None" = None,
    headers: "list[str] | None" = None,
) -> None:
    """Remember a failing cell for --highlight.

    `column` may be a header name (resolved against `headers`), a 0-based
    column index, or None to flag the row without a specific cell.
    """
    cols = ISSUE_CELLS.setdefault(sheet, {}).setdefault(row, set())
    if column is None:
        return
    if isinstance(column, int):
        cols.add(column)
        return
    if headers is None:
        return
    key = column.strip().lower()
    if key in headers:
        cols.add(headers.index(key))


def _batch_update(spreadsheet: gspread.Spreadsheet, requests: list[dict]) -> None:
    chunk_size = 500
    for start in range(0, len(requests), chunk_size):
        chunk = requests[start : start + chunk_size]
        safe_api_call(lambda chunk=chunk: spreadsheet.batch_update({"requests": chunk}))


def apply_highlights(cache: SheetCache) -> None:
    """Paint recorded issues into the spreadsheet (rows yellow, cells red)."""
    if not HIGHLIGHT_MODE:
        return

    tui.section("Highlighting issues in the sheet")

    try:
        sheet_ids = {ws.title: ws.id for ws in safe_api_call(cache.spreadsheet.worksheets)}
    except gspread.exceptions.APIError as exc:
        tui.line("fail", f"Could not list worksheets: {exc}")
        return

    requests: list[dict] = []
    reset_sheets: list[str] = []

    # Reset the background of every data row in each validated sheet so stale
    # highlights from a previous run disappear once the data is fixed.
    for sheet in ALL_SHEETS:
        if is_excluded(sheet) or sheet not in sheet_ids:
            continue
        reset_sheets.append(sheet)
        requests.append(
            {
                "updateCells": {
                    "range": {"sheetId": sheet_ids[sheet], "startRowIndex": 1},
                    "fields": "userEnteredFormat.backgroundColor",
                }
            }
        )

    row_count = 0
    cell_count = 0
    for sheet, rows in ISSUE_CELLS.items():
        sheet_id = sheet_ids.get(sheet)
        if sheet_id is None or is_excluded(sheet):
            continue
        for row, cols in sorted(rows.items()):
            row_count += 1
            requests.append(
                {
                    "repeatCell": {
                        "range": {
                            "sheetId": sheet_id,
                            "startRowIndex": row - 1,
                            "endRowIndex": row,
                        },
                        "cell": {"userEnteredFormat": {"backgroundColor": HIGHLIGHT_ROW_COLOR}},
                        "fields": "userEnteredFormat.backgroundColor",
                    }
                }
            )
            for col in sorted(cols):
                cell_count += 1
                requests.append(
                    {
                        "repeatCell": {
                            "range": {
                                "sheetId": sheet_id,
                                "startRowIndex": row - 1,
                                "endRowIndex": row,
                                "startColumnIndex": col,
                                "endColumnIndex": col + 1,
                            },
                            "cell": {"userEnteredFormat": {"backgroundColor": HIGHLIGHT_CELL_COLOR}},
                            "fields": "userEnteredFormat.backgroundColor",
                        }
                    }
                )

    if not requests:
        tui.note("Nothing to highlight.", indent=2)
        return

    try:
        _batch_update(cache.spreadsheet, requests)
    except gspread.exceptions.APIError as exc:
        tui.line("fail", f"Could not write highlights: {exc}")
        tui.note(f"Give the service account '{credentials.service_account_email}' Editor access to the sheet.")
        return

    tui.line(
        "pass",
        f"Cleared old highlights in {tui.plural(len(reset_sheets), 'sheet')}; painted "
        f"{tui.plural(row_count, 'row')} yellow and {tui.plural(cell_count, 'cell')} red.",
    )


# -- Phase 0: Table Format Validation -----------------------------------------
def check_table_format(cache: SheetCache, table_name: str) -> list[tuple[int, str, str]] | None:
    """(row, column, message) for every format issue in one sheet, or None
    when the sheet is missing or empty."""
    rules_map = ALL_RULES.get(table_name, {})
    if not rules_map:
        return []

    try:
        headers, rows = cache.get_data(table_name)
    except Exception:
        return None

    if not headers:
        return None

    col_indices = {h.strip().lower(): i for i, h in enumerate(headers)}

    errors = []

    id_patterns = {
        "accounts": (re.compile(r"^BR\d+$"), "BR followed by digits (for example, BR64)"),
        "ticker": (re.compile(r"^BR\d+$"), "BR followed by digits (for example, BR64)"),
        "alias": (re.compile(r"^BR\d+$"), "BR followed by digits (for example, BR64)"),
        "centers": (re.compile(r"^CN\d+$"), "CN followed by digits (for example, CN3)"),
        "services": (re.compile(r"^CN\d+$"), "CN followed by digits (for example, CN3)"),
        "functions": (re.compile(r"^CN\d+$"), "CN followed by digits (for example, CN3)"),
        "tech": (re.compile(r"^CN\d+$"), "CN followed by digits (for example, CN3)"),
        "prospects": (re.compile(r"^CD-\d+$"), "CD- followed by digits (for example, CD-4393)"),
    }
    url_pattern = re.compile(r"https?://|www\.")

    for row_idx, row in enumerate(rows, start=2):
        for col_name, rule in rules_map.items():
            idx = col_indices.get(col_name.lower())
            val = row[idx].strip() if idx is not None and idx < len(row) else ""

            if val == "#N/A":
                val = ""

            is_nullable = rule.get("Can Be Nullable", "Yes").lower() == "yes"
            # A column can be conditionally nullable: for example a source
            # link may be blank when its source type is "Others".
            nullable_when = rule.get("Nullable When")
            if nullable_when and not val:
                other_idx = col_indices.get(nullable_when["column"].lower())
                other_val = row[other_idx].strip() if other_idx is not None and other_idx < len(row) else ""
                if other_val == nullable_when["equals"]:
                    is_nullable = True
            can_have_url = rule.get("Can Have URL", "Yes").lower() == "yes"
            desc = rule.get("Description", "")

            if not val:
                if not is_nullable:
                    errors.append((row_idx, col_name, "Cannot be null/empty"))
                continue

            if not can_have_url:
                if url_pattern.search(val):
                    errors.append((row_idx, col_name, f"Cannot contain URL: {val}"))

            # Descriptions are hand-written and carry stray double spaces, so
            # collapse runs of whitespace before matching. Without this the
            # center_country_iso2 rule ("should  be IN") never fired.
            desc_lower = re.sub(r"\s+", " ", desc).strip().lower()

            if col_name == "uuid" or "uuid" in desc_lower:
                pattern, expected_format = id_patterns.get(
                    table_name,
                    (re.compile(r"^.+$"), "a non-empty identifier"),
                )
                if not pattern.match(val):
                    errors.append(
                        (
                            row_idx,
                            col_name,
                            f"Invalid identifier, expected {expected_format}: {val}",
                        )
                    )

            elif "date in this exact format" in desc_lower:
                if not re.match(r"^[1-9]\d?-[A-Za-z]+-\d{4}$", val):
                    errors.append(
                        (
                            row_idx,
                            col_name,
                            f"Invalid date format (expected D-FullMonth-YYYY): {val}",
                        )
                    )
                else:
                    try:
                        parsed_date = datetime.strptime(val, "%d-%B-%Y")
                        canonical_date = f"{parsed_date.day}-{parsed_date.strftime('%B-%Y')}"
                        if canonical_date != val:
                            raise ValueError
                    except ValueError:
                        errors.append(
                            (
                                row_idx,
                                col_name,
                                f"Invalid date; use a real date with the full month name (example: 7-August-2025): {val}",
                            )
                        )

            elif "||" in desc:
                allowed = [x.strip() for x in desc.split("||")[1:] if x.strip()]
                if val not in allowed:
                    errors.append(
                        (row_idx, col_name, f"Must be one of {allowed}: {val}")
                    )

            elif "linkedin" in desc_lower:
                if "linkedin.com" not in val.lower():
                    errors.append(
                        (row_idx, col_name, f"Must be linkedin.com format: {val}")
                    )

            elif "valid url" in desc_lower or desc_lower == "should be url":
                # One URL per line: a scheme or www. or a bare domain, and no
                # whitespace inside the line (two URLs pasted with a space
                # between them is the common failure).
                for line in val.split("\n"):
                    line = line.strip()
                    if line and not URL_LINE_PATTERN.match(line):
                        errors.append((row_idx, col_name, f"Not a URL: {line}"))

            elif "string or number" in desc_lower and "15 characters" in desc_lower:
                clean_val = val.replace(",", "")
                is_number = clean_val.isdigit() or re.match(
                    r"^\d+(\.\d+)?$", clean_val
                )
                if not is_number and len(val) > 15:
                    errors.append(
                        (
                            row_idx,
                            col_name,
                            f"String value must not exceed 15 characters: {val}",
                        )
                    )

            # Rank caps come before the generic number check: these columns are
            # described as "only number", so keying the caps off the description
            # alone meant the number branch always won and the bounds never ran.
            elif col_name.endswith("forbes_2000_rank") or "2000 rank" in desc_lower:
                clean_val = val.replace(",", "")
                if not clean_val.isdigit() or int(clean_val) > 2000:
                    errors.append((row_idx, col_name, f"Must be number <= 2000: {val}"))

            elif col_name.endswith("fortune_500_rank") or "500 rank" in desc_lower:
                clean_val = val.replace(",", "")
                if not clean_val.isdigit() or int(clean_val) > 500:
                    errors.append((row_idx, col_name, f"Must be number <= 500: {val}"))

            elif "only number" in desc_lower or desc_lower == "number":
                clean_val = val.replace(",", "")
                if not clean_val.isdigit() and not re.match(
                    r"^\d+(\.\d+)?$", clean_val
                ):
                    errors.append((row_idx, col_name, f"Must be a number: {val}"))

            elif "valid year" in desc_lower:
                clean_val = val.replace(",", "")
                if not clean_val.isdigit() or len(clean_val) > 4:
                    errors.append((row_idx, col_name, f"Must be valid year: {val}"))

            elif "no numbers" in desc_lower:
                if re.search(r"\d", val):
                    errors.append((row_idx, col_name, f"Cannot contain numbers: {val}"))

            elif "valid pincode" in desc_lower or "6 digit" in desc_lower:
                if not re.match(r"^\d{6}$", val):
                    errors.append(
                        (row_idx, col_name, f"Must be 6 digit pincode: {val}")
                    )

            elif "10 digit phone" in desc_lower:
                if not re.match(r"^\d{10}$", val):
                    errors.append((row_idx, col_name, f"Must be a 10 digit phone number: {val}"))

            elif "iso code should be in" in desc_lower:
                if val != "IN":
                    errors.append((row_idx, col_name, f"ISO code must be IN: {val}"))

            elif "valid email" in desc_lower:
                # Practical email regex: local part (letters, digits, . _ % + -),
                # a domain with at least one dot, and a 2+ letter TLD. Rejects
                # spaces, missing @, trailing dot, and single-label domains.
                if not EMAIL_PATTERN.match(val):
                    errors.append((row_idx, col_name, f"Invalid email: {val}"))

            elif "valid lat" in desc_lower or "valid longitude" in desc_lower:
                try:
                    float(val)
                except ValueError:
                    errors.append(
                        (row_idx, col_name, f"Must be valid coordinate: {val}")
                    )

    for r_idx, c_name, _msg in errors:
        record_issue(table_name, r_idx, c_name, headers)
    return errors


@dataclass
class PhaseResult:
    """What one phase found. errors fail the run; warnings do not."""

    label: str
    name: str
    errors: int = 0
    warnings: int = 0
    detail: str = ""
    # True when cleanup.py fixes this kind of issue, so the verdict can say so.
    fixable: bool = False

    @property
    def status(self) -> str:
        return tui.status_of(self.errors, self.warnings)


# Every phase in run order, so the summary can list the ones a failing
# phase stopped before they ran.
PHASES = [
    ("Phase 0", "Format"),
    ("Phase 0B", "Invisible characters"),
    ("Phase 0C", "Chips and dropdowns"),
    ("Phase 1", "Uniqueness"),
    ("Phase 2", "References"),
    ("Phase 2B", "Completeness"),
    ("Phase 2C", "Engagement flags"),
    ("Phase 3", "Service coverage"),
]

# Rows shown per detail table. Set from --limit in main().
DETAIL_LIMIT = 20


def problem_kind(message: str) -> str:
    """'Invalid email: x@y' -> 'Invalid email'. Groups issues for the
    most-common breakdown."""
    return message.split(":", 1)[0]


def check_all_tables_format(cache: SheetCache) -> PhaseResult:
    tui.section("Phase 0 · Format")
    result = PhaseResult("Phase 0", "Format", fixable=True)

    overview = tui.table("Sheet", "Rows#", "Issues#", "")
    issues: list[tuple[str, int, str, str]] = []
    checked_rows = 0
    for table_name in [t for t in ALL_SHEETS if not is_excluded(t)]:
        errors = check_table_format(cache, table_name)
        if errors is None:
            result.errors += 1
            overview.add_row(table_name, "-", "-", f"{tui.ICONS['fail']} not found or empty")
            continue
        rows = len(cache.get_data(table_name)[1])
        checked_rows += rows
        issues.extend((table_name, r, c, m) for r, c, m in errors)
        overview.add_row(
            table_name,
            tui.num(rows),
            tui.num(len(errors)) if errors else "[muted]0[/muted]",
            tui.ICONS["fail" if errors else "pass"],
        )
    tui.print_table(overview)

    result.errors += len(issues)
    if not issues:
        result.detail = f"{tui.num(checked_rows)} rows checked"
        return result

    sheets_hit = len({i[0] for i in issues})
    result.detail = f"{tui.plural(len(issues), 'issue')} in {tui.plural(sheets_hit, 'sheet')}"

    # With many issues, a breakdown says more than the first few rows do.
    if len(issues) > DETAIL_LIMIT:
        counts: dict[tuple[str, str, str], int] = {}
        for sheet, _row, column, message in issues:
            key = (sheet, column, problem_kind(message))
            counts[key] = counts.get(key, 0) + 1
        breakdown = tui.table("Sheet", "Column", "Problem", "Cells#", title="Most common")
        top = sorted(counts.items(), key=lambda kv: -kv[1])
        tui.capped(breakdown, [(s, c, p, tui.num(n)) for (s, c, p), n in top], DETAIL_LIMIT, "kind")

    details = tui.table("Sheet", "Row#", "Column", "Problem~", title="Issues")
    rows = [(s, r, c, tui.clip(m, 80)) for s, r, c, m in issues]
    tui.capped(details, rows, DETAIL_LIMIT, "issue")
    return result


# -- Phase 0B: Invisible Characters --------------------------------------------


def check_invisible_characters(cache: SheetCache) -> PhaseResult:
    """Flag cells containing zero-width or other invisible characters."""
    tui.section("Phase 0B · Invisible characters")
    result = PhaseResult("Phase 0B", "Invisible characters", fixable=True)

    offenders: list[tuple[str, int, str, str, str]] = []
    for table in [t for t in ALL_SHEETS if not is_excluded(t)]:
        try:
            headers, rows = cache.get_data(table)
        except gspread.exceptions.WorksheetNotFound:
            tui.line("skip", f"'{table}' not found, skipped.")
            continue

        for row_idx, row in enumerate(rows, start=2):
            for col_idx, value in enumerate(row):
                hits = INVISIBLE_CHARS_RE.findall(str(value))
                if not hits:
                    continue
                column = headers[col_idx] if col_idx < len(headers) else f"col {col_idx + 1}"
                kinds = ", ".join(sorted({INVISIBLE_CHARS[h] for h in hits}))
                # Make the invisible characters visible in the report.
                preview = tui.clip(INVISIBLE_CHARS_RE.sub("<?>", str(value)), 50)
                offenders.append((table, row_idx, column, kinds, preview))
                record_issue(table, row_idx, col_idx)

    if not offenders:
        tui.line("pass", "No invisible characters.")
        result.detail = "none found"
        return result

    result.errors = len(offenders)
    result.detail = f"{tui.plural(len(offenders), 'cell')}"
    tui.line("fail", f"{tui.plural(len(offenders), 'cell')} contain invisible characters.")
    details = tui.table("Sheet", "Row#", "Column", "Character(s)", "Value (shown as <?>)~")
    tui.capped(details, offenders, DETAIL_LIMIT, "cell")
    return result


# -- Phase 0C: Chips and dropdowns ----------------------------------------------


def header_name(headers: list[str], col_idx: int) -> str:
    return headers[col_idx] if col_idx < len(headers) else f"col {col_idx + 1}"


def check_chips_and_dropdowns(cache: SheetCache) -> PhaseResult:
    """
    Every cell must be plain text: no smart chips, no dropdowns. A chip shows
    the right text but is not text, so lookups (VLOOKUP, MATCH) skip it; a
    dropdown restricts entry and can wrap values in chips. Neither is visible
    in the values the other phases read, so this reads cell metadata, one
    extra API call per sheet.
    """
    tui.section("Phase 0C · Chips and dropdowns")
    result = PhaseResult("Phase 0C", "Chips and dropdowns", fixable=True)

    chip_findings: list[tuple[str, int, str, str, str]] = []
    dropdown_findings: list[tuple[str, int, str, str, str]] = []
    sheets = [t for t in ALL_SHEETS if not is_excluded(t)]
    with tui.loading(len(sheets), "Reading cell metadata") as bar:
        for sheet in sheets:
            bar.start(f"Reading chips and dropdowns in '{sheet}'")
            try:
                meta = safe_api_call(lambda: cell_meta.fetch(cache.spreadsheet, sheet))
                headers, rows = cache.get_data(sheet)
            except gspread.exceptions.WorksheetNotFound:
                bar.done()
                continue
            for chip in meta.chips:
                column = header_name(headers, chip.col)
                chip_findings.append((sheet, chip.row, column, f"{chip.kind} chip", tui.clip(chip.text, 50)))
                record_issue(sheet, chip.row, chip.col)
            for dropdown in meta.dropdowns:
                column = header_name(headers, dropdown.col)
                data_row = rows[dropdown.row - 2] if dropdown.row - 2 < len(rows) else []
                value = data_row[dropdown.col] if dropdown.col < len(data_row) else ""
                dropdown_findings.append((sheet, dropdown.row, column, "dropdown", tui.clip(str(value), 50)))
                record_issue(sheet, dropdown.row, dropdown.col)
            bar.done()

    # Chips first: they are the few cells that break lookups, while
    # dropdowns tend to cover whole columns and would push them out of view.
    findings = chip_findings + dropdown_findings
    if not findings:
        tui.line("pass", "Every cell is plain text: no chips, no dropdowns.")
        result.detail = "none found"
        return result

    result.errors = len(findings)
    parts = []
    if chip_findings:
        parts.append(tui.plural(len(chip_findings), "chip"))
    if dropdown_findings:
        parts.append(tui.plural(len(dropdown_findings), "dropdown cell"))
    result.detail = ", ".join(parts)
    tui.line("fail", f"{result.detail}. cleanup.py turns chips into text and removes dropdowns.")

    # Dropdowns usually cover a whole column, so the per-column count is the
    # useful view; the cell list follows for chips.
    counts: dict[tuple[str, str, str], int] = {}
    for sheet, _row, col, kind, _text in findings:
        counts[(sheet, col, kind)] = counts.get((sheet, col, kind), 0) + 1
    overview = tui.table("Sheet", "Column", "Kind", "Cells#")
    for (sheet, col, kind), n in sorted(counts.items(), key=lambda kv: -kv[1]):
        overview.add_row(sheet, col, kind, tui.num(n))
    tui.print_table(overview)

    details = tui.table("Sheet", "Row#", "Column", "Kind", "Shows~", title="Cells")
    tui.capped(details, findings, DETAIL_LIMIT, "cell")
    return result


# -- Phase 1: Uniqueness -------------------------------------------------------


def get_combined_values(
    cache: SheetCache, sheet_name: str, columns: list[str]
) -> list[tuple[int, str]]:
    """
    (row, combined value) for a key made of several columns, values joined
    with ' | ' and lowercased. Rows where every column is blank are skipped.
    """
    headers, rows = cache.get_data(sheet_name)
    missing = [c for c in columns if c.lower() not in headers]
    if missing:
        console.print(
            f"[error][ERROR][/error] Column(s) {', '.join(missing)} not found in sheet '{sheet_name}'."
        )
        sys.exit(1)
    indices = [headers.index(c.lower()) for c in columns]
    results: list[tuple[int, str]] = []
    for idx, row in enumerate(rows, start=2):
        parts = [str(row[i]).strip() if i < len(row) else "" for i in indices]
        if any(parts):
            results.append((idx, " | ".join(parts).lower()))
    return results


def check_uniqueness(cache: SheetCache) -> PhaseResult:
    """Check that primary key columns contain no duplicate values."""
    tui.section("Phase 1 · Uniqueness")
    result = PhaseResult("Phase 1", "Uniqueness")

    overview = tui.table("Sheet", "Key", "Values#", "Duplicates#", "")
    dup_rows: list[tuple[str, str, str, str]] = []

    for rule in UNIQUENESS_RULES:
        sheet_name = rule["sheet"]
        columns = rule.get("columns") or [rule["column"]]
        column = " + ".join(columns)
        if is_excluded(sheet_name):
            overview.add_row(sheet_name, column, "-", "-", f"{tui.ICONS['skip']} excluded")
            continue

        try:
            if len(columns) == 1:
                data = cache.get_column_values(sheet_name, column)
            else:
                data = get_combined_values(cache, sheet_name, columns)
        except gspread.exceptions.WorksheetNotFound:
            overview.add_row(sheet_name, column, "-", "-", f"{tui.ICONS['warn']} not found")
            result.warnings += 1
            continue

        seen: dict[str, list[int]] = {}
        for row, val in data:
            seen.setdefault(val.strip(), []).append(row)
        duplicates = {val: rows for val, rows in seen.items() if len(rows) > 1}

        if duplicates:
            headers, _ = cache.get_data(sheet_name)
            for rows in duplicates.values():
                for row in rows:
                    for col in columns:
                        record_issue(sheet_name, row, col, headers)
            result.errors += len(duplicates)
            for val, rows in sorted(duplicates.items()):
                shown = ", ".join(str(r) for r in rows[:10])
                if len(rows) > 10:
                    shown += f" (+{len(rows) - 10} more)"
                dup_rows.append((sheet_name, column, tui.clip(val, 70), shown))

        overview.add_row(
            sheet_name,
            column,
            tui.num(len(data)),
            tui.num(len(duplicates)) if duplicates else "[muted]0[/muted]",
            tui.ICONS["fail" if duplicates else "pass"],
        )

    tui.print_table(overview)
    if dup_rows:
        details = tui.table("Sheet", "Key", "Duplicate value~", "Rows", title="Duplicates")
        tui.capped(details, dup_rows, DETAIL_LIMIT, "duplicate")
        result.detail = tui.plural(result.errors, "duplicate value")
    else:
        result.detail = "every key unique"
    return result


# -- Phase 2: Referential Integrity --------------------------------------------


def check_references(cache: SheetCache) -> PhaseResult:
    """
    For every rule in VALIDATION_RULES, every value of the column in the
    target sheets must exist in the source sheet. A value that exists only
    with different casing is a warning (cleanup.py fixes it), a value that
    does not exist at all is an error.
    """
    tui.section("Phase 2 · References")
    result = PhaseResult("Phase 2", "References", fixable=True)

    overview = tui.table("Key", "Source → Sheet", "Values#", "Missing#", "Case#", "")
    missing_rows: list[tuple[str, int, str, str, str]] = []
    case_rows: list[tuple[str, int, str, str, str]] = []

    for rule in VALIDATION_RULES:
        source_sheet, column = rule["source_sheet"], rule["column"]
        if is_excluded(source_sheet):
            overview.add_row(column, f"{source_sheet} (excluded)", "-", "-", "-", tui.ICONS["skip"])
            continue
        try:
            source_data = cache.get_column_values(source_sheet, column)
        except gspread.exceptions.WorksheetNotFound:
            overview.add_row(column, f"{source_sheet} (not found)", "-", "-", "-", tui.ICONS["fail"])
            result.errors += 1
            continue

        source_canonical: dict[str, str] = {}
        for _, val in source_data:
            source_canonical.setdefault(val.lower(), val)

        for sheet_name in [t for t in rule["target_sheets"] if not is_excluded(t)]:
            try:
                sheet_data = cache.get_column_values(sheet_name, column)
            except gspread.exceptions.WorksheetNotFound:
                overview.add_row(column, f"{source_sheet} → {sheet_name}", "-", "-", "-", f"{tui.ICONS['warn']} not found")
                result.warnings += 1
                continue

            missing = 0
            case = 0
            target_headers, _ = cache.get_data(sheet_name)
            for row, val in sheet_data:
                expected = source_canonical.get(val.lower())
                if expected is None:
                    missing += 1
                    missing_rows.append((sheet_name, row, column, tui.clip(val, 60), source_sheet))
                    record_issue(sheet_name, row, column, target_headers)
                elif val != expected:
                    case += 1
                    case_rows.append((sheet_name, row, column, tui.clip(val, 45), tui.clip(expected, 45)))

            result.errors += missing
            result.warnings += case
            overview.add_row(
                column,
                f"{source_sheet} → {sheet_name}",
                tui.num(len(sheet_data)),
                tui.num(missing) if missing else "[muted]0[/muted]",
                tui.num(case) if case else "[muted]0[/muted]",
                tui.ICONS[tui.status_of(missing, case)],
            )

    tui.print_table(overview)
    if missing_rows:
        details = tui.table("Sheet", "Row#", "Column", "Value~", "Not found in", title="Missing from the source sheet")
        tui.capped(details, missing_rows, DETAIL_LIMIT, "row")
    if case_rows:
        details = tui.table("Sheet", "Row#", "Column", "Value~", "Source spells it~", title="Case mismatches")
        tui.capped(details, case_rows, DETAIL_LIMIT, "row")

    parts = []
    if result.errors:
        parts.append(tui.plural(result.errors, "missing value"))
    if result.warnings:
        parts.append(tui.plural(result.warnings, "case mismatch", "case mismatches"))
    result.detail = ", ".join(parts) or f"{len(VALIDATION_RULES)} rules, all match"
    return result


def check_completeness(cache: SheetCache) -> PhaseResult:
    """Check that every source value appears at least once in the target sheet."""
    tui.section("Phase 2B · Completeness")
    result = PhaseResult("Phase 2B", "Completeness")

    overview = tui.table("Source", "Target", "Values#", "Missing#", "")
    missing_rows: list[tuple[str, int, str, str]] = []

    for rule in COMPLETENESS_RULES:
        source_sheet, target_sheet, column = rule["source_sheet"], rule["target_sheet"], rule["column"]
        if is_excluded(source_sheet) or is_excluded(target_sheet):
            overview.add_row(source_sheet, target_sheet, "-", "-", f"{tui.ICONS['skip']} excluded")
            continue
        try:
            source_data = cache.get_column_values(source_sheet, column)
            target_data = cache.get_column_values(target_sheet, column)
        except gspread.exceptions.WorksheetNotFound:
            overview.add_row(source_sheet, target_sheet, "-", "-", f"{tui.ICONS['fail']} not found")
            result.errors += 1
            continue

        target_values = {val.lower() for _, val in target_data}
        missing = [(row, val) for row, val in source_data if val.lower() not in target_values]
        if missing:
            source_headers, _ = cache.get_data(source_sheet)
            for row, val in missing:
                record_issue(source_sheet, row, column, source_headers)
                missing_rows.append((source_sheet, row, tui.clip(val, 60), target_sheet))
        result.errors += len(missing)
        overview.add_row(
            source_sheet,
            target_sheet,
            tui.num(len(source_data)),
            tui.num(len(missing)) if missing else "[muted]0[/muted]",
            tui.ICONS["fail" if missing else "pass"],
        )

    tui.print_table(overview)
    if missing_rows:
        details = tui.table("Sheet", "Row#", "Value~", "Missing from", title="Not present in the target sheet")
        tui.capped(details, missing_rows, DETAIL_LIMIT, "row")
        result.detail = tui.plural(result.errors, "missing row")
    else:
        result.detail = "every account in alias and ticker"
    return result


# -- Phase 2C: Engagement flags ------------------------------------------------


def check_engagement_flags(cache: SheetCache) -> PhaseResult:
    """
    prospects.prospect_engaged should be 'Yes' exactly when the prospect's
    email has a row in subscribers. The app's Engaged filter reads the flag
    while the activity timeline reads subscribers, so a mismatch shows a
    prospect as not engaged with a timeline, or engaged with none.

    Warning only: mismatches never fail the run.
    """
    tui.section("Phase 2C · Engagement flags")
    result = PhaseResult("Phase 2C", "Engagement flags")

    if is_excluded("prospects") or is_excluded("subscribers"):
        tui.line("skip", "prospects or subscribers excluded via --exclude.")
        result.detail = "skipped"
        return result

    try:
        engaged_emails = {val.lower() for _, val in cache.get_column_values("subscribers", "prospect_email")}
        headers, rows = cache.get_data("prospects")
    except gspread.exceptions.WorksheetNotFound:
        tui.line("warn", "prospects or subscribers not found, skipped.")
        result.warnings = 1
        result.detail = "sheet not found"
        return result

    email_idx = headers.index("prospect_email") if "prospect_email" in headers else -1
    flag_idx = headers.index("prospect_engaged") if "prospect_engaged" in headers else -1
    if email_idx < 0 or flag_idx < 0:
        tui.line("warn", "prospects lacks prospect_email or prospect_engaged, skipped.")
        result.warnings = 1
        result.detail = "column not found"
        return result

    mismatches: list[tuple[int, str, str, str]] = []
    for row_num, row in enumerate(rows, start=2):
        email = str(row[email_idx]).strip() if email_idx < len(row) else ""
        flag = str(row[flag_idx]).strip() if flag_idx < len(row) else ""
        if not email:
            continue
        expected = "Yes" if email.lower() in engaged_emails else "No"
        if flag.lower() != expected.lower():
            mismatches.append((row_num, email, flag or "(blank)", expected))
            record_issue("prospects", row_num, "prospect_engaged", headers)

    if not mismatches:
        tui.line("pass", "Every prospect_engaged flag matches subscribers.")
        result.detail = "all flags match"
        return result

    result.warnings = len(mismatches)
    result.detail = tui.plural(len(mismatches), "prospect row")
    tui.line("warn", f"{tui.plural(len(mismatches), 'prospect row')} disagree with subscribers.")
    details = tui.table("Row#", "prospect_email", "prospect_engaged", "Expected")
    tui.capped(details, mismatches, DETAIL_LIMIT, "row")
    return result


# -- Phase 3: Service Coverage -------------------------------------------------


def check_service_coverage(cache: SheetCache) -> PhaseResult:
    """
    For each row in the services sheet, verify that at least one
    service column is filled in (non-empty).
    """
    tui.section("Phase 3 · Service coverage")
    result = PhaseResult("Phase 3", "Service coverage")

    for rule in SERVICE_COVERAGE_RULES:
        sheet_name = rule["sheet"]
        label_col = rule["label_column"]
        service_cols = rule["service_columns"]

        if is_excluded(sheet_name):
            tui.line("skip", f"'{sheet_name}' excluded via --exclude.")
            result.detail = "skipped"
            continue

        try:
            headers, rows = cache.get_data(sheet_name)
        except gspread.exceptions.WorksheetNotFound:
            tui.line("fail", f"'{sheet_name}' not found.")
            result.errors += 1
            continue

        col_indices = {
            name: headers.index(name.strip().lower())
            for name in service_cols + [label_col]
            if name.strip().lower() in headers
        }
        label_idx = col_indices.get(label_col)
        service_idxs = [col_indices[c] for c in service_cols if c in col_indices]
        if not service_idxs:
            tui.line("fail", f"No service columns found in '{sheet_name}'.")
            result.errors += 1
            continue

        empty_rows: list[tuple[int, str]] = []
        total_data_rows = 0
        for i, row in enumerate(rows, start=2):
            label = row[label_idx].strip() if label_idx is not None and label_idx < len(row) else ""
            if not label:
                continue
            total_data_rows += 1
            if not any(idx < len(row) and row[idx].strip() for idx in service_idxs):
                empty_rows.append((i, label))

        with_service = total_data_rows - len(empty_rows)
        coverage = (with_service / total_data_rows * 100) if total_data_rows else 0
        result.detail = f"{coverage:.1f}% of {tui.num(total_data_rows)} rows"

        if not empty_rows:
            tui.line("pass", f"All {tui.num(total_data_rows)} '{sheet_name}' rows have a service.")
            continue

        result.errors += len(empty_rows)
        for row_num, _label in empty_rows:
            for idx in service_idxs:
                record_issue(sheet_name, row_num, idx)
        tui.line(
            "fail",
            f"{tui.plural(len(empty_rows), 'row')} of {tui.num(total_data_rows)} have no service "
            f"({coverage:.1f}% coverage).",
        )
        details = tui.table("Row#", label_col)
        tui.capped(details, empty_rows, DETAIL_LIMIT, "row")

    return result


# -- Main ---------------------------------------------------------------------
def parse_excluded_sheets(argv: list[str]) -> set[str]:
    """Read --exclude a,b,c (or --exclude=a,b,c) into a set of sheet names."""
    raw: list[str] = []
    i = 1
    while i < len(argv):
        arg = argv[i]
        if arg == "--exclude":
            if i + 1 >= len(argv) or argv[i + 1].startswith("--"):
                console.print("[error][ERROR][/error] --exclude needs a comma-separated list of sheet names.")
                sys.exit(2)
            raw.append(argv[i + 1])
            i += 2
            continue
        if arg.startswith("--exclude="):
            raw.append(arg.split("=", 1)[1])
        i += 1

    names = {n.strip().lower() for chunk in raw for n in chunk.split(",") if n.strip()}
    unknown = sorted(names - set(ALL_SHEETS))
    if unknown:
        console.print(
            f"[error][ERROR][/error] Unknown sheet(s) in --exclude: {', '.join(unknown)}.\n"
            f"        Known sheets: {', '.join(ALL_SHEETS)}"
        )
        sys.exit(2)
    return names


def parse_limit(argv: list[str]) -> int:
    """Read --limit N (or --limit=N): rows shown per detail table."""
    for i, arg in enumerate(argv):
        value = None
        if arg == "--limit" and i + 1 < len(argv):
            value = argv[i + 1]
        elif arg.startswith("--limit="):
            value = arg.split("=", 1)[1]
        if value is not None:
            if not value.isdigit() or int(value) < 1:
                console.print("[error][ERROR][/error] --limit needs a whole number of at least 1.")
                sys.exit(2)
            return int(value)
    return DETAIL_LIMIT


def print_summary(results: list[PhaseResult]) -> int:
    """Phase-by-phase summary and the verdict panel. Returns the exit code."""
    tui.section("Summary")
    ran = {r.label: r for r in results}
    rows = []
    for label, name in PHASES:
        r = ran.get(label)
        if r is None:
            rows.append((label, name, "skip", "[muted]not run[/muted]"))
        else:
            rows.append((label, name, r.status, r.detail))
    tui.summary(rows)

    errors = sum(r.errors for r in results)
    warnings = sum(r.warnings for r in results)
    stopped = len(results) < len(PHASES)
    counts = f"{tui.plural(errors, 'error')}, {tui.plural(warnings, 'warning')}"

    next_steps: list[str] = []
    if any(r.fixable and (r.errors or r.warnings) for r in results):
        next_steps.append(
            "[bold]uv run cleanup.py[/bold] fixes formats, invisible characters, chips, "
            "dropdowns and case mismatches it can resolve on its own. Re-run validate.py after."
        )
    if errors and not HIGHLIGHT_MODE:
        next_steps.append("[bold]--highlight[/bold] colours the failing rows and cells in the sheet.")
    if stopped:
        next_steps.append("[bold]--force[/bold] runs every phase instead of stopping at the first failure.")

    if errors:
        failed = results[-1].label if stopped else None
        headline = f"FAILED · {counts}" + (f" · stopped after {failed}" if failed else "")
        tui.verdict("fail", headline, next_steps)
        return 1
    if warnings:
        tui.verdict("warn", f"PASSED with {tui.plural(warnings, 'warning')}", next_steps)
        return 0
    tui.verdict("pass", "PASSED · every check is clean", [])
    return 0


def main() -> None:
    global DETAIL_LIMIT
    force_mode = "--force" in sys.argv
    DETAIL_LIMIT = parse_limit(sys.argv)
    EXCLUDED_SHEETS.update(parse_excluded_sheets(sys.argv))

    try:
        with console.status("Connecting to Google Sheets ...", spinner_style="info"):
            spreadsheet = safe_api_call(lambda: gc.open_by_key(SPREADSHEET_ID))
    except gspread.exceptions.APIError as exc:
        console.print(
            f"[error][ERROR][/error] Could not open spreadsheet.\n"
            f"        Make sure the service account '{credentials.service_account_email}'\n"
            f"        has been added to the sheet.\n"
            f"        API error: {exc}"
        )
        sys.exit(1)

    options = []
    if force_mode:
        options.append("--force (every phase runs)")
    if EXCLUDED_SHEETS:
        options.append(f"--exclude {','.join(sorted(EXCLUDED_SHEETS))} (results are partial)")
    header_rows = [
        ("Spreadsheet", f"[bold]{spreadsheet.title}[/bold]"),
        ("Mode", "[warning]writes highlights into the sheet[/warning]" if HIGHLIGHT_MODE else "read-only"),
    ]
    if options:
        header_rows.append(("Options", "\n".join(options)))
    tui.header("validate", header_rows)

    cache = SheetCache(spreadsheet)
    cache.preload([t for t in ALL_SHEETS if not is_excluded(t)])

    checks = [
        check_all_tables_format,
        check_invisible_characters,
        check_chips_and_dropdowns,
        check_uniqueness,
        check_references,
        check_completeness,
        check_engagement_flags,
        check_service_coverage,
    ]
    results: list[PhaseResult] = []
    for check in checks:
        result = check(cache)
        results.append(result)
        if result.errors and not force_mode:
            break

    apply_highlights(cache)
    sys.exit(print_summary(results))


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        console.print()
        console.print("[warning]Stopped.[/warning]")
        sys.exit(130)
