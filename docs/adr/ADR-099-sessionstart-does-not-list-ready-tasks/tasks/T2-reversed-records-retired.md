# Task ADR-099-T2: ADR-040, ADR-046 and ADR-095 are retired whole as governing, through the adr-retire stage

**Depends-on:** T1
**Covers:** none — no spec
**Estimated scope:** M (three decision units moved, one task file renamed before the move, two catalogs, obligation receipts)
**Owner:** unassigned
**Produces:** none
**Consumes:** the removal (T1)
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `the archive contract holds`, `each unit's digest matches what was moved`, `the obligations of the three are receipted`, `the three units are listed under the archive`, `every tracked path clones on Windows`, `the archived records still govern their paths`, `the spec is still covered`, `the active records that name them still lint`

## Goal

The three records whose tasks T1 makes untrue leave current-format validation by the adr-retire stage, with the decision effect true
of each whole record (`governing`), and nothing in them is edited.

## Affected Files

Widened by the owner on 2026-10-12, after the red run and before any T2 edit: `tests/gates.test.mjs:578` reads
ADR-046 by its active path (locked by ADR-091 T3), so the test and its catalogue file move to the archive path and
ADR-091 T3 is relocked; and the receipts go under a `## Follow-ups` heading at the top of `docs/BACKLOG.md`, which
`adr-retire-check` now reads as the `BACKLOG.md` the two roots share (its own commit, before this one: it read
only `docs/adr/BACKLOG.md`, which does not exist). The ADR-040 spec's citation of the active path is repointed
before the fence, and so are the two other specs that cite a moved record's path.

| File | Change | Why |
|------|--------|-----|
| `docs/adr/ADR-040-sessionstart-ready-uses-the-listing.md` and `docs/adr/ADR-040-sessionstart-ready-uses-the-listing/` | `git mv` to `docs/adr-archive/` | the decision unit, whole (adr-retire step 7) |
| `docs/adr/ADR-046-a-caller-relays-could-not-run.md` and `docs/adr/ADR-046-a-caller-relays-could-not-run/` | `git mv` to `docs/adr-archive/` | the same |
| `docs/adr/ADR-095-a-hook-does-not-repeat-work-whose-inputs-have-not-changed.md` and its directory | `git mv` to `docs/adr-archive/` | the same |
| `docs/adr/ADR-095-a-hook-does-not-repeat-work-whose-inputs-have-not-changed/tasks/T2-ready-lines-come-from-a-content-cache.md` | rename, before the move, to `T2-content-keyed-ready-cache.md` | archived, the old name is 132 characters, over `tests/path-length.test.mjs:20`'s 128; the over-limit list is closed (`:9-12`) and an archived unit cannot be renamed. A task keeps its `T2-` prefix (CLAUDE.md §7); its `tasks/README.md` indexes tasks by id and links no file, so no link changes (found at execution) |
| `docs/adr-archive/README.md` | edit | three `Retired Records` rows: Decision effect `governing`, the date, a Reason naming the clauses ADR-099 reverses (ADR-040 Decision 2-3 and T1; ADR-046 Decision 4, the SessionStart half of 5, T3 and T5 but its `posixListed` export; ADR-095 Decision 6 and T6), Obligations, and the SHA-256 `adr-retire-check` computes |
| `docs/adr/README.md` | edit | the ADR-040, ADR-046 and ADR-095 rows link to their archive paths (governing records stay in the active catalog) |
| `docs/BACKLOG.md` | edit | a `## Follow-ups` heading before `## 1.`, written before the move, with one unchecked receipt per counted obligation of ADR-095 (its two open deferrals, the per-test cache deferred again by T4, its unchecked outside-run Follow-up, and the concurrent-miss deferral of the record, T2 and T6, moot since T1 and left for the owner to check off); ADR-046's three deferrals are delivered and its row says `disposed:` with the evidence; ADR-040 has none (its one Follow-up is checked). ADR-049's pointer at "ADR-046 Follow-ups" is ADR-049's own text and is not edited (CLAUDE.md §10) |
| `tests/gates.test.mjs`, `tests/mutations/docs/adr/ADR-046-a-caller-relays-could-not-run.md.json` | edit, move | "ADR-046 names the ADR-012 §2 amendment for a completed could-not-run exit" (`:578`) reads the archive path; the catalogue file moves to `tests/mutations/docs/adr-archive/` with its `file:` (CLAUDE.md §1) (owner, 2026-10-12) |
| `docs/adr/ADR-091-the-catalogue-is-a-file-per-source/tasks/T3-the-catalogue-moves-in-one-commit.md` | relock | `adr-verify --relock --replace-hashes` after the `tests/gates.test.mjs` change is in the diff (owner, 2026-10-12) |
| `docs/specs/2026-09-10-sessionstart-ready-uses-the-listing.md`, `docs/specs/2026-09-10-layer-from-stages-catalog.md`, `docs/specs/2026-09-12-unreadable-file-is-could-not-run.md` | edit | each cites a moved record by its active path (`:4`, `:6`, `:6`); the path now names `docs/adr-archive/` (owner, 2026-10-12) |

