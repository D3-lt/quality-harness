// The check inferred from package.json runs the project's SCRIPT, whatever the package manager.
//
// Measured 2026-10-15 in a scratch package whose scripts echo their name: `yarn check` (yarn
// 1.22.22) runs yarn's own folder check and prints "success Folder in sync" without running the
// `check` script, so an inferred `yarn check` passed having run nothing; `bun test` (bun 1.3.3)
// runs bun's own test runner and exits 1 on "0 test files", never the `test` script. `yarn run`,
// `pnpm run` and `bun run` each ran the script. And bun 1.3.3 writes `bun.lock`, not
// `bun.lockb`, so a bun project was read as npm (a peer's survey: `npm run test` recorded where
// the project runs `bun run test`).
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import { join } from 'node:path'
import test, { after } from 'node:test'
import { projectCheckCommand } from '../plugin/scripts/check-command.mjs'

const top = realpathSync.native(mkdtempSync(join(os.tmpdir(), 'qh-runner-')))
after(() => rmSync(top, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }))

function project(lockfile, scripts) {
  const dir = mkdtempSync(join(top, 'p-'))
  const init = spawnSync('git', ['init', '-q', dir], { encoding: 'utf8', timeout: 30_000, windowsHide: true })
  assert.equal(init.status, 0, init.stderr)
  writeFileSync(join(dir, 'package.json'), `${JSON.stringify({ name: 'x', scripts })}\n`)
  if (lockfile) writeFileSync(join(dir, lockfile), '')
  return dir
}

test('the inferred package check runs the script through `run`, for every package manager', () => {
  const rows = [
    [null, 'npm run check'],
    ['pnpm-lock.yaml', 'pnpm run check'],
    ['yarn.lock', 'yarn run check'],
    ['bun.lockb', 'bun run check'],
    ['bun.lock', 'bun run check'],
  ]
  for (const [lockfile, expected] of rows) {
    assert.equal(projectCheckCommand(project(lockfile, { check: 'echo ok' })), expected, String(lockfile))
  }
  // The script name the runner would shadow with a built-in of its own.
  assert.equal(projectCheckCommand(project('bun.lock', { test: 'echo ok' })), 'bun run test')
  // CLEAN twin: with no script, nothing is inferred, whatever the lockfile.
  assert.equal(projectCheckCommand(project('bun.lock', { start: 'node x' })), null)
})
