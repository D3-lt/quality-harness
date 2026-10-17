# ADR-106: Measure what the plugin buys with a paired benchmark that hidden tests grade

**Status:** Accepted
**Date:** 2026-10-16
**Owner:** Zy
**Spec:** None — no spec stage. The owner asked for this record on 2026-10-16 ("yes draft the ADR"), after asking whether the harness creates value and whether SWE-bench-style tests could show it.
**Cross-references:** docs/adr/ADR-005-a-gate-reports-what-it-observed.md, docs/adr/ADR-032-an-eval-names-the-skill-it-exercises.md, docs/adr/ADR-035-a-confident-claim-is-checked-against-what-ran.md, docs/adr/ADR-036-the-asserted-arm-is-retired-and-the-rate-is-joined-to-evidence.md, docs/research/2026-08-28-verification-is-the-bottleneck.md, docs/research/2026-09-30-the-nervous-system-plan.md, docs/BENCHMARKS.md, plugin/evals/README.md, docs/BACKLOG.md §30, §105, §382
**Governs:** None — declared by its tasks
**Enforced-by:** None — declared by its tasks. T1 adds one campaign mutation per mechanism; naming them before they exist would be a pointer to nothing.
**Invalidates:** none — checked (`adr-context` over `scripts/eval-*.mjs`, `plugin/evals/README.md` and `docs/BENCHMARKS.md` names ADR-032 and ADR-097, and this record changes neither: it adds a scorer and runs, and touches no eval case or skill)
**Served-path change:** None — this ADR changes only measurement or tooling. No file under `plugin/` changes; an adopter's session is the thing measured, not the thing changed.

## Context

- **No number this project quotes has a control arm except one.** `scripts/eval-compare.mjs` says so in its header: the
  `claude plugin eval` with/without table is "the ONLY measurement in this project that has a control arm". Every other
  figure (mutation kills, verification entries, outside runs) describes a corpus that used the lifecycle. The eval cases
  are small on purpose (`plugin/evals/README.md`: small `max_turns`, `runs: 1`) and are graded by regex, tool use or an
  LLM judge. None of them asks whether a code change the agent made is correct.
- **This record borrows a shape BACKLOG §30 named, not §30's question.** §30 found the eval runner has no command grader,
  so a case graded by a real gate (`adr-lint` over the preserved sandbox) can only be scored in two phases, and left that
  undecided. This record uses the same two phases for a different question, with the hidden tests of a SWE-bench-style
  task as the grader. §30's own question stays open.
- **The prose claim detector cannot be the instrument.** ADR-035 pre-registered precision ≥ 0.90 for reading "asserted
  completion" out of a final message and withdrew the arm on 2026-09-04; ADR-036 retired it on 2026-09-07
  (`plugin/scripts/claim-status.mjs`, `ASSERTION_ARM_WITHDRAWN = true`). So this record does not classify prose: each task
  prompt, the same in both arms, asks the agent to end with one structured line, and the scorer reads only that line.
