// ADR-120 T2 (Decision 2): what a group of several commands pipes to a shell or to xargs is the bytes its supported printers write
// to stdout, in order. Every row was run into `sh` with a stub for git on PATH, under /bin/sh and /bin/dash (the same answer from
// both, 2026-10-21): a row below that is a publish ran the stub, and one that is not ran a comment or nothing. A group holding
// anything the renderer does not read (`&&`, `||`, `&`, another program, an option, a substitution, an unsupported redirection)
// is could-not-look: it answers null, which is not the same as "not a publish" (the rows say so beside the real run).
import assert from 'node:assert/strict'
import test from 'node:test'
import { publishCommandIn } from '../plugin/scripts/publish-command.mjs'
import { shellWords } from '../plugin/scripts/shell-words.mjs'

const publishes = rows => { for (const row of rows) assert.equal(publishCommandIn(row), 'git push', row) }
const publishesNothing = rows => { for (const row of rows) assert.equal(publishCommandIn(row), null, row) }

test('a group piped to a shell is read through the bytes it prints', () => {
  publishes([
    // BACKLOG §393's fail-open: the shell runs the second line.
    "{ echo hi; echo 'git push'; } | sh",
    "{ printf %s '#'; printf '%s\\n' x; echo 'git push'; } | sh",
    "{ printf %s '#' >&2; printf 'git p%s\\n' ush; } | sh",
    // One command, or one pipeline, is still read as it was.
    "{ echo 'git push'; } | sh",
    "{ echo 'git push' | cat; } | sh",
    "{ echo 'git push'; echo hi; } | sh",
    // echo ends its line, so a comment ends with it; printf repeats its format, fills a missing argument with nothing, and
    // reads \n and \t.
    "{ printf %s '#'; echo hi; echo 'git push'; } | sh",
    "{ printf '%s\\n' hi 'git push'; echo x; } | sh",
    "{ printf 'git p%s%s\\n' ush; echo x; } | sh",
    "{ printf 'git\\tpush\\n'; echo x; } | sh",
    "{ echo ; echo 'git push'; } | sh",
    // A nested group is part of the same stream; so is a subshell.
    "{ { echo hi; echo 'git push'; }; echo x; } | sh",
    "(echo hi; echo 'git push') | sh",
    // A printer sent to a file writes nothing to the pipe; one with stderr joined to stdout writes as usual.
    "{ echo hi >/dev/null; echo 'git push'; } | sh",
    "{ echo 'git push' 2>&1; echo x; } | sh",
    "{ echo git push; echo hi; } | sh",
    "{ A=1 echo hi; echo 'git push'; } | sh",
    "{ (echo hi; echo 'git push'); echo x; } | sh",
    // A pass-through cat carries the group's bytes on.
    "{ echo hi; echo 'git push'; } | cat | sh",
  ])
  // DIRTY twins: the same shapes, whose bytes are a comment or no command.
  publishesNothing([
    "{ echo hi; } | sh",
    "{ printf %s '#'; echo 'git push'; } | sh",
    "{ printf %s '#'; printf '%s' 'git push'; echo; } | sh",
    "{ printf 'a\\n'; printf %s '#'; echo 'git push'; } | sh",
    "{ echo '#' 'git push'; echo x; } | sh",
    "(printf %s '#'; echo 'git push') | sh",
    "{ printf %s '#'; printf '%s' 'x\\n'; echo 'git push'; } | sh",
    "{ printf %s '#'; echo 'git push'; } | cat | sh",
  ])
})

