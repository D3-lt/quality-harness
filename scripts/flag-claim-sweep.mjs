#!/usr/bin/env node
// flag-claim-sweep.mjs — a commit changed a gate's FLAG surface. Does the prose
// that describes that gate still say something true about that flag?
//
// The gap this closes was found on 2026-09-04 and it is a corpus gap, not a code
// one. A record's `Governs:` header names CODE paths, so ADR-011's resolution
// check can tell you a declared path matches nothing in the tree — it cannot tell
// you that a decision changed a gate's behaviour and the SKILL.md describing that
// gate went on asserting the old one. `plugin/skills/operating/SKILL.md` claimed
// the gates had no `--version` for as long as it took a human to notice, across
// the commit that gave all eleven of them one.
//
// WHAT THIS CATCHES, AND WHAT IT DOES NOT. This is the FLAG class only. The same
// day produced three other stale claims and none of them is reachable from here:
// `docs/mcp.md` saying "Five tools" when there were seven (a COUNT), adr-next's
// documented three states when it had grown a fourth (a VOCABULARY), and the
// evals README's missing tag convention (an ABSENCE — nothing to key on at all).
// Those stay open. A sweep that claimed the class would be exactly the defect
// that motivated it.
//
// WHY THIS KEY. Measured 2026-09-04 over the 109 commits touching plugin/bin/,
// keyed five ways. The last column is what a reader would have to open:
//
//   key                                       findings  commits firing
//   gate name, all docs                          295         4
//   gate name, served prose only                  48         4
//   touched-line flags, served prose              76        21
//   touched-line flags + doc names a gate         76        21
//   flag SET difference + doc names a gate         1         1
//
// Only the last is readable, and the one thing it reports is the defect this was
// written for: `plugin/skills/operating/SKILL.md` asserting the gates have no
// `--version`, across `d0f6c24`, the commit that gave all eleven of them one.
// Zero false positives over the whole history.
//
// Two filters do that work and neither is decoration. The SET DIFFERENCE is why
// a commit that reflows a help block is not a commit that changed a flag — the
// touched-line rows above are the same check without it, and they report six
// flags for one such commit. The GATE-NAME requirement drops `codex-advise` and
// `codex-review`, which name `--version` about the `codex` binary rather than
// about anything here; it was checked against the true positive before being
// adopted, since `operating/SKILL.md` names `qh-root` and a filter that killed
// the one instance would have been the finding instead.
//
// It reports and never blocks (CLAUDE.md §3), and it keeps "nothing to report"
// apart from "could not look" (ADR-005): a commit at which the prose corpus is
// empty is UNKNOWN, never clean. A count here is a place to look, not a defect
// count.
//
// Usage:
//   node scripts/flag-claim-sweep.mjs [<git range>]   # default: origin/main..HEAD
//   node scripts/flag-claim-sweep.mjs --all           # every commit touching plugin/bin/
import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

const GATES_DIR = 'plugin/bin'

/**
 * The long flags a text declares.
 *
 * Shape only — a `--flag` anywhere in the gate's source, which in these files is
 * either an argparse declaration or the help string beside it.
 */
export function flagsIn(text) {
  const found = new Set()
  for (const m of String(text ?? '').matchAll(/--([a-z][a-z0-9-]{1,30})\b/g)) found.add(`--${m[1]}`)
  return found
}

/**
 * The flags a commit ADDED to or REMOVED from the gates' surface.
 *
 * This compares whole-file flag SETS either side of the commit, and that choice
 * is the difference between a readable check and an unreadable one. Reading the
 * `+`/`-` lines of a diff instead — the first shape this was written in — reports
 * every flag whose LINE was touched, so one commit that reflows a help block
 * yields `--cwd --from --human --mutant --to --why` and the whole run comes to 76
 * findings across 21 commits. Measured on this repository 2026-09-04; the set
 * difference gives 2. A flag whose text moved is not a flag whose surface
 * changed, and only the latter can invalidate a claim about it.
 */
export function flagsChanged(before, after) {
  const b = flagsIn(before)
  const a = flagsIn(after)
  const out = new Set()
  for (const f of a) if (!b.has(f)) out.add(f)
  for (const f of b) if (!a.has(f)) out.add(f)
  return [...out].sort()
}

/**
 * Does this prose name any of the gates?
 *
 * The gate list is derived from the tree at the commit rather than written down
 * here, so a gate added later is covered without this file being edited — the
 * failure mode of a hardcoded list is that it goes stale in exactly the way this
 * script exists to detect.
 */
export function namesGate(text, gates) {
  const body = String(text ?? '')
  return gates.some(g => new RegExp(`(?<![\\w-])${g.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`).test(body))
}

