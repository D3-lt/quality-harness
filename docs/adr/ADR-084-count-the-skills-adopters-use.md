# ADR-084: Count the skills adopters use, and read the ledgers in one report

**Status:** Accepted
**Date:** 2026-10-05
**Owner:** Zy
**Spec:** None — no spec stage; the plan of 2026-10-05 (Batch C) and CLAUDE.md §19 state the need
**Cross-references:** docs/adr/ADR-060-advisories-react-to-observed-events.md, docs/adr/ADR-080-no-hook-waits-on-the-artifact-pass.md, docs/adr/ADR-081-qh-check-reads-its-own-ledger.md
**Governs:** None — declared by its tasks
**Enforced-by:** `tests/skill-usage.test.mjs::a Skill call is recorded in the session log and prints nothing`
**Invalidates:** none — checked. ADR-060 records observed events, and this adds one more event of the same kind; ADR-080 says no hook waits on the artifact pass, and the new branch returns before that import; ADR-081's ledger is read, never written.
**Served-path change:** every adopter session runs one more PreToolUse hook on each `Skill` call, which writes one line to the session log and prints nothing; `ledger-report.mjs` is a new read-only reader an adopter runs by hand.

## Context

- **What we cannot see.** CLAUDE.md §19 says the plugin's cost is judged from the adopter's session:
  the skill listing on every start and compaction, and each skill's body each time it is invoked. The
  listing is measured (BACKLOG §350, Batch B: 6,518 characters on 2026-10-05) and now held to a budget.
  Which skills adopters actually invoke is measured nowhere, so a cut to the listing or to a body has
  no usage behind it. The autoharness review of 2026-10-05 counted skill use and this project does not.
- **ADR-081's follow-up has no reader.** Its measurement is due on or after 2026-10-08: same-tree skips
  from `.git/quality-harness/skips.jsonl` (written from 3.8.3, `qh-check.mjs:172`) against 53 of 280
  before it. Today that is a hand-written `jq` per peer.
- **The class.** Every PreToolUse registration in `plugin/hooks/hooks.json`, enumerated with
  `mrw read --grep '"matcher"' plugin/hooks/hooks.json`: one PreToolUse matcher,
  `Bash|PowerShell|Edit|Write|MultiEdit|NotebookEdit` (`hooks.json:103`), all routed to
  `lifecycle.mjs`. `Skill` is in none.
- **Measured cost.** `node plugin/scripts/lifecycle.mjs` with a PreToolUse `Skill` input, 12 runs on
  2026-10-05, macOS, load 4 of 10 cores: 70–80 ms each. It is one Node start per Skill call; a session
  calls few skills, so the cost is per invocation, not per prompt.

## Existing Primitives Audit

- **`appendEvent(cwd, session, entry)`** (`plugin/scripts/event-log.mjs:119`): reused as is to write
  `{ event: 'skill.invoked', skill }`; it already tolerates a torn tail.
- **`readEvents(cwd, session)`** (`event-log.mjs:155`): reused by the reader; it says `complete: false`
  when a log could not be read whole, which becomes UNPROVEN.
- **`lifecycle.mjs`'s PreToolUse dispatch**: reshaped by one early branch for `tool_name === 'Skill'`,
  placed before `importPassVerdicts`, so a Skill call never waits on or triggers the pass import.
- **`skips.jsonl` and `checks.jsonl`** (`qh-check.mjs:172`, `lifecycle.mjs:4351`): read as they are.

## Decision

- **Count.** `hooks.json`'s PreToolUse gains a second registration with matcher `Skill`, routed to
  `lifecycle.mjs`. Its branch records `{ event: 'skill.invoked', skill }` only for a name starting
  `quality-harness:`, writes nothing to stdout, and reports a failed write on stderr only. A skill of
  another plugin is not recorded: what it is called is not this plugin's to keep.
- **Read.** A new `plugin/scripts/ledger-report.mjs [--json] [<repo>]` prints, for one checkout: skill
  invocations by name and by session; same-tree skips with the sum of `savedMs` (labelled an estimate,
  as ADR-081 says); and checks run with their verdict counts and durations. It says UNPROVEN for any
  ledger it could not read whole, and never prints a session's content or a path outside the checkout.
- **What the counts may decide.** Only §19 cuts: shortening a description, or moving text out of a body
  into a reference the body names. No skill is removed on these counts alone.
- **This fails if** a Skill call prints anything, waits on the pass import, or a session log that could
  not be read is counted as zero. Each is a test; data that can show it exists in this repository's own
  sessions today.

## Alternatives Considered

- **Count from transcripts.** Rejected: transcripts are the adopter's, never sent, and their hook
  summary is not a ledger (ADR-081's follow-up says to count from the ledgers).
- **Count in PostToolUse.** Rejected: a Skill that fails to load is still an invocation the listing
  paid for, and PreToolUse sees it.
- **A separate tiny script instead of `lifecycle.mjs`.** Rejected for now: one more entry point to
  ship and test for a branch of a few lines; revisit if the measured 70–80 ms proves material.

## Component / Boundary Impact

None — internal to `plugin/scripts/lifecycle.mjs` and `plugin/hooks/hooks.json`, plus one new
read-only reader beside the others in `plugin/scripts/`.

## Wiring & Contract Changes

| Surface | Change | Producer | Consumer(s) |
|---------|--------|----------|-------------|
| `plugin/hooks/hooks.json` PreToolUse | a `Skill` matcher | T1 | Claude Code |
| session log event `skill.invoked` | new event `{ event, skill }` | T1 | T2 |
| `ledger-report.mjs` CLI and `--json` | new | T2 | adopters, the ADR-081 measurement |

## Inter-task Contracts

| Contract | Producing task | Consuming task(s) | Breaking? |
|----------|----------------|-------------------|-----------|
| `skill.invoked` event in the session log | T1 | T2 | No — new event |

## Implementation

See `docs/adr/ADR-084-count-the-skills-adopters-use/tasks/README.md`.

## Consequences

- **Positive:** a §19 cut can rest on what adopters invoke; ADR-081's measurement has a reader.
- **Negative:** 70–80 ms per Skill call (measured above), and one hook registration more in every session.
- **Neutral:** the counts stay in each checkout's `.git/`; nothing leaves a machine unless its owner
  pastes the report.

## Out of Scope

- Sending counts anywhere automatically (permanent: boundary: nothing leaves an adopter's machine unasked, CLAUDE.md §6)
- Hook durations per event, which no ledger records today; adding one is a separate decision (deferred: docs/BACKLOG.md §350)
- Skills of other plugins (permanent: boundary: their names are not this plugin's to record)

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| The Skill hook slows sessions | Low | Med | measured 70–80 ms; T1 asserts no stdout and no pass import |
| A count misread as an absence when a log was torn | Med | Med | `readEvents`' `complete` becomes UNPROVEN in T2 |

## Rollback

Remove the `Skill` registration from `hooks.json` and delete `ledger-report.mjs`. Events already
written stay in session logs and are ignored by every other reader.

## Follow-ups

- [ ] Run `ledger-report.mjs` at the peers on or after 2026-10-08, with ADR-081's measurement.
