# ADR-147 Tasks

Implementation tasks for ADR-147: a landing no release can rest on does not run the mutation campaign.

**Source of truth:** task-file Depends-on, Produces, Consumes and Covers headers.

## Task Index

| ID | Title | Status | Covers | Acceptance |
|----|-------|--------|--------|------------|
| T1 | A landing of a version already tagged is recognised, and anything else is left to the pin check | done | none — no spec | `node --test tests/landing-released.test.mjs tests/landing-class.test.mjs tests/landing-class-workflow.test.mjs` |
| T2 | A release's tag is made at the sha its evidence cleared, or the release stops | done | none — no spec | `node --test tests/release-tag.test.mjs tests/release.test.mjs` |
| T3 | The skip and the next release are read from the forge | pending | none — no spec | human-observed |

## Contract Coupling

| Producer | Contract | Consumer(s) | Ordering note |
|----------|----------|-------------|---------------|
| T1 | `the released-version answer` | T3 | The script before its measurement |
| T2 | `the tag made at the cleared sha` | T3 | The publication before the release that proves it |

## Notes

- T1 depends on T2: Decision 2's safety claim rests on it. Both ride one landing, T2's commit first.
- T3 needs the forge: the landing of T1, then the next release. It is not hermetic and stays pending until both are read.
