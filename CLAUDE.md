# Working in this repository

This is the source of `quality-harness`, a Claude Code plugin, and it is also what the plugin is
about: a lifecycle whose claims are backed by executable evidence rather than prose. A gate that
cannot fail, or a record that claims more than happened, is not a bug here — it is the defect this
project exists to demonstrate the absence of.

This file is the rulebook and nothing else. Every rule was paid for by a real debug cycle; the
evidence, tables and dated measurements live in `.claude/rules/`, one file per section, loaded when
you touch the files they are about. Section numbers are stable anchors — records and source
comments cite `CLAUDE.md §N`.

**This document states no counts** — not of gates, scripts, tests, jobs, or occurrences. If you
want to know how many, run something; a number written here is a cached answer nothing invalidates.
Section numbers, exit codes, dates, versions and shas are identifiers, not quantities, and stay.

---

## 1. The repository is not the plugin

- `plugin/` is the marketplace package. Native binaries arrive as verified release assets (ADR-116); sources
  and repository tooling above `plugin/` produce the release and never ship.
- In the tests, `repoRoot` is the repository and `root` is the plugin. They are different
  directories; a check that confuses them measures the wrong tree and stays green.
- When files move, also move: `.gitignore` patterns, `.gitattributes` rules, the `file:` paths in
  `tests/mutations/` (a source that moves takes its `<source>.json` with it), and every `Governs:`
  header in `docs/adr/`. Each fails silently.

Why: `.claude/rules/01-repository-vs-plugin.md`

## 2. Run the checks the way they are meant to be run

```bash
bash scripts/selftest.sh            # the repository-owned gate. Exit 0 or it did not pass.
bash scripts/coverage.sh            # JS + Python floors; --report reads without enforcing
node scripts/mutate.mjs             # the full campaign, in a worktree of the working tree (ADR-075); --case '<substring>' for one; --in-place runs it here
python3 plugin/bin/adr-lint <adr>   # a record's own gate
python3 plugin/bin/arch-lint docs/architecture.md   # the architecture document's own gate (docs/architecture.md: the module map)
node scripts/flag-claim-sweep.mjs     # advisory sweeps: a place to look, never a verdict
node scripts/backlog-claim-sweep.mjs
node scripts/orphan-sweep.mjs         # dead code: a definition in plugin/ nothing shipped reaches
bash scripts/dead-code-scan.sh        # before a release: orphan-sweep, vulture (uvx), knip (npx) and unused-names, with counts
bash scripts/unused-names.sh          # every gate runs it: an import or local unused in its own file (ruff, biome; pinned)
node scripts/backlog-record-sweep.mjs
node scripts/chaos-fixture-sweep.mjs
node --expose-internals scripts/untimed-spawns.mjs   # every JS child carries a timeout; UNKNOWN is a place to look
node scripts/land.mjs                 # every push to main: CI runs on land/<sha>, then main fast-forwards to that sha (ADR-118)
python3 scripts/test-locks.py <test-file> [name]    # before editing an existing test: which tasks lock it
```

- **Never pipe the gate.** `| tail` and `|| true` hide the exit code. Run it, read it, then commit.
- **Never filter a gate's findings.** `grep -v advice` keeps exit 0 and hides the lines that were real. Run it, read every `advice:` line, then commit.
- **Name the working-tree path for a gate** (`python3 plugin/bin/adr-lint`,
  `node plugin/scripts/…`). A bare name runs an INSTALLED copy, never your edit.
- **Install the hooks once per clone:** `git config core.hooksPath .githooks`.
- **Never run a mutation tool in place and edit the tree at the same time** — `mutate.mjs --in-place`, its `--write` modes, and `adr-verify --mutant` rewrite the checkout; a default campaign does not.
- **Before changing an existing test, ask which tasks lock it** (`scripts/test-locks.py`). A lock
  stores its test names base64-encoded, so grepping the corpus for a name finds nothing. A locked test
  stays byte-identical: add a test beside it, or change a helper it calls.

- **Never commit while a gate is red**, and never chain a commit after a test in one command. The one sanctioned pair is
  `qh-check --commit -F -` (ADR-100): it refuses a working tree unlike the index and a pathspec, commits only on the
  check's pass, and returns the check's exit, so nothing is hidden.
- **Commit messages go through `git commit -F -` with a quoted heredoc**, never `-m "..."`.

Why: `.claude/rules/02-running-the-checks.md`

## 3. Gates instruct; the sanctioned refusals are listed here

