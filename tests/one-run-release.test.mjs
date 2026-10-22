// ADR-126 T1: a release rests on the landing's own run. Main only fast-forwards to a sha `land/<sha>` has checked, so the
// workflow runs nothing on a push to main, every push to `land/**` runs the full campaign, and release-evidence reads that
// run as one. Measured 2026-10-22: main's push run at a released sha caught nothing the land run had not.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { evaluateRun, landingIsFullAt, main } from '../scripts/release-evidence.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SHA = 'a'.repeat(40)
const jobs = [{ name: 'selftest (ubuntu-latest)', status: 'completed', conclusion: 'success' }]
const verdict = (event, headBranch, headSha = SHA, landingIsFull = true) =>
  evaluateRun({ status: 'completed', conclusion: 'success', headSha, headBranch, event, jobs }, { landingIsFull }).verdict

test('a push to land/<sha> is a full campaign, and any other push or a pull request is not', () => {
  assert.equal(verdict('push', `land/${SHA}`), 'success', "the landing's own run")
  assert.equal(verdict('workflow_dispatch', 'main'), 'success', 'a dispatch is still a full campaign')
  // DIRTY twins: each of these may have reused cached verdicts.
  assert.equal(verdict('push', 'main'), 'cached')
  assert.equal(verdict('push', `land/${'b'.repeat(40)}`), 'cached', "another sha's landing branch")
  assert.equal(verdict('push', 'land/short'), 'cached')
  assert.equal(verdict('pull_request', `land/${SHA}`), 'cached', 'a pull request reuses the cache')
  assert.equal(verdict('push', undefined), 'cached', 'a run that does not name its branch')
})

test('the workflow runs on land pushes, never on a push to main, and every land push is a full campaign', () => {
  const workflow = readFileSync(path.join(repoRoot, '.github', 'workflows', 'selftest.yml'), 'utf8')
  const push = /^ {2}push:\n(?: {4}#[^\n]*\n)* {4}branches: (\[[^\]]*\])/m.exec(workflow)
  assert.ok(push, 'the push trigger names its branches')
  assert.deepEqual(JSON.parse(push[1].replace(/'/g, '"')), ['land/**'])
  const full = /QUALITY_HARNESS_FULL_CAMPAIGN: \$\{\{ (.+) \}\}/.exec(workflow)
  assert.ok(full, 'the full-campaign switch is an expression')
  assert.match(full[1], /github\.event_name == 'workflow_dispatch'/)
  assert.match(full[1], /startsWith\(github\.ref, 'refs\/heads\/land\/'\)/)
})

// The Codex review of v3.8.52..2ad118d0: a landing run is full only where the workflow at its own sha runs land pushes
// full. A landing from before ADR-126 reused the cache, and its run must not clear a release.
test('a landing run is full only where the workflow at its sha runs land pushes full', () => {
  assert.equal(verdict('push', `land/${SHA}`, SHA, false), 'cached', 'a landing the workflow ran cached')
  const answering = text => (cmd, args) => {
    if (text === null) throw new Error('fatal: path does not exist')
    assert.deepEqual([cmd, ...args], ['git', 'show', `${SHA}:.github/workflows/selftest.yml`])
    return text
  }
  assert.equal(landingIsFullAt(SHA, answering("          QUALITY_HARNESS_FULL_CAMPAIGN: ${{ github.event_name == 'workflow_dispatch' || (github.event_name == 'push' && startsWith(github.ref, 'refs/heads/land/')) }}\n")), true)
  assert.equal(landingIsFullAt(SHA, answering("          QUALITY_HARNESS_FULL_CAMPAIGN: ${{ github.event_name == 'workflow_dispatch' }}\n")), false, 'the workflow before ADR-126')
  assert.equal(landingIsFullAt(SHA, answering(null)), false, 'a workflow that cannot be read')
  // Through main: the same green landing run clears only when its workflow says full.
  const run = { status: 'completed', conclusion: 'success', headSha: SHA, headBranch: `land/${SHA}`, event: 'push', jobs }
  const seams = full => ({ fetch: () => run, declared: () => ['selftest (ubuntu-latest)'], full: () => full, forge: null,
    outside: () => ({ verdict: 'success', reason: 'attested', tag: 'v1.0.0' }), review: () => ({ verdict: 'success', reason: 'reviewed' }), log: () => {} })
  assert.equal(main([SHA], seams(true)), 0)
  assert.equal(main([SHA], seams(false)), 2)
})
