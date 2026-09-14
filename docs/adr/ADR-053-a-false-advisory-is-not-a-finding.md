# ADR-053: A false advisory is not a finding

**Status:** Accepted
**Date:** 2026-09-14
**Owner:** zy
**Spec:** None — no spec stage
**Cross-references:** ADR-005, ADR-038, ADR-047, ADR-048, ADR-050, ADR-052, `docs/BACKLOG.md` §207
**Governs:** `plugin/scripts/lifecycle.mjs`, `plugin/scripts/facts-gate-dispatch.sh`, `plugin/bin/adr-lint`, `tests/unread-advice.test.mjs`, `tests/swift-expect.test.mjs`, `tests/staged-product.test.mjs`

Class: every Advise surface that accuses a session of publishing unverified work, or names a PostToolUse miss, on a file or command the gate did not observe as unpublished authorship; plus the failure-call / comment-stripper that decides a Swift test can fail. Enumerated 2026-09-14 with `rg -n "unverifiedSince|unprovenWritePending|not-recognised|FAIL_CALLS|scan_code_only" plugin/scripts/lifecycle.mjs plugin/scripts/facts-gate-dispatch.sh plugin/bin/adr-lint tests/unread-advice.test.mjs tests/swift-expect.test.mjs tests/staged-product.test.mjs` and `git ls-files -- plugin/scripts/lifecycle.mjs plugin/scripts/facts-gate-dispatch.sh plugin/bin/adr-lint tests/staged-product.test.mjs` (new test files are `--others --exclude-standard` at authoring). Named members:

```
plugin/scripts/lifecycle.mjs            PreToolUse commit advise; analyzeTranscript lastMutation / lastUnprovenWrite / lastSuccessfulValidation
plugin/scripts/facts-gate-dispatch.sh   PostToolUse not-recognised arm
plugin/bin/adr-lint                     FAIL_CALLS; scan_code_only hash_comments; check_tests_can_fail
tests/unread-advice.test.mjs            T1–T4
tests/swift-expect.test.mjs             T5
tests/staged-product.test.mjs           PostToolUse once-per-session contract
```

Members left out: `tests/lifecycle.test.mjs` (existing commit-gate cases stay; new cases live in `tests/unread-advice.test.mjs`); `tests/test-lock.test.mjs` (hasher already keeps `#expect` under `swift=True`; do not edit locked bodies); `_mask_lock_noncode(..., swift=True)` (not this defect).

**Enforced-by:** `tests/unread-advice.test.mjs::commit gate does not accuse unverified when this Bash already runs a check then git commit`, `tests/unread-advice.test.mjs::a passing mrw --check is a validation for the commit gate`, `tests/unread-advice.test.mjs::a gitignored Write after a green check does not re-open the commit gate`, `tests/unread-advice.test.mjs::PostToolUse is silent on a file that is not a QH record`, `tests/swift-expect.test.mjs::Swift #expect is a failure call so an expect-only test is not dead`
**Invalidates:** ADR-038 — the clause of Decision 4 reading "PostToolUse names it at most once per file per session via `firstMentionThisSession`". PostToolUse does not name an ordinary non-QH write. Core `adr-lint FILE` and the commit boundary still name a miss. Does not reverse ADR-048's validation term (extends it for a completed `mrw --check`); does not reverse ADR-047 UNPROVEN; does not reverse ADR-050 hasher.
**Served-path change:** PreToolUse on `git commit` / `git push` is silent when this Bash already runs a recognised check before the publish, when a completed `mrw --check` passed, or when the only write since the last check is gitignored and untracked; PostToolUse no longer prints `not-recognised` for an ordinary markdown file; `adr-lint` accepts a Swift Testing `#expect` / `#require` body as a failure call.


## Context

An always-on advisory that is false trains agents to ignore the gate (CLAUDE.md §17). Inbox `0f152086…` (quality-blueprints, 2026-09-14): PreToolUse printed "Nothing has verified the work since your last change, so this commit would publish unchecked" on `pnpm check && git commit` after a declared check, after `mrw write --check` PASS, and after a gitignored ledger Write. Inbox `7bf7d4f7…` / BACKLOG §207: `adr-lint` BLOCKS a Swift task whose tests assert only with `#expect(...)` because `code_only` strips `#…` as a comment, so the body "calls nothing and asserts nothing".

