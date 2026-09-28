# ADR-072: A mutant runs only the tests that kill it

**Status:** Accepted
**Date:** 2026-09-28
**Owner:** Zy
**Spec:** None — no spec stage; BACKLOG §301 Stage 4 (mutation tooling), test-impact selection
**Cross-references:** docs/adr/ADR-006-a-verdict-that-names-its-own-reliability.md, docs/adr/ADR-023-a-measured-verdict-may-be-reused.md, docs/adr/ADR-069-a-stale-mutant-is-repointed-by-its-own-edit.md, docs/BACKLOG.md
**Governs:** scripts/mutate.mjs
**Enforced-by:** `tests/mutate-runner.test.mjs::narrowEntry proposes exactly the recorded killers, escaped and anchored, and refuses what it cannot prove`
**Invalidates:** none — checked (ADR-006's baselines and ADR-023's reuse key already include `only`; this record fills `only` from a measurement, and changes neither)
**Served-path change:** None — repository tooling only (`scripts/mutate.mjs`, `tests/mutations.json`); nothing in `plugin/` changes.

## Context

The mutation campaign is the largest wall-clock cost of a release. **Measured 2026-09-28** from the job timestamps of the full dispatched campaign of 287a207 (run 36413858960, `gh run view 36413858960 --json jobs`): 48 shards, the slowest 1,258s and the median 1,084s, and 50,430 runner-seconds in total.

A catalogue entry runs the test FILES it names, narrowed to matching tests only when it carries an `only` pattern (`testArgs`, `--test-name-pattern`). At 86bb5ab the catalogue holds 1,563 entries, and 851 carry no `only`. The class, every entry whose `only` is empty, is enumerated by reading `tests/mutations.json` for entries with a missing or empty `only`: 851 at 86bb5ab. Among them, 165 name `tests/gates.test.mjs` and 101 name `tests/lifecycle.test.mjs`.

**How much of their time the killers are**, from a one-off harvest (2026-09-28, not re-derivable from the repository: a local `node --test --test-reporter=tap tests/*.test.mjs` run, each test's duration mapped to its file by name, and the `<- killed by:` lines of run 36413858960's 48 shard logs):
- the whole files those 851 entries name sum to 10.5 hours of local test time;
- the killers the campaign printed for them sum to 1.26 hours, about 12% of it;
- one entry's killers were not recoverable;
- 22 had a killer whose name mapped to a file the entry does not name.

Local test time is not CI runner time, so only the ratio carries over. Two things move it:
- Narrowing also removes the whole-file baselines each shard runs today, which helps.
- Every distinct pattern pays its own baseline run (`setKeyOf`, ADR-006), and every entry pays a process start: about 0.33s for gates.test.mjs and 0.21s for lifecycle.test.mjs with a pattern that matches nothing, roughly 10 minutes over about 1,700 spawns. That hurts.

So the saving is a projection, and T3's CI measurement decides it.

The cache does not record killers today (`entries[key] = { verdict, sha, label, ms }`), and a record written before this change is reused as it is (`reusable`, and `if (result.reused) continue` in the cache write). A dispatched campaign writes no cache at all (`--no-cache`). That is why the harvest had to read logs, and why T1 must make an old record non-reusable.

## Existing Primitives Audit

- `killedBy(stdout)` recovers the killing tests' names. **Reused** as the only source of a narrowing.
- The ADR-023 cache, keyed by subject and tests including `only`. **Extended**: a RED record carries `killers`, and a RED record without them is not reusable, so the first campaign after T1 measures every entry afresh.
- CI's `mutation cache` job merges the shards' caches into an artifact on a push run. **Reused** as the cache T3 reads.
- `setKeyOf` / `testSets` (ADR-006): a baseline per distinct set. **Reused** unchanged.
- `--repoint --write` (ADR-069): claim the campaign lock before reading the catalogue, rewrite named fields only, then measure. **Reused** as the shape and the lock order of `--narrow --write`. Unlike ADR-069, an entry that does not measure RED is restored, not left written.
- `--stale` and the selftest test that runs it over the real catalogue. **Extended** to name a narrowed entry whose pattern no longer names a defined test.

