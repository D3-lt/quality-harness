import assert from 'node:assert/strict'
import test from 'node:test'
import { checkTimeoutMs, runLaunched } from '../plugin/scripts/check-child.mjs'

test('long check bounds saturate at the largest supported Node timer', () => {
  for (const seconds of ['2592000', '1e308']) {
    assert.equal(checkTimeoutMs({ QUALITY_HARNESS_CHECK_TIMEOUT: seconds }), 2 ** 31 - 1)
  }
})

test('a child that handles signals is killed after grace and the first signal is kept', {
  skip: process.platform === 'win32' && 'Windows taskkill terminates without a signal handler',
}, async () => {
  const child = "process.on('SIGINT', () => {}); process.on('SIGTERM', () => {}); console.log('ready'); setTimeout(() => {}, 10000)"
  const result = await runLaunched({ file: process.execPath, args: ['-e', child], shell: false }, {
    root: process.cwd(), platform: process.platform, env: process.env, timeoutMs: 5_000,
    stdout: { write() { process.emit('SIGINT', 'SIGINT'); process.emit('SIGTERM', 'SIGTERM') } },
    stderr: process.stderr, keep() {},
  })
  assert.equal(result.received, 'SIGINT')
  assert.equal(result.ended.signal, 'SIGKILL')
})
