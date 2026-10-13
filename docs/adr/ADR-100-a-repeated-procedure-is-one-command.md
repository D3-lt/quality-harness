# ADR-100: A procedure the agent repeats is one command

**Status:** Accepted
**Date:** 2026-10-13
**Owner:** the owner (repository maintainer)
**Spec:** None — no spec stage; phase 2 of the redesign plan the owner set on 2026-10-12, and the owner's three choices of 2026-10-13 (Context)
**Cross-references:** ADR-060, ADR-062, ADR-070, ADR-081, ADR-094, ADR-097, ADR-098, `docs/BACKLOG.md`, `CLAUDE.md`
**Governs:** `plugin/scripts/host-review.mjs`, `plugin/scripts/qh-check.mjs`, `plugin/bin/qh-check`, `plugin/skills/codex-review/SKILL.md`, `scripts/release-evidence.mjs`, `.quality-harness.json`
**Enforced-by:** None — each task's catalogue entries enforce its part; this record names them once they exist (Follow-ups)
**Invalidates:** none — checked: ADR-081's fast-pass rule, ADR-062's review schema and ADR-098's one launcher are used as they stand; nothing they decided is reversed
**Served-path change:** A Codex review run through the plugin's launcher is recorded where `release-evidence` reads it, and `qh-check --commit` checks and commits the staged tree in one call; in this repository, one command runs the release chain and a docs-only change runs a docs lane.

## Context

The owner, 2026-10-12: the harness should act "like an immune/nervous system, coupled with static tools, so that actual agent
would not do the heavy work on figuring out whats wrong or constantly running tests to confirm". Phase 2 of the redesign plan
(`docs/BACKLOG.md` §378, the plan of 2026-10-12) turns the procedures the agent runs by hand into commands.

- **What a release costs the agent, measured 2026-10-13** over this session's transcript, from the 3.8.22 bump commit to
  `gh release create v3.8.22` (the window holds no fix round): 34 tool calls (30 Bash, 3 SendMessage, 1 ListAgents). The chain
  is CLAUDE.md §13's seven steps, each one a call or a wait the agent watches.
- **How often the gate runs, measured 2026-10-13** from `.git/quality-harness/checks.jsonl` and `fast-checks.jsonl` (every
  session in this checkout, by the day the run started): the full check 12 to 32 runs a day over 2026-10-05 to 2026-10-12, the
  fast check 15 to 44 a day over 2026-10-06 to 2026-10-12. Two thirds of commits touch only `docs/` (BACKLOG §374), and each
  pays the fast list (97.7 s and 122.5 s on two runs of 2026-10-13, load 4.7 to 8.7 on 10 cores).
- **The review is prose.** CLAUDE.md §12 asks for a different-lineage review before the tag; nothing reads whether one ran.
  `scripts/release-evidence.mjs:438-483` checks CI and the outside attestation (§18) and nothing about a review.
  `plugin/scripts/host-review.mjs` is the one Codex launcher (ADR-098 T1): `hostReview` (`:171`) returns the schema of ADR-062
  and `promptFileMain` (`:215`) prints Codex's final message for the skills, whose contract ends in
  `VERDICT: APPROVE | REQUEST CHANGES | EVIDENCE-LIMITED` (`plugin/skills/codex-review/SKILL.md:171`). Neither writes anything.
- **A commit is two calls.** `qh-check --fast` (`plugin/bin/qh-check:33-36`) records a pass that lets one commit through
  (ADR-081, `plugin/scripts/check-ledger.mjs:19`), then `git commit -F -`. The owner's standing rule says the commit goes
  ALONE, because a chained commit hides the check's exit code.
- **The owner's choices, 2026-10-13** (asked in this session): build `qh commit`, accepting it is a chain by construction;
  keep the review record in a local ledger beside `checks.jsonl`; include the docs lane, shipped only if a docs-only commit
  gets faster with the same verdicts on the last 20 docs-only commits.
- **Debt at authoring** (`python3 plugin/bin/adr-debt docs/adr`, 2026-10-13): no deferred row or open follow-up names a release
  command, a review record, a commit command or a docs lane. ADR-098's two open Follow-ups (`publish-verdict.mjs:338-339`, the
  cold review) are not about these and stay there.

