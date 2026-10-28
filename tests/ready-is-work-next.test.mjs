// ADR-099 T1: `work-next` is the one reader that says which ADR task is ready. SessionStart (startup, resume, clear, compact),
// the compaction note and `qh_orientation` name no ready task and start no `adr-next`, and the ready-task cache that served
// them (ADR-095 T6) is not shipped.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { sourceCore } from './helpers/source-core.mjs'
sourceCore()

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const temps = []
test.after(() => { for (const dir of temps) rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }) })

function scratch(prefix) {
  const dir = realpathSync.native(mkdtempSync(path.join(os.tmpdir(), prefix)))
  temps.push(dir)
  return dir
}

const TASK = '# Task ADR-001-T1: do the one thing\n\n**Depends-on:** none\n**Consumes:** none\n**Produces:** none\n\n'
  + '## Acceptance\n\n```bash\nprintf T1\n```\n\n## Verification Log\n'

// A repository with one Accepted record and one ready task, and a declared check so that every
// SessionStart has something it must say: an empty answer cannot pass for "names no ready task".
function corpus() {
  const repo = scratch('qh-ready-repo-')
  mkdirSync(path.join(repo, 'docs', 'adr', 'ADR-001-x', 'tasks'), { recursive: true })
  writeFileSync(path.join(repo, 'docs', 'adr', 'ADR-001-x.md'), '# ADR-001: X\n\n**Status:** Accepted\n\n## Decision\n\nx\n')
  writeFileSync(path.join(repo, 'docs', 'adr', 'ADR-001-x', 'tasks', 'T1-a.md'), TASK)
  writeFileSync(path.join(repo, '.quality-harness.json'), JSON.stringify({ check: 'node --test' }))
  for (const args of [['init', '-q', '-b', 'main'], ['add', '-A']]) {
    const run = spawnSync('git', args, { cwd: repo, encoding: 'utf8', timeout: 60_000, windowsHide: true })
    assert.equal(run.status, 0, run.stderr)
  }
  return repo
}

// A copy of the plugin whose `bin/adr-next` appends to a marker and then runs the real gate: whatever starts
// `adr-next` through this copy leaves a line behind. Python, because a gate is spawned through its shebang on
// POSIX and through the interpreter on Windows.
function pluginWithWatchedGate() {
  const copy = path.join(scratch('qh-ready-plugin-'), 'plugin')
  cpSync(path.join(repoRoot, 'plugin'), copy, { recursive: true })
  const marker = path.join(scratch('qh-ready-marker-'), 'adr-next-started')
  const real = path.join(repoRoot, 'plugin', 'bin', 'adr-next')
  const shim = path.join(copy, 'bin', 'adr-next')
  writeFileSync(shim, '#!/usr/bin/env python3\nimport runpy, sys\n'
    + `with open(${JSON.stringify(marker)}, 'a', encoding='utf-8') as said:\n    said.write(' '.join(sys.argv[1:]) + '\\n')\n`
    + `sys.argv[0] = ${JSON.stringify(real)}\nrunpy.run_path(${JSON.stringify(real)}, run_name='__main__')\n`)
  chmodSync(shim, 0o755)
  return { copy, marker }
}

function hook(copy, payload, tmp) {
  return spawnSync(process.execPath, [path.join(copy, 'scripts', 'lifecycle.mjs')], {
    cwd: tmp, input: JSON.stringify(payload), encoding: 'utf8', timeout: 120_000, windowsHide: true,
    env: {
      ...process.env, CLAUDE_PLUGIN_ROOT: copy, CLAUDE_PLUGIN_DATA: path.join(tmp, 'data'),
      QUALITY_HARNESS_OBSERVE_BUDGET_MS: '60000', TMPDIR: tmp, TMP: tmp, TEMP: tmp,
    },
  })
}

const contextOf = run => {
  assert.equal(run.status, 0, run.stderr)
  return JSON.parse(run.stdout).hookSpecificOutput?.additionalContext ?? ''
}

const READY_WORDS = /ADR tasks? in flight|is ready —/

