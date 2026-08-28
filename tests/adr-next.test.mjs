// bin/adr-next — what a session is told to do next, and what proves it done.
//
// Wave 3 covered is_done's two true arms and the digest it shares with adr-lint
// and adr-verify. What had never run is everything AROUND that: the dependency
// edges that decide readiness, the three output modes, and every exit path. The
// tool answers "what may I start now", so a wrong answer sends a session to work
// that cannot proceed — or hides work that can.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import { delimiter, dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const testDir = dirname(fileURLToPath(import.meta.url))
const root = resolve(testDir, '..')
const bin = join(root, 'bin')
const env = { ...process.env, PATH: `${bin}${delimiter}${process.env.PATH ?? ''}` }

const temps = []
test.after(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true })
})

// 60s, not 30s: a Windows runner's first Python spawn is slow enough to hit a
// 30-second cap. Measured 2026-08-27, run 33047105629 — adr-next took 31456ms
// and reported `status: null` with empty stderr, which reads as a logic failure
// and is a cold start. A passing spawn never waits the timeout, so the larger
// cap costs nothing but a genuine hang taking longer to be called one.
function next(args, cwd) {
  const [file, argv] = process.platform === 'win32'
    ? ['python3', [join(bin, 'adr-next'), ...args]]
    : ['adr-next', args]
  return spawnSync(file, argv, { cwd, env, encoding: 'utf8', timeout: 60_000 })
}

// The fence is single-line and blank-free, so normalization is the identity and
// this digest is the one all three tools compute. The shared normalizer is
// asserted directly in tests/gate-regressions.py; here it only has to match.
const digestOf = fence => createHash('sha256').update(fence, 'utf8').digest('hex')

/**
 * One task file. `evidence` marks it done the only way that counts — a
 * tool-written exit-0 entry whose digest matches the fence it claims to prove.
 */
function task({ id, goal = `do ${id}`, dependsOn = 'none', consumes = 'none',
                produces = 'none', fence = `printf ${id}`, human = false, evidence = false,
                signoff = null }) {
  const acceptance = human
    ? 'Acceptance is human-observed: a person confirms it.'
    : `\`\`\`bash\n${fence}\n\`\`\``
  const log = evidence
    ? (human
      ? `${signoff ?? '- 2026-08-26 · human-observed · PASS — Zy confirmed it'}\n`
      : `- 2026-08-26 · no-git · exit 0 · \`${fence}\` · acceptance-sha256:${digestOf(fence)}\n`)
    : ''
  return `# Task ${id}: ${goal}\n\n`
    + `**Depends-on:** ${dependsOn}\n**Consumes:** ${consumes}\n**Produces:** ${produces}\n\n`
    + `## Acceptance\n\n${acceptance}\n\n## Verification Log\n${log}`
}

/**
 * A corpus with two records: ADR-003 whose T1 is INCOMPLETE, and ADR-007 whose
 * T1 depends on whatever `pointer` names. Returns ADR-007's tasks directory.
 *
 * The single-record `corpus` helper cannot express this, and that is the point —
 * a cross-record edge has no meaning inside one record, which is why the gap
 * survived: every fixture the suite had was a single record.
 */
function twoRecords(pointer) {
  const dir = mkdtempSync(join(os.tmpdir(), 'quality-harness-cross-'))
  temps.push(dir)
  for (const [name, spec] of [
    ['ADR-003-target', { id: 'T1' }],
    ['ADR-007-source', { id: 'T1', dependsOn: pointer }],
  ]) {
    const tasksDir = join(dir, name, 'tasks')
    mkdirSync(tasksDir, { recursive: true })
    writeFileSync(join(dir, `${name}.md`), `# ${name.slice(0, 7)}: probe\n\n**Status:** Accepted\n`)
    writeFileSync(join(tasksDir, `${spec.id}-t.md`), task(spec))
    writeFileSync(join(tasksDir, 'README.md'),
      `# Tasks\n\n| Order | Task | Status |\n| 1 | ${spec.id} | pending |\n`)
  }
  return { dir, tasksDir: join(dir, 'ADR-007-source', 'tasks') }
}