## Decision

1. **The campaign records killers.** A RED entry's cache record gains `killers`, the names `killedBy` returned. A RED record without `killers` is not reusable, so no record from before this change survives into a narrowing.
2. **"Defined in a file" means the test's name appears verbatim as a string literal in that file's source.** A name built at runtime (a template literal with `${…}`, or one built in a loop) is not defined by this rule, and an entry killed by one is refused. That is the safe direction, and it costs part of the saving: `tests/timeout-tree.test.mjs` builds names from `${gate}`.
   - **Amended 2026-09-28 (T4), after a Codex review of T1 and T2:** "a string literal" means one of the file's string literal TOKENS. A name left in a comment, inside another literal such as a fixture string, or in a regular expression defines nothing. The first rule was a quoted-substring search, and it passed a killer that survived only in a comment. Measured over the 81 test files the catalogue names against the 1,474 test names the runner reported: the two rules agree on 1,386 pairs; the substring rule alone found one, a name that `tests/gates.test.mjs` holds only in a comment; the token rule alone found none.
   - **Amended 2026-09-28 (T5), after a second Codex review, of T4:** a `/` after a control statement's condition (`if`, `while`, `for`, `with`) or after a postfix `++`/`--` is read as JavaScript reads it. Before T5, a quoted name inside `if (x) /'a'/.test(y)` counted as defined, which is the fail-open direction. The measurement over the catalogue's test files is unchanged by it. BACKLOG §318 names the inputs the reader still misreads, and the check that would not depend on it.
3. **`scripts/mutate.mjs --narrow [--cache <file>] [--write]`** proposes an `only` for each entry that meets all of these:
   - it has no `only` today;
   - its cached verdict is RED at the current key;
   - its recorded killers are non-empty;
   - each killer is defined in a file the entry names.

   The proposal is `^(?:<killer>|<killer>)$`, each name with every regular-expression metacharacter escaped. Measured on Node 24.11.1 (2026-09-28): a test inside a `describe` is selected by its leaf name anchored this way. A subtest created with `t.test` is not, because its parent does not match. No test file here creates one, and one that did would come back UNPROVEN and be undone. Every other entry is refused, naming why. Nothing is written without `--write`.
4. **`--narrow --write`** follows ADR-069's order: claim the campaign lock, read the catalogue, write only the proposed `only` fields, then measure every narrowed entry. An entry that is not RED under its pattern has its `only` removed again and is named, and the command exits 1. Nothing is left narrowed on a measurement it failed. It refuses uncommitted subjects as every campaign does, and `--force` is not part of this flow.
   - **Amended 2026-09-28 (T4), after the same review:** the patterns are set in memory and measured first, and the catalogue is written once, after the measurement, with only the entries RED under their pattern. Writing first left a killed run with unmeasured patterns in the catalogue, because nothing restores it. The runner is synchronous, so a SIGTERM waits for the run to end; the case this order exists for is a kill. A narrowing never reuses a cached verdict, and `--narrow` refuses a repeated label, and an option it does not take, before any branch does work.
5. **A narrowed entry whose killer is renamed or deleted is named by `--stale`.** Its pattern then selects nothing, the baseline reads `unrun`, and the entry would be UNPROVEN, which does not fail a campaign. So `--stale` also reports every narrowed entry whose pattern names a test that no named file defines under rule 2, and the selftest runs `--stale` over the real catalogue. A narrowed entry that stays selected but stops being killed is GREEN, and the campaign already names that.

**What makes it fail.** The tests show each of these:
- the pattern is exact, and a metacharacter name matches only itself;
- each refusal happens and names why;
- `--write` undoes an entry that is not RED;
- a RED record without killers is not reused;
- `--stale` names a narrowed entry whose killer was renamed.

