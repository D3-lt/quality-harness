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

## 1. CLOSED — a commit gate where one unresolved Bash path bricked committing for the whole session (`a48c608`)

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

## 2. CLOSED — 13 `subprocess(text=True)` sites decoded with the locale codepage (`f26a4b3`)

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

## 3. CLOSED — branch-guard false positives: `shellSegments` split `2>&1` on the bare `&` (`c889429`)

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

## 4. CLOSED — the self-test was branch-sensitive: a fresh clone on `main` failed 1/51 (`0479057`)

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

## 5. CLOSED — D2 part 1 (`code_only` docstring/backtick fix) had no test (`b0d90a7`)

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

## 6. CLOSED 2026-09-02 — three found while fixing §2, §3 and §5; the fourth was left on purpose

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

---

**CLOSED 2026-09-02.** Verified against the code rather than read off the entry, because this
corpus keeps producing records that assert a defect already fixed:

    isPotentialMutationCommand('git fsck 2>&-')      -> false   (was: read as a write)
    isPotentialMutationCommand('echo x > /dev/null') -> false   (was: exclusion never applied)
    isPotentialMutationCommand('git fsck 2>&1')      -> false   (§3's control, still closed)
    isPotentialMutationCommand('echo x > out.txt')   -> true    (a real write still mutates)

The last line is the one that makes the other three mean something: without it the result is
equally consistent with a classifier that stopped reporting anything.

The first item was already `**Done — 2913b57**`; the fourth is a deliberate boundary, not debt.

**Why this sat unnoticed, and it is the finding worth keeping.** The heading read *"Found while
fixing 2, 3 and 5 — not fixed"*. `tests/package.test.mjs::the backlog index does not undersell`
exempts any section whose heading carries a closure word — and `fixed` is one, so the phrase **"not
fixed"** exempted this section from the check written to catch exactly it. The gate cannot see
negation, and the entry that says so most loudly is the one it skips.

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

## 7. CLOSED — a `python`/`node`/`ruby` in a *filename* made reads look like interpreter runs (`82f4758`)

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

## 8. CLOSED — a newline made the project's own gate stop counting as evidence (`6962cc7`)

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

## 10. CLOSED — set-level record gates were blocked at the per-write boundary (`3b9c44e`)

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

## 11. CLOSED — the branch guard blocked the escape it demands (`aaaaf31`)

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

## 15. CLOSED — the harness only ever said no (`2.1.0`)

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

## 16. CLOSED — nothing ran the checks except a person who remembered to (`2.1.1`)

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

## 17. CLOSED 2026-08-25 — what Windows said once the suite stopped answering for it

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

## 23. CLOSED — the edit boundary blocked without preventing anything (all five gates)

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

## 29. CLOSED — FIXED 2026-08-27 — this entry was stale and is kept for the mechanism

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

## 30. PARTLY CLOSED 2026-09-01 — the eval suite has no working fixture mechanism

**Route 1 was taken, and this entry never said so** — the fourth record found stale in one direction
in a single day (§103). `plugin/scripts/eval-fixture.mjs` exists and does exactly what the "Two ways
out, neither taken yet" paragraph below proposes: it snapshots the corpus to temp and renders
`evals/templates/*.case.yaml` with the machine's own absolute path. Verified 2026-09-01 by running
it, not by reading it — exit 0, 22 records and 67 task files copied, every placeholder resolved.

**But no generated case had ever been RUN, and the printed command is why.** Measured the same day
by executing what the script prints:

    --eval-dir <absolute>     -> "must be a relative path inside the plugin"
    --eval-dir ../../../...   -> "must stay inside the plugin root (no ..)"
    --eval-dir evals/generated/cases <target `.`>  -> "No eval cases found"

The last one is CLAUDE.md §1's two roots reaching the eval runner: `--eval-dir` resolves against the
TARGET's plugin root, and from the repository root `.` is the repository while the plugin is
`plugin/`. Against `./plugin` the same command loaded the case and started running it.

**Fixed here.** `--out` outside the plugin is now refused before anything is copied, and the printed
target names the plugin instead of `.`. Both are covered by tests shown capable of failing: mutating
the target back to `.` reddens `a generate run snapshots the corpus and writes a runnable case`, and
disabling the refusal reddens `an out directory outside the plugin is refused, not printed as a
command`. The plugin root became a parameter of `main()` so the second is reachable without writing
into the real `plugin/` tree.

**The test was asserting a word it never checked.** `tests/eval-fixture.test.mjs::a generate run
snapshots the corpus and writes a runnable case` asserted `--eval-dir` matched a loose regex and
never looked at the target or at `..`, so "runnable" — the claim in its own name — was the one
property untested. Same shape as §80, in this repository's own suite.

**STILL OPEN, and it is the actual blocker on research gap 4.** The grader types the runner accepts,
read off its own rejection message rather than inferred:

    regex | tool_order | tool_used | file_exists | llm | baseline

**There is no command grader.** So the shape this entry calls the point — *"does what the model wrote
pass `adr-lint` with exit 0"* — cannot be expressed as a grader at all. The route left is two-phase:
run with `--keep-temp`, then run the real gate over the preserved sandbox and score that outside the
runner. That is arguably better, because the gate is then the actual shipped gate rather than a
re-implementation of it, but it is a design with choices and it needs its own record. **Nothing about
that is decided, and no gate-graded case exists.**

The entry as filed follows.

### As reported


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

## 31. CLOSED — FIXED — the case was bimodal, not invocation-dependent

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

### Taken up 2026-08-29 by ADR-012, which closes the reading half and defers three things here

**ADR-012** (`docs/adr/ADR-012-the-gates-reach-a-client-with-no-shell.md`, Proposed) ships
`plugin/bin/qh-mcp`: a stdio JSON-RPC server exposing the five gates that never execute corpus
content. The boundary it draws is sharper than the read-versus-write one this entry assumed, and it
was enumerated rather than recalled — `grep -n 'subprocess.run(' plugin/bin/*`, 2026-08-29:

`adr-lint`, `adr-debt` and `arch-lint` spawn only `git` with fixed argv; `adr-next` and `adr-judge`
spawn nothing. **`spec-verify` runs a `Cmd` override read from the spec file through `shell=True`
(:504), and `adr-verify` runs the task file's Acceptance fence through bash.** Those two execute text
the corpus supplies, and over MCP the client names the path — so exposing either turns "lint my ADRs"
into "run whatever is written in the file I point you at". They are not guarded by a flag; no
registrar exists that could register them.

Three items are deferred BACK here by that record, receipted below so the sweep can see them:

- **The mutation half on Desktop.** Deferred by ADR-012. Not by exposing `adr-verify --mutant` —
  that rewrites a file in a path the client names, and ADR-002's journal exists because the restore
  is dangerous *with* a process to run it; over MCP there is no hook at all, so a killed client
  leaves a mutated tree and nothing to restore it. The shape worth reaching for instead, credited to
  the agentsmemory session that suggested it 2026-08-29: **the client sends CONTENT and the server
  mutates its own copy**, never the server reaching into a path the client named. That inverts who
  owns the filesystem, which is the actual problem. A different tool with a different contract, not
  a flag on this one.
- **`server.WithInstructions` as a delivery channel.** Deferred by ADR-012, and the reason is a
  measurement nobody has taken. Recalled 2026-08-29 from the agentsmemory corpus: the instructions
  field is **confirmed on exactly one client (Claude Code) and UNMEASURED on Desktop**, and that
  project's own ADR-021 T3 live measurement has been pending a week. The transport is proven — 41
  tools over stdio, Desktop spawning the bridge — but whether Desktop renders the instructions string
  into the model's context, and at what length, is not. So ADR-012 puts everything load-bearing in
  tool DESCRIPTIONS, which provably arrive because they are how the model learns a tool exists.
  ADR-012 T4 takes the measurement and reports it back to that corpus, which has the same task open.

  **MEASURED 2026-08-29 — Desktop does not render it, and the deferral was right.** Claude Desktop
  1.40609.0, macOS, with `MCP_DOCKER` and `agentsmemory` also registered. Asked before any tool call
  what the server's instructions say about its error channel — the one sentence unique to the
  instructions string and absent from all five tool descriptions — the session answered *"I don't
  have a separate server-instructions block for quality-harness — what loaded is the five tool
  descriptions."* It then reconstructed the finding/error split from the descriptions alone and got
  it differently, grounding "an error is a broken call" in `qh_adr_judge`'s description rather than
  in the server sentence, and never produced the could-not-run/found-nothing distinction.

  What makes this a null with evidence rather than a silence: the DESCRIPTIONS demonstrably arrived
  in the same session — all five summarised accurately, including `qh_adr_debt` exiting 1 on a
  dangling pointer — so the transport worked and the client dropped one field. Tool-choice crowding
  cannot explain it either, because an instructions block is not chosen by the model at all.

  Consequence: everything a Desktop user must know has to live in a tool description. Nothing here
  depends on the instructions string, so nothing changes — but the channel is confirmed unusable on
  this client, not merely unproven. One client, one version, one machine, one date: re-measure with
  the same probe rather than assuming it holds. Full write-up and probe design in ADR-012 T4's
  Status block; reported to the agentsmemory corpus as ADR-021 T3's answer.
- **`adr-state`, `adr-context` and `work-next` over MCP.** Deferred by ADR-012 T2. They are
  `plugin/scripts/*.mjs` rather than `plugin/bin/` gates, so they need a second spawn path and a
  second argument grammar; worth doing, and not worth folding into the record that establishes the
  boundary.

One constraint recorded rather than fixed: **a Desktop registration cannot be scoped.** Its bridge
takes no per-project argument, measured 2026-08-22 on a shipped Desktop registration, so any design
requiring a project notion is one Desktop cannot express. `qh-mcp` takes the corpus path per call.

**§33 is not closed by this.** ADR-012 closes the reading half. A Desktop user will be able to be
told what is wrong and will still not be able to record that they fixed it, because the two gates
that write this corpus's evidence are exactly the two Desktop cannot have. That is stated in the
record's own Consequences rather than left for a reader to discover.

### Shipped 2026-08-29 in v2.34.0 — T1-T3 executed, and a fourth item deferred back here

ADR-012 is **Accepted**, and T1, T2 and T3 each carry an exit-0 Verification Log entry and killed
mutations (5/5 noticed under `node scripts/mutate.mjs --case 'mcp:'`). `plugin/bin/qh-mcp` ships with
its Windows shim and its forwarder; `docs/mcp.md` carries the `claude_desktop_config.json` entry and
a smoke check. **T4 remains `pending`** — its acceptance is human-observed and needs a Claude Desktop
restart on the measuring machine.

**A fourth deferral, and the reason it exists is worth more than the item.** The paragraph above
enumerates "the seven gates in `plugin/bin/`". `plugin/bin/` holds **ten**. `adr-retire-check`,
`postmortem-verify` and `qh-root` were never classified by that enumeration and nobody noticed,
because every check downstream — the record's lint, the task's stop condition, the implementation
itself — was scoped to the five the table named. Re-run at execution time with
`grep -n 'subprocess\.\(run\|Popen\|call\|check_output\)\|shell=True' plugin/bin/adr-retire-check
plugin/bin/postmortem-verify plugin/bin/qh-root`, all three return **nothing**: they spawn no
subprocess at all, so they are reading gates and the safe set is eight, not five. The boundary held,
by luck rather than by design.

**The lesson is the general one and it is not about MCP.** A check scoped to the members a list names
can only ever confirm that list; it cannot detect that the list is short. Catching a missing member
requires enumerating from the SOURCE and diffing against the list, which is §5 of CLAUDE.md said
back to itself. Exposing those three is a scope change rather than a boundary change, and it is
deferred here.

## 34. CLOSED — FIXED — the coverage gate was rejecting good code one run in ten

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

### AMENDED AGAIN 2026-08-29 — the variance was the instrument, and the power table is retracted

The question above ("why does one case score 0.00 and 1.00 on identical inputs") has an answer, and
it is not the grader and not the model. **A run that ran out of turns was entering the arm mean as a
score of 0.00.**

The demonstration is within ONE fixed configuration, which is what the paragraph it replaces failed
to do. `gates-advise-never-block` at `maxTurns: 8` under `--ablation with-without`, n=26:

| | runs | scores |
|---|---|---|
| finished | 15 | all 1.00 |
| exhausted | 11 | all 0.00 |

The separation is total. There is no third value. The 0.00/1.00 "bimodality" was one binary — did
the transcript reach the answer before the ceiling — recorded as if it were a judgement about the
plugin.

**How an exhausted run is recognisable.** The eval harness reports it as a bare `exit 1: (no
stderr)`, which is indistinguishable from a crash until you compare `turns` against the case's own
`maxTurns`. Across the whole corpus that comparison is exact: of 35 errored runs, 32 have `turns` at
or past their ceiling, and every one of those 32 sits at exactly `maxTurns + 1`. The other three are
`interrupted` and `timed out after 300s`, which say nothing about the case and must not be reported
as a ceiling — the remedies are different knobs.

**The class, swept rather than remembered** (CLAUDE.md §5). One case is 49 of the corpus's 148 runs,
so the count had to come from all eight:

```
$ node scripts/eval-deltas.mjs        # the counts below are now part of its report
  adr-against-a-real-corpus       UNFINISHED — 8 of 23 recorded run(s) reached no answer (5 ran out of turns)
  adr-write-consults-the-corpus   UNFINISHED — 1 of 12 recorded run(s) reached no answer (1 ran out of turns)
  complexity-instruction-given    UNFINISHED — 2 of 13 recorded run(s) reached no answer (2 ran out of turns)
  gates-advise-never-block        UNFINISHED — 24 of 49 recorded run(s) reached no answer (24 ran out of turns)
```

Corpus-wide the sweep is 148 runs, 35 with an `error`, 32 of them at or past their own ceiling; the
other four cases (`complexity-instruction-omitted`, `done-needs-tool-written-evidence`,
`fence-warning-given`, `fence-warning-omitted`) have none. The three non-ceiling failures are
`interrupted` twice and one `timed out after 300s`.

Four of the eight cases are affected, and **every −1.00 Δ in the recorded corpus came from an
exhausted run** — two on `adr-against-a-real-corpus`, one on `gates-advise-never-block`. Those were
the most quoted numbers in this entry and in §36.

**The graders were right, and were not changed.** `does-not-halt` gained its "FAIL when there is no
answer to judge" clause deliberately, after thirteen truncated runs passed it — a boundary that
passes on silence refuses nobody. A grader of an answer should fail a transcript with no answer. The
defect is one level up: the arm mean must not contain a run that produced no observation at all
(ADR-005; CLAUDE.md §3, "a filter that matched nothing is *I could not look*"). `scripts/eval-deltas.mjs`
now drops such runs from both arms and reports `UNFINISHED — n of m recorded run(s) reached no
answer`, naming the ceiling count separately. Asserted by
`tests/eval-deltas.test.mjs::a run that never reached an answer is excluded, not scored zero` and
`::an unfinished run that did not run out of turns is not called a ceiling`, each showing the clean
answer beside the dirty one, and by three catalogue entries, all RED.

**The case's own `max_turns` was already raised to 14** on 2026-08-27 and no recorded run has
exhausted since. That half was done; what remained was that the recorded corpus mixes pre-fix and
post-fix runs and the instrument reported them as one population.

**RETRACTED: the power table above, and the sd 0.39 / 0.41 it rests on.** Those figures pool every
recorded run of the case across three different turn ceilings (6, 8, 14), two ablation modes, and two
revisions of the `does-not-halt` grader. A pooled absolute statistic over a case whose configuration
changed underneath it is exactly the error `eval-deltas.mjs` refuses for Δ — and this entry committed
it in the paragraph arguing for care. **Do not replace 264 with a smaller number derived the same
way.** A power calculation needs runs at one fixed configuration, and this corpus contains six such
runs at `maxTurns: 14`, which is not enough to estimate a standard deviation. The honest state is:
*the dominant variance component has been identified and removed from the instrument, and the
residual is unmeasured.*

**A comparability rule this uncovered, stated so it is not rediscovered.** `invokes-a-skill` is a
`tool_used` grader marked with-only. Under `--ablation with-without` it is reported and NOT scored;
under `--ablation none` it is scored. Identical behaviour therefore records 1.00 in the first mode
and 0.714 (5 of 7 weight) in the second. **Absolute scores from the two ablation modes are not on the
same scale** and must never be pooled or compared. This is by design, not a bug, and it is the whole
of the residual spread on the `maxTurns: 14` runs.

**UNPROVEN, and named rather than claimed.** `aggregate-result.json` records each grader's name, type
and weight, but not its prose. A grader whose text changed while keeping its name is invisible to any
check comparing configurations, so the tool cannot detect that kind of drift and does not claim to.


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

**Weakened again 2026-08-29, see §35's second amendment.** The span quoted in the paragraph above was
itself an artifact: half of that case's 49 recorded runs ran out of turns, and an exhausted run's
0.00 was entering the arm mean. With those removed the case has six paired invocations spanning 0.60,
and the −1.00 is gone — as is every other −1.00 in the corpus. So the `Δ 0.00` above is neither the
measurement nor evidence of noise on the scale previously claimed; it is one of six deltas from a
case whose residual variance has not been measured at a fixed configuration. The direction is still
unchanged and no instruction here has yet been shown to move behaviour. **The rule below continues to
stand on the campaign evidence, which none of this touches.**

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

## 37. CLOSED 2026-08-29 — a disposition containing parentheses is silently unrecognised

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

### CLOSED 2026-08-29 — and the entry above understated it, because it named one instance

**"Advisory rather than blocking, so nothing was mis-gated" is true of the instance and false of the
class.** Enumerated with a command rather than from memory:

```
$ grep -rn 'permanent\|deferred' plugin/bin/* plugin/scripts/*.mjs | grep -E 'r"|re\.'
plugin/bin/adr-debt:197          re.search(r"\(deferred:\s*([^)]*)\)", ln)
plugin/bin/adr-debt:216          re.search(r"\(deferred:\s*([^)]*)\)\s*$", s)
plugin/bin/adr-lint:233          r"\((?:permanent(?::[^)]*)?|deferred:\s*[^)\s][^)]*)\)\s*$"
plugin/bin/adr-retire-check:98   re.search(r"\(deferred:\s*[^)]+\)", line)
```

Four parsers, one root cause — `[^)]*` cannot cross the `)` of a nested pair — and three different
consequences, each reproduced on a fixture before being fixed:

| site | what it did with `(permanent: the `archive()` helper keeps originals)` |
|---|---|
| `adr-lint:233` | advised "needs a disposition" on a bullet that visibly carries one |
| `adr-debt:216` | reported `BROKEN [malformed]` — **a false finding, and `adr-debt` exits 1 on broken pointers** |
| `adr-debt:197` (architecture.md) | captured a **truncated** pointer (`docs/notes.md, see \`foo(1`) and resolved *that*, naming a path nobody wrote |
| `adr-retire-check:98` | unchanged — it needs existence, not a span, and still counted. Fixed for uniformity; **no defect is claimed here, because none could be demonstrated** |

So the blocking one, not the advisory one, is what this entry should have led with.

**The fix.** `disposition_span(text)` scans by paren DEPTH from each `(` that opens `permanent` or
`deferred`, and returns `(inner, start, end)` — the text and the bounds of the balanced group. It is
one body in three copies, because adr-lint, adr-debt and adr-retire-check are standalone scripts with
no import path between them (ADR-011 rejected a shared file under `bin/` for the concrete reason that
`standalone-link.mjs` generates a forwarder for every entry it finds there). The copies are bound by
`DISPOSITION_GRAMMAR` in `tests/gate-regressions.py`, run against all three modules — ADR-009's
`enforcement_pointers` lesson, applied again.

Position and grammar are asked separately, which the old single regex could not do: adr-lint requires
the disposition to END the bullet, so `- A (permanent: why) (see also)` is still named; adr-debt's
architecture.md scan deliberately does not require that.

**Two behaviours deliberately preserved, both found by re-reading the existing tests rather than by
the change.** `(deferred: )` and `(deferred:)` still report `BROKEN [empty]` — debt recorded by
someone who had not decided where it goes — and are NOT folded into `malformed`, which means the
parenthetical is not a deferral at all. And `adr-retire-check` still counts `(deferred: )` while not
counting `(deferred:)`, exactly as its old regex did.

Enforced-by: `tests/gates.test.mjs::focused false-green regressions remain closed` (which runs
`tests/gate-regressions.py`), and four catalogue entries, all RED.

### The series that followed, and the one measurement that justifies all of it

Four releases on 2026-08-29 — v2.31.1 nested parens, v2.31.2 a trailing full stop, v2.31.3 a wrapped
disposition and a deferral resolving on its leading record id, v2.31.4 nested children. Every one was
reported by a session running these gates over **another project's 44-record corpus**, and not one was
reachable from this repository's eleven records. Across the four: **15 broken pointers → 0, exit 1 →
exit 0**, attributed 13 / 1 to the gates and 1 to that corpus.

**What the last one measured, and it is the argument for the whole series.** Once the four false
disposition advices on one record were suppressed, a FIFTH bullet on the same record was found to
carry no disposition at all — a real finding, correct, and present the entire time. The reporter's
words: *"it was sitting fifth in a list of five where four were false … I read past that bullet twice
today."*

This repository already had the rule — `adr-judge::bullets`, 2026-08-27: *"a gate with false alarms is
one people learn to skip, and then it protects nothing."* The measurement sharpens it. **A gate with
false alarms does not merely get ignored; it hides its own true findings in plain sight.** The cost is
not the wasted attention on the four, it is the one that was correct and unread. That is a stronger
claim than "people stop reading", and unlike the original it was observed rather than reasoned.

**A corollary about fixtures, from the same day.** The first attempt at the nested-children fix
suppressed only the FIRST child; the second was still reported. It was caught because the fixture had
two children. A fixture with ONE of something cannot distinguish *handled* from *handled once* —
which is the falsifiability rule this corpus already applies to mutants, applied to fixture shape.

**And the thing not to conclude.** The findings were not available because the corpus was large; they
were available because the gate was **strict enough to be wrong in a legible way**. A looser parser
would have accepted all fifteen bullets and taught nobody anything. A gate that makes a claim precise
enough to be false is the precondition for a report like this existing at all — which is the same
argument this repository makes about tests, one level up.

## 38. Two of three closed; one runner question stays open

**Met again 2026-08-28, by ADR-010's spec.** All 17 facts and all 7 scenarios are bound and passing;
`spec-verify --implemented` still reports `[PARTIAL]`. The facts resolve through a `Cmd` override —
the scenarios have no such column, and this repository declares no `package.json`, so no runner is
detected for `tests/`. The gate is right to say UNRUN rather than green, and the spec's status stays
Draft rather than being talked up. Two candidate closes, in order of honesty: give scenarios a `Cmd`
column, or let spec-verify accept a repository-level runner declaration. Adding a `package.json` this
project does not otherwise need would be shaping the repository to satisfy the gate.

> **The first of those two shipped 2026-08-29 — see the receipt below.** The sentence above is kept
> as written because it is what was known then, but a reader must not act on "the scenarios have no
> such column": they do now. What remains open is the SECOND candidate, a repository-level runner
> declaration, and the paragraph it belongs to is the last in this section.

**CLOSED — `--spec --collect` no longer reports a collector it could not run as an absent test.**
`test_exists` returns `unrun` when the collector cannot start, and also when it exits nonzero having
printed nothing at all, which is a collector falling over rather than one reporting an absence. The
run path's tri-state made this cheap; ADR-005 deferred it only because that change was scoped to the
run verdict.

**CLOSED 2026-08-29 — a scenario can now override its runner.** A fact could name its own command
in the `Cmd` cell of its row; a scenario is a HEADING with no column to put one in, so on a corpus
whose stack `detect_stack` does not know, a scenario binding had **no authoring escape at all** — it
was told honestly that it could not be adjudicated and given no way to fix that. The grammar now
takes an optional trailing override:

    ### UC1-S1 [happy] It works [@implemented] → `TestThing` cmd:`go test -run TestThing ./...`

The remedy line changed with it: "no runner detected … has no Cmd override. Add a Cmd cell to the
fact's row" named the one escape that did not exist for the binding being reported. It now names
both. Enforced-by: `tests/gate-rules.test.mjs::a scenario can override its runner, which is the
escape it never had`, which asserts UNRUN without the override, adjudicated with it, and **RED when
the overridden command exits non-zero** — without that third case, ignoring the override entirely
would satisfy the second. Catalogue entry `spec-verify: a scenario's runner override is read and
honoured`, RED.

**STILL OPEN:** no `go test` in `cmds` and no Go branch in `detect_stack`, so a Go corpus is still
told honestly that it cannot be adjudicated — but it can now *do* something about it, which is the
half that was missing. Adding the runner itself remains its own decision (binding grammar, how `-run`
anchors, what a passing-but-empty run means), unchanged below.

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

### EXPERIMENT RUN 2026-08-29 — the property exists, fires on the known shape, and is unusable at this precision

The hypothesis was not invented for the experiment; it is CLAUDE.md §4 stated mechanically: **a test
that asserts a CLEAN answer from a subject and never asserts a DIRTY one from the same subject cannot
tell a working mechanism from one returning empty.** A throwaway probe over `tests/*.test.mjs` split
each `assert.*` call into top-level arguments, kept those whose expectation is an empty or falsy
literal (`[]`, `''`, `0`, `false`, `null`, `undefined`, `{}`), took the callee of the asserted
subject, and asked whether the same test also asserts something non-clean about that callee.

| | |
|---|---|
| clean assertions over a call | **160** |
| library-call noise (a chained `.trim()`, `.filter()` — the chain, not the subject) | 12 |
| paired with a dirty assertion in the same test | **119** |
| unpaired — the heuristic's candidates | **29** |

**Recall: it does fire on the known shape.** The canonical instance was reconstructed —
`assert.deepEqual(uncovered(['a','b']), [])` with no dirty sibling — injected into a copy of the
suite, and the candidate count moved 29 → 30. So the property is not vacuous itself, which had to be
checked rather than assumed.

**Precision: 29 candidates on a suite where the discipline is uniformly applied, and the hand-checked
ones are all false.** Two causes, both legitimate style rather than sloppiness:

- **The clean/dirty pair is split across ADJACENT tests.** `sweep.test.mjs::a bare number is a valid
  cutoff` asserts `sweep(dir).status === 0` and nothing else; the very next test asserts
  `notEqual(sweep(dir).status, 0)`. One behaviour per test is good practice, and §4's rule says "in
  the same test" — so either the rule is stricter than the corpus, or the checker must widen to the
  file and lose most of its power.
- **The result is bound to a variable first.** `mutate-runner.test.mjs::UNPROVEN entries are in
  neither half` asserts `found.failing === true` — a dirty assertion — but `found` is a variable, so
  no textual pairing with `summarise(` exists.

**So the answer to §39's question is: yes, a mechanical property separates them, and no, it is not
usable.** One true instance among thirty at this precision, on a corpus that already follows the
rule. §37's own measurement of 2026-08-29 decides what that means: a gate with false alarms does not
merely get skipped, it HIDES ITS OWN TRUE FINDINGS — four false disposition advices concealed a real
one on the same record, read past twice. Shipping a checker that cries 29 times to catch 1 would
manufacture exactly that. **Not built, and this is the reason rather than a lack of time.**

**THE PROBE'S FIRST VERSION HAD THE DEFECT IT WAS HUNTING, which is the most useful thing here.** It
took the asserted subject with `([^,]+?)`, which cannot cross a comma — so every assertion over a
call with more than one argument was invisible, *including the canonical
`assert.deepEqual(uncovered(a, b), [])` this experiment exists to detect*. It reported 89 assertions
and **0 unpaired**, and both numbers were about a subset it never said it had taken. That reads as a
clean bill of health. It was caught only because the injected fixture failed to move the count —
i.e. by the falsifiability check, not by reading the code. Take two sees 160, so take one was blind
to 44% of them.

The general form, and it is this repository's own rule met from a new direction: **a measurement
instrument must be shown able to see the thing it is measuring, before its "nothing found" is read as
nothing being there.** The same shape as §35's exhausted eval runs and ADR-005's filter that matched
nothing.

**Not kept as a script.** The finding is that the checker should not ship; committing the probe that
produced it would leave a tool nobody runs and a second thing to maintain. The method above is
stated precisely enough to redo it, and the numbers are dated.

**STILL OPEN, unchanged:** the discipline in ADR-003 — feed the predicate an input that MUST produce
a finding — remains the only thing that works, and it is applied by hand.

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

## 41. One of two closed; the relation-vocabulary question stays open

**CLOSED — `Consumes` no longer scavenges a qualified id into a local edge.** Found by ADR-007 T1's
class sweep, which turned up NINE sites using the same `(?<!\w)T\d+(?!\w)` scavenge where the task
had listed two. `Depends-on` was fixed first; `Consumes` is the one other place an author could
plausibly write `ADR-003-T4`, and it produced a silent local `T4` edge. ADR-007 put `Consumes` out of
scope so that a regression in one edge source could be attributed — the right call for one change,
and the sibling it left is now taken.

**Verified 2026-08-29 rather than assumed**, because this entry read OPEN while the code had already
moved: `dag_edges` splits both headers through `split_dependencies` and scans only the local half, and
the docstring carries the reproduction (`Consumes:` naming a foreign record printed
`blocked … (waiting on T4)` — a sibling it has nothing to do with). A foreign id contributes NO edge
here deliberately: this builds the LOCAL ordering graph, and cross-record readiness is `adr-next`'s
foreign state, which says "cannot evaluate" rather than inventing an ordering. A wrong edge is worse
than a missing one, because the DAG then looks answered.

Three checks stand behind it, and all three were re-run:

- `tests/gate-regressions.py` asserts `dag(consumes="ADR-003-T4") == []` AND that a LOCAL `T4` still
  builds its edge in the same test — without the second, a `dag_edges` returning `[]` unconditionally
  would satisfy the first (CLAUDE.md §4).
- `tests/adr-next.test.mjs::a qualified id in Consumes leaves the record rather than binding locally`.
- Two catalogue mutations, both RED on 2026-08-29:
  `next: a qualified id in Consumes leaves the record, it does not bind locally` and
  `lint: the DAG scans only the LOCAL half of Depends-on and Consumes`.

The other six scavenge sites scan content that is local by construction.

**Worth recording about the entry itself:** it said OPEN and the work was done. A backlog is a claim
about the present, and an entry nobody receipts decays into a to-do list that re-proposes finished
work. Cheap to check — the fix names its own §NN — and the check is what turned this from a rewrite
into a receipt.

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

## 44. CLOSED 2026-08-29 — both halves: the backfill, and the `§NN` fragment

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

**CLOSED 2026-08-29 — the fragment resolves too.** `section_fragments` pairs each `§NN` with the
path cited beside it (a bare `§45` inherits the file from the item before it, which is how every
multi-section citation in this corpus is written) and `has_section` looks for a heading numbering it.
A fragment with no path ahead of it resolves to nothing and is dropped rather than guessed at.

Two distinctions were kept rather than assumed, and both are asserted:

- **`§4` must not match `## 44`.** A prefix test blesses exactly the citation most likely to be a
  typo for the section beside it. `has_section` requires a word boundary after the digits, and
  `## 34 (superseded).` is why the punctuation after them is not required.
- **A tracked file this process cannot read is COULD NOT LOOK, not a missing section** (ADR-005).
  The advice says so in those words, and the two branches are asserted separately.

Advice throughout, like every other pointer finding. Enforced-by: `tests/gates.test.mjs::focused
false-green regressions remain closed` (which runs `tests/gate-regressions.py`), and three catalogue
entries — `adr-lint: a section number is a whole number, not a prefix`, `adr-lint: a cited section
that does not exist is named`, `adr-lint: a bare fragment inherits the file cited beside it` — all
RED. **§44 is now closed in full.**

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

### 2026-08-29 — the receipt, and the class of pointer nobody was resolving

Closing an entry does not update the sentences elsewhere that describe it as open. `CLAUDE.md` §1
still read "BACKLOG §45 carries the gate that would have caught it" — present tense, pointing a
reader at a gap that had been filled the same day. §41 already names why that matters: an entry
nobody receipts decays into a to-do list that re-proposes finished work, and this is the same decay
one level out, in the file that tells a new session how this repository works.

The class is **a live pointer to a backlog section whose heading now says CLOSED, FIXED, DECIDED or
WITHDRAWN**, and it was enumerated with a command rather than from memory: for every `§NN` in every
tracked file outside `docs/BACKLOG.md`, resolve `NN` to its `## NN.` heading and print the pair when
the heading carries one of those four words (or resolves to no section at all).

It returned 102 references across 36 files (counted after the three repairs below, which left
their pointers in place and only changed what they claim). Almost all are correct by construction — a test named
for the defect it pins, a gate comment citing the entry that produced it, a record's
`Cross-references:`. A pointer to a closed entry is only wrong when it asserts, in the present
tense, that the work is outstanding. Three did:

- `CLAUDE.md` §1 — rewritten to say the gate exists and what closed it.
- `ADR-010`'s Context — "§45 stays open and is re-deferred below". Kept as written, because it was
  true when the record was accepted, with a bracketed note recording the close and confirming the
  distinction it draws still holds.
- The three `(deferred: docs/BACKLOG.md §45)` dispositions in ADR-010 and its T1/T3 — annotated
  `CLOSED there 2026-08-29 by ADR-011`, the convention ADR-011 already established for its own §44
  deferral.

Two references resolve to `§9999`, which is `tests/gate-regressions.py` asserting the *absent*-section
behaviour on a fixture. Those are the check working, not a rot.

**Not turned into a gate, deliberately.** A check would have to distinguish "asserts this is still
open" from "cites the entry that closed it", and that is a judgement about a sentence, not about a
pointer — the same reason §45's own check resolves paths and says nothing about prose. The sweep
above is cheap, it is written down here, and re-running it is a maintainer's job at release time.

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

## 50. CLOSED 2026-08-29 — the forwarder asks what is installed, and falls back to the cache

Reported 2026-08-29 alongside §51, by the session that found the exit-code defect. The generated
forwarder resolves the newest version by listing
`~/.claude/plugins/cache/quality-harness/quality-harness/` and taking the highest directory name that
has a `bin/`. It never consults `installed_plugins.json`.

So **a leftover or partially-removed cache directory with a higher number silently wins over the
installed one.** The reporter's cache holds 2.7.0 through 2.32.0; this one holds forty-one
directories going back to 2.0.0. Nothing prunes them, and `claude plugin uninstall` is not known to.

Not fixed with §51 deliberately: that was a gate reporting an observation it did not make, and this
is a gate running the wrong version — different failure, different blast radius, and bundling them
would have made one commit answer two questions. This one runs SOMETHING, and its verdicts are real
verdicts about a real record; they are just possibly from a version nobody installed.

**What it would take:** read `installed_plugins.json`, find the entry for this plugin, and use its
`installPath`. The forwarder already runs `node -e` to do the directory scan, so the machinery is
there; the risk is that the file's shape is not ours and a parse failure must fall back to the scan
rather than to nothing.

**Not yet reproduced as a wrong ANSWER**, only as a wrong resolution path — nobody has shown a cache
directory that outranks the install and changes a verdict. Worth doing before that happens rather
than after.

### CLOSED 2026-08-29, and the fallback is the load-bearing half

The resolver now reads `installed_plugins.json` (derived from the cache path, not a second literal),
takes the entry whose `installPath` still has a `bin/`, and uses that. **The directory scan REMAINS,
as the fallback.** That is deliberate and it is the part worth defending: the manifest is not this
project's file, its shape can change under us, and a parse failure must degrade to the previous
answer rather than to none. A resolver that returns nothing turns every gate into "could not run" —
which, since §51, correctly exits 4 and stops a fence. Trading a wrong-version risk for a
whole-corpus outage would be a bad bargain made silently.

Four cases asserted, and the first is the one that makes the rest mean anything: **with no manifest,
the scan still picks the leftover `9.9.9` over the installed `2.33.1`** — the shipped behaviour,
asserted so the fix is shown to change something. Then the manifest wins; then a manifest that does
not parse falls back to the scan rather than to nothing; then an `installPath` with no `bin/` is not
a candidate, which is the half-removed-install shape the defect came from.

The two existing catalogue anchors sit on the scan lines and were left byte-identical rather than
re-pointed — the scan did not change, it was demoted. Sixth time today an edit moved a guard line,
and the first time it was checked BEFORE the edit rather than by `package.test.mjs` afterwards.

Enforced-by: `link: the resolver prefers the installed version over a leftover cache directory`, RED.

## 51. CLOSED 2026-08-29 — a forwarder that could not run the gate reported a pass

Reported with a fixture by a session running these gates over another corpus. `exit 0` on
"this gate did not run", so `adr-lint <record> && <the rest>` continued and `adr-verify` recorded
exit 0 against the task — a tool-written false PASS in a Verification Log, from the layer built to
prevent exactly that. The diagnostics went to stderr, which nothing reads back.

The comment on the line is what produced it: *"a missing plugin is the harness failing to run, never
a finding about the user's file. Exiting non-zero would make a project's own gate fail because a tool
is absent, which is the block this harness removed."* CLAUDE.md §3 applied one level too far — §3 is
about a gate that RAN and found problems. A gate that could not run has made no observation, and in a
shell `exit 0` IS one. §40's lesson a third time: a comment can carry the bug.

Now exit 4, this repository's own "could not check" code (ADR-005, `spec-verify`). `adr-verify` had
already answered the same question one file over — a zero exit that scored no tests is recorded as
exit 1, because a filter matching nothing is not a passing gate.

**The old test asserted the defect, and a catalogue entry pinned it.** `link: a forwarder that cannot
find the plugin still exits 0` is removed as superseded. The replacement asserts the CONSEQUENCE —
it runs the fence and requires it not to continue — rather than the exit code alone.

Enforced-by: `link: a forwarder that could not run the gate does not exit 0`, RED.

## 49. OPEN — a Windows run of `lifecycle.test.mjs` failed once, naming no test

Observed 2026-08-29 on run 33246705246, commit 439e64d. The **only** diff from fafd177 — which had
just passed Windows on the same nine jobs — was the `version` string in
`plugin/.claude-plugin/plugin.json`. Re-running the failed job on the same commit passed. So it is
intermittent, and it is Windows-only so far: ubuntu and macOS have not produced it.

**What makes it worth an entry rather than a shrug** is the shape of the report:

```
✖ D:\a\quality-harness\quality-harness\tests\lifecycle.test.mjs (3266.7912ms)
✖ failing tests:
test at tests\lifecycle.test.mjs:1:1
✖ D:\a\quality-harness\quality-harness\tests\lifecycle.test.mjs (3266.7912ms)
  'test failed'
```

**No subtest is named anywhere in the log.** Every other ✖ this suite has ever produced names the
assertion that failed. A file-level failure with `1:1` as its location and `'test failed'` as its
message tells a reader nothing about what broke, which means the next occurrence costs the same
investigation as this one. This repository's own rule (§36) is that a verdict which changes its mind
teaches re-running instead of fixing — and a verdict that changes its mind *and cannot say what it
was about* teaches re-running twice.

**What was ruled out, and what was not.** Not a code change: the test tree is byte-identical to the
green run before it. Not a mutation-catalogue or gate change: those jobs were green in the same run.
NOT ruled out — a timeout or a resource limit inside one of the file's spawned subprocesses, which on
Windows would surface as a file that fails without a subtest reporting; the file spawns gates and
`node` repeatedly, and 3266 ms is fast enough that a spawn failure is more likely than a hang.

**The work, when it is picked up:** make the file report which subtest failed on Windows before
trying to fix the flake itself. A retry that turns green is not evidence about the cause, and
re-running until green is exactly the habit this corpus exists to refuse. Candidates: run the file
with `--test-reporter=tap` in CI so a failing subtest cannot be swallowed, or split it — it is the
largest file in the suite by a wide margin.

**Frequency so far: one occurrence in the runs recorded to date.** Do not act on it as though it
were established; do record the next one here with its run id, because two data points decide
whether this is a timeout or something real.

### 2026-08-29 — the diagnostic is in place; the flake itself is untouched

The first half of the work above is done and the second deliberately is not. `scripts/selftest.sh`
now honours `QUALITY_HARNESS_TAP=<file>`: when set, the suite runs with both the spec reporter to
stdout and a TAP reporter to that file. The Windows job sets it and uploads the transcript as an
artifact **on failure only**. TAP names each subtest as it completes, so a run that dies at file
level with nothing to report still says how far it got.

Off by default, and nothing reads the file — it is a diagnostic, not a gate, and a check nobody reads
would be worse than none. Verified both paths locally: 388 `ok`/`not ok` lines in the transcript with
the variable set, and the ordinary run unchanged without it.

**This does not make the flake reproducible and it is not evidence about the cause.** It only means
the next occurrence arrives with something to read. Record that occurrence here with its run id and
attach what the transcript said.

### 2026-09-01 — a second occurrence, on macOS, and it is INCONCLUSIVE

`bash scripts/selftest.sh` exited **1** with a nine-line log containing only the `plugin validate`
output and no failing test anywhere in it. The immediate rerun on the identical tree exited **0**
with the full 474-test output. No file changed between the two.

**Named confound, and it is why this is not filed as a second data point for the Windows flake.** A
`python3 plugin/bin/adr-verify --sweep docs/adr` had been running in the background minutes earlier;
it executes every acceptance fence in the corpus, and several of those fences write fixed paths under
`/tmp` (`/tmp/adr020-t1.out`, `/tmp/adr021-t1.out`) and drive the same gates. Two suites sharing a
fixed temp path is a collision this repository has not ruled out, and it is a much likelier
explanation on a developer machine than the Windows spawn hypothesis above.

**What it does establish**: this is the second time a run has changed its mind with nothing to read,
now on a second platform. `QUALITY_HARNESS_TAP` was not set for either run, which is the diagnostic
that exists for exactly this and which nobody remembered — including this session. Worth making the
selftest set it by default when a run fails, rather than leaving it to a person who has already lost
the transcript.

**The concrete lead, checked in the same session rather than left dangling.** A fence that writes a
FIXED `/tmp` path cannot be run twice concurrently, so the question is whether two DIFFERENT fences
share one:

    grep -ho "/tmp/[A-Za-z0-9._-]*" docs/adr/*/tasks/T*.md | sort | uniq -c | sort -rn

Every path is unique to its own task — `/tmp/adr003-t1.out`, `/tmp/adr016-t1-clean-baseline.out` and
so on — and the repeat counts are the same file naming its own path two to four times (`tee`, then
`grep`). **So cross-fence collision is ruled out**, and the naming convention that made it safe was
deliberate.

What is NOT ruled out is the same fence running concurrently with ITSELF: a corpus sweep re-runs
every fence, and a person running one of those fences at the same moment writes the same path. That
is the shape to look for the next time a run changes its mind while a sweep is in flight.

## 52. CLOSED 2026-08-29 — a step-1 check that read the sentence instead of the step, found by Desktop

**Found by pointing the gates at their own corpus from a client that had never seen it.** ADR-012 T4
registered `qh-mcp` in Claude Desktop; asked to lint `docs/adr`, the session called `qh_adr_lint`
across all twelve records and reported 12/12 exit 0 with one advisory, on ADR-006's
`T2-amend-and-bind-the-spec.md`:

> Ordered Steps step 1 must establish the failing test (TDD red) — currently starts with
> "Confirm the gate is red first: `spec-verify …`"

That step DOES establish red. The check was `"test" not in steps[0].lower()` — a test on the
sentence, not on what the step does, and wrong in both directions: it advised at a correct task, and
would have stayed silent on *"1. Update the tests later"*, which establishes nothing. This is
ADR-003's own rule — a gate asserts behaviour, not shape — broken inside a gate, which is why it is
worth an entry rather than a one-line edit.

**Fixed** by matching what step 1 must accomplish: a step establishing red names a test, or names red
or failure. Enforced by `tests/gate-regressions.py`, which asserts the ADR-006 wording passes, the
canonical *"write the failing test first"* wording still passes, and — the case without which
accepting everything would satisfy the first two (CLAUDE.md §4) — that a step 1 which establishes no
failing state is still advised at. Catalogue entry `lint: step 1 is judged by whether it establishes
RED, not by the word 'test'`.

**The finding about the finding.** A gate that has run over this corpus hundreds of times produced a
false positive that nobody had looked at, because the corpus is the authors' own and the advisory
line had become furniture. It took a reader with no history here to treat it as a claim. That is an
argument for running the gates from a foreign client periodically, not only in CI.

## 53. OPEN — a task can cite a gate whose universe does not contain the thing it claims is enforced

**Reported 2026-08-29 by the agentsmemory session**, from its own ADR-044 T5, and filed here because
the shape is about ADR task files in general rather than about that repository. A task file asserted
that omitting a new wire key from a tool description would fail a named gate. It does not: the key is
a conditional `map[string]any` entry set inside an `if`, and that gate's universe is struct tags —
its own doc comment predicts the gap. Deleting the word left the gate green.

**The class:** a Reachability rung or an `Enforced-by:` header that names a real, passing, correctly
written check which nevertheless cannot see the artifact in question. Every existing gate here
verifies that a named check EXISTS and CAN FAIL — `arch-lint` does exactly this for architecture rule
rows — and none of them asks whether it can fail *for this artifact*. A named check that cannot reach
the case reads as enforcement and is decoration, which is the same defect class as an acceptance
fence that passes with its runner absent (§46), one level up.

**Not obviously a gate.** Deciding whether a check's universe contains an artifact is close to
undecidable in general, and the cheap approximations (does the artifact appear in the check's inputs?
does mutating it turn the check red?) are the mutation campaign, which this repository already runs
for its own gates but cannot run inside a user's corpus. The tractable form is probably a QUESTION in
the task template and in `adr-judge`'s rubric — *does the named gate's universe actually contain this
artifact, and what would prove it?* — rather than an automated check. agentsmemory recorded their
instance as a deviation rather than widening the gate, which is the conservative call and the right
one for a single case.

**Before acting on this, mutate one:** take an `Enforced-by:` claim in this corpus, break the thing
it governs, and see whether the named check goes red. If they all do, this is a foreign finding that
does not reproduce here and the entry says so.

### PROBED 2026-08-29 — not found in the population these checks enumerate

Enumerated with a command rather than by reading: for every `**Enforced-by:**` header in
`docs/adr/*.md`, classify each backticked claim as a mutation-catalogue label, a `file::test` name,
or unresolved. Twelve records, thirteen claims, none unresolved.

**Eleven of thirteen name a mutation catalogue entry**, and that is the whole answer for them. A
catalogue entry is not a claim that a check covers an artifact — it is a recorded run in which that
exact line was broken and the named tests went RED. The campaign re-proves it on every run and exits
1 on a GREEN. For those eleven, "does the named gate's universe contain this artifact" is not
asserted, it is measured, continuously, by construction.

**The remaining one is ADR-003's**, which names a test rather than a mutation:
`tests/package.test.mjs::every shipped gate carries at least one mutation`. That is the shape of
claim agentsmemory found hollow, so it is the one worth probing. Probed by doing what the record says
makes the suite go red — adding an executable `plugin/bin/` gate with no catalogue entry, running
`node --test tests/package.test.mjs`, then removing it:

    ✔ what ships is the plugin and nothing else
    ✖ every shipped gate carries at least one mutation

RED, on the artifact the decision is about, and `git status` clean afterwards. ADR-003's
`Served-path change` claims precisely this — *"a gate added with no mutation makes the suite go
red"* — and it is true.

**Why this corpus is less exposed, stated so it can be applied elsewhere:** an `Enforced-by:` naming
a MUTATION carries its own reachability proof, because a mutation IS a demonstration that the check
can fail for that artifact. One naming a TEST carries only a name, and a name is unfalsifiable until
somebody breaks the thing. That is the cheap, actionable form of the agentsmemory finding: **prefer a
mutation label over a test name in `Enforced-by:`, and where a test name is used, the record owes the
probe above.**

### The sampling limit — the correction that keeps this entry OPEN

**Taken from the agentsmemory session, 2026-08-29, and it is right.** If they ALL go red, do not
conclude the finding does not reproduce; conclude the sample was the population the check happens to
enumerate. Their green case was a conditional `map[string]any` key, which a struct-tag scanner cannot
see BY CONSTRUCTION — no amount of probing struct fields would ever have found it. So the probe above
establishes something narrower than "it does not reproduce here": it establishes that ADR-003's check
goes red for an artifact of the class it enumerates, an executable under `plugin/bin/` with no
catalogue entry.

**The candidate it cannot rule out, named so somebody can go and look.** ADR-003's decision is that
every gate must assert something a deleted line breaks. Its check counts whether an entry EXISTS per
gate. A gate whose entry exists but whose mutation is killed by something OTHER than the assertion it
names satisfies the check while violating the decision — and that is not hypothetical here: CLAUDE.md
§4 records a mutation on a containment guard coming back GREEN because a second guard in a caller
caught the same input. The campaign catches a mutation nothing kills; it does not catch one the wrong
thing kills. That is this corpus's version of a map key in a struct-tag scanner, and it is unmeasured.

**Their reframing of the template question replaces mine, because it is better:** ask what CLASS the
named gate enumerates, not whether it covers the artifact. A rung answering "it checks descriptions"
is still decoration; one answering "it enumerates struct tags, and mine is a map key" is the finding,
written by the author before anybody has to discover it.

**Left open:** whether `adr-judge` should ask that question, and whether `adr-lint` should advise when
`Enforced-by:` names a test with no corresponding catalogue entry. The second is mechanical and
cheap; it is not taken here because it would change a gate on the strength of a foreign finding that
did not reproduce in the population sampled, which is the wrong order. It becomes worth doing the
first time a test-named claim in this corpus fails the probe — or when somebody measures the
wrong-thing-kills-it candidate above.


### MEASURED 2026-09-01 — the wrong-thing-kills-it candidate, and three defects in the instrument that was supposed to measure it

This entry has been waiting since 2026-08-29 on one thing: *"it becomes worth doing … when somebody
measures the wrong-thing-kills-it candidate above."* Measured now, over the full campaign — 416
mutations, all RED, `416/416 mutations were noticed`. The instrument is `killedBy` at
`scripts/mutate.mjs:205`, which exists for exactly this question and whose docstring says it
**reports, never judges**.

**The candidate is real, and there is one instance.** `state: a supersession chain is followed`
replaces `supersededBy: /^superseded\s+by\b/i.test(status)` with `supersededBy: false &&`, which is
a **syntax error**. Reproduced by hand: the module never parses, `tests/lifecycle.test.mjs` dies at
import in 40ms with no subtest named, and the campaign counts it RED. Nothing but the JavaScript
parser noticed it. That is a mutant killed by something other than the assertion it names, which is
what this entry predicted and could not previously point at. Whether it should COUNT as noticed is a
decision rather than a bug — filed separately as §102.

**Three defects in the instrument, all found by trying to use it:**

1. **`killedBy` discards a killer whose name contains a separator.** Its filter is
   `!/[\\/]|\.(mjs|js|py|cjs)$/`, meant to drop the file-level row §49 describes. It also drops any
   legitimate subtest whose NAME contains `/` — and three do: `a bin/ gate is spawned in a way
   Windows can actually run`, `a docs/adr that yields nothing says so`, `a directory in bin/ is not a
   gate, whatever it is named`. **Four of 416 mutants therefore reported RED with no killer at all
   while a correctly-named assertion had killed them.** Verified by applying each mutant and reading
   the raw reporter output, not inferred: `link:`, `hooks:`, `corpus:` and `next:`.
2. **The printed killer list cannot be parsed back into names.** `mutate.mjs` joins killers with
   `', '`, and **138 of the suite's 462 top-level subtest names contain `', '`**. So the report is
   ambiguous by construction for 30% of the suite.
3. Consequence of 2, and a retraction. Two figures were produced from that printed line by splitting
   on `', '` — *"144 of 259"* and *"202 of 411 mutants are killed by more than one subtest"*. **Both
   are artifacts of the separator, not measurements.** They are withdrawn. The same shape as §35's
   own −0.40: a number computed from a report that could not carry it.

**The arithmetic reconciles**: 411 parsed rows + 5 lines carrying no killer = 416 mutations.

**What this does NOT establish.** Whether each of the other 411 mutants was killed by the assertion
its label claims is still unread — and it cannot be read until defect 2 is fixed, because the killer
names cannot be separated. The lexical triage built for it (`scratchpad/triage.py`) sorts by shared
vocabulary and is TRIAGE, never a verdict: 117 rows share no term at all with their killers, which is
expected — a label and the assertion proving it need not share words — and says nothing on its own.

**So the honest state of this entry: the candidate reproduced, once. The population question stays
open, now blocked on repairing the instrument rather than on nobody having looked.**
## 54. CLOSED 2026-08-29 — the recorded failure block could contain none of the failure

**Reported 2026-08-29 by the infrastructure-06 session** from
`/Users/…/TakeOnline/infrastructure` (a private corpus, not this one), and **reproduced here on
HEAD** rather than taken on their word. Two defects in `adr-verify`'s ordinary run path, one of which
they hit five times while every deploy was in fact correct.

**1. Streams are concatenated, then the tail is taken over the concatenation.**
`plugin/bin/adr-verify:1253` builds `output = r.stdout + r.stderr`, and line 1279 records
`output.strip().splitlines()[-10:]`. When a runner puts its verdict on stdout and its noise on
stderr — ansible's exact shape, play recap to stdout and warnings to stderr — every recorded line
comes from stderr and the verdict is gone. Reproduced with a fence printing one FAIL line to stdout
and twelve warnings to stderr:

    recorded block: warning 3 … warning 12
    FAIL line present in the recorded block: False

The evidence block then says a run failed and shows ten lines that do not say why, which is a
report that has lost the thing it was written to preserve. Interleaving is lost too: the order in
the block is not the order anything happened in.

**2. No timeout on the fence.** Line 1248 and the `--mutant` path at line 664 both call
`subprocess.run(..., capture_output=True)` with no `timeout=`. `sweep_corpus` passes one
(line 981), so the three paths disagree, and a fence that hangs in the two that do not hangs the
session with no output at all — `capture_output` holds everything until the process ends.

**Why this is worse than a formatting bug.** The whole claim of this project is that a recorded
failure is readable evidence. A block that cannot contain the failure teaches a reader to re-run
instead of to read, which is §36's finding about verdicts that change their mind, one level down.
The reporting session's own summary is the sharp version: their pipeline produced ~3.1k lines of
task docs and 22 postmortems in a day, and **all four real bugs came from reading the roles, not
from any gate** — a gate whose output cannot be read is a cost with no return.

**Not fixed here yet, deliberately.** Both fixes change what a tool writes into an evidence block,
and one of them (a timeout) introduces a new failure verdict that did not exist. The shape worth
arguing for first: keep the streams separate and record a tail of EACH, labelled, so a verdict on
either is present; and give the two paths the timeout the sweep already has, reported as `UNRUN`
rather than as a failing check (ADR-005 — a gate that could not run has not found anything). That is
a decision about evidence grammar, which is ADR territory rather than a patch.

**Also reported, and the first half of this paragraph was WRONG — see §55.** The same session
reported `work-next` promoting a `Proposed` record's tasks. The §48 machinery is indeed shipped and
correct, but it is INERT on their corpus: the reader never opened those records at all, so on 2.34.1
the false-positive banner became a false ALL-CLEAR. They caught my error by re-running both versions
and I confirmed it here. What follows is what was written before that, kept because the §48 half of
it is accurate: that is docs/BACKLOG.md §48, closed 2026-08-29 and shipped in v2.31.0: `plugin/scripts/work-next.mjs` joins each task to its
owning record and treats only `Accepted` as executable. Their run predates the fix or resolves an
older installed copy — CLAUDE.md §2's two staleness traps. Their second item, `work-next` re-offering
work finished in July, is **working as contracted**: `unfinished()` asks whether the task file
carries a tool-written exit-0 evidence row, so a task completed without `adr-verify` evidence is
invisible as completed. That is the contract this project exists to enforce, and the honest answer
to them is that the corpus never recorded the completion, not that the reader is wrong.

## 55. CLOSED 2026-08-29 — a corpus the reader could not open, reported as a corpus with nothing in it

**Reported by the infrastructure-06 session** against a 56-record ansible corpus, and **reproduced
here on identical bytes under two filenames** before anything was changed:

    docs/adr/0001-thing.md        → 1 record(s), 1 accepted, its task is ready
    docs/adr/2026-08-17-thing.md  → 0 record(s), 0 accepted, 1 task file(s) — "Next: /spec-write"

Same content, same `**Status:** Accepted`. `ADR_FILE`'s negative lookahead excludes every ISO-dated
filename, so a corpus that names its records by date produced zero records — and the reader then
routed the session to **write a spec for work already decided**, over two dozen unfinished task
files. The reporting session measured 0 of 56 basenames matching.

**The regex is the trigger; the reported sentence is the defect.** `unreadable` — the list that names
records whose STATUS this reader cannot act on — structurally cannot catch this, because a file must
be OPENED before it can be classed unopenable. The safety net sat downstream of the miss. That is
ADR-005's rule broken in this project's own router: a filter that matched nothing said "there is
nothing" when the honest answer was "I could not look".

**Two discovery rules over one corpus is what let it happen silently.** `taskFiles()` finds tasks by
PATH (anything under a `tasks/` directory) and found 24; records were found by FILENAME and found 0.
Nothing compared the two, so "0 records, 24 task files" printed as a coherent reading.

### Fixed in three parts, and the third is the one that generalises

1. **Discovery gained a content probe.** Inside an `adr` directory a file is a record if it carries a
   Status line AND a `## Context` or `## Decision` section, whatever it is called; the filename
   pattern stays as the fast path. Both conditions are needed: this repository's own fixture
   `2026-03-08-retrospective.md` carries `**Status:** Accepted` and is the exact journal-read-as-
   ADR-2026 defect the lookahead was added for on 2026-08-26, so a status-only probe would have
   re-opened it. Task files are excluded by PATH, because a `tasks/README.md` may well acquire a
   status line and is never a decision.
2. **Task ownership gained the stem.** A record found by content still reported zero tasks:
   `taskDirectoriesFor` matched a sibling directory by ADR NUMBER only, so `2026-08-17-thing.md`
   beside `2026-08-17-thing/tasks/` owned nothing. An exact stem match cannot bind the wrong
   directory the way a loose numeric prefix could.
3. **A corpus with tasks and no records now says so, before any stage is named.** Two walkers over
   one corpus disagreeing is provable from the numbers alone without knowing which rule missed —
   tasks > 0 with records = 0 is a discovery failure, not an empty corpus. Printed regardless of the
   stage, which is the part that matters: the reporting corpus WAS given a stage (`/spec-write`), so
   a message that only fired when the router went quiet would have stayed silent on the very case it
   exists for.

**Verified against the reporter's data rather than against a guess.** They enumerated their corpus at
my request: 0 of 56 postmortems, 0 of 3 runbooks and 0 of 1 spec carry a Status line; inside
`docs/adr`, 31 of 56 `.md` files carry none and every one is a non-record (24 task files, 3
`tasks/README.md`, an index, a research note, a `.queries.md` evidence companion); the 25 that do are
18 Accepted, 5 Proposed, 2 Superseded. They also flagged the fragility that made part 1 take two
conditions instead of one: those three record-SHAPED non-records self-exclude today only because
nobody happened to give them a Status line.

Enforced by `tests/lifecycle.test.mjs::a date-named record is read, and a docs/adr that yields
nothing says so`, which asserts the dated record IS read, its task IS ready, a dated document with no
status is NOT a record, a dated document with a status but no Context/Decision is NOT a record, the
discovery-failure sentence fires, and — the must-fail direction — an actually empty corpus is not
reported as a discovery failure. Catalogue entries `corpus: a record is found by content when its
filename does not announce it` and the repaired `corpus: tasks resolve from the directory named for
the record`.

**What this cost to find, and it is the entry's real lesson.** The defect shipped 2026-08-26 and was
invisible here for three days because this repository names every record `ADR-NNN-…`. A dogfood
corpus tests the conventions its authors already use. The reporting session ran the same tool over a
corpus shaped differently and the defect was immediate — which is the second time in one day that a
foreign reader found something CI could not (docs/BACKLOG.md §52 was the first).

## 56. CLOSED 2026-08-29 — a PHP repository was told its check was a vite build

**Measured by the depozitas-laravel-22 session** against the INSTALLED 2.34.1 in a pure-PHP Laravel
11 JSON API — composer.json and phpunit.xml present, CI running phpunit Unit and Feature suites, no
frontend served — and reproduced here:

    projectCheckCommand(<laravel repo>)  →  "npm run build"

Their session hook told them, in those words, that *this project's own check* was `npm run build`. A
PHP change would then be "evidenced" by `vite build`, which cannot fail because of a PHP edit or pass
because of one. ADR-005's class, in the tool that tells every session what its evidence is.

**Root cause: a missing row, not a wrong order.** `PROJECT_CHECKS` had no PHP entry at all, so
discovery fell through to `packageManagerCommand`, which returns the first of
`test, check, lint, typecheck, build` present in package.json. Laravel and Symfony skeletons ship
exactly `dev` and `build`, both vite — so `build` won. The blast radius is general: **any** language
whose manifest is absent from that list gets the same answer whenever a package.json sits in the
root, which on a modern PHP skeleton is always.

### Fixed in two parts, and the second is bigger than PHP

1. **PHP rows, ordered by who is speaking.** `composer.json`'s own `scripts.test` is consulted FIRST
   and yields `composer test`, above `phpunit.xml` → `php vendor/bin/phpunit`. That order is the
   reporter's caution taken seriously: in their repository phpunit runs only inside Docker
   (`docker compose exec app php vendor/bin/phpunit`), so the bare host command would not execute at
   all — and naming an unrunnable command is its own failure mode. A script the repository names for
   itself beats a guess, exactly as `scripts/verify.sh` already beats `go test ./...`.
2. **A build is not a check.** `build` is removed from the package-manager fallback entirely. It
   compiles; it says nothing about behaviour, and a repository whose only script is `build` is better
   told that no check could be determined than handed one that passes while the code is broken —
   "I could not determine this project's check" is a sentence a reader can act on. This half applies
   to every JavaScript repository with no test script, not only to PHP ones.

Enforced by `tests/lifecycle.test.mjs::reported: a PHP repository is not evidenced by a vite build`,
which asserts the composer script wins, phpunit is the fallback without one, a build-only package.json
yields NULL, and — the must-fail direction — a package.json with a real `test` script still resolves
(without which "the fallback stopped working" would satisfy the third). Catalogue entries
`checks: a build is not a project's check` and
`checks: a composer script answers before a phpunit guess`.

**What else that session measured, kept because it is the strongest outside evidence this project
has.** Doc-to-code on their corpus, from git insertions: ADR-011 11.7 doc lines per production line,
ADR-010 3.7, combined 5.7:1 doc-to-production and 1.8:1 doc-to-(production+tests). They flagged
ADR-011 as inflated by a genuinely tiny production change and named 3.7:1 as the fairer figure. And
on provenance, which is the number that matters: **zero of their three postmortems record a defect
found by an ADR gate** — one found by a peer session, one during a repository briefing, one by an
independent review of a doc sentence claiming a guarantee that did not hold. With
infrastructure-06's independent 4-of-4-found-by-reading, that is two unrelated corpora in two
languages agreeing.

**Sharpened 2026-08-29 by the reporter, because the first version of this paragraph blurred two
instruments.** Their number is about the ADR gates, NOT about their test suite: that suite caught
both mutations of a later experiment immediately and precisely, with the same failure counts as the
container run. So the honest statement is three-part — the ADR gates check that the paperwork is
consistent, the suite checks that the code works, and all three of their real defects lived in a
third place, in prose and configuration that neither instrument reads.

That third region is where this project is deliberately blind, and the blindness is principled: a
gate that reads prose is an LLM judge, and the outside evidence says those grade tone at AUROC ≤0.65
while cheap deterministic detectors reach 0.83–0.95 (docs/research/2026-08-28-…). So the standing
challenge is not "the gates catch nothing substantive" — it is that on two independent corpora the
defects were where both instruments are blind, and this project has no answer for that region beyond
review by something that reads.

### 2026-08-29, third corpus, 93 postmortems — and it contradicts BOTH numbers above

The wcag-43 session answered the same question on the largest corpus on this machine, read off an
`## Investigation` section that every one of its 93 postmortems carries — provenance recorded at the
time, not inferred later:

    REVIEW 60 (65%) · GATE 16 (17%) · READING 9 (10%) · PRODUCTION 5 (5%) · UNSTATED 3 (3%)

**So the answer to "has a gate ever caught a substantive defect" is NO LONGER "none found".** Their
examples are behavioural, not paperwork: an eval showing a whole success criterion at recall 0.0 (it
was silently not running at all); a CSS-nesting gate reporting UNEXPECTED on both branches; a
precision-0.50 contrast finding; an Alembic downgrade chain broken; and — the one that belongs in
this repository's own literature — **an acceptance command whose red run and clean run BOTH exited 1,
a gate structurally incapable of failing, caught only by running it both ways.** That is §54's
species exactly, found by somebody else's corpus before we found it in ours.

**They then cut against their own headline, three ways**, and all three are kept: 3 of the 16 were
caught by a test the author was writing for that change rather than by a standing check (strict count
13); ~40 of the 93 records come from one ADR's review laps, which measures a convention and inflates
REVIEW; and all 5 PRODUCTION records are dev/local runs, so "production" there does not mean a live
system.

**The doc-to-code ratios above are measured on a DIFFERENT DENOMINATOR, and on theirs the effect
disappears.** Their figures, with zero sha overlap between records:

    ADR-074  docs 2701 · src 57 · tests 2402   →  47.4:1 doc:src  BUT  1.1:1 doc:(src+tests)
    ADR-076  docs 6846 · src 4563 · tests 5360 →   1.5:1          BUT  0.7:1
    ADR-056  docs 1968 · src 2000 · tests 1071 →   1.0:1          BUT  0.6:1

The 47.4:1 is a denominator artifact — ADR-074 is test-infrastructure, so `tests/` IS its production
surface. **On the fair denominator no record there exceeds ~1.1:1.** Their warning is the one to act
on: the "docs dominate" reading from the other two corpora appears only if `tests/` is excluded from
production, and depozitas's own combined figure (1.8:1 doc-to-(production+tests)) is much closer to
this than its headline 5.7:1 suggested. **Two sessions agreeing was partly two sessions choosing the
same denominator.** Nobody has re-measured the ansible corpus this way; until somebody does, this
project should quote the doc-to-(src+tests) figure or none at all.

**One structural finding for the skills, and it changes where to look for this evidence at all.**
ADR Verification Logs are useless as a gate-catch source: across 81 records with Verification
sections, grepping for a gate catching anything returns two hits and NEITHER is one — one is a
deliberate red-check, the other says outright that nothing caught it. Every recorded gate-catch on
that machine lives in `docs/postmortems/`. **Measure gate efficacy in Verification Logs and you will
get zero everywhere, and it will not mean what it looks like.**

**Two things they reported that this entry does NOT close**, named so they are not lost:
`adr-lint <directory>` exits 1 with a raw `IsADirectoryError` traceback instead of saying it expected
a record file — a newcomer's obvious first guess, and worth a message rather than a stack trace. And
a cross-repository gap that no gate can close: ADR-010's T3–T6 are implemented and merged in another
repository, but their Acceptance fences execute against that repository's Docker stack, so
`work-next` calls them ready — honest about the paperwork, wrong about the world.

## 57. CLOSED 2026-08-29 — the tests-exist check could not see a BDD test, and could be satisfied by a comment

**Reported by the klientams-front-v2-01 session**, whose finished TypeScript/Vitest corpus was told by
`adr-lint` that all seven of its tasks named tests that do not exist — nine messages, every one a
false positive, on tests they located by `grep` at a named line. Their diagnosis of the mechanism was
not quite right and their finding was: reproducing it here turned up a SECOND defect in the same
function, pointing the opposite way, which is the worse of the two.

**1. A BDD test is named by a STRING, not by an identifier.** `test_body`'s declaration matcher wants
`name(...) {` — an identifier being called. Vitest, Jest, Mocha, Jasmine, RSpec and Go subtests all
write the name as the first ARGUMENT: `it('name', () => {})`, `t.Run("name", func(…){})`,
`it 'name' do`. None of those match, so a correct corpus in any of them can never pass this check.
The docstring records the matcher being widened for PSR-12 PHP and C#; the BDD family was never
covered.

**2. The last resort accepted a name mentioned ANYWHERE, and this is the serious one.** When no
declaration matched, the fallback took any line containing the name and returned THE REST OF THE FILE
as its body. So a name appearing only in a comment — `// t_name is planned` — or in a bare string
satisfied `check_tests_exist`. The check that exists to catch *a Tests table naming a test that is not
there* could be satisfied by a note saying it was planned. That is this project's own defect class,
inside the gate written to detect it, and it was found while reproducing someone else's report rather
than by the suite.

Both fixed in `test_body`: the BDD call forms are recognised (brace-matched from the callback, or
`do`/`end` for Ruby), and the last resort now requires the name to sit on a line that also carries a
definition keyword. Nine assertions in `tests/gate-regressions.py` — six shapes that must be FOUND
(vitest arrow, vitest async, jest function, go subtest, rspec do/end, plain function) and three that
must be MISSED (comment only, string only, absent). The three misses are what make the six finds mean
anything: a `test_body` returning the whole file for everything would satisfy the finds alone
(CLAUDE.md §4). Catalogue entries `lint: a BDD test named by a string is found` and
`lint: a test named only in a comment is not a test that exists`.

### The fix was unreachable, and its own tests did not notice — reported the same day

The klientams session installed the fix, re-ran it, and got **the same nine messages, unchanged**.
The BDD matcher was correct and was never reached with usable input: `check_tests_exist` passed
`code_only(...)` output, which blanks every string literal, so `it('name', …)` arrived as `it('', …)`
and the name was deleted before the search. Their measurement: `name in raw_text` True,
`name in code_only(raw)` False.

**The assertions passed because they called `test_body` directly on raw source — the mechanism, not
the path.** That is this repository's own rule (CLAUDE.md §4: assert the mechanism, not a downstream
effect something else also covers) failing in the other direction: a unit that works, reached by a
caller that cannot use it. A regression going through `check_tests_exist` end-to-end on a Vitest
fixture would have caught it, and that is now what the test does.

Fixed by moving the stripping INTO `test_body`, per branch: the declaration and last-resort branches
read `code_only` output, the BDD branch reads raw text and refuses a match on a line a comment marker
opens (`commented_out`), which keeps the anti-comment property the last-resort branch was fixed for.
Both callers pass raw source — except for Python, which is stripped at the caller in the can-fail
check, because Python names its tests with `def` (which survives stripping) and its bodies carry
DOCSTRINGS whose `assert` must not be mistaken for an assertion the test makes. That exception was
found by `tests/gate-regressions.py::an assert inside a docstring must not count` going red, which is
the older regression defending itself.

The second caller mattered too: `check_tests_can_fail` pre-stripped identically and `continue`s on a
None body, so it silently skipped every JS/TS test it was asked about — a check that reported nothing
and looked like a check that found nothing.

**The new assertion is proved able to fail**: reverting the caller to the pre-fix form reproduces the
reporter's exact message (`no executable definition with that name`) and the test goes red.

**Credit, corrected by the reporter against their own interest.** Two of the four defects here came
from their re-run (the unreachable fix, and the can-fail check skipping every JS/TS test downstream
of it); the comment-satisfies-the-check fallback was found here while reproducing their report, and
they point out it is invisible from a corpus where the names are real. Their framing of what a re-run
actually buys is worth keeping exactly: *it tells you a fix did not land, which is a narrow thing
that happens to be very cheap and very hard to learn any other way.*

**And the rule they wrote, which is the generalisable half of this whole entry:**

> A fix verified only by its own new assertions has been tested at the function, not at the entry
> point the report came in through. A defect reported from outside gets its regression at the
> outermost callable boundary, on a fixture in the reporter's language — or you have tested the
> patch instead of the bug.

Both failures here were of that shape: assertions correct and green while the production path was
unchanged, first because `code_only` had already deleted the name, then because the can-fail check
pre-stripped identically.

**Why this had to come from outside.** This repository's tests are `node:test` (`test('name', …)` —
a BDD form) and Python `def test_…`. The Python path has its own indentation-aware branch, and the
JS path was never exercised by `check_tests_exist` here because no task file in this corpus names a
`node:test` case in its Tests table. So the gate had a hole shaped exactly like the corpora it does
not run on. Third instance today of the same lesson, after §52 and §55.

## 58. CLOSED 2026-08-29 — two readers of one evidence grammar disagreed about what `done` means

**Reported and then confirmed from source by the klientams-front-v2-01 session**, on a corpus whose
seven tasks are all executed: the SessionStart hook announces "T1 is ready" at every session start,
forever, for a finished ADR.

`adr-next`'s `is_done` accepts ONLY a digest row — `VLOG_DIGEST_RE` requires the entry to end in
`· acceptance-sha256:<hex>`. `adr-lint`'s own help text documents a legacy allowance: a pre-digest
exit-0 row counts when the fence is single-line and the displayed command matches. So a task whose
evidence predates digests is `done` to one reader and `READY` to the other. They ruled out the
dirty-tree hypothesis by reading the pattern: the `*` suffix is explicitly permitted, and digest
presence is the sole discriminator.

**CORRECTED 2026-08-29 by the reporter, and it is worse than first reported.** Their initial reading
("done T1 · READY T2–T5 · blocked T6 T7") was taken while T1 still carried a digest row their own
`adr-verify` run had just appended; they reverted it and did not re-measure. Against the COMMITTED
tree, on both 2.34.1 and the current build:

    READY    T1
    blocked  T2 … T7  (waiting on T1)

So `adr-next` does not mis-report some tasks of a finished ADR — it reports the ENTIRE record as
unstarted, zero done, every task ready or blocked behind the first. Any corpus whose evidence
predates digests is in that state, wholesale. The correction is theirs and they volunteered it
against their own earlier message, which is the only reason the severity here is right.

**The consequence is the one that matters:** a fully executed ADR advertises finished work as ready
at every session start. That is the signal that teaches people to ignore the hook — the same failure
mode as §54's unreadable evidence block and §56's wrong check command, arriving through a third door.

### CLOSED 2026-08-29 — the allowance, copied condition for condition

Three corpora reported it and the third settled the design: `adr-lint` accepts the legacy row AND
`work-next` honours the same shape, so `adr-next` was the outlier two-to-one, not one half of a
disagreement. **The backfill option is dead on their argument**, which is the strongest sentence
anyone contributed today: stamping a digest onto an August row means computing sha256 of TODAY's
fence and asserting it is what ran then — **manufacturing exactly the provenance the digest exists to
prove**. One corpus checked five files by hand and found it true there; no tool can know it in
general.

So `is_done` now accepts a pre-digest row under the same three conditions `adr-lint` documents, copied
rather than loosened: the fence must be SINGLE-LINE (a legacy row records only the displayed command,
so it cannot prove a multi-line fence), the recorded command must not be the truncated ` …` form, and
it must equal the fence's first line with backticks written as quotes — which is what `adr-verify`
displays. Each of the three is asserted to still REFUSE, without which "accept any exit-0 row" would
satisfy the positive case and the digest would stop meaning anything.

**And the migration story is now known rather than assumed**, from the corpus that ran it: where the
fences still pass, re-running `adr-verify` records digests and is self-healing — nine tasks, nine
vitest runs, both records moved from "READY T1 / everything blocked" to every task done. The
allowance is what carries a corpus whose fences NO LONGER pass, which is the case where re-running is
not available and the alternative is a permanent misread.

**Original framing, kept because it was the state before the third report:**

### CLOSED 2026-08-29 — a labelled tail per stream, and a timeout reported as UNRUN

`failure_tail` keeps the last ten lines of EACH stream, labelled, and states the total when lines
were dropped so a truncated tail cannot read as the whole run. Interleaving is genuinely lost — two
captured pipes cannot be re-woven — so the block says which stream each part came from rather than
implying an order nobody observed. An empty stream is omitted rather than labelled, which is the
must-fail direction: without it, "always emit both headers" satisfies every other assertion while
saying nothing about what was captured. The environment note now goes into the recorded text as well
as the printed text, because building the block per stream meant anything appended to the merged
string alone reached the reader and never the file.

Both recording runs now carry a timeout, which only `sweep_corpus` had. A fence that never returned
is **UNRUN and nothing is written**: it has not judged the code, and an entry claiming a run that did
not finish is worse than no entry. What the process had produced when it was killed is printed,
because `TimeoutExpired` carries it and a hang with no output at all is the case this exists to stop
being. The `--mutant` path gets the same verdict and its file is restored — a timeout that left the
tree mutated would be worse than no timeout.

**The timeout is a PARAMETER** (`QUALITY_HARNESS_FENCE_TIMEOUT`), and that is not a convenience: the
campaign came back GREEN on the first version because no test can wait thirty minutes, so the branch
had no seam and therefore no test. A value that is not a positive integer is ignored rather than
honoured, so a typo cannot silently restore the hang.

**Three of today's four GREEN mutations were the same mistake**, and it is worth naming as a habit
rather than as three incidents: the assertion drove the helper while the catalogue entry named a test
file that never exercises the changed path. The tell is available before the campaign runs — if the
`tests` of a catalogue entry do not contain a test that CALLS the changed line, the entry is decoration.

**Original framing, kept as the state before the work:**

**Not fixed in this commit, deliberately.** §47 closed the case where `adr-verify` wrote
an entry `adr-lint` rejected, and the standing lesson from it is that the writer and the readers must
agree on what an entry IS. This is the same shape one level up: two READERS, one grammar, two
answers. Either the legacy allowance is real — in which case `adr-next` must implement it, and the
rule belongs in one place both call — or it is not, in which case `adr-lint`'s help text is
documenting an allowance nobody honours and pre-digest corpora need a migration story rather than a
silent downgrade. The gates are standalone scripts with no import path between them, which is what
makes "one grammar, two call sites" cost real work rather than a refactor.

## 59. CLOSED 2026-08-29 — a correctly-identified check that is red on an unmodified tree

**Measured 2026-08-29 by the depozitas-laravel-22 session**, after §56 fixed the wrong-command
defect. The rung now resolves correctly — `phpunit.xml` present, `php vendor/bin/phpunit` named — and
the command it names is RED on a clean checkout:

    host       php vendor/bin/phpunit  → exit 2, 1 error   (PHP 8.5.9)
    container  php vendor/bin/phpunit  → exit 0, 300 tests green (PHP 8.4.15)

Nothing in that repository is broken and CI, which runs in the container, is right to be green. The
difference is which PHP is first on `PATH`: a deprecation reaches Laravel's `Log::channel(...)` past
a Mockery mock with no expectation for it. They confirmed the container result with a one-off
`docker compose run --rm`, having first reported the cause as inconclusive rather than guessing.

**The asymmetry is the finding, and it is theirs:** a false GREEN lets bad code through; a false RED
teaches a session to distrust the gate. §56 fixed the first and, in that repository, produced the
second. Distrust is not a smaller cost — it is what let `npm run build` survive as long as it did.

**Not "detect Docker".** That is a lot of guessing about compose files and service names, and a rung
that guesses wrong is worse than one that abstains. Two shapes worth considering instead:

- **Let a project DECLARE its check.** `.quality-harness.json` already exists and is read by these
  gates; nothing in it currently says what the project's check is. The reporting repository states
  its answer (`docker compose exec app php vendor/bin/phpunit …`) in CLAUDE.md — the place agents
  read and gates do not. A declared field is the structured version of what they had, with no
  parsing of prose and no guessing.
- **Phrase the instruction so a red is readable.** The gates already distinguish UNRUN from FAIL. A
  named check carries no environmental confidence, and the instruction could say so: run it, and a
  red on an unmodified tree is a finding about the environment rather than about your change.

### MEASURED 2026-08-29 — the declared command discriminates, the derived one is a constant

The reporting session ran the experiment rather than arguing the design. Two mutations in one PHP
service, each applied alone and reverted immediately (backup + trap, `git status` clean after each):
a boundary loosening (`!== 10` → `< 10`) and a value corruption (`substr(…, 2, 2)` → `substr(…, 2, 3)`).

    invocation                                clean tree       M1              M2
    host  php artisan test --testsuite=Unit   exit 0, 91 pass  exit 1, 2 fail  exit 1, 4 fail
    host  php vendor/bin/phpunit  (derived)   exit 2, 1 error  —               —
    cont. php vendor/bin/phpunit              exit 0, 300 OK   exit 1, 2 fail  exit 1, 4 fail

Host-artisan and container-phpunit agree on precisely what broke — identical failure counts and
assertion totals — so on detection they are interchangeable. The DERIVED command is red on a clean
tree, which means a session gets the same exit code whether or not it broke anything: **zero bits**.
That is worse than the wrong-command defect §56 fixed in one specific way — a false green is at least
right most of the time, and a constant is uninformative always.

**So the rung is built** (`declaredCheckCommand`): `.quality-harness.json` may carry a `check`
string, and it answers before every guess. Anything that is not a non-empty string is ignored and
the rungs below still answer, which is asserted four ways — empty, whitespace, a number, a config
with no `check` at all — plus an unparseable file. Without those, "declared wins" would degrade into
"a malformed config turns the feature off", which is no answer and no sign that one was expected.
Catalogue entries `checks: a declared check answers before any guess` and
`checks: a malformed declared check does not silence the rungs below`.

**The limit, stated by the reporter and worth keeping:** the declared command wins there partly
because it scopes to the Unit suite and so dodges the host-only Feature failure. A project can
declare a bad command. The rung's virtue is that it stops the tool GUESSING — a wrong declaration is
the project's own mistake, in a file someone can fix, rather than this tool being wrong on the
project's behalf.

**Scope of the claim, narrowed by the reporter once it became a rung, and it is the sentence to read
before citing this entry:** this is one repository, and what was measured is that a DECLARATION BEATS
A CONSTANT. The derived command there carried zero bits — red on a clean tree, so the same exit code
whichever way the code went. **Nothing here shows that a declaration beats a merely weaker derived
command.** If another consumer's inferred check discriminates at all, the case for declaring is real
but much softer, and §59 must not be read as "declared beats derived generally".

**Verified from the consumer side at 069e92e**, each case re-derived rather than taken on trust: no
config, a declared command, `""`, `"   "`, `42`, a config carrying only `strictFrom`, and an
unparseable file — the six non-answers all fall through to the rungs below rather than turning the
feature off. That property is the one that matters most here, because a malformed config silently
disabling the check would have been a worse defect than the one this rung fixes.

That repository then declared `docker compose run --rm --no-deps app php vendor/bin/phpunit` — not
the host `artisan` form its own matrix appeared to favour — because the container form is what CI
effectively runs, covers all 300 tests rather than the 91 the host Unit invocation reaches, and fails
loudly with an obvious cause when Docker is absent instead of passing while meaning nothing. Their
reasoning, recorded because it is the first real use of this rung: prefer the invocation whose
failure mode is legible over the one that is merely easier to start.

**CLOSED 2026-08-29 — the sentence now says which kind of command it is naming.** A DECLARED command
(`check` in `.quality-harness.json`, or a `composer.json` test script — both are the project
speaking) is stated plainly. An INFERRED one carries a caveat: *"That command was inferred from this
repository rather than declared by it, so if it is red on an unmodified tree the finding is about
this machine and not about your change — say which, and declare the real command as `check`."*

Two details that are not cosmetic. **The word "environment" is deliberately absent**, and an existing
assertion caught the first version for spending it: that word is reserved for a run that actually
failed that way, and a standing note carrying it in every message makes it stop meaning anything.
And **one resolver serves both callers** — `checkCommandOrigin` returns the command and its
provenance, because resolving the repository root a second time at the sentence's call site is how
one rule becomes two spellings that drift, which cost this project §66 the same day.

Asserted both ways: a declared command produces no caveat, an inferred one produces it, and the
inferred sentence must not contain "environment". Catalogue entry
`checks: an inferred command says it was inferred, a declared one does not`.

**The reasoning lesson, recorded because it is better than the defect.** Their first theory was
correct and they rejected it on a test that could not have disconfirmed it: suppressing
`E_DEPRECATED` via `-d error_reporting=` cannot change the outcome, because Laravel installs its own
error handler and never consults that ini. An uninformative null read as disconfirmation. The general
form is this project's own rule pointed at a diagnostic instead of at a suite — **before reading a
null as evidence, ask whether the instrument could have produced a non-null.**

## 60. PROPOSED AS ADR-014 — a task that is honestly blocked has no state, and a rejection pointed at the wrong end of the row

**2026-08-30: the design half is now `docs/adr/ADR-014-a-task-that-is-honestly-unfinished.md`, Status
Proposed** — `partial` as a status whose obligations follow its evidence, plus the `Blocked-on:`
header and a waiting bucket that is not debt. The rejection-message half of this entry was fixed and
shipped; the entry below is kept as written because it is what was known then. The record carries the
measured cost (2 findings to 0, one word changed) and the stale-true datum that shapes the escalation
wording.

Two reports, two corpora, one gap: **the lifecycle models `pending` and `done`, and real work spends
time in neither.**

**The rejection message is FIXED.** A Verification Log row that fails the grammar was quoted as its
first 70 characters — the PREFIX, which for a row correct up to a trailing addition is precisely the
part that was fine. The wcag-43 session hand-wrote six rows, had four rejected for prose appended
after the closing backtick (`… · \`<cmd>\` (0 import-graph violations)`), and was shown a
correct-looking prefix beside a complaint about grammar. `where_it_stopped` now finds the longest
prefix the pattern still accepts and quotes what follows: *"matches up to character 45, then stops
at: (0 import-graph violations)"*. Asserted both ways — a row with a good prefix names its remainder,
a row that never starts matching is still quoted whole. Catalogue entry `lint: a rejected row is
quoted where it stopped matching, not at its prefix`.

**The design question is OPEN, and both reporters arrived at it from opposite directions.**

*wcag-43:* ADR-076 T11 is explicitly PARTIAL — two of thirteen steps blocked by facts that post-date
the task's authoring — and its acceptance command contains a clause that cannot run. `adr-lint` asked
it for a Mutation Log, which it cannot have: `adr-verify --mutant` runs the acceptance command.
So a task that is honestly blocked is pushed toward a fabricated mutant or a silent log. They
relabelled the rows `· human-observed ·`, which is what they truthfully are, and said it felt like
finding the escape hatch rather than the intended path. That is the right instinct: the escape hatch
happens to be honest here, and it will not always be.

*pirkiniukampelis-cms-laravel-3d:* ADR-013 T3 is blocked on a production deploy BY DESIGN, and they
proposed the header for it:

    **Blocked-on:** production deploy of the commit T1's suite last passed on (external event;
                    human-observed acceptance waits for it)

with the semantics: still counted OPEN because it is unfinished, but reported in a "waiting on an
external event" bucket rather than as rot; the header requiring human-observed acceptance, because a
task with a runnable fence has no business waiting; and age escalation that still applies, labelled
"still waiting" rather than "rotting".

**Then that task resolved, and how it resolved is the most useful datum here.** The external event had
ALREADY HAPPENED — production had been running the image since 2026-08-23 and no paperwork knew.
Two consequences they name, both of which the design must absorb:

1. **A `Blocked-on` row can be STALE-TRUE:** the event occurred and the row stayed blocked. So the age
   escalation should not ask "is this rotting?" but **"has the event perhaps already happened?"** —
   which was the true answer at day 7, long before any 90-day threshold.
2. **The observation that unblocked it came from ANOTHER SESSION** — a peer verified build identity
   and ran the read-only probe; the owning repository recorded it. `adr-verify --human` handled that
   unchanged, naming the observer and quoting the raw output. So cross-session observation needs no
   new mechanism, and that should be written down before somebody invents one.

**Not built yet.** It is a grammar change (a new header), a gate change (a bucket in `adr-debt`), and
a semantic rule (human-observed acceptance required, runnable fence refused) — an ADR, not a patch.
The evidence for it is now two independent corpora and one resolved instance.

## 61. OPEN — a task file can name a symbol the code does not have

**Reported 2026-08-29 by the wcag-43 session**, and it cost them an hour of tracing: ADR-076 T11's
Ordered Steps specify a read path — `violation["evidence"]["node_path"]` — that **exists nowhere in
the source**. Nothing in `adr-lint` checks that a task's `Produces`, `Consumes` or Ordered Steps
references resolve to anything real.

It is the same species as the tests-exist rule, which that corpus has now validated properly — see
the measurement below, which corrects the first version of this paragraph.

### MEASURED 2026-08-29 on 77 records: 17 of 18 true positive, and three corrections

The wcag-43 session hand-verified every row the check produces on their corpus, and corrected their
own earlier sample against their own headline:

- **The inbox item's "30 rows" DOES NOT REPRODUCE — it is 18**, re-run at the same commit under seven
  cached versions (2.27.0 through 2.34.1). Most likely the filing session counted all task-level
  findings. Not a work item.
- **All 18 hand-verified: 17 TRUE POSITIVE, 1 FALSE POSITIVE.** Seven task files across three records,
  every one marked `done`.
- **The single false positive is the row they had first sent as the rule's best justification, and
  they withdrew it.** `test_both_criteria_share_one_traversal_and_one_capture` IS in the file the
  table names; the table abbreviated the real `…_and_one_capture_set`. A table typo, not a vacuous
  acceptance. Abbreviated names are the tool's only observed failure mode; it gets RENAMES right,
  which is the case that matters — `test_migration_up_down_roundtrip` →
  `test_outbox_migration_up_down_roundtrip` is not a substring, so `-k` would miss it too.

**One sentence of ours was fabricated and is now removed.** Every finding ended "— the acceptance
filter passed without it", and four of the reported tasks run WHOLE-FILE acceptance commands with no
`-k` at all. Nothing was filtered. The existence claim was solid and the mechanism claim was an
inference the check never makes: a gate reporting an observation it did not make (ADR-005), inside a
check that is otherwise 17-for-18 correct. It now says the row describes a test the acceptance run
cannot have exercised, and names a stale table after a rename as the commonest cause.

**And 18 is a FLOOR, not a corpus total** — which is a discovery gap of the same shape as §55.
`adr-lint` only reaches tasks in a sibling `docs/adr/<slug>/tasks/`; 68 of their 76 records print
"(no tasks dir — ADR-level checks only)", and ten task tracks under `docs/implementation/adr-*/tasks/`
were never examined at all. Unexamined is not clean, and a per-record line saying "no tasks dir" is
easy to read as "nothing to check here".

**Their verdict: ship the rule.** The worst residue they found is not a typo at all — two tasks whose
tables name files that have NEVER existed while the README's acceptance runs a THIRD file. Table and
command disagree with each other, independently of any tool.

### 2026-08-29 — a third species, and why it gets a convention rather than a field

The same session then hit the case neither the tests-exist rule nor a symbol check could reach, and
it is the boundary worth naming. Two task files in ONE record disagreed about ARITY:
`apply_operator` stamps a mutation id on two elements and enforces `bearers == 2` in a post-condition
that raises, with a comment naming the other task as the reason; that other task specifies resolving
a node *"only when exactly one element matches, else None"*. Against the real corpus two always
match, so the rule returns None by construction. Every symbol exists, the identifier is spelled
identically in both files, both acceptances pass, `adr-lint` is clean on both. **Nothing textual can
catch it, and the conflict lives in a number stated in executable form in one file and in prose in
the other.** A different-lineage review found it; its top finding was that the record named the WRONG
blocker — telling the next session to wait for work that had already landed, which is worse than
naming none, because it manufactures a dependency and the reader does nothing while believing they
are blocked.

They asked whether the format should let a task declare an invariant another task must not
contradict. **Answered no, and their own case is the argument.** The invariant WAS declared, in the
strongest available form — a post-condition that raises. A `Produces: … (arity: 2)` field would add a
SECOND place to state it, and a second place drifts from the first; the record would then carry an
arity claim the code could contradict silently. Worse, a schema field can only carry what an author
already knows to write down, and here neither author knew the conflict existed. A field cannot elicit
a fact nobody has; a reader with both files in front of it can, which is what the review beat is for.

**The convention worth adopting instead, recorded as a note and not yet a rule:** when a task's
behaviour depends on a constraint enforced elsewhere in code, CITE the enforcing construct — file and
symbol — rather than restate the constraint. `Consumes:` already exists for that and is used for data
rather than for constraints. It is the same discipline as `Enforced-by:` naming a check instead of
describing one, and it has the same reason: today's measurement was that an `Enforced-by:` naming a
MUTATION carries its own reachability proof while one naming a test carries only a name. One case is
not enough to change a template; a second one changes that.

**Why the symbol version is harder, and must not be attempted the cheap way.** A test name is a
declaration; a symbol reference inside prose is not, and grepping for one would fire on every renamed
identifier, every planned name, every quoted example. The tractable form is probably narrow: a
backticked identifier in `Produces:`/`Consumes:` — the fields that already carry structured tokens —
resolved against `git grep`, advisory, and silent when the token is not identifier-shaped. Ordered
Steps prose is out of scope until somebody shows a rule that does not drown a real corpus.

## 62. CLOSED 2026-08-29 — `work-next` offered an ARCHIVE as the next thing to do

**Reported by the playtrix-d2 session** from a monorepo with 40 live task files: `work-next` listed
**75 archived task files** under `docs/adr-archive/` as executable next work. Reproduced here on a
two-record fixture, fixed, and asserted in both directions.

Its evidence rule was right — those files' Verification Log is literally `<Filled during
execution.>` — and only the SCOPE was wrong. The reporting project created its archive on 2026-08-21
to settle exactly this class: 37 tasks marked done with no exit-0 entry, where re-running acceptance
would stamp July's work with today's date. Their README calls that **"the fabrication hole with
better formatting"**, which is the best short statement of it anyone has written. So the tool was
pointing sessions at the one directory built to keep them away.

`adr-state` and `adr-context` read archives deliberately — they answer *what was decided and what was
killed*. `work-next` answers *what should be done next*, and an archived record is by definition not
that (CLAUDE.md §10). Two readers, two contracts, and this one had the wrong one. Enforced by
`tests/lifecycle.test.mjs`, which asserts the archived task is out of scope AND that the live task
beside it is still found — without the second, a walker that stopped walking would satisfy the first.
Catalogue entry `next: an archived task is history, never the next thing to do`.

**Their finding 1 is §58, independently confirmed on a third corpus and with the alternative ruled
out.** 40/40 exact correlation: every task verified before 2026-08-25 carries no
`acceptance-sha256`, and `adr-next` calls all 32 of them unverified; the two records verified after
it report done. The apparent exception confirms the mechanism — a `human-observed` task takes the
sign-off branch and is reported done without a digest. They checked the honest alternative (an
Acceptance fence edited after its evidence, which would make the withholding CORRECT) by reading git
log on five sampled task files: no commit touches an Acceptance block after its evidence date. So it
is a format migration with no migration path, not a logic bug, and their framing of the choice is the
one §58 now carries: teach the reader the legacy allowance `adr-lint` already documents, or ship a
backfill. Three corpora have now reported it.

## 63. WITHDRAWN — a surviving mutant exits 1, and this entry was filed without reproducing it

**Reported 2026-08-29 by the klientams-front-v2-01 session** after running the first full mutation
audit any consumer has done on this harness: 7 mutants, 5 killed first pass, **2 survived — and both
survivors were the assertion the task's headline claim rested on.**

**WITHDRAWN 2026-08-29 — the claim does not reproduce, and the fault for it being here is mine.**
`adr-verify --mutant` on a surviving mutant exits **1**, and has since the file was created:
`sys.exit(0 if verdict == "killed" else 1)` is in the initial commit of `bin/adr-verify` (cc94fc2),
unchanged through today. Measured on a scratch repository: a mutant that leaves the fence green
prints `NOT evidence: the fence passed with the mechanism broken` and returns exit 1.

**I filed this from a report without reproducing it**, which is the one thing this repository asks of
every finding it records — and I had spent the same afternoon praising other sessions for ruling out
alternatives before reporting. The reporter is not at fault: they said what they observed, twice, and
a session that chains two runs with `;` sees only the LAST command's status, which is a plausible
route to believing the first one passed. Reproducing takes two minutes and I skipped it because the
claim was congenial — it fitted a pattern the day had established.

**What remains true and worth keeping from the report:** their mutation audit was real and found real
things, and the two survivors were the assertion each task's headline claim rested on. That half is
below and unaffected.

**What their survivors were is worth more than the flag.** T7's claim was "flipping one registry
entry changes every chooser". Its test built a fixture registry, passed it to the selector, and
asserted correctly — while the chooser the app actually renders is a module-scope constant built at
import time from the DEFAULT registry, which a fixture argument never reaches. **The test exercised a
parameter no production caller uses**, and beside it sat a comment asserting the equivalence in
prose: *"Form and modal both render from offeredDeliveryTypes — one selector, two choosers"* — an
argument standing where an assertion should be. T1's third literal was an ORDER produced by a rank
table that exists for no other purpose, and nothing compared against it; permuting the table was
invisible.

Both were fixed by ADDING ASSERTIONS, not by touching production code, and the fix needed a
non-obvious step: mocking the registry's exported data is not enough, because the selector's default
parameter closes over the real module's own copy. **A test that injects a fixture into a selector
proves the selector derives, and proves nothing about the surface the app ships.**

They also note the tool suggests nothing about WHERE to mutate, which is the expensive judgement —
and that a task file already names `Produces` and `Consumes`, which is where a hint could come from.

## 64. CLOSED 2026-08-29 — `adr-next` answered for an undecided record without saying so

**Reported by the infrastructure-06 session** against 2.35.0 on a real corpus: `work-next` correctly
refused to execute a `Proposed` record's tasks, and `adr-next` pointed at the same record offered
`Next: T3 … also ready: T4, T5` with no status line, nothing on stderr, and **exit 0** — plus an
`adr-verify` command to run against them. Reproduced here before fixing.

That is §48 with a second front door, and their argument for why this door matters more is the one I
took: `work-next` produces a session BANNER, while `adr-next <record>` is what somebody types once
they already have the record in hand — which is exactly the moment they have stopped asking *is this
decided?* and started asking *what do I do?* A guard on the router and not on the direct entry point
protects the case where the reader was already being careful.

**It says so and still answers.** The owning record's status is read (by stem, or by ADR number when
the filename carries a slug the directory does not repeat) and reported on stderr above the answer
whenever it is not Accepted; the tasks are still listed and the exit code is unchanged. This gate
instructs and never blocks (CLAUDE.md §3), and their own suggestion was the same: a printed status
line costs nothing and removes the trap. Asserted both ways — a Proposed record produces the line and
still answers, an Accepted one produces no line at all, without which the check would be a banner
that always prints and says nothing.

## 65. PARTLY CLOSED — acceptance passed on files `.gitignore` kept out of the commit

**Reported 2026-08-29 by the golandprojects-85 session.** A `.gitignore` holding the bare pattern
`crossagentschat` — meant for the root build artifact — also matched `cmd/crossagentschat/`, because
a git pattern with no slash matches at any depth and matches directories. The task's Verification Log
records exit 0 for an acceptance block that included `test -f cmd/crossagentschat/main.go`. It ran
against the WORKTREE. The commit shipped neither that file nor its test, so a clean clone does not
build — and `TestNoURLLoggingInSource`, a guard that task introduced against logging a channel
credential, existed in no committed file.

**This is the strongest form of the class this project already names.** CLAUDE.md §8 says a check
whose answer depends on what is on your disk is not a gate; §1 records that `.gitignore` patterns
fail silently, which cost this repository two days of a published personal path. Here the evidence
was TOOL-WRITTEN and correct — the fence really did exit 0 — and still described a file that never
reached the tree.

**What is checkable, and what is not.** `adr-lint` already resolves `Governs:` against
`git ls-files` plus `--others --exclude-standard`, a set that by construction excludes ignored files
(ADR-011). Nothing resolves a task's **Affected Files** against anything. The decisive signal is
IGNORED, because it has no timing ambiguity: at authoring time a task's files legitimately do not
exist yet, so "must exist" would fire on every new task and be switched off by day two — but a path
matched by `.gitignore` is not *not yet written*, it is *will never be committed*. So the tractable
rule is: for a task carrying passing evidence, report any Affected Files path that git IGNORES,
advisory, naming the pattern that matched (`git check-ignore -v` gives it, and "the bare pattern
`crossagentschat` matches at any depth" is the sentence that saves the investigation).

### CLOSED 2026-08-29, for the ignored subset

`adr-lint` now reports it. For a task carrying a passing exit-0 entry, every path its Affected Files
name is passed to `git check-ignore -v --stdin`, and any that git ignores is advised with **the
pattern that matched**:

    advice: T1.md: Affected Files names `cmd/thing/main.go`, and git IGNORES it (pattern `thing`).
    This task's acceptance passed against the worktree, so the evidence is real and the file is not
    in the commit — a clean clone does not have it. A pattern with no slash matches at every depth
    and matches directories; anchor it (`/thing`) if it was meant for one place.

Naming the pattern is the point: *"the bare pattern `crossagentschat` matches at any depth"* is the
sentence that ends the investigation, and a finding that only says a file is missing starts a longer
one. Advisory, because a corpus adopting this on an existing tree will light up.

`check-ignore` exit 0 and 1 are answers (some ignored / none ignored); anything else — not a
repository, git absent — returns "could not look" rather than "nothing is ignored" (ADR-005).
Asserted in both directions plus both could-not-look cases: without the tracked-path assertion,
"everything is ignored" would satisfy the positive one. Catalogue entries
`lint: a git probe that could not run is not 'nothing is ignored'` and
`lint: an evidenced task whose Affected Files are ignored is reported`.

### Measured on three corpora, in both directions

The rule now has the evidence a new advisory check needs before anyone trusts it:

- **The defect tree that produced it.** A detached worktree at the original commit — bare
  `crossagentschat` pattern, `cmd/` absent from the checkout — produces the advice for both
  `main.go` and `main_test.go`, naming the pattern. On the fixed tree (anchored `/crossagentschat`,
  both files committed) every one of those lines is gone. It catches the defect it was built for and
  stops when the tree is fixed.
- **A 77-record Python corpus: 1096 distinct Affected-Files cells harvested, 0 ignored, 0 false
  positives** — with a synthetic positive proving the rule can fire at all, because a zero-hit sweep
  without a positive control is worth nothing.
- **A JS two-sided fixture**, which is the case none of us could produce from a real corpus: bare
  `dist`, `logs`, `node_modules` patterns, two tasks identical apart from their Affected Files row,
  both with real `adr-verify` evidence. The one naming `dist/bundle.js` is advised; the one naming
  `src/app.js` is silent. Same corpus, same commit, same `.gitignore`.

That last one matters because `dist` and `logs` are the two patterns nearly every JS repository has
bare, and both are plausible Affected-Files locations for a build- or log-related task — so the trap
this rule catches is not exotic there, it is the default configuration.

- **A fourth corpus, Laravel, produced a REAL hit nobody predicted precisely**:
  `storage/api-docs/api-docs.json`, the l5-swagger-generated OpenAPI spec, ignored by
  `storage/api-docs/`, absent from every commit — and the task's own fence REGENERATES it before
  grepping it. Evidence-real-but-untracked, exactly. Noise diff against 2.34.1 on the same trees:
  4→4, 1→1, 13→14 lines, and the single new line is this one. No false positives; their `vendor/`
  and `bootstrap/cache` never appear in an Affected Files row, so the riskier patterns went
  unexercised rather than passing.

**And that hit refines what the rule MEANS, which is worth more than the count.** The reporter's
judgement: advice is the right severity there *because the artifact is regenerable by the fence
itself — a clean clone re-derives it*. So an ignored Affected-Files path is not always a defect; it
is sometimes a build product whose absence from the commit is correct. That is a positive argument
for keeping this advisory permanently rather than a concession, and it is the distinction a blocking
version could not make.

**Why the message is the half that earns the rule**, in the reporter's words: it names the pattern
that matched, so nobody hunts through `.gitignore`; it states the CONSEQUENCE rather than the rule —
*a task that verifiably passed and cannot be reproduced by anyone who clones*; and it gives the fix
with the reason a bare pattern differs.

**Their stronger idea is deliberately NOT taken yet:** a post-commit `git ls-files` assertion would
catch the whole class rather than the ignored subset, but it needs a hook at a point this harness
does not own, and it changes what `adr-verify` means — that tool records what a command did, and
asserting a property of the COMMIT is a different job. An ADR, not a patch.

## 66. CLOSED 2026-08-29 — a record with no tasks answered with ANOTHER record's tasks

**Reported by the infrastructure-06 session within the hour, against the sibling matching added the
same day**, and it is the worst defect this project shipped today: `adr-next <record>` for any record
owning no tasks directory returned a FOREIGN record's tasks — the right shape of answer, the wrong
record, exit 0, and an `adr-verify` command for a record the reader was not looking at.

    adr-next docs/adr/2026-07-12-app-tier-deploy-router-hardening.md   # Superseded, no tasks dir
      → Next: T1 — …/2026-06-01-db-doctor-repair-election-hardening/tasks/T1-peers-failclosed.md

**The cause is a rule this repository already had and a second copy that did not.** Number matching
read `(?:adr[-_]?)?0*(\d{1,4})` from a filename, so every `2026-*.md` in a date-named corpus reports
number **2026** — the year — and any two of them "share" it. `lifecycle.mjs::adrNumber` carries a
`(?!\d{4}-\d{2}-\d{2})` lookahead for exactly this, measured 2026-08-26 after a corpus grew an
"ADR-2026". The rule existed; the copy written today to fix §55 and §57's sibling lookups did not have
it. That is what a third spelling of one rule costs, and it is ADR-009's lesson (one grammar, two call
sites) arriving as a defect rather than as an argument.

**Reproduced, then fixed** in both places written today — `adr-next`'s resolution and status lookup
(now one `RECORD_NUMBER` constant rather than four inline copies) and `adr-lint`'s directory message.
`lifecycle.mjs` was checked and was never exposed: its numeric arm is guarded by `adrNumber`, which
already excludes dates.

**Their analysis of why the guard shipped an hour earlier could not catch it is the part worth
keeping.** §64's status check resolves the owning record OF THE TASK IT FOUND — db-doctor's, which
really is Accepted — so it correctly printed nothing. *"A guard on 'is this task's record accepted'
cannot detect 'this task is not from the record you named'."* The defence was working and guarding
the wrong edge, which is the same family as an anchor check that validates a path against whichever
repository the reading session happens to be in.

**And their ranking is right:** the §64 case gave the RIGHT tasks with missing context; this gave the
WRONG tasks with full confidence. On this project's advises-never-blocks rule that is the bad kind of
advice — not "I could not tell you", but a confident answer about something else. A record owning no
tasks now says so and stops (exit 1), which is what they proposed; the corpus-wide reading is what
`adr-next` with no argument already means.

Asserted both ways: the record with no tasks directory refuses and names the reason and does NOT
mention the foreign record, and the record that DOES own that directory still resolves it — without
the second, a broken sibling lookup would satisfy the first. Catalogue entry
`next: the year of an ISO date is not a record number`.

## 67. CLOSED 2026-08-29 — the comment-only guard refused a build tag

**Reported by the agentsmemory-main-5b session**, twice, and correctly ranked by them as the highest-
value thing they had sent: `adr-verify --mutant` refused to restore `//go:build readcostspec` —
"COMMENT-ONLY MUTANT: this edit changes only comments or blank lines" — when removing that tag was
the whole deliverable of the task, and restoring it was the mutation the task's own Reachability table
named.

**The guard was right about the shape and wrong about the effect.** `//go:build` is lexically a
comment and semantically a build constraint: restoring it removes four test functions from
compilation. They hand-verified both directions, and the evidence is the sharper half —

    go test ./internal/mcpserver/ -run 'TestF4Chunking…' -count=1
    ok  …  0.018s [no tests to run]      exit 0

**exit 0 over a suite that executed nothing**, which is a larger behavioural change than most real
mutants and precisely the shape this project exists to catch.

**The family is not Go-only**, and several members are exactly what a campaign most wants to test,
because a coverage-suppression pragma is a mechanism whose whole job is to make something invisible:
`// +build`, `//go:generate`, `//go:embed`, `//go:linkname`, `//nolint`, `# type: ignore`, `# noqa`,
`// eslint-disable`, `/* istanbul ignore */`, a shebang.

**Fixed as a LIST, deliberately, not a heuristic.** "A comment whose first token ends in a colon"
would swallow ordinary prose, and this guard exists to REFUSE mutants — a loose exemption silently
re-opens the hole it closes. Eight directives asserted exempt and four prose comments asserted still
refused, including `// a note about nolint policy` and a sentence with `go:` mid-line. Verified end to
end on a scratch Go repository: the prose edit is still refused, the `//go:build` mutation applies and
runs. Catalogue entry `verify: a toolchain directive is not a comment-only mutant`.

**They chose the honest workaround while it was open** — recorded the mutation in their task file as a
deviation with the hand-run evidence, saying plainly that the entry was hand-verified and why. Their
alternative suggestion, a `--allow-comment-mutant` escape hatch, is not taken: an override recorded in
the log is weaker than a guard that knows the difference, and it would have pushed people toward
hand-pasted evidence, which is what they had to do.

## 68. CLOSED 2026-08-29 — the commonest correct state was reported as a failure

**Raised by infrastructure-06 while VERIFYING §66**, from a sweep of all 28 top-level records rather
than a sample: `adr-next <record with no tasks directory>` exited **1**, while `adr-next <Proposed
record>` exited **0**.

Their argument, which is the entry: a record owning no tasks directory is an ordinary, correct state
— **25 of their 28 records are in it** — and a reader asking about one gets a complete and correct
answer. This gate advises and never blocks, so reporting the commonest right answer as a failure is
the wrong code. Sharper still: *"the two states that most deserve a caller's attention are the two
that report success"* — an undecided record and a corpus whose tasks are all blocked both exit 0,
while "there is nothing to sequence here" exited 1.

Now exit 0 with a sentence naming where a record's tasks would live. A path that does not EXIST still
exits 1, because that is "I could not answer" rather than "the answer is none" — the same distinction
this project holds every gate to, applied to its own exit codes. Asserted both ways; the older
assertion that expected exit 1 for a missing path was updated to the new message rather than deleted.

**Nothing branched on the old code**: the only in-tree caller passes task DIRECTORIES and already
skips non-zero. Checked before changing it, because an exit code is an interface.

### The verification that produced it, and what it confirmed

`adr-next` run against every tracked record, asserting mechanically that every task path named begins
with that record's own stem: **3 own tasks, 0 FOREIGN, 25 no tasks named.** Before §66 every one of
those 25 returned the same db-doctor task. §64 unchanged: the Proposed record still prints its status
line and still answers.

Two more corpora re-tested the same release. **playtrix-d2:** 40 tasks, 40 done, 0 ready — the 32
pre-digest tasks all cleared, and `work-next`'s task count went 237 → 40 with the archive no longer
walked, turning a confident "Next: /adr-execute docs/adr-archive/ADR-012" into "nothing is waiting",
which was the true answer and unreachable from either reader that morning. **klientams-front-v2-01**
tested §58 in both directions from a pre-digest checkout: single-line fences accepted, multi-line
truncated rows still refused, and — the control I most wanted — mutating ONLY the recorded command of
one row flipped that task alone back to READY, proving the allowance compares the command against the
fence rather than noticing that some exit-0 row exists.

**And a limit both of them volunteered:** playtrix has ZERO multi-line fences, so their 40/40 is
evidence that nothing was left behind, and NOT evidence that the multi-line refusal works. That
narrowing came from the reporter, unprompted, against their own clean result.

## 69. CLOSED 2026-08-29 — three checks in one gate disagreed about "passing evidence"

**Found by wcag-43 while proving §65 could fire at all**, which is the part worth copying: a zero-hit
sweep is worthless without a positive control, so they built one — a task pointing its Affected Files
at `.venv/injected_probe.py` with `.venv/` ignored — and it took three fixture attempts. **The
failures were the finding.**

With the ignored path, the task marked `done`, and a `· human-observed ·` row, §65 stayed silent.
With a `· <sha> · exit 0 · \`cmd\`` row instead — same task, same bash fence, same ignored path — it
fired. And in the same run, on the same human-observed row, two OTHER checks in the same file did
fire: the tests-exist rule and the mutation-log requirement. They tested their first hypothesis
("human-observed exempts the task") and it broke, which is what turned this from an impression into a
finding.

So three checks shared the concept *has passing acceptance evidence* and one drew the line somewhere
else. **Relabelling a task to human-observed silently bought exemption from one check and not the
others** — and relabelling is exactly the escape hatch §60 already records as feeling like an escape
hatch. This is a concrete cost of taking it.

**Their argument for which line is wrong is the one I took**, and it comes from this check's own
docstring: the point is that an acceptance fence runs against the WORKTREE and an ignored file will
never be in the commit. A human ran that fence against the same worktree. The reasoning applies
identically — arguably more so, since a hand-run fence leaves no tool-written record of what it
touched. Their live corpus has a task of exactly that shape, invisible to §65 while visible to the
other two.

Fixed: a `· human-observed ·` row is passing evidence for this check as well. Asserted through
`adr-lint` on a corpus whose only evidence row is human-observed.

### The rest of that re-test, recorded because the negatives were earned

**Tests-exist is stable across both matcher changes**: 15 rows, and they PREDICTED 15 before running
because they had repaired 3 of the original 18. The delta is fully explained by their own edits — no
drift from the BDD addition or from the caller that stopped pre-stripping string literals.

**§65 on the real corpus: 1096 distinct Affected-Files cells harvested, 0 ignored, 0 false
positives** — with the positive control above proving the rule can fire.

**§60's rejection message shortens the moment it was built for**, from the person who lost minutes to
the old one: *"matches up to character 45, then stops at: (0 import-graph violations)"* points at the
only part that was wrong. They also note a row matching nothing from character 0 still falls back to
the prefix quote, which is correct — there is no partial match to report.

**And their own method error, disclosed unprompted:** their first sweep reported 0 harvested paths
and they nearly sent "0 hits" off it — the harvest had failed on a shell glob error, so they had
measured nothing and it looked exactly like a clean result. The 1096 figure is the corrected run,
positive-controlled against a path known to be ignored. That is the third session today to catch a
false all-clear in their own instrument before reporting it.

## 70. CLOSED 2026-08-29 — the verdict stopped being evicted and started being buried

**Reported by infrastructure-06 reading §54's own fix in place**, which is the thing a fixture cannot
show you. They ran a synthetic fence — two FAIL lines to stdout, twelve warnings to stderr, exit 1 —
and every mechanical property held: both stdout lines present where the old tail-of-a-concatenation
would have dropped both, `(of 12)` disclosing the drop, stdout placed first, digest intact.

And then the honest part: **fourteen lines in that block, two carrying the verdict, ten the same
sentence repeated.** §54 was filed because the verdict was EVICTED by stderr noise; the fix stopped
the eviction and the noise still won the page. Their sentence: *"If somebody's eye lands mid-block
they will conclude the task failed on a deprecation."*

**Fixed with their option 1, which they argued for over their own option 2.** Consecutive identical
lines fold into one with a count — `warning: deprecated module  (x10)` — so that block is now four
lines with the verdict first. They recommended it over weighting the budget toward stdout because
that would be GUESSING which stream carries the answer, and repeated-identical is the overwhelmingly
common shape for build and ansible stderr, which is exactly why the tail fills with it. Distinct
lines are never folded, which is the must-fail direction: without it the block would lose content
rather than repetition.

### Two friction points from building the fixture, both taken

They reported these as observations rather than problems, and both cost a reader a minute:

- **```sh was refused; the fence had to be ```bash.** `sh` and `shell` are reasonable things to type
  and the fence runs through bash either way, so both are read now — one pattern, shared by the
  recording path and the sweep, rather than a second spelling. They noted the refusal message was
  already good, naming the human-observed escape hatch; it now names the accepted spellings too.
- **A missing `## Verification Log` heading said only that it was missing.** It now says what to do:
  *"add an empty `## Verification Log` heading to the task file and re-run. This tool appends
  entries; it does not create the section, because a task file's shape is the author's."* The tool
  deliberately still will not create it — writing a section nobody asked for is how a tool starts
  editing documents.

### And two catalogue entries my own refactor invalidated

Sharing the fence pattern and folding the tail both moved lines that two existing mutations named, so
the packaging check went red — correctly, and immediately. That check exists because a catalogue
entry whose `from` no longer matches is a mutation that silently stops testing anything, and it is
the fourth time today it has caught a stale entry within a minute of the edit that stranded it.

## 71. CLOSED 2026-08-29 — a mutant that removes tests, and the false kill found beside it

**Reported by agentsmemory-main-5b re-testing §67's own fix.** The `//go:build` mutation now RUNS
instead of being refused — and lands `mutant inconclusive · the fence failed but scored no tests`.
Both rules are right on their own: the scored-nothing rule exists to catch a fence whose filter
matches nothing and passes vacuously. But **this mutant's entire signal IS that no tests ran**, and
the fence detects it correctly and fails. The detector and the classifier were reading the same fact
and drawing opposite conclusions.

**Their framing of the class is the entry:** any mutant whose effect is to REMOVE tests from a lane
reports inconclusive however correctly the fence catches it — a restored build tag, an inserted
`t.Skip`, a narrowed `-run` filter, a renamed `_test.go`. That is exactly the family §67's directive
list had just made reachable, so the two changes were one change short of working together.

**Their proposed rule was right and I could not take it as stated**, for a reason invisible from
their side: "the fence failed and scored no tests, therefore a kill" also fires when the fence cannot
run AT ALL. They were explicit about not wanting intent inferred from the fence's text, and I agree —
so the tie is broken by MEASUREMENT instead. In the ambiguous case only, and only after the mutant is
restored, the CLEAN fence is run:

- clean fence passes and scores tests → **killed** ("the mutant is what removed them")
- clean fence passes scoring nothing → inconclusive, "this fence cannot fail here, mutant or not"
- clean fence fails too → inconclusive, "the failure predates the mutant"
- clean fence does not finish → inconclusive, nothing concluded

A false KILL is the worst outcome this tool has, because it credits a suite with catching something
it never noticed — so the kill is granted only on the positive case.

### The false kill that was already there

Building the must-fail direction found one. A fence naming a runner that does not exist — `nosuchrunner` —
exits 127, matches no `BUILD_BROKE` pattern, scores nothing this gate recognises, and fell straight
through to **`mutant killed`, "a test went red"**. That predates today's work and is worse than the
complaint that led to it: an absent runner was being recorded as evidence that the suite noticed a
broken mechanism. `environment_failure` now routes it to the same baseline, and it records
`inconclusive · the failure predates the mutant`.

### The retroactive question, and this corpus swept for it

The reporter's sharper point: **every mutation-log entry written on a machine with a missing or
misnamed runner is suspect, retroactively.** A `killed` row carrying a tool-written stamp is worse
than no row, because the stamp is what makes it trusted. So this corpus was swept rather than
assumed clean (CLAUDE.md §5):

    grep -rho 'mutant killed · exit [0-9]*' docs/adr --include='*.md' | sort | uniq -c
      36  mutant killed · exit 1
       2  mutant killed · exit 2

**No entry at exit 127**, which is the signature of the command that does not exist. The two at exit
2 both run `python3 plugin/bin/spec-verify --spec …`, where 2 is that gate's own deliberate refusal
code and the mutation broke a fact binding — so the refusal IS the detection, and both are
defensible. They are named here anyway, because **exit 2 from a gate is exactly the ambiguous shape**:
a code that can mean "I refuse this" or "I could not run", and a future entry at that code deserves
the second look these two survived.

That is a sweep of one corpus, and it is the corpus that wrote the tool. A consumer whose fence
names a runner that is absent on the machine that ran it would have the false rows, and nothing in
this repository can see them from here — which is worth saying to anyone whose mutation log predates
today.

### Three fixtures, two of which asserted nothing

The first fixture printed a bare `no tests to run`; the second printed nothing at all. Neither is
what `scored_nothing` recognises — it requires the RUNNER'S own marker (`ok pkg 0.01s [no tests to
run]`), and absence of output is not evidence of an empty result set. Both reached the ordinary kill
branch, so the test passed while asserting behaviour that already existed. **The campaign said so
twice, leaving the baseline mutation GREEN both times**, and only the third fixture — emitting the
real marker — actually reached the line under test. That is the sixth GREEN mutation today from the
same family, and the first where the fixture rather than the assertion was the thing that missed.

**Their own prose went false within hours too**, and they handled it the way this corpus asks: the
deviation paragraph said *"adr-verify REFUSES this as comment-only"*, true when written and false by
evening. They rewrote it carrying both halves dated rather than patching the sentence, because a
record that silently corrects itself teaches nothing about how it went wrong.

## 72. CLOSED 2026-08-29 — the fold counted what survived the tail, not what happened

**Reported by infrastructure-06 on a fixture built to be sharper than mine**: two stdout verdict
lines, five identical warnings, a unique line, five more identical warnings, a second unique line —
which separates three questions a uniform block cannot. Is folding consecutive-only? Do unique lines
survive? How does folding compose with truncation?

The first two answered well: the two runs stayed `(x3)` and `(x5)` rather than collapsing into a
misleading `(x8)`, and both unique lines survived. **The third is the finding: the first run was FIVE
lines and reported `(x3)`.** The tail took the last ten of twelve, cutting two from the front of that
run, and the fold then counted what remained. Accurate about the block; wrong about the world.

**Their argument for why it matters more after folding than before is the part to keep:** folding
makes the block look COMPLETE. Six tidy lines with explicit counts read as a full accounting in a way
that fourteen truncated lines never did. The presentation got better and, in exactly one place, less
honest.

**Fixed with their option 1, which they ranked above their own alternatives:** fold the whole stream,
then take the last N *folded* lines. Counts become true, and truncation gets rarer — their twelve raw
lines fold to four, so nothing is cut at all. It subsumes their option 3, since the header then
describes what is actually shown. Their option 2 (mark a truncated fold) was the honest-but-lesser
version: it tells the reader a number is wrong without telling them the right one.

Asserted on their exact fixture: `(x5)` and `(x5)`, both unique lines present, no `(x10)` — the
consecutive-only property — plus a case where the FOLDED lines still exceed the budget so the header
discloses it. **One earlier assertion of mine was asserting the defect**: it expected `(x10)` from
twelve identical lines, which is the post-truncation count. Corrected to `(x12)`.

## 73. CLOSED 2026-08-29 — the honest label bought silence

**Measured by wcag-43 with one word changed**, in a scratch copy of a real record with the live
`tests/` and `src/` trees symlinked in:

    T11 status `partial`  →  0 findings
    T11 status `done`     →  2 findings

Nothing else differed, and flipping back returned 0. `partial` is not a status this reader acts on,
so the task fell out of `evidenced_task_ids` entirely — and with it went every check that runs for an
evidenced task, including **a Mutation Log finding that is true regardless of how the task is
labelled**.

**The incentive that creates is backwards, and that is the entry:** `done` buys scrutiny you may not
survive, `pending` is a lie once code has landed, and `partial` — the truthful word for what
happened — is the one that makes the linter stop looking. Nobody chose that. It is the third shape of
the same disease this corpus met today: a surface answering a narrower question than its label
implies.

**Fixed only as far as honesty allows.** A status this reader does not act on is now REPORTED — it
names the task, quotes the status, and says which checks did not run for it. It does not decide what
`partial` should mean; that is a decision about the lifecycle (docs/BACKLOG.md §60), not a lint rule.
What it refuses is letting an unrecognised status pass for silence, which is ADR-005's distinction
turned on the corpus's own vocabulary. Asserted in both directions: `partial` advises, `done`,
`pending` and `blocked` stay silent, and an empty or placeholder cell claims nothing.

**They corrected their own earlier attribution to get here.** They had told me T11 was invisible to
§65 because its rows are `human-observed`; the real cause was the status. Their scratch finding
stands on its own and §69 fixed it, but the live example had been attached to the wrong cause — and
the real one was bigger. They also caught a fixture artifact before sending: a first run without the
`tests/` tree reported 12 findings, ten of them tests-exist rows firing because the directory was
absent. The honest count is 2.

**And their exit-127 sweep is a clean zero of the uninteresting kind**, which they said plainly:
0 rows matching `mutant killed`, and 0 files containing a Mutation Log section at all. Their corpus —
the largest on this machine, 77 records — has never adopted the mutation log, a week after the
cutover. That is "the check has nothing to run against here", not "we ran it and we are clean". The
adoption number is the more interesting one, and T11 is post-cutover, needs a log, and per §73 was
not even being asked.

## 74. PROPOSED AS ADR-013 — a mutation a human performed has nowhere to be recorded

**2026-08-30: this is now `docs/adr/ADR-013-a-mutation-a-human-performed.md`, Status Proposed.** The
entry below is what was known when it was filed and is kept as written; the record carries the
decision, its four alternatives (including doing nothing), and the risk the tooling cannot mitigate.
Nothing is executed until a human accepts it — `work-next` names its three tasks as belonging to a
record nobody has accepted, which is the guard working.

**Reported by wcag-43, who tried three routes and refused all three.** Verified against source: the
two log grammars are asymmetric, and the asymmetry is exactly backwards from what forgeability would
predict.

    VLOG_RE  … (?:<sha> · exit N · `cmd`  |  human-observed · .+ ) …
    MLOG_RE  … <sha> · mutant (killed · exit [1-9]\d* | survived · exit 0 | inconclusive · exit \d+) …

**A Verification Log can say "a person ran this and observed the result". A Mutation Log cannot** —
even though a mutation is the EASIER of the two to perform and observe by hand: edit one line, run,
read the exit code, revert.

Their case is not hypothetical. T11's Acceptance contains an integration clause that is blocked, so
`adr-verify --mutant` cannot run it. They performed the mutation anyway — replaced a `match_reason`
call with `if True`, which is the "rate is always 1.000" bug the column exists to prevent — one test
went red, reverting turned it green. **A real kill, performed and observed, with nowhere to put it.**

What they tried, and why each failed:

1. **A prose-only `## Mutation Log`.** Rejected by the gate — *"its Mutation Log is empty"* — and they
   say the rejection is correct: an explanation is not evidence.
