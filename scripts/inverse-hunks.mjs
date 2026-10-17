#!/usr/bin/env node
// inverse-hunks.mjs — ADR-109 T1: how many of a commit's own hunks do its tests not see?
//
// For each plugin commit in a range, take its `git diff -U0` hunks outside tests/, and in a worktree of that commit break one
// hunk at a time: the INVERSE (the original lines put back, `git apply -R` of that hunk alone) and three operators applied to
// the hunk's new lines where they match (a comparison flipped, a boolean literal flipped, a number nudged by one). The commit's
// tests run against each. A failing test is `noticed`, a green run `unnoticed`, and anything that could not be judged
// (does not parse, no tests to run, a baseline that was not green, no leaf results, a timeout) is `inconclusive`: could-not-look
// is never a verdict (ADR-005).
//
// A MEASUREMENT, not evidence. It never runs in place, never writes a Verification Log or Mutation Log row, and writes nothing
// into the repository it measures beyond the worktrees it adds and removes (ADR-016 says what a mutant row is; this is not one).
// The verdicts are `scripts/mutate.mjs`'s own: `baselineOf`, `classify`, `leafTestsRun`, `testArgs`, `childEnv`.
//
// A commit's "own tests" are an approximation: the tests/*.test.mjs it touched, else the files the catalogue entries
// (tests/mutations/**.json) naming the hunk's path list. The counts are a floor on what a per-plan run would find.
//
// Usage: node scripts/inverse-hunks.mjs [--repo DIR] [--range A..B] [--timeout-ms N] [--budget-min N] [--max-load N] [--wait-min N] [--no-wait]
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { isMainModule } from '../plugin/scripts/main-module.mjs'
import { baselineOf, childEnv, classify, leafTestsRun, testArgs } from './mutate.mjs'

