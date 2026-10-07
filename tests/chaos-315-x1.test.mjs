// BACKLOG §319's addendum, X1 (§293): adr-state's JSON `unread` gave a file and a status and no
// why for a record it had OPENED, while its text said why that record governs nothing. Each
// entry carries `why` now. `reason` keeps the corpus reader's contract (lifecycle.mjs adrCorpus):
// it is set only for a file that reader never read, so `reason: null` still marks one it opened,
// and a consumer keeps a PARTIAL apart from a status it cannot apply without parsing prose.
// Every assertion has a control, so a check that can only say "clean" fails here (CLAUDE.md §4).
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const adrState = join(repoRoot, 'plugin', 'scripts', 'adr-state.mjs')
const temps = []
test.after(() => { for (const dir of temps) rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }) })
// A scratch repository this file made, so every git it runs runs there (CLAUDE.md §9).
const scratch = () => {
  const dir = mkdtempSync(join(tmpdir(), 'qh-chaos-315-x1-'))
  temps.push(dir)
  spawnSync('git', ['init', '-q'], { cwd: dir, timeout: 30_000, windowsHide: true })
  return dir
}
const write = (dir, rel, text) => { mkdirSync(dirname(join(dir, rel)), { recursive: true }); writeFileSync(join(dir, rel), text) }
const state = (repo, args = []) => spawnSync(process.execPath, [adrState, ...args], { cwd: repo, encoding: 'utf8', timeout: 60_000, windowsHide: true })
const json = repo => JSON.parse(state(repo, ['--json']).stdout)
const record = (title, status) => `# ${title}\n\n${status}\n\n## Context\n\nx\n\n## Decision\n\ny\n`
const unread = report => Object.fromEntries(report.unread.map(entry => [entry.file.split(/[\\/]/).pop(), entry]))
// The words lifecycle's kind and adr-state's pending test act on, as lifecycle reads a status.
// Since ADR-074 every reader reads a status that way (tests/status-reading.test.mjs), so a
// fullwidth colon, which starts the value with punctuation, is undecided in all of them.
const UNKNOWN_WORD = /its status does not start with a word this reader knows \(Accepted, Active, Proposed, Draft, Rejected, Superseded, Withdrawn or Deprecated\)/
const NO_STATUS = /no \*\*Status:\*\* value this reader can read/

test('adr-state --json says why it did not read each record it opened, and keeps `reason` for one it never read', () => {
  const repo = scratch()
  write(repo, 'docs/adr/ADR-001-fullwidth.md', record('ADR-001: Fullwidth', '**Status：** Accepted'))
  write(repo, 'docs/adr/ADR-002-implemented.md', record('ADR-002: Implemented', '**Status:** Implemented'))
  write(repo, 'docs/adr/ADR-003-proposed.md', record('ADR-003: Proposed', '**Status:** Proposed'))
  write(repo, 'docs/adr/ADR-004-nameless.md', '# ADR-004: Nameless\n\n## Context\n\nx\n\n## Decision\n\ny\n')
  // An EMPTY Status line reads as no status, as a missing one does, so one sentence covers both.
  write(repo, 'docs/adr/ADR-007-empty.md', record('ADR-007: Empty', '**Status:**'))
  // The control: an Accepted record is read, and is not in `unread` at all.
  write(repo, 'docs/adr/ADR-005-accepted.md', record('ADR-005: Accepted', '**Status:** Accepted'))
  const report = json(repo)
  const entries = unread(report)
  assert.equal(report.look, 'ok', JSON.stringify(report))
  assert.equal(report.read, 1, JSON.stringify(report))
  assert.deepEqual(Object.keys(entries).sort(), ['ADR-001-fullwidth.md', 'ADR-002-implemented.md',
    'ADR-003-proposed.md', 'ADR-004-nameless.md', 'ADR-007-empty.md'], JSON.stringify(report.unread))
  // The contract: each of these was OPENED, so `reason` is null, as the corpus reader wrote it.
  // Its dirty side is the NUL-byte record below.
  for (const [name, entry] of Object.entries(entries)) {
    assert.equal(entry.reason, null, `${name}: ${JSON.stringify(entry)}`)
  }
  // A status spelled the corpus's own way: said to start with no word this reader knows, with the
  // words it does. X1's fullwidth colon is no label at all since the /code-review of ADR-074 made
  // the colon required (a prose line such as `Status codes …` was being read as a Status), so that
  // record has no Status value — adr-lint's advice names the colon that is not `:`.
  assert.match(entries['ADR-002-implemented.md'].why ?? '', UNKNOWN_WORD, JSON.stringify(entries['ADR-002-implemented.md']))
  assert.match(entries['ADR-001-fullwidth.md'].why ?? '', NO_STATUS, JSON.stringify(entries['ADR-001-fullwidth.md']))
  // The controls: a Proposed record is pending by design, and a missing or empty Status line has
  // no value. None of them is "a word this reader does not know".
  assert.match(entries['ADR-003-proposed.md'].why ?? '', /Proposed or Draft/, JSON.stringify(entries['ADR-003-proposed.md']))
  assert.doesNotMatch(entries['ADR-003-proposed.md'].why ?? '', UNKNOWN_WORD)
  for (const name of ['ADR-004-nameless.md', 'ADR-007-empty.md']) {
    assert.match(entries[name].why ?? '', NO_STATUS, JSON.stringify(entries[name]))
    assert.doesNotMatch(entries[name].why ?? '', UNKNOWN_WORD)
  }
  // The text is unchanged: these were OPENED, so it says neither PARTIAL nor "could NOT be
  // opened", and the Proposed record is counted as pending on the same test the JSON uses.
  const text = state(repo).stdout
  assert.match(text, /were opened and could NOT be read as a record/, text)
  assert.match(text, /1 record\(s\) are Proposed or Draft/, text)
  assert.doesNotMatch(text, /could NOT be opened|PARTIAL/, text)

  // A record the corpus reader never read keeps ITS reason, byte for byte, and says it as its why.
  const NUL = 'it holds a NUL byte, so it is not text this reader can read'
  write(repo, 'docs/adr/ADR-006-nul.md', record('ADR-006: Nul', '**Status:** Acc\u0000epted'))
  const partial = json(repo)
  const withNul = unread(partial)
  assert.equal(partial.look, 'PARTIAL', JSON.stringify(partial))
  assert.equal(withNul['ADR-006-nul.md']?.reason, NUL, JSON.stringify(partial.unread))
  assert.equal(withNul['ADR-006-nul.md']?.why, NUL, JSON.stringify(partial.unread))
  assert.equal(withNul['ADR-001-fullwidth.md'].reason, null, JSON.stringify(withNul['ADR-001-fullwidth.md']))
  assert.match(withNul['ADR-001-fullwidth.md'].why ?? '', NO_STATUS)
  // The text's dirty side: a file it never read IS said as could-not-open, while the fullwidth
  // record stays with the ones it opened.
  const partialText = state(repo).stdout
  assert.match(partialText, /could NOT be opened/, partialText)
  assert.match(partialText, /were opened and could NOT be read as a record[\s\S]*ADR-001-fullwidth\.md/, partialText)
})

