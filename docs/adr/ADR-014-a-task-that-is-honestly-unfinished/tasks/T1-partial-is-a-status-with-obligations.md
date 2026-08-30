# Task ADR-014-T1: Recognise `partial`, with the obligations its evidence creates

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** S (single file)
**Owner:** unassigned
**Produces:** `partial` in `KNOWN_TASK_STATUS`, and the rule that a partial task's obligations follow its evidence
**Consumes:** none
**Data dependency:** hermetic

## Goal

A task marked `partial` is no longer reported as an unrecognised status, and is checked exactly as
hard as a `done` task for everything its landed evidence claims.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/bin/adr-lint` | edit | `KNOWN_TASK_STATUS` gains the word; `evidenced_task_ids` is what SELECTS a partial task into the checks, and without that line the word is recognised and nothing follows from it |
| `tests/gate-regressions.py` | edit | the obligation assertions, both directions |
| `tests/mutations.json` | edit | one entry per behaviour |

## Ordered Steps

1. Write the failing tests first: a `partial` task with a passing acceptance entry must be asked for a Mutation Log and must have its Tests table checked; a `partial` task must NOT be asked for a `done` row's exit-0 evidence; and `partial` must produce no unrecognised-status advice. Confirm all three red.
2. Add `partial` to `KNOWN_TASK_STATUS`.
3. Add it to `evidenced_task_ids` on the same footing as `blocked` — evidenced when it carries a passing entry, which is the rule that already exists for a task blocked outside the repository.
4. Add the catalogue entries, each naming a test that drives `check_task`/`adr-lint` rather than the helper.

## Acceptance

```bash
set -o pipefail
python3 tests/gate-regressions.py plugin/bin plugin/skills/postmortem/SKILL.md . 2>&1 | tee /tmp/acc-014-t1.out && ! grep -qE "no tests to run|^FAIL" /tmp/acc-014-t1.out
```

## Tests

| Test name | File | Verifies | Covers |
|-----------|------|----------|--------|
| `a partial task with passing evidence owes what a done task owes` | `tests/gate-regressions.py` | the Mutation Log and Tests-table checks run for it | — |
| `a partial task is not asked for a done row's evidence` | `tests/gate-regressions.py` | the exit-0 requirement does not apply to a status not claiming completion | — |
| `partial is no longer an unrecognised status` | `tests/gate-regressions.py` | the §73 advice stays silent on it, and still fires on a word outside the vocabulary | — |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the vocabulary assertion |
| 2 — something selects it | `evidenced_task_ids` including a partial task, proved by the Mutation Log check firing on one |
| 3 — the caller can discover it | T3's template note is the discovery path; until then the word is legal and undocumented, which is why T3 exists |
| 4 — it is used | nothing measures this yet — the record's follow-up counts partial tasks after a quarter |

## Mutation Log

## Invariants

- `done` still requires a matching exit-0 entry. This task adds a status, it does not weaken one.
- A word outside the vocabulary is still reported, or §73 has been undone.

## Risks

- Adding to the vocabulary is a change to a set three tools read. Mitigated by asserting the unrecognised-status path still fires on a word that is genuinely unrecognised.

## Stop Condition

Stop if `partial` cannot be given the evidence-following treatment without also loosening what `done`
requires. Those must stay independent, and if they cannot be, this decision is wrong.

## Out of Scope

- The `Blocked-on` header. (deferred: this record's T2)
- Any other status word. (permanent: named in the record's Out of Scope, with the reason.)

## Verification Log
