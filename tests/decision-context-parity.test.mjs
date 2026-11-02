// ADR-137 T1: the Go core's record rules (core/hooks/decisioncorpus.go) answer every row as plugin/scripts/decision-corpus.mjs
// does. The rows are built here from the live Node exports: every row of tests/fixtures/record-recognition.json laid out on
// disk, and adversarial strings for each rule (Unicode case folding and whitespace, `.` at line separators, the patterns that
// need lookaround, globs, typed matchers, fenced status sections, frontmatter, MADR bullets, archive catalogs). The rules
// decision-corpus.mjs does not export (declaredGoverns, affectedFiles, archiveDecisionEffect, supersessionTarget, statusKind,
// adrNumber, the ADR_FILE name arm) are reached through adrCorpus over a scratch corpus with an injected listing, so no git
// runs. The Go test (TestDecisionCorpusParity in core/hooks/decisioncorpus_parity_test.go) answers each row and says how many
// it compared. Nothing is stored: both implementations run live. Skipped, with the reason, where `go` is not on PATH.
// ADR-137 T4 adds the rows whose answer depends on the platform, with the platform passed in on both sides: listedPath,
// hasDecisionCorpus and adrCorpus over listings with backslash names, case-variant archive READMEs, a record directory reached
// through a link, and a listed spelling whose case differs from the disk's.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { remove } from './helpers/remove.mjs'
import { required } from './helpers/require.mjs'
import {
  adrCorpus, corpusEligible, declaredEnforcement, gfmTableRows, listedPath, nameArmSpelling, pathMatchesDeclaration, RECORD_DIRECTORY,
  recognisedAsRecord, recordId, recordStatus, recordStatusKind, referencesIn, screenAdmits, titleLine,
} from '../plugin/scripts/decision-corpus.mjs'
import { hasDecisionCorpus } from '../plugin/scripts/session-orientation.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '..')
const coreDir = path.join(repoRoot, 'core')
const TABLE = JSON.parse(readFileSync(path.join(repoRoot, 'tests', 'fixtures', 'record-recognition.json'), 'utf8'))
const goVersion = spawnSync('go', ['version'], { encoding: 'utf8', timeout: 30_000, windowsHide: true })
const noGo = required('go', goVersion.error || goVersion.status !== 0
  ? `go is not on PATH (${goVersion.error?.code ?? `exit ${goVersion.status}`}), so the Go core cannot be built here` : false)
const onWindows = process.platform === 'win32'

function run(fn, f, ...args) {
  try {
    return { fn, args, want: f(...args) }
  } catch (error) {
    return { fn, args, want: { threw: error.message } }
  }
}

const textOf = file => (file.gen
  ? (file.gen.before ?? '') + file.gen.repeat.repeat(Math.ceil(file.gen.bytes / file.gen.repeat.length)) + (file.gen.then ?? '')
  : file.text ?? '')

// `files` laid out under a fresh directory of `scratch` (a path starting `outside/` beside it); null when a link cannot be
// made here (Windows EPERM). No git: recognisedAsRecord and adrCorpus with a listing read only the disk.
function layOut(scratch, files, under = 'repo') {
  const base = mkdtempSync(path.join(scratch, 'r-'))
  const repo = path.join(base, ...under.split('/'))
  mkdirSync(repo, { recursive: true })
  for (const file of files) {
    const at = file.path.startsWith('outside/') ? path.join(path.dirname(repo), ...file.path.split('/')) : path.join(repo, ...file.path.split('/'))
    mkdirSync(path.dirname(at), { recursive: true })
    if (file.link) {
      try { symlinkSync(file.link, at) } catch (error) { if (error.code === 'EPERM') return null; throw error }
    } else if (file.notRegular) {
      mkdirSync(at)
    } else if (file.bytes) {
      writeFileSync(at, file.bytes)
    } else {
      writeFileSync(at, file.nul ? `${textOf(file)}\u0000` : textOf(file))
    }
  }
  return repo
}

const recognition = (root, file, platform) => {
  const answer = recognisedAsRecord(root, file, readFileSync(file, 'utf8'), { platform })
  return { recognised: answer.recognised, status: answer.status, kept: answer.kept, arm: answer.arm }
}

// Every row of the approved table, its two spellings and L11's link layout: the definition's columns, asserted against the
// approved answers first, so a layout mistake cannot make both implementations agree on something else.
function fixtureRows(scratch) {
  const rows = []
  for (const row of TABLE.rows) {
    const repo = layOut(scratch, row.files, row.repositoryUnder)
    // A row whose link this host cannot make (Windows without symlink privilege) is not built; it is named, not counted.
    if (!repo) { (rows.unbuilt ??= []).push(row.id); continue }
    const subject = row.subject ?? row.files[0].path
    const file = path.join(repo, ...subject.split('/'))
    const r = run('recognisedAsRecord', recognition, repo, file, process.platform)
    assert.deepStrictEqual([r.want.recognised, r.want.status], [row.recognised, row.status], `${row.id}: Node disagrees with the approved row`)
    rows.push(r)
    const text = readFileSync(file, 'utf8')
    const id = run('recordId', recordId, path.basename(file), titleLine(text))
    assert.equal(id.want, row.identity, `${row.id}: Node's identity disagrees with the approved row`)
    rows.push(id, run('titleLine', titleLine, text), run('recordStatus', recordStatus, text))
    const eligible = run('corpusEligible', corpusEligible, subject)
    assert.equal(eligible.want, row.eligible, `${row.id}: Node's eligibility disagrees with the approved row`)
    rows.push(eligible)
  }
  if (!onWindows) {
    for (const spelling of TABLE.spellings) {
      const repo = layOut(scratch, [{ path: spelling.path, text: spelling.text }])
      const file = path.join(repo, ...spelling.path.split('/'))
      for (const [platform, approved] of [['darwin', spelling.recognised.posix], ['linux', spelling.recognised.posix], ['win32', spelling.recognised.win32]]) {
        const r = run('recognisedAsRecord', recognition, repo, file, platform)
        if (approved !== null) assert.equal(r.want.recognised, approved, `${spelling.id} on ${platform}`)
        rows.push(r)
      }
    }
  }
  const l11 = TABLE.layouts.find(layout => layout.id === 'L11')
  const repo = layOut(scratch, l11.files)
  if (repo) {
    for (const [subject, approved] of Object.entries(l11.definition)) {
      const r = run('recognisedAsRecord', recognition, repo, path.join(repo, ...subject.split('/')), process.platform)
      assert.deepStrictEqual({ recognised: r.want.recognised, arm: r.want.arm }, approved, `L11 ${subject}`)
      rows.push(r)
    }
  }
  return rows
}

