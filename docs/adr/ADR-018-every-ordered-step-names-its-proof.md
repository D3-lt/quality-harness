# ADR-018: Every ordered step names its proof

**Status:** Accepted
**Date:** 2026-08-31
**Owner:** zy
**Spec:** None — no spec stage
**Cross-references:** docs/adr/ADR-003-a-gate-asserts-behaviour-not-shape.md, docs/adr/ADR-005-a-gate-reports-what-it-observed.md, docs/adr/ADR-009-a-decision-names-what-enforces-it.md, docs/adr/ADR-011-a-pointer-resolves-or-it-is-reported.md, docs/adr/ADR-014-a-task-that-is-honestly-unfinished.md, docs/adr/ADR-015-a-go-fence-can-reach-its-required-success.md
**Governs:** `plugin/bin/adr-lint`, `plugin/templates/task-template.md`, `plugin/skills/adr-write/SKILL.md`, `tests/gates.test.mjs`, `tests/gate-regressions.py`, `tests/mutations.json`
**Enforced-by:** `lint: every proof-map step is accounted for`, `lint: an unmarked task says its proof map was not checked`
**Invalidates:** none — checked. ADR-003 still requires behavioral, compiling mutations; this record does not claim a structural link proves behavior. ADR-005 still forbids conclusions the gate did not observe, so legacy and semantically ambiguous cases are named rather than guessed. ADR-009 and ADR-011 continue to own enforcement-pointer resolution. ADR-014's evidence obligations remain status-independent. ADR-015's Go-fence reachability pass is unchanged; this adds the missing plan-to-proof edge before runner-specific reachability checks apply.
**Served-path change:** `adr-lint` cross-checks every explicitly versioned task step against a Tests-table reference or a named non-test proof, and reports unversioned legacy tasks as unchecked instead of silently implying complete coverage.

## Context

A 2026-08-31 field report from executing ADR-002 through ADR-010 found a task whose fourth ordered
step required the catalogue unit to prefill `tests` from `entry.tests`. Neither the task's Tests
table nor its Acceptance fence asserted that behavior. The unit test stayed green because it called
the execution path with a handcrafted tests list, so the plan named work that its declared proof did
not reach.

The current task reader parses `## Ordered Steps` and `## Tests` independently. Later passes confirm
that a named test exists, can fail, and is selected by a narrowed Acceptance command, but no field
connects a particular step to any of those tests. Reading the `Verifies` prose to infer a connection
would recreate the same problem as a shape-only gate: similar wording can satisfy it without a
checkable identity.

Existing task files cannot be rewritten as though their authors had made this mapping. Their
tool-written logs bind real historical fences, and adding inferred links would turn a migration into
new evidence. The new contract therefore has an explicit version boundary: strict referential checks
apply only when a task says `**Proof map:** v1`; absence remains legacy-compatible but always emits
one non-blocking advice that says the proof map was not checked. The shipped template and authoring
skill opt every newly authored task into `v1`, so deleting or omitting the marker is visible rather
than a clean escape.

## Existing Primitives Audit

- `sections_of()`, `header_val()` and `check_task()` already read task headers, Ordered Steps,
  Acceptance, Tests rows and evidence sections. **Reshaped** to retain stable step identifiers and
  the Tests table's new `Steps` cell without introducing a second Markdown reader.
- `check_tests_exist()`, `check_tests_can_fail()` and `check_named_tests_are_run()` already test the
  downstream halves of a declared Tests row. **Reused unchanged** after the new referential check;
  a link to a nonexistent, inert or unselected test earns no stronger claim.
- `Findings.advise()` already reports an admitted could-not-check state without changing the exit
  code. **Reused** for tasks with no proof-map marker. Unknown versions and malformed `v1` maps are
  ordinary blocking findings because the author explicitly selected a contract the gate can read.
- `plugin/templates/task-template.md` and `plugin/skills/adr-write/SKILL.md` already define the task
  contract authors copy. **Extended together** so new files do not depend on remembering an
  out-of-band convention.
- `tests/gates.test.mjs` already drives the real working-tree CLI over copied task corpora, while
  `tests/gate-regressions.py` pins parser truth tables directly. **Reused at both boundaries**; the
  CLI test proves wiring, and the focused matrix proves the exact grammar and legacy split.
