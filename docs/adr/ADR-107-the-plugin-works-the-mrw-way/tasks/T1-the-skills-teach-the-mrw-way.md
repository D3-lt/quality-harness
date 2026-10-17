# Task ADR-107-T1: The implementing skills teach the mrw way

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** S (one skill section, two pointers, one test)
**Owner:** unassigned
**Produces:** the section `## Read and edit in batches` in `plugin/skills/execution/SKILL.md`
**Consumes:** none
**Proof map:** v1

## Goal

An agent that reads the `execution` skill is told to plan its reads and edits as batches, to check that every edit landed,
and to use `mrw` when it is on PATH; `adr-execute` and `work` point to that section (ADR-107, Decision 1).

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/skills/execution/SKILL.md` | edit | the section `## Read and edit in batches` |
| `plugin/skills/adr-execute/SKILL.md` | edit | one line in its Implement step pointing to that section |
| `plugin/skills/work/SKILL.md` | edit | one line pointing to that section |
| `tests/mrw-way.test.mjs` | add | the test below |
| `tests/mutations/plugin/skills/execution/SKILL.md.json` | add | the catalogue mutant |

## Ordered Steps

1. [S1] Add the test below and record the red run (TDD red: the section does not exist).
2. [S2] Write the section in `execution`: one read of every site; one batch of edits; count before reading; one
   substitution for one change at many sites; check every edit landed, and an edit that matched nothing is a failure; read
   a refusal and fix its cause; use `mrw` when it is on PATH. At most twelve lines.
3. [S3] Point `adr-execute`'s Implement step and `work` to it by its heading.
4. [S4] Add the catalogue mutant (the section's heading renamed) and record a killed mutant. [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/mrw-way.test.mjs 2>&1) \
  && test "$(printf '%s\n' "$out" | grep -cxE "ok [0-9]+ - the implementing skills teach one read of every site, one batch of edits, and a check that each edit landed")" = 1 \
  && ! printf '%s\n' "$out" | grep -q '# SKIP'
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `the implementing skills teach one read of every site, one batch of edits, and a check that each edit landed` | `tests/mrw-way.test.mjs` | `execution` carries the section with each of its rules; `adr-execute` and `work` name the section's heading, and the heading exists, so a renamed section turns both red; no skill copies the section's text | — | S1, S2, S3 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the section in `execution` |
| 2 — something selects it | `adr-execute` and `work` point to it |
| 3 — the caller can discover it | a spawned implementer is given `execution` |
| 4 — it is used | ADR-084's skill-usage count, and T4 |

## Mutation Log

## Invariants

- The section is in one skill; the others point to it.
- The skill does not require `mrw`.

## Risks

- None beyond ADR-107's.

## Stop Condition

Stop and ask if the section cannot be written in twelve lines without dropping one of its rules.

## Out of Scope

- Hook text for every session (deferred: T4)

## Verification Log