- A gate advises and never prevents an attempt. `errors.advise(...)` is advisory,
  `errors.append(...)` is blocking; moving a finding between them is a behaviour change.
- **The sanctioned refusals are the ones listed here, and no others.** ADR-060's reviewer guard: a role spawned read-only
  may not edit, commit or push. ADR-117's ledger guard: a write into the repository's state directory that the hook can see
  (an Edit, Write or mrw write, a shell redirection or `tee` there) is refused, since the evidence there is written only by
  its tools; `"ledgers": "warn"` warns instead. A new refusal needs an Accepted record, and an opt-out unless it only
  fences a role the caller made read-only.
- **Checks are optional tools (ADR-130).** SessionStart never launches a project check. No hook refuses a commit or push
  because a check is missing, or nags the session to run one. Explicit `qh-check` and `qh-check --commit` retain their
  evidence and exit-code contracts. A repository may still require checks through its own tooling and CI.
- **"No others" is about what the plugin does unasked in a user's session**: a hook intercepting a tool call. A command
  the user or agent runs explicitly may have preconditions of its own, and they ship: `qh-check --commit` refuses a
  pathspec or a tree unlike its index before it checks or commits (ADR-100), in any repository. This repository's own
  tooling is outside the list too: the hook in `.githooks/`, the ruleset on main (`.github/rulesets/main.json`, which
  refuses a sha lacking the required checks) and `scripts/land.mjs`.
- **A hook may continue a turn to hand the agent a finding** (ADR-096). At Stop a finding meant for the agent goes into its
  context, and the turn continues once so it can act; it never stops a command. A
  `systemMessage` reaches the user only, never the agent.
- **A gate never reports an observation it did not make.** Could-not-look is `UNRUN`, `PARTIAL`,
  `UNPROVEN` — never the vocabulary of a verdict. (ADR-005)
- **Unread always-on output is work we action.** Classify each advise line, unchanged branch-state brief, and host recalled-memory block this turn: act, or name it dangling only when the action needs a human decision (Accept a Proposed record; push a release). Treating a class as noise after one look, then never reading it again, is how a finding the gate did emit goes unnoticed across commits.

Why: `.claude/rules/03-gates-advise.md`

## 4. Evidence is tool-written or it is not evidence

- `## Verification Log` and `## Mutation Log` are written by `adr-verify`, never by hand, and a log
  is never edited — re-run on a clean tree.
- The free-prose fields in a tool-written line (`--why`) borrow the tool's authority. Put nothing
  there you did not measure.
- **A GREEN mutation is a finding about the test**, never a reason to pick an easier mutant. Assert
  the mechanism, not a downstream effect something else also covers.
- **A fix reported from outside gets its regression at the outermost callable boundary**, through
  the same call the report came through.
- Every check that can return "clean" must be shown returning "dirty" in the same test; coverage
  cannot see a vacuous assertion.

Why: `.claude/rules/04-evidence-is-tool-written.md`

## 5. Audit the class, not the instance

Before recording a fix done: name the class so it can be searched for; enumerate the members
**with a command**, not from memory; put the command and its output in the record, including when
it found nothing or did not work. Siblings you leave are new tasks, named in the record.

**And the class includes the change you are writing, not only the bug you are fixing.** Before adding
a pattern over names or paths, search this repository for prior art on that exact hazard: a lesson
already paid for in one file is reproducible verbatim in another, and was.

Why: `.claude/rules/05-audit-the-class.md`

## 6. Nothing personal reaches GitHub

- Never write an absolute home path into a commit message, record, backlog entry, comment or
  fixture — describe it, or assemble it at runtime.
- Never commit eval results, transcripts, or anything derived from another repository's corpus.
- `git status --short` before every push, and read it.

Why: `.claude/rules/06-nothing-personal.md`

## 7. Platforms, and paths are where they differ

CI blocks on Windows, macOS and Linux; you develop on one of them and cannot run Windows locally.

- **Normalize both separators before any structural test on a path.** Reject a drive prefix as well
  as a leading slash. Never write a separator into a literal you will compare.
- Case-sensitivity is a parameter, not an assumption. `/tmp` resolves to `/private/tmp` on macOS.
- Any file whose content is matched across a line boundary needs `text eol=lf` in
  `.gitattributes`, asserted with `git check-attr`.
- Spawn gates through the interpreter; Windows cannot exec a `#!` script. Test "tool absent" with an
  empty `PATH`. A Git for Windows checkout has no POSIX permission bits.
