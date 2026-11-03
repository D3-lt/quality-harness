// BACKLOG §449: an id two task files declare. adr-next named one file as `unreadable`, though both were read, and which one
// depended on the platform's sort; an EMPTY file sharing an id was skipped with no entry, so the other read as the task.
// Every directory here is one this test made (CLAUDE.md §9).
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { remove } from './helpers/remove.mjs'

const adrNext = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'plugin', 'bin', 'adr-next')
const task = id => `# Task ADR-001-${id}: one\n\n**Depends-on:** none\n\n## Acceptance\n\n\`\`\`bash\ntrue\n\`\`\`\n`

function answer(files) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'qh-adr-next-dup-'))
  try {
    const tasks = path.join(root, 'ADR-001-x', 'tasks')
    mkdirSync(tasks, { recursive: true })
    writeFileSync(path.join(root, 'ADR-001-x.md'), '# ADR-001: x\n\n**Status:** Accepted\n')
    for (const [name, text] of Object.entries(files)) writeFileSync(path.join(tasks, name), text)
    const run = spawnSync('python3', [adrNext, tasks, '--json'], { encoding: 'utf8', timeout: 60_000, windowsHide: true })
    assert.ok(run.status === 0 || run.status === 3, `adr-next exit ${run.status}\n${run.stderr}`)
    const json = JSON.parse(run.stdout)
    return json.stopped.map(entry => ({ id: entry.id, unreadable: entry.unreadable,
      duplicate: entry.duplicate && entry.duplicate.map(file => path.basename(file)) }))
  } finally { remove(root) }
}

test('an id two task files declare names both files, and is unreadable only when one could not be read', () => {
  assert.deepEqual(answer({ 'T1-a.md': task('T1'), 'T2-b.md': task('T1') }),
    [{ id: 'T1', unreadable: false, duplicate: ['T1-a.md', 'T2-b.md'] }])
  // Empty, sorted after the task it shares an id with: it had no entry, and the other read as T1.
  assert.deepEqual(answer({ 'T1-a.md': task('T1'), 'T1-b.md': '' }),
    [{ id: 'T1', unreadable: true, duplicate: ['T1-a.md', 'T1-b.md'] }])
  // Empty and sorted first, then a readable file with its id: still both, and still unreadable.
  assert.deepEqual(answer({ 'T1-a.md': '', 'T1-b.md': task('T1') }),
    [{ id: 'T1', unreadable: true, duplicate: ['T1-a.md', 'T1-b.md'] }])
  // One file for one id is no duplicate.
  assert.deepEqual(answer({ 'T1-a.md': '' }), [{ id: 'T1', unreadable: true, duplicate: null }])
})
