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
  const parsed = reviewFromOutput(schema, { host: 'codex', model: CODEX_MODEL, effort: 'high' })
  assert.equal(parsed.status, 'blocking')
  assert.equal(parsed.bound, 'pinned')
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
  assert.equal(cursorSchema.bound, 'unproven')
  assert.equal(cursorSchema.model, 'composer-2.5-fast')
  assert.equal(spawned, false)

  const pi = hostReview({ host: 'pi', resolve: () => '/usr/bin/pi', run: () => { spawned = true } })
  assert.equal(pi.status, 'unavailable')
  assert.equal(pi.reason, PI_UNMEASURED)
  assert.equal(spawned, false)
})

// ADR-119 T2: runs pinned to gpt-6.1-sol were recorded as "gpt-6", "GPT-6 (Codex)" and "Codex", because the model the
// reviewer printed won over the one the launcher passed with `-m`. The pin is the model; a printed one that differs is kept.
test('a review row records the model the launcher pinned, and a printed model that differs as disagrees', () => {
  const said = model => JSON.stringify({ status: 'clean', findings: [], ...(model === undefined ? {} : { model }) })
  // DIRTY: the reviewer names another model than the pin.
  const differs = reviewFromOutput(said('GPT-6 (Codex)'), { host: 'codex', model: CODEX_MODEL, effort: 'high' })
  assert.deepEqual([differs.model, differs.bound, differs.reportedModel], [CODEX_MODEL, 'disagrees', 'GPT-6 (Codex)'])
  // Through the launcher's own Codex path, which always pins CODEX_MODEL.
  const launched = hostReview({ host: 'codex', effort: 'high', output: said('gpt-6') })
  assert.deepEqual([launched.model, launched.bound, launched.reportedModel], [CODEX_MODEL, 'disagrees', 'gpt-6'])
  // CLEAN: it names the pin, or nothing; either way the row says what was pinned and keeps no reportedModel.
  for (const printed of [CODEX_MODEL, ` ${CODEX_MODEL} `, undefined, '']) {
    const agrees = reviewFromOutput(said(printed), { host: 'codex', model: CODEX_MODEL, effort: 'high' })
    assert.deepEqual([agrees.model, agrees.bound], [CODEX_MODEL, 'pinned'], JSON.stringify(printed))
    assert.equal('reportedModel' in agrees, false, JSON.stringify(printed))
  }
  // A review that did not finish stays unproven, pinned or not.
  const notRun = reviewFromOutput('VERDICT: APPROVE', { host: 'codex', model: CODEX_MODEL, effort: 'high' })
  assert.deepEqual([notRun.status, notRun.model, notRun.bound], ['unavailable', CODEX_MODEL, 'unproven'])
})

test('a host with no pinned model records what it printed, as unproven', () => {
  const said = model => JSON.stringify({ status: 'clean', findings: [], ...(model === undefined ? {} : { model }) })
  // Cursor with no --model: what it printed is all there is, and nothing proves it.
  const printed = hostReview({ host: 'cursor', output: said('composer-2.5-fast') })
  assert.deepEqual([printed.model, printed.bound], ['composer-2.5-fast', 'unproven'])
  assert.equal('reportedModel' in printed, false)
  const silent = hostReview({ host: 'cursor', output: said(undefined) })
  assert.deepEqual([silent.model, silent.bound], [null, 'unproven'])
  // A blank --model is not a pin.
  const blank = hostReview({ host: 'cursor', model: '  ', output: said('composer-2.5-fast') })
  assert.deepEqual([blank.model, blank.bound], ['composer-2.5-fast', 'unproven'])
  // DIRTY twin: the same output under a pin is a disagreement, and the pin is the model.
  const pinned = hostReview({ host: 'cursor', model: 'composer-2.5', output: said('composer-2.5-fast') })
  assert.deepEqual([pinned.model, pinned.bound, pinned.reportedModel], ['composer-2.5', 'disagrees', 'composer-2.5-fast'])
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
    assert.match(prompt, /"\/repo"/, host)
    assert.match(prompt, /commit abc123/, host)
    assert.match(prompt, /reject empty input/, host)
    assert.match(prompt, /"exitCode":0/, host)
  }
})

// Codex review, 2026-09-22 (F5): the documented command omitted --repo, so
// following it returned unavailable every time.
test('every documented host-review command names the repository and the scope', () => {
  const skills = ['plugin/skills/quality-policy/SKILL.md', 'plugin/skills/work/SKILL.md']
  for (const file of skills) {
    const text = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
    let seen = 0
    for (const [command] of text.matchAll(/`node \$\{CLAUDE_PLUGIN_ROOT\}\/scripts\/host-review\.mjs[^`]*`/g)) {
      seen += 1
      assert.match(command, /--repo /, `${file}: ${command}`)
      assert.match(command, /--scope /, `${file}: ${command}`)
    }
    assert.ok(seen >= 1, `${file} documents the command`)
  }
})
