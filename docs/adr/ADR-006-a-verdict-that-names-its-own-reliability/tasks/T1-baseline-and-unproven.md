# Task ADR-006-T1: a baseline per test-set, and the UNPROVEN verdict

**Depends-on:** none
**Covers:** UC1-S1, UC1-S2, UC1-S3, F-4, F-5, F-6, F-7, F-8, F-9
**Estimated scope:** M (multi-file)
**Owner:** zy
**Produces:** `UNPROVEN` verdict in `scripts/mutate.mjs` (T2)
**Consumes:** none
**Data dependency:** hermetic

## Goal

Establish that a mutation's named tests passed BEFORE the mutation was applied, once per distinct
test-set, and report any verdict taken against a failing baseline as `UNPROVEN` — beside the verdict
the tests produced, never instead of it.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `scripts/mutate.mjs` | edit | the verdict loop at 175-198 spawns the named tests and reads exit status alone; the baseline goes before `begin()`, on an unmutated tree |
| `tests/mutate-runner.test.mjs` | add | there is no test file for the runner's verdict logic today — the runner is exercised only through `lifecycle.test.mjs` spawning it |
| `tests/mutations.json` | edit | ADR-003 requires every shipped mechanism to carry a mutation; three entries, one per half of the rule |

## Ordered Steps

1. Confirm the failing tests first: a fixture catalogue whose named test-set fails for a reason unrelated to the mutation must be reported `UNPROVEN` and excluded from the `noticed` count. Red against today's runner, which calls it `RED` and counts it as noticed.
2. Extract the verdict decision from the loop into a pure function over `(baselineOk, run)` so it can be tested without spawning, then keep the loop calling it. The loop is currently untestable except by spawning a whole campaign, which is why it has no test file.
3. Run each distinct test-set once, unmutated, before any mutation is applied; memoise by the sorted test list. Measured 2026-08-28: 13 sets for 204 mutations.
4. Report `UNPROVEN` with the test-set that failed, and the next action — repair that suite, then re-run — satisfying F-6 and F-8. Print the tests' own verdict beside it, satisfying F-9.
5. Exclude UNPROVEN from both the numerator and the denominator of the `noticed` line, and state their count separately. Leave the exit rules alone: GREEN and STALE still exit 1, UNPROVEN alone does not.
6. Assert the boundary this record is most likely to be misread on: a VACUOUS mutation against a passing baseline is still `GREEN`, not `UNPROVEN`. The baseline proves the suite was working, never that the mutation was exercised.

## Acceptance

```bash
set -o pipefail
node --test tests/mutate-runner.test.mjs tests/lifecycle.test.mjs 2>&1 | tee /tmp/adr006-t1.out && ! grep -qE "^not ok|ℹ fail [1-9]|no tests to run" /tmp/adr006-t1.out
```

## Tests

| Test name | File | Verifies | Covers |
|-----------|------|----------|--------|
| `a verdict taken against a failing baseline is UNPROVEN, not RED` | `tests/mutate-runner.test.mjs` | the classifier returns UNPROVEN when the baseline failed, whatever the mutated run did | F-4, UC1-S3 |
| `a passing baseline leaves RED and GREEN exactly as they are` | `tests/mutate-runner.test.mjs` | no existing verdict changes meaning; a vacuous mutation is still GREEN | F-4, UC1-S1 |
| `an UNPROVEN entry names its test-set and the next action` | `tests/mutate-runner.test.mjs` | the rendered line carries which set failed and what to do, in one vocabulary | F-5, F-6, F-8 |
| `an UNPROVEN entry still prints the verdict the tests produced` | `tests/mutate-runner.test.mjs` | the underlying RED or GREEN is visible beside it | F-9 |
| `UNPROVEN entries are in neither half of the noticed ratio` | `tests/mutate-runner.test.mjs` | the summary counts only entries whose baseline passed, and states the UNPROVEN count separately | F-4, UC1-S2 |
| `the baseline runs the same tests, the same way, once per distinct set` | `tests/mutate-runner.test.mjs` | same test files and arguments as the mutated run; 13 sets over the shipped catalogue, not 204 | F-7 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the tests above |
| 2 — something selects it | `scripts/selftest.sh` runs `node --test tests/*.test.mjs`; the `mutations` CI job runs the real campaign, which now takes 13 baselines |
| 3 — the caller can discover it | the UNPROVEN line names the failing test-set and the action; `node scripts/mutate.mjs --list` is unaffected |
| 4 — it is used | measured 2026-08-28 on the shipped catalogue: 207 mutations over **14** distinct test-sets, so a campaign takes 14 baselines rather than 207 — the cost the decision rests on, re-measured after the catalogue grew |

