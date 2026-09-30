#!/usr/bin/env node
// mutate.mjs — break the code on purpose and check the tests notice.
//
// docs/TEST-PLAN.md gives every row three fields: the assertion, the killing
// mutation, and the harness it lands in. The first and third live in the repo.
// This makes the second one executable, because a mutation that only ever
// appeared in a commit message is a claim, not a check.
//
// Two things learned running ~60 of these by hand, both of which are why this is
// a script rather than a habit:
//
//   * An interrupted run leaves the source mutated. It happened, and the working
//     tree carried a broken gate until it was noticed. The ON-DISK JOURNAL is
//     what protects you, and it is the only thing that does: this campaign is
//     one long SYNCHRONOUS loop, so Node never reaches the event loop and the
//     SIGINT and SIGTERM handlers below cannot run while it is working.
//     Measured 2026-08-27 — SIGTERM was sent twice and the run carried on
//     through several more mutations. The handlers are kept because they fire
//     if the process is ever idle; the guarantee is the file.
//   * A mutation can HANG rather than fail. Removing path_stack's relative_to
//     guard makes an upward walk never terminate, because Path("/").parent is
//     Path("/"). A hang is not a pass and not an ordinary failure — it gets its
//     own verdict.
//
// Usage:
//   node scripts/mutate.mjs                 run every mutation
//   node scripts/mutate.mjs --list          name them without running anything
//   node scripts/mutate.mjs --case <substring>
//
// Exit: 0 = every mutation was noticed
//       1 = a mutation left its suite GREEN, or no longer describes the code
import { spawn, spawnSync } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { isMainModule } from '../plugin/scripts/main-module.mjs'
import { loadLine, sampleLoad } from '../plugin/scripts/load.mjs'

// The load a campaign ran under (ADR-075 T1). `QUALITY_HARNESS_LOADAVG` ("1.5 1 1") and
// `QUALITY_HARNESS_CORES` are the tests' seams; without them the machine is asked.
export function campaignLoad(env = process.env) {
  const averages = env.QUALITY_HARNESS_LOADAVG ? env.QUALITY_HARNESS_LOADAVG.trim().split(/\s+/).map(Number) : null
  return sampleLoad({
    ...(averages ? { loadavg: () => averages } : {}),
    ...(env.QUALITY_HARNESS_CORES ? { cores: Number(env.QUALITY_HARNESS_CORES) } : {}),
  })
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
// The repository a run reads and writes: this one, or `--root <dir>` (ADR-069). `main`
// sets it, and the catalogue, lock and journal with it, before anything below reads them.
let root = repoRoot

/**
 * The files a campaign over `root` reads and writes (ADR-069): its catalogue, its lock,
 * its journal and its verdict cache, all under `root`, so a run over a scratch
 * repository cannot restore a live campaign's file here. `QUALITY_HARNESS_MUTATE_LOCK`
 * moves the lock, and the journal beside it, as the lock's own comment below says.
 * Pure: `env` is the seam.
 */
export function campaignPaths(dir, env = process.env) {
  const lock = env.QUALITY_HARNESS_MUTATE_LOCK || path.join(dir, '.mutate-lock')
  return {
    catalogue: path.join(dir, 'tests', 'mutations.json'),
    lock,
    journal: env.QUALITY_HARNESS_MUTATE_LOCK ? `${lock}.inflight.json` : path.join(dir, '.mutate-inflight.json'),
    cache: path.join(dir, '.mutation-cache.json'),
  }
}

const timeoutMs = 180_000

// A mutation left applied is worse than a mutation not run.
//
// In-process handlers are not enough, and this script proved it on its own first
// run: something killed it hard, `process.on('exit')` never fired, and
// scripts/lifecycle.mjs sat mutated in the working tree until a later run
// reported the mutation STALE. SIGKILL runs no JavaScript.
//
// So the intent is written to disk BEFORE the source is touched, and any leftover
// is repaired at startup. A crash can lose the process; it cannot lose the file.
// Beside the lock: a run that owns its own lock owns its own journal, or the
// two campaigns repair each other's files.
let journalPath = campaignPaths(root).journal

function recover() {
  if (!existsSync(journalPath)) return
  const { file, original } = JSON.parse(readFileSync(journalPath, 'utf8'))
  writeFileSync(file, original)
  rmSync(journalPath, { force: true })
  process.stderr.write(`mutate: restored ${path.relative(root, file)} from an interrupted run\n`)
}

function begin(file, original) {
  writeFileSync(journalPath, JSON.stringify({ file, original }))
}

function finish(file, original) {
  writeFileSync(file, original)
  rmSync(journalPath, { force: true })
}

// One runner at a time, and never over an editor.
//
// This mutates real source and restores it from a journal. Two things break
// that, and both happened on 2026-08-26: a SECOND runner started while one was
// going, and — twice — a patch written while a run was in flight was silently
// rolled back by the restore. The work looked applied, the tests ran against the
// old code, and the only clue was a test failing for a reason that made no
// sense. A lock and a clean-tree check cost nothing next to that.
// The path is overridable so the suite can exercise these guards without
// colliding with a real campaign that may be running in the same checkout —
// which is exactly the collision the lock exists to prevent, and it made the
// dirty-tree guard untestable because the lock refused the inner run first.
let lockPath = campaignPaths(root).lock

// ADR-075 (spec F-16): the lock names the parent and, once one is spawned, the isolated child.
// It is live while any pid it names lives or, on POSIX, while the child's process group does,
// so no second campaign runs on a root whose first one's child is still working.
function alive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try { process.kill(pid, 0); return true } catch (error) { return error.code === 'EPERM' }
}
function groupAlive(pid) {
  if (process.platform === 'win32' || !Number.isInteger(pid) || pid <= 0) return false
  try { process.kill(-pid, 0); return true } catch (error) { return error.code === 'EPERM' }
}
// An empty or unparsable lock names no process: `Number('')` is 0, and `kill(0, 0)` probes
// THIS process group, which always answers — so a stale empty lock read as a live run and
// refused every campaign (BACKLOG §295 item 24). Only positive integers count.
const pidsOf = text => text.trim().split(/\s+/).map(Number).filter(pid => Number.isInteger(pid) && pid > 0)

function claimTheRun() {
  if (existsSync(lockPath)) {
    const owner = readFileSync(lockPath, 'utf8').trim()
    const pids = pidsOf(owner)
    if (pids.some(alive) || (pids.length > 1 && groupAlive(pids[1]))) {
      process.stderr.write(`mutate: another run is in flight (pid ${owner}). `
        + 'Two runners restore each other\'s files and both report nonsense.\n')
      return false
    }
    // A dead owner left it behind; recover() has already repaired the source.
    rmSync(lockPath, { force: true })
  }
  writeFileSync(lockPath, String(process.pid))
  return true
}

function releaseTheRun() {
  try {
    if (pidsOf(readFileSync(lockPath, 'utf8'))[0] === process.pid) {
      rmSync(lockPath, { force: true })
    }
  } catch {}
}

// ADR-075: the isolated campaign. `QUALITY_HARNESS_CAMPAIGN_CHILD` marks the child, which runs
// in the worktree over exactly the parent's selection.
const CAMPAIGN_CHILD = 'QUALITY_HARNESS_CAMPAIGN_CHILD'
const thisScript = fileURLToPath(import.meta.url)

// git with a fixed identity: `git stash create` makes a commit, and a fixture or a CI runner may
// have no user configured.
function gitIn(dir, args) {
  const run = spawnSync('git', ['-C', dir, '-c', 'user.name=mutate', '-c', 'user.email=mutate@localhost', ...args],
    { encoding: 'utf8', timeout: 120_000, maxBuffer: 256 * 1024 * 1024, windowsHide: true })
  return Object.assign(run, { command: `git ${args.join(' ')}` })
}
// The command that failed and what it said, or its exit status when it said nothing.
const gitSaid = run => `${run.command}: ${(run.error?.message ?? run.stderr?.trim()) || `exit ${run.status}`}`

/**
 * campaignHome is where a repository's campaign worktrees live: its git directory, never the OS
 * temp root, because a test that tells scratch from project by the temp root
 * (`plugin/scripts/lifecycle.mjs:347`) must grade alike in both modes (spec F-9).
 */
export function campaignHome(dir) {
  const common = gitIn(dir, ['rev-parse', '--git-common-dir'])
  if (common.error || common.status !== 0) return null
  return path.join(path.resolve(dir, common.stdout.trim()), 'qh-campaigns')
}

/**
 * sweepCampaigns removes every campaign worktree under `home` whose owners have all ended — the
 * parent and child its `owner.json` names and, on POSIX, the child's process group — and says
 * so (spec F-9, F-16). A directory with no `owner.json` belongs to a parent that died before
 * writing it, or to one writing it now, so it is left for a minute.
 */
export function sweepCampaigns(dir, home, say) {
  let ids = []
  try { ids = readdirSync(home) } catch { return }
  for (const id of ids) {
    const at = path.join(home, id)
    let owner = null
    try { owner = JSON.parse(readFileSync(path.join(at, 'owner.json'), 'utf8')) } catch {}
    if (owner) {
      if (alive(owner.parent) || alive(owner.child) || groupAlive(owner.child)) continue
    } else {
      try { if (Date.now() - statSync(at).mtimeMs < 60_000) continue } catch { continue }
    }
    gitIn(dir, ['worktree', 'remove', '--force', path.join(at, 'tree')])
    rmSync(at, { recursive: true, force: true })
    gitIn(dir, ['worktree', 'prune'])
    say(`removed a campaign worktree left by an earlier run: ${id}`)
  }
}

/**
 * writeBackCache puts the child's verdict cache over the checkout's through a temporary file and
 * a rename, in the child's own shape, which is mutate's and what CI's merge job reads (spec F-12).
 * A read, write or rename that fails leaves `to` byte-identical, and says so.
 */
export function writeBackCache(from, to, { fs: io = {}, say = line => process.stderr.write(`mutate: ${line}\n`) } = {}) {
  const read = io.readFileSync ?? readFileSync
  const write = io.writeFileSync ?? writeFileSync
  const rename = io.renameSync ?? renameSync
  let text
  try { text = read(from, 'utf8') } catch (error) {
    say(`the verdict cache was not updated: the run wrote none (${error.code ?? error.message})`)
    return false
  }
  const temp = `${to}.${process.pid}.tmp`
  try {
    write(temp, text)
    rename(temp, to)
    return true
  } catch (error) {
    rmSync(temp, { force: true })
    say(`the verdict cache was not updated: ${error.message}`)
    return false
  }
}

// Ends a process group, or on Windows a process tree: the child's synchronous loop does not
// run its handlers while it works, and its own `node --test` must not outlive the worktree.
function signalGroup(pid, signal) {
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { timeout: 30_000, windowsHide: true })
    return
  }
  try { process.kill(-pid, signal) } catch {}
}
async function groupEnded(pid, ms) {
  const until = Date.now() + ms
  while (Date.now() < until) {
    if (!(process.platform === 'win32' ? alive(pid) : groupAlive(pid))) return true
    await new Promise(resolve => setTimeout(resolve, 50))
  }
  return false
}

/**
 * isolate runs the campaign the parent selected in a worktree of the checkout's working-tree
 * content, and returns its exit code (ADR-075 T2; spec F-8, F-9, F-12, F-13, F-15, F-16).
 */
