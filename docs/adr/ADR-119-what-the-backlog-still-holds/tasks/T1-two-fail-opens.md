# Task ADR-119-T1: Two fail-opens: a pipe after a group, and an UNPROVEN test demoted for a done claim in a task file

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** M
**Owner:** Zy
**Produces:** `shellWords()` carrying `|` and `|&` after a group
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1

## Goal

`{ false; } | cat` and `{ false; } |& cat` are no longer accepted as real checks, in Node and Go, and a task whose own file
says done (while the README does not) no longer has its UNPROVEN test evidence demoted to advice by `unproven_test`
(`plugin/bin/adr-lint:4982-5004`) at `check_tests_exist` and `check_tests_can_fail`.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/fail-open.test.mjs` | edit | a new test beside the unlocked `the operator after a group joins the group` (:669-683); its literals reach the Go parity corpus because the file calls `constantSuccessCheck` |
| `plugin/scripts/shell-words.mjs` | edit | :96 carries `\|` and `\|&` after a closed group, as it carries `&`, `&&` and `\|\|` |
| `core/hooks/shellwords.go` | edit | :205, the same two operators (ADR-110 parity) |
| `tests/gates.test.mjs` | edit | a new test beside the item-6 tests near :1962; run `scripts/test-locks.py` first, and no locked body changes |
| `plugin/bin/adr-lint` | edit | :5027 (`check_tests_exist`) and :5817 (`check_tests_can_fail`) read `set(claimed_done_ids(readme_text, infos))`; that set reaches only `unproven_test`'s `done` argument (:5047, :5051, :5126, :5141, :5852), which decides error or advice at :4997 |
| `tests/mutations/plugin/scripts/shell-words.mjs.json`, `tests/mutations/plugin/bin/adr-lint.json` | edit | one catalogue entry per mechanism |

## Ordered Steps

1. [S1] Write the two new tests and record the red run. The shell rows, as plain string literals (the parity collector skips an interpolated template literal, `tests/qh-core-parity.test.mjs:62`): `{ false; } | cat`, `{ true; } | cat` and `{ false; } |& cat` read as constant success, and `{ npm test; } | cat` is refused too; the real-check twins `{ true; } | npm test` and `{ true; } |& npm test` stay accepted. The adr-lint rows, for a task whose own file says done while the README does not: an unreadable test source (not UTF-8) under `check_tests_exist`, and a test whose body the lexer cannot bound under `check_tests_can_fail`, each drawing the UNPROVEN error; the twin is a `blocked` task with exit-0 evidence in those same two cases, which still draws the UNPROVEN advice. A missing test and a test with no failure path are not the defect: those block at `:5161` and `:5898` whatever the done set is.
2. [S2] In `shell-words.mjs:96` and `shellwords.go:205`, add `|` and `|&` to the operators a closed group's empty command passes to the group's last command, so the group joins the pipeline and `check-command.mjs:198` sees the sink (`PIPED` at `check-command.mjs:173` already holds both).
3. [S3] At `adr-lint:5027` and `:5817`, replace `set(done_task_ids(readme_text))` with `set(claimed_done_ids(readme_text, infos))`, so `unproven_test` is told the task is done. Leave `evidenced_task_ids` (:3229) as it is: it is the set the loops visit, and its `blocked` case is the twin.
4. [S4] Run `tests/qh-core-parity.test.mjs` with Go installed, so the new literals are answered by both lexers with 0 disagreements. [proof: acceptance]
5. [S5] Record a killed mutant for the `|` rule in `shell-words.mjs` and for each adr-lint site, with a catalogue entry each. The Go rule is shown RED by hand against a scratch build, since `mutate.mjs` cannot run a Go fence (ADR-110 Follow-ups). [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/fail-open.test.mjs tests/gates.test.mjs tests/qh-core-parity.test.mjs 2>&1) \
  && for n in "a pipe or a pipe-and-stderr after a group joins the pipeline, so a sink after it cannot fail" \
      "the operator after a group joins the group" \
      "an unproven test of a task done only in its own file is an error at both done loops" \
      "the Go classifier answers every literal of the classifier's own tests as the Node one does"; do
    test "$(printf '%s\n' "$out" | sed -n 's/^ok [0-9][0-9]* - //p' | grep -cxF -- "$n")" = 1 || exit 1
  done
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a pipe or a pipe-and-stderr after a group joins the pipeline, so a sink after it cannot fail` | `tests/fail-open.test.mjs` | `{ false; } \| cat`, `{ true; } \| cat`, `{ false; } \|& cat` and `{ npm test; } \| cat` are refused; `{ true; } \| npm test` and `{ true; } \|& npm test` stay real checks | — | S1, S2 |
| `the operator after a group joins the group` | `tests/fail-open.test.mjs` | the existing `&`, `&&`, `\|\|` rows still hold | — | S2 |
| `an unproven test of a task done only in its own file is an error at both done loops` | `tests/gates.test.mjs` | done only in its own file: an unreadable source (`check_tests_exist`) and an unbounded body (`check_tests_can_fail`) are UNPROVEN errors; a `blocked` task with exit-0 evidence in the same two cases is UNPROVEN advice | — | S1, S3 |
| `the Go classifier answers every literal of the classifier's own tests as the Node one does` | `tests/qh-core-parity.test.mjs` | the new rows, answered by the Go lexer, with 0 disagreements | — | S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the new tests |
| 2 — something selects it | `constantSuccessCheck` reads `shellWords()` through `check-command.mjs:198`; adr-lint's `main` calls both loops; the mutants that remove each change |
| 3 — the caller can discover it | n/a: no declared interface changes |
| 4 — it is used | every declared check qh-check accepts, and every adr-lint run over a corpus |

## Mutation Log

## Invariants

- `! { npm test; false; }` is not changed (the owner's grammar decision, 2026-10-15).
- The existing `&`, `&&` and `||` rows read as before, and a body that ends in `&` keeps it.
- A not-done task with exit-0 evidence (`blocked`) still gets UNPROVEN advice, not the error; a missing test and a test with no failure path still block as before.

## Risks

- `|` after a group could change how `publish-command.mjs` reads a publish inside a piped group. The parity test and `tests/publish-command.test.mjs` run in the selftest; a changed verdict there is a regression to read before landing.

## Stop Condition

Stop if `{ npm test; } | cat` cannot be refused without refusing `{ true; } | npm test`: the sink rule would then need a grammar, which is the owner's decision.

## Out of Scope

- `! { …; }` with several commands (deferred: docs/BACKLOG.md §381)

## Verification Log
