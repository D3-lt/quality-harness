// BACKLOG §292 (a 2.110.0-rc chaos round, macOS Laravel corpus): with `docs/adr/ADR-018/tasks` a link to
// ADR-006's tasks, `adr-next docs/adr/ADR-018/tasks` offered ADR-006's T1 as READY under ADR-018 — an
// instruction to prove another record's work under this record's name. A task whose own title names a
// different record than the directory it was read for is stopped, with both named; it is never offered.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const scratch = realpathSync.native(mkdtempSync(path.join(os.tmpdir(), 'qh-foreign-task-')))
after(() => rmSync(scratch, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }))
const next = (cwd, dir) => spawnSync('python3', [path.join(repoRoot, 'plugin', 'bin', 'adr-next'), dir, '--json'],
  { cwd, encoding: 'utf8', timeout: 60_000, windowsHide: true, env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' } })

test("a task whose title names another record is stopped, not offered under this record's name", t => {
  const root = path.join(scratch, 'corpus')
  mkdirSync(path.join(root, 'docs', 'adr', 'ADR-006', 'tasks'), { recursive: true })
  mkdirSync(path.join(root, 'docs', 'adr', 'ADR-018'), { recursive: true })
  spawnSync('git', ['init', '-q'], { cwd: root, timeout: 30_000, windowsHide: true })
  for (const [n, name] of [['006', 'six'], ['018', 'eighteen']]) {
    writeFileSync(path.join(root, 'docs', 'adr', `ADR-${n}-${name}.md`), `# ADR-${n}: ${name}\n\n**Status:** Accepted\n\n## Context\n\nx\n`)
  }
  writeFileSync(path.join(root, 'docs', 'adr', 'ADR-006', 'tasks', 'T1-six.md'),
    '# Task ADR-006-T1: six one\n\n**Depends-on:** none\n\n## Acceptance\n\n```bash\ntrue\n```\n')
  try { symlinkSync(path.join(root, 'docs', 'adr', 'ADR-006', 'tasks'), path.join(root, 'docs', 'adr', 'ADR-018', 'tasks'), 'junction') } catch (error) { t.skip(`no link here: ${error.code}`); return }
  const through = next(root, 'docs/adr/ADR-018/tasks')
  const answer = JSON.parse(through.stdout)
  assert.deepEqual(answer.ready, [], through.stdout)
  const stop = answer.stopped.find(task => task.id === 'T1')
  assert.match(stop?.stopped_by ?? '', /names ADR-006, not ADR-018/, through.stdout)
  // The control: read from its own record's directory, the same task is ready.
  const own = JSON.parse(next(root, 'docs/adr/ADR-006/tasks').stdout)
  assert.deepEqual(own.ready.map(task => task.id), ['T1'])
})
