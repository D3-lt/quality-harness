# Task ADR-022-T3: Report the declared mechanisms no bound mutant has covered

**Depends-on:** T1, T2
**Covers:** none — no spec
**Estimated scope:** S (one gate reading)
**Owner:** unassigned
**Produces:** the uncovered-mechanism advisory in `check_mutation_evidence` (T3)
**Consumes:** `rests_on()` (T1), the ` · covers:<name>` row field (T2)
**Data dependency:** hermetic
**Proof map:** v1

## Goal

`adr-lint` advises which mechanisms a task declared and no `mutant killed` row bound to the CURRENT
Acceptance fence digest names — and stays silent for a task that declares nothing, and for a task
whose every declared mechanism is covered. `done` continues to require exactly what it requires
today.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/bin/adr-lint` | edit | `check_mutation_evidence` already resolves the current digest and reads every row; this reads the difference it is already carrying |
| `tests/gate-regressions.py` | edit | the regression, through the shipped CLI |
| `tests/mutations.json` | edit | registers this record's `Enforced-by` mutant |

## Ordered Steps

1. [S1] Write the failing regression first (TDD red), through the CLI: a task declaring `a`, `b` with one digest-bound killed mutant covering `a` must have `b` named. It must fail before any code changes. [proof: acceptance]
2. [S2] Compute uncovered mechanisms from the declaration and the rows bound to the current digest. A row bound to a SUPERSEDED digest covers nothing — a fence edit already invalidates its evidence, and letting a stale row discharge a mechanism would be worse than not checking. [proof: acceptance]
3. [S3] Assert SILENCE in the three directions that would make this a gate reporting an observation it did not make: a task with no declaration, a task whose mechanisms are all covered, and a task with no Mutation Log at all. [proof: acceptance]
4. [S4] Assert `done` is unchanged: a task with one bound killed mutant and three uncovered declared mechanisms is still accepted as `done`, with advice. This is the record's central choice and it must be asserted, not assumed. [proof: acceptance]
5. [S5] Assert the advisory never enters the blocking channel, on the same findings object. [proof: acceptance]
6. [S6] Register the CALL-SITE mutant — delete the call, not the set difference — and confirm RED. [proof: mutation]

## Acceptance

```bash
set -o pipefail
python3 tests/gate-regressions.py plugin/bin plugin/skills/postmortem/SKILL.md . 2>&1 | tee /tmp/adr022-t3.out \
  && ! grep -qiE "traceback|assertionerror" /tmp/adr022-t3.out \
  && grep -q "a declared mechanism with no bound mutant is reported" tests/mutations.json
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a declared mechanism with no bound mutant is reported` | `tests/gate-regressions.py` | the uncovered name is named | — | S1, S2 |
| `a row bound to a superseded digest covers nothing` | `tests/gate-regressions.py` | stale evidence discharges no mechanism | — | S2 |
| `a task that declares nothing draws nothing` | `tests/gate-regressions.py` | silence without a declaration | — | S3 |
| `a fully covered task draws nothing` | `tests/gate-regressions.py` | capable of clean | — | S3 |
| `an uncovered mechanism does not stop done` | `tests/gate-regressions.py` | the obligation stays existential | — | S4 |
| `the uncovered advisory never blocks` | `tests/gate-regressions.py` | advisory channel only | — | S5 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the six tests above |
| 2 — something selects it | `check_mutation_evidence` runs on every task `adr-lint` reads; the registered mutant deletes the call and S1 goes red |
| 3 — the caller can discover it | the advisory names each uncovered mechanism and the `--covers` flag that would bind it |
| 4 — it is used | the record's Follow-up counts multi-mechanism declarations after a month |

## Mutation Log

- 2026-09-01 · 403ac2b* · mutant killed · exit 1 · `plugin/bin/adr-lint` · the uncovered reading is never reached · acceptance-sha256:e3415eed0a41797e8e821997e2301f35c8ce6f8b2a4328d35358135800afe548

## Invariants

- `done` requires exactly what it requires today: at least one killed mutant bound to the current digest.
- A row bound to a superseded digest covers no mechanism.
- Silent for a task with no declaration, forever.
- Advisory. It never enters the blocking channel.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| The advisory is read as a blocker by an agent | Med | Med | S5, plus wording that names the flag which would bind the mechanism — BACKLOG §85's "true and unactionable" is the failure to avoid |
| A stale row silently discharges a mechanism | Med | High | S2, asserted on a fixture whose fence changed after the row was recorded |
| `done` is tightened by accident | Low | High | S4 asserts the opposite outcome directly |

## Stop Condition

Stop and return to the record if honest tasks routinely finish with uncovered mechanisms and the
advice becomes noise. That is the pre-registered failure in the record's Decision, and the answer is
to remove the field rather than to soften the report.

## Out of Scope

- Comparing the declaration against the fence's shape, which is T4's (permanent: boundary: that check's subject is a proxy and its wording obligations are different; conflating them would let a proxy's uncertainty leak into a report about declared facts)
- Requiring full coverage before `done` (permanent: boundary: it makes honest declaration the expensive choice — the argument is in the record's Decision and Alternatives)

## Verification Log
- 2026-09-01 · 403ac2b · exit 0 · `set -o pipefail …` · acceptance-sha256:e3415eed0a41797e8e821997e2301f35c8ce6f8b2a4328d35358135800afe548 · ms:6129
- 2026-09-01 · e2ece70 · exit 0 · `set -o pipefail …` · acceptance-sha256:e3415eed0a41797e8e821997e2301f35c8ce6f8b2a4328d35358135800afe548 · ms:5391
