# ADR-121: A watcher that steers on evidence, learns which nudges work, and remembers the lessons

**Status:** Accepted
**Date:** 2026-10-21
**Owner:** Zy
**Spec:** None — no spec stage; the owner's direction of 2026-10-21 ("a watcher that steers on evidence … ledger, novelty, learning pair well here"), grounded in three field reports and the published work cited in Context
**Cross-references:** docs/adr/ADR-037-advice-earns-its-place-by-being-acted-on.md, docs/adr/ADR-060-advisories-react-to-observed-events.md, docs/adr/ADR-096-turn-end-findings-reach-the-agent.md, docs/adr/ADR-110-a-static-core-owns-the-hooks.md, docs/adr/ADR-112-the-lifecycle-is-measured-where-it-can-work.md, docs/adr/ADR-116-qh-ships-as-release-assets-fetched-and-verified.md, docs/adr/ADR-120-nothing-left-out.md, docs/architecture.md
**Governs:** `core/hooks/lifecycle.go`, `core/hooks/turnend.go`, `core/hooks/lifecycle.go`, `core/hooks/turnend.go`, `plugin/scripts/check-ledger.mjs`
**Enforced-by:** None — declared by its tasks. Each task adds one campaign mutation per mechanism; naming them before they exist would be a pointer to nothing.
**Invalidates:** None — every rule keeps its record; this decides when a rule may speak, and measures whether speaking helped.
**Served-path change:** none until T3 ships; then a hook's finding is said only when the watcher's evidence gate passes, a rule that a project's own record shows is ignored is retired for that project with a line saying so, and a confirmed lesson reaches the next session through memoryd.

## Context

**What the owner asked for, 2026-10-21:** quality-harness detached from the agent as far as it can be, watching every event
"like a subconscious": what was said, when and how often, what changed and in what scope, whether a full check is needed,
which nudges work, and, when needed, interrupting the main or a sub-session to make it evaluate itself. It sits beside
mrw (fewer turns, faster edits) and memoryd (the project's lessons, learned as the agent works), with quality-harness as the
discipline: spec, record, grill, task split, mutation.

**What the measurements say.** A peer's SWE-bench bench (tool-multipathreadwrite ADR-162 stage 5, cited by location,
CLAUDE.md §6) found the plugin at v3.8.40 cost more per task and solved no more; its hook records show the Stop
continuation on checks that could not run, and agents under the plugin claiming done far less often at equal solved rates.
Three field reports (2026-10-21: an infrastructure repository, a Go CLI repository, a product repository) say the same from
daily use: gates re-prove unchanged facts, hooks speak when their action cannot succeed, advice repeats until it is not
read. ADR-120 T6, T9, T11 and T13 fix named instances. Nothing measures whether a finding changed what the agent did.

**What the published work says** (read 2026-10-21):
- A monitor beside a coding agent that decides when to inspect and how to intervene (advisory or replace) raised SWE-bench
  Lite resolve rates with fewer tokens than fixed-interval monitoring: Cadence, arXiv 2610.12269.
- A small pre-execution sentinel trained by hindsight distillation (allow, redirect, pause for a human): HiSentinel, arXiv
  2609.39957.
- A harness that intervenes only on evidence (loop repetition, intent drift, expectation deviation), with cooldowns and a
  minimal-intervention guard; its harmed cases were over-control: AgentTether, arXiv 2607.06273.
- Self-correction without an external signal is unreliable, and works when the critique is grounded in a tool's result:
  CRITIC, arXiv 2305.11738; arXiv 2510.16062.
- Premature disengagement (concluding without validating against the environment) is a named failure of coding agents:
  arXiv 2502.08235.
- The monitoring-and-control frame (a meta level reads state up and sends regulation down): Nelson and Narens, as used in
  arXiv 2607.24339 and arXiv 2602.18806.

