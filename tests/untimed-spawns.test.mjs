// BACKLOG §130 — every child a process spawns carries a timeout, JavaScript side.
//
// `untimed-children.test.mjs` keeps the Python gates true; this is the same
// question for the shipped JavaScript and the suite, answered by AST rather than
// by the grep count §130 said not to trust. Shown DIRTY on a fixture first,
// including the UNKNOWN and UNRUN arms, because a checker that only ever
// returns clean has never been shown to check anything (CLAUDE.md §4).
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { loadAcorn, main } from '../scripts/untimed-spawns.mjs'

const testDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(testDir, '..')
const checker = join(repoRoot, 'scripts', 'untimed-spawns.mjs')
const check = (args, options = {}) => spawnSync(process.execPath, ['--expose-internals', checker, ...args],
  { cwd: repoRoot, encoding: 'utf8', timeout: 60_000, ...options })

const FIXTURE = `import { spawn, spawnSync, execSync } from 'node:child_process'
import cp from 'node:child_process'
export function dirty() {
  return spawnSync('git', ['status'], {
    encoding: 'utf8',
  })
}
export function fine() {
  return spawnSync('git', ['status'], { encoding: 'utf8', timeout: 5_000 })
}
export function noOptions() { return spawn('sleep', ['30']) }
export function unknownOptions(options) { return execSync('true', options) }
export function spread(extra) { return cp.execFileSync('true', [], { ...extra }) }
export function acknowledged() {
  // untimed-spawn: the caller's own timer kills it; see runWithTimeout
  return spawn('bash', ['-c', 'true'])
}
export function notASpawn() { return /x/.exec('x') }
export function alsoNot(promise) { return promise.exec() }
`

