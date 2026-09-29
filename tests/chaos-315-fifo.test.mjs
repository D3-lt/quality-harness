// BACKLOG §319's addendum, after php-react-app E5: adr-lint refused a FIFO named as a record or a
// task, and its other reads of a corpus path git does not list were left as a class. A Spec:
// line, a tasks README, a Tests-row file and the config each name a path the disk answers for,
// and a FIFO at any of them was a wait until the process was killed. So was the lock snapshot
// record.py takes of a Tests-row file for adr-lint. Each test puts a directory beside the FIFO,
// whose answer must stay the one its site already gave, and a regular file that is read.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const RECORD = join('docs', 'adr', 'ADR-001-the-cart-is-a-pure-reducer.md')
const TASKS = join('docs', 'adr', 'ADR-001-the-cart-is-a-pure-reducer', 'tasks')
const temps = []
test.after(() => { for (const dir of temps) rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }) })
// The js-vitest-spa corpus, whose T1 is done with evidence and names `src/cart.test.ts`, copied
// into a scratch repository this file made, so every git it runs runs there (CLAUDE.md §9).
const corpus = () => {
  const dir = mkdtempSync(join(tmpdir(), 'qh-chaos-315-fifo-'))
  temps.push(dir)
  cpSync(join(repoRoot, 'tests', 'fixtures', 'corpora', 'js-vitest-spa'), dir, { recursive: true })
  spawnSync('git', ['init', '-q'], { cwd: dir, timeout: 30_000, windowsHide: true })
  return dir
}
// 60s: a Windows runner's first Python spawn can take 30 (tests/adr-next.test.mjs:29). A FIFO
// run passes 20s: what it tests is a wait, and a wait is killed rather than waited for.
const lint = (repo, timeout = 60_000) => spawnSync('python3', [join(repoRoot, 'plugin', 'bin', 'adr-lint'), join(repo, RECORD)], { cwd: repo, encoding: 'utf8', timeout, windowsHide: true })
const said = run => `${run.stdout}\n${run.stderr}`
const verdict = run => /^\[(PASS|FAIL)\] /m.test(run.stdout)
// MSYS mkfifo exits 0 on Windows and leaves nothing native Python can open (CI, fe918bb).
const mkfifo = target => {
  const made = spawnSync('mkfifo', [target], { timeout: 10_000, windowsHide: true })
  try { return !made.error && made.status === 0 && statSync(target).isFIFO() } catch { return false }
}
// The refusal refuse_irregular already gives a FIFO record: could-not-run, exit 2, the path named.
const refused = (run, name) => {
  assert.equal(run.signal, null, `adr-lint waited on a FIFO until it was killed: ${name}`)
  assert.equal(run.status, 2, said(run))
  assert.ok(run.stderr.includes(`${name} — not a regular file`), said(run))
}
// A directory keeps its site's answer, which is never this file's refusal.
const notRefused = run => assert.ok(!said(run).includes('not a regular file'), said(run))

test('adr-lint refuses a Spec: line naming a FIFO, directly or through a link, and a directory there keeps its answer', t => {
  const spec = repo => {
    const record = join(repo, RECORD)
    const text = readFileSync(record, 'utf8')
    const edited = text.replace('**Owner:** web team\n', '**Owner:** web team\n**Spec:** docs/specs/cart.md\n')
    assert.notEqual(edited, text, 'the fixture line this test extends is still there')
    writeFileSync(record, edited)
    mkdirSync(join(repo, 'docs', 'specs'), { recursive: true })
    return join(repo, 'docs', 'specs', 'cart.md')
  }
  const plain = corpus()
  writeFileSync(spec(plain), '# Cart\n\n| F-1 | a cart | @spec |\n')
  const read = lint(plain)
  assert.ok(verdict(read), said(read))
  assert.ok(read.stdout.includes('no task Covers these @spec/@implemented IDs: F-1'), 'the regular spec is read')
  // A directory was could-not-run, exit 2, in the words the open gave. It stays that.
  const folder = corpus()
  mkdirSync(spec(folder))
  const asDir = lint(folder)
  assert.equal(asDir.status, 2, said(asDir))
  notRefused(asDir)
  const repo = corpus()
  if (!mkfifo(spec(repo))) { t.skip('no FIFO can be made here'); return }
  refused(lint(repo, 20_000), 'cart.md')
  // The directory exemption follows a link to its target, so a link to a FIFO is still refused.
  const linked = corpus()
  const target = join(linked, 'pipe')
  assert.ok(mkfifo(target), 'a second FIFO could be made where the first was')
  symlinkSync(target, spec(linked))
  refused(lint(linked, 20_000), 'cart.md')
})

