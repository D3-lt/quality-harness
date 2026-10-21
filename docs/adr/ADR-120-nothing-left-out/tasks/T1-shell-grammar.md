# Task ADR-120-T1: A shell grammar for the check classifier

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** L
**Owner:** Zy
**Produces:** the lexer's boundary fields; `parseShell(records)` in `plugin/scripts/shell-grammar.mjs` and `ParseShell` in `core/hooks/shellgrammar.go`; `listStatus` answering from the tree
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1

## Goal

A declared check is read through a grammar of lists, pipelines, groups, subshells and POSIX function definitions, so a check
whose exit status every POSIX shell fixes is refused whatever its grouping, and one whose status depends on the shell is not,
in Node and Go alike.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/shell-grammar.test.mjs` | create | the constant rows, their real twins, the bash-only and shadowing rows, each measured first (0 locks: new) |
| `plugin/scripts/shell-words.mjs` | edit | additive record fields: where a group, subshell or definition opens and closes, and whether the text closed every construct (`:54`, `:66-80`, `:103-107`); every existing field keeps its value |
| `core/hooks/shellwords.go` | edit | the same (`:149-224`) |
| `plugin/scripts/shell-grammar.mjs` | create | the recursive-descent parser over the records |
| `core/hooks/shellgrammar.go` | create | its Go twin |
| `plugin/scripts/check-command.mjs` | edit | `listStatus` (:185-220) evaluates the tree; `constantSuccessCheck` keeps its signature; the fixed-status lookup (:152, :231) honours shadowing |
| `core/hooks/checkcmd.go` | edit | the same at :250-333 |
| `tests/qh-core-parity.test.mjs` | edit | `nodeRow` (:84-100) gains the new fields and the tree's shape; ADR-119's 9 locks stay byte-identical, so the new comparison is a new test beside them |
| `core/hooks/parity_test.go` | edit | the Go side (0 locks) |
| `tests/fail-open.test.mjs` | read | 65 locks; every locked row keeps its answer, except `function f() { false; } && true`, which a relock moves from constant to could-not-look with the reason "exits 2 under dash, which /bin/sh is on Debian and Ubuntu (ADR-120 T1)" if a locked body asserts it |
| `tests/shell-words.test.mjs` | read | 7 locks; unchanged, since the new fields are additive |
| `tests/mutations/plugin/scripts/shell-words.mjs.json`, `tests/mutations/plugin/scripts/check-command.mjs.json`, `tests/mutations/plugin/scripts/shell-grammar.mjs.json` | edit / create | repoint the entries whose `from` moved; one entry per new mechanism |
| `docs/architecture.md` | edit | the module map gains both new modules |

## Ordered Steps

1. [S1] Measure each row under `/bin/bash`, `/bin/sh` and `/bin/dash` (`<shell> -c '<cmd>' </dev/null; echo $?`, with `npm test` stood in by `false` and by `true`), then write the failing tests and record the red run. Constant under all three (refused): `true || { true; false; }`, `! { true; false; }`, `! { npm test; false; }`, `f() { false; } && true`, `{ false & } || false`, `true || true | { cat; false; }`, `false() { :; }; false`. Real twins (can fail, accepted): `true && { true; false; }`, `! { true; npm test; }`, `{ npm test; } && true`, `{ npm test; } || false`, `true() { false; }; true`. Bash-only, could-not-look and accepted: `function f() { false; } && true`, `function f { false; } || false`, `function f { :; }; npm test`. Unclosed, could-not-look: `{ npm test;`.
2. [S2] Add the boundary fields to both lexers, and a test that every existing field of every harvested literal is unchanged.
3. [S3] Write `parseShell`: lists (`;`, `&&`, `||`, `&`, newline), pipelines (`|`, `|&`, a leading `!`), simple commands, `{ }` groups, `( )` subshells and `f()` definitions, each node naming its record span; the `function` keyword and anything unclosed are `null`.
4. [S4] Evaluate status on the tree in `listStatus`: a list short-circuits by its joiners; a pipeline is its last stage's status (a pass-through sink 0); `!` inverts, a doubled `!` is unknown; a group or subshell is its body; a definition is 0 and binds its name, so a later call of that name has the body's status, or unknown when the body's is not fixed; `&` is 0. Keep today's could-not-look rules (redirects, `LIST_CONTROL`) and `sh -c` recursion.
5. [S5] Port S3 and S4 to Go and add the parity comparison of fields and tree.
6. [S6] Repoint the catalogue entries whose `from` moved, add one per new mechanism, and run `node scripts/mutate.mjs --case` over `shell-words.mjs`, `check-command.mjs` and `shell-grammar.mjs`: every entry RED. [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/shell-grammar.test.mjs tests/fail-open.test.mjs tests/shell-words.test.mjs tests/qh-core-parity.test.mjs 2>&1) \
  && for n in "a check whose status every POSIX shell fixes is refused, whatever its grouping" \
      "each refused grouping has a twin that can fail, and it is accepted" \
      "bash-only syntax and unclosed text are could-not-look, never constant" \
      "a definition that shadows a command gives its later calls the body's status" \
      "the lexer's new boundary fields leave every existing field unchanged" \
      "the Go core reads the same fields and tree as the Node classifier"; do
    test "$(printf '%s\n' "$out" | sed -n 's/^ok [0-9][0-9]* - //p' | grep -cxF -- "$n")" = 1 || exit 1
  done \
  && (cd core && go test ./hooks/)
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a check whose status every POSIX shell fixes is refused, whatever its grouping` | `tests/shell-grammar.test.mjs` | the seven constant rows of S1 | — | S1, S3, S4 |
| `each refused grouping has a twin that can fail, and it is accepted` | `tests/shell-grammar.test.mjs` | the real twins of S1 | — | S1, S4 |
| `bash-only syntax and unclosed text are could-not-look, never constant` | `tests/shell-grammar.test.mjs` | the `function` rows and `{ npm test;` | — | S1, S3 |
| `a definition that shadows a command gives its later calls the body's status` | `tests/shell-grammar.test.mjs` | `false() { :; }; false` refused (body 0); `true() { false; }; true` accepted (body 1); `f() { npm test; }; f` accepted (body unknown) | — | S1, S4 |
| `the lexer's new boundary fields leave every existing field unchanged` | `tests/shell-grammar.test.mjs` | the additive contract | — | S2 |
| `the Go core reads the same fields and tree as the Node classifier` | `tests/qh-core-parity.test.mjs` | parity of fields, tree and outcome | — | S5 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the new tests |
| 2 — something selects it | `listStatus` calls `parseShell`; the mutants on that call |
| 3 — the caller can discover it | `fastCheckCommand` and `checkCommandOrigin`, unchanged in signature |
| 4 — it is used | every declared check; the Go core on every hook |

## Mutation Log

## Invariants

- Every existing field of a `shellWords()` record keeps its value; the 7 locks of `tests/shell-words.test.mjs` are unchanged.
- Every locked row of `tests/fail-open.test.mjs` keeps its answer, except a bash-only row relocked with its reason.

## Risks

- A form a POSIX shell runs differently from the grammar's reading: every row is measured under three shells before it is written (CLAUDE.md §16).

## Stop Condition

Stop if a row's exit differs between `/bin/sh` and `/bin/dash` in a way S1's dialect rule does not cover: which shell the check
runs under then needs the owner.

## Out of Scope

- The publish readers' use of the tree (permanent: boundary: ADR-120 T2 does it, in this same record)

## Verification Log
