# Spec: A recorded mutant never touches the checkout

> **Date:** 2026-09-30 · **Status:** Ready-for-ADR
> **Owner:** Zy · **Becomes:** ADR-076 (`docs/adr/ADR-076-a-recorded-mutant-runs-in-a-worktree.md`)
> **Gate:** Status may become Ready-for-ADR only after `spec-verify --spec <this file>` exits 0.
> **Cross-references:** docs/research/2026-09-30-the-nervous-system-plan.md (N4), docs/adr/ADR-075-a-campaign-runs-in-a-worktree-and-says-its-load.md (the mechanism this reuses), docs/specs/2026-09-29-a-campaign-never-touches-the-checkout.md

## Problem

`adr-verify --mutant` applies its mutant to the real file in the checkout, runs the task's fence
there, and restores the file from a journal (`plugin/bin/adr-verify:1232`). While that fence runs,
every session and editor reading the checkout meets the mutant: ADR-075's exposure, one mutant at
a time, in the gate adopters run most. `scripts/unasserted.mjs` neuters real gate source the same
way (`scripts/unasserted.mjs:49`). ADR-075 isolated `scripts/mutate.mjs` and named these two as the
rest of the class.

## Goal

An isolated `adr-verify --mutant` or `unasserted.mjs` run changes no byte of the checkout except
the task file's Verification Log and Mutation Log, and grades every mutant as an in-place run does.

## Actors

| Actor | Kind | Goal |
|-------|------|------|
| Task author | human role | record a killed mutant as evidence, as today |
| Peer session or editor | system | keep reading the checkout without meeting a mutant |
| Maintainer | human role | run `unasserted.mjs` over a gate without exposing peers |

## Use Cases

### UC-1: Task author records a mutant in isolation

- **Trigger:** `adr-verify <task> --mutant <file> --from … --to … --why …` · **Preconditions:** the
  task file has a Mutation Log section; the checkout is in a git repository
- **Main flow:**
  1. A worktree of the checkout's working-tree content is built under the git directory.
  2. The clean fence runs there; the mutant is applied there; the mutant fence runs there.
  3. The Verification Log and Mutation Log lines are written to the task file in the checkout.
  4. The worktree is removed.
- **Failure paths:** a. no git repository, or the worktree cannot be built → the run goes in place
  and its first line says why. b. the fence names the checkout's absolute path → the run goes in
  place and names the path. c. the run is stopped by SIGINT or SIGTERM → its worktree is removed;
  killed → the next isolated run removes it once no process of it lives.
- **Postconditions:** the checkout differs only in the task file's two log sections.

### UC-2: Maintainer measures unasserted findings in isolation

- **Trigger:** `node scripts/unasserted.mjs <gate> [suites…]` · **Preconditions:** this repository
- **Main flow:**
  1. Each neutered copy of the gate is applied in a worktree, and the suites run there.
  2. The survivors are reported as today; the worktree is removed.
- **Failure paths:** a. the worktree cannot be built → it stops, names `--in-place`, and neuters
  nothing.
- **Postconditions:** the checkout is byte-identical to before the run.

## Scenarios

### UC1-S1 [happy] A mutant run leaves the checkout unchanged but for the task file's logs [@implemented] → `tests/adr-verify-isolation.test.mjs::a mutant run leaves the checkout unchanged but for the task file's logs` cmd:`node --test tests/adr-verify-isolation.test.mjs`

```gherkin
Given a git repository with a task whose fence runs a test of lib.mjs
When adr-verify records a mutant of lib.mjs
Then the Mutation Log gains a killed entry, and no process reading the checkout ever sees the mutant
And every other byte of the checkout, its index and its stash list are unchanged
```

### UC1-S2 [failure] Outside git the mutant runs in place and says why [@implemented] → `tests/adr-verify-isolation.test.mjs::outside git the mutant runs in place and says why` cmd:`node --test tests/adr-verify-isolation.test.mjs`

```gherkin
Given a task directory that is not in a git repository
When adr-verify records a mutant
Then its first line says it ran in place because no worktree could be built, and the mutant is recorded
```

### UC1-S3 [failure] A fence naming the checkout's absolute path runs in place and names it [@implemented] → `tests/adr-verify-isolation.test.mjs::a fence naming the checkout runs in place and names the path` cmd:`node --test tests/adr-verify-isolation.test.mjs`

```gherkin
Given a task whose fence contains the checkout's absolute path
When adr-verify records a mutant
Then the run goes in place, and its first line names the path it found
```

### UC1-S4 [failure] A stopped run removes its worktree [@implemented] → `tests/adr-verify-isolation.test.mjs::a stopped mutant run removes its worktree` cmd:`node --test tests/adr-verify-isolation.test.mjs`

