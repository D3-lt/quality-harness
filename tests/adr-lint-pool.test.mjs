// The per-task checks of adr-lint on N forked processes (QH_LINT_JOBS). Measured on a 258-task record: one core, and about
// 93% of the time per task. The pool may only make a run faster: what it says, in what order, with which exit code, is the
// serial run's byte for byte. LintPool is driven directly with bodies that use every channel (block, advice, protected,
// unproven, prints, a refusal that exits, the two kinds of cross-task state), then the gate on a corpus with findings in
// every pooled check.
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
const linux = process.platform === 'linux'

const probe = String.raw`
import importlib.machinery, importlib.util, io, json, os, sys
from contextlib import redirect_stderr, redirect_stdout
loader = importlib.machinery.SourceFileLoader("adr_lint_pool_probe", sys.argv[1])
m = importlib.util.module_from_spec(importlib.util.spec_from_loader(loader.name, loader))
sys.modules[loader.name] = m  # pickle finds the child's entry point by this name
loader.exec_module(m)

def said(tid, errors):
    errors.append(f"{tid}: block", evidence=tid % 2 == 0)
    errors.advise(f"{tid}: advice")
    with errors.protected():
        errors.append(f"{tid}: protected")
    errors.unprove(f"{tid}: unproven")
    print(f"out {tid}")
    print(f"err {tid}", file=sys.stderr)
    return [tid, os.getpid()]

def outside(tid, errors, reported_outside):
    for rel in ("../a", "../b" if tid % 2 else "../a", f"../{tid % 3}"):
        if rel not in reported_outside:
            reported_outside.add(rel)
            errors.advise(f"{tid}: outside {rel}")

def moved(tid, errors, moves):
    moves.setdefault("odd" if tid % 2 else f"even{tid}", []).append([f"L{tid}", f"m{tid}"])

def stop(tid, errors):
    if tid == 7:
        print(f"refused {tid}", file=sys.stderr)
        sys.exit(2)
    errors.append(f"{tid}: before the refusal")

def once(jobs, stopping=False, demotion=None):
    errors = m.Findings()
    errors.demotion = demotion
    shared = {"seen": set(), "moves": {}}
    def plan(run):
        values = [run(said, t, errors=errors) for t in range(12)]
        for t in range(12):
            run(outside, t, errors=errors, reported_outside=shared["seen"])
        for t in range(12):
            run(moved, t, errors=errors, moves=shared["moves"])
        for t in range(12 if stopping else 0):
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
    return {"said": [list(errors), errors.advice, errors.unproven, out.getvalue(), err.getvalue(), code,
                     shared["moves"], sorted(shared["seen"])],
            "pids": sorted({pid for _tid, pid in values or []})}

print(json.dumps({"me": os.getpid(), "serial": once(1), "pooled": once(4),
                  "serial_demoted": once(1, demotion="old"), "pooled_demoted": once(4, demotion="old"),
                  "serial_stop": once(1, stopping=True), "pooled_stop": once(4, stopping=True),
                  "jobs": [m.lint_jobs(environ=env, platform=plat, cpus=cpus) for env, plat, cpus in [
                      ({"QH_LINT_JOBS": "4"}, "linux", 64), ({"QH_LINT_JOBS": " 32 "}, "linux", 8),
                      ({"QH_LINT_JOBS": "0"}, "linux", 64), ({"QH_LINT_JOBS": "x"}, "linux", 64),
                      ({"QH_LINT_JOBS": "²"}, "linux", 64), ({"QH_LINT_JOBS": "-3"}, "linux", 64),
                      ({}, "linux", 64), ({}, "linux", 3), ({"QH_LINT_JOBS": "8"}, "darwin", 64), ({}, "win32", 64)]]}))
`

test('LintPool says what the serial run says, in its order, from other processes', { skip: !linux && 'the pool forks on Linux only' }, () => {
  const run = spawnSync(python, [...prefix, '-c', probe, lint], { encoding: 'utf8', timeout: 120_000, env: UTF8 })
  assert.equal(run.status, 0, run.stderr)
  const got = JSON.parse(run.stdout)
  assert.deepEqual(got.pooled.said, got.serial.said, 'findings, advice, unproven, prints and shared state as the serial run')
  assert.deepEqual(got.pooled_demoted.said, got.serial_demoted.said, 'strictFrom demotion as the serial run')
  assert.deepEqual(got.pooled_stop.said, got.serial_stop.said, 'a refusal stops the pooled run where it stops the serial one')
  assert.deepEqual(got.serial.pids, [got.me], 'the serial path runs here')
  assert.ok(got.pooled.pids.length > 1 && !got.pooled.pids.includes(got.me), `the pooled bodies ran in children: ${got.pooled.pids}`)
  const [blocks, advice, , out, err, code, moves, seen] = got.serial.said
  assert.equal(advice.filter(a => a.endsWith('outside ../a')).length, 1, 'a path outside the tree is said once across tasks')
  assert.deepEqual(seen, ['../0', '../1', '../2', '../a', '../b'])
  assert.deepEqual(moves.odd.map(([label]) => label), ['L1', 'L3', 'L5', 'L7', 'L9', 'L11'], 'moves merged in task order')
  assert.equal(blocks[0], '0: block')
  assert.equal(out.split('\n')[11], 'out 11')
  assert.equal(err.split('\n')[0], 'err 0')
  assert.equal(code, null)
  const stopped = got.serial_stop.said
  assert.equal(stopped[5], 2, 'the refusal exit code')
  assert.ok(stopped[0].includes('6: before the refusal') && !stopped[0].includes('8: before the refusal'))
  assert.ok(stopped[4].endsWith('refused 7\n'))
  assert.deepEqual(got.jobs, [4, 32, 1, 1, 1, 1, 16, 3, 1, 1], 'QH_LINT_JOBS, else the CPUs up to 16, 1 off Linux or when not a positive number')
})

