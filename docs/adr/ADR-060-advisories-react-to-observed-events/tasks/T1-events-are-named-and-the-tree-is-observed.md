# Task ADR-060-T1: Events are named and the tree is observed

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** M (multi-file)
**Owner:** unassigned
**Produces:** `observe(cwd)`, the state directory, the session event log and delivery; `tests/observed-events.test.mjs` (file exists)
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `the observation over a copied index and a temporary object directory`, `the five-second observation bound`, `the state directory outside git`, `the translate-observe-append loop`, `the first session.started being the baseline`, `Edit/Write events carrying their path and blob`, `an unavailable observation never matching`, `one delivered output per hook`, `each named test actually running`, `the regression suites that pin lifecycle.mjs`

## Goal

Every hook event appends its named internal event, with an observation of the working tree, index and HEAD (or a not-ok observation), to `sessions/<session_id>.jsonl` in the state directory: `<git-dir>/quality-harness/` in git (per worktree, from `git rev-parse --absolute-git-dir`), `<os.tmpdir()>/quality-harness/<sha256 of the canonical cwd>/` outside it. Edit/Write add `file.written` with path, observability and blob. Each hook delivers one output and records only what it delivered. Nothing reads command text.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/observed-events.test.mjs` | create | the three tests below |
| `plugin/scripts/lifecycle.mjs` | edit | `observe(cwd)`, `sameObservation`, `stateDir(cwd)`, the event table, the log and `deliver(actions)`; `handleHook` translates and observes after the reviewer deny; existing `emitJson` output goes through `deliver` |
| `tests/mutations.json` | edit | entries whose `from` lives in output code `deliver` replaces are repinned or retired |
| `plugin/hooks/hooks.json` | edit | the existing PostToolUse Edit/Write/MultiEdit/NotebookEdit block gains `lifecycle.mjs` beside its two shell hooks |

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
