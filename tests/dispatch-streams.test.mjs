// Which STREAM a dispatcher verdict lands on is the contract, so it is asserted
// (docs/audits/2026-09-18-adr-060.md, B8).
//
// The commit and turn-end boundary runs the dispatcher in a batch and reads its two
// streams differently: stdout is parsed as JSON lines and everything else on it is
// dropped; stderr is the finding. So `UNPROVEN` — could-not-look — MUST be on stderr
// or it reaches nobody, which is the whole reason `say_unproven` exists.
//
// Every dispatcher assertion in tests/staged-product.test.mjs reads
// `${run.stdout}${run.stderr}`. Merged, a could-not-look written to the wrong stream
// is indistinguishable from one written to the right one, and an auditor showed the
// mutant that moves it survives the whole suite.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { resolveBashExecutable } from '../plugin/scripts/run-shell-hook.mjs'

const dispatcher = join(resolve(dirname(fileURLToPath(import.meta.url)), '..'), 'plugin', 'scripts', 'facts-gate-dispatch.sh')

test('could-not-look is on stderr, and a plain observation is on stdout', () => {
  const top = realpathSync.native(mkdtempSync(join(tmpdir(), 'qh-streams-')))
  try {
    const bash = resolveBashExecutable()
    assert.ok(bash, 'bash is needed to run the dispatcher')
    mkdirSync(join(top, 'docs'), { recursive: true })
    const notes = join(top, 'docs', 'notes.md')
    writeFileSync(notes, '# Some notes\n\nNothing about decisions.\n')
    const run = (file, boundary = '') => spawnSync(bash, [dispatcher, file, boundary], { encoding: 'utf8', timeout: 60_000 })

    // A file that was READ and is not a record: an observation, on stdout only.
    const plain = run(notes)
    assert.equal(plain.status, 0)
    assert.match(plain.stdout, /not-recognised: .*notes\.md/)
    assert.equal(plain.stderr, '', 'an ordinary Markdown file must never reach the finding stream')

    // A file that could NOT be looked at: on stderr, where the batch boundary reads.
    const missing = run(join(top, 'docs', 'never-written.md'))
    assert.equal(missing.status, 0)
    assert.match(missing.stderr, /UNPROVEN: could not classify .*never-written\.md/)
    assert.doesNotMatch(missing.stdout, /UNPROVEN/, 'an UNPROVEN left on stdout is dropped at the commit boundary')

    // And per edit, a file that is not a record costs nothing and says nothing.
    const perEdit = run(notes, 'PostToolUse')
    assert.equal(`${perEdit.stdout}${perEdit.stderr}`, '')
  } finally { rmSync(top, { recursive: true, force: true }) }
})

// BACKLOG §285: a tasks index titled `# ADR-007 tasks` matched the record-title
// arm, so adr-lint was handed the index and printed an UNPROVEN not-recognised on
// every commit touching one. It is now routed to the record that owns it — shown
// by the owning record's own failure reaching the output (the dirty twin), and by
// the index itself never being named as unreadable.
test('a tasks README is linted through its owning record, never as a record itself', () => {
  const top = realpathSync.native(mkdtempSync(join(tmpdir(), 'qh-readme-')))
  try {
    const bash = resolveBashExecutable()
    assert.ok(bash, 'bash is needed to run the dispatcher')
    const adr = join(top, 'docs', 'adr')
    mkdirSync(join(adr, 'ADR-007-a-thing', 'tasks'), { recursive: true })
    const readme = join(adr, 'ADR-007-a-thing', 'tasks', 'README.md')
    writeFileSync(readme, '# ADR-007 tasks\n\n| Task | Title | Status |\n|---|---|---|\n')
    const run = () => spawnSync(bash, [dispatcher, readme, ''], { encoding: 'utf8', timeout: 60_000 })

    // No owning record yet: the index has nothing of its own to say — the ownership
    // finding belongs to the task files, which carry it at commit.
    const orphan = run()
    assert.equal(`${orphan.stdout}${orphan.stderr}`, '', 'an ownerless index must not replace one noise line with another')

    // With a broken owning record, THAT record's lint is what the index reports.
    writeFileSync(join(adr, 'ADR-007-a-thing.md'), '# ADR-007: a thing\n\n**Status:** Accepted\n\n'
      + '## Existing Primitives Audit\n\n## Decision\n\n## Alternatives Considered\n\n## Consequences\n')
    const owned = run()
    const both = `${owned.stdout}${owned.stderr}`
    assert.doesNotMatch(both, /not-recognised: .*README\.md/, both)
    assert.match(both, /ADR-007-a-thing/, `the owning record must be what was linted:\n${both}`)
    assert.doesNotMatch(both, /not-recognised: .*README\.md/, both)
    assert.match(both, /ADR-007-a-thing\.md/, `the owning record must be what was linted:\n${both}`)
  } finally { rmSync(top, { recursive: true, force: true }) }
})
