// The Codex round owed by v3.1.6 (gpt-6-astra, xhigh, 2026-09-30) found where ADR-074's readers
// still disagree, or all agree on the wrong answer. Each row is one record, read through every
// reader's own boundary; the expected reading is written down per row, never computed.
//
// 1. adr-lint defined a task-cell `status_word` over the shared one it imported (record.py), so its
//    execution check read a record's Status with the task parser: `Rejectedé` was refused and
//    `Rejected-reconsidered` was not.
// 2. The label needed a character after the colon, so a bare `Status:` was no label and a
//    `## Status` section, or a later label, governed instead: the first label is the Status.
// 3. JS's `.` stops at U+2028 and U+2029 and Python's does not, so a fence opener carrying one was
//    no opener in lifecycle and its fenced example governed there.
// 4. The Status heading's trailing whitespace was each language's `\s`: `## Status\x85` was a
//    heading only in Python, `## Status﻿` only in JS.
// 5. `re.I` folds `ı` and `ſ` into ASCII and JS's `/i` does not, so adr-lint linted a record under
//    `decıſıons/` that no corpus reader listed.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { adrCorpus } from '../plugin/scripts/decision-corpus.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const bin = join(repoRoot, 'plugin', 'bin')
// 60s: a Windows runner's first Python spawn can take 30 (tests/adr-next.test.mjs:29).
const run = (command, args, cwd) => spawnSync(command, args, { cwd, encoding: 'utf8', timeout: 60_000, windowsHide: true })
const U = code => String.fromCharCode(code)

// `status` is the text between the title and `## Context`; `kind` is the reading every reader
// should reach (governing, graveyard, pending or undecided), reduced per reader below exactly as
// tests/status-reading.test.mjs reduces it; `refused` is whether adr-lint's execution check refuses
// a task marked done under it (a pending or a Rejected record).
const ROWS = [
  { name: '1: Rejected, then a hyphen', status: '**Status:** Rejected-reconsidered', kind: 'graveyard', refused: true },
  { name: '1: Rejected, then a letter', status: '**Status:** Rejectedé', kind: 'undecided', refused: false },
  { name: '1: control, Rejected', status: '**Status:** Rejected', kind: 'graveyard', refused: true },
  { name: '2: a bare label before an Accepted section', status: 'Status:\n\n## Status\n\nAccepted', kind: 'undecided', refused: false },
  { name: '2: a bare label before an Accepted label', status: 'Status:\nStatus: Accepted', kind: 'undecided', refused: false },
  { name: '2: control, a label with a space and nothing after', status: 'Status: \n\n## Status\n\nAccepted', kind: 'undecided', refused: false },
  { name: '3: a ~~~ opener carrying U+2028', status: `~~~md${U(0x2028)}example\nStatus: Accepted\n~~~\nStatus: Proposed`, kind: 'pending', refused: true },
  { name: '3: a backtick opener carrying U+2029', status: `\`\`\`md${U(0x2029)}example\nStatus: Accepted\n\`\`\`\nStatus: Superseded by ADR-002`, kind: 'graveyard', refused: false },
  { name: '4: a second Status heading ending U+0085', status: `## Status\nAccepted\n## Status${U(0x85)}\nSuperseded by ADR-002`, kind: 'graveyard', refused: false },
  { name: '4: a Status heading ending U+FEFF', status: `## Status${U(0xFEFF)}\nAccepted`, kind: 'undecided', refused: false },
]
// lifecycle's adrCorpus lists a governing or graveyard record and leaves any other out; adr-next
// and adr-retire-check ask only whether the record is Accepted.
const lifecycleSays = kind => (kind === 'governing' || kind === 'graveyard' ? kind : 'none')


