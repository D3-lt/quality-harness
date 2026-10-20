# Task ADR-119-T3: Three false stops and refusals

**Depends-on:** T1
**Covers:** none — no spec
**Estimated scope:** M
**Owner:** Zy
**Produces:** none
**Consumes:** `shellWords()` carrying `|` and `|&` after a group (T1)
**Data dependency:** needs a Bash-tool subprocess of a main Claude Code session, for S4's measurement only; the fence is hermetic
**Proof map:** v1

## Goal

adr-next stops reading a hyphenated name, a quoted stop word or a hook name as a verdict; ADR-104's refusal no longer holds
for a literal repeated as data; and an older adr-verify's row is no longer refused without saying why.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/adr-next.test.mjs` | edit | a new test beside :653-671 (0 locks), each pass row with a must-still-stop row |
| `plugin/bin/adr-next` | edit | `NEUTRALISED` (:209-229), `neutralise` (:260), `ABSENT_FAILURE` (:290-292) |
| `tests/foreign-commit.test.mjs` | edit | a new test beside the 14 ADR-104 T3 locks, whose bodies stay byte-identical; and the module-level session helper `said` (:55-62, outside every locked body), which spawns `lifecycle.mjs` directly (:56), routes through the hook the `QUALITY_HARNESS_HOOK_IMPL` seam names, as `tests/hook-golden.mjs:18` does |
| `tests/hook-golden.mjs` | edit | only if the helper needs the seam: `IMPL` and `QH_BIN` (:18-19) are module-private, and `runHook` (:90) takes the implementation as an argument |
| `plugin/scripts/publish-command.mjs` | edit | `take` (:223-228) verifies each occurrence's slot by re-lexing, as `maskedMessages` does |
| `core/hooks/publishcmd.go` | edit | :358-363, the same rule (ADR-110 parity) |
| `tests/log-receipts.test.mjs` | edit | a new test beside the one ADR-117 T2 lock, whose body stays byte-identical |
| `plugin/bin/adr-lint` | edit | the receipt refusal (:2733-2737) adds a sentence; the phrase `no adr-verify receipt names it`, which the locked test matches (`tests/log-receipts.test.mjs:47`), is kept verbatim |
| `tests/standalone-link.test.mjs` | edit | the `RESOLVER` order, only if S4 measures `CLAUDE_PLUGIN_ROOT` present (0 locks) |
| `plugin/scripts/standalone-link.mjs` | edit | the `RESOLVER` (:74-91) prefers `CLAUDE_PLUGIN_ROOT` when set and holding `bin/`, in `qh-root`'s order (:86-88); only if S4 measures it present |
| `tests/mutations/plugin/bin/adr-next.json`, `tests/mutations/plugin/scripts/publish-command.mjs.json`, `tests/mutations/plugin/bin/adr-lint.json`, `tests/mutations/plugin/scripts/standalone-link.mjs.json` | edit | one catalogue entry per mechanism |

## Ordered Steps

