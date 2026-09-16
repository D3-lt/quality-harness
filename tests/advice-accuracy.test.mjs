// ADR-058: the commit and completion advisories name only what they observed.
// Each test reproduces a command shape measured on 2026-09-16 in the session
// that executed ADR-057, and carries its opposite, which must still advise.
//
// Patterns and fixtures live at module scope, never as regex literals inside a
// test body: the test-lock hasher masks strings but not regex literals
// (BACKLOG §212), and every body here is locked at its task's first red.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test, { after } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  bashMarkdownMutationPaths,
  analyzeTranscript,
  classifyCommand,
  isValidationCommand,
} from '../plugin/scripts/lifecycle.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pluginDir = path.join(repoRoot, 'plugin')
const testTmp = realpathSync(mkdtempSync(path.join(
  process.platform === 'darwin' ? '/private/tmp' : os.tmpdir(), 'qh-accuracy-')))
after(() => {
  try { rmSync(testTmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }) }
  catch (error) {
    process.stderr.write('[advice-accuracy.test] could not remove ' + testTmp + ': ' + (error?.message ?? error) + '\n')
  }
})

const UNCHECKED_COMMIT = new RegExp('would publish unchecked', 'i')
const PASSING_RUN = 'tests 12\npass 12\nfail 0'
const FAILING_RUN = 'Exit code 1\ntests 12\npass 11\nfail 1'

function transcript(entries) {
  return entries.map(entry => JSON.stringify(entry)).join('\n')
}

function toolUse(id, name, input) {
  return { type: 'assistant', message: { content: [{ type: 'tool_use', id, name, input }] } }
}

function toolResult(id, isError = false, content = 'ok') {
  return { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: id, is_error: isError, content }] } }
}

async function checkedProject(prefix) {
  const dir = await mkdtemp(path.join(testTmp, prefix))
  await writeFile(path.join(dir, 'package.json'), JSON.stringify({ scripts: { test: 'true' } }))
  return dir
}

function runLifecycleHook(payload) {
  return spawnSync(process.execPath, [path.join(pluginDir, 'scripts', 'lifecycle.mjs')], {
    cwd: testTmp,
    input: JSON.stringify({ cwd: testTmp, ...payload }),
    encoding: 'utf8',
    timeout: 60_000,
    env: { ...process.env, CLAUDE_PLUGIN_DATA: path.join(testTmp, 'claims-ledger'), TMPDIR: testTmp, TMP: testTmp, TEMP: testTmp },
  })
}

function publishAdvice(command, file, dir, label) {
  return runLifecycleHook({
    hook_event_name: 'PreToolUse', tool_name: 'Bash',
    tool_input: { command },
    transcript_path: file, cwd: dir,
    session_id: 'accuracy-' + label + '-' + process.pid + '-' + Math.random().toString(36).slice(2),
  })
}

function commitAdvice(file, dir, label) {
  return publishAdvice('git commit -m test', file, dir, label)
}

// ---- T1: a timeout-wrapped check is a check.
const WRAPPED_CHECKS = ['gtimeout 590 bash scripts/selftest.sh', 'timeout --kill-after=30 1800 npm test', 'gtimeout -k 2 5 pytest -q']
const BARE_CHECKS = ['bash scripts/selftest.sh', 'npm test', 'pytest -q']
const WRAPPED_NOT_CHECKS = ['gtimeout 5 rm -rf build', 'timeout 60 npm test > out.txt', 'gtimeout 5 gtimeout 5 npm test']

test('a timeout-wrapped check is a check', () => {
  for (const command of [...WRAPPED_CHECKS, ...BARE_CHECKS]) {
    assert.equal(isValidationCommand(command), true, command)
    assert.equal(classifyCommand(command), 'validation', command)
  }
})

test('a timeout wrapper does not launder a mutation', () => {
  for (const command of WRAPPED_NOT_CHECKS) {
    assert.equal(isValidationCommand(command), false, command)
    assert.notEqual(classifyCommand(command), 'validation', command)
  }
  assert.equal(classifyCommand('gtimeout 5 rm -rf build'), 'mutation')
})

