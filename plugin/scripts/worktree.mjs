// worktree.mjs — a throwaway git worktree of a checkout's working-tree content, owned by the run
// that built it, and swept only once no process that works in it lives (ADR-075, ADR-076).
//
// One mechanism for every tool that must not touch the checkout its peers read: a mutation
// campaign (scripts/mutate.mjs), `adr-verify --mutant` (through the CLI below) and
// scripts/unasserted.mjs. The trees live at `<git-common-dir>/qh-campaigns/<id>/tree`, never under
// the OS temp root, because a test that tells scratch from project by the temp root
// (`plugin/scripts/lifecycle.mjs:347`) must grade alike in a worktree and in the checkout.
//
//   node worktree.mjs build <root> --owner <pid> [--exclude <path>]...   one JSON line; exit 0 or 2
//   node worktree.mjs add-owned <id> (--child <pid> | --group <pgid> | --pid <pid>)
//   node worktree.mjs remove <id>
//   node worktree.mjs sweep <root>
import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { copyFileSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { isMainModule } from './main-module.mjs'
import { alive as aliveness, groupAlive as groupAliveness } from './lease.mjs'

// git with a fixed identity: `git stash create` makes a commit, and a fixture or a CI runner may
// have no user configured.
function gitIn(dir, args) {
  const run = spawnSync('git', ['-C', dir, '-c', 'user.name=worktree', '-c', 'user.email=worktree@localhost', ...args],
    { encoding: 'utf8', timeout: 120_000, maxBuffer: 256 * 1024 * 1024, windowsHide: true })
  return Object.assign(run, { command: `git ${args.join(' ')}` })
}
// The command that failed and what it said, or its exit status when it said nothing.
const gitSaid = run => `${run.command}: ${(run.error?.message ?? run.stderr?.trim()) || `exit ${run.status}`}`

/**
 * alive is true while `pid` may still run. It asks the lease module's probe (ADR-077), and reads
 * its `unknown` as alive: `EPERM` is a process another user owns, and any other probe error is one
 * this cannot rule out, so a sweep that guessed "ended" would remove a tree from under a live
 * process (ADR-076 Decision). No pid at all is no process.
 */
export function alive(pid) {
  return Number.isInteger(pid) && pid > 0 && aliveness(pid) !== 'dead'
}
/** groupAlive is `alive` for a POSIX process group; Windows has none to probe. */
export function groupAlive(pid) {
  return process.platform !== 'win32' && Number.isInteger(pid) && pid > 0 && groupAliveness(pid) !== 'dead'
}

/** campaignHome is where a repository's worktrees live: its git directory, or null outside git. */
export function campaignHome(dir) {
  const common = gitIn(dir, ['rev-parse', '--git-common-dir'])
  if (common.error || common.status !== 0) return null
  return path.join(path.resolve(dir, common.stdout.trim()), 'qh-campaigns')
}

const ownerFile = id => path.join(id, 'owner.json')
function readOwner(id) {
  try { return JSON.parse(readFileSync(ownerFile(id), 'utf8')) } catch { return null }
}
// Written whole or not at all: a reader — the sweep, the campaign's child waiting to be named —
// never sees half a record.
function writeOwner(id, owner) {
  const temp = `${ownerFile(id)}.${process.pid}.tmp`
  writeFileSync(temp, JSON.stringify(owner))
  renameSync(temp, ownerFile(id))
}

/**
 * addOwned records a process that works in the tree, BEFORE it starts: the child a campaign
 * spawns (`child`), a POSIX process group (`group`), or a Windows process (`pid`). A tree is kept
 * while its owner or any recorded process lives.
 */
export function addOwned(id, { child, group, pid } = {}) {
  const owner = readOwner(id) ?? {}
  if (Number.isInteger(child)) owner.child = child
  if (Number.isInteger(group)) owner.groups = [...(owner.groups ?? []), group]
  if (Number.isInteger(pid)) owner.pids = [...(owner.pids ?? []), pid]
  writeOwner(id, owner)
}

const liveOwner = owner => alive(owner.parent) || alive(owner.child) || groupAlive(owner.child)
  || (owner.groups ?? []).some(groupAlive) || (owner.pids ?? []).some(alive)

// `git stash create` stores what git would commit, and for a path with a text attribute that is
// the NORMALISED content: CRLF bytes in an `eol=lf` file check out as LF, so an in-place run and an
// isolated one would read different bytes (Codex review of ADR-075). Every tracked regular file
// whose bytes in the worktree are not the checkout's gets the checkout's; the count comes back.
function overlayTracked(from, to, write) {
  const listed = gitIn(from, ['ls-files', '-s', '-z'])
  if (listed.error || listed.status !== 0) throw new Error(gitSaid(listed))
  let copied = 0
  for (const record of listed.stdout.split('\0').filter(Boolean)) {
    // A symlink (120000) or a submodule (160000) is git's to reproduce, and it does.
    if (!record.startsWith('100')) continue
    const file = record.slice(record.indexOf('\t') + 1)
    let bytes
    try { bytes = readFileSync(path.join(from, file)) } catch (error) {
      // Deleted in the checkout, and so absent from the stash as well.
      if (error.code === 'ENOENT') continue
      throw error
    }
    const target = path.join(to, file)
    let there = null
    try { there = readFileSync(target) } catch {}
    if (there && bytes.equals(there)) continue
    mkdirSync(path.dirname(target), { recursive: true })
    write(target, bytes)
    copied++
  }
  return copied
}

/**
 * build makes a worktree of `root`'s working-tree content — HEAD, its uncommitted tracked changes
 * (deletions included), its untracked files that are not ignored or `exclude`d, and the checkout's
 * own bytes where git would normalise them — owned by `owner`. It returns `{ ok: true, tree, id,
 * builtMs, overlaid }`, or `{ ok: false, error }` having removed whatever it had built: a registered
 * worktree nothing owns is one no later run can tell from a live one's. `io` is the tests' seam for
 * the untracked copy (`copyFileSync`) and the overlay (`writeFileSync`).
 */
export function build(root, { owner = process.pid, exclude = [], io = {} } = {}) {
  const copy = io.copyFileSync ?? copyFileSync
  const write = io.writeFileSync ?? writeFileSync
  const home = campaignHome(root)
  if (!home) return { ok: false, error: 'this is not a git repository' }
  const began = Date.now()
  // Inside the build's contract, not a throw: a git directory that cannot be written is a
  // build that could not be made, which every caller answers (Codex review of ADR-076).
  let id
  try {
    mkdirSync(home, { recursive: true })
    id = path.join(home, `${owner}-${randomBytes(3).toString('hex')}`)
    mkdirSync(id)
    // The owner is written before `worktree add`, so no instant exists in which a tree has no owner.
    writeOwner(id, { parent: owner, root: path.resolve(root) })
  } catch (error) {
    if (id) rmSync(id, { recursive: true, force: true })
    return { ok: false, error: `could not prepare ${home}: ${error.message}` }
  }
  const tree = path.join(id, 'tree')
  const fail = error => { remove(id); return { ok: false, error } }
  // `git stash create` is HEAD plus the uncommitted tracked changes as a commit, and prints
  // nothing when there are none; it writes no ref and no index.
  const stash = gitIn(root, ['stash', 'create'])
  // Exit 1 with nothing said is "no local changes": measured 2026-09-30 after an in-place run
  // restored its files, leaving the index's stat information stale over unchanged content. An
  // unborn HEAD also exits 1, and says why, so it is still refused. Refreshing the index first
  // would write it, which an isolated run must never do.
  const unchanged = stash.status === 1 && !stash.stdout.trim() && !stash.stderr.trim()
  if (stash.error || (stash.status !== 0 && !unchanged)) return fail(gitSaid(stash))
  let commit = stash.stdout.trim()
  if (!commit) {
    const head = gitIn(root, ['rev-parse', '--verify', 'HEAD'])
    if (head.error || head.status !== 0) return fail(gitSaid(head))
    commit = head.stdout.trim()
  }
  const added = gitIn(root, ['worktree', 'add', '--detach', tree, commit])
  if (added.error || added.status !== 0) return fail(gitSaid(added))
  const untracked = gitIn(root, ['ls-files', '--others', '--exclude-standard', '-z'])
  if (untracked.error || untracked.status !== 0) return fail(gitSaid(untracked))
  const skipped = new Set(exclude.map(file => path.relative(root, file).split(path.sep).join('/')))
  try {
    for (const file of untracked.stdout.split('\0').filter(Boolean)) {
      if (skipped.has(file)) continue
      const target = path.join(tree, file)
      mkdirSync(path.dirname(target), { recursive: true })
      copy(path.join(root, file), target)
    }
  } catch (error) {
    return fail(`an untracked file could not be copied (${error.code ?? error.message})`)
  }
  let overlaid
  try { overlaid = overlayTracked(root, tree, write) } catch (error) {
    return fail(`the worktree could not be prepared (${error.code ?? error.message})`)
  }
  return { ok: true, tree, id, builtMs: Date.now() - began, overlaid }
}

/** remove unregisters and deletes one worktree and its record. */
export function remove(id) {
  const root = readOwner(id)?.root
  const tree = path.join(id, 'tree')
  if (root) gitIn(root, ['worktree', 'remove', '--force', tree])
  rmSync(id, { recursive: true, force: true })
  if (root) gitIn(root, ['worktree', 'prune'])
}

/**
 * sweep removes every worktree under `root`'s home whose owner and recorded processes have all
 * ended, and says so. A record that cannot be read is kept for a day; a directory with no record
 * yet belongs to a build in progress, and is kept for a minute.
 */
export function sweep(root, say = () => {}) {
  const home = campaignHome(root)
  if (!home) return
  let ids = []
  try { ids = readdirSync(home) } catch { return }
  for (const name of ids) {
    const id = path.join(home, name)
    const owner = readOwner(id)
    let age = 0
    try { age = Date.now() - statSync(id).mtimeMs } catch { continue }
    if (owner) {
      if (liveOwner(owner)) continue
    } else {
      let recorded = false
      try { statSync(ownerFile(id)); recorded = true } catch {}
      if (age < (recorded ? 24 * 60 * 60 * 1000 : 60_000)) continue
    }
    gitIn(root, ['worktree', 'remove', '--force', path.join(id, 'tree')])
    rmSync(id, { recursive: true, force: true })
    gitIn(root, ['worktree', 'prune'])
    say(`removed a campaign worktree left by an earlier run: ${name}`)
  }
}

/** main is the CLI `adr-verify` calls; it prints one JSON line and returns the exit code. */
export function main(argv, out = line => process.stdout.write(`${line}\n`)) {
  const [verb, target] = argv
  const value = flag => (argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : undefined)
  const values = flag => argv.flatMap((word, i) => (word === flag && i + 1 < argv.length ? [argv[i + 1]] : []))
  const number = flag => (value(flag) === undefined ? undefined : Number(value(flag)))
  if (verb === 'build' && target) {
    const built = build(path.resolve(target), { owner: number('--owner') ?? process.pid, exclude: values('--exclude').map(file => path.resolve(file)) })
    out(JSON.stringify(built.ok ? { tree: built.tree, id: built.id, builtMs: built.builtMs, overlaid: built.overlaid } : { error: built.error }))
    return built.ok ? 0 : 2
  }
  if (verb === 'add-owned' && target) {
    addOwned(target, { child: number('--child'), group: number('--group'), pid: number('--pid') })
    return 0
  }
  if (verb === 'remove' && target) { remove(target); return 0 }
  if (verb === 'sweep' && target) { sweep(path.resolve(target), line => out(JSON.stringify({ said: line }))); return 0 }
  process.stderr.write('usage: worktree.mjs build <root> --owner <pid> [--exclude <path>]... | add-owned <id> (--child|--group|--pid) <n> | remove <id> | sweep <root>\n')
  return 2
}

if (isMainModule(import.meta.url)) process.exitCode = main(process.argv.slice(2))
