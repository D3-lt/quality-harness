// BACKLOG §433: once the tag is made, release.mjs checks the public archive and the catalogue pin with marketplace-source. It
// printed "verify a cold archive install, then generate and land the catalogue pin" both for a published archive awaiting promotion
// (exit 2) and for one whose public download or digest failed (exit 1), so a failed verification read as the next step to promote.
import assert from 'node:assert/strict'
import test from 'node:test'
import { tagged, world } from './helpers/release-world.mjs'

test('only an archive awaiting promotion is told to promote; a failed verification says it failed', () => {
  const pending = world({ marketplace: 2 })
  assert.equal(pending.run(), 2, pending.said.join('\n'))
  assert.ok(tagged(pending.calls))
  assert.match(pending.said.join('\n'), /verify a cold archive install, then generate and land the catalogue pin/)

  const failed = world({ marketplace: 1 })
  assert.equal(failed.run(), 1, failed.said.join('\n'))
  assert.doesNotMatch(failed.said.join('\n'), /verify a cold archive install/)
  assert.match(failed.said.join('\n'), /failed verification \(marketplace-source exited 1\)/)
})
