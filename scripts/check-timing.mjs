#!/usr/bin/env node
// Where did the check's time go? Stage 0 of the plan to make the check fast without letting it claim more (BACKLOG §378,
// "qh-check cannot say where its time went").
//
// Reads the per-file times scripts/selftest.sh keeps (selftest-files.jsonl, written by scripts/file-timing-reporter.mjs) and the
// check ledger beside them (checks.jsonl, written by qh-check). For each run it names the slowest files, the files that failed,
// and the check whose window holds it, with that check's contention: a timing taken on a contended machine is not compared
// with one that was not (CLAUDE.md §18). It models, from the same per-file times, how long the slowest worker takes with the
// files in the order they were listed and longest first. That is a MODEL: it counts each file's own test time and nothing of
// the process around it, and it is said as one. Across the whole ledger it counts trees that went red and then green with
// nothing changed between, the flakiness an ordering or a selection would learn from.
//
// Repository-owned and read-only. It exits 0 whatever it finds; 2 on a usage error.
//
// Usage: node scripts/check-timing.mjs [--dir <state dir>] [--runs N] [--workers N] [--summary] [--json]
// --summary reads only qh-check's own ledgers (checks.jsonl, fast-checks.jsonl), so it answers in any repository qh-check runs in.
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { isMainModule } from '../plugin/scripts/main-module.mjs'

const rows = file => {
  let text
  try { text = readFileSync(file, 'utf8') } catch { return [] }
  return text.split('\n').filter(Boolean).flatMap(line => { try { return [JSON.parse(line)] } catch { return [] } })
}

/** How long the slowest of `workers` takes when each takes the next file in `files` as soon as it is free. */
export function makespan(files, workers) {
  const free = Array.from({ length: Math.max(1, workers) }, () => 0)
  for (const { ms } of files) {
    const next = free.indexOf(Math.min(...free))
    free[next] += ms
  }
  return Math.max(...free)
}

const windowHolding = (checks, at) => {
  const when = Date.parse(at)
  // The rows are appended as each check ends, so the last window holding the moment is the check that ran it.
  for (let index = checks.length - 1; index >= 0; index -= 1) {
    const check = checks[index]
    const start = Date.parse(check?.before?.at)
    const end = Date.parse(check?.after?.at)
    if (Number.isFinite(start) && Number.isFinite(end) && when >= start && when <= end) return check
  }
  return null
}

/** Trees that went red and then green, the next check of the same command on the same tree. */
export function redThenGreen(checks) {
  let count = 0
  for (let index = 1; index < checks.length; index += 1) {
    const before = checks[index - 1]
    const after = checks[index]
    if (before?.command === after?.command && before?.after?.tree && before.after.tree === after?.after?.tree
      && before.exit !== 0 && after.exit === 0) count += 1
  }
  return count
}

export function report({ times, checks, runs = 5, workers = null }) {
  const reported = times.slice(-runs).map(row => {
    const files = Array.isArray(row.files) ? row.files : []
    const count = workers ?? (/^\d+$/.test(String(row.concurrency)) ? Number(row.concurrency) : Math.max(1, os.cpus().length - 1))
    const check = windowHolding(checks, row.at)
    return {
      at: row.at,
      files: files.length,
      summedMs: files.reduce((sum, entry) => sum + (entry.ms ?? 0), 0),
      failedFiles: files.filter(entry => entry.failed > 0).map(entry => entry.file),
      slowest: [...files].sort((a, b) => b.ms - a.ms).slice(0, 10).map(({ file, ms, tests }) => ({ file, ms, tests })),
      model: { workers: count, listedMs: makespan(files, count), longestFirstMs: makespan([...files].sort((a, b) => b.ms - a.ms), count) },
      check: check && { exit: check.exit, contended: check.contended ?? null, load: check.before?.load ?? null,
        wallMs: Date.parse(check.after.at) - Date.parse(check.before.at) },
    }
  })
  return { runs: reported, flaky: { checks: checks.length, redThenGreen: redThenGreen(checks) } }
}

const percentile = (sorted, p) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] : null)

/**
 * One line per command a check ledger holds: how often it ran and passed, how long a pass took (median and 90th percentile of
 * the passes' own windows), how many were contended, and how many went red and then green on the same tree. It reads only what
 * qh-check already wrote, so it answers in any repository qh-check runs in, with or without per-file times.
 */
