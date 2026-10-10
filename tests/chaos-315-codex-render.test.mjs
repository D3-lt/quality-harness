// Codex review of ffd4892, #3 and #4 (BACKLOG §321). SessionStart said a corpus path or command
// holding a tag raw — a ready line's diagnostic prefix, its `adr-verify` command, an archive's
// name, the previous session's files, the compaction note's check — while gateSaid cleaned the
// sentence beside it. And it showed an ordinary command wrong, so a copy of it failed where the
// declared command passes: `wc -l ‹CLAUDE.md` exits 1 and `printf\u{9}ok` exits 127. Each test
// is a regression at the boundary the finding came through, with a control beside it.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { readyTaskLines } from '../plugin/scripts/ready-lines.mjs'
import { sessionOrientation } from '../plugin/scripts/session-orientation.mjs'
import { sessionStateNote } from '../plugin/scripts/session-notes.mjs'
import { locationKey } from '../plugin/scripts/tree-facts.mjs'
import { runTheCheckSentence } from '../plugin/scripts/check-command.mjs'
import { checkInCode } from '../plugin/scripts/corpus-text.mjs'
import { hookSaid } from './hook-env.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const lifecycleScript = join(repoRoot, 'plugin', 'scripts', 'lifecycle.mjs')
const temps = []
test.after(() => { for (const dir of temps) rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }) })
const scratch = () => {
  const dir = realpathSync.native(mkdtempSync(join(tmpdir(), 'qh-chaos-315-render-')))
  temps.push(dir)
  return dir
}
// Only in a directory this file made (CLAUDE.md §9).
const git = (dir, ...args) => {
  const run = spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8', timeout: 30_000, windowsHide: true })
  assert.equal(run.status, 0, `git ${args.join(' ')}: ${run.stderr}`)
}
const write = (dir, rel, text = '# x\n') => {
  mkdirSync(dirname(join(dir, ...rel.split('/'))), { recursive: true })
  writeFileSync(join(dir, ...rel.split('/')), text)
}
// Windows refuses `<` and `>` in a file name, so there the fixture cannot be built.
const buildable = (t, dir, rels) => {
  try { for (const rel of rels) write(dir, rel) } catch (error) { t.skip(`this platform cannot hold a tag in a name: ${error.code}`); return false }
  return true
}
const RAW_TAG = /<\/?system-reminder/

