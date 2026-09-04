# Working in this repository

This is the source of `quality-harness`, a Claude Code plugin. It is also the thing the plugin is
about: a development lifecycle whose claims are backed by executable evidence rather than by prose.
So the bar here is higher than the code alone would justify — a gate that cannot fail, or a record
that claims more than happened, is not a bug in this project, it is the defect this project exists
to demonstrate the absence of.

Everything below was paid for by a real debug cycle. Where a rule names a date, that is when it bit.

---

## 1. The repository is not the plugin

`plugin/` is the product. `.claude-plugin/marketplace.json` declares `"source": "./plugin"`, so a
user downloads that directory and nothing else — 663 K rather than the repository's 1,619 K
(measured 2026-08-28). Everything above `plugin/` is the work that produces it and never ships.

| Stays at the repository root | Lives under `plugin/` |
|---|---|
| `tests/`, `docs/`, `.github/`, `README.md`, `LICENSE` | `plugin/bin/`, `plugin/skills/`, `plugin/templates/`, `plugin/workflows/`, `plugin/hooks/`, `plugin/evals/` |
| `.claude-plugin/marketplace.json` | `plugin/.claude-plugin/plugin.json` |
| `scripts/selftest.sh`, `scripts/coverage.sh`, `scripts/mutate.mjs` | everything else, under `plugin/scripts/` |

Those three scripts stay because they read `tests/`, which does not ship. The twelve that moved on
2026-08-28 resolve their own root as `dirname(dirname(import.meta.url))` and are correct wherever
they sit; so does everything added there since.

**That sentence and the table row above it used to carry the same number, and only one of them
could stay true.** "The twelve that moved" is dated, so it is a fact and cannot rot. "The other
twelve, under `plugin/scripts/`" described the tree as it is, and the directory reached thirteen
without anything noticing — measured 2026-09-04 with `git ls-files plugin/scripts/ | wc -l`. The
rule this file follows from here: **a number in this document is written in the past tense and
anchored to a date or a sha, or it is not written at all.** A count of the current tree belongs in
the command that computes it, which is why the selftest line above no longer claims a test count.

**There are now two roots and they are different directories.** In the tests, `repoRoot` is the
repository and `root` is the plugin. Getting one wrong produces a check that measures the wrong tree
and stays green from a checkout, which is the whole risk class ADR-008 named. `tests/package.test.mjs::what
ships is the plugin and nothing else` fails if the manifest and the tree disagree, in either
direction.

**When files move, four things move with them and every one fails silently:**

1. `.gitignore` patterns (a rule that stops matching does not warn — this repository published a
   personal home path for two days that way).
2. `.gitattributes` (`plugin/bin/* text eol=lf` is what makes the Windows job see LF gates).
3. `tests/mutations.json` `file:` paths.
4. **Every `Governs:` header in `docs/adr/`.** On 2026-08-28 the move un-governed the entire corpus:
   seven records named paths that no longer existed, `adr-context` answered "none governs", and
   `adr-lint` passed throughout because `Governs:` is checked for shape and never against the tree.
   BACKLOG §45 is that gate, and it closed 2026-08-29 with ADR-011: `adr-lint` and `adr-state`
   now resolve every declared path against `git ls-files` and advise when one matches nothing.

---

## 2. Run the checks the way they are meant to be run

```bash
bash scripts/selftest.sh          # the repository-owned gate. Exit 0 or it did not pass.
bash scripts/coverage.sh          # JS + Python floors; --report to read the numbers without enforcing
node scripts/mutate.mjs           # the full campaign, ~37 min. --case '<substring>' for one.
python3 plugin/bin/adr-lint <adr> # a record's own gate
```

**Three sweeps ask questions no gate asks, and nothing runs them for you.** Each reports and never
blocks, each prints a count that is a place to look rather than a defect count, and each is cheap
enough to run before a release.

```bash
node scripts/flag-claim-sweep.mjs      # a gate's flag surface changed; does the prose still hold?
node scripts/backlog-claim-sweep.mjs   # a commit CLAIMS a backlog section; did it edit that section?
node scripts/orphan-sweep.mjs          # a definition nothing reaches
```

