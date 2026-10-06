// BACKLOG §318: `mutate --repoint --write` and `--narrow --write` wrote tests/mutations.json with a plain
// writeFileSync, so a kill during that one write could leave a torn catalogue. It goes through a temporary
// file and a rename now, and a write that fails leaves the catalogue as it was.
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { writeCatalogue } from '../scripts/mutate.mjs'

const dir = mkdtempSync(path.join(os.tmpdir(), 'qh-catalogue-write-'))
after(() => rmSync(dir, { recursive: true, force: true }))

test('the catalogue is written through a temporary file and a rename, and a failed write leaves it whole', () => {
  const file = path.join(dir, 'mutations.json')
  writeFileSync(file, '{"mutations":[]}\n')
  const targets = []
  const fs = { writeFileSync: (target, text) => { targets.push(target); writeFileSync(target, text) } }
  writeCatalogue(file, { mutations: [{ label: 'a' }] }, { fs })
  assert.notEqual(targets[0], file, 'the catalogue itself was written in place')
  assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), { mutations: [{ label: 'a' }] })
  // The dirty twin: a rename that fails leaves the old catalogue byte-identical and no temp file behind.
  const before = readFileSync(file, 'utf8')
  assert.throws(() => writeCatalogue(file, { mutations: [] }, { fs: { renameSync: () => { throw new Error('EIO') } } }), /EIO/)
  assert.equal(readFileSync(file, 'utf8'), before)
  assert.deepEqual(readdirSync(dir), ['mutations.json'])
})