export const KINDS = ['inverse', 'comparison', 'boolean', 'numeric']
const GIT_TIMEOUT_MS = 120000
const SOURCE = /\.(mjs|cjs|js|py)$/
const COMMENT = /^\s*(\/\/|#|\*|\/\*)/
const FLIP = { '===': '!==', '!==': '===', '==': '!=', '!=': '==', '<=': '>', '>=': '<', '<': '>=', '>': '<=' }
const BOOLEAN = { true: 'false', false: 'true', True: 'False', False: 'True' }
// An arrow, `->`, a shift and a generic are not comparisons: the lookarounds keep `<` and `>` to a lone one.
const COMPARISON = /===|!==|==|!=|<=|>=|(?<![=<>-])<(?![<=])|(?<![=<>-])>(?![>=])/
const NUMBER = /(?<![\w.$])(\d+)(?![\w.])/

const sh = (cmd, args, { cwd, timeout = GIT_TIMEOUT_MS, env } = {}) =>
  spawnSync(cmd, args, { cwd, env, encoding: 'utf8', timeout, windowsHide: true, maxBuffer: 1 << 28 })
const git = (cwd, args, timeout) => sh('git', ['-c', 'core.quotepath=off', ...args], { cwd, timeout })

/** The three operators on one line of source: the line mutated, or null where the operator has nothing to act on. */
export function operatorsOn(line) {
  if (COMMENT.test(line)) return { comparison: null, boolean: null, numeric: null }
  const swap = (re, to) => (re.test(line) ? line.replace(re, to) : null)
  return {
    comparison: swap(COMPARISON, op => FLIP[op]),
    boolean: swap(/\b(true|false|True|False)\b/, word => BOOLEAN[word]),
    numeric: swap(NUMBER, digits => String(Number(digits) + 1)),
  }
}

/** The hunks of a `git diff -U0` text, each with the one-hunk patch that `git apply -R --unidiff-zero` takes. */
export function parseHunks(diff) {
  const hunks = []
  for (const block of diff.split(/^(?=diff --git )/m)) {
    const file = /^diff --git a\/(.+) b\/\1$/m.exec(block)
    const at = block.search(/^@@ /m)
    if (!file || at < 0) continue
    const header = block.slice(0, at)
    for (const text of block.slice(at).split(/^(?=@@ )/m)) {
      const m = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(text)
      if (!m) continue
      const body = text.split('\n').slice(1)
      hunks.push({
        path: file[1],
        newStart: Number(m[3]),
        newCount: m[4] === undefined ? 1 : Number(m[4]),
        added: body.filter(l => l.startsWith('+')).map(l => l.slice(1)),
        patch: header + (text.endsWith('\n') ? text : `${text}\n`),
      })
    }
  }
  return hunks
}

/**
 * The verdict of one run against a baseline, by mutate.mjs's classify. Only an observed pass or failure of tests that ran is
 * a verdict; a run with no leaf results (a file that did not load), a timeout and a baseline that was not green are not.
 */
export function verdictOf({ baseline, run, files }) {
  if (baseline.state !== 'pass') return { verdict: 'inconclusive', detail: `baseline ${baseline.state}` }
  if (run.signal || run.status === null) return { verdict: 'inconclusive', detail: 'the run timed out' }
  if (!leafTestsRun(run.stdout, files)) return { verdict: 'inconclusive', detail: 'the run had no leaf results' }
  const { verdict } = classify({ occurrences: 1, baseline, run })
  return verdict === 'RED' ? { verdict: 'noticed' } : { verdict: 'unnoticed' }
}

/** Does the file still parse? `ok: true` also for a kind of file there is no parser for here. */
function parses(file, cwd) {
  const ext = path.extname(file)
  const run = (cmd, args) => sh(cmd, args, { cwd, timeout: 60000, env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } })
  let r
  if (['.mjs', '.cjs', '.js'].includes(ext)) r = run(process.execPath, ['--check', file])
  else if (ext === '.py') r = run('python3', ['-I', '-c', 'import sys; compile(open(sys.argv[1], encoding="utf-8").read(), sys.argv[1], "exec")', file])
  else if (ext === '.sh') r = run('bash', ['-n', file])
  else if (ext === '.json') { try { JSON.parse(readFileSync(path.join(cwd, file), 'utf8')); return { ok: true } } catch (e) { return { ok: false, why: String(e.message) } } }
  else return { ok: true }
  return r.status === 0 ? { ok: true } : { ok: false, why: (r.stderr || r.error?.message || 'did not parse').split('\n')[0] }
}

/** file -> the test files the catalogue entries for it name, read from tests/mutations/**.json in the tree. */
function catalogueOf(tree) {
  const byFile = new Map()
  const dir = path.join(tree, 'tests', 'mutations')
  if (!existsSync(dir)) return byFile
  for (const name of readdirSync(dir, { recursive: true })) {
    if (!String(name).endsWith('.json')) continue
    let entries
    try { entries = JSON.parse(readFileSync(path.join(dir, String(name)), 'utf8')).mutations } catch { continue }
    for (const entry of Array.isArray(entries) ? entries : []) {
      if (typeof entry?.file !== 'string' || !Array.isArray(entry.tests)) continue
      if (!byFile.has(entry.file)) byFile.set(entry.file, new Set())
      for (const t of entry.tests) byFile.get(entry.file).add(t)
    }
  }
  return byFile
}

/** One fence run: the tests, spawned the way the campaign spawns them, in a scratch temp dir removed when it ends. */
function fence(tree, tests, timeout) {
  const scratch = mkdtempSync(path.join(realpathSync(os.tmpdir()), 'qh-inverse-run-'))
  try { return sh(process.execPath, testArgs(tree, { tests }), { cwd: tree, timeout, env: childEnv(process.env, scratch) }) }
  finally { rmSync(scratch, { recursive: true, force: true }) }
}

/** Put the worktree back to its commit: tracked files restored, anything a mutated run left behind removed. */
function restore(tree) {
  git(tree, ['checkout', '-q', '--', '.'])
  git(tree, ['clean', '-fdq'])
}

