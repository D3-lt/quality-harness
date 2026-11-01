// ADR-137 T2: the core's decision context (dcDecisionContext in core/hooks/decisioncorpus_read.go) gives the exact text
// plugin/scripts/decision-corpus.mjs's decisionContext gives, for every path of every replayed corpus: each corpus under
// tests/fixtures/corpora, tests/fixtures/ok (its archive), tests/fixtures/foreign, two corpora built here for the budgets, the
// five-per-group cut, the archive walk and the unproven arm, and a clone of this repository. Each is copied into a scratch git
// repository first: read in place, every path sits under `fixtures`, an uninteresting directory, and every answer is empty on
// both sides, which would look like parity. The rows are every tracked path, every path a record declares, and paths nothing
// governs; each row's answer is Node's decisionContext text for that absolute path, run live. Node's answer depends on the file
// only through which records it hits, so decisionContext runs once per distinct set of records (decisionsGoverning over one
// corpus read says which), and every row of the set carries that text. The Go test (TestDecisionContextReplay in
// core/hooks/decisioncorpus_replay_test.go) reads each corpus once and answers every row. Skipped, with the reason, where `go`
// is not on PATH.
// ADR-137 T3 adds the hook itself: the native PreToolUse (qh hook PreToolUse) with no node on PATH says what Node's
// decisionContext says, under every spelling of a symlinked root; and the 64 MiB content-screen budget, which a corpus here
// spends so that it changes the text.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, realpathSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { remove } from './helpers/remove.mjs'
import { required } from './helpers/require.mjs'
import { adrCorpus, decisionContext, decisionsGoverning, trackedPaths, unmarkedArchives } from '../plugin/scripts/decision-corpus.mjs'
import { sourceCore } from './helpers/source-core.mjs'

// A mutation run keeps a suite binary in QUALITY_HARNESS_QH_BIN, which sourceCore returns as it is: the hook test would then
// exercise an unmutated core. Build from this tree instead, as branch-state-native.test.mjs does.
if (process.env.QUALITY_HARNESS_MUTATION_IN_FLIGHT === '1') delete process.env.QUALITY_HARNESS_QH_BIN

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '..')
const coreDir = path.join(repoRoot, 'core')
const corporaDir = path.join(repoRoot, 'tests', 'fixtures', 'corpora')
const goVersion = spawnSync('go', ['version'], { encoding: 'utf8', timeout: 30_000, windowsHide: true })
const noGo = required('go', goVersion.error || goVersion.status !== 0
  ? `go is not on PATH (${goVersion.error?.code ?? `exit ${goVersion.status}`}), so the Go core cannot be built here` : false)

// Budgets this test sets for itself (CLAUDE.md §7): a Windows runner can be several times slower than a laptop.
const GIT_BUDGET_MS = 300_000
const GO_BUDGET_MS = 900_000
const TEST_BUDGET_MS = 1_800_000

