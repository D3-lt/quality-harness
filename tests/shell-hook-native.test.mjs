// ADR-136 T2 and T3: the core's `qh bridge shell-hook <script>` (QH_SHELL_HOOK_NATIVE=1) against the Node runner it replaces,
// `node run-shell-hook.mjs <script>`. One scratch plugin root holds a copy of the Node runner with every module it imports and
// stub scripts under the registered names; the Node runner finds them beside itself, the core under CLAUDE_PLUGIN_ROOT. Each
// scenario runs through both from the same start, and exit, stdout and stderr must agree byte for byte.
//
// A registered script runs with a PATH that holds the stubs' tools but no node: Node is started here by its own path, so a core
// that still spawned the Node runner fails with "could not run the hook CLI" instead of agreeing with itself. Only the unknown
// script, which the core hands to Node by design (ADR-136 Decision 2), runs with node on the PATH.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { remove } from './helpers/remove.mjs'
import { sourceCore } from './helpers/source-core.mjs'

// A mutation run keeps a suite binary in QUALITY_HARNESS_QH_BIN, which sourceCore returns as it is: these assertions would then
// exercise an unmutated core. Build from this tree instead, as branch-state-native does.
if (process.env.QUALITY_HARNESS_MUTATION_IN_FLIGHT === '1') delete process.env.QUALITY_HARNESS_QH_BIN
const qh = sourceCore()
const SCRIPTS = fileURLToPath(new URL('../plugin/scripts/', import.meta.url))
const TIMEOUT_MS = 500
// What the test allows a timed-out run, as a hang guard: its timeout, the runner's 1 s cleanup grace, and a generous margin for
// a loaded or slow runner, set here rather than inherited (CLAUDE.md §7).
const HANG_GUARD_MS = TIMEOUT_MS + 1_000 + 8_000
const OVERRIDES = ['QH_SHELL_HOOK_NATIVE', 'QUALITY_HARNESS_SHELL_TIMEOUT_MS', 'QUALITY_HARNESS_STATE_DIR', 'QUALITY_HARNESS_SESSION_ID',
  'QUALITY_HARNESS_TRACE_FILE', 'QUALITY_HARNESS_TRACE_UNTIL', 'CLAUDE_PLUGIN_ROOT', 'GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE',
  'STUB_MODE', 'STUB_PIDFILE']

// The post-edit-check stub. STUB_MODE says what it does; it reads its stdin first, as a gate does. A pid it leaves behind is
// written as the Windows pid where Git Bash keeps one, since `$!` there is an MSYS number process.kill cannot ask about.
const POST_EDIT_CHECK = String.raw`pid_of() { if [ -r "/proc/$1/winpid" ]; then cat "/proc/$1/winpid"; else echo "$1"; fi > "$STUB_PIDFILE"; }
payload="$(cat)"
case "$STUB_MODE" in
  print)
    printf 'post-edit-check %s|%s|%s\n' "$1" "$2" "$QUALITY_HARNESS_SESSION_ID"
    printf 'quote " backslash \\ tab \t lt < amp & ctl \001 e-acute \303\251 ls \342\200\250 end\n'
    printf 'stdin %s\n\n  \n' "$payload" ;;
  silent) ;;
  fail) echo 'it broke'; echo 'on stderr' >&2; exit 3 ;;
  hang) echo 'before the hang'; sleep 20 & pid_of $!; wait ;;
  orphan) sleep 20 & pid_of $!; exit 0 ;;
  signal) echo 'about to die'; kill -TERM $$ ;;
  crash)
    echo 'partial'
    echo '      2 [main] bash (46688) C:\Program Files\Git\bin\bash.exe: *** fatal error - add_item ("\??\C:\Program Files\Git", "/", ...) failed, errno 1' >&2 ;;
  invalid) printf 'ok \342\202 x \377 y \360\237\230\n'; printf 'err \355\240\200 z\n' >&2 ;;
esac
`

