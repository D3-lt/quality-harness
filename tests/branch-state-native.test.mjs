// ADR-135 T3: the core's `qh bridge branch-state` (QH_BRANCH_STATE_NATIVE=1) against the Node CLI it replaces. The subprocess
// scenarios of the locked tests (branch-state.test.mjs, -cwd, -moved, -own-commit) run twice over one fixture, reset between,
// through `node plugin/scripts/branch-state.mjs` and through the built core, with the same stub `gh` on PATH; the stdout and the
// snapshot each step leaves must agree once the clock is taken out. Node is not on the PATH either runs with, so a core that fell
// back to spawning the Node CLI fails here instead of agreeing with itself.
//
// The one difference ADR-135 Decision 2 makes is a due brief: Node serves the snapshot and refreshes it behind the prompt
// ("; refreshing"); the core refreshes inline under its budget and, when that refresh is cut, serves the snapshot marked so
// ("; not refreshed within 2s"). Those steps give the core a `gh` slower than the budget, a young lock keeps Node's refresher
// from starting, and the two suffixes are compared as one token. The second test holds the core's half of Decision 2 alone.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { appendFileSync, chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { snapshotKey } from '../plugin/scripts/branch-state.mjs'
import { sessionLogFile } from '../plugin/scripts/event-log.mjs'
import { remove } from './helpers/remove.mjs'
import { sourceCore } from './helpers/source-core.mjs'

// A mutation run keeps a suite binary in QUALITY_HARNESS_QH_BIN, which sourceCore returns as it is: these assertions would then
// exercise an unmutated core (the Codex review of ad84c084..a2ac47a1). Build from this tree instead, as native-observation does.
if (process.env.QUALITY_HARNESS_MUTATION_IN_FLIGHT === '1') delete process.env.QUALITY_HARNESS_QH_BIN
const qh = sourceCore()
const script = fileURLToPath(new URL('../plugin/scripts/branch-state.mjs', import.meta.url))
const NO_GITHUB = 'no remote names a GitHub host, so `gh` was not asked'
const GREEN = { looked: true, branch: 'main', head: 'abc1234', dirty: 0, ahead: 0, behind: 0,
  ci: { looked: true, sha: 'abc1234', status: 'completed', conclusion: 'success', failed: [] },
  tag: null, shippedSinceTag: null, releaseBlocked: null }
const RED = { ...GREEN, ci: { ...GREEN.ci, conclusion: 'failure', failed: ['test: failure', 'lint: failure'] } }
const BRIEF = ['--brief', '--cached', '120']
const DUE = 200_000
// What the test allows the core's 2 s refresh, as a hang guard: generous, and set here rather than inherited (CLAUDE.md §7).
const HANG_GUARD_MS = 2_000 + 6_000
const OVERRIDES = ['QUALITY_HARNESS_STATE_DIR', 'GIT_DIR', 'GIT_WORK_TREE', 'GIT_COMMON_DIR', 'GIT_CEILING_DIRECTORIES',
  'GIT_DISCOVERY_ACROSS_FILESYSTEM', 'GIT_INDEX_FILE', 'QH_BRANCH_STATE_NATIVE']

