#!/usr/bin/env node
// Copy this plugin's gates, templates and skills over the standalone install
// under the user's home, so the unnamespaced entrypoints stop drifting.
//
// Two copies of this toolkit exist on machines that keep the compatibility
// entrypoints: the plugin, which every update replaces, and a standalone set
// under the user's home, which nothing updates. Measured 2026-08-26: nine of eleven
// standalone skills had drifted, and the standalone `/adr-write` was 28 lines
// behind — missing adr-judge, adr-context and the rewritten record contract
// entirely. An agent reaching for the bare `/adr-write` gets that one, because
// both names are offered and the bare one looks like the obvious choice.
//
// REPORTS BY DEFAULT, WRITES ONLY WITH --apply. This touches files outside any
// repository; nothing here runs from a hook, and the harness never calls it.
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { createHash } from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(path.dirname(fileURLToPath(import.meta.url)))

/** Newest version by semver order, or null when none parse. */
export function newestVersion(names) {
  const parsed = names
    .map(name => ({ name, parts: /^(\d+)\.(\d+)\.(\d+)$/.exec(name)?.slice(1, 4).map(Number) }))
    .filter(entry => entry.parts)
  if (!parsed.length) return null
  parsed.sort((a, b) => b.parts[0] - a.parts[0] || b.parts[1] - a.parts[1] || b.parts[2] - a.parts[2])
  return parsed[0].name
}

/**
 * The newest copy of this plugin on disk, which is not always the running one.
 *
 * Claude Code can keep serving a cached version after an update, so syncing from
 * whatever happens to be executing would copy last week's files over the
 * standalone set and call it done. Reported 2026-08-26: "even with updated
 * plugin and restart claude uses older cache".
 */
export function newestInstalledRoot(runningRoot = HERE, homeDirectory = os.homedir()) {
  const cache = path.join(homeDirectory, '.claude', 'plugins', 'cache',
    'quality-harness', 'quality-harness')
  let versions = []
  try { versions = readdirSync(cache) } catch { return { root: runningRoot, version: null } }
  const newest = newestVersion(versions.filter(name => existsSync(path.join(cache, name, 'bin'))))
  if (!newest) return { root: runningRoot, version: null }
  const running = /([\d.]+)$/.exec(runningRoot)?.[1] ?? null
  return { root: path.join(cache, newest), version: newest, running }
}

const digest = file => {
  try { return createHash('sha256').update(readFileSync(file)).digest('hex') } catch { return null }
}

// Every pairing the standalone install mirrors. Skills are directories whose
// comparable file is one level down.
function pairs(source, home) {
  const out = []
  const add = (from, to) => {
    if (existsSync(from)) out.push({ from, to })
  }
  for (const [dir, target] of [['bin', 'bin'], ['templates', 'templates']]) {
    let entries = []
    try { entries = readdirSync(path.join(source, dir)) } catch { continue }
    for (const name of entries) {
      if (!statSync(path.join(source, dir, name)).isFile()) continue
      add(path.join(source, dir, name), path.join(home, '.claude', target, name))
    }
  }
  let skills = []
  try { skills = readdirSync(path.join(source, 'skills')) } catch { skills = [] }
  for (const name of skills) {
    add(path.join(source, 'skills', name, 'SKILL.md'),
      path.join(home, '.claude', 'skills', name, 'SKILL.md'))
  }
  return out
}

export function plan(source, home) {
  return pairs(source, home)
    .map(pair => ({ ...pair, state: !existsSync(pair.to) ? 'missing'
      : digest(pair.from) === digest(pair.to) ? 'same' : 'drifted' }))
    .filter(entry => entry.state !== 'same')
}

function main() {
  const apply = process.argv.includes('--apply')
  const unknown = process.argv.slice(2).filter(a => a.startsWith('--') && a !== '--apply')
  if (unknown.length) {
    process.stderr.write(`unknown option: ${unknown[0]}\nusage: sync-standalone.mjs [--apply]\n`)
    return 2
  }
  const home = os.homedir()
  const { root, version, running } = newestInstalledRoot()
  if (version && running && version !== running) {
    process.stdout.write(`Note: this script is running from ${running} but ${version} is installed; `
      + 'syncing from the newer one.\n')
  }
  const work = plan(root, home)
  process.stdout.write(`source: ${root}\n`)
  if (!work.length) {
    process.stdout.write('The standalone install already matches this plugin. Nothing to do.\n')
    return 0
  }
  for (const entry of work) {
    process.stdout.write(`  ${entry.state.padEnd(8)} ${entry.to.replace(home, '~')}\n`)
  }
  if (!apply) {
    process.stdout.write(`\n${work.length} file(s) differ. Re-run with --apply to copy them.\n`)
    return 0
  }
  let written = 0
  for (const entry of work) {
    try {
      mkdirSync(path.dirname(entry.to), { recursive: true })
      copyFileSync(entry.from, entry.to)
      written += 1
    } catch (error) {
      process.stderr.write(`  could not write ${entry.to}: ${error.message}\n`)
    }
  }
  process.stdout.write(`\nCopied ${written} of ${work.length} file(s).\n`)
  // Executable bits are not copied by copyFileSync on every platform, and a
  // gate that is not executable is a gate that silently does not run.
  if (process.platform !== 'win32') {
    process.stdout.write(`If a standalone gate stops running, chmod +x ${path.join(home, '.claude', 'bin')}/*\n`)
  }
  return written === work.length ? 0 : 1
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  process.exitCode = main()
}
