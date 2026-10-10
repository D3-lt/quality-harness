// BACKLOG section 375, stage A: golden transcripts at the hook boundary. A scenario is a scripted sequence of
// hook payloads run through the real `node plugin/scripts/lifecycle.mjs` against fixture repositories, in an
// environment that holds nothing of the machine. What it said (stdout, stderr, exit) and what it left in the
// session and check ledgers are stored, with time, ids and paths normalised. A refactor of lifecycle.mjs must
// leave every transcript byte-identical; a transcript that changes is a finding, never an update to wave away.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
export const pluginDir = path.resolve(here, '..', 'plugin')
export const goldenDir = path.join(here, 'goldens')
const UPDATE = process.env.QH_GOLDEN_UPDATE === '1'

// One directory holds everything a scenario touches, so a hook that reaches for the home directory, the temp
// directory or the plugin data directory finds this run's and nothing of the machine's.
export function sandbox(t) {
  const top = realpathSync.native(mkdtempSync(path.join(process.platform === 'darwin' ? '/private/tmp' : os.tmpdir(), 'qh-golden-')))
  t.after(() => rmSync(top, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }))
  const box = { top, home: path.join(top, 'home'), data: path.join(top, 'data'), tmp: path.join(top, 'tmp'), gitConfig: path.join(top, 'gitconfig') }
  for (const dir of [box.home, box.data, box.tmp]) mkdirSync(dir, { recursive: true })
  writeFileSync(box.gitConfig, '')
  return box
}

const environment = (box, extra = {}) => ({
  PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, TZ: 'UTC', LANG: 'C', LC_ALL: 'C',
  HOME: box.home, USERPROFILE: box.home, TMPDIR: box.tmp, TMP: box.tmp, TEMP: box.tmp,
  CLAUDE_PLUGIN_DATA: box.data, CLAUDE_PLUGIN_ROOT: pluginDir,
  GIT_CONFIG_GLOBAL: box.gitConfig, GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 'qh', GIT_AUTHOR_EMAIL: 'qh@example.invalid', GIT_COMMITTER_NAME: 'qh', GIT_COMMITTER_EMAIL: 'qh@example.invalid',
  GIT_AUTHOR_DATE: '2026-01-01T00:00:00Z', GIT_COMMITTER_DATE: '2026-01-01T00:00:00Z',
  QUALITY_HARNESS_OBSERVE_BUDGET_MS: '60000', QUALITY_HARNESS_ARTIFACT_PASS_RUNNER: 'inline', QUALITY_HARNESS_SLOW_HOOK_MS: '600000',
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

export function runHook(box, repo, session, payload, extraEnv = {}) {
  const run = spawnSync(process.execPath, [path.join(pluginDir, 'scripts', 'lifecycle.mjs')], {
    cwd: repo, input: JSON.stringify({ cwd: repo, session_id: session, ...payload }), encoding: 'utf8',
    timeout: 120_000, windowsHide: true, env: environment(box, extraEnv),
  })
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
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, '<id>')
      .replace(/\b[0-9a-f]{40}\b/g, '<sha>')
      .replace(/\b[0-9a-f]{16}\b/g, '<hash>')
      .replace(/\b(\d+(?:\.\d+)?)(ms|s)\b/g, '<n>$2')
      .replace(/"(pid|load|loadEnd|cores|ms|\w+Ms)":(?:-?[\d.]+|null)/g, '"$1":"<n>"')
    return JSON.parse(text)
  }
}

// Compare a transcript with its golden. QH_GOLDEN_UPDATE=1 writes it, and says so.
export function expectGolden(assert, name, actual) {
  const file = path.join(goldenDir, `${name}.json`)
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
