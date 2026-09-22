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
import { appendFileSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { hookSaid } from './hook-env.mjs'
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
  // ⚠ THE FLAG IS A PROPERTY ON AN ARRAY, AND EVERY ORDINARY COPY DROPS IT. While
  // the readers asked `complete === false`, a torn log that had been spread,
  // filtered or round-tripped answered `undefined` and certified again through
  // every exported reader (different-lineage review, 2026-09-19). Whole is now
  // something a log must SAY; these two keep it that way.
  'a torn log after a spread copy (the flag does not survive one)': entries => [...asRead(entries, false)],
  'a torn log after a JSON round trip': entries => JSON.parse(JSON.stringify(asRead(entries, false))),
}

// ⚠ ONE VOCABULARY, APPLIED TO THE WHOLE OUTPUT OF EVERY SURFACE. The first
// version gave each surface its own predicate, and the note's was
// `/passed on them/` — so "Last check: `sh check.sh` passed." sailed through in
// the same sentence as "could not be read whole", and the object beside it still
// carried `verdict: "passed"` for SessionEnd to persist. A guard whose vocabulary
// is narrower than the class it holds is a guard with a hole shaped like the
// next synonym, so the words live here once and the serialized output is searched
// whole. The two phrases removed first CONTAIN a positive word and mean its
// opposite.
const NEGATIONS = /no `qh-check` has passed|unverified/g
const POSITIVE = /passed|verified|✓|nothing has changed|nothing edited|"checked":true|"status":"neutral"/
const flatters = out => POSITIVE.test(JSON.stringify(out ?? null).replace(NEGATIONS, ''))
// ⚠ AND THE OTHER DIRECTION, which a vocabulary of flattering words cannot see.
// "No check has run this session" is not positive — and from a torn log it is
// exactly as unobserved as "passed": the lost line may BE the check. A mutant
// restoring that sentence survived the first version of this file (GREEN), one
// commit after its message promised the note would not say it. ADR-005 is about
// reporting what was not observed, in EITHER direction.
const CLAIMS_ABSENCE = /No check has run/

