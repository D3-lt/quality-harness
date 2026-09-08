import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
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
  const directory = path.join(root, 'project')
  run(['git', 'init', '-q', directory], root)
  // Use Git's root spelling; a Windows temp alias is not part of this workload test.
  const project = path.resolve(run(['git', 'rev-parse', '--show-toplevel'], directory).stdout.trim())
  const docs = path.join(project, 'docs', 'adr')
  const temp = path.join(root, 'tmp')
  mkdirSync(docs, { recursive: true })
  mkdirSync(temp)
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
    return { text: got.stdout, git: readFileSync(trace, 'utf8'), stderr: got.stderr }
  }
  const initial = context(first)
  assert.match(initial.text, /Retain the contract/, JSON.stringify({ project, ...initial }))

  assert.match(initial.git, /built-in: git/, 'the control must actually discover the repository')
  const repeated = context(first)
  assert.equal(repeated.text, '')
  assert.equal(repeated.git, '', 'already-emitted context must not rebuild the corpus')
  assert.match(context(first, 'new-session').text, /Retain the contract/, 'a new session gets its context')

  assert.equal(context(later).text, '', 'unmatched files have no context yet')
  writeFileSync(record, recordFor('later.js'))
  assert.match(context(later).text, /Retain the contract/, 'a no-match must not consume the first mention')
})

test('corpus scans read shared inputs once and see fresh changes on the next scan', t => {
  const root = scratch(t)
  const project = path.join(root, 'project')
  const docs = path.join(project, 'docs', 'adr')
  const tasks = path.join(docs, 'tasks')
  mkdirSync(tasks, { recursive: true })
  const record = (id, status = 'Accepted') =>
    '# ' + id + ': Probe\n\n**Status:** ' + status + '\n\n## Decision\nKeep the contract.\n'
  const task = (id, affected) => '# Task ' + id + ': Probe\n\n## Affected Files\n' +
    '| File | Change |\n| --- | --- |\n| ' + affected + ' | modify |\n'
  writeFileSync(path.join(docs, 'ADR-001.md'), record('ADR-001'))
  writeFileSync(path.join(docs, 'ADR-002.md'), record('ADR-002'))
  writeFileSync(path.join(docs, 'ADR-003.md'), record('ADR-003', 'Unknown'))
  writeFileSync(path.join(docs, '2026-01-01-dated.md'), record('Dated decision'))
  const first = path.join(tasks, 'T1-first.md')
  const second = path.join(tasks, 'T2-second.md')
  writeFileSync(first, task('ADR-001-T1', 'src/first.js'))
  writeFileSync(second, task('ADR-002-T2', 'src/second.js'))
  const probe = async (moduleUrl, project, first, second, replacement, added) => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const { syncBuiltinESMExports } = await import('node:module')
    const counts = { files: {}, directories: {} }
    for (const [method, bucket] of [['readFileSync', 'files'], ['readdirSync', 'directories']]) {
      const original = fs.default[method]
      fs.default[method] = function(file, ...args) {
        const relative = path.relative(project, String(file))
        if (!relative.startsWith('..') && !path.isAbsolute(relative)) {
          counts[bucket][relative] = (counts[bucket][relative] ?? 0) + 1
        }
        return original.call(this, file, ...args)
      }
    }
    syncBuiltinESMExports()
    const { adrCorpus } = await import(moduleUrl)
    const scan = () => {
      counts.files = {}
      counts.directories = {}
      const corpus = adrCorpus(project, { tracked: null })
      return {
        counts: structuredClone(counts),
        records: corpus.map(entry => ({
          file: path.basename(entry.file), governs: entry.governs,
          tasks: entry.taskFiles.map(file => path.basename(file)),
        })),
        unreadable: corpus.unreadable.map(entry => path.basename(entry.file)),
      }
    }
    const before = scan()
    fs.writeFileSync(first, replacement)
    fs.rmSync(second)
    fs.writeFileSync(path.join(path.dirname(second), 'T3-added.md'), added)
    const after = scan()
    process.stdout.write(JSON.stringify({ before, after }))
  }
  const code = '(' + probe.toString() + ')(...' + JSON.stringify([
    pathToFileURL(path.join(pluginRoot, 'scripts', 'lifecycle.mjs')).href,
    project, first, second,
    task('ADR-001-T1', 'src/changed.js'), task('ADR-002-T3', 'src/added.js'),
  ]) + ')'
  const { before, after } = JSON.parse(run([process.execPath, '--input-type=module', '-e', code], project).stdout)
  const entry = (scan, name) => scan.records.find(record => record.file === name)
  assert.deepEqual(entry(before, 'ADR-001.md').governs, ['src/first.js'])
  assert.deepEqual(entry(before, 'ADR-002.md').governs, ['src/second.js'])
  assert.deepEqual(entry(before, '2026-01-01-dated.md').tasks, [], 'shared tasks need explicit ownership')
  assert.deepEqual(before.unreadable, ['ADR-003.md'], 'unclassified records remain visible')
  assert.deepEqual(entry(after, 'ADR-001.md').governs, ['src/changed.js'], 'a new scan sees edited task contents')
  assert.deepEqual(entry(after, 'ADR-002.md').governs, ['src/added.js'], 'a new scan sees additions and deletions')
  assert.deepEqual(entry(after, 'ADR-002.md').tasks, ['T3-added.md'])
  for (const scan of [before, after]) {
    assert.ok(Object.keys(scan.counts.files).length >= 6, 'the probe must observe actual file reads')
    assert.ok(Object.keys(scan.counts.directories).length >= 3, 'the probe must observe actual directory reads')
    assert.equal(Math.max(...Object.values(scan.counts.files)), 1, 'each file is read at most once per scan')
    assert.equal(Math.max(...Object.values(scan.counts.directories)), 1, 'each directory is listed at most once per scan')
  }
})