- `tests/mutations.json` already makes advisory and blocking gate behavior falsifiable. **Reused**
  with one compiling behavioral mutant for the strict map and one for the legacy advice.

## Audit of the class

**Class:** every `adr-lint` check that connects a task's authored plan or Tests table to proof the
task claims.

Enumerated 2026-08-31 from the working tree:

```bash
rg -n '^def (check_task|check_tests_exist|check_tests_can_fail|check_named_tests_are_run)\b' plugin/bin/adr-lint
```

The command returned four members: `check_task` at line 630, `check_tests_exist` at line 2068,
`check_tests_can_fail` at line 2695, and `check_named_tests_are_run` at line 2812. The first parses
the two sections independently; the other three start from Tests rows and never inspect Ordered
Steps. None can report a step that appears nowhere in the declared proof.

**Members deliberately left out:** spec `Covers:` aggregation links requirements to tasks rather
than steps; README/DAG checks link tasks to each other; and `adr-verify` records what an Acceptance
fence or mutant did at runtime. Those checks remain necessary, but none owns the missing
step-to-proof identity.

## Decision

The task Markdown contract gains an optional `**Proof map:**` header. The only supported value is
`v1`. A task with no header is a legacy task: `adr-lint` emits one advice saying its Ordered Steps
were not cross-checked and performs no inferred mapping. A present but empty or unknown value is a
blocking finding, never a fallback to legacy. The task template emits `v1`, and `adr-write` requires
authors to retain it, so omission remains compatible without being silent.

Under `v1`, each top-level numbered line in `## Ordered Steps` begins immediately after its ordinal
with a stable identifier of the form `[S1]`, where the numeric part is a positive, non-zero-padded
integer. The list ordinal expresses execution order; the `S` identifier expresses identity, so they
need not match and an author must not renumber IDs merely because steps move. Every identifier is
unique within the task. Continuation lines and nested examples are content of the preceding step and
do not acquire identities of their own.

The Tests table gains a fifth `Steps` column. Each data cell is either an em dash for a supplementary
test or a comma-separated list such as `S1, S3`. Ranges, wildcards, repeated tokens and prose are
invalid. Every named token must resolve to exactly one Ordered Step; a token absent from the plan is
a dangling reference and blocks. A test may cover several steps, and several tests may cover one
step.

A step not referenced by any Tests row must carry at least one exact inline non-test proof marker:

- `[proof: acceptance]` — the task's Acceptance fence directly observes the step;
- `[proof: mutation]` — the task's required killed mutation is the step's proof; or
- `[proof: human: <reason>]` — automation cannot observe it, with a non-empty reason naming what a
  person must inspect.

Unknown or malformed proof markers earn no coverage. Multiple proof sources are allowed. The gate
validates identities, syntax, total coverage and resolution only; it does not infer from prose that
a test actually proves the step, or that a reason is persuasive. ADR-003's compiling behavioral
mutation and review remain the checks on that semantic claim.

The `v1` check runs for every task status. `pending`, `partial`, `blocked` and `done` describe
lifecycle, not exemption from an internally contradictory plan. The parser reports duplicate or
missing step IDs, a missing/misplaced `Steps` column, invalid cells, dangling references, uncovered
steps, and unknown versions through concrete messages naming the task and identifier. It reports an
unmarked task once through advice, never as if the mapping had passed.

## Alternatives Considered

- **Infer links from the Tests table's `Verifies` prose.** Rejected because synonyms and repeated
  nouns require semantic judgement; a confident match would be an observation the parser did not
  make, contrary to ADR-005.
- **Require one test row per numbered step.** Rejected because some steps are directly proved by the
  Acceptance fence, a killed mutant, or an unavoidable human observation. Inventing a test name for
  procedural proof makes the table more complete and the evidence less true.
- **Apply the new columns retroactively to every task.** Rejected because this corpus and adopting
  corpora contain historical task logs whose authors never declared a mapping. Blocking all of them
  on upgrade would turn a useful gate into permanent noise; silently synthesizing links would be
  worse.
- **Make the marker optional and say nothing when it is absent.** Rejected because deleting one line
  would buy a clean lint result. Legacy compatibility is admitted explicitly in one advice instead.
- **Use list ordinals as identifiers.** Rejected because inserting or reordering a step would retarget
  every Tests cell without changing its text. Identity and order are separate concerns.

## Component / Boundary Impact