// Globs and plain declarations, each against every candidate: `**`, `*`, `?`, the escaped regex specials, separators, and the
// case folding of JavaScript's /i without `u` (no non-ASCII letter folds into ASCII; a code unit, not a code point, per `?`).
const declarations = [
  'docs/adr', 'docs/adr/', './docs/adr', 'docs\\adr', 'Docs/adr', 'docs/*.md', 'docs/**', 'docs/**/x.md', '**/x.md', '**', '*',
  '?', 'a?c', 'DOCS/*.MD', 'docs/**/*.md', 'docs/***', 'docs/**x', '.\\docs\\*', '././docs/*', 'a.b*', 'a+b*', '(x)*', '[ab]*',
  '{a,b}*', '$x*', '^x*', 'a|b*', 'é*', 'É*', 'ſ*', 'S*', 's*', 'K*', 'k*', 'İ*', 'i*', 'ı*', 'ᾳ*', 'ᾼ*', 'ß*', 'µ*', 'Μ*',
  'ǅ*', 'ǆ*', 'σ*', 'ς*', 'Σ*', 'a??b', 'a?b', '😀*', '*😀', '', '/', '*/', 'x/**/', 'x\u2028*', 'x**y', 'x*y', 'a\\*',
  'docs/adr/ADR-001.md', 'x?z', 'x??z',
]
const candidates = [
  'docs/adr', 'docs/adr/x.md', 'docs/adrx', 'DOCS/ADR/X.MD', 'docs/x.md', 'docs/sub/x.md', 'x.md', 'a/b/x.md', 'abc', 'aXc',
  'a/c', 'a.bz', 'a+bz', '(x)z', '[ab]z', '{a,b}z', '$xz', '^xz', 'a|bz', 'éz', 'Éz', 'ſz', 'Sz', 'sz', 'Kz', 'kz', 'İz', 'iz',
  'ız', 'ᾳz', 'ᾼz', 'ßz', 'ẞz', 'µz', 'Μz', 'μz', 'ǅz', 'ǆz', 'Ǆz', 'σz', 'ςz', 'Σz', 'a😀b', '😀z', 'z😀', './docs/x.md',
  'docs\\x.md', 'x\u2028z', 'x\nz', 'x\rz', 'xa\u2028y', 'xay', 'xy', 'a*', 'a\\b', '', 'docs/adr/ADR-001.md',
  'docs/adr/sub/deeper', 'x/y', 'x/', 'x', 'docs/', 'xaz', 'x\u2028\u2029z', 'x😀z',
]

// Every BMP code unit against its case partners, as single-character globs: one row whose answer is the whole table.
function foldSweep() {
  const pairs = []
  for (let c = 0x80; c <= 0xffff; c++) {
    if (c >= 0xd800 && c <= 0xdfff) continue
    const ch = String.fromCharCode(c)
    const partners = new Set([ch.toUpperCase(), ch.toLowerCase(), ch.toUpperCase().toLowerCase(), ch.toLowerCase().toUpperCase()])
    for (const partner of partners) {
      if (partner.length === 1 && partner !== ch && partner !== '*' && partner !== '?' && partner !== '/' && partner !== '\\') pairs.push(`${ch}${partner}`)
    }
  }
  return pairs
}
const sweep = pairs => pairs.map(pair => pathMatchesDeclaration(`${pair[0]}z`, `${pair[1]}*`))

const statusWords = [
  'Accepted', 'accepted', 'ACCEPTED', 'Active', 'Acceptedé', 'Accepted.', 'Accepted-x', 'Proposed', 'Draft', 'Superseded by ADR-002',
  'Withdrawn', 'Rejected', 'Deprecated', 'Implemented', '', null, ' \u00a0Accepted', '\ufeffAccepted', 'actİve', 'ACTİVE',
  'acti\u0307ve', 'Accepted\u0301', 'Accepted٣', 'Accepted²', 'ſuperseded', 'superſeded', 'Deprecated🙂', '\u2028Accepted',
  'Accepted\u2028', 'Accep_ted', '「Accepted」', 'Ａccepted', 'DRAFT', 'Withdrawn\u3000', '\u1680Rejected', '\u0085Accepted',
  'frozen, effect UNPROVEN — x', 'governing', 'withdrawn', 'superseded by ADR-001', 'Accepted\u00adx', 'AcceptedK',
]

const statusTexts = [
  '# ADR-001: X\n\n**Status:** Accepted\n', 'Status: Accepted', 'status: accepted', 'STATUS: x', 'ſtatus: Accepted',
  '   Status: x', '    Status: x', '\tStatus: x', '**Status**: Accepted', '**Status:** **Accepted**', 'Status:', 'Status:   ',
  'Status: Accepted \u00a0', 'Status: \ufeffAccepted', 'Status: Accepted\u2028## Decision', 'Status：Accepted', 'Status:**Accepted',
  '*Status:* x', '***Status:*** x', '---\nstatus: "accepted"\n---\n# x', "---\nStatus: 'Proposed' # comment\n---\n",
  '---\n  Status: nested\n---\nStatus: Real', '\ufeff---\nStatus: a\n...\n', '---\nStatus: open\n', '--- \nStatus: x\n---',
  '---\nStatus: "unclosed\n---\n', '---\nStatus: a # c\n---\n', '---\nStatus:   \u00a0"b"  \n---\n',
  '```\nStatus: Fenced\n```\nStatus: Real', '~~~\nStatus: x\n~~~~\nStatus: y', '```js `x`\nStatus: a\n',
  '````\nStatus: a\n```\nStatus: b\n````\nStatus: c', '```\nStatus: never closed', '  ```\nStatus: a\n  ```  \nStatus: b',
  '## Status\n\nAccepted\n', '## Status\n\n    Indented\nAccepted', '## STATUS  \n\nProposed', '## Status\u00a0\nx',
  '## Status\u0085\nx', '## Status\ufeff\nx', '### Status\nx', '## Status\n```\nAccepted\n```\nProposed',
  '## Status\n## Other\n## Status\nLast', '## Status\n\n', '## Status\n\n**Accepted**\n', '## Status\u2028x\nAccepted',
  '## Status\n\t\tTabbed\n  Spaced', '## Status \u3000\n\n_Draft_\n', '## Statuſ\nx', '##  Status\nx', '## Status\nStatus: Inline',
  '* Status: accepted\n## Context', '- Status: proposed', '    - Status: x', '## Context\n* Status: late',
  '* Status: a\n* Status: b', '* **Status:** a', '+ Status: a', '-\tStatus: tabbed', 'Status: a\r\nx', 'x\rStatus: b',
  'Status: _Accepted_', 'Status: `Accepted`', 'Status: *Superseded* by _ADR-002_', '', 'no status here', 'Statuses: x',
  'The Status: x', '> Status: quoted',
]

const governsVariants = [
  '**Governs:** `a.md`, b/c.md', 'Governs: None — reason', 'governs: none', 'GOVERNS: x', 'Governſ: x', '**Governs**: x y,z',
  'Governs x', ' \t**Governs:** <placeholder>, (paren), real', 'Governs: `a b`, `c`', 'Governs: ``, x', 'Governs: a\u00a0b',
  'Governs: a\ufeffb', 'Governs: a\u2028b', 'Governs:\n  - type: path\n    pattern: "src/**"\n  - type: package\n    pattern: lodash',
  'Governs:\r\n  - type: path\r\n    pattern: crlf/*\r\n', "Governs:\n- type: Path\n  pattern: 'x/*'", 'Governs:\n- type: path pattern: a',
  'Governs:\n  - type: path\n    pattern: a\u2028b', 'Governs:\n  - type: path\n    pattern:  ', 'Governs:\n  - type: xpattern: foo',
  'Governs: x\n\n  - type: path\n    pattern: after-blank', 'Governs: x\nplain line\n  - type: path\n    pattern: after-plain',
  'Governs: x\nGoverns: y', 'Governs: nonetheless', 'Governs: none-of-it', 'Governs:\n\n\n  - type: path\n    pattern: lead-blanks',
  'Governs:\n - type: path\n   pattern: "q" ', 'Governs:\n  - type: module\n    pattern: "m"\n  - type: path\n    pattern: p\n',
  'Governs: a,,b , c', 'Governs: `x`y`', 'Governs: a`b`c', '**Governs:**: a', 'Governs:: a', '***Governs:*** a',
  'Governs:\u00a0a', 'governs\u2029: a', 'Governs: a\u2029  - type: path\n    pattern: sep',
  'Governs:\n  - type: path\n    pattern: \'a"b\'', 'Governs:\n  - type: path\n    pattern: a\u00a0', 'Governs:\n\t- type: path\n\t  pattern: tab',
]

