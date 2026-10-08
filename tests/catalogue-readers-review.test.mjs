// The gpt-6.1-sol review of ADR-091's shipped readers. Each finding is a row here, through the same
// reader the review drove, with its twin beside it (CLAUDE.md §4):
// 1. adr-lint resolved an Enforced-by label from a per-source file the campaign refuses (an entry for
//    another source, a label repeated across files): a claim of enforcement nothing measures;
// 2. mutate-propose read an unreadable, oversized or non-JSON catalogue file as "no catalogue";
// 3. a listed catalogue path that is not a regular file was skipped, so the label was "a pointer to
//    nothing" instead of UNPROVEN;
// 4. a --tests directory written with backslashes did not match the normalized paths;
// 5. the template promised a grade "on every run", which a stale entry does not get.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { proposals, report } from '../plugin/scripts/mutate-propose.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const temps = []
test.after(() => { for (const dir of temps) rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }) })
const serialize = mutations => `${JSON.stringify({ mutations }, null, 2)}\n`
const entry = (label, file) => ({ label, file, tests: ['tests/x.test.mjs'], from: 'a', to: 'b' })

function scratch(files) {
  const dir = mkdtempSync(join(tmpdir(), 'qh-catalogue-review-'))
  temps.push(dir)
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, file)), { recursive: true })
    writeFileSync(join(dir, file), text)
  }
  return dir
}

const RECORD = pointer => ['# ADR-001: Probe', '', '**Status:** Accepted', '**Spec:** None — no spec stage',
  `**Enforced-by:** \`${pointer}\``, '**Served-path change:** None — this decision changes no served path.', '',
  '## Existing Primitives Audit', '', 'Nothing existing covers it.', '', '## Decision', '', 'Do the thing.', '',
  '## Alternatives Considered', '', '- Doing nothing — rejected, the bug persists.', '',
  '## Consequences', '', 'The thing is done.', '', '## Wiring & Contract Changes', '', 'None.', '',
  '## Out of Scope', '', '- The other thing (deferred: ADR-002)', ''].join('\n')
