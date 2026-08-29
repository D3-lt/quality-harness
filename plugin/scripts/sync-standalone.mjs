#!/usr/bin/env node
// Refresh the standalone install under the user's home from this plugin, so the
// unnamespaced entrypoints stop drifting.
//
// Gates are created wherever they are missing; templates and skills are only
// refreshed where the user already has one, because a deletion has to stay
// deleted.
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

import { FORWARDER_MARK, backupRoot, linkPlan, onSearchPath, write as writeLink } from './standalone-link.mjs'

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
  // A GATE is created wherever it is missing: the standalone set exists so a
  // bare-name gate resolves, and one that is absent resolves to nothing.
  //
  // A TEMPLATE is refreshed only where one already exists, the same rule skills
  // follow below and for the same reason — a deletion has to stay deleted, or
  // the next sync undoes the user's decision and calls it an update. Nothing
  // reads the home templates directory once the bare-name skills are gone —
  // every skill names its template under the plugin root, which is always the
  // running version — so creating them is a chore that repoints every release.
  // Refreshing one the user chose to keep is still worth doing, and on Windows
  // those are real files rather than links, so this is the only thing serving
  // them at all.
  for (const [dir, whenAbsent] of [['bin', 'create'], ['templates', 'skip']]) {
    let entries = []
    try { entries = readdirSync(path.join(source, dir)) } catch { continue }
    for (const name of entries) {
      if (!statSync(path.join(source, dir, name)).isFile()) continue
      const to = path.join(home, '.claude', dir, name)
      if (whenAbsent === 'skip' && !existsSync(to)) continue
      add(path.join(source, dir, name), to)
    }
  }
  // A skill is refreshed only where one ALREADY exists. Creating one is what
  // produces a second copy of a skill the plugin already serves, and a personal
  // skill shadows the namespaced `quality-harness:<name>` it duplicates — by
  // path identity when linked, which removes the namespaced entrypoint outright.
  // Removing a bare-name skill has to stay removed, or the next sync undoes the
  // user's decision and calls it an update.
  let skills = []
  try { skills = readdirSync(path.join(source, 'skills')) } catch { skills = [] }
  for (const name of skills) {
    const to = path.join(home, '.claude', 'skills', name, 'SKILL.md')
    if (!existsSync(to)) continue
    add(path.join(source, 'skills', name, 'SKILL.md'), to)
  }
  return out
}

/**
 * Whether the standalone entry is one of our forwarders rather than a copy.
 *
 * A forwarder CANNOT byte-match the gate it forwards to — that is the whole
 * point of it — so a digest comparison calls every one of them drifted. Found
 * 2026-08-27 on a machine where `--link` had already run: sixteen false
 * `drifted` lines under one `Re-run with --apply`, which copies version-pinned
 * files over the mechanism that fixed the drift. Copy mode does not archive, so
 * following the report's own advice destroyed them with no recovery.
 */
const forwards = file => {
  try { return readFileSync(file, 'utf8').includes(FORWARDER_MARK) } catch { return false }
}

export function plan(source, home) {
  return pairs(source, home)
    .map(pair => ({ ...pair, state: !existsSync(pair.to) ? 'missing'
      : forwards(pair.to) ? 'forwarding'
      : digest(pair.from) === digest(pair.to) ? 'same' : 'drifted' }))
    // `forwarding` is as current as `same` and is excluded for the same reason:
    // naming it as work is what produced the advice that destroys it.
    .filter(entry => entry.state !== 'same' && entry.state !== 'forwarding')
}

