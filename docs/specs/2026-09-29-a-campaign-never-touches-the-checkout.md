# Spec: A mutation campaign never touches the checkout, and every result says how loaded the machine was

> **Date:** 2026-09-29 · **Status:** Ready-for-ADR
> **Owner:** Zy · **Becomes:** ADR (not yet written)
> **Gate:** Status may become Ready-for-ADR only after `spec-verify --spec <this file>` exits 0.
> **Cross-references:** docs/research/2026-09-26-model-out-of-the-loop.md (Stage 4, the interoception and homeostasis rows), docs/adr/ADR-069-a-stale-mutant-is-repointed-by-its-own-edit.md (`--root`), BACKLOG §272

## Problem

`scripts/mutate.mjs` rewrites real files in this checkout and restores them from a journal, so each mutant is live for every process running this checkout's code; on 2026-09-29 five peer shells had this checkout in their command line during a campaign, and a mutant once reached another session's hook (BACKLOG §272). It also refuses to run while a file it would rewrite has uncommitted changes. The gate ran at load 13 to 32 on 10 cores that day with nothing recording it; the costly-runs rule that such a result is unattributable exists only as prose.

What was observed on 2026-09-29, kept here as dated evidence rather than as Facts: none of it is behaviour a test in this repository may depend on (§8), and one line of it this change makes false by design. The catalogue mutates `plugin/` (about 1,570 entries) and `scripts/` (about 150), plus tests and config. The `~/.claude/bin` forwarders resolve the newest *installed* plugin, not this checkout: six peers ran an installed 3.1.4 that day. Exposure means sessions whose working directory is this checkout, and processes invoking its scripts by path: five live peer shells. qh-check's record carries no load and no concurrency field (F-10 replaces this). The costly-runs thresholds exist only as prose, in a skill outside this repository. And one of this repository's own tests, `tests/gate-rules.test.mjs::the mutation runner refuses to run over an editor, or beside another runner`, runs a real campaign over this checkout in its dead-owner arm: the exposure this spec is about, inside the gate.

## Goal

A campaign changes zero bytes of the checkout, adds under 2 s for its worktree (0.2-0.7 s measured), and every `qh-check` and campaign result carries the load it ran under.

## Actors

| Actor | Kind | Goal |
|-------|------|------|
| Maintainer session | human role | run a campaign or the gate and trust its verdict |
| Peer session | system | keep running this checkout's code without meeting a mutant |
| CI campaign | scheduled job | unchanged: runs in its own runner, and says `--in-place` |

## Use Cases

### UC-1: Maintainer runs a campaign in isolation

- **Trigger:** `node scripts/mutate.mjs [--case …]` · **Preconditions:** a git repository with a commit at `HEAD`
- **Main flow:**
  1. The parent resolves the selection, then creates a worktree holding the checkout's working-tree content — `HEAD`, its uncommitted tracked changes, and its untracked files that are not ignored — in the repository's git directory, never under the OS temp root.
  2. The checkout's verdict cache is read into it.
  3. The campaign runs there over exactly the parent's selection, and the run's cache is written back to the checkout's.
  4. The worktree is removed once the campaign's process group has ended.
- **Failure paths:** a. at step 1, the worktree cannot be created → exit 2, names `--in-place`, writes nothing. b. the parent is killed → the next run removes the worktree once no process of the campaign lives, and says so; until then a second campaign on the root waits (refused, exit 2). c. at step 3, the write-back fails → the checkout's cache is unchanged, and it is said.
- **Postconditions:** the checkout is byte-identical; verdicts equal an in-place run's at the same commit.

### UC-2: Maintainer runs the gate on a loaded machine

- **Trigger:** `qh-check` · **Preconditions:** the project declares a check
- **Main flow:**
  1. Load and core count are sampled at the start and at the end of the check or campaign.
  2. The record and the printed result always carry both samples, and `contended` — an endpoint observation, said as one.
- **Failure paths:** a. load above the core count → `contended: true`, said as unattributable, exit unchanged. b. no load average on this platform → `contended: null`, said as could-not-read.
- **Postconditions:** every record says the load it ran under, or that it could not be read.

### UC-3: Maintainer runs a campaign in place

