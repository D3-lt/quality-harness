// The per-task checks of adr-lint on N forked processes (QH_LINT_JOBS). Measured on a 258-task record: one core, and about
// 93% of the time per task. The pool may only make a run faster: what it says, in what order, with which exit code, is the
// serial run's byte for byte. LintPool is driven directly with bodies that use every channel (block, advice, protected,
// unproven, demotion, prints, a refusal that exits, the two kinds of cross-task state, a LockMove), then the gate on a
// generated corpus: findings in the pooled checks, and a refusal that a child could otherwise wait past forever.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { pythonArgv } from '../scripts/python-interpreter.mjs'
import { remove } from './helpers/remove.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const lint = join(repoRoot, 'plugin', 'bin', 'adr-lint')
const [python, ...prefix] = pythonArgv()
const UTF8 = { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' }
const forks = process.platform === 'linux' ? false : 'the pool forks on Linux only'

const load = String.raw`
import importlib.machinery, importlib.util, io, json, os, sys
from contextlib import redirect_stderr, redirect_stdout
loader = importlib.machinery.SourceFileLoader("adr_lint_pool_probe", sys.argv[1])
m = importlib.util.module_from_spec(importlib.util.spec_from_loader(loader.name, loader))
sys.modules[loader.name] = m  # pickle finds the child's entry point by this name
loader.exec_module(m)
`

const probe = load + String.raw`
LockMove = sys.modules["record"].LockMove

def said(tid, errors):
    errors.append(f"{tid}: block", evidence=tid % 2 == 0)
    errors.advise(f"{tid}: advice")
    with errors.protected():
        errors.append(f"{tid}: protected")
    errors.unprove(f"{tid}: unproven")
    errors.append(f"{tid}: demotion read in the body is {errors.demotion}", evidence=True)
    print(f"out {tid}")
    print(f"err {tid}", file=sys.stderr)
    return [tid, os.getpid()]

def outside(tid, errors, reported_outside):
    for rel in ("../a", "../b" if tid % 2 else "../a", f"../{tid % 3}"):
        if rel not in reported_outside:
            reported_outside.add(rel)
            errors.advise(f"{tid}: outside {rel}")

def moved(tid, errors, moves):
    move = LockMove(f"L{tid}: ", f"moved {tid % 2}", ("from", f"to {tid % 2}"))
    moves.setdefault(move.body, []).append((f"L{tid}", move))

def stop(tid, errors):
    if tid == 7:
        print(f"refused {tid}", file=sys.stderr)
        sys.exit(2)
    errors.append(f"{tid}: before the refusal")

def once(jobs, tasks=12, stopping=False, demotion=None):
    errors = m.Findings()
    errors.demotion = demotion
    shared = {"seen": set(), "moves": {}}
    def plan(run):
        values = [run(said, t, errors=errors) for t in range(tasks)]
        for t in range(tasks):
            run(outside, t, errors=errors, reported_outside=shared["seen"])
        for t in range(tasks):
            run(moved, t, errors=errors, moves=shared["moves"])
        for t in range(tasks if stopping else 0):
            run(stop, t, errors=errors)
        return values
    pool = m.LintPool(jobs, [plan]) if jobs > 1 else None
    out, err, code, values = io.StringIO(), io.StringIO(), None, None
    with redirect_stdout(out), redirect_stderr(err):
        try:
            values = plan(pool.replay if pool else m.run_task)
        except SystemExit as exc:
            code = exc.code
    if pool and code is None:
        pool.close()
    moves = {body: [[label, str(msg), type(msg).__name__, list(msg.pair)] for label, msg in tasks]
             for body, tasks in shared["moves"].items()}
    return {"said": [list(errors), errors.advice, errors.unproven, out.getvalue(), err.getvalue(), code, moves,
                     sorted(shared["seen"])],
            "pids": sorted({pid for _tid, pid in values or []})}

print(json.dumps({"me": os.getpid(), "serial": once(1), "pooled": once(4),
                  "serial_small": once(1, tasks=1), "pooled_small": once(4, tasks=1),
                  "serial_demoted": once(1, demotion="old"), "pooled_demoted": once(4, demotion="old"),
                  "serial_stop": once(1, stopping=True), "pooled_stop": once(4, stopping=True)}))
`

test('LintPool says what the serial run says, in its order, from other processes', { skip: forks }, () => {
  const run = spawnSync(python, [...prefix, '-c', probe, lint], { encoding: 'utf8', timeout: 120_000, env: UTF8 })
  assert.equal(run.status, 0, run.stderr)
  const got = JSON.parse(run.stdout)
  assert.deepEqual(got.pooled.said, got.serial.said, 'findings, advice, unproven, prints and shared state as the serial run')
  assert.deepEqual(got.pooled_demoted.said, got.serial_demoted.said, 'strictFrom demotion as the serial run, read in the body too')
  assert.deepEqual(got.pooled_stop.said, got.serial_stop.said, 'a refusal stops the pooled run where it stops the serial one')
  assert.deepEqual(got.pooled_small.said, got.serial_small.said)
  assert.deepEqual(got.pooled_small.pids, [got.me], 'too little work for two processes runs here')
  assert.deepEqual(got.serial.pids, [got.me], 'the serial path runs here')
  assert.ok(!got.pooled.pids.includes(got.me), `the pooled bodies ran in children: ${got.pooled.pids}`)
  const [blocks, advice, , out, err, code, moves, seen] = got.serial.said
  assert.equal(advice.filter(a => a.endsWith('outside ../a')).length, 1, 'a path outside the tree is said once across tasks')
  assert.deepEqual(seen, ['../0', '../1', '../2', '../a', '../b'])
  assert.deepEqual(moves['moved 1'].map(([label]) => label), ['L1', 'L3', 'L5', 'L7', 'L9', 'L11'], 'moves merged in task order')
  assert.deepEqual(got.pooled.said[6]['moved 1'][0], ['L1', 'L1: moved 1', 'LockMove', ['from', 'to 1']], 'a LockMove crosses whole')
  assert.ok(got.pooled_demoted.said[0].includes('3: demotion read in the body is old'))
  assert.equal(blocks[0], '0: block')
  assert.equal(out.split('\n')[11], 'out 11')
  assert.equal(err.split('\n')[0], 'err 0')
  assert.equal(code, null)
  const stopped = got.serial_stop.said
  assert.equal(stopped[5], 2, 'the refusal exit code')
  assert.ok(stopped[0].includes('6: before the refusal') && !stopped[0].includes('8: before the refusal'))
  assert.ok(stopped[4].endsWith('refused 7\n'))
})

test('QH_LINT_JOBS, else the usable CPUs up to 16; 1 off Linux or for anything but a positive whole number', () => {
  const run = spawnSync(python, [...prefix, '-c', load + String.raw`
print(json.dumps([m.lint_jobs(environ=env, platform=plat, cpus=cpus) for env, plat, cpus in [
    ({"QH_LINT_JOBS": "4"}, "linux", 64), ({"QH_LINT_JOBS": " 32 "}, "linux", 8),
    ({"QH_LINT_JOBS": "0"}, "linux", 64), ({"QH_LINT_JOBS": "x"}, "linux", 64),
    ({"QH_LINT_JOBS": "²"}, "linux", 64), ({"QH_LINT_JOBS": "-3"}, "linux", 64),
    ({}, "linux", 64), ({}, "linux", 3), ({"QH_LINT_JOBS": "8"}, "darwin", 64), ({}, "win32", 64)]]))
`, lint], { encoding: 'utf8', timeout: 60_000, env: UTF8 })
  assert.equal(run.status, 0, run.stderr)
  assert.deepEqual(JSON.parse(run.stdout), [4, 32, 1, 1, 1, 1, 16, 3, 1, 1])
})

// Twelve done tasks, each naming a missing test, a path outside the repository and a test that asserts nothing. With
// `fifo`, T1 also names a FIFO, which check_tests_exist refuses (exit 2) and check_tests_can_fail, which the serial run
// never reaches after the refusal, would open and wait on.
function corpus(t, { fifo = false } = {}) {
  const scratch = mkdtempSync(join(tmpdir(), 'qh-lint-pool-'))
  t.after(() => remove(scratch))
  const adr = join(scratch, 'docs', 'adr')
  const tasks = join(adr, 'ADR-001-totals', 'tasks')
  mkdirSync(tasks, { recursive: true })
  copyFileSync(join(repoRoot, 'tests', 'fixtures', 'corpora', 'duplicate-ids', 'docs', 'adr', 'ADR-001-totals.md'), join(adr, 'ADR-001-totals.md'))
  writeFileSync(join(scratch, 'dead_test.go'), Array.from({ length: 12 }, (_, i) => `func TestDead${i + 1}(t *testing.T) {}\n`).join(''))
  if (fifo) {
    // Ignored, so no listing of the repository opens it before the checks do.
    writeFileSync(join(scratch, '.gitignore'), 'fifo/\n')
    mkdirSync(join(scratch, 'fifo'))
    assert.equal(spawnSync('mkfifo', [join(scratch, 'fifo', 'fifo_test.go')]).status, 0)
  }
  const rows = []
  for (let n = 1; n <= 12; n++) {
    rows.push(`| T${n} | task ${n} | done |`)
    writeFileSync(join(tasks, `T${n}-task.md`), `# Task ADR-001-T${n}: task ${n}\n\n**Depends-on:** none\n\n## Goal\n\nx\n\n` +
      '## Acceptance\n\n```bash\ntest -f dead_test.go\n```\n\n## Tests\n\n| Test name | File | Verifies | Covers | Steps |\n' +
      '|-----------|------|----------|--------|-------|\n' +
      (fifo && n === 1 ? '| `TestFifo` | `fifo/fifo_test.go` | x | — | — |\n' : '') +
      `| \`TestMissing${n}\` | \`missing_${n}_test.go\` | x | — | — |\n| \`TestOut\` | \`../outside/shared_test.go\` | x | — | — |\n` +
      `| \`TestDead${n}\` | \`dead_test.go\` | x | — | — |\n\n## Verification Log\n\n- 2026-11-01 · exit 1 · \`test -f dead_test.go\`\n`)
  }
  writeFileSync(join(tasks, 'README.md'), `# Tasks\n\n| ID | Title | Status |\n|----|-------|--------|\n${rows.join('\n')}\n`)
  const git = (...args) => spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd: scratch, encoding: 'utf8' })
  git('init', '-q')
  git('add', '-A')
  git('commit', '-qm', 'corpus')
  return { scratch, record: join(adr, 'ADR-001-totals.md') }
}