`flag-claim-sweep` closes one corner of the gap that `Governs:` cannot see. A record's header names
CODE paths, so ADR-011 can tell you a declared path matches nothing — it cannot tell you a decision
changed a gate and the SKILL.md describing that gate kept asserting the old behaviour. That is how
`plugin/skills/operating/SKILL.md` went on saying the gates had no `--version` across the commit
that gave all eleven of them one (`d0f6c24`, when there were eleven). **It catches the FLAG class
only**: a stale COUNT
(`docs/mcp.md`'s "Five tools" when there were seven), a stale VOCABULARY (`adr-next`'s three states
when it had grown a fourth) and a missing CONVENTION are all still found by reading, and the header
in the script says so rather than letting the tool look wider than it is.

**Never pipe the gate.** `bash scripts/selftest.sh | tail` and `... || true` both hide the exit
code, and a check whose result nothing reads is decoration.

**Name the working-tree path for a gate, never the bare name.** A bare `adr-lint` resolves to
something INSTALLED — in this repository that is the last RELEASE, not your edit — and which
installed thing it is depends on the machine (the table below). It produced a false PASS three times
on 2026-08-28, once nearly into a recorded Verification Log. Write `python3 plugin/bin/adr-lint`,
`node plugin/scripts/lifecycle.mjs`.

This sentence used to say a bare `adr-lint` *is* a forwarder. That was an assertion about one
machine: on the Windows box that filed issue #2 (2026-09-01) `~/.claude/bin` was on no `PATH` at all
and the bare name reached the plugin cache. The habit it recommends was right; the reason it gave
was measured somewhere else.

**A bare gate name resolves through one of TWO mechanisms, and they fail in opposite directions.**
Measured 2026-08-29 across two sessions on this machine:

| on `PATH` | resolves to | goes stale when |
|---|---|---|
| `~/.claude/bin/<gate>` — a forwarder generated by `standalone-link.mjs` | the newest INSTALLED version, computed at call time | never — but it is never your working tree either |
| `~/.claude/plugins/cache/quality-harness/quality-harness/<version>/bin` — injected by the plugin loader | the version pinned when the SESSION STARTED | on `claude plugin update`; rewritten only by `/reload-plugins` |

Whichever sits earlier in `PATH` wins, and a machine may have both, one, or NEITHER — measured
2026-09-01 on a Windows 11 box that had only the second. The second is the one with no
tell: `claude plugin update` moves the cache and prints "Restart to apply changes", but a session
that keeps invoking gates by bare name goes on running the OLD binary — no warning, no version
mismatch, `which` is the only way to see it. A peer session reported findings against a release
already fixed for exactly this reason, and the run looked entirely normal.

Both traps are removed by the same habit: **name the working-tree path.**

**Install the hooks once per clone.** `git config core.hooksPath .githooks` — one command, and
without it `.githooks/pre-commit` protects nobody, which is worth saying plainly rather than
assuming a committed file is an installed one.

It refuses a commit taken while `scripts/unasserted.mjs` or `scripts/mutate.mjs` has the tree
deliberately broken. Those tools replace one `errors.append(...)` with `pass` at a time to ask
whether anything asserts it, and a `git add -A` in that window commits a SHIPPED GATE with a finding
removed. It reached `main` twice on 2026-09-02 in commits whose subjects said "docs", and it is
invisible where anyone would look: the journal is gitignored so `git status` reads normally, and a
neutered gate is valid Python that reports one thing less.

**Never run a mutation tool and edit the tree at the same time.** All three of that day's
self-inflicted defects trace to it. The hook is the last line; not doing it is the first.

**Never commit while a gate is red, and make sure you would notice.** Do not chain a commit after a
test in one command; a `for` loop's exit status is its last iteration's `echo`, so a printed FAIL
sails into a commit. This has happened here more than once. Run the gate, read it, then commit.

**Write commit messages with `git commit -F -` and a quoted heredoc**, never `-m "..."`. A backtick
in a double-quoted message is command substitution: on 2026-08-28 a shell silently deleted the phrase
`def enforcement_pointers(` from a commit message explaining a defect, and the commit still
succeeded. Backticks are how this project writes about code, so this is not a rare case.

---

## 3. Gates instruct; they never block

A gate here advises and never prevents a user's or a skill's attempt. In `plugin/bin/adr-lint`,
`errors.advise(...)` is advisory and `errors.append(...)` is blocking — moving something between
them is a real behavioural change, not a formatting choice.

