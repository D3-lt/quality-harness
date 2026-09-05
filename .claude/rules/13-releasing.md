---
paths:
  - "plugin/.claude-plugin/plugin.json"
  - ".github/**"
  - "scripts/release-evidence.mjs"
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

## Why no push lands while a release run is in flight

`.github/workflows/selftest.yml` sets `cancel-in-progress: true`, so the next push to `main` kills
the run you are releasing on — correct for development, wrong for a release, and silent either way.
Either wait, or re-run at the new head and release that (BACKLOG §104).

## Why a release campaign is full, and why it is asked for by hand

`.github/workflows/selftest.yml` passes `--no-cache` when, and only when, the run was raised by
`workflow_dispatch`. ADR-023 lets an ordinary push reuse a `RED` verdict whose subject and tests are
byte-identical to the run that took it — that is for iteration, and a released artifact is never
partly evidenced by a verdict taken at another commit.

⚠ **This paragraph used to say `--no-cache` fires "for a tag and for `main`", and half of that was a
branch nothing could take.** This workflow has no tag trigger — `on: push: branches: [main]`,
`pull_request`, `workflow_dispatch` — and no run has ever been raised by a tag ref, so the tag half
was dead code, while the `main` half made every push pay a 581-mutant campaign at about 23 minutes:
a backlog edit, a test-only change, nine times in a day. ADR-023's own kill criterion said a wrong
reuse "surfaces at the next tag precisely because tags keep running the whole catalogue", and that
mechanism did not exist; what actually carried it was the `main` half (BACKLOG §142).

So the full campaign is now the run you **ask for**, and the thing that stops that becoming a quiet
evidence hole is `release-evidence.mjs`: it reads the run's `event`, and a sha whose newest run was a
push is `cached` — exit 2, "could not look at a full campaign", never `SUCCESS`. A run that does not
say what raised it is `unreadable` for the same reason. Both are mutants.

`gh release create vX.Y.Z --latest` — `--latest` is not the default and has been forgotten.
