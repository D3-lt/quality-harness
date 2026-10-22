// ADR-094 T2's three-day mark, which since ADR-122 Decision 8 decides only a resume that shows no request evidence. A start
// always says its standing paragraphs now, so the tests that drove the mark through a second start no longer reach it; the
// 3.8.52 landing's mutation shards found its key and its expiry unguarded. This holds them directly.
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { firstMentionHere } from '../plugin/scripts/session-notes.mjs'
import { remove } from './helpers/remove.mjs'

test('the three-day mark is kept per repository and text, and expires', t => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'qh-standing-mark-'))
  t.after(() => remove(tmp))
  const now = Date.parse('2026-10-22T12:00:00Z')
  const day = 24 * 60 * 60 * 1000
  const text = 'Verification: this project\'s own check is `node check.mjs`.'
  assert.equal(firstMentionHere('/repo-a', text, { tmp, now }), true, 'first: say it')
  assert.equal(firstMentionHere('/repo-a', text, { tmp, now: now + day }), false, 'within three days: the mark holds')
  assert.equal(firstMentionHere('/repo-a', `${text} changed`, { tmp, now: now + day }), true, 'a changed text is its own mark')
  assert.equal(firstMentionHere('/repo-b', text, { tmp, now: now + day }), true, 'another repository is its own mark')
  assert.equal(firstMentionHere('/repo-a', text, { tmp, now: now + 4 * day }), true, 'a mark older than three days has expired')
})