test('artifact batches use one runner and keep findings on both sides of a timed-out file', t => {
  const root = realpathSync(scratch(t))
  const scripts = path.join(root, 'plugin', 'scripts')
  mkdirSync(scripts, { recursive: true })
  cpSync(path.join(pluginRoot, 'scripts', 'run-shell-hook.mjs'), path.join(scripts, 'run-shell-hook.mjs'))
  writeFileSync(path.join(scripts, 'facts-gate-dispatch.sh'), [
    '#!/bin/bash',
    'if [ "${QH_TEST_BULK-}" = 1 ]; then printf "%600000s\\n" "" >&2; fi',
    'if [ "${QH_TEST_FLOOD-}" = 1 ]; then case "$1" in *first.ts) printf "%4000000s\\n" "" >&2; sleep 20 ;; esac; fi',
    'case "$1" in',
    '  *slow.ts) [ -n "${QH_TEST_BULK-}${QH_TEST_FLOOD-}" ] || sleep 20 ;;',
    '  *) printf "CHECKED %s\\n" "$1" >&2 ;;',
    'esac',
    '',
  ].join('\n'))
  const files = ['first.ts', 'slow.ts', 'last.ts'].map(name => path.join(root, name))
  const probe = async (moduleUrl, files, root) => {
    const cp = await import('node:child_process')
    const { syncBuiltinESMExports } = await import('node:module')
    const original = cp.default.spawnSync
    let runners = 0
    cp.default.spawnSync = function(command, args, options) {
      if (command === process.execPath && args[0]?.endsWith('run-shell-hook.mjs')) runners++
      return original.call(this, command, args, options)
    }
    syncBuiltinESMExports()
    const { runArtifactGates } = await import(moduleUrl)
    const finding = runArtifactGates(files, root, 20_000)
    process.stdout.write(JSON.stringify(process.env.QH_TEST_BULK === '1' || process.env.QH_TEST_FLOOD === '1'
      ? { length: finding?.length, last: /CHECKED .*last\.ts/.test(finding),
        unchecked: /may be unchecked/.test(finding), limited: /output limit/.test(finding), runners,
        stopped: /batch stopped after unconfirmed process cleanup/.test(finding),
        remaining: finding?.split('Unchecked artifacts:\n')[1] ?? '' }
      : { finding, runners }))
  }
  const code = '(' + probe.toString() + ')(...' + JSON.stringify([
    pathToFileURL(path.join(pluginRoot, 'scripts', 'lifecycle.mjs')).href, files, root,
  ]) + ')'
  const result = JSON.parse(run([process.execPath, '--input-type=module', '-e', code], root, {
    CLAUDE_PLUGIN_ROOT: path.dirname(scripts), QUALITY_HARNESS_SHELL_TIMEOUT_MS: '2000',
  }).stdout)
  assert.equal(typeof result.finding, 'string', JSON.stringify(result))
  assert.match(result.finding, /CHECKED .*first\.ts/)
  assert.match(result.finding, /timed out after 2000ms/)
  assert.match(result.finding, /slow\.ts/)
  // CI 34199724037 observed unconfirmed Git Bash cleanup on Windows, a known
  // taskkill limitation (timeout-tree.test.mjs). In that case continuing would
  // be wrong. The simulated close-event test below proves continuation on every
  // host; this real-shell test asserts whichever cleanup outcome was observed.
  if (process.platform === 'win32' && /cleanup could not be confirmed/.test(result.finding)) {
    assert.doesNotMatch(result.finding, /CHECKED .*last\.ts/)
    assert.match(result.finding, /batch stopped after unconfirmed process cleanup/)
    const remaining = result.finding.split('Unchecked artifacts:\n')[1]
    assert.equal(remaining?.replaceAll('\\', '/'), files.slice(1).join('\n').replaceAll('\\', '/'))
  } else {
    assert.match(result.finding, /CHECKED .*last\.ts/, 'confirmed cleanup must preserve later findings')
    assert.ok(result.finding.indexOf('budget, not a finding') < result.finding.lastIndexOf('CHECKED'),
      'timeout guidance must precede the later real finding it does not describe')
  }
  assert.match(result.finding, /budget, not a finding/)
  assert.equal(result.runners, 1, 'one boundary needs one Node runner')
  const bulk = JSON.parse(run([process.execPath, '--input-type=module', '-e', code], root, {
    CLAUDE_PLUGIN_ROOT: path.dirname(scripts), QH_TEST_BULK: '1',
  }).stdout)
  assert.equal(bulk.last, true, 'large combined output retains the last finding')
  assert.equal(bulk.unchecked, false, 'combined output must not kill a completed batch')
  assert.ok(bulk.length > 1024 * 1024, 'exercise more than the old single-file output limit')
  assert.equal(bulk.runners, 1)
  const flood = JSON.parse(run([process.execPath, '--input-type=module', '-e', code], root, {
    CLAUDE_PLUGIN_ROOT: path.dirname(scripts), QH_TEST_FLOOD: '1',
  }).stdout)
  if (process.platform === 'win32' && flood.stopped) {
    assert.equal(flood.last, false, 'unconfirmed cleanup must stop before the last artifact')
    assert.equal(flood.remaining.trim().replaceAll('\\', '/'), files.join('\n').replaceAll('\\', '/'))
  } else {
    assert.equal(flood.last, true, 'a noisy file with confirmed cleanup must preserve later findings')
    assert.equal(flood.stopped, false)
  }
  assert.equal(flood.limited, true, 'an output limit leaves the noisy artifact explicitly unchecked')
  assert.equal(flood.unchecked, false, 'only the noisy shell is stopped, not the batch runner')
})

