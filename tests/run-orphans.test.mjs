// A process a test started outlives the suite when its own parent dies first: it is
// re-parented to pid 1, out of `pgrep -P $$`'s reach (scripts/selftest.sh, BACKLOG §130).
// Found 2026-10-15: five lease holders 8 h 51 min old, each still naming the run's temp
// directory in its argv. scripts/run-orphans.mjs finds a process by that name, waits a
// grace for it to end, and kills what is left. Each check is shown finding one and finding
// none (CLAUDE.md §4).
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import os from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test, { after } from 'node:test'
import { fileURLToPath } from 'node:url'
import { naming } from '../scripts/run-orphans.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const script = join(repoRoot, 'scripts', 'run-orphans.mjs')
const top = realpathSync.native(mkdtempSync(join(os.tmpdir(), 'qh-orphans-')))
after(() => rmSync(top, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }))
const alive = pid => { try { process.kill(pid, 0); return true } catch { return false } }

test('naming picks the processes whose arguments name the directory, never itself', () => {
  const ps = ` 10 1 node -e x /run/qh-selftest.AB12/leases\n 11 1 node -e y /run/qh-selftest.AB123/other\n 12 1 bash scripts/selftest.sh\n 13 12 node scripts/run-orphans.mjs /run/qh-selftest.AB12\n`
  assert.deepEqual(naming(ps, '/run/qh-selftest.AB12', 13).map(row => row.pid), [10])
  // CLEAN twin: nothing names it.
  assert.deepEqual(naming(ps, '/run/qh-selftest.ZZ99', 13), [])
})

test('a detached process naming the directory is named and killed; none named exits 0', { skip: process.platform === 'win32' && 'selftest.sh owns no run directory on Windows' }, async () => {
  const dir = mkdtempSync(join(top, 'run-'))
  const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)', dir], { detached: true, stdio: 'ignore', windowsHide: true })
  child.unref()
  for (let i = 0; i < 50 && !alive(child.pid); i++) await new Promise(r => setTimeout(r, 20))
  const found = spawnSync(process.execPath, [script, dir, '--grace-ms', '200', '--kill'], { encoding: 'utf8', timeout: 30_000, windowsHide: true })
  assert.equal(found.status, 1, found.stderr)
  assert.match(found.stderr, new RegExp(`${child.pid} .*setTimeout`))
  for (let i = 0; i < 50 && alive(child.pid); i++) await new Promise(r => setTimeout(r, 20))
  assert.equal(alive(child.pid), false, 'the survivor was killed')
  // CLEAN twin: the same directory with nothing naming it.
  const none = spawnSync(process.execPath, [script, dir, '--grace-ms', '0'], { encoding: 'utf8', timeout: 30_000, windowsHide: true })
  assert.equal(none.status, 0, none.stderr)
  assert.equal(none.stderr, '')
})

test('a process that ends inside the grace is not a leak', { skip: process.platform === 'win32' && 'selftest.sh owns no run directory on Windows' }, () => {
  const dir = mkdtempSync(join(top, 'run-'))
  const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 300)', dir], { detached: true, stdio: 'ignore', windowsHide: true })
  child.unref()
  const found = spawnSync(process.execPath, [script, dir, '--grace-ms', '5000'], { encoding: 'utf8', timeout: 30_000, windowsHide: true })
  assert.equal(found.status, 0, found.stderr)
})

test('selftest.sh runs the finder after the suite and in its trap', async () => {
  const { readFileSync } = await import('node:fs')
  const text = readFileSync(join(repoRoot, 'scripts', 'selftest.sh'), 'utf8')
  assert.match(text, /cleanup\(\) \{[^}]*run-orphans\.mjs" "\$QH_RUN_TMP" --grace-ms 0 --kill/)
  assert.match(text, /node "\$REPO\/scripts\/run-orphans\.mjs" "\$QH_RUN_TMP" --grace-ms 5000 --kill \|\| orphan_status=\$\?/)
})
