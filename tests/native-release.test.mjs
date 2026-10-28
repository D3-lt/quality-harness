import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { outsideRunEvidence } from '../scripts/release-evidence.mjs'
import { remove } from './helpers/remove.mjs'

function repository(t, changed) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'qh native release '))
  t.after(() => remove(root))
  const git = (...args) => execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid',
    '-c', 'core.autocrlf=false', ...args], { cwd: root, encoding: 'utf8', timeout: 10_000, windowsHide: true })
  git('init', '-q')
  const put = (file, text) => { mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); writeFileSync(path.join(root, file), text) }
  put('core/hooks/policy.go', 'package hooks\nconst policy = 1\n')
  put('core/go.mod', 'module fixture\ngo 1.24\n')
  put('scripts/build-core.mjs', 'export const flags = 1\n')
  put('plugin/scripts/reader.mjs', 'export const reader = 1\n')
  git('add', '-A')
  git('commit', '-qm', 'baseline')
  git('tag', 'v1.0.0')
  put(changed, 'changed\n')
  git('add', '-A')
  git('commit', '-qm', 'candidate')
  const sha = git('rev-parse', 'HEAD').trim()
  const reports = path.join(root, 'docs', 'corpus-reports')
  mkdirSync(reports, { recursive: true })
  const exec = (bin, args, options) => execFileSync(bin, args, { ...options, cwd: root, windowsHide: true })
  return outsideRunEvidence(sha, exec, reports)
}

test('a native-only production change requires fresh outside evidence', t => {
  for (const file of ['core/hooks/policy.go', 'core/hooks/policy-ą.go', 'core/hooks/policy space.go', 'core/go.mod', 'core/go.sum',
    'core/hooks/template.dat', 'core/native.s', 'core/native.syso', 'core/README.md',
    'scripts/build-core.mjs', 'plugin/scripts/core-assets.mjs', 'plugin/.claude-plugin/plugin.json', '.github/workflows/selftest.yml']) {
    const answer = repository(t, file)
    assert.equal(answer.verdict, 'unproven', file + ': ' + answer.reason)
    assert.equal(answer.kind, 'missing', file + ': ' + answer.reason)
  }
})

test('native tests, build outputs and documentation outside core do not require an outside reader run', t => {
  for (const file of ['core/hooks/policy_test.go', 'core/bin/qh', 'docs/notes.md']) {
    const answer = repository(t, file)
    assert.equal(answer.verdict, 'not-required', file + ': ' + answer.reason)
  }
})

test('every installed reader directory still requires outside evidence', t => {
  for (const file of ['plugin/scripts/reader.mjs', 'plugin/bin/gate', 'plugin/lib/record.py', 'plugin/hooks/hooks.json']) {
    const answer = repository(t, file)
    assert.equal(answer.verdict, 'unproven', file + ': ' + answer.reason)
    assert.equal(answer.kind, 'missing', file + ': ' + answer.reason)
  }
})
