// BACKLOG §103's class, from the side no existing check covers: a commit whose
// MESSAGE claims to deliver a backlog section, against what its diff actually
// edited. `ef5b1a7` said "BACKLOG §87 CLOSED and §93 delivered", put all 38 of
// its backlog lines in §87, and left §93 telling readers to build a probe that
// had just shipped.
//
// Every threshold asserted here was MEASURED on this repository's own history
// rather than chosen, and each test says what it measured. A sweep's real
// failure mode is not missing an instance — it is reporting enough noise that
// people stop reading it, at which point it has the same value as no sweep.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

import {
  claimedSections, sectionRange, touchedLines, verdictFor,
} from '../scripts/backlog-claim-sweep.mjs'

test('a claim is a section and a claim word next to each other, in either direction', () => {
  // BOTH directions are needed and that was measured, not assumed: across this
  // repository's history the corpus writes 62 section-then-claim against 9 the
  // other way — and one of the nine is the commit this check exists for.
  assert.deepEqual(claimedSections('BACKLOG §112 PARTLY CLOSED — the tutorial is replayed'), [112])
  assert.deepEqual(claimedSections('BACKLOG §87 CLOSED and §93 delivered'), [87, 93])
})

test('prose ABOUT another section is not a claim on it', () => {
  // The false positives this check produced on its own author's commits before
  // the proximity and sentence-boundary rules existed. `f423857` claimed §93 and
  // was reported as claiming §87 and §103 as well, from these two lines.
  const body = [
    'BACKLOG §93 PARTLY CLOSED — the entry told a reader to build what was already built',
    '',
    "ef5b1a7's subject says \"§93 delivered\" and its 38 BACKLOG lines all went to §87.",
    'asserting a live GAP the code has closed. §103\'s anchor check would not catch it —',
  ].join('\n')
  assert.deepEqual(claimedSections(body), [93],
    'only §93 is claimed; §87 and §103 are commentary')
})

test('§ is not owned by the backlog', () => {
  // `eeb2c7c` was reported for §4 because its body ends "And their rule is now
  // CLAUDE.md §4". Resolving that against docs/BACKLOG.md compares a claim to a
  // file it was never about.
  assert.deepEqual(claimedSections('And their rule is now CLAUDE.md §4, because it was closed'), [])
  assert.deepEqual(claimedSections('ADR-005 §3 closed'), [])
  // And the backlog's own prefix must still resolve, or the exclusion has eaten
  // the thing it was meant to protect.
  assert.deepEqual(claimedSections('BACKLOG §99 closed'), [99])
  assert.deepEqual(claimedSections('§99 closed'), [99])
})

test('a message with no claim yields nothing, and that is not an error', () => {
  assert.deepEqual(claimedSections('README: name the hosts and hand over an installer'), [])
  assert.deepEqual(claimedSections(''), [])
  assert.deepEqual(claimedSections(undefined), [])
})

test('a section range ends at the next heading, and an absent section is null', () => {
  const text = ['## 1. first', 'a', 'b', '## 2. second', 'c', '## 3. third'].join('\n')
  assert.deepEqual(sectionRange(text, 1), { start: 1, end: 3 })
  assert.deepEqual(sectionRange(text, 2), { start: 4, end: 5 })
  assert.deepEqual(sectionRange(text, 3), { start: 6, end: 6 })
  // NULL, not an empty range. A section that does not exist at this commit is a
  // question the check cannot answer, and folding it into "no finding" is the
  // exact move ADR-005 forbids.
  assert.equal(sectionRange(text, 4), null)
  // `(superseded)` appears in real headings and must not hide a section.
  assert.deepEqual(sectionRange('## 7 (superseded). old\nx', 7), { start: 1, end: 2 })
})

test('touched lines come from the post-image, and a pure deletion still counts', () => {
  assert.deepEqual(touchedLines('@@ -10,2 +10,3 @@'), [10, 11, 12])
  // `+n,0` is a deletion: nothing exists at n afterwards, but the section was
  // edited. Dropping this would let "I deleted the stale paragraph" read as
  // "never touched it".
  assert.deepEqual(touchedLines('@@ -5,4 +4,0 @@'), [4])
  assert.deepEqual(touchedLines(''), [])
})

