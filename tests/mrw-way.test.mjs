import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { mrwOnPath } from '../plugin/scripts/session-orientation.mjs'
import { sourceCore } from './helpers/source-core.mjs'
sourceCore()

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const skills = path.join(repoRoot, 'plugin', 'skills')
const skill = name => readFileSync(path.join(skills, name, 'SKILL.md'), 'utf8')
const HEADING = '## Read and edit in batches'

// ADR-107 T1: the implementing skill carries the mrw way once, and the skills that implement point to it.
test('the implementing skills teach one read of every site, one batch of edits, and a check that each edit landed', () => {
  const execution = skill('execution')
  const start = execution.indexOf(`\n${HEADING}\n`)
  assert.ok(start >= 0, `execution has no "${HEADING}" section`)
  const end = execution.indexOf('\n## ', start + 1)
  const section = execution.slice(start, end < 0 ? undefined : end)
  for (const rule of [/one read of every site/i, /one batch/i, /count/i, /one substitution/i,
    /matched nothing is a failure/i, /refusal/i, /`mrw`.*on PATH|on PATH.*`mrw`/i]) {
    assert.match(section, rule, `the section does not say ${rule}`)
  }
  assert.ok(section.split('\n').filter(line => line.trim()).length <= 13, 'the section is longer than twelve lines under its heading')
  for (const name of ['adr-execute', 'work']) {
    assert.ok(skill(name).includes('Read and edit in batches'), `${name} does not point to the section`)
  }
  // One copy: no other skill repeats the section's own sentence.
  const sentence = section.split('\n').find(line => /one read of every site/i.test(line)).trim()
  for (const name of readdirSync(skills).filter(entry => entry !== 'execution')) {
    let body = ''
    try { body = skill(name) } catch { continue }
    assert.ok(!body.includes(sentence), `${name} copies the section instead of pointing to it`)
  }
})

// ADR-107 T3: a session with mrw on PATH is pointed to it once; a session without it, or with a different binary of that name,
// hears nothing new. Through the real SessionStart hook, with PATH built by the test.
const lifecycleScript = path.join(repoRoot, 'plugin', 'scripts', 'lifecycle.mjs')
const LINE = /mrw is on PATH: read every site you will touch in one `mrw read`/

test('a session with mrw on PATH is told it is there, and a session without it is told nothing', { skip: process.platform === 'win32' && 'the stub is a POSIX script; the Windows name is asserted through mrwOnPath below' }, () => {
  const top = realpathSync.native(mkdtempSync(path.join(tmpdir(), 'qh-mrw-way-')))
  try {
    const repo = path.join(top, 'repo')
    mkdirSync(repo)
    spawnSync('git', ['init', '-q'], { cwd: repo, timeout: 60_000, windowsHide: true })
    writeFileSync(path.join(repo, '.quality-harness.json'), JSON.stringify({ check: 'npm test' }))
    const stub = (dir, answer) => {
      mkdirSync(dir, { recursive: true })
      writeFileSync(path.join(dir, 'mrw'), `#!/bin/sh\necho '${answer}'\n`)
      chmodSync(path.join(dir, 'mrw'), 0o755)
      return dir
    }
    // The real PATH without any directory holding an mrw, so the machine's own install cannot answer.
    const bare = String(process.env.PATH).split(':').filter(dir => dir && !existsSync(path.join(dir, 'mrw'))).join(':')
    const start = (PATH, n) => {
      // Each start its own temp and data directory: the line is said once per repository, and that memory lives there.
      const own = path.join(top, `t-${n}`); mkdirSync(own, { recursive: true })
      const env = { ...process.env, PATH, TMPDIR: own, TMP: own, TEMP: own, CLAUDE_PLUGIN_DATA: path.join(own, 'data') }
      const out = spawnSync(process.execPath, [lifecycleScript], { cwd: repo, encoding: 'utf8', timeout: 120_000, env,
        input: JSON.stringify({ hook_event_name: 'SessionStart', source: 'startup', session_id: `mrw-way-${n}`, cwd: repo }) })
      assert.equal(out.status, 0, out.stderr)
      return out.stdout
    }
    const real = stub(path.join(top, 'real'), 'mrw version v1.68.0-9-g6de290ac (6de290a)')
    assert.match(start(`${real}:${bare}`, 1), LINE, 'mrw answering in its own shape is named')
    assert.doesNotMatch(start(bare, 2), LINE, 'no mrw on PATH: nothing is said')
    const other = stub(path.join(top, 'other'), 'mrw 0.1 — a different tool')
    assert.doesNotMatch(start(`${other}:${bare}`, 3), LINE, 'a different binary called mrw is not pointed to')
  } finally { rmSync(top, { recursive: true, force: true }) }
})

