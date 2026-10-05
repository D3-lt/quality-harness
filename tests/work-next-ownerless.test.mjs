// BACKLOG §350 item 4 (C5, the `orphan-tasks` fixture, then a Windows run of 3.8.5): with its record
// deleted, a task directory's tasks were counted (`tasks: 1`) and named nowhere — not ready, not
// readiness-unproven — and work-next said "Nothing … is waiting" while SessionStart said whether
// they are a work order is UNKNOWN. A task no record owns is named, with that reason, and the
// answer is not an all-clear.
import assert from 'node:assert/strict'
import { chmodSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { main, observe } from '../plugin/scripts/work-next.mjs'

const scratch = realpathSync.native(mkdtempSync(path.join(os.tmpdir(), 'qh-ownerless-')))
after(() => rmSync(scratch, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }))
const RECORD = '# 1. Use Postgres\n\n## Status\n\nAccepted\n\n## Context\n\nx\n'
const TASK = '# Task 0002-T1: migrate\n\n## Acceptance\n\n```bash\ntrue\n```\n'
const spawn = () => ({ status: 3, stderr: '', stdout: JSON.stringify({ ready: [], done: [], blocked: [], stopped: [] }) })

// What work-next prints for a listing, through its own main (the call a session makes).
const printed = (root, listing) => {
  const out = []
  const write = process.stdout.write
  process.stdout.write = chunk => { out.push(String(chunk)); return true }
  try { main([root], { spawn, listing }) } finally { process.stdout.write = write }
  return out.join('')
}
test('work-next names tasks no record owns, and does not call the corpus clear', () => {
  const root = path.join(scratch, 'repo')
  mkdirSync(path.join(root, 'docs', 'adr', '0002-dropped', 'tasks'), { recursive: true })
  writeFileSync(path.join(root, 'docs', 'adr', '0001-use-postgres.md'), RECORD)
  writeFileSync(path.join(root, 'docs', 'adr', '0002-dropped', 'tasks', 'T1-migrate.md'), TASK)
  const listing = ['docs/adr/0001-use-postgres.md', 'docs/adr/0002-dropped/tasks/T1-migrate.md']
  const state = observe(root, { spawn, listing })
  const unproven = state.readinessUnproven.map(dir => path.relative(root, dir).split(path.sep).join('/'))
  assert.deepEqual(unproven, ['docs/adr/0002-dropped/tasks'], JSON.stringify(state))
  assert.deepEqual(state.ownerless.map(dir => path.relative(root, dir).split(path.sep).join('/')), ['docs/adr/0002-dropped/tasks'])
  const text = printed(root, listing)
  assert.match(text, /1 task directory has no record owning it: no record owning these tasks was found, so whether they are a work order is UNKNOWN/, text)
  assert.match(text, /docs\/adr\/0002-dropped\/tasks/, text)
  assert.doesNotMatch(text, /Nothing in the QH corpus is waiting/, text)
  // The control: the same tree with the task's record in place names nothing.
  writeFileSync(path.join(root, 'docs', 'adr', '0002-dropped.md'), RECORD.replace('1. Use Postgres', '2. Dropped'))
  const owned = observe(root, { spawn, listing: [...listing, 'docs/adr/0002-dropped.md'] })
  assert.deepEqual([owned.ownerless, owned.readinessUnproven], [[], []], JSON.stringify(owned))
})

// BACKLOG §350 C2: a task adr-next listed and could not read (a UTF-16 task, NUL bytes) was an
// "unbacked done claim" when its README row said done. Nobody read whether it claims anything.
test('a task adr-next could not read is not an unbacked done claim', () => {
  const root = path.join(scratch, 'utf16-task')
  const tasks = path.join(root, 'docs', 'adr', 'ADR-001-x', 'tasks')
  mkdirSync(tasks, { recursive: true })
  writeFileSync(path.join(root, 'docs', 'adr', 'ADR-001-x.md'), '# ADR-001: x\n\n**Status:** Accepted\n\n## Context\n\nx\n')
  writeFileSync(path.join(tasks, 'T1-a.md'), Buffer.from('﻿# Task T1\n', 'utf16le'))
  writeFileSync(path.join(tasks, 'README.md'), '| Task | Status |\n|---|---|\n| T1 | done |\n')
  const listing = ['docs/adr/ADR-001-x.md', 'docs/adr/ADR-001-x/tasks/README.md', 'docs/adr/ADR-001-x/tasks/T1-a.md']
  const unread = () => ({ status: 3, stderr: '', stdout: JSON.stringify({ ready: [], done: [], blocked: [],
    stopped: [{ id: 'T1', path: 'docs/adr/ADR-001-x/tasks/T1-a.md', unreadable: true, stopped_by: 'it holds NUL bytes' }] }) })
  const state = observe(root, { spawn: unread, listing })
  assert.deepEqual(state.unbacked, [], JSON.stringify(state.unbacked))
  assert.ok(state.readinessUnproven.some(dir => dir === tasks), JSON.stringify(state.readinessUnproven))
})

// A stand-in review's GREEN (F6): an unreadable task in a shared `tasks/` beside one record is that
// record's (`unreadTasks`), and was named "no record owning these tasks was found". It is UNPROVEN, and
// still its record's.
test('a task its record owns and nobody could read is not called ownerless', t => {
  if (process.platform === 'win32' || process.getuid?.() === 0) { t.skip('no mode bit denies this process a read here'); return }
  const root = path.join(scratch, 'owned-unread')
  const tasks = path.join(root, 'docs', 'adr', 'tasks')
  mkdirSync(tasks, { recursive: true })
  writeFileSync(path.join(root, 'docs', 'adr', 'ADR-002-a.md'), '# ADR-002: a\n\n**Status:** Accepted\n\n## Context\n\nc\n')
  writeFileSync(path.join(tasks, 'T1-locked.md'), '# Task ADR-002-T1: a\n\n## Acceptance\n\n```bash\ntrue\n```\n')
  const listing = ['docs/adr/ADR-002-a.md', 'docs/adr/tasks/T1-locked.md']
  chmodSync(path.join(tasks, 'T1-locked.md'), 0o000)
  try {
    const state = observe(root, { spawn, listing })
    assert.deepEqual(state.ownerless, [], JSON.stringify(state.ownerless))
    assert.ok(state.readinessUnproven.includes(tasks), JSON.stringify(state.readinessUnproven))
  } finally { chmodSync(path.join(tasks, 'T1-locked.md'), 0o644) }
})
