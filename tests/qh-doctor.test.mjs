// ADR-027 — the operating surface, and the half of it a machine can measure.
//
// GitHub issue #9 reported an adopter carrying 150 lines of their global CLAUDE.md
// about this harness, three lines of which had gone stale in the direction of
// making the tool look STRICTER and NARROWER than it is. Every one of those was a
// restatement of something countable. So the countable half becomes a command,
// and these are the checks that it derives rather than restates.
//
// Everything here is driven through a pure seam — text in, verdict out — so no
// test reads this machine's home directory. A check whose answer depends on who
// is asking is not a check (CLAUDE.md §8).
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  classifyBinEntry, drift, homeReport, inventory, ledgerReport, releaseReport, report, severitySplit,
} from '../plugin/scripts/qh-doctor.mjs'

const testDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(testDir, '..')
const pluginRoot = join(repoRoot, 'plugin')

test('the severity split is read out of the gate, not restated here', () => {
  // The exact figure issue #9 found stale in a hand-written file. It is derived
  // from source at run time, so it cannot be wrong for longer than an edit.
  const real = severitySplit(readFileSync(join(pluginRoot, 'bin', 'adr-lint'), 'utf8'))
  assert.ok(real.failing > 0 && real.advisory > 0,
    `the real gate must yield a real split: ${JSON.stringify(real)}`)

  // SHOWN CAPABLE OF A DIFFERENT ANSWER, in the same test. A function that
  // returned the current numbers by accident would pass the assertion above at
  // full coverage — that is the vacuity CLAUDE.md §4 is about.
  const fixture = [
    'errors.append("a")', 'errors.append("b")', 'errors.append("c")',
    'errors.advise("d")',
    '# errors.append("not a call, a comment") is still counted — see below',
  ].join('\n')
  assert.deepEqual(severitySplit(fixture), { failing: 4, advisory: 1 },
    'the count is textual and says so; it does not parse Python')

  // And an empty subject yields zeros rather than throwing, because "I could not
  // look" must stay distinguishable from "there are none" (ADR-005).
  assert.deepEqual(severitySplit(''), { failing: 0, advisory: 0 })
})

test('a home file the plugin cannot prove it wrote is never called a copy', () => {
  // ADR-019, surviving being reported on. `classifyHomeFile` already answers
  // `unidentified`; this asserts the reporter does not launder that into a
  // finding on its way to the screen.
  assert.equal(classifyBinEntry({
    text: '#!/bin/sh\necho something else entirely\n',
    shippedNow: false,
    classification: { state: 'unidentified', route: null },
  }), 'unidentifiable')

  // An orphan the plugin CAN prove it wrote is named as such — and is still not
  // a copy, because the plugin does not ship that name today.
  assert.equal(classifyBinEntry({
    text: '#!/usr/bin/env python3\n',
    shippedNow: false,
    classification: { state: 'ours-orphan', route: 'digest' },
  }), 'orphan')
})

test('a forwarder and a copy are told apart, and only a copy is a finding', () => {
  // The distinction the reporter had to add a ⚠ correction about: an earlier
  // version of their own advice would have sent a session to DELETE the
  // forwarders. A forwarder carries the mark and resolves the newest plugin at
  // call time; a copy is a frozen fork.
  const forwarder = '#!/bin/sh\n# quality-harness-forwarder: resolves the newest installed plugin\n'
  assert.equal(classifyBinEntry({
    text: forwarder, shippedNow: true, classification: { state: 'ours-shipped', route: 'shipped' },
  }), 'forwarder')

  // Same shipped name, no mark: a real file standing where a forwarder should be.
  assert.equal(classifyBinEntry({
    text: '#!/usr/bin/env python3\nimport sys\n',
    shippedNow: true,
    classification: { state: 'ours-shipped', route: 'shipped' },
  }), 'copy')

  // The mark wins even when the classifier has not been run — a forwarder is a
  // forwarder by its own contents, which is what makes the check cheap.
  assert.equal(classifyBinEntry({
    text: forwarder, shippedNow: false, classification: { state: 'ours-orphan', route: 'forwarder' },
  }), 'forwarder')
})

