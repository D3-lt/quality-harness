// BACKLOG §120 — a timeout that kills the child and not the tree.
//
// `subprocess.run(timeout=)` kills its DIRECT child. Every fence the gates run
// goes through bash, so the real work — a test runner, a mutation campaign — is a
// grandchild, and on 2026-09-04 one ran on with PPID 1 for minutes after the sweep
// had filed its claim as unrunnable, rewriting plugin/bin/adr-verify in the
// working tree. A timeout that reports "stopped" while the work continues is a
// false verdict, not a slow one.
//
// The fixture is deliberately pid-free: Git Bash reports MSYS pids, which Node
// cannot signal, so liveness is measured as a HEARTBEAT instead — a background
// subshell writes a counter to a file five times a second, and the assertion is
// that the counter stops moving once the gate has returned. The loop is bounded
// (100 beats, twenty seconds) so a red run cannot leave a runaway process behind.
//
// Every test here drives a real gate through the same call the defect came in
// through (CLAUDE.md §4): adr-verify's ordinary fence run, its --sweep, and the
// helper spec-verify and qh-mcp share by copy.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { pythonArgv, runPython } from '../scripts/python-interpreter.mjs'

const testDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(testDir, '..')
const bin = join(repoRoot, 'plugin', 'bin')

const temps = []
function scratch() {
  const dir = mkdtempSync(join(os.tmpdir(), 'qh-timeout-tree-'))
  temps.push(dir)
  return dir
}
test.after(() => { for (const dir of temps) rmSync(dir, { recursive: true, force: true }) })

// A bash fence whose grandchild outlives bash unless the tree is killed. The
// outer bash sleeps in the foreground so the timeout fires; the subshell in the
// background is the thing that must die with it.
//
// ⚠ The beat APPENDS. Truncating (`>` or open(…, "w")) opens a window where the
// file exists and is empty, and a read landing in it returns "" — which
// `assertTreeDied` cannot tell from "the grandchild never started". That flake
// failed the macOS job of run 33885863345 and no other job in it: same code,
// wider window under load. An append-only counter has no such state.
const HEARTBEAT_FENCE = [
  '( for i in $(seq 1 100); do echo "$i" >> beat.txt; sleep 0.2; done ) &',
  'sleep 60',
].join('\n')

// adr-verify's own digest, reimplemented so the sweep re-checks the claim rather
// than filing it superseded (same as tests/sweep.test.mjs).
function digestOf(fence) {
  const lines = fence.replace(/\r\n/g, '\n').split('\n')
  let start = 0
  let end = lines.length
  while (start < end && !lines[start].trim()) start += 1
  while (end > start && !lines[end - 1].trim()) end -= 1
  return createHash('sha256').update(lines.slice(start, end).join('\n'), 'utf8').digest('hex')
}

function task(dir, name, fence) {
  const path = join(dir, 'tasks', `${name}.md`)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, [
    `# Task ${name}`, '',
    '## Acceptance', '', '```bash', fence, '```', '',
    '## Verification Log',
    `- 2026-08-28 · abc1234 · exit 0 · \`${fence.split('\n')[0]}\` · acceptance-sha256:${digestOf(fence)}`,
    '',
  ].join('\n'), 'utf8')
  return path
}

// The beat is append-only, so its LENGTH is the counter and "" means only that
// nothing has been written yet — never a half-written file (see HEARTBEAT_FENCE).
const beat = dir => {
  try { return String(readFileSync(join(dir, 'beat.txt'), 'utf8').length) } catch { return '' }
}

// The grandchild is bounded at twenty seconds. That bound is what makes the
// stop-after-return check falsifiable: a helper that kills only the direct
// child and then waits on the pipes the orphan still holds does not return until
// the orphan finishes on its own, and every "did the beat stop" assertion after
// that passes vacuously. Measured 2026-09-04: two catalogue mutants came back
// GREEN for exactly that reason. So the first assertion is on WHEN the gate
// returned — a one-second timeout has no business taking ten.
const PROMPT_MS = 10_000

/** The gate returned promptly, the heartbeat had started, and it stopped. */
async function assertTreeDied(dir, label, elapsedMs) {
  assert.ok(elapsedMs < PROMPT_MS,
    `${label}: the gate took ${elapsedMs}ms to report a 1s timeout — it waited for the orphan to exit on its own, which means it never killed it`)
  const atReturn = beat(dir)
  assert.notEqual(atReturn, '', `${label}: the grandchild never wrote a beat, so the fixture proved nothing`)
  await new Promise(r => setTimeout(r, 1200))
  assert.equal(beat(dir), atReturn,
    `${label}: the heartbeat kept moving after the gate reported the timeout — the grandchild survived`)
}