2. **Hand-typing a `mutant killed` row.** Refused on their own side, citing this project's source:
   *"a typed mutant is the thing the log replaced."* Typing one dresses a hand-run mutation as
   tool-written, which is the move they had already corrected themselves for once today.
3. **`adr-verify --mutant`.** Cannot run; there is no path that skips an unrunnable clause.

**They deliberately did NOT propose the fix**, and their reason is the decision: adding
`human-observed` to `MLOG_RE` may be exactly wrong. A hand-typed mutation row is trivially forgeable
in a way a hand-run acceptance is not — the whole point of `--mutant` is that the TOOL made the edit,
ran the fence and read the exit code, so nobody can claim a kill they did not get. Opening a prose
lane could hand back the forgeability the mechanism exists to remove.

Against that: an honestly-blocked task cannot carry mutation evidence it genuinely has. That is §73's
shape again — **the truthful path is the one with no paperwork available** — and it is now the third
instance of that pattern in this corpus in one day.

**Their narrow proposal is the one worth arguing about**, and it is better than the obvious fix: a
human-observed mutation row could be required to quote the exact one-line DIFF and the test that went
red. *"Checkable by a reader in a way `· mutant killed · exit 1 ·` is not."* That keeps a
forgeability property rather than removing one — a fabricated diff has to name a real test and a real
line, and the next reader can run it.