test('the commit gate is silent after a passing timeout-wrapped check', async () => {
  const dir = await checkedProject('t1-')
  const edited = path.join(dir, 'a.js')
  await writeFile(edited, 'export {}\n')

  const passed = path.join(dir, 'passed.jsonl')
  await writeFile(passed, transcript([
    toolUse('e1', 'Edit', { file_path: edited }), toolResult('e1'),
    toolUse('c1', 'Bash', { command: 'gtimeout 60 npm test' }), toolResult('c1', false, PASSING_RUN),
  ]))
  assert.equal(analyzeTranscript(await readFile(passed, 'utf8'), dir).verifiedAfterLastMutation, true)
  const silent = commitAdvice(passed, dir, 'passed')
  assert.equal(silent.status, 0, silent.stderr)
  assert.doesNotMatch(silent.stderr, UNCHECKED_COMMIT, silent.stderr)

  const failed = path.join(dir, 'failed.jsonl')
  await writeFile(failed, transcript([
    toolUse('e1', 'Edit', { file_path: edited }), toolResult('e1'),
    toolUse('c1', 'Bash', { command: 'gtimeout 60 npm test' }), toolResult('c1', true, FAILING_RUN),
  ]))
  assert.match(commitAdvice(failed, dir, 'failed').stderr, UNCHECKED_COMMIT)
})

// ---- T2: mrw read is a read.
const MRW_READS = ['mrw read a.md:1-5', 'mrw --root /tmp/x read a.md', 'mrw -C /tmp/x read a.md', 'mrw --root=/tmp/x read a.md', 'mrw read "tests/a.json:10-20"; echo "mrw exit=$?"']
const MRW_NOT_READS = ["mrw write - <<'PLAN'\n@@ a.md 1 replace\nx\nPLAN", 'mrw --root read write a.md', 'mrw read a.md; rm b.md', 'mrw read a.md > out.txt', 'mrw stats']

test('mrw read is a read, not an unproven write', async () => {
  for (const command of MRW_READS) {
    assert.equal(classifyCommand(command), 'neither', command)
  }
  const dir = await checkedProject('t2-')
  const edited = path.join(dir, 'a.js')
  await writeFile(edited, 'export {}\n')
  const file = path.join(dir, 'read.jsonl')
  await writeFile(file, transcript([
    toolUse('e1', 'Edit', { file_path: edited }), toolResult('e1'),
    toolUse('c1', 'Bash', { command: 'npm test' }), toolResult('c1', false, PASSING_RUN),
    toolUse('r1', 'Bash', { command: MRW_READS[0] }), toolResult('r1', false, '1| export {}'),
  ]))
  const state = analyzeTranscript(await readFile(file, 'utf8'), dir)
  assert.equal(state.unprovenWritePending(), false, 'an mrw read after a passing check leaves nothing pending')
  assert.equal(state.verifiedAfterLastMutation, true)
})

test('mrw write is still judged as a write', async () => {
  for (const command of MRW_NOT_READS) {
    assert.notEqual(classifyCommand(command), 'neither', command)
  }
  assert.equal(classifyCommand('mrw read a.md; rm b.md'), 'mutation')
  const dir = await checkedProject('t2w-')
  const file = path.join(dir, 'write.jsonl')
  await writeFile(file, transcript([
    toolUse('c1', 'Bash', { command: 'npm test' }), toolResult('c1', false, PASSING_RUN),
    toolUse('w1', 'Bash', { command: MRW_NOT_READS[0] }), toolResult('w1', false, 'applied'),
  ]))
  assert.equal(analyzeTranscript(await readFile(file, 'utf8'), dir).unprovenWritePending(), true,
    'an mrw write after the check is still an unproven write')
})

