# Task ADR-091-T2: every other reader reads the directory

**Depends-on:** T1
**Covers:** none — no spec
**Estimated scope:** M (two shipped readers, three repository scripts, one template sentence, one new test file)
**Owner:** unassigned
**Produces:** every reader in ADR-091's Context table, except `scripts/mutate.mjs`, reads `tests/mutations/`
**Consumes:** `loadCatalogue(root)` (T1)
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `adr-lint reads labels from per-source files`, `mutate-propose treats a per-source file as catalogue`, `the staged guard reads the staged per-source file`, `campaign-parity filters each per-source file by test`

## Goal

Every reader that finds the catalogue by path reads `tests/mutations/**/*.json` as well as the single file,
so that T3 can move the data without any reader going quiet.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/bin/adr-lint` | edit | `mutation_labels` (`:3764-3790`) unions the single file with every `tests/mutations/**/*.json` that `tracked_or_unignored_paths` lists; a file that is not a catalogue is the existing UNPROVEN arm, naming that file; the two advice strings (`:3898`, `:3902`) name both locations. `check_enforcement` (`:3885-3905`) is what selects it, unchanged |
| `plugin/scripts/mutate-propose.mjs` | edit | the catalogue test at `:169-175` also accepts a path under `<testsDirectory>/mutations/` ending `.json` |
| `plugin/templates/adr-template.md` | edit | `:56` names both locations |
| `scripts/staged-mutation-guard.mjs` | edit | `stagedCatalogue` reads `git show :tests/mutations/<added>.json` for each added file, then the single file; `main` stays the pre-commit entry (`.githooks/pre-commit:56`) |
| `scripts/campaign-parity.mjs` | edit | `:94-98` filters each catalogue file in the clone by `--tests` and deletes a per-source file left empty (T1 refuses one) |
| `scripts/corpus-metrics.mjs` | edit | `:99` counts through `loadCatalogue` |
| `tests/catalogue-readers.test.mjs` | add | the tests below, each over a scratch repository holding only `tests/mutations/` |
| `tests/mutations.json` | edit | one entry per Rests-on name |

## Ordered Steps

1. [S1] Write the tests in this task's Tests table and record the red run (TDD red). Each builds a scratch repository whose catalogue is ONLY `tests/mutations/<source>.json`, which is the state T3 creates and the state in which today's readers go quiet.
2. [S2] `adr-lint`: union the labels, keep `(set(), None)` when neither location exists, and keep the UNPROVEN arm for a file that is not a catalogue, now naming which file.
3. [S3] `mutate-propose`: classify a `.json` under `<testsDirectory>/mutations/` as catalogue.
4. [S4] The staged guard: read each added source's staged per-source file; an added source with neither a staged per-source entry nor an entry in a staged single file is still refused.
5. [S5] `campaign-parity` and `corpus-metrics` through the union; the template sentence [proof: acceptance]
6. [S6] Record one killed mutant per Rests-on name and add them to `tests/mutations.json` [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/catalogue-readers.test.mjs 2>&1) \
  && for t in 'adr-lint resolves an Enforced-by label from a per-source catalogue file' 'adr-lint says UNPROVEN and names the per-source file that is not a catalogue' 'mutate-propose counts a per-source catalogue file as catalogue and not as a test' 'the staged guard passes an added source whose per-source file is staged' 'the staged guard refuses an added source with no staged catalogue entry'; do test "$(printf '%s\n' "$out" | grep -cxE "ok [0-9]+ - $t")" = 1 || exit 1; done \
  && node --test tests/mutate-propose.test.mjs tests/chaos-315-mutate-catalogue.test.mjs tests/campaign-parity.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `adr-lint resolves an Enforced-by label from a per-source catalogue file` | `tests/catalogue-readers.test.mjs` | no "pointer to nothing" advice for a label held only in `tests/mutations/x.mjs.json`, and the advice for a label held nowhere — the twin | none | S1, S2 |
| `adr-lint says UNPROVEN and names the per-source file that is not a catalogue` | `tests/catalogue-readers.test.mjs` | could-not-look, never "not a mutation label", when one per-source file is unparsable | none | S1, S2 |
| `mutate-propose counts a per-source catalogue file as catalogue and not as a test` | `tests/catalogue-readers.test.mjs` | a string named only by `tests/mutations/x.json` is `catalogued`, not `asserted` | none | S1, S3 |
| `the staged guard passes an added source whose per-source file is staged` | `tests/catalogue-readers.test.mjs` | exit 0 with the per-source file staged | none | S1, S4 |
| `the staged guard refuses an added source with no staged catalogue entry` | `tests/catalogue-readers.test.mjs` | exit non-zero when the per-source file exists in the working tree but is not staged — the twin | none | S1, S4 |

`campaign-parity` over per-source files is covered by a sixth test in the same file, `campaign-parity keeps
only the entries whose tests include --tests, across per-source files`, which the fence's first command runs;
`tests/campaign-parity.test.mjs` keeps the single-file filter. `corpus-metrics` is covered by T3's run over
the real catalogue.

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the five tests |
| 2 — something selects it | `check_enforcement` calls `mutation_labels`; `proposals` classifies; `.githooks/pre-commit` runs the guard. Reverting each change turns its test red |
| 3 — the caller can discover it | `plugin/templates/adr-template.md:56` names both locations |
| 4 — it is used | this repository after T3; adopters' use is not measured |

## Mutation Log
- 2026-10-08 · 9fedbb4c* · mutant killed · exit 1 · `plugin/bin/adr-lint` · adr-lint reads only tests/mutations.json, so a label held in a per-source file is a pointer to nothing · acceptance-sha256:c97da438e885a78d3f48a8d76406b57cd62aaee1994a1a4125c483ad53323b8d · covers:adr-lint reads labels from per-source files
- 2026-10-08 · 9fedbb4c* · mutant killed · exit 1 · `plugin/scripts/mutate-propose.mjs` · a per-source catalogue file is read as a test, so every string it catalogues reads as asserted · acceptance-sha256:c97da438e885a78d3f48a8d76406b57cd62aaee1994a1a4125c483ad53323b8d · covers:mutate-propose treats a per-source file as catalogue
- 2026-10-08 · 9fedbb4c* · mutant killed · exit 1 · `scripts/staged-mutation-guard.mjs` · the guard never reads a staged per-source file, so an added source catalogued there is refused · acceptance-sha256:c97da438e885a78d3f48a8d76406b57cd62aaee1994a1a4125c483ad53323b8d · covers:the staged guard reads the staged per-source file
- 2026-10-08 · 9fedbb4c* · mutant killed · exit 1 · `scripts/campaign-parity.mjs` · only the single file is filtered by --tests, so every per-source entry stays selected · acceptance-sha256:c97da438e885a78d3f48a8d76406b57cd62aaee1994a1a4125c483ad53323b8d · covers:campaign-parity filters each per-source file by test

## Invariants

- An adopter whose catalogue is one `tests/mutations.json` sees no change from either shipped reader.
- No reader treats an absent or unreadable directory as a catalogue holding nothing (ADR-005).

## Risks

- Two shipped readers change: this is a plugin release, and CLAUDE.md §18 asks for an outside run first.

## Stop Condition

Stop and ask if `tracked_or_unignored_paths` cannot be called from `mutation_labels` without a git root, or if a reader not listed in ADR-091's Context table turns up.

## Out of Scope

- `scripts/mutate.mjs` — T1. The data and the docs — T3.

## Verification Log
- 2026-10-08 · 9fedbb4c* · exit 1 · `out=$(node --test --test-reporter=tap tests/catalogue-readers.test.mjs 2>&1) \ …` · acceptance-sha256:c97da438e885a78d3f48a8d76406b57cd62aaee1994a1a4125c483ad53323b8d · ms:649 · test-lock-sha256:7553944e67373373e399a4d94a2ad8ab065cb70f63ef2a1cf46e5212e56f9488 · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvY2F0YWxvZ3VlLXJlYWRlcnMudGVzdC5tanMJYWRyLWxpbnQgcmVzb2x2ZXMgYW4gRW5mb3JjZWQtYnkgbGFiZWwgZnJvbSBhIHBlci1zb3VyY2UgY2F0YWxvZ3VlIGZpbGUJNGQwZGMwMjA1OGVmYWM4YzkyZGM4OTgzYTU3NGRkYTc1MDEyNGRjZTMxNDQwZjkxZWQzYzU0OGU4N2ZlM2JhNQpib2R5CXRlc3RzL2NhdGFsb2d1ZS1yZWFkZXJzLnRlc3QubWpzCWFkci1saW50IHNheXMgVU5QUk9WRU4gYW5kIG5hbWVzIHRoZSBwZXItc291cmNlIGZpbGUgdGhhdCBpcyBub3QgYSBjYXRhbG9ndWUJNmQyYWIxYjA5OWRjZGFmNTA3NGEyOGVmOWY5ZTBkZDJmM2E0MTRmMDQ3M2Y4ODA1MDg4NGE5YzMyNGIwZmIzZApib2R5CXRlc3RzL2NhdGFsb2d1ZS1yZWFkZXJzLnRlc3QubWpzCW11dGF0ZS1wcm9wb3NlIGNvdW50cyBhIHBlci1zb3VyY2UgY2F0YWxvZ3VlIGZpbGUgYXMgY2F0YWxvZ3VlIGFuZCBub3QgYXMgYSB0ZXN0CTcwNDI3MGI4ZGFmOGE2NjI2YTdmNmU2MmJmYjJlOGJmM2RjM2RkODQyMDYxN2QxZWJiZmU5OWE1YjU5MmUwNjgKYm9keQl0ZXN0cy9jYXRhbG9ndWUtcmVhZGVycy50ZXN0Lm1qcwl0aGUgc3RhZ2VkIGd1YXJkIHBhc3NlcyBhbiBhZGRlZCBzb3VyY2Ugd2hvc2UgcGVyLXNvdXJjZSBmaWxlIGlzIHN0YWdlZAliYTk3YjQ4YmE2ZTVhYzJiNWI5ZmU1ZmI5NGM2MjVlMDdiYTZhN2M3N2E3ZjNmYjhjYjgxZDJmZThlYWUwNzEzCmJvZHkJdGVzdHMvY2F0YWxvZ3VlLXJlYWRlcnMudGVzdC5tanMJdGhlIHN0YWdlZCBndWFyZCByZWZ1c2VzIGFuIGFkZGVkIHNvdXJjZSB3aXRoIG5vIHN0YWdlZCBjYXRhbG9ndWUgZW50cnkJYmVhZWI2NGI4MWVmMjAzZTMxN2MwM2UxYzBlOGVkN2U3MzRmZGI3ZmI4MGY0NGIyN2Q4NjllNDVmMjc4NmExMQ
  ```
  ```
- 2026-10-08 · 9fedbb4c* · exit 0 · `out=$(node --test --test-reporter=tap tests/catalogue-readers.test.mjs 2>&1) \ …` · acceptance-sha256:c97da438e885a78d3f48a8d76406b57cd62aaee1994a1a4125c483ad53323b8d · ms:30537
- 2026-10-08 · 9fedbb4c* · exit 0 · `out=$(node --test --test-reporter=tap tests/catalogue-readers.test.mjs 2>&1) \ …` · acceptance-sha256:c97da438e885a78d3f48a8d76406b57cd62aaee1994a1a4125c483ad53323b8d · ms:30616
- 2026-10-08 · 9fedbb4c* · exit 0 · `out=$(node --test --test-reporter=tap tests/catalogue-readers.test.mjs 2>&1) \ …` · acceptance-sha256:c97da438e885a78d3f48a8d76406b57cd62aaee1994a1a4125c483ad53323b8d · ms:30770
- 2026-10-08 · 9fedbb4c* · exit 0 · `out=$(node --test --test-reporter=tap tests/catalogue-readers.test.mjs 2>&1) \ …` · acceptance-sha256:c97da438e885a78d3f48a8d76406b57cd62aaee1994a1a4125c483ad53323b8d · ms:31195
