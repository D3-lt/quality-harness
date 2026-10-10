// `replaceable` answers "may this tool overwrite the path?" and any lstat failure used to read as "absent": a
// path that could not be looked at (a symlink loop, a permission wall, an I/O error) was declared free to write,
// in a home directory that holds the user's own tools. Only ENOENT is absent (CLAUDE.md §3, ADR-005).
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { replaceable } from '../plugin/scripts/standalone-link.mjs'

const scratch = realpathSync.native(mkdtempSync(path.join(os.tmpdir(), 'qh-replaceable-')))
after(() => rmSync(scratch, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }))

const entry = to => ({ to, relative: 'bin/qh-gate', lineage: 'gate', target: path.join(scratch, 'plugin', 'bin', 'qh-gate') })

test('a path that cannot be looked at is not free to overwrite', { skip: process.platform === 'win32' && 'creating a symlink needs a privilege a Windows runner may not hold' }, () => {
  const loop = path.join(scratch, 'loop')
  symlinkSync(loop, loop)
  const answer = replaceable(entry(path.join(loop, 'qh-gate')), scratch)
  assert.equal(answer.ok, false, JSON.stringify(answer))
  assert.match(answer.why, /could not look at it \(ELOOP\)/, JSON.stringify(answer))
})

test('twin: a path that is not there is still free to write', () => {
  mkdirSync(path.join(scratch, 'home'), { recursive: true })
  assert.deepEqual(replaceable(entry(path.join(scratch, 'home', 'qh-gate')), scratch), { ok: true, why: 'absent' })
})
