# Task ADR-120-T16: A failed check keeps the tail of its output

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** S
**Owner:** Zy
**Produces:** `<state dir>/outputs/<run id>.log` and the ledger row's `output` field
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1

## Goal

A `qh-check` run that does not pass keeps the tail of its combined output, bounded, beside its ledger row, so a failure seen
once under load can be read afterwards; a pass keeps nothing.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/check-output.test.mjs` | create | the rows below (0 locks: new) |
| `plugin/scripts/qh-check.mjs` | edit | keep a bounded ring of the run's output lines while it streams |
| `plugin/scripts/check-record.mjs` | edit | `recordRun` (:121-139) writes the tail to `outputs/<id>.log` for a non-pass and names it in the row's `output` field; prunes to the newest 50 |
| `plugin/scripts/ledger-guard.mjs`, `core/hooks/ledger_guard.go` | edit | the refusal text names `outputs/` among the state directory's tool-written files |
| `tests/mutations/plugin/scripts/check-record.mjs.json` | edit | one entry per mechanism |

## Ordered Steps

1. [S1] Write the failing tests and record the red run: a declared check that prints 1,000 lines then exits 1 leaves `outputs/<id>.log` holding the last 400 lines, named by the row's `output`; one that exits 0 leaves no file and no field; a timed-out run keeps its tail; output past 256 KB is cut at a line; the 51st kept file removes the oldest; the row is written even when the output file cannot be.
2. [S2] Implement the ring buffer, the write and the prune.
3. [S3] Add `outputs/` to the ledger guard's text, Node and Go.
4. [S4] Record a killed mutant per mechanism, with catalogue entries. [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/check-output.test.mjs 2>&1) \
  && for n in "a failed check keeps the tail of its output, named by its row" \
      "a passing check keeps no output, and the kept files stay bounded"; do
    test "$(printf '%s\n' "$out" | sed -n 's/^ok [0-9][0-9]* - //p' | grep -cxF -- "$n")" = 1 || exit 1
  done
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a failed check keeps the tail of its output, named by its row` | `tests/check-output.test.mjs` | the tail, the field, a timed-out run, the row without the file | — | S1, S2 |
| `a passing check keeps no output, and the kept files stay bounded` | `tests/check-output.test.mjs` | no file on a pass, the size cut, the prune | — | S1, S2, S3 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the new tests |
| 2 — something selects it | `recordRun` on every non-pass |
| 3 — the caller can discover it | the row's `output` field; qh-check names the file when it fails |
| 4 — it is used | every failed check in an adopter's repository |

