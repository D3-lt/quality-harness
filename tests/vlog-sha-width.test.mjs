// ADR-088 T1: every reader of a Verification Log row's sha takes one width, and in a SHA-1
// repository a sha wider than git can print there is not evidence. Each scratch repository is
// built under this file's own temporary directory (CLAUDE.md §9); every path is assembled here.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test, { after } from 'node:test'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const fixture = path.join(repoRoot, 'tests', 'fixtures', 'corpora', 'go-module')
const adrLint = path.join(repoRoot, 'plugin', 'bin', 'adr-lint')
const adrNext = path.join(repoRoot, 'plugin', 'bin', 'adr-next')
const adrVerify = path.join(repoRoot, 'plugin', 'bin', 'adr-verify')
const testTmp = realpathSync.native(mkdtempSync(path.join(os.tmpdir(), 'qh-sha-width-')))
after(() => { try { rmSync(testTmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }) } catch { /* the assertions already ran */ } })

// The interpreter by absolute path, so a gate can be run with PATH emptied (git absent).
const python = spawnSync('python3', ['-c', 'import sys; print(sys.executable)'],
  { encoding: 'utf8', timeout: 30_000, windowsHide: true }).stdout.trim()
const GIT_IDENTITY = {
  GIT_AUTHOR_NAME: 'qh', GIT_AUTHOR_EMAIL: 'qh@example.invalid',
  GIT_COMMITTER_NAME: 'qh', GIT_COMMITTER_EMAIL: 'qh@example.invalid',
}
const RECORD = path.join('docs', 'adr', 'ADR-001-cart-totals-are-integer-cents.md')
const TASKS = path.join('docs', 'adr', 'ADR-001-cart-totals-are-integer-cents', 'tasks')
const T1 = path.join(TASKS, 'T1-add-items.md')

function git(dir, ...args) {
  const run = spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8', timeout: 30_000, windowsHide: true, env: { ...process.env, ...GIT_IDENTITY } })
  assert.equal(run.status, 0, `git ${args.join(' ')}: ${run.stderr}`)
  return run.stdout.trim()
}

// The go-module corpus in a new repository of `format`, with T1's only row carrying `sha`. The
// directory is not named for the format: the gate prints its path, and a finding naming `sha1`
// must not be matched in a directory name.
//
// With no `sha`, T1 is prepared for a real adr-verify run instead. A green row written today falls
// under the test-lock rule, which refuses done to a log with no red row (a different question from
// the sha's width), so a red row dated before that rule's cutoff is placed ahead of the fixture's
// green one. With the green removed, the log holds only that red, and the task is not done.
function corpus(format, sha) {
  const dir = mkdtempSync(path.join(testTmp, format === 'sha1' ? 'one-' : 'two-'))
  cpSync(fixture, dir, { recursive: true })
  git(dir, 'init', '-q', `--object-format=${format}`)
  const file = path.join(dir, T1)
  const text = readFileSync(file, 'utf8')
  assert.match(text, /\n- 2026-08-20 · no-git · exit 0 · /)
  if (sha !== undefined) {
    writeFileSync(file, text.replace(' · no-git · exit 0 · ', ` · ${sha} · exit 0 · `))
  } else {
    const green = text.match(/\n- 2026-08-20 · no-git · exit 0 · [^\n]*/)[0]
    writeFileSync(file, text.replace(green, green.replace('2026-08-20', '2026-08-19').replace('exit 0', 'exit 1') + green))
  }
  return dir
}

function lint(dir, env = process.env) {
  const run = spawnSync(python, [adrLint, path.join(dir, RECORD)], { cwd: dir, encoding: 'utf8', timeout: 120_000, windowsHide: true, env })
  return { status: run.status, out: `${run.stdout}${run.stderr}` }
}

function done(dir) {
  const run = spawnSync(python, [adrNext, '--all', '--json', path.join(dir, TASKS)], { cwd: dir, encoding: 'utf8', timeout: 120_000, windowsHide: true })
  assert.ok(run.status === 0 || run.status === 3, `adr-next exit ${run.status}: ${run.stderr}`)
  return (JSON.parse(run.stdout).done ?? []).map(task => task.id).includes('T1')
}

const hex = n => 'abcdef0123456789'.repeat(5).slice(0, n)

test('every row reader takes the sha width git can print', () => {
  for (const [format, sha] of [['sha1', hex(4)], ['sha1', hex(7)], ['sha1', hex(40)], ['sha256', hex(41)], ['sha256', hex(64)]]) {
    const dir = corpus(format, sha)
    const linted = lint(dir)
    assert.equal(linted.status, 0, `${format} ${sha.length}: ${linted.out}`)
    assert.equal(done(dir), true, `adr-next did not count a ${sha.length}-character sha in a ${format} repository`)
  }
  // What a real adr-verify writes, at the narrowest and the widest abbreviation git allows.
  for (const abbrev of ['4', '40']) {
    const dir = corpus('sha1')
    const file = path.join(dir, T1)
    writeFileSync(file, readFileSync(file, 'utf8').replace(/\n- 2026-08-20 · no-git · [^\n]*/, ''))
    git(dir, 'config', 'core.abbrev', abbrev)
    git(dir, 'add', '-A')
    git(dir, 'commit', '-q', '-m', 'base', '--no-gpg-sign')
    assert.equal(done(dir), false, 'the control: with no row the task is not done')
    const verified = spawnSync(python, [adrVerify, file], { cwd: dir, encoding: 'utf8', timeout: 120_000, windowsHide: true })
    assert.equal(verified.status, 0, verified.stdout + verified.stderr)
    const row = readFileSync(file, 'utf8').split('\n').find(line => / · exit 0 · /.test(line))
    const sha = row.split(' · ')[1].replace(/\*$/, '')
    assert.equal(sha.length, Number(abbrev), `adr-verify wrote ${row}`)
    assert.equal(done(dir), true, `adr-next did not count the row adr-verify wrote: ${row}`)
    assert.doesNotMatch(lint(dir).out, /Verification Log entry/, 'adr-lint read the row adr-verify wrote')
  }
  // DIRTY twin: the same 41-character row in a SHA-1 repository.
  const narrow = corpus('sha1', hex(41))
  assert.notEqual(lint(narrow).status, 0)
  assert.equal(done(narrow), false)
})

