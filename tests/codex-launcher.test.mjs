// ADR-098 T1: every Codex run the plugin starts is built by one function, with stdin closed, killed at one budget, and
// pinned to one model, and both Codex skills launch through it. Each property is asserted on the mechanism (the options a
// run is handed, the argv it is given), and each check is shown failing on a dirty input (CLAUDE.md §4).
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { CODEX_MODEL, CODEX_TIMEOUT_MS, MODEL_NAME, REVIEWS_FILE, codexInvocation, hostReview, promptFileReview } from '../plugin/scripts/host-review.mjs'
import { cloneStateDir } from '../plugin/scripts/event-log.mjs'

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
    assert.equal(CODEX_MODEL, 'gpt-6.2-sol')
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

// The codex-review skill shows what the launcher runs; this keeps that block equal to `codexInvocation`, flag for flag.
const flagsOf = words => words.filter(word => word.startsWith('-'))
const shownFlags = text => {
  const block = text.split('What the launcher runs')[1]?.match(/```text\n([\s\S]*?)```/)?.[1] ?? ''
  return flagsOf(block.replace(/<optional-ignore-user-config>/, '').split(/\s+/).filter(word => word !== '\\'))
}
test('the invocation the codex-review skill shows is the one the launcher builds', () => {
  const built = flagsOf(codexInvocation({ bin: 'codex', repo: 'r', effort: 'high', prompt: 'p', output: 'o' }).argv)
  const skill = readFileSync(path.join(repoRoot, 'plugin', 'skills', 'codex-review', 'SKILL.md'), 'utf8')
  assert.deepEqual(shownFlags(skill), built)
  assert.match(skill, new RegExp(`-m ${CODEX_MODEL.replaceAll('.', '\\.')} `))
  // Dirty: a block that dropped a flag the launcher passes is told apart.
  assert.notDeepEqual(shownFlags(skill.replace(' --ephemeral', '')), built)
})

// Codex review of v3.8.21..17066d76: only a deadline is the budget; the help probe is killed as hard as the run; and a
// temporary directory that cannot be made is a reason, never an exception out of the result contract.
test('a Codex run stopped by a signal before its deadline is unavailable, and not called the budget', () => {
  const runs = fake({ error: null, signal: 'SIGKILL', status: null, stdout: clean })
  const result = hostReview({ ...review, run: runs.run })
  assert.equal(result.status, 'unavailable')
  assert.doesNotMatch(result.reason, /budget/)
  assert.match(result.reason, /SIGKILL/)
})
test('the help probe is killed hard at its own deadline', () => {
  const runs = fake({ status: 0, stdout: clean })
  hostReview({ ...review, run: runs.run })
  const probe = runs.calls.find(call => call.args[1] === '--help')
  assert.ok(probe, 'the probe ran')
  assert.equal(probe.options.killSignal, 'SIGKILL')
  assert.ok(probe.options.timeout > 0 && probe.options.timeout <= CODEX_TIMEOUT_MS)
})
test('a temporary directory that cannot be made is unavailable, not a throw', t => {
  if (process.platform === 'win32') return t.skip('os.tmpdir() on Windows does not read TMPDIR')
  const notADirectory = path.join(scratch, 'not-a-directory')
  writeFileSync(notADirectory, '')
  const saved = process.env.TMPDIR
  process.env.TMPDIR = notADirectory
  let result
  try { result = hostReview({ ...review, run: fake({ status: 0, stdout: clean }).run }) } finally {
    if (saved === undefined) delete process.env.TMPDIR; else process.env.TMPDIR = saved
  }
  assert.equal(result.status, 'unavailable')
  assert.match(result.reason, /temporary directory/)
})

