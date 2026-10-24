# Backlog

What is left for later, with the evidence that found it (CLAUDE.md §10). This file is the index of every
numbered section ever written: an open section is here in full, and a closed one is one heading and a
pointer to where its text lives, verbatim and unchanged, in `docs/backlog-archive/`. Section numbers are
never reused or renumbered, so every `BACKLOG §N` citation in records, code and tests resolves here.

- **Add** a new section at the end, numbered after the last, with its status first in the heading:
  `## N. OPEN 2026-10-12 — what was found`.
- **Close** a section by changing its heading's status and adding the evidence line at the top of its
  body, then move the whole section to the archive part for its number range and leave the heading here
  with the pointer. `node scripts/backlog-record-sweep.mjs` and the other sweeps read the archive too.
- The sweep of 2026-10-12 moved every section whose heading already said CLOSED, DECLINED, FIXED,
  DECIDED, WITHDRAWN or MITIGATED, and the document's original preamble, without editing a word.

## Follow-ups

Receipts for the open obligations of archived records: `adr-retire-check` reads them here, in the `BACKLOG.md`
the active corpus (`docs/adr/`) and its archive (`docs/adr-archive/`) share. Each line names its source record; it
is ticked when the work is done or the owner abandons it, never removed, and the checker counts it either way.

- [ ] ADR-095: read the decision corpus once per session instead of per governed path (§378; the first governed Edit cost 347 ms, the next 79 ms).
- [ ] ADR-095: a per-test verdict cache for the repository's own gate (§378).
- [ ] ADR-095 T4: a per-test verdict cache for the repository's own gate, the same item as the record's, deferred again by T4 (§378).
- [ ] ADR-095: the outside run (CLAUDE.md §18) timing SessionStart and Stop on a corpus of 70 records or more, before and after; since ADR-099 removed the cache, only Stop's timing is left to take.
- [x] ADR-095: run the ready-line cache's misses concurrently. Moot: ADR-099 (Accepted 2026-10-12) deleted the cache, so there are no misses to run (§378).
- [x] ADR-095 T2: the same concurrent-misses item, deferred by the withdrawn T2; moot for the same reason.
- [x] ADR-095 T6: the same concurrent-misses item, deferred by T6; moot for the same reason.

## 1. CLOSED — a commit gate where one unresolved Bash path bricked committing for the whole session (`a48c608`)

Archived: [backlog-archive/BACKLOG-001-100.md](backlog-archive/BACKLOG-001-100.md)

## 2. CLOSED — 13 `subprocess(text=True)` sites decoded with the locale codepage (`f26a4b3`)

Archived: [backlog-archive/BACKLOG-001-100.md](backlog-archive/BACKLOG-001-100.md)

## 3. CLOSED — branch-guard false positives: `shellSegments` split `2>&1` on the bare `&` (`c889429`)

Archived: [backlog-archive/BACKLOG-001-100.md](backlog-archive/BACKLOG-001-100.md)

## 4. CLOSED — the self-test was branch-sensitive: a fresh clone on `main` failed 1/51 (`0479057`)

Archived: [backlog-archive/BACKLOG-001-100.md](backlog-archive/BACKLOG-001-100.md)

## 5. CLOSED — D2 part 1 (`code_only` docstring/backtick fix) had no test (`b0d90a7`)

Archived: [backlog-archive/BACKLOG-001-100.md](backlog-archive/BACKLOG-001-100.md)

## 6. CLOSED 2026-09-02 — three found while fixing §2, §3 and §5; the fourth was left on purpose

Archived: [backlog-archive/BACKLOG-001-100.md](backlog-archive/BACKLOG-001-100.md)

## 7. CLOSED — a `python`/`node`/`ruby` in a *filename* made reads look like interpreter runs (`82f4758`)

Archived: [backlog-archive/BACKLOG-001-100.md](backlog-archive/BACKLOG-001-100.md)

## 8. CLOSED — a newline made the project's own gate stop counting as evidence (`6962cc7`)

Archived: [backlog-archive/BACKLOG-001-100.md](backlog-archive/BACKLOG-001-100.md)

## 9. CLOSED 2026-09-24 — Piping a validation command turns it into a mutation

Archived: [backlog-archive/BACKLOG-001-100.md](backlog-archive/BACKLOG-001-100.md)

## 10. CLOSED — set-level record gates were blocked at the per-write boundary (`3b9c44e`)

Archived: [backlog-archive/BACKLOG-001-100.md](backlog-archive/BACKLOG-001-100.md)

## 11. CLOSED — the branch guard blocked the escape it demands (`aaaaf31`)

Archived: [backlog-archive/BACKLOG-001-100.md](backlog-archive/BACKLOG-001-100.md)

## 12. CLOSED 2026-09-24 — Found while fixing 1, 4, 6, 10 and 11 — two closed, one permanent

Archived: [backlog-archive/BACKLOG-001-100.md](backlog-archive/BACKLOG-001-100.md)

## 13. CLOSED 2026-09-24 — The artifact gate's budget was fixed at 10s and no setting could raise it

Archived: [backlog-archive/BACKLOG-001-100.md](backlog-archive/BACKLOG-001-100.md)

## 14. CLOSED 2026-09-24 — What the adversarial review of 2.0.12-2.0.17 found, and what was accepted

Archived: [backlog-archive/BACKLOG-001-100.md](backlog-archive/BACKLOG-001-100.md)

## 15. CLOSED — the harness only ever said no (`2.1.0`)

Archived: [backlog-archive/BACKLOG-001-100.md](backlog-archive/BACKLOG-001-100.md)

## 16. CLOSED — nothing ran the checks except a person who remembered to (`2.1.1`)

Archived: [backlog-archive/BACKLOG-001-100.md](backlog-archive/BACKLOG-001-100.md)

## 17. CLOSED 2026-08-25 — what Windows said once the suite stopped answering for it

Archived: [backlog-archive/BACKLOG-001-100.md](backlog-archive/BACKLOG-001-100.md)

## 18. CLOSED 2026-09-02 — a task could be marked done with failing evidence, and adr-lint said PASS

Archived: [backlog-archive/BACKLOG-001-100.md](backlog-archive/BACKLOG-001-100.md)

## 19. CLOSED — adr-verify rewrote the line endings of every file it touched, on Windows

Archived: [backlog-archive/BACKLOG-001-100.md](backlog-archive/BACKLOG-001-100.md)

## 20. CLOSED 2026-09-02 — a backticked Cmd override ran the OUTPUT of the command, not the command

Archived: [backlog-archive/BACKLOG-001-100.md](backlog-archive/BACKLOG-001-100.md)

## 21. CLOSED 2026-09-02 — a gate that ignored an unknown flag answered a question nobody asked

Archived: [backlog-archive/BACKLOG-001-100.md](backlog-archive/BACKLOG-001-100.md)

## 22. CLOSED 2026-09-02 — the commit gate degraded with session length until it blocked everything

Archived: [backlog-archive/BACKLOG-001-100.md](backlog-archive/BACKLOG-001-100.md)

## 23. CLOSED — the edit boundary blocked without preventing anything (all five gates)

Archived: [backlog-archive/BACKLOG-001-100.md](backlog-archive/BACKLOG-001-100.md)

## 24. CLOSED — the skill recommended the one shape the evidence chain cannot cover

Archived: [backlog-archive/BACKLOG-001-100.md](backlog-archive/BACKLOG-001-100.md)

## 25. CLOSED 2026-09-24 — Two things 2.18.2 made vestigial, kept deliberately

Archived: [backlog-archive/BACKLOG-001-100.md](backlog-archive/BACKLOG-001-100.md)

## 26. DECIDED 2026-08-28 — no detached mode; the pattern is documented instead

Archived: [backlog-archive/BACKLOG-001-100.md](backlog-archive/BACKLOG-001-100.md)

## 27. CLOSED 2026-08-28 — all four scripts are behind an import guard

Archived: [backlog-archive/BACKLOG-001-100.md](backlog-archive/BACKLOG-001-100.md)

## 28. DECIDED 2026-08-28 — it belongs in the review skill, as a question and never a score

Archived: [backlog-archive/BACKLOG-001-100.md](backlog-archive/BACKLOG-001-100.md)

## 29. CLOSED — FIXED 2026-08-27 — this entry was stale and is kept for the mechanism

Archived: [backlog-archive/BACKLOG-001-100.md](backlog-archive/BACKLOG-001-100.md)

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

Archived: [backlog-archive/BACKLOG-001-100.md](backlog-archive/BACKLOG-001-100.md)

## 32. WITHDRAWN — the runs where a skill fires finish fine

Archived: [backlog-archive/BACKLOG-001-100.md](backlog-archive/BACKLOG-001-100.md)

## 33. DECLINED 2026-09-24 — An MCP wrapper, so the gates work where Claude Code does not

Archived: [backlog-archive/BACKLOG-001-100.md](backlog-archive/BACKLOG-001-100.md)

## 34. CLOSED — FIXED — the coverage gate was rejecting good code one run in ten

Archived: [backlog-archive/BACKLOG-001-100.md](backlog-archive/BACKLOG-001-100.md)

## 35. CLOSED 2026-09-24 — Three instructions measured, three inert

Archived: [backlog-archive/BACKLOG-001-100.md](backlog-archive/BACKLOG-001-100.md)

## 36. CLOSED 2026-09-24 — What actually reaches an agent, measured on one

Archived: [backlog-archive/BACKLOG-001-100.md](backlog-archive/BACKLOG-001-100.md)

## 37. CLOSED 2026-08-29 — a disposition containing parentheses is silently unrecognised

Archived: [backlog-archive/BACKLOG-001-100.md](backlog-archive/BACKLOG-001-100.md)

## 38. CLOSED 2026-09-24 — Two of three closed; one runner question stays open

Archived: [backlog-archive/BACKLOG-001-100.md](backlog-archive/BACKLOG-001-100.md)

## 39. CLOSED 2026-09-02 — the experiment answered it, and half the second claim had gone stale

Archived: [backlog-archive/BACKLOG-001-100.md](backlog-archive/BACKLOG-001-100.md)

## 40. CLOSED 2026-09-02 — two fixes that inherited the defect they were fixing

Archived: [backlog-archive/BACKLOG-001-100.md](backlog-archive/BACKLOG-001-100.md)

## 41. DECLINED 2026-09-24 — One of two closed; the relation-vocabulary question stays open

Archived: [backlog-archive/BACKLOG-001-100.md](backlog-archive/BACKLOG-001-100.md)

## 42. DECLINED 2026-09-24 — The published history still holds what was already published

Archived: [backlog-archive/BACKLOG-001-100.md](backlog-archive/BACKLOG-001-100.md)

## 43. CLOSED 2026-09-24 — Two outside papers, read 2026-08-28 — what they had that we did not

Archived: [backlog-archive/BACKLOG-001-100.md](backlog-archive/BACKLOG-001-100.md)

## 44. CLOSED 2026-08-29 — both halves: the backfill, and the `§NN` fragment

Archived: [backlog-archive/BACKLOG-001-100.md](backlog-archive/BACKLOG-001-100.md)

## 45. CLOSED 2026-08-29 — a `Governs:` path that names nothing is now reported

Archived: [backlog-archive/BACKLOG-001-100.md](backlog-archive/BACKLOG-001-100.md)

## 46. CLOSED 2026-08-28 — an acceptance fence that passed when its runner never started

Archived: [backlog-archive/BACKLOG-001-100.md](backlog-archive/BACKLOG-001-100.md)

## 47. CLOSED 2026-08-29 — the writer emitted a width no reader accepted

Archived: [backlog-archive/BACKLOG-001-100.md](backlog-archive/BACKLOG-001-100.md)

## 48. CLOSED 2026-08-29 — `work-next` called a Proposed record's tasks ready

Archived: [backlog-archive/BACKLOG-001-100.md](backlog-archive/BACKLOG-001-100.md)

## 50. CLOSED 2026-08-29 — the forwarder asks what is installed, and falls back to the cache

Archived: [backlog-archive/BACKLOG-001-100.md](backlog-archive/BACKLOG-001-100.md)

## 51. CLOSED 2026-08-29 — a forwarder that could not run the gate reported a pass

Archived: [backlog-archive/BACKLOG-001-100.md](backlog-archive/BACKLOG-001-100.md)

## 49. DECLINED 2026-09-24 — a Windows run of `lifecycle.test.mjs` failed once, naming no test

Archived: [backlog-archive/BACKLOG-001-100.md](backlog-archive/BACKLOG-001-100.md)

## 52. CLOSED 2026-08-29 — a step-1 check that read the sentence instead of the step, found by Desktop

Archived: [backlog-archive/BACKLOG-001-100.md](backlog-archive/BACKLOG-001-100.md)

## 53. CLOSED 2026-09-02 — a task could cite a gate whose universe does not contain the thing it claims is enforced

Archived: [backlog-archive/BACKLOG-001-100.md](backlog-archive/BACKLOG-001-100.md)

## 54. CLOSED 2026-08-29 — the recorded failure block could contain none of the failure

Archived: [backlog-archive/BACKLOG-001-100.md](backlog-archive/BACKLOG-001-100.md)

## 55. CLOSED 2026-08-29 — a corpus the reader could not open, reported as a corpus with nothing in it

Archived: [backlog-archive/BACKLOG-001-100.md](backlog-archive/BACKLOG-001-100.md)

## 56. CLOSED 2026-08-29 — a PHP repository was told its check was a vite build

Archived: [backlog-archive/BACKLOG-001-100.md](backlog-archive/BACKLOG-001-100.md)

## 57. CLOSED 2026-08-29 — the tests-exist check could not see a BDD test, and could be satisfied by a comment

Archived: [backlog-archive/BACKLOG-001-100.md](backlog-archive/BACKLOG-001-100.md)

## 58. CLOSED 2026-08-29 — two readers of one evidence grammar disagreed about what `done` means

Archived: [backlog-archive/BACKLOG-001-100.md](backlog-archive/BACKLOG-001-100.md)

## 59. CLOSED 2026-08-29 — a correctly-identified check that is red on an unmodified tree

Archived: [backlog-archive/BACKLOG-001-100.md](backlog-archive/BACKLOG-001-100.md)

## 60. CLOSED 2026-09-07 (shipped as ADR-014) — a task that is honestly blocked has no state, and a rejection pointed at the wrong end of the row

Archived: [backlog-archive/BACKLOG-001-100.md](backlog-archive/BACKLOG-001-100.md)

## 61. CLOSED 2026-09-02 — a task file could name a symbol the code does not have

Archived: [backlog-archive/BACKLOG-001-100.md](backlog-archive/BACKLOG-001-100.md)

## 62. CLOSED 2026-08-29 — `work-next` offered an ARCHIVE as the next thing to do

Archived: [backlog-archive/BACKLOG-001-100.md](backlog-archive/BACKLOG-001-100.md)

## 63. WITHDRAWN — a surviving mutant exits 1, and this entry was filed without reproducing it

Archived: [backlog-archive/BACKLOG-001-100.md](backlog-archive/BACKLOG-001-100.md)

## 64. CLOSED 2026-08-29 — `adr-next` answered for an undecided record without saying so

Archived: [backlog-archive/BACKLOG-001-100.md](backlog-archive/BACKLOG-001-100.md)

## 65. PARTLY CLOSED — acceptance passed on files `.gitignore` kept out of the commit

**Reported 2026-08-29 by the go-session-85 session.** A `.gitignore` holding the bare pattern
`cross-agent-chat` — meant for the root build artifact — also matched `cmd/cross-agent-chat/`, because
a git pattern with no slash matches at any depth and matches directories. The task's Verification Log
records exit 0 for an acceptance block that included `test -f cmd/cross-agent-chat/main.go`. It ran
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
`cross-agent-chat` matches at any depth" is the sentence that saves the investigation).

### CLOSED 2026-08-29, for the ignored subset

`adr-lint` now reports it. For a task carrying a passing exit-0 entry, every path its Affected Files
name is passed to `git check-ignore -v --stdin`, and any that git ignores is advised with **the
pattern that matched**:

    advice: T1.md: Affected Files names `cmd/thing/main.go`, and git IGNORES it (pattern `thing`).
    This task's acceptance passed against the worktree, so the evidence is real and the file is not
    in the commit — a clean clone does not have it. A pattern with no slash matches at every depth
    and matches directories; anchor it (`/thing`) if it was meant for one place.

