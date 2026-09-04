import assert from 'node:assert/strict'
import test from 'node:test'

import {
  flagsChanged,
  flagsIn,
  isServedProse,
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
