// work-next's readiness is adr-next's answer (BACKLOG §265), and this file drives
// the seam that makes it so — `readinessFrom(corpus, directory, spawn, allowed)` —
// through the cases a different-lineage review of bdeba73 found it wrong on: exit
// 3 ("nothing ready", a valid answer) read as unproven; a relative repository
// argument handing adr-next a relative directory under the wrong cwd; a task
// adr-next read from disk but git does not list reaching `ready`; and, at the
// CLI, unread directories rendered as "Nothing in the QH corpus is waiting".
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { main, observe, readinessFrom } from '../plugin/scripts/work-next.mjs'

const testDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(testDir, '..')
const temps = []
test.after(() => { for (const t of temps) rmSync(t, { recursive: true, force: true }) })

// What adr-next --json prints, as spawnSync hands it back. Nothing on disk is
// read by these: `spawn` is the seam.
const answer = (status, ready) => ({
  status, error: null, signal: null, stderr: '',
  stdout: JSON.stringify({ ready, done: [], blocked: [], stopped: [] }),
})

test('readinessFrom: exit 3 is adr-next saying nothing is ready, not a directory it could not read', () => {
  const root = path.join(os.tmpdir(), 'qh-readiness-root')
  const dir = path.join(root, 'docs', 'adr', 'A', 'tasks')
  const corpus = [{ kind: 'governing', frozen: false, taskFiles: [path.join(dir, 'T1.md')] }]
  assert.deepEqual(readinessFrom(corpus, root, () => answer(3, [])), { ready: [], unproven: [], done: new Set(), listed: new Set(), notes: new Map() },
    'exit 3 with valid JSON is an answer')
  // DIRTY: exit 2 is the gate not running (a lib missing beside bin/), and that IS unproven.
  const missing = readinessFrom(corpus, root, () => ({ status: 2, error: null, signal: null, stdout: '', stderr: '[adr-next] could not run' }))
  assert.deepEqual(missing, { ready: [], unproven: [dir], done: new Set(), listed: new Set(), notes: new Map() })
  const ready = readinessFrom(corpus, root, () => answer(0, [{ id: 'T1', path: path.join(dir, 'T1.md') }]))
  assert.deepEqual(ready.ready, [path.join(dir, 'T1.md')])
})

test('readinessFrom: a relative repository argument still hands adr-next an absolute directory under an absolute cwd', () => {
  const calls = []
  const relRoot = path.join('tests', 'fixtures', 'foreign') // relative on purpose
  const corpus = [{ kind: 'governing', frozen: false, taskFiles: [path.join(relRoot, 'adr', 'ADR-001-cross-repo', 'tasks', 'T1.md')] }]
  readinessFrom(corpus, relRoot, (tool, args, options) => { calls.push({ args, options }); return answer(3, []) })
  assert.equal(calls.length, 1)
  assert.ok(path.isAbsolute(calls[0].args[0]), `adr-next is given an absolute task directory: ${calls[0].args[0]}`)
  assert.equal(calls[0].options.cwd, path.resolve(relRoot), 'and runs under the resolved repository')
})

test('readinessFrom: a task adr-next read from disk but this reader does not list is not offered', () => {
  const root = path.join(os.tmpdir(), 'qh-readiness-allow')
  const dir = path.join(root, 'docs', 'adr', 'A', 'tasks')
  const listed = path.join(dir, 'T1.md')
  const unlisted = path.join(dir, 'T2.md')
  const corpus = [{ kind: 'governing', frozen: false, taskFiles: [listed] }]
  const spawn = () => answer(0, [{ id: 'T1', path: listed }, { id: 'T2', path: unlisted }])
  assert.deepEqual(readinessFrom(corpus, root, spawn, new Set([listed])).ready, [listed],
    'the unlisted sibling adr-next saw on disk is filtered')
  // CLEAN: with no allowlist, both are adr-next's answer.
  assert.deepEqual(readinessFrom(corpus, root, spawn).ready, [listed, unlisted])
})

