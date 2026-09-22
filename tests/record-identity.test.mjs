// ADR-063: a record is its number, or its dated stem.
//
// adr-retire-check could not read an archive whose records are named
// `YYYY-MM-DD-slug.md`: it printed `0 archived` and "no ADR id", and the
// PreToolUse artifact hook repeated that FAIL on every call (TakeOnline
// infrastructure, 2026-09-22). These tests build three small corpora in temporary
// directories — numbered `ADR-NNN`, wcag-shaped `NNN-slug`, and a TakeOnline-shaped
// date-slug corpus — and run the real gate on each. The numbered one is the
// control: it must read exactly as it did before this record.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import { dirname, join, relative, resolve, sep } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { runPython } from '../scripts/python-interpreter.mjs'
import { resolveBashExecutable } from '../plugin/scripts/run-shell-hook.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const bin = join(repoRoot, 'plugin', 'bin')
const lib = join(repoRoot, 'plugin', 'lib')
const dispatcher = join(repoRoot, 'plugin', 'scripts', 'facts-gate-dispatch.sh')

// Patterns live at module scope, never inside a test body: the test-lock hasher
// masks strings and comments, and a regex literal in a body can derail it
// (adr-execute lessons, 2026-09-16).
const PASS_LINE = /^\[PASS\] /m
const FAIL_LINE = /^\[FAIL\] /m
const NOT_SATISFIED = /is not satisfied/
const NO_RECORD_ROW = /no ADR id/
const RECEIPT_SHORT = /1 obligation\(s\), active receipt has 0/
const NO_REPLACEMENT = /replacement .* does not exist exactly once/
const RESEARCH_ADVICE = /advice: .*research\.md/
const DATE_AS_NUMBER = /ADR-0*2026|ADR-0*26\b/

const temps = []
function scratch(prefix) {
  const dir = mkdtempSync(join(os.tmpdir(), `qh-record-identity-${prefix}-`))
  temps.push(dir)
  return dir
}
test.after(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true })
})

function writeTree(root, files) {
  for (const [rel, content] of Object.entries(files)) {
    const file = join(root, ...rel.split('/'))
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, content)
  }
}

function retire(cwd, ...args) {
  const run = runPython([join(bin, 'adr-retire-check'), ...(args.length ? args : ['adr-archive/README.md'])],
    { cwd, encoding: 'utf8', timeout: 60_000 })
  assert.equal(run.error, undefined, `adr-retire-check could not start: ${run.error}`)
  return { status: run.status, out: `${run.stdout}${run.stderr}` }
}

/** Call a function of plugin/lib/record.py and return its JSON-encoded answer. */
function recordLib(expression) {
  const code = [
    'import json, sys',
    `sys.path.insert(0, ${JSON.stringify(lib)})`,
    'import record',
    `print(json.dumps(${expression}))`,
  ].join('\n')
  const run = runPython(['-c', code], { encoding: 'utf8', timeout: 60_000 })
  assert.equal(run.status, 0, `record.py call failed: ${run.stderr}`)
  return JSON.parse(run.stdout)
}

/**
 * The decision-unit digest adr-retire-check seals a catalog row with, computed
 * independently: each file's archive-relative POSIX path, a NUL, its bytes with
 * line endings normalised, a NUL — in the order Python sorts Paths, which is by
 * path PARTS, not by the joined string (`a/b` sorts before `a-c`).
 */
function unitDigest(archiveRoot, files) {
  const parts = file => relative(archiveRoot, file).split(sep)
  const ordered = [...files].sort((a, b) => {
    const [x, y] = [parts(a), parts(b)]
    for (let i = 0; i < Math.min(x.length, y.length); i++) {
      if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1
    }
    return x.length - y.length
  })
  const hash = createHash('sha256')
  for (const file of ordered) {
    hash.update(parts(file).join('/'))
    hash.update('\0')
    const raw = readFileSync(file)
    hash.update(raw.includes(0) ? raw : Buffer.from(raw.toString('latin1').replace(/\r\n?/g, '\n'), 'latin1'))
    hash.update('\0')
  }
  return hash.digest('hex')
}

