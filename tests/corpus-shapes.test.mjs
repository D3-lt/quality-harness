// ADR-087: the Status shapes measured in public corpora on 2026-10-06 (docs/specs/
// 2026-10-06-corpus-shapes-our-readers-misread.md). Every record here is written by this file for
// this test, never copied from a public corpus (CLAUDE.md §6), and git runs only in a directory this
// file made (CLAUDE.md §9). Each shape that is now read has a twin that must keep today's reading
// (CLAUDE.md §16), and every reader is run as the process a session runs.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
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
  // With no Status of its own it is no record adr-lint recognises, so since the owner's decision of
  // 2026-10-07 no reader counts it, not even as undecided: work-next names it as not read, and the
  // directory never makes it a Final record.
  assert.equal(stateSays(adrState(repo), file), 'neither')
  const next = workNext(repo)
  assert.deepEqual(next.notRead.map(entry => posix(entry.file)), [file])
  assert.equal(next.accepted, 0)
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
  // The owner, 2026-10-07: a file adr-lint does not recognise is a record to no reader, so a file with
  // no Status is neither undecided nor counted; work-next names it as not read.
  if (stateSays(state, inside) !== 'neither') wrong.push(`adr-state on ${inside}: ${stateSays(state, inside)}`)
  const named = file => next.undecidedNamed.find(entry => posix(entry.file) === file)?.reason
  if (named(inside) !== undefined) wrong.push(`work-next on ${inside}: ${named(inside)}`)
  if (!next.notRead.some(entry => posix(entry.file) === inside)) wrong.push(`work-next notRead ${JSON.stringify(next.notRead)}`)
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
    // Inside a record directory, a numbered file that is not a record is named since ADR-092 Decision 9
    // (every numbered candidate is counted or named; the owner approved the change on 2026-10-07).
    'docs/decisions/RFC0003-z.md': rfc('Final'),
    // A numbered file with no Status, and a numbered file the record reader lists by its name, are not
    // records adr-lint recognises: since the owner's decision of 2026-10-07 no reader counts them, not
    // even as undecided, and they are named here once each.
    'notes/0001-x.md': '# A numbered note\n\nNo frontmatter.\n',
    'Final/0002-z.md': rfc('Final'),
  })
  const next = workNext(repo)
  assert.deepEqual(next.notRead.map(entry => posix(entry.file)).sort(), ['Final/0002-z.md', 'docs/decisions/RFC0003-z.md', 'notes/0001-x.md'])
  assert.deepEqual(next.undecidedNamed, [])
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
// The owner, 2026-10-07: a file adr-lint does not recognise as a record is not a record to any reader.
// Each file here is classified by adr-lint AND by every corpus reader, and the two must agree: one
// that adr-lint calls not-recognised is counted by none of them and named in work-next's notRead.
const HEADINGLESS = status => `---\nstatus: ${status}\n---\n\n# A rule\n\nEvery branch is named after its ticket.\n`
test('a file adr-lint does not recognise is counted by no reader and named as not read', () => {
  const dropped = [
    // record 011 of the yaml-frontmatter corpus: in a record directory, no Context or Decision heading.
    'docs/decisions/011-no-sections.md',
    // a gpt-6.1-sol review of ADR-087, finding 3: outside any record directory, admitted by its name.
    'Final/0044-outside.md',
    // a graveyard Status is not counted either: it would be offered for retirement.
    'docs/decisions/012-superseded-no-sections.md',
    // outside a record directory only `**Status:**` admits a record by content, as adr-lint reads it.
    'notes/0045-plain-label.md',
  ]
  const kept = [
    // CLEAN twins: the same Status with the headings, a canonical ADR-<n> name without them, and a
    // bare-numbered record outside a record directory written with `**Status:**` and a heading.
    'docs/decisions/001-with-sections.md',
    'docs/decisions/ADR-020-canonical-name.md',
    'notes/0046-bold-label.md',
  ]
  const repo = corpus({
    [dropped[0]]: HEADINGLESS('active'),
    [dropped[1]]: HEADINGLESS('active'),
    [dropped[2]]: HEADINGLESS('superseded'),
    [dropped[3]]: `# A note\n\nStatus: Accepted\n${SECTIONS}`,
    [kept[0]]: frontmatter(['status: active'], 'kept'),
    [kept[1]]: HEADINGLESS('active'),
    [kept[2]]: `# A record\n\n**Status:** Accepted\n${SECTIONS}`,
  })
  const state = adrState(repo)
  const next = workNext(repo)
  const report = probe(repo)
  const wrong = []
  for (const file of dropped) {
    if (lintSays(repo, file) !== 'not-recognised') wrong.push(`adr-lint on ${file}: ${lintSays(repo, file)}`)
    if (stateSays(state, file) !== 'neither') wrong.push(`adr-state on ${file}: ${stateSays(state, file)}`)
  }
  for (const file of kept) {
    if (lintSays(repo, file) === 'not-recognised') wrong.push(`adr-lint on ${file}: not-recognised`)
    if (stateSays(state, file) !== 'governing') wrong.push(`adr-state on ${file}: ${stateSays(state, file)}`)
  }
  if (next.records !== 3 || next.accepted !== 3 || next.retirableInActiveCorpus.length) wrong.push(`work-next: ${next.records} records, ${next.accepted} accepted, retirable ${JSON.stringify(next.retirableInActiveCorpus)}`)
  if (next.look !== 'ok') wrong.push(`work-next look ${next.look}`)
  const named = next.notRead.map(entry => posix(entry.file)).sort()
  if (JSON.stringify(named) !== JSON.stringify([...dropped].sort())) wrong.push(`work-next notRead ${JSON.stringify(named)}`)
  const probed = report.workNext.notRead.map(entry => posix(entry.file)).sort()
  if (JSON.stringify(probed) !== JSON.stringify([...dropped].sort())) wrong.push(`corpus-probe notRead ${JSON.stringify(probed)}`)
  assert.deepEqual(wrong, [])
})

