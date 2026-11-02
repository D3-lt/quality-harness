// BACKLOG §445: every real-path site of the core takes nativeRealpath (core/hooks/realpath_windows.go), libuv's
// uv_fs_realpath as Node's realpathSync.native calls it, so a junction resolves for the core as it does for Node.
// TestNativeRealpathWindows is built only on Windows; elsewhere nativeRealpath is filepath.EvalSymlinks, and the test says so
// and skips.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { required } from './helpers/require.mjs'

const coreDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'core')
const goVersion = spawnSync('go', ['version'], { encoding: 'utf8', timeout: 30_000, windowsHide: true })
const noGo = required('go', goVersion.error || goVersion.status !== 0
  ? `go is not on PATH (${goVersion.error?.code ?? `exit ${goVersion.status}`}), so the Go core cannot be built here` : false)
const skip = process.platform !== 'win32' ? 'TestNativeRealpathWindows is built only on Windows' : noGo

test('the core takes a real path on Windows as libuv does', { skip }, () => {
  const ran = spawnSync('go', ['test', '-count=1', '-v', '-run', '^TestNativeRealpathWindows$', './hooks/'], {
    cwd: coreDir, encoding: 'utf8', timeout: 600_000, windowsHide: true,
  })
  const said = `${ran.stdout}\n${ran.stderr}`
  assert.equal(ran.status, 0, said.split('\n').slice(-40).join('\n'))
  assert.match(said, /^--- PASS: TestNativeRealpathWindows \(/m, said)
})
