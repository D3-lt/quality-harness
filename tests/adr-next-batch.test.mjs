// `adr-next --batch` answers a list of task directories in one process (ADR-145). A process per directory is the oracle:
// the batch may only make an answer arrive sooner. The first attempt at this compared healthy runs only and was refused on
// what a healthy run cannot show, so these also ask in another order, ask twice, fail git for one query, hang it for
// another, raise inside a query, and warn from a parse a cache could have skipped.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test, { after, before } from 'node:test'
import { fileURLToPath } from 'node:url'
import { spawnGate } from '../plugin/scripts/ready-lines.mjs'
import { pythonArgv } from '../scripts/python-interpreter.mjs'
import { remove } from './helpers/remove.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const gate = join(repoRoot, 'plugin', 'bin', 'adr-next')
const recordSource = join(repoRoot, 'plugin', 'lib', 'record.py')
const [python, ...prefix] = pythonArgv()

// The fixture corpora, copied into a repository this test made: adr-next asks git about the directory it is given, and a
// test only starts git where it created the repository (CLAUDE.md §9).
let scratch = null
let corpora = null
let options = null
let goTasks = null
before(() => {
  scratch = mkdtempSync(join(tmpdir(), 'qh-adr-next-batch-'))
  corpora = join(scratch, 'corpora')
  options = { cwd: scratch, encoding: 'utf8', timeout: 120_000, windowsHide: true }
  cpSync(join(repoRoot, 'tests', 'fixtures', 'corpora'), corpora, { recursive: true })
  goTasks = join(corpora, 'go-module', 'docs', 'adr', 'ADR-001-cart-totals-are-integer-cents', 'tasks')
  // Apart from the corpora, so the oracle test's walk does not meet them: a record whose second task declares an id
  // Python refuses to turn into an integer, and a directory named with a letter outside ASCII.
  for (const name of ['oversized', 'émigré']) cpSync(dirname(goTasks), join(scratch, name, 'ADR-001-cart-totals-are-integer-cents'), { recursive: true })
  const first = readFileSync(join(goTasks, 'T1-add-items.md'), 'utf8')
  writeFileSync(join(scratch, 'oversized', 'ADR-001-cart-totals-are-integer-cents', 'tasks', 'T9-big.md'), first.replace(/T\d+/, `T${'9'.repeat(4301)}`))
  // And one whose finished task carries a sha as wide as SHA-256: it fits only while git cannot say the repository is
  // SHA-1, so what git answers about the object format decides whether that task is done.
  const wide = join(scratch, 'wide-sha', 'ADR-001-cart-totals-are-integer-cents')
  cpSync(dirname(goTasks), wide, { recursive: true })
  writeFileSync(join(wide, 'tasks', 'T1-add-items.md'), first.replace(' · no-git · ', ` · ${'a'.repeat(64)} · `))
  mkdirSync(join(scratch, 'empty'))
  const git = (...args) => spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'core.autocrlf=false', ...args], options)
  git('init', '-q')
  git('add', '-A')
  assert.equal(git('commit', '-qm', 'corpora').status, 0)
})
after(() => remove(scratch))

// Every `tasks` directory of every fixture corpus, the broken ones included (a UTF-16 task, an id two files declare,
// an Ansible `tasks/` that is no record's): adr-next answers 0, 1 and 3 across them.
function taskDirectories(directory = corpora) {
  const found = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const here = join(directory, entry.name)
    if (entry.name === 'tasks') found.push(here)
    found.push(...taskDirectories(here))
  }
  return found.sort()
}

// What the process wrote, with the line ends its platform's text mode added taken back out: a frame carries the text.
const text = value => (value ?? '').replace(/\r\n/g, '\n')
const single = (dir, env = process.env) => {
  const run = spawnGate(gate, [dir, '--json'], { ...options, env })
  return { status: run.status, stdout: text(run.stdout), stderr: text(run.stderr) }
}
const frames = run => (run.stdout ?? '').split('\n').filter(Boolean).map(line => JSON.parse(line))
const batch = (dirs, more = {}) => spawnGate(gate, ['--batch'], { ...options, input: JSON.stringify(dirs), ...more })
const answerOf = frame => ({ status: frame.status, stdout: frame.stdout, stderr: frame.stderr })

