# Task ADR-111-T3: The baseline is taken at session start and read at the turn end

**Depends-on:** T2, T4
**Covers:** none — no spec
**Estimated scope:** L (qh-check, the SessionStart hook, the turn-end judgement, the ledger readers)
**Owner:** Zy
**Produces:** `qh-check --baseline`; `baseline: true` rows in `checks.jsonl`; the two baseline sentences in R1
**Consumes:** the red-check lead in R1 (T2); the rules the Go core lacks, named in the parity tests (T4)
**Data dependency:** hermetic
**Proof map:** v1

## Goal

SessionStart starts one detached `qh-check --baseline` on the session's starting tree, and the turn end names a regression
(baseline green, current red) and an inherited red (baseline red, current red) apart (ADR-111, Decisions 1 and 2).

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/qh-check.mjs` | edit | `--baseline <tree>`: runs the check in the repository, binds the result to `<tree>` only when the tree before and after the run are that tree, writes `baseline.jsonl`, takes the machine lease, never reads or writes `checks.jsonl` (ADR-111 Decision 1's correction) |
| `plugin/scripts/lifecycle.mjs` | edit | SessionStart `startup` starts it detached under the fence deadline, as the artifact pass is started |
| `plugin/scripts/completion-rules.mjs` | edit | the two baseline sentences |
| `plugin/scripts/check-ledger.mjs` | edit | the reader of `baseline.jsonl` for a tree; no reader of `checks.jsonl` changes |
| `tests/hook-golden.mjs` | edit | `QUALITY_HARNESS_BASELINE_RUNNER=off` in the sandbox environment, so the goldens and the parity test stay deterministic and a Go run is not compared with a Node-only child |
| `tests/baseline.test.mjs` | add | the mode, the start, the two sentences, the twins |
| `tests/mutations/plugin/scripts/*.json` | edit | a mutant per decision point |

## Ordered Steps

1. [S1] Write the failing tests: `qh-check --baseline` records `baseline: true` against the starting tree; SessionStart `startup` starts it and `resume`/`compact` do not; a SessionStart hook returns before the baseline finishes; baseline green and current red names the regression; baseline red and current red names the inherited red; no baseline record says neither; a baseline row never satisfies "a check passed on this tree" for the publish gate. Record the red run.
2. [S2] Implement the mode and the start, reusing the artifact pass's detach, deadline and lease.
3. [S3] Implement the two sentences beside T2's red-check lead.
4. [S4] Audit the class: every writer and reader of `checks.jsonl` (`mrw read --grep "checks\.jsonl|CHECKS_LEDGER" plugin/ core/`), with the command and its output in this task's sign-off; none may read `baseline.jsonl`, and a test shows a baseline pass on the starting tree leaves the same-tree skip and the publish verdict as they were.
5. [S5] Measure the adopter cost (§19) on a fresh repository and on a corpus: SessionStart wall time unchanged within noise, and the baseline run's wall time and load. [proof: human: the timings, the load, where they were measured]
6. [S6] Record a killed mutant per decision point. [proof: mutation]

## Acceptance

```bash
node --test tests/baseline.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `qh-check --baseline records against the starting tree and holds no git lock` | `tests/baseline.test.mjs` | the mode | — | S1, S2 |
| `only a startup SessionStart starts the baseline, and it waits for nothing` | `tests/baseline.test.mjs` | the start | — | S1, S2 |
| `a green baseline and a red current run name the regression; a red baseline names the inherited red` | `tests/baseline.test.mjs` | both sentences and the no-record twin | — | S1, S3 |
| `a baseline pass leaves the same-tree skip and the publish verdict as they were` | `tests/baseline.test.mjs` | the class audit | — | S1, S4 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | `qh-check --baseline` |
| 2 — something selects it | SessionStart in `lifecycle.mjs`; the mutant that deletes the start |
| 3 — the caller can discover it | `qh-check --help`; the turn-end sentences |
| 4 — it is used | ADR-112's arms |

## Mutation Log

## Invariants

- No hook waits on the baseline (ADR-080).
- A baseline red is never said as a pass, and a baseline green never certifies the current tree.
- A baseline row is never a release check.

## Risks

- A slow suite's baseline finishes after the first turn end; that turn end says nothing new.
- Two sessions on one checkout run two baselines; the machine lease serialises them.

## Stop Condition

Stop if the baseline cannot run without a git lock, or if any hook would have to wait on it.

## Out of Scope

- Per-test comparison (deferred: docs/BACKLOG.md §383)

## Verification Log
