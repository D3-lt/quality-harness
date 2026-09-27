// ADR-067 T1 — the lexer rule P reads shell text with, proved against real shells.
//
// CLAUDE.md §16: a reading of shell semantics is an empirical claim, so the claim is
// checked against bash (and zsh where present) rather than argued. Every row runs
// with a PATH holding only recording stand-ins, from a scratch directory, and a
// probe proves the stand-in answers before any row runs: no real git can run here.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test, { after } from 'node:test'
import { shellWords } from '../plugin/scripts/shell-words.mjs'

const POSIX = process.platform !== 'win32'
const SHELLS = ['/bin/bash', '/bin/zsh'].filter(shell => POSIX && existsSync(shell))

// A scratch directory, a PATH of stand-ins, and a record file each stand-in appends
// its argv to: fields split by \x1f, invocations by \x1e.
function harness() {
  const scratch = mkdtempSync(path.join(os.tmpdir(), 'qh-shell-words-'))
  after(() => rmSync(scratch, { recursive: true, force: true }))
  const bin = path.join(scratch, 'bin')
  const work = path.join(scratch, 'work')
  mkdirSync(bin)
  mkdirSync(work)
  const record = path.join(scratch, 'argv.log')
  writeFileSync(path.join(bin, 'git'),
    '#!/bin/sh\nprintf \'%s\\037\' git "$@" >> "$QH_ARGV"\nprintf \'\\036\' >> "$QH_ARGV"\n', { mode: 0o755 })
  // Real programs the rows pipe through; git itself is only ever the stand-in.
  for (const name of ['bash', 'sh', 'zsh', 'cat', 'env', 'true', 'false']) {
    const real = ['/bin', '/usr/bin'].map(dir => path.join(dir, name)).find(existsSync)
    if (real) symlinkSync(real, path.join(bin, name))
  }
  const run = (shell, row) => {
    writeFileSync(record, '')
    // `zsh -f`: without it zsh reads a startup file that can put the real git back on
    // PATH, which the probe below caught on the first run (2026-09-27).
    spawnSync(shell, [...(path.basename(shell) === 'zsh' ? ['-f'] : []), '-c', row], {
      cwd: work, encoding: 'utf8', timeout: 10_000,
      env: { PATH: bin, QH_ARGV: record, HOME: scratch },
    })
    return readFileSync(record, 'utf8').split('\x1e').filter(Boolean)
      .map(entry => entry.split('\x1f').slice(0, -1))
  }
  return { run }
}

// The git argv the lexer sees at the top level of `text`.
const gitArgv = text => shellWords(text).commands.filter(c => c.argv[0] === 'git').map(c => c.argv)

// Rows whose git runs at the top level, so the shell's record and the lexer must agree.
const LEXING = [
  'git push',
  'git commit -m x',
  'git -C "/tmp/x y" commit -m "a b"',
  "git commit -m 'it''s'",
  'git commit -m "say \\"hi\\""',
  'git commit -m "a\\$b"',
  'git\\\n  push',
  'git commit\\ -m x',
  'echo a; git push && git commit -m y',
  'git push | cat',
  '(git push)',
  '{ git push; }',
  'FOO=bar git push',
  'git {-c,x=y} push',
  'git {commit,-m,x}',
  'git commit -m x{,y}',
  "git commit -m '{a,b}'",
  'git push # a comment git commit',
  'git commit</dev/null -m x',
  'git push 2>&1',
  'git push >/dev/null 2>&1',
  'git push & wait',
  'cat <<X\ngit push\nX\ngit commit -m z',
  "cat <<'X' | cat\ngit push\nX",
  'cat <<-X\n\tgit push\n\tX',
  'git push <<<"here"',
  '((1 << 2))\ngit commit -m z',
  'echo "git push"',
  "echo 'git push; git commit'",
  'echo git\\ push',
]

