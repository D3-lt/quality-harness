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
| `tests/publish-errexit.test.mjs` | create | the Codex review of 7a9107e8..dcc4693a: a group under `set -e` ends at its first failure (0 locks: new) |
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
out=$(node --test --test-reporter=tap tests/publish-group.test.mjs tests/publish-errexit.test.mjs tests/qh-core-parity.test.mjs 2>&1) \
  && for n in "a group piped to a shell is read through the bytes it prints" \
      "a redirected or conditional printer is never summed into the pipe" \
      "a nested group keeps its own boundary" \
      "xargs reads a group's bytes, not its last command" \
      "a group under errexit ends at the first failure errexit acts on, and writes nothing after it" \
      "an earlier statement that may change errexit unseen leaves the group could-not-look when errexit decides what it writes" \
      "an earlier statement whose status ends the shell leaves the group nothing to write"; do
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
| `a group the renderer cannot read still gives xargs what its printers write` | `tests/publish-group.test.mjs` | the Codex review of 692a869c: `{ :; echo push; } \| xargs git` and `{ false \|\| echo push; } \| xargs git` run `git push` | — | S1, S4 |
| `a printer name a definition shadows is not rendered` | `tests/publish-group.test.mjs` | `echo() { :; }; { echo 'git push'; echo hi; } \| sh` runs no git | — | S1, S2 |
| `a subshell of one command is rendered with its redirections` | `tests/publish-group.test.mjs` | `(echo 'git push' >/dev/null) \| sh` runs no git | — | S1, S2 |
| `xargs splits its input by its quoting rules, and input it cannot split is unproven` | `tests/publish-group.test.mjs` | `{ echo 'push "'; echo x; } \| xargs git` fails on its quote and runs no git | — | S1, S4 |
| `a group is evaluated left to right over the statuses it knows, and a branch the shell skips writes nothing` | `tests/publish-shell-answers.test.mjs` | fix round 3: `&&`/`\|\|` over `:`/`true`/`false` and printers, measured against /bin/sh and /bin/dash | — | S2, S3 |
| `a definition shadows a printer only when it runs earlier in a shell the group inherits` | `tests/publish-shell-answers.test.mjs` | a definition after the pipeline or in a subshell shadows nothing | — | S2 |
| `xargs reads an echo whose text the shells disagree on as written, and splits what it can` | `tests/publish-shell-answers.test.mjs` | `echo 'push \c"' \| xargs git` runs `git push` | — | S4 |
| `a group the reader cannot prove is could-not-look, though the shell may run its push` | `tests/publish-shell-answers.test.mjs` | the honest under-reading, named | — | S3 |
| `a nested group or subshell carries its last status to the operator after it` | `tests/publish-shell-answers.test.mjs` | status through nesting | — | S2 |
| `a group under errexit ends at the first failure errexit acts on, and writes nothing after it` | `tests/publish-errexit.test.mjs` | review of 7a9107e8..dcc4693a: `set -e; { false; echo 'git push'; } \| sh` runs no push, while `set +e` before it, `false \|\| true`, the print before the failure, a failure left of `&&`, and a group that ends non-zero under an operator all push; measured on /bin/sh and /bin/dash under `env -i` with a stub for git | — | S2 |
| `an earlier statement that may change errexit unseen leaves the group could-not-look when errexit decides what it writes` | `tests/publish-errexit.test.mjs` | round 2: an unread, conditional, backgrounded or unknown-option `set`, `eval`, `.`, `source`, `command`, `builtin`, a call to a function defined earlier and an expanded command word make errexit unknown; a group that writes the same either way is read as before | — | S2, S3 |
| `an earlier statement whose status ends the shell leaves the group nothing to write` | `tests/publish-errexit.test.mjs` | round 2: `set -e; false; { echo 'git push'; } \| sh` and `set -e; { false; }; …` run no push, `false \|\| true`, `false && true`, `false &` and `false \| cat` do not end the shell | — | S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the new tests |
| 2 — something selects it | `publishInCommand` calls both readers (:844, :889) |
| 3 — the caller can discover it | the publish refusal (ADR-061) on every Bash command |
| 4 — it is used | the PreToolUse hook, Node and Go |