// The facts-gate stub. It notes in STUB_MARK that it ran and with which arguments, so a skipped gate shows; `rewrite` edits the
// file it is gating while it runs, and `unproven` says the dispatcher's own word for a gate that could not answer.
const FACTS_GATE = String.raw`payload="$(cat)"
echo "$1|$2" >> "$STUB_MARK"
case "$STUB_MODE" in
  print) printf 'facts-gate %s|%s\n' "$1" "$2" ;;
  rewrite) printf 'moved under the gate\n' >> "$1"; echo 'rewritten' ;;
  fail) echo 'the gate broke' >&2; exit 1 ;;
  unproven) echo 'UNPROVEN: the gate could not answer' ;;
esac
`

// copyRunner copies run-shell-hook.mjs and every module it imports, transitively, so the copy runs beside the stubs.
function copyRunner(into) {
  const pending = ['run-shell-hook.mjs']
  const copied = new Set()
  while (pending.length) {
    const name = pending.pop()
    if (copied.has(name)) continue
    copied.add(name)
    const text = readFileSync(path.join(SCRIPTS, name), 'utf8')
    writeFileSync(path.join(into, name), text)
    for (const [, imported] of text.matchAll(/from '\.\/([\w.-]+\.mjs)'/g)) pending.push(imported)
  }
  assert.ok(copied.has('event-log.mjs') && copied.has('uninteresting.mjs'), `the runner's imports were copied: ${[...copied]}`)
}

function fixture(t) {
  const scratch = mkdtempSync(path.join(os.tmpdir(), 'qh-shn-'))
  t.after(() => remove(scratch))
  const root = path.join(scratch, 'plugin')
  const scripts = path.join(root, 'scripts')
  const project = path.join(scratch, 'project')
  const bin = path.join(scratch, 'bin')
  for (const directory of [scripts, project, bin]) mkdirSync(directory, { recursive: true })
  copyRunner(scripts)
  writeFileSync(path.join(scripts, 'post-edit-check.sh'), POST_EDIT_CHECK)

  const base = { ...process.env }
  for (const key of OVERRIDES) delete base[key]
  const pathKey = Object.keys(base).find(key => key.toUpperCase() === 'PATH') ?? 'PATH'
  const withNode = base[pathKey]
  delete base[pathKey]
  let withoutNode
  if (process.platform === 'win32') {
    // Both runners find Git Bash in its install root when PATH names none; its own startup puts the MSYS tools on PATH.
    withoutNode = path.join(process.env.SystemRoot || process.env.SYSTEMROOT, 'System32')
  } else {
    for (const tool of ['bash', 'sleep', 'cat']) {
      const found = spawnSync('/bin/sh', ['-c', `command -v ${tool}`], { encoding: 'utf8', timeout: 5_000, windowsHide: true })
      const located = found.stdout.trim()
      assert.ok(located.startsWith('/'), `${tool} must be locatable to build the isolated PATH\n${found.stderr}`)
      symlinkSync(located, path.join(bin, tool))
    }
    withoutNode = bin
  }

  // One run through one implementation. `node: true` keeps node on the PATH, for the script the core hands to Node.
  const run = (impl, script, payload, { env = {}, node = false } = {}) => {
    const environment = { ...base, ...env, PATH: node ? withNode : withoutNode, CLAUDE_PLUGIN_ROOT: root }
    if (impl === 'native') environment.QH_SHELL_HOOK_NATIVE = '1'
    const [command, args] = impl === 'node'
      ? [process.execPath, [path.join(scripts, 'run-shell-hook.mjs'), script]]
      : [qh, ['bridge', 'shell-hook', script]]
    const started = Date.now()
    const ran = spawnSync(command, args, { cwd: project, env: environment, input: typeof payload === 'string' ? payload : JSON.stringify(payload),
      timeout: 60_000, windowsHide: true })
    return { status: ran.status, stdout: ran.stdout, stderr: ran.stderr, error: ran.error, ms: Date.now() - started }
  }
  const pidFile = impl => path.join(scratch, `${impl}.pid`)
  return { scratch, root, scripts, project, run, pidFile }
}

