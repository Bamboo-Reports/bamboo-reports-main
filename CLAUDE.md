# Instructions

- Do not run build commands.
- Never commit to `main`. Always create a new branch off `main` for changes and commit there, then push that branch.
- Do not use em dashes (—) in any copy, UI text, toast messages, comments, or commit messages. Use a period, comma, colon, or parentheses instead.
- Use `uv` for anything Python: run scripts with `uv run`, add or remove dependencies with `uv add` / `uv remove` (never `pip install` or hand-edited requirements files), and keep `uv.lock` in sync. The ETL is one uv project in `etl/` (run from the repo root with `uv run --directory etl python -m importer`, `-m sheets.validate` or `-m sheets.cleanup`).
