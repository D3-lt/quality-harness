#!/usr/bin/env node
// ADR-138 T2: the outside run, in CI. Probes the last tag and the candidate over every pinned public corpus
// (scripts/outside-corpora.json) and every fixture corpus at the candidate, and writes one artifact that proves its own
// comparison (ADR-138 Decision 4): the run, the candidate sha, the baseline tag and sha, both cores, and per corpus its pin,
// both reports' digests, the candidate's attestation, whether the two reports say the same thing, and why not.
//
// Usage: node scripts/outside-run.mjs --candidate-core <qh binary beside its SHA256SUMS.txt> [--out outside-run.json]
//
// It exits 0 whenever it wrote the artifact, could-not-run entries included: release-evidence asks every job of the release
// run to succeed (tests/package.test.mjs), and a corpus GitHub could not serve is the evidence's question, not the job's.
// Exit 2 is a usage error, and 1 an artifact that could not be written.
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { isMainModule } from '../plugin/scripts/main-module.mjs'
import { coreAsset } from '../plugin/scripts/core-assets.mjs'

const CHILD_TIMEOUT_MS = 600_000
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
const GIT_ENV = { ...process.env, GIT_AUTHOR_NAME: 'outside-run', GIT_AUTHOR_EMAIL: 'outside-run@example.invalid',
  GIT_COMMITTER_NAME: 'outside-run', GIT_COMMITTER_EMAIL: 'outside-run@example.invalid', GIT_TERMINAL_PROMPT: '0' }
const git = (args, cwd) => spawnSync('git', args, { cwd, env: GIT_ENV, encoding: 'utf8', timeout: CHILD_TIMEOUT_MS, windowsHide: true })
const failed = (what, run) => `${what} exited ${run.error ? run.error.code ?? run.error.message : run.status}: ${String(run.stderr ?? '').trim().split('\n')[0]}`

/** The fixture corpora at the candidate: every directory under tests/fixtures/corpora, sorted. */
export function fixtureIds(root) {
  return readdirSync(path.join(root, 'tests', 'fixtures', 'corpora'), { withFileTypes: true })
    .filter(entry => entry.isDirectory()).map(entry => entry.name).sort()
}

