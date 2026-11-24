# Task ADR-145-T1: `adr-next --batch` answers each directory as its own process would

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** M
**Owner:** Zy
**Produces:** `adr-next --batch`, `the batch frame`
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `the cache cleared between queries`, `the frame flushed per query`, `the abnormal end that stops the batch`, `the single call left unchanged`

## Goal

`plugin/bin/adr-next --batch` reads a JSON array of directories from standard input and writes one flushed frame per query
whose status and stdout are what `adr-next <dir> --json` gives in a process of its own (ADR-145 Decisions 1 to 3).

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/bin/adr-next` | edit | The batch loop beside `main()`; `--batch` in the usage text (:4-45); and `entry()`, the function the file now exits through, which looks for `--batch` before `main()` does and is what makes the mode reachable. The known-flag tuple (:1731) stays as it is, so `adr-next <dir> --batch` is still an unknown-flag refusal (amended at execution, 2026-11-24: with the flag in the tuple the single call would have accepted it in silence) |
| `tests/adr-next-batch.test.mjs` | add | The oracle and fault-injection tests below |
| `tests/mutations/plugin/bin/adr-next.json` | edit | One mutant per mechanism in `Rests-on` |

## Ordered Steps

1. [S1] Write the tests of the table below in `tests/adr-next-batch.test.mjs` and confirm they are red (TDD red): today
   `--batch` is an unknown flag and exits 1 with no frame. Every git the tests spawn runs in a directory the test created
   (CLAUDE.md §9); the fixture corpora under `tests/fixtures/corpora` are copied into it.
2. [S2] Add `--batch` to the usage text, and `entry()` in front of `main()`. `--version` still wins; any other argument
   beside `--batch` (`--help` and `-h` included), and input that is not strict UTF-8 JSON holding an array of strings, say so
   on stderr and return 1 with no frame. Input is read as bytes from `sys.stdin.buffer` to its end.
3. [S3] Add the loop. Per query: clear every `lru_cache` of record.py; set `sys.argv` to `[argv0, dir, "--json"]`; capture
   both streams as `utf-8` with `errors="replace"`; record warnings with the `always` filter, so none is printed and none is
   missed; call `main()`; restore the streams, the warning state and `sys.argv`; write the frame, with `warned`, to the real
   stdout and flush. A return value or a `SystemExit` with an integer or `None` (0) gets a frame and the batch goes on; any
   other end stops the batch with exit 1.
4. [S4] Add the test that runs the enumeration command of ADR-145's Context over the two files and fails when it finds a
   cached function or a `global` statement outside the reviewed list, with the list and its date beside it, and that every
   cached function it finds is one the loop clears.
5. [S5] Add the catalogue mutants (the clear removed; the clear narrowed to `_object_format`; the flush removed; an exception
   answered with a frame instead of stopping; `warned` always false; the batch dispatch taken without the flag, which
   `tests/adr-next.test.mjs` kills) and record one killed per `Rests-on` name. [proof: mutation]

## Acceptance

```bash
set -o pipefail
out="$(mktemp)"
node --test tests/adr-next-batch.test.mjs 2>&1 | tee "$out" && grep -q '✔ a batch answers each directory as its own process does' "$out" && node --test tests/adr-next.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a batch answers each directory as its own process does` | `tests/adr-next-batch.test.mjs` | Over every fixture corpus, in order, reversed and with each directory twice: each frame's status and parsed stdout equal the single call's, and `dir` and `i` are the query's | — | S1, S3 |
| `a failed object-format lookup stays inside its query` | `tests/adr-next-batch.test.mjs` | With a git stand-in whose first object-format answer fails: query one equals the single call under the same failing git, query two equals the healthy single call, and git was asked again for it | — | S3 |
| `a status that is not an answer still gets its frame` | `tests/adr-next-batch.test.mjs` | A missing directory between two good ones (`main` returns 1), and with the gate loaded as a module a `main` that calls `sys.exit(1)` and one that calls `sys.exit()`: three frames each time, the middle one with status 1, 1 and 0, and the last equal to the single call | — | S3 |
| `an abnormal end inside a query ends the batch` | `tests/adr-next-batch.test.mjs` | The real gate over a task whose title declares an id of 4,301 digits, which makes `classify` raise at adr-next:1459 (the single call exits 1 with a traceback), placed second of three: one frame, exit 1. And with `main` replaced to exit with a string: the same | — | S3 |
| `a cached parse does not hide a later query's warnings` | `tests/adr-next-batch.test.mjs` | With the gate loaded as a module and a `main` that parses, through record.py's cached `_python_functions`, a Python source whose parse warns: over two queries the parser ran twice and both frames carry `warned: true` with the warning kept out of their stderr; a query that raised none carries `false` (amended at execution, 2026-11-24: no fixture corpus holds a test lock, so the cached parse is reached directly) | — | S3 |
| `a directory name survives the transport or is refused` | `tests/adr-next-batch.test.mjs` | A directory named with a non-ASCII letter under `PYTHONIOENCODING=latin-1` is answered as the single call answers it; input that is not valid UTF-8 is usage, exit 1 | — | S2 |
| `a frame is written when its query ends` | `tests/adr-next-batch.test.mjs` | With a git stand-in that hangs for the second directory and a test-set timeout: the killed batch's stdout holds exactly the first frame | — | S3 |
| `no child of a query reads the batch's input` | `tests/adr-next-batch.test.mjs` | A git stand-in that records its own stdin records nothing | — | S3 |
| `a batch takes no other argument and only a list of strings` | `tests/adr-next-batch.test.mjs` | `--batch <dir>`, `--batch --json`, `--batch --help`, and input that is an object, a list holding a number, or not JSON: usage, exit 1, empty stdout; `--batch --version` prints the version; `--help` alone names `--batch` | — | S2 |
| `nothing but the reviewed caches is shared between queries` | `tests/adr-next-batch.test.mjs` | The enumeration finds the reviewed list and no more; with one name removed from the list it reports that function | — | S4 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the batch loop, driven by `tests/adr-next-batch.test.mjs` through the gate's own command line |
| 2 — something selects it | `entry()`'s test for `--batch`, and the file's last line calling `entry()`; without either the first test gets exit 1 and no frame |
| 3 — the caller can discover it | the usage text, checked by `a batch takes no other argument and only a list of strings` |
| 4 — it is used | T2's `work-next`; nothing else calls it |

