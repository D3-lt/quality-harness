// ADR-092 T5 (Decision 8): no code-block line is a Status, and a fence opened inside a whole
// document's frontmatter hides nothing below the block. record.py and lifecycle.mjs read every
// text here, and each expected value is written down per text, never computed by a copy of the
// rule under test.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { runPython } from '../scripts/python-interpreter.mjs'
// The reader of the decision corpus, once part of lifecycle.mjs (BACKLOG section 375, stage B2): the local name stays, so no test body changes.
import * as lifecycle from '../plugin/scripts/decision-corpus.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const lib = join(repoRoot, 'plugin', 'lib')
const adrLint = join(repoRoot, 'plugin', 'bin', 'adr-lint')

// Patterns live at module scope, never inside a test body: the test-lock hasher masks strings and
// comments, and a regex literal in a body can derail it (adr-execute lessons, 2026-09-16).
const OFF_GRAMMAR = /Verification Log entry doesn't match/
const FENCE = '```'
const TILDES = '~~~'

// One Python process per question: `op` is `status` (record_status's value for each text) or
// `log` (unfenced_lines over each text's `## Verification Log` section).
const PY = [
  'import json, sys',
  'sys.path.insert(0, sys.argv[1])',
  'import record',
  'op, texts = json.loads(sys.stdin.buffer.read().decode("utf-8"))',  // Windows' stdin is cp1252; a log row holds `·`
  'if op == "status":',
  '    print(json.dumps([record.record_status(t)[0] for t in texts]))',
  'else:',
  '    print(json.dumps([record.unfenced_lines(record.sections_of(t).get("Verification Log", [])) for t in texts]))',
].join('\n')
function python(op, texts) {
  const r = runPython(['-c', PY, lib], { input: JSON.stringify([op, texts]), encoding: 'utf8', timeout: 60_000 })
  assert.equal(r.status, 0, `python could not run: ${r.stderr}`)
  return JSON.parse(r.stdout)
}
const pyStatus = texts => python('status', texts)
const jsStatus = texts => texts.map(text => lifecycle.recordStatus(text))

// A record whose `## Status` section holds `lines`, then a `## Decision`.
const sectioned = (number, lines) => `# ADR-${number}: X\n\n## Status\n\n${lines.join('\n')}\n\n## Decision\n\nx\n`
// ADR-092 rows R2, R35 and R36, and R3 (R2 unindented).
const R2 = sectioned('002', ['    Accepted'])
const R3 = sectioned('003', ['Accepted'])
const R35 = sectioned('035', [`    ${FENCE}`, 'Accepted', `    ${FENCE}`])
const R36 = sectioned('036', [FENCE, 'Accepted', FENCE])
// ADR-092 row R9: a YAML literal holding an unmatched fence marker above a top-level `status:`.
const R9 = `---\nnotes: |\n  ${FENCE}\nstatus: accepted\n---\n# ADR-007: X\n\n## Decision\n\nx\n`

const temps = []
test.after(() => { for (const dir of temps) rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }) })

test('no indented code-block line is a Status, section form included', () => {
  const texts = [R2, sectioned('004', ['\tAccepted']), R3,
    '# ADR-005: X\n\n    **Status:** Accepted\n\n## Decision\n\nx\n']
  const expected = ['', '', 'Accepted', null]
  assert.deepStrictEqual(pyStatus(texts), expected)
  assert.deepStrictEqual(jsStatus(texts), expected)
})

test('a fenced line in a Status section is no Status, indented fence or not', () => {
  const texts = [R35, R36, sectioned('037', [TILDES, 'Accepted', TILDES]),
    sectioned('038', [FENCE, 'Proposed', FENCE, 'Accepted']),
    sectioned('039', [`    ${TILDES}`, 'Proposed', `    ${TILDES}`, '', 'Accepted'])]
  const expected = ['', '', '', 'Accepted', 'Accepted']
  assert.deepStrictEqual(pyStatus(texts), expected)
  assert.deepStrictEqual(jsStatus(texts), expected)
})

