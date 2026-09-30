#!/usr/bin/env node
// campaign-parity.mjs — does an isolated campaign grade what an in-place one grades? (ADR-075 T4)
//
// Clones the commit under test into the repository's git directory — never under the temp root,
// for the reason spec F-9 gives — keeps only the declared entries in the clone's catalogue, commits
// that, and runs the same uncached campaign over it twice: `--in-place`, then isolated. Every
// entry's verdict must agree, a baseline that did not pass included (its verdict says so), and
// every worktree must be built in under 2 s (the spec's Goal).
//
// Usage: node scripts/campaign-parity.mjs [--root <repo>] [--tests <test file>] [--shard i/n] [--case <substring>]
// Exit:  0 no mismatch, and every worktree under 2 s · 1 a mismatch or a slow worktree ·
//        2 usage, or it could not run
import { spawnSync } from 'node:child_process'
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { isMainModule } from '../plugin/scripts/main-module.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const mutateScript = path.join(here, 'mutate.mjs')
// The spec's Goal. `QUALITY_HARNESS_PARITY_BUDGET_MS` moves it, so a test can show the bound fails a run.
const OVERHEAD_MS = process.env.QUALITY_HARNESS_PARITY_BUDGET_MS !== undefined ? Number(process.env.QUALITY_HARNESS_PARITY_BUDGET_MS) : 2000
// Each campaign is bounded; a whole-catalogue slice takes minutes, not hours.
const CAMPAIGN_TIMEOUT_MS = 4 * 60 * 60 * 1000

/** verdictsOf reads each entry's verdict from a campaign's report lines (`RED      answer  <- …`). */
function verdictsOf(output) {
  const found = {}
  for (const [, verdict, label] of output.matchAll(/^([A-Z]+)\s{2,}(.+?)\s+<-/gm)) found[label] = verdict
  return found
}

/** compareRuns lists every label whose verdict differs between two runs, or that only one ran. */
export function compareRuns(inPlace, isolated) {
  const labels = [...new Set([...Object.keys(inPlace), ...Object.keys(isolated)])].sort()
  const mismatches = []
  for (const label of labels) {
    const a = inPlace[label] ?? 'not selected'
    const b = isolated[label] ?? 'not selected'
    if (a !== b) mismatches.push({ label, inPlace: a, isolated: b })
  }
  return mismatches
}

function git(dir, args) {
  return spawnSync('git', ['-C', dir, '-c', 'user.name=parity', '-c', 'user.email=parity@localhost', ...args],
    { encoding: 'utf8', timeout: 600_000, maxBuffer: 256 * 1024 * 1024, windowsHide: true })
}

function main(argv) {
  const value = flag => (argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : null)
  const root = path.resolve(value('--root') ?? path.join(here, '..'))
  const common = git(root, ['rev-parse', '--git-common-dir'])
  if (common.status !== 0) {
    process.stderr.write(`campaign-parity: ${root} is not a git repository\n`)
    return 2
  }
  const clone = path.join(path.resolve(root, common.stdout.trim()), 'qh-parity', String(process.pid))
  const cloned = git(root, ['clone', '--quiet', '--no-local', root, clone])
  if (cloned.status !== 0) {
    process.stderr.write(`campaign-parity: could not clone: ${cloned.stderr.trim()}\n`)
    return 2
  }
  try {
    const tests = value('--tests')
    if (tests) {
      const file = path.join(clone, 'tests', 'mutations.json')
      const catalogue = JSON.parse(readFileSync(file, 'utf8'))
      catalogue.mutations = catalogue.mutations.filter(entry => entry.tests.includes(tests))
      writeFileSync(file, `${JSON.stringify(catalogue, null, 2)}\n`)
      git(clone, ['commit', '--quiet', '--no-verify', '-am', `parity: the entries whose tests include ${tests}`])
    }
    const args = ['--root', clone, '--no-cache']
    if (value('--shard')) args.push('--shard', value('--shard'))
    if (value('--case')) args.push('--case', value('--case'))
    const campaign = extra => spawnSync(process.execPath, [mutateScript, ...args, ...extra],
      { cwd: clone, encoding: 'utf8', timeout: CAMPAIGN_TIMEOUT_MS, maxBuffer: 256 * 1024 * 1024, windowsHide: true })
    const inPlace = campaign(['--in-place'])
    const isolated = campaign([])
    process.stdout.write(`--- in place (exit ${inPlace.status})\n${inPlace.stdout}${inPlace.stderr}`)
    process.stdout.write(`--- isolated (exit ${isolated.status})\n${isolated.stdout}${isolated.stderr}`)
    const a = verdictsOf(inPlace.stdout)
    const b = verdictsOf(isolated.stdout)
    const mismatches = compareRuns(a, b)
    const built = Number((isolated.stderr.match(/worktree built in (\d+) ms/) ?? [])[1])
    for (const { label, inPlace: x, isolated: y } of mismatches) process.stdout.write(`MISMATCH  ${label}: in place ${x}, isolated ${y}\n`)
    process.stdout.write(`parity: ${Object.keys(a).length} entries, ${mismatches.length} mismatches; worktree built in ${Number.isFinite(built) ? built : 'unknown'} ms\n`)
    if (!Object.keys(a).length || !Number.isFinite(built)) return 2
    return mismatches.length || built > OVERHEAD_MS ? 1 : 0
  } finally {
    rmSync(clone, { recursive: true, force: true, maxRetries: 5 })
  }
}

if (isMainModule(import.meta.url)) process.exitCode = main(process.argv.slice(2))