## Mutation Log
- 2026-10-21 · 73a3dd98* · mutant killed · exit 1 · `plugin/scripts/shell-words.mjs` · the redirection's source descriptor is kept: 2>&1 and >&2 lex apart · acceptance-sha256:b4cdd05df83040e031d00358cc599882fb11a841a80bd71fc99b99c46a7ee852
- 2026-10-21 · 73a3dd98* · mutant killed · exit 1 · `plugin/scripts/shell-words.mjs` · every redirection is recorded, in order, with its operator and target · acceptance-sha256:b4cdd05df83040e031d00358cc599882fb11a841a80bd71fc99b99c46a7ee852
- 2026-10-21 · 73a3dd98* · mutant killed · exit 1 · `plugin/scripts/publish-command.mjs` · a printer with stderr joined to stdout still writes to the pipe · acceptance-sha256:b4cdd05df83040e031d00358cc599882fb11a841a80bd71fc99b99c46a7ee852
- 2026-10-21 · 73a3dd98* · mutant killed · exit 1 · `plugin/scripts/publish-command.mjs` · a printer whose stdout goes to stderr or a file writes nothing to the pipe · acceptance-sha256:b4cdd05df83040e031d00358cc599882fb11a841a80bd71fc99b99c46a7ee852
- 2026-10-21 · 73a3dd98* · mutant killed · exit 1 · `plugin/scripts/publish-command.mjs` · a redirection of a descriptor other than 1 or 2>&1 is could-not-look · acceptance-sha256:b4cdd05df83040e031d00358cc599882fb11a841a80bd71fc99b99c46a7ee852
- 2026-10-21 · 73a3dd98* · mutant killed · exit 1 · `plugin/scripts/publish-command.mjs` · several redirections on one printer are could-not-look · acceptance-sha256:b4cdd05df83040e031d00358cc599882fb11a841a80bd71fc99b99c46a7ee852
- 2026-10-21 · 73a3dd98* · mutant killed · exit 1 · `plugin/scripts/publish-command.mjs` · a redirection target the lexer cannot read is could-not-look · acceptance-sha256:b4cdd05df83040e031d00358cc599882fb11a841a80bd71fc99b99c46a7ee852
- 2026-10-21 · 73a3dd98* · mutant killed · exit 1 · `plugin/scripts/publish-command.mjs` · echo joins its words with a space · acceptance-sha256:b4cdd05df83040e031d00358cc599882fb11a841a80bd71fc99b99c46a7ee852
- 2026-10-21 · 73a3dd98* · mutant killed · exit 1 · `plugin/scripts/publish-command.mjs` · echo ends its line with a newline · acceptance-sha256:b4cdd05df83040e031d00358cc599882fb11a841a80bd71fc99b99c46a7ee852
- 2026-10-21 · 73a3dd98* · mutant killed · exit 1 · `plugin/scripts/publish-command.mjs` · an echo option is could-not-look · acceptance-sha256:b4cdd05df83040e031d00358cc599882fb11a841a80bd71fc99b99c46a7ee852
- 2026-10-21 · 73a3dd98* · mutant killed · exit 1 · `plugin/scripts/publish-command.mjs` · an echo word with a backslash is could-not-look · acceptance-sha256:b4cdd05df83040e031d00358cc599882fb11a841a80bd71fc99b99c46a7ee852
- 2026-10-21 · 73a3dd98* · mutant killed · exit 1 · `plugin/scripts/publish-command.mjs` · a printf conversion other than %s is could-not-look · acceptance-sha256:b4cdd05df83040e031d00358cc599882fb11a841a80bd71fc99b99c46a7ee852
- 2026-10-21 · 73a3dd98* · mutant killed · exit 1 · `plugin/scripts/publish-command.mjs` · a printf escape other than \n and \t is could-not-look · acceptance-sha256:b4cdd05df83040e031d00358cc599882fb11a841a80bd71fc99b99c46a7ee852
- 2026-10-21 · 73a3dd98* · mutant killed · exit 1 · `plugin/scripts/publish-command.mjs` · printf repeats its format while arguments remain · acceptance-sha256:b4cdd05df83040e031d00358cc599882fb11a841a80bd71fc99b99c46a7ee852
- 2026-10-21 · 73a3dd98* · mutant killed · exit 1 · `plugin/scripts/publish-command.mjs` · a printf format with no conversion is written once, whatever the arguments · acceptance-sha256:b4cdd05df83040e031d00358cc599882fb11a841a80bd71fc99b99c46a7ee852
- 2026-10-21 · 73a3dd98* · mutant killed · exit 1 · `plugin/scripts/publish-command.mjs` · a missing printf argument is the empty string · acceptance-sha256:b4cdd05df83040e031d00358cc599882fb11a841a80bd71fc99b99c46a7ee852
- 2026-10-21 · 73a3dd98* · mutant killed · exit 1 · `plugin/scripts/publish-command.mjs` · a printf format that is an option is could-not-look · acceptance-sha256:b4cdd05df83040e031d00358cc599882fb11a841a80bd71fc99b99c46a7ee852
- 2026-10-21 · 73a3dd98* · mutant killed · exit 1 · `plugin/scripts/publish-command.mjs` · a printer with a word the lexer cannot read is could-not-look · acceptance-sha256:b4cdd05df83040e031d00358cc599882fb11a841a80bd71fc99b99c46a7ee852
- 2026-10-21 · 73a3dd98* · mutant killed · exit 1 · `plugin/scripts/publish-command.mjs` · a substitution on a printer is could-not-look · acceptance-sha256:b4cdd05df83040e031d00358cc599882fb11a841a80bd71fc99b99c46a7ee852
- 2026-10-21 · 73a3dd98* · mutant killed · exit 1 · `plugin/scripts/publish-command.mjs` · a background in a group is could-not-look · acceptance-sha256:b4cdd05df83040e031d00358cc599882fb11a841a80bd71fc99b99c46a7ee852
- 2026-10-21 · 73a3dd98* · mutant killed · exit 1 · `plugin/scripts/publish-command.mjs` · a && or || in a group is could-not-look · acceptance-sha256:b4cdd05df83040e031d00358cc599882fb11a841a80bd71fc99b99c46a7ee852
- 2026-10-21 · 73a3dd98* · mutant killed · exit 1 · `plugin/scripts/publish-command.mjs` · a pipeline of several stages inside a group is could-not-look · acceptance-sha256:b4cdd05df83040e031d00358cc599882fb11a841a80bd71fc99b99c46a7ee852
- 2026-10-21 · 73a3dd98* · mutant killed · exit 1 · `plugin/scripts/publish-command.mjs` · a subshell nested in a group is part of the same stream · acceptance-sha256:b4cdd05df83040e031d00358cc599882fb11a841a80bd71fc99b99c46a7ee852
- 2026-10-21 · 73a3dd98* · mutant killed · exit 1 · `plugin/scripts/publish-command.mjs` · a group nested in a group is part of the same stream · acceptance-sha256:b4cdd05df83040e031d00358cc599882fb11a841a80bd71fc99b99c46a7ee852
- 2026-10-21 · 73a3dd98* · mutant killed · exit 1 · `plugin/scripts/publish-command.mjs` · a subshell piped to a shell is read through the bytes it prints · acceptance-sha256:b4cdd05df83040e031d00358cc599882fb11a841a80bd71fc99b99c46a7ee852
- 2026-10-21 · 73a3dd98* · mutant killed · exit 1 · `plugin/scripts/publish-command.mjs` · a group of one pipeline is that pipeline's last command, read as any upstream · acceptance-sha256:b4cdd05df83040e031d00358cc599882fb11a841a80bd71fc99b99c46a7ee852
- 2026-10-21 · 73a3dd98* · mutant killed · exit 1 · `plugin/scripts/publish-command.mjs` · a group piped with |& also pipes its stderr, so it is could-not-look · acceptance-sha256:b4cdd05df83040e031d00358cc599882fb11a841a80bd71fc99b99c46a7ee852
- 2026-10-21 · 73a3dd98* · mutant killed · exit 1 · `plugin/scripts/publish-command.mjs` · the last command of an unwrapped group is not read alone as its upstream · acceptance-sha256:b4cdd05df83040e031d00358cc599882fb11a841a80bd71fc99b99c46a7ee852
- 2026-10-21 · 73a3dd98* · mutant killed · exit 1 · `plugin/scripts/publish-command.mjs` · a group's bytes are read exactly, with no backslash-n turned into a line · acceptance-sha256:b4cdd05df83040e031d00358cc599882fb11a841a80bd71fc99b99c46a7ee852
- 2026-10-21 · 73a3dd98* · mutant survived · exit 0 · `plugin/scripts/publish-command.mjs` · an input xargs cannot read is a stand-in, so the push its own words name is still read · acceptance-sha256:b4cdd05df83040e031d00358cc599882fb11a841a80bd71fc99b99c46a7ee852
  ```
  the fence passed with the mechanism broken; it may not materialize, compile, load, or assert on the changed path
  ```