test('readinessFrom: only governing, unfrozen records are asked about — a Proposed record has no ready work', () => {
  // The Accepted-only rule used to be a second filter over adr-next's answer; that
  // filter was dead once this function chose the directories, and its mutant went
  // GREEN on CI (bdeba73, shard 4/48). The rule lives here now, and this is where
  // it is asserted.
  const root = path.join(os.tmpdir(), 'qh-readiness-kind')
  const accepted = path.join(root, 'docs', 'adr', 'A', 'tasks')
  const proposed = path.join(root, 'docs', 'adr', 'P', 'tasks')
  const frozen = path.join(root, 'docs', 'adr', 'F', 'tasks')
  const corpus = [
    { kind: 'governing', frozen: false, taskFiles: [path.join(accepted, 'T1.md')] },
    { kind: 'undecided', frozen: false, taskFiles: [path.join(proposed, 'T1.md')] },
    { kind: 'governing', frozen: true, taskFiles: [path.join(frozen, 'T1.md')] },
  ]
  const asked = []
  const spawn = (tool, args) => { asked.push(args[0]); return answer(0, [{ id: 'T1', path: path.join(args[0], 'T1.md') }]) }
  const result = readinessFrom(corpus, root, spawn)
  assert.deepEqual(asked, [accepted], 'adr-next is asked about the governing, unfrozen record only')
  assert.deepEqual(result.ready, [path.join(accepted, 'T1.md')])
  assert.deepEqual(result.unproven, [], 'a directory never asked about is not "unproven" — it is not in flight')
})

