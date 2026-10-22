// ADR-100 T1: a Codex review the launcher runs is recorded where release-evidence reads it, and a
// plugin commit since the last tag that no recorded review covers keeps a release UNPROVEN.
// Every repository here is one this test made (CLAUDE.md §9).
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { CLAUDE_MODEL, CODEX_MODEL, hostReview, promptFileReview, verdictStatus } from '../plugin/scripts/host-review.mjs'
import { main, reviewEvidence } from '../scripts/release-evidence.mjs'

const git = (cwd, ...args) => {
  const run = spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true, timeout: 30_000 })
  assert.equal(run.status, 0, `git ${args.join(' ')}: ${run.stderr}`)
  return run.stdout.trim()
}

function scratch() {
  const dir = mkdtempSync(join(os.tmpdir(), 'qh-review-ledger-'))
  git(dir, 'init', '-q')
  git(dir, 'config', 'user.email', 't@example.invalid')
  git(dir, 'config', 'user.name', 't')
  git(dir, 'config', 'commit.gpgsign', 'false')
  return dir
}

function commit(dir, file, text) {
  mkdirSync(join(dir, file, '..'), { recursive: true })
  writeFileSync(join(dir, file), text)
  git(dir, 'add', '-A')
  // core.hooksPath to nowhere: this session's publish hook must not judge a scratch repository (BACKLOG §371).
  git(dir, '-c', 'core.hooksPath=/dev/null', 'commit', '-q', '-m', file)
  return git(dir, 'rev-parse', 'HEAD')
}

const ledger = dir => join(dir, '.git', 'quality-harness', 'reviews.jsonl')
const rows = dir => existsSync(ledger(dir)) ? readFileSync(ledger(dir), 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line)) : []

// A fake Codex: `exec --help` answers nothing, and the review run writes `answer` where `-o` points.
const fakeCodex = answer => (bin, argv) => {
  if (argv.includes('--help')) return { status: 0, stdout: '' }
  const out = argv[argv.indexOf('-o') + 1]
  writeFileSync(out, answer)
  return { status: 0, stdout: '' }
}

