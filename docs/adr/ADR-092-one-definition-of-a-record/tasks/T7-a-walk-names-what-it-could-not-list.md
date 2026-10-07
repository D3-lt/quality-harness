# Task ADR-092-T7: every walk names a directory it could not list, and reads `.md` in any case

**Depends-on:** T2
**Covers:** none — no spec
**Estimated scope:** M (adr-debt, adr-lint, adr-verify, arch-lint, spec-verify, tests, campaign entries)
**Owner:** unassigned
**Produces:** a could-not-look line from every `walk` caller for each directory it could not list; adr-debt's and adr-verify's `*.md` walks matching `.md` in any case
**Consumes:** `walk(..., unlisted, list_dir)` and `tests/helpers/unlistable.py` (T2)
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `adr-debt's unlisted report`, `adr-lint's unlisted report`, `adr-verify's unlisted report`, `arch-lint's unlisted report`, `spec-verify's unlisted report`, `adr-debt's any-case suffix`, `adr-verify's any-case suffix`, `adr-debt's regular-file read`

## Goal

`walk` drops a directory it cannot list (record.py:3202-3205); after T2 adr-retire-check names it, and this task makes every other caller do the same (ADR-092 Decision 10, ADR-005): adr-debt (:309, :311, :480), adr-lint (:2933), adr-verify (:2444), arch-lint (:328) and spec-verify (:427), each enumerated 2026-10-07 by `mrw read --grep '\bwalk\(' plugin/bin plugin/lib`. The `*.md` walks among them (adr-debt:309, :480; adr-verify:2444) match with `fnmatch`, case-sensitive off Windows, so a `.MD` record's obligations and a `.MD` task are missed there; they read `.md` in any case, as Decision 3 makes adr-retire-check do.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/bin/adr-debt` | edit | its three walks pass `unlisted`; each directory is a could-not-look line and the run is not a clean answer; the two `*.md` walks keep a file whose name ends `.md` in any case; its read at :480-482 goes through `read_regular` (T2), so a FIFO or other non-regular `.md` is could-not-run at exit 2 naming it and never opened (ADR-092 Decision 10) |
| `plugin/bin/adr-lint` | edit | the walk at :2933 passes `unlisted`; a directory it could not list is said beside the finding that walk serves |
| `plugin/bin/adr-verify` | edit | the walk at :2444 passes `unlisted`, says what it could not list, and keeps a task file whose name ends `.md` in any case |
| `plugin/bin/arch-lint` | edit | the walk at :328 the same |
| `plugin/bin/spec-verify` | edit | the walk at :427 the same |
| `tests/walk-unlisted.test.mjs` | add | this task's five tests; the injected-failure one runs each gate through T2's `tests/helpers/unlistable.py` |
| `tests/mutations.json` | edit | one entry per Rests-on name |

## Ordered Steps

1. [S1] Write this task's five tests and record the red run (TDD red): today each of the five gates, given a walked tree holding a directory whose listing fails, says nothing about it, on every platform through the injected failure; adr-debt and adr-verify skip a `.MD` file off Windows; and adr-debt opens a FIFO named `ADR-001-x.md` and blocks until the test's bound.
2. [S2] Read each gate's could-not-look vocabulary (ADR-005: `UNRUN`, `PARTIAL`, `UNPROVEN`, could-not-run) and record in this task's prose which one each caller uses and why. [proof: human: the executor records the five choices in this task's prose]
3. [S3] Pass `unlisted` in each caller and say each directory in that vocabulary; match `.md` in any case in the three `*.md` walks.
4. [S4] Record one killed mutant per Rests-on name (one per caller) and add them to the catalogue. [proof: mutation]

## Acceptance

```bash
noperm=''; case "$(uname -s)" in MINGW*|MSYS*|CYGWIN*) noperm='( # SKIP [^#]*)?';; esac
win="$noperm"
if [ "$(id -u 2>/dev/null)" = 0 ]; then noperm='( # SKIP [^#]*)?'; fi
out=$(node --test --test-reporter=tap tests/walk-unlisted.test.mjs 2>&1) \
  && for t in 'every walk caller names a directory whose listing failed' 'adr-debt and adr-verify read a .MD file' 'adr-debt never reads a path that is not a regular file'; do if [ "$(printf '%s\n' "$out" | grep -cE "^ *ok [0-9]+ - $t$")" != 1 ]; then exit 1; fi; done \
  && for t in 'every walk caller names a chmod 000 directory'; do if [ "$(printf '%s\n' "$out" | grep -cE "^ *ok [0-9]+ - $t$noperm$")" != 1 ]; then exit 1; fi; done \
  && for t in 'adr-debt never opens a FIFO'; do if [ "$(printf '%s\n' "$out" | grep -cE "^ *ok [0-9]+ - $t$win$")" != 1 ]; then exit 1; fi; done
```

The injected-failure test runs on every platform and is red before the work there too, Windows included, so the fence cannot be green before S3. The `chmod 000` test may report `# SKIP` on Windows, where `chmod 000` does not stop a listing, and as root, which lists such a directory anyway; the fence accepts a skip there and nowhere else.

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `every walk caller names a directory whose listing failed` | `tests/walk-unlisted.test.mjs` | for each of the five gates, run through `tests/helpers/unlistable.py` (T2) so one directory where that gate walks raises `PermissionError`, the output names the directory in the vocabulary S2 recorded and never gives the gate's clean answer; with nothing failing, the clean answer; runs on every platform | — | S1, S3 |
| `every walk caller names a chmod 000 directory` | `tests/walk-unlisted.test.mjs` | the same, with a real `chmod 000` directory and no injection; skipped on Windows and as root | — | S1, S3 |
| `adr-debt and adr-verify read a .MD file` | `tests/walk-unlisted.test.mjs` | a record `docs/adr/ADR-001-x.MD` with a deferred Out of Scope item is reported by adr-debt, and a task `T1-x.MD` is read by adr-verify's walk, on every platform; the same names in `.md` read as today | — | S1, S3 |
| `adr-debt never reads a path that is not a regular file` | `tests/walk-unlisted.test.mjs` | a directory named `docs/adr/ADR-001-x.md` makes adr-debt could-not-run at exit 2 naming it; runs on every platform | — | S1, S3 |
| `adr-debt never opens a FIFO` | `tests/walk-unlisted.test.mjs` | a FIFO named `docs/adr/ADR-001-x.md` with no writer: adr-debt finishes within the test's bound at exit 2 naming it; skipped on Windows | — | S1, S3 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the test |
| 2 — something selects it | each gate passes `unlisted`; a mutant dropping one caller's report is caught |
| 3 — the caller can discover it | each gate's own output |
| 4 — it is used | every run of the five gates; nothing measures this yet |

## Mutation Log

## Invariants

- A tree with nothing unlisted reads exactly as today in every gate.
- No gate turns an unlisted directory into a verdict about its contents (ADR-005).

## Risks

- A gate whose output a caller parses gains a line; S2 checks each gate's machine-readable mode and keeps the line out of any field a parser reads, or stops.

## Stop Condition

Stop and ask if a gate has no could-not-look vocabulary for a walk, or if adding the line would change a machine-readable field another reader parses.

## Out of Scope

- `ast.walk`, which walks a syntax tree, not a directory (permanent: boundary: not a member of the class)

## Verification Log