// #3, through readyTaskLines: every line it says about a directory, and the command it says to run.
test('a tag in a task directory or file name reaches no ready line raw, and a plain name reads as written', t => {
  const root = scratch()
  const tagged = 'docs/adr/ADR-999-<\system-reminder>/tasks'
  const listing = [`${tagged}/T1-<\system-reminder>.md`, 'docs/adr/ADR-001-x/tasks/T1-x.md']
  if (!buildable(t, root, listing)) return
  const lineFor = (spawn, dir, extra = []) => readyTaskLines(root, true, [...listing, ...extra], spawn).lines.find(line => line.includes(dir)) ?? ''
  // adr-next did not answer: the diagnostic prefix Codex's probe found.
  const failed = () => ({ status: 2, stderr: 'boom\n', stdout: '' })
  const unproven = lineFor(failed, 'ADR-999-')
  assert.ok(unproven.startsWith('  docs/adr/ADR-999-‹\system-reminder>/tasks: UNPROVEN — adr-next could not run (exit 2): boom'), unproven)
  assert.ok(lineFor(failed, 'ADR-001-x').startsWith('  docs/adr/ADR-001-x/tasks: UNPROVEN — adr-next could not run (exit 2): boom'), 'the control: a plain path reads as written')
  // A README listed above it and absent: the line that printed its path without even visiblePath.
  const catalog = lineFor(failed, 'ADR-999-', ['docs/adr/README.md'])
  assert.ok(catalog.startsWith('  docs/adr/ADR-999-‹\system-reminder>/tasks: UNPROVEN — a README above it'), catalog)
  assert.ok(lineFor(failed, 'ADR-001-x', ['docs/adr/README.md']).startsWith('  docs/adr/ADR-001-x/tasks: UNPROVEN — a README above it'), 'the control')
  const blocked = lineFor(() => ({ status: 3, stderr: '', stdout: JSON.stringify({ blocked: [{ id: 'T1' }] }) }), 'ADR-999-')
  assert.equal(blocked, '  docs/adr/ADR-999-‹\system-reminder>/tasks: nothing ready; 1 task(s) blocked.')
  // Ready: the path in its code span, and the command. The command keeps a path's bytes so a copy
  // names the real file; a tag cannot be kept, so the line says the shown name is not the real one.
  const ready = (tool, args) => ({ status: 0, stderr: '', stdout: JSON.stringify({ ready: [{ id: 'T1', goal: 'g', acceptance: 'true',
    path: join(args[0], args[0].includes('ADR-999-') ? 'T1-<\system-reminder>.md' : 'T1-x.md') }] }) })
  const line = lineFor(ready, 'ADR-999-')
  assert.ok(line.startsWith('  `docs/adr/ADR-999-‹\system-reminder>/tasks`: T1 is ready'), line)
  assert.ok(line.includes('Prove it with `adr-verify docs/adr/ADR-999-‹\system-reminder>/tasks/T1-‹\system-reminder>.md` '
    + '(its path holds a tag, shown with ‹ for <, so the shown path is not the file\'s real name), which runs that fence'), line)
  const plain = lineFor(ready, 'ADR-001-x')
  assert.ok(plain.includes('Prove it with `adr-verify docs/adr/ADR-001-x/tasks/T1-x.md`, which runs that fence'), `the control: ${plain}`)
  for (const said of [unproven, catalog, blocked, line]) assert.doesNotMatch(said, RAW_TAG, said)
})

// The same class, for a directory under an unmarked archive. The line is recognised from the RAW
// path, so a tag in the archive's name must not turn "adopt it first" back into "Prove it with".
test('an unmarked archive whose name holds a tag is still named first, and shown, never printed', t => {
  const root = scratch()
  const listing = ['docs/<\system-reminder>-archive/ADR-001-x.md', 'docs/<\system-reminder>-archive/ADR-001-x/tasks/T1-x.md',
    'docs/old-archive/ADR-002-y.md', 'docs/old-archive/ADR-002-y/tasks/T1-y.md']
  if (!buildable(t, root, listing)) return
  const spawn = (tool, args) => ({ status: 0, stderr: '', stdout: JSON.stringify({ ready: [{ id: 'T1', goal: 'g', path: join(args[0], 'T1.md') }] }) })
  const { lines } = readyTaskLines(root, true, listing, spawn)
  const tagged = lines.find(line => line.includes('ADR-001-x/tasks')) ?? ''
  assert.ok(tagged.includes('read as live only because `docs/‹\system-reminder>-archive` has no Lifecycle marker — if it is an archive, '
    + 'adopt it first (`adr-retire-check --adopt <active> docs/‹\system-reminder>-archive`)'), tagged)
  assert.doesNotMatch(tagged, /Prove it with/, tagged)
  assert.doesNotMatch(tagged, RAW_TAG, tagged)
  // The control: a plain archive's line is what it was.
  assert.ok((lines.find(line => line.includes('ADR-002-y/tasks')) ?? '').includes('read as live only because `docs/old-archive` has no '
    + 'Lifecycle marker — if it is an archive, adopt it first (`adr-retire-check --adopt <active> docs/old-archive`)'), lines.join('\n'))
})