The reason is not politeness. A blocked agent produces a user who cannot tell what to do next, which
is worse than not having the plugin at all. Say what is wrong and let the work proceed.

Corollary: **a gate must never report an observation it did not make.** A filter that matched
nothing is "I could not look", not "the thing is absent"; a subprocess that failed to start is not a
failing check; a parse failure is not a content finding. Three instances of this shipped in one day
(ADR-005). If a check cannot determine something, it says so — `UNRUN`, `PARTIAL`, `UNPROVEN` — and
never borrows the vocabulary of a verdict.

---

## 4. Evidence is tool-written or it is not evidence

`## Verification Log` and `## Mutation Log` in a task file are written by `adr-verify`, never by
hand. It runs the Acceptance fence itself, appends the date, git sha, exit code, displayed command
and a SHA-256 of the whole fence, and exits with the command's code. `adr-lint` rejects any entry
off-grammar and refuses a `done` row without a matching exit-0 entry.

```bash
python3 plugin/bin/adr-verify <task.md>
python3 plugin/bin/adr-verify <task.md> --mutant <file> --from <text> --to <text> --why <what this kills>
```

- A `done` row on a **Proposed** record is refused, correctly: it claims an unaccepted decision was
  executed. Leave the row `pending` with the reason and let the evidence stand.
- Changing an Acceptance fence invalidates every entry taken under the old one. That refusal is
  correct. Re-run on a clean tree; never edit a log.
- `adr-verify` dirties the tree by writing its own entry, so verifying several tasks in one pass
  marks all but the first dirty.

**A GREEN mutation is a finding about the test, never a reason to pick an easier mutant.** On
2026-08-28 a mutation on a containment guard came back GREEN because the assertion went through a
caller where a *second* guard caught the same input — the test was proving something other than what
it named. Assert the mechanism, not a downstream effect something else also covers.

