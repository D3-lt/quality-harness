// Two leads from a Windows run of 3.8.17 (ADR-094 T3), each a sentence the ledger or the terminal said that
// was not what happened: a tree identical to one that had passed was reported as "only prose changed" (nothing
// changed), and a skip row chained to a REUSE row rather than to the pass that actually ran. The reuse itself
// was right both times; its attribution was not (CLAUDE.md §3: report only what was observed).
import assert from 'node:assert/strict'
import test from 'node:test'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { stateDir } from '../plugin/scripts/event-log.mjs'

const qhCheckScript = fileURLToPath(new URL('../plugin/scripts/qh-check.mjs', import.meta.url))

function sandbox(t) {
  const top = realpathSync.native(mkdtempSync(path.join(process.platform === 'darwin' ? '/private/tmp' : os.tmpdir(), 'qh-attr-')))
  t.after(() => rmSync(top, { recursive: true, force: true }))
  return top
}
const git = (repo, ...args) => {
  const run = spawnSync('git', ['-C', repo, '-c', 'user.name=qh', '-c', 'user.email=qh@example.invalid', ...args], { encoding: 'utf8', timeout: 60_000, windowsHide: true })
  assert.equal(run.status, 0, run.stderr)
}
const write = (repo, file, text) => { mkdirSync(path.dirname(path.join(repo, file)), { recursive: true }); writeFileSync(path.join(repo, file), text) }

function build(top) {
  const repo = path.join(top, 'repo')
  mkdirSync(repo, { recursive: true })
  git(repo, 'init', '-q')
  write(repo, 'check.mjs', "import { appendFileSync } from 'node:fs'\nappendFileSync(process.env.QH_RUNS, 'ran\\n')\n")
  write(repo, 'docs/a.md', 'one\n')
  write(repo, '.quality-harness.json', JSON.stringify({ check: 'node check.mjs', prose: ['docs/'] }))
  git(repo, 'add', '-A')
  git(repo, 'commit', '-q', '-m', 'one', '--no-gpg-sign')
  const runs = path.join(top, 'runs.log')
  writeFileSync(runs, '')
  return { repo, runs }
}
const qhCheck = (top, ctx) => {
  const run = spawnSync(process.execPath, [qhCheckScript], { cwd: ctx.repo, encoding: 'utf8', timeout: 180_000, windowsHide: true,
    env: { ...process.env, TMPDIR: top, TMP: top, TEMP: top, QH_RUNS: ctx.runs, QUALITY_HARNESS_OBSERVE_BUDGET_MS: '60000' } })
  assert.equal(run.status, 0, run.stderr)
  return { ...run, runs: readFileSync(ctx.runs, 'utf8').split('\n').filter(Boolean).length }
}
const ledger = (repo, file) => {
  try { return readFileSync(path.join(stateDir(repo), file), 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line)) } catch { return [] }
}

test('a tree identical to one that passed is "already passed", not "only prose changed", and writes no reuse row', t => {
  const top = sandbox(t)
  const ctx = build(top)
  assert.equal(qhCheck(top, ctx).runs, 1)
  const [original] = ledger(ctx.repo, 'checks.jsonl')
  write(ctx.repo, 'docs/a.md', 'two\n')
  const reuse = qhCheck(top, ctx)
  assert.match(reuse.stderr, /only prose changed/, reuse.stderr)
  write(ctx.repo, 'docs/a.md', 'one\n')
  const back = qhCheck(top, ctx)
  assert.equal(back.runs, 1, back.stderr)
  assert.match(back.stderr, /already passed on this tree/, back.stderr)
  assert.doesNotMatch(back.stderr, /only prose changed/, back.stderr)
  assert.equal(ledger(ctx.repo, 'checks.jsonl').length, 2, 'nothing changed, so no row says anything did')
  const skip = ledger(ctx.repo, 'skips.jsonl').at(-1)
  assert.equal(skip.passId, original.id)
  assert.equal(skip.viaProse, undefined)
})

test('a skip row names the pass that ran, not the reuse row that stood for it', t => {
  const top = sandbox(t)
  const ctx = build(top)
  assert.equal(qhCheck(top, ctx).runs, 1)
  const [original] = ledger(ctx.repo, 'checks.jsonl')
  write(ctx.repo, 'docs/a.md', 'two\n')
  qhCheck(top, ctx)
  write(ctx.repo, 'docs/a.md', 'three\n')
  const third = qhCheck(top, ctx)
  assert.match(third.stderr, /only prose changed/, third.stderr)
  const skips = ledger(ctx.repo, 'skips.jsonl')
  assert.deepEqual(skips.map(row => row.passId), [original.id, original.id], 'both reuses point at the pass that ran')
  assert.equal(skips.at(-1).viaProse, true)
})