## Mutation Log
- 2026-10-21 · aa26c0bd* · mutant killed · exit 1 · `plugin/scripts/check-record.mjs` · a passing run keeps no output file · acceptance-sha256:80edb7abe93aaa5fd0adc83183c645fd3309269372a51e96b04a900b8a278202
- 2026-10-21 · aa26c0bd* · mutant killed · exit 1 · `plugin/scripts/check-record.mjs` · a cut output begins at a whole line, never mid-line · acceptance-sha256:80edb7abe93aaa5fd0adc83183c645fd3309269372a51e96b04a900b8a278202
- 2026-10-21 · aa26c0bd* · mutant killed · exit 1 · `plugin/scripts/check-record.mjs` · the newest 50 files are kept, the 51st removes the oldest · acceptance-sha256:80edb7abe93aaa5fd0adc83183c645fd3309269372a51e96b04a900b8a278202
- 2026-10-21 · aa26c0bd* · mutant killed · exit 1 · `plugin/scripts/check-record.mjs` · a file that cannot be written must not cost the row · acceptance-sha256:80edb7abe93aaa5fd0adc83183c645fd3309269372a51e96b04a900b8a278202
- 2026-10-21 · aa26c0bd* · mutant killed · exit 1 · `plugin/scripts/check-record.mjs` · the row names the file that was kept · acceptance-sha256:80edb7abe93aaa5fd0adc83183c645fd3309269372a51e96b04a900b8a278202
- 2026-10-21 · aa26c0bd* · mutant killed · exit 1 · `plugin/scripts/qh-check.mjs` · output past 256 KB is cut · acceptance-sha256:80edb7abe93aaa5fd0adc83183c645fd3309269372a51e96b04a900b8a278202
- 2026-10-21 · aa26c0bd* · mutant killed · exit 1 · `core/hooks/ledger_guard.go` · the Go refusal names outputs/ · acceptance-sha256:80edb7abe93aaa5fd0adc83183c645fd3309269372a51e96b04a900b8a278202
- 2026-10-21 · aa26c0bd* · mutant killed · exit 1 · `plugin/scripts/check-record.mjs` · a passing run keeps no output file · acceptance-sha256:80edb7abe93aaa5fd0adc83183c645fd3309269372a51e96b04a900b8a278202
- 2026-10-21 · aa26c0bd* · mutant killed · exit 1 · `plugin/scripts/check-record.mjs` · the file holds only the last 400 lines · acceptance-sha256:80edb7abe93aaa5fd0adc83183c645fd3309269372a51e96b04a900b8a278202
- 2026-10-21 · aa26c0bd* · mutant killed · exit 1 · `plugin/scripts/check-record.mjs` · a cut output begins at a whole line, never mid-line · acceptance-sha256:80edb7abe93aaa5fd0adc83183c645fd3309269372a51e96b04a900b8a278202
- 2026-10-21 · aa26c0bd* · mutant killed · exit 1 · `plugin/scripts/check-record.mjs` · the newest 50 files are kept, the 51st removes the oldest · acceptance-sha256:80edb7abe93aaa5fd0adc83183c645fd3309269372a51e96b04a900b8a278202
- 2026-10-21 · aa26c0bd* · mutant killed · exit 1 · `plugin/scripts/check-record.mjs` · a file that cannot be written must not cost the row · acceptance-sha256:80edb7abe93aaa5fd0adc83183c645fd3309269372a51e96b04a900b8a278202
- 2026-10-21 · aa26c0bd* · mutant killed · exit 1 · `plugin/scripts/check-record.mjs` · the row names the file that was kept · acceptance-sha256:80edb7abe93aaa5fd0adc83183c645fd3309269372a51e96b04a900b8a278202
- 2026-10-21 · aa26c0bd* · mutant killed · exit 1 · `plugin/scripts/qh-check.mjs` · output past 256 KB is cut · acceptance-sha256:80edb7abe93aaa5fd0adc83183c645fd3309269372a51e96b04a900b8a278202
- 2026-10-21 · aa26c0bd* · mutant killed · exit 1 · `plugin/scripts/ledger-guard.mjs` · the Node refusal names outputs/ · acceptance-sha256:80edb7abe93aaa5fd0adc83183c645fd3309269372a51e96b04a900b8a278202
- 2026-10-21 · aa26c0bd* · mutant killed · exit 1 · `core/hooks/ledger_guard.go` · the Go refusal names outputs/ · acceptance-sha256:80edb7abe93aaa5fd0adc83183c645fd3309269372a51e96b04a900b8a278202

## Invariants

- A passing run's record is byte-for-byte what it is today.
- Nothing under the state directory is tracked or leaves the machine.

## Risks

- A check that prints a secret keeps it on disk in the state directory: it is the same output the terminal showed, kept locally under the repository's git directory, never tracked; what the test doubles do not model: a check that writes to the terminal directly rather than to its stdout or stderr.

## Stop Condition

Stop if `qh-check` cannot read the check's output without changing what the terminal shows.

## Out of Scope

- Keeping a passing run's output (permanent: boundary: a pass needs no diagnosis, and keeping every run's output is a disk cost with no reader)

## Verification Log
- 2026-10-21 · aa26c0bd · exit 1 · `out=$(node --test --test-reporter=tap tests/check-output.test.mjs 2>&1) \ …` · acceptance-sha256:80edb7abe93aaa5fd0adc83183c645fd3309269372a51e96b04a900b8a278202 · ms:168 · test-lock-sha256:98d012280988dae50124fe603ae3db3d504833ca1121046439087dd572d9de5a · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CnVucHJvdmVuCXRlc3RzL2NoZWNrLW91dHB1dC50ZXN0Lm1qcwlhIGZhaWxlZCBjaGVjayBrZWVwcyB0aGUgdGFpbCBvZiBpdHMgb3V0cHV0LCBuYW1lZCBieSBpdHMgcm93CnVucHJvdmVuCXRlc3RzL2NoZWNrLW91dHB1dC50ZXN0Lm1qcwlhIHBhc3NpbmcgY2hlY2sga2VlcHMgbm8gb3V0cHV0LCBhbmQgdGhlIGtlcHQgZmlsZXMgc3RheSBib3VuZGVk
  ```
  ```
