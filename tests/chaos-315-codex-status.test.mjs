// Codex's review of ffd4892, #5 and #6, on the advice adr-lint gives about a record Status it
// does not recognise. #5: the advice said every reader treats such a record as not Accepted, and
// `_Accepted_`, `Acc**epted` and `Acceptedé` each governed in lifecycle's adrCorpus while adr-lint
// said so. #6: a literal U+FFFD in valid UTF-8 was called "bytes that are not UTF-8". Each test
// runs adr-lint on a record file, the boundary the finding came through, with a control beside it.
//
// ⚠ THE STATUS IS NOT READ THROUGH ITS MARKUP HERE. A first fix removed every `*`, `_` and backtick
// before matching, as lifecycle does, and that silenced `_Proposed_`, which adr-lint's two other
// Status readers and adr-next do not read as Proposed (a review of that fix, 2026-09-29). So the
// advice still speaks for such a value, and says that lifecycle may read it otherwise.
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
const MARKUP = 'lifecycle.mjs reads it with `*`, `_` and backticks removed, and may read it otherwise'

// Markup inside or around a status word is still advised on, because adr-next and adr-lint's other
// Status readers do not read `_Proposed_` as Proposed; the advice names the reader that might.
test('a Status written with markup is still advised on, and the advice names the reader that strips it', () => {
  for (const status of ['_Accepted_', 'Acc**epted', '_Proposed_']) {
    const said = statusAdvice(status)
    assert.match(said, UNRECOGNISED, status)
    assert.ok(said.includes(MARKUP), said)
  }
  // The controls: markup only at the edges is the edge-stripped word every reader shares, and a
  // plain unknown word names no markup.
  assert.equal(statusAdvice('**Accepted**'), '')
  const plain = statusAdvice('Implemented')
  assert.match(plain, UNRECOGNISED)
  assert.ok(!plain.includes(MARKUP), plain)
})

// #5: the readers do not agree about such a record, so the advice names what adr-lint read and
// what adr-next's rule is, and claims no consensus.
test('the Status advice claims what adr-lint read and adr-next\'s rule, and no consensus', () => {
  for (const status of ['Acceptedé', 'Implemented', '_Accepted_']) {
    const said = statusAdvice(status)
    assert.match(said, UNRECOGNISED, status)
    assert.ok(said.includes(ADR_NEXT_RULE), said)
    assert.doesNotMatch(said, /these readers|they treat/, said)
    // The rule the advice states is the one adr-next applies to this record.
    assert.equal(undecided(status), true, status)
  }
  // The control: an Accepted record is not advised on, and adr-next calls it decided.
  assert.equal(statusAdvice('Accepted'), '')
  assert.equal(undecided('Accepted'), false)
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
