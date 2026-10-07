# Task ADR-089-T3: attest-import files the new keys, and release-evidence names them

**Depends-on:** T2
**Covers:** none — no spec
**Estimated scope:** S (two repository scripts, one document, one new test file, campaign entries)
**Owner:** unassigned
**Produces:** none
**Consumes:** attestation keys `look` and `notCompared` (T2)
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `the schema keys`, `the shape check of the new keys`, `the attested reason names what was not compared`, `the unchanged counting rule`, `a partial run attests only beside an ok one`

## Goal

attest-import files an attestation carrying `look` and `notCompared` and refuses a malformed one, and
release-evidence's `attested` reason names a PARTIAL look and a non-zero `notCompared` (ADR-089
Decision 4). A PARTIAL attestation attests a release only beside one whose `look` is `ok` (Alternative
(d), the owner's decision on Accepting ADR-089), filtered in `outsideRun`; `countsAsRun` and
`regressedBy` are unchanged.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `scripts/attest-import.mjs` | edit | `KEYS` (`:22`) gains `look` and `notCompared` after `readinessUnproven`; `check` (`:112`) refuses a `look` outside ok/PARTIAL/UNPROVEN/null, a `notCompared` that is not a non-negative integer or null, and a `notCompared` that is non-null beside a null `verdictChanges` |
| `scripts/release-evidence.mjs` | edit | the `attested` reason (`:306`) appends `look PARTIAL` and `<n> not compared` per attestation that carries them; `outsideRun` (`:254`) counts the attestations `countsAsRun` admits only when one of them carries no `look` or `look: ok`, else it is `unproven`, kind `partial-only` (Alternative (d)); `countsAsRun` (`:250`) and `regressedBy` (`:248`) are unchanged |
| `docs/corpus-reports/README.md` | edit | the schema block and the `verdictChanges` paragraph (`:28`, `:47-51`) describe `look`, `notCompared` and the PARTIAL comparison |
| `tests/attest-look.test.mjs` | add | the three tests below |
| `tests/mutations.json` | edit | one entry per Rests-on name |

## Ordered Steps

1. [S1] Run `python3 scripts/test-locks.py` on `tests/attest-import.test.mjs` and `tests/release-evidence.test.mjs`. On 2026-10-06 they held 8 and 24 locks; the new tests go in a new file. Write the three tests and record the red run (TDD red). Red today: attest-import refuses `look` as a key outside the schema.
2. [S2] Add the two keys to `KEYS` and their shape checks to `check`, each refusal numbered `2:` and naming the key and ADR-089, as `verdictChanges`' refusal does.
3. [S3] In `outsideRun`'s `attested` reason, append ` (look PARTIAL, <n> not compared)` or the half that applies, beside the existing `failToPass` note. An attestation without the keys reads exactly as today. Then the Alternative (d) filter: when every attestation `countsAsRun` admits carries a `look` other than `ok`, the verdict is `unproven`, kind `partial-only`, with its own `tagAdvice`.
4. [S4] Update `docs/corpus-reports/README.md`'s schema block and paragraph. [proof: human: a reviewer reads the README's schema block and confirms it lists `look` and `notCompared` in `KEYS` order and says a PARTIAL pair is compared over the records both runs read]
5. [S5] Record one killed mutant per Rests-on name, and add each to `tests/mutations.json`:
   - drop `look` from `KEYS`;
   - accept any `notCompared`;
   - drop the reason suffix;
   - let `countsAsRun` accept `compared` 0, which the locked release-evidence tests in the fence's second command must kill.
   - drop the Alternative (d) filter, so a PARTIAL attestation attests alone;
   [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/attest-look.test.mjs 2>&1) \
  && for t in 'attest-import files look and notCompared and refuses malformed ones' 'release-evidence names an unread part of an attested corpus' 'release-evidence refuses a partial run that regressed' 'release-evidence attests a partial run only beside an ok one'; do test "$(printf '%s\n' "$out" | grep -cxE "ok [0-9]+ - $t")" = 1 || exit 1; done \
  && node --test tests/attest-import.test.mjs tests/release-evidence.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `attest-import files look and notCompared and refuses malformed ones` | `tests/attest-look.test.mjs` | in a scratch repository with real digests, built as `tests/attest-import.test.mjs`'s `repository` helper builds one, attestations with `look: 'PARTIAL', notCompared: 6` and with both null are filed. DIRTY twins, each refused with nothing written: `look: 'partial'`; `notCompared: -1`; `notCompared: 1.5`; `notCompared: 2` beside `verdictChanges: null` | none | S1, S2 |