async function isolate({ selected, argv, paths, loadAtStart }) {
  const say = line => process.stderr.write(`mutate: ${line}\n`)
  const refuse = reason => {
    say(`could not isolate: ${reason}; --in-place runs in this checkout`)
    return 2
  }
  const home = campaignHome(root)
  if (!home) return refuse('this is not a git repository')
  mkdirSync(home, { recursive: true })
  sweepCampaigns(root, home, say)
  const began = Date.now()
  const id = path.join(home, `${process.pid}-${randomBytes(3).toString('hex')}`)
  mkdirSync(id)
  const ownerFile = path.join(id, 'owner.json')
  writeFileSync(ownerFile, JSON.stringify({ parent: process.pid }))
  const tree = path.join(id, 'tree')
  const drop = () => {
    gitIn(root, ['worktree', 'remove', '--force', tree])
    rmSync(id, { recursive: true, force: true })
    gitIn(root, ['worktree', 'prune'])
  }
  // The working-tree content: `git stash create` is HEAD plus the uncommitted tracked changes
  // as a commit, and prints nothing when there are none; it writes no ref and no index.
  const stash = gitIn(root, ['stash', 'create'])
  // Exit 1 with nothing said is "no local changes": measured 2026-09-30 after an in-place run
  // restored its files, leaving the index's stat information stale over unchanged content. An
  // unborn HEAD also exits 1, and says why, so it is still refused. Refreshing the index first
  // would write it, which an isolated run must never do (spec F-8).
  const unchanged = stash.status === 1 && !stash.stdout.trim() && !stash.stderr.trim()
  if (stash.error || (stash.status !== 0 && !unchanged)) { drop(); return refuse(gitSaid(stash)) }
  let commit = stash.stdout.trim()
  if (!commit) {
    const head = gitIn(root, ['rev-parse', '--verify', 'HEAD'])
    if (head.error || head.status !== 0) { drop(); return refuse(gitSaid(head)) }
    commit = head.stdout.trim()
  }
  const added = gitIn(root, ['worktree', 'add', '--detach', tree, commit])
  if (added.error || added.status !== 0) { drop(); return refuse(gitSaid(added)) }
  const untracked = gitIn(root, ['ls-files', '--others', '--exclude-standard', '-z'])
  if (untracked.error || untracked.status !== 0) { drop(); return refuse(gitSaid(untracked)) }
  try {
    // Never the campaign's own files: an untracked lock would name the parent, alive, and the
    // child would refuse to run beside it.
    const own = new Set([paths.lock, paths.journal, paths.cache].map(file => path.relative(root, file).split(path.sep).join('/')))
    for (const file of untracked.stdout.split('\0').filter(Boolean)) {
      if (own.has(file)) continue
      const target = path.join(tree, file)
      mkdirSync(path.dirname(target), { recursive: true })
      copyFileSync(path.join(root, file), target)
    }
  } catch (error) {
    drop()
    return refuse(`an untracked file could not be copied (${error.code ?? error.message})`)
  }
  say(`worktree built in ${Date.now() - began} ms`)
  // The selection is the parent's, handed over by label: re-evaluating `--changed` or `--shard`
  // in the worktree compares against the snapshot and reads no timings (spec F-15).
  const selectedFile = path.join(id, 'selected.json')
  writeFileSync(selectedFile, JSON.stringify(selected.map(mutation => mutation.label)))
  const caching = !argv.includes('--no-cache') && !argv.includes('--cache')
  const treeCache = path.join(tree, path.basename(paths.cache))
  if (caching && existsSync(paths.cache)) copyFileSync(paths.cache, treeCache)
  const args = [thisScript, '--in-place', '--root', tree, '--selected', selectedFile]
  if (argv.includes('--no-cache')) args.push('--no-cache')
  // The shard's label rides along for the cache file it writes; the child never re-slices.
  if (argv.includes('--shard')) args.push('--shard', argv[argv.indexOf('--shard') + 1])
  if (argv.includes('--cache')) args.push('--cache', path.resolve(argv[argv.indexOf('--cache') + 1]))
  const { QUALITY_HARNESS_MUTATE_LOCK: _moved, ...inherited } = process.env
  const child = spawn(process.execPath, args, {
    cwd: tree, stdio: 'inherit', detached: process.platform !== 'win32', windowsHide: true,
    // A hang guard for the whole campaign, not a budget: each test run inside it is bounded at
    // three minutes already, and the full catalogue takes hours on one machine.
    timeout: 12 * 60 * 60 * 1000,
    env: { ...inherited, [CAMPAIGN_CHILD]: '1' },
  })
  writeFileSync(ownerFile, JSON.stringify({ parent: process.pid, child: child.pid }))
  writeFileSync(lockPath, `${process.pid} ${child.pid}`)
  let stopped = null
  const stop = signal => {
    if (stopped) return
    stopped = signal
    signalGroup(child.pid, 'SIGTERM')
  }
  process.on('SIGINT', () => stop('SIGINT'))
  process.on('SIGTERM', () => stop('SIGTERM'))
  const ended = await new Promise(resolve => {
    child.once('exit', (code, signal) => resolve({ code, signal }))
    child.once('error', error => resolve({ code: null, signal: null, error }))
  })
  // Nothing is removed while a process of the campaign lives: a grace for the group, then SIGKILL.
  if (!(await groupEnded(child.pid, stopped ? 2_000 : 10_000))) {
    signalGroup(child.pid, 'SIGKILL')
    await groupEnded(child.pid, 10_000)
  }
  if (caching && !stopped && !ended.error) writeBackCache(treeCache, paths.cache, { say })
  drop()
  const loadAtEnd = campaignLoad()
  console.log(loadLine(loadAtStart.load, loadAtEnd.load, loadAtStart.cores))
  if (stopped) return stopped === 'SIGINT' ? 130 : 143
  if (ended.error) {
    say(`the isolated campaign could not start (${ended.error.code ?? ended.error.message})`)
    return 2
  }
  if (ended.signal) {
    say(`the isolated campaign was ended by ${ended.signal} before it finished`)
    return 1
  }
  return ended.code ?? 1
}

/** Files this run will rewrite, so an edit in flight is refused rather than lost. */
function dirtyTargets(selected) {
  const targets = [...new Set(selected.map(mutation => mutation.file))]
  const status = spawnSync('git', ['-C', root, 'status', '--porcelain', '--', ...targets],
    { encoding: 'utf8', timeout: 60_000 })
  if (status.status !== 0) return []
  return status.stdout.split('\n').map(line => line.slice(3).trim()).filter(Boolean)
}


/**
 * The verdict for one catalogue entry, from what was actually observed.
 *
 * Pure so it can be asserted without spawning a campaign. Until ADR-006 this
 * logic lived inline in the loop and had no test of its own — the runner was
 * exercised only by another suite spawning it whole.
 *
 * `baselineOk` is whether the entry's named tests PASSED BEFORE the mutation was
 * applied. Without it a suite already failing for an unrelated reason returns a
 * nonzero exit on every entry that names it, and every one is counted RED —
 * noticed. Nothing was proved: the tests were broken to begin with.
 *
 * What a baseline does NOT prove is that the mutation was EXERCISED. A vacuous
 * assertion — one that could not have failed either way — still reports GREEN,
 * and that is correct here. Coverage was measured 2026-08-28 and cannot see that
 * case: 100% line and 100% branch, before and after, with the test passing and
 * the mechanism broken. See ADR-006.
 */
/**
 * What one unmutated baseline run proved, and why.
 *
 * `false` was not enough. A `spawnSync` that times out returns
 * `{ status: null, signal: 'SIGTERM' }` — no test verdict at all — and storing
 * that as "did not pass" made the report say the suite had ALREADY FAILED and
 * tell the reader to repair it. Nothing failed; nothing ran. Found 2026-08-28
 * by an independent review, in the code written that morning to remove exactly
 * this class from the mutated run. The baseline had inherited the defect it was
 * introduced to fix.
 */
/** How many tests the reporter says ran, or null when the output does not say. */
/**
 * How many LEAF tests the spec reporter says ran — ✔ and ✖ lines whose name is
 * not a path — or null when the output carries no spec markers at all.
 *
 * ⚠ NOT `ℹ tests N`. With a name pattern that matches nothing, Node reports the
 * test FILE as one passing test — `✔ tests/x.test.mjs` and `ℹ tests 1` — so a
 * count read from the summary said 1 where 0 tests ran, and the guard built on
 * it never fired (Codex review, 2026-09-06; reproduced on Node 26). The file
 * wrapper's name is a path with no whitespace, the same discriminator killedBy
 * uses (BACKLOG §53); a test whose NAME looks like a path is discounted with it,
 * which is the documented limit of that rule.
 */
