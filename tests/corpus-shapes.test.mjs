// ADR-087: the Status shapes measured in public corpora on 2026-10-06 (docs/specs/
// 2026-10-06-corpus-shapes-our-readers-misread.md). Every record here is written by this file for
// this test, never copied from a public corpus (CLAUDE.md §6), and git runs only in a directory this
// file made (CLAUDE.md §9). Each shape that is now read has a twin that must keep today's reading
// (CLAUDE.md §16), and every reader is run as the process a session runs.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const scripts = join(repoRoot, 'plugin', 'scripts')
const temps = []
test.after(() => { for (const dir of temps) rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }) })
// 120s: a Windows runner's first Python spawn can take 30 (tests/adr-next.test.mjs:29).
const run = (command, args, cwd) => spawnSync(command, args, { cwd, encoding: 'utf8', timeout: 120_000, windowsHide: true })
const SECTIONS = '\n## Context\n\nx\n\n## Decision\n\ny\n'
const frontmatter = (lines, title) => `---\n${lines.join('\n')}\n---\n\n# ${title}\n${SECTIONS}`
const posix = file => String(file).split('\\').join('/')

function corpus(files) {
  const repo = mkdtempSync(join(tmpdir(), 'qh-corpus-shapes-'))
  temps.push(repo)
  assert.equal(run('git', ['init', '-q'], repo).status, 0)
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(dirname(join(repo, rel)), { recursive: true })
    writeFileSync(join(repo, rel), text)
  }
  assert.equal(run('git', ['add', '-A'], repo).status, 0)
  return repo
}

const json = (command, args, repo) => {
  const done = run(command, args, repo)
  assert.equal(done.status, 0, `${args[0]} could not run: ${done.stdout}\n${done.stderr}`)
  return JSON.parse(done.stdout)
}
const adrState = repo => json(process.execPath, [join(scripts, 'adr-state.mjs'), '--json', repo], repo)
const workNext = repo => json(process.execPath, [join(scripts, 'work-next.mjs'), '--json', repo], repo)

// What adr-state says of one file: governing (a record that declares no path is listed under
// governingNothing), undecided with its why, or neither.
function stateSays(state, file) {
  const unread = state.unread.find(entry => posix(entry.file) === file)
  if (unread) return `undecided: ${unread.why}`
  return state.governingNothing.some(entry => posix(entry.file) === file) ? 'governing' : 'neither'
}
// What adr-lint says of one record: not-recognised, advised that its Status is no word it acts on, or read.
function lintSays(repo, file) {
  const lint = run('python3', [join(repoRoot, 'plugin', 'bin', 'adr-lint'), file], repo)
  assert.ok([0, 1, 2].includes(lint.status), `adr-lint could not run on ${file}: ${lint.stdout}\n${lint.stderr}`)
  if (/^not-recognised:/m.test(lint.stdout)) return 'not-recognised'
  return /starts with no status adr-lint recognises/.test(lint.stdout) ? 'advised' : 'read'
}

test('a frontmatter status is read as its corpora write it', () => {
  // public/swift-adrs and public/active-status-adr write `status: active`; public/small-active-adr `Active`;
  // public/quoted-status-adr MADR 4's quoted `"accepted"`, once with an amendment after it.
  const shapes = {
    'docs/decisions/001-active.md': ['status: active', 'superseded_by: null'],
    'docs/decisions/002-capital.md': ['status: Active'],
    'docs/decisions/003-quoted.md': ['status: "accepted"'],
    'docs/decisions/004-single-quoted.md': ["status: 'active'  # in force"],
    'docs/decisions/005-amended.md': ['status: "accepted, amended by ADR-0019"'],
  }
  const repo = corpus(Object.fromEntries(Object.entries(shapes).map(([file, lines]) => [file, frontmatter(lines, file)])))
  const state = adrState(repo)
  const next = workNext(repo)
  const wrong = []
  for (const file of Object.keys(shapes)) {
    if (stateSays(state, file) !== 'governing') wrong.push(`adr-state on ${file}: ${stateSays(state, file)}`)
    const lint = lintSays(repo, file)
    if (lint !== 'read') wrong.push(`adr-lint on ${file}: ${lint}`)
  }
  if (next.accepted !== 5 || next.undecidedNamed.length !== 0) wrong.push(`work-next: ${next.accepted} accepted, undecided ${JSON.stringify(next.undecidedNamed)}`)
  assert.deepEqual(wrong, [])
})

