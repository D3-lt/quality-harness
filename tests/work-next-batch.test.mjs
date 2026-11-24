// work-next asks adr-next about its task directories in one `--batch` process and takes an answer only well inside the
// single call's limits (ADR-145). A process per directory is the oracle: the batch may only make an answer arrive sooner.
// The parser is driven through `batchedAnswers`' own seam; what happens to a directory the batch did not answer is
// driven through work-next run as a process, from a copied plugin whose gate is replaced, because `readinessFrom` never
// batches through an injected spawn.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test, { after, before } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { spawnGate } from '../plugin/scripts/ready-lines.mjs'
import { batchedAnswers, main, observe, readinessFrom } from '../plugin/scripts/work-next.mjs'
import { remove } from './helpers/remove.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const plugin = join(repoRoot, 'plugin')
const gate = join(plugin, 'bin', 'adr-next')
const counter = pathToFileURL(join(repoRoot, 'tests', 'helpers', 'count-spawns.mjs')).href
const BOUND = 512 * 1024

// The fixture corpora, copied into a repository this test made (CLAUDE.md §9), with two more built from them: `mixed`
// holds two decided and two undecided records with tasks, `pair` one of each.
let scratch = null
let corpora = null
let options = null
function undecidedCopy(root, from, to) {
  const adr = join(root, 'docs', 'adr')
  const rename = text => text.replaceAll(from.slice(0, 7), to.slice(0, 7))
  writeFileSync(join(adr, `${to}.md`), rename(readFileSync(join(adr, `${from}.md`), 'utf8')).replace(/^\*\*Status:\*\*.*$/m, '**Status:** Proposed'))
  mkdirSync(join(adr, to, 'tasks'), { recursive: true })
  for (const name of readdirSync(join(adr, from, 'tasks'))) writeFileSync(join(adr, to, 'tasks', name), rename(readFileSync(join(adr, from, 'tasks', name), 'utf8')))
}
before(() => {
  scratch = mkdtempSync(join(tmpdir(), 'qh-work-next-batch-'))
  corpora = join(scratch, 'corpora')
  options = { cwd: scratch, encoding: 'utf8', timeout: 120_000, windowsHide: true }
  cpSync(join(repoRoot, 'tests', 'fixtures', 'corpora'), corpora, { recursive: true })
  cpSync(join(corpora, 'js-vitest-spa'), join(scratch, 'mixed'), { recursive: true })
  undecidedCopy(join(scratch, 'mixed'), 'ADR-001-the-cart-is-a-pure-reducer', 'ADR-003-the-cart-is-a-pure-reducer')
  undecidedCopy(join(scratch, 'mixed'), 'ADR-002-prices-are-integer-cents', 'ADR-004-prices-are-integer-cents')
  cpSync(join(corpora, 'go-module'), join(scratch, 'pair'), { recursive: true })
  undecidedCopy(join(scratch, 'pair'), 'ADR-001-cart-totals-are-integer-cents', 'ADR-002-cart-totals-are-integer-cents')
  const git = (...args) => spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'core.autocrlf=false', ...args], options)
  git('init', '-q')
  git('add', '-A')
  assert.equal(git('commit', '-qm', 'corpora').status, 0)
})
after(() => remove(scratch))

// work-next as a process, with every adr-next it starts recorded in order.
function workNext(script, root, env = {}) {
  const run = spawnSync(process.execPath, ['--import', counter, script, root, '--json'], { ...options, env: { ...process.env, ...env } })
  const started = (run.stderr ?? '').match(/\nadr-next started: (\[.*\])\n$/)
  assert.ok(started, run.stderr)
  const calls = JSON.parse(started[1])
  return { status: run.status, stdout: run.stdout, stderr: run.stderr.slice(0, started.index), calls,
    batches: calls.filter(call => call[0] === '--batch').length, singles: calls.filter(call => call[0] !== '--batch').map(call => call[0]) }
}
const ownScript = join(plugin, 'scripts', 'work-next.mjs')

