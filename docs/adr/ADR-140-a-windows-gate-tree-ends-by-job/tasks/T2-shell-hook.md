# Task ADR-140-T2: The shell hook adopts its gate into a job

**Depends-on:** T1
**Covers:** none — no spec
**Estimated scope:** M
**Owner:** Zy
**Produces:** none
**Consumes:** `winAdopt(ops, pid)`, `winEnd(ops, tree, pid)` (T1)
**Data dependency:** needs a Windows run: CI's Windows job on the landing sha runs the real job calls and the MSYS grandchild
**Proof map:** v1

## Goal

On Windows a timed-out edit gate run by the core has every process it started ended, and the core says nothing about unconfirmed
cleanup; the parity test says per runner what each does there.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `core/hooks/shellhook_run.go` | edit | `shkAdopt` after `Start`; its result to `shkEndTree`; a failed adoption is a failed start |
| `core/hooks/shellhook_kill_windows.go` | edit | CREATE_SUSPENDED in `shkOwnTree`; `shkAdopt` and `shkEndTree` through `winAdopt` / `winEnd` |
| `core/hooks/shellhook_kill_unix.go` | edit | `shkAdopt` returns nothing; `shkEndTree` takes and ignores it |
| `core/hooks/shellhook_adopt_test.go` | add | `TestShellHookAdoptsWhatItStarted`: a fake adopt sees the started pid and the deadline hands its tree to the end |
| `tests/core-win-tree.test.mjs` | edit | Also runs `TestShellHookAdoptsWhatItStarted` |
| `tests/shell-hook-native.test.mjs` | edit | On Windows the timeout scenarios run each runner apart: the core ends the grandchild and says no cleanup failure; Node still says it |
| `docs/adr/ADR-136-the-edit-gates-run-from-the-core/tasks/T2-runner.md` | tool-written | Relock with `--replace-hashes` |
| `docs/adr/ADR-136-the-edit-gates-run-from-the-core/tasks/T3-edit-gate.md` | tool-written | Relock with `--replace-hashes` |
| `docs/adr/ADR-136-the-edit-gates-run-from-the-core/tasks/T4-cutover.md` | tool-written | Relock with `--replace-hashes` |
| `tests/mutations/core/hooks/shellhook_run.go.json` | edit | Dropping the adopt call, or not handing its tree to the end, is noticed |
| `docs/BACKLOG.md` | edit | §440 closed for the core, with the Node limit and the CI evidence |

## Ordered Steps

1. [S1] Confirm the failing test exists and is red (TDD red): write `TestShellHookAdoptsWhatItStarted` with the adopt and end seams replaced by recorders, a `sleep` child and a short
   timeout; confirm red.
2. [S2] Add the seams and the calls in `shkRun`; Windows: the suspended start and the T1 routine; Unix: no-ops.
3. [S3] Split the Windows branch of the timeout scenarios in tests/shell-hook-native.test.mjs: each runner runs apart, the core's
   grandchild is gone and its stderr does not say cleanup could not be confirmed, Node's still does. Other platforms keep `both()`.
   Relock ADR-136 T2, T3 and T4 with `adr-verify --relock --replace-hashes`: the lock-policy exception ADR-140 names in its
   Alternatives, accepted by the owner with the record. [proof: acceptance]
4. [S4] Land, and read the Windows job's result for the two timeout scenarios on that sha.
   [proof: human: the CI Windows job log at the landing sha shows both timeout subtests passing]
5. [S5] Add the mutants and record one killed. [proof: mutation]

## Acceptance

```bash
set -o pipefail
out="$(mktemp)"
node --test tests/core-win-tree.test.mjs tests/shell-hook-native.test.mjs 2>&1 | tee "$out" && grep -q '✔ the shell hook hands the deadline the tree it adopted' "$out" && grep -q "✔ a timeout ends the gate's whole tree (hang)" "$out"
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `the shell hook hands the deadline the tree it adopted` | `tests/core-win-tree.test.mjs` | `TestShellHookAdoptsWhatItStarted` ran and passed | — | S1, S2 |
| `TestShellHookAdoptsWhatItStarted` | `core/hooks/shellhook_adopt_test.go` | Adopt sees the pid; the end gets the adopted tree | — | S2 |
| `the native shell hook says what the Node runner says in every scenario` | `tests/shell-hook-native.test.mjs` | The per-runner split on Windows; parity elsewhere | — | S3, S4 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | `shkAdopt` |
| 2 — selected | `shkRun`, the mutant that drops the call |
| 3 — discoverable | n/a: no declared interface |
| 4 — used | every timed-out edit gate on Windows; the CI Windows job's scenarios |

## Mutation Log
- 2026-11-10 · 4710a2baf* · mutant killed · exit 1 · `core/hooks/shellhook_run.go` · the deadline would end the gate without the job shkRun adopted it into, so on Windows only taskkill would run · acceptance-sha256:51c9f9755a21b02574587fada34f5e602f5bdc5b562c87938d19e40163e2f175

## Invariants

On macOS and Linux the core and Node still print the same bytes in every scenario.

## Risks

The CI Windows runner refuses nested jobs: the core falls back to taskkill and the Windows assertion goes red at landing, which
is where it is seen.

## Stop Condition

Stop if `--replace-hashes` refuses, or if a locked test other than the timeout scenarios has to change.

## Out of Scope

- The Node runner (ADR-140 Out of Scope).

## Verification Log
- 2026-11-10 · 4710a2baf* · exit 0 · `set -o pipefail …` · acceptance-sha256:51c9f9755a21b02574587fada34f5e602f5bdc5b562c87938d19e40163e2f175 · ms:5307