```gherkin
Given an isolated mutant run whose fence is still running
When it receives SIGTERM
Then its worktree is removed and git lists no worktree for it
```

### UC2-S1 [happy] An unasserted run leaves the checkout byte-identical [@spec] → `tests/unasserted-isolation.test.mjs::an unasserted run leaves the checkout byte-identical` cmd:`node --test tests/unasserted-isolation.test.mjs`

### UC1-S5 [failure] A generated output is reset between the clean and the mutant fence [@implemented] → `tests/adr-verify-isolation.test.mjs::a generated output left by the clean fence is reset before the mutant fence` cmd:`node --test tests/adr-verify-isolation.test.mjs`

```gherkin
Given a fence that builds an artifact only when it is missing, and reads the record through it
When adr-verify records a mutant with --also-restore naming the artifact
Then the mutant fence rebuilds the artifact from the mutated record, and the mutant is killed
```

### UC1-S6 [happy] A sibling path that shares the checkout's prefix does not force the run in place [@implemented] → `tests/adr-verify-isolation.test.mjs::a sibling path sharing the checkout's prefix does not force the run in place` cmd:`node --test tests/adr-verify-isolation.test.mjs`

```gherkin
Given a fence that names a directory whose path begins with the checkout's path but is not inside it
When adr-verify records a mutant
Then the run is isolated, and its first line says so
```

```gherkin
Given a repository with a gate and a suite
When unasserted.mjs neuters each finding site and runs the suite
Then it reports the same survivors as an in-place run, and the checkout is byte-identical
```

### UC2-S2 [failure] An unasserted run that cannot isolate neuters nothing [@spec] → `tests/unasserted-isolation.test.mjs::an unasserted run that cannot isolate neuters nothing and names --in-place` cmd:`node --test tests/unasserted-isolation.test.mjs`

```gherkin
Given a directory where no worktree can be built
When unasserted.mjs runs
Then it exits 2, names --in-place, and the gate's bytes are unchanged
```

## Facts

| ID | Assertion (invariant / behavior) | Test (`path::name`) | Tag | Cmd (optional) |
|----|----------------------------------|---------------------|-----|----------------|
| F-2 | By default `adr-verify --mutant` builds a worktree of the checkout's working-tree content (HEAD, uncommitted tracked changes, untracked files not ignored, and the checkout's own bytes where git would normalise them) under the git directory, applies the mutant there and runs both fences there. No mutant appears in the checkout, and the checkout's bytes, index and stash list are unchanged except the task file's Verification Log and Mutation Log. | `tests/adr-verify-isolation.test.mjs::a mutant run leaves the checkout unchanged but for the task file's logs` | @implemented | `node --test tests/adr-verify-isolation.test.mjs` |
| F-3 | Where no worktree can be built (no git repository, or git fails), `adr-verify --mutant` runs in place as today, and its first line says so and why. | `tests/adr-verify-isolation.test.mjs::outside git the mutant runs in place and says why` | @implemented | `node --test tests/adr-verify-isolation.test.mjs` |
| F-4 | A fence whose text names the checkout's absolute path runs in place, and the first line names the path it found. The path is matched as given and as resolved, with or without a trailing separator, at a path boundary (followed by a separator, a quote, whitespace or the end), and on Windows with either separator, in any case, and in Git Bash's `/c/` form. A path that only shares the checkout's prefix is not a match. An environment variable or a symlink that leads to the checkout is not detected, and the first line never claims it was. | `tests/adr-verify-isolation.test.mjs::a fence naming the checkout runs in place and names the path` | @implemented | `node --test tests/adr-verify-isolation.test.mjs` |
| F-5 | The clean fence and the mutant fence run in the same worktree, so nothing either writes reaches the checkout. Between the two fences, the mutated file and every `--also-restore` output are reset inside the worktree as they are in the checkout today, so a build-if-missing output cannot carry the clean run into the mutant's. | `tests/adr-verify-isolation.test.mjs::a fence's generated output stays in the worktree` | @implemented | `node --test tests/adr-verify-isolation.test.mjs` |
| F-11 | A generated output left by the clean fence is reset before the mutant fence, inside the worktree, so the mutant fence rebuilds it from the mutated source. | `tests/adr-verify-isolation.test.mjs::a generated output left by the clean fence is reset before the mutant fence` | @implemented | `node --test tests/adr-verify-isolation.test.mjs` |
| F-12 | A path that only shares the checkout's prefix does not force the run in place. | `tests/adr-verify-isolation.test.mjs::a sibling path sharing the checkout's prefix does not force the run in place` | @implemented | `node --test tests/adr-verify-isolation.test.mjs` |
| F-13 | `scripts/unasserted.mjs` never hands its runner's `NODE_TEST_CONTEXT` to the suites it runs, so started inside a test runner it still reads a suite's failure. | `tests/unasserted-isolation.test.mjs::an unasserted run started inside a test runner still reads its suite's failures` | @spec | `node --test tests/unasserted-isolation.test.mjs` |
| F-6 | An isolated and an in-place run of the same mutant record the same verdict, and each entry's sha is the checkout's HEAD, carrying `*` when the checkout is dirty. | `tests/adr-verify-isolation.test.mjs::an isolated and an in-place run record the same verdict` | @implemented | `node --test tests/adr-verify-isolation.test.mjs` |
| F-7 | `--in-place` applies the mutant in the checkout and restores it, as today. | `tests/adr-verify-isolation.test.mjs::--in-place applies the mutant in the checkout and restores it` | @implemented | `node --test tests/adr-verify-isolation.test.mjs` |
| F-8 | A run stopped by SIGINT or SIGTERM removes its worktree; the worktree of a killed run is removed by the next isolated run, of either tool, once no process of it lives. | `tests/adr-verify-isolation.test.mjs::a stopped mutant run removes its worktree` | @implemented | `node --test tests/adr-verify-isolation.test.mjs` |
| F-9 | `scripts/unasserted.mjs` neuters and runs its suites in a worktree by default, reports the same survivors as an in-place run, and leaves the checkout byte-identical; `--in-place` keeps today's behaviour. | `tests/unasserted-isolation.test.mjs::an unasserted run leaves the checkout byte-identical` | @spec | `node --test tests/unasserted-isolation.test.mjs` |
| F-10 | An `unasserted.mjs` run that cannot build its worktree exits 2, names `--in-place`, and neuters nothing. | `tests/unasserted-isolation.test.mjs::an unasserted run that cannot isolate neuters nothing and names --in-place` | @spec | `node --test tests/unasserted-isolation.test.mjs` |