test('a not-recognised file that cannot be read is still named as unread, never dropped', () => {
  // §16's twin: "not recognised" needs the text; a file whose text was not read is could-not-look.
  const repo = corpus({ 'docs/decisions/011-nul.md': `---\nstatus: active\n---\n\n# x\u0000\n` })
  const next = workNext(repo)
  assert.equal(next.look, 'PARTIAL')
  assert.deepEqual(next.partialBecause.map(entry => posix(entry.file)), ['docs/decisions/011-nul.md'])
  assert.deepEqual(next.notRead, [])
})

// What record.py reads as one file's Status: the Python half of every reader.
function pythonStatus(repo, file) {
  const done = run('python3', ['-c', 'import sys; sys.path.insert(0, sys.argv[1]); from record import record_status; '
    + 'print(record_status(open(sys.argv[2], encoding="utf-8").read())[0])', join(repoRoot, 'plugin', 'lib'), join(repo, file)], repo)
  assert.equal(done.status, 0, done.stderr)
  return done.stdout.trim()
}

test('a status inside a frontmatter literal block is not the record status', () => {
  // A gpt-6.1-sol review of ADR-087, finding 1: only a top-level key is the record's Status.
  const nested = 'docs/decisions/001-nested.md'
  // CLEAN twin: the top-level key still reads when the block below it nests another value.
  const top = 'docs/decisions/002-top.md'
  const repo = corpus({
    [nested]: frontmatter(['example: |', '  status: "accepted"', 'status: proposed'], 'n'),
    [top]: frontmatter(['status: accepted', 'example: |', '  status: proposed'], 't'),
  })
  const state = adrState(repo)
  const wrong = []
  if (pythonStatus(repo, nested) !== 'proposed') wrong.push(`record.py on ${nested}: ${pythonStatus(repo, nested)}`)
  if (!stateSays(state, nested).startsWith('undecided: it is Proposed or Draft')) wrong.push(`adr-state on ${nested}: ${stateSays(state, nested)}`)
  if (pythonStatus(repo, top) !== 'accepted') wrong.push(`record.py on ${top}: ${pythonStatus(repo, top)}`)
  if (stateSays(state, top) !== 'governing') wrong.push(`adr-state on ${top}: ${stateSays(state, top)}`)
  assert.deepEqual(wrong, [])
})

test('a status bullet in an indented code block is not the record status', () => {
  // A gpt-6.1-sol review of ADR-087, finding 2: four spaces, or a tab, make a code block, not a list item.
  const code = 'docs/decisions/001-code.md'
  const tab = 'docs/decisions/002-tab.md'
  // CLEAN twin: a bullet indented by up to three spaces is still a MADR 2 Status.
  const bullet = 'docs/decisions/003-bullet.md'
  const repo = corpus({
    [code]: `# t\n\n    - Status: accepted\n${SECTIONS}`,
    [tab]: `# t\n\n\t* Status: accepted\n${SECTIONS}`,
    [bullet]: `# t\n\n   - Status: accepted\n${SECTIONS}`,
  })
  const state = adrState(repo)
  const wrong = []
  for (const file of [code, tab]) {
    if (pythonStatus(repo, file) !== 'None') wrong.push(`record.py on ${file}: ${pythonStatus(repo, file)}`)
    if (stateSays(state, file) === 'governing') wrong.push(`adr-state on ${file}: governing`)
  }
  if (pythonStatus(repo, bullet) !== 'accepted') wrong.push(`record.py on ${bullet}: ${pythonStatus(repo, bullet)}`)
  if (stateSays(state, bullet) !== 'governing') wrong.push(`adr-state on ${bullet}: ${stateSays(state, bullet)}`)
  assert.deepEqual(wrong, [])
})

