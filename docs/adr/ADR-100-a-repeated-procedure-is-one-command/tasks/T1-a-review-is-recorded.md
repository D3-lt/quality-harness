# Task ADR-100-T1: A Codex review is recorded where release-evidence reads it, and an unreviewed plugin change is refused

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** M (the launcher, the release gate, the codex-review skill)
**Owner:** unassigned
**Produces:** `<state dir>/reviews.jsonl` rows; `host-review.mjs --range`; `release-evidence`'s review question
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `a launcher run leaves one row`, `the status is read from the VERDICT line`, `an uncovered plugin commit is refused`, `a bump alone needs no review`, `main asks the review question`

## Goal

Every Codex run `host-review.mjs` starts leaves one row naming the range it reviewed and what it said, and `release-evidence`
refuses a sha whose plugin commits since the last tag no recorded review covers.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/host-review.mjs` | edit | append a row per run (both forms); `--range <base>..<head>` on the `--prompt-file` form; status from the last `VERDICT:` line |
| `scripts/release-evidence.mjs` | edit | `reviewEvidence(sha, exec, ledger)` beside `outsideRunEvidence`, asked from `main` once CI and the outside run clear the sha; usage text and exit-code header |
| `plugin/skills/codex-review/SKILL.md` | edit | the launcher line passes `--range` (what selects the recorded range) |
| `tests/review-ledger.test.mjs` | add | the five tests below |
| `tests/mutations/plugin/scripts/host-review.mjs.json`, `tests/mutations/scripts/release-evidence.mjs.json` | edit | catalogue entries for the writer, the status parse, the coverage rule and the `main` call |

## Ordered Steps

1. [S1] Write `tests/review-ledger.test.mjs` and run the Acceptance fence red (TDD red: the tests fail, the row does not exist). [proof: acceptance]
2. [S2] The writer: after a run (a result or a reason), append `{id, at, host, model, effort, base, head, status, findings}` to `reviews.jsonl` under `stateDir(repo)`; `base` and `head` are full shas resolved before the run, or null when the scope names no range. A row that cannot be written is said on stderr and changes nothing else.
3. [S3] The `--prompt-file` form: parse `--range <base>..<head>` (refuse a malformed one with exit 2, as other bad usage), and read the status from the last line matching `^VERDICT:\s*(APPROVE|REQUEST CHANGES|EVIDENCE-LIMITED)\s*$`; none is `unparsed`.
4. [S4] `reviewEvidence`: the tag anchor of `outsideRunEvidence`; the commits `git rev-list <tag>..<sha> -- plugin/` minus those whose diff names only `plugin/.claude-plugin/plugin.json`; each must satisfy `merge-base --is-ancestor <c> <head>` and not `--is-ancestor <c> <base>` for a row with a status other than `unavailable` or `unparsed`. A git answer it cannot get is UNPROVEN, never covered (ADR-005).
5. [S5] `main` asks it after the outside run; UNPROVEN names the uncovered commits and says to run one scoped review through the launcher. Update the usage text and the exit-code header, which wins over any summary (CLAUDE.md §13).
6. [S6] The codex-review skill's launcher line passes `--range <base>..<head>` for the scope it reviews. [proof: acceptance]
7. [S7] Catalogue entries for S2 to S5, each killed by `mutate.mjs --case`. [proof: mutation]

## Acceptance

```bash
test "$(node --test --test-reporter=tap tests/review-ledger.test.mjs 2>&1 | grep -cE '^ok [0-9]+ - (every Codex run the launcher starts leaves one review row naming its range and status|the prompt-file form takes its status from the last VERDICT line, and none is unparsed|release-evidence refuses a plugin commit since the last tag that no review covers, and a covering review clears it|a version bump alone needs no review, and an unavailable or unparsed review covers nothing|release-evidence asks the review question from its main path)$')" = 5 \
  && node --test tests/host-review.test.mjs tests/release-evidence.test.mjs \
  && grep -q -- '--range' plugin/skills/codex-review/SKILL.md
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `every Codex run the launcher starts leaves one review row naming its range and status` | `tests/review-ledger.test.mjs` | both forms, through a fake Codex binary, write one row with full shas; an unavailable run is recorded as such | — | S2 |
| `the prompt-file form takes its status from the last VERDICT line, and none is unparsed` | `tests/review-ledger.test.mjs` | APPROVE, REQUEST CHANGES, EVIDENCE-LIMITED, a quoted earlier VERDICT, and no VERDICT | — | S3 |
| `release-evidence refuses a plugin commit since the last tag that no review covers, and a covering review clears it` | `tests/review-ledger.test.mjs` | in a fixture repository with a tag, an uncovered commit is UNPROVEN and named; a row whose range holds it clears it; a row ending before it does not | — | S4 |
| `a version bump alone needs no review, and an unavailable or unparsed review covers nothing` | `tests/review-ledger.test.mjs` | the bump exemption and its twin (a bump plus any other plugin path needs one) | — | S4 |
| `release-evidence asks the review question from its main path` | `tests/review-ledger.test.mjs` | `main` with an `exec` seam reports UNPROVEN for an uncovered commit after a green run and an attested outside run | — | S5 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the writer and `reviewEvidence` unit tests |
| 2 — something selects it | `hostReview` and `promptFileMain` call the writer; `main` calls `reviewEvidence`; a catalogue entry deletes each call |
| 3 — the caller can discover it | the codex-review skill's launcher line; `release-evidence --help` |
| 4 — it is used | `release-evidence` at the next release reports the review coverage |

## Mutation Log

## Invariants

- The launcher's run, prompt and parse are unchanged; only a row is added after it.
- A review that did not complete never covers a commit.
- `release-evidence`'s existing verdicts and exit codes are unchanged for a sha whose plugin commits are covered.

## Risks

- A row written with a resolved path or a home directory in it: the row holds shas and words only, never a path.
- The `VERDICT:` parse reads a quoted contract line: only the last matching line counts, and the test quotes an earlier one.

## Stop Condition

Stop and ask if the codex-review skill's scope cannot be expressed as one range, or if the release-evidence tests that lock its
current behaviour (`scripts/test-locks.py tests/release-evidence.test.mjs`, 24 locks on 2026-10-13) would need to change.

## Out of Scope

- Recording a review run outside the launcher (Decision 1 of the parent record).
- Judging whether blocking findings were fixed.

## Verification Log