// Copying leaves a set that drifts again on the next release; linking leaves one
// that cannot. `--link` is the answer to "why am I told about this every week".
function linkMode(root, home, apply) {
  const work = linkPlan(root, home)
  const todo = work.filter(entry => entry.state !== 'current')
  process.stdout.write(`source: ${root}\n`)
  // `--link` only ever installs GATES. A drifted template or skill is invisible
  // to it, and saying "Nothing to do" while copy mode has work is a report that
  // is true about this mode and false about the install. Reported 2026-08-28
  // from a Windows machine that still keeps the bare-name skills: `--link` said
  // nothing to do while task-template.md was behind — and a stale task template
  // has no `## Mutation Log`, so `adr-verify` cannot record a killed mutant into
  // it. The user had to read the code to find that out.
  const alsoDrifted = plan(root, home)
  if (!todo.length) {
    process.stdout.write('Every gate already forwards to this plugin — nothing for --link to do.\n')
    if (alsoDrifted.length) {
      process.stdout.write(`\nBut ${alsoDrifted.length} file(s) that --link does NOT handle are behind. `
        + 'Templates and skills are copied, never linked, and are refreshed only where you already '
        + 'keep one:\n')
      for (const entry of alsoDrifted) {
        process.stdout.write(`  ${entry.state.padEnd(8)} ${entry.to.replace(home, '~')}\n`)
      }
      process.stdout.write('Run without --link, then with --apply, to copy those.\n')
    }
    return 0
  }
  for (const entry of todo) {
    const note = entry.why ? `  (${entry.why})` : ''
    process.stdout.write(`  ${entry.state.padEnd(10)} ${entry.to.replace(home, '~')}${note}\n`)
  }
  const writable = todo.filter(entry => entry.state !== 'skipped')
  const skipped = todo.length - writable.length
  if (!apply) {
    process.stdout.write(`\n${writable.length} entry(s) to install`
      + `${skipped ? `, ${skipped} left alone` : ''}. Re-run with --link --apply to write them.\n`)
    process.stdout.write('A gate becomes a forwarder that resolves the newest installed plugin at '
      + 'call time, so no release has to touch it again — nothing else is linked. Skills are not: '
      + 'a personal skill resolving to the plugin own skill directory hides '
      + '`quality-harness:<name>` entirely. Templates are not either: nothing reads them, and a '
      + 'link names one version, which dangles silently once the cache evicts it.\n')
    return 0
  }
  // One archive directory per run, named for when it ran, never reused. The
  // originals are copied before anything is removed.
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  let written = 0
  let kept = 0
  for (const entry of writable) {
    try {
      if (writeLink(entry, stamp, home)) kept += 1
      written += 1
    } catch (error) {
      process.stderr.write(`  could not write ${entry.to}: ${error.message}\n`)
    }
  }
  if (kept) {
    process.stdout.write(`\nKept ${kept} original(s) in `
      + `${backupRoot(stamp, home).replace(home, '~')}\n`)
  }
  process.stdout.write(`Installed ${written} of ${writable.length} entry(s)`
    + `${skipped ? `; ${skipped} left alone because it is not a file this plugin installed` : ''}.\n`)
  // A forwarder in a directory nothing searches resolves nothing, and this tool
  // installs no PATH entry — that has always been somebody else's shell profile.
  // Say what was observed rather than describing what a forwarder would do
  // (ADR-005): the check is against THIS process's PATH, which is the honest
  // scope, because a directory added only by an interactive profile is absent
  // from an agent's tool shell and from a CI step whatever a terminal shows.
  const reachable = writable
    .map(entry => path.dirname(entry.to))
    .filter((dir, at, all) => all.indexOf(dir) === at)
    .filter(dir => !onSearchPath(dir, process.env.PATH))
  for (const dir of reachable) {
    process.stdout.write(`\nNote: ${dir.replace(home, '~')} is NOT on this shell's PATH, so a bare `
      + 'gate name will not reach what was just installed there. Add it in a file every shell '
      + 'reads (.zshenv, not .zshrc — zsh reads .zshrc only when interactive, so an agent or a '
      + "CI step never sees it), or name the gate's full path.\n")
  }
  return written === writable.length ? 0 : 1
}

function main() {
  const apply = process.argv.includes('--apply')
  const link = process.argv.includes('--link')
  const unknown = process.argv.slice(2)
    .filter(a => a.startsWith('--') && a !== '--apply' && a !== '--link')
  if (unknown.length) {
    process.stderr.write(`unknown option: ${unknown[0]}\n`
      + 'usage: sync-standalone.mjs [--link] [--apply]\n')
    return 2
  }
  const home = os.homedir()
  const { root, version, running } = newestInstalledRoot()
  if (version && running && version !== running) {
    process.stdout.write(`Note: this script is running from ${running} but ${version} is installed; `
      + 'syncing from the newer one.\n')
  }
  if (link) return linkMode(root, home, apply)
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
    process.stdout.write(`\n${work.length} file(s) differ. Re-run with --apply to copy them, `
      + 'or with --link, which turns every gate into a forwarder that no release can leave '
      + 'behind.\n')
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
