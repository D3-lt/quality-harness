// ADR-098 T3: text that tells the reader a gate blocks must be about a gate that does.
// Nothing in the artifact pass refuses anything (CLAUDE.md §3); a sentence saying
// "It blocks at commit and completion" is a claim the code does not keep.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { resolveBashExecutable } from '../plugin/scripts/run-shell-hook.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dispatcher = join(repoRoot, 'plugin', 'scripts', 'facts-gate-dispatch.sh')

test('the ADR-ownership notice says nothing is blocked', () => {
  const top = realpathSync.native(mkdtempSync(join(tmpdir(), 'qh-advice-')))
  try {
    const bash = resolveBashExecutable()
    assert.ok(bash, 'bash is needed to run the dispatcher')
    const tasks = join(top, 'docs', 'adr', 'ADR-001-orphan', 'tasks')
    mkdirSync(tasks, { recursive: true })
    const task = join(tasks, 'T1-orphan.md')
    writeFileSync(task, '# Task ADR-001-T1: An orphan\n\nNo owning record is written yet.\n')
    const run = spawnSync(bash, [dispatcher, task, 'PostToolUse'], { encoding: 'utf8', timeout: 60_000 })
    assert.equal(run.status, 0)
    assert.match(run.stdout, /ADR ownership\) not satisfied yet for .*found 0\./, `the ownership notice was printed: ${run.stdout}`)
    assert.match(run.stdout, /Nothing is blocked/, 'it says what the code does')
    assert.doesNotMatch(run.stdout.replace('Nothing is blocked', ''), /block/i, 'and uses no other block verb')
  } finally { rmSync(top, { recursive: true, force: true }) }
})

const CLAIMS = /It blocks at|blocks final completion|still blocks|blocks at the boundary|is itself a blocking/
const claimLines = (text) => text.split('\n').filter(line => CLAIMS.test(line))

test('no shipped text claims the artifact gate blocks', () => {
  // Dirty twin: the matcher reports a line that holds one of the phrases.
  assert.deepEqual(claimLines('fine\n# It blocks at commit and completion.\nfine'), ['# It blocks at commit and completion.'])
  const listed = spawnSync('git', ['ls-files', 'plugin/scripts'], { cwd: repoRoot, encoding: 'utf8', timeout: 30_000 })
  assert.equal(listed.status, 0)
  const files = listed.stdout.split('\n').filter(Boolean)
  assert.ok(files.length > 10, 'the shipped scripts were listed')
  const found = []
  for (const file of files) {
    for (const line of claimLines(readFileSync(join(repoRoot, file), 'utf8'))) found.push(`${file}: ${line.trim()}`)
  }
  assert.deepEqual(found, [])
})
