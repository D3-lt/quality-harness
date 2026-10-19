# Task ADR-117-T1: A hook-visible write into the state directory is refused

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** M
**Owner:** Zy
**Produces:** the state-directory refusal
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1

## Goal

An Edit, Write, MultiEdit, NotebookEdit or mrw MCP write, or a parsed redirect or `tee` in a Bash or PowerShell command, landing under the session repository's `<git-dir>/quality-harness/`, is refused at PreToolUse on both paths, naming the tool that writes it; `"ledgers": "warn"` warns instead (ADR-117, Decision 1).

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/ledger-writes.test.mjs` | add | the task's test, with a planted twin that must fail |
| `plugin/scripts/publish-verdict.mjs`, `plugin/scripts/on-pre-tool-use.mjs`, `core/hooks/publish.go` | edit | the refusal beside the reviewer guard |
| `plugin/scripts/project-config.mjs`, `core/hooks/checkcmd.go` | edit | the `ledgers` setting |

## Ordered Steps

1. [S1] Write the failing test, with the twins that must pass. Record the red run.
2. [S2] Implement on the Node path and in the Go core, reading redirects from the shell lexer both have.
3. [S3] Record a killed mutant per decision point, with catalogue entries for Node and Python sources; Go mutants through adr-verify with a fence that builds `qh`. [proof: mutation]

## Acceptance

```bash
node --test tests/ledger-writes.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a write into the state directory is refused, and a read of it, the tools' own runs and a write elsewhere are not` | `tests/ledger-writes.test.mjs` | each tool and each redirect form refused, under Node and Go; cat, mrw read, tail, qh-check and adr-verify passing; a write into a sandbox's ledger outside the session repository passing; the opt-out warning | — | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the change |
| 2 — something selects it | the hook, gate or reader that calls it, and the mutant that deletes the call |
| 3 — the caller can discover it | the refusal's or the finding's text |
| 4 — it is used | every session and every gate run |

## Mutation Log

## Invariants

- Gates advise and the sanctioned refusals are the only refusals (CLAUDE.md §3); this task adds only what ADR-117 sanctions.
- Node and the Go core say the same thing at each commit.

## Risks

- A path spelled through a symlink or `..` reaches the directory: canonicalise as `recordFileWritten` does.

## Stop Condition

Stop if a reading command is refused in the twin table.

## Out of Scope

- A program that writes a ledger itself (permanent: boundary: a hook sees tool calls and command text, not what a program does)

## Verification Log
