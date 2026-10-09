// ADR-094 T3. A documentation-only commit paid the project's whole check (100 seconds to 25 minutes
// reported). A project that declares `prose` in .quality-harness.json reuses the last pass for a tree
// that differs from it only under those paths. Everything runs through the real qh-check, in a sandbox
// that holds the temp directory, the repositories and the runs log (CLAUDE.md §9). Every "this is code
// again" twin is here beside the reuse: a reused pass for a tree whose code changed is a false claim.
import assert from 'node:assert/strict'
import test from 'node:test'
import { spawnSync } from 'node:child_process'
import { appendFileSync, chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkEventName, passedAlready, proseSpecProblem, proseSpecs, stateDir } from '../plugin/scripts/lifecycle.mjs'
import { appendEvent } from '../plugin/scripts/event-log.mjs'
import { runCheck } from '../plugin/scripts/qh-check.mjs'

const qhCheckScript = fileURLToPath(new URL('../plugin/scripts/qh-check.mjs', import.meta.url))
const CHECK = 'node check.mjs'

function sandbox(t) {
  const top = realpathSync.native(mkdtempSync(path.join(process.platform === 'darwin' ? '/private/tmp' : os.tmpdir(), 'qh-prose-')))
  t.after(() => rmSync(top, { recursive: true, force: true }))
  return top
}
const git = (repo, ...args) => {
  const run = spawnSync('git', ['-C', repo, '-c', 'user.name=qh', '-c', 'user.email=qh@example.invalid', ...args], { encoding: 'utf8', timeout: 60_000 })
  assert.equal(run.status, 0, run.stderr)
  return run.stdout.trim()
}
const write = (repo, file, text) => {
  mkdirSync(path.dirname(path.join(repo, file)), { recursive: true })
  writeFileSync(path.join(repo, file), text)
}
// A repository whose check appends a line to a log outside it each time it RUNS, so "reused" is a count.
function build(top, name, config = { check: CHECK, prose: ['docs/'] }) {
  const repo = path.join(top, name)
  mkdirSync(repo, { recursive: true })
  git(repo, 'init', '-q')
  write(repo, 'check.mjs', "import { appendFileSync } from 'node:fs'\nappendFileSync(process.env.QH_RUNS, 'ran\\n')\nprocess.exit(process.env.QH_FAIL ? 1 : 0)\n")
  write(repo, 'docs/a.md', 'one\n')
  write(repo, 'src/code.js', 'export const a = 1\n')
  write(repo, 'packages/web/index.js', 'export {}\n')
  if (config !== null) write(repo, '.quality-harness.json', typeof config === 'string' ? config : JSON.stringify(config))
  git(repo, 'add', '-A')
  git(repo, 'commit', '-q', '-m', 'one', '--no-gpg-sign')
  const runs = path.join(top, `${name}-runs.log`)
  writeFileSync(runs, '')
  return { repo, runs }
}
const runCount = ctx => readFileSync(ctx.runs, 'utf8').split('\n').filter(Boolean).length
function qhCheck(top, ctx, { cwd = ctx.repo, env = {} } = {}) {
  const run = spawnSync(process.execPath, [qhCheckScript], {
    cwd, encoding: 'utf8', timeout: 180_000, windowsHide: true,
    env: { ...process.env, TMPDIR: top, TMP: top, TEMP: top, QH_RUNS: ctx.runs, QUALITY_HARNESS_OBSERVE_BUDGET_MS: '60000', ...env },
  })
  return { ...run, runs: runCount(ctx) }
}
const ledger = (repo, file) => {
  try { return readFileSync(path.join(stateDir(repo), file), 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line)) } catch { return [] }
}