test('a placeholder or an unmapped status stays undecided and is named', () => {
  const unknown = { state: 'undecided: its status does not start with a word this reader knows', next: 'a status this reader does not recognise', lint: 'advised' }
  const plan = { state: 'undecided: it is Proposed or Draft', next: 'a plan, not yet decided', lint: 'read' }
  const rows = {
    // MADR 4's own template value, an angle-bracket one, and small-active-adr's.
    'docs/decisions/101-madr4-template.md': [frontmatter(['status: "{proposed | rejected | accepted | deprecated | … | superseded by ADR-0123}"'], 't'), unknown],
    'docs/decisions/102-angle-template.md': [`# t\n\nStatus: <Draft | Experimental | Accepted>\n${SECTIONS}`, unknown],
    'docs/decisions/103-brace-template.md': [frontmatter(['status: "{Active|Superseded}"'], 't'), unknown],
    // public/dir-status-rfc's words, and public/template-adr's `on hold` (F-7).
    'docs/decisions/104-final.md': [frontmatter(['status: final'], 't'), unknown],
    'docs/decisions/105-experimental.md': [frontmatter(['status: experimental'], 't'), unknown],
    // Its first run of letters is `draft`, so it was a plan before ADR-087 and stays one.
    'docs/decisions/106-draft-accepted.md': [frontmatter(['status: draft-accepted'], 't'), plan],
    'docs/decisions/107-on-hold.md': [frontmatter(['status: on hold'], 't'), unknown],
    // Quotes are YAML's, so they are removed only inside a frontmatter block (F-2's twin).
    'docs/decisions/108-quoted-inline.md': [`# t\n\n**Status:** "Accepted"\n${SECTIONS}`, unknown],
  }
  const twin = 'docs/decisions/109-accepted.md'
  const repo = corpus({
    ...Object.fromEntries(Object.entries(rows).map(([file, [text]]) => [file, text])),
    // The CLEAN twin: the plain frontmatter word governs in the same corpus.
    [twin]: frontmatter(['status: accepted'], 't'),
  })
  const state = adrState(repo)
  const next = workNext(repo)
  const wrong = []
  for (const [file, [, want]] of Object.entries(rows)) {
    if (!stateSays(state, file).startsWith(want.state)) wrong.push(`adr-state on ${file}: ${stateSays(state, file)}`)
    const named = next.undecidedNamed.find(entry => posix(entry.file) === file)
    if (named?.reason !== want.next) wrong.push(`work-next on ${file}: ${JSON.stringify(named)}`)
    const lint = lintSays(repo, file)
    if (lint !== want.lint) wrong.push(`adr-lint on ${file}: ${lint}`)
  }
  if (stateSays(state, twin) !== 'governing') wrong.push(`adr-state on the twin: ${stateSays(state, twin)}`)
  if (next.accepted !== 1) wrong.push(`work-next accepted ${next.accepted}, expected the twin alone`)
  assert.deepEqual(wrong, [])
})

test('a directory name is never a status', () => {
  // dir-status-rfc keeps `Final/` and `Archive/Rejected/` directories that contradict the files' own
  // Status in 8 of 64 files (F-8), so a directory is never read as one.
  const file = 'docs/decisions/Final/0001-x.md'
  const repo = corpus({ [file]: `# X\n${SECTIONS}` })
  assert.match(stateSays(adrState(repo), file), /^undecided: it has no \*\*Status:\*\* value this reader can read/)
  const named = workNext(repo).undecidedNamed.find(entry => posix(entry.file) === file)
  assert.equal(named?.reason, 'no status line this reader can read')
})

// MADR 2 writes its Status as a list item under the title (public/star-status-adr b6001f0: 29 records).
const MADR2_BODY = '\n## Context and Problem Statement\n\nx\n\n## Decision Outcome\n\ny\n'

test('a MADR 2 bullet status is read above the first section', () => {
  const accepted = 'docs/decisions/001-bullet-accepted.md'
  const proposed = 'docs/decisions/002-bullet-proposed.md'
  const repo = corpus({
    [accepted]: `# Use a queue\n\n* Status: accepted\n* Deciders: the team\n${MADR2_BODY}`,
    [proposed]: `# Use a cache\n\n- status: proposed\n- Date: 2026-10-06\n${MADR2_BODY}`,
  })
  const state = adrState(repo)
  const next = workNext(repo)
  const wrong = []
  if (stateSays(state, accepted) !== 'governing') wrong.push(`adr-state on ${accepted}: ${stateSays(state, accepted)}`)
  if (!stateSays(state, proposed).startsWith('undecided: it is Proposed or Draft')) wrong.push(`adr-state on ${proposed}: ${stateSays(state, proposed)}`)
  if (next.accepted !== 1) wrong.push(`work-next accepted ${next.accepted}`)
  const named = next.undecidedNamed.find(entry => posix(entry.file) === proposed)
  if (named?.reason !== 'a plan, not yet decided') wrong.push(`work-next on ${proposed}: ${JSON.stringify(named)}`)
  for (const file of [accepted, proposed]) {
    const lint = lintSays(repo, file)
    if (lint !== 'read') wrong.push(`adr-lint on ${file}: ${lint}`)
  }
  assert.deepEqual(wrong, [])
})

