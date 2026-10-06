// BACKLOG §351 (§295 item 20.Q5): corpus-probe output saved as `T3-report.md` in a tasks
// directory was offered as READY by adr-next and listed by work-next, while adr-lint FAILed it.
// A file with no `## Acceptance` section has nothing that could prove it done, so it is
// stopped with that reason. 244 task files under the owner's projects all carry the heading.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const adrNext = join(repoRoot, 'plugin', 'bin', 'adr-next')
const temps = []
test.after(() => { for (const dir of temps) rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }) })

test('a file with no Acceptance section in tasks/ is stopped, not ready', () => {
  const repo = mkdtempSync(join(tmpdir(), 'qh-no-acceptance-'))
  temps.push(repo)
  // Git runs only in a directory this file made (CLAUDE.md §9).
  assert.equal(spawnSync('git', ['init', '-q'], { cwd: repo, timeout: 30_000, windowsHide: true }).status, 0)
  const tasks = join(repo, 'docs', 'adr', 'ADR-007-x', 'tasks')
  mkdirSync(tasks, { recursive: true })
  writeFileSync(join(repo, 'docs', 'adr', 'ADR-007-x.md'), '# ADR-007: X\n\n**Status:** Accepted\n')
  writeFileSync(join(tasks, 'T3-report.md'), '{\n  "probe": "corpus-probe",\n  "look": "ok"\n}\n')
  writeFileSync(join(tasks, 'T4-notes.md'), '# Notes on T4\n\nSome prose, no sections.\n')
  // The control: a task with an Acceptance fence and no evidence is still ready.
  writeFileSync(join(tasks, 'T1-a.md'), '# Task T1: do it\n\n**Depends-on:** none\n\n## Acceptance\n\n```bash\nprintf T1\n```\n')
  const r = spawnSync('python3', [adrNext, '--all', '--json', tasks], { cwd: tasks, encoding: 'utf8', timeout: 60_000, windowsHide: true })
  assert.ok(r.status === 0 || r.status === 3, `adr-next exit ${r.status}: ${r.stderr}`)
  const answer = JSON.parse(r.stdout)
  assert.deepEqual((answer.ready ?? []).map(t => t.id), ['T1'], r.stdout)
  for (const id of ['T3', 'T4']) {
    const t = (answer.stopped ?? []).find(x => x.id === id)
    assert.match(t?.stopped_by ?? '', /has no `## Acceptance` section/, r.stdout)
  }
})