- **Trigger:** `node scripts/mutate.mjs --in-place` · **Preconditions:** today's lock and uncommitted-file rules hold
- **Main flow:**
  1. The processes running this checkout's code are listed.
  2. The campaign runs as it does today.
- **Failure paths:** a. other processes run this checkout's code → they are named, as advice, and the run continues. b. the process list cannot be read → said as could-not-look.
- **Postconditions:** nothing is refused for exposure; the exposure is said.

## Scenarios

### UC1-S1 [happy] A campaign leaves the checkout byte-identical [@implemented] → `tests/mutate-isolation.test.mjs::a campaign leaves the working tree byte-identical and its mutants never appear there`

```gherkin
Given a checkout at a commit, with an uncommitted edit to an unrelated file
When a campaign runs over two catalogue entries
Then every tracked and untracked file in the checkout has the bytes it had before
```

### UC1-S2 [failure] A campaign that cannot isolate stops [@implemented] → `tests/mutate-isolation.test.mjs::a campaign that cannot isolate stops and names --in-place, writing nothing`

```gherkin
Given a repository whose HEAD is unborn
When a campaign starts
Then it exits 2 with "could not isolate", names --in-place, and writes nothing
```

### UC1-S3 [failure] A killed campaign's worktree is removed by the next run [@implemented] → `tests/mutate-isolation.test.mjs::a killed campaign's worktree is removed by the next run, and said`

```gherkin
Given a campaign killed with SIGKILL, leaving its worktree
When the next campaign starts
Then the old worktree is removed and pruned, and stderr says so
```

### UC1-S4 [happy] An isolated run reuses the checkout's cache [@implemented] → `tests/mutate-isolation.test.mjs::an isolated campaign reuses and returns the checkout's verdict cache`

```gherkin
Given a checkout whose verdict cache holds a verdict for an entry
When an isolated campaign runs that entry, then a second one
Then the second reuses it, and the checkout's cache holds the new verdicts
```

### UC1-S5 [happy] Isolated and in-place runs agree [@implemented] → `tests/mutate-isolation.test.mjs::an isolated run and an in-place run of the same entries give the same verdicts`

```gherkin
Given one commit and a fixed set of catalogue entries
When they run isolated and then in place
Then every entry has the same verdict both times
```

### UC1-S6 [happy] An uncommitted test edit is graded as an in-place run grades it [@implemented] → `tests/mutate-isolation.test.mjs::an uncommitted test edit and an untracked test are graded as an in-place run grades them`

```gherkin
Given a committed test that does not kill a mutant, and an uncommitted edit to it that does
When a campaign runs isolated and then in place
Then both grade the mutant RED, and an untracked test named by an uncommitted catalogue entry is run by both
```

### UC1-S7 [failure] A second campaign waits while the first one's child still runs [@implemented] → `tests/mutate-isolation.test.mjs::a second campaign waits while an orphaned child of the first still runs`

```gherkin
Given a campaign whose parent was killed while its child still runs
When a second campaign starts on the same root
Then it exits 2 as another run in flight, and once the child has ended the next run removes the worktree
```

### UC1-S8 [happy] The child runs exactly the parent's selection [@implemented] → `tests/mutate-isolation.test.mjs::an isolated campaign runs exactly the entries an in-place one selects`

```gherkin
Given uncommitted changes and a verdict cache with timings
When `--changed HEAD` and `--shard 1/2 --no-cache` run isolated and in place
Then each pair names the same entries
```

### UC2-S1 [happy] A quiet check is recorded as not contended [@implemented] → `tests/qh-check.test.mjs::a check run below the core count is recorded as not contended`

```gherkin
Given a load below the core count
When qh-check runs a passing check
Then the record carries the load, the cores and contended false
```

### UC2-S2 [failure] A loaded check is said as unattributable [@implemented] → `tests/qh-check.test.mjs::a check run above the core count is recorded as contended and said, and its exit is unchanged`

```gherkin
Given a load above the core count
When qh-check runs a passing check
Then it exits 0, records contended true, and prints "unattributable: load N on M cores"
```

### UC2-S3 [failure] No load average is said, never read as quiet [@implemented] → `tests/qh-check.test.mjs::a check with no load average records contended null and says the load could not be read`

```gherkin
Given a platform whose load average reads 0 0 0
When qh-check runs
Then contended is null and the line says the load could not be read
```

