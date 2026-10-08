# Task ADR-091-T1: mutate.mjs reads a catalogue directory and refuses a repeated label

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** M (one script, one new test file)
**Owner:** unassigned
**Produces:** `loadCatalogue(root)` exported from `scripts/mutate.mjs`; per-file write-back for `--repoint --write` and `--narrow --write`
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `a label repeated across files is refused`, `an entry under another source's file is refused`, `the directory is read in path order`, `a write rewrites only the file holding the entry`

## Goal

`scripts/mutate.mjs` reads the union of `tests/mutations/**/*.json` and an optional `tests/mutations.json`,
refuses at exit 2 a repeated label, a misfiled entry, a non-catalogue file or an empty per-source file, and
its write modes rewrite only the files that hold a changed entry. This repository's single file is untouched.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `scripts/mutate.mjs` | edit | `loadCatalogue(root)` beside `campaignPaths` (which keeps its shape, locked by ADR-069 T1); `main` reads through it at `:1321-1333` and at `--narrow`'s re-read (`:1459`); `--repoint --write` (`:1443`) and `--narrow --write` (`:1812`) write per file through `writeCatalogue`. `main` is what selects the loader; deleting the call leaves the campaign reading the single file only, which the path-order test catches |
| `tests/mutate-catalogue-dir.test.mjs` | add | the four tests below, over scratch git repositories this file creates (CLAUDE.md §9) |
| `tests/mutations.json` | edit | one entry per Rests-on name |

## Ordered Steps

1. [S1] Write the four tests in this task's Tests table and record the red run (TDD red). Each builds a scratch git repository with a source, a test and a catalogue, and spawns `scripts/mutate.mjs --root <dir>` with `--list`, `--stale` or `--repoint --write`. The label test puts `x` in `tests/mutations/a.mjs.json` and in `tests/mutations/b.mjs.json`, and also `Y`/`y` in one file, and expects exit 2 naming both files. The path-order test puts files for `b.mjs`, `a/z.mjs` and `.hidden.mjs` beside a legacy `tests/mutations.json` and expects `--list` in path order, legacy file first.
2. [S2] Add `loadCatalogue(root)`: list `tests/mutations/` with `git ls-files -z --cached --others --exclude-standard` less `--deleted`, keep `*.json`, sort by `/`-path in code-unit order, read the legacy file first when it exists, apply `catalogueShapeError` per file, check each entry's `file` against its path (strip `tests/mutations/` and one `.json`), refuse an empty per-source file, and refuse a label seen twice or twice under case folding. Return the entries and, per file, which entries it holds; or the reason, naming the file. Not a git repository with a `tests/mutations/` present is could-not-read, never an empty catalogue.
3. [S3] Read through it in `main`, keeping exit 2 and the `could not read` / `is not a mutation catalogue` wording.
4. [S4] Make `--repoint --write` and `--narrow --write` rewrite only the files whose entries changed, each through `writeCatalogue`; a legacy-file catalogue rewrites that one file exactly as today, so `tests/mutate-runner.test.mjs` and `tests/mutate-catalogue-write.test.mjs` stay green unchanged.
5. [S5] Record one killed mutant per Rests-on name with `adr-verify --mutant --covers`, and add the four to `tests/mutations.json`; confirm with `node scripts/mutate.mjs --case "<label>" --no-cache` [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/mutate-catalogue-dir.test.mjs 2>&1) \
  && for t in 'a label repeated across two catalogue files is refused before anything runs' 'an entry filed under another source is refused' 'the catalogue directory is read in path order beside the single file' 'repoint write rewrites only the file that holds the entry'; do test "$(printf '%s\n' "$out" | grep -cxE "ok [0-9]+ - $t")" = 1 || exit 1; done \
  && node --test tests/mutate-runner.test.mjs tests/mutate-catalogue-write.test.mjs tests/chaos-315-mutate-catalogue.test.mjs tests/mutate-isolation.test.mjs
