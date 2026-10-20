// ADR-117 T2: every row adr-verify writes leaves a receipt in the repository's state directory, and adr-lint refuses a
// row the committed file does not hold and no receipt names. Each run is over a copy of tests/fixtures/ok in the OS temp
// directory, never over this checkout (CLAUDE.md §9). The dirty twins are beside the clean ones: a typed row, and a
// receipts file taken away.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { stateDir } from '../plugin/scripts/event-log.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const bin = path.join(repoRoot, 'plugin', 'bin')
const made = []
test.after(() => { for (const dir of made) rmSync(dir, { recursive: true, force: true, maxRetries: 5 }) })

const FENCE = ['```bash', 'if grep -q "## Decisiun" ADR-001-selftest.md; then echo "1 failed in 0.01s"; exit 1; fi', 'echo "1 passed in 0.01s"', '```'].join('\n')
const temp = () => {
  const dir = realpathSync.native(mkdtempSync(path.join(os.tmpdir(), 'qh-receipts-')))
  made.push(dir)
  return dir
}
const git = (dir, ...args) => {
  const run = spawnSync('git', ['-c', 'user.email=t@example.invalid', '-c', 'user.name=T', ...args], { cwd: dir, encoding: 'utf8', timeout: 60_000, windowsHide: true })
  assert.equal(run.status, 0, run.stderr)
}
/** A copy of the ok fixture with this file's fence and a Mutation Log, committed unless `repo: false`. */
function corpus({ repo = true } = {}) {
  const dir = path.join(temp(), 'ok')
  cpSync(path.join(repoRoot, 'tests', 'fixtures', 'ok'), dir, { recursive: true })
  const task = path.join(dir, 'tasks', 'T1-fixture.md')
  writeFileSync(task, `${readFileSync(task, 'utf8').replace(/```bash\n[\s\S]*?```/, FENCE).trimEnd()}\n\n## Mutation Log\n`)
  if (repo) for (const args of [['init', '-q', '-b', 'main', '.'], ['add', '.'], ['commit', '-qm', 'fixture']]) git(dir, ...args)
  return { dir, task }
}
// Through the interpreter, as Windows needs (CLAUDE.md §7); the state root is this test's to set or to leave out.
const gate = (name, dir, args, root) => {
  const env = { ...process.env }
  delete env.QUALITY_HARNESS_STATE_DIR
  if (root) env.QUALITY_HARNESS_STATE_DIR = root
  return spawnSync('python3', [path.join(bin, name), ...args], { cwd: dir, env, encoding: 'utf8', timeout: 120_000, windowsHide: true })
}
const lint = (dir, root) => gate('adr-lint', dir, ['ADR-001-selftest.md', 'tasks'], root)
const said = run => `${run.stdout}\n${run.stderr}`
const NO_RECEIPT = /no adr-verify receipt names it/
// The state directory as the hooks name it, which is the directory ADR-117 T1 guards.
const hookState = (dir, root) => {
  const saved = process.env.QUALITY_HARNESS_STATE_DIR
  if (root) process.env.QUALITY_HARNESS_STATE_DIR = root
  else delete process.env.QUALITY_HARNESS_STATE_DIR
  try { return stateDir(dir) } finally { if (saved === undefined) delete process.env.QUALITY_HARNESS_STATE_DIR; else process.env.QUALITY_HARNESS_STATE_DIR = saved }
}
const pyState = (dir, root) => {
  const env = { ...process.env }
  delete env.QUALITY_HARNESS_STATE_DIR
  if (root) env.QUALITY_HARNESS_STATE_DIR = root
  const run = spawnSync('python3', ['-c', 'import sys; sys.path.insert(0, sys.argv[1]); from record import state_dir; print(state_dir(sys.argv[2]))', path.join(repoRoot, 'plugin', 'lib'), dir],
    { env, encoding: 'utf8', timeout: 60_000, windowsHide: true })
  assert.equal(run.status, 0, run.stderr)
  return run.stdout.trim()
}
const receipts = state => (existsSync(path.join(state, 'receipts.jsonl')) ? readFileSync(path.join(state, 'receipts.jsonl'), 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line)) : [])
// A row typed by hand: an adr-verify row with its date moved, which no receipt names.
const typed = row => row.replace(/^- \d{4}-\d{2}-\d{2} /, '- 2026-01-01 ')
const rows = (task, section) => (readFileSync(task, 'utf8').split(`## ${section}`)[1] ?? '').split('\n## ')[0].split('\n').filter(line => /^- \d{4}-\d{2}-\d{2} · /.test(line))
const add = (task, section, row) => {
  const text = readFileSync(task, 'utf8')
  const at = text.indexOf(`## ${section}`) + `## ${section}`.length
  writeFileSync(task, `${text.slice(0, at)}\n\n${row}${text.slice(at)}`)
}

