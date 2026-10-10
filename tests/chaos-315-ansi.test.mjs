// BACKLOG §319 addendum, "[31m residue". Corpus text is quoted with every control character
// replaced by a space, so an escape sequence lost only its ESC: `One \x1b[31mred\x1b[0m word` was
// quoted as «One [31mred [0m word», and an OSC title's payload printed as the task file's words.
// Both quoting helpers now remove a whole CSI sequence, and an OSC one ended by BEL or ST, before
// the control pass. Each test goes through a reader's real line; literal `[31m` and `[x]`, typed
// without an ESC, are the control, and an OSC with no terminator keeps its text visible.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { readyTaskLines } from '../plugin/scripts/ready-lines.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const bin = join(repoRoot, 'plugin', 'bin')
const temps = []
test.after(() => { for (const dir of temps) rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }) })
const scratch = () => {
  const dir = realpathSync.native(mkdtempSync(join(tmpdir(), 'qh-chaos-315-ansi-')))
  temps.push(dir)
  return dir
}
const write = (dir, rel, text) => {
  mkdirSync(dirname(join(dir, ...rel.split('/'))), { recursive: true })
  writeFileSync(join(dir, ...rel.split('/')), text)
}

const ESC = '\x1b'
const BEL = '\x07'
// SGR colours, an OSC title ended by BEL, one ended by ST (ESC \), the control's literal
// brackets, and an unterminated OSC last, whose text a reader must still see.
const HOSTILE = `One ${ESC}[31mred${ESC}[0m word, title ${ESC}]0;pwned${BEL} end, st ${ESC}]0;gone${ESC}\\ end, `
  + `keep [31m and [x], open ${ESC}]2;still shown`
const QUOTED = 'One red word, title end, st end, keep [31m and [x], open ]2;still shown'
const RESIDUE = /\[31mred|\[0m|pwned|gone|\x1b/

// adr-next's own "Next:" line (quoted) and its --all listing (shown), through the CLI.
test('adr-next quotes a task heading without the residue of an escape sequence', () => {
  const dir = scratch()
  write(dir, 'tasks/T1-t.md', `# Task T1: ${HOSTILE}\n\n**Depends-on:** none\n\n## Acceptance\n\n\`\`\`bash\nprintf T1\n\`\`\`\n\n## Verification Log\n`)
  const [file, argv] = process.platform === 'win32' ? ['python3', [join(bin, 'adr-next')]] : [join(bin, 'adr-next'), []]
  const run = args => spawnSync(file, [...argv, join(dir, 'tasks'), ...args], {
    cwd: dir, encoding: 'utf8', timeout: 60_000, windowsHide: true,
    env: { ...process.env, PATH: `${bin}${delimiter}${process.env.PATH ?? ''}` },
  })
  const next = run([])
  assert.equal(next.status, 0, next.stderr)
  assert.match(next.stdout, new RegExp(`^Next: T1 — «Task T1: ${escaped(QUOTED)}»\\r?$`, 'm'), JSON.stringify(next.stdout))
  assert.doesNotMatch(next.stdout, RESIDUE, JSON.stringify(next.stdout))
  const all = run(['--all'])
  assert.equal(all.status, 0, all.stderr)
  assert.match(all.stdout, new RegExp(`^READY\\s+T1\\s+Task T1: ${escaped(QUOTED)}`, 'm'), JSON.stringify(all.stdout))
  assert.doesNotMatch(all.stdout, RESIDUE, JSON.stringify(all.stdout))
})

// adr-state's governing line, through quotedCorpusText, through its CLI.
test('adr-state quotes a record title without the residue of an escape sequence', () => {
  const dir = scratch()
  write(dir, 'src/a.js', 'export const a = 1\n')
  write(dir, 'docs/adr/ADR-001-a.md', `# ADR-001: ${HOSTILE}\n\n**Status:** Accepted\n**Governs:** src/a.js\n\n## Context\n\nc\n\n## Decision\n\nd\n`)
  assert.equal(spawnSync('git', ['init', '-q'], { cwd: dir, encoding: 'utf8', timeout: 30_000, windowsHide: true }).status, 0)
  const run = spawnSync(process.execPath, [join(repoRoot, 'plugin', 'scripts', 'adr-state.mjs')], { cwd: dir, encoding: 'utf8', timeout: 120_000, windowsHide: true })
  assert.equal(run.status, 0, run.stderr)
  assert.ok(run.stdout.includes(`«ADR-001: ${QUOTED}»`), JSON.stringify(run.stdout))
  assert.doesNotMatch(run.stdout, RESIDUE, JSON.stringify(run.stdout))
})

// SessionStart's line for a tasks directory adr-next could not answer for: adr-next's own first
// line, said on its behalf through gateSaid.
test('SessionStart says what adr-next printed without the residue of its colours', () => {
  const root = scratch()
  const listing = ['docs/adr/ADR-001-x/tasks/T1-x.md']
  write(root, listing[0], '# x\n')
  const said = stderr => readyTaskLines(root, true, listing, () => ({ status: 2, stderr, stdout: '' })).lines[0] ?? ''
  const coloured = said(`${ESC}[31mboom${ESC}[0m, keep [31m and [x]\n`)
  assert.ok(coloured.includes('adr-next could not run (exit 2): boom, keep [31m and [x]'), JSON.stringify(coloured))
  assert.doesNotMatch(coloured, RESIDUE, JSON.stringify(coloured))
})

function escaped(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
