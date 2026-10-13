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

## 302. The 2026-09-26 inbox: one regression of mine, four false blocks and advisories fixed for 3.0, two left open

Eight inbox drawers from peer projects (go-cli-adr-corpus, go-recall-service, rust-records-corpus), each with a repro. Each was confirmed against source before acting.

**Fixed for 3.0** (each with a regression test beside a dirty twin, and a RED catalogue mutant):

1. **A false self-dependency FAIL — a 2.111.0 regression of mine.**
   - The report: `T2-the-surfaces-say-what-t1-made-true.md` with `Depends-on: T1` was refused as depending on itself.
   - The cause: adr-lint's `id_matches` matched a task id ANYWHERE in the file name, although its docstring promised an anchored match. The §295 self-dependency check reused it without reading the regex.
   - The same loose match also mapped the README order of T1 onto T2's row (`order(T1)=2`).
   - Now a task's id is the first task-id token in its name, as adr-next already read it.
2. **Advice on relock rows.** `--relock` rows (ms:0) were advised as "too short to have run the fence". A lock snapshot runs no fence; the floor now skips it.
3. **cargo's `--test <binary>` read as a test-name filter**, which blocked `done` on every row outside that binary. It was removed from the filter flags. It had been there since the first commit, with no measured runner behind it.
4. **A two-runner fence.**
   - One runner's filter was applied to the other runner's tests, which also blocked `done`.
   - Now a test runner of the row's language with no filter, whose command names the row's file, its directory or Go's `...`, runs that row.
   - cargo is deliberately not in that list: its `-E` and positional names are filters this gate does not parse. A catalogue GREEN found the first cut treating them as unfiltered.
5. **arch-lint read Go's `./...` as a missing path** (reported twice), which blocked a project's real gate. A token containing `...` is a package pattern.

**Left open:**
- A nested `[build failed]` grades a real kill inconclusive. This is §253, now with a second corpus and a repro (go-recall-service `keep/t8-build-probe.out`). It is not a false block: the grade is weaker than it should be, and the reporter worked around it.
- `Class::method` spelling for Python unittest rows in a Tests table (from the two-runner report). It was reported beside #4 and is not blocking there.

**How #1 got past every check.**
- The new check was tested only on the one-task fixture, where it must FIRE. Nothing tested that it stays silent on a real name that merely mentions another task. The dirty half of CLAUDE.md §4 was there; the clean half needed an adversarial realistic input.
- A mutation campaign cannot find a check that fires too often: every mutant weakens it.
- None of the outside corpora of the 2.111.0 rounds had a slug containing another task id.
- So the class — a check reused on the strength of its docstring — is named here. The fix is a test on the shape reported, through the gate itself.

## 303. 3.0.0 before the tag: a Codex round and three outside runs (2026-09-26)

**Outside runs at 2c0f7b2.**
- **go-cli-adr-corpus, on the corpus that caught §302's regression.** ADR-075 PASSes; all 82 records PASS; `couldNotRun` 0, `disagreements` 0. Its `at` was null because it ran from a `git archive`.
  - A lock-moved task routed to adr-execute is intended.
  - Its spec with `**Status:** Implemented` reads UNPROVEN, which is honest under the documented set. OPEN lead: should `Implemented` be a recognised terminal spec status?
- **Windows (git 2.49).** The probe was clean, and its attestation is filed. It also caught two real test defects, fixed in efad638:
  - the publish-hook tests assumed git ≥ 2.54, and now skip with that reason;
  - the detached refresher's cwd held the temp repository, so cleanup hit EPERM. Cleanup now waits for it and retries.
- **ts-generator:** could not run; its classifier refused the cloned code, and the decision is with its user. Could-not-run, not a finding.

**The Codex round (high effort, v2.111.0..2c0f7b2) found seven real defects.** The release was HELD for #1, a fail-open. Each was confirmed against source and fixed with a test that fails without the fix, and a RED catalogue mutant.
1. **P1, a fail-open.** `git push --no""-verify` and `--no\-verify` read as a plain invocation in an armed session: advice, while bash handed git a real `--no-verify`. Quotes and escapes are now stripped before the checks, and a `$` or a backtick keeps the refusal.
2. **Paths in the stored hook command were re-expanded by `sh`.** A `$` in the installation path vanished. The paths are single-quoted now.
3. **Two prompts that both judged a lock stale could start two refreshers.** The second renamed the first one's fresh lock. The lock now holds a unique token, and a reclaimer puts back a lock whose token is not the one it judged stale.
4. **A quoted git config value (`remote = "origin"`) broke push invalidation.** Values are now read as git reads them: quotes, escapes, comments.
5. **The unfiltered-runner rule matched a DIRECTORY SUBSTRING**, and it credited a pytest `::` selector and an `echo` of a runner. A runner must now start its segment, and its path arguments must reach the row exactly: the file, a directory holding it, a dotted module, or Go's `...`.
   - The catalogue then found the first `::` check dead: an argument carrying `::` never equals a path.
   - Worse, the check never credited the one test a `file::test` selector does run, which was a false block.
   - A selector now credits exactly the row it names.
6. **Removing `--test` had also removed cargo's binary scoping.** `--test X` now selects only `tests/X.rs`. A cargo command without it cannot be shown not to run a Rust row, so it does not block (§16).
7. **arch-lint's `...` exemption covered any token containing `...`.** Only a token ENDING in it is Go's pattern.

**How #1 got past T3's own review and catalogue.** The escape table listed the spellings measured that day, and every one of them was a plain token. Shell quoting is transformation, not text. §16's rule — reproduce shell semantics against a shell — applied here, and was not applied to the new predicate. The fix judges what git receives, not what was typed.

**Round 2 (Codex, high effort, efad638..fd3922b) and the campaign at fd3922b.** The release was HELD again for #1, a fail-open.
1. **P1, a fail-open, the same class as round 1's #1.** `git push --no-\<newline>verify` and `git push --no-{verify,verify}` reach git as `--no-verify` (measured with `printf '%s\n'` under bash), and each read as a plain invocation in an armed session. The quote fix had judged what was typed after removing quotes, not what the shell EXPANDS. `leavesHookInPlace` now joins line continuations first, and outside quotes it admits only an allowlist of plain characters: a wrong `false` costs nothing, since ADR-061 refuses the unchecked tree as it did before git was armed.
   - `git {-c,hook.qh-publish-push.enabled=false} push` is never matched as a publish by ADR-061's text classifier at all, in any session. That gap predates 3.0 and is the §301 Stage 3 lexer's; OPEN.
   - Four more GREENs in the same campaign. Two were a second path masking the first. `without_workspace_filters` (shard 7): 3.0.0's two-runner credit credited every pnpm fixture's PHP row, so a pnpm-only fence with a TypeScript row was added. The prompt path's `key` (shard 18): the locked T1 test read a cache the refresher behind the previous prompt had already keyed; a new test collects with nothing cached, and the mutant's `only` points at it, the locked body unchanged.
   - Shard 21: `--test` put back among the narrowing flags went unseen, because `cargo_runs` now credits every cargo fixture. `node --test <file>` — a mode flag — is what keeps it out, and no fixture held it. Shard 10: CF1's blank-line stall test is a timing bound, and the mutant is CUBIC (10.0s at 4,000 lines, 77s at 8,000, measured on the regex alone): 4,000 sat on the 10s bound, so a fast runner let it through. It now uses 6,000.
2. **A GREEN catalogue mutant (shard 33/48):** "a mention imports the check source before its warning reads the ledger". ADR-066's review fix had put a second `importCheckRecords` inside `publishVerdict`, so each import hid the other (both removed: RED; either one: GREEN). The import now lives in each caller once — PreToolUse's boundary and `runPublishHook` — and `publishVerdict` only decides.
3. **adr-lint, fixed:** a pytest class selector (`file::TestSuite`) and a unittest dotted class were read as a test name and blocked the rows they run (a false block). A selector's last component rules a row out only when it is another `test*` function; a class cannot be shown not to hold the row (§16). Go directory arguments are not recursive: `go test ./pkg` credited `pkg/sub/…`, and a bare `go test` credited every Go row; only `/...` descends, and a bare call after a `cd` is not judged. A quoted `cargo test --test "smoke"` is the same binary.
4. **arch-lint, fixed:** `! grep -q x ./missing...` still passed for ever. A `...` token is exempt only where its base exists; Go itself refuses a missing base (`lstat ./cmd/: no such file or directory`, go1.27.1, 2026-09-26).
5. **branch-state, fixed:** `[Branch "main"]` is the same section to git and was no section to the key. Section names are now read in any case, and a config shape the key does not model — an include, a continued line, an escaped or old-style subsection — gives a null key, which is refreshed rather than trusted.
6. **Known open, under-block or cost only:**
   - `cargo test <filter>` and `cargo nextest run -E 'test(…)'` beside a filtered runner credit every Rust row: the positional and expression filters are not parsed, and a flag-value table typed from memory is §16's own failure. Under-block.
   - The refresher lock can still start two refreshers, or leave none held, under two interleavings Codex constructed. The cost is one extra bounded `gh` refresh; the served answer still states its age.

**How #1 got past round 1.** Round 1's fix judged quotes and escapes, and its table listed the spellings measured that day. Expansion is a different shell phase, and an allowlist is the form that does not need the next spelling named. It is the §16 lesson again, applied late: reproduce the shell, and prefer failing closed where closed costs nothing.

**Round 3 (Codex, high effort, the armed check alone) — and why the check was turned around.** The first request was refused by the reviewer's own content filter ("possible cybersecurity risk") and certified nothing; the same question reworded as a correctness review of a predicate ran. It found ten inputs the check accepted while bash and zsh handed git `-n` or a hook-disabling `-c`: a redirection glued to an option (`git commit -n</dev/null`, `-n>&1`, `git -c</dev/null core.hooksPath=…`), an attached value (`-nm123`, `-nm'fix: bug'`), and an inline alias. Before patching, seven more were tried and all were accepted too: `--work-tree=`, `--git-dir=`, `--exec-path=`, `PATH=/tmp/bin;`, `source ./x;`, `. ./x;` and `alias git=true;` — githooks(5) runs a hook from the work-tree root, so `--work-tree` alone moved the session log out of the hook's sight.
- Three rounds had each found a new door, and every fix had added one more thing the check KNEW to be dangerous. A wrong `false` costs nothing here — on an unchecked tree it is exactly 2.111.0's refusal — so `leavesHookInPlace` is now a grammar of what is known to be plain: a quote-aware split into segments; `git`, then only `--no-pager`, `-P`, `-C <dir>` or `-c user.*=…`, then `commit` or `push`, then only non-option words, listed long options and short clusters from listed letters (a value-taking letter ends its cluster; `n` is in no set). Any other segment may not start with an assignment, an environment builtin, `source`, `.`, `alias` or a wrapper, and may not run git inside it. Quoted text holding an operator is judged by the same grammar. `git config`, any `.git/` path and any `hooksPath` keep the refusal.
- The denylist lines it replaces were deleted, and their catalogue mutants re-pointed at the rule that now carries each case; the round-3 redirection rule turned out redundant under the grammar (a glued redirection fails the letter check, and on a plain word changes nothing git receives) and was removed with its safe-redirect set.
- **Residual, named:** a program the command runs before git can still reconfigure git, exactly as a script file can. The check judges only what the command's own text hands git; ADR-066 never claimed more.
- **Moved back:** forms outside the grammar that 3.0's candidates left to git in an armed session now keep ADR-061's refusal on an unchecked tree, as in 2.111.0.
- **Round 4 (Codex, the grammar alone, asked only what it wrongly accepts).** Five inputs, each measured under bash and zsh: a quoted option hidden as code (`git commit '-nm;message'`), a carriage return — and VT, FF, NBSP — read as a word separator, `printf -v GIT_CONFIG_COUNT %s 0` (an assignment by no listed builtin), `bash -c "git commit -m x;"`, and `echo "git commit;"`. Fixed:
  - a git argument that hides quoted code is not plain;
  - only a space or a tab separates words, and any other control character outside quotes keeps the refusal;
  - `GIT_*`, `CLAUDE_*`, `PATH`, `HOME`, `XDG_CONFIG_HOME` or `env` named anywhere keeps it;
  - a publish inside quoted code or a heredoc body counts only under `echo`, `printf`, `cat`, `git` or `node`, and anywhere else vetoes; a heredoc whose own line goes on (`cat <<EOF | docker … sh`) counts its body for nothing.
  - `echo "git commit;"` stays `true`: nothing publishes, so nothing can pass the hook. The request's wording ("invokes git commit") was mine and wider than the safety property.
  - `node` is listed because the locked T3 row names it and a node child inherits the environment by default; `env` named anywhere closes the way out of that.
- **The campaign at cdd3bda** had one GREEN of 1,358: "an unfiltered runner runs only its own language's rows". The round-2 Go branch gives every Go row Go semantics whichever runner matched, which masked the language check for Go rows only; a Python row credited by a Go runner (`go test ./tools` over `tools/test_b.py`) is the case no fixture held, and now does. Test-only: the readers, and both outside attestations at cdd3bda, are unchanged.

## 304. After v3.0.0: two leads the release did not hold for (2026-09-26)

v3.0.0 was released at 4487256 (release-evidence SUCCESS, 55/55 jobs, outside runs attested at cdd3bda). Two leads came in during its last campaign; neither is a fail-open in a gate, and neither is decided here.

1. branch-state picks `gh run list --branch <b> --limit 1`. At cdd3bda the push run and the dispatched run were created in the same second (17:56:53Z); the list returned the CANCELLED push run, so the brief said "CI cdd3bda: CANCELLED" while the campaign had concluded `failure`. The same tie with a green push run and a red campaign would have read green. Pre-existing (not 3.0). Likely fix: select by the branch head sha, prefer workflow_dispatch over push for one sha, and say which run it read. The tie itself came from my wait loop printing `null` for an empty list (jq `.[0]` on []), which let the dispatch fire before the push run existed; §13.3's ordering was lost that time (ids still ordered push < dispatch).

2. go-cli-adr-corpus ADR-055 T2 (peer, 2026-09-26): their tasks/README marks T2 `blocked` on purpose until the test lock can accept a moved body whose change is recorded as a killed mutant against the new assertion (filed to wing_quality-harness inbox 2026-09-13). 3.0.0 still offers only `--relock --replace-hashes` (advised "weaker than first-red"). work-next lists T2 as ready → adr-execute because task files win over the derived README. Questions: should a task file's `**Status:** blocked` stop adr-next (is `blocked` a recognised status?), and should the lock grow a mutant-backed relock?

3. **ADR-066 in a linked worktree.** A commit made in `git worktree add` of the session's repository finds no session log under that worktree's git dir, so `publish-hook.mjs` exits 0 without judging it (measured 2026-09-26). The text refusal still applies; git's own refusal does not. Question: should the hook read the log from the common git dir?

4. **A session is armed only from the next user prompt after SessionStart wrote the exports.** Three commits in the session that built 3.0.0 (17:56Z, 18:52Z, 19:49Z) left no `publish.hook-ran` after `publish.offered` at 16:45Z; the first user prompt after that compaction (≈19:52Z) is when the Bash environment gained `GIT_CONFIG_*`, and every commit since records the hook. It also turned a test red: `tests/publish-hook.test.mjs` spawned git with the session's exports, whose `enabled=true` outranked the repo-local disable it asserted; the file now starts every git from no `GIT_CONFIG_*`. Named in ADR-066's Follow-ups.

**2026-09-27 (3.0.2): item 1 CLOSED; item 2 answered; items 3 and 4 are the owner's.**

- **Item 1.** `branch-state` now lists 20 runs and reads the newest run of EACH workflow at the sha of the newest run, ordered by run id (`headRuns`); the worst of them is the verdict, a red one outranks one still running, and the full form names the run ids it read. The run id, not `createdAt`, breaks the tie: `createdAt` has one-second resolution. Measured 2026-09-27: `gh run list --commit cdd3bda…` returned the dispatch (failure, 36260813407) and the push (cancelled, 36260813368), both at 17:56:53Z, and across the newest eight runs on main id order and `createdAt` order agree; `cancel-in-progress` cancels the older run, so the higher id is the verdict that stands. `release-evidence`'s `selectRun` stays as it is: it asks whether a full campaign exists, so its tie goes to the dispatch.
- **The class (§5), enumerated with `git grep -n "'run', 'list'\|run list" -- plugin scripts`:** two readers pick a run. `branch-state` read one run of ANY workflow; this repository's weekly `evals` schedule runs at main's HEAD (`gh run list --workflow evals.yml`: 35580344647 at 66030ad, a schedule run), so once it was the newest run a selftest red read as evals green. Fixed with the per-workflow read. `release-evidence` already filters `--workflow selftest.yml` and was left alone.
- **Measured, not built: a run-level `skipped` is an alarm.** ts-generator lists `ci`, `platforms` and `e2e` at one sha, and 9 of its last 100 runs are `e2e skipped`. Non-success still reads as ⚠, so a skipped workflow at the head now alarms beside a green one where before it alarmed only when it was the newest run. Whether `skipped` should count as "asserted nothing" is a decision, not a fix.
- **Item 2.** The peer's `ADR-055/tasks/T2-repeat-pattern-and-contract-93.md` carries no `**Status:**` line; only the derived `tasks/README.md` says `blocked`. READY follows the documented rule that task files win (§10). A relock backed by a killed mutant is a feature request for the owner, not a defect.
- Tests: four new tests in `tests/branch-state.test.mjs`, 4/4 failing on the 3.0.1 reader; four catalogue mutants (`--case 'BACKLOG §304'`), 4/4 RED.
- **Codex review of 38fd72c (gpt-6-astra, high): REQUEST CHANGES, five findings, all confirmed against source and fixed before the tag.** (1) The first bullet's "the higher id is the verdict that stands" is FALSE here: `selftest.yml` keys its concurrency group on the event, so a dispatch never cancels the push, and a green dispatch hid a red push. Each event now answers for itself; a cancelled run answers nothing once its workflow completed at the same commit under another event, and alone is still an alarm. (2) Workflows are grouped by `workflowDatabaseId`, not by name: a ruleset workflow lists none. (3) A 20-run window holding nothing but the answering commit may have cut off a workflow: a green answer there is COULD NOT LOOK; a red one stays red. (4) A re-run keeps its id and moves `startedAt`, so runs are ordered by latest start, then id. (5) HEAD's runs answer when HEAD ran; otherwise the newest run's commit, which the render names. Tests: seven new tests; 11 catalogue mutants, 11/11 RED. Over ts-generator (`ci`, `platforms`, `e2e` at 310b18c) the reader names all three red workflows where 3.0.1 read `e2e` alone.

## 305. CLOSED 2026-09-26 (3.0.1) — The test lock hashed a node:test options object instead of the test

Archived: [backlog-archive/BACKLOG-301-400.md](backlog-archive/BACKLOG-301-400.md)

## 306. 2026-09-27 — ADR-067 (a lexer for the text refusal), a dead-code cleanup, and a sweep that could not see bindings

**Released first:** v3.0.2 at 826ec94 (release-evidence SUCCESS, 55/55; §304 item 1).

**ADR-067, Accepted by the owner 2026-09-27.** §301 Stage 3, scoped to what git's hook (ADR-066) does not decide. T1 (`plugin/scripts/shell-words.mjs`, proved against bash 3.2 and zsh 5.9 with a recording stand-in git) and T2 (`publishCommandIn` walks the lexer's argv; the `PUBLISH_*` regexes except `PUBLISH_MENTION` are gone) are built. T3 (the armed grammar on the same lexer) is next.
- Measured against the old classifier row by row: every `PUBLISHES`, `WINDOWS_PUBLISHES` and `DISABLES_THE_HOOK` row returns the same invocation; the seven `KNOWN_FALSE_REFUSALS` return null and moved to `NOT_PUBLISHES`; mean cost 4.57 µs per call against 2.1 µs before (bound 25).
- **A fail-open the old table encoded as correct.** `node -e "/names commit or push \\(`git commit`\\)/"` sat in `NOT_PUBLISHES`. Run under bash and zsh with a stand-in git, both run `git commit`: a backtick inside double quotes is a command substitution. The walk refuses it; the row moved to `PUBLISHES`. The same class as §16's "one of this repository's own tests had encoded the fail-open".
- **A GREEN T2 mutant was a finding about the tests.** Dropping the heredoc-fed-to-a-shell path changed no verdict: the only heredoc row was `cat <<X | bash`, which reaches the shell through the upstream path. `bash <<'EOF' … EOF` and `bash <<<"…"` joined `PUBLISHES`.
- Isolation: the first harness run executed the REAL git under `zsh -c`, because zsh read a startup file that put it back on PATH. The probe row (`/usr/bin/env git --version` must reach the stand-in) caught it; the harness runs `zsh -f`.
- Measured 2026-09-27 for Decision 4: with an unclosed quote on the same line neither bash nor zsh runs anything; bash runs a completed earlier LINE, zsh does not.

**Dead code, removed (owner, 2026-09-27: "cleanup these").** A scan of top-level definitions found five instances that `scripts/orphan-sweep.mjs` had reported clean ("0 orphan(s) of 726" at 826ec94):
- `plugin/lib/record.py` `_BDD_NAME`: a retired regex kept only as a catalogue mutant's restore target; the mutant now inlines it.
- `plugin/scripts/lifecycle.mjs` `lastPythonVersion` / `probedPythonVersion()`: recorded "for whatever wants to RECORD which interpreter ran", and nothing did. Removed with its test asserts; §93's recording half stays open, now without a stand-in that only tests read.
- `SLOW_HOOK_NOTE`: a test oracle exported from production; it moved to `tests/hook-env.mjs`.
- `__pathMatchesDeclarationForTest` (an alias of an exported function) and `__declaredEnforcementForTest` (`declaredEnforcement` is exported itself now).
- A sixth, found by the widened sweep below: `READER_PATHS` in `plugin/scripts/reader-paths.mjs`, read only by `scripts/release-evidence.mjs`. The list stays shared (ADR-064); the `plugin/` prefix moved into release-evidence.

**Why the sweep saw none of them (§5, the class):** it counted `function` and `def` only, and its `SHIPPED` scope matched no `.py`, so `plugin/lib/` was never read. It now counts top-level `const`/`let`/`var`, Python classes and module-level names, and reads `.py`. At dcb7df4 and cb45a39^ it finds `DURATION_REQUIRED_FROM`, `VALIDATION_VERDICTS` and both `__…ForTest` aliases beside the functions it already found; the tests say so. At 826ec94 it finds all six. The test "the shipped tree defines nothing it does not reach" runs it at HEAD, so the selftest now fails on a dead binding as it did on a dead function. CLAUDE.md §13 step 1 names it as the pre-release dead-code scan.

**The gate found a fail-open in the lexer, and a name collision.** `((1 << 2))` then `git commit` on the next line: the lexer read the arithmetic shift as a heredoc and swallowed the commit into its body, so `publishCommandIn` returned null. `tests/lifecycle.test.mjs` "the publish warning reads commit or push through wrappers and quoting" caught it. An arithmetic command at command position is now skipped whole; the row is in the bash/zsh differential fixtures, and a catalogue mutant is RED. ADR-060's "the command classifiers are gone" flagged the lexer's inner `heredocBodies`, a retired symbol name; it is `readHeredocs`.