Measured 2026-09-14 on this tree (`node --input-type=module` importing `plugin/scripts/lifecycle.mjs`): `isValidationCommand('pnpm check')` is true; `isValidationCommand('pnpm check && git commit -m x')` is false and `classifyCommand` is `mutation`; `pnpm check || git commit` is also `mutation` + publish; `mrw write --plan-file p.txt --check` is `unrecognised`. The PreToolUse hook runs before the command, so this command's check is not in the transcript. Accusing "nothing has verified" is an observation the gate did not make (ADR-005).

Debt at authoring (`python3 plugin/bin/adr-debt docs/adr`): ADR-052 deferred BACKLOG §207 is this record's T5 and is pulled in. §206 (never-hashable Tests rows) is a different class and stays. Other open follow-ups are a different class and stay.

## Existing Primitives Audit

- `isValidationCommand` / `UNSAFE_SEGMENT` — **reuse.** Do not flip whole-command `isValidationCommand('pnpm check && git commit')` to true: that would treat a mutation as a validation after the fact. T1 is PreToolUse-only: dropping a trailing `&&` / newline `git commit`/`git push` leaves a prefix `isValidationCommand` accepts. `||` / `;` / `|` stay refused.
- `unprovenWritePending` / `lastSuccessfulValidation` (ADR-048) — **reshape.** A completed `mrw write --check` that `commandSucceeded` is a recognised check, not a pending UNPROVEN write. `mrw write` without `--check` stays UNPROVEN.
- `lastMutation` / native Write recording — **reshape** for commit-gate authorship only: a gitignored, untracked path is not unpublished work a `git commit` would publish. Artifact gates on real records are unchanged.
- ADR-038 Decision 4 PostToolUse miss-naming — **amend.** Silent skip for ordinary non-QH Writes. Core and commit still name a miss.
- `scan_code_only(..., hash_comments=True)` / `FAIL_CALLS` — **reshape.** `#expect` / `#require` are Swift Testing macros, not line comments. Hasher `_mask_lock_noncode(..., swift=True)` already keeps them; lint `code_only` did not.

## Decision

**A gate does not accuse a check it has not finished watching, a write that will not be published, or a miss it was not asked to classify at this boundary. Swift Testing macros are failure calls.**

1. **T1.** PreToolUse: if this Bash is a recognised check joined to `git commit`/`git push` by `&&` or a newline, do not print "Nothing has verified the work". `pnpm check || git commit` still advises. `git add -A && git commit` still advises when unpublished work exists. Do not classify the whole compound as `validation`.
2. **T2.** A completed `mcp__mrw__mrw_write` with `check: true` (or Bash `mrw write … --check`) that `commandSucceeded` advances `lastSuccessfulValidation` and does not leave `unprovenWritePending`. Without `--check`, UNPROVEN remains.
3. **T3.** A native Write whose path `git check-ignore` accepts and `git ls-files --error-unmatch` rejects is not `lastMutation` for the commit gate. A tracked Write after a green check still advises.
4. **T4.** PostToolUse does not print `not-recognised` for a file that is not a QH record. The commit boundary and `python3 plugin/bin/adr-lint FILE` still name it.
5. **T5.** For Swift, `scan_code_only` does not treat `#expect` / `#require` as comments. An `#expect`-only / `#require`-only `@Test` body is not "calls nothing and asserts nothing". An empty body still blocks.

## Alternatives Considered

- **Flip `isValidationCommand` for any command that contains `git commit`.** Rejected: `check || git commit` would count as verified; a mutation riding with a check would become lastSuccessfulValidation after the fact.
- **Silence the commit gate whenever a check appears anywhere in the same tool_use.** Rejected: `;` and `||` hide the check's exit code.
- **Drop ignored paths from Stop as well.** Rejected as a wider ADR-051 change; this record scopes T3 to commit-gate authorship (`lastMutation` / `unverifiedSince`). A side effect of not recording `lastMutation` is Stop is also quiet on those paths, which is correct (they are not published).
- **Keep PostToolUse once-per-session naming.** Rejected: the finding is that ordinary Writes train skip. Commit and Core remain the places a miss is named.
- **Teach FAIL_CALLS `#expect` without fixing `code_only`.** Rejected: the stripper deletes the token before the search.