**A fix reported from outside gets its regression at the outermost callable boundary.** Verified only
by its own new assertions, a fix has been tested at the FUNCTION, not at the entry point the report
came in through — and on 2026-08-29 that shipped twice in one hour: a BDD matcher that worked when
called directly and was unreachable in production, because the caller passed `code_only()` output
that had already deleted the name it searched for. The assertions were correct and green throughout.
Write the regression on a fixture in the reporter's language, through the same call the report came
through, or you have tested the patch instead of the bug. (BACKLOG §57, and the rule is the reporting
session's.)

**Coverage cannot see a vacuous assertion.** `assert.deepEqual(uncovered(...), [])` against a
subject mutated to return `[]` passes at 100% line and branch coverage. Every check that returns a
"clean" answer must be shown capable of returning a dirty one, in the same test.

---

## 5. Audit the class, not the instance

A fix that lands is one member of a set. Before recording anything done:

1. Name the class — the property that made this wrong, stated so it can be searched for.
2. Enumerate the members **with a command**, not from memory.
3. Put the command and what it returned into the record. A sweep that found nothing is worth
   recording; a sweep nobody ran must not read like one.

Siblings you leave are new tasks, named in the record.

---

## 6. Nothing personal reaches GitHub

This is a public repository and it publishes its own corpus.

- `tests/package.test.mjs::nothing tracked in this repository names a personal filesystem path`
  reads everything `git ls-files` returns and must stay green.
- **Never write an absolute home path** into a commit message, an ADR, a backlog entry, a comment or
  a test fixture. Describe it instead, or assemble it at runtime the way the fixtures do
  (`"/".join(("", "home", "alice"))`). BACKLOG §42 tripped on exactly this, and so did a fixture
  written the same day to test the redaction.
- `adr-verify` redacts this machine's home from anything it writes into a task file — both separator
  spellings, case-insensitively where the filesystem is. Do not rely on it as the only line.
- The results directory under `plugin/evals/` is gitignored and stays that way. Do not commit eval
  results, transcripts, or anything derived from another repository's corpus.
- `git status --short` before every push, and read it.

---

## 7. Three platforms, and paths are where they differ

**This project ships to Windows, macOS and Linux, and CI blocks on all three.** You develop on one
of them. Every rule below was paid for by a defect that was invisible on the developer's machine and
red on somebody else's — and the single largest class, five times over, is **a path literal that was
secretly an assertion about the operating system.**

### The five that actually happened

| what was written | why it was wrong | where it broke |
|---|---|---|
| `docs\/adr\/` in a test regex | `/` is not the separator everywhere | Windows |
| a mutation whose `from` ended in `\n` | the file had no `text eol=lf` attribute, so it was checked out CRLF and matched **0 times** | Windows |
| `PATH: '/nonexistent'` in a test env | means nothing on Windows; the interpreter never started and the test died on `JSON.parse(undefined)` rather than on its property | Windows |
| `".." in pointer.split("/")` | a traversal spelled `..\dir\file` reached neither branch, so a guard **passed while doing nothing** | Windows |
| `block.replace(str(Path.home()), "~")` | `Path.home()` returns `C:\Users\Name` while a Node stack trace in the same output prints forward slashes — so the redaction missed on the one platform CI runs and a laptop cannot | Windows |

### Paths and traversal — the rules

- **Normalize both separators before ANY structural test on a path.** `split("/")` is blind to
  `..\dir`. Convert first, then split; a containment or traversal guard that skips this is a guard
  that reports safety it never checked.
- **Reject a drive prefix as well as a leading slash.** `C:\x`, `C:/x` and `/x` are all absolute;
  a check for one of the three is a check for none of them.
- **Never write a separator into a literal you will compare.** Build with `path.join` / `Path`, and
  where a test needs the repository-relative form, derive it (`relative(a, b).split(sep).join('/')`)
  rather than typing it.
- **Case matters where the filesystem says it does.** Windows and macOS are case-insensitive by
  default; Linux is not. A path comparison that must hold on all three is case-insensitive on the
  first two and exact on the third — make it a parameter, not an assumption.
- **`/tmp` is a symlink to `/private/tmp` on macOS.** A temp path you created and a temp path the OS
  hands back can compare unequal. Resolve before comparing.

### Line endings are a path problem in disguise

`.gitattributes` decides what git puts on disk. Any file whose CONTENT you match across a line
boundary needs `text eol=lf`, or the match silently finds nothing on Windows only. The gates need it
because the Windows job executes them; `.gitignore` and `.gitattributes` need it because mutations
match across their lines. **A test asserts this by asking `git check-attr`**, never by reading the
file — what matters is the answer git gives for the path.

### Executing things

- The gates are `#!/usr/bin/env python3` scripts. **Windows cannot exec them**: a direct spawn returns
  status `null`, which is not an error and not a failure. Spawn through the interpreter.
- Git Bash resolution must exclude the `System32` WSL stub and the WindowsApps launcher — both are
  named `bash` and neither is one. Both are filtered today, at both sites, by one pattern:
  `[\\/](?:system32|windowsapps)[\\/]?$` in `resolve_bash()` (`plugin/bin/adr-verify`) and in
  `resolveBashExecutable` (`plugin/scripts/run-shell-hook.mjs`). **What makes that sentence usable
  is not this file — it is `tests/gates.test.mjs` and `tests/lifecycle.test.mjs`, which drive each
  resolver through its `(platform, env, exists)` seam on the PATH §91 measured and assert the real
  `ProgramFiles\Git` answer comes back.** Each also asserts a `WindowsAppsX` directory is NOT
  filtered, so the guard is shown capable of the other answer rather than of matching everything.
  Re-run those, not this paragraph.

  **This entry has now been wrong in both directions, which is the part to keep.** It first read
  "`resolve_bash()` does this; do not reimplement it" — false for the WindowsApps half from the day
  it was written, and measured false on Windows 11 on 2026-08-30 (BACKLOG §91). It was then
  rewritten to say the hole was open, and went stale the other way when §91 landed: on 2026-09-01 a
  session read it as a live defect and re-derived the whole thing before executing the resolvers and
  finding them already correct. A stale instruction costs a session either way — it either stops
  people re-checking something broken, or sends them fixing something already fixed. **A rule here
  that asserts a guard handles a case is a hypothesis until something executes it**, which is why
  the sentence above names the tests instead of asking to be believed.
- **`PATH` differs in separator (`:` vs `;`), in resolution (`which` vs `where`), and in what an
  invalid value does.** To test "the tool is absent", empty `PATH` rather than pointing it somewhere
  that only looks absent on your machine.
- A Git for Windows checkout has **no POSIX permission bits** — `statSync` reports `0644` for
  everything. What actually ships is the mode in git's index, so ask `git ls-files -s`.

### The rule that makes all of this testable

**Make the platform a parameter.** `resolve_bash(platform=…)`, `redact_home(block, home=…,
platform=…)`, `leaves_the_tree(pointer)` normalizing both separators on every platform — each one
turns "reachable only on Windows" into "reachable from anywhere". A Windows-only branch with no
injectable seam is a branch with no test, and you will find out in CI at best.

You cannot run Windows locally: `windows-latest` is a VM, not a container, and Docker Desktop on
macOS is a Linux VM with no Windows container mode. So the seam is not a nicety — it is the only way
this code gets tested before it is pushed.

---

## 8. A check must not depend on what is on your disk

`existsSync` over a repository path answers "is this on THIS machine", not "is this in the
repository". On 2026-08-28 a new check passed here and failed four CI jobs on the same commit,
because it named a gitignored directory that exists on the laptop that ran the evals and on no fresh
checkout. Resolve repository paths against `git ls-files` (plus `--others --exclude-standard` for
files being added in the same commit), never against the filesystem.

The general form: **a gate whose answer depends on who is asking is not a gate.** Untracked build
output, a cached directory, a local tool on `PATH` — each one makes a green run mean something
different on every machine, and CI is where that gets discovered if you are lucky.

---

## 9. Tests must not touch the repository they are testing

A test that spawns `git` in a directory it did not itself create is one typo away from committing to
this repository. On 2026-08-28 a blanket rename bound two `git -C <temp repo>` helpers to the real
repository root; the suite created two commits and a branch on `main`. Give the temp-directory
variable and the repository-root constant clearly different names, and never let a rename cross that
line unexamined.

---

## 10. Working with the ADR corpus

`docs/adr/` is the live corpus and its records are executable, not decorative.

```bash
node plugin/scripts/work-next.mjs             # which lifecycle stage is waiting, and why
node plugin/scripts/adr-state.mjs             # what governs what, contested areas, dangling supersessions
node plugin/scripts/adr-context.mjs <path>... # which records govern these files — and which were killed
python3 plugin/bin/adr-next <adr> --all       # readiness, computed from the task files
python3 plugin/bin/adr-debt docs/adr          # deferred items and open follow-ups
```

- A record is executed only when its `Status:` is `Accepted`. Proposed, Draft, withdrawn and
  archived records are history or plans, never work orders.
- A record's `<record>/tasks/README.md` is a **derived index**. Where it disagrees with the task files, the task files
  win.
- `docs/BACKLOG.md` is where a sibling left for later goes, with the evidence that found it.

---

## 11. Where the outside evidence is

`docs/research/2026-08-28-verification-is-the-bottleneck.md` holds what the labs and the literature
currently say about verification, silent failure, mutation, trajectory evaluation and measurement,
with the numbers and the sources. Read it before arguing that one of the rules above is overkill —
most of them have an external citation, and several have a measured effect size.

The three findings that matter most here: **false success is the dominant agent failure mode**
(75.8% among self-assessing coding agents); **LLM judges cannot detect it** (AUROC ≤ 0.65 — they
grade the tone of the report) while cheap deterministic detectors reach 0.83–0.95; and **one in five
"solved" patches on the SWE-bench leaderboard is semantically wrong**, passing only because the test
suite was too weak. That last one is why the mutation campaign is worth its forty minutes.

It also names where this project is behind the field, and the one place its instruct-never-block rule
is in genuine tension with a measured result. Both are things to raise before somebody else does.

---

## 12. Reviews

**A SUBSTANTIVE CHANGE GETS A CODEX REVIEW BEFORE IT IS RELEASED.** Standing rule, set by the owner
2026-09-04. Substantive means behaviour changed: a gate's logic, a script's semantics, a new check.
Not a version bump, not prose, not a test-only edit. Run it after the gate is green and before the
tag — that is the point where a finding is still cheap and the diff is still small enough to name.

The reason is measured rather than assumed, and it is the sentence at the end of this section: on
this repository the last three Codex passes each found real defects, and every one was in code
written the same day to fix the same class. A session reviewing its own fresh work is the worst
reviewer of it available, which is exactly what a different lineage is for.

Do not treat a clean pass as evidence of correctness — a review that found nothing is one reviewer's
silence, not a verdict, and it never substitutes for the gate or the campaign.

`/quality-harness:codex-review` runs a different-lineage read-only review. Two operational notes,
both learned the hard way on 2026-08-28:

- **Redirect stdin.** `codex exec` blocks on an open stdin and hangs indefinitely with no output —
  it printed `Reading additional input from stdin...` and sat at 0% CPU for 1h40m. Always
  `< /dev/null`, and wrap it in a hard kill.
- **Scope it to the code that changed.** A diff with 86 renames in it is not reviewable; name the
  files whose semantics changed and ask numbered questions. (On 2026-08-28 that was eight of them.)
- **Give it a budget it can finish in, and read the exit code.** `gtimeout … codex exec` returning
  **124** is a KILL, not a clean pass — on 2026-09-04 a review died at 900s having emitted one
  sentence naming two defect classes and describing neither. A killed review certifies nothing; the
  two words were a lead, and both had to be reproduced by hand. Forbid it from spawning another
  `codex exec`: that run burned its whole budget recursing into a nested one that could not start.

Reconcile every finding against source. Neither accept nor dismiss one by authority — but note that
on this repository the last three Codex passes found real defects, and every one of them was in code
written the same day to fix the same class.

---

## 13. Releasing

**A GREEN SHIPPED CHANGE IS RELEASED, NOT PARKED.** Standing rule, set by the owner
2026-09-04: when `plugin/` has changed and CI is green on that sha, cut the release. Do not wait to
be asked, do not batch "until there is enough", and do not sit on a verified artifact because the
change feels small — a fix that exists only on `main` helps nobody, and the judgement about whether
users want it is made by shipping it rather than by holding it.

Two things that are NOT exceptions to it, because both have been mistaken for one here:

- **`plugin/` unchanged.** Then there is nothing to release; say so and stop (v2.57.1 was cut on a
  bare version bump, and the notes had to lead with "nothing shipped changed").
- **CI not finished.** `INCOMPLETE` is not green. The rule fires on `SUCCESS` from
  `scripts/release-evidence.mjs`, never on a watch's exit code.

The steps below are how, not whether.


1. `bash scripts/selftest.sh` green after the last edit.
2. Bump `version` in `plugin/.claude-plugin/plugin.json`.
3. Push, wait for **every** CI job. Do not carry a count in your head: this line said "all nine
   … mutations 1-4/4" until 2026-09-03, and §106 had resharded the campaign to eight, making the
   real number 13. A remembered count is how a missing job goes unnoticed — ask for the list.
   CI is the only place the full mutation campaign and Windows actually run.
4. **Read each job's `conclusion`, never the watch's exit code.** `gh run watch --exit-status`
   exited **0** on a CANCELLED run on 2026-09-02 (gh 2.98.0) — it prints `X The operation was
   canceled.` and returns success, because a cancelled run did not *fail*. Six of nine jobs were
   green and the three cancelled ones were the mutation campaign, so the release would have carried
   no mutation evidence while looking verified. Ask the API — or better, ask the check that was
   written for exactly this and reads it for you:

       node scripts/release-evidence.mjs <sha>   # 0 clear · 1 a job failed · 2 could not look · 3 still running

   It refuses a sha whose run has not finished, saying INCOMPLETE and naming the jobs still going.
   That refusal is the tool working. The raw form, when you want it:

       gh run view <id> --json conclusion,jobs --jq '"\(.conclusion)", (.jobs[] | "\(.name): \(.conclusion)")'

5. **Do not push again while the release run is in flight.** `.github/workflows/selftest.yml:21`
   sets `cancel-in-progress: true`, so the next push to `main` kills the run you are releasing on —
   correct for development, wrong for a release, and silent either way. Either wait, or re-run at
   the new head and release that. (BACKLOG §104.)
6. **A release campaign is always full.** `.github/workflows/selftest.yml` passes `--no-cache` for a
   tag and for `main`, so every entry is measured rather than reused. ADR-023 lets an ordinary push
   reuse a `RED` verdict whose subject and tests are byte-identical to the run that took it — that
   is for iteration, and a released artifact is never partly evidenced by a verdict taken at another
   commit. The record's own kill criterion depends on this: a wrong reuse surfaces at the next tag
   precisely because tags keep running the whole catalogue.
7. `gh release create vX.Y.Z --latest` — `--latest` is not the default and has been forgotten.
