# Task ADR-058-T2: mrw read is a read

**Depends-on:** T1
**Covers:** none — no spec
**Estimated scope:** S (single file)
**Owner:** unassigned
**Produces:** none
**Consumes:** `tests/advice-accuracy.test.mjs` (file exists) (T1)
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `the mrw read recognition in classifyCommand`, `mrw write keeping its classification`, `each named test actually running`, `the regression suites that pin the classifier`

## Goal

`classifyCommand` returns `neither` for an `mrw read …` or `mrw --root DIR read …` invocation that is the whole segment, so a turn that only read with `mrw` leaves no pending UNPROVEN write, while `mrw write` is judged as before.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/advice-accuracy.test.mjs` | edit | the two tests below |
| `plugin/scripts/lifecycle.mjs` | edit | recognise the `read` subcommand of an `mrw` invocation in `classifyCommand`, through `commandInvocation` (line 517), beside `isMrwWriteCheckCommand` |
| `plugin/scripts/classify-command.mjs` | edit | the two family checks ask an optional `isRecognisedReadInvocation` hook before calling a family unrecognised, so only the `read` subcommand of `mrw` is admitted |

## Ordered Steps

1. [S1] Add the two tests with real assertions and see each fail on an assertion (TDD red).
2. [S2] Recognise `mrw [--root DIR|-C DIR] read <specs>` — the global options mrw v1.22.0's `--help` lists, measured 2026-09-16 — as a read through an `isRecognisedReadInvocation` hook that both family checks in `classify-command.mjs` consult; a redirect or a sibling segment is still judged by the mutation check.
3. [S3] Run the fence green and record mutants: widen the recognition to any `mrw` subcommand; drop it. [proof: mutation]

## Acceptance

```bash
set -o pipefail
out=$(node --test --test-reporter=tap --test-name-pattern '^(mrw read is a read, not an unproven write|mrw write is still judged as a write)$' tests/advice-accuracy.test.mjs 2>&1) \
  && for name in 'mrw read is a read, not an unproven write' 'mrw write is still judged as a write'; do printf '%s\n' "$out" | grep -qxE "ok [0-9]+ - $name" || { echo "did not run: $name"; exit 1; }; done \
  && node --test tests/classify.test.mjs tests/reviewer-guard.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `mrw read is a read, not an unproven write` | `tests/advice-accuracy.test.mjs` | `mrw read a.md:1-5`, `mrw --root /x read a.md` classify as `neither`; through `analyzeTranscript`, a passing check followed by an `mrw read` leaves `unprovenWritePending()` false | — | S1, S2 |
| `mrw write is still judged as a write` | `tests/advice-accuracy.test.mjs` | `mrw write - <<'PLAN' … PLAN` and `mrw read a.md; rm b.md` are not `neither` | — | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the two tests |
| 2 — something selects it | `analyzeTranscript` reads `classifyCommand`; S3's mutants remove or widen the recognition |
| 3 — the caller can discover it | n/a: no declared interface |
| 4 — it is used | ADR-058's Follow-up replay |

## Mutation Log
- 2026-09-16 · 2c5bdba* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · the mrw read recognition in classifyCommand: the hook is never passed, so mrw read is unrecognised again · acceptance-sha256:baef770cf201dbac79a6cdf4f4886352c5bb937597309169af48c0dae2837529
- 2026-09-16 · 2c5bdba* · mutant killed · exit 1 · `plugin/scripts/classify-command.mjs` · the mrw read recognition in classifyCommand: the bare-name family check stops consulting the hook · acceptance-sha256:baef770cf201dbac79a6cdf4f4886352c5bb937597309169af48c0dae2837529
- 2026-09-16 · 2c5bdba* · mutant killed · exit 1 · `plugin/scripts/classify-command.mjs` · the mrw read recognition in classifyCommand: the second family check stops consulting the hook · acceptance-sha256:baef770cf201dbac79a6cdf4f4886352c5bb937597309169af48c0dae2837529
- 2026-09-16 · 2c5bdba* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · mrw write keeping its classification: any mrw subcommand is admitted as a read · acceptance-sha256:baef770cf201dbac79a6cdf4f4886352c5bb937597309169af48c0dae2837529
- 2026-09-16 · 2c5bdba* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · mrw write keeping its classification: a global option value is read as the subcommand, so mrw --root read write is admitted · acceptance-sha256:baef770cf201dbac79a6cdf4f4886352c5bb937597309169af48c0dae2837529
- 2026-09-16 · 2c5bdba* · mutant killed · exit 1 · `tests/advice-accuracy.test.mjs` · each named test actually running: a renamed test selects nothing and the per-name ok grep must refuse it · acceptance-sha256:baef770cf201dbac79a6cdf4f4886352c5bb937597309169af48c0dae2837529
- 2026-09-16 · 2c5bdba* · mutant survived · exit 0 · `plugin/scripts/classify-command.mjs` · the regression suites that pin the classifier: pwsh/cmd payloads stop being unrecognised · acceptance-sha256:baef770cf201dbac79a6cdf4f4886352c5bb937597309169af48c0dae2837529
  ```
  the fence passed with the mechanism broken; it may not materialize, compile, load, or assert on the changed path
  ```
