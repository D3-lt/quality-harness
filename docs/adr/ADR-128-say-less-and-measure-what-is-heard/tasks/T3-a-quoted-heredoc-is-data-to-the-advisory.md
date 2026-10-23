# Task ADR-128-T3: A commit word in a quoted heredoc body draws no advisory

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** S (the advisory's reading)
**Owner:** unassigned
**Produces:** none
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1

## Goal

The publish advisory (P) reads a word inside a quoted heredoc body as data, as ADR-067's grammar already does for the
refusal, and says nothing for it; every code-again twin still draws it.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/publish-verdict.mjs` | edit | the advisory asks ADR-067's reading |
| `core/hooks/publish.go` | edit | the Go twin |
| `tests/publish-advisory-heredoc.test.mjs` | add | the data rows and their code-again twins |

## Ordered Steps

1. [S1] Write the test: `cat > f <<'EOF'` with `git commit` in the body draws no advisory; an unquoted heredoc, a body
   fed to `sh`, and `git commit` after the heredoc each still do (red today).
2. [S2] Implement in both cores from the grammar that already exists; no new classifier (CLAUDE.md §16).

## Acceptance

```bash
node --test --test-reporter=tap tests/publish-advisory-heredoc.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a quoted heredoc's commit word draws no advisory` | `tests/publish-advisory-heredoc.test.mjs` | the data row | — | S1, S2 |
| `an unquoted heredoc, a body run as code, or a later commit still draws it` | `tests/publish-advisory-heredoc.test.mjs` | the code-again twins | — | S2 |

## Mutation Log

## Invariants

- The refusal (ADR-061, ADR-066) is unchanged.

## Risks

- A body that is data to the advisory is code again when it is fed to a shell; the twins hold that.

## Stop Condition

ADR-067's grammar cannot answer for a shape the test needs: stop and ask.

## Out of Scope

- The refusal's own reading (permanent: boundary: ADR-067 owns it).

## Verification Log
