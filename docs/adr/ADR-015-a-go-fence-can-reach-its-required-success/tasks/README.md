# ADR-015 Tasks

Implementation task for ADR-015: A Go fence can reach its required success. See the parent ADR for
the decision.

**Source of truth:** the task files' `Depends-on` / `Produces` / `Consumes` / `Covers` headers.
This README is a derived index — when it disagrees with a task file, the task file wins and the
README must be regenerated.

## Execution Order

| Order | Task | Depends-on |
|-------|------|------------|
| 1 | T1 | none |

## Task Index

| ID | Title | Status | Covers | Acceptance |
|----|-------|--------|--------|------------|
| T1 | lint the unreachable Go green path | done | — | `node --test … tests/gates.test.mjs` |

Status: `pending` | `partial` | `blocked` | `done`.

- `pending` — not started, or started and carrying no evidence yet.
- `partial` — some work has landed and some has not; landed claims still owe their matching
  acceptance and mutation evidence.
- `blocked` — waiting on an external event named in the task's `Blocked-on` header.
- `done` — finished, with tool-written acceptance and killed-mutation evidence matching the current
  fence.

## Contract Coupling

None — one task.

## Notes

- The regression is a copied, temporary git corpus because this repository has no live Go
  Acceptance fence. It reproduces the reporter's package mismatch and embed-only healthy package,
  then proves the same embed-only package without the exclusion, the corrected package scope, and
  ambiguous command/output shapes stay silent.
- Catalogue-integrity checks remain mandatory preflight and full-suite checks, but stay outside the
  mutation Acceptance fence so a stale source anchor cannot masquerade as a behavioral kill.
- ADR-015 was explicitly Accepted on 2026-08-31; tool-written evidence now determines completion.
