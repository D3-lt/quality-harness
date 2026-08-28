# Task ADR-002-T1: the restore is on disk before the mutation is

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** M (multi-file)
**Owner:** zy
**Produces:** journal written before the mutation lands
**Consumes:** none
**Data dependency:** hermetic

## Goal

A `--mutant` run records its restore on disk, outside the repository it edits, before it writes the
mutation — so a kill of any kind is recoverable by the next run.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `bin/adr-verify` | edit | `mutant_journal()`, `recover_mutant()`, `source_bytes()`, and the reordering inside `run_mutant()` that puts the journal ahead of `write_source` |
| `bin/adr-verify` | edit | `main()` gains `--restore` and calls `recover_mutant(cwd)` before any measurement — this is the line that SELECTS recovery on an ordinary run |
| `tests/evidence-chain.test.mjs` | edit | four tests that kill a real process and assert the tree comes back |
| `tests/mutations.json` | edit | one entry per mechanism this task adds |

## Ordered Steps

1. Confirm the failing tests are red first: add `a SIGKILLed mutant run is restored by the next run, not left in the tree` to `tests/evidence-chain.test.mjs`, spawning a real `adr-verify --mutant` against a fence that outlives the test, `SIGKILL`ing it once the mutant is on disk, and asserting the next run restores it. Against the `finally`-only version this fails.
2. Add `source_bytes()` beside `write_source()` and have `write_source` call it, so one place decides what bytes a source write produces.
3. Add `mutant_journal()` — a path keyed by a digest of the resolved repository path, under `CLAUDE_PLUGIN_DATA` or the system temp directory, never inside the repository.
4. Add `recover_mutant()`: restore only when the file's current bytes equal the recorded mutant; when they match the original, drop the journal silently; when they match neither, write the original out beside the journal and refuse to overwrite.
5. Reorder `run_mutant()` so the journal is written before `write_source`, using the bytes `source_bytes()` computes rather than reading the file back.
6. Wire `--restore` into `main()`'s argument loop, and call `recover_mutant(cwd)` before the mutant branch and before the ordinary fence.
7. Add the remaining tests: refusal to overwrite a changed file, `--restore` with nothing recorded, and recovery on an ordinary run.

## Acceptance

```bash
set -o pipefail
node --test tests/evidence-chain.test.mjs 2>&1 | tee /tmp/adr002-t1.out && ! grep -qE "^not ok|ℹ fail [1-9]|no tests to run" /tmp/adr002-t1.out
```

## Tests

| Test name | File | Verifies | Covers |
|-----------|------|----------|--------|
| `a SIGKILLed mutant run is restored by the next run, not left in the tree` | `tests/evidence-chain.test.mjs` | an uncatchable kill leaves the mutant, and the journal recovers it | — |
| `a restore never overwrites a file that moved on since the mutant` | `tests/evidence-chain.test.mjs` | a changed file is left alone and the original is written out beside the journal | — |
| `--restore with nothing recorded says so rather than implying it repaired something` | `tests/evidence-chain.test.mjs` | the no-op path reports honestly and exits 0 | — |
| `an ordinary run recovers a mutant a killed run left, before it measures anything` | `tests/evidence-chain.test.mjs` | a leftover defect is not measured as the code under test | — |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the four tests above, each killing a real process |
| 2 — something selects it | `main()` calls `recover_mutant(cwd)` before the mutant branch; mutation `verify: an ordinary run recovers before it measures anything` deletes that call and the test goes red |
| 3 — the caller can discover it | the flushed warning names `adr-verify --restore --cwd <repo>`; the module docstring documents the flag and its limits, and `adr-verify` with no arguments prints it |
| 4 — it is used | measured 2026-08-27 across five kill timings for `SIGTERM` and two for `SIGKILL`; every one recovered |

## Mutation Log

- 2026-08-27 · 1f444f9* · mutant killed · exit 1 · `bin/adr-verify` · removes recovery before measurement, so a leftover mutant becomes the code under test · acceptance-sha256:5e0c2311b46be1ed1aceb693dd9ac9cbb988a24f6a410ec2715414a5be989e1f

## Class Sweep

**Class:** every tool in this repository that deliberately rewrites a source file it is responsible
for putting back.

```bash
grep -rln 'write_source\|original_bytes\|restore\|journal' bin/ scripts/
```

Run 2026-08-27: four files match, two dismissed by reading — `scripts/coverage.sh` mentions the
mutation runner only in a comment, and `scripts/lifecycle.mjs` matches the word `restore` inside a
list of git subcommands. **Two real members:** `bin/adr-verify` and `scripts/mutate.mjs`.
`mutate.mjs` was already correct and is not edited by this task; its header already recorded that
in-process handlers cannot fire during a synchronous campaign. That is the finding worth keeping —
the pattern was written down in one member and never carried to the other, so fixing the instance
would have left the class exactly as it was.

## Invariants

- Nothing is ever written inside the repository being edited.
- A file whose bytes match neither the original nor the recorded mutant is never overwritten.
- The journal is deleted on the normal path, so a clean run leaves nothing behind.
- `scripts/mutate.mjs`, the other member of this class, is not edited — it already carries the pattern.

## Risks

- A stale journal could restore over later work. Mitigated by matching the recorded mutant bytes exactly before touching anything; anything else is refused and the original preserved beside the journal.

## Stop Condition

Stop if the journal cannot be written anywhere outside the repository on a supported platform — the
guarantee would then have to be stated differently rather than degraded quietly.

## Out of Scope

- The flushed warning and the `SIGTERM` handler — T2's job.
- Orphaned child processes and containers a killed run leaves behind. (deferred: docs/BACKLOG.md §26)

## Verification Log
- 2026-08-27 · 1f444f9 · exit 0 · `node --test tests/evidence-chain.test.mjs 2>&1 | tee /tmp/adr002-t1.out; ! grep -qE "^not ok|ℹ fail [1-9]|no tests to run" /tmp/adr002-t1.out` · acceptance-sha256:5e0c2311b46be1ed1aceb693dd9ac9cbb988a24f6a410ec2715414a5be989e1f
