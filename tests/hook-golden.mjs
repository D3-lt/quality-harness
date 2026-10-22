// BACKLOG section 375, stage A: golden transcripts at the hook boundary. A scenario is a scripted sequence of
// hook payloads run through the real `node plugin/scripts/lifecycle.mjs` against fixture repositories, in an
// environment that holds nothing of the machine. What it said (stdout, stderr, exit) and what it left in the
// session and check ledgers are stored, with time, ids and paths normalised. A refactor of lifecycle.mjs must
// leave every transcript byte-identical; a transcript that changes is a finding, never an update to wave away.
import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
export const pluginDir = path.resolve(here, '..', 'plugin')
export const goldenDir = path.join(here, 'goldens')
const UPDATE = process.env.QH_GOLDEN_UPDATE === '1'
// ADR-110 T1: the one seam that says which implementation a scenario runs. `go` spawns the static core, `qh hook <event>`, from
// QUALITY_HARNESS_QH_BIN or the repository's core/bin/qh; anything else runs lifecycle.mjs exactly as before.
export const IMPL = process.env.QUALITY_HARNESS_HOOK_IMPL === 'go' ? 'go' : 'node'
export const QH_BIN = process.env.QUALITY_HARNESS_QH_BIN || path.resolve(here, '..', 'core', 'bin', process.platform === 'win32' ? 'qh.exe' : 'qh')

// ADR-111 T4: the rules the Node path has and the Go core does not yet, keyed by the title of the test that exercises
// each, with the record that added it. Under QUALITY_HARNESS_HOOK_IMPL=go those tests skip with this reason, and every other
// test runs against Go exactly as before. Empty since ADR-113 T1 ported ADR-111's rules; a rule the Node path gains before
// the Go core does is named here until it lands (tests/go-core-parity-adr-111.test.mjs holds it empty).
export const GO_LACKS = new Map([
])
export function goSkipFor(impl, lacks, name) {
  return impl === 'go' && lacks.has(name) ? `the Go core lacks this rule yet (${lacks.get(name)})` : false
}
export const goSkip = name => goSkipFor(IMPL, GO_LACKS, name)
// A name the list skips that no test carries is a stale entry, and a stale entry hides nothing it can be seen hiding.
export function staleLacks(lacks, sources) {
  return [...lacks.keys()].filter(name => !sources.some(text => text.includes(`test('${name}'`) || text.includes(`test("${name}"`)))
}

// One directory holds everything a scenario touches, so a hook that reaches for the home directory, the temp
// directory or the plugin data directory finds this run's and nothing of the machine's.
export function sandbox(t) {
  const top = realpathSync.native(mkdtempSync(path.join(process.platform === 'darwin' ? '/private/tmp' : os.tmpdir(), 'qh-golden-')))
  t.after(() => rmSync(top, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }))
  const box = { top, home: path.join(top, 'home'), data: path.join(top, 'data'), tmp: path.join(top, 'tmp'), bin: path.join(top, 'bin'), gitConfig: path.join(top, 'gitconfig') }
  for (const dir of [box.home, box.data, box.tmp, box.bin]) mkdirSync(dir, { recursive: true })
  writeFileSync(box.gitConfig, '')
  // The machine's own tools stay on PATH, so mrw would too, and SessionStart names it (ADR-107 T3). An mrw that fails its
  // --version sits first, so whatever is installed here never reaches a transcript.
  writeFileSync(path.join(box.bin, 'mrw'), '#!/bin/sh\nexit 1\n')
  chmodSync(path.join(box.bin, 'mrw'), 0o755)
  writeFileSync(path.join(box.bin, 'mrw.exe'), '')
  return box
}

