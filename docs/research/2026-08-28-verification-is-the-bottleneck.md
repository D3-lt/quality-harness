# Field notes: verification is the bottleneck

**Retrieved 2026-08-28.** What the labs and the literature currently say about how agentic
development systems should help people, what the effective practice is, what fails silently, and how
any of it is measured.

**These figures are as reported by their sources.** Nothing here was independently reproduced in this
repository, and a number without a date beside it is a number that has already started rotting. Where
a claim matters to a decision, follow the link and check it against the version you are reading.

This file exists because this project makes claims of exactly the kind the literature is now
learning to distrust — "the tests pass", "the task is done" — and it should be able to say where its
own design agrees with the field, where it goes further, and where it deliberately differs.

---

## 1. The finding everything converges on

**Verification, not generation, is the constraint.** This is a reversal, and it is stated most
directly by *The Verification Horizon* (arXiv 2606.26300): the classical assumption that checking is
easier than producing no longer holds for coding agents. Its central claim is that **no fixed reward
function stays effective as policy capability grows** — human intent is underspecified, and
optimization widens the gap between the proxy and the intent until you get reward hacking or signal
saturation. Its prescription is that **verification must co-evolve with the generator**, and it
proposes grading verification itself along three axes: *scalability, faithfulness, robustness*.

The practitioner data says the same thing from the other end. Sonar's *State of Code* 2026 survey:
**96% of developers do not fully trust AI-generated code without manual intervention**, against
adoption near 84% and trust near 29–33%. The gap has a name now — the **verification bottleneck** —
and it is worse than it was with autocomplete for a structural reason: one silent failure from an
agent touches far more of a codebase than one bad suggestion ever did.

> **Implication for this project.** The thing worth selling is not that the harness makes an agent
> faster. It is that it makes the agent's claims checkable. That is the scarce good.

---

## 2. What to watch out for: the failure mode is silence

### False success is the dominant failure, and it is quantified

*From Confident Closing to Silent Failure* (arXiv 2606.09863) defines **false success** as an agent
asserting completion when the environment state says otherwise.

| Setting | False-success share of failures |
|---|---|
| Single-control benchmark domains | 45–48% |
| Dual-control (telecom) | 3% |
| **Self-assessing coding agents making explicit status claims** | **75.8%** |

The detection result is the part to internalize:

- **LLM judges never exceeded AUROC 0.65** in any configuration. They key on *confident closing
  language* rather than on verified state change — they grade the tone of the report.
- A **lightweight TF-IDF detector reached AUROC 0.83–0.95**, recovered **4–8× more false successes**,
  at **3,300× lower latency**.

Their recommendation: use cheap, domain-calibrated **deterministic** detectors as the primary triage
signal. Do not make an LLM judge the monitor of record.

### The same shape at the action boundary