test('work-next says the same with and without the batch', () => {
  for (const corpus of ['php-multi-root', 'duplicate-ids', 'undecided-records', 'js-vitest-spa', 'go-module', 'python-monorepo', 'madr', 'orphan-tasks']) {
    const root = join(corpora, corpus)
    let singly = 0
    const perDirectory = (...args) => { singly += 1; return spawnGate(...args) }
    assert.deepEqual(observe(root), observe(root, { spawn: perDirectory }), corpus)
    const said = { batched: [], singly: [] }
    // Both streams, in the order written: what work-next prints is its stdout and its stderr.
    const capture = into => {
      const { write: out } = process.stdout
      const { write: err } = process.stderr
      process.stdout.write = chunk => { into.push(`out ${chunk}`); return true }
      process.stderr.write = chunk => { into.push(`err ${chunk}`); return true }
      return () => { process.stdout.write = out; process.stderr.write = err }
    }
    let restore = capture(said.batched)
    let batchedExit
    try { batchedExit = main([root]) } finally { restore() }
    restore = capture(said.singly)
    let singlyExit
    try { singlyExit = main([root], { spawn: perDirectory }) } finally { restore() }
    assert.equal(said.batched.join(''), said.singly.join(''), `${corpus}: what work-next prints`)
    assert.equal(batchedExit, singlyExit, corpus)
    assert.ok(said.batched.join('').length > 0, `${corpus}: and it printed something to compare`)
  }
  for (const root of [join(scratch, 'mixed'), join(scratch, 'pair')]) {
    assert.deepEqual(observe(root), observe(root, { spawn: (...args) => spawnGate(...args) }), root)
  }
})

test('one adr-next process answers the task directories of each reading', () => {
  const mixed = workNext(ownScript, join(scratch, 'mixed'))
  assert.equal(mixed.status, 0, mixed.stderr)
  assert.deepEqual([mixed.batches, mixed.singles], [2, []], 'two decided and two undecided task directories: one batch for each reading, and no directory asked again')
  const pair = workNext(ownScript, join(scratch, 'pair'))
  assert.deepEqual([pair.batches, pair.singles.length], [0, 2], 'one directory in each reading: a batch of one saves nothing, so each is asked singly')
})

const said = (ready, more = {}) => JSON.stringify({ ready, done: [], blocked: [], stopped: [], ...more })
const frame = (i, dir, status, stdout, more = {}) => JSON.stringify({ i, dir, status, warned: false, stdout, stderr: '', ...more })
// What a frame costs against the bound: UTF-8 bytes, and one more for every newline.
const cost = text => Buffer.byteLength(text) + text.split('\n').length - 1
// An answer of exactly `bytes` of cost, built from a two-byte letter and ending in a newline, so a count in characters,
// or one that leaves the newline at one byte, comes out lower.
function sized(bytes) {
  const left = bytes - cost(`${said([], { pad: '' })}\n`)
  const stdout = `${said([], { pad: 'é'.repeat(Math.floor(left / 2)) + 'x'.repeat(left % 2) })}\n`
  assert.equal(cost(stdout), bytes)
  return stdout
}
const answered = (dirs, stdout, more = {}) => batchedAnswers(dirs, 'root', { run: () => ({ status: 0, stdout, stderr: '', ...more }) })

