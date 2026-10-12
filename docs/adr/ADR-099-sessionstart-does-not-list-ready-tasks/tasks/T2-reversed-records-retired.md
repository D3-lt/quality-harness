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

| File | Change | Why |
|------|--------|-----|
| `docs/adr/ADR-040-sessionstart-ready-uses-the-listing.md` and `docs/adr/ADR-040-sessionstart-ready-uses-the-listing/` | `git mv` to `docs/adr-archive/` | the decision unit, whole (adr-retire step 7) |
| `docs/adr/ADR-046-a-caller-relays-could-not-run.md` and `docs/adr/ADR-046-a-caller-relays-could-not-run/` | `git mv` to `docs/adr-archive/` | the same |
| `docs/adr/ADR-095-a-hook-does-not-repeat-work-whose-inputs-have-not-changed.md` and its directory | `git mv` to `docs/adr-archive/` | the same |
| `docs/adr/ADR-095-a-hook-does-not-repeat-work-whose-inputs-have-not-changed/tasks/T2-ready-lines-come-from-a-content-cache.md`, `…/tasks/README.md` | rename, before the move, to `T2-content-keyed-ready-cache.md`, and its README link | archived, the old name is 132 characters, over `tests/path-length.test.mjs:20`'s 128; the over-limit list is closed (`:9-12`) and an archived unit cannot be renamed. A task keeps its `T2-` prefix and README link (CLAUDE.md §7) |
| `docs/adr-archive/README.md` | edit | three `Retired Records` rows: Decision effect `governing`, the date, a Reason naming the clauses ADR-099 reverses (ADR-040 Decision 2-3 and T1; ADR-046 Decision 4, the SessionStart half of 5, T3 and T5 but its `posixListed` export; ADR-095 Decision 6 and T6), Obligations, and the SHA-256 `adr-retire-check` computes |
| `docs/adr/README.md` | edit | the ADR-040, ADR-046 and ADR-095 rows link to their archive paths (governing records stay in the active catalog) |
| `docs/BACKLOG.md` | edit | `## Follow-ups` receipts naming the source ADR, written before the move: ADR-095's unchecked Follow-up (the outside run) and the ADR-046 deferrals that point at "ADR-046 Follow-ups" (its T1 and T7, the record, and ADR-049's), since an archive is never a backlog destination; ADR-040 has none (its one Follow-up is checked) |

## Ordered Steps

1. [S1] Run the Acceptance fence and record the red run (TDD red: the three units are still under `docs/adr/`). [proof: acceptance]
2. [S2] Run `node plugin/scripts/adr-state.mjs` and `python3 plugin/bin/adr-debt docs/adr`; confirm none of the three has a running task or an open owner decision, and list every deferred row and unchecked Follow-up of each unit and every active row that points into one; write each receipt into `docs/BACKLOG.md` `## Follow-ups` naming its source ADR. Put the commands and the rows in the sign-off. [proof: acceptance]
3. [S3] Rename ADR-095's T2 task file and its README link, so every path of the three units is at most 128 characters under `docs/adr-archive/`; list the lengths with a command in the sign-off. [proof: acceptance]
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

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the three archive rows and the moved units |
| 2 — something selects it | `adr-retire-check` reads the archive catalog; `adr-context` must still name the three as governing their paths |
| 3 — the caller can discover it | the active catalog links each to its archive path |
| 4 — it is used | nothing measures this yet |

## Mutation Log

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
