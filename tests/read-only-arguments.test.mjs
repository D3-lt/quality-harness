// ADR-059: a read-only command's arguments are not changed paths.
// Every command shape here was measured on 2026-09-17 (ADR-059's Context).
//
// Patterns and fixtures live at module scope, never as regex literals inside a
// test body: the test-lock hasher masks strings but not regex literals
// (BACKLOG §212), and every body here is locked at its task's first red.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test, { after } from 'node:test'
import { fileURLToPath } from 'node:url'
import { analyzeTranscript, bashMarkdownMutationPaths, classifyCommand } from '../plugin/scripts/lifecycle.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const reviewerGuard = path.join(repoRoot, 'plugin', 'scripts', 'reviewer-guard.mjs')

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

// ---- T3: an assigned path used only by reads is not a changed path.
// The first command is the measured session's shape, with its python probe
// shortened to one that still reads a file.
const ASSIGNED_ONLY_READ = [
  "T=docs/a.md && mrw read \"$T\" | sed -n '1,90p'; cd plugin/lib && python3 -c 'src = open(\"notes.md\").read()'",
  'D=docs/a.md; cat "$D"; touch b.log',
  "T=docs/a.md; cat \"$T\"; sed -i '' 's/$T/x/' docs/b.md",
]
const ASSIGNED_KEPT = [
  ['A=docs/a.md; printf x | tee "$A"', 'docs/a.md'],
  ['T=docs/a.md && python3 plugin/bin/adr-verify "$T"', 'docs/a.md'],
  ['NOTE=docs/a.md; echo "- x" >> "$NOTE"', 'docs/a.md'],
  ['OUT=docs/c.md; cat docs/a.md docs/b.md > "$OUT"', 'docs/c.md'],
  ['F=docs/a.md; head -3 "$F"; pushd plugin; popd; printf x | tee -a "$F"', 'docs/a.md'],
  ['T=docs/a.md; cat "$T"; echo "$(printf x | tee "$T")"', 'docs/a.md'],
  ['T=docs/a.md; cat "$T"; bash <<EOF\nprintf x > "$T"\nEOF', 'docs/a.md'],
  ['T=docs/a.md; N=T; cat "$T"; printf x | tee "${!N}"', 'docs/a.md'],
  ['T=docs/a.md; printf x | tee "$T"; T=docs/b.md; cat "$T"', 'docs/a.md'],
  ['T=docs/a.md; export T; ./w.sh', 'docs/a.md'],
  ["DOC='docs/a.md' && printf x > docs/b.md", 'docs/a.md'],
]

test('an assigned path used only by reads is not a changed path', async () => {
  const dir = await project('t3-')
  for (const command of ASSIGNED_ONLY_READ) {
    assert.equal(classifyCommand(command), 'mutation', command)
    assert.equal(bashMarkdownMutationPaths(command, dir).includes(path.join(dir, 'docs/a.md')), false, command)
  }
})

test('an assigned path written, hidden, exported or never referenced is still a changed path', async () => {
  const dir = await project('t3w-')
  for (const [command, target] of ASSIGNED_KEPT) {
    assert.ok(bashMarkdownMutationPaths(command, dir).includes(path.join(dir, target)), command)
  }
})

// ---- T4: a used write channel is a write to the classifier and the guard.
const OUTPUT_CHANNELS = ['uniq /dev/null README.md', 'gtimeout 5 uniq /dev/null README.md', 'sort -o README.md /dev/null',
  'gtimeout 5 sort -o README.md /dev/null', 'sort -uo README.md docs/a.md', 'sort --out=README.md docs/a.md',
  'printf "a\\n" | uniq - README.md', 'find docs -name a.md -fprint out.txt', 'file -C -m docs/magic',
  'git diff --output=out.txt HEAD', 'git log -1 --output=out.txt', 'echo "$(sort -o README.md docs/a.md)"']
const PROGRAM_CHANNELS = ['rg --pre ./w.sh a docs', 'sort --compress-program=./z.sh docs/a.md', "git grep -O'./w.sh' a"]
const GUARD_REFUSES = ['gtimeout 5 uniq /dev/null README.md', 'git diff --output=README.md HEAD']
const CHANNEL_FREE_READS = ['uniq docs/a.md', 'uniq -c -f 1 docs/a.md', 'sort -u docs/a.md', 'gtimeout 5 sort docs/a.md',
  "find docs -name '*.md'", 'file docs/a.md', 'git diff HEAD', 'git log -1', 'rg a docs']

function guardExit(command) {
  const input = JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Bash', cwd: repoRoot, tool_input: { command } })
  return spawnSync(process.execPath, [reviewerGuard], { input, encoding: 'utf8', timeout: 30_000 }).status
}

function transcriptOf(command) {
  return [
    { type: 'assistant', message: { content: [{ type: 'tool_use', id: 'w1', name: 'Bash', input: { command } }] } },
    { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'w1', is_error: false, content: '' }] } },
  ].map(entry => JSON.stringify(entry)).join('\n')
}

test('a used write channel is a write to the classifier and the guard', () => {
  for (const command of OUTPUT_CHANNELS) {
    assert.equal(classifyCommand(command), 'mutation', command)
  }
  for (const command of PROGRAM_CHANNELS) {
    assert.equal(classifyCommand(command), 'unrecognised', command)
  }
  assert.notEqual(analyzeTranscript(transcriptOf(OUTPUT_CHANNELS[1]), repoRoot).authorship, 'none', OUTPUT_CHANNELS[1])
  for (const command of GUARD_REFUSES) {
    assert.equal(guardExit(command), 2, command)
  }
})

test('a read without its channel is still not a write', () => {
  for (const command of CHANNEL_FREE_READS) {
    assert.equal(classifyCommand(command), 'neither', command)
  }
  assert.equal(guardExit('sort README.md'), 0)
})
