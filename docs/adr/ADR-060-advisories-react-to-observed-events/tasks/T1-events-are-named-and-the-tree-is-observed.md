# Task ADR-060-T1: Events are named and the tree is observed

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** M (multi-file)
**Owner:** unassigned
**Produces:** `observe(cwd)`, the state directory, the session event log and delivery; `tests/observed-events.test.mjs` (file exists)
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `the observation over a copied index and a temporary object directory`, `the five-second observation bound`, `the state directory outside git`, `the per-worktree state directory`, `the translate-observe-append loop`, `the first session.started being the baseline`, `Edit/Write events carrying their path and blob`, `an unavailable observation never matching`, `one delivered output per hook`, `each named test actually running`, `the regression suites that pin lifecycle.mjs`

## Goal

Every hook event appends its named internal event, with an observation of the working tree, index and HEAD (or a not-ok observation), to `sessions/<session_id>.jsonl` in the state directory: `<git-dir>/quality-harness/` in git (per worktree, from `git rev-parse --absolute-git-dir`), `<os.tmpdir()>/quality-harness/<sha256 of the canonical cwd>/` outside it. Edit/Write add `file.written` with path, observability and blob. Each hook delivers one output and records only what it delivered. Nothing reads command text.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/observed-events.test.mjs` | create | the three tests below |
| `plugin/scripts/lifecycle.mjs` | edit | `observe(cwd)`, `sameObservation`, `stateDir(cwd)`, the event table, the log and `deliver(actions)`; `handleHook` translates and observes after the reviewer deny; existing `emitJson` output goes through `deliver` |
| `tests/mutations.json` | edit | entries whose `from` lives in output code `deliver` replaces are repinned or retired |
| `plugin/hooks/hooks.json` | edit | the existing PostToolUse Edit/Write/MultiEdit/NotebookEdit block gains `lifecycle.mjs` beside its two shell hooks |
| `tests/package.test.mjs` | edit | its manifest test required every PostToolUse hook to be `run-shell-hook.mjs`; it now also requires PostToolUse to reach `lifecycle.mjs`. Found by the selftest after the fence was green, a gap in this task's original file list |

## Ordered Steps

1. [S1] Write the three tests and see them fail on an assertion (TDD red).
2. [S2] Add `observe(cwd)` and `sameObservation(a, b)`:
   - resolve the index with `git rev-parse --git-path index` and the objects under `--git-common-dir`;
   - hash the tree (copied index, `add -A`, `write-tree`) and the index (copied index, `write-tree`), both under a temporary `GIT_OBJECT_DIRECTORY` with the repository objects as alternate;
   - read HEAD, and remove the temporaries;
   - bound the git calls together at 5 seconds;
   - return `{ok: false, reason}` on a timeout, any failure, or without git;
   - make `sameObservation` false whenever either side is not ok.
3. [S3] Add `stateDir(cwd)`, the event table and the log.
   - Append a `session.started` only when the log has none.
   - Add `file.written` with an absolute path; `observable: false` when the path is outside the repository or ignored, or git is absent; and `blob` from `git hash-object` when observable.
   - Call the loop in `handleHook` after the reviewer deny, and add `lifecycle.mjs` to the existing PostToolUse block.
4. [S4] Add `deliver(actions)`: a deny is delivered alone, otherwise advisories are joined in rule order into one output, and `action.emitted` is appended once per delivered action. Route the existing `emitJson` output through it.
5. [S5] Record the observation's wall time on a scratch clone of this repository in this task's sign-off. [proof: human: the recorded wall time on this repository's tree]
6. [S6] Run the fence green and record mutants:
   - never write the log;
   - append `session.started` on every SessionStart;
   - write objects into the repository;
   - hash the real index in place;
   - make `sameObservation` true for two not-ok observations;
   - put the state directory under `--git-common-dir`, so linked worktrees share one log;
   - deliver only the last action.

   [proof: mutation]

## Acceptance

```bash
set -o pipefail
out=$(node --test --test-reporter=tap --test-name-pattern '^(a turn end observes the tree without reading any command|observing writes nothing into the repository|one hook delivers every action it records)$' tests/observed-events.test.mjs 2>&1) \
  || { printf '%s\n' "$out"; exit 1; }
