# Task ADR-092-T2: every Python reader asks the one definition, and opens only regular files

**Depends-on:** T1
**Covers:** none — no spec
**Estimated scope:** M (adr-retire-check, adr-next, record.py, adr-lint, tests, campaign entries)
**Owner:** unassigned
**Produces:** `read_regular(path)` and `walk(..., unlisted=None)` in `plugin/lib/record.py`; `looks_like_record` deleted
**Consumes:** `recognised_as_record`, `record_placement`, `corpus_eligible` (T1); `tests/fixtures/record-recognition.json` (T1)
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `adr-retire-check's recognition`, `the identity partition`, `adr-next's owner recognition`, `the regular-file guard`, `the unlisted-directory report`, `the duplicate-path message`

## Goal

adr-retire-check counts exactly the recognised records that have an ADR-063 identity and advises on every other recognised one (findings 3 and 5, ADR-092 Decision 4), over the eligible set of Decision 3 on every platform; adr-next takes no unrecognised file for a decided owner (finding 4); no Python reader in this class opens a file that is not a regular file, and each names it (finding 12, Decision 10).

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/bin/adr-retire-check` | edit | `adr_files` walks every file and keeps those `corpus_eligible` admits (so `.MD` on every platform), asks `recognised_as_record` with the git root computed once per call, counts a recognised file with identity and appends every recognised file without identity to `unidentified`, the name arm included (today :166 drops a named one); `adr_id_for_file` (:200-204) takes the definition instead of `looks_like_record`; `_read` goes through `read_regular` and an `OSError`, so an unreadable or non-regular corpus file is could-not-run at exit 2 naming it (adr-retire-check:17-18); the walks at :156 and :223 pass `unlisted` and an unlistable directory is could-not-run at exit 2; the duplicate-identity errors (:400-403, :609-612) say when the paths share one real path; the advice text (:458, :607) says "is recognised as a record" instead of naming the content test, since a named record now reaches it |
| `plugin/bin/adr-next` | edit | `owning_record`: a candidate the definition does not recognise is found with no Status; a candidate that exists and is not a regular file (today skipped at :1140) is found and unreadable; its read goes through `read_regular`; the owner-unreadable hedge (:1512-1515) names which of the three it was; the sibling scan matches `.md` in any case |
| `plugin/lib/record.py` | edit | add `read_regular`; `walk` gains `unlisted`, a list it appends each directory whose listing raised to (record.py:3202-3205), unchanged for a caller that passes none; delete `looks_like_record` and its `__all__` entry |
| `plugin/bin/adr-lint` | edit | `refuse_irregular` keeps its could-not-run message and asks `read_regular`'s rule |
| `tests/record-recognition.test.mjs` | edit | this task's five tests |
| `tests/mutations.json` | edit | one entry per Rests-on name |

## Ordered Steps

1. [S1] Write this task's six tests and record the red run (TDD red): today adr-retire-check counts `Final/001-note.md` as ADR-001, drops `docs/adr/ADR-12345-x.md` silently, misses `ADR-031-x.MD` off Windows, and blocks on a FIFO named `ADR-005-x.md` until the test's timeout; adr-next answers `(True, 'Accepted')` for `docs/decisions/001-note.md` and reports a directory named like the owner as missing.
2. [S2] Ask `scripts/test-locks.py` which tasks lock each existing test that names `looks_like_record`, `owning_record`, `adr_files` or the unidentified advice, and keep every locked test byte-identical. [proof: human: the executor lists the locked tests it found in this task's prose]
3. [S3] Add `read_regular` and `walk`'s `unlisted`; route adr-retire-check's `_read`, adr-next's owner read and adr-lint's `refuse_irregular` through `read_regular`.
4. [S4] adr-retire-check and adr-next call the definition and the eligibility rule; delete `looks_like_record`; the duplicate errors name a shared real path.
5. [S5] Record one killed mutant per Rests-on name and add them to the catalogue. [proof: mutation]

## Acceptance

```bash
win=''; case "$(uname -s)" in MINGW*|MSYS*|CYGWIN*) win='( # SKIP [^#]*)?';; esac
noperm="$win"; if [ "$(id -u 2>/dev/null)" = 0 ]; then noperm='( # SKIP [^#]*)?'; fi
out=$(node --test --test-reporter=tap tests/record-recognition.test.mjs 2>&1) \
  && for t in 'adr-retire-check counts the identified records and advises on every other recognised one' 'adr-next does not take an unrecognised file for a decided owner' 'no Python reader opens a path that is not a regular file'; do if [ "$(printf '%s\n' "$out" | grep -cE "^ *ok [0-9]+ - $t$")" != 1 ]; then exit 1; fi; done \
  && for t in 'no Python reader blocks on a FIFO named like a record' 'the link rows read their approved answers in adr-retire-check'; do if [ "$(printf '%s\n' "$out" | grep -cE "^ *ok [0-9]+ - $t$win$")" != 1 ]; then exit 1; fi; done \
  && for t in 'adr-retire-check names a directory it could not list'; do if [ "$(printf '%s\n' "$out" | grep -cE "^ *ok [0-9]+ - $t$noperm$")" != 1 ]; then exit 1; fi; done
