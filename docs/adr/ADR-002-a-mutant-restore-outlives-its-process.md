# ADR-002: A mutant restore must outlive the process that applied it

**Status:** Proposed
**Date:** 2026-08-27
**Owner:** zy
**Spec:** None — no spec stage
**Cross-references:** docs/adr/ADR-001-skills-are-never-linked.md
**Governs:** `bin/adr-verify`, `scripts/mutate.mjs`, `tests/evidence-chain.test.mjs`
**Invalidates:** none — checked (`adr-state.mjs` reports ADR-001 only, which governs the standalone-install tooling and shares no path with this record)
**Served-path change:** A user whose acceptance fence outruns their agent's timeout no longer finds a deliberately broken file left in their working tree; the next `adr-verify` run, or `adr-verify --restore`, puts it back.

Like ADR-001, this record was written after its first half shipped (v2.18.2, `6bbff6d`) and says so.
Unlike ADR-001, part of it is still open: the SIGTERM handler it describes has no test and no
mutation, which T2 exists to close. The record is the first place that gap is written down.

## Context

`adr-verify --mutant` is the gate that proves a test can go red. It deliberately writes a defect
into a source file, runs the task's acceptance fence, and restores the file in a Python `finally`.

Reported 2026-08-27 from a Windows session running an eleven-minute Docker-backed fence against a
ten-minute agent tool cap: **two runs were killed mid-fence and each left the mutant applied.** It
was noticed only because those files had become tracked in the same session — untracked, a defect
the tool introduced on purpose sits in the working tree and nothing says so.

Measured the same day, by signalling a real run at five points during its fence:

| signal | mutant after the kill |
|---|---|
| `SIGINT` | restored |
| `SIGTERM` | **left in the tree** |
| `SIGKILL` | **left in the tree** |

The `finally` unwinds on an exception and on Ctrl-C. Python's default `SIGTERM` disposition
terminates without unwinding, and `SIGKILL` cannot be caught at all. The docstring claimed "a crash
or a Ctrl-C cannot leave a mutated working tree behind" — true for the cases it named, silent about
the one that happened.

This is a fabrication risk of the sharpest kind: the gate built to stop self-declared evidence can
itself plant a real defect in a user's repository, and the next commit ships it.

## Existing Primitives Audit

- `scripts/mutate.mjs` already solves this exact problem for this repository's own campaign: an
  on-disk journal plus a `recover()` that repairs before the next run does anything. **Reused as
  the pattern**, not as code — the two run in different languages and different processes.
- `write_source()` in `bin/adr-verify` already writes bytes without letting Python translate line
  endings. **Reshaped:** its byte-producing half was extracted as `source_bytes()` so the journal
  can record the mutated file's exact bytes before that file exists, rather than re-deriving the
  rule and drifting from it.
- Python's `finally` and `signal` are the platform primitives. **Reused**, with the measured limits
  above written into the code rather than assumed.

## Decision

A mutant restore is recorded on disk **before** the mutation lands, outside the repository being
edited, and recovered by the next run.

Concretely, in `run_mutant`:

1. The journal — original bytes, the exact mutated bytes, the file, the fence — is written **first**,
   keyed by a digest of the repository path, under `CLAUDE_PLUGIN_DATA` or the system temp
   directory. Never inside the repository: `adr-verify` runs in other people's trees and does not
   get to leave files in them.
2. A `SIGTERM` handler is installed **before** `write_source`, turning the signal into a `SystemExit`
   so the existing `finally` runs.
3. Only then is the file mutated, and a warning naming the broken file and how to undo it is printed
   **with `flush=True`** before the fence starts.
4. `recover_mutant()` runs at the top of every `adr-verify` invocation for that repository, and
   `adr-verify --restore [--cwd <repo>]` runs it on demand.
5. A file whose current bytes match neither the original nor the mutant has moved on since the kill;
   it is **never overwritten**, and the original is written out beside the journal instead.

Order is the decision, not an implementation detail. A first pass armed the journal and the handler
*after* `write_source`: a SIGTERM probe left the tree broken while the very next identical run
restored it, because the window is microseconds wide and the fix looks like it works about half the
time.

The `flush` is likewise load-bearing rather than cosmetic. The announcement is the only recovery a
`SIGKILL` cannot take away, and unflushed it is not one: measured 2026-08-27, both kill probes
produced a **completely empty** log while the mutant sat in the tree, because redirected stdout is
block-buffered and the buffer died with the process.

What would make this decision wrong: a platform where the journal directory is not writable and not
recoverable, so the guarantee silently degrades to the `finally` alone. The code says so out loud
rather than failing quietly — a journal write that raises `OSError` prints that a killed run will
leave the mutant in place, immediately above the line that says how to undo it by hand.

## Audit of the class

**The class:** every tool in this repository that deliberately rewrites a source file it is
responsible for putting back.

**Enumerated by command, not memory:**

```bash
grep -rln 'write_source\|original_bytes\|restore\|journal' bin/ scripts/
grep -rln 'journal' bin/ scripts/
```

Run 2026-08-27. Four files match the first query; two are false positives dismissed by reading —
`scripts/coverage.sh` only mentions the mutation runner in a comment, and `scripts/lifecycle.mjs`
matches on the word `restore` inside a list of git subcommands. **The class has exactly two
members:** `bin/adr-verify` and `scripts/mutate.mjs`.

`scripts/mutate.mjs` was already correct — it carries an on-disk journal and a `recover()`, and its
header already records that in-process handlers are not enough because they cannot fire during a
synchronous campaign. That is the finding worth keeping: the pattern was known, written down, and
not carried across to the other member. Fixing the instance would have left the class exactly as it
was, because the class was already half-right and nobody had asked it the question.

