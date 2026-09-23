# Task ADR-042-T3: UNPROVEN write after a published Bash or native mutation still Advises

**Depends-on:** T2
**Covers:** F-2, UC1-S5, UC1-S6, UC1-S7
**Estimated scope:** S (positional lastUnprovenWrite; PreToolUse git commit)
**Owner:** zy
**Produces:** none
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1

## Goal

PreToolUse on Bash `git commit` Advises when `lastUnprovenWrite > lastPublish`, including after a prior Bash mutation or native Write in the same session. A first-write-only fixture is not enough. Read after a published UNPROVEN write stays quiet because of that boundary, not because `git commit` overwrote the authorship scalar.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/lifecycle.mjs` | edit | record `lastUnprovenWrite`; Advise when it is after `lastPublish` |
| `plugin/scripts/statusline.mjs` | edit | the same positional gate as Stop / PreToolUse |
| `tests/lifecycle.test.mjs` | edit | S3/S5 dirty after publish; S4 quiet for the publish-boundary reason |

## Ordered Steps

1. [S1] Bind the failing tests for the Covers IDs. [proof: acceptance]
2. [S2] Record `lastUnprovenWrite` on every executed write-shaped unknown, not only while `authorship === 'none'`. [proof: acceptance]
3. [S3] PreToolUse on Bash `git commit` Advises when `lastUnprovenWrite > lastPublish`. [proof: acceptance]

## Acceptance

```bash
node --test --test-name-pattern 'PreToolUse commit advice Advises on mrw_write after a published|PreToolUse commit advice stays quiet after a published UNPROVEN' tests/lifecycle.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `PreToolUse commit advice Advises on mrw_write after a published Bash mutation` | `tests/lifecycle.test.mjs` | Bash write, commit, `mrw_write`, PreToolUse `git commit` Advises; published Bash without the MCP write stays quiet | F-2, UC1-S5 | S1, S2, S3 |
| `PreToolUse commit advice Advises on mrw_write after a published native Write` | `tests/lifecycle.test.mjs` | Write, commit, `mrw_write`, PreToolUse `git commit` Advises; published Write without the MCP write stays quiet | F-2, UC1-S6 | S1, S2, S3 |
| `PreToolUse commit advice stays quiet after a published UNPROVEN write then Read` | `tests/lifecycle.test.mjs` | `lastUnprovenWrite <= lastPublish` after commit+Read; a later `mrw_write` still Advises | F-2, UC1-S7 | S1, S2, S3 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | F-2 tests through `runLifecycleHook` PreToolUse |
| 2 — something selects it | PreToolUse on Bash `git commit` reads `lastUnprovenWrite > lastPublish` |
| 3 — the caller can discover it | PreToolUse `advise()` stderr / `additionalContext` |
| 4 — it is used | commit after an MCP write in a session that already mutated |

## Mutation Log

- 2026-09-10 · fa47900* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · PreToolUse ignoring lastUnprovenWrite leaves an MCP write after a published Bash or native mutation as a silent commit · acceptance-sha256:3260902c5b4e27d0b10c9061fd1adff58889ab8b66c5dc2ddbfa953bd07fb4bf

## Invariants

- `mcp__mrw__mrw_write` remains `authorship` UNPROVEN when it is the first authoring act, `lastMutation` -1, empty `mutationPaths`.
- Known non-write names do not set `lastUnprovenWrite`.
- A published UNPROVEN write does not re-Advise a later Read.
- No `layer` field. No `statusLine` in `hooks.json`. No path extractor.

## Risks

- Asserting only `analyzeTranscript` while PreToolUse still keys the authorship scalar.
- A first-write-only fixture that stays green while a later MCP write is silent.

## Stop Condition

A green T2 first-write test while Bash-write → commit → `mrw_write` → commit is silent, or a Read after a published UNPROVEN write that Advises because UNPROVEN was kept sticky.

## Out of Scope

- `layer` (permanent: boundary: leftover grill)
- Path extractors (permanent: boundary: F-24)
- Setting Claude's `statusLine` (permanent: fact: F-1)

## Notes

Class: Advise keyed on session-wide `authorship === 'UNPROVEN'`. Sweep 2026-09-10: `rg -n "authorship === 'UNPROVEN'|lastUnprovenWrite" plugin/scripts/lifecycle.mjs plugin/scripts/statusline.mjs`. Live miss: wcag Case A against HEAD fa47900.

## Verification Log
- 2026-09-10 · fa47900* · exit 0 · `node --test --test-name-pattern 'PreToolUse commit advice Advises on mrw_write after a published|PreToolUse commit advice stays quiet after a published UNPROVEN' tests/lifecycle.test.mjs` · acceptance-sha256:3260902c5b4e27d0b10c9061fd1adff58889ab8b66c5dc2ddbfa953bd07fb4bf · ms:470
- 2026-09-10 · fa47900* · exit 0 · `node --test --test-name-pattern 'PreToolUse commit advice Advises on mrw_write after a published|PreToolUse commit advice stays quiet after a published UNPROVEN' tests/lifecycle.test.mjs` · acceptance-sha256:3260902c5b4e27d0b10c9061fd1adff58889ab8b66c5dc2ddbfa953bd07fb4bf · ms:358