// The gate runs as a program (runpy, as `__main__`), with every process pool it starts counted, so a run that quietly
// stayed serial cannot pass for a pooled one. The count goes to stderr last; `said` is stderr without it.
const counted = [
  'import atexit, concurrent.futures as cf, os, runpy, sys',
  'started = []',
  'class Counted(cf.ProcessPoolExecutor):',
  '    def __init__(self, *args, **kwargs):',
  '        started.append(kwargs.get("max_workers"))',
  '        super().__init__(*args, **kwargs)',
  'cf.ProcessPoolExecutor = Counted',
  'atexit.register(lambda: sys.__stderr__.write(f"\\npools started: {len(started)}\\n"))',
  'sys.argv = sys.argv[1:]',
  'runpy.run_path(sys.argv[0], run_name="__main__")',
].join('\n')

function at({ scratch, record }, jobs) {
  const run = spawnSync(python, [...prefix, '-c', counted, lint, record],
    { cwd: scratch, encoding: 'utf8', timeout: 60_000, killSignal: 'SIGKILL', env: { ...UTF8, QH_LINT_JOBS: String(jobs) } })
  const pools = run.stderr?.match(/\npools started: (\d+)\n$/)
  return { ...run, said: pools ? run.stderr.slice(0, pools.index) : run.stderr, pools: pools ? Number(pools[1]) : null }
}

