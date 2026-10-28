// What git and the filesystem say about the tree and the session right now, observed under a bound: the repository a
// directory belongs to, the paths git lists, the commits made since the session began, and the observation (tree, index,
// head) that a check and a publish are compared by. Moved out of lifecycle.mjs unchanged (BACKLOG section 375, stage B3).
// A spawn error or a timeout is never read as "not a repository" or "nothing changed" (ADR-005).
import os from 'node:os'
import { copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readlinkSync, realpathSync, rmSync, statSync, utimesSync } from 'node:fs'
import path from 'node:path'
import { canonical, GIT_LISTING_BUFFER, nearestExistingDirectory } from '../../../plugin/scripts/event-log.mjs'
import { spawnSync } from 'node:child_process'
import { proseSpecs } from './project-config.mjs'

// The OS temp roots, symlink-resolved once per call. `/tmp` is a symlink to
// `/private/tmp` on macOS and os.tmpdir() points into /var/folders, so the
// judgement below realpaths both sides before comparing.
function tempRoots() {
  const roots = new Set(['/tmp', '/private/tmp', '/var/folders', '/private/var/folders', os.tmpdir()])
  try { roots.add(realpathSync(os.tmpdir())) } catch {}
  return [...roots]
}

export function underTempRoot(candidate, depth = 0) {
  if (depth > 8) return false
  let resolved = path.resolve(candidate)
  // Judge the real location, not the spelling: a symlink under /tmp pointing
  // into a repository must be treated as the repository. The leaf needs lstat,
  // not stat — a symlink to a missing repo file still CREATES that file when
  // written through, and stat on it just throws.
  try {
    if (lstatSync(resolved).isSymbolicLink()) {
      return underTempRoot(path.resolve(path.dirname(resolved), readlinkSync(resolved)), depth + 1)
    }
    resolved = realpathSync(resolved)
  } catch {
    try {
      const anchor = nearestExistingDirectory(resolved)
      if (anchor) resolved = path.join(realpathSync(anchor), path.relative(anchor, resolved))
    } catch {}
  }
  return tempRoots().some(root => resolved === root || resolved.startsWith(root + path.sep))
}

// A scratch path: a file under the OS temp root that is not the project's own. A project outside the temp root is judged as it
// always was: every temp file is scratch. A project that itself sits under the temp root (a Windows clone in a scratchpad under
// %TEMP%, BACKLOG §409) keeps its own records gated, and a temp file outside it is scratch. Its own means inside its repository
// (or `cwd`, outside one) by spelling or by real location: a write through a link in the project is the project's, wherever the
// link points (the writes-and-stops golden's directory link), and a session started in a subdirectory owns the whole repository.
// Corrections from the Codex reviews of v3.8.53..42a903a8 and of its fix round, each a fail-open: paths are compared
// case-folded where the file system folds case (macOS, Windows), so a case alias of the project is the project; and the
// exemption needs a repository root git named. A lookup that failed, or one that answered "not a repository" (which a git that
// exits non-zero for any reason, such as dubious ownership, also answers), gates, as before this exemption existed.
export function scratchOutside(file, cwd, { platform = process.platform, lookup = gitRepositoryLookup } = {}) {
  if (!underTempRoot(file)) return false
  if (!underTempRoot(cwd)) return true
  const directory = nearestExistingDirectory(path.resolve(cwd))
  const found = directory ? lookup(directory) : { ok: false, root: null }
  if (!found.ok || !found.root) return false
  const base = found.root
  // The native resolver, as `canonical` uses: the JS one leaves a Windows 8.3 name (C:\Users\RUNNER~1\…) in place while the
  // root git names is long, and a project's own record under an 8.3 %TEMP% read as outside it (ultrareview of v3.8.53..main).
  const resolved = candidate => { try { return realpathSync.native(candidate) } catch { return realpathSync(candidate) } }
  const real = candidate => {
    const absolute = path.resolve(candidate)
    try { return resolved(absolute) } catch {
      try {
        const anchor = nearestExistingDirectory(absolute)
        return anchor ? path.join(resolved(anchor), path.relative(anchor, absolute)) : absolute
      } catch { return absolute }
    }
  }
  const fold = text => (platform === 'win32' || platform === 'darwin' ? text.toLowerCase() : text)
  const outside = (from, target) => {
    const relative = path.relative(fold(from), fold(target))
    return relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)
  }
  // The root in cwd's own spelling: git names it resolved (macOS's /private/var), and the file is spelled as cwd is.
  const spelled = path.resolve(cwd, path.relative(real(cwd), real(base)))
  return outside(spelled, path.resolve(file)) && outside(real(base), real(file))
}

