# Task ADR-034-T1: Enumerate a corpus root instead of reporting it empty

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** M (one gate, one test file, two catalogue entries)
**Owner:** unassigned
**Produces:** `adr-next <corpus root> [--all] [--json]` — ready tasks grouped by record, exit 0 when any record has ready work, 3 when none does, 1 when there is nothing to look at
**Consumes:** the existing `resolve_tasks_dir`, `load` and `blockers`, one level down
**Data dependency:** hermetic — reads a directory tree, writes nothing, spawns nothing
**Proof map:** v1
**Rests-on:** `next: a corpus root is enumerated, not reported empty`, `next: a corpus with nothing ready is not a corpus with ready work`

## Goal

The call the documentation recommends works at the granularity people type it at, and a corpus with
ready work can never read as a corpus that is done.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/bin/adr-next` | edit | `classify` extracted; `corpus_records` and `report_corpus` added; one branch in `main()` |
| `tests/adr-next.test.mjs` | edit | four tests, including the falsifiability half a single-record fixture cannot reach |
| `tests/mutations.json` | edit | two catalogue entries, or the checks are unproven (ADR-003) |

## Ordered Steps

1. [S1] Establish the failing tests FIRST — and this time they were, which is worth saying plainly because the two records before this one had to record the opposite. Four tests written against the unmodified gate: 3 failed, 1 passed. The one that passed is the empty-directory case, which already exited 1 with a message naming what it could not find; it is kept as a regression and is NOT claimed as a fix. [proof: acceptance]
2. [S2] Reproduce the report before believing it. `adr-next docs/adr --all` at HEAD printed `no task files in docs/adr` over 33 records — the message half of issue #10, confirmed. The reported exit 0 did NOT reproduce, here or at the reporter's own v2.60.0 checked out and run: both give 1, and the branch is `return 1`. Recorded as unreproduced with the confound named (their run went through a Windows Git Bash forwarder this machine cannot drive), never as refuted. [proof: acceptance]
3. [S3] Extract `classify` from `main`'s inline loop so the single-record path and the corpus path share ONE copy of the readiness rule. Two copies is how `Consumes` came to be missing the foreign-pointer rule `Depends-on` had (BACKLOG §41). [proof: acceptance]
4. [S4] Add `corpus_records`, which resolves each child through the SAME `resolve_tasks_dir`, so every input shape that already works for one record keeps working one level down. [proof: acceptance]
5. [S5] Add `report_corpus`, preserving the exit contract exactly — 0 ready / 3 nothing ready / 1 could not answer — because that is what callers branch on. [proof: acceptance]
6. [S6] Gate the corpus branch on the target owning no task files of its own, so a directory that is both a tasks directory and a parent of records is answered the way it always was and no existing invocation changes. [proof: acceptance]
7. [S7] Add two catalogue mutations and confirm both come back RED. [proof: mutation]

## Acceptance

```bash
set -o pipefail
node --test tests/adr-next.test.mjs 2>&1 | tee /tmp/adr034-t1.out \
  && ! grep -qE "no tests to run|^not ok|^# fail [1-9]" /tmp/adr034-t1.out \
  && python3 plugin/bin/adr-lint docs/adr/ADR-005-a-gate-reports-what-it-observed.md
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a corpus root reports every record it holds, instead of reading as empty` | `tests/adr-next.test.mjs` | the reported defect: the message is gone and both records are named | — | S1, S4, S5 |
| `a corpus root whose records have nothing ready exits 3, not 0` | `tests/adr-next.test.mjs` | the exit contract, and the half a corpus mode returning 0 unconditionally would pass without | — | S1, S5 |
| `a directory holding neither records nor tasks is refused, not called clean` | `tests/adr-next.test.mjs` | ADR-005: could-not-look stays exit 1. PASSED BEFORE THIS TASK — a regression, not a fix | — | S1, S6 |
| `--json over a corpus root keys its answer by record` | `tests/adr-next.test.mjs` | the machine-readable shape, keyed so a caller can attribute a task to its record | — | S1, S5 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | `adr-next docs/adr --all` enumerates 33 records on this repository |
| 2 — something selects it | four tests drive the gate through its CLI; two mutations break the branch and the contract |
| 3 — the caller can discover it | it is the shape `adr-lint` and `adr-debt` already take, and the shape issue #10's reporter reached for unprompted |
| 4 — it is used | one adopter typed it and filed an issue when it misanswered. Whether the fix reaches them is not observable from here |

## Risks

- **A large corpus prints a long answer.** 33 records here; the reporter's has 37. The default form still names one next task, but `--all` over a corpus is now genuinely long. No paging, and none is proposed until someone asks.
- **`corpus_records` looks exactly one level down.** A nested corpus, or records grouped into subdirectories, is not found — and the failure is silent, because the directory then simply has no records and takes the old path. Named in the record's Out of Scope rather than guessed at.
- **The unreproduced exit-0 half is not fixed by this task.** If it is real it lives below this code, in the forwarder or the Windows spawn. This change makes it less harmful without addressing it, and issue #10 should stay open on that half.

## Stop Condition

Abandon if preserving the exit contract on both paths turns out to require different codes for the
same state — a corpus answer whose 0 and 3 do not mean what a single record's do is worse than the
message defect it replaces, because callers already branch on those codes.

## Out of Scope

- The unreproduced exit-0 report (deferred: needs a Windows measurement nobody here can take).
- Recursion deeper than one level (deferred: no reported need).
- Paging a long corpus answer (deferred: nobody has asked).

## Invariants

- The exit contract is identical on both paths: 0 when something is ready, 3 when nothing is, 1 when the tool could not answer. A corpus that is merely large never reads as a corpus that is done.
- A directory that owns task files of its own takes the single-record path, unchanged, whatever else it contains — so no invocation that worked before this task behaves differently after it.
- One copy of the readiness rule. `classify` is called by both paths and by nothing else.
- A record folder that resolves to no tasks is absent from the corpus answer rather than an error.
- The single-record `--json` shape is unchanged; the corpus form adds a `records` object and does not alter the old keys.

## Mutation Log

## Verification Log
