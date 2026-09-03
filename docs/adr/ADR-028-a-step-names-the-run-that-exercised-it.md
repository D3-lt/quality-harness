# ADR-028: Bind an ordered step to the run that exercised it, so a skipped step is loud

**Status:** Accepted
**Date:** 2026-09-03
**Owner:** zy
**Spec:** None — no spec stage
**Cross-references:** docs/adr/ADR-018-every-ordered-step-names-its-proof.md, docs/adr/ADR-022-a-fence-names-what-its-claim-rests-on.md, docs/adr/ADR-005-a-gate-reports-what-it-observed.md, docs/adr/ADR-014-a-task-that-is-honestly-unfinished.md, docs/research/2026-08-28-verification-is-the-bottleneck.md, docs/BACKLOG.md
**Governs:** None — declared by its tasks. The files this decision owns are created and edited by T1 and T2, and `tests/gate-regressions.py::every pointer in this corpus resolves` correctly refuses a record declaring authority over paths that do not exist yet.
**Enforced-by:** `tests/gates.test.mjs::a step whose proof is a named test has a run that names it`
**Invalidates:** none — checked. ADR-018 decided that every ordered step NAMES its proof; this decides that the naming is checked against a run. That is additive: no ADR-018 task changes, and a record conforming to ADR-018 today keeps conforming. ADR-022 is the same shape one level over (a fence names the mechanisms it rests on, and a mutant names which one it covered) and is untouched.
**Served-path change:** A task whose ordered steps were skipped, or whose named test never ran, is reported — where today the record reads identically whether the executor followed the plan or produced the artifact some other way.

## Context

**The trigger is delegation.** The owner reports that handing tasks to a smaller model
(Haiku) fails on reasoning and step-planning rather than on writing code, and asks whether an
intermediate layer — decision, then plan groups, then tasks — would let a weak model execute while a
strong one plans and monitors.

The literature answers the first half clearly and the second half awkwardly, and both halves matter
here:

