# Agent Instructions

- Never run build commands (for example: `npm run build`, `next build`) unless the user explicitly requests it. This also applies during verification; use non-build checks such as typecheck, lint, or targeted tests instead..
- Never commit to `main`. Always create a new branch off `main` for changes and commit there, then push that branch.
- Git identity for commits: name `Abhishek F`, email `avisek-rnxt@users.noreply.github.com`. The GitHub account `avisek-rnxt` is authenticated via the local SSH key (`~/.ssh/id_ed25519`), and `origin` uses SSH, so pushes work without extra auth.
- Use `uv` for anything Python: run scripts with `uv run`, add or remove dependencies with `uv add` / `uv remove` (never `pip install` or hand-edited requirements files), and keep `uv.lock` in sync. The ETL is one uv project in `etl/`: run it with `etl/import.sh` and `etl/validate.sh` (both have `--help`), or `uv run --directory etl python -m importer`, `-m sheets.validate` or `-m sheets.cleanup`.
