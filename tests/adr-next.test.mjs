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
const repoRoot = resolve(testDir, '..')
const root = join(repoRoot, 'plugin')
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

test('a pre-digest exit-0 row proves a single-line fence, and only that', () => {
  // docs/BACKLOG.md §58, reported by three independent corpora on 2026-08-29.
  // `adr-lint` accepts a legacy no-digest row under a narrow allowance its own
  // help documents, and `work-next` honours the same shape; this reader took
  // digest rows only. So a corpus whose evidence predates digests read as fully
  // executed to two tools and as ENTIRELY UNSTARTED to this one — every task
  // ready or blocked behind the first, forever. One corpus measured 40/40
  // correlation with the digest cutover and ruled out the honest alternative (an
  // Acceptance edited after its evidence) by reading git log.
  const legacy = (fence, command = fence) =>
    `# Task T1: probe\n\n**Depends-on:** none\n**Covers:** none\n**Produces:** none\n`
    + `**Consumes:** none\n\n## Acceptance\n\n\`\`\`bash\n${fence}\n\`\`\`\n\n`
    + `## Verification Log\n\n- 2026-08-20 · 691a106f* · exit 0 · \`${command}\`\n`
  const withTask = body => {
    const dir = mkdtempSync(join(os.tmpdir(), 'quality-harness-legacy-'))
    temps.push(dir)
    const tasksDir = join(dir, 'tasks')
    mkdirSync(tasksDir)
    writeFileSync(join(tasksDir, 'T1-t.md'), body)
    return next(['--json', tasksDir], root)
  }
  const doneOf = result => JSON.parse(result.stdout).done.some(t => t.id === 'T1')

  assert.equal(doneOf(withTask(legacy('bun run test'))), true,
    'a legacy exit-0 row whose displayed command matches the single-line fence is evidence')

  // The three conditions that keep the allowance narrow, each asserted to still
  // REFUSE — without these, "accept any exit-0 row" would satisfy the case above
  // and the digest would stop meaning anything (CLAUDE.md §4).
  assert.equal(doneOf(withTask(legacy('bun run test', 'bun run other'))), false,
    'a command that is not the fence proves nothing')
  assert.equal(doneOf(withTask(legacy('bun run test', 'bun run test …'))), false,
    'the truncated display form cannot prove the fence it elided')
  const multi = '# Task T1: probe\n\n**Depends-on:** none\n\n## Acceptance\n\n'
    + '```bash\nset -o pipefail\nbun run test\n```\n\n## Verification Log\n\n'
    + '- 2026-08-20 · 691a106f* · exit 0 · `set -o pipefail`\n'
  assert.equal(doneOf(withTask(multi)), false,
    'a legacy row records one displayed line, so it cannot prove a multi-line fence')
})