The class: every step of CLAUDE.md §12 and §13 the agent performs by hand that a tool can perform or verify, and every check
of "may this be released" that is prose. Members in: the review (recorded and read), the commit (one call), the release chain
(one command), the docs-only fast check (a lane). Members left out: the outside attestation (§18), which needs a peer session
and stays a request the command stops for; the Codex findings' reconciliation, which is judgement; the version bump, an edit
the command stops for rather than makes.

## Existing Primitives Audit

- **`host-review.mjs`** (ADR-062, ADR-098 T1): reused as the only writer of the review record; its run and parse are unchanged.
- **`stateDir`, `appendEvent`** (`plugin/scripts/event-log.mjs`): where `checks.jsonl` lives; the review ledger sits beside it.
- **`outsideRunEvidence`** (`scripts/release-evidence.mjs:351`): the tag anchor (`describe --tags --abbrev=0 <sha>~1`) and the
  ancestry seam are reused for the review question, so the two questions cannot disagree about "since the last tag".
- **`qh-check`'s fast run and its ledger** (ADR-060, ADR-081): `--commit` runs it unchanged and commits only on its pass.
- **ADR-094's `prose` declaration** (`plugin/bin/qh-check:41-47`): reuses a pass when only declared prose paths changed. Not
  usable as the docs lane here: it asserts the check reads none of them, and this repository's check reads `docs/` (the corpus
  lint, `tests/corpus-lint.test.mjs`; the backlog and archive readers; the path-length and personal-path sweeps).
- **`attest-import.mjs`** (ADR-070): the outside attestation stays its job; the release command stops and names it.

## Decision

1. **A review is recorded by the tool that ran it (T1).** `host-review.mjs` appends one row to `<state dir>/reviews.jsonl` for
   every Codex run it starts: id, time, host, model, effort, the reviewed range as two full shas (`base`, `head`), the status,
   and the finding count. The JSON form takes its range from its scope (`base <ref>` is `<ref>..HEAD`, `commit <sha>` is
   `<sha>^..<sha>`, `uncommitted` is no range); the `--prompt-file` form takes a new `--range <base>..<head>`, and its status
   from the last `VERDICT:` line Codex printed (`APPROVE` clean, `REQUEST CHANGES` blocking, `EVIDENCE-LIMITED`
   evidence-limited; none is `unparsed`). The codex-review skill passes `--range`. A run that could not complete is recorded
   `unavailable`.
2. **`release-evidence` refuses an unreviewed behaviour change (T1).** Once CI and the outside run clear a sha, it lists the
   commits since the last tag that touch `plugin/` other than `plugin/.claude-plugin/plugin.json` alone, and each must lie in
   the range of a recorded review whose status is not `unavailable` or `unparsed`. One that does not makes the verdict
   UNPROVEN (exit 2) with the commits named. A review's own status is reported, never judged: a blocking review followed by
   fixes and a verification review is the practice (the owner, 2026-10-07), and which findings were fixed is not a fact the
   ledger holds.
3. **`qh-check --commit [<git commit arguments>]` (T2).** It refuses, before running anything, a working tree that differs
   from the index (an unstaged change, or an untracked file that is not ignored), because the check observes the working tree
   and the commit takes the index. It then runs the declared `fastCheck` (or the full check when none is declared) exactly as
   `qh-check --fast` does, prints its output, and only on exit 0 runs `git commit` with the given arguments and its stdin
   passed through. A red check never reaches git and the exit code is the check's; git's own exit code is returned
   otherwise. This keeps the reason for the owner's rule (no hidden check exit) while making the pair one call.
4. **`node scripts/release.mjs` runs this repository's release chain (T3).** Repository-only: it drives `selftest.yml`,
   `release-evidence` and `attest-import`, none of which ships. Each step is decided from what can be observed now, never
   from a state file, so a second run resumes where the first stopped: a clean tree; the version in `plugin.json` against the
   newest tag (stop: "bump"); a full `qh-check` pass on this tree (run it if missing); the dead-code scan; push when `HEAD` is
   ahead of `origin/main`; wait for the push's own run to exist; dispatch the campaign when the newest run for the sha is not
   a dispatch; wait for every job, bounded; `release-evidence` (stop on anything but SUCCESS, naming the action, including an
   outside run to ask for); `gh release create v<version> --target <full sha> --latest`. Exit 0 released, 1 a step failed,
   2 a step needs an action the command does not take, 3 a wait reached its deadline.
