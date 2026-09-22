// A retired record's tasks are not work in flight.
//
// `adr-retire` moves a decision unit into a sibling archive whose catalog carries
// `**Lifecycle:** Frozen historical ADR records`, and `adr-execute` says such a
// record "is historical evidence, never an executable plan". SessionStart had not
// heard: it walks every `tasks/` directory git lists, so the day this repository
// retired its first three records every new session was told
//
//   docs/adr-archive/ADR-056-…/tasks: T1 is ready — … Prove it with `adr-verify …`
//
// — withdrawn and superseded work, offered as the next thing to do, with the
// command to run. A peer session's transcript showed the same line from its own
// archive on 2026-09-19, which is what sent anyone to look.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { adrCorpus, decisionContext, decisionsGoverning, listedReadme, readyTaskLines } from '../plugin/scripts/lifecycle.mjs'

test('session orientation asks adr-next about the active corpus and never about a frozen archive', () => {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), 'qh-arc-flight-')))
  try {
    const write = (relative, text) => {
      mkdirSync(join(root, ...relative.split('/').slice(0, -1)), { recursive: true })
      writeFileSync(join(root, ...relative.split('/')), text)
    }
    const listing = [
      'docs/adr/ADR-002-current/tasks/T1-live.md',
      'docs/adr-archive/README.md',
      'docs/adr-archive/ADR-001-retired/tasks/T1-frozen.md',
      // A sibling whose README is NOT an archive catalog stays in flight: the
      // marker decides, not the directory's name.
      'docs/adr-notes/README.md',
      'docs/adr-notes/ADR-003-draft/tasks/T1-draft.md',
    ]
    for (const relative of listing) write(relative, '# x\n')
    write('docs/adr-archive/README.md', '# ADR Archive\n\n**Lifecycle:** Frozen historical ADR records\n')
    write('docs/adr-notes/README.md', '# Notes about archives, which is not the same as being one\n')

    const asked = []
    const spawn = (tool, args) => {
      asked.push(args[0].slice(root.length + 1).split('\\').join('/'))
      return { status: 0, stdout: JSON.stringify({ ready: [{ id: 'T1', goal: 'a task', path: join(args[0], 'T1.md') }] }), stderr: '' }
    }
    const { look, lines } = readyTaskLines(root, true, listing, spawn)
    assert.equal(look, 'ok')
    // The control: the active corpus IS asked about, so silence is not the pass.
    assert.ok(asked.includes('docs/adr/ADR-002-current/tasks'), `the active task set must be asked about: ${asked}`)
    assert.ok(asked.includes('docs/adr-notes/ADR-003-draft/tasks'), `a sibling without the Lifecycle marker is still in flight: ${asked}`)
    assert.deepEqual(asked.filter(name => name.startsWith('docs/adr-archive/')), [], 'a frozen archive is never asked about')
    assert.deepEqual(lines.filter(line => line.includes('adr-archive')), [], `and never offered as ready work: ${lines.join(' | ')}`)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

// The second half of the same rule. A frozen file cannot be edited — that is what
// frozen means — so a record retired as `withdrawn` still says `Status: Accepted`
// for ever, and the archive catalog's `Decision effect` column is the authority.
// This reader took the file's word. So on a session's FIRST EDIT of a governed
// file, `adr-context` answered unprompted:
//
//   GOVERNS  docs/adr-archive/ADR-056-…  [caught by: tests/…::a test that was deleted]
//
// — a withdrawn decision presented as governing, enforced by a test that is gone.
test('a retired record governs only if the archive catalog says it still does', () => {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), 'qh-arc-effect-')))
  try {
    const write = (relative, text) => {
      mkdirSync(join(root, ...relative.split('/').slice(0, -1)), { recursive: true })
      writeFileSync(join(root, ...relative.split('/')), text)
    }
    const record = (number, title) => `# ADR-00${number}: ${title}\n\n**Status:** Accepted\n**Governs:** \`src/app.js\`\n`
    write('docs/adr/ADR-004-live.md', record(4, 'live'))
    write('docs/adr-archive/ADR-001-still.md', record(1, 'still governing'))
    write('docs/adr-archive/ADR-002-gone.md', record(2, 'withdrawn'))
    write('docs/adr-archive/ADR-003-replaced.md', record(3, 'replaced'))
    write('docs/adr-archive/README.md', [
      '# ADR Archive', '', '**Lifecycle:** Frozen historical ADR records', '',
      '| ADR | Title | Decision effect | Retired | Reason | Obligations | SHA-256 |',
      '|-----|-------|-----------------|---------|--------|-------------|---------|',
      '| [ADR-001](ADR-001-still.md) | still governing | governing | 2026-09-19 | r | none | x |',
      '| [ADR-002](ADR-002-gone.md) | withdrawn | withdrawn | 2026-09-19 | r | none | x |',
      '| [ADR-003](ADR-003-replaced.md) | replaced | superseded by ADR-004 | 2026-09-19 | r | none | x |',
      '',
    ].join('\n'))
    write('src/app.js', '// x\n')
    const tracked = ['docs/adr/ADR-004-live.md', 'docs/adr-archive/README.md', 'docs/adr-archive/ADR-001-still.md',
      'docs/adr-archive/ADR-002-gone.md', 'docs/adr-archive/ADR-003-replaced.md', 'src/app.js']
    const { governing, graveyard } = decisionsGoverning(['src/app.js'], root, adrCorpus(root, { tracked }))
    const titles = list => list.map(entry => entry.title).sort()
    // The control half: an archived record the catalog calls `governing` DOES govern.
    assert.deepEqual(titles(governing), ['ADR-001: still governing', 'ADR-004: live'].sort())
    assert.deepEqual(titles(graveyard), ['ADR-002: withdrawn', 'ADR-003: replaced'].sort())
    assert.match(graveyard.find(entry => /replaced/.test(entry.title)).status, /superseded by ADR-004/i,
      'and the graveyard says WHAT replaced it, from the catalog')
  } finally { rmSync(root, { recursive: true, force: true }) }
})