export function leafTestsRun(stdout, files = [], names = []) {
  const text = stdout ?? ''
  if (!/^\s*(?:[✔✖﹣]|ℹ tests) /m.test(text)) return null
  // ⚠ WHICH LINE IS THE FILE WRAPPER IS KNOWN, NOT GUESSED. `files` is what
  // testArgs handed the child, so the wrapper's name is one of those paths and
  // nothing has to be inferred from its shape. The old rule keyed on ABSENCE OF
  // WHITESPACE, and a checkout path containing a space stopped looking like a
  // path: the wrapper survived the filter, counted as a leaf test that passed,
  // and a run in which NOTHING executed became a passing baseline — so every
  // mutant graded against it read GREEN or RED where ADR-005 requires UNPROVEN.
  // Reported by a Windows session from `Y:\qh with spaces` and reproduced on
  // macOS the same day, 2026-09-18; it was never platform-specific.
  const wrappers = new Set(files.flatMap(file => [file, path.resolve(file)]))
  const named = new Set(names)
  const lines = [...text.matchAll(/^\s*[✔✖] (.+?) \(\d[\d.]*ms\)\s*$/gm)]
  const wrapper = m => wrappers.has(m[1]) || wrappers.has(path.resolve(m[1]))
  const leaves = lines
    .filter(m => !wrapper(m))
    // ⚠ THE FALLBACK MAY NOT KEY ON WHITESPACE, and passing `files` is not
    // enough on its own: a caller that omits them — including this project's own
    // end-to-end test — still has to be safe. Node prints the file wrapper ONLY
    // when nothing matched, at column 0, with the path exactly as argv gave it,
    // so nothing about its SHAPE distinguishes it from a leaf whose name happens
    // to look like a path. Measured 2026-09-18 on Windows from `C:\qh fl spaces`
    // and on macOS from a spaced directory: with the old `/^\S+$/` the wrapper
    // survived and a run in which NOTHING executed graded as a passing baseline.
    // Discounting by extension alone can only discount MORE, which turns a
    // `pass` into `unrun` and never the reverse — the safe direction for
    // ADR-005, at the documented cost that a test NAMED like a source file is
    // discounted with it (BACKLOG §53).
    //
    // ADR-073: a line whose exact name a narrowed pattern names is a leaf, whatever it ends in.
    // The discount is for a wrapper the path filter missed, and a wrapper's name is a path, never
    // one of the names a narrowing recorded. Without this a killer named `… for .js` counted one
    // short on a complete run, and short is STALE, which fails the campaign (run 36521596839).
    .filter(m => named.has(m[1]) || !/\.(mjs|js|py|cjs)$/.test(m[1])).length
  // Codex review of ffd4892, P1. A suite prints `✔ <name>` when it completes, the same shape as a
  // test that ran, so a suite whose children were all skipped, or an empty one, counted as a leaf
  // that executed and a baseline of nothing graded `pass`. No line says which it is, but the
  // summary counts only tests that passed or failed, and a suite or a skip adds to neither. So the
  // count is capped at that sum, and output carrying neither line says nothing about how many ran.
  //
  // The summary is the reporter's LAST block: a test file may print a line shaped like it first,
  // and `ℹ pass 7` printed by one lifted the cap. And a file the pattern matched nothing in prints
  // its wrapper as a test that passed, counted in `ℹ pass`, so each KNOWN wrapper is taken off the
  // cap. Only those: a line discounted by its extension may be a suite named like a file, which the
  // summary never counted (a review of the first cap, 2026-09-29).
  const summary = label => [...text.matchAll(new RegExp(`^\\s*ℹ ${label} (\\d+)\\s*$`, 'gm'))].at(-1)
  const passed = summary('pass')
  const failed = summary('fail')
  if (!passed && !failed) return null
  return Math.max(0, Math.min(leaves, Number(passed?.[1] ?? 0) + Number(failed?.[1] ?? 0) - lines.filter(wrapper).length))
}
export function baselineOf(run, files = [], names = []) {
  if (run.signal || run.status === null) return { state: 'unrun', why: run.signal || 'no exit status' }
  // A run in which NO test executed is not a passing baseline, whatever its exit
  // status: a mutant measured against it reads GREEN — "the tests did not
  // notice", said of tests that never ran. Could-not-look, in those words
  // (ADR-005). Output with no spec markers at all is unrun too: the runner OWNS
  // the reporter (testArgs, childEnv), so their absence means the run did not
  // happen the way this reads it — an inherited `--test-reporter=dot` did
  // exactly that before the child's environment was scrubbed.
  const ran = leafTestsRun(run.stdout, files, names)
  if (ran === null) return { state: 'unrun', why: 'the test output carried no spec reporter lines' }
  const named = names.length
  // ADR-073. A narrowed pattern (ADR-072) names its tests, so a passing run of FEWER is not
  // the baseline the entry claims: a killer was renamed, deleted or skipped. Asked before "no
  // test ran", because a narrowed pattern that selects nothing is the same defect, and read as
  // could-not-look it was UNPROVEN, which fails no campaign.
  if (run.status === 0 && named > 0 && ran < named) return { state: 'short', ran, named }
  if (ran === 0) return run.status === 0 ? { state: 'unrun', why: 'no test ran — the name pattern selected nothing' } : { state: 'fail' }
  return run.status === 0 ? { state: 'pass' } : { state: 'fail' }
}

export function classify({ occurrences, baseline, run }) {
  if (occurrences !== 1) {
    // Decided off the tree, before anything is applied: the `from` no longer
    // describes the code, so there is no mutation to be right or wrong about.
    return { verdict: 'STALE', detail: `matches ${occurrences} times` }
  }
  // ADR-073: a narrowed entry that no longer runs every test it names no longer describes its
  // tests, whatever the ones it still runs would do.
  if (baseline?.state === 'short') return { verdict: 'STALE', detail: `its pattern names ${baseline.named} tests and ${baseline.ran} ran` }
  const observed = (run.signal || run.status === null)
    ? 'HUNG'
    : run.status === 0 ? 'GREEN' : 'RED'
  if (baseline.state !== 'pass') return { verdict: 'UNPROVEN', observed, baseline }
  return { verdict: observed, observed, baseline }
}

/**
 * The distinct test-sets a catalogue names, each with the entries that use it.
 *
 * One baseline per SET, not per mutation. Measured 2026-08-28: 204 mutations over
 * 13 distinct sets, so this costs 13 extra spawns — about 6% of a campaign, where
 * a baseline per mutation would roughly double it. Sorted, so two entries naming
 * the same files in a different order share one baseline.
 */
/** The key a baseline is memoised under: the sorted files AND the name pattern. */
export function setKeyOf(entry) {
  const only = typeof entry.only === 'string' && entry.only ? entry.only : ''
  return `${[...entry.tests].sort().join('\0')}\0${only}`
}

export function testSets(mutations) {
  const byKey = new Map()
  for (const mutation of mutations) {
    const tests = [...mutation.tests].sort()
    // `only` narrows what runs, so a baseline taken with one pattern licenses
    // nothing about another: the pattern is part of the set, not a detail of it.
    const only = typeof mutation.only === 'string' && mutation.only ? mutation.only : null
    const key = setKeyOf(mutation)
    if (!byKey.has(key)) byKey.set(key, { tests, only, mutations: [] })
    byKey.get(key).mutations.push(mutation)
  }
  return [...byKey.values()]
}

/**
 * The argv `node` runs for one entry — the SAME for its baseline and its mutant,
 * or the baseline licenses a different measurement than the one taken.
 *
 * `only` is a Node `--test-name-pattern`. A mutant killed by one test in a
 * 149-entry file paid for the whole file, every time — 51 seconds of deliberate
 * sleeps in timeout-tree to learn what one 2-second test would say. The pattern
 * makes a mutant pay for the tests that can see it. The trap is a pattern that
 * matches nothing: Node exits 0 with `ℹ tests 0`, which would read as GREEN.
 * `baselineOf` refuses that run as unrun, so the verdict is UNPROVEN and says why.
 */
export function testArgs(root, entry) {
  const only = typeof entry.only === 'string' && entry.only ? ['--test-name-pattern', entry.only] : []
  // The reporter is OWNED: spec, to stdout, named here — baselineOf reads its
  // leaf lines and killedBy its failing block. It cannot be added ON TOP of an
  // inherited one: Node refuses to start when reporters and destinations do not
  // pair up, so childEnv strips the inherited flags instead.
  return ['--test', '--test-reporter=spec', '--test-reporter-destination=stdout', ...only,
    ...[...entry.tests].sort().map(t => path.join(root, t))]
}

/**
 * The child's environment: the caller's, minus what would change what the
 * child PRINTS. Two inherited variables did that. `--test-reporter=dot` in
 * NODE_OPTIONS made every run print one dot, which read as "no count, trust the
 * exit status" — a passing baseline over tests that produced no evidence they
 * ran. And NODE_TEST_CONTEXT, which `node --test` sets for its own children,
 * makes an inner `node --test` speak the parent runner's binary protocol on a
 * private channel: stdout is EMPTY. Six test files in this repository spawn
 * the campaign from inside `node --test`, so every run they drove had children
 * nobody could read — it worked because exit status alone used to decide.
 */
export function childEnv(base = process.env, scratch = mkdtempSync(path.join(tmpdir(), 'qh-mutate-run-'))) {
  // FORCE_COLOR is dropped for the same reason as the two below it: it changes
  // what a child prints. Under it the spec reporter prefixes every `✔`/`✖` line
  // with an escape code, leafTestsRun finds none, and every baseline in a campaign
  // run from such a shell is `unrun` — nothing measured (BACKLOG §256).
  const { NODE_TEST_CONTEXT: _inherited, FORCE_COLOR: _colour, ...rest } = base
  const tokens = (rest.NODE_OPTIONS ?? '').split(/\s+/).filter(Boolean)
  const kept = tokens.filter((token, i, all) => !/^--test-reporter(?:-destination)?(?:=|$)/.test(token)
    && !(i > 0 && /^--test-reporter(?:-destination)?$/.test(all[i - 1])))
  // ⚠ A PYTHON MUTANT OF THE SAME SIZE READ STALE BYTECODE AND THE CAMPAIGN
  // CALLED IT GREEN. `if other:` → `if False:` is byte-for-byte the same length,
  // and this runner rewrites the file in the same second it measured the last
  // one, so CPython's mtime+size check considered `__pycache__` valid and the
  // child imported the UNMUTATED module. The suite noticed nothing because
  // nothing had changed in the code it ran. Measured 2026-09-13: the same mutant
  // is RED with the cache cleared. Every child gets its own cache directory.
  // And everything else a child writes to a temp directory lands in `scratch`, which
  // `runChild` removes when the child ends. A campaign re-runs suites once per mutant,
  // and what a test forgot stayed once per mutant: 15,885 `qh-sweep-*` from one test
  // file on one Mac (BACKLOG §310).
  return {
    ...rest,
    NODE_OPTIONS: kept.join(' '),
    QUALITY_HARNESS_MUTATION_IN_FLIGHT: '1',
    PYTHONDONTWRITEBYTECODE: '1',
    PYTHONPYCACHEPREFIX: path.join(scratch, 'pycache'),
    TMPDIR: scratch,
    TMP: scratch,
    TEMP: scratch,
  }
}

/** One child of the campaign, in a scratch temp directory removed when it ends. */
function runChild(root, args, timeoutMs) {
  const scratch = mkdtempSync(path.join(tmpdir(), 'qh-mutate-run-'))
  try {
    return spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8', timeout: timeoutMs, env: childEnv(process.env, scratch) })
  } finally { rmSync(scratch, { recursive: true, force: true }) }
}
/**
 * The test names that failed in a mutated run, read from the reporter's own
 * "failing tests" block.
 *
 * A RED verdict says the suite noticed; it never said WHAT noticed, because the
 * campaign reads an exit status and discards the output. So a mutant killed by
 * an unrelated assertion in the same file — or by a second guard in a caller,
 * which happened in this repository once (CLAUDE.md §4) — is indistinguishable
 * from one killed by the assertion it claims to prove. The names were already in
 * the captured stdout; keeping them costs nothing.
 *
 * REPORTS, never judges. Whether the name that fired is the RIGHT one is a
 * maintainer's read: the catalogue names test FILES, not test names, so a gate
 * deciding this would be asserting a mapping nobody has written down. Raised
 * 2026-08-29 by the team-memory session, whose campaigns share the blind spot.
 */
export function killedBy(stdout) {
  if (!stdout) return []
  const block = stdout.split('failing tests:')[1]
  if (!block) return []
  // The reporter prints "✖ <name> (1.2ms)" per failure. A file-level failure
  // repeats the file's own path with no subtest — BACKLOG §49's shape — and is
  // dropped here rather than reported as an assertion name it is not.
  //
  // THE DISCRIMINATOR IS "LOOKS LIKE A PATH", NOT "CONTAINS A SEPARATOR". The
  // first version dropped anything holding `/`, which took three real assertion
  // names with it — `a bin/ gate is spawned…`, `a docs/adr that yields nothing
  // says so`, `a directory in bin/ is not a gate…` — and four mutants were
  // reported killed by nobody while a correctly-named test had killed them
  // (BACKLOG §53, measured 2026-09-01 over the full campaign).
  //
  // A path the reporter prints has no whitespace in it; a test name in this
  // suite always does. Requiring BOTH — no whitespace AND a source extension —
  // keeps §49's row out without eating names that merely mention a directory.
  return [...block.matchAll(/^\s*\u2716 (.+?) \(\d[\d.]*ms\)\s*$/gm)]
    .map(m => m[1])
    .filter(name => !(/^\S+$/.test(name) && /\.(mjs|js|py|cjs)$/.test(name)))
}

