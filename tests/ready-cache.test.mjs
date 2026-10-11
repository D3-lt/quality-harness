// ADR-095 T2: the ready-task lines come from a cache keyed by the content that produced them. A hit must give exactly the lines an
// uncached run gives, every input that could change the answer must be in the key, and a cache that cannot be used must run
// `adr-next` and say so, never answer "nothing in flight".
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { appendFileSync, chmodSync, mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { trackedPaths } from '../plugin/scripts/decision-corpus.mjs'
import { stateDir } from '../plugin/scripts/event-log.mjs'
import { readyCache, readyKey } from '../plugin/scripts/ready-cache.mjs'
import { readyTaskLines, spawnGate } from '../plugin/scripts/ready-lines.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const scratch = realpathSync.native(mkdtempSync(path.join(os.tmpdir(), 'ready-cache-')))
after(() => rmSync(scratch, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }))
const git = (cwd, ...args) => assert.equal(spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8', timeout: 20_000, windowsHide: true }).status, 0)

let repos = 0
// A repository with two Accepted records and one pending task under each, staged so that git lists them.
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
  }
  git(root, 'add', '-A')
  return root
}
// One "hook process": a fresh cache object over the same repository, and a spawn that counts the gates it is asked to run.
function start(root) {
  const calls = []
  const listing = trackedPaths(root)
  const cache = readyCache(root, listing)
  const ready = readyTaskLines(root, true, listing, (...args) => { calls.push(args[1][0]); return spawnGate(...args) }, cache)
  return { calls, lines: ready.lines, problem: cache.problem() }
}

test('a second start in an unchanged corpus starts no adr-next and says the same lines', () => {
  const root = corpus()
  const first = start(root)
  assert.equal(first.calls.length, 2, 'the first start runs adr-next for each of the two task directories')
  assert.ok(first.lines.some(line => line.includes('T1 is ready')), first.lines.join('\n'))
  const second = start(root)
  assert.equal(second.calls.length, 0, 'the second start runs none')
  assert.deepEqual(second.lines, first.lines, 'and says exactly what the first said')
  assert.equal(second.problem, null)
  // The same through the real hook program, in a corpus nothing has started yet: the first SessionStart runs adr-next (so the
  // count is able to be above zero), the second starts none.
  const other = corpus()
  const measure = () => JSON.parse(spawnSync(process.execPath, [path.join(repoRoot, 'scripts', 'hook-cost.mjs'), 'SessionStart', other, '--in-place', '--json'],
    { encoding: 'utf8', timeout: 120_000, windowsHide: true }).stdout)
  const asked = report => report.children.filter(child => child.cmd.includes('adr-next')).length
  assert.equal(asked(measure()), 2, 'the first SessionStart in a corpus runs adr-next for each task directory')
  assert.equal(asked(measure()), 0, 'the second runs none')
})

test('a change to a task file, the owning record, another record, an untracked file or the date is a miss, and each is answered fresh', () => {
  const root = corpus()
  start(root)
  assert.equal(start(root).calls.length, 0, 'warm')
  const edits = {
    'a task file': () => appendFileSync(path.join(root, 'docs/adr/ADR-001-x/tasks/T1-a.md'), '\nA line.\n'),
    'the owning record': () => writeFileSync(path.join(root, 'docs/adr/ADR-001-x.md'), `# ADR-001: probe\n\n**Status:** Proposed\n**Date:** 2026-09-23\n\n## Context\n\nx\n\n## Decision\n\ny\n`),
    'another record\'s task': () => appendFileSync(path.join(root, 'docs/adr/ADR-002-x/tasks/T1-a.md'), '\nA line.\n'),
    'a file git does not list': () => writeFileSync(path.join(root, 'docs/adr/notes.md'), 'untracked\n'),
  }
  for (const [what, edit] of Object.entries(edits)) {
    edit()
    const changed = start(root)
    assert.ok(changed.calls.length >= 1, `${what}: a miss runs adr-next`)
    assert.equal(start(root).calls.length, 0, `${what}: and the answer is then kept`)
  }
  // The answer reflects the change, not the old entry: the record is Proposed now.
  assert.ok(start(root).lines.some(line => line.includes('not Accepted')), 'the Proposed record is said')
  // The date and the gate files are in the key (the cache reads the plugin's own files and today's date).
  const base = { tools: [['adr-next', 'a']], date: '2026-10-11', directory: '/d', corpusRoot: '/c', tracked: [], corpus: [] }
  assert.notEqual(readyKey(base), readyKey({ ...base, date: '2026-10-12' }))
  assert.notEqual(readyKey(base), readyKey({ ...base, tools: [['adr-next', 'b']] }))
})

