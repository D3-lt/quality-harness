# Task ADR-070-T1: attest-import files what its commit proves

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** M (a new script, its test, two documents)
**Owner:** unassigned
**Produces:** `scripts/attest-import.mjs`
**Consumes:** none
**Data dependency:** hermetic for the Acceptance; the audit step (S6) reads this repository's `docs/corpus-reports/` and its history
**Proof map:** v1
**Rests-on:** `the digests are the commit's`, `nothing but an attestation is committed`, `could-not-look is not a refusal`, `the file is named and written one way`

## Goal

`scripts/attest-import.mjs` files the one attestation a peer's message carries, under ADR-070 Decision steps 1-7, or refuses naming every reason and writes nothing; its readers fingerprint, computed from git at `at`, equals the probe's own over the same checkout.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `scripts/attest-import.mjs` | new | the importer |
| `tests/attest-import.test.mjs` | new | the scratch-repository test |
| `docs/corpus-reports/README.md` | edit | "How to file one" names the command |
| `CLAUDE.md` | edit | §18's filing step names the command |
| `tests/mutations.json` | edit | the mutants below |

## Ordered Steps

1. [S1] Write the tests below and see each fail on an assertion (TDD red): the script does not exist.
2. [S2] The test builds a scratch git repository (CLAUDE.md §9) holding a minimal plugin tree: `plugin/scripts/corpus-probe.mjs`, a file under each of `READER_DIRECTORIES`, a dotfile and a `__pycache__` file that must not count, and `plugin/.claude-plugin/plugin.json`; it commits them. The attestation's `probeSha256` and `readers` come from the real `probeDigest` and `readerFingerprint` over that checkout, not from the importer.
3. [S3] Implement steps 1-7 of ADR-070 Decision in that order, each refusal naming its step, and the exit codes.
4. [S4] Wire it: `docs/corpus-reports/README.md` "How to file one", and CLAUDE.md §18's filing step. [proof: acceptance]
5. [S5] Record mutants with `adr-verify --mutant`: the `readers` comparison dropped; an unknown key accepted; the duplicate check dropped; an `at` the clone lacks refused as exit 1 instead of 3; `--check` writes. [proof: mutation]
6. [S6] Run `--check` over the 50 filed probe attestations and record the counts in BACKLOG §301: ADR-070 Context expects 41 accepted and 9 refused for `plugin`. [proof: human: the printed counts, pasted with the command that produced them]

## Acceptance

