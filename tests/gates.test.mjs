import assert from 'node:assert/strict'
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import { delimiter, dirname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const testDir = dirname(fileURLToPath(import.meta.url))
const root = resolve(testDir, '..')
const bin = join(root, 'bin')
const fixture = join(testDir, 'fixtures', 'ok')
const env = { ...process.env, PATH: `${bin}${delimiter}${process.env.PATH ?? ''}` }

function run(command, args, cwd = fixture, input = undefined) {
  return spawnSync(command, args, {
    cwd,
    env,
    input,
    encoding: 'utf8',
    timeout: 30_000,
  })
}

function expectExit(result, status, label) {
  assert.equal(
    result.status,
    status,
    `${label}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
  )
}

test('all bundled gates accept the conforming corpus', () => {
  expectExit(run('adr-lint', ['ADR-001-selftest.md', 'tasks']), 0, 'adr-lint')
  expectExit(run('spec-verify', ['--draft', 'spec-selftest.md']), 0, 'spec draft')
  expectExit(
    run('spec-verify', ['--spec', '--repo', fixture, 'spec-selftest.md']),
    0,
    'spec ready',
  )
  expectExit(run('arch-lint', ['architecture.md']), 0, 'architecture')
  expectExit(run('postmortem-verify', ['postmortem-selftest.md']), 0, 'postmortem')
  expectExit(run('adr-retire-check', ['adr-archive/README.md']), 0, 'archive')
})

test('placeholder and invalid artifacts are rejected', () => {
  expectExit(run('adr-lint', [join(root, 'templates', 'adr-template.md')]), 1, 'ADR template')
  expectExit(run('spec-verify', ['--spec', join(root, 'templates', 'spec-template.md')]), 1, 'spec template')
  expectExit(run('arch-lint', [join(root, 'templates', 'architecture-template.md')]), 1, 'architecture template')
  expectExit(run('postmortem-verify', [join(root, 'templates', 'adr-template.md')]), 1, 'non-postmortem')
  expectExit(run('adr-debt', [join(root, 'templates')]), 1, 'template debt')
})

test('adr-verify executes acceptance and writes digest-bound evidence', () => {
  const temp = mkdtempSync(join(os.tmpdir(), 'quality-harness-verify-'))
  const copy = join(temp, 'ok')
  cpSync(fixture, copy, { recursive: true })
  const result = run('adr-verify', ['tasks/T1-fixture.md', '--cwd', '.'], copy)
  expectExit(result, 0, 'adr-verify')
  const task = readFileSync(join(copy, 'tasks', 'T1-fixture.md'), 'utf8')
  assert.match(task, /exit 0 .* acceptance-sha256:[0-9a-f]{64}/)
})

test('the plugin-local facts hook accepts valid facts and blocks invalid facts', () => {
  const hook = join(root, 'scripts', 'facts-gate-dispatch.sh')
  const valid = JSON.stringify({ tool_input: { file_path: join(fixture, 'spec-selftest.md') } })
  expectExit(run(hook, [], fixture, valid), 0, 'valid hook input')

  const temp = mkdtempSync(join(os.tmpdir(), 'quality-harness-hook-'))
  const invalid = join(temp, 'broken.md')
  writeFileSync(invalid, '# Broken spec\n\n## Facts\n\n## Grill Log\n')
  const payload = JSON.stringify({ tool_input: { file_path: invalid } })
  expectExit(run(hook, [], temp, payload), 2, 'invalid hook input')
})

test('focused false-green regressions remain closed', () => {
  const result = run('python3', [
    join(testDir, 'gate-regressions.py'),
    bin,
    join(root, 'skills', 'postmortem', 'SKILL.md'),
  ])
  expectExit(result, 0, 'gate regressions')
})
