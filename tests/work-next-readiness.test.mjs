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
    return Object.assign(observe(temp), { temp })
  }
  const ambiguous = build({ name: 'readme.md', text: '# ADR Archive\n\n**Lifecycle:** Frozen historical ADR records\n' })
  assert.deepEqual(ambiguous.unbacked.filter(f => f.endsWith('T1-old.md')), [], 'an undecided archive task is not unbacked work')
  assert.ok(ambiguous.readinessUnproven.some(d => d.endsWith(path.join('ADR-000-old', 'tasks'))),
    `its directory is named as unproven: ${ambiguous.readinessUnproven}`)
  // And in BOTH outputs: the look is PARTIAL there, and the text returned before it
  // named anything (Codex review of 17edd2d).
  const cli = args => spawnSync(process.execPath, [path.join(repoRoot, 'plugin', 'scripts', 'work-next.mjs'), ...args, ambiguous.temp],
    { encoding: 'utf8', timeout: 120_000 })
  // Native separators on Windows (docs\adr-archive\…, CI at 026658a): compare in posix form.
  const posixText = value => value.replaceAll('\\', '/')
  assert.match(posixText(cli([]).stdout), /readiness UNPROVEN: docs\/adr-archive\/ADR-000-old\/tasks/, cli([]).stdout)
  assert.ok(JSON.parse(cli(['--json']).stdout).readinessUnproven.some(d => posixText(d).endsWith('ADR-000-old/tasks')))
  // And the PARTIAL says WHICH record made it partial, and why (BACKLOG §289 item 3).
  const partial = JSON.parse(cli(['--json']).stdout).partialBecause
  assert.ok(partial.some(entry => entry.file.endsWith('ADR-000-old.md') && /effect UNPROVEN/.test(entry.reason)), JSON.stringify(partial))
  assert.match(cli([]).stdout, /ADR-000-old\.md: frozen, effect UNPROVEN/)
  const live = build({ name: 'NOTES.md', text: '# notes\n' })
  assert.ok(live.unbacked.some(f => f.endsWith('T1-old.md')), `with no archive question, the task is live: ${live.unbacked}`)
  assert.deepEqual(live.readinessUnproven.filter(d => d.includes('ADR-000-old')), [])
  assert.deepEqual(JSON.parse(spawnSync(process.execPath, [path.join(repoRoot, 'plugin', 'scripts', 'work-next.mjs'), '--json', live.temp],
    { encoding: 'utf8', timeout: 120_000 }).stdout).partialBecause, [], 'a look that is not PARTIAL names nothing')
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
  // …and it says the overlap out loud, or one task in three lists reads as a contradiction (BACKLOG §289 item 2).
  assert.match(posix(run([temp])), /1 task is both READY and claimed done without evidence — `adr-verify` it first \(it is also counted among the ready tasks and the unbacked done claims\):\n {2}docs\/adr\/ADR-001-x\/tasks\/T1-a\.md\n/)
})