| `release-evidence names an unread part of an attested corpus` | `tests/attest-look.test.mjs` | `outsideRun` over a covering attestation with `look: 'PARTIAL'`, `verdictChanges: { compared: 17, passToFail: 0, failToPass: 0 }` and `notCompared: 6`, beside a covering `look: 'ok'` one, is `attested`, and its reason includes `look PARTIAL` and `6 not compared`. CLEAN twin: one without the keys gives today's reason byte for byte | none | S1, S3 |
| `release-evidence refuses a partial run that regressed` | `tests/attest-look.test.mjs` | the same PARTIAL attestation with `passToFail: 1` is `unproven`, kind `regressed`, beside another attestation that attests: the PARTIAL count refuses as an `ok` one does | none | S1, S3 |
| `release-evidence attests a partial run only beside an ok one` | `tests/attest-look.test.mjs` | the PARTIAL attestation alone is `unproven`, kind `partial-only`, and its `tagAdvice` says why; so is one whose `look` is null. CLEAN twins: beside an `ok` attestation, or beside one from before `look`, it is `attested` | none | S1, S3 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the three tests |
| 2 — something selects it | `main` in attest-import calls `check`; `release-evidence`'s main calls `outsideRun` over `readAttestations` |
| 3 — the caller can discover it | `docs/corpus-reports/README.md`'s schema |
| 4 — it is used | the first filed attestation with `look`; nothing measures this yet |

## Mutation Log
- 2026-10-07 · 49bd0c3* · mutant killed · exit 1 · `scripts/release-evidence.mjs` · a PARTIAL attestation attests a release alone again · acceptance-sha256:6a7b1d3e9247a589948ecb3b9b066f6fb15d1f3c909ee63efebef5d5fb08841b · covers:a partial run attests only beside an ok one
- 2026-10-07 · 49bd0c3* · mutant killed · exit 1 · `scripts/attest-import.mjs` · look is outside the schema again · acceptance-sha256:6a7b1d3e9247a589948ecb3b9b066f6fb15d1f3c909ee63efebef5d5fb08841b · covers:the schema keys
- 2026-10-07 · 49bd0c3* · mutant killed · exit 1 · `scripts/attest-import.mjs` · any notCompared is accepted · acceptance-sha256:6a7b1d3e9247a589948ecb3b9b066f6fb15d1f3c909ee63efebef5d5fb08841b · covers:the shape check of the new keys
- 2026-10-07 · 49bd0c3* · mutant killed · exit 1 · `scripts/release-evidence.mjs` · the attested reason no longer names a PARTIAL look or what was not compared · acceptance-sha256:6a7b1d3e9247a589948ecb3b9b066f6fb15d1f3c909ee63efebef5d5fb08841b · covers:the attested reason names what was not compared
- 2026-10-07 · 49bd0c3* · mutant killed · exit 1 · `scripts/release-evidence.mjs` · countsAsRun accepts a run that compared nothing (the locked release-evidence tests kill it) · acceptance-sha256:6a7b1d3e9247a589948ecb3b9b066f6fb15d1f3c909ee63efebef5d5fb08841b · covers:the unchanged counting rule
- 2026-10-07 · 49bd0c3* · mutant killed · exit 1 · `scripts/release-evidence.mjs` · an UNPROVEN attestation is listed as attesting beside an ok one again · acceptance-sha256:6a7b1d3e9247a589948ecb3b9b066f6fb15d1f3c909ee63efebef5d5fb08841b

## Invariants

- Every attestation already in `docs/corpus-reports/` passes `attest-import --check`'s shape rules exactly as before.
- `countsAsRun` and `regressedBy` are byte-identical.

## Risks

- The reason line grows; a release session reading it gains one clause per PARTIAL attestation.

## Stop Condition

Stop and ask if a locked test pins the `attested` reason's exact text. (This line also stopped for Alternative (d) when the task was written; the owner chose (d) on Accepting ADR-089, and S3 now carries it.)

## Out of Scope

- Any change to `countsAsRun` or `regressedBy`: Alternative (d) is a filter in `outsideRun` (S3).