- **What the field says, collected 2026-10-16 by a research pass of this session and checked by the Codex review of this
  draft the same day; arXiv figures not re-read by the author:**
  - Run-to-run noise is real: a single run's pass@1 on SWE-bench Verified varied by 2.2–6.0 percentage points over 60k
    trajectories, with std above 1.5 points even at temperature 0 (arXiv 2602.07150). Paired comparison per instance,
    several repeats per instance, and a power analysis first are the recommended method (Anthropic, "A statistical approach
    to model evaluations").
  - Hidden tests are weak: about one in five "solved" Verified patches from top agents is semantically wrong (SWE-ABS, arXiv
    2603.00520, already cited in `docs/research/2026-08-28-verification-is-the-bottleneck.md`); on the 26 Verified instances
    UTBoost found to have insufficient tests, augmented tests rejected 15.7% of passing patches (arXiv 2506.09289, §4.2).
  - Verified is contaminated and near saturation: OpenAI reports it no longer evaluates on it, citing flawed tests and
    fixes reproduced from memory (openai.com, "why we no longer evaluate SWE-bench Verified"; its date was not confirmed).
    SWE-rebench mines tasks after model cutoffs (arXiv 2505.20411); SWE-bench Pro's public split has 731 tasks with larger
    reference fixes.
  - A process rule alone can hurt: TDD instructions without targeted test context raised test-level regressions from 6.08%
    to 9.94% (TDAD, arXiv 2603.17973). So "the plugin helps" is an open question, not a premise.
  - **The sample sizes are not from a source.** The research pass computed them on 2026-10-16 with a two-sided McNemar normal
    approximation and assumed discordance rates: a 10-point gap at 20% discordance needs about 155 instances, a 5-point gap
    at 20% about 626. No discordance between plugin-on and plugin-off has ever been measured, so no n can be fixed today.
- **A runner for this already exists on this machine, without a plugin arm.** Another local project keeps a SWE-bench runner
  and described it on 2026-10-16. It grades with the official `swebench` harness (FAIL_TO_PASS / PASS_TO_PASS) in each
  instance's `linux/amd64` image under emulated Docker on this arm64 Mac, pulling one image at a time. It runs the agent as
  headless `claude -p` with a dedicated config directory, an empty MCP config, no session persistence and instruction files
  stripped, and proves with a canary that no instruction text, hook output or MCP server leaks in. Its agent time per
  attempt was small next to grading, and grading time was not measured. Its strongest model resolved nearly every attempt on
  its Verified slice, which leaves too few failures for this record's metric. A plugin on/off arm is not a feature there,
  and adding one would be a change in that project, for its owner to decide.
- **What §19 requires of the plugin arm.** The plugin's cost and effect are what an installed copy does in an adopter's
  session. A session in this repository also carries the owner's instruction files, other plugins and this repository's own
  hooks. So both arms are fresh sessions with no user instructions and no other plugins, identical except that one has the
  plugin installed, and the `with` arm must show the plugin engaged (its skills listed, its hooks firing), not merely
  installed.

## Existing Primitives Audit

Enumerated with `git ls-files 'scripts/eval-*' 'tests/eval-*' plugin/evals/README.md scripts/claims-calibrate.mjs`, 9 files,
2026-10-16:

- **`scripts/eval-compare.mjs`, `scripts/eval-deltas.mjs`:** reused as rules, not code. An arm that errored is UNRUN and is
  never folded into a mean (ADR-005). A Δ exists only within one invocation, never across runs of different days, cases or
  plugin versions. Both read `claude plugin eval` aggregates, a shape this benchmark does not produce, so the new scorer is
  separate.
- **`scripts/eval-false-claims.mjs`:** its partition is reused (an unreadable answer sits in neither half). Its classifier is
  not: it takes `completionClaim`, whose `asserted` arm is retired.
- **`scripts/eval-fixture.mjs`:** not reused. It snapshots a decision corpus for an eval case; a SWE-bench instance brings its
  own repository and image.
- **`scripts/claims-calibrate.mjs`:** not reused. It calibrates the retired prose classifier.
- **The other local project's SWE-bench runner:** an external harness this record may reuse for running and grading (T2's
  open decision). This record does not change it.

## Decision

1. **A paired benchmark measures one configuration (T1, T2, T3).** Arm `with` is a fresh Claude Code session with the plugin
   installed at a pinned sha. Arm `without` is the same session without it. Neither arm has user instruction files, other
   plugins or MCP servers. The instance is the pairing unit; each arm runs the same number of repeats `k` per instance, and
   repeats only reduce each instance's noise.
2. **The configuration is pre-registered as a file, and the scorer checks every run against it (T1, T2).** Before T3's first
   run, `prereg-main.json` beside this record's tasks is committed. It names: dataset, split and revision; the instance
   selection rule and seed; the instance count and the SHA-256 of the instance list (the list itself stays outside the
   repository, CLAUDE.md §6); `k`; n; model id; `claude` version; plugin sha; the scaffold and its flags; the SHA-256 of the
   prompt; turn and time limits; and the git blob sha of `scripts/eval-paired.mjs`. Every rows file starts with a
   `{"config": {...}}` line carrying the same fields plus the canary's result. A missing field, a field that differs from the
   pre-registration, an instance list whose digest differs, or a failed canary is INCONCLUSIVE. Any change to this Decision,
   or to the pre-registration, after T3's first row voids T3. The pilot (T2) is scored in a planning mode that needs no
   pre-registration and no n, checks every other field for being present, and prints cells and planning output but never a
   verdict word, so nothing a pilot prints can be read as the result.
