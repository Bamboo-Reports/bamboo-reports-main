"""Step 6: link columns, one clean URL per line."""

import re

from gspread.utils import rowcol_to_a1

from sheets.rules import URL_LINE_PATTERN

from .workbook import FIRST_DATA_ROW, Workbook

LEADING_BULLET = re.compile(r"^([-•·*]+\s*)+")


# -- Step 6: link columns -----------------------------------------------------
# Every column that holds one or more URLs. Columns named *_source_type,
# account_source and center_employees_linkedin hold text or numbers and are
# deliberately absent.
LINK_COLUMNS = {
    "accounts": [
        "account_hq_website",
        "account_hq_linkedin_link",
        "account_key_offerings_source_link",
        "account_hq_revenue_source_link",
        "account_hq_employee_source_link",
    ],
    "centers": [
        "center_inc_year_updated_link",
        "center_account_website",
        "center_source_link",
        "center_website",
        "center_linkedin",
        "center_employees_article_source_link",
        "center_employees_range_linkedin_source_link",
    ],
    "services": [
        "primary_service_link",
        "focus_region_link",
        "service_it_link",
        "service_ai_link",
        "service_erd_link",
        "service_fna_link",
        "service_hr_link",
        "service_procurement_link",
        "service_sales_marketing_link",
        "service_customer_support_link",
        "service_others_link",
        "software_source_link",
    ],
    "prospects": [
        "prospect_linkedin_url",
        "prospect_other_source_url",
    ],
}
JUNK_TOKEN = re.compile(r"^[|.,;:\-`'\"]+$")


def tidy_url(token: str) -> str:
    """Strip junk that wraps a URL: quotes, a leading '.', trailing comma."""
    token = token.strip().strip("\"'")
    token = re.sub(r"^\.+(?=[A-Za-z])", "", token)
    token = re.sub(r"[,;]+$", "", token)
    # Again, for a quote that sat inside a trailing comma: "'https://x.com',"
    return token.strip("\"'")


# Query parameters that only record where a link was clicked. Removing them
# makes the same page compare equal however it was copied. Anything else in
# the query (Sales Navigator's ?query=, job board ids) is kept.
TRACKING_PARAM = re.compile(
    r"^(utm_\w+|trk|trkInfo|trackingId|lipi|originalSubdomain|original_referer|fbclid|gclid)$",
    re.IGNORECASE,
)
URL_PARTS = re.compile(r"^([^?#]*)(?:\?([^#]*))?(?:#(.*))?$")
LINKEDIN_HOST = re.compile(r"^(https?://)?([a-z]{2,3}\.|www\.)?linkedin\.com(?=/|$)", re.IGNORECASE)


def tidy_url_parts(url: str) -> str:
    """Drop tracking parameters and text-highlight fragments (#:~:text=...),
    and give LinkedIn links one scheme and host."""
    base, query, fragment = URL_PARTS.match(url).groups()
    if query is not None:
        kept = [p for p in query.split("&") if p and not TRACKING_PARAM.match(p.split("=", 1)[0])]
        query = "&".join(kept) or None
    # '#:~:text=' is a browser highlight, and a bare '#' or '#:' is what is
    # left when one was cut off. Real anchors (#careers) are kept.
    if fragment is not None and (fragment in ("", ":") or fragment.startswith(":~:")):
        fragment = None

    def linkedin(m: re.Match) -> str:
        scheme = "https://" if m.group(1) else ""
        host = "www.linkedin.com" if m.group(2) else "linkedin.com"
        return scheme + host

    base = LINKEDIN_HOST.sub(linkedin, base)
    return base + (f"?{query}" if query else "") + (f"#{fragment}" if fragment else "")


def normalise_links(value: str) -> str:
    items: list[str] = []
    for line in value.split("\n"):
        line = LEADING_BULLET.sub("", line.strip())
        if not line:
            continue
        tokens = [tidy_url(t) for t in line.split()]
        # Drop separators and stray punctuation between URLs: '|', '.', '-', '`'.
        tokens = [t for t in tokens if t and not JUNK_TOKEN.match(t)]
        # Split only when every part looks like a URL. A line with plain text
        # in it ('32AANFB3386M1Z3 Gst No.') is left whole for a manual look.
        pieces = tokens if tokens and all(URL_LINE_PATTERN.match(t) for t in tokens) else [tidy_url(line)]
        for p in pieces:
            if URL_LINE_PATTERN.match(p):
                p = tidy_url_parts(p)
            if p and p not in items:
                items.append(p)
    return "\n".join(items)


# Lines that are still not a URL after cleaning, for the end-of-run report.
LINK_LEFTOVERS: list[tuple[str, str, str, str]] = []


def step_links(wb: Workbook) -> None:
    for sheet, columns in LINK_COLUMNS.items():
        if sheet not in wb.editable:
            continue
        for column in columns:
            for r, c, value in wb.column_cells(sheet, column):
                if value.strip() == "#N/A":
                    continue
                cleaned = normalise_links(value)
                wb.set("links", sheet, r, c, cleaned)
                for line in cleaned.split("\n"):
                    if not URL_LINE_PATTERN.match(line):
                        a1 = rowcol_to_a1(r + FIRST_DATA_ROW, c + 1)
                        LINK_LEFTOVERS.append((sheet, a1, column, line))