function enforcement(dir, pointer) {
  writeFileSync(join(dir, 'ADR-001-probe.md'), RECORD(pointer))
  spawnSync('git', ['init', '-q'], { cwd: dir, timeout: 30_000, windowsHide: true })
  const run = spawnSync('python3', [join(repoRoot, 'plugin', 'bin', 'adr-lint'), join(dir, 'ADR-001-probe.md')], { cwd: dir, encoding: 'utf8', timeout: 60_000, windowsHide: true })
  assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`)
  return run.stdout.split('\n').filter(line => line.includes('Enforced-by names')).join('\n')
}

test('adr-lint does not resolve a label from a per-source catalogue the campaign refuses', () => {
  const unproven = /Enforced-by names `probe`.*UNPROVEN/
  // An entry that mutates another source than its file names.
  assert.match(enforcement(scratch({ 'tests/mutations/x.mjs.json': serialize([entry('probe', 'y.mjs')]) }), 'probe'), unproven)
  // A label repeated across two files, and one repeated only by case.
  assert.match(enforcement(scratch({
    'tests/mutations/x.mjs.json': serialize([entry('probe', 'x.mjs')]),
    'tests/mutations/y.mjs.json': serialize([entry('probe', 'y.mjs')]),
  }), 'probe'), unproven)
  assert.match(enforcement(scratch({
    'tests/mutations/x.mjs.json': serialize([entry('probe', 'x.mjs')]),
    'tests/mutations.json': serialize([entry('PROBE', 'z.mjs')]),
  }), 'probe'), unproven)
  // A per-source file with no entries.
  assert.match(enforcement(scratch({ 'tests/mutations/x.mjs.json': serialize([]), 'tests/mutations.json': serialize([entry('probe', 'z.mjs')]) }), 'probe'), unproven)
  // The twin: a well-formed per-source file resolves, and says nothing.
  assert.equal(enforcement(scratch({ 'tests/mutations/x.mjs.json': serialize([entry('probe', 'x.mjs')]) }), 'probe'), '')
})

test('adr-lint says UNPROVEN for a listed catalogue path that is not a regular file', t => {
  if (process.platform === 'win32') { t.skip('a symlink needs privileges on Windows (CLAUDE.md §7)'); return }
  const dir = scratch({ 'tests/mutations/y.mjs.json': serialize([entry('probe', 'y.mjs')]) })
  symlinkSync('x.mjs.json', join(dir, 'tests', 'mutations', 'x.mjs.json'))
  const advice = enforcement(dir, 'probe')
  assert.match(advice, /Enforced-by names `probe`.*UNPROVEN.*tests\/mutations\/x\.mjs\.json/, advice)
  assert.ok(!advice.includes('pointer to nothing'), advice)
})

const SKILL = '---\nname: demo\ndescription: Use when the user asks to mark it done, tick off a task, or to audit a run\n---\n\n# Demo\n\nBody.\n'
const coverage = (root, options) => Object.fromEntries(proposals(root, options).map(found => [found.from, found.coverage]))

test('mutate-propose says a string is unproven, not neither, when a catalogue file could not be read', t => {
  const base = { 'bin/demo-gate': '#!/bin/sh\n', 'skills/demo/SKILL.md': SKILL, 'tests/demo.test.mjs': "assert.match(description, /to audit a run/)\n" }
  const notJson = scratch({ ...base, 'tests/mutations/skills/demo/SKILL.md.json': 'not json, though it says tick off a task\n' })
  assert.equal(coverage(notJson)['tick off a task'], 'unproven')
  const said = report(proposals(notJson), { all: true })
  assert.match(said, /2 unproven: a catalogue file could not be read \(tests\/mutations\/skills\/demo\/SKILL\.md\.json\)/, said)
  const oversized = scratch({ ...base, 'tests/mutations.json': `{"mutations": [], "pad": "${'x'.repeat(600 * 1024)}"}` })
  assert.equal(coverage(oversized)['tick off a task'], 'unproven')
  // The twin: every catalogue read, and the string is in none of them.
  const clean = scratch({ ...base, 'tests/mutations.json': serialize([]) })
  assert.equal(coverage(clean)['tick off a task'], 'unasserted')
  assert.equal(coverage(clean)['to audit a run'], 'asserted')
  if (process.platform === 'win32' || process.getuid?.() === 0) return
  const locked = scratch({ ...base, 'tests/mutations/skills/demo/SKILL.md.json': serialize([]) })
  chmodSync(join(locked, 'tests/mutations/skills/demo/SKILL.md.json'), 0o000)
  try { assert.equal(coverage(locked)['tick off a task'], 'unproven') } finally { chmodSync(join(locked, 'tests/mutations/skills/demo/SKILL.md.json'), 0o644) }
})

test('mutate-propose reads a --tests directory written with backslashes as the same directory', () => {
  const root = scratch({
    'bin/demo-gate': '#!/bin/sh\n', 'skills/demo/SKILL.md': SKILL,
    'qa/tests/demo.check.mjs': "assert.match(description, /to audit a run/)\n",
    'qa/tests/mutations/skills/demo/SKILL.md.json': JSON.stringify({ mutations: [{ label: 'l', file: 'skills/demo/SKILL.md', tests: ['qa/tests/demo.check.mjs'], from: 'tick off a task', to: 'x' }] }),
  })
  const forward = coverage(root, { testsDirectory: 'qa/tests' })
  assert.equal(forward['tick off a task'], 'catalogued')
  assert.equal(forward['to audit a run'], 'asserted')
  assert.deepEqual(coverage(root, { testsDirectory: 'qa\\tests' }), forward)
  assert.deepEqual(coverage(root, { testsDirectory: 'qa/tests/' }), forward)
})

test('the template does not promise a grade on every run', () => {
  const text = readFileSync(join(repoRoot, 'plugin', 'templates', 'adr-template.md'), 'utf8')
  assert.doesNotMatch(text, /RED or GREEN on every run/)
  assert.match(text, /STALE when its `from` no longer matches/)
})
