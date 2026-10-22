# Task ADR-124-T2: SessionStart keeps one pointer at the running plugin and names a dangling agent link

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** S
**Owner:** Zy
**Produces:** the `current` pointer
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1

## Goal

At every SessionStart, `$CLAUDE_PLUGIN_DATA/current` points at the running plugin root, replaced atomically only when it
differs; a link the manifest lists whose target is missing is named once per change, and a manifest recording another data
directory is named once, with the command that repairs both.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/agents-pointer.test.mjs` | create | a temporary home and data directory per test (0 locks: new) |
| `plugin/scripts/on-session-start.mjs` | edit | the refresh and the dangling check |
| `plugin/scripts/standalone-link.mjs` | edit | `agentManifest(home)`: the links `--agents` wrote, their targets and their data directory |
| `tests/mutations/plugin/scripts/on-session-start.mjs.json` | edit | one entry per mechanism |

## Ordered Steps

1. [S1] Write the failing tests and record the red run: with no pointer, SessionStart creates it at the plugin root; with a pointer
   at an older root, it is repointed and the old root is untouched; with the pointer already right, nothing is written (the
   link's inode is unchanged); a regular file or a directory at `current` is left alone and named; with `CLAUDE_PLUGIN_DATA`
   unset nothing is written and nothing is said; a listed link whose target is missing is named once, and not again until the set
   changes; a manifest recording data directory A, read in a session whose data directory is B, is named once with the repair
   command and nothing outside B is written; a link the manifest does not list is never named. Path comparisons take the
   platform as a parameter (CLAUDE.md §7), with a Windows case for each.
2. [S2] The refresh: a temporary link beside `current`, then a rename over it.
3. [S3] The dangling and moved checks, from the manifest, with their once-per-change state in the plugin's data directory.
4. [S4] Record a killed mutant per mechanism, with catalogue entries. [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/agents-pointer.test.mjs 2>&1) \
  && for n in "the pointer follows the running plugin and is written only when it differs" \
      "a dangling agent link is named once per change" \
      "a moved data directory is named with its repair, and nothing outside it is written" \
      "what the plugin did not write is left alone"; do
    test "$(printf '%s\n' "$out" | sed -n 's/^ok [0-9][0-9]* - //p' | grep -cxF -- "$n")" = 1 || exit 1
  done
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `the pointer follows the running plugin and is written only when it differs` | `tests/agents-pointer.test.mjs` | create, repoint, unchanged, unset data | — | S1, S2 |
| `a dangling agent link is named once per change` | `tests/agents-pointer.test.mjs` | the check and its state | — | S1, S3 |
| `a moved data directory is named with its repair, and nothing outside it is written` | `tests/agents-pointer.test.mjs` | A then B | — | S1, S3 |
| `what the plugin did not write is left alone` | `tests/agents-pointer.test.mjs` | a file at `current`; a user's own link | — | S1, S2, S3 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the new tests |
| 2 — something selects it | `hooks.json` SessionStart runs `on-session-start.mjs` |
| 3 — the caller can discover it | the dangling line names its repair |
| 4 — it is used | T3's links resolve through it |

## Mutation Log

## Invariants

- Nothing outside `$CLAUDE_PLUGIN_DATA` is written at SessionStart.
- Nothing is refused.

## Risks

- What the test doubles do not model: Windows link creation; T4 measures it, and a failure there is said, not hidden.

## Stop Condition

Stop if the rename cannot replace a link atomically on a supported platform: the owner decides whether a non-atomic replace is acceptable there.

## Out of Scope

- Writing the agent links (T3).

## Verification Log