const enforcedTexts = [
  'Enforced-by: `tests/a.test.mjs`, tests/b.py', 'Enforced-by: None — x', '**Enforced-by:** `a, b`, c', 'enforced-by: <x>, (y), z',
  'Enforced-by: ``, a', 'Enforced-by: \u00a0a ,b\ufeff', 'Enforced-byx: a', 'Enforced-by: none-of-it', 'Enforced-by: nonetheless',
  'ENFORCED-BY: A', 'Enforced-by:', 'Enforced-by: a\u2028b, c', 'x\nEnforced-by: second', '  **Enforced-by**: `unclosed, a',
  'Enforced-by: `a`, `b`, c, d', 'Enforced-by: \u2003a', 'Enforced by: a', 'Enforced-by: a\nEnforced-by: b', 'Enforced-bY: k',
  'Enforced-by: `x`,,', 'no header', 'Enforced-by:\u3000None', 'Enforced-by: None\u00a0x',
]

const nl = '\n'
const table = (...lines) => lines.join(nl)
const affectedSections = [
  table('## Affected Files', '', '| File | Change | Why |', '|------|--------|-----|', '| `a.md` | add | x |', '| `b.md` | read | x |',
    '| `c.md` | Read (unchanged) | x |', '| `d.md` | none — already correct | x |', '| `e.md` | read-only guard added | x |',
    '| `f.md` | unchanged (except x) | x |', '| `g.md` | **read** | x |', '| `h.md` | No change. | x |', '| `i.md` | read; then add | x |',
    '| `j.md` | READ ONLY | x |', '| `k.md` | read only – reason | x |', '| `l.md` | none\u2028x | x |', '| `m.md` | `none` | x |'),
  table('## Affected Files', '', '| File | Why |', '|---|---|', '| `a.md` | read |', '| b/c.js | read |'),
  table('## Affected Files', '', 'File | Change', '--- | ---', '`a.md` | read', '`b.md` | add', 'loose/line.md'),
  table('## Affected Files', '', '| File | Change |', '|:--|:-:|', '| `a\\|b.md` | read |', '| `c.md` | x \\| read |', '| `d.md` | add | extra |', '| `e.md` |'),
  table('## Affected Files', '', '| File | Change |', '|---|---|', '| `Dockerfile` | add |', '| **`Makefile`** | add |',
    '| `Makefile` (L80-85) | add |', '| catches `SomeError` from x | add |', '| `(data).json` | add |', '| src/a.js | add |',
    '| Makefile | add |', '| File | add |', '| <placeholder> | add |', '| a b.md | add |', '| `a b` | add |', '| `<x>` | add |',
    '| _`Rakefile`_ | add |', '| *`Gemfile`** | add |', '| _`Rakefile`* | add |', '| __`Gulpfile`_ | add |', '| `x` `y.md` | add |', '| ``z.md`` | add |', '| `` | add |', '| `\u00a0` | add |'),
  table('## Affected Files', '```', '# Example', '| `fenced.md` | add |', '```', '| File | Change |', '|---|---|', '| `after.md` | add |'),
  table('### Affected Files', '| File | Change |', '|---|---|', '| `level3.md` | add |'),
  table('## affected files', '| File | Change |', '|---|---|', '| `lower.md` | add |'),
  table('## Affected Fileſ', '| File | Change |', '|---|---|', '| `longs.md` | add |'),
  table('## Affected Files\u00a0', '| File | Change |', '|---|---|', '| `nbsp.md` | add |'),
  table('##\tAffected Files', '| File | Change |', '|---|---|', '| `tab.md` | add |'),
  table('## Affected  Files', '| File | Change |', '|---|---|', '| `two.md` | add |'),
  table('####### Affected Files', '| File | Change |', '|---|---|', '| `seven.md` | add |'),
  table('## Affected Files', '| File | Change |', '|---|---|', '| `one.md` | add |', '## Next', '| `two.md` | add |'),
  table('## Affected Files', '| File | Change |', '|---|---|', '| `a.md` | read |', '> quote', '| `b.md` | read |'),
  table('## Affected Files', '| File | Change |', '|---|---|', '| `a.md` | read |', '<!-- c -->', '| `b.md` | read |'),
  table('## Affected Files', '| File | Change |', '|---|---|', '| `a.md` | read |', '<div>', '| `b.md` | read |'),
  table('## Affected Files', '| File | Change |', '|---|---|', '| `a.md` | read |', '<https://x>', '| `b.md` | read |'),
  table('## Affected Files', '| File | Change |', '|---|---|', '| `a.md` | read |', '<linK>', '| `b.md` | read |'),
  table('## Affected Files', '| File | Change |', '|---|---|', '| `a.md` | read |', '<ſcript>', '| `b.md` | read |'),
  table('## Affected Files', '| File | Change |', '|---|---|', '| `a.md` | read |', '<SCRIPT>', '| `b.md` | read |'),
  table('## Affected Files', '| File | Change |', '|---|---|', '| `a.md` | read |', '- item', '| `b.md` | read |'),
  table('## Affected Files', '| File | Change |', '|---|---|', '| `a.md` | read |', '***', '| `b.md` | read |'),
  table('## Affected Files', '| File | Change |', '|---|---|', '| `a.md` | read |', '1. one', '| `b.md` | read |'),
  table('## Affected Files', '| File | Change |', '|---|---|', '| `a.md` | read |', '', '| `b.md` | read |'),
  table('## Affected Files', '| File | Change |', '|---|---|', 'nopipe.md', '|---|---|', '| `c.md` | read |'),
  table('## Affected Files', '| File | Change |', '|---|---|---|', '| `w.md` | read |'),
  table('## Affected Files', '| File | CHANGE |', '|---|---|', '| `u.md` | read |'),
  table('## Affected Files', '| File | Change  |', '|---|---|', '| `s.md` | none |'),
  table('## Affected Files', '| File | Chanǵe |', '|---|---|', '| `s.md` | none |'),
  table('## Affected Files', '| File | Change |', '| --- | --- |', '| `p.md` | read |', '| :-: | :-: |', '| `q.md` | read |'),
  table('## Affected Files', '\u00a0| File | Change |\u00a0', '|---|---|', '| `n.md` | read |\ufeff'),
  table('## Affected Files', '| File | Change |', '|---|---|', '| `cr.md` | read |\r', '| `cr2.md` | add |'),
]
const recordWith = (body, status = 'Accepted') => `# ADR-001: X\n\n**Status:** ${status}\n${body}\n\n## Decision\n\nx\n`

