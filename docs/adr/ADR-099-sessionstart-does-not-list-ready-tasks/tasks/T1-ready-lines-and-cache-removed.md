# Task ADR-099-T1: SessionStart and the compaction note name no ready task, and the ready-task cache is gone

**Depends-on:** ADR-097-T1
**Covers:** none — no spec
**Estimated scope:** L (two emitters, two deleted modules, three trimmed modules, twelve test files, six corpus expectations, one golden, five catalogue files, one relock)
**Owner:** unassigned
**Produces:** the removal: `tests/ready-cache.test.mjs` and the SessionStart, compaction-note and `qh_orientation` ready lines gone, which makes ADR-040 T1, ADR-046 T3 and T5 and ADR-095 T6 describe code that no longer exists
**Consumes:** none
**Data dependency:** needs a fresh clone of this repository for S8's `hook-cost.mjs` measurement; every other step and the Acceptance fence are hermetic
**Proof map:** v1
**Rests-on:** `the hook output names no ready task`, `SessionStart starts no adr-next`, `nothing shipped names the removed code`, `the could-not-look line names corpus existence`, `the readiness transcript changes only by the removed paragraph`, `every catalogue entry matches its source`

## Goal

No SessionStart (startup, resume, compact, clear), compaction note or `qh_orientation` answer names a ready task or starts `adr-next`,
and nothing shipped holds or names the ready-line producer, the ready-task cache or its recorder; `work-next` is the one reader of "ready".

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/ready-is-work-next.test.mjs` | add | the two tests below |
| `plugin/scripts/session-orientation.mjs` | edit | drop the `readyTaskLines`/`surfaceReadyLines`/`readyCache` imports (`:13-14`), the call and the cache paragraph (`:105-107`), the in-flight paragraph (`:143-146`) and the `ready.lines.length` term of the shadow-notice gate (`:128`); the could-not-look line (`:108-110`) keeps UNPROVEN and reads `could-not-look: git could not list the tree (UNPROVEN), so corpus existence is not known.` |
| `plugin/scripts/session-notes.mjs` | edit | drop the imports (`:14-15`), the task section (`:109-118`) and the `tasks` option (`:43`) |
| `plugin/scripts/on-session-end.mjs` | edit | stop passing `{ tasks: false }` (`:36`), the option it fed is gone |
| `plugin/scripts/ready-lines.mjs` | edit | delete `readyTaskLines`, `surfaceReadyLines`, `gateSaid`, `ownerCaveat`, `missingOwnerCaveat`, `EVIDENCED_SUMMARY` and the imports only they used; keep `advisoryHeadline`, `resolvePython`, `spawnGate`; the header comment says what the file now holds |
| `plugin/scripts/ready-cache.mjs` | delete | the cache (ADR-095 T6) |
| `plugin/lib/trace_run.py` | delete | its recorder |
| `plugin/scripts/decision-corpus.mjs` | edit | delete `TASK_DIRECTORY_READ_CAP`, `newestTaskChange`, `taskDirectories` and their comments (`:325-399`), and whatever that leaves unreached |
| `plugin/scripts/corpus-text.mjs` | edit | delete `commandInCode` (`:147-162`) |
| `plugin/scripts/uninteresting.mjs`, `plugin/scripts/work-next.mjs` | edit | comments at `uninteresting.mjs:24` and `work-next.mjs:282-285` name `taskDirectories` as a live reader; say it was SessionStart's former inventory |
| `plugin/scripts/on-session-start.mjs`, `plugin/scripts/completion-rules.mjs` | edit | comments at `on-session-start.mjs:39-41` and `completion-rules.mjs:399-401` say the note carries the task in flight; it no longer does |
| `plugin/bin/qh-mcp` | edit | `qh_orientation`'s description (`:617-620`) stops naming "ADR tasks in flight" |
| `tests/ready-cache.test.mjs` | delete | its subject is deleted (9 locks: ADR-095 T6 five, withdrawn ADR-095 T2 four) |
| `tests/lifecycle.test.mjs` | edit | delete, locked by ADR-068 T2: "SessionStart offers ready tasks the listing named", "a disk-only task dir is not in flight", "git cannot list is UNPROVEN, not no ready tasks", "SessionStart says UNPROVEN, with the gate's reason, when adr-next could not run", "SessionStart always surfaces an UNPROVEN ready line and still caps ordinary ones", "SessionStart says how many task directories it did not read", "SessionStart reads the most recently changed task directories, not the first listed"; change, locked by ADR-068 T2: "a hook payload with a BOM is read, and one that is not JSON is said, not swallowed" (`:1837` keys on the in-flight heading; key it on the `Verification:` paragraph) and "session orientation states this project, and only this project" (drop the two in-flight assertions at `:1514` and `:1518`); comment only, locked by ADR-068 T2: "PreCompact records what the gates measured, and the compact SessionStart hands it back" (`:1023`); drop `readyTaskLines`/`surfaceReadyLines` from the import at `:14` |
| `tests/archive-not-in-flight.test.mjs` | edit | delete the tests that call `readyTaskLines` (0 locks); in "work-next reads an unmarked archive as live, as every other reader does" keep the `work-next` half and drop the `readyTaskLines` half (`:478`) |
| `tests/work-next-readiness.test.mjs` | edit | delete "a directory with an unreadable task offers none of its tasks as ready" and "a ready task with no runnable fence is not sent to adr-verify"; keep the `work-next` half of "a task adr-next could not read leaves its directory UNPROVEN in both readers" (0 locks) |
| `tests/corpus-excludes-fixtures.test.mjs` | edit | delete "session orientation asks adr-next about the real task set and never a fixture"; keep the `work-next` test (0 locks) |
| `tests/chaos-315-codex-render.test.mjs` | edit | delete the two ready-line tests (0 locks) |
| `tests/named-not-dropped.test.mjs` | edit | delete "SessionStart names a task directory git lists and the disk does not hold" and "SessionStart never repeats an absolute path a gate printed" (0 locks) |
| `tests/chaos-315-ansi.test.mjs`, `tests/corpus-link-loop.test.mjs`, `tests/session-start-unreadable-owner.test.mjs` | edit or delete | delete the SessionStart ready-line test in each (0 locks); a file left with no test is deleted |
| `tests/chaos-e016066.test.mjs` | edit | delete "a command keeps an invisible character a copy needs, and shows a control escaped" with `commandInCode` (0 locks) |
| `tests/gate-rules.test.mjs` | edit | the comment at `:1138` names `readyTaskLines` as the parser of `adr-next --json`; it is `work-next` now |
| `tests/hook-goldens.test.mjs`, `tests/goldens/readiness.json` | edit | the readiness scenario drops its `utimesSync` ordering block and its comment (`:167-173`), which only ordered SessionStart's task directories; the golden is rewritten with `QH_GOLDEN_UPDATE=1` and its diff read: only the in-flight paragraph goes |
| `tests/fixtures/corpora/{ansible-nested-fixtures,dated-archive,go-module,orphan-tasks,python-monorepo,undecided-records}/expected.json` | edit | each `sessionStart.mustMatch` entry about a ready, unproven or evidenced task directory moves to `mustNotMatch` as `is ready` or `ADR tasks in flight`; `tests/corpus-matrix.test.mjs` itself is unchanged (7 locks) |
| `tests/mutations/plugin/scripts/ready-cache.mjs.json`, `tests/mutations/plugin/lib/trace_run.py.json` | delete | the catalogue of a deleted source moves with it (CLAUDE.md §1): 18 and 21 entries |
| `tests/mutations/plugin/scripts/ready-lines.mjs.json` | edit | remove the 29 of 33 entries on deleted code; keep the four on `spawnGate`, `resolvePython` and `advisoryHeadline`; add the `nothing shipped names the removed code` mutant |
| `tests/mutations/plugin/scripts/session-orientation.mjs.json`, `tests/mutations/plugin/scripts/session-notes.mjs.json`, `tests/mutations/plugin/scripts/decision-corpus.mjs.json`, `tests/mutations/plugin/scripts/corpus-text.mjs.json` | edit | remove every entry `node scripts/mutate.mjs --stale` names (a `from` that no longer matches, or a killer gone); add the three mutants of S7 |
| `docs/adr/ADR-068-git-refuses-in-a-linked-worktree-and-says-when-it-is-armed/tasks/T2-sessionstart-says-git-not-armed.md` | relock | `adr-verify --relock --replace-hashes` after the lifecycle deletions are in the diff |
| `docs/BACKLOG.md` | edit | close §372 lead (2), the two SessionStart items of §370 and §378's "run the misses of the ready-line cache concurrently" (`:3716`) by pointing at ADR-099; in §378, a receipt naming ADR-099 for its spec-retirement-tag deferral and saying ADR-097's ready-line deferral landed here |

## Ordered Steps

1. [S1] Write `tests/ready-is-work-next.test.mjs` with the two tests of the Tests table and record the red run (TDD red: today the orientation prints the heading, starts `adr-next`, and `ready-cache.mjs` ships).
2. [S2] Remove the readiness section from `session-orientation.mjs` and `session-notes.mjs` (and the `tasks` option with its caller in `on-session-end.mjs`), and reword the could-not-look line as the Affected Files table gives it.
3. [S3] Delete `ready-cache.mjs`, `trace_run.py` and the readiness half of `ready-lines.mjs`; delete `taskDirectories`, `TASK_DIRECTORY_READ_CAP`, `newestTaskChange` and `commandInCode`. Enumerate what else the deletion leaves unreached with a bare-identifier scan over `plugin/` for every definition the deleted code called (`mrw read --grep '\b<name>\b' plugin/`), and delete each one nothing else names; put the command and the names in the sign-off.
4. [S4] Edit the comments and the `qh_orientation` description the Affected Files table names. [proof: acceptance]
5. [S5] Delete and change the tests the table names, after `python3 scripts/test-locks.py <file> "<name>"` confirms each lock listed there and no other; rewrite the readiness golden with `QH_GOLDEN_UPDATE=1 node --test tests/hook-goldens.test.mjs` and read its diff; move the six `expected.json` entries. Where a deleted test was the only test of a definition that stays (a frozen-archive or alias rule `work-next` still uses), move its assertion to `work-next --json` in a new test beside the old site rather than drop it. [proof: acceptance]
6. [S6] Retake ADR-068 T2's lock map with `python3 plugin/bin/adr-verify docs/adr/ADR-068-git-refuses-in-a-linked-worktree-and-says-when-it-is-armed/tasks/T2-sessionstart-says-git-not-armed.md --relock --replace-hashes`. A relock snapshots hashes and runs no fence; the deletions are proved by this task's tests and the full gate. No other record is edited here: ADR-040, ADR-046 and ADR-095 are retired whole by T2 (Decision 5). [proof: human: the reviewer reads the relock row beside the test deletions in one diff and confirms every hash it replaced belongs to a test this task deleted or changed]
7. [S7] Clean the catalogue until `node scripts/mutate.mjs --stale` prints `every entry matches its source exactly once`, then record one killed mutant per mechanism with `adr-verify --mutant`: `the hook output names no ready task` (in `session-orientation.mjs`, `return lines.join('\n\n')` → `return [...lines, 'ADR tasks in flight:'].join('\n\n')`; and in `session-notes.mjs`, `text: parts.join(' ')` → `text: [...parts, 'ADR task in flight: T1 is ready —'].join(' ')`), `nothing shipped names the removed code` (an `export const readyCache = null;` before `advisoryHeadline` in `ready-lines.mjs`), `the could-not-look line names corpus existence` (the reworded line without `so corpus existence is not known`), and `the readiness transcript changes only by the removed paragraph` (the `Verification:` paragraph's wording changed in `session-orientation.mjs`, which the golden sees). Two names have no mutant, and the sign-off says so: `SessionStart starts no adr-next`, because the code that would start it is deleted and the test shows its detector seeing a start through `work-next`; and `every catalogue entry matches its source`, which is the catalogue's own check (`tests/package.test.mjs:1318-1330` shows it naming a stale entry). Then run every catalogue entry of the five edited sources' files under the costly-runs skill; a GREEN is a finding about a test, fixed here (CLAUDE.md §4, §18). [proof: mutation]
8. [S8] Measure one SessionStart before and after with `node scripts/hook-cost.mjs SessionStart <a fresh clone of this repository>` and put the children, the `adr-next` count and the milliseconds in the sign-off, with the load it ran under [proof: human: the after run starts no `adr-next` child and the figures are taken on the same clone and machine].
9. [S9] Do not commit this task alone: between T1 and T2 current-format lint refuses ADR-095 T6's `done`, whose locked tests T1 deletes (`plugin/lib/record.py:3942`). After T2 passes, run the whole gate (`bash scripts/selftest.sh`) and commit T1 and T2 together; `node scripts/orphan-sweep.mjs` after that commit prints `0 orphan(s)` [proof: human: the gate's exit 0 and the sweep's count are in the sign-off].

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/ready-is-work-next.test.mjs 2>&1) \
  && for t in 'SessionStart and the compact note name no ready task and start no adr-next where work-next finds one' 'the ready-task cache and its recorder are not shipped and nothing shipped names what only they used'; do test "$(printf '%s\n' "$out" | grep -cxE "ok [0-9]+ - $t")" = 1 || exit 1; done \
  && test "$(node --test --test-reporter=tap --test-name-pattern 'git cannot list is UNPROVEN, not no corpus' tests/lifecycle.test.mjs 2>&1 | grep -cxE 'ok [0-9]+ - git cannot list is UNPROVEN, not no corpus')" = 1 \
  && test "$(node --test --test-reporter=tap --test-name-pattern '^readiness' tests/hook-goldens.test.mjs 2>&1 | grep -cxE 'ok [0-9]+ - readiness: an accepted record with a ready task, an evidenced one and a proposed record are said as they were')" = 1 \
  && node scripts/mutate.mjs --stale 2>&1 | grep -qx 'every entry matches its source exactly once'
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `SessionStart and the compact note name no ready task and start no adr-next where work-next finds one` | `tests/ready-is-work-next.test.mjs` | a fixture repository with an Accepted record and a ready task, run through a copy of the plugin whose `bin/adr-next` is a shim that appends to a marker before running the real gate: the dirty twin, `work-next --json` through the same copy, lists the task as ready and writes the marker; then the real SessionStart hook on stdin for `startup`, `resume`, `clear`, and a PreCompact followed by `compact`, and `orientation.mjs`, say nothing matching `ADR tasks? in flight` or `is ready —` and write no marker | — | S1, S2 |
| `the ready-task cache and its recorder are not shipped and nothing shipped names what only they used` | `tests/ready-is-work-next.test.mjs` | `git ls-files` lists none of `plugin/scripts/ready-cache.mjs`, `plugin/lib/trace_run.py`, `tests/ready-cache.test.mjs` and their catalogue files; no tracked file under `plugin/`, `scripts/` or `tests/mutations/` names `readyTaskLines`, `surfaceReadyLines`, `readyCache`, `ready-cache`, `trace_run`, `taskDirectories`, `TASK_DIRECTORY_READ_CAP`, `newestTaskChange` or `commandInCode`; the same scan over a fixture string that names one reports it | — | S1, S3, S4 |
| `git cannot list is UNPROVEN, not no corpus` | `tests/lifecycle.test.mjs` | existing, unchanged: a corrupt index still yields `UNPROVEN` and `corpus existence` at SessionStart | — | S2 |
| `readiness: an accepted record with a ready task, an evidenced one and a proposed record are said as they were` | `tests/hook-goldens.test.mjs` | the transcript of the same scenario, rewritten once: the in-flight paragraph is absent, everything else byte-identical | — | S5 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the two new tests |
| 2 — something selects it | n/a: a removal; the first test drives the real hook program and the MCP command, and the second scans every shipped file that could still select the removed code |
| 3 — the caller can discover it | `qh_orientation`'s description stops promising the lines; `work-next` is named in `plugin/skills/work/SKILL.md:20` and `plugin/README.md:44` |
| 4 — it is used | nothing measures this yet; the §18 outside run shows the SessionStart lines an adopter now gets |

## Mutation Log

## Invariants

- What every gate judges is unchanged: `adr-next`, `work-next`, `adr-lint` and the publish verdict read the same inputs and say the same things.
- A tree git cannot list is still UNPROVEN at SessionStart (ADR-005, ADR-040 F-2).
- `spawnGate`, `resolvePython` and `advisoryHeadline` keep their behaviour and their callers.
- No other record is edited by this task beyond ADR-068 T2's tool-written relock row.

## Risks

- A relock records new hashes without running anything, so it can hide an unreviewed change to a locked test: relock only after the deletions are in the same diff, and review them there (S6).
- Deleting a test can drop the only kill of a mutant on code that stays (a frozen-archive rule, a link alias); S7's campaign over the edited sources finds it, and S5 moves the assertion to `work-next` rather than lose it.
- ADR-097 T1 (committed as dbf53131 while this record was drafted, 2026-10-12) also edited `tests/lifecycle.test.mjs` and relocked ADR-068 T2, and another session is still editing the tree: re-run `test-locks.py` on every file in the table at execution, and start on a committed tree.

## Stop Condition

Stop and ask if:
`test-locks.py` names a lock on a test this task deletes that the Affected Files table does not list; anything other than the
in-flight paragraph changes in the readiness golden; a deleted test turns out to be the only test of behaviour `work-next` relies on and
cannot be re-pointed; or `adr-verify --relock` refuses ADR-068 T2.

## Out of Scope

- Anything in `work-next` or `adr-next`.
- The rename of `ready-lines.mjs`, the MCP router, the leftover cache directories and the spec retirement tag (the parent record's Out of Scope).
- Retiring ADR-040, ADR-046 and ADR-095 (T2).

## Verification Log
