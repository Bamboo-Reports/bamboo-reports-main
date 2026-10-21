"""
sheets.cleanup
--------------
One pass that cleans the source spreadsheet before validate and the ETL
run. Every sheet is read once, every step works on that in-memory copy in a
fixed order, and the final result is written back once per sheet. A cell
touched by several steps is written once, with its final value.

Steps, in the order they run (the order matters, see the notes):

  1. columns      Columns with data but no header are deleted. The import
                  drops them anyway, so they are leftovers (prospects
                  column H held 25,537 VLOOKUPs into a deleted sheet). A
                  column a formula still reads from is kept and listed.
                  Deleted last, after every other write.
  2. chips        Smart chips become plain text and dropdowns are removed,
                  so every cell is plain text. A people chip holding an
                  email looks like text but VLOOKUP and MATCH skip it.
                  Found from cell metadata (sheets/cell_meta.py, validate 0C).
  3. artifacts    Spreadsheet error values typed as text (#N/A, #REF!) are
                  cleared, and HTML entities from copied page source
                  ('64 &amp; 65', '&nbsp;') are decoded.
  4. invisible    Strip zero-width characters, BOMs, soft hyphens and
                  bidirectional controls from every cell. (validate 0B)
  5. whitespace   Trim cells and lines, collapse double spaces, turn tabs,
                  non-breaking and other exotic spaces into plain spaces,
                  turn \\r into real line breaks. Line breaks are kept.
  6. lists        Free-text list columns (services service columns,
                  accounts key offerings): one item per line, no bullets,
                  no duplicates. In services, all-lowercase words are
                  capitalised and focus_region lines like 'India Global'
                  are split in two.
  7. links        Link columns: one URL per line, bullets, wrapping quotes
                  and separators removed, tracking parameters (utm_*, trk,
                  originalSubdomain) and #:~:text= highlights dropped,
                  LinkedIn hosts made consistent. Lines that are still not
                  URLs are listed for a manual look and never changed.
  8. formats      Values that validate Phase 0 would reject but that have
                  one obvious correct form:
                    - dates     '06-May-25', '6 May 2025', '2025-05-06'
                                become '6-May-2025'
                    - months    'jan', 'Sept' become 'January', 'September'
                    - years     '2015.0', '2,015' become '2015'
                    - choices   'active center', 'gcc / gic', '2011-2015'
                                become the exact allowed value
                    - ISO code  'in', 'IND', 'India' become 'IN'
                    - emails    'mailto:' and <> removed, domain lowercased,
                                Cyrillic/Greek lookalike letters made Latin
                    - phones    '+91 98765 43210' becomes '9876543210'
                    - names     prospect names in ALL CAPS or all lowercase
                                get each word capitalised
  9. references   Key columns in child sheets that match the parent sheet
                  except for casing, curly quotes or dash style are
                  rewritten to the parent's exact spelling (this includes
                  subscribers emails against prospects). A cn_unique_key
                  whose prefix no longer matches its account name is
                  rebuilt and renamed in every sheet that uses it.
                  (validate Phase 2 case warnings)

Why this order: chips go first so the text they leave behind goes through
every later step like any other value. Entities decode into non-breaking spaces and invisible
characters, so they go first. Invisible characters and stray spaces hide
inside values, so they go next and every later step sees clean text.
Lists and links split and dedupe lines, which only works once the
whitespace is tidy. Formats compare against fixed allowed values, so they
run on tidy text too. References run last because they compare names
across sheets, and two names only compare equal once both sides have been
through 2 to 7.

Formula cells are never written: many columns are formulas
(tech.account_global_legal_name, the range columns in accounts and
centers), and writing a value would replace the formula. A fix a step
wanted on one is listed at the end instead.

The column rules (ALL_RULES, VALIDATION_RULES, INVISIBLE_CHARS) come from
sheets/rules.py, the same module validate uses, so both always agree.

Dry run by default: prints what would change without touching the
spreadsheet. Pass --apply to write (after a y/N confirmation).

Run from etl/ (or add --directory etl after uv run):
    uv run python -m sheets.cleanup                            # every step, preview
    uv run python -m sheets.cleanup --apply                    # every step, write
    uv run python -m sheets.cleanup --steps whitespace,links   # only these steps
    uv run python -m sheets.cleanup --skip references          # every step but these
    uv run python -m sheets.cleanup --sheets centers,services  # only change these sheets
    uv run python -m sheets.cleanup --report changes.csv       # full change list as CSV
    uv run python -m sheets.cleanup --apply --yes              # write without the y/N question
    uv run python -m sheets.cleanup --limit 30                 # more example rows per step

With --apply the dry-run report is shown first, then you are asked to
confirm before anything is written.

Then run sheets.validate to see what is left for a person to fix.

Uses etl/.env (SPREADSHEET_ID, GOOGLE_SA_FILE), like every ETL tool.
"""
