// scripts/unused-names.sh runs on every gate (the owner, 2026-10-12): an import or a local nothing in its own file reads. Each
// verdict is shown here in both directions, because a linter that returns clean on a dirty tree is a gate that cannot fail
// (CLAUDE.md §4), and one that cannot start must say UNRUN rather than clean (ADR-005).
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { resolveBashExecutable } from '../plugin/scripts/run-shell-hook.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const scratch = realpathSync.native(mkdtempSync(path.join(os.tmpdir(), 'qh-unused-')))
after(() => rmSync(scratch, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }))
// An absolute bash, so the run with an empty PATH still starts the script it is about.
const bash = process.platform === 'win32' ? resolveBashExecutable() : '/bin/bash'
const script = path.join(repoRoot, 'scripts', 'unused-names.sh')

function project(name, files) {
  const dir = path.join(scratch, name)
  mkdirSync(dir, { recursive: true })
  assert.equal(spawnSync('git', ['init', '-q', dir], { encoding: 'utf8', timeout: 20_000, windowsHide: true }).status, 0)
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, file)), { recursive: true })
    writeFileSync(path.join(dir, file), text)
  }
  return dir
}
const lint = (dir, env = process.env) => {
  const run = spawnSync(bash, [script, dir], { cwd: dir, env, encoding: 'utf8', timeout: 180_000, windowsHide: true })
  return { status: run.status, out: `${run.stdout}${run.stderr}` }
}

// One finding per project, so each linter's exit is proved on its own: a dirty Python tree must not lean on a dirty JS one.
const findings = {
  product: { 'plugin/scripts/imports.mjs': "import { join } from 'node:path'\nexport const a = 1\n", 'plugin/scripts/locals.mjs': 'export function f() {\n  const unused = 1\n  return 2\n}\n' },
  tests: { 'tests/imports.test.mjs': "import { join } from 'node:path'\nexport const b = 1\n", 'tests/locals.test.mjs': 'export function g() {\n  const local = 1\n  return 3\n}\n' },
  python: { 'plugin/bin/gate': '#!/usr/bin/env python3\nimport os\nprint(1)\n', 'scripts/tool.py': 'def f():\n    unused = 1\n    return 2\n' },
}

for (const [kind, files] of Object.entries(findings)) {
  test(`an unused name in ${kind} is a finding, named by file`, () => {
    const run = lint(project(`dirty-${kind}`, files))
    assert.equal(run.status, 1, run.out)
    for (const file of Object.keys(files).filter(file => file !== 'tests/locals.test.mjs')) {
      assert.ok(run.out.includes(file), `${file} is not named:\n${run.out}`)
    }
    assert.match(run.out, /unused-names: findings above/)
  })
}

test('a local inside a test is not a finding: only its imports are read', () => {
  const run = lint(project('test-local', { ...clean, 'tests/locals.test.mjs': findings.tests['tests/locals.test.mjs'] }))
  assert.equal(run.status, 0, run.out)
  assert.ok(!run.out.includes('tests/locals.test.mjs'), run.out)
})

// Every class present and every name read: a class with nothing in it is not clean, so the projects below that are about
// one thing carry these too.
const clean = {
  'plugin/scripts/imports.mjs': "import { join } from 'node:path'\nexport const a = join('a', 'b')\n",
  'plugin/scripts/locals.mjs': 'export function f() {\n  const used = 1\n  return used\n}\n',
  'tests/imports.test.mjs': "import { join } from 'node:path'\nexport const b = join('a', 'b')\n",
  'plugin/bin/gate': '#!/usr/bin/env python3\nimport os\nprint(os.sep)\n',
  'scripts/tool.py': 'def f():\n    used = 1\n    return used\n',
}

test('the same files with every name read are clean', () => {
  const run = lint(project('clean', clean))
  assert.equal(run.status, 0, run.out)
  assert.match(run.out, /every linter ran and found nothing/)
})

test('a tree with no file of a class read nothing there, which is UNRUN, not clean', () => {
  const run = lint(project('empty', {}))
  assert.equal(run.status, 3, run.out)
  for (const kind of ['python', 'product', 'tests']) assert.match(run.out, new RegExp(`UNRUN: no ${kind} file was listed`))
  assert.doesNotMatch(run.out, /found nothing/)
})

