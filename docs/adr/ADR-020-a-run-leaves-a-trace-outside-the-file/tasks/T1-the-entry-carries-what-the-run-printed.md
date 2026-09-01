# Task ADR-020-T1: Record how long the run took, and refuse a duration that could not have produced it

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** L (cross-boundary)
**Owner:** unassigned
**Produces:** `implausibly_fast()` (T1), the extended Verification Log grammar (T1)
**Consumes:** none
**Data dependency:** needs this repository's own ADR corpus and its acceptance fences, because the stability measurement in S2 is taken against real fences rather than fixtures
**Proof map:** v1

## Goal

Append `ms:<integer>` to the entry `adr-verify` writes, required from a dated
cutover and accepted by all three readers, and advise when a duration is
implausibly short for the fence it claims to have run.

The output digest this task originally carried does not ship: S2 measured 25 of
this corpus's 40 fences producing different output on every run, which fired the
parent record's Stop Condition. S2 stays in the steps because the measurement is
the reason the rest of this task looks the way it does, and a later reader needs
to find it rather than wonder.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/bin/adr-verify` | edit | writes the entry; `output_digest()` lives beside `acceptance_digest()` |
| `plugin/bin/adr-lint` | edit | `VLOG_RE`, `VLOG_DIGEST_RE`, `VLOG_LEGACY_RE` and the new `OUTPUT_REQUIRED_FROM` — this is what SELECTS the field as required |
| `plugin/bin/adr-next` | edit | `is_done()` reads the same grammar; a third reader drifting makes it call verified tasks unverified |
| `tests/gate-regressions.py` | edit | already asserts three-way digest agreement; extended to the new field |
| `tests/mutations.json` | edit | registers the label ADR-020's `Enforced-by` names |

## Ordered Steps

1. [S1] Write the failing tests first (TDD red): an entry dated on/after the cutover with no `output-sha256` is rejected, one dated before it is accepted, and all three readers parse a new-shape entry. They must fail before any grammar changes.
2. [S2] **Measure before building.** Run each acceptance fence in this repository's corpus twice on a clean tree and record how many produce byte-identical merged output. Write the count, the date and what it was taken against into the record's Context. If any fence is unstable, name it — the ADR's Stop Condition turns on this. [proof: human: a reader confirms the count names the fences tested and the date, and that an unstable fence is named rather than summarised away]
3. [S3] **Measure the elapsed wall-clock milliseconds around the fence. `adr-verify` does not time anything today** — this step was written saying it "already measures", which a `grep` for `perf_counter|elapsed|monotonic` disproved before any code was written. Use a MONOTONIC clock: a wall clock can go backwards over an NTP step or a DST change and hand the floor a negative duration. An integer, no units, no formatting — nothing downstream parses a human-readable duration. [proof: acceptance]
4. [S4] Append the field to the entry in `adr-verify`, and add `DURATION_REQUIRED_FROM` plus the three grammar changes in `adr-lint` and the one in `adr-next`. It goes at the END of the line so an older reader's pattern is unaffected. [proof: acceptance]
5. [S5] `implausibly_fast(ms, command)` — a FLOOR, never an equality check. It advises only when a duration could not plausibly have run the fence named: a claim of `exit 0` in single-digit milliseconds against a fence that starts a container or runs a suite. Honest work never comes in absurdly fast, so this must not be able to redden a slow machine, a fast machine, or a cached run. Assert a legitimately quick fence is NOT advised, on the same fixture as one that is. [proof: acceptance]
6. [S6] Assert the DOWNGRADE path: the entry patterns as released in 2.45.0 still match a 2.46-shaped entry. A corpus verified under the new gate and read by the old one must not read as malformed. [proof: acceptance]
7. [S7] Register the mutation making the field optional after the cutover, and confirm it is RED — that mutation is exactly the defect GitHub issue #4 reported, aimed at the new field. [proof: mutation]

## Acceptance

```bash
set -o pipefail
python3 tests/gate-regressions.py plugin/bin plugin/skills/postmortem/SKILL.md . 2>&1 | tee /tmp/adr020-t1.out \
  && ! grep -qiE "traceback|assertionerror" /tmp/adr020-t1.out \
  && node --test tests/evidence-chain.test.mjs 2>&1 | tee /tmp/adr020-t1b.out \
  && ! grep -qE "^# fail [1-9]|tests 0" /tmp/adr020-t1b.out \
  && grep -q "an acceptance entry carries the time its run took" tests/mutations.json