**The measurement is part of the decision.** T3 narrows the catalogue from a cache recorded after T1 and compares the next dispatched campaign's summed shard runner-seconds with run 36413858960's 50,430. The record's claim holds if they fall by at least half. That bar comes from the local ratio (killers are about 12% of whole-file time) with a wide margin for the baselines and process starts. Otherwise T3's catalogue commit is reverted, and the record says so.

## Alternatives Considered

- **Select tests by coverage (which tests execute the mutated line).** Rejected for now: it needs per-test coverage across spawned processes, and nine test files here spawn children that `--experimental-test-coverage` cannot see (`scripts/coverage.sh`). Killers are measured directly.
- **Narrow by hand.** Rejected on the count: 851 entries.
- **Shorter shards or more of them.** Rejected: it spends the same runner-hours faster and leaves the 10.5 hours of whole-file runs in place.
- **Drop `only` entirely and cache harder (ADR-023).** Rejected: a dispatched release campaign runs with `--no-cache` on purpose, so the cache cannot save the run that matters.

## Component / Boundary Impact

None — internal to `scripts/mutate.mjs` and its catalogue; repository tooling that never ships.

## Wiring & Contract Changes

| Surface | Change | Producer | Consumer(s) |
|---------|--------|----------|-------------|
| mutation cache record | new `killers` field on RED entries | T1 | T2 |
| `scripts/mutate.mjs` flags | new `--narrow`, `--narrow --write` | T2 | a person or session |
| `tests/mutations.json` | `only` filled for narrowed entries | T3 | the campaign |

## Inter-task Contracts

| Contract | Producing task | Consuming task(s) | Breaking? |
|----------|----------------|-------------------|-----------|
| cache `entries[key].killers: string[]` | T1 | T2 | No — additive |
| `narrowEntry(entry, record, sources)` → `{ verdict: 'narrowed', only }` or `{ verdict: 'refused', why }` | T2 | T3 | No — new |

## Implementation

See `tasks/README.md`: T1 (the cache records killers), T2 (the proposal and the measured write), T4 (the review of T1 and T2, closed), T3 (applied to the catalogue, and the campaign measured).

## Consequences

- **Positive:** the harvest puts the killers at about 12% of the whole-file time the unnarrowed entries run today. If CI keeps that ratio, a release campaign loses most of its 14 runner-hours, and T3 measures whether it does. Every narrowed entry names the tests that prove it.
- **Negative:** a narrowed entry no longer runs the rest of its files. A future test in those files that would also have killed it is not consulted until someone widens it. The entry still claims only what its killers prove.
- **Neutral:** entries with an `only` today are untouched; the 22 cross-file entries and the unrecovered one stay whole-file until someone narrows them by hand.

## Out of Scope

- Coverage-based test selection (deferred: docs/BACKLOG.md §301 — needs per-test coverage across spawned children, which node's coverage cannot see here)
- Worktree-isolated campaigns (deferred: docs/BACKLOG.md §301)
- Narrowing the 22 entries whose killers resolve outside their named files (permanent: boundary: which file is meant is a judgement the harvest cannot make)

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| A killer name matches more tests than itself | Med without escaping | Med | every name escaped and the alternation anchored `^…$`; a test with a metacharacter name |
| The saving is smaller than projected: baselines per pattern and process starts | Med | Low | the ≥50% bar leaves a wide margin over the local 12% ratio; T3 measures the real campaign and reverts if it is not met |
| A narrowed entry passes on a flaky killer | Low | Med | the write measures every narrowed entry and restores any that is not RED |

## Rollback

`git revert` of T3's catalogue commit restores every `only`; T1 and T2 are additive.

## Follow-ups

- [ ] After T3's campaign, record the measured runner-seconds against run 36413858960 in BACKLOG §301.
