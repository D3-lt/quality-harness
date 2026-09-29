// Codex's review of ffd4892, #5 and #6, on the advice adr-lint gives about a record Status it
// does not recognise. #5: the advice said every reader treats such a record as not Accepted, and
// `_Accepted_`, `Acc**epted` and `Acceptedé` each governed in lifecycle's adrCorpus while adr-lint
// said so. #6: a literal U+FFFD in valid UTF-8 was called "bytes that are not UTF-8". Each test
// runs adr-lint on a record file, the boundary the finding came through, with a control beside it.
//
// ADR-074 settled #5: every reader reads a Status with its `*`, `_` and backticks removed and
// looks up the word it starts with, so `_Accepted_`, `Acc**epted` and `_Proposed_` are
// recognised and not advised on, and the advice states adr-next's rule as the rule. The clause
// that named lifecycle as the reader that might read a value otherwise is gone with the
// disagreement it described; tests/status-reading.test.mjs holds the readers to one answer.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const bin = join(repoRoot, 'plugin', 'bin')
const temps = []
test.after(() => { for (const dir of temps) rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }) })
// A scratch repository this file made, so every git it runs runs there (CLAUDE.md §9).
const scratch = () => {
  const dir = mkdtempSync(join(tmpdir(), 'qh-chaos-315-status-'))
  temps.push(dir)
  spawnSync('git', ['init', '-q'], { cwd: dir, timeout: 30_000, windowsHide: true })
  return dir
}
// 60s: a Windows runner's first Python spawn can take 30 (tests/adr-next.test.mjs:29).
const python = (gate, args, cwd) => spawnSync('python3', [join(bin, gate), ...args], { cwd, encoding: 'utf8', timeout: 60_000, windowsHide: true })
const recordText = status => Buffer.concat([Buffer.from('# ADR-001: X\n\n**Status:** '), Buffer.isBuffer(status) ? status : Buffer.from(status), Buffer.from('\n\n## Context\n\nx\n')])
// The one advice line this file is about, or '' when adr-lint gave none.
const statusAdvice = status => {
  const repo = scratch()
  const record = join(repo, 'docs', 'adr', 'ADR-001-x.md')
  mkdirSync(dirname(record), { recursive: true })
  writeFileSync(record, recordText(status))
  const run = python('adr-lint', [record], repo)
  assert.ok(run.status === 0 || run.status === 1, `adr-lint could not run: ${run.stdout}\n${run.stderr}`)
  return run.stdout.split('\n').find(line => line.includes('advice: ADR-001-x.md: Status `')) ?? ''
}
// What adr-next says about the same record, as the owner of one task.
const undecided = status => {
  const repo = scratch()
  const tasks = join(repo, 'docs', 'adr', 'ADR-001-x', 'tasks')
  mkdirSync(tasks, { recursive: true })
  writeFileSync(join(repo, 'docs', 'adr', 'ADR-001-x.md'), recordText(status))
  writeFileSync(join(tasks, 'T1-t.md'), '# Task T1: do\n\n**Depends-on:** none\n**Consumes:** none\n**Produces:** none\n\n## Acceptance\n\n```bash\nprintf T1\n```\n\n## Verification Log\n')
  const run = python('adr-next', [tasks, '--json'], repo)
  assert.ok(run.status === 0 || run.status === 3, `adr-next could not run: ${run.stdout}\n${run.stderr}`)
  return JSON.parse(run.stdout).undecided
}
const UNRECOGNISED = /^ {2}advice: ADR-001-x\.md: Status `[^`]*` starts with no status adr-lint recognises \(/
const ADR_NEXT_RULE = 'adr-next calls a record undecided, a plan and not a work order, unless its Status starts with the word Accepted'

// Markup inside or around a status word is read through, as every reader now reads it.
test('a Status written with markup is read through it, and a word no reader knows is still advised on', () => {
  for (const status of ['_Accepted_', 'Acc**epted', '_Proposed_', '**Accepted**']) {
    assert.equal(statusAdvice(status), '', status)
  }
  // The controls: a word no reader knows is advised on, with or without markup, and the advice
  // names no reader that reads it otherwise, because none does.
  for (const status of ['Implemented', '_Implemented_']) {
    const said = statusAdvice(status)
    assert.match(said, UNRECOGNISED, status)
    assert.doesNotMatch(said, /may read it otherwise/, said)
  }
})

// #5: the advice states adr-next's rule, and adr-next applies that rule to the same record.
test('the Status advice states adr-next\'s rule, and adr-next applies it to the record', () => {
  for (const status of ['Acceptedé', 'Implemented']) {
    const said = statusAdvice(status)
    assert.match(said, UNRECOGNISED, status)
    assert.ok(said.includes(ADR_NEXT_RULE), said)
    assert.doesNotMatch(said, /these readers|they treat/, said)
    assert.equal(undecided(status), true, status)
  }
  // The controls: an Accepted record, bare or in markup, is not advised on, and adr-next calls
  // it decided.
  for (const status of ['Accepted', '_Accepted_']) {
    assert.equal(statusAdvice(status), '', status)
    assert.equal(undecided(status), false, status)
  }
})

// #6: U+FFFD is what bytes that are not UTF-8 are read as, and it is also a character valid
// UTF-8 can hold. The advice says which character it saw, not where it came from.
test('a Status holding U+FFFD is named as holding U+FFFD, not as bytes that are not UTF-8', () => {
  for (const status of [Buffer.from(`Imp${String.fromCodePoint(0xfffd)}lemented`, 'utf8'), Buffer.from([0x41, 0x63, 0x63, 0xc3, 0x28, 0x65, 0x70, 0x74, 0x65, 0x64])]) {
    const said = statusAdvice(status)
    assert.match(said, UNRECOGNISED, String(status))
    assert.ok(said.includes('the value holds U+FFFD, which is what bytes that are not UTF-8 are read as'), said)
    assert.doesNotMatch(said, /it holds bytes that are not UTF-8/, said)
  }
  // The control: an unrecognised Status with no U+FFFD in it names no U+FFFD.
  const plain = statusAdvice('Implemented')
  assert.match(plain, UNRECOGNISED)
  assert.doesNotMatch(plain, /U\+FFFD/, plain)
})

// Corpus-chaos at 559827d (four runs): a fullwidth colon in the label is read into the value,
// `： Accepted`, and the advice quoted it without saying the colon was why; and a record whose
// only Status was a fenced or `### Status` heading was told "no **Status:** line", as if a
// `## Status` section were not read either.
test('the Status advice names a leading character that is not a letter, and the section form when there is none', () => {
  const said = statusAdvice('： Accepted')
  assert.match(said, UNRECOGNISED)
  assert.ok(said.includes('it starts with `：` (U+FF1A), which is not a letter'), said)
  // The control: a value that starts with a letter says nothing about its first character.
  assert.doesNotMatch(statusAdvice('Implemented'), /which is not a letter/)
  const repo = scratch()
  const record = join(repo, 'docs', 'adr', 'ADR-001-x.md')
  mkdirSync(dirname(record), { recursive: true })
  writeFileSync(record, '# ADR-001: X\n\n### Status\n\nAccepted\n\n## Context\n\nx\n')
  const run = python('adr-lint', [record], repo)
  assert.ok(run.stdout.includes('advice: ADR-001-x.md: no **Status:** line or `## Status` section'), run.stdout)
})