// ---- T3: echo and printf arguments are not changed paths.
// The first command is the one measured on 2026-09-16, verbatim.
const PRINTED_PATHS = [
  'cp "$RUN/review.md" "$SC/codex-review-f37f57a.md" && rm -rf -- "$RUN" && echo "run dir removed, review kept at scratchpad/codex-review-f37f57a.md"',
  "printf '%s\\n' notes.md",
  'echo docs/new.md',
  'echo "a > docs/new.md"',
]
const REDIRECTED_PATHS = [['echo x > docs/new.md', 'docs/new.md'], ['printf y >> README.md', 'README.md'], ['echo x >docs/new.md', 'docs/new.md']]

async function markdownProject(prefix) {
  const dir = await checkedProject(prefix)
  await mkdir(path.join(dir, 'docs'))
  await mkdir(path.join(dir, 'scratchpad'))
  for (const file of ['notes.md', 'README.md', 'docs/new.md', 'scratchpad/codex-review-f37f57a.md']) {
    await writeFile(path.join(dir, file), 'x\n')
  }
  return dir
}

test('echo and printf arguments are not changed paths', async () => {
  const dir = await markdownProject('t3-')
  for (const command of PRINTED_PATHS) {
    assert.deepEqual(bashMarkdownMutationPaths(command, dir), [], command)
  }
  assert.equal(classifyCommand(PRINTED_PATHS[0]), 'mutation', 'the measured command is still a mutation')
})

test('an echo redirect target is still a changed path', async () => {
  const dir = await markdownProject('t3r-')
  for (const [command, target] of REDIRECTED_PATHS) {
    assert.deepEqual(bashMarkdownMutationPaths(command, dir), [path.join(dir, target)], command)
  }
  assert.deepEqual(bashMarkdownMutationPaths('cp a.txt docs/new.md', dir), [path.join(dir, 'docs/new.md')])
})

// ---- T4: a commit elsewhere does not arm this repository's advisory.
function gitRepository(dir) {
  const run = spawnSync('git', ['init', '-q', dir], { encoding: 'utf8', timeout: 30_000 })
  assert.equal(run.status, 0, run.stderr)
}

// Project A: a git repository with an Edit and no check after it.
async function uncheckedRepository(prefix) {
  const dir = await checkedProject(prefix)
  gitRepository(dir)
  const edited = path.join(dir, 'a.js')
  await writeFile(edited, 'export {}\n')
  const file = path.join(dir, 'edited.jsonl')
  await writeFile(file, transcript([toolUse('e1', 'Edit', { file_path: edited }), toolResult('e1')]))
  return { dir, file }
}

test("a commit in another repository does not arm this repository's commit advisory", async () => {
  const { dir, file } = await uncheckedRepository('t4-')
  const other = await mkdtemp(path.join(testTmp, 't4-other-'))
  gitRepository(other)
  const foreign = publishAdvice('git -C "' + other + '" commit --allow-empty -m probe', file, dir, 'foreign')
  assert.equal(foreign.status, 0, foreign.stderr)
  assert.doesNotMatch(foreign.stderr, UNCHECKED_COMMIT, foreign.stderr)
  assert.match(publishAdvice('git commit -m own', file, dir, 'own').stderr, UNCHECKED_COMMIT)
  assert.match(publishAdvice('git -C "' + other + '" commit -m probe && git commit -m own', file, dir, 'both').stderr,
    UNCHECKED_COMMIT)
})

test('a commit whose repository cannot be resolved still advises', async () => {
  const { dir, file } = await uncheckedRepository('t4u-')
  const plain = await mkdtemp(path.join(testTmp, 't4-plain-'))
  const unresolved = [
    'git -C "$X" commit -m x',
    'git -C "' + path.join(testTmp, 't4-missing') + '" commit -m x',
    'git -C "' + plain + '" commit -m x',
    'cd "$R" && git commit -m x',
  ]
  for (const [index, command] of unresolved.entries()) {
    const run = publishAdvice(command, file, dir, 'unresolved-' + index)
    assert.equal(run.status, 0, run.stderr)
    assert.match(run.stderr, UNCHECKED_COMMIT, command)
  }
})