5. **A docs-only change runs a docs lane (T4).** `fastCheck` becomes `node scripts/fast-check.mjs`. When every changed path
   (staged, unstaged and untracked, against `HEAD`) is under `docs/`, it runs the test files that read `docs/`, derived from
   the test sources (a file that names `docs/` or lists tracked files), plus `mutate.mjs --stale`; anything else runs today's
   list unchanged. It ships only if, on the last 20 docs-only commits, the lane's verdict equals the current list's and its
   median time is lower; otherwise T4 records the measurement and `fastCheck` stays as it is.
6. **The rulebook points at the commands (T5).** CLAUDE.md §12 and §13 keep their headings and anchors and replace the
   procedure text with the commands that now carry it; the evidence moves to `.claude/rules/12-reviews.md` and
   `13-releasing.md`.
7. **Amended 2026-10-13, after the owner's Accept and before any task ran, from the record's cold read-only review** (six
   blocking findings, each checked against source; the task files carry the detail). Decision 1: `commit <sha>` is recorded
   exact, covering that commit alone, not `<sha>^..<sha>`; the skill's `EVIDENCE-LIMITED — …` line parses; a review handed its
   output writes no row. Decision 2: a row whose range is null or does not resolve covers nothing, and only a git failure on
   the release's own commits is UNPROVEN; the bump exemption is a first-parent diff that names only `plugin.json` and changes
   only its `"version"` line. Decision 3: a pathspec, `-p`, `--interactive`, `-o` or `-i` is refused before the check, and a
   commit whose `HEAD^{tree}` is not the checked tree is said and exits 1. Decision 4: a red check or a dead-code finding stops
   before any push, and no dispatch is made while another for the ref is in flight (the workflow's concurrency group keys on
   the event, `.github/workflows/selftest.yml:19-21`, so a push no longer cancels a dispatch and a second dispatch does).
   Decision 5: changed paths are read with `--no-renames`; the lane also takes a quoted `'docs'` path segment; seeded docs
   faults must turn the lane red, because a replay of commits the list already passed cannot; the no-ship branch withdraws
   the task.

**This fails if** a Codex run through the launcher leaves no row; a commit since the last tag that touches `plugin/` and no
recorded review covers passes `release-evidence`; `qh-check --commit` reaches `git commit` after a red check or on a working
tree that differs from the index; `release.mjs` tags a sha whose `release-evidence` is not SUCCESS, or dispatches before the
push's run exists; or the docs lane runs on a change outside `docs/`. Data that can produce each exists today: every task
builds its own fixture repository, and the 20 docs-only commits are in this repository's history.

## Alternatives Considered

- **A `qh` command with subcommands (`qh commit`, `qh review`, `qh release`)**, as the plan named them. Rejected: no `qh`
  binary exists, and a new one needs a `.cmd` twin, a forwarder, an MCP decision and a listing entry; `qh-check --commit` and
  the launcher already ship, and the release chain is this repository's own.
- **Ship the release command in `plugin/`.** Rejected: it drives a workflow, a gate and an importer that do not ship
  (`scripts/release-evidence.mjs`, `scripts/attest-import.mjs`, `.github/workflows/selftest.yml`), and `plugin/` cannot import
  `scripts/`. An adopter's release is their own.
- **A state file for a resumable release.** Rejected: the plan's principle is no new cache; every step's result is observable
  (a tag, a run, a ledger row), and a state file can disagree with them.
- **Commit the review record as a file, like an attestation.** Declined by the owner on 2026-10-13: a commit per review.
- **Require a `clean` review.** Rejected: after a blocking review the practice is fixes and one scoped verification review,
  whose own findings may be advisory or filed (the owner, 2026-10-07); requiring `clean` would restart the review loop the
  owner ended.
- **Use ADR-094's `prose` declaration as the docs lane.** Rejected in the Primitives Audit: this repository's check reads `docs/`.
- **Drop `qh commit` and keep two calls.** Offered as the recommendation; the owner chose to build it (Context).

## Component / Boundary Impact

`host-review.mjs` gains a writer and keeps one reason to change (how a review is run and what it said). `release-evidence`
gains a third question beside CI and the outside run. `qh-check.mjs` gains the commit step after its own run, behind a flag.
`scripts/release.mjs` and `scripts/fast-check.mjs` are new repository tools that call existing gates. No module moves.

