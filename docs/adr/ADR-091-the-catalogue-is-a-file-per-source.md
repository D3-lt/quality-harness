# ADR-091: The mutation catalogue is one file per mutated source

**Status:** Accepted
**Date:** 2026-10-06
**Owner:** Zy
**Spec:** None — no spec stage; the owner chose the split on 2026-10-06, and pruning is left to a later record
**Cross-references:** docs/adr/ADR-023-a-measured-verdict-may-be-reused.md, docs/adr/ADR-069-a-stale-mutant-is-repointed-by-its-own-edit.md, docs/adr/ADR-072-a-mutant-runs-only-the-tests-that-kill-it.md, docs/adr/ADR-073-a-narrowed-entry-runs-every-test-it-names.md, docs/adr/ADR-075-a-campaign-runs-in-a-worktree-and-says-its-load.md, docs/adr/ADR-052-an-explicit-relock-is-not-a-later-red.md, docs/adr/ADR-011-a-pointer-resolves-or-it-is-reported.md, docs/adr/ADR-009-a-decision-names-what-enforces-it.md
**Governs:** None — declared by its tasks
**Enforced-by:** None — declared by its tasks. Each task adds one campaign mutation per `Rests-on` name, and `tests/mutations/**` names no file until T3 lands, so a pointer now would point at nothing.
**Invalidates:** ADR-069 — the clause of its Decision reading "`--repoint --write` rewrites the proposed entries' `from` and `to` in `tests/mutations.json`" now rewrites them in the per-source file that holds each entry, with the same serialisation. ADR-072 — Decision 4's "the catalogue is written once, after the measurement" becomes one write per per-source file that changed, each through a temporary file and a rename. ADR-075 — T2 locks `tests/gate-rules.test.mjs::every shard slice covers the catalogue exactly once`, whose body reads `tests/mutations.json` by path; T3 cannot leave it byte-identical (see T3's `Awaiting-decision`). ADR-023, ADR-073: none — checked; the cache key and the narrowed-baseline rule read entries, never the file they came from.
**Served-path change:** `adr-lint` resolves an `Enforced-by` mutation label from `tests/mutations/**/*.json` as well as from `tests/mutations.json`, and `mutate-propose` counts a file under `tests/mutations/` as the catalogue rather than as a test; in this repository, `scripts/mutate.mjs` reads the catalogue from one file per mutated source.

## Context

- **The catalogue, measured 2026-10-06 at `df11e2e`** (`node -e` over `tests/mutations.json`):
  2,154 entries, 974,651 bytes, 21,534 lines, 97 distinct `file` values. 2,113 entries carry `only`;
  370 have a multi-line `from`; every `label` is distinct (2,154 labels, 2,154 distinct). The largest
  sources: `plugin/scripts/lifecycle.mjs` 463, `plugin/bin/adr-lint` 306, `plugin/lib/record.py` 214,
  `plugin/bin/adr-verify` 139, `plugin/bin/adr-next` 116, `scripts/mutate.mjs` 114. 51 sources carry
  five entries or fewer. The entries name 133 distinct test files; 21 entries name more than one.
- **Churn, same day.** `git log --oneline -- tests/mutations.json` lists 685 commits (681 with
  `--follow`), 506 of them since 2026-09-01. Of the last 100, **48 change a line within 60 lines of the
  file's end**, measured by reading each commit's `-U0` hunk starts against that commit's line count.
  New entries are appended, so two sessions adding entries for unrelated sources edit the same tail.
- **Pain the owner observed in one session, 2026-10-06.** An edit to a pinned line needs a repoint, by
  hand when `--repoint` refuses; parallel writers collide on the file's tail (the 48-of-100 figure is
  this); and nothing ties an entry to its owner. The split answers the second fully and the third only
  if "owner" means the mutated source (an open question for the owner, Follow-ups). It does not change
  the first: an entry pins the same `from` text wherever it is stored.
- **The `_comment` is stale.** Its last sentence says the catalogue "is a representative set, one per
  defect class, not every mutation ever run"; it holds 2,154 entries over 97 sources. T3 drops it.
