# Task ADR-090-T2: the lexer reads a heredoc body, a quoted substitution and a function body as the shell runs them

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** M (the lexer, its differential test, the publish tests and campaign entries)
**Owner:** unassigned
**Produces:** `shellWords()` readings: an unquoted heredoc body's substitutions, a parameter-adjacent substitution in double quotes, and a `function` body's commands
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `an unquoted heredoc body's substitution is a command`, `a substitution after a parameter in double quotes is recorded`, `a function keyword body is read as commands`

## Goal

A publish the shell runs from an unquoted heredoc body, from `"$x$(…)"`, or from a `function NAME { … }` body
is refused on an unchecked tree, as the same publish written plainly already is; a quoted heredoc body, an
escaped `\$(`, and a `function` spelled as data stay data.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/shell-words.mjs` | edit | the three readings of ADR-090 Decision 2; no new field |
| `plugin/scripts/lifecycle.mjs` | edit | only if the walk needs it: `publishInCommand` (`:4181`) already recurses into `substitutions`, which is what selects the new readings |
| `tests/shell-words.test.mjs` | edit | one new test beside the 3 locks, using ADR-067 T1's recording stand-ins under bash and zsh |
| `tests/publish-command.test.mjs` | edit | two new tests beside the locks |
| `tests/mutations.json` | edit | one entry per Rests-on name |

## Ordered Steps

1. [S1] Run `python3 scripts/test-locks.py` on both test files, then write the three tests and record the red
   run (TDD red). Red today: `publishCommandIn` returns null for `cat <<EOF⏎$(git push)⏎EOF`,
   `echo "$x$(git push)"` and `function g { git push; }⏎g` (measured 2026-10-06 at 73f930f).
2. [S2] In `shellWords`, lex the body of a heredoc whose delimiter is unquoted for `$(…)` and backtick spans,
   skipping a backslash-escaped `$` or backtick, and append each to its command's `substitutions`. A quoted
   delimiter's body is untouched.
3. [S3] In `shellWords`, record a `$(…)` right after a parameter expansion inside double quotes (`"$x$(…)"`), as
   `"$x $(…)"` and `"${x}$(…)"` already are.
4. [S4] In `shellWords`, read `function NAME {` and `function NAME () {` as a definition whose body's commands
   are commands, as `NAME() {` already is.
5. [S5] Record one killed mutant per Rests-on name and add each to `tests/mutations.json`. [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/shell-words.test.mjs tests/publish-command.test.mjs 2>&1) \
  && for t in 'a heredoc body, a quoted substitution and a function body are lexed as the shell runs them' 'a publish run from a heredoc body, a quoted substitution or a function body is refused' 'a heredoc body, a parameter and a function name that only hold a publish stay data'; do test "$(printf '%s\n' "$out" | grep -cxE "ok [0-9]+ - $t")" = 1 || exit 1; done
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a heredoc body, a quoted substitution and a function body are lexed as the shell runs them` | `tests/shell-words.test.mjs` | each row of the next two tests, plus the CR-delimited csn rows `cat <<EOF⏎EOF\r⏎cat <<'EOF'⏎$(git push --force)⏎EOF` (behavioral-contract-cases.ts:1009) and `cat <<EOF\r⏎$(git push)\r⏎EOF\r⏎` (:1045), run under bash and zsh with recording stand-ins on `PATH` in a scratch directory: the argv each shell hands the stand-in `git` equals what `publishCommandIn` names, or null when the stand-in records nothing. A row whose shell is absent is skipped with that reason. This measures the record's reading of these rows | none | S1, S2, S3, S4 |
| `a publish run from a heredoc body, a quoted substitution or a function body is refused` | `tests/publish-command.test.mjs` | unarmed and unchecked, each is `deny`: `cat <<EOF⏎$(git push)⏎EOF`, ``cat <<EOF⏎`git push`⏎EOF``, `cat <<-EOF⏎⇥$(git push)⏎⇥EOF`, `echo "$x$(git push)"`, `echo "${x}$(git push)"` (refused today: a regression row), `function g { git push; }⏎g`, `function g () { git push; }; g`. CLEAN twin: after `qh-check`, none is `deny` | none | S1, S2, S3, S4 |
| `a heredoc body, a parameter and a function name that only hold a publish stay data` | `tests/publish-command.test.mjs` | unarmed and unchecked, none is `deny`, and each gets the mention advisory: `cat <<'EOF'⏎$(git push)⏎EOF`, `cat <<"EOF"⏎$(git push)⏎EOF`, `cat <<EOF⏎\$(git push)⏎EOF`, `echo "$x"`, `echo '$x$(git push)'`, `echo function g { git push; }` | none | S1, S2, S3, S4 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the three tests |
| 2 — something selects it | `publishInCommand` recurses into every command's `substitutions` and walks every command; the refusal test drives the real PreToolUse hook, so dropping a reading turns its rows red |
| 3 — the caller can discover it | n/a: no declared interface — the effect is the PreToolUse decision |
| 4 — it is used | nothing measures this yet |

## Mutation Log

## Invariants

- A quoted heredoc delimiter's body is never read as code.
- No new field in `shellWords`' result; `complete` keeps its meaning.
- ADR-067's differential test stays green row for row.

## Risks

- `freshDirectoryVariables` (`lifecycle.mjs:5034`) and `commitOnlyCommand` read `substitutions`; a heredoc
  command is already excluded by both (`:5047`, `:823`), so more substitutions there change neither. The full
  `tests/publish-command.test.mjs` run in the fence shows it.
- A shell whose heredoc reading differs from bash's: zsh is measured beside bash, and a difference is recorded
  per row, as ADR-067 Decision 2 does.

## Stop Condition

Stop and ask if bash or zsh runs a publish from a row this task calls data, or none from a row it refuses; or if
a locked test would have to change.

## Out of Scope

- `${ cmd; }` (bash 5.3 or later) — ADR-090 Out of Scope. A path-named wrapper — T3.

## Verification Log