const gfmLineSets = [
  ['| a | b |', '|---|---|', '| c | d |'], ['a | b', '--- | ---', 'c | d', 'e'], ['| a |', '|---|---|', '| c |'],
  ['| a \\| b | c |', '|---|---|', '| \\| | x |'], ['x', '| a | b |'], ['| a | b |', '| - | - |', '> q', '| c | d |'],
  ['|a|b|', '|:-|-:|', '|c|d|e|'], ['| a | b |', '|---|---|', '|---|---|'], ['  | a |  ', ' |---| ', ' | b | '],
  ['| Change | x |', '|---|---|', '| read | y |'], ['| x | CHANGE |', '|---|---|'], ['a\\|b', '---'], ['|', '|'], ['', '|a|'],
  ['| a | b |', '|---|---|', '<!-- x -->', '| c | d |'], ['| a | b |', '|---|---|', '<pre>', '| c | d |'],
  ['| a | b |', '|---|---|', '<blockquoteK>', '| c | d |'], ['| a | b |', '|---|---|', '<custom>', '| c | d |'],
  ['| a | b |', '|---|---|', '- - -', '| c | d |'], ['| a | b |', '|---|---|', '_ _ _', '| c | d |'], ['| a | b |', '|---|---|', '+', '| c |'],
  ['| a | b |', '|---|---|', '1234567890. x', '| c |'], ['| a | b |', '|---|---|', '123456789) x', '| c |'],
  ['| a | b |', '|\u00a0---|---|', '| c | d |'], ['\u2028| a | b |', '|---|---|'], ['| a | b |\u2028', '|---|---|\u2028', 'x'],
  ['| a | b |', '|---|---|', '<![CDATA[', '| c |'], ['| a | b |', '|---|---|', '<?php', '| c |'], ['| a | b |', '|---|---|', '<!DOCTYPE', '| c |'],
  ['| a | b |', '|---|---|', '</table>', '| c |'], ['| a | b |', '|---|---|', '<tr/>', '| c |'], ['| a | b |', '|---|---|', '<h7>', '| c |'],
  ['\\|a', '|---|'], ['a|', '-|'], ['|a', '|-'],
]

const recordNames = [
  'ADR-001-x.md', 'adr_7_x.md', 'ADR7-x.md', '0001-x.md', '001-x.md', '01-x.md', '1-x.md', '12345-x.md', '2026-07-15-x.md',
  '2026_7_1_x.md', '2026.07.15.x.md', 'ADR-001-T1-x.md', '001-T2.md', '001-t3-x.md', 'ADR-0001', 'ADR-001', 'x.md',
  'ADR-٠٠١-x.md', '٢٠٢٦-٠٧-١٥-x.md', 'ADR-001-x.MD', '2026-07-15', 'adr-01.T1', 'ADR-0001_x.md', 'ADR-00001-x.md',
  'ADR-001-T٣-x.md', 'ADR-001-T1', '0047-x', 'ADR-12-T', 'ADR-12-T1x.md', 'ADR-12-T1.md', 'ADR-1.md', '2026-7-x.md',
  '2026-07-1x.md', 'İ.md', 'ADR-001-x.mD', 'adr-0047-x.md', 'ADR_0042.md', 'ADR-12-t5_x.md', '20260-01-01-x.md',
]
const titles = [
  null, '# ADR-014: X', '# ADR 14 X', '# adr_0014', '# ADR-12345 X', '# ADR-2026-07-15 x', '# Task ADR-001-T1: x',
  '# ADR-001-T1: x', '\ufeff# ADR-7', '#ADR-9', '# ADR-x', '# ADR-14\u2028', '#\u00a0ADR-15', '# Taſk ADR-001-T1: x',
  '# TasK ADR-001-T2: y', '# ADR-٣ x', '# ADR- 3', '# ADR-0003x', '# ADR-00003', '# ADR-1.5', '# ADR-001-T', '# ADR-a.b-T3',
  '#\tTask\tADR-9-T9', '# ADR-2026-7-1-x', '# Something else', '# ADR-16\r', '# ADR_ 17', '#   ADR-18',
]
const titleTexts = [
  '# ADR-001: X\n', '---\n# not: title\n---\n# Real', '```\n# ADR-9\n```\n# ADR-10', '\ufeff# Bom', '#nospace\n# Space',
  '#\u00a0Nbsp\n# Later', '#\u2028Ls', '  # indented', 'text\n\n# Second', '---\nopen\n# In open frontmatter', '', '#',
  '# \n', 'x\r# CR', '~~~\n# fenced\n~~~~\n# after', '#\ufeffFEFF',
]
const referenceTexts = [
  'See ADR-001 and adr-2, ADR-0003x, xADR-4, ADR-5_x, ADR-6.', 'docs/adr/2026-07-15-x.md', '(2026-07-12)', '2026-07-12',
  'file 2026-07-15-x.md.', 'a\\2026-01-01-y\\b', 'ADR-99999999999999999999999', `ADR-${'9'.repeat(400)}`, '😀 ADR-7 2026-07-15-z',
  'ADR-001ADR-002', '_ADR-3', 'ADR-٣', 'ADR-1, 2026-07-15-x, ADR-1', 'xx2026-07-15-x', '2026-7-1-x.md),', 'ſ ADR-8', 'ADR‐9',
  'ADR-0', 'ADR-000000', 'é2026-01-01-x ADR-10', '2026-01-01-x/ADR-11/2026-02-02-y', 'aDr-12', 'ADR-13é', 'ADR-14😀', '',
  '2026-01-01-x.md.md', '2026-01-01-x.MD', '2026-01-01-.md', '2026-01-01', 'path/2026-01-01', '٢٠٢٦-٠١-٠١-x', '2026-01-01-x;',
]

const supersessions = [
  'Superseded by ADR-004', 'superseded by ADR 4', 'Superseded by ADR_004', 'Superseded by ADR004', 'Superseded by 0004',
  'Superseded by ADR-2026-07-15', 'Superseded by 2026-07-15-new', 'Superseded by docs/adr/2026-07-15-new.md',
  'Superseded by (2026-07-12)', 'Superseded by ADR-004oops', 'Superseded by ADR-999 (see ADR-002)', 'Superseded by 999 (see ADR-002)',
  '_Superseded by ADR-004_', 'Superseded by _ADR-999_', 'Superseded by 2026_07_15_new', 'Superseded by banana', 'Superseded by',
  'Superseded  by\u00a0ADR-5', 'Superſeded by ADR-6', 'Superseded by é ADR-7 2026-01-01-x', 'Superseded by 😀😀 2026-01-01-x ADR-8',
  'Superseded by ADR-00000', 'Superseded by 000000', 'Superseded by 0', 'Superseded', 'Superseded by ADR-12345', 'Superseded by 12345',
  'Superseded by xADR-9 ADR-10', 'Superseded by 2026-07-15', 'Superseded by ADR_2026_01_02_x', 'Superseded by é_2026-01-01-x ADR-3',
  'Superseded by __ADR-21__', 'Superseded by ADR-٣', 'SUPERSEDED BY ADR-22', 'Superseded byADR-23', 'Superseded by ADR-24, ADR-25',
]
const frontmatterSupersessions = [
  'ADR-0009', '"[ADR-10]"', '[ADR-11]', '[a, b]', 'null', '~', '[]', '2026-07-15-x.md # c', "'ADR-12'", '', '"2026-07-16-y"',
  '[ "ADR-13" ]', 'ADR-14.md', 'docs/adr/ADR-15-x.md', '0016',
]