test('a declared prose-only change reuses the last pass, from a subdirectory too', t => {
  const top = sandbox(t)
  const ctx = build(top, 'repo-a')
  const first = qhCheck(top, ctx)
  assert.equal(first.status, 0, first.stderr)
  assert.equal(first.runs, 1)
  const [original] = ledger(ctx.repo, 'checks.jsonl')
  assert.equal(typeof original.after.codeTree, 'string', 'a declared project records the tree without its prose')
  assert.deepEqual(original.prose, ['docs/'])

  write(ctx.repo, 'docs/a.md', 'two\n')
  const second = qhCheck(top, ctx, { cwd: path.join(ctx.repo, 'packages', 'web') })
  assert.equal(second.status, 0, second.stderr)
  assert.equal(second.runs, 1, `the check did not run again: ${second.stderr}`)
  assert.match(second.stderr, /only prose changed.*not run again/s, second.stderr)
  const rows = ledger(ctx.repo, 'checks.jsonl')
  assert.equal(rows.length, 2, 'a reuse is a pass row for the new tree')
  assert.equal(rows[1].reusedFrom, original.id)
  assert.equal(checkEventName(rows[1]), 'check.passed')
  assert.equal(rows[1].before.at, original.before.at, 'it claims no more time than the original')
  assert.equal(ledger(ctx.repo, 'skips.jsonl').length, 1, 'and a skip row, so the saving is counted')
  // The publish verdict reads a plain pass for the tree as it is now.
  const verdict = passedAlready({ root: ctx.repo, git: true, command: CHECK })
  assert.equal(verdict?.id, rows[1].id)
  // A chain of reuses points at the pass that actually ran.
  write(ctx.repo, 'docs/a.md', 'three\n')
  assert.equal(qhCheck(top, ctx).runs, 1)
  assert.equal(ledger(ctx.repo, 'checks.jsonl')[2].reusedFrom, original.id)
})

test('a change outside the declared paths runs the check, whatever else is reused', t => {
  const top = sandbox(t)
  const twins = {
    'a code file edited with a docs edit': repo => { write(repo, 'docs/a.md', 'two\n'); write(repo, 'src/code.js', 'export const a = 2\n') },
    'a rename out of the prose paths': repo => renameSync(path.join(repo, 'docs', 'a.md'), path.join(repo, 'src', 'a.md')),
    'a rename into the prose paths': repo => renameSync(path.join(repo, 'src', 'code.js'), path.join(repo, 'docs', 'code.js')),
    'a deletion of a code file': repo => unlinkSync(path.join(repo, 'src', 'code.js')),
    'a new code file': repo => write(repo, 'src/new.js', 'export {}\n'),
    'the project config itself': repo => write(repo, '.quality-harness.json', JSON.stringify({ check: CHECK, prose: ['docs/'], publish: 'warn' })),
    'the check script': repo => write(repo, 'check.mjs', "import { appendFileSync } from 'node:fs'\nappendFileSync(process.env.QH_RUNS, 'ran\\n')\n"),
  }
  if (process.platform !== 'win32') twins['a mode change on a code file'] = repo => chmodSync(path.join(repo, 'src', 'code.js'), 0o755)
  for (const [name, change] of Object.entries(twins)) {
    const ctx = build(top, `twin-${Object.keys(twins).indexOf(name)}`)
    assert.equal(qhCheck(top, ctx).runs, 1)
    change(ctx.repo)
    const again = qhCheck(top, ctx)
    assert.equal(again.runs, 2, `${name}: the check ran again (${again.stderr})`)
  }
  // The pieces a project cannot change by editing files: the command, the declared list and a row from
  // before the declaration, through the seam that fakes the tree.
  const ctx = build(top, 'seam')
  assert.equal(qhCheck(top, ctx).runs, 1)
  const [row] = ledger(ctx.repo, 'checks.jsonl')
  const sameCode = { ok: true, tree: 'moved', codeTree: row.after.codeTree, index: null, head: null }
  const ask = (extra = {}) => passedAlready({ root: ctx.repo, git: true, command: CHECK, observeTree: () => sameCode, prose: ['docs/'], ...extra })
  assert.equal(ask()?.viaProse, true, 'the control: same command, same list, same code tree')
  assert.equal(ask({ command: `${CHECK} --other` }), null, 'another command')
  assert.equal(ask({ prose: ['docs/', 'notes/'] }), null, 'another declared list')
  assert.equal(ask({ prose: [] }), null, 'no declaration')
  assert.equal(ask({ observeTree: () => ({ ...sameCode, codeTree: 'different' }) }), null, 'another code tree')
  assert.equal(ask({ observeTree: () => ({ ok: true, tree: 'moved', index: null, head: null }) }), null, 'a tree that was observed without the prose removed')
  const old = { ...row, id: 'old-row', after: { ...row.after, codeTree: undefined }, prose: undefined }
  writeFileSync(path.join(stateDir(ctx.repo), 'checks.jsonl'), `${JSON.stringify(old)}\n`)
  assert.equal(ask(), null, 'a row from before the declaration is never reused this way')
})