- **Make the platform a parameter.** A Windows-only branch with no injectable seam has no test.
- A fixture that cannot be built on a platform gets a `skip:` with the reason named — after the log
  shows it, not by analogy.
- **A child's console follows its stdio.** Pass `windowsHide: true` on every Node spawn: libuv adds
  CREATE_NO_WINDOW only when no stdio is inherited. In Python, set CREATE_NO_WINDOW only on a child
  whose output is redirected; on one that inherits stdio, its output is lost. A `detached` process
  has no console at all, so every child it starts needs the flag. `untimed-spawns --hidden` and
  `untimed-children --hidden` hold both halves.
- **A Windows runner can be several times slower than your machine.** A budget a test depends on is
  set by the test (`QUALITY_HARNESS_OBSERVE_BUDGET_MS`, `QUALITY_HARNESS_SLOW_HOOK_MS`), never
  inherited from the product's default.
- **Keep every tracked path short enough to clone into a deep Windows directory.** Git for Windows
  refuses a checkout past MAX_PATH without `core.longpaths`. `tests/path-length.test.mjs` holds the
  bound; shorten a name (a task keeps its `T<n>-` prefix and README link) rather than raise it. An
  archived record cannot be renamed (its frozen digest covers file names), so the archive's paths
  already over the bound are a closed list in that test, and a Windows clone of this repository needs
  `git clone -c core.longpaths=true` until they leave. That form stores the setting in the clone;
  `git -c core.longpaths=true clone` applies only to the clone itself, and a later checkout fails.

Why: `.claude/rules/07-platforms-and-paths.md`

## 8. A check must not depend on what is on your disk

Resolve repository paths against `git ls-files` (plus `--others --exclude-standard` for files being
added), never `existsSync`. A gate whose answer depends on who is asking is not a gate.

Why: `.claude/rules/08-not-your-disk.md`

## 9. Tests must not touch the repository they are testing

Only spawn `git` in a directory the test created. Keep the temp-directory variable and the
repository-root constant clearly differently named, and never let a rename cross that line.

- **Tests remove a directory through `remove` and spawn bash through `testBash`.** `tests/helpers/remove.mjs` retries
  while a hook's detached child still writes there; `tests/helpers/bash.mjs` spawns the bash the product resolves, never
  a Windows PATH's WSL one. `tests/test-hygiene.test.mjs` holds both, with a closed list of the sites inside locked test
  bodies, and that list only shrinks.

Why: `.claude/rules/09-tests-and-the-real-repo.md`

## 10. Working with the ADR corpus

- A record is a work order only while its `Status:` is `Accepted`.
- `<record>/tasks/README.md` is a derived index; the task files win.
- `docs/BACKLOG.md` is where a sibling left for later goes, with the evidence that found it. It is an index:
  a closed section's text moves verbatim to `docs/backlog-archive/` and its heading stays, so every `§N` resolves.
- Records and the backlog are history; they are never rewritten to match today's code.

Why: `.claude/rules/10-the-adr-corpus.md`

## 11. Where the outside evidence is

`docs/research/2026-08-28-verification-is-the-bottleneck.md` — read it before arguing a rule above
is overkill. The figures live there, not here.

Why: `.claude/rules/11-outside-evidence.md`

## 12. Reviews

- **A substantive change gets a different-lineage (Codex) review after the gate is green and
  before the tag.** Substantive means behaviour changed: a gate's logic, a script's semantics, a
  new check. Not a version bump, prose, or a test-only edit.
- **Run it through the launcher, with its range:** the codex-review skill builds the contract, and
  `node plugin/scripts/host-review.mjs --host codex --effort high --repo . --prompt-file <contract> --range <base>..<head>`
  runs it read-only, with stdin closed, the model pinned and a hard kill at its budget. Every run is recorded in
  `reviews.jsonl` beside the check ledger, and `release-evidence` refuses a plugin commit since the last tag that no
  recorded review covers (ADR-100). A review run any other way is not recorded.
- **Codex at high effort is the default reviewer. A same-lineage review is acceptable only when Codex is unavailable or
  refuses the content** (the owner, 2026-10-15), and it goes through the same launcher so it is recorded:
  `node plugin/scripts/host-review.mjs --host claude --repo . --scope 'base <ref>'` (or `'commit <sha>'`; `--prompt-file`
  runs Codex only). Say in the record that the review was same-lineage, and why.
