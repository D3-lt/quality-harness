# Task ADR-135-T4: The hooks call the core's branch state

**Depends-on:** T3
**Covers:** none — no spec
**Estimated scope:** M
**Owner:** Zy
**Produces:** none
**Consumes:** native `qh bridge branch-state` (T3)
**Data dependency:** hermetic
**Proof map:** v1

## Goal

Both branch-state registrations are answered by the core with no Node spawn; the Node CLI stays for hand runs and
statusline.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `core/hooks/bridge.go` | edit | `branch-state` no longer spawns Node |
| `core/cmd/qh/main.go` | edit | The native flag becomes the default |
| `tests/qh-launcher.test.mjs` | edit | Its bridge stub expectations, if unlocked; else a new test beside |
| `CLAUDE.md` | edit | §15 names what answers the hook |
| `.claude/rules/15-know-what-ci-says.md` | edit | Same |
| `docs/architecture.md` | edit | Lines 105-106 and 122-124 |
| `scripts/hook-footprint.mjs` | edit | Counts the native handler |
| `scripts/components.json` | edit | The component's files |

## Ordered Steps

1. [S1] Add a test to `tests/branch-state-native.test.mjs` that runs the real registration through `plugin/scripts/qh-hook.sh bridge branch-state --brief --cached 120` and fails when a `node` process is spawned (an empty-PATH-for-node seam). Confirm it fails first.
2. [S2] Switch `RunBridge` and make the native handler the default.
3. [S3] Update the documents and catalogues that name branch-state as Node. [proof: acceptance]
4. [S4] Add a mutant restoring the Node spawn; record it killed. [proof: mutation]

## Acceptance

```bash
set -o pipefail
out="$(mktemp)"
node --test tests/branch-state-native.test.mjs tests/qh-launcher.test.mjs 2>&1 | tee "$out" && grep -q '✔ the branch-state registration spawns no node' "$out"
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `the branch-state registration spawns no node` | `tests/branch-state-native.test.mjs` | The hook path is native | — | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | T3 |
| 2 — selected | `RunBridge` selects it |
| 3 — discoverable | hooks.json registrations, unchanged |
| 4 — used | Every SessionStart and UserPromptSubmit |

## Mutation Log

## Invariants

hooks.json is unchanged; the Node CLI still answers a hand run.

## Risks

A Windows-only difference shows only on CI's Windows job and the outside run (ADR-131).

## Stop Condition

Stop if the outside run or a CI platform disagrees with the native output.

## Out of Scope

- The rest of BACKLOG §438.

## Verification Log
