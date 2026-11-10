# Task ADR-141-T1: One listing predicate gates PreToolUse in both runtimes

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** M
**Owner:** Zy
**Produces:** `recordArmOfListed(norm)`, `dcRecordArmOfListed(norm)`, `hasDecisionCorpus` admitting a nested corpus
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1

## Goal

The reader's two listing arms become one exported predicate per runtime, the discovery loop and `hasDecisionCorpus` both call
it, and an Edit of python-monorepo's `services/api/duration.py` gets from `qh hook PreToolUse` the context Node's
`decisionContext` gives.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/decision-corpus.mjs` | edit | Export `recordArmOfListed`; `recordFilesFromListing` calls it for its name and directory arms |
| `plugin/scripts/session-orientation.mjs` | edit | `hasDecisionCorpus`: the root list, or `recordArmOfListed` (Decision 1); signature kept |
| `core/hooks/decisioncorpus_read.go` | edit | `dcRecordArmOfListed`; `dcRecordFilesFromListing` calls it |
| `core/hooks/orientation.go` | edit | `hasDecisionCorpus`: the same union; this is what pending.go:21 and :464 select |
| `core/hooks/pending_test.go` | edit | `TestHasDecisionCorpusAdmitsANestedCorpus` beside `TestDecisionReaderWithin` |
| `tests/nested-corpus.test.mjs` | add | The hook over a scratch copy of python-monorepo, the gate's rows, and their parity with the core |
| `tests/mutations/plugin/scripts/session-orientation.mjs.json` | edit | A mutant dropping the nested arm |
| `tests/mutations/core/hooks/orientation.go.json` | edit | The same mutant in Go |
| `tests/mutations/plugin/scripts/decision-corpus.mjs.json` | edit | Re-anchor the three entries whose `from` is the inline arms T1 moves: `ADR-092 T3: the name arms at any width` (:1190), `corpus: a record is found by content when its filename does not announce it` (:231) and `ADR-092 T3: placement-led discovery` (:1250) |
| `tests/mutations/core/hooks/decisioncorpus_read.go.json` | edit if needed | No entry pins `dcRecordFilesFromListing`'s name or directory arm (`grep -n 'dcAdrFile\|dcAnyRecordDirectory\|dcCanonicalName(base)\|specName(base)' tests/mutations/core/hooks/*.json` found none, 2026-11-10); S6 re-checks with `--stale` after the move |

## Ordered Steps

1. [S1] Write the failing tests first (TDD red): `tests/nested-corpus.test.mjs` with `a nested corpus gets the decision context
   Node gives` (copy tests/fixtures/corpora/python-monorepo into a scratch git repository, run `qh hook PreToolUse` from
   `sourceCore()` for an Edit of `services/api/duration.py`, and assert its `additionalContext` equals Node's `decisionContext`
   and names `services/api/docs/adr/ADR-001-durations-are-seconds.md`), `the gate admits what the reader's listing arms admit`
   (Node rows), and `the core answers every nested-corpus gate row as Node does`; and the Go unit test. Confirm red: today the
   hook prints nothing (measured 2026-11-10 at ca71fd493).
2. [S2] Extract `recordArmOfListed(norm)`: null when `corpusEligible(norm)` is false; `'name'` for `ADR_FILE`,
   `CANONICAL_NAME` or `SPEC_NAME` on the base name; `'directory'` when a directory segment matches `RECORD_DIRECTORY`; else
   null. `recordFilesFromListing` calls it where it tested those arms inline, keeping `byName` for `'name'` only. The same in
   Go as `dcRecordArmOfListed`.
3. [S3] Widen `hasDecisionCorpus` in both runtimes: keep the `CORPUS_DIR_NAMES` loop, then return true when
   `recordArmOfListed(listedPath(rel, platform))` is non-null. `danglingCorpusLinks` is not touched.
4. [S4] Add the gate rows for every flip measured in the record's Context, on `linux` and `win32`, plus the rows that must not
   change (`node_modules/x/docs/adr/a.md`, `a/adr/tasks/T1.md`, listed-backslash's POSIX `docs\adr\001-x.md`), and send them
   to `TestDecisionCorpusParity` through `QH_DECISION_CORPUS_ROWS` as the locked test does.
5. [S5] Add one catalogue mutant per runtime that drops the nested arm, and record one killed with `adr-verify --mutant`.
   [proof: mutation]
6. [S6] Re-anchor the catalogue entries the extraction moved (Affected Files), each mutating the same arm in its new place
   (the name arm inside `recordArmOfListed`, the directory arm likewise, the placement arm where it stays in the loop), until
   `node scripts/mutate.mjs --stale` names no entry on `plugin/scripts/decision-corpus.mjs`,
   `plugin/scripts/session-orientation.mjs`, `core/hooks/decisioncorpus_read.go` or `core/hooks/orientation.go`.
   [proof: human: the executor pastes the empty --stale output for those four files]
7. [S7] Run every catalogue mutant on those four files, not only the new ones (CLAUDE.md §18's refactor rule): for each entry
   whose `file` is one of them, `node scripts/mutate.mjs --case '<its label>'`, one at a time under the costly-runs budget
   (`--case` selects by label substring, so a label shared with another file only widens the run). Every entry RED; a GREEN
   or STALE is fixed in this task, never filed. The executor pastes each per-label verdict line, with its commit, into the sign-off.
   [proof: human: a reviewer reads every per-label verdict of the S7 run and finds each RED]

## Acceptance

```bash
set -o pipefail
out="$(mktemp)"
node --test tests/nested-corpus.test.mjs 2>&1 | tee "$out" && grep -q '✔ a nested corpus gets the decision context Node gives' "$out" && grep -q '✔ the core answers every nested-corpus gate row as Node does' "$out" && (cd core && go test -count=1 -run '^TestHasDecisionCorpusAdmitsANestedCorpus$' ./hooks/ | grep -q '^ok') && node --test tests/listed-backslash.test.mjs tests/decision-context-parity.test.mjs tests/decision-context-replay.test.mjs && node --test --test-name-pattern='corpus' tests/lifecycle.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a nested corpus gets the decision context Node gives` | `tests/nested-corpus.test.mjs` | The served PreToolUse path over python-monorepo names the nested record, as Node does | — | S1, S3 |
| `the gate admits what the reader's listing arms admit` | `tests/nested-corpus.test.mjs` | Every measured flip widens, nothing true turns false, uninteresting and tasks paths stay out | — | S2, S3, S4 |
| `the core answers every nested-corpus gate row as Node does` | `tests/nested-corpus.test.mjs` | The Go gate answers the new rows as Node does on both platforms | — | S4 |
| `TestHasDecisionCorpusAdmitsANestedCorpus` | `core/hooks/pending_test.go` | The Go gate admits `services/api/docs/adr/ADR-001-x.md` and keeps nil as UNPROVEN | — | S3 |
| `the core answers every record-rule row as the Node reader does` | `tests/decision-context-parity.test.mjs` | The extraction leaves discovery unchanged (locked, regression) | — | S2 |
| `the core gives the decision context Node gives over every replayed corpus` | `tests/decision-context-replay.test.mjs` | The same, over every fixture corpus (regression) | — | S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | `recordArmOfListed`, `dcRecordArmOfListed` |
| 2 — selected | `hasDecisionCorpus` calls them; pending.go:21 calls it; the hook test fails when that call is dropped |
| 3 — discoverable | n/a: no declared interface |
| 4 — used | nothing measures this yet; the §18 outside run is its first observation |

## Mutation Log

## Invariants

- Every listing true today stays true; a nil listing is `UNPROVEN`.
- The gate reads no file and no real path.

## Risks

- The replay and parity tests are the oracle for the extraction; they run only where Go is installed (`noGo` skips), so CI's Go jobs are where a skip cannot hide it.
- No doubles: the hook test runs the built core over a real git copy of the fixture.

## Stop Condition

Stop if the extraction changes any row of the locked parity or replay tests: the predicate must be the loop's own arms, not a
new rule.

## Out of Scope

- SessionStart's lines (T2).

## Verification Log