// The catalog rows of a frozen archive and what each says about the record linked from it.
const catalogHeader = ['# Archive', '', '**Lifecycle:** Frozen historical ADR records', '', '## Retired Records', '',
  '| ADR | Title | Decision effect | Retired |', '|-----|-------|-----------------|---------|']
const catalogCases = [
  ['withdrawn'], ['governing'], ['superseded by ADR-002'], ['superseded by banana'], ['Superseded By ADR-3'], ['**withdrawn**'],
  ['withdrawn', 'withdrawn'], [], ['ſuperseded by ADR-2'], ['superseded by ADR-2\u2028x'], [`superseded by x${'😀'.repeat(30)}`],
  [`superseded by é${'é'.repeat(70)}`], ['withdrawn\u00a0'], ['Withdrawn'], ['GOVERNING'], ['superseded by docs/adr/2026-01-01-x.md'],
  ['superseded by  ADR-4'], ['superseded by'], ['retired'], [`unknown ${'x'.repeat(80)}`],
]
const catalogRow = (link, effect, title = 'X') => `| [ADR-001](${link}) | ${title} | ${effect} | 2026-10-07 |`
const archiveRecord = '# ADR-001: Archived\n\n**Status:** Accepted\n**Governs:** `src/a.js`\n\n## Decision\n\nx\n'

// `tasks` is for the Go side, which is handed the task files a record owns; adrCorpus finds them itself. `platform` is passed
// to adrCorpus as the Go side is handed it (process.platform on every T1 row).
function corpusAnswer(root, file, tasks, tracked, platform) {
  const corpus = adrCorpus(root, { tracked, platform })
  const record = corpus.find(entry => entry.file === file)
  if (record) {
    return {
      in: 'record', number: record.number, id: record.id, title: record.title, status: record.status, kind: record.kind,
      frozen: record.frozen, supersededBy: record.supersededBy, governs: record.governs, enforcedBy: record.enforcedBy,
      unresolved: [...record.unresolved], declares: record.declares,
    }
  }
  const entry = corpus.unreadable.find(candidate => candidate.file === file)
  if (entry) {
    return {
      in: 'unreadable', status: entry.status, id: entry.id ?? null, reason: entry.reason ?? null, unproven: entry.unproven ?? null,
      governs: entry.governs ?? null, title: entry.title ?? null,
    }
  }
  return { in: null }
}

// One record (and its files) in a fresh scratch corpus, read by adrCorpus with exactly the listing given.
function corpusRow(scratch, files, subject, { tasks = [], tracked = null } = {}) {
  const root = layOut(scratch, files)
  if (!root) return null
  const listing = tracked ?? files.filter(file => !file.unlisted).map(file => file.path)
  const file = path.join(root, ...subject.split('/'))
  return run('corpusRecord', corpusAnswer, root, file, tasks.map(task => path.join(root, ...task.split('/'))), listing, process.platform)
}

function corpusRows(scratch) {
  const rows = []
  const add = row => { if (row) rows.push(row) }
  const record = 'docs/adr/ADR-001-x.md'
  for (const gov of governsVariants) add(corpusRow(scratch, [{ path: record, text: recordWith(gov) }], record, { tracked: [record, 'src/a.js', 'b/c.md'] }))
  // A listing that holds the record and nothing it declares: every declared path is unresolved.
  for (const gov of governsVariants.slice(0, 6)) add(corpusRow(scratch, [{ path: record, text: recordWith(gov) }], record, { tracked: [record] }))
  // The run under the header is read from the first place the header's text occurs, here inside the title.
  add(corpusRow(scratch, [{ path: record, text: '# ADR-001: Old Governs: a\n- type: path\n  pattern: early\n\n**Status:** Accepted\nGoverns: a\n\n## Decision\n\nx\n' }], record))
  const task = 'docs/adr/ADR-001-x/tasks/T1-a.md'
  for (const section of affectedSections) {
    add(corpusRow(scratch, [{ path: record, text: recordWith('') }, { path: task, text: `# Task ADR-001-T1: a\n\n${section}\n` }], record, { tasks: [task] }))
  }
  // The task read normalises a lone CR to LF, and keeps CRLF.
  const crTable = '## Affected Files\r\r| File | Change |\r|---|---|\r| `lone-cr.md` | add |\r| `r.md` | read |\r'
  add(corpusRow(scratch, [{ path: record, text: recordWith('') }, { path: task, text: crTable }], record, { tasks: [task] }))
  add(corpusRow(scratch, [{ path: record, text: recordWith('') }, { path: task, text: crTable.replaceAll('\r', '\r\n') }], record, { tasks: [task] }))
  add(corpusRow(scratch, [{ path: record, text: recordWith('**Governs:** `x.md`, `a.md`') }, { path: task, text: affectedSections[0] }], record, { tasks: [task] }))
  for (const text of statusTexts) add(corpusRow(scratch, [{ path: record, text: `# ADR-001: S\n\n${text}\n\n## Decision\n\nx\n**Governs:** \`g.md\`\n` }], record))
  for (const status of supersessions) {
    add(corpusRow(scratch, [{ path: record, text: recordWith('', status) }], record))
    add(corpusRow(scratch, [{ path: record, text: `# ADR-001: X\n\nStatus: ${status}\n\n## Decision\n\nx\n` }], record))
  }
  for (const value of frontmatterSupersessions) {
    for (const status of ['Deprecated', 'Superseded', 'Superseded by', 'Accepted', 'Superseded by banana']) {
      add(corpusRow(scratch, [{ path: record, text: `---\nsuperseded_by: ${value}\n---\n# ADR-001: X\n\n**Status:** ${status}\n\n## Decision\n\nx\n` }], record))
    }
  }
  for (const [name, title] of [['docs/adr/ADR-014-x.md', '# ADR-015: Mismatch'], ['docs/adr/2026-07-15-x.md', '# A dated record'],
    ['docs/adr/0042-x.md', '#\u00a0Spaced  '], ['docs/adr/spec-03-x.md', ''], ['docs/adr/ADR-016-x.md', '#\n\nNot a title'],
    ['docs/adr/ADR-017-x.md', '#  \u2028title'], ['docs/adr/ADR-018-x.md', '# ADR-2026-07-15: dated title'], ['docs/adr/notes.md', '# Notes']]) {
    add(corpusRow(scratch, [{ path: name, text: `${title}\n\n**Status:** Accepted\n\n## Context\n\nx\n` }], name))
  }
  // Not recognised: kept where records are with no Status (found by place), and named like a record (notRecognised).
  add(corpusRow(scratch, [{ path: 'docs/adr/plain.md', text: '# Plain\n\nno status\n' }], 'docs/adr/plain.md'))
  add(corpusRow(scratch, [{ path: 'docs/adr/0042-y.md', text: '# Just notes\n' }], 'docs/adr/0042-y.md'))
  // Archives: the catalog beside the record, one level up, unreadable, under another spelling, unlisted.
  const archived = 'docs/adr-archive/ADR-001-x.md'
  const readme = 'docs/adr-archive/README.md'
  for (const effects of catalogCases) {
    const catalog = [...catalogHeader, ...effects.map(effect => catalogRow('ADR-001-x.md', effect)), ''].join('\n')
    add(corpusRow(scratch, [{ path: archived, text: archiveRecord }, { path: readme, text: catalog }], archived))
  }
  for (const link of ['../adr/ADR-001-x.md', 'ADR-001-x.md#decision', ' ADR-001-x.md', '<https://x/ADR-001-x.md>', './ADR-001-x.md',
    'https://host/../../ADR-001-x.md', 'ADR-001-x.md?x', 'sub/../ADR-001-x.md', 'adr-001-x.md']) {
    const catalog = [...catalogHeader, catalogRow(link, 'withdrawn'), ''].join('\n')
    add(corpusRow(scratch, [{ path: archived, text: archiveRecord }, { path: readme, text: catalog }], archived))
  }
  const withdrawn = [...catalogHeader, catalogRow('ADR-001-x.md', 'withdrawn', 'a \\| b'), ''].join('\n')
  add(corpusRow(scratch, [{ path: archived, text: archiveRecord }, { path: readme, text: withdrawn }], archived))
  add(corpusRow(scratch, [{ path: archived, text: archiveRecord }, { path: readme, text: withdrawn.replaceAll('\n', '\r') }], archived))
  add(corpusRow(scratch, [{ path: archived, text: archiveRecord }, { path: readme, text: withdrawn.replaceAll('\n', '\r\n') }], archived))
  add(corpusRow(scratch, [{ path: archived, text: archiveRecord }, { path: readme, text: withdrawn }], archived, { tracked: [archived] }))
  add(corpusRow(scratch, [{ path: archived, text: archiveRecord }, { path: 'docs/adr-archive/readme.md', text: withdrawn }], archived))
  add(corpusRow(scratch, [{ path: archived, text: archiveRecord }, { path: 'docs/adr-archive/readme.md', text: '# Notes\n' }], archived))
  add(corpusRow(scratch, [{ path: archived, text: archiveRecord }, { path: readme, text: withdrawn }, { path: 'docs/adr-archive/Readme.md', text: '# x\n' }], archived, { tracked: [archived, readme, 'docs/adr-archive/Readme.md'] }))
  add(corpusRow(scratch, [{ path: archived, text: archiveRecord }, { path: readme, notRegular: true }], archived))
  add(corpusRow(scratch, [{ path: archived, text: archiveRecord }, { path: readme, text: '# Archive without the marker\n' }], archived))
  const nested = 'docs/adr-archive/ADR-001-x/ADR-001-x.md'
  add(corpusRow(scratch, [{ path: nested, text: archiveRecord }, { path: readme, text: [...catalogHeader, catalogRow('ADR-001-x/ADR-001-x.md', 'superseded by ADR-009'), ''].join('\n') }], nested))
  add(corpusRow(scratch, [{ path: nested, text: archiveRecord }, { path: readme, text: withdrawn }], nested))
  add(corpusRow(scratch, [{ path: 'archive/ADR-001-x.md', text: archiveRecord }, { path: 'README.md', text: withdrawn.replace('ADR-001-x.md', 'archive/ADR-001-x.md') }], 'archive/ADR-001-x.md'))
  return rows
}

