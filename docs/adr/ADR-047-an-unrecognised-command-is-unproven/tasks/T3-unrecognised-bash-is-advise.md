# Task ADR-047-T3: Unrecognised Bash advances lastUnprovenWrite

**Depends-on:** T1
**Covers:** F-2, UC2-S1, UC2-S2
**Estimated scope:** S (analyzeTranscript plus hook surfaces)
**Owner:** zy
**Produces:** unrecognised Bash → lastUnprovenWrite
**Consumes:** `classifyCommand` four-way result
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `lastUnprovenWrite`

## Goal

An executed unrecognised Bash command advances `lastUnprovenWrite` the same way `mcp__mrw__mrw_write` does. Stop, `sessionStateNote`, the wired statusline, and PreToolUse commit advice Advise. Isolated `echo` / `ls` do not. A classify-only green is not this fact.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/lifecycle.mjs` | edit | executed unrecognised Bash sets `lastUnprovenWrite`; `isKnownProbePrefix` does not peel unrecognised |
| `tests/lifecycle.test.mjs` | edit | Stop / note / reading / PreToolUse fixtures at the hook boundary |

## Ordered Steps

1. [S1] Bind the failing tests for the Covers IDs. [proof: acceptance]
2. [S2] Map `classifyCommand === 'unrecognised'` onto `lastUnprovenWrite` / authorship UNPROVEN, not `lastMutation`. [proof: acceptance]
3. [S3] Assert Stop, `sessionStateNote`, `reading()`, and PreToolUse `git commit` through `runLifecycleHook`. [proof: acceptance]

## Acceptance

```bash
node --test --test-name-pattern 'unrecognised Bash is Advise the same way an MCP write is|echo is not Advise, and a classify-only green is not this fact' tests/lifecycle.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `unrecognised Bash is Advise the same way an MCP write is` | `tests/lifecycle.test.mjs` | executed Remove-Item: lastUnprovenWrite set, authorship UNPROVEN, lastMutation -1; Stop systemMessage; note not nothing-edited; reading not kind nothing; PreToolUse commit Advises; same surfaces on mcp__mrw__mrw_write | F-2, UC2-S1 | S1, S2, S3 |
| `echo is not Advise, and a classify-only green is not this fact` | `tests/lifecycle.test.mjs` | echo lastUnprovenWrite -1; surfaces silent; executed Remove-Item still Advises | F-2, UC2-S2 | S1, S2, S3 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | F-2 tests |
| 2 — something selects it | `analyzeTranscript` Bash executed path reads `classifyCommand` |
| 3 — the caller can discover it | Stop / PreToolUse / `sessionStateNote` / `reading()` already key `lastUnprovenWrite` |
| 4 — it is used | Stop after Remove-Item |

## Mutation Log
- 2026-09-12 · 06479cf* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · unrecognised Bash no longer advances lastUnprovenWrite; Stop stays silent like echo · acceptance-sha256:3431f26cf60d35c49ccaeb7a6bf769e5f1c012a1a584fda0516a905e03f90fbf · covers:lastUnprovenWrite

## Verification Log
- 2026-09-12 · 06479cf* · exit 0 · `node --test --test-name-pattern 'unrecognised Bash is Advise the same way an MCP write is|echo is not Advise, and a classify-only green is not this fact' tests/lifecycle.test.mjs` · acceptance-sha256:3431f26cf60d35c49ccaeb7a6bf769e5f1c012a1a584fda0516a905e03f90fbf · ms:410

## Invariants

- Unrecognised Bash is not `lastMutation` (that is POSIX `rm`).
- Isolated `echo` / `ls` do not advance `lastUnprovenWrite`.
- `mcp__mrw__mrw_write` still Advises.

## Risks

- A green F-1 classify test while `analyzeTranscript` still keys `isPotentialMutationCommand`.
- Treating `echo` as unrecognised Advises every probe (ADR-041 reversed).

## Stop Condition

Classify(Remove-Item) === unrecognised while Stop stays silent, or echo Advises.

## Out of Scope

- reviewer deny (T4)
- `is_error` as UNPROVEN write (permanent: boundary: Non-Goal)
- MCP write + passing check (permanent: boundary: sibling spec)
