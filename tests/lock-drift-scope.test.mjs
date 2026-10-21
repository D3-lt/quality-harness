// ADR-120 T15, fixed 2026-10-21 after the full check found a boundary dispatch on plugin/bin/adr-next taking 90 s: the
// lock-drift scan gates only a task whose Tests table names the edited file, because a lock hashes test bodies in Tests-table
// files alone (record.py snapshot_lock). A task that lists the file under Affected Files is not gated; one whose Tests table
// names it still is. Run on a staged copy of the dispatcher that logs every file it is handed, so the scan's choice is seen.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { remove } from './helpers/remove.mjs'

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'plugin')
const posixOnly = process.platform === 'win32' && 'the staged dispatcher runs a bash stub with POSIX permission bits'

test('the lock-drift scan gates a task whose Tests table names the file, and not one that only lists it as affected', { skip: posixOnly }, t => {
  const root = realpathSync.native(mkdtempSync(path.join(os.tmpdir(), 'qh-lockscope-')))
  t.after(() => remove(root))
  const scripts = path.join(root, 'plugin', 'scripts')
  const bin = path.join(root, 'plugin', 'bin')
  mkdirSync(scripts, { recursive: true })
  mkdirSync(bin)
  const source = readFileSync(path.join(pluginRoot, 'scripts', 'facts-gate-dispatch.sh'), 'utf8')
  const log = path.join(root, 'gated.log')
  // Each run, the outer one and every task the scan gates, logs its own argument first.
  writeFileSync(path.join(scripts, 'facts-gate-dispatch.sh'), source.replace(/\n/, '\nprintf "%s\\n" "$1" >> "$STUB_LOG"\n'))
  writeFileSync(path.join(bin, 'adr-lint'), '#!/bin/bash\nexit 0\n', { mode: 0o755 })
  const project = path.join(root, 'project')
  const tasks = path.join(project, 'docs', 'adr', 'ADR-001-probe', 'tasks')
  mkdirSync(tasks, { recursive: true })
  mkdirSync(path.join(project, 'src'))
  writeFileSync(path.join(project, 'src', 'a.js'), 'x\n')
  writeFileSync(path.join(project, 'src', 'a.test.js'), 'x\n')
  writeFileSync(path.join(project, 'docs', 'adr', 'ADR-001-probe.md'), '# ADR-001: Probe\n\n**Status:** Accepted\n')
  writeFileSync(path.join(tasks, 'T1-affected.md'),
    '# Task ADR-001-T1: affected\n\n## Affected Files\n\n| File | Change | Why |\n|------|--------|-----|\n| `src/a.js` | edit | it changes |\n| `src/a.test.js` | edit | it changes |\n')
  writeFileSync(path.join(tasks, 'T2-tests.md'),
    '# Task ADR-001-T2: tests\n\n## Tests\n\n| Test name | File | Verifies | Covers | Steps |\n|-----------|------|----------|--------|-------|\n| `a works` | `src/a.test.js` | it | — | S1 |\n')
  for (const args of [['init', '-q'], ['add', '.']]) {
    const run = spawnSync('git', args, { cwd: project, encoding: 'utf8', timeout: 30_000, windowsHide: true })
    assert.equal(run.status, 0, run.stderr)
  }
  const gated = file => {
    writeFileSync(log, '')
    const run = spawnSync('bash', [path.join(scripts, 'facts-gate-dispatch.sh'), path.join(project, file)],
      { cwd: project, encoding: 'utf8', timeout: 60_000, windowsHide: true, env: { ...process.env, STUB_LOG: log } })
    assert.notEqual(run.error?.code, 'ETIMEDOUT', 'the dispatcher did not finish')
    return existsSync(log) ? readFileSync(log, 'utf8') : ''
  }
  assert.doesNotMatch(gated('src/a.js'), /T1-affected/, 'a task that only lists the file as affected was gated')
  const forTest = gated('src/a.test.js')
  assert.match(forTest, /T2-tests\.md/, 'the task whose Tests table names the file was not gated')
  assert.doesNotMatch(forTest, /T1-affected/, 'the affected-files task was gated for the test file too')
})
