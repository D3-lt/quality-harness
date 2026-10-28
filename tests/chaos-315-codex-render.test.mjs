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

// The previous-session notice keeps file names safe to render and reports state without demanding a check (ADR-130).
test('SessionStart names the previous session\'s files without a raw tag, and keeps checks optional', t => {
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
    + 'Checks are optional; this notice describes the previous session’s recorded state.'), said)
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
