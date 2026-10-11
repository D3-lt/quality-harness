# ADR-095: A hook does not repeat work whose inputs have not changed

**Status:** Accepted
**Date:** 2026-10-11
**Owner:** Zy
**Spec:** None — no spec stage; the owner set the goal on 2026-10-11 ("work in the component improvements, resource and performance, smart aware of environment") once the two largest files were split into parts that can be measured one by one, and asked that the plan be a governing record with a tracked handoff, not prose
**Cross-references:** docs/adr/ADR-094-a-standing-fact-is-said-once-and-prose-reuses-the-pass.md, docs/adr/ADR-081-qh-check-reads-its-own-ledger.md, docs/adr/ADR-077-a-heavy-run-holds-a-lease-and-names-its-neighbours.md, docs/adr/ADR-040-sessionstart-ready-uses-the-listing.md, docs/BACKLOG.md
**Governs:** None — declared by its tasks
**Enforced-by:** None — declared by its tasks. Each task adds campaign mutations per `Rests-on` name; naming them before they exist would be a pointer to nothing.
**Invalidates:** none — checked. ADR-040 and ADR-094 decide what SessionStart says; this record changes how the lines are obtained and leaves their text byte-identical, which T2 asserts.
**Served-path change:** SessionStart's "ADR tasks in flight" lines come from an answer cached by the content of what produced them, so a second start in an unchanged corpus starts no `adr-next`; the Stop hook asks git for the repository's identity once, not four times; no hook says anything different.

## Context

- **Measured 2026-10-11 on an idle-ish machine (load 4 to 6 on 10 cores), alternating runs, hermetic home, against a fresh `git clone --no-local` of this repository (about 100 records), the real `lifecycle.mjs` fed one event on stdin, with a preload that counts every child process and file read.** The method is in T1; the figures are the baseline T2 and T3 are measured against.
- **SessionStart costs 1.2 to 1.4 s, and 1.0 to 1.4 s of it is six serial `adr-next` runs** (one per recently changed task directory, 118 ms to 1,104 ms each, 6 of 17 children, the other 11 being `git`). The second start in the same session repeats all six with the same inputs: 10 children, 1,154 ms inside them. A start, a resume and a compaction each pay it. In a repository with no corpus the same event costs 85 ms.
- **`adr-next` is a function of files.** Its only subprocess is `git ls-files` in the task directory (`plugin/bin/adr-next:492`); the verdict on a task is read from its file, its Verification Log and the owning record. Nothing in it reads the clock to decide a task's state (a sign-off is compared with rows dated in the log, not with today).
- **Stop starts 13 `git` children (149 to 258 ms; 106 ms on the second event), four of them the same `rev-parse --show-toplevel`** and two `write-tree` calls around one `add -A` into a temporary index. The identity questions (`--show-toplevel`, `--git-path index`, `--git-path objects`) cannot change inside one hook process; the tree questions can, and are not in question here.
- **PreToolUse is 29 to 37 ms with no child** (30 file reads of module sources, 584 KiB). Node's compile cache was tried and gives nothing at this size (0.08 to 0.09 s with and without). The first PreToolUse Edit of a governed path costs 347 ms (300 reads, 4.5 MiB: the decision corpus read once for `decisionContext`); the second costs 79 ms.
- **`qh-check` itself is not the cost.** With a check that exits at once it runs in about 105 ms wall with two `git` children; what it costs is the project's check. This repository's own check (`scripts/selftest.sh`) is 260 to 330 s, and it ran about a dozen times in the session that wrote this record, each time over a tree whose test inputs were mostly unchanged. Whether a test's verdict can be reused on unchanged inputs is T4's question, because a reused pass that is wrong is the failure this project exists to prevent.
- **The class: a result computed again from inputs that cannot have changed since it was last computed.** Enumerated by the preload in T1 (children with identical argument lists inside one process; children whose answer a content digest of their inputs would give). Members found: the six `adr-next` runs per start (T2), the four `rev-parse --show-toplevel` per Stop (T3). Members looked at and left: the two `write-tree` calls (the tree can change between them; they are the observation, not a repeat) and `git status`/`diff` (the tree questions).
- **Environment.** A cache needs somewhere to live and a way to say it cannot: a read-only home, a CI runner discarded after the job, a state directory on a network drive. The rule in CLAUDE.md §16 governs: "could not use the cache" is a run, never a hit.

## Existing Primitives Audit