test('SessionStart and the compact note name no ready task and start no adr-next where work-next finds one', () => {
  const repo = corpus()
  const { copy, marker } = pluginWithWatchedGate()
  const session = 'ready-is-work-next'
  // Each source in its own temp directory: a standing paragraph is said once per repository per three days, and a
  // marker left by one start must not silence the next one's.
  for (const source of ['startup', 'resume', 'clear']) {
    const context = contextOf(hook(copy, { hook_event_name: 'SessionStart', source, cwd: repo, session_id: session }, scratch('qh-ready-tmp-')))
    assert.match(context, /Verification: this project's own check is/, `${source} said its orientation: ${context}`)
    assert.doesNotMatch(context, READY_WORDS, `${source}: ${context}`)
  }
  const tmp = scratch('qh-ready-tmp-')
  assert.equal(hook(copy, { hook_event_name: 'PreCompact', trigger: 'auto', cwd: repo, session_id: session }, tmp).status, 0)
  const compact = contextOf(hook(copy, { hook_event_name: 'SessionStart', source: 'compact', cwd: repo, session_id: session }, tmp))
  assert.match(compact, /What this session was doing before compaction/, `the note was handed back: ${compact}`)
  assert.doesNotMatch(compact, READY_WORDS, compact)
  const orientation = spawnSync(process.execPath, [path.join(copy, 'scripts', 'orientation.mjs'), repo], {
    encoding: 'utf8', timeout: 120_000, windowsHide: true, env: { ...process.env, CLAUDE_PLUGIN_ROOT: copy, TMPDIR: tmp, TMP: tmp, TEMP: tmp },
  })
  assert.equal(orientation.status, 0, orientation.stderr)
  assert.match(orientation.stdout, /Verification: this project's own check is/)
  assert.doesNotMatch(orientation.stdout, READY_WORDS, orientation.stdout)
  assert.equal(existsSync(marker), false, `no session start ran adr-next: ${existsSync(marker) ? readFileSync(marker, 'utf8') : ''}`)

  // DIRTY: the same copy and corpus through work-next, which does ask adr-next, and finds the task ready. The
  // marker sees that start, so its absence above is an observation, not a detector that cannot fire.
  const next = spawnSync(process.execPath, [path.join(copy, 'scripts', 'work-next.mjs'), '--json'], {
    cwd: repo, encoding: 'utf8', timeout: 120_000, windowsHide: true, env: { ...process.env, CLAUDE_PLUGIN_ROOT: copy },
  })
  assert.equal(next.status, 0, next.stderr)
  assert.deepEqual(JSON.parse(next.stdout).tasksWithoutEvidence, ['docs/adr/ADR-001-x/tasks/T1-a.md'], next.stdout)
  assert.match(readFileSync(marker, 'utf8'), /tasks/, 'work-next started adr-next through the watched copy')
})

// What a file still says about the removed code. `taskDirectories` is matched only as a call or an import: the same word
// is a key of the probe's attestation (`scripts/attest-import.mjs`, `plugin/scripts/corpus-probe.mjs`), which stays.
const REMOVED = /\b(?:readyTaskLines|surfaceReadyLines|readyCache|TASK_DIRECTORY_READ_CAP|newestTaskChange|commandInCode|trace_run)\b|\bready-cache\b|\btaskDirectories\s*\(|\bimport\s*\{[^}]*\btaskDirectories\b/
const GONE = [
  'plugin/scripts/ready-cache.mjs', 'plugin/lib/trace_run.py', 'tests/ready-cache.test.mjs',
  'tests/mutations/plugin/scripts/ready-cache.mjs.json', 'tests/mutations/plugin/lib/trace_run.py.json',
]

// Tracked, plus what is about to be added (CLAUDE.md §8): never what happens to be on this disk.
function listed() {
  const run = spawnSync('git', ['-c', 'core.quotePath=false', 'ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    { cwd: repoRoot, encoding: 'utf8', timeout: 60_000, windowsHide: true })
  assert.equal(run.status, 0, run.stderr)
  return [...new Set(run.stdout.split('\0').filter(Boolean))]
}

test('the ready-task cache and its recorder are not shipped and nothing shipped names what only they used', () => {
  // DIRTY: the scan reports each form a name can come back in, and not the attestation key.
  for (const line of ["import { posixListed, taskDirectories } from './decision-corpus.mjs'", 'const { read } = taskDirectories(root, listing)',
    'export const readyCache = null;', '// `readyTaskLines` learned the same lesson', "import { readyCache } from './ready-cache.mjs'"]) {
    assert.match(line, REMOVED, line)
  }
  for (const line of ["const CORPUS_KEYS = ['records', 'undecided', 'tasks', 'taskDirectories', 'countsFrom']",
    'const taskDirectories = Array.isArray(report.adrNext) ? report.adrNext.length : null', 'tasks: null, taskDirectories }']) {
    assert.doesNotMatch(line, REMOVED, line)
  }
  const files = listed()
  assert.deepEqual(GONE.filter(file => files.includes(file)), [], 'the cache, its recorder, their test and catalogues are not listed')
  const naming = files.filter(file => /^(?:plugin|scripts)\//.test(file))
    .filter(file => REMOVED.test(readFileSync(path.join(repoRoot, ...file.split('/')), 'utf8')))
  assert.deepEqual(naming, [], 'no shipped file or repository script names the removed code')
})
