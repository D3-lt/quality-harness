// ADR-120 T1 (Decision 1): a declared check is read through a grammar of lists, pipelines, groups, subshells and POSIX function
// definitions, so a check whose exit status every POSIX shell fixes is refused whatever its grouping, and one whose status
// depends on the shell is not. Every row below was run under /bin/bash, /bin/sh and /bin/dash before it was written, and the
// test runs it again where the shell exists (CLAUDE.md §16: a reading of shell semantics is a claim, so it is measured).
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { existsSync, realpathSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { constantSuccessCheck } from '../plugin/scripts/check-command.mjs'
import { parseShell } from '../plugin/scripts/shell-grammar.mjs'
import { shellWords } from '../plugin/scripts/shell-words.mjs'

const SHELLS = ['/bin/bash', '/bin/sh', '/bin/dash'].filter(shell => process.platform !== 'win32' && existsSync(shell))
// A shell is dash by what it IS, not by its path: Ubuntu's /bin/sh is dash, macOS's is bash (CI found the difference, 2026-10-21).
const dashLike = shell => path.basename(realpathSync(shell)) === 'dash'
const run = (shell, command) => spawnSync(shell, ['-c', command], { stdio: 'ignore', timeout: 10_000, windowsHide: true, cwd: os.tmpdir() }).status
// `npm test` stands in as a command that fails and as one that passes: a row whose status the text fixes gives the same answer
// with both. Returns, per shell, the exit statuses of the row.
const measured = row => SHELLS.map(shell => (row.includes('npm test') ? ['false', 'true'].map(word => row.replaceAll('npm test', word)) : [row])
  .map(command => run(shell, command)))
const parsed = row => parseShell(shellWords(row))

// The tree as one line: a command is `c<record>`, a group `{ … }`, a subshell `( … )`, a definition `name() { … }`.
const show = n => {
  switch (n.t) {
    case 'cmd': return `c${n.i}`
    case 'pipe': return '!'.repeat(n.bang) + n.kids.map(show).join(' | ')
    case 'andor': return n.kids.map((k, j) => (j ? ` ${n.ops[j - 1]} ` : '') + show(k)).join('')
    case 'list': return n.kids.map((k, j) => show(k) + (n.ops[j] === '&' ? ' &' : '')).join(' ; ')
    case 'group': return `{ ${show(n.kids[0])} }`
    case 'sub': return `( ${show(n.kids[0])} )`
    case 'def': return `${n.name}() { ${show(n.kids[0])} }`
    default: throw new Error(`unknown node ${n.t}`)
  }
}

const CONSTANT = ['true || { true; false; }', '! { true; false; }', '! { npm test; false; }', 'f() { false; } && true', '{ false & } || false',
  'true || true | { cat; false; }', 'false() { :; }; false',
  // Subshells, a background list, an exit inside a body, and a definition called through another (each 0 under all three).
  '(npm test) || true', '! (true; false)', 'npm test && true &', '(exit 0)', '{ exit 0; }', 'test -f x || { exit 0; }',
  'true() { false; }; /usr/bin/true', 'f() { :; }; g() { f; }; g', '(exit 1); true', 'true && false() { :; }; false']
const TWINS = ['true && { true; false; }', '! { true; npm test; }', '{ npm test; } && true', '{ npm test; } || false', 'true() { false; }; true',
  '{ npm test; } && { true; }', 'f() { false; }; f && npm test']
const BASH_ONLY = ['function f() { false; } && true', 'function f { false; } || false', 'function f { :; }; npm test']

test('a check whose status every POSIX shell fixes is refused, whatever its grouping', () => {
  for (const row of CONSTANT) {
    assert.equal(constantSuccessCheck(row), true, row)
    assert.notEqual(parsed(row), null, `${row}: a tree was read`)
    for (const [k, statuses] of measured(row).entries()) assert.deepEqual([...new Set(statuses)], [0], `${row} under ${SHELLS[k]}`)
  }
  // The tree names every group and where it ends.
  const shapes = {
    '{ true; false; } && true': '{ c0 ; c1 } && c2',
    '! { true; false; }': '!{ c0 ; c1 }',
    'f() { false; } && true': 'f() { c1 } && c2',
    '(true; false) || x': '( c0 ; c1 ) || c2',
    '{ false & } || false': '{ c0 & } || c1',
    'a | b && c & d': 'c0 | c1 && c2 & ; c3',
    '! ! true': '!!c0',
  }
  for (const [row, shape] of Object.entries(shapes)) assert.equal(show(parsed(row)), shape, row)
  // DIRTY: the same refusal does not fire on text the grammar cannot close.
  for (const row of ['{ true; false;', '(true; false', 'true; }', 'true; )']) assert.equal(constantSuccessCheck(row), false, row)
})

test('each refused grouping has a twin that can fail, and it is accepted', () => {
  for (const row of TWINS) {
    assert.equal(constantSuccessCheck(row), false, row)
    for (const [k, statuses] of measured(row).entries()) assert.ok(statuses.flat().some(status => status !== 0), `${row} can fail under ${SHELLS[k]}`)
  }
})

test('bash-only syntax and unclosed text are could-not-look, never constant', () => {
  for (const row of BASH_ONLY) {
    assert.equal(constantSuccessCheck(row), false, row)
    assert.equal(parsed(row), null, `${row}: the function keyword is not read`)
    const all = measured(row).flat(2)
    if (SHELLS.includes('/bin/bash') && SHELLS.includes('/bin/dash')) assert.ok(new Set(all).size > 1, `${row}: the shells differ on it`)
  }
  // Unclosed text is a syntax error under every shell, and nothing the check can claim.
  for (const row of ['{ npm test;', '(npm test', 'npm test; }']) {
    assert.equal(constantSuccessCheck(row), false, row)
    assert.equal(parsed(row), null, row)
    assert.equal(shellWords(row).closed, false, row)
  }
  for (const statuses of measured('{ npm test;')) assert.deepEqual([...new Set(statuses.flat())], [2])
  // Text the lexer closes but the grammar does not read: a `!` after a pipe (a syntax error under all three shells), a head
  // followed by a command that is not a body, a definition as a stage of a pipeline.
  for (const row of ['true | ! false', 'f() echo; { true; }', 'f() { :; } | cat']) assert.equal(parsed(row), null, row)
})

test('a definition that shadows a command gives its later calls the body\'s status', () => {
  assert.equal(constantSuccessCheck('false() { :; }; false'), true, 'body 0: refused')
  assert.equal(constantSuccessCheck('true() { false; }; true'), false, 'body 1: accepted')
  assert.equal(constantSuccessCheck('f() { npm test; }; f'), false, 'body unknown: accepted')
  // DIRTY: what the grammar cannot place is unknown, never the body's status.
  for (const row of [
    'npm test || false() { :; }; false', // defined on one path only
    'npm test && false() { :; }; false', // ...whichever side of the list defines it
    'false() { :; }; unset -f false; false', // the definition is removed
    ':() { false; }; :', 'exit() { :; }; exit 3', // a special builtin is found before a function
    'f() { f; }; f', // a call that never ends
    '(false() { :; }); false', // a definition in a subshell does not outlive it
  ]) assert.equal(constantSuccessCheck(row), false, row)
  // Measured where a POSIX shell exists; Windows has none of the three, and an empty measurement proves nothing.
  if (SHELLS.length) {
    for (const row of ['npm test || false() { :; }; false', 'npm test && false() { :; }; false', 'false() { :; }; unset -f false; false', '(false() { :; }); false']) {
      assert.ok(measured(row).flat(2).some(status => status !== 0), `${row} can fail`)
    }
  }
})

// Every field a record carried before the boundary fields: the pinned digest is of these, for every row below, so a change to
// one of them is a change to a reader (publish-command, the ledger guard) that is not this task's.
const OLD_FIELDS = ['argv', 'assignments', 'dynamic', 'quoted', 'code', 'heredocs', 'substitutions', 'pipeTo', 'ended', 'redirects', 'writes', 'negated', 'groupEnd']
const LEXED = [
  'true || { true; false; }', '! { true; false; }', '! { npm test; false; }', 'f() { false; } && true', '{ false & } || false',
  'true || true | { cat; false; }', 'false() { :; }; false', 'true && { true; false; }', '! { true; npm test; }',
  '{ npm test; } && true', '{ npm test; } || false', 'true() { false; }; true', 'function f() { false; } && true',
  'function f { false; } || false', 'function f { :; }; npm test', '{ npm test;', '(true; false) || x', '! (npm test) && true',
  'npm test 2>&1 | tee log', 'npm test |& tee -a log', 'cat <<EOF\nhi $(date)\nEOF\nnpm test', "git commit -m 'x' && git push",
  'FOO=1 BAR=2 baz --qux', 'a && b || c &', 'echo $(date) `uname` "$x" \'y\'', '{ a; } | b', '{ true || false; } | { cat; }',
  'echo hi > out.txt; cat < in.txt', 'test -f x || exit 0', 'sh -c "npm test || :"', '! ! true', 'echo {a,b}c *.js', 'npm test # comment',
  // The older mechanisms of the lexer's group handling (a `!` before a group, the operator after its `}`, a definition ended by
  // the next command), which the classifier no longer reads: this pin is what holds them now.
  '! { npm test; }', '! { false; npm test; }', '! { ! false; }', '! { true; } &', '{ true || false; } | { false && true; } | cat',
  '{ npm test & } && true', 'function f ( ) { npm test; } && true', 'function f\n{ npm test; } && true',
  'function f() if true\nthen :\nfi\n{ true; } || npm test', 'function f() (( 1 ))\n{ true; } || npm test', 'function f { npm test; } && true',
  '{ true; } |& cat', '! false', 'npm test || ! false | false', '(exit 1); true', '{ { true; } }', 'f() { :; }; g() { f; }; g',
]
const OLD_DIGEST = 'e5edb218810d099a13458ea3389954ce97cadb07c8ec8937be6b51a2786f0ec0'

test('the lexer\'s new boundary fields leave every existing field unchanged', () => {
  const projection = LEXED.map(text => {
    const words = shellWords(text)
    return { complete: words.complete, commands: words.commands.map(c => Object.fromEntries(OLD_FIELDS.filter(k => k in c).map(k => [k, c[k]]))) }
  })
  assert.equal(createHash('sha256').update(JSON.stringify(projection)).digest('hex'), OLD_DIGEST)

  // The new fields: where a construct opens and closes, what follows its close, and whether the text closed every one.
  const group = shellWords('{ npm test; } && true')
  assert.equal(group.closed, true)
  assert.deepEqual(group.commands[0].opens, [{ kind: 'group', name: '', bangs: 0 }])
  assert.deepEqual(group.commands[0].closes, [{ kind: 'group', joiner: '&&' }])
  assert.equal(group.commands[0].terminator, ';')
  assert.deepEqual(group.commands[1].opens, [])
  assert.equal(shellWords('! { true; false; }').commands[0].opens[0].bangs, 1)
  assert.equal(shellWords('! ! true').commands[0].bangs, 2)
  const definition = shellWords('f() { false; } && true')
  assert.equal(definition.commands[0].defines, 'f')
  assert.deepEqual(definition.commands[1].opens, [{ kind: 'definition', name: 'f', bangs: 0 }])
  assert.deepEqual(definition.commands[1].closes, [{ kind: 'definition', joiner: '&&' }])
  const nested = shellWords('( { true; } ; false ) | cat')
  assert.deepEqual(nested.commands[0].opens.map(o => o.kind), ['subshell', 'group'])
  assert.deepEqual(nested.commands[0].closes, [{ kind: 'group', joiner: ';' }])
  assert.deepEqual(nested.commands[1].closes, [{ kind: 'subshell', joiner: '|' }])
  // A head that is followed by a command, not a body, leaves the next group a group again; a pipe after a close is its joiner.
  assert.deepEqual(shellWords('f() echo; { true; }').commands.at(-1).opens.map(o => o.kind), ['group'])
  assert.deepEqual(shellWords('{ true; } | cat').commands[0].closes, [{ kind: 'group', joiner: '|' }])
  assert.deepEqual(shellWords('{ true & }').commands[0].terminator, '&')
  // DIRTY: the text that does not close, or that this grammar does not read, says so.
  for (const text of ['{ npm test;', '(npm test', 'true; }', 'function f { :; }', 'echo (', 'case x in a) true;; esac', 'f() ( true )', '{ true; } > log', '{ ; }',
    '{ true; } echo hi', '{ true )', '( true; }', 'f (a)', 'true; )', 'f() (( 1 ))\n{ true; }']) {
    assert.equal(shellWords(text).closed, false, text)
  }
  for (const text of ['true', '{ true; }', '(true)', 'f() { true; }', '{ { true; } }', '{ true; } | cat']) assert.equal(shellWords(text).closed, true, text)
})

// The shell keeps an exit status modulo 256, so `exit 256` exits 0 under bash, sh and dash, and a check ending in it cannot fail
// (found in ADR-120 T1's round, 2026-10-21). Past INT_MAX the shells disagree: dash refuses the number (2), bash wraps it.
test('an exit status wraps modulo 256, and one past INT_MAX is could-not-look', () => {
  const constant = ['npm test; exit 256', 'npm test; exit 512', 'npm test; exit 000']
  const real = ['npm test; exit 257', 'npm test; exit 2147483648', 'npm test; exit 99999999999999999999']
  for (const row of constant) {
    for (const statuses of measured(row)) assert.deepEqual(statuses, [0, 0], `${row} exits 0 in every shell`)
    assert.equal(constantSuccessCheck(row), true, row)
  }
  for (const row of real) assert.equal(constantSuccessCheck(row), false, row)
  // DIRTY twin: an exit the text fixes at a nonzero status is no constant success.
  assert.equal(constantSuccessCheck('npm test; exit 1'), false)
})

// ADR-120 T1, the Codex review of ee802e5d..8d021b2a (2026-10-21). Each row below was measured under /bin/bash, /bin/sh and
// /bin/dash before the fix; the answers are in the assertions.
test('a function named like a pass-through sink is the function, not the sink', () => {
  // `cat` is shadowed by a body that fails: `! false | cat` is 0 in every shell, `false | cat` is 1.
  const constant = 'cat() { false; }; ! false | cat'
  const real = 'cat() { false; }; false | cat'
  for (const statuses of measured(constant)) assert.deepEqual(statuses, [0], `${constant} exits 0 in every shell`)
  for (const statuses of measured(real)) assert.deepEqual(statuses, [1], `${real} exits 1 in every shell`)
  assert.equal(constantSuccessCheck(constant), true, constant)
  assert.equal(constantSuccessCheck(real), false, real)
  // DIRTY twin: the unshadowed sink still passes whatever came through, so `false | cat` is 0.
  assert.equal(constantSuccessCheck('false | cat'), true)
  assert.equal(constantSuccessCheck('! false | cat'), false)
})

test('a signed exit status is read only where every shell agrees', () => {
  for (const row of ['npm test; exit +256', 'npm test; exit +0']) {
    for (const statuses of measured(row)) assert.deepEqual(statuses, [0, 0], `${row} exits 0 in every shell`)
    assert.equal(constantSuccessCheck(row), true, row)
  }
  for (const statuses of measured('exit +1')) assert.deepEqual(statuses, [1], 'exit +1 exits 1 in every shell')
  assert.equal(constantSuccessCheck('npm test; exit +1'), false)
  // `exit -1` is 255 under bash and sh, and a refused number (2) under dash: could-not-look.
  assert.deepEqual(measured('exit -1').map(s => s[0]), SHELLS.map(shell => (dashLike(shell) ? 2 : 255)))
  assert.equal(constantSuccessCheck('npm test; exit -1'), false)
})

test('a negated definition head and an exit with extra operands are could-not-look', () => {
  // `! f() { :; }` is 1 in every shell: the definition head's bang is not dropped.
  for (const statuses of measured('! f() { :; }')) assert.deepEqual(statuses, [1], '! f() { :; } exits 1')
  assert.equal(constantSuccessCheck('! f() { :; }'), false)
  assert.equal(parsed('! f() { :; }'), null)
  // DIRTY twin: the same definition without the bang is read, and exits 0.
  assert.equal(constantSuccessCheck('f() { :; }'), true)
  // `exit 256 1` is 1 under bash and sh ("too many arguments") and 0 under dash.
  assert.deepEqual(measured('exit 256 1').map(s => s[0]), SHELLS.map(shell => (dashLike(shell) ? 0 : 1)))
  for (const row of ['exit 256 1', 'npm test; exit 256 1', 'npm test; exit 0 1']) assert.equal(constantSuccessCheck(row), false, row)
  assert.equal(constantSuccessCheck('npm test; exit 256'), true)
})