test('a batch answers each directory as its own process does', () => {
  const dirs = taskDirectories()
  assert.ok(dirs.length > 10, 'the fixture corpora hold task directories')
  const alone = new Map(dirs.map(dir => [dir, single(dir)]))
  assert.deepEqual([...new Set([...alone.values()].map(run => run.status))].sort(), [0, 1, 3], 'ready, refused and nothing-ready are all asked')
  for (const [name, order] of [['in order', dirs], ['reversed', [...dirs].reverse()], ['twice', [...dirs, ...dirs]]]) {
    const run = batch(order)
    assert.equal(run.status, 0, `${name}: ${run.stderr}`)
    assert.equal(run.stderr, '', `${name}: nothing is written outside the frames`)
    const answers = frames(run)
    assert.equal(answers.length, order.length, `${name}: every query answered`)
    answers.forEach((frame, i) => {
      assert.deepEqual([frame.i, frame.dir, frame.warned], [i, order[i], false], `${name}: ${order[i]}`)
      assert.deepEqual(answerOf(frame), alone.get(order[i]), `${name}: ${order[i]}`)
    })
  }
})

// Runs a Python program with `subprocess.run` watched: `git rev-parse --show-object-format` is counted, and failed for
// the first ask (`first`) or every ask (`all`); a child whose arguments name QH_TEST_HANG never returns; and what was
// still unread on standard input when the first child started is measured. The counts go to stderr last.
const watching = [
  'import atexit, os, runpy, subprocess, sys, time',
  'real, asked, left = subprocess.run, [], []',
  'fail, hang = os.environ.get("QH_TEST_FAIL_FORMAT", ""), os.environ.get("QH_TEST_HANG", "")',
  'def run(argv, *args, **kwargs):',
  '    if not left:',
  '        left.append(len(sys.stdin.buffer.read()))',
  '    if hang and any(hang in str(part) for part in argv):',
  '        time.sleep(600)',
  '    if "--show-object-format" in argv:',
  '        asked.append(1)',
  '        if fail == "all" or (fail == "first" and len(asked) == 1):',
  '            return subprocess.CompletedProcess(argv, 128, "", "")',
  '    return real(argv, *args, **kwargs)',
  'subprocess.run = run',
  'atexit.register(lambda: sys.__stderr__.write(f"\\nformat asked: {len(asked)} unread: {left[0] if left else -1}\\n"))',
  'sys.argv = sys.argv[1:]',
  'runpy.run_path(sys.argv[0], run_name="__main__")',
].join('\n')

function watched(args, { fail = '', hang = '', input, timeout = 120_000 } = {}) {
  const run = spawnSync(python, [...prefix, '-B', '-c', watching, gate, ...args],
    { ...options, timeout, input, env: { ...process.env, QH_TEST_FAIL_FORMAT: fail, QH_TEST_HANG: hang } })
  const counts = text(run.stderr).match(/\nformat asked: (\d+) unread: (-?\d+)\n$/)
  return { run, status: run.status, stdout: text(run.stdout), asked: counts && Number(counts[1]), unread: counts && Number(counts[2]) }
}

test('a failed object-format lookup stays inside its query', () => {
  const wide = join(scratch, 'wide-sha', 'ADR-001-cart-totals-are-integer-cents', 'tasks')
  const args = [wide, '--json']
  const works = watched(args)
  const fails = watched(args, { fail: 'all' })
  assert.equal(works.asked, 1, 'this directory makes adr-next ask, so the count below means something')
  assert.notEqual(fails.stdout, works.stdout, 'and what git answers changes what adr-next says')
  const run = watched(['--batch'], { fail: 'first', input: JSON.stringify([wide, wide, wide]) })
  assert.equal(run.status, 0)
  assert.equal(run.asked, 3, 'three queries, three questions: one process per directory asked three times')
  assert.deepEqual(frames(run).map(frame => [frame.status, frame.stdout]),
    [[fails.status, fails.stdout], [works.status, works.stdout], [works.status, works.stdout]],
    'the query git failed for answers as a process git failed for; the next two as one it answered')
})