## Ordered Steps

1. [S1] Run the Acceptance fence and record the red run (TDD red: the three units are still under `docs/adr/`). [proof: acceptance]
2. [S2] Run `node plugin/scripts/adr-state.mjs` and `python3 plugin/bin/adr-debt docs/adr`; confirm none of the three has a running task or an open owner decision, and list every deferred row and unchecked Follow-up of each unit and every active row that points into one; write each receipt into `docs/BACKLOG.md` `## Follow-ups` naming its source ADR. Put the commands and the rows in the sign-off. [proof: acceptance]
3. [S3] Rename ADR-095's T2 task file (its README links no file), so every path of the three units is at most 128 characters under `docs/adr-archive/`; list the lengths with a command in the sign-off. [proof: acceptance]
4. [S4] Move each unit with `git mv`, unedited; `git diff --cached --summary` shows renames only for them [proof: human: the reviewer reads the summary and sees `rename` lines and no content change inside the three units].
5. [S5] Add the three archive rows and repoint the three active catalog rows, with the SHA-256 the checker accepts. [proof: acceptance]
6. [S6] Lint the active records that name the three (enumerated 2026-10-12 with `mrw read --stat --grep 'ADR-040|ADR-046|ADR-095' docs/adr/`: ADR-039 T1 and T2, ADR-043, ADR-045 and its README and T13, ADR-049 and its T2, ADR-051, ADR-091 T3, ADR-092 and its T1, ADR-097, ADR-099); re-run that enumeration at execution and lint every record it names. [proof: acceptance]

## Acceptance