// Plays one scenario through each runner from the same start and returns both runs once exit, stdout and stderr agree.
function both(f, name, script, payload, options = {}) {
  const runs = {}
  for (const impl of ['node', 'native']) {
    options.reset?.()
    runs[impl] = f.run(impl, script, payload, { ...options, env: { ...options.env, STUB_PIDFILE: f.pidFile(impl) } })
    assert.equal(runs[impl].error, undefined, `${impl}, ${name}: ${runs[impl].error}`)
    runs[impl].text = { stdout: runs[impl].stdout.toString('utf8'), stderr: runs[impl].stderr.toString('utf8') }
    // What the run left behind, when the scenario asks: compared like the output.
    if (options.observe) runs[impl].observed = options.observe()
  }
  const { node, native } = runs
  assert.deepEqual({ status: native.status, ...native.text }, { status: node.status, ...node.text }, `${name}: the core and the Node runner disagree`)
  assert.ok(native.stdout.equals(node.stdout) && native.stderr.equals(node.stderr), `${name}: the bytes differ`)
  assert.deepEqual(native.observed, node.observed, `${name}: the core and the Node runner left different state`)
  return runs
}

const alive = pid => { try { process.kill(pid, 0); return true } catch (error) { return error.code === 'EPERM' } }

// Whether the process a stub left behind is gone, given a moment to be reaped.
function gone(pid) {
  const until = Date.now() + 3_000
  while (alive(pid) && Date.now() < until) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50)
  return !alive(pid)
}

const escapeRegExp = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

