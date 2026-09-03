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
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  classifyBinEntry, inventory, severitySplit,
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
  assert.match(skill, /qh-doctor/,
    'the skill must hand every countable question to the command')
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
  assert.match(readme, /qh-doctor/,
    'the door must hand every countable question to the command')
  assert.doesNotMatch(readme, NAMES_A_COUNT,
    'a count here rots on the next release — ask qh-doctor instead')
  assert.match(readme, /quality-harness:operating/,
    'the door names the skill that carries the judgment')
})