/** The mutation of each kind that applies to a hunk: kind -> a function that applies it in the tree, or nothing for a kind that does not apply. */
function mutationsOf(hunk, tree, work) {
  const kinds = { inverse: () => {
    const patch = path.join(work, 'hunk.patch')
    writeFileSync(patch, hunk.patch)
    const r = git(tree, ['apply', '-R', '--unidiff-zero', '--whitespace=nowarn', patch])
    return r.status === 0 ? { ok: true } : { ok: false, why: 'the revert did not apply' }
  } }
  if (!SOURCE.test(hunk.path) || existsSync(path.join(tree, hunk.path)) === false) return kinds
  const file = path.join(tree, hunk.path)
  const lines = readFileSync(file, 'utf8').split('\n')
  for (const kind of KINDS.slice(1)) {
    for (let i = hunk.newStart - 1; i < hunk.newStart - 1 + hunk.newCount; i++) {
      const changed = lines[i] === undefined ? null : operatorsOn(lines[i])[kind]
      if (changed === null) continue
      kinds[kind] = () => { writeFileSync(file, [...lines.slice(0, i), changed, ...lines.slice(i + 1)].join('\n')); return { ok: true } }
      break
    }
  }
  return kinds
}

/** The plugin commits of a range, oldest first, merges left out. */
function commitsOf(repo, range, spec) {
  const r = git(repo, ['log', '--reverse', '--no-merges', '--format=%H%x09%s', range, '--', spec])
  if (r.status !== 0) throw new Error(`git log ${range}: ${r.stderr}`)
  return r.stdout.split('\n').filter(Boolean).map(l => { const [sha, ...subject] = l.split('\t'); return { sha, subject: subject.join('\t') } })
}

