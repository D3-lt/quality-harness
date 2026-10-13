// ADR-100 T1: a Codex review the launcher runs is recorded where release-evidence reads it, and a
// plugin commit since the last tag that no recorded review covers keeps a release UNPROVEN.
// Every repository here is one this test made (CLAUDE.md §9).
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { CODEX_MODEL, hostReview, promptFileReview, verdictStatus } from '../plugin/scripts/host-review.mjs'
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
    review(dir, null, change, 'blocking', true)
    const cleared = reviewEvidence(bump, { cwd: dir })
    assert.equal(cleared.verdict, 'reviewed', cleared.reason)
    // Said, never judged: the covering review's own status is in the reason.
    assert.match(cleared.reason, /blocking/)
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
    log: line => said.push(line),
  })
  assert.equal(code, 2)
  assert.match(said.join('\n'), /^UNPROVEN/m)
  assert.match(said.join('\n'), /no recorded review covers/)
  const cleared = main(['a'.repeat(40)], {
    fetch: () => green, outside: () => ({ verdict: 'attested', reason: 'ok', tag: 'v1.0.0' }),
    review: () => ({ verdict: 'reviewed', reason: 'covered' }), log: () => {},
  })
  assert.equal(cleared, 0)
})