- **[PEAR (arXiv 2510.07505)](https://arxiv.org/html/2510.07505v3), 23 planner/executor pairs:** a
  strong planner with a WEAK executor reaches ~50% utility, while a weak planner with a STRONG
  executor reaches ~30%, against 65–85% for strong/strong. Their conclusion is the asymmetry: *"a
  weak planner constrains the entire system, and its negative effect cannot be offset even by
  stronger executors."* Splitting the roles is sound, and the planner is the half that must stay
  strong.
- **[Diff-XYZ (arXiv 2510.12487)](https://arxiv.org/abs/2510.12487), and it cuts the other way:**
  format choice materially changes success for large models, while *smaller models benefit little
  from any formatting choice*. A stricter plan format will not make a weak model decompose. It will
  make its failures better-shaped.

Those are not in conflict. Together they say the plan must REMOVE the need to reason rather than
constrain the shape of the output — and that the value of a strict format lies somewhere other than
in making the executor smarter.

**Where it lies is what this record acts on.** A peer session that maintains `mrw` — a tool whose
edit plans are refused unless exactly formed — was asked directly what its format does and does not
buy, and answered against its own tool (2026-09-03):

- The effect size is **unmeasured**: 19 plans, 18 applied, 1 refused, and that task is deliberately
  parked at `partial` because under 30 samples a percentage is noise wearing a decimal point.
- The transferable part is not the grammar. It is **a per-unit verdict, so a no-op cannot read as
  success**; a precondition forcing the executor to have looked; and an independent downstream gate.
- The residual is **conformant-and-wrong, and it is not rare**: three perfectly-formed plans that did
  the wrong thing in one session, all applied at exit 0 with every guard satisfied, all caught
  downstream. The session writing THIS record hit the same class four times the same day.

**What this repository already has, and what it does not.** ADR-018 gave every ordered step a stable
`[S<n>]` identity and a declared proof — `[proof: acceptance]`, `[proof: mutation]`,
`[proof: human: …]`, or a row in the Tests table. `adr-lint` checks that every step is ACCOUNTED
FOR. Nothing checks that the account is true. `adr-verify` writes a Verification Log and a Mutation
Log, and both record an OUTCOME: the fence passed, a mutant died. Neither records that step S3
happened.

So a task file today reads identically whether its steps were followed in order, or the artifact was
produced some other way and the fence happened to pass afterwards. That is the gap a weak executor
falls through, and per this project's own field notes it is the dominant failure mode:
**false success is 75.8% among self-assessing coding agents**, and **LLM judges cannot detect it**
(AUROC ≤ 0.65) while cheap deterministic detectors reach 0.83–0.95.

## Existing Primitives Audit

- **ADR-022's `--covers`** is this decision's direct ancestor and the reason to believe it works: it
  made a mutant name the MECHANISM it covered, and `adr-lint` reports a declared mechanism with no
  bound kill. Executing ADR-027 on 2026-09-03 that advisory found three real defects in one
  session — a fence that passed on a no-op, and two assertions satisfied by a second mention of the
  same word — none of which was visible by reading. **Reshape, do not reinvent:** the same
  bind-and-report machinery answers this question for steps.
- **`proof_map` in `plugin/bin/adr-lint`** already parses `[S<n>]` identities and the Tests table's
  `Steps` column. It has the graph; it does not consult evidence.
- **`append_entry` / the Verification Log grammar in `plugin/bin/adr-verify`** already carries an
  optional trailing field (`· covers:…`). A step field is the same extension.
- **`scripts/backlog-claim-sweep.mjs`** (2026-09-03) is the pattern for the cheap half: compare what
  a message CLAIMS against what a diff actually touched. Reused as a shape, not as code.
- No existing primitive records anything per step. Nothing to reshape there.

## Decision

**A run may name the steps it exercised, and a step whose declared proof is a named test is reported
when no run names it.**

Concretely: `adr-verify` accepts `--steps S1,S3` and writes it as a trailing `· steps:S1,S3` field on
the Verification Log entry, under the same grammar and digest rules every other field already obeys.
`adr-lint` then reports — as ADVICE, never a block — any step whose declared proof is a test row for
which no exit-0 entry names that step.

**Three limits are part of the decision, not caveats bolted to it.**

**The verdict is never the executor's self-report.** `--steps` is written by the tool during a run
that actually executed the fence, exactly as `--covers` is. A field an agent could set by asserting
it would reproduce the 75.8% false-success number in a new column, and this corpus already refuses
self-declared evidence — the hand-filled `## Mutants` table was removed for precisely that.

**It is advisory and stays advisory.** `done` continues to require what it requires today: an exit-0
entry against the current fence, and a killed mutant. Making step coverage blocking would select for
declaring fewer steps, and the gate would then report the resulting silence as coverage — the ADR-005
failure this project keeps naming.

**It cannot see conformant-and-wrong, and says so.** A step that ran and did the wrong thing is
indistinguishable here from a step that ran and did the right thing. This closes the SKIPPED-step
hole only. The residual is real, was measured by two independent sessions on one day, and the answer
to it remains an independent downstream gate — review and mutation — not this field.

**Pre-registered failure, with data that could produce it today.** After twenty tasks executed under
this, count the tasks whose `steps:` field names every step versus those naming a subset. If nearly
all name every step, the field is being filled as a formality and is worth no more than the proof map
it duplicates — delete it. `grep -c 'steps:' docs/adr/*/tasks/*.md` against the same corpus's step
counts is the check. Valid for a corpus whose tasks carry 2–8 ordered steps; do not carry the
threshold to longer plans.

## Alternatives Considered

- **Have the executor report per-step status directly.** Rejected: it is self-assessment, the exact
  thing the corpus's own evidence rules exist to refuse, and the field notes put its false-success
  rate at 75.8%.
- **A model judge reading the transcript for conformance.** Rejected on this project's own cited
  numbers: LLM judges reach AUROC ≤ 0.65 on false success and grade the tone of the report, while
  deterministic detectors reach 0.83–0.95. A judge here would add cost and a verdict nobody should
  trust.
- **Derive step coverage from the diff** — each step names files, check the commit touched them.
  Rejected for now: `Ordered Steps` do not carry per-step file attribution; `Affected Files` is a
  task-level table. Adding per-step files to the template is a larger change to every task ever
  written, and the test-row binding gets most of the value without it. Revisit if the pre-registered
  failure above fires for the opposite reason.
- **Make it blocking.** Rejected — see the Decision. It would select for under-declaration.
- **Do nothing, and rely on review.** Genuinely tempting, and it is what happens today. Rejected
  because the gap is invisible rather than merely uncovered: nothing in the record distinguishes a
  followed plan from an unfollowed one, so a reviewer has nothing to review against.

## Component / Boundary Impact

Two components change, both already owned by the evidence chain: `plugin/bin/adr-verify` gains an
optional flag and an optional entry field; `plugin/bin/adr-lint` gains one advisory that reads the
proof map it already parses against the log it already reads. No new component, no new file that
another module imports, no change to who owns what.

## Wiring & Contract Changes

| Surface | Change | Producer | Consumer(s) |
|---------|--------|----------|-------------|
| `adr-verify <task> --steps S1,S3` | new optional flag | T1 | anyone executing a task; `/quality-harness:adr-execute` |
| Verification Log entry grammar | new optional trailing ` · steps:S1,S3` field | T1 | `adr-lint`, `adr-next`, `adr-retire-check` — all read this grammar |
| `adr-lint` advisory | new: a step whose proof is a named test that no entry names | T2 | record authors |

The entry grammar is the one real contract here: three gates parse it, and ADR-021 makes a removed
row a change to the evidence. The field is OPTIONAL and trailing, so every existing entry stays
valid and every existing reader keeps working — that is a deliberate constraint on the design, not a
happy accident.

## Inter-task Contracts

| Contract | Producing task | Consuming task(s) | Breaking? |
|----------|----------------|-------------------|-----------|
| ` · steps:S1,S3` trailing field in a Verification Log entry | T1 | T2 | No — optional and trailing; entries without it remain valid and T2 reports their absence as advice rather than as malformed |

## Implementation

See `tasks/README.md`. Two tasks.

## Consequences

- **Positive:** a skipped step stops being invisible, which is the precondition for delegating
  execution to a model that cannot be trusted to plan. The monitor gets a channel that says "step 4
  did nothing" rather than inferring it from a passing fence.
- **Positive:** it reuses the mechanism ADR-022 already proved on this corpus, so the risk is in the
  wiring rather than in the idea.
- **Negative:** another optional field on an entry grammar that three gates parse. Mitigated by
  making it trailing and optional, and by the pre-registered deletion criterion.
- **Negative, and the honest one:** this does not make a weak model plan. Diff-XYZ says formatting
  buys small models little, and both sessions that looked at this produced perfectly conformant work
  that was wrong. **The claim is narrowly that skipped work becomes loud** — not that delegated work
  becomes correct.
- **Neutral:** `done` is unchanged, so no existing record's status moves.

## Out of Scope

- Per-step file attribution in `Ordered Steps`, and any diff-derived step coverage (deferred: docs/BACKLOG.md §114)
- An agent-facing "plan group" artifact between an ADR and its tasks — the tasks README already carries waves, `Depends-on`, `Produces`/`Consumes`, and `adr-lint` already enforces a valid topological leveling (permanent: boundary: the layer exists; what was missing is the verdict channel, which is what this record adds)
- Any change to which model executes a task, or any routing by model capability (permanent: boundary: this record adds a channel; deciding who listens to it is a separate decision with its own evidence)
- Measuring whether a weak executor improves under this (deferred: docs/BACKLOG.md §114)
- A model judge scoring trajectory conformance (permanent: fact: LLM judges reach AUROC ≤ 0.65 on false success while deterministic detectors reach 0.83–0.95; citation: file `docs/research/2026-08-28-verification-is-the-bottleneck.md:40`)

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| The field is filled as a formality and duplicates the proof map | Med | Med — a second place to keep in sync, for nothing | The pre-registered failure in the Decision, with a named command and a corpus that can produce it |
| An author reads the advisory as a block and under-declares steps | Med | High — the gate would then report silence as coverage (ADR-005) | Advisory only; `done` unchanged; the advisory's wording names the two counts it took and claims nothing else |
| The optional trailing field breaks a reader that parses the entry strictly | Low | High — three gates read this grammar, and ADR-021 makes a lost row a change to the evidence | T1's fence runs the existing evidence-chain suite; the field is trailing and optional by construction |
| It is mistaken for a fix to delegated correctness | High | Med — the wrong conclusion is the expensive one | Stated in Consequences and in the Decision's third limit, and the record refuses to claim it |

## Rollback

Remove the `--steps` flag from `adr-verify`, remove the advisory from `adr-lint`, and leave every
written entry exactly where it is: the field is optional and trailing, so entries carrying it stay
valid under the grammar without it. No persistent state, no migration, and no evidence row is
rewritten — which is ADR-021's requirement and the reason the field was designed trailing.

## Follow-ups

- [ ] After twenty tasks, run the pre-registered check and delete the field if it is being filled as
      a formality.