test('a numbered file whose frontmatter runs past 64 lines is named, and past the budget is PARTIAL', () => {
  // A gpt-6.1-sol review of ADR-087, finding 4: the closing `---` past line 64 was not read, so the
  // file was neither read nor named, with look ok.
  const keys = count => Array.from({ length: count }, (_, index) => `key${index}: value ${index}`)
  const long = `---\n${keys(70).join('\n')}\nStatus: Final\n---\n\n# An RFC\n`
  const repo = corpus({ 'Final/RFC0044-long.md': long })
  const next = workNext(repo)
  assert.equal(next.look, 'ok')
  assert.deepEqual(next.notRead.map(entry => posix(entry.file)), ['Final/RFC0044-long.md'])
  // Past the read budget, now ADR-092's 512 KiB, a file whose candidacy needs its content is could-not-look,
  // never silence. A letter-prefixed name is a candidate by its path and named unread at any size, so the
  // budget is shown on a plain numbered note (the owner approved the change on 2026-10-07).
  // Two digits, so no reader lists it by name (`0045-` is a record's name to the corpus reader, which
  // would say "over 512 KiB" itself): only work-next's candidate rule reaches it.
  const huge = corpus({ 'notes/45-huge.md': `---\n${keys(30000).join('\n')}\nStatus: Final\n---\n\n# An RFC\n` })
  const over = workNext(huge)
  assert.equal(over.look, 'PARTIAL')
  assert.deepEqual(over.partialBecause.map(entry => posix(entry.file)), ['notes/45-huge.md'])
})

test('a superseded status that names no record takes its target from superseded_by', () => {
  // A gpt-6.1-sol review of ADR-087, finding 5: `status: superseded by` named nothing, so the
  // frontmatter's `superseded_by: 099-missing` was never asked and nothing dangled (Decision 4).
  const repo = corpus({
    'docs/decisions/001-bare.md': frontmatter(['status: superseded by', 'superseded_by: 099-missing'], 'b'),
    // CLEAN twin: a Status that names a record wins over the key, and that record is present.
    'docs/decisions/002-named.md': frontmatter(['status: superseded by ADR-003', 'superseded_by: 098-missing'], 'n'),
    'docs/decisions/003-there.md': frontmatter(['status: active'], 't'),
  })
  assert.deepEqual(dangling(adrState(repo)), ['ADR-001'])
})

test('a FIFO in place of a numbered file is not opened by the not-read look', { skip: process.platform === 'win32' && 'no FIFO on Windows' }, () => {
  // A gpt-6.1-sol review of ADR-087, finding 6: a blocking open of a FIFO hangs until killed. Git does
  // not list a FIFO it is handed, so a tracked file is replaced by one on the disk.
  const repo = corpus({ 'Final/RFC0044-pipe.md': rfc('Final'), 'Final/RFC0001-x.md': rfc('Final') })
  rmSync(join(repo, 'Final', 'RFC0044-pipe.md'))
  assert.equal(run('mkfifo', [join(repo, 'Final', 'RFC0044-pipe.md')], repo).status, 0)
  const done = spawnSync(process.execPath, [join(scripts, 'work-next.mjs'), '--json', repo], { cwd: repo, encoding: 'utf8', timeout: 30_000, windowsHide: true })
  assert.equal(done.error, undefined, 'work-next did not finish: it opened the FIFO')
  assert.equal(done.status, 0, done.stderr)
  assert.deepEqual(JSON.parse(done.stdout).notRead.map(entry => posix(entry.file)), ['Final/RFC0001-x.md'])
})
// A gpt-6.1-sol delta review of the owner's decision, 2026-10-07: four places the readers and adr-lint
// still disagreed about what is a record.
const FROZEN = '**Lifecycle:** Frozen historical ADR records'
test('a frozen archive catalog does not make a not-recognised file a record', () => {
  // Finding 1: a catalog row that says `governing` counted a headingless record adr-lint rejects.
  const headingless = 'docs/decisions/011-no-sections.md'
  // CLEAN twin: a record with its headings, listed the same way, still governs.
  const whole = 'docs/decisions/012-with-sections.md'
  const repo = corpus({
    'docs/decisions/README.md': `# Archive\n\n${FROZEN}\n\n| Record | Title | Effect |\n|---|---|---|\n`
      + '| [011](011-no-sections.md) | a | governing |\n| [012](012-with-sections.md) | b | governing |\n',
    [headingless]: HEADINGLESS('active'),
    [whole]: frontmatter(['status: active'], 'whole'),
  })
  const next = workNext(repo)
  const wrong = []
  if (lintSays(repo, headingless) !== 'not-recognised') wrong.push(`adr-lint on ${headingless}: ${lintSays(repo, headingless)}`)
  if (next.accepted !== 1) wrong.push(`work-next accepted ${next.accepted}`)
  if (JSON.stringify(next.notRead.map(entry => posix(entry.file))) !== JSON.stringify([headingless])) wrong.push(`work-next notRead ${JSON.stringify(next.notRead)}`)
  assert.deepEqual(wrong, [])
})

