#!/usr/bin/env node
// qh-check — run the project's check and record what it observed (ADR-060 T2).
//
// The only writer of `checks.jsonl`. It resolves the check the way the advisories
// do (`checkCommandOrigin`), observes the tree before and after, keeps the LAST
// 64 KiB of output for the verdict (a test runner prints its summary at the end),
// and exits with the check's own code. SIGINT and SIGTERM are forwarded to the
// check's process group and recorded; a SIGKILL leaves no record, and the finding
// it would have cleared stays open. The decision is checkPlan; the rows and the sentences are check-record.mjs;
// the lease and the child are check-lease.mjs and check-child.mjs (BACKLOG section 376).
import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { realpathSync } from 'node:fs'
import { isMainModule } from './main-module.mjs'
import { firstMentionHere } from './session-notes.mjs'
import { projectConfigProblem, proseSpecs } from './project-config.mjs'
import { checkCommandOrigin, fastCheckCommand } from './check-command.mjs'
import { baselineFor, checkEventName, latestFastPass, passedAlready, slowRunLineAfter } from './check-ledger.mjs'
import { observe, observeBudgetMs } from './tree-facts.mjs'
import * as leaseModule from './lease.mjs'
import { contention, loadLine, sampleLoad } from './load.mjs'
import { resolveBashExecutable } from './run-shell-hook.mjs'
import { PROSE_HINT, onlyTextChangedSince, previousPassHead, proseHintMs } from './prose-hint.mjs'
import { fastCheckHint } from './fast-check-hint.mjs'
import { UNREAD, removedTestsLine } from './removed-tests.mjs'
import { checkTimeoutMs, runLaunched } from './check-child.mjs'
import { takeTurn } from './check-lease.mjs'
import { classifyRun, recordBaseline, recordRun, recordSkip, reuseByProse, runRecord } from './check-record.mjs'
import { once } from './lazily.mjs'

const KEEP_BYTES = 64 * 1024
// What a failed run keeps of its output beside its row (check-record.mjs cuts that to its last lines).
const KEEP_OUTPUT_BYTES = 256 * 1024

// A spawn error or a missing status is not "this directory is not a repository".
// That reading is the non-git exemption, and a pass then skips the tree comparison.
export function repositoryDiscovery(spawnResult) {
  if (!spawnResult || spawnResult.error || spawnResult.status == null) return null
  return spawnResult.status === 0 && String(spawnResult.stdout ?? '').trim() !== ''
}

// What the check could not start on, said in the words that fix it.
const NO_BASH = 'no bash was found; install Git for Windows or set CLAUDE_CODE_GIT_BASH_PATH, because cmd.exe cannot run a POSIX check'

/**
 * checkLaunch says how the project's check is started: the executable, its
 * arguments, and whether Node wraps them in the platform shell.
 *
 * POSIX keeps `shell: true`, which is `/bin/sh` and has always run the check.
 * On Windows `shell: true` is cmd.exe, and cmd.exe cannot run a POSIX check: it
 * reads `./.venv/Scripts/python.exe` as the command `.` followed by a `/` switch
 * and answers "'.' is not recognized". Reported 2026-09-23 against 2.103.0, where
 * it kept a downstream commit hook blocked on a suite that passed when run
 * directly (BACKLOG §261). So Windows runs the check through Git Bash, resolved
 * exactly as the hook runner resolves it, and `-c` as the fence runner passes it.
 *
 * Null means no bash was found. The caller then records the check as not started
 * rather than falling back to cmd.exe, which would turn could-not-look into a
 * failure the project's code did not cause (ADR-005; spec-verify's `Cmd` override
 * made the same choice, BACKLOG §171). `platform`, `env` and `resolveBash` are the
 * seams that make the Windows arm reachable from a POSIX host (CLAUDE.md §7).
 */
export function checkLaunch(command, platform = process.platform, env = process.env, resolveBash = resolveBashExecutable) {
  if (platform !== 'win32') return { file: command, args: [], shell: true }
  const bash = resolveBash(platform, env)
  return bash ? { file: bash, args: ['-c', command], shell: false } : null
}


