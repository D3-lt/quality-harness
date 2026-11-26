// BACKLOG §478 (the verification review of da7051519): work-next's relock remedy replaced every backslash after the shared path
// formatter had already given Windows paths `/`, so a POSIX task named `T1-a\b.md` was printed as `T1-a/b.md`, a file that does not
// exist; and the argument was not quoted, so a name with a space split into two. The argument is checked here by what a shell
// makes of it: Bash (Git Bash on Windows) prints each argv it receives, and the one argument must be the task's path, a file on
// disk. Nothing here runs a relock.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { main } from '../plugin/scripts/work-next.mjs'
import { testBash } from './helpers/bash.mjs'
import { remove } from './helpers/remove.mjs'

const temps = []
test.after(() => { for (const t of temps) remove(t) })

const PREFIX = 'adr-verify --relock --replace-hashes '
const SUFFIX = ' — once the change to the test is reviewed'
const NOTE = 'carries exit-0 evidence for this Acceptance, but its test lock withholds done — '
  + 'once the change to the test is reviewed, `adr-verify --relock --replace-hashes` re-locks it'

// What one shell word becomes once Bash has read it: the argv it hands a program, each one NUL-ended.
const argvOf = words => {
  const ran = spawnSync(testBash(), ['-c', `printf '%s\\0' ${words}`], { encoding: 'utf8', timeout: 30_000, windowsHide: true })
  assert.equal(ran.status, 0, ran.stderr)
  return ran.stdout.split('\0').slice(0, -1)
}

// A corpus whose one task is withheld by a moved lock, as adr-next says it (the seam), and work-next's answers about it. A name
// the file system refuses fails here: only the platform guard in the cases below skips, never an error met on the way.
function remedyFor(name) {
  const temp = mkdtempSync(path.join(os.tmpdir(), 'qh-relock-argv-')); temps.push(temp)
  const tasks = path.join(temp, 'docs', 'adr', 'ADR-001-x', 'tasks')
  mkdirSync(tasks, { recursive: true })
  writeFileSync(path.join(temp, 'docs', 'adr', 'ADR-001-x.md'), '# ADR-001: x\n\n**Status:** Accepted\n\n## Context\n\nx\n\n## Decision\n\ny\n')
  const file = path.join(tasks, name)
  writeFileSync(file, '# Task ADR-001-T1: a\n\n**Status:** done\n\n## Verification Log\n\n- 2026-09-20 · abc1234 · exit 0 · `true`\n')
  assert.equal(spawnSync('git', ['init', '-q', '-b', 'main', '.'], { cwd: temp, encoding: 'utf8', timeout: 60_000, windowsHide: true }).status, 0)
  const spawn = () => ({ status: 0, error: null, signal: null, stderr: '', stdout: JSON.stringify({ ready: [{ id: 'T1', path: file, unproven: NOTE }], done: [], blocked: [], stopped: [] }) })
  const said = argv => {
    const written = []
    const real = process.stdout.write.bind(process.stdout)
    process.stdout.write = chunk => { written.push(String(chunk)); return true }
    try { main(argv, { spawn }) } finally { process.stdout.write = real }
    return written.join('')
  }
  return { temp, rel: `docs/adr/ADR-001-x/tasks/${name}`, remedy: JSON.parse(said([temp, '--json'])).next?.remedy, text: said([temp]) }
}

for (const [what, name, platforms] of [
  ['an ordinary name', 'T1-a.md'],
  ['a backslash in a POSIX name', 'T1-a\\b.md', ['darwin', 'linux']],
  ['a space', 'T1 a b.md'],
  ["an apostrophe and a space", "T1-it's here.md"],
  ['a dollar and a backtick', 'T1-$HOME-`x`.md'],
]) {
  test(`the relock argument reaches the task through the shell: ${what}`, t => {
    if (platforms && !platforms.includes(process.platform)) { t.skip(`${process.platform} reads a backslash as a separator`); return }
    const { temp, rel, remedy, text } = remedyFor(name)
    assert.ok(remedy?.startsWith(PREFIX) && remedy.endsWith(SUFFIX), `no relock remedy: ${remedy}`)
    const words = remedy.slice(PREFIX.length, -SUFFIX.length)
    assert.deepEqual(argvOf(words), [rel], `the shell read ${words} as other arguments`)
    assert.ok(existsSync(path.join(temp, ...rel.split('/'))), 'the one argument names the task on disk')
    // Ordinary output is unchanged: a plain name is printed bare.
    if (name === 'T1-a.md') assert.equal(words, rel)
    // The human line carries the same command, on one line.
    const line = text.split('\n').find(l => l.includes('would refuse again: '))
    assert.ok(line?.endsWith(`would refuse again: ${remedy}.`), text)
  })
}

// The must-fail direction of the check above: an unquoted name with a space reaches the shell as two arguments.
test('an unquoted argument with a space is two arguments', () => {
  assert.deepEqual(argvOf('docs/T1 a.md'), ['docs/T1', 'a.md'])
})
