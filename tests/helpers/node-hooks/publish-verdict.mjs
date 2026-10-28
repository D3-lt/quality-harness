// Shell recognition for artifact gates, the reviewer read-only guard, commit tracking, and reviewer state reports.
// Project-check publishing policy was retired by ADR-130.
import { decodedPowerShell, publishCommandIn, withoutSinkBodies } from './publish-command.mjs'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { appendEvent, nearestExistingDirectory, readEvents } from '../../../plugin/scripts/event-log.mjs'
import { appendFileSync, readFileSync, realpathSync } from 'node:fs'
import path from 'node:path'
import { gitLines, gitRepositoryLookup, sameObservation } from './tree-facts.mjs'
import { queueAction } from './hook-queue.mjs'

// The roles that say "never edits". Read from the agent type the hook payload
// carries inside a subagent, with or without the plugin namespace. A test holds
// this list to the agents' own frontmatter.
// The read-only verdict itself (BACKLOG §135). It lives HERE, not in
// reviewer-guard.mjs, because that file imports this one: a dynamic import of it
// from inside handleHook deadlocked on the ESM cycle while this module was the
// entry with a top-level await pending (Node: "unsettled top-level await").
// ADR-113 T2: mrw's MCP write is an edit like any other; without it here a read-only role wrote through it unchallenged.
const READ_ONLY_EDITING_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit', 'mcp__mrw__mrw_write'])

/** A proven invocation — the only thing that may be refused. */
export function containsCommitOrPush(command) {
  return publishCommandIn(command) !== null
}

// The ADVISORY arm: the words as words (not `pre-commit`, not `records.push`).
// Everything the precise arm misses and this sees is warned about, never refused.
// PowerShell's backtick escape and an `-EncodedCommand` payload hid the word from it
// (`git comm`it`, a Windows chaos round of 626934a), so it reads both spellings too.
const PUBLISH_MENTION = /(?<![A-Za-z0-9_.-])(?:commit|push)(?![A-Za-z0-9_-])/

// ADR-120 T13: `git stash push` is a stash, not a push. The words after `git` may carry its options (`-C dir`, `-c k=v`, `--flag`),
// and the same rule is core/hooks/publish.go's `withoutStashPush`. Repeated until nothing changes, since two of them share a boundary.
const STASH_PUSH = /(^|[^A-Za-z0-9_.-])git(?:[ \t]+(?:-[Cc][ \t]+[^ \t\r\n]+|--[A-Za-z][A-Za-z-]*(?:=[^ \t\r\n]+)?|-[A-Za-z]))*[ \t]+stash[ \t]+push($|[^A-Za-z0-9_-])/g
function withoutStashPush(text) {
  for (let before = text; ; before = text) {
    text = text.replace(STASH_PUSH, '$1git stash$2')
    if (text === before) return text
  }
}

