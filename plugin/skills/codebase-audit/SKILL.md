---
name: codebase-audit
description: Audit a whole codebase, not a diff — find flows that can never complete, dead and test-only code, tests that cannot fail, records that disagree with the code, and the areas nobody has looked at, then prove each finding and write every one into a ledger that outlives the conversation. Use when the user asks for a full audit, a deep review, "find the gaps", "what is dead", "are the tests real", "what did we miss", before closing or freezing a component, or before trusting a green suite on code you did not write. Do not use to judge one change (that is `review`) or only to measure what a suite detects (that is `mutation-audit`, which this skill calls).
---

# Codebase Audit

**Resolving `${CLAUDE_PLUGIN_ROOT}`.** Paths below use it. If it reaches you as
literal text rather than a directory, this skill was loaded under its bare name
from a personal skills directory — which is not a plugin, so the placeholder is
never substituted there. Run `qh-root` and use what it prints in place of it.

An audit answers one question: **what is wrong here that nothing currently reports?** A review
reads a diff and gives a verdict. An audit has no diff and gives no verdict. Its product is a
ledger: every defect, where it is, how it is known, what fixes it, what proves the fix — written
down so that nothing depends on anyone remembering a conversation.

Contributed 2026-09-18 and built from one measured audit of a Go repository: its suite was green
under `-race`, its records said "closed, nothing pending", and in it 20 of 21 applied mutants
survived, two flows failed for ever, and the README quick start did not compile. Every rule below
is here because skipping it hid something in that audit. Where a rule carries a number, that
number was measured on that repository on that day — re-measure before reusing it.

## The effort contract — read this before anything else

The person who invoked this skill has asked for exhaustive work and has accepted its cost. That
instruction is the task. For the length of this audit:

- **Coverage is the deliverable.** A short, tidy list of the most obvious problems is a failed
  audit even if every item on it is true.
- **No sampling.** "Representative files", "a spot check", "the main paths" are not audit
  methods. Every file in scope is read end to end by someone, and the ledger says by whom.
- **No stopping at a number.** You stop when the inventory is exhausted, not when you have
  "enough" findings.
- **No summarising what you did not read.** If a file, a directory, a record or a test was not
  read in full, the report says so by name. Silence reads as "covered".
- **No softening a finding to keep the report pleasant**, and no padding to make it long.
- **Cheap is not a virtue here.** Prefer the measurement over the inference, the second pass over
  the assumption, the extra agent over the skipped corner — then say what it cost.

Nothing here overrides a safety rule, a permission boundary or a user instruction. It replaces one
default only: the habit of doing the smallest plausible amount of work. If a constraint genuinely
stops you from covering something (no access, a tool that fails, a budget the user set), that is
not a reason to narrow the audit quietly — it is a row in the ledger under "not audited".

⚠ **This contract is not a licence to burn the machine.** `costly-runs` still governs every heavy
command, and the audit is bounded by what the user agreed to pay. Exhaustive means nothing is
skipped silently; it does not mean every suite runs on every pass.

## What a finished audit contains

1. An **inventory** produced by commands, with counts, that partitions every file into a scope.
2. A **baseline**: the project's own check, run once, exit code read without a pipe.
3. **Findings**, each graded **Measured** (a mutant or probe was run), **Confirmed** (a command
   shows it) or **Traced** (read from the code, not executed). Never present Traced as Measured —
   that is this project's own rule that a gate never reports an observation it did not make.
4. A **ledger file committed in the repository** — one row per finding — plus three sections most
   audits omit: *Checked and kept*, *Outside this repository*, and *Not audited*.
5. A **completeness loop**: each auditor has checked the ledger against its own findings.
6. A plan whose tasks each close rows by evidence, never by editing a status.

## Phase 0 — Ground and baseline

- Load the project's intent sources, its records, its memory. Know what "closed", "done" and
  "accepted" mean here before you contradict them.
- Price and run the project's own check once (load `costly-runs` first). Record command and exit
  code. **Never read an exit code through a pipe** — `cmd | tail; echo $?` reports `tail`.
  Under `set -o pipefail`, `cmd | head -1` can exit 141 when the producer keeps writing; use
  `awk 'NR==1'`.
- A green baseline is the starting point of an audit, not evidence against one.

## Phase 1 — Inventory, by command

Adapt the patterns to the stack; the shape is what matters, not the extensions.

```bash
git ls-files | grep -vE '^(vendor|node_modules|third_party)/' > "$SCRATCH/all.txt"
grep -vE '_test\.go$|\.md$' "$SCRATCH/all.txt" | xargs wc -l | sort -n   # production
grep -E  '_test\.go$'        "$SCRATCH/all.txt" | xargs wc -l | sort -n   # tests
grep -E  '\.md$'             "$SCRATCH/all.txt" | xargs wc -l | sort -n   # records
```