let sessions = 0
const SURFACES = {
  latestCheckFor: {
    logs: ['a check passed'],
    run: (log, { tree }) => latestCheckFor(log, tree),
    positive: flatters,
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
    positive: flatters,
  },
  'statusline reading -> render': {
    logs: ['a check passed', 'nothing happened'],
    run: (log, _, __, dir) => render(reading(
      { session_id: `flip-${process.pid}-${sessions++}`, workspace: { current_dir: dir } },
      { read: () => log, now: NOW })),
    positive: flatters,
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
          if (CLAIMS_ABSENCE.test(JSON.stringify(out ?? null))) {
            ignored.push(`${surface} / ${name} / ${how} -> claims an absence it could not observe: ${JSON.stringify(out)}`)
          }
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

// How each function that reads the session log answers for itself: `driven`
// names a SURFACES entry, `executed` names a BOUNDARIES entry run against every
// tear. ⚠ THESE WERE PROSE — "it warns MORE, never less" — and one of them was
// WRONG: `recordHookEvent` was called safe because a re-recorded baseline is
// "the later and stricter one". It is the opposite. A baseline re-found after the
// work was done measures that work against itself and finds nothing changed. What
// actually holds is that the torn line never repairs, so the log stays incomplete
// and the completeness guard answers. The outcome was right and the reason was
// not, which is exactly what executing a claim is for.
const READERS = {
  handleHook: { driven: 'observedFacts -> sessionStateNote (what PreCompact and SessionEnd persist)' },
  completionRules: { executed: 'Stop (completionRules)' },
  publishUnchecked: { executed: 'PreToolUse naming commit (publishUnchecked)' },
  reviewChangedState: { executed: 'SubagentStop of a read-only role (reviewChangedState)' },
  // Both run inside every hook, so every row of the table runs them; the `head`
  // tear is the one that loses the baseline `recordHookEvent` would re-find.
  importCheckRecords: { executed: 'PreToolUse naming commit (publishUnchecked)' },
  recordHookEvent: { executed: 'Stop (completionRules)' },
  // NOT executed, and said so rather than dressed as safe: no fixture here holds
  // an artifact, so nothing runs rule A against a torn log. The claim — a lost
  // `artifact.gated` re-gates, a lost `action.emitted` re-fires — is still prose.
  artifactRule: { unexecuted: 'docs/audits/2026-09-18-adr-060.md — needs a fixture with a gated artifact' },
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
    if (entry.executed) assert.ok(entry.executed in BOUNDARIES, `${name} claims a boundary that does not exist`)
    assert.ok(entry.driven || entry.executed || entry.unexecuted, `${name} must be driven, executed, or admit it is neither`)
  }

  // ⚠ AND THE TWO WAYS A READER ESCAPES A SWEEP FOR `readEvents(`. The first
  // version of this test found eight call sites, all in lifecycle.mjs — and so
  // never saw statusline.mjs, THE READER AUDIT B3 WAS ABOUT, because it takes the
  // function through a `read = readEvents` seam and never writes the call. It was
  // driven only because its author remembered it. So: every shipped file that so
  // much as NAMES the reader, and every export that takes a `log`.
  const FILES = {
    'event-log.mjs': 'defines it',
    'lifecycle.mjs': 'by function, above',
    'statusline.mjs': { driven: 'statusline reading -> render' },
  }
  const LOG_TAKERS = {
    observedFacts: { driven: 'observedFacts -> sessionStateNote (what PreCompact and SessionEnd persist)' },
    latestCheckFor: { driven: 'latestCheckFor' },
    logIncomplete: 'is the qualifier itself',
    unobservableWrites: 'ordered by the log; an incomplete log leaves every such write outstanding',
  }
  const naming = []
  const taking = []
  for (const file of readdirSync(scripts).filter(name => name.endsWith('.mjs'))) {
    const text = readFileSync(join(scripts, file), 'utf8')
    if (/\breadEvents\b/.test(text)) naming.push(file)
    for (const found of text.matchAll(/^export (?:async )?function (\w+)\(log\b/gm)) taking.push(found[1])
  }
  assert.deepEqual(naming.filter(file => !(file in FILES)), [], 'a shipped script names the log reader and is not registered')
  assert.deepEqual(Object.keys(FILES).filter(file => !naming.includes(file)), [], 'a registered file no longer names it')
  assert.deepEqual(taking.filter(name => !(name in LOG_TAKERS)), [], 'an exported function takes a `log` and is not registered')
  assert.deepEqual(Object.keys(LOG_TAKERS).filter(name => !taking.includes(name)), [], 'a registered export no longer takes one')
  for (const entry of [...Object.values(FILES), ...Object.values(LOG_TAKERS)]) {
    if (entry?.driven) assert.ok(entry.driven in SURFACES, `${entry.driven} is not a surface`)
  }
})

// ---- The same property, with nothing constructed by hand.
//
// Everything above SETS the qualifier. This tears a real file and lets the real
// hooks read it, because a guard on a flag proves nothing if production never
// raises the flag on the path that persists.
const lifecycleScript = join(repoRoot, 'plugin', 'scripts', 'lifecycle.mjs')
const qhCheck = join(repoRoot, 'plugin', 'bin', 'qh-check')
const IDENTITY = { GIT_AUTHOR_NAME: 'qh', GIT_AUTHOR_EMAIL: 'qh@example.invalid',
  GIT_COMMITTER_NAME: 'qh', GIT_COMMITTER_EMAIL: 'qh@example.invalid' }

test('a really torn log, read by the real hooks, does not persist a verified row', () => {
  const top = mkdtempSync(join(process.platform === 'darwin' ? '/private/tmp' : tmpdir(), 'qh-flip-e2e-'))
  try {
    const persisted = torn => {
      const label = torn ? 'torn' : 'whole'
      const dir = join(top, label)
      const data = join(top, `${label}-data`)
      const env = { ...process.env, ...IDENTITY, CLAUDE_PLUGIN_DATA: data, TMPDIR: top, TMP: top, TEMP: top }
      const run = (command, args, options = {}) => {
        const out = spawnSync(command, args, { encoding: 'utf8', timeout: 120_000, env, ...options })
        assert.equal(out.status, 0, `${command} ${args.join(' ')}: ${out.stderr}`)
        return out
      }
      const git = (...args) => run('git', ['-C', dir, ...args])
      const hook = payload => run(process.execPath, [lifecycleScript], { cwd: top, input: JSON.stringify(payload) })
      run('mkdir', ['-p', dir])
      git('init', '-q')
      writeFileSync(join(dir, 'a.md'), 'a\n')
      writeFileSync(join(dir, 'check.sh'), 'exit 0\n')
      writeFileSync(join(dir, '.quality-harness.json'), JSON.stringify({ check: 'sh check.sh' }))
      git('add', '-A')
      git('commit', '-q', '-m', 'base')
      const session = `flip-e2e-${label}-${process.pid}`
      hook({ hook_event_name: 'SessionStart', source: 'startup', session_id: session, cwd: dir })
      writeFileSync(join(dir, 'a.md'), 'changed\n')
      run('python3', [qhCheck], { cwd: dir })
      hook({ hook_event_name: 'Stop', session_id: session, cwd: dir })
      if (torn) {
        const log = join(dir, '.git', 'quality-harness', 'sessions', `${session}.jsonl`)
        assert.ok(existsSync(log), 'the session log is where this test expects it')
        appendFileSync(log, '{"event":"check.failed","record":"r2","se')
      }
      hook({ hook_event_name: 'SessionEnd', session_id: session, cwd: dir })
      const rows = readFileSync(join(data, 'sessions.jsonl'), 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line))
      return rows.at(-1)
    }
    // The control, through the identical path: a whole log over a checked change IS verified.
    const whole = persisted(false)
    assert.equal(whole.status, 'verified', `the control must persist a positive row, or the next assertion proves nothing: ${JSON.stringify(whole)}`)
    const torn = persisted(true)
    assert.notEqual(torn.status, 'verified', JSON.stringify(torn))
    assert.equal(flatters(torn), false, `nothing positive may be persisted from a torn log: ${JSON.stringify(torn)}`)
  } finally { rmSync(top, { recursive: true, force: true }) }
})

