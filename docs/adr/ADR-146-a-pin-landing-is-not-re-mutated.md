# ADR-146: A landing that only re-pins the catalogue does not run the mutation campaign again

**Status:** Accepted
**Date:** 2026-11-25
**Owner:** Zy
**Spec:** None — no spec stage; the inputs are the owner's decision of 2026-11-25 ("if we do not touch files - then we do not re-test"), the measurement of two landing runs in Context, and a cold Codex review of the first draft (Alternatives)
**Cross-references:** docs/adr/ADR-023-a-measured-verdict-may-be-reused.md, docs/adr/ADR-118-main-lands-only-a-sha-ci-passed.md, docs/adr/ADR-126-one-run-per-release.md, docs/adr/ADR-139-the-landing-run-splits-its-longest-jobs.md, .github/workflows/selftest.yml, .github/rulesets/main.json, scripts/release-evidence.mjs, scripts/land.mjs, CLAUDE.md
**Governs:** None — declared by its tasks
**Enforced-by:** None — declared by its tasks; T1 and T2 each add catalogue mutants that remove one mechanism the decision rests on
**Invalidates:** ADR-126 — Decision 1, the sentence "Every `land/**` push runs the full campaign": a pin landing runs none. ADR-023 — rule 1, the clause "and so must `main`": main may hold a pin commit whose own landing measured no mutant. CLAUDE.md §13 step 3 ("the workflow runs every land push as the full campaign") and §18 ("every `land/<sha>` push is the full campaign") are reworded by T2
**Served-path change:** None — this ADR changes only CI and repository tooling; nothing under `plugin/` or `core/` changes, so nothing an adopter's session runs changes

## Context

A landing pushes the candidate to `land/<sha>`, the workflow runs there, and main fast-forwards once main's required
checks passed at that sha (ADR-118). Since ADR-126 every such push runs the whole mutation catalogue uncached
(.github/workflows/selftest.yml:334-346).

Measured 2026-11-25 with `gh api repos/{owner}/{repo}/actions/runs/<id>/jobs`, as the sum of each job's
`completed_at` minus `started_at`:

| Run | What it landed | Jobs | Runner-minutes |
|-----|----------------|------|----------------|
| 45469221252 | v3.8.81 at 552fc14c1: plugin, tests and records | 61 | 488 |
| 45475508810 | c65834167: `.claude-plugin/marketplace.json` only | 61 | 489 |

Run 45469221252 by job kind: the mutation shards 374 minutes, the two coverage floors 54, the two selftests 27, Windows
24, everything else about 5. The shards are 77% of a landing.

Of the nine landings that succeeded from 2026-11-22 to 2026-11-24 (2d8e0f198, f5968e8f2, ec6e2d0ed, 5c6e092aa,
93b207fec, 47945dd17, 4427b1af8, 552fc14c1, c65834167), five changed exactly one file, `.claude-plugin/marketplace.json`:
`git diff --name-only --no-renames <previous landing> <landing>` prints that one path for 2d8e0f198, ec6e2d0ed,
93b207fec, 4427b1af8 and c65834167. Each is the catalogue pin that follows a release (CLAUDE.md §13 step 7): one commit
on top of main that changes the values of `version`, `url` and `sha256` and nothing else. Each re-measured every mutant.

What the campaign takes from that file. One catalogue entry has it as its subject
(tests/mutations/.claude-plugin/marketplace.json.json): it inserts a second plugin after the text `"plugins": [`, and
tests/plugin-bundle.test.mjs kills it. The required selftest runs that test on every landing and checks that every
mutant's `from` still matches its subject exactly once (tests/package.test.mjs:1329). A pin changes three values on three
lines and leaves the line the mutant edits alone.

Who reads the shards. Main's ruleset requires nine checks and no shard is among them (.github/rulesets/main.json:15-25),
so `land.mjs` does not wait for them. The only reader is `release-evidence`, at a release sha: its `evaluateRun` requires
every job the run lists to have concluded `success` (scripts/release-evidence.mjs:81-91), and its command line requires
every job the workflow declares to be among them (:850). On a pin landing nothing reads what the shards measured.

