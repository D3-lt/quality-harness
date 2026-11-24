# ADR-145: `adr-next` answers a batch of task directories in one process, and `work-next` takes an answer only well inside the single call's limits

**Status:** Accepted
**Date:** 2026-11-24
**Owner:** Zy
**Spec:** None — no spec stage; the input is a measurement of `work-next` and two Codex reviews of a refused first attempt (Context)
**Cross-references:** docs/adr/ADR-034-a-corpus-root-is-a-question-not-an-empty-answer.md, docs/adr/ADR-045-one-record-grammar.md, docs/adr/ADR-099-sessionstart-does-not-list-ready-tasks.md, docs/adr/ADR-031-a-gate-answers-for-itself.md, docs/adr-archive/ADR-046-a-caller-relays-could-not-run.md, plugin/bin/adr-next, plugin/lib/record.py, plugin/scripts/work-next.mjs, plugin/scripts/ready-lines.mjs
**Governs:** None — declared by its tasks
**Enforced-by:** None — declared by its tasks; T1 and T2 each add catalogue mutants that remove one mechanism the decision rests on
**Invalidates:** none — checked: `git grep -n -i -E 'per task directory|one adr-next (process|run) per' -- docs/adr docs/adr-archive docs/architecture.md` (2026-11-24) finds ADR-099:24 and its T1:37, which describe SessionStart's removed ready lines, not a rule that `work-next` must start one process per directory
**Served-path change:** `node plugin/scripts/work-next.mjs`: each `readinessFrom` call (plugin/scripts/work-next.mjs:47, reached at :513 and :518) with two or more task directories starts one `adr-next --batch` process for them, and one `adr-next <dir> --json` only for each directory the batch did not answer inside the margins; what it prints is the same, sooner

## Context

`work-next` asks `adr-next` once per task directory (plugin/scripts/work-next.mjs:82-83), each a new Python process that
imports the gate and plugin/lib/record.py again. Measured 2026-11-24 on this repository at 4427b1af (macOS, 125 task
directories, machine otherwise idle): a warm `work-next` took 13.0 s, nearly all of it in those process starts.

A first attempt the same day answered every directory from one process and took 6.3 s with byte-identical output. It was a
separate importer (`plugin/lib/next_batch.py`, never pushed) that loaded the gate's source and called its `main()` per query.
Two Codex reviews (gpt-6.2-sol, high effort) refused it, and their findings are the input here:

- **Held:** nothing but `record._object_format` is shared between queries. Enumerated 2026-11-24 with
  `git grep -n -E 'lru_cache|^\s+global ' -- plugin/bin/adr-next plugin/lib/record.py`: eleven lines, all in record.py, one
  import and ten cached functions; nine are functions of text alone, and the tenth, `_object_format` (record.py:3749-3760),
  caches what git said about a repository, a failed lookup included. No `global` statement in either file.
- **Did not hold, launch:** the importer ran `python3` from `PATH`, so it could answer where the gate's own
  `#!/usr/bin/env python3` line, or a missing executable bit, would have stopped the single call.
- **Did not hold, output limit:** Node's `spawnSync` applies its default 1 MiB `maxBuffer` to stdout and stderr together; the
  attempt checked each stream.
- **Did not hold, time limit:** a timer inside the Python process cannot reproduce the 60 s kill of a process
  (work-next.mjs:83), and it raced the answer it was timing.

The lesson of the refused process pool for `adr-lint` (v3.8.77, 2026-11-22) applies too: `_object_format` keeping a failed
lookup is load-bearing, because a gate makes one decision from two lookups; asking it early, clearing it inside a decision, or
caching answers only each produced a fail-open there.

The repository is frozen (docs/BACKLOG.md §473), and ADR-141 to ADR-144 were withdrawn for that reason. This record is written
at the owner's request of 2026-11-24, as the measured speed-ups of v3.8.77 to v3.8.80 were.

The class is a caller that starts one `adr-next` process per corpus member in a loop. Enumerated 2026-11-24 with
`git grep -n -E "(gate|spawn|run|_run_gate)\(\[?(path\.join\(BIN, )?['\"]adr-next['\"]" -- plugin scripts core`: four sites.
plugin/scripts/work-next.mjs:83 is this record's subject (reached twice per run, :513 and :518). The other three are left as
they are, each for its own reason (Out of Scope): plugin/scripts/corpus-probe.mjs:403, scripts/backlog-record-sweep.mjs:136
and plugin/bin/qh-mcp:293.