1. [S1] Write the failing tests and record the red run. adr-next: `approved: no canary-failed code was raised`, `restated without the stop word` and `fires SessionStart and Stop` read done, while `failed-on-ios18`, `the patch did fail to pass review` and `fail-to-pass, then the run failed` still stop. ADR-104: `echo 'let x=1'; echo 'let x=1'` after a literal-path commit is advised, while the three fail-open spellings in §381's progress line (a body repeated as an arithmetic command, the ANSI-C `$'…'` split, the `<<-` tabs) still refuse. Write the ADR-104 rows as plain string literals: the parity collector skips an interpolated template literal (`tests/qh-core-parity.test.mjs:62`). Receipts: a row with no receipt, from a task none of whose rows any receipt names, is refused with the sentence that its writer may predate receipts (3.8.48).
2. [S2] In adr-next, neutralise a hyphenated compound used as a name, a quoted or mentioned stop word, and a hook name (`SessionStart`, `Stop`, `PreToolUse`, `PostToolUse`, `UserPromptSubmit`, `SubagentStart`), each by its whole token, so that the must-still-stop rows keep their stop.
3. [S3] In `publish-command.mjs` and `publishcmd.go`, replace the once-only rule with a per-occurrence check: mask one occurrence at a time, re-lex, and keep the mask only when that occurrence stands as data.
4. [S7] Route `tests/foreign-commit.test.mjs`'s session helper through the implementation seam: under `QUALITY_HARNESS_HOOK_IMPL=go` it spawns the built `core/bin/qh hook <event>` (or `QUALITY_HARNESS_QH_BIN`), as `runHook` in `tests/hook-golden.mjs` does, and otherwise `lifecycle.mjs` as now. Today the variable selects nothing in that file, so a Go run of it is a second Node run. This is a helper change outside the 14 locked bodies: their bytes stay the same, and under the seam they run against Go as well. If the seam has to be exported from `tests/hook-golden.mjs`, that file changes too; no locked body does. The new ADR-104 test, and a test that the helper ran the hook the seam names, must pass in the Go run.
5. [S4] Measure whether a Bash-tool subprocess of a main session has `CLAUDE_PLUGIN_ROOT` (`printenv CLAUDE_PLUGIN_ROOT`, its exit code and the session shape written into this task). Measured 2026-10-20 in a subagent's Bash call in a worktree: unset (exit 1). One session shape is not the class, so the measurement in a main session decides. If it is set there, the `RESOLVER` prefers it in `qh-root`'s order, with its test; if it is not, say so here and do the wording change of S5 only, removing the `RESOLVER` row from the Tests table and the fence before the red run. [proof: human: the owner reads the recorded measurement and the session shape it was taken in]
6. [S5] At `adr-lint:2733-2737`, when no receipt names any row of the task, add that the row's writer may predate receipts (3.8.48) and that updating the installed plugin is the remedy. The plan's wording, "the row carries no receipt field", does not match the code: a row carries no receipt field, and receipts live in the state directory's `receipts.jsonl` (`plugin/bin/adr-verify:822`), so the observable is the task's rows having no receipt at all.
7. [S6] Record a killed mutant per mechanism: each adr-next form, the per-occurrence check, the receipt sentence and, if built, the resolver order, with a catalogue entry each. The Go rule is shown RED by hand against a scratch build, through the routed helper. [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/adr-next.test.mjs tests/foreign-commit.test.mjs tests/log-receipts.test.mjs tests/standalone-link.test.mjs tests/qh-core-parity.test.mjs 2>&1) \
  && for n in "a hyphenated name, a quoted stop word and a hook name are not verdicts, and a stop beside them still stops" \
      "a literal repeated as data keeps no refusal, and the three code-again spellings still refuse" \
      "a row from a task no receipt names says its writer may predate receipts" \
      "the forwarder prefers the plugin root the session runs when it holds the gate" \
      "the Go classifier answers every literal of the classifier's own tests as the Node one does"; do
    test "$(printf '%s\n' "$out" | sed -n 's/^ok [0-9][0-9]* - //p' | grep -cxF -- "$n")" = 1 || exit 1
  done \
  && go build -C core -o bin/qh ./cmd/qh \
  && gout=$(QUALITY_HARNESS_HOOK_IMPL=go node --test --test-reporter=tap tests/foreign-commit.test.mjs 2>&1) \
  && for n in "a literal repeated as data keeps no refusal, and the three code-again spellings still refuse" \
      "the session helper runs the hook the implementation seam names"; do
    test "$(printf '%s\n' "$gout" | sed -n 's/^ok [0-9][0-9]* - //p' | grep -cxF -- "$n")" = 1 || exit 1
  done
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a hyphenated name, a quoted stop word and a hook name are not verdicts, and a stop beside them still stops` | `tests/adr-next.test.mjs` | the three false stops pass; `failed-on-ios18`, `the patch did fail to pass review`, `fail-to-pass, then the run failed` still stop | — | S1, S2 |
| `a literal repeated as data keeps no refusal, and the three code-again spellings still refuse` | `tests/foreign-commit.test.mjs` | `echo 'let x=1'; echo 'let x=1'` is advised; the repeated arithmetic body, the ANSI-C split and the `<<-` tabs refuse | — | S1, S3 |
| `the session helper runs the hook the implementation seam names` | `tests/foreign-commit.test.mjs` | under `QUALITY_HARNESS_HOOK_IMPL=go` the helper spawned the Go binary, and otherwise `lifecycle.mjs`; the Go run of the file is a Go run | — | S7 |
| `a row from a task no receipt names says its writer may predate receipts` | `tests/log-receipts.test.mjs` | the added sentence, with the locked phrase kept | — | S1, S5 |
| `the forwarder prefers the plugin root the session runs when it holds the gate` | `tests/standalone-link.test.mjs` | `CLAUDE_PLUGIN_ROOT` with `bin/` wins; one without `bin/` falls back to the newest cache entry | — | S4 |
| `the Go classifier answers every literal of the classifier's own tests as the Node one does` | `tests/qh-core-parity.test.mjs` | the new rows through the Go core, 0 disagreements | — | S3 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the new tests |
| 2 — something selects it | `human_stop` reads `neutralise`; `foreignCommitPath` calls `take`; adr-lint's receipt check; the forwarder runs the `RESOLVER`; the mutants on each |
| 3 — the caller can discover it | the refusal's own text |
| 4 — it is used | every sign-off adr-next reads, every literal-path commit PreToolUse sees |

## Mutation Log

## Invariants

- Every stop row that stood before still stops: loosening is the fail-open direction (BACKLOG §383).
- The three fail-open spellings §381's progress line recorded still refuse, in Node and Go.
- `tests/log-receipts.test.mjs`'s locked body and its `no adr-verify receipt names it` match are unchanged.
- Under `QUALITY_HARNESS_HOOK_IMPL=go`, every test in `tests/foreign-commit.test.mjs` runs the Go hook; without it, the Node hook, as before.

## Risks

- A hook-name rule could blank a real stop whose subject is a hook ("Stop failed"). It is a must-still-stop row in S1.

## Stop Condition

Stop if a pass row and its must-still-stop twin cannot be told apart by text: the rule would then rest on a guess, and the
owner decides which direction to leave open.

## Out of Scope

- The mention arm's over-match and the other §383 bullets (deferred: docs/BACKLOG.md §383)

## Verification Log
