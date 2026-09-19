// "Said once per session", and what makes a session new again.
//
// Five catalogue mutants against this machinery SURVIVED the branch's first CI run
// (2026-09-19) while `main` killed all five. Nothing was wrong with the tests that
// remained: the branch had deleted `advise()`, the per-session advisory path that
// `deliver()` replaced, and with it `compaction makes a once-per-session finding
// first again` — the only SEQUENTIAL exercise this code had. What is left calls
// `alreadyMentionedThisSession` first, so the exclusive-create arm below is reached
// only by two parallel tool calls racing, which no test does.
//
// The machinery is still live — the decision context on a session's first edit of a
// governed file goes through it — so it is tested here directly, through the CLI
// seam the hooks themselves use, across real processes.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { readSessionNote, replaceSessionNote } from '../plugin/scripts/lifecycle.mjs'

const lifecycleScript = join(resolve(dirname(fileURLToPath(import.meta.url)), '..'), 'plugin', 'scripts', 'lifecycle.mjs')

test('a finding is first once per session, and a compaction or /clear makes the session new', () => {
  const top = realpathSync.native(mkdtempSync(join(tmpdir(), 'qh-said-once-')))
  try {
    const env = { ...process.env, TMPDIR: top, TMP: top, TEMP: top, CLAUDE_PLUGIN_DATA: join(top, 'data') }
    const session = `said-once-${process.pid}`
    const first = key => spawnSync(process.execPath, [lifecycleScript, '--first-mention', session, key],
      { encoding: 'utf8', timeout: 60_000, env }).status === 0
    const sessionStart = source => {
      const out = spawnSync(process.execPath, [lifecycleScript], { cwd: top, encoding: 'utf8', timeout: 120_000, env,
        input: JSON.stringify({ hook_event_name: 'SessionStart', source, session_id: session, cwd: top }) })
      assert.equal(out.status, 0, out.stderr)
    }
    assert.equal(first('k'), true, 'the first mention is first')
    assert.equal(first('k'), false, 'the second is not — sequentially, with no race to hide behind')
    assert.equal(first('other'), true, 'a different finding is its own first')

    // A resume continues the same context: what was said is still said.
    sessionStart('resume')
    assert.equal(first('k'), false, 'a resume does not make the session new')
    // A compaction REPLACES the context: whatever was said is gone from it.
    sessionStart('compact')
    assert.equal(first('k'), true, 'after a compaction the finding is first again')
    assert.equal(first('k'), false)
    // And so does /clear.
    sessionStart('clear')
    assert.equal(first('k'), true, 'after /clear the finding is first again')
  } finally { rmSync(top, { recursive: true, force: true }) }
})

test('a session note that cannot be replaced is removed, never left to be handed back as current', () => {
  const session = `note-${process.pid}-${Date.now()}`
  try {
    // The control: an ordinary replace keeps the new note.
    assert.equal(replaceSessionNote(session, { at: 'earlier', text: 'the EARLIER compaction' }), true)
    assert.equal(readSessionNote(session)?.text, 'the EARLIER compaction')
    // A write that fails: a full disk, a directory the host made read-only.
    const failing = () => { const error = new Error('no space left on device'); error.code = 'ENOSPC'; throw error }
    assert.equal(replaceSessionNote(session, { at: 'later', text: 'never written' }, failing), false)
    assert.equal(readSessionNote(session), null, 'the earlier note is gone: a stale note read as current is worse than none')
  } finally { replaceSessionNote(session, null) }
})