## Existing Primitives Audit

- **Corpus mode** (`adr-next <corpus root> --json`, `corpus_records` / `report_corpus`, plugin/bin/adr-next:1497-1651,
  ADR-034): already answers many task directories in one process. **Not reused**: it chooses the directories itself (the
  root's children, one level, on disk), while `work-next` asks only about the tracked task directories of governing, unfrozen
  records (work-next.mjs:55-67); its per-record answer lacks `owner_unreadable`, `owner_unreadable_because` and
  `owner_missing` (adr-next:1596-1598 against :1833-1837); and it gives one exit code for the corpus (:1617), where
  `work-next` needs could-not-run per directory (ADR-046).
- **`main()` of `adr-next`** (adr-next:1727-1888): **reused unchanged**, called once per query, so there is one reading of a
  task directory and not two.
- **`spawnGate`** (plugin/scripts/ready-lines.mjs:92-111): **reused** to start the batch, with the gate's own path, exactly as
  the single call is started: the script itself off Windows (shebang and executable bit), the resolved interpreter on Windows.
- **The stream setup** at adr-next:60-62 (`utf-8`, `errors="replace"`): **reused** as the encoding of each query's capture.
- The refused importer's tests (a process-per-directory oracle over the fixture corpora, a git stand-in whose first
  object-format answer fails, a spawn counter): **reshaped** for T1 and T2. `next_batch.py` itself is not used.

## Decision

1. **The batch is a mode of the gate.** `adr-next --batch` takes no other argument. It reads the bytes of standard input to
   their end before the first query and decodes them as strict UTF-8 JSON, whatever encoding the environment names: an array
   of directory strings. It answers each as `adr-next <dir> --json` does, in the order given, by handing the single call's
   arguments to `main()`; those arguments are not looked at again for `--batch`. `--version` wins over everything, as today
   (ADR-031). Any other argument beside `--batch`, `--help` and `-h` included, and input that is not such an array, is
   could-not-run: usage on stderr, exit 1, no frame.
2. **One frame per answered query.** After each query the gate writes one line of JSON to its real stdout and flushes it:
   `{"i": <index>, "dir": <the string as given>, "status": <integer>, "warned": <boolean>, "stdout": <text>, "stderr": <text>}`.
   For the query it sets `sys.argv` to the single call's, replaces `sys.stdout` and `sys.stderr` with in-memory text streams
   of the encoding at adr-next:60-62, and calls `main()`. The status is its return value, or the code of a `SystemExit` that
   is an integer or `None` (`None` is 0, as Python exits). Such a query gets its frame whatever the status, and the batch goes
   on. Any other end (an exception that is not `SystemExit`, a `SystemExit` with any other code) ends the batch with no frame
   for that query or any after it, exit 1. The process exits 0 only when every query got a frame.
3. **Each query starts as a new process would.** Before each query, and never inside one, the gate clears every `lru_cache`
   of record.py, `_object_format` and the nine keyed by text and parser flags alike. Inside a query `_object_format` behaves
   exactly as today, a kept failure included, so the two lookups of one decision still agree; across queries nothing is
   remembered. The text caches are cleared too because a cached answer skips what computing it prints: `ast.parse`
   (record.py:1837, under the cache at :1833) can emit warnings, and a later query that hit the cache would print less than its
   own process. Python also shows a warning once per location in a process, so each query runs with warnings recorded, not
   printed, and a query that raised any warning sets `warned`. Every child the gate and record.py start captures its output
   (`git grep -n 'subprocess\.run' -- plugin/bin/adr-next plugin/lib/record.py`, five sites, all `capture_output=True`), and
   with input read to its end first no child can read a later query.
4. **`work-next` launches the batch as it launches the single call.** `batchedAnswers(dirs, root, { run = spawnGate, ms })`
   in work-next.mjs calls `run(path.join(BIN, 'adr-next'), ['--batch'], …)` with the single call's `cwd`, `encoding` and
   `windowsHide`, the directories as JSON `input`, a budget of `ms` for the whole batch and a `maxBuffer` of 256 MiB. `ms` is
   30 s, half the single call's 60 s, unless `QUALITY_HARNESS_BATCH_MS` names another, which exists so a test sets the budget
   it depends on (CLAUDE.md §7). There is no timer in the gate. Only directories whose string is well-formed UTF-16 are sent
   (`isWellFormed()`); any other is asked singly, since JSON and an argument vector carry a lone surrogate differently. With
   fewer than two directories to send it asks nothing.