## Domain

A **checkout** is the working tree peers read. A **worktree** is a throwaway copy of its content
under the git directory, owned by one run. A **mutant** is applied only inside a worktree unless the
run is in place. The **task file** is the one checkout file an isolated run writes.

## Contracts Touched

| Surface | Change | Consumers |
|---------|--------|-----------|
| `adr-verify --mutant` (shipped CLI) | isolated by default; new `--in-place`; a first line saying where it ran | task authors, `adr-execute`, every adopter's evidence |
| `scripts/unasserted.mjs` | isolated by default; new `--in-place` | this repository's maintainers |

## Non-Goals
- Submodules: a change inside a submodule is not carried into the worktree, as in ADR-075's.

- `adr-verify` without `--mutant` (the plain fence run) stays in place: it changes no source.
- `mutate.mjs --repoint --write` and `--narrow --write` stay in place: they edit this checkout's catalogue by design (ADR-075).
- Isolating the fence's network, databases or containers: a worktree isolates files only.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| A fence depends on an ignored file (a built artifact, a `.env`) that the worktree lacks, so its clean run fails | Med | Med | The clean fence fails before any mutant runs, and says so; `--in-place` is named |
| A fence reads the checkout through a path other than its literal absolute path (an environment variable, a symlink) | Low | High | F-6's paired runs over real records at ADR time; the first line always says where the run went |
| Shared mechanism drift between the Python gate and the JavaScript campaign | Med | Med | One implementation shipped in `plugin/`, decided in the ADR |
| `unasserted.mjs` passes this runner's `NODE_TEST_CONTEXT` to its suites, so started from inside a test runner its inner `node --test` exits 0 over failures (found while binding F-9, 2026-09-30) | High | High | the ADR strips it as `mutate.mjs`'s `childEnv` does; the F-9 test sets the environment a real run has |

## Open Questions

<!-- Empty: the grill closed with every checklist item mapped to a Fact. -->

## Verify

```bash
spec-verify --spec docs/specs/2026-09-30-a-mutant-never-touches-the-checkout.md
```

## Grill Log (appendix)

| # | Question | Fact | Decision |
|---|----------|------|----------|
| 1 | Isolate adr-verify --mutant by default? | F-2 | owner, 2026-09-30: isolated by default, --in-place keeps today |
| 2 | Could not isolate: refuse or run in place? | F-3 | run in place and say so |
| 3 | A fence naming the checkout by absolute path? | F-4 | detect it, run in place, name the path |
| 4 | Which fences run in the worktree? | F-5 | both, in one worktree |
| 5 | Codex's cold review of ADR-076 (2026-09-30): must restoration between fences survive isolation? | F-5, F-11 | yes: reset inside the worktree between the fences; only the final checkout restore goes |
| 6 | Same review: what counts as the fence naming the checkout? | F-4, F-12 | the spellings and boundary in F-4; a shared prefix is not a match |
