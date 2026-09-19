// This repository's own records pass this repository's own gate
// (docs/audits/2026-09-18-adr-060.md, A2).
//
// `scripts/selftest.sh` runs every test here and had never run `adr-lint` over
// `docs/adr/`. `tests/foreign-corpus.test.mjs` lints a FIXTURE; the one test that
// reads the real corpus, `tests/corpus-report.test.mjs`, counts and never lints,
// and says of itself that its bounds "permit any overcount". So a green gate never
// meant the records were consistent — and a branch broke six Accepted records
// while its own task fence, which ends in `bash scripts/selftest.sh`, recorded
// exit 0 over the same tree.
//
// This is the test that would have gone red the moment that happened.
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const adrLint = join(repoRoot, 'plugin', 'bin', 'adr-lint')
const retireCheck = join(repoRoot, 'plugin', 'bin', 'adr-retire-check')
const LINT_TIMEOUT_MS = 120_000

// Through the interpreter: Windows cannot exec a `#!` script (CLAUDE.md §7).
function lint(file) {
  return new Promise(done => {
    const child = spawn('python3', [adrLint, file], {
      cwd: repoRoot, stdio: ['ignore', 'pipe', 'pipe'], timeout: LINT_TIMEOUT_MS, killSignal: 'SIGKILL',
    })
    let said = ''
    child.stdout.on('data', chunk => { said += chunk })
    child.stderr.on('data', chunk => { said += chunk })
    child.on('error', error => done({ file, status: null, said: String(error) }))
    child.on('close', (status, signal) => done({ file, status, signal, said }))
  })
}

async function pooled(items, width, work) {
  const results = []
  let next = 0
  await Promise.all(Array.from({ length: width }, async () => {
    while (next < items.length) results.push(await work(items[next++]))
  }))
  return results
}

test('every record this repository tracks passes its own adr-lint', async () => {
  // What is IN the repository, never what is on this disk (CLAUDE.md §8).
  const listed = spawnSync('git', ['-C', repoRoot, 'ls-files', '--', 'docs/adr/ADR-*.md'],
    { encoding: 'utf8', timeout: 30_000 })
  assert.equal(listed.status, 0, listed.stderr)
  // A pathspec `*` crosses `/`, so the listing also holds every task file.
  const records = listed.stdout.split('\n').filter(name => /^docs\/adr\/ADR-[^/]+\.md$/.test(name))
  assert.ok(records.length >= 50, `the sweep must find the corpus it is about, found ${records.length}`)

  // Shown able to say DIRTY before its clean is believed: with a consistent
  // corpus the assertion below is `[] === []`, and a lint that could not start
  // would produce exactly that too (ADR-003).
  const scratch = mkdtempSync(join(tmpdir(), 'qh-corpus-lint-'))
  try {
    const broken = join(scratch, 'ADR-900-a-record-with-no-sections.md')
    writeFileSync(broken, '# ADR-900: a record with no sections\n')
    const control = await lint(broken)
    assert.equal(control.status, 1, `the control record must FAIL, or a pass below proves nothing: ${control.said.slice(0, 400)}`)
    assert.match(control.said, /\[FAIL\]/)
  } finally { rmSync(scratch, { recursive: true, force: true }) }

  const runs = await pooled(records, 8, record => lint(join(repoRoot, record)))
  assert.equal(runs.length, records.length, 'every listed record was linted')
  // A lint that did not FINISH is not a lint that passed (ADR-005).
  const unfinished = runs.filter(run => run.status === null).map(run => `${run.file}: ${run.signal ?? run.said.slice(0, 200)}`)
  assert.deepEqual(unfinished, [], 'adr-lint could not run to completion, which is could-not-look and not a clean corpus')
  const failing = runs.filter(run => run.status !== 0).map(run => {
    const blocking = run.said.split('\n').filter(line => line.startsWith('  ') && !line.includes('advice:'))
    return `${run.file.slice(repoRoot.length + 1)} (exit ${run.status})\n      ${blocking.slice(0, 3).join('\n      ')}`
  })
  assert.deepEqual(failing, [], `records this repository tracks fail its own gate:\n  ${failing.join('\n  ')}`)
})

test('the archive, where there is one, passes adr-retire-check', () => {
  const listed = spawnSync('git', ['-C', repoRoot, 'ls-files', '--', 'docs/adr-archive/README.md'],
    { encoding: 'utf8', timeout: 30_000 })
  assert.equal(listed.status, 0, listed.stderr)
  if (!listed.stdout.trim()) return // no archive is a corpus that has retired nothing
  const run = spawnSync('python3', [retireCheck, join(repoRoot, 'docs', 'adr-archive', 'README.md')],
    { cwd: repoRoot, encoding: 'utf8', timeout: LINT_TIMEOUT_MS })
  assert.equal(run.status, 0, `${run.stdout}${run.stderr}`)
  assert.match(run.stdout, /\[PASS\]/)
})