test('adr-verify: a fence timeout kills the tree the fence started, not only bash', async () => {
  const dir = scratch()
  const path = task(dir, 'T1', HEARTBEAT_FENCE)
  const started = Date.now()
  const run = runPython([join(bin, 'adr-verify'), path, '--cwd', dir], {
    cwd: dir, encoding: 'utf8', timeout: 60_000,
    env: { ...process.env, QUALITY_HARNESS_FENCE_TIMEOUT: '1' },
  })
  const elapsed = Date.now() - started
  assert.match(run.stdout + run.stderr, /UNRUN/, `the fence must be reported as not finished\n${run.stdout}${run.stderr}`)
  await assertTreeDied(dir, 'ordinary fence run', elapsed)
})

test('adr-verify --sweep: a fence that times out takes its tree with it', async () => {
  const dir = scratch()
  task(dir, 'T1', HEARTBEAT_FENCE)
  const started = Date.now()
  const run = runPython([join(bin, 'adr-verify'), '--sweep', join(dir, 'tasks'), '--timeout', '1'], {
    cwd: dir, encoding: 'utf8', timeout: 60_000,
  })
  const elapsed = Date.now() - started
  assert.match(run.stdout, /did not finish/i, `the claim must be unrunnable\n${run.stdout}${run.stderr}`)
  // The sweep runs a fence in the task's own directory (no --cwd, no git root
  // here), so that is where the heartbeat lands.
  await assertTreeDied(join(dir, 'tasks'), 'sweep', elapsed)
})

// spec-verify and qh-mcp carry the same helper by copy (a shared module under
// bin/ would be read as a gate by the package tests). Each copy is driven
// directly with a Python grandchild, so the fixture needs no bash and runs the
// same on Windows.
const PROBE = `import importlib.machinery, importlib.util, subprocess, sys
sys.dont_write_bytecode = True
loader = importlib.machinery.SourceFileLoader("gate_probe", sys.argv[1])
spec = importlib.util.spec_from_loader(loader.name, loader)
module = importlib.util.module_from_spec(spec)
loader.exec_module(module)
child = (
    "import subprocess, sys, time\\n"
    "subprocess.Popen([sys.executable, '-c', 'import time\\\\nfor i in range(100):\\\\n"
    "    open(\\"beat.txt\\", \\"a\\").write(str(i))\\\\n    time.sleep(0.2)'])\\n"
    "time.sleep(60)\\n"
)
try:
    module.run_bounded([sys.executable, "-c", child], timeout=1, cwd=sys.argv[2],
                       capture_output=True, text=True)
except subprocess.TimeoutExpired:
    print("timed out")
`

for (const gate of ['spec-verify', 'qh-mcp', 'adr-verify']) {
  test(`${gate}: run_bounded kills the tree on timeout`, async () => {
    const dir = scratch()
    const started = Date.now()
    const run = runPython(['-c', PROBE, join(bin, gate), dir], { cwd: dir, encoding: 'utf8', timeout: 60_000 })
    const elapsed = Date.now() - started
    assert.equal(run.status, 0, `${gate} probe\n${run.stdout}${run.stderr}`)
    assert.match(run.stdout, /timed out/, `${gate}: the helper must raise TimeoutExpired`)
    await assertTreeDied(dir, gate, elapsed)
  })
}

// ── The two shapes the first fix missed, found by the Codex review of a46973e ──
//
// Both are cases where the tests above pass while the timeout is defeated, so
// each drives a gate through a fixture the heartbeat fence cannot express.

