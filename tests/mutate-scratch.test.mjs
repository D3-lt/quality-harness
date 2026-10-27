// A child's scratch directory that a killed test left unwritable is still removed, and its removal never throws
// (land/2ca24f01, mutations 25/48: an EACCES from the cleanup ended the shard and every verdict in it).
import assert from 'node:assert/strict'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { removeScratch } from '../scripts/mutate.mjs'
import { remove } from './helpers/remove.mjs'

const skip = (process.platform === 'win32' && 'POSIX permission bits (CLAUDE.md section 7)')
  || (process.getuid?.() === 0 && 'root removes an unwritable directory anyway')

function lockedScratch(t) {
  const dir = mkdtempSync(join(tmpdir(), 'qh-mutate-scratch-'))
  const inner = join(dir, 'a', 'b')
  mkdirSync(inner, { recursive: true })
  writeFileSync(join(inner, 'left.txt'), 'x')
  chmodSync(inner, 0o500)
  t.after(() => { try { chmodSync(inner, 0o700) } catch { /* removed */ } remove(dir) })
  return dir
}

test('an unwritable scratch directory is removed, and the cleanup does not throw', { skip }, t => {
  // Dirty twin: the removal the campaign did before throws on this tree (EACCES on Linux CI, ENOTEMPTY on macOS).
  assert.throws(() => rmSync(lockedScratch(t), { recursive: true, force: true }), { code: /^(?:EACCES|ENOTEMPTY|EPERM)$/ })
  const dir = lockedScratch(t)
  const said = []
  assert.doesNotThrow(() => removeScratch(dir, line => said.push(line)))
  assert.equal(existsSync(dir), false, 'the scratch directory is gone')
  assert.deepEqual(said, [], 'nothing was left to name')
})