test('a date-named record never borrows another record\'s tasks', () => {
  // docs/BACKLOG.md §66, reported 2026-08-29 against the sibling matching added
  // the same day. `2026-07-12-router.md` and `2026-06-01-db-doctor.md` both
  // report ADR number 2026 — the YEAR of the ISO date — so a record owning no
  // tasks directory matched a FOREIGN record's directory and answered with its
  // tasks, exit 0, plus that record's adr-verify command. A wrong answer given
  // confidently, which is worse than the missing warning fixed beside it: the
  // status guard could not catch it either, because it correctly checked the
  // status of the record whose task it found.
  //
  // `lifecycle.mjs::adrNumber` already carried this lookahead, measured
  // 2026-08-26 for the same reason. The rule existed; a second spelling of it
  // did not have it.
  const dir = mkdtempSync(join(os.tmpdir(), 'quality-harness-dated-'))
  temps.push(dir)
  const owned = join(dir, '2026-06-01-db-doctor', 'tasks')
  mkdirSync(owned, { recursive: true })
  writeFileSync(join(owned, 'T1-t.md'), task({ id: 'T1', goal: 'db-doctor peers' }))
  writeFileSync(join(dir, '2026-06-01-db-doctor.md'),
    '# 2026-06-01: db-doctor\n\n**Status:** Accepted\n\n## Context\n\nc\n')
  writeFileSync(join(dir, '2026-07-12-router.md'),
    '# 2026-07-12: router\n\n**Status:** Superseded by x\n\n## Context\n\nc\n')

  const foreign = next([join(dir, '2026-07-12-router.md')], root)
  // ORDINARY STATE, exit 0. Raised 2026-08-29 by the session that swept its whole
  // corpus: 25 of its 28 records own no tasks directory, and a gate that advises
  // and never blocks must not report the commonest correct state as a failure —
  // especially while an UNDECIDED record, which deserves attention more, exits 0.
  assert.equal(foreign.status, 0, 'a record owning no tasks is answered, not refused')
  assert.match(foreign.stdout, /owns no tasks directory/, foreign.stdout)
  assert.doesNotMatch(foreign.stdout, /db-doctor/,
    `it must not answer with another record's tasks:\n${foreign.stdout}`)

  // The must-fail direction: a path that does not exist is "I could not answer",
  // which is a different thing from "the answer is none" and still exits 1.
  const missing = next([join(dir, 'no-such-record.md')], root)
  assert.equal(missing.status, 1, 'a path that is not there is a usage error')
  assert.match(missing.stderr, /no such file or directory/, missing.stderr)

  // The must-fail direction: the record that DOES own that directory still
  // resolves it, so this is a date guard and not a broken sibling lookup.
  const owns = next([join(dir, '2026-06-01-db-doctor.md')], root)
  assert.equal(owns.status, 0, owns.stderr)
  assert.match(owns.stdout, /Next: T1 — /, owns.stdout)
})

test('an undecided record is named as undecided, and its tasks are still answered', () => {
  // docs/BACKLOG.md §64. `work-next` joins task to record and refuses to call an
  // unaccepted record's tasks ready (§48); this tool never looked, so one corpus
  // answered two ways depending on which entry point you used. And this is the
  // more exposed one — the router prints a session banner, while `adr-next
  // <record>` is what somebody types once they already have a record in hand and
  // have stopped asking whether it is decided. Reported 2026-08-29 from a corpus
  // where it offered a Proposed record's tasks and handed over an adr-verify
  // command to run against them.
  //
  // It SAYS SO and still answers: this gate instructs, never blocks (CLAUDE.md
  // §3), so the status is reported and the reader decides.
  // A realistic layout: `ADR-030-slug.md` beside `ADR-030-slug/tasks/`, which is
  // how a record owns its tasks on disk.
  const dir = mkdtempSync(join(os.tmpdir(), 'quality-harness-status-'))
  temps.push(dir)
  const tasksDir = join(dir, 'ADR-030-slug', 'tasks')
  mkdirSync(tasksDir, { recursive: true })
  writeFileSync(join(tasksDir, 'T1-t.md'), task({ id: 'T1' }))
  const record = join(dir, 'ADR-030-slug.md')
  writeFileSync(record, '# ADR-030: not decided\n\n**Status:** Proposed\n\n## Context\n\nc\n')
  const proposed = next([tasksDir], root)
  assert.equal(proposed.status, 0, 'it advises; it never refuses')
  assert.match(proposed.stderr, /not Accepted/, proposed.stderr)
  assert.match(proposed.stderr, /Proposed/, proposed.stderr)
  assert.match(proposed.stdout, /Next: T1 — /, 'the answer is still given')

  // The must-fail direction (CLAUDE.md §4): an Accepted record must produce NO
  // such line, or the check is a banner that always prints and says nothing.
  writeFileSync(record, '# ADR-030: decided\n\n**Status:** Accepted\n\n## Context\n\nc\n')
  const accepted = next([tasksDir], root)
  assert.equal(accepted.status, 0, accepted.stderr)
  assert.doesNotMatch(accepted.stderr, /not Accepted/, accepted.stderr)
  assert.match(accepted.stdout, /Next: T1 — /)
})

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

