# Spec: No hook waits on the artifact pass

> **Date:** 2026-10-01 · **Status:** Ready-for-ADR
> **Owner:** Zy · **Becomes:** ADR-080 (`docs/adr/ADR-080-no-hook-waits-on-the-artifact-pass.md`)
> **Gate:** Status may become Ready-for-ADR only after `spec-verify --spec <this file>` exits 0.
> **Cross-references:** ADR-060 (the artifact pass, rule A), ADR-061 (the publish refusal), ADR-077 (the machine lease), CLAUDE.md §19; BACKLOG §330

## Problem

Measured 2026-10-01 in two Go projects on this machine that use the plugin daily, read only from their
own transcripts and logs:

- **The PreToolUse:Bash hook averaged 1.6–3.5 s per run, worst case 45.6 s.** In one session that was
  145 s spent waiting inside it.
- **The cause: the advisory artifact pass (ADR-060, rule A) runs in line.** Replayed on a local clone with
  one of the real session logs, a `git commit` waited 44.9 s, against 0.58 s for a fresh session.
  43.3 s of it was the batch, which gates each path in its own shell (about 200 ms each), under a 45 s
  publish budget. That boundary had 217 targets and ran out of budget after 59. The paths it did not
  reach were recorded as nothing, so the next boundary began again.
- **The same pass runs in line at the turn end** (Stop, SubagentStop, TaskCompleted: 90 s budget) and
  before a compaction (20 s).
- **The "this repository is unchecked" advisory was sent 294 times** in that session, beside 18 refusals.
  It is already said once per key (`plugin/scripts/lifecycle.mjs:4822`), and the key carries the tree,
  the index and the check state (`:4761`), so those were 294 different keys. F-8 keeps that as a guard.

## Goal

No lifecycle hook waits on the artifact gates. The pass runs behind the boundary that asked for it, writes
only its own ledger, and resumes where it stopped. Every hook the session hears imports what the pass
has written since, and says each finding once. The session log keeps the writers it has, so the publish
refusal (ADR-061) reads exactly what it reads today.

## Actors

| Actor | Kind | Goal |
|-------|------|------|
| Session committing, ending a turn or compacting | human role | the command or turn end proceeds without waiting on advisory gating |
| The artifact pass | system | gate what is unanswered, and write each verdict and its findings where a hook can read them |
| A read-only reviewer the session spawned | system | stays out of the parent's ledger (ADR-061's sixth amendment) |

## Use Cases

### UC-1: A boundary starts the pass and returns

- **Trigger:** a publish request, Stop, SubagentStop, TaskCompleted or PreCompact · **Preconditions:** a changed path has no complete verdict for its current content
- **Main flow:**
  1. The hook claims the session's pass lock by creating it exclusively, with a deadline.
  2. It starts the pass detached and returns without gating.
  3. The pass appends each path's verdict, with its findings, to its own ledger as it lands.
  4. It ends by logging its end and releasing the lock it holds.
- **Failure paths:** a. the lock is held and its deadline has not passed → no second pass starts. b. the pass stopped before its end → its lock is reclaimed once its deadline passes, and the next pass takes only the paths without a complete verdict. c. the pass cannot be started → the boundary says UNRUN and holds no lock.
- **Postconditions:** every path the pass reached carries its verdict in the pass's ledger.

### UC-2: The findings reach the session

- **Trigger:** any lifecycle hook the session hears · **Preconditions:** the pass's ledger holds verdicts no hook has imported
- **Main flow:**
  1. The hook imports the new verdicts into the session log.
  2. It says each finding once, whether or not the pass has ended.
- **Failure paths:** a. the hook is a read-only reviewer's PreToolUse → it neither imports nor says anything, and the parent's next hook does. b. a ledger line cannot be read → that path has no verdict, so it is gated again.
- **Postconditions:** each finding is said once per path and content.

### UC-3: The unchecked advisory is said once per change

- **Trigger:** a command that mentions commit or push · **Preconditions:** no check has passed on the tree
- **Main flow:**
  1. The first command that only mentions it, for a given tree, index and check state, is told.
  2. Later ones with the same key are not.
- **Failure paths:** a. a command that publishes → refused (ADR-061) on every attempt.
- **Postconditions:** the advisory is said again when the tree, the index or the check state changes.

## Scenarios

### UC1-S1 [happy] No boundary waits for the pass [@implemented] → `tests/artifact-pass-behind.test.mjs::no boundary waits for the artifact pass` cmd:`node --test tests/artifact-pass-behind.test.mjs`