**Members deliberately left out:** none. Both are addressed — `mutate.mjs` by already being correct,
which T1's acceptance re-checks rather than assumes.

## Alternatives Considered

- **A `SIGTERM` handler alone:** five lines, and the measurement showed `SIGTERM` is what a
  well-behaved killer sends. **Rejected as insufficient:** the same measurement showed `SIGKILL`
  leaves the mutant too, and `SIGKILL` cannot be caught. Shipping only this would have produced a
  fix that passes a `SIGTERM` probe and fails the case actually reported.
- **A journal alone, with no signal handler:** covers every kill, including `SIGKILL`, and is
  strictly more general. **Rejected as insufficient on its own:** it leaves the tree broken until
  somebody runs the tool again, and the reported user was mid-deadline. The handler restores
  in-process for the catchable signal, which is most of them.
- **Both, plus a flushed warning before the fence — CHOSEN.** The measurement decided this rather
  than taste: `SIGINT` was already handled, `SIGTERM` is catchable, `SIGKILL` is not, so each layer
  covers what the one before it cannot.
- **Also cleaning up the orphaned child processes a killed run leaves behind:** raised in the same
  report, alongside stranded `redis:8` / `postgres:16` containers and a `bp-verify` network.
  Rejected because a process cannot reliably clean up from inside the kill that is destroying it —
  `SIGKILL` runs no handler, and the children have already been reparented by the time anything
  could look. The reporter's own `ps -ef` / `docker ps` check runs from outside the dying process
  and is therefore the better instrument. Recorded in Out of Scope rather than silently dropped.

## Component / Boundary Impact

None — internal to `bin/adr-verify`. `source_bytes()` is a new module-level helper beside
`write_source()`, which keeps its single reason to change; no component was added, moved or
re-owned.

## Wiring & Contract Changes

| Surface | Change | Producer | Consumer(s) |
|---------|--------|----------|-------------|
| `adr-verify --restore [--cwd <repo>]` | new operator flag; exits 0 whether or not a mutant was recorded | `bin/adr-verify` `main()` | anyone whose run was killed; the warning line printed before every fence |
| `adr-verify` module docstring | documents the restore guarantee and its limits, replacing a claim that was silent about `SIGTERM`/`SIGKILL` | `bin/adr-verify` | `adr-verify` with no arguments prints it |
| restore journal file | new on-disk artifact under `CLAUDE_PLUGIN_DATA` or system temp, keyed by a digest of the repository path | `bin/adr-verify` `run_mutant()` | `bin/adr-verify` `recover_mutant()` |
| stdout before the fence | a flushed `MUTANT APPLIED` warning naming the file and the undo command | `bin/adr-verify` `run_mutant()` | the operator, and any transcript that survives the kill |

## Inter-task Contracts

| Contract | Producing task | Consuming task(s) | Breaking? |
|----------|----------------|-------------------|-----------|
| journal written before the mutation lands | T1 | T2 | No — T2 asserts the ordering T1 establishes |

## Implementation

See `ADR-002-a-mutant-restore-outlives-its-process/tasks/README.md`. Two tasks.

## Consequences

- **Positive:** a killed `--mutant` run can no longer leave a deliberate defect in a user's
  repository without both a recovery path and a printed warning.
- **Positive:** the guarantee is now stated accurately. The previous docstring was true about the
  cases it named and silent about the one that occurred, which is the failure mode this corpus
  treats most seriously.
- **Negative:** a new on-disk artifact exists outside the repository. It is small, keyed by
  repository path, and deleted on the normal path — but a machine that kills many runs accumulates
  journals in temp until the OS clears them.
- **Negative:** the journal is written on every `--mutant` run, including the overwhelming majority
  that finish normally. That is one small write per mutation, accepted for a guarantee that only
  matters when something goes wrong.
- **Neutral:** the orphaned child processes and containers a killed run leaves behind are unchanged,
  and deliberately so.

## Out of Scope

- Killing the orphaned `verify.sh` and container children a dying run leaves behind. (permanent: a gate cannot reliably clean up from inside the process being killed, and the reporter's `ps -ef` / `docker ps` check is the better instrument.)
- Giving `adr-verify` a detached or resumable mode so an eleven-minute fence survives a ten-minute agent cap at all. (deferred: docs/BACKLOG.md §26)
- Any change to `scripts/mutate.mjs`, which already carries this pattern. (permanent: it is the class member that was already correct; T1 re-checks that rather than editing it.)

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| The journal directory is unwritable, degrading the guarantee to the `finally` alone | Low | Med | The `OSError` path prints that a killed run will leave the mutant in place, directly above the manual undo command — it never fails silently |
| A stale journal restores over work done since the kill | Low | High | `recover_mutant` restores only when the file's current bytes match the recorded mutant exactly; anything else is left alone and the original is written out beside the journal |
| The `SIGTERM` handler has no test and no mutation, so it can rot unnoticed | **High** | Med | T2 exists for exactly this and is the open half of this record |
| Windows Python handles signals differently and the guarantee differs there | Med | Med | CI run 33067948621 exercises the five kill tests on `windows` and passes; the `signal.signal` call is wrapped so an unsupported platform degrades to the journal rather than raising |

## Rollback

Revert the `bin/adr-verify` changes from `6bbff6d`. No persistent state, schema or external
integration is involved; the journal is disposable by construction, and an orphaned one is ignored
once its recorded mutant no longer matches the file. `--restore` becomes an unknown option again,
which `main()` reports by name rather than misreading as a task path.

## Follow-ups

- [ ] Close the untested `SIGTERM` handler (T2).
- [ ] Decide whether `adr-verify` should offer a detached or resumable mode for fences that outrun an agent's tool timeout (docs/BACKLOG.md §26).