```bash
set -o pipefail
node --test --test-reporter=tap tests/attest-import.test.mjs 2>&1 | tee /dev/stderr | grep -cxE 'ok [0-9]+ - (an attestation is filed only when its digests are the ones its commit gives|a message that is not exactly one clean attestation is refused, and nothing is written|an at this clone lacks is could-not-look, not a refusal)' | grep -qx 3
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `an attestation is filed only when its digests are the ones its commit gives` | `tests/attest-import.test.mjs` | the probe-computed attestation, embedded in message text, is filed under the Decision's name, byte-equal to the Decision's serialization, and the git-side fingerprint equals the disk-side one; one character changed in `readers` or `probeSha256`, or an annotated `plugin`, is refused and writes nothing; a second import is a duplicate | none | S1, S2, S3 |
| `a message that is not exactly one clean attestation is refused, and nothing is written` | `tests/attest-import.test.mjs` | no attestation, two attestations, a report key beside one, a short `at`, and a `kind: hand` are each refused with their step; `--check` on a good one exits 0 and writes nothing | none | S1, S3 |
| `an at this clone lacks is could-not-look, not a refusal` | `tests/attest-import.test.mjs` | a 40-hex `at` absent from the scratch repository exits 3 and says to fetch it | none | S1, S3 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | `scripts/attest-import.mjs` |
| 2 — something selects it | it is a CLI; the test spawns it as one |
| 3 — the caller can discover it | `docs/corpus-reports/README.md` and CLAUDE.md §18 name it |
| 4 — it is used | ADR-070's follow-up counts tool-filed against hand-filed attestations |

## Mutation Log
- 2026-09-27 · 916b515* · mutant killed · exit 1 · `scripts/attest-import.mjs` · the readers fingerprint is not compared with the commit's · acceptance-sha256:557e8b63f8a9e96481ff60a21eeff328e16c3aadafb8bbf267586f98858df0b8 · covers:the digests are the commit's
- 2026-09-27 · 916b515* · mutant killed · exit 1 · `scripts/attest-import.mjs` · the probe digest is not compared with the commit's · acceptance-sha256:557e8b63f8a9e96481ff60a21eeff328e16c3aadafb8bbf267586f98858df0b8 · covers:the digests are the commit's
- 2026-09-27 · 916b515* · mutant killed · exit 1 · `scripts/attest-import.mjs` · an annotated plugin version is filed · acceptance-sha256:557e8b63f8a9e96481ff60a21eeff328e16c3aadafb8bbf267586f98858df0b8 · covers:the digests are the commit's
- 2026-09-27 · 916b515* · mutant killed · exit 1 · `scripts/attest-import.mjs` · a key outside the schema, such as a report's, is filed · acceptance-sha256:557e8b63f8a9e96481ff60a21eeff328e16c3aadafb8bbf267586f98858df0b8 · covers:nothing but an attestation is committed
- 2026-09-27 · 916b515* · mutant killed · exit 1 · `scripts/attest-import.mjs` · the same run is filed twice · acceptance-sha256:557e8b63f8a9e96481ff60a21eeff328e16c3aadafb8bbf267586f98858df0b8 · covers:the file is named and written one way
- 2026-09-27 · 916b515* · mutant killed · exit 1 · `scripts/attest-import.mjs` · an at the clone lacks is reported as a refusal · acceptance-sha256:557e8b63f8a9e96481ff60a21eeff328e16c3aadafb8bbf267586f98858df0b8 · covers:could-not-look is not a refusal
- 2026-09-27 · 916b515* · mutant killed · exit 1 · `scripts/attest-import.mjs` · --check writes the file · acceptance-sha256:557e8b63f8a9e96481ff60a21eeff328e16c3aadafb8bbf267586f98858df0b8 · covers:the file is named and written one way

## Invariants

- Nothing is written unless every check passes; `--check` never writes.
- Only the schema's keys reach the repository.
- The importer reads git at `at`, never the working tree, for every digest.

## Risks

- `readerFingerprint`'s walk changes and the importer's does not: the equality test fails, which is the point.

## Stop Condition

Stop and ask if the git-side fingerprint cannot be made equal to the probe's disk-side fingerprint on the same checkout without changing the probe.

## Out of Scope

- A hand attestation (deferred: docs/BACKLOG.md §301)
- An audit in CI (deferred: docs/BACKLOG.md §301)

## Verification Log
- 2026-09-27 · 916b515* · exit 1 · `set -o pipefail …` · acceptance-sha256:557e8b63f8a9e96481ff60a21eeff328e16c3aadafb8bbf267586f98858df0b8 · ms:7059 · test-lock-sha256:2bfa2479425c748858b02033e5866ba78604c0ab64c0ae1d2b6d40a470cb4515 · test-lock-b64:Y2hlY2sJZjdlMjUxYjUwM2NhZWZlY2JhMTEyMjFhZDJjYzIyMjc3MDYxNDA1NzNiZWEyMGQ2MWQ5OTg3ZGE3YjYwNTI1Ngpib2R5CXRlc3RzL2F0dGVzdC1pbXBvcnQudGVzdC5tanMJYSBtZXNzYWdlIHRoYXQgaXMgbm90IGV4YWN0bHkgb25lIGNsZWFuIGF0dGVzdGF0aW9uIGlzIHJlZnVzZWQsIGFuZCBub3RoaW5nIGlzIHdyaXR0ZW4JMjM2NzNmNGQzYWY0ZGU2YjAwNTBkOTc1NDdmZGM1NmE3YzY3NWJjYzJkODg2ZDZkODQ3NWYzMWYzZmU0NTNkNgpib2R5CXRlc3RzL2F0dGVzdC1pbXBvcnQudGVzdC5tanMJYW4gYXQgdGhpcyBjbG9uZSBsYWNrcyBpcyBjb3VsZC1ub3QtbG9vaywgbm90IGEgcmVmdXNhbAllZTQ1NjA3ZjI0MmZmZGZiMzEzOTQ3MzBiMzc5YTkxZjRhNzk1YjgyYjc1ZGNjODYxN2EyZjY5YWZjYTdmZDc2CmJvZHkJdGVzdHMvYXR0ZXN0LWltcG9ydC50ZXN0Lm1qcwlhbiBhdHRlc3RhdGlvbiBpcyBmaWxlZCBvbmx5IHdoZW4gaXRzIGRpZ2VzdHMgYXJlIHRoZSBvbmVzIGl0cyBjb21taXQgZ2l2ZXMJNWE0ZjZiNDA4MDlhYTM2MzNjZjU0YmM2MjlkYzZmZDViZDM1YzViZmNlNmM4YjZkZmJjMTkxMmFjMmFlMWY0Mg
  ```
  --- last 10 line(s) of stderr (of 164 after folding 167 raw)
    ...
  1..3
  # tests 3
  # suites 0
  # pass 0
  # fail 3
  # cancelled 0
  # skipped 0
  # todo 0
  # duration_ms 6835.217834
  ```
- 2026-09-27 · 916b515* · exit 0 · `set -o pipefail …` · acceptance-sha256:557e8b63f8a9e96481ff60a21eeff328e16c3aadafb8bbf267586f98858df0b8 · ms:9734
- 2026-09-27 · 916b515* · exit 0 · `set -o pipefail …` · acceptance-sha256:557e8b63f8a9e96481ff60a21eeff328e16c3aadafb8bbf267586f98858df0b8 · ms:11000
- 2026-09-27 · 916b515* · exit 0 · `set -o pipefail …` · acceptance-sha256:557e8b63f8a9e96481ff60a21eeff328e16c3aadafb8bbf267586f98858df0b8 · ms:4064
- 2026-09-27 · 916b515* · exit 0 · `set -o pipefail …` · acceptance-sha256:557e8b63f8a9e96481ff60a21eeff328e16c3aadafb8bbf267586f98858df0b8 · ms:2900
- 2026-09-27 · 916b515* · exit 0 · `set -o pipefail …` · acceptance-sha256:557e8b63f8a9e96481ff60a21eeff328e16c3aadafb8bbf267586f98858df0b8 · ms:3896
- 2026-09-27 · 916b515* · exit 0 · `set -o pipefail …` · acceptance-sha256:557e8b63f8a9e96481ff60a21eeff328e16c3aadafb8bbf267586f98858df0b8 · ms:5947
- 2026-09-27 · 916b515* · exit 0 · `set -o pipefail …` · acceptance-sha256:557e8b63f8a9e96481ff60a21eeff328e16c3aadafb8bbf267586f98858df0b8 · ms:3719