// The catalog is the authority for a frozen record, so a catalog that cannot SAY
// must not hand the authority back to the frozen file, which says `Accepted` for
// ever. Each of these came back `governing`, `look: ok` — or, for the last two,
// took authority away from a record the evidence was not about
// (different-lineage review, 2026-09-19).
test('a catalog that does not establish a record\'s effect leaves it UNPROVEN, never governing', () => {
  const HEADER = ['# ADR Archive', '', '**Lifecycle:** Frozen historical ADR records', '',
    '| ADR | Title | Decision effect | Retired | Reason | Obligations | SHA-256 |',
    '|-----|-------|-----------------|---------|--------|-------------|---------|']
  const corpus = (rows, { listReadme = true, where = 'docs/adr-archive', readme = 'README.md', body } = {}) => {
    const root = realpathSync.native(mkdtempSync(join(tmpdir(), 'qh-arc-strict-')))
    const write = (relative, text) => {
      mkdirSync(join(root, ...relative.split('/').slice(0, -1)), { recursive: true })
      writeFileSync(join(root, ...relative.split('/')), text)
    }
    write(`${where}/ADR-007-x.md`, '# ADR-007: seven\n\n**Status:** Accepted\n**Governs:** `src/app.js`\n')
    write(`${where}/${readme}`, body ?? [...HEADER, ...rows, ''].join('\n'))
    write('src/app.js', '// x\n')
    const tracked = [`${where}/ADR-007-x.md`, 'src/app.js', ...(listReadme ? [`${where}/${readme}`] : [])]
    const records = adrCorpus(root, { tracked })
    const { governing, graveyard } = decisionsGoverning(['src/app.js'], root, records)
    rmSync(root, { recursive: true, force: true })
    return { governs: governing.length, buried: graveyard.length, look: records.look }
  }
  const row = (effect, { link = 'ADR-007-x.md', title = 'seven' } = {}) => `| [ADR-007](${link}) | ${title} | ${effect} | 2026-09-19 | r | none | x |`

  // The controls: one well-formed row decides, in both directions.
  assert.deepEqual(corpus([row('governing')]), { governs: 1, buried: 0, look: 'ok' })
  assert.deepEqual(corpus([row('withdrawn')]), { governs: 0, buried: 1, look: 'ok' })
  // An escaped pipe in a title is a title, not a column.
  assert.deepEqual(corpus([row('withdrawn', { title: 'X \\| Y' })]), { governs: 0, buried: 1, look: 'ok' })

  const unproven = { governs: 0, buried: 0, look: 'PARTIAL' }
  assert.deepEqual(corpus([]), unproven, 'no row for the record')
  assert.deepEqual(corpus([row('**withdrawn**')]), unproven, 'an effect adr-retire-check would refuse')
  assert.deepEqual(corpus([row('withdrawn'), row('governing')]), unproven, 'two rows that disagree')
  assert.deepEqual(corpus([row('withdrawn', { link: 'unrelated.md' })]), unproven, 'a row whose link names another file')
  // ⚠ NOR ANOTHER FILE OF THE SAME NAME. The first repair keyed rows by BASENAME, so
  // a sibling archive's record and a remote URL ending in the name both retired
  // this one — and a local link with a `#fragment` was refused (second review).
  assert.deepEqual(corpus([row('withdrawn', { link: '../other-archive/ADR-007-x.md' })]), unproven, 'the same basename in another directory')
  assert.deepEqual(corpus([row('withdrawn', { link: 'https://example.invalid/docs/ADR-007-x.md' })]), unproven, 'a remote link ending in the name')
  // ⚠ AND THE TWO THAT NORMALISE ONTO THE RECORD. With the check above "a URL
  // resolves to no local path" was believed and the scheme test removed; these are
  // the inputs that belief did not survive (third review).
  assert.deepEqual(corpus([row('withdrawn', { link: 'https://example.invalid/../../ADR-007-x.md' })]), unproven, 'dot-dot cancels the host')
  assert.deepEqual(corpus([row('withdrawn', { link: '/ADR-007-x.md' })]), unproven, 'a rooted link whose root is dropped by splitting')
  assert.deepEqual(corpus([row('withdrawn', { link: 'ADR-007-x.md#decision' })]), { governs: 0, buried: 1, look: 'ok' }, 'a fragment is not part of the file')
  // ⚠ AND THE FORMS A BLOCKLIST WALKED PAST. The guard was a list of things a link
  // must NOT be, and a leading space and an angle-wrapped URL were not on it (fourth
  // review). It is now a grammar a link must MATCH, so these fail by not being one.
  assert.deepEqual(corpus([row('withdrawn', { link: ' https://example.invalid/../../ADR-007-x.md' })]), unproven, 'a leading space')
  assert.deepEqual(corpus([row('withdrawn', { link: '<https://example.invalid/../../ADR-007-x.md#decision>' })]), unproven, 'angle-wrapped, with a fragment')
  assert.deepEqual(corpus([row('withdrawn', { link: './/ADR-007-x.md' })]), unproven, 'an empty path segment')
  assert.deepEqual(corpus([row('withdrawn', { link: '..\\docs\\adr-archive\\ADR-007-x.md' })]), unproven, 'backslashes are not link separators')
  assert.deepEqual(corpus([row('withdrawn', { link: '../adr-archive/ADR-007-x.md' })]), { governs: 0, buried: 1, look: 'ok' }, 'the control: dot-dot that really does come back to the record')
  assert.deepEqual(corpus([row('withdrawn', { link: './ADR-007-x.md' })]), { governs: 0, buried: 1, look: 'ok' })

  // ⚠ A README THE LISTING SPELLS `readme.md` IS UNKNOWN — IN BOTH DIRECTIONS, ON
  // EVERY FILESYSTEM. Whether it is this directory's catalog depends on whether the
  // filesystem folds case, and three review passes each broke a cleverer way of
  // finding out (existence, then inode identity, then a three-valued identity).
  // The reader does not guess now. A withdrawn row in it retires nothing, and a
  // governing row in it confirms nothing.
  assert.deepEqual(corpus([row('withdrawn')], { readme: 'readme.md' }), unproven)
  assert.deepEqual(corpus([row('governing')], { readme: 'readme.md' }), unproven)
  assert.deepEqual(corpus([row('withdrawn')], { readme: 'ReadMe.MD' }), unproven)
  // ⚠ THE CONTROL THAT WAS MISSING, and whose absence shipped a regression for one
  // commit: an ORDINARY `readme.md` — notes, no marker — is not an archive question
  // at all. Treating every case-variant as unknown made the records beside a plain
  // `docs/adr/readme.md` govern nothing, in every normal repository that has one.
  assert.deepEqual(corpus([], { readme: 'readme.md', body: '# Decision records\n\nNotes about how we write these.\n' }),
    { governs: 1, buried: 0, look: 'ok' })

  // A README git does not list governs nothing (CLAUDE.md §8): the record's own
  // status stands, as it would on any other machine.
  assert.deepEqual(corpus([row('withdrawn')], { listReadme: false }), { governs: 1, buried: 0, look: 'ok' })
  assert.deepEqual(corpus([row('withdrawn')], { listReadme: false, where: 'docs/adr' }), { governs: 1, buried: 0, look: 'ok' })
})

