# Task ADR-120-T8: A withdrawn task reads stopped, and a sign-off covers the steps it names

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** S
**Owner:** Zy
**Produces:** `classify` reading a terminal Status before evidence; `unsigned_human_proof_steps` per step; the template sentence
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1

## Goal

A task whose own `**Status:**` is a terminal word reads `stopped` with or without exit-0 evidence, a human sign-off that names
`S<n>` clears the unsigned advice for that step only, and the README template states the cell words adr-lint accepts.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/adr-next-terminal.test.mjs` | create | the rows below, with twins (0 locks: new) |
| `plugin/bin/adr-next` | edit | `classify` (:1370-1384) checks a terminal Status (`status_stop`, :525-547) before `done`; the docstring at :22-24 already promises it |
| `plugin/lib/record.py` | edit | `unsigned_human_proof_steps` (:1217-1226): a sign-off note naming `S<n>` as a word covers that step; one naming none covers all |
| `plugin/templates/tasks-readme-template.md` | edit | :50-52: a cell may carry the task file's terminal word; the gates route on the file |
| `tests/adr-next.test.mjs`, `tests/gates.test.mjs` | read | their locks stay byte-identical: `python3 scripts/test-locks.py` on each first |
| `tests/mutations/plugin/bin/adr-next.json`, `tests/mutations/plugin/lib/record.py.json` | edit | one entry per mechanism |

## Ordered Steps

1. [S1] Run `python3 scripts/test-locks.py tests/adr-next.test.mjs` and on `tests/gates.test.mjs`, then write the failing tests and record the red run. Terminal: a task whose Status is `Withdrawn 2026-09-02 by ADR-002`, with a red then an exit-0 row, reads `stopped` with its reason; the same with no rows reads `stopped`; twin, a task whose Status is `done` with the same rows reads `done`. Steps: S2, S3 and S4 each `[proof: human: …]` and one sign-off naming `S2` advise S3 and S4 and not S2; a sign-off naming no step advises none; a sign-off naming `S2 and S4` advises S3 only; `S20` does not cover `S2`.
2. [S2] In `classify`, read a terminal Status first and put the task in `stopped`, before the `done` branch.
3. [S3] In `unsigned_human_proof_steps`, collect the step ids each sign-off note names as words; a note naming none covers all.
4. [S4] Add the template sentence. [proof: human: the template's wording, read in the round's review]
5. [S5] Record a killed mutant per mechanism, with catalogue entries, and run `node scripts/mutate.mjs --case 'ADR-120 T8' --no-cache`. [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/adr-next-terminal.test.mjs tests/adr-next.test.mjs 2>&1) \
  && for n in "a task whose own Status is terminal reads stopped, whatever its evidence" \
      "a sign-off naming a step covers that step only, and one naming none covers all"; do
    test "$(printf '%s\n' "$out" | sed -n 's/^ok [0-9][0-9]* - //p' | grep -cxF -- "$n")" = 1 || exit 1
  done
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a task whose own Status is terminal reads stopped, whatever its evidence` | `tests/adr-next-terminal.test.mjs` | withdrawn with and without evidence, and the done twin | — | S1, S2 |
| `a sign-off naming a step covers that step only, and one naming none covers all` | `tests/adr-next-terminal.test.mjs` | the per-step rows and the `S20` twin | — | S1, S3 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the new tests |
| 2 — something selects it | `classify` on every task; `unsigned_human_proof_steps` from adr-next :939 and adr-lint :2758 |
| 3 — the caller can discover it | adr-next's output and `--json`; adr-lint's advice |
| 4 — it is used | every corpus with a withdrawn task or a human-proved step |

## Mutation Log

## Invariants

- A task with no terminal Status classifies exactly as before.
- A sign-off naming no step clears the advice for every step, as before.

## Risks

- A note that names a step in passing ("unlike S3, …") covers it: the advice is advice, and the note's author can name the steps it signs.

## Stop Condition

Stop if a locked row asserts `done` for a task whose own Status is terminal: that row encodes the old reading, and the owner
decides.

## Out of Scope

- A step field in the sign-off grammar (permanent: boundary: the owner chose on 2026-10-21 to read step ids in the note, so existing rows keep their meaning)

## Verification Log
