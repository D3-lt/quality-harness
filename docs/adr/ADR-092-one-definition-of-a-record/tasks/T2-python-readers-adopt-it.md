# Task ADR-092-T2: every Python reader asks the one definition, and reads only regular text files

**Depends-on:** T1
**Covers:** none — no spec
**Estimated scope:** M (adr-retire-check, adr-next, record.py, adr-lint, tests, campaign entries)
**Owner:** unassigned
**Produces:** `read_regular(path)` and `walk(..., unlisted=None, list_dir=None)` in `plugin/lib/record.py`; `looks_like_record` deleted
**Consumes:** `recognised_as_record`, `record_placement`, `corpus_eligible` (T1); `tests/fixtures/record-recognition.json` (T1)
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `adr-retire-check's recognition`, `the identity partition`, `adr-next's owner recognition`, `the regular-file guard`, `the not-text guard`, `the unlisted-directory report`, `the duplicate-path message`, `the any-case obligation walk`, `the attachment read`

## Goal

adr-retire-check counts exactly the recognised records that have an ADR-063 identity and advises on every other recognised one (findings 3 and 5, ADR-092 Decision 4), over the eligible set of Decision 3 on every platform, obligations included (second review 3); adr-next takes no unrecognised file for a decided owner (finding 4); no Python reader in this class reads a file that is not a regular file or not text as a record, and each names it (finding 12; second review 2 and 13, Decision 10); and every adr-retire-check walk names a directory it could not list (second review 12).

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/bin/adr-retire-check` | edit | `adr_files` walks every file and keeps those `corpus_eligible` admits (so `.MD` on every platform), asks `recognised_as_record` with the git root computed once per call, counts a recognised file with identity and appends every recognised file without identity to `unidentified`, the name arm included (today :166 drops a named one); `adr_id_for_file` (:200-204) takes the definition instead of `looks_like_record`; `status_of` (:132-135) and `adr_files`' recognition read through `read_record_text`, and `_read` (:67-68), which `adr_id_for_file` (:191) uses to attribute any walked file, through `read_regular` alone and never asking the content arm of NUL text, so a binary attachment is still attributed by its name and sealed raw while a non-regular, unreadable or NUL-bearing record is could-not-run at exit 2 naming it (adr-retire-check:17-18); `meaningful_obligations` (:223) keeps a file whose name ends `.md` in any case; every walk (:156, :223, and `decision_unit_files` at :346 and :348) passes `unlisted`, and an unlistable directory is could-not-run at exit 2, never a digest over part of a unit (:373-380); the duplicate-identity errors (:400-403, :609-612) say when the paths share one real path; the advice text (:458, :607) says "is recognised as a record" instead of naming the content test, since a named record now reaches it |
| `plugin/bin/adr-next` | edit | `owning_record`: a candidate the definition does not recognise is found with no Status; a candidate that exists and is not a regular file (today skipped at :1140) is found and unreadable; its read goes through `read_record_text` (NUL already handled at :1155-1159); the owner-unreadable hedge (:1512-1515) names which it was; the sibling scan matches `.md` in any case |
| `plugin/lib/record.py` | edit | add `read_regular` (raises for a path that is not a regular file) and `read_record_text` (also raises for text holding a NUL byte); `walk` gains `unlisted`, a list it appends each directory whose listing raised to (record.py:3202-3205), and `list_dir`, the listing seam a test sets to make one directory fail on every platform; both unchanged for a caller that passes neither; delete `looks_like_record` and its `__all__` entry |
| `plugin/bin/adr-lint` | edit | `refuse_irregular` keeps its could-not-run message and asks `read_regular`'s rule; its directory branch (:6436-6471) is unchanged, by ADR-092 Decision 10; it shares only the regular-file rule, never the NUL refusal, so `check_adr` still FAILs a NUL-bearing record (adr-lint:1064-1072, layout L9) |
| `tests/record-recognition.test.mjs` | edit | this task's ten tests |
| `tests/helpers/unlistable.py` | add | loads a gate with `record.walk`'s `list_dir` set so one named directory raises `PermissionError`, then runs the gate's main with the given arguments; the same helper serves T7 |
| `tests/mutations.json` | edit | one entry per Rests-on name |

## Ordered Steps

1. [S1] Write this task's ten tests and record the red run (TDD red): today adr-retire-check counts `Final/001-note.md` as ADR-001, drops `docs/adr/ADR-12345-x.md` silently, misses `ADR-031-x.MD` and its obligations off Windows, counts a NUL-bearing record and lets its Status govern, blocks on a FIFO named `ADR-005-x.md` until the test's timeout, and seals a decision unit over a directory it could not list; adr-next answers `(True, 'Accepted')` for `docs/decisions/001-note.md` and reports a directory named like the owner as missing.
2. [S2] Ask `scripts/test-locks.py` which tasks lock each existing test that names `looks_like_record`, `owning_record`, `adr_files`, `status_of`, `decision_unit_files` or the unidentified advice, and keep every locked test byte-identical. [proof: human: the executor lists the locked tests it found in this task's prose]
3. [S3] Add `read_regular` and `walk`'s `unlisted` and `list_dir`; route adr-retire-check's `_read` and `status_of`, adr-next's owner read and adr-lint's `refuse_irregular` through `read_regular`; pass `unlisted` from every adr-retire-check walk.
4. [S4] adr-retire-check and adr-next call the definition and the eligibility rule; `meaningful_obligations` reads `.md` in any case; delete `looks_like_record`; the duplicate errors name a shared real path.
5. [S5] Record one killed mutant per Rests-on name and add them to the catalogue. [proof: mutation]

## Acceptance

```bash
win=''; case "$(uname -s)" in MINGW*|MSYS*|CYGWIN*) win='( # SKIP [^#]*)?';; esac
noperm="$win"; if [ "$(id -u 2>/dev/null)" = 0 ]; then noperm='( # SKIP [^#]*)?'; fi
out=$(node --test --test-reporter=tap tests/record-recognition.test.mjs 2>&1) \
  && for t in 'adr-retire-check counts the identified records and advises on every other recognised one' 'adr-retire-check counts a .MD record and its obligations' 'adr-next does not take an unrecognised file for a decided owner' 'no Python reader reads a path that is not a regular file as a record' 'no Python reader reads a record holding a NUL byte as text' 'every adr-retire-check walk names a directory it could not list' 'a binary attachment is still attributed and sealed'; do if [ "$(printf '%s\n' "$out" | grep -cE "^ *ok [0-9]+ - $t$")" != 1 ]; then exit 1; fi; done \
  && for t in 'no Python reader blocks on a FIFO named like a record' 'the link rows read their approved answers in adr-retire-check'; do if [ "$(printf '%s\n' "$out" | grep -cE "^ *ok [0-9]+ - $t$win$")" != 1 ]; then exit 1; fi; done \
  && for t in 'adr-retire-check names a chmod 000 directory'; do if [ "$(printf '%s\n' "$out" | grep -cE "^ *ok [0-9]+ - $t$noperm$")" != 1 ]; then exit 1; fi; done
