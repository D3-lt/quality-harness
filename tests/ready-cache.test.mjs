// ADR-095 T6: the ready-task lines come from a cache whose key is what the gate actually read. The gate runs under a recorder; the
// answer is reused only while everything the recorder saw still holds. Each kind of dependency has its dirty twin, and a cache that
// cannot be used runs the gate and says so, never answering "nothing in flight".
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { appendFileSync, chmodSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { trackedPaths } from '../plugin/scripts/decision-corpus.mjs'
import { stateDir } from '../plugin/scripts/event-log.mjs'
import { readyCache } from '../plugin/scripts/ready-cache.mjs'
import { readyTaskLines, spawnGate } from '../plugin/scripts/ready-lines.mjs'
import { sessionStateNote } from '../plugin/scripts/session-notes.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const scratch = realpathSync.native(mkdtempSync(path.join(os.tmpdir(), 'ready-cache-')))
after(() => rmSync(scratch, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }))
const git = (cwd, ...args) => assert.equal(spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8', timeout: 20_000, windowsHide: true }).status, 0)

let repos = 0
// A repository with two Accepted records and one pending task under each, staged so that git lists them, with the task
// directories in a fixed order (they are listed newest first, and two files written in one millisecond tie on Linux).
function corpus() {
  const root = path.join(scratch, `repo-${repos++}`)
  mkdirSync(root, { recursive: true })
  git(root, 'init', '-q')
  const record = (id, status) => `# ${id}: probe\n\n**Status:** ${status}\n**Date:** 2026-09-23\n\n## Context\n\nx\n\n## Decision\n\ny\n`
  const task = id => `# Task ${id}: probe\n\n**Depends-on:** none\n\n## Acceptance\n\n\`\`\`bash\ntrue\n\`\`\`\n\n## Verification Log\n\n`
  for (const n of ['1', '2']) {
    const tasks = path.join(root, 'docs', 'adr', `ADR-00${n}-x`, 'tasks')
    mkdirSync(tasks, { recursive: true })
    writeFileSync(path.join(root, 'docs', 'adr', `ADR-00${n}-x.md`), record(`ADR-00${n}`, 'Accepted'))
    writeFileSync(path.join(tasks, 'T1-a.md'), task(`ADR-00${n}-T1`))
    const when = new Date(Date.UTC(2026, 0, 1, 0, 0, Number(n)))
    utimesSync(path.join(tasks, 'T1-a.md'), when, when)
  }
  git(root, 'add', '-A')
  return root
}
// One "hook process": a fresh cache over the same repository, and a spawn that counts the times the gate is run (traced or not).
function start(root, { now = new Date(2026, 9, 11, 12), after: afterRun } = {}) {
  const gateRuns = []
  const listing = trackedPaths(root)
  const cache = readyCache(root, listing, { now })
  const counting = (...args) => {
    gateRuns.push(args[1].find(word => word.endsWith('tasks')))
    const result = spawnGate(...args)
    if (afterRun) afterRun()
    return result
  }
  const ready = readyTaskLines(root, true, listing, counting, cache)
  return { runs: gateRuns.length, lines: ready.lines, problem: cache.problem() }
}

test('a second start in an unchanged corpus starts no adr-next and says the same lines', () => {
  const root = corpus()
  const first = start(root)
  assert.equal(first.runs, 2, 'the first start runs the gate for each of the two task directories')
  assert.ok(first.lines.some(line => line.includes('T1 is ready')), first.lines.join('\n'))
  const second = start(root)
  assert.equal(second.runs, 0, 'the second start runs none')
  assert.deepEqual(second.lines, first.lines, 'and says exactly what the first said')
  assert.equal(second.problem, null)
  // The same through the real hook program, in a corpus nothing has started yet: one hook-cost run is two SessionStarts in the same
  // home, the first runs the gate for each task directory and the second runs none.
  const other = corpus()
  const report = JSON.parse(spawnSync(process.execPath, [path.join(repoRoot, 'scripts', 'hook-cost.mjs'), 'SessionStart', other, '--in-place', '--json'],
    { encoding: 'utf8', timeout: 120_000, windowsHide: true }).stdout)
  const asked = children => children.filter(child => child.cmd.includes('adr-next') || child.cmd.includes('trace_run')).length
  assert.equal(asked(report.children), 2, 'the first SessionStart in a corpus runs the gate for each task directory')
  assert.equal(asked(report.second.childList), 0, 'the second runs none')
  // The note PreCompact leaves asks the same cache: the task line is in it, and the answers were kept.
  const noted = corpus()
  const note = sessionStateNote({}, noted, noted, true, new Date(2026, 9, 11, 12))
  assert.ok(note.text.includes('ADR task in flight'), note.text)
  assert.equal(readdirSync(path.join(stateDir(noted), 'ready-cache')).filter(file => file.endsWith('.json')).length, 2, 'the note kept the answer for each task directory')
})

test('a manifest holds every kind of dependency the gate read, and each changes the answer when it changes', () => {
  const root = corpus()
  start(root)
  assert.equal(start(root).runs, 0, 'warm')
  const edits = {
    'a task file': () => appendFileSync(path.join(root, 'docs/adr/ADR-001-x/tasks/T1-a.md'), '\nA line.\n'),
    'the owning record': () => writeFileSync(path.join(root, 'docs/adr/ADR-001-x.md'), '# ADR-001: probe\n\n**Status:** Proposed\n**Date:** 2026-09-23\n\n## Context\n\nx\n\n## Decision\n\ny\n'),
    'another record\'s task': () => appendFileSync(path.join(root, 'docs/adr/ADR-002-x/tasks/T1-a.md'), '\nA line.\n'),
    'an empty directory beside the tasks': () => mkdirSync(path.join(root, 'docs/adr/ADR-001-x/tasks/T1-dup.md')),
    'a file git newly lists': () => { writeFileSync(path.join(root, 'docs/adr/ADR-002-x/tasks/T2-b.md'), '# Task ADR-002-T2: b\n\n**Depends-on:** none\n\n## Acceptance\n\n```bash\ntrue\n```\n\n## Verification Log\n\n'); git(root, 'add', '-A') },
  }
  for (const [what, edit] of Object.entries(edits)) {
    edit()
    const changed = start(root)
    assert.ok(changed.runs >= 1, `${what}: a miss runs the gate`)
    // The answer reflects the change, not the old entry.
    if (what === 'the owning record') assert.ok(changed.lines.some(line => line.includes('not Accepted')), 'the Proposed record is said')
    if (what === 'an empty directory beside the tasks') assert.ok(changed.lines.some(line => line.includes('UNPROVEN')), 'a task directory the gate cannot read as one is UNPROVEN, not ready')
    assert.equal(start(root).runs, 0, `${what}: and the answer is then kept`)
  }
  // The local date is in the key: the gate judges a log row dated ahead against today.
  assert.equal(start(root, { now: new Date(2026, 9, 12, 12) }).runs >= 1, true, 'a new day is a miss')
  // The kinds a real gate reads only sometimes (a test file a Tests table names, a project's declared check, a command's output),
  // shown on a gate that reads each of them always: any gate is a gate to the cache.
  const where = path.join(scratch, 'kinds')
  mkdirSync(path.join(where, 'listed'), { recursive: true })
  // Absent paths live in a directory nothing lists: python's import system lists the directory it imports from, which would
  // otherwise answer for them and hide a check that never looked at the path itself.
  mkdirSync(path.join(where, 'quiet'), { recursive: true })
  writeFileSync(path.join(where, 'outside.txt'), '1')
  // A file link is followed and what it leads to is a dependency like any other file; the privilege to make one is not held by an
  // ordinary Windows account, so there the gate reads the file itself.
  const linked = path.join(where, 'link.txt')
  writeFileSync(path.join(where, 'target.txt'), 'a')
  try { symlinkSync(path.join(where, 'target.txt'), linked) } catch { writeFileSync(linked, 'a') }
  const gate = path.join(where, 'gate.py')
  writeFileSync(gate, [
    'import json, os, subprocess, sys',
    `sys.path.insert(0, ${JSON.stringify(where)})`,
    'import helper',
    `try:\n    open(${JSON.stringify(path.join(where, 'quiet', 'missing.txt'))}).read()\nexcept OSError:\n    pass`,
    `open(${JSON.stringify(path.join(where, 'outside.txt'))}).read()`,
    `open(${JSON.stringify(linked)}).read()`,
    `os.listdir(${JSON.stringify(path.join(where, 'listed'))})`,
    `os.path.exists(${JSON.stringify(path.join(where, 'quiet', 'absent.txt'))})`,
    `try:\n    os.stat(${JSON.stringify(path.join(where, 'quiet', 'direct.txt'))})\nexcept OSError:\n    pass`,
    `import pathlib\npathlib.Path(${JSON.stringify(path.join(where, 'quiet', 'viapath.txt'))}).is_file()`,
    `subprocess.run(['git', '-C', ${JSON.stringify(root)}, 'ls-files'], capture_output=True)`,
    "print(json.dumps({'tasks_dir': 'x', 'ready': [], 'done': [], 'blocked': [], 'stopped': [], 'status': 'ok'}))",
  ].join('\n'))
  writeFileSync(path.join(where, 'helper.py'), 'VALUE = 1\n')
  // The gate's bytecode is written, as it is in a user's session; the mutation runner switches that off for its own children, and the
  // compiled copy of an imported module is exactly what one of these tests is about.
  const writing = { ...process.env, PYTHONDONTWRITEBYTECODE: '' }
  const askGate = (env = writing) => {
    let runs = 0
    const cache = readyCache(root, trackedPaths(root), { now: new Date(2026, 9, 11, 12), env })
    cache.answer(path.join(where, 'tasks'), (...args) => { runs++; return spawnGate(...args) }, gate, { encoding: 'utf8', timeout: 30_000, windowsHide: true, env })
    return { runs, problem: cache.problem() }
  }
  assert.equal(askGate().runs, 1, 'the first ask runs the gate')
  assert.equal(askGate().runs, 0, 'and the second does not')
  const gateEdits = {
    'a file outside the corpus': () => writeFileSync(path.join(where, 'outside.txt'), '2'),
    'the file a link leads to': () => writeFileSync(path.join(where, 'target.txt'), 'b'),
    'a directory the gate listed': () => writeFileSync(path.join(where, 'listed', 'b.txt'), 'b'),
    'a path the gate asked about that was absent': () => writeFileSync(path.join(where, 'quiet', 'absent.txt'), 'x'),
    'a path the gate stat-ed directly that was absent': () => writeFileSync(path.join(where, 'quiet', 'direct.txt'), 'x'),
    'a path the gate asked about through pathlib that was absent': () => writeFileSync(path.join(where, 'quiet', 'viapath.txt'), 'x'),
    'the output of a command the gate ran': () => { writeFileSync(path.join(root, 'listed-by-git.txt'), 'x'); git(root, 'add', '-A') },
    'a file the gate tried to open that was not there': () => writeFileSync(path.join(where, 'quiet', 'missing.txt'), 'x'),
    'a module the gate imported, loaded from its compiled copy the second time': () => writeFileSync(path.join(where, 'helper.py'), 'VALUE = 2\n'),
  }
  for (const [what, edit] of Object.entries(gateEdits)) {
    edit()
    assert.equal(askGate().runs, 1, `${what}: a miss runs the gate`)
    assert.equal(askGate().runs, 0, `${what}: and the answer is then kept`)
  }
  // The environment the gate and git can see is in the key, and so is the interpreter that ran it.
  assert.equal(askGate({ ...writing, LANG: 'x-another' }).runs, 1, 'a different environment is a miss')
  askGate()
  const kept = path.join(stateDir(root), 'ready-cache')
  for (const name of readdirSync(kept).filter(file => file.endsWith('.json'))) {
    const entry = JSON.parse(readFileSync(path.join(kept, name), 'utf8'))
    entry.python.signature = [1, 1]
    writeFileSync(path.join(kept, name), JSON.stringify(entry))
  }
  assert.equal(askGate().runs, 1, 'a different interpreter is a miss')
  // A project that moves Python's bytecode out of __pycache__ (PYTHONPYCACHEPREFIX; the mutation runner does) still gets a kept
  // answer: the bytecode a run writes is not something the gate read.
  const moved = { ...writing, PYTHONPYCACHEPREFIX: path.join(scratch, 'pyc-prefix') }
  assert.equal(askGate(moved).runs, 1, 'the first ask under a moved bytecode cache runs the gate')
  assert.equal(askGate(moved).runs, 0, 'and the second does not')
})

test('a cache that cannot be read, written or parsed is a miss, said once, and never an empty answer', () => {
  const fresh = start(corpus()).lines
  const a = corpus()
  start(a)
  const folder = path.join(stateDir(a), 'ready-cache')
  for (const name of readdirSync(folder)) writeFileSync(path.join(folder, name), '{ not json')
  const corrupt = start(a)
  assert.equal(corrupt.runs, 2, 'a corrupt entry runs the gate')
  assert.deepEqual(corrupt.lines, fresh)
  assert.match(corrupt.problem, /not JSON|could not be read/)
  const b = corpus()
  mkdirSync(stateDir(b), { recursive: true })
  writeFileSync(path.join(stateDir(b), 'ready-cache'), 'in the way')
  const blocked = start(b)
  assert.equal(blocked.runs, 2)
  assert.deepEqual(blocked.lines, fresh)
  assert.ok(blocked.problem, 'it is said')
  assert.equal(start(b).runs, 2, 'and nothing is ever answered from a cache that cannot be used')
  const c = corpus()
  start(c)
  for (const name of readdirSync(path.join(stateDir(c), 'ready-cache'))) writeFileSync(path.join(stateDir(c), 'ready-cache', name), JSON.stringify({ key: 'x', answer: { status: 0, stdout: '{}' } }))
  const forged = start(c)
  assert.equal(forged.runs, 2)
  assert.deepEqual(forged.lines, fresh)
  assert.ok(forged.problem)
  if (process.platform !== 'win32' && process.getuid?.() !== 0) {
    const e = corpus()
    start(e)
    const kept = path.join(stateDir(e), 'ready-cache')
    for (const name of readdirSync(kept)) chmodSync(path.join(kept, name), 0)
    const unreadable = start(e)
    assert.equal(unreadable.runs, 2, 'an entry that cannot be read runs the gate')
    assert.deepEqual(unreadable.lines, fresh)
    assert.match(unreadable.problem, /could not be read/, 'and the lookup says so')
  }
})

test('a run during which a dependency changed is not stored', () => {
  const root = corpus()
  const record = path.join(root, 'docs/adr/ADR-001-x.md')
  const raced = start(root, { after: () => writeFileSync(record, '# ADR-001: probe\n\n**Status:** Proposed\n**Date:** 2026-09-23\n\n## Context\n\nx\n\n## Decision\n\ny\n') })
  assert.ok(raced.lines.some(line => line.includes('T1 is ready')), 'the run answered from what it read')
  const later = start(root)
  assert.ok(later.runs >= 1, 'an answer made from the old record is not kept for the new one')
  assert.ok(later.lines.some(line => line.includes('not Accepted')), 'and the later start reflects the edit')
})

test('the recorder records what the gate read and leaves the standard library out', () => {
  const dir = path.join(scratch, 'recorder')
  mkdirSync(path.join(dir, 'listed'), { recursive: true })
  writeFileSync(path.join(dir, 'listed', 'a.txt'), 'a')
  writeFileSync(path.join(dir, 'read.txt'), 'read')
  const gate = path.join(dir, 'gate.py')
  writeFileSync(gate, [
    'import json, os, subprocess, sys, pathlib',
    `open(${JSON.stringify(path.join(dir, 'read.txt'))}).read()`,
    `os.listdir(${JSON.stringify(path.join(dir, 'listed'))})`,
    `os.path.exists(${JSON.stringify(path.join(dir, 'absent'))})`,
    `pathlib.Path(${JSON.stringify(path.join(dir, 'listed'))}).is_dir()`,
    "subprocess.run(['git', '--version'], capture_output=True)",
    "print(json.dumps({'ok': True}))",
  ].join('\n'))
  const manifest = path.join(dir, 'manifest.json')
  const run = spawnGate(path.join(repoRoot, 'plugin', 'lib', 'trace_run.py'), [manifest, gate], { encoding: 'utf8', timeout: 30_000, windowsHide: true })
  assert.equal(run.status, 0, run.stderr)
  assert.deepEqual(JSON.parse(run.stdout), { ok: true }, 'the gate\'s stdout passes through')
  const seen = JSON.parse(readFileSync(manifest, 'utf8'))
  const outside = Object.keys(seen.opened).filter(file => !seen.prefixes.some(prefix => file.startsWith(prefix)) && !file.includes('__pycache__') && !(seen.pycache && file.startsWith(seen.pycache)))
  assert.ok(outside.includes(path.join(dir, 'read.txt')), 'a file it opened')
  assert.ok(outside.includes(gate), 'the gate itself')
  assert.deepEqual(seen.listed[path.join(dir, 'listed')], ['a.txt'], 'a directory it listed, with the names')
  assert.equal(seen.statted[path.join(dir, 'absent')], null, 'a path it asked about that was not there')
  assert.equal(seen.statted[path.join(dir, 'listed')], 'dir', 'and one that was')
  assert.ok(seen.ran.some(item => item.argv.join(' ') === 'git --version'), 'a command it ran')
  assert.equal(outside.some(file => /[\\/]lib[\\/]python3?\.?\d*[\\/]/.test(file)), false, 'no standard-library file is a dependency')
})
