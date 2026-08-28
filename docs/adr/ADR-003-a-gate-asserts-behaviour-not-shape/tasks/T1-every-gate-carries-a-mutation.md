# Task ADR-003-T1: a gate with no mutation makes the suite go red

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** S (single file)
**Owner:** zy
**Produces:** none
**Consumes:** none
**Data dependency:** hermetic

## Goal

Assert the invariant the ten shipped gates already satisfy — every executable
under `bin/` appears at least once as a `file` in the mutation catalogue — so a
gate added without one cannot pass silently.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/package.test.mjs` | edit | the suite that already asserts what this package ships is where "and each shipped gate is asserted by something" belongs |
| `skills/mutation-audit/SKILL.md` | edit | states the behaviour-not-shape rule for choosing what to gate; the skill embodied it without ever saying it |

## Ordered Steps

1. Confirm the failing test first: add `every shipped gate carries at least one mutation` to `tests/package.test.mjs`, reading `bin/` and `tests/mutations.json` from disk, then prove it is red by deleting `adr-debt`'s single catalogue entry and watching it fail. Restore the entry.
2. Write the assertion so its failure message names the gate that has none — a test that says only "expected 10 to be 11" makes the reader do the enumeration the test just did.
3. Add the rule to `skills/mutation-audit/SKILL.md`: a gate asserts an observable property that no restructuring satisfies, with the owner's formulation and the four qualifying shapes, and complexity named as a conversation trigger rather than a gate.
4. Record in the test's own comment that the count is a FLOOR and not the guarantee — `mutate.mjs` reporting a mutation RED is the assertion; this only says somebody wrote one.

## Acceptance

```bash
set -o pipefail
node --test tests/package.test.mjs 2>&1 | tee /tmp/adr003-t1.out && ! grep -qE "^not ok|ℹ fail [1-9]|no tests to run" /tmp/adr003-t1.out
```

## Tests

| Test name | File | Verifies | Covers |
|-----------|------|----------|--------|
| `every shipped gate carries at least one mutation` | `tests/package.test.mjs` | each extensionless executable in `bin/` appears as a `file` in `tests/mutations.json`, and the failure names which does not | — |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the test above |
| 2 — something selects it | `scripts/selftest.sh` runs `node --test tests/*.test.mjs`, so it runs on every check and in CI; the mutation below deletes the assertion and the suite goes red |
| 3 — the caller can discover it | `adr-context bin/<gate>` returns ADR-003, which states the rule the test enforces |
| 4 — it is used | ten gates carry 60 catalogue entries between them as of 2026-08-27; the check reports on every future one without anyone remembering to ask |

## Class Sweep

**Class:** every executable gate this plugin ships under `bin/`.

```bash
python3 -c "
import json, os
cat = json.load(open('tests/mutations.json'))['mutations']
for g in sorted(x for x in os.listdir('bin') if '.' not in x):
    print(g, sum(1 for e in cat if e['file'] == f'bin/{g}'))"
```

Run 2026-08-27: ten gates, minimum 1 (`adr-debt`), maximum 15 (`adr-lint`), none
at zero. The invariant already held and nothing asserted it — which is the same
shape as every defect this record's Context lists, so the sweep is the evidence
that this task closes a real gap rather than a hypothetical one.

## Mutation Log

- 2026-08-27 · 51f76cc* · mutant survived · exit 0 · `tests/package.test.mjs` · removes the enumeration, so a gate shipping with no mutation passes unnamed · acceptance-sha256:228b65bb303f2ff70e37347620e8e7f0df34eaa6cb14f42c360fcf8558c7c958
  ```
  the fence passed with the mechanism broken
  ```
- 2026-08-27 · 674c720* · mutant killed · exit 1 · `tests/package.test.mjs` · removes the enumeration, so a gate shipping with no mutation passes unnamed · acceptance-sha256:228b65bb303f2ff70e37347620e8e7f0df34eaa6cb14f42c360fcf8558c7c958
- 2026-08-28 · fdcda52 · mutant killed · exit 1 · `tests/package.test.mjs` · package: a gate with no mutation is named, not counted · acceptance-sha256:ed29e8d1d0bc47478d9d90c838b0c2356faac0069385edfeb0ddaa8868d7e2b8

## Invariants

- The check reads `bin/` and the catalogue from disk; neither is a list kept beside the truth.
- `.cmd` shims are excluded deliberately — they forward and carry no logic.
- The check never asserts a mutation is RED; that is `scripts/mutate.mjs`'s job and saying otherwise here would be the shape-for-behaviour swap this record forbids.

## Risks

- The count is itself a shape check: one entry satisfies it. Mitigated only by saying so plainly in the test comment and in the ADR's Risks — the campaign is the real assertion, and this is a floor beneath it.

## Stop Condition

Stop if a gate is found that genuinely cannot carry a mutation, since that would
be a counterexample to the record rather than a task to force through.

## Out of Scope

- Requiring a minimum number of mutations per gate. (permanent: a number would be a shape check about a shape check.)
- Any complexity measurement. (deferred: docs/BACKLOG.md §28)

## Verification Log
- 2026-08-27 · 51f76cc · exit 0 · `node --test tests/package.test.mjs 2>&1 | tee /tmp/adr003-t1.out; ! grep -qE "^not ok|ℹ fail [1-9]|no tests to run" /tmp/adr003-t1.out` · acceptance-sha256:228b65bb303f2ff70e37347620e8e7f0df34eaa6cb14f42c360fcf8558c7c958
- 2026-08-27 · 674c720 · exit 0 · `node --test tests/package.test.mjs 2>&1 | tee /tmp/adr003-t1.out; ! grep -qE "^not ok|ℹ fail [1-9]|no tests to run" /tmp/adr003-t1.out` · acceptance-sha256:228b65bb303f2ff70e37347620e8e7f0df34eaa6cb14f42c360fcf8558c7c958
- 2026-08-28 · 1470653 · exit 0 · `set -o pipefail …` · acceptance-sha256:ed29e8d1d0bc47478d9d90c838b0c2356faac0069385edfeb0ddaa8868d7e2b8
