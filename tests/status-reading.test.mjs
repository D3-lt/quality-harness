// ADR-074 T1: one record Status gets one reading from every reader that reads one. The readers
// disagreed at ebfaee0 — lifecycle removed every `*`, `_` and backtick while adr-lint and adr-next
// trimmed the edges, JS's ASCII `\b` let `Acceptedé` govern where Python's did not, adr-lint read
// only `**Status:**`, and adr-retire-check accepted only an exact `accepted` (BACKLOG §313, §321).
// Each row is written into one scratch corpus under every label form and read by every reader,
// through the boundary each one is used at; the expected reading is written down per row, never
// computed by a copy of the rule under test.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { adrCorpus } from '../plugin/scripts/lifecycle.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const bin = join(repoRoot, 'plugin', 'bin')
// 60s: a Windows runner's first Python spawn can take 30 (tests/adr-next.test.mjs:29).
const run = (command, args, cwd) => spawnSync(command, args, { cwd, encoding: 'utf8', timeout: 60_000, windowsHide: true })

// U+1C89 is a letter from Unicode 16.0. CI's Python 3.12 is Unicode 15.0 and Node 24 is 16.0
// (ADR-074 Risks), so whether `Accepted` followed by it is one run of letters or the word
// Accepted depends on the runtime. The row is read by each runtime's own answer, and when the
// two runtimes disagree the test says so rather than calling it parity.
const TJE = String.fromCodePoint(0x1c89)
const nodeLetter = /\p{L}/u.test(TJE)
const pythonLetter = (() => {
  const asked = run('python3', ['-c', 'import sys; print(chr(0x1c89).isalpha())'], repoRoot)
  assert.equal(asked.status, 0, `python3 could not run: ${asked.stderr}`)
  return asked.stdout.trim() === 'True'
})()
const tjeKind = letter => (letter ? 'undecided' : 'governing')

// The rows of ADR-074 T1 S1, and what each one is: governing, pending, graveyard or undecided.
const ROWS = [
  { value: 'Accepted', kind: 'governing' },
  { value: '**Accepted**', kind: 'governing' },
  { value: '_Accepted_', kind: 'governing' },
  { value: 'Acc**epted', kind: 'governing' },
  { value: 'Accepted (Zy, 2026-09-01)', kind: 'governing' },
  { value: 'Acceptedé', kind: 'undecided' },
  { value: 'Wıthdrawn', kind: 'undecided' },
  { value: `Accepted${TJE}`, kind: { node: tjeKind(nodeLetter), python: tjeKind(pythonLetter) } },
  { value: 'Proposed', kind: 'pending' },
  { value: '_Superseded by ADR-004_', kind: 'graveyard', supersededBy: 'ADR-004' },
  { value: 'Implemented', kind: 'undecided' },
  { value: '', kind: 'undecided' },
]
const LABELS = ['**Status:**', 'Status:', '**Status**:']
const expected = (row, runtime) => (typeof row.kind === 'string' ? row.kind : row.kind[runtime])

// One record per row and label, each owning one task its README marks done, so adr-lint's
// execution check has a claim to hold the Status against.
const corpus = () => {
  const repo = mkdtempSync(join(tmpdir(), 'qh-status-reading-'))
  spawnSync('git', ['init', '-q'], { cwd: repo, timeout: 30_000, windowsHide: true })
  const cases = []
  for (const row of ROWS) {
    for (const label of LABELS) {
      const number = String(cases.length + 1).padStart(3, '0')
      const stem = `ADR-${number}-status`
      const dir = join(repo, 'docs', 'adr')
      const tasks = join(dir, stem, 'tasks')
      mkdirSync(tasks, { recursive: true })
      const line = row.value ? `${label} ${row.value}` : label
      writeFileSync(join(dir, `${stem}.md`), `# ADR-${number}: status\n\n${line}\n\n## Context\n\nx\n\n## Decision\n\nx\n`)
      writeFileSync(join(tasks, 'README.md'), `# ADR-${number} Tasks\n\n| Task | File | Status |\n|------|------|--------|\n| T1 | [T1-t.md](T1-t.md) | done |\n`)
      writeFileSync(join(tasks, 'T1-t.md'), `# Task ADR-${number}-T1: do\n\n**Depends-on:** none\n**Consumes:** none\n**Produces:** none\n\n## Acceptance\n\n\`\`\`bash\nprintf T1\n\`\`\`\n\n## Verification Log\n`)
      cases.push({ row, label, id: `ADR-${number}`, record: join(dir, `${stem}.md`), tasks })
    }
  }
  return { repo, cases }
}

