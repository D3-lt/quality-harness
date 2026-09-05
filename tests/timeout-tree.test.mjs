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

// The beat is append-only and writes ONE LINE per beat, so the number of complete
// lines is the beat count. Lines rather than bytes on purpose: a torn final write
// is a partial line, and a partial line is not a beat that happened. Every
// fixture here — the bash fences and both Python probes — terminates each beat
// with a newline for exactly this reason; "" means no complete beat yet.
const BEATS = 100
const beat = dir => {
  try {
    const beats = (readFileSync(join(dir, 'beat.txt'), 'utf8').match(/\n/g) || []).length
    return beats ? String(beats) : ''
  } catch { return '' }
}

/**
 * The gate returned while the grandchild was still alive, and the grandchild
 * then stopped.
 *
 * ⚠ THE FIRST ASSERTION USED TO BE A CLOCK — `elapsedMs < 10_000` — and BACKLOG
 * §127b is why that is the wrong instrument: on a loaded runner the same number
 * is the runner, not the gate. What it was really asking has an answer that
 * needs no clock, and the fixture already gives it. The grandchild is bounded at
 * BEATS; if it had written all of them by the time the gate returned, it FINISHED
 * ON ITS OWN, and every "did the beat stop" assertion after that passes vacuously
 * — which is exactly how two catalogue mutants came back GREEN on 2026-09-04.
 * Counting beats asks that directly, and a slow machine does not change the
 * answer: the grandchild's own progress is the yardstick. `elapsedMs` is still
 * carried into the message as diagnosis; it is not asserted.
 */