// ADR-095 T3. The identity of a repository (its toplevel, where its index and its objects are) cannot change inside one hook
// process, and a Stop event asked for the toplevel six times. A successful answer is kept for the life of the process, by
// directory and argument list. Nothing else about git is kept: what the tree holds, what the index holds and what HEAD is can
// change under the hook's own feet, and an answer that failed is asked again (a directory may become a repository).
const identityAnswers = new Map()
function remembered(directory, args, ask) {
  // The key is the directory as the file system resolves it, from the spelling git is given (the same resolution an OS chdir makes,
  // so `x/..` is what it is for a link or a missing x, and a relative path is read against the working directory): a link repointed
  // at another repository between two asks is another directory. A directory that cannot be resolved is not remembered at all:
  // git is asked, and says what it says (a Codex review of ADR-095, twice).
  // A `..` is not resolved the way the OS resolves it by any call available here (realpath answers a missing x in x/.. on some
  // systems and not on others), so a path with one is simply asked about, every time.
  if (String(directory).split(/[\\/]/).includes('..')) return ask()
  let resolved
  try { resolved = realpathSync.native(String(directory)) } catch { return ask() }
  const key = `${resolved}\0${args.join('\0')}`
  if (identityAnswers.has(key)) return identityAnswers.get(key)
  const answer = ask()
  if (answer && !answer.error && answer.status === 0) identityAnswers.set(key, answer)
  return answer
}

