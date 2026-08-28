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

### Leads not yet read

Found while searching, relevant, not yet opened — pick these up before starting the next round
rather than re-searching:

- *Agentic Coding Needs Proactivity, Not Just Autonomy* — arXiv 2605.06717
- *SWE-EVO: Benchmarking Coding Agents in Long-Horizon Software Evolution* — arXiv 2512.18470
- *SaaSBench: Coding Agents in Long-Horizon Enterprise SaaS Engineering* — arXiv 2605.17526
- *Terminal-Bench: Benchmarking Agents on Hard, Realistic CLI Tasks* — arXiv 2601.11868
- *Towards More Standardized AI Evaluation: From Models to Agents* — arXiv 2602.18029
- *Adoption and Impact of Command-Line AI Coding Agents: Microsoft's Early 2026 Rollout* — arXiv 2607.01418
- *JIT-Agent* — arXiv 2608.25593, read 2026-08-28, summarized in §9
- `yzhao062/awesome-auditable-ai` — curated list on failure attribution and decision records, which
  is this project's exact subject