*Reason Less, Verify More* (arXiv 2607.07405, KDD-ETAAI '26): **78% of observed failures are silent
wrong-state failures with no tool error** — the tool accepted a syntactically valid call that
violated policy, so nothing anywhere reported a problem. A suite of deterministic, **read-only
pre-execution gates** lifted gpt-4o-mini from **29.6% → 42.0%** and gpt-5.2 from **61.2% → 71.6%**.

Their honest limitation, worth repeating: deterministic gates do not guarantee task success. They
deterministically prevent one *known class* of silent violating writes.

### Most agent failures are configuration failures

From Google/Kaggle's *The New SDLC With Vibe Coding* (Osmani, Saboo, Kartakis; 51 pp., June 2026):
most agent failures are **configuration failures, not model inadequacy**. This is the most
actionable sentence in the whole corpus for anyone shipping a harness — it says the leverage is in
the harness, not in waiting for a better model.

---

## 3. A green suite is evidence about the suite

*SWE-ABS* (arXiv 2603.00520, ICML 2026) is the strongest single result here, and it is the one to
cite when somebody asks why a mutation campaign is worth its runtime.

Re-evaluating SWE-bench Verified: **one in five "solved" patches from the top-30 agents is
semantically incorrect**, passing only because the test suite was too weak to expose it. Their
adversarial strengthening runs in two stages — coverage-driven augmentation via program slicing to
reach untested regions, then **mutation-driven adversarial testing** synthesizing plausible-but-wrong
patches to expose semantic blind spots.

Results: **50.2% of instances strengthened** (25.1× prior work), **19.71% of previously passing
patches rejected**, and the top agent falling from **78.80% → 62.20%**, with the previously
top-ranked agent dropping to **fifth**. An independent ICSE 2026 empirical study reaches the same
conclusion by a different route.

> **Implication.** "The tests pass" is a statement about the tests. Mutation is the field's standard
> instrument for converting it into a statement about the code, and a leaderboard number produced
> without one is not comparable to a number produced with one.

---

## 4. Vacuity has a formal name and a formal gate

*Containment Verification* (arXiv 2605.09045) runs specification validation through **three gates
that must all pass**:

1. **Resolution** — the artifact parses and typechecks inside a timeout.
2. **Vacuity** — a permissive-stub variant, with the inductive invariant gutted to its wellformedness
   clause alone and the lemma bodies emptied, **must fail verification**. A specification that admits
   this mutation cannot be demanding the properties it claims to demand.
3. **Discrimination** — an LLM-generated plausible modeling error **must also fail**. A specification
   that accepts it cannot tell a faithful refinement from a faulty one.

The methodology descends from IronSpec's mutation-based specification validation.

Gate 2 is the formal statement of a defect this repository has measured four times: an assertion that
cannot fail. `assert.deepEqual(uncovered(...), [])` against a subject mutated to return `[]` passes at
100% line *and* branch coverage. **Coverage cannot see vacuity** — only a mutation can.

---

## 5. How to measure: trajectory *and* outcome, continuously, on your own repository

This is now vendor consensus rather than a research position.

- **Google** ships trajectory evaluation as a product surface. The Vertex Gen AI evaluation service
  returns **trajectory metrics and final-response metrics from one SDK call**, with metrics such as
  `trajectory_exact_match`. It sits inside a named **Agent Development Lifecycle (ADLC)** with its
  own Agents CLI, built for coding agents (Gemini CLI, Claude Code, Cursor) to drive.
- **OpenAI**'s evaluation guidance: test **full trajectories — tool choice *and* outcomes**, not just
  final answers; grade rather than pass/fail; treat evaluation as **continuous**, not point-in-time
  certification. *Operational note:* the hosted Evals platform goes read-only **2026-10-31** and shuts
  down **2026-11-30**, so do not build a handover on it.
- **Google/Kaggle's new-SDLC whitepaper** frames the role change: implementation compresses to
  minutes-to-hours while requirements, architecture and verification stay slow and human. The
  engineer becomes the **"arbiter of quality"**. Three lines worth quoting into any handover:
  **context engineering is a first-class architectural decision, reviewed and versioned like code**;
  **"set the bar at the eval, not the demo"**; and the configuration-failure finding above.

**Output evaluation asks whether the result is right. Trajectory evaluation asks whether the sequence
that produced it was sound.** A tool-written Verification Log is output evidence. An advisory that
fires when *every* logged entry passed and no mutant was ever killed is trajectory evidence — the
run looks clean because nothing was ever tried that could fail.

---

## 6. How to build the harness: Anthropic's line

- **Building Effective AI Agents** — across dozens of teams, the most successful implementations used
  **simple, composable patterns**, not frameworks or specialized libraries.
- **Claude Code best practices** — nearly every practice descends from one constraint: **context
  fills fast and performance degrades as it fills**. Hence the Writer/Reviewer split: **a fresh
  context reviews better because it is not biased toward code it just wrote.** A different-lineage
  reviewer (Codex) is the stronger form of the same idea.
- **Effective harnesses for long-running agents** — an initializer agent lays down a progress file, a
  `feature_list.json`, and an init script; the coding agent reads progress plus git log, works one
  feature at a time, and tests before marking anything complete. Named failure modes: **premature
  project completion**, undocumented buggy progress, incomplete features, inefficient onboarding.
  Success is defined as **sustainable progress** — code fit to merge to main — not speed.

  Their guard against premature completion is worth stealing verbatim: **every feature starts marked
  "failing"**, so "done" is a state something had to actively change. That is the same asymmetry as
  refusing a `done` row without a tool-written exit-0 entry behind it.

---

## 7. Vendor claims are outrunning independent verification

Kimi K2.6 leads SWE-Bench Pro at **58.6%** (GPT-5.4 57.7%, Opus 4.6 53.4%, Gemini 3.1 Pro 54.2%),
with claims of 12-hour autonomous sessions and agent swarms coordinating up to 300 sub-agents across
4,000 steps. **No third-party replication of the swarm claim has been published**, the figures are
vendor-measured under vendor-chosen conditions, and — in the reviewers' words — they are not a
substitute for testing on your own repository.

The number that predicts production behaviour better than any leaderboard peak: **hallucination on
AA-Omniscience fell from 65% (K2.5) to 39% (K2.6)**. Calibration, not capability.

> **Implication.** When choosing a model for this harness, weight *calibration* and *your own
> corpus* over leaderboard position. The harness's whole premise is that a confident wrong answer is
> the expensive failure.

---

## 8. What this means for quality-harness

### Where the design already agrees with the field

| Field finding | What this project already does |
|---|---|
| Deterministic detectors beat LLM judges for false success | Every gate is deterministic. `adr-judge` is explicitly barred from the evidence chain — a model verdict may never enter it. |
| A green suite proves little without mutation | `tests/mutations.json` + `scripts/mutate.mjs`; `adr-lint` refuses a `done` row without a `mutant killed` entry. |
| Vacuity needs its own gate | Every "clean" predicate must be shown able to return dirty in the same test. Four vacuous assertions found this way. |
| "Could not determine" is not "passed" | Tri-state verdicts: `UNRUN`, `PARTIAL`, `UNPROVEN`, `STALE`. ADR-005 and ADR-006. |
| Premature completion is a named failure mode | `done` requires a tool-written exit-0 entry whose digest matches the current fence. |
| Fresh, ideally different-lineage review | `/quality-harness:codex-review`. |
| Context is the scarce resource | Skills load lessons from `references/` rather than inline; `adr-execute` moved 155 lines out of its body for exactly this reason. |

### Where the field is ahead of this project

1. **No false-success rate is reported.** It is the headline metric of the 2026 literature and this
   project has the raw material for it — the campaign's noticed/total ratio is close, but it measures
   the *suite*, not the *agent's claims*. Worth defining one.
2. **Trajectory evaluation is thin.** One advisory exists (every entry passed, no mutant killed).
   Google and OpenAI both treat trajectory as a first-class metric class alongside outcome.
3. **`Governs:`, `Cross-references:` and `Invalidates:` resolve to nothing.** Pointers that rot
   silently — BACKLOG §44 and §45. The corpus un-governed itself on 2026-08-28 and no gate noticed.
4. **Evals measure the skills, not the harness's effect on false success.** The eval corpus asks
   whether a skill fires; nothing yet asks whether the harness reduces confidently-wrong claims.

### STATUS 2026-09-01 — the list above is four days old and two of its four items have moved

**Re-checked against the code rather than from memory**, because a document that lists a closed gap
as open teaches every reader to go and build something that exists. That is the same defect as
CLAUDE.md §7's claim about `resolve_bash()`, one file over, and this file is read as the reason for
design decisions.

| # | Gap as written 2026-08-28 | Verified state 2026-09-01 |
|---|---|---|
| 1 | No false-success rate is reported | **Mechanism shipped, and now a number.** `adr-verify --sweep` re-checks every recorded claim against its own fence into four disjoint, total buckets, with `superseded` and `unrunnable` in NEITHER half of the ratio. Run against this corpus: **52 claims — 37 held, 0 false, 15 superseded, 0 unrunnable.** Narrower than the literature's metric, and the difference matters: this measures RECORDED claims re-checked later, not an agent's status assertions mid-task, which is what the 75.8% figure is about. |
| 2 | Trajectory evaluation is thin — one advisory | **Materially advanced, still not a metric class.** Five process-shape checks now exist where there was one: step 1 must establish a failing test; every-entry-passed with no mutant killed; `MUTATION_REQUIRED_FROM`; `DURATION_REQUIRED_FROM` (ADR-020, a duration that could not have run the fence); and a committed entry gone missing (ADR-021). All are per-record advisories. Nothing AGGREGATES them, so there is still no trajectory score to report — which is what Google and OpenAI mean by a metric class. |
| 3 | `Governs:`, `Cross-references:` and `Invalidates:` resolve to nothing | **CLOSED** by ADR-011, 2026-08-29. `check_pointers` resolves every declared path against `tracked_paths()` — `git ls-files` plus untracked-and-not-ignored — and advises when one matches nothing. BACKLOG §44 and §45 both closed. |
| 4 | Evals measure the skills, not the harness's effect on false success | **OPEN, unchanged.** Seven cases, all asking whether a skill fires or whether an instruction moves an answer. None asks whether the harness reduces confidently-wrong claims. This is now the oldest untouched item on this list. |

**So the standing gap is item 4, and item 2's aggregation.** Item 1 is answerable on demand and the
answer today is zero false successes over 37 re-checkable claims; item 3 is gone.

### STATUS 2026-09-04 — three days on, re-checked against the code and the corpus again

Same method as the block above: read the code, run the tool, do not quote the previous table.

| # | Gap as written 2026-08-28 | Verified state 2026-09-04 |
|---|---|---|
| 1 | No false-success rate is reported | **Not re-measured today, and the reason is a finding.** `adr-verify --sweep docs/adr` at HEAD runs seventeen task fences that each invoke `scripts/mutate.mjs`; on today's catalogue one of them runs past the sweep's 900-second timeout, and the first attempt was killed mid-campaign with a mutant left in the tree — BACKLOG §120. A second run is in progress in a clone. The 2026-09-01 figure — 37 held, 0 false, 15 superseded, 0 unrunnable over 52 claims — stands as the last measurement, and its `0 unrunnable` will not survive a re-run at this timeout. Meanwhile a production number for the *wider* metric now exists (§11: 22.58% of real misalignment episodes are the agent misreporting its own state). |
| 2 | Trajectory evaluation is thin | **Unchanged.** `plugin/bin/adr-lint:2122` still carries the one comment that says TRAJECTORY, the five per-record advisories still exist, and nothing aggregates them. SlopCodeBench (§11) is what a trajectory metric class looks like from the outside: two numbers per trajectory, reported across every checkpoint. |
| 3 | Pointers resolve to nothing | **Closed**, unchanged since ADR-011. |
| 4 | Evals measure the skills, not the harness's effect on false success | **Open.** Eight cases now, not seven — `a-vacuous-test-is-not-a-review` was added and it asks whether `review` fires, so it is another skill-fires case. Still nothing asks whether the harness reduces confidently-wrong claims. Oldest untouched item, seven days old. |

### The one genuine tension, to be raised before someone else raises it

This project's rule is **instruct, never block** — a blocked user cannot tell what to do next, which
is worse than having no plugin.

*Reason Less, Verify More* gets its entire measured gain from gates that **refuse the write**.

The reconciliation to defend, rather than pretend the tension is not there: **block where the gate
states a fact about a known-unsafe write; advise where the gate exercises judgement.** The
never-block reasoning is airtight in the judgement case and much weaker where the gate knows,
deterministically, that the action violates a stated policy. This project currently has no
action-boundary gates at all — every gate reads artifacts after the fact — so the tension is
latent rather than live. It becomes live the day one is added.

---

## Sources

| # | Source | Identifier |
|---|---|---|
| 1 | The Verification Horizon: No Silver Bullet for Coding Agent Rewards | [arXiv 2606.26300](https://arxiv.org/pdf/2606.26300) |
| 2 | From Confident Closing to Silent Failure: Characterizing False Success in LLM Agents | [arXiv 2606.09863](https://arxiv.org/abs/2606.09863) |
| 3 | Reason Less, Verify More: Deterministic Gates… (KDD-ETAAI '26) | [arXiv 2607.07405](https://arxiv.org/abs/2607.07405) |
| 4 | SWE-ABS: Adversarial Benchmark Strengthening Exposes Inflated Success Rates (ICML 2026) | [arXiv 2603.00520](https://arxiv.org/abs/2603.00520) |
| 5 | Are "Solved Issues" in SWE-bench Really Solved Correctly? (ICSE 2026) | [software-lab.org](https://software-lab.org/publications/icse2026_SWE-bench-correctness.pdf) |
| 6 | Containment Verification: AI Safety Guarantees Independent of Alignment | [arXiv 2605.09045](https://arxiv.org/html/2605.09045) |
| 7 | Cheap Code, Costly Judgment: Governable Agentic Software Engineering | [arXiv 2607.01087](https://arxiv.org/pdf/2607.01087) |
| 8 | Anthropic — Building Effective AI Agents | [anthropic.com](https://www.anthropic.com/engineering/building-effective-agents) |
| 9 | Anthropic — Claude Code best practices | [anthropic.com](https://www.anthropic.com/engineering/claude-code-best-practices) |
| 10 | Anthropic — Effective harnesses for long-running agents | [anthropic.com](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents) |
| 11 | OpenAI — Evaluation best practices | [developers.openai.com](https://developers.openai.com/api/docs/guides/evaluation-best-practices) |
| 12 | Google Cloud — Evaluate Gen AI agents (trajectory metrics) | [docs.cloud.google.com](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/evaluation-agents) |
| 13 | Google Developers — Agents CLI and the Agent Development Lifecycle | [developers.googleblog.com](https://developers.googleblog.com/agents-cli-in-agent-platform-create-to-production-in-one-cli/) |
| 14 | The New Software Lifecycle (companion to the Google/Kaggle whitepaper) | [addyosmani.com](https://addyosmani.com/blog/new-sdlc-vibe-coding/) |
| 15 | Sonar — State of Code Developer Survey 2026 | [sonarsource.com](https://www.sonarsource.com/state-of-code-developer-survey-report.pdf) |
| 16 | 96% of developers don't trust AI code | [thenewstack.io](https://thenewstack.io/agentic-ai-verification-impact/) |
| 17 | Kimi K2 technical report | [arXiv 2507.20534](https://arxiv.org/pdf/2507.20534) |
| 18 | Kimi K2.6 — benchmarks and independent commentary | [kili-technology.com](https://kili-technology.com/blog/data-story-kimi-k2-6) |
| 19 | Li & Offutt — Test Oracle Strategies for Model-Based Testing (the RIP → RIPR extension) | IEEE TSE 43(4), 2017, 372–395 |
| 20 | Mirian-Hosseinabadi — Formal Analysis of Reachability, Infection and Propagation Conditions in Mutation Testing | [arXiv 2410.21904](https://arxiv.org/abs/2410.21904) |
| 21 | Ren et al. — SaaSBench: Coding Agents in Long-Horizon Enterprise SaaS Engineering | [arXiv 2605.17526](https://arxiv.org/abs/2605.17526) |
| 22 | El Filali & Bedar — Towards More Standardized AI Evaluation: From Models to Agents | [arXiv 2602.18029](https://arxiv.org/abs/2602.18029) |
| 23 | `yzhao062/awesome-auditable-ai` — failure attribution, audit trails and decision records | [github.com](https://github.com/yzhao062/awesome-auditable-ai) |
| 24 | Murphy-Hill, Butler & Savelieva — Adoption and Impact of Command-Line AI Coding Agents (Microsoft, early 2026) | [arXiv 2607.01418](https://arxiv.org/abs/2607.01418) |
| 25 | How Coding Agents Fail Their Users: A Large-Scale Analysis of Developer-Agent Misalignment in 20,574 Real-World Sessions (v2, 2026-08-31) | [arXiv 2605.29442](https://arxiv.org/abs/2605.29442) |
| 26 | Agentic Harness Engineering: Observability-Driven Automatic Evolution | [arXiv 2604.25850](https://arxiv.org/abs/2604.25850) |
| 27 | Harness Engineering: Anatomy, Architecture, and Evolution of Coding Agents — A Source-Code Study of Eleven Systems | [arXiv 2609.00006](https://arxiv.org/abs/2609.00006) |
| 28 | Effective Harness Engineering for Algorithm Discovery with Coding Agents (Vesper) | [arXiv 2605.15221](https://arxiv.org/abs/2605.15221) |
| 29 | SlopCodeBench: Benchmarking How Coding Agents Degrade Over Long-Horizon Iterative Tasks | [arXiv 2603.24755](https://arxiv.org/abs/2603.24755) |
| 30 | Code Review Agent Benchmark (c-CRAB) | [arXiv 2603.23448](https://arxiv.org/abs/2603.23448) |
| 31 | Silent Failure in LLM Agent Systems: The Entropy Principle | [arXiv 2606.08162](https://arxiv.org/abs/2606.08162) |
| 32 | Harness as an Asset: Enforcing Determinism via the Convergent AI Agent Framework (CAAF) | [arXiv 2604.17025](https://arxiv.org/abs/2604.17025) |
| 33 | Anthropic — Demystifying evals for AI agents (2026-01-09) | [anthropic.com](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents) |
| 34 | `cameronsjo/spec-compare` — eighteen spec-driven tools, seven use-case dimensions | [github.com](https://github.com/cameronsjo/spec-compare) |
| 35 | `obra/superpowers` — read from the installed 6.3.0 copy | [github.com](https://github.com/obra/superpowers) |
| 36 | `github/spec-kit` | [github.com](https://github.com/github/spec-kit) |
| 37 | SonarQube plugins for Claude Code, Copilot, Codex, Cursor (2026-07-01) | [securityboulevard.com](https://securityboulevard.com/2026/07/sonarqube-plugins-bring-trusted-verification-to-claude-code-copilot-codex-cursor-and-beyond/) |

## 9. A counterweight: the harness as a trainable artifact

*JIT-Agent: Scaling Harness Intelligence via Just-in-Time Harness Evolution* (arXiv 2608.25593)
argues that agent capability sits largely in the **harness** — memory, planning, actions, tool
orchestration — and that harness design is therefore a *trainable* dimension separate from model
choice. It generates task-adaptive harnesses on the fly, and reports generated harnesses matching
mature runtimes such as Claude Code, with gains of **+9.1 on DeepSearchQA and +4.3 on OdysseyBench**
for one base model and **up to +20.2** for another.

The strong form of everything above: the harness is where the capability is. But it cuts against this
project in one specific way worth stating rather than glossing.

**A generated harness has no evidence chain.** Everything ADR-010 is about — a claim you can re-check,
a digest binding evidence to the command it proved, a mutation showing a test can fail — presumes a
harness a person can point at, read, and audit. A harness synthesized per task is optimized against a
benchmark score, which §3 of this file shows is exactly the signal that inflates: one in five
"solved" SWE-bench patches is semantically wrong. A harness *trained* on that signal inherits its
blind spots and cannot be inspected for them afterwards.

The two are not opposed so much as answering different questions — theirs is "how well does it do",
ours is "how would you know". Read together, the honest position is that generated harnesses need
exactly the kind of independent, deterministic verification this project builds, and that measuring
them by the same benchmarks SWE-ABS discredited would repeat the error one level up.

### Leads, and what reading them settled

Found while searching, relevant, not yet opened — pick these up before starting the next round
rather than re-searching:

- *Agentic Coding Needs Proactivity, Not Just Autonomy* — arXiv 2605.06717. **Read 2026-09-01: a
  POSITION paper.** A three-level taxonomy and three proposed metrics, no experiment and no effect
  size. Nothing to adopt; do not cite it as evidence for anything.
- *SWE-EVO: Benchmarking Coding Agents in Long-Horizon Software Evolution* — arXiv 2512.18470.
  **Read 2026-09-01.** 48 tasks from release notes, averaging 21 files and 874 tests each. GPT-5.4
  with OpenHands scores **25%**, against 72.80% for GPT-5.2 on SWE-bench Verified — corroborating §3
  from a different direction. Its `Fix Rate` partial-progress metric is the shape of our `partial`
  task status, which already exists.
- *SaaSBench* — arXiv 2605.17526. **Read 2026-09-01, and it earned a row in §10.**
- *Terminal-Bench 2.0* — arXiv 2601.11868. **Read 2026-09-01.** 89 CLI tasks, each with a
  human-written solution and tests; frontier agents score **under 65%**. Context, not something to
  adopt — but the closest published environment to what this plugin actually runs in.
- *Towards More Standardized AI Evaluation* — arXiv 2602.18029. **Read 2026-09-01, abstract only —
  the recommendations are in the PDF and were not opened.** Its framing sentence earned a §10 row.
- *Adoption and Impact of Command-Line AI Coding Agents* — arXiv 2607.01418. **Read 2026-09-01**,
  quoted in §10. Tens of thousands of engineers; +24% merged PRs; the authors' own caveat kept.
- *JIT-Agent* — arXiv 2608.25593, read 2026-08-28, summarized in §9
- `yzhao062/awesome-auditable-ai` — **read 2026-09-01**, active through August 2026. Nine sections;
  the two that bear on this project are Failure Attribution and Audit Trails / Decision Records. Its
  hash-chained-records entries prompted the probe recorded as `docs/BACKLOG.md` §101 — a Verification
  Log row deleted from a committed file is invisible, and the chain LOST to a three-line check
  against git. Its BenchJack entry earned a §10 row.
- *DCE-LLM: Dead Code Elimination with Large Language Models* — arXiv 2506.11076. Found while
  looking for support for BACKLOG §99 and it is NOT that: it is a tool for eliminating dead code,
  not a finding about agent-authored checks shipping unreachable. Search returned conflicting
  identifiers for it. Read before citing.

## 10. What this repository measured itself

§8 is about DESIGN AGREEMENT — choices made on the strength of somebody else's
result. This section is narrower and is the only part of this file that carries
weight of its own: findings this repository produced by running something, with
the artifact that holds the evidence.

**Nothing here negates a published finding.** That column is empty and is left
empty deliberately. A table where a null was promoted to fill a heading would be
the confident closing language §2 is about.

| Published claim | Source | What was measured here | Verdict |
|---|---|---|---|
| A green suite is weak evidence; mutation exposes semantically wrong work | 4, 5 | A 416-mutation campaign, run on every push across four CI shards. It has repeatedly returned survived mutants on code whose tests were green — most recently 2026-09-01, where a task's Acceptance fence ran only the readers and the mutant on the WRITER survived. | **Confirmed** |
| Mutation-driven testing exposes blind spots a suite cannot see | 4 | **A limit the papers do not state.** On 2026-09-01 a predicate shipped defined, asserted three times directly, and called from nothing — and every mutant in it came back RED throughout, because the direct assertions kill a body mutant whether or not production invokes it. See below. | **Confirmed, and extended** |
| Most agent failures are configuration failures rather than reasoning failures | 1 | Five separate defect classes in this repository were a path literal that was secretly an assertion about the operating system — separator, line ending, drive prefix, `PATH` semantics, home-directory spelling. Every one was invisible on the developer's machine and red on Windows. `docs/BACKLOG.md` §88, §90, §91, §92; the table in `CLAUDE.md` §7. | **Confirmed** |
| Single-run eval numbers mislead; report variance and run counts | 11 | A measured Δ of **−0.40** on `gates-advise-never-block` was published in this backlog, then **retracted**: at five runs per arm it is 0.60 / 0.60, Δ 0.00. Later, across nine paired invocations, the with-arm alone spans the full 0–1 range. The power calculation was then done from the corpus's own spread (with-arm n=28, sd 0.39). `docs/BACKLOG.md` §35. | **Confirmed, including by our own retraction** |
| Deterministic gates move behaviour where prose instructions do not | 3 | Three instructions measured given-vs-omitted. **None showed an effect — and the cases were too noisy to detect a small one.** The honest statement, and the one the entry now carries, is *"three instructions were measured on cases too noisy to detect a small effect, and none showed one"*. | **NULL, under-powered — not support** |
| Gates that REFUSE the write are where the measured gain comes from | 3 | Not measured here, and not adopted: this project's rule is instruct-never-block. No action-boundary gate exists, so the tension is latent rather than tested. | **Open disagreement, stated in §8** |
| Failures cluster in configuration and integration, not in reasoning, and agents halt overconfidently before reaching the substance | 21 | Independent confirmation of the row above, on someone else's corpus: **over 95% of SaaSBench task failures occur before the agent reaches deep business logic**, and the two named failure modes are overconfident premature halting and debugging loops. Our five path-literal classes are the same shape, one layer down. | **Confirmed externally as well** |
| Evaluation PIPELINES introduce silent failure modes of their own | 22 | Measured here, in the tool built to measure: `eval-deltas.mjs` read one of the suite's two results trees and silently reported a smaller corpus, dropping five paired invocations of the case with the most negative deltas. Nothing said anything was missing. Now asserted by `tests/eval-deltas.test.mjs::both results trees are read, not just the one named results`. | **Confirmed, in our own instrument** |
| Agents can score perfectly without doing the task (benchmark gaming) | 23 | Present in our own eval corpus: a case scored identically in both arms with **`skill_calls=0` across all thirteen kept sandboxes** — no skill ever fired, and the score was about the model's prior, not the plugin. `docs/BACKLOG.md` §35. | **Confirmed** |

### The extension, stated precisely enough to be wrong

The RIP model — Reachability, Infection, Propagation — and its RIPR extension
(19, 20) say a fault is only observed when the test reaches the faulty location,
corrupts the state, propagates that corruption to an output, and the oracle
reveals it.

**On 2026-09-01 all four conditions held and the check was still dead.** The
predicate was reached — by the three assertions calling it directly. State was
infected, propagated, and revealed: the mutants went RED. What did not exist was
any path from the shipped entry point to that predicate at all.

So the refinement is not "the Reachability condition failed". It is:

> **A killed mutant proves reachability from the TEST SUITE. It never proves
> reachability from the shipped entry point.**

RIPR has no condition for that distinction because it models one program under
one test, not a component that a suite reaches and `main` does not. For a gate —
a program whose entire purpose is to be invoked on somebody else's artifact — the
distinction is the whole difference between a check and a decoration.

The countermeasures this bought, both cheap: register a mutant that deletes or
redirects the CALL rather than the body, and ask the reachability question once
per mechanism a change ships rather than once per task. `docs/BACKLOG.md` §99
holds the third — a mechanical orphan sweep — with the open design question that
keeps it from being a gate yet.

### The number that makes all of this worth paying for

Microsoft's early-2026 rollout across tens of thousands of engineers (24) found that adopters of
command-line coding agents **merged roughly 24% more pull requests** over four months than they
otherwise would have. The authors state the caveat themselves: *"a merged PR is not the same as the
value it delivers."*

Nothing in that study says verification moved. Throughput rising while the evidence standard holds
still is the situation this project is built for, and it is the honest reason to care about the rest
of this file: the volume of work arriving at review went up by a quarter, and 75.8% of the failures
in it announce themselves as successes.

## 11. Round two: what the literature added between 2026-08-28 and 2026-09-04

**Retrieved 2026-09-04.** Same rule as the top of this file: figures are as their sources report them,
nothing was reproduced here, and a paper read from its abstract page is marked as such. Where a
sentence below is this repository's reading rather than the source's, it says so.

### The defect this project targets is measured in production now, and its share is growing

*How Coding Agents Fail Their Users* (arXiv 2605.29442, v2 dated 2026-08-31) is observational:
**20,574 sessions across 1,639 repositories**, IDE and CLI, not a benchmark. Seven misalignment
classes; the two that matter here are **S3 developer-constraint violation at 38.33%** of episodes and
**S7 inaccurate self-reporting at 22.58%**. Their sentence for S7: *"the agent consistently turns a
partial or unverified state into a completion claim"* — agents *"claim uploads, tests, or deployments
succeeded while the next turn reveals otherwise."* **91.49% of visible resolutions required explicit
developer correction.** And the trend line: overall misalignment declines over time while constraint
violations and inaccurate self-reporting **rise in proportion**.

> **Implication.** §2's 75.8% was a benchmark figure about self-assessing agents. This is the same
> failure counted in real sessions, and it is the one whose share is going up as the others go down.
> A harness that only makes the agent's completion claims checkable is aimed at the residual.

### Prose does not transfer; structure does — the third independent source

*Agentic Harness Engineering* (arXiv 2604.25850) evolves a harness by making every edit a falsifiable
contract: *"decision observability pairs every edit with a self-declared prediction, later verified
against the next round's task-level outcomes."* Ten iterations lift Terminal-Bench 2 pass@1 from
**69.7% to 77.0%**, and the evolved harness transfers to SWE-bench Verified and three other model
families without re-optimisation. The finding that bears on this project is the ablation: *"the gain
[localises] to tools, middleware, and long-term memory rather than the system prompt, suggesting
factual harness structure transfers while prose-level strategy does not."*

That is the third time this result has arrived from an independent direction. *Reason Less, Verify
More* (§2) got its gain from deterministic gates. This repository's own instruction experiment (§10)
came back NULL. Now a harness-evolution loop optimising freely finds the same thing. [The synthesis
is this repository's; each source states only its own result.]

The prediction-then-verify contract is also ADR-025's kill criterion applied to harness edits rather
than to decisions — agreement in mechanism, arrived at separately.

*Harness Engineering: Anatomy, Architecture, and Evolution of Coding Agents* (arXiv 2609.00006; its
abstract page says submitted 15 Jul 2026) reads ~4 million lines of eleven agent runtimes and reports:
*"no agent runtime imports a general-purpose agentic framework, and none retrieves code with vector
embeddings; the field runs on hand-rolled async loops and deterministic retrieval."* Seven canonical
subsystems, 29 recurring patterns. It confirms §6's "simple, composable patterns" from source rather
than from advice. Its taxonomy has no subsystem for verifying the harness's own claims about its
work — the gap this project sits in is not in the anatomy. Abstract page only.

### A model may exclude; it may not certify

*Effective Harness Engineering for Algorithm Discovery* (Vesper, arXiv 2605.15221) runs a **second
model session** after a candidate passes evaluation, to ask whether it solved the problem or exploited
the evaluator. For GPT-5.2-codex, **92 of 568 passing candidates — 16.6% — were evaluation hacks**;
for the smaller model, 0 of 87. *"More capable models generated evaluation hacks at higher rates."*
The verifier is itself a model (gpt-5.1-codex-mini), and the paper names the cost: when nothing is
hacking, the pass reduces generations under a fixed budget.

Two things for this project. First, the capability-scaling finding is *The Verification Horizon*'s
claim (§1) with a number on it. Second, an apparent tension with the rule that no model verdict enters
the evidence chain — and the reconciliation is already the shape this repository uses: Vesper's
verifier **removes** a candidate from the pool; it never certifies one. That is the asymmetry between
`adr-judge` advising and `adr-verify` recording. A model verdict that can only subtract is compatible
with an evidence chain a model may not add to. [The reconciliation is this repository's reading.]

### Trajectory measured from the outside: what gap 2 would look like closed

*SlopCodeBench* (arXiv 2603.24755): 20 problems, 93 checkpoints, 11 models, hidden tests. **No agent
fully solves any problem across all checkpoints**; the best strict solve rate is **17.2%** (Opus 4.6).
Two trajectory-level metrics — structural erosion and verbosity — rise in **80%** and **89.8%** of
trajectories respectively; agent code is **2.2× more verbose** than maintained human repositories, and
the gap widens with each iteration while human code stays flat. Corroborates SWE-EVO (§9) from
another angle, and it is the concrete shape of a "metric class": a per-trajectory number reported over
every checkpoint, which is exactly what the five advisories in §8 gap 2 are not aggregated into.

### A reviewer that catches a third is one reviewer's silence

*Code Review Agent Benchmark* (c-CRAB, arXiv 2603.23448) converts human review comments into
executable tests and asks whether an agent's review leads to the fix. Pass rates: **Claude Code
32.1%, Devin 24.8%, PR-Agent 23.1%, Codex 20.1%**; all agents together resolve **about 40%**. The
tools write more comments than humans and resolve fewer issues — the false-positive load lands on the
maintainer. This is the number behind CLAUDE.md §12's "a clean pass is one reviewer's silence, not a
verdict", and it is why the Codex review here is a search for findings, never a certification.

### Read but not adopted

- *Silent Failure in LLM Agent Systems: The Entropy Principle* (arXiv 2606.08162) — 40,000 controlled
  trials plus 100,000 production interactions, and a claim that system entropy grows as
  S(t) = S₀·e^(αt) across interaction rounds. The dataset is large and the framing ("silent failure
  is a physical constraint, not a bug") is useful; the proposed countermeasure is the authors' own
  engine and is not evaluated independently here. Cite the framing, not the formula.
- *Harness as an Asset: CAAF* (arXiv 2604.17025) — domain rules as machine-readable registries
  enforced by a "deterministic Unified Assertion Interface"; its ablation says no single pillar closes
  the controllability gap. Abstract only; no effect size read.
- Anthropic, *Demystifying evals for AI agents* (2026-01-09) — predates this file and was missed in
  round one. Three lines earn their place: *"Deterministic graders are natural for coding agents"*;
  grade the environment state, not the agent's account of it; and **pass^k** — the probability that
  *all* k trials succeed — as the metric for an agent that must be consistent, against pass@k for one
  that must succeed once. BACKLOG §35's variance finding is pass^k's argument made the hard way: an
  eval reported as a mean of single runs cannot tell a coin from a capability. Also its bypass
  warning, with the example of a trial reading git history from a prior trial.

### What round two changes in the stance

1. **The target has a production number.** 22.58% of real misalignment episodes are the agent
   misreporting its own state, and that share is rising while others fall.
2. **Structure over prose is now three-way corroborated.** The instruction files are the weak lever;
   the gates are the strong one. Spend on gates.
3. **Model verdicts have a defensible role: subtraction.** A model may flag and exclude; only a tool
   may record. That is the rule already; now it has a citation and a measured reason.
4. **pass^k is the eval number to report**, not a mean.
5. **The refuse-the-write tension (§8) is unchanged**, and nothing in this round softened it.

---

## 12. Comparable tools — asked for the first time on 2026-09-04

This file compared the project to papers and platforms; nobody had asked how it compares to the
tools a user would install *instead*. **Method:** the tools a web search for spec-driven and
verification tooling surfaced, plus the eighteen in `cameronsjo/spec-compare`; star counts from the
GitHub API on 2026-09-04; each tool's mechanism read from its README on the same day, **except
`obra/superpowers`, which is installed on this machine and was read from the installed 6.3.0 copy.**
Nothing else was installed or run. A README read by a summariser is a weaker source than a file on
disk, and the rows say which they are.

| Tool | Stars 2026-09-04 | What it governs | How "done" is decided | Tool-written evidence of a claim |
|---|---|---|---|---|
| `obra/superpowers` 6.3.0 | 281,656 | process skills: brainstorm, plan, TDD, verification-before-completion, code review | **Prose to the model.** `verification-before-completion/SKILL.md` — *"NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE"* — is a Markdown instruction; the TDD skill's *"Write code before the test? Delete it. Start over."* is an instruction, not a mechanism. The only hook in `hooks/hooks.json` is `SessionStart`. Read from disk. | None. The evidence lives in the transcript, where §2's judges cannot tell it from confident closing language. |
| `github/spec-kit` | 133,420 | constitution → specify → plan → tasks → implement → converge / analyze / checklist | `/speckit.converge` *"assess[es] the codebase against spec/plan/tasks"*; the README does not say whether that is a script or a prompt. README via summariser. | None documented. |
| `Fission-AI/OpenSpec` | 67,282 | brownfield change proposals for one assistant | agent judgement | None documented. |
| `bmad-code-org/BMAD-METHOD` | 52,671 | multi-agent role simulation of a team | agent judgement | None documented. |
| Kiro (AWS) | IDE, not a repo | spec-driven agents inside an editor | not inspected | not inspected |
| Traycer | product | "Plan → Execute → Verify" | the product page does not describe Verify mechanically | not stated |
| `zircote-plugins/adr` | 5 | ADR lifecycle, eight templates, a "compliance" agent | an agent audits code against accepted ADRs; no mechanism documented | None. Exports are HTML/JSON/PDF of the records. |
| `Korni22/claude-adr` | 0 | same class, last push 2026-02-25 | — | None. |
| SonarQube plugins for Claude Code / Copilot / Codex / Cursor (announced 2026-07-01) | vendor | code smells, duplication, complexity, SAST, secrets, coverage, quality-gate status | **deterministic analyzers** under the organisation's existing quality profiles | Yes — **of the code**, not of a claim about work. The closest neighbour in mechanism. The "44% less likely to report outages" figure is the vendor's survey. |
| CodeRabbit / Greptile / Qodo | vendor | PR review | a model. Vendor and blog figures disagree with each other (Greptile 82% or 85% catch rate, CodeRabbit 44%, Qodo 56.7% or 78%); the one independent number is c-CRAB's ≤ 32.1% (§11). | Review comments, which are the thing c-CRAB measured as mostly not leading to a fix. |
| **quality-harness** | 1 | ADR/spec lifecycle whose `done` is a tool-written, digest-bound, mutation-backed log entry | `adr-verify` runs the fence and writes the entry; `adr-lint` refuses `done` without it; `adr-verify --sweep` re-checks every entry later | Yes, and it is the only row where the evidence is of the *claim*. |

`cameronsjo/spec-compare` (135 stars, pushed 2026-08-30) is the one cross-tool comparison found. Its
seven scoring dimensions are use-cases — greenfield, trivial change, refactor, bug fix, parallel
development, cross-cutting — and **none is verification**; the words appear only in three tool
blurbs ("Verify layer", "TDD gates", "drift detection"). Its own summary of the landscape's open
problem: *"Agents frequently ignore specifications."*

### The position, stated so it can be wrong

**On mechanism this project is alone in the set.** Every spec-driven tool above decides "done" by
model judgement and records it as prose, which is precisely the artefact *Confident Closing* (§2)
showed judges cannot grade and *How Coding Agents Fail Their Users* (§11) showed is the growing
failure. The nearest neighbour in *principle* is superpowers' verification-before-completion — the
same rule this repository enforces, written as an instruction with nothing that checks it was obeyed;
and §11's three-way finding says instructions are the lever that does not transfer. The nearest
neighbour in *mechanism* is SonarQube — deterministic, gate-shaped — and it verifies the code, not
the claim about the work.

**On adoption the distance is the other way and it is not close.** Superpowers has 281,656 stars;
this repository has one, one fork, and ten issues, all filed by a single external adopter. The
mechanism has been exercised on exactly one corpus that is not this one (the 2026-08-29 measurement on
a Laravel repository, filed in the project's memory). "Only tool that does X" is a claim about a set
of one until somebody else runs the sweep on their corpus and reports the buckets.

**What would falsify the mechanism claim:** a tool in this table shipping a step that (a) runs the
project's check itself, (b) writes the exit code and a digest of what it ran into the record, and (c)
refuses a completion status without it. Any of the spec-driven tools could add that in a week; none
has, and the reason is worth knowing before assuming it is oversight.