test('the Codex round of 3.1.6: every reader reads these records alike, and as written here', () => {
  const repo = mkdtempSync(join(tmpdir(), 'qh-status-codex-'))
  try {
    spawnSync('git', ['init', '-q'], { cwd: repo, timeout: 30_000, windowsHide: true })
    writeFileSync(join(repo, 'docs-placeholder'), '')
    const cases = ROWS.map((row, i) => {
      const number = String(i + 1).padStart(3, '0')
      const dir = join(repo, 'docs', 'adr')
      const tasks = join(dir, `ADR-${number}-x`, 'tasks')
      mkdirSync(tasks, { recursive: true })
      const record = join(dir, `ADR-${number}-x.md`)
      writeFileSync(record, `# ADR-${number}: x\n\n${row.status}\n\n## Context\n\nx\n\n## Decision\n\nx\n`)
      writeFileSync(join(tasks, 'README.md'), `# ADR-${number} Tasks\n\n| Task | File | Status |\n|------|------|--------|\n| T1 | [T1-t.md](T1-t.md) | done |\n`)
      writeFileSync(join(tasks, 'T1-t.md'), `# Task ADR-${number}-T1: do\n\n**Depends-on:** none\n**Consumes:** none\n**Produces:** none\n\n## Acceptance\n\n\`\`\`bash\nprintf T1\n\`\`\`\n\n## Verification Log\n`)
      return { row, record, tasks }
    })
    const wrong = []
    const records = adrCorpus(repo)
    for (const c of cases) {
      const kind = records.find(record => record.file === c.record)?.kind ?? 'none'
      if (kind !== lifecycleSays(c.row.kind)) wrong.push(`lifecycle on ${c.row.name}: ${kind}`)
      const next = run('python3', [join(bin, 'adr-next'), c.tasks, '--json'], repo)
      assert.ok(next.status === 0 || next.status === 3, `adr-next could not run: ${next.stdout}\n${next.stderr}`)
      const accepted = JSON.parse(next.stdout).undecided === false
      if (accepted !== (c.row.kind === 'governing')) wrong.push(`adr-next on ${c.row.name}: accepted ${accepted}`)
      const lint = run('python3', [join(bin, 'adr-lint'), c.record], repo)
      assert.ok(lint.status === 0 || lint.status === 1, `adr-lint could not run: ${lint.stdout}\n${lint.stderr}`)
      const refused = /execution requires Accepted/.test(lint.stdout)
      if (refused !== c.row.refused) wrong.push(`adr-lint on ${c.row.name}: refused ${refused}`)
    }
    const retire = run('python3', ['-c', [
      'import importlib.machinery, importlib.util, json, pathlib, sys',
      "loader = importlib.machinery.SourceFileLoader('adr_retire_check', sys.argv[1])",
      "module = importlib.util.module_from_spec(importlib.util.spec_from_loader('adr_retire_check', loader))",
      'loader.exec_module(module)',
      'print(json.dumps([module.is_accepted_status(module.status_of(pathlib.Path(p))) for p in sys.argv[2:]]))',
    ].join('\n'), join(bin, 'adr-retire-check'), ...cases.map(c => c.record)], repo)
    assert.equal(retire.status, 0, `adr-retire-check could not be loaded: ${retire.stderr}`)
    JSON.parse(retire.stdout).forEach((accepted, i) => {
      if (accepted !== (cases[i].row.kind === 'governing')) wrong.push(`adr-retire-check on ${cases[i].row.name}: accepted ${accepted}`)
    })
    assert.deepEqual(wrong, [])
  } finally {
    rmSync(repo, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })
  }
})

test('the Codex round of 3.1.6: a directory is a record directory by ASCII letters only', () => {
  const repo = mkdtempSync(join(tmpdir(), 'qh-status-codex-dir-'))
  try {
    spawnSync('git', ['init', '-q'], { cwd: repo, timeout: 30_000, windowsHide: true })
    const body = '# A note\n\nStatus: Accepted\n\n## Context\n\nx\n'
    // U+0131 and U+017F: Python's re.I folds them to `i` and `s`, JS's /i does not.
    const folded = join(repo, 'docs', `dec${U(0x131)}${U(0x17F)}${U(0x131)}ons`, 'note.md')
    const plain = join(repo, 'docs', 'Decisions', 'note.md')
    for (const file of [folded, plain]) {
      mkdirSync(dirname(file), { recursive: true })
      writeFileSync(file, body)
    }
    const listed = adrCorpus(repo).map(record => record.file)
    const lintFolded = run('python3', [join(bin, 'adr-lint'), folded], repo)
    const lintPlain = run('python3', [join(bin, 'adr-lint'), plain], repo)
    assert.ok(!listed.includes(folded), 'lifecycle listed a record under a folded directory name')
    assert.match(lintFolded.stdout, /nothing here was checked/, `adr-lint linted a record under a folded directory name:\n${lintFolded.stdout}`)
    // The control: an ordinary mixed-case directory is a record directory to both.
    assert.ok(listed.includes(plain), `lifecycle did not list a record under Decisions/: ${listed}`)
    assert.doesNotMatch(lintPlain.stdout, /nothing here was checked/, lintPlain.stdout)
    // The same fold in the content test (record.py's `_RECORD_SECTION` and lifecycle's
    // `readsAsRecord`): a `## Decıſıon` heading made a record for Python only.
    const heading = join(repo, 'docs', 'adr', 'folded-heading.md')
    mkdirSync(dirname(heading), { recursive: true })
    writeFileSync(heading, `# A note\n\nStatus: Accepted\n\n## Dec${U(0x131)}${U(0x17F)}${U(0x131)}on\n\nx\n`)
    const lintHeading = run('python3', [join(bin, 'adr-lint'), heading], repo)
    assert.ok(!adrCorpus(repo).map(record => record.file).includes(heading), 'lifecycle listed a record by a folded heading')
    assert.match(lintHeading.stdout, /nothing here was checked/, `adr-lint linted a record by a folded heading:\n${lintHeading.stdout}`)
  } finally {
    rmSync(repo, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })
  }
})
