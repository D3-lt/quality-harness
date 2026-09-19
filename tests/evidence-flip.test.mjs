// The evidence-flip guard (docs/audits/2026-09-18-adr-060.md, B2-B4).
//
// A value that carries a could-not-look qualifier — `log.complete`, a
// `check.source-unreadable` event, `observation.ok` — is only as good as the
// readers that consult it. The audit of 2026-09-18 found three readers of one
// log: one honoured `complete`, two did not, and the two that did not were the
// ones that PERSIST a verdict and RENDER one. Every test that reached them built
// its log as a plain array literal, so `complete` was `undefined` and never
// `false` — the degraded case was structurally unreachable, and a test-lock
// cannot notice a case nobody wrote.
//
// So this does not test a reader. It tests the PROPERTY, over every reader:
//
//   1. drive the surface with evidence intact, and require a POSITIVE answer —
//      the control, without which the second half passes on a broken fixture;
//   2. degrade the evidence and nothing else, and require the answer to stop
//      being positive.
//
// A surface whose two answers are identical has ignored the qualifier. That is
// the whole defect class, and it is asserted here as one loop rather than
// rediscovered one reader at a time.
//
// ⚠ AND THE LIST OF READERS IS ANCHORED TO THE CODE, NOT TO THIS FILE. A guard
// over a hand-kept list is silent about everything added after it. The last test
// enumerates every `readEvents(` call site in the shipped scripts and fails on a
// function that is neither driven here nor explained here.
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { latestCheckFor, observedFacts, sessionStateNote } from '../plugin/scripts/lifecycle.mjs'
import { reading, render } from '../plugin/scripts/statusline.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const NOW = Date.parse('2026-09-19T12:00:10.000Z')
const observation = tree => ({ ok: true, tree, index: `index-${tree}`, head: 'HEAD0' })
const started = { at: '2026-09-19T11:59:00.000Z', event: 'session.started', observation: observation('T0') }
const ended = tree => ({ at: '2026-09-19T12:00:00.000Z', event: 'turn.ended', observation: observation(tree) })
const pass = { at: '2026-09-19T11:59:50.000Z', event: 'check.passed', record: 'r1', seq: 1,
  startedAt: '2026-09-19T11:59:45.000Z', before: observation('T1'), after: observation('T1'), exit: 0, command: 'sh check.sh' }

// Two intact logs, because there are two positive things a log can be made to
// say: "a check passed on this tree", and "nothing happened here at all".
const LOGS = {
  'a check passed': { entries: [started, pass, ended('T1')], tree: 'T1' },
  'nothing happened': { entries: [started, ended('T0')], tree: 'T0' },
}

// What `readEvents` really returns: an array carrying `complete`.
const asRead = (entries, whole = true) => Object.assign([...entries], { complete: whole })

// Each degradation is one way evidence is known to go missing. Both are set by
// production code only when a read really happened and really lost something.
const DEGRADED = {
  'a torn session log (complete === false)': entries => asRead(entries, false),
  'a torn checks.jsonl (check.source-unreadable)': entries =>
    asRead([...entries, { at: '2026-09-19T11:59:55.000Z', event: 'check.source-unreadable' }]),
}

let sessions = 0
const SURFACES = {
  latestCheckFor: {
    logs: ['a check passed'],
    run: (log, { tree }) => latestCheckFor(log, tree),
    positive: out => out?.event === 'check.passed',
  },
  'observedFacts -> sessionStateNote (what PreCompact and SessionEnd persist)': {
    logs: ['a check passed', 'nothing happened'],
    run: (log, { tree }, name) => {
      const facts = observedFacts(log, null, observation(tree))
      // `root: null` yields no files, which short-circuits the note to `neutral`;
      // a passing check is about changed paths, so supply them for that log.
      const files = name === 'a check passed' ? ['/x/a.md', '/x/b.md'] : facts.files
      return { facts, note: sessionStateNote({ ...facts, files }, '/x', '/x', true, new Date(NOW), { tasks: false }) }
    },
    positive: ({ facts, note }) => facts.checked === true || note.status === 'verified' || note.status === 'neutral'
      || /nothing has changed|passed on them/.test(note.text),
  },
  'statusline reading -> render': {
    logs: ['a check passed', 'nothing happened'],
    run: (log, _, __, dir) => render(reading(
      { session_id: `flip-${process.pid}-${sessions++}`, workspace: { current_dir: dir } },
      { read: () => log, now: NOW })),
    positive: out => /✓|nothing edited/.test(out),
  },
}

