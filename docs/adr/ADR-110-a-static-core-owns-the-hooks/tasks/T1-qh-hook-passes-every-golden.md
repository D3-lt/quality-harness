# Task ADR-110-T1: qh hook passes every hook golden byte for byte

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** L (a Go module reimplementing 13 hook commands against eight byte-exact transcripts)
**Owner:** unassigned
**Produces:** `cmd/qh` with `qh hook <event>`; the `QUALITY_HARNESS_HOOK_IMPL` seam in `tests/hook-golden.mjs`
**Consumes:** none
**Proof map:** v1

## Goal

A static Go binary answers every hook event exactly as `plugin/scripts/lifecycle.mjs` and its siblings do — the same
stdout, stderr, exit and ledger rows — on every scenario the hook goldens hold, and on one new golden per registered
event that had none (ADR-110, Decisions 1 and 2).

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `core/go.mod` | add | the module; `mrw`'s packages pinned by version |
| `cmd/qh/main.go` | add | `qh hook <event>`, `qh --version` |
| `core/hooks/` | add | one package per event family: orientation, record (the event log and ledgers), observe (the scratch-index tree), publish (the classifier and verdict), turnend (R1, R2, R4, W, the nudge, the claim), contract (the subagent contract), brief (branch-state) |
| `tests/hook-golden.mjs` | edit | `QUALITY_HARNESS_HOOK_IMPL=go` makes the sandbox spawn the built binary instead of `node lifecycle.mjs`; unset, nothing changes |
| `tests/goldens/` | edit | a scenario for each registered event with none: PostToolUse on Edit/Write/NotebookEdit, PreToolUse on Skill, TaskCompleted; recorded through the NODE path before any Go code for that event is written |
| `.github/workflows/selftest.yml` | edit | `go build ./cmd/qh` on each platform, then the goldens run twice |
| `tests/mutations/core/` | add | catalogue entries on the Go source; `scripts/mutate.mjs` already runs a Go fence per entry |

## Ordered Steps

1. [S1] For each registered event with no golden, record one through the Node path and commit it; then add the `QUALITY_HARNESS_HOOK_IMPL=go` seam and record the red run (TDD red: no binary, every scenario fails).
2. [S2] Port one event family at a time, orientation first (the smallest), running the goldens after each; a mismatch is fixed in the port.
3. [S3] Port the publish classifier last and run `tests/goldens/publish-classifier.json` — the largest transcript — plus every `tests/publish-command.test.mjs` fixture row through the binary as a second check that the lexer agrees. [proof: acceptance]
4. [S4] Add catalogue mutants on the Go source for each rule family (the dedupe key, the observable-write filter, the publish lexer's heredoc arm, R1's key) and record a killed mutant. [proof: mutation]

## Acceptance

```bash
go build -o "$(mktemp -d)/qh" ./cmd/qh \
  && out=$(QUALITY_HARNESS_HOOK_IMPL=go node --test --test-reporter=tap tests/hook-goldens.test.mjs 2>&1) \
  && test "$(printf '%s\n' "$out" | grep -cE '^ok [0-9]+ - ')" -ge 8 \
  && ! printf '%s\n' "$out" | grep -qE '^not ok|# SKIP'
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `orientation: startup, resume, compact and clear say their standing paragraphs as designed` | `tests/hook-goldens.test.mjs` | the existing scenario, run against the Go binary through the seam | — | S1, S2 |
| `publish: every form of a publish command gets the answer it got when the transcript was recorded` | `tests/hook-goldens.test.mjs` | the classifier transcript against the binary | — | S3 |
| `writes and turn ends: what was written, where, and what the turn says about it` | `tests/hook-goldens.test.mjs` | the turn-end rules against the binary | — | S2 |
| `every registered hook event has a golden` | `tests/hook-goldens.test.mjs` | each event in `hooks.json` appears in at least one scenario; a registered event with none turns red | — | S1 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | `cmd/qh` |
| 2 — something selects it | the seam in the sandbox |
| 3 — the caller can discover it | `qh --version`, and `hooks.json` after T3 |
| 4 — it is used | the goldens run against it in CI |

## Mutation Log

## Invariants

- No golden is re-recorded to match the binary; a mismatch is a port defect.
- The Node path is byte-identical before and after this task (the goldens run against it too).
- The binary starts no detached process (ADR-110, Decision 4); the refresh runs bounded or is skipped and said.
- The ledger formats are unchanged; a row written by either implementation is read by both.

## Risks

- The classifier's lexer (`shellWords`) is the largest single port; its fixture rows are the second check.

## Stop Condition

Stop and ask if a golden cannot be matched without changing what the Node path says — that is a wording record, not
this one.

## Out of Scope

- Any gate under `plugin/bin/` (permanent: boundary: ADR-110 Decision 2)
- Selecting the binary in `hooks.json` (deferred: T3)

## Verification Log
