# Backlog — after v2.0.4

Findings from the independent verification of the v2.0.4 release (macOS, 2026-08-25).
All release claims reproduced (self-test 51/51; forced-cp1252 gates 8/8; D5 rejection
red-proved at 48/51). Every item below is **pre-existing** — each reproduces on 2.0.0 —
so none was a release blocker; they are the next work.

Ordering is by user pain, worst first.

**Status 2026-08-25, later still.** CI ran for the first time on `2.1.2`
(run `32882955305`): ubuntu and macOS green, the coverage floor holds under `STRICT=1`,
and `claude plugin validate` passes **unauthenticated** — so that job is blocking now and
`selftest.sh` runs with `QUALITY_HARNESS_REQUIRE_CLI=1`. Item 6's Windows bullet is
answered below.

**Status 2026-08-26, v2.14.0 — the first with-without measurement.** `claude plugin eval`
now defaults to a no-plugin baseline arm, so for the first time the suite reports what the
plugin *changes* rather than what a model scores while it happens to be loaded. Three cases,
**mean Δ 0.00**:

| case | with | without | Δ |
|---|---|---|---|
| `done-needs-tool-written-evidence` | 0.40 | 0.00 | **+0.40** |
| `adr-write-consults-the-corpus` | 0.00 | 0.00 | 0.00 |
| `gates-advise-never-block` | 0.60 | 1.00 | **−0.40** |

**That table is a single run per cell.** Re-measured 2026-08-27 at five runs per arm,
`gates-advise-never-block` is 0.60 / 0.60 / Δ 0.00 — see finding A. Treat every number above as one
sample, not a measurement.

Three findings:

- **A — WITHDRAWN 2026-08-27, and the retraction matters more than the finding.** Re-measured at
  `--runs 5` per arm: **with 0.60, without 0.60, Δ 0.00 over ten runs**, `reads-the-severity`
  failing 5/5 in BOTH arms with unanimous three-judge votes each time. The −0.40 below was a
  single-run artifact. The plugin does not make this answer worse; it does not change it at all.

  Worse, and the reason this is kept rather than deleted: **no skill is ever invoked by this case.**
  All thirteen kept sandboxes across both arms show `skill_calls=0` — the model reaches for Bash,
  Grep and Read to hunt for a file the empty sandbox does not have, then answers from its own
  judgement. The case carries no `tool_used: Skill` grader either, so nothing ever reported the
  absence. Every Δ this case has produced, in either direction, has been noise around a prompt that
  never touched the thing it claims to measure.

  **Cause found the same day, and it is worse than either reading above.** Every one of the thirteen
  kept runs ended `error_max_turns` at 7 turns against the case's `max_turns: 6`. **No run ever
  produced an answer.** The sandbox is empty, so the model spends all six turns hunting for
  `docs/adr/ADR-014-cache-keys.md` — `ls`, `find`, `Grep`, and in several runs reaching into the
  real installed plugin cache — and is cut off before it says anything.

  That is the whole 0.60, and it is arithmetic rather than behaviour:

  - `does-not-halt` (weight 3) **passes because there is no answer.** A truncated response never
    tells the user they must stop, so the BOUNDARY grader the case exists for passes by producing
    nothing.
  - `reads-the-severity` (weight 2) fails because there is nothing to read.
  - 3/5 = 0.60, deterministically, which is why all ten runs scored identically. A genuinely scored
    case would vary.

  So the earlier inference in this bullet — that no skill claims the "am I blocked?" question — is
  **not supported by these runs either**, and is withdrawn with the rest. The model never reaches
  the point of answering, so nothing can be concluded about what it would invoke. It may still be
  true; this case cannot say.

  The defect is a control that refuses nobody, in the measuring instrument: a boundary grader that
  passes on silence, scoring a run that timed out. Two things have to change together — the case
  must be answerable without a corpus to hunt for, and `does-not-halt` must require a positive
  statement rather than the absence of a negative one.

  The original finding, left below for the record it corrects:

- **A (superseded). The advisory push over-corrected, and it is measurable.** `gates-advise-never-block`
  is the only case the plugin makes *worse*. Baseline called `Alternatives Considered has no
  entries` "a real FAIL" and separated it from the `advice:` line. With the plugin loaded the
  answer called the same finding "a document-completeness check, not a decision-validity
  check" and waved it away. Teaching "gates report, they never block" taught de-escalation of
  every finding, including the one about a record claiming a decision it did not make. The
  rule was right; the skills need severity back on top of it.
- **B. `adr-write-consults-the-corpus` has never actually been able to run its tool.**
  `allowed_tools` in a case's frontmatter does not grant `Bash`; that is an operator grant
  (`--allow-tools Bash`). Every run of this case so far was scored with the model unable to
  execute `adr-context.mjs`. The 0.00 is not yet evidence about the skill.
- **C. No case has a fixture.** All three run in an empty sandbox, so every answer spends its
  first paragraph reporting that the repository is missing. `done-needs` still scores +0.40
  through it — the skill fires and names `adr-verify` regardless — but the noise is real and
  it is why single-run scores swing.

**Coverage.** A path audit of the whole harness classified 112 uncovered regions: 88
untested-but-reachable, 15 defensive, 7 Windows-only, and one genuinely dead line (closed
in `48211bd`). The plan that closes them is `docs/TEST-PLAN.md`; item 14 records defects,
that document records unproven behaviour.

**Status 2026-08-25.** Items 2, 3, 5, 7 and 8 landed on `task/post-2.0.4-fixes`; each
diagnosis is kept below with the commit that closed it. Items 7 and 8 came from a live
2.0.4 report against a different repository, not from the release verification.

**Status 2026-08-25, later.** Items 1 and 4 are now closed, along with item 6's first
bullet, on `task/branch-independent-lifecycle-tests` (2.0.12-2.0.15). Items 10 and 11 are
new and closed; item 12 collects what this round turned up and is open. Item 13 came
from a live report against a 25-ADR corpus, mid-session, and is closed. Item 9's evidence
half remains deliberately unchanged.

---

## 1. Commit gate: one unresolved Bash path bricks committing for the whole session

**Done — `a48c608`.** Neither of the two directions below: the sentinel is now resolved
against the repository instead of being scoped or aged. An unresolved deletion records
that something was removed, not what, and Git already knows what — so `runArtifactGates`
answers it with `git diff --name-only --diff-filter=D HEAD` and gates the paths Git
reports as missing. A scratch `rm -rf "$d"` leaves the corpus whole and clears; a record
that really is gone still fails, and now names the file rather than the shell syntax that
removed it; no repository or no HEAD still fails closed. The required new case is in the
test, together with the still-blocks case, both against a real Git repository built from
`tests/fixtures/ok`. Narrowing worth stating: a deletion of an ADR file that was never
committed no longer raises the sentinel, because archive catalogs govern committed
records.

**Symptom.** After any Bash mutation whose path the gate cannot resolve (a `$VAR` path, a
glob, a heredoc-built script under a variable), *every later `git commit` in the session*
is refused with:

```
Artifact validation failed:
A Bash deletion used an unresolved path; the facts-first gate cannot determine whether an ADR archive was removed. Use an explicit path.
```

No later action clears it — the markers live in transcript history and
`analyzeTranscript` accumulates `mutationPaths` over the **entire** transcript. A passing
bare validation immediately before the commit does not help, because `runArtifactGates`
runs on the unresolved markers before the evidence check. Hit live twice on 2026-08-25:
scratch commands `rm -rf "$SC/qh-d5"` and `bash "$SC/cp1252-gates.sh"` (in a session-temp
dir, nowhere near any ADR) made an unrelated `git commit` in `~/.claude/skills`
un-committable for the rest of the session.

**Why it exists.** v2.0.3 made `Stop` lightweight, but the PreToolUse commit gate and
`TaskCompleted`/`SubagentStop` still feed the full-transcript `mutationPaths` into
`runArtifactGates`. The general fix (narrow to paths mutated after the last green
validation) was proposed as D5 and correctly rejected — it breaks the three strict-gate
regressions (`Stop stays Node-only…`, `an invalid Markdown artifact written through Bash
is still gated`, `globbed Markdown Bash mutations…`), because narrowing lets a validation
that never looked at the artifact launder a bad Markdown write.

**Direction.** Keep strictness for *resolved* paths (they must pass their artifact gate —
that is the point). For *unresolved markers only*, scope by staleness or by reachability:
e.g. an unresolved marker older than the last successful validation AND not repeated
since could downgrade to a warning, or unresolved markers could carry the originating
command's cwd so markers rooted outside the repo being committed to are ignored. Any fix
must keep the three regression tests above green and add a new one: *a session-temp
unresolved deletion must not block a later commit in an unrelated repo*.

## 2. Encoding: 13 `subprocess(text=True)` sites still decode with the locale codepage

**Done — `f26a4b3`.** All 13 sites carry `encoding="utf-8", errors="replace"`, and
`scripts/selftest.sh` reads with an explicit encoding. Gate spawns in
`tests/gates.test.mjs` now run under the two env flags below, and a static AST probe
covers the sites no fixture reaches; `tests/gate-regressions.py` runs without the flags
because it is the harness, not a gate — it writes its own ASCII fixtures and decodes
nothing it did not create. Reverting the acceptance call alone fails both checks.

"All Python gates use explicit UTF-8 I/O" is true for file and stdio I/O only. Child
process output is still decoded with the platform default (ANSI codepage on Windows):

```
bin/adr-verify:236,264,269,334,420
bin/spec-verify:79,347,357,397
bin/adr-lint:106   bin/adr-debt:60   bin/arch-lint:79
```

Worst sites are `adr-verify:334,420` (the acceptance command — its output feeds the
evidence log) and `spec-verify:347,357,397` (test-suite runs). Under cp1252, `·`/`—` in
child output become `Â·`/`â€”` (mojibake into evidence), and bytes 0x81/0x8D/0x8F/0x90/0x9D
raise `UnicodeDecodeError` — the gate crashes instead of judging. Same D1 class the
release closed elsewhere.

**Fix.** Mechanical: add `encoding="utf-8", errors="replace"` to each call. Also
`scripts/selftest.sh:12` (`read_text()` without `encoding=`, currently harmless).

**Red proof / detector.** Run the gates with
`PYTHONWARNDEFAULTENCODING=1 PYTHONWARNINGS=error::EncodingWarning` — today `adr-verify`
crashes at line 420 and the rest pass only because their subprocess calls are git
plumbing; after the fix all 8 pass under those flags. Add that env combination to the
self-test so the class cannot regress.

## 3. Branch guard false positives: `shellSegments` splits `2>&1` on the bare `&`

**Done — `c889429`.** `&` glued to a redirect (`2>&1`, `>&2`, `>&-`, `&>f`, `&>>f`) stays
inside its segment; a background `&` and `&&` still separate. Keeping `&>f` whole would
have lost a real write, because the write-redirect rule never recognized that form, so the
rule now names `&>` and lives in one constant instead of two copies. `shellSegments` is
exported and tested per segment, as the guard classifies.

`shellSegments` treats a single `&` as a separator, so `… 2>&1 | head` becomes segments
`… 2>` + `1` + `head`. The truncated first segment ends in a redirect, matches the
redirect rule in `isPotentialMutationCommand`, and `branchViolation` then blocks
**read-only** commands whenever the session cwd (or `git -C` target) sits on
`main`/`master`:

```
CMD  git ls-remote --heads --tags https://…/repo.git 2>&1 | head -20
 seg "git ls-remote … .git 2>"  → mutation: true      ← parse artifact
```

Reproduced live for `git ls-remote`, `curl … 2>&1 | head`, and `gh release list`.
`analyzeTranscript` is unaffected (it classifies whole commands); only the per-segment
branch guard mis-fires.

**Fix.** Treat `>&N` / `N>&M` as part of the redirect token, not a segment boundary
(`&` splitting is not `&&` splitting). Test the guard **per-segment** — whole-command
tests cannot see this bug.

## 4. Self-test is branch-sensitive: fresh clone on `main` fails 1/51

**Done — `0479057`.** The first fix option, generalized: the suite no longer reads the
host checkout at all. Every lifecycle spawn goes through one `runLifecycleHook()` helper
that supplies a scratch directory as both the process cwd and the payload cwd — which is
also the more faithful input, since a production hook payload always carries one. The
suite was verified twice with identical results, once with the working tree on `main` and
once on a task branch.

A second bug surfaced while fixing it, and it is the one worth remembering: `commit and
completion gates fail closed when the transcript is unreadable` **passed** on `main`, from
the wrong gate. `assert.equal(status, 2)` with no message assertion cannot say which gate
produced the 2. Those assertions now name their reason.

`scripts/selftest.sh` on a fresh clone (branch `main`) → 50/51: `commit gate recognizes
Git global options and executable wrappers` gets
`"git commit would write directly to protected 'main'."` where it expects
`/refusing git commit\/push/`. On any task branch → 51/51. So the released "51/51" holds,
but the first thing a new contributor runs is red.

