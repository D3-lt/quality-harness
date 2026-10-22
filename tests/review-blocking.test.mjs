// ADR-125 T1: a plugin commit is reviewed only when the newest review covering it did not request changes. Every repository
// here is one this test made (CLAUDE.md §9).
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { reviewEvidence, tagAdvice } from '../scripts/release-evidence.mjs'

const git = (cwd, ...args) => {
  const run = spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true, timeout: 30_000 })
  assert.equal(run.status, 0, `git ${args.join(' ')}: ${run.stderr}`)
  return run.stdout.trim()
}
function commit(dir, file, text) {
  mkdirSync(join(dir, file, '..'), { recursive: true })
  writeFileSync(join(dir, file), text)
  git(dir, 'add', '-A')
  git(dir, '-c', 'core.hooksPath=/dev/null', 'commit', '-q', '-m', file)
  return git(dir, 'rev-parse', 'HEAD')
}
const ledger = dir => join(dir, '.git', 'quality-harness', 'reviews.jsonl')
const review = (dir, head, status) => {
  mkdirSync(join(dir, '.git', 'quality-harness'), { recursive: true })
  const prior = existsSync(ledger(dir)) ? readFileSync(ledger(dir), 'utf8') : ''
  writeFileSync(ledger(dir), `${prior}${JSON.stringify({ id: `r${prior.length}`, base: null, head, exact: true, status })}\n`)
}

test('a commit whose newest covering review requested changes is not reviewed', () => {
  const dir = mkdtempSync(join(os.tmpdir(), 'qh-review-blocking-'))
  try {
    git(dir, 'init', '-q')
    for (const [k, v] of [['user.email', 't@example.invalid'], ['user.name', 't'], ['commit.gpgsign', 'false']]) git(dir, 'config', k, v)
    commit(dir, 'plugin/a.mjs', 'one\n')
    git(dir, 'tag', 'v1.0.0')
    const change = commit(dir, 'plugin/a.mjs', 'two\n')
    review(dir, change, 'blocking')
    const blocked = reviewEvidence(change, { cwd: dir })
    assert.deepEqual([blocked.verdict, blocked.kind, blocked.uncovered], ['unproven', 'blocked', [change]], blocked.reason)
    assert.match(blocked.reason, /requested changes/)
    assert.match(tagAdvice('blocked'), /verification review/)
    review(dir, change, 'clean')
    assert.equal(reviewEvidence(change, { cwd: dir }).verdict, 'reviewed', 'the verification review after it clears it')
    review(dir, change, 'blocking')
    assert.equal(reviewEvidence(change, { cwd: dir }).kind, 'blocked', 'a newer review that asks for changes blocks it again')
    review(dir, change, 'evidence-limited')
    assert.equal(reviewEvidence(change, { cwd: dir }).verdict, 'reviewed', 'evidence-limited is the strongest verdict without evidence')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