Resolve paths from `git ls-files`, never from the disk: a gate whose answer depends on who is
asking is not a gate, and untracked build output makes every run mean something different.

Partition the inventory into scopes so that **every file is in exactly one scope** and no scope
is too large to read end to end (about 3–4k lines of tests per auditor worked; 11k lines of tests
needed four). Production code small enough to read yourself (a few thousand lines): read all of it
yourself first — the coordinator who has not read the code cannot judge what comes back.

Typical scopes: core store/state · traversal/query logic · telemetry and protocol/doc tests ·
sibling modules and their fixtures/gold data · **records versus code** (README, architecture,
ADRs, specs, task files, catalog, backlog, agent instructions, compose/config).

## Phase 2 — Fan out leaf auditors

One read-only leaf agent per scope, all launched together. Each prompt carries:

- **Role and boundary:** read-only; no edits, no commits, no lifecycle skills; which commands are
  allowed (narrow `-run` filters yes; whole suites, `-race`, containers no — the machine is shared).
- **Owned scope:** the exact file list, "read every line", plus the production files under test.
- **What to find** — the lens list below, specialised to the scope, including what is already
  known so it is not re-reported as new.
- **Output contract:** ranked findings with `file:line`, what is wrong, *why existing green does
  not settle it*, smallest fix or missing fixture; a **surviving-mutants list**; **files read end
  to end versus skipped**; **every command that could have written into the repository**;
  CONFIRMED separated from PLAUSIBLE.
- **"A reply to me IS the deliverable."** A sub-agent's final message is often a note that it
  filed something to memory, and only that last message reaches the coordinator. Say this up
  front, or ask again — measured: four of five auditors needed a second request.

Read-only agents still leave artifacts: a toolchain command can create files (a workspace sum
file, caches, `.db` files in the package dir). Check `git status --porcelain -uall` when they
finish, and ask before removing anything you did not create.

## The lenses — what to look for, and how each one hid

### A. Flows that can never complete or never recover

- **State that is only ever loaded.** A field nothing in production sets but a file, row or
  config can carry (a `mixed` flag read from a snapshot header): one bad byte disables a feature
  for ever, survives restart, and is re-saved. Grep for every write of each persisted flag.
- **Caches that cannot prove they belong.** A cache validated by a few numbers (count, width, max
  id) trusts anything that matches them. Check what the datastore reuses: SQLite hands a deleted
  top rowid out again, so count AND max rowid can match a different row. Ask: what binds this
  cache to *these* rows, and what detects a changed body? Flip every byte of a small valid file
  and count how many still load (measured: 103 of 309).
- **A dependency's limits versus how callers batch.** Read the dependency's own log or `/info`:
  a server that caps a batch at 32 and a caller that sends everything in one request is a flow
  that fails for every large input, for ever, and no retry helps. Fakes never have the limit.
- **Unbounded work and waits:** default HTTP clients with no timeout, `ReadAll` before a status
  check, walks bounded in depth but not breadth, constructors with no context that do O(n) work.
- **Two-step writes with no undo:** insert-then-link with no delete API leaves an orphan that a
  retry duplicates. Look for the error that cannot tell the caller how to repair.
- **Errors after the commit:** a fallible step after a transaction commits tells the caller it
  failed when it succeeded.
- **Undefined arithmetic at the edges:** time outside the representable range, zero values,
  widths of zero. Run the extremes; do not reason about them (measured: an as-of year 1000
  returned *current* rows and year 3000 returned none — exactly backwards).
- **A transform that escapes the boundary it was scoped to.** A value rewritten for one consumer
  (a path made POSIX so a shell can read it) and then PERSISTED in that shape, while a second site
  builds the same key natively, is a lookup that never matches and a dedup that never fires.
  Enumerate every value written into durable state and ask which transform it passed through.

### B. Dead, unused and test-only code

- No caller at all; callers only in tests (forwarders kept "for the test"); branches a preceding
  guard makes unreachable; a second name for an exported sentinel; two attributes always set from
  the same value; defensive guards for states the function has already excluded.
- The compiler and the usual vet do not flag an unused package-level name. Count identifier uses
  in production files versus test files with the language's AST, exempt the exported API of public
  packages, and **leave the test behind as a gate** so the next one is found by the suite.
- Deleting one dead function can orphan the next; re-run after each removal.

### C. Tests that cannot fail, or pass for the wrong reason