- **`readyTaskLines`, `surfaceReadyLines`, `spawnGate`, `gateSaid`** (`plugin/scripts/ready-lines.mjs`): reused; the cache sits between `readyTaskLines` and `spawnGate`, so what is cached is exactly `adr-next`'s stdout for a directory and the text built from it is unchanged.
- **`stateDir`, `saidMarkerDirectory`, `sweepStaleMarkers`** (`event-log.mjs`, `housekeeping.mjs`): reused. The cache is one more directory under the state directory with the same daily sweep; a new store with its own sweep is not created (CLAUDE.md §5).
- **`gitRepositoryRoot`, `gitRepositoryLookup`** (`tree-facts.mjs`): the identity calls T3 memoises; `lazily.mjs::once` is the memo.
- **`scripts/effect-classes.mjs`:** holds the key function of T2 to "reads nothing but what it is handed".
- **`lease.mjs`, `load.mjs`** (`sampleLoad`, `contention`): reused by T4 for the load a gate finds.

## Decision

**1. A tool counts what a hook does (T1).** `scripts/hook-cost.mjs <event> <repository>` runs one event through the real program in a hermetic home and prints the children it started (argument list, count, time inside), the repeats among them (same program, same arguments, same directory) and the file reads. It reads, writes nothing in the repository, and exits 0; it is how every later claim in this record is measured, before and after.

**2. The ready-task lines come from a cache keyed by the content that produced them (T2).** For each task directory the hook is about to hand to `adr-next`, a key is the SHA-256 of: the bytes of `adr-next` and of `plugin/lib/record.py`, the object format git reports, the names and bytes of every file in the directory, and the bytes of the owning record. A stored answer for that key is `adr-next`'s stdout and exit code from the run that wrote it; a hit returns it, a miss runs `adr-next` and stores. Anything that cannot be read, hashed or stored is a miss and says so once; the cache is never asked to prove absence. The text the hook builds from an answer is byte-identical to today's.

**3. A hook process asks git for the repository's identity once (T3).** `rev-parse --show-toplevel`, `--git-path <name>` and `--show-object-format` are memoised by (argument list, directory) for the life of one process; no question about the tree (`status`, `diff`, `write-tree`, `add`, `ls-files`) is memoised.

**4. A gate sizes itself to the machine it finds, or says it did not (T4).** The repository's own gate chooses its test concurrency from the cores and the load it samples, within bounds, and says what it chose; T4 first measures wall time against concurrency on this machine at two loads and ships the rule only if it beats the default by the margin it states.

**5. A hook process reads the working tree's status once (T5, added 2026-10-11 after three outside runs).** `statusPaths` is asked three times in one turn-end event (the late-baseline check, the completion rules, the artifact rule): 125 to 400 ms on three corpora, the largest repeat left after T3. The answer is reused for at most two seconds within one process, per repository, only when git answered, and only when the hook's entry point switched the memo on; a test run, another process or a later event asks again. The turn has already ended when the hook runs and the advice it feeds is advisory (CLAUDE.md §3); the publish verdict reads its own observation, not this.

**This fails if** a start in an unchanged corpus starts an `adr-next`; a changed task file, record header, `adr-next` or `record.py` is answered from the old entry; the text of the lines differs from an uncached run; an unreadable or unwritable cache is reported as a hit or as "nothing in flight"; a hook memoises a tree question; or a gate reports a concurrency it did not use.

## Alternatives Considered

- **(a) Leave it: 1.2 s a start is small.** Rejected: it is paid at every start, resume and compaction in every project with an ADR corpus, and the work is exactly the repeated kind this record is about; the adopter survey (BACKLOG §370) put SessionStart at 0.9 to 2.2 s.
- **(b) Run the six `adr-next` concurrently.** Measured as not worth building: the slowest of the six is 1,104 ms of the 1,370 ms total, so the wall time falls by about 0.3 s, and only on a cache miss, which is the rare case once (c) exists. Deferred with the number.
- **(c) One `adr-next` over the corpus root.** Rejected: ADR-034 allows it, but the hook shows six directories chosen by recency, and the corpus-root form reads all of them (about 85 task directories here).
- **(d) A cache keyed on file modification times.** Rejected: a checkout, a rebase or a copy changes times and not content, and a restored file with an old time but new content is a stale hit. A content digest is an equality, not a guess (CLAUDE.md §16).
- **(e) Memoise `git status` and `diff` for a hook's life.** Rejected as asked (unbounded): the tree can change inside a hook, and a stale tree answer would be a false completion claim. **Narrowed 2026-10-11, with the owner's yes, after outside runs measured the cost:** `git status` only, for at most two seconds, per process and per repository, off unless the entry point switches it on (Decision 5, T5). `diff`, `write-tree` and `add` are still asked every time.
- **(f) A resident process that holds the answers.** Rejected for now: it is the design the owner parked under BACKLOG §375 ("left out on purpose"); a file cache gets the measured gain without a lifecycle to manage.
- **(g) Node's V8 compile cache.** Measured and dropped: no difference at 30 modules.