**Codex review of 341c49c (gpt-6-astra, xhigh): REQUEST CHANGES, seven findings, all confirmed and fixed before the tag.** Six were regressions toward fail-open: forms the deleted regex refused, now returned null by the walk, each executed by the reviewer under bash and zsh with a recording git.
- A `$(…)` inside `${…}`, `$((…))` or an arithmetic command `((…))`: the lexer skipped the whole expression. `substitutionsIn` now collects the substitutions an expression runs without reading its text as commands.
- A process substitution split the argv: `git push</dev/null 2> >( /bin/cat ) --no-verify` lost its `--no-verify`, and the armed grammar read it as plain. It is one dynamic, code-flagged word now, never plain.
- A continued heredoc delimiter (`<<\` then `EOF`) kept its backslash-newline, and the body swallowed a later push.
- Script text through `| cat |` into a shell; `printf '%s' …` and `echo -n …` piped into a shell (the last two pre-existing). `stdinScripts` follows `cat` and `tee` upstream, strips `echo`'s options, and reads `printf`'s arguments one by one.
- `bash --rcfile "-n" -c "git push"`: the rcfile name was read as `-n`. Options now consume their values before any `-n` check.
- `<$(git push)`: a command of redirections alone was dropped with its substitution.
- The seventh, a new false refusal: `echo "bash" "-c" "git push"` was read as a shell. `echo` and `printf` run none of their arguments.

Also fixed, pre-existing and named by the same review: `bash -cx "…"` (a `-c` inside a cluster) and ANSI-C spellings (`$'git' push`, `git $'\x70ush'`), now decoded. Two mutants of these fixes came back GREEN first, each a finding about the tests: a process substitution hiding `git config hook.… false` (the code flag's only protection) and an ANSI-C simple escape now have rows. Catalogue: 56 ADR-067 mutants, all RED.

**The campaign at 9b49efa failed on two GREENs, and they were mine: §18's "a refactor that moves an observable turns the tests on the old site vacuous".** T3 moved splitting to the lexer; ADR-066's round-2 and round-3 grammar mutants (the backslash-newline join feeding the text checks; a verb that mentions commit or push) stayed in the catalogue, and their only rows were forms the lexer now resolves before either mechanism is reached. I had run the ADR-067 mutants, not every mutant on the file I refactored. Each mechanism still guards a real form, now a `DISABLES_THE_HOOK` row: `cp x .g\`+newline+`it/config; git commit` (the `.git/` text check sees it only after the join) and `git rebase --exec git\ commit\ -n HEAD && git push` (an escaped-space command is plain text, not code). The first rebase row used `HEAD~1`, and the `~` alone made the grammar refuse it with the mutant applied too: a row that is refused for another reason kills nothing. Run over the families this batch touched (`ADR-066`, `publish armed`, `publish-hook`, `ADR-067`): all RED.

**ADR-068, Accepted by the owner 2026-09-27 and done:** git's hook judges a linked worktree whose repository holds the session's log (it passed every worktree commit: measured, main checkout exit 1, worktree exit 0); SessionStart after a compaction or resume says git's refusal takes effect from the next prompt while no hook run follows the offer. §304 items 3 and 4 are closed by it. It ships in 3.1.0 with ADR-067, since 3.1.0 was never tagged.

**Open:**
- ADR-067 T3.
- The catalogue's 27 walk mutants run once load allows (the armed tests misfire under contention); the 22 regex mutants they replace are gone.
- Leads from the 826ec94 outside run: the brief says "every job concluded success" when some jobs were skipped (a locked test's regex pins the wording); `corpus-probe --diff` prints slowdowns and never speedups.
- A run-level `skipped` workflow reads as an alarm (§304); ts-generator has 9 in its last 100 runs. The owner's decision.

## 307. 2026-09-27 — Two corpus-chaos outside runs of the 3.1.0 candidate 626934a: rule P, the constant check, the hook and four readers

**Runners.** A macOS session over a PHP/React corpus (Darwin 27.0.0, node 26.10.0, git 2.55.0; every row run under `bash -c` and `zsh -f -c` with a recording stand-in git) and a Windows 11 session over a TS generator monorepo (10.0.26200, node 24.20.0, git 2.49.0.windows.1, Git Bash, pwsh 7.6.6, PowerShell 5.1; a stand-in `git.cmd` and GIT_TRACE). Both probes were clean: couldNotRun 0, disagreements 0, only the readers hash moved. The Windows host could not run ADR-068's worktree hook (git 2.49, below 2.54). Every finding below was confirmed against source before it was fixed; the triage follows the skill's four classes.

**Rule P, fail-opens now refused.**
- `echo push | xargs git` and `xargs -I{} git {} <<< push` (macOS H6, H17): `xargs` builds git's argv from its stdin, and where that stdin is literal text the argv is known.
- `git submodule foreach 'git push'` (macOS R17), and by the same mechanism `git rebase -x/--exec <cmd>` and `git bisect run <cmd>`: git runs the command itself.
- `cmd //c call git push` and `cmd //c "g^it push"` (Windows): cmd's `call`, and its caret escape. Every caret in a cmd string is read as one, which can only reveal a publish that is spelled there.
- `pwsh -EncodedCommand <base64>` (Windows; also `-e`, `-ec` and the parameter's prefixes): the script is decoded from base64 UTF-16LE and read. A value that is not one decodes to text naming no publish.
- `powershell -c "iex 'git push'"` (Windows): `Invoke-Expression` runs its string, as `eval` does.
- `Start-Process git -ArgumentList push` (Windows), with `saps`, cmd's `start` and `-FilePath`: the launched command line is read. The unmeasured spellings are rows marked as such.
- Found while writing those rows, not by either runner: the verb scan read ANY option as taking the next word unless that word was the verb, so `git --no-pager submodule foreach 'git push'` was missed. It is the set git 2.55 answered to on 2026-09-27: `-C -c --git-dir --work-tree --namespace --config-env --attr-source` take a separate value, and `--exec-path --html-path --man-path --info-path --version -v --help -h` print and exit before any verb (the commit count did not move; GIT_TRACE showed `git version` or `git help`).

**Rule P, false refusals now allowed.** `git commit --dry-run`, `git push --dry-run`, `git push -n` (macOS R6); `commit -n` is `--no-verify` and stays a publish. And from the verb scan above: `git --no-pager stash push`, `git -P stash push`, `git --version push`, `git --exec-path push`.

**The advisory arm** reads a PowerShell backtick escape (`git comm`it`, Windows) and an encoded script. Both reached it as no mention at all, so they were wholly silent.

**The constant check, a fail-open (macOS, own perturbation).** `test 1`, `/usr/bin/true`, `echo ok`, `true || false` and `true # just check` each passed `qh-check` as a real check and were recorded, which unlocks a commit. It was a regex over the text; the list's exit status is now evaluated from the lexer's words, so `npm test || true` and `npm test; echo done` are constant and `npm test && true` is not.

**git's hook (macOS W10, W11).** `sessionOwnsRepository` took the PARENT of git's common directory as the repository. A worktree of a bare repository whose session had started in it passed unchecked (a fail-open), and a commit inside a submodule was judged on the superproject's session (a false refusal). It is the common directory itself.

**The hook's input (macOS F7, filed in §295 round 1 and still present).** `null` and a `cwd` of 42 crashed the hook with a stack trace at exit 0, and `[1,2]` said nothing. Valid JSON that is not an object with a string `cwd` is now named on stderr the way unparsable input is.

**Readers (Windows).**
- F-2 and F-3: adr-next stops a task it could not read (NUL bytes, empty, or listed by git and absent from the disk) with the reason. SessionStart read only `ready`, `blocked` and `done`, so a directory holding one read "fully evidenced", and one whose only task was unreadable was dropped without a word; work-next's `readinessUnproven` caught only the absent file, by a disk check of its own. adr-next marks the task `unreadable`, and SessionStart, work-next and the probe (`adrNext[].unreadable`) all read the mark. SessionStart also says a directory whose task is stopped by its own sign-off, where it said nothing.
- F-1 and F-2: a record whose status no reader could use (one fullwidth colon in `**Status:**`; a record saved as UTF-16) made `records` 0 with `look` ok, was never linted, and was omitted from adr-state's JSON while its text said could-not-look. adr-state's JSON names it (`unread`) and its text lists it as it lists such a record beside readable ones; the probe reports it (`undecided`) and lints it; adr-lint says a record holding NUL bytes is not UTF-8 before any section finding. `look` stays the corpus reader's, as work-next's does: a Proposed or `Implemented` record is named, not made PARTIAL.
- F-4: adr-next's human `acceptance:` line is quoted corpus text, as its goal line already was: a fence comment printed a `could-not-look:` line in the tool's voice.
- F-5a: the probe's adr-lint runs wrote `.git/qh-advice-survival.json` into the probed repository, against the probe's own "writes nothing". adr-lint honours `QUALITY_HARNESS_STATE_DIR` as the hooks do, and the probe points it at scratch. F-5b: the UNKNOWN line said "no git metadata directory here" over a note that was there and unparsable; it names which. F-5c: another version's note (`{"version": 99}`) was read as empty and REWRITTEN, its data lost and every count a first sighting; a key this version never writes makes it UNKNOWN, and the file is left as it is.

A fixture corpus carries F-1 and F-2: `tests/fixtures/corpora/undecided-records` (a fullwidth-colon record; an Accepted record whose task is UTF-16LE, marked `-text`), asserting `undecided`, `readinessUnproven`, `adrNext[].unreadable`, the lint FAIL's reason and the SessionStart UNPROVEN line. (fixture-waived: F-3's task git lists and the disk lacks needs an index entry `git add` cannot make, F-4 is adr-next's human text the probe does not read, and F-5 is adr-lint's own ledger; each has a test beside its fix, in tests/work-next-readiness.test.mjs, tests/adr-next.test.mjs, tests/gate-regressions.py and tests/corpus-probe.test.mjs)

**Also in this batch, mine.** CI's coverage job at 626934a failed on the cost-bound test ADR-067 T2 added: 57 µs per call under coverage instrumentation against 4.6 µs uninstrumented. The bound stays 25 µs uninstrumented and is 400 µs under `NODE_V8_COVERAGE`; the twenty-fold mutant lands above both. And ADR-067's two catalogue entries for the keyword skip and `cmd /c` went STALE when this batch changed those lines, which the family run said in those words; they name the new lines.

§306's Open list is superseded by this section for the two items it carried: ADR-067 T3 is done, and the walk mutants ran with every family this batch touched (ADR-066, ADR-067, ADR-068, publish, constant, 2.111.0-rc, survival, probe, readiness, ready line, adr-state, SessionStart): every mutant measured RED; the three that went STALE because this batch changed their lines (the keyword skip, `cmd /c`, adr-state's look) name the new lines and are RED.

**Codex review of this batch (gpt-6-astra, xhigh, before commit): REQUEST CHANGES, four findings, each executed by the reviewer under bash and `zsh -f` with a recording git, each confirmed and fixed.**
- A fail-open in my dry-run rule: `git commit -m --dry-run` commits with that message, and `git push -o --dry-run` pushes. `--dry-run` is a dry run only as a flag: not the value of an option that takes one (the set `git commit -h` and `git push -h` print on git 2.55.0), not after `--`, and not turned off again by `--no-dry-run`.
- False refusals in my constant check: `set -e; test -f F; echo done`, `set -o pipefail; test -f F | true`, `(exit 0); test -f F` and `true < F` each exit 0 or 1 with the tree and were read as constant. A constant refuses the declaration, so what the check does not model is not constant now: a builtin that changes how the list runs, a subshell, a redirection (the lexer counts them), and a shell string after any flag but a bare `-c`. The reviewer's residual, `test -f F || exit 0`, is constant and was missed; an `exit` that is the last command is the list's status now, and a command sent to the background is 0.
- xargs invented invocations: `-E push`, `-0` and a `printf ''` upstream launched no git. Only a here-string, a heredoc or an `echo` upstream, with `-I`, `-i`, `--replace`, `-r` and `-t`, is read; the rest is left to the advisory arm.
- The survival note's override was one file for every repository, so one repository's findings advanced another's counts and a clean run erased them. It is a root with one directory per repository, keyed as event-log.mjs keys its own.
Every finding has a row or a test and a catalogue mutant; all 47 of this batch's mutants and the 52 entries naming a changed line are RED, and every catalogue entry's `from` matches its file exactly once.

**By design, recorded.** A git reached through a variable or a command substitution (macOS H1, H8, H9; Windows `& ("g"+"it") push`) is a mention at most, as §269 pinned: git's hook is the refusal there. `cmd /c git …` from Git Bash (msys rewrites `/c` to `C:/`) and a backslash-path `git.exe` under bash run nothing and are refused: the conservative direction. macOS W6 (a main checkout moved without `worktree repair`) is git's own breakage, not the hook's.

**Named, not fixed.**
- A PowerShell dialect in the precise arm: backtick escapes and script blocks (`1 | % { git push }`). A backtick pre-pass turns `Write-Host "a`"; git push; `""`, one string, into a refusal. The advisory arm warns on the backtick; git's hook refuses where it can arm.
- cmd's `if <condition> <command>`, beyond what the POSIX reading catches. Unmeasured; for the next Windows round.
- A pipeline check (`npm test | tee log`) is not read as constant: its status is `tee`'s only without `pipefail`.
- A record with no readable `**Status:**`, or an empty one (macOS C4), lints PASS with the advice "no **Status:** line".
- adr-lint prints a task file name holding a newline across two lines (macOS A6); `prove it:` and adr-verify print native backslashes that Git Bash eats when pasted, and adr-lint's human header prints the absolute plugin path (Windows). Wording, next batch.
- Session logs appeared under `.git/worktrees/<wt>/` and `.git/modules/<sub>/` in the macOS run, where no SessionStart ran. Which write made them is not established; a lead for the next batch.

**The re-runs at 9cc9a35 (both reported from outside runs, 2026-09-27).** The macOS session re-ran every row above under bash and `zsh -f` and the hook cases W10/W11 and F7: each fix held (twelve rule-P rows, no mismatch; W10 refused, W11 passed, its superproject twin refused; the three payload shapes named). Its one lead, `true < x` and `: < x` passing once `x` exists, is by design: their status depends on the tree, the same class as `test -f x`, and refusing them was the false refusal the Codex round fixed. The Windows session re-ran under Git Bash, pwsh 7.6.6, PowerShell 5.1 and cmd with a stand-in `git.cmd` and GIT_TRACE: every earlier miss and every new row is read as the shell runs it, and F-2b, F-3, F-4 and F-5a to F-5c are fixed as described; its probe attests the same readers hash.
- **A fail-open it measured, fixed before the tag: `cmd /c if 1==1 git push`** pushed under cmd, pwsh and PowerShell 5.1 (and `cmd //c` under Git Bash) and was read as no publish. cmd's `if [/i] [not] <condition> <command>` now reaches the command for each condition shape (`errorlevel N`, `exist P`, `defined V`, `cmdextversion N`, `a==b`, `a <op> b`); a POSIX `if` is followed by a command, which matches none of them, and reads as before. The first row is measured, the other shapes are rows beside it, and a catalogue mutant is RED. The readers changed with it, so the attestations at 9cc9a35 do not cover the tag; another outside run is asked for.
- Leads for the next batch, each under-block or wording: adr-lint PASSes a record whose status it cannot read (F-1, named above); SessionStart counts the task directory under such a record "fully evidenced" without naming the record, and work-next's `tasksUnderAnUndecidedRecord` is empty there; adr-state gives "[no **Status:** line]" for a UTF-16 record where adr-lint knows it holds NUL bytes, and adr-next reads the tasks under that record without saying the record was unreadable; the absent-task reason could add "or a name this filesystem cannot hold" (`T3-a:b.md` on NTFS). An observation for the record: `start` launches the publish in a detached console, so its exit and output never reach the session; the text refusal is the only one that sees it.
- CI's windows job failed at 9cc9a35 on a test of mine: the new adr-state test compared `unread` paths written with `/`, and adr-state prints native separators in every path field (the probe normalises them, §279 item 5). The test normalises too; §7's rule, broken by its own author.

## 308. CLOSED 2026-09-27 — git's hook wrote its "ran" event into a linked worktree's own git dir

Archived: [backlog-archive/BACKLOG-301-400.md](backlog-archive/BACKLOG-301-400.md)

## 309. PARTLY FIXED 2026-09-27 — Three Windows corpus-chaos runs of 916b515: a crash past rule P, a silent record budget, git in another case

**How it was found.** Two desktop sessions on Windows 11 (Node 24.20.0, Python 3.14.7, Git for Windows 2.49.0) ran `/quality-harness:corpus-chaos` at 916b515: one over a JS SPA with no corpus (seed 1790532118, the drawn codes plus 8.3 short names, abominations V and X2), one over a TypeScript generator monorepo (seed 1790532165, the drawn codes plus NTFS case folding, abominations Y1 and Z4). Both attestations are filed through `scripts/attest-import.mjs` (ADR-070), its first use on a real message. Both probes are clean over their own corpora. Neither host could run focus 1 as asked: git 2.49 has no config-based hooks, and the only newer git was 2.53 under WSL.

**Focus 1, through the hook by hand, confirms §308 from outside.** Fed `publish-hook.mjs prepare-commit-msg` in a linked worktree, and through a real `git commit` with a classic hooksPath: at 916b515 the event went to the main checkout's log and nothing appeared under `.git/worktrees`; the control at v3.1.0 created `.git/worktrees/wt-linked/quality-harness/sessions/probe-sess.jsonl`.

**Fixed in this batch (fail-open).**
- **F7: a 10 MB command crashed the hook before rule P was read.** `mentionsCommitOrPush`'s base64 scan, `[...command.matchAll(/[A-Za-z0-9+/]{8,}={0,2}/g)]`, overflowed V8's regex stack on one word past about 5.6 MB (`RangeError: Maximum call stack size exceeded`). The hook exited 1, and a PreToolUse exit 1 does not block, so the `git push` at the end went unrefused. Reproduced here on macOS (node 26.10.0). It splits on what a base64 word cannot hold now: the same runs, 29 ms on the 10 MB input. The regression drives the hook with that payload and asserts the refusal; its mutant (the old match) is RED.
- **C-1: the corpus readers stopped at 200 records and said `look ok`.** `recordFilesFromListing` ended its loop on `RECORD_BUDGET` with a bare `break`: with 1,100 records adr-state said read 200, look ok, and with 10,000 the probe linted 200 and said nothing else. The first file past the budget is on `unreadable` now, with the reason `record budget: 200 records were read; this file and every later one in the listing were not examined`, and the look is PARTIAL. So adr-state's `unread`, work-next's `partialBecause` and the probe's `undecided` all name it. Tested through adr-state at 201 records, with a clean twin at exactly 200; both mutants are RED. (fixture-waived: a 201-record fixture corpus would carry 201 files for one field; tests/record-budget.test.mjs builds it at run time instead)
- **git in another case, or through a `.cmd` shim.** `GIT push`, `Git commit -m x`, `Git.Exe push` and `git.cmd push` published under the stand-in and were read as no publish, while `git.EXE push` was caught (`programName` strips `.exe` case-insensitively and then compared `=== 'git'`). Measured here as well: `GIT --version` and Python's `subprocess.run(['GIT', '--version'])` both run git 2.55.0 on macOS. On macOS git's own hook arms and refuses; on Windows with git 2.49 there is no such hook, and rule P was the only refusal. `isGit` now matches git in any case and a `.cmd` shim, only for git, because a builtin (`exit`, `eval`, `set`) is looked up case-sensitively. On a case-sensitive host these names run nothing and are refused, the conservative direction. Both call sites have a RED mutant, and ADR-067's subprocess entry names the rewritten line (`--repoint` refused it, correctly: it is a rewrite).

**Dead code the scan did not see.** While in `lifecycle.mjs`: an unreachable second `return` in `handleHook` and a doubled `/**`, both removed. `scripts/dead-code-scan.sh` runs orphan-sweep, vulture and knip; none of them reports an unreachable statement in JS. ESLint's `no-unreachable` does. That is a lead for the scan, not yet a step in it.

**By design, recorded.**
- Rule P's misses for a git reached through a variable, a substitution, a function, `source <(…)`, `trap`, `find -exec`, `xargs` fed by `printf`, perl `exec` or `eval` of a built string (tender-reef's 23 bash rows), and PowerShell's script blocks (`Invoke-Command`, `. { }`, `ForEach-Object`, `$b = {…}; & $b`, `try {}`: 9 rows in scalable-badger's run, 11 in tender-reef's). These are mentions, as §269 and §307 pinned. ⚠ On a host whose git is below 2.54 no hook arms, so there these are warned about and not refused. Whether that is acceptable is an owner question, not a fix.
- `echo git push ^& git commit -m x` is refused though cmd.exe runs no publish for it: the hook reads what the Bash or PowerShell tool runs, and bash backgrounds at `&` and then commits.
- The hostile goal (abomination V) is quoted into SessionStart inside «…» and attributed to the task file. ESC and BEL are stripped. The line tells the reader to read the fence before `adr-verify` runs it, and git's hook is the refusal for a fence that pushes.

**Leads for the next batch, unconfirmed here.**
- `python -c "import os; os.system('git push')"` published and is not read. `SUBPROCESS_STRING` names `subprocess.*` and `exec*`, not `os.system`.
- Duplicate record ids: two ADR-002 files in one root (tender-reef C1), and ADR-001 under three roots (scalable-badger C6). No duplicate line, contested 0, and adr-lint judged one record against the other's tasks.
- Windows 8.3 short names: `adr-next docs/adr/ADR-00~1.MD` sequenced another record's tasks. adr-lint accepts any record with any tasks dir and never checks the prefix.
- A done claim that nothing checks:
  - README `pending` beside a task file saying `done` with no log: adr-lint PASS.
  - `**Status:**` followed by U+2003, an em space, then `done`: not read as done, and `unbacked` goes empty.
- A tracked task NTFS folds onto another (`T1-CLASSIFY-A-QUOTE.md` beside `T1-classify-a-quote.md`) is lost silently, and two readers count 2 and 1 without saying they disagree.
- An NBSP after `##` in `## Acceptance`: adr-lint says no fence, adr-next says the fence changed, and SessionStart says run `adr-verify`, which answers "no ## Acceptance section".
- A locked or vanishing task file:
  - adrLint's verdict is `exit 1` with an empty or null reason.
  - `unbacked` lists a task nobody could read.
  - adr-state states "governing nothing" over unread Affected Files.
  - adr-next's Permission-denied line prints the absolute path, username included (§6's class, on a peer's disk).
- G2:
  - `adr-next <non-record> --json` prints prose.
  - `corpusReport.totals.unreadable` is 0 while adrNext names the binary task.
  - SessionStart says a task directory is UNPROVEN, and then says T1 there is ready.
- Record ids under three digits are records only by content (`ADR_FILE` wants `\d{3,4}`), while adr-lint reads `\d{1,4}`. A short-id file without `## Context` or `## Decision` is named nowhere.


**A third Windows run, over this repository's own corpus** (lexical-mango, seed 1790532186, main at 8902ada in a scratch clone): 64 records, 145 tasks, all 64 lints PASS, nothing unproven, and no path leaked. The attestation is filed. It ran focus 1 by hand and saw the same as above: both `publish.hook-ran` events were in the main log and nothing was under `.git/worktrees/wt/`. Its rule P rows add `g^it pu^sh` under cmd (neither arm sees it), cmd's `for %i in (push) do git %i` and `set G=git& call %G% push`, and pwsh's `iex ('git ' + 'push')`: mentions or less, the §307 class. Leads for the next batch:
- **Two task files declaring one id: one is dropped from every bucket.** `T9-a.md` and `T9-b.md` both `# Task ADR-040-T9`: adr-next lists only T9-b, and adr-lint names neither as a duplicate.
- **`--attest` over a could-not-look report prints zero counts with no look field.** An NTFS junction loop made `work-next --json` answer `look: UNPROVEN, records: 0`, and the attestation read `corpus: 0/0/0, couldNotRun 0` with nothing saying the look failed. ⚠ An attestation of a probe that could not look reads as a clean run to `release-evidence`. That is the attestation's own fail-open, and it touches ADR-070's import: a candidate for this batch.
- **A status nobody lists governs as Accepted.** `Accepted (partially)`, `accepted` and `ACCEPTED` are governing, with no remark; `Implemented` is undecided and says so.
- Wording:
  - U+200B passes into adr-next's and SessionStart's quoted titles, while U+202E, U+202C and U+200F are stripped.
  - A BOM and the heading's `# ` sit inside adr-next's «…» title.
  - `(advisory until 2026-09-13)` is keyed on the ROW's date, so it is right, but it reads as a grace period that ended a fortnight ago. `(advisory: recorded before 2026-09-13)` says what it means.

**Fixed in a second pass the same day** (the owner: "proceed addressing the gaps"). Each has a test through the reader's CLI and catalogue mutants; all 14 entries naming a line changed since 916b515 are RED.
- **`os.system` and `os.popen`** now count as a subprocess call that hands its string to a shell. Measured here first: both ran git 2.55.0 from `python3 -c`.
- **A done claim nothing checked.**
  - adr-lint reads the task file's own `**Status:** done` as a claim, from the header above the first `## ` only, and asks it for the same evidence as a README claim. The finding names the file the claim is in.
  - work-next reads any horizontal space after `**Status:**`.
  - The class, enumerated with `git grep -nF '[ \t]' -- plugin/ | grep -iE 'status|state'`, has nine status parses. Seven capture `(.+)` and then strip, which is Unicode-aware in both languages; one reaches `\S` only by backtracking over a `*`. Only work-next's done-claim line missed.
  - ⚠ Siblings left: `check_test_lock` and the other `done_task_ids` loops in adr-lint still read only the README's claim.
