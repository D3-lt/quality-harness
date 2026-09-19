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
