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
2. [S2] The observations, each a function of `exec`: the tree is clean; `plugin.json`'s version against `git describe --tags --abbrev=0`; a full pass on this tree (`passedAlready`); `HEAD` against `origin/main`; the runs for the sha (`gh run list --commit <sha> --workflow selftest.yml`), split into push and dispatch; `release-evidence <sha>`'s exit code and last line; the tag and the release.
3. [S3] The steps, in §13's order, each skipped when its observation says done: stop "bump" (exit 2) when the version names an existing tag; run `qh-check` when no full pass; run `bash scripts/dead-code-scan.sh` (exit 3 there is UNPROVEN, stop); `git push origin main` when ahead; wait for the push run; `gh workflow run selftest.yml --ref main` when no dispatch run exists for the sha; wait for every job of the dispatch run; `release-evidence`.
4. [S4] Only on `release-evidence` exit 0, `gh release create v<version> --target <full sha> --latest --generate-notes` (or `--notes-file <path>` when given). Exit 2 from `release-evidence` prints its advice and stops with exit 2; exit 1 stops with exit 1.
5. [S5] Every wait polls at most once a minute and has a deadline (`--wait-max <minutes>`, default 90); past it, exit 3 naming the run and what it waited for. [proof: acceptance]
6. [S6] Catalogue entries for the step guards in S3 to S5, killed. [proof: mutation]

## Acceptance

```bash
test "$(node --test --test-reporter=tap tests/release.test.mjs 2>&1 | grep -cE '^ok [0-9]+ - (release stops and says bump when plugin.json names the newest tag.s version|release resumes from what it observes and repeats no step whose result is already there|release dispatches the campaign only after the push run exists|release tags only a sha release-evidence clears, with its full sha and --latest|a wait past its deadline exits 3 and names what it waited for)$')" = 5
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `release stops and says bump when plugin.json names the newest tag's version` | `tests/release.test.mjs` | exit 2, nothing pushed | — | S2, S3 |
| `release resumes from what it observes and repeats no step whose result is already there` | `tests/release.test.mjs` | pushed and dispatched already: no push, no dispatch, no check run; it goes to the wait | — | S2, S3 |
| `release dispatches the campaign only after the push run exists` | `tests/release.test.mjs` | with no push run listed, no `gh workflow run` is made before one appears | — | S3 |
| `release tags only a sha release-evidence clears, with its full sha and --latest` | `tests/release.test.mjs` | exit 0 tags with the 40-character sha; exit 2 and exit 1 never tag | — | S4 |
| `a wait past its deadline exits 3 and names what it waited for` | `tests/release.test.mjs` | a fake clock past `--wait-max` | — | S5 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the five tests |
| 2 — something selects it | the script's `main`; the agent runs it when asked to release |
| 3 — the caller can discover it | CLAUDE.md §13 (T5) and `--help` |
| 4 — it is used | the tool calls of the next release, against the 34 measured in the parent record |

## Mutation Log

## Invariants

- No tag without `release-evidence` exit 0 for the same full sha, read in the same run.
- No push while a dispatch run for the sha is in flight (CLAUDE.md §13 step 6).
- No step writes a tracked file.

## Risks

- A real `gh` or `git push` reached from a test: every test uses a fake `exec` and a temporary repository; the script's `main` is guarded by `isMainModule` (tests/package.test.mjs asserts importing runs nothing).

## Stop Condition

Stop and ask if a step of §13 cannot be decided from an observation without a state file, or if `release-evidence`'s output cannot be read without parsing prose beyond its exit code.

## Out of Scope

- The outside run and its attestation (the command stops and names them).
- The version bump (the command stops and names it).

## Verification Log
