# Agent Instructions

These rules apply to every coding agent working in this repo. `CLAUDE.md` imports this file, so edit the rules here only.

- Never run build commands (for example: `npm run build`, `next build`) unless the user explicitly requests it. This also applies during verification; use non-build checks such as typecheck, lint, or targeted tests instead.
- Never commit to `main`. Always create a new branch off `main` for changes and commit there, then push that branch.
- Git identity for commits: name `Abhishek F`, email `avisek-rnxt@users.noreply.github.com`. The GitHub account `avisek-rnxt` is authenticated via the local SSH key (`~/.ssh/id_ed25519`), and `origin` uses SSH, so pushes work without extra auth.
- Do not use em dashes (—) in any copy, UI text, toast messages, comments, docs, or commit messages. Use a period, comma, colon, or parentheses instead.
- Use `uv` for anything Python: run scripts with `uv run`, add or remove dependencies with `uv add` / `uv remove` (never `pip install` or hand-edited requirements files), and keep `uv.lock` in sync. The ETL is one uv project in `etl/`: run it with `etl/cleanup.sh`, `etl/validate.sh` and `etl/import.sh` (all have `--help`), or `uv run --directory etl python -m importer`, `-m sheets.validate` or `-m sheets.cleanup`.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
