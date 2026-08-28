# ADR-005: A gate reports what it observed, and "could not run" is not a failure

**Status:** Accepted
**Date:** 2026-08-28
**Owner:** zy
**Spec:** None — no spec stage
**Cross-references:** docs/adr/ADR-003-a-gate-asserts-behaviour-not-shape.md, docs/BACKLOG.md §35
**Governs:** `plugin/bin/spec-verify`
**Invalidates:** none — checked. ADR-003 governs `bin/**` and requires every shipped gate to carry a mutation; this adds two rather than removing any, so that decision is extended, not changed.
**Served-path change:** A repository whose test runner `spec-verify` cannot detect now gets `[PARTIAL]`, an `UNRUN` line naming the remedy, and exit 4 — instead of `RED … test failing` and exit 3 over a suite that passes.

**Implementation preceded this record**, as with ADR-001, ADR-002 and ADR-004. The owner chose the
design from a four-option questionnaire on 2026-08-28 ("Split the verdict only" — separate the
verdict without adding Go support), and the change landed in the same session. The alternatives
below are the ones actually offered and actually weighed, not reconstructed.

## Context

Reported 2026-08-28 from a Go corpus running `spec-verify --implemented`: every fact came back

```
RED     F-16: test failing — no stack detected and no Cmd override
```

exit 3, which the gate's own docstring defines as "@implemented test failing". **The tests were all
passing.** Go appears in no branch of `detect_stack` and no key of `cmds`, so nothing ran — and the
gate reported the single outcome it had not observed.

This is the class the file already knows about. A comment at `bin/spec-verify:372` records the
monorepo case from 2026-08-23, where a root that looked like a Node project handed every PHPUnit
path to vitest and reported 23 passing bindings RED, and concludes: "a gate that reports RED for a
passing corpus teaches people to stop reading it." That instance was fixed with per-path stack
detection. The same class one level up — no runner at all, rather than the wrong one — still
printed RED.

The cost is not the noise. `survived` from a mutation sends you to fix a test that is decoration;
`test failing` from a test that never ran sends you to fix code that is not broken, and the gate
saying so is the only thing claiming there is a problem. The corpus this plugin ships exists to stop
evidence claiming more than happened, and this was a gate doing exactly that about itself.

## Existing Primitives Audit

- `test_runs()` already returns `(ok, why)` and already distinguishes several *reasons* in `why`.
  **Reshaped:** the boolean becomes `"pass" | "fail" | "unrun"`; the reason string is unchanged in
  kind.
- `check_spec()` already returns parallel lists per finding class (`errors`, `missing`, `failing`),
  each with its own render prefix and exit code. **Reused:** `unrun` is a fourth list in the same
  shape, so nothing about how findings are collected or printed is new.
- `scripts/coverage.sh` already prints `PARTIAL` for "the floors held and one thing was not
  measured". **Reused:** the same word, for the same situation, so a reader meets one vocabulary.

## Decision

`test_runs()` answers with three states. `"unrun"` is rendered as `UNRUN`, never under `RED`, never
counted as a failure, and carries a message naming the remedy — add a `Cmd` cell, or bind the fact
under a directory whose markers name a known runner. The spec's status word becomes `PARTIAL`, and
the process exits **4**, a code added to the docstring's contract.

A real failure outranks an unadjudicated one: exit 3 still wins when both are present, because "the
code does not do what the spec says" is actionable now. 4 is reached only when nothing observed
failed — "as far as I could check, and I could not check everything". `UNRUN` lines print either
way.

What would make this wrong: `UNRUN` being treated as success. It is non-zero and the status word is
not `PASS`, both asserted by `tests/gate-rules.test.mjs`, and mutation
`spec-verify: a fact nothing could adjudicate is not a pass` sets the code back to 0 and must go RED.

## Alternatives Considered

- **Split the verdict AND add `go test` to `cmds`.** Offered and rejected by the owner. Adding a
  runner is a separate decision with its own binding grammar and its own failure modes; the false
  claim is fixable without it, and mixing them would ship an untested runner under cover of a bug
  fix.
- **Add Go support only.** Rejected: it closes one reported case and leaves every other undetected
  stack — Elixir, Ruby, Gradle, anything new — still reported as a failing test. The defect is the
  claim, not the missing runner.
- **Leave it; a `Cmd` override is the documented escape.** Rejected: scenarios have no `Cmd` column
  at all, so no amount of authoring could fix a scenario binding, and an author cannot reach for an
  escape they have not been told about — the old message said what was missing, never what to do.
- **Report `unrun` as a pass.** Rejected outright: it is the mirror-image defect, and worse, because
  a green gate is not read at all.

## Component / Boundary Impact

None — internal to `bin/spec-verify`. No other gate, hook or skill reads its exit code today.

## Wiring & Contract Changes

| Surface | Change | Producer | Consumer(s) |
|---------|--------|----------|-------------|
| `spec-verify` exit codes | 4 added: could not run a bound test | `main()` | anyone gating on `spec-verify --implemented`, including `/adr-execute`'s completion report |
| `spec-verify` stdout | `UNRUN` prefix and `[PARTIAL]` status added | `main()` | readers of the run pasted into a spec or ADR |
| `test_runs()` return | `bool` → `"pass" \| "fail" \| "unrun"` | `test_runs()` | `check_spec()` |

## Inter-task Contracts

None — single task.

## Implementation

One task, in `tasks/`. See `tasks/README.md`.

## Consequences

- **Positive:** a passing corpus on an undetected stack is no longer told its tests fail; the message
  names the remedy; the distinction is visible in the exit code, so a CI job can tell "broken" from
  "unproved".
- **Negative:** a caller that treated any non-zero as "tests failed" now sees a code it does not
  know. Nothing in this repository does, and non-zero still means "do not proceed".
- **Neutral:** Go corpora still cannot be adjudicated. They are now told so honestly instead of
  being told something false, which is the whole of this decision.

## Out of Scope

- Adding `go test` or any other runner to `cmds`. (deferred: docs/BACKLOG.md §38)
- Giving scenarios their own `Cmd` column so a scenario binding can be overridden the way a fact's can. (deferred: docs/BACKLOG.md §38)
- Changing what `--draft` does. (permanent: it runs nothing at all, so it cannot misreport an outcome it failed to obtain.)
- `--spec --collect`, which DOES run a collector and reports a failure to run it as `bound test not found`. Found by this task's own class sweep, and the same defect one mode over. (deferred: docs/BACKLOG.md §38)

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| `UNRUN` is read as success and a spec ships unproved | Med | High | non-zero exit, status word is not `PASS`, and a mutation setting the code back to 0 must go RED |
| A real failure is masked by an unrun sibling | Low | High | exit 3 outranks 4; both lists print in the same run |
| The remedy message goes stale if `detect_stack` gains a runner | Low | Low | it names the mechanism (project markers, `Cmd` cell) rather than enumerating runners |

## Rollback

Revert the commit. No persistent state, no external integration, and no other component reads the
exit code. A caller pinned to the old behaviour would have been relying on a false failure.

## Follow-ups

None — the runner gap is deferred to the backlog, not left open here.