const environment = (box, extra = {}) => ({
  PATH: `${box.bin}${path.delimiter}${process.env.PATH}`, SystemRoot: process.env.SystemRoot, TZ: 'UTC', LANG: 'C', LC_ALL: 'C',
  HOME: box.home, USERPROFILE: box.home, TMPDIR: box.tmp, TMP: box.tmp, TEMP: box.tmp,
  CLAUDE_PLUGIN_DATA: box.data, CLAUDE_PLUGIN_ROOT: pluginDir,
  GIT_CONFIG_GLOBAL: box.gitConfig, GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 'qh', GIT_AUTHOR_EMAIL: 'qh@example.invalid', GIT_COMMITTER_NAME: 'qh', GIT_COMMITTER_EMAIL: 'qh@example.invalid',
  GIT_AUTHOR_DATE: '2026-01-01T00:00:00Z', GIT_COMMITTER_DATE: '2026-01-01T00:00:00Z',
  QUALITY_HARNESS_OBSERVE_BUDGET_MS: '60000', QUALITY_HARNESS_ARTIFACT_PASS_RUNNER: 'inline', QUALITY_HARNESS_SLOW_HOOK_MS: '600000',
  QUALITY_HARNESS_SESSION_END_RUNNER: 'inline', QUALITY_HARNESS_BASELINE_RUNNER: 'off',
  ...extra,
})

export const git = (dir, box, ...args) => {
  const run = spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8', timeout: 60_000, windowsHide: true, env: environment(box) })
  if (run.status !== 0) throw new Error(`git ${args.join(' ')}: ${run.stderr}`)
  return run.stdout.trim()
}

// A committed repository holding `files` ({ relative path: text }).
export function fixtureRepo(box, name, files) {
  const dir = path.join(box.top, name)
  mkdirSync(dir, { recursive: true })
  git(dir, box, 'init', '-q')
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, file)), { recursive: true })
    writeFileSync(path.join(dir, file), text)
  }
  git(dir, box, 'add', '-A')
  git(dir, box, 'commit', '-q', '-m', 'fixture', '--no-gpg-sign')
  return realpathSync.native(dir)
}

const parse = text => { try { return JSON.parse(text) } catch { return text } }

// Every event and tool a scenario sent, as `Event` and `Event:Tool`, so a test can ask which registered hook no scenario reaches.
export const exercised = new Set()

// `implementation` names which one runs this call; by default the one the environment selects.
export function runHook(box, repo, session, payload, extraEnv = {}, implementation = { impl: IMPL, bin: QH_BIN }) {
  if (typeof payload.hook_event_name === 'string') {
    exercised.add(payload.hook_event_name)
    if (typeof payload.tool_name === 'string') exercised.add(`${payload.hook_event_name}:${payload.tool_name}`)
  }
  const [command, args] = implementation.impl === 'go'
    ? [implementation.bin, ['hook', String(payload.hook_event_name)]]
    : [process.execPath, [path.join(pluginDir, 'scripts', 'lifecycle.mjs')]]
  const run = spawnSync(command, args, {
    cwd: repo, input: JSON.stringify({ cwd: repo, session_id: session, ...payload }), encoding: 'utf8',
    timeout: 120_000, windowsHide: true, env: environment(box, extraEnv),
  })
  // A binary that is not there has said nothing, which is not a transcript: the scenario fails naming why.
  if (run.error) throw new Error(`the hook did not run (${command}): ${run.error.message}`)
  return { exit: run.status, signal: run.signal, stdout: parse(run.stdout.trim()), stderr: run.stderr.trim() }
}

// The real qh-check, so a pass the publish verdict reads is the one a session would have.
export function runQhCheck(box, repo, args = [], extraEnv = {}) {
  const run = spawnSync(process.execPath, [path.join(pluginDir, 'scripts', 'qh-check.mjs'), ...args], {
    cwd: repo, encoding: 'utf8', timeout: 180_000, windowsHide: true, env: environment(box, extraEnv),
  })
  return { exit: run.status, stdout: run.stdout.trim(), stderr: run.stderr.trim() }
}

// What the machine, not the hook, decided: the load a check ran under, the cores it ran on, and which heavy processes
// stood beside it. A transcript that records them is true on one machine on one afternoon.
const MACHINE = ['cores', 'contended', 'beside', 'besideAtEnd', 'waitedMs']
const unmachine = row => {
  if (row === null || typeof row !== 'object') return row
  for (const key of MACHINE) delete row[key]
  for (const side of ['before', 'after']) if (row[side] && typeof row[side] === 'object') delete row[side].load
  return row
}

