// ADR-120 T2, the Codex review of c749638e..7a9107e8: what a group writes to a shell or to xargs is read the way the shell runs it, and
// a reader that cannot tell says null. Every row below was run into `sh` (or `xargs git`) with a stub for git on PATH, under /bin/sh
// and /bin/dash, and gave the same answer from both (2026-10-21): a row in `publishes` ran the stub with `push`, one in
// `publishesNothing` ran no push. A reader may be less precise than the shell, never more: a row the shell runs and this reads as
// null is not asserted here.
import assert from 'node:assert/strict'
import test from 'node:test'
import { publishCommandIn } from '../plugin/scripts/publish-command.mjs'

const publishes = rows => { for (const row of rows) assert.equal(publishCommandIn(row), 'git push', row) }
const publishesNothing = rows => { for (const row of rows) assert.equal(publishCommandIn(row), null, row) }

test('a group is evaluated left to right over the statuses it knows, and a branch the shell skips writes nothing', () => {
  publishes([
    '{ false || echo \'git push\'; } | sh',
    '{ echo hi && echo \'git push\'; } | sh',
    '{ echo \'git push\' && echo hi; } | sh',
    '{ true && echo \'git push\'; } | sh',
    '{ false || false || echo \'git push\'; } | sh',
    '{ echo hi >/dev/null && echo \'git push\'; } | sh',
    '{ :; echo \'git push\'; } | sh',
    '{ true; false; echo \'git push\'; } | sh',
    '{ false; echo \'git push\'; } | sh',
    '{ { false || echo \'git push\'; }; } | sh',
    '(true && echo \'git push\') | sh',
    // `||` and `&&` associate to the left: the push runs, and the pull after it does not.
    '{ false || echo \'git push\' || echo \'git pull\'; } | sh',
    '{ true || echo x && echo \'git push\'; } | sh',
    '{ false && echo x || echo \'git push\'; } | sh',
    '{ false && echo x || echo hi; echo \'git push\'; } | sh',
    '{ false || echo push; } | xargs git',
    '{ true && echo push; } | xargs git',
    '{ :; echo push; } | xargs git',
  ])
  // DIRTY twins: the same words, whose branch the shell skips, or whose first line is a comment.
  publishesNothing([
    '{ true || echo \'git push\'; } | sh',
    '{ false && echo \'git push\'; } | sh',
    '{ echo hi; false && echo \'git push\'; } | sh',
    '{ echo \'#\' || echo \'git push\'; } | sh',
    '{ true || echo push; } | xargs git',
    '{ false && echo push; } | xargs git',
    '{ :; echo push >/dev/null; } | xargs git',
  ])
})

test('a definition shadows a printer only when it runs earlier in a shell the group inherits', () => {
  // Measured: these run the builtin, because the definition comes after the pipeline or is in a subshell. (One in the reader's own
  // stage, `… | { echo() { :; }; sh; }`, runs it too; the reader does not look into that stage and says null.)
  publishes([
    '{ echo \'git push\'; echo hi; } | sh; echo() { :; }',
    '(echo() { :; }); { echo \'git push\'; echo hi; } | sh',
  ])
  // DIRTY twins: the definition runs first, in this shell, in a group that runs here, or inside the group itself.
  publishesNothing([
    'echo() { :; }; { echo \'git push\'; echo hi; } | sh',
    '{ echo() { :; }; }; { echo \'git push\'; echo hi; } | sh',
    '{ echo() { :; }; echo \'git push\'; } | sh',
    'echo() { :; }; (echo \'git push\') | sh',
    'echo() { :; }; { false || echo \'git push\'; } | sh',
    'echo() { :; }; { echo hi; } | cat; { echo \'git push\'; } | sh',
    // A silent builtin that the text redefines has a status this does not know.
    'false() { :; }; { false || echo \'git push\'; } | sh',
  ])
})

test('xargs reads an echo whose text the shells disagree on as written, and splits what it can', () => {
  publishes([
    // dash's echo stops at `\c`, so xargs is given `push ` and runs `git push`; the quote that never closes is only in the text.
    'echo \'push \\c"\' | xargs git',
    'echo "p\\ush" | xargs git',
    '{ cat f; echo x; } | xargs git push',
  ])
  // DIRTY twins: a quote that never closes in text the echo prints as written makes xargs fail before it runs git.
  publishesNothing([
    'echo \'push "\' | xargs git',
    '{ echo \'push "\'; echo x; } | xargs git',
  ])
})

test('a group the reader cannot prove is could-not-look, though the shell may run its push', () => {
  // Each of these pushes under /bin/sh and /bin/dash (2026-10-21) and is null here: a background, a pipeline of several stages, a
  // program that may write anything, a negation, a redirection of a descriptor that may be closed. A reader may say less than the
  // shell; it may not say more.
  publishesNothing([
    '{ echo hi & echo \'git push\'; } | sh',
    '{ echo hi; echo \'git push\' | cat; } | sh',
    '{ cat f; echo \'git push\'; } | sh',
    '{ ! true || echo \'git push\'; } | sh',
    '{ echo hi >&3 || echo \'git push\'; } | sh',
  ])
  // DIRTY twin: a negation the reader does not read must never turn a skipped push into one (`! false` is status 0, so `||` skips).
  publishesNothing(['{ ! false || echo \'git push\'; } | sh'])
})

test('a nested group or subshell carries its last status to the operator after it', () => {
  publishes([
    '{ { false; } || echo \'git push\'; } | sh',
    '{ (false) || echo \'git push\'; } | sh',
    '{ { echo hi; } && echo \'git push\'; } | sh',
  ])
  publishesNothing([
    '{ { true; } || echo \'git push\'; } | sh',
    '{ { false; true; } || echo \'git push\'; } | sh',
  ])
})