test('historical archive discovery uses one scoped Git query and preserves nearest literal paths', t => {
  const root = scratch(t)
  const project = path.join(root, 'project')
  run(['git', 'init', '-q', project], root)
  const scripts = path.join(root, 'plugin', 'scripts')
  const bin = path.join(root, 'plugin', 'bin')
  mkdirSync(scripts, { recursive: true })
  mkdirSync(bin)
  cpSync(path.join(pluginRoot, 'scripts', 'facts-gate-dispatch.sh'), path.join(scripts, 'facts-gate-dispatch.sh'))
  writeFileSync(path.join(bin, 'adr-retire-check'), '#!/bin/bash\nprintf "CATALOG %s\\n" "$1"\nexit 1\n', { mode: 0o755 })
  const archive = path.join(project, 'docs', 'archive [x]')
  const nested = path.join(archive, 'nested space')
  for (const dir of [archive, nested]) {
    mkdirSync(dir, { recursive: true })
    writeFileSync(path.join(dir, 'README.md'), '**Lifecycle:** Frozen historical ADR records\n')
  }
  const sourceDir = path.join(project, 'src', 'deep', 'nested')
  mkdirSync(sourceDir, { recursive: true })
  const source = path.join(sourceDir, 'changed.ts')
  writeFileSync(source, 'source\n')
  writeFileSync(path.join(sourceDir, 'README.md'), '> **Lifecycle:** Frozen historical ADR records\n')
  run(['git', 'add', '.'], project)
  run(['git', '-c', 'user.name=Harness Test', '-c', 'user.email=harness@example.invalid',
    'commit', '-qm', 'archive fixture'], project)
  rmSync(archive, { recursive: true })
  const trace = path.join(root, 'git.trace')
  const check = file => {
    writeFileSync(trace, '')
    const result = run(['bash', path.join(scripts, 'facts-gate-dispatch.sh').replaceAll('\\', '/'),
      file.replaceAll('\\', '/')], project, { GIT_TRACE: trace })
    return { output: result.stderr + result.stdout, trace: readFileSync(trace, 'utf8') }
  }
  assert.match(check(path.join(nested, 'record.md')).output, /CATALOG .*archive \[x\]\/nested space\/README\.md/)
  assert.match(check(nested).output, /CATALOG .*archive \[x\]\/nested space\/README\.md/,
    'a deleted directory is governed by its own historical catalog')
  assert.match(check(path.join(archive, 'record.md')).output, /CATALOG .*archive \[x\]\/README\.md/)
  const ordinary = check(source)
  assert.equal(ordinary.output, '', 'unrelated source must not acquire archive findings')
  const commands = ordinary.trace.split('\n').filter(line => line.includes('built-in: git'))
  assert.ok(commands.length > 0, 'the probe must observe actual Git work')
  assert.equal(commands.length, 2, 'repository discovery plus one scoped history query')
})