test('a redirected or conditional printer is never summed into the pipe', () => {
  // The lexer keeps each redirection's source descriptor, operator and target, in order; `writes` is unchanged (a duplication
  // is not a file).
  const redirections = text => shellWords(text).commands[0].redirections
  assert.deepEqual(redirections('printf %s x 2>&1 >&2'), [
    { fd: '2', op: '>&', target: '1', dynamic: false }, { fd: '', op: '>&', target: '2', dynamic: false }])
  assert.deepEqual(redirections('echo hi >out 1>>log <in'), [
    { fd: '', op: '>', target: 'out', dynamic: false }, { fd: '1', op: '>>', target: 'log', dynamic: false },
    { fd: '', op: '<', target: 'in', dynamic: false }])
  assert.deepEqual(redirections('echo hi >$f &>g'), [
    { fd: '', op: '>', target: '$f', dynamic: true }, { fd: '', op: '&>', target: 'g', dynamic: false }])
  assert.deepEqual(redirections('cat <<EOF\nx\nEOF'), [{ fd: '', op: '<<', target: 'EOF', dynamic: false }])
  assert.deepEqual(redirections('echo a2>f'), [{ fd: '', op: '>', target: 'f', dynamic: false }])
  assert.deepEqual(shellWords('echo a2>f').commands[0].argv, ['echo', 'a2'])
  assert.deepEqual(redirections('echo hi'), [])
  assert.deepEqual(shellWords('echo hi 2>&1').commands[0].writes, [])

  // Stdout sent away, or into the error stream, writes nothing to the pipe; the next line is what the shell runs.
  publishes([
    "{ printf %s '#' >&2; printf 'git p%s\\n' ush; } | sh",
    "{ printf %s '#' 1>&2; echo 'git push'; } | sh",
    "{ printf %s '#' >/dev/null; echo 'git push'; } | sh",
    // The review of c749638e..7a9107e8 (fix round 3): `&&` and `||` over known statuses are read as the shell runs them, so
    // these three, each measured to push under /bin/sh and /bin/dash, moved here from could-not-look (T2 relocked).
    "{ false || echo 'git push'; } | sh",
    "{ echo hi && echo 'git push'; } | sh",
    "{ echo 'git push' && echo hi; } | sh",
  ])
  // Stderr joined to stdout writes into the pipe, so the same group is a comment; stdout sent away takes its text with it.
  publishesNothing([
    "{ printf %s '#' 2>&1; printf 'git p%s\\n' ush; } | sh",
    "{ printf 'git push\\n' >/dev/null; echo hi; } | sh",
    "{ printf 'git push\\n' >&2; echo hi; } | sh",
    "{ printf 'git push\\n' 1>&2; echo hi; } | sh",
    "{ echo 'git push' >> log; echo hi; } | sh",
    "{ echo 'git push' 1>out; echo hi; } | sh",
  ])
  // Could-not-look: a joiner, a background, another program, an option or escape, a word the lexer cannot read, a conversion or
  // an escape outside the model, and a redirection outside the two it reads. Some of these really push (a background, the
  // `echo -n` row), which is why they are could-not-look and not "not a publish".
  publishesNothing([
    "{ echo '#' || echo 'git push'; } | sh",
    "{ echo hi & echo 'git push'; } | sh",
    "{ echo -e 'git\\x20push'; } | sh",
    "{ echo -n; echo 'git push'; } | sh",
    "{ echo 'a\\nb'; echo 'git push'; } | sh",
    "{ cat f; echo 'git push'; } | sh",
    "{ echo $x; echo 'git push'; } | sh",
    "{ printf '%d\\n' 1; echo 'git push'; } | sh",
    "{ printf '\\x41\\n'; echo 'git push'; } | sh",
    "{ printf %s '#' >&3; echo 'git push'; } | sh",
    "{ printf %s '#' 3>&1; echo 'git push'; } | sh",
    "{ printf %s '#' 2>&1 >&2; echo 'git push'; } | sh",
    "{ echo 'git push' 2>/dev/null; echo hi; } | sh",
    "{ echo hi; printf %s '#' >&2; echo 'git push'; } |& sh",
    "{ echo hi >&2 2>&1; echo 'git push'; } | sh",
    "{ echo hi >$f; echo 'git push'; } | sh",
    "{ echo hi 2>/dev/null; echo 'git push'; } | sh",
    "{ echo hi; echo 'git push' | cat; } | sh",
    "{ A=$(echo x) echo hi; echo 'git push'; } | sh",
    "{ printf '-\\n'; echo 'git push'; } | sh",
  ])
})

