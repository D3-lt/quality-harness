# Task ADR-087-T5: a yaml-frontmatter fixture corpus in the matrix

**Depends-on:** T1, T2, T3, T4
**Covers:** F-1, F-2, F-3, F-4, F-5, F-6, F-7, F-9
**Estimated scope:** M (one authored fixture corpus, its reviewed `expected.json`, a README row)
**Owner:** unassigned
**Produces:** `tests/fixtures/corpora/yaml-frontmatter/` and its `expected.json`
**Consumes:** `frontmatter_block` / `frontmatterBlock` (T1), the bullet label (T2), the `superseded_by` target (T3), `notRead` (T4)
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `the reviewed expectation`

## Goal

Every reader's answer over one authored corpus that carries each measured shape is pinned by `tests/corpus-matrix.test.mjs`, as the go-module corpus pins its own shapes (BACKLOG §282).

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/fixtures/corpora/yaml-frontmatter/docs/decisions/*.md` | add | the authored records listed in S2 |
| `tests/fixtures/corpora/yaml-frontmatter/Final/RFC0001-example.md`, `notes/meeting.md` | add | the T4 rows |
| `tests/fixtures/corpora/yaml-frontmatter/expected.json` | add | reviewed, not snapshotted (`tests/fixtures/corpora/README.md`) |
| `tests/fixtures/corpora/README.md` | edit | one table row: the shapes this corpus carries, and the defect class it would have caught (BACKLOG §353, §354; ADR-087) |

`tests/corpus-matrix.test.mjs` is what selects the corpus: its `readdirSync(corporaDir)` (`:68`) runs one test per directory, so no test file changes.

## Ordered Steps

1. [S1] Write `expected.json` first, from what each reader SHOULD say after T1 to T4, and record the red run (TDD red). Before T1 to T4, `corpus yaml-frontmatter: every reader answers as reviewed, through a symlink` fails.
2. [S2] Author the corpus. Every file is written for this fixture, and none is copied from a public repository (CLAUDE.md §6). Under `docs/decisions`, each with a `## Context` and a `## Decision` unless stated:
   - `001`: `status: active`, `superseded_by: null`.
   - `002`: `status: superseded`, `superseded_by: 004-cache-in-redis`.
   - `003`: `status: "accepted"  # MADR 4 form`.
   - `004`: `status: active`, `supersedes: [002-cache-in-memory]`.
   - `005`: `status: superseded`, `superseded_by: "0006"`.
   - `006`: `* Status: accepted` above `## Context and Problem Statement` (MADR 2).
   - `007`: `status: superseded`, `superseded_by: 008-retries-v2.md`.
   - `008`: `status: Active`, `supersedes: [003-log-format]`.
   - `009`: the MADR 4 template value, `status: "{proposed | rejected | accepted | deprecated | … | superseded by ADR-0123}"`.
   - `010`: `status: on hold`.
   - `011`: `status: active`, with no `## Context` or `## Decision`.
   - `012-a` and `012-b`: both `status: active`, sharing one number.
   - `013`: no Status above its first section, and `- Status: accepted` under `## Context`.

   Outside a record directory: `Final/RFC0001-example.md` with frontmatter `Status: Final`, and `notes/meeting.md` with frontmatter `status: draft`.
3. [S3] Run the matrix and review each reader's answer against `expected.json` by hand. Where two readers disagree on purpose, such as adr-lint on `011` against lifecycle, record it under `disagreements` with the reason. Do not snapshot.
4. [S4] Add the README row.
5. [S5] Record one killed mutant for `the reviewed expectation`: revert T1's `active` entry in `STATUS_KINDS` in a mutant, so the corpus test goes red. Add it to `tests/mutations.json`. [proof: mutation]

## Acceptance

```bash
node --test --test-reporter=tap tests/corpus-matrix.test.mjs 2>&1 | grep -qE '^ *ok [0-9]+ - corpus yaml-frontmatter: every reader answers as reviewed, through a symlink$'
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `the matrix discovers the yaml-frontmatter corpus` | `tests/corpus-matrix.test.mjs` | the corpus is selected by directory discovery; the fence also requires `corpus yaml-frontmatter: every reader answers as reviewed, through a symlink` to pass, and that test holds every reader's answer over the authored corpus to the reviewed `expected.json`: governing `001`, `003`, `004`, `006`, `008`, `011`, `012-a`, `012-b`; graveyard `002`, `005`, `007` with targets 4, 6 and 8; undecided `009`, `010`, `013`, each with its reason; `011` as reviewed; `notRead` holding only `Final/RFC0001-example.md`. That test is named by a template, which no test lock can extract, so this row names the literal test (as ADR-064 T6 does) | F-1, F-2, F-3, F-4, F-5, F-6, F-7, F-9 | S1, S2, S3, S4 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the corpus and its `expected.json` |
| 2 — something selects it | `tests/corpus-matrix.test.mjs:68` lists every corpus directory; deleting the directory removes its test, which the README row names |
| 3 — the caller can discover it | the README row |
| 4 — it is used | every CI run of the matrix on three platforms |

## Mutation Log
- 2026-10-07 · 49bd0c3* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · the reviewed expectation: without active in lifecycle's word set the yaml-frontmatter corpus's records and counts move from expected.json · acceptance-sha256:36529139a9e447ece091aeb822be49187d7a8a175b599195aac865c4df0ec49f
- 2026-10-07 · 49bd0c3* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · without active in lifecycle the yaml-frontmatter corpus's records and counts move from expected.json · acceptance-sha256:36529139a9e447ece091aeb822be49187d7a8a175b599195aac865c4df0ec49f · covers:the reviewed expectation

## Invariants

- No file in the corpus is copied from a public repository.
- Every other corpus's `expected.json` is unchanged.

## Risks

- `expected.json` written to match output rather than reviewed. S3 reviews each value against S2's list, and the README states the rule.

## Stop Condition

Stop and ask if any other corpus's `expected.json` has to change, or if `011` shows a split between readers that the owner has not seen.

## Out of Scope

- A dir-status-rfc-shaped corpus as records — ADR-087 Out of Scope.

## Verification Log
- 2026-10-07 · 49bd0c3* · exit 1 · `node --test --test-reporter=tap tests/corpus-matrix.test.mjs 2>&1 | grep -qE '^ *ok [0-9]+ - corpus yaml-frontmatter: every reader answers as reviewed, through a symlink$'` · acceptance-sha256:36529139a9e447ece091aeb822be49187d7a8a175b599195aac865c4df0ec49f · ms:16955 · test-lock-sha256:85812fbe66e3bf58c57331c3e23894b8b53ef81ae357e90ae036f81ae02002fb · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvY29ycHVzLW1hdHJpeC50ZXN0Lm1qcwl0aGUgVVRGLTE2IGZpeHR1cmUgdGFzayBpcyBub3QgdGV4dCB0byBnaXQJZjJlOTdiNWQ3NTdkOGM4MmU4ODM3MDhjOWEwZGIxOTRkZDA1ODk3YjgyNjFmMjBjZjljMzgxZDMxZjQ3YTlmZgpib2R5CXRlc3RzL2NvcnB1cy1tYXRyaXgudGVzdC5tanMJdGhlIG1hdHJpeCBkaXNjb3ZlcnMgdGhlIHRocmVlIEFEUi0wNjQgY29ycG9yYQk1ZDFkMjY0NzgzOGFkMTFjYTk0MDkyZTM3MDkxODYzN2JmNTQ4ZjQ5OWQwNmI4ZGM1NzJlODUyNzE1NzFkYzZmCnVucHJvdmVuCXRlc3RzL2NvcnB1cy1tYXRyaXgudGVzdC5tanMJY29ycHVzIHlhbWwtZnJvbnRtYXR0ZXI6IGV2ZXJ5IHJlYWRlciBhbnN3ZXJzIGFzIHJldmlld2VkLCB0aHJvdWdoIGEgc3ltbGluaw
  ```
  ```
- 2026-10-07 · 49bd0c3* · exit 0 · `node --test --test-reporter=tap tests/corpus-matrix.test.mjs 2>&1 | grep -qE '^ *ok [0-9]+ - corpus yaml-frontmatter: every reader answers as reviewed, through a symlink$'` · acceptance-sha256:36529139a9e447ece091aeb822be49187d7a8a175b599195aac865c4df0ec49f · ms:17610
- 2026-10-07 · 49bd0c3* · exit 0 · `adr-verify --relock` · acceptance-sha256:36529139a9e447ece091aeb822be49187d7a8a175b599195aac865c4df0ec49f · ms:0 · test-lock-sha256:b658539fa28d3bf146fe431646b5a8480072c420f0fa3704f3004fbafb142e0d · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvY29ycHVzLW1hdHJpeC50ZXN0Lm1qcwl0aGUgVVRGLTE2IGZpeHR1cmUgdGFzayBpcyBub3QgdGV4dCB0byBnaXQJZjJlOTdiNWQ3NTdkOGM4MmU4ODM3MDhjOWEwZGIxOTRkZDA1ODk3YjgyNjFmMjBjZjljMzgxZDMxZjQ3YTlmZgpib2R5CXRlc3RzL2NvcnB1cy1tYXRyaXgudGVzdC5tanMJdGhlIG1hdHJpeCBkaXNjb3ZlcnMgdGhlIHRocmVlIEFEUi0wNjQgY29ycG9yYQk1ZDFkMjY0NzgzOGFkMTFjYTk0MDkyZTM3MDkxODYzN2JmNTQ4ZjQ5OWQwNmI4ZGM1NzJlODUyNzE1NzFkYzZmCmJvZHkJdGVzdHMvY29ycHVzLW1hdHJpeC50ZXN0Lm1qcwl0aGUgbWF0cml4IGRpc2NvdmVycyB0aGUgeWFtbC1mcm9udG1hdHRlciBjb3JwdXMJNDNiNzE4OWI5ZjMzYzU0YjkwNjc1YjE4OGY5YWVkNzMyZGU1NGNhYjc1NjkyYTlmYzJlYTMyNTU3MjMxM2E0Yg · test-lock-kind:relock
- 2026-10-07 · 49bd0c3* · exit 0 · `node --test --test-reporter=tap tests/corpus-matrix.test.mjs 2>&1 | grep -qE '^ *ok [0-9]+ - corpus yaml-frontmatter: every reader answers as reviewed, through a symlink$'` · acceptance-sha256:36529139a9e447ece091aeb822be49187d7a8a175b599195aac865c4df0ec49f · ms:20818
