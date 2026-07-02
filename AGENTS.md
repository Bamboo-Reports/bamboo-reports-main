# Agent Instructions

- Never run build commands (for example: `npm run build`, `next build`) unless the user explicitly requests it. This also applies during verification; use non-build checks such as typecheck, lint, or targeted tests instead.
- Never commit to `main`. Always create a new branch off `main` for changes and commit there, then push that branch.
- Git identity for commits: name `Abhishek F`, email `avisek-rnxt@users.noreply.github.com`. The GitHub account `avisek-rnxt` is authenticated via the local SSH key (`~/.ssh/id_ed25519`), and `origin` uses SSH, so pushes work without extra auth.
