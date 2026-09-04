import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

// ADR-032. BACKLOG §105 asked which skills the eval suite exercises and answered
// with a hand-counted table. A grep over the same directories on 2026-09-04 gave
// a DIFFERENT answer, and neither was authoritative, because nothing in the
// corpus declared the mapping. These tests read the declaration instead.
const testDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(testDir, '..')
const root = join(repoRoot, 'plugin')
const evalsDir = join(root, 'evals')
const skillsDir = join(root, 'skills')

const UNATTRIBUTED = 'skill-unattributed'

/** Case directories: a case is a directory holding a `prompt.md`. */
function caseNames() {
  return readdirSync(evalsDir, { withFileTypes: true })
    .filter(e => e.isDirectory() && !['results', 'templates', 'mocks'].includes(e.name))
    .map(e => e.name)
    .filter(name => {
      try { readFileSync(join(evalsDir, name, 'prompt.md')); return true } catch { return false }
    })
    .sort()
}

/** The `skill-*` tags a case declares, read from its own frontmatter.
 *
 * Read here rather than through the runner on purpose: the runner's `--tag`
 * filter is a convenience this record verified, not the mechanism it depends on.
 */
function skillTags(name) {
  const text = readFileSync(join(evalsDir, name, 'prompt.md'), 'utf8')
  const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)
  if (!fm) return []
  const line = /^tags:\s*\[(.*)\]\s*$/m.exec(fm[1])
  if (!line) return []
  return line[1].split(',').map(s => s.trim()).filter(s => s.startsWith('skill-'))
}

const shippedSkills = () => readdirSync(skillsDir, { withFileTypes: true })
  .filter(e => e.isDirectory()).map(e => e.name).sort()

test('every eval case declares the skill it exercises, or declares that it exercises none', () => {
  const cases = caseNames()
  // Enumerated, never listed: a case added later is held to this without anyone
  // remembering to add it here.
  assert.ok(cases.length >= 8, `expected the eval cases, saw ${cases.length}`)

  const undeclared = cases.filter(name => skillTags(name).length === 0)
  assert.deepEqual(undeclared, [],
    'a case with no `skill-*` tag puts the coverage count back to a guess, which is ' +
    'the state ADR-032 exists to end — add `tags: [skill-<name>]`, or ' +
    `\`tags: [${UNATTRIBUTED}]\` with a comment saying why no subject is honest`)
})

test('a skill tag names a skill the plugin actually ships', () => {
  const shipped = new Set(shippedSkills())
  assert.ok(shipped.size > 0, 'the shipped skills must be readable, or this test proves nothing')
  const dangling = []
  for (const name of caseNames()) {
    for (const tag of skillTags(name)) {
      if (tag === UNATTRIBUTED) continue
      if (!shipped.has(tag.slice('skill-'.length))) dangling.push(`${name} → ${tag}`)
    }
  }
  // ADR-011's class: a declared pointer that resolves to nothing reads as coverage
  // while covering nothing. A renamed or deleted skill must surface here.
  assert.deepEqual(dangling, [],
    `these tags name no shipped skill under plugin/skills: ${dangling.join(', ')}`)
})

test('the skill-coverage report can distinguish all three of its answers', () => {
  // ADR-032 publishes three counts and blocks on none of them. This asserts the
  // REPORT is capable of telling them apart — without it, a report that always
  // said "covered" would pass every other test here.
  const shipped = shippedSkills()
  const attributed = new Set()
  let unattributed = 0
  for (const name of caseNames()) {
    const tags = skillTags(name)
    if (tags.includes(UNATTRIBUTED)) unattributed += 1
    for (const tag of tags) {
      if (tag !== UNATTRIBUTED) attributed.add(tag.slice('skill-'.length))
    }
  }
  const uncovered = shipped.filter(s => !attributed.has(s))

  // Each of the three buckets must be non-empty on the corpus as it stands, or
  // the assertion below is being satisfied by a report that only ever gives one
  // answer. Measured 2026-09-04: 3 attributed, 11 uncovered, 5 unattributed.
  assert.ok(attributed.size > 0, 'some skill must be exercised, or the suite exercises nothing')
  assert.ok(uncovered.length > 0,
    'every shipped skill has a case — delete this assertion and say so in ADR-032, ' +
    'because it now asserts the opposite of what it was written to catch')
  assert.ok(unattributed > 0,
    `no case declares ${UNATTRIBUTED} — if that is now true, the pre-registered ` +
    'failure in ADR-032 is the thing to evaluate, not this assertion')

  // And the three buckets must account for every case and every skill: a report
  // that silently dropped a case would otherwise look clean.
  assert.equal(attributed.size + uncovered.length, shipped.length,
    'every shipped skill is either exercised or reported uncovered')
})