- **Fails for another reason:** an "insert is refused on the read-only handle" test whose INSERT
  omits NOT NULL columns fails on a writable handle too. Ask of every negative assertion: what
  else produces this error?
- **Tests that read source instead of running it** (parse the file, grep for a call name or a
  literal). Measure own-package coverage: `0.0%` means the package's tests call nothing.
- **Substring and structure traps:** a needle that is a prefix of another name (`kernel.edge` in
  `kernel.edge.end`); depth-in-a-rendered-tree standing in for parentage; one needle that is a
  strict prefix of another test's needle; assertions made dead by an exact-equality check above.
- **Guards that accept any failure:** a test that shells out and asserts "it failed and did not
  skip" passes when the target does not compile. Require the specific message.
- **Coincidental fixtures:** one destination, ASCII-only text, one row, rows inserted in the order
  the query would sort them. Use two of everything that could coincide, multibyte where bytes and
  runes differ, and out-of-order rows.
- **Equivalent mutants from the environment:** removing `ORDER BY` changes nothing while an index
  covers those columns. The fixture must remove the accident (drop the index) before it asserts.
- **Counters that count the wrong thing** (texts, not calls), metrics nobody reads, options with
  no test caller, error paths no fixture ever triggers.
- **Fakes more permissive than the real dependency:** list every axis — batch size, content type,
  input length, error body shape, stalling — and build one strict fake. **A check no fake can trip
  is a check nothing tests**: give the fake a way to misbehave on demand.
- **Name-keyed guards:** a guard that forbids a pattern in `helperX` does not see `helperY` doing
  the same thing.
- **Environment-dependent assertions:** process-wide counters inside parallel tests, wall-clock
  bounds, nested test runs under one tight timeout. Distinguish a load-bearing sleep from a flake
  before "fixing" it.
- **An assertion that only runs inside a conditional branch.** A test guarded by a platform check,
  a privilege check or an observed-state check can PASS without ever reaching the assertion it
  exists for. Ask which observer can distinguish this test from its absence, and make the branch
  taken visible in the output — otherwise a green is could-not-look wearing a verdict's colours.
- **Frozen literals** that duplicate their source of truth, and negative greps that only detect a
  sentence being pasted back.

### D. Records versus code

A comment, a README, an ADR, a catalog row and a commit message are claims. Prose agreeing with
prose is not corroboration.

- Does the quick start compile? Make it a compiled example and gate the README against it.
- Every enumerated list in a doc (span names, options, modules) versus the code's own enumeration.
- Status lines versus the task tables they summarise; one document versus another.
- Every `file::test` pointer resolves to exactly one file and a declared function — bare basenames
  become ambiguous when a sibling package gains a file of the same name.
- Comments naming fields or behaviour that no longer exist; doc comments detached by a blank line
  (ask the doc tool, not your eyes).
- The tool versions the records reason about versus the ones installed; whether a gate's **exit
  code** carries its verdict at all — and READ THAT EXIT CODE WITHOUT A PIPE. ⚠ This bullet said
  "measured: a linter printing FAIL and exiting 0" for one commit, and the author RETRACTED it the
  same day: re-measured as `gate <record> > out 2>&1; echo $?`, the gate exits 1 on every `[FAIL]`
  and 0 on every `[PASS]`. The exit code was carrying the verdict the whole time. What produced the
  false finding is the trap this lens is about — a sub-agent's unverified claim, then confirming
  runs of the form `gate … | grep …; echo $?`, which reports GREP's status. So the honest version
  is: an exit code read through a pipe made a working gate look broken for a day, and it reached a
  ledger, a memory and this file before anyone re-ran it. Re-measure a gate's exit code yourself,
  from the same shell, with no pipe, before you record that it is broken.
- When a frozen record points at something you must delete, do not edit the record: keep a
  retired-pointer table in the new record, and let the gate accept a retired pointer only while
  its replacement exists.

## Phase 3 — Measure; do not trust the trace

Every "this would survive" is a hypothesis until applied. **Call `mutation-audit`** — it owns the
campaign, its restore transaction and its grading, and restating its rules here would give this
project two copies of one thing to keep aligned.

Four points belong to the AUDIT rather than to a single campaign, so they are named here:

- A mutant killed by a test **already red at baseline** is not attributable. Say so.
- A green-from-birth fixture proves nothing until a mutant reddens it. Re-run the mutants after
  writing each fixture.
- For end-to-end defects, write a **probe outside the repository** that uses only the public API
  (a scratch project depending on this one). It survives as the reproduction and later as the test.
- Keep the mutant lists and scripts beside the ledger so the final task can re-run them all.