export function mentionsCommitOrPush(given) {
  if (typeof given !== 'string') return false
  // A quoted here-document that only `cat`, `tee` or `mrw write` reads is data, not words (BACKLOG §381).
  const command = withoutSinkBodies(given)
  // Split on what a base64 word cannot hold, rather than match the word: a greedy
  // match over one multi-megabyte word overflowed V8's regex stack and crashed the
  // hook before Rule P was read (a Windows chaos round of 916b515, F7). The words are
  // the same runs, and a missing `=` pad decodes to the same bytes.
  const decoded = command.split(/[^A-Za-z0-9+/]+/).filter(word => word.length >= 8).map(decodedPowerShell)
  return [command, command.replace(/`(.)/gs, '$1'), ...decoded].some(text => PUBLISH_MENTION.test(withoutStashPush(text)))
}

// The shell tools a session runs commands through. Claude Code on Windows ships a
// PowerShell tool beside Bash, and every check here read `tool_name === 'Bash'`, so a
// `git push` through it was never refused and never denied to a read-only role (a
// Windows chaos round, 2.111.0-rc, P1). `hooks.json` routes it here too.
export const SHELL_TOOLS = new Set(['Bash', 'PowerShell'])

export function readOnlyVerdict(input) {
  const tool = input?.tool_name
  if (READ_ONLY_EDITING_TOOLS.has(tool)) {
    return `This role is read-only: ${tool} is not available to it. Report the change you would make; do not make it.`
  }
  if (!SHELL_TOOLS.has(tool)) return null
  const command = input?.tool_input?.command
  if (!containsCommitOrPush(command)) return null
  return 'This role is read-only: a command naming commit or push is not available to it. Name the commit you would make in the review. Any other change you make is reported when you finish.'
}

export const READ_ONLY_ROLES = ['qh-correctness-reviewer', 'qh-scope-reviewer', 'qh-synthesis']

export function readOnlyRole(agentType) {
  if (typeof agentType !== 'string') return null
  const bare = agentType.replace(/^quality-harness:/, '')
  return READ_ONLY_ROLES.includes(bare) ? bare : null
}

// SessionStart offers post-commit tracking through the host env file (ADR-128, ADR-130).
// A config hook is offered only where git lists it; older git keeps the rest of the session usable.
const PUBLISH_HOOK_SCRIPT = fileURLToPath(new URL('../../../plugin/scripts/publish-hook.mjs', import.meta.url))
// ADR-120 T4: the copy this session's hooks run, named to every forwarder the session's shell starts, so an older writer
// and a newer hook no longer meet (BACKLOG section 389). Its own line, ahead of and apart from the git block below.
const PLUGIN_ROOT = path.resolve(fileURLToPath(new URL('../../../plugin', import.meta.url)))

/** The POSIX shell line that names the plugin copy for the session's shell. Forward slashes, as git's block does. */
export const pluginRootExport = (root = PLUGIN_ROOT) => `export QH_PLUGIN_ROOT='${String(root).replace(/\\/g, '/').replace(/'/g, `'\\''`)}'\n`

/** The POSIX shell lines that add the hook for a session, after any GIT_CONFIG_* already in force. */
export function publishHookExports(node = process.execPath, script = PUBLISH_HOOK_SCRIPT) {
  const quote = value => `'${String(value).replace(/'/g, `'\\''`)}'`
  // Forward slashes: git runs the command through sh, including Git for Windows.
  // Single quotes inside the stored command: git runs it through sh, and double
  // quotes left a `$` or a backtick in the installation path to be expanded (Codex
  // review of 3.0.0). Forward slashes, because Git for Windows runs it through sh too.
  const single = value => `'${String(value).replace(/\\/g, '/').replace(/'/g, `'\\''`)}'`
  // ⚠ git REFUSES the commit when a hook command cannot start, and these exports reach
  // every repository the shell touches: a baked node that `brew upgrade` removed made
  // git refuse every commit and push on the machine (a corpus-chaos run of 916b515,
  // ts-generator LEAD 1). So the node on PATH stands in for a moved one, and a
  // missing script is could-not-look, which refuses nothing (ADR-005) and says so.
  // `exec` comes last: git appends its own arguments to the end of the command.
  const run = event => `n=${single(node)}; [ -x "$n" ] || n=$(command -v node) || n=; `
    + `[ -n "$n" ] && [ -f ${single(script)} ] || { echo "quality-harness: git's publish hook could not start `
    + `(node or its script is gone), so this ${event} was not judged" >&2; exit 0; }; exec "$n" ${single(script)} ${event}`
  const entries = [
    // ADR-128 T2: the sha of each commit git makes for this session, which the branch-state brief reads. It refuses nothing.
    ['hook.qh-commit-made.command', run('post-commit')],
    ['hook.qh-commit-made.event', 'post-commit'],
    ['hook.qh-commit-made.enabled', 'true'],
  ]
  // The index is taken WHEN THE FILE IS SOURCED, not when it is written: another
  // SessionStart hook or the user's profile may have set GIT_CONFIG_COUNT since.
  return ['# quality-harness: record commits made by this session; checks are optional (ADR-130)',
    '__qh_n=${GIT_CONFIG_COUNT:-0}',
    ...entries.map(([key, value], i) => `__qh_k=$((__qh_n + ${i})); export GIT_CONFIG_KEY_$__qh_k=${quote(key)} GIT_CONFIG_VALUE_$__qh_k=${quote(value)}`),
    `export GIT_CONFIG_COUNT=$((__qh_n + ${entries.length}))`,
    'unset __qh_n __qh_k', ''].join('\n')
}


