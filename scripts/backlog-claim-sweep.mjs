#!/usr/bin/env node
// backlog-claim-sweep.mjs — did a commit that CLAIMS to deliver a backlog item
// actually touch that item's section?
//
// BACKLOG §103's class, caught from the other side. §103 is about a prose record
// asserting a live defect the code has already fixed; ten instances now. The
// tenth (§93) arrived by a route no existing check covers: `ef5b1a7`'s own
// subject line said "BACKLOG §87 CLOSED and §93 delivered", it added 38 lines to
// docs/BACKLOG.md, and every one of them went to §87. §93's section was never
// touched, so it kept telling readers to build a probe that had just shipped.
//
// §103 measured and DECLINED the anchor mechanism — pinning a section to a
// verbatim snippet — because only one of nine instances carried an anchor-shaped
// row to check. This asks a different and cheaper question that needs no anchor:
// the commit message names a section, so compare what it names against what it
// edited. Nothing has to be maintained for it to keep working.
//
// It reports and never blocks (CLAUDE.md §3), and it is careful about the
// difference between "nothing to report" and "could not look" (ADR-005): a
// section that does not exist at that commit is UNKNOWN, never a finding.
//
// Usage:
//   node scripts/backlog-claim-sweep.mjs [<git range>]   # default: origin/main..HEAD
//   node scripts/backlog-claim-sweep.mjs --all           # every commit that touches the file
//
// Exit code is 0 whatever it finds. A count here is a place to look, not a
// defect count — same reading as scripts/fence-obligation-sweep.py.
import { execFileSync } from 'node:child_process'

const BACKLOG = 'docs/BACKLOG.md'

// The corpus's own closure vocabulary, plus DELIVERED, which is the word that
// carried the instance this was written for. Matched case-insensitively because
// the corpus writes these in both sentence case and caps.
const CLAIM_WORDS = 'CLOSED|FIXED|DELIVERED|DECIDED|RESOLVED|DONE|LANDED|SHIPPED|COMPLETE'

// How far a claim word may sit from the section it claims. A section reference
// and a claim word merely sharing a LINE is not a claim: measured 2026-09-03 on
// this repository's own history, the same-line rule reported `f423857` as
// claiming §87 and §103 because its body says `… all went to §87.` on a line
// containing the word "delivered", and `… the code has closed. §103's anchor
// check …` on another. Both are prose ABOUT other sections. Proximity separates
// them, because the corpus writes a real claim adjacently — `§93 delivered`,
// `BACKLOG §112 PARTLY CLOSED` — and writes commentary at a distance.
const NEAR = 24

/**
 * The sections a message CLAIMS to have delivered.
 *
 * A claim is a section reference and a claim word WITHIN `NEAR` characters of
 * each other, in either order, on one line. Noise here is not a cosmetic
 * problem: a sweep that reports a commit's every passing mention is one people
 * learn to skim, and a skimmed check is the same as no check.
 */
export function claimedSections(message) {
  const claim = `(?:${CLAIM_WORDS})`
  const section = String.raw`§\s*(\d+)`
  // No SENTENCE BOUNDARY between the two. Both directions are needed and that
  // was measured, not assumed: across this repository's history the corpus
  // writes 62 section-then-claim (`§93 delivered`) against 9 the other way — but
  // one of the nine is `BACKLOG §87 CLOSED and §93 delivered`, the exact commit
  // this check exists for, so dropping the reverse direction would lose the
  // instance while looking tidier. What separates a claim from commentary is the
  // full stop: `CLOSED and §93` is one clause, `the code has closed. §103's
  // anchor check` is two, and only the second is prose about another section.
  const gap = `(?:(?!\\.\\s)[^\\n]){0,${NEAR}}?`
  const before = new RegExp(`${section}${gap}${claim}`, 'gi')
  const after = new RegExp(`${claim}${gap}${section}`, 'gi')
  const found = new Set()
  for (const line of String(message ?? '').split('\n')) {
    for (const re of [before, after]) {
      re.lastIndex = 0
      for (const m of line.matchAll(re)) {
        if (isForeignSection(line, m)) continue
        found.add(Number(m[1]))
      }
    }
  }
  return [...found].sort((a, b) => a - b)
}

// `§` is not owned by the backlog. This corpus also writes `CLAUDE.md §4`,
// `ADR-005 §…` and `docs/research/…-verification-is-the-bottleneck.md §8`, and
// resolving one of those against `docs/BACKLOG.md` compares a claim to a file it
// was never about. Measured 2026-09-03: `eeb2c7c` was reported for §4 because
// its body ends `And their rule is now CLAUDE.md §4`.
const FOREIGN_OWNER = /(?:CLAUDE\.md|README(?:\.md)?|ADR-\d+|\.md|\.py|\.mjs)\s*$/i

