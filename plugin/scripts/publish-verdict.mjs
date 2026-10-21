// Whether a command that would publish may go: the verdict on a commit or a push against the checks that passed on this
// tree (ADR-061, ADR-081), the reviewer guard for a role spawned read-only (ADR-060), and the offer of git's own hook
// (ADR-066). Moved out of lifecycle.mjs unchanged (BACKLOG section 375, stage B3). A refusal needs evidence; a command
// that is only mentioned is warned about, never refused (CLAUDE.md section 3).
import { commitOnlyCommand, decodedPowerShell, foreignCommitPath, freshRepositoryCommit, leavesHookInPlace, publishCommandIn, stagesBeforeCommit, withoutSinkBodies } from './publish-command.mjs'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { appendEvent, nearestExistingDirectory, readEvents } from './event-log.mjs'
import { appendFileSync, readFileSync, realpathSync } from 'node:fs'
import path from 'node:path'
import { gitLines, gitRepositoryLookup, sameObservation, sessionBaseline } from './tree-facts.mjs'
import { checkCommandOrigin, inferredCheckCaveat, publishSetting, publishSettingNote } from './check-command.mjs'
import { carryFor, checkRevision, checkStanding, lateBaselineAllowed, latestFastPass, ledgerBoundLog, logIncomplete, tornRecord } from './check-ledger.mjs'
import { queueAction } from './hook-queue.mjs'
import { once } from './lazily.mjs'
import { proseOnlySincePass } from './prose-hint.mjs'

// ADR-120 T9: said once per tree, on a refusal whose unchecked work is text documents alone and whose project declares no `prose`.
const PROSE_SETTING_HINT = ' The work since the last full pass is to text documents alone: if this project\'s check reads none of them, a "prose": [...] list '
  + 'in .quality-harness.json lets a later change to them alone stand on a pass (the project owner\'s declaration, ADR-120).'

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

// P `publish-unchecked` (ADR-060): before a command naming commit or push runs,
// when the tree or the index is unchecked and differs from the session's start.
// It says the command is about to run while this repository is unchecked; it
// does not claim the command publishes this repository, which it may not.
// ── ADR-066 T2: SessionStart offers git the publish hook ────────────────────
//
// Through the env file the host sources before every Bash call, so nothing is
// written into any repository. It is an OFFER, not arming: a session counts as
// armed only once the hook itself has run (`publish.hook-ran`, T1). A shell that
// never sourced the file, a git below 2.54 and a different git on PATH would
// otherwise be recorded as protected while nothing ran (ADR-066 review, P1).
//
// Two hook names, not one: git appends its own arguments to a config hook's
// command but does not say which event it is running, so each command names its
// event. `enabled=true` is exported too, because configuration from the
// environment outranks a repository's own file — a repo-local `enabled false`
// does not switch it off (measured 2026-09-26).
const PUBLISH_HOOK_SCRIPT = fileURLToPath(new URL('./publish-hook.mjs', import.meta.url))
// ADR-120 T4: the copy this session's hooks run, named to every forwarder the session's shell starts, so an older writer
// and a newer hook no longer meet (BACKLOG section 389). Its own line, ahead of and apart from the git block below.
const PLUGIN_ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)))

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
    ['hook.qh-publish-commit.command', run('prepare-commit-msg')],
    ['hook.qh-publish-commit.event', 'prepare-commit-msg'],
    ['hook.qh-publish-commit.enabled', 'true'],
    ['hook.qh-publish-push.command', run('pre-push')],
    ['hook.qh-publish-push.event', 'pre-push'],
    ['hook.qh-publish-push.enabled', 'true'],
  ]
  // The index is taken WHEN THE FILE IS SOURCED, not when it is written: another
  // SessionStart hook or the user's profile may have set GIT_CONFIG_COUNT since.
  return ['# quality-harness (ADR-066): git refuses an unchecked commit or push for this session',
    '__qh_n=${GIT_CONFIG_COUNT:-0}',
    ...entries.map(([key, value], i) => `__qh_k=$((__qh_n + ${i})); export GIT_CONFIG_KEY_$__qh_k=${quote(key)} GIT_CONFIG_VALUE_$__qh_k=${quote(value)}`),
    `export GIT_CONFIG_COUNT=$((__qh_n + ${entries.length}))`,
    'unset __qh_n __qh_k', ''].join('\n')
}