- 2026-10-21 · 73a3dd98* · mutant killed · exit 1 · `plugin/scripts/publish-command.mjs` · a group feeding xargs gives it the bytes its printers write · acceptance-sha256:b4cdd05df83040e031d00358cc599882fb11a841a80bd71fc99b99c46a7ee852
- 2026-10-21 · 73a3dd98* · mutant survived · exit 0 · `plugin/scripts/publish-command.mjs` · a group behind a pass-through cat still feeds the shell its exact bytes · acceptance-sha256:b4cdd05df83040e031d00358cc599882fb11a841a80bd71fc99b99c46a7ee852
  ```
  the fence passed with the mechanism broken; it may not materialize, compile, load, or assert on the changed path
  ```
- 2026-10-21 · 73a3dd98* · mutant killed · exit 1 · `plugin/scripts/publish-command.mjs` · where the grammar did not read the text, the last command of a group is not all it writes · acceptance-sha256:b4cdd05df83040e031d00358cc599882fb11a841a80bd71fc99b99c46a7ee852
- 2026-10-21 · 73a3dd98* · mutant killed · exit 1 · `plugin/scripts/publish-command.mjs` · a group behind a pass-through cat still feeds the shell its exact bytes · acceptance-sha256:b4cdd05df83040e031d00358cc599882fb11a841a80bd71fc99b99c46a7ee852
- 2026-10-21 · 73a3dd98* · mutant killed · exit 1 · `core/hooks/publishcmd.go` · the Go printf repeats its format while arguments remain, as the Node one does · acceptance-sha256:b4cdd05df83040e031d00358cc599882fb11a841a80bd71fc99b99c46a7ee852
- 2026-10-21 · 73a3dd98* · mutant killed · exit 1 · `core/hooks/publishcmd.go` · the Go flat scan does not read a group's last command alone · acceptance-sha256:b4cdd05df83040e031d00358cc599882fb11a841a80bd71fc99b99c46a7ee852
- 2026-10-21 · 73a3dd98* · mutant killed · exit 1 · `core/hooks/shellwords.go` · the Go lexer keeps a redirection's source descriptor, as the Node one does · acceptance-sha256:b4cdd05df83040e031d00358cc599882fb11a841a80bd71fc99b99c46a7ee852
- 2026-10-21 · 73a3dd98* · mutant killed · exit 1 · `core/hooks/publishcmd.go` · the Go reader treats a group piped with |& as could-not-look · acceptance-sha256:b4cdd05df83040e031d00358cc599882fb11a841a80bd71fc99b99c46a7ee852
- 2026-10-21 · bca51180* · mutant killed · exit 1 · `plugin/scripts/publish-command.mjs` · an unreadable group's printers' words reach xargs again · acceptance-sha256:b4cdd05df83040e031d00358cc599882fb11a841a80bd71fc99b99c46a7ee852
- 2026-10-21 · bca51180* · mutant killed · exit 1 · `plugin/scripts/publish-command.mjs` · a silent builtin in an unreadable group makes it unread again · acceptance-sha256:b4cdd05df83040e031d00358cc599882fb11a841a80bd71fc99b99c46a7ee852
- 2026-10-21 · bca51180* · mutant killed · exit 1 · `plugin/scripts/publish-command.mjs` · a printer name the text defines is rendered as the builtin · acceptance-sha256:b4cdd05df83040e031d00358cc599882fb11a841a80bd71fc99b99c46a7ee852
- 2026-10-21 · bca51180* · mutant killed · exit 1 · `plugin/scripts/publish-command.mjs` · a defined printer name still gives candidate words · acceptance-sha256:b4cdd05df83040e031d00358cc599882fb11a841a80bd71fc99b99c46a7ee852
- 2026-10-21 · bca51180* · mutant killed · exit 1 · `plugin/scripts/publish-command.mjs` · a one-command subshell is read as its command again, redirections ignored · acceptance-sha256:b4cdd05df83040e031d00358cc599882fb11a841a80bd71fc99b99c46a7ee852
- 2026-10-21 · bca51180* · mutant killed · exit 1 · `plugin/scripts/publish-command.mjs` · a quote still open at the end of xargs input is split anyway · acceptance-sha256:b4cdd05df83040e031d00358cc599882fb11a841a80bd71fc99b99c46a7ee852
- 2026-10-21 · bca51180* · mutant killed · exit 1 · `plugin/scripts/publish-command.mjs` · a newline inside a quote no longer fails xargs · acceptance-sha256:b4cdd05df83040e031d00358cc599882fb11a841a80bd71fc99b99c46a7ee852
- 2026-10-21 · bca51180* · mutant killed · exit 1 · `plugin/scripts/publish-command.mjs` · a backslash outside quotes is an ordinary character · acceptance-sha256:b4cdd05df83040e031d00358cc599882fb11a841a80bd71fc99b99c46a7ee852
- 2026-10-21 · b772c9a4* · mutant killed · exit 1 · `plugin/scripts/publish-command.mjs` · a group under inherited errexit is read past its first failing command, so set -e; { false; echo git push; } | sh is refused though no shell pushes (review of 7a9107e8..dcc4693a, finding 4) · acceptance-sha256:29ff6bd89bfb99a53f7312a3a78cd453b4442409f814e5225a73fabddcab595e

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
- 2026-10-21 · 73a3dd98* · exit 1 · `out=$(node --test --test-reporter=tap tests/publish-group.test.mjs tests/qh-core-parity.test.mjs 2>&1) \ …` · acceptance-sha256:b4cdd05df83040e031d00358cc599882fb11a841a80bd71fc99b99c46a7ee852 · ms:6761 · test-lock-sha256:284e244eac780cb800be3d1141ff101ccfac8bad9767fa22250a128ddb7a7527 · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvcHVibGlzaC1ncm91cC50ZXN0Lm1qcwlhIGdyb3VwIHBpcGVkIHRvIGEgc2hlbGwgaXMgcmVhZCB0aHJvdWdoIHRoZSBieXRlcyBpdCBwcmludHMJMmQ2MGVmYzI0ZGEzODE5MDgyZWJmYzZiZDlhNWRlNWQ2OTVkNmMwODdlMDVmMjEyNTM0ZTgzM2VlMjljZDBhYwpib2R5CXRlc3RzL3B1Ymxpc2gtZ3JvdXAudGVzdC5tanMJYSBuZXN0ZWQgZ3JvdXAga2VlcHMgaXRzIG93biBib3VuZGFyeQk2ZWI5ZjMyMTQwNTExZjA4Y2I4Nzk4MWYwYWIyMGY1NGVjNjg2ZDBkYjBkYjJjYzY4NWFlMWVhNDUyZDBjZGVlCmJvZHkJdGVzdHMvcHVibGlzaC1ncm91cC50ZXN0Lm1qcwlhIHJlZGlyZWN0ZWQgb3IgY29uZGl0aW9uYWwgcHJpbnRlciBpcyBuZXZlciBzdW1tZWQgaW50byB0aGUgcGlwZQk2MDMwMmMzNjY2OGUzZjk0MDI1ODVkYTExNzJjYjNlMjQ3MTEyMjA3MWIzOGQ5YjVlZWZmZTU2ZTE2ZTk1N2EzCmJvZHkJdGVzdHMvcHVibGlzaC1ncm91cC50ZXN0Lm1qcwl4YXJncyByZWFkcyBhIGdyb3VwJ3MgYnl0ZXMsIG5vdCBpdHMgbGFzdCBjb21tYW5kCTljMmMzMzY1MGI2NjY4ZjJlOTA4NTczODNjMzk5MDEzMTNhNzQ5ZmUzZTM5OTk1NTE5NDdmZWRmOWE0Zjk5NDM
  ```
  ```
