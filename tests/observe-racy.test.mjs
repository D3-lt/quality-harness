// ADR-094 T3 (found at execution). `observe` hashes a COPY of the index, and a copy made now is newer than every
// entry, so git no longer treated an entry written in the same second as racily clean: a file rewritten in that
// second at the same size read as unchanged, and a pass was reused on a tree that had changed. The copy keeps the
// original's time. The setup puts an entry and the index in one second on purpose, so the miss is certain, not rare.
import assert from 'node:assert/strict'
import test from 'node:test'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { observe } from '../plugin/scripts/lifecycle.mjs'

test('observe sees a file rewritten in the same second at the same size', t => {
  const top = realpathSync.native(mkdtempSync(path.join(process.platform === 'darwin' ? '/private/tmp' : os.tmpdir(), 'qh-racy-')))
  t.after(() => rmSync(top, { recursive: true, force: true }))
  const repo = path.join(top, 'repo')
  mkdirSync(path.join(repo, 'docs'), { recursive: true })
  const git = (...args) => {
    const run = spawnSync('git', ['-C', repo, '-c', 'user.name=qh', '-c', 'user.email=qh@example.invalid', ...args], { encoding: 'utf8', timeout: 60_000 })
    assert.equal(run.status, 0, run.stderr)
  }
  git('init', '-q')
  const file = path.join(repo, 'docs', 'a.md')
  const second = new Date(Math.floor(Date.now() / 1000) * 1000 - 5_000)
  let missed = 0
  const attempts = 30
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    writeFileSync(file, `v${String(attempt).padStart(3, '0')}\n`)
    utimesSync(file, second, second)
    git('add', '-A')
    git('commit', '-q', '-m', `v${attempt}`, '--no-gpg-sign')
    // Entry and index in the same second: git's own rule calls the entry racily clean.
    utimesSync(path.join(repo, '.git', 'index'), second, second)
    const before = observe(repo)
    writeFileSync(file, `w${String(attempt).padStart(3, '0')}\n`)
    utimesSync(file, second, second)
    const after = observe(repo)
    assert.equal(before.ok && after.ok, true)
    if (before.tree === after.tree) missed += 1
  }
  assert.equal(missed, 0, `${missed} of ${attempts} same-second, same-size rewrites left the observed tree unchanged`)
})