// The name arms, through adrCorpus: a root-level file holding no record is named by notRecognised exactly when its name made
// it a candidate (ADR_FILE); a canonical or spec name is a record whatever it holds; any other name is in no list.
const armNames = [
  'ADR-1-x.md', 'adr_02.md', 'ADR02-x.md', 'adr-12345-x.md', '001-x.md', '0001.x.md', '12345-x.md', '01-x.md', '2026-07-15-x.md',
  '2026_7_1-x.md', '2026-07-x.md', '20261-x.md', 'ADR-٣-x.md', 'spec-1.md', 'ſpec-2.md', 'SPEC_3.md', 'spec-x.md', 'ADR-7x.md',
  'ADR-7_x.md', 'ADRx.md', '٠٠١-x.md', 'ADR-0001.MD', '0001-x.MD', 'aDr-1-x.md', 'ADR‐1-x.md', 'adr1-x.md', 'adr-1x.md',
  'ADR-0042.md', '2026-7-15-x.md', '2026.07.x.md', '1234_x.md', '123.md', '12.md', 'adr_1234-x.md', 'adr-_1-x.md', 'ADR--1-x.md',
  'ADR-1.x.md', 'spec_1.md', 'spec1.md', 'spe-1.md', 'SpEc-٣.md', 'ADR-𝟏-x.md', 'note.md',
]
function armRows(scratch) {
  const root = layOut(scratch, armNames.map(name => ({ path: name, text: 'x\n' })))
  const corpus = adrCorpus(root, { tracked: armNames })
  const counted = new Set([...corpus.map(entry => entry.file), ...corpus.unreadable.map(entry => entry.file)])
  const named = new Set(corpus.notRecognised)
  return armNames.map(name => {
    const file = path.join(root, name)
    return { fn: 'nameArm', args: [name], want: counted.has(file) ? 'record' : named.has(file) ? 'notRecognised' : 'none' }
  })
}

const directoryNames = [
  'adr', 'adrs', 'ADR', 'decision', 'decisions', 'adr-archive', 'adr_archived', 'adrs-archives', 'decisions-archive', 'archive-adr',
  'archives_records', 'archive', 'ADRſ', 'decisionſ', 'adr-archiveſ', 'archive-records', 'records', 'adr-archivedss', 'Decisions_Archives',
  'archive-decisionſ', 'ARCHIVES-ADRS', 'adr-', 'xadr', 'adr\u2028', 'adr-archives-x',
]
const eligiblePaths = [
  'docs/adr/ADR-1.md', 'docs/adr/README.md', 'docs/adr/readme.MD', 'docs/tasks/x.md', 'docs/tasKs/x.md', 'docs/taſks/x.md',
  'docs/Templates/x.md', 'docs/templateſ/x.md', 'fixtures/x.md', 'docs\\adr\\x.md', 'x.MD', 'x.mD', 'x.txt', '', '/', 'a//b.md',
  'node_modules/x.md', 'golden-K/x.md', 'İ.md', 'docs/TASKS/x.md', 'docs\\tasks\\x.md', '.md', 'READMЕ.md', 'docs/fixture/x.md',
  'golden-a\u2028b/x.md', 'x.md/', 'a/./b.md', 'tasks', 'templates/', 'Fixtures/x.md',
]

