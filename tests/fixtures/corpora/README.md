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

`../foreign/` (cross-repo paths, a `partial` task, a `Blocked-on` task) is the fifth corpus; it
predates this directory and stays where it is because `tests/foreign-corpus.test.mjs` reads it there.

`expected.json` is REVIEWED, not snapshotted: each value was checked against what the corpus
should make a reader say, and a `disagreements` entry records where two readers currently
contradict each other on purpose — so that fixing the contradiction has to change the expectation
in the open (BACKLOG §265).
