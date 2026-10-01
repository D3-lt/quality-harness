# ADR-080: No hook waits on the artifact pass

**Status:** Proposed
**Date:** 2026-10-01
**Owner:** Zy
**Spec:** docs/specs/2026-10-01-no-hook-waits-on-the-artifact-pass.md
**Cross-references:** docs/adr/ADR-060-advisories-react-to-observed-events.md, docs/adr/ADR-061-an-unchecked-publish-is-refused.md, docs/adr/ADR-077-a-heavy-run-holds-a-lease-and-names-its-neighbours.md
**Governs:** plugin/scripts/lifecycle.mjs, plugin/scripts/run-shell-hook.mjs
**Enforced-by:** `tests/artifact-pass-behind.test.mjs::no boundary waits for the artifact pass`
**Invalidates:** ADR-060 — rule A's gating moves from in line to behind the boundary, and its verdicts reach the session log by import; what it gates, what it says and how severe a finding is are unchanged.
**Served-path change:** the lifecycle hook (shipped) no longer gates artifacts in line at a publish request, Stop, SubagentStop, TaskCompleted or PreCompact; it starts one detached pass per session, which writes its own ledger, and the session's hooks import from it and say its findings.

## Context

The spec's Problem and Goal are inherited (docs/specs/2026-10-01-no-hook-waits-on-the-artifact-pass.md). Decision-relevant deltas:

- Measured from two adopters' own transcripts and logs, 2026-10-01: PreToolUse:Bash averaged 1.6–3.5 s, worst 45.6 s. Replayed on a clone with a real 422 KB session log, a commit waited 44.9 s, 43.3 s of it in the batch, which is the publish budget (`ARTIFACT_BUDGETS`, `plugin/scripts/lifecycle.mjs:5198`) spent in full.
- The owner chose, the same day: behind every boundary, findings on the next hook, resume rather than restart.
- A cold Codex review of the first draft (gpt-6-astra, xhigh, 2026-10-01) asked for changes, all confirmed against source. Each is answered in the Decision:
  - **A torn session log stops the refusal.** It is read whole or not at all (`lifecycle.mjs:4771`), so the pass may not write it.
  - **A finding written after its verdict is lost to a kill.** A complete verdict suppresses a re-gate (`:5257`), even for an advisory failure (`run-shell-hook.mjs:462`). So a verdict and its findings are one line.
  - **A reviewer's PreToolUse touches nothing of the parent's** (`lifecycle.mjs:5389`), so delivery must exclude it.
  - **A pid lock cannot be reclaimed safely**: the pid can be reused, and the children can outlive it. So the lock is reclaimed by deadline.
