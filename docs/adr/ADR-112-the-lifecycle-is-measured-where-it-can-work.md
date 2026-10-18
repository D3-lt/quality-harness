# ADR-112: The plugin is measured where its mechanism can work, against a kill criterion

**Status:** Proposed
**Date:** 2026-10-18
**Owner:** Zy
**Spec:** None — no spec stage; the owner, 2026-10-18, on measuring the lifecycle in checkouts whose tests can run ("both", then "go all")
**Cross-references:** docs/adr/ADR-106-a-paired-benchmark-says-what-the-plugin-buys.md, docs/adr/ADR-107-the-plugin-works-the-mrw-way.md, docs/adr/ADR-110-a-static-core-owns-the-hooks.md, docs/adr/ADR-111-the-turn-end-judges-against-a-baseline.md
**Governs:** None — declared by its tasks
**Enforced-by:** None — declared by its tasks; T1 adds catalogue mutants on the scorer's new endpoint.
**Invalidates:** none — checked
**Served-path change:** None — this ADR changes only measurement; its kill criterion decides whether a later record shrinks the always-on hooks.

## Context

ADR-106's verdict (2026-10-18, Stage 5 block 1) was GUARD NOT MET on both models, and it measured the hooks in checkouts
that could not run their tests: no `qh-check` passed in 54 plugin attempts, and the lifecycle was never invoked (0 Skill
calls). So the plugin's two claimed mechanisms, catching an unverified or regressing change and planning work through
specs, records and tasks, were both out of reach. The bench peer (tool-multipathreadwrite, 2026-10-18) can run instances
inside their swebench containers through command shims, so a check can pass on the unmodified tree; it needs its own ADR,
a pilot, the end of Stage 5 and the owner's word on the price (its estimate, unmeasured: 240 attempts, 25–40 machine
hours, a quarter of a week's usage limit).

This record pre-registers that stage and what its result decides, before any of its rows exist.

## Existing Primitives Audit

- **`scripts/eval-paired.mjs`** (ADR-106 T1, T4): the paired scorer, its pre-registration check, its verdict words and its
  verdict file. Reused unchanged for false completion, resolve and under-claim; T1 adds broken tests as an endpoint.
- **ADR-106's Decisions 3–9 and its amendment**: the STATUS line, hidden-test grading, the metrics, the 90%-paired rule,
  the verdict file's fixed keys, Decision 8's exception for aggregates. Inherited by reference.
- **`bench export-paired`** (tool-multipathreadwrite): already carries status, resolved, broke_tests and limit per run.

## Decision

1. **Arms, one configuration each, per model (Sonnet 5.5 and Opus 5.5, never pooled):** A, the plain session; P, A plus
   this plugin at the first tag that carries ADR-111; W, P plus one prompt line asking the agent to run
   `/quality-harness:work` before anything else. k = 1. Every arm runs in the instance's container through the bench's
   shims, with the same `.quality-harness.json` written before the base commit, whose `check` is the repository's own
   runner over the test files the base commit already has, never a scope derived from FAIL_TO_PASS, PASS_TO_PASS or the
   test patch.
2. **Instances:** the pilot verifies that each candidate's check passes on its unmodified tree; one that does not is
   dropped, and the record says how many and which rule dropped them (never which ids, CLAUDE.md §6). The scored set is
   one block of 40 per model from the pool that survives, pre-registered as a list digest.
3. **Endpoints, per pair (P against A, W against A):** primary, false-completion incidence (ADR-106 Decision 5); co-primary,
   broken-tests incidence (the oracle's `broke_tests`: a PASS_TO_PASS test that passed before the patch fails after it);
   guards as ADR-106 Decision 6. Level: one-sided p < 0.0125 for each primary, the Bonferroni level of two endpoints by two
   arms, read once per model.
4. **What a pair shows:** PAYS when either primary is SHOWN (mean paired difference below zero at that level) and neither
   guard is GUARD NOT MET; otherwise ADR-106's words.
5. **The kill criterion, pre-registered.** If no pair on either model PAYS, a new record shrinks the always-on hooks to what
   costs nothing on an ordinary turn (the publish refusal of ADR-061 and the reviewer guard of ADR-060, which are
   sanctioned refusals, stay), ADR-111 is withdrawn or reverted, and the lifecycle stays opt-in skills. If W PAYS and P does
   not, the lifecycle earns a way to be invoked by default, decided in a new record. If P PAYS, ADR-110's port resumes with
   the proven rules.
6. **What is committed:** as ADR-106 Decision 8's exception: one verdict file per model and pair, aggregates only; and
   `docs/BENCHMARKS.md` quotes each verdict with its configuration and date.

**This fails if** the scorer can return PAYS on an incomplete or mismatched configuration, on a pair whose broken-tests
endpoint was computed from a scope the dataset chose, or without a pre-registration committed before the stage's first
counted attempt. Data that could make the kill criterion fire exists only once the stage runs.

## Alternatives Considered

- **Another SWE-bench block without test-capable checkouts.** Rejected: block 1 already showed the mechanism cannot work
  there.
- **A planning benchmark of multi-step feature tasks.** Deferred: no graded corpus of that shape exists in the bench yet;
  W on SWE-bench is the cheapest test of whether invoking the lifecycle changes outcomes at all.
- **Pool P and W, or the two models.** Rejected: each is its own configuration, as ADR-106 decided.

## Component / Boundary Impact

`scripts/eval-paired.mjs` gains one endpoint (T1). Everything else is in tool-multipathreadwrite's bench, under its own
ADR. This repository has no architecture document.

## Wiring & Contract Changes

| Surface | Change | Producer | Consumer(s) |
|---------|--------|----------|-------------|
| `eval-paired.mjs` output and `--verdict-out` keys | a broken-tests endpoint with its permutation p and bootstrap percentiles, and the word PAYS | T1 | T3, `docs/BENCHMARKS.md` |
| `prereg-<pair>-<model>.json` | four new pre-registrations | T2 | T3 |

## Inter-task Contracts

| Contract | Producing task | Consuming task(s) | Breaking? |
|----------|----------------|-------------------|-----------|
| the broken-tests endpoint and PAYS | T1 | T2, T3 | No — added beside ADR-106's words |
| `prereg-<pair>-<model>.json` | T2 | T3 | No |

## Implementation

See `tasks/README.md`.

## Consequences

- **Positive:** the plugin is measured where its mechanism can work, and the result decides its scope in advance.
- **Negative:** a quarter of a week's usage limit and 25–40 machine hours (the peer's estimate, unmeasured).
- **Neutral:** these numbers are not comparable with Stage 5's, since A also gains runnable tests.

## Out of Scope

- A graded corpus of multi-step feature tasks (deferred: docs/BACKLOG.md §383)
- The bench's container shims and configuration W (external: tool-multipathreadwrite: its ADR for the stage)
- A hooks-only arm (deferred: docs/BACKLOG.md §382)

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| W hits the turn or time cap on one-shot fixes | Med | Med | the bench records `limit` as a result; the pilot measures it before n is fixed |
| Few instances have a green baseline | Med | High | the pilot counts them; a pool below 40 per model is reported and the stage waits for the owner |
| Emulated containers make attempts slow | High | Med | the pilot's timing goes to the owner before the price is approved |

## Rollback

None — measurement only; nothing on the served path changes until a later record acts on the verdict.

## Follow-ups

- [ ] The owner's word on the price, after the pilot.