test('a link to a record is placed where its target is kept, as adr-lint places it', { skip: process.platform === 'win32' && 'a symlink needs privileges on Windows' }, () => {
  // Finding 2: placement was judged on the link's own path, outside any record directory, so the link
  // was dropped and its target, read once through the link, was counted by nobody.
  const repo = corpus({ 'docs/decisions/001-rule.md': frontmatter(['status: active'], 'rule') })
  mkdirSync(join(repo, 'Final'))
  symlinkSync(join('..', 'docs', 'decisions', '001-rule.md'), join(repo, 'Final', '001-link.md'))
  assert.equal(run('git', ['add', '-A'], repo).status, 0)
  const next = workNext(repo)
  assert.notEqual(lintSays(repo, 'Final/001-link.md'), 'not-recognised')
  assert.equal(next.accepted, 1)
  assert.deepEqual(next.notRead, [])
})

test('a heading after whitespace only one runtime calls whitespace is read alike by every reader', () => {
  // Finding 3: JS's `\s` and Python's differ (U+0085 and U+001C-U+001F are Python's only, U+FEFF is
  // JS's only), and JS's `^` under /m also starts a line after U+2028. adr-lint's answer is the rule.
  const shapes = {
    'docs/decisions/001-nel.md': '##\u0085Decision',
    'docs/decisions/002-fs.md': '##\u001cDecision',
    'docs/decisions/003-bom.md': '##﻿Decision',
    'docs/decisions/004-line-separator.md': 'x ## Decision',
    // CLEAN twin: a plain space.
    'docs/decisions/005-space.md': '## Decision',
  }
  const repo = corpus(Object.fromEntries(Object.entries(shapes)
    .map(([file, heading]) => [file, `# t\n\n**Status:** Accepted\n\n${heading}\n\ny\n`])))
  const state = adrState(repo)
  const wrong = []
  for (const file of Object.keys(shapes)) {
    const recognised = lintSays(repo, file) !== 'not-recognised'
    const counted = stateSays(state, file) === 'governing'
    if (recognised !== counted) wrong.push(`${file}: adr-lint ${recognised ? 'recognises' : 'does not recognise'} it, adr-state ${counted ? 'counts' : 'does not count'} it`)
  }
  if (stateSays(state, 'docs/decisions/005-space.md') !== 'governing') wrong.push('the plain space is not read')
  assert.deepEqual(wrong, [])
})

test('a 64 KiB cut that ends on three dashes is not read as the closing delimiter', () => {
  // Finding 4: the cut fell just after the `---` of a longer line, which read as a closed block. ADR-092
  // reads a candidate whole up to 512 KiB, so there is no cut: the `---example` line is text, the block
  // closes at the bare `---`, and its Status makes the file a candidate, named as not read.
  const open = '---\nStatus: Final\n'
  const pad = `pad: ${'x'.repeat(64 * 1024 - 3 - open.length - 'pad: \n'.length)}\n`
  const text = `${open}${pad}---example: x\n---\n\n# An RFC\n`
  assert.equal(Buffer.byteLength(`${open}${pad}---`), 64 * 1024)
  const next = workNext(corpus({ 'notes/0046-edge.md': text }))
  assert.equal(next.look, 'ok')
  assert.deepEqual(next.partialBecause, [])
  assert.deepEqual(next.notRead.map(entry => posix(entry.file)), ['notes/0046-edge.md'])
})

