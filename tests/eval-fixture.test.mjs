// The generator that makes a corpus-backed eval case possible.
//
// `add_dirs` is the only fixture mechanism measured to work (2026-08-27): an
// absolute path scored 1.00 with the model reading a real corpus, a relative
// path 0.00, `${CLAUDE_PLUGIN_ROOT}` 0.00, and `scaffold_script` under
// `--scaffold` left the agent's cwd empty. An absolute path names one machine,
// so the case is generated rather than committed — and this suite is what keeps
// the generator honest, because a rendered case with a wrong path fails as a
// skill finding rather than as a broken fixture.
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { CORPUS_PARTS, grantsFor, main, measure, render, snapshot } from '../scripts/eval-fixture.mjs'

function corpus(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'qh-fixture-test-'))
  for (const [relative, body] of Object.entries(files)) {
    const full = path.join(root, relative)
    mkdirSync(path.dirname(full), { recursive: true })
    writeFileSync(full, body)
  }
  return root
}

test('the corpus is copied, never referenced', () => {
  // A case grants Bash, and an agent with Bash plus an absolute path into a live
  // repository can write to it. Everything after the snapshot happens to a copy.
  const source = corpus({ 'docs/adr/ADR-001-a.md': '# a\n', 'src/main.rs': 'fn main() {}\n' })
  const into = mkdtempSync(path.join(tmpdir(), 'qh-fixture-into-'))
  try {
    const taken = snapshot(source, into)
    assert.deepEqual(taken, ['docs/adr'])
    assert.equal(readFileSync(path.join(into, 'docs/adr/ADR-001-a.md'), 'utf8'), '# a\n')
    // The source tree is irrelevant to every case this generates, and copying it
    // would make a 400MB fixture out of a 2MB one.
    assert.throws(() => readFileSync(path.join(into, 'src/main.rs')))
    // And the original is untouched — the whole point of copying.
    assert.equal(readFileSync(path.join(source, 'src/main.rs'), 'utf8'), 'fn main() {}\n')
  } finally {
    rmSync(source, { recursive: true, force: true })
    rmSync(into, { recursive: true, force: true })
  }
})

test('a corpus holding none of the known parts is refused, not silently empty', () => {
  const source = corpus({ 'README.md': '# nothing here\n' })
  try {
    assert.deepEqual(snapshot(source, mkdtempSync(path.join(tmpdir(), 'qh-empty-'))), [])
    assert.ok(CORPUS_PARTS.includes('docs/adr'), 'docs/adr is the part that matters')
  } finally {
    rmSync(source, { recursive: true, force: true })
  }
})

test('records and task files are counted apart, including nested task directories', () => {
  // The case states its own scale in the prompt, so a wrong count is a lie told
  // to the model about the corpus it is being handed.
  const source = corpus({
    'docs/adr/ADR-001-a.md': '#\n',
    'docs/adr/ADR-002-b.md': '#\n',
    'docs/adr/ADR-002-b/tasks/T1-x.md': '#\n',
    'docs/adr/ADR-002-b/tasks/README.md': '#\n',
    'docs/adr/notes.txt': 'ignored\n',
  })
  try {
    assert.deepEqual(measure(source), { records: 2, tasks: 2 })
  } finally {
    rmSync(source, { recursive: true, force: true })
  }
})

test('a placeholder with no value is left alone rather than blanked', () => {
  // A blanked placeholder produces `add_dirs: - ""`, which resolves to nothing
  // and reports as a skill that could not find the corpus. Leaving it visible
  // makes the generator's own gap legible in the rendered file.
  assert.equal(render('a {{CORPUS}} b {{NOPE}}', { CORPUS: '/tmp/x' }), 'a /tmp/x b {{NOPE}}')
  assert.equal(render('{{RECORDS}} record(s)', { RECORDS: 171 }), '171 record(s)')
})

test('an unknown option is named, and --list asks nothing about a corpus', () => {
  // Exit code alone cannot carry this: a missing `--corpus` ALSO returns 2, so
  // an assertion on the number passes with the unknown-option guard deleted.
  // Caught by mutation `fixture: an unknown option is named, not ignored`, which
  // stayed GREEN against the first version of this test — the same shape as the
  // flush mutation and the router guard earlier the same day. Assert the message.
  const said = []
  const err = process.stderr.write.bind(process.stderr)
  process.stderr.write = chunk => { said.push(String(chunk)); return true }
  try {
    assert.equal(main(['--nope']), 2, 'an unknown option must not be ignored')
    assert.match(said.join(''), /unknown option: --nope/,
      'the offending option has to be named; "2" is not a diagnosis')
    said.length = 0
    assert.equal(main([]), 2, '--corpus is required for a generate run')
    assert.match(said.join(''), /--corpus <dir> is required/)
    assert.doesNotMatch(said.join(''), /unknown option/,
      'a missing --corpus is not an unknown option; conflating them is what let the guard rot')
  } finally {
    process.stderr.write = err
  }

  const written = []
  const write = process.stdout.write.bind(process.stdout)
  process.stdout.write = chunk => { written.push(String(chunk)); return true }
  try {
    // Listing templates needs no corpus; demanding one refuses the cheapest
    // question the tool answers.
    assert.equal(main(['--list']), 0)
  } finally {
    process.stdout.write = write
  }
  assert.match(written.join(''), /adr-against-a-real-corpus/)
})

test('a corpus path that is not a directory is refused before anything is copied', () => {
  assert.equal(main(['--corpus', path.join(tmpdir(), 'definitely-not-here-9f3a')]), 2)
})

test('the printed command grants every gated tool the cases declare', () => {
  // `allowed_tools:` declares; only `--allow-tools` grants. Measured 2026-08-27:
  // a case declaring Write and Edit ran under `--allow-tools Bash`, the runner
  // said "not granted … Write, Edit" on its first line, the model could not
  // write, and both behavioural graders failed for a reason about the
  // invocation rather than about the model. docs/BACKLOG.md finding B already
  // recorded that trap; it was read the same day and walked into anyway, which
  // is the argument for deriving the command instead of remembering it.
  assert.deepEqual(
    grantsFor(['execution:\n  allowed_tools: [Read, Glob, Bash, Write, Edit, Skill]\n']),
    ['Bash', 'Edit', 'Write'],
    'ungated tools like Read and Skill must not be padded into the grant')

  // The block form the generator's own template does not use, but a hand-written
  // one might — a parser that reads only the inline form would silently grant
  // nothing and put us straight back where this started.
  assert.deepEqual(
    grantsFor(['execution:\n  allowed_tools:\n    - Bash\n    - Skill\n  max_turns: 4\n']),
    ['Bash'])

  // A case wanting nothing gated gets no flag rather than an empty one.
  assert.deepEqual(grantsFor(['execution:\n  allowed_tools: [Read, Skill]\n']), [])

  // MCP tools are gated by the same operator grant and are not in the static set.
  assert.deepEqual(grantsFor(['  allowed_tools: [mcp__thing__do, Read]\n']), ['mcp__thing__do'])
})
