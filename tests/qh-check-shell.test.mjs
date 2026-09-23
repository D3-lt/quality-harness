// Which shell runs the project's check.
//
// `qh-check` started the check with `shell: true`, which is cmd.exe on Windows,
// and cmd.exe cannot run a POSIX check: a declared `./.venv/Scripts/python.exe -m
// pytest` failed with "'.' is not recognized", so a downstream commit hook stayed
// blocked on a suite that passed when run directly (reported 2026-09-23 against
// 2.103.0, BACKLOG §261). Windows now runs the check through the resolved Git Bash,
// and a machine with none says the check did not start instead of asking cmd.exe.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { stateDir } from '../plugin/scripts/lifecycle.mjs'
import { checkLaunch, runCheck } from '../plugin/scripts/qh-check.mjs'

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const qhCheck = path.join(repoRoot, 'plugin', 'bin', 'qh-check')
const scratch = realpathSync.native(mkdtempSync(path.join(
  process.platform === 'darwin' ? '/private/tmp' : os.tmpdir(), 'qh-check-shell-')))
after(() => rmSync(scratch, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }))

let projects = 0
// A fresh repository under the scratch directory whose declared check is `check`,
// with each of `scripts` written executable under sub/.
function project(check, scripts) {
  const dir = path.join(scratch, `project-${projects++}`)
  mkdirSync(path.join(dir, 'sub'), { recursive: true })
  const init = spawnSync('git', ['init', '-q', dir], { encoding: 'utf8', timeout: 10_000 })
  assert.equal(init.status, 0, init.stderr)
  writeFileSync(path.join(dir, '.quality-harness.json'), JSON.stringify({ check }))
  for (const [name, body] of Object.entries(scripts)) {
    const file = path.join(dir, 'sub', name)
    writeFileSync(file, body)
    chmodSync(file, 0o755)
  }
  return dir
}

function sink() {
  const chunks = []
  return { write: chunk => { chunks.push(String(chunk)); return true }, text: () => chunks.join('') }
}

function records(dir) {
  const file = path.join(stateDir(dir), 'checks.jsonl')
  return existsSync(file) ? readFileSync(file, 'utf8').trim().split('\n').map(line => JSON.parse(line)) : []
}

const PASSES = { check: '#!/bin/sh\necho ran-the-declared-check\nexit 0\n' }
const FAILS = { check: '#!/bin/sh\nexit 3\n' }

test('POSIX keeps /bin/sh; Windows runs the check through bash, and without one does not run it', () => {
  const noResolve = () => assert.fail('POSIX must not resolve a bash')
  assert.deepEqual(checkLaunch('./x', 'linux', {}, noResolve), { file: './x', args: [], shell: true })
  assert.deepEqual(checkLaunch('./x', 'darwin', {}, noResolve), { file: './x', args: [], shell: true })
  const bash = 'C:\\Program Files\\Git\\bin\\bash.exe'
  assert.deepEqual(checkLaunch('./x', 'win32', {}, () => bash), { file: bash, args: ['-c', './x'], shell: false })
  assert.equal(checkLaunch('./x', 'win32', {}, () => null), null)
})

test('on Windows the declared check goes through the resolved bash, and its exit is the answer', {
  skip: process.platform === 'win32'
    && 'the stand-in bash is a shell script, which Windows cannot exec; the reported-shape test covers Windows itself',
}, async () => {
  const marker = path.join(scratch, 'bash-was-used')
  const realBash = spawnSync('sh', ['-c', 'command -v bash'], { encoding: 'utf8', timeout: 10_000 }).stdout.trim()
  assert.ok(realBash, 'a bash is on PATH to stand behind the stand-in')
  const standIn = path.join(scratch, 'bash-stand-in')
  writeFileSync(standIn, `#!/bin/sh\n: > '${marker}'\nexec '${realBash}' "$@"\n`)
  chmodSync(standIn, 0o755)
  const env = { ...process.env, CLAUDE_CODE_GIT_BASH_PATH: standIn }

  const passing = project('./sub/check', PASSES)
  const out = sink()
  assert.equal(await runCheck({ cwd: passing, env, platform: 'win32', stdout: out, stderr: sink() }), 0)
  // The mechanism, not the outcome: /bin/sh would also exit 0 here.
  assert.ok(existsSync(marker), 'the check ran through the resolved bash')
  assert.match(out.text(), /ran-the-declared-check/)
  assert.equal(records(passing).at(-1).command, './sub/check', 'the record keeps the declared command, not the bash argv')

  rmSync(marker)
  const failing = project('./sub/check', FAILS)
  assert.equal(await runCheck({ cwd: failing, env, platform: 'win32', stdout: sink(), stderr: sink() }), 3)
  assert.ok(existsSync(marker), 'the failing check ran through the resolved bash too')
  assert.equal(records(failing).at(-1).exit, 3)
})

test('on Windows with no bash the check did not start, and the record says so', async () => {
  const dir = project('./sub/check', PASSES)
  const nowhere = path.join(scratch, 'nowhere')
  const env = { PATH: '', LOCALAPPDATA: nowhere, ProgramFiles: nowhere, 'ProgramFiles(x86)': nowhere, SystemDrive: nowhere }
  const err = sink()
  assert.equal(await runCheck({ cwd: dir, env, platform: 'win32', stdout: sink(), stderr: err }), 127)
  assert.match(err.text(), /could not start .*CLAUDE_CODE_GIT_BASH_PATH/)
  const [record] = records(dir)
  assert.equal(record.verdict, 'unstarted')
  assert.equal(record.exit, null)
  assert.equal(record.command, './sub/check')
})

// The shape the report came through: the gate itself, on the host's own platform,
// with a declared check that starts `./`. On Windows this is the red the report
// named; everywhere else it pins that nothing about POSIX moved.
test('a declared ./ check runs through qh-check on this platform, and a failing one fails', () => {
  const run = cwd => spawnSync('python3', [qhCheck], { cwd, encoding: 'utf8', timeout: 60_000 })
  const passing = run(project('./sub/check', PASSES))
  assert.equal(passing.status, 0, passing.stdout + passing.stderr)
  assert.match(passing.stdout, /ran-the-declared-check/)
  const failing = run(project('./sub/check', FAILS))
  assert.equal(failing.status, 3, failing.stdout + failing.stderr)
})