- **The class: everything that finds catalogue entries by the file's path.** Enumerated with
  `git grep -lE "mutations" -- plugin scripts tests .github .githooks .claude CLAUDE.md README.md ':!tests/mutations.json' ':!tests/fixtures'`,
  then each hit read. The readers that act on it:

  | Reader | Ships? | How it finds the catalogue | After the move, unchanged |
  |--------|--------|----------------------------|---------------------------|
  | `scripts/mutate.mjs` | no | `campaignPaths(dir).catalogue` (`:127`), read at `:1323` and `:1459`, written at `:1443` and `:1812` | exit 2, could not read |
  | `plugin/bin/adr-lint` `mutation_labels` (`:3764-3790`) | **yes** | `root / "tests" / "mutations.json"` | no file is `set()`, so every label pointer in the corpus becomes "a pointer to nothing" advice |
  | `plugin/scripts/mutate-propose.mjs` (`:169-175`) | **yes** | a test file matching `/mutations?\.json$/` | `tests/mutations/plugin/bin/adr-lint.json` does not match, lands in `testTexts`, and every catalogued string reads as asserted — fail-open |
  | `scripts/staged-mutation-guard.mjs` (`:60-64`) | no (pre-commit) | `git show :tests/mutations.json` | falls back to `''`, then `return 0`: the guard stops refusing |
  | `scripts/campaign-parity.mjs` (`:94-98`) | no | rewrites the file in a clone, filtered by `--tests` | exit 2 on a missing file |
  | `scripts/corpus-metrics.mjs` (`:99`) | no | reads the file | throws |
  | `scripts/rules-inject.mjs`, via `.claude/rules/01-repository-vs-plugin.md`'s `paths:` | no | the glob `tests/mutations.json` | the §1 rule stops loading for catalogue edits |
  | `tests/package.test.mjs` (five tests), `tests/gate-rules.test.mjs:1272`, `tests/mutation-cache-merge.test.mjs:206`, `tests/gate-regressions.py:2105` | no | the real file by path | red |

  `scripts/release-evidence.mjs` reads CI job conclusions by name and never the catalogue (`:83-100`).
  `.github/workflows/selftest.yml` names no catalogue path. The scratch-repository tests
  (`tests/mutate-runner.test.mjs`, `tests/mutate-isolation.test.mjs`, `tests/chaos-315-mutate-catalogue.test.mjs`,
  `tests/mutate-catalogue-write.test.mjs`, `tests/campaign-fixture.mjs`, `tests/mutate-propose.test.mjs`)
  write a `tests/mutations.json` of their own; the readers keep reading that shape.
- **Locks, measured with `python3 scripts/test-locks.py` on 2026-10-06.** Three locked tests constrain
  the design:
  - `tests/mutate-runner.test.mjs::campaignPaths keeps every campaign file inside the root it is given`
    (ADR-069 T1) deep-equals `campaignPaths()`'s four keys and `catalogue: <root>/tests/mutations.json`.
    So `campaignPaths` keeps its shape; the directory is derived beside it.
  - `tests/mutate-isolation.test.mjs::an uncommitted test edit and an untracked test are graded as an in-place run grades them`
    and `::a tracked file deleted in the checkout is absent from the worktree too` (ADR-075 T2, T3) write
    a single `tests/mutations.json` into a fixture and expect it graded. So the single file stays a
    readable catalogue.
  - `tests/gate-rules.test.mjs::every shard slice covers the catalogue exactly once` (ADR-075 T2) reads
    this repository's `tests/mutations.json` and asserts its length. No reader design keeps it green once
    the file is gone.
- **The cache and the shards, measured 2026-10-06** by importing `cacheKey` and `shardByCost` from
  `scripts/mutate.mjs` and reordering the 2,154 entries as T1 will (by catalogue path, then file order):
  - `cacheKey` (`:780-795`) hashes `file`, `from`, `to`, `only` and the bytes of the source and tests.
    Neither the label nor the position enters it. **The multiset of 2,154 keys is identical** before and
    after, with no null key. Every RED verdict in the CI cache stays reusable: no cold cache follows.
  - `shardByCost` (`:846-870`) breaks ties, and orders unknown costs, by catalogue index. Over 48 shards
    with no timings, **2,096 of 2,154 entries change shard**; with this checkout's cache (61 timed),
    2,063. Every entry is still in exactly one shard, and a verdict does not depend on its shard. The
    partition, and so each shard's wall clock, changes once.
  - A dispatched run passes `--no-cache`, but the shard plan still reads costs from `paths.cache`
    (`:1570-1573`), which CI fills from the seed artifact. `selftest.yml:210-215` says a dispatched run
    has no timings; the code says otherwise. That disagreement is outside this record (Out of Scope).
- **How the selection flags find entries.** `--case` filters by label substring (`:1513`), `--changed`
  by each entry's `file` against `git diff` (`:1195-1214`, `:1533-1546`), `--stale` and `--repoint` walk
  every entry (`:1346-1446`), `--narrow` re-finds entries by label (`:1461-1470`), and an isolated child
  re-finds its parent's selection by label (`:1517-1530`). None reads the file's position. A label
  repeated across two files would make the last three ambiguous; only `--narrow` checks today.