- 2026-10-21 · aa26c0bd* · exit 1 · `out=$(node --test --test-reporter=tap tests/check-output.test.mjs 2>&1) \ …` · acceptance-sha256:80edb7abe93aaa5fd0adc83183c645fd3309269372a51e96b04a900b8a278202 · ms:1170
  ```
  ```
- 2026-10-21 · aa26c0bd* · exit 0 · `out=$(node --test --test-reporter=tap tests/check-output.test.mjs 2>&1) \ …` · acceptance-sha256:80edb7abe93aaa5fd0adc83183c645fd3309269372a51e96b04a900b8a278202 · ms:3482
- 2026-10-21 · aa26c0bd* · exit 1 · `out=$(node --test --test-reporter=tap tests/check-output.test.mjs 2>&1) \ …` · acceptance-sha256:80edb7abe93aaa5fd0adc83183c645fd3309269372a51e96b04a900b8a278202 · ms:2765
  ```
  ```
- 2026-10-21 · aa26c0bd* · exit 0 · `out=$(node --test --test-reporter=tap tests/check-output.test.mjs 2>&1) \ …` · acceptance-sha256:80edb7abe93aaa5fd0adc83183c645fd3309269372a51e96b04a900b8a278202 · ms:3520
- 2026-10-21 · aa26c0bd* · exit 0 · `out=$(node --test --test-reporter=tap tests/check-output.test.mjs 2>&1) \ …` · acceptance-sha256:80edb7abe93aaa5fd0adc83183c645fd3309269372a51e96b04a900b8a278202 · ms:3598
- 2026-10-21 · aa26c0bd* · exit 1 · `out=$(node --test --test-reporter=tap tests/check-output.test.mjs 2>&1) \ …` · acceptance-sha256:80edb7abe93aaa5fd0adc83183c645fd3309269372a51e96b04a900b8a278202 · ms:6685
  ```
  ```
- 2026-10-21 · aa26c0bd* · exit 0 · `out=$(node --test --test-reporter=tap tests/check-output.test.mjs 2>&1) \ …` · acceptance-sha256:80edb7abe93aaa5fd0adc83183c645fd3309269372a51e96b04a900b8a278202 · ms:6671
- 2026-10-21 · aa26c0bd* · exit 0 · `out=$(node --test --test-reporter=tap tests/check-output.test.mjs 2>&1) \ …` · acceptance-sha256:80edb7abe93aaa5fd0adc83183c645fd3309269372a51e96b04a900b8a278202 · ms:6897
- 2026-10-21 · aa26c0bd* · exit 0 · `out=$(node --test --test-reporter=tap tests/check-output.test.mjs 2>&1) \ …` · acceptance-sha256:80edb7abe93aaa5fd0adc83183c645fd3309269372a51e96b04a900b8a278202 · ms:6625
- 2026-10-21 · aa26c0bd* · exit 1 · `out=$(node --test --test-reporter=tap tests/check-output.test.mjs 2>&1) \ …` · acceptance-sha256:80edb7abe93aaa5fd0adc83183c645fd3309269372a51e96b04a900b8a278202 · ms:6615
  ```
  ```