```bash
python3 plugin/bin/adr-retire-check docs/adr-archive/README.md \
  && git ls-files --error-unmatch docs/adr-archive/ADR-040-sessionstart-ready-uses-the-listing.md docs/adr-archive/ADR-046-a-caller-relays-could-not-run.md docs/adr-archive/ADR-095-a-hook-does-not-repeat-work-whose-inputs-have-not-changed.md > /dev/null \
  && test "$(node --test --test-reporter=tap tests/path-length.test.mjs 2>&1 | grep -cxE 'ok [0-9]+ - every path outside the frozen archive list clones on Windows without core.longpaths')" = 1 \
  && test "$(node plugin/scripts/adr-context.mjs plugin/bin/qh-mcp plugin/scripts/on-session-start.mjs plugin/scripts/tree-facts.mjs | grep -cE '^GOVERNS +docs/adr-archive/ADR-0(40|46|95)-')" = 3 \
  && node -e 'const r=require("node:child_process").spawnSync(process.execPath,["plugin/scripts/work-next.mjs","--json"],{encoding:"utf8",timeout:120000});const u=JSON.parse(r.stdout).uncoveredReadySpecs;process.exit(Array.isArray(u)&&!u.some(f=>f.includes("sessionstart-ready-uses-the-listing"))?0:1)' \
  && for f in docs/adr/ADR-039-records-use-the-same-listing.md docs/adr/ADR-043-layer-from-stages-catalog.md docs/adr/ADR-045-one-record-grammar.md docs/adr/ADR-049-an-unreadable-file-is-could-not-run.md docs/adr/ADR-051-unproven-advise-does-not-invent-writes.md docs/adr/ADR-091-the-catalogue-is-a-file-per-source.md docs/adr/ADR-092-one-definition-of-a-record.md docs/adr/ADR-097-remove-what-nothing-acts-on.md docs/adr/ADR-099-sessionstart-does-not-list-ready-tasks.md; do python3 plugin/bin/adr-lint "$f" || exit 1; done
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `every path outside the frozen archive list clones on Windows without core.longpaths` | `tests/path-length.test.mjs` | existing, unchanged: no archived path of the three is over 128 characters, and the closed list did not grow | — | S3 |
| `ADR-046 names the ADR-012 §2 amendment for a completed could-not-run exit` | `tests/gates.test.mjs` | changed: reads the record at its archive path, the assertions unchanged (locked by ADR-091 T3, relocked) | — | S4 |
| `adr-retire-check reads the backlog the sibling roots share when the active root has none` | `tests/gate-rules.test.mjs` | the rule this task's catalog rows rest on, shipped in its own commit before this one | — | S5 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the three archive rows and the moved units |
| 2 — something selects it | `adr-retire-check` reads the archive catalog; `adr-context` must still name the three as governing their paths |
| 3 — the caller can discover it | the active catalog links each to its archive path |
| 4 — it is used | nothing measures this yet |

## Mutation Log
- 2026-10-12 · f8b5a785* · mutant killed · exit 1 · `docs/adr-archive/ADR-040-sessionstart-ready-uses-the-listing.md` · a byte inside an archived unit changes; adr-retire-check's seal no longer matches · acceptance-sha256:7e9b1a8eaa8bdb7a1e692ea9d0e9ccbfaa3dc84866c46b1b0be1e54bdf849971 · covers:each unit's digest matches what was moved
- 2026-10-12 · f8b5a785* · mutant killed · exit 1 · `docs/BACKLOG.md` · one of ADR-095's seven receipts is checked off; the archive has more obligations than open receipts · acceptance-sha256:7e9b1a8eaa8bdb7a1e692ea9d0e9ccbfaa3dc84866c46b1b0be1e54bdf849971 · covers:the obligations of the three are receipted
- 2026-10-12 · f8b5a785* · mutant killed · exit 1 · `docs/adr-archive/README.md` · ADR-095's archive row stops saying governing; adr-context no longer names it for the paths it governs · acceptance-sha256:7e9b1a8eaa8bdb7a1e692ea9d0e9ccbfaa3dc84866c46b1b0be1e54bdf849971 · covers:the archived records still govern their paths

## Invariants

- No byte inside the three decision units changes in the move; the one rename (S3) happens before it, in the active tree.
- Each of the three stays governing: the active catalog links it, and `adr-context` names it for the paths it governs.
- No obligation of the three disappears: each has a `## Follow-ups` receipt naming it, or an explicit disposition in its archive row.

## Risks

- `adr-context`, `adr-state` or `work-next` may read only the active tree, so a record archived as `governing` would stop being handed to whoever edits its paths, or the ADR-040 spec would read as an uncovered Ready-for-ADR spec and `work-next` would route to adr-write. The fence checks both; if either fails, stop.
- Archiving a record that still governs freezes it: a later change to the dispatcher or `qh-mcp` (ADR-046) or to the hook memos (ADR-095) needs a new record rather than an amendment. That is the cost of retiring instead of reconciling in place, which the owner chose on 2026-10-12.

## Stop Condition