test('a declaration that could hide code is refused and said', t => {
  const top = sandbox(t)
  const declarations = {
    '.': ['.'], '*': ['*'], '**': ['**'], '***': ['***'], 'a wildcard in the extension': ['*.*'], 'a question mark': ['?*'],
    'a glob that matches the config': ['*.json'], 'the config by name, in another case': ['.QUALITY-harness.json'], 'a spec that matches nothing': ['nothing/'],
    'a leading dash': ['-x'], 'a pathspec magic': [':(exclude)docs'], 'a parent segment': ['docs/../src/'], 'an absolute path': ['/etc'],
    'an empty entry': [''], 'not an array': 'docs/', 'more than twenty': Array.from({ length: 21 }, (_, n) => `docs/d${n}/`),
    'a gitlink': ['vendor/'],
  }
  for (const [name, prose] of Object.entries(declarations)) {
    const ctx = build(top, `refused-${Object.keys(declarations).indexOf(name)}`, { check: CHECK, prose })
    if (name === 'a gitlink') git(ctx.repo, 'update-index', '--add', '--cacheinfo', `160000,${git(ctx.repo, 'rev-parse', 'HEAD')},vendor/mod`)
    const first = qhCheck(top, ctx)
    assert.match(first.stderr, /`prose` declaration .* was ignored/, `${name}: said — ${first.stderr}`)
    write(ctx.repo, 'docs/a.md', 'two\n')
    const second = qhCheck(top, ctx)
    assert.equal(second.runs, 2, `${name}: nothing was reused — ${second.stderr}`)
  }
  // The twins whose only guard is the one under test: with the config UNTRACKED, `*` and `.` match every code file
  // and a glob such as `*.json` matches the config only through the untracked listing (a tracked json file keeps
  // the "matches nothing" refusal from standing in for it).
  for (const prose of [['.'], ['*'], ['**'], ['***'], ['?*'], ['*.json'], ['*', 'docs/']]) {
    const ctx = build(top, `untracked-${prose.join('-').replace(/\W/g, '_')}`, { check: CHECK, prose })
    write(ctx.repo, 'docs/data.json', '{}\n')
    git(ctx.repo, 'add', '-A')
    git(ctx.repo, 'rm', '--cached', '-q', '.quality-harness.json')
    git(ctx.repo, 'commit', '-q', '-m', 'untrack the config', '--no-gpg-sign')
    const first = qhCheck(top, ctx)
    assert.match(first.stderr, /`prose` declaration .* was ignored/, `${JSON.stringify(prose)}: said — ${first.stderr}`)
    write(ctx.repo, 'src/code.js', 'export const a = 2\n')
    assert.equal(qhCheck(top, ctx).runs, 2, `${JSON.stringify(prose)}: a code edit ran the check`)
  }
})

// Supplementary (NOT in the Acceptance fence): a concurrent writer between the decision and the append.