- **Two task files declaring one id.** adr-next stops the id as UNPROVEN and names both files, rather than letting the second overwrite the first. Sibling left: adr-lint still names neither as a duplicate.
- **An attestation over a probe that could not look.** `at` is null, with `atReason` "the probe could not look at the corpus (look UNPROVEN)", when the probe's or work-next's look is UNPROVEN. So `attest-import` refuses it (refusal 4), and `release-evidence` counts it for nothing. There is no schema change, and PARTIAL still attests.
- The 2.111.0-rc CF1 entry named the rewritten work-next line. `--repoint` refused it, correctly: the mutant rewrites the class. It now names the new line and is RED.
- ⚠ **A hazard in how this session writes, not in any tool here.** A backslash-u escape with four hex digits, typed into a command, reached the shell already decoded, even inside a quoted heredoc: `od -c` showed the U+2003 bytes. So two tests and this section briefly held invisible characters where an escape was meant. Brace escapes and "U+2003" are used instead. It was first blamed on `mrw` and filed to that project's inbox; that drawer is retracted, because mrw wrote exactly the bytes it was given.

Still leads: duplicate record ids, 8.3 names, NTFS case folding, the NBSP heading, a locked task file, G2, short record ids, statuses nobody lists, and the wording items.

**A fourth run, macOS, over the same TypeScript monorepo** (ts-generator-87, seed 1790535531, git 2.55.0, node 26.10.0, load 22–37 throughout). The probe was clean, and its attestation is filed under the shape label `macos-ts-generator-monorepo` (it was sent under the corpus's own name). Focus 1 held for plain, bare and nested worktrees. Two fail-closed-everywhere and fail-open findings, fixed with real-git tests and RED mutants:
- **The hook command outlived its node.** The exports bake `process.execPath`, which Homebrew makes a versioned Cellar path. Once it was removed, git refused every commit and push in every repository the shell touched, because git refuses when a hook command cannot start. That happens before `publish-hook.mjs`'s own promise to exit 0 when it cannot look. The command now falls back to the `node` on PATH, so a moved node still refuses what it should. A missing script says on stderr that nothing was judged and refuses nothing. The `exec` stays last, because git appends its own arguments to the command. The existing single-quoting mutant now names the script in the `exec` clause.
- **A torn log tail swallowed the next event.** `publish.hook-ran` was appended onto a torn last line, so no reader could see that git's hook ran (ADR-068). An append now starts on a fresh line when the tail has no newline. The torn line is still reported as torn, and the existing append mutant names the rewritten line.

Leads, unconfirmed here:
- `work-next` (human) prints a spec path raw, and `adr-state` a record title raw: an OSC title sequence, SGR colours, a bidi override and an unquoted `</system-reminder>`. adr-next and SessionStart quote and strip the same text.
- A FIFO `.md` under `docs/specs` is counted nowhere and named nowhere.
- A spec 40 directories deep is counted nowhere. It may be one level by design, but nothing says so.
- A task reached through a self-symlink (`tasks/tasks -> ../tasks`) is named by that path in SessionStart and adr-next. The probe reports it as a disagreement.
- Rule P misses a static argv in `node -e "…spawnSync('git',['push'])"` and `perl -e 'system("git","push")'`, while Python's list form is read. It also misses `git -c alias.p=push p` and `make -f /dev/stdin`. The rest of its 13 rows are the dynamic §307 class.
- A sparse checkout makes the probe spawn adr-lint once per path git lists and the disk lacks: 164 of them, 48 s against 4 s.

**A third pass on the leads** (the owner: "proceed with the §309 leads"). Committed in def97b9 and the commit after it. Each lead was confirmed against source and reproduced (on macOS, or through a portable stand-in: a directory named like a task file is unreadable on every platform). Each has a test through the reader's CLI that failed first, and catalogue mutants that are RED.
- **Raw escapes.** work-next and adr-state print their human lines through `terminalText`, and adr-state quotes a record title. Both quoters drop zero-width characters and a BOM; adr-next's title drops a BOM-held `# `.
- **G2.**
  - No task is offered as ready beside one nobody could read.
  - `adr-next --json` answers JSON for a path with no tasks directory.
  - corpus-report counts a NUL-byte or empty task as unreadable. The matrix asserts it: `corpusReportUnreadable` on the undecided-records fixture.
- **C-5.**
  - adr-lint crashed with a traceback on any unreadable task file anywhere in the corpus; it is could-not-run, exit 2, naming the file.
  - An exit-code verdict in the probe carries the gate's reason.
  - The corpus reader no longer drops an unreadable task file: its directory is asked about (work-next: UNPROVEN), and adr-state reports that record's scope as `governsUnproven` rather than governing nothing.
- **C-4.** A task whose Acceptance fence could not be read no longer says its fence "changed", and SessionStart no longer sends it to `adr-verify`, which would refuse it.
- **C1 and C6.** A folder named exactly for another record is that record's, so a second ADR-002 no longer takes the first's tasks: in the corpus reader, and in adr-next's `resolve_tasks_dir`. adr-state names every id carried by more than one record (`duplicateIds`).
- **Rule P.** Now read: node's `child_process` argv lists and perl's `system`/`exec` lists (`perl` is an interpreter now), and an alias set with `git -c alias.<name>=<value>`, including `!` aliases. git's own `commit` and `push` run over an alias of the same name (measured: `git -c alias.version=status version` printed the version), so those stay publishes.
- **C-2.** A record named with the ADR prefix is found at any width (`ADR-7-x.md`), as record.py reads it; a bare number still needs three or four digits. work-next's own text named `ADR-12-thing.md` as findable by filename, which the regex made false until now.
- **Sparse checkout.** A record the corpus reader never opened is `unread` in the probe, with its reason, and adr-lint is not spawned for it.
- **Wording.** The pre-cutover lock advice says "(advisory: an entry recorded before 2026-09-13)".
- Catalogue entries that named rewritten lines were re-pointed by hand after `--repoint` refused them, correctly, as rewrites: CF1, L7, the §288 PARTIAL line, the router line, the ISO-date guard, the dry-run guard, the orphans line, the single-quoting and append lines.

**By design, recorded.**
- `accepted` and `ACCEPTED` govern, because a status is read case-insensitively. `Accepted (partially)` governs too, because its first word is read, as `Superseded by …` is.
- A FIFO is never listed by git, so a reader that must not depend on the disk (§8) cannot count it.
- Specs are read one level under `docs/specs/`, the location the spec-write stage writes to. A project that nests them gets no count, and nothing says why: a wording lead.

**Still leads.**
- NTFS case folding (C-3) and Windows 8.3 short names: Windows-only, needing a Windows run to confirm a fix.
- A task named through a self-symlink: the probe already reports it as a disagreement.
- adr-lint's `check_test_lock` and its other README-only loops still read only the README's done claim.
- adr-next's Permission-denied line prints the path as it was given, absolute when the caller passed one.

**CI at 8badec4 (run 36349664889) went red, on five jobs, all of them this batch's own doing.**
- **windows:** the hostile-spec-path fixture wrote a name holding ESC and BEL, which Windows refuses (ENOENT). The platform is a parameter now: on Windows the name carries a bidi override and a zero-width space, which NTFS allows, and the same assertion runs.
- **Four GREEN mutants in four shards,** each an old guard this batch made unobservable (§18's hazard, met here):
  - The two adr-lint entries for `read_named` ("named path plus strictFrom reads through read_named", "named-path OSError is could-not-run at check_adr") are equivalent mutants now. The top-level OSError handler (C-5) answers a second open exactly as `read_named` does: exit 2, could-not-run, the path named. The property they protected holds structurally and is still asserted, so both entries are deleted.
  - "SessionStart does not count an unreadable task's directory as evidenced" mutated a guard G2's `continue` made unreachable. The guard and its `unreadTasks.length` arithmetic are removed as dead code, and so is the entry. The G2 mutant protects the behaviour, and the "stopped task" entry names the simplified line and is RED.
  - "the year of an ISO date is not a record number" went GREEN because C1's rule, a folder named for another record, now also keeps a dated record from borrowing a record's folder. A new test uses a dated folder that no record names, where only the ISO guard decides, and the entry runs only that test. RED.

**CI at 3cb9493 (run 36352514113): windows only, two tests.**
- The same terminal-output test matched `docs/specs/a` with a `/`; work-next prints native separators, and its output was right, escapes included (`docs\specs\a\u{202e}b\u{200b}dm.md`). The match takes either separator now (§7, broken again by its author).
- `timeout-tree.test.mjs::adr-verify: run_bounded kills the tree on timeout` failed with "the grandchild never wrote a beat". It passed on this job at 77cdded and at 8badec4, and nothing in this batch touches `run_bounded`. §121 closed that message's truncation cause. What remains looks like a slow Windows runner where the bound fires before the grandchild's first beat, which the fixture cannot tell from a grandchild that never started. It cannot be reproduced here, so it is a lead for the next Windows run, not a fix.
The readers changed with this batch (lifecycle.mjs, corpus-probe.mjs, work-next.mjs, adr-next, adr-lint), so the four attestations at 916b515 do not cover a tag cut after it; another outside run is needed at the final sha (§18).

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

## 319. PARTLY FIXED 2026-09-29 — The corpus-chaos round of e016066 (plugin/ = v3.1.3): four fail-opens, a forged line, and two repository leads

**Asked of ten sessions** (owner, 2026-09-28): eight local and two over Remote Control, with the corpus-chaos Asker text at e016066, whose plugin/ is byte-identical to v3.1.3 (ae06e14).
- **Ran:** ts-generator (TS generator, a spec-only corpus, seed 1790626717) and vitest-spa-v2 (JS SPA, 2 records and 9 tasks, seed 1790626777). Both on macOS 27.0 and Python 3.14.7; Node 24.11.1 and Node 26.10.0 respectively. Their attestations are filed: `docs/corpus-reports/2026-09-28-{static-generator-ts,js-spa-two-adr}-3.1.3-e016066.json`.
- **Could not run:** rust-records-corpus and infrastructure, whose classifiers refused the foreign code as "Code from External". Each surfaced it to its user and did not work around it.
- **Deferred:** go-recall-service, for its own owner-set goal.
- **Pending when this was written:** go-cli-adr-corpus, and the two Remote Control sessions.

**Fail-open. To be fixed before the next plugin release.**
1. **A spec one directory below `docs/specs/` is counted nowhere, named nowhere, and with only such specs work-next says "No QH corpus is in use"** (ts-generator C5). Reproduced here: `docs/specs/billing/refunds.md` with `Ready-for-ADR` gives `0 spec(s)` and that sentence.
2. **A record whose Status line holds a NUL byte is counted "undecided" with `look: ok`**, byte-identical to an honest `Proposed` (js-spa-client B5). It also hides a binary task under it: `readinessUnproven` stays empty, and only SessionStart's adr-next line names the task. adr-lint, handed the same file, says it cannot read it. Reproduced here: `look ok`, `undecidedRecords 1`, `partialBecause []`.
3. **corpus-report counts a dangling task symlink nowhere and names it nowhere**, while adr-lint, adr-next and work-next each say they could not read it, and the probe reports no disagreement (js-spa-client). A tasks directory that is a symlink to a sibling's counts one directory's tasks. Partly reproduced here: `unreadableDirs []`.
4. **The checks.jsonl import grades malformed rows:** a row with a numeric `at` and odd types becomes `check.passed`, and a row missing its fields becomes `check.failed` (js-spa-client D5). The runner could show no downstream wrong answer, because the tree had changed. Not reproduced here.

**Output that forges the tool. Next batch, security-flavoured.**
5. **work-next's human output prints a newline in a spec's file name raw**, so a name can forge a line such as `[quality-harness] Nothing in the QH corpus is waiting.` (ts-generator V). ESC and BEL are already escaped, and `--json` escapes newlines. Reproduced here.
6. **SessionStart passes adr-next's stderr through unredacted**, so an absolute scratch path reaches the model (js-spa-client, a symlink loop). The probe's own copy of those lines is redacted. Not reproduced here.

**Wording. Next batch.**
7. adr-next guesses "a sparse or partial checkout?" for a task file whose name gained a trailing space (js-spa-client A1). The verdict, UNPROVEN, is right; the guessed cause is not.
8. The corpus-chaos skill offers `perl -e 'alarm shift; exec @ARGV' 120 <cmd>` as a macOS timeout. It does not bound a Go binary, whose runtime ignores SIGALRM: measured on mrw v1.30.0 and a dev build, an alarm of 3 ran 30 s (infrastructure). `gtimeout -s KILL` bounds it.

**By design, recorded with the reason.**
9. Vendored fixture trees under any `docs/specs/` are counted as the repository's specs: 77 golden renders in ts-generator give a standing "77 UNPROVEN" warning. This is §291's class (open): what counts as the project's own corpus.
10. ADR-072's literal reader counts any quoted literal as a definition: an array element, a `console.warn` argument, an object key, a `describe` name, `test.skip`, `test.todo`, a test in dead code. It refuses a name built by concatenation (js-spa-client, 9 of 14 fooled). That is Decision 2's rule as written. ADR-073 (Proposed) is the check that does not depend on it: a narrowed baseline that runs fewer tests than it names.
11. No reader flags a supersession cycle or a record that supersedes itself: everything reads as superseded, and nothing governs (js-spa-client Z3). Not reproduced here. Whether this is by design is open.

**Repository tooling.**
12. **mutate.mjs crashes with a TypeError on a catalogue that is not `{ mutations: [...] }`**, and exits 1, the same status as a stale finding, so a consumer cannot tell the two apart. Also, `--stale`'s gone-killer line leads with the word `undefined`, which reads as a JavaScript `undefined` (js-spa-client).
13. **bash 3.2 aborts on an empty array's `"${a[@]}"` under `set -u`** (go-recall-service's lead from its own analyze.sh). Audited here over every `set -u` script: `plugin/scripts/facts-gate-dispatch.sh` is safe, because `candidates` starts non-empty and `matches` is expanded only after its count check. `scripts/coverage.sh` already uses `${a[@]+"${a[@]}"}`, with a comment on why. `scripts/dead-code-scan.sh:46` is a member: an empty `files` would abort, although this repository always has Python gates. Confirmed on /bin/bash 3.2.57: `"${a[@]}"` on an empty array aborts with "unbound variable", while `${#a[@]}` and the guarded form do not.

**Addendum, 2026-09-29: the reports that arrived after this entry was written, and the 3.1.4 batch.**
- **Ran, and attested:**
  - php-react-app: a Laravel + React monorepo with 93 records and 278 tasks, seed 1790626837, Node 24.11.1.
  - go-cli-adr-corpus: a Go corpus with 92 records and 232 tasks, seed 1790626901, Node 26.10.0.
  - Both ran at e016066 on macOS 27.0 and Python 3.14.7. Filed: `docs/corpus-reports/2026-09-28-{laravel-react-monorepo-contract-first,go-cli-adr-corpus}-3.1.3-e016066.json`.
  - go-cli-adr-corpus had also run at cd7e6ab (seed 1790620491, its inbox drawer 4f199b24), and six of its eight findings there reproduced at e016066.
  - go-recall-service filed one lead to the inbox. The two Remote Control sessions stayed offline.

**Fixed in 3.1.4.** Each has a regression in `tests/chaos-e016066.test.mjs` and catalogue mutants, and every mutant is RED.
- **Items 1 to 5 above:**
  - Item 1: `work-next` names nested specs (`nestedSpecs`) and routes to neither core nor an all-clear while they exist.
  - Item 2: a NUL byte makes a record unreadable, with a reason, so the look is PARTIAL. The binary task under it is covered by that PARTIAL rather than named on its own, because the owner of a task under an unreadable record is unknown.
  - Item 3: `taskFiles` reads a linked task file through the link, so a dangling one is counted unreadable. It names a linked directory without following it, and corpus-report's line now says "or are links this reader does not follow".
  - Item 4: `checkEventName` grades only a numeric `exit` and a boolean `git`.
  - Item 5: every path in `work-next`'s text goes through `visiblePath`.
- **A false refusal (go-cli-adr-corpus D5, at both commits).** A `session.started` whose observation failed was read as the baseline. A Stop over a pristine tree then said "work no `qh-check` has passed on", and PreToolUse denied `git push`. Reproduced here through the hook.
  - It is the late-baseline class (`tests/late-baseline.test.mjs`), and this member was missed. `sessionBaseline(log)` now takes the first start that looked, and every reader uses it.
  - Enumerated with `mrw read --grep "=== 'session.started'" plugin/`: 7 sites in lifecycle.mjs and 1 in statusline.mjs.
  - The twins still refuse: a dirty tree, and a write on record. A torn log still gets no baseline.
  - The session note's reader stayed GREEN under its mutant until a test was added for it.
- **A fail-open in JSON (go-cli-adr-corpus item 1, at both commits).** adr-state's text listed "Declared but matching nothing git tracks … `--json for all`", while the JSON had no such field. It now has `governsUnmatched`. The class is every `--json for all` pointer in plugin/, enumerated with `mrw read --grep 'json for' plugin/`: 8 pointers, and this was the only one without a field.
- **php-react-app E5.** adr-lint waited forever on a FIFO named as a record or as a task. It now refuses a named non-regular file as could-not-run, with exit 2. So does a FIFO among another record's tasks, which the cross-record cycle check reads: the same could-not-run a directory named like a task already got (`tests/gates.test.mjs`).
  - Members left, as a class: adr-lint's other reads of corpus paths, such as a spec, a test file, a README or the config. `mrw read --grep 'read_text\(' plugin/bin/adr-lint` lists 29 lines.
  - Git lists no FIFO, so the git-listed reads never meet one. The glob-listed and header-named reads can.
  - adr-next and the other Python readers are not audited.
- **php-react-app, the real corpus: a false refusal.** A Tests row naming an npm script (`test:visual` in `package.json`) was refused as "no executable definition". A top-level `scripts` key now counts as a definition. A dependency key, a nested key and a value are still refused.
- **The corpus-chaos skill (go-cli-adr-corpus).** Step 4's hook example set `cwd` to the probed repository, and the hook appends a session log there (218 rows), which step 6 forbids. The example now names a scratch clone and says that the hook writes.

**Next batch: output that forges the tool, the same class as item 5.**
- A `.quality-harness.json` `check` value holding newlines, a closing tag, ESC and a fake SYSTEM line reaches SessionStart's Verification line verbatim (go-cli-adr-corpus H1).
- A task file name holding a newline splits adr-lint's advice (A6).
- Item 6 above.
- `work-next`'s relock remedy prints a task path raw inside a command, under `commandInCode`'s keep-the-bytes rule.

**Next batch: wording, and readers that disagree.**
- **§307 F-1 gains members.** Each of these still lints PASS:
  - `**Status:** Acc\xc3\x28epted`, invalid UTF-8 (B3).
  - An empty `**Status:**` (C4). Its regex, `^\*\*Status:\*\*\s*(.+?)\s*$` under `re.M`, crosses the newline and reads the next line. That regex is at two sites, adr-lint:2681 and :6130, found with `mrw read --grep 'Status:.{1,8}s\*' plugin/bin/ plugin/lib/ plugin/scripts/`.
  - `**Statusas:**` (php-react-app, Lithuanian headers), which is read as a `**Status` prefix and quoted by adr-next as `**as:** …**`.
- **A torn `checks.jsonl`** is reported as "this session's event log could not be read whole" (D4, at both commits). The verdict, unknown, is right; it names the wrong file.
- **corpusReport's `showsFailing`** counts every red-first row, so it reads as 232 of 232 failing.
- **The probe** keeps adr-lint's verdict and drops its advice.
- **The orphaned tasks of a removed record** are counted three ways: 232 tasks, 90 directories and 89 adr-next entries (C2).
- **adr-state's `unread`** gives `reason: null` for an unrecognised status (X1, §293).
- **A trailing-space task file** is invisible to readiness (php-react-app A1), a sibling of item 7.
- **A README Execution Order row** with its Depends-on column dropped passes (B9).
- **adr-lint's Invalidates check** does not look in a sibling archive.
- **Stripped ESC** leaves `[31m` residue inside «…».

**By design, with the reason.**
- **A FIFO record is invisible to work-next, adr-state and the probe.** Git lists no FIFO, and every corpus reader reads git's listing (§8).
- **adr-lint's version line names the plugin root that answered.** That line is the evidence of which copy ran, and the probe redacts it.
- **go-recall-service's lead (inbox drawer 8ce8d68): adr-next calls a task done while a `[proof: human: …]` step has no human-observed row.**
  - This matches the done rule as written: the proof map maps steps to proof forms, and done needs an exit-0 entry plus a killed mutant.
  - Whether a step-level human proof should gate done is a question for the owner, and needs a record.

**Repository tooling.** At e016066, go-cli-adr-corpus measured `mutate --stale` against `node --test --test-name-pattern`. Twelve more shapes pass it, although no test runs:
- a hashbang holding the name;
- a regex literal after `export default` or a spread;
- the raw text compared, not the literal's value;
- `test.skip`, `test.todo` and `describe.skip`;
- a test under `if (false)`;
- a test in a function never called;
- a name passed through `.toUpperCase()`;
- the name as an `assert.ok` message.

Two false refusals: `//` followed by U+2028, and the raw-versus-value case in the other direction. All are ADR-072 Decision 2's literal reader (§318), which ADR-073 (Proposed) would not depend on.

**The Codex round and the CI run of fe918bb (2026-09-29).** gpt-6-astra, xhigh: REQUEST CHANGES, with six findings. Each was confirmed against the source and fixed in the same batch, with a regression test and a RED mutant.
- **P1, a fail-open.** The late baseline counted only `file.written` as prior work. A shell edit writes none, so a sequence of failed start, a Stop that saw the edit, a commit, and a clean publish look adopted the committed tree and forgave it. The fix: a late baseline is taken only from the FIRST look that succeeded (`lateBaselineAllowed`). The same holds for a session with no `session.started` at all, whose first look saw a dirty tree.
- **P2, a false refusal left behind.** git's own hook prepares no late baseline, so a push launched from a script was still refused over a pristine tree. `publishVerdict` now applies the same rule without writing, and only to a log that holds the failed start. A linked worktree's empty log is still judged unchecked (ADR-068), and a test holds that.
- **npm scripts.** A script whose value is not a string (`null`, a number) counted as a definition, and npm drops it. A manifest behind a BOM lost every script.
- **A line break in a nested spec's name** hid the spec again: `.+` does not cross it.
- **A task-shaped FIFO, directly or through a link,** reached a blocking read in corpus-report. The default reader now refuses anything but a regular file without opening it, including in `run()`, whose own `readFileSync` default had bypassed it.

The CI run of fe918bb, 36486684619, was red in three jobs.
- **Two catalogue mutants went GREEN:** "work-next speaks through terminalText" and adr-lint's "C-5 could-not-run".
  - This is the hazard §18 names: `shown` now escapes every path before `terminalText` sees it, and `refuse_irregular` answers the directory case before the global OSError handler does.
  - Each got a test on the route it still guards alone: an archive catalog's effect cell in work-next's PARTIAL line, and a permission-denied task file.
  - Only the new mutants had been run locally, not every catalogue entry on the files changed.
- **Windows.** A test compared a POSIX path with work-next's native `docs\specs\…`. And MSYS `mkfifo` exits 0 while native Python sees no file, so the FIFO tests now skip unless `statSync().isFIFO()` holds.
- **One more slip, found by a STALE mutant:** the agent tool decoded a backslash-u escape for U+FEFF in a plan into a raw BOM inside adr-lint's source. It is written `chr(0xFEFF)` now.
- (fixture-waived: the findings fixed from this section are names holding a newline, a tag or a NUL byte, and trees holding a FIFO or a dangling link. A Windows checkout of `tests/fixtures/corpora/` cannot hold any of them. Each has a regression that builds its own scratch tree, and skips where the platform refuses the name: `tests/chaos-e016066.test.mjs`, `tests/chaos-315-codex-render.test.mjs` and `tests/chaos-315-codex-status.test.mjs`.)

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

## 325. PARTLY CLOSED 2026-10-06 — A session start spends its time starting processes, and reads the six oldest records

Reported by the owner from Windows on 2026-10-01: SessionStart hooks take long to complete. Measured the
same day on macOS with a `startup` payload, tracing every child process:

- `lifecycle.mjs` took 0.91s: 4 `git` calls, then 6 `adr-next` Python spawns in series (83–110ms each).
  The cap `TASK_DIRECTORY_READ_CAP` (`plugin/scripts/lifecycle.mjs:1205`) reads six directories in
  listing order. In this repository those are ADR-001 to ADR-006, every one done. So the hook pays six
  interpreter starts to report nothing, and every record that could be in flight goes into
  "+62 more: UNPROVEN — not read".
- `branch-state.mjs --cached 120` took 0.11s with a fresh cache and 1.56s without one. 637ms of that
  was one `gh run list`. At session start the 120s cache is usually stale.

A Python start and a `gh` call each cost far more on Windows than here; no Windows timing is recorded
yet. **Lead:** one `adr-next` process reading every task directory removes five interpreter starts and
the cap together. `branch-state` at SessionStart could serve its git half and refresh `gh` in the
background, as the brief already does. Both change what a shipped reader prints, so each needs a measured
target first (a Windows timing), then a spec and an outside run (§18).

**Triaged 2026-10-06.** The "six oldest" half is fixed. `taskDirectories` (`plugin/scripts/lifecycle.mjs`, the comment citing §325) ranks directories by their newest change. SessionStart says so: "reads the 6 most recently changed per session start". The process-start half is still open, and it stays without an ADR on purpose, under the owner's measured-target rule (2026-09-26). Measured on macOS 2026-10-06: about 65 ms per adr-next start, so the six cost about 0.4 s of a 1.1–1.5 s SessionStart. That is too thin a target to justify a new multi-directory CLI contract. A Windows timing is still the missing number, and the draft waits for it. If it is ever written, the draft must keep two things. Each directory's could-not-look stays its own, so one locked directory does not blind the batch (§350 C3). And the single-directory invocation stays byte-identical.

## 326. FIXED 2026-10-01 — The Codex round on ADR-078 (01443dd): seven findings, four of them fail-opens

Archived: [backlog-archive/BACKLOG-301-400.md](backlog-archive/BACKLOG-301-400.md)

## 327. FIXED 2026-10-01 — After 3.4.0, judged from an adopter's session (§19): what the brief repeats, a regression 3.4.0 shipped, and which records session start reads

Archived: [backlog-archive/BACKLOG-301-400.md](backlog-archive/BACKLOG-301-400.md)

## 328. CLOSED 2026-10-06 (not reproduced; its instrument stays) — A campaign printed nothing on Windows, once, inside a locked test

Archived: [backlog-archive/BACKLOG-301-400.md](backlog-archive/BACKLOG-301-400.md)

## 329. CLOSED 2026-10-06 (reworked, Accepted, shipped in 3.7.0) — ADR-079 (every gate reads JavaScript one way) is parked on its review

Archived: [backlog-archive/BACKLOG-301-400.md](backlog-archive/BACKLOG-301-400.md)

## 330. DEFERRED 2026-10-01 — the artifact batch gates each path in its own shell

`runArtifactBatch` (`plugin/scripts/run-shell-hook.mjs:600`) starts one bash per path through
`facts-gate-dispatch.sh`, about 200 ms each. Replayed on a local clone of an adopter's session log, 217
targets took 43.3 s. ADR-080 takes the pass off every hook's critical path, which removes the wait but
not the work. Gating a batch in one shell would cut the work too, but it gives up the dispatcher's
per-path isolation, so it is its own decision. Measure the pass's wall time after ADR-080 ships before
deciding.

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

## 351. OPEN 2026-10-06 — §295 triaged against a0d963d: what is still open
Every item of §295 was checked against the working-tree readers at a0d963d. The check was a read-only subagent reproducing each item in scratch copies of `tests/fixtures/corpora/go-module`. FIXED: items 2, 3, 4, 5, 7, 12, 13, 17, 18, 19.1/2/4, 21.1/2, 22.4, 23.1/2, 24, and the duplicate-id half of 11. BY DESIGN: 19's `--json` data, 22.5, 23.5's `Accepted (partially)`, 23.7. Still open, worst direction first:
- **Fail-open:**
  - 8: a duplicate Verification Log row, a 41-character sha, and a sha naming no commit each lint PASS with no finding.
    - **Fixed by ADR-088 T1 (executed 2026-10-06, uncommitted at 3ae6c8c).** The row sha field lives once in `record.py`, and `adr-next` reads it as `adr-lint` does (4-64), so a `core.abbrev=4` or SHA-256 row is no longer `done` to one and `READY` to the other. In a SHA-1 repository a sha over 40 characters is blocked by adr-lint and not evidence to adr-next or adr-verify. Unchecked by design, said in the adr-execute skill: a sha naming no commit, a repeated row, and row dates out of order (ADR-088 Decision 2, with the measurements). Test `tests/vlog-sha-width.test.mjs`; two mutants RED.
    - After two Codex reviews of the diff, the sweep's claim reader (`claims_in`) and the test lock's row reader (`_recorded_lock`, through `lock_findings`) take the same width; each has a test and a mutant RED. The writer-side lock readers `--relock` uses (`lock_hasher` and `moved_lock_bodies`) take no repository and still read every width.
  - 22.1: `human_outcome` reads "revoked", "rolled back", ❌, "done? no" and "passed? not really" as pass.
    - **Fixed 2026-10-06.** "revoked", "reverted", "rolled back" (verb forms only) and ❌ are stop words, and an affirmative asked and answered no ("done? no") is a stop. The noun "rollback" is left alone, because a real approval's follow-up uses it (§287). Measured over the 13 unique human-observed sign-offs under the owner's projects directory: none carries any of these. `tests/human-outcome-negatives.test.mjs` has six stops and three controls. Two new mutants and one repointed, all RED.
  - 20.Q5: corpus-probe output saved as `T3-report.md` is ready in adr-next and work-next, while adr-lint FAILs it.
    - **Fixed 2026-10-06.** adr-next stops a file in `tasks/` that never mentions an Acceptance, naming why, so it is not offered as ready. A malformed `##\u00a0Acceptance` heading keeps its own, sharper note. All 244 task files under the owner's projects carry the heading. Test `tests/no-acceptance-task.test.mjs`; mutant RED. Side effect: a self-looping symlinked task is now one unreadable task, not adr-next failing whole, so `tests/chaos-e016066.test.mjs` drives that path with a mode-000 file instead. Its three §319 item 6 mutants are RED again.
  - 22.2: a spec symlinked outside the repository is listed in `uncoveredReadySpecs`.
    - **By design, 2026-10-08.** ADR-092 Decision 2 (its finding 1) settled that a record linked to a file outside the repository is placed by its listed path and counted; the spec reader follows the same rule. Reproduced in a scratch repository: with the target present the spec is in `uncoveredReadySpecs`; with it gone (a CI clone) it is in `unprovenSpecs`. The answer depends on the machine only where the link does, and is never silent.
  - 9: lifecycle accepts any `check.*` event whose `after.tree` matches, unbound to `checks.jsonl`. This needs a record.
    - **Fixed by ADR-088 T2 (executed 2026-10-06, uncommitted at 3ae6c8c).** `publishVerdict` judges the session log through `ledgerBoundLog`: a `check.*` event counts only when `checks.jsonl` holds a record with its id, its grade and its tree, and the refusal names the events it dropped. Rule P and git's own hook both read it. A ledger not read whole is could-not-look to the verdict whoever imported it, and an unterminated last line counts as not read whole (a Codex review of the diff). Unchecked by design: a hand-written five-field `checks.jsonl` line still clears the refusal in silence, an unparseable line in either file still turns it into advice, and the Stop, SessionStart, SessionEnd and statusline readers are not bound (ADR-088 Out of Scope). Siblings of the unterminated-line class, not changed: `latestFastPass` and qh-check's `passedAlready`. Tests `tests/publish-ledger-binding.test.mjs`; mutants RED. ADR-066 T1's locked test relocked with the owner's approval.
- **Hang:** item 1 and 19.3, one cause. A FIFO or a directory named `*.md` in `tasks/` hangs work-next, adr-next and corpus-probe (rc 124 at 25 s), or stops the whole directory. adr-lint already refuses non-regular entries. Give the other readers the same per-entry stop.
  - **Fixed 2026-10-06.** adr-next stops a non-regular task entry as unreadable, without opening it, and reads the rest. work-next and the corpus reader in lifecycle never open one. That covers a FIFO, a directory named `T3-x.md`, and a git-tracked link to a FIFO, which is the shape git lists. corpus-probe over a FIFO corpus now finishes in 0.8 s; adr-lint still refuses the record (§319). The test is `tests/irregular-task-entry.test.mjs`, three cases. Four catalogue mutants, all RED.
- **Untrue sentence or blind spot:**
  - 10: `attestation()` has no `look`; with git absent it says "not a git checkout"; `diffReports` never compares specs.
    - **Fixed earlier, confirmed 2026-10-08.** By ADR-089: an attestation carries `look` (every 3.8.13 outside attestation shows it); git that cannot run is said as "git could not be run (<code>)", apart from a plugin outside a checkout (`corpus-probe.mjs` `gitReason`); and `--diff` compares `unprovenSpecs` and `uncoveredReadySpecs` with the other workNext lists.
  - 22.3: ENOBUFS is worded "did not start", and there is no `maxBuffer`.
    - **Fixed earlier, confirmed 2026-10-08.** ADR-089 T4: the probe's reader spawns (`run`, `gate` and adr-lint's) pass `maxBuffer` (64 MiB), and ENOBUFS reads "ran, and its output passed the probe's buffer (ENOBUFS), so what it said was not read" (`failedToRun`).
  - 14: `--adopt` echoes absolute paths, and work-next says "adopts it".
    - **Fixed earlier, confirmed 2026-10-08.** ADR-089 T5 made `--adopt` name each root relative to the working directory, or by its last component; a scratch corpus given both relative and absolute arguments printed no home path. work-next now says `--adopt` "reports what adopting it needs; it changes nothing". A dangling link in the corpus stops the run with exit 2 naming it, which is ADR-092 Decision 10, not a defect.
- **Hardening:**
  - 11/20.Q6: homoglyph and fullwidth ids (`АDR-005`, `T６`) count with no remark.
    - **Fixed 2026-10-08.** Reproduced in a scratch corpus: a Cyrillic-A record name and a fullwidth-digit one were counted by their titles with no remark, and a fullwidth `T6` task was READY in adr-next while adr-lint blocked "README lists 'T6' but no task file matches it". adr-lint now advises on a record or task file whose name reads as an id only after NFKC and a small A/T look-alike map, naming the code points and the ASCII name. The block stays; the remark is new. No tracked name in this repository holds a non-ASCII character. Test `tests/lookalike-names.test.mjs` with an ASCII control; four mutants RED. Not changed: work-next and the probe still read the file sets they read (A4's half), since adr-lint now names the file both disagree about.
  - 20.Q1: only `<>«»` are mapped.
    - **By design, 2026-10-08.** The map exists for characters a parser reads as a frame: `<`, `>`, and the quote marks themselves. `＜ ＞ ﹥ 〈 〉` are already look-alikes, the same kind of character `‹›` that `<>` are mapped to, so mapping them changes nothing a reader parses. Entities and Markdown inside the quotes are printed as text, never rendered.
  - 6: adr-next prints a ZWSP raw.
    - **Fixed earlier, confirmed 2026-10-08.** `adr-next` `_UNSAFE` holds U+200B–U+200F, U+2060–U+2069 and the BOM (`adr-next:316`); a task whose title and fence hold a ZWSP printed no raw U+200B byte (checked with `od -c`).
  - 23.4: impossible and 1970 dates PASS.
    - **Fixed earlier, confirmed 2026-10-08.** Closed under §355 ("Impossible dates"): `record.row_date_problem` refuses 2026-02-30, 2026-02-31 and 2099-01-01 in adr-lint and adr-next. 1970-01-01 is a real date and stays accepted, a named limit.
  - 21.3: a sparse checkout counts "0 task file(s)".
    - **Fixed 2026-10-08.** Reproduced with a sparse checkout (`git sparse-checkout set --no-cone` over the record only): work-next said "0 task file(s)" while git listed two. The directory was already UNPROVEN; the count now says "0 task file(s) on disk, and 2 more that git lists and the disk does not hold", and the JSON carries `tasksNotOnDisk`. Test `tests/work-next-absent-count.test.mjs` with a control; two mutants RED. SessionStart's line ("UNPROVEN — listed by git, not on disk") was already true and is unchanged.
    - **The gpt-6.1-sol review of the 3.8.14 reader changes (129331b0..HEAD) found one untrue sentence in this fix, now fixed.** Every failed `stat` was counted as "the disk does not hold"; EACCES on a parent proves no absence. Only ENOENT and ENOTDIR count as not on disk; any other failure is "could not be inspected" (`tasksUninspected`). Readiness is unchanged: both make the directory UNPROVEN. A POSIX mode-000 case in the same test; one new mutant, two repointed and the moved 2.110.0-rc L4 entry repointed, all RED. The review found no demoted block, no false look-alike advice and no other regression.
    - **From an outside 3.8.14 run (laravel-react-monorepo), fixed after 3.8.14.** The probe summary copied neither count, so a pasted probe report could not show them, the class the probe's own spec comment names. `workNext.tasksNotOnDisk` and `workNext.tasksUninspected` are in the report now, and `--diff` compares them with the other counts. Test `tests/probe-tasks-not-on-disk.test.mjs` with a control; two mutants RED, the moved ADR-089 T1 entry repointed and RED. A probe whose baseline predates them prints "before lacks workNext.tasksNotOnDisk" once.
- **Not checked here (Windows):** 16, 19.3's wording, 23.3, 23.6. 20.Q4's line key is UNKNOWN.
  - **Addressed 2026-10-09, without a Windows peer: the release CI's Windows job runs each case.** Read from run 37891968679's Windows log (v3.8.16):
    - 16, one junction loop blinding the corpus: §350 C7 fixed it after the report; `tests/corpus-link-loop.test.mjs` builds a real junction on Windows and passes ("a record reached again through a link that loops is read once, and the copies are named", and the SessionStart and work-next twins).
    - 19.3, a directory named like a task (PermissionError): §351 item 1's fix stops a non-regular entry unopened; "a directory named like a task is stopped unopened, and the other tasks are read" passes on Windows.
    - 23.3, reserved names: Git for Windows does not check out `CON.md` or `nul.md`, so such a task is listed and not on disk; "a task git lists but the disk lacks is stopped" passes on Windows, work-next counts it apart (21.3), and a name ending in a dot or a space is named PARTIAL (§355).
    - 20.Q4: "a torn checks.jsonl is named as checks.jsonl, not as the session log" passes on Windows. The key it questioned is `checks.jsonl:<size in bytes>` (`lifecycle.mjs`, the dedupe key), not a line: "line 10 of a one-line file" read a 10-byte size as a line. Nothing untrue is said.
    - 23.6, an 8.3 alias in `Governs:`: by design, and said. A Governs path resolves against git's listing (CLAUDE.md §8), which holds the long name, so `STANDA~1.MJS` names no tracked file, and adr-lint says so: "Governs: declares `scripts/STANDA~1.MJS`, which no tracked file matches" (reproduced 2026-10-09). No reader resolves a declared spelling through the disk.

**Codex review before 3.8.8 (gpt-6-astra, xhigh, 4283d6a...3ff59fb, REQUEST CHANGES, 2026-10-06): six findings. All six were confirmed against source and fixed, each with a test that failed first. They are in `tests/adr-next-codex-3-8-8.test.mjs` and one evidence-chain test.**
- **P1, a stop that still counted done.** `classify` reads `done` before any stop. So a task titled for another record (§292) with exit-0 evidence counted done under this one and released its dependents. A human approval later taken back did the same, because `is_done` took the FIRST non-stop sign-off. Now `done` is withheld by `foreign_stop` and by `human_stop`. `human_stop` reads the LAST sign-off: a stop later approved after a fix is done. `foreign_state` applies the same rule to a cross-record dependency.
- **P1, a prefixed build failure graded killed** (ADR-085). See the Follow-up in that record.
- **P2, `foreign_state` opened a FIFO** that `load` had guarded. Now it is unknown, unopened.
- **P2, an irregular entry sharing an id was skipped** when it sorted after the evidenced file. Now both names are given and the task is UNPROVEN.
- **P2, my take-back words stopped success prose.** "the expired token was revoked" and "verified: rolled back … successfully" were both stops. `TAKEN_BACK` now requires the verb to attach to the verdict: after a clause break that follows an affirmative, or with "approval", "sign-off" or "verdict" as its subject.
- **P2, `❌observed` passed**, since the word boundary excluded it. A cross is now a stop wherever it sits.
- Eight catalogue entries repointed; nine added. All 17 are RED.

**ADR-086 residual false refusals (Codex re-review of a14a751, 2026-10-06, P2, left open).** `freshRepositoryCommit` refuses a fresh-repository commit whose message says "push" or holds a quoted `;`, because it reads raw text: `/push/` over the whole command, and `step.code` for a quoted span holding an operator. Both were refused before ADR-086 as well, so nothing regressed. Inputs, each `freshRepositoryCommit(…, {})` false at the working tree after the fix:
- `R=$(mktemp -d) && cd "$R" && git init -q && git commit --allow-empty -m "push the fix"`
- `R=$(mktemp -d) && cd "$R" && git init -q && git commit --allow-empty -m "a;b"`
- Smallest fix the review suggests: classify the invoked verbs and git argument positions instead of raw text — a `push` only as a git subcommand, and a quoted operator only where git or a shell would run it, never in a `-m` value.
- **Fixed by ADR-090 (executed 2026-10-06, uncommitted at 2cb2d28).** T1 masks a commit's message value written as one quoted, non-dynamic literal whose spelling occurs once, before ADR-066's armed grammar and ADR-086's fresh-repository proof read the text; both inputs above, and `-m "let R=1"`, are now advised. Still open: an unquoted value (`-m push`) and the common `-m "$(cat <<'EOF' … EOF)"` stay refused (ADR-090 Out of Scope, Alternatives (e) and (f)), as do the owner decisions in ADR-090 Follow-ups.

## 352. OPEN 2026-10-06 — The GitHub scout: what outside projects offer, and what each needs before it is taken

The owner asked for a scout of GitHub projects that could help, ranked by stars and by stack, including
those that mention a Claude plugin. It used `gh search repos`, `gh search code` and `gh api` only; nothing
was cloned or run. Plan of record: `ok-plan-this-properly-flickering-lightning` (2026-10-06).
- **Outside corpora** (for 3.8.8 and after): public/php-dated-adr `adr/` (167, dated names);
  public/rst-nested-adr (142 `.rst` records in 39 nested `docs/decisions`); public/go-sdk-adr
  `docs/architecture` (63, `adr-NNN-`); vectordotdev/vector `rfcs/` (76, date plus issue number);
  public/laravel-adr `docs/adr` (66, Laravel monorepo); public/swift-adrs `docs/decisions` (61,
  Swift). Windows-shaped: public/dir-status-rfc (status set by directory), public/spec-folder-adr
  (`#1043 - Title` spec folders). Peers are asked first. A run made by the releasing session is labelled
  as its own and is never imported as an attestation (§18).
- **Inputs for §16:** the test suites of kenryu42/cc-safety-net and nizos/probity (both MIT), harvested
  as commands our publish classifier must classify. Inputs only; no code copied, and no blocking taken (§3).
- **Done now:** `mutation-audit` names Infection, gremlins or go-mutesting, and muter, plus the static
  no-assertion linters (`expect-expect`, `testifylint`).
- **Each needs a measured target and an Accepted record before it is built:**
  - per-test kill attribution, a fence test that killed nothing (scott-cc; `killedBy` already holds the
    data);
    - **Measured 2026-10-06: INCONCLUSIVE.** The v3.8.7 release campaign (run 37411500980) printed 2082 RED rows and 1258 distinct killing test names, from all 48 shard logs fetched with `gh run view --job`. But 53 narrowed entries that WERE red have an `only` pattern matching none of those printed names. So killer names cannot be matched back to the catalogue, and the logs never list the tests a baseline RAN, only the killers. A "test that killed nothing" count needs `mutate.mjs` to emit each baseline's run test names. That is a change to the campaign's output, and it needs a record.
  - a Mutation Log export in Stryker's `mutation-testing-elements` schema;
  - a check that a record's Decision, its tasks and its Tests table agree (spec-kit `analyze`, OpenSpec
    `validate --strict`);
  - skill-call duration beside ADR-084's count (claude-night-market);
  - hook-input adapters for Codex and Copilot CLI (probity);
  - `ccusage` as the instrument for the next §19 footprint measurement.
- **Not taken:** code from unlicensed repositories (scott-cc); any blocking behaviour.
- **Released as v3.8.8 at 944bb37 (2026-10-06), Latest.** release-evidence said SUCCESS: 55 jobs green, including the dispatched full campaign (run 37457712766). Before that, the campaign at e39ace5 failed one Windows test, fixed in 944bb37.
  - **Outside runs attested** (`docs/corpus-reports/*-3.8.8-944bb37.json`):
    - react-spa: 2 compared, passToFail 0.
    - pub-laravel-adr (public/laravel-adr, public, no `--sweep`): 66 compared, passToFail 0. All 66 are FAIL at both revisions; 52 records against 66 compared, 14 undecided. Why every record FAILs there was not checked; that is a lead for corpus shape, not for 3.8.8.
    - php-laravel-monolith: 17 records. `verdictChanges` is null because the look is PARTIAL. The runner compared it by hand: all 23 adr-lint verdicts unchanged, and the §313 sentence fired on a real case and is accurate there.
    - app-ts-monorepo and web-app-no-adr-corpus: 0 records each.
  - **Could not run:** rust-records-corpus, whose "Code from External" classifier needs its user's approval. Not yet replied: php-react-app and a11y-tooling-ad.
  - **My request was wrong once.** It asked for `--sweep` on public corpora, which re-runs a stranger's acceptance commands. Two peers refused and said why, and I sent a correction to all six. Future requests ask for public corpora WITHOUT `--sweep`.
  - **Ledger counts (ADR-081, ADR-084; counts only):**
    - react-spa: 9 sessions, 0 skills, 0 skips, 8 checks (7 passed).
    - php-laravel-monolith: 13 sessions, 0 skills, 0 skips, 3 checks.
    - app-ts-monorepo: 12 sessions, 0 skills, 0 skips, 95 checks (80 passed).
    - web-app-no-adr-corpus: 1 session, 0 skills, 0 skips, 2 checks.
    The skill counter shipped in 3.8.7, so no adopter has recorded a skill call yet.

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

## 358. OPEN 2026-10-07 — the Status word's end is each runtime's Unicode, where the record name's digits are now one frozen table

ADR-092's review fix (finding 3) froze the decimal digits a name arm reads into one table both languages
share. The Status word is not frozen: record.py's `status_word` reads `[^\W_]` and lifecycle.mjs's
`recordStatusKind` reads `[\p{L}\p{N}]`, each from its own runtime's Unicode. A letter assigned in a
Unicode version one runtime has and the other lacks, written straight after the word (`Accepted` plus
U+11DE0, by the review's report), ends the word in one and continues it in the other, so the record
governs in one language only. Not reproducible here: measured 2026-10-07, Python 3.14 (unidata 16.0.0)
and this machine's Node (`process.versions.unicode` 16.0) both give 770 identical letter-or-number ranges.

The fix would be the digit table's shape, a frozen 770-range letter-or-number table in both languages
(or one data file both read), held by the parity test. Not built: no runtime pair here disagrees, and
the table is a generated blob in two files. Build it when a supported runtime pair's ranges differ.

## 359. OPEN 2026-10-07 — Python record readers read a whole file with no byte bound

The second half of ADR-092's review finding 13, confirmed by its last review round: `read_regular`
(`plugin/lib/record.py`) reads a regular file whole, so an 8 MiB record with one unbroken line is one
8 MiB allocation (v3.8.10 read it twice; the fixes read it once). Not fail-open: every answer is still
the answer for the whole file. Not built: no Python reader declares a byte budget, and a cap would
change adr-lint's verdict on a large real record. The JS screen is bounded since the same fixes.

## 360. CLOSED 2026-10-07 — History rewritten a second time, for strings copied from other repositories' corpora

Archived: [backlog-archive/BACKLOG-301-400.md](backlog-archive/BACKLOG-301-400.md)

## 361. CLOSED 2026-10-08 — A sign-off that quotes its red run before the green one read as a stop

Archived: [backlog-archive/BACKLOG-301-400.md](backlog-archive/BACKLOG-301-400.md)

## 362. CLOSED 2026-10-08 — An attestation says `records: 0` for a corpus whose only record is Proposed, while carrying a lint verdict for it

Archived: [backlog-archive/BACKLOG-301-400.md](backlog-archive/BACKLOG-301-400.md)

## 363. CLOSED 2026-10-08 — ADR-091 landed; its shipped readers, reviewed, and one hook line it exposed

Archived: [backlog-archive/BACKLOG-301-400.md](backlog-archive/BACKLOG-301-400.md)

## 364. OPEN 2026-10-09 — A locked test that many records share goes red in every earlier record, silently

Reported from outside (a peer session, a 15-record adopter corpus): a later task extends a shared integration test and lints only its own record, so every earlier record that locked that test fails `adr-lint` with "locked test … hash moved" and nobody is told. Seen three times in a day there. Read in source: the lock check (`plugin/lib/record.py`, the "hash moved" block) runs only when THAT record is linted, and the per-edit gate lints only the file touched. `python3 scripts/test-locks.py <test-file>` lists the lockers but is asked only before an edit. Not built; the owner's decision: lint every locker of a changed locked test (adr-context knows them), or treat a lock on a widely shared test differently. Relocking all without reviewing each diff defeats the lock.

## 365. OPEN 2026-10-09 — The title route sends a non-record markdown file to adr-lint

Confirmed by the reporter (a peer session): an evaluation whose first line is `# ADR-051 T7 S5: …` is read as a record by `facts-gate-dispatch.sh` (the `grep '^# ADR-[0-9]'` title test, BACKLOG §190), adr-lint answers not-recognised, and "UNPROVEN: adr-lint could not run" is printed on every touch. Advisory, exits 0. A title that names a record is not a record: the route needs the structure (`Status:`, a Context section) as well as the title, with a case that must still route (CLAUDE.md §16: every "this is data" exemption needs its "this is code again" twin).

## 366. OPEN 2026-10-09 — The branch brief repeats a constant clause because it shares a line with changing state

Reported, with three consecutive outputs, by a peer session on a repository with no GitHub remote: "CI COULD NOT LOOK — no remote names a GitHub host" is printed on nearly every prompt. Cause, consistent with the output and with a no-remote scratch repo here (three identical prompts printed it once, then nothing): the brief is suppressed when its text is unchanged, and the text carries HEAD, the uncommitted count and the read age, which change. The CI clause never does. Keep it as its own line with its own once-per-change check (CLAUDE.md §19: volatile text out of the compared text). Not built.

## 367. OPEN 2026-10-09 — The publish refusal judges a `git commit` by its text, not by where it runs

Measured in this session: with no `qh-check` passed on the tree, `git init … && git commit` inside a scratch repository under the session's temp directory was refused ("names commit or push"). The command publishes nothing from this repository. A false refusal (CLAUDE.md §16; the owner: fixed now). Class: a publish command whose working directory is not the repository (a `cd` into another repository, `git -C <elsewhere>`, a `GIT_DIR`). Not built; start from `publishCommandIn` and the commit-only proof in `lifecycle.mjs`.

## 368. OPEN 2026-10-09 — `subagent.ended` outnumbers `subagent.started` 692 to 30 in one session log

One session log (a week of events) holds 774 `subagent.ended` rows over 692 distinct agent ids and 46 `subagent.started` over 30; 722 of the ended rows carry an empty `agentType`. `SubagentStop` has no matcher in `plugin/hooks/hooks.json`, so it fires for every stop. Source not traced: workflow or teammate agents that never fire a start are the lead. Costs one `lifecycle.mjs` run each (timeout 120).

## 369. OPEN 2026-10-09 — What a third-party spec-driven framework does better, as adoption candidates

A read-only comparison (subagent reports; three claims checked against the files: the test selector is local-only, the positive-control lint exists, non-PR CI runs force the full matrix). Candidates, in priority order: (1) an AST lint that every gate has a test driving it to its failing verdict, discovered and not listed, empty allowlist, fail-closed when it scans zero; (2) an AST lint against a read failure collapsed into "absent" or into a pass (empty catch, pass-shaped catch, exists-collapse), which mechanises ADR-005; (3) "scanned zero is a violation" on every sweep; (4) shrink-only allowlist ratchets (a stale entry fails); (5) the qh-check fast lane: a measured read-set selector with a widening ladder (unknown means everything) and a forced-full path list, full on push; (6) a measured skill-listing budget and a description-length lint; (7) a record of declined requests with re-open criteria; (8) a randomised per-wrap delimiter for untrusted text, to compare with ADR-090. Their CI never trusts the selector: the full unit suite runs sharded on every product change, with no result cache, so a cache is a bet beyond that evidence. Not adopted: the multi-runtime installer, the phase loop, translations, generated twins.

## 370. OPEN 2026-10-09 — An adopter survey: what is ignored, what costs time (15 sessions, 12 shapes)

Asked of every live session (10 Mac, 5 Windows; shapes: an Ansible estate repository, two Laravel-and-React monorepos, two Python FastAPI backends, a Rust workspace of about twenty crates, a Go multi-module workspace, two Go command-line tools, three React and TypeScript front ends, two TypeScript generators) and answered from their transcripts and `.git/quality-harness/` logs; "not measured" marks a guess. Nobody skipped a gate or routed a commit around the hook; seven skipped the SessionStart "Run qh-check" advisory because they had changed nothing in the repository.
- **Ignored text, in sessions out of 15.** The per-prompt brief, 14: a CI line that can never resolve (a non-GitHub remote or no run), 8; a failed run's job list repeated, 5; "the last answer is N min old … refreshing", 10. SessionStart: "ADR tasks in flight", 10; "+N more task directories: UNPROVEN", 8; "the previous session ended with N shell mutation(s) … run qh-check", 7 (a clean tree, a pass already on the exact tree, an 11-day-old row, or work in a temp directory); the "Verification:" paragraph, 6; "git's own refusal … has not run yet", 5; the archive-marker advice, 3.
- **Read in source (2026-10-09).** `branch-state.mjs` stamps `said` with a withheld marker when it withholds a snapshot past the cap, so the next identical brief prints again (this is also why §366's constant clause repeats). `ciRed()` repeats a completed failed run on every prompt by design (CLAUDE.md §15). `previousSessionNotice` (`lifecycle.mjs`) reads the previous session's row only: it never consults the ledger for the current tree and never expires.
- **Time.** Harness overhead is small: SessionStart 0.9-2.2 s, PreToolUse 82 ms quiet and about 1.0 s mean under load, PreCompact 5.5 s once, a per-write gate 0.4-0.9 s on Windows. The wall time is the declared check: medians of 35-42 s (two command-line tools), 100-136 s (a Laravel-and-React monorepo), 480-2060 s (a Go multi-module workspace), and 1400-2170 s (a FastAPI backend, two of three runs red because a database container and a browser build were missing). A prose-only commit paid the full check in 5 sessions: about 25 minutes of suite for three prose commits in one, 5 of 13 runs in another.
- **Planned (plan of 2026-10-09, one record).** The brief says nothing past the cap and keeps `said` on the last shown text; a failed run prints once, then one short line; SessionStart says a standing paragraph once per repository per three days and the previous-session advice only for a dirty, unchecked tree; a project may declare `"prose"` globs so a prose-only change reuses the last pass; writes outside the repository stop being recorded (once reproduced).
- **A correction that settles the prose rule (a FastAPI-backend session, same day).** Its first reply said Markdown cannot break the suite; it withdrew that: two of its unit tests read the docs and the runbooks, so a docs-only diff can turn its suite red and a default-on prose rule would have been unsafe there. The narrower fix it names exists already: a declared `fastCheck` (ADR-081) of the unit suite plus `adr-lint` on the touched records. So the rule stays opt-in, and the one-line hint qh-check prints after a prose-only change names both `prose` and `fastCheck`. Its auto-mode classifier also refused to let the session declare a diff-routing check as a "CI bypass": any such declaration needs the project owner's explicit approval, which the hint says.
- **Left here, with the evidence.** Infrastructure missing reported as a red check, not could-not-run (a FastAPI backend). A stray untracked file in the repository root gated but never shown (a Go tool on Windows). `check.passed` rows re-emitted at session start from an older HEAD (two Windows sessions). Tasks of a record whose Status says implemented listed as ready (a Rust workspace). The "unattributable" flag on every run on a shared machine. Git for Windows below 2.54 leaves publish unarmed in every session and nothing tells the agent (three Windows sessions, git 2.49). The artifact-validation advisory firing mid-Grilling on an unrelated Bash call. `file.written` and `artifact.gated` recorded for writes outside the repository (three Windows sessions, 0.4-0.9 s each; not yet reproduced here). Not ours, so not filed as defects: a rule-injection reprint, a detector scoreboard dump, a drifted-memory block, the post-compaction `/amm` line, and the host's PowerShell path guards.
- **Closed by ADR-099, 2026-10-12: the two SessionStart items above.** "ADR tasks in flight" and "+N more task directories: UNPROVEN" are no longer said: SessionStart, the compaction note and `qh_orientation` name no ready task, and `work-next` is the one reader of "ready".

## 371. OPEN 2026-10-09 — The publish advice judges the session's repository for a commit aimed elsewhere, and reads the index before an in-command `git add`

Two peer leads, both advice only (nothing refused), both confirmed against source. (1) `git -C $R commit …` into a scratch repository the command made, in an armed session: the advice said "the staged index is unchecked" about the session repository's tree and index. `observe()` reads the session's repository and the command's `-C` or `cd` target is not consulted for that advice. (2) `git add <files> && git commit -F - <<…` in one command: the same advice, from a `write-tree` of a copy of the index taken at PreToolUse, before the `git add` runs. This is the second independent sighting of the candidate recorded under the 3.1.6 release campaign (2026-09-29). Direction: when the command stages, or names another repository, the index claim is "not known", never "unchecked". Not built. A spelling to keep for §16 twins: an assignment from another variable (`R=$S/r-a; mkdir -p $R; git -C $R init -q; …`) is not a literal under ADR-093's grammar and stays refused on an unchecked armed tree, by design.

Third sighting of (2), 2026-10-09: `git add docs/BACKLOG.md && git commit -F - <<…` in one command was refused as "not proven to be one commit" while a fast pass stood on the tree; the same two commands run apart went through. The refusal is ADR-081's, working as written, so this is the cost of chaining, not a defect; it is recorded because the advice for the first form says "unchecked" about an index the `git add` has not yet changed.

## 372. OPEN 2026-10-09 — What ADR-094 deliberately leaves: injected prompts, implemented records listed as ready, per-call PreToolUse advice

Three leads from the adopter survey (BACKLOG §370) and the independent critique of its plan, left out of ADR-094 on purpose. (1) The per-prompt brief also runs for prompts the host injects (cross-session and background-task notices). The brief script reads no stdin today, so whether the hook payload carries the prompt is unmeasured, and no survey session named it; a spike must come first. (2) The ADR tasks in flight list tasks of records that are implemented, and one session reported tasks of Proposed records listed as ready; `readyTaskLines` (`lifecycle.mjs:1873-1960`) showed no Status filter in the part read, which is a §10 defect if it holds ("a record is a work order only while Accepted"). Not verified. (3) PreToolUse lifecycle advice was repeated 183 times in one session (about 750 bytes and about 1.0 s each); not in ADR-094, whose T2 covers SessionStart only. Direction for (3): the same text-hash marker `saidHere` introduces, applied per repository to the advice that restates a standing fact.

Update 2026-10-10, from the outside run of c944ee05 (a Rust workspace repository): lead (2) is confirmed on a corpus we do not own. Two records whose Status line reads "Accepted — implemented at <sha> on main …" had their `T1` listed as ready; a third, truly not-started record was right. The reader grades a task done only by its Verification Log, so by ADR-005 it is not wrong to call a task without evidence ready; the cost is the noise, and the fix is on the corpus side (log the evidence or retire the record) or in a decision about what "implemented" in a Status may mean to the reader. No code change was made in the ADR-094 batch.

Update 2026-10-10, from a Windows outside run of 3.8.18 (a Python FastAPI-and-Celery backend, 72 records, 209 tasks; `look ok`, 0 of 77 verdicts changed from 3.8.17): the SessionStart in-flight line named one task as ready while `work-next` lists the same task under `readyButClaimedDone` (a README row says done and nothing proves it); in that corpus 3 tasks are ready, 3 of them claimed done, 10 unbacked. Confirmed in source: `lifecycle.mjs` never reads `readyButClaimedDone`; only `work-next.mjs` and `corpus-probe.mjs` do, so a session that reads only the hook would start work on a task a README calls finished. Not fixed here: the ready lines belong to the ADR-record cluster of section 375 (wave B2) and the fix is a judgement about which reader owns "ready", not a one-line guard. Re-open when: that cluster is extracted, or an adopter reports starting a finished task.

Update 2026-10-12: lead (2) is closed by ADR-099. Only `work-next` says which task is ready, so a Proposed or implemented record's task is no longer offered at SessionStart, and the disagreement with `readyButClaimedDone` has no second reader to come from. Leads (1) and (3) stay open.

## 373. OPEN 2026-10-10 — What executing ADR-094 showed about the gates themselves

Five findings from executing ADR-094 that are about the harness, not about the batch, left here with the evidence. (1) **The fast check does not run the tests that call a changed function.** `fastCheck` runs a fixed list of eleven test files; T4 changed `unobservableWrites`, three locked tests in two other files (`tests/lifecycle.test.mjs`, `tests/observed-events.test.mjs`) asserted the opposite on purpose, and a local commit went in red for them; only the full gate (and, for the second file, only the full gate) found it. A fast list written by hand is a classifier over "which tests matter" (§16). Direction: derive the list from the files a commit touches (the test files that import them), or say in the commit advice that the fast pass covers a named list. (2) **`qh-check`'s ledger reader exists twice in `lifecycle.mjs`** since `passedAlready` moved there: `latestFastPass` and `passedAlready` read the same file the same way, and a catalogue entry had to carry context to tell them apart. Direction: one reader with a ledger name. (3) **`gh run list --commit` needs the full sha**; a watcher written with a short one waited the whole hour and reported "null". (4) **The load gate never opens on this machine**: a container VM, `fseventsd` and other projects' builds hold the load between 14 and 31, so "wait for load below the core count" waited 30 minutes and then ran contended, and every gate result carried "unattributable". Direction: a gate that cannot be attributed on a shared machine needs a different discriminator than the load average (the lease that ADR-077 holds already names the neighbours). (5) **A locked test that uses a path outside the repository as its example of "a write git cannot see"** is the example every author reaches for, because it is the cheapest to build; three tests did, in three different records. When a decision changes what such a write means, the class is found by running the whole suite, not by searching for the function.

## 374. OPEN 2026-10-10 — The §369 comparison candidates, re-measured: two fail-opens fixed, one idea declined with a test, one declined with numbers, five filed

Re-measured against this repository before building anything (three read-only surveys, an advisor pass, a Codex pass on the first plan, five findings folded in). The first plan was cut by the owner ("will it actually make quality harness better?"): most of the list was hygiene that would have made `selftest` heavier and changed nothing for an adopter.
- **Taken, from a swallowed-read triage** (`f9c639a2`, `52cd9a66`). Command: a one-off acorn pass (`node --expose-internals`, as `scripts/untimed-spawns.mjs` loads it) over `plugin/scripts/*.mjs`: 37 files, 140 `try` blocks around a filesystem read (24 empty `catch`, 56 returning a literal, 3 returning undefined, 12 returning a computed value, 45 with a longer body). The 57 longer or computed ones were read in a listing and most inspect the error code (not counted). The sites that can turn "could not read" into a pass, a clean answer or permission were read by hand: two were real. (1) An unparseable `.quality-harness.json` made `qh-check` run the inferred check and record a pass for it; the declared check never ran. Now UNRUN, exit 2, full and `--fast`. (2) `standalone-link`'s `replaceable()` read any failed `lstat` as "absent, free to overwrite" in a directory that holds the user's own tools; only ENOENT is absent. The others map an unreadable file to the closed answer (no pass, an unseen write, a refusal) or are display and housekeeping. Not covered: the Python gates' `except` around a read (`adr-lint`, `adr-verify`, `record.py`), and a read made through a helper whose `try` holds no filesystem call.
- **Taken, from a Windows run of 3.8.17** (a Windows 11 runner, Git Bash 5.2): prose reuse works as designed there; two sentences were wrong. A tree identical to one that had passed was reported as "only prose changed", and a skip row chained to a reuse row rather than to the pass that ran. Both reproduced on macOS and are fixed in `f9c639a2`. Its T4 numbers: an outside-root write costs about 0.77 s of hook time against about 1.09 s inside (three hooks timed by direct payload, serial sum; `facts-gate-dispatch` ~0.45 s dominates). Not measured inside a live Write.
- **Taken, `52cd9a66`: a scan of nothing is not a clean one.** `untimed-spawns` exited 0 over an empty list and over files it could not parse; `untimed-children` skipped an unparsed gate with `continue`; `orphan-sweep` said "0 of 0 definitions". UNRUN, exit 2. The advisory sweeps keep exit 0 by design (§2).
- **Declined: a randomised per-wrap delimiter for untrusted text.** `corpusText` already rewrites `«` `»` `<` `>` inside the text (`lifecycle.mjs`, `corpusText`) and `codeSpan` adapts its fence; the "compare with ADR-090" premise was wrong (ADR-090 is about quoted commit messages). `tests/quoted-text-closes.test.mjs` now proves a hostile `»`, `«` or tag cannot close the mark; the backtick breakout was already tested. Re-open when: a quoted corpus string is shown to end its own mark.
- **Declined with numbers: a read-set selector for `qh-check --fast`.** Replayed over the last 100 commits (a scratch script, not kept): 193 test files; 86 commits widen to the full suite (68 are docs-only: BACKLOG, ADR records, corpus reports; 9 touch the mutation catalogue; 9 touch the config, hooks or rules), 14 are selective and bimodal at about 1% or about 99% of the suite, because nearly every test reaches `lifecycle.mjs`. Median 100%, so a file-level selector saves nothing where the time goes. Re-open when: a per-test read-set exists (coverage per test) or `lifecycle.mjs` is split so its reach is not the whole suite. The measured lever is the other one: 68 of 100 commits are docs-only, and this repository's `selftest` reads docs, so `prose` (ADR-094 T3) is not declared here; a docs lane (the tests that read `docs/`) is the candidate, and it also answers §373 finding 1 for them.
- **Filed, not taken. Re-open when** is on each. (a) The listing budget covers skills only (`tests/skill-metadata.test.mjs`): the 4 agent descriptions (1,008 characters) are in no budget, and `.claude/rules/19-adopter-footprint.md` states 7,422 where 7,372 is measured. Re-open when an agent description grows past the skills' 700-byte cap. (b) 34 `DECLINED` headings in this file are free prose and `adr-context` reads ADRs only, so a declined idea is invisible to it. Re-open when a declined idea is re-proposed. (c) No stale-entry check for `scripts/vulture-allowlist.py` (3 names), `SYNTHETIC` in `tests/package.test.mjs`, or the `// untimed-spawn:` acknowledgements; the matcher at `scripts/untimed-spawns.mjs:97` also accepts the text inside a string literal, which wants its "this is code again" twin (`trivial` already has a ratchet: `tests/classify.test.mjs`). Re-open when a stale entry hides a finding. (d) A swallowed-read lint with a shrink-only baseline: 83 sites swallow today; most are hooks that must exit 0. Re-open when the triage's class recurs. (e) A gate-control table (each gate driven to its failing verdict on a dirty fixture): `tests/package.test.mjs` already requires a mutation per gate. Re-open when a gate is found that no test can make fail. Also: `scripts/dead-code-scan.sh` runs vulture over its allowlist alone on a repository with no Python; unreachable here, and untestable without fake `uvx`/`npx`.

Update 2026-10-10, owner: the candidates filed above (a), (c), (d), (e), the dead-code-scan note and the declined selector do not make sense while `lifecycle.mjs` has its current shape; they are parked behind section 375 and re-opened per wave there, not on their own conditions.

Update 2026-10-10, from the Windows runs of 3.8.18 (two sessions, Windows 11, Git Bash 5.2, node 24.20): the prose-reuse, identical-tree and skip-row fixes and the malformed-config refusal behave as designed (a trailing comma, a directory, an empty file, `null`, `[]` and a dangling junction are each exit 2 with the detector file never created); the new tests give 16 pass, 0 fail, 2 skipped there. Two leads taken in the working tree: a config that starts with a byte-order mark (what Windows PowerShell 5.1 writes) is refused with a message that names it, not an invisible character in quotes; and the dangling-link test builds a junction on Windows instead of skipping. The ELOOP symlink-loop test for `replaceable` still skips there (no loop is buildable). A lead for the next outside-run request: a plain `git clone` of this repository fails on Windows with "Filename too long" (two archived task files, CLAUDE.md section 7); the request must say `git clone -c core.longpaths=true`.

## 375. OPEN 2026-10-10 — `lifecycle.mjs` is one 7,591-line bag of small functions: dumb recorders, pure judges, a replay harness

Owner, 2026-10-10: the file is one big chunk that could be rules maintained bit by bit, it is heavy and probably not the right shape, and it may become a project of its own later. Diagnosis: `docs/research/2026-10-10-lifecycle-shape.md`; seam map (effect-classified call graph, 17 clusters): `docs/research/2026-10-10-lifecycle-seams.md`. The finding that decides the direction: 84% of calls already stay inside a cluster, and 41% of function lines can reach a git or process spawn, so the missing pieces are the file boundary and the split of judging from gathering facts. Direction chosen: stage A golden transcripts at the hook boundary, B extract the pure clusters behind a facade, C `facts` at the entangled judges, D rules as files. No behaviour change in A or B; a golden that changes is a finding.

Baseline, measured at `52cd9a66` on 2026-10-10 (re-measure after every wave and add a column):

| measure | baseline |
|---|---|
| lines in `lifecycle.mjs` | 7,591 |
| top-level functions / exported | 275 / 112 |
| pure share of function lines (no file, process, clock or event effect reachable) | 28% (151 functions, 1,532 of 5,384 lines) |
| function lines that can reach a spawn | 41% (45 functions, 2,205 lines) |
| calls that stay inside a cluster | 84% (399 of 474) |
| test files reached by a change here (selector replay, section 374) | about 99% of 193 |
| fast-lane selector median share over the last 100 commits | 100% |
| commits touching the file | 244 of 1,735 (14%) |
| golden transcripts | 0 at the baseline; 5 scenarios, 68 hook calls after stage A's first slice (`tests/hook-goldens.test.mjs`, `tests/goldens/`; 5.6 s; in the repository's fast list) |
| scripts importing from it | 9 |

After B1 (2026-10-10, re-measured the same way): `lifecycle.mjs` 6,498 lines (from 7,591), 229 top-level functions (from 275), 106 exported (from 112), 14 clusters (from 17), 336 of 401 calls inside a cluster (84%, unchanged). The pure share of the remaining function lines fell from 28% to 22% and the share that can reach a spawn rose from 41% to 47%: the leaf that left was the pure part, so what is left is more entangled, which is what stage C is for. `publish-command.mjs` is 1,156 lines (88 declarations, imports only the tokenizer).

After B2 (2026-10-10, re-measured the same way): `lifecycle.mjs` 4,466 lines (from 7,591 at the baseline, 6,498 after B1), 146 top-level functions (from 229), 70 exported (from 106), 12 clusters, 190 of 238 calls inside a cluster (80%). The pure share of the remaining function lines is 12% and the share that can reach a spawn 57%: B1 and B2 took the pure parts out, and what stays is the entangled part stage C is for. Two new leaves: `corpus-text.mjs` (178 lines, 14 declarations; reads no file, process or event; imports the OS module and one constant from `publish-command.mjs`) and `decision-corpus.mjs` (1,927 lines, 111 declarations; reads files and git's file listing, writes nothing, records no event). 191 of the 483 catalogue entries moved with them (`tests/mutations/plugin/scripts/corpus-text.mjs.json`, `decision-corpus.mjs.json`). Four shipped scripts (`adr-context`, `adr-state`, `corpus-probe`, `work-next`) import the corpus reader and the text functions directly now; `adr-context` and `adr-state` no longer import `lifecycle.mjs` at all, so a change to what the hooks say no longer selects them.

After B3 (2026-10-10, re-measured the same way): `lifecycle.mjs` 1,792 lines (from 7,591 at the baseline, 4,466 after B2), 46 top-level functions (from 146), 28 exported (from 70), 7 clusters, 47 of 55 calls inside a cluster. What stays is the session side and the dispatcher: the orientation and its notes, the sweeps, the ready-task lines, the shadow-install and stale-version notices, `recordHookEvent`, `deliver`, `handleHook` and `main`. Eight new files, in dependency order and with no cycle (the generator refuses a module that needs a later one or one left in `lifecycle.mjs`): `plugin-root.mjs` (7), `hook-queue.mjs` (12; the one piece of module state the rules share), `tree-facts.mjs` (282; what git and the filesystem say), `check-command.mjs` (337; which command is the project's check), `check-ledger.mjs` (557; what the ledgers say was checked), `artifact-pass.mjs` (641), `completion-rules.mjs` (572) and `publish-verdict.mjs` (384). The call graph of the 195 top-level declarations had one cycle (`listStatus` and `commandStatus`, which moved together); the partition followed it.

After B4 (2026-10-10, re-measured the same way): `lifecycle.mjs` 571 lines (from 7,591 at the baseline, 1,792 after B3), 8 top-level functions (from 46), 5 exported, 2 clusters. What stays is the entry and the dispatcher: `handleHook`, `deliver`, `main`, `readStdin`, the output flush and the slow-hook note. Seven new files, in dependency order with no cycle: `project-config.mjs` (90), `housekeeping.mjs` (144), `ready-lines.mjs` (334), `session-notes.mjs` (285), `install-notices.mjs` (192), `session-orientation.mjs` (144) and `hook-record.mjs` (126). Eighteen files in all now hold what `lifecycle.mjs` held (`publish-command`, `corpus-text`, `decision-corpus` and the eight of B3 beside these), 7,368 lines between them.

After D (2026-10-10): `lifecycle.mjs` 230 lines (from 7,591 at the baseline, 571 after B4). It holds the entry (`main`, `readStdin`), the answer's composition (`deliver`, the output flush and the slow-hook note) and `handleHook`, which now does the cross-cutting work every event gets (the skill count, recording the event, importing the pass's verdicts, the late-baseline note, the reviewer state check) and then looks the event up in a table. Five files hold the rules, one per family of events: `on-session-start.mjs` (79), `on-session-end.mjs` (60; PreCompact and SessionEnd), `on-subagent-start.mjs` (13), `on-pre-tool-use.mjs` (60) and `on-turn-end.mjs` (16; Stop, SubagentStop and TaskCompleted). The table is a `Map`, so an event name such as `constructor` finds nothing. The output state that `emitJson` and `deliver` shared (`pendingOutput`) moved to `hook-queue.mjs` beside the queued actions, behind `emitJson`, `peekOutput` and `takeOutput`; it is the only module state the rules share.

After C (2026-10-10): two judges are functions of their facts, each split into a gatherer and a judgement. `publishVerdict` (rule P, the only refusal that reads a ledger) is `publishJudgement(publishFacts(...), request)`; the facts are read lazily and once, in the order the judgement asks, so a decision that stops early reads no more than before. `completionRules` (R1, R2, R4 and the completion claim) is `completionJudgement(completionFacts(...), input)`, and its wrapper records the claim and queues the actions in the old order. The three sentence builders that read the project to name its check (`runTheCheckSentence`) now take that sentence as an argument; `uncheckedCommitsReason` keeps its exported signature as a wrapper. `scripts/effect-classes.mjs` follows every call a function makes through the plugin's modules and names the first file read, process, clock, environment or output it reaches; `tests/pure-judges.test.mjs` shows it answering on code that does and holds twelve functions, the two judgements among them, to "pure". Two decision-table tests walk the judgements over their facts (13,824 combinations for rule P, 10,000 or more for the turn end) and check the properties a refusal or an answer must have, each shown failing on a judgement that breaks it; 10 catalogue mutants (one per condition of the refusal, four on the turn end) are killed by them.

- [x] A (2026-10-10). Golden transcripts: scripted payloads through the real `node lifecycle.mjs` against fixture repositories in a hermetic environment (own home, temp, plugin data, git config; time, ids, paths and load normalised), stdout, stderr, exit and the session, pass and check ledgers stored. First slice: orientation (startup, again, resume, compact, clear), the publish classifier (34 command forms, deny / advise / silent), full and fast passes with a change after each, writes and turn ends, subagents, tasks, compaction, a skill call and an edit to a record. Second slice, the net under stage B3: `qh-check` itself (a red check and what the next commit hears, a red fast check, a green full check, the same tree twice, a change to a prose file alone, a config that is not valid JSON, and the check ledger rows each leaves), the ADR task readiness lines (an Accepted record with a ready task and an evidenced one, a Proposed record's task, and the lines said again after a compaction and a task edit), and the artifact gates (a malformed record and a fuller one, gated at the write and at the turn end, with the pass ledger). Eight scenarios, 8 mutants (wording and logic) all killed. Recorded on POSIX; Windows skips with the reason named. **Left in A:** a Windows run of the goldens (CI only), and the events written by gates that run outside this file (`adr-verify`, `adr-next`), which are those gates' own records.
- [x] B1 (done in the working tree 2026-10-10; unreleased, a pure move). The publish-command classifier moved unchanged to `plugin/scripts/publish-command.mjs`: 36 functions and 52 constants that read a command's text and nothing else (clusters 5 and 6 less `publishUnchecked`, which reads the event log and spawns; cluster 12), chosen by closure over callees so that nothing impure came with them, and generated from the AST rather than cut by hand. The goldens replay byte-identical; `tests/publish-command.test.mjs`, `shell-words.test.mjs` and the rest of the fast list pass; 136 of 619 catalogue entries moved with it (`tests/mutations/plugin/scripts/publish-command.mjs.json`, one per source) and a sample of ten, spread across it, were killed against the moved code. Two comment blocks that sat apart from their declarations were moved by hand. Callers use named imports; there is no facade, because a re-export only a test reads is what knip's production mode refuses. **Not moved, and why:** the test-work reader (cluster 9: it feeds the completion claim, a different concern) and the prose and config readers (11), which are small and wait for B2; the 26 ADR `Governs:` headers that name `lifecycle.mjs` were left as they are (records are history), so `adr-context` does not yet name `publish-command.mjs`. **Release:** the readers hash changes with any move, so a release needs a new outside run (CLAUDE.md section 18).
- [x] B2 (done in the working tree 2026-10-10; unreleased, a pure move). Corpus text and quoting moved to `plugin/scripts/corpus-text.mjs` (the quoting, code-span, path and command functions and `scrubber`), and the decision-corpus reader (cluster 0: record identity, status and edge reading, frozen archives, `adrCorpus`, `decisionContext`, with the helpers they need) to `plugin/scripts/decision-corpus.mjs`; both generated from the AST (closure over callees, imports derived, an atomic mrw plan) and unchanged in content. The goldens replay byte-identical, the lifecycle, golden and 22 other touched test files pass, `--stale` is clean, and 13 catalogue mutants spread over both modules were killed against the moved code. **What the generator missed, found by the gate:** a namespace import (`import * as lifecycle`) in four tests, an import written inside a test string, and a line shifted by one in a file holding a U+2028 (acorn counts it as a line break, mrw does not; fixed in the generator and the line repaired). Four locked test bodies changed by one import path each (three in `tests/lifecycle.test.mjs`, one in `tests/corpus-shapes.test.mjs`, locked by four task files in two records); each diff was read, and the five task files were re-locked with `adr-verify --relock --replace-hashes` (tool-written entries), after which every record passes its lint. Four other test files that read the corpus through the namespace import now point it at the new module and keep the local name, so no body changed. Stale cross-references in `plugin/lib/record.py`, `adr-lint`, `adr-next` and `adr-state` now name the new modules. **Left out:** the test-work reader (cluster 9) and the prose and config readers (cluster 11), which are small and wait for B3; `walk`, `outsideRoot` and `inside`, small JSON and path helpers that landed in `decision-corpus.mjs` because records use them and are imported back by `lifecycle.mjs` (a home of their own when B3 shows who else needs them). **Release:** the readers hash changed again, so a release needs one new outside run (CLAUDE.md section 18).
- [x] B3 (done in the working tree 2026-10-10; unreleased, a move with a few hand edits). The entangled clusters moved into the eight files above, by explicit member lists checked against the call graph; constants went to the earliest module that uses them. **Hand edits, all found by a test and each with its own mutant or a registration:** (1) `artifact-pass.mjs` starts the detached pass from `new URL('./lifecycle.mjs', import.meta.url)`; moved verbatim it started itself and no pass ever ran, which `tests/artifact-pass-behind.test.mjs` caught after 70 s (the class: a moved line that names its own file; the three `import.meta.url` uses in the moved code were audited, the other two name a sibling and the plugin root and are unchanged); (2) nine helpers that take a `log` became exports because modules now share them, and `tests/evidence-flip.test.mjs` made each say why a torn log cannot flatter it; (3) the same test lists the four new files that name the log reader; (4) tests that read a function's source or import it from the old file in a string or as a namespace: `hook-work`, `lifecycle.test` (a helper), `publish-command.test` (a constant), four namespace importers (the local name stays and an object merges the modules, so no body changed). **Locks:** thirteen task files were re-locked with `adr-verify --relock --replace-hashes` (tool-written entries) because locked test bodies in `observed-events`, `publish-hook` and `gate-rules` changed by an import path or a file name; each diff was read before. Goldens (eight scenarios) replay byte-identical; 19 catalogue mutants spread over the six modules that have entries were killed with the verdict cache off; `--stale` clean. **Left out:** `walk`, `outsideRoot`, `inside` and `GIT_LISTING_BUFFER` still live in `decision-corpus.mjs` and are imported by four of the new files (a small leaf of their own is the honest home, and needs one more regeneration); the session side and dispatcher stay for D; `pendingOutput` and `cachedPython` are module state that stays with their users until C. **Release:** the readers hash changed, so a release needs one new outside run (CLAUDE.md section 18).
- [x] B4 (done in the working tree 2026-10-10; unreleased, a pure move with one widened guard). The session side leaves `lifecycle.mjs`: the project config reader, the sweeps, the ready-task lines with the interpreter probe, the session notes and mention markers, the shadow-install and stale-version notices, the orientation and the decision context, and the hook-to-event recorder. Generated and applied as in B3; the call graph again had no cycle and the generator found none between the new files. Hand edits: two namespace-importing tests gained a module in their merged object; `tests/evidence-flip.test.mjs` registers `hook-record.mjs` as a file that names the log reader; the one-spawn guard in `tests/lifecycle.test.mjs` ("a bin/ gate is spawned in a way Windows can actually run") counted `spawnSync(tool` in `lifecycle.mjs` alone and would have read zero after the move; it now counts across every script, which also closes the gap that a second spawn in any other file went unseen (its task file was re-locked after the diff was read). 14 catalogue mutants over the seven new files were killed with the verdict cache off; the goldens replay byte-identical; `--stale` is clean. No file in the new modules names itself (`import.meta` and `process.argv[1]` do not occur; the one remaining mention of `lifecycle.mjs` checks that an installed version has an entry script). **Release:** unchanged; the readers hash moved again, one outside run covers the whole of stage B.
- [x] C (done in the working tree 2026-10-10; unreleased, and it changes behaviour in one place). `facts` at the judges: see the paragraph above. **Found by the table, fixed:** when a committed tree had no check and the session log was cut, R1 opened with "whether `qh-check` succeeded on it cannot be shown" and then said "what no `qh-check` has passed on is the tree at HEAD" in the same message: an accusation in the vocabulary of an observation beside its own retraction (ADR-005). The held-commit sentence now says "whether a `qh-check` passed on the tree at HEAD cannot be shown" when the log is cut; a catalogue mutant keeps it. This is a plugin behaviour change, so the Codex review of section 12 is due before a tag. **Left out, and why:** `unobservableWrites` is not pure (it resolves a recorded path against the disk to see whether it lay outside the repository), so `completionFacts` calls it and the judgement receives its answer; making it a fact that arrives already resolved is the next step for that rule. `reviewChangedState` (R3), `recordHookEvent` and `deliver` are not split: R3 writes as it reads, and the other two are the recorders and the composer, not judges. A judgement that throws now queues nothing where an exception in R2 used to leave R1 already queued; the judgements build strings from plain data, and silence is the weaker direction, but it is a difference. **Review (section 12):** a different-lineage review (gpt-6.1-sol, high effort, read-only, scoped to `git diff 89c2578d..HEAD -- plugin/`, covering the whole of stage B to D as well as this stage) found no blocker and confirmed that the import graph has no cycle, every changed module parses and the dispatcher branches match the baseline. Two findings, both fixed: the facts were not read at most once (`sentence` was read again by each of R1, R2 and R4, as it was before the split) and `uncheckedCommitsReason` had changed what its first argument means while two locked test lines still passed a directory. The read-once helper is now one module, `lazily.mjs`, used by both fact builders; the two test lines pass a sentence and their task was re-locked after the diff was read.
- [x] D (done in the working tree 2026-10-10; unreleased). Rules as files, `lifecycle.mjs` a dispatcher: see the paragraph above. The five rule files are the branches of the old `handleHook` moved verbatim (two lines of dedent and the dropped trailing `return`), so the goldens replay byte-identical. Hand work: the catalogue entries that named text inside `handleHook` were re-targeted to the file that holds it (15 entries, the indentation of each `from` and `to` adjusted by the same two spaces) and three entries were added for the table row, the turn-end artifact request and the output state; 19 mutants over the new files were killed with the verdict cache off. `tests/evidence-flip.test.mjs` had one entry for `handleHook` that was driven through PreCompact and SessionEnd only; it is now `onSessionEnd`, and `onSessionStart`, whose two log reads the old entry had covered by omission, is registered as not executed with the reason read from the code (the compaction note is served only from a log read whole; the arming note reads `awaitingArming`, where a lost line can only make it appear). Orphaned comment blocks that sat above code `lifecycle.mjs` no longer holds were moved to the files that hold the code, checked by comparing the syntax trees before and after (comments are the only difference). **Left out:** the preamble of `handleHook` is still one function; `deliver` composes by shape and could be a rule of its own; and the skill count (ADR-084) stays inline because it must run before the event is recorded. Stage C (judges as functions of facts) is the next change to what the code does rather than where it sits.
- [x] Re-open the section 374 candidates (2026-10-10, after D). The declined selector, re-measured: a change to `lifecycle.mjs` is no longer a change to the whole plugin, and the share of test files that can reach a shipped script by name fell from about 99% of 193 to 63% of 199 (125 files; a scratch pass over `plugin/scripts` and `tests`, a script name found in a file counted as an edge, so comments and strings make it an upper bound; 50 test files name `lifecycle.mjs` themselves, 12 name `qh-check.mjs`, and every module that `qh-check.mjs` imports inherits the 12 plus their closures). That is the reach, not the selection: 86 of the last 100 commits widened to the full suite for reasons that have nothing to do with `lifecycle.mjs` (docs, the catalogue, config, hooks), so the median stays 100% and **the selector stays declined**. Its lever is still the docs lane (68 of 100 commits). (a), (c), (d) and (e) are not re-opened: their own conditions have not occurred, and the owner parked them behind the shape of these two files, which section 376 is still changing; they are looked at again after it.
- [x] The `Governs:` headers (2026-10-10, after the split; CLAUDE.md section 1 says a moved file takes its header with it, and the first plan left them as history). Measured first: `adr-context` answered for none of the fourteen moved modules it was asked about (`node plugin/scripts/adr-context.mjs plugin/scripts/<module>.mjs`, 0 records each), so the hook that hands a session the decisions governing the file it is about to edit said nothing for the code that used to be in `lifecycle.mjs`. Nineteen Accepted records that named `lifecycle.mjs` now also name the modules that hold the code each of them is about (chosen from what the record decides, not from its number: the corpus-reading records get `decision-corpus.mjs`, the publish records `publish-verdict.mjs` and `publish-command.mjs`, the claim and unchecked-work records `completion-rules.mjs`, and so on; ADR-060, which governs the hook program as a whole, gets the recorder, the queue, the five rule files and the ledger readers). Only the header line of each changed; every record passes `adr-lint`. After: 1 to 5 records answer for each of the modules with a subject. Still ungoverned, because no record is about them: `corpus-text.mjs`, `project-config.mjs`, `housekeeping.mjs`, and `prose-hint.mjs` (ADR-094 declares its paths in its tasks).
- [x] What the split costs an adopter, measured (2026-10-10; a lead from an outside run, whose adr-next timings were taken under a load of 8 to 35 and name a Python script the split did not touch). One hook process per event, `lifecycle.mjs` at `v3.8.17` against HEAD, a hermetic home and a fresh repository, 15 runs of each, alternating, median, on a machine at a load of 12 to 13 on 10 cores (so the difference is the figure and the absolutes are not): PreToolUse 29 ms before, 33 ms after; Stop 113 and 114 ms; SessionStart 85 and 88 ms. About 3 to 4 ms more per event, from loading about thirty modules instead of one; the most frequent event pays the most in proportion (about 12%) and the least in absolute terms. Not a finding. Re-open when: a hook event costs an adopter more than the slow-hook note's threshold. The outside runs on three other corpora (an ADR corpus of 20 records, a PHP monolith of 17, a monorepo of 94) read every verdict as before: 26, 23 and 96 compared, none changed, the readers hash the only line of the diff on the first and third, and the second a PARTIAL look it always printed; two other peers could not run foreign code under their own permission rules and were not asked to work around it.
- [x] Named as left in stage C, looked at again: `unobservableWrites` is a gatherer, not a judge (it resolves a recorded path against the disk), and the judgement already receives its answer, so `completionJudgement` is pure and held to it; making the helper pure too would split path canonicalisation from the stat and change no verdict. `reviewChangedState` (R3) writes as it reads, `recordHookEvent` is the recorder and `deliver` the composer: each is a recorder by role and has nothing to judge. None is split; the reason is the role, not the effort.

Left out on purpose: the evidence ledger as an agent-neutral protocol and the shell-intent classifier as a library with a differential suite against real shells (the two candidates for a separate project); a resident process; retiring the text classifier for git's own hooks (ADR-066). Unknown until measured: how much of the 41% is an injected seam the effect pass counted as a spawn; Windows behaviour of any moved path-handling function (CI only).

## 376. CLOSED 2026-10-12 (was OPEN 2026-10-10) — `qh-check.mjs`: one 250-line function that decides, runs, times and records

Archived: [backlog-archive/BACKLOG-301-400.md](backlog-archive/BACKLOG-301-400.md)

## 377. CLOSED 2026-10-12 (was OPEN 2026-10-10) — Two leads not yet confirmed, and an advisory nobody acted on

Archived: [backlog-archive/BACKLOG-301-400.md](backlog-archive/BACKLOG-301-400.md)

## 378. OPEN 2026-10-11 — What the hooks and the gate repeat, measured; three items ADR-095 does not take

Measured 2026-10-11 with a preload that counts every child process and file read of one real hook event (method: ADR-095 T1), against a fresh clone of this repository (about 100 records) on a machine at a load of 4 to 6 on 10 cores. SessionStart 1.2 to 1.4 s, of which six serial `adr-next` runs are 1.0 to 1.4 s (118 to 1,104 ms each) and repeat unchanged on the second start; Stop starts 13 `git` children (106 to 258 ms), four of them the same `rev-parse --show-toplevel`; PreToolUse is 29 to 37 ms with no child; the first PreToolUse Edit of a governed path is 347 ms (the decision corpus, 300 reads, 4.5 MiB) and the second 79 ms; `qh-check` with a check that exits at once is about 105 ms with two `git` children, so its cost is the project's check, and this repository's check ran about a dozen times in one session at 260 to 330 s each. Node's compile cache gives nothing at this size. The governing record is ADR-095 (Proposed); T1 to T4 take the tool, the ready-line cache, the identity memo and the gate's concurrency. Left out, with the number:
- **Run the misses of the ready-line cache concurrently.** The slowest of the six `adr-next` runs is 1,104 ms of 1,370, so the wall time falls by about 0.3 s, and only on a miss. Re-open when: a corpus is found where the misses are evenly sized and the sum is above a second. Closed 2026-10-12 by ADR-099: the cache is deleted, so there are no misses to run.
- **Read the decision corpus once per session, not per governed path.** The first Edit costs 347 ms and the next 79 ms. Re-open when: the cost is seen on a second governed path in one session.
- **A per-test verdict cache for the repository's own gate.** The reach of a change here fell from about 99% to 63% of the test files after the split (an upper bound), but 86 of the last 100 commits widen to the whole suite for reasons other than reach, and a reused pass on an input nobody listed is the failure this project exists to demonstrate the absence of. Re-open when: a per-test read-set exists (coverage per test, with the files, the environment and the child scripts a test touches) and a mutant shows a wrong reuse is caught.
- **ADR-095 delivered, 2026-10-11 (all five tasks).** T1 `scripts/hook-cost.mjs` (the tool every figure here is reproduced with); T2 the ready-task lines from a cache keyed by the content of the whole corpus directory (a start in an unchanged corpus: 1.09 s and 10 children to 103 to 109 ms and 3 to 4 children; found at execution: the key had to cover other records' tasks, the sibling records, which files git lists and today's date, because the gate reads them all); T3 the repository's identity asked once per process (turn-end event 16 children to 11; found by the regression run: two result shapes under one memo key); T5 `git status -uall` once per process for at most two seconds, only where `lifecycle.mjs main` switches it on (turn-end event 9 children; added after three outside runs measured 125 to 400 ms for the three calls; alternative (e) narrowed with the owner's yes); T4 the gate prints `selftest: concurrency N (cores C, load L)` and takes `QH_SELFTEST_CONCURRENCY`. Four outside runs (three macOS corpora, one Windows) confirmed the counts on their own repositories.
- **T4's measurement, and the rule it declined (2026-10-11).** The whole gate at nine, five and three test files at once: 268, 282 and 392 s, one run each, under a load of 5 to 14 from other sessions. Five costs about 5% (inside the noise of one run each) and three about 46%, so no setting was faster and no automatic rule was shipped. The reading that remains is about neighbours and not about speed: five at once leaves about four of ten cores for the other sessions at a cost inside the noise. Re-open when: the owner wants the gate to yield cores under load (a rule `load >= 0.6 * cores => ceil(cores / 2)` is one line in `selftest.sh`), or a second measurement on a quiet machine shows five at once is not slower.
- **Left by ADR-095, with the evidence.** `hook-cost` flags the two `write-tree` calls in an observation as a repeat; they are not (the second reads the temporary index after `add -A`, a different environment the tool cannot see). The first PreToolUse Edit of a governed path reads the decision corpus (299 reads, 4.5 MiB, 216 to 347 ms) and the next one does not: a once-per-session cost that a cache keyed like T2's would remove. Both are unmeasured on an outside corpus.
- **A finding about §377, from the same arc.** The sign-off grammar of `adr-next` read the executing session's own notes as a stop three times in one day, on the words `Stop` (the event's name) and `cannot`, each time withholding `done` until the note was re-signed in other words. That is lead 1 of the update above, now with three first-hand instances: the cost is real and small, the principle (a negative word in the note's own words is a stop) stands, and the gap is that nothing says which word did it before the task shows `stopped` (the stop line does name it; the author had to run `adr-next` to see it). Re-open when: a note that states a pass is stopped by a word inside a quote the exemptions should cover.
- **Release review of ADR-095 (section 12), 2026-10-11: the ready-line cache (T2) is withdrawn, the two memos fixed.** A different-lineage review (gpt-6.1-sol, high effort, read-only, scoped to `git diff v3.8.19..HEAD -- plugin/`) found six blockers and two should-fix, each verified by reading or by a probe. All six blockers were in the cache or the identity memo, and all were fail-open. (1) The gate reads files its Tests tables name, anywhere in the repository (the test locks), and the project's `.quality-harness.json` check; neither was in the key. (2) An empty directory beside the tasks changes the gate's answer (a duplicate task id) and was invisible to the key. (3) Git's object format decides whether an old evidence row counts as done and was not in the key (ADR-095 Decision 2 had said it must be). (4) A gate installed as a link loads the library beside its real path, which the key did not hash. (5) The result of a run was stored under the snapshot taken before it, so a file changed during the run filed a newer answer under the older key. (6) The identity memo was keyed by the spelling of a directory, so a link repointed at another repository between two asks returned the old root and the publish check read the wrong repository. Of the two should-fix, one is accepted (the status memo can miss an untracked file created by a concurrent process within its two seconds, advisory readers only, as the owner's yes for T5 said) and one is fixed (the lifetime used the wall clock, so a clock set back kept an answer alive). Done: the cache, its test and its catalogue are removed and the three callers restored; the identity memo is keyed by the resolved directory; the status lifetime uses a monotonic clock; each has a regression test shown failing under a mutant. The lesson is about the class: a cache keyed on what its author enumerated is only as sound as the enumeration, and a gate whose reads are data-dependent (it reads whatever a table names) cannot be enumerated.
- **What would make the ready-line cache sound (re-open when the owner wants the ~1 s per start back).** Key it by what the gate actually read, recorded by tracing it: run `adr-next` under a wrapper that records every file it opens (and a hash of each), every directory it lists (and the sorted names), every path it stats (existence and kind) and every git command it runs (and a hash of the output), plus the interpreter version and the environment variables it can see; store that manifest with the answer; on a lookup re-check the manifest (re-hash, re-list, re-stat, re-run the git commands, about 20 ms) and only a manifest that still holds is a hit; store nothing if a file changed during the run (compare its signature before and after). That closes (1) to (5) by construction, because nothing is enumerated by hand. Measured value to beat: the second start 1.09 s to about 105 ms on a corpus of 100 records, 0.4 to 2.8 s saved on the four outside corpora, about 1.9 s on the Windows one. The cost is a Python wrapper, a manifest checker and a test for each kind of dependency, with a mutant per kind.
- **ADR-095 T6 delivered, 2026-10-11: the ready-task cache, keyed by what the gate read.** `plugin/lib/trace_run.py` runs `adr-next` under a recorder (an audit hook for opens, listings and subprocesses; wrappers on `os.stat`, `os.lstat` and the `os.path` predicates; every imported module's source); `plugin/scripts/ready-cache.mjs` stores the answer with that manifest and reuses it only while every entry holds. Measured on a fresh clone of this repository at a load of 4.8 on 10 cores: first SessionStart 1,405 ms with 33 children (6 of them the gate), second 117 ms with 10 children (0 of them the gate). The manifest of one real run over this record's task directory holds 16 files, 3 listings, 31 stat-ed paths and 3 git commands, and 92 standard-library files left out. 20 catalogue entries, one per kind of dependency and per wiring site. Found while proving it: (1) the mutation runner's environment (`PYTHONPYCACHEPREFIX`) moves bytecode out of `__pycache__`, so the recorder logged the standard library's compiled copies as dependencies and the recorder test failed in the campaign and not in a shell; the manifest now names the prefix and the cache ignores it; (2) a statted path in the same directory as an imported module was answered for by the import system's own listing, so the statted-kind re-check survived its mutant until the test's absent paths moved to a directory nothing lists; (3) a missing file the gate tries to open is a dependency on its absence, or no run is ever storable. Left: the `os.path` predicate wrappers are redundant on POSIX (the `os.stat` wrapper sees them) and may be what records `os.path.exists` on an interpreter with a C fast path; no mutant tells them apart here, so that is UNPROVEN until a Windows run says. Re-open when: a Windows run of `hook-cost.mjs SessionStart` shows the second start still runs the gate.
- **ADR-095 T6, two outside reviews of the same tree, 2026-10-11: what was fixed and what was left.** A Windows run (a Windows peer, Python 3.14) refuted the cache: the second start ran the gate again for every task directory. Cause, confirmed against CPython's source and the peer's probe: on Windows the `subprocess.Popen` audit event carries the command already joined into one string, so the recorder wrote each command as a list of single characters, the re-check could not start them, and every lookup missed in silence. Fixed: a command is recorded where it is asked for (`Popen.__init__`, the list or the line the gate passed), a line is run again through the shell, a shape that cannot be run again is recorded as such and the answer is not kept, and a recorded command that cannot be started is a miss that says so. A different-lineage review (gpt-6.1-sol, high) of v3.8.19..HEAD found nine more; fixed now: a stat records a file's size and modification time and not only its kind; the entries of a scanned directory are recorded (an entry answers is_dir() without another call); an environment variable the gate read is a dependency (name and value), a gate that reads the whole environment is not cached and says why; `os.system` is recorded as a line and `exec`, `spawn` and `fork` as not repeatable; a manifest that cannot be written no longer changes the gate's exit status or output, and a gate that fails under the recorder is answered by a plain run; the status memo is skipped for a path with a `..` component (an invalid path was reported as a clean tree). Left, each with a reason: (1) a command's output is taken after the gate's run, so a change inside that window is not seen (a window of milliseconds; closing it needs the output captured at the moment the child ran); (2) a file restored to its old size and modification time passes both signatures (needs a deliberate utimes), and the hash of a file is kept for the life of one hook process; (3) files under the interpreter's prefixes and in `__pycache__` are never dependencies, so reading one as data is not noticed (the interpreter's own signature is checked); (4) the identity memo keeps its answer if `GIT_WORK_TREE` and the like change inside one process (a hook process does not change them). Re-open when: a Windows run of `hook-cost.mjs SessionStart` still shows the gate in the second start, or a gate is found that does any of (1) to (4).
- **A lead from the Windows run of ADR-095 T6 (2026-10-11): the second start's per-directory `git ls-files` re-checks are the largest part of what remains.** On Windows the second SessionStart is 512 ms with 10 children and the gate not started; six of the children are one `ls-files` per task directory at about 30 ms each, about 180 ms of it. The same command is recorded once per directory because the gate asks for each directory separately. One `git ls-files` over the corpus root, answered per directory from the one output, would replace them; it is not safe to do without the recorder naming what each output depends on, which a combined command would hide. Measured on that host only; not measured here. Re-open when: a second start is the cost someone reports. Found in the same run, fixed: a variable's name is matched without regard to case on Windows (the interpreter reads `ComSpec` where the process lists `COMSPEC`, and a spread copy of the environment is a plain object), in the key and in the check.
- **Outside runs of the 3.8.20 candidate (cffeac6e), 2026-10-11: no reader said anything different; two leads.** Three corpus probes from v3.8.19 to cffeac6e (a Windows web repository with no records, a macOS web repository with no records, a macOS PHP monolith with 17 records and 24 tasks) showed only the readers digest moving, with no verdict changes and nothing that could not run. None of them exercises the ready-task cache, since the probe does not run SessionStart; the cache is covered by the Windows peer's `hook-cost` run (second start 489 ms, no gate started). Lead 1: on a repository whose only design document is a dated spec from another tool's workflow, `adr-lint` reads it as an undecided record and fails it on "Alternatives Considered has no entries"; the same in both versions. Whether a document with no `Status` header is a record at all is a reader question for the next record. Lead 2: a Popen that raises in its own `__init__` (CPython on Windows cannot build a command line from bytes that are not text) is recorded as a command that cannot be repeated, so that answer is not kept; that is the conservative reading, chosen on purpose. Re-open when: a corpus whose design documents are not ADRs is reported as noisy.
- **Deferred by ADR-096 (turn-end findings reach the agent), 2026-10-12.** Three items the record leaves for later, each with what would re-open it. (1) A small local decision model as the router at Stop: whether a finding is worth continuing the turn for, which finding first, whether a claim of done is done; it routes and ranks only, never decides pass, fail or UNPROVEN, falls back to the deterministic rule when absent or slow, and logs every decision for an A/B against that rule (the redesign plan's phase 3b; the owner's idea). Re-open when: ADR-096 has a week of session logs to compare against. (2) SubagentStop: its `additionalContext` continues the subagent, not the parent that owns the work; delivering a subagent's findings to the parent needs a PostToolUse hook on the Agent tool. Re-open when: a parent is shown to miss a finding a subagent's work produced. (3) TaskCompleted: the hooks reference read on 2026-10-12 did not settle where its output goes. Re-open when: the reference or a probe says.
- **The verification review of ADR-096's code (gpt-6.1-sol, read-only, 2026-10-12): four fixed, three left with reasons.** Fixed in the same round, each with a test and a killed catalogue entry: a Stop that has continued once now reaches only the user, so a finding that arrives between the two Stops cannot continue the turn again; a finding handed to a subagent's context no longer counts as heard by the main agent (rows carry the recipient); the artifact pass's could-not-start finding is counted per audience like the rest; `turnEnd` is read from the nearest existing directory, as the rules read it, so a deleted working subdirectory keeps `notify`. Left: (1) the late-baseline notice is queued only on the event that observes the late baseline, so when that is a subagent's start it reaches the user and never the main agent (a once-per-session notice; re-open when an adopter misses it); (2) an artifact pass that dies before writing its end is reported with a fresh token each time it is retried, so on an unchanged tree it says "left no end" at every turn end and now continues the turn once each time (it said it at every boundary before ADR-096 too; re-open when a pass is seen dying repeatedly in an adopter's log); (3) under `"turnEnd": "notify"` the could-not-start finding is checked against the agent audience at Stop and so is said to the user at each Stop while the pass cannot start (minor; it is the same message the user saw before ADR-096).
- **The framework comparison (section 369), re-opened 2026-10-11 on the owner's note that the parked comparison had already been in the backlog.** The parked candidates are the ones to take next, in the owner's priority order from section 369: the swallowed-read lint with a shrink-only baseline (d), the gate-control table (e), the stale-entry ratchets (c), the agent listing budget (a). They were parked behind the shape of `lifecycle.mjs` and `qh-check.mjs`, which is now settled. A new record, not this one.
- **Per-file unused names, 2026-10-12: the release scan could not see them; the gate now reads them on every run.** The owner asked whether the static tools at our disposal are used properly, then: "use these all the time, not voluntarily". vulture matches names across the whole program, and knip and orphan-sweep read exports, so an import unused in the file that imports it was invisible to all three: `uvx ruff@0.15.6 check --select F401,F811,F841` over the 24 Python files found 9 (7 in shipped gates), and `npx @biomejs/biome@2.5.12 lint --only=correctness/noUnusedImports --only=correctness/noUnusedVariables` over plugin/, scripts/ and tests/ found 34 (7 in plugin/ and scripts/), on the tree whose pre-release scan had just printed "found nothing". Every one is deleted that no lock pins, but one: `TEST_HASH_REQUIRED_FROM` in adr-lint and adr-next is a re-export that a locked test reads as a module attribute (`tests/test-lock.test.mjs`, ten locks, asserts the gates and `record` answer the same cutover), so it stays, with `noqa: F401` and the reason beside it; the first gate run after deleting it went red on exactly that. `scripts/unused-names.sh` now runs both, pinned, from `selftest.sh` and `dead-code-scan.sh`; a missing tool is UNRUN (exit 3) and fails the gate; every CI job that runs the tests installs the pinned ruff; `tests/unused-names.test.mjs` shows each verdict both ways and its five catalogue mutants are killed. A different-lineage review of the first draft (gpt-6.1-sol, read-only) found five fail-opens, one regression (the re-export above) and one minor, all fixed in the same round, each with a test and a killed catalogue entry: an empty listing or an empty class read as clean; Python with an extension in plugin/bin, nested tests and `.js` were never selected; a path git quotes was skipped; a tool that could not start was counted as a finding instead of UNRUN (a verdict now needs the tool's own clean line or its own count); `python3 -m ruff` of any version was used (now only the pinned one); and the CI wiring assertion accepted the pin inside a comment. One scoped verification of those fixes found two gaps, fixed the same way: a verdict pattern that matched a tool's words anywhere in its output, a file name included, now anchored to the tool's own summary line; and a pin in an inline comment. Left, with reasons: (1) unused parameters, which biome 2.x reports under a separate rule not selected here (1.9.4 counted about 35, mostly uniform hook signatures and test callbacks' `t`): a signature is not dead code. (2) Unused locals inside tests are not read, only their imports: `tests/gate-rules.test.mjs:286` (`elapsed`) sits in a test locked by ADR-075 T2 and ADR-091 T3, and the spawn timeout already bounds what it measured. (3) About 640 biome style findings (506 `useTemplate`): preference, not defects. (4) Not adopted yet: `scripts/hook-cost.mjs` as a CI budget, and a workflow linter (actionlint or zizmor, neither installed here). (5) shellcheck 0.11.0 over the 7 shell scripts: 4 notes (SC2012 twice, SC2016, SC1003), none a defect, and not wired.
- **The third history rewrite, 2026-10-12: an abbreviation of a framework name in a quoted owner note.** The framework comparison entry above quoted the owner's note with an abbreviation of a framework name from the sensitive list (CLAUDE.md §6); the owner chose to reword it and scrub history. `git filter-repo --replace-text` in a fresh clone replaced that one string in every commit (22 rewritten, from the 2026-10-11 ADR-095 commit on); `git log --all -p -i -G` and `git grep -i` over every branch and tag found it nowhere afterwards. The v3.8.20 tag moved from d9015d0d to dc2b3c41 and its release's target with it; v3.8.19 and older were not touched. As in the 2026-10-07 rewrites, shas cited inside that range (the Verification Logs of ADR-095 T6 and ADR-096 T1-T3, and the four 3.8.20 attestations) were left as history, not remapped. A full gate in a fresh clone of the rewritten history passed but for the test in the next entry, which fails the same way on the history before the rewrite. The class is abbreviations too: the pre-commit name scan now includes this one.
- **A lead, 2026-10-12: `reported: a scratch corpus does not pull the record gates` (tests/lifecycle.test.mjs) fails when the checkout itself lives under the temp directory.** Measured in two fresh clones in a session scratchpad under the system temp root, one of the rewritten history and one of the history before it: both fail alone with "Artifact validation failed … expected exactly one owning ADR" where the test expects no artifact verdict for the scratch corpus. The same test passes in a checkout outside the temp root and on every CI runner. Not yet traced: which reader decides "scratch" from a path, and whether it compares against the temp root or the plugin root. CLAUDE.md §8 is the rule it may break; it changes nothing for a checkout outside the temp root.
- **Deferred by ADR-097 and ADR-098, 2026-10-12, with what a cold review found.** (1) Removing the `post-edit-check.sh` PostToolUse hook: its output never reaches the agent (plain PostToolUse stdout, no `hookSpecificOutput`; fired twice in a month here), but the staged-product spec binds it (UC2-S5 and F-33, `@implemented`), ADR-038 T3's evidence names its test, and `spec-verify` accepts only `@draft`, `@spec` and `@implemented`, so no fact can be retired. Consumers found by the review and `git grep`: `tests/package.test.mjs:942`, `tests/staged-product.test.mjs:124` and `:659`, `tests/lifecycle.test.mjs:439` (the ADR-068 T2 lock "every hook script the runner accepts has its arguments wired"), `tests/hook-work.test.mjs:49`, `tests/gate-rules.test.mjs:1331-1368` (a mutation-runner fixture), `tests/mutation-cache-merge.test.mjs:207,218`, and three `tests/post-edit-check.test.mjs` fences in `tests/mutations/plugin/scripts/workflow-parse.mjs.json`. Re-open: a spec-fact retirement tag, then one task with all of these. (2) ADR-098's bare-mention advice left to an armed git hook fails open two ways: a static shell spelling such as `unset G"I"T_CONFIG_COUNT; sh release.sh # commit` disables the hook while the classifier returns `invoked: null` and no raw-text predicate matches (bash does remove the variable, and the injection depends on it, `plugin/scripts/publish-verdict.mjs:121`); and under `"publish": "warn"` git's hook delivers no warning either (`plugin/scripts/publish-hook.mjs:93` discards non-denying verdicts), so suppression turns a warning into silence. Re-open: a predicate that reads the command as the shell does, with both counterexamples as tests (CLAUDE.md §16). (3) A correction: the commit message of 863b82f2 (the 2026-10-12 history rewrite) says the ADR-068 T2 relock "re-ran the task's fence". It did not: `adr-verify --relock --replace-hashes` records new lock hashes and exits (`plugin/bin/adr-verify` near line 3154; its rows read `ms:0`). The relocked test passed in the full gate of the rewritten clone, which is the evidence; the message overstates it.
- **Deferred by ADR-099 (SessionStart does not list ready tasks), 2026-10-12.** The owner accepted the record on the condition that the reversed records are retired rather than reconciled in place; the adr-retire stage retires whole decision units only, so ADR-099 T2 archives ADR-040, ADR-046 and ADR-095 whole as `governing`. Two gaps it names: (1) a tag that retires a spec fact, so the ADR-040 spec's F-1 bindings (UC1-S1 to S3, `@implemented`) can be closed rather than left naming the tests T1 deletes (`spec-verify` accepts only `@draft`, `@spec` and `@implemented`; the same gap holds ADR-097's post-edit hook above). Re-open: with the post-edit hook, as one retirement-tag record. (2) Retiring part of a record: a single task (ADR-095 T6, ADR-040 T1, ADR-046 T3 and T5) or a single clause (ADR-094 Decision 2's member "the ADR tasks in flight"); there is no "superseded in part" effect and a frozen file cannot carry a note, so the partial reversal is said only in ADR-099's `Invalidates:` and the archive rows' Reason. Re-open when: a second record needs to reverse part of a still-governing one.
- **Two leads from executing ADR-097 to ADR-099, 2026-10-12.** (1) The artifact pass says `UNPROVEN: could not classify <path>` for every path a commit deletes; a deleted file has nothing to validate, so the line is noise on every removal (seen on each ADR-097 deletion). (2) After a subagent fixed a record, the parent's next PreToolUse (a read-only `git status` and `mrw read`) was handed four "Artifact validation failed" blocks for ADR-099, each the subagent's mid-edit state (a README listing T3, T5 and T6 that no longer existed; two different segment counts for the same fence), while `adr-lint` on the tree at that moment exited 0. A finding judged on a tree that has since changed reached the agent as current. Not yet traced: whether the pending-until-said state of ADR-096 replays findings recorded under a subagent's events without re-checking the tree they were judged on.
- **Both leads above fixed, 2026-10-12.** (1) `facts-gate-dispatch.sh` passes a missing path whose name has an extension other than `.md` in silence, as it passes an existing one: only Markdown can be a record. A missing `.md` in any case, and a name with no extension (it may have been a directory), keep their could-not-look; `tests/dispatch-streams.test.mjs` holds both directions, two catalogue mutants killed. (2) `importPassVerdicts` no longer says a finding about bytes a later pass in the same ledger gated as different bytes; a later verdict whose bytes are unknown supersedes nothing. Comparing against the file's current bytes was not taken: the import cannot know a newer pass will run, and the locked fixtures write synthetic blobs. `tests/artifact-pass-behind.test.mjs` holds both directions, two catalogue mutants killed. Left: a finding about bytes that changed after the last pass, with no newer pass yet, is still said until the next boundary gates the new bytes.
- **Release review of v3.8.21..17066d76 (section 12), 2026-10-12: four blocking, two advisory, all fixed in the same round.** A different-lineage review (gpt-6.1-sol, high, read-only, launched through the plugin's own `host-review.mjs --prompt-file`) of the launcher, the two artifact-gate fixes above and ADR-098's review contract. Each finding was read against source before it was fixed, and each fix has a test that went red first and a killed catalogue entry. (1) The superseded-finding rule hid a finding that was current again when a file returned to the finding's bytes after a later pass gated other bytes; a finding is now superseded only while the file does not hold its bytes. (2) The deleted-path rule passed in silence any missing name with a dot, so a deleted directory such as `decisions.v1` holding records said nothing; it is now silent only when a history base (`QUALITY_HARNESS_HISTORY_BASES`, else HEAD) holds the path as a file (`git cat-file -t` is `blob`), and the 2026-09-10 assertion that a never-tracked missing `.js` is UNPROVEN is restored. (3) The launcher's `exec --help` probe had no hard kill, so a binary that ignores SIGTERM could hang it; it is killed with SIGKILL at its deadline. (4) Any SIGKILL was reported as "killed at its budget of 600 s"; only the deadline (`ETIMEDOUT`) is the budget now, and another signal is named. (5) A temporary directory that could not be made threw out of the result contract (exit 1, not 2); it is now a reason, and a failed removal is said on stderr. (6) The review skill still told Pass 1 to "output critical/high only"; the old severity words are gone from every review surface and a test holds it. The reviewer's own run of the four test files was refused temporary directories by its sandbox (7 passed, 19 failed), so its test evidence is limited to the contract tests; the fixes here were run locally.
- **ADR-097's ready-line deferral landed in ADR-099, 2026-10-12.** ADR-097 deferred "the SessionStart ready lines and the ADR-095 cache" here (`ADR-097:102`); ADR-099 T1 removed both (`ready-cache.mjs`, `trace_run.py`, the readiness half of `ready-lines.mjs`), and the spec-retirement tag it could not supply is item (1) of the ADR-099 entry above.
- **Release review of 271aa9e9..c1218079 (section 12), 2026-10-12: one blocking finding, fixed; its verification found two more, fixed; no further round.** A different-lineage review (gpt-6.1-sol, high, read-only, through `host-review.mjs --prompt-file`) of the `adr-retire-check` backlog location (f8b5a785), ADR-099 T1+T2 (d97f86d5), ticked receipts (7df1c9f3) and the batch's one history query (4442eed7) found one regression: the batch and the standalone dispatcher split `QUALITY_HARNESS_HISTORY_BASES` differently, so `HEAD,<sha>` gave a deleted tracked script two verdicts (cb43cc11). The one scoped verification of that fix and of c1218079 (a spec is covered only by the records that name it, found while binding ADR-099 T2's mutants) found two blocking gaps: CR, VT and FF still split on one side only, and a **Spec:** header was credited to both of its resolutions where adr-lint takes the first. Both fixed in the commit after c1218079, with catalogue mutants killed (history bases 6/6, spec coverage 4/4). By the owner's rule of one verification per fix round (2026-10-07), those last fixes were not sent for another review. Left: what an unreadable record covers still counts for every spec, a branch no test asserts.
- **Lead: the test suite leaves 68 entries in the temp directory** (the full gate's own advice line, 2026-10-12, on 4442eed7): `quality-harness-status` x33, `qh-mutate-run` x8, and one each of about 27 other prefixes, removed only when the gate exits. Each is a test whose cleanup does not cover every exit. Re-open when: one is traced to a test that leaks on a failing path, or the count grows.
- **§371 seen again, 2026-10-12.** Building a fixture in a scratch repository under the session's scratchpad, a `git commit` there was refused by the publish hook because the session's repository had no full pass: lead (1) of §371, the hook judging the session's repository for a commit aimed elsewhere. The probe moved into a test that builds its fixture without a commit.
- **The release campaign of 686ac9be (run 38285705686) found two catalogue mutants ADR-099 had left vacuous, 2026-10-12** (CLAUDE.md §18: a refactor that moves an observable turns the tests on the old site vacuous). `§350 C6` (adr-next's ownerless hedge) was pointed at the corpus matrix, which saw it only in the SessionStart ready line T1 removed; `§351` (`readRegularText` opening a FIFO) was pointed at the FIFO case, which work-next reached only through the deleted `taskDirectories` disk listing. Both mechanisms are still asserted: by `tests/adr-next.test.mjs` ("tasks with no owning record are said to have none…") and by the tracked-link-to-FIFO case, which git lists. The entries are repointed and killed again. The executing session ran the 20 entries its test edits could weaken; the whole catalogue was the measure that could see these.
- **A sign-off citing the `## Stop Condition` section read as a stop, 2026-10-13, fixed.** `work-next` named ADR-078 T2 as a task marked done with no evidence: its approval says "+8%, under the Stop Condition's 25%", and `adr-next` read the section's name as the verdict `stop` (the same at v3.8.19, v3.8.20 and v3.8.21, so it shipped unseen). The section name, with or without a possessive or plural, is now neutralised like a counter name; the condition said to be met, reached, hit, triggered, tripped, fired, applied or held still stops, and so does the bare word. `tests/adr-next.test.mjs` holds both directions; two catalogue entries kill the exemption and the met guard. Class, enumerated with `python3 plugin/bin/adr-next docs/adr --all | grep -E '\s(stopped|blocked)\s'`: seven stopped tasks before, six after; the one that changed is ADR-078 T2, and the other six are stopped by their own superseded `**Status:**`, correctly. This is the fourth first-hand instance of lead 1 above (a word in an approval's prose read as its verdict).
- **ADR-099 T2's archive move turned `adr-debt docs/adr` red, 2026-10-13, fixed.** The run printed `UNRESOLVED [adr] … ('ADR-046 Follow-ups — it is not dispatched')` for ADR-049's deferral and exited 1 (0 UNRESOLVED at v3.8.21, 1 at v3.8.22): `_resolve_adr_id` looked for the record in the active corpus only, so a record the adr-retire stage moved read as "a typo, or a record owned by another repository". adr-lint had paid for the same lesson for citations (`archived_record_numbers`, `plugin/bin/adr-lint:4441`); adr-debt was the sibling it never reached. A pointer to a record in a sibling whose README carries the archive's Lifecycle line is now UNSWEPT (it can never resurface, exit 0), spelled from the scan directory rather than resolved, so no home path is printed; a sibling without the line is no archive, and an id no tree holds stays UNRESOLVED. `tests/adr-debt-archive.test.mjs` holds the three directions; three catalogue entries kill them. Class, enumerated with `mrw read --grep 'def _resolve_adr_id|def resolve_record_number|def resolve_qualified_dep' plugin/bin/ plugin/lib/`: three resolvers of a record id. `resolve_record_number` (adr-lint citations) already reads the archive; `resolve_qualified_dep` (adr-lint, a task's dependency) reads the active corpus only on purpose, because a task must not depend on a frozen one. Nothing in the gate ran `adr-debt` over this repository, which is why it shipped unseen; `tests/corpus-lint.test.mjs` now does, with a failing control first; ADR-049's pointer itself is history and stays as written.
- **The backlog index hid 44 receipts from `adr-debt`, 2026-10-13, fixed.** `python3 plugin/bin/adr-debt docs/adr`, run per commit from v3.8.21: 0 UNRECEIPTED through 863b82f2, 31 at db1db5fa ("The backlog becomes an index"), 44 from 41645b31 to v3.8.22. `receipted` searched only the destination file for the source record's id, and the index moved each closed section's text, receipts included, to `docs/backlog-archive/`, leaving the heading and an `Archived: [..](..)` link (CLAUDE.md §10). It now reads the destination and every file its `Archived:` lines link to, inside the git root; and it names the destination as the pointer wrote it, where it had printed the path resolved against the git root, which named this machine's home on all 44 lines. 44 to 0 on this corpus. `tests/adr-debt-archive.test.mjs` holds the receipt in an archive file, its twin (an archive file that never names the source) and the spelling; two catalogue entries kill them; `tests/corpus-lint.test.mjs` now fails on any UNRECEIPTED line in this repository's corpus. Class: the shipped readers that open a backlog. By a literal name, `mrw read --grep "[\"']BACKLOG\.md[\"']" plugin/bin/ plugin/lib/ plugin/scripts/` finds one, `adr-retire-check:351-352`; by a deferral pointer's path, `adr-debt`'s `receipted` (fixed here). `adr-retire-check` (`active_backlog` and its receipt count) reads `- [ ]` and `- [x]` rows under `## Follow-ups`, a section the index keeps in the file; no other shipped reader opens the backlog.
- **Deferred by ADR-100 (a procedure the agent repeats is one command), 2026-10-13.** Phases 3 and 4 of the redesign plan the owner set on 2026-10-12 stay here until their own records: (1) phase 3, one reader of "is this tree checked" (`treeChecked`, `passedAlready` and `latestFastPass` in `plugin/scripts/check-ledger.mjs` collapsed into one, read by the publish verdict and `qh-check`) and the cached CI state said at `git push`; (2) phase 4, the owner's decision on CLAUDE.md §3 (keep two refusals, or widen what "checked" means with an opt-out), which the plan says to take with phases 2 and 3's results. ADR-101 (one reader per check ledger, 2026-10-13, Proposed) takes phase 3 as one reader per authority rather than one over both, declines the CI line at `git push` (the per-prompt brief already repeats a red run), and defers phase 4 here too.
- **Lead from an outside project, 2026-10-13: `qh-check` cannot say where its time went.** A peer session measured its declared check (a Go suite) at 455 s over three runs (463, 455, 455) on a 10-core Mac; a hand-instrumented run found 364 s of it in one test that runs nested modules' suites serially, and after bounding those the check fell to 150 to 170 s. `qh-check` printed the total, the exit and the load, and nothing that pointed at that test. The lead: name the slowest packages, or tests for a runner that emits them (`go test -json`, `pytest --durations`, a node reporter), in the footer and in the ledger row. First measure whether the 64 KiB output tail `qh-check` keeps holds what a parse needs, on this repository and on one outside corpus. The same peer's second idea, declared partitions whose green result is reused while their declared inputs are unchanged, is the per-test verdict cache already deferred above, with the same blind spot (a child process reading files the key does not see); a printed skip and a forced full run before every push would be its conditions. Re-open when: one adopter's check is shown to spend most of its time in a part the footer would have named.
- **ADR-100 T4 (a docs lane) withdrawn on its own ship rule, 2026-10-13.** The lane S3 derives, every `tests/*.test.mjs` naming `docs/`, a quoted `'docs'` segment or `ls-files` (`grep -lE "docs/|'docs'|\"docs\"|ls-files" tests/*.test.mjs`), is 140 of 218 test files. One run of it: exit 0, 1,732 tests, 270 s, load 3.75 at start and 14.54 at end on 10 cores (partly its own). The current `fastCheck` list ran in 97.7, 99.3, 104.9 and 122.5 s on four runs the same day. T4 ships only if the lane is faster and agrees, so it cannot ship, and the 20-commit replay and the seeded faults were not run. Why: most of this repository's tests build fixtures under a `docs/` path or read the tracked tree, so "the tests that read docs/" is most of the suite; a narrower derivation is a classifier whose error is fail-open (a test it drops is one a docs change can break unseen). The time is not the only leg: the lane holds 8 of the list's 12 files (js-reading, gates, publish-command, qh-check-reads-the-ledger, test-locks, corpus-probe, attest-import, hook-goldens, the slowest among them) and 132 more, so it does strictly more work than the list and is not faster under any load. `fastCheck` is unchanged. What would re-open it: a derivation from what each test actually opens (the per-test read-set recorder deferred above), not from its source text.
- **Phase 4 decided by the owner, 2026-10-13: Branch A, the two sanctioned refusals stay** (CLAUDE.md §3 unchanged; ADR-100's and ADR-101's deferral of phase 4 lands here). The harness is `qh-check` and the publish refusal, `adr-verify`, the mutation campaign and the outside attestation, driven by `qh-check --commit` and `node scripts/release.mjs`; Branch B (a pass that also covers `adr-lint` on touched records, a push judged against a red CI) is not taken, and the plan wrote an ADR only for Branch B's Accept, so none is written. Asked with the alternative of deciding after the first release through `release.mjs` had measured phase 2's promise (34 tool calls per release to at most 3); the owner chose now. The same day the owner kept `evidence-limited` as a covering review status in `release-evidence` (ADR-100 T1 S3, as built), and chose one more scoped review for a fix round's last commit over exempting it from the review gate, when the gate refused 289e71f5.
- **The Stop Condition exemption in `adr-next` took four review rounds, 2026-10-13: a §16 lesson.** e7506f5e neutralised the section's name; a Codex review found "the Stop Conditions were met", "Stop Condition: met" and a backed-out possessive read as a pass (7eb7be00); its verification found "Stop Condition not met" and "unmet" read as stops (289e71f5); the scoped review of 289e71f5 found "Stop Condition limit: reached" read as a pass (fixed in the commit after it). Each round's cases are in `tests/adr-next.test.mjs`'s Stop Condition test and each guard has a catalogue entry. The shape of the failure: an exemption that turns a stop into a pass is a classifier attacked from the fail-open side (CLAUDE.md §16), and every widening of its guard opened a new member. If a fifth round finds another, the narrower rule is the one to take: exempt only the cited forms ADR-078 T2's note uses (`under`/`within`/`inside the Stop Condition`), and read every other mention as a stop. The commit that fixes this round is covered by no recorded review, so `release-evidence` will refuse v3.8.23 until one runs over it (the owner's rule of 2026-10-13: one scoped review of a fix round's last commit).
- **Two `adr-verify` findings from an outside corpus, 2026-10-13, fixed.** A peer session on macOS with 3.8.22 reported: (1) a failed run's quoted output was indented line by line, blank lines included, so the task file held a line of two spaces and `git diff --check` exited 2; (2) a `--mutant` clean fence that passed in the checkout failed in the worktree because an ignored dependency directory is not carried into it, and nothing said so. Both confirmed against source: `excerpt_fence` prefixed every line (`plugin/bin/adr-verify:485` before the fix), and `worktree.mjs build` copies `git ls-files --others --exclude-standard` (`plugin/scripts/worktree.mjs:156`), which excludes ignored files by construction; the only ignored-file check was on the mutant target. The class, enumerated with `rg -n 'excerpt_fence\(|"  \`\`\`"' plugin scripts`: one writer and two callers (the Verification Log excerpt and the Mutation Log excerpt), both fixed by stripping each excerpt line on its right; every other line a run appends is already stripped (`why.strip()`, `human.strip()`). The UNPROVEN line of an isolated run now says the worktree holds no ignored file and names `--in-place`, the help text and the adr-execute skill say it, and a clean fence failing in place is not told about a worktree. Tests: `tests/adr-verify-isolation.test.mjs`, the run through `git diff --check` and the hint with its in-place twin; three catalogue mutants RED, and the ADR-045 T8 entry repointed and RED.
- **The fifth Stop Condition round, 2026-10-13: the adjacency pattern is replaced by a clause rule.** The scoped Codex review of 289e71f5..b02048b7 (recorded in `reviews.jsonl`, status blocking) executed `observed; Stop Condition: limit reached` against the target: `human_outcome` pass, `is_done` True — a separator before the word between, which the a39e91a6 pattern did not take. As the entry above planned for a fifth round, the lookahead is gone: `neutralise` in `plugin/bin/adr-next` blanks a `Stop Condition` only when no verdict word (`met`, `reached`, `hit`, `triggered`, `tripped`, `fired`, `applies`/`applied`, `holds`/`held`) follows it before the clause ends at `. ; ! ?` or a line break, or when every one that does is denied (`not`, `never`, `no`, with up to two auxiliaries between). A comma is no break, so "the Stop Condition, which was reached" stops. The known cost, chosen as the direction this reader errs in (CLAUDE.md §16): "under the Stop Condition's 25%, all checks met" now reads as a stop. Every case of the four earlier rounds stays in `tests/adr-next.test.mjs` and passes; five cases are added. The six catalogue entries on the old pattern were replaced by six on the new rule, all RED after one GREEN (the auxiliary denial, killed by adding "has not yet been reached"), and four entries whose source line the call change moved were repointed and RED.
- **The verification review of 3ddfe748 (status blocking, in `reviews.jsonl`), 2026-10-13, both fixed.** Executed against the target: `observed; Stop Condition: limit 25.0% reached` returned pass, a fail-open, because the decimal point ended the clause; and `approved; Stop Condition was not being met`, a pass at the base, returned stop, because the denial's auxiliaries left out `be` and `being`. A full stop now ends the clause only before a space or the note's end, and the denial takes NEGATOR's forms (`wasn't` too) and every auxiliary either list knows. Three cases added; two catalogue entries repointed and three added, all RED.
- **The verification review of a9a265fd (status blocking, in `reviews.jsonl`), 2026-10-13: the clause boundary is removed.** Executed against the target: `observed; Stop Condition: max. 25.0% reached` returned pass, a fail-open, because an abbreviation's full stop ended the clause. That is the seventh spelling in seven rounds, and the last two were clause boundaries, so `neutralise` now reads everything after the name: a Stop Condition is blanked only when no verdict word follows it anywhere in the note, or every one that does is denied. No boundary is left for a verdict to hide behind. The cost, chosen in this reader's direction (§16): a note citing the section that later says anything met or reached, in any sentence, reads as a stop. Two cases added; four catalogue entries repointed to the new scan; all twelve entries on this block RED.
- **Lead from an outside corpus, 2026-10-13, needs an owner decision: approvals whose prose describes a refusal read as stops.** A peer session's `work-next.mjs --json` listed 13 tasks in `unbackedDoneClaims`, every one `stopped … a human sign-off says stop on ‹word›` under `adr-next` 3.8.22. The peer sent the 13 notes verbatim (kept out of this repository, §6). Each note's verdict is an approval, and each trigger word (refused in six tasks; failed in two; refuse, refuses, cannot, an upper-case FAILED, fails) sits in prose that reports the system under test behaving as designed. The shapes, described rather than quoted: a boundary reported as still refusing what it should; a documented split between clamping and refusing; a receipt that keeps every failed hunk; an earlier run that failed before a fix; a relock note explaining why a test's assertion changed. None uses an underscore-joined identifier (that false-stop shape, `test_refused_scope`, is reproduced here separately and unfixed), and a CamelCase test name is not a trigger. Two mechanisms, confirmed in `human_stop` (`plugin/bin/adr-next:728`): only the LAST sign-off is read, and no row clears it unless it is an exit-0 row for the current fence, dated on or after the sign-off, and not an `adr-verify --relock` snapshot — so a relock note followed by its relock row stays stopped for good. Both are deliberate: the reader errs toward stop (§16), and text cannot tell a refusal that is the subject from a refusal that is the verdict. The decision: keep it (adopters see false stops on approvals that describe refusals, and cannot clear them without signing an observation again), or change it narrowly. Candidates: let a relock row clear a stop whose note is the relock's own justification, or read a negative word as the verdict only in the note's first clause or after its last affirmative. Each candidate is a fail-open surface and gets its §16 twin before it ships.
- **A probe of 2f97b6d0, 2026-10-13: the verdict is an open set, so the stop is now the default.** Before sending it for review, fifteen phrasings a person might write for a condition met were executed against it, and twelve read as a pass: satisfied, exceeded, breached, crossed, fulfilled, passed, surpassed, in effect, true, matched, invoked, activated (the listed hit, tripped and triggered stopped). A list of verdict words over an open space is the §16 failure, so the polarity is inverted: the name `Stop Condition` stays a stop word, and is blanked only when it is cited as a measure (`under`, `within`, `inside`, `below`, `beneath` or `per` before it) with no undenied listed verdict after it anywhere in the note, or when every listed verdict after it is denied (including `unmet`). After the change all fifteen probe verbs read as a stop, every earlier case holds, and `adr-next --all` over every record in `docs/adr` reports no human sign-off stop. The remaining fail-open needs a measure word AND an unlisted verdict ("under the Stop Condition's limit, which was exceeded"). Seven cases added; four catalogue entries added and the scan-scope entry given the case that makes it matter; all thirteen entries on the block RED.
- **The review of a9a265fd..1542b962 (status blocking, in `reviews.jsonl`), 2026-10-13: two fail-opens that predate the inversion, fixed, and the review loop on this block closed.** Executed against the target: `observed: the condition was met per the Stop Condition` returned pass, because only what FOLLOWS the name was scanned and `per` cited it as a measure; and `observed: Stop Condition was not unmet` returned pass, because an un- verdict counted as a denial even when negated. Both existed at the base. Verdicts are now read over the whole note, and a negated un- verdict is the condition met. Its two advisories are taken too: twelve verdicts it found missing from the list are added (satisfied, exceeded, breached, crossed, fulfilled, surpassed, matched, invoked, activated, attained, achieved, violated), and `see` cites the section as the measures do, so "see the Stop Condition section" is a pass again. Six cases added (one, "was in effect", keeps the default-stop path tested now that the list names "satisfied"); six catalogue entries repointed and three added, all sixteen on the block RED; `adr-next` over every record in `docs/adr` reports no human sign-off stop. **No further Codex round on this exemption** (the owner's rule for heuristic readers, one round per change and then outside corpus runs, has been exceeded): the next evidence is the outside corpus run §18 requires before v3.8.23.
- **The pre-release review of 59d54e3d (status blocking, in `reviews.jsonl`), 2026-10-13: one fail-open fixed, two words left out on purpose.** Executed against the target: `observed: Stop Condition is no longer unmet` returned pass, because the denial matched `not`, `never`, `no` and contractions but not `no longer`, which NEGATOR already knows. The denial now takes `no longer`; one case and one catalogue entry added, RED, and the contraction entry repointed, RED. Its advisory, `passed` and `true` missing from the verdict list, is NOT taken: the verdicts are read over the whole note, so either word anywhere ("tests passed") beside a cited measure would turn a real approval into a stop, and branch (a) needs a measure word AND one of them to fail open. Re-open if a sign-off on disk is found saying a cited Stop Condition was passed.
- **The coverage review of 5bd51f8a (status blocking, in `reviews.jsonl`), 2026-10-13: a regression of that commit, fixed.** Executed against the target: `observed: Stop Condition is not no longer met` went from stop at the base to pass, because the inner `no longer` was taken as the denial and the outer `not` ignored. A denial that is itself directly negated now counts as the verdict said (`STOP_CONDITION_NEGATED`), which also stops "never not reached". Two cases added; the not-met entry repointed and one entry added, both RED.
- **The v3.8.23 outside runs, 2026-10-13.** The request at bd9e613c went to the seven idle local sessions. Six were first refused by their own permission classifier ("Code from External") and ran once their users allowed it; one ran at once. All seven exited 0, and no adr-lint verdict moved in any: a Laravel/React monorepo corpus (94 records, 96 verdicts compared; filed as `docs/corpus-reports/2026-10-13-laravel-react-monorepo-3.8.22-bd9e613.json`), a Python service corpus (72 records, 77 compared), an Ansible corpus (20 records, 26 compared), a Laravel ADR corpus (17 records, 23 compared, look PARTIAL in both runs, not investigated), a React SPA corpus (2 records, 2 compared; filed as `docs/corpus-reports/2026-10-13-react-spa-3.8.22-bd9e613.json`), and two repositories with no ADR corpus the readers recognise (0 records). Only two are filed: the other labels name their projects, and a filename here may not (§6). The record-by-record comparison of the first found nothing exercising the new Stop Condition reading or the adr-debt archive receipts, and the React SPA runner checked by hand that its corpus has no Stop Condition sign-off and no frozen archive, so those two changes still have no outside observation. One lead, unconfirmed: the Python service corpus saw `adr-lint` on one record go from 372 to 1478 ms, one sample per side in sequence on a loaded machine. Counts from `ledger-report --json` (sessions read; checks passed/failed): 6, 64/8 (plus one interrupted); 3, 1/2; 5, 1/0; 6, 2/1; 4, 7/1; 13, 80/15; 6, 2/0. The coverage review of bd9e613c (evidence-limited) adds one advisory, a false stop on a triple negation ("not not not met"), the direction this reader errs in; left as it is.
- **A suppression the pre-release dead-code scan does not count, 2026-10-13, needs an owner decision.** Asked whether the five zero counts were silenced: `uvx ruff@0.15.6 check --ignore-noqa --select F401,F811,F841` over the gates reports two, `record.TEST_HASH_REQUIRED_FROM` imported but unused at `plugin/bin/adr-next:90` and `plugin/bin/adr-lint:126`, each under a `# noqa: F401` with its reason: the name is re-exported only so `tests/test-lock.test.mjs` (locked by ten tasks) and `tests/gate-regressions.py:3710` can read it through those modules. An export only a test reaches is dead code by §13, which allows no allow-list; the locked test must stay byte-identical, so removing it means a new test beside it and the locks re-taken. The other exceptions, each documented beside it: three names in `scripts/vulture-allowlist.py` (two ctypes struct fields and a `sys` flag, written by attribute), three `from fence import *` shims (F401/F403), and knip's generated config (`ignoreExportsUsedInFile`, two OS binaries, the `internal` dependency, workflow exports checked separately).
- **Decided by the owner, 2026-10-13: the `TEST_HASH_REQUIRED_FROM` re-export keeps its `noqa`.** Retiring it was chosen first, then withdrawn on a fact the first question left out: one of the ten tasks that lock `writer, done, and is_done agree on the same hashes` is `docs/adr-archive/ADR-056-a-quoted-separator-is-not-a-joiner/tasks/T1-quoted-separator-is-not-a-joiner.md`, a frozen record whose catalog digest covers its file bytes, so its lock cannot be re-taken. The re-export stays until that record leaves the archive or the archive's digest rule changes. The same day the owner chose ONE PUSH PER RELEASE (fix rounds commit on the fast check and stay local; one full `qh-check` before `release.mjs` pushes), after ten full gate runs on 2026-10-13 missed the redesign's four-per-session target, and kept the refusal-prose stop rule above as it is.
- **The coverage review of ceea7705 (status blocking, in `reviews.jsonl`), 2026-10-13: three findings fixed, one already declined.** The status line showed the ahead and unreviewed counts after a commit, a push or a branch switch had made them another tree's: `gitReading` now shows them only when the cache's key equals `snapshotKey()` read from files now, and an unprovable key shows nothing. A parent checkout's lease showed in a linked worktree nested inside it: a lease now counts only where its root has this checkout's Git directory. The review heads were cut to the newest 64, so an older review that still covered HEAD could drop out and the count rose: every head now reaches `git rev-list --stdin`, through an `input` that `budgeted` and `shell` pass on. Tests and seven mutants added, all RED. The fourth finding, that a render can still spawn `git rev-parse` and write its own cache on a miss, is §246, declined 2026-09-24 and not changed by that commit. Left as they are: with HEAD unchanged, a review that lands is not counted until the hook next refreshes (the count errs high), and `ciReading` still shows the last branch's CI for up to 15 minutes after a branch switch.
- **The outside runs at 7b675248, 2026-10-13, and one finding they produced.** The request went to the nine idle local sessions, with the probe plus a read-only status-line render. Two were refused by their own permission classifier ("Code from External"), and nothing ran there. Seven ran, all exits 0, no adr-lint verdict moved. Six are filed, each under a shape label the runner chose: a Laravel/React monorepo corpus (94 records, 96 compared; the runner also checked adrNext, adrState, workNext and the other readers byte-identical old to new), an Ansible infrastructure corpus (20 records, 26 compared), a Laravel CMS corpus (17 records, 23 compared, look PARTIAL both sides, as before), a Python service corpus (72 records, 77 compared), a React SPA corpus (2 records, 2 compared) and an SPA frontend with no records (1 compared). Not filed: a run that compared nothing, and every attestation whose first label named its project; the runners re-attested under shape labels. The renders showed `QH ? unknown` (the synthetic session has no event log), `CI ?` on three Bitbucket remotes, red CI with read and unread jobs counted apart, and `load` between 1.55× and 2.15× while the probes overlapped. `!rev` went unexercised: no runner's checkout holds a review ledger, and the caches there were written by the installed, older hook. **Confirmed defect, older than 3.8.23:** `collect` counts ahead and behind with `git rev-list --left-right --count origin/<branch>...HEAD` (`plugin/scripts/branch-state.mjs:163`) and never with the configured upstream, though the pushed tip two lines below resolves `@{upstream}` first. A branch tracking `origin/master` with no `origin/<same name>` therefore caches `ahead: null` (the React SPA runner, 1 commit ahead by `git rev-list --count @{u}..HEAD`), and both the brief and the status line show nothing for it. The failure is silence, never a wrong number. Fixing it changes a reader, so the fix is a release decision. The same full `qh-check` passed at 7b675248 (2266 pass, 0 fail) but is recorded unattributable: load rose from 1.7 to 11.91 while the probes ran.
- **Fixed 2026-10-13 on the owner's choice, before the release: the ahead count of a branch tracking an upstream of another name.** `collect` still counts against `origin/<branch>` first, and when that fails while `@{upstream}` resolves, it counts `@{upstream}...HEAD`, the ref the pushed tip is read from. A branch with both an `origin/<branch>` and a differently named upstream is still counted against the first; a test fixture answers that call in many locked tests. Regression `a branch tracking an upstream of another name is counted against it, with real git`, a bare remote and a branch made with `--track origin/main`; one mutant, RED, and 56/56 `branch-state` mutants noticed (that run began at load 12.7, so a kill there is attributable only because every baseline passed under the same load). A reader changed, so the outside runs at 7b675248 attest an older sha and a new round is needed.
- **The outside runs at 297ea135, 2026-10-13.** Eight sessions were asked again; one was still refused by its permission classifier. Seven ran, all exits 0, no adr-lint verdict moved, and all seven are filed: a Go CLI corpus (148 records, 148 compared), the Laravel/React monorepo corpus (96 compared; adrNext, adrState, workNext and the other readers byte-identical old to new), the Python service corpus (77), the Ansible corpus (26), the Laravel CMS corpus (23, look PARTIAL both sides), the React SPA corpus (2) and the SPA frontend with no records (1). The React SPA runner, whose checkout found the defect, ran this candidate's branch-state once and its status line then showed `↑1`, matching `git rev-list --left-right --count @{u}...HEAD`. The other six checkouts have an `origin/<branch>` or no upstream at all, so they show only that the fallback leaves the ordinary case alone. Two runs printed "slower" adr-lint lines (two records in one, nine in another) while load reached 22 on 10 cores; adr-lint did not change between the candidates, so they are not read as a regression. Left as designed, raised by one runner: a branch with no upstream and no `origin/<branch>` (never pushed, nothing configured) is still not counted, since nothing names what it should be counted against. The full `qh-check` at 297ea135 passed attributably: 2267 pass, 0 fail, load 2.94 to 8.29 on 10 cores.