function measureCommit({ repo, sha, spec, timeoutMs, deadline, now, counts }) {
  const diff = git(repo, ['diff', '-U0', '--no-color', '--no-ext-diff', '--no-renames', '--src-prefix=a/', '--dst-prefix=b/', `${sha}^`, sha, '--', spec])
  if (diff.status !== 0) return { skipped: `no parent diff: ${diff.stderr.trim()}`, hunks: [] }
  const hunks = parseHunks(diff.stdout).filter(h => !/(^|\/)tests\//.test(h.path))
    .map(h => ({ path: h.path, newStart: h.newStart, kinds: {}, hunk: h }))
  const spent = () => now() > deadline
  const touched = git(repo, ['diff', '--name-only', `${sha}^`, sha, '--', 'tests']).stdout.split('\n').filter(f => /^tests\/[^/]+\.test\.mjs$/.test(f))
  const work = mkdtempSync(path.join(realpathSync(os.tmpdir()), 'qh-inverse-'))
  const tree = path.join(work, 'tree')
  try {
    const added = spent() ? { status: 1 } : git(repo, ['worktree', 'add', '--detach', '-q', tree, sha])
    const baselines = new Map()
    const catalogue = added.status === 0 ? catalogueOf(tree) : new Map()
    for (const entry of hunks) {
      const { hunk } = entry
      delete entry.hunk
      if (spent() || added.status !== 0) { entry.kinds.inverse = { verdict: 'notrun', detail: spent() ? 'budget spent' : 'worktree not added' }; continue }
      const own = touched.length ? touched : [...(catalogue.get(hunk.path) ?? [])]
      const tests = own.filter(t => existsSync(path.join(tree, t))).sort()
      const files = tests.map(t => path.join(tree, t))
      const key = tests.join('\0')
      if (tests.length && !baselines.has(key)) {
        const run = fence(tree, tests, timeoutMs)
        counts.baselineRuns++
        baselines.set(key, { baseline: baselineOf(run, files), run })
      }
      for (const [kind, apply] of Object.entries(mutationsOf(hunk, tree, work))) {
        if (spent()) { entry.kinds[kind] = { verdict: 'notrun', detail: 'budget spent' }; continue }
        if (!tests.length) { entry.kinds[kind] = { verdict: 'inconclusive', detail: 'no test names this file' }; continue }
        const done = apply()
        const syntax = done.ok ? parses(hunk.path, tree) : { ok: true }
        if (!done.ok) entry.kinds[kind] = { verdict: 'inconclusive', detail: done.why }
        else if (!syntax.ok && existsSync(path.join(tree, hunk.path))) entry.kinds[kind] = { verdict: 'inconclusive', detail: `does not parse: ${syntax.why}` }
        else {
          const run = fence(tree, tests, timeoutMs)
          counts.runs[kind]++
          entry.kinds[kind] = verdictOf({ baseline: baselines.get(key).baseline, run, files })
        }
        restore(tree)
      }
    }
  } finally {
    git(repo, ['worktree', 'remove', '--force', tree])
    git(repo, ['worktree', 'prune'])
    rmSync(work, { recursive: true, force: true })
  }
  return { hunks }
}

/**
 * Measure a range. Returns `{ commits: [{ sha, subject, hunks: [{ path, newStart, kinds: { <kind>: { verdict, detail } } }] }], runs,
 * baselineRuns, loads }`. A kind that does not apply to a hunk is absent from its `kinds`; `notrun` is a hunk the budget did not reach.
 */
export function measure({ repo, range, path: spec = 'plugin/', timeoutMs = 300000, deadline = Infinity, now = Date.now, loadOf = () => os.loadavg()[0] }) {
  const counts = { runs: Object.fromEntries(KINDS.map(k => [k, 0])), baselineRuns: 0 }
  const loads = []
  const commits = []
  for (const { sha, subject } of commitsOf(repo, range, spec)) {
    loads.push(loadOf())
    const started = now()
    const before = { ...counts.runs }
    const found = measureCommit({ repo, sha, spec, timeoutMs, deadline, now, counts })
    commits.push({ sha, subject, ...found, ms: now() - started, runs: Object.fromEntries(KINDS.map(k => [k, counts.runs[k] - before[k]])) })
  }
  loads.push(loadOf())
  return { commits, runs: counts.runs, baselineRuns: counts.baselineRuns, loads }
}

/** Wait, bounded, for the 1-minute load to fall to `limit`; `contended` when it never did. `sleep` and `load` are seams for the test. */
export function waitForLoad({ limit = 10, waitMs = 20 * 60000, pollMs = 60000, load = () => os.loadavg()[0], sleep = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms), now = Date.now } = {}) {
  const started = now()
  let seen = load()
  while (seen > limit && now() - started < waitMs) {
    sleep(Math.min(pollMs, waitMs - (now() - started)))
    seen = load()
  }
  return { contended: seen > limit, waitedMs: now() - started, load: seen }
}

const tally = hunks => {
  const t = Object.fromEntries(KINDS.map(k => [k, { n: 0, noticed: 0, unnoticed: 0, inconclusive: 0, notrun: 0 }]))
  for (const h of hunks) for (const [k, v] of Object.entries(h.kinds)) { t[k].n++; t[k][v.verdict]++ }
  return t
}
const cell = c => `${c.n}: ${c.noticed}/${c.unnoticed}/${c.inconclusive}${c.notrun ? ` +${c.notrun} unrun` : ''}`