const record = (title, status, extra = '') =>
  `# ${title}\n\n**Status:** ${status}\n\n## Context\n\nWhy.\n\n## Decision\n\nWhat.\n${extra}`

// --- the TakeOnline-shaped date-slug corpus ------------------------------------
const OLD = '2026-07-15-app-tier-provisioning'
const DEFER = '2026-06-30-db-doctor-backup-window-defer'
const FLOCK = '2026-06-30-db-doctor-backup-window-defer-flock'
const NEW = '2026-07-12-boundary-hardening'

function dateCorpus({ receipt, effect, row } = {}) {
  const root = scratch('date')
  writeTree(root, {
    'adr/README.md': '# Decisions\n\n'
      + `- [Defer](${DEFER}.md)\n- [Flock](${FLOCK}.md)\n- [Boundary](${NEW}.md)\n`,
    [`adr/${DEFER}.md`]: record('DB doctor backup window defer', 'Accepted'),
    [`adr/${DEFER}.queries.md`]: '# Queries for the defer record\n\nSELECT 1;\n',
    [`adr/${FLOCK}.md`]: record('DB doctor backup window defer flock', 'Accepted'),
    [`adr/${NEW}.md`]: record('Boundary hardening', 'Accepted'),
    'adr/BACKLOG.md': '# Backlog\n\n## Follow-ups\n\n'
      + (receipt ?? `- [ ] Carry the app-tier probe (from \`docs/adr-archive/${OLD}/${OLD}.md\`) (ADR 2026-07-15 app-tier-provisioning).\n`),
    [`adr-archive/${OLD}/${OLD}.md`]: record('App tier provisioning', `Superseded by ${NEW}`,
      '\n## Out of Scope\n\n- Carry the app-tier probe (deferred: active BACKLOG)\n'),
    [`adr-archive/${OLD}/tasks/T1-provision.md`]: '# Task T1: provision\n\n**Status:** done\n',
    [`adr-archive/${OLD}/WAVE3-PLAN.md`]: '# Wave 3 plan\n\nNotes.\n',
  })
  const archive = join(root, 'adr-archive')
  const unit = join(archive, OLD)
  const digest = unitDigest(archive, [join(unit, `${OLD}.md`), join(unit, 'tasks', 'T1-provision.md'), join(unit, 'WAVE3-PLAN.md')])
  const cells = row ?? `[${OLD}](${OLD}/${OLD}.md)`
  writeTree(root, {
    'adr-archive/README.md': '# ADR Archive\n\n**Lifecycle:** Frozen historical ADR records\n'
      + '**Active corpus:** ../adr\n\n## Retired Records\n\n'
      + '| ADR | Title | Decision effect | Retired | Reason | Obligations | SHA-256 |\n'
      + '|-----|-------|-----------------|---------|--------|-------------|---------|\n'
      + `| ${cells} | App tier provisioning | ${effect ?? `superseded by \`docs/adr/${NEW}.md\` (2026-07-12)`} `
      + `| 2026-09-22 | replaced by the boundary hardening | \`../adr/BACKLOG.md\` | ${digest} |\n`,
  })
  return root
}

