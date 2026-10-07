// ADR-092 T7 (Decision 10): every gate that walks a directory names one it could not list, in its own
// could-not-look vocabulary, and never gives its clean answer over a tree it did not see; the `*.md`
// walks read `.md` in any case; and adr-debt reads only regular files. The injected failure runs on
// every platform through tests/helpers/unlistable.py (record.walk's `list_dir` seam); the `chmod 000`
// twin proves the same on a real directory where the platform lets it.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { chmodSync, cpSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { runPython } from '../scripts/python-interpreter.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const bin = join(repoRoot, 'plugin', 'bin')
const unlistable = join(repoRoot, 'tests', 'helpers', 'unlistable.py')
const okFixture = join(repoRoot, 'tests', 'fixtures', 'ok')
const onWindows = process.platform === 'win32'
// Patterns live at module scope, never inside a test body (adr-execute lessons, 2026-09-16).
// Every gate says it in these words, and no older line does (adr-lint's "could not be listed from" one).
const APPEARS_NOWHERE = /appears nowhere in the repo/
const NOT_FOUND = /bound test not found/
const UNLISTED = /could not be listed, so/
const ONE_OF_ONE = /0\/1 recorded claims no longer hold/

const temps = []
test.after(() => { for (const dir of temps) rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }) })

function scratch(files = {}) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'qh-walk-unlisted-')))
  temps.push(dir)
  for (const [path, text] of Object.entries(files)) {
    const at = join(dir, ...path.split('/'))
    mkdirSync(dirname(at), { recursive: true })
    if (text === null) mkdirSync(at)
    else writeFileSync(at, text)
  }
  return dir
}
const digest = fence => createHash('sha256').update(fence, 'utf8').digest('hex')
const task = id => `# Task ADR-001-${id}: do\n\n**Depends-on:** none\n**Consumes:** none\n**Produces:** none\n\n`
  + `## Acceptance\n\n\`\`\`bash\ntrue\n\`\`\`\n\n## Tests\n\n| Test name | File | Verifies | Covers |\n|---|---|---|---|\n`
  + `| \`it_works\` | \`t.test.mjs\` | it works | — |\n\n## Verification Log\n`
  + `- 2026-08-26 · no-git · exit 0 · \`true\` · acceptance-sha256:${digest('true')}\n`
const RECORD = '# ADR-001: X\n\n**Status:** Accepted\n\n## Context\n\nx\n\n## Decision\n\nx\n\n## Out of Scope\n\n- a later thing (deferred: the backlog, item 1)\n'

// Each gate, a tree its walk covers, the arguments it is run with, and the directory made to fail.
const GATES = {
  'adr-debt': () => ({ dir: scratch({ 'docs/adr/ADR-001-x.md': RECORD, 'docs/adr/sub': null }), args: ['docs/adr'], fail: 'docs/adr/sub' }),
  'adr-verify': () => ({ dir: scratch({ 'docs/adr/ADR-001-x.md': RECORD, 'docs/adr/ADR-001-x/tasks/T1-a.md': task('T1'), 'docs/adr/sub': null }),
    args: ['--sweep', 'docs/adr'], fail: 'docs/adr/sub' }),
  'arch-lint': () => {
    const dir = scratch()
    cpSync(okFixture, dir, { recursive: true })
    // A repository marker, so the walk is this tree and not its parent, and one check whose symbol is
    // defined only under the directory made to fail.
    writeFileSync(join(dir, 'package.json'), '{}\n')
    mkdirSync(join(dir, 'sub'))
    writeFileSync(join(dir, 'sub', 'check.py'), 'def defined_in_sub_check():\n    return True\n')
    writeFileSync(join(dir, 'architecture.md'), readFileSync(join(dir, 'architecture.md'), 'utf8')
      .replace('None — fixture has no import graph.', '| Rule | Check |\n|------|-------|\n| the boundary holds | `defined_in_sub_check` |'))
    // The verdict that would be about the part it did not see: never given over it.
    return { dir, args: ['architecture.md'], fail: 'sub', unseen: APPEARS_NOWHERE }
  },
  'spec-verify': () => {
    const dir = scratch({ 'Cargo.toml': '[package]\nname = "x"\nversion = "0.1.0"\n',
      'src/lib.rs': '#[test]\nfn test_gates_run() {}\n\n#[test]\nfn test_gates_reject_malformed() {}\n' })
    const spec = readFileSync(join(okFixture, 'spec-selftest.md'), 'utf8').replaceAll('test_selftest_fixture.py::', '')
    writeFileSync(join(dir, 'spec.md'), spec)
    return { dir, args: ['--spec', '--repo', dir, 'spec.md'], fail: 'src', unseen: NOT_FOUND }
  },
  'adr-lint': () => {
    // A `.git` git cannot read: the repository root is found and git cannot list it, so adr-lint
    // finds the file a Tests row names by walking for its basename.
    const dir = scratch({ '.git': '', 'docs/adr/ADR-001-x.md': RECORD, 'docs/adr/ADR-001-x/tasks/T1-a.md': task('T1'),
      'docs/adr/ADR-001-x/tasks/README.md': '# Tasks\n\n| Task | File | Status |\n|---|---|---|\n| T1 | [T1-a](T1-a.md) | done |\n',
      'sub/t.test.mjs': "test('it_works', () => {})\n" })
    return { dir, args: ['docs/adr/ADR-001-x.md'], fail: 'sub' }
  },
}
const run = (cwd, args) => runPython(args, { cwd, encoding: 'utf8', timeout: 120_000 })
const said = r => `${r.stdout}\n${r.stderr}`

