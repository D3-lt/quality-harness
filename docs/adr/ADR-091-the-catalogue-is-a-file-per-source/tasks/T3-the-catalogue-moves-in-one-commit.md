# Task ADR-091-T3: the catalogue moves in one commit

**Depends-on:** T1, T2
**Awaiting-decision:** relock ADR-075 T2's lock on `tests/gate-rules.test.mjs::every shard slice covers the catalogue exactly once` under ADR-052 (`adr-verify --relock --replace-hashes`) after its catalogue read moves to `loadCatalogue`, or keep the test byte-identical by another route the owner names
**Covers:** none — no spec
**Estimated scope:** L (97 new data files, one deleted, twelve Governs lines, three docs, five tests)
**Owner:** unassigned
**Produces:** `tests/mutations/<source>.json` for every source the catalogue mutates; no `tests/mutations.json`
**Consumes:** `loadCatalogue(root)` (T1); every reader reads `tests/mutations/` (T2)
**Data dependency:** needs this repository's `tests/mutations.json` at the commit before the move
**Proof map:** v1
**Rests-on:** `the single file is gone`, `no Governs line names the old path`, `the union equals the old catalogue entry for entry`, `--case selects the same labels`, `--stale stays clean`, `the shard test and gate-regressions read the union`, `the real-catalogue tests pass`

## Goal

