# Task ADR-124-T3: `--link --agents` links every skill under the shared directory through the pointer

**Depends-on:** T1, T2
**Covers:** none — no spec
**Estimated scope:** M
**Owner:** Zy
**Produces:** `--link --agents`
**Consumes:** the measured host list and the Claude Code verdict (T1); the `current` pointer (T2)
**Data dependency:** hermetic
**Proof map:** v1

## Goal

`sync-standalone.mjs --link --agents` reports, and with `--apply` writes, one link per shipped skill at
`~/.agents/skills/<name>` → `$CLAUDE_PLUGIN_DATA/current/skills/<name>` and the manifest that records them, creating a link only
where nothing exists and replacing only a link the manifest owns, and still writes no skill under any path Claude Code serves.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/agents-link.test.mjs` | create | a temporary home per test (0 locks: new) |
| `plugin/scripts/standalone-link.mjs` | edit | the `skill-agents` kind in `linkPlan()` under `agents`; ownership by the manifest, not `replaceable()`; a link branch in `currentState()` and `write()`, archive first |
| `plugin/scripts/sync-standalone.mjs` | edit | the `--agents` flag, its usage line, its report |
| `plugin/skills/operating/SKILL.md` | edit | the measured host list (T1) and the command |
| `tests/mutations/plugin/scripts/standalone-link.mjs.json` | edit | one entry per mechanism |

## Ordered Steps

1. [S1] Write the failing tests and record the red run: `--link --agents` without `--apply` lists one link per shipped skill and
   writes nothing; with `--apply` each link exists, resolves through `current`, and is in the manifest; a user's own
   `~/.agents/skills/<name>` directory is left and named, including one whose SKILL.md frontmatter `name` matches and whose
   content differs; a link the manifest does not list is left and named; a link already right is reported unchanged; a manifest
   recording data directory A, run with B, repoints every listed link to B and updates the manifest; `--agents` without
   `--link` is a usage error (exit 2); `--link` alone still writes no skill anywhere (ADR-001's test stays green); no plan
   entry's destination is under `~/.claude`; a link whose creation fails is named with the reason and nothing is copied in its
   place; the existing forwarder writes are unchanged.
2. [S2] `linkPlan()`, the ownership rule, the link branch of `currentState()` and `write()`, the manifest, and the flag.
3. [S3] The operating skill's host list and command.
4. [S4] Record a killed mutant per mechanism, with catalogue entries. [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/agents-link.test.mjs 2>&1) \
  && for n in "every skill is linked once under the shared directory through the pointer" \
      "nothing Claude Code serves is linked, and nothing the user owns is touched" \
      "a link that cannot be made is said, never copied" \
      "the operating skill names the command and every measured host"; do
    test "$(printf '%s\n' "$out" | sed -n 's/^ok [0-9][0-9]* - //p' | grep -cxF -- "$n")" = 1 || exit 1
  done
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `every skill is linked once under the shared directory through the pointer` | `tests/agents-link.test.mjs` | report, apply, unchanged, usage | — | S1, S2 |
| `nothing Claude Code serves is linked, and nothing the user owns is touched` | `tests/agents-link.test.mjs` | ADR-001's rule; `replaceable()` | — | S1, S2 |
| `a link that cannot be made is said, never copied` | `tests/agents-link.test.mjs` | the failure path | — | S1, S2 |
| `the operating skill names the command and every measured host` | `tests/agents-link.test.mjs` | the skill text against T1's list in the record | — | S3 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the new tests |
| 2 — something selects it | the `--agents` flag in `sync-standalone.mjs`'s argument check |
| 3 — the caller can discover it | the usage line and the operating skill |
| 4 — it is used | T4 |

## Mutation Log

## Invariants

- No skill is ever written under a path Claude Code serves.
- A user's own entry is never replaced.

## Risks

- What the test doubles do not model: a host's loader; T1 and T4 observe it.

## Stop Condition

Stop if T1's Claude Code verdict is that it reads `~/.agents/skills` (ADR-124 Decision 5).

## Out of Scope

- Project-scope links (permanent: boundary: ADR-124 Out of Scope).

## Verification Log