/** One report line. UNPROVEN names the failing set and what to do about it. */
export function renderLine(result, width) {
  const note = result.verdict === 'GREEN' ? '  <- the tests did not notice'
    : result.verdict === 'STALE' ? `  <- ${result.detail}`
    : result.verdict === 'HUNG' ? '  <- noticed, but by hanging rather than failing'
    // A kill names its killer where the reporter gave one. Silence when it did
    // not: an empty list is "the names were not recoverable", never a claim that
    // nothing fired.
    // ONE PER LINE, not comma-joined. 138 of this suite's 462 test names contain
    // `, ` themselves, so a joined list cannot be separated back into names —
    // and two figures were computed from one before anybody checked (§53).
    : result.verdict === 'RED' && result.killers?.length
      ? `  <- killed by:\n${result.killers.map(k => `       ${k}`).join('\n')}`
    // The verdict the tests produced stays visible beside the warning, and the
    // line says what to CHANGE rather than only what is wrong — the lesson
    // ADR-005 applied to spec-verify, one tool over.
    : result.verdict === 'UNPROVEN'
      // Two different things, and saying the same words about both is the defect
      // this whole verdict exists to remove. A suite that FAILED needs repairing;
      // a baseline that never finished needs re-running, or a longer timeout, and
      // telling its author to repair a suite sends them after code that is fine.
      ? result.baseline?.state === 'unrun'
        ? `  <- ${result.observed}, but the baseline for ${result.tests.join(', ')} never finished `
          + `(${result.baseline.why}), so nothing was measured against it — re-run, or raise the `
          + 'timeout, before reading any verdict from this set'
        : `  <- ${result.observed}, but ${result.tests.join(', ')} already failed before this `
          + 'mutation was applied; repair that suite and re-run — nothing here is evidence yet'
      : ''
  return `${result.verdict.padEnd(8)} ${result.label.padEnd(width)}${note}`
}

/**
 * The campaign's counts. An UNPROVEN entry is in NEITHER half of the ratio:
 * counting it in the denominator would make a broken suite read as a campaign
 * with poor coverage, which is a different problem with a different fix.
 */
/**
 * The content key a verdict rests on, or null when any input is unreadable.
 *
 * ADR-023. A mutant is (file, from, to, tests) and its verdict is a pure
 * function of those plus the bytes they name. Hash all of it: if every input is
 * byte-identical, re-running is recomputation and cannot produce a different
 * answer. That is what makes reuse honest here and dishonest for a recorded
 * claim (ADR-010) — a claim and its subject are separate things that drift, and
 * a content key makes that drift unrepresentable rather than merely unlikely.
 *
 * ⚠ CONTENT, never a timestamp, a run id or a commit range. A range is history:
 * a rebase, a force-push, a cherry-pick or a revert all produce one that
 * misdescribes what the files hold.
 *
 * ⚠ NULL WHEN ANYTHING IS UNREADABLE, rather than hashing a placeholder. A
 * missing file that hashed to a stable value would freeze the verdict of an
 * entry whose test was deleted — "I could not look" is not "nothing changed"
 * (ADR-005).
 */
export function cacheKey(mutation, readFile) {
  const hash = createHash('sha256')
  // The edit itself, first: a mutation whose from/to text changed is a
  // different mutant even against identical files.
  for (const part of [mutation.file, mutation.from, mutation.to, mutation.only ?? '']) {
    hash.update(String(part)); hash.update('\0')
  }
  // Sorted, so two entries naming the same tests in a different order share a
  // key — the same reason ADR-006 sorts before memoising a baseline.
  for (const name of [mutation.file, ...[...mutation.tests].sort()]) {
    const bytes = readFile(name)
    if (bytes === null || bytes === undefined) return null
    hash.update(name); hash.update('\0'); hash.update(bytes); hash.update('\0')
  }
  return hash.digest('hex')
}

/**
 * The stored verdict this run may reuse, or null to measure it.
 *
 * ONLY `RED`. A `GREEN` mutant is an open finding about a test and must be
 * re-run every time until it is fixed; reusing one hides live work. `UNPROVEN`
 * likewise — ADR-006 says a verdict against a failing baseline is evidence of
 * nothing, and a stored one is worse because it looks settled.
 */
export function reusable(mutation, cache, key) {
  if (!key || !cache || typeof cache !== 'object') return null
  const hit = cache[key]
  return hit && hit.verdict === 'RED' ? hit : null
}

/** The cache at `file`, or {} when it is absent, empty or unparseable. */
export function loadCache(file, read = readFileSync) {
  try {
    const parsed = JSON.parse(read(file, 'utf8'))
    // A shape that is not an object of entries is "could not look", not "empty".
    return parsed && typeof parsed.entries === 'object' && parsed.entries ? parsed.entries : {}
  } catch {
    return {}
  }
}

/**
 * The i-th of n shards, balanced by measured cost rather than by index.
 *
 * BACKLOG §106. Index slicing gave 24.6 / 16.1 / 18.1 / 21.3 minutes over four
 * shards: even counts, uneven cost, because three suites are 86% of the
 * campaign and the run waits for the slowest.
 *
 * Longest-processing-time-first: sort by cost descending, then repeatedly give
 * the next entry to the shard with the least work so far. Deterministic for a
 * given input, which matters because eight CI jobs each compute their own slice
 * independently and must agree on the partition without talking to each other.
 *
 * ⚠ THE COSTS ARE MEASURED, NEVER TABULATED. §106 was deferred because the
 * obvious implementation is a hardcoded per-suite table — a list kept beside the
 * artifact, right on the day it is written and silently wrong after any suite
 * changes, with nothing to report the drift. `cost` reads the previous
 * campaign's own timings out of ADR-023's cache instead, so a stale estimate
 * fixes itself on the next run.
 *
 * An entry with no timing sorts FIRST, at Infinity: an unmeasured mutant is the
 * one whose cost is unknown, and putting the unknowns on separate shards is the
 * safer guess than assuming they are cheap. With no timings at all this degrades
 * to round-robin, which partitions correctly and claims nothing about balance.
 */
export function shardByCost(mutations, index, total, cost) {
  if (total <= 1) return [...mutations]
  const ordered = mutations
    .map((mutation, at) => ({ mutation, at, ms: cost(mutation) }))
    // `at` breaks ties, so the order is total and every shard derives the same
    // partition from the same catalogue without coordinating.
    .sort((a, b) => (b.ms ?? Infinity) - (a.ms ?? Infinity) || a.at - b.at)
  const loads = Array.from({ length: total }, () => 0)
  const bins = Array.from({ length: total }, () => [])
  for (const entry of ordered) {
    let lightest = 0
    for (let i = 1; i < total; i += 1) if (loads[i] < loads[lightest]) lightest = i
    bins[lightest].push(entry)
    // ⚠ AN UNKNOWN COST IS ONE UNIT, NEVER ZERO. With `?? 0` every load stayed 0,
    // `lightest` was always bin 0, and a campaign with no timings put ALL 443
    // entries in shard 1 and left the other seven empty — `shard 4/8: 0 of 443`,
    // which is what broke every mutation job in CI while passing here, where a
    // cache happened to exist. The claim in this function's own docstring, that
    // it degrades to round-robin, is only true with this line.
    loads[lightest] += entry.ms ?? 1
  }
  // Back into catalogue order within the shard, so a campaign's log reads the
  // way the file does rather than by descending cost.
  return bins[index - 1].sort((a, b) => a.at - b.at).map(e => e.mutation)
}


export function summarise(results) {
  const unproven = results.filter(r => r.verdict === 'UNPROVEN')
  const judged = results.filter(r => r.verdict !== 'UNPROVEN')
  const missed = judged.filter(r => r.verdict === 'GREEN' || r.verdict === 'STALE')
  // Whether the failing set is ENTIRELY stale. A stale mutation is not a finding
  // about a test — nothing was applied, so no test was challenged — and saying
  // otherwise borrows the vocabulary of a verdict for a check that could not run.
  const staleOnly = missed.length > 0 && missed.every(r => r.verdict === 'STALE')
  // ADR-023 T2. A campaign printing `430/430 noticed` while running six claims
  // more than happened. These two are reported beside the ratio, never folded
  // into it: the ratio is ADR-006's and means the same thing it always did.
  const reused = judged.filter(r => r.reused).length
  return {
    total: judged.length,
    noticed: judged.length - missed.length,
    reused,
    measured: judged.length - reused,
    unproven: unproven.length,
    // Unchanged by ADR-006: GREEN and STALE fail the run. An UNPROVEN entry
    // instructs and does not block — a block leaves the user with no next move,
    // and the line above has just told them what theirs is.
    failing: missed.length > 0,
    staleOnly,
  }
}


/**
 * Catalogue entries whose `from` no longer matches its file exactly once, each with
 * the count and, when it matches nothing, the current line most like the first
 * line of `from` — the re-anchor hint. Pure (`read` is the seam).
 *
 * Every fix that moves a line a mutant names leaves that entry matching nothing, and
 * the suite says so only as a list of labels at the end of a five-minute gate. This
 * answers the same question in a second, with where the line went (BACKLOG §280).
 */
export function staleEntries(mutations, read) {
  const texts = new Map()
  const textOf = file => {
    if (!texts.has(file)) texts.set(file, read(file))
    return texts.get(file)
  }
  const words = line => new Set(line.split(/[^A-Za-z0-9_]+/).filter(word => word.length > 2))
  const stale = []
  for (const mutation of mutations) {
    const text = textOf(mutation.file)
    if (text == null) {
      stale.push({ label: mutation.label, file: mutation.file, count: null, hint: null })
      continue
    }
    const count = text.split(mutation.from).length - 1
    if (count === 1) continue
    let hint = null
    if (count === 0) {
      const wanted = words(mutation.from.split('\n').find(line => line.trim()) ?? '')
      let best = 0
      text.split('\n').forEach((line, index) => {
        const have = words(line)
        const shared = [...wanted].filter(word => have.has(word)).length
        const score = wanted.size ? shared / wanted.size : 0
        if (score > best) { best = score; hint = { line: index + 1, text: line.trim() } }
      })
      if (best < 0.5) hint = null
    }
    stale.push({ label: mutation.label, file: mutation.file, count, hint })
  }
  return stale
}

// ADR-072 Decision 2, as T4 reads it after the Codex review of T1 and T2: a test is
// defined in a file when its name is one of the file's string literal TOKENS. A name left
// in a comment, inside a fixture string or in a regular expression defines nothing, and a
// name built at runtime (a template with `${…}`) is no token, so an entry it kills is refused.
function definesTest(source, name) {
  return typeof source === 'string' && literalsOf(source).has(name)
}