```

The second command is the regression half: it holds the locked `campaignPaths` deep-equality (ADR-069 T1)
and the two locked single-file fixture tests (ADR-075 T2, T3). `tests/mutate-isolation.test.mjs` runs real
campaigns in worktrees and is the slow part; it stays because those locks are what constrain this design.

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a label repeated across two catalogue files is refused before anything runs` | `tests/mutate-catalogue-dir.test.mjs` | exit 2 naming both files; a case-only repeat in one file too; no mutant applied | none | S1, S2, S3 |
| `an entry filed under another source is refused` | `tests/mutate-catalogue-dir.test.mjs` | an entry for `b.mjs` in `tests/mutations/a.mjs.json` is exit 2 naming the file; an empty per-source file likewise | none | S1, S2 |
| `the catalogue directory is read in path order beside the single file` | `tests/mutate-catalogue-dir.test.mjs` | `--list` prints the legacy file's entries, then each per-source file's by code-unit path order, a dot-named source included | none | S1, S2, S3 |
| `repoint write rewrites only the file that holds the entry` | `tests/mutate-catalogue-dir.test.mjs` | after a repointable edit, `--repoint --write` changes one per-source file byte-for-byte as `writeCatalogue` writes it, and the other is untouched | none | S1, S4 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the four tests |
| 2 — something selects it | `main` reads through `loadCatalogue`; reverting `main` to `readFileSync(paths.catalogue)` turns the path-order test red |
| 3 — the caller can discover it | n/a: no declared interface — the location is a repository convention, documented by T3 |
| 4 — it is used | T3 and every campaign after it |

## Mutation Log
- 2026-10-08 · 5f776809* · mutant killed · exit 1 · `scripts/mutate.mjs` · a repeated label is refused only within one file, so the same label in two per-source files reads as two entries · acceptance-sha256:bccc1364d0209b162c7f3faa93ded085a97054e7605543ab316bb468b5bcb0b2 · covers:a label repeated across files is refused
- 2026-10-08 · 5f776809* · mutant killed · exit 1 · `scripts/mutate.mjs` · an entry for another source is read from a per-source file as if it were filed there · acceptance-sha256:bccc1364d0209b162c7f3faa93ded085a97054e7605543ab316bb468b5bcb0b2 · covers:an entry under another source's file is refused
- 2026-10-08 · 5f776809* · mutant killed · exit 1 · `scripts/mutate.mjs` · the per-source files are read against path order, so entries come out in an order no path predicts · acceptance-sha256:bccc1364d0209b162c7f3faa93ded085a97054e7605543ab316bb468b5bcb0b2 · covers:the directory is read in path order
- 2026-10-08 · 5f776809* · mutant killed · exit 1 · `scripts/mutate.mjs` · a write mode rewrites every catalogue file, not only the one holding the changed entry · acceptance-sha256:bccc1364d0209b162c7f3faa93ded085a97054e7605543ab316bb468b5bcb0b2 · covers:a write rewrites only the file holding the entry

## Invariants

- `campaignPaths` returns exactly its four keys and paths (locked, ADR-069 T1).
- A catalogue that is only `tests/mutations.json` is read, graded and written exactly as before.
- No entry is selected, keyed or graded differently because of the file it came from.

## Risks

- `git ls-files` in a `--root` scratch repository that is not a git repository: refused as could-not-read when `tests/mutations/` exists, so a fixture without git must keep the single file.
- A run killed between two per-source writes leaves each file whole and some rewritten; `--stale` names what remains.

## Stop Condition

Stop and ask if a locked test in `tests/mutate-runner.test.mjs` or `tests/mutate-isolation.test.mjs` goes red, or if the loader cannot list files without reading the working tree's own directory (CLAUDE.md §8).

## Out of Scope

- The other readers — T2. Moving this repository's entries — T3.

