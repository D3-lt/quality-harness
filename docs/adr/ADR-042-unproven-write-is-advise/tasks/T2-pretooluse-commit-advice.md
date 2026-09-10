# Task ADR-042-T2: PreToolUse commit advice Advises on UNPROVEN write authorship

**Depends-on:** T1
**Covers:** F-2, UC1-S3, UC1-S4
**Estimated scope:** S (one product file plus tests)
**Owner:** zy
**Produces:** none
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1

## Goal

PreToolUse on Bash `git commit` Advises on UNPROVEN write authorship the same way Stop does. Read/Grep-class names do not. `mcp__mrw__mrw_write` remains UNPROVEN, not "no mutation".

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/lifecycle.mjs` | edit | PreToolUse commit advice Advises when `authorship === 'UNPROVEN'` |
| `tests/lifecycle.test.mjs` | edit | PreToolUse `runLifecycleHook` fixtures for the class |
| `docs/INSTALL.md` | edit | user-wired statusline snippet so `QH ✗` is reachable |

## Ordered Steps

1. [S1] Bind the failing tests for the Covers IDs. [proof: acceptance]
2. [S2] PreToolUse on Bash `git commit` Advises when `authorship === 'UNPROVEN'`. [proof: acceptance]

## Acceptance

```bash
node --test --test-name-pattern 'PreToolUse commit advice Advises on UNPROVEN writes|PreToolUse commit advice does not Advise on Read or Grep' tests/lifecycle.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `PreToolUse commit advice Advises on UNPROVEN writes` | `tests/lifecycle.test.mjs` | `mcp__mrw__mrw_write` and `mcp__other__write` stay UNPROVEN with `lastMutation` -1; PreToolUse `git commit` Advises | F-2, UC1-S3 | S1, S2 |
| `PreToolUse commit advice does not Advise on Read or Grep` | `tests/lifecycle.test.mjs` | Read-class names are not UNPROVEN and PreToolUse stays quiet; a native Write still Advises | F-2, UC1-S4 | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | F-2 tests |
| 2 — something selects it | PreToolUse on Bash `git commit` reads `state.authorship` |
| 3 — the caller can discover it | PreToolUse `advise()` stderr / `additionalContext` |
| 4 — it is used | commit after an MCP write |

## Mutation Log

- 2026-09-10 · 8268d8e* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · PreToolUse ignoring authorship leaves an MCP write as a silent commit · acceptance-sha256:15dae1ded4c0ee438f52a68e7c258af6d275c7a0e3bc29151cc4ce4b2bc5f476

## Invariants

- `mcp__mrw__mrw_write` remains `authorship` UNPROVEN, `lastMutation` -1, empty `mutationPaths`.
- Known non-write names do not become UNPROVEN.
- Unknown MCP writes other than `mrw_write` stay UNPROVEN.
- No `layer` field. No `statusLine` in `hooks.json`. No path extractor.

## Risks

- Matching tool names as substrings — use the `tool_use` name set, not a regex over the transcript.
- Asserting only `analyzeTranscript` while PreToolUse still ignores authorship.

## Stop Condition

A green F-1 Stop test while PreToolUse still treats the write as nothing-edited, or a Read/Grep turn that Advises at commit.

## Out of Scope

- `layer` (permanent: boundary: leftover grill)
- Path extractors (permanent: boundary: F-24)
- Setting Claude's `statusLine` (permanent: fact: F-1)

## Notes

Class: Advise surfaces ignore authorship. Sweep 2026-09-10: `rg -n "unverifiedSince\\(state.lastPublish\\)" plugin/scripts/lifecycle.mjs` — PreToolUse at 4054 and Stop at 4084 both read `authorship === 'UNPROVEN'`.

## Verification Log
- 2026-09-10 · 8268d8e* · exit 1 · `node --test --test-name-pattern 'PreToolUse commit advice Advises on UNPROVEN writes|PreToolUse commit advice does not Advise on Read or Grep' tests/lifecycle.test.mjs` · acceptance-sha256:15dae1ded4c0ee438f52a68e7c258af6d275c7a0e3bc29151cc4ce4b2bc5f476 · ms:588
  ```
  --- last 10 line(s) of stdout (of 26 after folding 26 raw)
        at TestContext.<anonymous> (file://~/CursorProjects/quality-harness/tests/lifecycle.test.mjs:2355:12)
        at async Test.run (node:internal/test_runner/test:1113:7)
        at async startSubtestAfterBootstrap (node:internal/test_runner/harness:358:3) {
      generatedMessage: false,
      code: 'ERR_ASSERTION',
      actual: '',
      expected: /would publish unchecked/i,
      operator: 'match',
      diff: 'simple'
    }
  ```
- 2026-09-10 · 8268d8e* · exit 0 · `node --test --test-name-pattern 'PreToolUse commit advice Advises on UNPROVEN writes|PreToolUse commit advice does not Advise on Read or Grep' tests/lifecycle.test.mjs` · acceptance-sha256:15dae1ded4c0ee438f52a68e7c258af6d275c7a0e3bc29151cc4ce4b2bc5f476 · ms:689