- 2026-09-16 · 2c5bdba* · mutant killed · exit 1 · `plugin/scripts/classify-command.mjs` · the regression suites that pin the classifier: a path-shaped executable such as ./scripts/selftest.sh is judged by its bare family again · acceptance-sha256:baef770cf201dbac79a6cdf4f4886352c5bb937597309169af48c0dae2837529
- 2026-09-16 · 2c5bdba* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · the hook is never passed, so mrw read is unrecognised again · acceptance-sha256:baef770cf201dbac79a6cdf4f4886352c5bb937597309169af48c0dae2837529 · covers:the mrw read recognition in classifyCommand
- 2026-09-16 · 2c5bdba* · mutant killed · exit 1 · `plugin/scripts/classify-command.mjs` · the bare-name family check stops consulting the hook · acceptance-sha256:baef770cf201dbac79a6cdf4f4886352c5bb937597309169af48c0dae2837529 · covers:the mrw read recognition in classifyCommand
- 2026-09-16 · 2c5bdba* · mutant killed · exit 1 · `plugin/scripts/classify-command.mjs` · the second family check stops consulting the hook · acceptance-sha256:baef770cf201dbac79a6cdf4f4886352c5bb937597309169af48c0dae2837529 · covers:the mrw read recognition in classifyCommand
- 2026-09-16 · 2c5bdba* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · any mrw subcommand is admitted as a read · acceptance-sha256:baef770cf201dbac79a6cdf4f4886352c5bb937597309169af48c0dae2837529 · covers:mrw write keeping its classification
- 2026-09-16 · 2c5bdba* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · a global option value is read as the subcommand, so mrw --root read write is admitted · acceptance-sha256:baef770cf201dbac79a6cdf4f4886352c5bb937597309169af48c0dae2837529 · covers:mrw write keeping its classification
- 2026-09-16 · 2c5bdba* · mutant killed · exit 1 · `tests/advice-accuracy.test.mjs` · a renamed test selects nothing and the per-name ok grep must refuse it · acceptance-sha256:baef770cf201dbac79a6cdf4f4886352c5bb937597309169af48c0dae2837529 · covers:each named test actually running
- 2026-09-16 · 2c5bdba* · mutant killed · exit 1 · `plugin/scripts/classify-command.mjs` · a path-shaped executable such as ./scripts/selftest.sh is judged by its bare family again; classify.test and reviewer-guard.test kill it · acceptance-sha256:baef770cf201dbac79a6cdf4f4886352c5bb937597309169af48c0dae2837529 · covers:the regression suites that pin the classifier

## Invariants

- ADR-047 holds: an unrecognised command is still UNPROVEN; only the `read` subcommand becomes recognised.
- The reviewer guard, which also reads `classifyCommand`, may now allow `mrw read` — a read.

## Risks

- A future `mrw read` flag that writes; the recognition names the subcommand, and the widening mutant must stay killed.

## Stop Condition

Stop and ask if `tests/reviewer-guard.test.mjs` goes red.

## Out of Scope

- `mrw iter`, `mrw seen`, `mrw stats` (not observed in the measured session)

## Verification Log
- 2026-09-16 · 2c5bdba* · exit 1 · `set -o pipefail …` · acceptance-sha256:baef770cf201dbac79a6cdf4f4886352c5bb937597309169af48c0dae2837529 · ms:123 · test-lock-sha256:e595936729d93ea435c5dada5bad3b096ba343ac815a659481ac3106e4bf01cf · test-lock-b64:Y2hlY2sJZjdlMjUxYjUwM2NhZWZlY2JhMTEyMjFhZDJjYzIyMjc3MDYxNDA1NzNiZWEyMGQ2MWQ5OTg3ZGE3YjYwNTI1Ngpib2R5CXRlc3RzL2FkdmljZS1hY2N1cmFjeS50ZXN0Lm1qcwlhIHRpbWVvdXQgd3JhcHBlciBkb2VzIG5vdCBsYXVuZGVyIGEgbXV0YXRpb24JOTdjM2NlOTJhMDYyMTFlNWNmMDcyNzE3ZTQ5YzI5MDA5MTcwZWJmMDI4MzI5ZDIxNjgzYjliYjg2YTE0NGMxMgpib2R5CXRlc3RzL2FkdmljZS1hY2N1cmFjeS50ZXN0Lm1qcwlhIHRpbWVvdXQtd3JhcHBlZCBjaGVjayBpcyBhIGNoZWNrCTBjMWM2MzZlMTBmZDYzNGIwMTUwODcxZjUzYjdjMjY2YmE3YjQzZjI1NjNjN2ZiZjUwZDE4NDI5MWY4ZTViN2QKYm9keQl0ZXN0cy9hZHZpY2UtYWNjdXJhY3kudGVzdC5tanMJbXJ3IHJlYWQgaXMgYSByZWFkLCBub3QgYW4gdW5wcm92ZW4gd3JpdGUJYjljMjYyYjRlNjM3YjNiZTUwNTdjNWM1ODhhZmUxYjNiMWEwMDFjZjFmMGM3ZjVlYzJjNTM1MzlkNWEyODA3Mgpib2R5CXRlc3RzL2FkdmljZS1hY2N1cmFjeS50ZXN0Lm1qcwltcncgd3JpdGUgaXMgc3RpbGwganVkZ2VkIGFzIGEgd3JpdGUJODE5YzU2ZGM4N2E3M2QyNDM5ZDA2OTI5YTUwMmY1ZDBkODM3MDVkNjhhNjM5ODJlMjRhYjgzZmQ3NDFhZmM0Mwpib2R5CXRlc3RzL2FkdmljZS1hY2N1cmFjeS50ZXN0Lm1qcwl0aGUgY29tbWl0IGdhdGUgaXMgc2lsZW50IGFmdGVyIGEgcGFzc2luZyB0aW1lb3V0LXdyYXBwZWQgY2hlY2sJNjcwYTA4NjFkMDZhNjMzYWJhYjAzNTM2ZmQ3YmFiZTYyMzMyMWM5YzA4MTdkNGQ4ZDEzZGIxMzBmZDA1ZjgzZQ
  ```
  ```
