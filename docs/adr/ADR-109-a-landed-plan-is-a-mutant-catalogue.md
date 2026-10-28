# ADR-109: The agent writes the tests; the plugin tests the trust between the code and the contract

**Status:** Accepted
**Date:** 2026-10-17
**Owner:** Zy
**Spec:** None — no spec stage; the owner, 2026-10-17: "MRW plan tool is kinda unique. can we invent something here? mutants on steroids, created during eval/runtime? faster, speedup, more variations? ... hacking the routine, how software is done"
**Cross-references:** docs/adr/ADR-003-a-gate-asserts-behaviour-not-shape.md, docs/adr/ADR-016-a-mutant-earns-its-verdict.md, docs/adr/ADR-022-a-fence-names-what-its-claim-rests-on.md, docs/adr/ADR-076-a-recorded-mutant-runs-in-a-worktree.md, docs/adr/ADR-107-the-plugin-works-the-mrw-way.md
**Governs:** None — declared by its tasks
**Enforced-by:** None — declared by its tasks; T2 adds catalogue mutants, and naming them before they exist would be a pointer to nothing.
**Served-path change:** none until T2; T1 is a measurement.

## Context

A mutant in this corpus is an edit plus a claim: "this test exists to catch this mechanism" (ADR-022). Two records bound
what a mutant must be, and both were measured: it is judged only against a fence that passed clean before it (ADR-016),
and the restore covers everything the fence touched (ADR-016, ADR-002). Neither says where a mutant may come from. The
catalogue is hand-written because nobody built a generator, not because one was decided against; a draft of this record
said otherwise, and the owner's point on 2026-10-17, "older ADRs and decisions might not hold now", sent it back to the
records, which hold no such decision. What CLAUDE.md §4 holds is that a GREEN mutant is a finding about the test, never
a reason to pick an easier edit, and that rule binds a generated mutant as much as a hand-written one.
§4). The cost of that choice is that every mutant is authored after the fact, by someone deciding what mattered.

An mrw plan is the one artifact in the agent loop that already says what mattered: each hunk is a site the agent chose
to change, addressed by line, applied whole or not at all, with a verdict per hunk. When a plan has landed and the fence
is green, every hunk is a candidate mutant with a claim attached for free, "the change at this site is what the tests
should see", and the mutation is the inverse of the hunk: put the original lines back and run the fence. A hunk whose
reversion stays green is an edit the tests do not notice, found at the moment the work is fresh, from the agent's own
plan, with no author deciding what to mutate.

What this is not: a generator of variants. One mutant per hunk, the hunk's own inverse, is the whole set; its size is the
plan's, and its claim is the agent's. Whether that set finds anything is the question, and it is answered by measurement
on this repository's own plans before anything ships to an adopter.

The class: every place a plan lands in this repository. Enumerated 2026-10-17: `adr-verify --mutant-plan` (built under
ADR-107 the same day, the plan grammar inside the gate); `mrw write` plans the agent applies, which the plugin cannot see
except as `file.written` events and the tree observation (ADR-060); and `scripts/mutate.mjs`'s catalogue entries, which
are one-hunk plans already. Left out: `mrw`'s own plans as a hook input (the plugin does not read another tool's plan
files; it reads the tree).

## Existing Primitives Audit

- **`scripts/mutate.mjs`** (`classify`, `baselineOf`, `testArgs`): the campaign runner; a reverted hunk is a catalogue
  entry with `from` = the hunk's body and `to` = the original lines, so the runner needs no new verdict.
- **`adr-verify --mutant-plan`** (ADR-107, in flight): the plan grammar parsed inside the gate, with the restore journal
  (ADR-002, ADR-076). T2 reuses its parser and transaction; it does not write a third plan reader.
- **`adr-verify --mutant`'s Mutation Log row**: the row a killed inverse writes is the existing row; the `--why` is derived
  ("the inverse of hunk N of <plan>"), never free prose.
- **`git diff -U0`** between the tree before and after a landed plan: the hunks, when the plan file itself is not kept.