- The class — every caller of `artifactRule` — enumerated with `git grep -n 'artifactRule(' -- plugin/scripts/lifecycle.mjs`: PreCompact (`:5486`), the publish request (`:5582`), Stop/SubagentStop/TaskCompleted (`:5592`). The per-edit gate (`runEditGate`, PostToolUse) is a single-file path and stays in line.
- The tests that read an in-line verdict, enumerated with `git grep -l 'artifact\.gated' -- tests`: `artifact-key`, `evidence-flip`, `late-baseline`, `observed-events` (and this record's own). `observed-events` holds locked tests (`python3 scripts/test-locks.py tests/observed-events.test.mjs`), so their bodies stay byte-identical; they select the in-process runner through the environment their helpers pass.
- F-8 holds already (`plugin/scripts/lifecycle.mjs:4761`, `:4822`); its tests are guards.

## Existing Primitives Audit

- **`artifactRule`** (`plugin/scripts/lifecycle.mjs:5229`) computes the targets and runs the batch. It is split: the target computation stays in the hook, and the batch moves into the pass.
- **`runArtifactBatch`** (`plugin/scripts/run-shell-hook.mjs:600`) is reused, inside the pass, with the pass's remaining budget; its children already run under `runWithTimeout`.
- **`importCheckRecords`** (`plugin/scripts/lifecycle.mjs:4075`) is the pattern for the import. A file one process writes is copied by hooks into the session log, deduplicated by record, with `complete` carried for a torn line.
- **`queueAction` / `action.emitted`** are reused for delivery as rule A, keyed by path and content.
- **`lease.mjs`** (ADR-077): the pass takes the machine lease while it gates.

## Decision

At a boundary, `artifactRule` keeps computing the targets: the changed paths whose current content has no complete verdict in the session log or the pass ledger. When there are any, the hook claims `.git/quality-harness/passes/<session>.lock` by creating it exclusively. The lock holds `{ token, pid, deadline }`, where the deadline is the pass budget plus a grace. The pass budget defaults to 300 s and is set by `QUALITY_HARNESS_ARTIFACT_PASS_BUDGET_MS`.

The hook then writes the request (session, ledger, lock, token, targets with their identities) and starts `node <runner> --artifact-pass <request>`, then returns:
- The runner is detached, with `stdio: 'ignore'`, `windowsHide`, and `unref`.
- The runner is `lifecycle.mjs` unless `QUALITY_HARNESS_ARTIFACT_PASS_RUNNER` names another. The value `inline` runs the same pass in-process and awaits it; that is the test seam for the tests above.
- A held lock whose deadline has not passed starts nothing.
- A lock past its deadline is reclaimed whatever its pid says. The claimant renames it aside, which only one can do, then creates it again.
- A runner that does not exist, or a spawn that fails, releases the lock and is said as UNRUN.

The pass writes one file, `passes/<session>.jsonl`:
- `pass.started` (pid, targets);
- one `pass.gated` line per path, carrying `complete`, the identity and its findings together, so no kill can separate a verdict from its finding;
- `pass.ended`.

The pass takes the machine lease. It stops its batch at its own deadline and deletes the lock only while the lock still holds its token.

Every lifecycle hook except a read-only reviewer's PreToolUse imports new `pass.gated` lines into the session log as `artifact.gated`, naming the pass. It queues each finding as rule A keyed by path and identity, so it is said once whether or not the pass has ended. The session log keeps its writers. This fails if any boundary hook still gates in line: the first test blocks the runner and asserts the hook returns and the session log holds no verdict.

## Alternatives Considered

- **Keep the pass in line with a short budget.** Rejected by the owner: any budget is time every commit waits, for advice.
- **Let the pass append to the session log.** Rejected on review: a second writer that a kill can tear turns the publish refusal into a warning for the rest of the session.
- **Run it only at the session end.** Rejected by the owner: findings would arrive too late to act on in the turn that caused them.
- **Gate the whole batch in one shell.** Deferred (Out of Scope): once no hook waits, its cost leaves the critical path, and sharing one shell across paths changes the dispatcher's per-path isolation.

## Component / Boundary Impact

None — internal to the lifecycle hook and its batch runner.

## Wiring & Contract Changes

Inherited from docs/specs/2026-10-01-no-hook-waits-on-the-artifact-pass.md §Contracts Touched; delta: the request file and the lock's fields above, which the runner seam must honour.

## Inter-task Contracts

| Contract | Producing task | Consuming task(s) | Breaking? |
|----------|----------------|-------------------|-----------|
| the `pass.gated` ledger line, with its findings | T1 | T2 | No — new file |

## Implementation

See `docs/adr/ADR-080-no-hook-waits-on-the-artifact-pass/tasks/README.md`.

## Consequences

- **Positive:** a commit, a turn end and a compaction no longer wait on advisory gating; measured in line, that was up to 45 s per commit.
- **Negative:** a finding arrives at the next hook after it is written, not in the boundary that caused it.
- **Neutral:** the machine still does the gating work; the pass holds the lease while it does.

## Out of Scope

Inherited from docs/specs/2026-10-01-no-hook-waits-on-the-artifact-pass.md §Non-Goals; delta:

- Gating a batch in one shell instead of one per path (deferred: docs/BACKLOG.md §330)

## Risks

Inherited from docs/specs/2026-10-01-no-hook-waits-on-the-artifact-pass.md §Risks; delta:

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| A detached process on Windows is killed with its parent hook | Med | Med | Started detached with ignored stdio (CLAUDE.md §7). A pass that dies leaves its lines, and its lock lapses at the deadline. The next boundary then resumes (F-4) |
| A torn ledger line | Low | Low | The import marks it as could-not-read, so that path has no verdict and is gated again; the session log is not touched |

## Rollback

Revert the commits. The ledger directory is then read by nothing, and the in-line pass returns.

## Follow-ups

- [ ] Measure the replayed adopter session's commit before and after (44.9 s at 3.4.1), and record both in the release notes.
