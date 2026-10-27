// BACKLOG §428: after a no-work run on this tree, R1 says how many paths changed rather than listing them again. The real
// hook runs in a temp repository (tests/hook-golden.mjs), through the Node path and the Go core built from this tree.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { appendFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test, { after } from 'node:test'
import { fileURLToPath } from 'node:url'
import { fixtureRepo, runHook, runQhCheck, sandbox } from './hook-golden.mjs'
import { sessionLogFile } from '../plugin/scripts/lifecycle.mjs'
import { required } from './helpers/require.mjs'
import { remove } from './helpers/remove.mjs'

const skip = process.platform === 'win32' && 'the hooks are driven through POSIX shells (tests/hook-goldens.test.mjs)'
const coreDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'core')
const goVersion = spawnSync('go', ['version'], { encoding: 'utf8', timeout: 30_000, windowsHide: true })
const noGo = required('go', goVersion.error || goVersion.status !== 0
  ? `go is not on PATH (${goVersion.error?.code ?? `exit ${goVersion.status}`}), so the Go core cannot be built here` : false)

let goDirectory = null
after(() => { if (goDirectory) remove(goDirectory) })
function goCore() {
  goDirectory = mkdtempSync(path.join(os.tmpdir(), 'qh-no-work-bin-'))
  const bin = path.join(goDirectory, process.platform === 'win32' ? 'qh.exe' : 'qh')
  const built = spawnSync('go', ['build', '-o', bin, './cmd/qh'], { cwd: coreDir, encoding: 'utf8', timeout: 600_000, windowsHide: true })
  assert.equal(built.status, 0, `go build failed: ${built.stderr}`)
  return bin
}

// A turn that wrote ten files, ran the declared check once, and ended: what the Stop hook said about it.
function turnEnd(t, implementation, script, { torn = false } = {}) {
  const box = sandbox(t)
  const repo = fixtureRepo(box, 'turn', { '.quality-harness.json': `${JSON.stringify({ check: 'sh check.sh' })}\n`, 'check.sh': script, 'src/a.js': 'export const a = 1\n' })
  const hook = payload => runHook(box, repo, `no-work-${implementation.impl}`, payload, {}, implementation)
  hook({ hook_event_name: 'SessionStart', source: 'startup' })
  mkdirSync(path.join(repo, 'src', 'new'), { recursive: true })
  for (let i = 0; i < 10; i++) {
    const file = path.join(repo, 'src', 'new', `f${i}.js`)
    writeFileSync(file, `export const f${i} = ${i}\n`)
    hook({ hook_event_name: 'PostToolUse', tool_name: 'Write', tool_input: { file_path: file, content: 'x\n' }, tool_response: { filePath: file, success: true } })
  }
  runQhCheck(box, repo)
  // A torn last line: the no-work run survives, but which run was last can no longer be shown.
  if (torn) appendFileSync(sessionLogFile(repo, `no-work-${implementation.impl}`), '{"event":"check.failed","rec')
  const stop = hook({ hook_event_name: 'Stop', last_assistant_message: 'Done.' })
  assert.equal(stop.exit, 0, stop.stderr)
  return JSON.stringify(stop.stdout)
}

test('a no-work run on this tree is said in one line, not with the path list', { skip }, t => {
  for (const implementation of [{ impl: 'node' }, ...(noGo ? [] : [{ impl: 'go', bin: goCore() }])]) {
    const noWork = turnEnd(t, implementation, "echo 'tests 0'\n")
    assert.match(noWork, /ran no tests \(no-work\), so nothing verified it\. \d+ changed paths\./, implementation.impl)
    assert.doesNotMatch(noWork, /Changed paths:|src\/new\/f0\.js/, implementation.impl)
    // Dirty twin: a failed check on the same work still lists the paths.
    const red = turnEnd(t, implementation, 'exit 1\n')
    assert.match(red, /Changed paths: .*src\/new\/f0\.js.*, and \d+ more\./, implementation.impl)
    assert.doesNotMatch(red, /no-work/, implementation.impl)
    // And a no-work run in a log torn after it is not an established verdict: the paths are listed (the review of f2d2f739).
    const unknown = turnEnd(t, implementation, "echo 'tests 0'\n", { torn: true })
    assert.match(unknown, /check state is unknown/, implementation.impl)
    assert.match(unknown, /Changed paths: .*src\/new\/f0\.js/, implementation.impl)
  }
})
