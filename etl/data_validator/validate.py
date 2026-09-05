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
        accounts, centers, services, prospects, ticker, alias, functions, tech

  Phase 0B - Invisible Characters
      Flags cells containing zero-width spaces, BOMs, or soft hyphens
      (paste artifacts that corrupt keys, sorting, and search downstream).

  Phase 1 - Uniqueness Checks
      Ensures primary key columns contain no duplicates:
        - accounts.account_global_legal_name
        - centers.cn_unique_key
        - services.cn_unique_key
        - prospects.ps_unique_key

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

  Phase 3 - Service Coverage
      Every row in services must have at least one service column filled.

Uses a Google service-account for authentication. Configuration is read
from `.env` in the same directory.

Run with:
    uv run validate.py

The dependencies are declared in the PEP 723 metadata above and are installed
automatically by uv.
"""

import os
import re
import sys
import time
from datetime import datetime
from pathlib import Path

# Force UTF-8 output on Windows
sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")

import gspread
from dotenv import load_dotenv
from google.oauth2.service_account import Credentials
from rich.console import Console
from rich.panel import Panel
from rich.table import Table
from rich.theme import Theme

# -- Shared patterns ----------------------------------------------------------
# Practical email validator (not full RFC 5322, but rejects the common bad
# cases): non-empty local part, "@", a dotted domain, and a 2+ char TLD.
EMAIL_PATTERN = re.compile(r"^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$")

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

UNIQUENESS_RULES = [
    {"sheet": "accounts", "column": "account_global_legal_name"},
    {"sheet": "centers", "column": "cn_unique_key"},
    {"sheet": "services", "column": "cn_unique_key"},
    {"sheet": "prospects", "column": "ps_unique_key"},
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
        "focus_region": {
            "Can Be Nullable": "Yes",
            "Can Have URL": "No",
            "Description": "should be proper string if multiple then should have line breaks",
        },
        "service_it": {
            "Can Be Nullable": "Yes",
            "Can Have URL": "No",
            "Description": "should be proper string if multiple then should have line breaks",
        },
        "service_erd": {
            "Can Be Nullable": "Yes",
            "Can Have URL": "No",
            "Description": "should be proper string if multiple then should have line breaks",
        },
        "service_fna": {
            "Can Be Nullable": "Yes",
            "Can Have URL": "No",
            "Description": "should be proper string if multiple then should have line breaks",
        },
        "service_hr": {
            "Can Be Nullable": "Yes",
            "Can Have URL": "No",
            "Description": "should be proper string if multiple then should have line breaks",
        },
        "service_procurement": {
            "Can Be Nullable": "Yes",
            "Can Have URL": "No",
            "Description": "should be proper string if multiple then should have line breaks",
        },
        "service_sales_marketing": {
            "Can Be Nullable": "Yes",
            "Can Have URL": "No",
            "Description": "should be proper string if multiple then should have line breaks",
        },
        "service_customer_support": {
            "Can Be Nullable": "Yes",
            "Can Have URL": "No",
            "Description": "should be proper string if multiple then should have line breaks",
        },
        "service_others": {
            "Can Be Nullable": "Yes",
            "Can Have URL": "No",
            "Description": "should be proper string if multiple then should have line breaks",
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
            "Can Be Nullable": "Yes",
            "Can Have URL": "Yes",
            "Description": "string",
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
            "Can Have URL": "Yes",
            "Description": "string",
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
            "Description": "should contain||IT||ER&D||FnA||HR||Procurement & Supply Chain||Sales & Marketing||Customer Support||Others",
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
}

# Define pastel colors for a softer, more pleasing aesthetic
pastel_theme = Theme(
    {
        "success": "bold #A8E6CF",  # Pastel Green
        "error": "bold #FF8B94",  # Pastel Red
        "warning": "bold #FFD3B6",  # Pastel Orange/Yellow
        "info": "bold #A4C8F0",  # Pastel Blue
        "border": "bold #C8B6FF",  # Pastel Purple
        "muted": "dim #E2E2E2",
    }
)

console = Console(theme=pastel_theme)

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
SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets.readonly",
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


# -- Phase 0: Table Format Validation -----------------------------------------
def check_table_format(cache: SheetCache, table_name: str) -> bool:
    rules_map = ALL_RULES.get(table_name, {})
    if not rules_map:
        return True

    console.print(f"  [info][*][/info] Validating '{table_name}' format ...")

    try:
        headers, rows = cache.get_data(table_name)
    except Exception:
        console.print(f"  [error][FAIL][/error] Worksheet '{table_name}' not found.\n")
        return False

    if not headers:
        console.print(f"  [error][FAIL][/error] '{table_name}' sheet is empty.\n")
        return False

    col_indices = {h.strip().lower(): i for i, h in enumerate(headers)}

    all_ok = True
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

    if errors:
        all_ok = False
        console.print(
            f"  [error][FAIL][/error] Found {len(errors)} format issue(s) in '{table_name}'.\n"
        )

        err_table = Table(show_header=True, header_style="error", expand=False)
        err_table.add_column("Row", style="muted")
        err_table.add_column("Column")
        err_table.add_column("Error Details")

        for r_idx, c_name, msg in errors[:50]:
            err_table.add_row(str(r_idx), c_name, msg)

        console.print(Panel(err_table, expand=False, border_style="#FF8B94"))

        if len(errors) > 50:
            console.print(f"  [muted]... and {len(errors) - 50} more issues.[/muted]\n")
    else:
        console.print(
            f"  [success][OK][/success] '{table_name}' format validation passed ({len(rows)} rows)."
        )

    return all_ok


def check_all_tables_format(cache: SheetCache) -> bool:
    console.print()
    console.rule("[border]PHASE 0: FORMAT VALIDATION[/border]")
    console.print()

    tables = ["accounts", "centers", "services", "prospects", "ticker", "alias", "functions", "tech"]
    all_ok = True
    for t in tables:
        if not check_table_format(cache, t):
            all_ok = False

    return all_ok


# -- Phase 0B: Invisible Characters --------------------------------------------


def check_invisible_characters(cache: SheetCache) -> bool:
    """Flag cells containing zero-width or other invisible characters."""
    console.print()
    console.rule("[border]PHASE 0B: INVISIBLE CHARACTERS[/border]")
    console.print()

    tables = ["accounts", "centers", "services", "prospects", "ticker", "alias", "functions", "tech"]
    offenders: list[tuple[str, int, str, str, str]] = []

    for table in tables:
        console.print(f"  [info][*][/info] Scanning '{table}' for invisible characters ...")
        try:
            headers, rows = cache.get_data(table)
        except gspread.exceptions.WorksheetNotFound:
            console.print(
                f"  [warning][WARN][/warning] Worksheet '{table}' not found -- skipping.\n"
            )
            continue

        for row_idx, row in enumerate(rows, start=2):
            for col_idx, value in enumerate(row):
                hits = INVISIBLE_CHARS_RE.findall(str(value))
                if not hits:
                    continue
                column = headers[col_idx] if col_idx < len(headers) else f"col {col_idx + 1}"
                kinds = ", ".join(sorted({INVISIBLE_CHARS[h] for h in hits}))
                # Make the invisible characters visible in the report.
                preview = INVISIBLE_CHARS_RE.sub("<?>", str(value))[:50]
                offenders.append((table, row_idx, column, kinds, preview))

    if not offenders:
        console.print("\n  [success][OK][/success]  No invisible characters found.")
        return True

    console.print()
    report = Table(expand=False)
    report.add_column("Sheet", style="bold")
    report.add_column("Row")
    report.add_column("Column")
    report.add_column("Character(s)")
    report.add_column("Value (invisible chars shown as <?>)")
    shown_limit = 25
    for table, row_idx, column, kinds, preview in offenders[:shown_limit]:
        report.add_row(table, str(row_idx), column, kinds, preview)
    console.print(report)
    if len(offenders) > shown_limit:
        console.print(f"  [muted]... and {len(offenders) - shown_limit} more cell(s).[/muted]")

    console.print(
        f"\n  [error][FAIL][/error] {len(offenders)} cell(s) contain invisible characters.\n"
        '        Fix in Sheets: Edit > Find and replace, enable "Search using regular\n'
        '        expressions", find [\\x{200B}\\x{200C}\\x{200D}\\x{FEFF}\\x{00AD}] and\n'
        "        replace with nothing (All sheets)."
    )
    return False


# -- Phase 1: Uniqueness -------------------------------------------------------


def check_uniqueness(cache: SheetCache) -> bool:
    """Check that primary key columns contain no duplicate values."""
    console.print()
    console.rule("[border]PHASE 1: UNIQUENESS CHECKS[/border]")
    console.print()

    all_ok = True
    summary_rows = []

    for rule in UNIQUENESS_RULES:
        sheet_name = rule["sheet"]
        column = rule["column"]

        console.print(
            f"  [info][*][/info] Checking '{column}' is unique in '{sheet_name}' ..."
        )

        try:
            data = cache.get_column_values(sheet_name, column)
        except gspread.exceptions.WorksheetNotFound:
            console.print(
                f"  [warning][WARN][/warning] Worksheet '{sheet_name}' not found -- skipping.\n"
            )
            summary_rows.append(
                [sheet_name, column, "-", "-", "[warning]NOT FOUND[/warning]"]
            )
            continue
        total = len(data)

        # Find duplicates: values that appear more than once
        seen: dict[str, list[int]] = {}
        for row, val in data:
            key = val.strip()
            seen.setdefault(key, []).append(row)

        duplicates = {val: rows for val, rows in seen.items() if len(rows) > 1}

        if duplicates:
            all_ok = False
            dup_count = sum(len(rows) for rows in duplicates.values())
            console.print(
                f"  [error][FAIL][/error] {len(duplicates)} duplicate value(s) "
                f"({dup_count} total rows) in '{sheet_name}.{column}'"
            )

            dup_table = Table(show_header=True, header_style="error", expand=False)
            dup_table.add_column("Duplicate Value")
            dup_table.add_column("Count", style="muted")
            dup_table.add_column("Rows", style="muted")

            for val, rows in sorted(duplicates.items()):
                rows_str = ", ".join(str(r) for r in rows[:10])
                if len(rows) > 10:
                    rows_str += f" ... (+{len(rows) - 10} more)"
                dup_table.add_row(val, str(len(rows)), rows_str)

            console.print(Panel(dup_table, expand=False, border_style="#FF8B94"))

            summary_rows.append(
                [
                    sheet_name,
                    column,
                    str(total),
                    f"[error]{len(duplicates)} duplicates ({dup_count} rows)[/error]",
                    "[error]FAIL[/error]",
                ]
            )
        else:
            console.print(f"  [success][OK][/success]  {total} value(s) -- all unique.")
            summary_rows.append(
                [
                    sheet_name,
                    column,
                    str(total),
                    "[muted]0 duplicates[/muted]",
                    "[success]PASS[/success]",
                ]
            )
        console.print()

    # Summary table
    summary_table = Table(show_header=True, header_style="info", expand=False, box=None)
    summary_table.add_column("Sheet")
    summary_table.add_column("Column")
    summary_table.add_column("Rows")
    summary_table.add_column("Issues")
    summary_table.add_column("Status")

    for r in summary_rows:
        summary_table.add_row(*r)

    console.print(
        Panel(
            summary_table,
            title="[bold]Uniqueness Summary[/bold]",
            expand=False,
            border_style="#A4C8F0",
        )
    )
    console.print()

    return all_ok


# -- Phase 2: Referential Integrity --------------------------------------------


def validate_column(
    cache: SheetCache,
    source_sheet: str,
    column: str,
    target_sheets: list[str],
) -> tuple[int, int, bool]:
    """
    Validate that every value in *column* across *target_sheets*
    exists in *source_sheet*.  Returns (total_mismatches,
    total_case_warnings, had_failures).
    """
    console.print()
    console.rule(
        f"[border]RULE: \"{column}\"  --  source of truth: '{source_sheet}'[/border]"
    )
    console.print()

    # -- Read source of truth --------------------------------------------------
    console.print(f"  [info][*][/info] Reading '{source_sheet}' (source of truth) ...")
    try:
        source_data = cache.get_column_values(source_sheet, column)
    except gspread.exceptions.WorksheetNotFound:
        console.print(
            f"  [error][FAIL][/error] Worksheet '{source_sheet}' not found -- cannot validate.\n"
        )
        return 0, 0, True

    source_set = set(val.lower() for _, val in source_data)
    source_canonical: dict[str, str] = {}
    for _, val in source_data:
        source_canonical.setdefault(val.lower(), val)
    console.print(
        f"  [success][OK][/success]  {len(source_data)} value(s) ({len(source_set)} unique)\n"
    )

    # -- Validate targets ------------------------------------------------------
    has_failures = False
    total_mismatches = 0
    total_case_warnings = 0

    sheet_summary_rows = []

    for sheet_name in target_sheets:
        console.print(
            f"  [info][*][/info] Validating '{sheet_name}' --> '{source_sheet}' ..."
        )
        try:
            sheet_data = cache.get_column_values(sheet_name, column)
        except gspread.exceptions.WorksheetNotFound:
            console.print(
                f"  [warning][WARN][/warning] Worksheet '{sheet_name}' not found -- skipping.\n"
            )
            sheet_summary_rows.append(
                [sheet_name, "-", "-", "[warning]NOT FOUND[/warning]"]
            )
            continue
        sheet_unique = set(val.lower() for _, val in sheet_data)

        mismatches: list[tuple[int, str]] = []
        case_warnings: list[tuple[int, str, str]] = []

        for row, val in sheet_data:
            lower = val.lower()
            if lower not in source_set:
                mismatches.append((row, val))
            elif val != source_canonical[lower]:
                case_warnings.append((row, val, source_canonical[lower]))

        unique_mismatch_names = set(m[1].lower() for m in mismatches)
        unique_case_names = set(cw[1].lower() for cw in case_warnings)

        total_mismatches += len(mismatches)
        total_case_warnings += len(case_warnings)

        status = "[success]PASS[/success]"

        # Report case warnings
        if case_warnings:
            status = "[warning]WARN[/warning]"
            console.print(
                f"  [warning][WARN][/warning] Case mismatches: {len(unique_case_names)} unique ({len(case_warnings)} rows)"
            )

            cw_table = Table(show_header=True, header_style="border", expand=False)
            cw_table.add_column("Row", style="muted")
            cw_table.add_column(f"Value in '{sheet_name}'")
            cw_table.add_column(f"Expected ('{source_sheet}')")

            for row, src_name, canon_name in case_warnings:
                cw_table.add_row(str(row), src_name, canon_name)

            # Print table padded a bit
            console.print(Panel(cw_table, expand=False, border_style="#C8B6FF"))
            console.print(
                f"  [info][INFO][/info] Casing should ideally match '{source_sheet}' (source of truth)."
            )

        # Report mismatches
        if mismatches:
            has_failures = True
            status = "[error]FAIL[/error]"
            console.print(
                f"  [error][FAIL][/error] Missing from '{source_sheet}': {len(unique_mismatch_names)} unique ({len(mismatches)} rows)"
            )

            mm_table = Table(show_header=True, header_style="error", expand=False)
            mm_table.add_column("Row", style="muted")
            mm_table.add_column("Value (not in source)")

            for row, name in mismatches:
                mm_table.add_row(str(row), name)

            console.print(Panel(mm_table, expand=False, border_style="#FF8B94"))

        if not mismatches and not case_warnings:
            console.print(
                f"  [success][OK][/success]  {len(sheet_data)} value(s) ({len(sheet_unique)} unique) -- all match."
            )

        # Formatting issues for summary table
        issues_text = []
        if mismatches:
            issues_text.append(f"[error]{len(mismatches)} mismatches[/error]")
        if case_warnings:
            issues_text.append(f"[warning]{len(case_warnings)} case warns[/warning]")
        if not issues_text:
            issues_text.append("[muted]0 mismatches, 0 case warns[/muted]")

        sheet_summary_rows.append(
            [
                sheet_name,
                f"{len(sheet_data)} ({len(sheet_unique)} unique)",
                ", ".join(issues_text),
                status,
            ]
        )
        console.print()

    # Per-rule summary table
    summary_table = Table(show_header=True, header_style="info", expand=False, box=None)
    summary_table.add_column("Sheet")
    summary_table.add_column("Values")
    summary_table.add_column("Issues")
    summary_table.add_column("Status")

    for r in sheet_summary_rows:
        summary_table.add_row(*r)

    console.print(
        Panel(
            summary_table,
            title="[bold]Per-Rule Summary[/bold]",
            expand=False,
            border_style="#A4C8F0",
        )
    )
    console.print()

    return total_mismatches, total_case_warnings, has_failures


def check_completeness(cache: SheetCache) -> bool:
    """Check that every source value appears at least once in the target sheet."""
    console.print()
    console.rule("[border]PHASE 2B: COMPLETENESS CHECKS[/border]")
    console.print()

    all_ok = True
    summary_rows = []

    for rule in COMPLETENESS_RULES:
        source_sheet = rule["source_sheet"]
        target_sheet = rule["target_sheet"]
        column = rule["column"]

        console.print(
            f"  [info][*][/info] Checking every '{source_sheet}.{column}' "
            f"exists in '{target_sheet}' ..."
        )

        try:
            source_data = cache.get_column_values(source_sheet, column)
        except gspread.exceptions.WorksheetNotFound:
            console.print(
                f"  [error][FAIL][/error] Worksheet '{source_sheet}' not found -- cannot validate.\n"
            )
            summary_rows.append(
                [
                    source_sheet,
                    target_sheet,
                    "-",
                    "[error]SOURCE NOT FOUND[/error]",
                    "[error]FAIL[/error]",
                ]
            )
            all_ok = False
            continue

        try:
            target_data = cache.get_column_values(target_sheet, column)
        except gspread.exceptions.WorksheetNotFound:
            console.print(
                f"  [error][FAIL][/error] Worksheet '{target_sheet}' not found -- cannot validate.\n"
            )
            summary_rows.append(
                [
                    source_sheet,
                    target_sheet,
                    "-",
                    "[error]TARGET NOT FOUND[/error]",
                    "[error]FAIL[/error]",
                ]
            )
            all_ok = False
            continue

        target_values = {val.lower() for _, val in target_data}
        missing = [
            (row, val) for row, val in source_data if val.lower() not in target_values
        ]

        if missing:
            all_ok = False
            console.print(
                f"  [error][FAIL][/error] Missing from '{target_sheet}': "
                f"{len(missing)} account(s)"
            )

            missing_table = Table(show_header=True, header_style="error", expand=False)
            missing_table.add_column(f"{source_sheet} Row", style="muted")
            missing_table.add_column("Value missing from alias")

            for row, name in missing:
                missing_table.add_row(str(row), name)

            console.print(Panel(missing_table, expand=False, border_style="#FF8B94"))
            summary_rows.append(
                [
                    source_sheet,
                    target_sheet,
                    str(len(source_data)),
                    f"[error]{len(missing)} missing[/error]",
                    "[error]FAIL[/error]",
                ]
            )
        else:
            console.print(
                f"  [success][OK][/success]  {len(source_data)} account(s) -- all present in '{target_sheet}'."
            )
            summary_rows.append(
                [
                    source_sheet,
                    target_sheet,
                    str(len(source_data)),
                    "[muted]0 missing[/muted]",
                    "[success]PASS[/success]",
                ]
            )
        console.print()

    summary_table = Table(show_header=True, header_style="info", expand=False, box=None)
    summary_table.add_column("Source")
    summary_table.add_column("Target")
    summary_table.add_column("Source Values")
    summary_table.add_column("Issues")
    summary_table.add_column("Status")

    for r in summary_rows:
        summary_table.add_row(*r)

    console.print(
        Panel(
            summary_table,
            title="[bold]Completeness Summary[/bold]",
            expand=False,
            border_style="#A4C8F0",
        )
    )
    console.print()

    return all_ok


# -- Phase 3: Service Coverage -------------------------------------------------


def check_service_coverage(cache: SheetCache) -> bool:
    """
    For each row in the services sheet, verify that at least one
    service column is filled in (non-empty).
    """
    console.print()
    console.rule("[border]PHASE 3: SERVICE COVERAGE[/border]")
    console.print()

    all_ok = True

    for rule in SERVICE_COVERAGE_RULES:
        sheet_name = rule["sheet"]
        label_col = rule["label_column"]
        service_cols = rule["service_columns"]

        console.print(
            f"  [info][*][/info] Checking every row in '{sheet_name}' has at least one service ..."
        )

        try:
            headers, rows = cache.get_data(sheet_name)
        except gspread.exceptions.WorksheetNotFound:
            console.print(
                f"  [warning][WARN][/warning] Worksheet '{sheet_name}' not found -- skipping.\n"
            )
            all_ok = False
            continue

        # Map column names to indices
        col_indices = {}
        for col_name in service_cols + [label_col]:
            key = col_name.strip().lower()
            if key in headers:
                col_indices[col_name] = headers.index(key)

        label_idx = col_indices.get(label_col)
        service_idxs = [col_indices[c] for c in service_cols if c in col_indices]

        if not service_idxs:
            console.print(
                f"  [error][FAIL][/error] No service columns found in sheet.\n"
            )
            all_ok = False
            continue

        # Check each row
        empty_rows: list[tuple[int, str]] = []
        total_data_rows = 0

        for i, row in enumerate(rows, start=2):
            label = ""
            if label_idx is not None and label_idx < len(row):
                label = row[label_idx].strip()
            if not label:
                continue

            total_data_rows += 1

            has_service = any(
                idx < len(row) and row[idx].strip() for idx in service_idxs
            )
            if not has_service:
                empty_rows.append((i, label))

        with_service = total_data_rows - len(empty_rows)
        coverage_pct = (with_service / total_data_rows * 100) if total_data_rows else 0

        if empty_rows:
            all_ok = False
            console.print(
                f"  [error][FAIL][/error] {len(empty_rows)}/{total_data_rows} rows "
                f"have no services ({coverage_pct:.1f}% coverage)\n"
            )

            fail_table = Table(show_header=True, header_style="error", expand=False)
            fail_table.add_column("Row", style="muted")
            fail_table.add_column(label_col)

            for row_num, label in empty_rows:
                fail_table.add_row(str(row_num), label)

            console.print(Panel(fail_table, expand=False, border_style="#FF8B94"))
        else:
            console.print(
                f"  [success][OK][/success]  {total_data_rows} rows -- 100% coverage"
            )

        # Coverage summary
        console.print()
        cov_table = Table(show_header=False, expand=False, box=None)
        cov_table.add_column("Metric", style="bold")
        cov_table.add_column("Value")
        cov_table.add_row("Total rows", str(total_data_rows))
        cov_table.add_row("With service", f"[success]{with_service}[/success]")
        cov_table.add_row(
            "Without service",
            f"[error]{len(empty_rows)}[/error]" if empty_rows else "[muted]0[/muted]",
        )
        cov_table.add_row(
            "Coverage",
            f"[success]{coverage_pct:.1f}%[/success]"
            if coverage_pct == 100
            else f"[warning]{coverage_pct:.1f}%[/warning]",
        )

        console.print(
            Panel(
                cov_table,
                title="[bold]Service Coverage[/bold]",
                expand=False,
                border_style="#A4C8F0",
            )
        )
        console.print()

    return all_ok


# -- Main ---------------------------------------------------------------------
def main() -> None:
    force_mode = "--force" in sys.argv

    console.print("[info][*][/info] Opening spreadsheet ...")
    try:
        spreadsheet = gc.open_by_key(SPREADSHEET_ID)
    except gspread.exceptions.APIError as exc:
        console.print(
            f"[error][ERROR][/error] Could not open spreadsheet.\n"
            f"        Make sure the service account '{credentials.service_account_email}'\n"
            f"        has been added to the sheet.\n"
            f"        API error: {exc}"
        )
        sys.exit(1)

    console.print("[success][OK][/success]  Connected.\n")

    any_failure = False

    cache = SheetCache(spreadsheet)

    # -- Phase 0: Table Format Validation --------------------------------------
    tables_format_ok = check_all_tables_format(cache)
    if not tables_format_ok:
        any_failure = True
        if not force_mode:
            console.print(
                "\n[error][FAIL][/error] Phase 0 failed. Stopping early. (Use --force to continue anyway)"
            )
            sys.exit(1)

    # -- Phase 0B: Invisible Characters ----------------------------------------
    invisible_ok = check_invisible_characters(cache)
    if not invisible_ok:
        any_failure = True
        if not force_mode:
            console.print(
                "\n[error][FAIL][/error] Phase 0B failed. Stopping early. (Use --force to continue anyway)"
            )
            sys.exit(1)

    # -- Phase 1: Uniqueness Checks --------------------------------------------
    uniqueness_ok = check_uniqueness(cache)
    if not uniqueness_ok:
        any_failure = True
        if not force_mode:
            console.print(
                "\n[error][FAIL][/error] Phase 1 failed. Stopping early. (Use --force to continue anyway)"
            )
            sys.exit(1)

    # -- Phase 2: Referential Integrity ----------------------------------------
    console.print()
    console.rule("[border]PHASE 2: REFERENTIAL INTEGRITY[/border]")

    grand_mismatches = 0
    grand_case_warnings = 0

    phase2_failed = False
    for rule in VALIDATION_RULES:
        m, cw, failed = validate_column(
            cache,
            source_sheet=rule["source_sheet"],
            column=rule["column"],
            target_sheets=rule["target_sheets"],
        )
        grand_mismatches += m
        grand_case_warnings += cw
        if failed:
            any_failure = True
            phase2_failed = True

    if phase2_failed and not force_mode:
        console.print(
            "\n[error][FAIL][/error] Phase 2 failed. Stopping early. (Use --force to continue anyway)"
        )
        sys.exit(1)

    completeness_ok = check_completeness(cache)
    if not completeness_ok:
        any_failure = True
        if not force_mode:
            console.print(
                "\n[error][FAIL][/error] Phase 2B failed. Stopping early. (Use --force to continue anyway)"
            )
            sys.exit(1)

    # -- Phase 3: Service Coverage -----------------------------------------------
    service_coverage_ok = check_service_coverage(cache)
    if not service_coverage_ok:
        any_failure = True
        if not force_mode:
            console.print(
                "\n[error][FAIL][/error] Phase 3 failed. Stopping early. (Use --force to continue anyway)"
            )
            sys.exit(1)

    # -- Grand Summary ---------------------------------------------------------
    console.print()
    console.rule("[border]GRAND SUMMARY[/border]")

    grand_table = Table(show_header=False, expand=False, box=None)
    grand_table.add_column("Metric", style="bold")
    grand_table.add_column("Value")

    format_text = (
        "[success]PASS[/success]" if tables_format_ok else "[error]FAIL[/error]"
    )
    grand_table.add_row("Phase 0: Table Format", format_text)
    invisible_text = (
        "[success]PASS[/success]" if invisible_ok else "[error]FAIL[/error]"
    )
    grand_table.add_row("Phase 0B: Invisible characters", invisible_text)
    uniqueness_text = (
        "[success]PASS[/success]" if uniqueness_ok else "[error]FAIL[/error]"
    )
    grand_table.add_row("Phase 1: Uniqueness", uniqueness_text)
    grand_table.add_row(
        "Phase 2: Referential integrity", str(len(VALIDATION_RULES)) + " rules"
    )
    grand_table.add_row("  Mismatches", f"{grand_mismatches} row(s)")
    grand_table.add_row("  Case warnings", f"{grand_case_warnings} row(s)")
    completeness_text = (
        "[success]PASS[/success]" if completeness_ok else "[error]FAIL[/error]"
    )
    grand_table.add_row("Phase 2B: Completeness", completeness_text)
    service_text = (
        "[success]PASS[/success]" if service_coverage_ok else "[error]FAIL[/error]"
    )
    grand_table.add_row("Phase 3: Service coverage", service_text)

    result_text = "[error]FAIL[/error]" if any_failure else "[success]PASS[/success]"
    grand_table.add_row("Result", result_text)

    console.print(Panel(grand_table, expand=False, border_style="#C8B6FF"))

    if any_failure:
        console.print(
            "\n[error][FAIL][/error] Validation FAILED -- please fix the issues listed above."
        )
        sys.exit(1)
    else:
        console.print(
            "\n[success][PASS][/success] All checks passed. Validation SUCCESSFUL!"
        )


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        console.print()
        console.print("[warning]Stopping...[/warning]", end=" ")
        time.sleep(0.3)
        console.print("[muted]Stopped.[/muted]")
        sys.exit(130)
