# Task ADR-080-T1: The artifact pass runs behind the boundary, writes its own ledger, and resumes

**Depends-on:** none
**Covers:** F-1, F-2, F-3, F-4, F-7, F-8, UC1-S1, UC1-S2, UC1-S3, UC1-S4, UC3-S1, UC3-S2
**Estimated scope:** L (the hook, the pass, the lock, seven tests, four test helpers)
**Owner:** unassigned
**Produces:** the `pass.gated` ledger line
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `a boundary starts a pass and returns`, `the lock is claimed exclusively and reclaimed by deadline`, `a verdict and its findings are one ledger line`, `a pass that cannot start is said`

## Goal

At every boundary, `artifactRule` starts one detached pass per session instead of gating in line. The pass writes only its own ledger, a verdict and its findings on one line, and a stopped pass is resumed after its deadline (ADR-080 Decision).

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/lifecycle.mjs` | edit | `artifactRule` claims the lock and starts the pass; `--artifact-pass` runs it; the request; the `inline` seam; the boundary-time import of `pass.gated` so the targets exclude what the ledger answered; UNRUN when it cannot start |
| `plugin/scripts/run-shell-hook.mjs` | edit | the batch reports each path as it finishes, so the pass writes each line as it lands |
| `tests/artifact-pass-behind.test.mjs` | edit | remove `todo` from this task's seven tests |
| `tests/artifact-key.test.mjs`, `tests/evidence-flip.test.mjs`, `tests/late-baseline.test.mjs`, `tests/observed-events.test.mjs` | edit | their hook environment helpers select `QUALITY_HARNESS_ARTIFACT_PASS_RUNNER=inline`; no locked test body changes |
| `tests/mutations.json` | edit | one entry per Rests-on name |

## Ordered Steps

1. [S1] Remove `todo` from the seven tests in this task's Tests table and record the red run (TDD red). [proof: acceptance]
2. [S2] Split `artifactRule`: the targets stay in the hook, minus paths the ledger answered completely; when any remain, claim the lock (exclusive create; rename aside a lock past its deadline, then create) and spawn the runner detached with `stdio: 'ignore'`, `windowsHide` and `unref`.
3. [S3] `--artifact-pass <request>`: write `pass.started`, take the machine lease, run the batch with the remaining budget, append one `pass.gated` line per path with its findings as it lands, then `pass.ended`; delete the lock only while it holds this token.
4. [S4] The `inline` value of the runner seam awaits the same pass in-process; set it in the four test files' hook environment helpers, and confirm with `python3 scripts/test-locks.py` that no locked body moved. [proof: human: test-locks reports every lock on the four files unmoved, and the selftest passes]
5. [S5] A runner that does not exist, or a spawn that fails, releases the lock and queues an UNRUN line.
6. [S6] Replay the adopter session (a local clone with its 422 KB log) and record the commit's PreToolUse time before and after in the commit message. [proof: human: the session reads the two timings]
7. [S7] Record one killed mutant per Rests-on name. [proof: mutation]

## Acceptance

```bash
set -o pipefail
T=$(mktemp)
node --test --test-reporter=tap tests/artifact-pass-behind.test.mjs 2>&1 | tee "$T" && for t in 'no boundary waits for the artifact pass' 'one artifact pass runs per session at a time' 'a stopped pass resumes with exactly the paths it did not reach' 'a pass that cannot start is said, not silent' 'the pass writes only its own ledger' 'the unchecked advisory is said once per tree and check state' 'a refused publish is denied every time'; do test "$(grep -cxE "ok [0-9]+ - $t" "$T")" -eq 1 || exit 1; done
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `no boundary waits for the artifact pass` | `tests/artifact-pass-behind.test.mjs` | each of five boundaries returns while the runner is blocked; no verdict in the session log | F-1, UC1-S1 | S2 |
| `one artifact pass runs per session at a time` | `tests/artifact-pass-behind.test.mjs` | two concurrent boundaries start one pass; a lock past its deadline with a live pid is reclaimed | F-2, UC1-S2 | S2 |
| `a stopped pass resumes with exactly the paths it did not reach` | `tests/artifact-pass-behind.test.mjs` | the next pass's targets equal the unanswered set exactly | F-4, UC1-S3 | S2, S3 |
| `a pass that cannot start is said, not silent` | `tests/artifact-pass-behind.test.mjs` | UNRUN, and no lock left | F-7, UC1-S4 | S5 |
| `the pass writes only its own ledger` | `tests/artifact-pass-behind.test.mjs` | the shipped pass gates each path once; the session log is untouched while it runs | F-3 | S3 |
| `the unchecked advisory is said once per tree and check state` | `tests/artifact-pass-behind.test.mjs` | held: once per key, again after a failed check and after a change | F-8, UC3-S1 | S2 |
| `a refused publish is denied every time` | `tests/artifact-pass-behind.test.mjs` | held: `permissionDecision` is `deny` on both attempts | F-8, UC3-S2 | S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the seven tests |
| 2 — something selects it | the three `artifactRule` callers in the lifecycle hook |
| 3 — the caller can discover it | the ledger and lock under `.git/quality-harness/passes/` |
| 4 — it is used | every adopter commit, turn end and compaction |

## Mutation Log

## Invariants

- What is gated, and each finding's severity, are unchanged (ADR-060).
- The publish refusal (ADR-061) is unchanged, and the pass never writes the session log.
- No locked test body changes.

## Risks

- A test that waits on a detached pass is timing-dependent; each wait has a deadline and asserts an end state, never a duration.

## Stop Condition

Stop and ask if the pass cannot be detached on a platform CI runs, if a locked test needs its body changed, or if the publish refusal's verdict changes in any test.

## Out of Scope

- Importing and saying findings at every hook — T2.

## Verification Log
