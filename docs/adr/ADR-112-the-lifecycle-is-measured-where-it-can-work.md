# ADR-112: The plugin is measured where its mechanism can work, against a kill criterion

**Status:** Accepted
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
a pilot, the end of Stage 5 and the owner's word on the price (its estimate for one block of 40 per model and three arms,
unmeasured: 240 attempts, 25–40 machine hours, a quarter of a week's usage limit; Decision 5 may need several blocks).

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
   shims, with the same `.quality-harness.json` written before the base commit. Its `check` comes from the repository
   alone, never from FAIL_TO_PASS, PASS_TO_PASS or the test patch, in one of two forms the pilot chooses by a rule fixed
   here: the repository's whole runner when, over the pilot's instances, it is green on the unmodified tree for at least
   80% of them and its median wall time under emulation is at most a quarter of the attempt budget; otherwise a check
   scoped from the paths the agent changes, which ADR-111 defers, so the stage then waits for that scope and is
   pre-registered again.
2. **The pool and the instances:** the source pool is tool-multipathreadwrite ADR-162's 191 instances, taken in their
   order and excluding ADR-106's pilot. An instance whose chosen check is not green on its unmodified tree is dropped; the
   record says how many and by which rule, never which (CLAUDE.md §6). The pre-registration carries the surviving list's
   digest. Opus recalled hidden test names on 19 of block 1's instances, so every verdict is reported beside the
   pair-symmetric recall sensitivity row ADR-106 T3 used (an instance is dropped from both arms of a pair when either arm's
   attempt on that model recalled); that row never decides.
3. **The attempt budget is pre-registered:** the same wall-time and turn caps for every arm, set from the pilot by a rule
   fixed here: three times W's median pilot wall time and turns, and never below Stage 5's 1200 s and 60 turns. A run that
   reaches either cap is `limit` and counts against its arm as an unresolved run with no done claim (ADR-106 Decision 4).
4. **Endpoints, per pair (P against A, W against A):** co-primaries false-completion incidence (ADR-106 Decision 5) and
   broken-tests incidence (the harness's `broke_tests`: a PASS_TO_PASS test that passed before the patch fails after it);
   guards as ADR-106 Decision 6.
5. **Blocks and looks, because one block cannot show anything.** Block 1's base rates per 40 were false completion 6
   (Opus A) and 5 (Sonnet A), broken tests 2 and 6. With k = 1 the exact sign-flip p when every discordant pair favours
   the plugin is 0.5 to the number of pairs, so six false completions removed entirely give 0.0156, and two broken tests
   can never be shown: a single block's absence of an effect is the test's lack of power, not the plugin's. So the stage
   runs blocks of 40 in pool order, with a look after each, up to the surviving pool. At each look, per pair and model:
   - **PAYS** when either co-primary's mean paired difference is below zero at one-sided p < 0.0125 / L_max (two
     endpoints by two arms, Bonferroni over the planned looks, L_max the surviving pool's block count) and neither guard
     is GUARD NOT MET;
   - **FUTILE** when, for both co-primaries, the 95th percentile of a seeded paired bootstrap of the improvement (A minus
     the arm) is below the useful effect: 0.05 for false completion and 0.03 for broken tests, fixed here;
   - otherwise open. A pair that is PAYS or FUTILE stops; the stage ends when every pair has stopped or the pool is spent,
     and a pair still open then is INCONCLUSIVE.
6. **What the verdicts decide, pre-registered.**
   - Every pair on both models FUTILE: a new record shrinks the always-on hooks to what costs nothing on an ordinary turn
     (the sanctioned refusals of ADR-061 and ADR-060 stay), ADR-111 is withdrawn or reverted, and the lifecycle stays
     opt-in skills.
   - W PAYS on a model and P does not: the lifecycle earns a way to be invoked by default, decided in a new record.
   - P PAYS on a model: ADR-110's port resumes with the proven rules.
   - Anything else, including INCONCLUSIVE: no automatic consequence; the owner decides with the verdicts in hand. Absence
     of PAYS alone never shrinks anything.
7. **What is committed:** as ADR-106 Decision 8's exception: one verdict file per model and pair, aggregates only; and
   `docs/BENCHMARKS.md` quotes each verdict with its configuration and date.

**This fails if** the scorer can return PAYS or FUTILE on an incomplete or mismatched configuration, or without a
pre-registration committed before the stage's first counted attempt; if the declared check's scope is derived from
anything the dataset chose about the instance's tests; or if a consequence in Decision 6 is taken on a verdict other than
the one it names. Data that could produce any verdict exists only once the stage runs.

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
| `eval-paired.mjs` output and `--verdict-out` keys | a broken-tests endpoint with its permutation p and bootstrap percentiles, and the words PAYS and FUTILE at a look | T1 | T3, `docs/BENCHMARKS.md` |
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
- **Negative:** about a quarter of a week's usage limit and 25–40 machine hours per block (the peer's estimate,
  unmeasured), up to the surviving pool's block count when a pair stays open; the owner approves the price for the whole
  pool.
- **Neutral:** these numbers are not comparable with Stage 5's, since A also gains runnable tests.

## Out of Scope

- A graded corpus of multi-step feature tasks (deferred: docs/BACKLOG.md §383)
- The bench's container shims and configuration W (external: tool-multipathreadwrite: its ADR for the stage)
- A hooks-only arm (deferred: docs/BACKLOG.md §382)

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| W hits the turn or time cap on one-shot fixes | Med | Med | Decision 3 sets the caps from the pilot and counts `limit` against the arm |
| The whole-suite check selects for small, clean suites | Med | High | Decision 1's rule: below 80% green or over a quarter of the budget, the stage waits for a scoped check |
| The stage runs the whole pool before every pair stops | Med | High | the owner approves the price for the whole pool, not one block |
| Emulated containers make attempts slow | High | Med | the pilot's timing goes to the owner before the price is approved |

## Rollback

None — measurement only; nothing on the served path changes until a later record acts on the verdict.

## Follow-ups

- [ ] The owner's word on the price, after the pilot.
- [x] Owner decision: Accepted by the owner, 2026-10-18 ("Accepted"). The price stays open: it is asked after the pilot, as T2 S2 says.
