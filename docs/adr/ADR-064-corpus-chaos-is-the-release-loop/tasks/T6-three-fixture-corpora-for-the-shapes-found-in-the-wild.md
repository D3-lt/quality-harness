# Task ADR-064-T6: Three fixture corpora for the shapes found in the wild

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** L (three corpora, two matrix comparisons)
**Owner:** unassigned
**Produces:** `tests/fixtures/corpora/{rust-crate,php-multi-root,js-vitest-spa}`
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `each corpus answers as reviewed`, `each pins the finding it came from`, `an unexpected reason fails the matrix`

## Goal

Three fixture corpora. Each is a small repository with a reviewed `expected.json` and a row in `tests/fixtures/corpora/README.md`, and the matrix runs each on all three CI platforms. Each pins only what the matrix can observe: adrLint verdicts and reasons, work-next's sets, and SessionStart lines.

- `rust-crate`:
  - a Rust test file with lifetimes, labels, raw lifetimes, char literals and raw strings ahead of its tests, so adrLint PASSes (§276 and the review-round shapes);
  - a Tests row resolved by basename, with an untracked same-named decoy under a gitignored `target/` (its own `.gitignore`), so resolution comes from git, not the disk (§281 item 4's CLAUDE.md §8 half).
- `php-multi-root`:
  - `docs/adr` and `docs/decisions`;
  - an unmarked `docs/adr-archive`, read as live and named: `workNext.unmarkedArchives` plus a SessionStart line (§281 item 3);
  - Consumes lines naming their producers, with no cycle (§279 items 2 and 3);
  - a README-marked-done task with no evidence, which is unbacked (§279 item 8);
  - a pnpm `--filter` beside `php artisan test`, which PASSes (§281 item 1);
  - a human-observed sign-off that quotes a program's refusal, which reads as done (§281 item 2).
- `js-vitest-spa`:
  - a `package.json` with `lint` and `test`, whose inferred-check sentence appears in SessionStart (§281 item 8);
  - a stale Tests row naming a `.test.ts`, which FAILs with a reason naming its `file:line` (§280 item 2);
  - a task both READY and claimed done, found in `workNext.readyButClaimedDone` (§280 item 4).

The matrix gains two comparisons, each read only when an `expected.json` names it: `reasonMatches` on an adrLint entry, and any `workNext` key beyond the fixed set it compares today. The five existing corpora name neither, so they answer exactly as before.

This task runs after the batch fixes that precede ADR-064's execution have landed on `main`; its Stop Condition says what happens if one has not.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/fixtures/corpora/rust-crate/` | add | the Rust corpus and its expected.json |
| `tests/fixtures/corpora/php-multi-root/` | add | the PHP multi-root corpus and its expected.json |
| `tests/fixtures/corpora/js-vitest-spa/` | add | the JS/vitest corpus and its expected.json |
| `tests/fixtures/corpora/README.md` | edit | one row per corpus, naming the BACKLOG sections it pins |
| `tests/corpus-matrix.test.mjs` | edit | `reasonMatches` and the extra `workNext` keys |
| `tests/mutations.json` | edit | mutants |

## Ordered Steps

1. [S1] Write the test(s) below and see each fail on an assertion (TDD red).
2. [S2] Author each corpus from the finding's shape, never from a peer's content (CLAUDE.md §6). Add the two matrix comparisons. Write `expected.json` by reading the probe's answer and checking each value against the finding it pins. Record the matrix's added time per platform in the fixtures README, from the CI log.
3. [S3] Run the fence green, and record mutants with `adr-verify --mutant`: revert one fix each corpus pins, and see that corpus's matrix test fail; drop the `reasonMatches` comparison. [proof: mutation]

## Acceptance

```bash
set -o pipefail
node --test --test-reporter=tap tests/corpus-matrix.test.mjs 2>&1 | tee /dev/stderr | grep -cxE 'ok [0-9]+ - (corpus rust-crate: every reader answers as reviewed, through a symlink|corpus php-multi-root: every reader answers as reviewed, through a symlink|corpus js-vitest-spa: every reader answers as reviewed, through a symlink)' | grep -qx 3
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `corpus rust-crate: every reader answers as reviewed, through a symlink` | `tests/corpus-matrix.test.mjs` | the Rust shapes lint PASS, and the basename row resolves to the tracked file, not the decoy | none | S1, S2 |
| `corpus php-multi-root: every reader answers as reviewed, through a symlink` | `tests/corpus-matrix.test.mjs` | no dependency cycle; the unmarked archive named in `workNext.unmarkedArchives` and SessionStart; the pnpm record PASSes; the quoted sign-off is not unbacked; the README claim is | none | S1, S2 |
| `corpus js-vitest-spa: every reader answers as reviewed, through a symlink` | `tests/corpus-matrix.test.mjs` | the inferred-check sentence in SessionStart; the stale row's FAIL reason matches its `file:line`; the READY-and-claimed-done task in `workNext.readyButClaimedDone` | none | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the three corpora |
| 2 — something selects it | the matrix's discovery by directory |
| 3 — the caller can discover it | the fixtures README rows |
| 4 — it is used | every CI platform runs them |

## Mutation Log

## Invariants

- No fixture holds a path, name or string copied from a peer's repository.
- The five existing corpora answer exactly as before.

## Risks

- An `expected.json` can pin an accident; each pinned value names the BACKLOG section it comes from.

## Stop Condition

Stop and ask if a pinned fix is not on `main` when this task starts, or if a shape cannot be built without copying a peer's content.

## Out of Scope

- §280 item 1, qh-check's own summary line (permanent: boundary: the probe never runs qh-check, so the matrix cannot observe it; `tests/qh-check-shell.test.mjs` pins it)
- §281 item 4's time cost over a large build tree (permanent: boundary: a fixture small enough to commit cannot reproduce 1.3 million directory entries; `timings[]` (T4) makes it visible in a real run)
- Inline `### T<n>` tasks named as unread (permanent: boundary: that is an adr-lint advice line, and the probe keeps no advice; its unit test in `tests/gates.test.mjs` pins it)
- A Go corpus (deferred: docs/BACKLOG.md §282)
- A Windows-only corpus (permanent: boundary: the matrix already runs every corpus on windows-latest)

## Verification Log
