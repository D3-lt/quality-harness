# Task ADR-120-T2: The publish readers read the bytes a group prints

**Depends-on:** T1
**Covers:** none — no spec
**Estimated scope:** M
**Owner:** Zy
**Produces:** `stdinScripts` and `xargsInvocations` reading a group's stdout bytes
**Consumes:** `parseShell(records)` (T1), the lexer's boundary fields (T1)
**Data dependency:** hermetic
**Proof map:** v1

## Goal

What a group of several commands pipes to a shell or to xargs is read as the exact bytes its supported printers write to
stdout, in order; a group holding anything else stays could-not-look; a nested group keeps its own boundary. BACKLOG §393's
fail-open and two false refusals close, and no new silence opens.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/publish-group.test.mjs` | create | the §393 rows, the byte rows and their twins (0 locks: new; `tests/publish-command.test.mjs` holds 296 locks and is not touched) |
| `plugin/scripts/shell-words.mjs`, `core/hooks/shellwords.go` | edit | additive: each redirection's source descriptor, operator and target, in order; today `shell-words.mjs:221` drops the descriptor and `:241` leaves duplications out of `writes` (Go `:438`, `:465`), so `>&2` and `2>&1` lex alike |
| `plugin/scripts/publish-command.mjs` | edit | a stdout renderer for `echo` and `printf` beside `literalOutput` (:785-787); `stdinScripts` (:795-811) and `xargsInvocations` (:658-683) take a group's bytes from the tree |
| `core/hooks/publishcmd.go` | edit | the same at :1256, :1272-1309 and :1009-1053 |
| `tests/mutations/plugin/scripts/publish-command.mjs.json` | edit | one entry per mechanism; repoint `:1769` if it moved |

## Ordered Steps

1. [S1] Measure each shell row by running its stdout into `sh` with a `git` stub function, in a temporary directory, under `/bin/sh` and `/bin/dash`, then write the failing tests and record the red run. A publish: `{ echo hi; echo 'git push'; } | sh`, `{ printf %s '#'; printf '%s\n' x; echo 'git push'; } | sh`, `{ printf %s '#' >&2; printf 'git p%s\n' ush; } | sh`, `{ echo 'git push'; } | sh`. Not a publish: `{ echo hi; } | sh`, `{ printf %s '#'; echo 'git push'; } | sh` (one line, a comment), `{ printf %s '#' 2>&1; printf 'git p%s\n' ush; } | sh` (stdout unchanged, so one commented line), `{ { printf %s '#'; echo 'git push'; } | sh; echo MARK; } | cat`, `{ printf %s '#'; echo push; } | xargs git`. Could-not-look: `{ echo '#' || echo 'git push'; } | sh`, `{ echo -e 'git\x20push'; } | sh`, `{ cat f; } | sh`, a printer redirected to a descriptor other than 1 or 2.
2. [S2] Keep each redirection's descriptor, operator and target in both lexers (additive), then write the renderer: `echo` with literal arguments and no option or backslash is the arguments joined by a space and a newline; `printf` with a literal format whose conversions are only `%s` and whose escapes are only `\n` and `\t` is the format applied to its literal arguments, repeated as printf repeats it; a printer whose stdout goes elsewhere (`>&2`, `>file`, `1>&2`) writes nothing to the pipe, one with only another descriptor joined to stdout (`2>&1`) writes as usual, and any other redirection is could-not-look; anything else returns could-not-look.
3. [S3] Give `stdinScripts` a group's bytes, and could-not-look for a group holding a joiner, a background, a substitution or any other command.
4. [S4] Give `xargsInvocations` the same upstream, so a group's last command is no longer trusted alone.
5. [S5] Port S2–S4 to Go; the parity test harvests the new rows. [proof: acceptance]
6. [S6] Record a killed mutant per mechanism, with catalogue entries, and run `node scripts/mutate.mjs --case publish-command`. [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/publish-group.test.mjs tests/qh-core-parity.test.mjs 2>&1) \
  && for n in "a group piped to a shell is read through the bytes it prints" \
      "a redirected or conditional printer is never summed into the pipe" \
      "a nested group keeps its own boundary" \
      "xargs reads a group's bytes, not its last command"; do
    test "$(printf '%s\n' "$out" | sed -n 's/^ok [0-9][0-9]* - //p' | grep -cxF -- "$n")" = 1 || exit 1
  done \
  && (cd core && go test ./hooks/)
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a group piped to a shell is read through the bytes it prints` | `tests/publish-group.test.mjs` | the fail-open closes; the newline and comment rows | — | S1, S2, S3 |
| `a redirected or conditional printer is never summed into the pipe` | `tests/publish-group.test.mjs` | the `>&2` row is a publish and its `2>&1` twin is not; the `\|\|` and `echo -e` rows are could-not-look | — | S1, S2, S3 |
| `a nested group keeps its own boundary` | `tests/publish-group.test.mjs` | the nested-group false refusal goes | — | S1, S3 |
| `xargs reads a group's bytes, not its last command` | `tests/publish-group.test.mjs` | `{ printf %s '#'; echo push; } \| xargs git` is not `git push` | — | S1, S4 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the new tests |
| 2 — something selects it | `publishInCommand` calls both readers (:844, :889) |
| 3 — the caller can discover it | the publish refusal (ADR-061) on every Bash command |
| 4 — it is used | the PreToolUse hook, Node and Go |

## Mutation Log

## Invariants

- Every row of `tests/publish-command.test.mjs` keeps its answer.
- A group the renderer cannot render is could-not-look, never "not a publish".

## Risks

- Summing too much clears a real publish: the stderr row and the single-command row stay publishes in both languages.

## Stop Condition

Stop if a row's stub-git run disagrees with the reading S1 states: the row is wrong, and the plan is corrected first.

## Out of Scope

- PowerShell groups (permanent: boundary: the publish classifier's PowerShell arm has no group syntax; ADR-067 reads POSIX shells)

## Verification Log