## Verification Log
- 2026-10-08 · 5f776809* · exit 1 · `out=$(node --test --test-reporter=tap tests/mutate-catalogue-dir.test.mjs 2>&1) \ …` · acceptance-sha256:bccc1364d0209b162c7f3faa93ded085a97054e7605543ab316bb468b5bcb0b2 · ms:1184 · test-lock-sha256:5091de62dbcae8eb48ca3cd7cd3feccf825d7fc66de822a3c94e38e1ea3a0214 · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvbXV0YXRlLWNhdGFsb2d1ZS1kaXIudGVzdC5tanMJYSBsYWJlbCByZXBlYXRlZCBhY3Jvc3MgdHdvIGNhdGFsb2d1ZSBmaWxlcyBpcyByZWZ1c2VkIGJlZm9yZSBhbnl0aGluZyBydW5zCWU5MzFkNDZmNDExYmUyOWYxNTkwODljMTUzNTQ4NTM4Mzc5MTM0ZTZkODY3NDk1MGEzZWI5NjQzN2EyNTUyYTkKYm9keQl0ZXN0cy9tdXRhdGUtY2F0YWxvZ3VlLWRpci50ZXN0Lm1qcwlhbiBlbnRyeSBmaWxlZCB1bmRlciBhbm90aGVyIHNvdXJjZSBpcyByZWZ1c2VkCWRhMmI3MWE3NWU1YjY4M2MxYTgzNzdmZjNkY2QzN2Q5YzcyY2MzYTAxZTBhMTg1NGEyNTE5MzQ1Y2E2NDE5YTMKYm9keQl0ZXN0cy9tdXRhdGUtY2F0YWxvZ3VlLWRpci50ZXN0Lm1qcwlyZXBvaW50IHdyaXRlIHJld3JpdGVzIG9ubHkgdGhlIGZpbGUgdGhhdCBob2xkcyB0aGUgZW50cnkJZGUyMWY3MTBiZDU1YjA1MGQ1ZjFjNGMyYzFhODA5YjllMzkxNmQyNzNiODc3NmUxNzczMjZlN2M3YjBiMzUwZQpib2R5CXRlc3RzL211dGF0ZS1jYXRhbG9ndWUtZGlyLnRlc3QubWpzCXRoZSBjYXRhbG9ndWUgZGlyZWN0b3J5IGlzIHJlYWQgaW4gcGF0aCBvcmRlciBiZXNpZGUgdGhlIHNpbmdsZSBmaWxlCThkOGJkNTZiNjA2ZTA3YjI4OGVmMTc2M2EzOTk2YWU4NWNmYTE0MzMxYzAzNWM3NTdjZTMwNWQyMGFmZGZiMDk
  ```
  ```
- 2026-10-08 · 5f776809* · exit 0 · `out=$(node --test --test-reporter=tap tests/mutate-catalogue-dir.test.mjs 2>&1) \ …` · acceptance-sha256:bccc1364d0209b162c7f3faa93ded085a97054e7605543ab316bb468b5bcb0b2 · ms:59446
- 2026-10-08 · 5f776809* · exit 0 · `out=$(node --test --test-reporter=tap tests/mutate-catalogue-dir.test.mjs 2>&1) \ …` · acceptance-sha256:bccc1364d0209b162c7f3faa93ded085a97054e7605543ab316bb468b5bcb0b2 · ms:60346
- 2026-10-08 · 5f776809* · exit 0 · `out=$(node --test --test-reporter=tap tests/mutate-catalogue-dir.test.mjs 2>&1) \ …` · acceptance-sha256:bccc1364d0209b162c7f3faa93ded085a97054e7605543ab316bb468b5bcb0b2 · ms:58466
- 2026-10-08 · 5f776809* · exit 0 · `out=$(node --test --test-reporter=tap tests/mutate-catalogue-dir.test.mjs 2>&1) \ …` · acceptance-sha256:bccc1364d0209b162c7f3faa93ded085a97054e7605543ab316bb468b5bcb0b2 · ms:57134
