// ADR-062: a host returns the review schema, or unavailable. No second model paraphrases it.
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { CODEX_MODEL, PI_UNMEASURED, hostReview, reviewFromOutput } from '../plugin/scripts/host-review.mjs'

const finding = {
  file: 'a.js', problem: 'p', impact: 'i', evidence: 'a.js:1', minimal_fix: 'f', severity: 'blocking',
}

test('a host review is the schema or unavailable', () => {
  const schema = JSON.stringify({ status: 'blocking', findings: [finding], model: CODEX_MODEL })
  const parsed = reviewFromOutput(schema, { host: 'codex', effort: 'high' })
  assert.equal(parsed.status, 'blocking')
  assert.equal(parsed.bound, 'reported')
  assert.equal(parsed.model, CODEX_MODEL)
  assert.deepEqual(parsed.findings, [finding])

  const unproven = reviewFromOutput(JSON.stringify({ status: 'clean', findings: [] }), { host: 'cursor' })
  assert.equal(unproven.status, 'clean')
  assert.equal(unproven.bound, 'unproven')

  const prose = hostReview({ host: 'codex', effort: 'high', output: 'VERDICT: APPROVE\n' })
  assert.equal(prose.status, 'unavailable')
  assert.match(prose.reason, /schema/)

  let spawned = false
  const absent = hostReview({
    host: 'codex', effort: 'high', resolve: () => null, run: () => { spawned = true },
  })
  assert.equal(absent.status, 'unavailable')
  assert.match(absent.reason, /absent/)
  assert.equal(spawned, false)

  const badEffort = hostReview({ host: 'codex', effort: 'low', run: () => { spawned = true } })
  assert.equal(badEffort.status, 'unavailable')
  assert.equal(spawned, false)

  const cursor = hostReview({
    host: 'cursor', resolve: () => null, run: () => { spawned = true },
  })
  assert.equal(cursor.status, 'unavailable')
  assert.match(cursor.reason, /absent/)
  assert.equal(spawned, false)

  const cursorSchema = hostReview({
    host: 'cursor',
    output: JSON.stringify({ status: 'clean', findings: [], model: 'composer-2.5-fast' }),
    run: () => { spawned = true },
  })
  assert.equal(cursorSchema.status, 'clean')
  assert.equal(cursorSchema.bound, 'reported')
  assert.equal(cursorSchema.model, 'composer-2.5-fast')
  assert.equal(spawned, false)

  const pi = hostReview({ host: 'pi', resolve: () => '/usr/bin/pi', run: () => { spawned = true } })
  assert.equal(pi.status, 'unavailable')
  assert.equal(pi.reason, PI_UNMEASURED)
  assert.equal(spawned, false)
})

// Codex review, 2026-09-22 (F3, F4): a result that is not the whole schema is not
// a review, and a host that was never told what to review has not reviewed it.
test('a host result missing the schema is unavailable, and the host is told the target', () => {
  for (const output of [
    { status: 'clean' },
    { status: 'clean', findings: 'none' },
    { status: 'clean', findings: [{ file: 'a.js' }] },
    { status: 'blocking', findings: [] },
    { status: 'clean', findings: [finding] },
  ]) {
    assert.equal(reviewFromOutput(JSON.stringify(output), { host: 'codex' }).status, 'unavailable', JSON.stringify(output))
  }
  assert.equal(reviewFromOutput(JSON.stringify({ status: 'clean', findings: [] }), { host: 'codex' }).status, 'clean')

  let spawned = false
  const noScope = hostReview({ host: 'codex', effort: 'high', repo: '/repo', resolve: () => '/bin/codex', run: () => { spawned = true } })
  assert.equal(noScope.status, 'unavailable')
  assert.match(noScope.reason, /scope/)
  assert.equal(spawned, false)

  const review = { host: 'codex', effort: 'high', repo: '/repo', scope: 'commit abc123', requirements: 'reject empty input', evidence: '{"status":"executed","exitCode":0}' }
  for (const host of ['codex', 'cursor']) {
    let argv = null
    const result = hostReview({
      ...review, host, resolve: () => '/bin/host',
      run: (_, args) => { argv = args; return { status: 0, stdout: JSON.stringify({ status: 'clean', findings: [] }) } },
    })
    assert.equal(result.status, 'clean', host)
    const prompt = argv.at(-1)
    assert.match(prompt, /commit abc123/, host)
    assert.match(prompt, /reject empty input/, host)
    assert.match(prompt, /"exitCode":0/, host)
  }
})

// Codex review, 2026-09-22 (F5): the documented command omitted --repo, so
// following it returned unavailable every time.
test('every documented host-review command names the repository and the scope', () => {
  const skills = ['plugin/skills/quality-policy/SKILL.md', 'plugin/skills/work/SKILL.md']
  let seen = 0
  for (const file of skills) {
    const text = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
    for (const [command] of text.matchAll(/`node \$\{CLAUDE_PLUGIN_ROOT\}\/scripts\/host-review\.mjs[^`]*`/g)) {
      seen += 1
      assert.match(command, /--repo /, `${file}: ${command}`)
      assert.match(command, /--scope /, `${file}: ${command}`)
    }
  }
  assert.ok(seen >= 2, 'both skills document the command')
})