function fixture(t) {
  const scratch = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'qh-bsn-')))
  t.after(() => remove(scratch))
  const project = path.join(scratch, 'project')
  const elsewhere = path.join(scratch, 'elsewhere')
  const bin = path.join(scratch, 'bin')
  mkdirSync(elsewhere)
  mkdirSync(bin)
  const gitIn = (cwd, ...args) => {
    const run = spawnSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', ...args],
      { cwd, encoding: 'utf8', timeout: 30_000, windowsHide: true })
    assert.equal(run.status, 0, run.stderr)
    return run.stdout.trim()
  }
  gitIn(scratch, 'init', '-q', '-b', 'main', project)
  const git = (...args) => gitIn(project, ...args)
  const commits = ['one', 'two', 'three'].map(subject => { git('commit', '--allow-empty', '-qm', subject); return git('rev-parse', 'HEAD') })
  git('reset', '-q', '--soft', commits[0])
  git('remote', 'add', 'origin', 'git@github.com:example/qh-bsn.git')
  // A second repository, which only a GIT_DIR override can point the reader at.
  const other = path.join(scratch, 'other')
  gitIn(scratch, 'init', '-q', '-b', 'main', other)
  gitIn(other, 'commit', '--allow-empty', '-qm', 'other')
  const gitDir = path.join(project, '.git')
  const cache = path.join(gitDir, 'qh-branch-state.json')
  const lock = path.join(gitDir, 'qh-branch-state.lock')
  const pidFile = path.join(scratch, 'gh.pid')
  const config = path.join(bin, 'gh.json')
  const gh = mode => writeFileSync(config, JSON.stringify({ mode, head: commits[0], pidFile }))
  gh('green')

  // The stub `gh` (the harness of branch-state.test.mjs: a POSIX script that execs node, or on Windows a copy of node with a
  // --require preload). `slow` records its pid and outlives any budget; `exec` keeps that pid the process the reader started.
  const ghBody = [
    "const path = require('node:path')",
    "const fs = require('node:fs')",
    "if (process.platform === 'win32' && !/^gh(\\.exe)?$/i.test(path.basename(process.argv[0]))) return",
    `const config = JSON.parse(fs.readFileSync(${JSON.stringify(config)}, 'utf8'))`,
    'const args = process.argv.slice(1)',
    "if (config.mode === 'slow') {",
    '  fs.writeFileSync(config.pidFile, String(process.pid))',
    '  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 30000)',
    '  process.exit(1)',
    '}',
    "if (args.includes('list')) {",
    "  process.stdout.write(JSON.stringify([{ headSha: config.head, status: 'completed', conclusion: 'success', databaseId: 1,",
    "    startedAt: '2026-11-01T00:00:00Z', event: 'push', workflowDatabaseId: 7, workflowName: 'ci' }]))",
    '  process.exit(0)',
    '}',
    "if (args.includes('view')) {",
    "  process.stdout.write(JSON.stringify({ jobs: [{ name: 'test', conclusion: 'success' }, { name: 'docs', conclusion: 'skipped' }] }))",
    '  process.exit(0)',
    '}',
    'process.exit(1)',
    '',
  ].join('\n')
  const gitWhere = spawnSync(process.platform === 'win32' ? 'where.exe' : '/bin/sh',
    process.platform === 'win32' ? ['git.exe'] : ['-c', 'command -v git'], { encoding: 'utf8', timeout: 5_000, windowsHide: true })
  const gitBin = (gitWhere.stdout ?? '').split(/\r?\n/).map(line => line.trim()).find(Boolean)
  assert.ok(gitBin, `git must remain locatable on the isolated PATH\n${gitWhere.stderr}`)
  const base = { ...process.env }
  for (const key of OVERRIDES) delete base[key]
  if (process.platform === 'win32') {
    const preload = path.join(bin, 'gh-preload.cjs')
    writeFileSync(preload, ghBody)
    copyFileSync(process.execPath, path.join(bin, 'gh.exe'))
    base.NODE_OPTIONS = [`--require=${preload.split(path.sep).join('/')}`, process.env.NODE_OPTIONS].filter(Boolean).join(' ')
    base.PATH = `${bin}${path.delimiter}${path.dirname(gitBin)}${path.delimiter}${path.join(process.env.SystemRoot || process.env.SYSTEMROOT, 'System32')}`
  } else {
    const ghJs = path.join(bin, 'gh.cjs')
    writeFileSync(ghJs, ghBody)
    writeFileSync(path.join(bin, 'gh'), `#!/bin/sh\nexec "${process.execPath}" "${ghJs}" "$@"\n`)
    chmodSync(path.join(bin, 'gh'), 0o755)
    writeFileSync(path.join(bin, 'git'), `#!/bin/sh\nexec "${gitBin}" "$@"\n`)
    chmodSync(path.join(bin, 'git'), 0o755)
    base.PATH = bin
  }

  const spawnOne = (impl, argv, { cwd = project, payload, env = {} } = {}) => {
    const environment = { ...base, ...env }
    if (impl === 'native') environment.QH_BRANCH_STATE_NATIVE = '1'
    const [command, args] = impl === 'node' ? [process.execPath, [script, ...argv]] : [qh, ['bridge', 'branch-state', ...argv]]
    const started = Date.now()
    const ran = spawnSync(command, args, { cwd, env: environment, input: payload === undefined ? '' : JSON.stringify(payload),
      encoding: 'utf8', timeout: 60_000, windowsHide: true })
    return { ...ran, ms: Date.now() - started }
  }
  const stored = (file = cache) => { try { return JSON.parse(readFileSync(file, 'utf8')) } catch { return null } }
  // The snapshot a refresh would write, keeping what the brief stamped.
  const snapshot = (state, { at = Date.now() - 1000, key = snapshotKey(gitDir), file = cache } = {}) =>
    writeFileSync(file, JSON.stringify({ ...(stored(file) ?? {}), at, key, state }))
  const made = (session, sha) => {
    const log = sessionLogFile(project, session, { spawn: false })
    mkdirSync(path.dirname(log), { recursive: true })
    appendFileSync(log, `${JSON.stringify({ at: new Date().toISOString(), event: 'commit.made', sha })}\n`)
  }
  const short = sha => sha.slice(0, 7)
  const reset = () => {
    git('reset', '-q', '--soft', commits[0])
    rmSync(cache, { force: true })
    rmSync(path.join(other, '.git', 'qh-branch-state.json'), { force: true })
    remove(path.join(gitDir, 'quality-harness'))
    gh('green')
  }
  return { scratch, project, elsewhere, other, git, gitDir, cache, lock, pidFile, commits, gh, spawnOne, stored, snapshot, made, short, reset }
}