test('a README git does not list cannot freeze a tracked task directory', () => {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), 'qh-arc-unlisted-')))
  try {
    const write = (relative, text) => {
      mkdirSync(join(root, ...relative.split('/').slice(0, -1)), { recursive: true })
      writeFileSync(join(root, ...relative.split('/')), text)
    }
    write('docs/adr/ADR-002-current/tasks/T1-live.md', '# x\n')
    write('docs/adr/README.md', '# local notes\n\n**Lifecycle:** Frozen historical ADR records\n')
    const lines = listing => readyTaskLines(root, true, listing).lines.join('\n')
    // The control: once the README is LISTED, the marker freezes what is under it.
    assert.doesNotMatch(lines(['docs/adr/ADR-002-current/tasks/T1-live.md', 'docs/adr/README.md']), /ADR-002-current/)
    assert.match(lines(['docs/adr/ADR-002-current/tasks/T1-live.md']), /ADR-002-current/,
      'an untracked README on this disk hides nothing')
  } finally { rmSync(root, { recursive: true, force: true }) }
})

// A repository whose ROOT is the archive. The ancestor walk began one level down, so
// the record side called the record withdrawn while this side offered its task as
// READY — two readers disagreeing about one directory (ninth review).
test('an archive catalog at the repository root freezes the task directory beside it', () => {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), 'qh-arc-root-')))
  try {
    const write = (relative, text) => {
      mkdirSync(join(root, ...relative.split('/').slice(0, -1)), { recursive: true })
      writeFileSync(join(root, ...relative.split('/')), text)
    }
    write('tasks/T1.md', '# x\n')
    write('README.md', '# Archive\n\n**Lifecycle:** Frozen historical ADR records\n')
    let asked = 0
    const ready = () => { asked += 1; return { status: 0, stdout: JSON.stringify({ ready: [{ id: 'T1', goal: 'g', path: join(root, 'tasks', 'T1.md') }] }), stderr: '' } }
    const lines = listing => readyTaskLines(root, true, listing, ready).lines.join('\n')
    // The controls: an UNLISTED root README freezes nothing, and neither does an ordinary one.
    assert.match(lines(['tasks/T1.md']), /T1 is ready/)
    writeFileSync(join(root, 'README.md'), '# A project\n\nOrdinary.\n')
    assert.match(lines(['tasks/T1.md', 'README.md']), /T1 is ready/)
    assert.equal(asked, 2)
    // Marked and listed: frozen — no line at all, and adr-next is not asked.
    writeFileSync(join(root, 'README.md'), '# Archive\n\n**Lifecycle:** Frozen historical ADR records\n')
    assert.equal(lines(['tasks/T1.md', 'README.md']), '')
    // Listed and unreadable: UNPROVEN, never ready.
    rmSync(join(root, 'README.md'))
    const gone = lines(['tasks/T1.md', 'README.md'])
    assert.match(gone, /tasks: UNPROVEN/)
    assert.doesNotMatch(gone, /is ready/)
    assert.equal(asked, 2)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

// The same unknown, on the task side. `false` there offered a frozen record's task
// as READY with the command to prove it; `true` would have hidden live work in
// silence. `adr-next` cannot settle it — it reads the record and its tasks, never
// the catalog (fifth review).
test('a task directory that MAY be under a frozen archive gets an UNPROVEN line, not a ready one', () => {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), 'qh-arc-unknown-')))
  try {
    const write = (relative, text) => {
      mkdirSync(join(root, ...relative.split('/').slice(0, -1)), { recursive: true })
      writeFileSync(join(root, ...relative.split('/')), text)
    }
    const MARKED = '# Archive\n\n**Lifecycle:** Frozen historical ADR records\n'
    const task = where => `docs/${where}/ADR-002-x/tasks/T1-live.md`
    for (const where of ['bare', 'plain', 'marked', 'gone']) write(task(where), '# x\n')
    write('docs/plain/readme.md', '# Notes\n\nNothing about archives.\n')
    write('docs/marked/readme.md', MARKED)
    let asked = 0
    const ready = () => { asked += 1; return { status: 0, stdout: JSON.stringify({ ready: [{ id: 'T1', goal: 'g', path: join(root, 'docs', 'T1.md') }] }), stderr: '' } }
    const lines = listing => readyTaskLines(root, true, listing, ready).lines.join('\n')
    // The controls: no README above it, and an ORDINARY lowercase one above it — the
    // directory IS asked about and IS offered. The second is the case a blanket
    // "every variant is unknown" rule got wrong in every normal repository.
    assert.match(lines([task('bare')]), /T1 is ready/)
    assert.match(lines([task('plain'), 'docs/plain/readme.md']), /T1 is ready/)
    assert.equal(asked, 2)
    // A case-variant that CARRIES THE MARKER: whether it is the catalog is the one
    // thing that depends on the filesystem, and it is not guessed.
    const variant = lines([task('marked'), 'docs/marked/readme.md'])
    assert.match(variant, /docs\/marked\/ADR-002-x\/tasks: UNPROVEN/)
    assert.doesNotMatch(variant, /is ready/)
    // A listed README.md that cannot be read — it may well carry the marker.
    const unreadable = lines([task('gone'), 'docs/gone/README.md'])
    assert.match(unreadable, /docs\/gone\/ADR-002-x\/tasks: UNPROVEN/)
    assert.doesNotMatch(unreadable, /is ready/)
    assert.equal(asked, 2, 'adr-next is not asked about a directory whose standing is unknown')
  } finally { rmSync(root, { recursive: true, force: true }) }
})