// The gate loaded as a module, its `main` replaced, and its batch entered as `adr-next --batch` enters it. Query two
// ends the way QH_TEST_HOW names; with `warn` every query parses a Python source whose parse warns, through the cached
// reader a test lock uses. How often the parser really ran goes to stderr last.
const standIn = [
  'import ast, os, sys, types',
  'gate, how = sys.argv[1], os.environ["QH_TEST_HOW"]',
  'module = types.ModuleType("adr_next_under_test")',
  'module.__file__ = gate',
  'with open(gate, "rb") as source:',
  '    exec(compile(source.read(), gate, "exec"), module.__dict__)',
  'real, parsed, seen = ast.parse, [], []',
  'def parse(*args, **kwargs):',
  '    parsed.append(1)',
  '    return real(*args, **kwargs)',
  'ast.parse = parse',
  'def main():',
  '    seen.append(1)',
  '    print(f"said {len(seen)} {sys.argv[1:]}")',
  '    print(f"err {len(seen)}", file=sys.stderr)',
  '    if how == "warn":',
  '        sys.modules["record"]._python_functions("def test_a():\\n    return \\"\\\\d\\"\\n")',
  '    if len(seen) == 2:',
  '        if how == "exit1": sys.exit(1)',
  '        if how == "exitnone": sys.exit()',
  '        if how == "text": sys.exit("a message")',
  '        if how == "true": sys.exit(True)',
  '        if how == "boom": raise RuntimeError("boom")',
  '    return 3',
  'if how == "latin":',
  '    sys.getfilesystemencoding = lambda: "latin-1"',
  'module.main = main',
  'sys.argv = [gate, "--batch"]',
  'code = module.entry()',
  'sys.stderr.write(f"\\nparsed: {len(parsed)} argv: {sys.argv[1:]} stdout: {sys.stdout is sys.__stdout__}\\n")',
  'sys.exit(code)',
].join('\n')

function stoodIn(how, dirs = ['a', 'b', 'c']) {
  const run = spawnSync(python, [...prefix, '-B', '-c', standIn, gate], { ...options, input: JSON.stringify(dirs), env: { ...process.env, QH_TEST_HOW: how } })
  // Written through `sys.stderr` and reading `sys.argv` after the batch returned: both are the process's own again.
  const parsed = text(run.stderr).match(/\nparsed: (\d+) argv: \['--batch'\] stdout: True\n$/)
  assert.ok(parsed, `the streams and the arguments are put back when the batch ends: ${run.stderr}`)
  return { status: run.status, parsed: Number(parsed[1]), frames: frames(run) }
}

test('a status that is not an answer still gets its frame', () => {
  const missing = join(scratch, 'no-such-directory')
  const run = batch([goTasks, missing, goTasks])
  assert.equal(run.status, 0, run.stderr)
  const answers = frames(run)
  assert.deepEqual(answers.map(frame => frame.status), [0, 1, 0])
  assert.deepEqual(answerOf(answers[1]), single(missing), 'the refusal is the single call\'s, words included')
  assert.deepEqual(answerOf(answers[2]), single(goTasks), 'and the query after it is answered as if nothing had happened')
  for (const [how, status] of [['exit1', 1], ['exitnone', 0]]) {
    const exited = stoodIn(how)
    assert.equal(exited.status, 0, how)
    assert.deepEqual(exited.frames.map(frame => [frame.i, frame.dir, frame.status, frame.stdout, frame.stderr]), [
      [0, 'a', 3, "said 1 ['a', '--json']\n", 'err 1\n'],
      [1, 'b', status, "said 2 ['b', '--json']\n", 'err 2\n'],
      [2, 'c', 3, "said 3 ['c', '--json']\n", 'err 3\n'],
    ], `${how}: an exit with an integer, or with nothing, is that query's status, and each query has its own streams and arguments`)
  }
})

