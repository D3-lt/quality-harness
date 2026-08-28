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
python3 tests/gate-regressions.py plugin/bin plugin/skills/postmortem/SKILL.md .
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

Run 2026-08-28. **NINE sites**, not the two the authoring list named — the same
`(?<!\w)T\d+(?!\w)` scavenge appears at `adr-lint:389, 454, 501, 506, 544, 1140, 1328, 1344` and
`adr-next:39`. Every one is a place a qualified id could bind to a same-numbered local task.

Sorted by whether a qualified id can actually reach them:

- **`Depends-on` — fixed here.** The only site an author is now told to write a qualified id into.
- **`Consumes` (454, 501, 506) — deliberately out of scope**, and this is where that decision costs
  something real: an author who writes `ADR-003-T4` in `Consumes` today gets a silent local `T4`
  edge. The parent record puts `Consumes` out of scope so a regression in one edge source can be
  attributed, and that reasoning stands — but the gap is now named rather than implied. Deferred to
  docs/BACKLOG.md §41.
- **The remaining five** scan content that is local by construction — a tasks README's `done` rows,
  a task file's own stem, a wave table. A qualified id cannot appear there without someone writing
  one into a file that has no such field.

The authoring list said two. Reading for the class rather than the reported instance found seven
more, and one of them is reachable.

## Mutation Log

<!-- tool-written by adr-verify --mutant; empty at authoring -->
- 2026-08-28 · 537564e* · mutant killed · exit 1 · `bin/adr-lint` · a qualified id falls into the local scan, where TID_RE binds it to a same-numbered sibling · acceptance-sha256:f240c9781359a4cb9100ce8dbe392375912786c1dd0700620b156f0c97b4404f
- 2026-08-28 · bf94fe6 · mutant killed · exit 1 · `plugin/bin/adr-lint` · a qualified id falls into the local scan, where TID_RE binds it to a same-numbered sibling · acceptance-sha256:b3245ec602c75d77450e2628ea3ec612ff7a784b9851ef20fbdeea8f6b3ad5f0

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
- 2026-08-28 · adb8a10 · exit 0 · `python3 tests/gate-regressions.py bin skills/postmortem/SKILL.md` · acceptance-sha256:f240c9781359a4cb9100ce8dbe392375912786c1dd0700620b156f0c97b4404f
- 2026-08-28 · f6f2e9f · exit 0 · `python3 tests/gate-regressions.py plugin/bin plugin/skills/postmortem/SKILL.md .` · acceptance-sha256:b3245ec602c75d77450e2628ea3ec612ff7a784b9851ef20fbdeea8f6b3ad5f0
