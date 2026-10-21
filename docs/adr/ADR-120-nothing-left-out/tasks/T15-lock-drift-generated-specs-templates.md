# Task ADR-120-T15: Lock drift named at commit; generated specs skipped; the template and skill lines

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** S
**Owner:** Zy
**Produces:** lock drift at the turn end; the spec gate's ignore rule; the template and skill lines
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1

## Goal

When a session's changes move a test body another task locks, the turn end names that task and the relock command; the spec gate skips paths git marks `linguist-generated` or the project lists in `"ignore"`; the task template asks what a test double does not model; the adr-retire skill states the `Archived:` receipt grammar.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/lock-drift-commit.test.mjs` | create | the lock rows (0 locks: new) |
| `tests/spec-ignore.test.mjs` | create | the ignore rows (0 locks: new) |
| `plugin/scripts/artifact-pass.mjs` | edit | for a changed test file, read the corpus's recorded locks (`plugin/lib/record.py`, as `scripts/test-locks.py` does) and advise each done task whose locked body moved |
| `plugin/scripts/facts-gate-dispatch.sh` | edit | skip a path `git check-attr linguist-generated` sets, or one matching the project's `ignore` globs |
| `plugin/scripts/project-config.mjs` | edit | validate `ignore`, as `prose` is validated (:69-98) |
| `plugin/templates/task-template.md` | edit | Risks gains "What the test doubles do not model" |
| `plugin/skills/adr-retire/SKILL.md` | edit | the `Archived: [file](path)` line and what adr-debt reads from it (`plugin/bin/adr-debt:438-457`) |

## Ordered Steps

1. [S1] Write the failing tests and record the red run: a session that edits a test body a done task locks gets one advice line naming the task and `adr-verify --relock --replace-hashes`; an edit to an unlocked test says nothing; a spec under a `linguist-generated` path, or under a listed `ignore` glob, is not gated, and the same spec outside them still is.
2. [S2] Implement the lock-drift advice and the ignore rule.
3. [S3] Add the template line and the skill grammar. [proof: human: the wording, read in the round's review]
4. [S4] Record a killed mutant per mechanism, with catalogue entries. [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/lock-drift-commit.test.mjs tests/spec-ignore.test.mjs 2>&1) \
  && for n in "an edit that moves another task's locked test names the task and the relock" \
      "a generated or ignored spec is not gated, and the same spec elsewhere still is"; do
    test "$(printf '%s\n' "$out" | sed -n 's/^ok [0-9][0-9]* - //p' | grep -cxF -- "$n")" = 1 || exit 1
  done
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `an edit that moves another task's locked test names the task and the relock` | `tests/lock-drift-commit.test.mjs` | lock drift | — | S1, S2 |
| `a generated or ignored spec is not gated, and the same spec elsewhere still is` | `tests/spec-ignore.test.mjs` | the ignore rule | — | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the new tests |
| 2 — something selects it | the hook or gate that calls it; the mutants on that call |
| 3 — the caller can discover it | the advice or output text, and the skill where one is named |
| 4 — it is used | every session or run of the gate in question |

## Mutation Log

## Invariants

- Every locked test keeps its body; new tests go beside locked ones.
- Node and Go agree wherever both implement the rule.

## Risks

- The lock read on every turn end costs time on a large corpus: it runs only when a changed path is a test file a lock names.

## Stop Condition

Stop if reading the locks needs the record grammar loaded in Node: the artifact pass then calls the Python gate, bounded.

## Out of Scope

- An advisory acknowledgement mechanism (permanent: boundary: ADR-037 declined rationing advice that is true each time it fires; a repeated true line is fixed by grouping, as T5 does, or by its cause)

## Verification Log