test('the inventory is counted from the tree', () => {
  const counted = inventory(pluginRoot)

  // Derived, never enumerated — the property that makes it unable to rot. It is
  // compared against a second reading of the same tree rather than against a
  // number typed here, because a literal would be the defect under test.
  const skills = readdirSync(join(pluginRoot, 'skills'), { withFileTypes: true })
    .filter(entry => entry.isDirectory()).length
  assert.equal(counted.skills, skills)
  assert.ok(counted.gates > 5 && counted.templates > 0 && counted.workflows > 0,
    `the counts must come from a real tree: ${JSON.stringify(counted)}`)

  // The version comes from the manifest, which is the one place it is written.
  const manifest = JSON.parse(readFileSync(join(pluginRoot, '.claude-plugin', 'plugin.json'), 'utf8'))
  assert.equal(counted.version, manifest.version)

  // A root that holds nothing reports zeros and a null version — "could not
  // look" rather than a crash, and never a borrowed answer from somewhere else.
  const empty = inventory(join(testDir, 'fixtures', 'definitely-not-a-plugin-root'))
  assert.deepEqual(empty, { skills: 0, gates: 0, templates: 0, workflows: 0, version: null })
})

// ADR-027 T2 and T3. The pre-registered failure in the record's Decision is that
// either prose surface grows an inventory and rots exactly as the reported
// instruction file did. These are that failure's checks — without them the
// Decision carries a promise, and a promise is what issue #9 was about.
const NAMES_A_COUNT = /\b\d+\s+(?:skills?|gates?|templates?|workflows?|findings?)\b/i

function prose(relative) {
  return readFileSync(join(pluginRoot, relative), 'utf8')
}

test('the operating skill points at the command and enumerates nothing', () => {
  const skill = prose(join('skills', 'operating', 'SKILL.md'))
  // The RUNNABLE invocation, not merely the word. Asserting `/qh-doctor/` was the
  // first version and it could not be shown able to fail: the name appears twice,
  // so a mutation removing either one left the other and the mutant survived.
  // A reader needs a line they can paste, which is the stronger claim anyway.
  assert.match(skill, /^\s+node "\$\{CLAUDE_PLUGIN_ROOT\}\/scripts\/qh-doctor\.mjs"$/m,
    'the skill must give a runnable invocation, not just name the command')
  assert.doesNotMatch(skill, NAMES_A_COUNT,
    'a count here is the rot this record exists to prevent — ask qh-doctor instead')

  // Shown able to fail: the detector must recognise the thing it forbids.
  assert.match('the plugin ships 13 skills', NAMES_A_COUNT)
  assert.doesNotMatch('the plugin ships what it ships', NAMES_A_COUNT)
})

test('the plugin README points at the command and enumerates nothing', () => {
  // A README is the artifact MOST likely to grow an inventory, because listing
  // is what READMEs usually do. Same guard, same reason.
  const readme = prose('README.md')
  // Same correction as the skill's: `/qh-doctor/` matched a second, prose mention,
  // so a mutation on the invocation left the assertion green. The door must give a
  // line a reader can paste.
  assert.match(readme, /^\s+node "\$\{CLAUDE_PLUGIN_ROOT\}\/scripts\/qh-doctor\.mjs"$/m,
    'the door must give a runnable invocation, not just name the command')
  assert.doesNotMatch(readme, NAMES_A_COUNT,
    'a count here rots on the next release — ask qh-doctor instead')
  assert.match(readme, /quality-harness:operating/,
    'the door names the skill that carries the judgment')
})

// The exit codes are this command's contract, and until 2026-09-03 nothing could
// reach them: they lived inside a `main()` that also called `os.homedir()` and
// spawned a subprocess. The coverage floor is what surfaced that — a contract no
// test can reach is one the next edit breaks silently.
const CLEAN_HOME = { entries: [{ name: 'adr-lint', kind: 'forwarder' }], looked: true, note: null }
const COUNTED = { skills: 1, gates: 1, templates: 1, workflows: 1, version: '9.9.9' }
const CLEAN_DRIFT = { looked: true, clean: true, out: '' }