test('an abnormal end inside a query ends the batch', t => {
  const big = join(scratch, 'oversized', 'ADR-001-cart-totals-are-integer-cents', 'tasks')
  const alone = single(big)
  if (alone.status === 1 && /ValueError/.test(alone.stderr)) {
    const run = batch([goTasks, big, goTasks])
    assert.equal(run.status, 1, 'the batch says it did not answer everything')
    assert.deepEqual(frames(run).map(frame => [frame.i, frame.status]), [[0, 0]], 'the query that raised has no frame, and none follows it')
  } else {
    t.diagnostic('this Python turns a 4,301-digit id into an integer, so the real gate does not raise here; the stand-in below still does')
  }
  for (const how of ['boom', 'text', 'true']) {
    const ended = stoodIn(how)
    assert.equal(ended.status, 1, how)
    assert.deepEqual(ended.frames.map(frame => [frame.i, frame.status]), [[0, 3]], `${how}: the batch ends before it`)
  }
})

test('a cached parse does not hide a later query\'s warnings', () => {
  const warned = stoodIn('warn', ['a', 'b'])
  assert.equal(warned.status, 0)
  assert.equal(warned.parsed, 2, 'each query parsed the source itself: nothing was answered from the query before')
  assert.deepEqual(warned.frames.map(frame => [frame.warned, frame.stderr]), [[true, 'err 1\n'], [true, 'err 2\n']],
    'both queries say a warning was raised, and it is kept out of what they printed')
  assert.deepEqual(stoodIn('exit1', ['a', 'b']).frames.map(frame => frame.warned), [false, false], 'a query that raised none says so')
})

test('a frame is written when its query ends', () => {
  const second = join(corpora, 'js-vitest-spa')
  const hung = watched(['--batch'], { hang: 'js-vitest-spa', timeout: 15_000, input: JSON.stringify([goTasks, taskDirectories(second)[0], goTasks]) })
  assert.equal(hung.run.error?.code, 'ETIMEDOUT', 'the second query never ends, and the test\'s own limit kills the batch')
  assert.deepEqual(frames(hung.run).map(frame => [frame.i, frame.status]), [[0, 0]], 'the first answer had already left the process')
})

test('no child of a query reads the batch\'s input', () => {
  const run = watched(['--batch'], { input: JSON.stringify([goTasks, goTasks]) })
  assert.equal(run.status, 0)
  assert.equal(run.unread, 0, 'when the first child started, standard input had been read to its end')
  assert.equal(frames(run).length, 2)
})

test('a directory name survives the transport or is refused', () => {
  const named = join(scratch, 'émigré', 'ADR-001-cart-totals-are-integer-cents', 'tasks')
  const latin = { ...process.env, PYTHONIOENCODING: 'latin-1' }
  const alone = single(named, latin)
  assert.equal(alone.status, 0, alone.stderr)
  const run = batch([named], { env: latin })
  assert.equal(run.status, 0, run.stderr)
  const [frame] = frames(run)
  assert.equal(frame.dir, named)
  assert.deepEqual(JSON.parse(frame.stdout), JSON.parse(alone.stdout), 'the directory is found whatever encoding the environment names')
  const broken = spawnGate(gate, ['--batch'], { ...options, encoding: 'buffer', input: Buffer.from([0x5b, 0x22, 0xff, 0x22, 0x5d]) })
  assert.equal(broken.status, 1)
  assert.equal(broken.stdout.length, 0, 'input that is not UTF-8 is refused before any query')
  // A process of its own decodes its argument by the filesystem encoding. Where that is not UTF-8 a name outside ASCII
  // may be another path there, so the batch does not answer it: it ends, and that directory is asked singly.
  const narrow = stoodIn('latin', ['a', 'é', 'c'])
  assert.deepEqual([narrow.status, narrow.frames.map(frame => frame.dir)], [1, ['a']], 'the batch ends at the name it cannot vouch for')
  assert.deepEqual(stoodIn('latin', ['a', 'b', 'c']).frames.length, 3, 'names within ASCII are the same path under any encoding')
  assert.deepEqual(stoodIn('exit1', ['a', 'é', 'c']).frames.length, 3, 'and under UTF-8 every name is')
})