## Component / Boundary Impact

None — internal to `ready-lines.mjs`, `tree-facts.mjs` and `scripts/`. A new directory under the state directory holds cache entries; no existing ledger gains a field.

## Wiring & Contract Changes

| Surface | Change | Producer | Consumer(s) |
|---------|--------|----------|-------------|
| `scripts/hook-cost.mjs` | new repository tool | T1 | the owner, T2, T3, T4 |
| `<state dir>/ready-cache/<key>.json` | new: `adr-next`'s stdout and exit for a content key | T2 | `readyTaskLines` |
| `readyTaskLines(root, …)` | consults the cache before `spawnGate` | T2 | `surfaceReadyLines`, SessionStart |
| `gitRepositoryRoot`, `gitRepositoryLookup`, `gitDirectoryOf` | memoised per process for identity questions | T3 | the Stop, PreToolUse and SessionStart rules |
| `scripts/selftest.sh` | passes a test concurrency it chose, and says so | T4 | the gate |
| `statusPaths(root)` | reuses one answer per repository for two seconds inside a hook process, off elsewhere | T5 | the late-baseline check, the completion rules, the artifact rule |

## Inter-task Contracts

| Contract | Producing task | Consuming task(s) | Breaking? |
|----------|----------------|-------------------|-----------|
| `scripts/hook-cost.mjs --json` (children, repeats, reads, wall) | T1 | T2, T3, T4 (their acceptance and sign-off figures) | No — new |
| `readyKey(dir, root)` | T2 | none | No — new |

## Implementation

See `docs/adr/ADR-095-a-hook-does-not-repeat-work-whose-inputs-have-not-changed/tasks/README.md`.

## Consequences

- **Positive:** a session start in an unchanged corpus costs the git calls and no Python; an identity question is asked once; the next performance claim in this project has a tool that reproduces it.
- **Negative:** a stale-hit defect in T2 would show a task as ready that is done, or the reverse. The key covers every input `adr-next` reads, a mutant per input proves each is in it, and `adr-next` itself is unchanged; the residual risk is an input nobody listed, which is why T2 enumerates `adr-next`'s reads with a command and puts the count in its sign-off.
- **Negative:** the cache directory grows with every distinct task-directory content; the daily sweep removes entries older than seven days.
- **Neutral:** CLAUDE.md §19 (adopter footprint) is served: the figures here are an adopter's SessionStart and Stop, not this repository's gate.

## Out of Scope

- Running the misses of the ready-line cache concurrently (deferred: docs/BACKLOG.md §378; measured at about 0.3 s, only on a miss)
- Reading the decision corpus once per session instead of per governed path (the first Edit costs 347 ms, the second 79 ms) (deferred: docs/BACKLOG.md §378)
- A per-test verdict cache for the repository's own gate (deferred: docs/BACKLOG.md §378; T4 measures the concurrency, not the reuse, because a reused pass on an input nobody listed is the failure this project exists to demonstrate the absence of)
- A resident hook process (permanent: boundary: parked by the owner under BACKLOG §375 until the measured gain justifies a lifecycle)
- Windows timings (permanent: boundary: not measurable from this machine; the outside run in Follow-ups is where a Windows figure comes from)

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| A task shows ready (or done) from an entry whose input changed | Low | High | the key hashes every file `adr-next` reads, one mutant per input in the key; a changed byte anywhere is a miss |
| A cache that cannot be read or written is reported as a hit | Low | High | every failure is a miss, said once; tested with an unreadable, an unwritable and a corrupt entry |
| A concurrent session writes the same entry | Medium | Low | write to a temporary name and rename; a torn entry fails to parse and is a miss |
| An identity memo outlives a `cd` or a worktree switch inside one process | Low | Medium | the key includes the directory; the memo is per process only |
| T4's concurrency rule is slower on a quiet machine | Medium | Low | the rule ships only if it is not slower at the quiet load in the measurement |

## Rollback

Revert each task's commit. The cache directory is read by nothing else and is removed by the sweep.

## Follow-ups

- [x] Owner decision: Accepted 2026-10-11, all four tasks (T4 one gate at a time, bounded and priced under costly-runs).
- [ ] Outside run (CLAUDE.md §18) at the release-candidate sha: SessionStart and Stop timings on a corpus of 70 records or more, before and after.