test('the checker reports an untimed spawn, reads options anywhere in the object, and calls a variable UNKNOWN', () => {
  const dir = mkdtempSync(join(tmpdir(), 'qh-untimed-js-'))
  try {
    const dirty = join(dir, 'dirty.mjs')
    writeFileSync(dirty, FIXTURE)
    const run = check([dirty])
    assert.equal(run.status, 1, `an untimed call must be a finding\n${run.stdout}${run.stderr}`)
    assert.match(run.stdout, /dirty\.mjs:4: spawnSync\(\) names no timeout/, 'a multi-line options object is one call, read whole')
    assert.match(run.stdout, /dirty\.mjs:11: spawn\(\) names no timeout/, 'no options at all is untimed')
    assert.match(run.stdout, /dirty\.mjs:12: execSync\(\) options could not be read here .*UNKNOWN/, 'a variable is not clean and not a finding')
    assert.match(run.stdout, /dirty\.mjs:13: execFileSync\(\) options could not be read here/, 'a spread is UNKNOWN too')
    assert.match(run.stdout, /dirty\.mjs:16: spawn\(\) acknowledged untimed: the caller's own timer kills it/, 'an acknowledgement with a reason is reported as such')
    assert.doesNotMatch(run.stdout, /dirty\.mjs:9:/, 'a timed call is not a finding')
    assert.doesNotMatch(run.stdout, /dirty\.mjs:1[89]:/, 'regex.exec and promise.exec are not child processes')
    assert.match(run.stdout, /1 timed · 2 untimed · 2 unknown · 1 acknowledged · 0 unparsed/)

    // A bare acknowledgement is not one.
    const bare = join(dir, 'bare.mjs')
    writeFileSync(bare, "import { spawn } from 'node:child_process'\n// untimed-spawn:\nspawn('x')\n")
    assert.match(check([bare]).stdout, /bare\.mjs:3: spawn\(\) names no timeout/, 'an acknowledgement without a reason is refused')

    // Unparseable is said, not skipped silently.
    const broken = join(dir, 'broken.mjs')
    writeFileSync(broken, 'export function (')
    assert.match(check([broken]).stdout, /broken\.mjs: could not parse/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('without the parser the checker is UNRUN, not clean', () => {
  // The seam: a require that cannot find the internal module. Exit 2, and the
  // word UNRUN, so a host whose Node hides the path never reads as a pass.
  const out = []
  const err = []
  const status = main([], {
    acorn: loadAcorn(() => { throw Object.assign(new Error("Cannot find module 'internal/deps/acorn/acorn/dist/acorn'"), { code: 'MODULE_NOT_FOUND' }) }),
    stdout: { write: chunk => out.push(chunk) }, stderr: { write: chunk => err.push(chunk) },
  })
  assert.equal(status, 2)
  assert.match(err.join(''), /UNRUN/)
  assert.equal(out.join(''), '', 'no report is written for a check that did not run')

  // And the same script without --expose-internals is that case for real.
  const bare = spawnSync(process.execPath, [checker, checker], { cwd: repoRoot, encoding: 'utf8', timeout: 60_000 })
  assert.equal(bare.status, 2, `${bare.stdout}${bare.stderr}`)
  assert.match(bare.stderr, /UNRUN/)
})

test('every child the shipped JavaScript spawns carries a timeout, or says why not', () => {
  // The shipped tree only (plugin/scripts, plugin/workflows): the suite and the
  // repository scripts are reported below as a place to look, not gated yet.
  // UNKNOWN (a variable, a spread) is allowed here and printed: it is a place
  // to look, and the four in lifecycle.mjs pass an options object that carries
  // its timeout one line up.
  const shipped = spawnSync('git', ['-C', repoRoot, 'ls-files', '--', 'plugin/scripts/*.mjs', 'plugin/workflows/*.js'],
    { encoding: 'utf8', timeout: 30_000 }).stdout.split(/\r?\n/).filter(Boolean).map(file => join(repoRoot, file))
  assert.ok(shipped.length > 3, 'the shipped tree must be listed for this to mean anything')
  const run = check(shipped)
  assert.equal(run.status, 0, `these calls can hang a hook for ever (BACKLOG §130):\n${run.stdout}${run.stderr}`)
  assert.match(run.stdout, /\d+ timed · 0 untimed/, run.stdout)
  assert.match(run.stdout, /run-shell-hook\.mjs:\d+: spawn\(\) acknowledged untimed: bounded by the timer below/, 'the runner\'s own spawn is acknowledged with its reason, not silent')
})

test('the suite and repository scripts: counted, reported, not yet a floor', () => {
  // A number written into CLAUDE.md is a cached answer nothing invalidates;
  // this prints the live one into the test log so the next ratchet starts from
  // a measurement. Exit code deliberately not asserted here.
  const run = check(['--json'])
  const parsed = JSON.parse(run.stdout)
  process.stderr.write(`[untimed-spawns] whole tree: ${parsed.timed} timed, ${parsed.untimed.length} untimed, ${parsed.unknown.length} unknown, ${parsed.acknowledged.length} acknowledged, ${parsed.unparsed.length} unparsed\n`)
  assert.equal(parsed.unparsed.length, 0, `every tracked JavaScript file must parse: ${JSON.stringify(parsed.unparsed)}`)
  // The ratchet: the count may fall, never rise. The repository scripts are at
  // zero; what remains is the suite, whose spawns the CI job cap and the
  // selftest trap bound. Lower this when you lower the count.
  const RATCHET = 79
  assert.ok(parsed.untimed.length <= RATCHET,
    `untimed spawns rose from ${RATCHET} to ${parsed.untimed.length}; a new child must carry a timeout:\n${parsed.untimed.map(f => `${f.file}:${f.line} ${f.call}`).join('\n')}`)
  const scripts = parsed.untimed.filter(f => /[\\/]scripts[\\/]/.test(f.file) && !/[\\/]plugin[\\/]/.test(f.file))
  assert.deepEqual(scripts, [], 'the repository scripts run in CI; every child they spawn is bounded')
})

test('the documented signatures are classified through the CLI, one fixture per shape', () => {
  // In-process scanSource needs --expose-internals, which the test runner does
  // not pass to test files; the CLI is the surface that has it.
  const dir = mkdtempSync(join(tmpdir(), 'qh-untimed-sig-'))
  try {
    const cases = [
      ["exec('ls', { timeout: 1 }, (e, out) => {})", 'timed', 'exec with a trailing callback'],
      ["exec('ls', (e, out) => {})", 'untimed', 'exec with only a callback'],
      ["spawnSync('x', { 'timeout': 1 })", 'timed', 'a quoted key'],
      ["fork('w.js', [], { ...base, timeout: 1 })", 'timed', 'a spread beside an explicit timeout is timed'],
    ]
    cases.forEach(([source, expected, why], index) => {
      const file = join(dir, `case-${index}.mjs`)
      writeFileSync(file, `import { exec, spawnSync, fork } from 'node:child_process'\nconst base = {}\n${source}\n`)
      const parsed = JSON.parse(check(['--json', file]).stdout)
      const got = parsed.timed === 1 ? 'timed' : parsed.untimed.length === 1 ? 'untimed' : parsed.unknown.length === 1 ? 'unknown' : 'none'
      assert.equal(got, expected, `${why}: ${source}`)
    })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