test('adr-lint refuses a tasks README that is a FIFO, and a directory there keeps its answer', t => {
  const readme = repo => { const path = join(repo, TASKS, 'README.md'); rmSync(path); return path }
  const read = lint(corpus())
  assert.ok(verdict(read), said(read))
  const folder = corpus()
  mkdirSync(readme(folder))
  const asDir = lint(folder)
  assert.equal(asDir.status, 2, said(asDir))
  notRefused(asDir)
  const repo = corpus()
  if (!mkfifo(readme(repo))) { t.skip('no FIFO can be made here'); return }
  refused(lint(repo, 20_000), 'README.md')
})

test('adr-lint refuses a Tests-row file that is a FIFO, and a directory there keeps its DIRECTORY finding', t => {
  const file = repo => { const path = join(repo, 'src', 'cart.test.ts'); rmSync(path); return path }
  const read = lint(corpus())
  assert.ok(verdict(read), said(read))
  assert.ok(!read.stdout.includes('src/cart.test.ts` for `adds_an_item`'), 'the regular file holds the test the row names')
  const folder = corpus()
  mkdirSync(file(folder))
  const asDir = lint(folder)
  assert.equal(asDir.status, 1, said(asDir))
  assert.ok(asDir.stdout.includes('but that is a DIRECTORY'), said(asDir))
  notRefused(asDir)
  const repo = corpus()
  if (!mkfifo(file(repo))) { t.skip('no FIFO can be made here'); return }
  refused(lint(repo, 20_000), 'cart.test.ts')
})

// The config's own contract, above CONFIG_NAME in adr-lint: absent or unreadable, nothing
// changes. So a FIFO there is advised on like a directory, never opened, and the lint goes on
// to the verdict it gives with no config at all, rather than refusing a run it can finish.
// The record carries a blocking CONTENT finding, the kind strictFrom demotes, and it must stay
// blocking: the fixture's other blocking finding is evidence, which no demotion touches, so the
// exit status alone cannot show a config that loosened the verdict.
test('adr-lint advises on a .quality-harness.json that is a FIFO, as on a directory, and still reaches its verdict', t => {
  const plain = corpus()
  writeFileSync(join(plain, '.quality-harness.json'), '{"strictFrom": "ADR-0002"}\n')
  const read = lint(plain)
  assert.ok(verdict(read), said(read))
  assert.ok(read.stdout.includes('ADR-0001 predates strictFrom ADR-0002'), 'the regular config is read')
  const blocking = () => {
    const repo = corpus()
    const record = join(repo, RECORD)
    const text = readFileSync(record, 'utf8')
    const edited = text.replace('# ADR-001:', '# ADR-002:')
    assert.notEqual(edited, text, 'the fixture title this test edits is still there')
    writeFileSync(record, edited)
    return repo
  }
  const stillBlocks = run => assert.match(run.stdout, /^ {2}ADR-001-the-cart-is-a-pure-reducer\.md: filename names ADR-1 and the title names ADR-2; one record cannot be both$/m, said(run))
  const bare = lint(blocking())
  assert.equal(bare.status, 1, said(bare))
  stillBlocks(bare)
  assert.ok(!bare.stdout.includes('strictFrom is not in effect'), 'no config, no advice')
  const folder = blocking()
  mkdirSync(join(folder, '.quality-harness.json'))
  const asDir = lint(folder)
  assert.ok(verdict(asDir), said(asDir))
  assert.equal(asDir.status, bare.status, said(asDir))
  stillBlocks(asDir)
  assert.ok(asDir.stdout.includes('strictFrom is not in effect'), said(asDir))
  notRefused(asDir)
  const repo = blocking()
  if (!mkfifo(join(repo, '.quality-harness.json'))) { t.skip('no FIFO can be made here'); return }
  const fifo = lint(repo, 20_000)
  assert.equal(fifo.signal, null, 'adr-lint waited on a FIFO until it was killed: .quality-harness.json')
  assert.ok(!fifo.stderr.includes('could not run'), said(fifo))
  assert.ok(verdict(fifo), said(fifo))
  assert.equal(fifo.status, bare.status, said(fifo))
  stillBlocks(fifo)
  assert.ok(fifo.stdout.includes('.quality-harness.json could not be read (not a regular file); strictFrom is not in effect and every record is checked in full'), said(fifo))
})

// record.py's lock snapshot runs for a done task with a first-red lock, in check_test_lock,
// BEFORE the Tests-row checks adr-lint refuses a FIFO in. So a FIFO there waited in record.py.
const RECORD_PY = join(repoRoot, 'plugin', 'lib', 'record.py')
const probe = (script, args, timeout = 60_000) => spawnSync('python3', ['-c', [
  'import importlib.util, json, sys',
  'spec = importlib.util.spec_from_file_location("record_probe", sys.argv[1])',
  'record = importlib.util.module_from_spec(spec)',
  'spec.loader.exec_module(record)',
  script,
].join('\n'), RECORD_PY, ...args], { encoding: 'utf8', timeout, windowsHide: true })
const snapshot = (repo, timeout) => {
  const run = probe('snap = record.snapshot_lock(sys.argv[2], [("adds_an_item", "src/cart.test.ts")])\n'
    + 'print(json.dumps({"bodies": [n for _r, n in snap["bodies"]], "unproven": [n for _r, n in snap["unproven"]]}))', [repo], timeout)
  assert.equal(run.signal, null, 'record.py waited on a FIFO until it was killed')
  assert.equal(run.status, 0, said(run))
  return JSON.parse(run.stdout)
}

