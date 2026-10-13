# Task ADR-100-T3: `node scripts/release.mjs` runs this repository's release chain, resumably, from what it observes

**Depends-on:** T1
**Covers:** none — no spec
**Estimated scope:** M (one new repository script and its tests)
**Owner:** unassigned
**Produces:** `scripts/release.mjs`
**Consumes:** `release-evidence`'s review question (T1)
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `each step is decided from what is observed`, `no tag without SUCCESS`, `the dispatch waits for the push run`, `every wait has a deadline`

## Goal

One command takes a committed, bumped tree to a tagged release, running each step of CLAUDE.md §13 only when what it can observe
says the step has not happened, and stopping with the action named whenever a step needs one it does not take.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `scripts/release.mjs` | add | the chain, with `exec` and clock seams |
| `tests/release.test.mjs` | add | the five tests below, against fake `git`, `gh` and check commands |
| `tests/mutations/scripts/release.mjs.json` | add | entries for each step's guard |

## Ordered Steps

1. [S1] Write `tests/release.test.mjs` and run the Acceptance fence red. [proof: acceptance]
2. [S2] The observations, each a function of `exec`, with the full sha read once at the start and named in every later step and line: the tree is clean; `plugin.json`'s version against the newest `v*` tag (`git tag --list 'v*' --sort=-v:refname`, not `describe`); a full pass on this tree (`passedAlready`); `HEAD` against `origin/main`; the runs for the sha (`gh run list --commit <sha> --workflow selftest.yml`), split into push and dispatch, with each one's status; `release-evidence <sha>`'s exit code and last line; the tag and the release.
3. [S3] The steps, in §13's order, each skipped when its observation says done: stop "bump" (exit 2) when a `v<version>` tag already exists; run `qh-check` when no full pass, and stop with its exit code (exit 1) when it is red, before any push; run `bash scripts/dead-code-scan.sh` and stop on any non-zero exit (1 is a finding, 3 is UNPROVEN), before any push; `git push origin main` when ahead; wait for the push run; `gh workflow run selftest.yml --ref main` only when no dispatch run for the sha exists, and never while another dispatch run for the ref is in flight (the concurrency group keys on the event, `.github/workflows/selftest.yml:19-21`, so a second dispatch cancels the first, while a push does not); wait for every job of the dispatch run; `release-evidence`, where exit 3 (not finished) is waited on like any run.
4. [S4] Only on `release-evidence` exit 0, `gh release create v<version> --target <full sha> --latest --generate-notes` (or `--notes-file <path>` when given). Exit 2 from `release-evidence` prints its advice and stops with exit 2; exit 1 stops with exit 1.
5. [S5] Every wait polls at most once a minute and has a deadline (`--wait-max <minutes>`, default 90); past it, exit 3 naming the run and what it waited for. [proof: acceptance]
6. [S6] Catalogue entries for the step guards in S3 to S5, killed. [proof: mutation]

## Acceptance

```bash
test "$(node --test --test-reporter=tap tests/release.test.mjs 2>&1 | grep -oE '^ok [0-9]+ - (release stops and says bump when plugin.json names the newest tag.s version|release resumes from what it observes and repeats no step whose result is already there|release dispatches the campaign only after the push run exists|release tags only a sha release-evidence clears, with its full sha and --latest|a wait past its deadline exits 3 and names what it waited for|a red check or a dead-code finding stops the release before any push)$' | sed -E 's/^ok [0-9]+ - //' | sort -u | wc -l | tr -d ' ')" = 6
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `release stops and says bump when plugin.json names the newest tag's version` | `tests/release.test.mjs` | exit 2, nothing pushed | — | S2, S3 |
| `release resumes from what it observes and repeats no step whose result is already there` | `tests/release.test.mjs` | pushed and dispatched already: no push, no dispatch, no check run; it goes to the wait | — | S2, S3 |
| `release dispatches the campaign only after the push run exists` | `tests/release.test.mjs` | with no push run listed, no `gh workflow run` is made before one appears | — | S3 |
| `release tags only a sha release-evidence clears, with its full sha and --latest` | `tests/release.test.mjs` | exit 0 tags with the 40-character sha; exit 2 and exit 1 never tag | — | S4 |
| `a wait past its deadline exits 3 and names what it waited for` | `tests/release.test.mjs` | a fake clock past `--wait-max` | — | S5 |
| `a red check or a dead-code finding stops the release before any push` | `tests/release.test.mjs` | `qh-check` exit 1, dead-code exit 1 and exit 3 each stop with no `git push` and no `gh` call | — | S3 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the six tests |
| 2 — something selects it | the script's `main`; the agent runs it when asked to release |
| 3 — the caller can discover it | CLAUDE.md §13 (T5) and `--help` |
| 4 — it is used | the tool calls of the next release, against the 34 measured in the parent record |

## Mutation Log

## Invariants

- No tag without `release-evidence` exit 0 for the same full sha, read in the same run.
- No dispatch while another dispatch run for the ref is in flight (it would cancel it); the push is safe beside a dispatch run because the concurrency group keys on the event (`.github/workflows/selftest.yml:19-21`), which CLAUDE.md §13 step 6 predates and T5 re-reads.
- No push after a red check or a dead-code finding.
- No step writes a tracked file.

## Risks

- A real `gh` or `git push` reached from a test: every test uses a fake `exec` and a temporary repository; the script's `main` is guarded by `isMainModule` (tests/package.test.mjs asserts importing runs nothing).

## Stop Condition

Stop and ask if a step of §13 cannot be decided from an observation without a state file, or if `release-evidence`'s output cannot be read without parsing prose beyond its exit code.

## Out of Scope

- The outside run and its attestation (the command stops and names them).
- The version bump (the command stops and names it).

## Verification Log