test('the verdict tells touched, untouched and could-not-look apart', () => {
  const backlogAtCommit = ['## 87. a', 'x', 'y', '## 93. b', 'z'].join('\n')
  // Touched: the edit lands inside §87's range.
  assert.equal(verdictFor({ backlogAtCommit, diff: '@@ -2,1 +2,1 @@', section: 87 }).verdict, 'touched')
  // Untouched: the same edit, asked about §93 — the ef5b1a7 shape exactly.
  assert.equal(verdictFor({ backlogAtCommit, diff: '@@ -2,1 +2,1 @@', section: 93 }).verdict, 'untouched')
  // Could not look: §99 is not a section here.
  assert.equal(verdictFor({ backlogAtCommit, diff: '@@ -2,1 +2,1 @@', section: 99 }).verdict, 'unknown')
})

test('end to end on a real repository, both answers from one sweep', () => {
  // Through `git`, because the unit assertions above test the LOGIC and the
  // report came in through a commit — CLAUDE.md §4. `scratchRepo` is a temp
  // directory this test created; it is never the repository under test, and the
  // name is deliberately unlike `repoRoot` (CLAUDE.md §9).
  const temp = mkdtempSync(join(os.tmpdir(), 'qh-claim-sweep-'))
  const scratchRepo = join(temp, 'work')
  mkdirSync(join(scratchRepo, 'docs'), { recursive: true })
  const git = (...args) => execFileSync('git', args, { cwd: scratchRepo, encoding: 'utf8', timeout: 60_000 })
  const backlog = join(scratchRepo, 'docs', 'BACKLOG.md')
  // Resolved from THIS file, not from `process.cwd()` — a test that only works
  // when the runner happens to start in the repository root is a test that
  // depends on who is asking (CLAUDE.md §8).
  const script = fileURLToPath(new URL('../scripts/backlog-claim-sweep.mjs', import.meta.url))
  const sweep = () => execFileSync(process.execPath, [script, '--all'],
    { cwd: scratchRepo, encoding: 'utf8', timeout: 60_000 })

  // `§` MUST NOT travel through argv. On Windows an argument crosses
  // CreateProcess through the system codepage, so `git commit -m 'BACKLOG §87'`
  // hands git a mangled byte and the sweep then finds no claim at all — which is
  // how this test first failed in CI while passing on macOS. CLAUDE.md §2
  // already says to write commit messages with `-F`; the reason it gives is
  // backticks, and this is the same rule paying out for a different character.
  // The file is written by Node as UTF-8, so git receives the bytes intended.
  const commit = (message) => {
    const path = join(temp, 'msg.txt')
    writeFileSync(path, message, 'utf8')
    git('add', '-A')
    git('commit', '-q', '-F', path)
  }

  try {
    git('init', '-b', 'main', '.')
    git('config', 'user.email', 'sweep@example.invalid')
    git('config', 'user.name', 'sweep')

    writeFileSync(backlog, ['# Backlog', '', '## 87. one', 'body', '', '## 93. two', 'body', ''].join('\n'))
    commit('seed the backlog')

    // The honest commit: claims §87 and edits §87.
    writeFileSync(backlog, ['# Backlog', '', '## 87. one', 'body CLOSED here', '', '## 93. two', 'body', ''].join('\n'))
    commit('BACKLOG §87 CLOSED — and the diff proves it')
    const honest = sweep()
    assert.match(honest, /1 section claim\(s\) checked/,
      `the claim must be SEEN before its verdict means anything\n${honest}`)
    assert.match(honest, /every claimed section was edited/,
      `a commit that edits what it claims must produce no finding\n${honest}`)

    // The ef5b1a7 shape: claims §87 AND §93, edits only §87.
    writeFileSync(backlog, ['# Backlog', '', '## 87. one', 'body CLOSED here', 'more', '', '## 93. two', 'body', ''].join('\n'))
    commit('BACKLOG §87 CLOSED and §93 delivered')
    const out = sweep()
    // Three, not two: `--all` counts every commit in the scratch repo, so the
    // honest commit's §87 claim is still in the tally alongside this commit's
    // two. Asserting the count at all is the point — the Windows failure this
    // fixture was hardened for showed up as ZERO claims seen, which the verdict
    // assertions below cannot distinguish from a clean sweep.
    assert.match(out, /3 section claim\(s\) checked/, `all three claims must be seen\n${out}`)
    assert.match(out, /UNTOUCHED[\s\S]*§93/, `the unedited claimed section must be reported\n${out}`)
    assert.doesNotMatch(out, /UNTOUCHED\s+\w+\s+§87/, `the edited section must not be\n${out}`)
  } finally {
    rmSync(temp, { recursive: true, force: true })
  }
})