// ---- The reader registry's `safe:` entries, executed instead of asserted.
//
// Each said in PROSE why a lost line cannot make its reader answer more kindly —
// "it warns MORE, never less". That is a claim about direction, and a claim
// nothing runs is what this whole file exists to distrust. So: every hook
// boundary, against every way the file tears, through the real hooks.
//
// The tears are different defects, not one repeated. `tail` is a crash
// mid-append. `head` loses `session.started` — the BASELINE, so a reader that
// re-finds one would measure the work against itself. `last` loses whatever was
// written most recently, which for a review is the bracket that opened it.
const REVIEWER = 'quality-harness:qh-correctness-reviewer'
const TEARS = {
  tail: text => text + '{"event":"check.failed","rec',
  head: text => { const lines = text.split('\n'); lines[0] = lines[0].slice(0, 40); return lines.join('\n') },
  last: text => { const lines = text.trimEnd().split('\n'); lines[lines.length - 1] = lines.at(-1).slice(0, 40); return lines.join('\n') + '\n' },
}
const BOUNDARIES = {
  'Stop (completionRules)': { payload: { hook_event_name: 'Stop' } },
  'PreToolUse naming commit (publishUnchecked)': {
    payload: { hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'git commit -m x' } } },
  'SubagentStop of a read-only role (reviewChangedState)': {
    review: true, payload: { hook_event_name: 'SubagentStop', agent_id: 'a1', agent_type: REVIEWER } },
}

