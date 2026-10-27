# ADR-129: A test lock's payload is a committed file, and its row carries only the sha

**Status:** Accepted
**Accepted:** 2026-10-27 by the owner ("accepted"), after a cold review whose four findings are folded in below
**Date:** 2026-10-27
**Owner:** Zy
**Spec:** None — no spec stage; the owner's direction of 2026-10-27 ("the grouping and payload width - we need to do earlier"; "Build both now, land with T1/T2"), over the measurement in Context
**Cross-references:** docs/adr/ADR-050-a-locked-test-body-is-not-rewritten.md, docs/adr/ADR-052-an-explicit-relock-is-not-a-later-red.md, docs/adr/ADR-078-a-lock-reads-javascript-as-javascript.md, docs/adr/ADR-088-evidence-is-read-against-its-writer.md, docs/adr/ADR-117-the-evidence-is-written-only-by-its-tools.md
**Governs:** None — declared by its tasks
**Enforced-by:** None — declared by its tasks. Each task adds one campaign mutation per mechanism.
**Served-path change:** a Verification Log row that takes a test lock from now on carries `test-lock-sha256:<hex> · test-lock-file:<path>` and no `test-lock-b64:` payload; the payload is a committed file under the corpus's `locks/` directory, named by its sha. Rows already written keep their payload and are read as before.

## Context

A test lock is the evidence that a task's tests were not rewritten after its first red (ADR-050). `adr-verify` writes it into
the row: `test-lock-sha256:` and the whole payload, base64, as `test-lock-b64:`. Measured 2026-10-27 over this repository's
`docs/adr/**/tasks/*.md`: 525 rows carry a payload, median 3,399 columns, longest 39,685. Every read of a task file pays it:
the qh-core session measured the same day that 38% of its `mrw read` output came from lines over 400 columns, and this
session's reads of task files were dominated by those rows.

The payload is inline because the lock must travel with the record in git: a fresh clone's `adr-lint` names which locked
test moved, and the sha alone cannot (record.py `_recorded_lock`, `lock_findings`). A committed file named by that sha keeps
both properties and takes the bytes out of the row.

## Existing Primitives Audit

- `encode_lock` / `decode_lock` (plugin/lib/record.py): the canonical payload and its sha256. Reused unchanged: the file holds
  exactly the bytes the sha is taken over, so the row's existing `test-lock-sha256:` names and verifies it.
- `_recorded_lock` / `lock_findings` / `vlog_has_test_lock` (record.py): the one reading of a lock every gate shares
  (ADR-045, ADR-092). T1 adds the sidecar form there, so adr-lint, adr-next, adr-verify `--relock` and
  `scripts/test-locks.py` read it without a second reader.
- `first_red_lock_suffix` / `lock_snapshot_suffix` (record.py): the two writers of the suffix. T2 changes only these and the
  file write beside them.
- `tests/path-length.test.mjs`: the 128-character path bound a sidecar name has to fit.

The class, enumerated 2026-10-27 with `mrw read --stat --grep 'test-lock-b64|test_lock_b64|TEST_LOCK_FIELD' plugin core scripts`:
plugin/bin/adr-lint, plugin/bin/adr-next, plugin/bin/adr-verify, plugin/lib/record.py, scripts/test-locks.py (5 files). The
Go core reads no lock. qh-core's own reader (another repository) parses `test-lock-b64:` and is told, not changed here.

## Decision

1. **T1, the readers take a sidecar.** A row whose lock field is `test-lock-file:<path>` is read from that file: `<path>` is
   relative to the repository root (the readers are handed the root, not the task file: found executing T1), and the file's raw bytes, read before any text decoding, must hash to the row's
   `test-lock-sha256:`. A file that is absent, that git ignores, that resolves outside the repository, that is unreadable,
   or whose sha differs (a CRLF rewrite included) is a lock that could not be read: UNPROVEN, `done` withheld, as an
   unreadable inline payload is today (ADR-005). A file git lists only as untracked (`--others --exclude-standard`, the
   state between `adr-verify` and its commit) is read, and adr-lint advises committing it with the row: it is the
   repository's own once committed, and refusing it before then would fail every fresh lock (the cold review of this
   record). Every place that decodes a lock goes through one resolver, the historical first-red read `_recorded_lock`
   takes for `first_check` included (record.py, the same review). A row with `test-lock-b64:` is read exactly as before.