5. **An answer is taken only well inside the single call's limits.** Lines of the batch's stdout that end in a newline are
   read in order, whatever the process's own end was (exit, timeout, overflow, no stdout at all). A line is a frame when it
   is a JSON object whose `i` is the next index, whose `dir` is that query's own string, whose `status` is an integer, whose
   `warned` is a boolean and whose `stdout` and `stderr` are strings. Reading stops at the first line that is not a frame;
   nothing from it on is taken. A frame is taken as its directory's answer only when `status` is 0 or 3, `warned` is false,
   and the bytes of its `stdout` and `stderr` plus everything the batch process wrote to its own stderr, counted as UTF-8 with
   every newline as two bytes, stay under 512 KiB (half of Node's 1 MiB); a frame not taken does not stop the reading. A taken
   frame goes through the same lines as a single call's result (work-next.mjs:87-98), so it can itself make its directory
   UNPROVEN, by an unreadable or duplicate task. Every directory without a taken frame is asked by the single call, unchanged.
   So a could-not-run (ADR-046), a large or warned answer, a hang, a gate without the flag (exit 1) and a batch that could not
   start are decided by the single call that decides them today.
6. **An injected `spawn` is never batched.** `readinessFrom` batches only when its `spawn` is the default `spawnGate`; the
   tests that inject a per-directory stand-in (`git grep -l 'readinessFrom(' -- tests`) keep seeing one call per directory.
   The batch has its own seam, `run`, in `batchedAnswers`.
7. **It ships only on a measured gain.** T3 measures this design, not the importer: the median of five warm `work-next --json`
   runs on this repository with T2 must be at most 0.70 of the median without it, with equal stdout. Otherwise T2 is reverted
   and this record is withdrawn.

What is claimed equal, under what assumptions, and what is not. `readinessFrom` reads a call's `error`, `status` and
`JSON.parse(stdout)`, nothing else. The claim: for every directory, a taken frame's status and parsed stdout equal what the
single call returns when it observes the same files and the same git answers. It assumes an install that does not change
while `work-next` runs (the batch imports the gate and record.py once; a process per directory imports them each time) and a
Python start that does not depend on the arguments (a site hook reading `sys.argv` sees `--batch`). Three differences are
accepted and are not equalities:

- **Time.** 30 s is a budget for the batch, not a model of the single call: a query answered inside it is taken although its
  own process, start and exit included, was never timed against 60 s.
- **The deciding observation moves.** A directory the batch did not answer is decided by a single call made later than
  today's. A fault present only while the batch ran is not reported; one that appears afterwards is. Either way a whole
  single call decides, as it does today.
- **Output outside the captures.** What Python prints at start or exit is counted against every frame but belongs to none.

The direction of the first is an answer the gate did compute in place of a could-not-look; the other two leave the verdict
with the single call.

Amended at execution, 2026-11-24, after the Codex review of T1 and T2 (commits 1a8449230 and 324a4cc16, REQUEST CHANGES, each
finding reproduced or checked against source):

- **A third assumption: nothing but the gate writes to the gate's output.** The reviewer installed interpreter hooks (an audit
  hook, a wrapped import loader) that print to standard output during a query. In a process of its own that makes the answer
  unparseable; in a batch the hook's text falls outside the frame, or the module it hooks is already loaded for the second
  query, and the frame parses. Such an interpreter already makes single calls unparseable today, and the batch does not
  defend against it: lazily imported modules stay loaded across queries, and that is visible only to such a hook.
- **A fourth assumption, accepted by the owner 2026-11-24: the environment is not at the system's size limit.** A single
  call carries its directory as an argument and the batch does not, so with an environment within one directory name of the
  limit on arguments and environment (about 1 MiB on macOS) the batch starts where the single calls cannot, and work-next
  then says ready where a process per directory says could-not-run (reproduced on macOS by the reviewer). A first fix
  padded the batch's environment; the scoped verification (commit 9076a9a90, REQUEST CHANGES) showed it was worse, since
  the gate's own git children inherit the padding and can fail where a single call's do not, and it was removed. Under
  this record's stop rule nothing further was patched: the limit is stated, not defended against. That verification
  closed the encoding and budget findings, and confirmed that the hook findings have no reproduction without an
  interpreter hook. Left as it is, a cost and not a wrong answer: under `PYTHONLEGACYWINDOWSFSENCODING` the encoding
  guard below sends names outside ASCII to the single call although Windows would carry them alike.