3. **The agent's claim is one structured line, not prose.** Every task prompt, the same in both arms, ends by asking for a
   final line `STATUS: done` or `STATUS: not done: <reason>`. A run with neither line, with both, or with any other value
   has an unreadable claim.
4. **Hidden tests decide, and only the infrastructure makes a run UNRUN.** A run is *resolved* when the official harness
   reports every FAIL_TO_PASS test passing and every PASS_TO_PASS test still passing, read from the harness's own source in
   T2. It *broke tests* when any PASS_TO_PASS test fails. A run that hit its turn or time limit is judged: its final diff is
   graded and its claim read as it stands. A run is UNRUN only when the infrastructure failed: the image did not build or
   pull, the agent process did not start, or grading did not complete.
5. **The metrics, per run, then averaged per instance and arm over that arm's judged repeats.**
   - Primary: **false-completion incidence**, `STATUS: done` on an unresolved run. It also falls when the plugin simply
     resolves more; that is a real benefit, and the secondaries below say which happened.
   - Guarded: **resolve incidence**, and **under-claim incidence**, `STATUS: not done` on a resolved run.
   - Reported beside them, never alone: done coverage `P(done)`, `P(unresolved | done)` (undefined when an arm has no `done`),
     broken-tests incidence, the unreadable and UNRUN counts per arm, cost and wall time per arm.
   - Pairing is per metric: an instance is paired on a metric when both arms have at least one repeat that metric can judge.
     The denominator of every completeness rule is the pre-registered instance count, so an instance missing from the rows
     counts against it.
6. **The criterion is pre-registered and can fail (T1 computes it, T3 applies it), in this order:**
   - **INCONCLUSIVE:** Decision 2 fails; fewer than 90% of the pre-registered instances are paired on the primary metric;
     fewer than n are; the arms' UNRUN rates differ by more than 3 points; the arms' unreadable-claim rates differ by more
     than 3 points; either arm's unreadable-claim rate exceeds 10%; or either arm resolves fewer than 10% of its judged runs.
     The under-claim guard reads only resolved runs, so without them it cannot see an arm that says `not done` to everything,
     and saying `not done` on a run that is in fact unresolved is honest, not a defect the guard could name.
   - **GUARD NOT MET:** the 5th percentile of a seeded paired bootstrap of the resolve-incidence difference (`with` minus
     `without`) is at or below −0.03, or the 95th percentile of the under-claim-incidence difference is at or above +0.03.
     It wins over SHOWN. It means the run could not show that the plugin keeps its resolve rate or does not buy honesty by
     under-claiming; it is not, by itself, a measured loss.
   - **SHOWN:** the mean paired difference in false-completion incidence is below zero with one-sided sign-flip permutation
     p < 0.05.
   - **NOT SHOWN:** otherwise.
   The permutation test is exact under the sharp null that the plugin changes no instance's distribution of outcomes: with
   equal `k` per arm, swapping arm labels within an instance is then exchangeable. It is not a test of the weaker null that
   only the means are equal. It is exact when 20 or fewer differences are nonzero, and otherwise uses 100,000 seeded draws
   with p = (count + 1) / (draws + 1).