function corpus(tasks, { adr = false } = {}) {
  const dir = mkdtempSync(join(os.tmpdir(), 'quality-harness-next-'))
  temps.push(dir)
  const tasksDir = join(dir, 'tasks')
  mkdirSync(tasksDir)
  // A derived index and a stray note: neither may be read as a task. The index
  // is the file adr-next exists to NOT trust — and its heading is written to look
  // like a task heading on purpose, because a README skipped only by failing the
  // id pattern is skipped by luck, not by the rule that means to skip it.
  writeFileSync(join(tasksDir, 'README.md'),
    '# Task T9: derived index\n\n| Order | Task | Status |\n| 1 | T1 | done |\n')
  writeFileSync(join(tasksDir, 'notes.md'), '# Scratch\n\nNo task id here.\n')
  for (const spec of tasks) writeFileSync(join(tasksDir, `${spec.id}-t.md`), task(spec))
  if (adr) writeFileSync(join(dir, 'ADR-001-probe.md'), '# ADR-001: Probe\n')
  return { dir, tasksDir }
}

test('the next task is the first with nothing open in front of it', () => {
  const { tasksDir } = corpus([
    { id: 'T1', evidence: true },
    { id: 'T2', dependsOn: 'T1' },
    { id: 'T3', dependsOn: 'T2' },
  ])
  const result = next([tasksDir], root)
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /Next: T2 — /)
  assert.match(result.stdout, /acceptance: printf T2/)
  assert.match(result.stdout, /prove it:\s+adr-verify /)
  // T3 is behind T2, so it must not be offered as an alternative.
  assert.doesNotMatch(result.stdout, /also ready/)
})

test('two tasks with nothing in front of them are both offered', () => {
  const { tasksDir } = corpus([{ id: 'T1' }, { id: 'T2' }])
  const result = next([tasksDir], root)
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /Next: T1 — /)
  assert.match(result.stdout, /also ready: T2/)
})

test('a contract edge orders tasks that name no dependency at all', () => {
  // T2 consumes what T1 produces. Neither says Depends-on, and a hand-written
  // index would not know — which is why readiness is computed from the files.
  const { tasksDir } = corpus([
    { id: 'T1', produces: '`schema.sql`' },
    { id: 'T2', consumes: '`schema.sql`' },
  ])
  const blocked = next([tasksDir, '--all'], root)
  assert.equal(blocked.status, 0, blocked.stderr)
  assert.match(blocked.stdout, /^READY\s+T1/m)
  assert.match(blocked.stdout, /^blocked\s+T2\s+.*\(waiting on T1\)/m)

  // A Consumes token nothing produces is not an edge — T2 would be blocked on
  // nobody, and a task blocked on nobody never becomes ready.
  const { tasksDir: unrelated } = corpus([
    { id: 'T1', produces: '`schema.sql`' },
    { id: 'T2', consumes: '`other.sql`' },
  ])
  assert.match(next([unrelated, '--all'], root).stdout, /^READY\s+T2/m)
})

test('a task waiting on another record\'s incomplete task is blocked, and says which', () => {
  // The falsifying fixture the report asked for, and the order matters: assert
  // BLOCKED first. A test that only checks the ready case passes today, before
  // any change — which is how this gap survived.
  //
  // Two records, B's task depending on A's incomplete one. adr-next filtered
  // edges to the record's own tasks, so a foreign id was DROPPED in silence —
  // and an unseen edge reads as no edge, so the task printed READY. Confidently
  // wrong in the direction that causes work.
  const { tasksDir: b } = twoRecords('ADR-003-T1')
  const out = next([b, '--all'], root).stdout
  assert.doesNotMatch(out, /READY\s+T1/, `a foreign edge was dropped:\n${out}`)
  assert.match(out, /ADR-003-T1/, `and it must name what it is waiting on:\n${out}`)
})

