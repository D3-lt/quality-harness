// ADR-059: a read-only command's arguments are not changed paths.
// Every command shape here was measured on 2026-09-17 (ADR-059's Context).
//
// Patterns and fixtures live at module scope, never as regex literals inside a
// test body: the test-lock hasher masks strings but not regex literals
// (BACKLOG §212), and every body here is locked at its task's first red.
import assert from 'node:assert/strict'
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test, { after } from 'node:test'
import { bashMarkdownMutationPaths, classifyCommand } from '../plugin/scripts/lifecycle.mjs'

const testTmp = realpathSync(mkdtempSync(path.join(
  process.platform === 'darwin' ? '/private/tmp' : os.tmpdir(), 'qh-read-args-')))
after(() => {
  try { rmSync(testTmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }) }
  catch (error) {
    process.stderr.write('[read-only-arguments.test] could not remove ' + testTmp + ': ' + (error?.message ?? error) + '\n')
  }
})

async function project(prefix) {
  const dir = await mkdtemp(path.join(testTmp, prefix))
  await mkdir(path.join(dir, 'docs'))
  for (const file of ['notes.md', 'README.md', 'docs/a.md', 'docs/b.md', 'docs/c.md', 'docs/new.md']) {
    await writeFile(path.join(dir, file), 'x\n')
  }
  return dir
}

// ---- T1: a channel-free read names no changed path.
const CHANNEL_FREE_FAMILIES = ['cat', 'head', 'tail', 'cut', 'tr', 'ls', 'stat', 'which', 'basename', 'dirname',
  'realpath', 'readlink', 'diff', 'cmp', 'md5sum', 'sha256sum', 'jq', 'column', 'nl']
const CHANNEL_FREE_WRITES = [
  ['cat docs/a.md > docs/new.md', 'docs/new.md'],
  ['head -2 notes.md >> README.md', 'README.md'],
  ['touch b.log; /usr/bin/time -o docs/new.md cat docs/a.md', 'docs/new.md'],
  ['cat docs/a.md && cp notes.md docs/new.md', 'docs/new.md'],
]

test('a channel-free read names no changed path', async () => {
  const dir = await project('t1-')
  for (const family of CHANNEL_FREE_FAMILIES) {
    const command = 'touch b.log && ' + family + ' docs/a.md'
    assert.equal(classifyCommand(command), 'mutation', command)
    assert.deepEqual(bashMarkdownMutationPaths(command, dir), [], command)
  }
})

test('a redirect beside a channel-free read is still a changed path', async () => {
  const dir = await project('t1w-')
  for (const [command, target] of CHANNEL_FREE_WRITES) {
    assert.ok(bashMarkdownMutationPaths(command, dir).includes(path.join(dir, target)), command)
  }
})