// §16's twin, and ADR-005. An UNPROVEN record's status is one the corpus reader WROTE, not one the
// record spelled, so "no word this reader knows" would be false of it. And its why claims no more
// than was observed: beside a README of another spelling the reader cannot tell whether that
// README is the archive's catalog, so the why may not say the record is frozen, nor that a
// catalog failed to establish anything (a review of this fix's first pass).
test('a record whose standing is UNPROVEN says what the reader could not tell, and nothing it did not see', () => {
  const repo = scratch()
  write(repo, 'docs/adr/ADR-001-live.md', record('ADR-001: live', '**Status:** Accepted'))
  write(repo, 'docs/adr-archive/ADR-000-old.md', record('ADR-000: old', '**Status:** Accepted'))
  // An ambiguous spelling of the catalog's name (tests/work-next-readiness.test.mjs).
  write(repo, 'docs/adr-archive/readme.md', '# ADR Archive\n\n**Lifecycle:** Frozen historical ADR records\n')
  // The control: an unknown status in the same corpus is still named as one.
  write(repo, 'docs/adr/ADR-002-implemented.md', record('ADR-002: Implemented', '**Status:** Implemented'))
  const report = json(repo)
  const entries = unread(report)
  assert.equal(report.look, 'PARTIAL', JSON.stringify(report))
  const old = entries['ADR-000-old.md']
  assert.ok(old, JSON.stringify(report.unread))
  assert.equal(old.reason, null, JSON.stringify(old))
  assert.match(old.why ?? '', /^whether it governs could not be established, so it is not counted as governing \(UNPROVEN\)/, JSON.stringify(old))
  // What the reader could not tell, in the corpus reader's own words.
  assert.match(old.why ?? '', /whether that is this directory's catalog is not something this reader guesses/, JSON.stringify(old))
  // The control for the claim below: the status beside it, which the corpus reader wrote, does
  // say "frozen", so the check can fail. The anchored prefix above already rules out the first
  // pass's "its archive catalog does not establish its effect".
  assert.match(old.status ?? '', /^frozen, effect UNPROVEN/, JSON.stringify(old))
  assert.doesNotMatch(old.why ?? '', /frozen/i, JSON.stringify(old))
  assert.doesNotMatch(old.why ?? '', UNKNOWN_WORD)
  assert.match(entries['ADR-002-implemented.md']?.why ?? '', UNKNOWN_WORD, JSON.stringify(report.unread))
  assert.doesNotMatch(entries['ADR-002-implemented.md']?.why ?? '', /UNPROVEN/)
})