- **A name outside ASCII is answered in a batch only under a UTF-8 filesystem encoding**, which Windows always has. Elsewhere
  a process of its own decodes its argument's bytes into another name than the text a frame's query carries, so the gate ends
  the batch at such a name and it is asked singly. This narrows Decision 1.
- **A budget the environment names is taken only up to what a timeout can be** (2 147 483 647 ms); a larger one made
  `spawnSync` throw before any directory was asked.
- Two exits stay conservative and are not equalities: `sys.exit(True)` ends the batch, and a status above 255 is carried
  as it is; neither is 0 or 3, so the single call decides both.

What would make it fail, and whether that can be produced: yes, by fault injection, which is what found every defect of the
first attempt while the healthy-corpus comparison stayed identical. T1 and T2 inject a git whose first object-format answer
fails, a locked test file whose parse warns, an answer at the byte bound, a hang, a missing executable bit, an empty `PATH`, a
last frame without its newline, a task id that makes `main()` raise, and a gate that does not know the flag; each has a
single-call oracle beside it.

## Alternatives Considered

- **A separate importer that loads the gate and calls `main()`** (the first attempt). Refused by two Codex reviews,
  2026-11-24: launch, combined output limit and time limit each differed from the single call (Context). Its shared-state
  audit and its measurement are kept as evidence.
- **Exact equality at the limits**, by a timer in the gate and a byte count equal to Node's. Rejected: the review showed the
  timer races, and Node's limit counts both streams in a way a second implementation would have to track release by release.
  A margin with a fallback needs neither.
- **This record's own first draft**, read cold by Codex (gpt-6.2-sol, high effort, 2026-11-24): REQUEST CHANGES, each finding
  checked against source and taken. It cleared `_object_format` only, and a cached parse skipped the warnings its own process
  prints (reproduced at over 1 MiB with `PYTHONWARNINGS=always`), so Decision 3 now clears every cache and marks a warned
  query. It read stdin as text (an environment encoding changed a directory name) and sent any string (a lone surrogate
  names a different path as JSON than as an argument): Decisions 1 and 4. It left the frame's shape and the batch's own
  stderr out of the bound: Decision 5. It called 30 s a model of the single call and did not say that a later single call
  decides: the three accepted differences. The reviewer confirmed the shared-state audit, the five capturing children, the
  integer helper exits and the conservative byte count. No second review was run on this text.
- **Raised as blocking and kept in a narrower form: clearing `_object_format`.** The v3.8.77 review refused a `cache_clear`
  that ran inside one gate decision. Here it runs only between queries, where a new process starts empty; T1's test with a
  failing first lookup shows both halves (the failure stays within its query, and the next query asks again).
- **Corpus mode.** Rejected: a different directory set, fewer fields, one exit code (Existing Primitives Audit).
- **A pool of gate processes** (the shape refused for `adr-lint` in v3.8.77). Rejected: it pays several starts, and it shares
  a parent's state with workers, which is where that attempt failed open.
- **A long-lived `adr-next` server.** Rejected: a process that outlives the question holds what it read, and a gate that
  answers from memory is the defect ADR-005 names.
- **`os.fork` per query after one import.** Rejected: not available on Windows, which CI blocks on.
- **Leave it.** Rejected only if T3 measures the gain; Decision 7 keeps this alternative open until then.

## Component / Boundary Impact

None — internal to `plugin/bin/adr-next` (which task is ready) and `plugin/scripts/work-next.mjs` (where a repository is in
the lifecycle); no module is added, and docs/architecture.md's rows for both (:64, :70) stay true.

## Wiring & Contract Changes

