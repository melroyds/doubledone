# Security Policy

## Reporting a vulnerability

Please **do not** open a public issue for security problems. Email
`<your-security-contact>` with details and a proof-of-concept if you can. You'll get an
acknowledgement within 72 hours.

## What this framework enforces

- A pre-commit **secret scan + gitleaks** block hardcoded credentials before they enter
  history (`.githooks/pre-commit`).
- Real secrets live in a secret manager or a gitignored `.env`, never in the repo.
- CI re-runs the secret scan on every push as a backstop (`.github/workflows/ci.yml`).

## If a secret is ever committed

1. **Revoke/rotate it immediately**, assume it is compromised the moment it's pushed.
2. **Purge it from history** (`git filter-repo` or BFG) and force-push.
3. **Add a detection rule** (regex or gitleaks config) so it can't recur.
