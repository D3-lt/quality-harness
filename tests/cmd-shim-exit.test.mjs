// Every Windows shim in plugin/bin passes a failure through. A bare `exit /b` after `python "%~dp0<gate>" %*` gave the caller 0
// when no python was found at all, so a gate that never ran read as one that passed (a Windows peer, 2026-10-22, with PATH
// holding only node and System32: qh-check, adr-verify and adr-lint each printed "'python' is not recognized" and exited 0).
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const bin = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'plugin', 'bin')
const windows = process.platform === 'win32'

test('a Windows shim with no python to run exits non-zero', { skip: !windows && 'the .cmd shims run only on Windows' }, () => {
  const system32 = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32')
  const shims = readdirSync(bin).filter(name => name.endsWith('.cmd'))
  assert.ok(shims.length > 5, `the shims were not found in ${bin}`)
  const exitedZero = []
  for (const shim of shims) {
    // No py launcher and no python: only System32, where cmd and where.exe live.
    const run = spawnSync(`"${path.join(bin, shim)}" --version`, { shell: true, encoding: 'utf8', timeout: 60_000, windowsHide: true,
      env: { ...process.env, PATH: system32, Path: system32 } })
    if (run.status === 0) exitedZero.push(`${shim}: ${run.stdout}${run.stderr}`.trim())
  }
  // Every shim is named, not only the first (a Windows peer's suggestion when it verified this test red, then green).
  assert.deepEqual(exitedZero, [], `shims that exited 0 with no python on PATH:\n${exitedZero.join('\n')}`)
})
