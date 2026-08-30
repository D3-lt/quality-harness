# Task ADR-014-T2: A task waiting on the outside world says what it waits for

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** M (multi-file)
**Owner:** unassigned
**Produces:** the `**Blocked-on:**` header and its refusal rule
**Consumes:** none
**Data dependency:** hermetic

## Goal

A task may declare `**Blocked-on:** <event>`, and `adr-lint` refuses it on a task whose Acceptance is
a runnable bash fence.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/bin/adr-lint` | edit | reads the header and applies the refusal; `check_task` is where task headers are read, so that is what selects it |
| `tests/gate-regressions.py` | edit | the refusal assertions |
| `tests/mutations.json` | edit | the catalogue entry |

## Ordered Steps

1. Write the failing tests first: a task with `Blocked-on` and a human-observed Acceptance is accepted; the same header on a task with a runnable bash fence is refused with a message naming why; a task without the header is unaffected. Confirm red.
2. Read the header and apply the rule.
3. Add the catalogue entry naming the test that drives `adr-lint`.

## Acceptance

```bash
set -o pipefail
python3 tests/gate-regressions.py plugin/bin plugin/skills/postmortem/SKILL.md . 2>&1 | tee /tmp/acc-014-t2.out && ! grep -qE "no tests to run|^FAIL" /tmp/acc-014-t2.out
```

## Tests

| Test name | File | Verifies | Covers |
|-----------|------|----------|--------|
| `Blocked-on requires a human-observed acceptance` | `tests/gate-regressions.py` | accepted with one, refused with a runnable fence | — |
| `a task without Blocked-on is unaffected` | `tests/gate-regressions.py` | the header is optional, so no existing task file becomes invalid | — |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the header is read |
| 2 — something selects it | the refusal firing on a runnable fence, which is the only observable consequence of reading it |
| 3 — the caller can discover it | T3 documents it in the task template |
| 4 — it is used | nothing measures this yet |

## Mutation Log

## Invariants

- The header is OPTIONAL. Every task file valid before this change stays valid.
- A task with a runnable fence cannot claim to be waiting on the outside world.

## Risks

- A fence runnable in CI and not locally is a real shape, and the refusal would be wrong there. It is why this is a refusal on the FENCE's form rather than on whether the fence passes.

## Stop Condition

Stop if distinguishing a runnable fence from a human-observed one requires interpreting the fence's
text. That is the heuristic refused in docs/BACKLOG.md §67, and the distinction here is structural —
a bash fence or the explicit human-observed sentence — so if it stops being structural, stop.

## Out of Scope

- Escalating a stale `Blocked-on`. (deferred: this record's T3)

## Verification Log