## Decision

**The roles, in the owner's words (2026-10-17): "the main agent writes the tests, the qh plugin — invariants and
inversion, to test the trust between the code and the contract."** The agent is the author of tests and of the claims a
task carries; the plugin never writes a test. What the plugin does is take the two things the agent already wrote, the
change (a plan of hunks) and the contract (a task's `## Invariants`, 278 of them in this corpus on 2026-10-17, each
written as "must remain true" and read by nothing executable), and try to break the trust between them: invert a hunk
and ask whether the tests notice; break an invariant and ask the same. A test the agent wrote that notices neither is
the finding; the plugin names it and stops.

1. **Measure first (T1).** Over this repository's own landed changes since v3.8.40, taken as hunks from `git diff -U0`
   of each plugin commit, revert one hunk at a time in a worktree and run the commit's own test files. Record, per commit:
   hunks, hunks whose reversion the tests noticed, hunks they did not, and the time. The result goes into this record's
   Follow-ups and BACKLOG §381 as counts, never as a changed verdict on any record. If fewer than one hunk in ten goes
   unnoticed, T2 is not built and this record is Withdrawn with the numbers.
2. **Then the gate (T2, only if T1 earns it).** `adr-verify <task.md> --inverse <plan>`: parse the plan with
   `--mutant-plan`'s reader, require that it has landed (every hunk's body is at its address), and for each hunk in turn
   restore the original lines through the mutant transaction and run the fence. A hunk whose fence stays green is
   reported as `survived`, named by its address, and recorded in the Mutation Log as `--mutant` records a survivor; a hunk
   whose fence goes red is `killed` and recorded as a killed mutant with a derived `--why`. The exit is the campaign's:
   0 when every hunk was killed, 1 when any survived, 4 when a fence could not run. Nothing is written to the source
   beyond the transaction, and the tree is restored in a `finally` as `--mutant` restores.
3. **An invariant is the second mutation source (T2).** Beside `--inverse`, `adr-verify <task.md> --break-invariants`
   reads the task's `## Invariants` and, for each bullet that names a symbol, a path or a literal the plan's hunks touch,
   runs the inverse of exactly those hunks; an invariant whose named sites can all be reverted with the fence staying
   green is reported as `unguarded`, by its bullet text. An invariant that names nothing the plan touched is reported
   `unread`, never `unguarded` (ADR-005: could-not-look is not a verdict). The reader is the same name resolver
   `adr-lint` uses for backticked paths and symbols in prose; no new parser.
4. **A survivor or an unguarded invariant is a finding about the tests, never an edit to anything.** The inverse that
   stays green says the tests do not see that site; the unguarded invariant says the contract the agent wrote is not what
   the tests hold. The gate says so and stops; it never edits the plan, the tests, the invariants or the catalogue
   (CLAUDE.md §4). Writing the test that closes it is the agent's work, which is the point of the split.

**This fails if**: T2 ships without T1's numbers in this record; an `--inverse` or `--break-invariants` run leaves a hunk
restored after exit; a survivor or an unguarded invariant is recorded as killed; a plan that has not landed is run as if
it had; an invariant that names nothing the plan touched is reported unguarded.

## Alternatives Considered

- **(a) Generate operator mutants per hunk (`>`→`>=`, drop a branch, swap a constant) instead of the inverse.** Not
  rejected: no record decides against it, and ADR-016's two bounds apply to a generated mutant as they do to a written
  one. Deferred to T1's measurement, which runs both on the same hunks and compares kill rate per fence run; T2 takes
  whichever earns it, or both. What stays rejected is a score with no claim: an operator mutant carries the claim "this
  site's own behaviour is tested", which is weaker than the inverse's "this change is seen", and T1 says whether the
  weaker claim finds anything the stronger one does not.
- **(b) Run the inverse at every `mrw write`, in a hook.** Rejected: the plugin does not read mrw's plan files (ADR-060
  reacts to observed events), and a fence per write is the hot-path cost ADR-080 forbids.
