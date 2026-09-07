import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pluginRoot = path.join(repoRoot, 'plugin')

function scratch(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'qh-hook-work-'))
  t.after(() => rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }))
  return root
}

function run(argv, cwd, env, input) {
  const result = spawnSync(argv[0], argv.slice(1), {
    cwd, env: { ...process.env, ...env }, input, encoding: 'utf8', timeout: 60_000,
  })
  assert.ifError(result.error)
  assert.equal(result.status, 0, result.stderr)
  return result
}

test('edits do not launch project-wide compilers that remain available explicitly', t => {
  const root = scratch(t)
  const bin = path.join(root, 'bin')
  mkdirSync(bin)
  for (const tool of ['npx', 'cargo', 'go']) {
    writeFileSync(path.join(bin, tool), '#!/usr/bin/env bash\nprintf "PROJECT_COMPILER_RAN\\n"\n', { mode: 0o755 })
  }
  const env = { PATH: [bin, process.env.PATH].join(path.delimiter), TMPDIR: root, TEMP: root, TMP: root }
  // Prove the stand-ins are reachable; an unavailable compiler cannot prove it was skipped.
  for (const tool of ['npx', 'cargo', 'go']) {
    assert.match(run(['bash', '-c', '"$1" --version', 'compiler-probe', tool], root, env).stdout,
      /PROJECT_COMPILER_RAN/)
  }
  for (const [extension, manifest] of [['ts', 'tsconfig.json'], ['tsx', 'tsconfig.json'],
    ['rs', 'Cargo.toml'], ['go', 'go.mod']]) {
    const project = path.join(root, extension)
    mkdirSync(project)
    writeFileSync(path.join(project, manifest), '{}\n')
    const file = path.join(project, 'changed.' + extension)
    writeFileSync(file, 'edited source\n')
    const got = run([process.execPath, path.join(pluginRoot, 'scripts', 'run-shell-hook.mjs'),
      'post-edit-check.sh'], project, env, JSON.stringify({
      hook_event_name: 'PostToolUse', tool_name: 'Edit', tool_input: { file_path: file },
    }))
    assert.equal(got.stdout + got.stderr, '', extension + ' edit must leave project checks to explicit verification')
  }
})

