# Task ADR-045-T1: The record grammar is one module

**Depends-on:** none
**Covers:** F-1, F-2, UC1-S1, UC1-S2, UC2-S1, UC2-S2, UC2-S3
**Estimated scope:** M (one new lib module; seven gate preambles; two tests files; catalogue entries)
**Owner:** zy
**Produces:** none
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1

## Goal

`plugin/lib/record.py` holds `sections_of`, `normalize_acceptance`, `acceptance_digest`. Every gate that had a copy loads it the way `fence.py` is loaded and defines none of the three. `adr-next` reads, normalizes and hashes through the shared functions; `adr-verify` reads the Acceptance section through `sections_of`. For a task whose fence holds a `## ` line, the digest `adr-verify` writes is the digest `adr-next` compares.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/lib/record.py` | add | one home for the grammar; bodies are adr-lint's, verbatim |
| `plugin/bin/adr-lint` | edit | delete `sections_of`, `normalize_acceptance`, `acceptance_digest`; load `record.py` |
| `plugin/bin/adr-verify` | edit | delete `normalize_acceptance`, `acceptance_digest`; load `record.py`; `acceptance_of` and the recording path read Acceptance through `sections_of` |
| `plugin/bin/adr-next` | edit | delete `sections`, `normalize_acceptance`, inline sha256; load `record.py` |
| `plugin/bin/spec-verify` | edit | delete `sections_of`; load `record.py` |
| `plugin/bin/arch-lint` | edit | delete `sections_of`; load `record.py` |
| `plugin/bin/adr-debt` | edit | delete `sections_of`; load `record.py` |
| `plugin/bin/adr-retire-check` | edit | delete `sections_of`; load `record.py` |
| `tests/adr-next.test.mjs` | edit | CLI-to-CLI parity on a `## `-in-fence task; edited fence still unproven |
| `tests/gates.test.mjs` | edit | one-module scan + `check-attr`; unit clean/dirty on the shared three; no-lib test covers the record gates; the manifest-blind fixture carries `lib/` |
| `tests/mutations.json` | edit | entries on `plugin/lib/record.py` and on the adr-next / adr-lint preambles |

## Ordered Steps

1. [S1] Bind the failing tests for the Covers IDs. [proof: acceptance]
2. [S2] Create `plugin/lib/record.py` from adr-lint's three bodies. [proof: acceptance]
3. [S3] Give each of the seven gates the `fence.py` loader preamble for `record.py`, delete its copies, and route adr-next and adr-verify's Acceptance readers through the shared functions. [proof: acceptance]
4. [S4] Add catalogue entries; run each with `node scripts/mutate.mjs --case`. [proof: mutation]

## Acceptance

```bash
node --test --test-name-pattern 'a heading inside the Acceptance fence is not a heading' tests/adr-next.test.mjs && node --test --test-name-pattern 'the record grammar is one module|record.py: a fenced ## is not a heading|a gate copied without plugin/lib says so' tests/gates.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a heading inside the Acceptance fence is not a heading: adr-next agrees with adr-verify's digest` | `tests/adr-next.test.mjs` | adr-verify records, adr-next lists done, digests equal; an edited fence is unproven | F-1, UC1-S1, UC1-S2 | S1, S3 |
| `the record grammar is one module: every gate loads plugin/lib/record.py and none keeps a copy` | `tests/gates.test.mjs` | no `def` of the three names in any gate; seven gates load `lib/record.py` from `__file__`; `eol: lf` | F-2, UC2-S1 | S1, S2, S3 |
| `record.py: a fenced ## is not a heading, blank edges are trimmed, and the digest is sha256 of exactly that` | `tests/gates.test.mjs` | the shared functions, clean and dirty | F-2, UC2-S3 | S1, S2 |
| `a gate copied without plugin/lib says so and exits with its could-not-run code; with lib/ beside it, it runs` | `tests/gates.test.mjs` | the gate's could-not-run code (T4 amended the "exit 2" this row first said; the code is per gate), one sentence naming `record.py`, no traceback; runs with `lib/` | F-2, UC2-S2 | S1, S3 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | `plugin/lib/record.py` is tracked and parsed |
| 2 — something selects it | each gate's preamble loads it at import |
| 3 — the caller can discover it | the preamble resolves it from the gate's own path |
| 4 — it is used | `adr-verify` and `adr-next` CLIs agree on a digest only through it |

## Mutation Log