Naming the pattern is the point: *"the bare pattern `cross-agent-chat` matches at any depth"* is the
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
  `cross-agent-chat` pattern, `cmd/` absent from the checkout — produces the advice for both
  `main.go` and `main_test.go`, naming the pattern. On the fixed tree (anchored `/cross-agent-chat`,
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

Archived: [backlog-archive/BACKLOG-001-100.md](backlog-archive/BACKLOG-001-100.md)

## 67. CLOSED 2026-08-29 — the comment-only guard refused a build tag

Archived: [backlog-archive/BACKLOG-001-100.md](backlog-archive/BACKLOG-001-100.md)

## 68. CLOSED 2026-08-29 — the commonest correct state was reported as a failure

Archived: [backlog-archive/BACKLOG-001-100.md](backlog-archive/BACKLOG-001-100.md)

## 69. CLOSED 2026-08-29 — three checks in one gate disagreed about "passing evidence"

Archived: [backlog-archive/BACKLOG-001-100.md](backlog-archive/BACKLOG-001-100.md)

## 70. CLOSED 2026-08-29 — the verdict stopped being evicted and started being buried

Archived: [backlog-archive/BACKLOG-001-100.md](backlog-archive/BACKLOG-001-100.md)

## 71. CLOSED 2026-08-29 — a mutant that removes tests, and the false kill found beside it

Archived: [backlog-archive/BACKLOG-001-100.md](backlog-archive/BACKLOG-001-100.md)

## 72. CLOSED 2026-08-29 — the fold counted what survived the tail, not what happened

Archived: [backlog-archive/BACKLOG-001-100.md](backlog-archive/BACKLOG-001-100.md)

## 73. CLOSED 2026-08-29 — the honest label bought silence

Archived: [backlog-archive/BACKLOG-001-100.md](backlog-archive/BACKLOG-001-100.md)

## 74. CLOSED 2026-09-07 (shipped as ADR-013) — a mutation a human performed has nowhere to be recorded

Archived: [backlog-archive/BACKLOG-001-100.md](backlog-archive/BACKLOG-001-100.md)

## 75. CLOSED 2026-08-29 — the right column of the wrong table

Archived: [backlog-archive/BACKLOG-001-100.md](backlog-archive/BACKLOG-001-100.md)

## 76. CLOSED 2026-09-02 — `Enforced-by:` split on comma, and 80 of 345 mutation labels contained one

Archived: [backlog-archive/BACKLOG-001-100.md](backlog-archive/BACKLOG-001-100.md)

## 77. DECLINED 2026-09-24 — The backtracking fix has a regression test and no catalogue mutation

Archived: [backlog-archive/BACKLOG-001-100.md](backlog-archive/BACKLOG-001-100.md)

## 78. CLOSED 2026-09-02 — `! grep` cannot fail a `set -e` fence, and that is the idiom the vacuity guard is written in

Archived: [backlog-archive/BACKLOG-001-100.md](backlog-archive/BACKLOG-001-100.md)

## 79. CLOSED 2026-09-01 by ADR-016 — the mutant classifier cannot tell a vacuous fence from a kill whose signal is "no tests ran"

Archived: [backlog-archive/BACKLOG-001-100.md](backlog-archive/BACKLOG-001-100.md)

## 80. CLOSED 2026-09-02 — a contract test that asserted words appear, not that a document says the right thing

Archived: [backlog-archive/BACKLOG-001-100.md](backlog-archive/BACKLOG-001-100.md)

## 81. CLOSED 2026-09-24 — The same ReDoS class, written twice in one day, the second time after being told

Archived: [backlog-archive/BACKLOG-001-100.md](backlog-archive/BACKLOG-001-100.md)

## 82. CLOSED 2026-09-02 by ADR-024 — `BROKEN` was the wrong word for "the target is in another repository"

Archived: [backlog-archive/BACKLOG-001-100.md](backlog-archive/BACKLOG-001-100.md)

## 83. CLOSED 2026-09-02 by ADR-024 — a task waiting on a DECISION nobody has made had no header, and rotted silently

Archived: [backlog-archive/BACKLOG-001-100.md](backlog-archive/BACKLOG-001-100.md)

## 84. CLOSED 2026-09-24 — `partial` does not catch the vacuous-fence class, and I said it did

Archived: [backlog-archive/BACKLOG-001-100.md](backlog-archive/BACKLOG-001-100.md)

## 85. CLOSED 2026-09-24 — Two adr-debt and adr-lint messages that are true and unactionable

Archived: [backlog-archive/BACKLOG-001-100.md](backlog-archive/BACKLOG-001-100.md)

## 86. CLOSED 2026-09-24 — Desktop 1.40609.0 re-observed: tools arrive, server instructions do not

Archived: [backlog-archive/BACKLOG-001-100.md](backlog-archive/BACKLOG-001-100.md)

## 87. CLOSED 2026-09-02 — eleven adr-retire-check findings asserted nothing

Archived: [backlog-archive/BACKLOG-001-100.md](backlog-archive/BACKLOG-001-100.md)

## 88. CLOSED 2026-09-01 — bare `python3` is a decoy on stock Windows, and 18 sites still spawn it

Archived: [backlog-archive/BACKLOG-001-100.md](backlog-archive/BACKLOG-001-100.md)

## 89. CLOSED 2026-10-12 (was PARTLY CLOSED 2026-08-30) — `.gitattributes` pinned `*.mjs` but not `*.js`, and six more extensions go CRLF

Archived: [backlog-archive/BACKLOG-001-100.md](backlog-archive/BACKLOG-001-100.md)

## 90. CLOSED 2026-09-01 — `Path.is_absolute()` was False for a rooted path on Windows, and three sites joined it to cwd

Archived: [backlog-archive/BACKLOG-001-100.md](backlog-archive/BACKLOG-001-100.md)

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

Archived: [backlog-archive/BACKLOG-001-100.md](backlog-archive/BACKLOG-001-100.md)

## 93. PARTLY CLOSED 2026-09-02 — nothing recorded which Python answered; the probe keeps the full version now, and no consumer reads it

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

**PARTLY CLOSED 2026-09-02 by `ef5b1a7`, and this entry did not say so for a day.** The probe
half exists: `PYTHON_PROBE` is now `import sys;print("%d.%d" % sys.version_info[:2])`
(`plugin/scripts/lifecycle.mjs:2075`), the full answer is kept, and `probedPythonVersion()`
exposes it (`:2118`). A defect found while testing that change is the part worth keeping — after
a FAILED resolve the accessor still returned the PREVIOUS run's version, so a caller recording
"which Python answered" would have recorded one that did not run. It is cleared at entry,
asserted in both directions at `tests/lifecycle.test.mjs:1669` and `:1679`, and carried as a
catalogue mutation.

**What is still open is the consumer, which was always the whole value.** Nothing writes the
interpreter identity into tool-written evidence, so a 3.10-vs-3.14 divergence still cannot show
up in a Verification Log. The paragraph above stands as the reasoning that deferred it; it stops
being true only about the probe.

**Why this correction is its own finding.** `ef5b1a7`'s subject line says "§93 delivered" and the
commit added 38 lines to this file — all of them to §87. A session reading §93 was told to build
what was already built. That is the §103 class inverted: not a record asserting a live defect the
code has fixed, but a record asserting a live GAP the code has closed — and it is the tenth
instance, after §111's ninth. §103's anchor check would not have caught it either, for the same
reason it would not have caught §111: this entry quoted no `file:line` snippet to go stale. It
asserted an ABSENCE, and nothing checks that a commit claiming to deliver a backlog item touched
that item's section. Found 2026-09-03 while re-pointing a drifted memory anchor at
`lifecycle.mjs:2104` — by a memory sweep, not by any gate in this repository.

## 94. CLOSED 2026-09-01 — a missing `node` is reported as a missing plugin, and the advice does not help

Archived: [backlog-archive/BACKLOG-001-100.md](backlog-archive/BACKLOG-001-100.md)

## 95. CLOSED 2026-10-12 (was PARTLY CLOSED 2026-09-01) — an orphan under the home directory is a different mechanism from a drifted copy, and neither scanner has one

Archived: [backlog-archive/BACKLOG-001-100.md](backlog-archive/BACKLOG-001-100.md)

## 96. CLOSED 2026-10-12 (was PARTLY CLOSED 2026-09-01) — `SHADOW_SCOPE` was hand-listed, and two home workflow files were drifted where nothing looks

Archived: [backlog-archive/BACKLOG-001-100.md](backlog-archive/BACKLOG-001-100.md)

## 97. CLOSED 2026-09-02 — the candidate was measured and its own falsifier fired

Archived: [backlog-archive/BACKLOG-001-100.md](backlog-archive/BACKLOG-001-100.md)

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

Archived: [backlog-archive/BACKLOG-001-100.md](backlog-archive/BACKLOG-001-100.md)

## 100. CLOSED 2026-09-01 — `gitBranch()` was dead code from the branch guard that was removed

Archived: [backlog-archive/BACKLOG-001-100.md](backlog-archive/BACKLOG-001-100.md)

## 101. CLOSED 2026-09-01 by ADR-021 T1 — a Verification Log row deleted from a committed file was invisible

Archived: [backlog-archive/BACKLOG-101-200.md](backlog-archive/BACKLOG-101-200.md)

## 102. CLOSED 2026-09-02 — a mutant that did not PARSE counted as noticed, and only the parser noticed it

Archived: [backlog-archive/BACKLOG-101-200.md](backlog-archive/BACKLOG-101-200.md)

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
quoted snippet is checkable the way team-memory's code anchors are — the snippet is present or it
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
pinning a record to a verbatim snippet, team-memory-style, so a snippet that leaves the tree
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

**A THIRD DIRECTION EXISTS AND IS NOW INSTRUMENTED — 2026-09-03, `scripts/backlog-claim-sweep.mjs`.**
The tenth instance (§93) was neither of the two directions above. `ef5b1a7`'s own subject said
"BACKLOG §87 CLOSED and §93 delivered", it added 38 lines to this file, and every one of them
went to §87 — so the record asserted a live GAP the code had already closed, and the commit
that closed it SAID SO in a place nothing compares against the diff.

That needs no anchor, which is why it is buildable where the mechanism above was not: the
message already names the section, so the check reads the name and asks whether the diff
reached that section's line range. Nothing has to be maintained for it to keep working, and its
universe is not empty — 193 commits touch this file, 59 carry a section claim, 10 do not edit
what they claim.

**Three thresholds, each measured on this repository rather than chosen**, and each one wrong
in a way that would have mattered:

- Both claim directions are kept. The corpus writes 62 section-then-claim (`§93 delivered`)
  against 9 the other way — but one of the nine is `ef5b1a7` itself, so the tidier
  one-direction rule would have dropped the instance the check exists for.
- A sentence boundary separates a claim from commentary. Without it the sweep reported its own
  author's commit as claiming §87 and §103, from lines that merely discuss them.
- `§` is not owned by this file. `eeb2c7c` was reported for §4 because its body ends
  "CLAUDE.md §4"; resolving that here compares a claim against a file it was never about.

**It reports and never blocks, and an absent section is `COULD NOT LOOK` rather than a cleared
claim** — the ADR-005 distinction, in the one place a sweep is most tempted to collapse it.
`tests/backlog-claim-sweep.test.mjs` drives it end to end through `git` on a scratch repository,
because the logic passing in isolation is not the boundary the report came through (CLAUDE.md
§4). Three catalogue mutations carry it, all RED.

**The anchor count is still one and this does not change it.** A different mechanism answering a
different question is not evidence for the one that was declined, and the re-open condition
above stands untouched.

## 104. CLOSED 2026-09-02 — `gh run watch --exit-status` exits 0 on a CANCELLED run, and a push cancels the run you are releasing on

Archived: [backlog-archive/BACKLOG-101-200.md](backlog-archive/BACKLOG-101-200.md)

## 105. PARTLY CLOSED 2026-09-02 — every shipped skill is statically reachable and nine of thirteen have no eval that runs them

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

⚠ **THE TABLE ABOVE IS WRONG, AND THAT IS THE MORE USEFUL FINDING. Corrected 2026-09-04 by
ADR-032.** It says `review` has **0** cases and `execution` has **1**. A grep over the same
directories on 2026-09-04 says `review` has one — `a-vacuous-test-is-not-a-review`, whose own grader
calls it "the question `review` exists for" — and `execution` none.

**Two methods, two answers, and neither was authoritative, because NOTHING IN THE CORPUS DECLARED THE
MAPPING.** §105 counted by a method it did not record. A grep counts textual mentions, which credits a
skill for being name-dropped in a comment and misses `done-needs-tool-written-evidence`, whose subject
— `adr-execute` — is never named in the case at all. This is this project's own defect class turned on
its eval suite: a coverage claim that nothing computes.

ADR-032 makes each case declare its subject in `tags:`, which the runner honours (verified: a case
tagged `skill-review` is selected by `--tag skill-review` and rejected by `--tag zzz-nonexistent`), and
`tests/evals.test.mjs` computes the report. **Measured 2026-09-04, from the declarations:**

| bucket | count | |
|---|---|---|
| skills exercised | **3** | `adr-execute`, `adr-write`, `review` |
| skills with no case | **11** | `adr-retire`, `arch-write`, `codex-advise`, `codex-review`, `execution`, `mutation-audit`, `operating`, `postmortem`, `quality-policy`, `spec-write`, **`work`** |
| cases declaring no subject | **5** | the two A/B pairs and `gates-advise-never-block` |

**The honest number is WORSE than the one this entry filed** — three of fourteen, not four of thirteen
— and `work`, the router the whole lifecycle enters through, is among the uncovered. §105 credited it
with six cases; five of those are A/B arms measuring an INSTRUCTION rather than a skill invocation, and
they now declare `skill-unattributed` rather than being counted as coverage of `work`.

**What stays open here** is what §105 was actually about and ADR-032 deliberately did not decide:
writing cases for the eleven, and a Trigger grader that asserts WHICH skill fired. Every case's
Trigger grader today is `type: tool_used, tool: Skill` — it cannot tell the router sending the model to
the right skill from it sending the model to the wrong one, which is exactly the routing claim the
paragraph below says is untested. Whether the runner can express that was not established.

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


---

**PARTLY CLOSED 2026-09-02. One case written, run once, and it returned a NEGATIVE result that
changes what the remaining eight cost.**

`review` was the right first target — `work` routes a whole risk tier to it and no eval had ever
observed that route. The case asks whether a clean-only assertion would notice a broken subject,
which is the one distinction `review`'s own description draws: answerable by READING, so a review
answers it, and claiming to have MEASURED it is the failure.

    a-vacuous-test-is-not-a-review   with 1.00   without 1.00   Δ 0.00   $0.36
      invokes-a-skill: Skill called 0x (expected 1..∞)

**Two facts, and both are about the method rather than this case:**

- **The skill never fired.** Zero `Skill` calls in the plugin arm. The `tool_used` indicator caught
  it on the first run — and it exists precisely because that absence had been invisible before,
  where thirteen sandboxes reported `skill_calls=0` and nothing said so.
- **The base model scores 1.00 unaided.** There is no headroom on a prompt this direct, so even a
  firing skill could not have produced a Δ.

**What that means for the other eight, stated before anyone spends the money:** the cost of §105 is
not $0.36 a case. It is that a naive case measures nothing — the model already answers well, and the
skill does not trigger on a well-posed question. A case that discriminates has to find a prompt
where the base model is genuinely worse, which is a research task per skill rather than a writing
task. **Writing eight more like this one would produce eight Δ 0.00 rows and a false sense of
coverage.**

**The finding is kept and the case is kept**, red indicator and all, because a case that reports
"the skill did not fire" is more useful than no case: it is the only thing that would notice if
`review` stopped being reachable.

**Still open:** eight skills, and the harder question this run surfaced — what a case has to look
like for a lifecycle skill to fire at all, and where these skills are actually better than the base
model. Neither is answered by writing more prompts of this shape.

**A leak found by running it**, unrelated to the score and worth more than it: `claude plugin eval .`
writes `./evals/results/` at the repository ROOT, and `.gitignore` only covered
`plugin/evals/results/` — the rule moved with the plugin under ADR-008 and the path the TOOL writes
to was left unignored. It showed as `?? evals/`, one `git add -A` from committing transcripts.
Both paths are ignored now, and `tests/package.test.mjs::every path an eval run writes to is
ignored` asks **git** rather than reading the file, and is shown capable of the other answer.

## 106. CLOSED 2026-09-02 — mutation shards were sliced by index, so the slowest carried 53% more than the fastest

Archived: [backlog-archive/BACKLOG-101-200.md](backlog-archive/BACKLOG-101-200.md)

## 107. CLOSED 2026-09-24 — `(external: <where>: …)` takes free text, so the owner of a cross-repo target is unsearchable

Archived: [backlog-archive/BACKLOG-101-200.md](backlog-archive/BACKLOG-101-200.md)

## 108. PARTLY CLOSED 2026-09-02 — `adr-write` prescribed eight serial round trips before a word was drafted, and never said they could be batched

**Reported 2026-09-02 by a second user running the lifecycle on their own project** (`brolis-lizdai`),
in wall-clock terms: *"jis kazkaip neefektyviai ta ADR vykdo, ten labai labai daug laiko sugaistama,
laike matuojant"* — it executes the ADR inefficiently, a great deal of time is lost, measured in
time. Specifically the authoring: *"labaaaai ilgai generuoja tuos adr pirmoj vietoj."*

The counter-argument was made in the same conversation and accepted — quality takes time — so this
entry is not "make it fast". It is that a measurable part of the cost buys nothing.

**MEASURED, and the measurement moves the target.** The six commands `adr-write` tells an author to
run before drafting, on this corpus:

    six calls, serial          1.87s
    six calls, one round trip  1.34s

**Half a second.** The compute is not the cost. What costs is that the skill lists them as separate
steps, and each separate step is a model TURN — think, call, read the result, think again. Six to
eight turns before a word is written, at tens of seconds each, is where the minutes go, and the
skill says nothing about batching them.

**The user's own agent found the fix unprompted**, which is the strongest evidence it is a gap in the
instructions rather than in the reader. From the same transcript:

    ● Fair correction, and I'd drifted — I've been doing one Edit per hunk with separate test
      runs. Adopting the batched form: plan the whole edit set up front, then write +
      regenerate + test chained in one command.

    T=docs/adr/ADR-029-…/tasks/T4-….md   # then every command in one call, on $T

The observer's comment was *"man sitas patiko jo metodas"* — I liked this method of his. An agent
had to discover, mid-task and after being corrected, a working pattern the skill could simply have
stated.

**What this entry is NOT.** It is not a case for shortening the record, dropping a section, or
loosening the evidence chain — the time that produces a fence, a Tests table and a Stop Condition is
the time this project exists to spend. It is only about the turns spent BEFORE that, on reads whose
results are independent of each other.

**The shape of a fix**, not a decision: the pre-draft reads in `adr-write` step 1 are independent —
`adr-state`, `adr-context`, `adr-debt`, and three templates — and nothing about them requires
separate turns. Saying so in the skill, with the `T=<file>` chaining form the reporter's agent
arrived at, costs one paragraph. Whether the same applies to `adr-execute` and `arch-write` is
unmeasured and should be measured before it is claimed.

**Open questions a record would have to answer:** whether turn count is actually the dominant term
(this entry measured only that COMPUTE is not, which is not the same thing); whether a batched read
degrades the author's attention to what each command returned; and whether any of these six can be
dropped rather than merely batched, which would be worth more than batching them.

---

**PARTLY CLOSED 2026-09-02 — the teaching half, which is the half that was missing.**

`adr-write` now states that its pre-draft reads are independent and shows the chained form;
`adr-execute` names the task file once (`T=<path>`) and chains the check with the evidence run. Both
carry the measurement, so the next reader knows the compute was never the cost.

**Two things are deliberately excluded from the chaining advice**, and they are why this is teaching
rather than a speed tip:

- **The Red step.** Seeing a test fail is an OBSERVATION, and a chain that runs red-then-green hides
  the only thing that step exists for.
- **A commit after a check.** `<check> ; git commit` reports the COMMIT's status, and `&&` is right
  only if someone reads the result. Both spellings have put a red tree on `main` here — the second
  on 2026-09-02, by printing `selftest exit=1` and committing anyway.

**Asserted as a ROLE, not as wording** (§80): `tests/skill-contract.test.mjs::the authoring skills
teach a batched form, and it stays runnable` requires a runnable chained example to exist and both
exclusions to be stated. Rewording stays free; deleting the example does not. Shown capable of
failing by removing it.

**No dependency on any personal tool.** The instruction is a plain shell chain, because the plugin
ships to people who do not have this machine's helpers — `tests/package.test.mjs::the publishable
plugin has no dependency on a personal install` is the rule, and naming a local tool in a shipped
skill would break it.

**Still open:** whether turn count is actually the dominant term. This closes the half needing no
measurement — an agent should not have to discover batching mid-task — and leaves the half that
does. §110 rests on the same unmeasured claim and should not start before it exists.

---

**⚠ CORRECTION 2026-09-02, same day: "the compute is not the cost" was measured on ONE corpus and
generalised, and the reporter has counter-evidence.**

Later the same day: *"jis jau vel pusvalandi serve su 40 core ir 16gb ram validuoja adr … node 100%
maciau"* — half an hour on a 40-core, 16GB server, with `node` observed pegged at 100%. My 1.87s
figure came from this repository's 26-record corpus and says nothing about theirs. **A measurement
taken on one corpus is not a property of the tool**, which is the error this corpus exists to catch,
committed here in the entry that measured it.

**Reproduction ATTEMPTED and it does not reproduce.** Stated as an attempt rather than a result,
because a sweep that found nothing is "I could not look", not "the thing is absent":

    60 records x 8 tasks (480 task files), synthetic:
      adr-state.mjs                            0.1s
      work-next.mjs                            0.2s
      adr-lint on one record                  0.25s
      PostToolUse hook, one edit to a task    0.45s
      hook overhead alone (20 runs)            64ms each, of which 23ms is bare node start

Corpus SIZE is not it. Nothing here reaches minutes, let alone thirty of them.

**What the shape of the hooks does establish**, and it is worth knowing regardless: every
`Bash|Edit|Write|MultiEdit|NotebookEdit` fires a node process on `PreToolUse`, and every
`Edit|Write|MultiEdit|NotebookEdit` fires **two more** on `PostToolUse` — up to three node starts per
tool call, each re-parsing a 3,184-line `lifecycle.mjs`. That is ~0.6s per edit to an ADR task file
once validation is included. It is a real per-edit tax and it is NOT thirty minutes.

**So the cause is in their tree or their session, and guessing further from here would be inventing
an observation.** What would settle it, in order of cost: the output of `time node
"$CLAUDE_PLUGIN_ROOT/scripts/work-next.mjs"` on their corpus; `node --cpu-prof` on whichever command
is running when they see 100%; and the record count plus the largest single task file. One
pathological INPUT is the likeliest remaining explanation — this corpus has already had two
catastrophic-backtracking regexes (§77, §81), and a ReDoS is invisible to a size test because it
needs the specific text, not more of it.

**ANSWERED 2026-09-02 by the reporter's own screenshot, and it is not this tooling.** Their session
transcript shows the run that was pegging the machine:

    go test ./...
      FAIL  …/brolis-lizdai/internal/web        43.837s
      ok    …/internal/web/assets                0.020s
      ok    …/migrations                        (cached)

**43.8 seconds is THEIR test suite**, in one package, and the `node` process at 100% is Claude Code
itself — the session header reads `Fermenting… (1h 23m 19s · ↓ 243.0k tokens)`. Neither is a
quality-harness script. My reproduction found nothing because it was measuring the wrong thing, and
I would have gone on measuring it: the observer's first guess was right and mine was not —
*"testus leidzia matyt, pasidarė kokį žvėrišką suite"*.

**What IS ours, and it is the actionable half.** This lifecycle prescribes running the check
repeatedly per task — red, then green, then `adr-verify` runs the fence AGAIN to record it — so a
43.8s suite is paid three times for one task, and every task in the wave pays it. That is minutes
per task, from a fence nobody scoped.

**The task template already says the fence must be narrow enough to prove THIS task and wide enough
to catch regressions, and gives the two-command form for it.** What it does NOT say is that a
whole-repository default is a per-task cost multiplied by three. Their own output shows the
scoping is available and unused: `internal/web` is 43.8s while `assets` is 0.020s and `migrations`
is cached.

**Filed as the concrete next step rather than fixed here**, because the fix belongs in a corpus with
a slow suite and this one's is 26 seconds: teach the fence to name the package it changed, and say
in `adr-execute` that the Acceptance fence is run at least twice per task by design, so its cost is
multiplied and not paid once.

## 109. CLOSED 2026-09-02 — a commit taken mid-mutation captures a neutered gate, and nothing looked

Archived: [backlog-archive/BACKLOG-101-200.md](backlog-archive/BACKLOG-101-200.md)

## 110. DECLINED 2026-09-24 — Should a task be edited through a tool rather than rewritten as a file?

Archived: [backlog-archive/BACKLOG-101-200.md](backlog-archive/BACKLOG-101-200.md)

## 111. CLOSED 2026-09-07 (shipped as ADR-025) — the shipped gate re-runs a fence the caller just ran, and a merge removes it

Archived: [backlog-archive/BACKLOG-101-200.md](backlog-archive/BACKLOG-101-200.md)

## 112. PARTLY CLOSED 2026-09-03 — the tutorial transcripts were hand-copied and nothing re-checked them; the outcomes are checked now, the translation is not

**Filed 2026-09-03 with ADR-026.** `docs/TUTORIALS.md` shows real terminal output —
every line was produced by running the commands against a throwaway repository, and
that was a deliberate choice over illustrative transcripts, because a tutorial whose
output was written by hand is a fabricated verification log with a different file
extension.

**But it was copied in by a human, and nothing checks it again.** When `adr-verify`
changes a message, the tutorial goes stale silently and reads exactly as it does now.
That is the same shape as §103 — prose asserting a behaviour the code no longer has —
and it is filed rather than fixed because the cheap version of the fix is worse than
the gap:

- Asserting the exact strings would break on every wording change, and this project
  edits gate messages often and deliberately. A check that fails for the right reason
  too often gets deleted.
- The property that matters is the OUTCOMES — `mutant killed` for a real test,
  `NOT evidence` for one that cannot fail — not the prose around them. ADR-026's
  pre-registered criterion pins those two, and a human re-runs the walkthrough after
  a release.

**What a real fix would look like:** execute the tutorial's setup in a temp directory
during the suite and assert the two outcomes appear, ignoring surrounding prose. That
is an integration test of the new-user path, which this repository does not have and
would benefit from beyond the tutorial.

**PARTLY CLOSED 2026-09-03 — the fix described above was built, as `tests/tutorial.test.mjs`.**
It replays the walkthrough in a temp repository and asserts the two outcomes, ignoring the
prose around them: `mutant killed` with exit 0 against the real assertion, `NOT evidence`
with exit 1 against the weakened one.

**Nothing in it is restated from the page, which is the part that makes it hold.** Both
heredoc payloads, the task file, the task's path and the `--mutant` arguments are parsed out
of `docs/TUTORIALS.md` at run time, anchored on the heredoc openers rather than on fence
indexes. A copy of the tutorial's code kept beside the tutorial would be the same defect one
level down — the hand-written list this project keeps refusing.

**The two halves are each other's vacuity proof, in one test.** The SAME command reports
`mutant killed` against a load-bearing assertion and `NOT evidence` against one that cannot
fail, so a check able only to report clean would pass the first half and be incapable of the
second. Shown red rather than assumed: no-op the weakening and the run exits 1. Two catalogue
mutations carry it — `sys.exit(0 if verdict == "killed" else 1)` to `sys.exit(0)`, and the
`survived` verdict to `killed` — both RED against `tests/tutorial.test.mjs`.

**The page's `mkdir /tmp/qh-tutorial` is deliberately NOT replayed.** A literal temp path is
an assertion about the operating system (CLAUDE.md §7), and the directory is the one thing a
reader substitutes anyway. Everything else runs as written.

**Still open: the wording.** This checks the two outcomes, not the surrounding transcript, so
a gate that changes its explanation still goes stale on the page silently. That was the
deliberate trade — asserting exact strings breaks on every wording change and a check that
fails for the right reason too often gets deleted — and it is restated here so the residue is
not mistaken for coverage.

**The residue fired, and it took eight days. Measured 2026-09-04** while running ADR-026's
pre-registered criterion against v2.60.0 on a clean clone of 8f2a083. Both outcomes appeared, so
`tests/tutorial.test.mjs` was green and the criterion PASSED — and the page was stale anyway, in
exactly the way the paragraph above says it can be:

- Tutorial 2's first transcript did not show the second `## Verification Log` entry that **ADR-025**
  made every `--mutant` run write. ADR-025 landed after the page was copied in; the tutorial has
  been showing a truncated run ever since.
- Tutorial 2's second transcript showed only the `[adr-verify] NOT evidence:` paragraph, not the
  `mutant survived · exit 0` row above it — so the sentence "the `exit 0` in the row above" pointed
  at a row the page did not print. The page was not merely stale, it was internally incoherent, and
  a reader following it would have been the one to notice.

Both are re-recorded now from a real run. **What this says about the trade is not that it was
wrong.** The outcome check did its job — it is why anyone looked — and an exact-string assertion
would have gone red on the ADR-025 wording change and been edited to match without anyone reading
the page. What is missing is cheaper than either: nothing compares the number of `[adr-verify]`
lines the tool emits against the number the page shows. A count is not a wording assertion, it
does not break on prose, and it would have caught both of these on the day ADR-025 landed. That is
the shape to build if this is picked up.
**Also deferred here:** translating the front page. Raised because the first reader
report that led to ADR-026 came from a non-native English speaker, and "too technical"
and "not in my language" are different problems that were easy to conflate.

## 113. CLOSED 2026-09-04 by ADR-031 — no gate answered `--version`, and the sibling this entry proposed was the wrong shape

Archived: [backlog-archive/BACKLOG-101-200.md](backlog-archive/BACKLOG-101-200.md)

## 114. DECLINED 2026-09-24 — Does an intermediate plan layer actually help a weak executor, or only shape its failures?

Archived: [backlog-archive/BACKLOG-101-200.md](backlog-archive/BACKLOG-101-200.md)

## 115. The host surfaces this plugin does not stand on — PARTLY CLOSED 2026-09-04 (ADR-030)

**Closed:** named agent definitions. `plugin/agents/` ships four namespaced roles, so a skill can
address one by `subagent_type` (ADR-030 T1). Still open below: `permissionMode`, `maxTurns`,
`memory`, `isolation`, the three unused plain-stdout events, `statusLine`, `outputStyle`,
`permissions`, headless `-p --output-format json`, and MCP elicitation. The veto note at the end
of this entry is unchanged and is still not a gap.

**Filed 2026-09-03 with ADR-029**, from running a peer session's harness audit of `team-memory`
("Where Memory Plugs In", 2026-09-03) against this repository instead. That audit found its own
project shipping no plugin, no marketplace entry and no skills; this one ships all three, fourteen
skills and an MCP server. Level on exactly one axis, and behind on several others.

**Measured here, 2026-09-03.** `plugin/hooks/hooks.json` registers seven events — `SessionStart`,
`UserPromptSubmit`-adjacent none, `PreToolUse`, `PostToolUse`, `SubagentStart`, `SubagentStop`,
`Stop`, `TaskCompleted` — against the set documented on `code.claude.com/docs/en/hooks`.

⚠ **THAT DENOMINATOR IS DELIBERATELY NOT A NUMBER, and it used to be one.** This entry said "roughly
thirty-two … the peer's page says thirty-four", which was two undefensible figures presented as a
range. Settled 2026-09-04 with the peer who published the 34: theirs is 33 named events in their own
hand-maintained table plus one they noticed the table was missing, from a table whose own comment
admits it goes stale — and it had. Mine came from the RENDERED page, which TRUNCATES; the plain-text
source is `code.claude.com/docs/en/hooks.md`, and `code.claude.com/docs/llms.txt` is the full-text
source the page itself points at. Neither of us fetched it.

**So the honest published form is a pointer to the source, not a figure** — which is the same rule
ADR-027 applies to skills and gates, arriving here from the other direction. If a count is needed,
derive it from `llms.txt` and say which page and which date.

**What is genuinely unused, and what is a decision rather than a gap:**

- **`plugin/agents/` does not exist**, so `permissionMode`, `maxTurns`, `memory`, `isolation` and
  per-agent hooks are all at their defaults. ADR-029 takes only `model`/`effort` at the call sites;
  named definitions and the remaining knobs are here.
- **Three of the four events whose PLAIN STDOUT reaches the model are unused** —
  `UserPromptSubmit`, `UserPromptExpansion`, `PostModelSwitch`. We use `SessionStart` only.
  `UserPromptExpansion` is the earliest moment the work is known, which matters unusually much for a
  plugin that IS the lifecycle router.
- **`statusLine`, `outputStyle`, `permissions`, and headless `-p --output-format json`** — no
  integration at all. Headless is the surface an unattended run literally needs.
- **MCP elicitation** — the server can ask the operator mid-task. The natural use here is not
  "ask before writing" but **ask before releasing**, which a human performed by hand four times in
  one session on 2026-09-03.

⚠ **NOT A GAP, and it must not be filed as one.** This plugin sits on four veto-capable events
(`PreToolUse`, `Stop`, `SubagentStop`, `TaskCompleted`) and **never exits 2**. That is CLAUDE.md §3 —
gates instruct, they never block — and the peer's audit frames the veto surface as "the enforcement
surface" precisely because their project does use it. Any proposal here that reaches for exit 2 is
proposing to reverse a founding decision, and owes that argument rather than a line item.

**Also deferred here:** any routing decision made from ADR-029's declared role.


## 116. CLOSED 2026-09-04 by ADR-028 T3 — `adr-verify --steps` was UNCHECKED, not merely unrecorded, on three paths

Archived: [backlog-archive/BACKLOG-101-200.md](backlog-archive/BACKLOG-101-200.md)

## 117. CLOSED 2026-09-04 — a noun in an honest sign-off was read as a verdict, and the opposite hole was open beside it

Archived: [backlog-archive/BACKLOG-101-200.md](backlog-archive/BACKLOG-101-200.md)

## 118. Reachability rules exist for Go only, and ADR-015 deferred the rest into a CLOSED entry

**Opened 2026-09-04**, from an `adr-debt` UNRECEIPTED finding a peer session reported by driving the
`qh-mcp` gates from a client with no shell, and reproduced here.

**The finding as the tool put it:** `ADR-015` → `docs/BACKLOG.md`, *"Equivalent reachability rules for
PHPUnit, pytest, Vitest, Cargo and other runners"* — the destination exists and never names ADR-015
back. `grep -c 'ADR-015' docs/BACKLOG.md` returned **0**.

**The missing receipt was the smaller half.** ADR-015's Out of Scope defers that item to **§78**, on
the reasoning that *"that entry already places the broader class in a fence linter"*. §78 is
`CLOSED 2026-09-02`, and it is about something else: `! grep` cannot fail a `set -e` fence. Its
"belongs in a fence linter" line was about the vacuity idiom, not about per-runner reachability. So
the deferral pointed into an entry that was closed three days later for a different reason — **a punt
into nothing, which the receipt check is exactly what surfaces.** A closed destination cannot receive
work, and nothing would ever have re-read §78 looking for this.

**What is actually deferred, and still is.** `ADR-015` gives Go one rule: a fence naming a Go test
must be able to reach its required success, and a `-run` filter that matches nothing is not a pass.
The same failure mode exists for every other runner this corpus's adopters use — PHPUnit's
`--filter`, pytest's `-k`, Vitest's `-t`, Cargo's filter argument — and each one exits **0** when its
selector matches nothing. Nothing in this repository implements or tests those.

**Not started, and sized honestly:** four runners, four selector grammars, and each needs the
falsifiability fixture the Go rule has — a fence that matches nothing must be shown to be caught,
not merely asserted to be. The 2026-08-29 consumer-repo report in this wing's inbox is the evidence
that this bites in practice: a PHP repo was handed `npm run build` as its check, and the same class
of "a command that cannot fail for this change" is what per-runner reachability is meant to catch.

**Receipt:** this entry names `ADR-015-a-go-fence-can-reach-its-required-success.md`, and ADR-015's
deferral is repointed here from §78.

## 119. CLOSED 2026-09-06 — the mutation campaign cannot run a Python test, so 352 assertions can never kill a mutant

Archived: [backlog-archive/BACKLOG-101-200.md](backlog-archive/BACKLOG-101-200.md)

## 120. CLOSED 2026-09-04 (855d14d, 08344b7) — `adr-verify --sweep`'s fence timeout killed the fence and left its campaign running

Archived: [backlog-archive/BACKLOG-101-200.md](backlog-archive/BACKLOG-101-200.md)

## 121. CLOSED 2026-09-24 — A truncating heartbeat made a timeout test flaky, and two siblings the same day

Archived: [backlog-archive/BACKLOG-101-200.md](backlog-archive/BACKLOG-101-200.md)

## 122. CLOSED 2026-09-04 — the suite wrote its new ledger into ANOTHER plugin's data directory

Archived: [backlog-archive/BACKLOG-101-200.md](backlog-archive/BACKLOG-101-200.md)

## 123. CLOSED 2026-09-05 on two real Windows boxes — a Job Object kills the reparented subshell taskkill could not see; the nested-job case on the CI runner is the one reading still owed

Archived: [backlog-archive/BACKLOG-101-200.md](backlog-archive/BACKLOG-101-200.md)

## 124. CLOSED 2026-09-24 — ADR-035's own criterion killed ADR-035's feature, four hours after it shipped

Archived: [backlog-archive/BACKLOG-101-200.md](backlog-archive/BACKLOG-101-200.md)

## 125. CLOSED 2026-09-04 (after v2.65.0) — two ways an unjudged row became a favourable verdict

Archived: [backlog-archive/BACKLOG-101-200.md](backlog-archive/BACKLOG-101-200.md)

## 126. CLOSED 2026-09-04 — the withdrawal left its body behind, and three checks noticed inside four hours

Archived: [backlog-archive/BACKLOG-101-200.md](backlog-archive/BACKLOG-101-200.md)

## 127. CLOSED 2026-09-05 — a cleanup nobody bounded, and two tests that measured the runner's mood

Archived: [backlog-archive/BACKLOG-101-200.md](backlog-archive/BACKLOG-101-200.md)

## 128. DECLINED 2026-09-24 — the Windows hang has a mechanism, reproduced; the fix is proven on the CI runner and two Windows boxes; what occasionally survives the kill is still unattributed

Archived: [backlog-archive/BACKLOG-101-200.md](backlog-archive/BACKLOG-101-200.md)

## 129. DECLINED 2026-09-24 — the §128 fix exposed a fence orphan that sometimes outlives the kill on the CI runner

Archived: [backlog-archive/BACKLOG-101-200.md](backlog-archive/BACKLOG-101-200.md)

## 130. CLOSED 2026-09-05 — six children a shipped gate spawned carried no timeout, and the runner never reaped

Archived: [backlog-archive/BACKLOG-101-200.md](backlog-archive/BACKLOG-101-200.md)

## 131. CLOSED 2026-09-05 — a PreToolUse advisory was rendered to the person, one prefixed line per line, on every commit attempt

Archived: [backlog-archive/BACKLOG-101-200.md](backlog-archive/BACKLOG-101-200.md)

## 132. CLOSED 2026-09-05 — a slow hook was a pause with no name, and compaction kept the once-per-session markers that now had nothing to protect

Archived: [backlog-archive/BACKLOG-101-200.md](backlog-archive/BACKLOG-101-200.md)

## 133. CLOSED 2026-09-05 — compaction dropped what the gates had measured, and a new session started knowing nothing about the last one

Archived: [backlog-archive/BACKLOG-101-200.md](backlog-archive/BACKLOG-101-200.md)

## 134. CLOSED 2026-09-05 — the gates' reading of a session had no surface a person sees without spending prompt text

Archived: [backlog-archive/BACKLOG-101-200.md](backlog-archive/BACKLOG-101-200.md)

## 135. CLOSED 2026-09-05 — a read-only reviewer could write through Bash, and Desktop could not ask what governs a file

Archived: [backlog-archive/BACKLOG-101-200.md](backlog-archive/BACKLOG-101-200.md)

## 136. CLOSED 2026-09-05 — the install tracked main head and nothing said so; Desktop still lacked the orientation; the evals ran nowhere

Archived: [backlog-archive/BACKLOG-101-200.md](backlog-archive/BACKLOG-101-200.md)

## 137. CLOSED 2026-09-05 — the CI reader lived in one repository, and the status line could not say what CI said

Archived: [backlog-archive/BACKLOG-101-200.md](backlog-archive/BACKLOG-101-200.md)

## 138. CLOSED 2026-09-05 — the gates answered about the wrong repository, and said "none governs" while doing it

Archived: [backlog-archive/BACKLOG-101-200.md](backlog-archive/BACKLOG-101-200.md)

## 139. CLOSED 2026-09-05 — the gate accused a repository of naming tests it had not written, and the cause was the fix to issue #7

Archived: [backlog-archive/BACKLOG-101-200.md](backlog-archive/BACKLOG-101-200.md)

## 140. CLOSED 2026-09-05 — the classifier §124 named as the cause, fixed against §124's own three messages

Archived: [backlog-archive/BACKLOG-101-200.md](backlog-archive/BACKLOG-101-200.md)

## 141. CLOSED 2026-09-05 — a backlog was judged as a malformed decision record, in five corpora out of five

Archived: [backlog-archive/BACKLOG-101-200.md](backlog-archive/BACKLOG-101-200.md)

## 142. CLOSED 2026-09-05 — every push paid for a release, and the rule that was supposed to justify it named a trigger that does not exist

Archived: [backlog-archive/BACKLOG-101-200.md](backlog-archive/BACKLOG-101-200.md)

## 143. PARTLY CLOSED 2026-09-06 — a gate's verdict never said which binary reached it, so a version skew read as an accusation about your code

**Reported from outside, by a session running these gates on the team-memory corpus (GitHub issue
D3-lt/quality-harness#11, 2026-09-05).** It reported two defects. Both were real, both were already
fixed here, and neither was the finding. The finding is that it took a cross-session conversation to
establish which build had answered.

**What they measured.** Four verdicts over ONE unchanged foreign tree:

| build they ran | verdict |
|---|---|
| `~/.claude/bin/adr-lint` (forwarder, resolves to newest INSTALLED) | exit 0, `[PASS]` |
| a quality-harness working checkout, mid-BACKLOG-139 | exit 1, three FALSE "no executable definition" on real `func Test` declarations |
| installed plugin 2.19.0 | exit 1, 21 Verification Log grammar findings |

They read the disjoint failure sets as two divergent lineages, "each fixed one half and broke the
other". It was one lineage: 2.19.0 predates `MS_FIELD` (`plugin/bin/adr-lint`, landed `dab3afe`,
first released v2.47.0), and the checkout was inside the roughly six hours between issue #7's fix and
§139's. Both halves are in 2.79.0 together, and 2.79.0 answers `[PASS]` on both of their records.

**The mechanism, and it is not the regexes.** A gate's verdict names the RECORD it judged and never
the BINARY that judged it. It is one line — `plugin/bin/adr-lint:4451-4454` computes `PASS`/`FAIL`
and prints `[{status}] {adr} + {tasks_dir}` — while `report_version()` sits at `:4247`, reachable
only through `--version` (ADR-031).
So a stale gate's output is indistinguishable from a current gate's, and the only reading available
to the person holding it is "the linter is wrong about my tree". That reading is unreachable from the
next sighting. "Build X at version Y disagrees with build Z" is one lookup.

⚠ **This class has now been reported three times and was a build problem every time**, including once
into this project's own memory inbox on 2026-09-05 (ADR-045 T3, "the func exists at
`description_test.go:97`"). Three reporters, three descriptions of a corpus defect, zero mentions of
a version — because nothing in front of them mentioned one either.

**And the arrow reverses, which makes the ambiguity two-sided.** `DURATION_REQUIRED_FROM =
"2026-09-02"` means a current build treats a post-that-date row WITHOUT `ms:` as a finding, while a
pre-v2.47.0 build treats the same row WITH `ms:` as a finding. One corpus of mixed-age evidence rows
can be told it is wrong in either direction depending on which binary ran, with nothing in either
message naming the binary. [the reversal is the reporter's observation, sharpened from mine.]

**The class, enumerated with a command, not from memory.**

```bash
for g in plugin/bin/*; do python3 "$g" --version; done   # 2026-09-05
grep -ln 'resolve().*__file__' plugin/bin/*              # no match outside the --version path
```

Eleven gates — `adr-debt`, `adr-judge`, `adr-lint`, `adr-next`, `adr-retire-check`, `adr-verify`,
`arch-lint`, `postmortem-verify`, `qh-mcp`, `qh-root`, `spec-verify` — every one of them answers
`--version` with its name, its version and its plugin root. **Not one prints any of it in a verdict.**
So this is eleven members, not one, and `--version` is precisely the flag nobody runs at the moment a
gate is accusing their code. `qh-mcp` is the sharpest case: over MCP there is no shell to run a flag
in at all.

**What is not yet decided**, and is the reason this is a backlog entry rather than a task file:

- Whether the identification belongs on EVERY verdict or only on a non-empty finding list. A `[PASS]`
  line that grew a version is noise for the ninety-nine runs where nothing is wrong; a `[PASS]` from
  a stale binary is exactly the false reassurance the forwarder gave the reporter.
- Whether it names the version alone or the resolved path too. The path is what distinguishes a
  working checkout from a plugin cache from a forwarder, which is the distinction that cost this
  incident two days — but `CLAUDE.md` §6 forbids an absolute home path reaching a commit, and a
  fixture asserting one would carry it into the repository. The path must be assembled and asserted
  structurally, never written into a literal.
- Whether `adr-verify` writes it into the Verification Log row. Tempting, and probably wrong: the row
  is evidence about a RUN, the grammar is already versioned by `DURATION_REQUIRED_FROM`, and widening
  a tool-written line is how a log stops being comparable across ages.

**Not scheduled.** Filed with the reporter's two corpora as the evidence, credited to them; they
isolated `ms:` as the cause on PR #294 after having it as vague version skew, then reproduced the
inverse direction on #295.

**CLOSED for the seven gates that return a verdict, 2026-09-06.** `report_version()` was split: a
new `gate_identity()` returns the name/version/root string and `report_version()` prints it, so the
same identity can be appended to a verdict without a second source of truth. All eleven copies of
the helper were byte-identical before the change and are byte-identical after it, which is what
made a single eleven-file plan safe.

`adr-lint`, `arch-lint`, `spec-verify`, `adr-judge`, `postmortem-verify`, `adr-debt` and
`adr-retire-check` now end every verdict with ` · <gate> <version> (<plugin root>)`:

    [PASS] docs/adr/ADR-020-….md + docs/adr/ADR-020-…/tasks · adr-lint 2.79.0 (…/plugin)

**The suffix rides ON the verdict line, not above it.** The case that produced this issue is
somebody pasting `[PASS] …` into a PR body, where a header on its own line is dropped by the copy
and the claim travels without the thing that qualifies it. That decision came from the reporter's
own argument, quoted on GitHub issue #11: a `[PASS]` is true or false depending on which binary the
reader has.

**Four gates are deliberately NOT changed, and they are the siblings this entry owes (`CLAUDE.md`
§5).** None of them prints a verdict; each emits something a consumer parses, and appending prose
to a machine-readable emitter breaks it:

| gate | what it emits instead | why not here |
|---|---|---|
| `adr-next` | a status table, one row per task | a suffix would land inside a column |
| `adr-verify` | evidence, and operational notices | see below — deliberately excluded twice over |
| `qh-root` | a bare path, consumed by scripts | a suffix would corrupt every caller |
| `qh-mcp` | MCP tool responses, no stdout verdict | **the sharpest case and the real gap** |

⚠ **`qh-mcp` remains open and is the one that matters.** Over MCP there is no shell to run
`--version` in at all, so a client-side reader has no way whatsoever to establish which build
answered — which is strictly worse than the CLI case this entry closed. Carrying the identity into
the tool responses is a payload change with its own compatibility question, and it is a new task,
not a line of this one.

⚠ **`adr-verify` does NOT write the version into a Verification Log row, deliberately.** The row is
evidence about a RUN; its grammar is already versioned by `DURATION_REQUIRED_FROM`; and widening a
tool-written line is how a log stops being comparable across ages (`CLAUDE.md` §4). Recorded here
so the next reader does not re-open it as an oversight.

**The path is carried as well as the version**, because a working checkout, an installed plugin
cache and a generated forwarder can all report a plausible version while being different code, and
which one answered is exactly the question three reports could not reach. ⚠ It is printed at
RUNTIME and never written into a fixture: `tests/gates.test.mjs` derives the expectation from the
suite's own `root` and compares with separators normalised, because a literal would put the
author's home directory into every clone (`CLAUDE.md` §6, §7).

**Both new tests were shown able to fail**, by reverting `plugin/bin/adr-lint` and re-running: the
verdict test goes red naming which of the three parts is missing, and the vacuity guard — a gate
copied where no manifest is above it must say `version unreadable` and state no version — stays
green, because the revert does not touch that arm. A check that returns "clean" and was never seen
returning "dirty" is not evidence (`CLAUDE.md` §4).

## 144. CLOSED 2026-09-06 — one test degraded 12x during a single session, and the suite only notices when it crosses a cap

Archived: [backlog-archive/BACKLOG-101-200.md](backlog-archive/BACKLOG-101-200.md)

## 145. CLOSED 2026-09-24 — MEASURED 2026-09-06 on a real Windows 11 box — three deferred questions answered, and one of them for a reason nobody predicted

Archived: [backlog-archive/BACKLOG-101-200.md](backlog-archive/BACKLOG-101-200.md)

## 146. CLOSED 2026-09-06 — the "already said this" dedupe markers are never cleaned up

Archived: [backlog-archive/BACKLOG-101-200.md](backlog-archive/BACKLOG-101-200.md)

## 147. CLOSED 2026-09-24 — MEASURED 2026-09-06 — what actually makes the campaign slow, and what a Go port would and would not buy

Archived: [backlog-archive/BACKLOG-101-200.md](backlog-archive/BACKLOG-101-200.md)

## 148. CLOSED 2026-09-06 — the mutation cache is never persisted between CI runs, so every push measures everything

Archived: [backlog-archive/BACKLOG-101-200.md](backlog-archive/BACKLOG-101-200.md)

## 149. CLOSED 2026-09-24 — CI went red on a49ab52 — one cause, two symptoms, and a race it exposed

Archived: [backlog-archive/BACKLOG-101-200.md](backlog-archive/BACKLOG-101-200.md)

## 150. CLOSED 2026-09-07 — a mutation verdict was parsed and then discarded when its task had no verification row

Archived: [backlog-archive/BACKLOG-101-200.md](backlog-archive/BACKLOG-101-200.md)

## 151. DECLINED 2026-09-24 — MEASURED 2026-09-06 — the mechanism has now run on three corpora, not one, and two of them are not mine

Archived: [backlog-archive/BACKLOG-101-200.md](backlog-archive/BACKLOG-101-200.md)

## 152. CLOSED 2026-09-07 — advice that fires every run trains filtering, and the filtering produced a false statement

Archived: [backlog-archive/BACKLOG-101-200.md](backlog-archive/BACKLOG-101-200.md)

## 153. DECIDED (b) 2026-09-06 — a THIRD route to "the router offers work the record forbids starting"

Archived: [backlog-archive/BACKLOG-101-200.md](backlog-archive/BACKLOG-101-200.md)

## 154. CLOSED 2026-09-07 — dispatching immediately after a push ties on `createdAt`, and `release-evidence` then read the push run

Archived: [backlog-archive/BACKLOG-101-200.md](backlog-archive/BACKLOG-101-200.md)

## 155. PARTLY CLOSED 2026-09-07 — "waiting on an outside event, with a runnable fence" has no representation, and §153's advice walked a reader into the refusal

Found 2026-09-06 within hours of §153 shipping, by the same peer TRYING TO FOLLOW IT. They added
`**Blocked-on:** ADR-014 reconsidering FUSION=linear as the default` to the exact task that started
the thread. `adr-lint` exit 1:

> `Blocked-on says this task waits on something outside the repository, but its Acceptance is a
> runnable ```bash fence — a task that can run its own acceptance is not waiting, it is unfinished,
> which is `pending` or `partial`. Blocked-on belongs on a task whose Acceptance is human-observed.`

Same refusal on the other genuinely-blocked task there. They reverted both, and measured:

```
task files with a runnable ```bash acceptance:  162 of 163
```

**THE RULE IS COHERENT AND THE VOCABULARY HAS A HOLE.** Their task IS waiting on an external event
and its acceptance IS runnable — it would run today and produce four tables nobody should spend the
compute on. "Waiting on something outside, with a runnable fence" cannot be said. That is not an
exotic shape: it is what every CONDITIONAL MEASUREMENT task looks like.

⚠ **AND IT INDICTS §153's ANSWER, WHICH I SHIPPED HOURS EARLIER.** The advisory sent a reader
choosing a status word to `Blocked-on:` — a field `errors.append` REFUSES on 162 of those 163 files.
A dead end one step further along than the one they started in. Advice that ends in a blocking
refusal is worse than no advice: it spends the reader's turn and teaches them the tool is wrong.
Corrected the same evening — the advisory now names the constraint, says `Blocked-on` is refused on
a runnable-fence task, and says what to do instead.

**And the zero now reads differently.** §153 recorded `Blocked-on:` unused in 163 task files and
read it as undiscoverable. It is also REFUSABLE almost everywhere. Discoverability was the smaller
half.

**The open question, and it may have an honest negative answer.** If a runnable-fence task waiting
on an external event is correctly `pending` with the reason in prose, then routing genuinely cannot
help it and the right outcome is that NOTHING PRETENDS TO — which is what the corrected advisory now
says. The alternative is a representation for the shape: a `Blocked-on` that is legal beside a
runnable fence and understood as "do not run this yet" rather than "this cannot run". That is a
change to what an Acceptance means when it is present but must not be executed, and it wants a
record rather than a patch.

⚠ Reported against 2.82.0. They have not seen `adr-next`'s `Blocked-on` routing work at all — only
lint's refusal to let them use the field.

**THE COST, IN CONCRETE TERMS, ON A REAL CORPUS, TODAY.** The reporter marked ADR-002 T3
`**Status:** blocked` in the task file believing it would stop the router. It stopped nothing — that
header is read by no tool (§153). Their words: *"the prose in the task is the only thing standing
between the next session and four eval runs nobody should pay for."*

That is the whole of this section in one sentence. A human looked, decided the work must not
proceed, wrote it down in the obvious place, and the only thing carrying that decision to the next
session is prose nobody is required to read. `adr-next` will offer T3 as ready.

⚠ **AND THE TWO MESSAGES ARE DIFFERENT ONES, which matters for anybody verifying this.** §153's fix
changed the UNKNOWN-STATUS ADVISORY — the line that fires when a README cell carries a word outside
`done`/`pending`/`blocked`/`partial`. It did NOT change the `Blocked-on`-beside-a-runnable-fence
REFUSAL, which is a separate `errors.append` and still reads as it did. A reader checking the fix by
re-adding `Blocked-on:` to a fenced task will see the same refusal as before and could reasonably
conclude nothing shipped. The refusal already names `pending` or `partial`; what it does not say is
that nothing routes that case at all, which is the sentence the advisory now carries.

### PARTLY CLOSED 2026-09-07 — one of the two routes was gated for no stated reason

Not the representation question. That stays open exactly as written above. What this closes is
narrower and was not in the section: **`adr-next` read a human STOP sign-off only when the
Acceptance was human-observed.**

```python
"stopped_by": human_stop(text) if human else None,     # plugin/bin/adr-next
```

Measured on a two-task fixture, 2026-09-07: the SAME sign-off line, in the same `## Verification
Log` section, routed `stopped` beside a human-observed Acceptance and **READY** beside a runnable
one. So of the two ways to say "a person looked and said do not start this", `Blocked-on:` is
REFUSED by `adr-lint` on 162 of 163 task files, and the sign-off was IGNORED by `adr-next` on the
same 162. Both routes, unavailable, on almost every file — which is why the reporter fell back to
`**Status:** blocked`, a header no tool reads at all.

Nothing justified the gate, and the router's own comment three hundred lines down argues against it:
*"a person looked and said do not proceed"* is a statement about THIS TASK, and whether its
Acceptance happens to be runnable is not a fact about their decision.

⚠ **The write was always allowed and only the read was gated — the worse half.** `adr-lint` never
refused a `- <date> · human-observed · …` row on a fenced task, verified against a fixture. So an
author could record their stop, see it accepted, and watch the router go on offering the task. A
refusal is visible; an ignored record is not.

`"stopped_by": human_stop(text)` now, unconditionally. `node plugin/bin/adr-next docs/adr --all` is
byte-identical before and after — no task in this corpus changes bucket.

```
node scripts/mutate.mjs --case 'adr-next: a STOP sign-off'
  RED  a STOP sign-off is read whatever the Acceptance is
       <- killed by: a sign-off that says stop is honoured whatever the Acceptance is
bash scripts/selftest.sh   exit 0, 791 tests
```

**What is still open, unchanged:** whether `Blocked-on:` should be legal beside a runnable fence and
understood as "do not run this yet" rather than "this cannot run". That is a change to what an
Acceptance MEANS when it is present but must not be executed, and it still wants a record. This only
removes an arbitrary gate on the route that already existed — and it makes the honest-negative
answer cheaper to accept, because "a runnable-fence task waiting on an outside event is `pending`
with the reason in prose" now has a companion that DOES route: a sign-off saying stop.

⚠ **And a third silent route is confirmed, not fixed.** A task file's own `**Status:** blocked`
header is read by nothing — `adr-lint` and `adr-next` both match `**Status:**` only in the RECORD.
The reporter wrote it in the obvious place and it carried nothing. Naming it here rather than fixing
it: a header that duplicates a README cell is a second source of truth, and §10 says the task files
win — so making it authoritative is a decision, not a patch.

## 156. MITIGATED 2026-09-07 — the campaign's heaviest shard is OOM-killed, and §148's complete timings made it heavier

Archived: [backlog-archive/BACKLOG-101-200.md](backlog-archive/BACKLOG-101-200.md)

## 157. CLOSED 2026-09-07 — the release line anchored on a LOCAL tag, so the machine that cuts the releases is the one it lies to

Archived: [backlog-archive/BACKLOG-101-200.md](backlog-archive/BACKLOG-101-200.md)

## 158. CLOSED 2026-09-07 — the always-on reader was KILLED BY ITS HOST on a non-GitHub remote, so §15's whole mechanism was silently absent

Archived: [backlog-archive/BACKLOG-101-200.md](backlog-archive/BACKLOG-101-200.md)

## 159. CLOSED 2026-09-07 — §13's own release order loses a race it creates, three times in one session

Archived: [backlog-archive/BACKLOG-101-200.md](backlog-archive/BACKLOG-101-200.md)

## 160. CLOSED 2026-09-07 — ten of eleven gates answered `unknown option: --help`

Archived: [backlog-archive/BACKLOG-101-200.md](backlog-archive/BACKLOG-101-200.md)

## 161. CLOSED 2026-09-07 — the shipped workflows' parse check COULD NOT FAIL on the node CI pins, and a node upgrade is the only reason anyone found out

Archived: [backlog-archive/BACKLOG-101-200.md](backlog-archive/BACKLOG-101-200.md)

## 162. DECLINED 2026-09-24 — `adr-lint` reported 2.2× slower on an outside corpus, and NOT REPRODUCIBLE here

Archived: [backlog-archive/BACKLOG-101-200.md](backlog-archive/BACKLOG-101-200.md)

## 163. DECLINED 2026-09-24 — nothing here measures what the harness costs or saves, and REWORK is the candidate that does not need token accounting

Archived: [backlog-archive/BACKLOG-101-200.md](backlog-archive/BACKLOG-101-200.md)

## 164. CLOSED 2026-09-07 — six gates produced an exit code their own docstring never named

Archived: [backlog-archive/BACKLOG-101-200.md](backlog-archive/BACKLOG-101-200.md)

## 165. DECLINED 2026-09-24 — `workflow-parse` proves a file PARSES, not that the Workflow runtime will load it

Archived: [backlog-archive/BACKLOG-101-200.md](backlog-archive/BACKLOG-101-200.md)

## 166. CLOSED 2026-09-07 — `adr-next` offered a WITHDRAWN task as the next thing to build

Archived: [backlog-archive/BACKLOG-101-200.md](backlog-archive/BACKLOG-101-200.md)

## 167. CLOSED 2026-09-07 — §166's named sibling: `adr-lint` advised on a task that will never be built, and `partial` was missing from the vocabulary

Archived: [backlog-archive/BACKLOG-101-200.md](backlog-archive/BACKLOG-101-200.md)

## 168. CLOSED 2026-09-07 — "open backlog items" was a count nothing re-checked, and three of them had shipped

Archived: [backlog-archive/BACKLOG-101-200.md](backlog-archive/BACKLOG-101-200.md)

## 169. CLOSED 2026-09-07 — the fence timeout was environment-only, so forgetting it cost thirty minutes to discover

Archived: [backlog-archive/BACKLOG-101-200.md](backlog-archive/BACKLOG-101-200.md)

## 170. CLOSED 2026-09-07 — the plugin linted its own postmortem SKILL as a malformed postmortem

Archived: [backlog-archive/BACKLOG-101-200.md](backlog-archive/BACKLOG-101-200.md)

## 171. CLOSED 2026-09-07 — the remedy `spec-verify` recommends could not run on the platform it was recommended on

Archived: [backlog-archive/BACKLOG-101-200.md](backlog-archive/BACKLOG-101-200.md)

## 172. CLOSED 2026-09-08 — `adr-next` printed READY over exit-0 evidence it had already read

Archived: [backlog-archive/BACKLOG-101-200.md](backlog-archive/BACKLOG-101-200.md)

## 173. CLOSED 2026-09-08 — `--mutant` costs two full fence runs and `--help` did not say so

Archived: [backlog-archive/BACKLOG-101-200.md](backlog-archive/BACKLOG-101-200.md)

## 174. CLOSED 2026-09-08 — nine findings from two outside corpora, one seam: what the pipeline knows never reached the person editing

Archived: [backlog-archive/BACKLOG-101-200.md](backlog-archive/BACKLOG-101-200.md)

## 175. CLOSED 2026-09-08 — §174's B4, with the verbatim inputs: a read-only heredoc was a mutation, and a relative path ignored the command's own `cd`

Archived: [backlog-archive/BACKLOG-101-200.md](backlog-archive/BACKLOG-101-200.md)

## 176. CLOSED IN DIRECTION 2026-09-23 by ADR-060 — a file written through an MCP tool was INVISIBLE to the evidence gate, and this session was the reproduction

Archived: [backlog-archive/BACKLOG-101-200.md](backlog-archive/BACKLOG-101-200.md)

## 177. CLOSED 2026-09-08 — §174's blocking promotion would have refused a CORRECT fence, and the corpus that proved it escaped only by not writing `set -e`

Archived: [backlog-archive/BACKLOG-101-200.md](backlog-archive/BACKLOG-101-200.md)

## 178. CLOSED 2026-09-08 — §177's runner table measured the wrong case, and three sessions with three toolchains found it

Archived: [backlog-archive/BACKLOG-101-200.md](backlog-archive/BACKLOG-101-200.md)

## 179. CLOSED 2026-09-08 — I attacked my own blocking arm and it refused four correct fences; one of the two causes is a trap this repository had already paid for

Archived: [backlog-archive/BACKLOG-101-200.md](backlog-archive/BACKLOG-101-200.md)

## 180. CLOSED 2026-09-08 — the different-lineage review found four more, two of them fail-OPEN, one inside the fix I had just written

Archived: [backlog-archive/BACKLOG-101-200.md](backlog-archive/BACKLOG-101-200.md)

## 181. CLOSED 2026-09-08 — a row pointing at a file that was never created is not evidence the behaviour is unfenced

Archived: [backlog-archive/BACKLOG-101-200.md](backlog-archive/BACKLOG-101-200.md)

## 182. DECLINED 2026-09-24 — a check is admitted by its COMMAND NAME, and whether it can fail depends on its OPERATOR

Archived: [backlog-archive/BACKLOG-101-200.md](backlog-archive/BACKLOG-101-200.md)

## 183. CLOSED 2026-09-08 — two doors into the evidence gate that this release opened, found before it was tagged

Archived: [backlog-archive/BACKLOG-101-200.md](backlog-archive/BACKLOG-101-200.md)

## 184. CLOSED 2026-09-08 — the shell splitters mis-cut on an escape and a command substitution, and one of the three was a false block

Archived: [backlog-archive/BACKLOG-101-200.md](backlog-archive/BACKLOG-101-200.md)

## 185. CLOSED 2026-09-08 — a legacy record was routed as a TASK and told its own ADR was missing

Archived: [backlog-archive/BACKLOG-101-200.md](backlog-archive/BACKLOG-101-200.md)

## 186. CLOSED 2026-09-08 — the most alarming thing this gate says was 21 for 21 wrong, and §185's fix was about to turn it on for every legacy corpus

Archived: [backlog-archive/BACKLOG-101-200.md](backlog-archive/BACKLOG-101-200.md)

## 187. CLOSED 2026-09-08 — the §12 review found three more fail-opens, and one was §16's author breaking §16

Archived: [backlog-archive/BACKLOG-101-200.md](backlog-archive/BACKLOG-101-200.md)

## 188. CLOSED 2026-09-08 — the Windows job caught a fail-open the whole macOS session could not: canonicalising only the side that exists

Archived: [backlog-archive/BACKLOG-101-200.md](backlog-archive/BACKLOG-101-200.md)

## 189. CLOSED 2026-09-08 — v2.96.0 released from 17078b0, and what the four review rounds cost

Archived: [backlog-archive/BACKLOG-101-200.md](backlog-archive/BACKLOG-101-200.md)

## 190. CLOSED 2026-09-09 — §185 traded a false failure for SILENCE, and a corpus without the `ADR-` prefix was invisible to three checks

Archived: [backlog-archive/BACKLOG-101-200.md](backlog-archive/BACKLOG-101-200.md)

## 191. CLOSED 2026-09-09 — the PATH arm of the same cross-reference check: 13 of 21 findings false, triaged one by one from outside

Archived: [backlog-archive/BACKLOG-101-200.md](backlog-archive/BACKLOG-101-200.md)

## 192. CLOSED 2026-09-09 — the release-candidate review found four defects the gate was green over, and one of them only exists on Linux

Archived: [backlog-archive/BACKLOG-101-200.md](backlog-archive/BACKLOG-101-200.md)

## 193. CLOSED 2026-09-09 — the fix for a fail-open shipped a fail-open, and a name-shaped guard was wrong in both directions twice

Archived: [backlog-archive/BACKLOG-101-200.md](backlog-archive/BACKLOG-101-200.md)

## 194. PARTLY CLOSED 2026-10-06 — round six: five real findings, all on inputs no reporting corpus has produced

Round six of the release-candidate review returned REQUEST CHANGES with three HIGH and two MEDIUM
against `0234e81`. **All five are real and none is being fixed before v2.97.0 ships.** That is a
judgement about reachability, and the reasoning is recorded here so it can be disagreed with.

| # | finding | direction | what it takes to reach |
|---|---|---|---|
| 1 | a case-only corpus path (`DOCS/ADR/…`) enumerates zero records on a case-insensitive filesystem | false BLOCK | invoking the gate with a path spelled differently from the one git holds |
| 2 | `_title_says_record` reads an unrecognised title as "definitely not a record", and never compares the title's number to the filename's | both | an AMBIGUOUS-shaped filename only, plus frontmatter, leading spaces, a setext heading, or a title naming a different record |
| 3 | one unreadable ambiguous entry demotes the WHOLE enumeration to unproven | blocking becomes advisory | a sparse checkout, or a tracked symlink that dangles |
| 4 | a `tasks/` directory implemented as a submodule reads as no tasks | false BLOCK | a gitlink where the layout documents a directory |
| 5 | `errors="replace"` collapses two filenames whose raw bytes differ | fail open | invalid UTF-8 bytes in a filename |

**Why these are named rather than fixed.** §190, §192 and §193 were gates going SILENT on ordinary
corpora — a legacy record, a BOM, a title with no trailing newline. These five need a mis-spelled
path, a filename and a title disagreeing about which record they are, a sparse checkout, a submodule,
or an invalid byte sequence. The severity labels held constant across three rounds while the
reachability collapsed, and the labels hide that.

⚠ **And the measured cost of another round is not zero.** Two of the last three HIGH findings were
introduced BY the previous round's fix: §193's erased unterminated title came from §192's BOM helper,
and §192's own narrowing came from §191's. A seventh round has a real chance of adding a defect more
reachable than the five it closes. **Finding 2 is the one to take first** when this is picked up: it
is the §16 inversion again — "not recognised as X" read as "known to be not-X" — in a predicate
written by the author of §16, two days after writing it.

**Corrected here rather than carried:** this entry's parent claimed `resolve_qualified_dep` is the
only blocking consumer. It is not; `check_cross_record_cycles` appends as well. See §193.

**Row 2 fixed 2026-09-24; rows 1, 3, 4 and 5 stay open** and reopen on the first outside report of
their input. What row 2 still needed: the title-versus-filename number comparison it names had been
added in the caller since (`record_files` skips a title whose number disagrees). What remained was
that only line one was read, so a blank line or a YAML frontmatter block above a real record's title
dropped it from the enumeration and a dependency on it failed to resolve. `_title_says_record` now
reads the first `# ` heading after any frontmatter through `record.title_line`, the rule every
other reader shares since ADR-063. The prescription's other half, "return None for unrecognised
forms", was declined: this repository's own pinned fixture holds a headingless dated note
(`2026-9-9-router.md`) as an ordinary member of a corpus, and making it unknown would demote every
such corpus's enumeration to could-not-look. A file with no heading stays "not a record". Setext
headings and indented `#` are not read, as nowhere else in the corpus reads them. Test
`test_a_record_title_below_frontmatter_or_a_blank_line_is_read`, two catalogue mutants.

**Codex review of the row 2 fix (2026-09-24) found two holes in it, both closed the same day.** Reading
the first heading anywhere took a fenced `# ADR-…` example for a task file's title, so the task was
enumerated as a record and a nonexistent dependency resolved; and the title's number was still read
from the unstripped text, so a YAML comment in the frontmatter named a different record and a real one
was dropped. Both are reproduced in `test_a_fenced_example_is_not_a_title_and_the_number_comes_from_the_title`.
`_record_title` is now the one reading for both questions: the first `# ` heading after frontmatter
and outside fenced code. Two new mutants, and the two row-2 mutants follow the moved lines.

**Codex review, round 2 (high, 2026-09-24): the fence reading was its own, and wrong.** A line like ```` ```python ```` inside a ```` ```markdown ```` fence closed it, so the example after it was read as a title again; tildes did the same; and a backtick "opener" whose info string holds a backtick hid a real title. `_record_title` now reads fences with the corpus's rule, `record._fence_opened` and `_fence_closes`. Test `test_a_fence_is_read_with_the_corpus_rule`, one mutant.

**Triaged 2026-10-06: row 2 is closed; rows 1, 3, 4 and 5 stay parked on this entry's own condition.** No outside report has produced their inputs since. That was checked with `grep -n -i 'gitlink\|submodule\|case-only\|sparse checkout' docs/BACKLOG.md` over the later sections:
- The sparse-checkout hits (§309-era, the probe's `unread`) are about the probe and work-next, not adr-lint's enumeration (row 3).
- The case-only hits (§350 F4, C5) are about twins in git's index, not a corpus path spelled in another case (row 1). They are tracked in §350's Batch D.
- No hit names a submodule tasks directory (row 4) or an invalid-UTF-8 filename (row 5).

## 195. DECLINED 2026-09-24 — OpenCode support: what is already portable, what is not, and the one question that decides it

Archived: [backlog-archive/BACKLOG-101-200.md](backlog-archive/BACKLOG-101-200.md)

## 196. CLOSED 2026-09-24 — ADR-039 still names unused `readRecordFiles` after the walker was deleted

Archived: [backlog-archive/BACKLOG-101-200.md](backlog-archive/BACKLOG-101-200.md)

## 197. CLOSED 2026-09-24 — three fence-blind `## ` readers remain in adr-verify after ADR-045

Archived: [backlog-archive/BACKLOG-101-200.md](backlog-archive/BACKLOG-101-200.md)

## 198. CLOSED 2026-09-11 — §197's three readers moved, and §197 was wrong about adr-lint

Archived: [backlog-archive/BACKLOG-101-200.md](backlog-archive/BACKLOG-101-200.md)

## 199. CLOSED 2026-09-11 — the second Codex review of ADR-045: what T3–T6 introduced, and the edges they left

Archived: [backlog-archive/BACKLOG-101-200.md](backlog-archive/BACKLOG-101-200.md)

## 200. DECLINED 2026-09-24 — adr-verify `file_newline` rewrites mixed terminators and does not name a lone CR

Archived: [backlog-archive/BACKLOG-101-200.md](backlog-archive/BACKLOG-101-200.md)

## 201. CLOSED 2026-09-24 — `provenMutationPaths` treats cwd as the repository and only checks lexical containment

Archived: [backlog-archive/BACKLOG-201-300.md](backlog-archive/BACKLOG-201-300.md)

## 202. DECLINED 2026-09-24 — Two overlapping `--brief` refreshes can last-write-wins the branch-state cache

Archived: [backlog-archive/BACKLOG-201-300.md](backlog-archive/BACKLOG-201-300.md)

## 203. PARTLY CLOSED 2026-09-24 — Swift reaches the first-red lock but not spec-verify, adr-verify's comment and syntax checks, or a Tests-row path check

Found while adding Swift to the ADR-050 lock (branch `swift-test-lock-extraction`, 4678b63 and
1d517b9, 2026-09-13), from an iOS repository whose ADR names Swift Testing and XCTest functions.
Class: per-language dispatch by file suffix. Enumerated with
`grep -rn 'suffix.lower()\|"\.rs"' plugin/bin plugin/lib`:

- `plugin/bin/spec-verify:401` `test_definition_exists` has no `.swift` branch, so a spec fact
  covered by a Swift test reads as having no test.
- `plugin/bin/adr-verify:341` `LINE_COMMENT` has no `.swift`, so a comment-only `--mutant` against a
  Swift file is not refused; `syntax_ok` (`adr-verify:550`) does not syntax-check Swift.
- The lock resolves each Tests-row file repository-relative. A bare filename (`GoNoGoTests.swift`)
  locks `unproven` for every language; nothing advises at `adr-lint` time, before the first red makes
  it permanent. The consuming repository hit this on 60 rows.

The Swift masker's bare `/…/` regex recognition is a heuristic (SE-0354 operand positions, no
leading or trailing whitespace); a regex literal in a position it does not recognise can widen or,
with a brace in it, shorten a hashed span. Each item above belongs on its own change with a
dirty-shown regression.

**PARTLY CLOSED 2026-09-24.** Two of the three bullets. `spec-verify` reads a `.swift` test definition
through the lock's own Swift reader (`record.extract_test_names`), so the two gates agree on what a
Swift test is, and it runs a Swift binding with `swift test --filter` from the nearest `Package.swift`.
That runner exits 0 on a filter that selects nothing — measured with Swift 6.4, "No matching test
cases were run" — so a pass needs the runner's own line: XCTest's `Test Case '-[… name]' passed` or
Swift Testing's `Test name() passed`, else UNRUN. `adr-verify`'s `LINE_COMMENT` knows `.swift`, so a
comment-only Swift mutant is refused. **Still open:** `syntax_ok` does not syntax-check Swift (a
`swiftc -parse` needs a toolchain the runner may not have), and nothing advises a bare-filename
Tests row before the first red locks it `unproven`. Tests `spec-verify runs a Swift binding of either
test shape…` and `a Swift comment-only mutant is refused like any other`; one mutant each.

**Codex review of the Swift runner (gpt-6-astra, xhigh, 2026-09-24) found it credited the wrong test.**
`--filter <name>` selects the same function in every suite and target, and the XCTest evidence accepted
any class, so a same-named passing test elsewhere counted as the bound test's pass. Measured with Swift
6.4: `--filter Target.Class/method` and `--filter Target.function` select exactly one test, another
target's name selects nothing, and an anchored regex selects nothing at all. `swift_identity` now
builds the filter from the target the file sits under (`Tests/<Target>/…`) and the type enclosing
the function, and an XCTest pass must name that class; a binding it cannot place is UNRUN, with the
reason. Checked against a real package as well as the stub. Test `a Swift pass is attributed to the
bound test, not a same-named one elsewhere`, two mutants.

**Codex review, round 2 (high, 2026-09-24): two more ways to credit the wrong Swift test.** A nested suite or a qualified extension (`extension Outer.Inner`) got an identity built from one name, which could select an unrelated suite with that name; and two same-named declarations in one file narrowed to the first, so a failing second one never ran. The runner's identity syntax for a nested type was not measured here, so each case is UNRUN with the reason rather than a guess. Test `a Swift binding the gate cannot place uniquely is UNRUN`, two mutants.

**Codex review, round 3 (high, 2026-09-24): the round-2 guard read a type name too narrowly.** It captured the name as `[\w.]+`, so `extension Outer . Inner`, a comment around the dot, and an escaped enclosing name (`` struct `Outer` ``) each reached the guard as one plain name, and a stub reporting the inner test passed. The name is now read with its whole qualification, and an escaped name is UNRUN like a nested one, since its filter spelling was never measured. Test `a Swift nested type is UNRUN however its name is spelled`, two mutants.

## 204. CLOSED — the PHP `@test` docblock lock mutant is GREEN in a `lock:` group campaign and RED alone

Archived: [backlog-archive/BACKLOG-201-300.md](backlog-archive/BACKLOG-201-300.md)

## 205. PARTLY CLOSED 2026-09-24 — The Swift first-red lock refuses two valid Swift shapes it could prove

Found by the sixth Codex review of the Swift lock (2026-09-13, `swift-frontend -parse` exit 0 on
Apple Swift 6.3.3). Both fail CLOSED — the row reads UNPROVEN, no moved assertion keeps its hash —
so they cost a proven lock, not correctness.

- `_swift_ambiguous_slash` refuses ordinary division between closures:
  `[2, 4].map { 8/$0 }.map { $0/2 }` spans `/$0 }.map { $0/` as a candidate holding braces. Telling
  division from a bare regex needs the operand before the `/`; a keyword such as `return` also ends in
  an identifier character, so a naive "operand before" rule would treat `return /[}]/` as division
  and reopen the bypass the refusal exists for.
- `_iter_swift_tests` reads names with Python `\w`, so `@Test func 🧪()` is not discovered and its
  Tests row is UNPROVEN. Swift identifier rules (operator-free Unicode ranges) would admit it.

**Partly closed 2026-09-24.** the division shape was fixed in 1b403b4 (its message names §204). The Unicode-identifier shape stays open: `_iter_swift_tests` still matches names with `\w+`.

## 206. DECLINED 2026-09-24 — Never-hashable Tests rows stay UNPROVEN after --relock (ADR-052)

Archived: [backlog-archive/BACKLOG-201-300.md](backlog-archive/BACKLOG-201-300.md)

## 207. CLOSED 2026-09-24 — Swift Testing `#expect` is not a first-red hasher dialect (ADR-052)

Archived: [backlog-archive/BACKLOG-201-300.md](backlog-archive/BACKLOG-201-300.md)

## 208. CLOSED 2026-09-24 — Codex P2 leftovers on ADR-053 (2026-09-14)

Archived: [backlog-archive/BACKLOG-201-300.md](backlog-archive/BACKLOG-201-300.md)

## 209. CLOSED 2026-09-24 — ADR-054 T1–T4 `--replace-hashes` is accepted recovery, not a retake (2026-09-16)

Archived: [backlog-archive/BACKLOG-201-300.md](backlog-archive/BACKLOG-201-300.md)

## 210. CLOSED 2026-09-24 — Routing leftovers from ADR-057 (2026-09-16)

Archived: [backlog-archive/BACKLOG-201-300.md](backlog-archive/BACKLOG-201-300.md)

## 211. CLOSED 2026-09-24 — The reviewer guard refuses read-only commands a reviewer needs for evidence (2026-09-16)

Archived: [backlog-archive/BACKLOG-201-300.md](backlog-archive/BACKLOG-201-300.md)

## 212. CLOSED 2026-09-24 — The JS test-lock masker does not skip regex literals (2026-09-16)

Archived: [backlog-archive/BACKLOG-201-300.md](backlog-archive/BACKLOG-201-300.md)

## 213. CLOSED 2026-09-24 — The commit advisory ignored a wrapped selftest and counted an `mrw read` as a write (2026-09-16)

Archived: [backlog-archive/BACKLOG-201-300.md](backlog-archive/BACKLOG-201-300.md)

## 214. DECLINED 2026-09-24 — quality-cycle's `codex: true` arm has no route after ADR-057 (2026-09-16)

Archived: [backlog-archive/BACKLOG-201-300.md](backlog-archive/BACKLOG-201-300.md)

## 215. DECLINED 2026-09-24 — Class F ("review requested") does not consult the risk table (2026-09-16)

Archived: [backlog-archive/BACKLOG-201-300.md](backlog-archive/BACKLOG-201-300.md)

## 216. CLOSED 2026-09-24 — §211 reproduced live in workflow-spawned reviewers, and §213 sighted again (2026-09-16)

Archived: [backlog-archive/BACKLOG-201-300.md](backlog-archive/BACKLOG-201-300.md)

## 217. CLOSED 2026-09-24 — A per-session counter for repeated advisories (2026-09-16)

Archived: [backlog-archive/BACKLOG-201-300.md](backlog-archive/BACKLOG-201-300.md)

## 218. CLOSED 2026-09-24 — Shell grammar words make a loop or a conditional an unrecognised family (2026-09-16)

Archived: [backlog-archive/BACKLOG-201-300.md](backlog-archive/BACKLOG-201-300.md)

## 219. CLOSED 2026-09-24 — The foreign-shell check in `classify-command.mjs` survives its deletion (2026-09-16)

Archived: [backlog-archive/BACKLOG-201-300.md](backlog-archive/BACKLOG-201-300.md)

## 220. CLOSED 2026-09-24 — Arguments of every read-only family are changed paths inside a mutating command (2026-09-16)

Archived: [backlog-archive/BACKLOG-201-300.md](backlog-archive/BACKLOG-201-300.md)

## 221. CLOSED 2026-09-24 — A git mutation in another repository marks this project's work unverified (2026-09-16)

Archived: [backlog-archive/BACKLOG-201-300.md](backlog-archive/BACKLOG-201-300.md)

## 222. DECLINED 2026-09-24 — The tutorial test saw a mutant survive once, under load (2026-09-17)

Archived: [backlog-archive/BACKLOG-201-300.md](backlog-archive/BACKLOG-201-300.md)

## 223. CLOSED 2026-09-24 — Three over-reports from ADR-058 T7 and ADR-059 T4/T5 ship open (2026-09-17)

Archived: [backlog-archive/BACKLOG-201-300.md](backlog-archive/BACKLOG-201-300.md)

## 224. CLOSED 2026-09-24 — A quoted `bash -c` payload is read as one Markdown path (2026-09-17)

Archived: [backlog-archive/BACKLOG-201-300.md](backlog-archive/BACKLOG-201-300.md)

## 225. CLOSED 2026-09-24 — `adr-verify` blames the sha width when a clean fence is killed (2026-09-17)

Archived: [backlog-archive/BACKLOG-201-300.md](backlog-archive/BACKLOG-201-300.md)

## 226. CLOSED 2026-09-24 — Shell-quote patterns whose escape handling nobody assessed (2026-09-17)

Archived: [backlog-archive/BACKLOG-201-300.md](backlog-archive/BACKLOG-201-300.md)

## 227. CLOSED 2026-09-24 — Three older redirect gaps a Codex review listed as residual (2026-09-17)

Archived: [backlog-archive/BACKLOG-201-300.md](backlog-archive/BACKLOG-201-300.md)

## 228. CLOSED 2026-09-24 — ADR-059 T8 and T9 were reverted; the quote strip stays as released (2026-09-17)

Archived: [backlog-archive/BACKLOG-201-300.md](backlog-archive/BACKLOG-201-300.md)

## 229. A space in the checkout path made a run where NO test ran a passing baseline (2026-09-18) — FIXED

Archived: [backlog-archive/BACKLOG-201-300.md](backlog-archive/BACKLOG-201-300.md)

## 230. Six tests fail on a stock Windows account, where three others already skip (2026-09-18) — FIXED

Archived: [backlog-archive/BACKLOG-201-300.md](backlog-archive/BACKLOG-201-300.md)

## 231. CLOSED 2026-09-24 — The repository cannot be cloned on Windows from a deep root (2026-09-18) — DOCUMENTED, not fixed

Archived: [backlog-archive/BACKLOG-201-300.md](backlog-archive/BACKLOG-201-300.md)

## 232. DECLINED 2026-09-24 — `node --test` cannot find test files through a UNC path (2026-09-18)

Archived: [backlog-archive/BACKLOG-201-300.md](backlog-archive/BACKLOG-201-300.md)

## 233. CLOSED 2026-09-24 — Three green signals, each blind for a different reason (2026-09-18)

Archived: [backlog-archive/BACKLOG-201-300.md](backlog-archive/BACKLOG-201-300.md)

## 234. CLOSED 2026-09-24 — A dangling link still archives as a plain file on an ordinary Windows account (2026-09-18)

Archived: [backlog-archive/BACKLOG-201-300.md](backlog-archive/BACKLOG-201-300.md)

## 235. DECLINED 2026-09-24 — Nothing anywhere executes a `.cmd` forwarder (2026-09-18)

Archived: [backlog-archive/BACKLOG-201-300.md](backlog-archive/BACKLOG-201-300.md)

## 236. CLOSED 2026-09-24 — Windows + a real symlink + a relative target, in the archive type probe (2026-09-18)

Archived: [backlog-archive/BACKLOG-201-300.md](backlog-archive/BACKLOG-201-300.md)

## 237. CLOSED 2026-09-24 — What no configuration available to this project can test (2026-09-18)

Archived: [backlog-archive/BACKLOG-201-300.md](backlog-archive/BACKLOG-201-300.md)

## 238. CLOSED 2026-09-24 — Re-announce per RUN, not once per session — §237's rule was too weak (2026-09-18)

Archived: [backlog-archive/BACKLOG-201-300.md](backlog-archive/BACKLOG-201-300.md)

## 239. CLOSED 2026-09-24 — A different-lineage ruling on §234 picked an option neither side had (2026-09-18)

Archived: [backlog-archive/BACKLOG-201-300.md](backlog-archive/BACKLOG-201-300.md)

## 240. CLOSED 2026-09-24 — A defect that switched off its own regression guard, and the tooling that nearly hid it (2026-09-18)

Archived: [backlog-archive/BACKLOG-201-300.md](backlog-archive/BACKLOG-201-300.md)

## 241. DECLINED 2026-09-24 — The suite runs a real mutation campaign against its own tracked files (2026-09-18)

Archived: [backlog-archive/BACKLOG-201-300.md](backlog-archive/BACKLOG-201-300.md)

## 242. DECLINED 2026-09-24 — The containment property is measured true and guarded by nothing (2026-09-18)

Archived: [backlog-archive/BACKLOG-201-300.md](backlog-archive/BACKLOG-201-300.md)

## 243. DECLINED 2026-09-24 — The mutation gate's granularity is the FILE; the risk is the MECHANISM (2026-09-18)

Archived: [backlog-archive/BACKLOG-201-300.md](backlog-archive/BACKLOG-201-300.md)

## 244. CLOSED 2026-09-24 — The inferred check can be NARROWER than the project's real gate (2026-09-18)

Archived: [backlog-archive/BACKLOG-201-300.md](backlog-archive/BACKLOG-201-300.md)

## 245. CLOSED 2026-09-24 — Three rounds of review, three rounds of my fixes introducing new defects (2026-09-18)

Archived: [backlog-archive/BACKLOG-201-300.md](backlog-archive/BACKLOG-201-300.md)

## 246. DECLINED 2026-09-24 — The status line's header says it never spawns a process, and it does (2026-09-17)

Archived: [backlog-archive/BACKLOG-201-300.md](backlog-archive/BACKLOG-201-300.md)

## 247. CLOSED 2026-09-24 — §213, §216, §217, §218, §219, §220 and §221 close with the classifiers (2026-09-18)

Archived: [backlog-archive/BACKLOG-201-300.md](backlog-archive/BACKLOG-201-300.md)

## 248. DECLINED 2026-09-24 — A Windows install sat twenty minors behind, and nothing said so (2026-09-18)

Archived: [backlog-archive/BACKLOG-201-300.md](backlog-archive/BACKLOG-201-300.md)

## 249. CLOSED 2026-09-24 — The Windows fixes from a real machine, carried onto this branch (2026-09-18)

Archived: [backlog-archive/BACKLOG-201-300.md](backlog-archive/BACKLOG-201-300.md)

## 250. CLOSED 2026-09-24 — `selftest.sh` no longer says whether it was a PASS or a PARTIAL (2026-09-22)

Archived: [backlog-archive/BACKLOG-201-300.md](backlog-archive/BACKLOG-201-300.md)

## 251. DECLINED 2026-09-24 — The session-ledger location key folds case on every macOS volume (2026-09-22)

Archived: [backlog-archive/BACKLOG-201-300.md](backlog-archive/BACKLOG-201-300.md)

## 252. DECLINED 2026-09-24 — The id rules ADR-063 left per gate, and the members a grep cannot see (2026-09-22)

Archived: [backlog-archive/BACKLOG-201-300.md](backlog-archive/BACKLOG-201-300.md)

## 253. CLOSED 2026-10-06 — A build diagnostic anywhere in a failing fence makes a real kill inconclusive (2026-09-22)

Archived: [backlog-archive/BACKLOG-201-300.md](backlog-archive/BACKLOG-201-300.md)

## 254. DECLINED 2026-09-24 — `adr-debt` reports follow-ups that a later Accepted record disposes of (2026-09-22)

Archived: [backlog-archive/BACKLOG-201-300.md](backlog-archive/BACKLOG-201-300.md)

## 255. PARTLY CLOSED 2026-09-24 — Peer-probe leads from 2026-09-18 to 2026-09-22 that nothing has confirmed or closed (2026-09-22)

Moved out of the `wing_quality-harness` inbox so they are tracked in this file. Each is a lead from
another repository's session, not a measurement here. The inbox items that were fixed or already had
an entry here were closed rather than copied: the quality-cycle `externalReviews` reason (`9f206ad`),
the date-slug retire gate (ADR-063), the `composer test` rung (removed), `qh-doctor` dropping the
unidentified count, `branch-state` leaking child stderr, the vitest `-t` row (`.claude/rules/16`), the
inferred check narrower than a husky gate (§244), the `adr-audit` handoff (§245), and Ansible
`roles/*/tasks` directories read as ADR task directories (the `lifecycle.mjs` task-directory scan now
requires a `*.md` directly under `tasks/`).

- **`absent:<base>:<owning ADR>`.** On the ADR-060 trial a deletion under an archive-owned path was
  filed under an `ABSENT` key carrying no owner, so editing the owner could not re-open the question.
  Deferred there on purpose, because it changes what a persisted key means. Not re-read at `849a80f`:
  the names the report used are no longer in `plugin/`.
- **The errno table** from the same review: EISDIR read as null, `contentId` following symlinks, and a
  FIFO blocking `readFileSync` outside the budget window. The suggested fix was `statSync` plus
  `isFile()` first. Recorded there, not done.
- **`./vendor/bin/pint --test` is not a validation command.** Laravel's first-party linter in dry-run
  mode, where a first-token pattern finds no test/lint/check word. Reported on 2.99.6.
- **An Acceptance fence that pipes its runner, or `cd`s outside the record's repository**, is linted by
  nothing, and `work-next` reports readiness for a tree no gate read. The reporter was unsure whether
  that is the gate's problem or the author's.
- **`qh-check` exit 2 writes no row**, so "a session tried and there was nothing to run" looks the same
  as "nobody ran it". It is conservative, since an advisory still says `unchecked`. The open question is
  whether the next session should see the attempt.
- **The peer-probe script changed between a peer reading it and running it** (2026-09-19). A request for
  a peer run should carry the script's sha256, so the peer can show which version it ran.

**Partly closed 2026-09-24.** the errno/FIFO lead is fixed (`event-log.mjs` `contentId` uses fstat) and two leads are moot after 026c21c; the rest stay unconfirmed leads, not scheduled.

## 256. CLOSED 2026-09-24 — An inherited `FORCE_COLOR` makes the mutation runner read no test output (2026-09-22)

Archived: [backlog-archive/BACKLOG-201-300.md](backlog-archive/BACKLOG-201-300.md)

## 257. CLOSED 2026-09-24 — `adr-verify --sweep` cannot see a claim recorded with its run time (2026-09-22)

Archived: [backlog-archive/BACKLOG-201-300.md](backlog-archive/BACKLOG-201-300.md)

## 258. MITIGATED 2026-09-24 — The observed-events object count fails about one run in three, in a linked worktree under load (2026-09-22)

Archived: [backlog-archive/BACKLOG-201-300.md](backlog-archive/BACKLOG-201-300.md)

## 259. DECLINED 2026-09-24 — An ADR-named directory takes a note from the record around it (2026-09-22, pre-existing)

Archived: [backlog-archive/BACKLOG-201-300.md](backlog-archive/BACKLOG-201-300.md)

## 260. CLOSED 2026-09-24 — A decision unit's seal order depended on the host's filesystem case rule (2026-09-23, pre-existing)

Archived: [backlog-archive/BACKLOG-201-300.md](backlog-archive/BACKLOG-201-300.md)

## 261. CLOSED 2026-09-24 — `qh-check` ran the project's check through cmd.exe on Windows (2026-09-23, reported from outside)

Archived: [backlog-archive/BACKLOG-201-300.md](backlog-archive/BACKLOG-201-300.md)

## 262. CLOSED 2026-09-24 — Duplicates §231 (2026-09-23) — kept for two facts §231 did not have

Archived: [backlog-archive/BACKLOG-201-300.md](backlog-archive/BACKLOG-201-300.md)

## 263. CLOSED 2026-09-24 — Every corpus reader but SessionStart read test fixtures as this repository's records (2026-09-23)

Archived: [backlog-archive/BACKLOG-201-300.md](backlog-archive/BACKLOG-201-300.md)

## 264. CLOSED 2026-09-24 — Every CLI here went silent when invoked through a symlink (2026-09-23, reported from a peer probe)

Archived: [backlog-archive/BACKLOG-201-300.md](backlog-archive/BACKLOG-201-300.md)

## 265. PARTLY CLOSED 2026-09-23 — what the readers said about five consumer-shaped corpora, side by side

Built `plugin/scripts/corpus-probe.mjs` — every reader spawned as a process over one repository, one
JSON, paths relative, disagreements computed — and `tests/corpus-matrix.test.mjs`, which runs it
through a symlink over five corpora (`tests/fixtures/corpora/*` and `tests/fixtures/foreign`) against
a reviewed `expected.json` each. Building the fixtures and reading the first drafts found six things,
four fixed here, two left open.

**Fixed:**

1. **`adr-verify --sweep` could not see the rows `adr-verify` itself writes.** `CLAIM_RE` ended at the
   digest (`\s*$`); ADR-020 (2026-09-01) appended ` · ms:N` to every row. Measured on this corpus:
   ```
   exit-0 rows=627  with_ms_suffix=541  CLAIM_RE_matches=66
   ```
   So since 2026-09-01 the false-success sweep — the instrument research §8 gap 1 rests on — counted
   66 hand-shaped rows and skipped 561, in the flattering direction. The 2026-09-01 figure
   (37 held / 0 false / 15 superseded over 52) was taken the day ADR-020 landed and is the last one
   that saw the whole corpus. The pattern accepts a trailing ` · …` now; the python corpus's one
   `ms:` row is the matrix's control (claims 1, held 1; was 0).
2. **`work-next` offered a `Blocked-on` task as ready** while `adr-next` had read the header since
   v2.83.0 (`f8a0698`). The foreign fixture carried the shape all along; its test explicitly allowed
   the answer (`foreign-corpus.test.mjs:113`). `unfinished()` reads the header now.
3. **`work-next` counted `roles/db/tasks/files/notes.md` as a task file** while SessionStart's
   `taskDirectories` had learned on 2026-09-19 to want a `.md` directly under `tasks/`. Same rule now.
4. **The per-edit gate linted fixture records as the repository's own.** Every edit to a file under
   `tests/fixtures/corpora/` ran `adr-lint` and `adr-retire-check` over it and reported the fixture's
   deliberate gaps as failures here. The fixture exclusion moved to `plugin/scripts/uninteresting.mjs`
   (so `run-shell-hook.mjs` can import it without a cycle through `lifecycle.mjs`) and the runner
   skips such a path before dispatch, `verdict.complete = true`. `tests/fixture-edit-gate.test.mjs`
   holds the same record on both sides of the line.

**The first real corpus, and the reader disagreement it settled (same day).** A peer session ran the
probe over its five-record Laravel corpus: `work-next` offered T4 and T5 while their `Depends-on: T3`
was pending; `adr-next` held them back. That was the third instance of one defect — `work-next` had
its own readiness rule (any exit-0 row means finished; no `Depends-on`, no `Blocked-on`, no digest
check) beside `adr-next`, which had all three, and this repository's own archive gave a fourth
(three frozen tasks with stale digests, offered by one reader and not the other). **Fixed:
readiness is `adr-next`'s answer.** `work-next` asks `adr-next --json` per task directory of a
governing, unfrozen record, exactly as SessionStart does, restricted to the task files it lists; a
directory `adr-next` cannot answer for is `readinessUnproven` in the state and the JSON, never
"nothing ready" (ADR-005). Item 5 below is closed by that; `foreign/…/T1` is ready everywhere now,
with adr-next's stale-digest reason. Found on the way: `adr-next` crashed with `IndexError` on a task
file named plainly `T9.md` (the title regex captures the id, `TID_RE` has no group). Six tests here
carried `acceptance-sha256:beef`, a digest no fence produces, and had encoded "finished" for what is
stale evidence; they carry the fence's real digest now.

**From the Codex review of `c1f546a`, seven findings, all folded in:** the widened `CLAIM_RE` had
admitted `--relock` snapshot rows as claims (excluded via `vlog_row_is_lock_snapshot`, the rule lint
already applied); the probe could leak the plugin path or a temp path through a reader's diagnostic
(every emitted string is scrubbed, both separator spellings); `work-next` printed native separators
and on Windows the same task produced two contradictory disagreement entries (every path is
normalised before comparison — the Windows CI job failed on exactly this); a crashed hook read as an
empty orientation and a crashed `work-next` invented "not offered" (could-not-run now, and
disagreements are computed only where both readers answered); the fixture exclusion also skipped
`post-edit-check.sh`'s syntax check (scoped to the record gate); a relative `file_path` was judged
against the wrong cwd (resolved against the payload's); and `expected.json`'s `adrLint` was
declared and never asserted (asserted).

**Open:**

5. ~~Stale evidence disagreement~~ — closed above.
6. **A fresh corpus routes nowhere.** `nextStage` only offers `adr-execute` when the corpus already
   carries one exit-0 row (`usesVerificationLog`), so a repository with its first task — the
   ONBOARDING hour-one shape — hears "Nothing in the QH corpus is waiting" from `work-next` and
   "T1 is ready" from SessionStart (`ansible-nested-fixtures`, `next: null`). The rule exists so a
   corpus that keeps evidence elsewhere is not called pending; it needs a third answer for a corpus
   that has no evidence YET.

**Also seen:** the MADR corpus is counted by every reader (three records, one retirable) and refused
by `adr-lint` (`not-recognised` ×3) — ADR-038's split, now visible in one report rather than two. And
a blind spot the peer named: records whose `**Repo:**` header points at ANOTHER repository, so their
fences run in a tree the probe never sees; nothing in the report says so yet.

## 266. PARTLY CLOSED 2026-09-23 — what a Windows desktop said about the released readers over a 72-record corpus

The dynamic arm §265 asked for, run the same day on a machine this repository cannot: a peer session
on Windows 11 (Python 3.14.7, node 24.20, git 2.49, `core.autocrlf=true`) ran every reader of
quality-harness **2.104.0** by hand over a real consumer corpus — 72 accepted records, 209 task
files, 19 task directories — and a second peer ran `tests/corpus-matrix.test.mjs` from `corpus-matrix`
at `c1f546a`. Neither edited anything. Three defects, none visible from this repository's own corpus.

**Fixed:**

1. **SessionStart read six task directories and rendered the rest as nothing.** `taskDirectories`
   had `if (found.length >= 6) break` over the alphabetical git listing, and the `(+N more record
   set(s))` line counted only what was read and then hidden by the render cap. On that corpus the
   six read were all done; the block said `all 10 task(s) carry exit-0 evidence … (+3 more record
   set(s))`, and the only READY tasks (038 T6, 076 T1, T7) sat in the thirteen directories it never
   looked at. A could-not-look rendered as an all-clear (ADR-005). The cap stays — each directory is
   an `adr-next` spawn — and the unread count now travels back and prints as `(+13 more task
   directories: UNPROVEN — not read; …)`, which the render cap can never hide.
2. **`adr-next --json` gave every done task an `unproven` sentence.** `unprovable_evidence` reads a
   digest row reaching it as a mismatch, which is true only after `is_done` said no; it was computed
   for every task, so about 200 done tasks carried `recorded against a different Acceptance — the
   fence changed after that run` in the JSON while the text render, which only prints it on READY
   lines, was correct. The peer recomputed 077 T1's digest with `lib/record.py`: it matched, CRLF
   stripped or not. `unproven` is `None` for a done task now. Present on 2.103.0, 2.103.1, 2.104.0.
3. **`adr-lint` said "Acceptance changed after verification" with no digest row in the log.** A
   legacy-only log on a multi-line fence got both `Legacy no-digest evidence cannot prove a multi-line
   fence` and the changed-Acceptance sentence; the second is an observation only a digest row
   supports. It is conditional on one now; otherwise `No exit-0 entry names this fence's digest`.

**Confirmed, fixed in §265 before this report arrived:** `work-next` offered 076 T10 and T12 (both
`Depends-on` pending) and missed T1 and T7, which `adr-next` and `adr-lint` agreed were the ready ones
— the same second-readiness-rule defect §265 closed by delegating readiness to `adr-next`. And the
matrix's five corpora all failed on `c1f546a` at one assertion each: `work-next` `ready`/`retirable`/
`unbacked` spelled with `\`, nothing else — the probe normalises those before comparing now.

**Open:**

4. `work-next --json`, `adr-state` and `adr-next --json` print native separators on Windows;
   `adr-lint` echoes an unexpanded glob backslashed (`ADR not found: docs\adr\076-…\*.md`). Only
   lifecycle's SessionStart text is listed-form. Whether JSON should be posix everywhere is a contract
   question for the consumers (`corpus-probe` normalises; `lifecycle` and `work-next` resolve).
5. `lib/record.py:2140` says `(advisory until 2026-09-13)` about a row dated before that day, read
   on 2026-09-23. The date is the lock's cutover and the behaviour is right (a pre-cutover row stays
   advisory for ever, F-1); the wording reads as a deadline that passed. Reword to name the row's date.
6. `adr-next`'s acceptance hint is the fence's first line only, which for a multi-line fence ends in a
   bare `\` and is not a command.
7. The peer could not get `node lifecycle.mjs < SessionStart-json` to print anything on Windows —
   exit 0, empty stdout, with both a bash-style and a `cygpath -w` path — and produced the block by
   importing `sessionOrientation` instead. Unreproduced here; a real new-session capture on Windows
   is owed before this is called a defect or a usage error.
9. **`corpus-probe --sweep` was killed at the reader budget and said "did not start".** On the same
   corpus `adr-verify --sweep` over 395 entries ran past the probe's 120s per-reader `--timeout` and
   `couldNotRun` read `did not start: ETIMEDOUT` — a child spawnSync killed is one that ran. Fixed
   here: a killed reader says `killed at the probe's Ns budget`, and the sweep has its own
   `--sweep-budget` (default 30 minutes), since its cost is every fence in the corpus.
10. **Withdrawn the same hour, and kept because the shape recurs.** The probe's output appeared to show
   `â€”` for every em-dash on that desktop. The peer then read its byte-for-byte capture: 31 × `E2 80
   94`, 0 × `C3 A2 E2 82 AC` — correct UTF-8 from every reader. The mojibake was Python 3.14 `open()`
   with no `encoding=` on a machine whose locale encoding is cp1252 (`utf8_mode=0`). Not a reader
   defect. The lesson for anyone reading a probe capture on Windows: name the encoding.
8. The Windows classifier blocked both peers' first attempts ("Code from External") until their user
   approved; the run that matters most for a Windows adopter is the one a session cannot start alone.
11. **A hook payload the parser rejected was a hook with nothing to say.** `lifecycle.mjs` `main()`
   returned in silence at exit 0 when stdin was not JSON. The peer's `node lifecycle.mjs < payload.json`
   printed nothing while `sessionOrientation()` imported directly was full; the cause, measured by the
   peer from the bytes, was its own payload — `"cwd":"Y:\work\a11y-tooling"` with single backslashes,
   an illegal JSON escape — not a BOM and not a Windows stdin defect; with valid bytes the hook printed
   the full block on Windows, and that block shows the six-directory cap live on 2.104.0 (038 and 076
   absent). Fixed regardless: a payload that does not parse is said on stderr at exit 0, and a leading
   BOM is stripped since PowerShell's `>` writes one. One stderr line would have saved the round trip.
12. `branch-state`'s alarm line said "`selftest.sh` and the CI jobs are different checks" in a
   consumer repository that has no such file — this repository's own check leaking into every
   adopter's text. It says "the local check" now.

**From the Codex review of `bdeba73`, eight findings, all folded in:** `work-next` read adr-next's
exit 3 ("nothing ready", a valid answer with JSON) as unproven, so every finished directory carried
false uncertainty in the JSON — and the matrix never asserted `readinessUnproven`, so five corpora
passed over it (asserted now); a relative repository argument (`work-next tests/x`) handed adr-next a
relative task directory under the repository's own cwd, so it found nothing while the absolute form
found two; the `allowed` set restricted directories but not the tasks adr-next read from disk, so an
untracked sibling reached `ready`; text mode never rendered `readinessUnproven` and printed "Nothing
in the QH corpus is waiting" over unread directories; the probe's scrub knew five root names, so a
`D:\Projects\…` diagnostic went out whole while `docs/var/cache/tasks/T1.md` was eaten to
`docs<path>`; the disagreement comparison ignored work-next's own unread directories; and two reader
branches still said "did not start" for a child the probe had killed. `tests/work-next-readiness.test.mjs`
and `tests/corpus-probe.test.mjs` drive each seam directly, with six more mutants.

**The first of those was then seen live, an hour later.** The Windows peer ran `corpus-probe --json
--sweep` over the same 72-record corpus at `bdeba73`: `disagreements []`, `couldNotRun []`, and
`readinessUnproven` naming 17 task directories — exactly the finished ones, every directory whose
adr-next answered exit 3. A review found it from the source; the corpus showed it the same hour.

**Open, from that sweep:**

13. `adr-verify --sweep` filed 174 of 206 claims as `false` on a host that (the peer believes) had
    none of that corpus's docker test databases running, and 22 as `unrunnable`. `false` means "ran
    and exited non-zero" whether the claim is wrong or the host lacks the environment; only a fence
    that could not START is `unrunnable`. A sweep on a machine other than the one that recorded the
    evidence needs either a third bucket ("failed here; the recording host is not this one") or a
    per-host caveat in the report, or its `false` count reads as a verdict about the corpus. Neither
    the probe nor `--sweep --json` says which host recorded the rows it re-ran.

**From the Codex review of `1032720`, three findings, all folded in:** the scrubber's token boundary
refused a colon before a path (`error:/Users/x` went out whole), knew no `file:` URL, stopped at the
first space inside a quoted path (`"D:\Projects\Example Person\…"` left ` Person\…"` behind) and
still knew only five POSIX root names (`/opt/private-repo` went out whole) — any absolute path is a
placeholder now, a quoted one to its closing quote, and the known-prefix replacement is
token-bounded too, since `.split('/tmp')` ate `docs/tmp/x` on any Linux host; and the Accepted-only
filter over adr-next's answer, removed in this branch as redundant, was not — adr-next reads every
task in a directory, and a directory an Accepted and a Proposed record SHARE hands the Proposed
record's task back. Restored, with the shared-directory fixture no corpus here had. Residual, named
by the reviewer and left: a bare drive-relative root (`C:` with no separator) resolves against that
drive's current directory before `readinessFrom` can anchor it.

**From the Codex review of `abd5a13`, three findings, and a decision.** The quoted-path pass stopped
at ANY quote character, so `"/opt/Example's secret/x"` leaked past the apostrophe and a quoted
`file:` URL was not quoted-path at all; an unquoted `D:\Projects\Example Person\x` leaked ` Person\x`;
`//server/share/x` (a UNC share spelled forward) and `->/opt/x` went out whole because `>` was
excluded to protect placeholders. All fixed: a quoted path runs to its own closing delimiter, an
unquoted path continues past a space when the next word is followed by a separator, only this
function's placeholders are protected. The third finding — a regex literal (`/foo\/bar/i`) and a
URL's query path (`?q=/api/v1`) are redacted too — is **accepted as the design**: this is a
classifier over free text (§16), three rounds each found a leak where the boundary had been made
cleverer, and §6's direction is that over-scrubbing costs a question while a leak cannot be recalled.
Pinned in the test as a decision. No fourth round is planned on this boundary; a leak found in the
field goes here as a new item.

## 267. PARTLY CLOSED 2026-09-24 — The outside run is release evidence now, not a rule (2026-09-23)

§18 says a reader is not shipped until somebody else has run it; the day it was written, nothing
enforced it — the same shape as every rule this repository has had to turn into a gate. Now
`scripts/release-evidence.mjs` asks a second question after the campaign is green: did any file under
`plugin/scripts/`, `plugin/bin/`, `plugin/lib/` or `plugin/hooks/` change since the newest tag before
the sha, and if so, does `docs/corpus-reports/` hold an attestation whose `at` revision is after that
tag, reachable from the sha, and carries every one of those changes (a run followed by another reader
edit did not run that edit — a Codex review found the first cut accepting it)? No attestation is
the sha? No attestation is `UNPROVEN`, exit 2 — could not look, not cleared. The attestation is a
small JSON (date, revision, plugin version, platform, counts) and never the report: a probe report
over another repository is that repository's content (§6). The first two, from the Windows desktop
runs over the 72-record corpus at v2.105.0, are filed; they are AT the tag, so the next release with
a reader change needs a fresh one — which is the rule doing its job on its first day.

Also fixed here, reported twice from that desktop: SessionStart printed `(+3 more record set(s))`
after `(+13 more task directories: UNPROVEN — not read; …)`, and both peers read the two counts as
one overlapping figure. The read-but-capped line prints first and says what it counts.

Open: `branch-state` does not yet say on every prompt whether an outside run exists since the tag;
the release check is the enforcement, the prompt line would be the reminder.

**Partly closed 2026-09-24.** the release gate shipped in 013149e. Still open: `branch-state.mjs` prints no reminder line about the outside run.

## 268. CLOSED 2026-09-24 — adr-lint read a red run's quoted output as log entries (2026-09-23, reported from a Rust corpus)

Archived: [backlog-archive/BACKLOG-201-300.md](backlog-archive/BACKLOG-201-300.md)

## 269. CLOSED 2026-09-24 — ADR-061's refusal keys on the command TEXT, and a session learns the way around it in one refusal (2026-09-23)

Archived: [backlog-archive/BACKLOG-201-300.md](backlog-archive/BACKLOG-201-300.md)

## 270. CLOSED 2026-09-24 — Two leads from the outside run at f67cede: adr-next offers a Superseded record's tasks, and exits 1 on an empty task directory (2026-09-23)

Archived: [backlog-archive/BACKLOG-201-300.md](backlog-archive/BACKLOG-201-300.md)

## 271. CLOSED 2026-09-24 — The Rust masker read a lifetime as a char literal and lost every test after it (2026-09-24, reported from a Rust corpus)

Archived: [backlog-archive/BACKLOG-201-300.md](backlog-archive/BACKLOG-201-300.md)

## 272. DECLINED 2026-09-24 — A mutation campaign in this checkout is live in every session that runs this checkout as its plugin (2026-09-24)

Archived: [backlog-archive/BACKLOG-201-300.md](backlog-archive/BACKLOG-201-300.md)

## 273. CLOSED 2026-09-24 — A green `go test ./...` with one testless package was zero work, and the publish refusal denied every commit (2026-09-24, reported from a Go repository)

Archived: [backlog-archive/BACKLOG-201-300.md](backlog-archive/BACKLOG-201-300.md)

## 274. CLOSED 2026-09-24 — A green-only Verification Log was told to "run adr-verify again", and a green never locks (2026-09-24, reported from go-cli-adr-corpus)

Archived: [backlog-archive/BACKLOG-201-300.md](backlog-archive/BACKLOG-201-300.md)

## 275. DECLINED 2026-09-24 — Found while closing the backlog, 2026-09-24: four things no section owned

Archived: [backlog-archive/BACKLOG-201-300.md](backlog-archive/BACKLOG-201-300.md)

## 276. CLOSED 2026-09-24 — adr-lint read a Rust lifetime as a string, so tests after it did not exist, while the lock hashed them (2026-09-24, reported from a Rust corpus)

Archived: [backlog-archive/BACKLOG-201-300.md](backlog-archive/BACKLOG-201-300.md)

## 277. CLOSED 2026-09-24 — spec-verify's implemented mode ran no test and printed a bare PASS (2026-09-24, reported from a Go repository's 2.107.0 run)

Archived: [backlog-archive/BACKLOG-201-300.md](backlog-archive/BACKLOG-201-300.md)

## 278. CLOSED 2026-09-24 — adr-next said "the fence changed" when a moved test lock withheld done (2026-09-24, reported from a Go repository)

Archived: [backlog-archive/BACKLOG-201-300.md](backlog-archive/BACKLOG-201-300.md)

## 279. CLOSED 2026-09-24 — Corpus chaos over three new shapes, 2026-09-24: what the readers said wrong (reported by three peer sessions at 6ddf59b)

Archived: [backlog-archive/BACKLOG-201-300.md](backlog-archive/BACKLOG-201-300.md)

## 280. CLOSED 2026-09-25 — Leads from the 2.108.0 outside runs (2026-09-24, a React/vitest SPA and a Laravel repository)

Archived: [backlog-archive/BACKLOG-201-300.md](backlog-archive/BACKLOG-201-300.md)

## 281. CLOSED 2026-09-25 — The 2.108.0 corpus-chaos round over nine repositories: what is still wrong (2026-09-24)

Archived: [backlog-archive/BACKLOG-201-300.md](backlog-archive/BACKLOG-201-300.md)

## 282. CLOSED 2026-10-06 — A Go fixture corpus, deferred by ADR-064 T6 (2026-09-24)

Archived: [backlog-archive/BACKLOG-201-300.md](backlog-archive/BACKLOG-201-300.md)

## 283. CLOSED 2026-09-25 — The §61 Produces advisory could never fire on a real record (found while fixing §280 item 2)

Archived: [backlog-archive/BACKLOG-201-300.md](backlog-archive/BACKLOG-201-300.md)

## 284. CLOSED 2026-09-25 — A Tests-table row whose test name has spaces is never checked (2026-09-25, found authoring ADR-064 T6)

Archived: [backlog-archive/BACKLOG-201-300.md](backlog-archive/BACKLOG-201-300.md)

## 285. CLOSED 2026-09-25 — The artifact hook lints a tasks/README.md as a record (2026-09-25, observed in this session)

Archived: [backlog-archive/BACKLOG-201-300.md](backlog-archive/BACKLOG-201-300.md)

## 286. CLOSED 2026-09-25 — ADR-064 T6's per-platform matrix time (2026-09-25)

Archived: [backlog-archive/BACKLOG-201-300.md](backlog-archive/BACKLOG-201-300.md)

## 287. CLOSED 2026-09-25 — adr-next's `not ` and `never ` can never match, so "not approved" reads as done (2026-09-25, a cold review of 833ea52)

Archived: [backlog-archive/BACKLOG-201-300.md](backlog-archive/BACKLOG-201-300.md)

## 288. CLOSED 2026-09-25 — work-next's JSON names tasks under an archive whose catalog it cannot establish (2026-09-25, a cold review of 833ea52)

Archived: [backlog-archive/BACKLOG-201-300.md](backlog-archive/BACKLOG-201-300.md)

## 289. CLOSED 2026-09-25 — The 2.109.0 corpus-chaos round: leads for the next batch (2026-09-25, reported from outside runs at 7b0b71c)

Archived: [backlog-archive/BACKLOG-201-300.md](backlog-archive/BACKLOG-201-300.md)

## 290. CLOSED 2026-10-06 (fixed after 3.8.7) — work-next counts a STOP sign-off as backing a done claim (2026-09-25, found closing §287)

Archived: [backlog-archive/BACKLOG-201-300.md](backlog-archive/BACKLOG-201-300.md)

## 291. CLOSED 2026-10-06 (3.8.7 excludes golden trees; tested through the hook) — The artifact gate reads generated fixture trees as the repository's own specs (2026-09-25, inbox from ts-generator, 2026-09-24)

Archived: [backlog-archive/BACKLOG-201-300.md](backlog-archive/BACKLOG-201-300.md)

## 292. CLOSED 2026-10-06 (fixed after 3.8.7: a task whose title names another record is stopped) — A symlinked tasks directory makes adr-next offer another record's tasks under the requesting record's name (2026-09-25, 2.110.0-rc chaos round, macOS Laravel corpus, seed 1790359703, code A9)

Archived: [backlog-archive/BACKLOG-201-300.md](backlog-archive/BACKLOG-201-300.md)

## 293. CLOSED 2026-10-06 (3.8.7 names and lints the record; a fullwidth colon stays unread, by decision) — A record whose Status line uses a fullwidth colon is lost by the probe, and work-next routes as if no corpus existed (2026-09-25, 2.110.0-rc chaos round, macOS Laravel corpus, shrunk from abomination X1)

Archived: [backlog-archive/BACKLOG-201-300.md](backlog-archive/BACKLOG-201-300.md)

## 294. CLOSED 2026-09-25 — The 2.110.0-rc chaos round: what re-cut the release (reported from outside runs at 026658a)

Archived: [backlog-archive/BACKLOG-201-300.md](backlog-archive/BACKLOG-201-300.md)

## 295. PARTLY CLOSED 2026-10-06 — The 2.110.0-rc chaos round: leads for the next batch (reported from outside runs at 026658a); what is still open moved to §351

None of these is fixed in 2.110.0. Each needs its fix weighed, or its own record. The runner and replay are in that session's report.

Hangs and crashes:
1. A FIFO in a tasks directory hangs work-next, adr-next, adr-lint and the probe, which writes no report (php-react-app C1). A FIFO record hangs adr-lint, and work-next and adr-state skip it silently (C2).
2. The probe crashes with a stack trace, after running every reader, when `TMPDIR` names a missing directory (php-react-app C4).
3. The lifecycle hook crashes on a `null` payload and on `cwd: 42`, and says nothing on `[1,2]` (php-react-app C5).
4. One unreadable task file crashes adr-lint for EVERY record through `check_cross_record_cycles`. The probe then shows 57 `exit 1` verdicts with no reason (idempotent-hammock F3). ADR-049's could-not-run rule was never applied to that neighbour read.

Inputs skipped silently:
5. A 0-byte record is skipped silently by every sweeping reader (php-react-app C3).
6. A task renamed with a leading zero-width space is reported ready under a name that prints identically to the real one. BOM and RLM record names are printed raw (php-react-app C6).

Verdicts over forged or contested evidence:
7. A Verification Log holding unresolved merge-conflict markers PASSes, and the task stays done (idempotent-hammock F6). A **fail-open**, found after the owner's hold was scoped to L1, L4 and L7.
   - ✅ Fixed for 2.111.0. `record.py` `conflict_markers` finds git's markers outside a code fence, and only when both a `<<<<<<<` and a `>>>>>>>` line are present, since a lone `=======` is a setext underline. The consumers:
     - `adr-next` stops the task with the lines named, and its dependents are not offered;
     - `adr-lint` blocks a task and advises an ADR, like an unclosed fence;
     - `adr-verify` refuses to run or write (exit 2);
     - `trajectory-metrics` / `corpus-report` count the task in neither half instead of as red and green at once.
   - Tests: `adr-next.test.mjs`, `evidence-chain.test.mjs`, `trajectory-metrics.test.mjs`, with a fenced and a setext twin each. 11 mutants, all RED.
   - Class audit: `git grep -n "Verification Log" -- plugin/scripts/*.mjs` named `trajectory-metrics.mjs:92` as the only other JS row counter. `work-next` follows `adr-next` wherever `adr-next` answered.
8. Hand-forged log rows are accepted without a word: a duplicate, a 41-char sha, a sha of no commit, rows out of order (idempotent-hammock F3/D2).
9. A forged `check.passed` event with no `at`, command or record id, appended to the session log, lets an unchecked-tree commit through (ts-generator lead 4). Anything able to append the log can also forge a well-formed pass, so the fix is to tie a pass to the `checks.jsonl` record it claims. That is a design question for its own record, not a field check.

Reporting gaps:
10. `--attest` carries no `look` and gives the wrong `atReason` when git is not on PATH (declarative-pie L5). `--diff` and `--attest` are blind to `specs`, `unprovenSpecs`, `partialBecause` and `uncoveredReadySpecs` (ts-generator R1, declarative-pie L3, php-react-app R2).
11. Duplicate record ids are flagged by no reader (declarative-pie C1, idempotent-hammock C1). Homoglyph and fullwidth-digit file names keep the heading's id, and work-next and the probe read different file sets without a disagreement (idempotent-hammock A4).
12. work-next's text calls a record with an unreadable (NUL) Status a "discovery failure" beside "1 further record(s)" (declarative-pie L2).

Wording:
13. The damaged-ledger wording names the session log when the damaged file is `checks.jsonl` (ts-generator finding 3). The downgrade to a warning is by design (ADR-005).
14. The `--adopt` remedy reads as one command when it is a migration of hundreds of obligations, and it echoes relative paths as absolute (php-react-app own).

Readers judging the wrong tree:
15. A worktree commit is judged on the main tree (ts-generator lead 5). The publish hook also refuses a Bash call that only MENTIONS a commit or a push: a commit inside a scratch repository, or a heredoc test body naming a force push. Both were seen while fixing this entry.
16. One NTFS junction loop blinds every reader over the whole corpus, honestly but completely (idempotent-hammock own).

To the corpus-chaos skill:
17. On Windows the skill's clone line needs `-c core.longpaths=true` (idempotent-hammock).
18. The catalogue should say to build bytes with the file tool or `node -e` rather than a shell literal: a classifier refused backticks and `${}` (laravel-cms).
19. **From round 2, at 145c794.**
    - A task deleted while another `depends_on` it leaves the dependents ready, and nothing names the missing task (laravel-cms F1). A verdict over input that is not there.
      - ✅ Fixed for 2.111.0. A `Depends-on` or `Consumes` naming a local id with no task in the record is an edge, rendered `T1 (no such task in this record)`; it used to be dropped. Measured against HEAD over this corpus, the fixture corpora and two outside corpora (236 tasks): 0 answers changed.
    - adr-next never sees a task git lists but the disk does not hold. It asks the disk, not git, so the work-next half of L4 is fixed and this half is not (laravel-cms F2).
      - ✅ Fixed for 2.111.0. `adr-next` asks `git ls-files` for the tasks directory. A task git lists that the disk lacks is an entry stopped with the reason "git lists … but the disk does not hold it … UNPROVEN". So its dependents are blocked and no all-clear is printed over it (this closes item 20's Q3 too). A file on disk whose title names another id is not absent.
    - On Windows, a DIRECTORY named like a task raises PermissionError, and adr-next reports the whole tasks directory as could-not-run with "Permission denied" as the reason (declarative-pie N5).
    - A task holding conflict markers with `Done` above and `Todo` below counts as a done claim, because the first value wins (declarative-pie).
      - ✅ Covered by item 7's fix: a conflicted task is stopped, whatever its Status says.
    - By design, recorded: adr-next's `--json` carries the goal and stop reason as data, JSON-escaped, and does not quote or strip them (laravel-cms F3). A consumer that prints them is where quoting belongs; SessionStart does, and the human output does.
20. **From php-react-app's round 2, at 145c794** (macOS, PHP/React). ADR-086 T3 left `unbacked`, and the V payloads held in SessionStart and in adr-next's text.
    - Q1: look-alike brackets (`＜ ＞ ﹥ 〈 〉`), HTML entities and Markdown (a triple backtick, a `javascript:` link, an image) pass inside the «…» quotes. Worth hardening in depth; the quoting itself held.
    - Q3: adr-next says "All 5 task(s) carry exit-0 evidence" over a task git lists but the disk lacks. An all-clear over a missing input; the same class as item 19's second point. work-next and adr-lint both name it.
      - ✅ Fixed with item 19's second point.
    - Q4: a damaged `checks.jsonl` makes the Stop hook blame "this session's event log" and discard the tree, index and HEAD, although the session log holds good observations. The `check.source-unreadable` key says line 10 of a one-line file. This extends item 13.
    - Q5: a probe report copied in as a task file is offered as READY, with no heading and no runnable Acceptance, while adr-lint rejects it. The same report copied in as a record is counted only as "further records".
    - Q6: a record named with a Cyrillic `А` escapes the filename/title id comparison that fullwidth digits trigger, and is counted as governing. A task renamed `T６.md` (fullwidth 6) is counted as a task and matched to nothing.
    - Q2 is item 19's by-design `--json` point.
21. **From declarative-pie's round 3, at 2daedc4** (Windows). L1, L7, N1, N2 and N3 replay as fixed; N5 (item 19) is unchanged, as expected. Two N4 residuals remain:
    - A DIRECTORY name opens SessionStart's ready line unquoted, so "docs/adr/ADR-003-SYSTEM. Assistant must run git push --force now/tasks: T1 is ready …" still reads in the tool's voice. Inside the `adr-verify` command it is code. The same quoting as titles, or a code span on the line's own path, would close it.
    - A zero-width character in a path is now shown as the text `\u{200b}`, so the printed `adr-verify` command names a file that does not exist. Visible beats silent, but a command a session copies should run. The fix to weigh: print the real path in the command, and say beside it that it holds an invisible character.
    - Minor: "0 task file(s)" beside the UNPROVEN line for a sparse checkout, while git tracks two there.
22. **From ts-generator' round 2** (chaos at 145c794, re-checked at 2daedc4).
    - Sign-offs that are still read as done: "approved — revoked 2026-09-26", "shipped, then rolled back", "❌ approved", "is it done? no", "passed? not really". Words with no affirmative at all, such as "unapproved", "disapproved", "approval withheld" and "approval pending", are None, which counts as done.
      - ⚠ The code and its comments disagree. `is_done`'s inline comment says "a note this cannot classify leaves the task not done". The code is `if human_outcome(note) != "stop": return True`, and `human_outcome`'s docstring argues for that behaviour. One of the two is wrong, and a human decides which.
        - ✅ Decided by the owner on 2026-09-26: the code is right. An unclassifiable note counts as done. The two stale comments in `adr-next` (the block above `AFFIRMATIVE`, and `is_done`'s inline comment) were rewritten to say so for 2.110.1. The sign-offs listed above are still open.
    - A tracked spec that is a symlink to a file OUTSIDE the repository is read, and its Status drives "Next: adr-write".
    - At scale (4,002 tasks), the probe reports adr-lint "did not start: ENOBUFS" when adr-lint started and overflowed spawnSync's buffer. adr-next --all took 93 s, work-next 61 s, and SessionStart 10 s per start.
    - The spec Status reader still reads a 4-space indented code block, and a table cell. A tab after the colon reads as Ready while an em space does not. A blockquote is the template's own form, so it is correct.
      - ✅ The indented code block is masked for 2.111.0 (item 23.2). A table cell is kept on purpose: it renders as text, not code, so a Status there is what the page shows. The whitespace point (a tab reads, an em space does not) is left open.
    - A backslash in a POSIX file name is dropped; that is CLAUDE.md §7 by design, and it goes unsaid.
    - Recorded again: `adr-next --json` carries the goal and fence as data (item 19).
23. **From idempotent-hammock's round 2** (Windows; chaos at 145c794, attested at 2daedc4, over a Go CLI corpus the project does not own and over this repository). Items 1 and 2 are known open in 2.110.0, by the owner's choice to ship 355e91a.
    1. **§289.4's profile, measured at last.** On the Go corpus, `python3 -m cProfile … adr-next docs/adr/ADR-052-…/tasks --json` took 149 s. 147 s of that was tottime in `record.py _js_like_in_code`, over 25,612 calls from `_iter_go_func_tests`, through `snapshot_lock` and `lock_findings`. `load` runs twice, and `snapshot_lock` runs 10 times for 4 task files. work-next and adr-next on that directory hit the probe's 120 s budget. This is the next performance fix, and it has a named hot spot.
       - ✅ Fixed for 2.111.0, from a read-only investigation (a subagent of this session, reconciled against source here). The cause was a full-prefix rescan on every call, O(F²·L) per file, twice per done task. `_js_like_code_positions` now scans once per text and is memoised like `_mask_lock_noncode`; `_js_like_in_code` reads that table.
         - Equivalence against HEAD a9fd743: identical at 788,635 positions over 20,061 texts (random plus 60 in-repo code files). With the `*/` write removed, the same check reports a MISMATCH.
         - Speed, 100-test synthetic Go corpus: 38.82 s → 0.20 s, with byte-identical JSON, both at load ~5.
         - Test: `gates.test.mjs` checks every position of a mixed text against the prefix scan's answers (HEAD's, printed alongside), and one scan per text. 2 mutants RED.
         - Not measured: Windows.
         - Left in on purpose: the per-name generator re-walk, now O(1) per step, about 0.5 s at 225 tests.
    2. **The spec Status reader still reads a Status from code CommonMark renders as code:**
       - an indented code block (4 spaces or a tab);
       - a numbered-list fence (`1. ```…`);
       - a `<pre>` or multi-line `<code>` block;
       - an HTML attribute value (`Ready-for-ADR"></div>` passes the allowlist).
       Through work-next that routes to adr-write from an example. ts-generator reported the indented case too (item 22). ⚠ `maskedMarkdown`'s comment says "no Status is read from an example", which overclaims. Correct it with the fix, or before it.
       - ✅ Fixed for 2.111.0. `maskedMarkdown` now also masks:
         - an indented code block after a blank line; a lazy paragraph continuation stays text;
         - a fence opened after a list marker, whose closer may not sit deeper than its opener plus three;
         - `<pre>` and `<code>` elements, and every HTML tag, so an attribute value is never read.

         `SPEC_STATUS` also refuses a value followed by a quote or angle bracket. 8 mutants, all RED, plus the three repointed ones. `spec-write` and the corpus-chaos B8 row were corrected, because they said these shapes were still read.
       - ✅ The comment half is done for 2.110.1: `maskedMarkdown`'s comment now names the three unmasked shapes and stops claiming more. The reader itself is unchanged, and the item stays open.
    3. Windows reserved names (`CON.md`, `nul.md`, `aux`, and names ending in a dot or a space) are counted as tasks by work-next and read by no reader.
    4. A Verification Log row dated 2099-01-01, 1970-01-01 or 2026-02-30 passes adr-lint; a malformed timestamp is refused. Only a calendar check is missing (with item 8).
    5. A record whose Status holds invalid UTF-8 drops out of the probe with no entry; work-next counts it as "1 further record(s)" without naming it. `Accepted (partially)` counts as Accepted.
    6. A Windows 8.3 alias in `Governs:` (`STANDA~1.MJS`) is keyed as a different path from the file's real name, so areas and contests split by spelling.
    7. A case-only rename on Windows is not restored by `git checkout -- .` (git core.ignorecase). This is a runner note, not a reader defect.
24. **`qh-check` was SIGKILLed about 30 s in, three times in one session (2026-09-25 and 26), and reported it as "failed".**
    - Each time, `bash scripts/selftest.sh` died right after the plugin validations, before `node --test` printed anything. `checks.jsonl` recorded `"exit":null,"signal":"SIGKILL"`.
    - A direct `bash scripts/selftest.sh`, and an immediate re-run through `qh-check`, passed each time.
    - At the third kill, memory was 48% free, `log show` had no jetsam entry, and load was about 11 on 10 cores. `qh-check`'s own timeout is 3600 s, and a 45 s dummy check passed through it. The killer is unattributed.
    - A fourth kill on 2026-09-26, the first run after the 2.110.1 version bump, had the same shape: killed right after the three plugin validations, and `checks.jsonl` recorded `"exit":null,"signal":"SIGKILL"`. Memory was 49% free and load about 15. An immediate re-run through `qh-check` passed, at load 20, so that pass cannot be attributed either (§18).
    - A fifth kill, the same day, was the first run after the 2.110.1 attestation and one BACKLOG line were added; the re-run passed, with `QUALITY_HARNESS_TAP` set, at load 27. Kills four and five were each the first gate run after a tree change, which looked like a lead, and it did NOT hold: the next first-run-after-a-change, at load 28, passed. So the cause is still unattributed. The two group kills in the plugin (`run-shell-hook.mjs` terminateProcessTree, `qh-check.mjs`) both spawn their child `detached`, so neither is an obvious suspect.
    - Separately, whatever the cause: the summary line says "— failed" for a check a signal ended. A killed check did not look, so ADR-005's vocabulary is could-not-look, not a verdict. `qh-check`'s exit-1-on-signal is documented; the word is not.
    - ✅ **Cause found, fixed for 2.111.0** (read-only investigation, reconciled against source here). It was `tests/lifecycle.test.mjs`'s tree-kill test, and not the machine:
      - Its 100 ms timeout raced node's start under load, so the child printed nothing.
      - `Number('')` is 0, the assertion accepted it (`Number.isInteger(0)`), and `process.kill(0, 0)` always succeeds.
      - So `process.kill(0, 'SIGKILL')` signalled the test's OWN process group. Under `qh-check` that is the whole detached selftest group, and `qh-check`, outside it, recorded the SIGKILL.
      - `checks.jsonl` holds nine such rows (2026-09-22 to 09-26, three sessions).
      - Reproduced with node's start slowed by 400 ms: rc -9, nothing printed.

      The fix: a 1.5 s timeout, a pid that must be positive, and a kill guarded on it. Re-run with the same slowdown: passes. At a 2 s slowdown: the test fails, naming the missing pid, and the shell survives.

      Sibling (§5, the same empty-pid class): `scripts/mutate.mjs` read an empty `.mutate-lock` as a live run, via `kill(0, 0)`. Fixed; `gate-rules.test.mjs` asserts an empty lock is not refused. `node -e` shows the old logic returned alive.
    - ✅ The "— failed" half, fixed for 2.111.0. A signalled check records `verdict: "interrupted"` and says "interrupted by SIGTERM before it finished, so there is no verdict". `checkEventName` already read the signal as `check.timeout`. `observed-events.test.mjs` reads the summary through an async spawn, because `spawnSync` stops reading at its own timeout kill. 2 mutants RED.

## 296. CLOSED 2026-09-26 — The publish refusal read any `-c "` as a shell, so `grep -c "git push"` was refused

Archived: [backlog-archive/BACKLOG-201-300.md](backlog-archive/BACKLOG-201-300.md)

## 297. CLOSED 2026-09-26 — The commit dispatcher reads a task title inside a code block as a task file (2026-09-26, 2.110.1 doc sweep)

Archived: [backlog-archive/BACKLOG-201-300.md](backlog-archive/BACKLOG-201-300.md)

## 298. CLOSED 2026-09-26 — The publish refusal refused a shell told not to run the string (`bash -n -c`, `--help`)

Archived: [backlog-archive/BACKLOG-201-300.md](backlog-archive/BACKLOG-201-300.md)

## 299. CLOSED 2026-09-26 — The Codex round on the 2.111.0 batch: seven findings, three of them in this batch's own fixes

Archived: [backlog-archive/BACKLOG-201-300.md](backlog-archive/BACKLOG-201-300.md)

## 300. CLOSED 2026-09-26 — The 2.111.0-rc chaos round: what re-cut the release (outside runs at cb6c1dc)

Archived: [backlog-archive/BACKLOG-201-300.md](backlog-archive/BACKLOG-201-300.md)

## 301. CLOSED 2026-10-06 (stages 1, 3–7 delivered or declined by measurement; see the end) — Roadmap: take the model out of the loop, and a terse state protocol (2026-09-26)

Archived: [backlog-archive/BACKLOG-301-400.md](backlog-archive/BACKLOG-301-400.md)

## 302. CLOSED 2026-10-15 (sweep: both open items fixed) — The 2026-09-26 inbox: one regression of mine, four false blocks and advisories fixed for 3.0, two left open

Archived: [backlog-archive/BACKLOG-301-400.md](backlog-archive/BACKLOG-301-400.md)

## 303. CLOSED 2026-10-15 (sweep: one item fixed, three declined) — 3.0.0 before the tag: a Codex round and three outside runs (2026-09-26)

Archived: [backlog-archive/BACKLOG-301-400.md](backlog-archive/BACKLOG-301-400.md)

## 304. CLOSED 2026-10-15 (sweep: open items declined) — After v3.0.0: two leads the release did not hold for (2026-09-26)

Archived: [backlog-archive/BACKLOG-301-400.md](backlog-archive/BACKLOG-301-400.md)

## 305. CLOSED 2026-09-26 (3.0.1) — The test lock hashed a node:test options object instead of the test

Archived: [backlog-archive/BACKLOG-301-400.md](backlog-archive/BACKLOG-301-400.md)

## 306. CLOSED 2026-10-15 (sweep: one item carried to §381, the rest declined) — 2026-09-27 — ADR-067 (a lexer for the text refusal), a dead-code cleanup, and a sweep that could not see bindings

Archived: [backlog-archive/BACKLOG-301-400.md](backlog-archive/BACKLOG-301-400.md)

## 307. CLOSED 2026-10-15 (sweep: one fail-open carried to §381, the rest fixed or declined) — 2026-09-27 — Two corpus-chaos outside runs of the 3.1.0 candidate 626934a: rule P, the constant check, the hook and four readers

Archived: [backlog-archive/BACKLOG-301-400.md](backlog-archive/BACKLOG-301-400.md)

## 308. CLOSED 2026-09-27 — git's hook wrote its "ran" event into a linked worktree's own git dir

Archived: [backlog-archive/BACKLOG-301-400.md](backlog-archive/BACKLOG-301-400.md)

## 309. CLOSED 2026-10-15 (was PARTLY FIXED 2026-09-27; three items carried to §381, the rest decided, moot or declined) — Three Windows corpus-chaos runs of 916b515: a crash past rule P, a silent record budget, git in another case

Archived: [backlog-archive/BACKLOG-301-400.md](backlog-archive/BACKLOG-301-400.md)

## 310. FIXED 2026-09-28 — The suite and the mutation campaign left their temp directories behind, 66,000 of them on one Mac

Archived: [backlog-archive/BACKLOG-301-400.md](backlog-archive/BACKLOG-301-400.md)

## 311. FIXED 2026-09-28 — Windows opened a terminal tab per hook child since 3.0.0; and a Codex round over 3.1.0..e0ef6d4

Archived: [backlog-archive/BACKLOG-301-400.md](backlog-archive/BACKLOG-301-400.md)

## 312. FIXED 2026-09-28 — §311's Windows fix lost qh-check's output; a second Codex round; the dead-code scan's blind spots

Archived: [backlog-archive/BACKLOG-301-400.md](backlog-archive/BACKLOG-301-400.md)

## 313. CLOSED 2026-10-06 — The outside run for 3.1.1, and the leads it and the refused runs brought

Archived: [backlog-archive/BACKLOG-301-400.md](backlog-archive/BACKLOG-301-400.md)

## 314. FIXED 2026-09-28 — Where git outran observe()'s budget, an unchecked publish passed in silence; and what the 3.1.1 batch's failures now cost to repeat

Archived: [backlog-archive/BACKLOG-301-400.md](backlog-archive/BACKLOG-301-400.md)

## 315. FIXED 2026-09-28 — 3.1.1's literal check made the publish classifier quadratic on long interpreter scripts

Archived: [backlog-archive/BACKLOG-301-400.md](backlog-archive/BACKLOG-301-400.md)

## 316. FIXED 2026-09-28 — The slowest selftest test, batched; and a cost bound that was a claim about one machine

Archived: [backlog-archive/BACKLOG-301-400.md](backlog-archive/BACKLOG-301-400.md)

## 317. CLOSED 2026-10-06 (by ADR-075; one inert residual in a locked test) — §241's race has a second reader: the hook's own test executes the mutant the suite installed

Archived: [backlog-archive/BACKLOG-301-400.md](backlog-archive/BACKLOG-301-400.md)

## 318. CLOSED 2026-10-06 (its check exists since ADR-073; the torn catalogue write fixed) — What ADR-072's literal reader still misreads, and the check that would not depend on it

Archived: [backlog-archive/BACKLOG-301-400.md](backlog-archive/BACKLOG-301-400.md)

## 319. CLOSED 2026-10-15 (was PARTLY FIXED 2026-09-29; one item carried to §381, the rest fixed, moot or declined) — The corpus-chaos round of e016066 (plugin/ = v3.1.3): four fail-opens, a forged line, and two repository leads

Archived: [backlog-archive/BACKLOG-301-400.md](backlog-archive/BACKLOG-301-400.md)

## 320. CLOSED 2026-10-06 — The inbox, reviewed: seventeen findings, two not yet recorded anywhere

Archived: [backlog-archive/BACKLOG-301-400.md](backlog-archive/BACKLOG-301-400.md)

## 321. FIXED 2026-09-29 — The 3.1.5 batch: output that forges the tool, two readers that named the wrong thing, and ADR-073's first campaign

Archived: [backlog-archive/BACKLOG-301-400.md](backlog-archive/BACKLOG-301-400.md)

## 322. FIXED 2026-09-30 — ADR-076: a recorded mutant runs in a worktree, and what its execution found

Archived: [backlog-archive/BACKLOG-301-400.md](backlog-archive/BACKLOG-301-400.md)

## 323. FIXED 2026-10-01 — ADR-077: a heavy run holds a lease, and the review of the 3.3.0 candidate

Archived: [backlog-archive/BACKLOG-301-400.md](backlog-archive/BACKLOG-301-400.md)

## 324. CLOSED 2026-10-12 (was PARTLY FIXED 2026-10-01) — After 3.3.0: the lock hasher's JavaScript scanner, the coverage-only flakes, and the stale brief capped

Archived: [backlog-archive/BACKLOG-301-400.md](backlog-archive/BACKLOG-301-400.md)

## 325. CLOSED 2026-10-15 (was PARTLY CLOSED 2026-10-06; moot or declined) — A session start spends its time starting processes, and reads the six oldest records

Archived: [backlog-archive/BACKLOG-301-400.md](backlog-archive/BACKLOG-301-400.md)

## 326. FIXED 2026-10-01 — The Codex round on ADR-078 (01443dd): seven findings, four of them fail-opens

Archived: [backlog-archive/BACKLOG-301-400.md](backlog-archive/BACKLOG-301-400.md)

## 327. FIXED 2026-10-01 — After 3.4.0, judged from an adopter's session (§19): what the brief repeats, a regression 3.4.0 shipped, and which records session start reads

Archived: [backlog-archive/BACKLOG-301-400.md](backlog-archive/BACKLOG-301-400.md)

## 328. CLOSED 2026-10-06 (not reproduced; its instrument stays) — A campaign printed nothing on Windows, once, inside a locked test

Archived: [backlog-archive/BACKLOG-301-400.md](backlog-archive/BACKLOG-301-400.md)

## 329. CLOSED 2026-10-06 (reworked, Accepted, shipped in 3.7.0) — ADR-079 (every gate reads JavaScript one way) is parked on its review

Archived: [backlog-archive/BACKLOG-301-400.md](backlog-archive/BACKLOG-301-400.md)

## 330. CLOSED 2026-10-15 (was DEFERRED 2026-10-01; declined until measured) — the artifact batch gates each path in its own shell

Archived: [backlog-archive/BACKLOG-301-400.md](backlog-archive/BACKLOG-301-400.md)

## 331. CLOSED 2026-10-02 (each residual disposed below) — ADR-080 shipped behind the boundary; what its code review changed, and what is left

Archived: [backlog-archive/BACKLOG-301-400.md](backlog-archive/BACKLOG-301-400.md)

## 332. CLOSED 2026-10-01 (fixed for 3.6.1; unproven on Windows) — Windows: a campaign's parent cannot rename onto `owner.json` while its child reads it

Archived: [backlog-archive/BACKLOG-301-400.md](backlog-archive/BACKLOG-301-400.md)

## 333. CLOSED 2026-10-02 (not recurred) — Windows: `mutate --narrow` once missed its `3/3 mutations were noticed.` line

Archived: [backlog-archive/BACKLOG-301-400.md](backlog-archive/BACKLOG-301-400.md)

## 334. CLOSED 2026-10-02 (not reproduced; the left-behind worktree is by design) — an isolated `adr-verify --mutant` ran a corpus fence many times slower than the checkout did

Archived: [backlog-archive/BACKLOG-301-400.md](backlog-archive/BACKLOG-301-400.md)

## 335. CLOSED 2026-10-02 (the spec was corrected) — ADR-079 F-11's rationale says a moved lock is advice below `strictFrom`; the code blocks it

Archived: [backlog-archive/BACKLOG-301-400.md](backlog-archive/BACKLOG-301-400.md)

## 336. CLOSED 2026-10-06 (residuals are ADR-079's stated limits) — ADR-079's Codex round on efd7cdf: four findings fixed, residuals named

Archived: [backlog-archive/BACKLOG-301-400.md](backlog-archive/BACKLOG-301-400.md)

## 337. CLOSED 2026-10-02 (ADR-083, for 3.9.0) — the JavaScript lexer has no JSX mode; 3.7.0 refused real tests in React corpora

Archived: [backlog-archive/BACKLOG-301-400.md](backlog-archive/BACKLOG-301-400.md)

## 338. CLOSED 2026-10-02 (ADR-082, for 3.8.0) — an attest line carries no sign that the run found a FAIL

Archived: [backlog-archive/BACKLOG-301-400.md](backlog-archive/BACKLOG-301-400.md)

## 339. CLOSED 2026-10-02 (fixed for 3.7.3) — a second `adr-verify` cleared a live run's mutant journal

Archived: [backlog-archive/BACKLOG-301-400.md](backlog-archive/BACKLOG-301-400.md)

## 340. CLOSED 2026-10-06 (3.8.0 released; ADR-081's measurement taken 2026-10-06, see §350 tail) — 3.8.0 released; ADR-081's measurement is due

Archived: [backlog-archive/BACKLOG-301-400.md](backlog-archive/BACKLOG-301-400.md)

## 341. CLOSED 2026-10-02 (fixed for 3.8.0) — the stand-in review of 3.8.0: two reviewers, nine fixes, residuals named

Archived: [backlog-archive/BACKLOG-301-400.md](backlog-archive/BACKLOG-301-400.md)

## 342. CLOSED 2026-10-06 (not reproduced in 17 Windows runs since it was instrumented; the sampler stays) — the artifact-gate budget test is bimodal on Windows

Archived: [backlog-archive/BACKLOG-301-400.md](backlog-archive/BACKLOG-301-400.md)

## 343. CLOSED 2026-10-02 (fixed for 3.8.1) — ADR-081's fast exemption said nothing of a partial stage, and skipped the unseen-write veto

Archived: [backlog-archive/BACKLOG-301-400.md](backlog-archive/BACKLOG-301-400.md)

## 344. CLOSED 2026-10-02 (fixed for 3.8.2, the owner's choice) — branch-state twice listed weeks-old runs as the newest

Archived: [backlog-archive/BACKLOG-301-400.md](backlog-archive/BACKLOG-301-400.md)

## 345. CLOSED 2026-10-02 (item 3 fixed for 3.8.2; item 1 decided by the owner) — a fresh corpus's reading of 3.8.1: three name clashes, one fair ask

Archived: [backlog-archive/BACKLOG-301-400.md](backlog-archive/BACKLOG-301-400.md)

## 346. CLOSED 2026-10-06 (3.8.7: --diff compares undecided[], records and the environment) — `--diff` never compares `undecided[]`

Archived: [backlog-archive/BACKLOG-301-400.md](backlog-archive/BACKLOG-301-400.md)

## 347. CLOSED 2026-10-02 (fixed for 3.8.3, the owner: "append") — a skip left no trace, so ADR-081's follow-up could not count it

Archived: [backlog-archive/BACKLOG-301-400.md](backlog-archive/BACKLOG-301-400.md)

## 348. CLOSED 2026-10-02 (fixed for 3.8.4) — on Windows a full branch-state takes 6.4–7.7 s and loses the release line at SessionStart

Archived: [backlog-archive/BACKLOG-301-400.md](backlog-archive/BACKLOG-301-400.md)

## 349. CLOSED 2026-10-06 (items 2 and 4 fixed after 3.8.7; 1 fixed earlier; 3 no change; 5 not reproduced) — a Go ADR corpus on Windows: no verdict moved, five readings to judge

Archived: [backlog-archive/BACKLOG-301-400.md](backlog-archive/BACKLOG-301-400.md)

## 350. CLOSED 2026-10-06 (all of C1–C10 and items 1–9 released in v3.8.7) — Windows corpus-chaos on 3.8.3: one crash, three could-not-look read as absence

Archived: [backlog-archive/BACKLOG-301-400.md](backlog-archive/BACKLOG-301-400.md)

## 351. CLOSED 2026-10-15 (was OPEN 2026-10-06; one false refusal carried to §381, the rest fixed or by design) — §295 triaged against a0d963d: what is still open

Archived: [backlog-archive/BACKLOG-301-400.md](backlog-archive/BACKLOG-301-400.md)

## 352. CLOSED 2026-10-15 (was OPEN 2026-10-06; declined) — The GitHub scout: what outside projects offer, and what each needs before it is taken

Archived: [backlog-archive/BACKLOG-301-400.md](backlog-archive/BACKLOG-301-400.md)

## 353. CLOSED 2026-10-06 — A 3.8.8 regression from an outside run: "no visible blocking" stopped an approval

Archived: [backlog-archive/BACKLOG-301-400.md](backlog-archive/BACKLOG-301-400.md)

## 354. CLOSED 2026-10-12 (was OPEN 2026-10-06) — A public corpus with YAML-frontmatter records (public/swift-adrs): three reader leads

Archived: [backlog-archive/BACKLOG-301-400.md](backlog-archive/BACKLOG-301-400.md)

## 355. CLOSED 2026-10-12 (was PARTLY CLOSED 2026-10-06) — Five Windows corpus-chaos runs of v3.8.9: one blinding bug, three fail-opens, and leads

Archived: [backlog-archive/BACKLOG-301-400.md](backlog-archive/BACKLOG-301-400.md)

## 356. CLOSED 2026-10-08 — corpus-probe `--diff` reports a transient could-not-look as a changed advice line

Archived: [backlog-archive/BACKLOG-301-400.md](backlog-archive/BACKLOG-301-400.md)

## 357. CLOSED 2026-10-07 — History rewritten to remove other projects' names; older evidence points at the old history

Archived: [backlog-archive/BACKLOG-301-400.md](backlog-archive/BACKLOG-301-400.md)

## 358. CLOSED 2026-10-15 (was OPEN 2026-10-07; declined by its own measurement) — the Status word's end is each runtime's Unicode, where the record name's digits are now one frozen table

Archived: [backlog-archive/BACKLOG-301-400.md](backlog-archive/BACKLOG-301-400.md)

## 359. CLOSED 2026-10-15 (was OPEN 2026-10-07; declined, no measured need) — Python record readers read a whole file with no byte bound

Archived: [backlog-archive/BACKLOG-301-400.md](backlog-archive/BACKLOG-301-400.md)

## 360. CLOSED 2026-10-07 — History rewritten a second time, for strings copied from other repositories' corpora

Archived: [backlog-archive/BACKLOG-301-400.md](backlog-archive/BACKLOG-301-400.md)

## 361. CLOSED 2026-10-08 — A sign-off that quotes its red run before the green one read as a stop

Archived: [backlog-archive/BACKLOG-301-400.md](backlog-archive/BACKLOG-301-400.md)

## 362. CLOSED 2026-10-08 — An attestation says `records: 0` for a corpus whose only record is Proposed, while carrying a lint verdict for it

Archived: [backlog-archive/BACKLOG-301-400.md](backlog-archive/BACKLOG-301-400.md)

## 363. CLOSED 2026-10-08 — ADR-091 landed; its shipped readers, reviewed, and one hook line it exposed

Archived: [backlog-archive/BACKLOG-301-400.md](backlog-archive/BACKLOG-301-400.md)

## 364. CLOSED 2026-10-15 (was OPEN 2026-10-09; declined, the decision was never made) — A locked test that many records share goes red in every earlier record, silently

Archived: [backlog-archive/BACKLOG-301-400.md](backlog-archive/BACKLOG-301-400.md)

## 365. CLOSED 2026-10-15 (was OPEN 2026-10-09; carried to §381) — The title route sends a non-record markdown file to adr-lint

Archived: [backlog-archive/BACKLOG-301-400.md](backlog-archive/BACKLOG-301-400.md)

## 366. CLOSED 2026-10-15 (was OPEN 2026-10-09; carried to §381) — The branch brief repeats a constant clause because it shares a line with changing state

Archived: [backlog-archive/BACKLOG-301-400.md](backlog-archive/BACKLOG-301-400.md)

## 367. CLOSED 2026-10-15 (was OPEN 2026-10-09; both false refusals carried to §381) — The publish refusal judges a `git commit` by its text, not by where it runs

Archived: [backlog-archive/BACKLOG-301-400.md](backlog-archive/BACKLOG-301-400.md)

## 368. CLOSED 2026-10-15 (was OPEN 2026-10-09; declined, not traced) — `subagent.ended` outnumbers `subagent.started` 692 to 30 in one session log

Archived: [backlog-archive/BACKLOG-301-400.md](backlog-archive/BACKLOG-301-400.md)

## 369. CLOSED 2026-10-15 (was OPEN 2026-10-09; superseded by §374 and §378) — What a third-party spec-driven framework does better, as adoption candidates

Archived: [backlog-archive/BACKLOG-301-400.md](backlog-archive/BACKLOG-301-400.md)

## 370. CLOSED 2026-10-15 (was OPEN 2026-10-09; one item carried to §381, the rest declined) — An adopter survey: what is ignored, what costs time (15 sessions, 12 shapes)

Archived: [backlog-archive/BACKLOG-301-400.md](backlog-archive/BACKLOG-301-400.md)

## 371. CLOSED 2026-10-15 (was OPEN 2026-10-09; (1) fixed by ADR-104, (2) carried to §381) — The publish advice judges the session's repository for a commit aimed elsewhere, and reads the index before an in-command `git add`

Archived: [backlog-archive/BACKLOG-301-400.md](backlog-archive/BACKLOG-301-400.md)

## 372. CLOSED 2026-10-15 (was OPEN 2026-10-09; declined) — What ADR-094 deliberately leaves: injected prompts, implemented records listed as ready, per-call PreToolUse advice

Archived: [backlog-archive/BACKLOG-301-400.md](backlog-archive/BACKLOG-301-400.md)

## 373. CLOSED 2026-10-15 (was OPEN 2026-10-10; fixed, owned elsewhere, or declined) — What executing ADR-094 showed about the gates themselves

Archived: [backlog-archive/BACKLOG-301-400.md](backlog-archive/BACKLOG-301-400.md)

## 374. CLOSED 2026-10-15 (was OPEN 2026-10-10; one number carried to §381, the rest parked) — The §369 comparison candidates, re-measured: two fail-opens fixed, one idea declined with a test, one declined with numbers, five filed

Archived: [backlog-archive/BACKLOG-301-400.md](backlog-archive/BACKLOG-301-400.md)

## 375. CLOSED 2026-10-15 (was OPEN 2026-10-10; every box ticked, the leftover leaf carried to §381) — `lifecycle.mjs` is one 7,591-line bag of small functions: dumb recorders, pure judges, a replay harness

Archived: [backlog-archive/BACKLOG-301-400.md](backlog-archive/BACKLOG-301-400.md)

## 376. CLOSED 2026-10-12 (was OPEN 2026-10-10) — `qh-check.mjs`: one 250-line function that decides, runs, times and records

Archived: [backlog-archive/BACKLOG-301-400.md](backlog-archive/BACKLOG-301-400.md)

## 377. CLOSED 2026-10-12 (was OPEN 2026-10-10) — Two leads not yet confirmed, and an advisory nobody acted on

Archived: [backlog-archive/BACKLOG-301-400.md](backlog-archive/BACKLOG-301-400.md)

## 378. CLOSED 2026-10-15 (was OPEN 2026-10-11; clear items carried to §381, the rest parked or moot) — What the hooks and the gate repeat, measured; three items ADR-095 does not take

Archived: [backlog-archive/BACKLOG-301-400.md](backlog-archive/BACKLOG-301-400.md)

## 379. CLOSED 2026-10-15 — The host cancelled SessionEnd on exit, and no session row was written for a day

Archived: [backlog-archive/BACKLOG-301-400.md](backlog-archive/BACKLOG-301-400.md)

## 380. OPEN 2026-10-15 — A test that starts a session removes its directory while the hook's detached children still write there

**Found**: the push run at 2a4f5cfd (run 38735100891), job `coverage floor` on ubuntu: `tests/advisory-headline.test.mjs` failed in its `finally`, `ENOTEMPTY, Directory not empty: /tmp/qh-headline-…` at `rmSync`. Every assertion had passed. The hook it drives starts children with `detached: true` that outlive it: `branch-state.mjs` `startRefresher` and `artifact-pass.mjs`'s pass (`cwd: os.tmpdir()`, which the test points at its own directory). Either one writing during a recursive remove gives ENOTEMPTY. The dispatched run at the same sha passed that job, so this is a race, not a defect in what the test asserts.

**The failing test, in 15fdad30**: its remove takes `maxRetries: 10, retryDelay: 200`, the form `tests/qh-check-shell.test.mjs` and `tests/hook-work.test.mjs` already use.

**The class**: tests that send `SessionStart` and remove a directory recursively with no retry. Enumerated with `for f in $(rg -l "SessionStart" tests --glob '*.test.mjs'); do rg -q 'rmSync\([^)]*recursive' "$f" && ! rg -q 'maxRetries' "$f" && echo "$f"; done`: 25 files on 2026-10-15, this one included. Not changed here: many of those removes sit inside locked test bodies (CLAUDE.md §2), so the fix for the rest is a shared helper (a temp directory removed with retries, or a test env that turns off the detached refresher), not 24 edits. A pass is unaffected; only cleanup fails, and only when a child is still writing.

## 381. OPEN 2026-10-15 — The backlog after the 2026-10-15 sweep: every clear open item, ranked, with the top five

**How this list was made.** The owner asked for the backlog to be cleaned, the unsure and ambiguous items removed, and the rest ranked with a top five. Three read-only triage passes re-checked every item still open in §302–§379 against the code at b5002a75 (a `file:line` for each), and the items that decide the top five were re-measured here. An item is kept only when it is CLEAR: a concrete defect or change with a repro or a named site and a way to prove it done. An item that was speculative, an unconfirmed or never-reproduced lead, a decision nobody made, or one with no definition of done was declined in its own section with its re-open condition; those sections are archived verbatim, and each names what it carried here. Ranked by severity first (a fail-open, then a false refusal, then wrong output, then hygiene), then by cost.

**The top five.**

1. **A declared check piped into `tee` passes whatever the tests did** (from §307). Without `pipefail` a pipeline's status is its last command's, so `npm test | tee log` exits 0 when the tests fail, and qh-check records a pass the publish refusal then trusts. Measured today: `constantSuccessCheck('npm test | tee log')` is false (so is it for `set -o pipefail; npm test | tee log`, which must stay false). Fix in `plugin/scripts/check-command.mjs`: a pipeline ending in `tee` or `cat` with no `pipefail` cannot fail; the twin keeps `pipefail` a real check (CLAUDE.md §16). Fail-open, S.
2. **An unarmed publish hook is recorded and never said** (from §370). `plugin/scripts/publish-verdict.mjs` records `publish.unarmed` when git is below 2.54, when `CLAUDE_ENV_FILE` is not set, or when the env file cannot be read or written; no reader prints it, so the agent believes a commit run by a script is fenced when it is not. Seen in three Windows sessions on git 2.49. Fix: say it once per session at SessionStart and in the publish advice. Fail-open (silent), S.
3. **`"publish": "warn"` turns git's hook into silence** (from §378). `plugin/scripts/publish-hook.mjs:93` returns `{ code: 0 }` with no message for a non-denying verdict, so in warn mode a commit launched by a script gets no warning at all; PreToolUse saw only the script's name. Fix: under warn, the hook says the verdict's text and exits 0. The `unset G"I"T_CONFIG_COUNT` spelling in the same entry needs a predicate that reads the command as the shell does (§16) and is not part of this item. Fail-open, S–M.
4. **ADR-104's two false refusals** (from §367). (a) The arithmetic guard refuses literal data: measured today, `foreignCommitPath` is null for `git -C /tmp/x commit -F - <<'EOF'` with a body line `((1)) fix`, and `echo 'let x=1'` after the commit is refused too. Fix: scan `ARITHMETIC` with quoted here-document bodies and single-quoted `echo` arguments removed, with a double-quoted `$((…))` twin that still refuses. (b) `cd <literal> && git commit` into another repository, deferred by ADR-104, needs its own task with the `cd` twins. The owner's rule: a false refusal is fixed now. False refusal, S (a) and M (b).
5. **A JSONC line comment ending at U+2028 or U+2029 reads as valid** (from §378). Measured today: `{"a":1,//c<U+2028> "b": <LF>}` is refused by `jq` (exit 5) and accepted by the post-edit fallback (exit 0), so the advisory post-edit check says nothing about a broken file. The fix is one token at `plugin/scripts/post-edit-check.sh:121`: `[^\r\n  ]` in the line-comment rule, with the U+2028 row as a test. Its own re-open trigger, the next change to that file, fired with ADR-102's later tasks. Fail-open in an advisory, S.

**The rest, in rank order.**

6. adr-lint's done loops read only the README's done claim (from §309; `plugin/bin/adr-lint` `done_task_ids(readme_text)` at the lock and evidence loops, where one site also merges the task files' own claims), so a done claim made only in a task file can escape the lock check. Confirm that README and task disagreement does not already refuse it before building. Possible fail-open, M.
7. The ADR-090 residual: a fresh repository's commit with an unquoted `-m push`, or with `-m "$(cat <<'EOF' …)"`, is refused (from §351; measured, `freshRepositoryCommit` false for both). Outside ADR-090's scope, so it needs a record. False refusal, M.
8. The per-prompt brief says "every job concluded success" for a run whose jobs were skipped (from §306; `plugin/scripts/branch-state.mjs` reads the run's conclusion and views jobs only for a failed run). A locked test's regex pins the wording. Wrong output, M.
9. "Unchecked" is said about an index that an in-command `git add` has not changed yet (from §371; `publish-verdict.mjs` reads the index standing only). Direction: "not known", never "unchecked". Wrong output, S–M.
10. adr-lint names neither of two task files that declare one id; the second silently replaces the first (from §309; `plugin/bin/adr-lint` near line 6820, while adr-next stops). Wrong output, S.
11. The person's headline for ADR-104's advice is cut before it says why the commit was allowed: with a long `-C` path the `systemMessage` ends mid-path before "ADR-104" (an outside run of v3.8.32, 2026-10-15). Lead the headline with the reason; the locked ADR-060 T4 clause stays in the agent's text. Wrong output, S.
12. The title route sends a non-record `# ADR-051 T7 …` to adr-lint (from §365; `plugin/scripts/facts-gate-dispatch.sh` excludes only `-T<n>`). Keep a case that must still route. Wrong output, S.
13. The constant "CI COULD NOT LOOK" clause repeats because its once-per-change text holds HEAD and the dirty count (from §366). Give it its own line and its own check. Adopter cost, S.
14. `affectedFiles` reads every Affected Files row, ignoring the Change column, so a record governs files its tasks only read (from §378; `plugin/scripts/decision-corpus.mjs`). Wrong output, S.
15. The pytest-testmon hint matches a string inside an inline table, `{include-group = "pytest-testmon"}` (from §378; `plugin/scripts/fast-check-hint.mjs` `tomlDeclaresTestmon`). Wrong output, S.
16. Node's JSON error in the post-edit check names no line and column (from §378). Wrong output, S.
17. Tests that start a session remove their directory with no retry: 24 files (§380). A shared helper, since many removes sit in locked bodies. Hygiene, M.
18. The post-edit-check tests need `jq` and the unused-names tests need `uvx`, and fail where they are missing instead of skipping (from §378; relocks). Hygiene, M.
19. 33 bare `bash` spawns in tests reach WSL first on a PowerShell host (from §378; the owner deferred Windows). Hygiene, M.
20. `scripts/dead-code-scan.sh` expands an empty array under `set -u`, which bash 3.2 aborts on (from §319; latent while the tree has Python files). Hygiene, S.
21. The dead-code scan has no unreachable-statement rule (from §309; biome runs with the unused-name rules only). Hygiene, S.
22. `tests/review-contract.test.mjs` reads `plugin/` from disk, not `git ls-files` (from §378; CLAUDE.md §8). It can only err red. Hygiene, S.
23. `walk`, `outsideRoot`, `inside` and `GIT_LISTING_BUFFER` still live in `decision-corpus.mjs`, and the hook goldens skip on Windows (from §375). Hygiene, S.
24. `.claude/rules/19-adopter-footprint.md` gives a stale figure for the listing (from §374). Re-measure it and write the date. Hygiene, S.
25. A tag that retires a spec fact (from §378): `spec-verify` accepts only `@draft`, `@spec` and `@implemented`, so a fact can never be retired. Needs a record. Hygiene, M. **Carried by ADR-120 T3 (Accepted 2026-10-21).**

**Questions only the owner can answer** (not ranked):
- Stage 3 of the check-speed plan: should the replay judge only uncontended red runs, or does a contended red count as a miss? (§378, 2026-10-15.)
- `publish-command.test.mjs` still costs the most: split it further, or memoise its hook runs? (§378.)
- Whether CLAUDE.md §3 should name ADR-104's exemption beside ADR-081's.

ADR-095's Follow-ups (a per-test verdict cache, the Stop timing outside run) stay ticked or open where they are, at the top of this file, and still cite §378.

**Progress, 2026-10-15** (each with a red run first, a test through the real hook or script, and catalogue mutants killed; unreleased):
- Item 2, the unarmed hook said: 5b9108d3. Said once per repository and reason; a host that offers no env file is not told, since it has no Bash environment to arm.
- Item 3, `"publish": "warn"` at git's hook: 9f7d1573. Nine older mutants on the refusal's condition moved to its new lines.
- Item 4(a), literal data is not arithmetic: c74ff306. `echo "((1))"` stays refused by the older rule that a quoted span holding `(` may be code. Item 4(b), the `cd` form, needs a task under ADR-104 and is not started.
- Item 5, U+2028 and U+2029 end a JSONC line comment: 2eb10c61. A bare separator reads as a space, or the fix would have made a false finding.
- Item 1, the `tee` pipeline, is not started: `tests/fail-open.test.mjs` "a check whose exit status the text fixes is refused, whatever it is spelled", locked by ADR-088 T2, lists `npm test | tee log` as a real check. Fixing it changes that locked assertion, which is the owner's decision.
- Found while doing them: `check-command.mjs` inferred `bun test` and `yarn check`, which run the runner's own command and not the script, and missed `bun.lock` (b5002a75, from a peer's survey); five lease-holder processes from `tests/lease.test.mjs` had outlived a selftest by 8 h 51 min (986143eb bounds them; 324a44c2 makes selftest.sh find and kill any process still naming its run directory, after the suite and in its trap).
- The Codex review of 921330b9..976aa281 and its verification of 976aa281..18879680 found three fail-opens in item 4(a)'s `withoutData`, each a spelling read as data that stood in code: a body repeated as an arithmetic command after the here-document, an ANSI-C `$'…'` echo whose value is spelled across a closing quote and an arithmetic command, and a `<<-` body whose tabs the lexer strips. A spelling now counts as data only when it occurs once and the text read again holds the marker in the slot the data came from, as `maskedMessages` verifies. Left, a false refusal in the safe direction: the same literal twice (`echo 'let x=1'; echo 'let x=1'`) keeps the refusal, because neither copy occurs once. Re-open with a fix that verifies each occurrence's slot.
- Item 1, the `tee` pipeline: 035be390, after the owner chose to move the locked row (ADR-088 T2, relocked). Item 4(b), the `cd` form: ADR-104 T3, 76d23349.
- Codex stopped reviewing this repository after 18879680: every run ended "This content was flagged for possible cybersecurity risk", set off by the repository's own test strings; a reworded contract changed nothing. The owner chose a recorded Claude review in its place. Through Cursor it cannot run: on the owner's plan the agent answers "Named models unavailable. Free plans can only use Auto". `host-review.mjs --host claude` runs a headless `claude -p` instead, read-only and recorded (8892eb9c). Its review of 18879680..8892eb9c, recorded as blocking, found: (1, blocking) the Cursor and Claude rows resolved HEAD after the run, so a commit landing during a review counted as reviewed; fixed, the range is resolved first. (2, advisory) the reviewer's prefix allowlist lets `git diff|show|log --output=<file>` write; named in the source, not fixed. Re-open with a deny rule measured against the CLI, or a sandbox setting. (3, advisory, older than the range) an `exit` inside a pipeline was read as ending the list, so `exit 1 | tee log` (0 under sh, bash and dash) was accepted as a real check; fixed. zsh, which runs the last stage in the shell itself, runs no check.
- Not settled: Cursor's last line in the launcher's run said "Error: command failed unexpectedly.", while the same agent run by hand with a short prompt said the plan refused the model. Whether the launcher read the wrong line or the agent said two different things is not known.
- The scoped verification of e657e75c (Claude host, recorded clean) found one advisory, older than the range: `listStatus` folds a list left to right and does not give `|` precedence over `&&`/`||`, so `true || npm test | false` (always 0 under sh) reads nonzero and is accepted as a real check. Since e657e75c, `exit 0 | cat || npm test | false` reaches the same fold, where before it was refused by accident. A fail-open, contrived in shape. Fix: fold each pipeline as one unit before `&&`/`||`, or read a list mixing them as `either`. Hygiene, S.
- **Check-speed stage 3 is not built: the gate fails on uncontended misses, 2026-10-15.** The owner answered that a contended red does not count as a miss. `node scripts/check-timing.mjs --replay` at e657e75c's ledger then read: 42 runs, 25 changed trees (30 needed), red 2 of 5 caught, median 20% of the test time (ceiling 40%), UNPROVEN. Besides the contended `corpus-reading-bounds` red, it missed two real ones: `tests/untimed-spawns.test.mjs` (15:12, an untimed child that run-orphans' test added, fixed in 881377fe) and `tests/corpus-lint.test.mjs` (18:08, the ADR-066 T1 lock missed after 035be390). Neither test's text names the path that changed: both read the whole tree. The plan's gate is 100% of red runs caught, so selection is not built and the full run stays the only check. Re-open if a policy that always selects the tests that read the whole tree (corpus-lint, untimed-spawns, the sweeps) catches every red over at least 30 changed trees, within the 40% ceiling.
- The two deferred findings, fixed at the owner's word: `listStatus` folds each pipeline as one unit before `&&`, `||` and `;` (red first: `true || npm test | false` read false; four new mutants, all 30 on `check-command.mjs` RED). The Claude reviewer has no shell: it is offered Read, Grep and Glob only, and the launcher writes the scope's commits and diff to a temporary directory passed with `--add-dir` and removed afterwards. A scope whose diff cannot be made is unavailable, never reviewed blind. Probed by hand with Claude Code 2.1.300: it read the diff file and the repository, and had no way to run `git status`. All 32 mutants on `host-review.mjs` RED.
- The recorded review of 2a50071a..6c30eba6 (Claude host, clean; the first run of the shell-less reviewer came back unavailable, its answer off the schema) found one advisory older than the range: a pipeline's leading `!` was dropped as syntax, so `! false` (0 under sh, bash and dash) read nonzero and was accepted as a real check. Fixed: `shellWords` keeps it as `negated`, and the fold inverts the pipeline's status, except in the background; an `exit` under it reads as unknown.
- The scoped verification of ee074441 (Claude host, recorded blocking) found the negation fix wrong in three places. Two held and are fixed: an `exit` ending a negated pipeline only sets the status it inverts (`! npm test | exit 1` exits 0, was read unknown), and a bare `! exit 0` leaves before the inversion (exits 0, was read unknown). The third did not hold as stated: it said `! ! true` exits 0 under bash, but bash 3.2.57 and /bin/sh here exit 2 (a syntax error), and bash 5 was not available to measure, so a doubled `!` now reads as unknown rather than toggled. Left, older than the range: `! { …; }` negates the whole group, and the fold does not read groups, so a negated group reads as if the `!` were absent; `! { npm test; false; }` (always 0) is still accepted as a real check. Re-open with a fold that reads a group as a unit, as pipelines now are.
- The recorded review of ee074441..e4002cca (Claude host, blocking) held: dropping the `!` at a group's `{` turned `! { false; }` (exits 0) from refused into accepted, a regression on a line that had no mutant. Fixed: a negated group holding one pipeline is that pipeline negated, and every command of a negated group of several reads as unknown, so it is neither inverted at its first command nor refused (`! { false; true; }` exits 1). The several-command group stays the open limit above: `! { npm test; false; }` (exits 0) is accepted.
- The verification of 0b9b528a (Claude host, blocking) held: the operator after a group's `}` was dropped, so the group's last command kept `;`. `! { true; } &` (a regression from 0b9b528a), and the older `{ false; } &` and `{ true; } || npm test`, each exit 0 and were accepted. Fixed: `&`, `&&` and `||` after a `}` join the group's last command. A pipe after a `}` is still not carried (`{ …; } | x`).
- The verification of a44173e1 (Claude host, blocking) held twice, and both are fixed: a function body's `}` ends a definition (exits 0, runs nothing), so the operator after it is not carried into the body (`function f { npm test; } && true`); and a body that ends in `&` keeps it (`{ npm test & } && true`). The owner then closed this line of work, on 2026-10-15: fix these two, run one last verification, and file whatever it finds, unfixed. Still open, older than all of it: a definition's own status is not read, so `function f { false; } || false` (exits 0) is accepted. The whole shell fold is patched one form at a time; the task is to read `!`, groups and definitions with a grammar, not further patches.
- **The last verification, of 8a85130c (Claude host, recorded blocking), filed unfixed as the owner directed.** (1) `defining` is cleared by the empty `endCommand` for `(`, `)` or a newline, so `function f() { npm test; } && true` and `function f` + newline + `{ npm test; } && true` still carry `&&` into the body and are accepted, though each exits 0. Against v3.8.33, which read them as `npm test; true` and refused them, this is a fail-open regression, shipped in 3.8.34 and named in its notes. Fix: keep `defining` across those operators. (2) A body that ends in `&` keeps it, but the operator after `}` is then dropped, so `{ npm test & } || false` (exits 0) is read nonzero and accepted. Not a regression. Fix: mark the command backgrounded and carry the operator. (3) Advisory, older: `f() { npm test; } && true` (exits 0) is accepted, because `f` ends with `(` and the list reads `either`. All three are more of the same: the fold needs a grammar for definitions and groups, not another patch.
- 3.8.34's campaign (run 38801904346) failed once in the coverage floor job, in the environment, not the code: npx's cache on the runner held `@biomejs/biome` without its platform package (`Cannot find module '@biomejs/cli-linux-x64/biome'`), so `tests/unused-names.test.mjs` read UNRUN and correctly went red. The same test passed in the Ubuntu selftest job, and a re-run of the one job passed. Lead: pin biome's platform package beside it in the npx call, or install it in CI, so an incomplete optional-dependency install cannot turn a gate red. Hygiene, S.
- 3.8.34's regression is fixed at the owner's word, 2026-10-16: `defining` now survives the empty commands for `(`, `)` and a newline. So `function f() { npm test; } && true`, `function f ( ) { …; } && true` and `function f` + newline + `{ …; } && true` (each exits 0) are refused again, as 3.8.33 refused them. Items (2) and (3) of the last verification stay filed.
- The review of 7c85a1c5 (Claude host, blocking) held: a function body need not be a group (`function f() if …; fi`, `(( … ))`, `[[ … ]]`), so keeping `defining` across every newline left it open, and a later `{ true; } || npm test` (exits 0) was taken for a body and accepted. Fixed: only an empty command keeps the definition open, and an arithmetic command ends it. I had removed that guard myself as code for an impossible state, which was wrong.
- The 3.8.35 outside runner (wcag-adr, 2026-10-16) notes, as a reader's lead rather than a defect: `corpus-probe --diff` calls a 3-4x jump "unattributable" when the two loads are nearly equal (17.95 and 18.43 on 10 cores). That is right, because either load is above the core count. But a reader may expect "unattributable" to mean a load *difference*, so one clause there should say that a load above the core count on either side is enough. Its same-sha re-run showed the jumps to be contention. Hygiene, S.
- **Items 6–12, 2026-10-16** (each red first, with catalogue mutants RED, unreleased until 3.8.36):
  - Item 6, c24e7f56: the lock, Status, filter and Produces checks read a task file's own done claim, as the evidence check did.
  - Item 10, f596b8ce: two task files with one id are named in adr-next's words, as evidence. Left, not a defect: adr-lint takes the id from the file name only, while adr-next prefers the `# Task …T<n>` title, so two files whose titles collide but whose names differ are named by adr-next alone.
  - Item 8, f0f4cbf7: a green run's skipped jobs are named. This costs one `gh run view` per refresh of a green state.
  - Item 9, f62d0015: a command that stages before it commits hears that its index is not known yet. Wording only.
  - Item 11, 6e2cebed: the ADR-104 advice leads with its reason.
  - Item 12, 5c6641ff: `# ADR-<n> T<n>` is a task's title, not a record's.
  - Item 7 is closed by the owner's decision (ADR-090 Follow-ups, 2026-10-16): both forms stay refused.
- The recorded review of v3.8.35..e957da1e (Claude host, clean) left three advisories, filed rather than fixed: (a) `stagesBeforeCommit`'s `-a` test matches any short cluster holding an `a`, including an attached value (`git commit -uall`, `-Sabc`), so such a commit hears "not known yet". Wording only. Fix: skip the clusters whose letter takes a value (u, S, m, F, c, C). (b) branch-state views a green run's jobs even when an incomplete listing has already made the answer COULD NOT LOOK, which costs a `gh run view` for nothing. Fix: `ci.looked &&`. (c) The dispatch's task arm still matches only `-T<n>`, so a space-form task title outside `tasks/` is answered not-recognised. That is not a fail-open: before, it was UNPROVEN from adr-lint. Hygiene, S.
- **Items 13–16 and advisories (a)–(c), 2026-10-16** (each red first, with catalogue mutants RED; unreleased until 3.8.37):
  - Item 15, 36cdcafd: an inline table in a dependency array declares nothing.
  - Item 16, ab0f4983: the mask was worse than the item said. A comment collapsed to one space and a deleted trailing comma moved node's own "(line L column C)": an error on line 6 was reported at line 4. Each is now blanked to its own length. The finding keeps its `path: ` form, which ADR-102 T14's locked test holds. Left: node's "Unexpected token" message has no position at all and is still said with its excerpt only. Re-open with a position read from the parser, never from the excerpt. Found while doing it: the ADR-102 T6 mutant "a removed comment cannot join two halves of a token" had moved onto the trailing-comma callback, its text still matching once, so `--stale` could not see it; repointed.
  - Advisory (a), dd5f2748: a commit's short clusters are read letter by letter; each case was measured against git 2.56.0.
  - Advisory (c), 3c6fe6ac: the task arm takes `[- ]T<n>`, as the record arm excludes.
  - Item 14, 3bff7696: a row whose Change cell begins `read`, `none`, `unchanged` or `no change` governs nothing; a table with no Change column keeps every row. `adr-context plugin/scripts/completion-rules.mjs` no longer names ADR-098.
  - Advisory (b), 897c4649: worse than filed. With a fast clock, twenty green runs at one commit drew twenty `gh run view` calls; now none.
  - Item 13, 05562ebe: an unchanged unknown CI is one word on the head's line when only HEAD or the dirty count moved.
- The recorded review of v3.8.36..1721d2e6 (Claude host, clean) left three advisories. Two were fixed as fail-opens in the governing answer, red first: a Change cell that begins with a read-only word and goes on to describe an edit (`read-only guard added`, `unchanged except the import`) was dropped, since `\b` matches before `-`, `/` and a space; the word must now be the whole cell or be followed by an explanation. And a second table in one Affected Files section was read by the first table's Change column; each table now reads its own header at its separator row, and a table ends at its first non-table line. Filed, not fixed: (3) `stagesBeforeCommit` does not read `git commit <pathspec>`, `-i`/`--include` or `-o` as staging, though each stages before it commits, and a long option taking the next word (`--message -a`) still lets that word read as `-a`. Wording only: `stagesFirst` is read at one place, the message at `publish-verdict.mjs` near line 318. Neither is new. Hygiene, S.
- The scoped verification of 271a698b (Claude host, clean) left one advisory, a fail-open from item 14 itself and fixed the same day: cells are split on every `|`, so an escaped `\|` or a pipe in a code span moved the Change cell, and a row could be dropped by a cell that was not its Change. A row whose cell count is not its header's now keeps its path.
- The recorded review of 19906929 (Claude host, clean) left one advisory, filed: the cell-count guard counts a trailing pipe, which GFM lets a line leave off, so a table mixing the two styles keeps a read-only row as governed, as before item 14. It fails closed (governs more), and no Affected Files row in this corpus lacks its trailing pipe. Fix: drop one trailing `|` before splitting. Hygiene, S.
- The recorded review of v3.8.37..0b425927 (ADR-105 T1; Claude host, clean) left one advisory, older than the range and filed: `latestFastPass` (`plugin/scripts/check-ledger.mjs` near line 52) matches a fast record by `after.tree` alone, while `passedAlready` also requires the record's command to be the declared one. So a fast record from a since-changed `fastCheck` still counts, both for R2's silence (ADR-105) and for the publish verdict's fast-pass commit (ADR-081). It opens only when `.quality-harness.json` is untracked or ignored, since a tracked config is part of the tree. Fix: compare the record's command with `fastCheckCommand(root)` inside `latestFastPass`, so both callers get it. Hygiene, S.
- The Codex review of v3.8.36..v3.8.38 (high effort; the first different-lineage review of that range) left two P2 findings, both fail-opens in `affectedFiles`, fixed red first in 0bbf5eb1: an escaped `\|` plus a row without its optional trailing pipe matched the header's raw count, so the wrong cell was read as Change; and a read-only word followed by any punctuation (`unchanged (except the import)`, `read; then add the guard`) governed nothing. The advisory filed two lines up as "fails closed" was wrong in direction: the trailing-pipe gap combines with an escaped pipe to fail open.
- The Codex verification of 0bbf5eb1 (APPROVE; it compared every tracked task file's governed paths against the parent and found none changed) named two older limits of `affectedFiles`, both outside that fix and filed here: a row GFM accepts without a leading pipe (`` `src/a.js` | edit | x |``) is skipped, since a table line must start with `|`, so its path is lost (fail-open, though no task file in this corpus writes one); and a header without edge pipes disables the Change column, so every row keeps its path (fails closed). Fix: recognise a table line by its separator row rather than a leading pipe. Hygiene, S.
- The Codex review of the 3.8.40 plan (xhigh, REQUEST CHANGES, 2026-10-17) found the planned fix for the line above insufficient and named four more fail-opens. Fixed red first in 834a23b7 (`decision-corpus.mjs`): a table is now a header, the delimiter under it with as many cells, and body rows to a blank line or another block (block quote, list item, thematic break); no row needs a leading pipe, a line with no pipe inside a table is a one-cell row (GFM example 202), and a body row shaped like a header and a delimiter is data, which the planned "any line with a pipe" would have let redirect the Change column. A fenced `# Example` no longer ends the section and a fenced `## Affected Files` no longer starts it; a backticked `Dockerfile` is a path. In the next commit, `adr-lint` reads Affected Files the same way (`gfm_table_rows`, `gfm_table_cells`): a pipe-less second `add` of one file had left the blocking collision check with no advice, and a pipe-less ignored path the ignored-path check. Over this repository: 106 records govern the same 918 paths before and after, and all 106 lint byte-identically. Left, each a fail-open, filed here: (a) a backticked path with a space (`src/a b.js`) is not read, since a locked real-corpus fixture (`tests/lifecycle.test.mjs`, "reported: the layouts and scale a real corpus actually has") holds a backticked acceptance command in the same place and nothing tells the two apart; (b) an unticked extensionless name (`Makefile`) is not read, since nothing tells it from a word; (c) `adr-lint`'s Affected Files section still includes fenced lines, so a fenced example row can add a phantom `add` (fails closed). The class — a table reader that needs a leading `|` — enumerated with `rg -c "startsWith\('\|'\)|startswith\(['\"]\|['\"]\)|\^\\\\\||\^\\\\s\*\\\\\|" plugin/ -g '!*.md'` at 6a35ed01: `adr-lint` 16, `decision-corpus.mjs` 4, `work-next.mjs` 3, `arch-lint` 2, `spec-verify` 2, `record.py` 1, `adr-retire-check` 1. Fixed: `decision-corpus.mjs:924` and `adr-lint`'s Affected Files reader (`:1701`, through its own splitter rather than the shared `markdown_table_cells`, which also feeds the Tests table at `:607`). The rest are open and their directions are unclassified: each is a separate reader (the Tests table, README status and wave tables, Inter-task Contracts, spec fact rows, the archive catalog at `decision-corpus.mjs:746`). Classify each, and fix a fail-open red first. M.
- The recorded Codex review of v3.8.39..1d991b64 (high, REQUEST CHANGES) found two regressions in that fix, both fail-opens, and one older divergence; all three fixed red first in the commit after 1d991b64. An HTML block (`<!-- between tables -->`) did not end a table, so a second table under it was read with the first table's Change column; both readers now end a table at one. And `rowPath` had started refusing a backticked path beginning with `(` (`(data).json`), which governed before. `adr-lint`'s collision check always read column 2 as Change, so an `add` under `File | Why | Change` was missed; it now reads the header's Change column, and column 2 only where no header names one. Its remaining residuals are (a)–(c) in the line above.
- Its recorded verification of c54110cb (high, REQUEST CHANGES) found that fix too broad, a fail-open of its own: any line starting `<` plus a letter, `!`, `?` or `/` ended the table, so an autolink or inline HTML, which GFM keeps as a row, made the header-shaped rows under it a new table (a path dropped, an `add` and its blocking collision lost) and cut off the one-cell path under it (a path dropped, ignored-path advice lost). Fixed red first in the commit after c54110cb: only an HTML block of a kind that can interrupt a table (GFM types 1 to 6: `script`/`pre`/`style`/`textarea`, a comment, `<?`, `<!` and a letter, CDATA, and the named block-level tags) ends one, in both readers. That commit gets one scoped recorded review on the Claude host, since `release-evidence` needs every plugin commit covered, and only a fail-open or a regression from it blocks; the next outside corpus run is its wider check.
- Two more rounds on the same two regexes, each a recorded Claude-host review of one commit. Of b78a75dc (clean): Python's `re.I` folded U+017F to `s`, so `<ſcript>` opened an HTML block in `adr-lint` only; 54fd1e8e added `re.A`. Of 54fd1e8e (blocking): `re.A` also narrowed Python's `\s` while the JS `\s` still matched U+00A0, so one divergence was traded for another; d7f5dbfa writes `[ \t]` in both, which is GFM's own condition after a tag name. Of d7f5dbfa (clean), one advisory filed as (d): the readers still trim and split lines differently — Python's `strip()` removes U+001C–U+001F and U+0085 and keeps U+FEFF, JS `trim()` the reverse, and `adr-lint`'s sections are split by `splitlines()` (U+001C–U+001E, U+0085, U+2028/U+2029) while `decision-corpus.mjs` splits on `\n`. Older than this work and wider than one table; the shared whitespace set in `decision-corpus.mjs`'s Status reader is the prior art. S.
- The outside run of 7f9aa041 (the docs-heavy Python corpus, mac; attestation clean: 77 verdicts compared, none moved) found what no output it was asked for showed: governed paths 478 → 485, and three of the seven new entries were not paths: a backticked exception class, a sibling repository's name and a response field, each the only backticked token in a prose first cell ("any call site that catches `X` from `f`"). 834a23b7 had accepted any backticked space-free name; a name with no `.` or separator is now a path only when it is the whole cell. It failed closed (governs more). `governsUnmatched` stayed 0 by design: it counts only the `Governs:` header (ADR-011, `decision-corpus.mjs` near line 1752), since a pending task's Affected Files may name files not yet created. Filed as (e): whether a path a DONE task's Affected Files names, and no tracked file matches, should be said somewhere. S.
- Unrelated to this work and filed here because its push run showed it: `tests/observe-racy.test.mjs` failed on the Windows job of push run 39012999191 (7f9aa041) at line 38, `before.ok && after.ok` false, so `observe` could not look; the dispatched campaign at the same sha passed it. The test calls `observe(repo)` with the product's 5 s default budget, which CLAUDE.md §7 forbids for a budget a test depends on (`tests/fail-open.test.mjs` and `tests/fast-check-hint.test.mjs` set `QUALITY_HARNESS_OBSERVE_BUDGET_MS` to 60000). It is locked by ADR-094 T3, so the fix is a relock: the test passes a budget of its own. S.
- The re-run of the same outside corpus at ae3bdb8 (3.8.40; clean, 478 → 481, nothing lost against 3.8.39) found one real `Makefile` not read: `` | `Makefile` (L80-85) | edit | ``, since a name with no extension had to be the whole cell. Fixed for 3.8.41 (owner, 2026-10-17: "Cut"): the cell may wrap the name in matching emphasis and follow it with annotations in parentheses (`WHOLE_CELL_NAME`); any other text beside the name keeps it prose.
- The README readers of `adr-lint`, from the class enumerated above, classified 2026-10-17: both were fail-opens and are fixed red first. `done_task_ids` and the status-vocabulary check read only lines starting `|`, so a README row written without its leading pipe (`1 | [T1](T1.md) | S | none | done`) was a `done` claim never checked against its Verification Log, and a status word in one was never named. Both now read rows through `gfm_table_rows`; the status check passes `reopen=True`, so a header and delimiter inside a body still open a new table, as ADR-091 T3's locked "focused false-green regressions remain closed" holds (BACKLOG §75). Over this repository all 106 records lint byte-identically before and after. Left in the class: the Tests table, the wave table, Inter-task Contracts, spec fact rows and the archive catalog, each still unclassified.
- The recorded Codex review of b37e3815 (high, REQUEST CHANGES) found two regressions in it, both in the status check and fixed red first in the commit after it ("a README status table keeps its advice under a miscounted delimiter, and its header is no status row"). A delimiter whose cell count is not its header's is no GFM table, so the status word under it, named before, went unnamed (advice lost); and a header row was read as a body row, so `| Item | Status | T1 |` said "T1 has status `status`". `gfm_table_rows(…, readme=True)`, replacing `reopen=True`, reads a README table as the status check always has: a header and delimiter open one wherever they sit, at any delimiter count, and neither is returned as a row. Affected Files and `done_task_ids` read GFM's strict table.
- Found while signing ADR-106 T2 off, 2026-10-17: `adr-next` read SWE-bench's list name `fail-to-pass` in a human sign-off as the stop word «fail», so a signed-off task printed `stopped` (it fails closed). Fixed red first in the commit before T2's sign-off: `fail-to-pass` and `FAIL_TO_PASS` are a name, as a counter label is; spaced, "fail to pass" is the verb and still stops. Left, filed: the hook name `Stop` in a sign-off ("fires SessionStart and Stop") is read as a stop too. It is the stop word itself, and nothing in the text tells the hook from the verdict, so it stays; T2's sign-off was re-recorded naming the hooks in words. S.
- The recorded Codex verification of b37e3815..34f4b1e2 (high, REQUEST CHANGES) found two. A regression, fixed red first in the commit after 34f4b1e2: the `fail-to-pass` exemption matched the start of a counter label (`fail-to-pass-failed 0`), so the counter rule never read the whole label and v3.8.41's pass became a stop; the name must now be a whole identifier. And, filed rather than fixed, older than the range: in the README status check a task row followed by a delimiter-shaped line (`| T1 | wip |` then `|---|---|---|`) is read as a header, so its status word goes unnamed. 7c932287 restored v3.8.41's reading at any delimiter count, so against the tag this is unchanged, and with an equal-count delimiter every version loses the row. A header and a body row are told apart only by their position above a delimiter; telling them apart by content (a task id, a Status cell) conflicts with "its header is no status row". Advice only, fails open on a status word. S.
- A lead from a peer reading a plugin-loaded benchmark session, 2026-10-17, not yet reproduced: the turn-end finding R1 was said twice to the agent with the same changed paths, across a background `qh-check` the agent started. ADR-096 says a finding is said once per tree to each audience (`completion-rules.mjs` near line 658, `emittedFor`). The observed tree (`tree-facts.mjs` `observe`, near line 155) is `git add -A` of every untracked file git does not ignore, while the finding's changed paths come from the session's own writes. So a check run that leaves unignored files (a test cache, bytecode) makes a new tree, and the same finding is said again and the turn continued again. Reproduce first: a repository with no ignore rule for its caches, a Stop finding, then a command that writes an untracked file, then a Stop. If it holds, decide whether R1's key should leave out untracked files the session did not write. S–M.
- That lead, reproduced in a temp repository through `lifecycle.mjs` the same day: not as hypothesised. A stray untracked cache does re-key R1, but its path is then listed, so the finding is a different one. The only repeat with the same text and the same paths follows a FAILED `qh-check`: R1's key is `tree:revision:writes` (`completion-rules.mjs` near line 657) and the revision is the tree's count of check events (`check-ledger.mjs` near line 498), so a failed check re-opens the finding, as ADR-060 decided ("a later check re-opens the finding"; its Rev-2 rejected a once-per-tree key that hid later failures). A passing fast check keeps it silent. Left, filed: the re-said text does not say that a check ran and failed, so the agent hears the same sentence twice; naming the failed run in `uncheckedWorkReason` is a text change, and ADR-060's key semantics stay. The benchmark's own case (a background `qh-check` and a notification-started turn) was not replayed. S.
- Receipt: ADR-108's Out of Scope defers "the naming of a FAILED check's run in R1's repeated text" to the line above (the R1 repeat), so it resurfaces from both places until it is done.
- ADR-107 T2's audit of the plugin's writers of tracked files, 2026-10-17. The record's own command (`rg -c "writeFileSync|appendFileSync|renameSync|\.write_text\(|open\(…[wa]…\)" plugin/`, 20 files, 59 lines) finds no member of the class: every hit writes the plugin's own state, ledgers, caches or temp files. It misses `write_bytes`, `copyFileSync`, `cpSync`, `symlinkSync` and `os.replace`, which is how `plugin/bin/adr-verify` writes the one class it has: task files (`append_entry` → `write_source`) and the mutant target. Fixed red first in the T2 commit: `--mutant --from X --to X` wrote the file back unchanged, said `MUTANT APPLIED`, ran the fence on unchanged code and recorded a verdict (a flaky fence would have recorded a kill); and a task with a Mutation Log but no Verification Log got its mutant row written before the clean run's row was refused, half the evidence on disk. Left, each its own change, since `write_source` is also the mutant apply and restore writer: (1) it truncates then writes, so a kill mid-write can truncate a task file; an atomic replace must keep the file's mode (the gates are executable) and the restore journal's expectations (ADR-002); (2) `file_newline` picks CRLF if any CRLF is present and `source_bytes` then rewrites every line, so one append to a mixed-ending task file converts it all while saying only that it appended; (3) `LINE_COMMENT` has no `.mjs`, `.cjs`, `.mts` or `.cts`, so a comment-only mutant on this plugin's own scripts is not refused (it can only survive, never be credited); (4) `--human`, `--human-mutant` and the mutant row do not name the file and section they wrote, and a live restore says nothing on success. S each.
- ADR-065's Positive consequences say "A commit, push or branch switch is never served as the previous state's answer", and the code contradicted it (found 2026-10-17, reading `branch-state.mjs` for the index-lock fix): when the snapshot key moved or the snapshot was due, the brief printed the OLD snapshot's HEAD, dirty count and ahead count with only "(read Ns ago; refreshing)", and the unknown-CI shortcut in `emitCachedBranchState` printed them with no age at all. The record accepts one stale prompt, so only the sentence is wrong; the records are history and are not edited. Fixed with no extra process on the prompt path (the live HEAD is already in the key, read from files): a due snapshot whose key differs from the live one now says `(moved since this was read: HEAD now <sha>; uncommitted and ahead not re-read)` after its head clause, and the unknown-CI shortcut carries the age on a due snapshot. The live sha is in what `said` compares and the age is not. Not changed: a fresh hit (key unmoved, young) still prints exactly as before, and a snapshot whose live key cannot be read says nothing about movement (a claim needs both ends). S.
- The publish "mention" advisory (`only mentions commit or push`, `publish-verdict.mjs`) fired on 188 of 3,106 Bash calls in a session log joined with its transcripts, and none preceded a real publish the precise arm (`publishCommandIn`) missed. 105 of the 188 were the word inside a quoted-delimiter heredoc body that `mrw write`, `cat` or `tee` reads. Changed: `mentionsCommitOrPush` ignores such a body (`withoutSinkBodies`, sharing `withoutData`'s mask-and-re-lex proof); a body piped on, owned by an interpreter, `eval` or `source`, given an unquoted delimiter, or beside a substitution or a dynamic word still counts, each run against bash, zsh and sh first. A sink that writes (a `>`/`>>` redirect, `tee`'s file, or `mrw write`) keeps its body counted when a later command in the same text is not a plain reader and names what was written, runs a file (`sh`/`bash`/`zsh`/`dash`/`ksh`/`source`/`.` with an operand, a command word with a slash or ending `.sh`), or has a word it cannot read; run against bash, zsh and sh, `sh r.sh`, `bash r.sh`, `zsh r.sh`, `dash r.sh`, `. ./r.sh`, `source r.sh` and `chmod +x r.sh; ./r.sh` after `cat > r.sh <<'EOF'` all ran the body, and `cat r.sh` did not. The advisory dedupe key now names what was said (`:mention` for a command that only mentions), because a mention on a tree silenced the advice a refusal softened to there. Left: the arguments of `git log`, `show`, `rev-parse` and `stash push` (about 20 advisories; `git log --grep commit` is pinned as a mention by a §269 row in `tests/publish-command.test.mjs`) and `grep`/`rg` arguments (locked tests assert those are mentions: `tests/lifecycle.test.mjs` and `tests/publish-command.test.mjs`). Also left, and accepted: a body written to a file by one Bash call and run by a later one is no longer a mention at the write. The Write tool never warned there either, and git's own hook (ADR-066) is the guard. S.
- Tests table, the leading-pipe class (the read-only scout's list, item 1): the GFM reader moved to `plugin/lib/record.py` (`gfm_table_scan`, `gfm_rows`), and adr-lint's Tests reader (`task_tests_rows`, so `info["tests"]`, `check_tests_exist`, the Acceptance-filter and assertion checks), record.py's `tests_table_rows` (the first-red lock writer, `--relock`, `lock_blocks_done`, adr-next) and the Proof map v1 table (`task_tests_table`) now read a row GFM accepts without its leading pipe. A line with a pipe and no leading pipe outside a table stays prose, since these checks block. Left: a pipe-less line directly under a table (a one-cell row to GFM) still ends the Proof map table, as before; the lock hashes every test in a file a row names, so a pipe-less row matters to it only when it names a file no piped row does.
- Spec tables, the leading-pipe class (the scout's items 2 and 7): adr-lint's `spec_ids` (the @spec/@implemented facts a task's Covers must reach) and spec-verify's fact-row and grill-row checks (`FACT_ID`, `GRILL_NUMBER`) now read rows through `gfm_rows`, so a fact written without its leading pipe is owed a Covers and checked for its tag, its test and its Grill Log citation. Left: spec-verify's other readers (the scenario headings are not tables) are untouched; `cells()` there still unescapes `\|` where the shared reader keeps it, which no row reached by this change depends on.
- Architecture rule tables, the leading-pipe class (the scout's item 3): arch-lint's `data_rows` took the first piped line as the header and kept only piped lines, so a rule row without its leading pipe escaped every rule-row finding (empty check, placeholder, sync-prose, no command, vacuous gate, unresolved symbol), and a table whose header lacked one lost its first data row to the header slot. It reads through `gfm_rows` now: the header is the row the table opened at, and the older first-piped-line rule remains only for lines that open no table. A second table in one section now has its own header, where its header row used to be judged as a rule row. Left: the corpus holds no architecture document beyond the fixture and the template (both unchanged), so this reading was not exercised on an outside one.
- ADR and README tables, the leading-pipe class (the scout's items 4, 5, 6 and 8): adr-lint's Inter-task Contracts check (`check_contract_table`: orphaned contract, unknown T-id), the order or wave table (`parse_positions`, so `check_dag`'s wave-order block; a pipe-less header used to disable it and a pipe-less body row ended the table, dropping every later position), the README listing (`check_readme`: an orphan task id in a row, and the wave-table advice, which now looks for a Wave cell in any row instead of the substring `| Wave |`) and `check_readme_row_widths` (advice) read rows through `gfm_rows`; arch-lint's `data_rows` and the Contracts check share `record.gfm_data_rows`. Left, same class and not in the scout's list: `plugin/bin/adr-retire-check` `catalog_rows` (~:389) still reads only `|` lines of the archive catalog (a pipe-less catalog row is an unlisted record, which fails closed); the JavaScript side outside `decision-corpus.mjs` was not audited. Command used for the Python class: `mrw read --grep 'startswith\("\|"\)|\^\\\|' plugin/bin plugin/lib` lists only adr-retire-check and the shared reader.
- Shipped 2026-10-17 (ADR-107, the mrw way): `adr-verify <task1.md> <task2.md> ...` records several tasks in one call, in plain record mode only. Each task runs in a child that is the single call, so its row and its output are the single call's, each output line prefixed with the task path. A failing fence does not stop the next task (independent runs); the exit is the first non-zero among them. A path that is missing, is not a task, or is given twice refuses the whole call before any fence runs. `--mutant`, `--mutant-plan`, `--human`, `--human-mutant`, `--relock`, `--restore` and `--sweep` with several tasks are refused, naming the flag. `--cwd` and `--steps` reach every run. Tests: `tests/evidence-chain.test.mjs` (six, ending the file); mutants: the `verify, multi-task:` entries in `tests/mutations/plugin/bin/adr-verify.json`. Not done: `--mutant-plan` is refused by a text check on the argument list, since the flag lands in another change; it needs its own row in the refusal test once it exists.
- ADR-107: `adr-verify --mutant-plan <file> --why …` takes a multi-hunk mutant (2026-10-17). The plan is the subset of mrw's grammar a mutant needs (`@@ <path> <N|N-M|/regex/> replace|delete|insert-after|insert-before`); every address resolves against the original file, a pattern must match exactly one line, the whole plan applies or none of it, each hunk prints `ok <path> <addr> <op>`, a plan that changes no byte is `MUTANT DID NOTHING`, and every file joins the one v2 restore journal (which now accepts one or more `target` members) and is named in the Mutation Log row. Left: `create`, `unlink` and `rename` ops (a mutant that adds or removes a file), the `sha=`, `lines=`, `anchor=` guards, and a body line starting with `@@` (`body=<N> raw=true`); patterns are Python regexes, not mrw's RE2; the journal still says `version: 2`, so an older adr-verify reading a multi-target journal calls it corrupt and blocks rather than restoring. S each.
- A Windows run of the full check on bb31d8d8, 2026-10-17, by the owner's Windows peer (Windows 11 Pro, a non-elevated account without Developer Mode, node 24.20.0, git 2.49.0.windows.1): every test of the day's Windows-specific changes passed (mrw.exe resolution, GIT_OPTIONAL_LOCKS); 8 of 2441 failed, each the machine's. Three are `unused-names`, UNRUN because ruff is 0.15.2 against the 0.15.6 pin: red by the owner's rule (a linter that cannot run is red), and fixed on the machine. Four threw EPERM from `symlinkSync`: the account cannot create symlinks. `tests/main-module.test.mjs` now probes the privilege and skips with that reason (CLAUDE.md §7); the three in `tests/outside-root-writes.test.mjs` are locked by ADR-094 T4, so a capability skip there needs those tasks relocked, an owner decision. The sixth: `mutate --narrow --write leaves nothing narrowed when it is stopped mid-measurement` (locked, ADR-075 T2) failed in its cleanup, `rmSync` EPERM on the temp repository after SIGKILLing the runner, retries included; a lead, not shown: on Windows a kill does not take the process tree, so a worktree child of the killed runner may still hold the directory. CI's Windows runners pass all six. S each.
- ADR-109 T1 measured 2026-10-17, `scripts/inverse-hunks.mjs --range v3.8.40..HEAD`, CONTENDED (load 77.3 at the start, above 10 after the 20-minute wait, peak 33.9, 6.4 at the end) and INCOMPLETE (the 60-minute budget ended inside the 13th of 23 plugin commits; 63 of 162 hunks unrun and in no figure). Cells n: noticed/unnoticed/inconclusive. Inverse 99 judged: 75/18/6; comparison 10: 6/4/0; boolean 32: 4/28/0; numeric 35: 4/31/0; fence runs per unnoticed hunk found 5.3, 2.5, 1.1, 1.1 (3.5 over all kinds, 173 mutation + 11 baseline runs, 53 hunks). Per-commit rows are in ADR-109's Follow-ups. Operators also act on string and regex literals, and one commit is 50 of the 162 hunks. The threshold decision (fewer than one hunk in ten unnoticed withdraws ADR-109) is the owner's and is not made here; a rerun of the ten unrun commits on a quiet machine would settle whether the contended figures can be trusted. Not signed off.
- The publish advisory's run-the-written-file twin, after three review rounds on 2026-10-17 (Codex xhigh of v3.8.42..2c747201, then scoped Claude-host verifications of a1039281 and 6d744875): a sink body stays a mention when a later command in the same text pipes a reader, uses a substitution (as a word, a redirect target, an assignment or a lone redirect), names a shell anywhere, or names the written file. Left, filed, advisory: an interpreter that reads the written file on stdin (`python3 < r.sh`, `node < r.sh`, `perl < r.sh`) keeps the body data, since the redirect target is not an argument and no shell word appears. It is the open class ADR-061 already leaves to the warning arm's limits and git's own hook (ADR-066) guards at the event; closing it means reading redirect targets as written-file uses, a change to the lexer's output. S.
- ADR-110's amended Decision 4 said a detached child "is reaped at SessionEnd"; neither the Node path nor the Go core reaps one (SessionEnd kills nothing; the artifact pass ends by its own budget and its lock lapses at the deadline), so the record now carries a correction. Open: whether SessionEnd should reap a still-running pass or refresher, and how on Windows, where a kill does not take the children. Bounded today by each child's deadline. S.
- **Re-checked 2026-10-20 at 14bc3430** (read-only passes over the code, by mrw reads and direct calls): items 1–5 are fixed (035be390, 5b9108d3, 9f7d1573, c74ff306 and 76d23349, 2eb10c61), item 6 (c24e7f56), 8 (f0f4cbf7, 897c4649), 9 (f62d0015, dd5f2748), 10 (f596b8ce), 11 (6e2cebed), 12 (5c6641ff, 3c6fe6ac), 13 (05562ebe), 14 (3bff7696, 0bbf5eb1, 834a23b7), 15 (36cdcafd); item 7 is closed by the owner's decision (e957da1e); the reviewer `--output` limit is gone with the shell-less reviewer (6c30eba6). What is still present goes to ADR-119 (Proposed at this re-check; Accepted 2026-10-20, executed): item 6's two README-only sites in adr-lint (5027, 5817), 16's unplaced node error, 17–24, the pipe after a group (`{ false; } | cat`, `|&` too), the doubled literal, plus §383's false stops and §389. Item 25 and the several-command negated group stay out (a record of their own; the owner's grammar).
- 2026-10-20: every task of ADR-119 is done (`docs/adr/ADR-119-what-the-backlog-still-holds/tasks/README.md`), so what it took from this list is answered there, and §389 and §391 are archived. Still open here: item 25 and the several-command negated group, as the re-check above says.
- 2026-10-21: item 25 is closed by ADR-120 T3 (66cf9843): `@retired` retires a spec fact, and the ADR-040 spec's F-1 rows carry it. The several-command negated group, and the definition and group forms of the lines above (3202-3206, and items (2) and (3) left at 3208), are closed by ADR-120 T1's grammar (13ba9efa), which reads `!`, groups and definitions as units in both cores. ADR-110's SessionEnd reaping (3260) stays open, in ADR-110 T3's scope.

## 382. OPEN 2026-10-16 — What ADR-106's paired benchmark deliberately leaves for after its first verdict

Filed with ADR-106 (Proposed). It borrows §30's two-phase, command-graded shape for a different question, with the hidden tests of a SWE-bench-style task as the grader; §30's own question, a case graded by `adr-lint` over the preserved sandbox, stays open.

- **A hooks-only third arm.** It would separate what the hooks do from what the skills do, but it adds half again the cost before anything shows the two-arm effect exists. Re-open after ADR-106 T3 reports SHOWN or NOT SHOWN. ADR-106's T3 read GUARD NOT MET (2026-10-18); ADR-112 defers it here again, since its arms already separate the plugin from the plugin with the lifecycle invoked.
- **A second dataset.** The first verdict holds for one configuration. Re-open after T3, with the dataset T2 did not choose.
- **Re-grading with augmented tests** (UTBoost, arXiv 2506.09289; SWE-ABS, arXiv 2603.00520). Weak hidden tests count some wrong patches as resolved in both arms. Re-open if T3's verdict turns on a few instances.

## 383. OPEN 2026-10-18 — What ADR-106's verdict found in the turn end, read attempt by attempt

Found by the bench peer and reproduced here with scripted sessions through the hooks at v3.8.40 and at HEAD (`tests/hook-golden.mjs` helpers, scratch only). In Stage 5 block 1, three of Opus P's six false completions ended with no Stop finding at all.

- **Fixed 2026-10-18: a publish advice about a mention silenced the turn end.** An attempt edited a tracked file, ran `git stash push -q <file>; …; git stash pop -q`, and ended `STATUS: done`. PreToolUse advised the command as a mention of push. `namedByPublish` (`plugin/scripts/check-ledger.mjs`, `core/hooks/ledger.go`) then counted that advice as R1 already said for the tree, so Stop said nothing. It now counts only a P advice about a publish from this tree: not a key ending `:mention`, `:fresh` or `:foreign`, whose advice is conditional ("if it does publish, run qh-check first"). The class: every reader of a P record that treats it as naming a tree, enumerated with `mrw read --grep "rule === 'P'|rule: 'P'|\"P\"\)" plugin/scripts/ core/hooks/`. That returned four sites; the other two are P's own dedupe on its exact key, which already names a mention. Tests: `tests/completion-judgement.test.mjs` (the three suffixes plus the twin, where a real publish advice still dedupes) and `tests/hook-goldens.test.mjs` (the attempt's command through each implementation). Mutants: the `Stage 5 dedupe:` entries in `tests/mutations/plugin/scripts/check-ledger.mjs.json`, both RED; the Go side was shown RED by hand against a scratch build with the exclusion removed, since `mutate.mjs` cannot run a Go fence (ADR-110 Follow-ups).
- **The mention arm over-matches: owner-visible, advisory only.** `git stash push` is read as a push mention. A quoted heredoc read only by `mrw write` is read as a mention when a later, unrelated command in the same text has a pipe; this session's own `mrw write … ; node --test … | grep …` drew it on 2026-10-18. The peer reports the same on an `mrw write` plan and a `cp`/`echo` of ids. With the fix above it no longer silences anything, so it costs a line of noise per command. Closing it is a classifier change (CLAUDE.md §16): `stash push` as a git subcommand, and the run-the-written-file twin scoped to the command that reads the body. S.
- **No check known, no finding: owner decision.** `completion-rules.mjs` returns before every rule when no check is declared or inferred (deliberate since 2026-08-26, pinned by `tests/completion-judgement.test.mjs`'s "no check, no finding"). Inference (`check-command.mjs` PROJECT_CHECKS) knows `pytest.ini` and `tox.ini`, but not `[tool.pytest.ini_options]` in `pyproject.toml`, `[tool:pytest]` in `setup.cfg`, or a script runner with no manifest (sympy's `bin/test`). Two of the three silent attempts were this. Options: say the could-not-look at Stop when code changed and no check is known (ADR-005), widen the pytest rungs, or both. M.
- **After a red check, the turn end says "no qh-check has passed", never that it failed.** Reproduced: an edit, a red `qh-check`, then `STATUS: done` draws the same R1 text as no check at all, and the continue-once Stop is silent. In block 1, two Opus P attempts claimed done after a red or unstarted check. Wording: say the last check on this tree failed, and that a done claim now contradicts it. S.
- **adr-next reads a code name and a phrase as a stop in a sign-off note.** `no canary-failed code was raised` stops (`no failed test` does not: the negation does not reach across a hyphen), and so does `restated without the stop word`. ADR-106 T3's log carries two extra sign-offs because of it. Loosening this turns a stop into a pass, the fail-open direction, so each new pass row needs a row beside it that must still stop. S.
- **The lifecycle was never invoked:** 0 Skill calls in 54 P attempts. Block 1 measured the hooks, not specs, records or tasks. The next stage, which runs the lifecycle in checkouts whose tests can run, is being designed with the bench peer; it waits on a pre-registration here and on the owner's word on its price.
- **Deferred by ADR-111 (Proposed, 2026-10-18):** a per-test comparison of the baseline and the current run (needs a parser per runner's output), and scoping the check to the files a turn touched (runner-specific mapping). The exit-level baseline comes first. M each.
- **Deferred by ADR-112 (Proposed, 2026-10-18):** a graded corpus of multi-step feature tasks, the shape the lifecycle is built for and SWE-bench is not. Nothing in the bench has that shape yet. L.
- **ADR-111 T1's TOML lexer, an advisory left by the Claude-host review of the lexer fix (2026-10-18):** inside an open `"""` multi-line basic string the close is found with `indexOf`, which ignores escapes, so `\"""` (an escaped quote, then two quotes) is read as the close and a `[tool.pytest.ini_options]` header later inside the same string is inferred as pytest. Over-inference in a contrived case, not a fail-open; the fix is to scan an open basic multi-line string for escapes as a basic one is scanned (`plugin/scripts/check-command.mjs` `opensSection`), with that case as a negative row. S.
  - **Fixed 2026-10-18, for the release after 3.8.45:** inside an open `"""` string a backslash now escapes the next character, so `\"""` no longer closes it. Test: the escaped-quote row in `tests/check-inference.test.mjs`; mutant: `BACKLOG §383: an escaped quote does not close a multi-line basic string`, RED.
- **ADR-108 T1's could-not-start advice is given for a tree that moved during the run (found 2026-10-18).** A full `qh-check` passed (exit 0) while this session committed beside it, so its record's before and after trees differ (88ecdb40 → 71700c4f) and it is graded `check.unproven`. The turn end then said "could not be proven to have run … do not run it again on this tree; if it cannot start on an unmodified tree the finding is about this machine". Neither is true of a run the tree moved under: the right action is to run it again on a tree that holds still, and an agent that obeys the advice leaves its work unchecked. The fix: tell a run whose trees differ apart from one that could not be proven to start (`completion-rules.mjs` `couldNotStartOpening`, `COULD_NOT_START`), and say "the tree moved during the run; run it again once the tree holds still". S.
  - **Fixed 2026-10-18, for the release after 3.8.45:** when the latest check's trees before and after differ, R1 now says "the latest `qh-check` on this turn's work proves nothing about it: the tree changed while it ran …, so run it again once the tree holds still" and still asks for the check. Test: `tests/adr-108.test.mjs` `a check the tree moved under is to be run again, not reported as could-not-start`; mutants: the two `BACKLOG §383:` entries in `tests/mutations/plugin/scripts/completion-rules.mjs.json`, RED, and ADR-108 T1's four still RED (one re-aimed).
  - **Left, an advisory from the Claude-host review of v3.8.45..61efcbb6:** `treeMoved` cannot tell a tree another writer moved from a check that changes the tree itself (a formatter, a test writing files git does not ignore); for the second, "run it again once the tree holds still" never comes true, and each rerun records another unproven run. The wording could name both causes and say what fixes the second (a check that writes no tracked or unignored file). S.

## 384. OPEN 2026-10-19 — A release check judged by its slowdown, not by a load average

ADR-115 judges a release check's contention by the 1-minute load average at its start and once the run's own load has decayed
after it. A load average cannot tell the run's load from other work during the run, so a spike between the two samples is
unseen. A better signal is the run's own slowdown against its history: `selftest-files.jsonl` holds every file's time per run,
and five full runs on 2026-10-19 took 202 to 209 s whatever the load. Left: a per-file baseline and a threshold nobody has
measured (ADR-115, Alternatives).

## 385. CLOSED 2026-10-20 (fixed in 2b6a0e63, shipped in 3.8.48) — adr-lint passes a tasks README whose index lost its separator row and lists a task twice

Archived: [backlog-archive/BACKLOG-301-400.md](backlog-archive/BACKLOG-301-400.md)

## 386. OPEN 2026-10-19 — A fetched `qh` is unsigned, and whether quarantine or SmartScreen stops it is not measured

ADR-116 publishes `qh` as release assets and fetches the one a machine needs at SessionStart. Neither this repository nor mrw
signs or notarises a binary. curl does not set macOS's quarantine attribute and a browser download does; whether a binary
written by Node's fetch is stopped by Gatekeeper, or a Windows one by SmartScreen or Mark-of-the-Web, was not measured on
2026-10-19. Left: measure both on a real fetched asset before ADR-110 T3 switches `hooks.json`, and sign if either stops it.

## 387. OPEN 2026-10-19 — The ledger guard reads shell text, and the forms it does not read are a boundary, not a pass

The Codex review of aae06d72..90b9ceaf found nine forms that both hooks let into the state directory: a `cd`'s own redirection, a
`$(…)` or backtick substitution, a fourth nested `sh -c`, a `cd` in a subshell or a pipeline, a link at the leaf, a case alias
on macOS (Go), a PowerShell redirect with `\`, PowerShell's writing cmdlets, and an mrw `search_replace` or `paths` write. Each
is fixed and tested beside its data twin (tests/ledger-writes.test.mjs, both implementations). What stays outside, each found
by reading the guard rather than measured: a command of redirections alone (`> checks.jsonl`), which the lexer drops before
the guard sees it — it can only empty a file, and an emptied ledger or receipts file fails closed (no pass, every uncommitted
row refused); a PowerShell backtick escape inside a path; other PowerShell cmdlets that write (`New-Item -Value`,
`Copy-Item`, `Move-Item`); and any string a command builds before it runs (`eval "$x"`, a script, a program). Left: keep
redirection-only commands in the lexer with their writes (both lexers, the parity test), and read `Copy-Item`/`Move-Item`
destinations, if a run shows either used against a ledger.
  - **Corrected the same day by the verification review of a855f7f7:** "can only empty a file, which fails closed" was wrong.
    Emptying a session log drops the unseen-write veto a write after a pass carries, and the ledger reader then accepted the
    pass. Both lexers now keep a command of redirections alone for what it writes, and the guard refuses it. That review also
    found and the next commit fixes: a PowerShell destination after a colon, content values read as destinations, a walk
    starting above a guarded directory, a link to a file not yet there, committed rows refused after a task moved, and
    unreadable required checks. Still left: PowerShell backtick escapes and `Copy-Item`/`Move-Item`/`New-Item -Value`.
  - **Narrowed again after the third verification review, of f7dc229c:** telling a switch from a positional, or one prefix
    from another, let a chosen spelling hide the destination (`-Fi` for -Filter, a quoted `"-Value"`). The reader now
    excludes only the word after an unquoted `-Value`/`-InputObject` and a bare word after a destination named in full.
    Refused as the price, and left: a content word that is itself a ledger's path when no destination is named in full
    (`Set-Content notes.txt <ledger path>`, `Set-Content -Force notes.txt <ledger path>`), and the same after a switch
    (`Set-Content -Path notes.txt -Verbose <ledger path>`). Reopen when an ordinary session is shown refused by one.
  - **Exclusions dropped after the fifth verification review, of 9cd08b8e:** a quoted trailing comma (`-Value "a,"
    <ledger>`) and a path with a comma in it were hidden by the comma handling. The reader now treats every literal word
    of a PowerShell writer, whole and split at its commas, and every colon value, as a candidate destination. The
    over-refusal is any write whose content names a ledger's path, which is the price this section names.

## 388. CLOSED 2026-10-20 (the owner: the lock is keyed from the record's repository whatever --cwd is) — A task whose code lives in another repository, named by a path relative to THAT repository, cannot reach done

Archived: [backlog-archive/BACKLOG-301-400.md](backlog-archive/BACKLOG-301-400.md)

## 389. CLOSED 2026-10-20 (the receipt wording by ADR-119 T3, 3fd4db37; the resolver half decided against, as CLAUDE_PLUGIN_ROOT is unset in a session's Bash) — An older adr-verify writes no receipt, and the newer hook then refuses its row

Archived: [backlog-archive/BACKLOG-301-400.md](backlog-archive/BACKLOG-301-400.md)

## 390. CLOSED 2026-10-20 (the owner: a relock may move the check binding, and it is said) — A relock takes the current check into the lock, so "check absent at first-red" clears with no red run

Archived: [backlog-archive/BACKLOG-301-400.md](backlog-archive/BACKLOG-301-400.md)

## 391. CLOSED 2026-10-20 (fixed by ADR-119 T2, 28a69f70) — A review row records the model the reviewer printed, not the one the launcher pinned

Archived: [backlog-archive/BACKLOG-301-400.md](backlog-archive/BACKLOG-301-400.md)

## 392. CLOSED 2026-10-21 (fixed by ADR-120 T5, 831df3b5) — One check change draws the §390 relock advice once per task

Archived: [backlog-archive/BACKLOG-301-400.md](backlog-archive/BACKLOG-301-400.md)

## 393. CLOSED 2026-10-21 (fixed by ADR-120 T1 and T2, 13ba9efa, 692a869c, dcc4693a) — What a group of several commands pipes onward is not modelled, so three publish forms read wrong

Archived: [backlog-archive/BACKLOG-301-400.md](backlog-archive/BACKLOG-301-400.md)

## 394. A mutant is written in place, so a SIGKILL during the write leaves a torn file that recovery refuses

Found 2026-10-21 on main's push run 39660165930 at a38360be (selftest, ubuntu-latest): `a SIGKILLed mutant plan leaves both
files mutated, and the next run restores both` (`tests/evidence-chain.test.mjs:1906`) failed with `--restore` exit 2,
"two_b.py: target differs from both known source states". The dispatched run 39660323363 and the landing run 39652598538 at
the same sha passed it. `write_source` (`plugin/bin/adr-verify:716-729`) writes with `path.write_bytes`, which truncates and
then writes; the test's `landed()` takes any change, a truncated file included, as the mutant having landed, then kills.
Recovery refusing a torn file is the fail-closed answer, so nothing was overwritten. Two members: the test's race (it can
kill mid-write), and the product (a mutant written through a temporary file and `os.replace`, mode kept, would leave a
target in one of its two known states). This session's T10 commits changed adr-verify's fence handling, not `write_source`
(`git log ee802e5d..a38360be -- plugin/bin/adr-verify`). Not fixed in 3.8.51.

## 395. The coverage floor's corpus lint killed adr-lint on one record under instrumentation

Found 2026-10-21 on the same push run (coverage floor): `every record this repository tracks passes its own adr-lint`
(`tests/corpus-lint.test.mjs:49`) took 415 s and reported `docs/adr/ADR-052-an-explicit-relock-is-not-a-later-red.md:
SIGKILL`, could-not-look. The dispatched run's coverage floor at the same sha passed. A per-record budget under coverage on a
loaded runner is the likely cause; unmeasured. Count how often it recurs, and name the budget it hit, before changing it.

## 396. CLOSED 2026-10-22 (a trailing CR dropped before the comparison) — On Windows the lock-drift dedupe does not match its record key, so a moved lock can be said twice in one pass

Found 2026-10-22 on the landing run of d161ec16 (39684429396, windows): `a pass gating a task and a test file it locks says
the moved lock once, in either order` said it twice, and `two records whose tasks lock one test each say their moved lock`
said three lines for two records (tests/lock-drift-commit.test.mjs). On macOS and Linux both hold exactly. The scan in
plugin/scripts/facts-gate-dispatch.sh (lock_drift, run_adr_lint) compares the adr-lint invocation the nested gate ran
with the one the record's own lint ran, as `printf %q` of its argv; on Windows the two evidently differ, most likely in a
path's spelling (drive form or separator), unmeasured. A mismatch only disables the dedupe: the line is repeated, never
lost, which the tests still hold on Windows (`saidOnce`: at least once there). Measure the two keys on a Windows runner and
normalise them; then make the assertion exact on every platform.

Closed 2026-10-22. Measured on a Windows peer (win32, node 24.20.0, Git Bash) with a probe that prints both keys: in the
order test file first, `<ledger>` and `<ledger>.key` were byte-identical and the line was still said twice, so the key was
never the difference. adr-lint's own output reached `read` with a trailing CR on Windows, while the lines the scan kept had
passed through grep, which drops it; the exact-line match in run_adr_lint therefore never held. Both comparisons now drop a
trailing CR (plugin/scripts/facts-gate-dispatch.sh). The same probe with the patch said one line in both orders. The
tests assert the exact count on every platform again; the windows CI job is the regression, because no other platform
produces the CR. No catalogue mutant: the campaign runs on Linux, where a mutant removing the CR strip changes nothing.

## 397. A Tests row naming a bare file name that lives in a module subdirectory is refused as naming no file

Found 2026-10-22 by an outside run of 3.8.51 (a Go kernel corpus on Windows, 62 records, 282 tasks): an archived record's
Tests table names `store_test.go`, which exists only at `<module>/store_test.go`, and adr-lint says the path "names no file
in the repo" (`plugin/bin/adr-lint:5123-5128`). That is blocking (`errors.append`), and on a frozen record. The sentence is
true of the path as written and misleading about the file: a file of that name is right there. Two questions before a fix:
whether the lock hasher could resolve such a row (it needs a path), and whether the finding should name the candidates
("a file of that name exists at <path>") and stay blocking, or advise. Measure the count of such rows on the corpora that
have them first.

## 398. A `**Status:**` value that wraps onto the next line is read as its first line only

Found 2026-10-22 by an outside run of 3.8.51 (a Python backend corpus, 72 records, 209 tasks): four records whose Status
line wraps ("Frontend-driven (no backend work required; closed from" / the rest on the next line) are undecided, "a status
this reader does not recognise", and one, "Partially Implemented — <channels>", is not recognised either. The reporter
reads both as its own records' shape, not a reader bug. Whether a wrapped Status is joined (and which readers share the
header parser) is a choice to make, not an obvious fix.

## 399. A markdown file with no Status line in a scanned directory appears nowhere in work-next's report

Found 2026-10-22 by an outside run of 3.8.51 (a SPA corpus on Windows, no ADR records): in a design-spec directory, files
with a Status line are listed under `workNext.notRead`, and one file with no Status line appears in neither records,
undecided nor notRead. If notRead is meant to name every markdown file a reader skipped, it is missing that one; if it
names only files with a Status, the report should say so. Unverified against source.

## 400. A task blocked on an owner's input reads as "also ready"

Found 2026-10-22 by an outside run of 3.8.51 (an infrastructure corpus, 22 records, 29 tasks): adr-next lists a task as
"also ready" whose only blocker is an input the owner has to supply (a secret not yet in the vault); the record has no way
to say "blocked on owner input", so readiness is computed from its Depends-on alone. Not a reader defect as written; a
state the task grammar lacks. ADR-120 T8's terminal statuses are the nearest prior art.

## 401. adr-next withholds done for a missing first-red lock and says adr-lint names the remedy, while adr-lint passes the record silent

Found 2026-10-22 by an outside run of 3.8.51 (a Go CLI corpus on Windows, 166 records, 405 tasks): adr-next marks four of
five READY tasks (two tasks in each of two records) "marked done but has no first-red test-lock-sha256 — UNPROVEN … a red
run is required" (`plugin/lib/record.py:4149-4160`) and ends "`adr-lint` names the remedy" (`plugin/bin/adr-next:762`), but
adr-lint PASSes both records and none of its advice names the test lock or a red run. corpus-probe's `disagreements`
compares only ready lists, so it reports 0; its `readinessUnproven` counts work-next's unread directories, a different
thing, which the reporter read as this. Two leads: why adr-lint is silent on a done task the shared lock reader withholds
(strictFrom demotion, a code path that does not call it, or a README status adr-lint reads differently), and whether
corpus-probe should count a done-withheld task as a disagreement. Unverified against source beyond the two cited lines.
A second outside run the same day (a Python backend corpus on Windows, 72 records, 209 tasks; its macOS twin agreed) shows
the same summary gap with another cause: adr-next lists three tasks as ready and unproven because their evidence was
recorded before the fence changed or before acceptance digests existed, while the summary's `readinessUnproven` is 0. So
the field's name invites the reading two reporters gave it; at least the summary should say what it counts, or count a
ready task adr-next marks unproven under its own name.

## 402. HIGH: the Windows shims pass `%*` through cmd, so a metacharacter in an argument runs as a command

Found 2026-10-22 by a Windows peer's corpus-chaos run of 3.8.51 (Windows 11 10.0.26200, Git 2.49.0): with a record named
`docs/adr/066-x&hostname&.md`, `adr-lint` printed `ADR not found: docs\adr\066-x`, then the machine's hostname (the `hostname`
command ran), then exited 0. Every `plugin/bin/*.cmd` passes `%*` to the interpreter, and cmd re-reads `&`, `|`, `<`, `>` and `^`
in an expanded argument (the class known as BatBadBut). Unmeasured here: which callers can deliver such an argument (a quoted
path from a shell, Node's spawn of a `.cmd`, the MCP server, a hook), and whether quoting at the caller suffices. The fix is a
design choice (a Node or PowerShell entry instead of a batch shim, or refusing an argument carrying a metacharacter) and needs a
Windows measurement first.

## 403. Findings of the same Windows chaos run, by severity

Found 2026-10-22 (the run of §402). None reproduced here yet; each is a lead.
- MEDIUM: a truncated Verification Log (its last row cut) reads as "locked test … hash moved" with the relock as the remedy, so
  following the advice re-approves a damaged ledger; nothing names the truncated row.
- MEDIUM: a second record with an existing id (`CON.md`, `065-copy.md`) is counted as one more record; nothing says
  "duplicate", and governingNothing lists it apart.
- MEDIUM: a record name with a leading U+FEFF or spaces makes adr-next call its task folder's owner UNKNOWN, while work-next
  lists the tasks ready and corpus-probe reports 0 disagreements.
- MEDIUM: a CR-only record passes adr-lint (Python) while work-next (Node) reports its spec uncovered.
- MEDIUM: an untracked NTFS junction loop (`docs/adr/loop -> docs/adr`) makes each adr-lint take 97 to 114 s and still pass;
  corpus-probe has no total budget and was killed at 600 s with empty output.
- MEDIUM: a lock covers every test function in a file the Tests table names, so editing a test only T2 lists reports drift on
  T1 too (predates 3.8.51).
- MEDIUM: adr-lint passes the sign-offs `zy: failed on 2+2` and `zero failures` while adr-next stops on both; adr-next stops on
  positive owner sign-offs that describe a procedure with "failed", "stopped" or "panicked"; work-next's `\bmarked\s+done\b`
  matches the prose "before the task is marked done". "zero failures" and "0 failures" stop while "no failures" passes, and
  "failed on 2+2 — approved" (a dash) stops while "; approved" passes.
- MEDIUM: the lock-drift headline to the user says only "Artifact validation failed", naming neither lock drift nor the task,
  and calls advice "failed"; adr-lint lines reach hook output with CRLF mixed into LF.
- MEDIUM: a constant check passes the classifier when it is wrapped: `powershell -Command "exit 0"`, `pwsh -NoProfile -c …`,
  `cmd /c exit 0`, `command exit 0`, and `bash <<EOF` with `exit 0` in the body.
- LOW: adr-lint passes with git missing (the git check is only advice); of four Windows-reserved duplicate task files
  (CON/aux/NUL/LPT1.md) only one is named; a README held open exclusively gives adr-lint could-not-run while adr-next still
  lists its tasks ready; a hook payload with `"cwd":""` writes `.git/quality-harness/sessions/<id>.jsonl` in the hook
  process's own working directory.
- Corrected by the reporter: §397's bare file name exists twice in that tree, so adr-lint refuses an ambiguous name by design;
  only the wording ("names no file in the repo") is wrong there.
Fixed the same day: the `if … then … fi` false refusal (check-command.mjs, checkcmd.go) and the shims' bare `exit /b`.

## 404. spec-verify judges whether a Cmd override runs a test from its text, and that class is open

Found 2026-10-22 by three Codex review rounds of the 3.8.52 release, each finding new spellings: `true;`, `exit 0;`,
`: # no test`, then `true || test -f x` and `exit 0; test -f x`. `runs_nothing` (plugin/bin/spec-verify) now walks the commands
as the shell reaches them (`;`, `&&`, `||`, `&`, `|`, `exit`) and calls an override a no-op only when execution can reach no
command but `true`, `:`, `exit` or `/bin/true`; every spelling above is a test case, measured in bash and sh. What it cannot
see, by construction (CLAUDE.md §16): any other command that exits 0 without running a test, such as `[ 1 = 1 ] || pytest x`,
`test -f spec.md`, `echo ok`, or a script that does nothing. Text classifies only the forms it was shown.
The structural answer is ADR-123 Decision 2: a pass needs the runner's own evidence that the bound test ran (a cargo `test
<name> ... ok` line, go's `--- PASS`, swift's identity), and an override with none is UNRUN. ADR-123 T3 does that for a Living
model; for an ordinary spec it would turn every override that prints no runner output (`make test-x`) UNRUN, which is a
decision for the owner, not a fix.

## 405. Two CI failures on main's push run at 7805be9f, after the 3.8.52 tag; both fixed

Found 2026-10-22. Main's push run (39777441003) failed two jobs while the land run and the dispatched campaign at the same
sha passed, so the tag stands on the dispatched run (CLAUDE.md §13.3).

- **macOS, `tests/tutorial.test.mjs`: the tutorial's mutant survived.** BACKLOG §222's second occurrence (declined
  2026-09-24, "reopen on a second occurrence"). Its untested hypothesis holds, measured here: CPython imports a stale
  `__pycache__` entry when the source kept its mtime second and its size (`touch -r` pins it; a same-size rewrite then
  imports the old code; a fresh `PYTHONPYCACHEPREFIX` with `PYTHONDONTWRITEBYTECODE=1` reads the source). `scripts/mutate.mjs`
  has guarded its children since 2026-09-13; `adr-verify --mutant`, which ships, did not. The class: every place that runs a
  Python fence before and after a same-second rewrite. Enumerated with `mrw read --grep 'run_bounded\(' plugin/bin/adr-verify`:
  the clean and mutant fences of `run_mutant` (now guarded, one environment for both), a plain run and a background run (no
  mutant, so the project's own cache is legitimate there), the per-task re-entry (runs adr-verify, not a fence) and git calls.
  `scripts/inverse-hunks.mjs` already sets `PYTHONDONTWRITEBYTECODE`. Test: `tests/adr-verify-bytecode.test.mjs`, two
  catalogue mutants killed.
  **Corrected the same day:** the fresh `PYTHONPYCACHEPREFIX` made every fence recompile all it imported, the standard
  library's included, and the coverage floor's run of `tests/evidence-chain.test.mjs` ("the recorded duration is the clean
  fence…") then measured ms:3050 against a 1885ms plain run on `land/a588177f`. Not writing is enough, since the stale entry
  is one the clean fence wrote: measured with `touch -r`, a clean run under `PYTHONDONTWRITEBYTECODE=1` leaves no
  `__pycache__` and the same-second, same-size mutant is read from source. The prefix is gone.
  **And corrected again:** the Codex verification of e54bbad3 found that not writing is not enough when a cache for the
  mutated file is already there. An unchecked-hash `.pyc` is trusted whatever the source says (false survive), and stale
  passing bytecode can hide a same-second edit that already fails until the mutant's write exposes it (false kill).
  `adr-verify` now deletes the mutated files' own `.pyc` before either fence runs, beside the file and under
  `PYTHONPYCACHEPREFIX`, for every tag. Every other cache stays. Test: an unchecked-hash `.pyc` committed with the fixture;
  without the deletion the mutant survives (catalogue mutant killed). A first run of that mutant was GREEN for a reason
  in the test itself: its seed compile inherited the campaign's `PYTHONPYCACHEPREFIX` and wrote the `.pyc` outside the
  fixture.
  **And a third round:** the Codex verification of 12952d76 found four more ways a cache could still be loaded, each a
  false kill. A directory that cannot be listed, or a `.pyc` that cannot be deleted, now refuses the run before anything is
  mutated, where it had warned and gone on. An `--also-restore` `.py` the restore writes again between the fences has its
  cache deleted too. A relative `PYTHONPYCACHEPREFIX` resolves against the fence's cwd. Names match without case. Each has
  a test; the first two have catalogue mutants, killed. The case test runs only on a case-insensitive filesystem, so it has
  no mutant: the campaign runs on ubuntu.
- **Windows, two `tests/publish-command.test.mjs` refusal rows read `null`.** `armedSession` inherited the product's 5s
  observe budget; a slow runner outran it, and the hook advised "unknown" with no decision, which is the designed answer
  (BACKLOG §314, CLAUDE.md §16) and not a fail-open. The helper now sets `QUALITY_HARNESS_OBSERVE_BUDGET_MS` (CLAUDE.md §7);
  the locked test bodies are unchanged.

## 406. Two leftovers of the 3.8.52 release: evidence gathered after the landing, and SessionStart context uncounted; both fixed

Found 2026-10-22 while releasing 3.8.52.

- **Evidence after the landing.** The outside runs were filed after the bump had started landing, so the attestations were
  untracked while `release.mjs` and `land.mjs` require a clean tree and `release-evidence` reads them from the working tree.
  The release ran three times with the files held outside the tree, and its last two steps were run by hand. The cause was
  the order: `release-evidence` asked the outside-run and review questions only at step 5, after the landing and the campaign.
  `release.mjs` now asks them first, through `release-evidence --local <sha>` (git and the review ledger only, no run
  fetched), and stops with nothing checked or pushed until they are answered and committed. A tree whose only change is
  an untracked attestation is named as one, with the commit to make. `land.mjs` still says only "not clean": an ordinary
  landing carries no release evidence.
- **`hook-footprint` dropped SessionStart's context on Claude Code 2.1.308.** Its context attachment carries
  `toolUseID: "SessionStart"`, not the call's id (measured on this repository's own transcript), so it joined no hook and
  was silently skipped. It now joins the latest SessionStart call before it, and an attachment that joins no hook is
  counted as `unattributed` rather than dropped. Over this session's transcript: SessionStart additionalContext 24 firings,
  about 13.2k characters, where it had read none; 10 unattributed.

## 407. The retrying-remove rule covers only tests that start a session; 580 bare recursive removes sit outside it

Found 2026-10-22: main's push run at 7805be9f, attempt 2, failed `windows` on `tests/gate-rules.test.mjs`'s `test.after`,
whose bare `rmSync` met `EPERM` on a directory a child of `spec-verify` (a `go test`) still held. That site now goes through
`tests/helpers/remove.mjs`. `tests/test-hygiene.test.mjs` holds the rule only over test files that name `SessionStart`
(its §380 class), and gate-rules names none. The wider class, enumerated with
`mrw read --count --grep '(^|[^.\w])rmSync\([^)]*recursive' tests`: 580 matching lines in 201 files, including helpers and
sites that already pass `maxRetries`. Widening the rule means classifying each: a child that can outlive the test (a hook,
a gate that spawns a runner) is in the class; a directory only this process wrote is not. Open. ADR-126 (Out of Scope)
defers it here: its T3 ends the budget class, not this one.
Two more live members, 2026-10-22, from the first Windows check ADR-126 T6 asks for (a peer's selftest at c549eab5, a
contended machine): `tests/branch-state.test.mjs:754` (`removeRepository`) and `tests/mutate-runner.test.mjs:1398`, each an
`EPERM` from a bare `rmSync`; both pass alone, and both temp directories were still there after the run.
Correction, 2026-10-23: neither named member is a bare remove. `removeRepository` already removes with `maxRetries: 20,
retryDelay: 250`, and Node's backoff is linear, so about 52 s. `mutate-runner.test.mjs:1398` passes `maxRetries: 10, retryDelay:
500`. A retry was not missing: something held each directory long after that. Widening the bare-remove rule would not have
caught either failure. `removeRepository` now lists, on a failure, whether the refresher's lock was released and what was
running (PowerShell's Win32_Process on Windows, `ps` elsewhere), so the next Windows run names the holder (84d667d9). The
mutate-runner site is inside a locked body (ADR-072 T2/T4/T5, ADR-073 T1, ADR-075 T2) and is unchanged. The wider class, measured
with a script over `git ls-files 'tests/*.test.mjs'`: 445 bare recursive removes. 104 of them are in 17 files outside the
SessionStart class that name a detached child or a hook script (`detached: true`, `branch-state.mjs`, `lifecycle.mjs`,
`run-shell-hook`, `qh-hook`). gates.test.mjs holds 49 and statusline.test.mjs 20. Classifying those is still open, and it waits on
what the next Windows failure lists.
The next Windows run (3.8.54's landing check at 13d14d42, a 16-core desktop, queue length 0 throughout) listed one: an `EPERM`
from `remove()` in `tests/adr-verify-background-unobserved.test.mjs`'s `test.after`, intermittent (1 of 3 runs alone), on a
directory holding the background run's log, the fixture repository and the state directory; no process named it a minute
later and a plain remove then succeeded. The holder is `adr-verify --background`'s detached child during its exit: the test
waits only for the Verification Log row, which the child writes before it releases its lease and exits with its log still
open, and `remove()`'s 10 × 200 ms is shorter than that exit. The fix waits for the child's pid (the parent prints it) before
removing, and widens `remove()` for the locked sibling `tests/adr-verify-background.test.mjs`. The class is now named:
a test that waits for a detached child's OUTPUT rather than its EXIT.
3.8.55's Windows landing check (4de330ca, a 16-core desktop, queue length 0) confirmed that fix (3 of 3 alone, no leftover)
and listed one more member: `tests/branch-state.test.mjs`'s "a brief never shows a snapshot past the cap" failed its
`removeRepository` with `EPERM` on a directory holding only `.git`, in the full run only (3 of 3 alone pass); a plain remove a
minute later succeeded, and one such directory from the 3.8.53 run was still there. The listing 84d667d9 added did not name
the holder: it filters processes by command line (`branch-state|gh|git`), so it caught unrelated processes and not whatever
held the handle. The next listing has to follow the test's own process tree (its parent chain) or ask for handles; a name
filter cannot answer this question.
The wider class, done 2026-10-23 (b5316a0b). The rule's pattern `rmSync\([^)]*recursive` stopped at the first `)`, so a remove
of a joined path was invisible to it. It now reads past a nested call, and its class is every test that starts a child able to
outlive it, not only one naming SessionStart. Measured: 16 files outside the old class, 54 bare recursive removes. 38 go
through `tests/helpers/remove.mjs`; 16 sit inside bodies ADR tasks lock and joined the closed list with their counts. The
wider pattern also found 4 removes the old one missed, in corpus-link-loop, work-next-readiness and dispatch-streams.
Still to come from outside: the holder that the two Windows EPERM members now name when they fail.

## 408. release-evidence counts any JSON under docs/corpus-reports that carries an `at` as an attestation

Found 2026-10-22 by the Codex review of v3.8.52..2ad118d0: a file holding only `{"at":"<sha>"}` is refused by
`attest-import` but accepted by `readAttestations`/`outsideRun` (`scripts/release-evidence.mjs`). An uncommitted file is
now verified before `release.mjs` takes it as evidence (`attest-import --verify`, ADR-126 T4's fix round), so the open part
is a COMMITTED file that did not come through `attest-import`: the commit is reviewed, and nothing reads it as the importer
would. The structural answer is for `outsideRunEvidence` to run the same checks `--verify` runs over each file it counts.
Open.
Fixed 2026-10-23 (e10b9f6b). `attest-import --verify`'s logic is now `verifyFile`: `check()` plus the byte-exact comparison.
A release asks the outside-run question through `releaseOutsideRun`, `main`'s default, which verifies each file that covers the
sha. One that does not verify is named and attests nothing. One git cannot check is coverage unknown. Only covering files are
verified: about 60 committed reports from before 2026-09-28 fail `--verify` (many are `kind: hand`), and none covers a recent tag.
`release-evidence --local c549eab5` still reads READY over the two 3.8.53 attestations. The bare `outsideRunEvidence(sha, exec,
dir)` keeps its unverified answer, which ADR-082 T3's locked test pins, and a mutant at `main`'s default holds the release path.

## 409. Two tests fail when the checkout itself sits under the temp directory or the home directory

Found 2026-10-22 by the first Windows check ADR-126 T6 asks for: a peer cloned c549eab5 into its scratchpad, which lives
under `%TEMP%`, inside both `os.tmpdir()` and the home directory. Both tests pass alone from a checkout outside them, and
fail every time from there, so each depends on where the checkout is (CLAUDE.md §8).
- `tests/gates.test.mjs:3547` "every gate that returns a verdict names the binary that reached it (BACKLOG §143)": the
  verdict line's binary path is home-relative (`~/AppData/Local/Temp/…`), and the assertion that no verdict prints the home
  directory reads it as a leak.
- `tests/lifecycle.test.mjs:2186` "reported: a scratch corpus does not pull the record gates": the exemption treats a path
  under `os.tmpdir()` as scratch only while the plugin is a real checkout outside it; with the checkout under `os.tmpdir()`,
  the orphan counts as the project's own. Its fixture is also a fixed shared path, `os.tmpdir()/quality-scratch-corpus`,
  which had stood on that machine since 2026-09-18.
An adopter's plugin install sits in `~/.claude/plugins`, not under the temp directory, so the product is not affected as far
as is known; what is open is that the two tests cannot tell this shape from a defect. Open.
Fixed 2026-10-23 (3e59ffc0). A correction to the first item: the binary path was already shown with `~`. What carried the home
directory was the RECORD path the verdict line echoes, which sits under `%TEMP%` and so inside the profile. That fails on any
Windows checkout under the profile, not only one under `%TEMP%`.
- Verdict lines now show an absolute argument under the home directory as `~/…`. The owner's choice: it supersedes §350 item
  6's "as given" for verdict lines. Covered in `adr-lint`, `adr-judge`, `arch-lint`, `postmortem-verify`, `spec-verify` and
  `adr-retire-check`. Class: `mrw read plugin/bin --grep 'print\((visible\()?f"\['` lists every `[`-line print, stdout and stderr.
  Left open: the stderr `could not run: <path>` lines in `adr-lint`, `adr-judge`, `adr-next`, `arch-lint`, `postmortem-verify`
  and `spec-verify` still echo a path as given.
- A temp path is scratch when it lies outside `cwd`, by its spelling and by its real location (`scratchOutside`, in
  `tree-facts.mjs` and `core/hooks/treefacts.go`). A write through a link in the project stays the project's own, as the
  writes-and-stops golden records.
- Left: the locked body's fixed shared fixture, `os.tmpdir()/quality-scratch-corpus`.
- Not yet run on Windows: the new tests run on the Windows CI job of the next landing.
Reverted the same day: the scratch half. The full gate failed `tests/hook-work.test.mjs` "artifact passes check equivalent ADR
inputs once and check fresh changes on the next pass". It needs a temp-root project beside the session's own temp-root project
to be gated, so the two ADR inputs are linted twice. The locked lifecycle test wants exactly that shape exempt when the checkout
sits under the temp root. No rule over (file, cwd) satisfies both, and the locked comment says "this suite's own fixtures
depend on that". So `artifact-pass.mjs:113` and `:268` keep `underTempRoot(file) && !underTempRoot(cwd)`, and the lifecycle
test still cannot pass from a checkout under the temp root. Open, and it needs the owner: amend the lock of ADR-068 T2 / ADR-099 T1
so the test builds its own non-temp checkout, or accept a Windows clone under %TEMP% as unsupported for the selftest. The
verdict-line half stands.

Redone 2026-10-23 (4703563a), so that both tests hold. `hook-work`'s second project now sits inside the first; the assertion
is unchanged, and that test has no lock. `scratchOutside` keeps the old rule outright for a project outside the temp root.
For a project under it, a temp file is scratch only outside the project's repository, by spelling (the root as cwd spells it)
and by real location. Mutating the deferred pass found a fail-open in the first cut: measured against cwd rather than the
repository, a session started in a subdirectory skipped its repository's other records. The deferred pass's own filter
(`artifact-pass.mjs:268`) has no mutant. Only a checkout outside the temp root with a link into it reaches that filter, and no
test builds one. The Go test runs from `lifecycle.test.mjs`, so its mutant is killed.
The stderr half, done the same day (7e950237): every could-not-run line and usage refusal that echoes a path now shows one
under the home directory as `~/…`. That covers 11 gates and qh-mcp. `home_shown` also compares the resolved home, since
macOS names /var as /private/var. A mutant per site, 33 of 33 killed.

## 410. branch-state read every landed sha on main as COULD NOT LOOK; fixed

Found 2026-10-23 at session start: main at 2a8da294, with a green run on `land/2a8da294…`, read "COULD NOT LOOK — no run listed
is at HEAD". Since ADR-126 main has no run of its own. The by-commit retry (§344) found the run but kept only rows on the
current branch. It now also keeps `land/<the full sha it asked about>` (6993a10b). A `land/` branch naming another sha, or any
other branch, is still not this branch's CI. By hand on main: `CI 2a8da29: every job concluded success`. A reader change (§18).

## 411. The Stop hook's R2 named 277 landed commits as unchecked with HEAD freshly checked; fixed

Found 2026-10-22 (memoryd open thread f9484e37 filed it as R4; it is R2, `uncheckedCommitsReason`). `sessionCommits` lists every
commit between the session's starting HEAD and now, so a fast-forward over landed work named each of them. A first fix cut the
list at the newest checked commit. It broke ADR-060's step 14, where `five` sits under a `six` that restores a checked tree and
must still be named, so it was reverted. The owner then chose (2026-10-23) to leave out commits a remote ref already reaches
(`--not --remotes`, in `tree-facts.mjs` and its Go mirror, 5f86118d). The cost: a commit this session pushed is no longer named
at Stop after the push. `tests/r2-remote-commits.test.mjs` runs in the go core job too. Go mutants are not run by `mutate.mjs`,
so the Go mirror is held by that test alone.

## 412. orphan-sweep counted a comment as a use, which hid two orphans; fixed

Found 2026-10-23 while asking whether anything in `plugin/` was reached only by tests. A throwaway scan of the exports in
`plugin/scripts`, with comments stripped, found `admitSync` in `lease.mjs`, called only by `scripts/mutate.mjs`. It moved
there (d167ecdb). The sweep had reported `0 orphan(s)` because a doc comment named the function. With comments blanked by
real lexers (record.py's `js_reading`, Python's `tokenize`, a shell `#` line), it found `DURATION_REQUIRED_FROM` in adr-lint.
That constant's own comment said the duration was "required from a date", and nothing read it. It is now wired as advice: a
run row on or after 2026-09-02 with no `ms:` is advised. Over this corpus that is 2266 rows and none without `ms:`. A naive
comment strip read `/*` inside a regex literal as a comment and erased a real use; the lexer does not. Both in ea2467f8.

## 413. The Go core was neither gofmt-checked nor vetted, and two files had drifted; fixed

`core/hooks/turnend.go` and `saidcontext.go` differed from gofmt. `tests/go-format.test.mjs` asserts `gofmt -l core` lists
nothing and `go vet ./...` passes, with a dirty twin. The go core job, which requires go, runs it (2eab7982).

## 414. statusline's per-session cache was never removed from the temp root; fixed

`quality-harness-status-<hash>`, one per session, for good on every adopter. A selftest run left 26. The daily marker sweep
removes a week-old one (cb46e00d). The rest of that run's leftovers (`qh-mutate-run` from a mutate crash this session's
cleanup bug caused, python `tmp*`, `quality-harness-owner`) are inside the run's own temp directory, which the selftest
removes on exit.

## 415. A reproduction for each escape whose own tests do not notice its fix undone, and replays off Linux

Deferred from ADR-127 (Out of Scope, Follow-ups), 2026-10-23. Its replay reverses each outside-found defect's fix in a fresh
worktree and runs the tests the fix added, on Linux; an entry whose tests all still pass is INSENSITIVE, which is a lead, not a
finding that the defect can recur. For each such entry, a reproduction (a corpus, the reader command, what correct output says)
decides that, and becomes the regression it lacks. Replays on Windows and macOS, for entries whose tests observe the defect only
there, are the other half. Open until every INSENSITIVE entry T2 names has a reproduction that settles it, and the replays run
on Windows and macOS.

## 416. R2's exclusion reads the refs and keys git maintains; one written by hand is outside its evidence (permanent: boundary)

Recorded 2026-10-23, after nine review rounds on §411's exclusion (6619eba1..2e1edfe7). Each round found one more spelling, and
each fix stands with its regression in `tests/r2-remote-commits.test.mjs` under Node and the Go core:
- a remote's own HEAD as the upstream (841574f9);
- a remote whose name holds a slash (e5f88437);
- a remote name ending in U+00A0, which Node's trim cut (7816aaf7);
- a configured but refused upstream that fell back to origin's default branch, and U+2028 in a branch name (7976d523);
- an empty merge value read as no upstream (2e1edfe7).
Every one of those setups writes a tracking ref or a config key by hand. The class, enumerated:
`mrw read tests/r2-remote-commits.test.mjs --grep "'update-ref', .refs/remotes|'config', '--add'|'config', .remote\." --count`
gave 10 lines on 2026-10-23. The same operation is how the first test simulates a fetch, since a fetched ref and a hand-written
one look alike from inside the repository. R2 leaves out a commit that a remote-tracking branch of the configured upstream
holds, or, with no upstream key, origin's default branch; whatever wrote that ref, the commit is published as far as the
repository can tell, and CI answers for it as much as for any fetched one. So a ref written under `refs/remotes/` by hand, or a
config value that `git remote add` or `git branch -u` would refuse, is outside what R2 can tell apart. It is not a defect
(CLAUDE.md §16: the input space is open; the owner, 2026-10-07: no endless review loop). A reviewer's fail-open that
needs such a setup is answered by this entry. One that does not, found through git's own commands, is a new finding.

## 417. orphan-sweep's shell lexer reads the shell this plugin ships; a construct it does not contain is a lead (permanent: boundary)

Recorded 2026-10-23, after six review rounds on the comment blanking §412 added (fd95e4a0..735ca701). Each round found one more
shell construct, and each fix stands with its regression in `tests/orphan-sweep.test.mjs` and a killed mutant:
- quotes and here-documents (fd95e4a0);
- `$(` inside double quotes (03990fca);
- backquoted substitutions, lexed as the command the shell reads from them (024e4b1d, 82717e46);
- backslash-newline inside them and before a # (99803be6, e3acb340);
- an escaped blank (735ca701).
The sweep is advisory (CLAUDE.md §2: a place to look, never a verdict). Its shell input is the plugin's own shell files:
`git ls-files 'plugin/**.sh' 'plugin/*.sh'` listed 2 on 2026-10-23 (`facts-gate-dispatch.sh`, `post-edit-check.sh`).
So a construct those files do not contain cannot hide a definition the sweep reports on. A reviewer's finding built on one is
answered by this entry. It is filed here as a lead only if it errs toward a comment counted as a use. A construct that appears
in a shipped shell file, or a regression from the reading the parent commit gave, is a new finding.

## 418. The scrubber shows what a `..` climbs to from a known prefix (open)

Found 2026-10-23 by the Codex review of 7df3a7e7. `corpus-text.mjs`'s `scrubber` replaces a known prefix (the root, the plugin,
the temp root, the home) and keeps the rest of the path in view, so a `..` segment there names what lies beside it. With
`root: '/work/repo', home: '/home/someone', tmp: '/tmp'`, v3.8.53 and 96fddfd5's successor print alike:
- `/tmp/../home/someone/Projects/private.md` as `<tmp>/../home/someone/Projects/private.md`;
- `/work/repo/../sibling/x.md` as `./../sibling/x.md`;
- `/home/someone/../other/x.md` as `<home>/../other/x.md`.
This predates the release. Three attempts at it inside one (82289dc7, 96fddfd5 and its verification) each leaked through
another spelling: a single-backslash POSIX root the later patterns do not know, and a quoted path whose tail holds another
quote. So 3.8.54 confines its change to the new `~/` shorthand, which leaves a climbing path exactly as v3.8.53 read it. A fix
needs its own design. One candidate is to resolve `..` lexically, per token, before any prefix is matched, then judge the
resolved path; every spelling the scrubber knows needs a twin, quoted and unquoted. Open until a fix holds those twins.

## 419. `home_shown` is copied by hand into eleven gates, beside a comment that is not its own (open)

Found 2026-10-23 by the ultrareview of v3.8.53..main. §409 added `home_shown` to each gate that echoes a path:
`mrw read plugin/bin --grep '^def home_shown\(path\):' --count` gave 11 on 2026-10-23. Ten are alike; qh-mcp's has a shorter
docstring and its own `from pathlib import Path`. A later fix to how the home is spelled has to be made eleven times, and a gate
it misses keeps printing a username (§6). Nothing asserts that the copies agree. Each copy also sits between ADR-031's
`gate_identity` comment ("imports are local so this block is byte-identical in every gate") and `gate_identity` itself, so the
comment now reads as `home_shown`'s, and it is false there. The fix is one helper in `plugin/lib/record.py`, imported by each
gate, with the copies removed, placed above that comment block where a local definition must stay. It is deferred because it
touches eleven gates and their goldens, and 3.8.54's change is the redaction itself. Open until there is one definition.

## 420. R2 leaves out a commit this session pushed to its own upstream (closed: the owner keeps it)

Found 2026-10-23 by the ultrareview of v3.8.53..main. Since §411, sessionCommits passes `--not <upstream>`, so a commit the
session made without a check and then pushed to its configured upstream is not named at Stop. §411 recorded that cost ("a
commit this session pushed is no longer named at Stop after the push"). The review's point is that nothing asks whether CI
runs on that branch: a fork's feature branch, a repository with no CI, or a branch CI ignores all count as published. The
publish refusal (ADR-061) still stands in front of the push itself in an armed session, so the gap is a push that refusal let
through (`"publish": "warn"`, or a push it could not see). One candidate: leave out only what the upstream held when the
session began, plus what a fetch brought, and keep naming what this session pushed. It is open because the owner chose the
current reading on 2026-10-23 ("Skip remote commits"), and changing it is the owner's call.
Closed 2026-10-23: the owner keeps the current reading ("skip what it holds"). What R2 adds over R1 is a commit below HEAD
whose tree never passed; one already in the upstream is CI's to answer for, as far as the repository can tell.

## 421. ADR-104's exemption reads one bare commit; a staged-and-committed chain into another repository is refused

Found 2026-10-23 seeding a second repository from this session: `cd <other repo> && git add -A && git commit -F -` and
`git -C <other repo> commit -F - <<'EOF' …; echo $?; git -C <other repo> log` were both refused by the publish guard as this
checkout's unchecked publish; the bare `git -C <other repo> commit -F - <<'EOF' … EOF` alone was advised (ADR-104). The
refusal is the conservative side, and a trailing `echo` or `git log` cannot publish this checkout; `git add` before the commit
cannot either. A widened exemption is a classifier change (CLAUDE.md §16): each new data row needs its code-again twin (a
`cd` back, a second `git` that is a commit here). Open; bug-fix scope.

## 422. A test file that passed could be deleted, and the next pass said nothing; advised now

Asked 2026-10-24 by a reader of the 3.8.55 announcement: "does it flag when the test count drops compared to the last run?" A run
that scored no tests was already a failure (`adr-verify`, `completion-rules.mjs` `reportsZeroTestWork`), and a test a task locked
could not vanish before done (`plugin/lib/record.py` `lock_findings`). A test that no task locked could be deleted, and the next
pass said nothing. The owner chose (2026-10-24) to nudge from the ledger here and to send the count to qh-core.
The ledger's trees cannot be read back: `observe` writes their objects to a scratch directory it removes (`tree-facts.mjs`). So
each bound pass keeps its test files, by path and content hash, in `passed-tests.json`, keyed by ledger and command
(`plugin/scripts/removed-tests.mjs`). The next pass names each file that is gone and whose bytes are at no new path, with the new
test files beside it. It says nothing on a failed run, on a first pass, or when the last pass's HEAD is not history of this one,
and it is could-not-look when the record or git cannot be read. Advice only; the exit is the check's.
The class is "a test that passed is gone, unremarked". Members not covered: a test removed from a file that stays, a test
skipped in place (`.skip`, `xit`, `@pytest.mark.skip`), a directory dropped from the runner's configuration, and a file named
outside the default patterns. Each needs a reader of test definitions or of runner output. That is the qh-core idea sent
2026-10-24: a count per run from each runner's machine format. Open here only if one is reported.
Codex review of v3.8.55..f56e7cb6 (high), REQUEST CHANGES, four findings confirmed against source and fixed in one round. (1) An
entry of a shape qh-check does not write (a NUL `head`, `files` that is not a path-to-sha256 map) could throw out of a passing
check or read as no test files. It is now could-not-look, and qh-check contains anything the advice throws. (2) A file git no
longer lists counted as gone. It is gone now only when nothing is at its path; a file now ignored, or one that cannot be read,
keeps its last hash. (3) Bytes that matched a file that stayed counted as a move; only a path the last pass did not have can be
one. (4) `*_test.go` under `testdata` or a `.`/`_` name is no test (`go help packages`). A mode-000 file fails the check's own
observation, so the unreadable case is reached only between that observation and this read, and its test calls the module
directly. Left, as the review named it: two qh-check runs writing `passed-tests.json` at once can lose one command's entry or keep
an older one, which costs advice and nothing else. The catch around the call has no test, since no input reaches it now.
The verification review of 975ce16d found one regression, a fail-open: a test file that is a link whose target was deleted
passed `lstat`, so it was kept as present and never named. The disk check follows the link now (`statSync`), with a test.

## 423. A test removed from a file that stays, or skipped in place, was not said; advised now

The owner asked on 2026-10-24 ("fill the gaps?") for §422's open members. This repository is bug-fix only, and qh-core is its
successor, so this is a reader change made here at the owner's explicit request. Two of the four members are fillable from source.
Each pass now also keeps the test names of a file whose runner was measured on 2026-10-24, one fixture per runner:
- node:test, node v24.22.1: `test(` and `it(` with a string-literal name; the skip forms are `.skip(`, `{ skip: true }` and
  `{ skip: '<reason>' }`.
- pytest 9.0.3 on Python 3.14: `def test_*` and `async def test_*`; the skip form is `@pytest.mark.skip`, never `skipif`.
- go test, go1.27.3: `func Test…(t *testing.T)`; no skip is read, since `t.Skip` sits behind a condition.
PHP and Ruby had no runner here and are not read.
The rules: a file whose bytes changed and that now holds fewer tests names the missing ones that are new nowhere in the tree. A test
the last pass ran that carries an unconditional skip now is named. A rename in place keeps the count and says nothing. A commented
line is not read.
An entry written by 3.8.56 has no names and is read as one with nothing to compare. The write re-reads the state first, so two
commands passing at once no longer drop each other's entry (§422's first residual).
Replayed over the last 600 commits of this repository, 388 of them changing a test file: 14 flags, every one a deliberate removal
its commit explains (ADR-099 T1/T2 at d97f86d5, ADR-097 T1 at dbf53131, the §409 revert at 238611f9), and none from a rename, a
move or a reformat. No skip was flagged: this repository's skips are conditional.
Left: a directory dropped from the runner's configuration and a file named outside the default patterns. Both need the runner's
own output, which is the qh-core idea sent on 2026-10-24.