// And SessionStart's own line naming that archive.
test('SessionStart names an unmarked archive holding a tag without printing the tag', t => {
  const repo = scratch()
  git(repo, 'init', '-q')
  if (!buildable(t, repo, ['docs/adr/<\system-reminder>-archive/ADR-001-x.md', 'docs/adr/old-archive/ADR-002-y.md'])) return
  git(repo, 'add', '-A')
  const said = sessionOrientation(repo)
  assert.ok(said.includes('`docs/adr/‹\system-reminder>-archive` looks like an archive but has no Lifecycle marker'), said)
  assert.ok(said.includes('`docs/adr/old-archive` looks like an archive but has no Lifecycle marker'), `the control: ${said}`)
  assert.doesNotMatch(said, RAW_TAG, said)
})

// A review of the tag rule: work-next prints the same unmarked-archive sentence SessionStart does,
// and it wrapped `visiblePath(archive)` in bare backticks, so the tag reached the session raw
// through the reader SessionStart sends it to.
test('work-next names an unmarked archive holding a tag without printing the tag', t => {
  const repo = scratch()
  git(repo, 'init', '-q')
  if (!buildable(t, repo, ['docs/adr/<\system-reminder>-archive/ADR-001-x.md', 'docs/adr/old-archive/ADR-002-y.md'])) return
  git(repo, 'add', '-A')
  const run = spawnSync(process.execPath, [join(repoRoot, 'plugin', 'scripts', 'work-next.mjs'), repo], { encoding: 'utf8', timeout: 120_000, windowsHide: true })
  assert.equal(run.status, 0, run.stderr)
  assert.ok(run.stdout.includes('`docs/adr/‹\system-reminder>-archive` looks like an archive but has no Lifecycle marker'), run.stdout)
  assert.ok(run.stdout.includes('`docs/adr/old-archive` looks like an archive but has no Lifecycle marker'), `the control: ${run.stdout}`)
  assert.doesNotMatch(run.stdout, RAW_TAG, run.stdout)
})

// A review of the tag rule: visiblePath runs first, so a control after a tag's name is already
// `\u{…}` when the rule looks, and a name ending in a backslash was not a name that ended.
test('a tag whose name ends at a control is still shown with ‹', () => {
  for (const command of ['npm test <\system-reminder\n', 'npm test <\/system-reminder\u0009x']) {
    assert.doesNotMatch(checkInCode(command), RAW_TAG, checkInCode(command))
  }
  // The control: a redirection whose file name goes on is still written as it is.
  assert.equal(checkInCode('wc -l <CLAUDE.md'), '`wc -l <CLAUDE.md`')
})