- 2026-09-16 · 2c5bdba* · exit 0 · `set -o pipefail …` · acceptance-sha256:baef770cf201dbac79a6cdf4f4886352c5bb937597309169af48c0dae2837529 · ms:1619
- 2026-09-16 · 2c5bdba* · exit 0 · `set -o pipefail …` · acceptance-sha256:baef770cf201dbac79a6cdf4f4886352c5bb937597309169af48c0dae2837529 · ms:1602
- 2026-09-16 · 2c5bdba* · exit 0 · `set -o pipefail …` · acceptance-sha256:baef770cf201dbac79a6cdf4f4886352c5bb937597309169af48c0dae2837529 · ms:1631
- 2026-09-16 · 2c5bdba* · exit 0 · `set -o pipefail …` · acceptance-sha256:baef770cf201dbac79a6cdf4f4886352c5bb937597309169af48c0dae2837529 · ms:1518
- 2026-09-16 · 2c5bdba* · exit 0 · `set -o pipefail …` · acceptance-sha256:baef770cf201dbac79a6cdf4f4886352c5bb937597309169af48c0dae2837529 · ms:1632
- 2026-09-16 · 2c5bdba* · exit 0 · `set -o pipefail …` · acceptance-sha256:baef770cf201dbac79a6cdf4f4886352c5bb937597309169af48c0dae2837529 · ms:1611
- 2026-09-16 · 2c5bdba* · exit 0 · `set -o pipefail …` · acceptance-sha256:baef770cf201dbac79a6cdf4f4886352c5bb937597309169af48c0dae2837529 · ms:1792
- 2026-09-16 · 2c5bdba* · exit 0 · `set -o pipefail …` · acceptance-sha256:baef770cf201dbac79a6cdf4f4886352c5bb937597309169af48c0dae2837529 · ms:1553
- 2026-09-16 · 2c5bdba* · exit 0 · `set -o pipefail …` · acceptance-sha256:baef770cf201dbac79a6cdf4f4886352c5bb937597309169af48c0dae2837529 · ms:1582
- 2026-09-16 · 2c5bdba* · exit 0 · `set -o pipefail …` · acceptance-sha256:baef770cf201dbac79a6cdf4f4886352c5bb937597309169af48c0dae2837529 · ms:1532
- 2026-09-16 · 2c5bdba* · exit 0 · `set -o pipefail …` · acceptance-sha256:baef770cf201dbac79a6cdf4f4886352c5bb937597309169af48c0dae2837529 · ms:1583
- 2026-09-16 · 2c5bdba* · exit 0 · `set -o pipefail …` · acceptance-sha256:baef770cf201dbac79a6cdf4f4886352c5bb937597309169af48c0dae2837529 · ms:1496
- 2026-09-16 · 2c5bdba* · exit 0 · `set -o pipefail …` · acceptance-sha256:baef770cf201dbac79a6cdf4f4886352c5bb937597309169af48c0dae2837529 · ms:1522
- 2026-09-16 · 2c5bdba* · exit 0 · `set -o pipefail …` · acceptance-sha256:baef770cf201dbac79a6cdf4f4886352c5bb937597309169af48c0dae2837529 · ms:1682
- 2026-09-16 · 2c5bdba* · exit 0 · `set -o pipefail …` · acceptance-sha256:baef770cf201dbac79a6cdf4f4886352c5bb937597309169af48c0dae2837529 · ms:1562