test('a foreign record that cannot be read is not readiness', () => {
  // The half the record exists for. An edge this cannot evaluate must print
  // `cannot evaluate`, never `ready` and never silently complete — ADR-005's
  // and ADR-006's rule in a third tool.
  const { tasksDir } = twoRecords('ADR-404-T1')
  const out = next([tasksDir, '--all'], root).stdout
  assert.doesNotMatch(out, /READY\s+T1/, `an unevaluatable edge was called ready:\n${out}`)
  assert.match(out, /cannot evaluate/i, `say so plainly:\n${out}`)
  assert.match(out, /ADR-404-T1/, `and name the id:\n${out}`)
})

test('a human sign-off that reports a STOP is not counted as done', () => {
  // Reported 2026-08-28 from another corpus, one step from executing on it. A
  // task's only sign-off read "decision BLOCKED — neither ship nor withdraw",
  // its Stop Condition said "stop the ADR, not just this task" — and adr-next
  // printed it done and the next task READY.
  //
  // VLOG_HUMAN_RE was `date · human-observed · .+`, and is_done returned True on
  // the first match. Every OTHER route requires exit 0 AND a digest matching the
  // current fence. The human route required neither, so any text after the
  // marker read as success — including text saying the opposite.
  const { tasksDir } = corpus([
    { id: 'T1', human: true, evidence: true,
      signoff: '- 2026-08-26 · human-observed · decision BLOCKED — neither ship nor withdraw' },
    { id: 'T2', dependsOn: 'T1' },
  ])
  const out = next([tasksDir, '--all'], root).stdout
  assert.doesNotMatch(out, /^done\s+T1/m, `a stop was counted as done:\n${out}`)
  assert.match(out, /T1/, 'and it must still name the task')
  // The reason, not just the refusal — a bare "not done" sends the reader back
  // to the log to guess which of the two the tool could not read.
  assert.match(out, /outcome|blocked|could not/i, `say why:\n${out}`)
  // And the task that depended on it must not be offered.
  assert.doesNotMatch(out, /READY\s+T2/, `T2 was offered anyway:\n${out}`)
})

test('a human sign-off that reports a PASS is still done', () => {
  // The other direction, or the fix is just a refusal. `passed`, `confirmed`,
  // `observed` and `signed off` are the words a real sign-off uses.
  const { tasksDir } = corpus([
    { id: 'T1', human: true, evidence: true,
      signoff: '- 2026-08-26 · human-observed · PASS — Zy watched the migration run clean' },
  ])
  const out = next([tasksDir, '--all'], root).stdout
  assert.match(out, /^done\s+T1/m, `an affirmative sign-off is evidence:\n${out}`)
})

test('a human-observed task is told how to sign itself off', () => {
  const { tasksDir } = corpus([{ id: 'T1', human: true }])
  const result = next([tasksDir], root)
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /acceptance: human-observed/)
  assert.match(result.stdout, /adr-verify .*--human "<who observed what>"/)
  // And it must not offer the command form, which would fail for such a task.
  assert.doesNotMatch(result.stdout, /prove it:/)
})

test('a corpus with nothing left to do says so, and one that is stuck says why', () => {
  const { tasksDir: allDone } = corpus([
    { id: 'T1', evidence: true },
    { id: 'T2', human: true, evidence: true },
  ])
  const finished = next([allDone], root)
  assert.equal(finished.status, 3, 'nothing ready is exit 3, not a failure')
  assert.match(finished.stdout, /All 2 task\(s\) carry exit-0 evidence/)

  // Every remaining task blocked is a different state from every task done, and
  // a session needs to be told which — one means stop, the other means unblock.
  const { tasksDir: stuck } = corpus([
    { id: 'T1', dependsOn: 'T2' },
    { id: 'T2', dependsOn: 'T1' },
  ])
  const cycle = next([stuck], root)
  assert.equal(cycle.status, 3)
  assert.match(cycle.stderr, /Nothing is ready: every remaining task is blocked/)
  assert.match(cycle.stderr, /T1 waits on T2/)
})