```

`# SKIP` is accepted only where the fence says: on Windows for the FIFO test (no FIFO can be made), the link test (when `symlinkSync` is refused) and the unlistable-directory test (`chmod 000` does not stop a listing); as root for the unlistable-directory test alone, since root lists a `chmod 000` directory. The regular-file guard is still proved on every platform, by a directory named like a record, in the third test.

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `adr-retire-check counts the identified records and advises on every other recognised one` | `tests/record-recognition.test.mjs` | over rows R2-R33 and layout L6, the map row id → the answer of `adr_files(root, unidentified)` loaded through `load_script` with each row's root (counted with its id, in `unidentified`, or absent) deepStrictEquals the table's adr-retire-check column; the advice line names every `unidentified` path; `Final/001-note.md` is not ADR-001, `ADR-12345-x.md` is advised, `ADR-031-x.MD` is counted | — | S1, S4 |
| `adr-next does not take an unrecognised file for a decided owner` | `tests/record-recognition.test.mjs` | row R5 beside `001-note/tasks/` is found with no Status and its hedge says it is not recognised as a record; its twin with a `## Decision` heading is a decided owner; a directory named `001-note.md` is found and unreadable, never missing | — | S1, S3, S4 |
| `no Python reader opens a path that is not a regular file` | `tests/record-recognition.test.mjs` | layout L5 with a directory named `ADR-005-x.md`: adr-lint and adr-retire-check exit 2 naming it, adr-next names it found and unreadable; runs on every platform | — | S1, S3 |
| `no Python reader blocks on a FIFO named like a record` | `tests/record-recognition.test.mjs` | layout L5 with a FIFO: adr-lint, adr-retire-check and adr-next each finish within the test's bound and give the third test's answers; skipped on Windows | — | S1, S3 |
| `the link rows read their approved answers in adr-retire-check` | `tests/record-recognition.test.mjs` | row R1 and layouts L1-L4 give the table's adr-retire-check cells exactly, L2 and L3 as the duplicate error naming both paths as one file; skipped on Windows only if a link cannot be made | — | S1, S4 |
| `adr-retire-check names a directory it could not list` | `tests/record-recognition.test.mjs` | a `chmod 000` directory under the walked root is could-not-run at exit 2 naming it, and the same tree without it is not; skipped on Windows and as root, naming the reason | — | S1, S3 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the five tests |
| 2 — something selects it | adr-retire-check's `adr_files` and adr-next's `owning_record`; a mutant restoring `looks_like_record`, the `not named` guard at :166, or the bare Status check is caught |
| 3 — the caller can discover it | adr-retire-check's advice and could-not-run lines; adr-next's owner hedge |
| 4 — it is used | every adr-retire-check and adr-next run; nothing measures this yet |

## Mutation Log

## Invariants

- A record named `ADR-<n>` with an identity keeps every finding it had: the canonical arm admits it whatever it contains.
- A file adr-retire-check could not read, or a directory it could not list, is named, never counted and never silently dropped.
- A walk caller outside this task that passes no `unlisted` behaves exactly as today until T7.

## Risks

- adr-retire-check walks archive and active roots; the git root is computed once per root, not per file.
- A corpus that relied on adr-retire-check dropping an unidentified named record silently now sees advice; that is ADR-063 Decision 4's answer, not a new rule.

## Stop Condition

Stop and ask if a locked test asserts the old answer for an input the definition now rejects, or if any row's adr-retire-check answer differs from ADR-092 Decision 6 after S4.

## Out of Scope

- The JS readers (T3, T4, T6) and the walks outside adr-retire-check (T7)

## Verification Log