- **The naming, measured.** `tests/mutations/<file>.json` for each of the 97 sources: the longest is
  `tests/mutations/plugin/evals/a-vacuous-test-is-not-a-review/prompt.md.json`, 74 characters, under
  `tests/path-length.test.mjs`'s bound of 128. No two sources differ only by case. Two sources already end
  in `.json` (`plugin/hooks/hooks.json`, `.claude-plugin/marketplace.json`) and map to `….json.json`,
  which strips back unambiguously. Four sources start with a dot (`.gitignore`, `.gitattributes`,
  `.claude-plugin/…`, `.github/…`); `git check-ignore -v` ignores none of the four proposed paths.
  `.gitattributes` needs no new rule: a multi-line `from` is stored with JSON `\n` escapes, so a CRLF
  checkout changes only whitespace between tokens.
- **Records that name the file.** 206 files under `docs/adr` and `docs/adr-archive` mention it (282
  occurrences); records are history (CLAUDE.md §10) and stay. Twelve active records name it in
  `Governs:` (`git grep -lE "^\*\*Governs:\*\*.*tests/mutations\.json" -- docs/adr`: ADR-003, 015, 016,
  017, 018, 022, 045, 046, 049, 050, 051, 052), and two archived ones do. CLAUDE.md §1 says a `Governs:`
  line moves when its file moves; ADR-011 advises on one that matches nothing.

## Existing Primitives Audit

- **`catalogueShapeError`** (`scripts/mutate.mjs:1276`): reused per file, unchanged; each per-source file
  has today's shape, `{ "mutations": [ … ] }`.
- **`writeCatalogue`** (`:229-240`): reused per file; its temporary-file-and-rename stays the only write.
- **`campaignPaths`** (`:124-132`): unchanged (locked). The directory is `<root>/tests/mutations`, derived
  next to it.
- **`tracked_or_unignored_paths`** in `adr-lint` and `git ls-files --cached --others --exclude-standard`
  (CLAUDE.md §8): reused to list catalogue files.
- **`adr-verify --relock --replace-hashes`** (ADR-052): the existing path for a locked body that must move.

## Decision

1. **One file per mutated source.** An entry whose `file` is `<path>` lives in
   `tests/mutations/<path>.json`, in today's shape. A file's every entry names that file's source.
2. **`scripts/mutate.mjs` reads the union** of `tests/mutations/**/*.json` and, when it exists,
   `tests/mutations.json`. Catalogue files are listed with git (`--cached --others --exclude-standard`,
   less `--deleted`), sorted by their `/`-separated path in code-unit order, and read in that order; entries
   keep their order within a file. Any of these is exit 2, could not read, naming the file:
   - a file that is not a catalogue (`catalogueShapeError`);
   - an entry under `tests/mutations/` whose `file` is not that file's source;
   - a label that appears twice in the union, within a file or across files, or two labels that differ
     only by case;
   - an empty per-source file.
   The single file stays readable so the scratch-repository fixtures, two of them locked, and any
   adopter's catalogue keep working.
3. **The writers write back per file.** `--repoint --write` and `--narrow --write` rewrite only the files
   holding a changed entry, each through `writeCatalogue`. A run killed between two files leaves each
   file whole; the rewritten ones are measured as before.
4. **Every other reader reads the union**: `adr-lint`'s label set, `mutate-propose`'s catalogue text, the
   staged guard (the staged per-source file of each added source), `campaign-parity`, `corpus-metrics`.
5. **The migration is one mechanical commit, last**, after the readers: it writes the 97 files, deletes
   `tests/mutations.json`, moves the path in the twelve `Governs:` lines, CLAUDE.md §1, the §1 rules file,
   `docs/TEST-PLAN.md` and the tests that read the real file. It is proven by the union equalling the
   old file entry for entry, `--stale` staying clean, and `--list --case` selecting the same labels for a
   sample of substrings. An unchanged cache key follows from entry equality, since `cacheKey` reads only
   entry fields and file bytes, so T3 does not check it separately: a check that cannot fail on its own
   proves nothing (CLAUDE.md §4).

**This fails if** the union after T3 differs from `git show <pre-migration>:tests/mutations.json` by any
entry or any field; if `node scripts/mutate.mjs --stale` reports anything; if `--case` selects a different
label set; if `adr-lint` gives more Enforced-by advice over `docs/adr` than before T3; or if a label added
twice, across two files, is not refused. The old file and the reordering are that data and exist today.

## Alternatives Considered

- **Keep one file.** Rejected: 48 of the last 100 commits edit its last 60 lines, so concurrent sessions
  collide wherever they work, and a 974,651-byte file is read and rewritten whole by every write mode.
- **One file per test file**, keyed on `tests`. Rejected: 21 entries name more than one test file and
  would have no single home, 133 test files would replace 97 sources, and the reason an entry exists is
  the source line it breaks. `--changed`, `--stale` and `--repoint` all start from the source.