// The leader EXITS and leaves the work behind: `work &` and nothing else. The
// fence above keeps bash in the foreground, which is the one case a
// `killpg(getpgid(pid))` lookup survives — once the leader is gone the lookup
// raises ProcessLookupError and the group is never signalled. Measured on macOS
// 2026-09-04: 3.02s against a 0.3s timeout before the fix, 0.31s after.
//
// ⚠ THE DEFECT IS NOT UNIVERSAL, and CI is what said so. On Linux the same
// mutant came back GREEN (run 33892254729, mutations 4/8): a reaped leader stays
// a zombie there until Popen waits, so `getpgid` still answers and the lookup
// survives. The FIX is right everywhere — `start_new_session` makes the pgid the
// pid, so the lookup buys nothing — but the mutant that proves it can only die
// on macOS, and the campaign runs on Linux. It is de-registered for that reason
// and the reason is recorded, not the mutant quietly dropped (BACKLOG §123).
//
// On Windows this test measured 21.9s against a 1s timeout in the same run, so
// `taskkill /F /T` did not reach a Git Bash subshell tree. Skipped there with
// the measurement rather than asserted by analogy (CLAUDE.md §7).
const posixTree = {
  skip: process.platform === 'win32'
    ? 'measured 2026-09-04, CI run 33892254729: taskkill /F /T did not reach a Git Bash '
      + 'subshell tree — 21.9s against a 1s timeout. The Windows path is UNPROVEN, not proven '
      + 'working; BACKLOG §123.'
    : false,
}
const LEADER_EXITS_FENCE = '( for i in $(seq 1 100); do echo "$i" >> beat.txt; sleep 0.2; done ) &'

test('adr-verify: a fence whose leader exits still has its tree killed', posixTree, async () => {
  const dir = scratch()
  const path = task(dir, 'T1', LEADER_EXITS_FENCE)
  const started = Date.now()
  const run = runPython([join(bin, 'adr-verify'), path, '--cwd', dir], {
    cwd: dir, encoding: 'utf8', timeout: 60_000,
    env: { ...process.env, QUALITY_HARNESS_FENCE_TIMEOUT: '1' },
  })
  const elapsed = Date.now() - started
  assert.match(run.stdout + run.stderr, /UNRUN/, `the fence must be reported as not finished\n${run.stdout}${run.stderr}`)
  await assertTreeDied(dir, 'leader exits', elapsed)
})

// A cleanup that RAISES must not replace the exception that caused it. Measured
// on qh-mcp: a PermissionError out of kill_tree reached `except OSError` and a
// gate that ran and timed out was reported as one that DID NOT START — ADR-005's
// exact class — after waiting the child's full runtime.
const CLEANUP_RAISES_PROBE = `import importlib.machinery, importlib.util, subprocess, sys, time
sys.dont_write_bytecode = True
loader = importlib.machinery.SourceFileLoader("gate_probe", sys.argv[1])
spec = importlib.util.spec_from_loader(loader.name, loader)
module = importlib.util.module_from_spec(spec)
loader.exec_module(module)
def boom(pid, platform=None, run=subprocess.run):
    raise PermissionError(1, "Operation not permitted")
module.kill_tree = boom
started = time.monotonic()
try:
    module.run_bounded([sys.executable, "-c", "import time; time.sleep(30)"],
                       timeout=1, capture_output=True, text=True)
    print("NO EXCEPTION")
except subprocess.TimeoutExpired:
    print("TimeoutExpired %.1f" % (time.monotonic() - started))
except BaseException as exc:
    print("%s %.1f" % (type(exc).__name__, time.monotonic() - started))
`

for (const gate of ['spec-verify', 'qh-mcp', 'adr-verify']) {
  test(`${gate}: a cleanup that raises does not replace the timeout`, posixTree, () => {
    const run = runPython(['-c', CLEANUP_RAISES_PROBE, join(bin, gate)], { encoding: 'utf8', timeout: 60_000 })
    assert.equal(run.status, 0, `${gate} probe\n${run.stdout}${run.stderr}`)
    const [kind, seconds] = run.stdout.trim().split(/\s+/)
    assert.equal(kind, 'TimeoutExpired',
      `${gate}: a raising kill_tree replaced the timeout with ${kind} — the caller reports the wrong thing`)
    assert.ok(Number(seconds) < 10,
      `${gate}: took ${seconds}s to report a 1s timeout — cleanup left it waiting for the child`)
  })
}

