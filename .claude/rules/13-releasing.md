---
paths:
  - "plugin/.claude-plugin/plugin.json"
  - ".github/**"
  - "scripts/release-evidence.mjs"
  - "scripts/land.mjs"
  - "scripts/release.mjs"
---

# Why §13: releasing

The rules are in `CLAUDE.md` §13. This file is the evidence behind them.

**A green shipped change is released, not parked** — standing rule, set by the owner 2026-09-04. A
fix that exists only on `main` helps nobody, and the judgement about whether users want it is made
by shipping it rather than by holding it. Two things that are NOT exceptions, because both have been
mistaken for one here:

- **`plugin/` unchanged.** Then there is nothing to release; say so and stop (v2.57.1 was cut on a
  bare version bump, and the notes had to lead with "nothing shipped changed").
- **CI not finished.** `INCOMPLETE` is not green.

## Why every job's conclusion is read, never the watch's exit code

`gh run watch --exit-status` exited **0** on a CANCELLED run on 2026-09-02 (gh 2.98.0) — it prints
`X The operation was canceled.` and returns success, because a cancelled run did not *fail*. Most
jobs were green and the cancelled ones were the mutation campaign, so the release would have carried
no mutation evidence while looking verified. `scripts/release-evidence.mjs` exists for exactly this.

Its exit codes, from its own header, which wins over any summary of it: **0** every job concluded
success · **1** a job did NOT conclude success (failed, cancelled, timed out, skipped) · **2** could
not look at all (no `gh`, no run for the sha, unreadable answer) · **3** not finished yet. Exit 1 is
not "a job failed": a run whose shards were cancelled by the next push reports `FAILED … cancelled`
and exits 1, and reading that as a defect sent a session hunting for one that was not there on
2026-09-04. `cancelled` is deliberately not `success` (BACKLOG §104); it is not `failure` either.

The raw form, when you want it:

    gh run view <id> --json conclusion,jobs --jq '"\(.conclusion)", (.jobs[] | "\(.name): \(.conclusion)")'

## Why counts are never carried

The release step once said "wait for all N jobs … mutations 1-4/4" until 2026-09-03; BACKLOG §106
had resharded the campaign and both numbers were wrong the moment it landed. A remembered count is
how a missing job goes unnoticed — ask for the list.

## Why a push no longer cancels a release run

`.github/workflows/selftest.yml` sets `cancel-in-progress: true` with the event and the ref in the group key
(`selftest-${{ github.event_name }}-${{ github.ref }}`, :20-22). A push therefore cancels only an earlier push run on the
same ref, never the dispatched run a release is cut from, and a second dispatch on the ref does cancel the first, which is
the case the command waits out (step 6). Before the event was in the key, the next push to `main` killed the release run,
silently (BACKLOG §104).

## Why a release campaign is full, and why it is asked for by hand

`.github/workflows/selftest.yml` passes `--no-cache` when, and only when, the run was raised by
`workflow_dispatch`. ADR-023 lets an ordinary push reuse a `RED` verdict whose subject and tests are
byte-identical to the run that took it — that is for iteration, and a released artifact is never
partly evidenced by a verdict taken at another commit.

⚠ **This paragraph used to say `--no-cache` fires "for a tag and for `main`", and half of that was a
branch nothing could take.** This workflow has no tag trigger — `on: push: branches: [main, 'land/**']`,
`pull_request`, `workflow_dispatch` — and no run has ever been raised by a tag ref, so the tag half
was dead code, while the `main` half made every push pay a 581-mutant campaign at about 23 minutes:
a backlog edit, a test-only change, nine times in a day. ADR-023's own kill criterion said a wrong
reuse "surfaces at the next tag precisely because tags keep running the whole catalogue", and that
mechanism did not exist; what actually carried it was the `main` half (BACKLOG §142).

So the full campaign is now the run you **ask for**, and the thing that stops that becoming a quiet
evidence hole is `release-evidence.mjs`: it reads the run's `event`, and a sha whose newest run was a
push is `cached` — exit 2, "could not look at a full campaign", never `SUCCESS`. A run that does not
say what raised it is `unreadable` for the same reason. Both are mutants.

