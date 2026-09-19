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
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { adrCorpus, decisionsGoverning, readyTaskLines, sameFilesystemEntry } from '../plugin/scripts/lifecycle.mjs'

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
  const corpus = (rows, { listReadme = true, where = 'docs/adr-archive', readme = 'README.md', sameEntry } = {}) => {
    const root = realpathSync.native(mkdtempSync(join(tmpdir(), 'qh-arc-strict-')))
    const write = (relative, text) => {
      mkdirSync(join(root, ...relative.split('/').slice(0, -1)), { recursive: true })
      writeFileSync(join(root, ...relative.split('/')), text)
    }
    write(`${where}/ADR-007-x.md`, '# ADR-007: seven\n\n**Status:** Accepted\n**Governs:** `src/app.js`\n')
    write(`${where}/${readme}`, [...HEADER, ...rows, ''].join('\n'))
    write('src/app.js', '// x\n')
    const tracked = [`${where}/ADR-007-x.md`, 'src/app.js', ...(listReadme ? [`${where}/${readme}`] : [])]
    const records = adrCorpus(root, { tracked, sameEntry })
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
  assert.deepEqual(corpus([row('withdrawn', { link: './ADR-007-x.md' })]), { governs: 0, buried: 1, look: 'ok' })

  // A README the listing spells `readme.md`. Where the exact name and the listed
  // one are ONE FILE — a case-folding filesystem — it is the catalog; where they are
  // not, it is a different file and freezes nothing. Which is a parameter, so both
  // arms run on every platform rather than one arm per CI runner (CLAUDE.md §7).
  assert.deepEqual(corpus([row('withdrawn')], { readme: 'readme.md', sameEntry: () => true }), { governs: 0, buried: 1, look: 'ok' })
  assert.deepEqual(corpus([row('withdrawn')], { readme: 'readme.md', sameEntry: () => false }), { governs: 1, buried: 0, look: 'ok' })
  // ⚠ "ONE FILE" IS AN IDENTITY, NOT AN EXISTENCE. The first predicate was
  // `existsSync(exact)`, so an unlisted, unrelated `README.md` beside a listed
  // `readme.md` switched the listed one on. Driven through a stat stub, so the
  // two-distinct-files case is reachable on a filesystem that cannot hold both.
  const stat = entries => file => { if (!(file in entries)) throw new Error('ENOENT'); return { dev: 1n, ino: entries[file] } }
  assert.equal(sameFilesystemEntry('README.md', 'readme.md', stat({ 'README.md': 7n, 'readme.md': 7n })), true, 'the control: one entry, two spellings')
  assert.equal(sameFilesystemEntry('README.md', 'readme.md', stat({ 'README.md': 8n, 'readme.md': 7n })), false, 'two files that both exist')
  assert.equal(sameFilesystemEntry('README.md', 'readme.md', stat({ 'readme.md': 7n })), false, 'the exact name opens nothing')

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
