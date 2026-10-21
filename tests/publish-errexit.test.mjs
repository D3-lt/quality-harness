// ADR-120 T2, the Codex review of 7a9107e8..dcc4693a: a group that is a pipeline stage inherits `set -e` from the shell around it and
// ends at the first command whose failure errexit acts on, so `set -e; { false; echo 'git push'; } | sh` runs no push. Every row below
// was run into `sh` under `env -i` with a stub for git first on PATH (checked with `command -v git` before each batch), under /bin/sh
// and /bin/dash only, and gave the same answer from both (2026-10-21): a row in `publishes` ran the stub with `push`, one in
// `publishesNothing` ran no push. A reader may be less precise than the shell, never more: a row the shell runs and this reads as
// null is named in the comment above it.
import assert from 'node:assert/strict'
import test from 'node:test'
import { publishCommandIn } from '../plugin/scripts/publish-command.mjs'

const publishes = rows => { for (const row of rows) assert.equal(publishCommandIn(row), 'git push', row) }
const publishesNothing = rows => { for (const row of rows) assert.equal(publishCommandIn(row), null, row) }

test('a group under errexit ends at the first failure errexit acts on, and writes nothing after it', () => {
  publishesNothing([
    'set -e; { false; echo \'git push\'; } | sh',
    'set -e; ( false; echo \'git push\' ) | sh',
    'set -o errexit; { false; echo \'git push\'; } | sh',
    'set -eu; { false; echo \'git push\'; } | sh',
    'set -euo pipefail; { false; echo \'git push\'; } | sh',
    'set -e; set -x; { false; echo \'git push\'; } | sh',
    'set +e; set -e; { false; echo \'git push\'; } | sh',
    'set -e; set -- a b; { false; echo \'git push\'; } | sh',
    'set -e; set +e -e; { false; echo \'git push\'; } | sh',
    'set -e; ( set -e ); { false; echo \'git push\'; } | sh',
    'set -e; { true; false; echo \'git push\'; } | sh',
    'set -e; { true && false; echo \'git push\'; } | sh',
    'set -e; { false || false; echo \'git push\'; } | sh',
    'set -e; { false && true || false; echo \'git push\'; } | sh',
    'set -e; { true && true && false; echo \'git push\'; } | sh',
    'set -e; { ( false && true ); echo \'git push\'; } | sh',
    'set -e; { { false; }; echo \'git push\'; } | sh',
    'set -e; { ( false; echo x ); echo \'git push\'; } | sh',
    'set -e; { true && { false; echo \'git push\'; }; } | sh',
    'set -e; { true && ( false; echo \'git push\' ); } | sh',
    'set -e; { true; { false; echo \'git push\'; } | sh; }',
  ])
  // DIRTY twins: the same words where errexit is off, or the failure is one the shell does not act on, or the print comes first.
  publishes([
    '{ false; echo \'git push\'; } | sh',
    'set -e; set +e; { false; echo \'git push\'; } | sh',
    'set -e; set -o errexit +o errexit; { false; echo \'git push\'; } | sh',
    'set -e; set +o errexit; { false; echo \'git push\'; } | sh',
    'set -e; set +eu; { false; echo \'git push\'; } | sh',
    'set -e; set -e +e; { false; echo \'git push\'; } | sh',
    'set -e; { false || true; echo \'git push\'; } | sh',
    'set -e; { echo \'git push\'; false; } | sh',
    'set -e; { true; echo \'git push\'; } | sh',
    'set -e; { false && true; echo \'git push\'; } | sh',
    'set -e; { false && false; echo \'git push\'; } | sh',
    'set -e; { true || false; echo \'git push\'; } | sh',
    // The left side of `&&` or `||` is not acted on, and neither is the last pipeline when the one before it supplied the status.
    'set -e; { false || false && true; echo \'git push\'; } | sh',
    'set -e; { { false; } && true; echo \'git push\'; } | sh',
    'set -e; { { false; echo \'git push\'; } && true; } | sh',
    'set -e; { ( false; echo \'git push\' ) && true; } | sh',
    'set -e; { ( false; echo \'git push\' ) || true; } | sh',
    // A group whose last command ran under an operator ends non-zero without ending the shell; a subshell's non-zero status does.
    'set -e; { { false && true; }; echo \'git push\'; } | sh',
    'set -e; { true && { false && true; }; echo \'git push\'; } | sh',
    // errexit is ignored in everything a pipeline left of `&&` runs, the group's pipe included.
    'set -e; { { false; echo \'git push\'; } | sh; } && true',
    // A set in an earlier pipeline stage or a subshell is another shell's.
    'set -e | cat; { false; echo \'git push\'; } | sh',
    '(set -e); { false; echo \'git push\'; } | sh',
    'set -e; { false; echo push; } | xargs git; set +e; { false; echo push; } | xargs git',
  ])
})

