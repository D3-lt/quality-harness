// BACKLOG §355, a Windows corpus-chaos run of v3.8.9: what a reader says when a record, or a hook payload,
// could not be read. (Its SessionStart ready-line test left with those lines, ADR-099.)
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const temps = []
test.after(() => { for (const dir of temps) rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }) })

const record = tail => `# ADR-004: X\n\n**Status:** Accepted\n\n## Context\n\nWhy.${tail}\n`

// adr-state's PARTIAL headline said only "a listed record could not be read", while its look is also
// PARTIAL when an archive catalog cannot establish a record's standing; it now says both, as adr-context does.
test('adr-state\'s PARTIAL headline names both of its causes', () => {
  const repo = mkdtempSync(join(tmpdir(), 'qh-state-partial-'))
  temps.push(repo)
  mkdirSync(join(repo, 'docs', 'adr'), { recursive: true })
  writeFileSync(join(repo, 'docs', 'adr', 'ADR-004-x.md'), record('\u0000\u0000'))
  for (const args of [['init', '-q'], ['add', '-A']]) {
    assert.equal(spawnSync('git', args, { cwd: repo, timeout: 30_000, windowsHide: true }).status, 0)
  }
  const run = spawnSync(process.execPath, [join(repoRoot, 'plugin', 'scripts', 'adr-state.mjs')],
    { cwd: repo, encoding: 'utf8', timeout: 60_000, windowsHide: true })
  assert.match(run.stdout, /^could-not-look: a listed record could not be read, or its standing could not be established \(PARTIAL\)/m, run.stdout)
})

// BACKLOG §355: a hook payload saved as UTF-16 was said to be "not JSON" and nothing more. It holds a
// NUL after every ASCII character, so the line now names the likely cause. The control: plain garbage
// is said as before, with no guess.
test('a hook payload that is not JSON names UTF-16 when it holds NUL bytes', () => {
  const hook = input => spawnSync(process.execPath, [join(repoRoot, 'plugin', 'scripts', 'lifecycle.mjs'), 'SessionStart'],
    { input, encoding: 'utf8', timeout: 60_000, windowsHide: true })
  const utf16 = hook(Buffer.from('{"hook_event_name":"SessionStart"}', 'utf16le'))
  assert.match(utf16.stderr, /was not JSON; nothing was read and nothing is said\. It holds NUL bytes: saved as UTF-16\?/, utf16.stderr)
  const garbage = hook('not json')
  assert.match(garbage.stderr, /was not JSON; nothing was read and nothing is said\.\n$/, garbage.stderr)
})