// Everything the hooks left under the repository's state directory, as rows.
export function ledgers(repo) {
  const root = path.join(repo, '.git', 'quality-harness')
  const out = {}
  const walk = dir => {
    if (!existsSync(dir)) return
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(file)
      else if (entry.name.endsWith('.jsonl')) out[path.relative(root, file).split(path.sep).join('/')] = readFileSync(file, 'utf8').split('\n').filter(Boolean).map(line => unmachine(parse(line)))
    }
  }
  walk(root)
  return out
}

// Time, ids and places are the machine's; the sentences are the hook's.
export function normaliser(box, repos = []) {
  const places = [[box.top, '<box>'], ...repos.flatMap(repo => [[repo, '<repo>']]), [pluginDir, '<plugin>']]
    .sort((a, b) => b[0].length - a[0].length)
  return value => {
    let text = JSON.stringify(value)
    for (const [place, label] of places) text = text.split(JSON.stringify(place).slice(1, -1)).join(label)
    text = text
      .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/g, '<time>')
      // The plugin's own version is not what a transcript records: a release changes it and no hook's behaviour with it.
      .replace(/\badr-lint \d+\.\d+\.\d+\b/g, 'adr-lint <version>')
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, '<id>')
      .replace(/\b[0-9a-f]{40}\b/g, '<sha>')
      .replace(/\b[0-9a-f]{16}\b/g, '<hash>')
      // ADR-122: an item's marker hashes its text before <box> and <repo> stand in for the sandbox's paths, so it differs per run.
      .replace(/<qh:([A-Za-z0-9_.-]+)@[0-9a-f]{8}>/g, '<qh:$1@<marker>>')
      .replace(/\b(\d+(?:\.\d+)?)(ms|s)\b/g, '<n>$2')
      .replace(/"(pid|load|loadEnd|cores|ms|\w+Ms)":(?:-?[\d.]+|null)/g, '"$1":"<n>"')
      // ADR-113 T1: a parse error is each JSON parser's own words (core/hooks/checkcmd.go says so), not what the hook says.
      .replace(/is not valid JSON \((?:[^"\\]|\\.)*?\), so /g, 'is not valid JSON (<parser detail>), so ')
    return JSON.parse(text)
  }
}

// ADR-111 T2: a transcript the Go core answers another way is kept under goldens/go/, named here with the rule it lacks, and a
// Go run is compared with that one; every other golden is shared. A Go golden that is missing, or that no longer differs from
// the shared one, is stale (staleGoGoldens). Empty since ADR-113 T1.
export const GO_GOLDENS = new Map([
])
export function goldenFile(impl, name, goldens = GO_GOLDENS) {
  return path.join(impl === 'go' && goldens.has(name) ? path.join(goldenDir, 'go') : goldenDir, `${name}.json`)
}
export function staleGoGoldens(goldens = GO_GOLDENS) {
  return [...goldens.keys()].filter(name => {
    const own = path.join(goldenDir, 'go', `${name}.json`)
    const shared = path.join(goldenDir, `${name}.json`)
    return !existsSync(own) || !existsSync(shared) || readFileSync(own, 'utf8') === readFileSync(shared, 'utf8')
  })
}

// Compare a transcript with its golden. QH_GOLDEN_UPDATE=1 writes the shared one, and says so.
export function expectGolden(assert, name, actual) {
  // A Go run updates Go's own golden where it keeps one, and the shared one otherwise; a Node run always the shared one.
  const file = goldenFile(IMPL, name)
  const text = `${JSON.stringify(actual, null, 2)}\n`
  if (UPDATE) {
    mkdirSync(goldenDir, { recursive: true })
    writeFileSync(file, text)
    process.stderr.write(`hook-golden: wrote ${path.relative(path.resolve(here, '..'), file)}\n`)
    return
  }
  if (!existsSync(file)) assert.fail(`no golden for ${name}: run with QH_GOLDEN_UPDATE=1 once, and read what it wrote`)
  assert.deepEqual(actual, JSON.parse(readFileSync(file, 'utf8')), `${name}: the transcript changed - a refactor must leave it byte-identical`)
}