- **Split and prune together.** Rejected by the owner (2026-10-06): pruning decides which claims stop
  being measured and needs its own measurement; a mechanical move is proven by equality, and doing both
  at once leaves nothing to compare against.
- **Directory only, no legacy file.** Rejected: two locked tests write the single file into fixtures, and
  `adr-lint` ships to adopters whose catalogue is one file.
- **A generated single file kept beside the directory.** Rejected: a second copy of the same data is a
  list kept beside the artifact, and its tail is still where writers collide.

## Component / Boundary Impact

`scripts/mutate.mjs` owns reading and writing the catalogue and exports the loader the other repository
scripts use. `plugin/bin/adr-lint` and `plugin/scripts/mutate-propose.mjs` each keep their own reader:
they ship, and the plugin may not import from `scripts/` (CLAUDE.md §1). No component changes owner.

## Wiring & Contract Changes

| Surface | Change | Producer | Consumer(s) |
|---------|--------|----------|-------------|
| Catalogue location | `tests/mutations/<source>.json` beside, then instead of, `tests/mutations.json` | T1, T3 | every reader in the Context table |
| `loadCatalogue(root)` export of `scripts/mutate.mjs` | new: the union, the files it came from, or why it could not be read | T1 | `campaign-parity`, `corpus-metrics`, T3's proof |
| `adr-lint` `Enforced-by` label resolution | also reads `tests/mutations/**/*.json` | T2 | adopters' records |
| `mutate-propose` catalogue classification | a file under `tests/mutations/` is catalogue | T2 | adopters |

## Inter-task Contracts

| Contract | Producing task | Consuming task(s) | Breaking? |
|----------|----------------|-------------------|-----------|
| `loadCatalogue(root)` | T1 | T2, T3 | No — new export |
| every reader reads the directory | T1, T2 | T3 | No — T3 moves the data only after both |

## Implementation

See `docs/adr/ADR-091-the-catalogue-is-a-file-per-source/tasks/README.md`.

## Consequences

- **Positive:** two sessions adding entries for different sources edit different files; an entry's file
  says which source it breaks; a write mode rewrites a few kilobytes, not 974,651 bytes; a label repeated
  across files is refused everywhere, not only under `--narrow`.
- **Negative:** repoint work is unchanged — an entry still pins its `from`. 97 files replace one. Every
  shard's contents change once (2,096 of 2,154 entries move with no timings). Two shipped readers change,
  so this is a plugin release and needs an outside run under CLAUDE.md §18. A `--write` killed between
  two files leaves some rewritten and some not, each whole.
- **Neutral:** no cache key changes. The records that cite `tests/mutations.json:<line>` keep the citation
  as history.

## Out of Scope

- Pruning entries (permanent: boundary: the owner chose to prune later, on its own measurement; a move proven by equality must not also change the set)
- The `selftest.yml:210-215` comment saying a dispatched run has no timings while `scripts/mutate.mjs:1570-1573` reads them from the seed (permanent: boundary: a comment about sharding cost, unchanged by where entries are stored; reported to the owner)
- The two archived records whose `Governs:` names `tests/mutations.json` (permanent: boundary: an archived record's digest is frozen by adr-retire-check, so its advice stays)
- Rewriting record prose or BACKLOG entries that cite `tests/mutations.json` or a line in it (permanent: boundary: records and the backlog are history, CLAUDE.md §10)
- Grouping entries by owner or by test file inside a source's file (permanent: boundary: the file is the source; anything finer is a later decision)

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| A reader not in the class keeps reading the old path and goes quiet | Med | High | the class is enumerated by command; T2's tests drive each shipped reader over a directory-only catalogue; T3 removes the file only after T1 and T2 |
| The move drops or alters an entry | Low | High | T3's fence compares the union with the old file field by field |
| A writer interrupted between two files | Low | Low | each file is whole; the next `--stale` names what is left |
| Shard wall clock shifts past the 25-minute timeout | Low | Med | costs are unchanged; the first dispatched run after T3 is read before the next release |
| A locked test's relock is refused or not accepted | Med | Med | T3 waits on the owner (Awaiting-decision); nothing is moved until then |

## Rollback

Restore `tests/mutations.json` from the commit before T3 and delete `tests/mutations/`; T1 and T2 read
the single file, so no code reverts. To remove the readers too, revert T2 then T1. The cache needs
nothing: no key changed.

## Follow-ups

- [x] Owner: does "nothing ties an entry to its owner" mean the mutated source (answered by this split) or a person or task (not answered)? — The mutated source, the owner answered on 2026-10-09; the per-source split answers it.
- [x] Owner: approve relocking ADR-075 T2's lock on `every shard slice covers the catalogue exactly once` under ADR-052, or name another route. — Approved by the owner on 2026-10-07; T3 relocked it with `adr-verify --relock --replace-hashes` on ADR-075 T2's task file.