**What is new here, narrowly.** AgentTether already carries corrective state across iterations and checks whether an
expected action occurred, and Cadence widens its inspection interval after an advisory; both are prior art for
outcome-sensitive guidance and adaptive spacing. The combination proposed here is the narrower claim: persistent,
per-project statistics of each rule's outcomes across sessions, used to retire a rule for that project while its
negative-evidence path stays open, and proven lessons handed to a separate memory (memoryd) with code anchors that go
stale when the code drifts.

**Prior art read 2026-10-21 in an MIT-licensed tool for coding agents** (Trail-Code, a downloaded copy read and never run;
patterns adopted as designs, no code copied): a Stop hook that blocks at most once a session and only on counted
evidence; compliance read from the transcript's tail instead of the agent's word; cost per piece of work from the
transcript (active minutes with idle gaps dropped, fresh tokens without cache reads, files touched); a model's claim kept
only when the text it quotes is found by code; two installed copies of a hook where only one answers; a hook's budget read
from the timeout actually installed; nudge wording that rotates and never repeats within a session; corrections folded
into a rule keeping a `folded_in` trail; and a rule-based check of a diff against recorded decisions that errs towards
silence and quotes its source.

### The class, enumerated

| Class | Command | Output |
|-------|---------|--------|
| A finding a hook emits | `mrw read --count --grep 'action\.emitted' plugin/scripts/ core/hooks/` | the emitters write `action.emitted` rows with `rule`, `key`, `channel` and `recipient` into the session log (`plugin/scripts/check-ledger.mjs`, `core/hooks/`) |
| A place a hook can reach the agent | ADR-120's Wiring and `plugin/scripts/lifecycle.mjs` | `additionalContext` (SessionStart, UserPromptSubmit, PreToolUse, Stop once), `systemMessage` (the user), `deny` (the sanctioned refusals) |
| A store a lesson can live in | memoryd's tools (`insert`, `recall`, `record_verdict`, `post`, `wait_rooms`) | a project space, code anchors with verdicts, rooms readable by other sessions |

## Existing Primitives Audit

- The session log (`sessions/<id>.jsonl`) already holds every event and every `action.emitted` row with its dedupe key.
- The Go core (`core/`, ADR-110) already answers every hook event with Node's rules and is parity-tested.
- ADR-116 ships `qh` as release assets; the watcher is a mode of that binary, not a second program.
- memoryd already holds per-project spaces, anchors with verdicts, and rooms; mrw's `--json` receipt lists every path a
  write touched.

## Decision

1. **T1, the nudge ledger (measure first):** a finding's outcome is classified only where the session log supports it:
   *acted*, *ignored*, *contradicted*, and also *pending* (the session has not reached a deciding event) and *unknown* (the
   log does not hold the event that would decide). Supported today: a check recorded after the emission (by its recorded
   order, not its import order), an observable write to a named path, a refused or allowed publish request. Not observed
   today, so *unknown*: a shell command's result (no shell PostToolUse hook is registered), a completed publish, a setting
   declared through a shell. Each emission carries its expected action and audience as data. `qh nudges` reads and
   reports; T1 writes `nudge.outcome` rows from the watcher's own pass, never from a hook. Unknown and pending outcomes never
   count toward retirement.
