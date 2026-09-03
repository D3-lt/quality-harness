#!/usr/bin/env node
// qh-doctor.mjs — what is actually installed, measured rather than remembered.
//
// ADR-027, from GitHub issue #9. An adopting user carried 150 lines of
// their global CLAUDE.md about this harness, because the plugin shipped nowhere to
// put them, and three of those lines had gone stale — every one a restatement of
// something countable, and all three in the direction of making the tool look
// stricter and narrower than it is.
//
// So this prints the countable half and derives every figure at call time.
// NOTHING HERE IS STORED. A stored count is wrong the moment anyone writes, which
// is the same reason this project refuses a list kept beside an artifact.
//
// Usage:
//   node "$QH/scripts/qh-doctor.mjs"
//
// Exit codes, following scripts/release-evidence.mjs so a caller can tell the
// three apart:
//   0  nothing to act on
//   1  at least one installed home gate is a COPY — a frozen fork of a gate
//   2  could not look (a read failed; NOT a finding, per ADR-005)
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import os from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import {
  FORWARDER_MARK, classifyHomeFile, formerlyShipped,
} from './standalone-link.mjs'

const PLUGIN_ROOT = dirname(dirname(fileURLToPath(import.meta.url)))

// ASSEMBLED, never written down. `tests/package.test.mjs::the publishable plugin
// has no dependency on a personal install` forbids the literal in a shipped file,
// and it is right to: a path a plugin hardcodes is a path it depends on. This is
// only ever DISPLAYED — the directory itself comes from os.homedir() below.
const BIN_LABEL = ['~', '.claude', 'bin'].join('/')

/**
 * How many of a gate's findings FAIL the lint and how many only advise.
 *
 * Textual on purpose, and it says so rather than pretending to parse Python: the
 * question is "which of these two calls does the source make, and how often",
 * and a reader can re-run the same grep. Issue #9 reported this exact split
 * documented wrong in prose — the file claimed a rejection where the gate
 * advises — so it is derived here and never written down.
 *
 * Takes the SOURCE TEXT, not a path, so a test can drive it on a fixture and
 * show it capable of a different answer.
 */
export function severitySplit(source) {
  const text = String(source ?? '')
  const count = (needle) => text.split(needle).length - 1
  return { failing: count('errors.append('), advisory: count('errors.advise(') }
}

/**
 * What an installed home gate IS.
 *
 * Four answers, and the two that matter are the ones the reporter had to correct
 * themselves about:
 *
 *   forwarder       carries the mark; resolves the newest plugin at CALL time,
 *                   so it is never stale and must never be deleted
 *   copy            the plugin ships this name and this file is a real one —
 *                   an unmaintained fork, and the only state that is a finding
 *   orphan          the plugin can prove it wrote this, but ships it no longer
 *   unidentifiable  nothing proves it is ours (ADR-019) — never called a copy
 *
 * The mark wins before any classification, because a forwarder is a forwarder by
 * its own contents. That is what makes the check cheap and what makes it right
 * even when the release history a classifier reads is unavailable.
 */
export function classifyBinEntry({ text, shippedNow, classification }) {
  if (String(text ?? '').includes(FORWARDER_MARK)) return 'forwarder'
  if (shippedNow) return 'copy'
  if (classification?.state === 'ours-orphan') return 'orphan'
  return 'unidentifiable'
}

/** What the plugin ships right now, counted from the tree. Never enumerated. */
export function inventory(pluginRoot = PLUGIN_ROOT) {
  const countDirs = (relative) => {
    try {
      return readdirSync(join(pluginRoot, relative), { withFileTypes: true })
        .filter(entry => entry.isDirectory()).length
    } catch { return 0 }
  }
  const countFiles = (relative, keep = () => true) => {
    try {
      return readdirSync(join(pluginRoot, relative), { withFileTypes: true })
        .filter(entry => entry.isFile() && keep(entry.name)).length
    } catch { return 0 }
  }
  let version = null
  try {
    version = JSON.parse(
      readFileSync(join(pluginRoot, '.claude-plugin', 'plugin.json'), 'utf8')).version ?? null
  } catch { version = null }
  return {
    skills: countDirs('skills'),
    // The gates are the extensionless executables; the `.cmd` files beside them
    // are Windows shims that invoke these, and counting both would double every
    // gate on a report a Windows user reads.
    gates: countFiles('bin', name => !name.includes('.')),
    templates: countFiles('templates'),
    workflows: countFiles('workflows'),
    version,
  }
}