Move every entry of `tests/mutations.json` into `tests/mutations/<file>.json`, delete the single file, and
move every live pointer to it, in one commit whose only content change is location.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/mutations/**/*.json` | add | one file per distinct `file` value, entries in their old relative order, `JSON.stringify(…, null, 2) + "\n"` as `writeCatalogue` writes |
| `tests/mutations.json` | delete | the union replaces it; its `_comment` is dropped (its "one per defect class" sentence is false at 2,154 entries) |
| `docs/adr/ADR-003-*.md`, `ADR-015`, `ADR-016`, `ADR-017`, `ADR-018`, `ADR-022`, `ADR-045`, `ADR-046`, `ADR-049`, `ADR-050`, `ADR-051`, `ADR-052` (`Governs:` line only) | edit | CLAUDE.md §1: a `Governs:` path moves with its file; `tests/mutations.json` becomes `tests/mutations/**` |
| `CLAUDE.md` | edit | §1's list names `tests/mutations/` `file:` paths, and a source that moves takes its catalogue file with it |
| `.claude/rules/01-repository-vs-plugin.md` | edit | `paths:` `tests/mutations.json` becomes `tests/mutations/**`, which `scripts/rules-inject.mjs` selects on; item 3 of the list |
| `docs/TEST-PLAN.md` | edit | `:334` names the directory |
| `tests/package.test.mjs` | edit | the five tests that read the real file (`:662`, `:782`, `:1282`, `:1327`, `:1396`) read `loadCatalogue(repoRoot)`; none is locked (0 locks, 2026-10-06) |
| `tests/gate-regressions.py` | edit | `:2105` asserts a `Governs:` of `tests/mutations/**` resolves against the real tree |
| `tests/mutation-cache-merge.test.mjs` | edit | `:206` copies `tests/mutations/plugin/scripts/post-edit-check.sh.json` instead of the single file |
| `tests/gate-rules.test.mjs` | edit, if the owner approves | `:1272` reads `loadCatalogue(repoRoot).mutations`; locked by ADR-075 T2 — see `Awaiting-decision` |

## Ordered Steps

1. [S1] Record the red run (TDD red): before the move the fence fails at its first test, because `tests/mutations.json` exists [proof: acceptance]
2. [S2] Before moving anything, record `python3 plugin/bin/adr-lint docs/adr 2>&1 | grep -c "Enforced-by names"` and `node scripts/mutate.mjs --stale` in this task's prose, with the sha [proof: human: the two numbers before and after are compared by the person running T3]
3. [S3] Write the per-source files with a one-off script run from a scratchpad, not committed. Delete `tests/mutations.json`. `git add tests/mutations` so the git-listed loader sees them [proof: acceptance]
4. [S4] Move the twelve `Governs:` lines, CLAUDE.md §1, the §1 rules file and `docs/TEST-PLAN.md`; `! git grep -lE "^\*\*Governs:\*\*.*tests/mutations\.json" -- docs/adr` [proof: acceptance]
5. [S5] Repoint the tests that read the real file; for `tests/gate-rules.test.mjs`, only after the owner answers `Awaiting-decision`, then relock under ADR-052 [proof: acceptance]
6. [S6] Re-run the S2 counts; the advice count must not rise and `--stale` must stay clean [proof: human: the person running T3 compares them with S2's]
7. [S7] Record one killed mutant per Rests-on name, for example: delete one entry from `tests/mutations/plugin/bin/adr-lint.json` (the union); change `m.label.includes(filter)` to `m.label.startsWith(filter)` in `scripts/mutate.mjs` (`--case`); restore one `Governs:` line to the old path; recreate an empty `tests/mutations.json` (the single file) [proof: mutation]
8. [S8] `bash scripts/selftest.sh` green before the commit; the first dispatched campaign after the push is read for shard timing before the next release [proof: human: a person reads the run's per-shard times against the 25-minute timeout]

## Acceptance

```bash
set -o pipefail
test ! -e tests/mutations.json -a -d tests/mutations \
  && ! git grep -qlE "^\*\*Governs:\*\*.*tests/mutations\.json" -- docs/adr \
  && git show "$(git log -1 --format=%H --diff-filter=AM -- tests/mutations.json):tests/mutations.json" | node --input-type=module -e 'import { readFileSync } from "node:fs"; import { spawnSync } from "node:child_process"; import { loadCatalogue } from "./scripts/mutate.mjs"; const old = JSON.parse(readFileSync(0, "utf8")).mutations; const now = loadCatalogue(process.cwd()); if (now.error) { console.error(now.error); process.exit(1) } const key = e => JSON.stringify([e.label, e.file, e.tests, e.only ?? null, e.from, e.to]); const a = old.map(key).sort(); const b = now.mutations.map(key).sort(); if (JSON.stringify(a) !== JSON.stringify(b)) { console.error(`union differs: ${a.length} old, ${b.length} now`); process.exit(1) } for (const s of ["post-edit", "corpus:", "lint:", "verify:", "narrow", "branch-state"]) { const run = spawnSync(process.execPath, ["scripts/mutate.mjs", "--list", "--case", s], { encoding: "utf8" }); const got = run.stdout.split("\n").filter(l => l !== "" && !l.startsWith(" ")).sort(); const want = old.map(e => e.label).filter(l => l.includes(s)).sort(); if (JSON.stringify([run.status, got]) !== JSON.stringify([0, want])) { console.error(`--case ${s}: ${got.length} listed, ${want.length} expected`); process.exit(1) } } console.log(`${b.length} entries, union equal`)' \
  && node scripts/mutate.mjs --stale \
  && test "$(node --test --test-reporter=tap tests/gates.test.mjs tests/gate-rules.test.mjs 2>&1 | grep -cxE 'ok [0-9]+ - (focused false-green regressions remain closed|every shard slice covers the catalogue exactly once)')" = 2 \
  && node --test tests/package.test.mjs tests/mutation-cache-merge.test.mjs tests/rules-inject.test.mjs tests/path-length.test.mjs
```

The fence is red before the move (`tests/mutations.json` exists) and on any partial move (the union or a
`--case` selection differs). The old catalogue is read from the last commit that added or modified
`tests/mutations.json`, which is `HEAD`'s version while the move is uncommitted and the version the move
deleted afterwards, so the fence re-runs after the commit. `--list` prints no shard header without
`--shard`, so every line not starting with a space is a label. The program is one line so that the
fence's segments are its mechanisms.

The fence is red before the move (`tests/mutations.json` exists) and on any partial move (the union or a
`--case` selection differs). The old catalogue comes from `HEAD` while the move is uncommitted and from the
parent of the commit that deleted it afterwards. `--list` prints no shard header without `--shard`, so every
line not starting with a space is a label.

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `focused false-green regressions remain closed` | `tests/gates.test.mjs` | `tests/gate-regressions.py`, including the `Governs:` resolution of `tests/mutations/**` against the real tree | none | S4, S5 |
| `every shard slice covers the catalogue exactly once` | `tests/gate-rules.test.mjs` | every entry of the union in exactly one of four shards | none | S5 |
| `every catalogue entry still matches the source it mutates, exactly once` | `tests/package.test.mjs` | the real union, read through `loadCatalogue` | none | S5 |
| `every shipped gate carries at least one mutation` | `tests/package.test.mjs` | the real union | none | S5 |
| `every path outside the frozen archive list clones on Windows without core.longpaths` | `tests/path-length.test.mjs` | every new catalogue path is at most 128 characters | none | S3 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the per-source files |
| 2 — something selects it | `loadCatalogue` (T1); deleting one per-source file turns the fence's union check red |
| 3 — the caller can discover it | CLAUDE.md §1, the §1 rules file, `docs/TEST-PLAN.md`, `plugin/templates/adr-template.md` (T2) |
| 4 — it is used | every campaign after the commit; the first dispatched run is read (S8) |

## Mutation Log

## Invariants

- The union of the per-source files equals the old catalogue entry for entry and field for field.
- No record's prose, Verification Log or citation is rewritten; only twelve `Governs:` lines move.

## Risks

- The locked shard test cannot stay byte-identical; nothing in this task moves until the owner decides.
- A push during a release run cancels it (CLAUDE.md §13.6): push T3 only when no release run is in flight.

## Stop Condition

Stop and ask if the union differs from the old file by any entry, if `--stale` reports anything, if the S2
advice count rises, or if the owner has not answered `Awaiting-decision`.

## Out of Scope

- Pruning or regrouping entries — ADR-091 Out of Scope, a permanent boundary: the owner chose a later record.

## Verification Log
