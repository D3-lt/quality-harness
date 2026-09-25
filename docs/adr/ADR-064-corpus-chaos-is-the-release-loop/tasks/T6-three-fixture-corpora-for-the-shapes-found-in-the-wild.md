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
  - a Tests row resolved by basename, with an untracked same-named decoy in `scratch/`, which the fixture's own `.gitignore` ignores, so resolution comes from git, not the disk (§281 item 4's CLAUDE.md §8 half). Not `target/`: both the old disk walk and the git listing exclude it, so a decoy there pins nothing.
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
| `the matrix discovers the three ADR-064 corpora` | `tests/corpus-matrix.test.mjs` | the three corpora are selected by directory discovery; the fence also requires `corpus <name>: every reader answers as reviewed, through a symlink` to pass for each — Rust shapes lint PASS and the basename row resolves from git; the PHP corpus's cycle-free Consumes, unmarked archive, pnpm filter, quoted sign-off and README claim; the SPA's inferred-check sentence, the stale row's `file:line` and the READY-and-claimed-done task. Those per-corpus tests are named by a template, which no test lock can extract, so this row names the literal test | none | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the three corpora |
| 2 — something selects it | the matrix's discovery by directory |
| 3 — the caller can discover it | the fixtures README rows |
| 4 — it is used | every CI platform runs them |

## Mutation Log
- 2026-09-25 · 286cbb1* · mutant killed · exit 1 · `plugin/bin/adr-lint` · reverts §281 item 4: the basename row resolves against the disk, and the untracked decoy makes it ambiguous · acceptance-sha256:b747f8e28882f2fecb9572e5c6f2a5397ede3a46e2e27354cecd7f97f80671bd · covers:each pins the finding it came from
- 2026-09-25 · 286cbb1* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · reverts §281 item 3: the unmarked archive is no longer named · acceptance-sha256:b747f8e28882f2fecb9572e5c6f2a5397ede3a46e2e27354cecd7f97f80671bd · covers:each corpus answers as reviewed
- 2026-09-25 · 286cbb1* · mutant killed · exit 1 · `plugin/bin/adr-lint` · reverts §280 item 2: the stale row's FAIL no longer names its line · acceptance-sha256:b747f8e28882f2fecb9572e5c6f2a5397ede3a46e2e27354cecd7f97f80671bd · covers:an unexpected reason fails the matrix

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
- 2026-09-25 · 286cbb1 · exit 1 · `set -o pipefail …` · acceptance-sha256:b747f8e28882f2fecb9572e5c6f2a5397ede3a46e2e27354cecd7f97f80671bd · ms:3594 · test-lock-sha256:cb7bfdd5eb7f3564148f8eb4758123733791158104979657c71e2efe2077b91d · test-lock-b64:Y2hlY2sJZjdlMjUxYjUwM2NhZWZlY2JhMTEyMjFhZDJjYzIyMjc3MDYxNDA1NzNiZWEyMGQ2MWQ5OTg3ZGE3YjYwNTI1Ngp1bnByb3Zlbgl0ZXN0cy9jb3JwdXMtbWF0cml4LnRlc3QubWpzCWNvcnB1cyBqcy12aXRlc3Qtc3BhOiBldmVyeSByZWFkZXIgYW5zd2VycyBhcyByZXZpZXdlZCwgdGhyb3VnaCBhIHN5bWxpbmsKdW5wcm92ZW4JdGVzdHMvY29ycHVzLW1hdHJpeC50ZXN0Lm1qcwljb3JwdXMgcGhwLW11bHRpLXJvb3Q6IGV2ZXJ5IHJlYWRlciBhbnN3ZXJzIGFzIHJldmlld2VkLCB0aHJvdWdoIGEgc3ltbGluawp1bnByb3Zlbgl0ZXN0cy9jb3JwdXMtbWF0cml4LnRlc3QubWpzCWNvcnB1cyBydXN0LWNyYXRlOiBldmVyeSByZWFkZXIgYW5zd2VycyBhcyByZXZpZXdlZCwgdGhyb3VnaCBhIHN5bWxpbms
  ```
  --- last 10 line(s) of stderr (of 40 after folding 40 raw)
    ...
  1..5
  # tests 5
  # suites 0
  # pass 5
  # fail 0
  # cancelled 0
  # skipped 0
  # todo 0
  # duration_ms 3536.01175
  ```
- 2026-09-25 · 286cbb1* · exit 0 · `set -o pipefail …` · acceptance-sha256:b747f8e28882f2fecb9572e5c6f2a5397ede3a46e2e27354cecd7f97f80671bd · ms:6731
- 2026-09-25 · 286cbb1* · exit 0 · `set -o pipefail …` · acceptance-sha256:b747f8e28882f2fecb9572e5c6f2a5397ede3a46e2e27354cecd7f97f80671bd · ms:6815
- 2026-09-25 · 286cbb1* · exit 0 · `set -o pipefail …` · acceptance-sha256:b747f8e28882f2fecb9572e5c6f2a5397ede3a46e2e27354cecd7f97f80671bd · ms:6765
- 2026-09-25 · 286cbb1* · exit 0 · `adr-verify --relock --replace-hashes` · acceptance-sha256:b747f8e28882f2fecb9572e5c6f2a5397ede3a46e2e27354cecd7f97f80671bd · ms:0 · test-lock-sha256:981c058dd0c78204042b3367aefc0a78aa5933fdc5437b7a0d44ec2f6d32a9ef · test-lock-b64:Y2hlY2sJZjdlMjUxYjUwM2NhZWZlY2JhMTEyMjFhZDJjYzIyMjc3MDYxNDA1NzNiZWEyMGQ2MWQ5OTg3ZGE3YjYwNTI1Ngpib2R5CXRlc3RzL2NvcnB1cy1tYXRyaXgudGVzdC5tanMJdGhlIG1hdHJpeCBkaXNjb3ZlcnMgdGhlIHRocmVlIEFEUi0wNjQgY29ycG9yYQk1ZDFkMjY0NzgzOGFkMTFjYTk0MDkyZTM3MDkxODYzN2JmNTQ4ZjQ5OWQwNmI4ZGM1NzJlODUyNzE1NzFkYzZm · test-lock-kind:replace
