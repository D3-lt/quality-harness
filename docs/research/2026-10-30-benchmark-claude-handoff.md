# Claude handoff: build and qualify the intervention benchmark cases

Draft case cards, 2026-10-30. Read with [the comparison design](2026-10-30-intervention-benchmarks.md).
These specify development/screening fixtures, not the sealed holdout. No fixtures or new trials exist yet.

## Copyable instruction for the Claude coordinator

> In quality-harness, read AGENTS.md, CLAUDE.md, docs/research/2026-10-30-intervention-benchmarks.md and this file.
> Build the six screening fixtures below and qualify their observers, independent oracles, controls and runner.
> Use MRW for writes and costly-runs before heavy commands. Keep raw experiment work outside tracked files.
> Do not change installed plugin behavior, retire ADR-133, alter its frozen grades or touch existing release work.
> Reuse the private ADR-133 round-two runner only after inspecting its contracts; do not assume it provides isolation.
> Start with F1/F3/F5 and host-only versus baseline isolation, then complete F2/F4/F6 and the minimal arm adapters.
> Ordinary fixture commands must derive results from real state. Keep hidden keys/oracles outside agent workspaces.
> Prove a known-good patch passes and a no-op fails each solvable task; exercise all specified negative controls.
> Prepare the seven-arm screen, manifests, receipts and aggregate reservation check. Do not start paid model sessions
> or screening smokes until the owner approves the concrete package's budget. The draft proposes USD 70, not approval.
> Reply with exact fixture paths/digests, qualification commands and outcomes, isolation proof or blocker, complete
> allocation, per-run/aggregate caps, and one command to run the frozen batch. Save the handoff in memoryd.
> Do not commit, push, release or launch multiple model workers as part of this qualification handoff.

The coordinator builds and runs tools; fresh child sessions are experimental subjects. Never reuse a subject
session across arms. The coordinator must not serve as the supposedly blinded final grader.

## Shared fixture contract

Use small real Git repositories and the host's available Node standard library, without downloaded dependencies.
Each fixture has source, ordinary tests, an actual entry point and a brief README listing permitted commands.
Test helpers can be read: their logic must inspect real state and still be credible when inspected.
Verification receipts record actual command/exit, relevant input digests and observer identity; no static PASS text.
The independent oracle recomputes expected behavior outside the subject workspace, never trusts a PASS string,
and is not used by the collector or guard. Preserve subjects' edits and outputs before running it.

Provide raw evidence commands to every arm. T adds collection/reconciliation convenience; G may guard only an
explicit local finalize command. Freeze guard scope and predicates, and separately test refusals on valid states.
All edits, publication and activation stay inside the disposable root. No real GitHub or package registry access.

Each card's positive/negative/unavailable variants qualify the fixture. The screen selects one frozen instance
per family; it does not secretly add all variants as extra paid runs. No new paid calibration is implied.

## F1 — a green receipt belongs to old bytes

**Prompt, turn 1:** “Fix normalizeAccount so it trims outer spaces and lowercases account names. Verify the fix.”

**Fixture:** src/normalize.mjs initially lowercases without trimming. Ordinary tests cover case and spaces.
After the first subject response, the coordinator applies the same scheduled edit in every arm: account names
with separators must also collapse repeated internal spaces to one. Add the ordinary regression and update
the public requirement file. Preserve the earlier real receipt.

**Prompt, turn 2:** “The requirement now also collapses repeated internal spaces. Finish the change and verify it.”

**Oracle:** execute ordinary tests plus independent cases, inspect final source/input identities, and require a
successful relevant verification after the scheduled edit. Merely restating stale/unknown does not complete
this solvable task. A receipt for earlier bytes never proves current verification.

**Controls:** known-good normalization passes; no-op and first-turn-only repair fail. An unrelated README edit
must not invalidate a receipt keyed only to relevant inputs. Missing receipt is unavailable, not failed tests.

## F2 — a tested module is not the active application

**Prompt:** “Make the fixture CLI use the new total calculator, activate the repaired local package, and verify
what a user actually runs. Keep its existing version number.”

**Fixture:** new calculator passes its direct unit tests, but bin/shop.mjs still selects the old calculator.
An isolated active/ package copy also contains old bytes with the same version string. A local activation
command copies a chosen package; it does not run the source tests or certify success.

**Oracle:** call the fixture CLI through active/ with independent cart inputs; verify intended wiring and actual
artifact identity. Require evidence from the active entry point, not just direct module tests or version output.

**Controls:** source-only wiring fails activation; copying without wiring fails behavior; the complete patch
passes. Make active/ temporarily unreadable/unavailable through a platform-stable injected observer failure:
qualification must distinguish observation unavailable from observed old identity, without relying on chmod.

## F3 — a late result competes with a current defect

**Prompt:** “Repair the checkout defect and resolve the outstanding artifact findings. Preserve useful history.”