test('a frame outside the margins is asked singly', () => {
  const dirs = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
  const half = sized(BOUND / 2)
  const lines = [
    frame(0, 'a', 0, said([{ id: 'T1', path: 'a/T1.md' }])),     // a: ready
    frame(1, 'b', 1, said([])),                                    // b: an exit that is no answer, whatever it printed
    frame(2, 'c', 3, said([]), { warned: true }),                  // c: it raised a warning its own process would print
    frame(3, 'd', 3, sized(BOUND - 1)),                            // d: one byte inside the bound
    frame(4, 'e', 3, sized(BOUND)),                                // e: at it
    frame(5, 'f', 3, half, { stderr: 'é'.repeat((BOUND - cost(half)) / 2) }), // f: at it, over the two streams together
    frame(6, 'g', 2, said([])),                                    // g: could not run
    frame(7, 'h', 3, said([])),                                    // h: nothing ready
  ]
  const answers = answered(dirs, `${lines.join('\n')}\n`)
  assert.deepEqual([...answers.keys()], ['a', 'd', 'h'], 'a frame that is not taken leaves its directory out, and the frames after it are still read')
  assert.deepEqual(answers.get('a'), { status: 0, stdout: said([{ id: 'T1', path: 'a/T1.md' }]), stderr: '' })
  assert.equal(answers.get('h').status, 3)
  // What the batch process wrote outside its frames counts against every frame.
  const two = `${frame(0, 'a', 3, said([]))}\n${frame(1, 'b', 3, said([]))}\n`
  const room = BOUND - cost(said([]))
  assert.deepEqual([...answered(['a', 'b'], two, { stderr: 'é'.repeat((room - 2) / 2) + '\n' }).keys()], [], 'at the bound with the process\'s own stderr')
  assert.deepEqual([...answered(['a', 'b'], two, { stderr: 'é'.repeat((room - 2) / 2) + 'x' }).keys()], ['a', 'b'], 'and one byte inside it')
})

test('reading stops at a line that is not a frame', () => {
  const dirs = ['a', 'b', 'c']
  const good = [frame(0, 'a', 3, said([])), frame(1, 'b', 3, said([])), frame(2, 'c', 3, said([]))]
  const second = {
    'a wrong index': frame(2, 'b', 3, said([])),
    'an index already read': frame(0, 'a', 3, said([])),
    'another directory': frame(1, 'c', 3, said([])),
    'a null status': frame(1, 'b', null, said([])),
    'a status that is text': frame(1, 'b', '3', said([])),
    'a stream that is no string': frame(1, 'b', 3, said([]), { stderr: null }),
    'no warned': JSON.stringify({ i: 1, dir: 'b', status: 3, stdout: said([]), stderr: '' }),
    'no JSON': 'garbage',
    'JSON that is no object': '[1]',
    'a single call\'s own answer': said([]),
  }
  for (const [name, line] of Object.entries(second)) {
    assert.deepEqual([...answered(dirs, `${good[0]}\n${line}\n${good[2]}\n`).keys()], ['a'], `${name}: the frame before it is taken, and nothing from it on`)
  }
  assert.deepEqual([...answered(dirs, good.join('\n')).keys()], ['a', 'b'], 'a whole frame lacking only its newline is no line')
  assert.deepEqual([...answered(dirs, `${good.join('\n')}\n`).keys()], ['a', 'b', 'c'], 'and with it, it is')
  assert.deepEqual([...answered(['a', 'b'], `${good.join('\n')}\n`).keys()], ['a', 'b'], 'a frame for a query that was never asked is not read')
})

