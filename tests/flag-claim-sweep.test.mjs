import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  flagsChanged,
  flagsIn,
  isServedProse,
  main,
  namesFlag,
  namesGate,
} from '../scripts/flag-claim-sweep.mjs'

// The gate source either side of a commit. Deliberately not a diff: the whole
// point of the design is that the check reads STATES, not the lines a commit
// happened to touch.
const before = `
def main():
    if "--adopt" in sys.argv:
        adopt()
    # --covers records which mechanism a run exercised
`
const afterFlagAdded = `${before}
    if "--version" in sys.argv:
        report_version()
`

test('a flag added to the surface is reported, and an unchanged surface is not', () => {
  // Both answers in one test. A `flagsChanged` mutated to return [] passes the
  // second assertion alone at full line and branch coverage — CLAUDE.md §4.
  assert.deepEqual(flagsChanged(before, afterFlagAdded), ['--version'])
  assert.deepEqual(flagsChanged(before, before), [])
})

test('a flag removed from the surface is reported too', () => {
  // Removal is the case a purely additive check would miss, and it is the more
  // dangerous one: prose describing a flag that no longer exists tells a reader
  // to type something the gate will refuse.
  assert.deepEqual(flagsChanged(afterFlagAdded, before), ['--version'])
})

test('a flag whose line moved is not a flag whose surface changed', () => {
  // THE mechanism. The first version of this script read the `+`/`-` lines of a
  // `--unified=0` diff, so a commit that reflowed a help block reported every
  // flag in it: 76 findings across 21 commits on this repository's history,
  // against 1 for the set difference. A reflow is exactly this shape — same
  // flags, different lines — and a check that reports it is a check people skim.
  const reflowed = `
def main():
    # --covers records which mechanism a run exercised
    if "--adopt" in sys.argv:
        adopt()
`
  assert.deepEqual(flagsChanged(before, reflowed), [])
  // ...and the reflow really did move the lines, so the assertion above is about
  // the set difference rather than about two identical strings.
  assert.notEqual(before.trim(), reflowed.trim())
})

test('flagsIn reads the long flags a text declares', () => {
  assert.deepEqual([...flagsIn(before)].sort(), ['--adopt', '--covers'])
  assert.deepEqual([...flagsIn('nothing here')], [])
})

test('a flag is matched whole, so a longer flag is not a claim about it', () => {
  assert.ok(namesFlag('run it with --version to see', '--version'))
  assert.ok(!namesFlag('the --versions list', '--version'),
    'a longer flag must not read as a claim about the shorter one')
  assert.ok(!namesFlag('pass --no-version instead', '--version'),
    'a flag containing this one is a different flag')
})

test('a gate name is matched whole, so prose about another tool does not qualify', () => {
  const gates = ['adr-lint', 'qh-root']
  assert.ok(namesGate('run adr-lint on the record', gates))
  assert.ok(!namesGate('see adr-lint-extras for more', gates),
    'a longer name is a different tool')
  assert.ok(!namesGate('this is about the codex binary', gates),
    'prose naming no gate is what keeps codex-review out of the findings')
})

test('history is not served prose, and skills are', () => {
  // The corpus choice is load-bearing, not cosmetic: an ADR describing the
  // behaviour as it stood when the decision was taken is CORRECT and must never
  // be rewritten, and a backlog entry recording a defect is supposed to describe
  // the defect. Including both was the difference between 48 findings and 1.
  assert.ok(isServedProse('plugin/skills/operating/SKILL.md'))
  assert.ok(isServedProse('docs/mcp.md'))
  assert.ok(isServedProse('plugin/README.md'))
  assert.ok(!isServedProse('docs/adr/ADR-031-a-gate-answers-for-itself.md'))
  assert.ok(!isServedProse('docs/BACKLOG.md'))
})

// --- main(), against a real repository built for the purpose ---------------
//
// The pure functions above are the design; `main` is what anybody actually
// runs, and it was asserted by nothing. It resolves gates and prose out of git
// rather than off disk (CLAUDE.md §8), so the only honest way to drive it is a
// real repository with real commits.

