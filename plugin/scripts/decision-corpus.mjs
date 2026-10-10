// The reader of the decision corpus: which files are records, what each one says about its status, its edges and the paths
// it governs, which archives are frozen, and which decisions govern a path. Moved out of lifecycle.mjs unchanged (BACKLOG
// section 375, stage B2). It reads files and git's own file listing and nothing else: it writes no file, records no event
// and says nothing to the model, so a change to what the hooks say never selects it, and a change here reaches the hooks
// only through named imports. Text it hands back is made safe by corpus-text.mjs.
import path from 'node:path'
import { canonical, canonicalFile, nearestExistingDirectory } from './event-log.mjs'
import { listedUnderUninterestingDirectory } from './uninteresting.mjs'
import { closeSync, existsSync, lstatSync, openSync, readFileSync, readSync, readdirSync, readlinkSync, realpathSync, statSync } from 'node:fs'
import { StringDecoder } from 'node:string_decoder'
import { spawnSync } from 'node:child_process'
import { codeClass, shownPath } from './corpus-text.mjs'

export function walk(value, visit) {
  if (!value || typeof value !== 'object') return
  visit(value)
  if (Array.isArray(value)) {
    for (const item of value) walk(item, visit)
    return
  }
  for (const child of Object.values(value)) walk(child, visit)
}

// Whether `file` lies outside the repository at `root`. INSIDE when any spelling of the path is inside any
// spelling of the root: the path as given, and with its parent resolved (the leaf keeps its own name, so a
// link inside the tree to a file outside it stays a write the tree hash cannot see); the root as given and
// resolved. A path under a directory link that leads out is still spelled inside, and it counts — resolving
// it first read it as outside (Codex reviews of ADR-094). It errs toward counting. Case is folded where the
// filesystem folds it.
export function outsideRoot(root, file) {
  const fold = value => (process.platform === 'win32' || process.platform === 'darwin' ? value.toLowerCase() : value)
  const inside = (base, target) => {
    const relative = path.relative(fold(base), fold(target)).replace(/\\/g, '/')
    return !(relative === '..' || relative.startsWith('../') || path.isAbsolute(relative) || /^[A-Za-z]:/.test(relative))
  }
  const files = [file, canonicalFile(file)]
  return !([root, canonical(root)].some(base => files.some(target => inside(base, target))))
}

// ADR task directories belonging to THIS repository. Deliberately narrow:
// walking a directory that is not a repository once surfaced another project's
// tasks from a shared temp directory, and a session must never be handed work
// that belongs to a codebase it was not opened on.
export function posixListed(rel) {
  return String(rel).replaceAll('\\', '/')
}

// A path as git LISTED it, in `/` form. Git lists `/` on every platform, so a backslash in a listed name
// separates directories only on Windows; on POSIX it is part of one name, and rewriting it there made a
// root-level `docs\tasks\T1-x.md` a task directory and `docs\adr\001-x.md` a decision corpus (ADR-092's
// review, finding 4 and its siblings). `posixListed` stays for `path.relative` output, which is native.
export function listedPath(rel, platform = process.platform) {
  return platform === 'win32' ? posixListed(rel) : String(rel)
}

function listedAbsolute(root, rel) {
  const parts = posixListed(rel).split('/').filter(part => part && part !== '.')
  return parts.length ? path.join(root, ...parts) : root
}

// The exact line `adr-retire-check`, `facts-gate-dispatch.sh`, `run-shell-hook.mjs`
// and `adr-lint` recognise an archive by. Whole-line, so prose ABOUT archives in a
// sibling directory's README does not freeze that directory.
const ARCHIVE_LIFECYCLE_LINE = '**Lifecycle:** Frozen historical ADR records'

// Whether a listed directory sits under a frozen archive. Asked only of candidate
// `tasks/` directories and cached per ancestor, so the orientation does not open a
// README for every directory git lists.
// ⚠ ONLY A README THE LISTING HOLDS. This read whatever was on disk, so an
// ignored or untracked README carrying the marker hid a tracked record's tasks
// from every session on that machine and no other (CLAUDE.md §8).
// The README a directory's archive marker is read from: `README.md`, exactly, as
// the listing spells it — which is also all the bash dispatcher's
// `[ -f "$dir/README.md" ]`, `adr-retire-check` and the archive template know.
//
// ⚠ A LISTED CASE-VARIANT (`readme.md`) IS UNKNOWN, AND THAT IS THE WHOLE RULE.
// Whether it IS this directory's README depends on whether the filesystem folds
// case, and this function spent three review passes trying to find out: first
// `existsSync(exact)` (an unlisted scratch `README.md` switched the listed variant
// on and retired a tracked record), then dev+inode identity (an EIO made a frozen
// record govern; inode 0 made two files one), then a three-valued identity (a
// variant absent from the working tree read as "proven different", and unknown
// became "not frozen", which offered a frozen record's task as READY). Each repair
// was a smaller guess. It does not guess now: the record's effect is UNPROVEN and
// its tasks are UNPROVEN, with the remedy — name the catalog `README.md` — said
// where either would have been (fifth review; ADR-005).
const README_UNKNOWN = Symbol('a README is listed here under another spelling')

// ⚠ AND ONLY A VARIANT THAT CARRIES THE MARKER IS THE AMBIGUOUS CASE. The rule above
// was first applied to every `readme.md`, and an ordinary project keeps one in
// `docs/`: every task directory beneath it went UNPROVEN and every record beside it
// governed nothing — a false could-not-look on each session of a normal repository,
// found by probing the change before its review ran. The listed variant is read
// under its LISTED spelling, which opens that file on any filesystem and needs no
// folding at all: without the marker it is a README and nothing more.
// ⚠ TOTAL OVER ONE TABLE, AND THE COUNT COMES FIRST. `names` is every basename the
// listing holds in this directory; the READMEs among them are those that equal
// `readme.md` ignoring case — the exact `README.md` INCLUDED:
//
//   none listed                      null      not an archive question
//   more than one listed             UNKNOWN   on a filesystem that folds case they
//                                              open ONE file, so which entry's bytes
//                                              were read cannot be established —
//                                              whichever spelling was asked for
//   exactly `README.md`              its path  the caller reads it and decides
//   one other spelling, marked       UNKNOWN   whether it is the catalog depends on
//      or unreadable                           the filesystem; this does not guess
//   one other spelling, ordinary     null      a README and nothing more
//
// It reached this shape one cell at a time, over five reviews: the first variant
// only; an exact-name shortcut that returned BEFORE the collision count, so
// `README.md` + `readme.md` gave a definite answer in either direction (eighth
// review); and three ways of asking the filesystem, all deleted. Each cell is a
// case in tests/archive-not-in-flight.test.mjs.
export function listedReadme(directory, names, read) {
  const spellings = names.filter(name => name.toLowerCase() === 'readme.md')
  if (spellings.length === 0) return null
  if (spellings.length > 1) return README_UNKNOWN
  if (spellings[0] === 'README.md') return path.join(directory, 'README.md')
  try { return read(path.join(directory, spellings[0])).split(/\r?\n/).includes(ARCHIVE_LIFECYCLE_LINE) ? README_UNKNOWN : null } catch { return README_UNKNOWN }
}

// true, false, or 'unknown' — a listed README that could not be read is unknown
// too: it may carry the marker, and `false` there offered retired work as READY.
function underFrozenArchive(root, dirParts, cache, listed) {
  let unknown = false
  // ⚠ FROM THE REPOSITORY ROOT, depth 0. The walk began one level down, so a
  // repository whose root IS the archive — `README.md` with the marker beside
  // `tasks/` — froze nothing: the record side called its record withdrawn while
  // this side offered its task as READY (ninth review; the record side reads the
  // root already, so the two disagreed about one directory). The root's prefix is
  // the empty string, not `/`.
  for (let depth = 0; depth < dirParts.length; depth++) {
    const key = dirParts.slice(0, depth).join('/')
    const prefix = depth === 0 ? '' : `${key}/`
    if (!cache.has(key)) {
      let frozen = false
      const readme = listedReadme(path.join(root, ...dirParts.slice(0, depth)),
        [...listed].filter(rel => rel.startsWith(prefix) && !rel.slice(prefix.length).includes('/')).map(rel => rel.slice(prefix.length)),
        file => readRegularText(file))
      if (readme === README_UNKNOWN) frozen = 'unknown'
      else if (readme !== null) {
        // Through `readRegularText`, never a bare open: a FIFO named `README.md` blocked this read until
        // the process was killed (a gpt-6.1-sol review of ADR-092's execution, finding 11). One that is not
        // a regular file is a README whose marker could not be read: unknown.
        try { frozen = readRegularText(readme).split(/\r?\n/).includes(ARCHIVE_LIFECYCLE_LINE) } catch { frozen = 'unknown' }
      }
      cache.set(key, frozen)
    }
    if (cache.get(key) === true) return true
    if (cache.get(key) === 'unknown') unknown = true
  }
  return unknown ? 'unknown' : false
}

// The ONE archive rule, for a reader that walks the listing itself: true under a
// directory whose README carries the Lifecycle marker, 'unknown' where that README
// cannot be established, false otherwise. work-next kept a NAME test of its own, so an
// unadopted `docs/adr-archive/` was live here and hidden there — 29 disagreements over
// one product corpus (BACKLOG §281 item 3).
export function frozenArchiveOf(root, listing) {
  const cache = new Map()
  const listed = new Set((listing ?? []).map(rel => posixListed(rel)))
  return rel => underFrozenArchive(root, posixListed(rel).split('/').filter(Boolean).slice(0, -1), cache, listed)
}

// A directory NAMED like an archive. Only ever used to NAME one that carries no
// marker, never to freeze anything: "looks like an archive" is a guess about a name
// (CLAUDE.md §16), and it once hid `archive-policy.md` and `archive-service/`.
const ARCHIVE_DIRECTORY_NAME = /(?:^|[-_])archived?s?$|^archives?[-_](?:adrs?|decisions?|records?)$/i

// Archive-named directories holding listed Markdown with no Lifecycle marker above
// them. Each is read as live by every reader; this names it so its owner can adopt it
// with `adr-retire-check --adopt`, rather than finding out from a ready task.
// A file named the way a decision record is: `ADR-001-…` (any width), `0001-…`, `2026-09-24-…`, and
// since ADR-092 Decision 11 `spec-<n>`, the definition's other name arm.
const RECORD_SHAPED = /^(?:adr[-_]?\d+|\d{3,4}-|\d{4}-\d{2}-\d{2}-)/i

// ADR-092 Decision 11. Through `adrCorpus`, `recognised` is the set of absolute paths it counted or held
// undecided, and a directory is named exactly when it holds one of them or a task file: the name test is
// not consulted, so `archive/001-note.md` holding no record names nothing. The SessionStart callers pass
// none and open no record content (CLAUDE.md §19; they read an archive's README for its marker, as ever),
// so they keep the name test, widened to the name arms; a record-shaped name there is a hint about a
// directory read without content. Neither path names a directory for a file under `templates/`.
export function unmarkedArchives(root, listing, recognised = null) {
  if (listing == null) return []
  const listed = new Set(listing.map(rel => posixListed(rel)))
  const cache = new Map()
  const found = new Set()
  for (const rel of listed) {
    if (!/\.md$/i.test(rel) || /(?:^|\/)readme\.md$/i.test(rel)) continue
    const parts = rel.split('/').filter(Boolean)
    if (parts.slice(0, -1).some(part => TEMPLATES_DIRECTORY.test(part))) continue
    // Only a directory holding records or task files: an archive-named folder of
    // notes is not an archive of decisions (cold review of 833ea52).
    const task = /(?:^|\/)tasks\//.test(rel)
    const record = recognised ? recognised.has(listedAbsolute(root, rel)) : RECORD_SHAPED.test(parts.at(-1)) || SPEC_NAME.test(parts.at(-1))
    if (!record && !task) continue
    if (listedUnderUninterestingDirectory(parts.slice(0, -1))) continue
    for (let depth = 1; depth < parts.length; depth++) {
      if (!ARCHIVE_DIRECTORY_NAME.test(parts[depth - 1])) continue
      // Only `false`: `true` is the archive working, and `unknown` is already
      // reported as unproven wherever its records are read.
      if (underFrozenArchive(root, parts.slice(0, depth + 1), cache, listed) === false) found.add(parts.slice(0, depth).join('/'))
      break
    }
  }
  return [...found].sort()
}

