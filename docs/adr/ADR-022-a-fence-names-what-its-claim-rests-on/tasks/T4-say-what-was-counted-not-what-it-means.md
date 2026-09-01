# Task ADR-022-T4: Advise on a declaration smaller than the fence's segment count, in the counts observed

**Depends-on:** T1
**Covers:** none — no spec
**Estimated scope:** S (one gate reading)
**Owner:** unassigned
**Produces:** the under-declaration advisory in `adr-lint` (T4)
**Consumes:** `rests_on()` (T1)
**Data dependency:** hermetic
**Proof map:** v1

## Goal

When a task declares fewer mechanisms than the number of non-setup segments `adr-lint` counted in its
Acceptance fence, the gate says so **in the counts it took** — never in a claim about how many
mechanisms the fence rests on, which is the thing this record establishes cannot be derived from the
file.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/bin/adr-lint` | edit | the segment count and the advisory, beside the fence reading it already does |
| `scripts/fence-obligation-sweep.py` | edit | the segment rule must be the sweep's rule or the record's own measurement and the gate disagree |
| `tests/gate-regressions.py` | edit | the regression, including the wording assertion |
| `tests/mutations.json` | edit | registers this task's mutant |

## Ordered Steps

1. [S1] Write the failing regression first (TDD red), through the CLI on a fixture whose fence chains three segments and which declares one mechanism: the advisory must fire and must name both counts. It must fail before any code changes. [proof: acceptance]
2. [S2] Assert the WORDING, not merely the firing: the message states the segments counted and the mechanisms declared, and contains no claim about what the fence rests on. A message that fires correctly and overstates is the defect ADR-005 names; and since BACKLOG §80 records that asserting a string appears is not asserting a document says the right thing, assert the ABSENCE of the overclaiming phrasing as well as the presence of the counts. [proof: acceptance]
3. [S3] Extract the segment rule into one place used by both `adr-lint` and `scripts/fence-obligation-sweep.py`. Two implementations of one proxy will drift, and then the record's own measurement and the gate will disagree about the corpus without either being wrong. [proof: acceptance]
4. [S4] Assert SILENCE where the counts do not warrant advice: a declaration at least as large as the segment count, a task with no declaration at all, and a fence of a single segment. [proof: acceptance]
5. [S5] Assert the advisory never enters the blocking channel. [proof: acceptance]
6. [S6] Register a mutant that removes the setup filter from the segment rule — so `set -o pipefail` counts as a segment — and confirm RED. That inflates every count and is exactly the failure mode that would make this advisory fire on honest work. [proof: mutation]

## Acceptance

```bash
set -o pipefail
python3 tests/gate-regressions.py plugin/bin plugin/skills/postmortem/SKILL.md . 2>&1 | tee /tmp/adr022-t4.out \
  && ! grep -qiE "traceback|assertionerror" /tmp/adr022-t4.out \
  && python3 scripts/fence-obligation-sweep.py > /tmp/adr022-t4-sweep.out \
  && grep -q "task files carrying an Acceptance fence" /tmp/adr022-t4-sweep.out \
  && grep -q "a segment rule shared by the gate and the sweep" tests/mutations.json
```

<The sweep is run because S3 makes the gate and the sweep share one rule; a fence that exercised only
the gate would let the shared function drift out from under the record's own measurement.>

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a declaration smaller than the segment count is reported` | `tests/gate-regressions.py` | the advisory fires and names both counts | — | S1 |
| `the advisory says what was counted and not what it means` | `tests/gate-regressions.py` | the overclaiming phrasing is absent | — | S2 |
| `a segment rule shared by the gate and the sweep` | `tests/gate-regressions.py` | one implementation, two callers | — | S3 |
| `setup lines are not segments` | `tests/gate-regressions.py` | `set -o pipefail` and `tee` do not inflate the count | — | S3, S6 |
| `a declaration at least as large draws nothing` | `tests/gate-regressions.py` | capable of clean | — | S4 |
| `a task with no declaration draws nothing` | `tests/gate-regressions.py` | silence without a declaration | — | S4 |
| `the segment advisory never blocks` | `tests/gate-regressions.py` | advisory channel only | — | S5 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the seven tests above |
| 2 — something selects it | the advisory runs on every task carrying both a fence and a declaration; the registered mutant strips the setup filter and the count assertion goes red |
| 3 — the caller can discover it | the message names both counts and points at `Rests-on:` |
| 4 — it is used | the record's second Follow-up re-runs the sweep after ten declared tasks and records whether the two counts converge |

## Mutation Log

## Invariants

- The message never asserts how many mechanisms a fence rests on. It reports two counts it took.
- One segment rule, called by both the gate and the sweep.
- Silent for a task with no declaration, forever.
- Advisory. It never enters the blocking channel.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| The advisory fires on honest single-mechanism fences | High | Med | It is advisory by construction, its wording claims nothing about the fence, and the record's second Follow-up measures convergence rather than assuming it |
| The segment rule drifts from the sweep's | Med | Med | S3 makes them one function, and the Acceptance runs the sweep as well as the gate |
| The wording is softened later into a claim about mechanisms | Med | High | S2 asserts the absence of that phrasing, so a later edit that overstates goes red |

## Stop Condition

Stop and return to the record if the segment count cannot be made to track what authors mean by a
mechanism closely enough to be worth printing. A hint that is wrong more often than it is right
teaches people to ignore the gate, which costs more than the missing hint — and the record's second
Follow-up exists to find that out.

## Out of Scope

- Deriving the fence's mechanisms rather than counting its segments (permanent: fact: the tool cannot safely infer structure from arbitrary shell, decided for this same command; citation: file `docs/adr/ADR-016-a-mutant-earns-its-verdict.md:30`)
- Reporting coverage of declared mechanisms, which is T3's (permanent: boundary: that report is about declared facts; this one is about a proxy, and their wording obligations differ)
- Any change to what `done` requires (permanent: boundary: the record keeps the obligation existential)

## Verification Log
