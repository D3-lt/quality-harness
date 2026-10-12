# ADR-097: Remove what nothing acts on

**Status:** Accepted
**Date:** 2026-10-12
**Owner:** zy
**Spec:** None — no spec stage; the evidence is in Context
**Cross-references:** ADR-032, ADR-038, ADR-060, ADR-068, ADR-075, ADR-091, ADR-096
**Governs:** None — declared by its tasks
**Enforced-by:** ADR-097 T1: no shipped skill sends an agent to the removed wrapper
**Invalidates:** None — the post-edit hook, which ADR-038's F-33 and its spec keep, is deferred rather than removed (see Out of Scope)
**Served-path change:** `verify.mjs` and `eval-fixture.mjs` no longer ship, and the quality-policy skill no longer tells an agent to wrap a command in `verify.mjs`.

## Context

Phase 1 of the redesign the owner approved on 2026-10-12: remove what nothing acts on, before wiring what is left into the loops that act.
Two read-only investigations of 2026-10-12 are the evidence; their method is written here so the numbers can be re-taken.

- **What fired and what the agent did next.** Every plugin hook entry in this repository's 17 main and 184 subagent Claude Code
  transcripts (2026-09-16 to 2026-10-12), matched by hook command; "responded" means one of the agent's next two tool calls did what
  the output asked, read against a baseline of how often those calls happen anyway.
  - `verify.mjs`: run at most once, inside a scratch-clone command, in the whole period.
  - `post-edit-check.sh`: fired twice; its output is plain PostToolUse stdout with no `hookSpecificOutput`, which the host shows in
    the transcript view only (`plugin/scripts/run-shell-hook.mjs:380-397` wraps only the facts-gate output as `additionalContext`).
    A probe on a broken `.mjs` returned exit 0 and raw stdout. It never reached the agent. Its removal is deferred: see Out of Scope.
  - The facts-gate PostToolUse check fired 12 times and was acted on 12 times. It stays.
- **What each candidate is wired to** (`plugin/hooks/hooks.json`, `plugin/.claude-plugin/plugin.json`, consumers by `git grep -l`):
  - `plugin/scripts/verify.mjs` is a pass-through wrapper (`:29-53`) no hook runs. The one place that sends an agent to it,
    `plugin/skills/quality-policy/SKILL.md:51-54`, gives a reason that stopped being true with ADR-060 T7: hooks no longer identify a
    gate by reading a command's text (`plugin/scripts/completion-rules.mjs:29-30`). `qh-check` records what ran (`check-record.mjs:25`).
  - `plugin/scripts/post-edit-check.sh` runs on every Edit/Write through `hooks.json:142-150` and `run-shell-hook.mjs` `HOOK_SCRIPTS`.
  - `plugin/scripts/eval-fixture.mjs` ships in `plugin/` but only repository tooling and its test import it. It also carried a
    home-relative path in its usage comment until the 2026-10-12 history rewrite.
  - `.github/workflows/evals.yml` ran five times between 2026-09-07 and 2026-10-05, 9-13 s each, and its 2026-10-05 log reads
    `UNRUN: ANTHROPIC_API_KEY is not set`: `gh secret list` prints no rows. It has measured nothing.
- **Locked tests** (`python3 scripts/test-locks.py`): `tests/gate-rules.test.mjs` "the verification wrapper reports what the command it
  ran actually did" (ADR-075 T2, ADR-091 T3); `tests/lifecycle.test.mjs` "documented custom-validator wrapper executes through Node"
  (ADR-068 T2); `tests/package.test.mjs` "importing a script runs its CLI on nobody" (ADR-091 T3), whose list names `verify`.
- **Kept, with the reason measured beside it:** `qh-mcp` and `statusline.mjs` are opt-in and cost an adopter nothing; the `contended`
  field's reader is deferred by name in ADR-075; the per-edit facts gate is acted on. The orientation lines at SessionStart and the
  per-prompt brief were also measured, but "ran a check within two calls" is the wrong measure of an orientation note, and ADR-094
  (2026-10-10) had already cut the brief's repeats from 199 of 1268 to 6 of 91: neither is removed on this evidence.

The class: every shipped file or hook whose output reaches no agent and no tool, enumerated with
`git grep -l -E 'verify\.mjs|post-edit-check|eval-fixture' -- plugin scripts tests .github` (2026-10-12). The members this record
leaves are named above with their reasons.

## Existing Primitives Audit

