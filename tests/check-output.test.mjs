// ADR-120 T16 (Decision 16): a check that did not pass keeps the tail of its combined output beside its ledger row, so a failure
// seen once under load can be read afterwards; a pass keeps nothing, and what is kept stays bounded.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { stateDir } from '../plugin/scripts/event-log.mjs'
import { ledgerRefusal } from './helpers/node-hooks/ledger-guard.mjs'
import { runCheck } from '../plugin/scripts/qh-check.mjs'

const repoRoot = path.resolve(import.meta.dirname, '..')
const scratch = realpathSync.native(mkdtempSync(path.join(os.tmpdir(), 'qh-check-output-')))
after(() => rmSync(scratch, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }))
const sink = () => { const chunks = []; return { write: chunk => { chunks.push(String(chunk)); return true }, text: () => chunks.join('') } }

// A repository whose declared check is `node check.mjs`, the script being `script`.
function repoWith(name, script) {
  const dir = path.join(scratch, name)
  mkdirSync(dir, { recursive: true })
  assert.equal(spawnSync('git', ['init', '-q', dir], { encoding: 'utf8', timeout: 10_000, windowsHide: true }).status, 0)
  writeFileSync(path.join(dir, 'check.mjs'), script)
  writeFileSync(path.join(dir, '.quality-harness.json'), JSON.stringify({ check: 'node check.mjs' }))
  return dir
}
async function run(dir, env = {}) {
  const err = sink()
  const exit = await runCheck({ cwd: dir, stdout: sink(), stderr: err, env: { ...process.env, ...env } })
  const row = JSON.parse(readFileSync(path.join(stateDir(dir), 'checks.jsonl'), 'utf8').trim().split('\n').pop())
  return { exit, row, said: err.text() }
}
const kept = (dir, row) => readFileSync(path.join(stateDir(dir), row.output), 'utf8')

test('a failed check keeps the tail of its output, named by its row', async () => {
  // 1,000 lines, then a failing exit: the last 400 lines are kept, in order, and the row names the file.
  // process.exitCode, not process.exit: a pipe is written asynchronously here, and exit would cut the last lines off.
  const dir = repoWith('fails', "for (let i = 1; i <= 1000; i++) console.log(`line ${i}`)\nprocess.exitCode = 1\n")
  const { exit, row, said } = await run(dir)
  assert.equal(exit, 1)
  assert.equal(row.verdict, 'failed')
  assert.equal(row.output, `outputs/${row.id}.log`)
  assert.equal(kept(dir, row), Array.from({ length: 400 }, (_, i) => `line ${601 + i}\n`).join(''))
  assert.ok(said.includes(row.output), `the failure does not name the file it kept: ${said}`)

  // A run the bound stopped did not finish, and its tail is the very thing needed to see where it was.
  const hung = repoWith('hangs', "process.stdout.write('reached the step that hangs\\n')\nsetTimeout(() => {}, 120_000)\n")
  // The bound counts from the spawn, so a slow start must still reach its first line before it.
  const stopped = await run(hung, { QUALITY_HARNESS_CHECK_TIMEOUT: '5' })
  assert.notEqual(stopped.exit, 0)
  assert.notEqual(stopped.row.verdict, 'passed')
  assert.match(kept(hung, stopped.row), /reached the step that hangs/)

  // The row is the evidence and the output a convenience: a place that cannot be written costs the file, never the row.
  const blocked = repoWith('blocked', "console.log('no place for this')\nprocess.exitCode = 3\n")
  mkdirSync(stateDir(blocked), { recursive: true })
  writeFileSync(path.join(stateDir(blocked), 'outputs'), 'a file where the directory should be')
  const lost = await run(blocked)
  assert.equal(lost.exit, 3)
  assert.equal(lost.row.exit, 3)
  assert.equal(lost.row.output, undefined, 'a row names a file that was not written')
  assert.match(lost.said, /output could not be kept/)
})

test('a passing check keeps no output, and the kept files stay bounded', async () => {
  const passes = repoWith('passes', "for (let i = 0; i < 1000; i++) console.log(`fine ${i}`)\n")
  const pass = await run(passes)
  assert.equal(pass.exit, 0)
  assert.equal(pass.row.verdict, 'passed')
  assert.equal('output' in pass.row, false, 'a pass names an output file')
  assert.equal(existsSync(path.join(stateDir(passes), 'outputs')), false, 'a pass kept output')

  // 400 lines of about 1 KB are 400 KB: past 256 KB the cut is at a line, so the file begins at a whole line, ends at the last.
  const big = repoWith('big', "for (let i = 1; i <= 400; i++) console.log(`line ${i} ${'x'.repeat(1000)}`)\nprocess.exitCode = 1\n")
  const cut = await run(big)
  const text = kept(big, cut.row)
  assert.ok(statSync(path.join(stateDir(big), cut.row.output)).size <= 256 * 1024)
  assert.ok(text.length > 128 * 1024, 'the cut kept far less than it may')
  assert.match(text, /^line \d+ x{1000}\n/)
  assert.ok(text.endsWith(`line 400 ${'x'.repeat(1000)}\n`))
  assert.ok(text.split('\n').every(line => line === '' || /^line \d+ x{1000}$/.test(line)), 'a line was cut through')

  // The 51st kept file removes the oldest: fifty are there, the oldest by modification time goes, and the new one stays.
  const many = repoWith('many', "console.log('again')\nprocess.exitCode = 1\n")
  const outputs = path.join(stateDir(many), 'outputs')
  mkdirSync(outputs, { recursive: true })
  for (let i = 0; i < 50; i++) {
    const file = path.join(outputs, `old-${String(i).padStart(2, '0')}.log`)
    writeFileSync(file, `old ${i}\n`)
    utimesSync(file, new Date(1_700_000_000_000 + i * 1000), new Date(1_700_000_000_000 + i * 1000))
  }
  const fresh = await run(many)
  const left = readdirSync(outputs)
  assert.equal(left.length, 50)
  assert.equal(left.includes('old-00.log'), false, 'the oldest file stayed')
  assert.equal(left.includes('old-01.log'), true)
  assert.equal(left.includes(`${fresh.row.id}.log`), true)

  // The state directory's files are written only by its tools (ADR-117), and the refusal says so of these too, in both guards.
  assert.match(ledgerRefusal('x'), /outputs\//)
  const go = readFileSync(path.join(repoRoot, 'core', 'hooks', 'ledger_guard.go'), 'utf8')
  const refusal = go.slice(go.indexOf('func ledgerRefusal'), go.indexOf('func ledgerWarning'))
  assert.match(refusal, /outputs\//)
})