Stop and ask if: `adr-retire-check` refuses a row for a reason this task cannot satisfy without editing a unit's content; `adr-context`
no longer names one of the three as governing; `work-next --json` lists the ADR-040 spec among `uncoveredReadySpecs`; a receipt's
source cannot be named exactly; or another active record turns out to need an edit because a path it cites moved.

## Out of Scope

- Retiring part of a record (a single task or clause), and retiring a spec fact (the parent record's named gaps).
- ADR-094, which stays active: its reversed clause is one member of a list, and nothing in it fails after T1.

## Verification Log
- 2026-10-12 · 17066d76* · exit 1 · `python3 plugin/bin/adr-retire-check docs/adr-archive/README.md \ …` · acceptance-sha256:7e9b1a8eaa8bdb7a1e692ea9d0e9ccbfaa3dc84866c46b1b0be1e54bdf849971 · ms:149 · test-lock-sha256:6ebcb6021df1b45de24520f1a69eb7bb8c462428199d95bb674c35f7e4ab49a3 · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvcGF0aC1sZW5ndGgudGVzdC5tanMJYSBwYXRoIG9uZSBjaGFyYWN0ZXIgb3ZlciB0aGUgbGltaXQgaXMgbmFtZWQsIGFuZCBvbmUgYXQgaXQgaXMgbm90CWZmYmVlZjczOWE2ZjA2MzY1YzBlYWIyNGFhMTY2MDMxOGFjYzdmYzhiOTcwNjgwNDQ3MGYxOTU2ZjAwYjk1YTMKYm9keQl0ZXN0cy9wYXRoLWxlbmd0aC50ZXN0Lm1qcwlldmVyeSBwYXRoIG91dHNpZGUgdGhlIGZyb3plbiBhcmNoaXZlIGxpc3QgY2xvbmVzIG9uIFdpbmRvd3Mgd2l0aG91dCBjb3JlLmxvbmdwYXRocwk2ZDc5YzdjMDY4MjNmYzJhNDhlZDYxMThkMzc3MjQyYTAzZWQzM2E2NjBjNzNiMDljZDU2YWZjNGIzN2MyNjY0
  ```
  --- last 1 line(s) of stdout
  [PASS] ~/CursorProjects/quality-harness/.claude/worktrees/agent-ae6a4495abdc1bd2e/docs/adr-archive/README.md · 92 active · 7 archived · 92 governing · adr-retire-check 3.8.21 (~/CursorProjects/quality-harness/.claude/worktrees/agent-ae6a4495abdc1bd2e/plugin)
  --- last 4 line(s) of stderr
  error: pathspec 'docs/adr-archive/ADR-040-sessionstart-ready-uses-the-listing.md' did not match any file(s) known to git
  error: pathspec 'docs/adr-archive/ADR-046-a-caller-relays-could-not-run.md' did not match any file(s) known to git
  error: pathspec 'docs/adr-archive/ADR-095-a-hook-does-not-repeat-work-whose-inputs-have-not-changed.md' did not match any file(s) known to git
  Did you forget to 'git add'?
  ```
- 2026-10-12 · f8b5a785* · exit 0 · `python3 plugin/bin/adr-retire-check docs/adr-archive/README.md \ …` · acceptance-sha256:7e9b1a8eaa8bdb7a1e692ea9d0e9ccbfaa3dc84866c46b1b0be1e54bdf849971 · ms:16610
- 2026-10-12 · f8b5a785* · exit 0 · `python3 plugin/bin/adr-retire-check docs/adr-archive/README.md \ …` · acceptance-sha256:7e9b1a8eaa8bdb7a1e692ea9d0e9ccbfaa3dc84866c46b1b0be1e54bdf849971 · ms:16120
- 2026-10-12 · f8b5a785* · exit 0 · `python3 plugin/bin/adr-retire-check docs/adr-archive/README.md \ …` · acceptance-sha256:7e9b1a8eaa8bdb7a1e692ea9d0e9ccbfaa3dc84866c46b1b0be1e54bdf849971 · ms:16556
