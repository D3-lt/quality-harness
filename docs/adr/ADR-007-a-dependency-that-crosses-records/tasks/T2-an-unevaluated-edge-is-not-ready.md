# Task ADR-007-T2: an edge that cannot be evaluated is not ready

**Depends-on:** T1
**Covers:** none — no spec
**Estimated scope:** M (multi-file)
**Owner:** zy
**Produces:** none
**Consumes:** qualified-id parser and corpus resolution in `bin/adr-lint` (T1)
**Data dependency:** hermetic

## Goal

Make `adr-next` block on an incomplete foreign task and name it, refuse to call an edge it could not
evaluate ready, and run the cycle check over the union of records rather than one at a time.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `bin/adr-next` | edit | `:146` and `:151` drop any T-id outside this ADR's `infos`, so an unseen edge reads as no edge and the task prints `ready` |
| `tests/adr-next.test.mjs` | edit | the suite that already exercises readiness |
| `tests/mutations.json` | edit | one mutation per half: the blocked state, and the cannot-evaluate state |

## Ordered Steps

1. Confirm the failing test first, and build the fixture the report asks for: a two-record corpus where B's task depends on A's INCOMPLETE task. Assert `adr-next B` says blocked and names A. Then remove the dependency and assert it says ready — a test that checks only the ready case passes today, before any change.
2. Resolve a qualified dependency against the other record's tasks, using T1's parser, and count it complete only on the same evidence a sibling needs: an exit-0 Verification Log entry whose digest matches its current fence.
3. Report an unreadable or missing foreign record as `cannot evaluate <id>` — never `ready`, and never silently complete. This is the half the whole record exists for.
4. Run the cycle check over the union of records once cross-record edges exist, and assert a two-record cycle is caught.
5. Leave the exit code alone: `adr-next` reports and never refuses.

## Acceptance

```bash
set -o pipefail
node --test tests/adr-next.test.mjs tests/gate-rules.test.mjs 2>&1 | tee /tmp/adr007-t2.out && ! grep -qE "^not ok|ℹ fail [1-9]|no tests to run" /tmp/adr007-t2.out
```

## Tests

| Test name | File | Verifies | Covers |
|-----------|------|----------|--------|
| `a task waiting on another record's incomplete task is blocked, and says which` | `tests/adr-next.test.mjs` | the falsifying fixture the report asks for: blocked while A is incomplete, ready once the dependency is removed | — |
| `a foreign record that cannot be read is not readiness` | `tests/adr-next.test.mjs` | an unreadable or absent target prints `cannot evaluate` and the task is not ready | — |
| `a cycle across two records is caught` | `tests/adr-next.test.mjs` | the cycle check runs over the union, not per record | — |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the tests above |
| 2 — something selects it | `scripts/selftest.sh` runs `node --test tests/*.test.mjs`; two mutations break the blocked state and the cannot-evaluate state independently |
| 3 — the caller can discover it | `adr-next` prints the record it is waiting on, at the moment an executor asks what is next — the delivery mode BACKLOG §36 measured as the one that works |
| 4 — it is used | to be recorded at execution: `adr-next --all` over this repository's own corpus, confirming no existing record changes verdict |

## Class Sweep

**Class:** every readiness answer `adr-next` gives that could be computed from an edge it did not
evaluate.

```bash
grep -n "ready\|blocked\|done" bin/adr-next
```

Run 2026-08-28. Every readiness answer flows through ONE place — `main`'s classification loop at
`adr-next:329-340` — and three renderers read it (`--json` 343, `--all` 349-353, the default 358+).
Widening the loop therefore widened all three at once, which is why no renderer needed touching.

Two members the authoring list did not have:

- **A malformed cross-record pointer.** `ADR-not-a-number-T1` parses as no qualified id, fell to the
  local scan, and `TID_RE` found the trailing `T1` inside it — which resolves to the task itself,
  self-edges are excluded, and the task printed READY. A pointer nobody can read became a clean bill
  of health, one layer below the case this task was written for. Fixed here; `adr-lint` already
  rejected it at authoring, so the two now agree.
- **`Consumes` (`adr-next:196`)** scavenges T-ids through the identical filter on the adjacent line.
  Out of scope by the parent record so a regression in one edge source can be attributed, and now
  named in docs/BACKLOG.md §41 rather than left implied — an author writing a qualified id there
  still gets a silent local edge.

The report named one member. Reading for the class found two more, and both are reachable.

## Mutation Log

<!-- tool-written by adr-verify --mutant; empty at authoring -->
- 2026-08-28 · a94338d · mutant killed · exit 1 · `bin/adr-next` · a foreign dependency that is not done stops blocking, and the task it gates prints READY again · acceptance-sha256:c3a0b32892e8155766a4a0ecf525bd154668961feefa15d8ad1b42941b94ac42
- 2026-08-28 · 8f005a8 · mutant killed · exit 1 · `plugin/bin/adr-next` · next: a foreign dependency that is not done blocks · acceptance-sha256:692dc1197d59e0db453913ed0101b6a987c5a543f7039c147469a93923945076

## Invariants

- No readiness answer is derived from an edge that was not evaluated; `cannot evaluate` is its own state.
- `adr-next` still exits 0 whatever it finds — it reports, it never refuses.
- A record with no cross-record dependencies produces byte-identical output to today.
- The cycle check covers the union, so widening the edges does not move the blindness.

## Risks

- A corpus problem in an unrelated record can now block a readiness answer. Intended, and the message names the id so the cause is not inferred.
- `cannot evaluate` could be read as a failure of the task rather than of the corpus. Mitigated by naming the foreign record in the same line.

## Stop Condition

Stop if any record in this repository's own corpus changes verdict where it has no cross-record
dependency — that would mean the local path was altered, which this task must not do.

## Out of Scope

- `Consumes` edges. (permanent: named by the sweep, and widening both at once makes a regression impossible to attribute.)
- Re-measuring the reporting corpus's 44% figure. (deferred: docs/BACKLOG.md §41)

## Verification Log
<!-- tool-written by adr-verify; empty at authoring -->
- 2026-08-28 · 74f790f · exit 0 · `node --test tests/adr-next.test.mjs tests/gate-rules.test.mjs 2>&1 | tee /tmp/adr007-t2.out; ! grep -qE "^not ok|ℹ fail [1-9]|no tests to run" /tmp/adr007-t2.out` · acceptance-sha256:c3a0b32892e8155766a4a0ecf525bd154668961feefa15d8ad1b42941b94ac42
