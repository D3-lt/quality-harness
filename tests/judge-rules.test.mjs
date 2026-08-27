// adr-judge judges PROSE, which makes it the most false-positive-prone thing in
// this harness. The research is unambiguous about what that costs: 35–91% of
// static-analysis warnings are unactionable, suppressions grow monotonically,
// and the most-asked question about such tools is how to silence them. A prose
// heuristic that fires on a good record is the exact failure this project spent
// a week removing.
//
// So every rule is driven from a table with BOTH directions, and the assertion
// is on the exact SET of rule ids that fired — a case expecting E1 fails if C3
// fires alongside it. That is what makes a false positive visible instead of
// merely tolerated.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import { delimiter, dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const testDir = dirname(fileURLToPath(import.meta.url))
const root = resolve(testDir, '..')
const bin = join(root, 'bin')
const env = { ...process.env, PATH: `${bin}${delimiter}${process.env.PATH ?? ''}` }
const GATE_NAMES = new Set(readdirSync(bin).filter(name => !name.includes('.')))

const temps = []
test.after(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true })
})

// Sections that pass every rule, so a case can vary exactly one of them.
const CLEAN = {
  context: 'The nightly export took 42 min on 2026-08-19, up from 9 min in March;\n'
    + '`src/export/run.py` holds one transaction for the whole window.',
  decision: 'We will move the export to a worker queue and adopt one job per account.',
  alternatives: '- Raise the timeout — rejected because the transaction is the problem.\n'
    + '- Shard by date — discarded since one account dominates the 42 min.',
  consequences: 'Each account retries alone. The cost is a queue to operate and a new\n'
    + 'failure mode when a worker dies mid-job.',
}

function judge(sections) {
  const { context, decision, alternatives, consequences } = { ...CLEAN, ...sections }
  const dir = mkdtempSync(join(os.tmpdir(), 'qh-judge-'))
  temps.push(dir)
  const path = join(dir, 'ADR-050.md')
  writeFileSync(path, [
    '# ADR-050: Move the nightly export to a queue', '',
    '**Status:** Accepted', '**Date:** 2026-08-26', '',
    '## Context', '', context, '',
    '## Decision', '', decision, '',
    '## Alternatives Considered', '', alternatives, '',
    '## Consequences', '', consequences, '',
  ].join('\n'))
  const [file, argv] = process.platform === 'win32' && GATE_NAMES.has('adr-judge')
    ? ['python3', [join(bin, 'adr-judge'), path]]
    : ['adr-judge', [path]]
  const result = spawnSync(file, argv, { env, encoding: 'utf8', timeout: 60_000 })
  assert.equal(result.status, 0, `adr-judge must never block\n${result.stderr}`)
  return {
    fired: [...result.stdout.matchAll(/^\s+(?:evidence|clarity) ([EC]\d): /gm)]
      .map(match => match[1]).sort(),
    stdout: result.stdout,
  }
}

function table(name, rows) {
  test(name, () => {
    for (const [expected, label, sections] of rows) {
      const { fired, stdout } = judge(sections)
      assert.deepEqual(fired, [...expected].sort(),
        `${label}\nexpected ${JSON.stringify([...expected].sort())}, got ${JSON.stringify(fired)}\n${stdout}`)
    }
  })
}

// --- E1: does Context cite anything a reader could go and check? ------------

table('E1 accepts every ordinary way a Context cites something checkable', [
  [[], 'a measurement with a unit', { context: 'The export ran 42 min last week.' }],
  [[], 'a percentage', { context: 'Roughly 35% of requests timed out during the window.' }],
  [[], 'a date', { context: 'The queue backed up on 2026-08-19 and stayed backed up.' }],
  [[], 'a path in a code span', { context: 'The lock is taken in `src/export/run.py` for the run.' }],
  [[], 'a source URL', { context: 'The behaviour is documented at https://example.com/limits.' }],
  [[], 'a command name in a span', { context: 'Running `adr-lint` on the corpus is what surfaced it.' }],
  [[], 'the word measured', { context: 'We measured the export against production data.' }],
  [[], 'an incident', { context: 'The incident on the export path was traced to the transaction.' }],
  // Every one of these is how real records cite evidence, and none of them is a
  // measurement. A rule that only recognises numbers-with-units calls all of
  // them opinion.
  [[], 'an issue reference', { context: 'Raised as JIRA-4821 after the third failed run.' }],
  [[], 'a hash-style issue reference', { context: 'Reported in #1284 by the on-call engineer.' }],
  [[], 'a version', { context: 'Postgres 14.2 will not release the advisory lock early.' }],
  [[], 'a standard', { context: 'RFC 7231 requires the header be treated as a hint.' }],
  [[], 'a commit', { context: 'Introduced in 3e74a6f, which moved the transaction outward.' }],
  [[], 'a quoted error', { context: 'Every run ends with `could not obtain lock on relation`.' }],
  [[], 'a named log or artifact', { context: 'The worker log shows the same stack each night.' }],
])

table('E1 fires when the Context is preference rather than observation', [
  [['E1'], 'pure feeling', { context: 'The current approach feels slow and the team dislikes it.' }],
  [['E1'], 'appeal to consensus', { context: 'It is generally accepted that queues are the right answer.' }],
  [['E1'], 'assertion with no anchor', { context: 'Our export is unreliable and hard to reason about.' }],
])

// --- E2: does each alternative say why it lost? -----------------------------

