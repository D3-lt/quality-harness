// A session whose git hook could not be armed is told so (BACKLOG §381, item 2).
//
// offerPublishHook records `publish.unarmed` when git is below 2.54, or when the env file cannot
// be read or written, and nothing said it: the agent went on believing a commit made inside a
// script was refused at the event, as it is in an armed session (ADR-066). Three Windows sessions
// on git 2.49 ran that way (BACKLOG §370). A host that offers no env file is not told: it has no
// Bash environment to arm. Driven through the real SessionStart hook; each case is shown said and
// not said.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import { delimiter, dirname, join, resolve } from 'node:path'
import test, { after } from 'node:test'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const plugin = join(repoRoot, 'plugin')
const top = realpathSync.native(mkdtempSync(join(os.tmpdir(), 'qh-unarmed-')))
after(() => rmSync(top, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }))
// No git or session variable reaches a fixture (CLAUDE.md §9).
const baseEnv = Object.fromEntries(Object.entries(process.env).filter(([name]) => !/^(?:GIT_|CLAUDE_|QUALITY_HARNESS_)/.test(name) && name !== 'NODE_TEST_CONTEXT'))
let made = 0

function start(extra) {
  const dir = join(top, `repo-${made}`)
  const tmp = join(top, `tmp-${made}`)
  const id = `unarmed-${made++}`
  for (const args of [['init', '-q', dir], ['-C', dir, 'commit', '-q', '--allow-empty', '-m', 'base']]) {
    const run = spawnSync('git', args, { encoding: 'utf8', timeout: 30_000, windowsHide: true, env: { ...baseEnv, GIT_AUTHOR_NAME: 'q', GIT_AUTHOR_EMAIL: 'q@x', GIT_COMMITTER_NAME: 'q', GIT_COMMITTER_EMAIL: 'q@x' } })
    assert.equal(run.status, 0, run.stderr)
  }
  mkdirSync(tmp, { recursive: true })
  return (source = 'startup') => {
    const run = spawnSync(process.execPath, [join(plugin, 'scripts', 'lifecycle.mjs')], {
      cwd: dir, encoding: 'utf8', timeout: 120_000, windowsHide: true,
      env: { ...baseEnv, CLAUDE_PLUGIN_ROOT: plugin, TMPDIR: tmp, TMP: tmp, TEMP: tmp, ...extra },
      input: JSON.stringify({ hook_event_name: 'SessionStart', source, session_id: id, cwd: dir }),
    })
    assert.equal(run.status, 0, run.stderr)
    const text = run.stdout.trim()
    return text.startsWith('{') ? JSON.parse(text).hookSpecificOutput?.additionalContext ?? '' : ''
  }
}

// A git below 2.54, as the hook's probe sees one: `hook list` is not a command it has.
function oldGit() {
  const real = spawnSync('sh', ['-c', 'command -v git'], { encoding: 'utf8', timeout: 10_000, windowsHide: true }).stdout.trim()
  const bin = join(top, `old-git-${made}`)
  mkdirSync(bin, { recursive: true })
  writeFileSync(join(bin, 'git'), `#!/bin/sh\ncase " $* " in *" hook list "*) echo "git: 'hook' is not a git command." >&2; exit 1;; esac\nexec '${real}' "$@"\n`)
  chmodSync(join(bin, 'git'), 0o755)
  return `${bin}${delimiter}${process.env.PATH}`
}
const envFile = () => { const file = join(top, `env-${made}`); writeFileSync(file, ''); return file }
const UNARMED = /git's own refusal of an unchecked commit or push is not armed in this session \(git here does not list a config-based hook/

test('a session git could not arm is told why, once per repository; an armed one and a host with no env file are not', { skip: 'ADR-130: compulsory check policy retired' }, () => {
  const say = start({ CLAUDE_ENV_FILE: envFile(), PATH: oldGit() })
  assert.match(say(), UNARMED)
  // ADR-122 Decision 8: a start is a new context, so it is told again; a resume that shows no request evidence keeps the
  // once-per-repository mark (CLAUDE.md §19).
  assert.match(say(), UNARMED, 'a second start is a new context')
  assert.doesNotMatch(say('resume'), /is not armed in this session/)
  // A host that offers no env file has no Bash environment to arm: not said.
  assert.doesNotMatch(start({})(), /is not armed in this session/)
  // CLEAN twin: the real git (2.54 or later) arms it, and nothing is said.
  const probe = spawnSync('git', ['-c', 'hook.qhprobe.command=true', '-c', 'hook.qhprobe.event=pre-commit', 'hook', 'list', 'pre-commit'], { encoding: 'utf8', timeout: 10_000, windowsHide: true })
  if (probe.status === 0 && /qhprobe/.test(probe.stdout)) assert.doesNotMatch(start({ CLAUDE_ENV_FILE: envFile() })(), /is not armed in this session/)
})
