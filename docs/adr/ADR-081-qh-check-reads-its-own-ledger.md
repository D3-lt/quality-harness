# ADR-081: qh-check reads its own ledger

**Status:** Accepted
**Date:** 2026-10-01
**Owner:** Zy
**Spec:** docs/specs/2026-10-01-qh-check-reads-its-own-ledger.md
**Cross-references:** docs/adr/ADR-060-advisories-react-to-observed-events.md, docs/adr/ADR-061-an-unchecked-publish-is-refused.md, docs/adr/ADR-077-a-heavy-run-holds-a-lease-and-names-its-neighbours.md, docs/adr/ADR-080-no-hook-waits-on-the-artifact-pass.md
**Governs:** plugin/scripts/qh-check.mjs, plugin/scripts/lifecycle.mjs, plugin/scripts/publish-hook.mjs, plugin/bin/qh-check
**Enforced-by:** `tests/qh-check-reads-the-ledger.test.mjs::a tree whose latest check passed is not checked again, and says when and how long`
**Invalidates:** ADR-061 — a command proven to be one commit, on a tree whose latest fast check passed, is advised rather than refused; a push, any other form, and every reader of a full pass are unchanged.
**Served-path change:** `qh-check` (shipped) skips a tree whose latest check passed and says when; `qh-check --fast` runs a declared fast check, which lets a commit through with a warning and never a push.

## Context

The spec's Problem and Goal are inherited (docs/specs/2026-10-01-qh-check-reads-its-own-ledger.md). Decision-relevant deltas:

- **The ledger already answers.** Each record carries `before` and `after` (`plugin/scripts/qh-check.mjs:212`). `checkEventName` (`plugin/scripts/lifecycle.mjs:4042`) grades `check.passed` only when the tree did not move under the check.
- **The refusal already reuses a pass on an identical tree** (`latestCheckFor`, `plugin/scripts/lifecycle.mjs:4399`). What remains is the agent running the check again: 2,305 s at one adopter.
- **A cold Codex review of the first draft (gpt-6-astra, xhigh, 2026-10-01) asked for changes.** Each finding was confirmed against source and is answered below.
  - **Mixed commands.** `publishCommandIn` names the FIRST invocation, so `git commit -m x && git push` reads as `git commit`.
  - **Rollback.** An older `checkEventName` ignores `origin` and grades any stable exit-0 record in `checks.jsonl` as `check.passed`.
  - **Order.** "Any earlier pass" contradicts `latestCheckFor`: a pass followed by a failure would skip.
  - **What a tree covers.** The tree hash covers no ignored file, environment or service, and no write the session recorded as unobservable.
  - **Git's own hook** discards the text of a non-refusal (`plugin/scripts/publish-hook.mjs:88`).
  - **Dedupe.** The publish advisory's key counts only full checks (`checkRevision`), so a fast pass would not change it.
  - **Lease.** The `before` observation comes after the lease is admitted, so a skip placed there would wait.
- **The class a fast record must stay out of** was enumerated with `git grep -n "startsWith('check.')" -- plugin/scripts` and `git grep -n "checks.jsonl" -- plugin/scripts`. The four `check.*` selectors and every reader of `checks.jsonl` never see a record kept in another file.

## Existing Primitives Audit

- **`checkEventName`** grades a record; it grades a fast record unchanged, read from its own file.
- **`latestCheckFor` / `latestOf`** order records by ledger position; the skip uses the same order.
- **`unobservableWrites`** names writes no pass has cleared; the skip reads it for the session.
- **`checkCommandOrigin`** resolves `check`; a sibling resolves `fastCheck` by the same rules.
- **`publishVerdict`** is the one decision PreToolUse and git's hook share; the exemption lives there, and `runPublishHook` now returns its advisory text.

## Decision

`qh-check` without `--again` decides whether to skip BEFORE it takes the machine lease, from an observation of its own:
- **It skips** when the latest record in `checks.jsonl`, by position, for the same command and that observation's tree grades `check.passed`. It then names that pass's time and duration, says a tree hash does not cover ignored files or the environment, points at `--again`, writes nothing, and exits 0.
- **It runs** in every case it could not establish: a ledger not read whole, an observation that failed, a directory outside git, or a latest record that is not a pass.
- **It also runs** when the session (`CLAUDE_CODE_SESSION_ID`) holds a write git cannot see that no pass has cleared.
- **A run that misses observes the tree again after its wait**, as today. Every result line names its duration.

`qh-check --fast` resolves `fastCheck` from `.quality-harness.json`:
- When none is declared, it says so, runs nothing, and exits 2.
- Otherwise it runs it and appends the record to `.git/quality-harness/fast-checks.jsonl`, never `checks.jsonl`. No reader of a full pass opens that file, in this version or an older one after a rollback.

`publishVerdict` takes the publish exemption:
- The tree has no full pass, its latest fast record grades `check.passed`, and the command is proven to be one commit: one simple git command whose subcommand is commit, with nothing beside it, or git's `prepare-commit-msg`.
- It then returns an advisory, not a refusal: the full check has not passed and a push will need it.
- That advisory's key carries the fast record count, so it is said after an earlier refusal on the same tree.
- `runPublishHook` returns the advisory's text with code 0. Anything that pushes, and any form not proven, is refused as today.

This fails if a torn ledger ever skips; the third test tears it and asserts the check ran.

## Alternatives Considered

- **Always run, and only say when it already passed.** Rejected by the owner: it saves nothing.
- **Reuse a pass across a change outside declared inputs (`checkInputs`).** Deferred by the owner until it can be measured.
- **Keep fast records in `checks.jsonl` with `origin: "fast"`.** Rejected on review: an older reader grades them as full passes, so a rollback would turn fast evidence into a push's.
- **Exempt whatever `publishCommandIn` names first as a commit.** Rejected on review: a commit followed by a push would ride it.

## Component / Boundary Impact

None — internal to qh-check, the lifecycle hook and git's hook.

## Wiring & Contract Changes

Inherited from docs/specs/2026-10-01-qh-check-reads-its-own-ledger.md §Contracts Touched; delta: `qh-check --help` and the `plugin/bin/qh-check` wrapper's usage name `--again` and `--fast`.

## Inter-task Contracts

| Contract | Producing task | Consuming task(s) | Breaking? |
|----------|----------------|-------------------|-----------|
| `qh-check`'s option parsing (`--again`) | T1 | T2 | No — T2 adds `--fast` beside it |

## Implementation

See `docs/adr/ADR-081-qh-check-reads-its-own-ledger/tasks/README.md`.

## Consequences

- **Positive:** a check the ledger already proves is not paid for again; a project with a fast check commits on it.
- **Negative:** a flaky or environment-dependent check that passed once is not re-run on that tree unless asked; the skip line says so.
- **Neutral:** the refusal on an unchecked tree, on a push and on any unproven form reads exactly as before; CLAUDE.md §3's description of ADR-061's refusal gains the commit exemption in the same change.

## Out of Scope

Inherited from docs/specs/2026-10-01-qh-check-reads-its-own-ledger.md §Non-Goals; delta:

- Reuse across a change outside declared inputs (deferred: docs/BACKLOG.md §331)

## Risks

Inherited from docs/specs/2026-10-01-qh-check-reads-its-own-ledger.md §Risks; delta: none.

## Rollback

Revert the commits. `fast-checks.jsonl` is then read by nothing, so no fast record becomes a full pass, and every commit needs the full check again.

## Follow-ups

- [ ] Measure the same-tree skips at the adopters a week after release, against the 53 of 280 measured before it.
