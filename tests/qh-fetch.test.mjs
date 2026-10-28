import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { installCore } from '../plugin/scripts/qh-fetch.mjs'
import { remove } from './helpers/remove.mjs'

const version = '3.8.60'
const bytes = Buffer.from('fixture native executable')
const digest = createHash('sha256').update(bytes).digest('hex')
function fixture(t, options = {}) {
  const dataHome = mkdtempSync(path.join(os.tmpdir(), 'qh-fetch-'))
  t.after(() => remove(dataHome))
  const calls = []
  const request = async url => {
    calls.push(url)
    return new Response(url.endsWith('SHA256SUMS.txt')
      ? `${options.digest ?? digest}  qh-linux-amd64\n` : bytes)
  }
  const run = () => ({ status: 0, stdout: `qh version ${options.reportedVersion ?? version}\n` })
  return { args: { version, platform: 'linux', arch: 'x64', dataHome, request, run }, calls, dataHome }
}
test('SessionStart installs only this release and platform after checksum and version verification', async t => {
  const f = fixture(t)
  const first = await installCore(f.args)
  assert.deepEqual(readFileSync(first.binary), bytes)
  assert.equal(readFileSync(first.binary + '.sha256', 'utf8').trim(), digest)
  assert.equal(f.calls.length, 2)
  assert.ok(f.calls.every(url => url.includes('/v3.8.60/')))
  const second = await installCore(f.args)
  assert.equal(second.binary, first.binary)
  assert.equal(f.calls.length, 2, 'a verified cache does not fetch again')
})
test('a checksum mismatch, wrong version, missing manifest entry, and unsupported platform never install', async t => {
  for (const options of [{ digest: '0'.repeat(64) }, { reportedVersion: '0.0.0' }]) {
    const f = fixture(t, options)
    await assert.rejects(installCore(f.args), /checksum|version/i)
    assert.equal(existsSync(path.join(f.dataHome, 'qh', version, 'qh-linux-amd64')), false)
  }
  const f = fixture(t)
  await assert.rejects(installCore({ ...f.args, platform: 'freebsd' }), /unsupported/i)
  assert.equal(f.calls.length, 0)
  await assert.rejects(installCore({ ...f.args, request: async () => new Response('not a checksum manifest') }), /checksum/i)
})
test('a failed fetch leaves no executable and a later retry can install', async t => {
  const f = fixture(t)
  await assert.rejects(installCore({ ...f.args, request: async () => { throw new Error('offline') } }), /offline/)
  assert.equal(existsSync(path.join(f.dataHome, 'qh', version, 'qh-linux-amd64')), false)
  assert.ok((await installCore(f.args)).binary)
})
