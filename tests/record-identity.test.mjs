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
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import { dirname, join, relative, resolve, sep } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { runPython } from '../scripts/python-interpreter.mjs'
import * as lifecycle from '../plugin/scripts/lifecycle.mjs'
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

function dateCorpus({ receipt, effect, row, oldStatus } = {}) {
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
    [`adr-archive/${OLD}/${OLD}.md`]: record('App tier provisioning', oldStatus ?? `Superseded by ${NEW}`,
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
function numberedCorpus(extra = {}) {
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
  // Extra files, and those under the archive join ADR-001's sealed unit.
  writeTree(root, extra)
  const unit = ['ADR-001-history.md', 'ADR-001-attachment.txt', 'history-appendix.md',
    ...Object.keys(extra).filter(rel => rel.startsWith('adr-archive/')).map(rel => rel.slice('adr-archive/'.length))]
  const digest = unitDigest(archive, unit.map(name => join(archive, ...name.split('/'))))
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

// --- T2: the lifecycle corpus reader agrees with the retire gate ---------------
//
// `adrCorpus` is what the session notes, `adr-context` and `adr-state` read. It
// never listed a dated record under `adr-archive/`, read a catalog only beside the
// file, and turned `Superseded by 2026-…` into record 2026.
const IDENTITY_TABLE = [
  ['ADR-012-x.md', '# Something'], ['012-color-contrast.md', '# Color contrast'],
  ['001-tool-contract.md', '# ADR-001: Tool contract'], ['adr_12_x.md', null],
  ['2026-07-15-x.md', '# X'], ['2026_07_15_x.md', '# X'], ['2026.7.15.x.md', null],
  ['0012-3-tier-cache.md', '# Cache tiers'], ['2026-07-15-y.md', '# ADR 2026-07-15: y'],
  ['2026-07-15-z.md', '# ADR-5: z'], ['003-T2-plan.md', null], ['T1-provision.md', '# Task T1: provision'],
  ['notes.md', '# Notes'], ['ADR-001', null], ['2026-07-15-app-tier', null],
  ['ADR-063-a-record.md', '# ADR-063: A record is its number, or its stem'],
  ['x.md', '# Task ADR-063-T1: The retire gate'], ['ADR-2026-07-15-x.md', null],
]
const REFERENCE_TABLE = [
  `from \`docs/adr-archive/${OLD}/${OLD}.md\`) (ADR 2026-07-15 app-tier-provisioning).`,
  `superseded by \`docs/adr/${NEW}.md\` (2026-07-12)`,
  `docs\\adr\\${NEW}.md, ADR-012-T3 and ADR-7/notes`,
  `only \`${FLOCK}.md\`.`,
]

/** A JSON value as a Python literal: the tables hold strings and null only. */
const pyLiteral = value => JSON.stringify(value).replace(/null/g, 'None')

/** Every file under `root` as a repository-relative POSIX path: the listing seam. */
function listing(root, at = root) {
  return readdirSync(at, { withFileTypes: true }).flatMap(entry => {
    const full = join(at, entry.name)
    return entry.isDirectory() ? listing(root, full) : [relative(root, full).split(sep).join('/')]
  })
}

function gitRepository(root) {
  const env = { ...process.env, GIT_AUTHOR_NAME: 'qh', GIT_AUTHOR_EMAIL: 'qh@example.invalid',
    GIT_COMMITTER_NAME: 'qh', GIT_COMMITTER_EMAIL: 'qh@example.invalid' }
  for (const args of [['init', '-q'], ['add', '-A'], ['-c', 'gc.auto=0', 'commit', '-q', '-m', 'fixture']]) {
    const run = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', timeout: 30_000, env })
    assert.equal(run.status, 0, `git ${args.join(' ')}: ${run.stderr}`)
  }
  return root
}

function adrState(root) {
  const run = spawnSync(process.execPath, [join(repoRoot, 'plugin', 'scripts', 'adr-state.mjs'), '--json', root],
    { encoding: 'utf8', timeout: 60_000 })
  assert.equal(run.status, 0, run.stderr)
  return JSON.parse(run.stdout)
}

test('the corpus reader lists dated records, active and archived', () => {
  const root = dateCorpus()
  const records = lifecycle.adrCorpus(root, { tracked: listing(root) })
  assert.deepEqual(records.map(record => record.id).sort(), [DEFER, FLOCK, NEW, OLD].sort())
  // The control: the numbered corpus lists the same records with the same numbers.
  const numbered = numberedCorpus()
  const control = lifecycle.adrCorpus(numbered, { tracked: listing(numbered) })
  assert.deepEqual(control.map(record => [record.id, record.number]).sort(), [['ADR-001', 1], ['ADR-002', 2]])
})

test('the lifecycle archive reader reads a record by its stem', () => {
  const superseded = dateCorpus()
  const old = lifecycle.adrCorpus(superseded, { tracked: listing(superseded) }).find(record => record.id === OLD)
  assert.ok(old, 'the archived dated record is listed at all')
  assert.equal(old.kind, 'graveyard', `a superseded archived record is not governing: ${old.status}`)
  // The catalog, not the frozen file, is the authority: a file that still says
  // Accepted, catalogued as withdrawn, is withdrawn.
  const withdrawn = dateCorpus({ effect: 'withdrawn', oldStatus: 'Accepted' })
  const frozen = lifecycle.adrCorpus(withdrawn, { tracked: listing(withdrawn) }).find(record => record.id === OLD)
  assert.ok(frozen, 'the withdrawn archived record is listed at all')
  assert.equal(frozen.kind, 'graveyard', `a withdrawn archived record read as ${frozen.status}`)
})

test('a dated supersession is never record 2026', () => {
  const root = dateCorpus()
  writeTree(root, {
    'adr/2026-07-01-first.md': record('First', 'Superseded by 2026-07-20-second'),
    'adr/2026-07-20-second.md': record('Second', 'Accepted'),
    'adr/ADR-003-old.md': record('ADR-003: Old', 'Superseded by ADR-0004'),
    'adr/ADR-004-new.md': record('ADR-004: New', 'Accepted'),
  })
  const byId = new Map(lifecycle.adrCorpus(root, { tracked: listing(root) }).map(entry => [entry.id, entry]))
  assert.ok(byId.has(OLD), 'the archived dated record is listed at all')
  assert.equal(byId.get(OLD).supersededBy, NEW)
  assert.equal(byId.get('2026-07-01-first').supersededBy, '2026-07-20-second')
  assert.equal(byId.get('ADR-003').supersededBy, 'ADR-004')
})

test('adr-state resolves a supersession by stem', () => {
  const clean = adrState(gitRepository(dateCorpus()))
  assert.deepEqual(clean.danglingSupersession, [])
  // The dirty control: a supersession naming a stem no record has still dangles.
  const dirty = adrState(gitRepository(dateCorpus({ effect: 'superseded by `docs/adr/2026-08-01-nothing.md`' })))
  assert.deepEqual(dirty.danglingSupersession.map(entry => entry.id), [OLD])
})

test('the JS and Python identity rules agree on one table', () => {
  assert.equal(typeof lifecycle.recordId, 'function', 'lifecycle exports the identity rule')
  assert.equal(typeof lifecycle.referencesIn, 'function', 'lifecycle exports the reference rule')
  const python = recordLib(`[record.record_id(n, t) for n, t in ${pyLiteral(IDENTITY_TABLE)}]`)
  assert.deepEqual(IDENTITY_TABLE.map(([name, title]) => lifecycle.recordId(name, title)), python)
  const pyRefs = recordLib(`[sorted(record.references_in(t)) for t in ${JSON.stringify(REFERENCE_TABLE)}]`)
  assert.deepEqual(REFERENCE_TABLE.map(text => [...lifecycle.referencesIn(text)].sort()), pyRefs)
})

// --- T3: adr-verify never reads a date as a record number ----------------------
//
// `record_number_of` read `2026-07-15-x` as record 2026. With `strictFrom` at 100
// that erred strict, and nobody noticed; a guard that stays unanchored reads 26 and
// demotes the task. So the cutoff here is 2100, ABOVE 2026: today a dated record
// is demoted, which is the red, and after the fix it has no number and is not.
const STRICT_MARK = ' [strictFrom]'

/** Drop the ` · ms:N` run time from a task's evidence rows, keeping each digest. */
function stripRunTime(file) {
  writeFileSync(file, readFileSync(file, 'utf8').replace(/( · acceptance-sha256:[0-9a-f]{64}) · ms:\d+$/gm, '$1'))
}

function sweepCorpus() {
  const root = scratch('sweep')
  writeTree(root, { '.quality-harness.json': '{"strictFrom": 2100}\n', 'ok.flag': 'present\n' })
  gitRepository(root)
  // Three controls, each numbered by ONE route: its name (`012-x`), only its title
  // (`control-x`, `# ADR-004`), and only a title found by the record's FULL name
  // (`v1.2-notes`, whose `Path.with_suffix` would be `v1.md`).
  const titles = { 'control-x': 'ADR-004: control', 'v1.2-notes': 'ADR-007: dotted' }
  const names = ['2026-07-15-x', '2026_07_15_x', '2026.07.15.x', '012-x', 'control-x', 'v1.2-notes']
  for (const name of names) {
    writeTree(root, {
      [`docs/adr/${name}.md`]: record(titles[name] ?? name, 'Accepted'),
      [`docs/adr/${name}/tasks/T1-a.md`]: `# Task T1: a\n\n## Acceptance\n\n\`\`\`bash\ntest -f ok.flag\n\`\`\`\n\n## Verification Log\n\n`,
    })
    const run = runPython([join(bin, 'adr-verify'), join(root, 'docs', 'adr', name, 'tasks', 'T1-a.md')],
      { cwd: root, encoding: 'utf8', timeout: 60_000 })
    assert.equal(run.status, 0, `the claim for ${name} must be recorded: ${run.stdout}${run.stderr}`)
    // ⚠ The sweep's CLAIM_RE ends the row at the digest, so a row carrying the
    // ` · ms:N` suffix adr-verify now writes is not a claim to it (BACKLOG §257).
    // Strip the suffix and leave the digest: the row the sweep has always read.
    stripRunTime(join(root, 'docs', 'adr', name, 'tasks', 'T1-a.md'))
  }
  // Every claim now fails on its own terms, so the sweep lists each as FALSE and
  // marks the ones strictFrom demotes.
  rmSync(join(root, 'ok.flag'))
  const sweep = runPython([join(bin, 'adr-verify'), '--sweep', join(root, 'docs')], { cwd: root, encoding: 'utf8', timeout: 120_000 })
  return `${sweep.stdout}${sweep.stderr}`.split('\n').filter(line => line.startsWith('FALSE'))
}

test('adr-verify reads no record number from a date in any separator', () => {
  const lines = sweepCorpus()
  const lineFor = name => lines.find(line => line.includes(`${sep}${name}${sep}tasks${sep}`) || line.includes(`/${name}/tasks/`))
  for (const dated of ['2026-07-15-x', '2026_07_15_x', '2026.07.15.x']) {
    const line = lineFor(dated)
    assert.ok(line, `the sweep lists the false claim of ${dated}: ${lines.join(' | ')}`)
    assert.ok(!line.endsWith(STRICT_MARK), `a dated record has no number, so strictFrom cannot demote it: ${line}`)
  }
  // The controls: a numbered record below the cutoff IS demoted, by each route.
  for (const numbered of ['012-x', 'control-x', 'v1.2-notes']) {
    const line = lineFor(numbered)
    assert.ok(line && line.endsWith(STRICT_MARK), `record ${numbered} is below 2100 and demoted: ${line}`)
  }
})

// --- The different-lineage review of 2026-09-22: one test per finding -----------
//
// Codex read the branch and built a probe for each defect below against both the
// base and the target. Each test is that probe through the real gate or reader.
const NOTE_OBLIGATIONS = /ADR-001: archive has 4 obligation\(s\), active receipt has 2/
const OPEN_ITEM = '# A note\n\n## Follow-ups\n\n- [ ] An item the archive still owes.\n'

test('a note inside a record directory belongs to that record', () => {
  // F1: a note named like a dated record, and one named like record 2, inside
  // ADR-001's directory. Each owes an item, and ADR-001 has only two receipts.
  const root = numberedCorpus({
    'adr-archive/ADR-001-history/2026-07-15-notes.md': OPEN_ITEM,
    'adr-archive/ADR-001-history/002-plan.md': OPEN_ITEM,
  })
  assert.match(retire(root).out, NOTE_OBLIGATIONS)
})

test('a numbered attachment keeps its place in the decision unit', () => {
  // F5: `notes-ADR-001.txt` has no numbered heading and no dated name. The gate read
  // its ADR-001 token before ADR-063, and a seal taken then must still match.
  const got = retire(numberedCorpus({ 'adr-archive/notes-ADR-001.txt': 'kept with the record\n' }))
  assert.equal(got.status, 0, got.out)
})

test('a supersession names its first reference, not any that resolves', () => {
  // F2: the replacement is missing; a second reference that does exist must not
  // stand in for it.
  const got = retire(dateCorpus({ effect: `superseded by \`docs/adr/2026-08-01-nothing.md\` (see \`docs/adr/${NEW}.md\`)` }))
  assert.equal(got.status, 1, got.out)
  assert.match(got.out, NO_REPLACEMENT)
})

test('adr-retire-check --adopt names an unidentified record as advice', () => {
  // F7: the catalog check named it; adoption dropped it in silence.
  const root = numberedCorpus()
  writeTree(root, { 'adr/research.md': record('Research on caching', 'Draft') })
  assert.match(retire(root, '--adopt', 'adr', 'adr-archive').out, RESEARCH_ADVICE)
})

test('a catalog this reader cannot read leaves a dated record unproven, not absent', () => {
  // F3: a catalog listed under another spelling is one this reader cannot trust.
  const root = dateCorpus()
  const readme = join(root, 'adr-archive', 'README.md')
  // A rename, not a copy and a delete: on a case-insensitive filesystem the copy
  // would land on README.md itself and the delete would remove the catalog.
  renameSync(readme, join(root, 'adr-archive', 'readme.md'))
  const records = lifecycle.adrCorpus(root, { tracked: listing(root) })
  assert.equal(records.look, 'PARTIAL', 'an unreadable catalog is could-not-look')
  const seen = [...records, ...records.unreadable].map(entry => entry.file)
  assert.ok(seen.some(file => file.endsWith(`${OLD}.md`) && file.includes('adr-archive')), 'the archived record is still listed')
})

test('a supersession that names no record is unproven, not a graveyard', () => {
  // F4: `superseded by banana` was an authoritative effect with no replacement.
  const root = dateCorpus({ effect: 'superseded by banana' })
  const records = lifecycle.adrCorpus(root, { tracked: listing(root) })
  assert.equal(records.look, 'PARTIAL')
  assert.ok(!records.some(entry => entry.id === OLD && entry.kind === 'graveyard'), 'banana names no replacement')
})

test('a numbered supersession is read in every spelling a status uses', () => {
  // F6: these three resolved to record 4 before ADR-063 and to nothing after it.
  const root = dateCorpus()
  writeTree(root, {
    'adr/ADR-004-new.md': record('ADR-004: New', 'Accepted'),
    'adr/ADR-005-a.md': record('ADR-005: A', 'Superseded by ADR 004'),
    'adr/ADR-006-b.md': record('ADR-006: B', 'Superseded by ADR_004'),
    'adr/ADR-007-c.md': record('ADR-007: C', 'Superseded by ADR004'),
    'adr/ADR-008-d.md': record('ADR-008: D', 'Superseded by ADR 2026-07-15 app-tier'),
  })
  const byId = new Map(lifecycle.adrCorpus(root, { tracked: listing(root) }).map(entry => [entry.id, entry]))
  for (const id of ['ADR-005', 'ADR-006', 'ADR-007']) assert.equal(byId.get(id)?.supersededBy, 'ADR-004', id)
  // A date after `ADR` is still never a record number.
  assert.notEqual(byId.get('ADR-008')?.supersededBy, 'ADR-2026')
})

test('both identity rules read ASCII digits only', () => {
  // F8: Python's `\d` matched Unicode digits, so the two copies disagreed.
  const names = [['ADR-٠١٢-x.md', null], ['٢٠٢٦-07-15-x.md', null], ['ADR-012-x.md', null]]
  assert.deepEqual(names.map(([name, title]) => lifecycle.recordId(name, title)),
    recordLib(`[record.record_id(n, t) for n, t in ${pyLiteral(names)}]`))
  const texts = ['see ADR-１２ and ADR-12']
  assert.deepEqual(texts.map(text => [...lifecycle.referencesIn(text)].sort()),
    recordLib(`[sorted(record.references_in(t)) for t in ${JSON.stringify(texts)}]`))
})

// --- Round 2 of the different-lineage review: one test per finding ------------

/** `adr_id_for_file` from the real gate, loaded as a module (it runs nothing on import). */
function ownerOf(root, rel, known) {
  const code = [
    'import importlib.machinery, importlib.util, json, sys',
    `sys.path.insert(0, ${JSON.stringify(lib)})`,
    `loader = importlib.machinery.SourceFileLoader('retire', ${JSON.stringify(join(bin, 'adr-retire-check'))})`,
    'spec = importlib.util.spec_from_loader("retire", loader)',
    'gate = importlib.util.module_from_spec(spec)',
    'loader.exec_module(gate)',
    'from pathlib import Path',
    `print(json.dumps(gate.adr_id_for_file(Path(${JSON.stringify(join(root, ...rel.split('/')))}), Path(${JSON.stringify(root)}), frozenset(${JSON.stringify(known)}))))`,
  ].join('\n')
  const run = runPython(['-c', code], { encoding: 'utf8', timeout: 60_000 })
  assert.equal(run.status, 0, run.stderr)
  return JSON.parse(run.stdout)
}

test('a record is its own record, not a companion of a shorter stem', () => {
  // R2: `2026-07-15-old.v2.md` is a record; it must not belong to `2026-07-15-old`.
  const root = scratch('owner')
  writeTree(root, {
    '2026-07-15-old.v2.md': record('Old, version two', 'Accepted'),
    '2026-07-15-old.queries.md': '# Queries\n\nSELECT 1;\n',
  })
  const known = ['2026-07-15-old', '2026-07-15-old.v2']
  assert.equal(ownerOf(root, '2026-07-15-old.v2.md', known), '2026-07-15-old.v2')
  // The control: a non-record companion still belongs to the record it extends.
  assert.equal(ownerOf(root, '2026-07-15-old.queries.md', known), '2026-07-15-old')
})

test('a dated filename in a supersession is a name, not a prose date', () => {
  // R3: `docs/adr/2026-08-01.md` names a record that is missing; ADR-063's
  // replacement check must not skip it and take the existing record after it.
  const got = retire(dateCorpus({ effect: `superseded by docs/adr/2026-08-01.md (see \`docs/adr/${NEW}.md\`)` }))
  assert.equal(got.status, 1, got.out)
  assert.match(got.out, NO_REPLACEMENT)
})

test('a numbered supersession needs a whole identifier', () => {
  // R4: `ADR-004oops` is not record 4.
  const root = dateCorpus({ effect: 'superseded by ADR-004oops' })
  const records = lifecycle.adrCorpus(root, { tracked: listing(root) })
  assert.equal(records.look, 'PARTIAL')
  assert.ok(!records.some(entry => entry.id === OLD && entry.kind === 'graveyard'))
})

test('both identity rules read a title the same way whatever its whitespace', () => {
  // R5: `re.ASCII` changed `\s` too, so a no-break space split the two copies.
  const table = [['notes.md', '# ADR-012: X'], ['2026-07-15-x.md', '# ADR-012: X'], ['notes.md', '#\tADR-7: y']]
  assert.deepEqual(table.map(([name, title]) => lifecycle.recordId(name, title)),
    recordLib(`[record.record_id(n, t) for n, t in ${pyLiteral(table)}]`))
})

// --- Round 3 of the different-lineage review --------------------------------------
test('a numbered attachment keeps its ADR token over an ADR-named directory', () => {
  // R4 of round 3: the token in the file's own name came first before ADR-063.
  const root = scratch('owner-numbered')
  writeTree(root, { 'ADR-999-notes/notes-ADR-001.txt': 'kept\n', 'ADR-001-old/2026-07-15-notes.md': '# A note\n' })
  assert.equal(ownerOf(root, 'ADR-999-notes/notes-ADR-001.txt', []), 'ADR-001')
  assert.equal(ownerOf(root, 'ADR-001-old/2026-07-15-notes.md', []), 'ADR-001')
})

test('a record-shaped file under tasks belongs to its record, not to its own name', () => {
  // R1 of round 3: a task is not enumerated as a record, so its own name would
  // take its obligations out of every count.
  const root = scratch('owner-task')
  writeTree(root, { '2026-07-15-old/tasks/2026-07-15-old.T1.md': record('Task one', 'done') })
  assert.equal(ownerOf(root, '2026-07-15-old/tasks/2026-07-15-old.T1.md', ['2026-07-15-old']), '2026-07-15-old')
})

test('a companion belongs to the longest stem it extends, whatever the set order', () => {
  // R3 of round 3: the first prefix a frozenset yields depended on the hash seed.
  const root = scratch('owner-longest')
  writeTree(root, { '2026-07-15-old.v2.queries.md': '# Queries\n' })
  for (const known of [['2026-07-15-old', '2026-07-15-old.v2'], ['2026-07-15-old.v2', '2026-07-15-old']]) {
    assert.equal(ownerOf(root, '2026-07-15-old.v2.queries.md', known), '2026-07-15-old.v2')
  }
})

test('a Unicode-digit title names no record in either rule', () => {
  // R2 of round 3: the heading token read `# ADR-٠١٢` as record 12 while the
  // record itself was enumerated by its dated stem.
  const root = scratch('owner-unicode')
  writeTree(root, { '2026-07-15-x.md': record('ADR-٠١٢: X', 'Accepted') })
  assert.equal(ownerOf(root, '2026-07-15-x.md', ['2026-07-15-x']), '2026-07-15-x')
  assert.equal(recordLib('record.first_number_id("# ADR-٠١٢: X")'), null)
})

test('the exclusion guards read any decimal digit, in both copies', () => {
  // R7 of round 3: adr-lint excluded these names before, and still must.
  assert.equal(recordLib('bool(record.TASK_SHAPED_RE.match("003-T٢-plan"))'), true)
  assert.equal(recordLib('bool(record.DATE_SHAPED_RE.match("2026-٠٧-15-notes.md"))'), true)
  const names = [['003-T٢-plan.md', null], ['2026-٠٧-15-notes.md', null]]
  assert.deepEqual(names.map(([name, title]) => lifecycle.recordId(name, title)),
    recordLib(`[record.record_id(n, t) for n, t in ${pyLiteral(names)}]`))
})

test('a supersession by a bare number is the first reference too', () => {
  // R5 of round 3: `999 (see ADR-002)` named 999 before ADR-063.
  const root = dateCorpus()
  writeTree(root, {
    'adr/ADR-002-kept.md': record('ADR-002: Kept', 'Accepted'),
    'adr/ADR-010-a.md': record('ADR-010: A', 'Superseded by 999 (see ADR-002)'),
    'adr/ADR-011-b.md': record('ADR-011: B', 'Superseded by not_ADR-002'),
  })
  const byId = new Map(lifecycle.adrCorpus(root, { tracked: listing(root) }).map(entry => [entry.id, entry]))
  assert.equal(byId.get('ADR-010')?.supersededBy, 'ADR-999')
  // R6 of round 3: `not_ADR-002` is not a reference to ADR-002.
  assert.notEqual(byId.get('ADR-011')?.supersededBy, 'ADR-002')
})