## Component / Boundary Impact

| Component | Ownership after change | Why it changes |
|-----------|------------------------|----------------|
| `lifecycle.mjs` PreToolUse | Session advise | T1 prefix; T2 mrw --check; T3 ignored Write |
| `analyzeTranscript` | Session authorship | T2 / T3 cursors |
| `facts-gate-dispatch.sh` | Session classifier | T4 PostToolUse silent skip |
| `adr-lint` | Core | T5 Swift macros in `code_only` / FAIL_CALLS |
| `tests/staged-product.test.mjs` | Session contract | PostToolUse no longer names an ordinary miss |

None — internal to Session / Core. No Module Map file in this repository; no architecture doc to update.

## Wiring & Contract Changes

| Surface | Change | Producer | Consumer(s) |
|---------|--------|----------|-------------|
| PreToolUse Bash git commit | skip "nothing has verified" when this command already runs a check | `publishPrecededByValidation` | authors |
| `analyzeTranscript` mrw --check | lastSuccessfulValidation; not lastUnprovenWrite | MCP / Bash result | commit gate, Stop, statusline |
| native Write | skip lastMutation when gitignored and untracked | `git check-ignore` + `git ls-files` | commit gate |
| PostToolUse miss | silent | facts-gate-dispatch | session |
| `check_tests_can_fail` | `#expect` / `#require` survive `code_only` | adr-lint | `done` |

## Inter-task Contracts

| Contract | Producing task | Consuming task(s) | Breaking? |
|----------|----------------|-------------------|-----------|
| `publishPrecededByValidation` | T1 | none | No — PreToolUse only |
| mrw --check as lastSuccessfulValidation | T2 | none | No — extends ADR-048 term |
| ignored-untracked skip | T3 | none | No |
| PostToolUse silent miss | T4 | staged-product once-per-session test | Yes — ADR-038 Decision 4 clause |
| Swift macro keep | T5 | none | No — hasher unchanged |

## Implementation

See `docs/adr/ADR-053-a-false-advisory-is-not-a-finding/tasks/README.md`.

## Consequences

- **Positive:** the commit gate and PostToolUse stop training skip on work that was checked, will not be published, or is not a QH record. Swift Testing tasks can `done`.
- **Negative:** a check that has not yet run is trusted because it is in the same `&&` chain; if the agent cancels after the check, the accusation was skipped for a commit that did not happen. That is the same trust `&&` already is.
- **Neutral:** `mrw write` without `--check` is still UNPROVEN. Hasher Swift lock tests are untouched.

## Out of Scope

- Subagent `am_*` writes vs controller-only (permanent: boundary: that is `wing_agentmemories` user-scope hooks, not this plugin)
- Bumping `TEST_HASH_REQUIRED_FROM` (permanent: boundary: ADR-052)
- Re-hashing committed first-red maps without `--relock` (permanent: boundary: ADR-050 F-1)
- Enabling JS `_js_regex_span_end` on `php=True` (permanent: boundary: ADR-052)
- Skipping never-hashable Tests rows so they stop blocking `done` (deferred: docs/BACKLOG.md §206)
- Pest arrow `{` leftover (permanent: boundary: not this class)
- Teaching `isValidationCommand` every declared `.quality-harness.json` `check` that is not already a VALIDATION_PATTERN (permanent: boundary: T1 uses the existing validation predicate plus `&&` / newline publish suffix)

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| `||` treated as verified | Med | High | suffix stripper only matches `&&` / newline; dirty test |
| mrw --check fail counted as validation | Med | High | `commandSucceeded` required; dirty is write without `--check` |
| tracked-but-ignored (`git add -f`) skipped | Low | Med | `ls-files --error-unmatch` keeps tracked paths |
| PostToolUse silence hides a real QH miss | Med | High | positive-match arms unchanged; commit and Core still name |

## Rollback

Revert the PreToolUse skip, the mrw --check arm, the gitignore skip, the PostToolUse early `exit 0`, and the `scan_code_only` macro keep. Existing Verification Logs are unchanged.

## Follow-ups

- [x] BACKLOG §207 Swift `#expect` is this record's T5.