test('a hand-typed uncommitted log row is refused, and every row adr-verify writes carries a receipt', () => {
  // The writer and the reader find the directory the hooks guard, with the state root set and without it.
  const { dir, task } = corpus()
  const root = temp()
  assert.equal(pyState(dir), hookState(dir))
  assert.equal(pyState(dir, root), hookState(dir, root))
  const state = hookState(dir)

  // A run, a recorded mutant and a hand-reported mutant each leave one receipt, and their uncommitted rows pass.
  const run = gate('adr-verify', dir, ['tasks/T1-fixture.md', '--cwd', '.'])
  assert.equal(run.status, 0, said(run))
  const mutant = gate('adr-verify', dir, ['tasks/T1-fixture.md', '--cwd', '.', '--mutant', 'ADR-001-selftest.md', '--from', '## Decision', '--to', '## Decisiun', '--why', 'the fence notices a broken Decision'])
  assert.equal(mutant.status, 0, said(mutant))
  const human = gate('adr-verify', dir, ['tasks/T1-fixture.md', '--cwd', '.', '--human-mutant', 'ADR-001-selftest.md', '--from', '## Decision', '--to', '## Decisiun', '--test', 'adr-lint-positive', '--test-exit', '1', '--why', 'a person broke the Decision heading'])
  assert.equal(human.status, 0, said(human))
  const written = [...rows(task, 'Verification Log'), ...rows(task, 'Mutation Log')]
  assert.ok(written.length >= 3, written.join('\n'))
  const kept = receipts(state)
  assert.equal(kept.length, written.length, JSON.stringify(kept))
  for (const receipt of kept) {
    assert.equal(receipt.task, 'tasks/T1-fixture.md', 'the task is named relative to its repository, never by an absolute path')
    assert.match(receipt.sha256, /^[0-9a-f]{64}$/)
    assert.equal(typeof receipt.at, 'string')
  }
  const clean = lint(dir)
  assert.equal(clean.status, 0, said(clean))
  assert.doesNotMatch(said(clean), NO_RECEIPT)

  // A typed row in either log is refused; the same row committed passes, since a committed row needs none.
  for (const section of ['Verification Log', 'Mutation Log']) {
    const before = readFileSync(task, 'utf8')
    add(task, section, typed(rows(task, section)[0]))
    const refused = lint(dir)
    assert.equal(refused.status, 1, `${section}: ${said(refused)}`)
    assert.match(said(refused), NO_RECEIPT, section)
    writeFileSync(task, before)
  }
  add(task, 'Verification Log', typed(rows(task, 'Verification Log')[0]))
  git(dir, 'add', '.')
  git(dir, 'commit', '-qm', 'rows')
  const committed = lint(dir)
  assert.equal(committed.status, 0, said(committed))

  // Under a state root the receipts go there, and a probe linting under one still reads the repository's own.
  const rooted = corpus()
  assert.equal(gate('adr-verify', rooted.dir, ['tasks/T1-fixture.md', '--cwd', '.'], root).status, 0)
  assert.equal(receipts(hookState(rooted.dir, root)).length, 1)
  // The fixture's task is done with no mutant here, so the lint fails for that; what matters is the receipt rule.
  assert.doesNotMatch(said(lint(rooted.dir, root)), NO_RECEIPT)
  const probed = corpus()
  assert.equal(gate('adr-verify', probed.dir, ['tasks/T1-fixture.md', '--cwd', '.']).status, 0)
  assert.doesNotMatch(said(lint(probed.dir, temp())), NO_RECEIPT, 'a receipt in the repository counts under a probe\'s state root')

  // The receipts taken away: the uncommitted row adr-verify wrote is refused, so deleting the file closes nothing.
  rmSync(path.join(hookState(probed.dir), 'receipts.jsonl'))
  const bare = lint(probed.dir)
  assert.equal(bare.status, 1, said(bare))
  assert.match(said(bare), NO_RECEIPT)

  // Outside a repository there is no committed file and no state directory to look at, so nothing is accused.
  const loose = corpus({ repo: false })
  add(loose.task, 'Verification Log', typed(rows(task, 'Verification Log')[0]))
  assert.doesNotMatch(said(lint(loose.dir)), NO_RECEIPT)
})