test('the exit code says which of the three answers this is', () => {
  const clean = report({ counted: COUNTED, home: CLEAN_HOME, moved: CLEAN_DRIFT, gateSource: '' })
  assert.equal(clean.exit, 0)
  assert.match(clean.lines.join('\n'), /Nothing to act on/)

  // A COPY is the one state that is a finding, and it outranks an unreadable
  // read: a verdict you can act on must not be hidden behind "could not look".
  const copy = report({
    counted: COUNTED,
    home: { entries: [{ name: 'adr-lint', kind: 'copy' }], looked: false, note: 'partial' },
    moved: { looked: false, clean: null, out: 'boom' },
    gateSource: '',
  })
  assert.equal(copy.exit, 1, 'a copy outranks a failed read')
  assert.match(copy.lines.join('\n'), /COPY\(-ies\) installed: adr-lint/)

  // Could-not-look is its own answer and never a clean bill (ADR-005).
  const blind = report({
    counted: COUNTED, home: { entries: [], looked: false, note: 'unreadable' },
    moved: CLEAN_DRIFT, gateSource: '',
  })
  assert.equal(blind.exit, 2)
  assert.match(blind.lines.join('\n'), /COULD NOT LOOK/)

  // And a drift that could not be measured is equally not a pass.
  assert.equal(report({
    counted: COUNTED, home: CLEAN_HOME, moved: { looked: false, clean: null, out: 'no node' },
    gateSource: '',
  }).exit, 2)
})

// ADR-005 in the one place the ledger read was collapsing three answers into
// one. "No ledger" and "could not read the ledger" are different, and only the
// first is a clean bill — the read lived inside `report()`, so an unreadable
// ledger printed "nothing recorded" and still returned exit 0, contradicting
// the contract stated in that function's own comment. Both arms are asserted
// in one test because coverage cannot see a vacuous check (CLAUDE.md §4).
test('an unreadable claims ledger is could-not-look, not an empty one', () => {
  const home = mkdtempSync(join(os.tmpdir(), 'qh-doctor-ledger-'))
  const blindHome = mkdtempSync(join(os.tmpdir(), 'qh-doctor-ledger-'))
  try {
    // Unset: nothing is being recorded anywhere, which is not a failure to look.
    const unset = ledgerReport({})
    assert.deepEqual([unset.file, unset.looked, unset.rows], [null, true, null])

    // Absent: ENOENT is "nothing has been recorded yet", a clean answer.
    const absent = ledgerReport({ CLAUDE_PLUGIN_DATA: home })
    assert.equal(absent.looked, true)
    assert.equal(absent.rows, null)

    // Readable: a count, and the clean exit — the arm that must still pass.
    writeFileSync(join(home, 'claims.jsonl'), '{"claim":"none"}\n{"claim":"none"}\n')
    const read = ledgerReport({ CLAUDE_PLUGIN_DATA: home })
    assert.equal(read.rows, 2)
    const clean = report({
      counted: COUNTED, home: CLEAN_HOME, moved: CLEAN_DRIFT, gateSource: '', ledger: read,
    })
    assert.equal(clean.exit, 0, 'a readable ledger is not a finding')
    assert.match(clean.lines.join('\n'), /2 completion event\(s\) recorded/)

    // Unreadable: a DIRECTORY where the file should be. Not ENOENT, so this is
    // could-not-look, and it has to reach the exit code.
    mkdirSync(join(blindHome, 'claims.jsonl'))
    const blind = ledgerReport({ CLAUDE_PLUGIN_DATA: blindHome })
    assert.equal(blind.looked, false, 'a directory in the ledger place is not an empty ledger')
    const answer = report({
      counted: COUNTED, home: CLEAN_HOME, moved: CLEAN_DRIFT, gateSource: '', ledger: blind,
    })
    assert.equal(answer.exit, 2, 'could-not-look is never a clean bill')
    assert.match(answer.lines.join('\n'), /COULD NOT LOOK/)
  } finally {
    rmSync(home, { recursive: true, force: true })
    rmSync(blindHome, { recursive: true, force: true })
  }
})