**Not decided here.** It is a change to the evidence grammar, which is this project's most
load-bearing contract, and the tradeoff is between two failure modes that both matter: a forgeable
lane, or an honest task that cannot record what it did. That is an ADR and a human's call.

**What they did in their repository: nothing.** T11 keeps its mutation evidence as Verification Log
prose and no `## Mutation Log` section was added, because adding a section that cannot hold a valid
row trades a silent gap for a rejected one — and the gap is the honest state until the format has a
lane.

## 75. CLOSED 2026-08-29 — the right column of the wrong table

**Found by the sweep I asked for**, after §73's word-extraction fix: the status check fired on **7 of
28 records**, reporting statuses like `T2, T4`, `T1`, `T6`, `T3, T5, T6, bitbucket-deploy`. Those are
DEPENDENCY values.

**The extraction was fine; the binding was not.** A tasks README commonly holds TWO tables whose first
column is `| T1 |` — the status table, and a wave/ordering table whose third column is *depends-on*.
The check took the status column index from the first header it saw and applied it to every later
row, so each task produced one correct read and one garbage read, and the garbage one is what got
advised on.

The index is also **per-table**, which the same corpus proves: one status table is
`ID | Title | Status | Owner | Acceptance` and another is `ID | Title | Status | Acceptance`. A
column number right for one is wrong for the other **even among the correct tables**.

