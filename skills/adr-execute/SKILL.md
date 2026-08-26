---
name: adr-execute
description: Execute an active Accepted ADR task-by-task, and record the tool-written evidence that a task is finished. Use when the user invokes `/quality-harness:adr-execute` with an active ADR path, asks to implement an accepted current decision, or asks to mark a task done, tick off a task, update a task's status, or record that work passed — marking done without `adr-verify` is the one thing this skill exists to prevent. Do not execute archived, superseded, withdrawn, Proposed, or Draft records; retire records with `adr-retire` instead.
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
**Adopting these gates on a corpus that predates them.** A repository whose records were written
before this harness will light up on every one of them, and a gate that fails on day one over
history nobody is changing is a gate people turn off. Put `{"strictFrom": "ADR-0012"}` in
`.quality-harness.json` at the repository root and records numbered below the cutoff report their
content findings as advice instead of blocking — the shape of history is allowed to be imperfect.
The evidence chain is never demoted: a task marked `done` still needs a tool-written exit-0
Verification Log entry whatever its number, because that is the claim the corpus exists to make.
The verdict line says `[strictFrom] …` whenever it is in effect, so a demoted PASS is never
mistaken for a clean one.

- Run `adr-lint <adr.md>` and paste the run. It mechanically checks template conformance,
  shell-command acceptance, TDD step 1, README↔task-file consistency, and spec coverage. A finding
  here is nearly always a real gap in the plan — the cheapest moment to close it is before the first
  task. If you execute past one, name which finding and why it does not apply.
- When the ADR's `Spec:` header names a file: run `spec-verify --spec <spec>` and paste the run
  (every covered fact should have a committed, collectable test). A fact with no test is a fact
  nothing will prove; say which, rather than discovering it at acceptance.
- Work is represented as either ≤3 inline tasks or a sibling `tasks/` directory with task files and `README.md`.
- Wave table in `tasks/README.md` is required only for >5 tasks; 4–5 tasks use flat sequential order.

**Ask what already governs the code you are about to touch.** Run `node
${CLAUDE_PLUGIN_ROOT}/scripts/adr-context.mjs <path>...` for the task's Affected Files. It answers
from this repository's own corpus — which accepted decisions are authoritative over those paths, and
which superseded or withdrawn records decided against something there. The second half is the one
that saves work: re-proposing an approach the team already killed is invisible from the code alone.
It is read-only, cannot fail, and says nothing when the corpus has nothing to say. The same answer
arrives unprompted the first time you edit a governed file in a session.

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

Append-only and dated, in [references/lessons.md](references/lessons.md) — each one earned a real
debug cycle. **Read it before writing an acceptance fence or judging whether a task is done.** It is
where the gate-that-cannot-fail cases live: a filter that matches nothing exiting 0, a mutant nobody
killed, a `done` row with no exit-0 entry behind it.

It is a supporting file rather than part of this skill's body on purpose. It was 155 of this file's
396 lines, all of it accumulated history, loaded in full on every invocation — and the behavioural
evals showed this skill's instructions were not reaching the model. Guidance at word 3,000 competes
with everything above it.

## Completion Report

When all tasks are done:

1. If the ADR has a spec: run `spec-verify --implemented <spec>` — every
   @implemented fact's test must pass. Paste the run.
2. Provide a short summary: tasks completed, commits created, the spec-verify run, and any manual
   sign-offs or remaining user actions required before merge.
