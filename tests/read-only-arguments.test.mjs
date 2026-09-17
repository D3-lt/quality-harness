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

// ---- T2: a family that can write names no changed path until it uses that channel.
const CHANNEL_FAMILY_READS = [
  'touch b.log && sort docs/a.md',
  'touch b.log && sort -u -r docs/a.md',
  'touch b.log && uniq docs/a.md',
  'touch b.log && uniq -c -f 1 docs/a.md',
  "touch b.log && find docs -name '*.md'",
  'touch b.log && file docs/a.md',
  'touch b.log && rg a docs/a.md',
  'touch b.log && git diff -- docs/a.md',
  'touch b.log && git log -- docs/a.md',
  'touch b.log && git show HEAD -- docs/a.md',
  'touch b.log && git status docs/a.md',
  'touch b.log && git cat-file --batch-check < docs/a.md',
  'touch b.log && git grep -n a -- docs/a.md',
]
const CHANNEL_FAMILY_WRITES = [
  ['touch b.log; sort -o docs/new.md docs/a.md', 'docs/new.md'],
  ['touch b.log; sort -odocs/new.md docs/a.md', 'docs/a.md'],
  ['touch b.log; sort -uo docs/new.md docs/a.md', 'docs/new.md'],
  ['touch b.log; sort --output=docs/new.md docs/a.md', 'docs/new.md'],
  ['touch b.log; sort --out=docs/new.md docs/a.md', 'docs/new.md'],
  ['touch b.log; sort --compress-program=./z.sh docs/a.md', 'docs/a.md'],
  ['touch b.log; uniq docs/a.md docs/new.md', 'docs/new.md'],
  ['touch b.log; printf "a\\n" | uniq - docs/new.md', 'docs/new.md'],
  ['touch b.log; find docs/a.md -delete', 'docs/a.md'],
  ['touch b.log; find docs/a.md -exec cat {} \;', 'docs/a.md'],
  ['touch b.log; find docs -fprint0 docs/new.md', 'docs/new.md'],
  ['touch b.log; file -C -m docs/a.md', 'docs/a.md'],
  ['touch b.log; git diff --output=docs/new.md HEAD', 'docs/new.md'],
  ['touch b.log; git log -1 --output=docs/new.md', 'docs/new.md'],
  ['touch b.log; git show --output=docs/new.md HEAD', 'docs/new.md'],
  ['touch b.log; git -c diff.external=./w.sh diff docs/a.md', 'docs/a.md'],
  ['touch b.log; GIT_EXTERNAL_DIFF=./w.sh git diff docs/a.md', 'docs/a.md'],
  ["touch b.log; git grep -O'./w.sh' a -- docs/a.md", 'docs/a.md'],
  ['touch b.log; git grep --textconv a -- docs/a.md', 'docs/a.md'],
  ['touch b.log; rg --pre ./w.sh a docs/a.md', 'docs/a.md'],
  ['touch b.log; rg --hostname-bin=./w.sh a docs/a.md', 'docs/a.md'],
  ['touch b.log; RIPGREP_CONFIG_PATH=./rg.conf rg a docs/a.md', 'docs/a.md'],
]

test('a family that can write names no changed path until it uses that channel', async () => {
  const dir = await project('t2-')
  for (const command of CHANNEL_FAMILY_READS) {
    assert.equal(classifyCommand(command), 'mutation', command)
    assert.deepEqual(bashMarkdownMutationPaths(command, dir), [], command)
  }
})

test('a used write channel keeps every candidate', async () => {
  const dir = await project('t2w-')
  for (const [command, target] of CHANNEL_FAMILY_WRITES) {
    assert.ok(bashMarkdownMutationPaths(command, dir).includes(path.join(dir, target)), command)
  }
})