- **(c) Skip T1 and build the gate.** Rejected by this record's premise: the owner asked whether this is a good idea, and
  the answer is a measured kill rate on real plans, not an argument.
- **(d) Put the inverse into `scripts/mutate.mjs` as a `--from-diff` mode instead of `adr-verify`.** Kept as T1's method:
  the campaign runner already classifies, and T1 is a measurement, not evidence a task records. T2 goes into `adr-verify`
  because a Mutation Log row is tool-written evidence and the campaign writes none.

## Component / Boundary Impact

None in T1 (a repository script under `scripts/`, which does not ship, CLAUDE.md §1). T2 adds one arm to
`plugin/bin/adr-verify` beside `--mutant-plan`, reusing its parser and transaction; no host boundary or format changes.

## Wiring & Contract Changes

| Surface | Change | Producer | Consumer(s) |
|---------|--------|----------|-------------|
| `scripts/inverse-hunks.mjs` | T1's measurement: hunks of a commit reverted one at a time against its tests | T1 | this record's Follow-ups, BACKLOG §381 |
| `adr-verify --inverse <plan>` | T2's arm, if built | T2 | the Mutation Log, adr-lint's `mutant killed` requirement for `done` |

## Inter-task Contracts

| Contract | Producer | Consumer | Note |
|----------|----------|----------|------|
| T1's counts in Follow-ups | T1 | T2 | T2 is built only on T1's threshold |

## Implementation

See `docs/adr/ADR-109-a-landed-plan-is-a-mutant-catalogue/tasks/README.md`.

## Consequences

- **Positive:** a mutant per changed site with a claim and no author, at the moment the change lands; a measured answer to
  whether the tests see what agents change.
- **Negative:** T2 runs the fence once per hunk, so a twenty-hunk plan is twenty fence runs; it is opt-in and runs where
  `--mutant` already runs, in a worktree.
- **Neutral:** the hand-written catalogue stays; the inverse finds unseen sites, and the catalogue names mechanisms.

## Out of Scope

