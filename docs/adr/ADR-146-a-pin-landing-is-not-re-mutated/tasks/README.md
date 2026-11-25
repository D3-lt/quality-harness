# ADR-146 Tasks

Implementation tasks for ADR-146: a landing that only re-pins the catalogue does not run the mutation campaign again.

**Source of truth:** task-file Depends-on, Produces, Consumes and Covers headers.

## Task Index

| ID | Title | Status | Covers | Acceptance |
|----|-------|--------|--------|------------|
| T1 | A pin landing is recognised from git, and anything else runs the campaign | done | none — no spec | `node --test tests/landing-class.test.mjs` |
| T2 | A pin landing skips the campaign, and a release still refuses such a run | pending | none — no spec | `node --test tests/landing-class-workflow.test.mjs` |
| T3 | The saving is read from a live pin landing | pending | none — no spec | human-observed |

## Contract Coupling

| Producer | Contract | Consumer(s) | Ordering note |
|----------|----------|-------------|---------------|
| T1 | `scripts/landing-class.mjs`, `the skip output line` | T2 | The script before the job that runs it |
| T2 | `the seed job's skip output`, `the skipped campaign` | T3 | The workflow before its measurement |

## Notes

- T3 needs the forge and the pin landing of the next release; it is not hermetic and stays pending until then.
- Accepted by the owner 2026-11-25, before the cold review; the review narrowed the rule to a verified pin (ADR-146, Alternatives).