// What the plan reads, each read lazily and once and in the order the plan asks for it, so a refusal reads no more than it
// did before (BACKLOG section 376): the repository and its declared config, the command and how it came to be named, the
// prose the project declared, and what the ledger says of this tree.
function checkFacts({ cwd, env, fast }) {
  const top = spawnSync('git', ['-C', cwd, 'rev-parse', '--show-toplevel'], { encoding: 'utf8', timeout: 5_000, windowsHide: true, env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' } })
  const git = repositoryDiscovery(top)
  const root = git === true ? top.stdout.trim() : realpathSync(cwd)
  const facts = {
    root, git,
    configProblem: once(() => projectConfigProblem(root)),
    fastCommand: once(() => (fast ? fastCheckCommand(root) : null)),
    named: once(() => (fast ? { command: facts.fastCommand(), origin: 'fast' } : checkCommandOrigin(root))),
    prose: once(() => (git === true && !fast ? proseSpecs(root) : { specs: [], problem: null })),
    passed: once(() => passedAlready({ root, git, command: facts.named().command, env, prose: facts.prose().specs })),
  }
  return facts
}

// The decision, as a function of the facts it is handed (BACKLOG section 376): refuse with a reason and an exit, or name the
// command, how it came to be named, the prose that may stand in for a run, and the pass that already covers this tree.
// `scripts/effect-classes.mjs` holds it to reading nothing but them.
export function checkPlan(facts, { fast, again, env }) {
  const configProblem = facts.configProblem()
  if (configProblem) {
    return { code: 2, said: `qh-check: UNRUN — ${configProblem}, so the declared check, fastCheck and prose are UNKNOWN. A replacement would certify something the project did not name; fix the file and run again.\n` }
  }
  // ADR-081: `--fast` runs the declared `fastCheck`, records it apart and never skips.
  if (fast && !facts.fastCommand()) {
    return { code: 2, said: 'qh-check: no `fastCheck` that can fail is declared in .quality-harness.json, so `--fast` has nothing to run.\n' }
  }
  const { command, origin } = facts.named()
  if (origin === 'refused') return { code: 2, said: 'qh-check: the check declared in .quality-harness.json is a constant success and was refused.\n' }
  if (origin === 'unproven') return { code: 2, said: 'qh-check: the repository root could not be read, so no check is named.\n' }
  if (!command) return { code: 2, said: 'qh-check: this project has no check to run. Declare one as `check` in .quality-harness.json.\n' }
  // ADR-094 T3: the paths the project declared as prose, validated; a declaration that could hide code is said and ignored.
  const prose = facts.prose()
  // ADR-081: the ledger answers before the lease is taken, so a skip never waits its turn. A run that misses observes the
  // tree again after its wait. QUALITY_HARNESS_CHECK_AGAIN=1 is `--again` for every run: a project, or a test, whose check
  // depends on something outside the tree opts out of the skip.
  const rerun = fast || again || env.QUALITY_HARNESS_CHECK_AGAIN === '1'
  return { command, origin, prose, notes: prose.problem ? [`qh-check: ${prose.problem}\n`] : [], already: rerun ? null : facts.passed() }
}

// The load option as handed in (ADR-075 T1): a pass taken on a saturated machine is not attributable, and the record says so
// without changing the exit or the verdict. An option passed is used as given, so a 0 or a NaN is read as invalid, not
// replaced by the host's.
const loadOptions = (loadavg, cores) => ({ ...(loadavg !== undefined ? { loadavg } : {}), ...(cores !== undefined ? { cores } : {}) })

// The last KEEP_OUTPUT_BYTES of the check's output, kept whole for a failed run's file; the verdict reads the last KEEP_BYTES of
// it, since a test runner prints its summary at the end. `cut` says the front of the output was dropped.
function tailKeeper() {
  let kept = Buffer.alloc(0)
  let cut = false
  return {
    keep: chunk => {
      kept = Buffer.concat([kept, chunk])
      if (kept.length > KEEP_OUTPUT_BYTES) {
        kept = kept.subarray(kept.length - KEEP_OUTPUT_BYTES)
        cut = true
      }
    },
    kept: () => kept.subarray(Math.max(0, kept.length - KEEP_BYTES)),
    output: () => ({ bytes: kept, cut }),
  }
}

// The run itself, shared by a check and a baseline. Released after runLaunched returns, not on the signal: a check still
// closing keeps its lease. A launch that could not be built did not start.
async function runReleasing({ launch, run, held, leaseStep, lease, look }) {
  let ran
  let besideAtEnd = null
  try {
    ran = launch
      ? await runLaunched(launch, run)
      : { ended: { code: null, signal: null, error: new Error(NO_BASH) }, received: null }
    besideAtEnd = look ? look() : null
  } finally {
    if (held) leaseStep('release', () => lease.release(held))
  }
  return { ...ran, besideAtEnd }
}

export async function runCheck({ cwd = process.cwd(), env = process.env, platform = process.platform, stdout = process.stdout, stderr = process.stderr, loadavg, cores, wait = false, again = false, fast = false, lease = leaseModule, beforeReuse = () => {} } = {}) {
  const facts = checkFacts({ cwd, env, fast })
  const plan = checkPlan(facts, { fast, again, env })
  if (plan.code !== undefined) {
    stderr.write(plan.said)
    return plan.code
  }
  const { root, git } = facts
  const { command, origin, prose } = plan
  for (const note of plan.notes) stderr.write(note)
  const observeNow = () => (prose.specs.length ? observe(root, observeBudgetMs(env), { without: prose.specs }) : observe(root))
  const already = reuseByProse({ already: plan.already, prose, git, command, root, stderr, beforeReuse })
  if (already) {
    recordSkip({ already, command, prose, root, stderr })
    return 0
  }
  const admission = await takeTurn({ lease, env, wait, command, root, stderr })
  if (admission.code !== undefined) return admission.code
  const { held, look, leaseStep, waitedMs } = admission
  const beside = look()
  for (const line of beside ? lease.besideLines(beside) : []) stderr.write(`qh-check: ${line}\n`)
  const startedAt = new Date().toISOString()
  // The load at both ends of the check (ADR-075 T1): a pass taken on a saturated machine is
  // not attributable, and the record says so without changing the exit or the verdict.
  // An option passed is used as given, so a 0 or a NaN is read as invalid, not replaced by the host's.
  const load = loadOptions(loadavg, cores)
  const loadAtStart = sampleLoad(load)
  // The previous full pass's HEAD, read before this run's own row exists: the hint compares against it.
  const previousHead = !fast && git === true && prose.specs.length === 0 ? previousPassHead(root, command) : null
  const before = { ...observeNow(), at: startedAt, load: loadAtStart.load }
  const tail = tailKeeper()
  const { ended, received, besideAtEnd } = await runReleasing({
    launch: checkLaunch(command, platform, env), run: { root, env, platform, timeoutMs: checkTimeoutMs(env), stdout, stderr, keep: tail.keep },
    held, leaseStep, lease, look,
  })
  const kept = tail.kept()
  for (const line of besideAtEnd ? lease.besideLines(besideAtEnd) : []) stderr.write(`qh-check: at its end, ${line}\n`)
  const after = { ...observeNow(), at: new Date().toISOString(), load: sampleLoad(load).load }
  const { signal, exit, verdict } = classifyRun({ ended, received, kept, command })
  const contended = contention(before.load, after.load, loadAtStart.cores)
  const record = runRecord({ id: randomUUID(), git, command, origin, before, after, run: { exit, signal, verdict }, cores: loadAtStart.cores,
    contended, beside, besideAtEnd, waitedMs, prose })
  recordRun({ record, fast, root, startedAt, after, signal, verdict, command, origin, stderr, output: tail.output() })
  // A test file the last pass of this command ran with, gone and not moved, is named once, at the first pass without it. It is
  // advice: nothing it meets may change the check's exit (CLAUDE.md §3).
  if (git === true && checkEventName(record) === 'check.passed') {
    let removed
    try { removed = removedTestsLine({ root, fast, command, record }) } catch (failure) { removed = `${UNREAD}: ${failure.message}` }
    if (removed) stderr.write(`qh-check: ${removed}\n`)
  }
  if (previousHead && checkEventName(record) === 'check.passed' && Date.parse(after.at) - Date.parse(startedAt) >= proseHintMs(env)
    && onlyTextChangedSince(root, previousHead) && firstMentionHere(root, PROSE_HINT)) {
    stderr.write(`qh-check: ${PROSE_HINT}\n`)
  }
  // ADR-103 T1: a passing full run that took a while, in a project with no fastCheck, names the fast check its runner offers.
  // firstMentionHere is asked last, since asking it writes its marker: a run that is not said the hint never uses it up.
  if (!fast && checkEventName(record) === 'check.passed' && Date.parse(after.at) - Date.parse(startedAt) >= proseHintMs(env)
    && !fastCheckCommand(root)) {
    const hint = fastCheckHint(root)
    if (firstMentionHere(root, hint)) stderr.write(`qh-check: ${hint}\n`)
  }
  stderr.write(`qh-check: ${loadLine(before.load, after.load, loadAtStart.cores)}\n`)
  // ADR-103 T2: a full run that took half again this command's own median says so. A --fast run's record is in
  // fast-checks.jsonl, so slowRunLineAfter, which ends the history at this run's own row in checks.jsonl, finds none and says
  // nothing; a separate `fast` gate here was redundant, and its mutant could not be killed (ADR-103 T3).
  const slow = slowRunLineAfter(root, record)
  if (slow) stderr.write(`qh-check: ${slow}\n`)
  if (ended.error) {
    stderr.write(`qh-check: the check could not start (${ended.error.code ?? ended.error.message}).\n`)
    return 127
  }
  return exit ?? 1
}

// ADR-111 T3: the project's check on the tree the session began with, kept in baseline.jsonl and read by the turn end alone
// (Decision 1's correction). It runs in the repository as any check does and binds its verdict to `tree` only when the tree
// before and after the run are that tree; a run the agent's edits overlapped is kept unbound and says nothing. It never reads
// or writes checks.jsonl, so it cannot stand in for a pass. It never waits for its turn, whatever QUALITY_HARNESS_WAIT says
// (Codex review of v3.8.44..3c42f633): the lease names it to the heavy runs beside it, and it runs.
export async function runBaseline({ tree, cwd = process.cwd(), env = process.env, platform = process.platform, stdout = process.stdout, stderr = process.stderr, loadavg, cores, lease = leaseModule } = {}) {
  const facts = checkFacts({ cwd, env, fast: false })
  const { root, git } = facts
  const { command, origin } = facts.named()
  if (git !== true || !command || origin === 'refused' || origin === 'unproven' || facts.configProblem()) {
    stderr.write('qh-check: no baseline: this repository names no check that can run here.\n')
    return 2
  }
  if (baselineFor(root, tree, command)) {
    stderr.write(`qh-check: a baseline of \`${command}\` on ${tree.slice(0, 12)} is already kept.\n`)
    return 0
  }
  const admission = await takeTurn({ lease, env: { ...env, QUALITY_HARNESS_WAIT: '0' }, wait: false, command, root, stderr })
  if (admission.code !== undefined) return admission.code
  const { held, leaseStep, waitedMs } = admission
  const load = loadOptions(loadavg, cores)
  const loadAtStart = sampleLoad(load)
  const startedAt = new Date().toISOString()
  const before = { ...observe(root), at: startedAt, load: loadAtStart.load }
  const tail = tailKeeper()
  const ran = await runReleasing({
    launch: checkLaunch(command, platform, env), run: { root, env, platform, timeoutMs: checkTimeoutMs(env), stdout, stderr, keep: tail.keep },
    held, leaseStep, lease, look: null,
  })
  const kept = tail.kept()
  const after = { ...observe(root), at: new Date().toISOString(), load: sampleLoad(load).load }
  const { signal, exit, verdict } = classifyRun({ ended: ran.ended, received: ran.received, kept, command })
  const bound = before.ok === true && after.ok === true && before.tree === tree && after.tree === tree
  const record = {
    ...runRecord({ id: randomUUID(), git, command, origin, before, after, run: { exit, signal, verdict }, cores: loadAtStart.cores,
      contended: contention(before.load, after.load, loadAtStart.cores), beside: null, besideAtEnd: null, waitedMs, prose: { specs: [] } }),
    baseline: { tree, bound },
  }
  recordBaseline({ record, root, stderr })
  return 0
}

// ADR-100 T2. `git commit` arguments that commit a tree other than the index, refused before the check: a pathspec (after
// `--`, or a word no option takes), `-p`/`--patch`, `--interactive`, `-o`/`--only`, `-i`/`--include` (the cold review of
// ADR-100: `git commit -- A` with A and B staged commits a tree no check saw). A word this does not recognise is read as a
// pathspec, the direction that refuses (CLAUDE.md §16). Options that take a value consume the next word.
// `-S[<keyid>]` takes its key attached, never the next word, so it is no value-taking flag here.
const COMMIT_VALUE_SHORT = new Set(['m', 'F', 'C', 'c', 't'])
const COMMIT_VALUE_LONG = new Set(['--message', '--file', '--reuse-message', '--reedit-message', '--template', '--author', '--date', '--fixup', '--squash', '--cleanup', '--trailer'])
const COMMIT_OTHER_TREE_SHORT = new Set(['p', 'o', 'i'])
const COMMIT_OTHER_TREE_LONG = new Set(['--patch', '--interactive', '--only', '--include', '--pathspec-from-file'])
// The long options that commit the index, by their whole names, each also as `--no-<name>`: measured from `git commit -h` on
// git 2.56.0 (2026-10-13), less the ones that commit another tree (`--patch`, `--interactive`, `--only`, `--include`,
// `--pathspec-*`) and `-p`'s diff context. git accepts any unambiguous prefix (`--on` is `--only`), so a name not on this
// list is refused rather than passed through (the Codex review of ce54814c; its verification found `--untracked-files=no`
// and `--no-verbose` refused by a hand-typed list; CLAUDE.md §16).
const COMMIT_INDEX_BASE = ['ahead-behind', 'all', 'amend', 'author', 'branch', 'cleanup', 'date', 'dry-run', 'edit', 'file',
  'fixup', 'gpg-sign', 'long', 'message', 'null', 'porcelain', 'quiet', 'reedit-message', 'reset-author', 'reuse-message',
  'short', 'signoff', 'squash', 'status', 'template', 'trailer', 'untracked-files', 'verbose', 'allow-empty',
  'allow-empty-message', 'post-rewrite', 'verify']
const COMMIT_INDEX_LONG = new Set(COMMIT_INDEX_BASE.flatMap(base => [`--${base}`, `--no-${base}`]))
export function commitArgsProblem(args) {
  for (let at = 0; at < args.length; at++) {
    const word = String(args[at])
    if (word === '--') return 'a pathspec (`--` and what follows) commits a tree other than the index'
    if (word.startsWith('--')) {
      const name = word.split('=')[0]
      if (COMMIT_OTHER_TREE_LONG.has(name)) return `\`${name}\` commits a tree other than the index`
      if (!COMMIT_INDEX_LONG.has(name)) return `\`${name}\` is not an option --commit recognises; git accepts an abbreviation of another (\`--on\` is \`--only\`), so spell each whole`
      if (COMMIT_VALUE_LONG.has(name) && !word.includes('=')) at++
      continue
    }
    if (word.startsWith('-') && word.length > 1) {
      for (let letter = 1; letter < word.length; letter++) {
        const flag = word[letter]
        if (COMMIT_OTHER_TREE_SHORT.has(flag)) return `\`-${flag}\` commits a tree other than the index`
        // `-S<keyid>` and `-u<mode>` take what follows in the same word, if anything: the rest of the cluster is theirs.
        if (flag === 'S' || flag === 'u') break
        if (COMMIT_VALUE_SHORT.has(flag)) {
          if (letter === word.length - 1) at++
          break
        }
      }
      continue
    }
    return `\`${word}\` is a pathspec, which commits a tree other than the index`
  }
  return null
}

const listed = (cwd, args) => {
  const run = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8', timeout: 30_000, windowsHide: true, env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' } })
  return run.status === 0 ? String(run.stdout ?? '').split('\n').filter(Boolean) : null
}

