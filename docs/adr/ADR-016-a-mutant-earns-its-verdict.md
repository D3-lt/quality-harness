# ADR-016: A mutant earns its verdict

**Status:** Accepted
**Date:** 2026-08-31
**Owner:** zy
**Spec:** None — no spec stage
**Cross-references:** docs/adr/ADR-002-a-mutant-restore-outlives-its-process.md, docs/adr/ADR-003-a-gate-asserts-behaviour-not-shape.md, docs/adr/ADR-005-a-gate-reports-what-it-observed.md, docs/adr/ADR-006-a-verdict-that-names-its-own-reliability.md, docs/adr/ADR-009-a-decision-names-what-enforces-it.md, docs/adr/ADR-013-a-mutation-a-human-performed.md
**Governs:** `plugin/bin/adr-verify`, `plugin/templates/task-template.md`, `plugin/skills/adr-execute/SKILL.md`, `tests/evidence-chain.test.mjs`, `tests/package.test.mjs`, `tests/mutations.json`
**Enforced-by:** `verify: a mutant is judged only after its clean fence passes`, `verify: generated mutation outputs are restored with their source`
**Invalidates:** none — checked. ADR-002's journal-before-mutation and conservative recovery remain the governing order and are extended from one known target to an explicit transaction manifest; ADR-003 still requires behavioral mutants; ADR-005's observed-state vocabulary gains a pre-mutation `UNPROVEN` outcome; ADR-006's baseline principle is applied to `adr-verify` without claiming a baseline proves assertion quality; ADR-013's human-mutant lane is unchanged.
**Served-path change:** `adr-verify --mutant` runs the clean Acceptance fence before changing a file, refuses to award a verdict when that baseline is unusable, and restores every explicitly declared generated output with the mutated source.

## Context

Two independent false-confidence seams were measured in adopting corpora on 2026-08-31.

First, an Acceptance fence can be red before the mutation. `run_mutant()` currently applies the
edit before running the fence (`plugin/bin/adr-verify:796`) and may award `killed` from an ordinary
non-zero result (`plugin/bin/adr-verify:831-857`). It runs the clean fence only for two ambiguous
output classes and only after restoration (`plugin/bin/adr-verify:867-899`). A pre-existing failing
fence can therefore lend its failure to an unrelated mutant.

Second, a source file can materialize another file that the compiler actually reads. In two
reported runs a `.templ` mutation was baked into `*_templ.go`; `adr-verify` then restored only the
`.templ` source. The journal records one `file`/`original`/`mutated` tuple
(`plugin/bin/adr-verify:774-781`) and the `finally` restores only `target`
(`plugin/bin/adr-verify:858-865`). The evidence run ended with a generated mutant still in the
worktree.

The tool cannot safely infer either relationship from arbitrary shell. A fence may invoke a
wrapper, container, build system, code generator, or remote service; generated paths are not
determined by suffix alone. The reliable claim is differential — the same fence passed before the
mutation and failed after it — plus an explicit list of files the author authorizes this process to
restore.

## Existing Primitives Audit

- `normalize_acceptance()`, `scored_nothing()`, `environment_failure()` and `fence_timeout()`
  already classify the clean command without parsing shell. **Reused** before the journal is armed.
- `mutant_journal()` and `recover_mutant()` already put recovery state outside the repository and
  refuse to overwrite a target that no longer equals the known mutant. **Extended** to a versioned
  manifest while retaining the one-file journal reader for interrupted older runs.
- `run_mutant()` already snapshots exact bytes, installs a SIGTERM unwind, restores in `finally`,
  and distinguishes `killed`, `survived` and `inconclusive`. **Reshaped**, not duplicated.
- `looks_absolute()` and the existing cwd-relative target resolution establish the CLI path
  boundary. **Reused and tightened** for every declared restore member.
- `tests/evidence-chain.test.mjs` already drives the real CLI and contains an intentionally unread
  `unused.py` target at lines 308-333. **Reused** for the pre-red fence and generated-output cases.
- `tests/mutations.json` already supplies one behavioral falsification point per durable mechanism.
  **Reused** with two entries.

## Audit of the class

**Class:** commands in this product that deliberately mutate an arbitrary consumer worktree file,
run that consumer's Acceptance fence, and write a task-level mutation verdict.

Enumerated 2026-08-31:

```bash
rg -n '^def (run_mutant|run_human_mutant)\b|--mutant' plugin/bin/adr-verify
rg -n 'Mutation Log|append_entry\(' plugin/bin/adr-verify scripts/mutate.mjs
```

`run_mutant()` is the only member. `run_human_mutant()` writes a human-observed report and mutates
nothing. `scripts/mutate.mjs` runs this repository's fixed catalogue and writes campaign output, not
a consumer task's Mutation Log; it is therefore outside this evidence-writer class. Its own
target-only restore deserves review if the catalogue ever admits materializing sources, but it
cannot award the consumer verdict governed here.