export function summarize(checks) {
  const byCommand = new Map()
  for (const check of checks) {
    const key = String(check?.command ?? '(no command)')
    if (!byCommand.has(key)) byCommand.set(key, [])
    byCommand.get(key).push(check)
  }
  return [...byCommand].map(([command, list]) => {
    const passes = list.filter(check => check.exit === 0)
      .map(check => Date.parse(check?.after?.at) - Date.parse(check?.before?.at)).filter(Number.isFinite).sort((a, b) => a - b)
    return {
      command, runs: list.length, passed: passes.length,
      medianPassMs: percentile(passes, 0.5), p90PassMs: percentile(passes, 0.9),
      contended: list.filter(check => check.contended === true).length,
      // Load says contended only past the core count at the run's two ends; a run can share the machine with another check
      // all the way through and still read uncontended (a peer's survey, 2026-10-14). qh-check names those checks; count them.
      beside: list.filter(check => [check.beside, check.besideAtEnd].some(named => Array.isArray(named) && named.length > 0)).length,
      redThenGreen: redThenGreen(list),
    }
  })
}

function summaryText(ledgers) {
  const out = []
  for (const [name, lines] of ledgers) {
    if (lines.length === 0) { out.push(`${name}: no checks recorded`); continue }
    for (const line of lines) {
      const pass = line.medianPassMs === null ? 'no pass recorded' : `pass median ${seconds(line.medianPassMs)}, p90 ${seconds(line.p90PassMs)}`
      out.push(`${name}: ${line.runs} runs, ${line.passed} passed; ${pass}; ${line.contended} contended by load, ${line.beside} with another check beside them; ${line.redThenGreen} red then green on the same tree — ${line.command}`)
    }
  }
  return `${out.join('\n')}\n`
}

const seconds = ms => `${(ms / 1000).toFixed(1)} s`

function text({ runs, flaky }) {
  const out = []
  if (runs.length === 0) out.push('check-timing: no per-file times kept yet; a full run of scripts/selftest.sh keeps them')
  for (const run of runs) {
    const check = run.check
      ? `check exit ${run.check.exit}, wall ${seconds(run.check.wallMs)}, load ${Number.isFinite(run.check.load) ? run.check.load.toFixed(2) : 'unread'}${run.check.contended ? ', CONTENDED: not comparable' : ''}`
      : 'no check window holds this run: not joined'
    out.push(`${run.at} — ${run.files} files, ${seconds(run.summedMs)} of test time; ${check}`)
    out.push(`  a model: per-file times only, ${run.model.workers} workers — as listed ${seconds(run.model.listedMs)}, longest first ${seconds(run.model.longestFirstMs)}`)
    if (run.failedFiles.length) out.push(`  failed: ${run.failedFiles.join(', ')}`)
    for (const entry of run.slowest) out.push(`  ${seconds(entry.ms).padStart(9)}  ${entry.file} (${entry.tests} tests)`)
  }
  out.push(`flaky: ${flaky.redThenGreen} of ${flaky.checks} checks went red and then green on the same tree`)
  return `${out.join('\n')}\n`
}

if (isMainModule(import.meta.url)) {
  const argv = process.argv.slice(2)
  const value = name => { const at = argv.indexOf(name); return at >= 0 ? argv[at + 1] : undefined }
  const known = new Set(['--dir', '--runs', '--workers', '--json', '--summary'])
  const unknown = argv.filter((arg, index) => arg.startsWith('--') && !known.has(arg) && !known.has(argv[index - 1]))
  const runs = Number(value('--runs') ?? 5)
  const workers = value('--workers') === undefined ? null : Number(value('--workers'))
  if (unknown.length || !Number.isInteger(runs) || runs < 1 || (workers !== null && (!Number.isInteger(workers) || workers < 1))) {
    process.stderr.write('usage: check-timing.mjs [--dir <state dir>] [--runs N] [--workers N] [--summary] [--json]\n')
    process.exit(2)
  }
  let dir = value('--dir')
  if (!dir) {
    const git = spawnSync('git', ['rev-parse', '--absolute-git-dir'], { encoding: 'utf8', timeout: 10_000, windowsHide: true })
    if (git.status !== 0) { process.stderr.write('check-timing: not in a git checkout, and no --dir named\n'); process.exit(2) }
    dir = path.join(git.stdout.trim(), 'quality-harness')
  }
  if (argv.includes('--summary')) {
    const ledgers = ['checks.jsonl', 'fast-checks.jsonl'].map(name => [name, summarize(rows(path.join(dir, name)))])
    process.stdout.write(argv.includes('--json') ? `${JSON.stringify(Object.fromEntries(ledgers), null, 2)}\n` : summaryText(ledgers))
  } else {
    const result = report({ times: rows(path.join(dir, 'selftest-files.jsonl')), checks: rows(path.join(dir, 'checks.jsonl')), runs, workers })
    process.stdout.write(argv.includes('--json') ? `${JSON.stringify(result, null, 2)}\n` : text(result))
  }
}
