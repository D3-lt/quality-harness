// The bash a test spawns is the one the product would run (a Windows peer, 2026-10-15): with WSL's
// C:\Windows\system32\bash.exe first on PATH, a bare 'bash' reached WSL, which dropped the backslashes from the script's path.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { testBash } from './helpers/bash.mjs'

test('a test spawns the Git bash the product resolves, never the WSL stub ahead of it on PATH', () => {
  const git = 'C:\\Program Files\\Git\\usr\\bin\\bash.exe'
  const env = { PATH: 'C:\\Windows\\system32;C:\\Program Files\\Git\\usr\\bin' }
  const exists = file => file === git || file === 'C:\\Windows\\system32\\bash.exe'
  assert.equal(testBash('win32', env, exists), git)
  // DIRTY twins: a declared bash wins; with none found the bare name is spawned, so the failure is the spawn's own; elsewhere it is bash.
  assert.equal(testBash('win32', { ...env, CLAUDE_CODE_GIT_BASH_PATH: 'D:\\g\\bash.exe' }, exists), 'D:\\g\\bash.exe')
  assert.equal(testBash('win32', { PATH: 'C:\\Windows\\system32' }, exists), 'bash')
  assert.equal(testBash('linux', env, exists), 'bash')
})
