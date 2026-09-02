# Task ADR-023-T2: Key a verdict on its inputs, and reuse it only on an exact match

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** M (multi-file)
**Owner:** unassigned
**Produces:** `cacheKey()`, the reuse decision, and the measured/reused summary counts
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1

## Goal

`mutate.mjs` reuses a `RED` verdict when the mutated file, every test file the entry names, and the
`from`/`to` strings are all byte-identical to the run that measured it — and re-runs everything
otherwise.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `scripts/mutate.mjs` | edit | `cacheKey()`, the reuse gate in front of the judging step, `--no-cache` / `--cache <path>` in the arg parser (`KNOWN`), and the summary counts |
| `tests/mutate-runner.test.mjs` | edit | the reuse rules, driven on fixtures rather than on a real campaign |
| `tests/mutations.json` | edit | one catalogue entry per mechanism this task adds |
| `.gitignore` | edit | the cache file is per-checkout and never committed |

## Ordered Steps

1. [S1] Write the failing tests first, all four rules: an exact match with a `RED` verdict is reused; a changed subject file, a changed test file, or changed `from`/`to` text is a miss; a `GREEN` or `UNPROVEN` verdict is never reused; an absent or unparseable cache measures everything. (TDD red.)
2. [S2] Add `cacheKey(entry, readFile)` — SHA-256 over the mutated file's bytes, each named test file's bytes in sorted order, and the `from`/`to` strings. Pure over an injected reader so the tests need no fixture tree on disk.
3. [S3] Add the reuse gate immediately before the judging step, beside ADR-006's baseline memo rather than inside it — the two answer different questions and merging them would make a baseline miss look like a verdict miss.
4. [S4] Record only `RED` verdicts, with the sha they were measured at. Refuse to record anything else. [proof: mutation]
5. [S5] Make the summary report measured and reused separately, and make each reused row name its measured-at commit. A campaign that prints a `noticed` count larger than what it ran is the defect this rule exists to stop. [proof: mutation]
6. [S6] Add `--no-cache` and `--cache <path>` to the arg parser's `KNOWN` set and to the usage line, so an unknown flag still fails loudly rather than being ignored.
7. [S7] Measure the hashing overhead against a full `--no-cache` campaign on this repository and record both numbers in the sign-off line, so the claim that hashing is cheaper than re-running is a measurement rather than an assumption. [proof: human: the two timings come from a full campaign run, which the acceptance fence deliberately does not execute]

## Acceptance

```bash
set -o pipefail
node --test tests/mutate-runner.test.mjs 2>&1 | tee /tmp/adr023-t2.out \
  && ! grep -qE "no tests to run|^not ok|^# fail [1-9]" /tmp/adr023-t2.out \
  && node scripts/mutate.mjs --case 'a reused verdict is refused' 2>&1 | tee /tmp/adr023-t2b.out \
  && grep -q "1/1 mutations were noticed" /tmp/adr023-t2b.out
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `an exact content match reuses a RED verdict` | `tests/mutate-runner.test.mjs` | the reuse path fires when every input is identical | — | S1, S2, S3 |
| `a changed subject, test or edit is a different mutant` | `tests/mutate-runner.test.mjs` | each of the three key inputs independently forces a re-run | — | S1, S2 |
| `only RED is reusable` | `tests/mutate-runner.test.mjs` | GREEN and UNPROVEN are re-run every time | — | S1, S4 |
| `an absent or unreadable cache measures everything` | `tests/mutate-runner.test.mjs` | "could not look" runs the full set rather than reporting clean | — | S1, S3 |
| `the summary distinguishes measured from reused` | `tests/mutate-runner.test.mjs` | the run cannot claim more noticed than it ran | — | S1, S5 |
| `an unknown flag is still refused` | `tests/mutate-runner.test.mjs` | `--no-cache` and `--cache` are in KNOWN, and a typo'd flag errors rather than being ignored | — | S6 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the five unit tests above over injected fixtures |
| 2 — something selects it | the reuse gate sits on the campaign's only judging path; the `--case` half of the Acceptance fence drives the real binary, and the mutation on the gate proves that path is reached |
| 3 — the caller can discover it | `--no-cache` and `--cache` appear in the usage line and in `KNOWN`, so an unknown flag still errors; asserted by the arg-parser test |
| 4 — it is used | the campaign summary prints measured vs reused on every run, so reuse is observable in the CI log rather than inferred from timing |

## Mutation Log

- 2026-09-02 · 1335029 · mutant killed · exit 1 · `scripts/mutate.mjs` · reusing a GREEN verdict would hide an open finding about a test · acceptance-sha256:881ddad4f97673dadd8232e9372de3858b1d6278a223700b6f04b2133d88f07b
- 2026-09-02 · 1335029* · mutant killed · exit 1 · `scripts/mutate.mjs` · an unreadable input must yield no key, or a deleted test freezes its verdict · acceptance-sha256:881ddad4f97673dadd8232e9372de3858b1d6278a223700b6f04b2133d88f07b

## Invariants

- A verdict is reused only when every input it depends on is byte-identical. The key is content — never a timestamp, a run id, or a commit range.
- A campaign never reports more entries noticed than it measured plus reused, and never presents a reused entry as freshly measured.
- ADR-006 is untouched: baselines stay memoised per test-set, `UNPROVEN` stays out of both sides of the ratio, and exit rules are unchanged.
- An absent, empty or unparseable cache is "could not look" and measures everything.

## Risks

- A key that omits an input the verdict depends on would reuse a stale RED. Mitigated by keying on the tests as well as the subject, and by T3 forcing a full run on every release, so a wrong reuse surfaces at the next tag.
- Two reuse mechanisms in one file could be conflated by a later reader. Mitigated by keeping the gate outside ADR-006's memo and naming both in the comment.

## Stop Condition

Stop if a verdict turns out to depend on something the key cannot cover from this checkout — an
environment variable, an installed interpreter version, a clock. That would mean local reuse is
unsound rather than merely narrow, and the record's central argument needs revisiting before any
code lands.

## Out of Scope

- Sharing the cache between machines (the parent ADR's Out of Scope says why)
- Caching `GREEN` or `UNPROVEN` verdicts
- Deciding WHEN reuse is permitted — that is T3

## Verification Log
- 2026-09-02 · 5bdb94b · exit 0 · `set -o pipefail …` · acceptance-sha256:881ddad4f97673dadd8232e9372de3858b1d6278a223700b6f04b2133d88f07b · ms:273