// ⚠ ONE FILE, HOWEVER MANY PATHS REACH IT (BACKLOG §350 C7 and item 3). A junction under docs/adr
// that pointed back at docs/adr was listed 64 levels deep on Windows: 192 records where there were
// 3, a record contested with itself, a probe killed at 120 s — and, once records were read once,
// `tasks: 192` and the same task offered again through the link. A file, or a task directory, is
// read once, by the first listed path to its real path; every other path is returned as an alias
// for the caller to name. A path whose real path cannot be taken is kept: it is not known to be a
// copy, and the reader that opens it says what it finds.
// ⚠ THE TARGET, NOT THE LINK, when a link is listed first: `Final/001-link.md` sorts before
// `docs/decisions/001-rule.md`, and the target — the file adr-lint lints — was named as the copy (a
// gpt-6.1-sol delta review, 2026-10-07). The path with fewer links wins (the owner, 2026-10-07: nothing
// left open), and the corpus reader first prefers a spelling a name arm recognises (ADR-092 Decision 7).
// Between two paths of one class with as many links, the first listed stays, so a junction loop reads as
// before.
//
// ADR-092 Decision 7: links are counted BY RESOLVING EACH HOP, not by asking each ancestor of the
// spelling whether it is a link: `a` → `c` → the file was one link that way, so dedup could keep the
// more-linked path (finding 11). Every link component of the path and every link met while resolving a
// target counts, a link met twice counting twice (`a/a/file.md` with `a` → `.` counts 2), and the count
// stops at `limit`, where the path is unbounded (`Infinity`) and loses to every counted path of its class.
export function linksIn(file, limit = 32) {
  let count = 0
  const absolute = path.resolve(file)
  const { root } = path.parse(absolute)
  let resolved = root
  const pending = absolute.slice(root.length).split(/[\\/]/).filter(Boolean)
  while (pending.length > 0) {
    const part = pending.shift()
    if (part === '.') continue
    if (part === '..') { resolved = path.dirname(resolved); continue }
    const at = path.join(resolved, part)
    let target = null
    try { if (lstatSync(at).isSymbolicLink()) target = readlinkSync(at) } catch { /* unreadable: not known to be a link */ }
    if (target === null) { resolved = at; continue }
    count += 1
    if (count >= limit) return Infinity
    if (path.isAbsolute(target)) resolved = path.parse(target).root
    const rest = path.isAbsolute(target) ? target.slice(path.parse(target).root.length) : target
    pending.unshift(...rest.split(/[\\/]/).filter(Boolean))
  }
  return count
}

//
// ⚠ ONE PASS. A replacement searched `kept` for the path it displaced and rescanned every alias to move
// the ones naming it, so N files each listed first by a longer spelling cost N² (a gpt-6.1-sol review of
// ADR-092's execution, finding 14). The index of each real path in `kept`, the aliases naming each kept
// path, and each path's link count are kept instead. `realpath` and `links` are seams a test sets to
// measure the work without the disk.
export function onceByRealPath(paths, prefer = null, { linkLimit = 32, realpath = realpathSync.native, links = file => linksIn(file, linkLimit) } = {}) {
  const firstPathTo = new Map()
  const kept = []
  const aliases = []
  const aliasesOf = new Map()
  const counted = new Map()
  const linksOf = file => {
    if (!counted.has(file)) counted.set(file, links(file))
    return counted.get(file)
  }
  // The name preference first, and only it, when it separates two spellings; links only within a class.
  const better = (file, first) => {
    if (prefer) {
      const [mine, theirs] = [Boolean(prefer(file)), Boolean(prefer(first))]
      if (mine !== theirs) return mine
    }
    return linksOf(file) < linksOf(first)
  }
  const alias = (file, sameAs) => {
    const entry = { file, sameAs }
    aliases.push(entry)
    if (!aliasesOf.has(sameAs)) aliasesOf.set(sameAs, [])
    aliasesOf.get(sameAs).push(entry)
  }
  for (const file of paths) {
    let real
    try { real = realpath(file) } catch { kept.push(file); continue }
    const at = firstPathTo.get(real)
    if (at === undefined) { firstPathTo.set(real, kept.length); kept.push(file); continue }
    const first = kept[at]
    if (better(file, first)) {
      kept[at] = file
      const moved = aliasesOf.get(first) ?? []
      for (const entry of moved) entry.sameAs = file
      aliasesOf.delete(first)
      aliasesOf.set(file, moved)
      alias(first, file)
      continue
    }
    alias(file, first)
  }
  return { kept, aliases }
}

// Why an alias was not read. Shown, never raw: a listed name is corpus text, and a newline in it
// forged a line of work-next's own output (a stand-in review of 3.8.5; BACKLOG §319's class).
// Worded for what is known: on macOS and Windows a spelling that differs only in case reaches the
// same file with no link at all.
export function aliasReason(root, sameAs) {
  return `another listed path to the same file on disk as ${shownPath(posixListed(path.relative(root, sameAs)))} `
    + '(a link, a junction, or a spelling the file system folds together), so that file is read once'
}

/**
 * Why a record the readers counted was held back, where no read failed (BACKLOG §345):
 * a plan not yet decided, a frozen record whose catalog does not establish its effect,
 * a status nobody here knows, or no status line at all. A fresh corpus's runner found
 * these all null, so "Proposed" and an unparseable line read alike. Shared by corpus-probe
 * and work-next, which counted a U+FF1A `Status：` record and named it nowhere (§350 C5).
 */
export function undecidedReason(entry) {
  if (entry.unproven) return 'its archive catalog does not establish its effect'
  if (entry.status == null) return 'no status line this reader can read'
  return recordStatusKind(entry.status) === 'pending' ? 'a plan, not yet decided' : 'a status this reader does not recognise'
}

// ADR task directories from the git listing, not a disk walk. A gitignored
// tasks/ dir is not in flight; git-fail is UNPROVEN at the caller.
// ⚠ AND NEITHER IS A RETIRED ONE. A frozen archive is "historical evidence, never
// an executable plan" (adr-execute), and this walked it anyway: the day this
// repository retired its first records, every session was offered their tasks as
// READY with the command to run. Skipped BEFORE the cap below, or three frozen
// task sets would also crowd three live ones out of the orientation.
// ⚠ AND THE CAP IS SAID. Six directories are read per session start, because each
// costs an `adr-next` spawn; the rest used to be dropped by a `break`, and the
// "(+N more)" line counted only what was read and then hidden. A Windows desktop
// over a 72-record corpus (2026-09-23) saw six all-done directories and "+3 more"
// while the thirteen unread ones held every READY task — an all-clear this hook
// never observed (ADR-005). The unread count travels back with the read set.
export const TASK_DIRECTORY_READ_CAP = 6

// ⚠ AND THE SIX ARE THE MOST RECENTLY CHANGED, NOT THE FIRST LISTED. Listing order put
// a corpus's oldest records first, so this repository's session start read ADR-001 to
// ADR-006, all done, and called every record that could be in flight "not read"
// (BACKLOG §325, Codex architecture review 2026-10-01). A directory's rank is the newest
// modification time among its listed task files: no process start, and an uncommitted
// task file — the most in flight of all — ranks first. This orders a reading; it decides
// nothing, and the unread are still said UNPROVEN.
function newestTaskChange(root, files) {
  let newest = 0
  for (const rel of files) {
    try { newest = Math.max(newest, statSync(listedAbsolute(root, rel)).mtimeMs) } catch { /* unreadable: ranks last */ }
  }
  return newest
}

export function taskDirectories(root, listing, cap = TASK_DIRECTORY_READ_CAP, platform = process.platform) {
  if (listing == null) return { read: [], unread: 0 }
  const found = []
  const seen = new Map()
  const frozen = new Map()
  const listed = new Set(listing.map(rel => listedPath(rel, platform)))
  for (const rel of listing) {
    const norm = listedPath(rel, platform)
    const parts = norm.split('/').filter(Boolean)
    const index = parts.indexOf('tasks')
    if (index < 0) continue
    // ⚠ `tasks` IS ANSIBLE'S WORD TOO. Every role has a `roles/<name>/tasks/main.yml`,
    // and any listed path with a `tasks` component qualified — so an infrastructure
    // repository spent half its six orientation entries on `roles/admins/tasks:
    // UNPROVEN — no task files`, alphabetically ahead of a READY task, at every
    // session start (peer-measured 2026-09-19). `adr-next` reads the `*.md` directly
    // under the directory and nothing else, so that is what makes one a candidate.
    if (parts.length !== index + 2 || !/\.md$/i.test(parts[index + 1])) continue
    const dirParts = parts.slice(0, index + 1)
    if (listedUnderUninterestingDirectory(dirParts.slice(0, -1))) continue
    const archived = underFrozenArchive(root, dirParts, frozen, listed)
    if (archived === true) continue
    const key = dirParts.join('/')
    if (seen.has(key)) {
      seen.get(key).files.push(norm)
      continue
    }
    // `archive: 'unknown'` travels WITH the directory, as a field on the entry.
    const entry = { directory: listedAbsolute(root, key), archive: archived === 'unknown' ? 'unknown' : 'no', files: [norm] }
    seen.set(key, entry)
    found.push(entry)
  }
  const once = onceByRealPath(found.map(entry => entry.directory))
  const kept = new Set(once.kept)
  // A directory git lists and the disk does not hold (a sparse checkout, a deleted tree) ranked
  // last and fell out of the window as one more "not read", where it was never there to read
  // (BACKLOG §350 C5, two Windows reports). It is named apart; any other failure to look is kept.
  const gone = entry => { try { statSync(entry.directory); return false } catch (error) { return error?.code === 'ENOENT' } }
  const absent = found.filter(entry => kept.has(entry.directory) && gone(entry)).map(entry => entry.directory)
  const ranked = found.filter(entry => kept.has(entry.directory) && !absent.includes(entry.directory))
    .map((entry, order) => ({ entry, order, newest: newestTaskChange(root, entry.files) }))
    .sort((a, b) => b.newest - a.newest || a.order - b.order)
    .map(({ entry: { files: _files, ...entry } }) => entry)
  return { read: ranked.slice(0, cap), unread: Math.max(0, ranked.length - cap), aliases: once.aliases, absent }
}

// A record's filename, and NOT a dated one: `2026-03-08-retrospective.md`
// begins with four digits and a dash like every `0043-thing.md` does, so a
// postmortem or a journal entry was read as ADR-2026. Measured on a real corpus,
// 2026-08-26. The guard is the shared date shape since ADR-063, so `2026_03_08`
// and `2026.3.8` are dates too, not only the hyphen spelling.
// With the ADR prefix a record is named at any width (`ADR-7-x.md`), as record.py's
// RECORD_FILE_RE reads it; a BARE number still needs three or four digits, so
// `1-intro.md` is not a record (a Windows chaos round of 916b515, C-2).
const ADR_FILE = /^(?![0-9]{4}[-_.][0-9]{1,2}[-_.])(?:adr[-_]?\d{1,4}|\d{3,4})[-._]/i

const RECORD_BUDGET = 200

// ADR-092 Decision 5: the content screen streams at most this much in one `adrCorpus` call, then stops
// and names the first path it did not screen, so a huge tree is PARTIAL rather than a long SessionStart.
const SCREEN_BUDGET = 64 * 1024 * 1024

// --- Record identity (ADR-063) ------------------------------------------------
// The same rule as plugin/lib/record.py's `record_id` and `references_in`, kept
// here because this hook cannot import the gate library. One fixture table in
// tests/record-identity.test.mjs runs both, so a divergence is a failing test.
// A record is `ADR-NNN` when its title or a non-date name carries a number, the
// exact stem of a date-shaped name otherwise, and nothing else by name.
const RECORD_FILE_RE = /^(?:adr[-_]?)?(\d{1,4})[-._]/i

// The exclusion guards match any decimal digit, as record.py's do; a NUMBER is read with ASCII `\d`
// below. Two classes, on purpose (record.py says why). "Any decimal digit" is DECIMAL_DIGIT_RANGES,
// record.py's frozen table spelled again, never this runtime's `\p{Nd}`: Node 26's Unicode 17 took
// U+11DE0 for a digit and Python 3.14's Unicode 16 did not (a gpt-6.1-sol review of ADR-092's
// execution, 2026-10-07, finding 3). tests/record-definition-parity.test.mjs holds the two tables equal.
export const DECIMAL_DIGIT_RANGES = [
  [0x30, 0x39], [0x660, 0x669], [0x6F0, 0x6F9], [0x7C0, 0x7C9], [0x966, 0x96F], [0x9E6, 0x9EF],
  [0xA66, 0xA6F], [0xAE6, 0xAEF], [0xB66, 0xB6F], [0xBE6, 0xBEF], [0xC66, 0xC6F], [0xCE6, 0xCEF],
  [0xD66, 0xD6F], [0xDE6, 0xDEF], [0xE50, 0xE59], [0xED0, 0xED9], [0xF20, 0xF29], [0x1040, 0x1049],
  [0x1090, 0x1099], [0x17E0, 0x17E9], [0x1810, 0x1819], [0x1946, 0x194F], [0x19D0, 0x19D9],
  [0x1A80, 0x1A89], [0x1A90, 0x1A99], [0x1B50, 0x1B59], [0x1BB0, 0x1BB9], [0x1C40, 0x1C49],
  [0x1C50, 0x1C59], [0xA620, 0xA629], [0xA8D0, 0xA8D9], [0xA900, 0xA909], [0xA9D0, 0xA9D9],
  [0xA9F0, 0xA9F9], [0xAA50, 0xAA59], [0xABF0, 0xABF9], [0xFF10, 0xFF19], [0x104A0, 0x104A9],
  [0x10D30, 0x10D39], [0x10D40, 0x10D49], [0x11066, 0x1106F], [0x110F0, 0x110F9], [0x11136, 0x1113F],
  [0x111D0, 0x111D9], [0x112F0, 0x112F9], [0x11450, 0x11459], [0x114D0, 0x114D9], [0x11650, 0x11659],
  [0x116C0, 0x116C9], [0x116D0, 0x116E3], [0x11730, 0x11739], [0x118E0, 0x118E9], [0x11950, 0x11959],
  [0x11BF0, 0x11BF9], [0x11C50, 0x11C59], [0x11D50, 0x11D59], [0x11DA0, 0x11DA9], [0x11F50, 0x11F59],
  [0x16130, 0x16139], [0x16A60, 0x16A69], [0x16AC0, 0x16AC9], [0x16B50, 0x16B59], [0x16D70, 0x16D79],
  [0x1CCF0, 0x1CCF9], [0x1D7CE, 0x1D7FF], [0x1E140, 0x1E149], [0x1E2F0, 0x1E2F9], [0x1E4F0, 0x1E4F9],
  [0x1E5F1, 0x1E5FA], [0x1E950, 0x1E959], [0x1FBF0, 0x1FBF9],
]