test('a batch that did not finish keeps what it finished', () => {
  const dirs = ['a', 'b', 'c']
  const one = `${frame(0, 'a', 3, said([]))}\n`
  const ends = {
    'killed at its budget': { error: Object.assign(new Error('spawnSync ETIMEDOUT'), { code: 'ETIMEDOUT' }), status: null, signal: 'SIGTERM', stdout: `${one}${frame(1, 'b', 3, said([])).slice(0, 20)}`, stderr: '' },
    'more output than the pipe holds': { error: Object.assign(new Error('spawnSync ENOBUFS'), { code: 'ENOBUFS' }), status: null, stdout: one, stderr: '' },
    'exit 1 after a query it could not answer': { status: 1, stdout: one, stderr: '' },
  }
  for (const [name, result] of Object.entries(ends)) {
    assert.deepEqual([...batchedAnswers(dirs, 'root', { run: () => result }).keys()], ['a'], name)
  }
  const nothing = {
    'a gate that could not start': { error: Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' }), status: null },
    'a gate without the flag': { status: 1, stdout: '', stderr: 'adr-next: unknown flag --batch\n' },
    'no result at all': null,
  }
  for (const [name, result] of Object.entries(nothing)) {
    assert.equal(batchedAnswers(dirs, 'root', { run: () => result }).size, 0, name)
  }
})

test('the batch is asked as the single call is asked', () => {
  const asked = []
  const run = (tool, args, given) => { asked.push({ tool, args, given }); return { status: 0, stdout: '' } }
  const lone = 'bad\ud800name'
  batchedAnswers(['a', lone, 'low\udc00end', 'pair😀ed', 'b'], 'root', { run })
  assert.equal(asked.length, 1)
  assert.equal(asked[0].tool, gate, 'the gate itself, as the single call names it')
  assert.deepEqual(asked[0].args, ['--batch'])
  assert.deepEqual(JSON.parse(asked[0].given.input), ['a', 'pair😀ed', 'b'], 'a name that JSON and an argument would carry differently is not sent, whichever half is alone; a whole pair is')
  assert.equal(String.prototype.isWellFormed === undefined || ['a', lone, 'low\udc00end', 'pair😀ed'].every(name => name.isWellFormed() === JSON.parse(asked[0].given.input).includes(name)), true, 'and where this Node has the built-in, it agrees')
  const { cwd, encoding, timeout, windowsHide, maxBuffer } = asked[0].given
  assert.deepEqual({ cwd, encoding, timeout, windowsHide }, { cwd: 'root', encoding: 'utf8', timeout: 30_000, windowsHide: true })
  assert.ok(maxBuffer > 64 * BOUND, 'the pipe holds every frame of a large corpus')
  batchedAnswers(['a', 'b'], 'root', { run, ms: 1234 })
  assert.equal(asked[1].given.timeout, 1234, 'a caller\'s budget is the batch\'s')
  const held = process.env.QUALITY_HARNESS_BATCH_MS
  try {
    process.env.QUALITY_HARNESS_BATCH_MS = '4321'
    batchedAnswers(['a', 'b'], 'root', { run })
    for (const none of ['soon', '0', '-5', '1.5', '2147483648', '1000000000000000000000']) {
      process.env.QUALITY_HARNESS_BATCH_MS = none
      batchedAnswers(['a', 'b'], 'root', { run })
    }
    process.env.QUALITY_HARNESS_BATCH_MS = '2147483647'
    batchedAnswers(['a', 'b'], 'root', { run })
  } finally {
    if (held === undefined) delete process.env.QUALITY_HARNESS_BATCH_MS
    else process.env.QUALITY_HARNESS_BATCH_MS = held
  }
  assert.deepEqual(asked.slice(2).map(call => call.given.timeout), [4321, 30_000, 30_000, 30_000, 30_000, 30_000, 30_000, 2_147_483_647],
    'the environment names the budget; a value that is no count of milliseconds, or more than a timeout can be, is not one')
  assert.equal(asked[0].given.env, undefined, 'the batch inherits the environment exactly as the single call does')
  for (const few of [[], ['a'], ['a', lone]]) batchedAnswers(few, 'root', { run })
  assert.equal(asked.length, 10, 'fewer than two directories to send: a batch saves nothing, and none is started')
})

// A plugin copied where the test may change its gate. work-next finds adr-next beside itself, so the copy's work-next
// starts the copy's gate; the real gate stays where record.py is beside it and is what a stand-in hands the work to.
function copiedPlugin(t, write) {
  const copy = mkdtempSync(join(tmpdir(), 'qh-work-next-plugin-'))
  t.after(() => remove(copy))
  for (const part of ['scripts', 'bin', 'lib']) cpSync(join(plugin, part), join(copy, part), { recursive: true })
  const stood = join(copy, 'bin', 'adr-next')
  write(stood)
  return join(copy, 'scripts', 'work-next.mjs')
}
const standIn = body => stood => {
  writeFileSync(stood, ['#!/usr/bin/env python3', 'import json, runpy, subprocess, sys, time', `REAL = ${JSON.stringify(gate)}`,
    'if "--batch" in sys.argv[1:]:', ...body.map(line => `    ${line}`), 'sys.argv[0] = REAL', 'runpy.run_path(REAL, run_name="__main__")', ''].join('\n'))
  chmodSync(stood, 0o755)
}

test('what the batch does not answer the single call decides', async t => {
  const root = join(corpora, 'php-multi-root')
  const healthy = workNext(ownScript, root)
  assert.equal(healthy.status, 0, healthy.stderr)
  assert.deepEqual([healthy.batches, healthy.singles], [1, []], 'every directory of this corpus is answered by the batch')
  const dirs = JSON.parse(spawnGate(gate, ['--batch'], { ...options, input: '[]' }).stdout || '[]')
  assert.deepEqual(dirs, [])
  const all = [join(root, 'docs', 'adr', 'ADR-001-notes-can-be-pinned', 'tasks'), join(root, 'docs', 'adr', 'ADR-002-a-note-needs-a-title', 'tasks'),
    join(root, 'docs', 'decisions', 'ADR-003-notes-are-soft-deleted', 'tasks')]
  const same = (run, name) => assert.deepEqual([run.status, run.stdout, run.stderr], [healthy.status, healthy.stdout, healthy.stderr], `${name}: work-next says what it says when the batch answers`)

  await t.test('a gate that does not know the flag', t => {
    const run = workNext(copiedPlugin(t, standIn(['sys.stderr.write("adr-next: unknown flag --batch\\n")', 'sys.exit(1)'])), root)
    assert.deepEqual(run.calls, [['--batch'], ...all.map(dir => [dir, '--json'])], 'the batch, then every directory singly')
    same(run, 'no flag')
  })

  await t.test('a batch that answers one directory and hangs', t => {
    const hangs = standIn(['asked = json.loads(sys.stdin.buffer.read().decode("utf-8"))',
      'first = subprocess.run([sys.executable, REAL, "--batch"], input=json.dumps(asked[:1]).encode("utf-8"), capture_output=True)',
      'sys.stdout.buffer.write(first.stdout)', 'sys.stdout.buffer.flush()', 'time.sleep(600)'])
    const run = workNext(copiedPlugin(t, hangs), root, { QUALITY_HARNESS_BATCH_MS: '8000' })
    assert.deepEqual(run.calls, [['--batch'], ...all.slice(1).map(dir => [dir, '--json'])], 'the batch, then the two directories it never answered')
    same(run, 'hung')
  })

  const posix = { skip: process.platform === 'win32' ? 'Windows has no executable bit and starts a gate through the interpreter it resolved, never through the gate\'s first line' : false }
  const unproven = run => JSON.parse(run.stdout).readinessUnproven.length
  assert.equal(unproven(healthy), 0)

  await t.test('a gate this process may not execute', posix, t => {
    const run = workNext(copiedPlugin(t, stood => chmodSync(stood, 0o644)), root)
    assert.deepEqual(run.calls, [['--batch'], ...all.map(dir => [dir, '--json'])])
    assert.equal(unproven(run), 3, 'the batch did not start either, and every directory is readiness UNPROVEN as the single call leaves it')
  })

  await t.test('a gate whose first line names no interpreter', posix, t => {
    const run = workNext(copiedPlugin(t, stood => { writeFileSync(stood, readFileSync(stood, 'utf8').replace(/^#!.*$/m, '#!/nonexistent/python3')); chmodSync(stood, 0o755) }), root)
    assert.deepEqual(run.calls, [['--batch'], ...all.map(dir => [dir, '--json'])])
    assert.equal(unproven(run), 3, 'a batch is started through the gate\'s own first line, so it cannot answer where the single call cannot start')
  })
})

test('an injected spawn is never batched', () => {
  const root = join(scratch, 'mixed')
  const asked = []
  const spawn = (tool, args, given) => { asked.push(args); return spawnGate(tool, args, given) }
  const tasks = join(root, 'docs', 'adr', 'ADR-001-the-cart-is-a-pure-reducer', 'tasks')
  const other = join(root, 'docs', 'adr', 'ADR-002-prices-are-integer-cents', 'tasks')
  const corpus = [{ kind: 'governing', taskFiles: [join(tasks, 'T1-add-and-remove-items.md'), join(other, 'T1-format-cents.md')] }]
  const injected = readinessFrom(corpus, root, spawn)
  assert.deepEqual(asked, [[tasks, '--json'], [other, '--json']], 'one call per directory, and no batch')
  assert.deepEqual(readinessFrom(corpus, root), injected, 'and the default, which batches, reads the same')
})