for name in 'a turn end observes the tree without reading any command' 'observing writes nothing into the repository' 'one hook delivers every action it records'; do printf '%s\n' "$out" | grep -qxE "ok [0-9]+ - $name" || { printf '%s\n' "$out"; echo "did not run: $name"; exit 1; }; done \
  && node --test tests/lifecycle.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a turn end observes the tree without reading any command` | `tests/observed-events.test.mjs` | Temp repository, driven through `lifecycle.mjs` as a process.<br>• SessionStart, a write, then Stop leave `session.started` and `turn.ended` with different trees; a compact SessionStart adds no `session.started`.<br>• An Edit outside the repository appends `file.written` with `observable: false` and no blob; one inside carries its blob.<br>• A linked worktree writes its log under its own `--absolute-git-dir`, not the main worktree's; outside git the log is in the temporary state directory.<br>• With git failing the observation is not ok; `sameObservation` is false for two not-ok observations and true for an ok observation with itself. | — | S1, S2, S3 |
| `observing writes nothing into the repository` | `tests/observed-events.test.mjs` | In a temp repository with one modified and one untracked file, the count under `.git/objects`, the index bytes and `git status --porcelain` are unchanged by `observe`, and two calls agree; outside git it is not ok | — | S1, S2 |
| `one hook delivers every action it records` | `tests/observed-events.test.mjs` | `deliver` with two advisories outputs both texts and appends two `action.emitted`; with a deny and an advisory it outputs only the deny and appends only its action; with none it outputs nothing and appends nothing | — | S1, S4 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the three tests |
| 2 — something selects it | `handleHook` calls the loop and `deliver`, and `hooks.json` routes Edit/Write; the tests drive the hooks as processes; S6's mutants remove or change each |
| 3 — the caller can discover it | n/a: no declared interface |
| 4 — it is used | T3–T6's rules read the log and deliver through it |

## Mutation Log
- 2026-09-17 · a3aedee* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · no event is ever appended, so the log a turn end should leave is empty · acceptance-sha256:48ab4cb2cef8dd3107490e15875bcde633b67d727bad2abba374fc2520fc5b7a · covers:the translate-observe-append loop
- 2026-09-17 · a3aedee* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · every SessionStart appends session.started, so a compact one resets the baseline · acceptance-sha256:48ab4cb2cef8dd3107490e15875bcde633b67d727bad2abba374fc2520fc5b7a · covers:the first session.started being the baseline
- 2026-09-17 · a3aedee* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · objects are written into the repository, so the object count changes · acceptance-sha256:48ab4cb2cef8dd3107490e15875bcde633b67d727bad2abba374fc2520fc5b7a · covers:the observation over a copied index and a temporary object directory
- 2026-09-17 · a3aedee* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · the real index is hashed and staged in place, so its bytes change · acceptance-sha256:48ab4cb2cef8dd3107490e15875bcde633b67d727bad2abba374fc2520fc5b7a · covers:the observation over a copied index and a temporary object directory
- 2026-09-17 · a3aedee* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · a zero bound makes every observation not ok, so the bound is what the hooks observe under · acceptance-sha256:48ab4cb2cef8dd3107490e15875bcde633b67d727bad2abba374fc2520fc5b7a · covers:the five-second observation bound
- 2026-09-17 · a3aedee* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · every directory outside git shares one state directory, so the plain log is not where its directory keys it · acceptance-sha256:48ab4cb2cef8dd3107490e15875bcde633b67d727bad2abba374fc2520fc5b7a · covers:the state directory outside git
- 2026-09-17 · a3aedee* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · the state directory is shared across worktrees, so a linked worktree logs into the main one · acceptance-sha256:48ab4cb2cef8dd3107490e15875bcde633b67d727bad2abba374fc2520fc5b7a · covers:the per-worktree state directory
- 2026-09-17 · a3aedee* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · a written file carries no blob, so its content cannot be matched later · acceptance-sha256:48ab4cb2cef8dd3107490e15875bcde633b67d727bad2abba374fc2520fc5b7a · covers:Edit/Write events carrying their path and blob
- 2026-09-17 · a3aedee* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · two not-ok observations compare equal, so an unavailable observation could satisfy a check · acceptance-sha256:48ab4cb2cef8dd3107490e15875bcde633b67d727bad2abba374fc2520fc5b7a · covers:an unavailable observation never matching
- 2026-09-17 · a3aedee* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · only the last advisory is delivered, so one finding overwrites another · acceptance-sha256:48ab4cb2cef8dd3107490e15875bcde633b67d727bad2abba374fc2520fc5b7a · covers:one delivered output per hook
- 2026-09-17 · a3aedee* · mutant killed · exit 1 · `tests/observed-events.test.mjs` · a renamed test selects nothing and the per-name ok grep must refuse it · acceptance-sha256:48ab4cb2cef8dd3107490e15875bcde633b67d727bad2abba374fc2520fc5b7a · covers:each named test actually running
- 2026-09-17 · a3aedee* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · handleHook stops after recording, so every existing advisory goes silent and the lifecycle suite fails · acceptance-sha256:48ab4cb2cef8dd3107490e15875bcde633b67d727bad2abba374fc2520fc5b7a · covers:the regression suites that pin lifecycle.mjs

## Invariants

- Existing advisories keep their text in this task; the log is additive.
- Every `tests/mutations.json` entry matches exactly once after this task.
- Observation never changes the repository's objects, index or status.
- A read-only role's deny is decided before any observation.

## Risks

- Hook latency on large repositories; S5 records the cost, and the 5-second bound turns a slow observation into a not-ok one.

## Stop Condition

Stop and ask if a hook payload lacks `session_id` or `cwd`, or if an Edit/Write PostToolUse payload lacks the file path.

## Out of Scope

- Rules and advisories (deferred: docs/adr/ADR-060-advisories-react-to-observed-events/tasks/T5-completion-rules-advise-once-per-rule-and-evidence.md)

## Verification Log
- 2026-09-17 · a3aedee* · exit 1 · `set -o pipefail …` · acceptance-sha256:48ab4cb2cef8dd3107490e15875bcde633b67d727bad2abba374fc2520fc5b7a · ms:107 · test-lock-sha256:4a69d00055cd79541cb7e2a173feda21ec7751632a5b3aabcd57800baf637993 · test-lock-b64:Y2hlY2sJZjdlMjUxYjUwM2NhZWZlY2JhMTEyMjFhZDJjYzIyMjc3MDYxNDA1NzNiZWEyMGQ2MWQ5OTg3ZGE3YjYwNTI1Ngpib2R5CXRlc3RzL29ic2VydmVkLWV2ZW50cy50ZXN0Lm1qcwlhIHR1cm4gZW5kIG9ic2VydmVzIHRoZSB0cmVlIHdpdGhvdXQgcmVhZGluZyBhbnkgY29tbWFuZAlkNzhkNDJjYzBmOGJhYzdhZmRiODFiYTc3YzUzOWQyZjRhZmM4ZWFkMWQ5NTcwNmNiZjJjNDNjYjE3ZTgzZmZhCmJvZHkJdGVzdHMvb2JzZXJ2ZWQtZXZlbnRzLnRlc3QubWpzCW9ic2VydmluZyB3cml0ZXMgbm90aGluZyBpbnRvIHRoZSByZXBvc2l0b3J5CWQ2NWUyZjQ2NzQzNzI0ODNmZmYwMzhkNGZlYmFlYTJkODJhYTczNDA0YTJkNWFmOWEyMTBlZDhiMDMxMmY2YmEKYm9keQl0ZXN0cy9vYnNlcnZlZC1ldmVudHMudGVzdC5tanMJb25lIGhvb2sgZGVsaXZlcnMgZXZlcnkgYWN0aW9uIGl0IHJlY29yZHMJNzhlZmE1NjhmMzFlOGE5MTRjN2RkNGQwZjI2YWY0ODM4MWU0OGMxZTNmYWUyYWM0YzU1NmY0MjgzNGZmNDQyZA
  ```
  --- last 10 line(s) of stdout (of 92 after folding 92 raw)
    ...
  1..3
  # tests 3
  # suites 0
  # pass 0
  # fail 3
  # cancelled 0
  # skipped 0
  # todo 0
  # duration_ms 48.865291
  ```
- 2026-09-17 · a3aedee* · exit 0 · `set -o pipefail …` · acceptance-sha256:48ab4cb2cef8dd3107490e15875bcde633b67d727bad2abba374fc2520fc5b7a · ms:26347
- 2026-09-17 · a3aedee* · exit 0 · `set -o pipefail …` · acceptance-sha256:48ab4cb2cef8dd3107490e15875bcde633b67d727bad2abba374fc2520fc5b7a · ms:25459
- 2026-09-17 · a3aedee* · exit 0 · `set -o pipefail …` · acceptance-sha256:48ab4cb2cef8dd3107490e15875bcde633b67d727bad2abba374fc2520fc5b7a · ms:25170
- 2026-09-17 · a3aedee* · exit 0 · `set -o pipefail …` · acceptance-sha256:48ab4cb2cef8dd3107490e15875bcde633b67d727bad2abba374fc2520fc5b7a · ms:25237
- 2026-09-17 · a3aedee* · exit 0 · `set -o pipefail …` · acceptance-sha256:48ab4cb2cef8dd3107490e15875bcde633b67d727bad2abba374fc2520fc5b7a · ms:25038
- 2026-09-17 · a3aedee* · exit 0 · `set -o pipefail …` · acceptance-sha256:48ab4cb2cef8dd3107490e15875bcde633b67d727bad2abba374fc2520fc5b7a · ms:25503
- 2026-09-17 · a3aedee* · exit 0 · `set -o pipefail …` · acceptance-sha256:48ab4cb2cef8dd3107490e15875bcde633b67d727bad2abba374fc2520fc5b7a · ms:25351
- 2026-09-17 · a3aedee* · exit 0 · `set -o pipefail …` · acceptance-sha256:48ab4cb2cef8dd3107490e15875bcde633b67d727bad2abba374fc2520fc5b7a · ms:25195
- 2026-09-17 · a3aedee* · exit 0 · `set -o pipefail …` · acceptance-sha256:48ab4cb2cef8dd3107490e15875bcde633b67d727bad2abba374fc2520fc5b7a · ms:25645
- 2026-09-17 · a3aedee* · exit 0 · `set -o pipefail …` · acceptance-sha256:48ab4cb2cef8dd3107490e15875bcde633b67d727bad2abba374fc2520fc5b7a · ms:25688
- 2026-09-17 · a3aedee* · exit 0 · `set -o pipefail …` · acceptance-sha256:48ab4cb2cef8dd3107490e15875bcde633b67d727bad2abba374fc2520fc5b7a · ms:25305
- 2026-09-17 · a3aedee* · exit 0 · `set -o pipefail …` · acceptance-sha256:48ab4cb2cef8dd3107490e15875bcde633b67d727bad2abba374fc2520fc5b7a · ms:25173
- 2026-09-17 · human-observed · 2026-09-17 observe() on a scratch clone of this repository (583 tracked files, one modified and one untracked file): 7 calls took 39-40 ms each, ok=true, load average 7.8 on 10 cores