test('--all reports every task and its state, including the done ones', () => {
  const { tasksDir } = corpus([
    { id: 'T1', evidence: true },
    { id: 'T2', dependsOn: 'T1' },
    { id: 'T3', dependsOn: 'T2' },
  ])
  const result = next([tasksDir, '--all'], root)
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /^done\s+T1/m)
  assert.match(result.stdout, /^READY\s+T2/m)
  assert.match(result.stdout, /^blocked\s+T3\s+.*\(waiting on T2\)/m)

  // With nothing ready, --all still renders and still exits 3.
  const { tasksDir: allDone } = corpus([{ id: 'T1', evidence: true }])
  const finished = next([allDone, '--all'], root)
  assert.equal(finished.status, 3)
  assert.match(finished.stdout, /^done\s+T1/m)
})

test('--json carries the same three buckets and the same exit codes', () => {
  const { tasksDir } = corpus([
    { id: 'T1', evidence: true },
    { id: 'T2', dependsOn: 'T1' },
    { id: 'T3', dependsOn: 'T2' },
  ])
  const result = next([tasksDir, '--json'], root)
  assert.equal(result.status, 0, result.stderr)
  const report = JSON.parse(result.stdout)
  assert.deepEqual(report.done.map(t => t.id), ['T1'])
  assert.deepEqual(report.ready.map(t => t.id), ['T2'])
  assert.deepEqual(report.blocked.map(t => t.id), ['T3'])
  assert.deepEqual(report.blocked[0].blocked_by, ['T2'])
  assert.equal(report.tasks_dir, tasksDir)

  const { tasksDir: allDone } = corpus([{ id: 'T1', evidence: true }])
  const finished = next([allDone, '--json'], root)
  assert.equal(finished.status, 3, 'the machine-readable mode agrees with the human one')
  assert.deepEqual(JSON.parse(finished.stdout).ready, [])
})

test('failing or mismatched evidence does not make a task done', () => {
  const { tasksDir } = corpus([{ id: 'T1', evidence: true }])
  // Baseline: the entry above IS accepted.
  assert.match(next([tasksDir, '--all'], root).stdout, /^done\s+T1/m)

  // The same entry against a changed fence. adr-next recomputes the digest from
  // the fence in front of it, so evidence for a command that no longer exists
  // cannot carry the task.
  const { dir, tasksDir: stale } = corpus([{ id: 'T1', evidence: true }])
  const path = join(stale, 'T1-t.md')
  writeFileSync(path, task({ id: 'T1', evidence: true })
    .replace('printf T1\n```', 'printf T1-changed\n```'))
  assert.match(next([stale, '--all'], dir).stdout, /^READY\s+T1/m)
})

test('the ADR is enough: adr-next finds the tasks directory beside it', () => {
  const { dir, tasksDir } = corpus([{ id: 'T1' }], { adr: true })
  const viaAdr = next([join(dir, 'ADR-001-probe.md')], root)
  assert.equal(viaAdr.status, 0, viaAdr.stderr)
  assert.match(viaAdr.stdout, /Next: T1/)
  assert.equal(JSON.parse(next([tasksDir, '--json'], root).stdout).ready.length, 1)
})

test('every way of asking the wrong question is refused, not guessed at', () => {
  const { dir } = corpus([{ id: 'T1' }])

  // No target at all, and more than one: both are usage errors, and a usage
  // error must not look like "nothing to do".
  assert.equal(next([], root).status, 1)
  assert.match(next([], root).stderr, /Usage/i)
  assert.equal(next(['a', 'b'], root).status, 1)

  // A path that names neither a tasks directory nor an ADR beside one.
  const missing = next([join(dir, 'nowhere.md')], root)
  assert.equal(missing.status, 1)
  assert.match(missing.stderr, /no tasks directory/)

  // A directory with no task files in it — README.md and a note with no task id
  // are both present and neither counts.
  const empty = mkdtempSync(join(os.tmpdir(), 'quality-harness-next-empty-'))
  temps.push(empty)
  writeFileSync(join(empty, 'README.md'), '# Tasks\n')
  writeFileSync(join(empty, 'notes.md'), '# No task id\n')
  const none = next([empty], root)
  assert.equal(none.status, 1)
  assert.match(none.stderr, /no task files/)
})