```gherkin
Given three records the session wrote, and a pass runner that blocks until released
When each of the five boundaries arrives
Then each hook returns while the pass is blocked, and the session log holds no verdict from it
```

### UC1-S2 [failure] One pass per session at a time [@implemented] → `tests/artifact-pass-behind.test.mjs::one artifact pass runs per session at a time` cmd:`node --test tests/artifact-pass-behind.test.mjs`

```gherkin
Given two boundaries arriving at once, and later a lock past its deadline held by a live pid
When each asks for a pass
Then one pass starts for the two, and the stale lock is reclaimed
```

### UC1-S3 [failure] A stopped pass resumes where it stopped [@implemented] → `tests/artifact-pass-behind.test.mjs::a stopped pass resumes with exactly the paths it did not reach` cmd:`node --test tests/artifact-pass-behind.test.mjs`

```gherkin
Given a pass that gated three of eight paths and stopped without ending
When its deadline passes and the next boundary arrives
Then a new pass starts with exactly the five paths without a verdict
```

### UC1-S4 [failure] A pass that cannot start is said [@implemented] → `tests/artifact-pass-behind.test.mjs::a pass that cannot start is said, not silent` cmd:`node --test tests/artifact-pass-behind.test.mjs`

```gherkin
Given a pass runner that does not exist
When a boundary asks for a pass
Then the hook says the artifacts are UNRUN, and holds no lock
```

### UC2-S1 [happy] Findings arrive at the next hook, once [@implemented] → `tests/artifact-pass-behind.test.mjs::a pass's findings reach the next hook once, while the pass still runs` cmd:`node --test tests/artifact-pass-behind.test.mjs`

```gherkin
Given a pass still running that has written a finding
When the next hook runs, and then another
Then the first says the finding and the second does not
```

### UC2-S2 [failure] A reviewer does not take the parent's finding [@implemented] → `tests/artifact-pass-behind.test.mjs::a read-only reviewer neither imports nor delivers a pass finding` cmd:`node --test tests/artifact-pass-behind.test.mjs`

```gherkin
Given a finding in the pass's ledger
When a read-only reviewer's PreToolUse runs, then the parent's next hook
Then the reviewer is told nothing and writes nothing, and the parent hears the finding
```

### UC3-S1 [happy] An unchanged advisory is said once [@implemented] → `tests/artifact-pass-behind.test.mjs::the unchecked advisory is said once per tree and check state` cmd:`node --test tests/artifact-pass-behind.test.mjs`

```gherkin
Given a changed, unchecked tree
When a command mentions commit twice, then after a check fails, then after the tree changes
Then the first, the third and the fourth are told, and the second is not
```

### UC3-S2 [failure] A refusal is never deduplicated [@implemented] → `tests/artifact-pass-behind.test.mjs::a refused publish is denied every time` cmd:`node --test tests/artifact-pass-behind.test.mjs`

```gherkin
Given a changed, unchecked tree
When the same commit is attempted twice
Then both are denied
```

## Facts

| ID | Assertion (invariant / behavior) | Test (`path::name`) | Tag | Cmd (optional) |
|----|----------------------------------|---------------------|-----|----------------|
| F-1 | No lifecycle hook runs the artifact gates in line: a publish request, Stop, SubagentStop, TaskCompleted and PreCompact each start a detached pass for the session and return while it runs. | `tests/artifact-pass-behind.test.mjs::no boundary waits for the artifact pass` | @implemented | `node --test tests/artifact-pass-behind.test.mjs` |
| F-2 | At most one pass runs per session: the hook claims a lock by creating it exclusively with a deadline, and a lock past its deadline is reclaimed by one claimant whatever its pid says. | `tests/artifact-pass-behind.test.mjs::one artifact pass runs per session at a time` | @implemented | `node --test tests/artifact-pass-behind.test.mjs` |
| F-3 | The pass writes only its own ledger, one line per path carrying the verdict and its findings together; it never writes the session log. | `tests/artifact-pass-behind.test.mjs::the pass writes only its own ledger` | @implemented | `node --test tests/artifact-pass-behind.test.mjs` |
| F-4 | A pass that stopped before its end is resumed by the next one with exactly the paths that have no complete verdict for their current content. | `tests/artifact-pass-behind.test.mjs::a stopped pass resumes with exactly the paths it did not reach` | @implemented | `node --test tests/artifact-pass-behind.test.mjs` |
| F-5 | Every lifecycle hook except a read-only reviewer's PreToolUse imports the pass's new verdicts into the session log and says each finding once per path and content, whether or not the pass has ended. | `tests/artifact-pass-behind.test.mjs::a pass's findings reach the next hook once, while the pass still runs` | @implemented | `node --test tests/artifact-pass-behind.test.mjs` |
| F-6 | A read-only reviewer's PreToolUse neither imports a pass verdict nor says a finding; the parent's next hook does. | `tests/artifact-pass-behind.test.mjs::a read-only reviewer neither imports nor delivers a pass finding` | @implemented | `node --test tests/artifact-pass-behind.test.mjs` |
| F-7 | A pass that cannot be started is said — its artifacts UNRUN — and leaves no lock, never silence (ADR-005). | `tests/artifact-pass-behind.test.mjs::a pass that cannot start is said, not silent` | @implemented | `node --test tests/artifact-pass-behind.test.mjs` |
| F-8 | The unchecked advisory on a command that only mentions commit or push is said once per tree, index and check state; a publish on an unchecked tree is denied on every attempt. Holds today (`plugin/scripts/lifecycle.mjs:4761`, `:4822`); kept as a guard. | `tests/artifact-pass-behind.test.mjs::the unchecked advisory is said once per tree and check state` | @implemented | `node --test tests/artifact-pass-behind.test.mjs` |