// The Codex review of aae06d72..90b9ceaf: a task HEAD does not hold read as could-not-look, so a new or renamed task took a
// typed row, digest or none. Proven absent from HEAD is not could-not-look. A receipt names its row by digest alone, so a
// task moved after adr-verify wrote its rows keeps them.
test('a task HEAD does not hold still needs a receipt for every row, and a moved task keeps its receipts', () => {
  const { dir, task } = corpus()
  git(dir, 'rm', '-q', '--cached', 'tasks/T1-fixture.md')
  git(dir, 'commit', '-qm', 'the task is new')
  const run = gate('adr-verify', dir, ['tasks/T1-fixture.md', '--cwd', '.'])
  assert.equal(run.status, 0, said(run))
  assert.doesNotMatch(said(lint(dir)), NO_RECEIPT, 'a row adr-verify wrote into a new task passes')
  const before = readFileSync(task, 'utf8')
  for (const row of [typed(rows(task, 'Verification Log')[0]), '- 2026-01-01 · abc1234 · exit 0 · `echo "1 passed in 0.01s"`']) {
    add(task, 'Verification Log', row)
    assert.match(said(lint(dir)), NO_RECEIPT, `a typed row in a task HEAD does not hold is refused: ${row}`)
    writeFileSync(task, before)
  }
  // The receipts name another path for the same rows, as they would after a move: the rows still pass.
  const state = hookState(dir)
  writeFileSync(path.join(state, 'receipts.jsonl'), receipts(state).map(r => `${JSON.stringify({ ...r, task: 'tasks/T1-moved.md' })}\n`).join(''))
  assert.doesNotMatch(said(lint(dir)), NO_RECEIPT, 'a receipt is matched by its row, wherever the task now is')
})

// The verification review of a855f7f7: a task moved to a path HEAD does not hold kept its committed rows, and a rule that
// asked a receipt of each refused rows written before receipts existed. A row HEAD holds anywhere is a committed row.
test('a moved task keeps the rows HEAD holds, and a row new to it still needs a receipt', () => {
  const { dir, task } = corpus()
  add(task, 'Verification Log', '- 2026-09-12 · abc1234 · exit 0 · `echo "1 passed in 0.01s"` · acceptance-sha256:' + '0'.repeat(64))
  git(dir, 'add', '.')
  git(dir, 'commit', '-qm', 'a row from before receipts')
  git(dir, 'mv', 'tasks/T1-fixture.md', 'tasks/T1-moved.md')
  const moved = path.join(dir, 'tasks', 'T1-moved.md')
  assert.doesNotMatch(said(lint(dir)), NO_RECEIPT, 'a committed row is still committed after a move')
  add(moved, 'Verification Log', '- 2026-01-01 · abc1234 · exit 0 · `echo "1 passed in 0.01s"` · acceptance-sha256:' + '1'.repeat(64))
  assert.match(said(lint(dir)), NO_RECEIPT, 'a row HEAD holds nowhere still needs a receipt')
})

// BACKLOG §389 (ADR-119 T3): an adr-verify older than receipts (3.8.48) writes rows no receipt names, and a newer adr-lint
// refused them in words that said only "typed by hand". When no receipt names any row of the task, the refusal says its
// writer may predate receipts and what fixes that. A task one of whose rows a receipt names is told nothing of the sort.
test('a row from a task no receipt names says its writer may predate receipts', () => {
  const PREDATES = /may predate receipts \(3\.8\.48\).*updat\w* the installed plugin/
  const { dir, task } = corpus()
  add(task, 'Verification Log', '- 2026-01-01 · abc1234 · exit 0 · `echo "1 passed in 0.01s"` · acceptance-sha256:' + '1'.repeat(64))
  const none = said(lint(dir))
  assert.match(none, NO_RECEIPT)
  assert.match(none, PREDATES)
  const run = gate('adr-verify', dir, ['tasks/T1-fixture.md', '--cwd', '.'])
  assert.equal(run.status, 0, said(run))
  const named = said(lint(dir))
  assert.match(named, NO_RECEIPT, 'the typed row is still refused')
  assert.doesNotMatch(named, PREDATES)
})
