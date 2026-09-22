// The one line a person sees says what was found.
//
// At PreToolUse the advisory's full text goes to the AGENT as additionalContext,
// and the person gets a single headline. `advisoryHeadline` took "the first
// sentence" by splitting after a `.` or `:` — and every advisory begins
// `quality-harness: `. So the headline was always the bare prefix:
//
//   quality-harness advised the agent: quality-harness: (full text in the transcript)
//
// A finding was made and the person was told nothing about it. Two peer sessions
// flagged that line independently on 2026-09-19, reading transcripts from their
// own repositories. Three tests here already matched `/^quality-harness advised
// the agent: /` — the PREFIX — and none looked at what followed it.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { appendFileSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const lifecycleScript = join(resolve(dirname(fileURLToPath(import.meta.url)), '..'), 'plugin', 'scripts', 'lifecycle.mjs')
const IDENTITY = { GIT_AUTHOR_NAME: 'qh', GIT_AUTHOR_EMAIL: 'qh@example.invalid',
  GIT_COMMITTER_NAME: 'qh', GIT_COMMITTER_EMAIL: 'qh@example.invalid' }

test('the headline a person sees at a publish warning names the finding', () => {
  const top = realpathSync.native(mkdtempSync(join(tmpdir(), 'qh-headline-')))
  try {
    const repo = join(top, 'repo')
    const env = { ...process.env, ...IDENTITY, CLAUDE_PLUGIN_DATA: join(top, 'data'), TMPDIR: top, TMP: top, TEMP: top }
    const run = (command, args, options = {}) => {
      const out = spawnSync(command, args, { encoding: 'utf8', timeout: 120_000, env, ...options })
      assert.equal(out.status, 0, `${command} ${args.join(' ')}: ${out.stderr}`)
      return out
    }
    const git = (...args) => run('git', ['-C', repo, ...args])
    const hook = payload => run(process.execPath, [lifecycleScript], { cwd: top, input: JSON.stringify(payload) })
    run('mkdir', ['-p', repo])
    git('init', '-q')
    writeFileSync(join(repo, 'a.md'), 'a\n')
    writeFileSync(join(repo, '.quality-harness.json'), JSON.stringify({ check: 'sh check.sh' }))
    git('add', '-A')
    git('commit', '-q', '-m', 'base')
    const session = `headline-${process.pid}`
    hook({ hook_event_name: 'SessionStart', source: 'startup', session_id: session, cwd: repo })
    writeFileSync(join(repo, 'a.md'), 'changed\n')
    // A whole log refuses this command. The headline is what a warning still uses,
    // so the log here is one that could not be read whole.
    appendFileSync(join(repo, '.git', 'quality-harness', 'sessions', `${session}.jsonl`), '{"event":"check.failed","rec')
    const out = hook({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'git commit -am x' }, session_id: session, cwd: repo })
    const said = JSON.parse(out.stdout.trim().split('\n').filter(Boolean).at(-1))
    // The control: the agent really was given the finding, so this is about the
    // person's line and not about a hook that stayed quiet.
    assert.match(said.hookSpecificOutput?.additionalContext ?? '', /whether this repository is checked is unknown/)
    const headline = said.systemMessage ?? ''
    assert.match(headline, /^quality-harness advised the agent: /)
    assert.match(headline, /unknown/, `the person's line must say WHAT was found: ${headline}`)
    assert.doesNotMatch(headline, /advised the agent: quality-harness:/, `and must not be the prefix repeated: ${headline}`)
    // ONE line for the person, the report for the agent: a twelve-line report
    // rendered as twelve "PreToolUse:Bash says:" lines in the owner's terminal is
    // why the two channels were split (2026-09-05).
    assert.doesNotMatch(headline, /Run `qh-check` first/, `the person's line is a headline, not the instruction: ${headline}`)
    assert.match(said.hookSpecificOutput.additionalContext, /Run `qh-check` first/, 'the instruction is where the agent reads')
    // And the finding is on stderr too, so it survives in the transcript whatever
    // the host does with the JSON — a finding in one channel only can be hidden.
    assert.match(out.stderr, /whether this repository is checked is unknown/, 'never hidden: the full text is also on stderr')
    assert.notEqual(said.hookSpecificOutput?.permissionDecision, 'deny')
  } finally { rmSync(top, { recursive: true, force: true }) }
})
