# ADR-045 Tasks

Implementation tasks for ADR-045: One record grammar, loaded, not copied. See the parent ADR for the decision.

**Source of truth:** the task files' `Depends-on` / `Produces` / `Consumes` / `Covers` headers.
This README is a derived index — when it disagrees with a task file, the task file wins and the
README must be regenerated.

## Execution Order

| Wave | Task | Depends-on |
|------|------|------------|
| 1 | T1, T2 | none |
| 2 | T3, T4, T5, T6 | T1 |

## Waves

- **Wave 1** — T1 and T2 in parallel; the rename touches no grammar.
- **Wave 2** — T3–T6, the Codex review's findings on wave 1, each on T1's module and on nothing
  else; they share files (`record.py`, `adr-verify`, `adr-lint`, the test files) but no function.


## Task Index

| ID | Title | Status | Covers | Acceptance |
|----|-------|--------|--------|------------|
| T1 | The record grammar is one module | done | F-1, F-2, UC1-S1, UC1-S2, UC2-S1, UC2-S2, UC2-S3 | `node --test --test-name-pattern 'a heading inside the Acceptance fence is not a heading' tests/adr-next.test.mjs && node --test --test-name-pattern 'the record grammar is one module\|record.py: a fenced ## is not a heading\|a gate copied without plugin/lib says so' tests/gates.test.mjs` |
| T2 | The two git listings are named for their rule | done | F-3, UC3-S1, UC3-S2 | `node --test --test-name-pattern "adr-lint's tracked_or_unignored_paths includes an untracked file" tests/gates.test.mjs` |
| T3 | The Acceptance fence opener is one grammar | done | F-4, UC4-S1, UC4-S2, UC4-S3, UC4-S4 | `node --test --test-name-pattern 'digest-checked by adr-lint, not skipped\|an Acceptance fence may be spelled sh or shell' tests/evidence-chain.test.mjs && node --test --test-name-pattern 'sh-labelled Acceptance fence adr-verify recorded' tests/adr-next.test.mjs && node --test --test-name-pattern 'record.py: the opener is bash\|the record grammar is one module' tests/gates.test.mjs` |
| T4 | A gate that cannot load a shared module exits its own could-not-run code | done | F-5, UC5-S1, UC5-S2 | `node --test --test-name-pattern 'a gate copied without plugin/lib says so\|reached through a symlink loads the lib\|every exit code a gate can literally produce\|the record grammar is one module' tests/gates.test.mjs` |
| T5 | A repeated `## ` heading is a finding, never resolved in silence | done | F-6, UC6-S1, UC6-S2 | `node --test --test-name-pattern 'a repeated ## Acceptance is refused' tests/evidence-chain.test.mjs && node --test --test-name-pattern 'record.py: the opener is bash' tests/gates.test.mjs` |
| T6 | adr-verify's remaining section readers are the shared grammar | done | F-7, UC7-S1, UC7-S2, UC7-S3 | `node --test --test-name-pattern 'appended after a fenced ## line\|sees a step declared after a fenced' tests/evidence-chain.test.mjs && node --test --test-name-pattern 'fenced ## line in the Verification Log is still a claim' tests/sweep.test.mjs && node --test --test-name-pattern 'record.py: the opener is bash\|the record grammar is one module' tests/gates.test.mjs` |


Status: `pending` | `partial` | `blocked` | `done`.

## Contract Coupling

None.

## Notes

- T1 and T2 are independent; the rename touches no grammar.
- T3–T6 (2026-09-11) are the Codex review's findings on T1/T2, each depending on T1's module and on
  nothing else; they may run in any order.