const normalOut = text => text.replace(/\(read \d+s ago/g, '(read Ns ago').replace(/; refreshing\)|; not refreshed within 2s\)/g, '; due)')
const normalSnapshot = value => (value && typeof value === 'object' && typeof value.at === 'number' ? { ...value, at: 'AT' } : value)

// Plays one scenario through each implementation from the same start, and returns the Node transcript once both agree.
function agree(f, name, play) {
  const transcripts = {}
  for (const impl of ['node', 'native']) {
    f.reset()
    const said = []
    const run = (argv, options) => {
      // A young lock: Node's due brief then starts no refresher to rewrite the snapshot under the comparison.
      writeFileSync(f.lock, String(process.pid))
      const ran = f.spawnOne(impl, argv, options)
      assert.equal(ran.status, 0, `${impl}, ${name}: exit ${ran.status}\n${ran.stderr}`)
      // Stringified, so the snapshot's key order is compared too: Node's statusline reads the file the core writes.
      said.push({ out: normalOut(ran.stdout), snapshot: JSON.stringify(normalSnapshot(f.stored())) })
      return ran.stdout
    }
    play(run, impl)
    transcripts[impl] = said
  }
  assert.deepEqual(transcripts.native, transcripts.node, `${name}: the core and the Node CLI disagree`)
  return transcripts.node
}