## Domain

The **artifact pass** is ADR-060's rule A: gate every artifact the session changed whose current content has
no complete verdict. A **boundary** is a hook event that asks for it. The **session log** is
`.git/quality-harness/sessions/<session>.jsonl`, written by hooks. The **pass ledger** is
`.git/quality-harness/passes/<session>.jsonl`, written by the pass alone, with its **lock** beside it.

## Contracts Touched

| Surface | Change | Consumers |
|---------|--------|-----------|
| Lifecycle hooks at a publish request, Stop, SubagentStop, TaskCompleted, PreCompact | no longer gate in line; start a detached pass | every adopter session |
| `.git/quality-harness/passes/` | new: a ledger and a lock per session | lifecycle hooks |
| Session log | `artifact.gated` entries imported from the ledger, naming the pass | lifecycle readers, `session-profile` |
| `QUALITY_HARNESS_ARTIFACT_PASS_RUNNER`, `QUALITY_HARNESS_ARTIFACT_PASS_BUDGET_MS` | new environment seams | tests |

## Non-Goals

- Changing what a gate checks or how severe a finding is.
- The publish refusal (ADR-061) and its decision: a refused command is still refused, on every attempt.
- Exactly-once delivery across a host that kills a hook after it recorded a finding as said and before
  its output was read. Every advisory has that limit today (`lifecycle.mjs:4363`, `:975`).
- qh-check's own cost: ADR-081.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| A finding arrives a turn later than before | High | Low | The pass was already advisory (ADR-060); a finding is said by the next hook after it is written, not after the pass ends |
| A detached pass outlives the session or competes with a check | Med | Med | One pass per session (F-2), a deadline it enforces on itself and its gates, and the machine lease (ADR-077) while it gates |
| A torn line in the session log weakens the publish refusal | Low | High | F-3: the pass never writes the session log, so it adds no writer that could tear it |
| Two hooks at once both say a finding | Low | Low | Advisory only; the same as every advisory today |

## Open Questions

## Verify

```bash
spec-verify --spec docs/specs/2026-10-01-no-hook-waits-on-the-artifact-pass.md
```

## Grill Log (appendix)

| # | Question | Fact | Decision |
|---|----------|------|----------|
| 1 | How should the advisory pass run at a commit? | F-1 | Behind the commit, findings on the next hook, resuming rather than restarting (owner, 2026-10-01) |
| 2 | And at Stop, SubagentStop, TaskCompleted and PreCompact? | F-1 | All boundaries behind (owner, 2026-10-01) |
| 3 | The repeated "unchecked" advisory? | F-8 | Said once per change; a refusal always said (owner, 2026-10-01). The code already keys it per tree, index and check state, so F-8 is a guard |
| 4 | Where do the findings go? | F-5 | Scouted: the next lifecycle hook the session hears, the only one that can speak to it afterwards |
| 5 | May the pass write the session log? | F-3 | Scouted, from the Codex review of 2026-10-01: no. A torn session log stops the publish refusal (`lifecycle.mjs:4771`), so the pass gets its own ledger and hooks import from it |
| 6 | Does a reviewer take a pass finding? | F-6 | Scouted: no. A read-only reviewer's PreToolUse touches nothing of the parent's (`lifecycle.mjs:5389`) |