test('a sha wider than the object format is not evidence', () => {
  for (const width of [41, 64]) {
    const dir = corpus('sha1', hex(width))
    const linted = lint(dir)
    assert.equal(linted.status, 1, linted.out)
    assert.match(linted.out, new RegExp(`\\b${width}\\b[^\\n]*sha1|sha1[^\\n]*\\b${width}\\b`), linted.out)
    assert.equal(done(dir), false, `adr-next counted a ${width}-character sha in a sha1 repository`)
    // CLEAN twin: git absent, so the format is could-not-look, which reports nothing.
    const blind = lint(dir, { ...process.env, PATH: '' })
    assert.equal(blind.status, 0, blind.out)
    assert.doesNotMatch(blind.out, /sha1/)
  }
  // A 65-character sha is off-grammar whatever git says.
  const over = corpus('sha1', hex(65))
  assert.equal(lint(over).status, 1)
  assert.equal(lint(over, { ...process.env, PATH: '' }).status, 1)
})

// A Codex review of the ADR-088 diff: the sweep's claim reader (`claims_in`) is a row reader too, and
// it counted a 41-character sha in a SHA-1 repository as a claim that held, while adr-next did not
// count the same row as evidence.
test('the sweep counts a claim only when its sha fits the repository', () => {
  const sweep = dir => {
    const run = spawnSync(python, [adrVerify, '--sweep', path.join(dir, 'docs', 'adr'), '--json'], { cwd: dir, encoding: 'utf8', timeout: 120_000, windowsHide: true })
    // Exit 1 is the sweep's own answer when nothing could be checked: no claim, no rate.
    const claims = JSON.parse(run.stdout).claims
    assert.equal(run.status, claims > 0 ? 0 : 1, run.stdout + run.stderr)
    return claims
  }
  assert.equal(sweep(corpus('sha1', hex(41))), 0, 'a sha git cannot print here is not a claim')
  // The twins: the widest sha a SHA-1 repository prints, and the same 41 characters in SHA-256.
  assert.equal(sweep(corpus('sha1', hex(40))), 1)
  assert.equal(sweep(corpus('sha256', hex(41))), 1)
})

// A second Codex review of the ADR-088 diff: the test lock's row reader (`_recorded_lock`) is a row
// reader too. A replacement-lock snapshot row with a 41-character sha in a SHA-1 repository, which
// adr-lint blocks, released a lock a moved test had withheld, and adr-next counted the task done.
test('a lock snapshot whose sha does not fit does not release a moved lock', () => {
  const dir = corpus('sha1', hex(7))
  const file = path.join(dir, T1)
  // Today's rows only, so the lock is enforced rather than advisory; and a JavaScript test as the
  // locked one, whose body the lock hashes.
  writeFileSync(file, readFileSync(file, 'utf8').replace(/\n- 2026-08-\d\d · [^\n]*/g, '')
    .replace('| `TestAdd` | `internal/cart/cart_test.go` |', '| `adds` | `add.test.mjs` |'))
  const locked = path.join(dir, 'add.test.mjs')
  writeFileSync(locked, "import test from 'node:test'\ntest('adds', () => {\n  if (1 + 1 !== 2) throw new Error('no')\n})\n")
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'base', '--no-gpg-sign')
  const verify = (...args) => spawnSync(python, [adrVerify, file, ...args], { cwd: dir, encoding: 'utf8', timeout: 120_000, windowsHide: true })
  // The red run: the file the fence greps is moved aside, then put back.
  const grepped = path.join(dir, 'internal', 'cart', 'cart_test.go')
  renameSync(grepped, `${grepped}.aside`)
  assert.notEqual(verify().status, 0, 'the red run')
  renameSync(`${grepped}.aside`, grepped)
  assert.equal(verify().status, 0)
  assert.equal(done(dir), true, 'the control: red then green is done')
  writeFileSync(locked, readFileSync(locked, 'utf8').replace('1 + 1', '2 + 0'))
  assert.equal(done(dir), false, 'a moved locked test withholds done')
  const relocked = verify('--relock', '--replace-hashes')
  assert.equal(relocked.status, 0, relocked.stdout + relocked.stderr)
  assert.equal(done(dir), true, 'the twin: a snapshot git could have written releases it')
  const text = readFileSync(file, 'utf8')
  const snapshot = text.split('\n').find(line => line.includes('`adr-verify --relock --replace-hashes`'))
  writeFileSync(file, text.replace(snapshot, snapshot.replace(snapshot.split(' · ')[1], hex(41))))
  assert.equal(done(dir), false, 'a snapshot whose sha git cannot print here released the lock')
})