// Files whose bytes are not all UTF-8, and record-shaped texts for the content screen: both read the bytes the way Node's
// decoder does (one U+FFFD per maximal invalid subsequence).
const byteFiles = [
  Buffer.concat([Buffer.from('**Status:** Acc'), Buffer.from([0xe2, 0x82]), Buffer.from('epted\n\n## Decision\n')]),
  Buffer.concat([Buffer.from('Status: '), Buffer.from([0xf0, 0x9f, 0x98]), Buffer.from('x'), Buffer.from([0xc0, 0xaf, 0xed, 0xa0, 0x80, 0xf4, 0x90, 0x80, 0x80, 0xff]), Buffer.from('\n## Context\n')]),
  Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('Status: Bom\n## Decision\n**Status:** x\n')]),
  Buffer.concat([Buffer.from('**Status:** a\n##'), Buffer.from([0xc2, 0x85]), Buffer.from('Decision\n')]),
  Buffer.concat([Buffer.from('**Status:** a\n##'), Buffer.from([0x85]), Buffer.from('Decision\n')]),
  Buffer.concat([Buffer.from('**Status:** '), Buffer.from([0xe0, 0x80, 0x80, 0xe0, 0xa0]), Buffer.from('\n## Context')]),
]
const screenTexts = [
  '**Status:** x\n## Context\n', '**Status:** x\n', '## Decision\n', '```\n**Status:** x\n```\n## Decision\n', '---\n**Status:** x\n## Context\n---\n',
  '---\n```\n---\n**Status:** x\n## Context\n', '---\nopen\n```\n**Status:** x\n## Context\n', '## Decisions\n**Status:** x', '##\u00a0Decision\n**Status:** x',
  '##\u3000context\n**Status:** x', '## CONTEXT\n**Status:** x', '## Contexte\n**Status:** x', '## Context_x\n**Status:** x', '## Context-x\n**Status:** x',
  '##\ufeffContext\n**Status:** x', '##\u0085Context\n**Status:** x', '##\u001cContext\n**Status:** x', ' **Status:** x\n## Context', '**Status:**x\n## Context',
  '## Context\r**Status:** x', '## Decision\u2028**Status:** x', '##\u2028Decision\n**Status:** x', '**Status:** x\n##Context',
  '~~~\n## Context\n~~~\n**Status:** x', '## Contеxt\n**Status:** x', '##\t\tDecision é\n**Status:** x',
]

function fileRows(scratch) {
  const rows = []
  const files = [...byteFiles.map((bytes, index) => ({ path: `notes/b${index}.md`, bytes })),
    ...screenTexts.map((text, index) => ({ path: `notes/s${index}.md`, text })),
    ...statusTexts.map((text, index) => ({ path: `docs/adr/${String(index + 100).padStart(4, '0')}-s.md`, text }))]
  const root = layOut(scratch, files)
  for (const file of files) {
    const at = path.join(root, ...file.path.split('/'))
    rows.push(run('screenAdmits', screenAdmits, at))
    rows.push(run('recognisedAsRecord', recognition, root, at, process.platform))
  }
  return rows
}

function rowsFor(scratch) {
  const fixtures = fixtureRows(scratch)
  const rows = [...fixtures]
  rows.fixture = rows.length
  rows.unbuilt = fixtures.unbuilt ?? []
  for (const candidate of candidates) {
    for (const declaration of declarations) rows.push(run('pathMatchesDeclaration', pathMatchesDeclaration, candidate, declaration))
  }
  const pairs = foldSweep()
  rows.push({ fn: 'globFoldSweep', args: [pairs], want: sweep(pairs) })
  for (const status of statusWords) rows.push(run('recordStatusKind', recordStatusKind, status))
  for (const text of statusTexts) {
    rows.push(run('recordStatus', recordStatus, text))
    rows.push(run('recordStatusKind', recordStatusKind, recordStatus(text)))
  }
  for (const text of [...enforcedTexts, ...governsVariants]) rows.push(run('declaredEnforcement', declaredEnforcement, text))
  for (const lines of gfmLineSets) rows.push(run('gfmTableRows', gfmTableRows, lines))
  for (const section of affectedSections) rows.push(run('gfmTableRows', gfmTableRows, section.split('\n')))
  for (const name of recordNames) {
    for (const title of titles) rows.push(run('recordId', recordId, name, title))
  }
  for (const text of [...titleTexts, ...statusTexts]) rows.push(run('titleLine', titleLine, text))
  for (const text of [...referenceTexts, ...supersessions]) rows.push(run('referencesIn', referencesIn, text))
  for (const name of directoryNames) rows.push({ fn: 'recordDirectory', args: [name], want: RECORD_DIRECTORY.test(name) })
  for (const name of [...armNames, ...recordNames]) rows.push(run('nameArmSpelling', nameArmSpelling, `docs/adr/${name}`))
  for (const relative of eligiblePaths) rows.push(run('corpusEligible', corpusEligible, relative))
  rows.push(...armRows(scratch), ...fileRows(scratch), ...corpusRows(scratch))
  return rows
}

test('the core answers every record-rule row as the Node reader does', { skip: noGo }, t => {
  const scratch = mkdtempSync(path.join(os.tmpdir(), 'qh-dcparity-'))
  t.after(() => remove(scratch))
  const rows = rowsFor(scratch)
  // Five rows from every approved row this host could lay out; one whose link it cannot make is named (a Windows host without
  // symlink privilege, an outside run of b2172a83), and only that one.
  if (rows.unbuilt.length) t.diagnostic(`not built here, a link this host cannot make: ${rows.unbuilt.join(', ')}`)
  assert.ok(rows.unbuilt.every(id => TABLE.rows.find(row => row.id === id)?.files.some(file => file.link)), `rows not built without a link: ${rows.unbuilt}`)
  assert.ok(rows.fixture >= (TABLE.rows.length - rows.unbuilt.length) * 5, `only ${rows.fixture} rows came from record-recognition.json`)
  assert.ok(rows.length > 3000, `only ${rows.length} rows were built, so the comparison would prove little`)
  // Every class of answer is present, or a row class the Go side gets wrong could be one nobody wrote.
  for (const fn of ['recognisedAsRecord', 'recordId', 'titleLine', 'recordStatus', 'corpusEligible', 'pathMatchesDeclaration',
    'recordStatusKind', 'declaredEnforcement', 'gfmTableRows', 'referencesIn', 'recordDirectory', 'nameArmSpelling', 'nameArm',
    'screenAdmits', 'corpusRecord']) {
    const answers = new Set(rows.filter(r => r.fn === fn).map(r => JSON.stringify(r.want)))
    assert.ok(answers.size > 1, `${fn} has one answer over every row, so its rows distinguish nothing`)
  }
  for (const where of ['record', 'unreadable', null]) {
    assert.ok(rows.some(r => r.fn === 'corpusRecord' && r.want.in === where), `no corpus row lands in ${where}`)
  }
  const corpus = path.join(scratch, 'corpus.json')
  writeFileSync(corpus, JSON.stringify({ rows }))
  const ran = spawnSync('go', ['test', '-count=1', '-v', '-run', '^TestDecisionCorpusParity$', './hooks/'], {
    cwd: coreDir, encoding: 'utf8', timeout: 600_000, windowsHide: true, env: { ...process.env, QH_DECISION_CORPUS_ROWS: corpus },
  })
  const said = `${ran.stdout}\n${ran.stderr}`
  assert.equal(ran.status, 0, `the Go record rules disagree with the Node ones (or did not run):\n${said.split('\n').slice(-80).join('\n')}`)
  // A Go test that skipped, or matched nothing, exits 0 too: the count it compared is what says it ran, over every row.
  assert.match(said, new RegExp(`${rows.length} rows compared, 0 disagreements`))
})