Fixed by binding every row to its own table — a header is a row whose next line is a separator, the
status column is located by NAME within that header, and rows carry the column their own table
declared. Asserted on the reporting corpus's exact two-table shape, and in the direction that matters:
the status table is still read when a second table follows it, without which "ignore the second
table" degrades into "ignore everything".

### The family this belongs to, named by the reporter

Their observation, and it is the fourth instance in one day: **reading the right position in the
wrong container.** `adr-next` returning a foreign record's tasks (§66); `ADR_FILE` and `taskFiles()`
discovering by different rules over one corpus (§55); an agentsmemory anchor checked against whatever
tree the reading session happened to be in; and now a status column read out of a table that has no
status column. *"Each time the extraction is correct and the binding is not."*

### The campaign then found the fix half-untested

CI came back GREEN on the mutation for this change, and it was right to. Two mechanisms protect the
binding — a reset on any non-table line, and re-reading the header per table — and with a blank line
or a heading between the tables the RESET alone is enough. So a mutant that skipped the per-header
re-read behaved identically on every fixture, because every fixture had a gap.

The case that separates them is two tables **back to back**, with no blank line or heading. There the
reset never fires and only the re-read prevents the second table's column being read as a status.
Added, and the mutation goes RED.

Worth naming as its own shape: **two mechanisms where one is never exercised** is the same defect
class as a catalogue entry naming a test that never drives the changed path — the code is right, the
evidence that it is right covers only half of it, and nothing says so until something breaks the
untested half deliberately.

