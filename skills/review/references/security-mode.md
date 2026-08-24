# Security Review Mode

For a full security pass on branch changes, prefer the built-in `security-review` skill. This mode
is for a scoped security lens inside a general review.

## Review Order

1. Authentication and session/token handling
2. Authorization and ownership checks
3. Input validation and injection risk
4. Secrets and sensitive data exposure
5. File upload, deserialization, SSRF, and external call boundaries
6. Security-relevant logging and audit gaps

## Epistemics

- Prioritize real, exploitable vulnerabilities over exhaustive checklists.
- Tie every finding to code evidence; state attacker impact clearly.
- Evidence incomplete → mark as question/risk, NOT a confirmed vuln. Maps directly to
  ReportFindings: exploit path traced → CONFIRMED; suspicious pattern without traced path →
  PLAUSIBLE.
- Recommend the smallest credible fix.

## Quick executable checks

- Secrets in diff: `git diff <range> | grep -niE 'password|secret|api_?key|token' | grep -v test`
- New endpoints missing auth middleware: compare route registrations against the auth-check
  convention the repo already uses (grep the router/middleware wiring, not just the handler).
- Laravel mass assignment: new `$fillable`/`create($request->all())` on models with privileged
  columns.
