# ADR-004 Tasks

Implementation task for ADR-004: Stop installing home copies of an artifact nothing reads. See the
parent ADR for the decision.

**Source of truth:** the task files' `Depends-on` / `Produces` / `Consumes` / `Covers` headers.
This README is a derived index — when it disagrees with a task file, the task file wins.

## Execution Order

| Order | Task | Depends-on |
|-------|------|------------|
| 1 | T1 | none |

## Task Index

| ID | Title | Status | Covers | Acceptance |
|----|-------|--------|--------|------------|
| T1 | no template is linked, and a deletion stays deleted | pending | — | `node --test tests/standalone-link.test.mjs tests/lifecycle.test.mjs …` |

Status: `pending` | `running` | `blocked` | `done` | `failed`.

## Contract Coupling

None — one task.

## Notes

- Like ADR-001 and ADR-002 and unlike ADR-003, the implementation preceded the record: the owner
  asked for the change directly and it landed in `64352ab`. The parent ADR opens by saying so.
- The mutation ADR-001 recorded as its T1 evidence — `link: no skill is ever linked` — was carried by
  the templates loop this task removes, so it would have gone STALE (matching nothing) rather than
  RED. It was rewritten to ADD a skills loop instead of retargeting an existing one, which asserts
  the same guarantee against code that still exists. ADR-001's own Mutation Log is untouched; it
  records what was run then.
