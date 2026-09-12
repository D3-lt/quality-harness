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
| 3 | T7, T8, T9, T11 | T6 (T7, T8); T3 (T9); T1 (T11) |
| 4 | T10 | T3, T8 |
| 5 | T12, T13 | T10, T11 (T12); T4 (T13) |

## Waves

- **Wave 1** — T1 and T2 in parallel; the rename touches no grammar.
- **Wave 2** — T3–T6, the Codex review's findings on wave 1, each on T1's module and on nothing
  else; they share files (`record.py`, `adr-verify`, `adr-lint`, the test files) but no function.
- **Wave 3 / 4** — T7–T11, the second Codex review's findings on wave 2. T7 and T8 are on T6's writer;
  T9 on T3's opener; T11 on T1's walk; T10 folds T8's marker and T9's naming into one grammar, so it
  comes last.
- **Wave 5** — T12–T13, the third Codex review's findings on the grammar and the Exit header.


## Task Index

| ID | Title | Status | Covers | Acceptance |
|----|-------|--------|--------|------------|
| T1 | The record grammar is one module | done | F-1, F-2, UC1-S1, UC1-S2, UC2-S1, UC2-S2, UC2-S3 | `node --test --test-name-pattern 'a heading inside the Acceptance fence is not a heading' tests/adr-next.test.mjs && node --test --test-name-pattern 'the record grammar is one module\|record.py: a fenced ## is not a heading\|a gate copied without plugin/lib says so' tests/gates.test.mjs` |
| T2 | The two git listings are named for their rule | done | F-3, UC3-S1, UC3-S2 | `node --test --test-name-pattern "adr-lint's tracked_or_unignored_paths includes an untracked file" tests/gates.test.mjs` |
| T3 | The Acceptance fence opener is one grammar | done | F-4, UC4-S1, UC4-S2, UC4-S3, UC4-S4 | `node --test --test-name-pattern 'digest-checked by adr-lint, not skipped\|an Acceptance fence may be spelled sh or shell' tests/evidence-chain.test.mjs && node --test --test-name-pattern 'sh-labelled Acceptance fence adr-verify recorded' tests/adr-next.test.mjs && node --test --test-name-pattern 'record.py: the opener is bash\|the record grammar is one module' tests/gates.test.mjs` |
| T4 | A gate that cannot load a shared module exits its own could-not-run code | done | F-5, UC5-S1, UC5-S2 | `node --test --test-name-pattern 'a gate copied without plugin/lib says so\|reached through a symlink loads the lib\|every exit code a gate can literally produce\|the record grammar is one module' tests/gates.test.mjs` |
| T5 | A repeated `## ` heading is a finding, never resolved in silence | done | F-6, UC6-S1, UC6-S2 | `node --test --test-name-pattern 'a repeated ## Acceptance is refused' tests/evidence-chain.test.mjs && node --test --test-name-pattern 'record.py: the opener is bash' tests/gates.test.mjs` |
| T6 | adr-verify's remaining section readers are the shared grammar | done | F-7, UC7-S1, UC7-S2, UC7-S3 | `node --test --test-name-pattern 'appended after a fenced ## line\|sees a step declared after a fenced' tests/evidence-chain.test.mjs && node --test --test-name-pattern 'fenced ## line in the Verification Log is still a claim' tests/sweep.test.mjs && node --test --test-name-pattern 'record.py: the opener is bash\|the record grammar is one module' tests/gates.test.mjs` |
| T7 | An entry under a heading that ends the file gets its own line | done | F-8, UC8-S1, UC8-S2 | `node --test --test-name-pattern 'ends the file without a line break' tests/evidence-chain.test.mjs` |
| T8 | A quoted fence line cannot toggle the grammar, and an open fence is named | done | F-9, UC9-S1, UC9-S2, UC9-S3 | `node --test --test-name-pattern 'cannot toggle the grammar' tests/evidence-chain.test.mjs && node --test --test-name-pattern 'an unclosed fence is named by line' tests/gates.test.mjs && node --test --test-name-pattern 'code fence never closes' tests/adr-next.test.mjs` |
| T9 | adr-lint names the whole unrunnable opener line | done | F-10, UC10-S1, UC10-S2 | `node --test --test-name-pattern 'digest-checked by adr-lint, not skipped' tests/evidence-chain.test.mjs` |
| T10 | One fence grammar — the walk and the runnable opener are one rule | done | F-11, UC11-S1, UC11-S2 | `node --test --test-name-pattern 'record.py: the opener is bash\|the record grammar is one module' tests/gates.test.mjs && node --test --test-name-pattern 'code fence never closes\|sh-labelled Acceptance fence adr-verify recorded' tests/adr-next.test.mjs && node --test --test-name-pattern 'digest-checked by adr-lint, not skipped' tests/evidence-chain.test.mjs` |
| T11 | Only CR, LF and CRLF break a line | done | F-12, UC12-S1, UC12-S2 | `node --test --test-name-pattern 'only CR, LF and CRLF break a line' tests/gates.test.mjs` |
| T12 | A closer rest is only ASCII space and tab | done | F-13, UC13-S1, UC13-S2 | `node --test --test-name-pattern 'a closer rest is only ASCII space and tab' tests/gates.test.mjs` |
| T13 | adr-lint's Exit header names the exits it produces | done | F-14, UC14-S1, UC14-S2 | `node --test --test-name-pattern "adr-lint's Exit block names the exits it actually produces" tests/gates.test.mjs` |


Status: `pending` | `partial` | `blocked` | `done`.

## Contract Coupling

None.

## Notes

- T1 and T2 are independent; the rename touches no grammar.
- T3–T6 (2026-09-11) are the Codex review's findings on T1/T2, each depending on T1's module and on
  nothing else; they may run in any order.
- T7–T11 (2026-09-11) are the second Codex review's findings on T3–T6; the three caller findings of the
  same review are ADR-046.
- T12–T13 (2026-09-12) are the third Codex review's findings on the closer rest and the Exit header.