test('a status bullet inside a section is not the record status', () => {
  // Below the first `## ` heading a bullet is body text (F-4's twin).
  const inside = 'docs/decisions/003-bullet-in-body.md'
  // CLEAN twins: an inline label wins over a bullet, whether the bullet is in the body or above it.
  const body = 'docs/decisions/004-inline-over-body-bullet.md'
  const above = 'docs/decisions/005-inline-over-header-bullet.md'
  const repo = corpus({
    [inside]: '# t\n\n## Context\n\n- Status: accepted\n\n## Decision\n\ny\n',
    [body]: '# t\n\n**Status:** Proposed\n\n## Context\n\n- Status: accepted\n\n## Decision\n\ny\n',
    [above]: `# t\n\n* Status: accepted\n\n**Status:** Proposed\n${SECTIONS}`,
  })
  const state = adrState(repo)
  const next = workNext(repo)
  const wrong = []
  if (!stateSays(state, inside).startsWith('undecided: it has no **Status:** value')) wrong.push(`adr-state on ${inside}: ${stateSays(state, inside)}`)
  const named = file => next.undecidedNamed.find(entry => posix(entry.file) === file)?.reason
  if (named(inside) !== 'no status line this reader can read') wrong.push(`work-next on ${inside}: ${named(inside)}`)
  if (lintSays(repo, inside) !== 'not-recognised') wrong.push(`adr-lint on ${inside}: ${lintSays(repo, inside)}`)
  for (const file of [body, above]) {
    if (!stateSays(state, file).startsWith('undecided: it is Proposed or Draft')) wrong.push(`adr-state on ${file}: ${stateSays(state, file)}`)
    if (named(file) !== 'a plan, not yet decided') wrong.push(`work-next on ${file}: ${named(file)}`)
  }
  if (next.accepted !== 0) wrong.push(`work-next accepted ${next.accepted}`)
  assert.deepEqual(wrong, [])
})

// adr-state's dangling list, by the record ids it names.
const dangling = state => state.danglingSupersession.map(entry => entry.id)
const unreadSuperseder = state => (state.supersededByUnreadable ?? []).map(entry => entry.id)

test('a frontmatter superseded_by names the replacement in the three measured spellings', () => {
  // public/swift-adrs writes a bare stem and a stem with `.md`; public/active-status-adr a quoted number.
  const graveyard = {
    'docs/decisions/001-stem.md': frontmatter(['status: superseded', 'superseded_by: 041-gone'], 't'),
    'docs/decisions/002-stem-md.md': frontmatter(['status: superseded', 'superseded_by: 042-gone.md'], 't'),
    'docs/decisions/003-quoted.md': frontmatter(['status: superseded', 'superseded_by: "0043"'], 't'),
    // `null` and `[]` name nothing; the `supersedes` line above it is never read as a target (F-6).
    'docs/decisions/004-null.md': frontmatter(['status: superseded', 'supersedes: [099-other]', 'superseded_by: null'], 't'),
    'docs/decisions/005-empty-list.md': frontmatter(['status: superseded', 'superseded_by: []'], 't'),
  }
  const named = ['ADR-001', 'ADR-002', 'ADR-003']
  const state = adrState(corpus(graveyard))
  assert.deepEqual(dangling(state).sort(), named)
  assert.deepEqual(unreadSuperseder(state), [])
  // CLEAN twin: with the replacements in the corpus, nothing dangles.
  const present = adrState(corpus({
    ...graveyard,
    'docs/decisions/041-gone.md': frontmatter(['status: active'], 't'),
    'docs/decisions/042-gone.md': frontmatter(['status: active'], 't'),
    'docs/decisions/043-gone.md': frontmatter(['status: active'], 't'),
  }))
  assert.deepEqual(dangling(present), [])
  assert.deepEqual(unreadSuperseder(present), [])
})

