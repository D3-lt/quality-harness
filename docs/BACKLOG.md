# Backlog — after v2.0.4

Findings from the independent verification of the v2.0.4 release (macOS, 2026-08-25).
All release claims reproduced (self-test 51/51; forced-cp1252 gates 8/8; D5 rejection
red-proved at 48/51). Every item below is **pre-existing** — each reproduces on 2.0.0 —
so none was a release blocker; they are the next work.

Ordering is by user pain, worst first.

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

**Windows execution of the gate tests is unverified.** `tests/gates.test.mjs` spawns
`adr-lint`/`adr-verify` by name through `spawnSync`, which cannot run a `#!` script on
native Windows, and every Python probe hardcodes `python3`. The gates themselves reach
Windows through Git Bash, so this may only affect the test suite — but nothing here has
been executed on Windows, and no fix above changed that either way.

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

## 12. Found while fixing 1, 4, 6, 10 and 11 — not fixed

**A session cannot exercise its own fix to this harness.** The live hooks run
`${CLAUDE_PLUGIN_ROOT}/scripts/lifecycle.mjs`, which resolves to
`~/.claude/plugins/marketplaces/quality-harness` — a separate clone, on whatever version
it last pulled. Editing this working tree changes nothing about the gates acting on the
session doing the editing. On 2026-08-25 that clone sat at 2.0.11 while 2.0.12-2.0.15 were
being written, so item 1's bug kept blocking every commit in the very session that fixed
it, and each commit had to be run by the user through the `!` prefix. Nothing here is
broken, but it is the first thing to know before debugging why a fix "did not take", and
it means no fix in this repository is ever verified live by the session that wrote it —
`selftest.sh` plus a negative control against `git show HEAD:` is the available evidence.

**Navigation and fast-forward integration count as edits.** **Done — `2.0.17`.** The
fork below was decided by the user on 2026-08-25 ("working, not blocking"): the gate asks
*"did this session author something it has not verified?"*, while keeping the staleness
half of the second reading. A navigation-only session owes nothing; a refresh (branch
switch, `pull`, `merge --ff-only`) after a green run still stales that evidence, so the
pinned contracts at `tests/lifecycle.test.mjs` (edit → test → pull is unverified) hold
unchanged. `git checkout -b`/`switch -c` in place are inert — they change no tree and
stale nothing. `git pull --ff-only` also joined the protected-branch exceptions beside
`merge --ff-only`: fast-forward integration is the sanctioned way to update `main`.

`git checkout main && git
pull --ff-only` at session start, with nothing authored afterwards, leaves `Stop` asking
for a validation run. Both are in `isGitMutationCommand`'s mutating set.

This one is a genuine fork, not an oversight, and it should be decided rather than
patched. Two readings of what the evidence gate asks:

- *"Did this session author something it has not verified?"* Then navigation is not an
  edit, and a session that only moved between branches owes no evidence.
- *"Is the green run still about this tree?"* Then both are edits, because after either
  one the tested tree is not the current tree.

The repository has already chosen the second reading, twice and deliberately:
`isPotentialMutationCommand('git pull --ff-only') === true` (`tests/lifecycle.test.mjs:93`)
and the stale-evidence loop at `:576`. Changing it flips a pinned contract, so it wants a
decision, not a carve-out. The discriminator now exists either way — item 11 built
`localBranchExists` and the operand/separator split — so the work is small once the
reading is settled. Cost of the current behaviour is one extra validation run per session
start.

**Scratchpad writes score as repository mutations.** **Done — `2.0.17`.**
`mutatesOnlyTempPaths` proves, fail-closed, that every write of a Bash command lands
under the OS temp roots — redirect targets and the operands of
rm/mv/cp/mkdir/rmdir/touch/truncate/tee, with in-command `VAR=` assignments expanded,
symlinks realpath-resolved, and every other mutator class (interpreters, in-place
editors, git, package managers) disqualifying outright. A project living under the temp
root gets no exemption, which also keeps the test suite's own fixtures strict. Applied in
both the evidence gate and the branch guard, so a scratch note on `main` no longer
demands a task branch.

`cat > /private/tmp/.../scratchpad/commit-msg.txt`
raises `lastMutation`, so `Stop` demands a repository validation for a file outside any
repository. Hit repeatedly on 2026-08-25 while writing commit messages for the items
above. The fix is not small: for a Bash write redirect `mutationPaths` records an opaque
`<Bash mutation: cmd>` marker rather than a path, so exempting by location needs redirect
target resolution generalized beyond `bashMarkdownMutationPaths`, plus a rule for what
counts as scratch (`os.tmpdir()` is the obvious candidate and would misjudge a project
that lives there). `runArtifactGates` already skips these markers — they are not absolute
paths — so the damage is confined to the completion nag. Least costly finding here, most
invasive fix; weigh it against item 12's first bullet before starting.

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