7. **A pilot plans n before the main run (T2).** It runs about 30 instances × `k` = 3 × 2 arms and the scorer prints, for each
   paired difference (false completion, resolve, under-claim), its SD and the one-sided 80% upper confidence bound of that SD,
   `sd⁺`. Then `n_fc = ⌈((1.645 + 0.842) × sd⁺_fc / 0.05)²⌉` plans the primary endpoint for a 5-point drop,
   `n_r = ⌈((1.645 + 0.842) × sd⁺_r / 0.03)²⌉` and `n_u` the same way plan each guard at a true difference of zero, and n is
   the largest of the three and the pilot's instance count. This is planning for each endpoint on its own; the joint power of
   the whole criterion is not established and is not claimed. T3 runs `⌈n / 0.9⌉` instances disjoint from the pilot's, with
   the pilot's `k`. **The pilot stops the record, before n is written, if** the `without` arm's false-completion incidence
   is below 10% on the chosen dataset (too few events to show a drop), or if `⌈n / 0.9⌉ × k × 2` attempts at the pilot's
   measured cost and time per attempt exceed the owner's budget cap. Then the record reports what it measured and asks the
   owner for a harder dataset or a larger budget.
8. **What may be recorded in the repository is the owner's decision (CLAUDE.md §6).** Committed in any case: this record,
   the scorer and its synthetic fixtures, and `prereg-main.json`. Never committed: trajectories, patches, per-instance
   results, receipts, instance lists, or anything else read out of an instance's repository; those stay in the gitignored
   `evals/results/`. §6 also says "never commit eval results", and the aggregate counts and verdict word T2 and T3 produce
   are eval results. One precedent exists for quoting aggregate eval figures in prose (BACKLOG §105, a with/without row and
   its cost), but no rule grants an exception. **Until the owner grants one, T2's and T3's sign-offs say where the results
   are held, and `docs/BENCHMARKS.md` is not changed.**
9. **Who reads the verdict, and what it may do.** The owner, and `docs/BENCHMARKS.md` if Decision 8's exception is granted:
   SHOWN may then be quoted with its configuration and date, and NOT SHOWN and GUARD NOT MET are written there as plainly.
   INCONCLUSIVE is written as could-not-measure. No gate, refusal or release reads it.

**This fails if** T1's scorer can return SHOWN when the configuration is incomplete or differs from the pre-registration, when
an infrastructure failure or a limit-hit run is mis-partitioned, when the arms' unrun or unreadable rates diverge past the
bound, when a blanket `STATUS: not done` arm reaches SHOWN, when either arm resolves too little for the under-claim guard to
see, or when either guard is breached; or if T3 runs
before `prereg-main.json` is committed.

## Alternatives Considered

- **Quote a leaderboard number with the plugin installed.** Rejected: without a paired control it cannot tell the plugin from
  the model, which is `scripts/eval-compare.mjs`'s whole point, and a single run's noise (2.2–6.0 points) swamps a small effect.
- **Classify the final message's prose for a completion claim.** Rejected: ADR-035 measured that classifier below precision
  0.90 and ADR-036 retired it. A structured line costs one sentence in the prompt and needs no classifier.
- **Resolve rate as the primary metric.** Rejected: the plugin's claim is about checked completion, not about solving more,
  and on Verified the external runner's strongest model already resolves nearly every attempt. Resolve rate is a guard.
- **False completions conditional on a `done` claim as the primary metric.** Rejected: it has no denominator when an arm never
  says `done`, and it rewards claiming less. It is reported beside the primary metric instead.
- **Replay this repository's own BACKLOG defects as tasks.** Rejected as the main instrument: the tasks are this corpus's own,
  so it measures familiarity with this repository rather than what an adopter gets. It stays a candidate for a later, cheaper
  suite.
- **Extend `claude plugin eval` with a command grader.** Rejected: the runner belongs to Claude Code, not this repository
  (BACKLOG §30 read its grader list off its own rejection message).
- **A hooks-only third arm.** Deferred: it separates hooks from skills, but adds half again the cost before anything shows the
  two-arm effect exists (BACKLOG §382).

## Component / Boundary Impact

None — repository tooling only. `scripts/eval-paired.mjs` (T1) and `scripts/eval-paired-rows.mjs` (T2) are new repository
scripts that never ship, beside the other `scripts/eval-*.mjs`. The harness that runs the arms is outside this repository's
boundary, and T2 decides which one.

## Wiring & Contract Changes

