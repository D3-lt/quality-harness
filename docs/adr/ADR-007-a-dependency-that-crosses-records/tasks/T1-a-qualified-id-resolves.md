# Task ADR-007-T1: a qualified id parses, resolves, and never binds locally

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** M (multi-file)
**Owner:** zy
**Produces:** qualified-id parser and corpus resolution in `bin/adr-lint` (T2)
**Consumes:** none
**Data dependency:** hermetic

## Goal

Let `Depends-on` name a task in another record, resolve it against the corpus rather than the sibling
set, and make sure a qualified id can never be mistaken for a same-numbered local task.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `bin/adr-lint` | edit | line 275 rejects any non-sibling entry with a blocking error; the field cannot carry the constraint until this changes |
| `templates/task-template.md` | edit | `Depends-on:` documents "task-ids comma-separated, or none" — an author has no way to learn the qualified form exists |
| `tests/gate-regressions.py` | edit | where the gates' false-green controls live, and where the local-binding case belongs |
| `tests/mutations.json` | edit | ADR-003 requires a shipped mechanism to carry a mutation |

## Ordered Steps

1. Confirm the failing tests first: a task whose `Depends-on` names `ADR-003-T4` is rejected today with "matches no sibling task file", and `TID_RE.findall("ADR-003-T4")` returns `['T4']`. Both are red against current source; the second is the one that decides the parser's shape.
2. Write the parser as a pure function over one `Depends-on` string, returning qualified ids and local ids SEPARATELY, consuming each qualified id whole so no local scan can see its trailing T-number.
3. Teach `adr-lint` to resolve a qualified id against the corpus: unknown record, or known record with no such task, stays `errors.append` — blocking, and for the same reason a cited ADR must resolve.
4. Leave an unqualified id exactly as it is, against the sibling set, and assert that in the same test — a change that alters existing records is a different decision from this one.
5. Document the qualified form in the task template beside the field, with one example.

## Acceptance

```bash
python3 tests/gate-regressions.py bin skills/postmortem/SKILL.md
```

## Tests

| Test name | File | Verifies | Covers |
|-----------|------|----------|--------|
| `a qualified Depends-on resolves against the corpus, not the siblings` | `tests/gate-regressions.py` | `ADR-003-T4` is accepted when that record and task exist, and blocking when either does not | — |
| `a qualified id never binds to a same-numbered local task` | `tests/gate-regressions.py` | a corpus where BOTH records have a `T4`; the edge goes to the foreign one and no local edge is created | — |
| `an unqualified Depends-on is unchanged` | `tests/gate-regressions.py` | `T2` still resolves against siblings and still fails when no sibling matches | — |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the tests above |
| 2 — something selects it | `tests/gates.test.mjs::focused false-green regressions remain closed` runs this file in `scripts/selftest.sh` and in CI; the catalogue mutation removes the qualified branch and the suite goes red |
| 3 — the caller can discover it | the task template documents the form beside the field, which is where an author writing `Depends-on` is looking |
| 4 — it is used | to be recorded at execution: `adr-lint` run against a two-record fixture, and against this repository's own corpus to confirm no existing record changes verdict |

## Class Sweep

**Class:** every place a task id is extracted from prose with a regex rather than parsed.

```bash
grep -n "TID_RE\|T\\\\d" bin/adr-lint bin/adr-next
```

To be run and recorded at execution. Known at authoring: `adr-next:145` and `:150` scavenge T-ids
from `Depends-on` and from `Consumes`. This task changes `Depends-on`; `Consumes` is deliberately out
of scope, and the sweep is how the decision to leave it is recorded rather than forgotten.

## Mutation Log

<!-- tool-written by adr-verify --mutant; empty at authoring -->

## Invariants

- An unqualified id behaves exactly as it does today; no existing record changes verdict.
- A qualified id is consumed whole before any local T-id scan.
- An unresolvable qualified id is blocking, not advice — it names a record or task that does not exist.
- `adr-lint` still reports and never refuses to run.

## Risks

- Widening resolution makes `adr-lint` read the whole corpus for a header it used to answer locally. Mitigated by resolving only when a qualified id is present.
- The parser could accept a malformed id that later reads as valid. Mitigated by asserting the rejection cases in the same test as the acceptance ones.

## Stop Condition

Stop if any existing record in this repository changes verdict under the new parser — that would mean
the unqualified path was not left alone, and the decision explicitly requires it to be.

## Out of Scope

- `Consumes` edges. (permanent: same DAG, and widening two edge sources at once makes a regression impossible to attribute.)
- A wider cross-record vocabulary. (deferred: docs/BACKLOG.md §41)

## Verification Log
<!-- tool-written by adr-verify; empty at authoring -->
