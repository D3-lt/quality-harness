# Task ADR-042-T1: Advise on UNPROVEN write authorship, not every UNPROVEN tool_use

**Depends-on:** none
**Covers:** F-1, UC1-S1, UC1-S2
**Estimated scope:** S (two product files plus tests)
**Owner:** zy
**Produces:** none
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1

## Goal

Stop, `sessionStateNote`, and `statusline.mjs` `reading()` Advise on UNPROVEN write authorship. Read/Grep and the other executed non-write names do not. `mcp__mrw__mrw_write` remains UNPROVEN, not "no mutation".

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/lifecycle.mjs` | edit | skip known non-write names for UNPROVEN; Stop and `sessionStateNote` Advise on remaining UNPROVEN |
| `plugin/scripts/statusline.mjs` | edit | `reading()` is not `kind: nothing` for UNPROVEN write |
| `tests/lifecycle.test.mjs` | add | Stop / `sessionStateNote` / `reading()` fixtures for the class |

## Ordered Steps

1. [S1] Bind the failing tests for the Covers IDs. [proof: acceptance]
2. [S2] Skip the executed known non-write names when setting `authorship` UNPROVEN; keep unknown non-Bash non-`MUTATION_TOOLS` UNPROVEN. [proof: acceptance]
3. [S3] Stop / SubagentStop / TaskCompleted, `sessionStateNote`, and `reading()` Advise when `authorship === 'UNPROVEN'`. [proof: acceptance]

## Acceptance

```bash
node --test --test-name-pattern 'an unknown non-Bash write is Advise, not nothing edited|Read or Grep is not Advise every turn' tests/lifecycle.test.mjs && node --test --test-name-pattern 'an MCP write is UNPROVEN authorship, not no mutation' tests/staged-product.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `an unknown non-Bash write is Advise, not nothing edited` | `tests/lifecycle.test.mjs` | `mcp__mrw__mrw_write` and `mcp__other__write` stay UNPROVEN with `lastMutation` -1; Stop / `sessionStateNote` / `reading()` Advise; `hooks.json` has no `statusLine` | F-1, UC1-S1 | S1, S2, S3 |
| `Read or Grep is not Advise every turn` | `tests/lifecycle.test.mjs` | Read-class names are not UNPROVEN and the three surfaces stay quiet; a native Write still Advises | F-1, UC1-S2 | S1, S2, S3 |
| `an MCP write is UNPROVEN authorship, not no mutation` | `tests/staged-product.test.mjs` | F-24: `mcp__mrw__mrw_write` is UNPROVEN, not `lastMutation` meaning no edits | F-1 | S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | F-1 tests |
| 2 — something selects it | Stop / `sessionStateNote` / `reading()` read `state.authorship` |
| 3 — the caller can discover it | user-wired `statusline.mjs`; Stop `systemMessage`; PreCompact note |
| 4 — it is used | Stop after an MCP write; statusline render of that transcript |

## Mutation Log

- 2026-09-10 · fe58ac7* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · dropping the known-non-write skip makes Read UNPROVEN and Advises every Read turn · acceptance-sha256:e975823e1edd2e97a2120df781a430b31d78b83072447d200980b2435e8096d0
- 2026-09-10 · fe58ac7* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · Stop ignoring authorship leaves an MCP write as silent nothing-edited · acceptance-sha256:e975823e1edd2e97a2120df781a430b31d78b83072447d200980b2435e8096d0
- 2026-09-10 · fe58ac7* · mutant killed · exit 1 · `plugin/scripts/statusline.mjs` · statusline reading() ignoring authorship leaves an MCP write as kind nothing · acceptance-sha256:e975823e1edd2e97a2120df781a430b31d78b83072447d200980b2435e8096d0

## Invariants

- `mcp__mrw__mrw_write` remains `authorship` UNPROVEN, `lastMutation` -1, empty `mutationPaths`.
- Known non-write names do not become UNPROVEN.
- Unknown MCP writes other than `mrw_write` stay UNPROVEN.
- No `layer` field. No `statusLine` in `hooks.json`. No path extractor.

## Risks

- Matching tool names as substrings — use the `tool_use` name set, not a regex over the transcript.
- Using `READ_ONLY_CHILD` as this denylist.

## Stop Condition

A green F-24 MCP test while Stop / `sessionStateNote` / `reading()` still treat the write as nothing-edited, or a Read/Grep turn that Advises.

## Out of Scope

- PreToolUse commit advice (permanent: boundary: sibling left out)
- `layer` (permanent: boundary: leftover grill)
- Path extractors (permanent: boundary: F-24)

## Notes

Class: Advise surfaces ignore authorship. Sweep: `rg -n "authorship = 'UNPROVEN'|unverifiedSince\\(state.lastPublish\\)" plugin/scripts/lifecycle.mjs plugin/scripts/statusline.mjs`. Siblings: PreToolUse at 4044 (left).

## Verification Log
- 2026-09-10 · fe58ac7* · exit 1 · `node --test --test-name-pattern 'an unknown non-Bash write is Advise, not nothing edited|Read or Grep is not Advise every turn' tests/lifecycle.test.mjs && node --test --test-name-pattern 'an MCP write is UNPROVEN authorship, not no mutation' tests/staged-product.test.mjs` · acceptance-sha256:e975823e1edd2e97a2120df781a430b31d78b83072447d200980b2435e8096d0 · ms:317
  ```
  --- last 10 line(s) of stdout (of 43 after folding 43 raw)
        at TestContext.<anonymous> (file://~/CursorProjects/quality-harness/tests/lifecycle.test.mjs:2312:12)
        at async Test.run (node:internal/test_runner/test:1113:7)
        at async Test.processPendingSubtests (node:internal/test_runner/test:788:7) {
      generatedMessage: false,
      code: 'ERR_ASSERTION',
      actual: 'UNPROVEN',
      expected: 'UNPROVEN',
      operator: 'notStrictEqual',
      diff: 'simple'
    }
  ```
- 2026-09-10 · fe58ac7* · exit 0 · `node --test --test-name-pattern 'an unknown non-Bash write is Advise, not nothing edited|Read or Grep is not Advise every turn' tests/lifecycle.test.mjs && node --test --test-name-pattern 'an MCP write is UNPROVEN authorship, not no mutation' tests/staged-product.test.mjs` · acceptance-sha256:e975823e1edd2e97a2120df781a430b31d78b83072447d200980b2435e8096d0 · ms:751
- 2026-09-10 · fe58ac7* · exit 0 · `node --test --test-name-pattern 'an unknown non-Bash write is Advise, not nothing edited|Read or Grep is not Advise every turn' tests/lifecycle.test.mjs && node --test --test-name-pattern 'an MCP write is UNPROVEN authorship, not no mutation' tests/staged-product.test.mjs` · acceptance-sha256:e975823e1edd2e97a2120df781a430b31d78b83072447d200980b2435e8096d0 · ms:658
- 2026-09-10 · fe58ac7* · exit 0 · `node --test --test-name-pattern 'an unknown non-Bash write is Advise, not nothing edited|Read or Grep is not Advise every turn' tests/lifecycle.test.mjs && node --test --test-name-pattern 'an MCP write is UNPROVEN authorship, not no mutation' tests/staged-product.test.mjs` · acceptance-sha256:e975823e1edd2e97a2120df781a430b31d78b83072447d200980b2435e8096d0 · ms:623
