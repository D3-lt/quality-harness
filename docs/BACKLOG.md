# Backlog — after v2.0.4

Findings from the independent verification of the v2.0.4 release (macOS, 2026-08-25).
All release claims reproduced (self-test 51/51; forced-cp1252 gates 8/8; D5 rejection
red-proved at 48/51). Every item below is **pre-existing** — each reproduces on 2.0.0 —
so none was a release blocker; they are the next work.

Ordering is by user pain, worst first.

**Status 2026-08-25.** Items 2, 3, 5, 7 and 8 landed on `task/post-2.0.4-fixes`; each
diagnosis is kept below with the commit that closed it. Items 1 and 4 are open, and
item 6 collects what fixing the others turned up. Items 7 and 8 came from a live 2.0.4
report against a different repository, not from the release verification.

---

## 1. Commit gate: one unresolved Bash path bricks committing for the whole session

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
`VALIDATION_PATTERNS` matches the first word, and the `selftest` pattern needs the
script's own name there. Running the project's own gate the obvious way therefore leaves
the commit gate saying "Run the smallest repository-owned test" after a green 54/54 run.
Hit live twice on 2026-08-25. Either teach the patterns the `bash <validator>` form or say
in the message which invocations count.

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

---

## Verification claims worth re-running after any of the above

- `./scripts/selftest.sh` → 54/54 (on a task branch until item 4 lands; `bash
  scripts/selftest.sh` runs the same checks but does not satisfy the commit gate — item 6).
- The 8 gates under `PYTHONIOENCODING=cp1252` against `tests/fixtures/ok` → 8/8, and the
  `adr-verify`-written evidence row shows `c2 b7` under `cat -A` / `od` (macOS `cat` has
  no `-A`; use `od -c`).
- Items 1 and 3 both need per-segment / transcript-level tests — their live repros came
  from a session transcript, not from unit inputs, and whole-command tests stay green
  while the bug bites.