// ADR-137 T4: the platform as a parameter. Node takes it in listedPath, hasDecisionCorpus and adrCorpus (which hands it to
// listedPath only); its separatorsOf(process.platform) at decision-corpus.mjs:1372, directoriesOf's default at :1383,
// recognisedAsRecord's default at :1577 and relativeWithinRoot's case fold at :1836 read the running platform, so on this
// machine they answer as this platform does whatever is passed, on both sides. Realpath case is the filesystem's, not a
// parameter: the case-variant spelling row is answered by this machine's disk on both sides, never faked.
const PLATFORMS = ['win32', 'darwin', 'linux']
const listedNames = [
  'docs/adr/ADR-001-x.md', 'docs\\adr\\ADR-001-x.md', 'docs\\adr/ADR-001-x.md', 'adr\\x.md', 'specs\\', '\\docs\\adr', 'x\\y\\z',
  'docs\\\\adr', 'x.md', '',
]
const corpusListings = [
  ['docs\\adr\\ADR-001-x.md'], ['docs/adr/ADR-001-x.md'], ['src\\docs\\adr\\x.md'], ['README.md', 'adr\\x.md'], ['docs\\decisions'],
  ['specs\\a\\b.md'], ['docs\\adrs\\x.md'], ['docs\\specs'], [],
]

function platformCorpusRows(scratch) {
  const rows = []
  const add = (files, subject, ...listings) => {
    const root = layOut(scratch, files)
    if (!root) return
    const file = path.join(root, ...subject.split('/'))
    for (const tracked of listings) {
      for (const platform of PLATFORMS) rows.push(run('corpusRecord', corpusAnswer, root, file, [], tracked, platform))
    }
  }
  const governing = recordWith('**Governs:** `src/a.js`')
  const record = [{ path: 'docs/adr/ADR-001-x.md', text: governing }, { path: 'src/a.js', text: 'x\n' }]
  // A record and the file it governs, listed with backslashes, with mixed separators, and with `/`.
  add(record, 'docs/adr/ADR-001-x.md', ['docs\\adr\\ADR-001-x.md', 'src\\a.js'], ['docs\\adr/ADR-001-x.md', 'src/a.js'],
    ['docs/adr/ADR-001-x.md', 'src/a.js'])
  // A record directory that exists only once a backslash separates, and a screen-only record behind one.
  add([{ path: 'notes/decisions/x.md', text: governing }], 'notes/decisions/x.md', ['notes\\decisions\\x.md'], ['notes/decisions/x.md'])
  add([{ path: 'notes/zz.md', text: governing }], 'notes/zz.md', ['notes\\zz.md'], ['notes/zz.md'])
  // A root-level file whose one NAME holds backslashes: it can be made only where a backslash is not a separator.
  if (!onWindows) add([{ path: 'docs\\adr\\ADR-002-y.md', text: governing }], 'docs\\adr\\ADR-002-y.md', ['docs\\adr\\ADR-002-y.md'])
  // Case-variant archive READMEs: exactly `README.md`, one other spelling (marked), and two spellings at once, each listed
  // with `/` and with backslashes.
  for (const [readme, spellings] of [['README.md', ['README.md']], ['readme.md', ['readme.md']], ['Readme.md', ['Readme.md', 'README.md']]]) {
    const files = [{ path: 'docs/adr-archive/ADR-001-x.md', text: archiveRecord }, { path: 'src/a.js', text: 'x\n' },
      { path: `docs/adr-archive/${readme}`, text: [...catalogHeader, catalogRow('ADR-001-x.md', 'withdrawn'), ''].join('\n') }]
    const listed = ['docs/adr-archive/ADR-001-x.md', ...spellings.map(name => `docs/adr-archive/${name}`), 'src/a.js']
    add(files, 'docs/adr-archive/ADR-001-x.md', listed, listed.map(rel => rel.replaceAll('/', '\\')))
  }
  // A record directory reached through a link (its real path is asked), listed with `/` and with backslashes.
  add([{ path: 'decisions/x.md', text: governing }, { path: 'notes/link', link: path.join('..', 'decisions') }], 'notes/link/x.md',
    ['notes/link/x.md'], ['notes\\link\\x.md'])
  // A listed spelling whose case differs from the disk's: one file where the filesystem folds case, none where it does not.
  add(record, 'Docs/ADR/ADR-001-x.md', ['Docs/ADR/ADR-001-x.md'], ['Docs\\ADR\\ADR-001-x.md'])
  // A note that is no record, so some row on every platform lands nowhere: the rows built to land there off Windows (a name
  // holding backslashes, a listed case the disk lacks) land in a record on a Windows disk (the Windows job, run 41464830272).
  add([{ path: 'notes/plain.md', text: 'just a note\n' }], 'notes/plain.md', ['notes/plain.md'], ['notes\\plain.md'])
  return rows
}

test('the core answers every per-platform record row as Node does', { skip: noGo }, t => {
  const scratch = mkdtempSync(path.join(os.tmpdir(), 'qh-dcplatform-'))
  t.after(() => remove(scratch))
  const rows = []
  for (const name of listedNames) for (const platform of PLATFORMS) rows.push(run('listedPath', listedPath, name, platform))
  for (const listing of corpusListings) {
    for (const platform of PLATFORMS) rows.push(run('hasDecisionCorpus', hasDecisionCorpus, scratch, listing, platform))
  }
  rows.push(...platformCorpusRows(scratch))
  // The platform decides some answers, or these rows test nothing about it. On a Windows disk no corpusRecord row answered
  // differently by the parameter (the Windows job, run 41455681278): the one row built to, a name holding backslashes, cannot
  // be made there, so that guard holds off Windows only. Every row is still compared with the core below.
  for (const fn of ['listedPath', 'hasDecisionCorpus', ...(onWindows ? [] : ['corpusRecord'])]) {
    const byRow = new Map()
    for (const row of rows.filter(r => r.fn === fn)) {
      const key = JSON.stringify(row.args.filter(arg => !PLATFORMS.includes(arg)))
      byRow.set(key, new Set([...(byRow.get(key) ?? []), JSON.stringify(row.want)]))
    }
    assert.ok([...byRow.values()].some(answers => answers.size > 1), `no ${fn} row answers differently on win32 and elsewhere`)
  }
  for (const where of ['record', 'unreadable', null]) {
    assert.ok(rows.some(r => r.fn === 'corpusRecord' && r.want.in === where), `no per-platform corpus row lands in ${where}`)
  }
  const corpus = path.join(scratch, 'platform.json')
  writeFileSync(corpus, JSON.stringify({ rows }))
  const ran = spawnSync('go', ['test', '-count=1', '-v', '-run', '^TestDecisionCorpusParity$', './hooks/'], {
    cwd: coreDir, encoding: 'utf8', timeout: 600_000, windowsHide: true, env: { ...process.env, QH_DECISION_CORPUS_ROWS: corpus },
  })
  const said = `${ran.stdout}\n${ran.stderr}`
  assert.equal(ran.status, 0, `the core's per-platform answers disagree with Node's (or did not run):\n${said.split('\n').slice(-80).join('\n')}`)
  assert.match(said, new RegExp(`${rows.length} rows compared, 0 disagreements`))
})
