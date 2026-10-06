# Task ADR-089-T5: --adopt prints no absolute path and is not said to adopt

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** S (one gate, two sentences, one new test file, campaign entries)
**Owner:** unassigned
**Produces:** none
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `the roots printed relative`, `the work-next remedy sentence`, `the SessionStart remedy sentence`, `the unchanged adoption findings`

## Goal

`adr-retire-check --adopt` prints its roots without an absolute path, and the two sentences that offer
it say it reports what adopting needs and changes nothing (ADR-089 Decision 6).

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/bin/adr-retire-check` | edit | `adoption_report`'s verdict line (`:441`) prints each root relative to the working directory when inside it, else its last component |
| `plugin/scripts/work-next.mjs` | edit | the unmarked-archive sentence (`:840`) |
| `plugin/scripts/lifecycle.mjs` | edit | the SessionStart sentence (`:3611`) |
| `tests/adopt-wording.test.mjs` | add | the two tests below |
| `tests/mutations.json` | edit | one entry per Rests-on name |

## Ordered Steps

1. [S1] Run `grep -rn -E "adopts it|MIGRATION-REQUIRED\] " tests/` and confirm that no existing test pins either form; on 2026-10-06 none did. Write the two tests and record the red run (TDD red). Red today: the verdict line names the absolute scratch path, and both sentences say "adopts it".
2. [S2] In `adoption_report`, resolve both the root and `Path.cwd()` (so `/tmp` and `/private/tmp` agree on macOS, CLAUDE.md §7), and print `root.relative_to(cwd).as_posix()` when the root is under the working directory, else `root.name`, for both roots. `as_posix()` as the advice line at `:451` does, so Windows prints `/` too.
3. [S3] Replace "adopts it" in both sentences with "reports what adopting it needs; it changes nothing", keeping the rest of each sentence.
4. [S4] Record one killed mutant per Rests-on name, and add each to `tests/mutations.json`:
   - print the resolved root again;
   - restore "adopts it" in `work-next.mjs`;
   - restore "adopts it" in `lifecycle.mjs:3611`;
   - drop one existing `--adopt` finding that `tests/archive-not-in-flight.test.mjs` or `tests/record-identity.test.mjs` asserts (S1 names which), killed by the fence's second command.
   [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/adopt-wording.test.mjs 2>&1) \
  && for t in 'adopt prints no absolute path' 'the adopt remedy says it reports and changes nothing'; do test "$(printf '%s\n' "$out" | grep -cxE "ok [0-9]+ - $t")" = 1 || exit 1; done \
  && node --test tests/archive-not-in-flight.test.mjs tests/record-identity.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `adopt prints no absolute path` | `tests/adopt-wording.test.mjs` | `adr-retire-check --adopt docs/adr docs/adr-archive`, run through `spawnGate` in a temporary corpus, prints `docs/adr + docs/adr-archive` and not the temporary directory. With absolute arguments outside the working directory, it prints only `adr` and `adr-archive`. CLEAN twin: the counts on the verdict line are unchanged | none | S1, S2 |
| `the adopt remedy says it reports and changes nothing` | `tests/adopt-wording.test.mjs` | `work-next.mjs` text and SessionStart, each over a temporary corpus with an unmarked `adr-archive/`, say `reports what adopting it needs; it changes nothing`, and neither says `adopts it` | none | S1, S3 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the two tests |
| 2 — something selects it | `main` in adr-retire-check dispatches `--adopt` to `adoption_report` (`:536`); the sentences are printed by work-next's text mode and by SessionStart's corpus brief |
| 3 — the caller can discover it | `plugin/skills/adr-retire/SKILL.md:97` documents `--adopt` |
| 4 — it is used | an adopter with an unmarked archive; nothing measures this yet |

## Mutation Log

## Invariants

- `--adopt`'s exit codes and findings are unchanged.
- `lifecycle.mjs:1852`'s "adopt it first" sentence is unchanged; it names a step, not the tool's effect.

## Risks

- None beyond wording.

## Stop Condition

Stop and ask if a skill or document quotes "adopts it" as the tool's behaviour beyond the two sentences named.

## Out of Scope

- `plugin/bin/adr-verify:2566`'s `{root}` echo — ADR-089 Out of Scope.

## Verification Log