test('artifact passes check equivalent ADR inputs once and check fresh changes on the next pass', t => {
  const root = scratch(t)
  const project = path.join(root, 'project with spaces')
  const fixture = path.join(repoRoot, 'tests', 'fixtures', 'ok')
  cpSync(fixture, project, { recursive: true })
  const taskDir = path.join(project, 'tasks')
  const first = path.join(taskDir, 'T1-fixture.md')
  const second = path.join(taskDir, 'T2-fixture.md')
  writeFileSync(second, readFileSync(first, 'utf8').replaceAll('T1-fixture', 'T2-fixture'))
  const index = path.join(taskDir, 'README.md')
  writeFileSync(index, readFileSync(index, 'utf8') +
    '| 2 | [T2-fixture](T2-fixture.md) | S | none | pending |\n')
  const temp = path.join(root, 'tmp')
  const spy = path.join(root, 'spy')
  mkdirSync(temp)
  mkdirSync(spy)
  const log = path.join(root, 'gate-runs.jsonl')
  writeFileSync(path.join(spy, 'sitecustomize.py'), [
    'import json, os, sys',
    'with open(os.environ["QH_TEST_GATE_LOG"], "a", encoding="utf-8") as log:',
    '    log.write(json.dumps(sys.argv) + "\\n")',
    '',
  ].join('\n'))
  const env = {
    CLAUDE_PLUGIN_ROOT: pluginRoot, TMPDIR: temp, TEMP: temp, TMP: temp,
    PYTHONPATH: [spy, process.env.PYTHONPATH].filter(Boolean).join(path.delimiter),
    PYTHONDONTWRITEBYTECODE: '1', QH_TEST_GATE_LOG: log,
  }
  const check = paths => {
    writeFileSync(log, '')
    const code = 'const {runArtifactGates}=await import(' +
      JSON.stringify(pathToFileURL(path.join(pluginRoot, 'scripts', 'lifecycle.mjs')).href) +
      '); process.stdout.write(JSON.stringify(runArtifactGates(' +
      JSON.stringify(paths) + ',' + JSON.stringify(project) + ')));'
    const got = run([process.execPath, '--input-type=module', '-e', code], project, env)
    const calls = readFileSync(log, 'utf8').trim().split('\n').filter(Boolean)
      .map(line => JSON.parse(line)).filter(args => /[\\/]adr-lint$/.test(args[0]))
    assert.equal(readdirSync(temp).filter(name => name.startsWith('quality-harness-gates-')).length, 0,
      'the pass must release its temporary deduplication state')
    return { finding: JSON.parse(got.stdout), calls }
  }

  const healthy = check([first, second])
  assert.equal(healthy.finding, null, healthy.finding)
  assert.equal(healthy.calls.length, 1, 'two tasks with identical resolved ADR inputs need one lint')

  // A new boundary must recheck, and a finding must survive deduplication.
  writeFileSync(second, readFileSync(second, 'utf8').replace('## Acceptance', '## Missing acceptance'))
  const broken = check([first, second])
  assert.match(broken.finding, /Acceptance/)
  assert.equal(broken.calls.length, 1)
  writeFileSync(second, readFileSync(second, 'utf8').replace('## Missing acceptance', '## Acceptance'))
  assert.equal(check([first, second]).finding, null)

  // Equal basenames in different directories are different gate inputs.
  const other = path.join(root, 'other project')
  cpSync(fixture, other, { recursive: true })
  const distinct = check([first, path.join(other, 'tasks', 'T1-fixture.md')])
  assert.equal(distinct.finding, null, distinct.finding)
  assert.equal(distinct.calls.length, 2, 'different owning ADRs must never share a result')
})

test('already-shown edit context skips discovery without hiding a later first match', t => {
  const root = scratch(t)
  const project = path.join(root, 'project')
  const docs = path.join(project, 'docs', 'adr')
  const temp = path.join(root, 'tmp')
  mkdirSync(docs, { recursive: true })
  mkdirSync(temp)
  run(['git', 'init', '-q', project], root)
  const first = path.join(project, 'first.js')
  const later = path.join(project, 'later.js')
  writeFileSync(first, 'export const a = 1\n')
  writeFileSync(later, 'export const b = 1\n')
  const record = path.join(docs, 'ADR-001-context.md')
  const recordFor = file => '# ADR-001: Retain the contract\n\n**Status:** Accepted\n**Governs:** ' + file + '\n'
  writeFileSync(record, recordFor('first.js'))
  const trace = path.join(root, 'git.trace')
  const context = (file, session = 'same-session') => {
    writeFileSync(trace, '')
    const got = run([process.execPath, path.join(pluginRoot, 'scripts', 'lifecycle.mjs')],
      project, { CLAUDE_PLUGIN_ROOT: pluginRoot, TMPDIR: temp, TEMP: temp, TMP: temp, GIT_TRACE: trace },
      JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Edit', cwd: project,
        session_id: session, tool_input: { file_path: file } }))
    return { text: got.stdout, git: readFileSync(trace, 'utf8') }
  }
  const initial = context(first)
  assert.match(initial.text, /Retain the contract/)
  assert.match(initial.git, /built-in: git/, 'the control must actually discover the repository')
  const repeated = context(first)
  assert.equal(repeated.text, '')
  assert.equal(repeated.git, '', 'already-emitted context must not rebuild the corpus')
  assert.match(context(first, 'new-session').text, /Retain the contract/, 'a new session gets its context')

  assert.equal(context(later).text, '', 'unmatched files have no context yet')
  writeFileSync(record, recordFor('later.js'))
  assert.match(context(later).text, /Retain the contract/, 'a no-match must not consume the first mention')
})
