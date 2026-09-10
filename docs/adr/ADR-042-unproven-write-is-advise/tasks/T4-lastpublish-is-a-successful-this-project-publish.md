# Task ADR-042-T4: lastPublish advances only on a successful this-project publish

**Depends-on:** T3
**Covers:** F-3, UC1-S8, UC1-S9
**Estimated scope:** S (lastPublish guard; PreToolUse git commit)
**Owner:** zy
**Produces:** none
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `lastPublish requires a successful this-project publish`

## Goal

PreToolUse on Bash `git commit` still Advises when unverified work stands after a failed local commit or after a commit/push whose git directory is another repository. `lastPublish` advances only when a this-project publish command succeeded.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/lifecycle.mjs` | edit | `lastPublish` requires `commandSucceeded` and `gitPublishTargetsThisProject` |
| `tests/lifecycle.test.mjs` | edit | PreToolUse `runLifecycleHook` fixtures for failed commit and foreign `-C` |

## Ordered Steps

1. [S1] Bind the failing tests for the Covers IDs. [proof: acceptance]
2. [S2] Advance `lastPublish` only when the publish command succeeded. [proof: acceptance]
3. [S3] Count a publish only when git's directory is this project (`-C` / `--git-dir` / `--work-tree` / `cd`, same resolution as the mutation side). [proof: acceptance]

## Acceptance

```bash
node --test --test-name-pattern 'PreToolUse commit advice still Advises after a failed git commit|PreToolUse commit advice still Advises after a foreign git -C commit' tests/lifecycle.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `PreToolUse commit advice still Advises after a failed git commit` | `tests/lifecycle.test.mjs` | is_error / no-result commit leaves `lastUnprovenWrite > lastPublish`; PreToolUse Advises; a successful local commit still silences | F-3, UC1-S8 | S1, S2 |
| `PreToolUse commit advice still Advises after a foreign git -C commit` | `tests/lifecycle.test.mjs` | `-C`, `--git-dir`/`--work-tree`, `push`, relative `../..`, and an errored foreign commit do not move `lastPublish`; `echo git commit` / heredoc are not publishes; a successful local commit still silences | F-3, UC1-S9 | S1, S3 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | F-3 tests through `runLifecycleHook` PreToolUse and `analyzeTranscript` |
| 2 — something selects it | `analyzeTranscript` lastPublish; PreToolUse reads `lastUnprovenWrite > lastPublish` |
| 3 — the caller can discover it | PreToolUse `advise()` stderr / `additionalContext` |
| 4 — it is used | a failed local commit or a commit in another repo must not silence the next local commit |

## Mutation Log

- 2026-09-10 · 5860b5b* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · a failed or foreign git commit would again move lastPublish and silence the next local commit · acceptance-sha256:3602be621089dbd412768c46cc23d031199348ce45a313fc6624804e04223fbc · covers:lastPublish requires a successful this-project publish

## Invariants

- `mcp__mrw__mrw_write` remains `authorship` UNPROVEN when it is the first authoring act, `lastMutation` -1, empty `mutationPaths`.
- A successful this-project `git commit` still moves `lastPublish`.
- `echo git commit` and a commit inside a heredoc body are not publishes.
- No `layer` field. No `statusLine` in `hooks.json`. No path extractor.

## Risks

- Asking only "did a git commit command run?" rather than "did this project get published?".
- Treating an `is_error` result as executed, so a failing commit silences the next one.

## Stop Condition

A green T3 published-write test while two failed `git commit`s, or a `git -C` other-repo commit, leave the next local commit silent.

## Out of Scope

- `layer` (permanent: boundary: leftover grill)
- Path extractors (permanent: boundary: F-24)
- Setting Claude's `statusLine` (permanent: fact: F-1)
- Reverse ADR-038–044 (permanent: boundary: Read/Grep still silent; F-24 UNPROVEN write; layer never session)

## Notes

Class: lastPublish moved on a failed commit and on a foreign git directory. Sweep 2026-09-10: live wcag against installed 5860b5b; `executed()` at the Bash publish branch; `isGitPublishCommand` parsed subcommands only.

## Verification Log
- 2026-09-10 · 5860b5b* · exit 0 · `node --test --test-name-pattern 'PreToolUse commit advice still Advises after a failed git commit|PreToolUse commit advice still Advises after a foreign git -C commit' tests/lifecycle.test.mjs` · acceptance-sha256:3602be621089dbd412768c46cc23d031199348ce45a313fc6624804e04223fbc · ms:892