/**
 * `qh-check --commit [<git commit arguments>]` (ADR-100 T2): the check on a tree equal to the index, then `git commit` only on
 * its pass, in one call. The owner's rule against a commit chained after a check exists because the chain hides the check's
 * exit; here a red check never reaches git and its code is the exit. The fast check when one is declared, else the full one.
 * After git commits, the commit's tree is compared with the tree the check ran on: a hook that rewrote the index, or a peer
 * staging mid-run, is said and exits 1, because that commit was not checked.
 */
export async function runCommit({ cwd = process.cwd(), env = process.env, args = [], stdin = 'inherit', ...check } = {}) {
  const stderr = check.stderr ?? process.stderr
  const top = spawnSync('git', ['-C', cwd, 'rev-parse', '--show-toplevel'], { encoding: 'utf8', timeout: 5_000, windowsHide: true, env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' } })
  if (repositoryDiscovery(top) !== true) {
    stderr.write('qh-check: --commit needs a git repository, and this directory is not in one.\n')
    return 2
  }
  const root = top.stdout.trim()
  const problem = commitArgsProblem(args)
  if (problem) {
    stderr.write(`qh-check: --commit refused, before any check ran: ${problem}. It commits the index, the tree the check observes.\n`)
    return 2
  }
  const unstaged = listed(root, ['diff', '--name-only'])
  const untracked = listed(root, ['ls-files', '--others', '--exclude-standard'])
  if (unstaged === null || untracked === null) {
    stderr.write('qh-check: --commit could not compare the working tree with the index, so nothing was checked or committed.\n')
    return 2
  }
  const differing = [...unstaged, ...untracked]
  if (differing.length) {
    const shown = differing.slice(0, 10).join(', ') + (differing.length > 10 ? `, +${differing.length - 10} more` : '')
    stderr.write(`qh-check: --commit refused, before any check ran: the working tree differs from the index (${shown}). The check observes the working tree and the commit takes the index; stage or remove these first.\n`)
    return 2
  }
  const fast = Boolean(fastCheckCommand(root))
  const code = await runCheck({ cwd: root, env, ...check, fast })
  if (code !== 0) return code
  // The check's exit is not the ledger's verdict: a run whose tree moved while it ran is graded unproven
  // (`checkEventName`). Only the ledger's latest row on the tree as it is now, a pass with no unseen write after it,
  // certifies what is about to be committed (an advisor's review of e6a00957).
  const checked = observe(root, observeBudgetMs(env))
  const certified = checked?.ok === true && (fast
    ? latestFastPass(root, checked.tree)
    : passedAlready({ root, git: true, command: checkCommandOrigin(root).command, env, prose: proseSpecs(root).specs }))
  if (!certified) {
    stderr.write('qh-check: the check exited 0, but the ledger did not certify the tree as it is now (it moved while the check ran, or a write git cannot see came after the pass), so nothing was committed.\n')
    return 1
  }
  const committed = spawnSync('git', ['-C', root, 'commit', ...args], { stdio: [stdin, 'inherit', 'inherit'], env, timeout: checkTimeoutMs(env), windowsHide: true })
  if (committed.error || committed.status !== 0) return committed.status ?? 1
  const tree = listed(root, ['rev-parse', 'HEAD^{tree}'])?.[0]
  if (checked?.ok !== true || tree !== checked.tree) {
    stderr.write(`qh-check: the commit was made, but its tree ${tree ?? '(unreadable)'} is not the tree the check ran on (${checked?.tree ?? 'unobserved'}): a hook rewrote the index, or something staged while the check ran. That commit was not checked; run qh-check on it.\n`)
    return 1
  }
  return 0
}

if (isMainModule(import.meta.url)) {
  const all = process.argv.slice(2)
  // Everything after `--commit` is git's (ADR-100 T2).
  const at = all.indexOf('--commit')
  const argv = at >= 0 ? all.slice(0, at) : all
  // ADR-111 T3: `--baseline <tree>` takes the tree it is about, as SessionStart observed it.
  const b = argv.indexOf('--baseline')
  const tree = b >= 0 ? argv[b + 1] : null
  const unknown = argv.filter((word, index) => !['--wait', '--again', '--fast', '--baseline'].includes(word) && !(b >= 0 && index === b + 1))
  const usage = 'usage: qh-check [--wait] [--again] [--fast] [--commit <git commit arguments>] | qh-check --baseline <tree>\n'
  if (unknown.length) {
    process.stderr.write(`qh-check: unknown option: ${unknown[0]}\n${usage}`)
    process.exitCode = 2
  } else if (b >= 0) {
    if (typeof tree !== 'string' || !/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/.test(tree) || at >= 0 || argv.length !== 2) {
      process.stderr.write(`qh-check: --baseline takes one tree hash and nothing else\n${usage}`)
      process.exitCode = 2
    } else {
      process.exitCode = await runBaseline({ tree })
    }
  } else if (at >= 0) {
    process.exitCode = await runCommit({ args: all.slice(at + 1), wait: argv.includes('--wait'), again: argv.includes('--again') })
  } else {
    process.exitCode = await runCheck({ wait: argv.includes('--wait'), again: argv.includes('--again'), fast: argv.includes('--fast') })
  }
}