2. **T2, the writer writes the file.** `adr-verify` writes the payload to `<corpus>/locks/<sha256>.lock` (the corpus is the
   directory holding the record) and appends the row with `test-lock-file:` and no payload, for a first red, a recovery lock,
   `--relock` and `--replace-hashes`. The file is written before the row, so a row never names a file that was never
   written. Content-addressed: the same payload is one file, whichever task takes it. The writer also writes
   `locks/.gitattributes` (`* text eol=lf`) when it is absent, so the bytes stay LF in whatever corpus the directory is
   in, and a checkout that rewrites them anyway reads as UNPROVEN, never as a pass. In a directory git does not hold the row
   keeps its inline payload: a file there can be neither listed nor carried by a clone (found executing T2). A record whose
   corpus directory is above the repository root puts its locks at the root.
3. **Nothing written is rewritten.** The 525 rows with a payload stay as they are: a Verification Log is never edited
   (CLAUDE.md §4), and archived records' digests are frozen.

## Alternatives Considered

- **Keep the payload inline and cut it at read time** (`mrw --max-cols`, ADR-179 in the mrw repository): rejected as the fix,
  kept as the mitigation for the rows already written. Every reader would have to remember it.
- **A sidecar beside each task file** (`tasks/T1.lock`): rejected; task paths already reach the 128-character bound, and a
  per-task file duplicates a payload two tasks share.
- **The payload in the state directory or the receipt**: rejected; it does not travel with a clone, which is the reason the
  payload is in the row at all.

## Component / Boundary Impact

None — record.py's lock reading and writing, used by the same gates; no module changes owner.

## Wiring & Contract Changes

| Surface | Change | Producer | Consumer(s) |
|---------|--------|----------|-------------|
| Verification Log lock field | `test-lock-file:<path>` beside `test-lock-sha256:` | T2 | record.py readers (T1), qh-core's reader |
| `<corpus>/locks/<sha256>.lock` | new committed file, LF, the canonical payload | T2 | record.py readers (T1) |
| `<corpus>/locks/.gitattributes` | `* text eol=lf`, written by the writer when absent | T2 | git |

## Inter-task Contracts

| Contract | Producing task | Consuming task(s) | Breaking? |
|----------|----------------|-------------------|-----------|
| sidecar lock reading | T1 | T2 | No — T2's rows are readable only once T1 lands, so T1 comes first |

## Implementation

See `tasks/README.md`.

## Consequences

- **Positive:** a new lock row is about 150 columns instead of thousands; a payload two tasks share is stored once; a task file
  reads at a width a person and an agent can afford.
- **Negative:** a lock is now two files, and a commit that carries the row without the file is a lock that cannot be read
  (UNPROVEN, said by every gate). The rows already written keep their width.

## Out of Scope

- Rewriting existing rows into the sidecar form (permanent: boundary: a Verification Log is never edited, CLAUDE.md §4).
- qh-core's reader (deferred: told through the cross-session channel and memoryd; another repository's tree).

## Risks

- A row committed without its file: T1 makes it UNPROVEN, never a pass; T2's test commits both through the real writer.
- A Windows checkout rewriting line endings: `locks/.gitattributes` holds LF, asserted with `git check-attr` (CLAUDE.md §7), and a rewritten file reads as UNPROVEN.

## Rollback

Revert the tasks' commits. Rows written in the sidecar form stay readable only with T1, so revert T2 before T1, and keep T1
while any such row is committed.

## Follow-ups

- [ ] qh-core is told the new field before the first sidecar row lands on main.