ADR-139 tried to shorten the landing by sharding its required jobs and was withdrawn on its own measurement: the gain was
wall-clock and the JavaScript floor stayed the critical path. This record does not touch wall-clock or a required job. Its
unit is runner-minutes.

## Existing Primitives Audit

| Primitive | Where | Fit |
|-----------|-------|-----|
| ADR-023's verdict cache, keyed on the mutated file, its test files and the edit | scripts/mutate.mjs:1793-1833 | Not usable across landings today: a land run passes `--no-cache` and writes no verdicts, and a cache saved on one `land/<sha>` branch is not readable from another; on 2026-11-25 the forge held one mutation cache, on a pull-request ref |
| `evaluateRun`'s strict success and the command line's declared-job check | scripts/release-evidence.mjs:81-91, :850 | Reused unchanged: a skipped or absent shard already makes a run unfit for a release |
| The `mutation cache seed` job, which every shard already needs | .github/workflows/selftest.yml:194-224 | The class is computed there, so `mutations` keeps the one `needs` line tests/package.test.mjs:1203 locks |
| `landingIsFullAt`, which reads the workflow's `QUALITY_HARNESS_FULL_CAMPAIGN` line at the sha | scripts/release-evidence.mjs:781-784 | Left byte-identical; tests/one-run-release.test.mjs locks it (ADR-126 T1) |
| The landing branch name `land/<sha>` | scripts/land.mjs:144; plugin/scripts/branch-state.mjs:279 | Left as it is: the shipped branch-state reader matches it exactly |

## Decision