test('the native branch state says what the Node one says in every locked scenario', async t => {
  const f = fixture(t)
  const session = (id, cwd = f.project) => ({ payload: { cwd, session_id: id } })

  await t.test('the full report is collected', () => agree(f, 'full', run => {
    const out = run([])
    assert.match(out, /^branch-state: main @ [0-9a-f]{7}, clean\n {2}CI {7}[0-9a-f]{7}: succeeded; 1 job\(s\) skipped — docs\. \(run 1\)/, out)
  }))

  await t.test('a missing snapshot is collected, written, then served', () => agree(f, 'miss', run => {
    const out = run(BRIEF, session('miss'))
    assert.match(out, /^branch-state: main @ [0-9a-f]{7}, clean · CI [0-9a-f]{7}: succeeded; 1 job\(s\) skipped — docs\.\n$/, out)
    assert.equal(typeof f.stored()?.said, 'string')
    assert.equal(run(BRIEF, session('miss')), '', 'the same answer, fresh, is not said again')
  }))

  await t.test('a corrupt or future-dated snapshot is refreshed', () => agree(f, 'corrupt', run => {
    writeFileSync(f.cache, '{not json')
    assert.match(run(BRIEF), /skipped — docs\.\n$/)
    f.snapshot({ ...GREEN, head: 'fffffff' }, { at: Date.now() + 3_600_000 })
    const future = run(['--cached', '120'])
    assert.doesNotMatch(future, /fffffff/, future)
    assert.match(future, /skipped — docs/, future)
  }))

  await t.test('a fresh hit is said, an unchanged or dirty-count-only one is not', () => agree(f, 'fresh', run => {
    f.snapshot(GREEN)
    assert.match(run(BRIEF), /^branch-state: main @ abc1234, clean · CI abc1234: every job concluded success\. \(read \d+s ago\)\n$/)
    f.snapshot(GREEN)
    assert.equal(run(BRIEF), '')
    f.snapshot({ ...GREEN, dirty: 3 })
    assert.equal(run(BRIEF), '', 'only the uncommitted count moved')
    f.snapshot({ ...GREEN, ahead: 1 })
    assert.match(run(BRIEF), /1 ahead of origin/, 'what the brief reports moved')
    f.snapshot(GREEN)
    assert.match(run(['--cached', '120']), /\n {2}This READS\. It blocks nothing and judges nothing about your work\. \(read \d+s ago\)\n$/)
  }))

  await t.test('a red run is said in full, then as the one unchanged line', () => agree(f, 'red', run => {
    f.snapshot(RED)
    assert.match(run(BRIEF), /⚠ CI abc1234: FAILURE — test: failure, lint: failure\n {2}A LOCAL GREEN GATE/)
    f.snapshot(RED)
    assert.equal(run(BRIEF), '⚠ CI abc1234: FAILURE, 2 job(s), unchanged\n')
    f.snapshot({ ...RED, dirty: 4 })
    assert.equal(run(BRIEF), '⚠ CI abc1234: FAILURE, 2 job(s), unchanged\n')
    f.snapshot({ ...RED, ci: { ...RED.ci, failed: ['test: failure'] } })
    assert.match(run(BRIEF), /FAILURE — test: failure\n/, 'another failed set is said in full')
  }))

  await t.test('an unknown is said once, then as the head and one word', () => agree(f, 'unknown', run => {
    const unknown = { ...GREEN, ci: { looked: false, note: 'gh: command not found' } }
    f.snapshot(unknown)
    assert.match(run(BRIEF, session('one')), /COULD NOT LOOK — gh: command not found/)
    f.snapshot({ ...unknown, head: 'aaaaaaa' })
    assert.equal(run(BRIEF, session('one')), 'branch-state: main @ aaaaaaa, clean · ⚠ CI COULD NOT LOOK, unchanged\n')
    f.snapshot({ ...unknown, head: 'aaaaaaa', dirty: 2 })
    assert.equal(run(BRIEF, session('one')), '')
  }))

  await t.test('no GitHub remote is said once per session', () => agree(f, 'permanent', run => {
    const bitbucket = head => ({ ...GREEN, head, ci: { looked: false, note: NO_GITHUB } })
    f.snapshot(bitbucket('abc1234'))
    assert.match(run(BRIEF, session('one')), /no remote names a GitHub host/)
    f.snapshot(bitbucket('def5678'))
    assert.equal(run(BRIEF, session('one')), '', 'the head moved')
    f.snapshot({ ...bitbucket('0123abc'), dirty: 3 })
    assert.equal(run(BRIEF, session('one')), '', 'an edit')
    f.snapshot(bitbucket('def5678'))
    assert.match(run(BRIEF, session('another')), /no remote names a GitHub host/, 'a new session')
    f.snapshot(bitbucket('1111111'))
    assert.match(run(BRIEF), /CI COULD NOT LOOK, unchanged/, 'no session: shortened, never dropped')
    f.snapshot(GREEN)
    assert.match(run(BRIEF, session('another')), /every job concluded success/)
    f.snapshot(RED)
    run(BRIEF, session('another'))
    f.snapshot(RED)
    assert.match(run(BRIEF, session('another')), /unchanged/)
  }))

  await t.test("the payload's cwd is the session's directory", () => agree(f, 'cwd', run => {
    f.snapshot(GREEN)
    assert.match(run(BRIEF, { cwd: f.elsewhere, ...session('one') }), /main @ abc1234/)
    assert.match(run(BRIEF, { cwd: f.elsewhere, payload: { cwd: path.join(f.scratch, 'missing') } }), /COULD NOT LOOK/,
      'a cwd that is no directory falls back to where the process stands')
  }))

  await t.test('a git discovery override is asked of git, not of the files', () => agree(f, 'override', run => {
    const otherDir = path.join(f.other, '.git')
    f.snapshot({ ...GREEN, branch: 'other-branch' }, { key: snapshotKey(otherDir), file: path.join(otherDir, 'qh-branch-state.json') })
    f.snapshot(GREEN)
    assert.match(run(BRIEF, { env: { GIT_DIR: otherDir } }), /other-branch @ abc1234.*\(read \d+s ago\)/)
  }))

  await t.test('a due snapshot whose HEAD moved says so (Decision 2 path)', () => agree(f, 'moved', (run, impl) => {
    const before = snapshotKey(f.gitDir)
    f.git('reset', '-q', '--soft', f.commits[1])
    if (impl === 'native') f.gh('slow')
    f.snapshot(GREEN, { at: Date.now() - DUE, key: before })
    const out = run(BRIEF)
    assert.match(normalOut(out), new RegExp(`^branch-state: main @ abc1234, clean \\(moved since this was read: HEAD now ${f.short(f.commits[1])}; uncommitted and ahead not re-read\\) · CI abc1234: every job concluded success\\. \\(read Ns ago; due\\)\\n$`), out)
    f.snapshot(GREEN, { at: Date.now() - DUE, key: before })
    assert.equal(run(BRIEF), '', 'the same moved snapshot is not said again')
  }))

  await t.test("the session's own commit is not news", () => agree(f, 'own', (run, impl) => {
    f.snapshot({ ...GREEN, head: f.short(f.commits[0]) })
    assert.match(run(BRIEF, session('own')), /^branch-state: main @ [0-9a-f]{7}, clean · CI abc1234/)
    f.git('reset', '-q', '--soft', f.commits[1])
    f.made('own', f.commits[1])
    if (impl === 'native') f.gh('slow')
    assert.equal(run(BRIEF, session('own')), '', 'the snapshot read before the commit, served with HEAD moved')
    f.gh('green')
    f.snapshot({ ...GREEN, head: f.short(f.commits[1]), ahead: 1 })
    assert.equal(run(BRIEF, session('own')), '', 'the refreshed answer, one ahead')
    f.git('reset', '-q', '--soft', f.commits[2])
    f.snapshot({ ...GREEN, head: f.short(f.commits[2]), ahead: 2 })
    assert.match(run(BRIEF, session('own')), /2 ahead of origin/, 'a commit the session log does not record is said')
  }))
})