/** A throwaway git repository holding one gate and one skill that describes it. */
function repoWithAFlagChange({ proseNamesFlag, proseNamesGate }) {
  const dir = mkdtempSync(join(os.tmpdir(), 'quality-harness-flagsweep-'))
  // `dir` is a directory this test created. It is never the repository under
  // test, and the two must not share a variable name (CLAUDE.md §9).
  const git = args => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', timeout: 60_000 })
  git(['init', '-q', '-b', 'main'])
  git(['config', 'user.email', 'test@example.invalid'])
  git(['config', 'user.name', 'Test'])
  git(['config', 'commit.gpgsign', 'false'])

  mkdirSync(join(dir, 'plugin', 'bin'), { recursive: true })
  mkdirSync(join(dir, 'plugin', 'skills', 'operating'), { recursive: true })
  writeFileSync(join(dir, 'plugin', 'bin', 'adr-lint'),
    '#!/usr/bin/env python3\ndef main():\n    if "--adopt" in sys.argv:\n        pass\n')
  writeFileSync(join(dir, 'plugin', 'skills', 'operating', 'SKILL.md'),
    `# Operating\n\n${proseNamesGate ? 'Run adr-lint on the record.' : 'Run the codex binary.'}\n`
    + `${proseNamesFlag ? 'It does not answer --version.' : 'It answers questions.'}\n`)
  git(['add', '-A'])
  git(['commit', '-qm', 'the gate and the prose'])

  // The commit under test: a flag the gate did not have before.
  writeFileSync(join(dir, 'plugin', 'bin', 'adr-lint'),
    '#!/usr/bin/env python3\ndef main():\n    if "--adopt" in sys.argv:\n        pass\n'
    + '    if "--version" in sys.argv:\n        report()\n')
  git(['add', '-A'])
  git(['commit', '-qm', 'give the gate --version'])
  return dir
}

/** Run `main` inside `dir`, capturing stdout. */
function sweepIn(dir, argv) {
  const cwd = process.cwd()
  const lines = []
  const log = console.log
  console.log = (...a) => lines.push(a.join(' '))
  try {
    process.chdir(dir)
    return { code: main(argv), out: lines.join('\n') }
  } finally {
    console.log = log
    process.chdir(cwd)
  }
}

test('main reports prose that named a flag the commit changed, and stays quiet otherwise', () => {
  // Both answers, driven through the real entry point. The second case is the
  // gate-name filter doing its job: same flag, same commit, prose that talks
  // about some other binary.
  const found = repoWithAFlagChange({ proseNamesFlag: true, proseNamesGate: true })
  try {
    const hit = sweepIn(found, ['--all'])
    assert.equal(hit.code, 0, 'this reports and never blocks (CLAUDE.md §3)')
    assert.match(hit.out, /RE-READ/, `the stale claim must be reported:\n${hit.out}`)
    assert.match(hit.out, /operating\/SKILL\.md/, hit.out)
    assert.match(hit.out, /--version/, hit.out)
  } finally { rmSync(found, { recursive: true, force: true }) }

  const quiet = repoWithAFlagChange({ proseNamesFlag: true, proseNamesGate: false })
  try {
    const miss = sweepIn(quiet, ['--all'])
    assert.equal(miss.code, 0)
    assert.doesNotMatch(miss.out, /RE-READ/,
      `prose naming no gate is not a claim about ours:\n${miss.out}`)
    assert.match(miss.out, /no served prose named a flag/, miss.out)
  } finally { rmSync(quiet, { recursive: true, force: true }) }
})

test('main says it could not look rather than reporting a clean sweep', () => {
  // ADR-005 through the entry point. A range git cannot resolve is UNRUN, and
  // the word "clean" must not appear anywhere near it.
  const dir = repoWithAFlagChange({ proseNamesFlag: true, proseNamesGate: true })
  try {
    const out = sweepIn(dir, ['no-such-ref..also-missing'])
    assert.equal(out.code, 0, 'it never blocks, even when it could not look')
    assert.match(out.out, /UNRUN/, `could-not-look is its own word:\n${out.out}`)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('main prints usage for --help without touching git', () => {
  const out = sweepIn(process.cwd(), ['--help'])
  assert.equal(out.code, 0)
  assert.match(out.out, /Usage: node scripts\/flag-claim-sweep\.mjs/)
})
