# Task ADR-100-T5: CLAUDE.md §12 and §13 point at the commands that now carry their procedure

**Depends-on:** T2, T3, T4
**Covers:** none — no spec
**Estimated scope:** S (the rulebook and two rule files)
**Owner:** unassigned
**Produces:** none
**Consumes:** `qh-check --commit` (T2), `scripts/release.mjs` (T3), `scripts/fast-check.mjs` (T4)
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** none — the fence greps one file for the commands and the anchors

## Goal

The rulebook says to run the commands, keeps every cited heading, and moves the procedure's evidence into the rule files.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `CLAUDE.md` | edit | §12 names the launcher and its record; §13's steps become `node scripts/release.mjs` and what it stops for; §2's commit lines name `qh-check --commit` |
| `.claude/rules/12-reviews.md`, `.claude/rules/13-releasing.md` | edit | the evidence the shortened sections no longer carry |
| `AGENTS.md` | edit, if it restates a changed rule | its "never chain a commit after a test" line names the one sanctioned chain |

## Ordered Steps

1. [S1] Run the Acceptance fence red (the commands are not named yet). [proof: acceptance]
2. [S2] Edit §2, §12 and §13, keeping `## 12. Reviews` and `## 13. Releasing` and every rule a record cites by number. [proof: acceptance]
3. [S3] Move the evidence to the rule files; state no counts (CLAUDE.md's own rule). [proof: human: the reviewer reads the diff and finds no procedure step dropped without a command or a rule file carrying it]

## Acceptance

```bash
grep -qE '^## 12\. Reviews$' CLAUDE.md && grep -qE '^## 13\. Releasing$' CLAUDE.md \
  && grep -q 'node scripts/release.mjs' CLAUDE.md && grep -q 'qh-check --commit' CLAUDE.md \
  && grep -q 'reviews.jsonl' CLAUDE.md && node --test tests/package.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `nothing tracked in this repository names a personal filesystem path` | `tests/package.test.mjs` | existing, unchanged: the edited files name no home path | — | S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the edited sections |
| 2 — something selects it | CLAUDE.md is loaded into every session here |
| 3 — the caller can discover it | the section anchors records cite |
| 4 — it is used | nothing measures this yet |

## Mutation Log

## Invariants

- Every `CLAUDE.md §N` a record or source comment cites still resolves to a heading.

## Risks

- A rule shortened past what the command enforces: S3's human proof reads the diff for it.

## Stop Condition

Stop and ask if a §13 step has no command or rule file to carry it after T3.

## Out of Scope

- Any section other than §2, §12 and §13.

## Verification Log