test('a stale cache past the budget is served marked stale and nothing outlives the hook', t => {
  const f = fixture(t)
  const alive = pid => { try { process.kill(pid, 0); return true } catch (error) { return error.code === 'EPERM' } }
  const plant = age => {
    const planted = { at: Date.now() - age, key: snapshotKey(f.gitDir), state: GREEN }
    writeFileSync(f.cache, JSON.stringify(planted))
    return planted
  }
  const unchanged = planted => {
    const after = f.stored()
    assert.deepEqual([after.at, after.key, after.state, after.partial], [planted.at, planted.key, planted.state, undefined],
      `the snapshot is left as it was: ${JSON.stringify(after)}`)
  }
  const prompt = () => f.spawnOne('native', BRIEF, { payload: { cwd: f.project, session_id: 'stale' } })
  f.gh('slow')

  const planted = plant(DUE)
  const ran = prompt()
  assert.equal(ran.status, 0, ran.stderr)
  assert.match(ran.stdout, /^branch-state: main @ abc1234, clean · CI abc1234: every job concluded success\. \(read \d+s ago; not refreshed within 2s\)\n$/, ran.stdout)
  assert.ok(ran.ms < HANG_GUARD_MS, `the hook returned in ${ran.ms} ms, past its ${HANG_GUARD_MS} ms hang guard`)
  unchanged(planted)
  const pid = Number(readFileSync(f.pidFile, 'utf8'))
  assert.ok(pid > 0, 'the refresh reached `gh`')
  assert.equal(alive(pid), false, `the gh the refresh started (pid ${pid}) did not outlive the hook`)
  assert.equal(existsSync(f.lock), false, 'no lock file')
  assert.deepEqual(readdirSync(f.gitDir).filter(name => /^qh-branch-state\.json\.\d+\.tmp$/.test(name)), [], 'no temporary left')
  rmSync(f.pidFile)
  plant(DUE)
  writeFileSync(f.cache, JSON.stringify({ ...f.stored(), said: 'branch-state: main @ abc1234, clean · CI abc1234: every job concluded success.' }))
  assert.equal(prompt().stdout, '', 'an unchanged stale answer is said once, like any other')

  // Past the show cap the old answer is not shown, and that is said once.
  const capped = plant(700_000)
  const line = 'branch-state: the last answer is past the 10-minute cap, so it is not shown; the refresh did not finish within 2s.\n'
  assert.equal(prompt().stdout, line)
  unchanged(capped)
  assert.equal(prompt().stdout, '', 'and not again')
  unchanged(capped)

  // DIRTY twin: a gh that answers within the budget refreshes inline, and the answer is a fresh one.
  f.gh('green')
  const due = plant(DUE)
  const fresh = prompt()
  assert.match(fresh.stdout, /^branch-state: main @ [0-9a-f]{7}, clean · CI [0-9a-f]{7}: succeeded; 1 job\(s\) skipped — docs\.\n$/, fresh.stdout)
  const written = f.stored()
  assert.ok(written.at > due.at && written.partial === undefined && written.state.ci.looked === true, JSON.stringify(written))
})

// ADR-135 T4: the registration's own command, `qh bridge branch-state --brief --cached 120`, is answered by the core with no
// flag set. The fixture's PATH holds git and the stub gh but no node, so a bridge that still spawned the Node CLI fails here
// with "could not run the hook CLI" instead of printing the brief.
test('the branch-state registration spawns no node', t => {
  const f = fixture(t)
  const ran = f.spawnOne('default', BRIEF)
  assert.equal(ran.status, 0, `${ran.stdout}\n${ran.stderr}`)
  assert.doesNotMatch(ran.stderr, /could not run the hook CLI/, ran.stderr)
  assert.match(ran.stdout, /^branch-state: main @ [0-9a-f]{7}/, ran.stdout)
})