test('supersedes is never read and superseded_by never moves a governing record', () => {
  // In active-status-adr, 28 of the 37 records a `supersedes` names still say `active` (F-6).
  const target = 'docs/decisions/001-x.md'
  const replacing = 'docs/decisions/002-y.md'
  const governing = 'docs/decisions/003-z.md'
  const repo = corpus({
    [target]: frontmatter(['status: active'], 'x'),
    [replacing]: frontmatter(['status: active', 'supersedes: [001-x]'], 'y'),
    [governing]: frontmatter(['status: active', 'superseded_by: 009-y'], 'z'),
  })
  const state = adrState(repo)
  const wrong = []
  for (const file of [target, replacing, governing]) {
    if (stateSays(state, file) !== 'governing') wrong.push(`adr-state on ${file}: ${stateSays(state, file)}`)
  }
  if (dangling(state).length) wrong.push(`dangling ${JSON.stringify(state.danglingSupersession)}`)
  const next = workNext(repo)
  if (next.accepted !== 3 || next.retirableInActiveCorpus.length) wrong.push(`work-next accepted ${next.accepted}, retirable ${JSON.stringify(next.retirableInActiveCorpus)}`)
  assert.deepEqual(wrong, [])
})

// public/dir-status-rfc keeps its RFCs outside any `adr` or `decisions` directory, so no reader
// reads them as records (ADR-074 Decision 5), and they were passed over in silence (F-9).
const rfc = status => `---\nRFC: RFC0001\nStatus: ${status}\n---\n\n# An RFC\n\nWhat it proposes.\n`
const probe = repo => json(process.execPath, [join(scripts, 'corpus-probe.mjs'), '--json'], repo)

test('a numbered file with a frontmatter status outside a record directory is named as not read', () => {
  const repo = corpus({ 'Final/RFC0001-x.md': rfc('Final'), 'Archive/Rejected/RFC0002-y.md': rfc('Draft') })
  const want = ['Archive/Rejected/RFC0002-y.md', 'Final/RFC0001-x.md']
  const next = workNext(repo)
  assert.equal(next.look, 'ok')
  assert.deepEqual(next.notRead.map(entry => posix(entry.file)).sort(), want)
  const text = run(process.execPath, [join(scripts, 'work-next.mjs'), repo], repo)
  assert.equal(text.status, 0, text.stderr)
  assert.match(text.stdout, /Final\/RFC0001-x\.md/, text.stdout)
  const report = probe(repo)
  assert.equal(report.look, 'ok')
  assert.deepEqual(report.workNext.notRead.map(entry => posix(entry.file)).sort(), want)
})

test('an unnumbered note or a record inside a record directory is not named as not read', () => {
  const repo = corpus({
    // An unnumbered note with a frontmatter status (active-status-adr's vault notes, F-9's twin).
    'vault/note.md': '---\nstatus: draft\n---\n\n# A note\n',
    // A record inside a record directory is read as one, not named.
    'docs/decisions/001-x.md': frontmatter(['status: active'], 'x'),
    // Inside a record directory, a numbered file that is not a record is still not this list's.
    'docs/decisions/RFC0003-z.md': rfc('Final'),
    // A numbered file with no frontmatter carries no status this list reads.
    'notes/0001-x.md': '# A numbered note\n\nNo frontmatter.\n',
    // A numbered name the record reader already lists (and names as undecided) is not named twice.
    'Final/0002-z.md': rfc('Final'),
  })
  const next = workNext(repo)
  assert.deepEqual(next.notRead, [])
  assert.ok(next.undecidedNamed.some(entry => posix(entry.file) === 'Final/0002-z.md'), JSON.stringify(next.undecidedNamed))
})

test('corpus-probe --diff names a file that came into or left notRead', async () => {
  const { diffReports } = await import('../plugin/scripts/corpus-probe.mjs')
  const report = notRead => ({ look: 'ok', corpora: ['fixture'], probe: { readers: {} }, adrLint: [],
    workNext: { records: 0, accepted: 0, tasks: 0, notRead: notRead.map(file => ({ file })) } })
  const lines = diffReports(report(['Final/RFC0002-y.md']), report(['Final/RFC0001-x.md']))
  // One line per element since ADR-089 T1, each marked in words: an added file and a removed one.
  assert.ok(lines.includes('workNext.notRead: + Final/RFC0001-x.md'), lines.join('\n'))
  assert.ok(lines.includes('workNext.notRead: - Final/RFC0002-y.md'), lines.join('\n'))
  // The control: the same list on both sides is not a change.
  assert.ok(!diffReports(report(['Final/RFC0001-x.md']), report(['Final/RFC0001-x.md'])).some(line => /notRead/.test(line)))
})