// The Windows branch, exercised on every host through the seam (CLAUDE.md §7):
// taskkill /T is what reaches a tree there, and it must be asked for the pid it
// was given — never spawned where it does not exist.
test('kill_tree asks taskkill for the whole tree on Windows', () => {
  const probe = `import importlib.machinery, importlib.util, sys
sys.dont_write_bytecode = True
loader = importlib.machinery.SourceFileLoader("gate_probe", sys.argv[1])
spec = importlib.util.spec_from_loader(loader.name, loader)
module = importlib.util.module_from_spec(spec)
loader.exec_module(module)
seen = []
module.kill_tree(4242, "nt", run=lambda argv, **kw: seen.append(argv))
print(seen)
`
  const run = runPython(['-c', probe, join(bin, 'adr-verify')], { encoding: 'utf8', timeout: 30_000 })
  assert.equal(run.status, 0, run.stdout + run.stderr)
  assert.equal(run.stdout.trim(), "[['taskkill', '/F', '/T', '/PID', '4242']]")
})

// An INTERRUPTED gate takes its tree with it too. `subprocess.run` kills its
// child on any exception, and the first `run_bounded` did not: a Ctrl-C reached
// the `with` block, which then WAITED for bash's `sleep 60` while the heartbeat
// ran on — found by the Codex review's own probe on 2026-09-04. SIGINT is a
// Python KeyboardInterrupt on POSIX; on Windows `process.kill()` terminates the
// process outright and no handler runs, so there is nothing to assert there.
const posixOnly = {
  skip: process.platform === 'win32'
    ? 'process.kill(pid, "SIGINT") terminates a Windows process outright; no Python handler runs'
    : false,
}

async function until(predicate, ms) {
  const deadline = Date.now() + ms
  while (Date.now() < deadline) {
    if (predicate()) return true
    await new Promise(r => setTimeout(r, 100))
  }
  return false
}

/** SIGINT a running gate once its fence has started beating; return the exit wait. */
async function interruptOnceBeating(child, beatDir, label) {
  child.stdout.resume()
  child.stderr.resume()
  const exited = new Promise(r => child.on('exit', r))
  assert.ok(await until(() => beat(beatDir) !== '', 15_000), `${label}: the fence never started its heartbeat`)
  const started = Date.now()
  child.kill('SIGINT')
  const done = await Promise.race([exited.then(() => true), new Promise(r => setTimeout(() => r(false), 30_000))])
  const elapsed = Date.now() - started
  if (!done) child.kill('SIGKILL')
  assert.ok(done, `${label}: the gate did not exit within 30s of SIGINT — it waited for its fence instead of killing it`)
  return elapsed
}

test('adr-verify: an interrupted fence run takes its tree with it', posixOnly, async () => {
  const dir = scratch()
  const path = task(dir, 'T1', HEARTBEAT_FENCE)
  const [command, ...prefix] = pythonArgv()
  const child = spawn(command, [...prefix, join(bin, 'adr-verify'), path, '--cwd', dir], {
    cwd: dir, env: { ...process.env, QUALITY_HARNESS_FENCE_TIMEOUT: '60' }, stdio: ['ignore', 'pipe', 'pipe'],
  })
  const elapsed = await interruptOnceBeating(child, dir, 'interrupted fence run')
  await assertTreeDied(dir, 'interrupted fence run', elapsed)
})

const INTERRUPT_PROBE = `import importlib.machinery, importlib.util, subprocess, sys
sys.dont_write_bytecode = True
loader = importlib.machinery.SourceFileLoader("gate_probe", sys.argv[1])
spec = importlib.util.spec_from_loader(loader.name, loader)
module = importlib.util.module_from_spec(spec)
loader.exec_module(module)
child = (
    "import subprocess, sys, time\\n"
    "subprocess.Popen([sys.executable, '-c', 'import time\\\\nfor i in range(100):\\\\n"
    "    open(\\"beat.txt\\", \\"w\\").write(str(i))\\\\n    time.sleep(0.2)'])\\n"
    "time.sleep(60)\\n"
)
try:
    module.run_bounded([sys.executable, "-c", child], timeout=60, cwd=sys.argv[2],
                       capture_output=True, text=True)
except KeyboardInterrupt:
    print("interrupted", flush=True)
`

for (const gate of ['spec-verify', 'qh-mcp', 'adr-verify']) {
  test(`${gate}: an interrupted run_bounded kills the tree`, posixOnly, async () => {
    const dir = scratch()
    const [command, ...prefix] = pythonArgv()
    const child = spawn(command, [...prefix, '-c', INTERRUPT_PROBE, join(bin, gate), dir], {
      cwd: dir, stdio: ['ignore', 'pipe', 'pipe'],
    })
    const elapsed = await interruptOnceBeating(child, dir, gate)
    await assertTreeDied(dir, gate, elapsed)
  })
}