// A fixture's bytes, digested over its sorted relative paths and contents, so the artifact names what both probes read.
function treeDigest(dir) {
  const files = []
  const walk = (at, rel) => {
    for (const entry of readdirSync(at, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(at, entry.name)
      const name = rel ? `${rel}/${entry.name}` : entry.name
      if (entry.isDirectory()) walk(full, name)
      else if (entry.isFile()) files.push(`${name}\0${sha256(readFileSync(full))}`)
    }
  }
  walk(dir, '')
  return sha256(files.join('\n'))
}

/**
 * A fixture staged as tests/corpus-matrix.test.mjs stages one: copied into its own repository with one commit, since
 * the readers ask git what is tracked. Null, or why not.
 */
export function stageFixture(source, dir) {
  try { cpSync(source, dir, { recursive: true }) } catch (error) { return `copy failed: ${error.code ?? error.message}` }
  for (const args of [['init', '-q', '-b', 'main', '.'], ['add', '.'], ['commit', '-qm', 'fixture']]) {
    const run = git(args, dir)
    if (run.error || run.status !== 0) return failed(`git ${args[0]}`, run)
  }
  return null
}

/** A public corpus at its pinned sha only, shallow. Null, or why not: a missing or moved sha is could-not-run. */
export function stagePublic(entry, dir) {
  mkdirSync(dir, { recursive: true })
  for (const args of [['init', '-q', '.'], ['fetch', '-q', '--depth', '1', entry.url, entry.sha], ['checkout', '-q', '--detach', 'FETCH_HEAD']]) {
    const run = git(args, dir)
    if (run.error || run.status !== 0) return failed(`git ${args[0]}`, run)
  }
  const head = git(['rev-parse', 'HEAD'], dir).stdout?.trim()
  return head === entry.sha ? null : `checked out ${head || 'nothing'}, not the pinned ${entry.sha}`
}

/**
 * The comparison, with its world as seams: `stage(entry)` answers null or why not, `probe(side, entry)` a report (or
 * `{ report, raw }`, or `{ error }`), `attest(entry, before, after)` the candidate's attestation or null. `compare` and
 * `explain` are the candidate's own sameOutput and diffReports (ADR-138 T1).
 */
export async function outsideRun({ root, sha, run, baseline, cores, corpora, stage, probe, attest, compare, explain }) {
  const probeModule = compare && explain ? null : await import(pathToFileURL(path.join(root, 'plugin', 'scripts', 'corpus-probe.mjs')).href)
  const same = compare ?? probeModule.sameOutput
  const why = explain ?? probeModule.diffReports
  const entries = [
    ...corpora.map(entry => ({ ...entry, kind: 'public', pin: entry.sha })),
    ...fixtureIds(root).map(name => {
      const source = path.join(root, 'tests', 'fixtures', 'corpora', name)
      return { id: `fixture:${name}`, kind: 'fixture', shape: name, source, pin: `tests/fixtures/corpora/${name}@${treeDigest(source)}` }
    }),
  ]
  const results = []
  for (const entry of entries) {
    const result = { id: entry.id, kind: entry.kind, pin: entry.pin, before: null, after: null, same: null, explanation: [], attestation: null, couldNotRun: null }
    results.push(result)
    const staged = stage(entry)
    if (staged) { result.couldNotRun = staged; continue }
    const answers = ['before', 'after'].map(side => probe(side, entry))
    const broken = answers.find(answer => !answer || answer.error)
    if (broken) { result.couldNotRun = broken?.error ?? 'the probe answered nothing'; continue }
    const [before, after] = answers.map(answer => answer.report ?? answer)
    ;[result.before, result.after] = answers.map((answer, i) => sha256(answer.raw ?? JSON.stringify([before, after][i])))
    result.same = same(before, after)
    if (!result.same) {
      try { result.explanation = why(before, after) } catch (error) { result.explanation = [`the reports differ; diffReports could not explain it: ${error.message}`] }
      if (!result.explanation.length) result.explanation = ['the reports differ in a field diffReports does not compare']
    }
    result.attestation = attest(entry, before, after) ?? null
  }
  return { version: 1, run: run ?? null, sha, baseline, cores, corpora: results }
}

function option(argv, name) {
  const index = argv.indexOf(name)
  return index >= 0 ? argv[index + 1] : undefined
}

async function main(argv) {
  const candidateCore = option(argv, '--candidate-core')
  const out = path.resolve(option(argv, '--out') ?? 'outside-run.json')
  if (!candidateCore) { process.stderr.write('usage: node scripts/outside-run.mjs --candidate-core <qh binary> [--out <file>]\n'); return 2 }
  const root = process.cwd()
  const scratch = mkdtempSync(path.join(process.env.RUNNER_TEMP || os.tmpdir(), 'qh-outside-run-'))
  const sha = git(['rev-parse', 'HEAD'], root).stdout?.trim() ?? null
  // The tag release-evidence names (release-evidence.mjs: describe on the sha's parent).
  const tag = git(['describe', '--tags', '--abbrev=0', `${sha}~1`], root).stdout?.trim() || null
  const tagSha = tag ? git(['rev-parse', `${tag}^{commit}`], root).stdout?.trim() || null : null
  const corpora = JSON.parse(readFileSync(path.join(root, 'scripts', 'outside-corpora.json'), 'utf8')).corpora
  const digestOf = file => { try { return statSync(file).isFile() ? sha256(readFileSync(file)) : null } catch { return null } }
  // The baseline: the tag's own tree, and the core it published.
  const base = path.join(scratch, 'baseline')
  // Without the candidate's own core every comparison would be of a run that could not start: said once, as could-not-run.
  let setup = !digestOf(path.resolve(candidateCore)) ? `the candidate core ${candidateCore} is not a readable file`
    : tag ? null : 'no tag reachable from the candidate\'s parent'
  let baseCore = null
  if (!setup) {
    const added = git(['worktree', 'add', '-q', '--detach', base, tag], root)
    if (added.error || added.status !== 0) setup = failed('git worktree add', added)
  }
  if (!setup) {
    const data = path.join(scratch, 'baseline-data')
    const fetched = spawnSync(process.execPath, [path.join(base, 'plugin', 'scripts', 'qh-fetch.mjs'), data], { encoding: 'utf8', timeout: CHILD_TIMEOUT_MS, windowsHide: true })
    const version = JSON.parse(readFileSync(path.join(base, 'plugin', '.claude-plugin', 'plugin.json'), 'utf8')).version
    baseCore = path.join(data, 'qh', version, coreAsset(process.platform, process.arch))
    if (fetched.status !== 0 || !digestOf(baseCore)) setup = failed('the baseline qh-fetch', fetched)
  }
  const env = { ...process.env, QUALITY_HARNESS_BASELINE_RUNNER: 'off' }
  for (const name of ['CLAUDE_ENV_FILE', 'QH_PLUGIN_ROOT', 'CLAUDE_PLUGIN_ROOT']) delete env[name]
  const dirOf = entry => path.join(scratch, 'corpora', entry.id.replace(/[^\w.-]+/g, '_'))
  const files = entry => ({ before: `${dirOf(entry)}.before.json`, after: `${dirOf(entry)}.after.json` })
  const artifact = await outsideRun({
    root, sha, run: process.env.GITHUB_RUN_ID ?? null, baseline: { tag, sha: tagSha },
    cores: { baseline: baseCore && digestOf(baseCore), candidate: digestOf(path.resolve(candidateCore)) },
    corpora,
    stage: entry => setup ?? (entry.kind === 'fixture' ? stageFixture(entry.source, dirOf(entry)) : stagePublic(entry, dirOf(entry))),
    probe: (side, entry) => {
      const plugin = side === 'before' ? path.join(base, 'plugin') : path.join(root, 'plugin')
      const core = side === 'before' ? baseCore : path.resolve(candidateCore)
      const run = spawnSync(process.execPath, [path.join(plugin, 'scripts', 'corpus-probe.mjs'), '--json'], {
        cwd: dirOf(entry), env: { ...env, QUALITY_HARNESS_QH_BIN: core }, encoding: 'utf8', timeout: CHILD_TIMEOUT_MS,
        maxBuffer: 256 * 1024 * 1024, windowsHide: true,
      })
      if (run.error || run.status !== 0) return { error: `${side} probe ${failed('corpus-probe', run)}` }
      writeFileSync(files(entry)[side], run.stdout)
      try { return { report: JSON.parse(run.stdout), raw: run.stdout } } catch { return { error: `${side} probe printed no JSON` } }
    },
    attest: entry => {
      const { before, after } = files(entry)
      const run = spawnSync(process.execPath, [path.join(root, 'plugin', 'scripts', 'corpus-probe.mjs'), '--attest', `ci-windows-${entry.shape ?? entry.id}`, after, '--since', before], {
        encoding: 'utf8', timeout: CHILD_TIMEOUT_MS, windowsHide: true,
      })
      try { return run.status === 0 ? JSON.parse(run.stdout) : { error: failed('corpus-probe --attest', run) } } catch { return { error: 'corpus-probe --attest printed no JSON' } }
    },
  })
  // The baseline worktree is registered in the candidate's repository: removed, so a local run leaves no stale entry.
  if (tag) git(['worktree', 'remove', '--force', base], root)
  try { writeFileSync(out, `${JSON.stringify(artifact, null, 2)}\n`) } catch (error) {
    process.stderr.write(`outside-run: could not write ${out}: ${error.code ?? error.message}\n`)
    return 1
  }
  const counts = artifact.corpora.reduce((sum, entry) => ({ ...sum, [entry.couldNotRun ? 'couldNotRun' : entry.same ? 'same' : 'changed']: (sum[entry.couldNotRun ? 'couldNotRun' : entry.same ? 'same' : 'changed'] ?? 0) + 1 }), {})
  process.stdout.write(`outside-run: ${artifact.corpora.length} corpora against ${tag ?? 'no tag'}: ${JSON.stringify(counts)}; wrote ${out}\n`)
  for (const entry of artifact.corpora) {
    if (entry.couldNotRun) process.stdout.write(`  ${entry.id}: could not run: ${entry.couldNotRun}\n`)
    else if (!entry.same) for (const line of entry.explanation) process.stdout.write(`  ${entry.id}: ${line}\n`)
  }
  return 0
}

if (isMainModule(import.meta.url)) process.exitCode = await main(process.argv.slice(2))