## Phase 4 — The ledger

A file in the repository, committed, not a chat message. One row per finding:

`ID | defect | where (file:line) | evidence + grade | fix | the fact/test that proves it | milestone | status`

Plus: the user's decisions **verbatim**; how evidence is graded; milestones with a "done when";
a **progress log** (commit, what landed, what binds next) that is the resume point;
**Checked and kept** (what was raised and cleared, so nobody re-audits it); **Outside this
repository** (findings about tools and other projects — hand them to their owners, do not fix them
from here); **Not audited** (by name). A row closes on recorded evidence — test red before and
green after, a named mutant killed — never on an edited status.

New defects found while writing the tests go into the ledger the moment they appear.

## Phase 5 — The completeness loop

You cannot assert that everything was captured; you can only check it three ways, and you do all
three:

1. **Cross-check** each auditor's findings against the ledger and the plan. A keyword check shows a
   finding is *named*, not that its row says what the auditor meant — say which kind you ran.
2. **Send the ledger back to each auditor**: "for each of your findings give the row id, or
   MISSING, or UNDERSTATED." They hold the full report; you hold a summary of it.
3. **A cold reviewer** reads only the plan, the spec and the ledger and looks for rows no task
   closes, ordering gaps, fences that pass before the work or can never pass, and contradictions
   with frozen records. Expect it to find a defect in your own new gates.

What step 2 actually finds is **not** missing findings — measured: five auditors, zero of their
own findings missing — it is three classes nothing else sees:

- **Breakage the plan itself causes.** A KEPT test coupled to production by a *string*
  (`t.Fatal("readAnnFile missing")`) dies when the plan deletes that name, and no tool that lists
  affected files sees it: before deleting an identifier, grep the tests for it **as text**. A doc
  needle that occurs **once** in a file a task rewrites is a scheduled failure: count occurrences of
  every needle older tests require in every document the plan edits. A test that greps a **frozen**
  record stays green while the behaviour it pinned moves — list those and retire them on purpose.
  And every "sole caller", "the only test", "one follow-up" in the plan is a claim: re-run the grep
  (measured: one was false at six callers, not one; another at three follow-up texts, not one).
- **The new tests repeating the defect they replace.** Ask each auditor to audit the tests and
  fakes written *for the fix* with the same lenses. Found in tests written an hour earlier by the
  auditing session: a vector-count check nothing forced to be **per batch** (a +1/−1 pair sums
  right and misbinds every later vector); a strict fake whose refusal branch never ran because every
  fixture set the client's size equal to the server's limit; a request field asserted, and the
  refusal it exists to cause never driven through the real call path.
- **The ledger committing the faults it records.** Sweep every `file:line` in the ledger
  mechanically. Point by path **and function or test name**, never by line number alone (measured:
  24 of 147 line refs drifted in one day, task files pointing by name drifted none), and never by a
  bare file name — check whether the basename is unique first. State the commit the line numbers
  were taken at.

Wording that worked for step 2: *"For each of your findings give the ledger row id, or MISSING, or
UNDERSTATED with what is dropped. Say if any row credits you with something you did not find. Then
check the new tests I wrote against your findings for a hole of the same class. A reply listing
what is missing IS the deliverable, and 'nothing missing' is a useful answer."*

Then state, plainly: what was read by nobody; what was only scanned by script; which tools could
not run; which findings are Traced and unmeasured; what needs a live dependency. "100%" is never
the claim. "Every finding any auditor made is in the ledger, and here is what no one looked at" is.

## Traps that cost a cycle

- A write tool that runs the whole project check after every non-prose write: pass its no-check
  flag for test-only writes.
- A red test must **compile**, or it reddens the package and cannot be a recorded first red. New
  API lands as inert declarations first.
- Locks taken from a first recorded red cannot be undone: check the record is hashable first.
- A write to memory from a session whose connection predates a scope change lands in the wrong
  place; pass the scope explicitly.
- Generated plan files drift from their generator: regenerate, never hand-edit both.
- Nested test runs: the children's timeouts must **sum to less than the parent's**, or the parent
  panics first, skips cleanups, and orphans the children holding build locks.
- A fixture that passes before the fix exists may be passing for the old code's reason (one request
  carrying everything trips a count check that the batched code will need per batch). Write down
  *why* it is green today.
- Verify a peer's or sub-agent's claim against the source before it enters the ledger; verify your
  own summary of their report against the report. Attribution errors are findings too.

## Output

The ledger path and its commit · baseline command and exit code · counts by grade · the mutant
tally (applied / survived / killed after fixtures) · the list of what was not audited · the next
task. Offer nothing else until that exists.