## Decision

`adr-verify --mutant` becomes a two-phase measured transaction.

### 1. The clean fence earns the right to mutate

Before changing the target, the tool runs the task's exact normalized Acceptance fence with the
same cwd, shell, environment and timeout used for the mutant run. The baseline is usable only when
it finishes, exits 0, and is not classified by the existing `scored_nothing()` vocabulary as
having run no tests. The transaction is journalled before this first fence, because a declared
generated output can be written by the clean run too; "baseline" and "mutant" are explicit journal
phases rather than one unmarked interval.

An unusable baseline prints `UNPROVEN` with the observed reason, exits 1, applies no mutation, and
writes no Mutation Log row. Declared transaction members are first returned to their command-entry
state and the journal is then removed. Exit 2 identifies a usage, authoring, transaction-preflight,
or live-cleanup failure that prevents trustworthy evidence, including a mutant that cannot be
applied as authored. This is not an `inconclusive` mutant: no mutant ran, so there is no verdict to
append.

If the journal cannot be armed, the transaction refuses before either fence, exits 2, changes no
declared path, and writes no Mutation Log row. Continuing after a journal-write failure would make
the first fence capable of changing declared outputs without any recovery record.

After a usable baseline, classification remains evidence-based:

- mutant fence exits 0: `survived`, with wording that the fence may not materialize, compile, load,
  or assert on the changed path;
- mutant fence fails because no tests ran, while the clean fence passed with tests: `killed` by the
  existing missing-tests rule;
- mutant fence fails on build/parse or an environment failure: `inconclusive`;
- mutant fence does not return before the timeout: `UNRUN`, with no Mutation Log row, after restoring
  the declared transaction;
- mutant fence produces an ordinary assertion failure: `killed`.

The baseline is not flake detection and does not prove the target is compiled. It prevents a known
red fence from donating its failure; a survivor remains the loud, non-zero finding that the fence
did not observe the broken mechanism.

### 2. Generated outputs are explicit transaction members

The CLI gains a repeatable option:

```text
--also-restore <repository-relative-path>
```

Each value names one generated or materialized file the Acceptance fence may change because of the
source mutation. Before either fence runs, the tool validates the full manifest and snapshots each
member's exact bytes and whether it existed. Existing members must be regular files inside the
declared cwd. Absolute paths, normalized traversal outside cwd, directories, any symlink path
component, resolved escape through an existing ancestor, duplicate members, and the target repeated
as a secondary member are usage errors. A named member may be absent at command entry so a
generator-created file can be removed on restore, but its nearest existing ancestors must still
resolve inside cwd without crossing a symlink.

The versioned journal is written before the clean fence and contains its current phase, the target's
known original and prospective mutant bytes, plus every secondary member's original bytes/existence.
After a usable baseline, every declared secondary is restored to command-entry state before the
journal advances to `mutant` and the target changes; the mutant fence must materialize its own
outputs just as the recorded command says. On ordinary return, exception, Ctrl-C, or the installed
SIGTERM unwind, `finally` restores existing entry bytes and deletes members that were absent at
command entry. The journal is removed only after every declared member is restored.

Before every live restoration or deletion, the tool revalidates the target and every secondary
member against the same no-symlink and resolved-containment rules. If a member or ancestor became a
symlink, directory, or otherwise unsafe path during either fence, the tool preserves it, restores
the safe members it can, keeps the journal, prints the unresolved paths, exits 2, and appends no
Mutation Log row: an incomplete transaction cannot yield evidence.

SIGKILL recovery remains conservative. In the `baseline` phase the target is expected to equal its
original; in the `mutant` phase it can be restored automatically only when its current bytes still
equal the journal's known mutant, as ADR-002 requires. A generated member's post-generation bytes
were not known before the killed process, so `--restore` must not overwrite a changed value as
though it proved ownership. It restores only a member already equal to its entry state; otherwise
it preserves both the saved original and the current path, names the unresolved member, keeps the
journal, and exits non-zero for human reconciliation.

The option is explicit because whole-worktree rollback would destroy unrelated edits and suffix
guessing cannot represent `proto`, `sqlc`, custom generators, or output paths selected by config.
The task template teaches authors to list every generated output their fence can write. An
undeclared side effect remains outside the transaction and is never claimed as restored.

An unknown or corrupt versioned journal is itself unresolved evidence: recovery preserves it,
names the problem, and exits non-zero. Any unresolved target or secondary member likewise blocks an
ordinary verification run from measuring the still-ambiguous tree. `--restore` exits zero only when
there was no journal or every recorded member is already at, or was returned to, its entry state.

## Alternatives Considered

- **Infer generated siblings from extensions and conventional names.** Rejected because `.templ`
  has a convention but protobuf and SQL generators commonly choose packages and output directories
  from flags or config. A partial map would present omission as detection.
