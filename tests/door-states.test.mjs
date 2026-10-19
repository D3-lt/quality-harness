// ADR-117 T3: the forge's protection of main is said, and every side door is caught or named where it closes. A push with
// --no-verify from a script skips every local hook, so it closes at the forge or nowhere: release-evidence says which,
// from an injected gh here. A door has three states, and an open one, a boundary with no place it closes, or a door with
// no state fails the sweep. The receipts adr-verify writes (T2) are a ledger the sweep finds a writer of.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { doorStates, sweep } from '../scripts/side-door-sweep.mjs'
import { main, mainProtection } from '../scripts/release-evidence.mjs'
import { fixtureRepo, sandbox } from './hook-golden.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ALLOW = JSON.parse(readFileSync(path.join(repoRoot, 'scripts', 'side-doors.json'), 'utf8'))
const NONE = { writingTools: [], sites: { writer: {}, spawn: {}, tool: {} } }
// A gh that answers the rules endpoint with `answer`, or fails as an absent or offline gh does.
const gh = answer => (command, args) => {
  assert.equal(command, 'gh')
  assert.deepEqual(args.slice(0, 2), ['api', 'repos/{owner}/{repo}/rules/branches/main'])
  if (answer instanceof Error) throw answer
  return answer
}
const CHECKS = { type: 'required_status_checks', parameters: { required_status_checks: [{ context: 'selftest (ubuntu-latest)' }, { context: 'selftest (windows-latest)' }] } }

test('the forge protection of main is said, and no door is open', t => {
  // Protected, unprotected and could-not-look, each said as itself.
  const protectedMain = mainProtection(gh(JSON.stringify([{ type: 'deletion' }, CHECKS])))
  assert.equal(protectedMain.state, 'protected')
  assert.match(protectedMain.text, /requires 2 status check/)
  for (const answer of ['[]', JSON.stringify([{ type: 'deletion' }]), JSON.stringify([{ type: 'required_status_checks', parameters: { required_status_checks: [] } }])]) {
    const open = mainProtection(gh(answer))
    assert.equal(open.state, 'unprotected', answer)
    assert.match(open.text, /--no-verify/, answer)
  }
  for (const answer of [new Error('gh: not found'), 'not json', '{"message":"Not Found"}']) {
    const unknown = mainProtection(gh(answer))
    assert.equal(unknown.state, 'unknown', String(answer))
    assert.match(unknown.text, /COULD NOT LOOK/, String(answer))
  }
  // release-evidence says it, whatever its verdict: here the run itself could not be looked at.
  const said = []
  main(['0123456789abcdef0123456789abcdef01234567'], { fetch: () => null, forge: () => protectedMain, log: line => said.push(line) })
  assert.ok(said.includes(protectedMain.text), said.join('\n'))

  // The doors as they stand: none open, and each boundary says where it closes.
  const states = doorStates(ALLOW.doors)
  assert.deepEqual(states.problems, [])
  assert.equal(states.counts.open, 0)
  assert.ok(states.counts.boundary >= 1 && states.counts.caught >= 1, JSON.stringify(states.counts))
  for (const door of ALLOW.doors) assert.match(door.why, /ADR-\d+|BACKLOG §\d+|CLAUDE\.md §\d+/, `${door.id} names what governs it`)
  // The twins: an open door, a boundary with nowhere it closes, a door with no state and one with a state not of the three.
  const planted = doorStates([
    { id: 'a', status: 'open', why: 'x' },
    { id: 'b', status: 'boundary', why: 'x' },
    { id: 'c', why: 'x' },
    { id: 'd', status: 'shut', why: 'x' },
    { id: 'e', status: 'boundary', where: 'the forge', why: 'x' },
  ])
  assert.deepEqual(planted.problems.map(problem => problem.id), ['a', 'b', 'c', 'd'])

  // The gate fails on an open door, and its line counts each state.
  const box = sandbox(t)
  const repo = fixtureRepo(box, 'open-door', {
    'plugin/scripts/x.mjs': 'export const x = 1\n',
    'scripts/side-doors.json': `${JSON.stringify({ ...NONE, doors: [{ id: 'a', status: 'open', why: 'x' }, { id: 'e', status: 'caught', why: 'x' }] })}\n`,
    'plugin/hooks/hooks.json': '{"hooks":{}}\n',
  })
  const run = spawnSync(process.execPath, [path.join(repoRoot, 'scripts', 'side-door-sweep.mjs')], {
    cwd: repo, encoding: 'utf8', timeout: 60_000, windowsHide: true, env: { ...process.env, QUALITY_HARNESS_SIDE_DOOR_ROOT: repo },
  })
  assert.equal(run.status, 1, `${run.stdout}${run.stderr}`)
  assert.match(run.stdout, /doors: 1 caught, 0 boundary, 1 open/)
  assert.match(run.stdout, /door a is open/)

  // The receipts file is a ledger, and a Python writer that opens it through a call inside open() is still a writer.
  const writer = 'RECEIPTS = "receipts.jsonl"\nwith open(os.path.join(directory, RECEIPTS), "a", encoding="utf-8") as out:\n    out.write(row)\n'
  const found = sweep({ files: ['plugin/lib/r.py'], read: () => writer, hooks: { hooks: {} }, allow: NONE })
  assert.deepEqual(found.unlisted.map(site => site.key), ['writer plugin/lib/r.py'])
  const reader = 'RECEIPTS = "receipts.jsonl"\nwith open(os.path.join(directory, RECEIPTS), encoding="utf-8") as source:\n    source.read()\n'
  assert.deepEqual(sweep({ files: ['plugin/lib/r.py'], read: () => reader, hooks: { hooks: {} }, allow: NONE }).unlisted, [])
})
