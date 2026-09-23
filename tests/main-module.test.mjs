// A CLI invoked through a symlink still knows it is the entry point.
//
// Every script here used to decide "am I the main module" with
// `import.meta.url === pathToFileURL(process.argv[1]).href` — a resolved url
// against the path as typed. Through `/tmp` on macOS (a symlink to `/private/tmp`)
// they never match, so `node /tmp/<clone>/plugin/scripts/work-next.mjs` printed
// nothing and exited 0. A peer following a probe recipe from `/tmp` reported the
// empty output on 2026-09-23; 32 scripts shared the guard, and one
// (workflow-parse.mjs) had fixed its own copy two weeks earlier (BACKLOG §264).
// That one keeps its own copy: the post-edit hook copies the file ALONE into a
// scratch directory, so it can import nothing, and the sweep below says so.
// One exported guard now, and this proves it three ways: the function, a real
// script run through a symlink, and a sweep that no script carries the old
// comparison any more.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { isMainModule } from '../plugin/scripts/main-module.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
// `os.tmpdir()` itself, not `/private/tmp`: on macOS that IS the symlinked
// spelling, which is the whole point here.
const scratch = mkdtempSync(path.join(os.tmpdir(), 'qh-main-module-'))
after(() => rmSync(scratch, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }))

test('isMainModule resolves symlinks on both sides, and says no without an entry', () => {
  const real = path.join(scratch, 'real.mjs')
  writeFileSync(real, 'export {}\n')
  const link = path.join(scratch, 'link.mjs')
  symlinkSync(real, link)
  const url = pathToFileURL(realpathSync(real)).href
  assert.equal(isMainModule(url, ['node', link]), true, 'the typed path is a symlink to the module')
  assert.equal(isMainModule(url, ['node', real]), true, 'the typed path is the module')
  // The controls: a different file, and no entry at all.
  const other = path.join(scratch, 'other.mjs')
  writeFileSync(other, 'export {}\n')
  assert.equal(isMainModule(url, ['node', other]), false)
  assert.equal(isMainModule(url, ['node']), false)
  // A path that does not exist cannot be resolved; the url comparison decides.
  assert.equal(isMainModule(url, ['node', path.join(scratch, 'missing.mjs')]), false)
  assert.equal(isMainModule(pathToFileURL(path.join(scratch, 'missing.mjs')).href, ['node', path.join(scratch, 'missing.mjs')]), true,
    'the fallback still recognises an exact spelling')
})

test('a script run through a symlinked path is the main module and speaks', () => {
  const link = path.join(scratch, 'repo')
  symlinkSync(repoRoot, link, process.platform === 'win32' ? 'junction' : 'dir')
  const script = path.join(link, 'plugin', 'scripts', 'qh-check.mjs')
  assert.notEqual(realpathSync(script), script, 'the path really goes through a symlink, or this proves nothing')
  const run = spawnSync(process.execPath, [script, '--bogus'], { encoding: 'utf8', timeout: 30_000 })
  // Before: exit 0 and silence — the guard never matched and the script did nothing.
  assert.equal(run.status, 2, `usage error expected, got ${run.status}: ${run.stdout}${run.stderr}`)
  assert.match(run.stderr, /unknown option: --bogus/)
})

test('no shipped or repository script compares import.meta.url to argv[1] unresolved', () => {
  const listed = spawnSync('git', ['-C', repoRoot, 'ls-files', 'plugin/scripts/*.mjs', 'scripts/*.mjs'], { encoding: 'utf8', timeout: 15_000 })
  assert.equal(listed.status, 0, listed.stderr)
  const files = listed.stdout.trim().split('\n').filter(Boolean)
  assert.ok(files.length > 30, `the sweep saw the scripts: ${files.length}`)
  // workflow-parse.mjs is copied alone by the post-edit hook and cannot import the
  // shared guard; its own inline copy compares realpaths and keeps the url form only
  // as the fallback. Everything else routes through isMainModule.
  const standalone = new Set(['plugin/scripts/main-module.mjs', 'plugin/scripts/workflow-parse.mjs'])
  const offenders = files.filter(file => !standalone.has(file)
    // Every spelling the sweep of 2026-09-23 met: `pathToFileURL(process.argv[1])`,
    // `pathToFileURL(process.argv[1] ?? '')`, and a `file://` template — the last
    // never matched on Windows at all (the backlog sweeps' own comments say why).
    && /pathToFileURL\(\s*(?:process\.)?argv\[1\][^)]*\)\.href|new URL\(`file:\/\/\$\{process\.argv\[1\]\}`\)/.test(readFileSync(path.join(repoRoot, file), 'utf8')))
  assert.deepEqual(offenders, [], 'route the guard through isMainModule instead')
  // The control: the sweep can see the pattern at all.
  assert.match(readFileSync(path.join(repoRoot, 'plugin/scripts/main-module.mjs'), 'utf8'), /pathToFileURL\(entry\)\.href/)
})