const GIT_ENV = { ...process.env, GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@example.invalid',
  GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@example.invalid' }

function git(cwd, args) {
  const ran = spawnSync('git', args, { cwd, env: GIT_ENV, encoding: 'utf8', timeout: GIT_BUDGET_MS, windowsHide: true })
  assert.equal(ran.status, 0, `git ${args.join(' ')} in ${cwd}: ${ran.error?.code ?? ''} ${ran.stderr}`)
  return ran.stdout
}

// A directory as its own repository: copied, never read in place, and every file added to the index.
function stage(scratch, name, source) {
  const root = path.join(scratch, name)
  if (source) cpSync(source, root, { recursive: true })
  git(root, ['init', '-q', '.'])
  git(root, ['add', '-A', '.'])
  return root
}

function writeTree(root, files) {
  for (const [rel, text] of Object.entries(files)) {
    const at = path.join(root, ...rel.split('/'))
    mkdirSync(path.dirname(at), { recursive: true })
    writeFileSync(at, text)
  }
}

const record = (id, title, body = '', status = 'Accepted') => `# ${id}: ${title}\n\n**Status:** ${status}\n${body}\n\n## Decision\n\nx\n`
const catalog = rows => ['# Archive', '', '**Lifecycle:** Frozen historical ADR records', '', '## Retired Records', '',
  '| ADR | Title | Decision effect | Retired |', '|-----|-------|-----------------|---------|', ...rows, ''].join('\n')

// 201 records: the first six govern one file, so the cut at five shows `(+1 more)`, and the 201st is past the record budget,
// so the file it governs is governed by nothing.
function budgetCorpus(scratch) {
  const root = path.join(scratch, 'synthetic-budget')
  const files = { 'src/many.js': 'x\n', 'src/late.js': 'x\n' }
  for (let n = 1; n <= 201; n++) {
    const id = `ADR-${String(n).padStart(3, '0')}`
    const governs = n <= 6 ? '**Governs:** `src/many.js`' : n === 201 ? '**Governs:** `src/late.js`' : ''
    files[`docs/adr/${id}-r.md`] = record(id, `Record ${n}`, governs)
  }
  writeTree(root, files)
  return stage(scratch, 'synthetic-budget', null)
}

// A record past 512 KiB, one with a NUL byte, a frozen record one level below its archive's catalog, and a frozen record its
// catalog has no row for (UNPROVEN).
function limitsCorpus(scratch) {
  const root = path.join(scratch, 'synthetic-limits')
  writeTree(root, {
    'src/big.js': 'x\n', 'src/nul.js': 'x\n', 'src/w.js': 'x\n', 'src/u.js': 'x\n',
    'docs/adr/ADR-001-big.md': record('ADR-001', 'Big', `**Governs:** \`src/big.js\`\n\n${'x'.repeat(600 * 1024)}`),
    'docs/adr/ADR-002-small.md': record('ADR-002', 'Small', '**Governs:** `src/big.js`'),
    'docs/adr/ADR-005-nul.md': `${record('ADR-005', 'Nul', '**Governs:** `src/nul.js`')}\u0000`,
    'docs/adr-archive/README.md': catalog(['| [ADR-003](ADR-003-nested/ADR-003-nested.md) | Nested | withdrawn | 2026-10-07 |']),
    'docs/adr-archive/ADR-003-nested/ADR-003-nested.md': record('ADR-003', 'Nested', '**Governs:** `src/w.js`'),
    'docs/adr-archive/ADR-004-orphan.md': record('ADR-004', 'Orphan', '**Governs:** `src/u.js`'),
  })
  return stage(scratch, 'synthetic-limits', null)
}

// Every replayed corpus, each in its own scratch repository.
function corpora(scratch) {
  const out = []
  for (const name of readdirSync(corporaDir).sort()) {
    const source = path.join(corporaDir, name)
    if (statSync(source).isDirectory()) out.push({ name, root: stage(scratch, name, source) })
  }
  out.push({ name: 'ok', root: stage(scratch, 'ok', path.join(repoRoot, 'tests', 'fixtures', 'ok')) })
  out.push({ name: 'foreign', root: stage(scratch, 'foreign', path.join(repoRoot, 'tests', 'fixtures', 'foreign')) })
  out.push({ name: 'synthetic-budget', root: budgetCorpus(scratch) })
  out.push({ name: 'synthetic-limits', root: limitsCorpus(scratch) })
  // This repository's own corpus, as the branch committed it: a clone into this test's directory (CLAUDE.md §9).
  const clone = path.join(scratch, 'this-repository')
  // `-c` after `clone`, so the setting is stored in the clone: archived paths here pass MAX_PATH in a deep Windows directory (CLAUDE.md §7).
  git(scratch, ['clone', '-q', '-c', 'core.longpaths=true', repoRoot, clone])
  assert.equal(git(clone, ['rev-parse', 'HEAD']).trim(), git(repoRoot, ['rev-parse', 'HEAD']).trim(), 'the clone is of this branch')
  out.push({ name: 'this-repository', root: clone, self: true })
  return out
}

const NOTHING_GOVERNS = ['never/governed/by-anything.txt', 'docs/never-governed.md', '../outside-the-root.txt']

function rowsFor(root) {
  const tracked = trackedPaths(root)
  assert.ok(Array.isArray(tracked), `git could not list ${root}`)
  const corpus = adrCorpus(root, { tracked })
  const unproven = corpus.unreadable.filter(entry => typeof entry.unproven === 'string' && Array.isArray(entry.governs))
  const declared = [...corpus, ...unproven].flatMap(entry => entry.governs)
  const answers = new Map()
  const rows = [...new Set([...tracked, ...declared, ...NOTHING_GOVERNS])].map(rel => {
    const file = path.join(root, rel)
    const found = decisionsGoverning([file], root, corpus)
    const names = group => group.map(entry => path.relative(root, entry.file).replaceAll('\\', '/'))
    const records = { governing: names(found.governing), graveyard: names(found.graveyard), unproven: names(found.unproven) }
    // Keyed on the records' exact files, never a separator-normalised name: on POSIX `docs/adr/x.md` and a file named
    // `docs\adr\x.md` are two records with two texts (the Codex review of 8d872045..980dd773, part A2).
    const key = JSON.stringify([found.governing, found.graveyard, found.unproven].map(group => group.map(entry => entry.file)))
    if (!answers.has(key)) answers.set(key, decisionContext([file], root))
    return { file, want: answers.get(key), records }
  })
  const governs = corpus.some(entry => (entry.kind === 'governing' || entry.kind === 'graveyard') && entry.governs.length > 0)
    || unproven.some(entry => entry.governs.length > 0)
  return { rows, governs, distinct: answers.size }
}

test('the core gives the decision context Node gives over every replayed corpus', { skip: noGo, timeout: TEST_BUDGET_MS }, t => {
  const scratch = mkdtempSync(path.join(os.tmpdir(), 'qh-dcreplay-'))
  t.after(() => remove(scratch))
  const replayed = corpora(scratch).map(({ name, root, self }) => ({ name, root, self, ...rowsFor(root) }))
  for (const { name, rows, governs, self } of replayed) {
    const answered = rows.filter(row => row.want !== '').length
    t.diagnostic(`${name}: ${rows.length} rows, ${answered} with an answer`)
    if (governs) assert.ok(answered > 0, `${name} has records that govern paths, and no row's answer names one`)
    if (self) assert.ok(rows.some(row => row.want.startsWith('Decisions that govern what you are about to change:')), 'no row of this repository is governed by a decision')
  }
  for (const marker of ['(+1 more)', 'UNPROVEN —', 'Already decided against here', 'Recorded but not resolved by this tool:']) {
    assert.ok(replayed.some(corpus => corpus.rows.some(row => row.want.includes(marker))), `no row's answer carries ${marker}, so that arm is not compared`)
  }
  const total = replayed.reduce((sum, corpus) => sum + corpus.rows.length, 0)
  const file = path.join(scratch, 'replay.json')
  writeFileSync(file, JSON.stringify({ corpora: replayed.map(({ name, root, rows }) => ({ name, root, rows })) }))
  const ran = spawnSync('go', ['test', '-count=1', '-v', '-run', '^TestDecisionContextReplay$', './hooks/'], {
    cwd: coreDir, encoding: 'utf8', timeout: GO_BUDGET_MS, windowsHide: true, env: { ...process.env, QH_DECISION_CONTEXT_REPLAY: file },
  })
  const said = `${ran.stdout}\n${ran.stderr}`
  assert.equal(ran.status, 0, `the Go decision context disagrees with Node's (or did not run):\n${said.split('\n').slice(-120).join('\n')}`)
  // A Go test that skipped, or matched nothing, exits 0 too: the count it compared is what says it ran, over every row.
  assert.match(said, new RegExp(`${total} rows compared, 0 disagreements`))
})

// BACKLOG §439's class in core/hooks/orientation.go: JavaScript's /i without `u` folds no letter outside ASCII into one inside
// it, where Go's (?i) folds U+017F into s and U+212A into k. Each listing is answered by Node's unmarkedArchives (the name test
// SessionStart uses) and by the core's.
const ARCHIVE_NAMES = [
  'archiveſ/ADR-001-x.md', 'adr-archiveſ/0001-x.md', 'archives-adrſ/ADR-1-x.md', 'archive-recordſ/ADR-2-x.md',
  'archive-decisionſ/0002-y.md', 'templateſ/archive/ADR-3-x.md', 'TEMPLATEſ/archive/ADR-5.md', 'Templates/archive/ADR-4-x.md',
  'archive/ADR-6-x.md', 'ARCHIVE/ADR-7-x.md', 'docs/Archived/ADR-8-x.md', 'archiveK/ADR-9-x.md', 'decisions-archive/tasks/T1-x.md',
  'docs/templates/archive/ADR-10-x.md', 'ARCHIVES_RECORDS/2026-01-02-x.md', 'archive-adrK/ADR-11-x.md',
]

test('the core names unmarked archives as Node does, folding no letter outside ASCII', { skip: noGo, timeout: GO_BUDGET_MS }, t => {
  const scratch = mkdtempSync(path.join(os.tmpdir(), 'qh-dcarchives-'))
  t.after(() => remove(scratch))
  const rows = [...ARCHIVE_NAMES.map(name => [name]), ARCHIVE_NAMES]
    .map(listing => ({ root: scratch, listing, want: unmarkedArchives(scratch, listing) }))
  // Both answers occur, or the rows distinguish nothing.
  assert.ok(rows.some(row => row.want.length === 0) && rows.some(row => row.want.length > 0))
  const file = path.join(scratch, 'archives.json')
  writeFileSync(file, JSON.stringify({ rows }))
  const ran = spawnSync('go', ['test', '-count=1', '-v', '-run', '^TestUnmarkedArchivesParity$', './hooks/'], {
    cwd: coreDir, encoding: 'utf8', timeout: GO_BUDGET_MS, windowsHide: true, env: { ...process.env, QH_UNMARKED_ARCHIVES_ROWS: file },
  })
  const said = `${ran.stdout}\n${ran.stderr}`
  assert.equal(ran.status, 0, `the core's unmarked archives disagree with Node's (or did not run):\n${said.split('\n').slice(-60).join('\n')}`)
  assert.match(said, new RegExp(`${rows.length} rows compared, 0 disagreements`))
})

// A PATH that holds git and no node (on Windows, git's own directory and System32), so a hook that spawns node cannot answer.
function pathWithoutNode(bin) {
  const where = spawnSync(process.platform === 'win32' ? 'where.exe' : '/bin/sh',
    process.platform === 'win32' ? ['git.exe'] : ['-c', 'command -v git'], { encoding: 'utf8', timeout: 5_000, windowsHide: true })
  const gitBin = (where.stdout ?? '').split(/\r?\n/).map(line => line.trim()).find(Boolean)
  assert.ok(gitBin, `git is not locatable, so the PATH without node cannot be built: ${where.stderr}`)
  mkdirSync(bin, { recursive: true })
  let dirs = [bin]
  if (process.platform === 'win32') {
    dirs = [path.dirname(gitBin), path.join(process.env.SystemRoot || process.env.SYSTEMROOT, 'System32')]
  } else {
    writeFileSync(path.join(bin, 'git'), `#!/bin/sh\nexec "${gitBin}" "$@"\n`)
    chmodSync(path.join(bin, 'git'), 0o755)
  }
  for (const dir of dirs) {
    for (const name of ['node', 'node.exe']) assert.ok(!existsSync(path.join(dir, name)), `${dir} holds ${name}, so the PATH has node on it`)
  }
  return dirs.join(path.delimiter)
}

// ADR-137 T3: pending.go asks the Go reader, not `node adr-context.mjs --hook`. The corpus is reached through each spelling of
// its root (the temporary directory as named, its real path, a link to it: /var and /private/var on macOS), and the answer is
// Node's decisionContext for the file and root the Node hook saw: both real paths, since the hook resolved the file and
// spawned node in the canonical root, whose process.cwd() is that real path.
test('PreToolUse names the governing decisions with no node on PATH', { skip: noGo, timeout: GO_BUDGET_MS }, t => {
  const scratch = mkdtempSync(path.join(os.tmpdir(), 'qh-dchook-'))
  t.after(() => remove(scratch))
  const root = path.join(scratch, 'corpus')
  writeTree(root, {
    'src/governed.js': 'x\n', 'src/free.js': 'x\n',
    'docs/adr/ADR-001-keep.md': record('ADR-001', 'Keep', '**Governs:** `src/governed.js`\n**Enforced-by:** `tests/governed.test.mjs`'),
    'docs/adr/ADR-002-dropped.md': record('ADR-002', 'Dropped', '**Governs:** `src/governed.js`', 'Rejected'),
  })
  stage(scratch, 'corpus', null)
  const real = realpathSync.native(root)
  const linked = path.join(scratch, 'linked')
  symlinkSync(root, linked, 'junction')
  const qh = sourceCore()
  const env = { ...process.env, CLAUDE_PLUGIN_ROOT: path.join(repoRoot, 'plugin'), CLAUDE_PLUGIN_DATA: path.join(scratch, 'data') }
  for (const key of Object.keys(env)) if (/^path$/i.test(key)) delete env[key]
  env.PATH = pathWithoutNode(path.join(scratch, 'bin'))
  const hook = (top, rel, session) => {
    const ran = spawnSync(qh, ['hook', 'PreToolUse'], {
      cwd: top, env, encoding: 'utf8', timeout: 60_000, windowsHide: true,
      input: JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Edit', cwd: top, session_id: session,
        tool_input: { file_path: path.join(top, ...rel.split('/')), old_string: 'x', new_string: 'y' } }),
    })
    assert.equal(ran.status, 0, `qh hook PreToolUse in ${top}: ${ran.error?.code ?? ''} ${ran.stderr}`)
    return ran.stdout
  }
  const spellings = [...new Set([root, real, linked])]
  assert.ok(spellings.length >= 2, 'the root has one spelling, so no symlinked root is compared')
  for (const [n, top] of spellings.entries()) {
    const want = decisionContext([realpathSync.native(path.join(top, 'src', 'governed.js'))], real)
    assert.match(want, /^Decisions that govern what you are about to change:\n {2}docs[\\/]adr[\\/]ADR-001-keep\.md — ADR-001: Keep {2}\[caught by: tests\/governed\.test\.mjs\]\n/)
    assert.match(want, /\nAlready decided against here[^\n]*\n {2}docs[\\/]adr[\\/]ADR-002-dropped\.md — ADR-002: Dropped \[Rejected\]$/)
    const said = hook(top, 'src/governed.js', `nonode-${n}`)
    assert.ok(said.trim(), `the hook said nothing for ${top}`)
    assert.equal(JSON.parse(said).hookSpecificOutput.additionalContext, want, `the hook's context under ${top}`)
    // A file nothing governs costs the edit nothing.
    assert.equal(hook(top, 'src/free.js', `nonode-free-${n}`), '', `an ungoverned file under ${top}`)
  }
})