// The table as the inside of a `u`-flag character class.
const DECIMAL_DIGIT = DECIMAL_DIGIT_RANGES.map(([first, last]) => `\\u{${first.toString(16)}}-\\u{${last.toString(16)}}`).join('')

const TASK_SHAPED_RE = new RegExp(`^(?:adr[-_]?)?[${DECIMAL_DIGIT}]{1,4}[-._]T[${DECIMAL_DIGIT}]+(?:[-._]|$)`, 'iu')

const DATE_SHAPED_RE = new RegExp(`^[${DECIMAL_DIGIT}]{4}[-_.][${DECIMAL_DIGIT}]{1,2}[-_.]`, 'u')

const TITLE_TASK_RE = /^﻿?#\s*(?:Task\s+)?ADR[-_]?[A-Za-z0-9._-]*-T\d+/i

const TITLE_ADR_RE = /^﻿?#\s*ADR[-_ ]?(\d.*)$/i

const TITLE_NUMBER_RE = /^(\d{1,4})(?!\d)/

const HEADING_LINE_RE = /^﻿?#\s/

// A reference that is nothing but a date, `(2026-07-12)` beside a path: never a record.
const BARE_DATE_RE = /^\d{4}[-_.]\d{1,2}[-_.]\d{1,2}$/

const NUMBERED_REF_RE = /(?<![A-Za-z0-9_])ADR-(\d+)(?![A-Za-z0-9_])/gi

const REF_CHUNK_RE = /[A-Za-z0-9._/\\-]+/g

const numberId = number => `ADR-${String(Number(number)).padStart(3, '0')}`

/**
 * The first `# ` heading line of a record's text, or null: outside a leading frontmatter block and
 * outside every fence, as record.py's `title_line` reads it (ADR-092 Decision 13), so a YAML comment or
 * a fenced `# ADR-…` example never decides a record's identity.
 */
export function titleLine(text) {
  const lines = String(text).split(/\r\n|\r|\n/)
  const head = frontmatterClose(lines)
  for (const [index, [line, fenced]] of fencedLines(String(text)).entries()) {
    if (fenced || (head !== null && index <= head)) continue
    if (HEADING_LINE_RE.test(line)) return line
  }
  return null
}

/** A record's identity (ADR-063): `ADR-NNN`, a dated stem, or null. */
export function recordId(name, title = null) {
  if (title !== null && !TITLE_TASK_RE.test(title)) {
    const found = TITLE_ADR_RE.exec(title)
    if (found && !DATE_SHAPED_RE.test(found[1])) {
      const number = TITLE_NUMBER_RE.exec(found[1])
      if (number) return numberId(number[1])
    }
  }
  const isMarkdown = name.toLowerCase().endsWith('.md')
  const stem = isMarkdown ? name.slice(0, -'.md'.length) : name
  const shaped = isMarkdown ? name : `${name}.`
  if (DATE_SHAPED_RE.test(shaped)) return stem
  if (TASK_SHAPED_RE.test(stem)) return null
  const found = RECORD_FILE_RE.exec(shaped)
  return found ? numberId(found[1]) : null
}

/**
 * Every record a piece of prose names, in the order it names them: `ADR-NNN` ids
 * and dated stems, a stem only as a whole token or path component.
 */
export function referencesIn(text) {
  return [...new Set(referencesWithProvenance(text).map(entry => entry.id))]
}

// Each reference in text order, with where it is and whether it was written as a
// file or a path (`x.md`, `docs/adr/x`) rather than a bare token: record.py's
// `_references`, so a date written as a filename is a name, not prose.
function referencesWithProvenance(text) {
  const found = []
  for (const match of text.matchAll(NUMBERED_REF_RE)) found.push({ at: match.index, id: numberId(match[1]), explicit: true })
  for (const chunk of text.matchAll(REF_CHUNK_RE)) {
    let offset = chunk.index
    const pathlike = /[/\\]/.test(chunk[0])
    for (const raw of chunk[0].split(/[/\\]/)) {
      let part = raw.replace(/[.,;:)]+$/, '')
      const filename = part.toLowerCase().endsWith('.md')
      if (filename) part = part.slice(0, -'.md'.length).replace(/[.,;:)]+$/, '')
      if (part && DATE_SHAPED_RE.test(part)) found.push({ at: offset, id: part, explicit: filename || pathlike })
      offset += raw.length + 1
    }
  }
  return found.sort((a, b) => a.at - b.at)
}

