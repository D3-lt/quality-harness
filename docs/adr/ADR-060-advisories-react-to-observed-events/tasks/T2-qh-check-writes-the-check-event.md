# Task ADR-060-T2: qh-check writes the check event

**Depends-on:** T1
**Covers:** none — no spec
**Estimated scope:** M (multi-file)
**Owner:** unassigned
**Produces:** `checks.jsonl` written by `qh-check`
**Consumes:** `observe(cwd)`, the state directory, the session event log and delivery (T1); `tests/observed-events.test.mjs` (file exists) (T1)
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `qh-check recording the observation before and after`, `the import order`, `a zero-test reading independent of the command's spelling`, `unstarted and timeout kept from the verdict`, `the kept output tail`, `the loop importing unseen records`, `the shipped-gate conventions`, `each named test actually running`

## Goal

`qh-check` runs the project's check at the repository root. It appends `{before, after, exit, signal, command, origin, verdict, at}` to `checks.jsonl` in the state directory and exits with the check's code. The loop turns each unseen record into exactly one event, in the order ADR-060's Decision gives: `check.unstarted`, `check.timeout`, `check.failed`, `check.unproven`, `check.no-work`, `check.passed`.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/observed-events.test.mjs` | edit | the test below |
| `plugin/scripts/qh-check.mjs` | add | resolve root and check, observe, run, record |
| `plugin/bin/qh-check` | add | Python bin that answers `--version` and execs `node plugin/scripts/qh-check.mjs` |
| `plugin/bin/qh-check.cmd` | add | the Windows shim, as the other bins have |
| `plugin/scripts/lifecycle.mjs` | edit | `validationVerdict` can read zero-test output without the spelling test; the loop imports unseen check records |
| `tests/mutations.json` | edit | the catalogue entry every shipped bin needs |
| `README.md` | edit | names the new gate, as every shipped gate is named |
| `plugin/scripts/standalone-link.mjs` | edit | only if its gate forwarder list is not derived from `plugin/bin` |

## Ordered Steps

1. [S1] Write the test and see it fail on an assertion (TDD red).
2. [S2] Add `qh-check.mjs`:
   - resolve the root (the canonical `cwd` outside git) and `projectCheckCommand` with `checkCommandOrigin`; with no command, say so and exit 2;
   - observe, run the command at the root with streamed output, keep the last 64 KiB, forward SIGINT and SIGTERM, and observe again;
   - record `validationVerdict`'s reading of the kept output and exit status, with the zero-test reading independent of the command's spelling;
   - append the record and exit with the command's code (1 with the signal recorded when killed).

   Add the Python bin with `--version` and the `.cmd` shim.
3. [S3] Import unseen records as exactly one event each, the first that applies:
   - verdict `unstarted` is `check.unstarted`;
   - verdict `timeout`, or a recorded signal, is `check.timeout`;
   - a non-zero exit is `check.failed`;
   - differing `before` and `after` trees, or a not-ok observation, is `check.unproven`;
   - verdict `no-work` is `check.no-work`;
   - anything else is `check.passed`.
4. [S4] Add the catalogue entry and the README line; `tests/gates.test.mjs` and `tests/package.test.mjs` pass. [proof: acceptance]
5. [S5] Run the fence green and record mutants:
   - record the after-observation as `before`;
   - import a tree-changing pass as passed;
   - read zero-test output only for recognised test commands;
   - import exit 127 as `check.failed`;
   - keep the first 64 KiB instead of the last;
   - never import.

   [proof: mutation]

## Acceptance

```bash
set -o pipefail
out=$(node --test --test-reporter=tap --test-name-pattern '^(a check event is written by qh-check)$' tests/observed-events.test.mjs 2>&1) \
  || { printf '%s\n' "$out"; exit 1; }
for name in 'a check event is written by qh-check'; do printf '%s\n' "$out" | grep -qxE "ok [0-9]+ - $name" || { printf '%s\n' "$out"; echo "did not run: $name"; exit 1; }; done \
  && node --test tests/gates.test.mjs tests/package.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a check event is written by qh-check` | `tests/observed-events.test.mjs` | Temp repository, `qh-check` run from a subdirectory with a declared `check` of `sh check.sh`.<br>• Exit 0 imports `check.passed`; exit 1 imports `check.failed` and `qh-check` exits 1; creating a file imports `check.unproven`.<br>• A zero-test summary with exit 0 imports `check.no-work`, including after 100 KiB of earlier output.<br>• A missing command inside the script (exit 127) imports `check.unstarted`; `exit 124` imports `check.timeout`; SIGTERM to `qh-check` imports `check.timeout` with the signal.<br>• No check exits 2 and records nothing.<br>• Outside git the record lands in the temporary state directory.<br>• Records carry `origin`. | — | S1, S2, S3 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the test |
| 2 — something selects it | the test runs `plugin/bin/qh-check` as a process and imports through a hook; S5's mutants break each |
| 3 — the caller can discover it | `tests/gates.test.mjs` requires `--version` from every bin; T5 names it in guidance and messages |
| 4 — it is used | T4's and T5's rules read check events |

## Mutation Log

## Invariants

- `qh-check`'s exit code is the check's exit code.
- `qh-check` writes only to the state directory.

## Risks

- A check that writes build output into the tree never passes; `check.unproven` makes that visible, so the project can gitignore the output.

## Stop Condition

Stop and ask if a bin cannot exec `node` on the Windows CI runner.

## Out of Scope

- Sharding or caching a check's result (permanent: boundary: `qh-check` records what one run observed)

## Verification Log