test('at every hook boundary a torn log is never quieter than a whole one, however it tore', () => {
  const top = mkdtempSync(join(process.platform === 'darwin' ? '/private/tmp' : tmpdir(), 'qh-flip-tbl-'))
  try {
    let count = 0
    const said = (boundary, tear) => {
      const label = `s${count++}`
      const dir = join(top, label)
      const env = { ...process.env, ...IDENTITY, CLAUDE_PLUGIN_DATA: join(top, `${label}-data`), TMPDIR: top, TMP: top, TEMP: top }
      const run = (command, args, options = {}) => {
        const out = spawnSync(command, args, { encoding: 'utf8', timeout: 120_000, env, ...options })
        assert.equal(out.status, 0, `${command} ${args.join(' ')}: ${out.stderr}`)
        return out
      }
      const git = (...args) => run('git', ['-C', dir, ...args])
      const hook = payload => run(process.execPath, [lifecycleScript], { cwd: top, input: JSON.stringify(payload) })
      run('mkdir', ['-p', dir])
      git('init', '-q')
      writeFileSync(join(dir, 'a.md'), 'a\n')
      writeFileSync(join(dir, 'check.sh'), 'exit 0\n')
      writeFileSync(join(dir, '.quality-harness.json'), JSON.stringify({ check: 'sh check.sh' }))
      git('add', '-A')
      git('commit', '-q', '-m', 'base')
      const session = `flip-tbl-${label}-${process.pid}`
      hook({ hook_event_name: 'SessionStart', source: 'startup', session_id: session, cwd: dir })
      writeFileSync(join(dir, 'a.md'), 'changed\n')
      run('python3', [qhCheck], { cwd: dir })
      if (boundary.review) {
        hook({ hook_event_name: 'SubagentStart', agent_id: 'a1', agent_type: REVIEWER, session_id: session, cwd: dir })
        writeFileSync(join(dir, 'during.md'), 'during\n')
      }
      if (tear) {
        const log = join(dir, '.git', 'quality-harness', 'sessions', `${session}.jsonl`)
        writeFileSync(log, TEARS[tear](readFileSync(log, 'utf8')))
      }
      const out = hook({ ...boundary.payload, session_id: session, cwd: dir })
      return hookSaid(out.stdout, out.stderr).text
    }
    const quieter = []
    for (const [name, boundary] of Object.entries(BOUNDARIES)) {
      const whole = said(boundary, null)
      // The controls. A checked change is SILENT at Stop and at a publish — that
      // silence is the positive answer here — and a review that changed state says so.
      if (boundary.review) assert.match(whole, /state changed during/, `${name}: the control must report the change`)
      else assert.equal(whole, '', `${name}: the control must be silent over a checked tree, got ${whole.slice(0, 200)}`)
      for (const tear of Object.keys(TEARS)) {
        const torn = said(boundary, tear)
        if (torn === '') quieter.push(`${name} / ${tear}: SILENT`)
        else if (flatters(torn)) quieter.push(`${name} / ${tear}: ${torn.slice(0, 200)}`)
        // And the accusation is as unobserved as the compliment: a check may have
        // succeeded and its record be the line that tore. Warn, but as UNKNOWN.
        else if (/no `qh-check` has passed/.test(torn)) quieter.push(`${name} / ${tear}: accuses from a torn log — ${torn.slice(0, 160)}`)
        // ...unless it still makes the SAME report the whole log made. A review whose
        // bracket survived the tear compared two real observations; that is observed,
        // and demanding a could-not-look beside it would be demanding a false one.
        else if (!/unknown|could not be read whole/.test(torn) && !(boundary.review && /state changed during/.test(torn))) {
          quieter.push(`${name} / ${tear}: never says it could not look — ${torn.slice(0, 160)}`)
        }
      }
    }
    assert.deepEqual(quieter, [], `a torn log made a boundary quieter or kinder than a whole one:\n  ${quieter.join('\n  ')}`)
  } finally { rmSync(top, { recursive: true, force: true }) }
})