- 2026-10-21 · 73a3dd98* · exit 0 · `out=$(node --test --test-reporter=tap tests/publish-group.test.mjs tests/qh-core-parity.test.mjs 2>&1) \ …` · acceptance-sha256:b4cdd05df83040e031d00358cc599882fb11a841a80bd71fc99b99c46a7ee852 · ms:6145
- 2026-10-21 · 73a3dd98* · exit 0 · `out=$(node --test --test-reporter=tap tests/publish-group.test.mjs tests/qh-core-parity.test.mjs 2>&1) \ …` · acceptance-sha256:b4cdd05df83040e031d00358cc599882fb11a841a80bd71fc99b99c46a7ee852 · ms:5980
- 2026-10-21 · 73a3dd98* · exit 0 · `out=$(node --test --test-reporter=tap tests/publish-group.test.mjs tests/qh-core-parity.test.mjs 2>&1) \ …` · acceptance-sha256:b4cdd05df83040e031d00358cc599882fb11a841a80bd71fc99b99c46a7ee852 · ms:5871
- 2026-10-21 · 73a3dd98* · exit 0 · `out=$(node --test --test-reporter=tap tests/publish-group.test.mjs tests/qh-core-parity.test.mjs 2>&1) \ …` · acceptance-sha256:b4cdd05df83040e031d00358cc599882fb11a841a80bd71fc99b99c46a7ee852 · ms:5899
- 2026-10-21 · 73a3dd98* · exit 0 · `out=$(node --test --test-reporter=tap tests/publish-group.test.mjs tests/qh-core-parity.test.mjs 2>&1) \ …` · acceptance-sha256:b4cdd05df83040e031d00358cc599882fb11a841a80bd71fc99b99c46a7ee852 · ms:6174
- 2026-10-21 · 73a3dd98* · exit 0 · `out=$(node --test --test-reporter=tap tests/publish-group.test.mjs tests/qh-core-parity.test.mjs 2>&1) \ …` · acceptance-sha256:b4cdd05df83040e031d00358cc599882fb11a841a80bd71fc99b99c46a7ee852 · ms:6134
- 2026-10-21 · 73a3dd98* · exit 0 · `out=$(node --test --test-reporter=tap tests/publish-group.test.mjs tests/qh-core-parity.test.mjs 2>&1) \ …` · acceptance-sha256:b4cdd05df83040e031d00358cc599882fb11a841a80bd71fc99b99c46a7ee852 · ms:9869
- 2026-10-21 · 73a3dd98* · exit 0 · `out=$(node --test --test-reporter=tap tests/publish-group.test.mjs tests/qh-core-parity.test.mjs 2>&1) \ …` · acceptance-sha256:b4cdd05df83040e031d00358cc599882fb11a841a80bd71fc99b99c46a7ee852 · ms:23665
- 2026-10-21 · 73a3dd98* · exit 0 · `out=$(node --test --test-reporter=tap tests/publish-group.test.mjs tests/qh-core-parity.test.mjs 2>&1) \ …` · acceptance-sha256:b4cdd05df83040e031d00358cc599882fb11a841a80bd71fc99b99c46a7ee852 · ms:14198
- 2026-10-21 · 73a3dd98* · exit 0 · `out=$(node --test --test-reporter=tap tests/publish-group.test.mjs tests/qh-core-parity.test.mjs 2>&1) \ …` · acceptance-sha256:b4cdd05df83040e031d00358cc599882fb11a841a80bd71fc99b99c46a7ee852 · ms:23739
- 2026-10-21 · 73a3dd98* · exit 0 · `out=$(node --test --test-reporter=tap tests/publish-group.test.mjs tests/qh-core-parity.test.mjs 2>&1) \ …` · acceptance-sha256:b4cdd05df83040e031d00358cc599882fb11a841a80bd71fc99b99c46a7ee852 · ms:25060
- 2026-10-21 · 73a3dd98* · exit 0 · `out=$(node --test --test-reporter=tap tests/publish-group.test.mjs tests/qh-core-parity.test.mjs 2>&1) \ …` · acceptance-sha256:b4cdd05df83040e031d00358cc599882fb11a841a80bd71fc99b99c46a7ee852 · ms:18234
- 2026-10-21 · 73a3dd98* · exit 0 · `out=$(node --test --test-reporter=tap tests/publish-group.test.mjs tests/qh-core-parity.test.mjs 2>&1) \ …` · acceptance-sha256:b4cdd05df83040e031d00358cc599882fb11a841a80bd71fc99b99c46a7ee852 · ms:9843
- 2026-10-21 · 73a3dd98* · exit 0 · `out=$(node --test --test-reporter=tap tests/publish-group.test.mjs tests/qh-core-parity.test.mjs 2>&1) \ …` · acceptance-sha256:b4cdd05df83040e031d00358cc599882fb11a841a80bd71fc99b99c46a7ee852 · ms:12933
- 2026-10-21 · 73a3dd98* · exit 0 · `out=$(node --test --test-reporter=tap tests/publish-group.test.mjs tests/qh-core-parity.test.mjs 2>&1) \ …` · acceptance-sha256:b4cdd05df83040e031d00358cc599882fb11a841a80bd71fc99b99c46a7ee852 · ms:11482
- 2026-10-21 · 73a3dd98* · exit 0 · `out=$(node --test --test-reporter=tap tests/publish-group.test.mjs tests/qh-core-parity.test.mjs 2>&1) \ …` · acceptance-sha256:b4cdd05df83040e031d00358cc599882fb11a841a80bd71fc99b99c46a7ee852 · ms:7441
- 2026-10-21 · 73a3dd98* · exit 0 · `out=$(node --test --test-reporter=tap tests/publish-group.test.mjs tests/qh-core-parity.test.mjs 2>&1) \ …` · acceptance-sha256:b4cdd05df83040e031d00358cc599882fb11a841a80bd71fc99b99c46a7ee852 · ms:7348
- 2026-10-21 · 73a3dd98* · exit 0 · `out=$(node --test --test-reporter=tap tests/publish-group.test.mjs tests/qh-core-parity.test.mjs 2>&1) \ …` · acceptance-sha256:b4cdd05df83040e031d00358cc599882fb11a841a80bd71fc99b99c46a7ee852 · ms:8867
- 2026-10-21 · 73a3dd98* · exit 0 · `out=$(node --test --test-reporter=tap tests/publish-group.test.mjs tests/qh-core-parity.test.mjs 2>&1) \ …` · acceptance-sha256:b4cdd05df83040e031d00358cc599882fb11a841a80bd71fc99b99c46a7ee852 · ms:9622
- 2026-10-21 · 73a3dd98* · exit 0 · `out=$(node --test --test-reporter=tap tests/publish-group.test.mjs tests/qh-core-parity.test.mjs 2>&1) \ …` · acceptance-sha256:b4cdd05df83040e031d00358cc599882fb11a841a80bd71fc99b99c46a7ee852 · ms:8852
- 2026-10-21 · 73a3dd98* · exit 0 · `out=$(node --test --test-reporter=tap tests/publish-group.test.mjs tests/qh-core-parity.test.mjs 2>&1) \ …` · acceptance-sha256:b4cdd05df83040e031d00358cc599882fb11a841a80bd71fc99b99c46a7ee852 · ms:6517
- 2026-10-21 · 73a3dd98* · exit 0 · `out=$(node --test --test-reporter=tap tests/publish-group.test.mjs tests/qh-core-parity.test.mjs 2>&1) \ …` · acceptance-sha256:b4cdd05df83040e031d00358cc599882fb11a841a80bd71fc99b99c46a7ee852 · ms:7405
- 2026-10-21 · 73a3dd98* · exit 0 · `out=$(node --test --test-reporter=tap tests/publish-group.test.mjs tests/qh-core-parity.test.mjs 2>&1) \ …` · acceptance-sha256:b4cdd05df83040e031d00358cc599882fb11a841a80bd71fc99b99c46a7ee852 · ms:6543
- 2026-10-21 · 73a3dd98* · exit 0 · `out=$(node --test --test-reporter=tap tests/publish-group.test.mjs tests/qh-core-parity.test.mjs 2>&1) \ …` · acceptance-sha256:b4cdd05df83040e031d00358cc599882fb11a841a80bd71fc99b99c46a7ee852 · ms:8830
- 2026-10-21 · 73a3dd98* · exit 0 · `out=$(node --test --test-reporter=tap tests/publish-group.test.mjs tests/qh-core-parity.test.mjs 2>&1) \ …` · acceptance-sha256:b4cdd05df83040e031d00358cc599882fb11a841a80bd71fc99b99c46a7ee852 · ms:7567
- 2026-10-21 · 73a3dd98* · exit 0 · `out=$(node --test --test-reporter=tap tests/publish-group.test.mjs tests/qh-core-parity.test.mjs 2>&1) \ …` · acceptance-sha256:b4cdd05df83040e031d00358cc599882fb11a841a80bd71fc99b99c46a7ee852 · ms:10112
- 2026-10-21 · 73a3dd98* · exit 0 · `out=$(node --test --test-reporter=tap tests/publish-group.test.mjs tests/qh-core-parity.test.mjs 2>&1) \ …` · acceptance-sha256:b4cdd05df83040e031d00358cc599882fb11a841a80bd71fc99b99c46a7ee852 · ms:19684
- 2026-10-21 · 73a3dd98* · exit 0 · `out=$(node --test --test-reporter=tap tests/publish-group.test.mjs tests/qh-core-parity.test.mjs 2>&1) \ …` · acceptance-sha256:b4cdd05df83040e031d00358cc599882fb11a841a80bd71fc99b99c46a7ee852 · ms:20305
- 2026-10-21 · 73a3dd98* · exit 0 · `out=$(node --test --test-reporter=tap tests/publish-group.test.mjs tests/qh-core-parity.test.mjs 2>&1) \ …` · acceptance-sha256:b4cdd05df83040e031d00358cc599882fb11a841a80bd71fc99b99c46a7ee852 · ms:11780
- 2026-10-21 · 73a3dd98* · exit 0 · `out=$(node --test --test-reporter=tap tests/publish-group.test.mjs tests/qh-core-parity.test.mjs 2>&1) \ …` · acceptance-sha256:b4cdd05df83040e031d00358cc599882fb11a841a80bd71fc99b99c46a7ee852 · ms:8459
- 2026-10-21 · 73a3dd98* · exit 0 · `out=$(node --test --test-reporter=tap tests/publish-group.test.mjs tests/qh-core-parity.test.mjs 2>&1) \ …` · acceptance-sha256:b4cdd05df83040e031d00358cc599882fb11a841a80bd71fc99b99c46a7ee852 · ms:6393
- 2026-10-21 · 73a3dd98* · exit 0 · `out=$(node --test --test-reporter=tap tests/publish-group.test.mjs tests/qh-core-parity.test.mjs 2>&1) \ …` · acceptance-sha256:b4cdd05df83040e031d00358cc599882fb11a841a80bd71fc99b99c46a7ee852 · ms:12080
- 2026-10-21 · 73a3dd98* · exit 0 · `out=$(node --test --test-reporter=tap tests/publish-group.test.mjs tests/qh-core-parity.test.mjs 2>&1) \ …` · acceptance-sha256:b4cdd05df83040e031d00358cc599882fb11a841a80bd71fc99b99c46a7ee852 · ms:8514
- 2026-10-21 · 73a3dd98* · exit 0 · `out=$(node --test --test-reporter=tap tests/publish-group.test.mjs tests/qh-core-parity.test.mjs 2>&1) \ …` · acceptance-sha256:b4cdd05df83040e031d00358cc599882fb11a841a80bd71fc99b99c46a7ee852 · ms:6506
- 2026-10-21 · 73a3dd98* · exit 0 · `out=$(node --test --test-reporter=tap tests/publish-group.test.mjs tests/qh-core-parity.test.mjs 2>&1) \ …` · acceptance-sha256:b4cdd05df83040e031d00358cc599882fb11a841a80bd71fc99b99c46a7ee852 · ms:5874
- 2026-10-21 · 73a3dd98* · exit 0 · `out=$(node --test --test-reporter=tap tests/publish-group.test.mjs tests/qh-core-parity.test.mjs 2>&1) \ …` · acceptance-sha256:b4cdd05df83040e031d00358cc599882fb11a841a80bd71fc99b99c46a7ee852 · ms:5820
- 2026-10-21 · 73a3dd98* · exit 0 · `out=$(node --test --test-reporter=tap tests/publish-group.test.mjs tests/qh-core-parity.test.mjs 2>&1) \ …` · acceptance-sha256:b4cdd05df83040e031d00358cc599882fb11a841a80bd71fc99b99c46a7ee852 · ms:5950
- 2026-10-21 · 73a3dd98* · exit 0 · `out=$(node --test --test-reporter=tap tests/publish-group.test.mjs tests/qh-core-parity.test.mjs 2>&1) \ …` · acceptance-sha256:b4cdd05df83040e031d00358cc599882fb11a841a80bd71fc99b99c46a7ee852 · ms:5993
- 2026-10-21 · d3fed21c* · exit 0 · `adr-verify --relock --replace-hashes` · acceptance-sha256:b4cdd05df83040e031d00358cc599882fb11a841a80bd71fc99b99c46a7ee852 · ms:0 · test-lock-sha256:cec959bdd835bf02c70e7d264797f11666a6c8e69ac02dd08c2274a0decbd669 · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvcHVibGlzaC1ncm91cC50ZXN0Lm1qcwlhIGdyb3VwIHBpcGVkIHRvIGEgc2hlbGwgaXMgcmVhZCB0aHJvdWdoIHRoZSBieXRlcyBpdCBwcmludHMJNjYzZGFkMjg4MWEyYWU2MjQxNjA5YThlYTAyOWUwNTE4ZWMxZDc5ZDFhNmUyYmZmYTI3ZGFmMThjZTBjYjc4NApib2R5CXRlc3RzL3B1Ymxpc2gtZ3JvdXAudGVzdC5tanMJYSBuZXN0ZWQgZ3JvdXAga2VlcHMgaXRzIG93biBib3VuZGFyeQk2ZWI5ZjMyMTQwNTExZjA4Y2I4Nzk4MWYwYWIyMGY1NGVjNjg2ZDBkYjBkYjJjYzY4NWFlMWVhNDUyZDBjZGVlCmJvZHkJdGVzdHMvcHVibGlzaC1ncm91cC50ZXN0Lm1qcwlhIHJlZGlyZWN0ZWQgb3IgY29uZGl0aW9uYWwgcHJpbnRlciBpcyBuZXZlciBzdW1tZWQgaW50byB0aGUgcGlwZQkyZWY5YjBkNzEzZjNlMTgxYWUzYjc3N2NmNmExNjY4NmIwOTkxNzk1ZWZjZjY0MGE4ZjNjMGUwMzdhMWY0MDNiCmJvZHkJdGVzdHMvcHVibGlzaC1ncm91cC50ZXN0Lm1qcwl4YXJncyByZWFkcyBhIGdyb3VwJ3MgYnl0ZXMsIG5vdCBpdHMgbGFzdCBjb21tYW5kCTU5NmQ1Y2UzOTFkZGQ1YjYwM2UzMWVmN2NkMTcxNDhlZjVhZmIyYzg3NzQ2NGI0NTUxYjc4ZGI4ODAzNDQ1ZTE · test-lock-kind:replace
- 2026-10-21 · bca51180* · exit 0 · `out=$(node --test --test-reporter=tap tests/publish-group.test.mjs tests/qh-core-parity.test.mjs 2>&1) \ …` · acceptance-sha256:b4cdd05df83040e031d00358cc599882fb11a841a80bd71fc99b99c46a7ee852 · ms:21229
- 2026-10-21 · bca51180* · exit 0 · `out=$(node --test --test-reporter=tap tests/publish-group.test.mjs tests/qh-core-parity.test.mjs 2>&1) \ …` · acceptance-sha256:b4cdd05df83040e031d00358cc599882fb11a841a80bd71fc99b99c46a7ee852 · ms:9967
- 2026-10-21 · bca51180* · exit 0 · `out=$(node --test --test-reporter=tap tests/publish-group.test.mjs tests/qh-core-parity.test.mjs 2>&1) \ …` · acceptance-sha256:b4cdd05df83040e031d00358cc599882fb11a841a80bd71fc99b99c46a7ee852 · ms:7126
- 2026-10-21 · bca51180* · exit 0 · `out=$(node --test --test-reporter=tap tests/publish-group.test.mjs tests/qh-core-parity.test.mjs 2>&1) \ …` · acceptance-sha256:b4cdd05df83040e031d00358cc599882fb11a841a80bd71fc99b99c46a7ee852 · ms:6170
- 2026-10-21 · bca51180* · exit 0 · `out=$(node --test --test-reporter=tap tests/publish-group.test.mjs tests/qh-core-parity.test.mjs 2>&1) \ …` · acceptance-sha256:b4cdd05df83040e031d00358cc599882fb11a841a80bd71fc99b99c46a7ee852 · ms:7778
- 2026-10-21 · bca51180* · exit 0 · `out=$(node --test --test-reporter=tap tests/publish-group.test.mjs tests/qh-core-parity.test.mjs 2>&1) \ …` · acceptance-sha256:b4cdd05df83040e031d00358cc599882fb11a841a80bd71fc99b99c46a7ee852 · ms:26301
- 2026-10-21 · bca51180* · exit 0 · `out=$(node --test --test-reporter=tap tests/publish-group.test.mjs tests/qh-core-parity.test.mjs 2>&1) \ …` · acceptance-sha256:b4cdd05df83040e031d00358cc599882fb11a841a80bd71fc99b99c46a7ee852 · ms:9516
- 2026-10-21 · bca51180* · exit 0 · `out=$(node --test --test-reporter=tap tests/publish-group.test.mjs tests/qh-core-parity.test.mjs 2>&1) \ …` · acceptance-sha256:b4cdd05df83040e031d00358cc599882fb11a841a80bd71fc99b99c46a7ee852 · ms:8215
- 2026-10-21 · aa26c0bd* · exit 0 · `adr-verify --relock --replace-hashes` · acceptance-sha256:b4cdd05df83040e031d00358cc599882fb11a841a80bd71fc99b99c46a7ee852 · ms:0 · test-lock-sha256:76e529835fab9bd1a00c64936992d4ddc6a05d6a910008755f98bd131a745b81 · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvcHVibGlzaC1ncm91cC50ZXN0Lm1qcwlhIGdyb3VwIHBpcGVkIHRvIGEgc2hlbGwgaXMgcmVhZCB0aHJvdWdoIHRoZSBieXRlcyBpdCBwcmludHMJNjYzZGFkMjg4MWEyYWU2MjQxNjA5YThlYTAyOWUwNTE4ZWMxZDc5ZDFhNmUyYmZmYTI3ZGFmMThjZTBjYjc4NApib2R5CXRlc3RzL3B1Ymxpc2gtZ3JvdXAudGVzdC5tanMJYSBncm91cCB0aGUgcmVuZGVyZXIgY2Fubm90IHJlYWQgc3RpbGwgZ2l2ZXMgeGFyZ3Mgd2hhdCBpdHMgcHJpbnRlcnMgd3JpdGUJZTkyM2QyMTU3MTAzNzEwMWY0N2I1M2Y1ZGIyMzQ4YTNkYjdjY2Y3NTZmZjAwM2RjN2I3MWFjZjE2YTdlMWUxMApib2R5CXRlc3RzL3B1Ymxpc2gtZ3JvdXAudGVzdC5tanMJYSBuZXN0ZWQgZ3JvdXAga2VlcHMgaXRzIG93biBib3VuZGFyeQk2ZWI5ZjMyMTQwNTExZjA4Y2I4Nzk4MWYwYWIyMGY1NGVjNjg2ZDBkYjBkYjJjYzY4NWFlMWVhNDUyZDBjZGVlCmJvZHkJdGVzdHMvcHVibGlzaC1ncm91cC50ZXN0Lm1qcwlhIHByaW50ZXIgbmFtZSBhIGRlZmluaXRpb24gc2hhZG93cyBpcyBub3QgcmVuZGVyZWQJODljN2NhYTJjYzRiNzY5MTUyM2YyMjY0NGYwMTBlOTZmM2ZjY2FkNzdiM2MzNjkwZGVkYzg3YTI0NDEzMjFkZQpib2R5CXRlc3RzL3B1Ymxpc2gtZ3JvdXAudGVzdC5tanMJYSByZWRpcmVjdGVkIG9yIGNvbmRpdGlvbmFsIHByaW50ZXIgaXMgbmV2ZXIgc3VtbWVkIGludG8gdGhlIHBpcGUJMmVmOWIwZDcxM2YzZTE4MWFlM2I3NzdjZjZhMTY2ODZiMDk5MTc5NWVmY2Y2NDBhOGYzYzBlMDM3YTFmNDAzYgpib2R5CXRlc3RzL3B1Ymxpc2gtZ3JvdXAudGVzdC5tanMJYSBzdWJzaGVsbCBvZiBvbmUgY29tbWFuZCBpcyByZW5kZXJlZCB3aXRoIGl0cyByZWRpcmVjdGlvbnMJMTg0NmIzZmVjZDMzZWRkZWJmOGIyM2M2ZjFkMGIwMzM0YzFhOWIxNjJhYjBkOTg0MmY3MWIyZWJmYTBjNDQ1OApib2R5CXRlc3RzL3B1Ymxpc2gtZ3JvdXAudGVzdC5tanMJeGFyZ3MgcmVhZHMgYSBncm91cCdzIGJ5dGVzLCBub3QgaXRzIGxhc3QgY29tbWFuZAk1OTZkNWNlMzkxZGRkNWI2MDNlMzFlZjdjZDE3MTQ4ZWY1YWZiMmM4Nzc0NjRiNDU1MWI3OGRiODgwMzQ0NWUxCmJvZHkJdGVzdHMvcHVibGlzaC1ncm91cC50ZXN0Lm1qcwl4YXJncyBzcGxpdHMgaXRzIGlucHV0IGJ5IGl0cyBxdW90aW5nIHJ1bGVzLCBhbmQgaW5wdXQgaXQgY2Fubm90IHNwbGl0IGlzIHVucHJvdmVuCWVmYzZkZDFmNzExNTZlMDE5MjJiZDNkOTFjMDlkOWY1YWFiZDNhMWU2NDk0OTI5NGEwODkyMTZkYTU0YTUxNjc · test-lock-kind:replace
- 2026-10-21 · 3b571861* · exit 0 · `adr-verify --relock --replace-hashes` · acceptance-sha256:b4cdd05df83040e031d00358cc599882fb11a841a80bd71fc99b99c46a7ee852 · ms:0 · test-lock-sha256:7f1dfa058b11496d96f803c0ca1e63a161e9e643e48738050fb020b13e22f3aa · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvcHVibGlzaC1ncm91cC50ZXN0Lm1qcwlhIGdyb3VwIHBpcGVkIHRvIGEgc2hlbGwgaXMgcmVhZCB0aHJvdWdoIHRoZSBieXRlcyBpdCBwcmludHMJNjYzZGFkMjg4MWEyYWU2MjQxNjA5YThlYTAyOWUwNTE4ZWMxZDc5ZDFhNmUyYmZmYTI3ZGFmMThjZTBjYjc4NApib2R5CXRlc3RzL3B1Ymxpc2gtZ3JvdXAudGVzdC5tanMJYSBncm91cCB0aGUgcmVuZGVyZXIgY2Fubm90IHJlYWQgc3RpbGwgZ2l2ZXMgeGFyZ3Mgd2hhdCBpdHMgcHJpbnRlcnMgd3JpdGUJZTkyM2QyMTU3MTAzNzEwMWY0N2I1M2Y1ZGIyMzQ4YTNkYjdjY2Y3NTZmZjAwM2RjN2I3MWFjZjE2YTdlMWUxMApib2R5CXRlc3RzL3B1Ymxpc2gtZ3JvdXAudGVzdC5tanMJYSBuZXN0ZWQgZ3JvdXAga2VlcHMgaXRzIG93biBib3VuZGFyeQk2ZWI5ZjMyMTQwNTExZjA4Y2I4Nzk4MWYwYWIyMGY1NGVjNjg2ZDBkYjBkYjJjYzY4NWFlMWVhNDUyZDBjZGVlCmJvZHkJdGVzdHMvcHVibGlzaC1ncm91cC50ZXN0Lm1qcwlhIHByaW50ZXIgbmFtZSBhIGRlZmluaXRpb24gc2hhZG93cyBpcyBub3QgcmVuZGVyZWQJODljN2NhYTJjYzRiNzY5MTUyM2YyMjY0NGYwMTBlOTZmM2ZjY2FkNzdiM2MzNjkwZGVkYzg3YTI0NDEzMjFkZQpib2R5CXRlc3RzL3B1Ymxpc2gtZ3JvdXAudGVzdC5tanMJYSByZWRpcmVjdGVkIG9yIGNvbmRpdGlvbmFsIHByaW50ZXIgaXMgbmV2ZXIgc3VtbWVkIGludG8gdGhlIHBpcGUJZTNmOTA3ODc3YjQxZmY4NDYyNTk1NThkOWZhMmQxYTFkMmFlNjFjMzE2MzdmZDAyNDQxZDBhNzJhY2I5MjM4Ygpib2R5CXRlc3RzL3B1Ymxpc2gtZ3JvdXAudGVzdC5tanMJYSBzdWJzaGVsbCBvZiBvbmUgY29tbWFuZCBpcyByZW5kZXJlZCB3aXRoIGl0cyByZWRpcmVjdGlvbnMJMTg0NmIzZmVjZDMzZWRkZWJmOGIyM2M2ZjFkMGIwMzM0YzFhOWIxNjJhYjBkOTg0MmY3MWIyZWJmYTBjNDQ1OApib2R5CXRlc3RzL3B1Ymxpc2gtZ3JvdXAudGVzdC5tanMJeGFyZ3MgcmVhZHMgYSBncm91cCdzIGJ5dGVzLCBub3QgaXRzIGxhc3QgY29tbWFuZAk1OTZkNWNlMzkxZGRkNWI2MDNlMzFlZjdjZDE3MTQ4ZWY1YWZiMmM4Nzc0NjRiNDU1MWI3OGRiODgwMzQ0NWUxCmJvZHkJdGVzdHMvcHVibGlzaC1ncm91cC50ZXN0Lm1qcwl4YXJncyBzcGxpdHMgaXRzIGlucHV0IGJ5IGl0cyBxdW90aW5nIHJ1bGVzLCBhbmQgaW5wdXQgaXQgY2Fubm90IHNwbGl0IGlzIHVucHJvdmVuCWVmYzZkZDFmNzExNTZlMDE5MjJiZDNkOTFjMDlkOWY1YWFiZDNhMWU2NDk0OTI5NGEwODkyMTZkYTU0YTUxNjcKYm9keQl0ZXN0cy9wdWJsaXNoLXNoZWxsLWFuc3dlcnMudGVzdC5tanMJYSBkZWZpbml0aW9uIHNoYWRvd3MgYSBwcmludGVyIG9ubHkgd2hlbiBpdCBydW5zIGVhcmxpZXIgaW4gYSBzaGVsbCB0aGUgZ3JvdXAgaW5oZXJpdHMJN2ZlOTc4MzgyODFmNTA3N2ExMmUzZTU5MzFhMjJlOGE5ODljOGRmMTM1OGZlNTAwNzZjNGU4NTcxYjAwZmYzYQpib2R5CXRlc3RzL3B1Ymxpc2gtc2hlbGwtYW5zd2Vycy50ZXN0Lm1qcwlhIGdyb3VwIGlzIGV2YWx1YXRlZCBsZWZ0IHRvIHJpZ2h0IG92ZXIgdGhlIHN0YXR1c2VzIGl0IGtub3dzLCBhbmQgYSBicmFuY2ggdGhlIHNoZWxsIHNraXBzIHdyaXRlcyBub3RoaW5nCTkyMGRmOWQ5YWZmY2QzYmIzMmQ0MjAyMzIxMDhjMDNjYjY4ZDcwMmQxNTAxODQ4OWFkYzNkODVlZWIxNGJjZTMKYm9keQl0ZXN0cy9wdWJsaXNoLXNoZWxsLWFuc3dlcnMudGVzdC5tanMJYSBncm91cCB0aGUgcmVhZGVyIGNhbm5vdCBwcm92ZSBpcyBjb3VsZC1ub3QtbG9vaywgdGhvdWdoIHRoZSBzaGVsbCBtYXkgcnVuIGl0cyBwdXNoCWRlYzRmZGU5NDgxZDNjNGViNGNhNmFhYjkzMmFlOTE0ODNlOGU5ZTFhMDAzMjIyYWJmNDQwMDZkMTRlNzc2MGYKYm9keQl0ZXN0cy9wdWJsaXNoLXNoZWxsLWFuc3dlcnMudGVzdC5tanMJYSBuZXN0ZWQgZ3JvdXAgb3Igc3Vic2hlbGwgY2FycmllcyBpdHMgbGFzdCBzdGF0dXMgdG8gdGhlIG9wZXJhdG9yIGFmdGVyIGl0CThjZTc0NDJlZmMzZTg5MGRhYWMyZGM3M2RmMzgwNGJlOGY4ZDk5ZjhjMWMwYzhmZTNmN2I2MTMzMjJkN2FhMWIKYm9keQl0ZXN0cy9wdWJsaXNoLXNoZWxsLWFuc3dlcnMudGVzdC5tanMJeGFyZ3MgcmVhZHMgYW4gZWNobyB3aG9zZSB0ZXh0IHRoZSBzaGVsbHMgZGlzYWdyZWUgb24gYXMgd3JpdHRlbiwgYW5kIHNwbGl0cyB3aGF0IGl0IGNhbgk5NjA4MGIwMzViMzc2OGQ4MGRiNTliZTVmYzEzNzU2NjQ0MDdlZWVjNTIxZTI0ZTU5YjkwNDliMzllMzVkMGQx · test-lock-kind:replace
- 2026-10-21 · b772c9a4* · exit 0 · `out=$(node --test --test-reporter=tap tests/publish-group.test.mjs tests/publish-errexit.test.mjs tests/qh-core-parity.test.mjs 2>&1) \ …` · acceptance-sha256:29ff6bd89bfb99a53f7312a3a78cd453b4442409f814e5225a73fabddcab595e · ms:8067