test('work-next text mode says UNPROVEN for a directory adr-next could not read, never an all-clear', () => {
  // A plugin copy whose adr-next cannot answer: bin/ holds one stub that exits 5.
  const temp = mkdtempSync(path.join(os.tmpdir(), 'qh-readiness-cli-')); temps.push(temp)
  const plugin = path.join(temp, 'plugin')
  cpSync(path.join(repoRoot, 'plugin', 'scripts'), path.join(plugin, 'scripts'), { recursive: true })
  mkdirSync(path.join(plugin, 'bin'))
  writeFileSync(path.join(plugin, 'bin', 'adr-next'),
    '#!/usr/bin/env python3\nimport sys\nsys.stderr.write("[adr-next] stub: cannot answer\\n")\nsys.exit(5)\n', { mode: 0o755 })
  const corpus = path.join(temp, 'corpus')
  cpSync(path.join(testDir, 'fixtures', 'foreign'), corpus, { recursive: true })
  const env = { ...process.env, GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@example.invalid',
    GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@example.invalid' }
  for (const args of [['init', '-q', '-b', 'main', '.'], ['add', '.'], ['commit', '-qm', 'fixture']]) {
    const r = spawnSync('git', args, { cwd: corpus, env, encoding: 'utf8', timeout: 60_000 })
    assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`)
  }
  const script = path.join(plugin, 'scripts', 'work-next.mjs')
  const text = spawnSync(process.execPath, [script, corpus], { encoding: 'utf8', timeout: 120_000 })
  assert.equal(text.status, 0, text.stderr)
  assert.match(text.stdout, /readiness there is UNPROVEN/, text.stdout)
  assert.doesNotMatch(text.stdout, /Nothing in the QH corpus is waiting/, `unread directories are not an all-clear: ${text.stdout}`)
  const json = JSON.parse(spawnSync(process.execPath, [script, '--json', corpus], { encoding: 'utf8', timeout: 120_000 }).stdout)
  assert.ok(json.readinessUnproven.length >= 1, JSON.stringify(json.readinessUnproven))
  // CLEAN: the real plugin's adr-next answers, so nothing is UNPROVEN — a
  // failure-only CLI test cannot show the sentence is conditional (Codex, 1032720).
  const real = path.join(repoRoot, 'plugin', 'scripts', 'work-next.mjs')
  const clean = spawnSync(process.execPath, [real, corpus], { encoding: 'utf8', timeout: 120_000 })
  assert.equal(clean.status, 0, clean.stderr)
  assert.doesNotMatch(clean.stdout, /readiness there is UNPROVEN/, clean.stdout)
  assert.deepEqual(JSON.parse(spawnSync(process.execPath, [real, '--json', corpus], { encoding: 'utf8', timeout: 120_000 }).stdout).readinessUnproven, [])
})

test("a directory two records share offers only the Accepted record's task", () => {
  // Codex review of 1032720: the Accepted-only filter over adr-next's answer was
  // removed as redundant, and it was not — adr-next reads every task in a
  // directory, and a directory an Accepted and a Proposed record share hands the
  // Proposed record's task back too. Ownership is per task, not per directory.
  const temp = mkdtempSync(path.join(os.tmpdir(), 'qh-readiness-shared-')); temps.push(temp)
  const adr = path.join(temp, 'docs', 'adr')
  mkdirSync(path.join(adr, 'tasks'), { recursive: true })
  const record = (id, status) => `# ${id}: probe\n\n**Status:** ${status}\n**Date:** 2026-09-23\n\n## Context\n\nx\n\n## Decision\n\ny\n`
  writeFileSync(path.join(adr, 'ADR-001-accepted.md'), record('ADR-001', 'Accepted'))
  writeFileSync(path.join(adr, 'ADR-002-proposed.md'), record('ADR-002', 'Proposed'))
  const task = id => `# Task ${id}: probe\n\n**Depends-on:** none\n\n## Acceptance\n\n\`\`\`bash\ntrue\n\`\`\`\n\n## Verification Log\n\n`
  writeFileSync(path.join(adr, 'tasks', 'T1.md'), task('ADR-001-T1'))
  writeFileSync(path.join(adr, 'tasks', 'T2.md'), task('ADR-002-T2'))
  const env = { ...process.env, GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@example.invalid',
    GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@example.invalid' }
  for (const args of [['init', '-q', '-b', 'main', '.'], ['add', '.'], ['commit', '-qm', 'fixture']]) {
    const r = spawnSync('git', args, { cwd: temp, env, encoding: 'utf8', timeout: 60_000 })
    assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`)
  }
  const state = observe(temp)
  assert.deepEqual(state.ready.map(f => path.basename(f)), ['T1.md'],
    `only the Accepted record's task is ready:\n${state.ready.join('\n')}`)
  assert.ok(state.notYetDecided.some(f => f.endsWith('T2.md')),
    "the Proposed record's task is named as waiting on the decision, not dropped")
})

// BACKLOG §288, a cold review of 833ea52: with an archive's README spelled
// `readme.md`, whether the directory is frozen is UNKNOWN — SessionStart says so —
// and work-next listed its done-claimed task as unbacked work instead. The twin:
// the same tree with no archive marker at all is live, and its task IS listed.
test('a task under an archive whose README spelling is ambiguous is unproven, not work', () => {
  const build = readme => {
    const temp = mkdtempSync(path.join(os.tmpdir(), 'qh-readiness-readme-')); temps.push(temp)
    const adr = path.join(temp, 'docs', 'adr')
    const arc = path.join(temp, 'docs', 'adr-archive')
    mkdirSync(path.join(adr), { recursive: true })
    mkdirSync(path.join(arc, 'ADR-000-old', 'tasks'), { recursive: true })
    writeFileSync(path.join(adr, 'ADR-001-live.md'), '# ADR-001: live\n\n**Status:** Accepted\n**Date:** 2026-09-25\n\n## Context\n\nx\n\n## Decision\n\ny\n')
    writeFileSync(path.join(arc, 'ADR-000-old.md'), '# ADR-000: old\n\n**Status:** Accepted\n**Date:** 2026-07-01\n\n## Context\n\nx\n\n## Decision\n\ny\n')
    writeFileSync(path.join(arc, readme.name), readme.text)
    writeFileSync(path.join(arc, 'ADR-000-old', 'tasks', 'T1-old.md'), '# Task ADR-000-T1: old\n\n**Status:** done\n\n## Acceptance\n\n```bash\ntrue\n```\n\n## Verification Log\n\n')
    const env = { ...process.env, GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@example.invalid',
      GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@example.invalid' }
    for (const args of [['init', '-q', '-b', 'main', '.'], ['add', '.'], ['commit', '-qm', 'fixture']]) {
      const r = spawnSync('git', args, { cwd: temp, env, encoding: 'utf8', timeout: 60_000 })
      assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`)
    }
    return observe(temp)
  }
  const ambiguous = build({ name: 'readme.md', text: '# ADR Archive\n\n**Lifecycle:** Frozen historical ADR records\n' })
  assert.deepEqual(ambiguous.unbacked.filter(f => f.endsWith('T1-old.md')), [], 'an undecided archive task is not unbacked work')
  assert.ok(ambiguous.readinessUnproven.some(d => d.endsWith(path.join('ADR-000-old', 'tasks'))),
    `its directory is named as unproven: ${ambiguous.readinessUnproven}`)
  const live = build({ name: 'NOTES.md', text: '# notes\n' })
  assert.ok(live.unbacked.some(f => f.endsWith('T1-old.md')), `with no archive question, the task is live: ${live.unbacked}`)
  assert.deepEqual(live.readinessUnproven.filter(d => d.includes('ADR-000-old')), [])
})

// BACKLOG §281 item 7, reported from Windows: workNext.next named `adr-verify` for a
// task whose moved test lock needs `--relock --replace-hashes` first, so the step it
// named would be refused. adr-next's note already said why; work-next dropped it.
test('work-next names the relock remedy when a claimed-done task is withheld by a moved lock', () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), 'qh-readiness-relock-')); temps.push(temp)
  const tasks = path.join(temp, 'docs', 'adr', 'ADR-001-x', 'tasks')
  mkdirSync(tasks, { recursive: true })
  writeFileSync(path.join(temp, 'docs', 'adr', 'ADR-001-x.md'), '# ADR-001: x\n\n**Status:** Accepted\n\n## Context\n\nx\n\n## Decision\n\ny\n')
  const file = path.join(tasks, 'T1-a.md')
  writeFileSync(file, '# Task ADR-001-T1: a\n\n**Status:** done\n\n## Verification Log\n\n- 2026-09-20 · abc1234 · exit 0 · `true`\n')
  assert.equal(spawnSync('git', ['init', '-q', '-b', 'main', '.'], { cwd: temp, encoding: 'utf8', timeout: 60_000 }).status, 0)
  const note = 'carries exit-0 evidence for this Acceptance, but its test lock withholds done — locked test `t.py`::x hash moved — done is refused; '
    + 'once the change to the test is reviewed, `adr-verify --relock --replace-hashes` re-locks it; `adr-lint` names the remedy'
  const spawnWith = unproven => () => answer(0, [{ id: 'T1', path: file, unproven }])
  const capture = spawn => {
    const written = []
    const real = process.stdout.write.bind(process.stdout)
    process.stdout.write = chunk => { written.push(String(chunk)); return true }
    try { main([temp, '--json'], { spawn }) } finally { process.stdout.write = real }
    return JSON.parse(written.join(''))
  }
  const json = capture(spawnWith(note))
  assert.equal(json.next?.id, 'adr-verify')
  assert.equal(json.next?.remedy, 'adr-verify --relock --replace-hashes docs/adr/ADR-001-x/tasks/T1-a.md — once the change to the test is reviewed')
  // The must-fail direction: an unbacked task withheld for another reason keeps the bare step.
  assert.equal(capture(spawnWith('carries exit-0 evidence recorded against a different Acceptance')).next?.remedy, undefined)
  const written = []
  const real = process.stdout.write.bind(process.stdout)
  process.stdout.write = chunk => { written.push(String(chunk)); return true }
  try { main([temp], { spawn: spawnWith(note) }) } finally { process.stdout.write = real }
  assert.match(written.join(''), /1 of these carry a moved test lock, which bare `adr-verify` would refuse again: adr-verify --relock --replace-hashes /)
})

// BACKLOG §280 item 4, a Windows 72-record corpus: after §279 item 8 three tasks sat
// in both `ready` and `unbacked`. Both are true — not done, so startable; claimed
// done without evidence — but one answer said both about one task and marked nothing.
test('work-next marks a task that is both READY and claimed done without evidence', () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), 'qh-readiness-both-')); temps.push(temp)
  const tasks = path.join(temp, 'docs', 'adr', 'ADR-001-x', 'tasks')
  mkdirSync(tasks, { recursive: true })
  writeFileSync(path.join(temp, 'docs', 'adr', 'ADR-001-x.md'), '# ADR-001: x\n\n**Status:** Accepted\n\n## Context\n\nx\n\n## Decision\n\ny\n')
  const claimed = path.join(tasks, 'T1-a.md')
  const plain = path.join(tasks, 'T2-b.md')
  writeFileSync(claimed, '# Task ADR-001-T1: a\n\n**Status:** done\n\n## Verification Log\n\n')
  writeFileSync(plain, '# Task ADR-001-T2: b\n\n## Verification Log\n\n- 2026-09-20 · abc1234 · exit 0 · `true`\n')
  assert.equal(spawnSync('git', ['init', '-q', '-b', 'main', '.'], { cwd: temp, encoding: 'utf8', timeout: 60_000 }).status, 0)
  const spawn = () => answer(0, [{ id: 'T1', path: claimed }, { id: 'T2', path: plain }])
  const run = argv => {
    const written = []
    const real = process.stdout.write.bind(process.stdout)
    process.stdout.write = chunk => { written.push(String(chunk)); return true }
    try { main(argv, { spawn }) } finally { process.stdout.write = real }
    return written.join('')
  }
  // Native separators, like work-next's other path fields; the probe normalises them.
  const posix = value => value.replaceAll('\\', '/')
  assert.deepEqual(JSON.parse(run([temp, '--json'])).readyButClaimedDone.map(posix), ['docs/adr/ADR-001-x/tasks/T1-a.md'])
  assert.match(posix(run([temp])), /1 task is both READY and claimed done without evidence — `adr-verify` it first:\n {2}docs\/adr\/ADR-001-x\/tasks\/T1-a\.md\n/)
})