test('a nested group keeps its own boundary', () => {
  // The inner group's own boundary decides what its pipe carries, whatever the outer group does after it (BACKLOG §393).
  publishesNothing([
    "{ { printf %s '#'; echo 'git push'; } | sh; echo MARK; } | cat",
    "( { printf %s '#'; echo 'git push'; } | sh; echo MARK ) | cat",
    "{ printf %s '#'; echo 'git push'; } | sh; { echo hi; echo 'git push'; } | cat",
    // Text the grammar does not read keeps the boundary the lexer marked.
    "{ printf %s '#'; echo 'git push'; } | sh; case x in a) :;; esac",
  ])
  // DIRTY twins: the inner group's bytes run a push; so does a lone command, and so does a group whose reader is inside it.
  publishes([
    "{ { echo hi; echo 'git push'; } | sh; echo MARK; } | cat",
    "( { echo hi; echo 'git push'; } | sh; echo MARK ) | cat",
    "{ echo 'git push'; } | sh; { printf %s '#'; echo x; } | cat",
    "{ echo 'git push'; } | sh; case x in a) :;; esac",
    "echo 'git push' | { sh; }",
  ])
})

test("xargs reads a group's bytes, not its last command", () => {
  publishesNothing([
    "{ printf %s '#'; echo push; } | xargs git",
    "{ cat f; echo push; } | xargs git",
    "{ echo x && echo push; } | xargs git",
    "{ echo hi; } | xargs git",
  ])
  // DIRTY twins: the group's own text builds the push, wherever it sits in the group.
  publishes([
    "{ echo push; echo x; } | xargs git",
    "{ echo x; echo push; } | xargs -I{} git {}",
    "{ printf 'push\\n'; echo x; } | xargs git",
    "{ echo push; } | xargs git",
    "(echo push; echo x) | xargs git",
    "{ printf %s '#' >&2; echo push; } | xargs git",
    "echo push | xargs git",
    // An input the renderer cannot read does not hide what the xargs words name themselves.
    "{ cat f; echo x; } | xargs git push",
    "{ cat f; echo x; } | xargs -I{} git push {}",
  ])
})

// ADR-120 T2, the Codex review of 692a869c. Every row was run with a stub for git on PATH under /bin/sh and /bin/dash (the same
// answer from both, 2026-10-21): a row in `publishes` ran the stub with `push`, one in `publishesNothing` ran no git at all.
test("a group the renderer cannot read still gives xargs what its printers write", () => {
  // `:`, `true` and `false` write nothing, so the group's text is its printers' words; T2 read these as nothing.
  publishes([
    "{ :; echo push; } | xargs git",
    "{ false || echo push; } | xargs git",
    "{ true; echo push; } | xargs git",
  ])
  // DIRTY twins: a program that may write anything first, or words that do not name the verb, are still not a push.
  publishesNothing([
    "{ :; cat f; echo push; } | xargs git",
    "{ echo x && echo push; } | xargs git",
  ])
})

test("a printer name a definition shadows is not rendered", () => {
  publishesNothing([
    "echo() { :; }; { echo 'git push'; echo hi; } | sh",
    "echo() { :; }; { echo push; echo x; } | xargs git",
    "echo() { :; }; { :; echo push; } | xargs git",
    "printf() { :; }; { printf 'git push\\n'; echo hi; } | sh",
  ])
  // DIRTY twins: a definition of another name shadows nothing here.
  publishes([
    "printf() { :; }; { echo 'git push'; echo hi; } | sh",
    "printf() { :; }; { echo push; echo x; } | xargs git",
  ])
})

test("a subshell of one command is rendered with its redirections", () => {
  publishesNothing([
    "(echo 'git push' >/dev/null) | sh",
    "(echo 'git push' >&2) | sh",
    "(echo push >/dev/null) | xargs git",
  ])
  // DIRTY twins: stdout stays when only stderr is redirected, or nothing is.
  publishes([
    "(echo 'git push') | sh",
    "(echo 'git push' 2>/dev/null) | sh",
    "(echo push) | xargs git",
  ])
})

test("xargs splits its input by its quoting rules, and input it cannot split is unproven", () => {
  // A quote it cannot close makes xargs fail before it runs git.
  publishesNothing([
    "{ echo 'push \"'; echo x; } | xargs git",
    "echo 'push \"' | xargs git",
    "echo \"push 'o\" | xargs git",
    "{ echo 'push \"a'; echo 'b\"'; } | xargs git",
  ])
  // DIRTY twins: a quote that closes groups its words, a backslash takes the next character, and the words are the verb.
  publishes([
    "{ echo 'push \"a b\"'; echo x; } | xargs git",
    "{ echo \"'push'\"; echo x; } | xargs git",
    "echo \"p\\ush\" | xargs git",
    "echo 'push \\' | xargs git",
  ])
})
