// ADR-126 T1: a release rests on the landing's own run. Main only fast-forwards to a sha `land/<sha>` has checked, so the
// workflow runs nothing on a push to main, every push to `land/**` runs the full campaign, and release-evidence reads that
// run as one. Measured 2026-10-22: main's push run at a released sha caught nothing the land run had not.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { evaluateRun } from '../scripts/release-evidence.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SHA = 'a'.repeat(40)
const jobs = [{ name: 'selftest (ubuntu-latest)', status: 'completed', conclusion: 'success' }]
const verdict = (event, headBranch, headSha = SHA) =>
  evaluateRun({ status: 'completed', conclusion: 'success', headSha, headBranch, event, jobs }).verdict

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
