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
| `tests/branch-state-native.test.mjs` | edit | A new test: the registration's command answers with no node on PATH and no flag |
| `tests/qh-launcher.test.mjs` | edit | Its Go→Node bridge example moves to `shell-hook`, which still spawns Node (no locks) |
| `tests/native-observation.test.mjs` | edit | Two ADR-131 T2 tests used `bridge branch-state` as the Go→Node exec; they move to `shell-hook` |
| `docs/adr/ADR-131-native-reader-identity-and-measured-cost/tasks/T2-native-observation.md` | tool-written | Relock with `--replace-hashes` for those two moved bodies |
| `CLAUDE.md` | edit | §15 names what answers the hook |
| `.claude/rules/15-know-what-ci-says.md` | edit | Same |
| `docs/architecture.md` | edit | Lines 105-106 and 122-124 |
| `scripts/hook-footprint.mjs` | unchanged | Its HOOK_SCRIPTS list still counts a hand-run branch-state.mjs; the native hook spawns none |
| `scripts/components.json` | edit | The component's files |

## Ordered Steps

1. [S1] Add `the branch-state registration spawns no node` to `tests/branch-state-native.test.mjs`: `qh bridge branch-state --brief --cached 120` with no QH_BRANCH_STATE_NATIVE, over the fixture whose PATH holds git and the stub gh but no node, must exit 0 and print the brief. Confirm it fails first.
2. [S2] Switch `RunBridge` so branch-state is always native. Move the Go→Node bridge examples in `tests/qh-launcher.test.mjs` and the two ADR-131 T2 tests in `tests/native-observation.test.mjs` to `shell-hook`, and relock ADR-131 T2 with `--replace-hashes`.
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
- 2026-11-01 · 23b15c33* · mutant killed · exit 1 · `core/hooks/bridge.go` · Restoring the Node spawn makes the registration fail where node is not on PATH; the no-node test fails. · acceptance-sha256:2580b2e4dc5ca1845d55ae8c8cb831bc2790e7d71177ef062cf6fcc631820b3e

## Invariants

hooks.json is unchanged; the Node CLI still answers a hand run.

## Risks

A Windows-only difference shows only on CI's Windows job and the outside run (ADR-131).

## Stop Condition

Stop if the outside run or a CI platform disagrees with the native output.

## Out of Scope

- The rest of BACKLOG §438.

## Verification Log
- 2026-11-01 · 23b15c33* · exit 1 · `set -o pipefail …` · acceptance-sha256:2580b2e4dc5ca1845d55ae8c8cb831bc2790e7d71177ef062cf6fcc631820b3e · ms:20368 · test-lock-sha256:ca9b0f95f3600a165f139fc7ac9f0453ef514c10d6952ff5cea3d8a80f9bc4bb · test-lock-file:docs/adr/locks/ca9b0f95f3600a165f139fc7ac9f0453ef514c10d6952ff5cea3d8a80f9bc4bb.lock
  ```
  --- last 10 line(s) of stdout (of 48 after folding 49 raw)
        at Test.postRun (node:internal/test_runner/test:1542:19)
        at Test.run (node:internal/test_runner/test:1467:12)
        at async Test.processPendingSubtests (node:internal/test_runner/test:974:7) {
      generatedMessage: false,
      code: 'ERR_ASSERTION',
      actual: 1,
      expected: 0,
      operator: 'strictEqual',
      diff: 'simple'
    }
  ```
- 2026-11-01 · 23b15c33* · exit 0 · `set -o pipefail …` · acceptance-sha256:2580b2e4dc5ca1845d55ae8c8cb831bc2790e7d71177ef062cf6fcc631820b3e · ms:20581
- 2026-11-01 · 23b15c33* · exit 0 · `set -o pipefail …` · acceptance-sha256:2580b2e4dc5ca1845d55ae8c8cb831bc2790e7d71177ef062cf6fcc631820b3e · ms:20736
