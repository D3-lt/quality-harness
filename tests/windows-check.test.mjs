// ADR-126 T6: once land/<sha> is pushed, land says what a Windows peer runs at that sha, so a Windows-only defect is found
// while CI runs rather than after it (five of the week's eleven CHANGE failures were Windows-only, 2026-10-22). Against a
// fake git and gh, as tests/land.test.mjs drives land; nothing here reaches a real remote (CLAUDE.md §9).
import assert from 'node:assert/strict'
import test from 'node:test'
import { land } from '../scripts/land.mjs'

const SHA = 'a'.repeat(40)
const OTHER = 'b'.repeat(40)
const WORKFLOW = 'jobs:\n  windows:\n    name: windows\n'
const LANDING = `git push origin ${SHA}:refs/heads/land/${SHA}`
const green = [{ id: 1, name: 'windows', status: 'completed', conclusion: 'success', started_at: '2026-10-22T10:00:00Z', app: { id: 15368 } }]

function world({ pushFails = false } = {}) {
  const said = []
  const order = []
  let origin = OTHER
  const exec = (cmd, args) => {
    const line = [cmd, ...args].join(' ')
    order.push(line)
    const ok = (stdout = '') => ({ status: 0, stdout, stderr: '' })
    if (line === 'git rev-parse HEAD' || line === 'git rev-parse refs/heads/main') return ok(`${SHA}\n`)
    if (line === 'git symbolic-ref --short HEAD') return ok('main\n')
    if (line === 'git status --porcelain' || line === 'git fetch -q origin main') return ok()
    if (line.startsWith('git merge-base --is-ancestor')) return { status: origin === SHA ? 0 : 1, stdout: '', stderr: '' }
    if (line === `git show ${SHA}:.github/workflows/selftest.yml`) return ok(WORKFLOW)
    if (line === LANDING) return pushFails ? { status: 1, stdout: '', stderr: 'rejected' } : ok()
    if (line.startsWith(`gh api repos/{owner}/{repo}/commits/${SHA}/check-runs`)) return ok(JSON.stringify([{ total_count: 1, check_runs: green }]))
    if (line === `git push origin ${SHA}:refs/heads/main`) { origin = SHA; return ok() }
    if (line === 'git ls-remote origin refs/heads/main') return ok(`${origin}\trefs/heads/main\n`)
    if (line === `git push origin --delete land/${SHA}`) return ok()
    throw new Error(`the fake has no answer for: ${line}`)
  }
  let clock = 0
  const protection = () => ({ state: 'protected', text: 'forge: main requires 1 status check(s)', required: [{ context: 'windows', integration: 15368 }] })
  const go = (extra = {}) => land({ exec, log: line => { said.push(line); order.push(`log: ${line}`) }, now: () => clock, sleep: ms => { clock += ms }, protection, ...extra })
  return { said, order, go }
}

const windowsLine = said => said.find(line => /Windows/.test(line) && line.includes(SHA))

test('land names the Windows check once land/<sha> is pushed, and only then', () => {
  const w = world()
  assert.equal(w.go(), 0, w.said.join('\n'))
  const line = windowsLine(w.said)
  assert.ok(line, w.said.join('\n'))
  assert.match(line, /git clone -c core\.longpaths=true/)
  assert.match(line, /bash scripts\/selftest\.sh/)
  const at = w.order.indexOf(`log: ${line}`)
  assert.ok(at > w.order.indexOf(LANDING), 'said after the staged push')
  assert.ok(at < w.order.findIndex(entry => entry.includes('/check-runs')), 'said before the wait')
  // DIRTY twins: a push that failed, and a dry run, say nothing of it.
  const refused = world({ pushFails: true })
  assert.equal(refused.go(), 1)
  assert.equal(windowsLine(refused.said), undefined)
})
