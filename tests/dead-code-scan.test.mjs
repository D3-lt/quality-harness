// scripts/dead-code-scan.sh, the pre-release scan (CLAUDE.md §13), and its first test (BACKLOG §381 item 20, ADR-119 T4). The
// script scans the repository it sits in, so it is copied into a repository this test made (CLAUDE.md §9), with the tools it
// calls stubbed: a fake uvx answers for vulture and logs what it was asked, a fake npx for knip, and the two scripts it runs
// beside them exit 0, so the run's exit is the vulture branch's alone. /bin/bash on macOS is 3.2, where an empty array under
// `set -u` is an unbound variable; a newer bash does not abort, so the UNRUN line is what is asserted everywhere.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { resolveBashExecutable } from '../plugin/scripts/run-shell-hook.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const scratch = realpathSync.native(mkdtempSync(path.join(os.tmpdir(), 'qh-dead-code-')))
after(() => rmSync(scratch, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }))
const bash = process.platform === 'win32' ? resolveBashExecutable() : '/bin/bash'
const source = readFileSync(path.join(repoRoot, 'scripts', 'dead-code-scan.sh'), 'utf8')

function scan(name, files) {
  const dir = path.join(scratch, name)
  const bin = path.join(scratch, `${name}-bin`)
  const log = path.join(scratch, `${name}-uvx.log`)
  const write = (file, text, mode) => {
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(file, text, mode ? { mode } : undefined)
  }
  const tree = { 'scripts/dead-code-scan.sh': source, 'scripts/orphan-sweep.mjs': '', 'scripts/unused-names.sh': 'exit 0\n', 'scripts/vulture-allowlist.py': '', ...files }
  for (const [file, text] of Object.entries(tree)) write(path.join(dir, file), text)
  assert.equal(spawnSync('git', ['init', '-q', dir], { encoding: 'utf8', timeout: 20_000, windowsHide: true }).status, 0)
  write(path.join(bin, 'uvx'), `#!/bin/sh\necho "$*" >> '${log.replaceAll('\\', '/')}'\ncase "$*" in *--version*) echo "vulture 2.14" ;; esac\nexit 0\n`, 0o755)
  write(path.join(bin, 'npx'), '#!/bin/sh\nexit 0\n', 0o755)
  const run = spawnSync(bash, [path.join(dir, 'scripts', 'dead-code-scan.sh')], { cwd: dir, encoding: 'utf8', timeout: 120_000, windowsHide: true,
    env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}` } })
  let asked = ''
  try { asked = readFileSync(log, 'utf8') } catch { /* uvx was never asked */ }
  return { status: run.status, out: `${run.stdout}${run.stderr}`, asked }
}

test('an empty list is UNRUN under set -u, not an unbound-variable abort', () => {
  const empty = scan('empty', {})
  assert.doesNotMatch(empty.out, /unbound variable/, empty.out)
  assert.match(empty.out, /^UNRUN: vulture had no Python file to read/m, empty.out)
  assert.match(empty.out, /^== knip \(JavaScript\)$/m, `the scan stopped at vulture:\n${empty.out}`)
  assert.equal(empty.status, 3, empty.out)
  assert.doesNotMatch(empty.asked, /--min-confidence/, 'vulture is not run over the allowlist alone')
  // CLEAN twin: one Python file is read, and nothing is UNRUN.
  const one = scan('one', { 'scripts/tool.py': 'print(1)\n' })
  assert.equal(one.status, 0, one.out)
  assert.doesNotMatch(one.out, /UNRUN/, one.out)
  assert.match(one.asked, /vulture --min-confidence 60 scripts\/tool\.py scripts\/vulture-allowlist\.py/, one.asked)
})