// --- the wcag-shaped NNN-slug corpus -------------------------------------------
function slugCorpus() {
  const root = scratch('slug')
  writeTree(root, {
    'adr/README.md': '# Decisions\n\n- [ADR-001](001-tool-contract.md)\n- [ADR-012](012-color-contrast.md)\n',
    'adr/001-tool-contract.md': record('ADR-001: Tool contract', 'Accepted'),
    // Untitled: its number comes from its name alone.
    'adr/012-color-contrast.md': record('Color contrast', 'Accepted'),
    'adr-archive/002-old-palette.md': record('ADR-002: Old palette', 'Superseded by ADR-012'),
  })
  const archive = join(root, 'adr-archive')
  const digest = unitDigest(archive, [join(archive, '002-old-palette.md')])
  writeTree(root, {
    'adr-archive/README.md': '# ADR Archive\n\n**Lifecycle:** Frozen historical ADR records\n'
      + '**Active corpus:** ../adr\n\n## Retired Records\n\n'
      + '| ADR | Title | Decision effect | Retired | Reason | Obligations | SHA-256 |\n'
      + '|-----|-------|-----------------|---------|--------|-------------|---------|\n'
      + `| [ADR-002](002-old-palette.md) | Old palette | superseded by ADR-012 | 2026-09-22 | replaced | none | ${digest} |\n`,
  })
  return root
}

// --- the numbered control: the shipped `ok` fixture, plus two spellings ---------
function numberedCorpus() {
  const root = scratch('numbered')
  const source = join(repoRoot, 'tests', 'fixtures', 'ok')
  cpSync(join(source, 'adr'), join(root, 'adr'), { recursive: true })
  cpSync(join(source, 'adr-archive'), join(root, 'adr-archive'), { recursive: true })
  const archive = join(root, 'adr-archive')
  // A loose note in the flat archive, identified only by its heading: it belongs
  // to ADR-001's decision unit, so the seal must cover it.
  writeTree(root, {
    'adr-archive/history-appendix.md': '# Appendix for ADR-001\n\nA heading is the only identity here.\n',
    // A receipt spelled with a task suffix still names record 1.
    'adr/BACKLOG.md': '# ADR Backlog\n\n## Follow-ups\n\n'
      + '- [ ] Preserve the historical compatibility arm (from ADR-001).\n'
      + '- [ ] Revisit the historical operator sign-off (from ADR-001-T3).\n',
  })
  const unit = ['ADR-001-history.md', 'ADR-001-attachment.txt', 'history-appendix.md']
  const digest = unitDigest(archive, unit.map(name => join(archive, name)))
  const catalog = join(archive, 'README.md')
  writeFileSync(catalog, readFileSync(catalog, 'utf8').replace(/[0-9a-f]{64}/, digest))
  return root
}

test('a date-slug archive passes adr-retire-check with each record named by its stem', () => {
  const root = dateCorpus()
  const got = retire(root)
  assert.equal(got.status, 0, got.out)
  assert.match(got.out, PASS_LINE)
  assert.ok(got.out.includes('· 3 active · 1 archived · 3 governing ·'), got.out)
})

test('an NNN-slug archive keeps its record numbers', () => {
  const root = slugCorpus()
  const got = retire(root)
  assert.equal(got.status, 0, got.out)
  assert.ok(got.out.includes('· 2 active · 1 archived · 2 governing ·'), got.out)
  assert.equal(recordLib('record.record_id("001-tool-contract.md", "# ADR-001: Tool contract")'), 'ADR-001')
  assert.equal(recordLib('record.record_id("012-color-contrast.md", "# Color contrast")'), 'ADR-012')
})

test('a date-shaped name never yields a record number', () => {
  for (const [name, title, want] of [
    ['2026-07-15-x.md', '# X', '2026-07-15-x'],
    ['2026_07_15_x.md', '# X', '2026_07_15_x'],
    ['2026.7.15.x.md', '# X', '2026.7.15.x'],
    // The owner kept adr-lint's date shape: a four-digit number with a numeric
    // slug is date-shaped, so it is a stem (ADR-063 Risks).
    ['0012-3-tier-cache.md', '# Cache tiers', '0012-3-tier-cache'],
    // A title whose number is itself a date gives nothing; the name decides.
    ['2026-07-15-y.md', '# ADR 2026-07-15: y', '2026-07-15-y'],
    // Controls: the title wins, and a numbered name keeps its number.
    ['2026-07-15-z.md', '# ADR-5: z', 'ADR-005'],
    ['ADR-012-x.md', '# Something', 'ADR-012'],
  ]) {
    assert.equal(recordLib(`record.record_id(${JSON.stringify(name)}, ${JSON.stringify(title)})`), want, name)
  }
  const got = retire(dateCorpus())
  assert.doesNotMatch(got.out, DATE_AS_NUMBER)
})