test('the release report says released, main-head, or could-not-look — and never released for an unreachable remote', () => {
  const dir = mkdtempSync(join(os.tmpdir(), 'qh-doctor-release-'))
  try {
    mkdirSync(join(dir, '.git'))
    const remote = answer => (args) => {
      if (args.includes('rev-parse')) return 'abc1234\n'
      if (args.includes('get-url')) return 'https://github.com/D3-lt/quality-harness.git\n'
      if (typeof answer === 'function') return answer()
      return answer
    }
    const released = releaseReport({ version: '2.73.0', cloneDir: dir, run: remote('deadbeef\trefs/tags/v2.73.0\n') })
    assert.deepEqual(released, { looked: true, head: 'abc1234', version: '2.73.0', released: true })
    const ahead = releaseReport({ version: '2.74.0', cloneDir: dir, run: remote('') })
    assert.equal(ahead.released, false)
    // A near miss is not the tag: the remote answers a prefix query with every match.
    assert.equal(releaseReport({ version: '2.73.0', cloneDir: dir, run: remote('cafe\trefs/tags/v2.73.0-rc\n') }).released, false)
    // A clone repointed elsewhere proves nothing about this plugin.
    const elsewhere = releaseReport({ version: '2.73.0', cloneDir: dir, run: args => args.includes('get-url') ? 'https://github.com/someone/else.git\n' : 'x\trefs/tags/v2.73.0\n' })
    assert.equal(elsewhere.looked, false)
    assert.match(elsewhere.note, /not this plugin's repository/)
    const offline = releaseReport({ version: '2.73.0', cloneDir: dir, run: remote(() => { throw Object.assign(new Error('git ls-remote timed out'), { code: 'ETIMEDOUT' }) }) })
    assert.equal(offline.looked, false)
    assert.match(offline.note, /could not be asked/)
    assert.equal(releaseReport({ version: '2.73.0', cloneDir: join(dir, 'nope') }).looked, false)
    assert.equal(releaseReport({ version: null }).looked, false)

    const lines = state => report({ counted: COUNTED, home: CLEAN_HOME, moved: CLEAN_DRIFT, gateSource: '', release: state }).lines.join('\n')
    assert.match(lines(released), /2\.73\.0 is a published tag/)
    assert.match(lines(ahead), /NO tag on the remote: this is main head/)
    assert.match(lines(offline), /release\n  COULD NOT LOOK/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('the home scan classifies a real directory and never invents one', () => {
  const temp = mkdtempSync(join(os.tmpdir(), 'qh-doctor-home-'))
  try {
    // A home with nothing installed is `looked: true` with no entries — that is
    // "there are none", which must stay distinct from "I could not look".
    const bare = homeReport(temp, pluginRoot)
    assert.deepEqual(bare.entries, [])
    assert.equal(bare.looked, true)

    const bin = join(temp, '.claude', 'bin')
    mkdirSync(bin, { recursive: true })
    writeFileSync(join(bin, 'adr-lint'), '#!/bin/sh\n# quality-harness-forwarder\n')
    writeFileSync(join(bin, 'adr-verify'), '#!/usr/bin/env python3\nprint(1)\n')
    writeFileSync(join(bin, 'someone-elses-tool'), '#!/bin/sh\necho hi\n')

    const scanned = homeReport(temp, pluginRoot)
    const kindOf = (name) => scanned.entries.find(e => e.name === name)?.kind
    assert.equal(kindOf('adr-lint'), 'forwarder')
    assert.equal(kindOf('adr-verify'), 'copy', 'a shipped name without the mark is a fork')
    assert.equal(kindOf('someone-elses-tool'), 'unidentifiable',
      'ADR-019: a file the plugin cannot prove it wrote is never claimed')
  } finally {
    rmSync(temp, { recursive: true, force: true })
  }
})

test('drift reports that it could not look rather than that nothing differs', () => {
  // Pointed at a root with no sync-standalone.mjs, the spawn fails. The answer
  // must be `looked: false`, never `clean: true` — an unrunnable check reporting
  // clean is the defect ADR-005 exists to keep out of these gates.
  const answer = drift(join(testDir, 'fixtures', 'definitely-not-a-plugin-root'))
  assert.equal(answer.looked, false)
  assert.notEqual(answer.clean, true)
})

// The same zero, one layer up: qh-doctor points a reader at claims-rate, so
// pointing without saying the detector is off would launder it here instead.
test('the ledger line says whether claim detection is running', () => {
  const base = { counted: COUNTED, home: CLEAN_HOME, moved: CLEAN_DRIFT, gateSource: '' }
  const ledger = { file: '/somewhere/claims.jsonl', looked: true, rows: 4, note: null }

  const off = report({ ...base, ledger, armWithdrawn: true })
  assert.match(off.lines.join('\n'), /claim detection is WITHDRAWN/)
  assert.equal(off.exit, 0, 'saying the arm is off is a note, never a finding (CLAUDE.md §3)')

  const on = report({ ...base, ledger, armWithdrawn: false })
  assert.doesNotMatch(on.lines.join('\n'), /WITHDRAWN/)

  // And with no ledger at all there is no rate to mislabel.
  const none = report({ ...base, armWithdrawn: true })
  assert.doesNotMatch(none.lines.join('\n'), /claim detection is WITHDRAWN/)
})