// `tasks` is Ansible's word too: every role has a `roles/<name>/tasks/main.yml`.
// A peer session ran SessionStart over an infrastructure repository on 2026-09-19
// — 28 role directories, 3 real ADR task directories — and half of the six entries
// a session reads at startup were
//   roles/admins/tasks: UNPROVEN — adr-next could not run (exit 1): no task files
// alphabetical, so `roles/admins` outranked a READY task, on every session start.
// A task directory is one that holds a Markdown file; `adr-next` reads nothing else.
test('a directory named tasks that holds no Markdown is not an ADR task directory', () => {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), 'qh-ansible-tasks-')))
  try {
    const write = (relative, text) => {
      mkdirSync(join(root, ...relative.split('/').slice(0, -1)), { recursive: true })
      writeFileSync(join(root, ...relative.split('/')), text)
    }
    const roles = ['admins', 'app-secret-backup', 'app-secret-ingest', 'base', 'certs', 'db', 'firewall']
    const listing = [
      'docs/adr/ADR-002-current/tasks/T1-live.md',
      ...roles.flatMap(role => [`roles/${role}/tasks/main.yml`, `roles/${role}/tasks/files/notes.md`]),
    ]
    for (const relative of listing) write(relative, '# x\n')
    const lines = readyTaskLines(root, true, listing).lines.join('\n')
    // The control: the real task directory is still found — after seven that sort before it.
    assert.match(lines, /ADR-002-current/, lines)
    assert.doesNotMatch(lines, /roles\//, `an Ansible role is not a record's task set:\n${lines}`)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

// `listedReadme` is total over one table, and this is that table, a row a cell.
// Driven through the function's own seams: two spellings in one directory cannot
// exist on a filesystem that folds case, which is two of the three platforms here.
// It reached this shape a cell at a time over five reviews — the first variant only
// (sixth); two variants read through one aliased file (seventh); and an exact-name
// shortcut that returned BEFORE the collision count, so `README.md` + `readme.md`
// gave a definite answer in whichever direction the surviving bytes pointed (eighth).
test('which README a directory\'s archive marker is read from: every cell of the table', () => {
  const MARKED = '# Archive\n\n**Lifecycle:** Frozen historical ADR records\n'
  const ORDINARY = '# notes\n'
  const look = files => listedReadme('/d', Object.keys(files), file => {
    const name = file.split(/[\\/]/).at(-1)
    if (files[name] === null) throw new Error('EIO')
    return files[name]
  })
  const unknown = value => typeof value === 'symbol'
  // None listed: not an archive question. Near-matches are not READMEs.
  assert.equal(look({ 'notes.md': 'x' }), null)
  assert.equal(look({ 'readme.md.bak': MARKED, 'xreadme.md': MARKED }), null)
  // Exactly `README.md`, alone: its path, whatever it holds — the CALLER reads it.
  for (const body of [ORDINARY, MARKED, null]) assert.match(String(look({ 'README.md': body })), /README\.md$/)
  // One other spelling: ordinary is a README and nothing more; marked or unreadable is unknown.
  assert.equal(look({ 'readme.md': ORDINARY }), null)
  assert.ok(unknown(look({ 'readme.md': MARKED })))
  assert.ok(unknown(look({ 'ReadMe.MD': null })))
  // ⚠ MORE THAN ONE LISTED SPELLING IS UNKNOWN BEFORE ANYTHING IS READ — and the
  // exact name is one of the spellings. Where case folds, every name opens ONE file,
  // so the bytes cannot be attributed to an entry. This reader is that filesystem:
  // it answers every spelling with the same content.
  let reads = 0
  const folding = body => names => listedReadme('/d', names, () => { reads += 1; return body })
  assert.ok(unknown(folding(ORDINARY)(['Readme.md', 'readme.md'])), 'two variants, both reading as ordinary')
  assert.ok(unknown(folding(ORDINARY)(['README.md', 'readme.md'])), 'the exact name beside a variant, ordinary bytes surviving — it governed and offered READY')
  assert.ok(unknown(folding(MARKED)(['README.md', 'readme.md'])), 'and with marked bytes surviving — it buried the record and hid its task')
  assert.ok(unknown(look({ 'Readme.md': ORDINARY, 'readme.md': MARKED })), 'and on a filesystem that does keep them apart')
  assert.equal(reads, 0, 'a collision is decided by the listing, before any read')
})

// "Nothing governs this file" and "could not tell what governs this file" were one
// silence at the two places a session actually reads the answer: the edit hook's
// context, and `adr-context`. The second was worse than silent — PARTIAL was one
// arm of an else-if chain, so it also stopped naming the records it HAD read.
test('an UNPROVEN record is named where its paths are edited, and PARTIAL hides nothing else', () => {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), 'qh-arc-context-')))
  try {
    const write = (relative, text) => {
      mkdirSync(join(root, ...relative.split('/').slice(0, -1)), { recursive: true })
      writeFileSync(join(root, ...relative.split('/')), text)
    }
    const record = (number, title) => `# ADR-00${number}: ${title}\n\n**Status:** Accepted\n**Governs:** \`src/app.js\`\n`
    write('docs/adr/ADR-004-live.md', record(4, 'live'))
    write('docs/old/ADR-007-frozen.md', '# ADR-007: frozen\n\n**Status:** Accepted\n**Governs:** `src/app.js`, `src/old.js`\n')
    // A marked catalog under another spelling: the one case that is genuinely unknown.
    write('docs/old/readme.md', '# Archive\n\n**Lifecycle:** Frozen historical ADR records\n\n| ADR | Title | Decision effect |\n|---|---|---|\n| [ADR-007](ADR-007-frozen.md) | frozen | withdrawn |\n')
    write('src/app.js', '// x\n')
    write('src/old.js', '// x\n')
    // A record with NO `Governs:` header: what it would govern comes only from its
    // task's Affected Files table. Matched on the header alone, it matched nothing
    // and was dropped in silence (seventh review).
    write('docs/old/ADR-008-tasks-only.md', '# ADR-008: tasks only\n\n**Status:** Accepted\n')
    write('docs/old/ADR-008-tasks-only/tasks/T1-x.md', '# Task T1\n\n## Affected Files\n\n| File | Change |\n|---|---|\n| `src/task-only.js` | edit |\n')
    write('src/task-only.js', '// x\n')
    const env = { ...process.env, GIT_AUTHOR_NAME: 'qh', GIT_AUTHOR_EMAIL: 'qh@example.invalid', GIT_COMMITTER_NAME: 'qh', GIT_COMMITTER_EMAIL: 'qh@example.invalid' }
    for (const args of [['init', '-q'], ['add', '-A'], ['commit', '-q', '-m', 'base']]) {
      const run = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', timeout: 30_000, env })
      assert.equal(run.status, 0, run.stderr)
    }
    const context = decisionContext(['src/app.js'], root)
    // The control: the record that CAN be placed is still named.
    assert.match(context, /ADR-004-live\.md/)
    assert.match(context, /UNPROVEN/)
    assert.match(context, /ADR-007-frozen\.md/)
    // With ONLY the unplaceable record declaring the path, the answer used to be ''.
    const alone = decisionContext(['src/old.js'], root)
    assert.doesNotMatch(alone, /ADR-004/, 'the control: nothing placeable declares this path')
    assert.match(alone, /UNPROVEN[\s\S]*ADR-007-frozen\.md/)
    assert.match(decisionContext(['src/task-only.js'], root), /UNPROVEN[\s\S]*ADR-008-tasks-only\.md/)

    const script = join(realpathSync.native(join(import.meta.dirname, '..')), 'plugin', 'scripts', 'adr-context.mjs')
    const said = spawnSync(process.execPath, [script, 'src/app.js'], { cwd: root, encoding: 'utf8', timeout: 60_000, env })
    assert.equal(said.status, 0, said.stderr)
    assert.match(said.stdout, /could-not-look/)
    assert.match(said.stdout, /UNPROVEN\s+docs[\\/]old[\\/]ADR-007-frozen\.md/)
    assert.match(said.stdout, /GOVERNS\s+docs[\\/]adr[\\/]ADR-004-live\.md/, 'PARTIAL qualifies the answer; it does not replace it')
    const json = JSON.parse(spawnSync(process.execPath, [script, '--json', 'src/app.js'], { cwd: root, encoding: 'utf8', timeout: 60_000, env }).stdout)
    assert.equal(json.look, 'PARTIAL')
    assert.deepEqual(json.unproven.map(entry => entry.title), ['ADR-007: frozen'])
    assert.equal(json.governing.length, 1)
  } finally { rmSync(root, { recursive: true, force: true }) }
})