- 2026-10-21 · aa26c0bd* · exit 0 · `out=$(node --test --test-reporter=tap tests/check-output.test.mjs 2>&1) \ …` · acceptance-sha256:80edb7abe93aaa5fd0adc83183c645fd3309269372a51e96b04a900b8a278202 · ms:6735
- 2026-10-21 · aa26c0bd* · exit 0 · `out=$(node --test --test-reporter=tap tests/check-output.test.mjs 2>&1) \ …` · acceptance-sha256:80edb7abe93aaa5fd0adc83183c645fd3309269372a51e96b04a900b8a278202 · ms:7395
- 2026-10-21 · aa26c0bd* · exit 0 · `out=$(node --test --test-reporter=tap tests/check-output.test.mjs 2>&1) \ …` · acceptance-sha256:80edb7abe93aaa5fd0adc83183c645fd3309269372a51e96b04a900b8a278202 · ms:7115
- 2026-10-21 · aa26c0bd* · exit 0 · `out=$(node --test --test-reporter=tap tests/check-output.test.mjs 2>&1) \ …` · acceptance-sha256:80edb7abe93aaa5fd0adc83183c645fd3309269372a51e96b04a900b8a278202 · ms:6715
- 2026-10-21 · aa26c0bd* · exit 0 · `out=$(node --test --test-reporter=tap tests/check-output.test.mjs 2>&1) \ …` · acceptance-sha256:80edb7abe93aaa5fd0adc83183c645fd3309269372a51e96b04a900b8a278202 · ms:7051
- 2026-10-21 · aa26c0bd* · exit 0 · `out=$(node --test --test-reporter=tap tests/check-output.test.mjs 2>&1) \ …` · acceptance-sha256:80edb7abe93aaa5fd0adc83183c645fd3309269372a51e96b04a900b8a278202 · ms:7360
- 2026-10-21 · aa26c0bd* · exit 0 · `out=$(node --test --test-reporter=tap tests/check-output.test.mjs 2>&1) \ …` · acceptance-sha256:80edb7abe93aaa5fd0adc83183c645fd3309269372a51e96b04a900b8a278202 · ms:8642
- 2026-10-21 · aa26c0bd* · exit 0 · `out=$(node --test --test-reporter=tap tests/check-output.test.mjs 2>&1) \ …` · acceptance-sha256:80edb7abe93aaa5fd0adc83183c645fd3309269372a51e96b04a900b8a278202 · ms:11731
- 2026-10-21 · aa26c0bd* · exit 0 · `out=$(node --test --test-reporter=tap tests/check-output.test.mjs 2>&1) \ …` · acceptance-sha256:80edb7abe93aaa5fd0adc83183c645fd3309269372a51e96b04a900b8a278202 · ms:10903
- 2026-10-21 · aa26c0bd* · exit 0 · `out=$(node --test --test-reporter=tap tests/check-output.test.mjs 2>&1) \ …` · acceptance-sha256:80edb7abe93aaa5fd0adc83183c645fd3309269372a51e96b04a900b8a278202 · ms:8651
- 2026-10-21 · aa26c0bd* · exit 0 · `out=$(node --test --test-reporter=tap tests/check-output.test.mjs 2>&1) \ …` · acceptance-sha256:80edb7abe93aaa5fd0adc83183c645fd3309269372a51e96b04a900b8a278202 · ms:7156
- 2026-10-21 · 7a9107e8* · exit 0 · `adr-verify --relock --replace-hashes` · acceptance-sha256:80edb7abe93aaa5fd0adc83183c645fd3309269372a51e96b04a900b8a278202 · ms:0 · test-lock-sha256:6dadb292f7149934985b6501226f01fc181f1f77d545b7fbfb5c87b8d3778af3 · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvY2hlY2stb3V0cHV0LnRlc3QubWpzCWEgZmFpbGVkIGNoZWNrIGtlZXBzIHRoZSB0YWlsIG9mIGl0cyBvdXRwdXQsIG5hbWVkIGJ5IGl0cyByb3cJNTkyMDM1MWUxYzIyOTkyY2M2OTRjZjZmMWIxYTJiNWI1MmNiNTc2MzIyZWZjNGUzN2ViODFlM2E1ZDYzY2I4NApib2R5CXRlc3RzL2NoZWNrLW91dHB1dC50ZXN0Lm1qcwlhIHBhc3NpbmcgY2hlY2sga2VlcHMgbm8gb3V0cHV0LCBhbmQgdGhlIGtlcHQgZmlsZXMgc3RheSBib3VuZGVkCTIxOGJhNTA3N2IyZmEyNGEyMzZkMGVhOGY1NjA0M2I2NWIyMDQ4N2E3ZWI0M2JhNGEyYjViNmJhY2U2MTRmOTA · test-lock-kind:replace