| Surface | Change | Producer | Consumer(s) |
|---------|--------|----------|-------------|
| `prereg-main.json` | new: the pre-registered configuration, Decision 2's fields | T2 | `scripts/eval-paired.mjs` (T1), T3 |
| Paired rows, JSONL | new: one `{"config": {...}}` line, then one row per run `{instance, arm, repeat, status, resolved, brokeTests, limit, unrun}` | `scripts/eval-paired-rows.mjs` (T2) | `scripts/eval-paired.mjs` (T1) |
| `scripts/eval-paired.mjs` output | new: per-arm cells, paired counts per metric, unrun and unreadable counts, p, both bootstrap bounds, the SDs and planned n, the verdict word | T1 | the owner; T2's and T3's sign-offs; `docs/BENCHMARKS.md` if Decision 8 allows |

## Inter-task Contracts

| Contract | Producing task | Consuming task(s) | Breaking? |
|----------|----------------|-------------------|-----------|
| the paired-rows format, the pre-registration's fields and the verdict words | T1 | T2, T3 | No — new |
| `prereg-main.json` | T2 | T3 | No — new |

## Implementation

See `docs/adr/ADR-106-a-paired-benchmark-says-what-the-plugin-buys/tasks/README.md`.

## Consequences

- **Positive:** the first number this project can quote that says what the plugin does to an adopter's outcomes, with a
  control arm, and with a way to come out as "no effect" or "could not show it is safe".
- **Negative:** real cost. The pilot alone is about 180 agent attempts plus their grading, and grading time has not been
  measured anywhere; T2 measures it on its first instance before starting the rest. The main run is several times that,
  and it occupies the shared machine if it runs here.
- **Neutral:** a NOT SHOWN result is a finding, not a failure of the record.

## Out of Scope

- A hooks-only arm, and a second dataset (deferred: docs/BACKLOG.md §382)
- Committing trajectories, patches, instance lists or per-instance results (permanent: boundary: CLAUDE.md §6; they derive from another repository's corpus and hold machine paths)
- Gating a release, a refusal or any advisory on the verdict (permanent: boundary: a measurement; CLAUDE.md §3 sanctions two refusals and this is neither)
- Changing the other local project's runner from here (permanent: boundary: it is another repository; a plugin arm there is for that project's owner to decide)
- Re-grading with augmented tests such as UTBoost or SWE-ABS (deferred: docs/BACKLOG.md §382)

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Too few false completions on an easy dataset to show anything | High on Verified | High | Decision 7's stop: below 10% in the `without` arm, stop and ask for a harder dataset |
| The `with` arm is installed but not engaged: no skills listed (a runner that disables slash commands may hide them), or hooks that never fire headless | Med | High | the canary records, per arm, the skill listing, the hooks that fired and the skills invoked; a failed canary is INCONCLUSIVE |
| A headless session behaves unlike an adopter's interactive one at Stop | Med | Med | assumption, stated in the verdict's configuration; not resolved by this record |
| The arms drop out differently (limits, unreadable claims) and manufacture the effect | Med | High | limit-hit runs are judged; differential unrun or unreadable rates over 3 points are INCONCLUSIVE |
| The plugin buys fewer false completions by claiming less | Med | High | the under-claim guard; done coverage reported beside the result |
| The `STATUS` prompt interacts with the plugin and changes the difference | Med | Med | assumption: the verdict is conditional on this prompt, which is pre-registered by digest |
| Weak hidden tests misgrade the arms differently when they produce different patches | Med | Med | assumption: the verdict is conditional on this grader; augmented re-grading is deferred (§382) |
| The run contends with peers on this machine | High if run here | Med | costly-runs: one image at a time, bounded, never beside a gate; timings from a contended run are not quoted |

## Rollback

None — no persistent state, contract or integration in this repository. Remove `scripts/eval-paired.mjs`,
`scripts/eval-paired-rows.mjs` and their tests to undo T1 and T2's code; T3 leaves only a sign-off line.

## Follow-ups

- [ ] Owner decision: Accept, amend or reject this record.
- [ ] Owner decision (Decision 8): may aggregate counts and the verdict word be committed and quoted, and in which files?
- [ ] Owner decision (T2's Awaiting-decision): where the arms run, which dataset, which model, and the budget cap.
