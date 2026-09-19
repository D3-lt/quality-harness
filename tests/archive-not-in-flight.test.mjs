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
import { adrCorpus, decisionsGoverning, readyTaskLines } from '../plugin/scripts/lifecycle.mjs'

test('session orientation asks adr-next about the active corpus and never about a frozen archive', () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'qh-arc-flight-')))
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
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'qh-arc-effect-')))
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
