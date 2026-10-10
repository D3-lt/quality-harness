// What git and the filesystem say about the tree and the session right now, observed under a bound: the repository a
// directory belongs to, the paths git lists, the commits made since the session began, and the observation (tree, index,
// head) that a check and a publish are compared by. Moved out of lifecycle.mjs unchanged (BACKLOG section 375, stage B3).
// A spawn error or a timeout is never read as "not a repository" or "nothing changed" (ADR-005).
import os from 'node:os'
import { copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readlinkSync, realpathSync, rmSync, statSync, utimesSync } from 'node:fs'
import path from 'node:path'
import { canonical, nearestExistingDirectory } from './event-log.mjs'
import { spawnSync } from 'node:child_process'
import { GIT_LISTING_BUFFER } from './decision-corpus.mjs'

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

// A spawn error or a timeout is not "this directory is not a repository".
// `gitRepositoryRoot` stays null for both, for callers that only need a path.
// Callers that would certify or go silent on that null use `gitRepositoryLookup`.
export function gitRepositoryLookup(directory, spawnResult) {
  const run = spawnResult !== undefined ? spawnResult : spawnSync('git', ['-C', directory, 'rev-parse', '--show-toplevel'], {
    encoding: 'utf8', timeout: 5_000, windowsHide: true,
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

// `without` (ADR-094 T3, only qh-check passes it) also returns `codeTree`: the tree with those paths removed from
// the temporary index, anchored at the top. Hooks never ask, so they pay no git call for it.
export function observe(cwd, budgetMs = observeBudgetMs(), { without = [] } = {}) {
  const started = Date.now()
  const directory = nearestExistingDirectory(path.resolve(typeof cwd === 'string' ? cwd : process.cwd()))
  if (!directory) return { ok: false, reason: 'the working directory does not exist' }
  let scratch = null
  const git = (args, env = null, allowed = [0]) => {
    const remaining = budgetMs - (Date.now() - started)
    if (remaining <= 0) throw new Error(`git took more than ${budgetMs} ms`)
    const run = spawnSync('git', ['-C', directory, ...args], {
      encoding: 'utf8', timeout: remaining, maxBuffer: 16 * 1024 * 1024, windowsHide: true,
      env: env ? { ...process.env, ...env } : process.env,
    })
    if (run.error?.code === 'ETIMEDOUT') throw new Error(`git took more than ${budgetMs} ms`)
    if (run.error) throw new Error(`git could not run (${run.error.code ?? run.error.message})`)
    if (!allowed.includes(run.status)) throw new Error(`git ${args[0]} exited ${run.status}`)
    return { status: run.status, out: run.stdout.trim() }
  }
  try {
    const root = git(['rev-parse', '--show-toplevel']).out
    const indexPath = path.resolve(directory, git(['rev-parse', '--git-path', 'index']).out)
    const objects = path.resolve(directory, git(['rev-parse', '--git-path', 'objects']).out)
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
    if (without.length) {
      git(['rm', '--cached', '-r', '-q', '--ignore-unmatch', '--', ...without.map(spec => `:(top)${spec}`)], env)
      codeTree = git(['write-tree'], env).out
    }
    return { ok: true, tree, index: indexTree, head: head.status === 0 ? head.out : null, ...(codeTree === undefined ? {} : { codeTree }) }
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
  const run = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', timeout: 5_000, maxBuffer: GIT_LISTING_BUFFER, windowsHide: true })
  if (run.error || run.status !== 0) {
    const verb = args.find(arg => /^[a-z][a-z-]*$/.test(arg)) ?? args[0]
    const why = run.error ? run.error.message : `git ${verb} exited ${run.status}`
    return mark([], false, why)
  }
  if (nul) return mark(run.stdout.split('\0').filter(Boolean), true)
  return mark(run.stdout.split('\n').map(line => line.trimEnd()).filter(Boolean), true)
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
export function statusPaths(root) {
  if (!root) return mark([], true)
  // ⚠ `-z`, NOT A QUOTE STRIP. Porcelain v1 quotes an unusual name and escapes its
  // bytes as octal; stripping the quotes left `na\303\257ve.md`, a path that is
  // not on disk — shown to the user, persisted to `sessions.jsonl`, and gated by
  // rule A at every boundary for ever, since a missing file never gets an
  // identity (audit C2, reproduced in the field 2026-09-19). `core.quotePath=false`
  // fixes the octal and leaves an embedded quote, backslash or newline wrong.
  // `-z` quotes nothing: NUL-terminated, and a rename's ORIGINAL path follows as
  // its own field, which is skipped — the new name is the path that exists.
  const run = spawnSync('git', ['-C', root, 'status', '--porcelain', '-z', '-uall', ...harnessPathspecs(root)],
    { encoding: 'utf8', timeout: 5_000, maxBuffer: GIT_LISTING_BUFFER, windowsHide: true })
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
  return mark(paths, true)
}

// Commits reachable now that were not reachable when the session started. NOT
// "authored here": a fetch, a merge or a checkout makes commits reachable too,
// and this says only that no check has passed on their trees.
export function sessionCommits(log, root, head) {
  const baseline = sessionBaseline(log)?.observation
  const first = baseline?.head
  if (!root || typeof head !== 'string') return mark([], true)
  // ⚠ AN UNBORN BASELINE IS OBSERVED-AND-EMPTY, NOT UNKNOWN. `observe()` records a
  // repository with no commits as `{ ok: true, head: null }` — looked at, and
  // positively empty. Requiring a STRING baseline here collapsed that into "no
  // information", so a session that started in a fresh repository and then gained
  // its whole history reported NO new commits: R2 silent in the one case where
  // every commit is new. `git init` then work is how a project starts, and a
  // scaffold that commits as it goes reaches it every time.
  const unborn = baseline?.ok === true && first === null
  if (!unborn && (typeof first !== 'string' || first === head)) return mark([], true)
  // Everything reachable from HEAD is new when the session began with nothing.
  const range = unborn ? [head] : [`${first}..${head}`]
  const lines = gitLines(root, ['log', '--format=%H%x09%T%x09%s', ...range])
  return mark(lines.map(line => {
    const [sha, tree, ...subject] = line.split('\t')
    return { sha, tree, subject: subject.join('\t') }
  }).filter(commit => commit.sha && commit.tree), lines.ok, lines.why)
}