// The session was offered git's hook and no hook run has followed the latest offer.
export function awaitingArming(events) {
  const offered = events.map(entry => entry.event).lastIndexOf('publish.offered')
  return offered >= 0 && !events.slice(offered + 1).some(entry => entry.event === 'publish.hook-ran')
}

// Armed: git's hook has run since the latest offer. A run from before it says nothing about
// the shell a command now runs in, since a new env file reaches Bash only from the next user
// prompt (ADR-068 T2; the ADR-098 Follow-up).
function armedByGit(events) {
  return !awaitingArming(events) && events.some(entry => entry.event === 'publish.hook-ran')
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
  if (existing.includes('hook.qh-publish-')) return null
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

/**
 * Rule P's decision, for both of its callers (ADR-066 T1): PreToolUse, which sees
 * a command's text, and `publish-hook.mjs`, which git runs at the event itself.
 * `invoked` is the invocation the caller PROVED — the matched text, or the git
 * event — and null for a mention, which is never refused. Returns null when there
 * is nothing to say, else `{ deny, key, detail, text }`.
 */
export function publishVerdict({ cwd, session, observation, invoked, commitOnly = false, stagesFirst = false }) {
  return publishJudgement(publishFacts({ cwd, session, observation }), { invoked, commitOnly, stagesFirst })
}

/**
 * What the verdict reads from the world (BACKLOG section 375, stage C). Each field is read when the judgement first asks for
 * it and at most once, in the order the judgement asks, so a decision that stops early (a project with no check, a tree that
 * could not be observed) reads no more than it did before the split. A test hands the judgement a plain object of the same
 * shape and needs no repository.
 */
export function publishFacts({ cwd, session, observation }) {
  // ONE root lookup for this decision: the check and the opt-out are read from
  // the same answer, so they cannot disagree about which project this is.
  const found = once(() => {
    const place = nearestExistingDirectory(path.resolve(cwd))
    return place ? gitRepositoryLookup(place) : { ok: false, root: null, reason: 'the working directory does not exist' }
  })
  const fastPasses = new Map()
  return {
    observation,
    origin: once(() => checkCommandOrigin(cwd, found())),
    setting: once(() => publishSetting(cwd, found())),
    ledger: once(() => ledgerBoundLog(cwd, readEvents(cwd, session))),
    caveat: once(() => inferredCheckCaveat(cwd)),
    lateBaselineAllowed: (log, now) => lateBaselineAllowed(log, cwd, now),
    // ADR-120 T9: the facts that need git or a file, so the judgement stays a function of what it is handed.
    carry: (log, codeTree, prose) => carryFor(log, found().root ?? cwd, codeTree, prose),
    proseOnly: once(() => proseOnlySincePass(found().root, checkCommandOrigin(cwd, found()).command)),
    fastPass: tree => {
      if (!fastPasses.has(tree)) fastPasses.set(tree, latestFastPass(cwd, tree, found().root ?? cwd))
      return fastPasses.get(tree)
    },
  }
}

/**
 * Rule P's decision as a function of its facts and of what the caller proved about the command. It reaches no file, process,
 * clock or environment of its own (tests/pure-judges.test.mjs holds that), so what it may refuse is a table over facts and
 * tests/publish-judgement.test.mjs walks that table.
 */
export function publishJudgement(facts, { invoked, commitOnly = false, stagesFirst = false }) {
  const origin = facts.origin()
  if (!origin.command && origin.origin !== 'refused' && origin.origin !== 'unproven' && origin.origin !== 'unreadable') return null
  const observation = facts.observation
  // ⚠ A TREE THAT COULD NOT BE OBSERVED IS SAID, NEVER PASSED IN SILENCE. This
  // returned null before anything was said, so where git outran observe()'s budget an
  // unchecked commit met neither a refusal nor a word, from PreToolUse or from git's
  // own hook (reproduced with a slow git, BACKLOG §314). A state nobody could read is
  // advice, never a refusal (CLAUDE.md §16), and the sentence names the look that failed.
  if (observation?.ok !== true) {
    const reason = observation?.reason ?? 'no observation was made'
    return {
      deny: false, unobserved: true, key: `unobserved:${reason}`, detail: { reason },
      text: `quality-harness: whether this repository is checked is unknown — its working tree could not be observed (${reason}) — and the command `
        + (invoked !== null
          ? `about to run names commit or push (\`${invoked}\`). Nothing is refused on a state that could not be read. Run \`qh-check\` before publishing; on a slow host, QUALITY_HARNESS_OBSERVE_BUDGET_MS raises the 5s budget.`
          : 'about to run only mentions commit or push. Advisory; nothing is refused.')
        + facts.caveat(),
    }
  }
  const now = observation
  // ADR-088 T2: only check events `checks.jsonl` holds can clear the refusal. A ledger not read
  // whole is could-not-look here whoever imported it, as a `check.source-unreadable` would say.
  const bound = facts.ledger()
  const { dropped } = bound
  const log = bound.torn ? Object.assign([...bound.log, { event: 'check.source-unreadable' }], { complete: bound.log.complete }) : bound.log
  // A start that could not look, judged by git's own hook, which prepares no late baseline:
  // the rule recordHookEvent adopts by, applied without writing. Only where this log holds
  // that start, so a linked worktree's empty log is not handed one (ADR-068).
  const baseline = sessionBaseline(log)?.observation
    ?? (log.some(entry => entry.event === 'session.started') && facts.lateBaselineAllowed(log, now) ? now : undefined)
  // ADR-120 T9: a pass stands for the tree asked about when only the declared prose differs from the tree it was taken on:
  // each of the tree and the index is asked with its own code tree, never the other's.
  const carryOf = codeTree => (facts.carry ? facts.carry(log, codeTree, now.prose) : null)
  const treeStanding = checkStanding(log, now.tree, carryOf(now.codeTree))
  const indexStanding = checkStanding(log, now.index, carryOf(now.indexCodeTree))
  const treeUnchecked = treeStanding !== 'passed' && (baseline?.ok !== true || now.tree !== baseline.tree)
  const indexUnchecked = indexStanding !== 'passed' && (baseline?.ok !== true || now.index !== baseline.index)
  const revision = checkRevision(log, now.tree)
  // A record that could not be read whole is a state of its own: advice already given on this tree
  // must not swallow the could-not-look advice that follows it (a review of 8fe4fa8).
  const key = `${now.tree}:${now.index}:${revision}${logIncomplete(log) ? ':unknown' : ''}`
  if (!treeUnchecked && !indexUnchecked) {
    // ⚠ A TREE AND INDEX EQUAL TO THE BASELINE NEED NO CHECK (ADR-061), BUT A RECORD NOT READ
    // WHOLE IS STILL SAID. This returned null whatever the ledger held, so a torn `checks.jsonl`
    // went unsaid at every baseline-equal publish, from PreToolUse and from git's own hook alike
    // (ADR-088 Follow-ups). Advice, never a refusal: nothing here needs a check, and the record
    // that tore is what later verdicts on this repository will have to read.
    if (!logIncomplete(log)) return null
    return {
      deny: false, unknown: true, key, detail: { tree: now.tree, revision },
      text: `quality-harness: ${tornRecord(log, 'the session log')} could not be read whole, so what \`qh-check\` recorded here cannot be shown. The command `
        + (invoked !== null ? `about to run names commit or push (\`${invoked}\`)` : 'about to run only mentions commit or push')
        + ' on a working tree and index unchanged since the session started, which need no check, so nothing is refused. While that record stays torn, a publish of changed work here is advice, never refused (ADR-061).',
    }
  }
  // ⚠ THE TREE'S STANDING DECIDES THE REFUSAL, and only the tree's. An index whose
  // check could not look is a finding about the index; folding it in here let it
  // rescue a working tree that FAILED (Codex review round 2, 2026-09-22).
  const unordered = treeStanding === 'unresolved'
  const couldNotLook = treeStanding === 'could-not-look'
  const indexUnknown = indexStanding === 'unresolved' || indexStanding === 'could-not-look'
  // ⚠ ONLY THE TREE CAN REFUSE. A check runs on the working tree, and the index is
  // compared against those trees, so a staged change beside an untracked file
  // equals no checked tree and was denied after every pass (found live by a peer,
  // 2026-09-22). The index still warns: its exact bytes were never checked.
  // A project may opt out with `"publish": "warn"` (ADR-061 revision 3); the
  // warning below is then all it gets, on every attempt the dedupe allows.
  const setting = facts.setting()
  // Only a PROVEN invocation may be refused (CLAUDE.md §16: a block needs stronger
  // evidence than advice). A command that merely mentions the words is warned.
  // What would be refused but for the opt-out: git's hook warns of it at the event (BACKLOG §381).
  const refusable = treeUnchecked && !logIncomplete(log) && !unordered && !couldNotLook && origin.origin !== 'unproven' && invoked !== null
  const deny = refusable && !setting.warn
  // ADR-081: a command proven to be one commit, on a tree whose latest declared fast
  // check passed, is told rather than refused. Its key carries the fast records, so a
  // commit refused before the fast pass is told after it. Anything that pushes, and
  // any form not proven, still needs the full check.
  // Before the opt-out: a fast-passed commit is let through by the fast pass, warn or not, and is
  // told so, never "warned" (Codex review of 921330b9..976aa281, P2).
  if (refusable && commitOnly) {
    const fastPass = facts.fastPass(now.tree)
    if (fastPass) {
      // The fast check ran on the working tree; the commit records the index. A partial
      // stage is a different tree, and the full path says so at the same point.
      const staged = now.index === now.tree ? ''
        : ' The staged index is not the tree the fast check ran on (a partial stage, or files the check saw that are not staged), so what this commit records was not itself checked.'
      return {
        deny: false, fast: true, key: `${key}:fast${fastPass.count}`, detail: { tree: now.tree, revision },
        text: `quality-harness: a fast check (\`${fastPass.command}\`) passed on this tree, but the full check has not passed — this commit goes through, and a push will need \`qh-check\` to pass first (ADR-081).${staged}`,
      }
    }
  }
  // A fast pass this command cannot use (it is not proven to be one commit, or it pushes) is still a
  // pass: the sentence below said "no `qh-check` has passed" over it, which was untrue (2026-10-08).
  const fastSeen = treeUnchecked ? facts.fastPass(now.tree) : null
  const hinted = treeUnchecked && invoked !== null && !fastSeen && !logIncomplete(log) && !unordered && !couldNotLook
    && !['unproven', 'unreadable', 'refused'].includes(origin.origin) && now.prose === undefined
    && !log.some(entry => entry.event === 'action.emitted' && entry.rule === 'P' && entry.detail?.proseHint === true && entry.detail?.tree === now.tree)
    && facts.proseOnly?.() === true
  return {
    deny, key, detail: { tree: now.tree, revision, ...(hinted ? { proseHint: true } : {}) },
    // A record that could not be read whole is could-not-look, which git's hook says at the event
    // rather than passing in silence (ADR-088; a Codex review of its diff).
    unknown: !deny && logIncomplete(log),
    // `"publish": "warn"` turned a refusal into this warning; git's hook says it, never nothing.
    warned: refusable && setting.warn,
    // On a torn log this still warns — it must — but says UNKNOWN, not "no check
    // has": a check may have succeeded and its record be what was lost (ADR-005).
    // An order that cannot be established is the same kind of could-not-look.
    text: (logIncomplete(log)
      ? `quality-harness: whether this repository is checked is unknown — ${tornRecord(log, 'the session log')} could not be read whole, so whether \`qh-check\` succeeded on its current tree cannot be shown — and the command `
      : unordered
        ? 'quality-harness: whether this repository is checked is unknown — the order of its check events could not be established — and the command '
        : couldNotLook
          ? 'quality-harness: whether this repository is checked is unknown — the latest `qh-check` on its current tree could not observe it (it timed out, did not start, or its observation failed) — and the command '
        : origin.origin === 'unproven'
          ? 'quality-harness: whether this repository is checked is unknown — the repository root could not be read — and the command '
        : origin.origin === 'unreadable'
          ? `quality-harness: this repository is unchecked — ${origin.problem}, so no \`qh-check\` can pass here until it is fixed — and the command `
          : origin.origin === 'refused'
            ? 'quality-harness: this repository is unchecked — the check declared in .quality-harness.json is a constant success and was refused — and the command '
            : !treeUnchecked && stagesFirst
              ? 'quality-harness: the index this commit records is not known yet — the command stages files (`git add`, or the commit\'s own `-a`) before it commits, and the index was read before it runs — and the command '
            : !treeUnchecked && indexUnknown && treeStanding === 'passed'
              ? 'quality-harness: the staged index is not known to be checked — `qh-check` passed on the working tree, but the index holds different content and whether a check passed on it cannot be established — and the command '
            : !treeUnchecked && treeStanding === 'passed'
              ? 'quality-harness: the staged index is unchecked — `qh-check` passed on the working tree, but the index holds different content (a partial stage, or files the check saw that are not staged) — and the command '
            : !treeUnchecked && indexUnknown
              ? 'quality-harness: the staged index is not known to be checked — the working tree is unchanged since the session started, but the index has moved and whether a `qh-check` passed on the staged content cannot be established — and the command '
            : !treeUnchecked
              ? 'quality-harness: the staged index is unchecked — the working tree is unchanged since the session started, but the index has moved and no `qh-check` has passed on the staged content — and the command '
              : fastSeen
                ? `quality-harness: this repository is not fully checked — a fast check (\`${fastSeen.command}\`) passed on its current tree, but only a command proven to be one \`git commit\` may go through on a fast pass, this one is not proven to be one commit, and a push needs the full check (ADR-081) — and the command `
                : 'quality-harness: this repository is unchecked — no `qh-check` has passed on its current tree — and the command ')
      + (invoked !== null
        ? `about to run names commit or push (\`${invoked}\`). Run \`qh-check\` first — it runs the declared check and records the pass this hook reads. This says what state the repository is in, not what the command publishes.`
        : 'about to run only mentions commit or push — a grep, an echo, a file name, or a form this hook does not parse. Advisory; nothing is refused. If it does publish, run `qh-check` first.')
      + (dropped > 0 ? ` ${dropped} check event(s) in this session's log name no \`qh-check\` record and were not counted.` : '')
      + `${facts.caveat()}${publishSettingNote(setting)}${hinted ? PROSE_SETTING_HINT : ''}`,
  }
}

export function publishUnchecked(input, requested, env = process.env) {
  if (requested?.event !== 'publish.requested' && requested?.event !== 'publish.mentioned') return
  // Only a PROVEN invocation may be refused (CLAUDE.md §16: a block needs stronger
  // evidence than advice). A command that merely mentions the words is warned.
  const invoked = publishCommandIn(input.tool_input?.command)
  let verdict = publishVerdict({
    cwd: input.cwd, session: input.session_id, observation: requested.observation,
    invoked,
    commitOnly: commitOnlyCommand(input.tool_input?.command),
    stagesFirst: stagesBeforeCommit(input.tool_input?.command),
  })
  if (!verdict) return
  // ADR-066 T3: in a Bash session where git's own hook has RUN, a plain invocation
  // is left to git, which refuses it at the event in the repository it commits
  // into. An offer is not arming, nor is a hook run from before the latest offer;
  // PowerShell does not source the env file, and a form that could have switched
  // the hook off keeps the refusal.
  if (verdict.deny && input.tool_name === 'Bash' && leavesHookInPlace(input.tool_input?.command)
    && armedByGit(readEvents(input.cwd, input.session_id))) {
    verdict = { ...verdict, deny: false, text: `${verdict.text} In this session git's own hook refuses it at the event (ADR-066), so this is advice.` }
  }
  // ADR-086 T2: in a Bash session, a commit the text proves lands in a repository the
  // same command created in a fresh `mktemp -d` directory is told, not refused. Its key
  // is its own, so a later mention on this tree is still told.
  if (verdict.deny && input.tool_name === 'Bash' && freshRepositoryCommit(input.tool_input?.command, env)) {
    verdict = {
      ...verdict, deny: false, key: `${verdict.key}:fresh`,
      text: 'quality-harness: this commit lands in a repository the same command creates in a fresh `mktemp -d` directory, so this checkout\'s unchecked state does not refuse it (ADR-086). If the commit was meant for this checkout, run `qh-check` first.',
    }
  }
  // ADR-104: a commit the text proves is one git command into an absolute literal path is
  // told, not refused, when git places that path's repository elsewhere than this checkout's.
  // Git's answer, not the path's: a gitfile, a symlink or a linked worktree leads back here.
  // Advice as well as a refusal is replaced, since neither is about this checkout (§371).
  const target = input.tool_name === 'Bash' ? foreignCommitPath(input.tool_input?.command, env) : null
  if (target !== null) {
    const there = commonDirectory(target, input.cwd)
    const here = there === null ? null : commonDirectory(input.cwd, input.cwd)
    if (here !== null && there !== here) {
      verdict = {
        ...verdict, deny: false, key: `${verdict.key}:foreign`,
        // It still says what the command names: ADR-060 T4's locked test asserts that a commit
        // into another repository is warned of as naming commit or push, and it is one.
        // The reason leads: the person sees only the first sentence, cut at 140 characters, and a -C path of ordinary
        // length cut "(ADR-104)" off when it came after the command (BACKLOG §381 item 11). ADR-060 T4's phrase stays.
        text: `quality-harness: a commit into another repository is advised, not refused (ADR-104): the command about to run names commit or push (\`${publishCommandIn(input.tool_input?.command)}\`), and it lands in a repository other than this checkout — git keeps it in a different git directory — so this checkout's state does not refuse it. If the commit was meant for this checkout, run \`qh-check\` first.`,
      }
    }
  }
  // A denial has to happen on every attempt. Saying it once and then allowing
  // the same command is the warning's dedupe applied to a refusal. The dedupe key is the tree's, so it
  // names what was said as well: a mention already told here must not silence the advice a refusal
  // softened to (BACKLOG §381).
  const key = invoked === null ? `${verdict.key}:mention` : verdict.key
  if (!verdict.deny && readEvents(input.cwd, input.session_id).some(entry => entry.event === 'action.emitted' && entry.rule === 'P' && entry.key === key)) return
  queueAction({ rule: 'P', key, detail: verdict.detail, deny: verdict.deny, text: verdict.text })
}

// ADR-104 Decision 2: the git directory a path's repository keeps, as git resolves it, after
// realpath, or null when git could not say: a probe that fails, times out or prints nothing
// proves nothing, and the refusal stands.
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