⚠ **AND THE ORDER MATTERS BY ONE SECOND.** The push and the dispatch raise runs at the same sha, and
`release-evidence` judges the NEWEST — so which one it reads is decided by whether the push webhook
or the `gh workflow run` API call registers first. Measured over four releases on 2026-09-07: the
push won by one second on two of them and the release was refused `CACHED` both times, costing a full
ten-minute campaign each (BACKLOG §159). **Wait until the push's own run exists before dispatching**
(`gh run list --commit <sha> --limit 1` until it answers). That makes the dispatch unambiguously
newer and needs no change to the tool — §154 already breaks an exact TIE toward `workflow_dispatch`,
and this is not a tie, it is a loss.

`gh release create vX.Y.Z --latest` — `--latest` is not the default and has been forgotten.

## The command (ADR-100, 2026-10-13)

`node scripts/release.mjs` performs the steps above from observations: the tag list for "bump", a full `qh-check --again`
run here, judged contended by its load at the start and by a sample taken once the run's own load has decayed (every 30 s,
for at most 4 minutes, until it is at or below the core count; ADR-115: the sample at exit held the run's own load, so every
pass on this busy machine read as contended), and taken again once the load is below the count when it passed contended, `merge-base --is-ancestor` against `origin/main` for the push,
`gh run list --commit` for the push run and the dispatch, `release-evidence` for the verdict. It keeps no state file, so it
can never disagree with what those say. The old "do not push while the release run is in flight" predates the event in the
workflow's concurrency key (`.github/workflows/selftest.yml:20-22`): since then a push cancels only an earlier push run,
and a second dispatch cancels the first, which is the case the command waits out.

## Landing (ADR-118, 2026-10-20)

`main` carries a ruleset with no bypass (`.github/rulesets/main.json`), so the forge refuses a push whose sha has not
passed main's required checks, whoever pushes. `node scripts/land.mjs` is the one way a sha reaches main: it reads the
required contexts from the forge, refuses one no job of the workflow at the sha declares, pushes the sha to
`land/<sha>`, waits for each context's newest check-run of its app to succeed (`skipped` and `neutral` stop it, though the
forge counts them as passing), checks local main is still the sha, pushes main and reads the forge's main back. The cost,
measured 2026-10-19 on run 39294734276: about 47 min per landing, set by `coverage floor`. What it cannot close: a sha
whose own workflow skips a required job passes the forge; that change is reviewed (§12).

The ruleset is applied by hand, never by `land.mjs`: `gh api -X POST repos/{owner}/{repo}/rulesets --input
.github/rulesets/main.json` creates it (ruleset 25462988 was made that way, ADR-118's Follow-ups), and
`gh api -X PUT repos/{owner}/{repo}/rulesets/<id> --input .github/rulesets/main.json` updates it. `land.mjs --dry-run`
only reads it back: it takes the one ruleset whose name is the file's `name`, refuses none or several, and names every
field that differs. A renamed required CI job therefore needs the file edited and PUT before a landing can pass, since
`land` refuses a required context no job of the workflow declares.

## One landing, one run (ADR-126, 2026-10-22)

Measured over the week before: three full CI runs per released sha (the `land/<sha>` run, main's own push run once it
fast-forwarded, and the dispatched campaign), and a second landing whenever the bump or an attestation came after the first.
Main's push run caught nothing the land run had not; every failure it alone saw was non-deterministic. So the workflow no
longer runs on a push to main, every land push runs the whole mutation catalogue, and `release-evidence` reads a push run on
`land/<its sha>` as a full campaign. The outside run is asked for after that run is green, which is why an attestation may
arrive after the landing; `release.mjs` takes it as evidence on a sha already on main. Each wait has its own deadline,
since one bound over the landing (about 30 min once the coverage floor is two jobs) and the campaign together ran out on
3.8.52 with nothing wrong.
