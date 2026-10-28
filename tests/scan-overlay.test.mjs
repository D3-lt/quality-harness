import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { testBash } from './helpers/bash.mjs'
import { remove } from './helpers/remove.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
test('the dead-code scan presents staged additions and deletions to its scanners', t => {
  const top = mkdtempSync(path.join(os.tmpdir(), 'qh scan overlay '))
  t.after(() => remove(top))
  const bin = path.join(top, 'tools')
  mkdirSync(bin)
  mkdirSync(path.join(top, 'scripts'))
  mkdirSync(path.join(top, 'plugin', 'workflows'), { recursive: true })
  writeFileSync(path.join(top, 'plugin', 'workflows', 'fixture.js'), 'export const meta = {}\n')
  const env = { ...process.env, PATH: bin + path.delimiter + process.env.PATH,
    GIT_AUTHOR_NAME: 'qh', GIT_AUTHOR_EMAIL: 'qh@example.invalid',
    GIT_COMMITTER_NAME: 'qh', GIT_COMMITTER_EMAIL: 'qh@example.invalid' }
  const git = (...args) => {
    const out = spawnSync('git', ['-C', top, ...args], { env, encoding: 'utf8', timeout: 10_000, windowsHide: true })
    assert.equal(out.status, 0, out.stderr)
  }
  const tool = (name, text) => { const file = path.join(bin, name); writeFileSync(file, '#!/bin/sh\n' + text); chmodSync(file, 0o755) }
  tool('node', 'exit 0\n')
  tool('uvx', 'echo "vulture 2.16"\n')
  tool('npx', 'case "$*" in *--version*) echo 6.43.0 ;; *) test -f scripts/staged-only.mjs && test ! -e scripts/deleted.mjs ;; esac\n')
  writeFileSync(path.join(top, 'scripts', 'dead-code-scan.sh'), readFileSync(path.join(root, 'scripts', 'dead-code-scan.sh')))
  writeFileSync(path.join(top, 'scripts', 'unused-names.sh'), '#!/bin/sh\nexit 0\n')
  writeFileSync(path.join(top, 'scripts', 'fixture.py'), '# vulture input\n')
  writeFileSync(path.join(top, 'scripts', 'deleted.mjs'), 'export const deleted = true\n')
  git('init', '-q')
  git('add', '-A')
  git('commit', '-qm', 'fixture')
  writeFileSync(path.join(top, 'scripts', 'staged-only.mjs'), 'export const staged = true\n')
  rmSync(path.join(top, 'scripts', 'deleted.mjs'))
  git('add', '-A')
  const ran = spawnSync(testBash(), ['scripts/dead-code-scan.sh'], { cwd: top, env, encoding: 'utf8', timeout: 30_000, windowsHide: true })
  assert.equal(ran.status, 0, ran.stdout + ran.stderr)
})
