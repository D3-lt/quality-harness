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
import { CODEX_MODEL, CODEX_TIMEOUT_MS, REVIEWS_FILE, codexInvocation, codexModel, hostReview, promptFileReview } from '../plugin/scripts/host-review.mjs'

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
  assert.match(skill, /-m <first-ranked-model> /)
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

// BACKLOG §474 (the owner, 2026-11-19): the reviewer is the model the installed Codex ranks first, not a name a release
// must change. A fake whose `debug --help` answers with `help`, whose `debug models --bundled` answers with `listed`, and
// whose every other call is the review itself.
const DEBUG_HELP = 'Debugging tools\n\nCommands:\n  models        Render the raw model catalog as JSON\n  help          Print this message\n'
const entry = (slug, priority, efforts = ['high', 'xhigh'], visibility = 'list') => ({ slug, priority, visibility, supported_reasoning_levels: efforts.map(effort => ({ effort })) })
const catalogued = (listed, help = { status: 0, stdout: DEBUG_HELP }) => {
  const calls = []
  const run = (bin, args, options) => {
    calls.push({ bin, args, options })
    if (args[0] === 'debug' && args[1] === '--help') return help
    if (args[1] === '--help') return { status: 0, stdout: 'Usage: codex exec\n' }
    if (args[0] !== 'debug') return { status: 0, stdout: clean }
    return Array.isArray(listed) ? { status: 0, stdout: JSON.stringify({ models: listed }) } : typeof listed === 'string' ? { status: 0, stdout: listed } : listed
  }
  const given = () => { const argv = calls.find(call => call.args[0] === 'exec' && call.args[1] !== '--help').args; return argv[argv.indexOf('-m') + 1] }
  return { calls, run, given, listing: () => calls.find(call => call.args[0] === 'debug' && call.args[1] === 'models'), pick: options => codexModel({ ...options, run }) }
}

// A repository of this file's own for the runs below: each leaves a review row, and `/repo` resolves to wherever the
// state directory falls back to (Codex review of cccf5af8, finding 4).
const ownRepo = path.join(scratch, 'own')
mkdirSync(ownRepo)
assert.equal(spawnSync('git', ['init', '-q'], { cwd: ownRepo, encoding: 'utf8', timeout: 30_000, windowsHide: true }).status, 0)
const mine = { ...review, repo: ownRepo }
test('the reviewer is the model the installed Codex ranks first for the effort', () => {
  // A hidden model and one that does not offer the effort both rank above the reviewer, and are not it.
  const runs = catalogued([entry('gpt-old-sol', 4), entry('gpt-new-sol', 1), entry('gpt-new-astra', 2), entry('gpt-hidden', 0, ['high'], 'hide'), entry('gpt-low-only', 0, ['low'])])
  const result = hostReview({ ...mine, run: runs.run, pick: runs.pick })
  assert.equal(runs.given(), 'gpt-new-sol')
  assert.deepEqual([result.status, result.model, result.bound, result.modelNote], ['clean', 'gpt-new-sol', 'pinned', undefined])
  // Its row is in this file's own repository, naming the model the launcher asked for.
  assert.equal(JSON.parse(readFileSync(path.join(ownRepo, '.git', 'quality-harness', REVIEWS_FILE), 'utf8').trim().split('\n').at(-1)).model, 'gpt-new-sol')
  // The effort decides: the model first for `high` that does not offer `ultra` is not the `ultra` reviewer.
  const ultra = catalogued([entry('gpt-new-sol', 1, ['high']), entry('gpt-deep', 3, ['high', 'ultra'])])
  hostReview({ ...mine, effort: 'ultra', run: ultra.run, pick: ultra.pick })
  assert.equal(ultra.given(), 'gpt-deep')
  // A list longer than an argument list may be is read in one pass (finding 3: `Math.min(...)` threw past 131072 rows).
  const long = catalogued([...Array.from({ length: 140_000 }, (_, row) => entry(`gpt-row-${row}`, row + 2)), entry('gpt-last-is-first', 1)])
  hostReview({ ...mine, run: long.run, pick: long.pick })
  assert.equal(long.given(), 'gpt-last-is-first')
  // The probe: stdin closed, killed hard at its own deadline, no window, and room for the 900 KB the real list takes.
  const probe = runs.listing()
  assert.deepEqual(probe.args, ['debug', 'models', '--bundled'])
  assert.equal(probe.options.stdio[0], 'ignore')
  assert.equal(probe.options.killSignal, 'SIGKILL')
  assert.equal(probe.options.windowsHide, true)
  assert.ok(probe.options.timeout > 0 && probe.options.timeout <= CODEX_TIMEOUT_MS)
  assert.ok(probe.options.maxBuffer >= 8 * 1024 * 1024, `the probe's buffer holds the list: ${probe.options.maxBuffer}`)
})

