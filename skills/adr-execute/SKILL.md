---
name: adr-execute
description: Execute an active Accepted ADR task-by-task with test and verification gates. Use when the user invokes `/quality-harness:adr-execute` with an active ADR path or asks to implement an accepted current decision. Do not execute archived, superseded, withdrawn, Proposed, or Draft records; retire records with `adr-retire` instead.
---

# ADR Execute

Implement an accepted ADR task-by-task. Use the harness's built-in todo/task tracking (TodoWrite where available, otherwise TaskCreate/TaskUpdate) instead of writing heavy markdown artifacts to disk. Keep execution lean and direct; the executable gates (`adr-lint`, `spec-verify`, task acceptance commands) carry the rigor.

## Preconditions

Check these before starting. They are what a plan needs to be executable, not a barrier: run them,
read what they say, and fix what is real. If something cannot be fixed here — the decision is wrong,
the plan contradicts the code, a section is missing that only the author can supply — say so plainly
with the output, and say what you propose instead. Executing anyway is a decision you are allowed to
make; making it silently is not.

- ADR exists in the active corpus, is linked by its active catalog, and `Status` is `Accepted`.
  A path under an archive whose `README.md` says `Lifecycle: Frozen historical ADR records` is
  historical evidence, never an executable plan. If new implementation is required, write a new
  active ADR that links the archived decision.
- Run `adr-lint <adr.md>` and paste the run. It mechanically checks template conformance,
  shell-command acceptance, TDD step 1, README↔task-file consistency, and spec coverage. A finding
  here is nearly always a real gap in the plan — the cheapest moment to close it is before the first
  task. If you execute past one, name which finding and why it does not apply.
- When the ADR's `Spec:` header names a file: run `spec-verify --spec <spec>` and paste the run
  (every covered fact should have a committed, collectable test). A fact with no test is a fact
  nothing will prove; say which, rather than discovering it at acceptance.
- Work is represented as either ≤3 inline tasks or a sibling `tasks/` directory with task files and `README.md`.
- Wave table in `tasks/README.md` is required only for >5 tasks; 4–5 tasks use flat sequential order.

**Recall before you start.** `am_search` for lessons about this stage ("adr execution", "gate that
cannot fail", the subsystem you are about to touch). This skill is the stable process; the palace is
where the process learns, and a lesson filed by any session last week applies to this one without
anybody editing this file. Skip only if the memory tools are absent, and say so.

**Scout every sibling task before executing any of them — not just the one you are starting.** A
task file is a snapshot of what its author believed when they wrote it, and an accepted ADR can be
invalidated by a *different* accepted ADR that shipped first. Read every remaining task's Ordered
Steps and Invariants against the code as it stands now, and look specifically for:

- a step that assumes behaviour a sibling ADR has since changed (this is the common one, and it
  surfaces only when two ADRs are executed in the same area);
- a `Consumes` naming a contract that no longer exists;
- an Affected Files table that predates a refactor and cites the wrong file or a dead line number;
- a step requiring real data — a corpus, a live service, recorded traffic — while the Acceptance
  fence is hermetic. **That combination is invisible to the gate**: the command passes while the
  task's actual requirement goes unmet. Say so before starting rather than discovering it at
  sign-off.

Executing a task written against superseded behaviour is how a contradiction gets into the code with
every gate green.

## State Management (todo tracking)

Do not write `.adr-execute/` JSON or Markdown artifacts. Track the entire execution state with the
harness's todo/task tool (TodoWrite where available, otherwise TaskCreate/TaskUpdate).

**Exception — the task file's `## Verification Log` section:** it is written by
`adr-verify <task.md>`, never by hand. The tool runs the Acceptance fence, appends
the entry (date · git-sha · exit code · displayed command · full-fence SHA-256) itself, and exits
with the command's code. The digest binds multi-line evidence to every command in the fence;
hand-pasted entries are the fabrication hole and `adr-lint` rejects any entry off-grammar. A
completed task with an empty Verification Log violates the global anti-pattern list; this is the
one on-disk write the no-artifacts rule does not cover.

1. Run `adr-next <ADR.md> --all` for the authoritative state. It computes readiness from the task
   files themselves — `Depends-on` plus the `Consumes`/`Produces` contract edges, the same edges
   `adr-lint` builds its DAG from — and counts a task done only when its Verification Log holds an
   exit-0 entry whose `acceptance-sha256` matches its current Acceptance fence. `tasks/README.md` is
   a derived index: read it for the wave grouping, but where it disagrees with `adr-next`, the task
   files win and the README must be regenerated.
2. Create a Todo list where each task is an item. Prefix items with their wave (e.g., `[Wave 1] T1: <Goal>`).
   Take the next item from `adr-next <ADR.md>`, which also prints that task's Acceptance command and
   the exact `adr-verify` invocation that records it.

## Execution Pipeline

Execute tasks wave by wave. For each task in the current wave:

1. **Research & Plan**: Quickly read the task spec and affected files. Resolve ambiguities.
2. **Red**: Confirm the failing test(s) for the task's `Covers:` IDs exist and fail (Ordered Steps
   step 1). No production code before a red test — superpowers:test-driven-development governs here.
   Record the red run with `adr-verify <task.md>` — the expected non-zero entry is
   the TDD-red evidence and stays in the log.