// A spawn error or a timeout is not "this directory is not a repository".
// `gitRepositoryRoot` stays null for both, for callers that only need a path.
// Callers that would certify or go silent on that null use `gitRepositoryLookup`.
export function gitRepositoryLookup(directory, spawnResult) {
  // One shape for every holder of this answer (`stdout` as git printed it, `out` trimmed): observe() asks the same question and
  // keeps the same entry, and an entry one of them wrote must read the same to the other.
  const run = spawnResult !== undefined ? spawnResult : remembered(directory, ['rev-parse', '--show-toplevel'], () => {
    const asked = spawnSync('git', ['-C', directory, 'rev-parse', '--show-toplevel'], { encoding: 'utf8', timeout: 5_000, windowsHide: true, env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' } })
    return asked.error ? asked : { ...asked, out: String(asked.stdout ?? '').trim() }
  })
  if (!run || run.error || run.status == null) {
    return { ok: false, root: null, reason: run?.error?.message ?? 'git produced no status' }
  }
  if (run.status !== 0) return { ok: true, root: null, reason: 'not a repository' }
  const printed = String(run.stdout ?? '').trim()
  if (!printed) return { ok: false, root: null, reason: 'git printed no root' }
  // Git's spelling and Node's path.resolve of the same tree can disagree
  // (C:/ vs C:\, 8.3 vs long, /tmp vs /private/tmp). An un-realpathed root
  // made relativeWithinRoot filter every path as outside, so the hook
  // delivered empty context (CLAUDE.md §7).
  return { ok: true, root: canonical(printed), reason: '' }
}

export function gitRepositoryRoot(directory) {
  const found = gitRepositoryLookup(directory)
  return found.ok ? found.root : null
}

// "Here" is the repository (or the directory, outside one), realpath'd so
// /tmp and /private/tmp agree, and case-folded where the filesystem is — a
// parameter, not an assumption (CLAUDE.md §7). A subdirectory of the same
// repository is the same place.
export function locationKey(root, platform = process.platform) {
  let resolved = path.resolve(root)
  try { resolved = realpathSync(resolved) } catch {}
  return platform === 'win32' || platform === 'darwin' ? resolved.toLowerCase() : resolved
}

// The working tree, the index and HEAD as content hashes. Both hashes are taken
// over a COPY of the index with objects written to a temporary directory, the
// repository's own objects as alternate: measured 2026-09-17, the repository's
// objects, index and status are unchanged by it (ADR-060 Context).
const OBSERVE_BUDGET_MS = 5_000

// A slow host may raise it, and the suite does: git on a loaded Windows runner outran
// 5s, and every rule that needs the tree read could-not-look (release run of d174c76,
// BACKLOG §314). Anything but a positive whole number of milliseconds is ignored.
export function observeBudgetMs(env = process.env) {
  const configured = Number(env.QUALITY_HARNESS_OBSERVE_BUDGET_MS)
  return Number.isSafeInteger(configured) && configured > 0 ? configured : OBSERVE_BUDGET_MS
}

// One observation's git calls share one budget: each is bounded by what the others left.
function boundedGit(directory, started, budgetMs) {
  return (args, env = null, allowed = [0]) => {
    const remaining = budgetMs - (Date.now() - started)
    if (remaining <= 0) throw new Error(`git took more than ${budgetMs} ms`)
    const run = spawnSync('git', ['-C', directory, ...args], {
      encoding: 'utf8', timeout: remaining, maxBuffer: 16 * 1024 * 1024, windowsHide: true,
      env: { ...process.env, ...env, GIT_OPTIONAL_LOCKS: '0' },
    })
    if (run.error?.code === 'ETIMEDOUT') throw new Error(`git took more than ${budgetMs} ms`)
    if (run.error) throw new Error(`git could not run (${run.error.code ?? run.error.message})`)
    if (!allowed.includes(run.status)) throw new Error(`git ${args[0]} exited ${run.status}`)
    return { status: run.status, stdout: run.stdout, out: run.stdout.trim() }
  }
}

// The tree `treeSha` holds with the `without` pathspecs removed, anchored at the top, written in a scratch index whose objects
// go to the scratch directory the caller made (ADR-120 T9).
function treeWithout(git, env, scratch, name, treeSha, without) {
  const own = { ...env, GIT_INDEX_FILE: path.join(scratch, name) }
  git(['read-tree', treeSha], own)
  git(['rm', '--cached', '-r', '-q', '--ignore-unmatch', '--', ...without.map(spec => `:(top)${spec}`)], own)
  return git(['write-tree'], own).out
}

/**
 * ADR-120 T9. The tree a commit (or any tree git holds) has once the declared `prose` paths are removed, or null when git
 * could not say: a pass is carried to a tree only on this tree's own code, so a tree whose code tree is unknown is carried to
 * by nothing (ADR-005). The repository's objects are not written to.
 */
export function codeTreeOf(cwd, treeSha, without, budgetMs = observeBudgetMs()) {
  if (typeof treeSha !== 'string' || !treeSha || !Array.isArray(without) || !without.length) return null
  const directory = nearestExistingDirectory(path.resolve(typeof cwd === 'string' ? cwd : process.cwd()))
  if (!directory) return null
  let scratch = null
  try {
    const git = boundedGit(directory, Date.now(), budgetMs)
    const objects = path.resolve(directory, git(['rev-parse', '--git-path', 'objects']).out)
    scratch = mkdtempSync(path.join(os.tmpdir(), 'qh-code-tree-'))
    mkdirSync(path.join(scratch, 'objects'))
    const env = { GIT_OBJECT_DIRECTORY: path.join(scratch, 'objects'), GIT_ALTERNATE_OBJECT_DIRECTORIES: objects }
    return treeWithout(git, env, scratch, 'index', treeSha, without)
  } catch { return null } finally {
    if (scratch) {
      try { rmSync(scratch, { recursive: true, force: true }) } catch { /* a leftover temp copy is not a finding */ }
    }
  }
}

/**
 * ADR-120 T9. The observation a hook records: `observe`, and where the project declares `prose`, also the code tree of the
 * working tree and of the index and the list they were taken under, so every reader of a pass can ask about the tree in front
 * of it. A declaration that is refused declares nothing here either (project-config.mjs says why).
 */
export function observeCarrying(cwd, budgetMs = observeBudgetMs()) {
  const directory = nearestExistingDirectory(path.resolve(typeof cwd === 'string' ? cwd : process.cwd()))
  const root = directory ? gitRepositoryRoot(directory) : null
  const specs = root ? proseSpecs(root).specs : []
  return specs.length ? observe(cwd, budgetMs, { without: specs, carry: true }) : observe(cwd, budgetMs)
}

// `without` (ADR-094 T3, qh-check and `observeCarrying` pass it) also returns `codeTree`: the tree with those paths removed
// from the temporary index, anchored at the top. `carry` (ADR-120 T9, only `observeCarrying`) adds the same for the index,
// and the list. Hooks without a declaration pay no git call for either.
export function observe(cwd, budgetMs = observeBudgetMs(), { without = [], carry = false } = {}) {
  const started = Date.now()
  const directory = nearestExistingDirectory(path.resolve(typeof cwd === 'string' ? cwd : process.cwd()))
  if (!directory) return { ok: false, reason: 'the working directory does not exist' }
  let scratch = null
  const git = boundedGit(directory, started, budgetMs)
  const identity = args => remembered(directory, args, () => git(args))
  try {
    const root = identity(['rev-parse', '--show-toplevel']).out
    const indexPath = path.resolve(directory, identity(['rev-parse', '--git-path', 'index']).out)
    const objects = path.resolve(directory, identity(['rev-parse', '--git-path', 'objects']).out)
    const head = git(['rev-parse', '--verify', '-q', 'HEAD'], null, [0, 1])
    scratch = mkdtempSync(path.join(os.tmpdir(), 'qh-observe-'))
    const index = path.join(scratch, 'index')
    if (existsSync(indexPath)) {
      copyFileSync(indexPath, index)
      // ⚠ THE COPY KEEPS THE ORIGINAL'S TIME (ADR-094 T3, found at execution). Git trusts an entry's stat data
      // unless the entry is not older than the INDEX FILE: such an entry is "racily clean" and is hashed. A copy
      // made now is newer than every entry, so a file rewritten in the same second at the same size read as
      // unchanged — and the observed tree, and every pass reused on it, missed the edit. Not older than the
      // original is what git's own protocol asks. A time that cannot be set leaves the old behaviour.
      try { const original = statSync(indexPath); utimesSync(index, original.atime, original.mtime) } catch { /* the copy keeps its own time */ }
    }
    mkdirSync(path.join(scratch, 'objects'))
    const env = { GIT_INDEX_FILE: index, GIT_OBJECT_DIRECTORY: path.join(scratch, 'objects'), GIT_ALTERNATE_OBJECT_DIRECTORIES: objects }
    const indexTree = git(['write-tree'], env).out
    git(['add', '-A', ...harnessPathspecs(root)], env)
    const tree = git(['write-tree'], env).out
    let codeTree
    let indexCodeTree
    if (without.length) {
      git(['rm', '--cached', '-r', '-q', '--ignore-unmatch', '--', ...without.map(spec => `:(top)${spec}`)], env)
      codeTree = git(['write-tree'], env).out
      if (carry) indexCodeTree = treeWithout(git, env, scratch, 'index-code', indexTree, without)
    }
    return {
      ok: true, tree, index: indexTree, head: head.status === 0 ? head.out : null,
      ...(codeTree === undefined ? {} : { codeTree }),
      ...(indexCodeTree === undefined ? {} : { indexCodeTree, prose: [...without] }),
    }
  } catch (failure) {
    return { ok: false, reason: failure.message }
  } finally {
    if (scratch) {
      try { rmSync(scratch, { recursive: true, force: true }) } catch { /* a leftover temp copy is not a finding */ }
    }
  }
}

export function sameObservation(a, b) {
  return a?.ok === true && b?.ok === true && a.tree === b.tree && a.index === b.index && a.head === b.head
}

/**
 * The session's baseline: its first `session.started` whose look at the tree succeeded.
 *
 * ⚠ ONE THAT COULD NOT LOOK IS NO BASELINE. A SessionStart whose git outran its budget
 * records an observation that is not ok, and read as the baseline it made every later tree
 * "changed since the session started": a Stop over a pristine tree said "work no `qh-check`
 * has passed on", and `git push` was REFUSED (go-cli-adr-corpus's corpus-chaos D5,
 * reproduced at e016066; BACKLOG §319). It is the late case instead, so the first clean
 * observation becomes the baseline, marked `late`.
 */
export function sessionBaseline(log) {
  return log.find(entry => entry.event === 'session.started' && entry.observation?.ok === true)
}

// Whether git lists nothing changed under an observation that succeeded. A listing
// that FAILED is not a clean tree (ADR-005), so it answers false.
export function observedClean(cwd, observation) {
  if (observation?.ok !== true) return false
  const directory = nearestExistingDirectory(path.resolve(cwd))
  const root = directory ? gitRepositoryRoot(directory) : null
  if (!root) return false
  const status = statusPaths(root)
  return status.ok !== false && status.length === 0
}

// R3 `review-changed-state` (ADR-060): a read-only role's run is bracketed by its
// SubagentStart and SubagentStop observations, paired by agent id. A change in
// tree, index or HEAD between them is reported — as having happened DURING that
// run, never as done by the reviewer, since overlapping agents and the user share
// the tree. An observation that could not be made is R4's to report, not this.
// ⚠ AN ENUMERATION THAT FAILED IS NOT ONE THAT FOUND NOTHING. This returned `[]`
// for a nonzero exit, a timeout and a spawn error alike, and its callers read that
// as "no commits" and "no paths" — so a history query that could not run suppressed
// R2 and left the ledger saying `verified`, a clean answer assembled from a
// question nobody managed to ask. ADR-005 governs exactly this, and the branch was
// applying it to observations while its own git reads failed open underneath.
// Found by a different-lineage review of this branch, 2026-09-18.
//
// The result is still an array, so every existing `.length`, `.map` and spread
// keeps working; it carries `ok` beside them, and `mark` re-attaches that through a
// map so a transform cannot silently drop the one field that says the answer is
// real. `ok === false` is the only failure signal — an absent `ok` means a caller
// that never asked git anything, not a failure.
export function mark(lines, ok, why = '') {
  const out = [...lines]
  out.ok = ok
  out.why = why
  return out
}

// ⚠ A PATH GIT PRINTS IS QUOTED UNLESS IT IS ASKED NOT TO BE. Every call here that
// returns paths passes `nul` and a `-z`, which has no quoting at all; the class was
// enumerated by command on 2026-09-19 and four of seven sites were still quoted
// after the first was fixed (CLAUDE.md §5). `nul` splits on NUL and trims nothing —
// a name may end in a space.
export function gitLines(root, args, { nul = false } = {}) {
  const run = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', timeout: 5_000, maxBuffer: GIT_LISTING_BUFFER, windowsHide: true, env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' } })
  if (run.error || run.status !== 0) {
    const verb = args.find(arg => /^[a-z][a-z-]*$/.test(arg)) ?? args[0]
    const why = run.error ? run.error.message : `git ${verb} exited ${run.status}`
    return mark([], false, why)
  }
  if (nul) return mark(run.stdout.split('\0').filter(Boolean), true)
  // ASCII whitespace only, as the Go core trims: a git name may end in other whitespace (a remote `team/peer` + U+00A0), and
  // trimEnd() read that one as remote `team/peer` (the sixth verification review of R2).
  return mark(run.stdout.split('\n').map(line => line.replace(/[ \t\r\n\v\f]+$/, '')).filter(Boolean), true)
}

