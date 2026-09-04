# ADR-035: A confident claim is checked against what ran, and every verdict is counted

**Status:** Proposed
**Date:** 2026-09-04
**Owner:** zy
**Spec:** None — no spec stage; the requirement is the measured finding in `docs/research/2026-08-28-verification-is-the-bottleneck.md` §2 and §11
**Cross-references:** `docs/research/2026-08-28-verification-is-the-bottleneck.md`, ADR-005, ADR-006, ADR-010, ADR-012, `docs/BACKLOG.md`
**Governs:** `plugin/scripts/lifecycle.mjs`, `plugin/scripts/claims-rate.mjs`
**Enforced-by:** `stop: a confident claim over unverified edits is named as a false success`
**Invalidates:** none — checked
**Served-path change:** At `Stop`, a final message that asserts completion over edits nothing has verified is told *which words* made the claim and *which check* did not run, instead of the same advisory an honest "I did not run the tests" gets — and every completion event is written to a machine-local ledger so a false-success rate exists.

## Context

The harness already sees the final message. `plugin/scripts/lifecycle.mjs` reads
`input.last_assistant_message` at two sites (`grep -n last_assistant_message plugin/scripts/lifecycle.mjs`
→ lines 3165 and 3166 at `b466f24`), both inside the branch that serves three hook events —
`Stop`, `SubagentStop`, `TaskCompleted` (line 3128). It already computes the evidence side:
`analyzeTranscript` says whether the project's check ran after the last edit
(`state.unverifiedSince(state.lastPublish)`), and the branch advises when it did not.

What it does not do, measured 2026-09-04 at `b466f24`:

1. **It does not read the claim.** The message classifiers that exist are negative —
   `interimResponse` (blocked, not done, waiting) and `evidenceLimited` (`EVIDENCE-LIMITED:`). A
   message saying "✅ All tests pass, task complete" over unverified edits gets exactly the advisory
   a message saying "I did not run the tests" gets. The dangerous case and the honest case are the
   same case to the gate.
2. **It records nothing.** `grep -n writeFileSync plugin/scripts/lifecycle.mjs` finds one marker
   write (line 2750) and no ledger. Each Stop is a verdict that evaporates, so no rate can be
   computed, and the research note's gap 1 ("no false-success rate is reported") is answered only
   by `adr-verify --sweep`, which measures *recorded* claims re-checked later — not the agent's own
   status assertions, which is what the literature's figure is about.

Why now. *From Confident Closing to Silent Failure* (arXiv 2606.09863) puts false success at
**75.8%** of failures among self-assessing coding agents, finds LLM judges never exceed
**AUROC 0.65** because they grade the confident closing language, and finds cheap deterministic
detectors reach **0.83–0.95** on the same task. *How Coding Agents Fail Their Users* (arXiv
2605.29442 v2, 2026-08-31; 20,574 real sessions) puts inaccurate self-reporting at **22.58%** of
misalignment episodes, and rising while the other classes fall. This repository's own README leads
with the sentence "an AI coding agent will tell you it is finished; sometimes it is not"; this
record is the harness checking the sentence it was built around.

## Existing Primitives Audit

- `analyzeTranscript`, `unverifiedSince`, `missingEvidenceReason`, `evidenceNudge`
  (`plugin/scripts/lifecycle.mjs`) — **reuse.** The evidence half exists; this record adds the claim
  half and the record.
- `interimResponse`, `evidenceLimited` (`lifecycle.mjs:1706-1713`) — **reuse, and they take
  precedence:** a negative or limited claim is never read as an assertion.
- `adr-verify --sweep`'s four disjoint, total buckets with `superseded` and `unrunnable` in
  neither half of the ratio (ADR-010) — **reshape** into the rate: a row the gate could not classify
  is in neither half.
- `CLAUDE_PLUGIN_DATA` as the machine-local home for harness state (`plugin/bin/adr-verify:694`,
  the mutant journal) — **reuse** for the ledger.
- `scripts/session-profile.mjs` — **reuse** its transcript reader for the calibration task.
- `adr-judge` — the one model-free heuristic gate over prose already in the corpus; the classifier
  here is the same kind of thing: a vocabulary, never a verdict.

## Decision

**At every completion event where the harness sees a final message, classify the claim, pair it
with the evidence it already computes, record the pair, and name a false success when the two
disagree — advisory, never blocking.**

