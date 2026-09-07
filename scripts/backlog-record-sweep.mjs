#!/usr/bin/env node
// backlog-record-sweep.mjs — does a backlog section that is not marked CLOSED
// still describe work nobody has done?
//
// BACKLOG §168, and it is §103's class read from a third side. §103 is a prose
// record asserting a live defect the code has already fixed; §93 is a commit
// claiming a section it never edited. This is the third: a section whose work
// SHIPPED, under a heading that still says PROPOSED, so a session sweeping for
// something to build finds finished work and re-proposes it.
//
// Measured 2026-09-07 on this repository: 36 of 175 sections carried no closure
// word, and among them §60 (`PROPOSED AS ADR-014`), §74 (`PROPOSED AS ADR-013`)
// and §111 (`ADR-025`) all name records that are Accepted with every task done.
// A count of "open backlog items" taken from the headings is therefore wrong by
// an amount nothing measures.
//
// ⚠ IT ASKS `adr-next`, IT DOES NOT PARSE TASK FILES. The record's state has one
// owner and it is the gate that routes work; a second reader of the same task
// files would be a second copy of the readiness rule, which is how `Consumes`
// came to be missing what `Depends-on` had (§41).
//
// It reports and never blocks (CLAUDE.md §3), and a section it could not resolve
// is UNKNOWN rather than a finding (ADR-005): an ADR that does not exist, a
// record with no tasks directory, and a gate that would not run are three
// different answers and none of them is "this section is stale".
//
// Usage:
//   node scripts/backlog-record-sweep.mjs            # every not-closed section
//   node scripts/backlog-record-sweep.mjs --all      # every section, closed too
//
// Exit code is 0 whatever it finds. A count here is a place to look.
import { execFileSync } from 'node:child_process'
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '..')

// The corpus's own closure vocabulary. A heading carrying one of these is making
// a claim about its own state and is not what this sweep is looking for.
export const CLOSED_WORDS = /\b(CLOSED|WITHDRAWN|SUPERSEDED|DECLINED|OBSOLETE)\b/

/** Every `## N. heading` in the backlog, with the body that follows it. */
export function sections (markdown) {
  const out = []
  let current = null
  for (const line of markdown.split('\n')) {
    const m = /^##\s+(\d+)\.\s*(.*)$/.exec(line)
    if (m) {
      current = { number: Number(m[1]), heading: m[2].trim(), body: [] }
      out.push(current)
      continue
    }
    if (current) current.body.push(line)
  }
  return out.map(s => ({ ...s, body: s.body.join('\n') }))
}

/** The ADR ids a section names, in its heading and its body, without duplicates. */
/**
 * The ADR ids a section CLAIMS ITS OWN WORK LIVES IN, without duplicates.
 *
 * ⚠ THE HEADING, OR A PROPOSAL PHRASE — NEVER A BARE BODY MENTION. The first cut
 * took every `ADR-NNN` anywhere in the section and reported 20 findings on a
 * 39-section read, most of them sections that merely CITE a record in passing:
 * "§43 Two outside papers, read 2026-08-28" mentions ADR-009 as a reference and
 * is not made stale by ADR-009 finishing. A sweep whose findings are mostly
 * noise is one a reader learns to skim, which is the whole cost ADR-037 is about.
 * A section is only making a claim about ITSELF when its title names the record,
 * or when it says in so many words that this is where the work went.
 */
export function recordsNamed (section) {
  const ids = new Set()
  for (const m of section.heading.matchAll(/\bADR-(\d{3})\b/g)) ids.add(m[1])
  for (const m of section.body.matchAll(
    /\b(?:PROPOSED AS|DEFERRED TO|TRACKED AS|BECAME|BECOMES|MOVED TO|LIVES IN|SUPERSEDED BY)\s+ADR-(\d{3})\b/gi)) {
    ids.add(m[1])
  }
  return [...ids].sort()
}
/**
 * What `adr-next` says about one record, or an `unknown` with the reason.
 * `run` is the seam: every process goes through it, so a host with no python is
 * reachable from a test (CLAUDE.md §7).
 */