3. **Implement**: Make the necessary code edits directly. Do not commit yet.

   Two checks belong here, and neither is optional:

   **Prove each new test can fail — with `adr-verify --mutant`, not by hand.**

   ```
   adr-verify <task.md> --mutant <file> --from <text> --to <text> --why <what this kills>
   ```

   Break the mechanism the test is about — delete the wiring, invert the condition, alias the new
   function to the old one — and let the tool run it. The tool refuses a `--from` that is absent or
   non-unique, refuses a mutant that only changes comments, syntax-checks the mutated file, restores
   it in a `finally`, and grades the run: only `killed` is evidence. `survived` means the fence
   passed with the mechanism broken; `inconclusive` means it failed without a failing assertion
   (nothing ran, or it did not build) — a skipped mutant wearing a kill's exit code.

   Do this through the tool even when you are sure. Everything it refuses is something that was
   done by hand, believed, and wrong: an edit that silently did not apply, an assertion matching a
   config file's comments rather than its keys, a mutant that did not compile and printed
   `FAIL <pkg> [build failed]` with no `--- FAIL` line for a failure-counter to see.

   What it cannot judge is whether the mutant was WELL CHOSEN — a trivially-unique irrelevant line
   satisfies it. That part is still yours.

   **Prove the new thing is SELECTED, not merely present.** The characteristic defect is a
   capability that is finished, tested and unreachable: an arm nothing registers, a producer nothing
   calls, a config field nothing reads, a branch no fixture exercises. Unit tests cannot catch it by
   construction — they call the function directly, which is precisely what the caller is failing to
   do. Ask of every new symbol: what line selects this, and what fails if that line is deleted? If
   nothing fails, the check to write is about the selection, not the component.
4. **Validate**: Run `adr-verify <task.md>` (it runs the Acceptance fence and
   appends the log entry itself). Iterate until it exits 0. For human-observed acceptance, record
   the sign-off with `adr-verify <task.md> --human "<who observed what>"`. If the task `Covers:`
   spec facts, flip those facts' tags `@spec` → `@implemented` in the spec file. Only then may the
   README status flip to `done` — `adr-lint` rejects `done` without a matching exit-0 entry, and
   (for acceptance recorded from 2026-08-22) without a `mutant killed` entry in the Mutation Log.
5. **Review & Sign-off**: Run `git diff` to review your own changes. Ensure no regressions or out-of-scope changes.
6. **Commit**: Once validated and reviewed, commit the change with message format `{adr-id}: {task-id} — {task-goal}`. Mark the Todo complete.

### Subagent escape hatches (Claude Code only)

Prefer inline execution. Use subagents only when they save more parent context than they cost:

- Task touches >5 files or requires reading large files: dispatch one `general-purpose` subagent to research + implement + validate, return a short summary.
- Final review on a large diff: dispatch a `general-purpose` subagent carrying the `review` skill's rubric on the diff instead of reviewing inline.
- Small tasks: stay inline.

### Subagent Discipline

When dispatching a subagent, the prompt must enforce:

- **No preamble.** No "I'll analyze...", no plan recap, no warm-up.
- **No restating the task.** The coordinator already has it.
- **Read budget.** Read only the task's `Affected Files` plus what they directly import. Cap at 10 files. If more is needed, return `blocked: needs <paths>`.
- **Search before read.** Use `Grep`/`Glob` to locate symbols. Do not read whole large files to find one definition.
- **Reference, don't quote.** Return `path:line` and short snippets only. Never paste full files.
- **Structured return** (only this shape):
  - `result`: `done` | `blocked` | `failed`
  - `files_changed`: list of paths
  - `acceptance`: command + exit code + last 10 lines of output
  - `notes`: ≤5 bullets of deltas the coordinator cannot see in the diff
- **One stage per dispatch.** Do not chain research + implement + review in one subagent.
- **Output cap:** 400 words. Over budget = truncate and mark `blocked`.
- **No speculation.** If ambiguous, return `blocked` with the question.

## Ordering Rules

Behavior depends on task count:

- **≤5 tasks**: execute sequentially in the order listed. No wave logic needed.
- **>5 tasks**: execute by wave from `tasks/README.md`. Tasks in the same wave may run in parallel; do not start the next wave until the current wave is fully committed.

**Contract coupling check (mandatory at any size)**: scan every task's `Produces` against siblings' `Consumes`. If task A produces a contract task B consumes, implement and commit A before B — even if they're listed in the same wave or adjacent in sequence. `adr-lint` already enforces this ordering for machine-visible edges (T-id refs, backticked tokens) at the split gate; this execute-time scan is the safety net for prose-only contract references the lint cannot see.

## Failure Rules

- **Never commit while a gate is red, and make sure you would notice.** A gate whose result is
  printed but not branched on is decoration. The specific trap, hit twice in one session: running
  the gate inside a `for` loop and chaining the commit with `&&` — the loop's exit status is the
  last iteration's `echo`, so a printed FAIL sails straight into a commit. Gate the commit on a
  variable the loop sets, or run the gate as the command the `&&` actually tests.
- **Changing a gate invalidates the evidence taken under the old one.** After editing an acceptance
  command, `adr-lint` will refuse every task whose logged run or killed mutant proved the
  *previous* command.
  The tool-recorded full-fence digest catches changes below line one too. That refusal is correct.
  Re-run `adr-verify` on a clean tree and re-record; never edit the log.
  Note that `adr-verify` dirties the tree by writing its own entry, so verifying several tasks in
  one pass marks all but the first dirty — commit between runs if the sha matters.
- If validation fails, read the error, fix the code, and rerun. Max 3 loops per task.
- If a task lacks files, proof, tests, invariants, risks, or stop condition, stop before editing and ask for a better plan.
- If a task remains blocked or ambiguous after 3 loops, stop, leave its Todo in progress, and ask the user for help.

## Pause / Continuation Gate

Before compaction, session end, or a blocked return, make the existing ADR chain sufficient for a
cold restart — do not create a parallel plan or handoff file:

- for split tasks, reconcile `tasks/README.md`, task status, and any affected Goal, Invariants, and
  Risks with the worktree and verification logs; for inline tasks, which have no tool-written log,
  reconcile the same fields with the worktree and the latest acceptance result;
- ensure every piece of context needed to continue is reachable from the ADR's existing `Spec:`,
  Cross-references, or task files;
- emit one restart pointer containing `/quality-harness:adr-execute <adr-path>`, the current task, and the blocker or
  next action.

## Close the loop — this skill has to grow