test('artifact batch input and exhausted deadlines report unchecked work', async t => {
  const { runArtifactBatch } = await import('../plugin/scripts/run-shell-hook.mjs')
  let stderr = ''
  t.mock.method(process.stderr, 'write', chunk => { stderr += chunk; return true })
  const valid = { paths: ['unchecked.md', 'also-unchecked.md'].map(name => path.join(os.tmpdir(), name)), deadline: Date.now() - 1,
    windowMs: 1000, timeoutMs: 100 }
  for (const value of [null, {}, { ...valid, paths: [] }, { ...valid, paths: ['relative.md'] },
    { ...valid, paths: ['bad\0path'] }, { ...valid, deadline: null }, { ...valid, timeoutMs: 0 }]) {
    stderr = ''
    assert.equal(await runArtifactBatch(JSON.stringify(value)), 2)
    assert.match(stderr, /invalid artifact batch; the gates did not run/)
  }
  stderr = ''
  assert.equal(await runArtifactBatch('not JSON'), 2)
  assert.match(stderr, /invalid artifact batch/)
  stderr = ''
  assert.equal(await runArtifactBatch(JSON.stringify(valid)), 0)
  assert.match(stderr, /window was exhausted before .*unchecked\.md was gated/)
  assert.match(stderr, /also-unchecked\.md/, 'every artifact skipped by the deadline is identified')
  const { runArtifactGates } = await import('../plugin/scripts/lifecycle.mjs')
  assert.match(runArtifactGates(valid.paths, os.tmpdir(), 500), /also-unchecked\.md/,
    'a deadline exhausted before runner startup also identifies every unchecked artifact')
})

test('an output limit terminates the noisy child and reports cleanup separately from timeout', async () => {
  const { runWithTimeout, terminateProcessTree } = await import('../plugin/scripts/run-shell-hook.mjs')
  let run
  try {
    run = await runWithTimeout(process.execPath, ['-e',
      "process.stdout.write('x'.repeat(10000)); setInterval(() => {}, 1000)"], {
      timeoutMs: 5000, maxOutputBytes: 1024,
    })
    assert.equal(run.outputLimitExceeded, true)
    assert.equal(run.timedOut, false, 'an output limit is not a time limit')
    assert.equal(run.killIssued, true)
    assert.equal(run.cleanupConfirmed, true)
    assert.ok(Buffer.byteLength(run.stdout + run.stderr) <= 1024)
  } finally {
    // A failing mutation must not leave its synthetic child on the user's machine.
    if (run?.pid && !run.cleanupConfirmed) terminateProcessTree({ pid: run.pid }, process.platform)
  }
})

