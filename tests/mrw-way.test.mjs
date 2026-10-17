import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const skills = path.join(repoRoot, 'plugin', 'skills')
const skill = name => readFileSync(path.join(skills, name, 'SKILL.md'), 'utf8')
const HEADING = '## Read and edit in batches'

// ADR-107 T1: the implementing skill carries the mrw way once, and the skills that implement point to it.
test('the implementing skills teach one read of every site, one batch of edits, and a check that each edit landed', () => {
  const execution = skill('execution')
  const start = execution.indexOf(`\n${HEADING}\n`)
  assert.ok(start >= 0, `execution has no "${HEADING}" section`)
  const end = execution.indexOf('\n## ', start + 1)
  const section = execution.slice(start, end < 0 ? undefined : end)
  for (const rule of [/one read of every site/i, /one batch/i, /count/i, /one substitution/i,
    /matched nothing is a failure/i, /refusal/i, /`mrw`.*on PATH|on PATH.*`mrw`/i]) {
    assert.match(section, rule, `the section does not say ${rule}`)
  }
  assert.ok(section.split('\n').filter(line => line.trim()).length <= 13, 'the section is longer than twelve lines under its heading')
  for (const name of ['adr-execute', 'work']) {
    assert.ok(skill(name).includes('Read and edit in batches'), `${name} does not point to the section`)
  }
  // One copy: no other skill repeats the section's own sentence.
  const sentence = section.split('\n').find(line => /one read of every site/i.test(line)).trim()
  for (const name of readdirSync(skills).filter(entry => entry !== 'execution')) {
    let body = ''
    try { body = skill(name) } catch { continue }
    assert.ok(!body.includes(sentence), `${name} copies the section instead of pointing to it`)
  }
})