// The harness's own bookkeeping is not the session's work. CLAUDE_PLUGIN_DATA is
// wherever the host puts it, and a host that puts it inside the repository makes
// every hook dirty the tree it is watching — the ledger row appears as a changed
// path and moves the tree, so the same finding is made again with a new key.
// Found by a peer session's test of this branch, 2026-09-18.
function harnessPathspecs(root) {
  const home = process.env.CLAUDE_PLUGIN_DATA
  if (!root || typeof home !== 'string' || !home) return []
  const relative = path.relative(canonical(path.resolve(root)), canonical(path.resolve(home)))
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return []
  return ['--', ':(top)', `:(top,exclude)${relative.split(path.sep).join('/')}`]
}

// `-uall` lists every untracked FILE. Without it git collapses an untracked
// directory to `name/`, which the artifact dispatcher cannot classify — it
// answers UNPROVEN, which is not a verdict, so the path is retried at every
// boundary for ever (same peer test).
// ADR-095 T5. Off unless the entry point switches it on (a hook process does, a test or a library caller does not): one answer per
// repository, reused for at most `lifetimeMs`, kept only when git gave it. The answer is handed out as a copy.
let statusMemo = null
export function rememberStatus(lifetimeMs = 2_000, now = () => performance.now()) {
  statusMemo = { lifetimeMs, now, answers: new Map() }
}