export function recordState (id, { root = repoRoot, run = defaultRun } = {}) {
  const dir = join(root, 'docs', 'adr')
  if (!existsSync(dir)) return { id, state: 'unknown', why: `no ${dir}` }
  const match = readdirSync(dir).filter(n => n.startsWith(`ADR-${id}-`) && !n.endsWith('.md'))
  if (match.length !== 1) {
    return { id, state: 'unknown', why: `${match.length} record directories match ADR-${id}-` }
  }
  const recordDir = join(dir, match[0])
  const file = join(dir, `${match[0]}.md`)
  if (!existsSync(file)) return { id, state: 'unknown', why: `no record file beside ${match[0]}/` }
  const status = (/^\*\*Status:\*\*\s*(.+)$/m.exec(readFileSync(file, 'utf8')) ?? [])[1]?.trim()
  const routed = run(['adr-next', '--json', recordDir], root)
  if (!routed.ok) return { id, state: 'unknown', why: `adr-next did not run: ${routed.why}` }
  let parsed
  try {
    parsed = JSON.parse(routed.out)
  } catch (err) {
    return { id, state: 'unknown', why: `adr-next printed no JSON: ${err.message}` }
  }
  const open = ['ready', 'blocked', 'stopped'].flatMap(k => parsed[k] ?? [])
  const done = (parsed.done ?? []).length
  if (done === 0 && open.length === 0) return { id, state: 'unknown', why: 'no tasks to judge', status }
  return {
    id,
    status,
    state: open.length === 0 && /^accepted\b/i.test(status ?? '') ? 'shipped' : 'live',
    detail: `Status ${status ?? '(none)'}, ${done} done, ${open.length} not done`,
  }
}

function defaultRun (argv, cwd) {
  try {
    const out = execFileSync('python3', [join(repoRoot, 'plugin', 'bin', argv[0]), ...argv.slice(1)],
      { cwd, encoding: 'utf8', timeout: 120_000, stdio: ['ignore', 'pipe', 'pipe'] })
    return { ok: true, out }
  } catch (err) {
    // adr-next exits 3 when nothing is ready, which is a real answer and prints
    // JSON. Only an absent interpreter or a crash is could-not-look.
    if (err.status === 3 && typeof err.stdout === 'string') return { ok: true, out: err.stdout }
    return { ok: false, why: err.status === undefined ? (err.message ?? 'no exit status') : `exit ${err.status}` }
  }
}

/** Sections that name records, judged. `all` includes ones already marked closed. */
export function sweep (markdown, { all = false, ...opts } = {}) {
  const cache = new Map()
  const state = id => {
    if (!cache.has(id)) cache.set(id, recordState(id, opts))
    return cache.get(id)
  }
  const findings = []
  for (const section of sections(markdown)) {
    if (!all && CLOSED_WORDS.test(section.heading)) continue
    const ids = recordsNamed(section)
    if (ids.length === 0) continue
    const states = ids.map(state)
    // A section is only flagged when EVERY record it names has shipped. One live
    // record is enough for the section to still be about something.
    if (states.every(s => s.state === 'shipped')) {
      findings.push({ section, verdict: 'shipped', states })
    } else if (states.every(s => s.state === 'unknown')) {
      findings.push({ section, verdict: 'unknown', states })
    }
  }
  return findings
}

export function main (argv = []) {
  const all = argv.includes('--all')
  const markdown = readFileSync(join(repoRoot, 'docs', 'BACKLOG.md'), 'utf8')
  const findings = sweep(markdown, { all })
  const total = sections(markdown).filter(s => all || !CLOSED_WORDS.test(s.heading)).length
  console.log(`backlog-record-sweep: ${total} section(s) read${all ? '' : ', closed ones skipped'}`)
  for (const f of findings) {
    const label = f.verdict === 'unknown' ? 'COULD NOT LOOK' : 'RECORD SHIPPED'
    console.log(`  ${label}  §${f.section.number}  ${f.section.heading.slice(0, 88)}`)
    for (const s of f.states) console.log(`      ADR-${s.id}: ${s.detail ?? s.why}`)
  }
  if (findings.length === 0) {
    console.log('  every section that names a record names one with work still open.')
  }
  console.log('\nRECORD SHIPPED means the records this section names are Accepted with every task'
    + '\ndone. That is a place to look, NOT a verdict that the section is stale: a section may'
    + '\nlegitimately outlive its record, and a record being finished says nothing about the'
    + '\nprose around it. COULD NOT LOOK is not a finding at all.')
  return 0
}

// `pathToFileURL`, never a `file://` template — on Windows the template never
// matches and the script exits 0 having printed nothing, which is a could-not-look
// wearing a clean exit (measured 2026-09-03, see backlog-claim-sweep.mjs).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main(process.argv.slice(2)))
}