## Verification Log
- 2026-10-07 · 49bd0c3* · exit 1 · `out=$(node --test --test-reporter=tap tests/attest-look.test.mjs 2>&1) \ …` · acceptance-sha256:6a7b1d3e9247a589948ecb3b9b066f6fb15d1f3c909ee63efebef5d5fb08841b · ms:444 · test-lock-sha256:158c967f6c4aece0f8512735ee8840cb531421a73ad50ea8ed5e7bfd499325bd · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvYXR0ZXN0LWxvb2sudGVzdC5tanMJYXR0ZXN0LWltcG9ydCBmaWxlcyBsb29rIGFuZCBub3RDb21wYXJlZCBhbmQgcmVmdXNlcyBtYWxmb3JtZWQgb25lcwljZjM5Zjk1ZjY2OTYzZWUzMTM2NmFmYjM2N2VkNGIyMjFlMzM4ZTIxMDY3ZjE2Y2Q5MTY4NmRlNjQzYjBjYmFkCmJvZHkJdGVzdHMvYXR0ZXN0LWxvb2sudGVzdC5tanMJcmVsZWFzZS1ldmlkZW5jZSBhdHRlc3RzIGEgcGFydGlhbCBydW4gb25seSBiZXNpZGUgYW4gb2sgb25lCTE3ODQ0Y2U4ZWYwNmQzMjU5MzdiMTNjZDQ2OWRlMDYwNzc2Y2E1OTE2YzdmMjM0ZTUxODFmMDIyMzkwYTNhODQKYm9keQl0ZXN0cy9hdHRlc3QtbG9vay50ZXN0Lm1qcwlyZWxlYXNlLWV2aWRlbmNlIG5hbWVzIGFuIHVucmVhZCBwYXJ0IG9mIGFuIGF0dGVzdGVkIGNvcnB1cwlkMjU2M2VhMzE0YjU2ZmIwZjM2ZWFiODA5YmQ1YmNlNjM1YjlmODc0YjgxYzQzOGYxMGU0YTRjMGI5NzQ5M2U5CmJvZHkJdGVzdHMvYXR0ZXN0LWxvb2sudGVzdC5tanMJcmVsZWFzZS1ldmlkZW5jZSByZWZ1c2VzIGEgcGFydGlhbCBydW4gdGhhdCByZWdyZXNzZWQJMmYzZGVjNzBhYWQ5OTk2YzlkNDk0NjU5NWVjNjJkMWQxYTMzZGQ4NTY2NTJiY2E1NTczZTA5MDM2ODBjYmFjOQ
  ```
  ```
- 2026-10-07 · 49bd0c3* · exit 0 · `out=$(node --test --test-reporter=tap tests/attest-look.test.mjs 2>&1) \ …` · acceptance-sha256:6a7b1d3e9247a589948ecb3b9b066f6fb15d1f3c909ee63efebef5d5fb08841b · ms:4359
- 2026-10-07 · 49bd0c3* · exit 0 · `out=$(node --test --test-reporter=tap tests/attest-look.test.mjs 2>&1) \ …` · acceptance-sha256:6a7b1d3e9247a589948ecb3b9b066f6fb15d1f3c909ee63efebef5d5fb08841b · ms:5258
- 2026-10-07 · 49bd0c3* · exit 0 · `out=$(node --test --test-reporter=tap tests/attest-look.test.mjs 2>&1) \ …` · acceptance-sha256:6a7b1d3e9247a589948ecb3b9b066f6fb15d1f3c909ee63efebef5d5fb08841b · ms:4442
- 2026-10-07 · 49bd0c3* · exit 0 · `out=$(node --test --test-reporter=tap tests/attest-look.test.mjs 2>&1) \ …` · acceptance-sha256:6a7b1d3e9247a589948ecb3b9b066f6fb15d1f3c909ee63efebef5d5fb08841b · ms:4776
- 2026-10-07 · 49bd0c3* · exit 0 · `out=$(node --test --test-reporter=tap tests/attest-look.test.mjs 2>&1) \ …` · acceptance-sha256:6a7b1d3e9247a589948ecb3b9b066f6fb15d1f3c909ee63efebef5d5fb08841b · ms:4494
- 2026-10-07 · 49bd0c3* · exit 1 · `out=$(node --test --test-reporter=tap tests/attest-look.test.mjs 2>&1) \ …` · acceptance-sha256:6a7b1d3e9247a589948ecb3b9b066f6fb15d1f3c909ee63efebef5d5fb08841b · ms:1077
  ```
  ```
- 2026-10-07 · 49bd0c3* · exit 0 · `out=$(node --test --test-reporter=tap tests/attest-look.test.mjs 2>&1) \ …` · acceptance-sha256:6a7b1d3e9247a589948ecb3b9b066f6fb15d1f3c909ee63efebef5d5fb08841b · ms:4407