test('a Codex that cannot name its first-ranked model is given the built-in one, and the result says why', () => {
  const rows = [
    ['not JSON', /not in the shape/],
    [JSON.stringify({ models: 'none' }), /not in the shape/],
    [{ status: 2, stdout: '' }, /its model list exited 2/],
    [{ error: { code: 'ENOBUFS' }, status: null }, /ENOBUFS/],
    [[entry('gpt-low-only', 1, ['low'])], /lists no model that offers high/],
    [[entry('gpt-a', 1), entry('gpt-b', 1)], /2 of its models share the first rank/],
    // A row this cannot read is could-not-tell even when a readable row ranks below it: it might be the first (finding 1).
    [[entry('--config=x', 0), entry('gpt-valid', 2)], /a row of its model list is not in the shape/],
    [[entry('gpt-text-rank', '1'), entry('gpt-valid', 2)], /a row of its model list is not in the shape/],
    [[entry('g'.repeat(200), 1), entry('gpt-valid', 2)], /a row of its model list is not in the shape/],
    [[{ slug: 'gpt-odd', priority: 1, visibility: 'list', supported_reasoning_levels: 'high' }, entry('gpt-valid', 2)], /a row of its model list is not in the shape/],
    [[null, entry('gpt-valid', 2)], /a row of its model list is not in the shape/],
    // A field holding a value never measured is not read either (review of 5bb58e48, finding 1): a misspelt visibility,
    // a rank that is not a whole number, an effort word nobody has seen, a row offering nothing.
    [[entry('gpt-typo', 1, ['high'], 'lsit'), entry('gpt-valid', 2)], /a row of its model list is not in the shape/],
    [[entry('gpt-half', 0.5), entry('gpt-valid', 2)], /a row of its model list is not in the shape/],
    [[entry('gpt-empty-effort', 1, ['high', '']), entry('gpt-valid', 2)], /a row of its model list is not in the shape/],
    [[entry('gpt-offers-nothing', 1, []), entry('gpt-valid', 2)], /a row of its model list is not in the shape/],
    // The probe itself: killed at its deadline, stopped by a signal, or never started.
    [{ error: { code: 'ETIMEDOUT' }, signal: 'SIGKILL', status: null }, /ETIMEDOUT/],
    [{ signal: 'SIGTERM', status: null }, /its model list was stopped by SIGTERM/],
    [null, /its model list could not be run/],
  ]
  for (const [listed, why] of rows) {
    const runs = catalogued(listed)
    const result = hostReview({ ...mine, run: runs.run, pick: runs.pick })
    assert.equal(runs.given(), CODEX_MODEL, JSON.stringify(listed))
    assert.deepEqual([result.status, result.model], ['clean', CODEX_MODEL], JSON.stringify(listed))
    assert.match(result.modelNote, why)
    assert.ok(result.modelNote.endsWith(`the run is given ${CODEX_MODEL}`), result.modelNote)
  }
  // A build whose `debug --help` lists no `models` command is never sent `debug models`; neither is one that could not be
  // asked, and that one is not said to have answered no.
  const noCommand = /this build lists no `debug models` command/
  const helps = [
    [{ status: 0, stdout: 'Usage: codex debug\n\nCommands:\n  app-server  Tooling\n' }, noCommand],
    [{ status: 0, stdout: 'see the models page\n' }, noCommand],
    [{ status: 0, stdout: 'Commands:\n  models-cache  Tooling\n' }, noCommand],
    [{ status: 0, stdout: 'Options:\n  models are chosen by rank\n' }, noCommand],
    [{ status: 0, stdout: 'Commands:\n  app-server  Tooling\n\nOptions:\n  models  not a command\n' }, noCommand],
    [{ status: 2, stdout: DEBUG_HELP }, /asking which commands it has exited 2/],
    [{ error: { code: 'ETIMEDOUT' }, signal: 'SIGKILL', status: null, stdout: '' }, /asking which commands it has failed: ETIMEDOUT/],
    [{ signal: 'SIGTERM', status: null }, /asking which commands it has was stopped by SIGTERM/],
    [null, /asking which commands it has could not be run/],
  ]
  for (const [help, why] of helps) {
    const runs = catalogued([entry('gpt-new-sol', 1)], help)
    const result = hostReview({ ...mine, run: runs.run, pick: runs.pick })
    assert.deepEqual([runs.given(), runs.listing()], [CODEX_MODEL, undefined], JSON.stringify(help))
    assert.match(result.modelNote, why)
  }
  // CLEAN twin: a caller that passes no `pick` starts no probe and is told nothing.
  const plain = catalogued([entry('gpt-new-sol', 1)])
  const result = hostReview({ ...mine, run: plain.run })
  assert.deepEqual([plain.given(), result.modelNote, plain.calls.some(call => call.args[0] === 'debug')], [CODEX_MODEL, undefined, false])
})

