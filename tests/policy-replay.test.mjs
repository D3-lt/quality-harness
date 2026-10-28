import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { createReplayCorpus, registeredHooks, registeredProgram } from '../scripts/policy-replay.mjs'
import { remove } from './helpers/remove.mjs'

test('policy replay follows every matching registration and excludes unmatched tools', () => {
  const registry = JSON.parse(readFileSync(new URL('../plugin/hooks/hooks.json', import.meta.url), 'utf8'))
  assert.equal(registeredHooks(registry, 'PostToolUse', 'Write').length, 3)
  assert.equal(registeredHooks(registry, 'PostToolUse', 'mcp__mrw__mrw_write').length, 1)
  assert.equal(registeredHooks(registry, 'SessionStart').length, 2)
  assert.equal(registeredHooks(registry, 'PreToolUse', 'Read').length, 0)
  assert.equal(registeredHooks(registry, 'NotAnEvent').length, 0)
})

test('the frozen replay corpus has a real check that passes and fails without a project suite', t => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'qh-policy-fixture-'))
  t.after(() => remove(directory))
  const marker = path.join(directory, 'checks.jsonl')
  const env = { ...process.env, HOME: path.join(directory, 'home'), USERPROFILE: path.join(directory, 'home'), QH_CHECK_RECEIPTS: marker }
  const repo = createReplayCorpus(directory, { governed: true, env })
  const run = () => spawnSync(process.execPath, ['check.mjs'], { cwd: repo, env, encoding: 'utf8', timeout: 10_000, windowsHide: true })
  const pass = run()
  assert.equal(pass.status, 0, pass.stdout + pass.stderr)
  writeFileSync(path.join(repo, 'src', 'value.cjs'), 'module.exports = ;\n')
  const fail = run()
  assert.equal(fail.status, 1, fail.stdout + fail.stderr)
  assert.match(fail.stdout + fail.stderr, /SyntaxError/)
  assert.deepEqual(readFileSync(marker, 'utf8').trim().split('\n').map(line => JSON.parse(line).phase), ['start', 'end', 'start', 'end'])
  const lint = spawnSync('python3', [fileURLToPath(new URL('../plugin/bin/adr-lint', import.meta.url)),
    path.join(repo, 'docs', 'adr', 'ADR-001-export-integers.md')], { cwd: repo, env, encoding: 'utf8', timeout: 20_000, windowsHide: true })
  assert.equal(lint.status, 0, lint.stdout + lint.stderr)
  assert.doesNotMatch(lint.stdout, /advice:/)
})

test('registered shell measurements use the Git Bash resolver on Windows and preserve POSIX sh', () => {
  const directory = path.win32.join('C:', 'Program Files', 'Git', 'bin')
  const selected = path.win32.join(directory, 'bash.exe')
  const env = { PATH: [path.win32.join('C:', 'Windows', 'System32'), directory].join(';') }
  assert.equal(registeredProgram('sh', { platform: 'win32', env, exists: file => file === selected }), selected)
  assert.equal(registeredProgram('sh', { platform: 'darwin', env }), 'sh')
  assert.equal(registeredProgram('node', { platform: 'win32', env }), process.execPath)
  assert.equal(registeredProgram('missing', { platform: 'win32', env }), 'missing')
})
