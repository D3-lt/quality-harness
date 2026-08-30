# Task ADR-013-T3: Say in the template when this lane is legitimate

**Depends-on:** T1, T2
**Covers:** none — no spec
**Estimated scope:** S (single file)
**Owner:** unassigned
**Produces:** none — this is the terminal task
**Consumes:** `MLOG_HUMAN_RE` (T1), `adr-verify --human-mutant` (T2)
**Data dependency:** hermetic

## Goal

An author reading the task template learns when the human lane applies and when it does not, and
`adr-lint` still requires a killed mutant before a task may be `done`.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/templates/task-template.md` | edit | the `## Mutation Log` note gains the condition; the template is what an author actually reads |
| `plugin/skills/adr-execute/SKILL.md` | edit | the skill that tells an executor how to record evidence must name the lane, or nobody finds it |
| `tests/skill-contract.test.mjs` | edit | asserts the template and the skill agree about when the lane applies |

## Ordered Steps

1. Write the failing test first: the template's Mutation Log note and the adr-execute skill both state the condition, and neither describes the lane as a general alternative to `--mutant`. Confirm red.
2. Write the note: the lane is for a task whose Acceptance CANNOT run, the reason must be recorded in the task, and a row must carry the diff and the failing test.
3. Confirm `adr-lint` still refuses a `done` row whose Mutation Log is empty — this task must not weaken that.

## Acceptance

```bash
set -o pipefail
node --test tests/skill-contract.test.mjs 2>&1 | tee /tmp/acc-t3.out && ! grep -qE "no tests to run|^not ok" /tmp/acc-t3.out
```

## Tests

| Test name | File | Verifies | Covers |
|-----------|------|----------|--------|
| `the template and the execute skill agree about the human mutation lane` | `tests/skill-contract.test.mjs` | both name the condition, neither offers it as a general alternative | — |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the contract test |
| 2 — something selects it | the template is copied by `adr-write`, which is what puts the note in front of an author |
| 3 — the caller can discover it | the note is in the section the author is filling in, not in a separate document |
| 4 — it is used | nothing measures this yet — the follow-up in the record is to count uses in a quarter |

## Mutation Log

- 2026-08-30 · 7541736* · mutant survived · exit 0 · `plugin/templates/task-template.md` · the template must state the condition in the words the gate uses, or an author in the blocked case reads themselves out of the lane · acceptance-sha256:962a553e443081ec73729dfaf14c2d418b60743deac7df073677cdc732aef08a
  ```
  the fence passed with the mechanism broken
  ```
- 2026-08-30 · 7541736* · mutant killed · exit 1 · `plugin/templates/task-template.md` · the template must NAME the flag, or an author whose fence cannot run never finds the lane at all · acceptance-sha256:962a553e443081ec73729dfaf14c2d418b60743deac7df073677cdc732aef08a

## Invariants

- A `done` row still requires a killed mutant. This record adds a way to record one, not a way to skip one.

## Risks

- A note in a template is the weakest form of enforcement in this project. Accepted deliberately: the alternative is a gate that judges whether a fence *should* have been runnable, which is a judgement about the corpus's own text.

## Stop Condition

Stop if writing the note requires stating a rule the gates do not implement. A template that promises
more than the checks deliver is the "list kept beside the truth" this corpus exists to refuse.

## Out of Scope

- Changing what `partial` means. (deferred: docs/BACKLOG.md §60)

## Verification Log
- 2026-08-30 · 7541736 · exit 0 · `set -o pipefail …` · acceptance-sha256:962a553e443081ec73729dfaf14c2d418b60743deac7df073677cdc732aef08a