2. **T2, an evidence gate on every intervention:** a finding is withheld only when its evidence is unchanged since it was
   last delivered (the same tree, the same check standing, the same rule key); new negative evidence (a failed or
   unproven check, a newly changed path in the check's scope) always reopens delivery, whatever the cooldown. Per-rule
   cooldowns widen after an unheeded advisory and reset after one acted on (an adaptation of Cadence's spacing, not its
   schedule), and a per-session budget caps turn continuations. The sanctioned refusals (CLAUDE.md §3) are outside every
   learned suppression.
3. **T3, the watcher:** `qh watch` runs one process per repository and worktree, tails every session log, keeps request-
   scoped state (no process-global caches across worktrees), and answers hooks over a Unix socket on macOS and Linux and a
   named pipe on Windows, at a short endpoint name, with a connect deadline and a response deadline that leave the hook its
   in-process fallback time inside its registered timeout, and a request id so a retried request never repeats a side
   effect. A hook with no watcher, or with one that stops answering, answers in-process as today. A rule whose acted rate
   over its last N *classified* emissions in this project is below a threshold is retired for this project: it keeps
   recording, a finding of it backed by new negative evidence is still delivered, and the user is told once with the
   numbers; a project can pin a rule on.
4. **T4, evidence-grounded self-evaluation:** when the evidence alone shows a gap (edits to paths in the check's scope since
   its last pass, a check that can start, and the turn ending), the Stop continuation asks one question built from that
   evidence ("you changed X and Y; the check that covers them last passed before both; what did you run that shows they
   work?"), never a generic "are you sure". It does not classify the agent's text as a done claim: that detector was
   retired after measurement (`plugin/scripts/claim-status.mjs:3`). Where the check cannot start, ADR-120 T11's user-only
   notice stands.
5. **T5, memoryd and mrw:** a lesson is a bounded observation, not a general rule: the emission id, the rule, the command
   or path acted on, the passing check's id and tree, and a code anchor, stored as a procedure or correction memory in the
   project's space, so a reader sees what was observed rather than a claim. SessionStart lists the lessons for the session's
   area. mrw receipts reach the hooks by named routes: the MCP write's PostToolUse result receipt for MCP writes, and, for
   CLI writes, a route T5 measures first (a narrowly matched shell PostToolUse, or a receipt file mrw itself appends),
   costed per CLAUDE.md §19 before it is registered. Real-session samples stay local; tracked fixtures are generated in
   temporary repositories. Cross-session nudges go through a memoryd room, never through a peer's permissions.
6. **T6, the evaluation and the kill criterion:** the bench peer runs a P-watch arm (the plugin with T1 to T4, memoryd
   absent, so the arm measures the watcher alone) against P in ADR-163's stage, the decision computed by the peer's
   scorer from its pre-registered bar: cost's 99% upper bound below P's and solved's lower bound above −0.10. Otherwise the
   watcher stays opt-in, and the record says so. Installed output and latency are measured on a fresh repository and one
   corpus as well (CLAUDE.md §19).

7. **mrw and memoryd are optional enhancers, never requirements (the owner, 2026-10-21).** quality-harness works whole
   without either: with neither present every rule, gate and the watcher behave as decided above. Each integration is
   detected, never assumed: with mrw present, its receipts make writes visible (T5) and fewer turns reach the gates; with
   memoryd present, lessons persist across sessions (T5). Absent, the feature is off and said once per session, never an
   error, a refusal or a degraded verdict. Every task's tests run with each absent as well as present.
8. **Patterns adopted from that prior art (the owner, 2026-10-21), each in the task that owns it:** T1 reads a
   finding's compliance from the transcript tail (bounded, as the host writes it) where the session log cannot decide it,
   and records each finding's cost: active minutes, fresh tokens and files touched between the finding and its outcome.
   T2 blocks at most once per rule per session, never twice in one turn, and records which wording it used, rotating
   wordings so the ledger can tell a rule from its phrasing. T3 answers through one installed copy only (a home forwarder
   and the plugin stand down to one) and takes each hook's budget from the timeout actually installed in the host's
   settings; a retired rule keeps a `retired_by` trail (the ledger rows that retired it). T5 keeps a lesson only when every
   piece of text it quotes is found verbatim in the evidence it cites, never re-injects a lesson already shown in the
   session, and keeps a `folded_in` trail when lessons merge. T7 checks a diff against what Accepted records decided.

What would make this fail: a rule retired for a project that later catches a real defect there (T3 keeps retired rules
recording, so the ledger shows it), or an intervention that the ledger shows acted on but the bench shows costly.

## Alternatives Considered

- **An LLM monitor as in Cadence:** rejected as the default. It costs a model call per inspection and its own errors were
  a named failure there; the deterministic evidence gate comes first, and a model monitor is a later arm the ledger can
  justify.
- **Retiring rules globally:** rejected. A rule ignored in one project may be the one that matters in another; the
  decision is per project, and said.
- **Deny-and-regenerate (Cadence's replacement) at PreToolUse:** not in this record. It is a new refusal (CLAUDE.md §3)
  and needs its own Accepted record and opt-out, with the ledger's numbers behind it.

## Component / Boundary Impact

`qh watch` is a mode of the existing `qh` binary (`core/cmd/qh/main.go`); the hooks become thin clients when it runs.
`docs/architecture.md` gains the watcher row and the socket in T3's commit.

## Wiring & Contract Changes

| Surface | Change | Producer | Consumer(s) |
|---------|--------|----------|-------------|
| Session log | `nudge.outcome` rows | T1 | `qh nudges`, T2, T3 |
| `qh nudges` | new read-only report | T1 | the owner, T3's retirement rule |
| Local socket | hook → watcher decision | T3 | `lifecycle.mjs`, `lifecycle.go` |
| memoryd project space | lesson memories with anchors | T5 | SessionStart recall |
| `.quality-harness.json` | `watch` (on/off), retirement threshold | T3 | the watcher |
| `qh decisions-check` | new: a diff against Accepted records' decided values and rejected alternatives, advice only | T7 | the commit and turn-end advice |

## Inter-task Contracts

| Contract | Producing task | Consuming task(s) | Breaking? |
|----------|----------------|-------------------|-----------|
| `nudge.outcome` rows (T1) | T1 | T2, T3, T5 | No — new |
| the evidence gate (T2) | T2 | T3, T4 | No |
| the watcher socket (T3) | T3 | T4, T5, T6 | No |

## Implementation

See `tasks/README.md`: T1 first and alone, because every later decision reads its numbers; then T2, T3, T4 and T5; T7 after
T1, measured before it advises; T6 last, on ADR-116's release assets and the bench peer's stage.

## Consequences

- **Positive:** every finding is measured; findings that do not change behaviour stop costing turns per project; lessons
  outlive sessions; quality-harness, mrw and memoryd share one loop: mrw makes the edit visible, quality-harness judges it,
  memoryd keeps what was learned.
- **Negative:** a long-lived process per repository; a socket protocol to keep in two languages; a dependency on memoryd for
  T5 (optional: absent, lessons are not written, and that is said).
- **Neutral:** the session log grows by one row per finding.

## Out of Scope

- A PreToolUse deny-and-regenerate (permanent: boundary: a new sanctioned refusal needs its own Accepted record, CLAUDE.md §3)
- A model-based monitor (permanent: boundary: it enters only as a measured arm after T6, when the ledger shows where the deterministic gate misses)

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| The outcome classifier calls an ignored nudge acted | Med | High: a useless rule survives | T1's rows are measured against hand-labelled sessions before T3 reads them |
| A retired rule hides a real defect | Low | High | retired rules keep recording; the user is told once, with the numbers; `.quality-harness.json` can pin a rule on |
| The watcher dies mid-session | Med | Low | hooks answer in-process as today |
| A lesson goes stale | Med | Med | memoryd anchors with verdicts; a drifted anchor marks it stale |

## Rollback

`watch: off` (or no watcher running) returns every hook to in-process behaviour. Lessons stay in memoryd and can be
retracted there.

## Follow-ups

- [x] A cold Codex review of this draft before the owner's acceptance: REQUEST CHANGES on 2026-10-21 (one blocking: a learned suppression could silence a fresh failed check; six advisory), all folded into Decisions 1 to 6 and the tasks; the owner accepted on 2026-10-21
- [ ] T1's numbers on this repository and one peer corpus before T2 is written in detail
