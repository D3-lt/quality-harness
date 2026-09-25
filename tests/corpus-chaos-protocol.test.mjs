// ADR-064 T7: the corpus-chaos skill carries the release loop. A runner probes ONCE
// and reads the saved report twice; an attestation needs a checkout at the
// release-candidate sha, because an installed plugin cache has no git and its
// attestation carries `at: null`; and every lead lands in one of four classes.
// Scoped to the section each rule belongs in: the asker's request template names
// `--diff` too, so a whole-file grep would stay green with the runner's step gone.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const skill = readFileSync(path.join(repoRoot, 'plugin', 'skills', 'corpus-chaos', 'SKILL.md'), 'utf8')
const section = heading => {
  const start = skill.indexOf(`\n## ${heading}`)
  assert.ok(start >= 0, `the skill has a "## ${heading}" section`)
  const end = skill.indexOf('\n## ', start + 1)
  return skill.slice(start, end < 0 ? undefined : end)
}

test('the corpus-chaos skill carries the release-loop protocol', () => {
  const runner = section('Runner')
  const probe = runner.indexOf('--json > new.json')
  const diff = runner.indexOf('--diff old.json new.json')
  const attest = runner.indexOf('--attest <label> new.json')
  assert.ok(probe >= 0 && diff > probe && attest > diff, `the runner probes, then diffs, then attests, in that order:\n${runner}`)
  assert.equal((runner.match(/--json > new\.json/g) ?? []).length, 1, 'one probe run')
  assert.match(runner, /checkout at the release-candidate sha/)
  assert.match(runner, /installed plugin cache[^\n]*\n?[^\n]*`at: null`/)
  const asker = section('Asker')
  assert.match(asker, /once per batch/)
  for (const shape of ['Rust', 'Go', 'Laravel', 'SPA', 'static site', 'Windows']) assert.ok(asker.includes(shape), `the roster names ${shape}`)
  for (const triage of [/false refusal or a fail-open[^.]*this batch/, /wording[^.]*next batch/, /corpus's own problem[^.]*its owner/, /by design[^.]*recorded/]) {
    assert.match(asker, triage)
  }
})

// The Chaos section: a scratch copy only, a printed seed that replays, at least one
// perturbation of the runner's own, the abominations after, and findings that replay.
// The draw's codes and the catalogue's rows must be the same set, or the seed picks a
// code nobody defined (or never picks one that is).
test('the corpus-chaos skill breaks a scratch copy, by a seed, from its own catalogue', () => {
  const chaos = section('Chaos')
  assert.match(chaos, /Only ever a scratch copy/)
  assert.match(chaos, /probed repository is\s+never edited/)
  assert.match(chaos, /Pick a seed[^.]*print it/)
  assert.match(chaos, /at least one of your own/)
  assert.match(chaos, /abominations\.md/)
  assert.match(chaos, /could-not-look instead/)
  assert.doesNotMatch(chaos, /--json > new\.json/, 'a chaos report never overwrites the faithful one')
  const dir = path.join(repoRoot, 'plugin', 'skills', 'corpus-chaos')
  const catalogue = readFileSync(path.join(dir, 'perturbations.md'), 'utf8')
  const rows = new Set([...catalogue.matchAll(/^\| ([A-Z]\d+) \|/gm)].map(m => m[1]))
  const drawn = new Set(chaos.match(/1727291234 ((?:[A-Z]\d+ ?)+)/)[1].trim().split(' '))
  assert.deepEqual([...drawn].sort(), [...rows].sort(), 'the seed draws exactly the catalogue\'s codes')
  const abominations = readFileSync(path.join(dir, 'abominations.md'), 'utf8')
  assert.match(abominations, /## Bounds — the host is not the target/)
  assert.match(abominations, /shrink it/)
  assert.match(section('Asker'), /For chaos, append one sentence/)
})