// A `## Heading` section's body. Written as a scan rather than one regex because
// JavaScript has no `\Z`: `(?=^##\s|\Z)` requires a literal Z, so the lookahead
// never matched and every section read came back empty — silently, which is the
// only way a corpus-reading feature can ship looking like an empty corpus.
function markdownSection(text, heading) {
  const lines = text.split('\n')
  const start = lines.findIndex(line => new RegExp(`^#{1,6}\\s+${heading}\\s*$`, 'i').test(line))
  if (start < 0) return ''
  const body = []
  for (const line of lines.slice(start + 1)) {
    if (/^#{1,6}\s+\S/.test(line)) break
    body.push(line)
  }
  return body.join('\n')
}

// ONE label, as record.py's `_STATUS_LINE` (the /code-review of ADR-074's batch, 2026-09-29): a
// colon is required, so a prose line such as `Status codes from the API …` is not a Status; the
// word is matched letter by letter, since `/i` and Python's `re.I` fold `ſtatus` differently; a
// line inside a code fence is text; and only these characters are whitespace at a value's edges,
// since `trim` and Python's `strip` disagree (a byte-order mark, `\x1c`), the set is exactly what
// both remove — a no-break space included, which governed at ebfaee0 (the React SPA corpus at 084d925).
// The value may be empty, as in record.py: a bare `Status:` is an undecided first label, never a line
// skipped so a later one governs (the Codex round of 3.1.6, finding 2).
// Indented by at most three spaces: four, or a tab, make an indented code block, whose `Status:` is an
// example, as the MADR 2 bullet's is below (the owner, 2026-10-07: nothing found along the way is left open).
const STATUS_LABEL = /^ {0,3}\*{0,2}[Ss][Tt][Aa][Tt][Uu][Ss](?::\*{0,2}|\*{0,2}:)[ \t]*([^\r\n]*)$/

const EDGE_CODES = [0x20, 0x09, 0x0A, 0x0B, 0x0C, 0x0D, 0xA0, 0x1680, 0x2000, 0x2001, 0x2002, 0x2003, 0x2004,
  0x2005, 0x2006, 0x2007, 0x2008, 0x2009, 0x200A, 0x2028, 0x2029, 0x202F, 0x205F, 0x3000]

const EDGE_CLASS = codeClass(EDGE_CODES)

const EDGE_SPACE = new RegExp(`^${EDGE_CLASS}+|${EDGE_CLASS}+$`, 'g')

const edgeTrim = value => value.replace(EDGE_SPACE, '')

// A `## ` heading's trailing whitespace is Python's `\s`, which record.py's `_HEADING` uses: the shared
// edge set plus `\x1c`-`\x1f` and `\x85`, and never JS's U+FEFF. A heading's text runs to the end of
// its line: JS's `.` stops at U+2028 and U+2029 where Python's does not (the Codex round of 3.1.6, 4).
const STATUS_HEADING = new RegExp(`^## ([^\\r\\n]+?)${codeClass([...EDGE_CODES, 0x1C, 0x1D, 0x1E, 0x1F, 0x85])}*$`)

// Each line with whether it sits inside a code fence, by record.py's `_scan` rules: a line of
// three or more ``` or ~~~ opens one (a ``` opener with a backtick after it does not), only a
// closer of the same marker, at least as long, with nothing but spaces and tabs after it, ends it,
// and the opener and closer count as fenced. `text` is always a whole document, so a leading
// frontmatter block is delimited first and a fence marker inside a YAML value opens nothing
// (ADR-092 Decision 8, as record.py's `unfenced_numbered(lines, document=True)`).
function fencedLines(text) {
  let fence = null
  const lines = text.split(/\r\n|\r|\n/)
  const head = frontmatterClose(lines)
  return lines.map((line, index) => {
    if (head !== null && index <= head) return [line, false]
    const [fenced, next] = fenceStep(line, fence)
    fence = next
    return [line, fenced]
  })
}

// One line of the fence walk: whether `line` is fenced, given the fence open before it (null for none),
// and the fence open after it. Shared by `fencedLines` and the streamed content screen, so the two
// cannot read a fence differently.
function fenceStep(line, fence) {
  // `[^\r\n]`, not `.`: the rest of an opener is the rest of its line, U+2028 and U+2029 included,
  // as `.` reads it in record.py's `_FENCE` (the Codex round of 3.1.6, finding 3).
  const marker = line.match(/^[ \t]*(`{3,}|~{3,})([^\r\n]*)$/)
  if (fence === null) {
    if (marker && !(marker[1][0] === '`' && marker[2].includes('`'))) return [true, marker[1]]
    return [false, null]
  }
  if (marker && marker[1][0] === fence[0] && marker[1].length >= fence.length && /^[ \t]*$/.test(marker[2])) return [true, null]
  return [true, fence]
}

// The columns a line's leading spaces and tabs fill, a tab advancing to the next multiple of four,
// as record.py's `indent_columns`: four or more make an indented code block (ADR-092 Decision 8).
function indentColumns(line) {
  let column = 0
  for (const char of line) {
    if (char === ' ') column += 1
    else if (char === '\t') column += 4 - (column % 4)
    else break
  }
  return column
}

// ADR-087 T1: a leading YAML frontmatter block, as record.py's `frontmatter_block` finds it — the
// text's first line is `---` (after a byte-order mark, with trailing blanks), and the block ends at
// the next `---` or `...` line; an unclosed block is not one. `[first, last]`, the 0-based indices of
// those two lines, or null.
export const FRONTMATTER_OPEN = /^﻿?---[ \t]*$/

const FRONTMATTER_CLOSE = /^(?:---|\.\.\.)[ \t]*$/

export function frontmatterBlock(text) {
  const last = frontmatterClose(String(text).split(/\r\n|\r|\n/))
  return last === null ? null : [0, last]
}

// The index of the line closing a leading frontmatter block in `lines`, or null: the one rule
// `frontmatterBlock` and `fencedLines` share, as record.py's `_frontmatter_close`.
function frontmatterClose(lines) {
  if (!FRONTMATTER_OPEN.test(lines[0])) return null
  for (let index = 1; index < lines.length; index += 1) {
    if (FRONTMATTER_CLOSE.test(lines[index])) return index
  }
  return null
}

// A frontmatter value as YAML writes it (ADR-087 F-2), as record.py's `_frontmatter_value`: one
// enclosing pair of `"` or `'` and a trailing ` #` comment removed. Only inside the block: outside
// it a quote is part of the value. A `{` or `<` placeholder keeps its bracket, so it names no word.
function frontmatterValue(value) {
  const trimmed = edgeTrim(value)
  const quoted = trimmed.match(/^(?:"([^"]*)"|'([^']*)')(?:[ \t]+#[^\r\n]*)?$/)
  return quoted ? (quoted[1] ?? quoted[2]) : trimmed.replace(/[ \t]+#[^\r\n]*$/, '')
}

// The value after the first Status label outside a code fence, as written, or null. A label inside
// a leading frontmatter block is read as YAML writes it (ADR-087 T1), so `rawStatus` and
// `recordStatus` both see `"accepted"` as `accepted`. With no label anywhere, a MADR 2 bullet
// (`* Status: accepted`) above the first `## ` heading is the label (ADR-087 T2), as in record.py.
// The bullet is indented by at most three spaces: four, or a tab, make an indented code block, whose
// `- Status: accepted` is an example (a gpt-6.1-sol review of ADR-087, finding 2).
const STATUS_BULLET = /^ {0,3}[*-][ \t]+\*{0,2}[Ss][Tt][Aa][Tt][Uu][Ss](?::\*{0,2}|\*{0,2}:)[ \t]*([^\r\n]*)$/

function inlineStatus(text) {
  const block = frontmatterBlock(text)
  let bullet = null
  let above = true
  for (const [index, [line, fenced]] of fencedLines(text).entries()) {
    if (fenced) continue
    const inBlock = block && block[0] < index && index < block[1]
    // Inside the frontmatter only a top-level key is the record's own: an indented line belongs to a
    // nested value, such as a `|` literal block quoting an example (the same review, finding 1).
    if (inBlock && /^[ \t]/.test(line)) continue
    const found = line.match(STATUS_LABEL)
    if (found) return inBlock ? frontmatterValue(found[1]) : found[1]
    if (above && STATUS_HEADING.test(line)) above = false
    else if (above && bullet === null) bullet = line.match(STATUS_BULLET)
  }
  return bullet ? bullet[1] : null
}

// `**Status:** Accepted`, `Status: Accepted`, or a `## Status` section's first line.
// The status line as written, for reading WHICH record it names. `recordStatus`
// strips every underscore, which is right for classifying the status and wrong for
// a record name inside it: `2026_07_15_new` named nothing, `…-new_` another record
// (Codex, 2026-09-22, rounds 4 and 5). Only `*` and backticks are markup here — for a
// section's line too, which went through `recordStatus` until the /code-review of ADR-074.
function rawStatus(text) {
  return edgeTrim((inlineStatus(text) ?? statusSection(text) ?? '').replace(/[*`]/g, ''))
}

// The Status as record.py's `record_status` reads it: `''` for a `## Status` section with no
// readable line, and null when the text has no label and no such section (ADR-092 Decision 8).
export function recordStatus(text) {
  const value = inlineStatus(text) ?? statusSection(text)
  return value === null ? null : edgeTrim(value.replace(/[*_`]/g, ''))
}

// ADR-074 T2: the first readable line of a record's `## Status` section, `''` when it has none,
// or null when there is no such section — found as record.py's `_sections` finds a section, so the
// two readers cannot disagree about where it is. Level 2 only (`### Status` is not it); a `## `
// line inside a ``` or ~~~ fence is text, and only a closer of the same marker, at least as long,
// with nothing but spaces and tabs after it, ends the fence; a repeated heading yields the last.
// A readable line is outside every fence (its marker lines included) and indented less than four
// columns, as record.py's `status_section` reads it (ADR-092 Decision 8). The generic
// `markdownSection` matches any level and ignores fences, which is right for the sections it
// still reads and was how a fenced example's `## Status` governed here and nowhere else.
function statusSection(text) {
  let body = null
  let found = null
  for (const [line, fenced] of fencedLines(text)) {
    const heading = fenced ? null : line.match(STATUS_HEADING)
    if (heading) {
      body = heading[1].toLowerCase() === 'status' ? [] : null
      if (body) found = body
    } else if (body && !fenced && indentColumns(line) < 4) {
      body.push(line)
    }
  }
  return found === null ? null : found.map(edgeTrim).find(Boolean) ?? ''
}

// Accepted governs — including in the archive, where "an archived Accepted ADR
// may still govern" is this corpus's own stated rule. Proposed and Draft govern
// nothing yet, and are neither.
//
// ADR-074: the kind is a LOOKUP of the run of Unicode letters and digits the value
// starts with, lower-cased, never a case-insensitive regex. JS's `\b` is ASCII, so
// `/^accepted\b/i` let `Acceptedé` govern where Python did not; a lookup has no
// word end and no case folding to differ in. record.py's `status_kind` is the
// same table, and tests/status-reading.test.mjs holds the two to one answer.
// ADR-087 adds `active`, as record.py does: four public corpora write it for a record in force.
const STATUS_KINDS = new Map([
  ['accepted', 'governing'], ['active', 'governing'],
  ['proposed', 'pending'], ['draft', 'pending'],
  ['superseded', 'graveyard'], ['withdrawn', 'graveyard'], ['rejected', 'graveyard'], ['deprecated', 'graveyard'],
])

// `status` is recordStatus's, whose markup is already removed (ADR-063), or an archive effect.
export function recordStatusKind(status) {
  const word = edgeTrim(String(status ?? '')).match(/^[\p{L}\p{N}]+/u)?.[0].toLowerCase()
  return STATUS_KINDS.get(word) ?? null
}

function statusKind(status) {
  const kind = recordStatusKind(status)
  return kind === 'pending' ? null : kind
}

// What the archive catalog of a frozen record says its decision's effect is
// NOW: `governing`, `withdrawn`, or `superseded by <record>` — or null when the
// record is under no archive, or its catalog lists no row for it.
//
// ⚠ THE CATALOG, NOT THE FILE, IS THE AUTHORITY FOR A FROZEN RECORD. A retired file
// is never edited — that is what frozen means — so one withdrawn in 2026 says
// `Status: Accepted` for ever. This reader took the file's word, and on a session's
// first edit of a governed file `adr-context` answered, unprompted, that three
// withdrawn and superseded records GOVERN lifecycle.mjs, each "caught by" a test
// that had been deleted with them. Found 2026-09-19, the day after this repository
// first retired anything; the comment above quoted half the rule and not this half.
//
// ⚠ AND A CATALOG THAT DOES NOT ESTABLISH THE EFFECT LEAVES IT UNPROVEN — it does
// not hand authority back to the frozen file. A missing row, a duplicate row, an
// effect spelled `**withdrawn**`, or a title holding `\|` that shifted the columns
// each fell through to `Status: Accepted` and came back `governing`, `look: ok`;
// a row whose LINK named another file retired a record it was not about
// (different-lineage review, 2026-09-19). One row, targeting this file, carrying
// one of the three effects `adr-retire-check` accepts — or `{ unproven }`.
// Returns null when the directory is not a LISTED archive: the file's own status
// stands there, and an unlisted README on this disk governs nothing (CLAUDE.md §8).
const ARCHIVE_EFFECT = /^(?:governing|withdrawn|superseded by \S.*)$/i

function catalogCells(line) {
  const cells = []
  let cell = ''
  for (let index = 0; index < line.length; index += 1) {
    if (line[index] === '\\' && line[index + 1] === '|') { cell += '|'; index += 1 }
    else if (line[index] === '|') { cells.push(cell.trim()); cell = '' }
    else cell += line[index]
  }
  cells.push(cell.trim())
  return cells.slice(1, -1)
}

// ⚠ THE CATALOG SITS AT THE ARCHIVE'S ROOT, which is not always the file's own
// directory: the per-record layout `<archive>/<stem>/<stem>.md` keeps the record
// one level down, and this reader looked only beside the file, found no catalog,
// and let a withdrawn record's frozen `Status: Accepted` govern (ADR-063; the
// comment above warns of exactly that). So walk up, to the corpus root and no
// further, to the nearest listed directory whose README carries the Lifecycle
// marker — or whose README cannot be read, which the caller reports as unproven.
// No such directory is the file's own, where the old answer, not an archive, stands.
// The names git lists directly in `directory`: what `listedReadme` chooses among.
const listedNamesIn = (directory, listed) =>
  [...listed].filter(candidate => path.dirname(candidate) === directory).map(candidate => path.basename(candidate))

function catalogDirectoryFor(file, root, reader, listed) {
  const top = path.join(root)
  for (let directory = path.dirname(file); ; directory = path.dirname(directory)) {
    const readme = listedReadme(directory,
      listedNamesIn(directory, listed),
      candidate => reader.text(candidate))
    if (readme === README_UNKNOWN) return directory
    if (readme !== null) {
      try {
        if (reader.text(readme).split(/\r?\n/).includes(ARCHIVE_LIFECYCLE_LINE)) return directory
      } catch { return directory }
    }
    if (directory === top || path.dirname(directory) === directory) return path.dirname(file)
  }
}

function archiveDecisionEffect(file, reader, cache, listed, root) {
  const directory = catalogDirectoryFor(file, root, reader, listed)
  if (!cache.has(directory)) {
    let rows = null
    const readme = listedReadme(directory,
      listedNamesIn(directory, listed),
      candidate => reader.text(candidate))
    if (readme === README_UNKNOWN) rows = 'unknown-readme'
    else if (readme !== null) {
      try {
        const lines = reader.text(readme).split(/\r?\n/)
        if (lines.includes(ARCHIVE_LIFECYCLE_LINE)) {
          rows = new Map()
          for (const line of lines) {
            if (!line.startsWith('|')) continue
            const cells = catalogCells(line)
            const link = /^\[[^\]]+\]\(([^)]*)\)$/.exec(cells[0] ?? '')
            if (!link) continue
            // ⚠ A ROW SPEAKS FOR THE FILE ITS LINK RESOLVES TO, not for any file that
            // shares a basename. Keyed by basename, `../b/ADR-001-x.md` and a remote
            // URL ending in the name both retired the local record, while the local
            // `ADR-001-x.md#decision` was refused. A fragment is dropped, as
            // `adr-retire-check` drops it.
            // ⚠ AN ALLOWLIST, NOT A BLOCKLIST — this is a classifier over open input,
            // and "not recognised as remote" is not "known to be local" (CLAUDE.md
            // §16). It was a blocklist three times: no check at all, then a scheme
            // test removed as "redundant", then a scheme-and-root test that a
            // LEADING SPACE and an angle-wrapped `<https://…>` both walked past —
            // `https://host/../../ADR-007-x.md` normalises onto the record, and each
            // retired it with `look: ok`. So a link is a plain relative path in the
            // characters a record's filename is made of, or the row says nothing.
            // A legal but unusual name (a colon, a space) costs an UNPROVEN, which is
            // the direction a wrong guess here is allowed to fail in.
            const href = link[1].split('#')[0]
            if (!/^(?:\.\.?\/)*[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/.test(href)) continue
            const target = path.resolve(directory, ...href.split('/'))
            rows.set(target, [...(rows.get(target) ?? []), cells[2] ?? ''])
          }
        }
      } catch { rows = 'unread' }
    }
    cache.set(directory, rows)
  }
  const rows = cache.get(directory)
  if (rows === null) return null
  if (rows === 'unread') return { unproven: 'the README beside it is listed and could not be read, so whether this is an archive is unknown' }
  if (rows === 'unknown-readme') return { unproven: 'a README is listed beside it under another spelling, and whether that is this directory\'s catalog is not something this reader guesses — name it `README.md`' }
  const effects = rows.get(file) ?? []
  if (effects.length === 0) return { unproven: 'its archive catalog has no row that links to it' }
  if (effects.length > 1) return { unproven: 'its archive catalog lists it more than once' }
  if (!ARCHIVE_EFFECT.test(effects[0])) return { unproven: `its archive catalog gives an effect this reader does not know: ${effects[0].slice(0, 60)}` }
  // ⚠ A SUPERSESSION MUST NAME A RECORD. `superseded by banana` satisfied the effect
  // pattern and became an authoritative graveyard with no replacement, which
  // nothing downstream could call dangling (Codex, 2026-09-22).
  if (/^superseded\b/i.test(effects[0]) && supersessionTarget(effects[0]) === null) {
    return { unproven: `its archive catalog says it was superseded but names no record: ${effects[0].slice(0, 60)}` }
  }
  return { effect: effects[0] }
}

// One glob component at a time, so `**` can cross separators and `*` cannot.
function globToRegExp(pattern) {
  const normalised = pattern.replace(/\\/g, '/').replace(/^\.\//, '')
  let source = '^'
  for (let index = 0; index < normalised.length; index += 1) {
    const character = normalised[index]
    if (character === '*') {
      if (normalised[index + 1] === '*') {
        source += '.*'
        index += normalised[index + 2] === '/' ? 2 : 1
      } else {
        source += '[^/]*'
      }
    } else if (character === '?') source += '[^/]'
    else source += character.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  }
  try {
    return new RegExp(`${source}$`, 'i')
  } catch {
    return null
  }
}

// A declared path matches the file itself, anything under it when it names a
// directory, and whatever its globs cover.
export function pathMatchesDeclaration(candidate, declaration) {
  const file = candidate.replace(/\\/g, '/').replace(/^\.\//, '')
  const declared = declaration.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/$/, '')
  if (!declared) return false
  if (/[*?]/.test(declared)) return globToRegExp(declared)?.test(file) ?? false
  return file === declared || file.startsWith(`${declared}/`)
}

// `**Governs:**` is optional and additive: a corpus that never adopts it still
// resolves through its task tables. Both the plain list and adrkit's typed
// matcher form are read; only `type: path` is RESOLVED, and the others are
// recorded rather than silently matching nothing — a matcher that matches
// nothing reads as coverage while covering nothing, which is the vacuous pass
// this project's own arch-write skill warns about.
/** The checks a record says enforce it, or [] for absent or `None — <reason>`. */
export function declaredEnforcement(text) {
  const header = text.match(/^[ \t]*\*{0,2}Enforced-by:?\*{0,2}[ \t]*:?[ \t]*(.*)$/im)
  if (!header) return []
  const inline = header[1].trim()
  if (!inline || /^none\b/i.test(inline)) return []
  // A BACKTICKED span is one item, commas inside it included — a mutation label
  // reads "…mutates, exactly once" and splitting on every comma tears it in
  // half. Whatever is left outside the backticks is then comma-separated. Both
  // cases are in the truth table mirrored from tests/gate-regressions.py.
  const parts = []
  const rest = []
  let position = 0
  for (const span of inline.matchAll(/`([^`]*)`/g)) {
    rest.push(inline.slice(position, span.index))
    parts.push(span[1].trim())
    position = span.index + span[0].length
  }
  rest.push(inline.slice(position))
  parts.push(...rest.join(',').split(',').map(part => part.trim()))
  return parts.filter(value => value && !/^[<(]/.test(value))
}

function declaredGoverns(text) {
  const paths = []
  const unresolved = []
  const header = text.match(/^[ \t]*\*{0,2}Governs:?\*{0,2}[ \t]*:?[ \t]*(.*)$/im)
  if (header) {
    const inline = header[1]
    if (!/^none\b/i.test(inline.trim())) {
      for (const token of inline.matchAll(/`([^`]+)`|([^\s,]+)/g)) {
        const value = (token[1] ?? token[2]).trim()
        if (value && !/^[<(]/.test(value)) paths.push(value)
      }
    }
    // The dashed/indented run under the header. The first split element is the
    // remainder of the header line itself, which `(.*)` already consumed.
    const following = text.slice(text.indexOf(header[0]) + header[0].length).split('\n').slice(1)
    const block = []
    for (const line of following) {
      if (!line.trim()) { if (block.length) break; else continue }
      if (!/^\s*-/.test(line) && !/^\s\s+\S/.test(line)) break
      block.push(line)
    }
    for (const matcher of block.join('\n').matchAll(/-\s*type:\s*(\w+)[\s\S]*?pattern:\s*["']?([^"'\n]+?)["']?\s*$/gm)) {
      if (matcher[1].toLowerCase() === 'path') paths.push(matcher[2].trim())
      else unresolved.push(`${matcher[1]}:${matcher[2].trim()}`)
    }
  }
  return { paths, unresolved }
}

// Cell 0 of every `## Affected Files` row. The table is required by adr-lint, so
// this resolves on records nobody has touched for this feature.
function affectedFiles(text) {
  const section = markdownSection(text, 'Affected Files')
  if (!section) return []
  const paths = []
  for (const line of section.split('\n')) {
    if (!line.trim().startsWith('|')) continue
    const first = line.split('|')[1]?.trim() ?? ''
    const cell = first.match(/`([^`]+)`/)?.[1] ?? first
    if (!cell || /^-+$/.test(cell) || /^file$/i.test(cell) || /^</.test(cell)) continue
    // A path, not prose. On a real corpus, cell 0 of neighbouring tables produced
    // `(T3's two tests)`, `(compile)` and `! rg -iq 'MCP stdio' README.md`, every
    // one reported as a governed path. A cell with a space in it is a sentence.
    if (/\s/.test(cell) || !/[./\\]/.test(cell)) continue
    paths.push(cell)
  }
  return paths
}

// ADR-014, 014-thing.md, `# ADR-14: …` — the number, however this corpus spells
// it, by the shared rule (ADR-063): a dated name has none, whatever digits it
// starts with, and neither does a title whose number is itself a date.
function adrNumber(file, text) {
  const id = recordId(path.basename(file), titleLine(text))
  return id !== null && id.startsWith('ADR-') ? Number(id.slice('ADR-'.length)) : null
}

// Shared task directories are read by several records. Keep one observation per
// scan, including read failures; the next scan starts fresh and can see repairs.
function corpusReader() {
  const once = read => {
    const results = new Map()
    return key => {
      if (!results.has(key)) {
        try { results.set(key, { value: read(key) }) }
        catch (error) { results.set(key, { error }) }
      }
      const result = results.get(key)
      if ('error' in result) throw result.error
      return result.value
    }
  }
  return {
    // A lone CR ends a line too: a CR-only file was one line here, so every path in its
    // `Affected Files` was lost without a word (BACKLOG §350 C5). CRLF is left as it is.
    // Only a regular file is opened: a FIFO named like a task blocked this read until the
    // process was killed (BACKLOG §351). Anything else throws, and is read as unread.
    text: once(file => {
      if (!statSync(file).isFile()) throw new Error(`${file} is not a regular file`)
      return readFileSync(file, 'utf8').replace(/\r(?!\n)/g, '\n')
    }),
    entries: once(directory => readdirSync(directory, { withFileTypes: true })),
  }
}

// Where a record's tasks actually live. Two layouts, both real: `tasks/` beside
// the record, and a sibling directory NAMED FOR THE RECORD holding it —
// `docs/adr/ADR-110-slug.md` with `docs/adr/ADR-110/tasks/`. Measured against a
// 171-record corpus on 2026-08-26, where the second is the only layout used and
// looking beside the record found nothing: 142 accepted decisions reported as
// governing no code, which is a confident wrong answer rather than a gap.
//
// `owned` says the directory is named for this record, which is attribution in
// itself — no back-reference needed, and that corpus has none: its task files
// never name their ADR in the text.
function taskDirectoriesFor(file, number, reader) {
  const directory = path.dirname(file)
  const found = [{ path: path.join(directory, 'tasks'), owned: false }]
  // A record with no number still owns the directory named after it. Ownership
  // was matched on the ADR NUMBER alone, so `2026-08-17-thing.md` beside
  // `2026-08-17-thing/tasks/` was classified correctly and reported zero tasks —
  // the record found, its work invisible (docs/BACKLOG.md §55). The stem is
  // exact, so it cannot bind a directory to the wrong record the way a loose
  // numeric prefix could.
  const stem = path.basename(file).replace(/\.md$/i, '')
  let siblings = []
  try { siblings = reader.entries(directory) } catch { return found }
  // A directory named exactly for ANOTHER record is that record's. Ownership by number
  // alone gave `ADR-002-prices-are-integer-cents/tasks` to a second ADR-002 beside it,
  // so a record with no tasks was linted against another's (a Windows chaos round of
  // 916b515, C1). A number-only directory (`ADR-110/tasks`) still binds by number.
  const stems = new Set(siblings.filter(entry => entry.isFile() && /\.md$/i.test(entry.name))
    .map(entry => entry.name.replace(/\.md$/i, '')))
  for (const entry of siblings) {
    if (!entry.isDirectory() || (entry.name !== stem && stems.has(entry.name))) continue
    const owns = number !== null && /^(?:adr[-_]?)?0*(\d{1,4})\b/i.exec(entry.name)
    if ((owns && Number(owns[1]) === number) || entry.name === stem) {
      found.push({ path: path.join(directory, entry.name, 'tasks'), owned: true })
    }
  }
  return found
}

/**
 * The task files a record owns, by directory ownership and by self-naming.
 *
 * Extracted so a record this reader cannot CLASSIFY still has its tasks
 * attributed: `adrCorpus` needs the texts as well and inlines the same walk for
 * the governed-path union, and both call `taskDirectoriesFor` with the same
 * number. Kept beside it rather than duplicated at the caller — a second
 * attribution rule is a second thing to keep in step (ADR-001, ADR-004).
 */
function taskFilesFor(file, text, reader = corpusReader()) {
  const found = []
  for (const tasks of taskDirectoriesFor(file, adrNumber(file, text), reader)) {
    let entries = []
    try {
      entries = reader.entries(tasks.path).map(entry => entry.name).filter(name => name.toLowerCase().endsWith('.md')
        && name.toLowerCase() !== 'readme.md')
    } catch { continue }
    for (const name of entries) found.push(path.join(tasks.path, name))
  }
  return [...new Set(found)]
}

/**
 * A record this reader would otherwise never open, recognised by CONTENT.
 *
 * `ADR_FILE` matches a numeric filename and deliberately excludes an ISO-dated
 * one, because `2026-03-08-retrospective.md` was being read as ADR-2026. That
 * exclusion took an entire naming convention with it: a corpus whose records are
 * all named `2026-08-17-thing.md` produced ZERO records, and the reader then said
 * "Nothing in the corpus is waiting" over two dozen unfinished task files.
 * Measured 2026-08-29 on a 56-record corpus by the session that owns it, and
 * reproduced here on identical bytes under two filenames (docs/BACKLOG.md §55).
 *
 * So the fix is a probe, not a wider pattern. Inside an `adr` directory a file
 * carrying a `Status:` line is a record whatever it is called; everything else
 * still needs the filename. Measured against that corpus before shipping: of 56
 * `.md` files under its `docs/adr`, the 31 with no status line are all
 * non-records (task files, tasks/README.md, an index, a research note), and no
 * postmortem, runbook or spec in the tree carries the line at all.
 *
 * A task file is excluded by PATH rather than by content, because a
 * `tasks/README.md` may well acquire a status line and is never a decision.
 *
 * A STATUS LINE ALONE IS NOT ENOUGH, and this repository's own fixtures prove
 * why: `2026-03-08-retrospective.md` carrying `**Status:** Accepted` is the
 * defect the filename guard was added for, and a probe reading only the status
 * would re-open it. A decision record also SAYS something — it carries the
 * Context or Decision section every template in this project requires — so the
 * probe asks for both. The corpus that reported §55 confirms the discrimination
 * holds there: its 31 status-less files are all non-records, and the three
 * record-SHAPED filenames that are not records (an index, a research note, a
 * `.queries.md` companion) self-excluded only by luck, which is exactly the
 * fragility a second condition removes.
 */
export const RECORD_DIRECTORY = /^(?:adrs?|decisions?)(?:[-_]archived?s?)?$|^archives?[-_](?:adrs?|decisions?|records?)$/i

// ADR-092: THE ONE DEFINITION'S ONLY MIRROR. record.py's `recognised_as_record` is the definition and
// adr-lint's verdict; this reads the same rule, held to it row by row by
// tests/fixtures/record-recognition.json. No file under a `templates` directory is a record (as listed or
// where its real path lands); a name starting `ADR-<n>` or `spec-<n>` is one whatever it holds; a README is
// never one by content; otherwise a Status and a one-line `## Context` or `## Decision` heading, both read
// outside every fence, with a line-start `**Status:**` or kept where records are.
// ⚠ SPELLED, NOT `\s`: Python's `\s` holds U+0085 and U+001C-U+001F and JS's does not, and JS's holds
// U+FEFF and Python's does not (a gpt-6.1-sol delta review, 2026-10-07, finding 3). A heading's gap is
// that whitespace less the line breaks, as record.py's `_RECORD_SECTION` reads it (ADR-092 Decision 1).
const PY_LINE_SPACE = '[\\t\\v\\f \\x1c-\\x1f\\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000]'

const RECORD_SECTION = new RegExp(`^##${PY_LINE_SPACE}+(?:[Cc][Oo][Nn][Tt][Ee][Xx][Tt]|[Dd][Ee][Cc][Ii][Ss][Ii][Oo][Nn])(?![A-Za-z0-9_])`)

const BOLD_STATUS = /^\*\*Status:\*\*/

const TEMPLATES_DIRECTORY = /^templates$/i

// The name arms at any width (record.py's `_NUMBERED_REF` and `_SPEC_NAME`). Python's `re.I` folds
// `ſ` (U+017F) into `s`, so it is spelled out here; the digit is any in DECIMAL_DIGIT_RANGES.
const CANONICAL_NAME = /^ADR-[0-9]+(?![A-Za-z0-9_])/i

const SPEC_NAME = new RegExp(`^[sSſ][pP][eE][cC][-_]?[${DECIMAL_DIGIT}]`, 'u')

// A bare run of decimal digits (`2024/`): a year, never another record's own directory.
const BARE_NUMBER = new RegExp(`^[${DECIMAL_DIGIT}]+$`, 'u')

export const nameArmSpelling = file => CANONICAL_NAME.test(path.basename(file)) || SPEC_NAME.test(path.basename(file))

// `target` relative to `base`, or null when it is not under it (Python's `relative_to` raising).
export function inside(base, target) {
  const relative = path.relative(base, target)
  return relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative) ? null : relative
}

// record.py's `_listed_relative`: the path as listed, relative to the root — through the real path of the
// directory it is listed in, then as spelled against the root as spelled, then against the root's real path.
function listedRelative(root, file) {
  const absolute = path.resolve(file)
  let realRoot = null
  let throughDirectory = null
  try {
    realRoot = realpathSync.native(root)
    throughDirectory = path.join(realpathSync.native(path.dirname(absolute)), path.basename(absolute))
  } catch { /* could not take a real path: the spellings below still answer */ }
  for (const [candidate, base] of [[throughDirectory, realRoot], [absolute, path.resolve(root)], [absolute, realRoot]]) {
    if (candidate !== null && base !== null) {
      const found = inside(base, candidate)
      if (found !== null) return found
    }
  }
  return null
}

// record.py's `record_placement` (ADR-092 Decision 2): the real path relative to the real root, else
// the path as listed relative to the root.
function recordPlacement(root, file) {
  try {
    const placed = inside(realpathSync.native(root), realpathSync.native(file))
    if (placed !== null) return placed
  } catch { /* a cycle or a vanished file: the listing answers */ }
  return listedRelative(root, file) ?? file
}

// A relative path's directories. A backslash separates only where the platform is Windows: on POSIX it
// is part of a name, as Python's `Path` reads it, so a root-level `docs\adr\001-x.md` was a record kept
// in `docs/adr` here and a root-level file to record.py (a gpt-6.1-sol review of ADR-092's execution,
// finding 4). The platform is a parameter so both branches are tested everywhere (CLAUDE.md §7).
const separatorsOf = platform => (platform === 'win32' ? /[\\/]/ : /\//)

const directoriesOf = (relative, platform = process.platform) => relative.split(separatorsOf(platform)).slice(0, -1)

// `file` exactly as spelled, relative to the root as spelled and to its real path: no link on the way is
// resolved, so a `templates` directory that is a link to `docs/adr` is still `templates` (the same
// review, finding 2). record.py's `_spelled_relatives`.
function spelledRelatives(root, file) {
  const absolute = path.resolve(file)
  const bases = [path.resolve(root)]
  try { bases.push(realpathSync.native(root)) } catch { /* the root as spelled answers */ }
  return bases.map(base => inside(base, absolute)).filter(found => found !== null)
}

// record.py's `_kept_where_records_are`: under a record directory, never under `tasks/`, and not inside
// another record's own directory below it; a bare decimal number is a year, and the file's own folder
// is not another record's.
function keptWhereRecordsAre(directories, name) {
  if (directories.some(part => part.toLowerCase() === 'tasks')) return false
  const own = recordId(name)
  const anotherRecords = directory => {
    const found = BARE_NUMBER.test(directory) ? null : recordId(directory)
    return found !== null && found !== own
  }
  return directories.some((part, index) => RECORD_DIRECTORY.test(part) && !directories.slice(index + 1).some(anotherRecords))
}

// record.py's `record_discriminators`: a line-start `**Status:**` and a record heading, each read only
// outside every fence of the whole document (ADR-092 Decision 12).
function recordDiscriminators(text) {
  let bold = false
  let heading = false
  for (const [line, fenced] of fencedLines(text)) {
    if (fenced) continue
    bold ||= BOLD_STATUS.test(line)
    heading ||= RECORD_SECTION.test(line)
    if (bold && heading) break
  }
  return { bold, heading }
}

// `status` is record.py's `status_value`: the Status with its markup removed (recordStatus), so the two
// definitions return one value (the same review, finding 19).
export function recognisedAsRecord(root, file, text, { platform = process.platform } = {}) {
  const placed = recordPlacement(root, file)
  const listed = listedRelative(root, file) ?? file
  const status = recordStatus(text)
  const placedDirectories = directoriesOf(placed, platform)
  const kept = keptWhereRecordsAre(placedDirectories, path.basename(placed))
  const answer = (recognised, arm) => ({ recognised, status, kept, arm })
  const spelled = spelledRelatives(root, file).flatMap(relative => directoriesOf(relative, platform))
  if ([...directoriesOf(listed, platform), ...placedDirectories, ...spelled].some(part => TEMPLATES_DIRECTORY.test(part))) return answer(false, 'templates')
  const base = path.basename(file)
  if (CANONICAL_NAME.test(base)) return answer(true, 'canonical')
  if (SPEC_NAME.test(base)) return answer(true, 'spec')
  if (base.toLowerCase() === 'readme.md') return answer(false, 'readme')
  if (status === null) return answer(false, null)
  const { bold, heading } = recordDiscriminators(text)
  // record.py's rule: outside a record directory the Status must be one adr-lint recognises, so a product
  // requirements document or a report with a `**Status:**` line and a `## Context` heading is no record
  // (an outside probe of a PHP monolith, 2026-10-07); kept where records are, an unknown Status is undecided.
  const recognised = heading && (kept || (bold && recordStatusKind(status) !== null))
  return answer(recognised, recognised ? 'content' : null)
}

// record.py's `corpus_eligible` (ADR-092 Decision 3): `.md` in any case, never a README, and no `tasks`,
// `templates` or fixture directory between the root and the file.
export function corpusEligible(relative) {
  const parts = posixListed(relative).split('/').filter(Boolean)
  if (parts.length === 0) return false
  const name = parts.at(-1).toLowerCase()
  if (!name.endsWith('.md') || name === 'readme.md') return false
  const directories = parts.slice(0, -1)
  return !directories.some(part => part.toLowerCase() === 'tasks' || TEMPLATES_DIRECTORY.test(part))
    && !listedUnderUninterestingDirectory(directories)
}

// A regular file's text, decoded as UTF-8, reading at most `limit` bytes: a file past it throws with code
// `EFBIG`, however large it said it was when asked. A size from `stat` is a claim about the file; the bytes
// read are the observation, and a file that grew after it was asked was read whole past every budget (a
// gpt-6.1-sol review of ADR-092's execution, finding 12). Anything but a regular file throws before it is
// opened, as every reader here asks it, so a FIFO is never waited on and a directory throws alike on every
// platform.
export function readRegularText(file, limit = Infinity) {
  if (!statSync(file).isFile()) throw new Error(`${file} is not a regular file`)
  const fd = openSync(file, 'r')
  try {
    const chunks = []
    let total = 0
    const buffer = Buffer.alloc(64 * 1024)
    for (let read; (read = readSync(fd, buffer, 0, buffer.length, null)) > 0;) {
      total += read
      if (total > limit) throw Object.assign(new Error(`${file} runs past ${limit} bytes`), { code: 'EFBIG' })
      chunks.push(Buffer.from(buffer.subarray(0, read)))
    }
    return Buffer.concat(chunks).toString('utf8')
  } finally { closeSync(fd) }
}

// Lines out of a stream of text chunks, each character scanned once. Joining every chunk of one unbroken
// line to everything before it and splitting again made the screen's work grow with the square of the
// line (the same review, finding 13). A CR at the end of one chunk and an LF at the start of the next are
// one break. `scanned`, when given, counts the characters scanned, so a test can count the work.
export function lineStream(take, scanned = null) {
  let parts = []
  let pendingCr = false
  const breaks = /\r\n|\r|\n/g
  return {
    write(chunk) {
      let start = pendingCr && chunk.startsWith('\n') ? 1 : 0
      pendingCr = false
      if (scanned) scanned.chars += chunk.length - start
      breaks.lastIndex = start
      for (let found; (found = breaks.exec(chunk)) !== null;) {
        parts.push(chunk.slice(start, found.index))
        take(parts.join(''))
        parts = []
        start = found.index + found[0].length
        if (found[0] === '\r' && start === chunk.length) pendingCr = true
      }
      parts.push(chunk.slice(start))
    },
    end() {
      take(parts.join(''))
      parts = []
    },
  }
}

// ADR-092 Decision 5's content screen: whether a file holds both a line-start `**Status:**` and a record
// heading outside every fence, streamed whole at any size, with the fence state kept as it streams. A
// file without both lines cannot be a record by the content arm outside a record directory, so the screen
// is exact. A leading frontmatter is delimited first, as `fencedLines` delimits it: the walk runs both as
// if the block closes and as if there is none, and the end of the file says which one was true.
// `budget`, when given, is `{ left }` bytes, spent by the bytes READ: past it the screen stops and answers
// null, could not say, so a file that grew after its size was asked is not streamed past the budget.
export function screenAdmits(file, budget = null) {
  const fd = openSync(file, 'r')
  try {
    const buffer = Buffer.alloc(64 * 1024)
    const decoder = new StringDecoder('utf8')
    // `head`: inside the assumed frontmatter; null once it closed, or when the file has none.
    const walks = { block: { fence: null, bold: false, heading: false, head: undefined }, plain: { fence: null, bold: false, heading: false } }
    let first = true
    const lines = lineStream(line => {
      if (first) {
        first = false
        walks.block.head = FRONTMATTER_OPEN.test(line) ? true : null
        stepWalk(walks.block, line, walks.block.head === true)
      } else if (walks.block.head === true) {
        if (FRONTMATTER_CLOSE.test(line)) walks.block.head = false
        stepWalk(walks.block, line, true)
      } else {
        stepWalk(walks.block, line, false)
      }
      stepWalk(walks.plain, line, false)
    })
    // Which walk the file is: the frontmatter one once its block closed, the plain one when there is
    // none, and undecided while a block is still open.
    const decided = () => (walks.block.head === false ? walks.block : walks.block.head === null ? walks.plain : null)
    for (;;) {
      const read = readSync(fd, buffer, 0, buffer.length, null)
      if (budget && read > 0) {
        budget.left -= read
        if (budget.left < 0) return null
      }
      if (read > 0) lines.write(decoder.write(buffer.subarray(0, read)))
      else {
        lines.write(decoder.end())
        lines.end()
      }
      const walk = decided()
      if (walk && walk.bold && walk.heading) return true
      if (read <= 0) break
    }
    const walk = decided() ?? walks.plain
    return walk.bold && walk.heading
  } finally { closeSync(fd) }
}

function stepWalk(walk, line, frontmatter) {
  if (frontmatter) { walk.bold ||= BOLD_STATUS.test(line); walk.heading ||= RECORD_SECTION.test(line); return }
  const [fenced, next] = fenceStep(line, walk.fence)
  walk.fence = next
  if (fenced) return
  walk.bold ||= BOLD_STATUS.test(line)
  walk.heading ||= RECORD_SECTION.test(line)
}

// The discovery set (ADR-092 Decision 5): every eligible listed path that is named like a record
// (`ADR_FILE`, or a name arm at any width), sits under a record directory as listed or where its directory
// really is (Decision 14), or passes the content screen. Returned in listing order, with the paths found
// by NAME (the only ones `notRecognised` may name), the screen candidates whose read failed, and the
// first path the screen budget left unscreened.
function recordFilesFromListing(root, tracked, { screenBudget = SCREEN_BUDGET, platform = process.platform } = {}) {
  const files = []
  const byName = new Set()
  const failed = []
  const placedDirectory = new Map()
  let realRoot = null
  try { realRoot = realpathSync.native(root) } catch { /* the listed spelling alone decides place */ }
  // Whether a listed directory is a record directory where it really is. Its real path is taken once.
  const placedUnderRecordDirectory = directory => {
    if (!placedDirectory.has(directory)) {
      let answer = false
      try {
        const placed = realRoot === null ? null : inside(realRoot, realpathSync.native(listedAbsolute(root, directory)))
        answer = placed !== null && placed.split(separatorsOf(process.platform)).some(part => RECORD_DIRECTORY.test(part))
      } catch { /* a directory whose real path cannot be taken is read as listed */ }
      placedDirectory.set(directory, answer)
    }
    return placedDirectory.get(directory)
  }
  // A listed link to a file: its directory as listed may be anywhere, so its own real path is asked.
  const placedFileUnderRecordDirectory = absolute => {
    try {
      if (!lstatSync(absolute).isSymbolicLink() || realRoot === null) return false
      const placed = inside(realRoot, realpathSync.native(absolute))
      return placed !== null && directoriesOf(placed).some(part => RECORD_DIRECTORY.test(part))
    } catch { return false }
  }
  // The screen's budget, spent by the bytes it reads (finding 12), not by the sizes it was told.
  const budget = { left: screenBudget }
  let screened = 0
  let unscreened = null
  for (const rel of tracked) {
    // A backslash in a listed name separates only where the platform is Windows: on POSIX git lists a
    // root-level file named `docs\adr\001-x.md` as that one name, and rewriting it to `docs/adr/001-x.md`
    // made it a record directory's file that was then absent, PARTIAL, where record.py reads one root-level
    // file that is no record (a gpt-6.1-sol review of ADR-092's execution, finding 4, on the reader path).
    const norm = listedPath(rel, platform)
    if (!corpusEligible(norm)) continue
    const slash = norm.lastIndexOf('/')
    const base = slash < 0 ? norm : norm.slice(slash + 1)
    const dirNorm = slash < 0 ? '' : norm.slice(0, slash)
    // The record budget is charged where a file is recognised, in adrCorpus's read: charged here, to every
    // path discovered, two hundred ordinary notes listed before one record in `docs/adr` spent it, and the
    // look said "200 records were read" over none (a gpt-6.1-sol review of ADR-092's execution, finding 16,
    // a regression against v3.8.10, which read that corpus as one record and look ok).
    const absolute = path.join(root, ...norm.split('/').filter(part => part && part !== '.'))
    if (ADR_FILE.test(base) || CANONICAL_NAME.test(base) || SPEC_NAME.test(base)) {
      files.push(absolute)
      byName.add(absolute)
      continue
    }
    if ((dirNorm && dirNorm.split('/').some(part => RECORD_DIRECTORY.test(part)))
      || (dirNorm && placedUnderRecordDirectory(dirNorm)) || placedFileUnderRecordDirectory(absolute)) {
      files.push(absolute)
      continue
    }
    if (unscreened !== null) continue
    // A path only the screen could admit: a read that failed is named, except its absence, which is an
    // observation that it carries nothing (ADR-092 Decision 9).
    try {
      const stat = statSync(absolute)
      if (!stat.isFile()) { failed.push({ file: absolute, reason: 'not a regular file, so the content screen could not read it' }); continue }
    } catch (error) {
      if (error?.code !== 'ENOENT') failed.push({ file: absolute, reason: error?.code ?? 'unreadable' })
      continue
    }
    // No size asked first: the screen's budget is spent by the bytes it reads, so a size is never a
    // second, weaker budget beside it (finding 12).
    try {
      const admitted = screenAdmits(absolute, budget)
      if (admitted === null) { unscreened = absolute; continue }
      screened += 1
      if (admitted) files.push(absolute)
    } catch (error) {
      if (error?.code !== 'ENOENT') failed.push({ file: absolute, reason: error?.code ?? 'unreadable' })
    }
  }
  return { files, byName, failed, unscreened, streamed: screenBudget - budget.left, screened }
}

// Room for a whole listing. Node's default 1 MiB cut `git ls-files -z` on a 27,289-file repository
// (2.3 MB) with ENOBUFS, and every reader said "git could not list the tree" over a listing git produced
// (a Windows corpus-chaos run of v3.8.9, php-dated-adr). Every git call whose output grows with the tree
// takes it: the listing, the deleted-file diff, `gitLines` and the harness status read.
export const GIT_LISTING_BUFFER = 256 * 1024 * 1024

/**
 * Repository-relative paths git knows about, or null when git cannot answer.
 *
 * null and an EMPTY ARRAY are different answers and must never collapse. An
 * empty listing says "this tree holds no files"; null says "I could not look",
 * and a declaration checked against a null read as empty would report every
 * record in the corpus as rot at once — a tool asserting an observation it
 * never made (ADR-005).
 *
 * `--others --exclude-standard` because a record and the files it governs are
 * commonly added in the same commit, and against git rather than the filesystem
 * because `existsSync` answers "is this on THIS machine" (ADR-008).
 */
export function trackedPaths(root) {
  const found = new Set()
  // ⚠ `-z`, and no trim. Without it git C-quotes any name holding a control
  // character, `"` or `\` — core.quotePath=false does not stop that — so such a
  // record, task or spec came back as `"tab\there.md"`, matched nothing, and was
  // dropped by every reader at once, named nowhere (a chaos round, 2026-09-25).
  // `.trim()` would also have eaten a name's own edge spaces. adr-lint's
  // tracked_paths already used `-z`; this copy did not.
  for (const args of [['ls-files', '-z'], ['ls-files', '--others', '--exclude-standard', '-z']]) {
    const run = spawnSync('git', ['-C', root, '-c', 'core.quotePath=false', ...args],
      { encoding: 'utf8', timeout: 30000, maxBuffer: GIT_LISTING_BUFFER, windowsHide: true })
    if (run.error || run.status !== 0 || typeof run.stdout !== 'string') return null
    for (const value of run.stdout.split('\0')) {
      if (value) found.add(value)
    }
  }
  return [...found]
}

/**
 * Every decision record in a repository, with what it governs already resolved.
 *
 * Asks git which paths it tracks, then inventories record files from that
 * listing. `tracked` is an injectable seam: pass a listing to make the look
 * hermetic. null means the look could not happen — no disk walk, no Governs
 * resolution (ADR-005). An empty array means the tree was listed and held
 * no files. Nothing here writes, and nothing here runs a check.
 */
export function adrCorpus(root, { tracked = trackedPaths(root), screenBudget = SCREEN_BUDGET, platform = process.platform } = {}) {
  const archiveEffects = new Map()
  const records = []
  const unreadable = []
  Object.defineProperty(records, 'unreadable', { value: unreadable, enumerable: false })
  // Files listed by NAME that adr-lint does not recognise as records: counted by nobody, named by
  // work-next's notRead (the owner, 2026-10-07). One found by place or by the screen and not recognised
  // was never claimed, and no reader names it (ADR-092 Decision 5).
  const notRecognised = []
  Object.defineProperty(records, 'notRecognised', { value: notRecognised, enumerable: false })
  Object.defineProperty(records, 'look', {
    value: tracked == null ? 'UNPROVEN' : 'ok', enumerable: false, writable: true,
  })
  if (tracked == null) return records
  const reader = corpusReader()
  const listedFiles = new Set(tracked.map(rel => listedAbsolute(root, rel)))
  const discovered = recordFilesFromListing(root, tracked, { screenBudget, platform })
  const { files, byName } = discovered
  // What discovery cost: files found, and how many the content screen opened and how many bytes it
  // streamed (ADR-092 T3 measures it; a reader that wants to know why a session start was slow asks it).
  Object.defineProperty(records, 'discovery', {
    value: { discovered: files.length, screened: discovered.screened, streamed: discovered.streamed }, enumerable: false,
  })
  // A path only the content screen could admit, whose read failed: named, never dropped (ADR-092
  // Decision 5); one absent from the working tree was observed to carry nothing and is in no list.
  for (const { file, reason } of discovered.failed) {
    unreadable.push({ file, status: null, taskFiles: [], reason })
    records.look = 'PARTIAL'
  }
  if (discovered.unscreened) {
    unreadable.push({ file: discovered.unscreened, status: null, taskFiles: [],
      reason: `content screen budget: ${screenBudget} bytes were streamed; this file and every later one only the screen could admit were not examined` })
    records.look = 'PARTIAL'
  }
  // ⚠ One file, however many paths reach it: `onceByRealPath` says why. A link copy is named,
  // unread, and marked `alias` so no counter takes it for a record with an unread status. A spelling a
  // name arm recognises is kept first, since only its name made the file a record (ADR-092 Decision 7).
  const once = onceByRealPath(files, nameArmSpelling)
  for (const { file, sameAs } of once.aliases) {
    unreadable.push({ file, status: null, taskFiles: [], alias: true, sameAs, reason: aliasReason(root, sameAs) })
    records.look = 'PARTIAL'
  }
  files.length = 0
  files.push(...once.kept)
  const recordsPerDirectory = new Map()
  for (const file of files) {
    const directory = path.dirname(file)
    recordsPerDirectory.set(directory, (recordsPerDirectory.get(directory) ?? 0) + 1)
  }
  // ⚠ The budget STOPS the look; it must not end it silently. A `break` read the first 200 and said
  // `look ok` over 10,000 (a Windows chaos round of 916b515, C-1): the first file left unexamined is
  // named, and the look is PARTIAL. It counts RECORDS (and files claimed by name or place whose read
  // failed), never a file read and not recognised (finding 16).
  let charged = 0
  for (const file of files) {
    if (charged >= RECORD_BUDGET) {
      unreadable.push({ file, status: null, taskFiles: [],
        reason: `record budget: ${RECORD_BUDGET} records were read; this file and every later one in the listing were not examined` })
      records.look = 'PARTIAL'
      break
    }
    let text
    try {
      // `reason` marks a file this reader NEVER READ, so a consumer can keep it
      // apart from the entries below, which were read and carry a status this
      // reader cannot apply. Without it adr-state said the file "was opened"
      // and had "[no **Status:** line]" — an observation it never made (ADR-005).
      // Bounded by the bytes read, not a size asked first (finding 12).
      text = readRegularText(file, 512 * 1024).replace(/\r(?!\n)/g, '\n')
    } catch (error) {
      charged += 1
      if (error?.code === 'EFBIG') {
        unreadable.push({ file, status: null, taskFiles: taskFilesFor(file, '', reader), reason: 'over 512 KiB' })
        records.look = 'PARTIAL'
        continue
      }
      // Its tasks are still its own, attributed by directory: a readable task under an unreadable
      // record was in no list at all (BACKLOG §350 C5).
      unreadable.push({ file, status: null, taskFiles: taskFilesFor(file, '', reader), reason: error?.code ?? 'unreadable' })
      records.look = 'PARTIAL'
      continue
    }
    // ⚠ A NUL BYTE IS NOT TEXT. Its Status was read as one this reader does not know, so the
    // record was counted "undecided" with look ok, byte-identical to an honest Proposed (a
    // corpus-chaos run of e016066, js-spa-client B5; BACKLOG §319). adr-lint already said it
    // could not read the same file.
    if (text.includes('\u0000')) {
      charged += 1
      unreadable.push({ file, status: null, taskFiles: taskFilesFor(file, '', reader), reason: 'it holds a NUL byte, so it is not text this reader can read' })
      records.look = 'PARTIAL'
      continue
    }
    // A file adr-lint does not recognise is a record to no reader (the owner, 2026-10-07): not counted,
    // and not undecided either, since undecided is a RECORD whose status no reader acts on. work-next
    // names it as not read. Its text was read, so this is an observation. Before the catalog is asked:
    // a frozen archive's row does not make a record of a file adr-lint rejects (a gpt-6.1-sol delta
    // review, 2026-10-07, finding 1), and a file that is not a record makes no look PARTIAL.
    if (!recognisedAsRecord(root, file, text).recognised) { if (byName.has(file)) notRecognised.push(file); continue }
    charged += 1
    // A frozen record's effect comes from its archive's catalog; `governing` there
    // leaves the file's own status standing. A catalog that cannot say is PARTIAL,
    // and the record then governs nothing here rather than whatever it last said.
    const archived = archiveDecisionEffect(file, reader, archiveEffects, listedFiles, root)
    if (archived?.unproven) records.look = 'PARTIAL'
    const effect = archived?.effect
    const retired = typeof effect === 'string' && /^(?:withdrawn|superseded\b)/i.test(effect)
    const status = archived?.unproven ? `frozen, effect UNPROVEN — ${archived.unproven}` : retired ? effect : recordStatus(text)
    const kind = statusKind(status)
    if (!kind) {
      // A file that looks like a record and carries no status this reader knows
      // is DROPPED, and until 2026-08-27 dropped in silence. Measured against a
      // real 171-record corpus that day: 149 were read and `adr-state` said
      // "149 record(s) read" — never that 22 files it had opened were skipped,
      // 25 of them carrying no `**Status:**` line at all and 12 carrying one it
      // does not recognise, `Implemented` among them. A count that omits what it
      // could not read is a count that reads as coverage.
      // Its TASK FILES are attributed anyway, by the same rule the governing
      // records use. A Proposed or Draft record governs nothing yet — correctly —
      // but its tasks still exist, and a consumer that cannot see whose they are
      // has only two options, both wrong: treat them as executable (§48, where
      // the router offered an unaccepted record's tasks) or ignore them and
      // report a corpus with unfinished work as finished.
      // A frozen record whose effect could not be established still says what it
      // would govern; `decisionsGoverning` needs that to name it where it matters.
      // The SAME two sources a governing record's paths come from — its `Governs:`
      // header and its tasks' Affected Files — because a record with task tables
      // and no header matched nothing and was dropped in silence (seventh review).
      // Every task file in its directories counts here, not only the attributed
      // ones: naming an uncertain record once too often is the direction to err in.
      const recordTasks = taskFilesFor(file, text, reader)
      const wouldGovern = () => [...new Set([...declaredGoverns(text).paths,
        ...recordTasks.flatMap(task => { try { return affectedFiles(reader.text(task)) } catch { return [] } })])]
      unreadable.push({ file, status: status || null, taskFiles: recordTasks,
        // Its identity, so one id claimed by an undecided record and a counted one is named (an outside
        // probe run, 2026-10-07: `# ADR 006` with a Status no reader acts on beside ADR-006).
        id: recordId(path.basename(file), titleLine(text)),
        ...(archived?.unproven ? { unproven: archived.unproven, governs: wouldGovern(),
          title: (text.match(/^#\s+(.+)$/m)?.[1] ?? path.basename(file, '.md')).trim() } : {}) })
      continue
    }
    const declared = declaredGoverns(text)
    // Two different claims, deliberately kept apart. `declares` is a record
    // saying "I am authoritative over this"; `touches` is a task table saying
    // "this change edited that file". Conflating them made every file five
    // accepted ADRs had edited over two years look like five decisions
    // contradicting each other — 278 of them on a real corpus, every one noise.
    // Authority contests; history does not.
    const declares = new Set(declared.paths)
    const governs = new Set(declared.paths)
    // Sibling task files carry the per-task Affected Files tables. Attribution
    // matters: several ADRs commonly share one `tasks/` directory, and taking
    // every table would make each record claim its neighbours' files. A task
    // names its ADR in its title (`# Task ADR-001-T1: …`); where no task does,
    // the directory is attributed only if this is the one record beside it.
    const number = adrNumber(file, text)
    const id = recordId(path.basename(file), titleLine(text))
    // The task files attributed to this record, PATHS included. The paths are
    // what lets a caller ask "whose task is this?" — `work-next` needs it to stop
    // calling an unaccepted record's tasks ready (docs/BACKLOG.md §48), and
    // deriving it a second time at the caller would be a second attribution rule
    // to keep in step with this one.
    const owned = []
    const texts = []
    const unreadTasks = []
    for (const tasks of taskDirectoriesFor(file, number, reader)) {
      let taskEntries = []
      try {
        taskEntries = reader.entries(tasks.path).map(entry => entry.name).filter(name => name.toLowerCase().endsWith('.md')
          && name.toLowerCase() !== 'readme.md')
      } catch { continue }
      for (const name of taskEntries) {
        const taskPath = path.join(tasks.path, name)
        let taskText
        try { taskText = reader.text(taskPath) } catch {
          // Unread is not absent. A task file that could not be opened was dropped
          // here, so its directory was never asked about and its record read as
          // governing nothing (a Windows chaos round of 916b515, C-5). A directory
          // named for this record attributes it without its text; its scope is unknown.
          unreadTasks.push(taskPath)
          if (tasks.owned) owned.push(taskPath)
          continue
        }
        // A directory NAMED for this record is attribution in itself.
        if (tasks.owned) {
          owned.push(taskPath)
          for (const declaredPath of affectedFiles(taskText)) governs.add(declaredPath)
        } else {
          texts.push({ path: taskPath, text: taskText })
        }
      }
    }
    const claimed = number
      ? texts.filter(entry => new RegExp(`ADR[-_ ]?0*${number}\\b`, 'i').test(entry.text))
      : id ? texts.filter(entry => referencesIn(entry.text).includes(id)) : []
    // Only when this is the one record beside them: a shared tasks/ directory
    // whose files name no ADR cannot be attributed, and guessing would make
    // every record claim its neighbours' files.
    const sole = recordsPerDirectory.get(path.dirname(file)) === 1
    for (const entry of (claimed.length ? claimed : (sole ? texts : []))) {
      owned.push(entry.path)
      for (const declaredPath of affectedFiles(entry.text)) governs.add(declaredPath)
    }
    // An unread file in a shared tasks/ belongs to nobody: its text is what would have
    // said whose it is, and a sole record beside it is no evidence (Codex round 2, F5:
    // T2 naming ADR-002 became ADR-001's once it could not be read). It stays in
    // unreadTasks, which is how readiness still asks about its directory (F6).
    records.push({
      file,
      number,
      // ADR-063: `ADR-NNN`, or a dated record's stem; null for neither.
      id,
      title: (text.match(/^#\s+(.+)$/m)?.[1] ?? path.basename(file, '.md')).trim(),
      status,
      kind,
      // Under a frozen archive, whatever its directory is called: the catalog
      // said so. `work-next` reads this to stop offering a retired record for
      // retirement; a path test (`/archive/`, then `isArchivePath`) got it wrong
      // both ways — missed `adr-archive`, then matched `archive-policy.md` and
      // `archive-service/` (Codex review of 870a230, P2).
      frozen: archived != null,
      // Which record replaced this one, when the status says so, as an id: a
      // corpus spells the reference every way there is — `Superseded by ADR-0004`,
      // `superseded by ADR-4`, `Superseded by 0004`, and since ADR-063 a dated
      // record's stem or path, which was read as record 2026.
      // ADR-087 T3: a graveyard record whose Status names nothing takes its replacement from
      // its frontmatter `superseded_by` (public/swift-adrs, public/active-status-adr). Its kind
      // still comes from its own Status alone, so the key never moves a governing record.
      // `superseded by` with no record after it names nothing too, so the key is asked then as well
      // (Decision 4; a gpt-6.1-sol review of ADR-087, finding 5).
      supersededBy: (/^superseded\s+by\b/i.test(status)
        ? supersessionTarget(retired ? status : rawStatus(text), status) : null)
        ?? (kind === 'graveyard' && !retired ? frontmatterSupersededBy(text) : null),
      governs: [...governs],
      // What FAILS when this decision is violated, or null. `Governs:` on its
      // own tells an agent a rule exists and nothing about what happens if it
      // breaks it — ADR-009. Read here rather than at each caller so the hook
      // and the CLI cannot disagree about what a header means, which is the
      // drift ADR-001 and ADR-004 were both about.
      enforcedBy: declaredEnforcement(text),
      // The task files this record owns, by the same attribution the governed
      // paths use. A consumer that walks the filesystem for task files instead
      // gets the files right and the RECORD wrong — §48, where the router named
      // a Proposed record's tasks as ready to execute.
      taskFiles: [...new Set(owned)],
      // Task files beside it that could not be opened: what it governs is not known.
      unreadTasks,
      declares: [...declares],
      // Two sources, one slot, told apart by the prefix. A `type: package`
      // matcher was never resolvable here; a `governs:` entry WAS resolvable and
      // resolved to nothing, which is the rot ADR-011 is about. With no listing
      // this stays empty — the reader could not look, and saying nothing is the
      // only honest answer (ADR-005).
      unresolved: [
        ...declared.unresolved,
        ...(tracked
          ? declared.paths
            .filter(declaration => !tracked.some(file => pathMatchesDeclaration(file, declaration)))
            .map(declaration => `governs:${declaration}`)
          : []),
      ],
    })
  }
  // Named by what this reader counted or held undecided, and by task files, never by a name alone
  // (ADR-092 Decision 11): after the read, since only the read knows what is a record.
  const recognisedFiles = new Set([...records.map(record => record.file),
    ...unreadable.filter(entry => !entry.reason && !entry.alias).map(entry => entry.file)])
  Object.defineProperty(records, 'unmarkedArchives', { value: unmarkedArchives(root, tracked, recognisedFiles), enumerable: false })
  return records
}

// ADR-087 T3: the record a frontmatter `superseded_by:` names, read by `supersessionTarget` as if
// the Status had said `superseded by <value>`, or null. One line, as every measured corpus writes
// it: quotes, a trailing ` #` comment and a `.md` suffix removed, and a one-item inline list
// `[x]` read as `x`. `null`, `~`, `[]`, an empty value and a list of more than one name nothing.
// `supersedes:` is never read: in active-status-adr most of the records it names still govern (F-6).
const SUPERSEDED_BY_KEY = /^superseded_by[ \t]*:[ \t]*([^\r\n]*)$/

function frontmatterSupersededBy(text) {
  const block = frontmatterBlock(text)
  if (!block) return null
  for (const line of String(text).split(/\r\n|\r|\n/).slice(block[0] + 1, block[1])) {
    const found = line.match(SUPERSEDED_BY_KEY)
    if (!found) continue
    let value = frontmatterValue(found[1])
    const single = value.match(/^\[([^\],]*)\]$/)
    if (single) value = frontmatterValue(single[1])
    value = value.replace(/\.md$/i, '')
    if (!value || value === 'null' || value === '~' || value.startsWith('[')) return null
    return supersessionTarget(`superseded by ${value}`)
  }
  return null
}

// The record a `superseded by …` status names: the first reference in it, by the
// ADR-063 rule, or a bare number (`Superseded by 0004`) that is not a date.
// The index in `raw` of the character at `index` once `raw`'s underscores are removed.
function rawIndex(raw, index) {
  let seen = 0
  for (let at = 0; at < raw.length; at += 1) {
    if (raw[at] === '_') continue
    if (seen === index) return at
    seen += 1
  }
  return raw.length
}

// `status` is the line as written (underscores kept, for record names); `classified`
// is the same line with every underscore stripped, as `recordStatus` returns it.
function supersessionTarget(status, classified = status) {
  // `_Superseded_ by x` from a raw status line: emphasis around the words is not a name.
  const rest = status.replace(/^[_\s]*superseded_*\s+by_*\s*/i, '')
  // ⚠ A NUMBER IS READ FROM THE CLASSIFIED LINE, as it was before ADR-063, so emphasis
  // does not hide it: `_Superseded by ADR-004_` and `Superseded by _ADR-999_` name
  // records 4 and 999 (Codex, 2026-09-22, round 6). A dated stem is read from the
  // raw line, where its underscores survive.
  const plain = classified.replace(/^superseded\s+by\s*/i, '')
  // Numbered, in every spelling a status line uses: `ADR-004`, `ADR 004`,
  // `ADR_004`, `ADR004`. This read them all before ADR-063, and the hyphenated
  // reference rule alone dropped three (Codex, 2026-09-22). Not when the number is
  // the start of a date, `ADR 2026-07-15`.
  // A whole identifier: `ADR-004oops` is not record 4 (Codex, 2026-09-22, round 2).
  const loose = /(?<![A-Za-z0-9_])ADR[-_ ]?(\d{1,4})(?![0-9A-Za-z_])/i.exec(plain)
  const numbered = loose && !DATE_SHAPED_RE.test(plain.slice(loose.index + loose[0].length - loose[1].length))
    ? { at: rawIndex(rest, loose.index), id: numberId(loose[1]) } : null
  const dated = referencesWithProvenance(rest)
    .find(entry => !entry.id.startsWith('ADR-') && (entry.explicit || !BARE_DATE_RE.test(entry.id))) ?? null
  // `Superseded by 0004` names record 4 by a bare number at the very start.
  const bareMatch = /^0*(\d{1,4})(?![0-9A-Za-z_])/.exec(plain)
  const bare = bareMatch && !DATE_SHAPED_RE.test(plain) ? { at: 0, id: numberId(bareMatch[1]) } : null
  // The FIRST record named, never whichever one exists: `ADR-999 (see ADR-002)`,
  // and `999 (see ADR-002)` (Codex, 2026-09-22, round 3).
  const first = [bare, numbered, dated].filter(Boolean).sort((a, b) => a.at - b.at)[0]
  return first ? first.id : null
}

// `/tmp` is a symlink to `/private/tmp` on macOS, and git answers with the real
// path while the hook payload carries the spelling. A plain path.relative then
// produced `../../tmp/...`, which escapes the root and filtered every path out —
// so on a symlinked checkout the corpus read as empty, silently. The same trap
// underTempRoot already realpaths both sides for.
function relativeWithinRoot(root, candidate) {
  // Same `inside` as underDirectory (BACKLOG §188). `!startsWith('..')` is not
  // enough: when git's spelling and Node's disagree, path.relative is an
  // absolute path, which then survives the posix replace as `C:/…` and is
  // kept as if it were in-repo (Windows CI: empty decision context).
  const posix = value => value.replace(/\\/g, '/')
  const inside = value => value === '' || (!value.startsWith('..') && !path.isAbsolute(value)
    && !/^[A-Za-z]:/.test(posix(value)))
  const fold = value => (process.platform === 'win32' || process.platform === 'darwin')
    ? value.toLowerCase() : value
  const real = target => {
    if (existsSync(target)) return fold(canonical(target))
    const anchor = nearestExistingDirectory(target)
    try { return fold(anchor ? path.join(canonical(anchor), path.relative(anchor, target)) : target) }
    catch { return fold(target) }
  }
  const attempts = [path.relative(root, candidate), path.relative(real(root), real(candidate))]
  const hit = attempts.find(inside)
  if (hit !== undefined) return hit
  const rp = posix(real(root)).replace(/\/$/, '')
  const cp = posix(real(candidate))
  if (rp && cp.startsWith(rp + '/')) return cp.slice(rp.length + 1)
  if (cp === rp) return ''
  return attempts[attempts.length - 1]
}

/**
 * The decisions that govern a set of paths, and the ones that were killed.
 *
 * The graveyard is the half an agent needs most: re-proposing an approach the
 * team already rejected is the expensive failure of working without memory, and
 * it is invisible from the code alone.
 */
export function decisionsGoverning(paths, root, corpus = adrCorpus(root)) {
  const relative = paths
    .map(candidate => (path.isAbsolute(candidate) ? relativeWithinRoot(root, candidate) : candidate))
    .map(candidate => candidate?.replace(/\\/g, '/'))
    .filter(candidate => candidate && !candidate.startsWith('..') && !path.isAbsolute(candidate)
      && !/^[A-Za-z]:/.test(candidate))
  const hits = record => relative.some(candidate =>
    record.governs.some(declaration => pathMatchesDeclaration(candidate, declaration)))
  return {
    governing: corpus.filter(record => record.kind === 'governing' && hits(record)),
    graveyard: corpus.filter(record => record.kind === 'graveyard' && hits(record)),
    // Records that DECLARE these paths and whose standing could not be established.
    unproven: (corpus.unreadable ?? []).filter(record => typeof record.unproven === 'string' && Array.isArray(record.governs) && hits(record)),
    look: corpus.look ?? 'ok',
  }
}

/** The same answer as prose, or '' when the corpus has nothing to say. */
export function decisionContext(paths, root) {
  const { governing, graveyard, unproven } = decisionsGoverning(paths, root)
  if (!governing.length && !graveyard.length && !unproven.length) return ''
  const lines = []
  const name = record => `${path.relative(root, record.file) || record.file} — ${record.title}`
  // The hook and `adr-context` render the SAME answer from the same resolver.
  // Two callers of one resolver is where this project has drifted before
  // (ADR-001, ADR-004), so the enforcing check appears in both or neither.
  const caught = record => (record.enforcedBy?.length
    ? `  [caught by: ${record.enforcedBy.join(', ')}]`
    : '')
  if (governing.length) {
    lines.push('Decisions that govern what you are about to change:')
    for (const record of governing.slice(0, 5)) lines.push(`  ${name(record)}${caught(record)}`)
    if (governing.length > 5) lines.push(`  (+${governing.length - 5} more)`)
  }
  if (graveyard.length) {
    lines.push('Already decided against here — do not re-propose without saying why it is different now:')
    for (const record of graveyard.slice(0, 5)) {
      lines.push(`  ${name(record)} [${record.status}]`)
    }
    if (graveyard.length > 5) lines.push(`  (+${graveyard.length - 5} more)`)
  }
  // ⚠ "NOTHING GOVERNS THIS" AND "COULD NOT TELL WHAT GOVERNS THIS" ARE NOT ONE
  // SILENCE. A frozen record whose catalog cannot establish its effect left both
  // lists empty, and this returned '' — so the edit hook said nothing about a file a
  // record DECLARES, where one commit earlier it had named a withdrawn decision
  // (sixth review; ADR-005).
  if (unproven.length) {
    lines.push('UNPROVEN — these records declare what you are about to change, and whether they still govern could not be established:')
    for (const record of unproven.slice(0, 5)) lines.push(`  ${name(record)} [${record.unproven}]`)
    if (unproven.length > 5) lines.push(`  (+${unproven.length - 5} more)`)
  }
  const unresolved = [...new Set([...governing, ...graveyard].flatMap(record => record.unresolved))]
  if (unresolved.length) {
    lines.push(`Recorded but not resolved by this tool: ${unresolved.slice(0, 4).join(', ')}. `
      + 'Only `type: path` matchers are matched against files; read those records yourself.')
  }
  return lines.join('\n')
}