### UC2-S4 [failure] A load that crosses the core count between samples is contended [@implemented] → `tests/qh-check.test.mjs::a check whose load crosses the core count between its samples is contended, and one at the count is not`

```gherkin
Given a load below the core count at the start and above it at the end
When qh-check runs a passing check
Then it records contended true with both samples, and a load exactly at the core count is not contended
```

### UC3-S1 [happy] An in-place campaign with no one exposed says nothing more [@spec] → `tests/mutate-isolation.test.mjs::an in-place campaign names the processes running this checkout, and says when it could not look`

```gherkin
Given no other process names this checkout's path
When an in-place campaign runs
Then it prints no exposure line
```

### UC3-S2 [failure] Exposed processes are named [@spec] → `tests/mutate-isolation.test.mjs::an in-place campaign names the processes running this checkout, and says when it could not look`

```gherkin
Given two other processes whose command lines name this checkout's path
When an in-place campaign runs
Then it names both, says an in-place mutant is live for them, and runs
```

### UC3-S3 [failure] An unreadable process list is said [@spec] → `tests/mutate-isolation.test.mjs::an in-place campaign names the processes running this checkout, and says when it could not look`

```gherkin
Given the process list cannot be read
When an in-place campaign runs
Then it says it could not look, and runs
```

## Facts

| ID | Assertion (invariant / behavior) | Test (`path::name`) | Tag | Cmd (optional) |
|----|----------------------------------|---------------------|-----|----------------|
| F-1 | `mutate.mjs --root <dir>` confines catalogue, lock, journal and verdict cache to `<dir>`. | `tests/mutate-runner.test.mjs::campaignPaths keeps every campaign file inside the root it is given` | @implemented | |
| F-2 | An `--in-place` campaign refuses entries whose files have uncommitted changes; one campaign runs per root, in either mode. | `tests/gate-rules.test.mjs::the mutation runner refuses to run over an editor, or beside another runner` | @implemented | |
| F-8 | A campaign runs by default in a throwaway worktree holding the checkout's working-tree content (`HEAD`, its uncommitted tracked changes, and its untracked files that are not ignored), so it grades exactly what an in-place run would; every tracked and untracked file of the checkout keeps its bytes except the verdict cache the run writes back (F-12), no mutant appears in it, and its index and stash list are unchanged; `--in-place` keeps today's behaviour. | `tests/mutate-isolation.test.mjs::a campaign leaves the working tree byte-identical and its mutants never appear there` | @implemented | |
| F-9 | The worktree lives in the repository's git directory (`<git-common-dir>/qh-campaigns/`), never under the OS temp root, so a test that tells scratch from project by the temp root grades alike in both modes. A campaign owns it from before it exists until the campaign's process group has ended: a SIGINT or SIGTERM to the parent ends the group and removes it; the next run removes one only when its owner record names no live process and, on POSIX, no live process group, and says so. On Windows the next run's sweep is the only cleanup. | `tests/mutate-isolation.test.mjs::a killed campaign's worktree is removed by the next run, and said` | @implemented | |
| F-10 | qh-check and a campaign sample the 1-minute load and the core count at start and at end, and always report both samples (a campaign on every run, an interrupted one included); `contended` is true when either sample exceeds the core count, false when both are at or below it, null when either could not be read; the result calls it an endpoint observation, says "unattributable" when true, and never changes an exit or a verdict. | `tests/qh-check.test.mjs::a check run above the core count is recorded as contended and said, and its exit is unchanged` | @implemented | |
| F-11 | Before an `--in-place` campaign, mutate names the other processes whose command line names this checkout, as advice, and runs; where it cannot list processes it says so. | `tests/mutate-isolation.test.mjs::an in-place campaign names the processes running this checkout, and says when it could not look` | @spec | |
| F-12 | An isolated campaign starts from the checkout's verdict cache and writes the run's cache back in its own shape, one CI's merge job reads; a write-back that fails leaves the cache as it was and says so. | `tests/mutate-isolation.test.mjs::an isolated campaign reuses and returns the checkout's verdict cache` | @implemented | |
| F-13 | A campaign that cannot create its worktree exits 2 with "could not isolate", names `--in-place`, and writes nothing; it never falls back silently. | `tests/mutate-isolation.test.mjs::a campaign that cannot isolate stops and names --in-place, writing nothing` | @implemented | |
| F-14 | At one commit, isolated and in-place runs of the same entries give the same verdict for each. | `tests/mutate-isolation.test.mjs::an isolated run and an in-place run of the same entries give the same verdicts` | @implemented | |
| F-15 | An isolated campaign runs exactly the entries the parent selected — the same entry identities an in-place run selects from the same arguments over the same content, `--changed <ref>` over uncommitted changes and `--shard i/n` with `--no-cache` included. | `tests/mutate-isolation.test.mjs::an isolated campaign runs exactly the entries an in-place one selects` | @implemented | |
| F-16 | While any process of a campaign lives, no second campaign runs on its root: the root's lock names the parent and the child's process group, and it is live while either is. | `tests/mutate-isolation.test.mjs::a second campaign waits while an orphaned child of the first still runs` | @implemented | |