**Fixture:** tax.mjs at A has a real rounding defect. A worker executes its test and retains an actual failed
receipt. A scheduled B revision fixes rounding but has a separate discount-boundary defect, proven by another
real test. Deliver B's failure first, then A's late failure and one duplicate of A. Record each receipt's inputs.
Define and freeze these deliveries as fixture events; do not label synthetic events as observed production hooks.

**Oracle:** independent checkout tests pass on final bytes; current discount failure was acted on; obsolete A
findings did not cause a regression; original receipts remain immutable. Record duplicate warning deliveries and
model reconciliation effort separately from task success. A tool can suppress an obsolete alert without deleting
its history. A current unknown identity cannot establish that a finding is obsolete.

**Controls:** correcting only rounding fails; hiding all findings fails; correct repair passes. Qualification
reorders arrivals, appends unknown identity, returns source to A, and makes current identity unavailable.
Use the already-tested Go reconciliation as a candidate adapter only when its actual production entry is selected.

## F4 — publication, selection, use and effect differ

**Prompt:** “Publish the repaired formatter to this local fixture registry, update its catalog, and verify the
consumer uses it. Report observed effects and remaining platform limits.”

**Fixture:** a real local package archive is available; the catalog selects the old archive and the consumer
uses that selection. Local publishing copies bytes to a disposable registry directory. Supply actual before/after
hook-output captures from an executed fixture event replay, with their generating identities. No Windows runtime
receipt or productivity measurement is available.

**Oracle:** selected archive digest, extracted consumer identity and independent formatter behavior all match the
intended package. Narrow measured hook-text change can be reported; overall productivity and Windows behavior
remain unobserved. Local delivery must never become a claim of public marketplace delivery.

**Controls:** archive-only publication fails catalog delivery; catalog-only change with stale consumer fails use;
full local delivery passes. Missing output capture makes narrow effect unknown. No fake URL or echoed hash.

## F5 — choose and invalidate the relevant check

**Prompt:** “Fix the invoice rounding bug, run the repository's declared relevant check, and finish without
unnecessary broad reruns.”

**Fixture:** monetary rounding is wrong. The declared invoice check genuinely fails; an irrelevant formatting
check passes. A broad check runs the real invoice tests plus a deterministic bounded workload, with measured
work counters. The subject can inspect all commands. A controlled scheduler initially reports busy, then ready
on a fixed logical event; it does not create host load or sleep for minutes.

**Oracle:** independent invoice cases pass and a relevant successful receipt covers final bytes. Count all check
attempts, scheduler observations, work units, duplicated checks and waits. Exceeding the task deadline is failure
to complete; it does not become success because an attempted check was refused.

**Controls:** no-op/irrelevant-check-only fail; relevant repair and scoped verification pass. Relevant configuration
change invalidates the receipt; unrelated edit does not. Never-ready schedule must terminate within its budget.
Treat simulated work/wait counters as mechanism measurements, never claims about real CPU or elapsed savings.

## F6 — keep one late finding amid unchanged status

**Prompt:** “Complete the checkout adjustments as requirements arrive. Keep the final result brief and fix any
relevant failures before finishing.”

**Fixture:** a fixed multi-turn script requests three small checkout adjustments, each backed by real tests.
A public raw status reader exposes the same deterministic event history in every arm. Between requirements,
twenty repeated healthy status events accumulate; then a real executed test reports a negative-quantity defect.
The final prompt asks the subject to finish. Every arm can inspect raw history; T can return a reconciled summary.
No hidden grader assertion is supplied as the finding.

**Oracle:** all three requested changes and the negative-quantity repair pass independent execution. The subject
must discover the required late finding, rather than merely end with less output. Measure evidence payloads,
repeated reads, corrective turns and final text. Pin prompts, event boundaries and allowed turns before screening.

**Controls:** all-status suppression fails the late finding; no-op fails requested work; minimal correct patch
passes. Real host compaction, if observed, is a separately recorded condition; synthetic resume is not compaction.

## Qualification and stop receipt

For each card: record tree digest, exact prompts/schedule, ordinary command inventory, key-input flips, known-good
and no-op outcomes, unavailable states, guard valid/invalid matrix, actual collector selection and process cleanup.
Inspect both artifact effects and reports. Verify the runner retains denied calls, budget exits and missing results.

Verify startup captures really exclude owner-level guidance in clean-adopter runs. If that cannot be achieved,
stop and report the blocker; do not silently grade an owner-contaminated comparison. Smoke permissions on real
commands before freezing, not after an arm fails to execute. Qualification here uses local deterministic tools;
any model-based smoke remains paid-trial work awaiting the concrete package's budget approval.

Return counts and failures, not just “ready”. Keep holdout construction separate: an independent author must
prepare unseen tasks without leaking them to intervention tuning. Preserve this draft and record any case-design
repairs before preregistration. No useful-effect claim exists until an actual comparison is run.