None — internal to the `adr-lint` task reader, the task-authoring contract and their repository-owned
tests. No module moves, new process, persistent state or external integration is introduced.

## Wiring & Contract Changes

| Surface | Change | Producer | Consumer(s) |
|---------|--------|----------|-------------|
| task Markdown header | optional `**Proof map:** v1`; absent means reported legacy, unknown means invalid | task template and `adr-write` | `adr-lint`, ADR authors, adopting corpora |
| Ordered Steps grammar | each `v1` top-level step carries one stable `[S<n>]` identity or an explicit non-test proof marker | task author | `adr-lint` proof-map pass, reviewers |
| Tests table | adds `Steps` cells containing comma-separated `S` identities or `—` | task author and task template | `adr-lint`, `adr-verify` readers unchanged, reviewers |
| `adr-lint` findings | strict referential findings for `v1`; one non-blocking unchecked-map advice for legacy | proof-map pass called from `check_task()` | CLI users, CI, `/quality-harness:adr-write` |
| mutation catalogue | two labels become the durable falsification points for strict coverage and visible legacy state | T1 | `scripts/mutate.mjs`, `Enforced-by:` resolution |

## Inter-task Contracts

None — one task.

## Implementation

One task, in `tasks/`. See `tasks/README.md`.

## Consequences

- **Positive:** a plan step can no longer disappear between Ordered Steps and Tests in a `v1` task
  without a concrete identifier appearing in the lint finding.
- **Positive:** procedural and human-observed work remains honest instead of acquiring invented test
  rows merely to satisfy a cardinality rule.
- **Positive:** old corpora keep their current exit behavior while the output says exactly which
  tasks received no cross-check.
- **Negative:** authors must maintain stable step IDs and a fifth Tests-table column as the plan
  changes.
- **Negative:** the mapping is an authored claim. Referential completeness does not prove that a
  mapped test semantically exercises the step; mutation and review still carry that burden.
- **Neutral:** task status, Verification Log and Mutation Log grammar are unchanged.

## Out of Scope

- Inferring proof links from natural-language step or test descriptions. (permanent: boundary: this decision chooses explicit identifiers because a parser cannot observe semantic equivalence in prose.)
- Rewriting historical tasks to manufacture `v1` mappings after their evidence was recorded. (permanent: boundary: preserving authored evidence is the compatibility boundary; legacy absence is reported instead.)
- Requiring every procedural step to name a test. (permanent: boundary: Acceptance, mutation and reasoned human observation remain deliberately distinct proof sources.)
- Judging whether a referenced test or human reason is persuasive. (permanent: boundary: ADR-003's behavioral mutation and human review own semantic adequacy; this gate owns referential completeness.)
- Changing task status or runtime evidence grammar. (permanent: boundary: ADR-014 and the existing evidence chain remain separate contracts.)

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| A complete-looking map creates false confidence in a weak test | Med | High | findings say `referenced`, not `proved`; ADR-003 mutation evidence remains required and the task tests include a control whose mapped test does not make semantic claims |
| An author removes the marker to escape strict findings | Med | Med | every absent marker emits one explicit unchecked-map advice; the template and skill create `v1` by default; a behavioral mutant proves the advice is live |
| Existing tasks turn red after a plugin upgrade | Med | High | unmarked tasks remain non-blocking legacy inputs; strict checks start only after an exact `v1` opt-in |
| A typo is mistaken for a legacy record | Low | High | distinguish header absence from present-but-empty/unknown values and block the latter |
| Markdown table parsing misreads an escaped pipe or continuation line | Med | Med | reuse the existing table splitter, pin CRLF/escaped-pipe and nested-list controls in the direct grammar matrix, and decline prose/ranges rather than guess |
| The helper is implemented but never called | Med | High | the CLI-level test must fail when the `check_task()` wiring is removed, and the strict-map mutant disables that served path |
| New advice overwhelms a large legacy corpus | Med | Low | emit exactly one concise advice per unmarked task, with the opt-in header and the phrase `not checked` in the message |

## Rollback

Revert T1. `Proof map`, `[S<n>]`, proof markers and the extra Tests-table column remain ordinary
Markdown that older `adr-lint` versions ignore, so no record or evidence log needs migration.

## Follow-ups

None — T1 owns the parser, authoring contract, CLI wiring and falsification evidence.
