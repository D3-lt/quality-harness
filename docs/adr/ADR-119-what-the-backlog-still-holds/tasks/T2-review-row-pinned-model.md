# Task ADR-119-T2: A review row says the model the launcher pinned

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** S
**Owner:** Zy
**Produces:** `reviews.jsonl` rows with the pinned `model`, `bound` and `reportedModel`
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1

## Goal

A review row records the model the launcher pinned with `-m`, keeps a printed model that differs as `reportedModel`, and
writes `bound` as `pinned`, `disagrees` or `unproven`.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/host-review.test.mjs` | edit | new rows for a printed model that differs from the pin, and for a host with no pin; :15 and :52 assert `reported` today and move to the new vocabulary (0 locks) |
| `tests/review-ledger.test.mjs` | edit | one new test beside the 11 ADR-100 T1 locks, whose bodies stay byte-identical |
| `plugin/scripts/host-review.mjs` | edit | `reviewFromOutput` (:58-64) keeps the pinned model; the rows at :242 and :256 write `bound` and `reportedModel` |
| `tests/mutations/plugin/scripts/host-review.mjs.json` | edit | one catalogue entry per mechanism |

## Ordered Steps

1. [S1] Write the failing tests and record the red run: a Codex run pinned to `CODEX_MODEL` whose output prints another model records `model: CODEX_MODEL`, `reportedModel` the printed one and `bound: disagrees`; one printing the pinned model records `bound: pinned` and no `reportedModel`; Cursor with no `--model` records what it printed (`tests/host-review.test.mjs:53`) as `unproven`.
2. [S2] In `reviewFromOutput`, take `model` from the pin when one was passed, set `reportedModel` when the printed model differs, and set `bound` to `pinned`, `disagrees` or `unproven` (no pin). `unavailable()` (:33) stays `unproven`.
3. [S3] Write `bound` and `reportedModel` into the rows at :242 and :256; :384's prompt-file row already records `CODEX_MODEL` and gains `bound: pinned`.
4. [S4] Record a killed mutant for the pin winning over the printed model and for the `disagrees` branch, with a catalogue entry each. [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/host-review.test.mjs tests/review-ledger.test.mjs 2>&1) \
  && for n in "a review row records the model the launcher pinned, and a printed model that differs as disagrees" \
      "a host with no pinned model records what it printed, as unproven" \
      "a review row from the launcher carries its bound and the model the reviewer printed"; do
    test "$(printf '%s\n' "$out" | sed -n 's/^ok [0-9][0-9]* - //p' | grep -cxF -- "$n")" = 1 || exit 1
  done
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a review row records the model the launcher pinned, and a printed model that differs as disagrees` | `tests/host-review.test.mjs` | pin wins; `reportedModel` set only on a difference; `pinned` when they agree | — | S1, S2 |
| `a host with no pinned model records what it printed, as unproven` | `tests/host-review.test.mjs` | Cursor with no `--model` keeps the printed model, `bound: unproven` | — | S1, S2 |
| `a review row from the launcher carries its bound and the model the reviewer printed` | `tests/review-ledger.test.mjs` | the `reviews.jsonl` row holds `model`, `bound` and `reportedModel`; the locked tests beside it are unchanged | — | S3 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the new tests |
| 2 — something selects it | `hostReview()` and the `--prompt-file` path both call `recordReview`; the mutants on the pin |
| 3 — the caller can discover it | ADR-062's schema, as amended here |
| 4 — it is used | nothing reads `model` or `bound` yet (`release-evidence.mjs:450-457`) |