test('mrw is resolved from PATH the way the platform resolves it, without a shell', () => {
  const top = realpathSync.native(mkdtempSync(path.join(tmpdir(), 'qh-mrw-resolve-')))
  try {
    const dir = path.join(top, 'bin')
    mkdirSync(dir)
    writeFileSync(path.join(dir, 'mrw.exe'), '')
    // Executable, so POSIX skipping it is about the name, not the mode bit.
    chmodSync(path.join(dir, 'mrw.exe'), 0o755)
    const seen = []
    const answer = file => { seen.push(file); return 'mrw version v1.68.0' }
    assert.equal(mrwOnPath({ Path: dir }, 'win32', answer), path.join(dir, 'mrw.exe'), 'Windows finds mrw.exe on Path')
    assert.equal(mrwOnPath({ PATH: dir }, 'linux', answer), null, 'POSIX does not take mrw.exe for mrw')
    assert.equal(mrwOnPath({ PATH: '' }, 'linux', answer), null, 'an empty PATH names nothing')
    assert.deepEqual(seen, [path.join(dir, 'mrw.exe')], 'only a found file is asked its version')
  } finally { rmSync(top, { recursive: true, force: true }) }
})

// What corpus-probe reports is about the corpus, so the prober's own PATH must not show in it: a machine with mrw would
// otherwise report a SessionStart line no corpus produced (found by the corpus matrix on a machine that has mrw).
test('corpus-probe asks SessionStart about the corpus, not about the machine it runs on', { skip: process.platform === 'win32' && 'the stub is a POSIX script' }, () => {
  const top = realpathSync.native(mkdtempSync(path.join(tmpdir(), 'qh-mrw-probe-')))
  try {
    const repo = path.join(top, 'repo')
    mkdirSync(repo)
    spawnSync('git', ['init', '-q'], { cwd: repo, timeout: 60_000, windowsHide: true })
    writeFileSync(path.join(repo, '.quality-harness.json'), JSON.stringify({ check: 'npm test' }))
    const bin = path.join(top, 'bin')
    mkdirSync(bin)
    writeFileSync(path.join(bin, 'mrw'), "#!/bin/sh\necho 'mrw version v1.68.0-9-g6de290ac (6de290a)'\n")
    chmodSync(path.join(bin, 'mrw'), 0o755)
    const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, TMPDIR: top, TMP: top, TEMP: top }
    const probe = spawnSync(process.execPath, [path.join(repoRoot, 'plugin', 'scripts', 'corpus-probe.mjs'), repo, '--json'],
      { encoding: 'utf8', timeout: 180_000, windowsHide: true, env })
    assert.equal(probe.status, 0, probe.stderr)
    const lines = JSON.parse(probe.stdout).sessionStart?.lines ?? []
    assert.ok(lines.length > 0, 'the probe ran SessionStart and it said something about this project')
    assert.ok(!lines.some(line => LINE.test(line)), `the probe reported the machine's mrw:\n${lines.join('\n')}`)
    // The control: the same hook, asked directly with the same PATH, does name it.
    const own = path.join(top, 'own'); mkdirSync(own)
    const direct = spawnSync(process.execPath, [lifecycleScript], { cwd: repo, encoding: 'utf8', timeout: 120_000, windowsHide: true,
      env: { ...env, TMPDIR: own, TMP: own, TEMP: own, CLAUDE_PLUGIN_DATA: path.join(own, 'data') },
      input: JSON.stringify({ hook_event_name: 'SessionStart', source: 'startup', session_id: 'mrw-probe-control', cwd: repo }) })
    assert.match(direct.stdout, LINE)
  } finally { rmSync(top, { recursive: true, force: true }) }
})
