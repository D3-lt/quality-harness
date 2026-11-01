# Task ADR-137-T3: PreToolUse asks the core, not Node

**Depends-on:** T2
**Covers:** none — no spec
**Estimated scope:** M
**Owner:** Zy
**Produces:** none
**Consumes:** Go `decisionContext` (T2)
**Data dependency:** hermetic
**Proof map:** v1

## Goal

core/hooks/pending.go answers from the Go reader, keeps its gates and its could-not-look text, and spawns no node.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `core/hooks/pending.go` | edit | Calls the Go reader; a panic or spent budget says the same could-not-look |
| `tests/decision-context-replay.test.mjs` | edit | A PreToolUse case with a governing record, no node on PATH |
| `docs/adr/ADR-092-one-definition-of-a-record.md` | not edited | A record is history; ADR-137's Amends header carries the change |
| `docs/architecture.md` | edit | The decision reader in core/hooks |
| `scripts/components.json` | edit if it names the reader | The producer of the context |

## Ordered Steps

1. [S1] Add `PreToolUse names the governing decisions with no node on PATH`: the native PreToolUse over an Edit of a governed file in a scratch corpus, with a PATH without node, prints the governing record. Confirm it fails first.
2. [S2] Switch pending.go; keep hasDecisionCorpus and outsideRoot; recover a panic into the could-not-look line.
3. [S3] Update docs/architecture.md and the component manifest. [proof: acceptance]
4. [S4] Add a mutant restoring the Node spawn; record it killed. [proof: mutation]

## Acceptance

```bash
set -o pipefail
out="$(mktemp)"
node --test tests/decision-context-replay.test.mjs tests/native-hooks.test.mjs 2>&1 | tee "$out" && grep -q '✔ PreToolUse names the governing decisions with no node on PATH' "$out"
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `PreToolUse names the governing decisions with no node on PATH` | `tests/decision-context-replay.test.mjs` | The hook path is native and says the decisions | — | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | T2 |
| 2 — selected | pending.go |
| 3 — discoverable | the PreToolUse registration, unchanged |
| 4 — used | Every edit in a decision corpus |

## Mutation Log

## Invariants

The text an agent receives is Node's; the Node CLI still answers.

## Risks

Measured cost must be taken on an adopter-shaped corpus too (CLAUDE.md §19).

## Stop Condition

Stop if the replay or a CI platform disagrees.

## Out of Scope

- Other Node processes on the hook path (BACKLOG §438).

## Verification Log