- `qh-check` already records what ran and is what the completion and publish rules read: it replaces `verify.mjs` with nothing to add.
- The facts-gate dispatcher stays: it is reused at Stop, SessionEnd and publish (`on-turn-end.mjs:15`, `artifact-pass.mjs:86`).
- `scripts/` already holds the repository's eval tooling (`eval-compare.mjs`, `eval-deltas.mjs`, `eval-false-claims.mjs`).

## Decision

Remove `plugin/scripts/verify.mjs` and every pointer to it; move `eval-fixture.mjs` from `plugin/scripts/` to `scripts/`; delete
`.github/workflows/evals.yml`. A test asserts each absence and fails while the thing is still there. The three locked tests that name
`verify.mjs` are deleted or changed, and their tasks' lock maps are retaken with `adr-verify --relock --replace-hashes`. That command
snapshots the new hashes and runs no fence (its rows record `ms:0`); the deletions are proved by T1's own test and the full gate, and
ADR-091 T3's fence, which compares the catalogue with its historical shape, is deliberately not re-run.
It fails if `verify.mjs` or `plugin/scripts/eval-fixture.mjs` is still shipped, or if anything shipped or tested still names `verify.mjs`.

## Alternatives Considered

- **Keep them; they cost little.** Rejected: every always-on hook is paid by every adopter on every Edit (CLAUDE.md §19), and a
  skill line that points at a wrapper for a reason that is no longer true is a false instruction.
- **Remove the post-edit hook too.** Deferred, not rejected: its output never reached the agent, but it is spec-bound (UC2-S5 and F-33 of
  the staged-product spec, `@implemented`), ADR-038 T3's evidence names its test, and `spec-verify` has no tag that retires a fact.
- **Delete `plugin/evals/` too.** Deferred: ADR-032 governs it and its cases are the only behavioural evals the project has.

## Component / Boundary Impact

`plugin/` loses two scripts and one hook; `scripts/` gains one tool. No module changes what it judges.

## Wiring & Contract Changes

| Surface | Change | Producer | Consumer(s) |
|---------|--------|----------|-------------|
| `plugin/skills/quality-policy/SKILL.md` | the `verify.mjs` instruction is removed | T1 | every agent that loads the skill |
| `plugin/scripts/eval-fixture.mjs` → `scripts/eval-fixture.mjs` | moved; no longer shipped | T2 | `tests/eval-fixture.test.mjs`, the eval scripts |
| `.github/workflows/evals.yml` | deleted | T2 | none |

## Inter-task Contracts

None — the three removals are independent; no task produces anything another consumes.

## Implementation

See `tasks/README.md`: T1 (`verify.mjs`), T2 (eval tooling out of the plugin).

## Consequences

- **Positive:** no skill text that sends an agent to a wrapper nothing reads; a weekly workflow that measured nothing stops running;
  the shipped plugin carries no repository-only tool.
- **Negative:** an adopter's script that called `verify.mjs` by path breaks; `qh-check` is the replacement.
- **Neutral:** what every gate judges is unchanged.

## Out of Scope

- `plugin/evals/` and ADR-032 (deferred: docs/BACKLOG.md §30)
- The SessionStart orientation lines and the per-prompt brief (permanent: boundary: measured on 2026-10-12 with a measure that does not fit an orientation note; ADR-094 already cut the brief's repeats)
- The repairs to what the plugin says (the Codex paths, the blocker criteria and leaf contract, the "It blocks" text) (deferred: ADR-098)
- The SessionStart ready lines and the ADR-095 cache (deferred: docs/BACKLOG.md §378)
- Removing the `post-edit-check.sh` PostToolUse hook, whose output never reached the agent, until a spec fact can be retired: UC2-S5 and F-33 bind it, ADR-038 T3's evidence names its test, and the cold review of 2026-10-12 found six test files, a catalogue file and an ADR-068 T2 lock that consume it (deferred: docs/BACKLOG.md §378)

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| An adopter's script calls `verify.mjs` by path | Low | Low | the release notes name the removal; `qh-check` is the replacement |
| A relock hides a real change in a locked test | Low | Med | each relock follows the deletion it records, reviewed in the same commit; a relock proves nothing by itself (it runs no fence) |

## Rollback

Revert the task's commit: each removal is self-contained. No persistent state changes.

## Follow-ups

- [ ] After a release, confirm from an outside run that no adopter's corpus probe or hook output changed beyond the removed lines.