### Verified on the corpus that found it, with a positive control

The re-sweep across all 28 records: **before 7 fire / 21 silent, after 0 fire / 28 silent**, with no
README touched — the shape is legitimate and the tool was wrong about it, not the other way round.

**And they built the positive control themselves**, for the reason that makes it worth recording:
*"app-tier and db-doctor go silent is also what a disabled check looks like, and testing only that
direction would have been today's error one more time."* Their control is a status table with a
genuinely unacted status followed IMMEDIATELY by an ordering table — no blank line, no heading, which
is the exact case the mutation had shown untested. It produced **one** advice, naming
`**partial** — two of thirteen steps` and NOT naming `T2, T4`. So the check fires on a real unacted
status, the per-header re-read prevents the back-to-back leak with no reset to fall back on, and
emphasis is not an exemption — all three, independently exercised.

**One thing they noticed that I took:** the advice quoted the whole cell, so a reader could take that
string as what the tool treated as the status and conclude the parser is naive in exactly the way it
is not. It now names both — ``status `partial` (from `**partial** — two of thirteen steps`)`` — and
does not repeat itself when the cell already is the word. Same instinct as §65 naming the
`.gitignore` pattern that matched: show what was READ, not only what was there.

### Confirmed again on the released build, and the method is the keeper

Re-run under v2.38.0 (2a17224): **0 fires, 28 silent, control still advises.** Stable across two
builds.

**How they ran it matters more than the result.** Their previous sweep grepped for the literal
sentence `which this reader does not act on`. The message had just changed — to name the extracted
word beside the raw cell — and if that change had dropped the sentence, **their detector would have
returned 0 fires for the wrong reason**: a false all-clear produced by their own assertion rather
than by the code under test. Today's family, aimed at the verifier's own instrument.

So they ran the positive control FIRST to learn the new format, then built the sweep's pattern from
what the tool actually emits rather than from what they remembered it emitting. The sentence turned
out to be unchanged and the old grep would have worked — *"that is luck, not method, and the method
is the part I would keep."*

**The rule, stated generally:** a detector built from remembered output is a claim about a version.
Build it from what the tool emits in the run you are about to trust, or a cosmetic change upstream
turns your sweep into a silence you will read as safety.

### The blast radius, measured on a second corpus — and the release window it opened

**173 rows across 14 of 14 task READMEs** sit in a non-first table on the wcag corpus. It is not one
record's quirk; it is that project's house layout, present in the template every track was written
from. ADR-076's two headers show why those rows were garbage under the old parse:

    | ID       | Title    | Status      | Covers        | Acceptance     |
    | Producer | Contract | Consumer(s) | Ordering note |

Column 3 of the second table is `Consumer(s)`, so eight rows in that one file would each have
reported a status of `T2, T4, T9`.

**The second-order case they flagged is the one worth the fixture:** the same task id appears in BOTH
tables. `T4` is `done` in the status table and `T10` in the producer table, so whichever the parser
read LAST won — **a task's real status overwritten by a dependency cell**. Asserted now on their exact
shape: `T4` produces nothing, and `T11`'s real `partial` from the first table survives.

**And the §73/§75 interaction is the part to remember about SEQUENCING.** Before §73, an unrecognised
status was a silent exemption — so this parse bug was MASKED by the other bug: 173 rows carried
garbage statuses, and the tool's response to a garbage status was to say nothing. Two defects
cancelling into apparent quiet.

§73 removed the silence. **Between v2.37.0 and v2.38.0 there was a window in which that corpus would
have emitted ~173 false findings**, one per row, each naming a `Consumer(s)` cell as a status word. A
user updating into that window would have watched their corpus explode and reasonably concluded §73
was the broken thing — when §73 was correct and had merely stopped hiding §75.

They skipped the window by accident rather than judgement (their user had not updated). The lesson is
not "ship them together", which is easy to say afterwards: it is that **removing a silence exposes
everything the silence was covering, and the exposure looks like a regression in the thing that
removed it.** Worth knowing before the next check that turns quiet into noise.

### And the fixture could not have caught it

The cell I built from their message — `**done** (2026-07-29) — sshd drop-in split off to T3b` —
parses correctly, and their status table produces no advice. **The defect lives entirely in the
second table, and they had sent me the cell without the table it sits in.** A fixture built from a
reported symptom tests the symptom; only the corpus tests the corpus.

They also corrected their own process, unprompted, for the second time today: their earlier "clean
negative" was worthless because they ran `adr-next` and `work-next` and never ran `adr-lint`, where
the check lives. *"I reported 'nothing there' when the honest report was 'I did not look'."* That is
the same distinction this project holds its gates to, applied by a reporter to their own report.

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

## 76. CLOSED 2026-09-02 — `Enforced-by:` split on comma, and 80 of 345 mutation labels contained one

**Found 2026-08-30 while executing ADR-013 T1**, by trying to name a new mutation in the record's
own `Enforced-by:` header and watching the gate report two pointers where one was written.

`Enforced-by:` is a comma-separated pointer list: each entry must resolve to a mutation label in
`tests/mutations.json`, a `path::name` test that exists, or a gate in `bin/`. The label

    ADR-013: from/to are code spans, so a mutated line may contain a backtick

was split at its comma into `ADR-013: from/to are code spans` and `so a mutated line may contain a
backtick`, and both halves were advised as pointers to nothing. The header was correct; the reader
cannot express it.

**The sweep, and it is not a rare shape — it is the house style.**

    python3 -c "import json; d=json.load(open('tests/mutations.json')); \
      print(sum(1 for m in d['mutations'] if ',' in m['label']), 'of', len(d['mutations']))"
    → 80 of 345

Nearly a quarter, because this project names a mutation for the distinction it kills — `lint: None
is an answer, not an unresolvable pointer`, `verify: a fence that never returned is UNRUN, not a
verdict`, `mcp: a completed run is content, never the error channel`. The `X, not Y` construction
is exactly how a mutation label says what it protects, so the collision follows from the
convention rather than from carelessness.

**Why this is worse than an unusable header.** The advice does not say "your label contains a
comma"; it says the pointer names nothing. The cheap response is to rewrite the label or drop the
pointer — which is what I did, renaming the mutation to avoid the comma. So the pressure runs
backwards: the naming convention that makes a label informative is the one that makes it
unnameable, and the gate quietly teaches authors to write less descriptive labels. **14 records
currently carry an `Enforced-by:` header**, so anything they could not name is invisible today.

**Not fixed here**, because it is a change to how a shared header is parsed and belongs with its
own evidence. The obvious candidates: accept backtick-quoted entries (`` `label, with comma` ``),
split on a separator that cannot occur in a label, or match the whole header value against known
labels before splitting. The third needs no format change and no migration, which makes it worth
pricing first.

**Sibling left open deliberately:** whether the same split is used by any other header that names
a check. Not swept — the class is "a structured header whose separator can occur inside its
values", and `Enforced-by:` is the only member confirmed.

---

**CLOSED 2026-09-02 — the mechanism was already fixed; what was left was the workaround.**

`enforcement_pointers()` in `plugin/bin/adr-lint` takes the third option this entry priced as worth
pricing first, in the shape of the second: **a backticked span is one item, commas inside it
included**, and whatever falls outside the backticks is then comma-separated. Its own comment
records the intermediate mistake — a first fix that split on all commas and broke every label
containing one — and both cases are in the shared truth table. `Rests-on:` (ADR-022) reuses the
same grammar, so an author who has written one header has written the other.

Verified rather than read, 2026-09-02:

    bare (as this entry wrote it): ['ADR-013: from/to are code spans', 'so a mutated line may…']
    backticked:                    ['ADR-013: from/to are code spans, so a mutated line may…']
    mixed `x, y`, adr-lint:        ['x, y', 'adr-lint']

**But this entry's own scar was still in the corpus.** ADR-013's `Enforced-by:` still carried the
renamed, comma-free label — the workaround this entry describes making. It has been restored to
the descriptive form and backticked, so the fix is now exercised on real corpus content and not
only on fixtures. `adr-lint` resolves it, exit 0, with no pointer advisory.

**The class, swept rather than assumed** — every `Enforced-by:` pointer in all 22 records:

    for f in docs/adr/ADR-*.md; do python3 plugin/bin/adr-lint "$f" | grep -i "Enforced-by names"; done
    → no output: every pointer in the corpus resolves

The backticked form is already the house convention — 8 of the 9 multi-pointer headers use it. The
count today is **90 of 425**, up from 80 of 345, so the naming convention this entry defended has
gone on being used, which is the outcome it wanted.

**The sibling above stays open**: no other header with the same shape has been swept.

## 77. The backtracking fix has a regression test and no catalogue mutation

**Found 2026-08-30 while executing ADR-013 T2**, immediately after a Codex review found the
catastrophic backtracking it is about (the fix is in the commit that removes the backreferenced
code span).

The property — *rejecting a Mutation Log row of backticks must not backtrack* — is guarded twice,
once in `tests/gate-regressions.py` against the compiled pattern and once in
`tests/evidence-chain.test.mjs` through the real `adr-lint` binary. Both assert a wall-clock bound.
Neither is in `tests/mutations.json`, and the entry written for it was **removed rather than kept**.

**Why it was removed, which is the part worth recording.** The mutation reintroduced the
backreferenced span as an extra alternative:

    r"|```(?:[^`\n]|`(?!``))" + quant + r"```" + r"|(?P<zz>`+).*?(?P=zz)"

It came back RED, and the campaign named **fifteen** killing tests including every unrelated one.
That is the tell. `_code_span` is called twice (once for `from`, once for `to`), so any NAMED group
inside it is defined twice in one pattern, and the mutant does not slow `adr-lint` down — it stops
it importing:

    re.PatternError: redefinition of group name 'zz' as group 2; was group 1

So the row would have claimed a timing property was protected while measuring "the module still
loads". A mutation that kills for the wrong reason is the same defect as one that survives for the
wrong reason (CLAUDE.md §4), and it is harder to notice because the verdict looks right.

**The obstacle is structural.** A backreference needs a named or numbered group; the helper is
called twice per pattern; so no mutation that reintroduces the original spelling can avoid the
collision. Reintroducing catastrophic backtracking WITHOUT a backreference is possible in principle
(nested quantifiers over an ambiguous class) but was not attempted — inventing a second pathological
regex to prove a fix against the first is a worse trade than saying plainly that this one is
covered by assertion and not by mutation.

**What would close it:** either a `_code_span` that takes its group name as a parameter, so a mutant
can be unique per call site, or a mutation catalogue that can express "this must complete inside N
seconds" as a first-class claim rather than as a side effect of a broken regex. Neither is worth
doing for one property; both become worth doing at the second.

**Left open deliberately, at one instance.**

## 78. CLOSED 2026-09-02 — `! grep` cannot fail a `set -e` fence, and that is the idiom the vacuity guard is written in

**Reported 2026-08-30 by agentsmemory-main-5b**, measured in their corpus and reproduced here before
recording. POSIX specifies that `set -e` does not apply to a command whose status is inverted with
`!`, so the standard vacuity guard is inert inside a `set -e` script. Both shells, on this machine:

    sh   -c 'set -e; ! grep -q FAIL /tmp/x.out; echo REACHED; exit 7'   -> REACHED, rc=7
    bash -c 'set -e; ! grep -q FAIL /tmp/x.out; echo REACHED; exit 7'   -> REACHED, rc=7
    sh   -c 'set -e;   grep -q NOPE /tmp/x.out; echo REACHED; exit 7'   -> rc=1   (control)

The `! grep … && next` form is inert for a second reason — the `&&` short-circuits and the script
carries on.

**This corpus has zero instances, and the reason is luck rather than design.** Swept by fence block
over `git ls-files docs/adr`:

    fences=51  set -e=0  negated grep=22  BOTH (inert)=0  negated-grep-is-last-command=22

Every Acceptance fence here opens with `set -o pipefail` and never `set -e`, and all 22 negated
greps are the LAST command in their fence — where the status IS the script's exit status, so the
guard is load-bearing. The reporter's corpus has 50 that sit mid-script under `set -e` and are
therefore inert. Same idiom, opposite outcome, decided by a convention neither corpus wrote down.

Their sweep also found **0 cases where the inert guard was the only detector**: all 50 sit beside a
positive assertion (`grep -q -- "--- PASS: …"`), and a lane that scored no tests prints neither, so
the positive check already catches the vacuous case. The negated guard is redundant there, which is
exactly why its inertness never produced a failure anyone investigated.

**Why it is worth a check anyway.** It READS like the vacuity guard, and the first fence written
without a positive assertion beside it loses the vacuity check silently — a gate that cannot fail,
which is the defect this project exists to demonstrate the absence of. The un-negated form costs
nothing:

    if grep -qE "no tests to run|^FAIL|^--- FAIL" /tmp/out; then exit 1; fi

**What a check must distinguish**, and why it is not a one-liner: *inert* (negated, under `set -e`,
not the last command) from *redundant but harmless* (negated, but last, or beside a positive
assertion). Reporting the second as a defect is how a gate teaches people to ignore it.

**Not fixed here**, and no instance in this repository to fix. It belongs in a fence linter, and the
reporter's 50-versus-0 measurement is the evidence for how to phrase the advisory.

**CLOSED 2026-09-02 (6c0a392).** It went into the fence linter, as the entry said it should.
`inert_negated_guards()` in `plugin/bin/adr-lint` reports a negated grep only when errexit is on
AND the guard is not the fence's last command; `adr-lint` advises, never blocks.

**The silent cases are the design, and they are asserted.** A negated guard that IS last is
load-bearing — its status becomes the script's — and one beside a positive assertion is redundant
but harmless. Three silent cases sit beside the firing one in
`tests/gate-regressions.py::test_a_negated_guard_that_cannot_fail_its_fence_is_reported`, because
without them the check passes just as well against a function returning every negated grep it sees.

**The POSIX claim is asserted in the test, not merely quoted here.** The test runs both shells and
the un-negated control, so the advisory rests on observed behaviour rather than on this entry.

**A defect the test caught in the fix.** The first `ERREXIT_RE` ended `-[a-zA-Z]*e\b`, and between
the `e` and the `u` of `set -eu` there is no word boundary — so the commonest hardening spelling of
all was missed. Both spellings are now catalogue mutations (RED, each killed by exactly one test).

**This corpus is asserted clean rather than assumed clean.** The test sweeps every Acceptance fence
under `docs/adr` and requires an empty result, so a fence that adopts `set -e` later is caught
rather than reasoned away — the entry's own "zero instances by luck rather than design" made
permanent.

## 79. CLOSED 2026-09-01 by ADR-016 — the mutant classifier cannot tell a vacuous fence from a kill whose signal is "no tests ran"

**Closed 2026-09-01, by reading the code rather than the entry.** ADR-016 decided this case
explicitly — *"mutant fence fails because no tests ran, while the clean fence passed with tests:
`killed` by the existing missing-tests rule"* — and `plugin/bin/adr-verify:1320-1325` implements it:

    elif scored_nothing(out):
        # The already-measured clean fence passed and scored tests. If the
        # mutant run now reports none, the mutation removed the runnable lane.
        verdict = "killed"

The clean-fence baseline ADR-016 part 1 introduced is what made the distinction computable: the
exit code alone could not separate "the fence filter matched nothing" from "the mutant removed the
lane", but a baseline that passed *scoring tests* can. That is the question this entry said the
classifier does not ask.

**Nothing marked this entry closed when the fix landed**, which is the same defect as the two others
found the same day — the research doc's stale gap list and CLAUDE.md §7's `resolve_bash()` claim.
Three prose records asserting a live defect that the code had already fixed, none of them checked by
anything. See §103.

The entry as filed follows.

### As reported


**Reported 2026-08-30 by agentsmemory-main-5b**, observed at their commit 25cd90b against
quality-harness v2.36.0:

    2026-08-29 · 25cd90b · mutant inconclusive · exit 1 · internal/mcpserver/readcost_spec_test.go
      the fence failed but scored no tests

Two rules that are individually right, colliding. The "scored no tests" rule exists to catch a fence
whose filter matches nothing and passes vacuously. But this mutant's ENTIRE signal is that no tests
ran — the fence detects it correctly, by grepping for `no tests to run`, and fails.

**The class:** any mutant whose effect is to REMOVE TESTS FROM A LANE is reported `inconclusive`,
however correctly the fence catches it.

The question the classifier does not ask is whether the fence scored no tests and **passed**
(vacuous — `inconclusive` is right) or scored no tests and **failed because it detected that** (a
kill). The exit code already separates the two.

**Not confirmed as previously known.** A search of this backlog for the vacuity rule did not turn it
up, and no exhaustive sweep was run — so this is "not confirmed present", not "confirmed absent".

**Not fixed here, deliberately.** Widening what counts as `killed` is a change to how a verdict is
computed, and this project's rule is that a gate must never report an observation it did not make.
That needs its own record and its own evidence rather than a patch attached to unrelated work.
The reporter says their PR #117 carries the reproduction.

**Related but not the same hole:** ADR-013 gives a lane to a mutation the tool COULD NOT RUN. This
one is a mutation the tool ran and classified wrongly. A row that belongs to §79 must not be routed
into ADR-013's lane — that would launder a computable verdict into a hand-reported one.

## 80. A contract test that asserts words appear, not that a document says the right thing

**Found 2026-08-30 by a SURVIVED mutation during ADR-013 T3** — recorded in that task's Mutation Log
rather than deleted, because a survivor is a finding.

The mutation changed the template's heading:

    WHEN THE FENCE CANNOT RUN TO COMPLETION  ->  WHEN THE FENCE IS INCONVENIENT

`tests/skill-contract.test.mjs::the template and the execute skill agree about the human mutation
lane` did not notice. The phrase occurs **twice** in the template — once as that heading, once in the
prose that defines it — so removing it from the heading left the other occurrence carrying the
assertion. Exactly the shape CLAUDE.md §4 names: the test went through a second guard covering the
same input.

**Why it matters beyond the assertion.** The mutated template is not merely missing a phrase, it is
CONTRADICTORY: the heading invites the inconvenient case and the prose two lines down excludes it.
An author reads the heading. The check reads the file. A document can be internally inconsistent in
the precise way that matters and stay green.

**The general form**, which is the part worth keeping: *asserting that a string appears in a document
is not asserting that the document tells the reader the right thing.* Every "the skill mentions X"
check in this suite has the same ceiling, and they are a ratchet against renames rather than a check
on meaning — which is what they were built for and is fine, provided nobody mistakes one for the
other.

**Not fixed.** The honest fix is not another substring: it is either checking the phrase where it is
load-bearing (the line that introduces the flag) — brittle, and it drifts with formatting — or
grading the document's meaning, which needs `claude plugin eval` and graders that can actually run.
This suite's own header already says that is out of scope and why.

**What was done instead**, so the record is not a promise: T3's killed mutant was taken on
`--human-mutant` in the template, which occurs exactly once and is load-bearing for "an author whose
fence cannot run can find the lane at all". Both rows are in the task's Mutation Log — the survivor
and the kill — because the survivor is the more interesting of the two.

**One instance. Left open.**

## 81. The same ReDoS class, written twice in one day, the second time after being told

**Found 2026-08-30 by the session that had just fixed the first one**, while preparing questions for
a review rather than by a test.

