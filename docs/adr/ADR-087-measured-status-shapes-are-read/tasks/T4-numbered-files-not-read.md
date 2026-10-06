# Task ADR-087-T4: numbered files outside a record directory are named as not read

**Depends-on:** T1
**Covers:** F-9, UC2-S1, UC2-S2
**Estimated scope:** M (work-next.mjs and corpus-probe.mjs, their tests and campaign entries)
**Owner:** unassigned
**Produces:** work-next JSON `notRead` (`[{ file }]`) and one text line; corpus-probe `workNext.notRead`, and a `notRead` field in `--diff`
**Consumes:** `frontmatterBlock` (T1)
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `the numbered-name filter`, `the record-directory exclusion`

## Goal

work-next and corpus-probe name each tracked `.md` file that sits outside every record directory, has a numbered basename and has a frontmatter `status:` key. `look` does not change.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/work-next.mjs` | edit | `notRead` beside `undecidedNamed` (`:595`), from the tracked listing work-next already reads; one text line after the record counts, naming the count and the first three, with `--json for all` past three |
| `plugin/scripts/corpus-probe.mjs` | edit | carry `workNext.notRead` beside `partialBecause` (`:439`), and name it in `--diff` (`:511`) |
| `tests/corpus-shapes.test.mjs` | edit | this task's two tests |
| `tests/mutations.json` | edit | one entry per Rests-on name |

## Ordered Steps

1. [S1] Write this task's two tests and record the red run (TDD red). Today work-next prints "no QH corpus is in use" over the data corpus and names nothing.
2. [S2] Read how `tests/corpus-matrix.test.mjs` compares `workNext`. If it compares only the keys an `expected.json` lists, no other corpus changes. If it compares the whole object, stop (Stop Condition). [proof: human: the executor reads the matrix's comparison of `workNext` and writes which form it is into this task's prose]
3. [S3] Compute `notRead` from the tracked `.md` listing. Keep a file when no path component matches lifecycle's `RECORD_DIRECTORY`, its basename matches `^[A-Za-z]*-?\d{2,}[-_]`, and `frontmatterBlock` holds a line matching `^status\s*:` in any case. Read at most the first 64 lines of each candidate, and only the ones whose name already matched.
4. [S4] Print the line and carry the field through corpus-probe and `--diff`.
5. [S5] Record one killed mutant per Rests-on name. One drops the name filter, so the unnumbered twin is named. The other drops the record-directory exclusion, so a record under `docs/decisions` is named twice. Add both to `tests/mutations.json`. [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/corpus-shapes.test.mjs 2>&1) \
  && for t in 'a numbered file with a frontmatter status outside a record directory is named as not read' 'an unnumbered note or a record inside a record directory is not named as not read'; do if [ "$(printf '%s\n' "$out" | grep -cE "^ *ok [0-9]+ - $t$")" != 1 ]; then exit 1; fi; done
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a numbered file with a frontmatter status outside a record directory is named as not read` | `tests/corpus-shapes.test.mjs` | `Final/RFC0001-x.md` and `Archive/Rejected/RFC0002-y.md`, each with frontmatter `Status:`, appear in work-next `notRead` and in corpus-probe `workNext.notRead`; work-next text names `Final/RFC0001-x.md`; `look` is `ok` in both | F-9, UC2-S1 | S1, S3, S4 |
| `an unnumbered note or a record inside a record directory is not named as not read` | `tests/corpus-shapes.test.mjs` | `vault/note.md` with frontmatter `status: draft`, `docs/decisions/001-x.md` with frontmatter `status: active`, and `notes/0001-x.md` with no frontmatter are absent from `notRead` | F-9, UC2-S2 | S1, S3 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the two tests |
| 2 — something selects it | work-next's JSON and text builder; corpus-probe reads work-next's JSON as a process, and the test reads both |
| 3 — the caller can discover it | the work-next text line, and the probe field an outside runner pastes |
| 4 — it is used | an outside run over public/dir-status-rfc after release; nothing measures this yet |

## Mutation Log

## Invariants

- `look`, `next` and every existing work-next field are unchanged.
- No file is both in `undecidedNamed` and in `notRead`.

## Risks

- Cost on a large tree. Only names that already match are opened, at most 64 lines each. S3 records how many files that opens on this repository and on the T5 corpus, dated, in this task's prose.

## Stop Condition

Stop and ask if S2 finds the matrix compares whole objects, or if this repository's own work-next JSON gains a non-empty `notRead`.

## Out of Scope

- Reading those files as records — ADR-087 Out of Scope.

## Verification Log
