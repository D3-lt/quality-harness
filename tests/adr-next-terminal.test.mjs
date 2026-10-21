// ADR-120 T8: a task whose own Status is terminal reads stopped, and a human sign-off covers the
// steps it names. The old reading put `done` before every stop, so a withdrawn task with an exit-0
// row was reported finished work; and one sign-off cleared every unsigned human-proof step.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import { delimiter, dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { remove } from './helpers/remove.mjs'

const testDir = dirname(fileURLToPath(import.meta.url))
const bin = join(resolve(testDir, '..'), 'plugin', 'bin')
const env = { ...process.env, PATH: `${bin}${delimiter}${process.env.PATH ?? ''}` }
const temps = []
test.after(() => { for (const dir of temps) remove(dir) })

function next(args, cwd) {
  const [file, argv] = process.platform === 'win32'
    ? ['python3', [join(bin, 'adr-next'), ...args]]
    : ['adr-next', args]
  return spawnSync(file, argv, { cwd, env, encoding: 'utf8', timeout: 60_000 })
}

const fence = 'printf T1'
const digest = createHash('sha256').update(fence, 'utf8').digest('hex')
const exitRow = `- 2026-08-26 · no-git · exit 0 · \`${fence}\` · acceptance-sha256:${digest}\n`
const redRow = `- 2026-08-25 · no-git · exit 1 · \`${fence}\` · acceptance-sha256:${digest}\n`

// One task file in a one-task corpus: `status` is its own header, `steps` its Ordered Steps, `log` its rows.
function lone({ status = null, steps = '', log = '' }) {
  const dir = mkdtempSync(join(os.tmpdir(), 'quality-harness-terminal-'))
  temps.push(dir)
  const tasksDir = join(dir, 'tasks')
  mkdirSync(tasksDir)
  writeFileSync(join(tasksDir, 'README.md'), '# Tasks\n\n| Order | Task | Status |\n| 1 | T1 | pending |\n')
  writeFileSync(join(tasksDir, 'T1-t.md'),
    '# Task T1: do T1\n\n' + (status ? `**Status:** ${status}\n` : '')
    + '**Depends-on:** none\n**Consumes:** none\n**Produces:** none\n\n'
    + (steps ? `## Ordered Steps\n\n${steps}\n\n` : '')
    + `## Acceptance\n\n\`\`\`bash\n${fence}\n\`\`\`\n\n## Verification Log\n${log}`)
  return { dir }
}

test('a task whose own Status is terminal reads stopped, whatever its evidence', () => {
  const withdrawn = 'Withdrawn 2026-09-02 by ADR-002'
  for (const [label, log] of [['red then exit 0', redRow + exitRow], ['exit 0 only', exitRow], ['no rows', '']]) {
    const { dir } = lone({ status: withdrawn, log })
    const out = next([dir, '--all'], dir)
    assert.match(out.stdout, /^stopped\s+T1/m, `${label}: ${out.stdout}${out.stderr}`)
    assert.match(out.stdout, /Withdrawn 2026-09-02 by ADR-002/i, `${label} names its reason: ${out.stdout}`)
    assert.doesNotMatch(out.stdout, /^done\s+T1/m, label)
  }
  // The twin: a Status that is not terminal, with the same rows, is done as before.
  const { dir } = lone({ status: 'done', log: redRow + exitRow })
  const twin = next([dir, '--all'], dir)
  assert.match(twin.stdout, /^done\s+T1/m, `${twin.stdout}${twin.stderr}`)
  assert.doesNotMatch(twin.stdout, /^stopped\s+T1/m)
})

test('a sign-off naming a step covers that step only, and one naming none covers all', () => {
  const steps = [1, 2, 3, 4].map(n => n === 1
    ? '1. [S1] Write it.'
    : `${n}. [S${n}] Look at it. [proof: human: the ${n}th look]`).join('\n')
  const note = (text) => `- 2026-08-26 · human-observed · ${text}\n`
  const advised = (text) => {
    const { dir } = lone({ steps, log: exitRow + (text === null ? '' : note(text)) })
    const out = next([dir, '--all'], dir)
    assert.match(out.stdout, /^done\s+T1/m, `still done: ${out.stdout}${out.stderr}`)
    const m = out.stdout.match(/\((S[\d, S]+) names? \[proof: human/)
    return m ? m[1] : null
  }
  assert.equal(advised(null), 'S2, S3, S4', 'no sign-off advises every step')
  assert.equal(advised('PASS — Zy confirmed S2'), 'S3, S4', 'a sign-off naming S2 advises S3 and S4 and not S2')
  assert.equal(advised('PASS — Zy confirmed it'), null, 'a sign-off naming no step advises none')
  assert.equal(advised('PASS — Zy confirmed S2 and S4'), 'S3', 'S2 and S4 advise S3 only')
  assert.equal(advised('PASS — Zy confirmed S20'), 'S2, S3, S4', 'S20 does not cover S2')
})