The Mutation Log code span shipped with `(?P<q>`+)(?P<body>.*?)(?P=q)`, which a Codex review found
was catastrophically slow on input it REJECTS (2.07s at 600 backticks). That was fixed, the lesson
written into `wing_craft`, and the commit message explained it at length.

Hours later, the same session wrote ADR-014 T2's advisory as:

    re.search(r"\(([^()]*[a-z][^()]*)\)\s*$", value)

Two unbounded classes either side of a required character. Measured on a `Blocked-on` value that
opens a parenthesis and never closes one:

    n=16000   0.84s
    n=60000  11.92s

Same shape, same day, same author, after the lesson. Replaced with a linear scan from the end
(`names_a_check`): 0.00005s at 400 000 characters.

**What is worth recording is not the regex — it is that knowing the rule did not prevent it.** The
first one was found by an outside reviewer; the second by deliberately re-asking that reviewer's
question against new code. Neither was found by the suite, because in both cases every assertion was
green: the cost falls on the REJECTING path, and a test that feeds a validator VALID input never
pays it.

**So the generalisable practice is not "avoid backreferences".** It is:

1. **Every validator gets a rejecting-path timing assertion**, not only a correctness assertion.
   Both fixes now carry one; nothing else in this repository does.
2. **When a review finds a class, re-run its question against everything written since** — including
   code written after the fix, which is where this one was.

**SWEPT 2026-08-30, and the result is one latent hit.** The class is "a regex with two unbounded
quantifiers separated by a required element, applied to author-controlled text". Candidates were
found mechanically across `plugin/bin/` and `plugin/scripts/` and then MEASURED on rejecting input
rather than judged by eye:

    17 candidate patterns; 4 measured against adversarial non-matching input; 1 superlinear.

The one: `plugin/bin/adr-judge:60`, `` `[^`]*[-./_ ][^`]*` `` — the evidence-detector's "a path,
command or quoted output" arm. Fed a line that opens a backtick and never closes it:

    n=  1000   0.0002s
    n= 32000   0.4262s
    n=128000   3.8053s

Quadratic, and the same shape as the two already fixed. **It is not a live hazard and the numbers say
why:** the longest line in everything this gate reads is 4 062 characters
(`docs/adr/ADR-010-…/tasks/T1-four-buckets.md:163`), which costs about 3 ms. The other three measured
patterns are flat — `adr-lint:1584`, `lifecycle.mjs:838` and `lifecycle.mjs:454` are all under a
millisecond at n=32000, because each is anchored or bounded by a literal that cannot be traded across.

**Deliberately not fixed**, and this is the judgement rather than an oversight: adr-judge reads ADR
prose from the repository it is run in, the realistic worst case is three milliseconds, and the
regex is one arm of a thirteen-arm alternation whose readability is the reason the detector is
auditable at all. Rewriting it linearly costs more clarity than it buys safety. Recorded with the
measurement so a later session can decide differently on evidence rather than re-deriving it — and
so that if a corpus ever feeds this gate a machine-generated line, the number is already here.

**The sweep command is the deliverable**, and it is in this repository's history rather than in
anyone's memory: candidates by pattern shape, then timing on input the regex REJECTS. The second
half is the part that matters; the first half alone would have flagged sixteen innocents.

## 82. `BROKEN` is the wrong word for "the target is in another repository"

**Reported 2026-08-30 by klientams-front-v2-01**, who ran the current gates from this working tree
against their own finished corpus. Both `adr-lint` runs passed. `adr-debt` exited 1, and the whole
of it was two pointers:

    BROKEN [adr] ADR-001…: ('ADR-007 Follow-ups, backend repo') A CourierInterface/registry …
    BROKEN [adr] ADR-002…: ('ADR-007 Follow-ups, backend repo') A backend CourierInterface/registry …

ADR-007 lives in the Laravel backend repository. Their SPA repo is one half of a two-repo decision,
so the pointer is **correct and unresolvable from here by construction**, and always will be.

**This is not a request to support their corpus. It is a gate borrowing a verdict's vocabulary,
which CLAUDE.md §3 forbids in as many words:** *"a filter that matched nothing is 'I could not
look', not 'the thing is absent' … If a check cannot determine something, it says so — `UNRUN`,
`PARTIAL`, `UNPROVEN` — and never borrows the vocabulary of a verdict."* `adr-debt` cannot see the
other repository. It reports `BROKEN`, which means *you wrote a bad pointer*. Those are different
findings and a reader cannot act on the first if it is spelled as the second.

**The tell that it is a gap rather than their mess**: the ADR-002 author had to write the excuse into
the pointer text, inside the data field —

    "…adr-debt reports this pointer BROKEN because the destination lives in another repository,
     which is correct and expected; per the standing SPA-only rule it needs its own session"

A human writing a comment to a linter inside a value the linter cannot read. That is the same shape
as the `partial` silent exemption ADR-014 closed, inverted: there the honest word bought silence,
here honesty has **no word at all** and prose is the only recourse.

**What it costs if unfixed:** a corpus that is one half of a cross-repo decision is permanently red,
and the first thing a team does with a permanently-red gate is stop running it. That failure mode is
this project's whole subject.

**The shape of a fix**, not a decision — the vocabulary already has `(permanent: <why>)` for
deliberate non-deferral; the missing sibling is a deliberate EXTERNAL pointer, resolving as
intentional rather than broken, counted in its own column, keeping exit 0. The reporter explicitly
declined to propose a spelling and asked that it be designed rather than adopted.

**Open questions a record would have to answer**, and the reason this is not a one-line fix:
how the reader distinguishes a genuinely external target from a typo that merely looks external;
whether an external pointer needs a receipt at the far end (the §41/§76 reciprocity rule says a
pointer that resolves is not a pointer that was honoured, and nothing here can check the far end of
a cross-repo edge); and whether "external" is a property of the pointer or of the corpus.

**Not fixed. It wants its own record**, because it changes a shared vocabulary three tools read.

## 83. A task waiting on a DECISION nobody has made has no header, and rots silently

**Reported 2026-08-30 by wcag-43**, who explicitly declined to propose it: *"I have one instance and
you have shipped two ADRs today on the strength of one instance each; a third on the same evidence
would be me pattern-matching my own case into your format."* Recorded at their assessment, not
above it.

ADR-014 models two kinds of waiting and the distinction between them is ownership:

    Depends-on  — another task IN THIS CORPUS must land. Someone here can go and do it.
    Blocked-on  — something OUTSIDE it must happen. Nobody here can make it happen sooner.

Their T11 step 5 is neither. It is waiting on **a decision nobody has made**: compare the evidence
node against both mutation-id bearers and credit the nearer, or pick one bearer with a stated
justification. No amount of work unblocks it. No external event resolves it. Every prerequisite
exists. A human has to choose.

**Why it is worth a header rather than prose.** Today that state reads as `partial` with three
paragraphs of Verification Log prose carrying the whole thing. An unmade decision does not announce
itself the way a shipped dependency does — nobody is notified when a choice continues not to be
made — so it is the state most likely to rot and the least likely to be noticed rotting. With a
header, `adr-debt` could ask the question that actually matters: *this has been waiting on a
decision for 30 days; has anyone been asked?* That is the same escalation ADR-014 T3 already built
for `Blocked-on`, pointed at a different kind of wait.

**TWO INDEPENDENT INSTANCES as of 2026-08-30, in different repositories.** The second came from
klientams-front-v2-01 within the hour, unprompted by the first and phrased the same way — from their
ADR-001 Follow-ups:

    `DeliveryDetailsFormModal.tsx` adopts the extracted schema — requires deciding the `.trim()`
    divergence first (it is a validation behaviour change, not a refactor).

They then measured the divergence and closed the investigation: adopting the extracted schema is a
LOOSENING, verified by executing `safeParse`, bounded by the payload builder's per-type whitelist to
validation-UX rather than data integrity. **And it is still blocked** — what remains is not
information, it is a human choosing whether to accept a loosening in a money-adjacent path. Their
words: *"there is no command that returns 0 when someone has made up their mind."*

That is the shape wcag-43 described, arrived at independently, and it defeats the obvious
cheap answer: this is NOT a `Blocked-on` whose event is "a person decides X", because `Blocked-on`
as shipped asks for an event a reader can check, and a decision has no such check. Two instances,
two repositories, and the design question already answered — so this is a record's work now, not a
note's.

**Originally left as a note on this corpus's own rule** — §61 and §53 sit at one instance each for
the same reason. The reporter's caution is the right one: two records shipped
today each rested on a single instance, and the discipline that made those work was that the
instance came from a corpus that was not this one AND the shape was independently measured. This has
the first and not the second.

**What would make it real:** a second, independent instance — a task in some corpus that is blocked
on a choice rather than on work or on the world. If one appears, this becomes a record, and the
design question it must answer first is whether it is a third header or a `Blocked-on` whose event
is "a person decides X", since the latter costs no vocabulary and the escalation already exists.

## 84. `partial` does not catch the vacuous-fence class, and I said it did

**Reported 2026-08-30 by klientams-front-v2-01, correcting a claim made in this session.** ADR-014's
commit message and its memory entry both say the obligation following EVIDENCE rather than the
author's knowledge is what makes their class derivable. **That is wrong, and they measured it.**

**What the gate does get right, and it is more than I expected.** They reproduced their pre-audit
tree at `caf5bf66` and ran the current `adr-lint`: all seven tasks FAIL, with

    T1…: has passing acceptance evidence but no `mutant killed` entry — its log has 1 entry/entries,
    none of them is a `killed` mutant for acceptance-sha256:734e1940…

so a killed mutant not bound to the CURRENT fence digest earns no credit. They had assumed otherwise
before measuring.

**What it does not catch.** Today's T1 PASSES every current gate, carrying two killed mutants, one
digest-bound. The second is theirs, from the audit, and it **survived on first run**: T1's fence
passed with `ORDER_SELECT_RANK` permuted, because nothing compared the derived order against the
historical literal. Had they recorded only the first mutant, T1 would have satisfied the obligation
and shipped green — **while a mechanism its own headline claim rests on was unbound.**

**The reason is a quantifier, not a wording.** The obligation is EXISTENTIAL — at least one killed
mutant per fence. Vacuity is PER-MECHANISM. One killed mutant does not bind the others, and nothing
in a record enumerates what a fence's claim rests on, so nothing can count them. `partial` cannot
help: the evidence a vacuous fence lacks is a mutation nobody ran, and an absent measurement leaves
no trace to derive from.

**This project already documented the limitation and then forgot it.** `adr-verify`'s own header:
*"What this does NOT prove: that the mutant was WELL CHOSEN. Uniqueness makes a trivial irrelevant
line an available escape hatch, and only --why guards that, which is prose."*

**Two live instances in their corpus** — T1 and T7, each the assertion the task's headline claim
depended on. 4 of 9 fences could not fail at all before the audit.

**Not fixed, and it is the largest open gap in this corpus's evidence model.** The reporter declined
to propose a fix and sketched the shape: per-fence enumeration of the mechanisms a claim rests on —
the Mutants table the template once asked for, made TOOL-WRITTEN rather than hand-filled. Note what
that costs: the table was removed precisely because hand-filling it was the fabrication hole the
Verification Log closed. Re-introducing it as a tool-written artifact is a record's work, and it must
not re-open that hole.

## 85. Two adr-debt and adr-lint messages that are true and unactionable

**Reported 2026-08-30 by pirkiniukampelis-cms-laravel-3d and klientams-front-v2-01**, sorted by both
into "TRUE but I could not tell what to do next". Recorded because a gate people cannot act on is a
gate people switch off, which makes wording a defect here rather than a nicety.

**85a — a dependency cycle names no edge provenance.** `tasks: dependency cycle: T3 → T5 → T3` is
correct, and the edges were derived from a shared backticked token (`is_heavy`) appearing in several
`Produces:`/`Consumes:` lines. The message names neither the token nor which header line created each
edge, so the reporter diffed six task headers by hand to find it. `T3 → T5 via token \`is_heavy\` in
T5's Consumes` makes the fix obvious.

**85b — the deferred COUNT double-counts one debt.** `adr-debt` reports a deferred item at every
location its disposition text appears, so an item written in both a task file and its parent ADR is
counted twice or three times. In their corpus `9 deferred` was 4–5 distinct debts. Every ROW is true;
the NUMBER misleads, and a reader triaging it plans for twice the work that exists. Dedupe by target,
or label rows as citations of one debt.

**85c — an inferred-authority line reads as a finding.** `adr-state.mjs` says *"No record declares a
`Governs:` scope, so authority is inferred from what tasks touched."* Accurate, exits 0, and the
remedy it names is conditional on a judgement it does not help the reader make.

**What the same reporters named as the model to copy**, which is why 85 is worth fixing rather than
tolerating — `adr-lint`'s existing advice:

    every Verification Log entry passed, so nothing here shows the fence could fail — the first
    entry should be the TDD red run. If the work predated the record, say so in the task rather
    than leaving the log to imply a red-green cycle that did not happen

It names the observation, why it matters, the remedy, AND the legitimate alternative for the case
where the remedy does not apply. That last clause is what stops it nagging.

## 86. Desktop 1.40609.0 re-observed: tools arrive, server instructions do not

**Observed 2026-08-30** by running `qh_adr_debt` against this corpus from **Claude Desktop**,
version 1.40609.0 (read from `/Applications/Claude.app/Contents/Info.plist`).

**FILED FIRST AS "a second client", WHICH WAS WRONG, and the correction is the interesting part.**
The observing session initially reported itself as running in the web/mobile interface and warned
its "none" therefore said nothing about Desktop. It then retracted that unprompted, on evidence it
was better placed to weigh than I was: `qh-mcp` was registered, five tools resolved, and the call
reached a **local stdio server reading absolute paths under the operator's home directory** —
which a web session cannot do.
So this was Desktop's MCP plumbing throughout, and I had accepted the weaker framing without
checking the one fact that settles it.

**The version makes this a RE-OBSERVATION, not a new data point.** ADR-012 already records the
measurement on 1.40609.0, and this is the same build, so it extends the finding forward by nothing.
Had the build been newer it would have been worth a dated Verification Log entry.

**What worked, and it is the useful half.** The tool was called through a real MCP client with no
shell and returned the corpus correctly:

    [DEBT] 50 deferred · 3 open follow-ups · 0 broken pointers · 0 unreceipted · 0 into an archive · 1 waiting

The client also rendered the `waiting` bucket added today (ADR-014 T3) including its
honest-uncertainty line — it reported the one waiting item, what it waits for, and that *"the
duration is reported as unknown: that task's Verification Log carries no dated entry, so nothing has
looked at it."* An independent surface reading that correctly is end-to-end confirmation the wording
survives a client, which nothing in this repository could have shown.

**What was absent.** No server-level instruction block reached the model — only the tool names, their
descriptions and schemas. `server.WithInstructions` text IS sent: confirmed here over stdio, where
`initialize` returns it beginning *"These tools run the quality-harness gates over an ADR corpus you
name by path. They only read."*

**THE EPISTEMIC POINT, which is why this is worth a section rather than a line.** The reporting model
raised it against its own observation, unprompted:

> I can't distinguish "the server sent no instructions" from "the client received them and didn't
> surface them to the model" from "they were surfaced somewhere I'd not recognize as separate from
> tool text." All three look identical from inside.

So a model's report of absence is **weakly diagnostic about the wire and strongly diagnostic about
nothing else.** The stdio measurement is the stronger evidence of what the SERVER sends; a model can
only report what the CLIENT chose to render. That asymmetry is the same shape as T4's core claim —
the only witness to a client behaviour is someone standing at the client — and it means "the model
did not see it" must never be recorded as "the server did not send it".

**THE SHARPER VERSION OF THE SAME POINT**, which the observing session supplied after its
retraction and which is better than what I had written: having the TOOLS and receiving the server's
INSTRUCTIONS are two separate channels. Tools arrive as a listing the client renders into context;
`server.WithInstructions` arrives at initialization and the client decides independently whether to
pass it on. Working tools are therefore evidence the TRANSPORT is fine — which makes "the server
sent nothing" much LESS likely and "the client received it and dropped it" much MORE likely. That
is a stronger inference than "cannot distinguish three cases", and it points the same way ADR-012
already points.

**So the record needs no update. The measurement stands, confirmed on its own build.**

## 87. Nine adr-retire-check findings still assert nothing

Measured, not estimated:

    node scripts/unasserted.mjs plugin/bin/adr-retire-check     # 11 of 33

**The 9 was wrong and a Codex review caught why.** The instrument counted raw parentheses
to find a statement's extent, so a message containing one — `obligation(s)`, a quoted
`(pattern …)`, an f-string holding `{len(have)}` — took the extent wrong, the neutered file
did not parse, every suite went red, and the site read as `killed`. It overstated coverage in
the one direction that flatters it. Extents now come from Python's own `ast`, sliced in BYTES
because `col_offset` is a byte offset and these messages are full of `—` and `·`.

Down from 17 of 33. The nine are the catalog-path twins of the `--adopt` rules just
covered (sites 5, 13, 16, 17, 18 repeat sentences that now fire in adoption mode only),
plus four with no coverage on either path: an accepted archived record with no exact
active-catalog receipt; a record whose obligations are undetected and whose catalog must
therefore say so; and a `Replaces:` naming a replacement that does not exist or is not
discoverable.

**The duplication is the more interesting half.** The same sentences exist twice because
`adoption_report` re-implements the structural rules the catalog path already has. One
shared implementation would make both paths testable at once and is the real fix; asserting
each copy separately doubles the tests to keep a duplication nobody wants.

**Not fixed here.** Deduplicating a gate's rules is a change to what it reports, and it
wants its own evidence rather than being folded into a hardening pass.

## 88. CLOSED 2026-09-01 — bare `python3` is a decoy on stock Windows, and 18 sites still spawn it

Found 2026-08-30 by a peer Claude session on a real Windows 11 box (build 26200.9168) that
this repository has never been able to reach. Stock Windows ships `python3` as an App
Execution Alias under the user's local AppData: a real, spawnable executable that is not
Python. It writes `Python was not found; run without arguments to install from the Microsoft
Store` to **stdout**, leaves stderr empty, and exits 9009.

`spawnGate` in `plugin/scripts/lifecycle.mjs` fell back to `python` only when `run.error` was
set. The alias sets no `error` — it spawns. So the fallback never fired, every gate returned
9009, and `readyTaskLines`' `continue` turned that into the silently empty session
orientation that the comment above the function says was fixed on 2026-08-25. The same
defect, reached by a different mechanism.

**Fixed here** by `resolvePython(platform, candidates, run)`, which probes `py -3`, then
`python`, then `python3` with `-c "import sys;print(sys.version_info[0])"` and requires the
expected stdout. Nothing keys on 9009 — that is cmd.exe's own "command not found" code, so it
cannot separate "the interpreter never ran" from "the gate ran and returned 9009". Presence is
never the evidence; the same reason `resolve_bash()` refuses the System32 WSL stub and the
WindowsApps launcher rather than trusting `where bash`.

**Why nothing caught it.** `tests/lifecycle.test.mjs` already exercised the win32 branch — on
boxes where `python3` is genuine, so the branch was reachable but the decoy was not. CI cannot
close the gap either: `actions/setup-python` puts a real `python3` on the Windows job's PATH,
so the alias is structurally unreachable there. The new test stands the alias up as a node
script behind the injected `candidates`/`run` seam, which is what makes the case reachable
from macOS at all.

**The class, enumerated** with `git grep -nE "spawn(Sync)?\(\s*['\"]python"` — 19 sites:

| where | count | state |
|---|---|---|
| `plugin/scripts/lifecycle.mjs` | 1 | fixed here |
| `scripts/unasserted.mjs:70,87` | 2 | **open** — bare `python3`, no fallback at all |
| `tests/` (8 files) | 16 | **open** — bare `python3` |

**Two siblings left, both new tasks.**

**CLOSED 2026-09-01.** Both siblings are done, and the class re-enumerated with §88's own command
rather than from this entry's counts — which had drifted, as they do: 17 sites across 6 files, not
the 18 across 9 recorded below (files have come and gone since).

    git grep -nE "spawn(Sync)?\(\s*['\"]python"     ->  17 before, 0 after

`scripts/python-interpreter.mjs` resolves the interpreter once per process and IMPORTS
`resolvePython` from `plugin/scripts/lifecycle.mjs` rather than repeating it — there is one rule
about which interpreter is real and it lives in the plugin. Every call site became `runPython(args,
options)`, a drop-in for the `spawnSync('python3', args, options)` they all shared.

**The helper refuses rather than falling back, and that is the whole of it.** On win32 with nothing
answering the probe it THROWS. Returning a plausible `['python3']` would reproduce the Store-alias
defect inside the helper written to avoid it: the spawn succeeds, prints "Python was not found" to
stdout, exits 9009, and the suite reports a gate that FAILED rather than a gate that never RAN.
`tests/python-interpreter.test.mjs` asserts that, and was shown capable of failing — replacing the
throw with `return ['python3']` reddens two tests, restoring it greens them.

The win32 branch is reachable from macOS through `pythonArgv(platform, resolve)`, for the reason
§88 already gave: CI cannot close this gap, because `actions/setup-python` puts a real `python3` on
the Windows job's PATH and the alias is structurally unreachable there.

Gate: `bash scripts/selftest.sh` exit 0, 479 pass, 0 fail.

### As reported


*The 16 in `tests/`* are why `bash scripts/selftest.sh` cannot run on that Windows box as-is,
which is the next thing anyone will try. They are not a product defect — CI's Windows job has
a real `python3` — but they make the suite unrunnable on a stock developer machine, which is
the one place the five platform defect classes in CLAUDE.md §7 are actually reachable before a
push. A shared test helper that resolves the interpreter once is the fix.

*The 2 in `scripts/unasserted.mjs`* stay at the repository root and never ship, so a user
cannot hit them; a Windows contributor can.

**Not verified on Windows.** The fix is verified through the injected seam on macOS and by
restoring the `run.error` condition and watching the test fail. No line of it has executed on
Windows, and CI will not change that for the reason above.

**The mechanism, measured 2026-08-30 and visible without running either alias.** Every Python
app-execution alias on that box carries the timestamp `21:47:39` that day — `py.exe`,
`python.exe`, `python3.exe`, `pythonw.exe`, `pymanager.exe` and two more, all 0 bytes, all
rewritten by a Python install that happened mid-investigation. `bash.exe` in the same directory
is 0 bytes and dated `2026-08-20`: untouched, still pointing at an application nobody installed.

That difference is the entire distinction between an alias that runs and an alias that does
not, **and no filesystem predicate available to the resolver can see it.** Both are 0 bytes,
both satisfy `isfile()`, both carry exactly the right name. This is not an argument for reading
timestamps — it is the argument against every cheap predicate, timestamps included, and for
asking the candidate a question only the real tool answers.

**The alias is not reliably dead, and that strengthens the fix rather than weakening it.**
Measured later the same day on the same box: `python3 --version` returned `Python 3.14.7` and
exit 0, where hours earlier it had returned "Python was not found" and 9009. A WindowsApps
App Execution Alias is a 0-byte reparse point that may or may not have an installed target, and
whether it does can change under you. So `python3` on Windows is not "a decoy" — it is an
**unknown**, which is precisely the thing a name check and an `isfile()` check both answer
confidently and wrongly. `resolvePython` asks the only question that survives this: did the
thing answer as Python?

## 89. PARTLY CLOSED 2026-08-30 — `.gitattributes` pinned `*.mjs` but not `*.js`, and six more extensions go CRLF

Found 2026-08-30 by a peer Claude session on Windows 11 with `core.autocrlf=true`, reading a
real Windows checkout this repository cannot produce. Confirmed against this tree: our
`.gitattributes` is byte-identical to the one it measured, so the finding applies here.

The file is seven lines and has **no `* text=auto` catch-all**, so every extension not named
is left to `core.autocrlf` and lands CRLF on a Windows checkout. `git check-attr text eol`
reports `unspecified` for all of these, and all of them were CRLF on disk there:

| unpinned | files |
|---|---|
| `*.js` | `plugin/workflows/{consensus,quality-cycle,review-ring}.js` |
| `*.py` | `scripts/neuter.py`, `tests/gate-regressions.py`, `tests/fixtures/ok/test_selftest_fixture.py` |
| `*.json` | `tests/mutations.json`, `plugin/hooks/hooks.json`, both `plugin.json`/`marketplace.json` |
| `*.yml` / `*.yaml` | `.github/workflows/selftest.yml`, the eval case template |
| `*.txt`, no-ext | `tests/fixtures/ok/adr-archive/ADR-001-attachment.txt`, `LICENSE` |

**`*.mjs` is pinned and `*.js` is not.** Same repository, same kind of code, opposite checkout
behaviour on Windows. That reads as an oversight rather than a decision.

**`*.py` is unpinned** and only survives because `plugin/bin/*` catches the gates by path. Any
Python that moves out of `plugin/bin`, or any new `.py` gate, silently becomes CRLF there —
and §1 already records that a file move breaks four things silently.

