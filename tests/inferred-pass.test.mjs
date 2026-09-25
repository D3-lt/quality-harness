// A pass from a check this tool GUESSED is said to be one, where the pass is recorded.
//
// Before a check runs, every message leads with the caveat: "no `check` is declared
// … inferred `pnpm test` from a manifest — that is not this project's own check."
// After it passed, the caveat was gone. The session note said "a `qh-check` passed
// on them", the status line said `QH ✓ checked`, and nothing distinguished that
// from a pass of the project's declared gate.
//
// A peer with a polyglot monorepo showed why it matters (2026-09-19): its root
// manifest is JS, so inference lands on `pnpm test` — which runs no PHP tests, no
// lint, no typecheck and no OpenAPI drift gate, while the PHP half holds every
// payment and booking invariant. That command is GREEN WHILE THE PROJECT IS RED.
// The harness was honest about the guess before the check and silent about it after,
// which is the moment the guess starts certifying things. `origin` was already on
// every check event; nothing read it.
import assert from 'node:assert/strict'
import test from 'node:test'
import { observedFacts, sessionOrientation, sessionStateNote } from '../plugin/scripts/lifecycle.mjs'
import { spawnSync } from 'node:child_process'
import { reading, render } from '../plugin/scripts/statusline.mjs'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const observation = tree => ({ ok: true, tree, index: `index-${tree}`, head: 'HEAD0' })
const log = origin => Object.assign([
  { event: 'session.started', observation: observation('T0') },
  { event: 'check.passed', record: 'r1', seq: 1, startedAt: '2026-09-19T11:59:45.000Z',
    before: observation('T1'), after: observation('T1'), exit: 0, command: 'pnpm test', origin },
], { complete: true })
const noteFor = origin => {
  const facts = observedFacts(log(origin), null, observation('T1'))
  return { facts, note: sessionStateNote({ ...facts, files: ['/x/a.md'] }, '/x', '/x', true, new Date(), { tasks: false }) }
}

test('a pass of an INFERRED check says so in the note a session is handed', () => {
  // The control: a DECLARED check that passed is credited plainly, with no caveat.
  const declared = noteFor('declared')
  assert.equal(declared.note.status, 'verified')
  assert.match(declared.note.text, /a `qh-check` passed on them/)
  assert.doesNotMatch(declared.note.text, /inferred/i)

  const inferred = noteFor('inferred')
  assert.equal(inferred.facts.checkOrigin, 'inferred')
  assert.match(inferred.note.text, /inferred/i, `the caveat must survive the pass: ${inferred.note.text}`)
  assert.match(inferred.note.text, /pnpm test/, 'and name the command that was guessed')
  assert.match(inferred.note.text, /declare/i, 'and the remedy')
  // Still a pass: this is a caveat on what the pass is worth, not a refusal of it.
  assert.equal(inferred.note.status, 'verified')
})

test('the status line marks a tick that an inferred check earned', () => {
  const dir = mkdtempSync(join(tmpdir(), 'qh-inferred-sl-'))
  try {
    writeFileSync(join(dir, '.quality-harness.json'), JSON.stringify({ check: 'sh check.sh' }))
    const at = '2026-09-19T12:00:00.000Z'
    const shown = (origin, session) => render(reading({ session_id: session, workspace: { current_dir: dir } },
      { read: () => Object.assign([...log(origin), { at, event: 'turn.ended', observation: observation('T1') }], { complete: true }),
        now: Date.parse(at) + 10_000 }))
    assert.match(shown('declared', `inf-d-${process.pid}`), /^QH ✓ checked ·/, 'a declared pass is a plain tick')
    assert.match(shown('inferred', `inf-i-${process.pid}`), /^QH ✓ checked \(inferred check\)/)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

// BACKLOG §244. "Inferred" disclosed that the command was a guess about IDENTITY
// and nothing about it being a SUBSET: a manifest that names `test` says nothing
// of the typecheck or lint step the project's own gate also runs, and a pass of
// the part reads, from the gate's side, like a pass of the whole.
test('the orientation says an inferred check may be narrower than the project gate', () => {
  const repo = mkdtempSync(join(tmpdir(), 'qh-narrower-'))
  try {
    spawnSync('git', ['init', '-q', repo], { encoding: 'utf8', timeout: 60_000 })
    // A manifest that DOES name a lint step: the sentence said the manifest "does not
    // name" one, which was false there (BACKLOG §281 item 8, a React frontend on Windows).
    writeFileSync(join(repo, 'package.json'), JSON.stringify({ scripts: { test: 'vitest', lint: 'eslint .' } }))
    const inferred = sessionOrientation(repo)
    assert.match(inferred, /inferred `npm run test`/)
    assert.match(inferred, /may be narrower than this project's own gate/)
    assert.match(inferred, /\(a step the inference did not pick, such as a typecheck or lint\)/)
    assert.doesNotMatch(inferred, /the manifest does not name/)
    // A declared check is the project's own word, and gets no such caveat.
    writeFileSync(join(repo, '.quality-harness.json'), JSON.stringify({ check: 'npm run test' }))
    assert.doesNotMatch(sessionOrientation(repo), /narrower/)
  } finally { rmSync(repo, { recursive: true, force: true }) }
})