function namesTheDirectory(t, failing) {
  for (const [gate, make] of Object.entries(GATES)) {
    const { dir, args, fail, unseen } = make()
    const clean = run(dir, [join(bin, gate), ...args])
    assert.doesNotMatch(said(clean), UNLISTED, `${gate} clean: ${said(clean)}`)
    const broken = failing(dir, gate, args, fail)
    if (broken === null) { t.skip(`${gate}: a chmod 000 directory still lists here`); return }
    assert.match(said(broken), UNLISTED, `${gate}: ${said(broken)}`)
    assert.ok(said(broken).includes(fail), `${gate} names ${fail}: ${said(broken)}`)
    assert.ok(broken.status !== clean.status || gate === 'adr-lint', `${gate} gave its clean exit ${clean.status} over a tree it did not see`)
    if (unseen) assert.doesNotMatch(said(broken), unseen, `${gate} gave a verdict about a directory it did not see`)
  }
}

test('every walk caller names a directory whose listing failed', t => {
  namesTheDirectory(t, (dir, gate, args, fail) => run(dir, [unlistable, join(bin, gate), fail, ...args]))
})

test('every walk caller names a chmod 000 directory', t => {
  if (onWindows) { t.skip('chmod 000 does not stop a listing on Windows'); return }
  if (process.getuid?.() === 0) { t.skip('root lists a chmod 000 directory anyway'); return }
  namesTheDirectory(t, (dir, gate, args, fail) => {
    const locked = join(dir, ...fail.split('/'))
    chmodSync(locked, 0o000)
    try { return run(dir, [join(bin, gate), ...args]) } finally { chmodSync(locked, 0o755) }
  })
})

test('adr-debt and adr-verify read a .MD file', () => {
  for (const name of ['ADR-001-x.MD', 'ADR-001-x.md']) {
    const dir = scratch({ [`docs/adr/${name}`]: RECORD, [`docs/adr/ADR-001-x/tasks/T1-a.${name.slice(-2)}`]: task('T1') })
    const debt = run(dir, [join(bin, 'adr-debt'), 'docs/adr'])
    assert.ok(said(debt).includes(name), `adr-debt ${name}: ${said(debt)}`)
    const sweep = run(dir, [join(bin, 'adr-verify'), '--sweep', 'docs/adr'])
    assert.match(said(sweep), ONE_OF_ONE, `adr-verify ${name}: ${said(sweep)}`)
  }
})

test('adr-debt never reads a path that is not a regular file', () => {
  const dir = scratch({ 'docs/adr/ADR-001-x.md': null })
  const r = run(dir, [join(bin, 'adr-debt'), 'docs/adr'])
  assert.equal(r.status, 2, said(r))
  assert.ok(said(r).includes('ADR-001-x.md'), said(r))
})

test('adr-debt never opens a FIFO', t => {
  const dir = scratch({ 'docs/adr/keep.md': '# A note\n' })
  const fifo = join(dir, 'docs', 'adr', 'ADR-001-x.md')
  const made = spawnSync('mkfifo', [fifo], { timeout: 10_000, windowsHide: true }).status === 0
    && (() => { try { return lstatSync(fifo).isFIFO() } catch { return false } })()
  if (!made) { t.skip('a FIFO cannot be made here'); return }
  // A 20s bound: a reader that opens the FIFO waits forever, and the kill is the red.
  const r = runPython([join(bin, 'adr-debt'), 'docs/adr'], { cwd: dir, encoding: 'utf8', timeout: 20_000 })
  assert.notEqual(r.signal, 'SIGTERM', 'adr-debt opened the FIFO')
  assert.equal(r.status, 2, said(r))
  assert.ok(said(r).includes('ADR-001-x.md'), said(r))
})