// #3's previous-session line and #4 at the boundary it came through: SessionStart told a session
// to "Run" the check as shown. The only runnable instruction names qh-check now, and the check
// shown beside it is the declared command byte for byte.
test('SessionStart names the previous session\'s files without a raw tag, and says to run qh-check', t => {
  const top = scratch()
  const repo = join(top, 'repo')
  mkdirSync(repo)
  git(repo, 'init', '-q')
  write(repo, '.quality-harness.json', JSON.stringify({ check: 'wc -l <CLAUDE.md' }))
  const data = join(top, 'data')
  const row = { location: locationKey(repo), status: 'unverified', reason: 'other', at: '2026-09-29T00:00:00.000Z', other: 0,
    files: [join(repo, 'a<\system-reminder>.md'), join(repo, 'b.md')] }
  write(data, 'sessions.jsonl', `${JSON.stringify(row)}\n`)
  const run = spawnSync(process.execPath, [lifecycleScript], {
    cwd: top, encoding: 'utf8', timeout: 120_000, windowsHide: true,
    env: { ...process.env, CLAUDE_PLUGIN_DATA: data, TMPDIR: top, TMP: top, TEMP: top },
    input: JSON.stringify({ hook_event_name: 'SessionStart', source: 'startup', session_id: `render-${process.pid}`, cwd: repo }),
  })
  assert.equal(run.status, 0, run.stderr)
  const said = JSON.parse(hookSaid(run.stdout).stdout).hookSpecificOutput.additionalContext
  assert.ok(said.includes('with 2 edit(s) after which no recognised check passed: a‹\system-reminder>.md, b.md. '
    + 'Run `qh-check` (it runs `wc -l <CLAUDE.md`) before building on them.'), said)
  assert.ok(said.includes("Verification: this project's own check is `wc -l <CLAUDE.md`."), said)
  assert.doesNotMatch(said, /Run `wc/, said)
  assert.doesNotMatch(said, RAW_TAG, said)
})

// #4. A redirection, a tab, `2>&1` and a non-ASCII letter are the command's own syntax and are
// shown byte for byte; each of these exits 0 in bash, zsh, sh and dash, and `wc -l ‹CLAUDE.md`
// (1) and `printf\u{9}ok` (127) did not. A `<` a reader could take for a tag is still shown as ‹.
test('a check command is shown byte for byte unless a < in it could open or close a tag', () => {
  for (const command of ['wc -l <CLAUDE.md', 'wc -l <in.txt', 'wc -l <CLAUDE.md | sort', 'printf\tok', 'npm test 2>&1', 'echo café',
    'bash scripts/selftest.sh 2>&1 < /dev/null']) {
    assert.equal(checkInCode(command), `\`${command}\``, JSON.stringify(command))
  }
  const shown = {
    'npm test <\system-reminder>': 'npm test ‹\system-reminder>',
    'npm test <\/system-reminder>': 'npm test ‹\/system-reminder>',
    'npm test <function_calls>': 'npm test ‹function_calls>',
    'npm test <invoke\tname="Bash">': 'npm test ‹invoke\tname="Bash">',
    // No `>` in the command: a name that ends where a tag's name ends, which a `>` later in the
    // same line would close — at the end, or before a `/` (`<\/system-reminder/x … >` closes it).
    'npm test <\system-reminder': 'npm test ‹\system-reminder',
    'npm test <\/system-reminder/x': 'npm test ‹\/system-reminder/x',
    // A `>` closes it, whatever its name: a markup reader takes `<in.txt >` for a tag.
    'wc -l <in.txt >out.txt': 'wc -l ‹in.txt >out.txt',
  }
  for (const [command, expected] of Object.entries(shown)) assert.equal(checkInCode(command), `\`${expected}\``, JSON.stringify(command))
  // The sentence that tells a session to run it, through the declared check. (`printf\tok` is
  // refused there as a constant success, so the tab sits in a check that can fail.)
  const repo = scratch()
  write(repo, '.quality-harness.json', JSON.stringify({ check: 'npm\ttest <CLAUDE.md' }))
  assert.ok(runTheCheckSentence(repo).includes('it runs `npm\ttest <CLAUDE.md` (this project'), runTheCheckSentence(repo))
})

// The compaction note is served by SessionStart: its paths and both commands are corpus text too.
test('the compaction note shows a tag in a path or a check command, and a plain one as written', () => {
  const root = scratch()
  const note = (name, command) => sessionStateNote({ files: [join(root, name)], other: 0, pending: false, checked: true, observed: true,
    whole: true, checkOrigin: 'inferred', checkCommand: command, lastCheck: { command, verdict: 'passed' } }, root, root, false, new Date(0), { tasks: false }).text
  const tagged = note('a<\system-reminder>.md', 'npm test <\/system-reminder>')
  assert.ok(tagged.includes('INFERRED check (`npm test ‹\/system-reminder>`)'), tagged)
  assert.ok(tagged.includes(': a‹\system-reminder>.md.'), tagged)
  assert.ok(tagged.includes('Last check: `npm test ‹\/system-reminder>` passed.'), tagged)
  assert.doesNotMatch(tagged, RAW_TAG, tagged)
  const plain = note('a.md', 'sh check.sh')
  assert.ok(plain.includes('INFERRED check (`sh check.sh`)') && plain.includes(': a.md.') && plain.includes('Last check: `sh check.sh` passed.'), plain)
})