test('degrading the evidence changes the answer, at every surface that can give a positive one', () => {
  const dir = mkdtempSync(join(tmpdir(), 'qh-flip-'))
  try {
    // The status line speaks only for a project that named a check.
    writeFileSync(join(dir, '.quality-harness.json'), JSON.stringify({ check: 'sh check.sh' }))
    const ignored = []
    let driven = 0
    for (const [surface, { logs, run, positive }] of Object.entries(SURFACES)) {
      for (const name of logs) {
        const fixture = LOGS[name]
        const intact = run(asRead(fixture.entries), fixture, name, dir)
        assert.equal(positive(intact), true,
          `${surface} / ${name}: the control must be POSITIVE with evidence intact, or the flip below proves nothing — got ${JSON.stringify(intact)}`)
        for (const [how, degrade] of Object.entries(DEGRADED)) {
          const out = run(degrade(fixture.entries), fixture, name, dir)
          driven++
          if (positive(out)) ignored.push(`${surface} / ${name} / ${how} -> still ${JSON.stringify(out)}`)
        }
      }
    }
    assert.ok(driven >= 10, `the loop must actually drive the surfaces, drove ${driven}`)
    assert.deepEqual(ignored, [], `a positive answer survived evidence that could not be read whole:\n  ${ignored.join('\n  ')}`)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('a git status that FAILED is not a working tree where nothing changed (audit B4)', () => {
  const repo = mkdtempSync(join(tmpdir(), 'qh-flip-repo-'))
  try {
    const git = (...args) => spawnSync('git', ['-C', repo, ...args], { encoding: 'utf8', timeout: 30_000 })
    assert.equal(git('init', '-q').status, 0)
    const log = asRead(LOGS['nothing happened'].entries)
    // The control: a repository git CAN list, where stillness is a real answer.
    const looked = observedFacts(log, repo, observation('T0'))
    assert.equal(looked.observed, true, JSON.stringify(looked))
    assert.match(sessionStateNote(looked, repo, repo, true, new Date(NOW), { tasks: false }).text, /nothing has changed/)
    // The same log and observation, and a root git cannot list.
    const blind = observedFacts(log, join(repo, 'no', 'such', 'checkout'), observation('T0'))
    assert.equal(blind.observed, false, 'a failed listing is could-not-look, never an empty list')
    assert.match(blind.why, /git could not list/)
    const note = sessionStateNote(blind, repo, repo, true, new Date(NOW), { tasks: false })
    assert.equal(note.status, 'unverified')
    assert.doesNotMatch(note.text, /nothing has changed/)
    assert.match(note.text, /git could not list the working tree, so what changed here is unknown/)
  } finally { rmSync(repo, { recursive: true, force: true }) }
})

test('a turn that committed its work is not a session where nothing is outstanding (audit B1)', () => {
  const facts = pending => ({ files: [], other: 0, pending, checked: false, observed: true, why: null, lastCheck: null })
  const at = pending => sessionStateNote(facts(pending), '/x', '/x', true, new Date(NOW), { tasks: false })
  // The control: nothing uncommitted and nothing pending really is neutral.
  assert.equal(at(false).status, 'neutral')
  assert.match(at(false).text, /nothing has changed in the working tree/)
  // Nothing uncommitted and an unchecked tree at HEAD: the row the next session reads.
  assert.equal(at(true).status, 'unverified', 'SessionEnd persists only `status`, so it must carry the pending half')
  assert.doesNotMatch(at(true).text, /nothing has changed/)
  assert.match(at(true).text, /no `qh-check` has passed on/)
})

// How each function that reads the session log answers for itself. `driven`
// names the SURFACES entry that covers it; anything else carries the reason a
// lost line cannot make it say something positive.
const READERS = {
  handleHook: { driven: 'observedFacts -> sessionStateNote (what PreCompact and SessionEnd persist)' },
  completionRules: { safe: 'its verdict is `ledgerEvidence`, which returns could-not-look on an incomplete log; tests/observed-events.test.mjs tears a real log under it' },
  publishUnchecked: { safe: 'a lost pass or a lost baseline both make the tree unchecked, so it warns MORE, never less' },
  artifactRule: { safe: 'a lost `artifact.gated` re-gates and a lost `action.emitted` re-fires: repeated work, never a skipped gate' },
  importCheckRecords: { safe: 'reads only record ids to avoid a duplicate import; a lost line re-imports, and `latestCheckFor` dedupes by record' },
  recordHookEvent: { safe: 'reads only whether `session.started` exists; a lost line records a second baseline, which is the later and stricter one' },
  reviewChangedState: { open: 'docs/audits/2026-09-18-adr-060.md B5 — a lost `subagent.started` makes R3 silent with no could-not-look' },
}

test('every reader of the session log is driven above, or says why a lost line cannot flatter it', () => {
  const scripts = join(repoRoot, 'plugin', 'scripts')
  const found = new Set()
  let sites = 0
  for (const file of readdirSync(scripts).filter(name => name.endsWith('.mjs'))) {
    const lines = readFileSync(join(scripts, file), 'utf8').split('\n')
    lines.forEach((line, index) => {
      if (!/\breadEvents\(/.test(line) || /^\s*(?:export|import)\b/.test(line)) return
      sites++
      let at = index
      while (at >= 0 && !/^(?:export )?(?:async )?function \w+\(/.test(lines[at])) at--
      found.add(at >= 0 ? lines[at].match(/function (\w+)\(/)[1] : `${file}:${index + 1} (top level)`)
    })
  }
  assert.ok(sites >= 8, `the sweep must find the call sites it is about, found ${sites}`)
  assert.deepEqual([...found].filter(name => !(name in READERS)), [],
    'a new reader of the session log: drive it in SURFACES, or record here why a torn log cannot make it answer positively')
  assert.deepEqual(Object.keys(READERS).filter(name => !found.has(name)), [],
    'a reader named here no longer reads the log — remove it, so this list stays the code\'s own')
  for (const [name, entry] of Object.entries(READERS)) {
    if (entry.driven) assert.ok(entry.driven in SURFACES, `${name} claims a surface that does not exist`)
  }
})