1. **A landing is a pin landing only when one commit, sitting directly on main, re-pins the catalogue.** The
   `mutation cache seed` job checks the commit out with its parent, into a directory of its own, and runs
   `node scripts/landing-class.mjs`. It answers "skip" only when all of these hold, and "run" otherwise:
   - the event is a push, the ref is `refs/heads/land/<sha>`, and the commit checked out is that sha;
   - the commit has exactly one parent, and that parent is what `git ls-remote origin refs/heads/main` names as main's tip;
   - the commit's tree and its parent's, read raw with `git cat-file tree`, hold the same entries byte for byte but one:
     `.claude-plugin`, stored as a tree (mode `40000`) on both sides, with another object id;
   - those two trees, read the same way, hold the same entries byte for byte but one: `marketplace.json`, stored as a
     regular file (mode `100644`, the tree's own bytes) on both sides, with another object id. No listing is
     interpreted: a tree that differs anywhere else, in a mode, a name or an entry added or removed, is not this;
   - the two versions of that file have the same number of lines, at least one line differs, and every line that
     differs is, on both sides, the same indentation, the same key among `version`, `url` and `sha256`, a string
     value of printable ASCII with no quote or backslash in it, and the same trailing comma or none;
   - both versions are strict UTF-8 JSON, and they are equal once each plugin entry's `version`, `source.url` and
     `source.sha256` are set aside, so a field of the same name anywhere else in the file is not a pin.
   A command that failed or timed out, output that ended early, and any state not named here are "run". *This fails if*
   any input not described here yields "skip".
2. **The claim is about one commit's own change to the tree it sits on**, not about what main measured before it. The
   base is the commit's parent, which cannot move, and the check that it is main's tip only keeps a longer range from
   being judged by its last commit. The rows that must still run the campaign: any other path; a second changed path;
   the same file with a line added, removed or reordered, with another key's value changed, or with its mode changed;
   a merge; a commit whose parent is not main's tip.
3. **A pin landing runs no campaign, and the signal is positive.** The seed job exposes the output `skip`, set to `1`
   only on the answer "skip". `mutations` keeps `needs: mutation-cache-seed` and gains
   `if: needs.mutation-cache-seed.outputs.skip != '1'`, with no status function, so the forge's implied success check
   stays: a seed that failed skips the shards, as it does today, and a release refuses that run, as it does today.
   `mutation cache` needs both jobs and runs unless that output is `1`. Every required job runs on every landing as it
   does today. *This fails if* a shard is skipped on a run whose seed job succeeded and did not write `skip=1`.
4. **Release evidence is not changed.** A skipped shard concludes `skipped` or is absent from the run's jobs, and
   `release-evidence` refuses both. T2 adds the test of both shapes through the command line. No verdict is renamed and
   no remedy is added.
5. **The saving and the forge's behaviour are read from a live pin landing** before the record is closed: T3, at the
   pin that follows the next release.

**What this does not claim.** It does not claim the campaign's verdicts cannot depend on the pin's three values. It
claims that the one mutant whose subject is that file edits a line a pin leaves alone, that the test which kills it runs
in the pin's own required selftest, that nobody reads the campaign on a pin landing, and that the next release measures
every mutant before a tag.

## Alternatives Considered

- **This record's own first draft**, read cold by Codex (gpt-6.2-sol, high effort, 2026-11-25): REQUEST CHANGES, each
  finding checked against source and taken. It also exempted `docs/adr/`, `docs/BACKLOG.md` and `docs/backlog-archive/`;
  the campaign reads the live backlog through two `backlog-record-sweep` mutants, so those paths are measured and are out.
  It compared the commit with a main that moves, so a record-only commit behind an unlanded code commit could turn
  "unchanged" once that commit landed; the base is now the commit's own parent. It put the class in a new job, which
  cannot be done without changing the `needs` line tests/package.test.mjs:1203 locks; the class is computed in the seed
  job. Its condition used `!cancelled()` and an output read case-insensitively; the condition now keeps the implied
  success check and reads `1`. It renamed release-evidence's verdict for a skipped campaign and named a dispatch as the
  remedy, a path the review showed is probably broken (docs/BACKLOG.md §475 items 1 and 2); release evidence is now left
  alone. It cited a backlog section that did not exist, which the selftest refuses.
- **The first build of T1 and T2**, reviewed by Codex (gpt-6.2-sol, high effort, 2026-11-25, range 5aaf5d1bd..5be9e6fa7):
  REQUEST CHANGES, each finding checked against source and taken in one fix round. `diff-tree -r` lists nothing for a tree
  added or removed beside the pin, so trees are listed and a pin is exactly two entries. A control byte passed as a string
  value; a value is printable ASCII and the file after the pin must parse. A line of git's cut short, a raw entry with
  short object ids and a scored status were each read as whole; they are refused. The seed job's checkout shared the
  workspace root with the cache file it restores; it has a directory of its own. Decision 3 said a shard skipped without
  `skip=1` breaks the design while keeping the seed-failure skip; it now says a seed job that succeeded.
- **That fix round, verified by Codex** (the same reviewer, range 5aaf5d1bd..4f8ee9d88): every finding closed, and two
  more inputs read as a pin. A changed `version` outside any plugin entry matched the line rule, and git's listing
  rewrites a stored mode of `100664` to `100644` before comparing. Two rounds on one classifier, so it was restructured
  and not patched again: the trees are compared raw, entry by entry, and the file is also compared as parsed JSON with
  the three pinned values set aside. The diff listing and its parser are gone.
- **Reuse ADR-023's verdicts across landings.** Full runs would write them, and a later landing would fetch the previous
  run's as an artifact and re-measure only the entries whose key changed. It is the literal form of the owner's rule and
  it covers records and code alike, and it costs more: `mutate.mjs` must write verdicts on a `--no-cache` run, the merge
  must publish an artifact, and the seed must fetch across runs. Left as the next step (Follow-ups).
- **Skip the required jobs too on a pin landing** (selftest, Windows, coverage; about 115 runner-minutes). Rejected here: a
  skipped required job fails open, since main would take a sha those checks did not run at (docs/BACKLOG.md §475 item 3).
- **A second branch namespace for light landings, chosen by `land.mjs`.** Rejected: the shipped branch-state reader matches
  `land/<sha>` exactly (plugin/scripts/branch-state.mjs:279), so a landed HEAD would read as CI unknown until the plugin
  changed, which needs a release and an outside run.
- **Exempt every edit to the pin file.** Rejected: an edit to the `plugins` array's own structure is what its mutant
  measures.
- **Keep the pin out of main** (another branch or a release asset). Rejected: it changes where an adopter's client reads
  the catalogue, a served-path change.

## Component / Boundary Impact

None — one new repository script and three edited CI jobs; the plugin, the core and their boundaries are unchanged.

## Wiring & Contract Changes

| Surface | Change | Producer | Consumer(s) |
|---------|--------|----------|-------------|
| `scripts/landing-class.mjs` (`pinOnly(before, after)`, `landingClass(facts)`, and a CLI that appends `skip=<0 or 1>` to the file `GITHUB_OUTPUT` names) | new | T1 | the seed job (T2); tests |
| Job `mutation cache seed` | gains a checkout of depth 2, the class step and the job output `skip` | T2 | `mutations`, `mutation cache` |
| Job `mutations` | gains `if: needs.mutation-cache-seed.outputs.skip != '1'`; its `needs` line is unchanged | T2 | `release-evidence` |
| Job `mutation cache` | needs the seed job as well, and runs unless `skip` is `1` | T2 | the next run's cache |
| `QUALITY_HARNESS_FULL_CAMPAIGN` line (.github/workflows/selftest.yml:340) | unchanged, byte for byte | — | `landingIsFullAt` |
| `scripts/release-evidence.mjs`, `scripts/release.mjs` | behaviour unchanged; the comments at release-evidence.mjs:92-97 and release.mjs:216 that say every land push is full are reworded | T2 | a reader |
| `scripts/land.mjs`, the branch name `land/<sha>`, .github/rulesets/main.json | unchanged | — | every landing |
| CLAUDE.md §13 step 3 and §18; .claude/rules/13-releasing.md; the workflow's comment at :335-338 | reworded: a land push runs the full campaign unless it is a pin landing | T2 | sessions |
| tests/mutations/scripts/landing-class.mjs.json, tests/mutations/.github/workflows/selftest.yml.json | new entries | T1, T2 | `scripts/mutate.mjs` |

## Inter-task Contracts

| Contract | Producing task | Consuming task(s) | Breaking? |
|----------|----------------|-------------------|-----------|
| `scripts/landing-class.mjs` and its `skip=` output line | T1 | T2 | No — new |
| the seed job's `skip` output and the skipped campaign | T2 | T3 | No — new |

## Implementation

See docs/adr/ADR-146-a-pin-landing-is-not-re-mutated/tasks/README.md.

## Consequences

- A catalogue pin's landing costs about 115 runner-minutes, not about 489: the required jobs and nothing else. On the
  nine landings measured that is about 1,870 of about 4,400 runner-minutes.
- A landing of records, tests or code costs what it costs today.
- Main can hold a pin commit whose own landing measured no mutant.
- A release run is unchanged: sixty-one jobs, all measured.
- The seed job gains a checkout and one script on every run.

## Out of Scope

- Skipping or shortening a required job on a pin landing (deferred: docs/BACKLOG.md §475).
- A landing of records alone (deferred: docs/BACKLOG.md §475).
- The dispatch path's two defects the review found (deferred: docs/BACKLOG.md §475).
- The wall-clock of a landing (permanent: boundary: ADR-139 measured it and was withdrawn; this record's unit is runner-minutes).
- Pull-request and dispatched runs (permanent: boundary: on those events the script answers "run", and their campaign rule is ADR-023's and ADR-126's).

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| The forge evaluates the job condition otherwise than its documentation says | Med | Med | T3 reads the first live pin landing; until then a release refuses a skipped or absent shard whatever skipped it, so the failure costs a re-run and never a cleared sha |
| A job skipped at job level is listed as one unexpanded matrix job, or not at all, and a reader that counts shards misreads it | Med | Low | T2 tests both shapes through release-evidence's command line; T3 records what the forge lists |
| The pin's shape changes (a new key, another indentation) and every pin runs the campaign again | Med | Low | The answer is then "run": the cost returns, nothing is skipped wrongly; the script prints why |
| Main's tip moves between the push and the seed job | Low | Low | The parent is then not main's tip and the answer is "run" |
| A verdict that depends on a pin's values is found only at the next release | Low | Med | The release's campaign is full and blocks the tag; stated in Decision |

## Rollback

Revert the commit of T2 and the commit of T1, in that order: the campaign jobs lose their condition and every landing
runs the campaign again; the script and its tests go with T1's revert. Nothing persistent was written.

## Follow-ups

- [ ] After the first pin landing, T3 reads its run; if a campaign job ran or a required check was skipped, revert T2 first.
- [ ] Decide on verdict reuse across landings (Alternatives) once three pin landings have been read: it is what would extend the owner's rule to records and code.