/**
 * Name this session's plugin copy in the env file, once per file by the line's own text (ADR-120 T4). Apart from
 * `offerPublishHook` on purpose: a git that lists no config hook, or an older git block already in the file, must not skip
 * it. Silent where the file is unset or unreadable, which `offerPublishHook` records.
 */
export function offerPluginRoot({ cwd, session, env = process.env, rootExport = pluginRootExport() }) {
  const file = env.CLAUDE_ENV_FILE
  if (typeof file !== 'string' || !file) return null
  let existing = ''
  try { existing = readFileSync(file, 'utf8') } catch (error) {
    if (error?.code !== 'ENOENT') return null
  }
  if (existing.split('\n').includes(rootExport.trimEnd())) return null
  try { appendFileSync(file, rootExport) } catch (error) {
    return appendEvent(cwd, session, { event: 'publish.unarmed', reason: `the env file could not be written (${error?.code ?? error})` })
  }
  return null
}

/** Offer the hook for this session, and record what happened. */
export function offerPublishHook({ cwd, session, env = process.env, run = spawnSync, exports = publishHookExports }) {
  const record = entry => appendEvent(cwd, session, entry)
  const file = env.CLAUDE_ENV_FILE
  if (typeof file !== 'string' || !file) return record({ event: 'publish.unarmed', reason: 'CLAUDE_ENV_FILE is not set' })
  let existing = ''
  try { existing = readFileSync(file, 'utf8') } catch (error) {
    if (error?.code !== 'ENOENT') return record({ event: 'publish.unarmed', reason: `the env file could not be read (${error?.code ?? error})` })
  }
  // Once per env file: a resume or compact SessionStart must not add a second copy.
  if (existing.includes('hook.qh-commit-made.')) return null
  const probe = run('git', ['-c', 'hook.qhprobe.command=true', '-c', 'hook.qhprobe.event=pre-commit', 'hook', 'list', 'pre-commit'],
    { cwd, encoding: 'utf8', timeout: 10_000, windowsHide: true, env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' } })
  if (probe.error || probe.status !== 0 || !/\bqhprobe\b/.test(probe.stdout ?? '')) {
    const why = probe.error ? probe.error.code ?? probe.error.message : `exit ${probe.status}: ${String(probe.stderr ?? '').trim().split('\n')[0]}`
    return record({ event: 'publish.unarmed', reason: `git here does not list a config-based hook (${why}); git 2.54 or later runs them` })
  }
  try { appendFileSync(file, exports()) } catch (error) {
    return record({ event: 'publish.unarmed', reason: `the env file could not be written (${error?.code ?? error})` })
  }
  return record({ event: 'publish.offered' })
}


// ADR-104 Decision 2: the git directory a path's repository keeps, as git resolves it, after
// realpath, or null when git could not say: a probe that fails, times out or prints nothing
// proves nothing about repository ownership.
export function commonDirectory(dir, cwd, run = spawnSync) {
  const probe = run('git', ['-C', dir, 'rev-parse', '--path-format=absolute', '--git-common-dir'],
    { cwd, encoding: 'utf8', timeout: 10_000, windowsHide: true, env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' } })
  const printed = probe?.status === 0 && !probe.error ? String(probe.stdout ?? '').trim() : ''
  if (!printed) return null
  try { return realpathSync.native(printed) } catch { return null }
}

export function reviewChangedState(input, ended) {
  const role = readOnlyRole(input.agent_type)
  if (!role || ended?.event !== 'subagent.ended' || typeof input.agent_id !== 'string') return
  const log = readEvents(input.cwd, input.session_id)
  const started = log.filter(entry => entry.event === 'subagent.started' && entry.agentId === input.agent_id).at(-1)
  const before = started?.observation
  const after = ended.observation
  if (before?.ok !== true || after?.ok !== true) {
    // ⚠ A BRACKET THAT COULD NOT BE OBSERVED IS NOT A RUN WHERE NOTHING CHANGED.
    // This returned, under a comment elsewhere saying "an observation that could
    // not be made is R4's to report" — and a read-only role's end SKIPS the
    // completion rules, so R4 never runs here. A failed `git` at either end of a
    // review, or a torn `subagent.started` line (audit B5), was reported nowhere.
    // ONE arm for every way a bracket goes missing: the torn-log case had an arm of
    // its own above this one, and once this existed a mutant deleting that arm
    // survived in CI — this one answered for it. The torn line never repairs, so
    // each is said once per agent.
    const unobservedKey = `${input.agent_id}:unobserved`
    // Told-already is read from the action's DETAIL, not from the shape of its key.
    // A key is `<agent>:<word>` and an agent id is free text: honouring the old
    // arm's `<agent>:unknown` key silenced agent `a` because agent `a:unknown` had
    // a state-change finding on record (fourth review). A session upgraded mid-way
    // may therefore hear this once more — said twice is the direction to fail in.
    const told = entry => entry.detail?.kind === 'unobserved' && entry.detail.agent === input.agent_id
    if (!log.some(entry => entry.event === 'action.emitted' && entry.rule === 'R3' && told(entry))) {
      const why = !started
        // Only the session's own log can have lost where the run began; a torn `checks.jsonl` cannot.
        ? (log?.complete !== true
          ? 'this session\'s event log could not be read whole, and the record of where that run began may be among what was lost'
          : 'where that run began was never recorded')
        : before?.ok !== true ? `the repository could not be observed when it began (${before?.reason ?? 'no reason was recorded'})`
          : `the repository could not be observed when it ended (${after?.reason ?? 'no reason was recorded'})`
      queueAction({ rule: 'R3', key: unobservedKey, detail: { kind: 'unobserved', agent: input.agent_id }, text: `quality-harness: whether the repository changed during the ${role} `
        + `run (agent ${input.agent_id}) is unknown — ${why}. That is a statement about what could be looked at, not about `
        + 'the review (ADR-005).' })
    }
    return
  }
  if (sameObservation(before, after)) return
  const key = input.agent_id
  if (log.some(entry => entry.event === 'action.emitted' && entry.rule === 'R3' && entry.key === key && entry.detail?.kind !== 'unobserved')) return
  const directory = nearestExistingDirectory(path.resolve(input.cwd))
  const found = directory ? gitRepositoryLookup(directory) : { ok: false, root: null, reason: 'no directory' }
  if (!found.ok) {
    const rootKey = `${key}:root`
    if (!log.some(entry => entry.event === 'action.emitted' && entry.rule === 'R3' && entry.key === rootKey)) {
      queueAction({ rule: 'R3', key: rootKey, text: `quality-harness: whether the repository changed during the ${role} run (agent ${key}) is unknown — the repository root could not be read (${found.reason}). That is a statement about what could be looked at, not about the review (ADR-005).` })
    }
    return
  }
  const root = found.root
  if (!root) return
  const status = gitLines(root, ['-c', 'core.quotePath=false', 'status', '--porcelain'])
  const staged = gitLines(root, ['-c', 'core.quotePath=false', 'diff', '--cached', '--name-only'])
  const commits = before.head && after.head && before.head !== after.head
    ? gitLines(root, ['rev-list', '--oneline', `${before.head}..${after.head}`]) : []
  const lines = [`quality-harness: the repository's state changed during the ${role} run (agent ${key}). `
    + 'This says what changed during that run, not who changed it.']
  if (status.length) lines.push(`Working tree now:\n${status.map(line => `  ${line}`).join('\n')}`)
  if (staged.length) lines.push(`Staged now:\n${staged.map(line => `  ${line}`).join('\n')}`)
  if (commits.length) lines.push(`New commits:\n${commits.map(line => `  ${line}`).join('\n')}`)
  queueAction({ rule: 'R3', key, text: lines.join('\n') })
}