## Mutation Log
- 2026-10-20 · c48dd5b0* · mutant killed · exit 1 · `plugin/scripts/host-review.mjs` · the printed model wins over the pin again, so a run pinned to CODEX_MODEL is recorded under the name it printed · acceptance-sha256:68eca1e9027cb94855bc51d1434b5f151b1346e58686e008bf2b1e256e860d8f
- 2026-10-20 · c48dd5b0* · mutant killed · exit 1 · `plugin/scripts/host-review.mjs` · a printed model that differs from the pin reads as pinned, so a disagreement is recorded as agreement · acceptance-sha256:68eca1e9027cb94855bc51d1434b5f151b1346e58686e008bf2b1e256e860d8f
- 2026-10-20 · c48dd5b0* · mutant killed · exit 1 · `plugin/scripts/host-review.mjs` · a host with no pin that printed a model reads as pinned, claiming a bind nothing made · acceptance-sha256:68eca1e9027cb94855bc51d1434b5f151b1346e58686e008bf2b1e256e860d8f
- 2026-10-20 · c48dd5b0* · mutant killed · exit 1 · `plugin/scripts/host-review.mjs` · the Codex row drops bound and reportedModel, so reviews.jsonl no longer says whether the reviewer agreed with the pin · acceptance-sha256:68eca1e9027cb94855bc51d1434b5f151b1346e58686e008bf2b1e256e860d8f
- 2026-10-20 · c48dd5b0* · mutant killed · exit 1 · `plugin/scripts/host-review.mjs` · the Cursor and Claude row drops bound and reportedModel · acceptance-sha256:68eca1e9027cb94855bc51d1434b5f151b1346e58686e008bf2b1e256e860d8f
- 2026-10-20 · c48dd5b0* · mutant killed · exit 1 · `plugin/scripts/host-review.mjs` · a prompt-file run that did not finish is recorded as pinned rather than unproven · acceptance-sha256:68eca1e9027cb94855bc51d1434b5f151b1346e58686e008bf2b1e256e860d8f

## Invariants

- `release-evidence` reads only status, head, base and exact from a row; nothing it decides changes.
- An unavailable review stays `unproven`.

## Risks

- A reader outside this repository may compare `bound` with `reported`. None is known; ADR-062 is amended by Invalidates, and the release notes name the change.

## Stop Condition

Stop if a host's output can name a model the launcher did not pass and still be the run's real model (a server-side
fallback): `pinned` would then claim more than was observed, and the vocabulary needs the owner.

## Out of Scope

- A gate on `model` or `bound` (permanent: boundary: no record sanctions a refusal on it, CLAUDE.md §3)