// What each reader can say, reduced to the part of the reading it acts on.
// lifecycle's adrCorpus reads a record as governing or graveyard, and leaves any other out.
const lifecycleSays = kind => (kind === 'governing' || kind === 'graveyard' ? kind : 'none')
// adr-next and adr-retire-check ask one question: is this record Accepted.
const acceptedSays = kind => kind === 'governing'
// adr-lint refuses a done task under a pending record, and advises on one it cannot read.
const lintSays = kind => (kind === 'pending' ? 'refused' : kind === 'undecided' ? 'advised' : 'quiet')

test('every reader gives one Status the same reading', t => {
  const { repo, cases } = corpus()
  try {
    if (nodeLetter !== pythonLetter) t.diagnostic(`U+1C89 is a letter to Node ${process.versions.unicode} and ${pythonLetter ? 'a letter' : 'not a letter'} to python3: the Accepted+U+1C89 row reads differently by runtime, as ADR-074 Risks names`)
    const disagreements = []
    const differ = (c, reader, got, want) => {
      if (got !== want) disagreements.push(`${reader} on \`${c.label} ${c.row.value}\` (${c.id}): ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`)
    }

    const records = adrCorpus(repo)
    for (const c of cases) {
      const entry = records.find(record => record.file === c.record)
      differ(c, 'lifecycle adrCorpus', entry ? entry.kind : 'none', lifecycleSays(expected(c.row, 'node')))
      if (entry && c.row.supersededBy) differ(c, 'lifecycle supersededBy', entry.supersededBy, c.row.supersededBy)
    }

    const state = run('node', [join(repoRoot, 'plugin', 'scripts', 'adr-state.mjs'), '--json', repo], repo)
    assert.equal(state.status, 0, `adr-state could not run: ${state.stderr}`)
    const reading = JSON.parse(state.stdout)
    for (const c of cases) {
      const file = c.record.slice(repo.length + 1).split('\\').join('/')
      const unread = reading.unread.find(entry => entry.file.split('\\').join('/') === file)
      const governing = reading.governingNothing.some(entry => entry.id === c.id)
      const got = governing ? 'governing' : !unread ? 'graveyard'
        : /Proposed or Draft/.test(unread.why) ? 'pending' : 'undecided'
      differ(c, 'adr-state --json', got, expected(c.row, 'node'))
    }

    for (const c of cases) {
      const next = run('python3', [join(bin, 'adr-next'), c.tasks, '--json'], repo)
      assert.ok(next.status === 0 || next.status === 3, `adr-next could not run: ${next.stdout}\n${next.stderr}`)
      differ(c, 'adr-next --json', JSON.parse(next.stdout).undecided === false, acceptedSays(expected(c.row, 'python')))
    }

    for (const c of cases) {
      const lint = run('python3', [join(bin, 'adr-lint'), c.record], repo)
      assert.ok(lint.status === 0 || lint.status === 1, `adr-lint could not run: ${lint.stdout}\n${lint.stderr}`)
      const out = lint.stdout
      const refused = /but T1 is marked done — execution requires Accepted/.test(out)
      const advised = /starts with no status adr-lint recognises|no \*\*Status:\*\* line|line is empty/.test(out)
      differ(c, 'adr-lint', refused ? 'refused' : advised ? 'advised' : 'quiet', lintSays(expected(c.row, 'python')))
    }

    const retire = run('python3', ['-c', [
      'import importlib.machinery, importlib.util, json, pathlib, sys',
      "loader = importlib.machinery.SourceFileLoader('adr_retire_check', sys.argv[1])",
      "module = importlib.util.module_from_spec(importlib.util.spec_from_loader('adr_retire_check', loader))",
      'loader.exec_module(module)',
      'print(json.dumps([module.is_accepted_status(module.status_of(pathlib.Path(p))) for p in sys.argv[2:]]))',
    ].join('\n'), join(bin, 'adr-retire-check'), ...cases.map(c => c.record)], repo)
    assert.equal(retire.status, 0, `adr-retire-check could not be loaded: ${retire.stderr}`)
    JSON.parse(retire.stdout).forEach((accepted, i) => differ(cases[i], 'adr-retire-check', accepted, acceptedSays(expected(cases[i].row, 'python'))))

    assert.deepEqual(disagreements, [])
  } finally {
    rmSync(repo, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })
  }
})
