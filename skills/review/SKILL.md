---
name: review
description: Default code review skill. Use when the user asks for a review, PR review, audit of changes, a second opinion on implementation quality, or a test-quality review. Loads a performance or security mode from references/ when the review centers on those. Do not use for implementation work.
---

# Review

Code review with an execution gate: no verdict on read-only evidence.

## Route by Risk

- Small, local, reversible diff: review inline.
- Moderate coupling or regression surface: use one fresh-context reviewer.
- High-risk boundary—auth, untrusted input, money/data integrity, concurrency, migration, public
  contract, production infrastructure, or cross-module ownership—use
  `/quality-harness:quality-cycle` or `/quality-harness:codex-review`.
- Parallel reviewers are justified only for genuinely independent concerns. Do not create a panel
  for routine work.

A delegated reviewer is a read-only leaf role. It must not invoke `/quality-harness:work`, another lifecycle
workflow, or an implementation agent.

## Execution Gate (before any verdict)

A verdict issued from reading alone is prose interpretation — run something first:

- Run the smallest relevant test scope for the touched code. Expand only if the change affects
  shared behavior. Paste command + exit code into the review.
- If the change belongs to an ADR task, run its `## Acceptance` command.
- Run lint/type checks when they are part of the repo's normal safety net.
- If nothing is runnable (docs-only, no test infra), state that explicitly — the verdict is then
  marked evidence-limited.

The coordinator supplies its observed command, exit code, and useful output as immutable evidence.
The reviewer may run additional checks but may not reinterpret a nonzero result as clean.

## Specialist Modes

- Performance-centered review → read `references/performance-mode.md` first.
- Security-centered review → prefer the built-in `security-review` skill for branch changes; for a
  scoped security pass inside a general review, read `references/security-mode.md`.

## 3-Pass Protocol

Findings first, no long summary. Prioritize correctness → safety → integration → UX/operability.
No style nits unless they cause confusion or risk. Cite concrete evidence from the changed code and
its callers. Prefer minimal fixes.

A blocking finding must identify all five: the violated contract or invariant, exact location,
reachable failure path, user/system impact, and smallest sufficient fix. Style preferences,
alternative architectures, speculative edge cases, raw syntactic duplication, future-proofing,
and optional cleanup are advisory—not blockers. Never manufacture new scope or auto-apply an
advisory suggestion.

### Pass 1: Correctness and Safety

What can break immediately, corrupt data, violate auth, or produce wrong behavior?
Read the full diff, the touched functions, and their direct callers. Check invariants, branch
logic, state mutation, auth checks, error paths, rollback. Look for: wrong condition or missing
branch, invalid input/state assumptions, partial writes, auth bypass, race conditions, silent
failure, false success reporting.
Output critical/high only, each with 5-Whys (below): Where / Symptom / Why chain / Root cause /
Smallest fix. Gate: material findings stop the review; after fixes rerun Pass 1.

### Pass 2: Integration and Wiring

Is the change wired into the system with one source of truth and no split paths?
Trace producers, consumers, side effects. Check event flow, state ownership, config authority,
runtime apply paths, lifecycle boundaries. Look for: duplicate mutation paths, unwired handlers,
stale caches, mismatched request/reply behavior, changed contract not reflected downstream, runtime
"hot apply" claims without real application, orphan tools/events/traits.
Gate: issues stop; after fixes rerun Pass 1 then 2.

### Pass 3: Regression, UX, Operability

Even with correct logic, can users or operators get misled, lose work, or hit unclear failures?
Check user-visible flows, error messages, retries, reload behavior, pending state, observability,
unsupported actions still exposed. Look for: optimistic UI without acknowledgement, unsaved state
loss, misleading success messages, poor delete semantics, tests missing for the real failure mode,
logs that hide root cause.
Gate: rerun Pass 3 for UI/message/test-only fixes; rerun 1→2→3 if the fix touches logic, state, or
wiring.

## Test Review Standard

- No happy-path-only tests by default. Prefer tests that prove the real failure mode, regression
  path, invalid state, boundary condition, retry path, or partial-failure behavior.
- Test priority order: 1) reproduce the bug or failure mode, 2) the boundary that makes the bug
  credible, 3) the invariant that must never break, 4) happy path only if coverage would otherwise
  be misleading.
- If the bug came from wiring, state ownership, stale cache, async timing, or authorization, ask
  for a test that exercises that exact path.
- Flag flaky time-, order-, or network-dependent tests.
- Flag over-mocking that hides integration gaps, and tests that only mirror the implementation.
- Reject test plans that never try to break the code.

## Loop Protocol

Fix from Pass 1 or 2 → rerun 1, 2, 3. Fix from Pass 3 only → rerun 3 unless logic/state changed.
Stop when one full cycle produces no new material findings. Same finding survives 3 loops →
escalate and state the design problem explicitly.

## 5 Whys Root Cause

For every critical/high finding: state the symptom → ask why until a design/assumption/structural
root cause (3–5 levels, don't force 5). Each "why" must cite code evidence. Validate the proposed
fix targets the root cause; if it only masks the symptom, say so and note the residual. Root cause
outside the diff → residual risk. Root cause reveals the change solves the wrong problem →
escalate before suggesting a fix. For every finding, verify the author's implicit assumption
against callers, data flow, and system contracts.

## Output Format

Summary: Approve / Approve with nits / Request changes: <primary reason>.
Evidence: commands run + exit codes (from the Execution Gate).
Findings, ranked: Severity - Where - Symptom - Why chain - Fix.
Optional: residual risks, missing tests (failure mode first).
When the harness requests ReportFindings: executed-evidence findings → CONFIRMED; read-only
inference → PLAUSIBLE.

## Model Discipline

- No invented defects; separate confirmed findings from hypotheses.
- Incomplete evidence → say what must be checked, don't guess.
- No vague findings ("seems off"), no padding to reach a quota; one well-supported finding beats
  several speculative ones.
- Claimed risk resting on an assumption → state the assumption.
- No implementation during review. Every finding specific enough that another agent can fix it
  without guessing. No regression claims without tracing the affected path.