test('record.py\'s lock snapshot answers UNPROVEN for a Tests-row FIFO, and adr-lint then refuses it', t => {
  const cart = repo => join(repo, 'src', 'cart.test.ts')
  // The unit: a regular file is hashed, and a directory is UNPROVEN, as it was before.
  const plain = corpus()
  assert.deepEqual(snapshot(plain), { bodies: ['adds_an_item'], unproven: [] })
  const folder = corpus()
  rmSync(cart(folder))
  mkdirSync(cart(folder))
  assert.deepEqual(snapshot(folder), { bodies: [], unproven: ['adds_an_item'] })
  // The boundary: a done task whose first red carries the lock record.py itself mints.
  const locked = () => {
    const repo = corpus()
    const task = join(repo, TASKS, 'T1-add-and-remove-items.md')
    const text = readFileSync(task, 'utf8')
    const minted = probe('print(record.first_red_lock_suffix(open(sys.argv[2], encoding="utf-8").read(), sys.argv[3]))', [task, repo])
    assert.equal(minted.status, 0, said(minted))
    const suffix = minted.stdout.trim()
    assert.match(suffix, /^· test-lock-sha256:[0-9a-f]{64} · test-lock-b64:[\w-]+$/)
    writeFileSync(task, `${text}${text.endsWith('\n') ? '' : '\n'}- 2026-09-20 · no-git · exit 1 · \`grep -q 'adds_an_item' src/cart.test.ts\` · ms:3 ${suffix}\n`)
    return repo
  }
  const read = lint(locked())
  assert.ok(verdict(read), said(read))
  assert.ok(!read.stdout.includes('has no first-red test-lock-sha256'), 'the minted lock is read as one')
  assert.ok(!read.stdout.includes('adds_an_item vanished'), said(read))
  // The dirty twin of that clean line: the snapshot ran, so a missing file is a vanished test.
  const gone = locked()
  rmSync(cart(gone))
  assert.ok(lint(gone).stdout.includes('locked test `src/cart.test.ts`::adds_an_item vanished'), 'the snapshot reads the Tests-row file')
  const repo = locked()
  rmSync(cart(repo))
  if (!mkfifo(cart(repo))) { t.skip('no FIFO can be made here'); return }
  // adr-lint first: its lock check reaches record.py before the Tests-row refusal can.
  refused(lint(repo, 20_000), 'cart.test.ts')
  assert.deepEqual(snapshot(repo, 20_000), { bodies: [], unproven: ['adds_an_item'] })
})

// A review of this fix: adr-verify keeps its own copy of strict_from_number, which `--sweep`
// reads, and it read a FIFO .quality-harness.json until killed. It answers what adr-lint does:
// not read, strictFrom not in effect, and a note that says so.
test('adr-verify\'s strictFrom reader does not wait on a FIFO config, and still reads a regular one', t => {
  const verifyConfig = repo => spawnSync('python3', ['-c', [
    'import importlib.machinery, importlib.util, json, sys',
    'loader = importlib.machinery.SourceFileLoader("verify_probe", sys.argv[1])',
    'spec = importlib.util.spec_from_loader("verify_probe", loader)',
    'verify = importlib.util.module_from_spec(spec)',
    'loader.exec_module(verify)',
    'print(json.dumps(verify.strict_from_number(verify.Path(sys.argv[2]))))',
  ].join('\n'), join(repoRoot, 'plugin', 'bin', 'adr-verify'), repo], { encoding: 'utf8', timeout: 20_000, windowsHide: true })
  const regular = corpus()
  writeFileSync(join(regular, '.quality-harness.json'), JSON.stringify({ strictFrom: 'ADR-0012' }))
  const read = verifyConfig(regular)
  assert.equal(read.status, 0, said(read))
  assert.deepEqual(JSON.parse(read.stdout), [12, null], 'the control: a regular config is read')
  const fifo = corpus()
  if (!mkfifo(join(fifo, '.quality-harness.json'))) { t.skip('no FIFO can be made here'); return }
  const waited = verifyConfig(fifo)
  assert.equal(waited.signal, null, 'adr-verify waited on a FIFO config until it was killed')
  assert.equal(waited.status, 0, said(waited))
  const [cutoff, note] = JSON.parse(waited.stdout)
  assert.equal(cutoff, null)
  assert.match(note, /not a regular file/, note)
})
