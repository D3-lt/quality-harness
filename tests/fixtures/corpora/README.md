# Consumer-shaped corpora

Each directory here is a small repository shaped the way an ADOPTER's is, not the way this
repository writes its own. `tests/corpus-matrix.test.mjs` copies each one into a temporary git
repository, reaches it and the plugin through a symlink, and runs `plugin/scripts/corpus-probe.mjs`
over it — every reader spawned as a process, the way an adopter's session runs them — then compares
the probe's JSON with the `expected.json` beside the corpus.

The `fixtures` component in this path is what keeps these records out of this repository's own
readers (`listedUnderUninterestingDirectory`, BACKLOG §263).

| Corpus | Shape it carries | Defect class it would have caught |
|---|---|---|
| `python-monorepo` | records under `services/api/docs/adr`, a `BACKLOG.md` beside them, a `done` claim with no evidence, a task with a real exit-0 row | §141 (a BACKLOG read as a record), v2.83.0 `eba8553` (a multi-line `def`), the unbacked-done rule |
| `dated-archive` | dated stems, a frozen `adr-archive/` with a real catalog, an active `archive-policy.md`, an `archive-service/` directory | §263 (archived records offered for retirement; the archive-prefix controls), ADR-063 ids |
| `ansible-nested-fixtures` | `roles/*/tasks/main.yml`, a nested `tests/fixtures/adr/` beside the real corpus | §263 (fixtures read as records), the Ansible `tasks` case (2026-09-19) |
| `madr` | MADR/Nygard records with `NNN-slug` names and `## Status` sections | ADR-038's `not-recognised` verdict, stated rather than a failure |
| `rust-crate` | a Rust test file whose tests sit after a lifetime, a raw lifetime, a loop label, quote char literals and a raw string; Tests rows giving the bare basename `lib_tests.rs`, beside an ignored same-named `scratch/lib_tests.rs` (force-added here, untracked in the staged copy) | §276 (a lifetime's quote read as a string, hiding the tests after it), §281 item 4 (a basename resolved from the disk, not from git) |
| `php-multi-root` | `docs/adr`, `docs/decisions`, and a `docs/adr-archive` with no Lifecycle marker; Consumes lines naming their producers over a shared backticked token; a `pnpm --filter` fence beside `php artisan test`; a human-observed sign-off quoting a refusal; a README `done` with no evidence | §279 item 2 (a cycle built from a shared token), §279 item 8 (a README claim not unbacked), §281 item 1 (pnpm's filter read as a test filter), §281 item 2 (a quoted refusal read as a stop), §281 item 3 (an unmarked archive read as live without saying so) |
| `js-vitest-spa` | a `package.json` with `lint` and `test` and no `.quality-harness.json`; a done task with a stale Tests row naming a `.test.ts`; a task READY and claimed done | §281 item 8 (the inferred-check sentence said the manifest "does not name" a step it names), §280 item 2 (a stale-row FAIL naming no `file:line`), §280 item 4 (READY and unbacked with nothing marking the overlap) |

`../foreign/` (cross-repo paths, a `partial` task, a `Blocked-on` task) is one more corpus; it
predates this directory and stays where it is because `tests/foreign-corpus.test.mjs` reads it there.

`expected.json` is REVIEWED, not snapshotted: each value was checked against what the corpus
should make a reader say, and a `disagreements` entry records where two readers currently
contradict each other on purpose — so that fixing the contradiction has to change the expectation
in the open (BACKLOG §265).

## What the matrix costs

ADR-064 T6 step 2. The three corpora T6 added (`js-vitest-spa`, `php-multi-root`,
`rust-crate`) took, per platform, in the dispatched release run for 2.109.0 (run
36126550653 at 7b0b71c; `gh run view --job <id> --log`, the "every reader answers as
reviewed" test durations):

| Platform | js-vitest-spa | php-multi-root | rust-crate | Added |
|---|---|---|---|---|
| ubuntu-latest | 3.93 s | 2.53 s | 1.08 s | 7.5 s |
| macos-latest | 3.21 s | 3.22 s | 1.49 s | 7.9 s |
| windows | 3.35 s | 4.91 s | 2.40 s | 10.7 s |

Tests inside `tests/corpus-matrix.test.mjs` run in sequence, so these add to that file's
wall time. The whole matrix of eight corpora took 18.5 s, 22.3 s and 32.8 s on the same run.
One run, measured on shared CI runners: read these as a scale, not a budget.
