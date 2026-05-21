# Agent Instructions

- Never run build commands (for example: `npm run build`, `next build`) unless the user explicitly requests it. This also applies during verification; use non-build checks such as typecheck, lint, or targeted tests instead.
