// ADR-094 T4. A `file.written` for a path outside the repository was counted as a write git cannot
// see, so a scratchpad Write made the previous-session notice and the completion advice accuse a
// repository nothing had touched. `unseenWriteSince` already skipped such a path; the other reader
// did not. An unplaceable path is not an outside one (CLAUDE.md §16): it keeps its count.
import assert from 'node:assert/strict'
import test from 'node:test'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
// The judges and readers once held in lifecycle.mjs now live in modules of their own (BACKLOG section 375, stage B3): the local name stays, so no test body changes.
import * as lifecycleOwn from '../plugin/scripts/lifecycle.mjs'
import * as checkLedger from '../plugin/scripts/check-ledger.mjs'
import * as completionRules from '../plugin/scripts/completion-rules.mjs'
import { canonical, readEvents } from '../plugin/scripts/event-log.mjs'
const lifecycle = { ...lifecycleOwn, ...checkLedger, ...completionRules }

const unseen = file => ({ event: 'file.written', path: file, observable: false })

function layout(t) {
  const base = mkdtempSync(path.join(os.tmpdir(), 'qh-outside-root-'))
  t.after(() => rmSync(base, { recursive: true, force: true }))
  const root = path.join(base, 'repo')
  const elsewhere = path.join(base, 'scratchpad')
  mkdirSync(path.join(root, 'src'), { recursive: true })
  mkdirSync(elsewhere)
  return { base, root, elsewhere }
}

test('an absolute write outside the repository is not counted as unseen', t => {
  const { base, root, elsewhere } = layout(t)
  const outside = unseen(path.join(elsewhere, 'notes.md'))
  assert.equal(lifecycle.unobservableWrites([outside], root).length, 0, 'the scratchpad write is not this tree\'s')
  // The notice and the completion advice read the same count.
  assert.equal(lifecycle.observedFacts([outside], root, { ok: false }).other, 0)
  // A root spelled through a symlink places the same file the same way: /tmp is /private/tmp on macOS.
  const link = path.join(base, 'link-to-repo')
  symlinkSync(root, link, 'dir')
  assert.equal(lifecycle.unobservableWrites([outside], link).length, 0, 'a symlinked root still places the scratchpad outside')
  const real = canonical(root) // the spelling the hook records: native, so Windows 8.3 short names are long
  assert.equal(lifecycle.unobservableWrites([unseen(path.join(real, 'src', 'a.js'))], link).length, 1,
    'and a write inside the real root is still inside, however the root is spelled')
  // The old callers pass no root and keep today's count.
  assert.equal(lifecycle.unobservableWrites([outside]).length, 1)
})

test('a relative or unplaceable write path is still counted as unseen', t => {
  const { base, root, elsewhere } = layout(t)
  const counted = [
    unseen(path.join(root, 'src', 'a.js')),
    unseen(path.join(root, 'src', 'not-yet-created.js')),
    unseen('src/relative.js'),
    unseen(undefined),
    { event: 'file.written', observable: false },
  ]
  for (const entry of counted) {
    assert.equal(lifecycle.unobservableWrites([entry], root).length, 1, `still counted: ${JSON.stringify(entry)}`)
  }
  // A link inside the tree to a file outside it keeps its own name (canonicalFile), so it is inside.
  const target = path.join(elsewhere, 'target.txt')
  const leaf = path.join(root, 'src', 'link.txt')
  writeFileSync(target, 'x') // the link must lead somewhere real, or resolving it falls back to its own name
  symlinkSync(target, leaf)
  assert.equal(lifecycle.unobservableWrites([unseen(leaf)], root).length, 1, 'an escaping symlink leaf is a write the tree hash cannot see')
  // The same, with the root spelled through a link (a Codex review of ADR-094 found the leaf resolved as outside).
  const alias = path.join(base, 'alias-of-repo')
  symlinkSync(root, alias, 'dir')
  assert.equal(lifecycle.unobservableWrites([unseen(path.join(canonical(root), 'src', 'link.txt'))], alias).length, 1,
    'an escaping symlink leaf stays counted when the root is an alias')
  // Mixed: only the outside one drops out.
  assert.equal(lifecycle.unobservableWrites([...counted.slice(0, 1), unseen(path.join(elsewhere, 'x'))], root).length, 1)
  // A path under a DIRECTORY link that leads out of the tree is spelled inside it, and the tree hash cannot see it
  // (a Codex review of ADR-094 found it discarded once the parent was resolved).
  const outwards = path.join(elsewhere, 'dir')
  mkdirSync(outwards)
  symlinkSync(outwards, path.join(root, 'link'), 'dir')
  assert.equal(lifecycle.unobservableWrites([unseen(path.join(root, 'link', 'a.js'))], root).length, 1, 'a write through a directory link stays counted')
  assert.equal(lifecycle.unobservableWrites([unseen(path.join(canonical(root), 'link', 'a.js'))], alias).length, 1, 'and through an alias root, spelled as it is recorded')
})

// Supplementary (NOT in the Acceptance fence): the recorder is the writer of the log, and it canonicalises a path under
// a directory link to its target; the inside spelling it keeps (`lexical`) is what keeps the write counted (a Codex
// review of ADR-094 found the tests supplied a spelling the recorder discards).
test('a write through a directory link is counted when the hook records it', t => {
  const { base, root, elsewhere } = layout(t)
  const git = spawnSync('git', ['-C', root, 'init', '-q'], { encoding: 'utf8', timeout: 30_000 })
  assert.equal(git.status, 0, git.stderr)
  const outwards = path.join(elsewhere, 'dir')
  mkdirSync(outwards)
  symlinkSync(outwards, path.join(root, 'link'), 'dir')
  const state = path.join(base, 'state')
  const run = spawnSync(process.execPath, [fileURLToPath(new URL('../plugin/scripts/lifecycle.mjs', import.meta.url))], {
    encoding: 'utf8', timeout: 60_000, windowsHide: true,
    env: { ...process.env, QUALITY_HARNESS_STATE_DIR: state, CLAUDE_PLUGIN_DATA: path.join(base, 'data'), TMPDIR: base, TMP: base, TEMP: base },
    input: JSON.stringify({ hook_event_name: 'PostToolUse', session_id: 'dirlink', cwd: root, tool_name: 'Write',
      tool_input: { file_path: path.join(root, 'link', 'a.js'), content: 'x' }, tool_response: { success: true } }),
  })
  assert.equal(run.status, 0, run.stderr)
  const prior = process.env.QUALITY_HARNESS_STATE_DIR
  process.env.QUALITY_HARNESS_STATE_DIR = state
  let events
  try { events = readEvents(root, 'dirlink') } finally { if (prior === undefined) delete process.env.QUALITY_HARNESS_STATE_DIR; else process.env.QUALITY_HARNESS_STATE_DIR = prior }
  const written = events.filter(entry => entry.event === 'file.written')
  assert.equal(written.length, 1, JSON.stringify(events))
  assert.equal(typeof written[0].lexical, 'string', 'the spelling the tool was given is kept')
  assert.equal(lifecycle.unobservableWrites(events, root).length, 1, 'and the write is counted')
})