## Class Sweep

**Class:** every place the runner turns an observation into a claim about the suite.

```bash
grep -n "verdict\|noticed\|missed" scripts/mutate.mjs
```

Run 2026-08-28. Three members, all now routed through one place each: the verdict assignment
(`classify`, `mutate.mjs:145-151`), the per-line note (`renderLine`, 175-185) and the summary ratio
(`summarise`, 194-204). The report and the ratio were separate claims about the same entry and both
had to stop counting an unproven one, or the line and the total would disagree — the sweep is why
`summarise` excludes UNPROVEN from the denominator as well as the numerator, which reading only the
verdict assignment would have missed.

A fourth member surfaced that the authoring list did not have: the runner ran its whole CLI at
import, so none of the three could be asserted without spawning a campaign. That is BACKLOG §27 for
this file, and it was the enabling step rather than a separate change — a pure function nothing can
import is not testable, which is why the verdict logic had no test in the first place.

## Mutation Log

<!-- tool-written by adr-verify --mutant; empty at authoring -->
- 2026-08-28 · 22bd877 · mutant killed · exit 1 · `scripts/mutate.mjs` · removes the baseline gate entirely: a verdict taken against a failing suite is counted as noticed again · acceptance-sha256:70195d7b8e7d64f7c8e6b891bc381c1aa365f4f576857a7b4ac09efe9353cb46
- 2026-08-28 · b06c5b2 · mutant killed · exit 1 · `scripts/mutate.mjs` · mutate: a verdict against a failing baseline is not counted as noticed · acceptance-sha256:f4403b66ffe2a967f7c4f00edcc0797168d6cda63a31751fbbcc95d4431643df

## Invariants

- The baseline runs on an unmutated tree, before `begin()`, so it opens no window in which a crash could leave the tree broken (ADR-002).
- The baseline spawns the same test files with the same arguments as the mutated run — F-7; measuring must not change what is measured.
- UNPROVEN never suppresses the verdict the tests produced — F-9.
- UNPROVEN alone never fails the campaign; GREEN and STALE still exit 1.
- A vacuous mutation against a passing baseline stays GREEN. This record does not claim to detect it.

## Risks

- The baseline could be read as proving the mutated line was exercised. Mitigated by the verdict word and by an explicit test that a vacuous mutation is still GREEN.
- A flaky test-set makes its baseline luck, and every verdict beneath it inherits that luck. Not fixed here; the failing set is named so the dependency is visible.

## Stop Condition

Stop if the 13-set memoisation turns out not to hold — if some mutation needs a test-set built at
run time, the cost argument changes and the decision should be re-taken rather than forced through.

## Out of Scope

- Detecting the vacuous class. (deferred: docs/BACKLOG.md §39)
- Making a flaky baseline trustworthy. (deferred: docs/BACKLOG.md §39)
- Any change to `adr-verify --mutant`. (permanent: it runs one mutation against one task's fence; the spec's Non-Goals put it outside this decision.)

## Verification Log
<!-- tool-written by adr-verify; empty at authoring -->
- 2026-08-28 · 23ae252 · exit 0 · `node --test tests/mutate-runner.test.mjs tests/lifecycle.test.mjs 2>&1 | tee /tmp/adr006-t1.out; ! grep -qE "^not ok|ℹ fail [1-9]|no tests to run" /tmp/adr006-t1.out` · acceptance-sha256:70195d7b8e7d64f7c8e6b891bc381c1aa365f4f576857a7b4ac09efe9353cb46
