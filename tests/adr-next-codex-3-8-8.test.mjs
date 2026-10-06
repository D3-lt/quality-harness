// The Codex review of 4283d6a...3ff59fb (2026-10-06) found five ways adr-next counted a task done,
// or offered work, that it should not have, or stopped work it should not have. Each test carries
// its control (CLAUDE.md §4).
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { lstatSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const adrNext = join(repoRoot, 'plugin', 'bin', 'adr-next')
const temps = []
test.after(() => { for (const dir of temps) rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }) })

const digestOf = fence => createHash('sha256').update(fence, 'utf8').digest('hex')
const evidenced = (title, deps = 'none') => `# ${title}\n\n**Depends-on:** ${deps}\n\n## Acceptance\n\n\`\`\`bash\ntrue\n\`\`\`\n\n`
  + `## Verification Log\n- 2026-08-26 · no-git · exit 0 · \`true\` · acceptance-sha256:${digestOf('true')}\n`
const pending = (title, deps) => `# ${title}\n\n**Depends-on:** ${deps}\n\n## Acceptance\n\n\`\`\`bash\ntrue\n\`\`\`\n`
const watched = (title, rows) => `# ${title}\n\n**Depends-on:** none\n\n## Acceptance\n\nAcceptance is human-observed: a person watches it.\n\n`
  + `## Verification Log\n${rows.map(([day, note]) => `- 2026-10-0${day} · human-observed · ${note}\n`).join('')}`

// A repository holding `records` (number -> { name: text }), each Accepted.
function corpus(records) {
  const repo = mkdtempSync(join(tmpdir(), 'qh-codex-388-'))
  temps.push(repo)
  // Git runs only in a directory this file made (CLAUDE.md §9).
  assert.equal(spawnSync('git', ['init', '-q'], { cwd: repo, timeout: 30_000, windowsHide: true }).status, 0)
  for (const [n, files] of Object.entries(records)) {
    mkdirSync(join(repo, 'docs', 'adr', `ADR-${n}-x`, 'tasks'), { recursive: true })
    writeFileSync(join(repo, 'docs', 'adr', `ADR-${n}-x.md`), `# ADR-${n}: X\n\n**Status:** Accepted\n\n## Context\n\nx\n`)
    for (const [name, make] of Object.entries(files)) {
      const file = join(repo, 'docs', 'adr', `ADR-${n}-x`, 'tasks', name)
      if (typeof make === 'function') make(file); else writeFileSync(file, make)
    }
  }
  return repo
}
const answer = (repo, n) => {
  const tasks = join(repo, 'docs', 'adr', `ADR-${n}-x`, 'tasks')
  // A 20s bound: a reader that opens a FIFO waits forever, and the kill is the red.
  const r = spawnSync('python3', [adrNext, '--all', '--json', tasks], { cwd: tasks, encoding: 'utf8', timeout: 20_000, windowsHide: true })
  assert.notEqual(r.signal, 'SIGTERM', 'adr-next waited on an entry')
  assert.ok(r.status === 0 || r.status === 3, `adr-next exit ${r.status}: ${r.stderr}`)
  return JSON.parse(r.stdout)
}
const ids = (a, bucket) => (a[bucket] ?? []).map(t => t.id)
const fifo = path => spawnSync('mkfifo', [path], { timeout: 10_000, windowsHide: true }).status === 0
  && (() => { try { return lstatSync(path).isFIFO() } catch { return false } })()

test('a task titled for another record is not done under this one, whatever its evidence', () => {
  const repo = corpus({ '018': { 'T1-a.md': evidenced('Task ADR-006-T1: six one'), 'T2-b.md': pending('Task ADR-018-T2: next', 'T1') } })
  const a = answer(repo, '018')
  assert.deepEqual(ids(a, 'done'), [], JSON.stringify(a))
  assert.deepEqual(ids(a, 'ready'), [], JSON.stringify(a))
  // The control: titled for its own record, the same evidence is done and T2 is ready.
  const own = answer(corpus({ '018': { 'T1-a.md': evidenced('Task ADR-018-T1: one'), 'T2-b.md': pending('Task ADR-018-T2: next', 'T1') } }), '018')
  assert.deepEqual([ids(own, 'done'), ids(own, 'ready')], [['T1'], ['T2']])
})

test('the last human sign-off decides: an approval taken back is not done, a stop later approved is', () => {
  const revoked = answer(corpus({ '003': { 'T1-w.md': watched('Task ADR-003-T1: watch', [[1, 'approved'], [2, 'approval revoked']]) } }), '003')
  assert.deepEqual(ids(revoked, 'done'), [], JSON.stringify(revoked))
  const later = answer(corpus({ '003': { 'T1-w.md': watched('Task ADR-003-T1: watch', [[1, 'not approved — it froze'], [2, 'approved after the fix']]) } }), '003')
  assert.deepEqual(ids(later, 'done'), ['T1'], JSON.stringify(later))
})

test('a FIFO behind a cross-record dependency is not opened', t => {
  let made = true
  const repo = corpus({
    '006': { 'T1-x.md': file => { made = fifo(file) } },
    '018': { 'T1-a.md': pending('Task ADR-018-T1: needs six', 'ADR-006-T1') },
  })
  if (!made) { t.skip('mkfifo makes no FIFO here'); return }
  const a = answer(repo, '018')
  assert.deepEqual(ids(a, 'ready'), [], JSON.stringify(a))
})

test("an irregular entry sharing a done task's id withholds it, whichever name sorts first", () => {
  const repo = corpus({ '007': { 'T1-a.md': evidenced('Task ADR-007-T1: one'), 'T1-z.md': mkdirSync, 'T2-b.md': pending('Task ADR-007-T2: next', 'T1') } })
  const a = answer(repo, '007')
  assert.deepEqual([ids(a, 'done'), ids(a, 'ready')], [[], []], JSON.stringify(a))
  assert.match((a.stopped ?? []).find(t => t.id === 'T1')?.stopped_by ?? '', /T1-a\.md.*T1-z\.md|T1-z\.md.*T1-a\.md/, JSON.stringify(a))
})

test('success prose about revoking or rolling back is not a taken-back approval, and an unspaced cross is', () => {
  const one = note => ids(answer(corpus({ '003': { 'T1-w.md': watched('Task ADR-003-T1: watch', [[1, note]]) } }), '003'), 'done')
  for (const note of ['observed: the expired token was revoked; the new token works',
    'verified: rolled back to the previous release successfully']) assert.deepEqual(one(note), ['T1'], note)
  for (const note of ['❌observed', 'observed, then revoked', 'approval revoked']) assert.deepEqual(one(note), [], note)
})

test("a dependency on another record's task whose approval was taken back is not met", () => {
  const dependent = pending('Task ADR-018-T1: needs six', 'ADR-006-T1')
  const revoked = answer(corpus({ '006': { 'T1-w.md': watched('Task ADR-006-T1: watch', [[1, 'approved'], [2, 'approval revoked']]) }, '018': { 'T1-a.md': dependent } }), '018')
  assert.deepEqual(ids(revoked, 'ready'), [], JSON.stringify(revoked))
  // The control: approved and left standing, the same dependency is met.
  const kept = answer(corpus({ '006': { 'T1-w.md': watched('Task ADR-006-T1: watch', [[1, 'approved']]) }, '018': { 'T1-a.md': dependent } }), '018')
  assert.deepEqual(ids(kept, 'ready'), ['T1'], JSON.stringify(kept))
})
