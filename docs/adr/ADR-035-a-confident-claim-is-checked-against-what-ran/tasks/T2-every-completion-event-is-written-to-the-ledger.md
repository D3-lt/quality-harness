# Task ADR-035-T2: Every completion event is written to the machine-local ledger

**Depends-on:** T1
**Covers:** none — no spec
**Estimated scope:** S (single file)
**Owner:** unassigned
**Produces:** `claims.jsonl` row schema — `{at, event, cwd, session, claim, phrase, evidence, mutations}`
**Consumes:** `completionClaim()` (T1)
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `the append`, `the evidence classification`, `the absence notice when CLAUDE_PLUGIN_DATA is unset`, `the pass/fail counters the fence greps for`

## Goal

Every `Stop`, `SubagentStop` and `TaskCompleted` the hook handles appends one classified row to
`$CLAUDE_PLUGIN_DATA/claims.jsonl`, and a session that cannot record says so on stderr rather than
skipping in silence.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/lifecycle.mjs` | edit — `recordClaim(row)`; call it once in the completion branch for every path, including the early returns for an unreadable transcript and for no declared check | the writer and the one place every event passes through |
| `tests/lifecycle.test.mjs` | edit — the tests below, with `CLAUDE_PLUGIN_DATA` pointed at a temp dir | the boundary the row is written at |
| `tests/mutations.json` | edit — register `stop: every completion event is written to the ledger` | the append is the mechanism |

## Ordered Steps

1. [S1] Write the failing tests: with `CLAUDE_PLUGIN_DATA` set, one Stop over an unverified edit
   with a confident message appends exactly one line whose `claim` is `asserted` and `evidence` is
   `unverified`; an unreadable transcript appends `evidence: could-not-look`; a project with no
   check appends `evidence: no-check`; with `CLAUDE_PLUGIN_DATA` unset nothing is written and stderr
   carries one line naming the variable. Red.
2. [S2] Implement `recordClaim`: `mkdir -p` the data dir, append one JSON line with a trailing
   newline, never throw — a failure to write is one stderr line, never a hook failure.
3. [S3] Call it from every exit of the completion branch so that the four evidence kinds and the
   five claim kinds are all reachable; the classification must be computed before the early
   returns that exist today, not after.
4. [S4] Register the mutant: make `recordClaim` return before `appendFileSync` — the first test
   must go red. `[proof: mutation]`

## Acceptance

```bash
set -o pipefail
out=$(mktemp)
node --test --test-name-pattern 'claims ledger' tests/lifecycle.test.mjs 2>&1 | tee "$out" && grep -qE '^ℹ pass [1-9]' "$out" && grep -qE '^ℹ fail 0$' "$out"
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `the claims ledger gets one row per completion event, classified` | `tests/lifecycle.test.mjs` | asserted×unverified, could-not-look, no-check each land as one row | — | S1, S2, S3 |
| `the claims ledger is not written without CLAUDE_PLUGIN_DATA, and says so` | `tests/lifecycle.test.mjs` | absence is announced, never silent | — | S1, S2 |
| `the claims ledger row never throws out of the hook` | `tests/lifecycle.test.mjs` | an unwritable data dir leaves the advisory intact and exit 0 | — | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the first test reads the row back |
| 2 — something selects it | the hook process is driven end to end; the mutant that skips the append goes red |
| 3 — the caller can discover it | the row schema is named in the ADR's Wiring table and in `claims-rate.mjs --help` (T3) |
| 4 — it is used | T3 reads it; T4's sign-off names how many rows this machine had |

## Mutation Log

## Invariants

- A row is appended, never rewritten; the file is append-only like the Verification Log.
- `cwd` is recorded as given; the file never leaves `CLAUDE_PLUGIN_DATA` and is never tracked.
- The hook's exit code and its `systemMessage` are unchanged by whether the append succeeded.

## Risks

- Two hooks appending at once interleave lines. One short line per event with a single
  `appendFileSync` keeps each write atomic on every platform CI runs; noted, not guarded.

## Stop Condition

If Claude Code does not set `CLAUDE_PLUGIN_DATA` for hook processes on the current build (check a
live payload's environment), stop: the ledger has no home and the decision's location premise
needs re-checking before any fallback is invented.

## Out of Scope

- Reading or summarising the ledger — T3.

## Verification Log
