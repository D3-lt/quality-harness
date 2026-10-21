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

// The Codex review of c749638e..7a9107e8: a task whose own Status is terminal is not finished work for the tasks that wait on it, and
// its Status is the one its header block names, not a line inside an Acceptance fence or a later section's prose.
const pluginRoot = join(resolve(testDir, '..'), 'plugin')
const digestOf = text => createHash('sha256').update(text, 'utf8').digest('hex')

// One task file whose exit-0 row proves its fence; `status` is its own header Status, `context` a section before Acceptance, and
// `proved: false` leaves the log empty.
function taskFile(id, { dependsOn = 'none', status = null, body = `printf ${id}`, context = '', proved = true } = {}) {
  const row = proved ? `- 2026-08-26 · no-git · exit 0 · \`${body.split('\n')[0]}\` · acceptance-sha256:${digestOf(body)}\n` : ''
  return `# Task ${id}: probe\n\n${status ? `**Status:** ${status}\n` : ''}**Depends-on:** ${dependsOn}\n**Consumes:** none\n**Produces:** none\n\n`
    + context + `## Acceptance\n\n\`\`\`bash\n${body}\n\`\`\`\n\n## Verification Log\n${row}`
}

function corpus(files) {
  const dir = mkdtempSync(join(os.tmpdir(), 'quality-harness-terminal-deps-'))
  temps.push(dir)
  const tasksDir = join(dir, 'tasks')
  mkdirSync(tasksDir)
  writeFileSync(join(tasksDir, 'README.md'), '# Tasks\n')
  for (const [id, spec] of Object.entries(files)) writeFileSync(join(tasksDir, `${id}-t.md`), taskFile(id, spec))
  return tasksDir
}

function abroad(status, pointer) {
  const dir = mkdtempSync(join(os.tmpdir(), 'quality-harness-terminal-foreign-'))
  temps.push(dir)
  for (const [name, id, spec] of [['032-x', 'T4', { status }], ['033-z', 'T5', { dependsOn: pointer, proved: false }]]) {
    writeFileSync(join(dir, `${name}.md`), `# ${name}: probe\n\n**Status:** Accepted\n`)
    const tasksDir = join(dir, name, 'tasks')
    mkdirSync(tasksDir, { recursive: true })
    writeFileSync(join(tasksDir, `${id}-t.md`), taskFile(id, spec))
  }
  return join(dir, '033-z', 'tasks')
}

const isReady = (out, id) => new RegExp(`READY\\s+${id}`).test(out)

test('a task waiting on a task whose own Status is terminal is blocked, local or foreign', () => {
  const withdrawn = 'Withdrawn 2026-09-02 by ADR-002'
  const local = next([corpus({ T1: { status: withdrawn }, T2: { dependsOn: 'T1', proved: false } }), '--all'], pluginRoot).stdout
  assert.match(local, /^stopped\s+T1/m, local)
  assert.ok(!isReady(local, 'T2'), `a dependent on a withdrawn task is not ready:\n${local}`)
  assert.match(local, /blocked\s+T2/i, local)
  const foreignOpen = next([abroad(withdrawn, 'ADR-032-T4'), '--all'], pluginRoot).stdout
  assert.ok(!isReady(foreignOpen, 'T5'), `a foreign withdrawn task frees nothing:\n${foreignOpen}`)
  // DIRTY twins: the same rows with a Status that is not terminal free the dependent.
  const done = next([corpus({ T1: { status: 'done' }, T2: { dependsOn: 'T1', proved: false } }), '--all'], pluginRoot).stdout
  assert.ok(isReady(done, 'T2'), `a done T1 frees T2:\n${done}`)
  const freed = next([abroad('done', 'ADR-032-T4'), '--all'], pluginRoot).stdout
  assert.ok(isReady(freed, 'T5'), `a done foreign T4 frees T5:\n${freed}`)
})

test("a Status line inside an Acceptance fence or a later section is not the task's Status", () => {
  const body = "cat <<'EOF' >/dev/null\nStatus: withdrawn\n**Status:** Withdrawn 2026-09-02\nEOF"
  const fenced = next([corpus({ T1: { body } }), '--all'], pluginRoot).stdout
  assert.match(fenced, /^done\s+T1/m, `a finished task is not stopped by a heredoc line:\n${fenced}`)
  const later = next([corpus({ T1: { context: '## Context\n\nStatus: withdrawn\n\n' } }), '--all'], pluginRoot).stdout
  assert.match(later, /^done\s+T1/m, `prose in a later section is not the header:\n${later}`)
  const example = next([corpus({ T1: { context: '```\nStatus: withdrawn\n```\n\n' } }), '--all'], pluginRoot).stdout
  assert.match(example, /^done\s+T1/m, `a fenced example in the header block is not its Status:\n${example}`)
  // DIRTY twin: the same word in the header block stops it.
  const header = next([corpus({ T1: { status: 'withdrawn' } }), '--all'], pluginRoot).stdout
  assert.match(header, /^stopped\s+T1/m, header)
})