- 2026-09-11 · 1409897* · mutant killed · exit 1 · `plugin/lib/record.py` · with no fence toggle a `## ` line inside the Acceptance fence is a heading again: adr-verify sees no closing fence and refuses the run, adr-next hashes a shorter body · acceptance-sha256:089098d2c87a8affe5e9bc723ab696e75eb9d990c020280f5777df1dffffadec
- 2026-09-11 · 9942edb* · mutant killed · exit 1 · `plugin/lib/record.py` · with no fence toggle a ## line inside the Acceptance fence is a heading again: adr-verify sees no closing fence and refuses the run, adr-next hashes a shorter body · acceptance-sha256:fe96549c1b3b443a5df25efb861ef28760eb2b52c44d578f3fb07caea9ed7a07

## Invariants

- No gate under `plugin/bin` defines `sections_of`, `sections`, `normalize_acceptance` or `acceptance_digest`.
- `normalize_acceptance` bytes are unchanged, so every existing `acceptance-sha256:` stands.
- A gate without `lib/record.py` exits 2 with a sentence, never a traceback.
- `class Findings`, `_Unreadable`, `scan_code_only`, `tracked_paths` are not moved.

## Risks

- A test copying a gate on its own now needs `lib/` beside it; the manifest-blind fixture is the one such test and carries `lib/` now, with its subject unchanged.
- `adr-next`'s `sections` accepted `##\s+`; `sections_of` accepts `## `. A tab after `##` is not a heading to any other gate either.

## Stop Condition

A green run while any gate still defines one of the three names, or while adr-next's digest for the `## B` fixture differs from adr-verify's.

## Out of Scope

- adr-verify:666 / :1672 / :1983 (deferred: `docs/BACKLOG.md`, filed 2026-09-11)
- adr-next matching only a bash-labelled fence (deferred: `docs/BACKLOG.md`)
- `tracked_paths` (permanent: boundary: T2)

## Notes

Class: `rg -n 'def sections_of|def sections\(|def normalize_acceptance|def acceptance_digest' plugin/bin` (eleven on `ea12656`, zero after). Loader model: adr-verify's `fence.py` preamble. Outermost: the two CLIs.

2026-09-11, after the Codex review: the no-lib test was renamed by T4 (the code is now the gate's own could-not-run code, not 2 everywhere), so the Acceptance filter and the Tests row above were updated to the new name and the fence re-run; the earlier Verification Log rows stand as the runs they were.

## Verification Log
- 2026-09-11 · 1409897 · exit 0 · `node --test --test-name-pattern 'a heading inside the Acceptance fence is not a heading' tests/adr-next.test.mjs && node --test --test-name-pattern 'the record grammar is one module|record.py: a fenced ## is not a heading|a gate copied without plugin/lib says so and exits 2' tests/gates.test.mjs` · acceptance-sha256:089098d2c87a8affe5e9bc723ab696e75eb9d990c020280f5777df1dffffadec · ms:1039
- 2026-09-11 · 1409897* · exit 0 · `node --test --test-name-pattern 'a heading inside the Acceptance fence is not a heading' tests/adr-next.test.mjs && node --test --test-name-pattern 'the record grammar is one module|record.py: a fenced ## is not a heading|a gate copied without plugin/lib says so and exits 2' tests/gates.test.mjs` · acceptance-sha256:089098d2c87a8affe5e9bc723ab696e75eb9d990c020280f5777df1dffffadec · ms:925
- 2026-09-11 · 9942edb · exit 0 · `node --test --test-name-pattern 'a heading inside the Acceptance fence is not a heading' tests/adr-next.test.mjs && node --test --test-name-pattern 'the record grammar is one module|record.py: a fenced ## is not a heading|a gate copied without plugin/lib says so' tests/gates.test.mjs` · acceptance-sha256:fe96549c1b3b443a5df25efb861ef28760eb2b52c44d578f3fb07caea9ed7a07 · ms:1094
- 2026-09-11 · 9942edb* · exit 0 · `node --test --test-name-pattern 'a heading inside the Acceptance fence is not a heading' tests/adr-next.test.mjs && node --test --test-name-pattern 'the record grammar is one module|record.py: a fenced ## is not a heading|a gate copied without plugin/lib says so' tests/gates.test.mjs` · acceptance-sha256:fe96549c1b3b443a5df25efb861ef28760eb2b52c44d578f3fb07caea9ed7a07 · ms:1009