// The string literal tokens of a JavaScript source: '…', "…" and a template with no hole,
// each as written between its quotes. It reads past comments, regular-expression literals
// and template holes. Not a parser (CLAUDE.md §16): a `/` opens a regular expression after
// an operator, an opening bracket, a keyword that takes an expression, or nothing, and is a
// division after anything else. T4 measured it over every test file the catalogue names.
const REGEX_AFTER = new Set(['(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '<', '>', '~', '^'])
const REGEX_KEYWORDS = new Set(['return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw', 'case', 'do', 'else', 'yield', 'await'])
// A condition in parentheses after one of these is followed by a statement, where a `/`
// opens a regular expression (T5, the second Codex review: `if (x) /'a'/.test(y)`).
const CONTROL_KEYWORDS = new Set(['if', 'while', 'for', 'with'])
const literalTokens = new Map()
function literalsOf(source) {
  if (literalTokens.has(source)) return literalTokens.get(source)
  const found = new Set()
  // For each open template hole, how many `{` it has opened since.
  const holes = []
  // For each open `(`, whether a control keyword came before it.
  const parens = []
  let last = ''
  let i = 0
  // A template's text from `from` to its closing backtick or its next hole.
  const template = from => {
    let j = from
    while (j < source.length && source[j] !== '`' && !(source[j] === '$' && source[j + 1] === '{')) j += source[j] === '\\' ? 2 : 1
    return { text: source.slice(from, j), end: j, hole: source[j] === '$' }
  }
  while (i < source.length) {
    const c = source[i]
    if (c === '/' && source[i + 1] === '/') { const end = source.indexOf('\n', i); i = end < 0 ? source.length : end; continue }
    if (c === '/' && source[i + 1] === '*') { const end = source.indexOf('*/', i + 2); i = end < 0 ? source.length : end + 2; continue }
    if (c === "'" || c === '"') {
      let j = i + 1
      while (j < source.length && source[j] !== c && source[j] !== '\n') j += source[j] === '\\' ? 2 : 1
      if (source[j] === c) found.add(source.slice(i + 1, j))
      i = j + 1
      last = 'value'
      continue
    }
    if (c === '`' || (c === '}' && holes[holes.length - 1] === 0)) {
      if (c === '}') holes.pop()
      const part = template(i + 1)
      if (part.hole) { holes.push(0); i = part.end + 2; last = '{'; continue }
      if (c === '`' && source[part.end] === '`') found.add(part.text)
      i = part.end + 1
      last = 'value'
      continue
    }
    if (holes.length && c === '{') holes[holes.length - 1] += 1
    if (holes.length && c === '}') holes[holes.length - 1] -= 1
    if (c === '/') {
      if (last === '' || REGEX_AFTER.has(last) || REGEX_KEYWORDS.has(last)) {
        let j = i + 1
        let inClass = false
        while (j < source.length && source[j] !== '\n' && (inClass || source[j] !== '/')) {
          if (source[j] === '\\') j += 1
          else if (source[j] === '[') inClass = true
          else if (source[j] === ']') inClass = false
          j += 1
        }
        i = j + 1
        while (i < source.length && /[A-Za-z]/.test(source[i])) i += 1
        last = 'value'
        continue
      }
      last = '/'
      i += 1
      continue
    }
    if (/\s/.test(c)) { i += 1; continue }
    if (/[\w$]/.test(c)) {
      let j = i + 1
      while (j < source.length && /[\w$]/.test(source[j])) j += 1
      const word = source.slice(i, j)
      last = REGEX_KEYWORDS.has(word) || CONTROL_KEYWORDS.has(word) ? word : 'value'
      i = j
      continue
    }
    if (c === '(') parens.push(CONTROL_KEYWORDS.has(last))
    if (c === ')') { last = parens.pop() ? ';' : ')'; i += 1; continue }
    // A `++` or `--` right after a value is postfix, and the value stands: a `/` after it divides.
    if ((c === '+' || c === '-') && source[i + 1] === c && (last === 'value' || last === ')' || last === ']')) { i += 2; continue }
    last = c
    i += 1
  }
  literalTokens.set(source, found)
  return found
}

// A test name as a pattern that matches only that name: every metacharacter escaped.
function escapeName(name) {
  return name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * ADR-072 Decision 3: the `only` that runs just the tests the cache saw kill `entry`, or
 * why it cannot be narrowed. `record` is the cache record at the entry's current key, and
 * `sources` reads a test file by its catalogue path. Pure.
 */
export function narrowEntry(entry, record, sources) {
  if (typeof entry.only === 'string' && entry.only) return { verdict: 'refused', why: 'it already has an only' }
  if (!record || record.verdict !== 'RED') return { verdict: 'refused', why: 'no RED verdict at its current key' }
  if (!Array.isArray(record.killers) || !record.killers.length) return { verdict: 'refused', why: 'no killers were recorded' }
  const killers = [...new Set(record.killers)]
  const texts = entry.tests.map(sources)
  const missing = killers.find(name => !texts.some(text => definesTest(text, name)))
  if (missing !== undefined) {
    return { verdict: 'refused', why: `a killer is not a string literal in a file it names: ${JSON.stringify(missing)}` }
  }
  return { verdict: 'narrowed', only: `^(?:${killers.map(escapeName).join('|')})$` }
}

// The names a narrowed pattern selects, or null for a pattern `--narrow` did not write.
function namesOf(only) {
  if (typeof only !== 'string' || !only.startsWith('^(?:') || !only.endsWith(')$')) return null
  const names = ['']
  const inner = only.slice(4, -2)
  for (let i = 0; i < inner.length; i += 1) {
    if (inner[i] === '\\') names[names.length - 1] += inner[++i] ?? ''
    else if (inner[i] === '|') names.push('')
    else names[names.length - 1] += inner[i]
  }
  return names
}

// ADR-072 Decision 5: each narrowed entry whose pattern names a test that no file it
// names defines. Its pattern would select nothing, and an entry that selects nothing is
// UNPROVEN, which fails no campaign.
function undefinedKillers(mutations, read) {
  const found = []
  for (const mutation of mutations) {
    const names = namesOf(mutation.only)
    if (!names) continue
    const texts = mutation.tests.map(read)
    const missing = names.filter(name => !texts.some(text => definesTest(text, name)))
    if (missing.length) found.push({ label: mutation.label, missing })
  }
  return found
}

// An entry's EDIT: the text between the longest common prefix and suffix of its
// `from` and `to`. `oldMid` is what the mutation removes, `newMid` what it puts there.
function editOf(from, to) {
  let prefix = 0
  while (prefix < from.length && prefix < to.length && from[prefix] === to[prefix]) prefix += 1
  let suffix = 0
  while (suffix < from.length - prefix && suffix < to.length - prefix
    && from[from.length - 1 - suffix] === to[to.length - 1 - suffix]) suffix += 1
  return { oldMid: from.slice(prefix, from.length - suffix), newMid: to.slice(prefix, to.length - suffix) }
}

/**
 * ADR-069. A stale entry, repointed by re-applying its own edit to the line
 * `staleEntries` hints at, or refused naming the first of the record's conditions
 * that fails. `added` is the set of lines (trimmed, as `addedLines` gives them) the
 * change since `--since` added to the entry's file, or null when that diff could not
 * be read. Measured on the 3.1.0 batch: the nearest line of every mechanical repoint
 * was added by the change, and a cold review found 83 of 1,138 entries proposed onto
 * an unchanged sibling without condition 5. Pure.
 */
export function repointEntry(entry, text, added) {
  if (text == null) return { verdict: 'refused', why: 'the file could not be read' }
  const count = text.split(entry.from).length - 1
  if (count === 1) return { verdict: 'current' }
  if (count > 1) return { verdict: 'refused', why: `ambiguous: \`from\` matches ${count} times` }
  if (entry.from.includes('\n')) return { verdict: 'refused', why: '1: a multi-line entry is repointed by hand' }
  const [stale] = staleEntries([entry], () => text)
  if (!stale?.hint) return { verdict: 'refused', why: '2: no line shares half the words of `from`' }
  const line = text.split('\n')[stale.hint.line - 1]
  const { oldMid, newMid } = editOf(entry.from, entry.to)
  if (!oldMid) return { verdict: 'refused', why: '3: the entry only inserts, so there is no edited text to find' }
  const onLine = line.split(oldMid).length - 1
  if (onLine !== 1) return { verdict: 'refused', why: `3: the edited text occurs ${onLine} times on the nearest line` }
  const inFile = text.split(line).length - 1
  if (inFile !== 1) return { verdict: 'refused', why: `4: the nearest line occurs ${inFile} times in the file` }
  if (added === null) return { verdict: 'refused', why: '5: the diff since the ref could not be read' }
  if (!added.has(line.trim())) return { verdict: 'refused', why: '5: the nearest line was not added by the change, so it is another mechanism' }
  return { verdict: 'repointed', from: line, to: line.replace(oldMid, () => newMid) }
}

/**
 * ADR-071. An entry `repointEntry` refuses at its condition 2 or 3, re-anchored on the
 * text around its edit: the common prefix P and suffix S of `from` and `to`, each
 * ended on a word boundary, found on a line the change added. Every other verdict is
 * `repointEntry`'s, unchanged. Replayed on the 3.1.0 and 3.1.1 batches (2026-09-28):
 * no proposal differs from the hand repoint. Each refusal names its rule. Pure.
 */
export function reanchorEntry(entry, text, added) {
  const verdict = repointEntry(entry, text, added)
  if (verdict.verdict !== 'refused' || !/^[23]:/.test(verdict.why)) return verdict
  if (added === null) return { verdict: 'refused', why: 'the diff: the diff since the ref could not be read' }
  const { from, to } = entry
  let p = 0
  while (p < from.length && p < to.length && from[p] === to[p]) p += 1
  let s = 0
  while (s < from.length - p && s < to.length - p && from[from.length - 1 - s] === to[to.length - 1 - s]) s += 1
  // The anchors end on a word boundary, as seen in `from`: 'alias' and 'argv' share an
  // `a` that is not an anchor, and cutting there lost the alias row of the 3.1.1 batch.
  const word = ch => /\w/.test(ch ?? '')
  while (p > 0 && word(from[p - 1]) && word(from[p])) p -= 1
  while (s > 0 && word(from[from.length - s]) && word(from[from.length - s - 1])) s -= 1
  const P = from.slice(0, p)
  const S = from.slice(from.length - s)
  const newMid = to.slice(p, to.length - s)
  const significant = (P + S).replace(/\s/g, '').length
  if (significant < 8) {
    return { verdict: 'refused', why: `the anchor floor: the text around the edit holds ${significant} significant characters, fewer than 8` }
  }
  const once = (hay, needle) => hay.split(needle).length - 1 === 1
  // A candidate is a line the change added holding P, then S, each once. An empty P
  // anchors at the start of the line and an empty S at its end.
  const fits = line => added.has(line.trim())
    && (!P || once(line, P)) && (!S || once(line, S))
    && (P ? line.indexOf(P) + P.length : 0) <= (S ? line.lastIndexOf(S) : line.length)
  const lines = text.split('\n')
  const candidates = lines.filter(fits)
  let line = candidates.length === 1 ? candidates[0] : null
  if (candidates.length > 1) {
    const [stale] = staleEntries([entry], () => text)
    const nearest = stale?.hint ? lines[stale.hint.line - 1] : null
    line = candidates.includes(nearest) ? nearest : null
  }
  if (line === null) {
    return { verdict: 'refused', why: candidates.length === 0
      ? 'one added line: no line the change added holds the text around the edit'
      : `one added line: ${candidates.length} added lines hold it, and the nearest line is none of them` }
  }
  if (!once(text, line)) return { verdict: 'refused', why: 'one in the file: the chosen line occurs more than once in the file' }
  const head = line.slice(0, P ? line.indexOf(P) + P.length : 0)
  const tail = S ? line.slice(line.lastIndexOf(S)) : ''
  return { verdict: 'reanchored', from: line, to: head + newMid + tail }
}

/**
 * The entries a change reaches: those whose `from` sits on a line the change ADDED
 * to that entry's file. A new mutant names new code, and a mutant whose code was
 * edited names the edit, so both are picked; an untouched mutant in a touched file
 * is not, which is what keeps this narrower than "every entry for adr-lint" (all of
 * them, when one line of adr-lint changed). `added` maps a file to its added lines,
 * trimmed. Pure; `main` builds it from `git diff -U0 <ref>`.
 *
 * Where `where` can locate the `from` in the file as it is now, WHERE it sits
 * decides, however short its text: the twelve-character text rule below skipped
 * `if frozen:`, a mutant the change itself added (Codex review of 833ea52). The
 * text rule remains for a file that cannot be read.
 */
export function touchedBy(mutations, added, where = null) {
  return mutations.filter(mutation => {
    const lines = added.get(mutation.file)
    if (lines === undefined) return false
    const numbers = where?.numbers?.get(mutation.file)
    const source = numbers ? where.readSource(mutation.file) : null
    const at = typeof source === 'string' ? source.indexOf(mutation.from) : -1
    if (at >= 0) {
      const first = source.slice(0, at).split('\n').length
      const count = mutation.from.split('\n').length
      return Array.from({ length: count }, (_, i) => first + i).some(line => numbers.has(line))
    }
    // A mutant often names PART of a line (`lines.has(x)` inside a longer
    // condition), so a from-line counts when an added line contains it. Lines under
    // twelve characters — `return 1`, `}` — are too common to say which code a
    // mutant names, and matched unrelated entries when they counted.
    return mutation.from.split('\n').map(line => line.trim()).filter(line => line.length >= 12)
      .some(line => [...lines].some(addedLine => addedLine.includes(line)))
  })
}

/**
 * The `git diff` `--changed` reads, in one fixed shape: `addedLines` parses
 * `+++ b/<file>`, and a user's own `diff.noprefix`, `diff.mnemonicPrefix`, colour
 * or external diff tool changes that header, so every entry missed and the run
 * said "no mutation matches" (cold review of 833ea52).
 */
export function changedDiffArgs(root, ref) {
  return ['-C', root, 'diff', '--no-color', '--no-ext-diff', '--src-prefix=a/', '--dst-prefix=b/', '-U0', ref, '--']
}

/** Added lines per file from `git diff -U0` output, each trimmed. */
export function addedLines(diff) {
  const added = new Map()
  let file = null
  for (const line of diff.split('\n')) {
    if (line.startsWith('+++ ')) {
      file = line === '+++ /dev/null' ? null : line.replace(/^\+\+\+ b\//, '')
      if (file && !added.has(file)) added.set(file, new Set())
    } else if (file && line.startsWith('+') && line.slice(1).trim()) {
      added.get(file).add(line.slice(1).trim())
    }
  }
  return added
}

/** The NUMBERS of the added lines per file, from the `@@ … +start,count @@` headers of `git diff -U0`. */
export function addedLineNumbers(diff) {
  const numbers = new Map()
  let file = null
  for (const line of diff.split('\n')) {
    if (line.startsWith('+++ ')) {
      file = line === '+++ /dev/null' ? null : line.replace(/^\+\+\+ b\//, '')
      if (file && !numbers.has(file)) numbers.set(file, new Set())
      continue
    }
    const hunk = file && /^@@ -\S+ \+(\d+)(?:,(\d+))? @@/.exec(line)
    if (hunk) {
      const start = Number(hunk[1])
      const count = hunk[2] === undefined ? 1 : Number(hunk[2])
      for (let n = start; n < start + count; n += 1) numbers.get(file).add(n)
    }
  }
  return numbers
}

// What each field of a catalogue entry must be, and the words that say so. `only` may be absent.
const ENTRY_FIELDS = [
  ['label', 'a string', value => typeof value === 'string'],
  ['file', 'a string', value => typeof value === 'string'],
  ['from', 'a string', value => typeof value === 'string'],
  ['to', 'a string', value => typeof value === 'string'],
  ['tests', 'an array of strings', value => Array.isArray(value) && value.every(test => typeof test === 'string')],
  ['only', 'a string when present', value => value === undefined || typeof value === 'string'],
]

// Why `catalogue` is not `{ mutations: [entry, …] }`, or null when it is (BACKLOG §319 item 12).
// A catalogue of another shape crashed later with a TypeError at exit 1, the status of a stale
// finding, and an entry that was not a mutation passed a check of the top level alone: `--stale`
// printed `unreadable  undefined :: undefined` for `{"mutations":[42]}`. The first bad entry is
// named by its index, and by its label when it has one, among over a thousand.
function catalogueShapeError(catalogue) {
  if (!Array.isArray(catalogue?.mutations)) return 'it must be a JSON object whose "mutations" is an array'
  for (const [index, entry] of catalogue.mutations.entries()) {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) return `entry ${index} must be an object`
    const wrong = ENTRY_FIELDS.find(([key, , holds]) => !holds(entry[key]))
    if (wrong) return `entry ${index}${typeof entry.label === 'string' ? ` (${JSON.stringify(entry.label)})` : ''}'s "${wrong[0]}" must be ${wrong[1]}`
  }
  return null
}

export function main(argv) {
  // An unknown option used to be ignored in silence, and the run it produced
  // looked exactly like the run that was asked for. Measured 2026-08-27:
  // `--filter 'sync:'` — the flag is `--case` — selected nothing, so the filter
  // stayed null and all 181 mutations ran for twenty minutes while the caller
  // waited on three. Every gate in this project names the offending option.
  const KNOWN = new Set(['--write', '--case', '--list', '--force', '--shard', '--no-cache', '--cache', '--stale', '--changed', '--repoint', '--reanchor', '--since', '--root', '--narrow', '--in-place', '--selected'])
  const unknown = argv.filter(argument => argument.startsWith('--') && !KNOWN.has(argument))
  if (unknown.length) {
    process.stderr.write(`mutate: unknown option: ${unknown[0]}\n`
      + 'usage: mutate.mjs [--case <substring>] [--changed <ref>] [--shard i/n] [--list] [--stale] [--repoint [--reanchor] [--since <ref>] [--write]] [--narrow [--write]] [--root <dir>] [--force] [--no-cache] [--cache <path>] [--in-place]\n')
    return 2
  }
  // ADR-075: `--selected` is the isolated child's, handed to it by its parent; nothing else passes it.
  if (argv.includes('--selected') && process.env[CAMPAIGN_CHILD] !== '1') {
    process.stderr.write('mutate: --selected is the isolated child\'s own option, not one to pass\n')
    return 2
  }
  // ADR-069: one root for the catalogue, the sources, the lock, the journal and the cache.
  if (argv.includes('--root')) {
    const dir = argv[argv.indexOf('--root') + 1]
    if (!dir || dir.startsWith('--')) {
      process.stderr.write('mutate: --root wants a directory\n')
      return 2
    }
    root = path.resolve(dir)
  }
  const paths = campaignPaths(root)
  lockPath = paths.lock
  journalPath = paths.journal
  let catalogue
  try {
    catalogue = JSON.parse(readFileSync(paths.catalogue, 'utf8'))
  } catch (error) {
    process.stderr.write(`mutate: could not read ${paths.catalogue}: ${error?.message ?? error}\n`)
    return 2
  }
  // Refused before any branch reads it, at exit 2: could-not-read, never a stale finding's 1.
  const malformed = catalogueShapeError(catalogue)
  if (malformed) {
    process.stderr.write(`mutate: ${paths.catalogue} is not a mutation catalogue: ${malformed}\n`)
    return 2
  }
  const filter = argv.includes('--case') ? argv[argv.indexOf('--case') + 1] : null
  // ADR-072 T4: --narrow refuses an option it does not take before any branch does work,
  // or `--repoint --write` would rewrite the catalogue first and the refusal come after it.
  if (argv.includes('--narrow')) {
    const alongside = ['--force', '--repoint', '--stale', '--list', '--shard', '--changed'].filter(flag => argv.includes(flag))
    if (alongside.length) {
      process.stderr.write(`mutate: --narrow measures every entry it narrows, over committed sources, so it does not take ${alongside.join(', ')}\n`)
      return 2
    }
  }
  // `--stale`, `--repoint` and `--changed` are read-only questions about the catalogue,
  // so they are answered before the campaign lock (BACKLOG §280, the tooling half).
  if (argv.includes('--stale')) {
    const readSource = file => { try { return readFileSync(path.join(root, file), 'utf8') } catch { return null } }
    const stale = staleEntries(catalogue.mutations, readSource)
    for (const entry of stale) {
      console.log(`${entry.count === null ? 'unreadable' : `${entry.count}x`}  ${entry.file} :: ${entry.label}`
        + (entry.hint ? `\n  nearest now: ${entry.file}:${entry.hint.line}  ${entry.hint.text}` : ''))
    }
    // ADR-072: a narrowed entry whose killer is gone selects nothing; name it too.
    const orphaned = undefinedKillers(catalogue.mutations, readSource)
    for (const entry of orphaned) {
      console.log(`killer gone  ${entry.label} :: no file it names defines ${entry.missing.map(name => JSON.stringify(name)).join(', ')}`)
    }
    console.log(stale.length
      ? `${stale.length} catalogue entr${stale.length === 1 ? 'y does' : 'ies do'} not match the source exactly once`
      : 'every entry matches its source exactly once')
    if (orphaned.length) {
      console.log(`${orphaned.length} narrowed entr${orphaned.length === 1 ? 'y names' : 'ies name'} a test that no file it names defines`)
    }
    return stale.length || orphaned.length ? 1 : 0
  }
  // ADR-069: each stale entry, repointed by its own edit or refused with the condition
  // that failed. Writes nothing; exits 1 while anything is stale, as `--stale` does.
  // ADR-069 T2: `--write` rewrites the proposals and measures them. The lock comes
  // FIRST, before any source is read: a live campaign's mutated source would be read
  // as the refactor, and its proposal would be written over the real one.
  let repointed = null
  // ADR-071: --reanchor re-anchors what --repoint refuses, so on its own it asks nothing.
  if (argv.includes('--reanchor') && !argv.includes('--repoint')) {
    process.stderr.write('mutate: --reanchor re-anchors what --repoint refuses, so it needs --repoint\n')
    return 2
  }
  if (argv.includes('--repoint')) {
    const since = argv.includes('--since') ? argv[argv.indexOf('--since') + 1] : 'HEAD'
    if (!since || since.startsWith('--')) {
      process.stderr.write('mutate: --since wants a git ref\n')
      return 2
    }
    const writing = argv.includes('--write')
    if (writing) {
      process.on('exit', () => { releaseTheRun() })
      if (!claimTheRun()) return 2
      recover()
    }
    const texts = new Map()
    const textOf = file => {
      if (!texts.has(file)) texts.set(file, (() => { try { return readFileSync(path.join(root, file), 'utf8') } catch { return null } })())
      return texts.get(file)
    }
    const diffs = new Map()
    const addedIn = file => {
      if (!diffs.has(file)) {
        const run = spawnSync('git', [...changedDiffArgs(root, since), file], { encoding: 'utf8', timeout: 60_000, maxBuffer: 64 * 1024 * 1024 })
        diffs.set(file, run.error || run.status !== 0 ? null : (addedLines(run.stdout).get(file) ?? new Set()))
      }
      return diffs.get(file)
    }
    let stale = 0
    let proposed = 0
    let reanchored = 0
    // Without --reanchor, ADR-069's rule alone answers, and the output is what it was.
    const reanchoring = argv.includes('--reanchor')
    const proposals = []
    for (const entry of catalogue.mutations) {
      const text = textOf(entry.file)
      if (text != null && text.split(entry.from).length - 1 === 1) continue
      stale += 1
      const answer = (reanchoring ? reanchorEntry : repointEntry)(entry, text, text == null ? null : addedIn(entry.file))
      if (answer.verdict === 'repointed' || answer.verdict === 'reanchored') {
        proposed += 1
        if (answer.verdict === 'reanchored') reanchored += 1
        proposals.push({ entry, answer })
        console.log(`${answer.verdict === 'reanchored' ? 'REANCHOR  ' : 'REPOINT  '}${entry.label}\n  ${entry.file}\n  - ${entry.from}\n  + ${answer.from}\n  to ${answer.to}`)
      } else console.log(`REFUSED  ${entry.label} — ${answer.why}`)
    }
    if (!stale) {
      console.log('every entry matches its source exactly once')
      return 0
    }
    if (!writing || !proposals.length) {
      console.log(`${stale} stale: ${reanchoring ? `${proposed - reanchored} repointable, ${reanchored} re-anchored` : `${proposed} repointable`}, ${stale - proposed} refused. Nothing was written.`
        + (proposed ? ` Run it again with --write to rewrite ${proposed === 1 ? 'the proposal' : `the ${proposed} proposals`} and measure ${proposed === 1 ? 'it' : 'them'}.` : ''))
      return stale ? 1 : 0
    }
    // Checked BEFORE the write. After a refactor these sources are uncommitted by
    // definition, and the measurement rewrites and restores them: an edit made while
    // it runs is lost, which `--force` accepts, as it does for any campaign.
    const uncommitted = dirtyTargets(proposals.map(({ entry }) => entry))
    if (uncommitted.length && !argv.includes('--force')) {
      process.stderr.write(`mutate: ${uncommitted.join(', ')} ${uncommitted.length === 1 ? 'has' : 'have'} uncommitted changes, `
        + 'and measuring the rewritten entries rewrites and restores exactly those files. Nothing was written. '
        + 'Pass --force if you accept that an edit made while it runs is rolled back.\n')
      return 2
    }
    for (const { entry, answer } of proposals) {
      entry.from = answer.from
      entry.to = answer.to
    }
    writeFileSync(paths.catalogue, `${JSON.stringify(catalogue, null, 2)}\n`)
    console.log(`${stale} stale: ${proposed} rewritten in ${path.relative(root, paths.catalogue)}, ${stale - proposed} refused. Measuring the rewritten ${proposed === 1 ? 'entry' : 'entries'}:`)
    repointed = { labels: new Set(proposals.map(({ entry }) => entry.label)), stillStale: stale - proposed }
  }
  // ADR-072: each entry whose killers the cache recorded, narrowed to exactly those tests,
  // or refused with the condition that failed. Writes nothing without --write. With it, the
  // lock and the catalogue read under it come first, as for --repoint (ADR-069); then every
  // narrowing is measured, and only then written (T4).
  let narrowed = null
  if (argv.includes('--narrow')) {
    const writing = argv.includes('--write')
    if (writing) {
      process.on('exit', () => { releaseTheRun() })
      if (!claimTheRun()) return 2
      recover()
      // Read again under the lock: a writer that held it before this run may have changed it.
      catalogue = JSON.parse(readFileSync(paths.catalogue, 'utf8'))
    }
    // ADR-072 T4: an entry is found again by its label, so a label that appears twice could
    // take one entry's pattern back from another. Refused before anything is measured.
    const seen = new Set()
    const repeated = new Set()
    for (const { label } of catalogue.mutations) (seen.has(label) ? repeated : seen).add(label)
    if (repeated.size) {
      process.stderr.write(`mutate: --narrow finds each entry by its label, and ${[...repeated].join(', ')} `
        + `${repeated.size === 1 ? 'appears' : 'appear'} more than once. Nothing was written.\n`)
      return 2
    }
    const records = loadCache(argv.includes('--cache') ? argv[argv.indexOf('--cache') + 1] : paths.cache)
    const texts = new Map()
    const readSource = file => {
      if (!texts.has(file)) texts.set(file, (() => { try { return readFileSync(path.join(root, file), 'utf8') } catch { return null } })())
      return texts.get(file)
    }
    const proposals = []
    const refusals = new Map()
    for (const entry of catalogue.mutations) {
      const key = cacheKey(entry, readSource)
      const answer = narrowEntry(entry, key ? records[key] : null, readSource)
      if (answer.verdict === 'narrowed') {
        proposals.push({ entry, only: answer.only })
        console.log(`NARROW   ${entry.label}\n  only ${answer.only}`)
      } else {
        console.log(`REFUSED  ${entry.label} — ${answer.why}`)
        const reason = answer.why.split(':')[0]
        refusals.set(reason, (refusals.get(reason) ?? 0) + 1)
      }
    }
    const tally = [...refusals].map(([reason, count]) => `${count} ${reason}`).join('; ')
    const refusedCount = catalogue.mutations.length - proposals.length
    if (!writing || !proposals.length) {
      console.log(`${proposals.length} narrowable, ${refusedCount} refused${tally ? ` (${tally})` : ''}. Nothing was written.`
        + (proposals.length ? ' Run it again with --write to narrow them and measure each.' : ''))
      return 0
    }
    const uncommitted = dirtyTargets(proposals.map(({ entry }) => entry))
    if (uncommitted.length) {
      process.stderr.write(`mutate: ${uncommitted.join(', ')} ${uncommitted.length === 1 ? 'has' : 'have'} uncommitted changes, `
        + 'and measuring a narrowed entry rewrites and restores exactly those files. Nothing was written.\n')
      return 2
    }
    // ADR-072 T4: the patterns are set in memory and measured first. The catalogue is
    // written only after that, with only the entries RED under their pattern, so a run
    // stopped mid-measurement leaves it as it was.
    for (const { entry, only } of proposals) entry.only = only
    console.log(`${proposals.length} narrowable, ${refusedCount} refused. Measuring each under its pattern before anything is written:`)
    narrowed = { labels: new Set(proposals.map(({ entry }) => entry.label)) }
  }
  let selected = repointed
    ? catalogue.mutations.filter(m => repointed.labels.has(m.label))
    : catalogue.mutations.filter(m => !filter || m.label.includes(filter))
  // ADR-072: `--narrow --write` measures exactly the entries it narrowed.
  if (narrowed) selected = catalogue.mutations.filter(m => narrowed.labels.has(m.label))
  // ADR-075: the isolated child runs exactly the entries its parent selected (spec F-15).
  if (argv.includes('--selected')) {
    let labels
    try { labels = JSON.parse(readFileSync(argv[argv.indexOf('--selected') + 1], 'utf8')) } catch (error) {
      process.stderr.write(`mutate: the parent's selection could not be read: ${error.message}\n`)
      return 2
    }
    const byLabel = new Map(catalogue.mutations.map(mutation => [mutation.label, mutation]))
    const missing = labels.filter(label => !byLabel.has(label))
    if (missing.length) {
      process.stderr.write(`mutate: the worktree's catalogue holds none of: ${missing.join(', ')}\n`)
      return 2
    }
    selected = labels.map(label => byLabel.get(label))
  }
  // `--changed <ref>`: only the entries a change since <ref> could affect, so a fix
  // is checked by the mutants that name its files, not by labels picked by hand.
  if (argv.includes('--changed') && !argv.includes('--selected')) {
    const ref = argv[argv.indexOf('--changed') + 1] ?? ''
    const diff = ref && !ref.startsWith('--')
      ? spawnSync('git', changedDiffArgs(root, ref), { encoding: 'utf8', timeout: 60_000, maxBuffer: 64 * 1024 * 1024 })
      : null
    if (!diff || diff.error || diff.status !== 0) {
      process.stderr.write(`mutate: --changed wants a git ref to diff against, not ${JSON.stringify(ref)}\n`)
      return 2
    }
    const before = selected.length
    const readSource = file => { try { return readFileSync(path.join(root, file), 'utf8') } catch { return null } }
    selected = touchedBy(selected, addedLines(diff.stdout), { numbers: addedLineNumbers(diff.stdout), readSource })
    console.log(`--changed ${ref}: ${selected.length} of ${before} entries name a line added since it`)
  }

  // `--shard i/n` runs the i-th of n equal slices, 1-based. The campaign is the
  // most valuable check here and the slowest: it is the only one that measures
  // whether the other checks detect anything, and it grew from 145 entries to
  // 268 in two days. On 2026-08-28 its CI job was killed at thirty minutes with
  // exit 143, which reads as an infrastructure hiccup rather than as "this gate
  // no longer fits", and a gate people cannot tell apart from a flake is a gate
  // they learn to re-run rather than read.
  //
  // Sliced by INDEX, not grouped by test-set, so every shard carries a mix and
  // no single one inherits the slowest suite. Baselines are memoised per set
  // within a shard, so slicing costs a few extra baseline runs and nothing else.
  if (argv.includes('--shard') && !argv.includes('--selected')) {
    const spec = argv[argv.indexOf('--shard') + 1] ?? ''
    const [index, total] = spec.split('/').map(Number)
    if (!Number.isInteger(index) || !Number.isInteger(total) || total < 1
        || index < 1 || index > total) {
      process.stderr.write(`mutate: --shard wants i/n with 1 <= i <= n, not ${JSON.stringify(spec)}\n`)
      return 2
    }
    // BACKLOG §106. Cost-balanced when the previous run left timings, round-robin
    // when it did not. The cache is read here rather than below because the
    // shard is taken before anything else looks at an entry.
    const priorFile = argv.includes('--cache')
      ? argv[argv.indexOf('--cache') + 1]
      : paths.cache
    const prior = loadCache(priorFile)
    const readForCost = name => {
      try { return readFileSync(path.join(root, name), 'utf8') } catch { return null }
    }
    const msOf = mutation => {
      const key = cacheKey(mutation, readForCost)
      const ms = key ? prior[key]?.ms : undefined
      return typeof ms === 'number' ? ms : undefined
    }
    const timed = selected.filter(m => msOf(m) !== undefined).length
    selected = shardByCost(selected, index, total, msOf)
    console.log(`shard ${index}/${total}: ${selected.length} of ${catalogue.mutations.length} mutations`
      + (timed ? ` (balanced by ${timed} measured timing(s))` : ' (no timings yet — even counts)'))
  }

  const width = Math.max(0, ...selected.map(m => m.label.length))

  if (argv.includes('--list')) {
    for (const m of selected) console.log(`${m.label}\n  ${m.file} -> ${m.tests.join(', ')}${m.only ? `  only: /${m.only}/` : ''}`)
    return 0
  }

  // ADR-075: a run that applies mutants isolates by default; `--in-place`, and the `--write`
  // modes that edit this checkout's catalogue, run here. The isolating parent stays in the
  // event loop and ends its child on a signal, so it registers no handler that exits first.
  const isolating = !argv.includes('--in-place') && !repointed && !narrowed
  process.on('exit', () => { releaseTheRun() })
  if (!isolating) {
    process.on('SIGINT', () => { recover(); process.exit(130) })
    process.on('SIGTERM', () => { recover(); process.exit(143) })
  }

  // The lock BEFORE the repair, not after. recover() restores whatever the
  // journal names, so a second invocation was un-mutating a live campaign's file
  // and deleting its journal — the outer run then measured an unmutated source
  // and reported the mutation unnoticed. Found on 2026-08-26 by a test that
  // spawns this runner: the guard it was written for could never fail, because
  // this ran first and quietly repaired the thing under test.
  // `--repoint --write` and `--narrow --write` claimed the lock and repaired before they
  // read a source.
  if (!repointed && !narrowed && !claimTheRun()) return 2
  if (!repointed && !narrowed) recover()
  // AFTER the repair, not before. `--case` with no match used to exit here-ish
  // and leave a killed run's mutation applied — the same class of bug as
  // recover() running before claimTheRun(), which was fixed on 2026-08-26 as a
  // single instance. One early exit was fixed; the class was not audited.
  // Every path a campaign can take now repairs before it can refuse.
  if (selected.length === 0) {
    process.stderr.write(`no mutation matches ${filter}\n`)
    return 1
  }
  // In place only (spec F-2): an isolated run grades the uncommitted content instead of losing
  // it, and the isolated child's tree is private.
  const dirty = isolating || process.env[CAMPAIGN_CHILD] === '1' ? [] : dirtyTargets(selected)
  if (dirty.length && !argv.includes('--force')) {
    process.stderr.write(`mutate: ${dirty.join(', ')} ${dirty.length === 1 ? 'has' : 'have'} `
      + 'uncommitted changes, and this run rewrites and restores exactly those files — an edit '
      + 'made while it runs is silently rolled back. Commit or stash first, or pass --force if '
      + 'you accept losing them.\n')
    return 2
  }
  // The load at the start, before the first baseline; the end sample is taken with the summary.
  const loadAtStart = campaignLoad()
  if (isolating) return isolate({ selected, argv, paths, loadAtStart })

  // The baselines FIRST, on an unmutated tree, before begin() has anything to
  // journal — so this adds no window in which a crash could leave the tree
  // broken (ADR-002). One spawn per distinct set, memoised by it.
  // ADR-023 T2. The cache is consulted BEFORE the baselines, because a baseline
  // exists to license a verdict — and an entry we are not going to measure needs
  // no licence. Skipping those spawns is most of the saving on a quiet commit.
  const cacheFile = argv.includes('--cache')
    ? argv[argv.indexOf('--cache') + 1]
    : paths.cache
  const cache = argv.includes('--no-cache') ? {} : loadCache(cacheFile)
  const readForKey = name => {
    try { return readFileSync(path.join(root, name), 'utf8') } catch { return null }
  }
  const keys = new Map(selected.map(m => [m.label, cacheKey(m, readForKey)]))
  const reuse = new Map()
  // ADR-072 T4: a narrowing is measured, never reused. A RED verdict cached at a narrowed
  // key says nothing about the run that decides whether to write it.
  if (!argv.includes('--no-cache') && !narrowed) {
    for (const m of selected) {
      const hit = reusable(m, cache, keys.get(m.label))
      // ADR-072: a RED record from before killers were recorded cannot narrow an entry,
      // so it is measured again. `reusable` is unchanged, and so are the tests that lock it.
      if (hit && Array.isArray(hit.killers)) reuse.set(m.label, hit)
    }
  }
  const toMeasure = selected.filter(m => !reuse.has(m.label))

  const sets = testSets(toMeasure)
  const baselines = new Map()
  for (const set of sets) {
    // The same files and the same arguments as the mutated run below, or this
    // would be measuring a different thing than the one it licenses.
    const run = runChild(root, testArgs(root, set), timeoutMs)
    // ADR-073: a narrowed pattern is held to the tests it names; a hand-written one selects every
    // test whose name contains it, and implies no count.
    baselines.set(setKeyOf(set), baselineOf(run, [...set.tests].sort().map(t => path.join(root, t)), namesOf(set.only) ?? []))
  }

  const results = []
  for (const mutation of selected) {
    const hit = reuse.get(mutation.label)
    if (hit) {
      // NAMED, not silent. A reused row says where its verdict was measured, so
      // a reader can go and look rather than taking the run's word for it.
      results.push({ ...mutation, verdict: 'RED', observed: 'RED', reused: true, at: hit.sha })
      console.log(`REUSED   ${mutation.label.padEnd(width)}  <- RED at ${hit.sha ?? 'an earlier run'}`)
      continue
    }
    const file = path.join(root, mutation.file)
    const original = readFileSync(file, 'utf8')
    const occurrences = original.split(mutation.from).length - 1
    const baseline = baselines.get(setKeyOf(mutation))
      ?? { state: 'unrun', why: 'no baseline was taken' }

    // ADR-073: nor is a mutant applied under a narrowed pattern that no longer runs every test it names.
    if (occurrences !== 1 || baseline.state === 'short') {
      // PRINTED, like every other verdict. This branch used to push and continue
      // in silence, so a mutation whose `from` no longer matched produced no line
      // at all — and the campaign then closed by telling the author a test had
      // stayed green with its mechanism broken, about a mechanism nothing had
      // touched. Found 2026-09-03 executing ADR-028, from an over-escaped `from`
      // in tests/mutations.json. A report must not state an observation it did
      // not make (CLAUDE.md §3).
      const staleResult = { ...mutation, ...classify({ occurrences, baseline, run: null }) }
      results.push(staleResult)
      console.log(renderLine(staleResult, width))
      continue
    }

    begin(file, original)
    writeFileSync(file, original.replace(mutation.from, mutation.to))
    const startedAt = Date.now()
    const run = runChild(root, testArgs(root, mutation), timeoutMs)
    const elapsedMs = Date.now() - startedAt
    finish(file, original)

    const result = { ...mutation, ...classify({ occurrences, baseline, run }),
      killers: killedBy(run?.stdout), elapsedMs }
    results.push(result)
    console.log(renderLine(result, width))
  }

  // Verdicts are printed AS THEY ARE DECIDED, above. Collecting them and
  // printing at the end meant a campaign killed mid-run said nothing whatever —
  // on 2026-08-28 a shard was SIGTERMed at nine minutes and its log held no
  // verdict lines, so three CI runs reported only exit 143 and the actual cause
  // took a fourth to find. A long gate that cannot be watched is a gate whose
  // failures are indistinguishable from infrastructure.

  // ADR-023 T2 S4. ONLY RED is written back. A GREEN is an open finding and a
  // stored one would hide live work; UNPROVEN is evidence of nothing (ADR-006).
  // Written after the loop so a killed campaign leaves the previous cache intact
  // rather than a half-updated one.
  if (!argv.includes('--no-cache')) {
    const sha = (() => {
      const r = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root, encoding: 'utf8', timeout: 30_000 })
      return r.status === 0 ? r.stdout.trim() : null
    })()
    const entries = { ...cache }
    // BACKLOG §148. The keys THIS run actually took a verdict on. A shard's file
    // is `prior ∪ own`, so twelve of them cannot be merged by union: eleven
    // shards carry a stale RED for a key the twelfth just deleted, and the union
    // resurrects it. `measured` is what lets a merge tell "this shard deleted it"
    // from "this shard never looked at it" — absence inside a claim is a
    // deletion, absence of the claim is no observation at all (ADR-005).
    const measured = []
    for (const result of results) {
      const key = keys.get(result.label)
      if (!key) continue
      if (result.reused) continue
      measured.push(key)
      // The duration rides along for BACKLOG §106's cost-balanced slicing: a
      // measurement from the campaign's own last run, never a table beside it.
      if (result.verdict === 'RED') {
        // ADR-072: the killers ride along too, so a narrowing is read from this record.
        entries[key] = { verdict: 'RED', sha, label: result.label, ms: result.elapsedMs, killers: result.killers ?? [] }
      }
      else delete entries[key]
    }
    const shard = argv.includes('--shard') ? argv[argv.indexOf('--shard') + 1] : null
    try {
      writeFileSync(cacheFile, `${JSON.stringify({ version: 1, entries, measured, shard }, null, 2)}\n`)
    } catch { /* a cache that cannot be written costs a re-run, never a verdict. */ }
  }

  const counts = summarise(results)
  console.log(`\n${counts.noticed}/${counts.total} mutations were noticed.`)
  if (counts.reused) {
    console.log(`${counts.measured} measured this run; ${counts.reused} reused a RED verdict `
      + 'whose subject and tests are byte-identical to the run that took it (ADR-023). '
      + 'Pass --no-cache to measure everything.')
  }
  if (counts.unproven) {
    console.log(`${counts.unproven} could not be judged: their test-set did not pass at baseline, `
      + 'so neither verdict is evidence. The line above each says whether that suite FAILED or '
      + 'never finished — they need different things done to them.')
  }
  // The isolated child leaves the line to its parent, which says it once.
  if (process.env[CAMPAIGN_CHILD] !== '1') {
    const loadAtEnd = campaignLoad()
    console.log(loadLine(loadAtStart.load, loadAtEnd.load, loadAtStart.cores))
  }
  // ADR-072: nothing is left narrowed on a measurement it failed. An entry that is not RED
  // under its pattern loses the pattern again and is named, and the run exits 1. The
  // catalogue is written only here, after every narrowing was measured (T4).
  if (narrowed) {
    const undone = results.filter(result => result.verdict !== 'RED')
    for (const result of undone) {
      delete catalogue.mutations.find(m => m.label === result.label).only
      console.log(`UNDONE   ${result.label} — ${result.verdict} under its pattern, so it keeps running its whole files`)
    }
    if (undone.length < narrowed.labels.size) writeFileSync(paths.catalogue, `${JSON.stringify(catalogue, null, 2)}\n`)
    return undone.length ? 1 : 0
  }
  // ADR-069 T2: the write is trusted only when every rewritten entry is RED and nothing
  // is left stale. A GREEN, STALE, UNPROVEN or HUNG rewritten entry stays written and
  // named above: it is a finding about the repoint or the test.
  if (repointed) {
    if (repointed.stillStale) {
      console.log(`${repointed.stillStale} entr${repointed.stillStale === 1 ? 'y is' : 'ies are'} still stale: refused above, for a person to repoint.`)
    }
    return results.every(result => result.verdict === 'RED') && !repointed.stillStale ? 0 : 1
  }
  if (counts.failing) {
    console.log(counts.staleOnly
      // NOTHING WAS APPLIED, so nothing was learned about any test. Saying the
      // other sentence here is a verdict about a suite that was never challenged.
      ? 'Nothing was measured: every failing entry is STALE — its `from` no longer '
        + 'matches the file, or its narrowed pattern no longer runs every test it names, so no '
        + 'mutation was applied. Re-read the subject and its tests, and fix the catalogue entry.'
      : 'A test that stays green with its mechanism broken is asserting something else.')
    return 1
  }
  return 0
}

if (isMainModule(import.meta.url)) {
  const code = main(process.argv.slice(2))
  // ADR-075: an isolated campaign resolves its code; every other path returns it.
  if (code && typeof code.then === 'function') {
    code.then(value => { process.exitCode = value }, error => {
      process.stderr.write(`mutate: ${error?.stack ?? error}\n`)
      process.exitCode = 2
    })
  } else {
    process.exitCode = code
  }
}