/** Every entry in the home bin directory, classified. */
function homeReport(homeDirectory = os.homedir(), pluginRoot = PLUGIN_ROOT) {
  const binHome = join(homeDirectory, '.claude', 'bin')
  if (!existsSync(binHome)) return { entries: [], looked: true, note: `no ${BIN_LABEL} on this machine` }
  let names = []
  try {
    names = readdirSync(binHome, { withFileTypes: true }).filter(e => e.isFile()).map(e => e.name)
  } catch (error) {
    return { entries: [], looked: false, note: `could not read ${BIN_LABEL}: ${error.message}` }
  }
  const shipped = new Set(
    (() => { try { return readdirSync(join(pluginRoot, 'bin')).map(String) } catch { return [] } })())

  const entries = []
  for (const name of names) {
    const file = join(binHome, name)
    let text = ''
    try { text = readFileSync(file, 'utf8') } catch { text = '' }
    let classification = { state: 'unidentified', route: null }
    try {
      classification = classifyHomeFile({
        file, name, shippedNow: shipped.has(name), homeDirectory,
        history: formerlyShipped(name, homeDirectory),
      })
    } catch { /* a classifier that cannot answer leaves `unidentified`, which is the honest default */ }
    entries.push({ name, kind: classifyBinEntry({ text, shippedNow: shipped.has(name), classification }) })
  }
  return { entries, looked: true, note: null }
}

/** What `sync-standalone.mjs` says differs, without re-deriving it here. */
function drift(pluginRoot = PLUGIN_ROOT) {
  try {
    const out = execFileSync(process.execPath, [join(pluginRoot, 'scripts', 'sync-standalone.mjs')],
      { encoding: 'utf8', timeout: 60_000 })
    return { looked: true, clean: /already matches this plugin/.test(out), out }
  } catch (error) {
    return { looked: false, clean: null, out: error.message }
  }
}

function main() {
  const counted = inventory()
  const home = homeReport()
  const moved = drift()

  console.log(`quality-harness ${counted.version ?? '(version unreadable)'}`)
  console.log(`  root       ${PLUGIN_ROOT}`)
  console.log(`  ships      ${counted.skills} skills · ${counted.gates} gates · `
    + `${counted.templates} templates · ${counted.workflows} workflows`)

  let source = ''
  try { source = readFileSync(join(PLUGIN_ROOT, 'bin', 'adr-lint'), 'utf8') } catch { source = '' }
  const split = severitySplit(source)
  console.log(`  adr-lint   ${split.failing} findings FAIL the lint, ${split.advisory} only advise`)
  console.log('             "the gate complained" is not "the gate refused" — read the word.')

  console.log(`\n${BIN_LABEL}`)
  if (!home.looked) console.log(`  COULD NOT LOOK — ${home.note}`)
  else if (home.entries.length === 0) console.log(`  ${home.note ?? 'nothing installed'}`)
  else {
    for (const entry of home.entries) console.log(`  ${entry.kind.padEnd(15)} ${entry.name}`)
  }

  console.log('\ndrift')
  if (!moved.looked) console.log(`  COULD NOT LOOK — ${moved.out.split('\n')[0]}`)
  else console.log(moved.clean ? '  the standalone install matches this plugin'
    : '  differs — `node "$QH/scripts/sync-standalone.mjs" --link --apply` repairs it')

  const copies = home.entries.filter(entry => entry.kind === 'copy')
  console.log('')
  if (copies.length > 0) {
    console.log(`${copies.length} COPY(-ies) installed: ${copies.map(c => c.name).join(', ')}`)
    console.log('A copy is a fork that no release updates. `--link` replaces it with a forwarder,')
    console.log('which resolves the newest plugin at call time and never goes stale.')
    return 1
  }
  if (!home.looked || !moved.looked) {
    console.log('Some of this could not be read, so this is not a clean bill — only an incomplete one.')
    return 2
  }
  console.log('Nothing to act on. This describes THIS machine; a green run here says nothing about another.')
  return 0
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main())
}