- Operator-generated mutants in T2 before T1 has compared them with the inverse (deferred: T1's counts)
- Reading mrw's plan files from a hook (permanent: boundary: ADR-060, the plugin reads observed events)
- Scoring plans in the benchmark, turns per landed hunk (deferred: ADR-107 T4's stage)
- A dry-run plan as a review checkpoint before a commit (deferred: `docs/BACKLOG.md` §381, filed with this record)

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| T1's hunks are too fine (a one-line revert breaks syntax, which counts as killed for the wrong reason) | High | Med | T1 classifies a revert that fails to parse or build as `inconclusive`, as `adr-verify --mutant` does (ADR-085 for a build diagnostic inside an assertion) |
| The inverse of a hunk that only adds a test is trivially killed | Med | Low | T1 excludes hunks under `tests/` from the count; they are what judges, not what is judged |
| A survivor is read as "delete the hunk" | Low | High | Decision 3; the gate's wording says what the tests do not see |

## Rollback

T1 writes no evidence; delete the script. T2: revert its commit; no stored format changes.

## Follow-ups

- [ ] T1's counts, with the commit range and the date, before T2 is started.
- [x] Owner decision: Accepted by the owner, 2026-10-17 ("accepted"); T1 runs as a measurement, T2 waits on its numbers.
- [ ] T1's counts, measured 2026-10-17 with `node scripts/inverse-hunks.mjs --range v3.8.40..HEAD` over the 23 plugin commits in the range. CONTENDED and INCOMPLETE: the 1-minute load was 77.3 at the start, was still above 10 after the 20-minute wait, peaked at 33.9 between commits and was 6.4 at the end, so every figure is unattributable to the code alone (T1's Stop Condition says such a count is not entered; it is entered here labelled, at the lead's instruction, and is not a basis for the threshold decision). The 60-minute budget ran out inside the 13th commit: 63 of the 162 plugin hunks outside tests/ were not run (10 commits, plus 1 hunk of the 13th) and are in no figure. Cells are n: noticed/unnoticed/inconclusive. Inverse, 99 hunks judged: 75/18/6, so 18 of 99 unnoticed. Comparison flipped, 10: 6/4/0. Boolean literal flipped, 32: 4/28/0. Numeric literal +1, 35 judged: 4/31/0. Fence runs per unnoticed hunk found: inverse 5.3 (96 runs / 18), comparison 2.5, boolean 1.1, numeric 1.1, all kinds 3.5 (173 mutation runs + 11 baseline runs / 53 hunks). Hunks unnoticed by the inverse only 17, by an operator only 34, by both 1. The operators also act on string, regex and argument literals, so their unnoticed counts are an upper bound on what a test could be asked to see; 50 of the 162 hunks are one commit. Per commit, hunks and inverse noticed/unnoticed/inconclusive: ea28eaa3 2, 2/0/0; 68b8b233 1, 0/0/1; b37e3815 7, 6/1/0; 7c932287 8, 6/2/0; f52171d7 1, 1/0/0; a966786c 1, 1/0/0; 394e6702 1, 0/0/1; 6f9473c0 9, 4/4/1; b1a67b6d 50, 43/7/0; 4c12814c 6, 3/1/2; 25269aff 8, 5/2/1; f36b58d5 3, 2/1/0; 5532409e 3, 2/0/0 and 1 unrun; the ten later commits (1e125bf9 to f01b174a) not run. The tests of a hunk are its commit's own test files or the catalogue's, an approximation, so these are a floor on what a per-plan run would find. Needs the owner: decide against Decision 1's threshold (fewer than one hunk in ten unnoticed withdraws this record), on a rerun of the unrun commits at load below the core count if the contended figures are not trusted. T1 is not signed off; `adr-verify --human` is the owner's.
- [ ] T1's counts for the commits the 2026-10-17 run left unrun, measured 2026-10-28 with `node scripts/inverse-hunks.mjs --range 5532409e^..f01b174a --budget-min 120 --max-load 10` (the ten commits 1e125bf9 to f01b174a, plus 5532409e again whole for its unrun hunk). NOT CONTENDED: the 1-minute load was 7.73 at the start, 4.99 at the end and 9.12 at its highest sample, under the 10 cores; 3365 s. Cells are n: noticed/unnoticed/inconclusive. Inverse, 65 hunks: 49/14/2, so 14 of 63 judged unnoticed (22%). Comparison flipped, 7: 5/2/0. Boolean literal flipped, 10: 4/6/0. Numeric literal +1, 8: 3/5/0. Fence runs per unnoticed hunk found: inverse 4.6, comparison 3.5, boolean 1.7, numeric 1.6, all kinds 5.1 (90 mutation runs + 12 baseline runs / 20 hunks). Hunks unnoticed by the inverse only 11, by an operator only 5, by both 3. Per commit, hunks and inverse noticed/unnoticed/inconclusive: 5532409e 3, 3/0/0; 1e125bf9 3, 3/0/0; cc1a8794 3, 2/0/1; fee67440 2, 2/0/0; bb31d8d8 3, 2/1/0; ed805955 4, 2/2/0; 2d39fc02 15, 11/4/0; 3d73a89c 5, 5/0/0; 1792c157 3, 2/1/0; 909a7070 17, 14/3/0; f01b174a 7, 3/3/1. With the twelve commits before 5532409e from the 2026-10-17 run (contended; its inverse cells less 5532409e's 2/0/0 are 73/18/6, so 91 judged and 18 unnoticed), the whole range is 32 of 154 judged hunks unnoticed by the inverse (21%); the uncontended part alone is 22%. Both are above Decision 1's withdrawal threshold of fewer than one in ten. The same approximation of a hunk's tests holds, so these are a floor. T1 is not signed off; the threshold decision and `adr-verify --human` are the owner's.
- [x] The owner's decision against Decision 1, 2026-10-28: the inverse leaves about one hunk in five unnoticed (21% over the range, 22% uncontended), twice the withdrawal threshold, so the record stands and T2 is built. T1 signed off the same day.