## Mutation Log
- 2026-11-24 · e89b15663* · mutant killed · exit 1 · `plugin/bin/adr-next` · with no cache emptied between queries the second query keeps the first query failed git answer and skips its own parse · acceptance-sha256:17f6068f56f9e1a461eb2b9e09c87c8d4ec26be02695e44140de6bf13d23d659 · covers:the cache cleared between queries
- 2026-11-24 · e89b15663* · mutant killed · exit 1 · `plugin/bin/adr-next` · an unflushed frame is lost when the batch is killed at a later query · acceptance-sha256:17f6068f56f9e1a461eb2b9e09c87c8d4ec26be02695e44140de6bf13d23d659 · covers:the frame flushed per query
- 2026-11-24 · e89b15663* · mutant killed · exit 1 · `plugin/bin/adr-next` · an exit that is no integer is answered with a frame and the batch goes on · acceptance-sha256:17f6068f56f9e1a461eb2b9e09c87c8d4ec26be02695e44140de6bf13d23d659 · covers:the abnormal end that stops the batch
- 2026-11-24 · e89b15663* · mutant killed · exit 1 · `plugin/bin/adr-next` · every single call is taken for a batch and refused · acceptance-sha256:17f6068f56f9e1a461eb2b9e09c87c8d4ec26be02695e44140de6bf13d23d659 · covers:the single call left unchanged

## Invariants

- `adr-next <dir>`, `--json`, `--all`, corpus mode and `--version` print and exit as before; `tests/adr-next.test.mjs` is in the fence.
- record.py's caches are cleared only between queries, never while `main()` runs.
- A frame is one line, written only after its query's `main()` has ended with an integer status.

## Risks

- The git stand-ins model a failing and a hanging git, not a slow disk or a killed interpreter; T2's real-process tests and
  CI's Windows job meet the rest.
- Replacing `main` in a loaded module tests the loop's handling of an exit code, not a real exit inside the gate; the real
  abnormal end is met through the oversized task id.

## Stop Condition

Stop if any frame's status or parsed stdout differs from the single call on any fixture corpus and the cause is state other
than `_object_format`: that contradicts the audit ADR-145 rests on, and the record goes back to the owner. Stop if the mode
cannot be added without changing what `main()` does for a single call.

## Out of Scope

- `work-next`'s use of the mode, and the margins (T2).

## Verification Log
- 2026-11-24 · e89b15663* · exit 1 · `set -o pipefail …` · acceptance-sha256:17f6068f56f9e1a461eb2b9e09c87c8d4ec26be02695e44140de6bf13d23d659 · ms:2737 · test-lock-sha256:5f8ac0cdff729f945910cff9e12c388173a957e5f6967ee5d71f461908486942 · test-lock-file:docs/adr/locks/5f8ac0cdff729f945910cff9e12c388173a957e5f6967ee5d71f461908486942.lock
  ```
  --- last 10 line(s) of stdout (of 210 after folding 214 raw)
        at Test.runInAsyncScope (node:async_hooks:226:14)
        at Test.run (node:internal/test_runner/test:1402:25)
        at async Test.processPendingSubtests (node:internal/test_runner/test:974:7) {
      generatedMessage: false,
      code: 'ERR_ASSERTION',
      actual: 1,
      expected: 0,
      operator: 'strictEqual',
      diff: 'simple'
    }
  ```
- 2026-11-24 · e89b15663* · exit 0 · `set -o pipefail …` · acceptance-sha256:17f6068f56f9e1a461eb2b9e09c87c8d4ec26be02695e44140de6bf13d23d659 · ms:49240
- 2026-11-24 · e89b15663* · exit 0 · `set -o pipefail …` · acceptance-sha256:17f6068f56f9e1a461eb2b9e09c87c8d4ec26be02695e44140de6bf13d23d659 · ms:47897
- 2026-11-24 · e89b15663* · exit 0 · `set -o pipefail …` · acceptance-sha256:17f6068f56f9e1a461eb2b9e09c87c8d4ec26be02695e44140de6bf13d23d659 · ms:54053
- 2026-11-24 · e89b15663* · exit 0 · `set -o pipefail …` · acceptance-sha256:17f6068f56f9e1a461eb2b9e09c87c8d4ec26be02695e44140de6bf13d23d659 · ms:54549
- 2026-11-24 · e89b15663* · exit 0 · `adr-verify --relock --replace-hashes` · acceptance-sha256:17f6068f56f9e1a461eb2b9e09c87c8d4ec26be02695e44140de6bf13d23d659 · ms:11 · test-lock-sha256:cb91ce9e5ea6a3c2650c883003a3b7e320aec55d4f429e668ea06c64c0f693ea · test-lock-file:docs/adr/locks/cb91ce9e5ea6a3c2650c883003a3b7e320aec55d4f429e668ea06c64c0f693ea.lock · test-lock-kind:replace