// The 64 MiB content-screen budget (SCREEN_BUDGET, dcScreenBudget): a non-record note past it, listed before a record only the
// screen admits, leaves that record unexamined, so the file it governs is governed by nothing. Node's answer with the budget
// lifted names the record, so the budget is what the compared text depends on.
test('the core spends the 64 MiB content-screen budget as Node does', { skip: noGo, timeout: GO_BUDGET_MS }, t => {
  const scratch = mkdtempSync(path.join(os.tmpdir(), 'qh-dcscreen-'))
  t.after(() => remove(scratch))
  const root = path.join(scratch, 'synthetic-screen')
  writeTree(root, {
    'src/screened.js': 'x\n', 'src/kept.js': 'x\n',
    'docs/adr/ADR-001-kept.md': record('ADR-001', 'Kept', '**Governs:** `src/kept.js`'),
    'notes/aa-big.md': 'just a note\n'.repeat(Math.ceil((65 * 1024 * 1024) / 12)),
    'notes/zz-screened.md': record('ADR-002', 'Screened', '**Governs:** `src/screened.js`'),
  })
  stage(scratch, 'synthetic-screen', null)
  const file = path.join(root, 'src', 'screened.js')
  const lifted = decisionsGoverning([file], root, adrCorpus(root, { screenBudget: Number.MAX_SAFE_INTEGER }))
  assert.deepEqual(lifted.governing.map(entry => path.basename(entry.file)), ['zz-screened.md'], 'without the budget the screen admits the record')
  const { rows } = rowsFor(root)
  assert.equal(rows.find(row => row.file === file).want, '', 'the budget leaves the record unexamined')
  assert.ok(rows.some(row => row.want !== ''), 'no row of the screen corpus has an answer')
  const replay = path.join(scratch, 'replay.json')
  writeFileSync(replay, JSON.stringify({ corpora: [{ name: 'synthetic-screen', root, rows }] }))
  const ran = spawnSync('go', ['test', '-count=1', '-v', '-run', '^TestDecisionContextReplay$', './hooks/'], {
    cwd: coreDir, encoding: 'utf8', timeout: GO_BUDGET_MS, windowsHide: true, env: { ...process.env, QH_DECISION_CONTEXT_REPLAY: replay },
  })
  const said = `${ran.stdout}\n${ran.stderr}`
  assert.equal(ran.status, 0, `the Go decision context disagrees with Node's over the screen budget (or did not run):\n${said.split('\n').slice(-60).join('\n')}`)
  assert.match(said, new RegExp(`${rows.length} rows compared, 0 disagreements`))
})