test('a batch takes no other argument and only a list of strings', () => {
  for (const args of [['--batch', goTasks], ['--batch', '--json'], ['--batch', '--help'], [goTasks, '--batch']]) {
    const run = spawnGate(gate, args, { ...options, input: '[]' })
    assert.deepEqual([run.status, run.stdout], [1, ''], args.join(' '))
    assert.match(run.stderr, /--batch takes no other argument/, args.join(' '))
  }
  for (const input of ['{}', '[1]', '["a", null]', 'not json', '']) {
    const run = batch([], { input })
    assert.deepEqual([run.status, run.stdout], [1, ''], JSON.stringify(input))
    assert.match(run.stderr, /a JSON array of directory strings/, JSON.stringify(input))
  }
  const none = batch([])
  assert.deepEqual([none.status, none.stdout, none.stderr], [0, '', ''], 'an empty list is answered with no frame')
  const version = spawnGate(gate, ['--batch', '--version'], { ...options, input: '[]' })
  assert.equal(version.status, 0)
  assert.match(version.stdout, /^adr-next /, '--version wins, as it does beside every other argument')
  const help = spawnGate(gate, ['--help'], options)
  assert.match(help.stdout, /--batch/, 'the usage text names the mode')
})

// The shared-state audit ADR-145 rests on, as a check: reviewed 2026-11-24. A cached function or a `global` statement
// added to either file later is a new way for one query to reach the next, and has to be looked at before it ships.
const REVIEWED_CACHES = ['_file_lock_digests', '_js_lex', '_js_like_code_positions', '_mask_lock_noncode', '_object_format',
  '_python_functions', '_scan', 'record_status', 'status_labels', 'status_section']
const cachedIn = source => [...source.matchAll(/^@(?:functools\.)?(?:lru_cache|cache)\b.*\n(?:@.*\n)*def (\w+)/gm)].map(match => match[1]).sort()
const globalsIn = source => source.split('\n').filter(line => /^\s+global\s/.test(line))
const unreviewed = (found, reviewed) => found.filter(name => !reviewed.includes(name))

test('nothing but the reviewed caches is shared between queries', () => {
  const record = readFileSync(recordSource, 'utf8')
  const next = readFileSync(gate, 'utf8')
  const found = cachedIn(record)
  assert.deepEqual(found, REVIEWED_CACHES, 'record.py caches exactly the functions that were reviewed')
  assert.deepEqual(unreviewed(found, REVIEWED_CACHES.filter(name => name !== '_js_lex')), ['_js_lex'], 'and a cache outside the list is named')
  assert.deepEqual(cachedIn(next), [], 'adr-next caches nothing of its own')
  assert.deepEqual([...globalsIn(record), ...globalsIn(next)], [], 'neither file assigns a module global from a function')
  assert.deepEqual(globalsIn('def f():\n    global seen\n    seen = 1\n'), ['    global seen'], 'and such a statement would be found')
  // Every one of them is what the loop clears: the gate lists its own caches, from the module it loaded.
  const listed = spawnSync(python, [...prefix, '-B', '-c', [
    'import sys, types',
    'module = types.ModuleType("adr_next_under_test")',
    'module.__file__ = sys.argv[1]',
    'with open(sys.argv[1], "rb") as source:',
    '    exec(compile(source.read(), sys.argv[1], "exec"), module.__dict__)',
    'print(" ".join(sorted(cache.__name__ for cache in module.record_caches())))',
  ].join('\n'), gate], options)
  assert.equal(listed.status, 0, listed.stderr)
  assert.deepEqual(listed.stdout.trim().split(' '), REVIEWED_CACHES)
})
