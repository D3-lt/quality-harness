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
//        2 usage, it could not run, or a campaign did not finish or left a selected entry ungraded
import { spawnSync } from 'node:child_process'
import { rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { isMainModule } from '../plugin/scripts/main-module.mjs'
import { campaignPaths, loadCatalogue, writeCatalogue } from './mutate.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const mutateScript = path.join(here, 'mutate.mjs')
// The spec's Goal. `QUALITY_HARNESS_PARITY_BUDGET_MS` moves it, so a test can show the bound fails a run.
const OVERHEAD_MS = process.env.QUALITY_HARNESS_PARITY_BUDGET_MS !== undefined ? Number(process.env.QUALITY_HARNESS_PARITY_BUDGET_MS) : 2000
// Each campaign is bounded; a whole-catalogue slice takes minutes, not hours.
const CAMPAIGN_TIMEOUT_MS = 4 * 60 * 60 * 1000

const VERDICT = /^(RED|GREEN|STALE|HUNG|UNPROVEN) +(.+?)(?: +<-.*)? *$/gm

/**
 * verdictsOf reads each entry's verdict from a campaign's report lines (`RED      answer  <- …`).
 * A RED whose killers were not recoverable prints no `<-`, and is read all the same.
 */
export function verdictsOf(output) {
  const found = {}
  for (const [, verdict, label] of output.matchAll(VERDICT)) found[label] = verdict
  return found
}

/** listedLabels reads the labels `mutate.mjs --list` printed: each followed by its indented file line. */
export function listedLabels(output) {
  const lines = output.split('\n')
  return lines.filter((line, i) => line && !/^\s/.test(line) && /^ {2}\S.* -> /.test(lines[i + 1] ?? ''))
}

/**
 * incomplete says why a campaign's run cannot be compared, or null. Two runs ended by their
 * timeout after the same first row agree on every row they printed and graded nothing else, so a
 * run must finish, print its summary, and hold a verdict for every entry selected (Codex review of
 * ADR-075). Exit 1 is a finished campaign with a GREEN or a STALE, and is compared.
 */
export function incomplete(run, expected) {
  if (run.error || run.signal || (run.status !== 0 && run.status !== 1)) {
    return `it did not finish (${run.error?.code ?? run.signal ?? `exit ${run.status}`})`
  }
  if (!/^\d+\/\d+ mutations were noticed\.$/m.test(run.stdout)) return 'it printed no summary'
  const found = verdictsOf(run.stdout)
  const missing = expected.filter(label => !(label in found))
  return missing.length ? `it has no verdict for ${missing.length} of the ${expected.length} selected entries, ${missing[0]} first` : null
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
      // Every catalogue file in the clone (ADR-091), each filtered in place. A per-source file
      // left empty is removed, since the campaign refuses an empty one; the single file stays.
      const loaded = loadCatalogue(clone)
      if (loaded.error) {
        process.stderr.write(`campaign-parity: ${loaded.error}\n`)
        return 2
      }
      for (const file of loaded.files) {
        file.catalogue.mutations = file.catalogue.mutations.filter(entry => entry.tests.includes(tests))
        if (!file.catalogue.mutations.length && file.path !== campaignPaths(clone).catalogue) rmSync(file.path)
        else writeCatalogue(file.path, file.catalogue)
      }
      git(clone, ['commit', '--quiet', '--no-verify', '-am', `parity: the entries whose tests include ${tests}`])
    }
    const args = ['--root', clone, '--no-cache']
    if (value('--shard')) args.push('--shard', value('--shard'))
    if (value('--case')) args.push('--case', value('--case'))
    const campaign = extra => spawnSync(process.execPath, [mutateScript, ...args, ...extra],
      { cwd: clone, encoding: 'utf8', timeout: CAMPAIGN_TIMEOUT_MS, maxBuffer: 256 * 1024 * 1024, windowsHide: true })
    // What both runs must grade: the selection, read the way the campaign reads it.
    const list = campaign(['--list', '--in-place'])
    if (list.status !== 0) {
      process.stderr.write(`campaign-parity: could not list the selection: ${list.error?.message ?? list.stderr.trim()}\n`)
      return 2
    }
    const expected = listedLabels(list.stdout)
    const inPlace = campaign(['--in-place'])
    const isolated = campaign([])
    process.stdout.write(`--- in place (exit ${inPlace.status})\n${inPlace.stdout}${inPlace.stderr}`)
    process.stdout.write(`--- isolated (exit ${isolated.status})\n${isolated.stdout}${isolated.stderr}`)
    for (const [name, run] of [['in-place', inPlace], ['isolated', isolated]]) {
      const why = incomplete(run, expected)
      if (why) {
        process.stdout.write(`parity: the ${name} campaign cannot be compared: ${why}\n`)
        return 2
      }
    }
    const a = verdictsOf(inPlace.stdout)
    const b = verdictsOf(isolated.stdout)
    const mismatches = compareRuns(a, b)
    const built = Number((isolated.stderr.match(/worktree built in (\d+) ms/) ?? [])[1])
    for (const { label, inPlace: x, isolated: y } of mismatches) process.stdout.write(`MISMATCH  ${label}: in place ${x}, isolated ${y}\n`)
    process.stdout.write(`parity: ${Object.keys(a).length} entries, ${mismatches.length} mismatches; worktree built in ${Number.isFinite(built) ? built : 'unknown'} ms\n`)
    if (!expected.length || !Number.isFinite(built)) return 2
    return mismatches.length || built > OVERHEAD_MS ? 1 : 0
  } finally {
    rmSync(clone, { recursive: true, force: true, maxRetries: 5 })
  }
}

if (isMainModule(import.meta.url)) process.exitCode = main(process.argv.slice(2))