// The owner, 2026-10-07: nothing found along the way is left open.
test('a Status line in an indented code block is not the record status', () => {
  // Four spaces, or a tab, make an indented code block: its `Status: Accepted` is an example, as the
  // MADR 2 bullet's is (ADR-087 review, finding 2's sibling, which predates ADR-087).
  const spaces = 'docs/decisions/001-code.md'
  const tab = 'docs/decisions/002-tab.md'
  // CLEAN twins: three spaces is still a line of text, and an unindented label is the record's.
  const three = 'docs/decisions/003-three.md'
  const plain = 'docs/decisions/004-plain.md'
  const repo = corpus({
    [spaces]: `# t\n\n    Status: Accepted\n${SECTIONS}`,
    [tab]: `# t\n\n\t**Status:** Accepted\n${SECTIONS}`,
    [three]: `# t\n\n   Status: Accepted\n${SECTIONS}`,
    [plain]: `# t\n\nStatus: Accepted\n${SECTIONS}`,
  })
  const state = adrState(repo)
  const wrong = []
  for (const file of [spaces, tab]) {
    if (pythonStatus(repo, file) !== 'None') wrong.push(`record.py on ${file}: ${pythonStatus(repo, file)}`)
    if (stateSays(state, file) === 'governing') wrong.push(`adr-state on ${file}: governing`)
  }
  for (const file of [three, plain]) {
    if (pythonStatus(repo, file) !== 'Accepted') wrong.push(`record.py on ${file}: ${pythonStatus(repo, file)}`)
    if (stateSays(state, file) !== 'governing') wrong.push(`adr-state on ${file}: ${stateSays(state, file)}`)
  }
  assert.deepEqual(wrong, [])
})

test('adr-state names the files no reader counts', () => {
  // adr-state counted the records it read and said nothing of a file the corpus reader dropped.
  const dropped = 'docs/decisions/011-no-sections.md'
  const repo = corpus({ [dropped]: HEADINGLESS('active'), 'docs/decisions/001-kept.md': frontmatter(['status: active'], 'kept') })
  const state = adrState(repo)
  assert.deepEqual(state.notRead.map(entry => posix(entry.file)), [dropped])
  const text = run(process.execPath, [join(scripts, 'adr-state.mjs'), repo], repo)
  assert.equal(text.status, 0, text.stderr)
  assert.match(text.stdout, /011-no-sections\.md/)
  // With nothing else in the corpus it is still named, never "No decision records found" alone.
  const only = corpus({ [dropped]: HEADINGLESS('active') })
  const alone = run(process.execPath, [join(scripts, 'adr-state.mjs'), only], only)
  assert.equal(alone.status, 0, alone.stderr)
  assert.match(alone.stdout, /011-no-sections\.md/)
  // CLEAN twin: a corpus whose every file is a record names nothing.
  assert.deepEqual(adrState(corpus({ 'docs/decisions/001-kept.md': frontmatter(['status: active'], 'kept') })).notRead, [])
})

test('a link and its target are read once, as the target, and the link is the alias', { skip: process.platform === 'win32' && 'a symlink needs privileges on Windows' }, () => {
  // The delta review's finding 2, second half: the first listed path was kept, so a link sorted before
  // its target was read and the target, the file adr-lint lints, was named as the copy.
  const target = 'docs/decisions/001-rule.md'
  const link = 'Final/001-link.md'
  const repo = corpus({ [target]: frontmatter(['status: active'], 'rule') })
  mkdirSync(join(repo, 'Final'))
  symlinkSync(join('..', 'docs', 'decisions', '001-rule.md'), join(repo, link))
  assert.equal(run('git', ['add', '-A'], repo).status, 0)
  assert.equal(stateSays(adrState(repo), target), 'governing')
  const next = workNext(repo)
  assert.equal(next.accepted, 1)
  assert.deepEqual(next.partialBecause.map(entry => posix(entry.file)), [link])
})

test('a path through a linked parent directory is the alias of the path with no link in it', { skip: process.platform === 'win32' && 'a symlink needs privileges on Windows' }, async () => {
  // The same review: only a path's last component was asked, so a link to the DIRECTORY, listed first,
  // kept the linked path. Git does not list through a linked directory, so the listing is the seam.
  const { adrCorpus } = await import('../plugin/scripts/decision-corpus.mjs')
  const target = 'docs/decisions/001-rule.md'
  const repo = corpus({ [target]: frontmatter(['status: active'], 'rule') })
  symlinkSync(join('docs', 'decisions'), join(repo, 'Alt'))
  const records = adrCorpus(repo, { tracked: ['Alt/001-rule.md', target] })
  assert.deepEqual(records.map(record => posix(record.file).slice(-target.length)), [target])
  assert.deepEqual(records.unreadable.map(entry => posix(entry.file).split('/').slice(-2).join('/')), ['Alt/001-rule.md'])
})