## Domain

A **campaign** runs catalogue **entries** (mutants) against a **root**. An **isolated** campaign's root is a throwaway **worktree** holding the checkout's working-tree content; an **in-place** campaign's root is the checkout. A **result** (a `qh-check` record or a campaign's verdicts) is **contended** when its load at the start or at the end exceeded the core count; that is an endpoint observation, not a claim about every moment in between.

## Contracts Touched

| Surface | Change | Consumers |
|---------|--------|-----------|
| `scripts/mutate.mjs` CLI | add `--in-place`; isolation becomes the default | maintainers, CLAUDE.md §2, the costly-runs skill |
| `scripts/mutate.mjs` internal `--selected <file>` | the parent's resolved selection, accepted only from the isolated child | the isolated child |
| `mutate`'s root lock | names the parent and the child's process group | a second campaign on the root |
| `checks.jsonl` record | add load samples, core count, `contended` | the completion and commit advisories that read it |
| `qh-check` output | an "unattributable" line when contended | maintainers |

## Non-Goals

- The CI campaign: it already runs in its own runner, where nobody else loads its checkout, so it passes `--in-place` and pays no worktree.
- Refusing or delaying a run for load: advice only (CLAUDE.md §3); a scheduler or job lease is Stage 7.
- A gate cache: that is its own spec.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| A test leans on an ignored file, so an isolated run differs | Low | High | F-14's fixture parity, and ADR-075's paired uncached run over the real catalogue |
| A test tells scratch from project by the temp root (`plugin/scripts/lifecycle.mjs:347`), so a worktree under it grades differently | High if the worktree were there | High | F-9 puts it in the git directory |
| A worktree left on disk by a killed run | Low | Low | F-9, F-16 |
| Load average means something else on a platform | Low | Medium | F-10's could-not-read arm |

## Open Questions

<!-- Empty: the grill closed with every checklist item mapped to a Fact. -->

## Verify

```bash
python3 plugin/bin/spec-verify --spec docs/specs/2026-09-29-a-campaign-never-touches-the-checkout.md
```

## Grill Log (appendix)

| # | Question | Fact | Decision |
|---|----------|------|----------|
| 1 | Isolation by default, `--in-place` to opt out | F-8 | accepted |
| 2 | Where the worktree lives and how it is cleaned up | F-9 | accepted |
| 3 | What load is recorded, and how a loaded result is said | F-10 | accepted |
| 4 | Naming exposed processes before an in-place run | F-11 | accepted |
| 5 | The verdict cache under isolation | F-12 | accepted |
| 6 | What happens when isolation fails | F-13 | accepted |
| 7 | The success criterion | F-14 | accepted |
| 8 | What the isolated worktree holds (re-opened by ADR-075's cold review: a worktree of `HEAD` re-grades a committed test after an uncommitted edit to it) | F-8, F-2 | working-tree content; the uncommitted-file refusal becomes in-place only (owner, 2026-09-30) |
| 9 | Codex's review of the plan (gpt-6-astra, xhigh, 2026-09-30): the child re-selected entries, a temp-root worktree grades some lifecycle tests differently, crash ownership contradicted itself, and two endpoint samples were read as the whole run | F-8, F-9, F-10, F-15, F-16 | amended as recorded in each fact (the owner, 2026-09-30: "implement codex fixes to the plan") |