A pipeline whose process never changes is a pipeline that learns nothing. Before the completion
report, for each defect this execution hit that a rule could have prevented:

1. **File it in the palace** (`am_add_drawer`, `wing_craft`, room `gotchas` or `decisions`) as a
   rule plus the mechanism that made it invisible — not a narrative of what happened. The test for
   whether it belongs in `wing_craft`: would the sentence still be true in a repository sharing no
   code with this one?
2. **If it is a rule for THIS stage, append it to the Lessons section below**, dated, one or two
   sentences. That is what makes the skill mutate instead of the same defect being rediscovered by
   whoever executes next.
3. **If a gate could have caught it mechanically, change the gate** (`adr-lint`,
   `adr-verify`) rather than only writing prose. Prose is re-interpreted by every model version; an
   exit code is not. Before shipping a gate change, run it against the state it exists to reject and
   confirm it goes red, and against every existing corpus to confirm it does not cry wolf — a gate
   with false alarms is one people learn to skip, and then it protects nothing.

State explicitly in the completion report either what was added, or that nothing new was learned.
"Nothing new" is a legitimate and common answer; silence is not.

## Lessons

Append-only, dated. Each earned a real debug cycle.

- **2026-08-20 — an acceptance filter that matches nothing exits 0.** `go test -run
  <no match>`, `phpunit --filter <no match>` and `cargo test <no match>` all print a cheerful
  summary and exit 0, so every TDD task passed its own gate the moment it was authored, with none of
  the work done. `adr-verify` now records such a run as a failure. When you write an acceptance
  fence, ask what it does when the tests do not exist yet — if the answer is "passes", it is not a
  gate.
- **2026-08-20 — a Tests table is a list beside the truth.** Tasks marked `done` across five
  projects named tests that were never written; the acceptance filter had matched some *other*
  existing test sharing its prefix. `adr-lint` now reads the real files.
- **2026-08-20 — amending one section of a document leaves the rest lying.** After a mid-execution
  amendment, the Invariants section still asserted the exact opposite of what shipped, in the same
  file as the note explaining the change. Sweep the whole document — Produces, Invariants, Risks,
  the Tests table — not just the section you were looking at.
- **2026-08-20 — a ruling on a small question can move a pre-registered criterion two documents
  away.** Deciding which eval arms to register silently halved another ADR's irreversible deletion
  trigger. When a decision changes what exists, grep every accepted ADR for what it consumed.

- **2026-08-20 — reading a gate's exit code through a pipe reports the PIPE's status.** `adr-verify
  <file> | tail -20; echo $?` printed 0 while the gate had actually exited 2, and that false reading
  was written into a committed ADR as "the gate silently passes". Run gates bare, or redirect to a
  file and read `$?` — never through `| tail`/`| grep`. Before concluding a gate is broken,
  reproduce its verdict with nothing between it and you.
- **2026-08-20 — prettier rewrote adr-verify's Verification Log and adr-lint then rejected it.** The
  husky format-on-commit pass escaped the dirty-tree marker (`sha*` → `sha\*`), breaking the exact
  grammar that distinguishes a tool-written entry from a hand-typed one. When a gate owns a file,
  add its path to every formatter's ignore list (here `.prettierignore`); otherwise the formatter
  that runs on commit always wins.
- **2026-08-20 — enumerate the shapes the CREATION path can produce before writing tests.** A feature
  passed every gate — an executable spec gate running all 43 bound tests, adr-lint, 1192 passing
  tests, every mechanism mutation-checked — and an independent review then found 11 P1. Every one
  was a record shape the system's own creation contract permits and no test covered: two slots, two
  education legs, an unchanged pay-now add-on, a roomless order, the real expired-then-reactivate
  sequence. Gates verify the tests you wrote pass; mutation proves a test binds to the mechanism it
  names. Neither can invent the test you never wrote. For each shape decide: test it, or refuse it
  with a named error — refusing loudly is a product decision a human can review, mishandling is a
  shortened paid booking discovered on the day.