table('E2 accepts a rejection however tersely it is written', [
  [[], 'explicit because', { alternatives: '- Celery — rejected because it needs a broker we do not run.' }],
  [[], 'a bare trade-off', { alternatives: '- Kafka — operationally heavy for a single queue.' }],
  [[], 'too X', { alternatives: '- Redis Streams — too coupled to the cache we already share.' }],
  [[], 'would require', { alternatives: '- A cron fan-out — would require a scheduler we do not have.' }],
  [[], 'does not', { alternatives: '- Threads — does not survive a process restart.' }],
  // Not every corpus writes alternatives as bullets. A section of prose that
  // states its rejections is a considered alternative; treating "no bullets" as
  // "nothing to check" is a vacuous pass, which is worse than a false alarm.
  [[], 'prose that states the rejection', {
    alternatives: 'Celery was considered and rejected because it needs a broker we do not run.',
  }],
])

table('E2 fires on an alternative that is only a name', [
  [['E2'], 'a bare name', { alternatives: '- Kafka.\n- Celery — rejected because of the broker.' }],
  [['E2', 'E2'], 'two bare names', { alternatives: '- Kafka.\n- Celery.' }],
  [['E2'], 'prose naming an alternative with no reason', {
    alternatives: 'We also looked at Kafka and at a cron fan-out.',
  }],
])

// --- E3: is a comparative claim backed? -------------------------------------

table('E3 accepts a comparative claim that carries evidence', [
  [[], 'a number beside the claim', {
    decision: 'We will adopt the queue because it is faster: 42 min becomes 90 s per account.',
  }],
  [[], 'a named source beside the claim', {
    decision: 'We will adopt the queue because it is cheaper, as the incident review recorded.',
  }],
  [[], 'a measured claim', { context: 'We measured the queue to be faster on production data.' }],
])

table('E3 fires on a comparative claim with nothing behind it', [
  [['E3'], 'faster, asserted', { decision: 'We will use a queue because it is faster.' }],
  // A date somewhere in the record is not evidence that a queue is cheaper. Any
  // digit counting as substantiation made this rule almost impossible to fire.
  [['E3'], 'a date is not a measurement', {
    context: 'On 2026-08-19 we chose to look at this.',
    decision: 'We will use a queue because it is cheaper to operate.',
  }],
])

// --- C1 / C2 / C3: will a reader know what was decided? ---------------------

table('C1 accepts a Decision that commits, hedge or no hedge', [
  [[], 'plain commitment', { decision: 'We will move the export to a worker queue.' }],
  [[], 'imperative', { decision: 'Adopt one job per account for the nightly export.' }],
  [[], 'a hedge about the FUTURE beside a commitment', {
    decision: 'We will adopt one job per account. We might shard further later.',
  }],
])

table('C1 fires on a Decision that never commits', [
  [['C1'], 'all hedge', { decision: 'We might move the export to a queue, and could possibly shard it.' }],
  [['C1'], 'should probably', { decision: 'We should probably stop holding one transaction.' }],
])

table('C2 fires on an authoring marker, and only on a real one', [
  [['C2'], 'TODO', { consequences: `${CLEAN.consequences}\n\nTODO: measure the new path.` }],
  [['C2'], 'TBD', { decision: 'We will adopt the queue. Worker count: TBD.' }],
  [['C2'], 'FIXME', { context: `${CLEAN.context}\n\nFIXME: confirm the March figure.` }],
  // `ADR-XXX` is a placeholder for a NUMBER, and a hyphen is a word boundary —
  // which made the gate fire on the template it ships.
  [[], 'a superseded-by placeholder', { decision: `${CLEAN.decision} Supersedes ADR-XXX.` }],
  // A marker QUOTED in a fence is someone else's code, not this record's
  // unfinished business.
  [[], 'a marker inside a code fence', {
    consequences: `${CLEAN.consequences}\n\n\`\`\`python\n# TODO: upstream's own note\n\`\`\``,
  }],
])

table('C3 accepts Consequences that state a cost, however it is worded', [
  [[], 'the word cost', { consequences: 'Retries are per account. The cost is a queue to operate.' }],
  [[], 'a new failure mode', { consequences: 'Retries are per account, but a worker can now fail mid-job.' }],
  [[], 'more complexity', { consequences: 'Retries are per account; the deployment gets more complex.' }],
  [[], 'operational burden', { consequences: 'Retries are per account, at the price of one more service to run.' }],
  [[], 'something is lost', { consequences: 'Retries are per account. We lose the single-transaction guarantee.' }],
  [[], 'requires', { consequences: 'Retries are per account. This requires a broker on every environment.' }],
  [[], 'harder', { consequences: 'Retries are per account. Debugging a failed night gets harder.' }],
  [[], 'breaks', { consequences: 'Retries are per account. It breaks the current one-shot restore.' }],
  // The two commonest shapes in the wild. This project's own template labels
  // consequences Positive/Negative/Neutral and MADR writes "Good, because…" /
  // "Bad, because…"; reading either as "no cost stated" fires on most records
  // anyone has actually written.
  [[], 'a labelled Negative bullet', {
    consequences: '- **Positive:** retries are per account.\n'
      + '- **Negative:** the fixture must be updated when grammars change.',
  }],
  [[], 'MADR bad-because', {
    consequences: '* Good, because retries are per account.\n'
      + '* Bad, because a worker can die mid-job.',
  }],
])

table('C3 fires when every consequence is upside', [
  [['C3'], 'all good news', { consequences: 'Each account exports on its own and the run finishes sooner.' }],
  [['C3'], 'praise only', { consequences: 'The pipeline becomes simpler and easier for everyone.' }],
])

test('a record that passes every rule stays silent, and the gate never blocks', () => {
  const { fired, stdout } = judge({})
  assert.deepEqual(fired, [])
  assert.match(stdout, /evidence and clarity rules all pass/)
})