test('a qualified id in Consumes leaves the record rather than binding locally', () => {
  // BACKLOG §41, reproduced 2026-08-29. `Depends-on` took a qualified id out
  // WHOLE; `Consumes` did not, and TID_RE finds `T4` inside `ADR-003-T4`. So a
  // task consuming a FOREIGN record's output printed `waiting on T4` — a local
  // sibling it has nothing to do with. A wrong edge is worse than a missing one,
  // because the DAG then looks answered rather than incomplete.
  const { tasksDir } = corpus([
    { id: 'T4', consumes: 'none' },
    { id: 'T9', consumes: 'ADR-003-T4' },
  ])
  const out = next([tasksDir, '--all'], root).stdout
  assert.doesNotMatch(out, /waiting on T4\b/,
    `a foreign id must not bind to the same-numbered local task:\n${out}`)
  assert.match(out, /ADR-003-T4/, `and the foreign id must be named:\n${out}`)
  assert.match(out, /cannot evaluate/i, `an edge this cannot resolve is unevaluated:\n${out}`)

  // THE CLEAN ANSWER, in the same test. A check that only ever refuses to bind
  // is indistinguishable from one that has stopped reading Consumes at all —
  // a LOCAL T-id must still produce its edge (CLAUDE.md §4).
  const { tasksDir: local } = corpus([
    { id: 'T4', consumes: 'none' },
    { id: 'T9', consumes: 'T4' },
  ])
  const localOut = next([local, '--all'], root).stdout
  assert.match(localOut, /^blocked\s+T9\s+.*\(waiting on T4\)/m,
    `a local Consumes id still binds:\n${localOut}`)
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

test('a malformed foreign pointer is unevaluated, not ignored', () => {
  // The OTHER unknown path: the pointer does not parse at all. Its mutation was
  // GREEN until this case existed, because the test above reaches the
  // no-such-record return and never the guard. Two returns, one word, one test.
  const { tasksDir } = corpus([{ id: 'T1', dependsOn: 'ADR-not-a-number-T1' }])
  const out = next([tasksDir, '--all'], root).stdout
  // It parses as neither qualified nor a local T-id, so it must not silently
  // vanish into a ready verdict.
  assert.doesNotMatch(out, /^READY\s+T1/m, `a pointer nobody can read was ignored:\n${out}`)
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

// Found 2026-09-04 on this repository's own ADR-012 T4, which the tasks README
// calls done and which adr-next printed READY. The sign-off is affirmative — the
// tool ran, the gate answered, the finding was reported — and one of the things
// it honestly reports is that no server-level instruction BLOCK was visible to
// the model. `block` is in NEGATIVE, so a noun describing a chunk of text was
// read as the verdict "blocked", and a five-task record reported its last task
// unfinished forever.
//
// The guard itself stays: an affirmative outcome must be stated, and a negative
// word beats an affirmative one. What changes is that the ambiguous entries are
// matched as VERBS. A sign-off worth reading describes what was observed, and
// honest observation prose contains nouns.
test('a negative word used as a noun is not read as a verdict', () => {
  const { tasksDir } = corpus([
    { id: 'T1', human: true, evidence: true,
      signoff: '- 2026-08-30 · human-observed · Zy confirmed the tool answered correctly; '
        + 'the client rendered no server-level instruction block, and the transport was fine' },
  ])
  const out = next([tasksDir, '--all'], root).stdout
  assert.match(out, /^done\s+T1/m,
    `a noun was read as a stop:\n${out}`)
})

// The other direction, in the same file, or the change above is indistinguishable
// from deleting `block` from NEGATIVE altogether.
//
// CLAUDE.md §5: the fix is one member of a class, so the class is enumerated
// here rather than sampled. Sweeping every negative word through its verb forms
// (2026-09-04) found a SECOND hole nobody had reported and this task did not
// introduce: `refus(?:ed)?` never matched the bare word `refuse` at all, because
// the stem stops at `refus` and the trailing lookahead rejects the `e`. Closed
// in the same line. `block` on its own is the one deliberate absence — it is the
// noun that started this — and asserting that absence is what keeps the fix from
// being read later as an oversight.
test('the verb forms of a negative word are still read as a stop', () => {
  const stops = [
    'decision BLOCKED — neither ship nor withdraw',
    'confirmed, but the rollout blocks on legal',
    'observed and passing; blocking on a second reviewer',
  ]
  for (const verb of ['stopped', 'stops', 'stopping', 'failed', 'fails', 'failing',
    'refuse', 'refused', 'refuses', 'refusing', 'withdrawn', 'withdraws', 'withdrawing',
    'rejected', 'rejects', 'rejecting', 'aborted', 'aborts', 'aborting']) {
    stops.push(`confirmed and observed, but the release ${verb} on review`)
  }
  for (const note of stops) {
    const signoff = `- 2026-08-26 · human-observed · ${note}`
    const { tasksDir } = corpus([{ id: 'T1', human: true, evidence: true, signoff }])
    const out = next([tasksDir, '--all'], root).stdout
    assert.doesNotMatch(out, /^done\s+T1/m, `a stop was counted as done:\n${note}\n${out}`)
  }

  // The deliberate absence, asserted so it reads as a decision rather than a gap:
  // the bare noun is NOT a stop, which is the whole point of the change.
  const { tasksDir } = corpus([{ id: 'T1', human: true, evidence: true,
    signoff: '- 2026-08-26 · human-observed · confirmed; the client rendered no instruction block' }])
  assert.match(next([tasksDir, '--all'], root).stdout, /^done\s+T1/m,
    'the bare noun must stay outside NEGATIVE, or this fix has been reverted')
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

  // A path that is not there at all: "I could not answer", which is a usage
  // error and stays exit 1. A record that EXISTS and owns no tasks is a
  // different thing and answers exit 0 — asserted in the date-named test above.
  const missing = next([join(dir, 'nowhere.md')], root)
  assert.equal(missing.status, 1)
  assert.match(missing.stderr, /no such file or directory/)

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

// Reported 2026-09-02 from the agentsmemory corpus, into this project's inbox:
// "work-next routes to tasks whose own file forbids starting them". Reproduced
// hermetically 2026-09-04 on 2.62.0, and the report is HALF right — which is why
// it was worth measuring rather than acting on.
//
// The half that does NOT reproduce: a dependent of a blocked task is correctly
// held. T4 depending on a not-done T3 prints `blocked … (waiting on T3)`, because
// readiness already excludes any dependency that is not done.
//
// The half that DOES: the blocked task ITSELF is printed READY. A sign-off saying
// "decision BLOCKED — neither ship nor withdraw" denies `done` and then falls
// through to `ready`, because the only three states are done / ready /
// dependency-blocked and a human stop is none of them. So the router offers work
// the record forbids starting — the reporter's own framing, and their suggested
// fix was the wording rather than the computation.
//
// `is_done`'s comment claimed "`human_verdict` below carries the reason so the
// report says which it was". No such name existed anywhere in the file: the
// comment described a mechanism nobody had written.
test('a task whose sign-off says stop is not offered as ready', () => {
  const { tasksDir } = corpus([
    { id: 'T1', human: true, evidence: true,
      signoff: '- 2026-08-26 · human-observed · decision BLOCKED — neither ship nor withdraw' },
    { id: 'T2', dependsOn: 'T1' },
  ])
  const out = next([tasksDir, '--all'], root).stdout
  assert.doesNotMatch(out, /^READY\s+T1/m, `a stopped task was offered as ready:\n${out}`)
  assert.match(out, /^stopped\s+T1/m, `it must say WHICH kind of not-ready:\n${out}`)
  // The reason, not just the label — "stopped" without the sign-off sends the
  // reader back to the log to guess which of the two the tool could not read.
  assert.match(out, /sign-off/i, `name what stopped it:\n${out}`)
  // The dependent stays held, and for its own reason rather than by accident.
  assert.match(out, /^blocked\s+T2.*T1/m, `the dependent must still be held:\n${out}`)

  // Nothing is startable, so the exit code must say so rather than 0.
  assert.equal(next([tasksDir, '--all'], root).status, 3, 'nothing ready must exit 3')
})

// The other direction: an ordinary not-done task with no dependencies is still
// READY, or the change above is indistinguishable from never offering anything.
test('a task with no sign-off and no open dependency is still ready', () => {
  const { tasksDir } = corpus([{ id: 'T1' }])
  const out = next([tasksDir, '--all'], root).stdout
  assert.match(out, /^READY\s+T1/m, `an ordinary task must still be offered:\n${out}`)
})

// --- issue #10: a corpus root is a question this tool used to misread -------
//
// Reported 2026-09-04 against 2.60.0 on a corpus of 37 records: `adr-next
// docs/adr --all` printed `no task files` — the SAME sentence an empty tasks/
// directory gets — over a corpus with six ready tasks. `resolve_tasks_dir` falls
// back to returning the directory itself when it holds no `tasks/`, so a corpus
// root arrived at the single-record path and its emptiness was reported as the
// answer rather than as a scope mismatch.
//
// The reporter also measured exit 0, which would make it indistinguishable from
// a clean corpus. That half did NOT reproduce here or at their own v2.60.0 —
// the branch is `return 1` — and their run went through a Windows Git Bash
// forwarder this suite cannot drive. Recorded as unreproduced rather than
// refuted; the message defect below is reproducible everywhere and is enough.

test('a corpus root reports every record it holds, instead of reading as empty', () => {
  const { dir } = twoRecords('none')
  const out = next([dir, '--all'], dir)
  assert.doesNotMatch(out.stderr, /no task files/,
    `a corpus root is not an empty tasks directory:\n${out.stderr}`)
  assert.match(out.stdout, /ADR-003/, `ADR-003's tasks must be reported:\n${out.stdout}`)
  assert.match(out.stdout, /ADR-007/, `ADR-007's tasks must be reported:\n${out.stdout}`)
  assert.equal(out.status, 0, `ready work in the corpus means exit 0:\n${out.stdout}${out.stderr}`)
})

test('a corpus root whose records have nothing ready exits 3, not 0', () => {
  // The falsifiability half, and the one a fixture of single records can never
  // reach. Without it the test above passes against a corpus mode that returns 0
  // unconditionally — which is precisely the silent success the issue is about.
  const { dir } = twoRecords('ADR-003-T1')
  // ADR-007's T1 waits on ADR-003's T1, which is not done. ADR-003's own T1 is
  // ready, so first prove the corpus really can say 0 here...
  assert.equal(next([dir, '--all'], dir).status, 0)
  // ...then stop the only ready task with a human sign-off and require 3.
  writeFileSync(join(dir, 'ADR-003-target', 'tasks', 'T1-t.md'),
    task({ id: 'T1', human: true, evidence: true,
           signoff: '- 2026-08-26 · human-observed · STOPPED — Zy said do not proceed' }))
  const out = next([dir, '--all'], dir)
  assert.equal(out.status, 3,
    `no ready task anywhere in the corpus is exit 3:\n${out.stdout}${out.stderr}`)
})

test('a directory holding neither records nor tasks is refused, not called clean', () => {
  // ADR-005. "I could not find anything to look at" and "I looked and nothing is
  // ready" are different facts, and only the second is a corpus in good order.
  const dir = mkdtempSync(join(os.tmpdir(), 'quality-harness-bare-'))
  temps.push(dir)
  const out = next([dir, '--all'], dir)
  assert.equal(out.status, 1,
    `an empty directory is not a clean corpus:\n${out.stdout}${out.stderr}`)
  assert.match(`${out.stdout}${out.stderr}`, /no task files|no records/,
    'it must say what it failed to find')
})

test('--json over a corpus root keys its answer by record', () => {
  const { dir } = twoRecords('none')
  const out = next([dir, '--all', '--json'], dir)
  assert.equal(out.status, 0, out.stderr)
  const parsed = JSON.parse(out.stdout)
  assert.ok(parsed.records, `a corpus answer carries records:\n${out.stdout}`)
  const names = Object.keys(parsed.records)
  assert.ok(names.some(n => n.includes('ADR-003')), `ADR-003 present: ${names}`)
  assert.ok(names.some(n => n.includes('ADR-007')), `ADR-007 present: ${names}`)
})