```

`# SKIP` is accepted only where the fence says: on Windows for the FIFO test (no FIFO can be made), the link test (when `symlinkSync` is refused) and the `chmod 000` test (`chmod 000` does not stop a listing); as root for the `chmod 000` test alone. The regular-file guard and the unlisted-directory report are still proved on every platform, by a directory named like a record and by the injected listing failure, in tests that may never skip.

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `adr-retire-check counts the identified records and advises on every other recognised one` | `tests/record-recognition.test.mjs` | over rows R2-R36 and layout L6, the map row id → the answer of `adr_files(root, unidentified)` loaded through `load_script` with each row's root (counted with its id, in `unidentified`, or absent) deepStrictEquals the table's adr-retire-check column, undecided rows included; the advice line names every `unidentified` path; `Final/001-note.md` is not ADR-001, `ADR-12345-x.md` is advised, `ADR-031-x.MD` is counted | — | S1, S4 |
| `adr-retire-check counts a .MD record and its obligations` | `tests/record-recognition.test.mjs` | an archived `ADR-001-x.MD` with one open `(deferred: …)` Out of Scope item gives `meaningful_obligations` `{"ADR-001": 1}`, as the same record named `.md` does, on every platform | — | S1, S4 |
| `adr-next does not take an unrecognised file for a decided owner` | `tests/record-recognition.test.mjs` | row R5 beside `001-note/tasks/` is found with no Status and its hedge says it is not recognised as a record; its twin with a `## Decision` heading is a decided owner; a directory named `001-note.md` is found and unreadable, never missing | — | S1, S3, S4 |
| `no Python reader reads a path that is not a regular file as a record` | `tests/record-recognition.test.mjs` | layout L5 with a directory named `ADR-005-x.md`: adr-retire-check exits 2 naming it, adr-next names it found and unreadable, and adr-lint gives its directory usage sentence at exit 1 (adr-lint:6436-6471), as L5 approves; runs on every platform | — | S1, S3 |
| `no Python reader blocks on a FIFO named like a record` | `tests/record-recognition.test.mjs` | layout L5 with a FIFO: adr-lint (exit 2, could-not-run), adr-retire-check (exit 2) and adr-next (found and unreadable) each finish within the test's bound; skipped on Windows | — | S1, S3 |
| `no Python reader reads a record holding a NUL byte as text` | `tests/record-recognition.test.mjs` | layout L9: adr-retire-check exits 2 naming it as not text, from `adr_files` and from `status_of` alike, and never reports ADR-009 as governing; adr-next and adr-lint keep their answers | — | S1, S3 |
| `every adr-retire-check walk names a directory it could not list` | `tests/record-recognition.test.mjs` | through `tests/helpers/unlistable.py`, a directory made to fail its listing under the active root, under the archive root, and inside a decision unit each makes adr-retire-check could-not-run at exit 2 naming it, never a PASS and never a digest; the same tree with nothing failing passes; runs on every platform | — | S1, S3 |
| `the link rows read their approved answers in adr-retire-check` | `tests/record-recognition.test.mjs` | row R1 and layouts L1-L4, L7 and L8 give the table's adr-retire-check cells exactly, L2 and L3 as the duplicate error naming both paths as one file; skipped on Windows only if a link cannot be made | — | S1, S4 |
| `adr-retire-check names a chmod 000 directory` | `tests/record-recognition.test.mjs` | a real `chmod 000` directory under the walked root is could-not-run at exit 2 naming it; skipped on Windows and as root, naming the reason | — | S1, S3 |
| `a binary attachment is still attributed and sealed` | `tests/record-recognition.test.mjs` | a flat archive holding `ADR-001-x.md` and `notes-ADR-001.png` with a NUL byte, and a per-record `ADR-002-x/` holding `ADR-002-x.md` and `diagram.png` with one, attribute each attachment to its record and change the unit's seal when the attachment's bytes change; adr-retire-check passes on both | — | S1, S3 |