test('adr-lint at QH_LINT_JOBS=4 prints and exits exactly as at 1, on findings in every pooled check', t => {
  const scratch = mkdtempSync(join(tmpdir(), 'qh-lint-pool-'))
  t.after(() => remove(scratch))
  const adr = join(scratch, 'docs', 'adr')
  const tasks = join(adr, 'ADR-001-totals', 'tasks')
  mkdirSync(tasks, { recursive: true })
  copyFileSync(join(repoRoot, 'tests', 'fixtures', 'corpora', 'duplicate-ids', 'docs', 'adr', 'ADR-001-totals.md'), join(adr, 'ADR-001-totals.md'))
  writeFileSync(join(scratch, 'dead_test.go'), Array.from({ length: 12 }, (_, i) => `func TestDead${i + 1}(t *testing.T) {}\n`).join(''))
  const rows = []
  for (let n = 1; n <= 12; n++) {
    rows.push(`| T${n} | task ${n} | done |`)
    writeFileSync(join(tasks, `T${n}-task.md`), `# Task ADR-001-T${n}: task ${n}\n\n**Depends-on:** none\n\n## Goal\n\nx\n\n` +
      '## Acceptance\n\n```bash\ntest -f dead_test.go\n```\n\n## Tests\n\n| Test name | File | Verifies | Covers | Steps |\n' +
      '|-----------|------|----------|--------|-------|\n' +
      `| \`TestMissing${n}\` | \`missing_${n}_test.go\` | x | — | — |\n| \`TestOut\` | \`../outside/shared_test.go\` | x | — | — |\n` +
      `| \`TestDead${n}\` | \`dead_test.go\` | x | — | — |\n\n## Verification Log\n\n- 2026-11-01 · exit 1 · \`test -f dead_test.go\`\n`)
  }
  writeFileSync(join(tasks, 'README.md'), `# Tasks\n\n| ID | Title | Status |\n|----|-------|--------|\n${rows.join('\n')}\n`)
  const git = (...args) => spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd: scratch, encoding: 'utf8' })
  git('init', '-q')
  git('add', '-A')
  git('commit', '-qm', 'corpus')
  // The gate runs as a program (runpy, as `__main__`), with every process pool it starts counted, so a run that
  // quietly stayed serial cannot pass for a pooled one.
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
  const at = jobs => spawnSync(python, [...prefix, '-c', counted, lint, join(adr, 'ADR-001-totals.md')],
    { cwd: scratch, encoding: 'utf8', timeout: 120_000, env: { ...UTF8, QH_LINT_JOBS: String(jobs) } })
  const pools = run => [run.stderr.replace(/\npools started: (\d+)\n$/, ''), Number(run.stderr.match(/pools started: (\d+)\n$/)?.[1])]
  const serial = at(1)
  const pooled = at(4)
  assert.equal(pools(serial)[1], 0, 'QH_LINT_JOBS=1 starts no pool')
  assert.equal(pools(pooled)[1], 2, 'QH_LINT_JOBS=4 runs check_task and the evidence checks on a pool each')
  assert.equal(serial.status, 1, serial.stdout + serial.stderr)
  for (const n of [1, 12]) {
    assert.match(serial.stdout, new RegExp(`T${n}-task\\.md.*TestMissing${n}`), `T${n}'s missing test is found`)
    assert.match(serial.stdout, new RegExp(`T${n}.*marked done but its Verification Log has no exit-0 entry`), `T${n}'s verification`)
    assert.match(serial.stdout, new RegExp(`T${n} is marked done and names \`TestDead${n}\`, and its body calls nothing`), `T${n}'s dead test`)
  }
  assert.equal(serial.stdout.split('points OUTSIDE this repository').length, 2, 'the outside path is said once')
  assert.equal(pooled.stdout, serial.stdout)
  assert.equal(pools(pooled)[0], pools(serial)[0])
  assert.equal(pooled.status, serial.status)
})
