# Task ADR-046-T3: The SessionStart orientation says UNPROVEN when adr-next could not run

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** XS (one branch in `readyTaskLines`; one hook-stdin test; one catalogue entry)
**Owner:** zy
**Produces:** none
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1

## Goal

`readyTaskLines` tolerated adr-next's 0 and 3 and `continue`d on anything else — the silence of a directory with no tasks, for a gate whose lib was missing beside a copied `bin/` (exit 2), an interpreter that never ran (status null) or a hang guard that fired. The two comment paragraphs above `spawnGate` record the month of empty Windows sessions that exact `continue` produced once before. Where the ready line would have been, the orientation now says `<dir>: UNPROVEN — adr-next could not run (exit N): <the gate's first line> Ready tasks there are not known.` — or `did not run (<spawn error or signal>)` for status null, or `exited N but its answer was not JSON` — the vocabulary ADR-040 gave a git listing that could not be obtained.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/lifecycle.mjs` | edit | `readyTaskLines`: the UNPROVEN line for a non-0/3 status, a null status, and unparseable JSON |
| `tests/lifecycle.test.mjs` | edit | SessionStart on stdin with `CLAUDE_PLUGIN_ROOT` at a plugin copied without `lib/`; the real plugin offers the task |
| `tests/mutations.json` | edit | the branch returned to `continue` |

## Ordered Steps

1. [S1] Reproduce: SessionStart with a no-lib plugin root shows no `ADR tasks in flight` at all. Bind the failing test on stdin. [proof: acceptance]
2. [S2] The branch. [proof: acceptance]
3. [S3] The catalogue entry; `node scripts/mutate.mjs --case`. [proof: mutation]

## Acceptance

```bash
node --test --test-name-pattern 'when adr-next could not run' tests/lifecycle.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `SessionStart says UNPROVEN, with the gate's reason, when adr-next could not run` | `tests/lifecycle.test.mjs` | the orientation's `ADR tasks in flight:` block carries `docs/tasks: UNPROVEN — adr-next could not run (exit 2): [adr-next] could not run: plugin/lib/record.py …` and no ready/done/blocked verdict; the real plugin on the same repository says `T1 is ready —` and no UNPROVEN | — | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the branch in `readyTaskLines` |
| 2 — something selects it | every task directory's adr-next result passes it |
| 3 — the caller can discover it | the line renders under `ADR tasks in flight:` and as the `sessionStateNote`'s first line |
| 4 — it is used | the SessionStart hook on stdin with `CLAUDE_PLUGIN_ROOT` at a copy without `lib/` |

## Mutation Log
- 2026-09-11 · eb0fe36* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · returned to continue, a no-lib adr-next leaves the orientation silent about docs/tasks and the SessionStart-stdin test finds no UNPROVEN line · acceptance-sha256:1d46368ee6fae51d533cb0d92948f67b829f58cf6f9f8ef5bd6c45037ad7886e

## Invariants

- A directory whose adr-next answers 0 or 3 renders exactly as before.
- The hook still exits 0 and blocks nothing.

## Risks

- `sessionStateNote` shows only `ready.lines[0]`; when the first directory is UNPROVEN that is the line shown — which is the honest one.

## Stop Condition

A green run while a non-0/3 adr-next status leaves the orientation silent about that directory.

## Out of Scope

- Distinguishing adr-next's exit 1 (the directory could not be read) from its 2 in the orientation (permanent: boundary: both are the gate not answering; the line carries the code and the gate's own first line, which says which)

## Notes

Codes verified by execution 2026-09-11 (ADR-046 §Context). `CLAUDE_PLUGIN_ROOT` is the seam lifecycle.mjs already reads for `PLUGIN_ROOT`, so the no-lib copy is reachable from any platform.

## Verification Log
- 2026-09-11 · eb0fe36* · exit 0 · `node --test --test-name-pattern 'when adr-next could not run' tests/lifecycle.test.mjs` · acceptance-sha256:1d46368ee6fae51d533cb0d92948f67b829f58cf6f9f8ef5bd6c45037ad7886e · ms:629
- 2026-09-11 · eb0fe36* · exit 0 · `node --test --test-name-pattern 'when adr-next could not run' tests/lifecycle.test.mjs` · acceptance-sha256:1d46368ee6fae51d533cb0d92948f67b829f58cf6f9f8ef5bd6c45037ad7886e · ms:461