test("the lexer's argv is the argv the shell hands git", { skip: SHELLS.length ? false : 'no POSIX shell to diff against' }, () => {
  const { run } = harness()
  for (const shell of SHELLS) {
    assert.deepEqual(run(shell, '/usr/bin/env git --version'), [['git', '--version']],
      `${shell}: the stand-in did not answer, so a row could reach a real git; stopping`)
    for (const row of LEXING) {
      assert.deepEqual(gitArgv(row), run(shell, row), `${shell}: ${JSON.stringify(row)}`)
    }
    // Execution and lexing differ here on purpose (ADR-067 Decision 2): control flow
    // is not evaluated, and eval runs its joined arguments.
    assert.deepEqual(run(shell, 'true || git push'), [], shell)
    assert.deepEqual(gitArgv('true || git push'), [['git', 'push']])
    const [evaled] = shellWords('eval "git push" "-h"').commands
    assert.deepEqual(evaled.argv, ['eval', 'git push', '-h'])
    assert.deepEqual(gitArgv(evaled.argv.slice(1).join(' ')), run(shell, 'eval "git push" "-h"'), shell)
  }
  // Lexed only, never executed as written: an absolute git is not the stand-in.
  assert.deepEqual(shellWords('/usr/bin/git push').commands[0].argv, ['/usr/bin/git', 'push'])
})

// The six data rows of ADR-066's KNOWN_FALSE_REFUSALS, and the same words as commands.
const DATA = [
  ['git log --grep "x; git push"', 'git log --grep x; git push'],
  ['echo "example; git push"', 'echo example; git push'],
  ['node -e "console.log(\'a; git push\')"', 'node -e console.log; git push'],
  ["cat <<'EOF'\ngit push\nEOF", 'cat\ngit push'],
  ['echo \'bash -c "git push"\'', 'echo bash; git push'],
  ['grep -F \'sh -c "git push"\' docs/example.md', 'grep -F sh; git push'],
  ['echo x # git push', 'echo x; git push'],
]
const publishes = text => shellWords(text).commands.some(c => c.argv[0] === 'git' && (c.argv[1] === 'push' || c.argv[1] === 'commit'))

test('quoted text, heredoc bodies and comments are data, not commands', () => {
  for (const [data, commands] of DATA) {
    assert.equal(publishes(data), false, data)
    assert.equal(publishes(commands), true, `the dirty twin: ${commands}`)
  }
  // Provenance: a quoted span holding an operator is code an interpreter may run.
  const [echo] = shellWords('echo "example; git push"').commands
  assert.deepEqual(echo.code, [false, true])
  assert.deepEqual(shellWords('echo "plain words"').commands[0].code, [false, false])
  // Pipeline position: text piped into a shell is marked as feeding it.
  const piped = shellWords('echo "x; git push" | bash').commands
  assert.equal(piped[0].pipeTo, 1)
  assert.deepEqual(piped[1].argv, ['bash'])
  assert.equal(shellWords('echo "x; git push"; bash').commands[0].pipeTo, null)
  // A heredoc body is kept, with its delimiter and whether it was quoted.
  const [cat] = shellWords("cat <<'EOF'\ngit push\nEOF").commands
  assert.deepEqual(cat.heredocs, [{ delimiter: 'EOF', quoted: true, body: 'git push\n' }])
})

test('an incomplete lex says so and keeps what it read', () => {
  const open = shellWords('git push; echo "unclosed')
  assert.equal(open.complete, false)
  assert.deepEqual(open.commands.map(c => c.argv), [['git', 'push']])
  assert.equal(shellWords('git push; echo "closed"').complete, true)
  assert.equal(shellWords('cat <<X\nbody').complete, false)
  assert.equal(shellWords('cat <<X\nbody\nX').complete, true)
  assert.equal(shellWords('echo $(git push').complete, false)
  // What a shell runs before the syntax error, measured and kept as data.
  if (SHELLS.length) {
    const { run } = harness()
    for (const shell of SHELLS) {
      for (const [row, ran] of Object.entries(BEFORE_UNCLOSED)) {
        assert.deepEqual(run(shell, row), ran[path.basename(shell)], `${shell}: ${JSON.stringify(row)}`)
        assert.equal(shellWords(row).complete, false, row)
      }
    }
  }
})

// Measured 2026-09-27 (bash 3.2.57, zsh 5.9, macOS; ADR-067 T1 S4): on the same line
// neither shell runs anything; bash runs a completed earlier LINE, zsh does not.
const BEFORE_UNCLOSED = {
  'git push; echo "unclosed': { bash: [], zsh: [] },
  'git push\necho "unclosed': { bash: [['git', 'push']], zsh: [] },
}