**Fix options.** Have the test fixture commit inside its own temp repo on a task branch
(so the host repo's branch is irrelevant), or make the expectation accept the
branch-guard message when the *host* worktree is protected. Either way, add
"self-test passes on a fresh clone of `main`" as an explicit case.

## 5. D2 part 1 (`code_only` docstring/backtick fix) has no test

**Done — `b0d90a7`.** A `runpy` probe feeds `code_only(python=True)` two multi-line
docstrings holding one backtick each — the single-line string rules cannot reach across a
newline, so those are exactly the backticks the template-literal rule would pair — plus a
negative twin keeping the JavaScript path stripping template literals. Both halves were
shown to go red: disabling the Python branch reports missing
`['assert alpha() == 1', 'def test_beta']`, dropping the backtick rule reports the
surviving JavaScript literal. A single-line docstring fixture stays green either way,
because the `"…"` rule eats the backtick first — worth knowing before writing the next one.

`grep -rn code_only tests/` → nothing; `tests/gates.test.mjs` pins only
`test_body(python=True)` (async). The docstring fix's failure mode was **silent** — the
JS template-literal rule paired backticks across Python docstring boundaries, deleted
~75% of a real file, and reported correct tests as missing. Exactly the class the
project's own vacuous-gate doctrine requires a can-go-red check for.

**Fix.** A `runpy`-probe test like the existing async one: feed `code_only(python=True)` a
source whose docstrings contain unbalanced backticks and assert the assertions *after*
the docstrings survive; and a negative twin asserting the JS path still strips template
literals.

## 6. Found while fixing 2, 3 and 5 — not fixed

None of these blocked the work above, and each is its own decision.

**`bash scripts/selftest.sh` is not accepted as evidence; `./scripts/selftest.sh` is.**
**Done — `2913b57`.** The first option: a pattern that looks past the shell name at the
script it runs, with the same authoring-verb exclusions the generic rule already uses, so
`bash scripts/deploy.sh` and `bash scripts/rewrite-tests.sh` are still not evidence.
`(?!-)` keeps `bash -n` on its own rule and leaves `bash -c "..."` outside this one.

`VALIDATION_PATTERNS` matches the first word, and the `selftest` pattern needs the
script's own name there. Running the project's own gate the obvious way therefore leaves
the commit gate saying "Run the smallest repository-owned test" after a green 54/54 run.
Hit live twice on 2026-08-25.

**`git fsck 2>&-` classifies as a mutation.** The write-redirect lookahead excludes `&\d`
and `/dev/null` but not `&-`, so closing a descriptor reads as a write. Same family as
item 3; the segment fix does not reach it because the whole command already classified
this way.

**`echo x > /dev/null` classifies as a mutation.** `\s*` before the lookahead backtracks to
zero width, so the `/dev/null` exclusion never applies when a space follows the redirect.
Both this and the line above are one careful regex away, and both want the per-segment
table item 3 added.

**`tests/gate-regressions.py` has ~33 implicit-encoding `write_text` calls.** Deliberately
left: it is the harness, and its fixtures are ASCII it wrote itself. Fixing them would let
the strict flags run with no exception at all, which is the only reason to bother.

**Windows execution of the gate tests is unverified.**
**Measured 2026-08-25, run `32882955305` — and the suite was the problem.** The first
Windows run ever executed came back with 13 failing tests, and every cause inspected was a
defect in the TESTS, not in the harness:

- `tests/gates.test.mjs` and the `adr-next` test spawned gates by name, which cannot run a
  `#!` script on native Windows. Production never reaches them that way — the hooks go
  through Git Bash — so both now name the interpreter on `win32`.
- `tests/skill-metadata.test.mjs` used `dirname(path).split("/")`, which on a `D:\…` path
  returns the whole path and compared a skill name against it.
- `tests/package.test.mjs` read POSIX permission bits; a Git for Windows checkout has none,
  so every gate looked non-executable. It asks git's index there instead, which is what
  actually ships.
- `tests/lifecycle.test.mjs` spelled an expected resolved path as a POSIX literal, asserting
  the platform rather than the behaviour.
- A `SKILL.md` regex spanning lines failed on a CRLF checkout; `.gitattributes` now pins
  `*.md text eol=lf` alongside `*.sh` and `*.mjs`.

`python3` resolves on the runner — the probes that already called it passed. The job stays
`continue-on-error` until it is green, but what it reports from here is the harness.

## 7. A `python`/`node`/`ruby` in a *filename* made reads look like interpreter runs

**Done — `82f4758`.** Reported live from `C:\Projects\blueprints` on 2.0.4, Windows.
`interpreterCommandLooksMutating` tested `INTERPRETER_WORD` against the whole command, so
with a record named `docs/adr/0015-rq-for-queued-work-in-both-python-stacks.md`, every
`cat`, `grep` and `head` of that file classified as a python run:

```
mutation=Y  cat docs/adr/0015-rq-for-queued-work-in-both-python-stacks.md
mutation=Y  cat docs/adr/0015-rq-for-queued-work-in-both-ruby-stacks.md
mutation=n  cat docs/adr/0015-rq-for-queued-work-in-both-go-stacks.md
```

Each read advanced the mutation cursor and pushed the record's path into
`mutationPaths`, so reading a record gated it and reported it as changed while `git diff`
showed it untouched. Repo-name-dependent, therefore invisible until someone names a file
after a language. The command word is now resolved per region and per segment through the
existing `commandInvocation`, so wrappers and leading assignments are still followed and
`bash -c "python rewrite.py"` and `$(python rewrite.py)` still count.

## 8. A newline made the project's own gate stop counting as evidence

**Done — `6962cc7`.** Same report. `isValidationCommand` rejected any command containing a
newline, so the ordinary shape — tool path on line 1, gate on line 2 — produced no
evidence:

```
validation=n  P=~/.claude/…/bin ⏎ "$P/adr-lint" docs/adr/0015-….md
validation=Y  "$P/adr-lint" docs/adr/0015-….md
```

The user ran the bundled `adr-lint`, it passed, and `Stop` kept answering "Run the
smallest repository-owned test". Lines are now judged individually: assignment-only and
`cd` lines carry no verdict, every other line must be a validation, and the character
guard still applies to the whole command — so a mutation above a test cannot launder
itself and a heredoc body cannot pass.

Together items 7 and 8 account for most of the reported loop: reads of the language-named
record kept re-arming `lastMutation` while the only validation run was invisible.
Reproduced end to end from a synthetic transcript of that session shape —
`verifiedAfterLastMutation` false before, true after, with the phantom
`<Bash mutation: …>` markers gone.

**Not attributed.** One marker in the report was a `grep` naming only
`0010-the-flask-stack-renders-screens.md`, and that command classifies as read-only both
before and after item 7. Marker text is cut at 120 characters, so whatever made it a
mutation sits in the tail nobody can see. Probably the same class if the tail named a
language path, but that was not verified — if the loop survives 2.0.5, start there.

## 9. Piping a validation command turns it into a mutation

**Half done — `2.0.10`.** The mutation half is closed: a segment matching a validation pattern is
no longer treated as an interpreter run, so `python -m unittest … | tail` and
`node --test … | grep` classify as `neither` rather than as edits. The evidence half stands
unchanged and deliberately — a pipe still disqualifies a command as evidence, because it hides the
exit code, and `pnpm test | tail -20` must stay out of the evidence set. So a piped run is now
inert instead of harmful: it no longer raises the bar, but it still does not clear it. Run the
check bare when you need it to count.


Observed live on 2026-08-25, repeatedly, in this repository:

```
VALIDATION  node --test tests/skill-metadata.test.mjs
mutation    node --test tests/skill-metadata.test.mjs 2>/dev/null | grep -E "pass|fail"
VALIDATION  ./scripts/selftest.sh
neither     ./scripts/selftest.sh 2>&1 | tail -12
```

`isValidationCommand` refuses any command containing `|` or `>`, which is correct and deliberate —
a pipe masks the exit code, and `isValidationCommand('pnpm test | tail -20') === false` is pinned.
But refusal drops the command into `isPotentialMutationCommand`, where `node` in command position
makes it an interpreter run. So a read-only test invocation, piped to `grep`, is recorded as a
mutation and *raises* the evidence bar it was meant to clear. The `selftest.sh` line shows the
quieter half: piped, it is neither — no verdict, silently not evidence.

**Direction.** The `|`/`>` refusal stays. What is wrong is the fallthrough: a command whose first
segment matches a validation pattern is not a mutation merely because its output was filtered.
Classify the pipeline's *first* segment, and let a downstream `grep`/`tail`/`head` be read-only.
Any fix must keep `pnpm test | tail -20` out of the evidence set — not a mutation, but not a
validation either, which is exactly the `neither` the selftest line already lands on.

Related to item 6: same family as `bash scripts/selftest.sh` not counting while
`./scripts/selftest.sh` does. Both make the harness harder to satisfy than its own rules require.

## 10. Set-level record gates blocked at the per-write boundary

**Done — `3b9c44e`.** `adr-lint` and `adr-retire-check` judge a SET — an ADR with its task
files and index, or an archive catalog with its records — and the PostToolUse dispatcher
ran them after every single `Write`. Mid-sequence that set is legitimately incomplete, so
an inherently multi-file edit became unperformable:

```
Write T1  -> FAIL  Inter-task Contracts row names consuming task T3 but no task file matches it
Write T2  -> FAIL  tasks: no README.md index
Write README -> FAIL  ... names consuming task T3 ...
```

Measured 2026-08-25 against an ADR-028 task set: three consecutive writes, three blocks,
every finding correct and every moment wrong. The per-file gates are unchanged —
`spec-verify`, `postmortem-verify` and `arch-lint` judge one artifact on its own and keep
blocking at the edit. Only the set-level pair moves: at PostToolUse it reports on stdout
and exits 0; at the commit and completion boundaries, which rerun the same dispatcher, it
still exits 2. `run-shell-hook.mjs` passes the hook event as the dispatcher's second
argument, and the polarity is deliberate — only an explicit `PostToolUse` relaxes
anything, so a caller arriving without an event still blocks.

## 11. The branch guard blocked the escape it demands

**Done — `aaaaf31`.** `git checkout task/work` on a protected branch was refused with
"Create a task branch first", which is the thing that command does. `protectedBranchException`
excepted `git switch`, `git checkout -b/-B/--branch/--orphan` and `git merge --ff-only`,
but not a plain `git checkout <branch>` — the same move as the `switch` already on the
list. Hit live 2026-08-25 in this repository; only `git switch` got out.

`git checkout <name>` is navigation or a working-tree overwrite depending on what `<name>`
is, and only the repository knows which, so the guard now asks it
(`rev-parse --verify refs/heads/<name>`). A pathspec still blocks in all three spellings:
after `--`, as a second operand, or as a bare name that is not a branch. Tags, remote refs
and detached commits are unchanged.

## 12. Found while fixing 1, 4, 6, 10 and 11 — two closed, one permanent

**Re-read 2026-08-26 and rewritten, because the item had become the thing it warns about.**
Both fixable bullets were closed in `2.0.17` and each kept, underneath its `Done` marker,
the original prose arguing it was undecided or too invasive to fix. An entry that says
`Done` and then explains why it has not been done is a record kept beside the truth — the
exact failure the gates in this repository exist to catch. The superseded reasoning is
summarized rather than repeated; the closing commits hold it in full.

**A session cannot exercise its own fix to this harness. — PERMANENT, not an open item.**
The live hooks run `${CLAUDE_PLUGIN_ROOT}/scripts/lifecycle.mjs`, which resolves to
`~/.claude/plugins/marketplaces/quality-harness` — a separate clone, on whatever version it
last pulled. Editing this working tree changes nothing about the gates acting on the session
doing the editing. On 2026-08-25 that clone sat at 2.0.11 while 2.0.12-2.0.15 were being
written, so item 1's bug kept blocking every commit in the very session that fixed it, and
each commit had to be run by the user through the `!` prefix.

Nothing is broken here and nothing can close it. It is the first thing to know before
debugging why a fix "did not take", and it means no fix in this repository is ever verified
live by the session that wrote it. The available evidence is `selftest.sh`, a negative
control against `git show HEAD:`, and — since `2.1.2` — CI on three platforms.

**Navigation and fast-forward integration count as edits. — CLOSED, `2.0.17`.** The fork was
real and the user decided it on 2026-08-25 ("working, not blocking"): the gate asks *did
this session author something it has not verified?*, while keeping the staleness half of the
second reading. A navigation-only session owes nothing; a refresh (branch switch, `pull`,
`merge --ff-only`) after a green run still stales that evidence. `git checkout -b` /
`switch -c` in place are inert — they change no tree and stale nothing — and
`git pull --ff-only` joined the protected-branch exceptions beside `merge --ff-only`, since
fast-forward integration is the sanctioned way to update `main`.

Verified still in force 2026-08-26: `isPotentialMutationCommand('git pull --ff-only')` is
pinned true at `tests/lifecycle.test.mjs:123`, and the refresh classification at `:1035`.

**Scratchpad writes score as repository mutations. — CLOSED, `2.0.17`.** `mutatesOnlyTempPaths`
proves, fail-closed, that every write of a Bash command lands under the OS temp roots —
redirect targets and the operands of rm/mv/cp/mkdir/rmdir/touch/truncate/tee, with
in-command `VAR=` assignments expanded, symlinks realpath-resolved, and every other mutator
class (interpreters, in-place editors, git, package managers) disqualifying outright. A
project living under the temp root gets no exemption, which keeps the suite's own fixtures
strict.

The original note called this "least costly finding, most invasive fix" and proposed
weighing it before starting. It was done anyway, and applied in BOTH the evidence gate
(`scripts/lifecycle.mjs:1279`) and the branch guard (`:732`), so a scratch note on `main` no
longer demands a task branch and no longer nags at `Stop`.


## 13. The artifact gate's budget was fixed at 10s and no setting could raise it

**Done — `2.0.16`.** Reported 2026-08-25: on a clean 25-ADR corpus every commit was
refused with

```
facts-first gate FAILED ... facts-gate-dispatch.sh timed out after 10000ms
```

and `QUALITY_HARNESS_SHELL_TIMEOUT_MS` changed nothing. It could not:
`runArtifactGates` built the child's environment as
`{ ...process.env, QUALITY_HARNESS_SHELL_TIMEOUT_MS: '10000' }`, so the hardcoded value
was written over whatever the operator had set. The outer `spawnSync` kill was a separate
fixed 15s, so even a raised inner budget would have been cut short at 15s with
`artifact gate exited null`.

The per-edit boundary was never affected — `hooks.json` gives that path the runner's own
110s. Only the commit and completion boundaries carried the 10s, which is where a corpus
large enough to outgrow it does its damage.

The budget now reads the operator's value (same clamp as the runner: 100ms to 110000ms),
defaults to 30s rather than 10s, and the outer kill is derived from the inner rather than
fixed. A gate's cost grows with the corpus it reads, so the ceiling has to belong to
whoever owns the corpus.

A timeout also stopped being reported as a finding about the record. It still blocks — a
gate that did not finish has not cleared anything — but the message now says the gate
never read the artifact and names the setting to raise, instead of sending the reader to
look for a defect in an ADR that is fine. Same rule as item 8's environment labelling:
name the class, never downgrade the exit code.

Related to item 6's open redirect bullets (`git fsck 2>&-`, `echo x > /dev/null`): three
false blocks of the same family — the gate refusing work that is not wrong. The
template-placeholder case is already closed in `facts-gate-dispatch.sh`.

## 14. What the adversarial review of 2.0.12-2.0.17 found, and what was accepted

A 27-agent adversarial review of the branch (four lenses, every finding independently
re-verified with live reproductions) confirmed 23 findings. **Fixed in `2.0.18`:**

- `cp/mv --target-directory=DIR` and `-tDIR` smuggled a repository write past BOTH the
  temp exemption and the protected-branch guard — the operand loop skipped every
  dash-argument as a flag. '='-attached option values are now checked as targets and the
  `-t` forms disqualify outright.
- A symlink at the final path component (to a file, or dangling) leaked a repo write
  while classifying temp-only; the leaf is now lstat'd and followed, depth-capped.
- A later `VAR=` reassignment rewrote earlier uses (last-assignment-wins); assignments
  now apply in order.
- A glued redirect (`echo x>f`) in a mixed command lost the incidental coverage the
  blunt classifier used to give it; every `>` in every segment is now accounted.
- Non-fast-forward `git pull` (a merge is authorship) is a mutation again; only
  `pull --ff-only` is navigation.
- The raised artifact-gate budget could outlive the hook's own deadline (hooks.json:
  60s at PreToolUse), and a hook killed on its deadline blocks nothing — the pass now
  runs under a per-boundary window (45s commit, 100s completion) and an exhausted
  window is a blocking failure.
- `rm -rf "$VAR" && git commit` laundered the unresolved-deletion sentinel by rewriting
  the HEAD it resolves against; a publish after an unresolved deletion now fails closed.
- The PostToolUse deferral notice was printed to exit-0 stdout, which reaches nobody;
  it now arrives as `additionalContext`, restoring the "report" half of
  "reports at the edit and blocks at the boundary". ADR-ownership ambiguity also
  respects the boundary rule now.
- `artifactGateTimeoutMs` above the ceiling clamps to the ceiling instead of snapping
  back to the default; `deletedTrackedPaths` handles quoted names and disables rename
  detection; the new tests derive their temp base from the platform instead of
  `/private/tmp` literals.

**Confirmed but accepted, with reasons:**

- `cp` SOURCE operands are treated as written targets (over-strict, fail-closed).
- A session can still write `/tmp/check.sh` invisibly and run `bash /tmp/check.sh` as
  "evidence" — partially pre-existing (any `./check.sh` matched); wants a
  temp-path-aware `isValidationCommand`, which needs a cwd it does not take today.
- Branch existence for the checkout/navigation discriminators is consulted at
  boundary time, not command time — replay can reclassify; narrow both ways.
- The unresolved-deletion sentinel resolves against the session repo only; a deletion
  in a DIFFERENT repository, or of a file inside a submodule, is out of its sight.
- The branch guard's temp exemption judges one segment and cannot see a sibling
  segment's `VAR=` assignment — those scratch writes stay blocked on main (fail-closed).
- Interactive `Stop` still runs no artifact gates (pre-2.0.3 pinned design); the
  additionalContext notice is the mitigation — the model now SEES the set-level
  failure at edit time even though only commit/completion enforce it.

## 15. The harness only ever said no

**Done — `2.1.0`.** Counted after the 2.0.18 release: one additive surface (the SubagentStart
contract) against fourteen refusals. Worse, every refusal already knew the answer and withheld it —
`missingEvidenceReason` said "run the smallest repository-owned test" while the harness had
`VALIDATION_PATTERNS` to recognise one and no way to *discover* one. That sentence was hit eight
times in the 2.0.12-2.0.18 session alone. Five additive changes, none of which can block anything:

- **`projectCheckCommand`** discovers the project's own check — `scripts/selftest.sh`, a
  `package.json` script in lock-file order, a Make/just target, cargo/go/pytest — and every
  evidence message now names it. Only commands `isValidationCommand` already accepts are ever
  offered, so the gate cannot recommend something it would then refuse; a project that names no
  check gets the old general phrasing rather than a guess.