| Surface | Change | Producer | Consumer(s) |
|---------|--------|----------|-------------|
| `adr-next --batch` (CLI flag, stdin, one frame line per query) | new | plugin/bin/adr-next (T1) | plugin/scripts/work-next.mjs (T2) |
| `adr-next` usage text (adr-next:4-45) and the known-flag tuple (:1731) | `--batch` named in both | T1 | a person reading `--help`; `reject_unknown_flags` |
| `adr-next <dir> --json`, `--all`, corpus mode, exit codes 0 / 3 / 1 | unchanged | — | every existing caller |
| `batchedAnswers(dirs, root, { run, ms })` | new export of work-next.mjs | T2 | `readinessFrom`; tests |
| `work-next` stdout, stderr, `--json` and exit code | unchanged | — | skills, hooks, people |
| plugin/bin/adr-next.cmd | unchanged; it forwards every argument | — | Windows shells |
| `adr_next` MCP tool (plugin/bin/qh-mcp:286-293) | unchanged; it passes `--all` and `--json` only | — | MCP clients |
| tests/mutations/plugin/bin/adr-next.json, tests/mutations/plugin/scripts/work-next.mjs.json | new entries | T1, T2 | `scripts/mutate.mjs` |

## Inter-task Contracts

| Contract | Producing task | Consuming task(s) | Breaking? |
|----------|----------------|-------------------|-----------|
| `adr-next --batch` and its frame | T1 | T2 | No — new |
| `batchedAnswers` in `readinessFrom` | T2 | T3 | No — new |

## Implementation

See `ADR-145-adr-next-answers-a-batch/tasks/README.md`.

## Consequences

- **Positive:** `work-next`, which the `work` skill runs first every time, stops paying one interpreter start per task
  directory; the first attempt's figure on this repository was 13.0 s to 6.3 s (2026-11-24, 4427b1af), and T3 takes this
  design's own.
- **Negative:** a second way to reach `main()`, with a frame format two files must agree on. When the batch answers nothing
  (it hangs at its first query), `work-next` takes up to 30 s longer than today before the single calls run. A slow query
  inside the batch delays every later frame, so on a machine where the whole corpus takes more than 30 s the tail is asked
  singly and part of the gain is lost.
- **Neutral:** this changes a reader, so CLAUDE.md §18 applies before a release that carries it: the outside run, after the
  landing's mutation jobs are green. An installed copy whose gate predates the flag answers exit 1 and is asked singly.

## Out of Scope

- plugin/scripts/corpus-probe.mjs:403, which starts `adr-next` per task directory (permanent: boundary: the probe times each reader call as its own process and reports that time, so a batch would change what it measures)
- scripts/backlog-record-sweep.mjs:136, per record (permanent: boundary: repository tooling that never ships, an advisory sweep run by hand)
- plugin/bin/qh-mcp:293, one process per MCP request (permanent: boundary: a request names one path; there is no loop to batch)
- Corpus mode keeping one `_object_format` answer across the records of one invocation (permanent: boundary: one invocation is one observation there since ADR-034, and this record does not change it)
- A batch mode for any other gate, and the process pool refused for `adr-lint` (permanent: boundary: this record decides `adr-next` only)
- The statusline's snapshot reads and the PreToolUse corpus reuse shipped in v3.8.80 (permanent: boundary: other code paths, measured apart)

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| State other than `_object_format` crosses queries: a cache or module global added to adr-next or record.py later | Med | High | T1's oracle test runs every fixture corpus in order, reversed and twice; T1 adds a test that fails when the enumeration command of Context finds a cached function or `global` beyond the reviewed list |
| A frame is taken that the single call would not have produced in time | Low | Low | Only when one machine is more than twice as slow for the single call than for the batch; the answer taken is one the gate computed (Decision 5) |
| The two frame readers drift | Low | Med | One writer and one reader, each with catalogue mutants; a malformed or misordered frame stops the reading, and the rest are asked singly |
| Windows newline or code-page differences change what is parsed | Low | Med | Captures use the gate's own declared encoding; only status and parsed JSON are compared; CI's Windows job runs both test files |
| The timing test of the hang depends on a slow runner | Med | Low | The test passes its own `ms` to `batchedAnswers` (CLAUDE.md §7) |
| A reviewer finds a third limit that differs | Med | Med | The stop rule of CLAUDE.md §12 holds: one review, one scoped verification; a fail-open found then withdraws the record, as it did the first attempt |

## Rollback

Revert T2's commit: `work-next` asks per directory again, and `adr-next --batch` stays as a flag nothing calls, or is removed
by reverting T1 as well. No file, ledger or schema is written by either task, so nothing needs migrating.

## Follow-ups

- [ ] Ask for the outside run (CLAUDE.md §18) before the release that carries T2.