## Verification Log
- 2026-10-20 · c48dd5b0* · exit 1 · `out=$(node --test --test-reporter=tap tests/host-review.test.mjs tests/review-ledger.test.mjs 2>&1) \ …` · acceptance-sha256:68eca1e9027cb94855bc51d1434b5f151b1346e58686e008bf2b1e256e860d8f · ms:7305 · test-lock-sha256:c351e9a1c7fef074eafb0361233b8949bf625f8010781d294e165ecece50f5cc · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvaG9zdC1yZXZpZXcudGVzdC5tanMJYSBob3N0IHJlc3VsdCBtaXNzaW5nIHRoZSBzY2hlbWEgaXMgdW5hdmFpbGFibGUsIGFuZCB0aGUgaG9zdCBpcyB0b2xkIHRoZSB0YXJnZXQJZTRkOWM3ZjBiZjhjYmQwMmY0NzI4ZmY0M2M2YjgyMDg3NDFmNzk4YTdmM2Y4OGQ3YjZjMDI1MWRhYTE2YzVjZQpib2R5CXRlc3RzL2hvc3QtcmV2aWV3LnRlc3QubWpzCWEgaG9zdCByZXZpZXcgaXMgdGhlIHNjaGVtYSBvciB1bmF2YWlsYWJsZQkyNDU0OTQxOTVlM2I2ZmIxYmE5ODEwNmJlMGRlMzAyZWUxZWZiM2Q5ZGM4ZTNkMGMyZGNlOWM0NmViZTM3ZjAxCmJvZHkJdGVzdHMvaG9zdC1yZXZpZXcudGVzdC5tanMJYSBob3N0IHdpdGggbm8gcGlubmVkIG1vZGVsIHJlY29yZHMgd2hhdCBpdCBwcmludGVkLCBhcyB1bnByb3ZlbglkMjIzM2RmODQzOGJkYjhkNTkyMTRjMDgxZWZlMzY4YjAyYzhlMWExNWEzOGZjNmIyOTczM2EzMDgxZjA0YjZhCmJvZHkJdGVzdHMvaG9zdC1yZXZpZXcudGVzdC5tanMJYSByZXZpZXcgcm93IHJlY29yZHMgdGhlIG1vZGVsIHRoZSBsYXVuY2hlciBwaW5uZWQsIGFuZCBhIHByaW50ZWQgbW9kZWwgdGhhdCBkaWZmZXJzIGFzIGRpc2FncmVlcwk2Y2Y2YjJlMDY1NGQwMjg5OGRlMjY2ZDkyNmM4YzNiZjA5MWU2YjNjYmNjNDcyZDNkYWZjODZjM2UwYzdhOWY2CmJvZHkJdGVzdHMvaG9zdC1yZXZpZXcudGVzdC5tanMJZXZlcnkgZG9jdW1lbnRlZCBob3N0LXJldmlldyBjb21tYW5kIG5hbWVzIHRoZSByZXBvc2l0b3J5IGFuZCB0aGUgc2NvcGUJMjdlMTkzZjM5ODlmYzE1OGVlYjBiZGY4ZTg4MGU3ZDg5NTIzNmQ5YTYwN2E5ZTRlZjA3ZWEzNWFmZDYzYzczYwpib2R5CXRlc3RzL3Jldmlldy1sZWRnZXIudGVzdC5tanMJYSBDdXJzb3Igb3IgQ2xhdWRlIHJldmlldyByZWNvcmRzIHRoZSBIRUFEIGl0IHdhcyBzaG93biwgbm90IHRoZSBvbmUgYWZ0ZXIgaXQJNjMyY2NjMDA2ZDZiMDUzY2Y3NDQ1OWI3ZTkzOWJjNDc2NzUyNTg2ZGJiYTFhYzM5YzZkMmU1ODAxZjNkNTdiNQpib2R5CXRlc3RzL3Jldmlldy1sZWRnZXIudGVzdC5tanMJYSBDdXJzb3IgcmV2aWV3IHRoZSBsYXVuY2hlciBydW5zIGxlYXZlcyBvbmUgcmV2aWV3IHJvdyB0b28JMTU1YTVmNTc1ZmE1MThhMjkwZjMxZmQ1MmZkNjFhMWYxOTdhZTg5NTkzN2U5MzE2MWY2ZDlkMGY3MDE3ZWNjNQpib2R5CXRlc3RzL3Jldmlldy1sZWRnZXIudGVzdC5tanMJYSBDdXJzb3IgcmV2aWV3IHRydXN0cyB0aGUgd29ya3NwYWNlIGl0IGlzIGFza2VkIGFib3V0LCBhbmQgYSBmYWlsZWQgb25lIHNheXMgd2h5CWQ3NzMzNTc3OWUyMzlmZDUwYTA3NmZlZDdkYzczYWY5NTM0YzI0NzExNTNhZWY2MTFhMTc5MjJkNmU1NTM1YWQKYm9keQl0ZXN0cy9yZXZpZXctbGVkZ2VyLnRlc3QubWpzCWEgaGVhZGxlc3MgQ2xhdWRlIHJldmlldyBpcyByZWFkLW9ubHksIHVud3JhcHMgaXRzIHJlc3VsdCwgYW5kIGxlYXZlcyBvbmUgcmV2aWV3IHJvdwkyNGQ2MmMwODVmODk3MTJhMmEwZDM1MzRmNzkzYWU1NDQwYTNlOTI0NTc2OTJiYWJjOTQyMmU3Y2I3YmVlNjcxCmJvZHkJdGVzdHMvcmV2aWV3LWxlZGdlci50ZXN0Lm1qcwlhIHJldmlldyByYW5nZSBmcm9tIGEgZG90dGVkIHJlbGVhc2UgdGFnIGlzIHJlYWQsIGFuZCBhIHRocmVlLWRvdCByYW5nZSBpcyBub3QJM2I3MzU0MmFmNzM3NzEwYTI1MTM3ZDE0NTNlZjRmNzg2MTQ0MzJmOGQ3NGY1YmQxYmZmZTI2NDA5OTI3ZmE5Ygpib2R5CXRlc3RzL3Jldmlldy1sZWRnZXIudGVzdC5tanMJYSByZXZpZXcgcm93IGZyb20gdGhlIGxhdW5jaGVyIGNhcnJpZXMgaXRzIGJvdW5kIGFuZCB0aGUgbW9kZWwgdGhlIHJldmlld2VyIHByaW50ZWQJMmI4YWNkNWRjNGM5ZGU1Njk4ZjA2ZmY5OGJkZTE5NTQ5YjI3ZGNhYTczYzViMzM1M2FhZGU4ZTFhMmQ2ZmM3Ywpib2R5CXRlc3RzL3Jldmlldy1sZWRnZXIudGVzdC5tanMJYSByZXZpZXcgcm93IHdob3NlIGJhc2UgZG9lcyBub3QgcmVzb2x2ZSBjb3ZlcnMgbm90aGluZwkxYWM2YTk4MjM5NzE1YTE3MWYwYWYwYjNlOGZmNTYyYjlkYzYzZDI2MTczYWFmNTQwNTJlMDEwYTI1ZDI1NDVkCmJvZHkJdGVzdHMvcmV2aWV3LWxlZGdlci50ZXN0Lm1qcwlhIHZlcnNpb24gYnVtcCBhbG9uZSBuZWVkcyBubyByZXZpZXcsIGFuZCBhbiB1bmF2YWlsYWJsZSBvciB1bnBhcnNlZCByZXZpZXcgY292ZXJzIG5vdGhpbmcJMDY1MDQyNmU3NTU2MWJiZmM3ZDkzNjU4MDllMzI4NzljNzBiZGZjZGI0NTFhMzFmMmFkMzJjYmM5NjYwMzFjMwpib2R5CXRlc3RzL3Jldmlldy1sZWRnZXIudGVzdC5tanMJZXZlcnkgQ29kZXggcnVuIHRoZSBsYXVuY2hlciBzdGFydHMgbGVhdmVzIG9uZSByZXZpZXcgcm93IG5hbWluZyBpdHMgcmFuZ2UgYW5kIHN0YXR1cwkyYWU1YjdiMThiNWMwYjViYzM1Yzk4ZGQ3OTI1MTg4ODhjNmVhNjkxNzZlYmE1YzRjYmZjODNjYzNkZmMzY2NhCmJvZHkJdGVzdHMvcmV2aWV3LWxlZGdlci50ZXN0Lm1qcwlyZWxlYXNlLWV2aWRlbmNlIGFza3MgdGhlIHJldmlldyBxdWVzdGlvbiBmcm9tIGl0cyBtYWluIHBhdGgJM2UwNGFlNjFkNjQ1MjljY2E2NWYwZTYwZWM3YzIxOWIxZDBiMTk1Zjk5YWQ2NDBjZjRiNmEwMmYzZWIyOWYxMgpib2R5CXRlc3RzL3Jldmlldy1sZWRnZXIudGVzdC5tanMJcmVsZWFzZS1ldmlkZW5jZSByZWZ1c2VzIGEgcGx1Z2luIGNvbW1pdCBzaW5jZSB0aGUgbGFzdCB0YWcgdGhhdCBubyByZXZpZXcgY292ZXJzLCBhbmQgYSBjb3ZlcmluZyByZXZpZXcgY2xlYXJzIGl0CTk0NTBhMTdjZjhhMTVhMzEyNTdhMDQwMzE1OGY4YjJmZWU1MGRjNWE5ZTY1YzQ3YWVjNWEwOGEzMGI4NmE0MWIKYm9keQl0ZXN0cy9yZXZpZXctbGVkZ2VyLnRlc3QubWpzCXRoZSBwcm9tcHQtZmlsZSBmb3JtIHRha2VzIGl0cyBzdGF0dXMgZnJvbSB0aGUgbGFzdCBWRVJESUNUIGxpbmUsIGFuZCBub25lIGlzIHVucGFyc2VkCWQ3MjcyMGEwZjg0NGZiNWQ3M2NhZGVlNGJkNDZkNDllNWMyZDkxMWM2MDA2ZjJmYmY5NzljNWUwN2M4NDZhNDk
  ```
  ```