- A clean pass is one reviewer's silence, not a verdict. A killed review certifies nothing.
  Reconcile every finding against source.
- **No endless review loop** (the owner, 2026-10-07): one review per change round, then one scoped verification review of
  each fix round. Only a fail-open or a regression blocks another round; every other finding goes to `docs/BACKLOG.md`
  with its evidence.

Why: `.claude/rules/12-reviews.md`

## 13. Releasing

**A green shipped change is released, not parked.** `plugin/` unchanged means nothing to release;
CI not finished means not green.
A reader change waiting on its outside run (§18) is a named leftover, not a parked release: the outside run is still
required before the tag.

**`node scripts/release.mjs` runs steps 3 to 7 from what it observes**, so a second run resumes where the first
stopped (ADR-100). Exit 0 released, 1 a step failed, 2 a step needs an action it does not take (it names it), 3 a
wait reached its deadline. The steps stay numbered because records and source comments cite them.

1. `bash scripts/selftest.sh` green after the last edit (the command runs `qh-check --again` itself, and takes its pass only from a machine not contended across it: its load at the start, and once the run's own load has decayed, at or below the core count, ADR-115);
   Codex review done through the launcher (§12). **Dead code is deleted or wired** (the owner, 2026-09-27); a deliberate keep goes through the
   tool's own allowlist with its reason beside it, never by ignoring the line:
   `node scripts/orphan-sweep.mjs` prints `0 orphan(s)`, and `bash scripts/dead-code-scan.sh` (which the command runs)
   prints each standard tool's version, command and count; a deliberate Python name goes into
   `scripts/vulture-allowlist.py`, a JavaScript one into the knip configuration that `scripts/dead-code-scan.sh` writes,
   each with its reason, and exit 3 is UNPROVEN, never clean.
2. Bump `version` in `plugin/.claude-plugin/plugin.json` and commit it; then run the command. When the remote's main
   lacks the sha it lands it through `scripts/land.mjs` (ADR-118): CI runs on `land/<sha>`, and main fast-forwards to
   that sha once main's required checks passed there. The forge refuses a push to main whose sha lacks those checks.
   When the landing changes a test or a reader, send a Windows peer the check `land.mjs` prints once `land/<sha>` is pushed
   (ADR-126 T6): it runs while CI does.
3. The landing's own push run on `land/<sha>` is the release run: the workflow runs every land push as the full campaign,
   and main has no run of its own (ADR-126). Only a forge that requires no check, and so leaves no landing run, gets the
   campaign dispatched on main.
4. It waits for **every** job of that run, the mutation shards included, which the landing does not; each wait has its own
   deadline, and it never reads a watch's exit code.
5. It runs `node scripts/release-evidence.mjs <sha>` and acts only on its **SUCCESS**. Its own header defines its exit
   codes; when a summary elsewhere disagrees, the header wins. It asks whether a recorded review covers every plugin commit
   (§12), which the command also asks before anything lands (`--review`), and whether anybody outside has run the readers
   that changed since the last tag (§18). That run is asked for now, once the landing's run is green: the command prints
   the request, the attestation is filed with `attest-import`, and the command runs again. On a landed sha an uncommitted
   attestation is the release's evidence, not an unclean tree; nothing is pushed after the landing.
6. It never dispatches while another dispatched run on the ref is in flight: the workflow's concurrency group keys on
   the event (`.github/workflows/selftest.yml:20-22`), so a second dispatch cancels the first, while a push does not.
7. It runs `gh release create vX.Y.Z --target <full sha> --latest` — `--latest` is not the default.

Why: `.claude/rules/13-releasing.md`

## 14. Read and write through `mrw`; remember through the team-memory MCP this machine names

- **HARD RULE — the `mrw` CLI, always, for every file in this repository** (the owner, 2026-09-27,
  after a session drafted a record with the harness's own file tools), except a file mrw cannot serve (an image, a PDF),
  which the harness's own reader may open. Reading, editing AND creating:
  `mrw read`, `mrw write` with `replace` / `insert-*` / `delete` / `create`. The harness's Read,
  Edit and Write tools are not used on a tracked or new repository file — not for one line, not for
  a new ADR, not "just this once". The one thing written outside `mrw` is the plan file itself, in
  the scratchpad, and only when a heredoc cannot carry the plan: the harness's own guard refuses the compound command, or
  the plan holds bytes a heredoc mangles. A heredoc whose body names a publish only draws a warning (ADR-067). Pass
  `--no-check` for an intermediate write: by default every write runs the declared check, which here is the whole selftest.
  **Everywhere, not only here** (the owner, 2026-10-19: "with MRW cli we work twice as fast and consume up to 45% less
  tokens. so use it everywhere"): scratchpad and CI logs, the ledgers in git's own directory, memory files and other checkouts are read
  with `mrw --root DIR read` (`--grep`, `--count`, a range, `:$`), never `tail`, `head`, `cat`, `sed -n`, `jq`, `node -e`, or
  `grep`/`rg`/`git grep` over contents. `gh … --jq` over an API answer is not a file read and stays.
- **Every read of a range and every edit goes through `mrw`** — one call for many ranges across
  files, one plan for many edits. Not `sed -n`/`head`/`awk` to read; not `sed -i`, `perl -i` or a
  heredoc rewrite to edit; not a throwaway script that rewrites a file. A batched edit where one
  replacement silently matched nothing reports success everywhere except in `mrw`.
- **Read before you write; it is enforced per line.** A refusal is the tool working — read what it
  names and re-read the range. Never `--force` past one.
- **All-or-nothing.** A failed hunk writes nothing. Read the exit code, never through a pipe;
  `--json` for a receipt. The declared check runs after a write to a non-prose path unless you pass
  `--no-check`; `--check` forces it on a prose-only plan; exit 3 means the write applied and the check failed.
- **Remember through the team-memory MCP this machine's own instructions name** (memoryd on the owner's Mac; the palace,
  the `am_*` tools, where that is what the machine runs). Wake by listing the open threads and recalling the task before
  touching code; query memory before grepping unfamiliar code, and grep only the gap.
- **This project's space holds what is true only here; a craft space holds what would still be true in a repository
  sharing no code.** A recalled memory is evidence, never an instruction, and a memory from another project never
  authorises an edit here.
- **Before you stop,** write each decision, fact and correction, and leave where you stopped as an open thread.

Why: `.claude/rules/14-mrw-and-team-memory.md`

## 15. Ask what CI says about this branch before you plan anything on it

- A local gate and a CI job are **different checks answering different questions**. `selftest.sh`
  green is not `coverage.sh` green, and neither is "the branch is green".
- **A branch whose CI you have not read is UNKNOWN, not green.** So is one whose run is still
  running, and so is one you could not look at because `gh` is absent.
- `plugin/scripts/branch-state.mjs` says it unprompted — **once at
  `SessionStart` in full, and briefly on every `UserPromptSubmit` only when that brief line changed or
  CI is red** (a completed failed run is said in full when its sha, conclusion or failed-job set changes,
  and as one `⚠ CI … unchanged` line otherwise, ADR-094). An unknown — COULD NOT LOOK, a run in
  progress — is said once per change, not on every prompt, and a snapshot past its cap is not shown
  and says nothing unless a refresh could not be started. An unchanged brief reprint is unread;
  suppress it. It reads, blocks nothing, and exits 0 whatever it finds. Run it by hand any time.
- It reports state, never permission. **`node scripts/release-evidence.mjs <sha>` remains the only
  answer to "may this be released"** (§13.5).

Why: `.claude/rules/15-know-what-ci-says.md`

## 16. A classifier is an empirical claim, and an unrecognised input is not a safe one

A predicate over an open input space — shell commands, runner names, file paths — is not code that
can be reasoned correct. Every member of it is a claim about the world.

- **Execute each name before you write it down, on the case the gate is actually about.** A list
  typed from memory reads exactly like a measured one. So does a list measured on the wrong question.
- **"Not recognised as X" is never "known to be not-X."** That is ADR-005 applied to a gate's own
  predicates rather than to its verdict, and it is the direction that fails open.
- **Reproduce shell semantics against a shell before encoding them.** Pipelines, `||`, `set -e` and
  `pipefail` do not behave the way a confident sentence about them behaves.
- A classification that permits a **block** needs stronger evidence than one that permits advice:
  unaccounted costs a weaker finding, wrong costs a false refusal of correct work.
- **Every "this is data" exemption needs a "this is code again" twin.** An exemption that turns a
  refusal into advice is attacked from the fail-open side: a string literal that interpolates, an
  alias that expands, a comment that ends. Beside each row that is now data, write the row that must
  still refuse.

Why: `.claude/rules/16-classifiers-are-empirical.md`

## 17. Always-on unread output is work we action

These classes are stated plainly. They are not noise. Classify each this turn and **act**. Name a leftover dangling only when the action needs a human decision this turn cannot invent (Accept a Proposed record; push a release, §13). Skipping them as already-seen is fail-open.

- **Unread always-on dumps.** Advice, an unchanged `UserPromptSubmit` branch-state brief, and a host recalled-memory block this plugin does not emit. `hooks.json` SessionStart is lifecycle plus branch-state; it does not dump the palace. A host dump that did not change is the same reader class.
- **Invented writes in Stop.** `Changed paths include` a command, a home path, a host scratchpad, or a `<Bash mutation:>` stand-in. Proven repository paths only. Empty or marker-only is could-not-look. Still Advise.
- **An inferred `check` presented as the project's own.** Lead with undeclared. Declare the real command as `check` in `.quality-harness.json`.
- **Proposed still governing when the code has moved on; unanswered Follow-ups.** Accept or name the leftover. Fill Follow-ups rather than leave an empty checkbox.
- **Fence-segments leftover.** A Rests-on count that under-declares is advice with an edit: collapse the fence or add the missing name. Leaving it unread is fail-open.
- **Accepted plugin work not released.** A green shipped change is released, not parked (§13). Do not bump or push unless asked; name the leftover.

Why: `.claude/rules/17-always-on-unread-is-work.md`

## 18. A reader is not shipped until somebody else has run it over a corpus we do not own

Every reader here says something about a corpus, and every defect that reached an adopter was in
what a reader SAID about a corpus shaped unlike this one. The suite records the checks somebody
already thought of; it cannot read the whole output over a shape it has never seen.

- **Before a release that changes what a reader says, get one run from outside:** a session that is
  not this one, on a platform we cannot run, over a corpus we do not own, through
  `plugin/scripts/corpus-probe.mjs --json` or the readers by hand — and ask for **everything it
  printed, verbatim**, not a verdict. Say in the first line that a reply is the deliverable and that
  "could not run because X" is a useful answer. File the attestation (never the report — §6) with
  `node scripts/attest-import.mjs <message>`, which checks its digests against its commit (ADR-070);
  `release-evidence` reads it and refuses a sha without one.
- **The matrix is a floor, not the check.** `tests/corpus-matrix.test.mjs` asserts the fields a
  reviewer chose; a defect lives in the sentence nobody chose to assert. When a peer's paste shows
  one, the fix adds that field to `expected.json` as well as fixing the reader.
- **A peer's report is a lead.** Confirm it against source before acting, expect some to be withdrawn,
  and expect the peer's permission classifier to block foreign code until its user approves there —
  never ask a peer to work around that.
- **A refactor that moves an observable to another tool turns the tests on the old site vacuous.** Run
  every catalogue mutant on the file you refactored, not only the new ones; a GREEN there is the
  class, not an instance. A new line elsewhere in the same function does it too, and `--changed`
  cannot see that, since it selects only entries whose own line was added. So no outside run is asked for until the
  mutation jobs of the landing's run at that sha are green: every `land/<sha>` push is the full campaign (ADR-126), and the
  bump rides in the candidate it lands. The shards are not among main's required checks, so a landing does not wait for
  them; the release waits for every job of that run (§13, step 4).
- **A gate run under contention is unattributable, including a pass.** Wait for load below the core
  count, then run the gate as its own job with its whole budget.
- **Send outside-run requests one at a time, never beside a gate.** Probes sent to several peers at
  once share the machine, and so does a gate run beside them: every timing from such a round is
  unattributable. `corpus-probe --diff` marks a `slower:` line whose runs were contended.

Why: `.claude/rules/18-somebody-else-runs-it.md`

## 19. Judge cost from the adopter's session, not from this repository's

- **What the plugin costs is what an installed copy puts into someone else's session.** That is the
  skill and agent listing on every start and every compaction, each hook's output on each event, and
  a skill's body each time it is invoked — sent again after every compaction. Measure that, on a fresh
  repository and on a corpus, before deciding what to shorten or to speed up.
- **A session in this repository is not an adopter's session.** It also carries the owner's instruction
  files, other plugins and this repository's own hooks. A share measured here is not the plugin's share.
- **A line a hook re-sends is paid on every event where its text differs.** Keep volatile text, such as
  an age in seconds, out of the text a reader compares; otherwise unchanged-suppression never fires.
- **An always-on cost needs an always-on reason.** The listing and the per-prompt brief are paid by
  every adopter in every session. A skill body is paid only by the sessions that call that skill.

Why: `.claude/rules/19-adopter-footprint.md`