/** Is this `§N` owned by a document other than the backlog? */
function isForeignSection(line, match) {
  // Text immediately before the `§`, which is where the owning document is
  // named when there is one. BACKLOG's own references are bare or prefixed
  // `BACKLOG §`, and `BACKLOG.md` deliberately does NOT end this pattern.
  const upTo = line.slice(0, match.index + match[0].indexOf('§'))
  if (/BACKLOG(?:\.md)?\s*$/i.test(upTo)) return false
  return FOREIGN_OWNER.test(upTo)
}

/**
 * The line range `## <n>.` occupies in a version of the backlog, or null when
 * that section is not in this text.
 *
 * Null is the "could not look" answer and callers must not fold it into "no
 * finding": a section added later, or renumbered, is a question this check
 * cannot answer rather than a claim it has cleared.
 */
export function sectionRange(text, n) {
  const lines = String(text ?? '').split('\n')
  // `(superseded)` appears in real headings, so the shape is matched rather than
  // the exact string — the same heading grammar tests/package.test.mjs reads.
  const heading = /^##\s+(\d+)(?:\s*\(superseded\))?\.\s/
  let start = -1
  for (let i = 0; i < lines.length; i += 1) {
    const m = lines[i].match(heading)
    if (!m) continue
    if (start !== -1) return { start: start + 1, end: i } // 1-based, exclusive of the next heading
    if (Number(m[1]) === n) start = i
  }
  return start === -1 ? null : { start: start + 1, end: lines.length }
}

/**
 * The 1-based line numbers a diff touched in the POST-image of the file.
 *
 * Reads `@@ -a,b +c,d @@` hunk headers from a `--unified=0` diff, so a hunk is
 * exactly the changed lines and not three lines of context either side — context
 * would let an edit two sections away look like it landed in this one.
 */
export function touchedLines(diff) {
  const touched = []
  for (const m of String(diff ?? '').matchAll(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm)) {
    const start = Number(m[1])
    const count = m[2] === undefined ? 1 : Number(m[2])
    // A pure deletion is `+n,0`: nothing exists at `n` in the post-image. Record
    // the seam so a section whose content was deleted still counts as touched.
    if (count === 0) touched.push(start)
    else for (let i = 0; i < count; i += 1) touched.push(start + i)
  }
  return touched
}

/** Did this commit edit the named section? `null` when the section is absent. */
export function verdictFor({ backlogAtCommit, diff, section }) {
  const range = sectionRange(backlogAtCommit, section)
  if (range === null) return { section, verdict: 'unknown', reason: `§${section} is not a section at this commit` }
  const hits = touchedLines(diff).filter(line => line >= range.start && line <= range.end)
  return hits.length > 0
    ? { section, verdict: 'touched', lines: hits.length }
    : { section, verdict: 'untouched', reason: `the message claims §${section}; the diff of ${BACKLOG} does not reach lines ${range.start}-${range.end}` }
}

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
}

function main(argv) {
  if (argv[0] === '--help' || argv[0] === '-h') {
    console.log('Usage: node scripts/backlog-claim-sweep.mjs [<git range>|--all]')
    return 0
  }
  const range = argv[0] === '--all' ? null : (argv[0] ?? 'origin/main..HEAD')
  let commits
  try {
    commits = git([
      'log', '--no-merges', '--format=%H', ...(range ? [range] : []), '--', BACKLOG,
    ]).split('\n').filter(Boolean)
  } catch {
    console.log(`UNRUN: could not list commits for ${range ?? 'the whole history'} — nothing was checked.`)
    return 0
  }

  const findings = []
  let checked = 0
  for (const sha of commits) {
    const message = git(['log', '-1', '--format=%B', sha])
    const sections = claimedSections(message)
    if (sections.length === 0) continue
    const backlogAtCommit = git(['show', `${sha}:${BACKLOG}`])
    const diff = git(['show', '--unified=0', '--format=', sha, '--', BACKLOG])
    for (const section of sections) {
      checked += 1
      const v = verdictFor({ backlogAtCommit, diff, section })
      if (v.verdict !== 'touched') {
        findings.push({ sha: sha.slice(0, 7), subject: message.split('\n')[0], ...v })
      }
    }
  }

  console.log(`${commits.length} commit(s) touching ${BACKLOG}; ${checked} section claim(s) checked.`)
  for (const f of findings) {
    const label = f.verdict === 'unknown' ? 'COULD NOT LOOK' : 'UNTOUCHED'
    console.log(`  ${label}  ${f.sha}  §${f.section}\n      ${f.subject}\n      ${f.reason}`)
  }
  if (findings.length === 0 && checked > 0) console.log('  every claimed section was edited by the commit that claimed it.')
  console.log('\nA count here is a place to look, not a defect count. A commit may legitimately'
    + '\ndeliver code for a section and record the closure separately — this reports the'
    + '\ngap between what a message says and what it edited, which is where §93 hid.')
  return 0
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(main(process.argv.slice(2)))
}
