// BACKLOG §351 (§295 items 1 and 19.3): a FIFO named like a task hung adr-next, and through it
// work-next and corpus-probe, until the process was killed; a directory named `T4-x.md` stopped
// the whole tasks directory with "Is a directory". adr-lint already refuses a non-regular entry
// (§319). The other readers now stop that ONE task, unopened, and read the rest.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const adrNext = join(repoRoot, 'plugin', 'bin', 'adr-next')
const workNext = join(repoRoot, 'plugin', 'scripts', 'work-next.mjs')
const temps = []
test.after(() => { for (const dir of temps) rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }) })

const digestOf = fence => createHash('sha256').update(fence, 'utf8').digest('hex')
const task = id => `# Task ${id}: do ${id}\n\n**Depends-on:** none\n**Consumes:** none\n**Produces:** none\n\n`
  + `## Acceptance\n\n\`\`\`bash\nprintf ${id}\n\`\`\`\n\n## Verification Log\n`
  + `- 2026-08-26 · no-git · exit 0 · \`printf ${id}\` · acceptance-sha256:${digestOf(`printf ${id}`)}\n`

// An Accepted record with a done T1 beside `irregular`, made by `make(path)`.
function record(make) {
  const repo = mkdtempSync(join(tmpdir(), 'qh-irregular-'))
  temps.push(repo)
  // Git runs only in a directory this file made (CLAUDE.md §9).
  assert.equal(spawnSync('git', ['init', '-q'], { cwd: repo, timeout: 30_000, windowsHide: true }).status, 0)
  const tasks = join(repo, 'docs', 'adr', 'ADR-007-x', 'tasks')
  mkdirSync(tasks, { recursive: true })
  writeFileSync(join(repo, 'docs', 'adr', 'ADR-007-x.md'), '# ADR-007: X\n\n**Status:** Accepted\n')
  writeFileSync(join(tasks, 'T1-a.md'), task('T1'))
  return { repo, tasks, made: make(join(tasks, 'T3-odd.md')) }
}

const fifo = path => spawnSync('mkfifo', [path], { timeout: 10_000, windowsHide: true }).status === 0
const directory = path => { mkdirSync(path); return true }
// Git cannot track a FIFO, but it tracks a link to one, so this is the shape git LISTS.
const trackedLinkToFifo = path => {
  const target = join(dirname(path), '..', 'pipe')
  if (!fifo(target)) return false
  try { symlinkSync(join('..', 'pipe'), path) } catch { return false }
  return spawnSync('git', ['add', path], { cwd: dirname(path), timeout: 30_000, windowsHide: true }).status === 0
}

// Each name is written out, so the catalogue's stale check can find its killer.
function stoppedUnopened(t, make) {
  const { repo, tasks, made } = record(make)
  if (!made) { t.skip('mkfifo is not available here'); return }
  // A 20s bound: a reader that opens the FIFO waits forever, and the kill is the red.
  const r = spawnSync('python3', [adrNext, '--all', '--json', tasks], { cwd: tasks, encoding: 'utf8', timeout: 20_000, windowsHide: true })
  assert.notEqual(r.signal, 'SIGTERM', 'adr-next waited on the entry')
  assert.ok(r.status === 0 || r.status === 3, `adr-next exit ${r.status}: ${r.stderr}`)
  const answer = JSON.parse(r.stdout)
  assert.deepEqual((answer.done ?? []).map(x => x.id), ['T1'], r.stdout)
  const t3 = (answer.stopped ?? []).find(x => x.id === 'T3')
  assert.equal(t3?.unreadable, true, r.stdout)
  assert.match(t3.stopped_by, /T3-odd\.md is not a regular file/, t3.stopped_by)
  const w = spawnSync(process.execPath, [workNext, '--json'], { cwd: repo, encoding: 'utf8', timeout: 30_000, windowsHide: true })
  assert.notEqual(w.signal, 'SIGTERM', 'work-next waited on the entry')
  assert.equal(w.status, 0, w.stderr)
}

test('a FIFO named like a task is stopped unopened, and the other tasks are read', t => stoppedUnopened(t, fifo))
test('a directory named like a task is stopped unopened, and the other tasks are read', t => stoppedUnopened(t, directory))
test('a tracked link to a FIFO named like a task is stopped unopened, and the other tasks are read', t => stoppedUnopened(t, trackedLinkToFifo))
