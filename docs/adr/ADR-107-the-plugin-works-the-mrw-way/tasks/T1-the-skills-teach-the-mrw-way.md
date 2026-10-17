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
- 2026-10-17 · 8dcaa273* · mutant killed · exit 1 · `plugin/skills/execution/SKILL.md` · the section an implementer is pointed to would be gone, and the skills pointing to it would point at nothing · acceptance-sha256:ff04f23ae64277269f6063c3c92be96910aadca2aea4087a9b61828e0fd6454b

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
- 2026-10-17 · 8dcaa273* · exit 1 · `out=$(node --test --test-reporter=tap tests/mrw-way.test.mjs 2>&1) \ …` · acceptance-sha256:ff04f23ae64277269f6063c3c92be96910aadca2aea4087a9b61828e0fd6454b · ms:231 · test-lock-sha256:22bbebcf767e3a4bb185a7497d7f67ce005b2cc3a87fd793da0456654abe1dd0 · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvbXJ3LXdheS50ZXN0Lm1qcwl0aGUgaW1wbGVtZW50aW5nIHNraWxscyB0ZWFjaCBvbmUgcmVhZCBvZiBldmVyeSBzaXRlLCBvbmUgYmF0Y2ggb2YgZWRpdHMsIGFuZCBhIGNoZWNrIHRoYXQgZWFjaCBlZGl0IGxhbmRlZAlhZDcxMTZiM2FlOTEyM2ZlOWUzMDRjMDIxMDZmMjUzNDJhMjUxYWYzYmU4MzFiNzc3NzA3YzVlMGNkNWE0NTAw
  ```
  ```
- 2026-10-17 · 8dcaa273* · exit 0 · `out=$(node --test --test-reporter=tap tests/mrw-way.test.mjs 2>&1) \ …` · acceptance-sha256:ff04f23ae64277269f6063c3c92be96910aadca2aea4087a9b61828e0fd6454b · ms:269