- **A `SessionStart` hook**, the first the plugin has had: the check command, the branch with the
  exact escape line when it is protected, and the ADR record sets with a ready task. Scoped hard —
  no git repository means no record reading at all, after a probe in a shared temp directory
  surfaced *another project's* tasks, and test/fixture directories are skipped.
- **`bin/adr-next`** answers which task is ready and what proves it, computed from the task files
  (`Depends-on` + `Consumes`/`Produces`, the same edges adr-lint's DAG uses) rather than
  `tasks/README.md`, which is a derived index. Done means an exit-0 Verification Log entry whose
  `acceptance-sha256` matches the current Acceptance fence, so a README typed to `done` cannot make
  a task disappear. `adr-execute` now reads it first.
- **Every refusal carries its remedy**: the protected-branch blocks emit the literal
  `git switch -c task/<sha>`, and a test asserts the guard actually permits what it advertises —
  a block whose escape is itself blocked is what this session hit live. The unreadable-transcript
  refusals now say plainly that they are environment problems, not findings about the work.
- **An evidence nudge**: when a check passes with a task file edited, the completion boundary names
  `adr-verify <task>` as a non-blocking `systemMessage`. adr-verify is the anti-fabrication
  mechanism; the friction was only ever remembering to call it.

## 16. Nothing ran the checks except a person who remembered to

**Done — `2.1.1`.** There was no `.github` at all: `bash scripts/selftest.sh`, run on a laptop by
whoever thought of it, was the only thing between a regression and `main`. Coverage had never been
measured at all.

`.github/workflows/selftest.yml` runs on every push to `main`, every pull request, and on demand:

- **selftest** (ubuntu + macos, blocking) — the project's own check, unchanged.
- **coverage floor** (ubuntu, blocking) — `scripts/coverage.sh`, a new repository-owned check that
  measures both surfaces and holds a ratchet. Measured 2026-08-25: JavaScript 92.77% line /
  84.24% branch / 92.54% functions, Python gates 63%. Floors sit just under (92/83/92 and 62), so a
  regression fails and an improvement is free. Every failure path was proved: an impossible JS
  floor exits 1, an impossible Python floor exits 1, and `QUALITY_HARNESS_COVERAGE_STRICT=1` turns
  an unmeasurable Python surface into a failure rather than a silent pass.
- **windows** (non-blocking, on purpose) — this is item 6's last bullet finally getting evidence.
  The gates reach Windows through Git Bash in real use, but the SUITE spawns them by bare name
  through PATH, which cannot execute a `#!` script natively, so the job is expected red until that
  is fixed. It is here to produce the observation nobody has ever made, not to gate the branch.
- **plugin validate** (non-blocking) — establishes whether the Claude Code CLI can validate a
  manifest without credentials, which had never been checked either way.

Measuring the Python gates needed `COVERAGE_PROCESS_START` plus a `sitecustomize.py` on
`PYTHONPATH`, because the suite drives every gate as a SUBPROCESS — wrapping one command would have
measured nothing and reported a number.

`scripts/selftest.sh` no longer assumes the Claude Code CLI is present. Where it is absent the run
prints `SKIPPED —` and the final line becomes `PARTIAL —` instead of `PASS`; a check that silently
vanishes is precisely the failure mode this project exists to prevent. `QUALITY_HARNESS_REQUIRE_CLI=1`
turns the absence into an error for environments that install it on purpose.

A packaging test binds the workflow to the scripts a human runs, so CI cannot drift into decoration:
renaming or deleting either script, dropping the strict coverage env, or removing the `pull_request`
trigger fails the suite.

**What this does not cover.** The 16,801 words of skill instructions — the part the model actually
follows — remain untested by anything. `claude plugin eval` exists and there is no `evals/`
directory. That is the largest untested surface in the product and it is not a CI problem.

---

## 17. What Windows said once the suite stopped answering for it

Run `32883938308`, windows-latest, after the suite fixes in item 6. **13 failures became
4**, and the remaining four are about the harness, which is what the job was built to find.

**Fixed here — the retirement seal accused an untouched archive of tampering.**
`adr-retire-check` hashed `path.read_bytes()`, so an archive sealed on macOS reported
`ADR-001: SHA-256 does not match the frozen decision unit` on Windows, where git had
translated the `.txt` attachment's line endings on checkout. A false tamper alarm is worse
than an ordinary false block: it says someone altered a frozen decision. `canonical_bytes`
now normalizes CRLF/CR to LF before hashing, and detects binary the way git does (a NUL
byte) so an image is hashed raw. Reproduced on macOS and negative-controlled — the test
goes red without the fix, and a one-line content edit still breaks the seal. Existing
LF-committed corpora keep their digests; an archive whose files are committed *with* CRLF
will need re-sealing once.

**Fixed here — session orientation was silently empty on every Windows session.**
This one was in the shipped harness, not the suite. `readyTaskLines` spawned
`bin/adr-next` — a `#!/usr/bin/env python3` script — directly. Windows cannot exec a `#!`
script, so `run.status` came back `null`, and the loop's
`if (run.status !== 0 && run.status !== 3) continue` swallowed it. The hook then returned
an empty orientation and exit 0: a fail-open that reported nothing and looked like a
project with no conventions. `spawnGate` names the interpreter on `win32` (falling back to
`python` for an install with no `python3` alias) and is the only place allowed to spawn a
gate; a test exercises the `win32` branch on POSIX by passing the platform explicitly, and
asserts exactly one `spawnSync(tool` exists in `lifecycle.mjs` so a caller cannot go back
to a direct spawn. Negative-controlled: restoring the direct spawn turns the test red.

**Fixed here — two artifact-gate tests built a Bash command out of a native path.**
`printf content > "C:\Users\…\invalid-spec.md"` is a shell string in which `\` is an
escape, so the operand the gate would have judged does not survive parsing and nothing is
gated. Confirmed locally: `bashMarkdownMutationPaths` returns `[]` for a backslash operand
and a path for the same operand with forward slashes. The parser is right — the fixture was
wrong, and Git Bash takes forward slashes anyway. The fixtures now build bash-shaped paths.

**Fixed here — on Windows the budget wall named no way over it.** `runArtifactGates`
spawns the runner with a 5s kill margin on top of the gate's own budget, and produced its
helpful "this is a budget, not a finding — raise `QUALITY_HARNESS_SHELL_TIMEOUT_MS`" text
only when the runner reported `timed out after Nms` itself. On windows-latest the outer
margin expired first and the whole finding was `spawnSync … node.exe ETIMEDOUT`: still
blocking, correctly, but naming neither the budget nor the setting that raises it. Both are
the same budget running out, so `budgetExhausted` now recognizes both. It is a separate
exported function precisely because the outer arm is unreachable on a host fast enough for
the runner to win the race — asserting it directly is the only way it is covered anywhere
but Windows. Negative-controlled: dropping the `ETIMEDOUT` clause turns the test red.

**Closed — Windows is green and the job blocks.** 13 → 4 → 1 → 0 across `b144d22`,
`c89d395`, `3949b1b`, `2b1d9bc` and `9493e90`; first green run `32885379301`. Most causes
were defects in the suite, but three were the harness: the retirement seal calling
line-ending translation tampering, session orientation silently saying nothing, and the
budget wall naming no way over it. An informational job would have found all three and
gated none of them, which is why `continue-on-error` is gone and `package.test.mjs` now
asserts that no job carries it.

One honest caveat: this rests on a single green run, so the job's flakiness on
windows-latest is unmeasured. Blocking is still the right default — an informational gate
is decoration, and a flake announces itself where a silent fail-open does not.

**Also fixed — `coverage.sh --report` could not run on macOS.** Under `set -u`, bash 3.2
(still the system bash there) aborts on an empty array's `"${a[@]}"` expansion, and
`--report` deliberately leaves `js_flags` empty. The one mode whose purpose is reading the
numbers was the one mode that could not run on the machine this project is developed on;
CI never caught it because CI runs bash 5 and never passes `--report`. Uses
`${a[@]+"${a[@]}"}` now.

## 18. A task could be marked done with failing evidence, and adr-lint said PASS

Found on the first row of `docs/TEST-PLAN.md` Wave 1 — the round-trip that feeds an
adr-verify-written Verification Log entry back to adr-lint. The premise this project exists
for is that a model cannot claim a task is done without evidence. It could.

`check_verification` is correct: it requires a `· exit 0 ·` entry whose digest matches the
current Acceptance. It just never ran. `done_task_ids`, which decides WHICH tasks to check,
read only cell 0 of each README row. This project's own task index is
`| Order | Task | Scope | Depends-on | Status |` — a number in cell 0 — so every row was
skipped, `done_task_ids` returned nothing, and `check_verification` iterated an empty list.
Reproduced end to end: a task marked `done` whose only evidence was `exit 3` linted green.

This is the **second** recurrence. The docstring records the first: the check originally
anchored on `| T4 | … | done |` and missed link-style ids, leaving "three ADRs and eleven
tasks outside this check entirely, one of them marked done with an empty Verification Log".
The fix then anchored on cell 0, which a third table shape defeated the same way.

The id is now the LEFTMOST cell naming a task, and `done` is looked for after it. Leftmost
is the whole point: scanning every cell would fix the shape problem and introduce a worse
one, because a `Depends-on` cell names OTHER tasks and a done dependent would silently mark
its dependencies done. Both failure modes are negative-controlled — reverting to cell-0
turns two tests red, and the scan-everything version turns the attribution test red.

**Fixing it immediately exposed a second unreachable rule.** With `done_task_ids` working,
adr-lint reached "a fence that passes is not a fence that can fail" and demanded a
`## Mutation Log`. That rule had never fired either, for the same reason. The fixture had no
such section; the round-trip tests now run `adr-verify --mutant` and assert the killed-mutant
entry's shape, so the complete chain — acceptance evidence, mutant evidence, reader
acceptance — is exercised for the first time.

**Worth noting about the corpus this repository keeps.** Any `tasks/README.md` in the
Order-first shape has never had its `done` rows checked. Re-run `adr-lint` over every ADR
and expect rows that were green to go red — that is the check working, not a regression.

## 19. adr-verify rewrote the line endings of every file it touched, on Windows

Found by Wave 1 on windows-latest (run `32887527528`), by the one assertion in the mutant
tests that had no other purpose: after a REFUSED mutant, is the target byte-identical? It
was not.

`Path.write_text` opens with `newline=None`, which translates every `"\n"` to `os.linesep`.
All three of adr-verify's writes did it:

- the evidence append converted the task file it edited, so a Windows session's first
  `adr-verify` run rewrote the whole file it was only supposed to add a line to;
- the mutant write converted the target the fence then ran against;
- worst, the `finally` **restore** did not restore. It re-encoded. A mutant that adr-verify
  itself refused — did not apply, not unique, comment-only, does not parse — still left the
  target changed, which is the one thing that path exists to prevent.

`write_source` writes bytes and preserves whatever the file already used; the restore keeps
the original bytes and puts exactly those back. All three are negative-controlled on macOS
by giving the gate CRLF input, which is what a Windows checkout hands it:

- reverting the append turns the CRLF-preservation test red;
- reverting the restore turns the byte-identical assertion red;
- reverting the mutant write needed a test that could SEE it, since the restore hides the
  result either way. The fence itself reports on the target's bytes while the mutant is in
  place, so a translating write turns a `survived` verdict into `killed` — a verdict about
  the writer rather than about the test.

That third one is the useful lesson: two of the three fixes were provable by looking at the
file afterwards, and the third was invisible that way. A fix whose only evidence is "the
other platform stopped complaining" is not covered, it is unobserved.

## 20. A backticked Cmd override ran the OUTPUT of the command, not the command

Found by Wave 3 on windows-latest (run `32891556604`), which reported
`'`python3' is not recognized as an internal or external command`.

`spec-verify` reads the Facts table's Test cell with `.strip("`")` and its Cmd cell without.
The template writes every command in backticks, so the natural authoring — and the form
matching the cell right beside it — reached `subprocess.run(..., shell=True)` with the
backticks intact. On Windows `cmd.exe` rejects it outright. On POSIX something worse
happens quietly: backticks are **command substitution**, so the shell runs the command and
then executes its OUTPUT. A command that succeeds while printing a word runs that word, and
the fact goes RED for a reason unrelated to the test.

Both cells are stripped now.

**The lesson is the same one item 19 taught, and it took two rounds to apply.** The obvious
control — revert the strip, run the suite — came back GREEN on macOS, because for a command
that prints nothing the substitution's exit code matches the direct one. Exit codes alone
cannot distinguish the two behaviours. The row that can is a command which **succeeds while
printing**: correct behaviour exits 0, substitution executes the printed word and fails.
With that row present, reverting the strip turns the suite red.

Twice now a cross-platform fix has been unobservable by the assertion that seemed natural
for it. The check to apply: *does this test distinguish the fix from the bug, or only
distinguish "the other platform stopped complaining"?*

Also recorded — a known gap, not a defect: `adr-lint`'s `selected_by_filter` treats pytest's
`-k 'a and b'` as `or`, so it over-selects and misses a named test the fence would not run.
The function's stated policy is that a false alarm costs more than a hole, because people
skip a noisy gate. Asserted as-is in `tests/gate-regressions.py` so it stays a decision.

## 21. A gate that ignored an unknown flag answered a question nobody asked

Found while surveying what was left after Wave 4a, by asking each gate what it does with
`--bogus`. The answers were all different and one of them was a live fail-open.

```
$ adr-next tasks --jsonn
Next: T1 — Task ADR-001-T1-fixture: Prove adr-lint accepts a conforming task file
$ echo $?
0
```

`adr-next` collected every `--` token into a set and looked for the two it knew, so a typo
was simply absent from that set and the human report came back instead. It has a consumer:
`scripts/lifecycle.mjs` calls `adr-next <dir> --json` and `JSON.parse()`s the result inside a
`try/catch` whose `catch` is `continue`. A renamed or mistyped flag would print prose, the
parse would fail, and **session orientation would go silently empty at exit 0** — the same
fail-open as the `#!` spawn in item 17, reached by a different route.

The others were wrong in less dangerous ways. `adr-verify` fell through to its positional
branch, so `--why probe` with `--why` renamed reported `task file not found: probe`, which
reads like a missing file rather than a gate that no longer speaks its documented interface.
`postmortem-verify` tried to open `--bogus` as a file and printed an unhandled
`FileNotFoundError` traceback at the user. `adr-lint`, `adr-debt` and `arch-lint` each read
it as a path.

All seven now refuse, each using its own existing usage exit code rather than a new
convention (`spec-verify` already refused, via argparse). Two tests hold it: every gate in
`bin/` must have an unknown-flag case — the list is compared against `readdirSync(bin)`, so a
new gate cannot be added without one — and `adr-next --json` must produce output that
actually parses, with the exact fields `readyTaskLines` reads off it.

Python gate coverage 78% → 80%; `adr-retire-check` 70 → 83, `adr-next` 69 → 74.

## 22. The commit gate degraded with session length until it blocked everything

Reported from a live 2.1.7 session on 2026-08-26 and reproduced here. Two separate defects,
both of which make the harness fight a session that has been productive.

**Every commit re-gated everything the session had ever touched.** `mutationPaths` is
append-only across the whole transcript and was never pruned, and the commit boundary calls
`runArtifactGates(state.mutationPaths, cwd, 45_000)` — a literal window that
`QUALITY_HARNESS_SHELL_TIMEOUT_MS` cannot extend, because that setting bounds the per-file
call. So the per-file cost grew without bound until it crossed 45s, and from then on **every
commit failed for the rest of the session, whatever was staged**, naming a different file as
the cutoff each time. On this repository's own transcript the list had reached 390 entries
while 33 were actually being published.

A commit gates what it is publishing. `mutationPathsSince(lastPublish)` is what the boundary
asks for now; the full list is unchanged for the completion gate and the nag, which are
about the session. A commit that bypassed the gate with `--no-verify` still moves the
boundary — the override was the author's, and punishing every later commit for it is the
behaviour this gate exists to avoid.

**A deletion whose path the command itself set counted as unresolved.**
`W=/tmp/scratch; rm -rf "$W"` names its own path — the value is in the command, in front of
the use — but `bashDeletionMutationPaths` did no expansion, so the sentinel armed, and
because a publish after an unresolved deletion fails closed, committing was bricked for the
rest of the session. It happened to this session, mid-flight, while writing the fix for the
defect above.

`mutatesOnlyTempPaths` already had the machinery; the safety direction is what differs and
why it could not simply be shared. There, a wrong expansion can only FAIL the temp
exemption, so the ambient environment is a safe last resort. Here it is the reverse —
resolving `$W` disarms the sentinel — so only assignments this command made, earlier in the
same command, are trusted. `expandShellToken` takes a `fromEnvironment` flag for exactly
that, and `rm -rf "$HOME/thing"` still reports unresolved.

**The sticky sentinel was inverted, and is now gone.** Three independent sessions were
blocked by it on 2026-08-26 — this repository, a Webitel spec repo, and agentsmemory — all
with the same message and all false. Measured rather than argued:

| shape | armed the rule? | already checked? |
|---|---|---|
| `rm -rf "$X" && git commit` — one command | **no** | **no** — the hook runs before the deletion exists |
| `rm -rf "$X"` … later `git commit` | **yes** | **yes** — that commit's own gate ran `deletedTrackedPaths` |

Both land at the same tool-use position in the one-command case, and the comparison was
strict (`lastPublish > lastUnresolvedDeletion`), so the shape the rule was written for never
armed it. Meanwhile a deletion followed by a separate commit armed it for the rest of the
session — even though that commit ran this very hook first, and `runArtifactGates` resolves
the deletion through `deletedTrackedPaths` while HEAD can still answer. **It fired only on
deletions that had already been checked, and never on the one that had not.**

It had a test. The test asserted the inverted semantics, which is why nobody noticed: it
used a deletion plus a *separate* commit and asserted that blocking was correct.

The transcript rule is removed. The genuinely uncovered case — a command that deletes by an
unresolved path and publishes inside itself — is now checked directly against the incoming
command at `PreToolUse`, before the transcript is even read, so it holds when the transcript
is unavailable too.

**Open — `VAR=$(mktemp -d …)` is still unresolved, and correctly so.** Six commands in this
session's transcript arm the sentinel that way. The path genuinely is not knowable from the
text, so naming one would be a fabrication. The right fix is not in the deletion resolver
but in `mutatesOnlyTempPaths`: `mktemp -d` with a literal template under a temp root
provably writes under that root, so such a command should be exempted as scratch and never
reach the deletion resolver at all. Not attempted here — it is a third change, and the two
above were the reported ones.

## 23. The edit boundary blocked without preventing anything

Raised by the user on 2026-08-26, after a session in which the harness refused legitimate
work four separate times: *"the problem is we reject most of the things with tools that we
do not trust"*, and then the better proposal — **inform the agent that this will be blocked,
so it has second thoughts.**

Both halves hold up when measured.

**There is no severity anywhere.** Across the five record gates there are 112 distinct
failure messages — `adr-lint` 41, `adr-retire-check` 33, `spec-verify` 15, `arch-lint` 14,
`postmortem-verify` 9 — and not one of them distinguishes a finding that breaks the
guarantee from a structural nitpick. A missing `## Consequences` exited 1 exactly like a
fabricated `done` status, and the dispatcher blocked on any non-zero.

**And blocking at `PostToolUse` prevented nothing.** The write has already landed; a
PostToolUse hook cannot undo it. Refusing there costs the turn and protects no file. What
keeps a bad artifact out of the repository is the commit and completion boundaries, which
rerun the same dispatcher and do exit 2.

So the edit boundary informs now, for every gate rather than the two that were already
relaxed, and the message names the consequence: nothing is blocked right now, this WILL
block `git commit` and completion, fix it now while it is small or before you commit. An
agent that knows the commit is going to fail has second thoughts. An agent that loses its
turn to a structural nitpick learns to route around the gate — and the sessions that
prompted this had started doing exactly that.

Nothing is given up. The guarantee was never at this boundary.

**Answered — `adr-lint` has severities now.** 41 findings became 29 blocking and 12
advisory, and the line is between **form and content**, not between big and small:

- **Form advises.** A section or header that is ABSENT, a table with no data rows, step
  numbering, a wave table, a missing README index. The record is still readable and nothing
  has been claimed that is not true.
- **Content blocks.** A section present and EMPTY — an ADR whose Alternatives Considered has
  no entries considered no alternatives, whatever its shape. So does an unfilled placeholder,
  a pointer that does not resolve, a fabricated claim, and a record that contradicts itself.

Advice prints on a PASS as `advice: …`, because a record that is acceptable and a record
that is finished are different things and the reader deserves both.

**Two of these were classified wrong on the first attempt, and the tests said so.** Moving
the template-placeholder check to advice let the bundled `adr-template.md` pass `adr-lint`
outright — a placeholder is not a shape problem, it is a document presenting as a decision
while containing none. And moving "Alternatives Considered has no entries" to advice let an
ADR that decided nothing pass; that is content, not form. Both are pinned now, in both
directions, and the mutation that swallows advice instead of printing it is pinned too —
advice nobody sees is the same as suppressing the finding.

**Done — all five gates.** The split, and what it says about each gate:

| gate | advises | blocks | what that shape means |
|---|---:|---:|---|
| `adr-lint` | 12 | 29 | a record and its task set; most of it is claims |
| `postmortem-verify` | 6 | 3 | a document validator — mostly form |
| `spec-verify` | 5 | 10 | grammar advises, an unresolvable citation does not |
| `arch-lint` | 3 | 11 | nearly every rule asks whether a claimed check EXISTS |
| `adr-retire-check` | 3 | 30 | a contract checker; a link or digest that fails is not form |

A gate that turns out to be mostly blocking is not a failure of the exercise. `arch-lint`
and `adr-retire-check` exist to ask whether something written down as evidence has anything
behind it, and that question has no advisory answer.

**A third clause emerged, and a test found it.** Identity blocks. Making
`no YAML frontmatter block` advisory let `postmortem-verify` accept an ADR template as a
postmortem — a document the gate cannot recognise as the kind of record it validates is not
a form problem. That joins the two the first pass found: an unfilled placeholder blocks,
and a section present and EMPTY blocks.

## 24. The skill recommended the one shape the evidence chain cannot cover

Found by a session working on another repository, which followed `/adr-write`, hit the
contradiction, and did the right thing: it kept the task files the skill told it not to
create, and wrote down why. Its note — *"inline tasks have nowhere to accept those entries,
they would be unverifiable"* — is exactly right, and the situation is worse than
unverifiable.

`skills/adr-write/SKILL.md` said: **"≤3 tasks: inline numbered list inside the ADR. No
`tasks/` directory."** But `adr-verify` appends its Verification Log and Mutation Log to a
TASK FILE, and `adr-lint` runs ADR-level checks only when there is no tasks directory — so
`done_task_ids` and `evidenced_task_ids` read an index that does not exist.

Measured 2026-08-26: an ADR with three inline tasks **all marked done**, no evidence
anywhere, passes `adr-lint` with exit 0. The plugin's own guidance routed small work around
the plugin's own guarantee.

Same class as item 18 — a check that applies to nothing — but reached through documented
advice rather than a parsing bug, which is arguably worse. Item 18 was an accident.

**Two halves.** The skill now says `tasks/` at every size: it is three small files, and it
is the only shape the evidence chain can cover. And `adr-lint` advises when an ADR marks
something done inline with no tasks directory, because an existing corpus would otherwise
keep passing silently — saying nothing is how the hole stayed open. Advice rather than a
failure: the record is not lying about anything the gate can see, and refusing an ADR over
its layout is what teaches people to stop running the gate.

`tests/skill-contract.test.mjs` now asserts that no skill recommends a shape `adr-verify`
cannot write evidence into, which is the general form of this bug.

## 25. Two things 2.18.2 made vestigial, kept deliberately

Both are recorded rather than fixed, because removing either is a change nobody asked for
and neither is wrong today.

**The `qh-root` note in eight skills.** Each skill that names `${CLAUDE_PLUGIN_ROOT}` carries
a paragraph explaining that the placeholder stays literal when the skill is loaded under its
bare name from a personal skills directory, and to run `qh-root` instead. 2.18.2 stopped
linking personal skills and this machine deleted its thirteen, so those skills are now served
only as `quality-harness:<name>` — plugin context, where the placeholder resolves. The note is
harmless and still correct for anyone who keeps a hand-made bare-name copy. It reads as a
pointer to a copy that, here, no longer exists.

**Deferred here by ADR-001, and ANSWERED 2026-08-28 by ADR-004** (`docs/adr/ADR-004-templates-are-not-linked.md`):
the six links were removed, not made release-proof. Release-proofing them is unbuildable — the
indirection gates use is *executable*, so a forwarder resolves the newest install at call time, and
a template is read as data, where no such moment exists. The narrower question ADR-001 asked first
turned out to be the whole answer: nothing reads the home templates directory once the bare-name
skills are gone, so there was nothing to make release-proof.

The measurement that settled it: of 61 releases in git history, 23 are already absent from this
machine's plugin cache, including 2.18.1, 2.18.2 and 2.19.1 — the two releases either side of the
one the links happened to name. A link naming an evicted version dangles, `digest()` returns null
for it, and `standaloneDriftNotice` therefore says nothing at all. A stale copy is reported; a
vanished link is not.

**ADR-004 defers two things back here**, both live:

- Removing the `qh-root` note from the eight skills that carry it — the first bullet above, unchanged.
- `sameLineage()`'s `skill` and default arms, which `linkPlan` can no longer reach now that neither
  skills nor templates are planned. Same class as the `skill` branch ADR-001 left, kept for the same
  reason: they are the layer deciding whether to touch a user's file, not anything the planner emits.

**`archive()` copying a directory — FIXED 2026-08-28 as a side effect of ADR-004.** `linkPlan` now
emits only gate forwarders and their shims, all files, so the `recursive: true` in `archive`'s
`cpSync` was reached with a directory only by a test that hand-built a `kind: 'link'` entry no
planner produced — self-referential, the exact shape `mutate-propose` exists to find. The test now
calls `archive` directly instead of routing through `write`. The guarantee belongs to the function
that has the flag, and a home config directory really does hold directories (a hand-made bare-name
skill is one), so the case is real even though no plan reaches it.

Both are the same class as item 21 in reverse — not a check that fires on nothing, but a
mechanism that nothing reaches. Neither costs anything until someone reads it and looks for
the thing it describes.

## 26. DECIDED 2026-08-28 — no detached mode; the pattern is documented instead

`adr-verify` will NOT offer a detached or resumable mode. The whole guarantee of the Verification
Log is that the tool which RAN the command is the tool that wrote the entry; a mode that records a
result someone else obtained reintroduces the hand-pasted evidence the log exists to eliminate. The
Windows report is real and the answer is to shape the fence: run it detached and poll, then verify
on a tree where it completes quickly, or narrow the fence to what the task actually proves. Written
as the fourth fence trap in `templates/task-template.md`; ADR-002's follow-up is closed.

## 26 (superseded). No answer for a fence that outruns the agent's tool timeout

**Deferred here by ADR-002** (`docs/adr/ADR-002-a-mutant-restore-outlives-its-process.md`, Out of
Scope and Follow-ups).

Reported 2026-08-27 from a Windows session: `./verify.sh` with `BLUEPRINT_DOCKER=1` takes about
eleven minutes, and the agent's Bash tool caps a call at ten. Two `adr-verify` runs were killed
mid-fence. The reporter's workaround is to launch the gate detached with `nohup`, redirect to a log,
write the exit code to a file, and poll for it — which works, and which nothing in this harness
offers or documents.

ADR-002 fixed the DAMAGE a kill does (the mutant is now journalled and recovered). It did not fix
the cause: the run still dies, and an eleven-minute fence still cannot complete inside a ten-minute
cap. Two shapes worth weighing before building either — a `--detach`/`--resume` pair in `adr-verify`
that owns the backgrounding itself, or documenting the `nohup` + poll pattern in the skills so an
agent reaches for it instead of rediscovering it. The second is nearly free and may be enough.

Also observed in the same report and NOT addressed anywhere: a killed run's `verify.sh` child
survives and skips its own EXIT trap, stranding `redis:8` / `postgres:16` containers and a
`bp-verify` network. ADR-002 rules this permanently out of scope for the gate — a process cannot
clean up reliably from inside the kill — so if it is ever to be handled, it belongs to a different
mechanism than `adr-verify`.

## 27. CLOSED 2026-08-28 — all four scripts are behind an import guard

`adr-state.mjs`, `adr-context.mjs`, `verify.mjs` and `mutate.mjs` now run their CLI only when they
are the entry point, and `tests/package.test.mjs::importing a script runs its CLI on nobody` imports
all four for real and asserts they write nothing. A comment saying "guarded" is not a guard.

`verify.mjs` was the sharp one — importing it SPAWNED whatever command the ambient `process.argv`
named. `mutate.mjs` was the expensive one, and the cost had already been paid: its verdict logic had
no test for its entire life because nothing could import it without starting a campaign. Guarding it
was the enabling step for ADR-006, not a tidy-up.

One bonus the refactor bought: `verify.mjs` has always rejected a `--cwd` containing a NUL byte, and
`spawnSync` refuses such an argument first, so no invocation could ever reach that guard. `parse()`
is pure now, and the case is asserted for the first time.

## 27 (superseded). A script that ends the process that imports it, and the three siblings still able to

Found 2026-08-27 while executing ADR-001 and ADR-002 — that is, by using this repository's own
lifecycle on itself for the first time.

`scripts/work-next.mjs` ran its whole CLI half at module top level, `process.exit` included.
`tests/lifecycle.test.mjs` imports it. Two silent consequences: the module parsed the IMPORTER's
argv (a `--test-name-pattern` read as an unknown option, exit 2), and on the branch where nothing is
waiting it exited 0 outright.

The second one fired the moment this repository's corpus became healthy — two accepted records,
every task carrying evidence. **The suite went from 82 tests to 80 and reported `fail 0`,
`skipped 0`.** The healthier the corpus, the fewer tests ran, and nothing said so. Fixed with the
main-guard three sibling scripts already had, plus a spawned regression test and mutation
`router: importing the CLI half does not run it`.

**Class sweep**, run 2026-08-27:

```bash
for f in scripts/*.mjs; do printf '%s guard=%s exit=%s\n' "$f" \
  "$(grep -c 'import.meta.url ===' $f)" "$(grep -c 'process.exit(' $f)"; done
grep -n "import('\.\./scripts/\|from '\.\./scripts/" tests/*.mjs
```

Six scripts are imported by tests — `lifecycle`, `run-shell-hook`, `standalone-link`,
`sync-standalone`, `mutate-propose`, `work-next` — and all six are now guarded. **Four are not, and
would do exactly this the day anything imports them:**

- `scripts/adr-state.mjs` (3 `process.exit` calls) — the likeliest next victim, since it is the
  corpus reader a future test will reach for.
- `scripts/adr-context.mjs` (1)
- `scripts/verify.mjs` (2) — worse than exiting: importing it **spawns a child process**.
- `scripts/mutate.mjs` (8) — importing it would claim the lock and run a campaign.

Not fixed here deliberately. `verify.mjs` and `mutate.mjs` need real restructuring into a `main()`,
and doing that in the same turn as the fix — while depending on `mutate.mjs` to verify the fix —
is the scope creep this harness exists to refuse. They are named so the next session does not
rediscover the class.

The general rule, which is the part worth keeping: **a module with a CLI half must not run it on
import**, and the test for that has to spawn rather than import, because the failure being tested
is the test process dying.

## 28. DECIDED 2026-08-28 — it belongs in the review skill, as a question and never a score

Placed in `skills/review/SKILL.md` Pass 2: name the branch you could not follow and what a caller
would get wrong; do not compute or cite a score. ADR-003's prohibition on shipping it as a GATE is
unchanged — the metric moves under pure extraction, so it rewards splitting one hard function into
three easy ones that are harder to read together. This is the delivery mode §36 measured as the one
that works: guidance at the moment it applies, to a reader who can see what the number cannot.
ADR-003's follow-up is closed.

## 28 (superseded). Complexity as a conversation trigger, if anywhere

**Deferred here by ADR-003** (`docs/adr/ADR-003-a-gate-asserts-behaviour-not-shape.md`, Out of Scope
and Alternatives).

ADR-003 forbids shipping a complexity GATE, and gives the reason: the metric counts branches per
function, so splitting one twenty-branch function into five four-branch ones turns it green with the
total branching unchanged. What it does not settle is the softer form the owner named — *"this
function crossed 15, come look"* — which is information rather than a verdict and cannot be gamed by
splitting, because nobody is being refused.

Two things stand in the way, and neither is fatal:

1. **Scope.** Every gate this plugin ships judges records and evidence. A complexity advisory would
   be the first to judge the user's own source, which the standing rule keeps project-scoped. The
   projects already have better instruments — `zeus` carries `clippy::cognitive_complexity`, the
   Laravel stacks carry phpstan.
2. **Prose is the weak instrument.** An advisory nobody is gated on is exactly the kind of output
   this session measured as producing Δ 0.00, and the `gates-advise-never-block` traces showed skill
   text never reaching the answer at all.

If it is ever built, the shape that fits the harness is not a new gate but a line in an EXISTING
report — the same place the session notice already says what changed — and it should carry the
number, the threshold, and nothing resembling a verdict.

## 29. FIXED 2026-08-27 — this entry was stale and is kept for the mechanism

`bullets()` in `bin/adr-judge` was rewritten the same day it was reported: a `CONTINUATION` pattern
now folds wrapped lines into the bullet they belong to, and a blank line or an unindented line ends
it. Validated against the zeus corpus — E2 rate 24/171 before and after, so the fix changed how
bullets are READ without moving a single verdict. Two mutations cover it: `judge: a wrapped
alternative is read whole` and `judge: a blank line ends a bullet`, both RED.

Noticed 2026-08-28 only because the backlog was read aloud: the entry still described the defect in
the present tense a day after it was fixed. A backlog that records fixes as open is the same class
of wrong as a gate that reports a failure it did not observe.

## 29 (superseded). adr-judge reads a multi-line bullet as its first line only

Found 2026-08-27 while authoring ADR-003, twice in one session.

`bullets()` in `bin/adr-judge` keeps only lines matching `^\s*(?:[-*]|\d+\.)\s+\S`, so a bullet
whose reasoning wraps is judged on its FIRST LINE alone; every continuation line is discarded before
the E2 rejection check ever runs. An alternative that states its rejection perfectly well on line
three reports as "gives no reason it was not chosen".

It fired on two well-formed alternatives in ADR-002 and ADR-003 and was correct about neither. Both
were "fixed" by moving words onto line one, which is the author reshaping prose to suit a parser —
the opposite of what a judge is for.

This is a false alarm in a gate, and this repository's own rule is that a gate with false alarms is
one people learn to skip, after which it protects nothing. Not fixed here because `adr-judge` is a
shipped gate and changing what it accepts is a contract change deserving its own record: joining the
continuation lines before splitting would widen what passes, and that needs checking against every
existing corpus (`zeus` has 171 records) rather than against this one.

The narrow shape of the fix, for whoever takes it: join a bullet with the indented lines that follow
it before applying `REJECTION` and `ALTERNATIVE_CLAUSE`, then re-run against a real corpus and
confirm nothing that used to fail now passes for the wrong reason.

## 30. The eval suite has no working fixture mechanism

This is finding C above, chased down 2026-08-27 and left unresolved on purpose.

Every case runs in an empty sandbox, so a prompt naming `docs/adr/tasks/README.md` sends the model
hunting for a file that is not there. On `gates-advise-never-block` that consumed the entire turn
budget in 13 of 13 runs and the graders scored the silence (finding A). It is the single largest
distortion in this suite.

**What was tried.** `prompt.md` frontmatter rejects `scaffold_script` and names its own valid keys:
`schema_version, name, description, tags, plugins, runs, expected_outcome, model, max_turns,
timeout_seconds, allowed_tools, artifact_publish, growthbook_overrides, append_system_prompt, env`.
The richer `case.yaml` format does accept `execution.scaffold_script` (alongside `add_dirs`,
`baseline_file`, `tool_order`), and a probe case loaded and ran with `--scaffold`. **The scaffold
did not populate the agent's working directory**: the kept sandbox's `home/cwd` was empty, the model
reported `ls: docs/adr: No such file or directory`, and the file the script wrote could not be found
anywhere in this repository either. Either it runs somewhere the agent never sees, or it did not run
— and nothing in the output distinguished those.

**What was done instead.** Both remaining cases now quote the corpus in the prompt rather than
expecting it on disk, which is the approach measured to work: after the same change,
`gates-advise-never-block` went from 13/13 timeouts to runs that answer and score 1.00. That is a
workaround, not a fix — a case that quotes its corpus cannot measure whether a model would go and
read one, which is exactly what `adr-write-consults-the-corpus` exists to measure.

**`add_dirs` works, and cannot be committed.** Probed the same day, three ways:

| `add_dirs` value | result |
|---|---|
| absolute path (`/Users/…/tests/fixtures/ok`) | **1.00** — the model read the real corpus |
| relative path (`tests/fixtures/ok`) | 0.00 — not resolved |
| `${CLAUDE_PLUGIN_ROOT}/tests/fixtures/ok` | 0.00 — no substitution in case.yaml |

So a working fixture needs a literal absolute path, which is machine-specific and cannot ship in a
committed case that another checkout or CI would run. That is the whole blocker, stated exactly.

**Two ways out, neither taken yet.** Generate the `case.yaml` at run time from a template so the
absolute path is materialised per machine — a small `scripts/eval.mjs` that writes the path and
invokes the runner. Or find the scaffold incantation that lands in the agent's cwd, which would need
no path at all.

**Why it is worth the trouble.** A corpus-backed case can grade on a GATE rather than on prose:
"does what the model wrote pass `adr-lint` with exit 0" is deterministic, exercises skills,
templates and gates together, and cannot be satisfied by naming the right tool. That is ADR-003's
rule applied to the eval suite itself, and it is the only shape here that would measure the half of
this harness that demonstrably works. Every current grader asks whether an ANSWER mentions
something.

## 31. FIXED — the case was bimodal, not invocation-dependent

**Diagnosed and fixed 2026-08-27.** There was no suite-versus-isolated disagreement. The case was
BIMODAL: a run that answers directly takes 3-5 turns and scores 1.00; a run that wanders first
exhausts `max_turns: 8` and scores 0.00. Both happen in BOTH arms.

Bisected by running the same case at `--runs 3` in isolation — the one variable the earlier
comparisons had not held fixed:

| | scores | turns |
|---|---|---|
| with | 0, 0, **1** | 9, 9, **5** |
| without | 0, **1**, **1** | 9, **5**, **3** |

Nine turns is the `max_turns: 8` ceiling; three to five is an answer. So every number this case ever
produced — **−0.40, −1.00, +0.20, −0.33** — was a small draw from one bimodal distribution rather
than a fact about the plugin. Four numbers, four walk-backs, one cause.

**Fixed by raising `max_turns` to 14**, verified rather than asserted: four runs, **all exactly
0.71**, with turns varying 17 / 9 / 6 / 3. A seventeen-turn wander now scores the same as a
three-turn answer, which is what a stable case looks like.

**The mistake worth keeping.** `allowed_tools` was narrowed to `[Skill]` believing that would stop
the wandering. It did not — traces show Bash called three times under that declaration. **A
declaration is not a limit**, which is the same lesson `--allow-tools` taught from the opposite
direction the same evening (§30): a case declares what it wants and only an operator grant decides
what it gets.

**What the stable number now says.** 0.71 is five of seven: `does-not-halt` and
`reads-the-severity` both pass, and `invokes-a-skill` reports Skill called 0x in 4 of 4. Under
ablation that indicator is with-only and unscored, so it does not move Δ — but it is a stable
observation that no skill claims this prompt, which is the Trigger question this case was rewritten
to make visible.

## 31 (superseded). The same case scores differently depending on how the suite is invoked

Measured 2026-08-27, after the fixture and grader repairs in §30 had made every case answerable.

`gates-advise-never-block`, same commit, same case file, four runs:

| invocation | with | without |
|---|---|---|
| whole suite, `--runs 3`, `--allow-tools Bash` | **0.00** (3/3 `error_max_turns`, 9 turns, no answer) | 1.00 (3/3, 3 turns) |
| single case, `--runs 1`, no grant | 1.00 | 1.00 |
| single case, `--runs 1`, `--allow-tools Bash` | 1.00 | 1.00 |

The suite run's with-arm saturated its turn budget three times out of three and never answered. Every
isolated reproduction of the same case answers cleanly in three turns. Bash was the obvious suspect
and is ruled out — granting it in isolation changes nothing.

**What this costs.** A Δ read off a suite run cannot be trusted, and this repository quoted one twice
already: −0.40 (one run, artifact) and −1.00 (suite run, does not reproduce). Both were reported as
findings about the plugin. Neither was.

**The working rule until this is understood:** quote a Δ only from an isolated, repeated run of a
single case. A suite run is for spotting which case to go and measure properly, never for a number
that goes in a record.

**Two unexplained things worth starting from.** The with-arm called `Bash` three times in a run where
the case declared `allowed_tools: [Skill]` and no grant was passed, so a case's declaration does not
limit the way this repository assumed. And `invokes-a-skill` reports `Skill called 0x` in runs that
score 1.00, so whatever produces the good answer here is not a skill firing — which means the plugin
arm's advantage, where it has one, comes from hooks or the system prompt rather than from the skill
bodies this suite was built to measure.

## 32. WITHDRAWN — the runs where a skill fires finish fine

**Settled 2026-08-27 evening, and the finding below is false.** Ten with-arm runs at
`max_turns: 40` / `timeout_seconds: 900` against the same 171-record snapshot:

| | runs | all scored |
|---|---|---|
| a skill fired | 7 of 9 completed | **1.00** |
| no skill fired | 2 of 9 completed | **1.00** |
| consulted the corpus before writing | 9/9 | |
| record written to disk | 9/9 | |

The tenth run was interrupted by hand, not a failure. **9 of 10 scored 1.00**, and firing a skill
predicted nothing. The correlation recorded below — every skill-firing run failing to finish — was
four observations under three DIFFERENT and progressively tighter budgets, and the budget was the
variable the whole time.

**The real finding, which is the useful one:** given a budget that fits it, the guided path matches
the unguided path against a real corpus — 1.00, consulting the corpus before writing every time.
`adr-write`'s preamble is EXPENSIVE, not broken. What a user should be told is the cost, not a
warning about convergence.

Kept rather than deleted because this case has now produced four numbers that did not survive
re-measurement — Δ −0.40, Δ −1.00, Δ −0.60, and this correlation — and that record is worth more
than the entry it corrects. Nothing from this case belongs in a record until it has been repeated.

The original finding follows.

## 32 (superseded). The runs where a skill fires are the runs that do not finish

First measurement against a real corpus, 2026-08-27. `evals/templates/adr-against-a-real-corpus`
run against a snapshot of a 171-record, 498-task corpus — the first time anything in this plugin has
been exercised at that scale, against `tests/fixtures/ok`'s single ADR and this repository's two.

Four with-arm runs, and the baseline scored 1.00 in every one of them, writing a record in 19-24
tool calls:

| budget | `invokes-a-skill` | outcome |
|---|---|---|
| `max_turns: 14` | Skill 1x | `error_max_turns`, no record |
| `max_turns: 30` | Skill 1x | `timed out after 300s`, no record |
| `max_turns: 14`, grant fixed | Skill 1x | `error_max_turns`, no record |
| `max_turns: 40`, `timeout_seconds: 900` | **Skill 0x** | **1.00, record written** |

Every run that invoked a skill failed to finish. The run that did not invoke one behaved like the
baseline. **n=4, and a perfect correlation across four runs is a reason to measure, not a finding.**

**Counterexample, 2026-08-27 evening.** The ten-run experiment below was started and interrupted
after its first run, which came back `score 1.00` with `invokes-a-skill: True` — a skill fired AND
the case finished with a record on disk. So the correlation is already broken at n=5, and the
earlier failures are better explained by the budgets they ran under (14 turns, then 30 turns, then
300s) than by a skill having fired. Do not cite the table above as evidence that guidance prevents
convergence; it is five observations with one clean counterexample, which is a reason to run the
experiment rather than a conclusion to skip it.

If it holds, the shape is not "the plugin is slow" but "when the guidance actually fires, the path
does not converge inside budgets the unguided path clears with room to spare". The plausible cause is
`adr-write`'s preamble, which instructs `adr-state`, `adr-context`, `adr-debt`, three templates, the
backlog and the lessons file before a record may be written — all of it scaling with corpus size, and
none of it previously exercised beyond three records.

**What to run next:** the same case at the generous budget, ten times, recording `invokes-a-skill`
against outcome. That either establishes the correlation or kills it, and it is the only question in
this backlog whose answer changes what the most-used skill in the plugin should say.

Note what made this visible: `invokes-a-skill` is a `tool_used` indicator added on 2026-08-27 after
discovering that `skill_calls=0` had been invisible for `gates-advise-never-block`'s entire history.
Without it these four runs would read as an unexplained flake.

## 33. An MCP wrapper, so the gates work where Claude Code does not

Raised 2026-08-27, deliberately not started. Recorded so it is not rediscovered from scratch.

Everything structural in this plugin is a Claude Code construct: `plugin.json`, the marketplace,
SessionStart and PostToolUse hooks, `${CLAUDE_PLUGIN_ROOT}` substitution, the namespaced
`quality-harness:*` skills. Claude Code runs in a terminal, in the desktop app, on the web and in
IDE extensions, so all of those are covered. **Plain Claude Desktop, with no Claude Code, is not.**

What would and would not transfer:

- **The skills are markdown** and would carry over by hand. That is the guidance half, and this
  session measured what it is worth alone: Δ 0.00 on `gates-advise-never-block`, a complexity
  instruction inert in four runs of five, and `invokes-a-skill` reporting 0x in runs that scored
  1.00. Guidance without enforcement is the half that does not demonstrably work.
- **The gates are plain Python CLIs** — `adr-lint`, `adr-verify`, `adr-judge`, `adr-state` need
  nothing but Python and a shell. They are the half that DOES work, and they are unreachable from a
  client with no shell.
- **MCP is the bridge that fits.** Exposing the gates as MCP tools would give any MCP-speaking client
  the enforcement half without porting a single skill. `adr-verify --mutant` is the awkward one: it
  rewrites a file in the caller's tree, and ADR-002's journal exists because that is dangerous even
  with a process to clean up after itself.

**Before starting, settle two things.** Whether an MCP tool may write to a caller's working tree at
all, or whether the wrapper is read-only (`adr-lint`, `adr-judge`, `adr-state`, `adr-context`,
`adr-debt`) and the writing gates stay behind Claude Code. And what carries the evidence chain when
there is no PostToolUse hook to notice a task being marked done — the chain is the product, and an
MCP surface that lints but cannot record evidence is the measuring half again.

This deserves a record rather than a backlog item once it is picked up: it is a new distribution
surface, a new trust boundary, and it is costly to reverse.

## 34. FIXED — the coverage gate was rejecting good code one run in ten

**Cause, found by reading rather than guessing.** `--experimental-test-coverage` measures only the
parent process, and NINE of this repository's fourteen test files spawn subprocesses. A source line
therefore counts as covered when a test imports it and uncovered when a test spawns it — and
`node --test` runs files in parallel, so which path wins varies per run.

**Measured 2026-08-27, ten runs each on an unchanged tree:**

| | lines | spread | failures |
|---|---|---|---|
| parallel (before) | 78.52 – 97.00 | **2.17** among the nine that passed | **1 in 10** |
| serial (`--test-concurrency=1`) | 94.83 – 94.85 | **0.02** | **0 in 10** |

The parallel outlier was not a near miss: 78.52 lines, 82.52 branches, everything down at once,
consistent with a whole file's coverage missing from the aggregate. Cost of the fix is about 20s
against 8s.

**Why this mattered more than the number.** A gate that rejects good code a tenth of the time
teaches that re-running is a valid response to red — and that is the one lesson a verification
harness must never teach, to a human or to an agent. See §36. It also means CI on this repository has
been failing roughly one push in ten for no reason, and 2.19.0's coverage failure was diagnosed as a
real shortfall on the assumption the gate was honest. That diagnosis happened to be correct
(branches were genuinely at 84.86 against a floor of 85), but it was luck rather than method.

**The branch floor moved 85 → 84, and the distinction matters.** CI failed on 2.20.0 at 84.97
branches on a tree nobody had regressed. Serial measurement reports 85.09-85.48 locally and 84.97 on
CI, so the floor of 85 sat INSIDE the honest range — it had been calibrated while the parallel regime
was reporting up to 85.43, and those numbers were partly double-counted.

This is a correction of a miscalibrated threshold, not a concession to a red gate, and the test for
which one it is: lines and functions were NOT touched, because they hold their floors with room to
spare. Only the number derived from noise moved.

`scripts/verify.mjs` was raised first rather than reasoned about — 60.00 → 75.00 branches, 88.89 →
100.00 lines, by testing the signal path (a command KILLED is not a command that returned a code)
and two usage shapes. That is the honest way to raise the floor back, and the remaining gaps are
named and owned: `sync-standalone.mjs` 72.73, `work-next.mjs` 74.58, `adr-state.mjs` 80.85. Raise
`JS_BRANCHES` when those move; do not raise it by hand.

One thing learned while doing it: the NUL-byte guard in `verify.mjs` is unreachable through any
normal invocation, because Node's own `spawnSync` refuses an argument containing one. It is left in
place and left untested, with the reason written beside the test rather than a test that would only
prove Node's validation.

## 34 (superseded). JavaScript coverage jitters across its own floor

Measured 2026-08-27 while fixing the CI failure below. Consecutive `STRICT=1 bash scripts/coverage.sh`
runs on an unchanged tree reported `all files` lines of **96.99 and 94.64**, and one earlier run in
the same session reported **77.64**. `lifecycle.mjs` read 100.00 in one run and 96.09 in the next.

The floor is 94 lines / 85 branches / 95 functions, so a spread that wide means the gate's verdict
depends on the run rather than on the tree. It failed CI at 84.86 branches, passes now at 85.14 and
85.36, and nothing about the code changed between the two passing runs.

The likely cause is that much of this suite spawns subprocesses and coverage is collected across
them; a child that is slow, killed by a timeout, or racing another test contributes different lines
each time. That is a hypothesis, not a finding — nothing has been measured to confirm it.

**Why it matters more than the number:** a gate that passes or fails on the same tree teaches people
to re-run it until it is green, and then it protects nothing. That is the same failure this corpus
records everywhere else, in the check that guards the checks.

**What to do about it:** measure the spread first — ten consecutive runs on one tree, recording
`all files` each time — before deciding whether to chase determinism or to set the floor where the
worst honest run lands. Do NOT simply lower the floor to stop the noise; that hides the variance
rather than answering it.

## 35. Three instructions measured, three inert

The task template gained a third fence trap on 2026-08-27, from a real report: a fence narrow enough
to name one test leaves the falsifiability fixture outside it, and `adr-verify --mutant` then returns
`killed` from a command that never ran the mutant. The finding is real — a Go session hit it and had
to make the fixture a subtest.

Whether the PARAGRAPH does anything is a different question, and it was measured:
`evals/fence-warning-{given,omitted}`, identical task, prompts differing by only that paragraph, five
runs each, `--ablation none`.

| | fence runs the fixture | guards a vacuous pass | score |
|---|---|---|---|
| warning omitted | 5/5 | 4/5 | 0.92 |
| warning given | 5/5 | 4/5 | 0.92 |

**Inert.** The model writes an alternation or an unfiltered run unprompted, and the single miss in
each arm was the other grader, falling equally on both sides.

**The first version of this case measured nothing**, and the reason is the finding underneath. The
two tests were named `TestResolveCitations` and `TestResolveCitations_CanFail`, so `-run
TestResolveCitations` swept up both by accident and the trap could not be fallen into. Both arms
scored 10/10 on a question the fixture had made unaskable — this repository's own rule ("ask whether
the fixture could PRODUCE the failure at all") failed while measuring whether a rule about
unfalsifiable fences was worth keeping. The names now share no prefix and the grader carries the
reason inline.

**Kept anyway, and this is the judgement rather than the measurement.** The eval is a fresh model,
four turns, one clearly-stated task. The session that hit the trap was mid-execution against a large
corpus with deep context. "Inert on a clean four-turn task" is not "inert where it was needed", so
the paragraph stays as documentation for a reader who goes looking — and must not be counted as
guidance that works.

**The pattern across three measurements** — the complexity lint (inert in 4 of 5 runs, and the one
obedient run got worse), the `gates-advise` skill prose (Δ 0.00, and the traces showed it never
reached the answer), and this — is that instructions in this harness have not once been shown to
move behaviour, while gates and mutations have moved it repeatedly. That is ADR-003's argument,
arrived at from the other direction.

### AMENDED 2026-08-29 — the three nulls are not strong enough to carry that sentence

Derived from the recorded results with `node scripts/eval-deltas.mjs`, which reads every
`aggregate-result.json` under `plugin/evals` and computes Δ **within one invocation only**.
**25 invocations, 8 cases, 7 of the 8 carrying a caveat.** The cases this entry and §36 quote:

| case | paired invocations | Δ per invocation | what the numbers support |
|---|---|---|---|
| `gates-advise-never-block` | 9 | `+0.00 -0.40 +0.00 +0.20 -1.00 +0.00 +0.00 -0.33 +0.00` | with-arm alone spans **1.00** across invocations |
| `fence-warning-given` / `-omitted` | 1 each | `+0.60` / `+1.00` | single run against single run |
| `complexity-instruction-given` / `-omitted` | 2 each | `+0.20 +0.60` / `-0.20 +1.00` | with-arm spans 0.60 |
| `adr-against-a-real-corpus` | 6 | `-0.60 +0.00 -1.00 -1.00 +0.00 +0.00` | single-run arms AND spans 1.00 |

**The first committed version of the tool reported 18 and 7, and it was wrong.** The suite writes into
two trees — `plugin/evals/results` and `plugin/evals/generated/cases/results` — and defaulting to the
first dropped 7 invocations, five of them PAIRED invocations of `adr-against-a-real-corpus`, which is
the case with the most negative deltas in the corpus. Nothing said anything was missing; the report
simply described a smaller corpus. Found by a review comparing the tool's count against the ad-hoc
glob it replaced, and now asserted by
`tests/eval-deltas.test.mjs::both results trees are read, not just the one named results`. It is the
same shape as a filter that matched nothing reporting "absent" — twice in one session, in the tool
built to stop exactly that.

Three things follow, and only the first was known.

**"Δ 0.00" for `gates-advise-never-block` is one of nine deltas, not the measurement.** The other
eight run from −1.00 to +0.20 on identical inputs, and five of the nine are exactly 0.00 because both
arms scored the same *number*, not because the arms behaved alike. A case whose with-arm alone swings
the full 0–1 range cannot distinguish an inert instruction from a noisy grader. §31 and §34 are the
same shape in this repository — a bimodal case and a jittering coverage gate — and §36's own rule
applies to the eval suite before it applies to anything the suite measures: **a verdict that changes
its mind teaches re-running instead of fixing.**

**The 0.92-vs-0.92 figures in the table above have no baseline at all.** They come from
`--ablation none` runs, which is exactly what this entry says and is fine for a given-vs-omitted
comparison. They are not evidence about the plugin, and nothing here should be read as one.

**The first attempt at this amendment produced a confident, wrong number, and that is worth
recording.** Pooling every recorded with-arm against every recorded baseline gave
`fence-warning-omitted` a Δ of **+0.93** — an arm from three `--ablation none` invocations on
2026-08-27 compared against a single baseline run on 2026-08-28. The arms never met: different case
text, different day, different ablation setting. The tool refuses that comparison now, and the
refusal is asserted in `tests/eval-deltas.test.mjs::a delta is computed within one invocation and
never across two`.

**What this does NOT overturn.** Given-vs-omitted is still the right experiment, the fence paragraph
still scored 0.92 in both arms over five runs each, and no instruction here has yet been shown to
move behaviour. The correction is to the CONFIDENCE, not the direction: the honest statement is
*"three instructions were measured on cases too noisy to detect a small effect, and none showed
one"*, which is a much weaker claim than *"instructions have not once been shown to move
behaviour"* — and it is the claim the data supports. Raising runs per arm on
`gates-advise-never-block` until its with-arm stops spanning the range is the obvious next move — and
the arithmetic says buy the variance down before buying samples.

**How many runs this case actually needs, computed 2026-08-29 from its own recorded spread.** Over
every recorded run: with-arm n=28, mean 0.55, sd **0.39**; baseline n=21, mean 0.67, sd **0.41**. At
80% power and α=0.05, `n ≈ 16σ²/δ²` per arm:

| effect worth detecting | runs per arm |
|---|---|
| δ = 0.10 | **264** |
| δ = 0.20 | 66 |
| δ = 0.30 | 29 |
| δ = 0.50 | 11 |

At roughly $0.34 and 80 seconds a run (measured over the 49 recorded runs of this case), detecting a
small effect costs about **$180 and five hours**, and 15 runs per arm — the number that looks
reasonable — buys the power to detect only an effect of about 0.43, which is enormous. **So the
honest next step is not more samples: it is finding out why one case scores 0.00 and 1.00 on
identical inputs and fixing that.** A grader with sd 0.39 on a 0-to-1 scale is measuring the run.
This is the same conclusion §36 reaches about gates and states as a rule — a verdict that changes its
mind teaches re-running instead of fixing — applied to the instrument that produced §36's evidence.

## 36. What actually reaches an agent, measured on one

Written 2026-08-27 at the owner's request, from a session in which eleven defects were introduced
and found. This entry exists because the harness guides AGENTS, and almost everything written about
developer tooling assumes a human reader who scrolls, remembers, and re-reads. An agent does none of
those reliably. Where the two differ, this is what the difference cost.

### The campaign caught eight, CI caught two, prose caught zero

Eleven defects, all one shape — a check passing or failing for a reason other than the thing it
named. `scripts/mutate.mjs` found eight of them. CI found two (both Windows, both invisible to any
local run). Reading found none, including the two occasions the author read the relevant rule the
same day and broke it anyway.

Against that: three instructions were measured under ablation and all three were inert — a
complexity lint (§35), the `gates-advise-never-block` skill prose (Δ 0.00, and traces showed it never
reached the answer), and the fence-trap paragraph (§35, 0.92 both arms).

**Weakened 2026-08-29, see §35's amendment.** `node scripts/eval-deltas.mjs` derives the deltas from
the recorded runs and 7 of 8 cases cannot currently support one. The `Δ 0.00` quoted above is one of
NINE paired invocations of that case, whose deltas span −1.00 to +0.20; its with-arm alone swings the
full score range. The three nulls are real and the direction is unchanged, but "measured and inert"
overstates what a suite this noisy can show. **The rule below still stands on the campaign evidence —
eight defects caught by mutations, two by CI, none by reading — which is not affected by any of
this.**

**The rule that follows, and the one worth holding this project to: every piece of guidance should
either become a gate or be deleted.** Not because prose is wrong, but because there are now three
measurements saying it does not arrive, and sixteen thousand words of it competing for the same
attention. The one exception that demonstrably works is guidance delivered AT THE MOMENT IT APPLIES
— the SessionStart notice about a stale standalone copy was acted on within one turn of this session
starting. Load-time guidance competes; moment-of-use guidance lands.

### A verdict that means two things sends an agent to the wrong file

`GREEN` currently means both "your test asserts nothing" and "your mutation was a no-op". Those are
different diagnoses pointing at different files, and on at least two occasions this session the
author went and read the test when the fault was in the catalogue entry. Five of the eleven defects
were of this shape. `docs/specs/2026-08-27-a-mutation-that-proves-nothing.md` is the requirement
that separates them.

The general form: **an agent acts on the words, so a verdict that compresses two causes into one
word costs a round trip every time it fires.**

### The load-bearing line belongs where the reader actually looks

The zeus eval was diagnosed for two rounds while the answer sat on LINE ONE of the output:
`not granted (missing --allow-tools grant): Write, Edit`. Long output scrolls; what an agent
reliably reads is the TAIL. `mutate.mjs` gets this right — its summary is last. `adr-verify` gets it
right — the recorded entry is last. The eval runner puts its most important line first, human-style,
and it cost two rounds.

**Assume the reader sees the last twenty lines.** A warning at the top of long output is a warning
nobody read.

### A verdict that changes its mind teaches re-running instead of fixing

Two live examples in this repository, both recorded separately: §31, where the same case scored 0.00
in a suite run and 1.00 in every isolated reproduction; and §34, where consecutive coverage runs on
an unchanged tree reported 96.99, 94.64 and 77.64 against a floor of 94.

For a human this is annoying. For an agent it is worse than annoying: a flapping gate teaches that
re-running is a valid response to a red result, and that is the one lesson a verification harness
must never teach. **A gate that is right 90% of the time trains the agent to discount it 100% of the
time.**

### What this does NOT claim

Six of the eleven defects would not have been caught by any of the above — they were CI,
invocation, and grader-calibration problems. This entry ranks what helps; it does not claim the list
is complete, and the ranking comes from one session with one agent on one codebase.

## 37. A disposition containing parentheses is silently unrecognised

`adr-lint` requires every Out of Scope bullet to end with `(permanent[: why])` or
`(deferred: <pointer>)`. Writing `(permanent: the `archive()` helper keeps originals...)` reports
the bullet as having no disposition: the nested `()` in a function name is what the matcher latches
onto, and it finds an empty parenthetical rather than the real one.

Found 2026-08-28 while authoring ADR-004. Two other bullets in the same section, identical in shape
but with no nested parens, passed. Worked around by writing "the `archive` helper" instead.

Small, and advisory rather than blocking, so nothing was mis-gated. Worth fixing because the failure
mode is an author reading "needs a disposition" over a bullet that visibly has one, and concluding
the gate is wrong — which is how a gate stops being read. The fix is to match the LAST balanced
parenthetical rather than the last `(...)` run, or simply to anchor on the `permanent:`/`deferred:`
keyword.

## 38. One of three closed 2026-08-28; the two runner questions stay open

**Met again 2026-08-28, by ADR-010's spec.** All 17 facts and all 7 scenarios are bound and passing;
`spec-verify --implemented` still reports `[PARTIAL]`. The facts resolve through a `Cmd` override —
the scenarios have no such column, and this repository declares no `package.json`, so no runner is
detected for `tests/`. The gate is right to say UNRUN rather than green, and the spec's status stays
Draft rather than being talked up. Two candidate closes, in order of honesty: give scenarios a `Cmd`
column, or let spec-verify accept a repository-level runner declaration. Adding a `package.json` this
project does not otherwise need would be shaping the repository to satisfy the gate.

**CLOSED — `--spec --collect` no longer reports a collector it could not run as an absent test.**
`test_exists` returns `unrun` when the collector cannot start, and also when it exits nonzero having
printed nothing at all, which is a collector falling over rather than one reporting an absence. The
run path's tri-state made this cheap; ADR-005 deferred it only because that change was scoped to the
run verdict.

**STILL OPEN:** no `go test` in `cmds` and no Go branch in `detect_stack`, so Go corpora are told
honestly that they cannot be adjudicated but still cannot be; and scenarios have no `Cmd` column, so
a scenario binding has no authoring escape at all. Both below, unchanged.

## 38 (superseded). Three things ADR-005 deferred about spec-verify

ADR-005 gave "could not run" its own verdict, exit code and status word. Three related gaps stay
open, all named rather than fixed, all cheap to reopen.

**`--spec --collect` has the same defect one mode over.** `test_exists()` at `bin/spec-verify:356`
returns `False` when the COLLECTOR could not be run, and line 571 renders that as `bound test not
found`, exit 2 — a command that did not run, reported as an observation about the repository. Found
by ADR-005 T1's own class sweep, not by the report. Not fixed there because the owner scoped that
change to the run verdict, and fixing it threads the same tri-state through a second mode. The other
returns in `test_exists()` are honest: they really did look, and really did not find it.

**No `go test` in `cmds`, and no Go branch in `detect_stack`.** This is what produced the report:
Go corpora cannot be adjudicated at all. They are now told so honestly, which is the whole of
ADR-005, but told-so is not the same as supported. Adding a runner is its own decision — binding
grammar (`pkg::TestName`? `./...`?), how `-run` anchors, and what a passing-but-empty run means, all
of which the `-run` fence trap in the task template already shows is easy to get wrong.

**Scenarios have no `Cmd` column.** A fact can override its runner per row; a scenario cannot, so
for a scenario binding there is no authoring escape at all. Noted in the file since 2026-08-23 and
still true. It is the reason "just use a Cmd override" is not a complete answer to the item above.

## 39. The vacuous mutation, still unsolved, and a baseline that trusts a flaky suite

Both deferred by ADR-006, which chose a baseline over coverage and says plainly which class that
does NOT cover.

**A vacuous assertion is invisible to every mechanism considered.** Measured 2026-08-28 with a
six-line fixture: `assert.deepEqual(uncovered(...), [])` against a subject mutated to return `[]`
passes with the mechanism broken, at 100% line AND 100% branch coverage, before and after. Coverage
cannot see it, because the line really does execute. A differential cannot either, because a vacuous
assertion produces no difference. Four instances in this repository so far — ADR-003 T1's first
version, `judge: a blank line ends a bullet`, `verify: the mutant warning is flushed`, and the
staleness check shipped 2026-08-28, which was written to enforce ADR-003 and violated it.

What works today is the discipline ADR-003 already requires: feed the predicate a synthetic input
that MUST produce a finding, before trusting it. Applied by hand three times, caught the fourth. The
open question is whether it can be automated at all — a checker would have to know what the
assertion is FOR, which is close to knowing the specification. Worth an experiment before an ADR:
take the four known instances and see whether any mechanical property separates them from healthy
assertions. If none does, that is a finding worth writing down rather than a gap to keep open.

**A baseline is only as good as the suite under it.** If a test-set is flaky, its baseline pass is
luck, and every verdict beneath it inherits that luck. The campaign already depends on this — today
silently, since it takes no baseline at all — and ADR-006 makes the dependency visible by naming the
set rather than fixing it. §34 is the precedent for what fixing it looks like: the coverage jitter
was cured by finding the mechanism (`--test-concurrency=1`), not by widening a threshold.

## 40. Two fixes that inherited the defect they were fixing

Found 2026-08-28 by an independent review (Codex gpt-5.6-sol, xhigh, read-only) over the ten gates
and an eighteen-commit diff. Both findings were in code written that same morning to remove exactly
this class — a gate reporting an observation it did not make.

**The regex fix narrowed the bug instead of removing it.** `starts_regex` treated every `)` as a
value, so `if (ready) /it's/.test(v)` read the `/` as division, the apostrophe opened a phantom
string, and the file's tests vanished again. Reproduced, and worse than the original: the probe
returned nothing rather than a subset.

The comment that left the hole said division is "the safe direction". That was backwards, and being
backwards in a comment is how it survived review — mine. Guessing regex blanks to end of line;
guessing division lets an apostrophe run to the next one **anywhere in the file**. The lesson
generalises past this file: when a heuristic can err either way, work out which error is BOUNDED
before deciding which way to lean, and write that reasoning down rather than the conclusion. The
real fix was not the `)` case at all — a `'` or `"` string cannot span a line in JavaScript, so an
unterminated one is not a string, and that bounds every future mis-detection to one line.

**The baseline inherited it too.** ADR-006's baseline stored a timed-out `spawnSync` as a plain
`false`, so the report said the suite had "already failed — repair that suite". Nothing failed;
`{status: null, signal: SIGTERM}` is no verdict at all. The mechanism written that morning to stop a
runner claiming an unobserved outcome claimed one itself, one layer up. Now `pass | fail | unrun`
with a cause, and the two cases say different things because they need different actions.

**What to take from it:** a fix for a class is not evidence that the class is gone from the fix.
Both were found by a reviewer with no stake in the fix being right, after two of my own sweeps came
back clean — and both of my sweeps were grep-shaped while the defect is prose-shaped. Reach for an
independent read when the thing being audited is your own reasoning.

**One mutation was GREEN and stayed unnoticed until the campaign ran it.** The control-header branch
was satisfied by the line-bound fix, so deleting it changed nothing observable. It turned out to be
load-bearing for exactly one shape — a regex and a test definition sharing a line — which is now the
test. A defence-in-depth branch nobody can make fail is indistinguishable from a dead one.

## 41. Two questions ADR-007 deferred about cross-record relationships

**`Consumes` still scavenges T-ids, and a qualified id there binds locally.** Found by ADR-007 T1's
class sweep, which turned up NINE sites using the same `(?<!\w)T\d+(?!\w)` scavenge where the task
had listed two. `Depends-on` is fixed; `Consumes` is the one other place an author could plausibly
write `ADR-003-T4`, and today it would produce a silent local `T4` edge. ADR-007 puts `Consumes` out
of scope so that a regression in one edge source can be attributed, which is the right call for one
change and leaves this open. The other six sites scan content that is local by construction.

**Ordering is not the only cross-record relation.** "Supersedes", "invalidates", "measured on the
pipeline that" — the reporting team counted 41 of 94 task files (44%) mentioning a foreign ADR in
prose across 44 distinct pairs, and not all of those are dependencies. ADR-007 makes `Depends-on`
carry the ORDERING relation and leaves every other one as prose. Worth deciding, before adding a
second field, whether this is one field or a small vocabulary — and worth noticing that the answer
changes what `adr-context`'s graveyard can show, since "decided against" is exactly one of these
relations already resolved by other means.

**The 44% figure is theirs, not ours.** It was measured 2026-08-28 on a 94-task corpus this
repository has never seen, and it is doing real work in ADR-007's Alternatives — it is the reason
inferring edges from prose was rejected. A number carried into a decision should be re-measurable by
whoever reads the decision later. This corpus has 11 task files, so it cannot confirm or refute it;
if the harness is ever pointed at another corpus of that size, re-run the count and record it here
either way. A figure that can only ever be cited is one nobody can check.

## 42. The published history still holds what was already published

**Deferred here by ADR-008** (`docs/adr/ADR-008-the-plugin-is-not-the-repository.md`, Out of
Scope, and by both its tasks): rewriting history to purge what has already been published.

`evals/results/` is untracked and the gate that missed it now reads everything git tracks. Neither
touches what is already in the history of a PUBLIC repository: 18 `aggregate-result.json` files
carrying the author's absolute home path to this checkout, committed 2026-08-26 through
2026-08-28. (Not quoted here — writing it out would re-commit the very string this entry is
about, and the new check refuses it. That refusal is the entry's own first demonstration.)

**What is actually exposed, measured rather than feared:** a username and a directory layout. No
credentials — the `sk-` match was the word "desk-checked" and `TOKEN` was `_TOKEN = re.compile(...)`
in a model's answer about parsing durations. No corpus content: the one case that ran against a
171-record snapshot stores 2,844 bytes of scores and grader explanations, because its graders are
`tool_order` and `file_exists` rather than LLM judges. The model transcripts that ARE stored belong
to this repository's own synthetic prompts, which are public in `evals/*/prompt.md` anyway.

**The decision left open:** purging it needs a history rewrite and a force-push on a public
repository, which breaks every existing clone and every commit SHA quoted in this backlog, in eight
ADRs, and in their Verification Logs. That last part matters more here than in most repositories —
the evidence chain records `git-sha` per verification entry, so a rewrite invalidates the corpus's
own provenance while removing a username.

Recommendation, unless the owner disagrees: **do not rewrite.** The exposure is a home path;
the cost is every recorded SHA in the decision corpus. Revisit only if something worse is found in
history — and the way to find out is to scan it, which nothing has yet done systematically.

**Worth doing either way:** run the new personal-path check over history, not just the working tree,
so the claim "only a username" is measured rather than assumed.

## 43. Two outside papers, read 2026-08-28 — what they had that we did not

Read against this corpus rather than summarised. Most of both was already here under other
names; three things were not, and one of them contradicts the other paper.

**TRAJECTORY vs OUTCOME (Google's SDLC guide, via Özel).** "Output evaluation asks whether the
function produced the right result; trajectory evaluation asks whether the agent understood the
problem before generating it." That named a gap we could point at: `adr-lint` required Ordered Steps
step 1 to SAY "establish the failing test", and accepted a task as done if ANY log entry said exit 0.
Nothing checked the red run came first. Fixed the same day as advice — with a killed mutant as an
exemption, because that proves the same property from the other side. The concept was already in the
EVAL suite as `tool_order` graders and had never reached the evidence chain.

**ENFORCEMENT LINKAGE (Wasowski, ADR-as-spec).** "Every ADR points to the mechanism that enforces it;
every mechanism points to the code it governs." We have the second half — `Governs:` plus
`adr-context`. We have no first half: a record names the files it owns and never the check that fails
when someone violates the decision. Task `Acceptance` proves the task got DONE, which is a different
question from whether the decision still HOLDS a year later. ADR-009 proposes `Enforced-by:`.

**The two papers contradict each other, and we can settle it.** Wasowski wants accepted ADRs loaded
into an "architectural constitution" at the start of every agent session. Google's guide says static
context "wastes tokens, dilutes signal, and can actively degrade agent performance by burying
critical rules under noise". §35 measured exactly that here: three instructions, ablated, all three
inert. Our evidence backs the second, which is why `adr-context` fires on the first edit to a
governed file rather than at load time. Worth writing down, because a reader of the first paper would
think we had missed something.

**Already ours, under their vocabulary** — useful for talking to people who have read them:
`strictFrom` is their **freeze baseline** ("freeze existing violations as accepted debt, block only
new ones; skip it and the team mutes the tests within a week"); the `work` skill's risk table is
their **exception-driven review board** and **three response tiers**; skills-that-load-on-demand is
their **dynamic context**; §36's thesis is Wasowski's "a rule an agent never reads is operationally
dead".

**Numbers worth keeping, and the caveat that goes with them.** A 2023 study of 900+ open-source
repositories found roughly half the projects with ADRs have only ONE TO FIVE — tried once, never
maintained. We have eight, all from one day, which is precisely where those projects stopped. A
documented rollout across 802 developers doubled throughput while human review coverage fell 89% to
68% — the sharp framing is whether the freed capacity was replaced by an invariant or by nothing.
And "Agent = Model + Harness": one team moved from outside the Top 30 to Top 5 on Terminal Bench 2.0
by changing only the harness, and LangChain raised a score 13.7 points through prompt, tools and
middleware on a fixed model.

**Every one of those figures is second-hand**, from a Medium summary of a Google whitepaper and from
a Medium essay. This project's own rule is to date a number and name what it was measured against,
so none of them should enter a skill, a README or an ADR until read at the primary source. They are
recorded here as leads, not as evidence.

**What to reject.** Wasowski's policy-as-code layer BLOCKS the operation outright, which is the
opposite of this project's standing rule — and the reason here is better than his: a block leaves the
user with no next move. He concedes the tooling in that class is cloud-security rather than
architecture boundaries, "a documented gap, not a ready solution".

## 44. PARTLY CLOSED 2026-08-29 — one pointer left, and a backfill nobody should rush

**Deferred here by ADR-009** (`docs/adr/ADR-009-a-decision-names-what-enforces-it.md`, Out of Scope,
and by both its tasks).

**Backfilling `Enforced-by:` into the eight existing records.** Deliberately not part of ADR-009:
writing the header is one commit, deciding what actually enforces each of eight decisions is eight
judgements, and doing them under the momentum of shipping the mechanism is how a field gets filled in
to satisfy a gate rather than to say something true. Worth doing one record at a time, and worth
noticing which ones honestly answer `None`.

**`Cross-references:` and `Invalidates:` resolve to nothing.** Found by ADR-009 T1's class sweep
rather than reported: `Spec:` and `Governs:` are resolved by the lint today, and those two are not.
A record can cite an ADR that does not exist, or claim to invalidate one, and no gate notices. That
is the same rot `Enforced-by:` is being built to avoid, already present in two headers this corpus
uses on every record. Cheap to close once T1's resolution machinery exists — which is the argument
for closing it then rather than now.

**Taken up 2026-08-29 by ADR-011** (`docs/adr/ADR-011-a-pointer-resolves-or-it-is-reported.md`),
which resolves `Cross-references:` and `Invalidates:` alongside §45's `Governs:`. Two items stay
here, deferred by ADR-011 and by its T1: **backfilling `Enforced-by:` into the seven records that
lack it** — unchanged in its reasoning, seven judgements that must not be made under the momentum of
shipping a mechanism — and **resolving a `§NN` fragment in `Cross-references:` to a heading in the
file it names**, which ADR-011 resolves the file for and the fragment not at all.

**Backfill DONE 2026-08-29. All eleven records now name what catches a violation, and every pointer
resolves.** Chosen one record at a time by reading each Decision and asking what actually goes red
when that decision is broken — not by scanning for a plausible label:

| record | the check it names | form |
|---|---|---|
| ADR-001 | `link: no skill is ever linked` | mutation |
| ADR-002 | `verify: a killed mutant run is journalled so the next one restores it` | mutation |
| ADR-003 | `tests/package.test.mjs::every shipped gate carries at least one mutation` | **test** |
| ADR-004 | `link: no template is linked either` | mutation |
| ADR-005 | `spec-verify: a test that never ran is not reported as failing` | mutation |
| ADR-006 | `mutate: a verdict against a failing baseline is not counted as noticed` | mutation |
| ADR-007 | `lint: a cross-record dependency must resolve to a real task`, `next: a foreign dependency that is not done blocks` | mutation ×2 |
| ADR-010 | already carried one | mutation |

**Nine of the ten pointers are catalogue labels, which is the strongest form** — the campaign grades
each RED or GREEN on every run, so the claim is measured rather than asserted. **And it was measured
rather than assumed**: `resolve_enforcement` proves only that a label EXISTS in the catalogue, so
every one was run —

    node scripts/mutate.mjs --case '<label>'

— 2026-08-29, all **RED**, including ADR-008's and ADR-010's pre-existing pointers. Without that run
this table would have claimed the measured form on the strength of a lookup, which is exactly the
risk ADR-009's own table names: *`Enforced-by:` names a check that exists and cannot fail.* ADR-010's
pointer was already in place and is listed for completeness, not chosen here. `adr-context
plugin/bin/adr-lint` now answers with four governing records and the check that catches each, which
is the chain ADR-009 was built for, finally complete.

**ADR-003's is the weak one, and it is labelled weak deliberately.** Its decision is "every gate
asserts an observable property that no restructuring can satisfy" — a property no single mutation can
enforce, because it is about the SHAPE of every future check rather than about one mechanism. The
test it names enforces the PROXY: every shipped gate must carry at least one mutation, and a shape
assertion cannot carry one that fails. That is real enforcement and it is not the same thing, so the
record says `test` rather than pretending to a measured claim.

**§44 asked which records would honestly answer `None`, and the answer here is none of them** — which
is a fact about this corpus rather than a general one. Every decision in it is about a mechanism the
campaign already mutates. A corpus of "we chose Postgres" decisions would answer `None` far more
often, and ADR-009 is explicit that this is a first-class answer.

**Still open:** resolving a `§NN` fragment in `Cross-references:` to a heading in the file it names.
ADR-011 resolves the file and leaves the fragment alone rather than guessing at it.

## 45. CLOSED 2026-08-29 — a `Governs:` path that names nothing is now reported

**Found while executing ADR-008 T2, 2026-08-28, and it is §44's third pointer wearing a different
hat.** Moving the plugin under `plugin/` re-anchored every path in the repository — and silently
un-governed the whole corpus. Seven of nine records carried a `Governs:` line naming `bin/adr-lint`,
`templates/task-template.md` and so on; after the move none of those paths existed, so
`adr-context plugin/bin/adr-lint` answered `none governs` and every accepted decision about the gates
stopped reaching the session that edits them. `adr-lint` passed throughout. Nothing was wrong with
any record; nothing said the pointers had rotted.

The paths were re-anchored in the same commit, so the corpus governs again. What is left is the
gate: `Governs:` is resolved for SHAPE but never against the tree, so a path that names nothing reads
exactly like a path that names something. §44 already carries `Cross-references:` and `Invalidates:`,
which have the same hole; this is the third, and it is the one with live consequences rather than
documentary ones — the other two mislead a reader, this one turns off a mechanism.

Advice, never blocking, for the reason ADR-009 gives: a corpus adopting this on a tree it did not
write will light up, and a gate that fails on day one is a gate people switch off. A glob (`bin/**`)
resolves when it matches at least one file.

**CLOSED 2026-08-29 by ADR-011** (`docs/adr/ADR-011-a-pointer-resolves-or-it-is-reported.md`,
Accepted, both tasks carrying tool-written evidence). `adr-lint::check_pointers` resolves every
declared path against `git ls-files` — never the filesystem, because a path check over the disk
answers "is this on THIS machine" (ADR-008) — and advises when one matches nothing. A glob resolves
on at least one match, exactly as this entry asked. `adr-state` reports the same thing from the tool
that answers *what governs what*, which is where the original failure was visible: it had less to
say, and less to say reads as a clean corpus.

Measured in both directions, because a check that reports clean must be shown able to report dirty:
silent on all eleven records here, and on a clone with ADR-003's `Governs:` pointed at
`tests/mutations-GONE.json` both the lint and `adr-state` name the miss. The catalogue carries
`lint: a Governs path that matches nothing tracked is reported` — which is also the string ADR-011's
own `Enforced-by:` header names, so the record's pointer to its own check resolves.

Left open deliberately, and named in ADR-011's Out of Scope: making this BLOCKING. It stays advice
for the reason this entry gives and one ADR-011 adds — a blocking version would have failed this
entire corpus for the two days after ADR-008 moved the tree, during which nothing was wrong with any
record.

## 46. CLOSED 2026-08-28 — an acceptance fence that passed when its runner never started

**CLOSED 2026-08-28.** The template now recommends `set -o pipefail` and `&&`; the ten fences that
inherited the broken form are repaired, and each was re-recorded — a fresh killed mutant and a fresh
exit-0 entry, twenty tool runs, because editing a fence invalidates the evidence taken under it.

The gate that keeps it closed is two halves. A shape check over every fence, which this project
normally refuses (ADR-003) and which earns the exception here: the property is about the shell's
exit-status plumbing, and every fence in this corpus runs a suite that passes, so no behavioural test
over this corpus can tell the two forms apart. And a behavioural half that runs both forms against an
absent runner and asserts they differ.

Two narrowings the gate needed, each a finding in itself. The Verification and Mutation Log sections
are exempt, because an entry quotes the command it actually ran and the log is append-only — flagging
recorded history would make the only correct response an edit nobody may make. And the prose rule
applies to `plugin/templates/` alone, because text cannot be told apart from what it describes: a
task explaining the defect matches the same pattern as one recommending it.


**Found by a cold review of ADR-010, 2026-08-28, in the pattern this project's own task template
recommends.** The template's suggested fence is

    <runner> <args> 2>&1 | tee /tmp/acc.out; ! grep -qE "no tests to run|^FAIL|^--- FAIL" /tmp/acc.out

and the pipeline's exit status is `tee`'s, which `;` then discards. The only thing tested is the
`grep`. When the runner never starts — `node: command not found`, a killed process, an early runner
error — its message matches none of the patterns, so `! grep` succeeds and **the fence exits 0**.
Measured: `nosuchrunner --test x` through that form exits 0; through `set -o pipefail` and `&&` it
exits 127.

`adr-verify` does not catch it either. `scored_nothing()` only fires on a runner's own
"nothing to run" vocabulary, and `environment_failure()` is consulted only when the exit code is
already non-zero — so a fence whose runner is absent is recorded as a tool-written exit-0 claim.
That is the anti-fabrication chain's own hole, and it is the reason this entry is not merely tidy-up.

**Scope: 12 task fences across the corpus, plus `templates/task-template.md` itself**, which ships to
every user. The correct form, measured against four cases (runner absent, real passing suite, missing
test file, a command that exits 0 having scored nothing):

    set -o pipefail
    <runner> <args> 2>&1 | tee /tmp/acc.out && ! grep -qE "no tests to run|^FAIL|^--- FAIL" /tmp/acc.out

Repairing a fence invalidates the evidence recorded under it — the digest changes — so each of the 12
needs re-recording with `adr-verify` on a clean tree. That is the cost, and it is why this is filed
rather than done inside ADR-010: it is a corpus-wide repair with its own evidence to regenerate, and
ADR-010's own fences already use the corrected form.

## 47. CLOSED 2026-08-29 — the writer emitted a width no reader accepted

**Found by a cold review of the sweep, 2026-08-28, and deliberately not fixed there** — both are
pre-existing in `adr-lint`'s own grammar, and changing one side alone would make the writer and the
reader disagree, which is the failure the sweep exists to detect.

**The sha range is narrower than git's.** Both tools accept `[0-9a-f]{7,40}` in a Verification Log
entry. `git rev-parse --short` honours `core.abbrev`, which git allows down to 4, and a repository on
SHA-256 emits up to 64. So `adr-verify` can WRITE an entry that `adr-lint` rejects and the sweep
cannot read — and a claim the sweep cannot read silently leaves the denominator, which makes the
false-success rate look better. Fix both grammars together, with a boundary case at each end.

**Record-number resolution differs.** `adr-lint::adr_number()` reads the record's own title
(`# ADR-014: …`) or its filename; `adr-verify::record_number_of()` scans the resolved path
components in reverse. They diverge on: a numeric filename with no `ADR-` prefix, `ADR-000` (where
`(record_number_of(t) or cutoff)` treats zero as absent), and a task under an ancestor directory that
merely looks like a record. Either tool can therefore demote under `strictFrom` where the other checks
in full. Fix by giving `adr-verify` the owning-record semantics `adr-lint` already has, with parity
cases for all three.

Both are about the same property: **the writer and the reader of the evidence chain must agree on what
an entry is.** A third implementation would make it worse; the right shape is one grammar with two
call sites, and the standing reason they are separate — the gates are standalone scripts with no
import path — is what makes this cost real rather than theoretical.

**CLOSED 2026-08-29.** Both halves fixed, and the reproduction found the entry understated one of
them. `SHA_FIELD` is now one named constant per gate — five literal copies collapsed in `adr-lint`,
one in `adr-verify` — accepting `[0-9a-f]{4,64}`, which is what git can actually emit. The
boundaries are measured rather than reasoned: `git -c core.abbrev=4 rev-parse --short HEAD` returned
`6aaf`, and a real `git init --object-format=sha256` repository returned a 64-character sha. Both are
in `tests/gate-regressions.py::SHA_GRAMMAR`, which every reader on both sides is checked against, so
3 and 65 still fail and no width git produces does.

**What the entry got wrong, and it matters.** This was filed as "adr-verify can WRITE an entry that
adr-lint rejects", a measurement problem. Reproduced 2026-08-29 on a clone with `core.abbrev=4`:
adr-verify wrote `- … · 6aaf* · exit 0 · …` and exited 0, and **both** readers rejected it —
`adr-verify`'s own `CLAIM_RE` included. So one cause has two consequences, and the second is worse
than the first. The sweep drops the claim from its denominator, which flatters the false-success
rate; and `adr-lint`'s refusal of a `done` row without a matching exit-0 entry is BLOCKING, so a
corpus with `core.abbrev < 7` cannot mark anything done using evidence the tool itself just wrote.
A gate bricking a record over a config value nobody set deliberately is the failure this project
exists to not have.

Widening the readers closes today's gap. What closes the next one is that `adr-verify` now checks
every entry against the grammar BEFORE writing it and refuses rather than emitting a line nothing can
read — the width is decided by `core.abbrev`, in a config file the tool does not own.

**The record-number half is fixed and was NOT a false-success hole**, which is worth recording
because the entry implied it was. `record_number_of` scanned every resolved path component in
reverse, so a task under `~/adr-42-notes/proj/probe/tasks/` inherited ADR-42 from somebody's
directory name. It now reads the OWNING record — the directory the `tasks/` directory sits in — with
`adr-lint::adr_number`'s rules, title first then name. And `(record_number_of(t) or cutoff) < cutoff`
became `demoted_by(number, cutoff)` with an explicit `is None`, because the falsy-or could not say
"this record is number zero". Checked rather than assumed: for ADR-000 and for a numeric filename,
`0 or cutoff` and `None or cutoff` both yield `cutoff`, so `cutoff < cutoff` is False and the record
was **checked in full**. Every divergence measured erred STRICT. The reason to fix it anyway is that
the next reader of that line has to re-derive which direction it fails in before they can trust it.

**A pre-existing test asserted the wrong premise, and is corrected in place.**
`tests/sweep.test.mjs::a forty-character sha is a claim and a six-character one is not` said in its
own comment that "six is below anything git produces". It is not. The test now asserts every width
git can emit (4, 6, 7, 40, 64) is a claim and that 3 and 65 are not, and carries the measurement.

**Superseded by the above; kept for the reasoning.** Deliberately left by ADR-011 (`docs/adr/ADR-011-a-pointer-resolves-or-it-is-reported.md`,
Out of Scope). ADR-011 ships one rule as two implementations, which is the opposite shape, and its
Alternatives section states why the two cases differ: this entry is a WRITER and a READER of one
evidence grammar, where a divergence silently drops claims from a denominator, while `Governs:` and
its siblings are two readers of a header a human wrote. Nothing in ADR-011 makes this cheaper or
harder; it is the next item.

## 48. CLOSED 2026-08-29 — `work-next` called a Proposed record's tasks ready

**Found 2026-08-29 by authoring ADR-011, which is the first Proposed record in this corpus to carry
task files.** `node plugin/scripts/work-next.mjs` printed:

    10 record(s), 10 accepted, 20 task file(s), 2 spec(s).

    Next: /adr-execute <adr>
      because an Accepted ADR has tasks that are ready and not yet done.
        docs/adr/ADR-011-.../tasks/T1-resolve-the-three-pointers.md
        docs/adr/ADR-011-.../tasks/T2-say-it-where-authority-is-answered.md

ADR-011 is **Proposed**. `adr-state.mjs` on the same tree gets it right — "1 record(s) are Proposed
or Draft and govern nothing yet, which is correct — they are not counted above" — and the two tools
read the same corpus.

The cause is that `observe()` builds `ready` from `taskFiles(directory)`, a filesystem walk, and
filters each file on "no exit-0 Verification Log entry" plus "has an `## Acceptance` section"
(`plugin/scripts/work-next.mjs:105-110`). The owning record's status is never consulted; `corpus` is
read for `accepted` and `retirable` and never joined to the task files. So the recommendation is
correct about the FILES and wrong about the RECORD, and the reason line asserts a status the tool
did not check — a gate reporting an observation it did not make (CLAUDE.md §3, ADR-005).

The consequence is the one CLAUDE.md §10 exists to prevent: a session that follows `work-next`
executes a decision nobody accepted. `adr-lint` catches the tail of it — a `done` row on a Proposed
record is refused — but only after the work is done.

**The class, and the second member.** Every observation in `observe()` that is derived from task
files without joining them to their record's status. Enumerated 2026-08-29:

    grep -n "tasks.filter\|corpus.filter" plugin/scripts/work-next.mjs

Four call sites returned. `retirable` filters `corpus` and is status-aware. `ready` and `unbacked`
both filter `tasks` and are not. The `accepted` count is right by ACCIDENT rather than by checking:
the printed line reads `10 record(s), 10 accepted` on a tree holding eleven records, because
`statusKind` returns `null` for `Proposed` and `corpusRecords` files ADR-011 under `unreadable`. So
`records` silently undercounts the corpus by one, and a reader who checks 10 against 11 is right to
be suspicious of both numbers. `unbacked` is the milder member — it names a task claiming `done`
with no evidence, which is worth reporting whatever the record's status — but its stage line says
"recording evidence for finished work", and on a Proposed record there is no finished work to record.

**FIXED 2026-08-29, both halves.** `adrCorpus` now attaches `taskFiles` to every record, by the same
attribution its governed-path union already used — so the join exists once, at the reader, rather
than being re-derived by each consumer. `observe()` intersects the filesystem walk with it: a task is
`ready` only when the record that owns it is `governing`.

The second half was the harder one and is the reason the first fix alone would have been wrong. A
`Proposed` record is not merely non-governing — `statusKind` returns null for it, so it never enters
`corpus` at all and lands on the non-enumerable `unreadable` list. Its task files therefore had no
owner to find, and filtering on ownership alone would have silently dropped them: a corpus whose only
unfinished work sits under an unaccepted record would have read as finished. So `unreadable` entries
now carry `taskFiles` too (`taskFilesFor`, extracted so one attribution rule serves both branches),
and `work-next` reports them:

    1 unfinished task file(s) belong to a record this reader cannot execute — Proposed, Draft, or a
    status it does not recognise. They are not counted as ready, because a record is a work order
    only once it is Accepted:
      docs/adr/ADR-099-proposed/tasks/T1-x.md

Measured on a clone carrying one Proposed record with one unfinished task. Before: `Next:
/adr-execute — because an Accepted ADR has tasks that are ready`, naming that task. After: the line
above, and no stage proposed.

The count is fixed too. `10 record(s), 10 accepted` on a tree of eleven was right by EXCLUSION, which
is indistinguishable from right by checking; the line now ends `1 further record(s) carry a status
this reader does not act on.`

**Three catalogue anchors were orphaned by these edits** — `context: a shared tasks directory is
attributed, not assumed` and `state: a record that cannot be read is reported` both went to `matches
0x`, caught by `tests/package.test.mjs`. Re-pointed at the same mechanisms. That is the third time in
one session an edit to a guard line silently disturbed the mutation catalogue, and the general rule
is worth stating: **editing a gate's guard lines is an edit to `tests/mutations.json`, and only
`package.test.mjs` says so.**

**Original fix shape, kept for the reasoning.** Attribute each task file to its record the way
`lifecycle.mjs::corpusRecords` already does — `taskDirectoriesFor`, plus the `ADR-NNN` in a task title, and REUSE its `recordsPerDirectory`
/ `sole` guard rather than re-deriving the attribution, or the join acquires the "every record claims
its neighbours' files" bug the comment at `plugin/scripts/lifecycle.mjs:~2270` records. Then drop
tasks whose record is not `governing` from `ready`. Say what was dropped rather than dropping it in silence — a corpus whose
task files cannot be attributed must report that, not report zero.

## Verification claims worth re-running after any of the above

- `bash scripts/selftest.sh` → 72/72, on any branch (item 4) and as evidence (item 6).
- `bash scripts/coverage.sh` → JS 92.77/84.24/92.54, Python gates 63%, both above their floor.
- The 8 gates under `PYTHONIOENCODING=cp1252` against `tests/fixtures/ok` → 8/8, and the
  `adr-verify`-written evidence row shows `c2 b7` under `cat -A` / `od` (macOS `cat` has
  no `-A`; use `od -c`).
- Items 1 and 3 both need per-segment / transcript-level tests — their live repros came
  from a session transcript, not from unit inputs, and whole-command tests stay green
  while the bug bites.
- Nothing in 2.0.12-2.0.15 was verified live, for the reason in item 12: the hooks acting
  on a session run from a different clone than the one being edited.