test('every Codex run the launcher starts leaves one review row naming its range and status', () => {
  const dir = scratch()
  try {
    const base = commit(dir, 'plugin/a.mjs', 'one\n')
    const head = commit(dir, 'plugin/a.mjs', 'two\n')
    const clean = JSON.stringify({ status: 'clean', findings: [], model: CODEX_MODEL })
    const result = hostReview({ host: 'codex', effort: 'high', repo: dir, scope: `base ${base}`, resolve: () => 'codex', run: fakeCodex(clean) })
    assert.equal(result.status, 'clean')
    const [row] = rows(dir)
    assert.equal(rows(dir).length, 1)
    assert.deepEqual([row.host, row.model, row.effort, row.base, row.head, row.status, row.findings], ['codex', CODEX_MODEL, 'high', base, head, 'clean', 0])
    // A run that started and could not finish is recorded too, as unavailable, and covers nothing.
    hostReview({ host: 'codex', effort: 'high', repo: dir, scope: `commit ${head}`, resolve: () => 'codex', run: (bin, argv) => argv.includes('--help') ? { status: 0, stdout: '' } : { status: 1, stdout: '' } })
    const second = rows(dir)[1]
    // `commit <sha>` is exact: Codex is shown `git show <sha>`, that commit alone.
    assert.deepEqual([second.base, second.head, second.exact, second.status], [null, head, true, 'unavailable'])
    // A review handed its output runs nothing, so it records nothing.
    hostReview({ host: 'codex', effort: 'high', output: clean })
    assert.equal(rows(dir).length, 2)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('the prompt-file form takes its status from the last VERDICT line, and none is unparsed', () => {
  assert.equal(verdictStatus('…\nVERDICT: APPROVE\n'), 'clean')
  assert.equal(verdictStatus('VERDICT: REQUEST CHANGES'), 'blocking')
  assert.equal(verdictStatus('VERDICT: EVIDENCE-LIMITED\n'), 'evidence-limited')
  // The skill's own strongest verdict without runnable evidence (codex-review/SKILL.md:181).
  assert.equal(verdictStatus('VERDICT: EVIDENCE-LIMITED — no blocking findings observed\n'), 'evidence-limited')
  // The contract quotes the grammar; only the LAST verdict line is the answer.
  assert.equal(verdictStatus('VERDICT: APPROVE | REQUEST CHANGES | EVIDENCE-LIMITED\nfindings…\nVERDICT: REQUEST CHANGES\n'), 'blocking')
  assert.equal(verdictStatus('no verdict here'), 'unparsed')
  assert.equal(verdictStatus('VERDICT: APPROVE | REQUEST CHANGES | EVIDENCE-LIMITED'), 'unparsed')
  const dir = scratch()
  try {
    const base = commit(dir, 'plugin/a.mjs', 'one\n')
    const head = commit(dir, 'plugin/a.mjs', 'two\n')
    const prompt = join(dir, '.git', 'prompt.txt')
    writeFileSync(prompt, 'review it')
    const said = promptFileReview({ argv: ['--host', 'codex', '--effort', 'high', '--repo', dir, '--prompt-file', prompt, '--range', `${base}..${head}`],
      resolve: () => 'codex', run: fakeCodex('Looks fine.\nVERDICT: APPROVE\n') })
    assert.equal(said.code, 0, said.err)
    assert.match(said.out, /VERDICT: APPROVE/)
    assert.deepEqual([rows(dir)[0].base, rows(dir)[0].head, rows(dir)[0].status], [base, head, 'clean'])
    const bad = promptFileReview({ argv: ['--host', 'codex', '--repo', dir, '--prompt-file', prompt, '--range', 'not-a-range'], resolve: () => 'codex', run: fakeCodex('x') })
    assert.equal(bad.code, 2)
    assert.equal(rows(dir).length, 1, 'a malformed range runs nothing and records nothing')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

// ADR-119 T2: the row names the model the launcher pinned, says whether the reviewer agreed, and keeps a printed model
// that differs. Beside the ADR-100 T1 tests, whose bodies stay as they are.
test('a review row from the launcher carries its bound and the model the reviewer printed', () => {
  const dir = scratch()
  try {
    const base = commit(dir, 'plugin/a.mjs', 'one\n')
    commit(dir, 'plugin/a.mjs', 'two\n')
    const said = model => JSON.stringify({ status: 'clean', findings: [], ...(model === undefined ? {} : { model }) })
    const codex = answer => hostReview({ host: 'codex', effort: 'high', repo: dir, scope: `base ${base}`, resolve: () => 'codex', run: fakeCodex(answer) })
    // DIRTY: Codex pinned to CODEX_MODEL prints another name.
    codex(said('GPT-6 (Codex)'))
    let row = rows(dir).at(-1)
    assert.deepEqual([row.model, row.bound, row.reportedModel], [CODEX_MODEL, 'disagrees', 'GPT-6 (Codex)'])
    // CLEAN: it prints the pin.
    codex(said(CODEX_MODEL))
    row = rows(dir).at(-1)
    assert.deepEqual([row.model, row.bound], [CODEX_MODEL, 'pinned'])
    assert.equal('reportedModel' in row, false)
    // A Codex run that could not finish stays unproven.
    hostReview({ host: 'codex', effort: 'high', repo: dir, scope: `base ${base}`, resolve: () => 'codex', run: (bin, argv) => argv.includes('--help') ? { status: 0, stdout: '' } : { status: 1, stdout: '' } })
    row = rows(dir).at(-1)
    assert.deepEqual([row.status, row.model, row.bound], ['unavailable', CODEX_MODEL, 'unproven'])
    // Cursor: a pin it disagrees with, and no pin at all.
    const cursor = (model, answer) => hostReview({ host: 'cursor', model, repo: dir, scope: `base ${base}`, resolve: () => 'agent', run: () => ({ status: 0, stdout: answer }) })
    cursor('composer-2.5', said('composer-2.5-fast'))
    row = rows(dir).at(-1)
    assert.deepEqual([row.host, row.model, row.bound, row.reportedModel], ['cursor', 'composer-2.5', 'disagrees', 'composer-2.5-fast'])
    cursor(null, said('composer-2.5-fast'))
    row = rows(dir).at(-1)
    assert.deepEqual([row.host, row.model, row.bound], ['cursor', 'composer-2.5-fast', 'unproven'])
    assert.equal('reportedModel' in row, false)
    // The prompt-file form prints no model: it records the pin, and unproven when Codex did not finish.
    const prompt = join(dir, '.git', 'prompt.txt')
    writeFileSync(prompt, 'review it')
    const argv = ['--host', 'codex', '--effort', 'high', '--repo', dir, '--prompt-file', prompt]
    promptFileReview({ argv, resolve: () => 'codex', run: fakeCodex('VERDICT: APPROVE\n') })
    row = rows(dir).at(-1)
    assert.deepEqual([row.model, row.bound, row.status], [CODEX_MODEL, 'pinned', 'clean'])
    promptFileReview({ argv, resolve: () => 'codex', run: (bin, args) => args.includes('--help') ? { status: 0, stdout: '' } : { status: 1, stdout: '' } })
    row = rows(dir).at(-1)
    assert.deepEqual([row.model, row.bound, row.status], [CODEX_MODEL, 'unproven', 'unavailable'])
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

const manifest = (version, name = 'p') => `{\n  "version": "${version}",\n  "name": "${name}"\n}\n`

function released() {
  const dir = scratch()
  commit(dir, 'plugin/.claude-plugin/plugin.json', manifest('1.0.0'))
  const first = commit(dir, 'plugin/a.mjs', 'one\n')
  git(dir, 'tag', 'v1.0.0')
  return { dir, first }
}

const review = (dir, base, head, status = 'clean', exact = false) => {
  mkdirSync(join(dir, '.git', 'quality-harness'), { recursive: true })
  const prior = existsSync(ledger(dir)) ? readFileSync(ledger(dir), 'utf8') : ''
  writeFileSync(ledger(dir), `${prior}${JSON.stringify({ id: `r${prior.length}`, base, head, exact, status })}\n`)
}

test('release-evidence refuses a plugin commit since the last tag that no review covers, and a covering review clears it', () => {
  const { dir, first } = released()
  try {
    const change = commit(dir, 'plugin/a.mjs', 'two\n')
    const bump = commit(dir, 'plugin/.claude-plugin/plugin.json', manifest('1.0.1'))
    const refused = reviewEvidence(bump, { cwd: dir })
    assert.equal(refused.verdict, 'unproven')
    assert.deepEqual(refused.uncovered, [change], refused.reason)
    // A review that ends before the change, a row with no range and a row naming shas this clone does not have each
    // cover nothing, and none of them turns the verdict into could-not-look on its own.
    review(dir, null, first)
    review(dir, null, bump)
    review(dir, null, null)
    review(dir, 'f'.repeat(40), 'e'.repeat(40))
    const still = reviewEvidence(bump, { cwd: dir })
    assert.deepEqual([still.verdict, still.kind, still.uncovered], ['unproven', 'unreviewed', [change]], still.reason)
    // An exact row covers its own commit and nothing else.
    review(dir, null, bump, 'clean', true)
    assert.equal(reviewEvidence(bump, { cwd: dir }).verdict, 'unproven')
    // ADR-125: a review that requested changes covers nothing; a later clean one over the same commit clears it.
    review(dir, null, change, 'blocking', true)
    assert.equal(reviewEvidence(bump, { cwd: dir }).kind, 'blocked')
    review(dir, null, change, 'clean', true)
    const cleared = reviewEvidence(bump, { cwd: dir })
    assert.equal(cleared.verdict, 'reviewed', cleared.reason)
    // Said: the covering review's own status is in the reason.
    assert.match(cleared.reason, /clean/)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('a version bump alone needs no review, and an unavailable or unparsed review covers nothing', () => {
  const { dir } = released()
  try {
    const bump = commit(dir, 'plugin/.claude-plugin/plugin.json', manifest('1.0.1'))
    commit(dir, 'docs/notes.md', 'prose outside plugin/\n')
    assert.equal(reviewEvidence(git(dir, 'rev-parse', 'HEAD'), { cwd: dir }).verdict, 'not-required')
    // Twin 1: a manifest edit other than its version line needs a review.
    const renamed = commit(dir, 'plugin/.claude-plugin/plugin.json', manifest('1.0.1', 'q'))
    assert.deepEqual(reviewEvidence(renamed, { cwd: dir }).uncovered, [renamed])
    // Twin 2: a commit that bumps AND changes another plugin path needs one.
    writeFileSync(join(dir, 'plugin/.claude-plugin/plugin.json'), manifest('1.0.2', 'q'))
    writeFileSync(join(dir, 'plugin/a.mjs'), 'three\n')
    git(dir, 'add', '-A')
    git(dir, '-c', 'core.hooksPath=/dev/null', 'commit', '-q', '-m', 'both')
    const both = git(dir, 'rev-parse', 'HEAD')
    review(dir, bump, both, 'unavailable')
    review(dir, bump, both, 'unparsed')
    const refused = reviewEvidence(both, { cwd: dir })
    assert.equal(refused.verdict, 'unproven')
    assert.deepEqual(refused.uncovered, [renamed, both])
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('release-evidence asks the review question from its main path', () => {
  const said = []
  const green = { status: 'completed', conclusion: 'success', headSha: 'a'.repeat(40), event: 'workflow_dispatch', jobs: [{ name: 'j', status: 'completed', conclusion: 'success' }] }
  const code = main(['a'.repeat(40)], {
    fetch: () => green,
    outside: () => ({ verdict: 'attested', reason: 'outside run attested', tag: 'v1.0.0' }),
    review: () => ({ verdict: 'unproven', kind: 'unreviewed', reason: '1 plugin commit(s) since v1.0.0 no recorded review covers: abc', uncovered: ['abc'] }),
    log: line => said.push(line), declared: () => ['j'],
  })
  assert.equal(code, 2)
  assert.match(said.join('\n'), /^UNPROVEN/m)
  assert.match(said.join('\n'), /no recorded review covers/)
  const cleared = main(['a'.repeat(40)], {
    fetch: () => green, outside: () => ({ verdict: 'attested', reason: 'ok', tag: 'v1.0.0' }),
    review: () => ({ verdict: 'reviewed', reason: 'covered' }), log: () => {}, declared: () => ['j'],
  })
  assert.equal(cleared, 0)
})

// The Codex review of ce54814c: a row whose head resolves and whose base does not read "not an ancestor of the base"
// for every commit, so it covered them all. Ancestry is three-valued: only a definite "no" leaves a commit outside the base.
test('a review row whose base does not resolve covers nothing', () => {
  const { dir, first } = released()
  try {
    const change = commit(dir, 'plugin/a.mjs', 'two\n')
    review(dir, 'f'.repeat(40), change)
    const refused = reviewEvidence(change, { cwd: dir })
    assert.deepEqual([refused.verdict, refused.uncovered], ['unproven', [change]], refused.reason)
    // The twin: the same row with a base that resolves covers the change.
    review(dir, first, change)
    assert.equal(reviewEvidence(change, { cwd: dir }).verdict, 'reviewed')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

// The cold review of ADR-098 (2026-10-14): `--range` refused every revision with a dot in it, so the
// `<tag>..<head>` form CLAUDE.md §12 gives for a release review failed on every release tag.
test('a review range from a dotted release tag is read, and a three-dot range is not', () => {
  const dir = scratch()
  try {
    const base = commit(dir, 'plugin/a.mjs', 'one\n')
    git(dir, 'tag', 'v1.2.3')
    const head = commit(dir, 'plugin/a.mjs', 'two\n')
    const prompt = join(dir, '.git', 'prompt.txt')
    writeFileSync(prompt, 'review it')
    const review = range => promptFileReview({ argv: ['--host', 'codex', '--effort', 'high', '--repo', dir, '--prompt-file', prompt, '--range', range],
      resolve: () => 'codex', run: fakeCodex('Looks fine.\nVERDICT: APPROVE\n') })
    const said = review('v1.2.3..HEAD')
    assert.equal(said.code, 0, said.err)
    assert.deepEqual([rows(dir)[0].base, rows(dir)[0].head], [base, head])
    // DIRTY twin: a three-dot range names a different set of commits, and is refused as before.
    assert.equal(review('v1.2.3...HEAD').code, 2)
    assert.equal(rows(dir).length, 1, 'the refused range ran nothing and recorded nothing')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

// 2026-10-15: Codex refused to review this repository (its provider's cybersecurity filter, set off by the test strings),
// and the owner chose a recorded Claude review in its place. The Cursor host runs one (a Claude model through
// `agent --model`), and its run was recorded nowhere, so release-evidence could not see it.
test('a Cursor review the launcher runs leaves one review row too', () => {
  const dir = scratch()
  try {
    const base = commit(dir, 'plugin/a.mjs', 'one\n')
    const head = commit(dir, 'plugin/a.mjs', 'two\n')
    const clean = JSON.stringify({ result: JSON.stringify({ status: 'clean', findings: [] }) })
    const result = hostReview({ host: 'cursor', model: 'claude-opus-5-thinking-high', repo: dir, scope: `base ${base}`, resolve: () => 'agent', run: () => ({ status: 0, stdout: clean }) })
    const [row] = rows(dir)
    assert.equal(rows(dir).length, 1, JSON.stringify(result))
    assert.deepEqual([row.host, row.model, row.base, row.head], ['cursor', 'claude-opus-5-thinking-high', base, head])
    assert.equal(row.status, result.status)
    // CLEAN twin: a review handed its output runs nothing and records nothing.
    hostReview({ host: 'cursor', model: 'm', output: clean })
    assert.equal(rows(dir).length, 1)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

// The first real Cursor review (2026-10-15) ended "agent exited 1": the headless agent refuses a workspace nobody has
// trusted, and says so on its output, which the launcher dropped. It is passed `--trust` (still `--mode ask`, sandboxed),
// and a failed run names its own last line.
test('a Cursor review trusts the workspace it is asked about, and a failed one says why', () => {
  const dir = scratch()
  try {
    const base = commit(dir, 'plugin/a.mjs', 'one\n')
    commit(dir, 'plugin/a.mjs', 'two\n')
    const seen = []
    hostReview({ host: 'cursor', model: 'm', repo: dir, scope: `base ${base}`, resolve: () => 'agent', run: (bin, args) => { seen.push(args); return { status: 0, stdout: '' } } })
    assert.ok(seen[0].includes('--trust'), JSON.stringify(seen[0]))
    assert.deepEqual(seen[0].slice(seen[0].indexOf('--mode'), seen[0].indexOf('--mode') + 2), ['--mode', 'ask'])
    const failed = hostReview({ host: 'cursor', model: 'm', repo: dir, scope: `base ${base}`, resolve: () => 'agent', run: () => ({ status: 1, stdout: 'Workspace Trust Required\n  Pass --trust\n', stderr: '' }) })
    assert.match(failed.reason, /agent exited 1: Pass --trust/)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
  
// 2026-10-15: Cursor could not run a named model here, so the recorded Claude review the owner chose runs as `claude -p`:
// fresh context, no shell and no write tool, its run recorded. The launcher hands it the scope's diff (BACKLOG §381: with
// git allowed by prefix, `git diff --output=<file>` could write).
test('a headless Claude review is read-only, unwraps its result, and leaves one review row', () => {
  const dir = scratch()
  try {
    const base = commit(dir, 'plugin/a.mjs', 'one\n')
    const head = commit(dir, 'plugin/a.mjs', 'two\n')
    const seen = []
    const envelope = result => JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result })
    const run = answer => (bin, args, options) => {
      seen.push({ bin, args, options, diff: readFileSync(join(args[args.indexOf('--add-dir') + 1], 'scope.diff'), 'utf8') })
      return { status: 0, stdout: envelope(answer) }
    }
    const blocking = JSON.stringify({ status: 'blocking', findings: [{ file: 'plugin/a.mjs', line: 1, problem: 'p', impact: 'i', evidence: 'e', minimal_fix: 'f', severity: 'blocking' }] })
    const result = hostReview({ host: 'claude', repo: dir, scope: `base ${base}`, resolve: () => 'claude', run: run(blocking) })
    assert.equal(result.status, 'blocking', JSON.stringify(result))
    const { args, options, diff } = seen[0]
    for (const flag of ['-p', '--safe-mode', '--no-session-persistence', '--strict-mcp-config']) assert.ok(args.includes(flag), flag)
    assert.equal(args[args.indexOf('--permission-mode') + 1], 'dontAsk')
    assert.equal(args[args.indexOf('--tools') + 1], 'Read,Grep,Glob')
    assert.ok(!args.includes('--allowedTools') && !args.some(arg => /\bBash\b|\bEdit\b|\bWrite\b/.test(arg)), JSON.stringify(args))
    // The diff of the scope it was asked about, in a directory it may read and that is gone once it has answered.
    assert.match(diff, /^-one$/m)
    assert.match(diff, /^\+two$/m)
    assert.ok(!existsSync(args[args.indexOf('--add-dir') + 1]))
    assert.ok(options.timeout > 0 && options.windowsHide)
    const [row] = rows(dir)
    assert.deepEqual([row.host, row.model, row.base, row.head, row.status, row.findings], ['claude', CLAUDE_MODEL, base, head, 'blocking', 1])
    // DIRTY twin: an error envelope is not a review, even when its text holds a clean object.
    const failed = hostReview({ host: 'claude', repo: dir, scope: `base ${base}`, resolve: () => 'claude',
      run: () => ({ status: 0, stdout: JSON.stringify({ subtype: 'error_max_turns', is_error: true, result: JSON.stringify({ status: 'clean', findings: [] }) }) }) })
    assert.equal(failed.status, 'unavailable')
    assert.equal(rows(dir).at(-1).status, 'unavailable')
    const absent = hostReview({ host: 'claude', repo: dir, scope: `base ${base}`, resolve: () => null, run: () => assert.fail('nothing to run') })
    assert.equal(absent.status, 'unavailable')
    // DIRTY twin: a scope whose diff cannot be made is not reviewed blind.
    const blind = hostReview({ host: 'claude', repo: dir, scope: 'base no-such-ref', resolve: () => 'claude', run: () => assert.fail('nothing to run') })
    assert.match(blind.reason, /the diff of scope "base no-such-ref" could not be made/)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

// The recorded Claude review of 18879680..8892eb9c (blocking): the Cursor and Claude rows resolved HEAD after the run, so a
// commit that landed while the reviewer read the diff was recorded as reviewed, and release-evidence cleared it.
test('a Cursor or Claude review records the HEAD it was shown, not the one after it', () => {
  const dir = scratch()
  try {
    const base = commit(dir, 'plugin/a.mjs', 'one\n')
    commit(dir, 'plugin/a.mjs', 'two\n')
    const clean = JSON.stringify({ type: 'result', is_error: false, result: JSON.stringify({ status: 'clean', findings: [] }) })
    for (const host of ['claude', 'cursor']) {
      const shown = git(dir, 'rev-parse', 'HEAD')
      let landed = null
      const run = () => { landed = commit(dir, 'plugin/a.mjs', `${host}\n`); return { status: 0, stdout: clean } }
      hostReview({ host, repo: dir, scope: `base ${base}`, resolve: () => host, run })
      const row = rows(dir).at(-1)
      assert.ok(landed && landed !== shown, 'a commit landed during the run')
      assert.deepEqual([row.host, row.head], [host, shown], `${host}: the commit made during the run is not in the reviewed range`)
    }
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