test('a numbered archive reads exactly as before', () => {
  const got = retire(numberedCorpus())
  assert.equal(got.status, 0, got.out)
  assert.ok(got.out.includes('· 1 active · 1 archived · 2 governing ·'), got.out)
})

test('a reference names a record only as a whole token', () => {
  const refs = text => recordLib(`sorted(record.references_in(${JSON.stringify(text)}))`)
  for (const text of [
    `from ${OLD}.`,
    `\`${OLD}.md\``,
    `\`docs/adr/${OLD}.md\` (2026-07-12)`,
    `\`docs/adr-archive/${OLD}/${OLD}.md\``,
    `docs\\adr-archive\\${OLD}\\${OLD}.md`,
  ]) {
    assert.ok(refs(text).includes(OLD), `${text} -> ${refs(text)}`)
  }
  assert.ok(!refs(`only \`${FLOCK}.md\``).includes(DEFER), 'a prefix is not a reference')
  assert.deepEqual(refs('see ADR-012-T3 and ADR-7/notes'), ['ADR-007', 'ADR-012'])
  // Through the gate: a receipt naming a longer stem does not satisfy the shorter.
  const collided = dateCorpus({ receipt: `- [ ] Carry it (from \`${OLD}-v2.md\`).\n` })
  assert.match(retire(collided).out, RECEIPT_SHORT)
})

test('a row, receipt or supersession that names no record is refused', () => {
  const clean = retire(dateCorpus())
  assert.equal(clean.status, 0, clean.out)
  const noRecordRow = retire(dateCorpus({ row: '[a record](notes.md)' }))
  assert.equal(noRecordRow.status, 1)
  assert.match(noRecordRow.out, NO_RECORD_ROW)
  const noReceipt = retire(dateCorpus({ receipt: '- [ ] Something unrelated.\n' }))
  assert.equal(noReceipt.status, 1)
  assert.match(noReceipt.out, RECEIPT_SHORT)
  const nowhere = retire(dateCorpus({ effect: 'superseded by `docs/adr/2026-08-01-nothing.md`' }))
  assert.equal(nowhere.status, 1)
  assert.match(nowhere.out, NO_REPLACEMENT)
})

test('the artifact hook passes a date-slug archive', () => {
  const bash = resolveBashExecutable()
  const hook = root => {
    const run = spawnSync(bash, [dispatcher, join(root, 'adr-archive', OLD, `${OLD}.md`)],
      { cwd: root, encoding: 'utf8', timeout: 60_000 })
    assert.equal(run.error, undefined, `the dispatcher could not start: ${run.error}`)
    assert.equal(run.status, 0)
    return `${run.stdout}${run.stderr}`
  }
  assert.doesNotMatch(hook(dateCorpus()), NOT_SATISFIED)
  // The dirty control: the same boundary still reports a real defect.
  assert.match(hook(dateCorpus({ receipt: '- [ ] Something unrelated.\n' })), NOT_SATISFIED)
})

test('adr-retire-check --adopt reads a date-slug corpus', () => {
  const root = dateCorpus()
  const got = retire(root, '--adopt', 'adr', 'adr-archive')
  assert.equal(got.status, 0, got.out)
  assert.ok(got.out.includes('· 3 active · 1 archived ·'), got.out)
})

test('a file with no identity is advice, not a failure', () => {
  const root = numberedCorpus()
  writeTree(root, { 'adr/research.md': record('Research on caching', 'Draft') })
  const got = retire(root)
  assert.equal(got.status, 0, got.out)
  assert.match(got.out, RESEARCH_ADVICE)
  assert.doesNotMatch(got.out, FAIL_LINE)
})
