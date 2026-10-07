// ADR-084 T2: one read-only report over the ledgers a checkout keeps — skills invoked (T1), same-tree
// skips and their estimated saving (ADR-081), checks run — and UNPROVEN, never zero, for one it could
// not read whole.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { appendFileSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { appendEvent, sessionLogFile, stateDir } from '../plugin/scripts/event-log.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const scratch = realpathSync.native(mkdtempSync(path.join(os.tmpdir(), 'qh-ledger-report-')))
after(() => rmSync(scratch, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }))
const checkout = name => {
  const root = path.join(scratch, name)
  mkdirSync(root, { recursive: true })
  spawnSync('git', ['init', '-q'], { cwd: root, timeout: 30_000, windowsHide: true })
  return root
}
const report = (root, ...flags) => spawnSync(process.execPath, [path.join(repoRoot, 'plugin', 'scripts', 'ledger-report.mjs'), ...flags, root],
  { cwd: root, encoding: 'utf8', timeout: 60_000, windowsHide: true })
const jsonl = rows => rows.map(row => JSON.stringify(row)).join('\n') + '\n'
const check = (verdict, startedAt, endedAt) => ({ verdict, before: { at: startedAt }, after: { at: endedAt } })

test('ledger-report counts skills and sums skips from the ledgers', () => {
  const root = checkout('counted')
  for (const skill of ['quality-harness:review', 'quality-harness:review']) appendEvent(root, 's1', { event: 'skill.invoked', skill })
  appendEvent(root, 's1', { event: 'tool.pre', tool: 'Bash' })
  for (const skill of ['quality-harness:review', 'quality-harness:adr-write']) appendEvent(root, 's2', { event: 'skill.invoked', skill })
  writeFileSync(path.join(stateDir(root), 'skips.jsonl'), jsonl([{ savedMs: 1000 }, { savedMs: 2500 }]))
  writeFileSync(path.join(stateDir(root), 'checks.jsonl'), jsonl([
    check('passed', '2026-10-05T10:00:00.000Z', '2026-10-05T10:00:30.000Z'),
    check('failed', '2026-10-05T11:00:00.000Z', '2026-10-05T11:00:10.000Z'),
  ]))
  const run = report(root, '--json')
  assert.equal(run.status, 0, run.stderr)
  const answer = JSON.parse(run.stdout)
  assert.equal(answer.look, 'ok')
  assert.deepEqual(answer.skills, [
    { skill: 'quality-harness:review', calls: 3, sessions: 2 },
    { skill: 'quality-harness:adr-write', calls: 1, sessions: 1 },
  ])
  assert.equal(answer.sessionsRead, 2)
  assert.deepEqual(answer.skips, { count: 2, savedMsEstimate: 3500 })
  assert.deepEqual(answer.checks, { count: 2, byVerdict: { passed: 1, failed: 1 }, totalMs: 40000 })
  assert.deepEqual(answer.unproven, [])
  const text = report(root).stdout
  assert.match(text, /quality-harness:review\s+3 call\(s\) in 2 session\(s\)/, text)
  assert.match(text, /same-tree skips\s+2, saving about 3\.5 s \(an estimate: each reused pass's own duration\)/, text)
  assert.doesNotMatch(text, new RegExp(scratch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), 'the report printed the checkout path')
})

test('ledger-report says UNPROVEN for a ledger it could not read whole', () => {
  const root = checkout('torn')
  appendEvent(root, 's1', { event: 'skill.invoked', skill: 'quality-harness:review' })
  appendFileSync(sessionLogFile(root, 's1'), '{"event":"skill.inv')
  mkdirSync(path.join(stateDir(root), 'skips.jsonl'))
  const answer = JSON.parse(report(root, '--json').stdout)
  assert.equal(answer.look, 'PARTIAL')
  assert.deepEqual(answer.unproven.sort(), ['sessions/s1.jsonl', 'skips.jsonl'])
  assert.equal(answer.skips, null, 'a ledger that could not be read is not zero skips')
  // The control: a checkout that never wrote a ledger has nothing to count, and says so as zero.
  const empty = JSON.parse(report(checkout('empty'), '--json').stdout)
  assert.deepEqual([empty.look, empty.skills, empty.skips, empty.unproven], ['ok', [], { count: 0, savedMsEstimate: 0 }, []])
})

// ADR-088 Follow-ups: a ledger whose last line has no terminating newline was not written whole,
// as the importer reads it, even when that line parses.
test('ledger-report reads an unterminated last line as not read whole', () => {
  for (const cut of [true, false]) {
    const root = checkout(cut ? 'cut' : 'kept')
    const rows = [check('passed', '2026-10-05T10:00:00.000Z', '2026-10-05T10:00:30.000Z'), check('failed', '2026-10-05T11:00:00.000Z', '2026-10-05T11:00:10.000Z')]
    const skips = [{ savedMs: 1000 }, { savedMs: 2500 }]
    mkdirSync(stateDir(root), { recursive: true })
    writeFileSync(path.join(stateDir(root), 'checks.jsonl'), cut ? jsonl(rows).slice(0, -1) : jsonl(rows))
    writeFileSync(path.join(stateDir(root), 'skips.jsonl'), cut ? jsonl(skips).slice(0, -1) : jsonl(skips))
    const answer = JSON.parse(report(root, '--json').stdout)
    if (cut) {
      assert.equal(answer.look, 'PARTIAL')
      assert.deepEqual(answer.unproven.sort(), ['checks.jsonl', 'skips.jsonl'])
      assert.equal(answer.checks, null, 'a ledger cut after its last brace is not two checks')
      assert.equal(answer.skips, null)
    } else {
      // The twin: the same rows, terminated, are counted.
      assert.equal(answer.look, 'ok')
      assert.equal(answer.checks.count, 2)
      assert.equal(answer.skips.count, 2)
    }
  }
})
