// BACKLOG section 375, stage C: a judge that is meant to be a function of its facts reaches no file, process, clock or
// environment, and this holds it to that. scripts/effect-classes.mjs follows every call a function makes through the plugin's
// own modules; each case below shows it answering "reaches X" on code that does, so its "pure" means something.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const script = path.join(repoRoot, 'scripts', 'effect-classes.mjs')
const scratch = realpathSync.native(mkdtempSync(path.join(os.tmpdir(), 'qh-effects-')))
after(() => rmSync(scratch, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }))

const run = (args, { flag = true } = {}) => spawnSync(process.execPath, [...(flag ? ['--expose-internals'] : []), script, ...args],
  { encoding: 'utf8', timeout: 30_000, windowsHide: true })
const put = (name, text) => { const file = path.join(scratch, name); mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, text); return name }
const verdict = (file, name) => run(['--root', scratch, `${file}::${name}`])

test('effect-classes: a function of its arguments is pure, through a call, a parameter and a method', () => {
  const file = put('clean.mjs', [
    "import path from 'node:path'",
    "import { helper } from './helper.mjs'",
    'export function pure(log, read) { return helper(log.filter(entry => entry.ok)).length + read(1) + path.basename(String(log.length)).length }',
    'export function recursive(n) { return n <= 0 ? 0 : recursive(n - 1) + 1 }',
  ].join('\n'))
  put('helper.mjs', 'export function helper(items) { return items.map(item => item * 2) }\n')
  for (const name of ['pure', 'recursive']) {
    const out = verdict(file, name)
    assert.equal(out.status, 0, out.stdout + out.stderr)
    assert.match(out.stdout, /: pure/)
  }
})

test('effect-classes: every way to reach the world is named, directly and through a module', () => {
  const dirty = {
    'a file read': "import { readFileSync } from 'node:fs'\nexport function f() { return readFileSync('x', 'utf8') }",
    'a file read under another name': "import { readFileSync as slurp } from 'node:fs'\nexport function f() { return slurp('x') }",
    'a file write': "import { writeFileSync } from 'node:fs'\nexport function f() { writeFileSync('x', '') }",
    'an fs export the table has not heard of': "import { createReadStream } from 'node:fs'\nexport function f() { return createReadStream('x') }",
    'a process': "import { spawnSync } from 'node:child_process'\nexport function f() { return spawnSync('git') }",
    'the clock': 'export function f() { return Date.now() }',
    'a new Date': 'export function f() { return new Date() }',
    'randomness': 'export function f() { return Math.random() }',
    'the environment': 'export function f() { return process.env.HOME }',
    'the working directory': 'export function f() { return process.cwd() }',
    'output': "export function f() { console.log('x') }",
    'a timer': 'export function f() { setTimeout(() => {}, 1) }',
    'a dynamic import': "export async function f() { return import('node:fs') }",
    'eval': "export function f() { return eval('1') }",
    'the machine': "import os from 'node:os'\nexport function f() { return os.tmpdir() }",
    'a package this table does not know': "import left from 'left-pad'\nexport function f() { return left('x') }",
    'a randomUUID': "import { randomUUID } from 'node:crypto'\nexport function f() { return randomUUID() }",
  }
  for (const [what, code] of Object.entries(dirty)) {
    const file = put(`dirty-${what.replace(/\W+/g, '-')}.mjs`, code)
    const out = verdict(file, 'f')
    assert.equal(out.status, 1, `${what}: ${out.stdout}${out.stderr}`)
    assert.match(out.stdout, /reaches/, `${what}: ${out.stdout}`)
  }
  // Through a module: the reader is two calls away, in another file.
  put('deep/leaf.mjs', "import { statSync } from 'node:fs'\nexport function leaf(p) { return statSync(p) }\n")
  put('deep/middle.mjs', "import { leaf } from './leaf.mjs'\nexport function middle(p) { return leaf(p) }\n")
  const top = put('deep/top.mjs', "import { middle } from './middle.mjs'\nexport function top(p) { return middle(p) }\n")
  const out = verdict(top, 'top')
  assert.equal(out.status, 1, out.stdout + out.stderr)
  assert.match(out.stdout, /middle .*-> leaf .*-> a file read \(statSync\)/s, out.stdout)
  // A function whose own body is clean but whose callee in the same file is not.
  const same = put('same.mjs', "import { statSync } from 'node:fs'\nfunction inner(p) { return statSync(p) }\nexport function outer(p) { return inner(p) }\n")
  assert.equal(verdict(same, 'outer').status, 1)
  assert.equal(verdict(same, 'inner').status, 1)
})

test('effect-classes: a function it cannot find, a file it cannot read, nothing named and a Node without the flag are UNRUN, never "pure"', () => {
  const file = put('some.mjs', 'export function present() { return 1 }\n')
  const missing = verdict(file, 'absent')
  assert.equal(missing.status, 2, missing.stdout + missing.stderr)
  assert.match(missing.stderr, /UNRUN/)
  const unread = verdict('nowhere.mjs', 'f')
  assert.equal(unread.status, 2, unread.stdout + unread.stderr)
  assert.equal(run(['--root', scratch]).status, 2)
  const bare = run(['--root', scratch, `${file}::present`], { flag: false })
  assert.equal(bare.status, 2, bare.stdout + bare.stderr)
  assert.match(bare.stderr, /expose-internals/)
  assert.doesNotMatch(bare.stdout, /pure/)
})

// The judges this stage made functions of their facts. A function joins this list when it is one, and leaves it only by a
// decision a reader can see: the next test names the one that is NOT, and why.
const JUDGES = [
  'plugin/scripts/publish-verdict.mjs::publishJudgement',
  'plugin/scripts/check-ledger.mjs::checkStanding',
  'plugin/scripts/check-ledger.mjs::latestOf',
  'plugin/scripts/check-ledger.mjs::latestCheckFor',
  'plugin/scripts/check-ledger.mjs::treeChecked',
  'plugin/scripts/check-ledger.mjs::logIncomplete',
  'plugin/scripts/check-ledger.mjs::tornRecord',
  'plugin/scripts/completion-rules.mjs::ledgerEvidence',
  'plugin/scripts/completion-rules.mjs::completionClaim',
  'plugin/scripts/completion-rules.mjs::completionJudgement',
  'plugin/scripts/publish-command.mjs::publishCommandIn',
  'plugin/scripts/check-command.mjs::publishSettingNote',
]

test('the judges reach no file, process, clock or environment', () => {
  const out = run(['--root', repoRoot, ...JUDGES])
  assert.equal(out.status, 0, out.stdout + out.stderr)
  assert.equal(out.stdout.trim().split('\n').filter(line => line.endsWith(': pure')).length, JUDGES.length, out.stdout)
})

test('the one judge that is not pure says what it reads, so that read can become a fact', () => {
  // unobservableWrites decides whether a recorded write lay outside the repository by resolving the path against the disk
  // (canonicalFile -> a stat). Until that comes in as a fact, completionRules is a function of its facts only up to this.
  const out = run(['--root', repoRoot, 'plugin/scripts/check-ledger.mjs::unobservableWrites'])
  assert.equal(out.status, 1, out.stdout + out.stderr)
  assert.match(out.stdout, /a file read \(statSync\)/, out.stdout)
})
