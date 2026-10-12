# ADR-098 Tasks

Implementation tasks for ADR-098: What the plugin says matches what it does. See the parent ADR for the decision.

**Source of truth:** the task files' `Depends-on` / `Produces` / `Consumes` / `Covers` headers.
This README is a derived index — when it disagrees with a task file, the task file wins and the
README must be regenerated.

## Execution Order

| Order | Task | Depends-on |
|-------|------|------------|
| 1 | T1 | none |
| 2 | T2 | T1 |
| 3 | T3 | none |

## Task Index

| ID | Title | Status | Covers | Acceptance |
|----|-------|--------|--------|------------|
| T1 | one Codex launcher, with stdin closed, a hard budget and the sol pin | pending | none — no spec | `node --test tests/codex-launcher.test.mjs …` (five named tests) and no `gpt-6-astra` in `plugin/` |
| T2 | one blocking definition, one severity vocabulary, the leaf contract once per audience | pending | none — no spec | `node --test tests/review-contract.test.mjs …` (six named tests) and four blocking-definition lines in `plugin/` |
| T3 | the ADR-ownership notice says nothing is blocked | pending | none — no spec | `node --test tests/advice-says-advice.test.mjs …` (two named tests) |

## Contract Coupling

| Producer | Contract | Consumer(s) | Ordering note |
|----------|----------|-------------|---------------|
| T1 | `reviewPrompt` in its post-T1 form | T2 | T1 before T2 |

## Notes

- T1's S2 needs a Codex CLI on the machine; T2's S2 needs a live Claude Code session running a shipped workflow. Every fence is hermetic.
- T3 is independent of T1 and T2.