**Correction, 2026-08-30, same day:** this entry first claimed `tests/mutations.json` being
CRLF put the campaign at risk because it holds multi-line `from:` strings. That is wrong, and
it was wrong in the direction that flatters the finding. A `\n` inside a JSON string is the
two-character escape `\` `n`, not a newline byte, so the file's own line endings never reach
the parsed value — verified by parsing a deliberately CRLF JSON file and getting `"a\nb"` back
intact. What §7's second row actually describes is the **target** file being CRLF, and all 23
files carrying a cross-line mutation are pinned today. `tests/package.test.mjs:592` already
asserts exactly that, asked of `git check-attr` rather than of the file, and it fires on any
new cross-line mutation aimed at an unpinned target. The acute risk was already guarded.

**Two fixture files are CRLF**: `test_selftest_fixture.py` and `ADR-001-attachment.txt` — the
"content matched across a line boundary" shape §7 describes.

**Partly fixed.** `*.js` and `*.py` are now pinned `text eol=lf`, closing the parity gap that
is the real hazard here: a contributor who sees `*.mjs` pinned will reasonably assume JS is,
and `plugin/workflows/*.js` ships. `*.py` matters for the same reason §1 gives about file
moves — the gates are Python and survive only because `plugin/bin/*` catches them by path, so
any Python that moves out of that directory silently becomes CRLF.

`git add --renormalize` was deliberately NOT run. Adding an attribute changes what git does on
the next checkout; renormalizing rewrites every affected file in the index, which is a large,
visible change that deserves its own commit and its own reason.

Still unpinned and left so on purpose: `*.json`, `*.yml`, `*.yaml`, `*.txt` and `LICENSE`.
Nothing matches their content across a line boundary, `LICENSE` is the fixture
`package.test.mjs:600` uses to prove its own check can fire, and pinning a file merely because
it could one day matter is the speculative complexity YAGNI rejects. The `.cmd` files being
CRLF is correct and deliberate (`*.cmd text eol=crlf` sits last and last-match wins); do not
"fix" those.

Verified clean by the same probe, so the sweep is not vacuous: every extensionless gate in
`plugin/bin/` is 0 CR bytes, all of `plugin/scripts/`, `.gitignore` and `.gitattributes` are
pinned `eol: lf` and clean on disk.

## 90. CLOSED 2026-09-01 — `Path.is_absolute()` was False for a rooted path on Windows, and three sites joined it to cwd

Found 2026-08-30 by the same peer session, from `Y:\Projects\zeus` — a non-`C:` drive this
project has never been able to test on.

`PureWindowsPath("/etc/passwd").is_absolute()` is **False**: a POSIX-rooted path is
drive-relative on Windows, not absolute. Three sites treat that as "relative" and join it to
the working directory:

    plugin/bin/adr-lint:474    if not spec_file.is_absolute():
    plugin/bin/adr-verify:688  target = (cwd / rel) if not Path(rel).is_absolute() else Path(rel)
    plugin/bin/adr-verify:923  path = (cwd / target) if not Path(target).is_absolute() else Path(target)

Measured there with cwd = `Y:\Projects\zeus`: `/etc/passwd` → `Y:\etc\passwd`, and
`\Windows\System32\drivers\etc\hosts` → `Y:\Windows\System32\drivers\etc\hosts`. So a rooted
pointer is silently re-rooted onto whichever drive the run happens to be on. **The same input
behaves differently by drive letter** — on `C:` it lands on real system paths, on `Y:` on paths
that mostly do not exist, so the defect is invisible on each box for the opposite reason.

This is §7 item 2 inverted. The release correctly stopped checking for a leading slash and
moved to `Path.is_absolute()`, which is the right primitive on Windows — and inherited the
mirror-image blind spot.

**Do not "fix" this with `os.path.isabs`, and the reason is sharper than it first looked.**
The peer proposed it on the grounds that the two primitives disagree. Measured here on Python
3.14.7, `ntpath.isabs("/etc/passwd")` is **False** — it agrees with `pathlib`, so on 3.14 the
swap changes nothing. The peer then re-measured on the two interpreters its machine actually
has, and the disagreement is real on the older one:

| interpreter | `os.path.isabs('/etc/passwd')` | `Path('/etc/passwd').is_absolute()` |
|---|---|---|
| 3.14.3 | False | False |
| 3.10.11 | **True** | False |

`ntpath.isabs` changed in 3.13 to stop calling a rooted, driveless path absolute. So
`os.path.isabs` is not "no change" — it is **version-dependent**, which is worse than either
answer, and a box with both Pythons installed can select either one.

The fix has to test the property directly — a leading separator (either spelling) **or** a
drive prefix. That is §7's own "reject a drive prefix as well as a leading slash" rule in the
mirror direction, and its real merit is that it does not ask the interpreter what it thinks
"absolute" means.

**`leaves_the_tree` is not affected** and the probe proves it rather than assuming it: it
returned True for `..\dir\file`, `Y:\…`, `Y:/…`, `C:\…`, `/etc/passwd` and
`..\..\..\Windows\System32`, and False for both in-tree relative forms — so it is discriminating,
not returning True for everything. adr-lint's enforcement path is protected by it;
`adr-verify:688/923` are the sites to look at, and whether their inputs are pre-filtered is not
yet traced.

**CLOSED 2026-09-01, and the heading was stale in the §103 direction — it read as a live defect
against code that already carried the fix.** Verified by executing the tree, not by reading this
entry:

```bash
git grep -n "looks_absolute" -- plugin/bin
```

`looks_absolute(pointer)` exists in BOTH gates (`plugin/bin/adr-lint:120`,
`plugin/bin/adr-verify:260`) and tests the property directly — a drive prefix, or a leading
separator in either spelling — exactly as this entry asked, with the 3.10-vs-3.14 `ntpath.isabs`
divergence written into its docstring so nobody re-proposes the swap. All three sites this entry
named now call it: the spec-file join at `adr-lint:985`, and `adr-verify:1154` and `:1434`.
`tests/gates.test.mjs` drives it.

Two `is_absolute()` calls remain in `adr-verify` and NEITHER is this defect, checked rather than
assumed. `:706` joins a driveless rooted path to the declared root and then requires
`relative_to(root)`, so a re-rooted path is refused by the containment guard rather than acted on;
`:857` REQUIRES a recorded journal path to be absolute, so a driveless rooted path is rejected
there, which is the conservative direction.

**Also recorded, because the margin is invisible:** every containment check in `plugin/bin`
uses `Path` semantics (`parent in child.parents`, `relative_to`), never `startswith(str(...))`
— `git grep 'startswith(str('` in `plugin/bin` returns nothing. On Windows those compare
case-insensitively and the mixed-case cases all passed. Anyone who "simplifies" one to a string
comparison reintroduces a case bug on a machine where nothing fails.

## 91. PARTLY CLOSED 2026-08-30 — `resolve_bash()` returned the WindowsApps Store alias; the name-based check that allowed it stays

Found 2026-08-30 by a peer Claude session on Windows 11. **Reproduced here from macOS** through
the resolver's own injectable seam, so this needs no Windows box to confirm or to regress:

    PATH = C:\Windows\System32;C:\Users\alice\AppData\Local\Microsoft\WindowsApps
    all three bash.exe present, including C:\Program Files\Git\bin\bash.exe
    resolve_bash('win32', env, exists) -> C:\Users\alice\AppData\Local\Microsoft\WindowsApps\bash.exe

`plugin/bin/adr-verify:218`. Its docstring says, correctly: *"Windows ships
`C:\Windows\System32\bash.exe`, a launcher that drops into the default WSL distro, **and the
Store adds another stub under WindowsApps**."* The PATH loop then skips only
`/[\\/]system32[\\/]?$/i`. **The code never acts on the second half of its own sentence.** The
Store stub is a 0-byte app-execution alias and `os.path.isfile()` returns True for it, so the
loop returns it and the `ProgramFiles\Git` fallback below — which would have found the real
Git Bash — is never reached.

On the measured box the registry PATH (what a normal cmd/PowerShell sees) carries **no**
bash-bearing directory except WindowsApps, so this is the answer a real Windows user gets. It
resolved correctly under Claude Code's own shell only because that shell prepends Git's
`usr\bin`.

**The instruction file is wrong, and that is the worse half.** CLAUDE.md §7 states: *"Git Bash
resolution must exclude the System32 WSL stub and the WindowsApps launcher — both are named
`bash` and neither is one. `resolve_bash()` does this; do not reimplement it."* It does not do
this. A record claiming more than happened is the defect this project exists to demonstrate the
absence of, and it has been instructing every session not to re-check.

**The class has two members** — `git grep -n "system32" plugin/` :

| site | filters System32 | filters WindowsApps |
|---|---|---|
| `plugin/bin/adr-verify:243` (`resolve_bash`) | yes | **no** |
| `plugin/scripts/run-shell-hook.mjs:98` (`resolveBashExecutable`) | yes | **no** |

The docstring calls these "same precedence", and they are — including the hole. Fix both or
neither.

**Fixed** by filtering WindowsApps exactly as System32 is filtered, at both sites, with the
reproduction above as its regression test.

**That fixes the case and not the class, and the distinction is the peer's.** The check is
unsound not because WindowsApps went unfiltered, but because `os.path.isfile()` on a 0-byte
app-execution alias says **nothing about whether the target application exists**. Measured on
the same box, same day: the WindowsApps `python3.exe` alias resolves and runs — `python3
--version` → `Python 3.14.7`, exit 0 — while the WindowsApps `bash.exe` alias points at an app
that is not installed. Both are 0-byte reparse points and `isfile()` is True for both. So a
directory filter is a name-based answer to a question only a probe settles, and any other alias
directory has the same property. Filtering is correct here because a WindowsApps `bash.exe` is
never Git Bash whatever it points at — but the general rule is the one §88 landed on: probe.

Note also the resolver has no canonical answer: the PATH scan returns `Git\usr\bin\bash.exe`
and the fallback returns `Git\bin\bash.exe`. Nothing downstream depends on which — traced
before the fix: `adr-verify:359` and `run-shell-hook.mjs:211` need a working shell and no more.

## 92. CLOSED 2026-09-01 — every `.cmd` forwarder runs a failing gate twice, under two different interpreters

**Closed by verifying the tree, not by new work.** The goto form this entry describes as "shipped in
cb227f5" is in fact what all eleven forwarders and the generator carry today, and the headline
"Not fixed here" outlived it. Enumerated rather than sampled:

    git grep -l '&& ('  -- 'plugin/bin/*.cmd'              -> none
    every plugin/bin/*.cmd contains `goto :usepy`           -> 11 of 11
    plugin/scripts/standalone-link.mjs:348                  -> the same form

It is also bound: `tests/standalone-link.test.mjs::a cmd forwarder runs one interpreter and returns
its exit code` reads all eleven SHIPPED files and the GENERATED one, asserts neither the `&&`
chain nor the `||` fallback survives, asserts no line expanding `%*` sits inside a parenthesised
block, and compares the shipped selection against the generator's so the two cannot drift.

Sixth record found stale in one direction this day — see §103. The entry below is kept in full
because its measurement table (four forwarder forms against exit codes, including the 9009 the goto
form correctly propagates) is the reasoning behind the shipped shape and is not recorded anywhere
else.

### As reported


Found 2026-08-30 by the same peer, with verbatim doubled output from a real run.

All eleven forwarders in `plugin/bin/*.cmd`, and the generator at
`plugin/scripts/standalone-link.mjs:181` that writes new ones, end in:

    where /q py && (py -3 "%~dp0<gate>" %*) || (python "%~dp0<gate>" %*)

`A && B || C` in cmd is **not** if/else. `||` fires on **B's** nonzero exit, not only on
`where /q py` failing. So any gate that returns nonzero — which is every gate that finds
something — runs a second time under `python`, and **the exit code the caller sees is
`python`'s, not `py -3`'s.**

Measured: `adr-lint.cmd <an ADR>` printed its entire FAIL block twice, exit 1. Reproduced with
`--help` (`unknown option: --help` twice) and with a directory argument.

Consequences: every gate failure does double work and double output; and on a box with no
`python` on PATH the `||` branch replaces the gate's real verdict with cmd's
`'python' is not recognized`. A fence would still be non-zero, so nothing goes falsely green —
but the diagnostic is destroyed, which §3 already names as the thing a gate must never do.

**Corrected, then corrected back — and the round trip is the finding.** The reporting session
first said a missing `python` surfaces as 9009 at the forwarder boundary. It then retracted
that, measuring `cmd /d /c <forwarder>` → exit 1, and this entry was edited to match. It has
now measured all four forms back to back with one harness and one target, with neither `py` nor
`python` on PATH:

| form | exit |
|---|---|
| the shipped `&&`/`||` | 1 |
| the `if errorlevel 1 (…) else (…)` repair | 1 |
| **the `goto` form, shipped in cb227f5** | **9009** |
| the generated forwarder | **9009** |

The retraction was true of the OLD code and was over-generalised into a claim about batch files.
It is not a property of cmd; it was a property of the **parenthesised block**. In the old form
the unresolvable `python` sat inside one and the batch reported 1. In the goto form it is a bare
line and the bare `exit /b` faithfully preserves its 9009 — which is exactly the property
`exit /b` was chosen for, doing exactly what it says.

So the boundary now returns 9009, and it does so because of this project's own change. That is
arguably better — 9009 is distinguishable from a gate verdict, where 1 collides with every gate
that exits 1 — but it is a behaviour change that must be stated rather than silently
reintroduced, and it re-opens the collision with §88's alias exit code that this entry had
declared closed.

**A note deleted on a peer's retraction had to be restored on the peer's re-measurement.** Worth
recording as a process fact: a correction is evidence like any other, and a correction to a
correction is not noise. Neither edit was wrong given what was known; the record carries all
three states because the last one is only trustworthy alongside the path to it.

**Verified on Windows, with the boundary stated.** The peer executed a hand-written copy of the
replacement form against an installed gate: failing gate → one FAIL block and an exit matching
a direct `py -3` run (was two blocks); passing gate → exit 0; `--help` → printed once (was
twice); and with `py` hidden, the `python` branch reached and propagating on both a passing and
a failing target. **Now verified on this repository's own files**, after the reporting session's user authorized a
clone of `main` at 418f6f0 (v2.41.0). All 11 `plugin/bin/*.cmd` carry the goto form, and both
the static `adr-lint.cmd` and `forwarderCmd`'s real generated output were executed:

| case | static | generated |
|---|---|---|
| failing gate | 1 FAIL block, exit 1 (was 2 blocks) | 1 block, exit 1 |
| passing gate | exit 0 | exit 0 |
| `--help` | printed once, exit 1 (was twice) | once, exit 1 |
| `py` absent, `python` present | PASS 0 / FAIL 1 | PASS 0 / FAIL 1 |
| unquoted arg containing `)` | exit 0 (was 255, gate never ran) | exit 0 |

`setlocal` does not eat the exit code, `exit /b` propagates through it, and the
`for /f … do set` resolver does not interact badly with the goto.

**Still not executed:** the other ten gates behaviourally (control flow was checked across all
11), the mutation campaign on Windows, and anything on a box without Git for Windows. The `)`
case used a scratch directory named `paren(dir)`; `C:\Program Files (x86)` itself was not used,
so it remains the argument for why the input is realistic rather than an observation of it.

**And the obvious repair was wrong too, which is why the form is a `goto`.** `if errorlevel 1
(…) else (…)` fixes the double run and breaks on an unquoted argument containing `)`, because
that closes the block early. Measured: `was unexpected at this time`, exit 255, gate never run.
`C:\Program Files (x86)\…` is that argument, and the `ProgramFiles(x86)` root is already in
`resolve_bash`'s own fallback list — so this is a path the tool knows about, not a contrived
one. The shipped `&&`/`||` form had the same hazard, so it is not a regression; it is a defect
not worth re-introducing while rewriting the line anyway. `where /q py && goto :usepy` with a
bare `exit /b` (which preserves the preceding command's status) has neither problem.

This is the same root as §88 from the other direction: `where /q py` succeeding is treated as
evidence about a later command's exit code. The current form cannot distinguish "py is missing"
from "the gate failed".

**Not fixed here.** The correct shape must run exactly one interpreter and propagate exactly
its exit code, e.g. `where /q py && ( py -3 "%~dp0<gate>" %* & exit /b ) & python "%~dp0<gate>" %*`
— but a cmd fence is precisely the thing this project must not change without executing it on
Windows, and none of it has run there. This one needs a real Windows verification, not a seam.

## 93. Nothing records which Python answered, and the answer changes the verdict

Raised 2026-08-30 by a peer session, from the §90 correction rather than from a failure — the
generalisable half of it, and it outlives that finding.

The measured box has two interpreters four years and one semantic change apart, both reachable
through `py --list`: 3.14-64 and 3.10-64. §90's table shows the same guard returning different
answers on each. The gates ship as `#!/usr/bin/env python3`, so the interpreter is whatever the
environment hands them, and **nothing in this repository pins, probes, or records which one
answered.**

That is the same shape as §88, stated generally: the check ran, it returned something, and the
something depended on an environment fact nobody asserted. §88 was the case where the
environment supplied something that was not Python at all; this is the case where it supplies a
real Python whose semantics differ.

`resolvePython` (added for §88) is already the place this would live: it probes with
`-c "import sys;print(sys.version_info[0])"` and discards everything but the major version. If
it took `version_info[:2]` and a gate's evidence recorded it, a 3.10-vs-3.14 divergence would
show up in the Verification Log instead of silently changing a verdict.

**Not built here, deliberately.** Widening the probe is two lines; the value is entirely in the
consumer that records it, and there is no consumer yet. Building the plumbing first would be
speculative. The task is: decide where an interpreter identity belongs in tool-written evidence
(§4), then widen the probe to feed it.

## 94. CLOSED 2026-09-01 — a missing `node` is reported as a missing plugin, and the advice does not help

**Fixed, and in BOTH forwarders — the entry named one and the class had two.** `forwarderScript`
has the identical hole for the identical reason: `node -e ... 2>/dev/null` discards node's own
error, so an absent node yields an empty `root` and the sh forwarder printed the same
"no installed plugin" message the cmd one did.

Both now probe for node BEFORE running the resolver, and report it as its own state:

    node is not on PATH, so the plugin resolver did NOT run.
    this is not a pass, and it is not a finding about the plugin.
    install Node.js, then re-run. The plugin may be perfectly fine.

**Exit 5, not 4, and that is the substance rather than a detail.** Both mean the gate did not run
and both stop an `&&` fence. They have DIFFERENT REMEDIES, and collapsing them is exactly what sent
a user to reinstall a plugin that was already installed twice over in the cache. 4 keeps its
ADR-005 meaning — the resolver looked and found no plugin; 5 is the resolver could not look at all.

The cmd probe is a `goto`, not a parenthesised block, for the reason §92 paid for: an unquoted
argument containing `)` closes a block early, and `C:\Program Files (x86)\…` is that argument.

Bound by `tests/standalone-link.test.mjs::a forwarder that cannot run its resolver says so, and
blames neither the plugin`, which asserts the probe precedes the resolver, that the remedy named is
one that can work, that the two exit codes stay distinct, and that "this is not a pass" survives in
both branches. Shown capable of failing: deleting the cmd probe reddens it, and collapsing the sh
exit code back to 4 reddens it.

### As reported


Found 2026-08-30 on Windows 11 while verifying §92, by accident: the peer's first `py`-absent
harness also stripped `node` from PATH, which is why two cases came back exit 4 instead of
exercising the interpreter branch at all.

`forwarderCmd` (`plugin/scripts/standalone-link.mjs`) resolves the newest installed plugin by
shelling out to `node -e` inside a `for /f … do set`. With node off PATH and the plugin **fully
installed**:

    'node' is not recognized as an internal or external command,
    quality-harness: no installed plugin under …\cache\quality-harness\quality-harness, so this gate did NOT run.
    quality-harness: this is not a pass - an absent checker certifies nothing.
    quality-harness: install or update the plugin, then re-run.
    exit 4

Both 2.40.0 and 2.41.0 were sitting in that exact directory. `for /f` swallows the failed
command's output, `QH_ROOT` stays empty, and the fence cannot distinguish **"the resolver could
not run"** from **"the resolver found nothing"** — so it names the one remedy that cannot work.
The user reinstalls the plugin, nothing changes, and the message goes on blaming the plugin.

**The fence itself is correct and this is not a false pass.** Exit 4 is non-zero, the run does
not go green, and "an absent checker certifies nothing" is the right posture — §3's rule is
being honoured. What fails is the diagnosis.

**It is the same shape as §92, eleven lines above it in the same file**: a control-flow
construct that cannot tell two causes apart and confidently reports the wrong one. §92 was
`where /q py` succeeding being read as evidence about a later command's exit code; this is a
failed subprocess being read as an empty result. That both survived in one generator is the
argument for looking at the whole file rather than the line.

**This is the DEFAULT state of a stock Windows box, not an edge case, and that was measured
after the entry was first written.** The finding was reached by stripping `node` from PATH
deliberately — but the reporting session then checked when node arrived on that machine:

    C:\Program Files\nodejs              directory created  2026-08-30 21:49
    C:\Program Files\nodejs\node.exe     file created       2026-08-26 09:28

The MSI preserves the build's file timestamps, so the binary looks four days old inside a
directory that is minutes old — and reading the binary's own date first would have said "node
predates this investigation". A second query found the real answer. Before 21:49 that day there
was no node on the box at all: not under Program Files, not nvm, not scoop, and nothing but an
empty npm prefix under the roaming profile. So for the entire first half of this investigation
the machine was in exactly this state — plugin correctly installed, gate present and working,
forwarder reporting "no installed plugin … install or update the plugin", exit 4.

Anyone on a stock Windows box without node gets that message, and the one remedy it names
cannot help. Raise the severity accordingly: this is what the tool says to a normal user, not
what it says under a contrived PATH.

**Not fixed here.** It wants its own entry and its own fix — probe for `node` before the `for /f`
and say which of the two happened, rather than folding a second cause into §92's commit. And
like §92 it is a cmd fence, so it cannot be verified from macOS: the fix and a Windows run
belong together.

**Third name on the list.** §88 established `python3` cannot be trusted by name, §91 the same
for `bash`. `node` is the third executable a Windows user needs resolvable for the gates to work
at all, and it is the only one whose absence is currently reported as something else.
---

## 95. PARTLY CLOSED 2026-09-01 — an orphan under the home directory is a different mechanism from a drifted copy, and neither scanner has one

**The scanning half is CLOSED, and the entry's premise for it was superseded before the entry was
worked.** This entry argues `SHADOW_SCOPE` cannot absorb `tests/` because every entry pairs a home
directory with a `shipped` one and `tests/` never ships. True, and no longer the mechanism:
`scanSet()` is DERIVED from the union of every cached release's top-level directories plus the
`SHADOW_SCOPE` home names, precisely so that a directory the current tree no longer has is still
scanned. Measured here 2026-09-01:

    SHADOW_SCOPE home names : bin, hooks, skills, templates, workflows
    scanSet() derived       : bin, docs, evals, hooks, scripts, skills, templates, tests, workflows

`tests` is in the second and not the first — the gap `scanSet`'s own docstring names.

**Verified end to end on the reported file, not inferred.** A fabricated home holding
`.claude/tests/selftest.sh` with fork-era content, scanned through `orphans(homeDirectory)`:

    {"directory":"tests","name":"selftest.sh","state":"unidentified",
     "evidence":{"state":"unidentified","route":null,"version":null,"first":null,"shared":null}}

So the file is seen, and it is reported as `unidentified` with no route — exactly what ADR-019
requires of a check that could not determine something, and never as ours. The "neither scanner has
one" half of the headline is answered.

**What is left is a DECISION, and ADR-019 has already taken it the other way.** ADR-019 is Accepted
and says: *"naming it is all that ever happens"*, `--apply` deletes nothing and archives nothing, no
code path removes a home file, and the user decides. This entry asks for an orphan to be identified
well enough to advise DELETION, which inverts that posture. The entry says so itself — *"This wants
a record before code"* — and it is right: it is a trust boundary and costly-to-reverse advice, and
copy mode does not archive, so a wrong deletion is unrecoverable.

That decision is the owner's and is not backlog work. It would supersede or amend ADR-019's
never-act clause rather than sit beside it.

**Still true and still unanswered by any of the above:** the reporter's 14 failing presence checks
are the real user-facing harm, and they are not fixed by scanning or by identification — the orphan
prints `FAIL — 14 of 39 checks failed` for artifacts this plugin's own guidance told them to delete.
Nothing this project ships can silence somebody else's script. Only advising its removal would, which
is the decision above.

### As reported


Reported 2026-09-01 on GitHub issue #1, as a follow-up to the scope-sharing fix in `bbd3f87`.
That commit made `shadowInstallNotice` and `sync-standalone.mjs` read one `SHADOW_SCOPE`, which
closed the `hooks/` gap the issue was filed about. The follow-up names a second file the shared
scope still cannot see, and it is not a longer list — it is a state neither tool has.

`~/.claude/tests/selftest.sh`, 113 lines, on the reporter's Windows box. It corresponds to no
current upstream file: `scripts/selftest.sh` here today is a different, repository-scoped
70-line script. The orphan asserts the fork-era layout directly —

```sh
for t in adr-template task-template ... ; do have "templates/$t.md" "$DEST/templates/$t.md"; done
for s in work spec-write adr-write ... ; do have "skills/$s/SKILL.md" "$DEST/skills/$s/SKILL.md"; done
have "hooks/facts-gate-dispatch.sh"  "$DEST/hooks/facts-gate-dispatch.sh" -x
```

— so after the reporter followed this plugin's own session-start guidance, which says a
bare-name skill *"is better deleted than synced"*, it printed `FAIL — 14 of 39 checks failed. Fix
these before authoring anything.` All fourteen are presence checks for artifacts the guidance had
just told them to delete. Every functional check still passed, so it is asserting a LAYOUT rather
than detecting breakage — but its summary line reads as a broken install and the obvious repair is
to restore exactly what the guidance said to remove.

**Why `SHADOW_SCOPE` cannot absorb it.** Every entry pairs a home directory with a `shipped` one,
and per §1 of CLAUDE.md `tests/` stays at the repository root and never ships. `{ home: 'tests',
shipped: 'tests' }` makes `readdirSync(path.join(source, 'tests'))` throw, `catch { continue }`
swallows it, and the entry is a green no-op — the same failure the `hooks`→`scripts` pairing was
shaped to avoid, recurring one field over. An orphan has no `shipped` counterpart by definition.

**Why digest lineage cannot identify it either.** `knownDigests(relative)` recognises a file as
ours when it matches any cached release's copy at the same relative path. Measured here
2026-09-01 across 52 cached versions back to 2.0.0:

    ls -d ~/.claude/plugins/cache/.../*/tests        -> 10+ versions have a tests/ directory
    ls    ~/.claude/plugins/cache/.../*/tests/selftest.sh -> no matches, in any version

Old releases shipped `tests/` (fixtures, gate-regressions.py, five `.test.mjs`) and never a
`selftest.sh`. So for the exact file this report is about the known-digest set is EMPTY, and the
lineage machinery that carries `replaceable()` cannot answer. Identification would need a content
signature.

**Three states, and only the middle one is new.** `replaceable()` already distinguishes
ours-and-still-shipped (drift → refresh) from not-ours (`'not a file this plugin installed — it
may be your own'` → leave alone). The gap is ours-and-no-longer-shipped (orphan → delete), and the
whole risk sits on its boundary with not-ours: advising deletion of a file under someone's home
that turns out to be theirs is worse than the silence being fixed, and copy mode does not archive,
so it is unrecoverable.

**This wants a record before code.** The tools' current posture is *never act on a file this
plugin did not install*; recommending a deletion inverts it. That is a trust boundary and
costly-to-reverse advice — the `adr-write` criteria — so the ADR comes first and decides how an
orphan is identified without a digest to match. Not folded into `bbd3f87`, deliberately.

Also open from the same issue, and deliberately unchanged: `--link` is a THIRD, narrower scope
that installs gates only, via `gateNames()`. It already reports when copy mode has work it cannot
do, so it is documented rather than merged into `SHADOW_SCOPE`.

---

## 96. PARTLY CLOSED 2026-09-01 — `SHADOW_SCOPE` was hand-listed, and two home workflow files were drifted where nothing looks

**The scope half is CLOSED 2026-09-01 (v2.45.0, `7f5394d` and `022f39d`).** Mirroring is now the
default and `NEVER_MIRRORED` is the exception list; a test asserts that every directory the plugin
ships is either scanned or excluded on purpose. The rule earned its place on the first run — it
failed on `hooks` and `.claude-plugin` as well, neither of which anyone had considered. The
reachability question below was settled before the fix: a live skill listing offers bare `consensus`
and `review-ring` (the two files in the home) and no bare `quality-cycle` (shipped, not in the home),
so home workflows become bare names and the drifted pair was live. The `2.0.0` junk-cache note below
remains open and belongs to ADR-019 T1.



Deferred out of ADR-019 (`docs/adr/ADR-019-an-orphan-must-prove-it-is-ours.md`, Out of Scope), which
covers ORPHANS — files this plugin no longer ships. This entry is the other half: a file the plugin
ships **today**, in a home directory the scanners do not look in.

`SHADOW_SCOPE` (added 2026-09-01, `bbd3f87`) lists four home directories: `bin`, `hooks`,
`templates`, `skills`. Measured 2026-09-01, the plugin's own releases have shipped nine top-level
directories between them:

    ls -d ~/.claude/plugins/cache/quality-harness/quality-harness/*/*/ | xargs -n1 basename | sort -u
    bin docs evals hooks scripts skills templates tests workflows

`workflows` is one of the five outside the scope, and it is not hypothetical here:

    ~/.claude/workflows/consensus.js    home 6115389c22c4  plugin c7299c812b19  DRIFTED
    ~/.claude/workflows/review-ring.js  home 5f5f40ab0b61  plugin 3206965c71f7  DRIFTED

Both are ours by name and still shipped (`plugin/workflows/` holds `consensus.js`,
`quality-cycle.js`, `review-ring.js`). Neither scanner reports them, and `grep -n workflows` over
`standalone-link.mjs`, `sync-standalone.mjs` and `lifecycle.mjs` returns nothing. This is exactly
GitHub issue #1 — the notice and the repair tool blind to a directory — one directory over, still
open, four days after that issue was filed.

**The fix is a derivation, not a longer list.** The scope should come from what the plugin currently
ships (a `readdirSync` over the plugin root, minus what never installs home-side), so the tenth
directory is not missed the way the fifth through ninth were. That is a different mechanism from
ADR-019's: derivation can only ever see the CURRENT tree, so it cannot find an orphan, and an orphan
scan's directory set is a superset. Two mechanisms, deliberately separate records.

**Open first:** whether anything reads `~/.claude/workflows/*.js` at all. ADR-004's general rule
turns on it — *install a personal copy only where it is both reachable by something and cheaper to
maintain than the plugin's own copy*. If those two files are live, this is a drift fix. If nothing
reads them, they are ADR-004's case (an unread home copy that is a standing chore) and the answer is
that they should not exist, which routes back to ADR-019 rather than here. `~/.claude/skills` holds
none of ours and `~/.claude/commands` holds `M.md`, `am.md`, `autoresearch.md`, `load-skill.md`, so
whatever serves the bare `/consensus` in a live skill listing is not a home `SKILL.md` — find what
loads the `.js` before classifying them.

**Second item, same area.** `~/.claude/plugins/cache/quality-harness/quality-harness/2.0.0/` holds
`AUTHn`, `CHRn`, `cuda-1.9`, `maximum` and a dozen similar entries alongside `bin`, `hooks` and
`scripts`. It does not look like a release of this plugin. Any mechanism that walks cached versions
— `knownDigests()` today, ADR-019's `formerlyShipped()` next — must tolerate it without producing a
match, and the phrase "52 cached versions" used in GitHub issue #3 and §95 rests on counting it.
ADR-019 T1 carries a test for a junk directory; this entry is the note that the junk is real and
sitting in the cache now, not a hypothetical.

---

## 97. Nothing binds an acceptance entry to anything outside the file it is written in

Ask 3 of GitHub issue #4, deferred out of the fix that shipped in v2.45.0 (`68b5072`). The reporter
was explicit that this is a raise-the-cost problem rather than a closeable one, and was right: a
local gate reading local files cannot distinguish a run from a transcription, because every artifact
`adr-verify` writes, a human can write.

What shipped narrows two of the three steps they reproduced. A digest-less acceptance row is now
refused unless HEAD already has it, so typing one costs a commit that a reader can see; and neither
finding prints the digest it demands any more. What did not change is the third: `acceptance_digest`
is a pure function of the fence text, so anyone holding the task file can compute it, and the
mutation log's digest is the same value.

**The candidate, in the reporter's words:** bind an entry to something not derivable from the file.
The strongest cheap option is a digest of the command's OUTPUT plus its duration, recorded alongside
— still forgeable by someone who runs the command, which is the point, because forging then costs
what complying costs. `mutant_journal()` already keeps state outside the repository, so an
append-only run ledger keyed the same way and cross-checked by `adr-lint` would mean a forger has to
edit two artifacts consistently rather than paste one line.

**Why it is not a patch.** Output digests are not stable across machines, clocks or terminal widths;
a ledger outside the repository is state a fresh checkout does not have, so every check that reads
it must degrade to "I could not look" rather than to a verdict (CLAUDE.md §3), and a corpus cloned
onto a second machine must not read as forged. That is a decision about where evidence lives and
what a missing ledger means, and it wants a record.

**Also from that issue, and already done:** `plugin/templates/task-template.md` and
`plugin/skills/adr-execute/SKILL.md` no longer say the Verification Log closes the fabrication hole.
They say what it actually buys — cost, and drift-binding to the fence the evidence was taken
against — because a reader who believed the stronger claim would trust a `done` they should have
questioned.

---

## 98. PARTLY CLOSED 2026-09-02 — the Mutation Log carries the same acceptance digest and no trace of the run that produced it

Deferred out of ADR-020 (`docs/adr/ADR-020-a-run-leaves-a-trace-outside-the-file.md`, Out of Scope),
which binds an ACCEPTANCE entry to the output its run printed. A mutation row is the other half of
the evidence chain and it has the identical property: every field is derivable from the task file
plus the mutated source, so a row asserting `mutant killed · exit 1` is as cheap to type as the
acceptance row GitHub issue #4 reproduced.

    - YYYY-MM-DD · <sha[*]> · mutant killed · exit N · `<file>` · <why> · acceptance-sha256:<digest>

The digest at the end is the ACCEPTANCE fence's, not the mutant's. Two rows for two different
mutants against the same fence therefore end in the same 64 characters, and nothing in the row is
specific to the run that produced it.

**Not folded into ADR-020, deliberately.** The two are not symmetric. An acceptance run's output is
the fence's own; a mutant run's output is the fence's output *with a deliberate break in the source*,
so it is the thing most likely to embed a file path, a line number or a diff — the fields ADR-020
excluded from its digest because they make honest re-runs disagree. Whether a mutant run's output is
stable enough to bind is a separate measurement from the one ADR-020 T1 takes, and taking it is the
first thing this entry needs.

**Do the acceptance half first and read the Follow-up.** ADR-020 commits to counting, after a month,
how often its ledger cross-check fires on honest work. If that number is not zero the acceptance
mechanism comes out, and this entry should never be started.

---

**PARTLY CLOSED 2026-09-02. The measurement this entry named as its first need has been taken, and
it answers the question in the negative. The binding stays unbuilt, and now for a measured reason
rather than a deferred one.**

This entry says: *"Whether a mutant run's output is stable enough to bind is a separate measurement
from the one ADR-020 T1 takes, and taking it is the first thing this entry needs."* Taken, over four
mutants spread across the campaign's largest suites, each applied and run **twice** on an otherwise
unchanged tree:

    mutate: a verdict against a failing baseline …   identical=False  abs-paths=2  timings=27
    evidence: the seal survives a CRLF checkout       identical=False  abs-paths=2  timings=26
    hooks: a bin/ gate is spawned so Windows can …    identical=False  abs-paths=1  timings=100
    package: a gate with no mutation is named, not …  identical=False  abs-paths=2  timings=21

**Zero of four were byte-identical between two runs of the same mutant on the same tree.** Every one
carried absolute filesystem paths, and between 21 and 100 timing values — `duration_ms`, per-test
`(N.NNNms)` — which differ on every run by construction.

