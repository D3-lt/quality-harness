# ADR-138 Tasks

Implementation tasks for ADR-138: CI runs the outside run, and a person reads only what changed.

**Source of truth:** task-file Depends-on, Produces, Consumes and Covers headers.

## Task Index

| ID | Title | Status | Covers | Acceptance |
|----|-------|--------|--------|------------|
| T1 | Two probe reports compare equal only when every recorded output is equal | done | none — no spec | `node --test tests/probe-same-output.test.mjs` |
| T2 | A Windows CI job probes the tag and the candidate over pinned corpora | pending | none — no spec | `node --test tests/outside-run.test.mjs` |
| T3 | release-evidence accepts the landing run's outside run when no output changed | done | none — no spec | `node --test tests/release-evidence-ci-outside.test.mjs` |

## Contract Coupling

| Producer | Contract | Consumer(s) | Ordering note |
|----------|----------|-------------|---------------|
| T1 | `sameOutput(before, after)` | T2, T3 | The comparison before anything reads it |
| T2 | `outside-run.json` | T3 | The artifact before the evidence rule reads it |