/**
 * Does this prose make a claim about this flag?
 *
 * The boundary matters in both directions: `--version` must not match
 * `--versions`, and must not match the `--version` inside `--no-version`.
 */
export function namesFlag(text, flag) {
  return new RegExp(`(?<![\\w-])${flag.replace(/-/g, '\\-')}(?![\\w-])`).test(String(text ?? ''))
}

/**
 * Is this path prose that this project SERVES to a user or an agent?
 *
 * The backlog and the ADR corpus are deliberately out. Both are history: an ADR
 * describing the behaviour as it was when the decision was taken is correct and
 * must not be rewritten, and a backlog entry recording a defect is supposed to
 * describe the defect. Including them was the difference between 21 candidates
 * and 2.
 */
export function isServedProse(path) {
  if (path.startsWith('docs/adr/')) return false
  if (path === 'docs/BACKLOG.md') return false
  if (/^plugin\/skills\/[^/]+\/SKILL\.md$/.test(path)) return true
  if (/^plugin\/[^/]*README\.md$/.test(path)) return true
  if (/^plugin\/evals\/README\.md$/.test(path)) return true
  return /^docs\/[^/]+\.md$/.test(path)
}

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
}

/** The gate basenames present at a commit, from git rather than from the disk (CLAUDE.md §8). */
function gatesAt(sha) {
  try {
    return git(['ls-tree', '--name-only', sha, `${GATES_DIR}/`])
      .split('\n').filter(Boolean).map(p => p.slice(GATES_DIR.length + 1)).filter(Boolean)
  } catch { return [] }
}

/** The served-prose paths at a commit. */
function proseAt(sha) {
  try {
    return git(['ls-tree', '-r', '--name-only', sha]).split('\n').filter(Boolean).filter(isServedProse)
  } catch { return [] }
}

/**
 * The whole text of every gate at a commit, concatenated.
 *
 * Concatenating is deliberate: the question is what the SURFACE offers, and a
 * flag that moved from one gate to another has not changed what a user can type.
 */
function gateSourceAt(sha) {
  const paths = gatesAt(sha).map(name => `${GATES_DIR}/${name}`)
  return paths.map(p => { try { return git(['show', `${sha}:${p}`]) } catch { return '' } }).join('\n')
}

export function main(argv) {
  if (argv[0] === '--help' || argv[0] === '-h') {
    console.log('Usage: node scripts/flag-claim-sweep.mjs [<git range>|--all]')
    return 0
  }
  const range = argv[0] === '--all' ? null : (argv[0] ?? 'origin/main..HEAD')
  let commits
  try {
    commits = git(['log', '--no-merges', '--format=%H', ...(range ? [range] : []), '--', `${GATES_DIR}/`])
      .split('\n').filter(Boolean)
  } catch {
    console.log(`UNRUN: could not list commits for ${range ?? 'the whole history'} — nothing was checked.`)
    return 0
  }

  const findings = []
  const unknown = []
  let checked = 0
  for (const sha of commits) {
    const parent = `${sha}~1`
    const flags = flagsChanged(gateSourceAt(parent), gateSourceAt(sha))
    if (flags.length === 0) continue
    // The prose as it stood BEFORE the commit. That is the text whose claims the
    // commit may have invalidated; reading the post-image would ask whether the
    // author fixed it in the same commit, which is a different and weaker question.
    const gates = gatesAt(parent)
    const prose = proseAt(parent)
    if (gates.length === 0 || prose.length === 0) {
      unknown.push({ sha: sha.slice(0, 7), reason: `no ${gates.length === 0 ? 'gates' : 'served prose'} at ${parent}` })
      continue
    }
    const subject = git(['log', '-1', '--format=%s', sha]).trim()
    for (const path of prose) {
      let text
      try { text = git(['show', `${parent}:${path}`]) } catch { continue }
      if (!namesGate(text, gates)) continue
      const hit = flags.filter(f => namesFlag(text, f))
      if (hit.length > 0) findings.push({ sha: sha.slice(0, 7), subject, path, flags: hit })
    }
    checked += 1
  }

  console.log(`${commits.length} commit(s) touching ${GATES_DIR}/; ${checked} changed a flag surface.`)
  for (const f of findings) {
    console.log(`  RE-READ  ${f.sha}  ${f.flags.join(' ')}\n      ${f.subject}\n      ${f.path} names this gate and this flag as it stood before the commit`)
  }
  for (const u of unknown) console.log(`  COULD NOT LOOK  ${u.sha}  ${u.reason}`)
  if (findings.length === 0 && checked > 0) console.log('  no served prose named a flag these commits changed.')
  if (checked === 0 && commits.length > 0) console.log('  no commit in this range changed a flag surface.')
  return 0
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exit(main(process.argv.slice(2)))
}