## Wiring & Contract Changes

| Surface | Change | Producer | Consumer(s) |
|---------|--------|----------|-------------|
| `<state dir>/reviews.jsonl` | new ledger, one row per Codex run | T1 (`host-review.mjs`) | T1 (`release-evidence`), T3 |
| `host-review.mjs --range <base>..<head>` | new option on the `--prompt-file` form | T1 | the codex-review skill |
| `release-evidence` verdict | UNPROVEN (exit 2) when a behaviour commit since the last tag has no recorded review | T1 | T3, the owner |
| `qh-check --commit [args]` | new flag | T2 | the agent; T5 (CLAUDE.md) |
| `scripts/release.mjs` | new command, exit 0/1/2/3 | T3 | the agent; T5 |
| `.quality-harness.json` `fastCheck` | `node scripts/fast-check.mjs`, only if T4's measurement passes | T4 | `qh-check --fast`, `qh-check --commit` |
| CLAUDE.md §12, §13 | procedure text replaced by the commands | T5 | every session here |

## Inter-task Contracts

| Contract | Producing task | Consuming task(s) | Breaking? |
|----------|----------------|-------------------|-----------|
| `reviews.jsonl` rows and `release-evidence`'s review question | T1 | T3 | No — new |
| `qh-check --commit` | T2 | T5 | No — new flag |
| `scripts/release.mjs` | T3 | T5 | No — new |
| `scripts/fast-check.mjs` and the measurement | T4 | T5 | No — `fastCheck` changes only if it passes |

## Implementation

See `docs/adr/ADR-100-a-repeated-procedure-is-one-command/tasks/README.md`: T1 and T2 and T4 are independent; T3 needs T1;
T5 needs T2, T3 and T4.

## Consequences

- **Positive:** a release is one command the agent re-runs, from 34 calls; a review leaves evidence a gate reads, so §12 stops
  being prose; a commit is one call that cannot hide its check; a docs-only commit may stop paying the whole fast list.
- **Negative:** `release-evidence` can now refuse a release for a missing review, including a prose-only change under
  `plugin/`, which costs one scoped review. The review ledger is local: a release from another machine has no rows and is
  refused until a review runs there. `qh-check --commit` is a chain the owner's older rule forbade; the record says why it holds.
- **Neutral:** adopters get a `reviews.jsonl` beside `checks.jsonl` when they run the launcher; nothing of theirs reads it.

## Out of Scope

- Automating the outside run of §18 (permanent: boundary: it needs a peer session on a corpus we do not own, and a command that asked one would be a work order to another session, CLAUDE.md Cross-Session Collaboration rule 4)
- Bumping the version from the release command (permanent: boundary: the bump is an edit with its own commit, and the command stops and names it rather than writing to a tracked file)
- Judging whether a review's blocking findings were fixed (permanent: boundary: the ledger records what a reviewer said, not what was done about it; that is reconciliation, which is judgement)
- Phase 3, one reader of "is this tree checked" judged at the push (deferred: docs/BACKLOG.md §378)
- Phase 4, the owner's decision on CLAUDE.md §3 (deferred: docs/BACKLOG.md §378)

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| A review run outside the launcher (by hand, by another tool) is not recorded and a release is refused | Med | Low | the refusal names the commits; one scoped launcher review clears it |
| `--commit` used on a tree with unstaged work loses nothing but refuses | Med | Low | the refusal says which paths differ |
| The release command pushes or tags something the owner did not mean | Low | High | it runs only when asked to release, stops on any non-SUCCESS, and tags only the full sha `release-evidence` cleared |
| The docs lane misses a test that reads `docs/` without naming it | Med | Med | the derivation errs wide; the full gate before every push is unchanged; T4's 20-commit replay is the ship rule |
| A wait loop in the release command runs past what the session expects | Med | Low | every wait has a deadline and exits 3 naming what it waited for |

## Rollback

Revert the task commits. The review ledger is append-only and read only by `release-evidence`; a leftover file is inert.
`fastCheck` returns to the list by reverting `.quality-harness.json`.

## Follow-ups

- [ ] Name the catalogue entries that enforce each part in `Enforced-by:` once T1 to T4 have them
- [ ] An outside run of the changed readers before the release that carries T1 (CLAUDE.md §18)