test('a cache that cannot be read, written or parsed is a miss, said once, and never an empty answer', () => {
  const fresh = start(corpus()).lines
  // A corrupt entry.
  const a = corpus()
  start(a)
  const folder = path.join(stateDir(a), 'ready-cache')
  for (const name of readdirSync(folder)) writeFileSync(path.join(folder, name), '{ not json')
  const corrupt = start(a)
  assert.equal(corrupt.calls.length, 2, 'a corrupt entry runs the gate')
  assert.deepEqual(corrupt.lines, fresh)
  assert.match(corrupt.problem, /not JSON|could not be read/)
  // A cache directory that cannot be made or read: a file stands where the directory should be.
  const b = corpus()
  mkdirSync(stateDir(b), { recursive: true })
  writeFileSync(path.join(stateDir(b), 'ready-cache'), 'in the way')
  const blocked = start(b)
  assert.equal(blocked.calls.length, 2)
  assert.deepEqual(blocked.lines, fresh)
  assert.ok(blocked.problem, 'it is said')
  assert.equal(start(b).calls.length, 2, 'and nothing is ever answered from a cache that cannot be used')
  // An entry that parses but does not carry the answer it is keyed by.
  const c = corpus()
  start(c)
  const entries = path.join(stateDir(c), 'ready-cache')
  for (const name of readdirSync(entries)) writeFileSync(path.join(entries, name), JSON.stringify({ key: 'x', status: 0, stdout: '{}' }))
  const forged = start(c)
  assert.equal(forged.calls.length, 2)
  assert.deepEqual(forged.lines, fresh)
  assert.ok(forged.problem)
  // An entry the reader may not read, where the writer can still replace it: only the lookup can have said so. (POSIX, not root.)
  if (process.platform !== 'win32' && process.getuid?.() !== 0) {
    const e = corpus()
    start(e)
    const kept = path.join(stateDir(e), 'ready-cache')
    for (const name of readdirSync(kept)) chmodSync(path.join(kept, name), 0)
    const unreadable = start(e)
    assert.equal(unreadable.calls.length, 2, 'an entry that cannot be read runs the gate')
    assert.deepEqual(unreadable.lines, fresh)
    assert.match(unreadable.problem, /could not be read/, 'and the lookup says so')
  }
  // A tree this cache does not hash: a link inside the corpus directory. A file link needs a privilege an ordinary Windows
  // account does not hold, so there the case is left out rather than failed.
  const d = corpus()
  mkdirSync(path.join(d, 'docs', 'adr', 'z'))
  writeFileSync(path.join(d, 'target.md'), 'x')
  try { symlinkSync(path.join(d, 'target.md'), path.join(d, 'docs', 'adr', 'z', 'link.md')) } catch { return }
  const linked = start(d)
  assert.equal(linked.calls.length, 2)
  assert.match(linked.problem, /link/)
})

test('readyKey is a function of the bytes it is handed', () => {
  const base = { tools: [['adr-next', Buffer.from('a')], ['record.py', Buffer.from('b')]], date: '2026-10-11', directory: '/d', corpusRoot: '/c', tracked: ['x/y.md'], corpus: [['p.md', Buffer.from('1')], ['q.md', Buffer.from('2')]] }
  assert.equal(readyKey(base), readyKey(structuredClone(base)), 'equal inputs, equal keys')
  const changed = {
    'a tool byte': { ...base, tools: [['adr-next', Buffer.from('A')], base.tools[1]] },
    'a tool name': { ...base, tools: [['other', Buffer.from('a')], base.tools[1]] },
    'the date': { ...base, date: '2026-10-12' },
    'the directory': { ...base, directory: '/e' },
    'the corpus root': { ...base, corpusRoot: '/f' },
    'a tracked path': { ...base, tracked: ['x/z.md'] },
    'a file name': { ...base, corpus: [['p2.md', Buffer.from('1')], base.corpus[1]] },
    'a file byte': { ...base, corpus: [['p.md', Buffer.from('9')], base.corpus[1]] },
    'a file added': { ...base, corpus: [...base.corpus, ['r.md', Buffer.from('')]] },
    // Bytes sliding from one file to its neighbour must not give the same key.
    'bytes moved between neighbours': { ...base, corpus: [['p.md', Buffer.from('12')], ['q.md', Buffer.from('')]] },
  }
  for (const [what, inputs] of Object.entries(changed)) assert.notEqual(readyKey(inputs), readyKey(base), what)
  const pure = spawnSync(process.execPath, ['--expose-internals', path.join(repoRoot, 'scripts', 'effect-classes.mjs'), '--root', repoRoot, 'plugin/scripts/ready-cache.mjs::readyKey'],
    { encoding: 'utf8', timeout: 30_000, windowsHide: true })
  assert.equal(pure.status, 0, pure.stdout + pure.stderr)
  assert.match(pure.stdout, /: pure/)
})
