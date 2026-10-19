// ADR-101 T2: `checks.jsonl` and `fast-checks.jsonl` are read by one strict reader. The same table of ledgers is written as
// each file and must answer the same for both, and the two named readers answer what `ledgerPass` answers.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { latestFastPass, ledgerPass, passedAlready } from '../plugin/scripts/check-ledger.mjs'
import { stateDir } from '../plugin/scripts/event-log.mjs'

const T = 't'.repeat(40)
const OTHER = 'o'.repeat(40)
const row = (id, { tree = T, exit = 0, at = '2026-10-13T10:00:00.000Z' } = {}) => JSON.stringify({
  id, git: true, command: 'node check.mjs', exit, verdict: exit === 0 ? 'passed' : 'failed',
  before: { ok: true, tree, at }, after: { ok: true, tree, at: '2026-10-13T10:00:05.000Z' },
})
const unseen = (dir, { at, seenKey, seen }) => JSON.stringify({ event: 'file.written', observable: false, path: join(dir, 'x.txt'), at, [seenKey]: seen })

// [name, ledger text, session log (or null), whether a pass is established]
const TABLE = [
  ['a whole pass', `${row('a')}\n`, null, true],
  ['a torn last line', `${row('a')}\n${row('b').slice(0, 20)}`, null, false],
  ['an unparsable line', `${row('a')}\nnot json\n`, null, false],
  ['a row without an id', `${row('a')}\n{"exit":0}\n`, null, false],
  ['a later failing row', `${row('a')}\n${row('b', { exit: 1 })}\n`, null, false],
  ['a later pass on another tree', `${row('a')}\n${row('b', { tree: OTHER })}\n`, null, true],
  ['an unseen write after the pass', `${row('a')}\n`, (dir, key) => unseen(dir, { at: '2026-10-13T11:00:00.000Z', seenKey: key, seen: 1 }), false],
  ['an unseen write before the pass', `${row('a')}\n`, (dir, key) => unseen(dir, { at: '2026-10-13T09:00:00.000Z', seenKey: key, seen: 0 }), true],
]

function repo() {
  const dir = realpathSync.native(mkdtempSync(join(os.tmpdir(), 'qh-one-ledger-')))
  spawnSync('git', ['init', '-q', dir], { timeout: 30_000, windowsHide: true })
  return dir
}

function written(file, text, session, key) {
  const dir = repo()
  const state = stateDir(dir)
  mkdirSync(join(state, 'sessions'), { recursive: true })
  writeFileSync(join(state, file), text)
  // ADR-113 T3: a fast pass counts only for the fastCheck the project declares, and every row here records this command.
  writeFileSync(join(dir, '.quality-harness.json'), '{"fastCheck":"node check.mjs"}\n')
  if (session) writeFileSync(join(state, 'sessions', 's.jsonl'), `${session(dir, key)}\n`)
  return dir
}

const SOURCES = [['checks.jsonl', 'checksSeen'], ['fast-checks.jsonl', 'fastSeen']]

test('both ledger files answer every row of the shared table the same', () => {
  for (const [name, text, session, expected] of TABLE) {
    const answers = SOURCES.map(([file, seen]) => {
      const dir = written(file, text, session, seen)
      try { return ledgerPass(dir, { file, seen, match: record => record?.after?.tree === T }) !== null } finally { rmSync(dir, { recursive: true, force: true }) }
    })
    assert.deepEqual(answers, [expected, expected], name)
  }
})

test('passedAlready and latestFastPass answer what ledgerPass answers', () => {
  for (const [name, text, session, expected] of TABLE) {
    const full = written('checks.jsonl', text, session, 'checksSeen')
    const fast = written('fast-checks.jsonl', text, session, 'fastSeen')
    try {
      const reused = passedAlready({ root: full, git: true, command: 'node check.mjs', observeTree: () => ({ ok: true, tree: T }) })
      assert.equal(reused !== null, expected, `passedAlready: ${name}`)
      const fastPass = latestFastPass(fast, T)
      assert.equal(fastPass !== null, expected, `latestFastPass: ${name}`)
      if (expected) assert.equal(fastPass.command, 'node check.mjs')
    } finally {
      rmSync(full, { recursive: true, force: true })
      rmSync(fast, { recursive: true, force: true })
    }
  }
})
