# Task ADR-145-T2: `work-next` asks once, and takes an answer only inside the margins

**Depends-on:** T1
**Covers:** none — no spec
**Estimated scope:** M
**Owner:** Zy
**Produces:** `batchedAnswers`
**Consumes:** `adr-next --batch` (T1), `the batch frame` (T1)
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `the status check`, `the combined byte bound`, `the frame order check`, `the fallback to the single call`, `the injected spawn left unbatched`

## Goal

`readinessFrom` starts one `adr-next --batch` for its task directories, takes each frame that is well inside the single call's
limits, and asks every other directory by the unchanged single call, so that what `work-next` says is the same (ADR-145
Decisions 4 to 6).

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/work-next.mjs` | edit | `batchedAnswers` and its three constants; the line in `readinessFrom` (:82-83) that takes a batched answer before spawning, which is what selects it |
| `tests/work-next-batch.test.mjs` | add | The tests below |
| `tests/helpers/count-spawns.mjs` | add | A `--import` preload that counts `spawnSync` calls by argument, for the one-process test |
| `tests/mutations/plugin/scripts/work-next.mjs.json` | edit | One mutant per mechanism in `Rests-on` |

## Ordered Steps

1. [S1] Write the tests of the table below and confirm they are red (TDD red): `batchedAnswers` is not exported, and the
   spawn count is one per directory.
2. [S2] Add `batchedAnswers(dirs, root, { run = spawnGate, ms } = {})`, where `ms` defaults to
   `QUALITY_HARNESS_BATCH_MS` when that is a positive integer and to 30 000 otherwise. Directories that are not well-formed
   strings are left out; with fewer than two left, nothing is asked. One `run(path.join(BIN, 'adr-next'), ['--batch'], …)`
   with the single call's `cwd`, `encoding` and `windowsHide`, `JSON.stringify` of the directories as `input`, `timeout: ms`
   and a `maxBuffer` of 256 MiB. Lines ending in a newline are read in order whatever the run's `error` or `status`, an absent
   `stdout` being no lines. Reading stops at the first line that is not a frame as ADR-145 Decision 5 defines one. A frame is
   kept only with status 0 or 3, `warned` false, and under 512 KiB for its stdout, its stderr and the run's own stderr
   together, counted as UTF-8 with each newline as two bytes; a frame not kept does not stop the reading. It returns a map
   from directory to `{ status, stdout, stderr }`.
3. [S3] In `readinessFrom`, call it only when `spawn` is `spawnGate` itself, and use `batched.get(dir) ?? spawn(…)` with the
   single call's arguments unchanged.
4. [S4] Add the catalogue mutants (status check dropped; `warned` ignored; bound checked per stream; bound counted in
   characters; the run's own stderr left out of the bound; a line without its newline read; index check dropped; `dir` check
   dropped; fallback dropped so an unanswered directory is unproven; an injected spawn batched) and record one killed per
   `Rests-on` name. [proof: mutation]

## Acceptance

```bash
set -o pipefail
out="$(mktemp)"
node --test tests/work-next-batch.test.mjs 2>&1 | tee "$out" && grep -q '✔ work-next says the same with and without the batch' "$out" && node --test tests/work-next-readiness.test.mjs tests/work-next-ownerless.test.mjs tests/ready-is-work-next.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `work-next says the same with and without the batch` | `tests/work-next-batch.test.mjs` | Over every fixture corpus in a test-made repository: `observe`'s state and `main`'s stdout, stderr and exit are equal between the default and a wrapped `spawnGate`, which is never batched | — | S1, S2, S3 |
| `one adr-next process answers the task directories of each reading` | `tests/work-next-batch.test.mjs` | Under the spawn counter, with `work-next` run as a process: a corpus with several governing and several undecided task directories starts two `--batch` and no single call; one with one of each starts two single calls and no batch | — | S3 |
| `a frame outside the margins is asked singly` | `tests/work-next-batch.test.mjs` | Through the `run` seam: status 1; `warned` true; stdout and stderr together at the bound and one byte under it, built from multibyte text and newlines so a count in characters or without the doubling differs; the same with the bytes on the run's own stderr. Each refused one is absent from the map and the frames after it are present | — | S2 |
| `reading stops at a line that is not a frame` | `tests/work-next-batch.test.mjs` | A wrong `i`, a wrong `dir`, a null status, a non-string stream, a missing `warned`, a line that is not JSON, a single call's own pretty-printed answer, and a whole valid frame lacking only its newline: nothing from that line on is taken, and the frames before it are | — | S2 |
| `a batch that did not finish keeps what it finished` | `tests/work-next-batch.test.mjs` | `run` results with `ETIMEDOUT`, `ENOBUFS`, `ENOENT` with no `stdout` at all, and exit 1 with usage on stderr: the map holds the complete frames before the end and nothing else | — | S2 |
| `the batch is asked as the single call is asked` | `tests/work-next-batch.test.mjs` | The `run` seam receives the gate's own path, `['--batch']`, the root as `cwd`, the directories as JSON `input`, 30 000 by default and the environment's budget when set; a directory with a lone surrogate is not in the input | — | S2 |
| `what the batch does not answer the single call decides` | `tests/work-next-batch.test.mjs` | `work-next` run as a process from a copied plugin, under the spawn counter, with its gate replaced in turn by: one without the flag; one whose batch answers the first directory and hangs (budget set by the test through the environment); one lacking its executable bit; and one whose first line names an interpreter that does not exist (amended at execution, 2026-11-24, from an empty `PATH`, under which work-next's own git cannot start and readiness is never asked). The adr-next starts are the batch and then exactly the unanswered directories. For the first two, stdout, stderr and exit equal the run the batch answers whole; for the last two, every directory is readiness UNPROVEN (those two skipped on Windows, which has no permission bits and resolves its own interpreter) | — | S2, S3 |
| `an injected spawn is never batched` | `tests/work-next-batch.test.mjs` | A stand-in `spawn` sees one `[dir, '--json']` call per directory and no `--batch` | — | S3 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | `batchedAnswers`, driven through its `run` seam |
| 2 — something selects it | the `batched.get(dir) ??` line in `readinessFrom`; with it removed, `one adr-next process answers every task directory` counts one start per directory |
| 3 — the caller can discover it | n/a: no declared interface; `work-next`'s command line does not change |
| 4 — it is used | every `work-next` run over two or more task directories; T3 measures it |

## Mutation Log
- 2026-11-24 · 1a8449230* · mutant killed · exit 1 · `plugin/scripts/work-next.mjs` · a frame whose exit is no answer is taken as one · acceptance-sha256:8cfadebb9aa6686271edf669b2b2e973650932eca8ff67ab573fbfc14c1834a9 · covers:the status check
- 2026-11-24 · 1a8449230* · mutant killed · exit 1 · `plugin/scripts/work-next.mjs` · each stream is held to the bound alone, as the refused first attempt did · acceptance-sha256:8cfadebb9aa6686271edf669b2b2e973650932eca8ff67ab573fbfc14c1834a9 · covers:the combined byte bound
- 2026-11-24 · 1a8449230* · mutant killed · exit 1 · `plugin/scripts/work-next.mjs` · a frame out of its place is read and so is everything after it · acceptance-sha256:8cfadebb9aa6686271edf669b2b2e973650932eca8ff67ab573fbfc14c1834a9 · covers:the frame order check
- 2026-11-24 · 1a8449230* · mutant killed · exit 1 · `plugin/scripts/work-next.mjs` · a directory the batch did not answer is left unproven and never asked singly · acceptance-sha256:8cfadebb9aa6686271edf669b2b2e973650932eca8ff67ab573fbfc14c1834a9 · covers:the fallback to the single call
- 2026-11-24 · 1a8449230* · mutant killed · exit 1 · `plugin/scripts/work-next.mjs` · an injected spawn is bypassed by a batch through the real gate · acceptance-sha256:8cfadebb9aa6686271edf669b2b2e973650932eca8ff67ab573fbfc14c1834a9 · covers:the injected spawn left unbatched

## Invariants

- For every directory, the `{ status, stdout }` `readinessFrom` acts on is a single call's, or a frame whose status and parsed stdout equal it.
- The batch's silence, failure or refusal never makes a directory readiness UNPROVEN: only a single call's result, or the evidence inside a taken frame (an unreadable or duplicate task), does (ADR-005, ADR-046).
- The single call's arguments and options (work-next.mjs:83) are byte-identical to today's.
- No timer runs inside the gate; the only time limit on the batch is `spawnSync`'s.

## Risks

- The `run` seam's canned results do not model a real kill's partial line or a real pipe overflow; `what the batch does not
  answer the single call decides` meets a real kill, and the overflow is met only as `ENOBUFS` from the seam.
- The executable-bit and empty-`PATH` tests cannot run on Windows; there the interpreter is resolved by `spawnGate` for both
  calls alike (plugin/scripts/ready-lines.mjs:96-110), which the shared launcher guarantees and no Windows test shows.
- A 30 s batch limit on a runner several times slower than a developer machine: tests set `ms` themselves (CLAUDE.md §7).

## Stop Condition

Stop if `work-next says the same with and without the batch` differs on any fixture corpus for a reason other than a test
defect. Stop after the scoped verification review (CLAUDE.md §12) if it finds a fail-open: the record is withdrawn, as the
first attempt was, and not patched a third time.

## Out of Scope

- The measurement that decides whether this ships (T3).
- `corpus-probe.mjs` and `backlog-record-sweep.mjs`, which keep one process per directory (ADR-145 Out of Scope).

## Verification Log
- 2026-11-24 · 1a8449230* · exit 1 · `set -o pipefail …` · acceptance-sha256:8cfadebb9aa6686271edf669b2b2e973650932eca8ff67ab573fbfc14c1834a9 · ms:167 · test-lock-sha256:250787bdc7509bf69bfed0bebed16f41954c7cf3a31345cccd5226cc83c9c24c · test-lock-file:docs/adr/locks/250787bdc7509bf69bfed0bebed16f41954c7cf3a31345cccd5226cc83c9c24c.lock
  ```
  --- last 10 line(s) of stdout (of 25 after folding 25 raw)
  ℹ cancelled 0
  ℹ skipped 0
  ℹ todo 0
  ℹ duration_ms 84.432125

  ✖ failing tests:

  test at tests/work-next-batch.test.mjs:1:1
  ✖ tests/work-next-batch.test.mjs (81.615208ms)
    'test failed'
  ```
- 2026-11-24 · 1a8449230* · exit 0 · `set -o pipefail …` · acceptance-sha256:8cfadebb9aa6686271edf669b2b2e973650932eca8ff67ab573fbfc14c1834a9 · ms:18525
- 2026-11-24 · 1a8449230* · exit 0 · `set -o pipefail …` · acceptance-sha256:8cfadebb9aa6686271edf669b2b2e973650932eca8ff67ab573fbfc14c1834a9 · ms:18666
- 2026-11-24 · 1a8449230* · exit 0 · `set -o pipefail …` · acceptance-sha256:8cfadebb9aa6686271edf669b2b2e973650932eca8ff67ab573fbfc14c1834a9 · ms:20751
- 2026-11-24 · 1a8449230* · exit 0 · `set -o pipefail …` · acceptance-sha256:8cfadebb9aa6686271edf669b2b2e973650932eca8ff67ab573fbfc14c1834a9 · ms:20358
- 2026-11-24 · 1a8449230* · exit 0 · `set -o pipefail …` · acceptance-sha256:8cfadebb9aa6686271edf669b2b2e973650932eca8ff67ab573fbfc14c1834a9 · ms:23604