test('the prompt-file row names the model that ran, and standard error says when Codex could not name one', () => {
  const repo = path.join(scratch, 'ledger')
  mkdirSync(repo)
  const made = spawnSync('git', ['init', '-q'], { cwd: repo, encoding: 'utf8', timeout: 30_000, windowsHide: true })
  assert.equal(made.status, 0, made.stderr)
  const contract = path.join(scratch, 'contract.txt')
  writeFileSync(contract, 'CODEX-REVIEW-LEAF: read it')
  const argv = ['node', 'host-review.mjs', '--host', 'codex', '--effort', 'high', '--repo', repo, '--prompt-file', contract]
  const lastRow = () => JSON.parse(readFileSync(path.join(repo, '.git', 'quality-harness', REVIEWS_FILE), 'utf8').trim().split('\n').at(-1))
  const run = listed => (bin, args) => args[0] === 'debug' && args[1] === '--help' ? { status: 0, stdout: DEBUG_HELP } : args[1] === '--help' ? { status: 0, stdout: '' } : args[0] === 'debug' ? listed : { status: 0, stdout: 'VERDICT: APPROVE\n' }
  const launch = listed => promptFileReview({ argv, resolve: () => '/bin/codex', run: run(listed), pick: options => codexModel({ ...options, run: run(listed) }) })
  const named = launch({ status: 0, stdout: JSON.stringify({ models: [entry('gpt-new-sol', 1)] }) })
  assert.deepEqual([named.code, named.err], [0, ''])
  assert.deepEqual([lastRow().model, lastRow().bound, lastRow().status], ['gpt-new-sol', 'pinned', 'clean'])
  // DIRTY: a Codex with no such command still reviews, on the built-in model, and says so.
  const builtIn = launch({ status: 1, stdout: '' })
  assert.equal(builtIn.code, 0)
  assert.match(builtIn.err, /^host-review: the installed Codex did not name its first-ranked model \(its model list exited 1\)/)
  assert.deepEqual([lastRow().model, lastRow().bound], [CODEX_MODEL, 'pinned'])
})

test('the probe runs as the review does: the same name, in the same directory', () => {
  // Whatever file a name resolves to, both calls then run it; nothing decides which names are safe (five review rounds).
  for (const bin of ['bin/codex', 'codex', '/opt/link/../codex', 'C:bin\\codex.exe']) {
    const runs = catalogued([entry('gpt-new-sol', 1)])
    hostReview({ ...mine, resolve: () => bin, run: runs.run, pick: runs.pick })
    const review = runs.calls.find(call => call.args[0] === 'exec' && call.args[1] !== '--help')
    for (const call of runs.calls.filter(each => each.args[0] === 'debug')) {
      assert.deepEqual([call.bin, call.options.cwd, call.options.env], [review.bin, review.options.cwd, review.options.env], `${bin}: ${call.args.join(' ')}`)
    }
    assert.deepEqual([runs.given(), runs.calls.filter(each => each.args[0] === 'debug').length, review.bin], ['gpt-new-sol', 2, bin])
  }
})

test('the command line asks the installed Codex for its first-ranked model, in both forms', t => {
  if (process.platform === 'win32') return t.skip('a #!/usr/bin/env node stub on CODEX_CLI_PATH cannot be executed on Windows')
  const stub = path.join(scratch, 'codex-lists')
  writeFileSync(stub, `#!/usr/bin/env node
const a = process.argv.slice(2)
if (a[0] === 'debug' && a[1] === '--help') { console.log('Commands:\\n  models  Render the raw model catalog as JSON'); process.exit(0) }
if (a[1] === '--help') process.exit(0)
if (a[0] === 'debug') { if (process.env.STUB_LIST === 'fail') process.exit(1); console.log(JSON.stringify({ models: [${JSON.stringify(entry('gpt-stub-first', 1))}] })); process.exit(0) }
require('node:fs').writeFileSync(a[a.indexOf('-o') + 1], JSON.stringify({ status: 'clean', findings: [], model: a[a.indexOf('-m') + 1] }))
`)
  chmodSync(stub, 0o755)
  const contract = path.join(scratch, 'cli-contract.txt')
  writeFileSync(contract, 'CODEX-ADVISE-LEAF: hello')
  const cli = (form, list) => spawnSync(process.execPath, [path.join(repoRoot, 'plugin', 'scripts', 'host-review.mjs'), '--host', 'codex', '--effort', 'high', '--repo', ownRepo, ...form],
    { encoding: 'utf8', timeout: 60_000, env: { ...process.env, CODEX_CLI_PATH: stub, STUB_LIST: list }, windowsHide: true })
  for (const form of [['--prompt-file', contract], ['--scope', 'uncommitted']]) {
    const named = cli(form, 'ok')
    assert.equal(named.status, 0, named.stderr)
    assert.equal(JSON.parse(named.stdout).model, 'gpt-stub-first', form[0])
    assert.doesNotMatch(named.stderr, /did not name/, form[0])
    // DIRTY: the same Codex without a model list still reviews, on the built-in model, and standard error says why.
    const builtIn = cli(form, 'fail')
    assert.equal(builtIn.status, 0, builtIn.stderr)
    assert.equal(JSON.parse(builtIn.stdout).model, CODEX_MODEL, form[0])
    assert.match(builtIn.stderr, /host-review: the installed Codex did not name its first-ranked model \(its model list exited 1\)/, form[0])
  }
})