// The cold review of ADR-098 (2026-10-14): the pattern above sees only a quoted binary, so a skill that went back to
// `codex exec -C …` unquoted, or to `"$CODEX" exec …`, stayed green. Any spelling of the binary followed by `exec` and a
// flag is a launch; a prose mention (`codex exec` semantics) and the launcher's display block (`<codex> exec <…>`) are not.
const anyLaunch = /(?:\bcodex|\$\{?CODEX\}?|<absolute-codex>)"?\s+exec\s+-/
test('a skill that builds its own codex exec command is found in any spelling', () => {
  for (const name of ['codex-review', 'codex-advise']) {
    const text = readFileSync(path.join(repoRoot, 'plugin', 'skills', name, 'SKILL.md'), 'utf8')
    assert.doesNotMatch(text, anyLaunch, `${name} writes its own codex exec command`)
  }
  // DIRTY: every spelling a skill could build is found.
  for (const launch of ['codex exec -C "<repo-root>" -s read-only', '"$CODEX" exec -s read-only x', '${CODEX} exec --ephemeral x', '"<absolute-codex>" exec -C x']) {
    assert.match(launch, anyLaunch, launch)
  }
  // CLEAN: what the skills say about the launcher is not a launch.
  for (const prose of ['launch another `codex exec`,', 'Use plain `codex exec` semantics', '<codex> exec <optional-ignore-user-config> \\']) {
    assert.doesNotMatch(prose, anyLaunch, prose)
  }
  // The same review: the builder scan above sees `'exec', ...` and `'exec', '-C'` only, so `['exec', '-s', …]` slipped
  // past. Any flag after `exec` in an argv literal is a builder; host-review.mjs is the one allowed.
  const builder = /['"]exec['"]\s*,\s*(?:\.\.\.|['"]-)/
  const scripts = readdirSync(path.join(repoRoot, 'plugin', 'scripts')).filter(name => name.endsWith('.mjs') && name !== 'host-review.mjs')
  assert.deepEqual(scripts.filter(name => builder.test(readFileSync(path.join(repoRoot, 'plugin', 'scripts', name), 'utf8'))), [])
  for (const argv of ["['exec', '-s', 'read-only']", "['exec', '--ephemeral', x]", "['exec', ...flags]"]) assert.match(argv, builder, argv)
  assert.doesNotMatch("new Set(['set', 'shopt', 'trap', 'exec', 'source'])", builder, 'a list of shell words is not a builder')
})

// 2026-10-15: three review runs in a row ended "unavailable — codex exited 1" and nothing more, so whether the cause was
// a quota, the network or the contract could not be told; the run's own stderr was dropped. Its last line is the reason.
test('a Codex run that exits non-zero says why, from its own last stderr line', () => {
  const runs = fake({ error: null, signal: null, status: 1, stdout: '', stderr: 'thinking...\nERROR: stream disconnected before completion\n' })
  const result = hostReview({ ...review, run: runs.run })
  assert.equal(result.status, 'unavailable')
  assert.match(result.reason, /codex exited 1: ERROR: stream disconnected before completion/)
  // CLEAN twin: a run with nothing on stderr still says only its exit.
  const quiet = hostReview({ ...review, run: fake({ error: null, signal: null, status: 1, stdout: '', stderr: '' }).run })
  assert.equal(quiet.reason.trim().endsWith('codex exited 1'), true, quiet.reason)
})

test('the token footer codex ends its stderr with is not the reason', () => {
  const result = hostReview({ ...review, run: fake({ error: null, signal: null, status: 1, stdout: '', stderr: 'ERROR: quota exceeded\ntokens used\n71,953\n' }).run })
  assert.match(result.reason, /codex exited 1: ERROR: quota exceeded$/)
})

// BACKLOG §474 (the owner, 2026-11-19): `--model` names the reviewer for one run, so a new model needs no release.
// A repository of this file's own for the runs below: each leaves a review row, read back where the launcher writes it.
const ownRepo = path.join(scratch, 'own')
mkdirSync(ownRepo)
assert.equal(spawnSync('git', ['init', '-q'], { cwd: ownRepo, encoding: 'utf8', timeout: 30_000, windowsHide: true }).status, 0)
const lastRow = () => JSON.parse(readFileSync(path.join(cloneStateDir(ownRepo), REVIEWS_FILE), 'utf8').trim().split('\n').at(-1))
const given = runs => { const argv = runs.review().args; return argv[argv.indexOf('-m') + 1] }
const ownContract = path.join(scratch, 'own-contract.txt')
writeFileSync(ownContract, 'CODEX-REVIEW-LEAF: read it')
const fileForm = ['node', 'host-review.mjs', '--host', 'codex', '--effort', 'high', '--repo', ownRepo, '--prompt-file', ownContract]