// Supplementary (NOT in the Acceptance fence): the grammar, the segment guard and the config guard, judged without git.
// The config guard is on the SPEC, because an ignored or untracked config is invisible to any listing (a Codex review
// of ADR-094): only the file's own name and a `*.json` extension spec can reach a root file under this grammar.
test('a pathspec is judged by its grammar before git is asked', () => {
  for (const good of ['docs/', 'README.md', 'docs/a.md', 'docs/**/*.md', 'docs/*.md', '*.md', '**/*.rst', 'site/content/', 'docs/data.json', 'docs/*.json']) {
    assert.equal(proseSpecProblem(good), null, `${good} is a plain pathspec`)
  }
  for (const bad of ['.', '..', './', '*', '**', '***', '*.*', '?*', '*.m*', '**/*', '*docs/', 'docs/../src/', './src/', 'docs/./a.md',
    '-x', ':(exclude)docs', '/etc', '', 'a b', 'docs\\a', undefined, 7, null]) {
    assert.notEqual(proseSpecProblem(bad), null, `${JSON.stringify(bad)} is refused`)
  }
  for (const config of ['.quality-harness.json', '.QUALITY-harness.json', '*.json', '*.JSON', '**/*.json']) {
    assert.match(proseSpecProblem(config) ?? '', /\.quality-harness\.json/, `${config} could name the config`)
  }
})
test('a ledger row appended since the reuse was decided stops the reuse', async t => {
  const top = sandbox(t)
  const ctx = build(top, 'race')
  assert.equal(qhCheck(top, ctx).runs, 1)
  write(ctx.repo, 'docs/a.md', 'two\n')
  const [original] = ledger(ctx.repo, 'checks.jsonl')
  const file = path.join(stateDir(ctx.repo), 'checks.jsonl')
  // What a concurrent `qh-check --again` would have appended: a failure for the tree being decided.
  const failure = { ...original, id: 'concurrent-failure', exit: 1, verdict: 'failed' }
  const sink = { write() {} }
  const env = { ...process.env, TMPDIR: top, TMP: top, TEMP: top, QH_RUNS: ctx.runs, QUALITY_HARNESS_OBSERVE_BUDGET_MS: '60000' }
  const code = await runCheck({ cwd: ctx.repo, env, stdout: sink, stderr: sink, beforeReuse: () => appendFileSync(file, `${JSON.stringify(failure)}\n`) })
  assert.equal(code, 0)
  assert.equal(runCount(ctx), 2, 'the check ran instead of reusing over a newer failure')
  // Our row is already in the ledger, behind the newcomer; the row that decides is the real run that follows it.
  const decided = ledger(ctx.repo, 'checks.jsonl').at(-1)
  assert.equal(decided.reusedFrom, undefined, 'the last row is the check that ran, not a reuse')
  assert.equal(decided.exit, 0)
  // The stale reuse row is retracted by a row that does not grade as a pass, so an interrupted run that follows
  // it cannot leave a pass for a tree nobody checked (a Codex review of ADR-094).
  const all = ledger(ctx.repo, 'checks.jsonl')
  const reuse = all.findIndex(row => row.reusedFrom)
  assert.ok(reuse >= 0, 'the reuse row is in the ledger, behind the newcomer')
  assert.equal(all[reuse + 1].retracts, all[reuse].id, 'and the very next row retracts it')
  assert.equal(checkEventName(all[reuse + 1]), 'check.unproven')
})

test('an unseen write after the original pass vetoes a reuse', t => {
  const top = sandbox(t)
  const ctx = build(top, 'veto')
  assert.equal(qhCheck(top, ctx).runs, 1)
  // A write git cannot see (an ignored file in the tree), logged after the pass started.
  writeFileSync(path.join(ctx.repo, '.git', 'info', 'exclude'), 'ignored.bin\n')
  appendEvent(ctx.repo, 'veto-session', { event: 'file.written', path: path.join(ctx.repo, 'ignored.bin'), observable: false, checksSeen: 1, fastSeen: 0 })
  write(ctx.repo, 'docs/a.md', 'two\n')
  assert.equal(qhCheck(top, ctx).runs, 2, 'the check ran again')
})

test('a project that declares nothing is unchanged', t => {
  const top = sandbox(t)
  const ctx = build(top, 'plain', { check: CHECK })
  assert.equal(qhCheck(top, ctx).runs, 1)
  const [row] = ledger(ctx.repo, 'checks.jsonl')
  assert.equal('codeTree' in row.after, false, 'no new field')
  assert.equal('prose' in row, false)
  write(ctx.repo, 'docs/a.md', 'two\n')
  assert.equal(qhCheck(top, ctx).runs, 2, 'a documentation edit is a new tree: the check runs')
  const same = qhCheck(top, ctx)
  assert.equal(same.runs, 2, 'an identical tree is still skipped')
  assert.match(same.stderr, /already passed on this tree/)
  assert.equal(ledger(ctx.repo, 'skips.jsonl').at(-1).viaProse, undefined)
})

