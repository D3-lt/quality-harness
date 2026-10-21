# ADR-121: A watcher that steers on evidence, learns which nudges work, and remembers the lessons

**Status:** Proposed
**Date:** 2026-10-21
**Owner:** Zy
**Spec:** None — no spec stage; the owner's direction of 2026-10-21 ("a watcher that steers on evidence … ledger, novelty, learning pair well here"), grounded in three field reports and the published work cited in Context
**Cross-references:** docs/adr/ADR-037-advice-earns-its-place-by-being-acted-on.md, docs/adr/ADR-060-advisories-react-to-observed-events.md, docs/adr/ADR-096-turn-end-findings-reach-the-agent.md, docs/adr/ADR-110-a-static-core-owns-the-hooks.md, docs/adr/ADR-112-the-lifecycle-is-measured-where-it-can-work.md, docs/adr/ADR-116-qh-ships-as-release-assets-fetched-and-verified.md, docs/adr/ADR-120-nothing-left-out.md, docs/architecture.md
**Governs:** `core/hooks/lifecycle.go`, `core/hooks/turnend.go`, `plugin/scripts/lifecycle.mjs`, `plugin/scripts/completion-rules.mjs`, `plugin/scripts/check-ledger.mjs`
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

**What is new here.** Each system above fixes its intervention policy at design time or learns it offline. None keeps,
per project, a ledger of each intervention and what the agent did next, and retires what is ignored while keeping what
works. ADR-037's principle (advice earns its place by being acted on) becomes a measured, automatic rule; and a lesson
that proved itself is handed to memoryd, so the next session starts from it instead of being nudged into it again.

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

1. **T1, the nudge ledger (measure first):** every finding a hook emits gets an outcome, read from the events that follow it
   in the same session: *acted* (the agent ran the named command, touched the named path, declared the named setting),
   *ignored* (the turn ended or the same finding returned with none of those), *contradicted* (the agent did the opposite,
   such as committing anyway). `qh nudges` reports, per rule and per project, emissions and outcomes. Read-only; nothing
   changes behaviour.
2. **T2, an evidence gate on every intervention:** a finding may reach the agent only with a concrete fact behind it (a
   changed path in the check's inputs since its last pass, a check that can start, a claim of done with no validation since
   the last edit), with per-rule cooldowns that widen after an advisory and reset after one that was acted on (Cadence's
   schedule, applied per rule), and a per-session budget of turn continuations.
3. **T3, the watcher:** `qh watch` runs one process per repository, tails every session log, keeps the state the rules need
   (what was said, when, how often, what changed, in what scope, which check would answer it), and answers hooks over a
   local socket; a hook with no watcher answers in-process as today. A rule whose acted rate over its last N emissions in
   this project is below a threshold is retired for this project, and the user is told once with the numbers.
4. **T4, evidence-grounded self-evaluation:** when the trajectory shows premature disengagement (a done claim, edits since
   the last validation, a check that can start), the Stop continuation asks one question built from the evidence ("you
   changed X and Y; the check that covers them last passed before both; what did you run that shows they work?"), never a
   generic "are you sure". It replaces today's R1 text, not adds to it.
5. **T5, memoryd and mrw:** a finding acted on and followed by a pass becomes a lesson: a memory in the project's space
   (kind procedure or correction, labelled with the rule and the paths), anchored to the code it is about so a drifted
   anchor marks it stale. SessionStart recalls the lessons for the paths the session is likely to touch. mrw's `--json`
   receipt feeds `file.written` for every path an mrw write touched, closing the invisible-write gap ADR-120 T9 leaves.
   Cross-session nudges go through a memoryd room, never through a peer's permissions.
6. **T6, the evaluation and the kill criterion:** the bench peer runs a P-watch arm (the watcher with T2 and T4) against P in
   ADR-163's stage. The watcher becomes the default only if cost's 99% upper bound is below P's and solved's lower bound is
   above −0.10, the bar ADR-163 pre-registered for its Q arm; otherwise it stays opt-in, and the record says so.

7. **mrw and memoryd are optional enhancers, never requirements (the owner, 2026-10-21).** quality-harness works whole
   without either: with neither present every rule, gate and the watcher behave as decided above. Each integration is
   detected, never assumed: with mrw present, its receipts make writes visible (T5) and fewer turns reach the gates; with
   memoryd present, lessons persist across sessions (T5). Absent, the feature is off and said once per session, never an
   error, a refusal or a degraded verdict. Every task's tests run with each absent as well as present.

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

## Inter-task Contracts

| Contract | Producing task | Consuming task(s) | Breaking? |
|----------|----------------|-------------------|-----------|
| `nudge.outcome` rows (T1) | T1 | T2, T3, T5 | No — new |
| the evidence gate (T2) | T2 | T3, T4 | No |
| the watcher socket (T3) | T3 | T4, T5, T6 | No |

## Implementation

See `tasks/README.md`: T1 first and alone, because every later decision reads its numbers; then T2, T3, T4 and T5; T6 last,
on ADR-116's release assets and the bench peer's stage.

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

- [ ] A cold Codex review of this draft before the owner's acceptance
- [ ] T1's numbers on this repository and one peer corpus before T2 is written in detail
