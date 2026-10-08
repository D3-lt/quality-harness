// From an outside 3.8.14 run (laravel-react-monorepo): work-next's JSON carries tasksNotOnDisk and
// tasksUninspected (BACKLOG §351 item 21.3), but the probe's summary copied neither, so a pasted
// probe report could not show them: the class the probe's own spec comment names ("a pasted probe
// said less than the reader"). The summary carries both, and --diff compares them with the counts.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { diffReports, probe } from '../plugin/scripts/corpus-probe.mjs'

const temps = []
test.after(() => { for (const dir of temps) rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }) })

function corpus(removeTasks) {
  const repo = mkdtempSync(join(tmpdir(), 'qh-probe-absent-'))
  temps.push(repo)
  const tasks = join(repo, 'docs', 'adr', 'ADR-001-a', 'tasks')
  mkdirSync(tasks, { recursive: true })
  writeFileSync(join(repo, 'docs', 'adr', 'ADR-001-a.md'), '# ADR-001: A\n\n**Status:** Accepted\n')
  for (const id of ['T1', 'T2']) writeFileSync(join(tasks, `${id}-a.md`), `# ${id}: t\n\n**Depends-on:** none\n\n## Acceptance\n\n\`\`\`bash\ntrue\n\`\`\`\n`)
  // Git runs only in a directory this file made (CLAUDE.md §9); staging is enough for `git ls-files`.
  for (const args of [['init', '-q'], ['add', '-A']]) {
    assert.equal(spawnSync('git', args, { cwd: repo, timeout: 30_000, windowsHide: true }).status, 0)
  }
  if (removeTasks) for (const id of ['T1', 'T2']) rmSync(join(tasks, `${id}-a.md`))
  return probe(repo)
}

test('the probe summary carries the task files work-next counts apart, and --diff compares them', () => {
  const sparse = corpus(true)
  assert.equal(sparse.workNext.tasksNotOnDisk, 2, JSON.stringify(sparse.workNext))
  assert.equal(sparse.workNext.tasksUninspected, 0, JSON.stringify(sparse.workNext))
  // The control: every listed task is on disk.
  const whole = corpus(false)
  assert.equal(whole.workNext.tasksNotOnDisk, 0, JSON.stringify(whole.workNext))
  const lines = diffReports(whole, sparse)
  assert.ok(lines.some(line => line === 'workNext.tasksNotOnDisk: 0 → 2'), lines.join('\n'))
  assert.ok(!diffReports(whole, whole).some(line => /tasksNotOnDisk/.test(line)))
})