test('the hint is said after a passing prose-only run and never after a failed one', t => {
  const top = sandbox(t)
  const hurry = { QUALITY_HARNESS_PROSE_HINT_MS: '0' }
  const ctx = build(top, 'hint', { check: CHECK })
  assert.doesNotMatch(qhCheck(top, ctx, { env: hurry }).stderr, /"prose"/, 'the first run has no earlier pass to compare with')
  write(ctx.repo, 'docs/a.md', 'two\n')
  const said = qhCheck(top, ctx, { env: hurry })
  assert.match(said.stderr, /"prose".*"fastCheck"/s, said.stderr)
  assert.match(said.stderr, /project owner/, 'a declaration needs the owner')
  write(ctx.repo, 'docs/a.md', 'three\n')
  assert.doesNotMatch(qhCheck(top, ctx, { env: hurry }).stderr, /"prose"/, 'once per repository')
  // A failed run says nothing about prose.
  const failing = build(top, 'hint-failed', { check: CHECK })
  assert.equal(qhCheck(top, failing, { env: hurry }).status, 0)
  write(failing.repo, 'docs/a.md', 'two\n')
  const failed = qhCheck(top, failing, { env: { ...hurry, QH_FAIL: '1' } })
  assert.notEqual(failed.status, 0)
  assert.doesNotMatch(failed.stderr, /"prose"/)
  // A code change is not a prose-only run.
  const code = build(top, 'hint-code', { check: CHECK })
  assert.equal(qhCheck(top, code, { env: hurry }).status, 0)
  write(code.repo, 'src/code.js', 'export const a = 3\n')
  assert.doesNotMatch(qhCheck(top, code, { env: hurry }).stderr, /"prose"/)
  // A pass over UNCOMMITTED code is not placed by HEAD: restore the committed code, edit a document, and the
  // hint must not claim that only documents changed (a Codex review of ADR-094).
  const dirty = build(top, 'hint-dirty', { check: CHECK })
  write(dirty.repo, 'src/code.js', 'export const a = 9\n')
  assert.equal(qhCheck(top, dirty, { env: hurry }).status, 0)
  git(dirty.repo, 'checkout', '--', 'src/code.js')
  write(dirty.repo, 'docs/a.md', 'two\n')
  assert.doesNotMatch(qhCheck(top, dirty, { env: hurry }).stderr, /"prose"/, 'a pass over uncommitted code is not placed by HEAD')
  // A rename out of a code path is not "only documents": rename-aware output lists the destination alone (a Codex review).
  const moved = build(top, 'hint-rename', { check: CHECK })
  assert.equal(qhCheck(top, moved, { env: hurry }).status, 0)
  git(moved.repo, 'mv', 'src/code.js', 'docs/code.md')
  assert.doesNotMatch(qhCheck(top, moved, { env: hurry }).stderr, /"prose"/, 'a code file renamed into docs is a code change')
  // A link or an executable NAMED like a document is not a document: retargeting a link between code files, or
  // changing a mode, passes a suffix test (a Codex review of ADR-094).
  // Without rename detection a renamed DOCUMENT is a deletion and an addition of regular text files, so the hint still
  // fires; with it, git's two-path record is not one this parser reads (the mutant that drops the flag).
  const docMoved = build(top, 'hint-doc-rename', { check: CHECK })
  assert.equal(qhCheck(top, docMoved, { env: hurry }).status, 0)
  git(docMoved.repo, 'mv', 'docs/a.md', 'docs/b.md')
  assert.match(qhCheck(top, docMoved, { env: hurry }).stderr, /"prose"/, 'a document renamed to a document is only documents')
  if (process.platform !== 'win32') {
    const linked = build(top, 'hint-link', { check: CHECK })
    symlinkSync('../src/code.js', path.join(linked.repo, 'docs', 'guide.md'))
    git(linked.repo, 'add', '-A')
    git(linked.repo, 'commit', '-q', '-m', 'link', '--no-gpg-sign')
    assert.equal(qhCheck(top, linked, { env: hurry }).status, 0)
    unlinkSync(path.join(linked.repo, 'docs', 'guide.md'))
    symlinkSync('../packages/web/index.js', path.join(linked.repo, 'docs', 'guide.md'))
    assert.doesNotMatch(qhCheck(top, linked, { env: hurry }).stderr, /"prose"/, 'a retargeted link named like a document is not one')
    const mode = build(top, 'hint-mode', { check: CHECK })
    assert.equal(qhCheck(top, mode, { env: hurry }).status, 0)
    chmodSync(path.join(mode.repo, 'docs', 'a.md'), 0o755)
    assert.doesNotMatch(qhCheck(top, mode, { env: hurry }).stderr, /"prose"/, 'an executable bit is not a text change')
    const fresh = build(top, 'hint-untracked-link', { check: CHECK })
    assert.equal(qhCheck(top, fresh, { env: hurry }).status, 0)
    symlinkSync('../src/code.js', path.join(fresh.repo, 'docs', 'new.md'))
    assert.doesNotMatch(qhCheck(top, fresh, { env: hurry }).stderr, /"prose"/, 'an untracked link named like a document is not one')
  }
  // And below the threshold nothing is said.
  const quick = build(top, 'hint-quick', { check: CHECK })
  assert.equal(qhCheck(top, quick).status, 0)
  write(quick.repo, 'docs/a.md', 'two\n')
  assert.doesNotMatch(qhCheck(top, quick).stderr, /"prose"/, 'a one-second run is not worth a hint')
})