test('a fence opened inside the frontmatter hides nothing below it', () => {
  const texts = [R9,
    `---\nnotes: |\n  ${FENCE}\ntitle: x\n---\n# ADR-008: X\n\n## Status\n\nProposed\n\n## Decision\n\nx\n`,
    `# ADR-009: X\n\n${FENCE}\nStatus: Accepted\n${FENCE}\n\n## Decision\n\nx\n`,
    `# ADR-010: X\n\n${FENCE}\n## Status\n\nAccepted\n${FENCE}\n`]
  const expected = ['accepted', 'Proposed', null, null]
  assert.deepStrictEqual(pyStatus(texts), expected)
  assert.deepStrictEqual(jsStatus(texts), expected)
})

test('a section that opens with a rule is not read as frontmatter', () => {
  const quoted = '- 2026-01-01 · abc · exit 1'
  const fenced = `---\n${FENCE}text\n${quoted}\n${FENCE}\n---\n`
  const bare = `---\n${quoted}\n---\n`
  const taskOf = log => `# Task ADR-007-T1: do\n\n**Depends-on:** none\n**Consumes:** none\n**Produces:** none\n\n`
    + `## Acceptance\n\n${FENCE}bash\nprintf T1\n${FENCE}\n\n## Verification Log\n${log}`
  const [hidden, shown] = python('log', [taskOf(fenced), taskOf(bare)])
  assert.ok(!hidden.includes(quoted), JSON.stringify(hidden))
  assert.ok(shown.includes(quoted), JSON.stringify(shown))
  // adr-lint reads the same section through the same walk: the fenced row is no entry, and the
  // same row unfenced is one it refuses (so the check can say dirty).
  const lint = log => {
    const repo = mkdtempSync(join(tmpdir(), 'qh-status-code-blocks-'))
    temps.push(repo)
    assert.equal(spawnSync('git', ['init', '-q'], { cwd: repo, timeout: 30_000, windowsHide: true }).status, 0)
    const tasks = join(repo, 'docs', 'adr', 'ADR-007-x', 'tasks')
    mkdirSync(tasks, { recursive: true })
    writeFileSync(join(repo, 'docs', 'adr', 'ADR-007-x.md'), '# ADR-007: X\n\n**Status:** Accepted\n\n## Context\n\nx\n\n## Decision\n\nx\n')
    writeFileSync(join(tasks, 'T1-a.md'), taskOf(log))
    const r = runPython([adrLint, join(repo, 'docs', 'adr', 'ADR-007-x.md')], { cwd: repo, encoding: 'utf8', timeout: 60_000 })
    return `${r.stdout}\n${r.stderr}`
  }
  assert.doesNotMatch(lint(fenced), OFF_GRAMMAR)
  assert.match(lint(bare), OFF_GRAMMAR)
})

test('indentation is measured in columns at four-column tab stops', () => {
  const indents = ['    ', '\t', ' \t', '  \t', '   \t', '   ']
  const texts = indents.map((indent, at) => sectioned(String(at + 11).padStart(3, '0'), [`${indent}Accepted`]))
  const expected = ['', '', '', '', '', 'Accepted']
  assert.deepStrictEqual(pyStatus(texts), expected)
  assert.deepStrictEqual(jsStatus(texts), expected)
})

test('an empty Status section reads an empty string and no Status reads null', () => {
  const texts = [R2, R35, R36, '# ADR-020: X\n\n## Decision\n\nx\n']
  const py = pyStatus(texts)
  const js = jsStatus(texts)
  for (const [index, want] of ['', '', '', null].entries()) {
    assert.strictEqual(py[index], want, `record.py, text ${index}`)
    assert.strictEqual(js[index], want, `lifecycle.mjs, text ${index}`)
  }
})
// The campaign entry "ADR-074 T2: lifecycle reads a ## Status inside a code fence" went GREEN once a
// section's fenced lines stopped being its value: a fenced example `## Status` followed by its fenced
// value reads '' under the mutant, which tests/status-section.test.mjs's row still calls ungoverning.
// Here the fence closes right after the heading, so a mutant that takes the fenced heading reads the
// unfenced line below it as a Status.
test('a Status heading inside a code fence opens no section', () => {
  const texts = [`# ADR-021: X\n\n${FENCE}\n## Status\n${FENCE}\n\nAccepted\n`]
  assert.deepStrictEqual(pyStatus(texts), [null])
  assert.deepStrictEqual(jsStatus(texts), [null])
})