test('unconfirmed cleanup stops a batch while a direct hook stays advisory', t => {
  const root = scratch(t)
  const probe = async (moduleUrl, root) => {
    const cp = await import('node:child_process')
    const { EventEmitter } = await import('node:events')
    const { PassThrough } = await import('node:stream')
    const { syncBuiltinESMExports } = await import('node:module')
    let calls = 0
    let closeObserved = false
    // Fault injection creates no OS process. The first arm never closes; the
    // second observes a close after the timeout, then normal later findings.
    cp.default.spawn = (command, args) => {
      calls++
      const child = new EventEmitter()
      child.stdout = new PassThrough()
      child.stderr = new PassThrough()
      child.stdin = new PassThrough()
      child.unref = () => {}
      if (closeObserved) {
        const slow = args[1].endsWith('current.md')
        const finish = () => {
          if (!slow) child.stderr.write('CHECKED ' + args[1] + '\n')
          child.emit('close', 0)
        }
        if (slow) setTimeout(finish, 250)
        else queueMicrotask(finish)
      }
      return child
    }
    syncBuiltinESMExports()
    const { runShellHook, runArtifactBatch } = await import(moduleUrl)
    let stderr = ''
    process.stderr.write = chunk => { stderr += chunk; return true }
    const paths = ['current.md', 'remaining.md'].map(name => root + '/' + name)
    const directStatus = await runShellHook('facts-gate-dispatch.sh',
      JSON.stringify({ tool_input: { file_path: paths[0] } }), { timeoutMs: 100 })
    const direct = { status: directStatus, calls, stderr }
    calls = 0
    stderr = ''
    const status = await runArtifactBatch(JSON.stringify({
      paths, deadline: Date.now() + 10_000, windowMs: 10_000, timeoutMs: 100,
    }))
    const batch = { status, calls, stderr }
    closeObserved = true
    calls = 0
    stderr = ''
    const confirmedStatus = await runArtifactBatch(JSON.stringify({
      paths, deadline: Date.now() + 10_000, windowMs: 10_000, timeoutMs: 100,
    }))
    process.stdout.write(JSON.stringify({ direct, batch, confirmed: { status: confirmedStatus, calls, stderr } }))
  }
  const code = '(' + probe.toString() + ')(...' + JSON.stringify([
    pathToFileURL(path.join(pluginRoot, 'scripts', 'run-shell-hook.mjs')).href, root,
  ]) + ')'
  const { direct, batch, confirmed } = JSON.parse(run([process.execPath, '--input-type=module', '-e', code], root).stdout)
  assert.equal(direct.calls, 1, 'the control must exercise the injected child')
  assert.equal(direct.status, 0, 'direct edit hooks stay advisory')
  assert.equal(batch.status, 0, 'the batch reports unchecked work without blocking')
  assert.equal(batch.calls, 1, 'unconfirmed cleanup must prevent starting the next shell')
  assert.match(direct.stderr, /cleanup could not be confirmed/)
  assert.match(batch.stderr, /cleanup could not be confirmed/)
  assert.match(batch.stderr, /current\.md/)
  assert.match(batch.stderr, /remaining\.md/)
  assert.match(batch.stderr, /Unchecked artifacts/)
  assert.equal(confirmed.status, 0)
  assert.equal(confirmed.calls, 2, 'an observed close permits the next artifact on every platform')
  assert.match(confirmed.stderr, /timed out after 100ms/)
  assert.match(confirmed.stderr, /CHECKED .*remaining\.md/)
  assert.doesNotMatch(confirmed.stderr, /cleanup could not be confirmed|Unchecked artifacts/)
  assert.match(confirmed.stderr, /budget, not a finding/)
  assert.ok(confirmed.stderr.indexOf('budget, not a finding') < confirmed.stderr.indexOf('CHECKED'))
})
