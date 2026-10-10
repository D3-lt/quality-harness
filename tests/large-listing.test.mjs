// From a Windows corpus-chaos run of v3.8.9 over public/php-dated-adr (27,289 tracked files): `git ls-files -z`
// printed 2,321,943 bytes, Node's default 1 MiB maxBuffer cut it with ENOBUFS, and every JS reader said
// "git could not list the tree" (UNPROVEN) over a listing git produced fine. Not Windows-specific: any
// repository past about 25k files. This builds a listing over 1 MiB with few files and long names.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { trackedPaths } from '../plugin/scripts/decision-corpus.mjs'

const temps = []
test.after(() => { for (const dir of temps) rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }) })

test('a tracked listing larger than 1 MiB is read whole', t => {
  // Long names put 1 MiB of listing in a few thousand files; Windows refuses paths that long.
  if (process.platform === 'win32') { t.skip('names this long exceed MAX_PATH on a Windows runner'); return }
  const repo = mkdtempSync(join(tmpdir(), 'qh-listing-'))
  temps.push(repo)
  // Git runs only in a directory this file made (CLAUDE.md §9).
  assert.equal(spawnSync('git', ['init', '-q'], { cwd: repo, timeout: 30_000, windowsHide: true }).status, 0)
  const dir = join(repo, 'd'.repeat(60))
  mkdirSync(dir)
  const stem = 'x'.repeat(180)
  const count = 6500  // about 6500 × 245 bytes ≈ 1.5 MiB of listing
  for (let i = 0; i < count; i++) writeFileSync(join(dir, `${stem}-${i}.txt`), '')
  assert.equal(spawnSync('git', ['add', '-A'], { cwd: repo, timeout: 120_000, windowsHide: true }).status, 0)
  const listed = trackedPaths(repo)
  assert.notEqual(listed, null, 'the listing was read, not reported as could-not-list')
  assert.equal(listed.length, count)
})