- 2026-10-20 · c48dd5b0* · exit 0 · `out=$(node --test --test-reporter=tap tests/host-review.test.mjs tests/review-ledger.test.mjs 2>&1) \ …` · acceptance-sha256:68eca1e9027cb94855bc51d1434b5f151b1346e58686e008bf2b1e256e860d8f · ms:7423
- 2026-10-20 · c48dd5b0* · exit 0 · `out=$(node --test --test-reporter=tap tests/host-review.test.mjs tests/review-ledger.test.mjs 2>&1) \ …` · acceptance-sha256:68eca1e9027cb94855bc51d1434b5f151b1346e58686e008bf2b1e256e860d8f · ms:11416
- 2026-10-20 · c48dd5b0* · exit 0 · `out=$(node --test --test-reporter=tap tests/host-review.test.mjs tests/review-ledger.test.mjs 2>&1) \ …` · acceptance-sha256:68eca1e9027cb94855bc51d1434b5f151b1346e58686e008bf2b1e256e860d8f · ms:8976
- 2026-10-20 · c48dd5b0* · exit 0 · `out=$(node --test --test-reporter=tap tests/host-review.test.mjs tests/review-ledger.test.mjs 2>&1) \ …` · acceptance-sha256:68eca1e9027cb94855bc51d1434b5f151b1346e58686e008bf2b1e256e860d8f · ms:5137
- 2026-10-20 · c48dd5b0* · exit 0 · `out=$(node --test --test-reporter=tap tests/host-review.test.mjs tests/review-ledger.test.mjs 2>&1) \ …` · acceptance-sha256:68eca1e9027cb94855bc51d1434b5f151b1346e58686e008bf2b1e256e860d8f · ms:6016
- 2026-10-20 · c48dd5b0* · exit 0 · `out=$(node --test --test-reporter=tap tests/host-review.test.mjs tests/review-ledger.test.mjs 2>&1) \ …` · acceptance-sha256:68eca1e9027cb94855bc51d1434b5f151b1346e58686e008bf2b1e256e860d8f · ms:5281
- 2026-10-22 · 2f8507cf* · exit 0 · `adr-verify --relock --replace-hashes` · acceptance-sha256:68eca1e9027cb94855bc51d1434b5f151b1346e58686e008bf2b1e256e860d8f · ms:0 · test-lock-sha256:48e9e57cc33bf98757334fb49341310f6da01888c7cc60ea7456304df3a8ac4b · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvaG9zdC1yZXZpZXcudGVzdC5tanMJYSBob3N0IHJlc3VsdCBtaXNzaW5nIHRoZSBzY2hlbWEgaXMgdW5hdmFpbGFibGUsIGFuZCB0aGUgaG9zdCBpcyB0b2xkIHRoZSB0YXJnZXQJZTRkOWM3ZjBiZjhjYmQwMmY0NzI4ZmY0M2M2YjgyMDg3NDFmNzk4YTdmM2Y4OGQ3YjZjMDI1MWRhYTE2YzVjZQpib2R5CXRlc3RzL2hvc3QtcmV2aWV3LnRlc3QubWpzCWEgaG9zdCByZXZpZXcgaXMgdGhlIHNjaGVtYSBvciB1bmF2YWlsYWJsZQkyNDU0OTQxOTVlM2I2ZmIxYmE5ODEwNmJlMGRlMzAyZWUxZWZiM2Q5ZGM4ZTNkMGMyZGNlOWM0NmViZTM3ZjAxCmJvZHkJdGVzdHMvaG9zdC1yZXZpZXcudGVzdC5tanMJYSBob3N0IHdpdGggbm8gcGlubmVkIG1vZGVsIHJlY29yZHMgd2hhdCBpdCBwcmludGVkLCBhcyB1bnByb3ZlbglkMjIzM2RmODQzOGJkYjhkNTkyMTRjMDgxZWZlMzY4YjAyYzhlMWExNWEzOGZjNmIyOTczM2EzMDgxZjA0YjZhCmJvZHkJdGVzdHMvaG9zdC1yZXZpZXcudGVzdC5tanMJYSByZXZpZXcgcm93IHJlY29yZHMgdGhlIG1vZGVsIHRoZSBsYXVuY2hlciBwaW5uZWQsIGFuZCBhIHByaW50ZWQgbW9kZWwgdGhhdCBkaWZmZXJzIGFzIGRpc2FncmVlcwk2Y2Y2YjJlMDY1NGQwMjg5OGRlMjY2ZDkyNmM4YzNiZjA5MWU2YjNjYmNjNDcyZDNkYWZjODZjM2UwYzdhOWY2CmJvZHkJdGVzdHMvaG9zdC1yZXZpZXcudGVzdC5tanMJZXZlcnkgZG9jdW1lbnRlZCBob3N0LXJldmlldyBjb21tYW5kIG5hbWVzIHRoZSByZXBvc2l0b3J5IGFuZCB0aGUgc2NvcGUJMjdlMTkzZjM5ODlmYzE1OGVlYjBiZGY4ZTg4MGU3ZDg5NTIzNmQ5YTYwN2E5ZTRlZjA3ZWEzNWFmZDYzYzczYwpib2R5CXRlc3RzL3Jldmlldy1sZWRnZXIudGVzdC5tanMJYSBDdXJzb3Igb3IgQ2xhdWRlIHJldmlldyByZWNvcmRzIHRoZSBIRUFEIGl0IHdhcyBzaG93biwgbm90IHRoZSBvbmUgYWZ0ZXIgaXQJNjMyY2NjMDA2ZDZiMDUzY2Y3NDQ1OWI3ZTkzOWJjNDc2NzUyNTg2ZGJiYTFhYzM5YzZkMmU1ODAxZjNkNTdiNQpib2R5CXRlc3RzL3Jldmlldy1sZWRnZXIudGVzdC5tanMJYSBDdXJzb3IgcmV2aWV3IHRoZSBsYXVuY2hlciBydW5zIGxlYXZlcyBvbmUgcmV2aWV3IHJvdyB0b28JMTU1YTVmNTc1ZmE1MThhMjkwZjMxZmQ1MmZkNjFhMWYxOTdhZTg5NTkzN2U5MzE2MWY2ZDlkMGY3MDE3ZWNjNQpib2R5CXRlc3RzL3Jldmlldy1sZWRnZXIudGVzdC5tanMJYSBDdXJzb3IgcmV2aWV3IHRydXN0cyB0aGUgd29ya3NwYWNlIGl0IGlzIGFza2VkIGFib3V0LCBhbmQgYSBmYWlsZWQgb25lIHNheXMgd2h5CWQ3NzMzNTc3OWUyMzlmZDUwYTA3NmZlZDdkYzczYWY5NTM0YzI0NzExNTNhZWY2MTFhMTc5MjJkNmU1NTM1YWQKYm9keQl0ZXN0cy9yZXZpZXctbGVkZ2VyLnRlc3QubWpzCWEgaGVhZGxlc3MgQ2xhdWRlIHJldmlldyBpcyByZWFkLW9ubHksIHVud3JhcHMgaXRzIHJlc3VsdCwgYW5kIGxlYXZlcyBvbmUgcmV2aWV3IHJvdwkyNGQ2MmMwODVmODk3MTJhMmEwZDM1MzRmNzkzYWU1NDQwYTNlOTI0NTc2OTJiYWJjOTQyMmU3Y2I3YmVlNjcxCmJvZHkJdGVzdHMvcmV2aWV3LWxlZGdlci50ZXN0Lm1qcwlhIHJldmlldyByYW5nZSBmcm9tIGEgZG90dGVkIHJlbGVhc2UgdGFnIGlzIHJlYWQsIGFuZCBhIHRocmVlLWRvdCByYW5nZSBpcyBub3QJM2I3MzU0MmFmNzM3NzEwYTI1MTM3ZDE0NTNlZjRmNzg2MTQ0MzJmOGQ3NGY1YmQxYmZmZTI2NDA5OTI3ZmE5Ygpib2R5CXRlc3RzL3Jldmlldy1sZWRnZXIudGVzdC5tanMJYSByZXZpZXcgcm93IGZyb20gdGhlIGxhdW5jaGVyIGNhcnJpZXMgaXRzIGJvdW5kIGFuZCB0aGUgbW9kZWwgdGhlIHJldmlld2VyIHByaW50ZWQJMmI4YWNkNWRjNGM5ZGU1Njk4ZjA2ZmY5OGJkZTE5NTQ5YjI3ZGNhYTczYzViMzM1M2FhZGU4ZTFhMmQ2ZmM3Ywpib2R5CXRlc3RzL3Jldmlldy1sZWRnZXIudGVzdC5tanMJYSByZXZpZXcgcm93IHdob3NlIGJhc2UgZG9lcyBub3QgcmVzb2x2ZSBjb3ZlcnMgbm90aGluZwkxYWM2YTk4MjM5NzE1YTE3MWYwYWYwYjNlOGZmNTYyYjlkYzYzZDI2MTczYWFmNTQwNTJlMDEwYTI1ZDI1NDVkCmJvZHkJdGVzdHMvcmV2aWV3LWxlZGdlci50ZXN0Lm1qcwlhIHZlcnNpb24gYnVtcCBhbG9uZSBuZWVkcyBubyByZXZpZXcsIGFuZCBhbiB1bmF2YWlsYWJsZSBvciB1bnBhcnNlZCByZXZpZXcgY292ZXJzIG5vdGhpbmcJMDY1MDQyNmU3NTU2MWJiZmM3ZDkzNjU4MDllMzI4NzljNzBiZGZjZGI0NTFhMzFmMmFkMzJjYmM5NjYwMzFjMwpib2R5CXRlc3RzL3Jldmlldy1sZWRnZXIudGVzdC5tanMJZXZlcnkgQ29kZXggcnVuIHRoZSBsYXVuY2hlciBzdGFydHMgbGVhdmVzIG9uZSByZXZpZXcgcm93IG5hbWluZyBpdHMgcmFuZ2UgYW5kIHN0YXR1cwkyYWU1YjdiMThiNWMwYjViYzM1Yzk4ZGQ3OTI1MTg4ODhjNmVhNjkxNzZlYmE1YzRjYmZjODNjYzNkZmMzY2NhCmJvZHkJdGVzdHMvcmV2aWV3LWxlZGdlci50ZXN0Lm1qcwlyZWxlYXNlLWV2aWRlbmNlIGFza3MgdGhlIHJldmlldyBxdWVzdGlvbiBmcm9tIGl0cyBtYWluIHBhdGgJM2UwNGFlNjFkNjQ1MjljY2E2NWYwZTYwZWM3YzIxOWIxZDBiMTk1Zjk5YWQ2NDBjZjRiNmEwMmYzZWIyOWYxMgpib2R5CXRlc3RzL3Jldmlldy1sZWRnZXIudGVzdC5tanMJcmVsZWFzZS1ldmlkZW5jZSByZWZ1c2VzIGEgcGx1Z2luIGNvbW1pdCBzaW5jZSB0aGUgbGFzdCB0YWcgdGhhdCBubyByZXZpZXcgY292ZXJzLCBhbmQgYSBjb3ZlcmluZyByZXZpZXcgY2xlYXJzIGl0CTJiMmVmODYzNjU3ODMzYzZjOWFjMWZiZTA2OTdlYWIxNzRmZDdmMjUyZmY5MzIwYWIwMDJjMmVmYjViNGM4NGMKYm9keQl0ZXN0cy9yZXZpZXctbGVkZ2VyLnRlc3QubWpzCXRoZSBwcm9tcHQtZmlsZSBmb3JtIHRha2VzIGl0cyBzdGF0dXMgZnJvbSB0aGUgbGFzdCBWRVJESUNUIGxpbmUsIGFuZCBub25lIGlzIHVucGFyc2VkCWQ3MjcyMGEwZjg0NGZiNWQ3M2NhZGVlNGJkNDZkNDllNWMyZDkxMWM2MDA2ZjJmYmY5NzljNWUwN2M4NDZhNDk · test-lock-kind:replace