The first test's range is R2-R41 and L6; layout L10 is in the link test, whose adr-retire-check cell is `unidentified`.

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the ten tests |
| 2 — something selects it | adr-retire-check's walks, `adr_files`, `status_of` and adr-next's `owning_record`; a mutant restoring `looks_like_record`, the `not named` guard at :166, the `*.md` glob at :223, a bare `read_text`, or a walk without `unlisted` is caught |
| 3 — the caller can discover it | adr-retire-check's advice and could-not-run lines; adr-next's owner hedge |
| 4 — it is used | every adr-retire-check and adr-next run; nothing measures this yet |

## Mutation Log

## Invariants

- A record named `ADR-<n>` with an identity keeps every finding it had: the canonical arm admits it whatever it contains.
- A file adr-retire-check could not read as text, or a directory it could not list, is named, never counted, never sealed over and never silently dropped.
- An attachment holding a NUL byte is still hashed raw into its unit's seal (adr-retire-check:368-369); only a record's text read refuses it; `adr_id_for_file` reads through `read_regular` alone.
- A walk caller outside this task that passes neither `unlisted` nor `list_dir` behaves exactly as today until T7.

## Risks

- adr-retire-check walks archive and active roots; the git root is computed once per root, not per file.
- A corpus that relied on adr-retire-check dropping an unidentified named record silently now sees advice; that is ADR-063 Decision 4's answer, not a new rule.

## Stop Condition

Stop and ask if a locked test asserts the old answer for an input the definition now rejects, or if any row's adr-retire-check answer differs from ADR-092 Decision 6 after S4.

## Out of Scope

- The JS readers (T3, T4, T6) and the walks outside adr-retire-check (T7)

## Verification Log