test('--model names the reviewer for one run, and the row records the name that was passed', () => {
  const runs = fake({ status: 0, stdout: clean })
  const result = hostReview({ ...review, repo: ownRepo, model: 'gpt-7-sol', run: runs.run })
  assert.deepEqual([given(runs), result.model, result.bound, lastRow().model, lastRow().bound], ['gpt-7-sol', 'gpt-7-sol', 'pinned', 'gpt-7-sol', 'pinned'])
  // CLEAN twin: with none named it is CODEX_MODEL.
  const plain = fake({ status: 0, stdout: clean })
  const usual = hostReview({ ...review, repo: ownRepo, run: plain.run })
  assert.deepEqual([given(plain), usual.model, lastRow().model], [CODEX_MODEL, CODEX_MODEL, CODEX_MODEL])
  // The prompt-file form, the one the skills launch through.
  const verdicts = fake({ status: 0, stdout: 'VERDICT: APPROVE\n' })
  assert.equal(promptFileReview({ argv: [...fileForm, '--model', 'gpt-7-sol'], resolve: () => '/bin/codex', run: verdicts.run }).code, 0)
  assert.deepEqual([given(verdicts), lastRow().model, lastRow().bound, lastRow().status], ['gpt-7-sol', 'gpt-7-sol', 'pinned', 'clean'])
  const usualFile = fake({ status: 0, stdout: 'VERDICT: APPROVE\n' })
  assert.equal(promptFileReview({ argv: fileForm, resolve: () => '/bin/codex', run: usualFile.run }).code, 0)
  assert.deepEqual([given(usualFile), lastRow().model], [CODEX_MODEL, CODEX_MODEL])
})

test('a --model that is not a model name is refused before anything runs', () => {
  // It becomes the value of `-m`: an option, a second word or a shell fragment is not a name, and neither is none at all.
  for (const name of ['', '-c', '--config=x', '.hidden', 'gpt 7', 'gpt-7;rm', 'gpt-7\n', 'g'.repeat(129)]) {
    const runs = fake({ status: 0, stdout: clean })
    const result = hostReview({ ...review, repo: ownRepo, model: name, run: runs.run })
    assert.deepEqual([result.status, runs.calls.length], ['unavailable', 0], JSON.stringify(name))
    assert.match(result.reason, /--model is not a model name/)
    const said = promptFileReview({ argv: [...fileForm, '--model', name], resolve: () => '/bin/codex', run: runs.run })
    assert.deepEqual([said.code, runs.calls.length], [2, 0], JSON.stringify(name))
    assert.match(said.err, /--model is not a model name/)
  }
  // `--model` with nothing after it, or with the next flag after it, is refused: never read as "the default".
  const runs = fake({ status: 0, stdout: 'VERDICT: APPROVE\n' })
  for (const argv of [[...fileForm, '--model'], ['node', 'host-review.mjs', '--model', '--host', 'codex', '--effort', 'high', '--repo', ownRepo, '--prompt-file', ownContract]]) {
    assert.deepEqual([promptFileReview({ argv, resolve: () => '/bin/codex', run: runs.run }).code, runs.calls.length], [2, 0])
  }
  assert.equal(hostReview({ ...review, repo: ownRepo, model: 7, run: runs.run }).status, 'unavailable')
  // CLEAN: the names a catalogue holds are names.
  for (const name of ['gpt-6.2-sol', 'gpt-5.5', 'codex-auto-review', 'o3', 'g'.repeat(128)]) assert.equal(MODEL_NAME.test(name), true, name)
})

test('the command line passes --model through in both forms, and refuses a bare one', t => {
  if (process.platform === 'win32') return t.skip('a #!/usr/bin/env node stub on CODEX_CLI_PATH cannot be executed on Windows')
  const stub = path.join(scratch, 'codex-names')
  writeFileSync(stub, `#!/usr/bin/env node
const a = process.argv.slice(2)
if (a[1] === '--help') process.exit(0)
require('node:fs').writeFileSync(a[a.indexOf('-o') + 1], JSON.stringify({ status: 'clean', findings: [], model: a[a.indexOf('-m') + 1] }))
`)
  chmodSync(stub, 0o755)
  const cli = args => spawnSync(process.execPath, [path.join(repoRoot, 'plugin', 'scripts', 'host-review.mjs'), '--host', 'codex', '--effort', 'high', '--repo', ownRepo, ...args],
    { encoding: 'utf8', timeout: 60_000, env: { ...process.env, CODEX_CLI_PATH: stub }, windowsHide: true })
  for (const form of [['--prompt-file', ownContract], ['--scope', 'uncommitted']]) {
    const named = cli([...form, '--model', 'gpt-7-sol'])
    assert.equal(named.status, 0, named.stderr)
    assert.equal(JSON.parse(named.stdout).model, 'gpt-7-sol', form[0])
    const usual = cli(form)
    assert.equal(usual.status, 0, usual.stderr)
    assert.equal(JSON.parse(usual.stdout).model, CODEX_MODEL, form[0])
    // DIRTY: `--model` with no name after it runs nothing and says why.
    const bare = cli([...form, '--model'])
    assert.equal(bare.status, 2, form[0])
    assert.match(`${bare.stdout}${bare.stderr}`, /--model is not a model name/, form[0])
  }
})