export function statusPaths(root) {
  if (!root) return mark([], true)
  // A path with a `..` component can name a directory that is not there once a link or a missing component is resolved: git is asked.
  const key = statusMemo && !String(root).split(/[\\/]/).includes('..') ? path.resolve(root) : null
  const kept = key ? statusMemo.answers.get(key) : undefined
  // A clock that went backwards would make an old answer look new: elapsed time below zero is not within the lifetime.
  const elapsed = kept ? statusMemo.now() - kept.at : -1
  if (kept && elapsed >= 0 && elapsed < statusMemo.lifetimeMs) return mark(kept.paths, true)
  // ⚠ `-z`, NOT A QUOTE STRIP. Porcelain v1 quotes an unusual name and escapes its
  // bytes as octal; stripping the quotes left `na\303\257ve.md`, a path that is
  // not on disk — shown to the user, persisted to `sessions.jsonl`, and gated by
  // rule A at every boundary for ever, since a missing file never gets an
  // identity (audit C2, reproduced in the field 2026-09-19). `core.quotePath=false`
  // fixes the octal and leaves an embedded quote, backslash or newline wrong.
  // `-z` quotes nothing: NUL-terminated, and a rename's ORIGINAL path follows as
  // its own field, which is skipped — the new name is the path that exists.
  const run = spawnSync('git', ['-C', root, 'status', '--porcelain', '-z', '-uall', ...harnessPathspecs(root)],
    { encoding: 'utf8', timeout: 5_000, maxBuffer: GIT_LISTING_BUFFER, windowsHide: true, env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' } })
  if (run.error || run.status !== 0) {
    return mark([], false, run.error ? run.error.message : `git status exited ${run.status}`)
  }
  const fields = run.stdout.split('\0')
  const paths = []
  for (let index = 0; index < fields.length; index++) {
    const entry = fields[index]
    if (entry.length < 4) continue
    paths.push(entry.slice(3))
    if (entry[0] === 'R' || entry[0] === 'C' || entry[1] === 'R' || entry[1] === 'C') index++
  }
  const answer = mark(paths, true)
  // What is kept is a copy: the array handed to the caller is the caller's, and a caller that empties it must not empty the memo.
  if (key) statusMemo.answers.set(key, { at: statusMemo.now(), paths: mark(paths, true) })
  return answer
}

// The commit at HEAD, when it was not reachable as the session started (ADR-128 T1: R2 is retired, and only HEAD is asked
// about). NOT "authored here": a fetch, a merge or a checkout moves HEAD too. R1 names it as what the tree at HEAD was
// committed as, and the claim's evidence asks whether a check passed on its tree.
export function headCommit(log, root, head) {
  const baseline = sessionBaseline(log)?.observation
  const first = baseline?.head
  if (!root || typeof head !== 'string') return mark([], true)
  // ⚠ AN UNBORN BASELINE IS OBSERVED-AND-EMPTY, NOT UNKNOWN. `observe()` records a
  // repository with no commits as `{ ok: true, head: null }` — looked at, and
  // positively empty. Requiring a STRING baseline here collapsed that into "no
  // information", so a session that started in a fresh repository and then gained
  // its whole history reported no commit at all. `git init` then work is how a
  // project starts, and a scaffold that commits as it goes reaches it every time.
  const unborn = baseline?.ok === true && first === null
  if (!unborn && (typeof first !== 'string' || first === head)) return mark([], true)
  // The newest commit of the range is HEAD; a HEAD the session start already reached (a reset back) leaves the range empty.
  const lines = gitLines(root, ['log', '-1', '--format=%H%x09%T%x09%s', unborn ? head : `${first}..${head}`])
  return mark(lines.map(line => {
    const [sha, tree, ...subject] = line.split('\t')
    return { sha, tree, subject: subject.join('\t') }
  }).filter(commit => commit.sha && commit.tree), lines.ok, lines.why)
}
