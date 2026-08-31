# Task ADR-018-T1: cross-check every step against explicit proof

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** M (multi-file)
**Owner:** zy
**Produces:** the `Proof map: v1` task-Markdown contract, its `adr-lint` findings, and two mutation labels
**Consumes:** Ordered Steps, Tests rows and Acceptance text already parsed by `check_task()`
**Data dependency:** hermetic
**Proof map:** v1

## Goal

Make every top-level step in a newly versioned task resolve to a declared test or an explicit
non-test proof, while preserving old task exit behavior and saying when their proof map was not
checked.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/bin/adr-lint` | edit | parse `Proof map: v1`, stable step IDs, Tests-table step references and proof markers; report strict contradictions and legacy uncertainty; wire the pass through `check_task()` |
| `plugin/templates/task-template.md` | edit | opt new tasks into `v1`, demonstrate stable `[S<n>]` IDs and add the Tests `Steps` column |
| `plugin/skills/adr-write/SKILL.md` | edit | require authors to preserve the marker, map every step, and use non-test proof markers instead of inventing tests |
| `tests/gates.test.mjs` | edit | exercise the real CLI over valid, malformed, dangling, uncovered, unknown-version and legacy task corpora |
| `tests/gate-regressions.py` | edit | pin the exact ID/cell/marker grammar and assert the shipped template and authoring skill expose the same contract |
| `tests/mutations.json` | edit | add one behavioral mutant for strict total coverage and one for the visible legacy advice |

## Ordered Steps

1. [S1] Add the failing CLI regression and focused parser matrix first. Confirm the working-tree
   `adr-lint` accepts a task whose fourth implementation step has no Tests-row reference and emits no
   unchecked-map advice before implementation. Map every positive and must-fail control below before
   changing the parser.
2. [S2] Add one proof-map parser beside `check_task()`. Distinguish an absent header from an empty or
   unknown one; under exact `v1`, parse top-level `[S<n>]` identities, the fifth Tests-table `Steps`
   cell and the three exact non-test marker arms without natural-language inference.
3. [S3] Validate every `v1` task regardless of status: require one unique ID per top-level step,
   reject malformed/duplicate IDs and cells, reject dangling table references, and require every ID
   to have at least one table reference or valid proof marker. Wire this through the real CLI. An
   unmarked task receives one `Findings.advise()` message saying the map was not checked; a present
   unknown version blocks instead of falling back to legacy.
4. [S4] Update the task template with `**Proof map:** v1`, stable step-ID guidance, the fifth Tests
   column and the exact proof-marker vocabulary. Keep list order and identity separate, and retain an
   em dash for supplementary tests that map no step.
5. [S5] Update `adr-write` so every new task retains the template marker and every step is mapped;
   say explicitly that Acceptance, mutation and reasoned human observation are legitimate proof and
   that the linter checks references rather than semantic adequacy.
6. [S6] Add the exact mutation labels `lint: every proof-map step is accounted for` and `lint: an
   unmarked task says its proof map was not checked`. Use compiling, anchor-preserving changes that
   respectively disable the strict validator and the legacy advice; run the catalogue exact-once and
   LF checks before either mutation.
7. [S7] Run the focused Acceptance through `adr-verify`, kill both behavioral mutants with the CLI
   regression rather than catalogue integrity, restore the source after each run, then finish with
   the full unpiped repository self-test. [proof: acceptance] [proof: mutation]

## Acceptance

```bash
set -o pipefail
node tests/gates.test.mjs 2>&1 | tee /tmp/adr018-t1-gates.out &&
grep -qF '✔ adr-lint cross-checks every ordered step against an explicit proof' /tmp/adr018-t1-gates.out &&
! grep -qE '^✖|ℹ fail [1-9]' /tmp/adr018-t1-gates.out &&
python3 tests/gate-regressions.py plugin/bin plugin/skills/postmortem/SKILL.md . &&
node tests/package.test.mjs
```

The positive CLI-result grep makes the fence red before the named test exists: the rest of the file
may pass while that promised test is absent. Both catalogue checks are preflight controls. They may
prevent an invalid mutation run, but neither is allowed to earn a behavioral kill; the named CLI
test must observe both missing mechanisms.

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `adr-lint cross-checks every ordered step against an explicit proof` | `tests/gates.test.mjs` | through the CLI: a valid `v1` map passes; duplicate/missing IDs, missing/misplaced Steps columns, malformed cells, dangling references, uncovered steps and empty human reasons fail; an absent marker exits zero with one unchecked-map advice, while present-empty and unknown proof-map versions fail; moving steps without changing IDs stays valid | — | S1, S2, S3 |
| `test_proof_map_contract` | `tests/gate-regressions.py` | exact positive/non-zero-padded ID grammar, comma-list and em-dash cells, escaped-pipe/CRLF/nested-list controls, marker arms, and parity of the shipped task template with `adr-write` | — | S1, S2, S4, S5 |
| `every catalogue entry still matches the source it mutates, exactly once` | `tests/package.test.mjs` | both mutation anchors remain unique in the final source | — | S6 |
| `a mutation that matches across lines targets a file git checks out with LF` | `tests/package.test.mjs` | any multiline Python mutation remains portable to Windows checkout semantics | — | S6 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the focused grammar matrix exercises every accepted token and rejection class |
| 2 — something selects it | the CLI test reaches the pass through `check_task()`; one mutant disables the strict call and another suppresses the legacy advice, and that same CLI test must kill both |
| 3 — the caller can discover it | the shipped task template opts in and `adr-write` explains each mapping form; the CLI finding names the exact header when a legacy task is unchecked |
| 4 — it is used | the ADR-018 task is the first `v1` consumer and the synthetic CLI corpus reproduces the reported unmapped-step defect; external uptake is not measured yet |

## Class Sweep

**Class:** every `adr-lint` check that connects a task's plan or Tests table to claimed proof.

```bash
rg -n '^def (check_task|check_step_proof_map|check_tests_exist|check_tests_can_fail|check_named_tests_are_run)\b' plugin/bin/adr-lint
rg -n 'Proof map|\[S[0-9]+\]|\| Steps \|' plugin/templates/task-template.md plugin/skills/adr-write/SKILL.md
```

The first command must return the four existing members plus the new proof-map pass. The second must
show one authoring contract across both shipped sources. If another task parser or template appears,
add it to the matrix or name why it consumes a different contract before marking this task done.

## Mutation Log

<!-- tool-written by adr-verify --mutant; empty at authoring -->
- 2026-09-01 · a410f02* · mutant killed · exit 1 · `plugin/bin/adr-lint` · pre-cover every parsed step so an unmapped step can disappear from the total-coverage finding · acceptance-sha256:0a6ce63df1b2291b7218da4e8ccd4f1971f443e58b4520f7952f58cf30da22e9
- 2026-09-01 · a410f02* · mutant killed · exit 1 · `plugin/bin/adr-lint` · suppress the only visible legacy proof-map advice while preserving its non-blocking exit · acceptance-sha256:0a6ce63df1b2291b7218da4e8ccd4f1971f443e58b4520f7952f58cf30da22e9
- 2026-09-01 · a410f02* · mutant killed · exit 1 · `plugin/bin/adr-lint` · pre-cover every parsed step so an unmapped step can disappear from the total-coverage finding · acceptance-sha256:869d4459419d1a2a6120dc804675a8b3bc56e62404c4305611abaa9962c99128
- 2026-09-01 · a410f02* · mutant killed · exit 1 · `plugin/bin/adr-lint` · suppress the only visible legacy proof-map advice while preserving its non-blocking exit · acceptance-sha256:869d4459419d1a2a6120dc804675a8b3bc56e62404c4305611abaa9962c99128

## Invariants

- The linter never claims an unmarked legacy task's steps were checked; it reports exactly one
  non-blocking advice and preserves the task's prior exit behavior.
- A present empty, misspelled or future proof-map value never falls through to the legacy path.
- Every `v1` top-level numbered step has one stable, unique, positive non-zero-padded ID, independent
  of list order and task status.
- Every Tests-table step token resolves, and every step has a Tests-row reference or one exact
  non-test proof marker; supplementary `—` rows contribute no coverage.
- The parser reports only syntax and referential facts it observed. It never says a mapped test
  semantically proves the prose.
- Existing test existence, failure-path, Acceptance-selection, evidence and mutation checks continue
  to apply after this map; the new link grants no exemption.
- Both behavioral mutants compile, preserve their source anchors, and are killed by the served CLI
  regression rather than a catalogue-integrity check.

## Risks

- A permissive parser could accept `S1-S4`, `all` or a marker-like sentence and reintroduce an
  uncheckable claim. Use a closed grammar and must-fail controls for every tempting shorthand.
- A strict parser could treat nested ordered examples as task steps or split escaped table pipes.
  Limit identities to top-level lines, reuse the current cell splitter, and pin CRLF, continuation,
  nested-list and escaped-pipe controls.
- Legacy advice could become noisy or become an escape. Emit it once per task, keep it non-blocking,
  name `Proof map: v1` as the remedy, and mutate the advice path independently.
- A broad mutation may be killed by an unrelated grammar assertion. Each mutant must remove one
  served behavior, compile, and go red at the focused CLI test before its verdict is recorded.

## Stop Condition

Stop and return to the owner if the check requires semantic/NLP judgement to decide whether a test
proves a step, if an unmarked historical task must block to implement the design, if deleting the
marker can produce clean output, or if either mechanism cannot be disabled by a compiling mutant
that the focused CLI regression kills.

## Out of Scope

- Rewriting historical tasks or their evidence logs.
- Inferring proof from `Verifies` prose, test names or list ordinals.
- Changing task statuses, Acceptance digesting, Verification Log or Mutation Log grammar.
- Adding another proof-map version before a concrete incompatible contract exists.

## Verification Log

<!-- tool-written by adr-verify; empty at authoring -->
- 2026-09-01 · a410f02* · exit 0 · `set -o pipefail …` · acceptance-sha256:0a6ce63df1b2291b7218da4e8ccd4f1971f443e58b4520f7952f58cf30da22e9
- 2026-09-01 · a410f02* · exit 0 · `set -o pipefail …` · acceptance-sha256:869d4459419d1a2a6120dc804675a8b3bc56e62404c4305611abaa9962c99128