async function assertTreeDied(dir, label, elapsedMs) {
  const atReturn = beat(dir)
  assert.notEqual(atReturn, '', `${label}: the grandchild never wrote a beat, so the fixture proved nothing`)
  assert.ok(Number(atReturn) < BEATS,
    `${label}: the grandchild had written all ${BEATS} beats by the time the gate returned (${elapsedMs}ms) — it ran to completion on its own, so the gate never killed it and the check below would pass either way`)
  await new Promise(r => setTimeout(r, 1200))
  assert.equal(beat(dir), atReturn,
    `${label}: the heartbeat kept moving after the gate reported the timeout — the grandchild survived`)
}
// ⚠ THE TREE KILL ON WINDOWS IS NON-DETERMINISTIC, and this says so from the
// logs rather than by analogy (CLAUDE.md §7). The same direct-path invocation,
// with byte-identical gate code, on the same CI runner: 479fbef passed, 0a18d04
// and 867592c sat at the 60s cap, df8740a returned in 1324ms with the tree dead
// (`drain communicate returned`). Two real Windows 11 boxes returned in 1297ms
// and 1489ms with beats at return = 5, three seconds later = 5. So `taskkill /F
// /T` DOES reach a Git Bash subshell tree — usually — and BACKLOG §128 holds the
// mechanism that turned an occasional survivor into a 60s hang (close() behind a
// reader thread), now bounded at ~11s and named by the trace.
//
// What stays skipped here is the assertion that the tree DIED, because on the
// CI runner it sometimes does not, for a reason nobody has attributed. Asserting
// it would redden a release run at random on a real but unexplained survivor;
// `a timed-out fence returns within the bound the arithmetic gives` runs there
// instead and carries the trace either way. The leader-exits shape (§123) is a
// separate gap — bash is gone before taskkill runs, so /T has no root to walk —
// and is unproved on Windows on any box.
const posixTree = {
  skip: process.platform === 'win32'
    ? 'the Windows tree kill is non-deterministic on the CI runner (pass/fail/fail/pass on '
      + 'identical gate code) and the survivor is unattributed; the trace test covers this path '
      + 'there and bounds the bad case. Tree DEATH is asserted only where it is deterministic. '
      + 'BACKLOG §123, §128, §129.'
    : false,
}
const LEADER_EXITS_FENCE = '( for i in $(seq 1 100); do echo "$i" >> beat.txt; sleep 0.2; done ) &'
test('adr-verify: a fence timeout kills the tree the fence started, not only bash', posixTree, async () => {
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
    "    open(\\"beat.txt\\", \\"a\\").write(str(i) + chr(10))\\\\n    time.sleep(0.2)'])\\n"
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

// The half of the Codex finding that was left behind, and it cost a Windows CI
// job the same day: `taskkill` had no timeout, so a hung taskkill hung the gate
// — a cleanup that wears the fence timeout's name. It is bounded now, and a
// taskkill that never returns answers False (not confirmed) instead of never
// answering. Both arms, because a bound that is never exceeded proves nothing.
test('a taskkill that hangs is bounded, and answers "not confirmed"', () => {
  const probe = `import importlib.machinery, importlib.util, subprocess, sys
sys.dont_write_bytecode = True
loader = importlib.machinery.SourceFileLoader("gate_probe", sys.argv[1])
spec = importlib.util.spec_from_loader(loader.name, loader)
module = importlib.util.module_from_spec(spec)
loader.exec_module(module)

seen = {}
def bounded(argv, **kw):
    seen["timeout"] = kw.get("timeout")
    return subprocess.CompletedProcess(argv, 0)

def hangs(argv, **kw):
    raise subprocess.TimeoutExpired(argv, kw.get("timeout"))

print(module.kill_tree(4242, "nt", run=bounded), seen["timeout"],
      module.kill_tree(4242, "nt", run=hangs))
`
  for (const gate of ['spec-verify', 'qh-mcp', 'adr-verify']) {
    const run = runPython(['-c', probe, join(bin, gate)], { encoding: 'utf8', timeout: 30_000 })
    assert.equal(run.status, 0, run.stdout + run.stderr)
    const [confirmed, timeout, hung] = run.stdout.trim().split(/\s+/)
    assert.equal(confirmed, 'True', `${gate}: a taskkill that answered 0 is a confirmed kill`)
    assert.ok(Number(timeout) > 0,
      `${gate}: taskkill must be given a timeout — unbounded, it wears the fence timeout's name`)
    assert.equal(hung, 'False',
      `${gate}: a taskkill that never returned is NOT a confirmed kill`)
  }
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
    "    open(\\"beat.txt\\", \\"a\\").write(str(i) + chr(10))\\\\n    time.sleep(0.2)'])\\n"
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

// CLAUDE.md §3, inside the gate's own cleanup. `kill_tree` swallowed every
// answer and returned None, so adr-verify printed "was killed" whether or not
// anything had died — an observation it did not make, on the platform BACKLOG
// §123 records the tree kill as NOT working at all. Both arms are asserted
// because a check that can only report success reports nothing.
test('kill_tree answers for the kill it made, on both arms', () => {
  const probe = `import importlib.machinery, importlib.util, subprocess, sys
sys.dont_write_bytecode = True
loader = importlib.machinery.SourceFileLoader("gate_probe", sys.argv[1])
spec = importlib.util.spec_from_loader(loader.name, loader)
module = importlib.util.module_from_spec(spec)
loader.exec_module(module)
answers = lambda code: (lambda argv, **kw: subprocess.CompletedProcess(argv, code))
print(module.kill_tree(4242, "nt", run=answers(0)),
      module.kill_tree(4242, "nt", run=answers(1)),
      module.kill_tree(4242, "nt", run=lambda argv, **kw: None))
`
  for (const gate of ['spec-verify', 'qh-mcp', 'adr-verify']) {
    const run = runPython(['-c', probe, join(bin, gate)], { encoding: 'utf8', timeout: 30_000 })
    assert.equal(run.status, 0, run.stdout + run.stderr)
    assert.equal(run.stdout.trim(), 'True False False',
      `${gate}: kill_tree must report what it observed, not assume the kill worked`)
  }
})

// And the answer has to travel, because the code that prints the verdict is
// nowhere near the code that did the killing. The VALUE is platform-dependent
// and is asserted deterministically by the test above; what is asserted here is
// that it reaches the caller at all.
test('a timed-out run_bounded carries the cleanup answer on its exception', () => {
  const probe = `import importlib.machinery, importlib.util, subprocess, sys
sys.dont_write_bytecode = True
loader = importlib.machinery.SourceFileLoader("gate_probe", sys.argv[1])
spec = importlib.util.spec_from_loader(loader.name, loader)
module = importlib.util.module_from_spec(spec)
loader.exec_module(module)
try:
    module.run_bounded([sys.executable, "-c", "import time; time.sleep(30)"],
                       timeout=0.5, capture_output=True, text=True)
    print("NO TIMEOUT")
except subprocess.TimeoutExpired as expired:
    print(hasattr(expired, "tree_killed"), expired.tree_killed)
`
  for (const gate of ['spec-verify', 'qh-mcp', 'adr-verify']) {
    const run = runPython(['-c', probe, join(bin, gate)], { encoding: 'utf8', timeout: 60_000 })
    assert.equal(run.status, 0, run.stdout + run.stderr)
    assert.match(run.stdout.trim(), /^True (True|False)$/,
      `${gate}: run_bounded must carry what the cleanup observed — got ${run.stdout.trim()}`)
  }
})

// ── BACKLOG §128: where the sixty seconds went ────────────────────────────────
//
// Three Windows CI runs sat at ~60s against a 1s fence timeout, and 1s + 15s +
// 10s does not reach 60. The mechanism, reproduced on macOS with a bare pipe:
// `communicate(timeout=)` on Windows reads from a daemon thread that holds the
// BufferedReader's lock while blocked; `stream.close()` in the cleanup takes the
// same lock and waits for the orphan to let go of the pipe. Sixty seconds is the
// fence's `sleep 60`. The fix is to not close on Windows. This runs on EVERY
// platform: on POSIX it is a regression, on Windows it is the proof — and if the
// proof fails, the trace in the failure message is the attribution §128 asks for,
// which is worth more than a skip.
test('a timed-out fence returns within the bound the arithmetic gives, and says where the time went', async t => {
  const dir = scratch()
  const path = task(dir, 'T1', HEARTBEAT_FENCE)
  const started = Date.now()
  const run = runPython([join(bin, 'adr-verify'), path, '--cwd', dir], {
    cwd: dir, encoding: 'utf8', timeout: 90_000,
    env: { ...process.env, QUALITY_HARNESS_FENCE_TIMEOUT: '1', QUALITY_HARNESS_TRACE_TIMEOUT: '1' },
  })
  const elapsed = Date.now() - started
  const trace = String(run.stderr || '').split('\n').filter(line => line.startsWith('[trace-timeout]'))
  t.diagnostic(`${process.platform}: adr-verify returned in ${elapsed}ms · ${trace.join(' · ') || '(no trace)'}`)
  assert.match(run.stdout + run.stderr, /UNRUN/, `the fence must be reported as not finished\n${run.stdout}${run.stderr}`)
  // UNRUN is exit 2, and the interpreter has to get there: a fatal error at
  // shutdown (the finalizer contending for a lock a frozen reader thread holds)
  // would print UNRUN, print the trace, and then abort — passing every check
  // below while leaving a crash on the user's screen. Found by the Codex review
  // of df8740a; the exit code is the one thing that separates the two.
  assert.equal(run.error, undefined, `adr-verify did not run to completion: ${run.error}`)
  assert.equal(run.status, 2, `UNRUN exits 2; got ${run.status} (signal ${run.signal})\n${run.stderr}`)
  // Both drain outcomes are honest: on POSIX the kill lands and communicate
  // RETURNS; on Windows it may time out and the streams are released instead.
  // What must be present either way is the kill's own answer and the drain's.
  assert.ok(trace.some(line => /kill_tree end confirmed=(True|False)/.test(line))
    && trace.some(line => /drain (communicate|streams)/.test(line)),
    `the cleanup must attribute its own phases, or the next hang is unexplained again:\n${run.stderr}`)
  // 1s timeout + 15s taskkill bound + 10s grace ≈ 26s worst case. Sixty is the
  // orphan's sleep, and waiting for it is the defect.
  assert.ok(elapsed < 40_000,
    `adr-verify took ${elapsed}ms against a 1s timeout — it waited for the orphan's pipe. Trace:\n${trace.join('\n')}`)
})

// The Windows branch, driven on every host through the `platform` seam
// (CLAUDE.md §7). A child that sleeps, a thread blocked reading its stdout the
// way Windows' communicate leaves one, and a drain told it is on "nt": it must
// return without waiting for the child. Under the catalogue mutant that closes
// the streams anyway, close() blocks behind the reading thread until the child
// exits — which is the hang, reproduced, and RED.
test('drain_after_kill on Windows does not close a stream a reader thread still holds', t => {
  const probe = `import importlib.machinery, importlib.util, subprocess, sys, threading, time
sys.dont_write_bytecode = True
loader = importlib.machinery.SourceFileLoader("gate_probe", sys.argv[1])
spec = importlib.util.spec_from_loader(loader.name, loader)
module = importlib.util.module_from_spec(spec)
loader.exec_module(module)
proc = subprocess.Popen([sys.executable, "-c", "import time; time.sleep(25)"], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
reader = threading.Thread(target=lambda: proc.stdout.read(), daemon=True)
reader.start()
# PROVE the reader is inside read() before the drain runs, rather than sleeping
# and hoping: its innermost Python frame must be the lambda's own line, which is
# where a thread sits while the C-level read holds the buffer lock. A blind
# sleep let a delayed thread turn the close-anyway mutant GREEN.
deadline = time.monotonic() + 10
while time.monotonic() < deadline:
    frame = sys._current_frames().get(reader.ident)
    if frame is not None and frame.f_code.co_name == "<lambda>":
        break
    time.sleep(0.01)
else:
    raise SystemExit("reader thread never reached read()")
time.sleep(0.05)
started = time.monotonic()
out, err, killed = module.drain_after_kill(proc, "nt", grace=0.5)
print("returned", round(time.monotonic() - started, 2), flush=True)
proc.kill()
`
  for (const gate of ['spec-verify', 'qh-mcp', 'adr-verify']) {
    const run = runPython(['-c', probe, join(bin, gate)], { encoding: 'utf8', timeout: 60_000 })
    assert.equal(run.status, 0, `${gate}\n${run.stdout}${run.stderr}`)
    const seconds = Number(/returned ([\d.]+)/.exec(run.stdout)?.[1])
    // Spoken on success too. A peer running this on real Windows found the
    // number only inside a failing assertion — a diagnostic that speaks only on
    // failure is not a diagnostic.
    t.diagnostic(`${gate}: drain_after_kill returned in ${seconds}s on the nt arm`)
    assert.ok(seconds < 8,
      `${gate}: drain_after_kill took ${seconds}s on the Windows arm — it waited on a stream a reader thread held`)
  }
})

// The trace is a diagnostic, and a diagnostic that can raise inside the
// TimeoutExpired handler REPLACES the timeout — the fence is then never killed
// and the caller reports a ValueError instead of an UNRUN. Both arms: a stderr
// that raises must leave TimeoutExpired intact, and a healthy stderr must still
// carry the trace, or a helper that swallows everything passes this too.
test('a trace that cannot be written never replaces the timeout it describes', () => {
  const probe = `import importlib.machinery, importlib.util, subprocess, sys, os, io
sys.dont_write_bytecode = True
loader = importlib.machinery.SourceFileLoader("gate_probe", sys.argv[1])
spec = importlib.util.spec_from_loader(loader.name, loader)
module = importlib.util.module_from_spec(spec)
loader.exec_module(module)
os.environ["QUALITY_HARNESS_TRACE_TIMEOUT"] = "1"
class Broken(io.TextIOBase):
    def write(self, s): raise ValueError("stderr is closed")
    def flush(self): raise ValueError("stderr is closed")
healthy = sys.stderr
sys.stderr = Broken()
try:
    module.run_bounded([sys.executable, "-c", "import time; time.sleep(30)"], timeout=0.5, capture_output=True, text=True)
    outcome = "NO TIMEOUT"
except subprocess.TimeoutExpired:
    outcome = "TimeoutExpired"
except Exception as e:
    outcome = type(e).__name__
finally:
    sys.stderr = healthy
print(outcome, flush=True)
buf = io.StringIO(); sys.stderr = buf
try:
    module.run_bounded([sys.executable, "-c", "import time; time.sleep(30)"], timeout=0.5, capture_output=True, text=True)
except subprocess.TimeoutExpired:
    pass
finally:
    sys.stderr = healthy
print("traced" if "[trace-timeout]" in buf.getvalue() else "silent", flush=True)
`
  for (const gate of ['spec-verify', 'qh-mcp', 'adr-verify']) {
    const run = runPython(['-c', probe, join(bin, gate)], { encoding: 'utf8', timeout: 60_000 })
    assert.equal(run.status, 0, `${gate}\n${run.stdout}${run.stderr}`)
    // Both separators (CLAUDE.md §7): on Windows this arrived as 'TimeoutExpired\r'
    // and the behaviour it reports had held.
    const [broken, healthy] = run.stdout.trim().split(/\r?\n/).map(line => line.trim())
    assert.equal(broken, 'TimeoutExpired',
      `${gate}: a stderr that raises replaced the timeout with ${broken} — the fence would never be killed`)
    assert.equal(healthy, 'traced', `${gate}: with a working stderr the trace must still be written`)
  }
})

// BACKLOG §129. Under the trace flag the Windows arm names the leader's children
// before taskkill and whichever of them is still alive after — the instrument
// for a survivor the CI runner sometimes leaves and nothing has yet named.
// Driven through the `run` seam on every host: a fake tasklist that lists two
// children, a taskkill that answers 0, and a fake post-kill tasklist that says
// one child is still there. Both lines must appear; the surviving one must be
// named; and with the flag unset none of it runs — a diagnostic that always
// speaks is noise, and one that speaks only on failure is not a diagnostic.
test('under the trace flag, kill_tree on Windows names the tree before and the survivor after', () => {
  const probe = `import importlib.machinery, importlib.util, io, os, subprocess, sys
sys.dont_write_bytecode = True
loader = importlib.machinery.SourceFileLoader("gate_probe", sys.argv[1])
spec = importlib.util.spec_from_loader(loader.name, loader)
module = importlib.util.module_from_spec(spec)
loader.exec_module(module)
calls = []
def run(argv, **kw):
    calls.append(argv[0]); return subprocess.CompletedProcess(argv, 0)
# Two snapshots: before, bash and sleep are children of 4242; after, only sleep
# is still anywhere in the table, and a NEW process has reused bash's pid.
snapshots = [
    [("bash.exe", 1001, 4242), ("sleep.exe", 1002, 4242), ("other.exe", 7, 1)],
    [("sleep.exe", 1002, 1), ("notbash.exe", 1001, 1), ("other.exe", 7, 1)],
]
def processes():
    return snapshots.pop(0)
def blind():
    raise OSError(5, "CreateToolhelp32Snapshot failed")
buf = io.StringIO(); real = sys.stderr; sys.stderr = buf
os.environ["QUALITY_HARNESS_TRACE_TIMEOUT"] = "1"
confirmed = module.kill_tree(4242, "nt", run=run, processes=processes)
blindbuf = io.StringIO(); sys.stderr = blindbuf
module.kill_tree(4242, "nt", run=run, processes=blind)
del os.environ["QUALITY_HARNESS_TRACE_TIMEOUT"]
quiet = io.StringIO(); sys.stderr = quiet
module.kill_tree(4242, "nt", run=run, processes=blind)
sys.stderr = real
print(confirmed, calls.count("taskkill"), repr(buf.getvalue()), repr(quiet.getvalue()), repr(blindbuf.getvalue()), flush=True)
`
  for (const gate of ['spec-verify', 'qh-mcp', 'adr-verify']) {
    const run = runPython(['-c', probe, join(bin, gate)], { encoding: 'utf8', timeout: 30_000 })
    assert.equal(run.status, 0, `${gate}\n${run.stdout}${run.stderr}`)
    const out = run.stdout.trim()
    assert.match(out, /^True 3 /, `${gate}: taskkill answered 0 every time and was called once per kill_tree`)
    assert.match(out, /tree before taskkill: leader 4242, children \[\('bash\.exe', 1001\), \('sleep\.exe', 1002\)\]/,
      `${gate}: the children must be named before the kill`)
    assert.match(out, /tree after taskkill: rc=0, still alive \[\('sleep\.exe', 1002\)\]/,
      `${gate}: the survivor must be named after it, and a reused pid under a new name must NOT be — this is the whole instrument`)
    assert.match(out, /COULD NOT LIST \(OSError: \[Errno 5\] CreateToolhelp32Snapshot failed\)/,
      `${gate}: a snapshot that fails must say so — a blind instrument that reports [] was the first draft`)
    assert.match(out, / '' '\[trace-timeout\] tree before taskkill: COULD NOT LIST/, `${gate}: with the flag unset, nothing is written and nothing is snapshotted`)
  }
})

// BACKLOG §123, the Windows killpg. A Job Object is membership, not ancestry:
// when it answers, the whole tree is gone and taskkill would only report a dead
// pid. Driven through the `job` seam on every host — a job whose terminate
// succeeds must make kill_tree answer True WITHOUT calling taskkill; one whose
// terminate fails must fall through to taskkill. The real WindowsJob (ctypes,
// CREATE_SUSPENDED, toolhelp resume) can only run on Windows and is measured
// there by peers; this proves the gate USES the answer, which is the half a
// mutant can kill anywhere.
test('kill_tree on Windows kills by job when it has one, and falls back to taskkill when the job cannot', () => {
  const probe = `import importlib.machinery, importlib.util, io, os, subprocess, sys
sys.dont_write_bytecode = True
loader = importlib.machinery.SourceFileLoader("gate_probe", sys.argv[1])
spec = importlib.util.spec_from_loader(loader.name, loader)
module = importlib.util.module_from_spec(spec)
loader.exec_module(module)
calls = []
def run(argv, **kw):
    calls.append(argv[0]); return subprocess.CompletedProcess(argv, 0)
class Job:
    def __init__(self, answer): self.answer = answer; self.calls = 0
    def terminate(self): self.calls += 1; return self.answer
good = Job(True); bad = Job(False)
a = module.kill_tree(4242, "nt", run=run, job=good)
taskkills_after_good = calls.count("taskkill")
b = module.kill_tree(4242, "nt", run=run, job=bad)
print(a, good.calls, taskkills_after_good, b, bad.calls, calls.count("taskkill"), flush=True)
`
  for (const gate of ['spec-verify', 'qh-mcp', 'adr-verify']) {
    const run = runPython(['-c', probe, join(bin, gate)], { encoding: 'utf8', timeout: 30_000 })
    assert.equal(run.status, 0, `${gate}\n${run.stdout}${run.stderr}`)
    assert.equal(run.stdout.trim(), 'True 1 0 True 1 1',
      `${gate}: a job that answers ends the kill without taskkill; one that cannot falls through to it — got ${run.stdout.trim()}`)
  }
})

// The in-job probe's FAILED arm exists because the probe was silent on two
// Windows boxes while the call behind it failed with ERROR_INVALID_HANDLE. A
// branch that exists because silence was the bug must be shown to speak, and
// a peer noted no run had ever printed it. Driven on any host through the
// kernel32 seam: a fake whose IsProcessInJob answers 0 with a GetLastError,
// and a fake whose probe answers True — both lines, or a probe that always
// prints FAILED would pass the first and mislead every reader.
test('the in-job probe reports a failed call, and a successful one, in those words', () => {
  const probe = `import importlib.machinery, importlib.util, io, sys, ctypes
sys.dont_write_bytecode = True
loader = importlib.machinery.SourceFileLoader("gate_probe", sys.argv[1])
spec = importlib.util.spec_from_loader(loader.name, loader)
module = importlib.util.module_from_spec(spec)
loader.exec_module(module)
class FakeK32:
    def __init__(self, answers, inside=False, err=0):
        self.answers, self.inside, self.err = answers, inside, err
    def GetCurrentProcess(self): return 0xFFFFFFFFFFFFFFFF
    def IsProcessInJob(self, proc, job, out):
        out._obj.value = self.inside if hasattr(out, "_obj") else self.inside
        return self.answers
    def CreateJobObjectW(self, a, b): return 1234
    def SetInformationJobObject(self, *a): return 1
    def AssignProcessToJobObject(self, *a): return 1
    def CloseHandle(self, h): return 1
class Proc:
    pid = 4242; _handle = 99
import os; os.environ["QUALITY_HARNESS_TRACE_TIMEOUT"] = "1"
real = sys.stderr
buf = io.StringIO(); sys.stderr = buf
module.WindowsJob(Proc(), 0.0, k32=FakeK32(0))
ok = io.StringIO(); sys.stderr = ok
module.WindowsJob(Proc(), 0.0, k32=FakeK32(1, inside=True))
sys.stderr = real
print(repr(buf.getvalue()), repr(ok.getvalue()), flush=True)
`
  for (const gate of ['spec-verify', 'qh-mcp', 'adr-verify']) {
    const run = runPython(['-c', probe, join(bin, gate)], { encoding: 'utf8', timeout: 30_000 })
    assert.equal(run.status, 0, `${gate}\n${run.stdout}${run.stderr}`)
    assert.match(run.stdout, /gate-in-job probe FAILED \(GetLastError=(\d+|None)\); nesting unknown/,
      `${gate}: a probe that fails must say so — this arm was silent on two boxes`)
    assert.match(run.stdout, /gate already inside a job: True \(nested job follows\)/,
      `${gate}: a probe that succeeds reports what it saw`)
  }
})

// ResumeThread answers the PREVIOUS suspend count, or DWORD(-1) on failure,
// and the first draft discarded the answer and counted the thread as resumed
// either way — a fence could stay suspended until the timeout with a job that
// said everything was fine. Driven through the kernel32 seam: a snapshot that
// yields one thread of the fence, and a ResumeThread that fails must make
// `resume` raise; one that answers 1 (was suspended once, now running) must
// count it. Both arms, because a resume that always raised would pass the first.
test('a ResumeThread that fails is a failure, not a resumed thread', () => {
  const probe = `import importlib.machinery, importlib.util, sys, ctypes
sys.dont_write_bytecode = True
loader = importlib.machinery.SourceFileLoader("gate_probe", sys.argv[1])
spec = importlib.util.spec_from_loader(loader.name, loader)
module = importlib.util.module_from_spec(spec)
loader.exec_module(module)
class FakeK32:
    def __init__(self, resume_answer): self.answer = resume_answer; self.resumed = 0
    def CreateToolhelp32Snapshot(self, kind, pid): return 77
    def Thread32First(self, snap, ref):
        ref._obj.th32OwnerProcessID = 4242; ref._obj.th32ThreadID = 9; return 1
    def Thread32Next(self, snap, ref): return 0
    def OpenThread(self, access, inherit, tid): return 88
    def ResumeThread(self, h): self.resumed += 1; return self.answer
    def CloseHandle(self, h): return 1
def build(k32):
    job = module.WindowsJob.__new__(module.WindowsJob)
    from ctypes import wintypes
    job.ctypes, job.wintypes, job.pid, job.k32 = ctypes, wintypes, 4242, k32
    return job
ok = build(FakeK32(1)); ok.resume(); print("ok", ok.k32.resumed)
bad = build(FakeK32(0xFFFFFFFF))
try:
    bad.resume(); print("NO RAISE")
except OSError as e:
    print("raised", "ResumeThread failed" in str(e))
`
  for (const gate of ['spec-verify', 'qh-mcp', 'adr-verify']) {
    const run = runPython(['-c', probe, join(bin, gate)], { encoding: 'utf8', timeout: 30_000 })
    assert.equal(run.status, 0, `${gate}\n${run.stdout}${run.stderr}`)
    assert.match(run.stdout, /^ok 1$/m, `${gate}: a thread that answers 1 is resumed once and counted`)
    assert.match(run.stdout, /^raised True$/m, `${gate}: DWORD(-1) from ResumeThread must raise, not count`)
  }
})
