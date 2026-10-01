# Spec: qh-check reads its own ledger

> **Date:** 2026-10-01 · **Status:** Ready-for-ADR
> **Owner:** Zy · **Becomes:** ADR-081 (`docs/adr/ADR-081-qh-check-reads-its-own-ledger.md`)
> **Gate:** Status may become Ready-for-ADR only after `spec-verify --spec <this file>` exits 0.
> **Cross-references:** ADR-060 (check records), ADR-061 (the publish refusal), ADR-066 (git's own hook), ADR-080; CLAUDE.md §3, §16, §19; BACKLOG §331

## Problem

Measured 2026-10-01 from two Go adopters' own `checks.jsonl`:

- **One adopter re-ran its full check on a tree that had already passed 53 times in 280 runs.** That cost 2,305 s,
  22% of all its check time, mostly in bursts a minute apart. The other adopter did so 0 times in 117.
- **Every commit waits for the full check.** The median run took 28.7 s at one adopter and 267.9 s at the
  other; p90 was 78.1 s and 334.6 s.
- **The ledger already holds the answer.** Each record carries `before` and `after` with
  `{ tree, index, head, at }` (`plugin/scripts/qh-check.mjs:212`).

## Goal

`qh-check` does not re-run a check whose latest run on the current tree passed. It says when that pass happened
and how long it took. A project may declare a fast check. A fast pass lets a command that only commits through,
with a warning. Anything that pushes still needs the full check.

## Actors

| Actor | Kind | Goal |
|-------|------|------|
| Session about to commit or push | human role | the check it needs, and no check it already has |
| Project owner | human role | declare what a commit needs and what a push needs |

## Use Cases

### UC-1: A tree whose latest check passed is not checked again

- **Trigger:** `qh-check` · **Preconditions:** the latest record in `checks.jsonl` for the same command on the tree as it is now is a full pass
- **Main flow:**
  1. `qh-check` observes the tree and reads its ledger, before it takes the machine lease.
  2. It says when that pass happened and how long it took, and exits 0 without running or recording.
- **Failure paths:**
  - a. `--again` → it runs.
  - b. Anything it could not establish → it runs: the ledger could not be read whole, the tree could not be observed, the directory is outside git, the latest record failed, timed out or was unproven, or the session holds a write git cannot see that no pass has cleared.
- **Postconditions:** the ledger is unchanged when nothing ran.

### UC-2: A fast check lets a commit through, and not a push

- **Trigger:** `qh-check --fast`, then a publish · **Preconditions:** `.quality-harness.json` declares `fastCheck`
- **Main flow:**
  1. `qh-check --fast` runs the fast check. It records the result in `fast-checks.jsonl`, a file no reader of `checks.jsonl` opens.
  2. The tree has no full pass, and its latest fast record passed. A command that only commits is not refused; it is told the full check has not passed.
  3. Git's own commit hook says the same.
- **Failure paths:**
  - a. A push, or a command that also pushes, or a form not proven to be a commit alone → refused, as today.
  - b. The latest fast record failed or was unproven → refused, as today.
  - c. `--fast` with no `fastCheck` declared → said, nothing runs, exit 2.
- **Postconditions:** a fast pass counts nowhere else, before or after a rollback.

## Scenarios

### UC1-S1 [happy] A passed tree is not checked again [@spec] → `tests/qh-check-reads-the-ledger.test.mjs::a tree whose latest check passed is not checked again, and says when and how long` cmd:`node --test tests/qh-check-reads-the-ledger.test.mjs`

```gherkin
Given a check that passed on the tree as it is now
When qh-check runs again
Then the check does not run, qh-check names the pass's time and duration, exits 0, and records nothing
```

### UC1-S2 [failure] --again runs it [@spec] → `tests/qh-check-reads-the-ledger.test.mjs::--again runs a tree that already passed` cmd:`node --test tests/qh-check-reads-the-ledger.test.mjs`

```gherkin
Given a check that passed on the tree as it is now
When qh-check --again runs
Then the check runs
```

### UC1-S3 [failure] Anything it could not establish runs the check [@spec] → `tests/qh-check-reads-the-ledger.test.mjs::a changed tree, a torn ledger or a failed run checks again` cmd:`node --test tests/qh-check-reads-the-ledger.test.mjs`

```gherkin
Given a changed tree, then a torn ledger line, then a check that failed on the tree
When qh-check runs after each
Then the check runs each time
```

### UC1-S4 [failure] A later failure on the same tree is not skipped [@spec] → `tests/qh-check-reads-the-ledger.test.mjs::a pass followed by a failure on the same tree checks again` cmd:`node --test tests/qh-check-reads-the-ledger.test.mjs`

```gherkin
Given a pass and then a failure of the same check on the same tree
When qh-check runs
Then the check runs
```

### UC1-S5 [failure] A write git cannot see is not skipped [@spec] → `tests/qh-check-reads-the-ledger.test.mjs::a write git cannot see, after the pass, checks again` cmd:`node --test tests/qh-check-reads-the-ledger.test.mjs`

```gherkin
Given a pass, and then a write the session recorded that git cannot see
When qh-check runs in that session
Then the check runs
```

### UC1-S6 [happy] A skip waits for no lease [@spec] → `tests/qh-check-reads-the-ledger.test.mjs::a skip waits for no lease` cmd:`node --test tests/qh-check-reads-the-ledger.test.mjs`

```gherkin
Given a passed tree and another run holding the machine lease
When qh-check --wait runs
Then it skips at once, without waiting its turn
```

### UC1-S7 [happy] A run says how long it took [@spec] → `tests/qh-check-reads-the-ledger.test.mjs::every run says how long it took` cmd:`node --test tests/qh-check-reads-the-ledger.test.mjs`

```gherkin
Given any check that runs
When it ends
Then the result line names its duration
```

### UC2-S1 [happy] A fast pass is recorded apart [@spec] → `tests/qh-check-reads-the-ledger.test.mjs::a fast check is recorded apart, where no full-check reader looks` cmd:`node --test tests/qh-check-reads-the-ledger.test.mjs`

```gherkin
Given a declared fastCheck
When qh-check --fast passes
Then fast-checks.jsonl holds its record and checks.jsonl holds none
```

### UC2-S2 [happy] A commit after a fast pass is told, not refused [@spec] → `tests/qh-check-reads-the-ledger.test.mjs::a commit-only command on a fast-passed tree is told, not refused` cmd:`node --test tests/qh-check-reads-the-ledger.test.mjs`

```gherkin
Given a changed tree whose latest fast check passed
When a command that only commits is attempted
Then it is not refused, and is told the full check has not passed
```

### UC2-S3 [failure] A commit with no fast pass is still refused [@spec] → `tests/qh-check-reads-the-ledger.test.mjs::a commit with no fast pass, or a failed one, is still refused` cmd:`node --test tests/qh-check-reads-the-ledger.test.mjs`

```gherkin
Given a changed tree with no fast pass, then one whose latest fast check failed
When a command that only commits is attempted
Then it is refused both times
```

### UC2-S4 [failure] Anything that pushes is refused [@spec] → `tests/qh-check-reads-the-ledger.test.mjs::a push, or a commit that also pushes, is refused on a fast-passed tree` cmd:`node --test tests/qh-check-reads-the-ledger.test.mjs`

```gherkin
Given a tree whose latest fast check passed
When git push, then git commit -m x && git push, is attempted
Then both are refused
```

### UC2-S5 [happy] Git's own hooks agree [@spec] → `tests/qh-check-reads-the-ledger.test.mjs::git's own hooks let a commit through with the warning and refuse a push` cmd:`node --test tests/qh-check-reads-the-ledger.test.mjs`

```gherkin
Given a session whose git hook has run, and a tree whose latest fast check passed
When git's prepare-commit-msg and pre-push hooks decide
Then the commit passes with the warning, and the push is refused
```

### UC2-S6 [failure] The warning is said after an earlier refusal [@spec] → `tests/qh-check-reads-the-ledger.test.mjs::a commit refused before a fast pass is told after it` cmd:`node --test tests/qh-check-reads-the-ledger.test.mjs`

```gherkin
Given a commit refused on an unchecked tree
When qh-check --fast passes and the same commit is attempted again
Then it is told the full check has not passed, not silenced as already said
```

### UC2-S7 [failure] --fast without a declared fast check [@spec] → `tests/qh-check-reads-the-ledger.test.mjs::--fast with no fastCheck declared is said, and runs nothing` cmd:`node --test tests/qh-check-reads-the-ledger.test.mjs`

```gherkin
Given no fastCheck in .quality-harness.json
When qh-check --fast runs
Then it says so, runs nothing and exits 2
```

## Facts

| ID | Assertion (invariant / behavior) | Test (`path::name`) | Tag | Cmd (optional) |
|----|----------------------------------|---------------------|-----|----------------|
| F-1 | When the latest record in `checks.jsonl`, by ledger position, for the same command on the tree now grades `check.passed`, `qh-check` runs nothing, writes no record, names that pass's time and duration, and exits 0. | `tests/qh-check-reads-the-ledger.test.mjs::a tree whose latest check passed is not checked again, and says when and how long` | @spec | `node --test tests/qh-check-reads-the-ledger.test.mjs` |
| F-2 | `qh-check --again` runs the check whatever the ledger holds. | `tests/qh-check-reads-the-ledger.test.mjs::--again runs a tree that already passed` | @spec | `node --test tests/qh-check-reads-the-ledger.test.mjs` |
| F-3 | Every case it could not establish runs the check: a ledger not read whole, a tree not observed, a directory outside git, and a latest record that failed, timed out or was unproven. | `tests/qh-check-reads-the-ledger.test.mjs::a changed tree, a torn ledger or a failed run checks again` | @spec | `node --test tests/qh-check-reads-the-ledger.test.mjs` |
| F-4 | A pass followed, on the same tree, by a failure of the same check does not skip: only the latest record counts. | `tests/qh-check-reads-the-ledger.test.mjs::a pass followed by a failure on the same tree checks again` | @spec | `node --test tests/qh-check-reads-the-ledger.test.mjs` |
| F-5 | When the session (`CLAUDE_CODE_SESSION_ID`) holds a write git cannot see that no pass has cleared, `qh-check` runs: a tree hash cannot speak for it. | `tests/qh-check-reads-the-ledger.test.mjs::a write git cannot see, after the pass, checks again` | @spec | `node --test tests/qh-check-reads-the-ledger.test.mjs` |
| F-6 | The skip is decided before the machine lease is taken, so a skip never waits; a run that misses observes the tree again after its wait. | `tests/qh-check-reads-the-ledger.test.mjs::a skip waits for no lease` | @spec | `node --test tests/qh-check-reads-the-ledger.test.mjs` |
| F-7 | Every run's result line names how long the check took. | `tests/qh-check-reads-the-ledger.test.mjs::every run says how long it took` | @spec | `node --test tests/qh-check-reads-the-ledger.test.mjs` |
| F-8 | `qh-check --fast` runs the declared `fastCheck` and records it in `fast-checks.jsonl`, never in `checks.jsonl`, so no reader of a full pass sees it, in this version or an older one after a rollback. | `tests/qh-check-reads-the-ledger.test.mjs::a fast check is recorded apart, where no full-check reader looks` | @spec | `node --test tests/qh-check-reads-the-ledger.test.mjs` |
| F-9 | A command proven to be one commit and nothing else, on a tree with no full pass whose latest fast record passed, is not refused; it is told the full check has not passed and a push will need it. | `tests/qh-check-reads-the-ledger.test.mjs::a commit-only command on a fast-passed tree is told, not refused` | @spec | `node --test tests/qh-check-reads-the-ledger.test.mjs` |
| F-10 | A commit on a tree with no fast pass, or whose latest fast record failed, is refused as today. | `tests/qh-check-reads-the-ledger.test.mjs::a commit with no fast pass, or a failed one, is still refused` | @spec | `node --test tests/qh-check-reads-the-ledger.test.mjs` |
| F-11 | A push, a command that also pushes, and any form not proven to be one commit alone are refused as today on a fast-passed tree. | `tests/qh-check-reads-the-ledger.test.mjs::a push, or a commit that also pushes, is refused on a fast-passed tree` | @spec | `node --test tests/qh-check-reads-the-ledger.test.mjs` |
| F-12 | Git's own `prepare-commit-msg` hook lets a commit through on a fast-passed tree and prints the warning; `pre-push` refuses. | `tests/qh-check-reads-the-ledger.test.mjs::git's own hooks let a commit through with the warning and refuse a push` | @spec | `node --test tests/qh-check-reads-the-ledger.test.mjs` |
| F-13 | The publish advisory's key carries the fast state, so a commit refused before a fast pass is told the new state after it. | `tests/qh-check-reads-the-ledger.test.mjs::a commit refused before a fast pass is told after it` | @spec | `node --test tests/qh-check-reads-the-ledger.test.mjs` |
| F-14 | `qh-check --fast` with no `fastCheck` declared says so, runs nothing and exits 2. | `tests/qh-check-reads-the-ledger.test.mjs::--fast with no fastCheck declared is said, and runs nothing` | @spec | `node --test tests/qh-check-reads-the-ledger.test.mjs` |

## Domain

A **full pass** is a `checks.jsonl` record that `checkEventName` grades `check.passed`. A **fast pass** is a
`fast-checks.jsonl` record graded the same way. **The tree** is `observe()`'s working-tree hash. It covers
tracked and untracked files, and not ignored files, the environment or services. So a skip says the tree passed,
not that a run now would. **A commit-only command** is one simple command whose program is git and whose
subcommand is commit, with no other command beside it.

## Contracts Touched

| Surface | Change | Consumers |
|---------|--------|-----------|
| `qh-check` | skips a passed tree; `--again`; `--fast`; duration in the result line | every adopter session |
| `.quality-harness.json` | new optional `fastCheck` | projects that declare one |
| `.git/quality-harness/fast-checks.jsonl` | new | the publish refusal |
| The publish refusal (ADR-061, ADR-066) | a commit-only command on a fast-passed tree is advised, not refused | every adopter session |

## Non-Goals

- Reusing a pass across a change outside declared inputs (`checkInputs`). Deferred until it can be measured, because
  an edit made through Bash or mrw logs no `file.written` (owner, 2026-10-01).
- Changing what a full pass is, or how a refusal on an unchecked tree reads.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| A flaky or environment-dependent check that passed once is not re-run on that tree | Med | Low | `--again`; the skip names the earlier pass and says a tree hash does not cover ignored files or the environment |
| A fast check that tests too little lets a commit through | Med | Med | The project declares it; a push still needs the full check; the commit is told so |
| A fast pass read as a full one | Low | High | F-8: a separate file no reader of `checks.jsonl` opens, before or after a rollback |

## Open Questions

## Verify

```bash
spec-verify --spec docs/specs/2026-10-01-qh-check-reads-its-own-ledger.md
```

## Grill Log (appendix)

| # | Question | Fact | Decision |
|---|----------|------|----------|
| 1 | What does qh-check do on a tree that already passed? | F-1 | Say it, and skip unless --again (owner, 2026-10-01) |
| 2 | Record duration and a fast check? | F-8 | Record duration plus a fast check (owner, 2026-10-01) |
| 3 | Reuse across a change? | non-behavioral | Only if the project declares it, then deferred until it can be measured (owner, 2026-10-01) |
| 4 | Does a fast pass satisfy a push? | F-11 | No: commit only (owner's option, 2026-10-01) |
| 5 | Where is a fast record kept? | F-8 | Scouted from the Codex review of 2026-10-01: in its own file, because an older checkEventName grades any exit-0 stable record in checks.jsonl as a full pass |
| 6 | Which commits may a fast pass let through? | F-11 | Scouted from the same review: only a command proven to be one commit; publishCommandIn names the first invocation, so a commit followed by a push would ride it |