test('the native shell hook says what the Node runner says in every scenario', async t => {
  const f = fixture(t)
  const file = path.join(f.project, 'hook.sh')
  const edit = { hook_event_name: 'PostToolUse', tool_name: 'Edit', session_id: 'shn-1', cwd: f.project, tool_input: { file_path: file } }
  const SCRIPT = 'post-edit-check.sh'

  await t.test('a passing gate that prints is handed to the agent as additionalContext', () => {
    const { node, native } = both(f, 'print', SCRIPT, edit, { env: { STUB_MODE: 'print' } })
    assert.equal(node.status, 0)
    const said = JSON.parse(node.text.stdout)
    assert.deepEqual(JSON.parse(native.text.stdout), said)
    assert.deepEqual(Object.keys(said.hookSpecificOutput), ['hookEventName', 'additionalContext'])
    assert.equal(said.hookSpecificOutput.hookEventName, 'PostToolUse')
    const context = said.hookSpecificOutput.additionalContext
    assert.match(context, new RegExp(`^post-edit-check Edit\\|${escapeRegExp(file)}\\|shn-1\\n`), 'arguments and session reach the gate')
    assert.match(context, /ls \u2028 end\nstdin \{"hook_event_name":"PostToolUse"/, 'the payload reaches its stdin')
    assert.ok(context.endsWith('}'), 'the report is trimmed')
    assert.equal(node.text.stderr, '')
  })

  await t.test('what a gate prints outside PostToolUse is passed on as it came', () => {
    const { node } = both(f, 'unwrapped', SCRIPT, { tool_name: 'Write', tool_input: { file_path: file } }, { env: { STUB_MODE: 'print' } })
    assert.match(node.text.stdout, new RegExp(`^post-edit-check Write\\|${escapeRegExp(file)}\\|\\n`))
    assert.ok(node.text.stdout.endsWith('\n\n  \n'))
  })

  await t.test('a passing gate that prints nothing says nothing', () => {
    const { node } = both(f, 'silent', SCRIPT, edit, { env: { STUB_MODE: 'silent' } })
    assert.deepEqual([node.status, node.text.stdout, node.text.stderr], [0, '', ''])
  })

  await t.test('a gate that exits non-zero is reported and blocks nothing', () => {
    const { node } = both(f, 'fail', SCRIPT, edit, { env: { STUB_MODE: 'fail' } })
    assert.equal(node.status, 0)
    assert.equal(node.text.stdout, 'it broke\n')
    assert.match(node.text.stderr, /^on stderr\nquality-harness: post-edit-check\.sh exited 3, which it should never do/)
  })

  for (const mode of ['hang', 'orphan']) {
    await t.test(`a timeout ends the gate's whole tree (${mode})`, () => {
      const runs = both(f, mode, SCRIPT, edit, { env: { STUB_MODE: mode, QUALITY_HARNESS_SHELL_TIMEOUT_MS: String(TIMEOUT_MS) } })
      assert.equal(runs.node.status, 0)
      assert.match(runs.node.text.stderr, new RegExp(`quality-harness: post-edit-check\\.sh timed out after ${TIMEOUT_MS}ms, so the gates have no verdict on ${escapeRegExp(file)}\\. Nothing is blocked\\.\\n$`))
      for (const impl of ['node', 'native']) {
        assert.ok(runs[impl].ms < HANG_GUARD_MS, `${impl} returned in ${runs[impl].ms} ms, past its ${HANG_GUARD_MS} ms hang guard`)
        const pid = Number(readFileSync(f.pidFile(impl), 'utf8'))
        assert.ok(pid > 0, `${impl}: the stub recorded the grandchild it left`)
        // taskkill /T walks a live tree: a grandchild whose parent already exited is out of its reach, for Node as for the core.
        if (mode === 'hang' || process.platform !== 'win32') assert.ok(gone(pid), `${impl}: the grandchild ${pid} outlived the deadline`)
      }
      if (mode === 'hang') {
        assert.equal(runs.node.text.stdout, 'before the hang\n', 'what the gate said before the deadline is passed on')
        assert.doesNotMatch(runs.node.text.stderr, /cleanup could not be confirmed/)
      }
    })
  }

  await t.test('a gate killed by a signal is unchecked, not clean', () => {
    const { node } = both(f, 'signal', SCRIPT, edit, { env: { STUB_MODE: 'signal' } })
    assert.equal(node.status, 0)
    assert.equal(node.text.stdout, 'about to die\n')
    if (process.platform !== 'win32') {
      assert.equal(node.text.stderr, 'quality-harness: post-edit-check.sh was killed by SIGTERM before it could report, so treat this edit as unchecked rather than clean. Nothing is blocked.\n')
    }
  })

  await t.test('an MSYS crash banner outranks the exit code', () => {
    const { node } = both(f, 'crash', SCRIPT, edit, { env: { STUB_MODE: 'crash' } })
    assert.equal(node.status, 0)
    assert.equal(JSON.parse(node.text.stdout).hookSpecificOutput.additionalContext, 'partial')
    assert.match(node.text.stderr, /\*\*\* fatal error - add_item[^\n]*\nquality-harness: the shell running post-edit-check\.sh aborted before the gate could report/)
  })

  await t.test('an unknown script is refused with exit 2', () => {
    const { node } = both(f, 'unknown', 'nope.sh', edit, { node: true })
    assert.equal(node.status, 2)
    assert.equal(node.text.stderr, 'quality-harness: unsupported shell hook: nope.sh\n')
  })
})

test('the native edit gate records what the Node one records', async t => {
  const f = fixture(t)
  writeFileSync(path.join(f.scripts, 'facts-gate-dispatch.sh'), FACTS_GATE)
  const init = spawnSync('git', ['init', '-q', f.project], { encoding: 'utf8', timeout: 30_000, windowsHide: true })
  assert.equal(init.status, 0, init.stderr)
  for (const directory of ['docs', 'fixtures']) mkdirSync(path.join(f.project, directory))
  // The payload names the scratch path as the OS handed it (on macOS through the /var symlink); the row's key is canonical.
  const record = path.join(f.project, 'docs', 'record.md')
  const fixtureRecord = path.join(f.project, 'fixtures', 'record.md')
  const ORIGINAL = '# A record\n'
  const mark = path.join(f.scratch, 'gate-ran')
  const state = path.join(f.project, '.git', 'quality-harness')
  const reset = () => {
    writeFileSync(record, ORIGINAL)
    writeFileSync(fixtureRecord, ORIGINAL)
    remove(state)
    remove(mark)
  }
  // Every session log either runner wrote, each row with its clock taken out and its key order kept.
  const observe = () => {
    const sessions = path.join(state, 'sessions')
    const logs = existsSync(sessions) ? readdirSync(sessions).sort() : []
    return {
      ran: existsSync(mark) ? readFileSync(mark, 'utf8') : null,
      logs: Object.fromEntries(logs.map(name => [name,
        readFileSync(path.join(sessions, name), 'utf8').replace(/^\{"at":"[^"]+",/gm, '{"at":"AT",')])),
    }
  }
  const gate = (name, payload, mode) => both(f, name, 'facts-gate-dispatch.sh', payload, { env: { STUB_MODE: mode, STUB_MARK: mark }, reset, observe })
  const edit = (file, extra = {}) => ({ hook_event_name: 'PostToolUse', tool_name: 'Edit', session_id: 'shn-gate', cwd: f.project, tool_input: { file_path: file }, ...extra })
  const blob = createHash('sha256').update(ORIGINAL).digest('hex')
  const row = (file, complete) => `{"at":"AT","event":"artifact.gated","path":${JSON.stringify(path.join(realpathSync(path.dirname(file)), path.basename(file)))},"blob":"${blob}","complete":${complete}}\n`

  await t.test('a passing gate over a file it left alone is recorded complete', () => {
    const { node } = gate('tracked', edit(record), 'print')
    assert.equal(node.status, 0)
    assert.equal(JSON.parse(node.text.stdout).hookSpecificOutput.additionalContext, `facts-gate ${record}|PostToolUse`)
    assert.deepEqual(node.observed, { ran: `${record}|PostToolUse\n`, logs: { 'shn-gate.jsonl': row(record, true) } })
  })

  await t.test('a file edited while its gate ran is recorded incomplete, under the bytes the gate read', () => {
    const { node } = gate('rewritten', edit(record), 'rewrite')
    assert.deepEqual(node.observed.logs, { 'shn-gate.jsonl': row(record, false) })
  })

  await t.test('an uninteresting path is not gated and is recorded answered', () => {
    const { node } = gate('uninteresting', edit(fixtureRecord), 'print')
    assert.deepEqual([node.text.stdout, node.text.stderr], ['', ''])
    assert.deepEqual(node.observed, { ran: null, logs: { 'shn-gate.jsonl': row(fixtureRecord, true) } })
  })

  await t.test('no session_id, no row', () => {
    const { node } = gate('no session', edit(record, { session_id: undefined }), 'print')
    assert.deepEqual(node.observed, { ran: `${record}|PostToolUse\n`, logs: {} })
  })

  await t.test('no cwd, no row', () => {
    const { node } = gate('no cwd', edit(record, { cwd: undefined }), 'print')
    assert.deepEqual(node.observed, { ran: `${record}|PostToolUse\n`, logs: {} })
  })

  await t.test('a failing gate is recorded incomplete', () => {
    const { node } = gate('failing', edit(record), 'fail')
    assert.match(node.text.stderr, /^the gate broke\nquality-harness: facts-gate-dispatch\.sh exited 1/)
    assert.deepEqual(node.observed.logs, { 'shn-gate.jsonl': row(record, false) })
  })

  await t.test('an UNPROVEN gate is recorded incomplete', () => {
    const { node } = gate('unproven', edit(record), 'unproven')
    assert.match(JSON.parse(node.text.stdout).hookSpecificOutput.additionalContext, /^UNPROVEN/)
    assert.deepEqual(node.observed.logs, { 'shn-gate.jsonl': row(record, false) })
  })
})

// A gate that prints bytes that are not UTF-8. Node decodes the child's output as UTF-8, one U+FFFD per maximal ill-formed
// subsequence; the core passed the bytes through, so the host received different text (found reviewing T2, 2026-11-01). The
// stub prints a truncated three-byte sequence, a stray 0xFF, a truncated four-byte sequence, and an encoded surrogate.
test('the native shell hook decodes a gate\'s invalid UTF-8 as Node does', t => {
  const f = fixture(t)
  const edit = { hook_event_name: 'PostToolUse', tool_name: 'Edit', session_id: 'shn-u8', cwd: f.project,
    tool_input: { file_path: path.join(f.project, 'hook.sh') } }
  const { node } = both(f, 'invalid UTF-8', 'post-edit-check.sh', edit, { env: { STUB_MODE: 'invalid' } })
  assert.equal(node.status, 0)
  assert.equal(JSON.parse(node.text.stdout).hookSpecificOutput.additionalContext, 'ok � x � y �')
  assert.equal(node.text.stderr, 'err ��� z\n')
})

// ADR-136 T4: both registrations' own commands are answered by the core with no flag set. The fixture's PATH has bash and its
// tools but no node, so a bridge that still spawned the Node runner fails here with "could not run the hook CLI".
test('the edit-gate registrations spawn no node', t => {
  const f = fixture(t)
  writeFileSync(path.join(f.scripts, 'facts-gate-dispatch.sh'), FACTS_GATE)
  const file = path.join(f.project, 'hook.sh')
  writeFileSync(file, 'echo gated\n')
  const edit = { hook_event_name: 'PostToolUse', tool_name: 'Edit', session_id: 'shn-t4', cwd: f.project, tool_input: { file_path: file } }
  for (const [script, said] of [['post-edit-check.sh', /^post-edit-check Edit\|/], ['facts-gate-dispatch.sh', /^facts-gate /]]) {
    const ran = f.run('default', script, edit, { env: { STUB_MODE: 'print', STUB_MARK: path.join(f.scratch, 'mark'), STUB_PIDFILE: f.pidFile('default') } })
    const out = ran.stdout.toString('utf8')
    const err = ran.stderr.toString('utf8')
    assert.equal(ran.status, 0, `${script}: ${out}\n${err}`)
    assert.doesNotMatch(err, /could not run the hook CLI/, err)
    assert.match(JSON.parse(out).hookSpecificOutput.additionalContext, said, out)
  }
})

// The core's other spawns write a process trace (ADR-131), and the Node runner's spawn was traced by the native launcher's
// exec. The native runner traced nothing, so ADR-131's cost readers lost every gate run, and the trace-sink refusal test in
// tests/native-observation.test.mjs passed without a trace to refuse (found reviewing T4, 2026-11-01).
test('the native shell hook traces the bash it runs', t => {
  const f = fixture(t)
  const trace = path.join(f.scratch, 'trace.jsonl')
  const edit = { hook_event_name: 'PostToolUse', tool_name: 'Edit', session_id: 'shn-tr', cwd: f.project,
    tool_input: { file_path: path.join(f.project, 'hook.sh') } }
  const ran = f.run('default', 'post-edit-check.sh', edit, { env: { STUB_MODE: 'silent', QUALITY_HARNESS_TRACE_FILE: trace,
    QUALITY_HARNESS_TRACE_UNTIL: String(Date.now() + 120_000), QUALITY_HARNESS_TRACE_TRIAL: 'shell-hook-native' } })
  assert.equal(ran.status, 0, ran.stderr.toString('utf8'))
  const rows = existsSync(trace) ? readFileSync(trace, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line)) : []
  const phases = rows.map(row => row.phase)
  assert.ok(phases.includes('attempt') && phases.includes('started'), `the bash child was traced: ${JSON.stringify(phases)}`)
  assert.ok(rows.every(row => row.schema === 'quality-harness-process-trace-v1'), JSON.stringify(rows))
})
