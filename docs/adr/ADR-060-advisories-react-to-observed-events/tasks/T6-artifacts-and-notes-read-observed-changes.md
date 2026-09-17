# Task ADR-060-T6: Artifacts and notes read observed changes

**Depends-on:** T5
**Covers:** none — no spec
**Estimated scope:** M (multi-file)
**Owner:** unassigned
**Produces:** rule A, the deletion bases and the observing notes
**Consumes:** `observe(cwd)`, the state directory, the session event log and delivery (T1); rule P (T4); rules R1, R2 and R4, the ledger and the statusline (T5); `tests/observed-events.test.mjs` (file exists) (T1)
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `rule A over committed and uncommitted paths`, `a complete per-path gate result`, `an incomplete pass retried`, `the deletion bases in both lookup paths`, `the per-hook artifact budget`, `A independent of the check opt-in`, `PreCompact and SessionEnd observing first`, `each named test actually running`

## Goal

Rule A replaces the old artifact calls. It runs the artifact gates over the paths changed since `session.started` (committed, uncommitted and observable Edit/Write), leaving out a path only when its current blob has a complete `artifact.gated` result. The per-edit gate and A both append those results; a timeout, `UNRUN` or `UNPROVEN` is not complete, so the next boundary retries that path. Deleted paths are looked up in the first HEAD, then HEAD, through both the batch and the single-file lookup, within each hook's budget. PreCompact and SessionEnd observe before they write, and the notes read the log.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/observed-events.test.mjs` | edit | the two tests below |
| `plugin/scripts/lifecycle.mjs` | edit | rule A and its `artifact.gated` events; the old pre-publish and completion artifact calls go; `runArtifactGates` sets `QUALITY_HARNESS_HISTORY_BASES`; PreCompact, SessionEnd, `sessionStateNote` and `previousSessionNotice` read the log |
| `tests/mutations.json` | edit | entries whose `from` lives in the removed artifact calls or the old note inputs are retired |
| `plugin/scripts/run-shell-hook.mjs` | edit | `archiveHistory` looks up each base in order instead of `HEAD`; after the per-edit gate it appends `artifact.gated` for the edited path and blob, `complete` only when the gate returned a verdict |
| `plugin/scripts/facts-gate-dispatch.sh` | edit | the archive lookup reads the bases in order instead of `HEAD` |

## Ordered Steps

1. [S1] Write the two tests and see them fail on an assertion (TDD red).
2. [S2] Implement rule A at turn, task and subagent end, `context.compacting` and `publish.requested`, as in ADR-060's Decision: its paths, the complete-result skip, per-path `artifact.gated` events, the 45/20/90-second budgets with `UNRUN` for what the budget left, and the key `(A, tree, gate output hash)`. Make the per-edit hook append its `artifact.gated` result. Remove the old artifact calls.
3. [S3] Pass the first HEAD and HEAD through `QUALITY_HARNESS_HISTORY_BASES`, and read them in order in `archiveHistory` and in `facts-gate-dispatch.sh`, defaulting to `HEAD` when unset.
4. [S4] Observe at PreCompact and SessionEnd before their notes and ledger rows, and point the note functions at the log.
5. [S5] Run the fence green and record mutants:
   - use only uncommitted paths;
   - gate A on the check;
   - read `HEAD` in `archiveHistory`;
   - read `HEAD` in `facts-gate-dispatch.sh`;
   - skip a path whose `artifact.gated` result is incomplete;
   - record a budget-cut path as complete;
   - read the note from the last Stop observation.

   [proof: mutation]

## Acceptance

```bash
set -o pipefail
out=$(node --test --test-reporter=tap --test-name-pattern '^(a committed artifact is still validated|a compaction note sees the latest edit)$' tests/observed-events.test.mjs 2>&1) \
  || { printf '%s\n' "$out"; exit 1; }
for name in 'a committed artifact is still validated' 'a compaction note sees the latest edit'; do printf '%s\n' "$out" | grep -qxE "ok [0-9]+ - $name" || { printf '%s\n' "$out"; echo "did not run: $name"; exit 1; }; done \
  && node --test tests/lifecycle.test.mjs tests/staged-product.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a committed artifact is still validated` | `tests/observed-events.test.mjs` | Temp repository without a check.<br>• A malformed record under `docs/adr/` written by Bash and committed before Stop gets A's message; uncommitted, it does too.<br>• Two records of a frozen archive, deleted and committed during the session, produce no finding through the batch lookup; one produces none through the single-file lookup. The same deletions looked up at `HEAD` alone produce the dispatcher's finding.<br>• A malformed record written with Edit is reported by the per-edit gate and not again at Stop. When that gate times out instead, Stop gates the record.<br>• A second Stop with every path complete runs no gates.<br>• With a PreCompact budget of zero, the message names the unchecked paths as `UNRUN`, and the next Stop gates them. | — | S1, S2, S3 |
| `a compaction note sees the latest edit` | `tests/observed-events.test.mjs` | SessionStart, an edit, then PreCompact with no Stop between: the note names the edit and not a clean state; the same for SessionEnd's ledger row | — | S1, S4 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the two tests |
| 2 — something selects it | the hooks route to rule A and the note writers, and `runArtifactGates` hands the bases to both lookups; the tests drive them as processes; S5's mutants break each |
| 3 — the caller can discover it | n/a: no declared interface |
| 4 — it is used | every artifact change and every compaction |

## Mutation Log

## Invariants

- `facts-gate-dispatch.sh`'s exit-code contract is unchanged, and it reads `HEAD` when no bases are given.
- A has no check gate.
- Every `tests/mutations.json` entry matches exactly once after this task.

## Risks

- Artifact gates at hook boundaries add work; the complete-result skip and the budgets bound it.

## Stop Condition

Stop and ask if the dispatcher cannot take deletion bases without changing its contract.

## Out of Scope

- New artifact gate kinds (permanent: boundary: this task changes their inputs, not the gates)

## Verification Log