// BACKLOG §293, from a chaos round: a corpus whose only record carries a Status this
// reader cannot classify (a fullwidth colon) was routed as "No QH corpus is in use" —
// a confident negative over input it could not read. The twin: a repository with no
// record at all still is no corpus.
test('a record this reader cannot classify is not "no corpus"', () => {
  const repo = files => {
    const temp = mkdtempSync(path.join(os.tmpdir(), 'qh-undecided-')); temps.push(temp)
    for (const [rel, text] of Object.entries(files)) {
      mkdirSync(path.dirname(path.join(temp, rel)), { recursive: true })
      writeFileSync(path.join(temp, rel), text)
    }
    const env = { ...process.env, GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@example.invalid',
      GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@example.invalid' }
    for (const args of [['init', '-q', '-b', 'main', '.'], ['add', '.'], ['commit', '-qm', 'fixture', '--allow-empty']]) {
      const r = spawnSync('git', args, { cwd: temp, env, encoding: 'utf8', timeout: 60_000 })
      assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`)
    }
    const cli = args => spawnSync(process.execPath, [path.join(repoRoot, 'plugin', 'scripts', 'work-next.mjs'), ...args, temp],
      { encoding: 'utf8', timeout: 120_000 })
    return { text: cli([]).stdout, json: JSON.parse(cli(['--json']).stdout) }
  }
  const undecided = repo({ 'docs/adr/ADR-003-minimal.md': '# ADR-003: minimal\n\n**Status：** Accepted\n\n## Goal\n\nx\n' })
  assert.doesNotMatch(undecided.text, /No QH corpus is in use/, undecided.text)
  assert.match(undecided.text, /A QH corpus is in use here: 1 record\(s\) were found/, undecided.text)
  assert.notEqual(undecided.json.next?.id, 'core')
  const none = repo({ 'README.md': '# nothing here\n' })
  assert.match(none.text, /No QH corpus is in use/, none.text)
  assert.equal(none.json.next?.id, 'core')
})

// A chaos round, 2026-09-25 (two peers): a spec's Status was read from anywhere —
// a code fence, an HTML comment, across a newline, from binary bytes — and any
// value, even "banana", counted as a known status. Each shape here must be UNPROVEN,
// and the real template form (the Status mid-line after the date, and a quote of
// the header in inline code further down) must still read as Ready.
test('a spec Status is read only where it is a Status, and only as a known value', () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), 'qh-spec-status-')); temps.push(temp)
  const specs = {
    'good.md': '# S\n\n> **Date:** 2026-09-25 · **Status:** Ready-for-ADR\n\nA file with no `**Status:**` line is refused.\n',
    'draft.md': '# S\n\n**Status:** Draft\n',
    'fenced.md': '# S\n\n```\n**Status:** Ready-for-ADR\n```\n',
    'comment.md': '# S\n\n<!-- **Status:** Ready-for-ADR -->\n',
    'newline.md': '# S\n\n**Status:**\n## Ready-for-ADR\n',
    'two.md': '# S\n\n**Status:** Draft\n\n**Status:** Ready-for-ADR\n',
    'banana.md': '# S\n\n**Status:** banana\n',
    // Codex review of f905d8a: fence shapes one regex missed, a comment spanning
    // lines, and a value that only starts like a known one.
    'fourfence.md': '# S\n\n**Status:** Draft\n\n````\n**Status:** Ready-for-ADR\n````\n',
    'tildefence.md': '# S\n\n**Status:** Draft\n\n   ~~~\n**Status:** Ready-for-ADR\n   ~~~\n',
    'unclosed.md': '# S\n\n**Status:** Draft\n\n```\n**Status:** Ready-for-ADR\n',
    'crossing.md': '# S\n\n**Status:** <!--\ncomment\n-->Ready-for-ADR\n',
    'pending.md': '# S\n\n**Status:** Ready-for-ADR-pending\n',
    'noted.md': '# S\n\n**Status:** Draft — see the note below\n',
    // A shorter fence line inside a longer fence does not close it.
    'nested.md': '# S\n\n**Status:** Draft\n\n````\n```\n**Status:** Ready-for-ADR\n```\n````\n',
    // Round 2 (Windows): neither a code span nor a mid-paragraph comment crosses a
    // blank line, so a stray backtick or an unclosed `<!--` does not hide this Status.
    'stray.md': '# S\n\nUse a ` to quote.\n\n**Status:** Ready-for-ADR\n\nSee `x`.\n',
    'midcomment.md': '# S\n\nText <!-- not closed\n\n**Status:** Ready-for-ADR\n',
    // BACKLOG §295 item 23.2 (Windows, chaos round 2): shapes CommonMark renders as
    // code or markup. Each holds Draft plus a Ready inside the shape, so a reader that
    // saw the Ready would call it UNPROVEN (two values) — and a masked one reads Draft.
    'indented.md': '# S\n\n**Status:** Draft\n\n    **Status:** Ready-for-ADR\n',
    'tabbed.md': '# S\n\n**Status:** Draft\n\n\t**Status:** Ready-for-ADR\n',
    'indentedblock.md': '# S\n\n**Status:** Draft\n\n    x\n    **Status:** Ready-for-ADR\n',
    'listfence.md': '# S\n\n**Status:** Draft\n\n1. ```\n   **Status:** Ready-for-ADR\n   ```\n',
    'bulletfence.md': '# S\n\n**Status:** Draft\n\n- ~~~\n  **Status:** Ready-for-ADR\n  ~~~\n',
    'pre.md': '# S\n\n**Status:** Draft\n\n<pre>\n**Status:** Ready-for-ADR\n</pre>\n',
    'code.md': '# S\n\n**Status:** Draft\n\n<code>\n**Status:** Ready-for-ADR\n</code>\n',
    'attribute.md': '# S\n\n**Status:** Draft\n\n<div title="**Status:** Ready-for-ADR"></div>\n',
    'deepclose.md': '# S\n\n**Status:** Draft\n\n```\n        ```\n**Status:** Ready-for-ADR\n```\n',
    // Twins that must still read: an indented line continuing a paragraph is text, a
    // list fence that closed leaves the Status after it, and a bare attribute tail is
    // not a value.
    'lazy.md': '# S\n\nSome text\n    **Status:** Ready-for-ADR\n',
    // Codex review of the first cut: a top-level closer sits at most three spaces in,
    // and an unindented paragraph ends a list item and the fence it opened.
    'overindent.md': '# S\n\n**Status:** Draft\n\n   ```\n    ```\n**Status:** Ready-for-ADR\n   ```\n',
    'listended.md': '# S\n\n- ```\n  example\n\n**Status:** Ready-for-ADR\n',
    // A Windows chaos round (2.111.0-rc): CRLF left a `\r` on each line, so a blank line
    // was not blank and the same spec read differently in LF and CRLF.
    'crlf.md': 'Example:\r\n\r\n    **Status:** Ready-for-ADR\r\n\r\n**Status:** Draft\r\n',
    'listclosed.md': '# S\n\n1. ```\n   x\n   ```\n\n**Status:** Ready-for-ADR\n',
    'tail.md': '# S\n\n**Status:** Ready-for-ADR">\n',
  }
  mkdirSync(path.join(temp, 'docs', 'specs'), { recursive: true })
  for (const [name, text] of Object.entries(specs)) writeFileSync(path.join(temp, 'docs', 'specs', name), text)
  writeFileSync(path.join(temp, 'docs', 'specs', 'binary.md'),
    Buffer.concat([Buffer.from('504b0304', 'hex'), Buffer.from('**Status:** Ready-for-ADR\n'), Buffer.alloc(16, 0)]))
  const env = { ...process.env, GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@example.invalid',
    GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@example.invalid' }
  for (const args of [['init', '-q', '-b', 'main', '.'], ['add', '.'], ['commit', '-qm', 'fixture']]) {
    const r = spawnSync('git', args, { cwd: temp, env, encoding: 'utf8', timeout: 60_000 })
    assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`)
  }
  const state = observe(temp)
  const names = list => list.map(file => path.basename(file)).sort()
  assert.deepEqual(names(state.unprovenSpecs),
    ['banana.md', 'binary.md', 'comment.md', 'crossing.md', 'fenced.md', 'newline.md', 'pending.md', 'tail.md', 'two.md'])
  assert.deepEqual(names(state.uncoveredReadySpecs), ['good.md', 'lazy.md', 'listclosed.md', 'listended.md', 'midcomment.md', 'stray.md'],
    'the real template form still reads as Ready')
})

// A chaos round, 2026-09-25: `git ls-files` without `-z` C-quotes a name holding a
// control character, `"` or `\\`, so trackedPaths returned `"tab\\there.md"` in quotes
// and every reader dropped the file, naming it nowhere. The plain file is the twin.
test('a tracked file whose name git would quote is still listed', (t) => {
  if (process.platform === 'win32') {
    t.skip('Windows cannot create a file name holding a tab, a double quote or a backslash')
    return
  }
  const temp = mkdtempSync(path.join(os.tmpdir(), 'qh-quoted-names-')); temps.push(temp)
  mkdirSync(path.join(temp, 'docs', 'specs'), { recursive: true })
  // No backslash name: CLAUDE.md §7 normalises both separators before any structural
  // test on a path, so a literal `\\` in a POSIX name reads as a separator, by design.
  const names = ['plain.md', 'tab\there.md', 'quote"d.md', ' lead.md', 'nl\nx.md']
  for (const name of names) writeFileSync(path.join(temp, 'docs', 'specs', name), '# S\n\n**Status:** Draft\n')
  const env = { ...process.env, GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@example.invalid',
    GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@example.invalid' }
  for (const args of [['init', '-q', '-b', 'main', '.'], ['add', '.'], ['commit', '-qm', 'fixture']]) {
    const r = spawnSync('git', args, { cwd: temp, env, encoding: 'utf8', timeout: 60_000 })
    assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`)
  }
  assert.equal(observe(temp).specs, names.length, 'every tracked spec is counted, whatever git would quote')
})

// A Windows chaos round, 2026-09-25: a sparse checkout lists a task git tracks and
// leaves it off the disk. work-next counted it and named it nowhere, while
// SessionStart said UNPROVEN. Deleting the committed file from the working tree is
// the same shape without sparse-checkout: git lists it, the disk does not hold it.
test('a task git lists but the disk does not hold is unproven, not counted', () => {
  const build = remove => {
    const temp = mkdtempSync(path.join(os.tmpdir(), 'qh-absent-task-')); temps.push(temp)
    const adr = path.join(temp, 'docs', 'adr')
    mkdirSync(path.join(adr, 'ADR-007-x', 'tasks'), { recursive: true })
    writeFileSync(path.join(adr, 'ADR-007-x.md'), '# ADR-007: x\n\n**Status:** Accepted\n**Date:** 2026-09-25\n\n## Context\n\nx\n\n## Decision\n\ny\n')
    writeFileSync(path.join(adr, 'ADR-007-x', 'tasks', 'T1-a.md'), '# Task ADR-007-T1: a\n\n**Status:** done\n\n## Acceptance\n\n```bash\ntrue\n```\n\n## Verification Log\n\n')
    const env = { ...process.env, GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@example.invalid',
      GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@example.invalid' }
    for (const args of [['init', '-q', '-b', 'main', '.'], ['add', '.'], ['commit', '-qm', 'fixture']]) {
      const r = spawnSync('git', args, { cwd: temp, env, encoding: 'utf8', timeout: 60_000 })
      assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`)
    }
    if (remove) rmSync(path.join(adr, 'ADR-007-x', 'tasks'), { recursive: true, force: true })
    return Object.assign(observe(temp), { temp })
  }
  const absent = build(true)
  assert.equal(absent.tasks, 0, 'a task that is not on the disk is not counted')
  // Round 2 (Windows): with its tasks off the disk, the record does not read as one
  // with no task files, which routed to adr-write under the UNPROVEN line.
  const routed = JSON.parse(spawnSync(process.execPath, [path.join(repoRoot, 'plugin', 'scripts', 'work-next.mjs'), '--json', absent.temp],
    { encoding: 'utf8', timeout: 120_000 }).stdout)
  assert.notEqual(routed.next?.id, 'adr-write-no-tasks', JSON.stringify(routed.next))
  assert.ok(absent.readinessUnproven.some(dir => dir.endsWith(path.join('ADR-007-x', 'tasks'))), `named: ${absent.readinessUnproven}`)
  const present = build(false)
  assert.equal(present.tasks, 1)
  assert.deepEqual(present.readinessUnproven, [])
  assert.ok(present.unbacked.some(file => file.endsWith('T1-a.md')), 'the twin still reports the unbacked done claim')
})

// A chaos round (2.111.0-rc, CF1): under /m, `\s` crossed newlines, and the done-claim
// regex backtracked over a run of blank lines from every line start, so 10,000 blank
// lines in one task ran work-next past the probe's budget. The bound is generous: the
// fix answers in milliseconds, the defect in minutes.
test('a run of blank lines in a task does not stall the done-claim reader', () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), 'qh-blank-lines-')); temps.push(temp)
  const tasks = path.join(temp, 'docs', 'adr', 'ADR-001-x', 'tasks')
  mkdirSync(tasks, { recursive: true })
  writeFileSync(path.join(temp, 'docs', 'adr', 'ADR-001-x.md'), '# ADR-001: x\n\n**Status:** Accepted\n')
  writeFileSync(path.join(tasks, 'T1-x.md'), '# Task ADR-001-T1: x\n\n**Status:** Todo\n' + '\n'.repeat(4_000) + '## Acceptance\n')
  const env = { ...process.env, GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@example.invalid',
    GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@example.invalid' }
  for (const args of [['init', '-q', '-b', 'main', '.'], ['add', '.'], ['commit', '-qm', 'fixture']]) {
    const r = spawnSync('git', args, { cwd: temp, env, encoding: 'utf8', timeout: 60_000 })
    assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`)
  }
  const started = Date.now()
  observe(temp)
  assert.ok(Date.now() - started < 10_000, `work-next took ${Date.now() - started} ms over 4,000 blank lines`)
})