- **2026-08-20 — re-run the review over your review fixes.** Lap 2 found 5 more P1, three of them
  introduced by lap 1's own repairs: a stamp moved earlier to kill drift stranded a 24 h hold on the
  failure path; a service widened to accept a second state left the button's visibility gate on the
  first; a deliberately superseded payment order was never made terminal, so a late callback could
  apply at a stale amount or double-capture. When a flow supersedes a resource, the old one must be
  terminal or refused at the point of use.
- **2026-08-20 — a `tests > 0` guard does not save a fence that also names already-green suites.**
  The known hole is "a filter matching nothing exits 0", and the usual cure is to assert the run
  scored at least one test. That cure is blind to the opposite shape: a filter naming the new class
  AND the regression suites is satisfied by the regression suites alone, truthfully reporting 13
  passing tests while the new class does not exist. `adr-verify`'s `scored_nothing()` cannot catch
  it either — it asks about the COUNT of tests, never their IDENTITY. Run the new unit alone first,
  then the regression suites, as two chained commands. A candidate gate ("a task's first
  Verification Log entry must be non-zero") was measured against the corpus and rejected: 41 task
  files across five repos already open with exit 0, and it conflates a missing red run with a
  broken fence.
- **2026-08-20 — a template is not compiled until it is rendered, and no gate renders it.** An
  ADR shipped a mail view that could not compile AT ALL; `php -l`, the formatter and 1219 green
  tests all missed it, because `Mail::fake()`/`assertQueued` prove a message was queued, never that
  it can be built, and the send sat inside a side-effect guard that swallowed the throw. Any lazily
  compiled artifact — Blade/Jinja/ERB views, migrations only run on deploy, config only parsed on
  boot — needs a gate that compiles every one of them, not a test of the few with fixtures.
- **2026-08-20 — ask of each fix from the previous review lap: which test would go red if I
  reverted it?** Of a 28-finding review, one fix (a timezone on a date picker) had no test at all in
  either the regression file or the suite it belonged to, so the bug it repaired was free to return.
  A review lap's fixes deserve the same mutation check as the original code.
- **2026-08-22 — nothing in the chain ever read the ADR's own Status.** Every gate reads the TASK
  files, so ADR-088 was authored `Proposed`, executed, verified with exit-0 adr-verify entries,
  committed and shipped to production with its record still saying the decision had not been taken.
  The precondition was stated in prose at the top of this skill and never bound to a check.
  `adr-lint` now refuses a `done` task under Proposed/Draft/Rejected. When a precondition lives in
  prose, ask which executable check reads it — if none does, it is a habit, not a gate.
- **2026-08-20 — inline tasks cannot produce a tool-written Verification Log.** `adr-verify` reads a
  `## Acceptance` section, while the ADR template's inline-task style uses bold `**Acceptance**`. An
  ADR with ≤3 inline tasks therefore has no machine-checkable completion evidence. If completion
  needs to be provable, split even a 2-task ADR into `tasks/` files.

### 2026-08-21 — a structural assertion over a config file must anchor on the KEY, not the words

Two tests over `bitbucket-pipelines.yml` asserted a step does/does not carry a setting, by substring.
Both were wrong in the same way: the steps' own COMMENTS discuss the setting. `# NO \`trigger: manual\`.
Bitbucket rejects…` contains `trigger: manual`, and two steps explain in prose why they pin
`run-as-user: 0` — so a mutant that DELETED the real key still passed, and the test was decoration
after being declared mutation-checked.

Assert `/^\s+key:\s*value\s*$/m`, never `assertStringContains('key: value')`. A `#` comment cannot
match `^\s+key:`, which is what separates the setting from the discussion of the setting.

The reason it stayed invisible for a round: **a mutation harness whose edit silently no-ops reports a
clean pass.** Python's `str.replace` returns the original string when the pattern is absent, so
`s.replace(old,new)` without `assert s.count(old)==1` prints "mutant applied" for a file that never
changed. Assert the edit LANDED, then assert the test went red — two independent ways a mutant proves
nothing, and they stack.

### 2026-08-21 — `done` is not the only status whose Tests table must be true

`adr-lint`'s Tests-table checks iterated `done_task_ids()`, so a task marked `blocked` on something
outside the repo — a root-owned allow-list, a vendor account — was skipped entirely. But its
acceptance fence was GREEN, which means the tests it names ran. A renamed test left a stale row in a
blocked task's table and a full lint pass reported PASS: the "list kept beside the truth" failure,
surviving inside the gate built to catch it.

Fixed mechanically: `evidenced_task_ids()` returns tasks that are `done` OR carry an exit-0
adr-verify entry, and both table checks iterate it. When a gate keys off a human-written status
field, ask which OTHER states have already produced the evidence the check is about.



### 2026-08-21 — the pipeline proved commands exit 0 and never proved one could exit non-zero

Stated once, because it explains a whole class: every gate here verifies a command succeeded. Nothing
verified a command can FAIL. So a test bound to nothing passes exactly like a test bound to the
mechanism, and the only artifact that would have caught it — the task template's `## Mutants` table —
was hand-filled. That is the same fabrication hole the Verification Log was built to close, sitting
one section further down, and `check_tests_can_fail`'s own docstring named it ("Only a compiling
mutant proves the latter, which is why the task template asks for one separately").

Closed mechanically rather than with another paragraph. `adr-verify --mutant <file> --from --to
--why` applies the edit (refusing one that is absent, non-unique, or comment-only), syntax-checks the
result, runs the task's own Acceptance fence, restores the file in a `finally`, and writes
`- DATE · sha · mutant <killed|survived|inconclusive> · exit N · \`file\` · why · acceptance-sha256:<digest>` into a
`## Mutation Log`. `adr-lint` enforces that grammar and requires ≥1 `killed` entry for any task whose
acceptance was recorded on or after the cutover `2026-08-22`.

The cutover is the part worth copying. Requiring evidence retroactively would have turned four
corpora red at once, and a gate that does that is a gate people switch off — so the rule binds only
to work that CAN comply. Verified: zero new alarms across all four corpora, and three gate-mutants
(pull the cutover back; strip the killed entry leaving only `survived`; hand-type an entry) each go
red.


### 2026-08-21 — asserting a CONFIGURED PROPERTY is not asserting a BEHAVIOUR

A task promised "signing in lands on the reservations list". The framework offered
`Panel::homeUrl()`; it was set, a test asserted `getHomeUrl()` returned the right URL, the test
passed, and sign-in still landed on the dashboard. `getHomeUrl()` is read in exactly two places in
that framework version — the sidebar and topbar Blade views — so it sets where the LOGO links. The
redirect came from `LoginResponse::toResponse()` → `redirect()->intended(Filament::getUrl())`.

Two rules, and the second is the general one:

- **A setter whose NAME implies a behaviour is worth one grep for who READS it.**
  `grep -rn "getTheThing" vendor/ | grep -v "function getTheThing"`. If the only hits are view
  templates, you configured a link, not a behaviour.
- **`assertSame($expected, $obj->getX())` proves the setter stored the value and nothing more.**
  Drive the real flow instead — fill the form, call the action, assert the redirect — then mutate
  the mechanism to prove the test binds to it.

Worth recording precisely because the ADR in question existed to fix a capability that "passed
every test it had while rendering nowhere the user looked", and reproduced that defect one task
later, in the same document. Knowing a failure mode does not protect you from it; running the mutant
does. Config-only assertions are invisible to every gate here — such a test genuinely CAN fail, just
not for the reason anyone cares about — so this one is caught by an independent reviewer or not at
all.

## Completion Report

When all tasks are done:

1. If the ADR has a spec: run `spec-verify --implemented <spec>` — every
   @implemented fact's test must pass. Paste the run.
2. Provide a short summary: tasks completed, commits created, the spec-verify run, and any manual
   sign-offs or remaining user actions required before merge.
