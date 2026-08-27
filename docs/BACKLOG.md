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

**Deferred here by ADR-001** (`docs/adr/ADR-001-skills-are-never-linked.md`, Out of Scope): making
templates release-proof the way gates are, so they stop needing a `--link --apply` repoint after
every release. That ADR's Follow-up asks the narrower question first — whether the six links should
simply be removed, since nothing reads `~/.claude/templates` once the bare-name skills are gone.

**`archive()` copying a directory.** `linkPlan` now emits gates, shims and templates — all
files. `write()` is handed nothing else, so the `recursive: true` in `archive`'s `cpSync` is
reached, with a directory, only by the test written for it. That test constructs its own entry
and says so. The pair is self-referential: the fixture is the only thing that reaches the code
it tests, which is the exact shape `mutate-propose` exists to find. Kept because `write()` is
the only function here that deletes, and the cost of the flag is one word.

Both are the same class as item 21 in reverse — not a check that fires on nothing, but a
mechanism that nothing reaches. Neither costs anything until someone reads it and looks for
the thing it describes.

## 26. No answer for a fence that outruns the agent's tool timeout

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

## 27. A script that ends the process that imports it, and the three siblings still able to

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

## 28. Complexity as a conversation trigger, if anywhere

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

## 29. adr-judge reads a multi-line bullet as its first line only

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

## 31. The same case scores differently depending on how the suite is invoked

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

## 32. The runs where a skill fires are the runs that do not finish

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

## 34. JavaScript coverage jitters across its own floor

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