1. **The claim is one of five kinds, decided by a fixed vocabulary, in this precedence:**
   `unavailable` (no final message in the payload) → `limited` (`EVIDENCE-LIMITED:`, the existing
   `evidenceLimited`) → `hedged` (the existing `interimResponse`: blocked, not done, waiting,
   needs a decision) → `asserted` (a completion assertion: *done / complete / finished / fixed /
   resolved / implemented / verified / working*, or *tests / checks / build / CI* with *pass /
   passing / green*, or a ✅ mark — whole words, in the final message only) → `none`. The matched
   words are kept, at most eighty characters, so an advisory can quote them.
2. **The evidence is one of four:** `verified` (the project's check ran after the last edit),
   `unverified` (edits after the last check), `no-check` (the project declares and infers no check,
   which today already silences the advisory), `could-not-look` (the transcript was unreadable —
   ADR-005's UNRUN, not a verdict).
3. **A false success is `asserted` × `unverified`.** At `Stop` it is named: the quoted words, the
   check that did not run, and the edits it would have covered. Every other cell keeps today's
   behaviour exactly — the existing advisory for `none` × `unverified`, silence otherwise.
4. **Every event appends one JSON line** to `$CLAUDE_PLUGIN_DATA/claims.jsonl` — event, time,
   working directory, session id when present, claim kind, quoted words, evidence kind, count of
   edited paths. Without `CLAUDE_PLUGIN_DATA` nothing is written and one line on stderr says so;
   a ledger that silently skips is the false-clean this corpus refuses everywhere else.
5. **The rate is read by `plugin/scripts/claims-rate.mjs`:** false = `asserted`×`unverified`;
   denominator = every row whose evidence is `verified` or `unverified` and whose claim is not
   `unavailable`; `no-check`, `could-not-look` and `unavailable` are in neither half and are
   printed beside the rate. Zero rows prints "no observations", never a rate.

**Pre-registered criterion, and it can fail.** The vocabulary in (1) stays only if, on a hand-labelled
sample of at least thirty real final messages from this machine's own transcripts (they exist:
`~/.claude/projects/*/*.jsonl`, read the way `scripts/session-profile.mjs` reads them), at most
three messages classified `asserted` carry no completion assertion a reader would recognise —
precision ≥ 0.90. Below that the `asserted` arm is withdrawn in the same commit that records the
measurement, and the ledger keeps recording `none` so the evidence half is still counted. The
criterion is valid for English final messages produced by Claude Code on this machine in
2026-09; a corpus in another language or from another harness has to re-run T4 before trusting the
number.

What this deliberately is not: a judgement of whether the claim is *true*. The hook can see that a
check ran; whether the check proves the claim is `adr-verify`'s digest and the mutation campaign's
job, and a model's opinion of the prose never enters the chain (ADR-006, CLAUDE.md §4).

## Alternatives Considered

- **An LLM judge at Stop:** ask a model whether the final message is honest. Rejected because the
  literature this record rests on measured it — no judge configuration exceeded AUROC 0.65, and
  they key on the very closing language they are asked to judge — and because a model verdict in
  this corpus's evidence chain is the one thing every accepted record here refuses.
- **A learned (TF-IDF) detector, as the paper used:** rejected for now because it needs a labelled
  corpus this project does not have, and its weights are not something a reader can audit the way a
  vocabulary is. The paper's result is *deterministic beats judge*, not *TF-IDF is required*.
  Deferred, with the calibration sample from T4 as the seed (`docs/BACKLOG.md` §121).
- **Block the Stop until evidence exists:** rejected by CLAUDE.md §3 — a blocked agent produces a
  user who cannot tell what to do next. *Reason Less, Verify More*'s gain comes from refusing the
  write; this record keeps that tension open in the research note rather than resolving it here.
- **Record the ledger into the repository:** rejected — the harness writes into a user's tree only
  through `adr-verify`, into a task file the user pointed it at; a telemetry file appearing in
  every repository the plugin touches is a surprise, and CLAUDE.md §6 wants nothing personal near
  a push.
- **Do nothing — the advisory already fires on unverified work:** rejected because it fires the
  same way on the honest and the confident message, and records neither, so the rate the field
  reports cannot be reported here.

## Component / Boundary Impact

- `plugin/scripts/lifecycle.mjs` — the Stop branch gains a claim classifier and a ledger append.
  Its reason to change stays "what the completion gate says"; classification and recording are two
  small functions beside the ones that exist.
- `plugin/scripts/claims-rate.mjs` — new, read-only, one reason to change: how the ledger is
  summarised. It never writes and never advises.
- No gate under `plugin/bin/` changes. No hook event is added: the three that reach the branch
  today are the three this record governs (`node -e` over `plugin/hooks/hooks.json` → `Stop`,
  `SubagentStop`, `TaskCompleted` are wired; `lifecycle.mjs:3128` is where they meet).

## Wiring & Contract Changes

| Surface | Change | Producer | Consumer(s) |
|---------|--------|----------|-------------|
| `$CLAUDE_PLUGIN_DATA/claims.jsonl` | new machine-local JSONL ledger, one row per completion event: `{at, event, cwd, session, claim, phrase, evidence, mutations}` | `lifecycle.mjs` (T2) | `claims-rate.mjs` (T3); a human reading it |
| `CLAUDE_PLUGIN_DATA` | consumed, not set; absent means "not recorded, said so" | Claude Code | `lifecycle.mjs` (T2) |
| Stop `systemMessage` text | a new advisory shape for the `asserted`×`unverified` cell | `lifecycle.mjs` (T1) | the model, the user |
| `node plugin/scripts/claims-rate.mjs [--json]` | new read-only entry point | T3 | `docs/ONBOARDING.md`, `qh-doctor` readers |

## Inter-task Contracts

| Contract | Producing task | Consuming task(s) | Breaking? |
|----------|----------------|-------------------|-----------|
| `completionClaim(message)` → `{kind, phrase}` | T1 | T2, T4 | No — new symbol |
| `claims.jsonl` row schema | T2 | T3 | No — new file |
| the labelled sample and its precision | T4 | — (the criterion) | No — a measurement |

## Implementation

Four tasks; see `tasks/README.md`. T1 classifies and advises, T2 records, T3 reads the rate, T4
calibrates against real transcripts and is the criterion's own proof.

**Two `adr-lint` advisories stand open while this record is Proposed, and both close on execution.**
`Enforced-by:` names a mutation label T1 registers, and `Governs:` names
`plugin/scripts/claims-rate.mjs`, which T3 creates. Naming what the decision will own is what makes
the record checkable when the work lands; the alternative — writing `None` now and remembering to
fill it in later — is the drift these headers exist to catch. A third advisory, on T4's missing TDD
red step, stands permanently and says why in the task.

## Consequences

- **Positive:** the harness can report the field's headline number about itself — and the number
  is of the agent's *claims*, which is what the literature measures, rather than only of recorded
  fences re-checked later. A confident false claim gets a different sentence from an honest one.
- **Negative:** a vocabulary has false positives, and the ledger grows one line per turn-end for
  ever; both are bounded by T4's criterion and by a file a user can delete.
- **Neutral:** nothing blocks, nothing in any repository changes, and a session with
  `CLAUDE_PLUGIN_DATA` unset behaves exactly as today except for one stderr line.

## Out of Scope

- An LLM judge of the final message, at Stop or anywhere else (permanent: boundary: a model
  verdict never enters this corpus's evidence chain — ADR-006, CLAUDE.md §4)
- A learned detector trained on labelled final messages (deferred: docs/BACKLOG.md §121)
- Blocking the Stop, or any hook, on a missing check (permanent: boundary: CLAUDE.md §3 — gates
  advise and never block)
- Aggregating the ledger across machines or users (permanent: boundary: the ledger is
  machine-local under `CLAUDE_PLUGIN_DATA` and never leaves it)
- Claude Desktop and other MCP clients (permanent: fact: Desktop has no hooks and no plugin loader; citation: file `docs/mcp.md:3`)
- Judging whether the claim is true beyond "the check ran after the last edit" (permanent:
  boundary: that is `adr-verify`'s digest and the mutation campaign's job, not a hook's)
- Rotating or capping the ledger (deferred: docs/BACKLOG.md §121)

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| The vocabulary flags honest messages ("not fixed yet" read as "fixed") | Med | Med | negation classifiers take precedence; T4's precision criterion withdraws the arm below 0.90 |
| The vocabulary misses real claims (recall) | Med | Low | a miss is today's behaviour, not a new failure; T4 records recall on the same sample as a number, not a gate |
| `SubagentStop`/`TaskCompleted` payloads carry no final message | High | Low | `unavailable` is its own kind, in neither half of the rate |
| The ledger fills a disk over months | Low | Low | one short line per event; deferred rotation named in Out of Scope |
| A user reads the rate as the agent's honesty rate | Med | Med | the reader prints the denominator and the excluded rows every time, and never a rate over zero rows |

## Rollback

Delete `$CLAUDE_PLUGIN_DATA/claims.jsonl`; remove the classifier arm and the append from the Stop
branch; delete `plugin/scripts/claims-rate.mjs`. No repository state, no contract another gate
reads, no hook event to unregister — the branch returns to the advisory it emits today.

## Follow-ups

- [ ] none at authoring
