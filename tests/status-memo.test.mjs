// ADR-095 T5: a hook process reads the working tree's status once and reuses it for a bounded time. Git's answer about the tree
// can change under a running process, so the reuse is short (two seconds), per repository, only for an answer git gave, and
// only where the entry point switched it on: a test run, another process or a later event asks again. Counted through
// scripts/hook-cost.mjs (T1) on the real hook program and on fixture programs that call the same functions.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const tool = path.join(repoRoot, 'scripts', 'hook-cost.mjs')
const treeFacts = pathToFileURL(path.join(repoRoot, 'tests', 'helpers', 'node-hooks', 'tree-facts.mjs')).href
const scratch = realpathSync.native(mkdtempSync(path.join(os.tmpdir(), 'status-memo-')))
after(() => rmSync(scratch, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }))

let repos = 0
function repository() {
  const dir = path.join(scratch, `repo-${repos++}`)
  mkdirSync(dir, { recursive: true })
  const git = (...args) => assert.equal(spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8', timeout: 20_000, windowsHide: true }).status, 0)
  git('init', '-q')
  writeFileSync(path.join(dir, 'a.txt'), 'one\n')
  git('add', '-A')
  git('-c', 'user.email=a@b', '-c', 'user.name=n', 'commit', '-q', '-m', 'init')
  return dir
}
function measure(event, dir, { program, out } = {}) {
  const run = spawnSync(process.execPath, [tool, event, dir, '--in-place', '--json', ...(program ? ['--program', program] : [])],
    { encoding: 'utf8', timeout: 120_000, windowsHide: true, env: { ...process.env, ...(out ? { FIXTURE_OUT: out } : {}) } })
  assert.equal(run.status, 0, run.stdout + run.stderr)
  return JSON.parse(run.stdout)
}
const asked = (report, text) => report.children.filter(child => child.cmd.includes(text)).length
const fixture = (name, body) => { const file = path.join(scratch, name); writeFileSync(file, `import { appendFileSync, writeFileSync } from 'node:fs'\nimport { rememberStatus, statusPaths } from ${JSON.stringify(treeFacts)}\nconst out = process.env.FIXTURE_OUT\n${body}\n`); return file }

test('a turn-end event asks git for the working tree status once', { skip: 'Node preload cannot trace Go descendants; native lifecycle behavior is checked at its Go boundary' }, () => {
  const report = measure('Stop', repository())
  assert.equal(report.exit, 0)
  assert.equal(asked(report, 'status --porcelain'), 1, report.children.map(child => child.cmd).join('\n'))
})

test('a status answer older than its lifetime is asked again, and one git could not give is never kept', () => {
  const dir = repository()
  const out = path.join(scratch, 'age.json')
  // The tool runs a program more than once in the same repository, so it begins by removing what an earlier run left.
  const program = fixture('age.mjs', `import { rmSync } from 'node:fs'\nrmSync(${JSON.stringify(path.join(dir, 'b.txt'))}, { force: true })\nlet now = 1000\nrememberStatus(2000, () => now)\nconst first = [...statusPaths(${JSON.stringify(dir)})]\nappendFileSync(${JSON.stringify(path.join(dir, 'b.txt'))}, 'new\\n')\nconst inside = [...statusPaths(${JSON.stringify(dir)})]\nnow += 2001\nconst after = [...statusPaths(${JSON.stringify(dir)})]\nconst gone = ${JSON.stringify(path.join(scratch, 'not-a-repo'))}\nconst a = statusPaths(gone)\nconst b = statusPaths(gone)\nwriteFileSync(out, JSON.stringify({ first, inside, after, failed: [a.ok, b.ok] }))`)
  const report = measure('Stop', dir, { program, out })
  const seen = JSON.parse(readFileSync(out, 'utf8'))
  assert.deepEqual(seen.first, [])
  assert.deepEqual(seen.inside, [], 'a write made inside the lifetime is not seen: the answer is the one already taken')
  assert.deepEqual(seen.after, ['b.txt'], 'and it is seen once the lifetime has passed (the dirty twin)')
  assert.deepEqual(seen.failed, [false, false], 'a status git could not give is a failed look, twice')
  // git answered three times for the repository's reads: once, once more after the lifetime; the failing directory twice.
  assert.equal(asked(report, 'status --porcelain'), 4)
})

test('the memo is off unless the entry point switches it on, and it is per repository', () => {
  const a = repository()
  const b = repository()
  const off = measure('Stop', a, { program: fixture('off.mjs', `statusPaths(${JSON.stringify(a)})\nstatusPaths(${JSON.stringify(a)})`) })
  assert.equal(asked(off, 'status --porcelain'), 2, 'without the switch every call asks')
  const on = measure('Stop', a, { program: fixture('on.mjs', `rememberStatus(2000)\nstatusPaths(${JSON.stringify(a)})\nstatusPaths(${JSON.stringify(a)})\nstatusPaths(${JSON.stringify(b)})\nstatusPaths(${JSON.stringify(b)})`) })
  assert.equal(asked(on, 'status --porcelain'), 2, 'with it, once per repository')
})

test('a clock that goes backwards does not keep an answer alive', () => {
  // Found by a Codex review of the release candidate (ADR-095): an elapsed time below zero satisfied "less than the lifetime".
  const dir = repository()
  const out = path.join(scratch, 'back.json')
  const program = fixture('back.mjs', `import { rmSync } from 'node:fs'\nrmSync(${JSON.stringify(path.join(dir, 'c.txt'))}, { force: true })\nlet now = 100000\nrememberStatus(2000, () => now)\nconst first = [...statusPaths(${JSON.stringify(dir)})]\nappendFileSync(${JSON.stringify(path.join(dir, 'c.txt'))}, 'new\\n')\nnow = 1000\nconst back = [...statusPaths(${JSON.stringify(dir)})]\nwriteFileSync(out, JSON.stringify({ first, back }))`)
  measure('Stop', dir, { program, out })
  const seen = JSON.parse(readFileSync(out, 'utf8'))
  assert.deepEqual(seen.first, [])
  assert.deepEqual(seen.back, ['c.txt'], 'a clock that moved backwards is asked again')
})

test('a caller that empties the array it was handed does not empty the memo', () => {
  // Found by the verification review of the release candidate (ADR-095): the array stored was the array returned.
  const dir = repository()
  const out = path.join(scratch, 'own.json')
  const program = fixture('own.mjs', `import { rmSync } from 'node:fs'\nrmSync(${JSON.stringify(path.join(dir, 'd.txt'))}, { force: true })\nappendFileSync(${JSON.stringify(path.join(dir, 'd.txt'))}, 'new\\n')\nrememberStatus(2000, () => 1)\nconst first = statusPaths(${JSON.stringify(dir)})\nconst seenFirst = [...first]\nfirst.length = 0\nconst second = [...statusPaths(${JSON.stringify(dir)})]\nwriteFileSync(out, JSON.stringify({ seenFirst, second }))`)
  measure('Stop', dir, { program, out })
  const seen = JSON.parse(readFileSync(out, 'utf8'))
  assert.deepEqual(seen.seenFirst, ['d.txt'])
  assert.deepEqual(seen.second, ['d.txt'], 'the second answer still has the path')
})

// Found by the release review: a path that climbs out of a missing component is not the repository it resolves to on paper.
test('a path with a ".." component is asked of git every time, and an invalid one is not reported as a clean tree', async () => {
  const { statusPaths, rememberStatus } = await import(treeFacts)
  rememberStatus()
  const dir = repository()
  assert.equal(statusPaths(dir).ok, true, 'the repository itself is answered')
  const odd = `${dir}${path.sep}__absent__${path.sep}..`
  // Whatever git says about the path as spelled (POSIX: not a repository; Windows collapses `x\..` first and finds the repository).
  const direct = spawnSync('git', ['-C', odd, 'status', '--porcelain'], { encoding: 'utf8', timeout: 20_000, windowsHide: true })
  assert.equal(statusPaths(odd).ok, direct.status === 0, 'a path through a missing directory is answered as git answers it, not as the tree it resolves to')
})
