# Task ADR-126-T2: The coverage floor is two parallel jobs

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** M
**Owner:** Zy
**Produces:** `coverage floor (python)` as a required context
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1

## Goal

`scripts/coverage.sh --js` measures only the JavaScript surface and `--python` only the Python gates; the workflow runs them
as two jobs, `coverage floor` and `coverage floor (python)`, and the ruleset file requires both.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/coverage-split.test.mjs` | create | the cases (0 locks: new) |
| `scripts/coverage.sh` | edit | a surface argument; each half skips the other |
| `.github/workflows/selftest.yml` | edit | the `coverage` job (:71-99) and a second one |
| `.github/rulesets/main.json` | edit | the new required context |

## Ordered Steps

1. [S1] Write the failing test and record the red run: the workflow declares both jobs, each calling `coverage.sh` with its
   surface; the ruleset requires both contexts; `coverage.sh --js` never starts the Python measurement and `--python` never
   runs the JavaScript coverage pass (asserted on the script's text and on a dry run).
2. [S2] Split the script and the job; add the context to the ruleset file.
3. [S3] Record a killed mutant, with a catalogue entry. [proof: mutation]
4. [S4] After the landing that carries this, PUT the ruleset. [proof: human: the forge is changed by hand under ADR-118]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/coverage-split.test.mjs 2>&1) \
  && for n in "the coverage floor is two jobs, each measuring one surface, and main requires both" \
      "coverage.sh measures only the surface it is asked for"; do
    test "$(printf '%s\n' "$out" | sed -n 's/^ok [0-9][0-9]* - //p' | grep -cxF -- "$n")" = 1 || exit 1
  done
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `the coverage floor is two jobs, each measuring one surface, and main requires both` | `tests/coverage-split.test.mjs` | the workflow and ruleset | — | S1, S2 |
| `coverage.sh measures only the surface it is asked for` | `tests/coverage-split.test.mjs` | the script | — | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the new tests |
| 2 — something selects it | the workflow jobs |
| 3 — the caller can discover it | the job names on the run |
| 4 — it is used | main's required checks |

## Mutation Log
- 2026-10-22 · 6aa7bd18* · mutant killed · exit 1 · `.github/workflows/selftest.yml` · the Python coverage job measures only the Python surface · acceptance-sha256:bf3ff65525021e9ce4837a888ae5e1ff3a8eb56e7394f9fb9ec701ddccd5484c

## Invariants

- Neither floor is lowered; each surface is measured exactly once per run.

## Risks

- The forge requires a context no landing produces until the workflow lands: the context is added to the file here and PUT
  only after the landing.

## Stop Condition

Stop if the two halves cannot run independently (the Python measurement needs the JavaScript pass's output).

## Out of Scope

- Sharding the Windows job (re-measured after this lands).

## Verification Log
- 2026-10-22 · 6aa7bd18* · exit 1 · `out=$(node --test --test-reporter=tap tests/coverage-split.test.mjs 2>&1) \ …` · acceptance-sha256:bf3ff65525021e9ce4837a888ae5e1ff3a8eb56e7394f9fb9ec701ddccd5484c · ms:217 · test-lock-sha256:53ba5a1327aa719106c854f66437d2aa72da0af54092ba77762770f72b87d5ab · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvY292ZXJhZ2Utc3BsaXQudGVzdC5tanMJY292ZXJhZ2Uuc2ggbWVhc3VyZXMgb25seSB0aGUgc3VyZmFjZSBpdCBpcyBhc2tlZCBmb3IJMzg4YjI5YWJiZjc4ZTZmNzM3NjA2M2EwZDdhODFkNmUxMGVhYzJjMDExOWY4YTRmOWJkNDllZGNmZTYzZjEwOApib2R5CXRlc3RzL2NvdmVyYWdlLXNwbGl0LnRlc3QubWpzCXRoZSBjb3ZlcmFnZSBmbG9vciBpcyB0d28gam9icywgZWFjaCBtZWFzdXJpbmcgb25lIHN1cmZhY2UsIGFuZCBtYWluIHJlcXVpcmVzIGJvdGgJMGU0OTNhNmMyYjUwNTNmNzBlNWIxZDk0NmUwZWQzMmJlNDg2MzEwYTc5Y2I2ZmU5YTFhMWJjOWQzZGZjMWEzZA
  ```
  ```
- 2026-10-22 · 6aa7bd18* · exit 0 · `out=$(node --test --test-reporter=tap tests/coverage-split.test.mjs 2>&1) \ …` · acceptance-sha256:bf3ff65525021e9ce4837a888ae5e1ff3a8eb56e7394f9fb9ec701ddccd5484c · ms:255
