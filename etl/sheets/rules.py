"""
Rules shared by validate and cleanup: allowed formats and values per column
(ALL_RULES), uniqueness, reference and completeness rules, service coverage,
and the invisible characters and look-alike letters both tools look for.
Constants and small pure helpers only, so either tool can import it without
side effects.
"""

import re
import unicodedata

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

# Cyrillic and Greek letters that look exactly like a Latin one, mapped to
# that Latin letter. Pasted into a Latin word they look right but sort, search
# and join as a different character: "Ѕuchismita" (Cyrillic Ѕ) sorted before
# every A and missed a search for "Suchismita" (#284).
LOOKALIKE_LETTERS = {
    # Cyrillic capitals: А В Е К М Н О Р С Т Х Ѕ І Ј
    "\u0410": "A", "\u0412": "B", "\u0415": "E", "\u041a": "K", "\u041c": "M",
    "\u041d": "H", "\u041e": "O", "\u0420": "P", "\u0421": "C", "\u0422": "T",
    "\u0425": "X", "\u0405": "S", "\u0406": "I", "\u0408": "J",
    # Cyrillic small: а е о р с у х ѕ і ј
    "\u0430": "a", "\u0435": "e", "\u043e": "o", "\u0440": "p", "\u0441": "c",
    "\u0443": "y", "\u0445": "x", "\u0455": "s", "\u0456": "i", "\u0458": "j",
    # Greek capitals: Α Β Ε Ζ Η Ι Κ Μ Ν Ο Ρ Τ Υ Χ
    "\u0391": "A", "\u0392": "B", "\u0395": "E", "\u0396": "Z", "\u0397": "H",
    "\u0399": "I", "\u039a": "K", "\u039c": "M", "\u039d": "N", "\u039f": "O",
    "\u03a1": "P", "\u03a4": "T", "\u03a5": "Y", "\u03a7": "X",
    # Greek small omicron: ο
    "\u03bf": "o",
}
_LOOKALIKE_TABLE = str.maketrans(LOOKALIKE_LETTERS)
# A word is a run of letters in any alphabet. Only words that also hold a
# Latin letter count: a word written wholly in Cyrillic or Greek is real data.
_WORD_RE = re.compile(r"[^\W\d_]+")
_LATIN_LETTER_RE = re.compile(r"[A-Za-z]")


def find_lookalikes(value: str) -> list[str]:
    """Look-alike letters inside words that also contain Latin letters."""
    hits: list[str] = []
    for word in _WORD_RE.findall(value):
        if _LATIN_LETTER_RE.search(word):
            hits.extend(ch for ch in word if ch in LOOKALIKE_LETTERS)
    return hits


def _in_mixed_words(value: str, fix_word) -> str:
    return _WORD_RE.sub(lambda m: fix_word(m.group(0)) if _LATIN_LETTER_RE.search(m.group(0)) else m.group(0), value)


def replace_lookalikes(value: str) -> str:
    """Swap look-alike letters for their Latin twin, only in mixed words."""
    return _in_mixed_words(value, lambda word: word.translate(_LOOKALIKE_TABLE))


def mark_lookalikes(value: str) -> str:
    """'<Ѕ>uchismita': wraps each flagged letter, for report previews."""
    return _in_mixed_words(value, lambda word: "".join(f"<{ch}>" if ch in LOOKALIKE_LETTERS else ch for ch in word))


def describe_lookalike(char: str) -> str:
    """'Cyrillic Capital Letter Dze (U+0405) for 'S'', for reports."""
    return f"{unicodedata.name(char).title()} (U+{ord(char):04X}) for '{LOOKALIKE_LETTERS[char]}'"

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
