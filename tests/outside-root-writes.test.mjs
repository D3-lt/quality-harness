// ADR-094 T4. A `file.written` for a path outside the repository was counted as a write git cannot
// see, so a scratchpad Write made the previous-session notice and the completion advice accuse a
// repository nothing had touched. `unseenWriteSince` already skipped such a path; the other reader
// did not. An unplaceable path is not an outside one (CLAUDE.md §16): it keeps its count.
import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import * as lifecycle from '../plugin/scripts/lifecycle.mjs'

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
  const real = realpathSync(root)
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
  symlinkSync(target, leaf)
  assert.equal(lifecycle.unobservableWrites([unseen(leaf)], root).length, 1, 'an escaping symlink leaf is a write the tree hash cannot see')
  // The same, with the root spelled through a link (a Codex review of ADR-094 found the leaf resolved as outside).
  const alias = path.join(base, 'alias-of-repo')
  symlinkSync(root, alias, 'dir')
  assert.equal(lifecycle.unobservableWrites([unseen(path.join(realpathSync(root), 'src', 'link.txt'))], alias).length, 1,
    'an escaping symlink leaf stays counted when the root is an alias')
  // Mixed: only the outside one drops out.
  assert.equal(lifecycle.unobservableWrites([...counted.slice(0, 1), unseen(path.join(elsewhere, 'x'))], root).length, 1)
})
