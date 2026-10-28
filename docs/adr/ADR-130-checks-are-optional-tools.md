# ADR-130: Checks are optional tools

**Status:** Accepted
**Date:** 2026-10-28
**Accepted:** 2026-10-28 by the owner: "Optional runner: remove compulsory checks, nags, and automatic baselines"
**Owner:** Zy
**Spec:** None — the owner selected the scope after the cost review
**Cross-references:** docs/adr/ADR-061-an-unchecked-publish-is-refused.md, docs/adr/ADR-066-git-refuses-an-unchecked-publish.md, docs/adr/ADR-081-qh-check-reads-its-own-ledger.md, docs/adr/ADR-100-a-repeated-procedure-is-one-command.md, docs/adr/ADR-111-the-turn-end-judges-against-a-baseline.md
**Governs:** plugin/scripts/qh-check.mjs, core/hooks/orientation.go, core/hooks/publish.go, core/hooks/turnend.go, plugin/scripts/publish-hook.mjs, core/hooks/publish.go, plugin/scripts/session-orientation.mjs, plugin/scripts/session-notes.mjs, core/hooks/notes.go, core/hooks/lifecycle.go, core/hooks/sessionend.go, core/hooks/orientation.go, core/hooks/publish.go
**Enforced-by:** tests/optional-check.test.mjs::an unchecked commit and push receive no check refusal or check nag, tests/check-after-wait.test.mjs::a waiting check reuses the pass recorded before its turn and runs the command only once
**Invalidates:** ADR-061's unsolicited publish refusal; ADR-066's refusing git hooks; ADR-081's requirement that commits and pushes obtain passes; ADR-100's mandatory use of check-and-commit; ADR-111's automatic baseline and check-demanding turn-end findings. Explicit execution, evidence, pass reuse, and check-and-commit remain.
**Served-path change:** opening or ending a session never requires a project check, and publishing is independent of the check ledger

## Context

The local full-check ledger held 820 runs with 167267408 ms of accumulated wall time. The fast ledger held 765 runs with
80461798 ms. These are historical wall windows, not CPU time or a causal estimate of total system load. Of the 426 full
runs marked contended, 313 started at or below the core count and exceeded it only at the end. Existing ADR-115 already
records selftests producing their own end load. A retry policy can therefore add work because of the work it just ran.

The reports do not establish a refusal false-positive rate: `action.emitted` omits the deny decision, and an emission
includes advice. Manual quiet-machine waits are not recorded as lease waits. The owner chose the optional runner with
those limits explicit, rather than waiting for a number these ledgers cannot supply.

## Existing Primitives Audit

`qh-check` already separates execution from ledger readers, keeps fast passes apart, and reuses full passes on unchanged
trees. `qh-check --commit` explicitly asks for checking and retains its index and argument preconditions. The reviewer
read-only guard and ledger-write guard protect separate contracts and remain.

## Decision

- Remove publish refusal and publish check advice from Node and Go hooks. Previously exported refusing git events become
  silent no-ops when they reach the updated script; new exports retain only commit tracking for branch-state suppression.
- Remove automatic baseline launches at SessionStart in both runtimes. The explicit baseline command remains available.
- Session orientation, previous-session notices and delegation contracts describe evidence without telling the agent to run a check.
- Stop delivering check-demanding R1, R4 and R5 findings. Evidence and claim reports remain descriptive; artifact gates,
  reviewer guards, and evidence-write guards retain their own contracts.
- Recheck full-pass reuse after waiting for a lease: another run may have completed the same check while this one queued.
  A changed tree, failed or unreadable evidence, unseen write, fast run, or explicit rerun still launches the command.
- A repository's own checks and CI remain its policy. The plugin does not impose them on adopters.

## Alternatives Considered

- Remove only the refusal: leaves the nags and automatic baselines driving work.
- Remove qh-check entirely: discards useful explicit execution and evidence reuse.
- Preserve the policy and optimize only the wrapper: does not address the owner's selected scope.

## Component / Boundary Impact

Both hook runtimes change together. Explicit CLI checks retain their exit-code and ledger contracts.

## Wiring & Contract Changes

SessionStart no longer selects a baseline runner. PreToolUse and git no longer select a check-ledger publish verdict.
Stop findings no longer demand checks. A waiter rereads the ledger before paying for another full run.

## Implementation

Node and Go hooks remove the compulsory publishing paths and automatic baseline launch. The Node shell classifier no
longer carries the fresh-repository, foreign-repository, arming and fast-commit exemption classifiers. The classifiers
still used by reviewer and artifact guards remain under executable shell and Node/Go parity tests.

The Go publish engine and its private exemption, arming, fast-pass and hint helpers are removed as well. Historical ledger-binding proofs use test-only helpers; those helpers are absent from the production binary. The production Go call graph and U1000 scan are clean after the removal.

Historical locked test bodies remain byte-identical. Their retired policy expectations are marked with an explicit
ADR-130 skip in the registration options. Mixed tests have active replacements for commit tracking, env exports,
claims-ledger failures, slow-hook reporting, resource readers and artifact paths. Mutants of removed behavior are retired;
retained contracts use active tests, and the new optional-runner mutations are exercised separately.

The deterministic queue fixture reduces command launches from two to one when a matching pass finishes before admission.
Reruns, fast checks, changed or torn evidence, and unseen writes still run; both a skip and a reuse exception release the
lease. The baseline launch test intercepts attempts synchronously rather than leaving a child or waiting for a marker.
These are boundary measurements, not a claim about overall CPU usage or end-to-end speed on adopters' machines.

## Consequences

Checks become a deliberate action. The plugin no longer prevents unchecked publishing. Repositories that require checks
express that requirement in their own hooks, branch protection, CI, or instructions.

## Out of Scope

Changes to another repository, CI platform coverage, and removal of the explicit evidence tools.

## Risks

An already running session may still reference a previous installed script until the plugin is reloaded. The updated
publish-hook script tolerates retired event names. Reuse still cannot speak for environment or service changes; `--again`
remains the explicit rerun.

## Rollback

Revert this change as a unit, including the rules and tests. Historical ledger rows remain intact.

## Follow-ups

- [ ] Complete the cross-platform checks, independent review, and outside run before release.