// A fake tool on PATH ahead of the real ones: present, and unable to answer.
function fakeTools(name, tools) {
  const dir = path.join(scratch, name)
  mkdirSync(dir, { recursive: true })
  for (const [tool, body] of Object.entries(tools)) writeFileSync(path.join(dir, tool), `#!/bin/sh\n${body}\n`, { mode: 0o755 })
  return { ...process.env, PATH: `${dir}${path.delimiter}${process.env.PATH}` }
}

test('a linter that is present but cannot start is UNRUN, never a finding', () => {
  const env = fakeTools('broken', { uvx: 'echo "error: failed to fetch ruff" >&2; exit 2', npx: 'echo "npm error network" >&2; exit 1' })
  const run = lint(project('broken-tools', clean), env)
  assert.equal(run.status, 3, run.out)
  assert.match(run.out, /UNRUN: uvx exited 2/)
  assert.match(run.out, /UNRUN: npx exited 1/)
  assert.doesNotMatch(run.out, /findings above/)
})

test('a verdict is the tool\'s own summary line, not its words anywhere in the output', () => {
  // What biome 2.5.12 printed for a path it could not read (the review of 2026-10-12): the count is inside a file name.
  const env = fakeTools('echo-verdict', {
    npx: 'echo "  × /nowhere/Found 1 error.js: No such file or directory"; echo "Checked 0 files in 1ms. No fixes applied."; exit 1',
  })
  const run = lint(project('echo-verdict', clean), env)
  assert.equal(run.status, 3, run.out)
  assert.match(run.out, /UNRUN: npx exited 1/)
  assert.doesNotMatch(run.out, /findings above/)
})

test('a ruff that is not the pinned version is not used', () => {
  const env = fakeTools('old-ruff', { python3: 'echo "ruff 0.1.0"' })
  const run = lint(project('old-ruff', clean), { ...env, PATH: env.PATH.split(path.delimiter)[0] })
  assert.equal(run.status, 3, run.out)
  assert.match(run.out, /python3 -m ruff is 0\.1\.0, and this pins/)
})

test('a path git quotes is named as unread, not skipped', t => {
  if (process.platform === 'win32') return t.skip('a double quote cannot be part of a Windows file name, so this fixture cannot be built here')
  const run = lint(project('quoted', { ...clean, 'scripts/a"b.py': 'import os\n' }))
  assert.equal(run.status, 3, run.out)
  assert.match(run.out, /UNRUN: git quoted a path this cannot read/)
})

test('with no tools on PATH it is UNRUN, naming each linter, never clean', () => {
  const run = lint(project('bare', findings.python), { ...process.env, PATH: '' })
  assert.equal(run.status, 3, run.out)
  assert.match(run.out, /UNRUN: ruff/)
  assert.match(run.out, /UNRUN: biome/)
  assert.doesNotMatch(run.out, /found nothing/)
})

// What selects it. The gate calls it on every run, the release scan includes it, and every CI job that runs the gate, the
// coverage floor or a mutation shard installs the ruff it pins: a job without it would read UNRUN, and the gate goes red.
test('the gate, the release scan and every CI job that runs the tests are wired to it', () => {
  const read = file => readFileSync(path.join(repoRoot, file), 'utf8')
  const calls = text => text.split('\n').some(line => !line.trimStart().startsWith('#') && /scripts\/unused-names\.sh"?\s*$/.test(line))
  assert.ok(calls(read('scripts/selftest.sh')), 'selftest.sh does not run unused-names.sh, or hides its exit')
  assert.ok(read('scripts/dead-code-scan.sh').includes('scripts/unused-names.sh'), 'dead-code-scan.sh does not run unused-names.sh')
  const pinned = read('scripts/unused-names.sh').match(/^RUFF_VERSION=(\S+)$/m)[1]
  const jobs = read('.github/workflows/selftest.yml').split(/\n(?= {2}[a-z][\w-]*:\n)/)
  const steps = job => job.split('\n').filter(line => !line.trimStart().startsWith('#')).join('\n')
  const testing = jobs.filter(job => /^ {2}[a-z][\w-]*:\n/.test(job) && /selftest\.sh|coverage\.sh|mutate\.mjs --shard/.test(steps(job)))
  assert.ok(testing.length >= 4, `expected the selftest, windows, coverage and mutation jobs, found ${testing.length}`)
  // On a `run:` line and before any `#`: a pin in a comment installs nothing.
  const installs = new RegExp(`run:[^#\\n]*ruff==${pinned.replaceAll('.', '\\.')}(\\s|$)`)
  for (const job of testing) assert.match(steps(job), installs, `a job runs the tests without ruff==${pinned}:\n${job.split('\n')[0]}`)
})
