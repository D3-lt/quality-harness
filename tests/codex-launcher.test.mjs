// ADR-098 T1: every Codex run the plugin starts is built by one function, with stdin closed, killed at one budget, and
// pinned to one model, and both Codex skills launch through it. Each property is asserted on the mechanism (the options a
// run is handed, the argv it is given), and each check is shown failing on a dirty input (CLAUDE.md §4).
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { CODEX_MODEL, CODEX_TIMEOUT_MS, codexInvocation, hostReview } from '../plugin/scripts/host-review.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const scratch = realpathSync.native(mkdtempSync(path.join(os.tmpdir(), 'qh-codex-launch-')))
after(() => rmSync(scratch, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }))
const review = { host: 'codex', effort: 'high', repo: '/repo', scope: 'commit abc123', resolve: () => '/bin/codex' }
const clean = JSON.stringify({ status: 'clean', findings: [] })
// A fake run: `exec --help` answers with `help`, the review itself with `reply`, and every call is kept.
const fake = (reply, help = 'Usage: codex exec\n') => {
  const calls = []
  const run = (bin, args, options) => { calls.push({ bin, args, options }); return args[1] === '--help' ? { status: 0, stdout: help } : reply }
  return { calls, run, review: () => calls.find(call => call.args[0] === 'exec' && call.args[1] !== '--help') }
}

test('a Codex run closes stdin and is killed at its budget', () => {
  const call = codexInvocation({ bin: '/bin/codex', repo: '/repo', effort: 'high', prompt: 'p', output: '/out' })
  assert.equal(call.options.stdio[0], 'ignore')
  assert.equal(call.options.timeout, CODEX_TIMEOUT_MS)
  assert.equal(call.options.killSignal, 'SIGKILL')
  const runs = fake({ status: 0, stdout: clean })
  hostReview({ ...review, run: runs.run })
  assert.deepEqual(runs.review().options, call.options, 'hostReview runs with exactly the launcher options')
})

test('a Codex run past its budget is unavailable, never clean', () => {
  const runs = fake({ error: { code: 'ETIMEDOUT', message: 'spawnSync codex ETIMEDOUT' }, signal: 'SIGKILL', status: null, stdout: clean })
  const result = hostReview({ ...review, run: runs.run })
  assert.equal(result.status, 'unavailable')
  assert.match(result.reason, /budget/)
})

test('the Codex command line has one builder and one model', () => {
  for (const [help, wanted] of [['  --ignore-user-config  ignore it\n', true], ['Usage: codex exec\n', false]]) {
    const runs = fake({ status: 0, stdout: clean }, help)
    hostReview({ ...review, run: runs.run })
    const argv = runs.review().args
    assert.equal(argv.includes('--ignore-user-config'), wanted, `--ignore-user-config ${wanted ? 'missing' : 'passed'} for help ${JSON.stringify(help)}`)
    assert.equal(argv[argv.indexOf('-m') + 1], CODEX_MODEL)
    assert.equal(CODEX_MODEL, 'gpt-6.1-sol')
    const output = argv[argv.indexOf('-o') + 1]
    assert.ok(output && path.basename(path.dirname(output)).startsWith('qh-codex-'), `-o is under a fresh directory: ${output}`)
    assert.match(argv.at(-1), /^CODEX-REVIEW-LEAF: /, 'the prompt is the last argument')
  }
  // No other shipped script builds a `codex exec` command line.
  const scripts = readdirSync(path.join(repoRoot, 'plugin', 'scripts')).filter(name => name.endsWith('.mjs') && name !== 'host-review.mjs')
  const builders = scripts.filter(name => /['"]exec['"]\s*,\s*(?:\.\.\.|['"]-C['"])/.test(readFileSync(path.join(repoRoot, 'plugin', 'scripts', name), 'utf8')))
  assert.deepEqual(builders, [])
  assert.ok(/['"]exec['"]\s*,\s*(?:\.\.\.|['"]-C['"])/.test("run(bin, ['exec', '-C', repo])"), 'the builder pattern finds a builder')
})

test('the prompt-file form sends the caller\'s prompt and prints the final message', t => {
  if (process.platform === 'win32') return t.skip('a #!/usr/bin/env node stub on CODEX_CLI_PATH cannot be executed on Windows')
  const stub = (name, body) => { const file = path.join(scratch, name); writeFileSync(file, `#!/usr/bin/env node\n${body}\n`); chmodSync(file, 0o755); return file }
  const writes = stub('codex-ok', "const a = process.argv.slice(2); if (a[1] === '--help') { console.log('--ignore-user-config'); process.exit(0) } require('node:fs').writeFileSync(a[a.indexOf('-o') + 1], 'FINAL ' + a.at(-1)); process.exit(0)")
  const fails = stub('codex-fail', "const a = process.argv.slice(2); if (a[1] === '--help') process.exit(0); process.exit(1)")
  const prompt = path.join(scratch, 'prompt.txt')
  writeFileSync(prompt, 'CODEX-ADVISE-LEAF: hello')
  const cli = bin => spawnSync(process.execPath, [path.join(repoRoot, 'plugin', 'scripts', 'host-review.mjs'), '--host', 'codex', '--effort', 'high', '--repo', scratch, '--prompt-file', prompt],
    { encoding: 'utf8', timeout: 60_000, env: { ...process.env, CODEX_CLI_PATH: bin }, windowsHide: true })
  const ok = cli(writes)
  assert.equal(ok.status, 0, ok.stderr)
  assert.equal(ok.stdout.trim(), 'FINAL CODEX-ADVISE-LEAF: hello')
  const bad = cli(fails)
  assert.equal(bad.status, 2, bad.stdout)
  assert.match(bad.stderr, /unavailable — codex exited 1/)
})

test('both Codex skills launch through host-review and keep their recursion markers', () => {
  const skill = name => readFileSync(path.join(repoRoot, 'plugin', 'skills', name, 'SKILL.md'), 'utf8')
  const ownLaunch = /codex"\s+exec\b|<absolute-codex>"\s+exec\b/
  for (const [name, marker, least] of [['codex-review', 'CODEX-REVIEW-LEAF:', 3], ['codex-advise', 'CODEX-ADVISE-LEAF:', 2]]) {
    const text = skill(name)
    assert.doesNotMatch(text, ownLaunch, `${name} still writes its own codex exec command`)
    assert.match(text, /host-review\.mjs"? --host codex[^\n]*--repo[^\n]*--prompt-file/, `${name} does not document the launcher`)
    assert.ok(text.split(marker).length - 1 >= least, `${name} keeps ${least} ${marker} markers`)
  }
  assert.match('"<absolute-codex>" exec -C x', ownLaunch, 'the pattern finds a skill-built launch')
})
