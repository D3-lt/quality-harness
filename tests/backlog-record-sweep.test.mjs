// scripts/backlog-record-sweep.mjs — a backlog section whose work SHIPPED under a
// heading that still says PROPOSED.
//
// BACKLOG §168. The sweep's whole value is that its findings are worth reading, so
// the tests are as much about what it must NOT report as what it must: the first cut
// flagged 20 of 39 sections because it took every `ADR-NNN` anywhere in the body, and
// a sweep that is mostly noise is one a reader learns to skim (ADR-037).
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { CLOSED_WORDS, recordsNamed, recordState, sections, sweep } from '../scripts/backlog-record-sweep.mjs'

const testDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(testDir, '..')


// A real corpus shape on disk, because recordState resolves the record directory
// and its file from the filesystem — stubbing that away would leave the resolution
// itself untested, which is where an "unknown" would silently come from.
const temps = []
test.after(() => { for (const t of temps) rmSync(t, { recursive: true, force: true }) })
function corpusRoot (ids = ['002', '004']) {
  const root = mkdtempSync(join(os.tmpdir(), 'qh-record-sweep-'))
  temps.push(root)
  const adr = join(root, 'docs', 'adr')
  for (const id of ids) {
    mkdirSync(join(adr, `ADR-${id}-probe`, 'tasks'), { recursive: true })
    writeFileSync(join(adr, `ADR-${id}-probe.md`), `# ADR-${id}: probe\n\n**Status:** Accepted\n`)
  }
  return root
}
const doc = [
  '# Backlog', '',
  '## 1. CLOSED — already done, names ADR-001', '', 'Body.', '',
  '## 2. PROPOSED AS ADR-002 — the heading names it', '', 'Body.', '',
  '## 3. A section that merely cites a record in passing', '', 'See ADR-003 for the reasoning.', '',
  '## 4. Two records, one still live', '', 'PROPOSED AS ADR-002 and DEFERRED TO ADR-004.', '',
  '## 5. Names nothing', '', 'Body.', '',
].join('\n')

test('sections and the closure vocabulary read what the corpus actually writes', () => {
  const parsed = sections(doc)
  assert.deepEqual(parsed.map(s => s.number), [1, 2, 3, 4, 5])
  assert.match(parsed[2].body, /See ADR-003/)
  assert.ok(CLOSED_WORDS.test(parsed[0].heading))
  assert.ok(!CLOSED_WORDS.test(parsed[1].heading))
})

test('a bare citation is not a claim, and a heading or a proposal phrase is', () => {
  const [, proposed, citing, twoRecords, nothing] = sections(doc)
  assert.deepEqual(recordsNamed(proposed), ['002'], 'the heading names the record')
  assert.deepEqual(recordsNamed(citing), [],
    'a section that cites a record in passing is not made stale by that record finishing')
  assert.deepEqual(recordsNamed(twoRecords), ['002', '004'])
  assert.deepEqual(recordsNamed(nothing), [])
})

test('a section is flagged only when EVERY record it claims has shipped', () => {
  // The seam stands in for adr-next so the arms are reachable without a corpus.
  const run = (argv) => {
    const shipped = { done: [{ id: 'T1' }], ready: [], blocked: [], stopped: [] }
    const live = { done: [{ id: 'T1' }], ready: [{ id: 'T2' }], blocked: [], stopped: [] }
    return { ok: true, out: JSON.stringify(argv[2].includes('ADR-004-') ? live : shipped) }
  }
  const root = corpusRoot()
  const found = sweep(doc, { root, run })
  const flagged = found.filter(f => f.verdict === 'shipped').map(f => f.section.number)
  assert.deepEqual(flagged, [2],
    `§2 claims a shipped record; §4 still names a live one; §3 only cites: ${JSON.stringify(found)}`)
  // Closed sections are skipped by default and reachable with --all, so §1 being
  // absent above is the skip working rather than the lookup failing.
  assert.ok(sweep(doc, { root, run, all: true }).some(f => f.section.number === 1))
})

test('a record it cannot resolve is COULD NOT LOOK, never a finding about the section', () => {
  // ADR-005 applied to the sweep itself: an absent record, an unparseable answer and
  // a gate that would not run are three reasons, and none of them is "this is stale".
  const root = corpusRoot()
  const absent = recordState('999', { root, run: () => ({ ok: true, out: '{}' }) })
  assert.match(absent.why, /match ADR-999-/)
  assert.equal(absent.state, 'unknown')

  const wontRun = recordState('002', { root, run: () => ({ ok: false, why: 'python3 not found' }) })
  assert.equal(wontRun.state, 'unknown')

  const [finding] = sweep('## 7. PROPOSED AS ADR-999 — nowhere\n\nBody.\n',
    { root, run: () => ({ ok: true, out: '{}' }) })
  assert.equal(finding.verdict, 'unknown',
    'an unresolvable record must not read as a shipped one')
})

test('the sweep runs end to end on this repository and exits 0 whatever it finds', () => {
  // ⚠ AND IT MUST PRINT. A `pathToFileURL` mismatch on Windows makes a script exit 0
  // having printed NOTHING, which is a could-not-look wearing a clean exit — measured
  // 2026-09-03 on backlog-claim-sweep.mjs, and the empty string was the only evidence.
  const script = join(repoRoot, 'scripts', 'backlog-record-sweep.mjs')
  const got = spawnSync(process.execPath, [script], { encoding: 'utf8', timeout: 300_000, cwd: repoRoot })
  assert.equal(got.status, 0, got.stderr)
  assert.match(got.stdout, /backlog-record-sweep: \d+ section\(s\) read/,
    `it must say what it read: ${got.stdout}${got.stderr}`)
  assert.match(got.stdout, /place to look, NOT a verdict/,
    'the reading instruction travels with the finding, not in a doc beside it')
})