test('adr-lint at QH_LINT_JOBS=4 prints and exits exactly as at 1, on findings of check_task and every pooled evidence check', { skip: forks }, t => {
  const made = corpus(t)
  const serial = at(made, 1)
  const pooled = at(made, 4)
  assert.equal(serial.pools, 0, 'QH_LINT_JOBS=1 starts no pool')
  assert.equal(pooled.pools, 2, 'QH_LINT_JOBS=4 runs check_task and the evidence checks on a pool each')
  assert.equal(serial.status, 1, serial.stdout + serial.stderr)
  for (const n of [1, 12]) {
    assert.match(serial.stdout, new RegExp(`T${n}-task\\.md: missing section ## Risks`), `T${n}'s check_task advice`)
    assert.match(serial.stdout, new RegExp(`T${n}-task\\.md.*TestMissing${n}`), `T${n}'s missing test is found`)
    assert.match(serial.stdout, new RegExp(`T${n}.*marked done but its Verification Log has no exit-0 entry`), `T${n}'s verification`)
    assert.match(serial.stdout, new RegExp(`T${n} is marked done and names \`TestDead${n}\`, and its body calls nothing`), `T${n}'s dead test`)
  }
  assert.match(serial.stdout, /T1-task\.md: T1, T2-task\.md: T2.*: marked done but has no first-red test-lock-sha256/, 'the test lock, grouped')
  assert.equal(serial.stdout.split('points OUTSIDE this repository').length, 2, 'the outside path is said once')
  assert.equal(pooled.stdout, serial.stdout)
  assert.equal(pooled.said, serial.said)
  assert.equal(pooled.status, serial.status)
})

test('a refusal in a pooled check stops the run as the serial run stops, with no child left waiting on a FIFO', { skip: forks }, t => {
  const made = corpus(t, { fifo: true })
  const serial = at(made, 1)
  assert.equal(serial.status, 2, serial.stdout + serial.stderr)
  assert.match(serial.said, /could not run: .*fifo_test\.go/)
  const pooled = at(made, 4)
  assert.equal(pooled.signal, null, 'the pooled run ended by itself, it was not killed at the timeout')
  assert.equal(pooled.pools, 2)
  assert.equal(pooled.status, serial.status)
  assert.equal(pooled.stdout, serial.stdout)
  assert.equal(pooled.said, serial.said)
})