```

<THE FIRST VERSION OF THIS FENCE RAN ONLY THE READERS, and the mutation said so.
Removing ` · ms:{elapsed_ms}` from what `adr-verify` WRITES came back `survived`:
`gate-regressions.py` asserts the three readers accept the new shape and that the
floor fires, none of which changes when the writer stops emitting the field. The
suite that drives `adr-verify` end to end and reads the entry it produced is
`evidence-chain.test.mjs`, and it was outside the command that had to pass.

That is the "which of these subjects could carry the verdict by itself" question
this template asks, answered the wrong way at authoring time and caught by a
survived mutant rather than by review. Both suites are chained with `&&` now, so
neither can stand in for the other.>

<Red before the work: the harness's new arm asserts a cutover-dated entry without
the field is rejected, and today every reader accepts it. The catalogue grep is
chained with `&&` so a passing harness alone cannot carry the verdict — the
mutation label is half of what this task produces.>

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `an entry dated from the cutover must carry a duration` | `tests/gate-regressions.py` | the field is required, not optional-by-omission | — | S1, S4 |
| `an entry dated before the cutover needs no duration` | `tests/gate-regressions.py` | the corpus's existing rows stay valid forever | — | S4 |
| `all three readers accept one new-shape entry` | `tests/gate-regressions.py` | adr-verify, adr-lint and adr-next do not drift apart | — | S4 |
| `the released 2.45.0 patterns still match a new-shape entry` | `tests/gate-regressions.py` | the downgrade path: a new corpus read by an old gate is not malformed | — | S6 |
| `a duration that could not have run the fence is advised` | `tests/gate-regressions.py` | the floor speaks when a row claims an impossible run | — | S5 |
| `a legitimately quick fence is not advised` | `tests/gate-regressions.py` | the floor is a floor: it never reddens honest work, asserted on the same fixture | — | S5 |
| `the duration check never changes the exit code` | `tests/gate-regressions.py` | gates instruct and never block (CLAUDE.md §3) | — | S5 |

<Every name and file backticked: an unbackticked row is dropped by the Tests
reader, and its step is then reported as unproven.>

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the five tests above |
| 2 — something selects it | `DURATION_REQUIRED_FROM` in `adr-lint` is what makes the field load-bearing rather than decorative; the S6 mutation fails if it stops being required |
| 3 — the caller can discover it | the entry grammar is documented in `adr-verify`'s module docstring, which the S4 change updates — a reader who hand-inspects a log needs it |
| 4 — it is used | the ADR's Follow-up counts how often the cross-check fires once T3 ships |

## Mutation Log

- 2026-09-01 · dab3afe* · mutant survived · exit 0 · `plugin/bin/adr-verify` · the entry dropping the one field the task file cannot produce · acceptance-sha256:885869b99f8c6bb350c5cc15036bebba9d33e27eb62e219f1af152e3802a0da9
  ```
  the fence passed with the mechanism broken; it may not materialize, compile, load, or assert on the changed path
  ```

## Invariants

- Both fields are appended at the END of the entry; no existing field moves.
- The duration is never compared for equality with anything, on any path.
- `normalize_acceptance()` and `acceptance_digest()` are unchanged in all three gates.
- Entries written before the cutover remain valid with no field, forever.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| The duration floor is set high enough to catch honest work | Low | High | It is a floor against the fence's own shape, not a budget; S5 asserts a legitimately quick fence is silent on the same fixture where a fabricated one is advised |
| An older gate rejects a new entry | Med | High | S5 asserts the released patterns against a new-shape entry |

## Stop Condition

**S2 already fired this once**, on 2026-09-01, and the parent record was narrowed
rather than the measurement argued with. Stop again and return to the ADR if a
floor cannot be derived from a fence's own shape without a per-runner table —
that would be the same rotting surface, one mechanism over.

## Out of Scope

- An output digest, a ledger, and a cross-check between them (permanent: fact: 25 of this corpus's 40 acceptance fences produce different output on every run, so a digest of it can never be compared; citation: file `docs/adr/ADR-020-a-run-leaves-a-trace-outside-the-file.md:60`)
- Any binding on the Mutation Log (deferred: docs/BACKLOG.md §98)

<THE LOG'S FIRST ENTRY IS NOT A RED RUN, and `adr-lint` advises on that correctly.
The TDD red runs happened and were observed in-session — `AttributeError: module
'adr_lint_regressions' has no attribute 'DURATION_REQUIRED_FROM'` before the
constant existed, and `adr-next must still see a new-shape row as done` before the
third reader was updated — but they were run by hand rather than through
`adr-verify`, so nothing tool-written records them. Said here rather than left to
imply a cycle the log does not show.>

## Verification Log
- 2026-09-01 · dab3afe · exit 0 · `set -o pipefail …` · acceptance-sha256:885869b99f8c6bb350c5cc15036bebba9d33e27eb62e219f1af152e3802a0da9 · ms:3258