test('an earlier statement that may change errexit unseen leaves the group could-not-look when errexit decides what it writes', () => {
  // The state is unknown after a set this does not read, `eval`, `.`, `source`, `command`, `builtin`, a call to a function defined
  // earlier or a command word the shell expands. Each row below writes different bytes with errexit on and off, so it is null here
  // (the shell pushes in some of them and not in others: a reader may say less than the shell, not more).
  publishesNothing([
    'set -e; set "$FLAGS"; { false; echo \'git push\'; } | sh',
    'set -e; true && set +e; { false; echo \'git push\'; } | sh',
    'set -e; set +e & { false; echo \'git push\'; } | sh',
    'set -e; set -o vi; { false; echo \'git push\'; } | sh',
    'set -e; set -E; { false; echo \'git push\'; } | sh',
    'set -e; set +e >/dev/null; { false; echo \'git push\'; } | sh',
    'set -e; { set +e; false; echo \'git push\'; } | sh',
    'set -e; eval \'set +e\'; { false; echo \'git push\'; } | sh',
    'eval \'set -e\'; { false; echo \'git push\'; } | sh',
    'set -e; command set +e; { false; echo \'git push\'; } | sh',
    'set -e; builtin set +e; { false; echo \'git push\'; } | sh',
    'set -e; . ./r.sh; { false; echo \'git push\'; } | sh',
    'set -e; source ./r.sh; { false; echo \'git push\'; } | sh',
    'f() { set +e; }; set -e; f; { false; echo \'git push\'; } | sh',
    'f() { set -e; }; f; { false; echo \'git push\'; } | sh',
    'set -e; $NOSUCH; { false; echo \'git push\'; } | sh',
    // The same where errexit was not on before them: unseen, it may be on now, so it is not read as off.
    'set "$FLAGS"; { false; echo \'git push\'; } | sh',
    '$NOSUCH; { false; echo \'git push\'; } | sh',
    'command set -e; { false; echo \'git push\'; } | sh',
    '. ./r.sh; { false; echo \'git push\'; } | sh',
    'source ./r.sh; { false; echo \'git push\'; } | sh',
  ])
  // DIRTY twins: the same unseen statements where errexit does not change what the group writes (the print is before the failure),
  // so the group is read as before and is a publish. All of these push under /bin/sh and /bin/dash.
  publishes([
    'set -e; set "$FLAGS"; { echo \'git push\'; false; } | sh',
    'set -e; true && set +e; { echo \'git push\'; false; } | sh',
    'set -e; eval \'set +e\'; { echo \'git push\'; false; } | sh',
    'set -e; eval \'set +e\'; { echo \'git push\'; } | sh',
    'eval \'set -e\'; { echo \'git push\'; false; } | sh',
    'set -e; $NOSUCH; { echo \'git push\'; false; } | sh',
    'f() { set +e; }; set -e; f; { echo \'git push\'; false; } | sh',
  ])
})

test('an earlier statement whose status ends the shell leaves the group nothing to write', () => {
  publishesNothing([
    'set -e; false; { echo \'git push\'; } | sh',
    'set -eu; false; { echo \'git push\'; } | sh',
    'set -e; { false; } ; { echo \'git push\'; } | sh',
    'set -e; true; false; { echo \'git push\'; } | sh',
    'set -e; ( false ); { echo \'git push\'; } | sh',
    'set -e; true && false; { echo \'git push\'; } | sh',
    'set -e; false || false; { echo \'git push\'; } | sh',
    'set -e; { true && { false; }; }; { echo \'git push\'; } | sh',
    'set -e; { false; { echo \'git push\'; } | sh; }',
    'set -e; { true; } && { false; { echo \'git push\'; } | sh; }',
    'set -e; false; { echo push; } | xargs git',
  ])
  // DIRTY twins: a failure errexit does not act on, an errexit that is off, an earlier status this does not know.
  publishes([
    'set -e; false || true; { echo \'git push\'; } | sh',
    'set +e; false; { echo \'git push\'; } | sh',
    'set -e; false && true; { echo \'git push\'; } | sh',
    'set -e; { false && true; }; { echo \'git push\'; } | sh',
    'set -e; { false; } && true; { echo \'git push\'; } | sh',
    'set -e; echo hi; { echo \'git push\'; } | sh',
    'set -e; { true; } ; { echo \'git push\'; } | sh',
    'set -e; false & { echo \'git push\'; } | sh',
    'set -e; false | cat; { echo \'git push\'; } | sh',
    'set -e; cat /dev/null; { echo \'git push\'; } | sh',
    'set -e; set +e; false; set -e; { echo \'git push\'; } | sh',
    'set "$FLAGS"; false; { echo \'git push\'; } | sh',
    'set -e; { false; { echo \'git push\'; } | sh; } && true',
    'set +e; false; { echo push; } | xargs git',
  ])
})