/** The table the owner reads: per commit and in total, one column per kind, then fence runs per unnoticed hunk found. */
export function renderTable(result, { contended = false, load = null } = {}) {
  const rows = result.commits.map(c => ({ name: `${c.sha.slice(0, 8)} ${c.subject.slice(0, 38)}`, hunks: c.hunks.length, t: tally(c.hunks), secs: Math.round((c.ms ?? 0) / 1000), note: c.skipped }))
  const all = tally(result.commits.flatMap(c => c.hunks))
  rows.push({ name: 'total', hunks: result.commits.reduce((n, c) => n + c.hunks.length, 0), t: all, secs: Math.round(result.commits.reduce((n, c) => n + (c.ms ?? 0), 0) / 1000) })
  const widths = [Math.max(...rows.map(r => r.name.length), 6), 6, ...KINDS.map(k => Math.max(k.length, ...rows.map(r => cell(r.t[k]).length)))]
  const line = cells => cells.map((c, i) => String(c).padEnd(widths[i])).join(' | ').trimEnd()
  const out = []
  if (contended) out.push('CONTENDED: the load stayed above the limit; every number below is unattributable to the code alone.')
  out.push('cells are  n: noticed/unnoticed/inconclusive  (n = hunks the kind applied to)')
  out.push(line(['commit', 'hunks', ...KINDS, 'secs']))
  for (const r of rows) out.push(line([r.name, r.hunks, ...KINDS.map(k => cell(r.t[k])), r.secs]) + (r.note ? `  [${r.note}]` : ''))
  const hunks = result.commits.flatMap(c => c.hunks)
  const per = (runs, found) => (found === 0 ? '-' : (runs / found).toFixed(1))
  out.push('')
  out.push('fence runs per unnoticed hunk found (mutation runs of the kind / its unnoticed):')
  for (const k of KINDS) out.push(`  ${k.padEnd(11)} ${result.runs[k]} runs / ${all[k].unnoticed} unnoticed = ${per(result.runs[k], all[k].unnoticed)}`)
  const anyUnnoticed = hunks.filter(h => Object.values(h.kinds).some(v => v.verdict === 'unnoticed')).length
  const sum = Object.values(result.runs).reduce((a, b) => a + b, 0)
  out.push(`  all kinds   ${sum} mutation runs + ${result.baselineRuns} baseline runs / ${anyUnnoticed} hunks unnoticed by some kind = ${per(sum + result.baselineRuns, anyUnnoticed)}`)
  const invU = h => h.kinds.inverse?.verdict === 'unnoticed'
  const opU = h => KINDS.slice(1).some(k => h.kinds[k]?.verdict === 'unnoticed')
  out.push(`hunks unnoticed by the inverse only: ${hunks.filter(h => invU(h) && !opU(h)).length}; by an operator only: ${hunks.filter(h => !invU(h) && h.kinds.inverse?.verdict === 'noticed' && opU(h)).length}; by both: ${hunks.filter(h => invU(h) && opU(h)).length}`)
  if (load) out.push(`load (1 min) at start ${load.start.toFixed(2)}, at end ${load.end.toFixed(2)}, highest sampled ${Math.max(...result.loads).toFixed(2)}${contended ? ' (contended)' : ''}`)
  return out.join('\n')
}

function main(argv) {
  const opt = (name, fallback) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : fallback }
  const repo = path.resolve(opt('--repo', '.'))
  const range = opt('--range', null)
  if (!range) { process.stderr.write('usage: inverse-hunks.mjs --range A..B [--repo DIR] [--timeout-ms N] [--budget-min N] [--max-load N] [--wait-min N] [--no-wait]\n'); return 2 }
  const start = os.loadavg()[0]
  const waited = argv.includes('--no-wait') ? { contended: start > Number(opt('--max-load', 10)) } : waitForLoad({ limit: Number(opt('--max-load', 10)), waitMs: Number(opt('--wait-min', 20)) * 60000 })
  const deadline = Date.now() + Number(opt('--budget-min', 60)) * 60000
  const result = measure({ repo, range, timeoutMs: Number(opt('--timeout-ms', 300000)), deadline })
  // Contended when the load was above the limit at the start of the wait OR at any sample taken while it ran: a load that fell for one reading and rose again is not a quiet machine.
  const contended = waited.contended || Math.max(...result.loads) > Number(opt('--max-load', 10))
  process.stdout.write(`${renderTable(result, { contended, load: { start, end: os.loadavg()[0] } })}\n`)
  return 0
}

if (isMainModule(import.meta.url)) process.exitCode = main(process.argv.slice(2))
