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
| `tests/decision-context-replay.test.mjs` | edit | A PreToolUse case with a governing record, no node on PATH; the 64 MiB screen-budget row the replay lacked |
| `tests/mutations/core/hooks/pending.go.json` | edit | The catalogued mutant names the reader's answer, not the spawn's stdout |
| `docs/BACKLOG.md` | edit | The nested-corpus gap T2 found behind hasDecisionCorpus |
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
- 2026-11-01 · f9798aac8* · mutant killed · exit 1 · `core/hooks/pending.go` · pending.go spawns node adr-context.mjs --hook again: with no node on PATH the hook said the could-not-look line where Node's decisionContext names docs/adr/ADR-001-keep.md and docs/adr/ADR-002-dropped.md · acceptance-sha256:6a23ef1f4d0b05bc263d74a9f2af39276ebdfd0f9d4c1c4353258af75ad674d1

## Invariants

The text an agent receives is Node's; the Node CLI still answers.

## Risks

Measured cost must be taken on an adopter-shaped corpus too (CLAUDE.md §19).

## Stop Condition

Stop if the replay or a CI platform disagrees.

## Out of Scope

- Other Node processes on the hook path (BACKLOG §438).

## Verification Log
- 2026-11-01 · f9798aac8* · exit 1 · `set -o pipefail …` · acceptance-sha256:6a23ef1f4d0b05bc263d74a9f2af39276ebdfd0f9d4c1c4353258af75ad674d1 · ms:48746 · test-lock-sha256:9aa02ea7ed483b13404cb77667b03542103bd7ee492d31e1116ee6f3819fc92b · test-lock-file:docs/adr/locks/9aa02ea7ed483b13404cb77667b03542103bd7ee492d31e1116ee6f3819fc92b.lock
  ```
  --- last 10 line(s) of stdout (of 63 after folding 63 raw)
        at Test.postRun (node:internal/test_runner/test:1542:19)
        at Test.run (node:internal/test_runner/test:1467:12)
        at async Test.processPendingSubtests (node:internal/test_runner/test:974:7) {
      generatedMessage: false,
      code: 'ERR_ASSERTION',
      actual: 'could-not-look: the decision reader could not run, so which decisions govern this edit is unknown.',
      expected: 'Decisions that govern what you are about to change:\n  docs/adr/ADR-001-keep.md — ADR-001: Keep  [caught by: tests/governed.test.mjs]\nAlready decided against here — do not re-propose without saying why it is different now:\n  docs/adr/ADR-002-dropped.md — ADR-002: Dropped [Rejected]',
      operator: 'strictEqual',
      diff: 'simple'
    }
  ```
- 2026-11-01 · f9798aac8* · exit 0 · `set -o pipefail …` · acceptance-sha256:6a23ef1f4d0b05bc263d74a9f2af39276ebdfd0f9d4c1c4353258af75ad674d1 · ms:48841
- 2026-11-01 · f9798aac8* · exit 0 · `set -o pipefail …` · acceptance-sha256:6a23ef1f4d0b05bc263d74a9f2af39276ebdfd0f9d4c1c4353258af75ad674d1 · ms:50194