- **Run a caller-supplied generator before the fence.** Rejected as a separate execution surface:
  the Acceptance fence is the command whose digest and exit status become evidence. Hiding setup in
  another CLI argument would let the evidence command differ from what the task records.
- **Restore every path changed under cwd.** Rejected because `adr-verify` may run in a dirty tree and
  a fence may legitimately create caches, reports, databases, or concurrent edits. The tool has no
  authority to roll back the worktree.
- **Run the mutant in a disposable worktree.** Rejected because untracked and dirty consumer inputs
  are part of the measured task state, while ignored dependencies may be required. Copying them all
  recreates whole-worktree snapshotting under a different name.
- **Keep the post-hoc baseline only for ambiguous output.** Rejected because an ordinary pre-existing
  assertion failure is indistinguishable from a kill after the target has already changed.

## Component / Boundary Impact

None — the change stays inside the `adr-verify` CLI, its task-template documentation, and
repository-owned tests. It adds no service, persistent repository state, or network boundary; the
journal remains outside the consumer repository as decided by ADR-002.

## Wiring & Contract Changes

| Surface | Change | Producer | Consumer(s) |
|---------|--------|----------|-------------|
| `adr-verify --mutant` execution | clean, non-vacuous baseline is required before mutation | T1 | ADR executors and Mutation Log readers |
| `adr-verify --mutant --also-restore` | repeatable explicit restore manifest | T2 | generated-source tasks and interrupted-run recovery |
| mutant journal | versioned target plus secondary-member snapshots | T2 | `run_mutant()` finally path and `--restore` |
| mutation authoring guidance | task template and `adr-execute` tell authors when and how to declare generated outputs | T2 | `/quality-harness:adr-execute` users |
| mutation catalogue | two labels falsify selection of the new mechanisms | T1, T2 | `scripts/mutate.mjs`, `Enforced-by:` resolution |

## Inter-task Contracts

| Contract | Producing task | Consuming task(s) | Breaking? |
|----------|----------------|-------------------|-----------|
| clean-before-mutate baseline and `UNPROVEN` no-write outcome | T1 | T2 | No — T2 adds restore members only after T1 establishes that the generated fixture is eligible to mutate |

## Implementation

Two sequential tasks in `tasks/`. See `tasks/README.md`.

## Consequences

- **Positive:** a fence already red cannot award a kill to an unrelated mutant.
- **Positive:** generated files an author declares are restored byte-for-byte, including the
  absent-at-entry case.
- **Positive:** the survivor message names the likely reachability seam instead of reading as a
  generic failed campaign.
- **Negative:** every `--mutant` costs one additional full Acceptance run.
- **Negative:** authors must know and declare generated outputs; omission is not mechanically
  recoverable from arbitrary build systems.
- **Negative:** a killed process may leave a changed generated member requiring human reconciliation
  because automatic recovery cannot prove who produced its current bytes.
- **Neutral:** existing invocations without `--also-restore` retain the one-target transaction after
  passing the new baseline.

## Out of Scope

- Inferring a build graph or generated sibling from file suffixes, shell text, project config, or
  compiler output. (permanent: boundary: explicit transaction membership keeps restore authority narrower than the user's worktree.)
- Restoring repository-external files, directories, caches, databases, network state, or arbitrary
  fence side effects. (permanent: boundary: this transaction owns only declared regular files under its cwd.)
- Detecting flakes from one clean baseline. (permanent: boundary: this decision measures one paired causal comparison and does not add retry policy.)
- Changing `scripts/mutate.mjs` campaign semantics. (permanent: boundary: the repository catalogue runner is outside the consumer Mutation Log transaction governed here.)
- Treating `--human-mutant` as an escape from the clean baseline. (permanent: boundary: ADR-013 keeps that lane limited to a human-observed mutation when the recorded Acceptance cannot complete.)

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| A flaky fence passes clean and fails under the mutant | Med | High | say the baseline is paired evidence, not flake detection; retain the task's wider verification and review obligations |
| An author omits a generated output | Med | High | task-template guidance names the contract; survivor wording points at materialization/compilation; never claim undeclared paths were restored |
| Normal cleanup overwrites a concurrent edit to a declared generated file | Low | High | require explicit opt-in for each regular path, keep the transaction short, and document that declaration grants restore authority for that run |
| SIGKILL leaves a generated mutant | Med | High | journal entry state before mutation; preserve unknown current bytes and report the unresolved path instead of overwriting |
| Old one-file journals become unreadable | Low | High | version the new manifest and keep the legacy reader as a required regression control |
| Added baseline doubles an already slow mutation campaign | High | Med | the cost buys the causal comparison; authors may narrow a task fence but may not skip the baseline |

## Rollback

Revert T2 first and then T1. The versioned journal reader must continue to recognize any journal
already written by the reverted release until recovery completes; after that compatibility window,
the old one-target behavior is restored. Task files and previously written Mutation Log rows remain
valid because their grammar does not change.

## Follow-ups

None.
