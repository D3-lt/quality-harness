# Task ADR-014-T3: Report waiting as waiting, and ask whether the wait is still real

**Depends-on:** T1, T2
**Covers:** none — no spec
**Estimated scope:** M (multi-file)
**Owner:** unassigned
**Produces:** none — this is the terminal task
**Consumes:** `partial` in the vocabulary (T1), the `Blocked-on` header (T2)
**Data dependency:** hermetic

## Goal

`adr-debt` counts tasks waiting on an external event separately from debt, and an old one is reported
as *"still waiting — has the event perhaps already happened?"* rather than as rot.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/bin/adr-debt` | edit | the bucket and the escalation wording |
| `plugin/templates/task-template.md` | edit | documents `Blocked-on` where an author is filling the headers in |
| `plugin/templates/tasks-readme-template.md` | edit | documents `partial` in the status legend |
| `tests/gate-rules.test.mjs` | edit | drives adr-debt end to end |
| `tests/mutations.json` | edit | one entry per behaviour |

## Ordered Steps

1. Write the failing test first: a corpus with one `Blocked-on` task reports it in a waiting bucket and NOT in the deferred count; an old one carries the has-it-already-happened wording. Confirm red.
2. Add the bucket and the wording.
3. Update both templates.
4. Add the catalogue entries.

## Acceptance

```bash
set -o pipefail
node --test tests/gate-rules.test.mjs 2>&1 | tee /tmp/acc-014-t3.out && ! grep -qE "no tests to run|^not ok" /tmp/acc-014-t3.out
```

## Tests

| Test name | File | Verifies | Covers |
|-----------|------|----------|--------|
| `a task waiting on an external event is not counted as debt` | `tests/gate-rules.test.mjs` | the bucket separates it, and the deferred count excludes it | — |
| `an old wait asks whether the event has already happened` | `tests/gate-rules.test.mjs` | the escalation wording, which is the one instance's actual failure mode | — |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the bucket appears in the summary |
| 2 — something selects it | `adr-debt`'s sorter routing a `Blocked-on` task there, proved by the deferred count excluding it |
| 3 — the caller can discover it | both templates carry the header and the word where an author writes them |
| 4 — it is used | nothing measures this yet — the record's follow-up counts partial tasks after a quarter |

## Mutation Log

## Invariants

- The deferred count keeps meaning what it meant: work punted with a pointer, not work waiting on the world.
- A template never promises a rule the gates do not implement.

## Risks

- A new summary line changes output every consumer reads. The one in-repository consumer is `tests/gate-rules.test.mjs`, named above; an external consumer parsing that line will need updating and the release note must say so.

## Stop Condition

Stop if the waiting bucket cannot be added without changing what the existing deferred count means.
A number that silently changes definition is worse than a missing one.

## Out of Scope

- Escalating to a person. (permanent: no owner model and no scheduler here.)

## Verification Log