**So a mutant run's output cannot be bound the way ADR-020 binds an acceptance run's.** A digest over
it would differ on every honest re-run, which is the precise failure ADR-020 excluded paths and line
numbers from its own digest to avoid. This entry anticipated that risk in its "Not folded into
ADR-020, deliberately" paragraph; the measurement confirms it rather than leaving it as a worry.

**What would have to change first**, and neither is small: a normalisation that strips timings and
absolute paths from captured output — which is most of what distinguishes one mutant run from
another, so the residue may carry too little to bind — or a different binding target than the output
entirely, such as the mutated file's own digest, which is checkable and stable but says nothing about
whether the run happened.

**Still blocked on the same Follow-up, and the block is now dated.** ADR-020 landed 2026-09-01 and
commits to counting after a month how often its ledger cross-check fires on honest work. That is one
day old at the time of writing; if the count is not zero, the acceptance mechanism comes out and this
entry should never be started. **Do not begin the binding before 2026-10-01, and read that count
first.**

The residual defect is unchanged and worth restating: two rows for two different mutants against the
same fence still end in the same 64 characters, because the digest is the ACCEPTANCE fence's. What
this measurement establishes is that binding them to their own run's output is not the way out.

## 99. CLOSED 2026-09-02 — nothing checked that a function the plugin defines is ever called

ADR-020 T1 shipped `implausibly_fast` defined, asserted three times and called from nothing
(GitHub issue #6). Every gate this repository owns said it shipped correctly: the Acceptance fence
called the predicate directly, and the mutation was killed by those direct assertions whether or not
production invoked it — a mutant proves a test notices a change, never that the subject is reachable.
The thing that found it was another session running the binary on a real corpus and grepping for
callers.

The class is mechanically checkable and the sweep is capable of dirty. Run 2026-09-01:

```
python3 <sweep> git:dcb7df4:plugin/bin/adr-lint plugin/bin/adr-lint plugin/bin/adr-verify \
  plugin/bin/adr-next plugin/bin/adr-debt plugin/scripts/*.mjs
  plugin/bin/adr-lint@dcb7df4 (v2.47.0): 1 orphan of 93 defs — line 1850: implausibly_fast
  plugin/bin/adr-lint            HEAD  : 0 orphans of 93 defs
  plugin/bin/adr-verify: 0 of 54   plugin/bin/adr-next: 0 of 14   plugin/bin/adr-debt: 0 of 14
  plugin/scripts/lifecycle.mjs: 1 orphan of 69 — line 143: gitBranch (see §100)
  the other five .mjs: 0
```

It finds the defect at the commit that shipped it and nothing at HEAD, which is the property that
makes it worth turning into a gate rather than a script somebody ran once.

**The open design question, and why this is not already a gate.** A legitimately uncalled function
exists: `main`, the `_go_*` family reached through a dispatch table, and anything a future entry
point will call. So the gate needs an exemption mechanism, and an exemption list is the shape that
rots — a name added to silence a red run is indistinguishable from a name that belongs there.
Decide that before writing the check; a sweep with a hand-kept allowlist beside it is the defect
class ADR-011 named, one directory over.

**The reference implementation must be a bare-identifier scan, not a `name(` scan.** The first
version of this sweep matched `\bname\(` and reported `expandExistingGlob` as an orphan — it is
called at `plugin/scripts/lifecycle.mjs:1101` through the spread operator, `...expandExistingGlob(`,
and the naive lookbehind read the `.` as property access. A check that reports an observation it did
not make is CLAUDE.md §3's defect, and this one reported two.

---

**CLOSED 2026-09-02 (0e457fa, fdc0636, ed0dffd).** `scripts/orphan-sweep.mjs`, with
`tests/orphan-sweep.test.mjs` proving it can fail on this repository's own history rather than on a
fixture:

    dcb7df4 (v2.47.0): 2 orphans of 436 -> implausibly_fast, gitBranch
    cb45a39^         : 1 orphan  of 440 -> gitBranch
    HEAD             : 0 orphans of 440

**The scope was the whole mechanism, and the first attempt got it wrong in the direction that
looks clean.** Counting uses across every tracked file reported dcb7df4 CLEAN, because
`implausibly_fast` appears three times in `tests/gate-regressions.py` and twice in an ADR task. A
sweep reporting 0 at HEAD and 0 where the known defect lives is measuring nothing and is
indistinguishable from one that works. The corpus is `plugin/**` plus `README.md` — what a user
downloads. Tests do not make a function reachable; that is the entire defect this entry names.

**The open design question is answered by measurement, and the answer is that there is no
allowlist.** This entry worried that `main` and dispatch-table arms would force an exemption
mechanism whose shape rots. With the scope above, HEAD is 0 of 440 with no exemptions at all:
`main` occurs 72 times in the shipped tree, and the `_go_*` helpers are called directly rather than
dispatched. Because the scan counts BARE IDENTIFIERS, a name reached only through a string literal
counts as reached — so a genuine dispatch table resolves itself. A future legitimate orphan is
deleted or wired, never listed.

**Two mutation findings in the gate's own tests, and they point opposite ways.** The first was
real: the test declared its own copy of the `SHIPPED` predicate, so a mutation on the script's copy
went GREEN — one rule, two implementations, the drift `assertion_segments` already fixed once. The
second was not: the repointed mutant added `tests/` to the prefix while leaving the extension
filter, which excludes `.py`, so it broke nothing and GREEN meant "no behaviour changed". **Before
believing a GREEN, ask whether the mutant could have produced the failure at all** — an ineffective
mutant and a vacuous test give the same verdict.

**Left open, one level up:** this covers FUNCTIONS. Whether every shipped SKILL, gate and workflow
is reached is §105.

## 100. CLOSED 2026-09-01 — `gitBranch()` was dead code from the branch guard that was removed

`plugin/scripts/lifecycle.mjs:143` defines `gitBranch()`. Nothing in the file, the plugin, or the
tests calls it — found by §99's sweep on 2026-09-01. `lifecycle.mjs:3027` says why: *"No branch
guard. This harness is about the quality of a project's records"*, so the function is a leftover
from a policy that was deliberately dropped, not an unreachable check.

That distinction is the whole entry: this is NOT the ADR-020 class, where a check existed and could
not fire. Nothing is unenforced by its absence. Delete it, or say in a comment what future caller it
waits for — but do not diagnose it a second time as a missed call site.

**CLOSED 2026-09-01.** Deleted. `git grep gitBranch -- plugin/` returns nothing; the only remaining
mentions are this entry, §99's sweep output above it, and ADR-020 T4's Out of Scope line that
deferred here. `nearestExistingDirectory()`, its only helper, has eight other callers and stays.
`bash scripts/selftest.sh` exit 0 after the deletion.

## 101. CLOSED 2026-09-01 by ADR-021 T1 — a Verification Log row deleted from a committed file was invisible

Found 2026-09-01 while reading `yzhao062/awesome-auditable-ai`, whose "Audit Trails and Decision
Records" section names hash-chained records. The question it prompted — can a row be REMOVED from
one of our logs without anything noticing — was probed rather than assumed.

**Probed through the `adr-lint` CLI on a git fixture**, against `HEAD`'s copy of the gate rather than
the working tree's, because the mutation campaign was mutating that file at the time and a probe
against a deliberately broken subject measures the mutant. Three rows committed (`exit 1`, then two
`exit 0`, all carrying the current fence digest), then rows removed and the gate re-run:

| removed from the committed log | what `adr-lint` said |
|---|---|
| nothing (baseline) | two findings, both about the fixture and unrelated |
| the RED `exit 1` row | **identical to baseline** |
| one of the two GREEN rows | **identical to baseline** |
| every row | caught — `T1 marked done but its Verification Log has no exit-0 entry` |

**The one that matters is the RED row.** Deleting it makes a log imply a red-green cycle that did not
happen, which is the claim two task files in this corpus currently disclose BY HAND in prose because
nothing checks it. The "every entry passed, so nothing shows the fence could fail" advisory does not
fire, because a `## Mutation Log` entry suppresses it — a killed mutant is evidence the fence can
fail, which is correct, and which is why it cannot also serve as the deletion detector.

`grep -n "committed\|known" plugin/bin/adr-lint` returns one use of `known`: the digest-less notice.
Nothing else reads the committed file. Deletion is unmodelled, not defended.

### The fix, and the more elaborate one that lost to it

**A hash chain is NOT the fix, and this entry exists partly to record why.** Each row carrying the
digest of its predecessor would make deletion and reordering detectable, and it costs a new field, a
cutover date, invalidation semantics, and a change to what `adr-verify` writes.

`check_verification` **already calls `committed_lines()` two lines above the digest-less notice.**
The committed rows are in hand at the point the present rows are being read. Detecting a deletion is
comparing the two. No new field, no cutover, no writer change.

A chain beats git in exactly one place: where `committed()` answers `None` — a corpus copied without
its `.git`, a rewritten or squashed history. That is the boundary, and nothing has reported it, so it
is named here and not built.

**Two things the cheap version must get right**, both of them this repository's own rules:

1. `known is not None` guards it, exactly as the digest-less notice is guarded. A naive
   `for row in known: if row not in present` fires on every task in a corpus with no `.git`, which is
   a filter that could not look reporting absence (CLAUDE.md §3, ADR-005). The regression needs an
   arm proving SILENCE when `committed()` returns `None`.
2. Compare only Verification Log rows. `committed_lines()` returns every line of the committed file,
   so an unfiltered diff would fire on ordinary prose edits — including the correction notes this
   corpus writes into task files routinely. Filter through `VLOG_RE` on both sides.

**WRITTEN UP 2026-09-01 as `docs/adr/ADR-021-a-deleted-row-is-a-change-to-the-evidence.md`**, Proposed,
extending ADR-010 (a claim is re-checked or it is not counted). Its one task carries the call-site
mutation and the two silence arms — `committed()` returning `None`, and a prose-only edit. The
rejected hash chain is recorded in the record's Alternatives with the reason, so the next session
meeting the idea does not re-derive it.

**EXECUTED 2026-09-01.** `check_verification` now advises on a committed entry line absent from the
file, guarded on `known is not None` and filtered through `VLOG_RE` on both sides. Both silence arms
are asserted on the same fixture, the advisory CHANNEL is asserted rather than the summary line, and
the mutation `lint: a committed evidence row that has gone missing is reported` deletes the CALL and
is RED. Evidence written by `adr-verify` into T1's Verification and Mutation Logs.

## 102. CLOSED 2026-09-02 — a mutant that did not PARSE counted as noticed, and only the parser noticed it

Split out of §53's 2026-09-01 measurement because it is a decision about what the campaign's numbers
mean, not a defect to repair.

`state: a supersession chain is followed` rewrites `supersededBy: /^superseded\s+by\b/i.test(status)`
to `supersededBy: false &&`. That does not parse. `tests/lifecycle.test.mjs` dies at import in 40ms
with no subtest named, `mutate.mjs` reads a non-zero exit, and the mutant is counted RED — one of the
`416/416 mutations were noticed`.

**Nothing asserted anything.** The suite never ran. A syntax-error mutant proves the file is fed to a
parser, which was never in doubt.

**The precedent is already here and points the other way.** This repository decided that a mutant
whose process ends abnormally is INCONCLUSIVE rather than killed —
`tests/gate-regressions.py::abnormal mutant termination is inconclusive`, and `adr-verify`'s
`CRASH_OUTPUT` / `abnormal_termination`. The reasoning was that a false survivor costs a rerun while
a false kill permanently credits proof nobody observed. A mutant that cannot be parsed credits
exactly that kind of proof.

**The decision to make**, and why it is not obvious: classifying non-parsing mutants as inconclusive
would change what the campaign's exit code and its `N/N noticed` headline mean, and it would put a
burden on catalogue authors to write mutants that parse — which is arguably right, since a mutant is
supposed to change BEHAVIOUR, and one that changes nothing but syntax tests nothing. Against it: a
syntax-error mutant is trivially detectable and cheap to reject at authoring time, so a lint on the
catalogue may be the smaller change than a new verdict class.

**Scope, measured rather than guessed:** exactly ONE of the 416 catalogue entries has this property
today.

---

**CLOSED 2026-09-02 as an AUTHORING defect, not a new verdict class** — the smaller change this
entry itself argued for. A mutant is supposed to change BEHAVIOUR, and one that changes only syntax
tests nothing, so it is rejected where it is written rather than reclassified where it runs. The
campaign's exit code and its `N/N noticed` headline keep meaning what they always did, which the
verdict-class option would have altered.

**The count had grown from one to two** by the time this landed — the second was a duplicate `cwd=`
keyword in an `adr-verify` mutant — which is why it became a check rather than a cleanup:

    state: a supersession chain is followed          `supersededBy: false &&`   (JS syntax)
    sweep: a fence runs where it was recorded …      duplicate `cwd=` keyword   (Python syntax)

Both now express the same intent in code that parses, and both still come back RED — for a
behavioural reason rather than because the file reached a parser.

`tests/package.test.mjs::every catalogue mutant still parses, so a kill is behavioural` applies
`node --check` or `ast.parse` to each entry's mutated text. Shown capable of firing: restoring the
original un-parseable form fails it and names the entry.

## 103. PARTLY CLOSED 2026-09-02 — three prose records asserted a live defect the code had already fixed, in one day

Found 2026-09-01 while triaging this backlog, not by looking for it. Three separate records
described an open defect that had already been closed, and nothing in this repository can notice
that class:

| record | asserted | actually |
|---|---|---|
| `docs/research/2026-08-28-verification-is-the-bottleneck.md` §8 "where the field is ahead" | 4 open gaps | 1 open; one closed by ADR-011 on 2026-08-29, one answerable on demand, one materially advanced |
| `CLAUDE.md` §7 | "`resolve_bash()` excludes only the first \[stub]… BACKLOG §91 is the fix" — present tense | both stubs filtered at both sites since §91; executed through each resolver's seam on the exact PATH §91 measured, both return `C:\Program Files\Git\bin\bash.exe` |
| `docs/BACKLOG.md` §79 | the classifier cannot tell a vacuous fence from a kill signalled by "no tests ran" | ADR-016 decided it and `plugin/bin/adr-verify:1320-1325` implements it |

**The asymmetry is the finding.** This project has a gate for a prose record that claims MORE than
happened — that is the whole evidence chain, and `adr-verify --sweep` re-checks 52 recorded claims
against their own fences. It has nothing for a prose record that claims LESS than happened: a
warning that outlived its defect. Both are the same error — a record disagreeing with the tree — and
only one direction is instrumented.

**The cost is measurable and was paid three times today.** CLAUDE.md §7's stale half was read as a
live defect and the whole finding re-derived before anything executed the resolvers. §7's own
closing rule already names the mechanism and only in one direction: *"A rule here that asserts a
guard handles a case is a hypothesis until something executes it."* The mirror is equally true — a
rule asserting a guard does NOT handle a case is a hypothesis too, and it is the more expensive one,
because it recruits a session into fixing something already fixed.

**Why nothing catches it.** A `Governs:` path is resolved against `git ls-files` (ADR-011), so a
pointer to a missing file is reported. Nothing resolves a prose CLAIM against the code it is about.
The three above were each found by a human or an agent reading carefully, which does not scale and
did not happen for between one and three days in each case.

**What a check could plausibly do, and what it cannot.** It cannot grade prose. What it can do is
much narrower and might still have caught all three: a record that names a `file:line` and a
quoted snippet is checkable the way agentsmemory's code anchors are — the snippet is present or it
is not, and its absence marks the record STALE rather than wrong. §91's entry quotes
`re.search(r"[\\/]system32[\\/]?$", …)`, which stopped being in the file the moment it was fixed.
That is a mechanical signal and it was sitting there unread. Whether the cost of anchoring records
is worth it is the decision, not whether the signal exists.

**One direction IS instrumented, narrowly, and it fired on this very session.**
`tests/package.test.mjs::the backlog index does not undersell what the backlog says it finished`
caught a §88 body that announced a closure its heading never mentioned — written by the session
filing this entry, minutes after filing it. That gate compares a section's BODY against its own
HEADING and nothing else; it cannot see a body that disagrees with the CODE, which is the class
here. Worth knowing that the shape of the check already exists and that its subject is one level
short.

**Related:** §49's "verdict changed its mind" is the opposite problem (the tool disagreeing with
itself); this is the corpus disagreeing with the tool. Not the same class.

**Three instances, one day, all closed as found. Left open as a class.**

---

**PARTLY CLOSED 2026-09-02. One of the two directions is now instrumented; the other was
measured and declined.**

**What shipped (60fcec9).** `backlogHeadingsThatUndersell` was reading the same six closure
words under two different case rules — the heading test carried `i`, the body test did not.
The corpus writes its bolded openers in sentence case and never in caps, so the body rule
matched none of them. Measured over all 103 sections: **0 findings with `m`, 3 with `mi`**,
and reading each body confirmed all three were real.

| section | body said | heading said | stale for |
|---|---|---|---|
| §17 | `**Closed — Windows is green and the job blocks.**` | nothing | 8 days |
| §89 | `**Partly fixed.**` | `*.js` still unpinned — it is pinned | 3 days |
| §91 | `**Fixed** by filtering WindowsApps` | the defect, present tense | 3 days |

So this class had a **second, cheaper direction nobody had looked for**: not a record that
never noticed, but a record that noticed *in its body* and never fixed its heading. The
existing gate was built for exactly that and could not see it, for one missing flag.

**What was measured and NOT built: the anchor mechanism.** The paragraph above proposes
pinning a record to a verbatim snippet, agentsmemory-style, so a snippet that leaves the tree
marks the record STALE. It was scoped, then measured against the class it was meant to serve,
and **the numbers do not support building it.**

The enumerating command — for each section closed after its defect was fixed, reconstruct the
body as it stood in the stale window and ask whether it held a verbatim snippet already gone
from the tree at that revision:

    for n in 79 30 88 92 90; do
      h=$(grep -m1 "^## $n\." docs/BACKLOG.md | sed 's/^## //')
      git log -S "$h" --format='%h %ad' --date=short --reverse -- docs/BACKLOG.md | head -1
    done
    # then, at each closing commit's parent: git show <sha>^:docs/BACKLOG.md, take the
    # section body, match rows shaped `path:line<space><space>+<code>`, and test each
    # snippet against git show <sha>^:<path>

What it returned:

    §79 af9a857^: NO anchor-shaped row in body -> gate could not have caught it
    §30 1a34c0d^: NO anchor-shaped row in body -> gate could not have caught it
    §88 fe7c7f3^: NO anchor-shaped row in body -> gate could not have caught it
    §92 fe7c7f3^: NO anchor-shaped row in body -> gate could not have caught it
    §90 fee9903^: ABSENT  plugin/bin/adr-lint:474  if not spec_file.is_absolute():
    §90 fee9903^: ABSENT  plugin/bin/adr-verify:688  target = (cwd / rel) if not Path(rel)...
    §90 fee9903^: ABSENT  plugin/bin/adr-verify:923  path = (cwd / target) if not Path(tar...

**One of nine.** Only §90 would have been caught — its code was fixed by `eb696f4` on
2026-08-30 and its heading closed by `fee9903` on 2026-09-01, a two-day window the check
would have reported. Two of the nine (`docs/research/…` §8, `CLAUDE.md` §7) are not backlog
sections at all and are outside any `docs/BACKLOG.md` gate's reach. Two more (§89, §91) are
the ones the case fix now catches. The remaining four carried no machine-checkable snippet in
any form.

**And its universe is empty today.** The same probe over the current file returns four
anchor-shaped rows, all in CLOSED sections, where quoting vanished "before" code is correct
and must not fire. A gate over that set cannot fail from a fresh checkout — which is the
defect this repository exists to demonstrate the absence of, and building it would have meant
authoring a migration whose purpose was to manufacture a universe for it. That is the
speculative complexity YAGNI rejects.

**Why prose quoting cannot be scraped**, which is what killed the cheap version: §91 elides
its quote with `…`, §37's block sits at column 0 inside a fence, and §88 and §91 put theirs in
table cells. A scraper over this corpus is false-positive and false-negative at once.

**Precision worth keeping.** `60fcec9`'s message says §91 is "now closed by a gate instead."
True of the undersell gate. The anchor mechanism — the thing this section proposes — has a
demonstrated catch count of **zero**, and saying otherwise here would be this section
committing its own defect a second time.

**What is left open.** The direction where a record asserts a live defect and its own body
never noticed either. Nothing mechanical covers it, the two out-of-backlog instances are
outside any such gate anyway, and every instance so far was found by a human or an agent
reading carefully. Re-open the anchor mechanism if the count of would-have-been-caught
instances reaches three; it is one.

## 104. CLOSED 2026-09-02 — `gh run watch --exit-status` exits 0 on a CANCELLED run, and a push cancels the run you are releasing on

Found 2026-09-02 while releasing v2.52.0, by nearly cutting the tag on it. Both halves are
release-procedure defects and neither is visible from the command's output alone.

**Half one: the watch reports success for a run that never finished.** `gh run watch <id>
--exit-status` (gh 2.98.0) printed the cancellation and then exited 0:

    X The operation was canceled.
    mutations 1/4: .github#253

    [exited with code 0]

`--exit-status` documents itself as exiting non-zero "if the run fails". A cancelled run did not
fail, so the flag is arguably behaving as written — which is precisely the trap. The vocabulary a
release gate needs is *did every job succeed*, and `cancelled` answers neither `success` nor
`failure`. This is CLAUDE.md §3's rule arriving from outside the repository: a tool that could not
finish looking must not be read as having looked and found nothing wrong.

The API does say it plainly, and is what a release must read:

    gh run view <id> --json conclusion,jobs \
      --jq '"\(.conclusion)", (.jobs[] | "\(.name): \(.conclusion)")'
    RUN: completed cancelled at d866534
      mutations 3/4: cancelled

**Half two: pushing during the run is what cancelled it.** `.github/workflows/selftest.yml:21`
sets `cancel-in-progress: true` on a concurrency group keyed by event and ref. So a second push to
`main` kills the in-flight run for the first — by design, and correct for ordinary development,
where only the newest commit matters. It is wrong for a release, where the run is EVIDENCE FOR A
SPECIFIC SHA and the next push destroys it.

The failure mode is quiet in the way this project cares about: the release run reaches six of nine
jobs green, the three cancelled shards are the expensive ones (the full mutation campaign), and the
watch says 0. A release cut there carries no mutation evidence at all while looking fully verified.

**Two rules, both cheap, and CLAUDE.md §13 now carries them:** read `conclusion` per job rather
than the watch's exit code, and do not push again until the release run is done or accept that the
tag needs a fresh run at the new head.

**Not a hypothetical.** The release was held and re-run at `b8e4e4c`; the tag was not cut on the
cancelled evidence.

**CLOSED 2026-09-02 (55fb0fd, 8a20265).** `scripts/release-evidence.mjs` is that check, and it
gated the release it was written for — v2.52.0 was cut only after it reported nine of nine
`success` at `77f020c`. Four verdicts, and only `success` clears a sha: `failed` names each job and
its conclusion, `incomplete` stays distinct from `failed` per ADR-005, and `unreadable` is "I could
not look". A run carrying ZERO jobs is `unreadable` by a named branch, because `[].every(...)` is
true and an empty job list would otherwise clear every sha ever at full coverage.

**Two more `gh` traps found while using it, and they are one finding: an abbreviated sha is
accepted and then silently means nothing.**

    gh run list --commit 57a1e76        -> []            (not an error — an empty list)
    gh release create --target 77f020c  -> HTTP 422 "Release.target_commitish is invalid"

The first is the dangerous one: `[]` reads exactly like "this commit has no runs", so a release
check would report "could not look" forever while the run sat there. `release-evidence.mjs` expands
the sha with `git rev-parse` before asking. The second at least fails loudly.

**And a third, in the WATCHER rather than the check.** The first background poller treated exit 2
(`unreadable`) as terminal, so a single `dial tcp … i/o timeout` to `api.github.com` ended it
sixteen minutes early — after which two shards went green unobserved. Separating "could not look"
from "found a problem" is pointless if the caller collapses them again: a watcher must RETRY an
unreadable answer and wake only on `success` or `failed`. Fixed in the poller; recorded here
because the same mistake is available to anyone scripting the release.

## 105. Every shipped skill is statically reachable and nine of thirteen have no eval that runs them

Found 2026-09-02, prompted by an observation that "some of the skills and capabilities are never
called or used" and measured before being believed.

**Statically, nothing is orphaned.** A bare-identifier sweep over the shipped tree finds a referrer
for every skill, gate, workflow and script — the artifact-level twin of §99's function sweep:

    for f in $(git ls-files 'plugin/*' | grep -vE 'evals/|\.cmd$'); do …done
    → no unreferenced artifact

So this is not §99's class one level up. Every skill is named by the `work` router, by a sibling
skill, by `work-next.mjs`, or by the README.

**What is missing is rung 4 of this project's own reachability ladder** — the task template asks
each task to say how real usage would be observed, or to state the absence of telemetry. For the
skills themselves, that evidence does not exist. Counting eval cases per skill, 2026-09-02:

| eval files | skills |
|---|---|
| 6 | `work` |
| 2 | `adr-write` |
| 1 | `execution` |
| **0** | `adr-execute`, `adr-retire`, `arch-write`, `codex-advise`, `codex-review`, `mutation-audit`, `postmortem`, `quality-policy`, `review`, `spec-write` |

**Nine of thirteen skills have no eval that exercises them**, and three of those — `review`,
`quality-policy`, `mutation-audit` — are the ones this project's own CLAUDE.md leans on hardest.

**Why this is a finding rather than a shrug.** ADR-009's rule is that naming a check that cannot
fail is worse than naming none, and the same holds for a skill: one nothing ever runs is a claim
about the lifecycle that nothing tests. `work` routes to `review` for a whole risk tier, and no eval
has ever observed that route being taken. The routing table is prose, and prose is what §103's whole
class is about.

**The honest limit, stated rather than glossed:** an eval measures whether a skill FIRES on a
prompt, not whether its advice was good. §80 is the entry about that gap and §30 is the graders it
needs, so this is bounded by both. A firing test is still strictly more than nothing.

**Not fixed here.** Writing nine eval cases is real work with a real cost — the eval runner spends
model calls — and the ordering question (which three matter most) is a judgement about where the
lifecycle is load-bearing, not a mechanical sweep. `review` first is the obvious candidate.

## 106. CLOSED 2026-09-02 — mutation shards were sliced by index, so the slowest carried 53% more than the fastest

Filed 2026-09-02 by ADR-023, which deferred it. `scripts/mutate.mjs --shard i/n` slices the
catalogue by INDEX, so a shard's cost depends on which suites its entries happen to name. Measured
at 430 entries over four shards, using per-suite runtimes taken the same day:

    shard 1/4: 107 mutants, 24.6 min
    shard 2/4: 108 mutants, 16.1 min
    shard 3/4: 107 mutants, 18.1 min
    shard 4/4: 108 mutants, 21.3 min

Even counts, uneven cost, because three suites are 86% of the campaign
(`lifecycle.test.mjs` 17.2s x 116, `gates.test.mjs` 14.1s x 96, `evidence-chain.test.mjs` 22.2s x
34). The campaign waits for the slowest, so 8.5 of those minutes are pure wall-clock loss.

ADR-023 T1 raised the matrix to eight, which shrinks the absolute gap without addressing the
imbalance — the ratio is a property of the slicing, not of the count.

**Why it was deferred rather than done.** The obvious fix is to slice by estimated cost, and the
obvious estimate is a table of per-suite runtimes. **That table is a list kept beside the artifact**
— the shape this corpus distrusts, and the one ADR-011 named: it is right on the day it is written
and silently wrong after any suite changes, with nothing to report the drift. A number that decides
scheduling and answers to nothing is worse than an uneven shard.

**The honest version measures rather than remembers**: have the campaign record each entry's
observed duration as it runs, and slice the next run from those. That makes the estimate a
measurement with a provenance, and makes a stale one visible. It is also a bigger piece of work
than raising a matrix number, needs somewhere durable to keep the timings, and interacts with
ADR-023's verdict cache, which will be writing per-entry state anyway.

**Do this after ADR-023 T2 lands**, and share its store rather than adding a second one.

**CLOSED 2026-09-02**, exactly that way. `shardByCost()` in `scripts/mutate.mjs` does
longest-processing-time-first over the durations ADR-023's cache already records, so the estimate is
a measurement from the campaign's own last run and a stale one fixes itself on the next. No table
was added.

An entry with no timing sorts FIRST, at Infinity — an unmeasured mutant is the one whose cost is
unknown, and separating the unknowns is a safer guess than assuming they are cheap. With no timings
at all it degrades to round-robin, partitions correctly, and says `no timings yet — even counts`
rather than claiming a balance it did not compute.

The partition is asserted over the real catalogue at several shard counts, because an overlap
double-counts a verdict and a gap drops one silently: 436 entries, 436 unique, every entry in
exactly one shard.

## 107. `(external: <where>: …)` takes free text, so the owner of a cross-repo target is unsearchable

Deferred out of ADR-024 T2, which introduced the disposition. `<where>` is prose — "backend repo",
"the Laravel side", "platform-team monorepo" — chosen because the reader's question is *who owns
this*, and a human sentence answers it immediately while a URL does not.

What it costs: nothing can group, count or follow these. A team with a dozen cross-repo pointers
cannot ask "what do we owe the backend repo", and a target that MOVES leaves every citation of it
stale with nothing to report the drift — the `Governs:` rot ADR-011 closed, one field over.

**The obvious fix is the one to be careful about.** A machine-readable form (a git remote, an HTTPS
URL, an `org/repo#ADR-007` triple) is greppable and checkable — but checking it means reaching into
another repository, which ADR-024 rules out permanently: a gate whose answer depends on what else is
cloned beside it is the machine-dependence CLAUDE.md §8 forbids. So a typed `<where>` would be
*shaped* like a resolvable pointer and resolve against nothing, which is a worse lie than prose.

**What would make this worth doing:** a corpus with enough external pointers that grouping them is a
real question, and a decision about what a typed target is FOR if nothing may follow it. Neither
exists yet — ADR-024's own criterion says the disposition comes out entirely if ten records pass
without a use, and this entry should not outlive that.

