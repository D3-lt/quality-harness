#!/usr/bin/env node
// standalone-link.mjs — make the standalone install unable to drift.
//
// `sync-standalone.mjs` copies this plugin's files over the compatibility
// entrypoints under the user's home. That works and it re-breaks on the next
// release: on 2026-08-26 twenty-nine files had drifted, the standalone gates
// were four days behind the plugin, and the owner read the drift notice and
// reasonably concluded the PLUGIN was stale. A sync you must remember is a
// sync that reports drift forever.
//
// So stop copying.
//
//   * A GATE becomes a forwarder that resolves the newest installed plugin at
//     call time and executes it. It has no version in it, so it never goes
//     stale and no release has to touch it. This is the half that matters:
//     a stale gate produces a WRONG VERDICT, and a verdict is the one thing
//     this project asks anyone to trust.
//   * A SKILL or TEMPLATE becomes a symlink, because Claude Code reads their
//     contents rather than executing them. A link still names one version, so
//     it is re-pointed by a later `--apply` — but a pointer is either right or
//     wrong, where eleven copies can be half-right and look fine.
//
// Windows needs no privilege for either. A `.cmd` forwarder is an ordinary
// file that PATHEXT resolves from the bare name, and a directory JUNCTION is
// available to an unprivileged user where a symlink is not.
//
// This writes outside any repository. Nothing here runs from a hook, no gate
// calls it, and it reports unless asked to write.
import { createHash } from 'node:crypto'
import {
  cpSync, lstatSync, mkdirSync, readFileSync, readdirSync, readlinkSync, rmSync,
  symlinkSync, writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// The cache directory is built from the home directory rather than written
// down, exactly as the drift notice does. A plugin that hardcodes a path under
// someone's home is a plugin that depends on one.
export function cacheDirectory(homeDirectory = os.homedir()) {
  return path.join(homeDirectory, '.claude', 'plugins', 'cache', 'quality-harness',
    'quality-harness')
}

/**
 * The resolver a forwarder embeds: the INSTALLED version, falling back to the
 * newest semver directory in the cache that still has a `bin`. Printed as an
 * absolute path, empty when there is none.
 *
 * ASKS WHAT IS INSTALLED FIRST, and the fallback is why that is not enough on its
 * own. The cache is a directory nothing prunes — this machine's holds forty-one
 * versions back to 2.0.0 — so a leftover or half-removed directory with a higher
 * number used to win over the installed one silently, and the gate would run a
 * version nobody chose. Reported 2026-08-29 (docs/BACKLOG.md §50).
 *
 * The scan REMAINS the fallback rather than being replaced: the manifest is not
 * ours, its shape can change under us, and a parse failure must degrade to the
 * old answer rather than to none. `try/catch` around the read is that promise.
 *
 * Deliberately not `sort -V` or a shell glob. macOS ships BSD sort, whose `-V`
 * cannot be relied on, and lexical order puts 2.0.4 above 2.0.10 — this cache
 * holds both. The comparison is numeric per component or it is wrong.
 *
 * No single quote may appear here: the sh forwarder embeds this inside `node -e
 * '...'`, and one would end the string in a file nothing type-checks.
 */
export const RESOLVER = [
  'const f=require("fs"),p=require("path"),c=process.argv[1];',
  'const has=d=>!!d&&f.existsSync(p.join(d,"bin"));',
  'const num=s=>/^(\\d+)\\.(\\d+)\\.(\\d+)$/.exec(String(s))||[0,0,0,0];',
  'let root="";',
  'try{',
  'const man=JSON.parse(f.readFileSync(p.join(c,"..","..","..","installed_plugins.json"),"utf8"));',
  'const e=(man&&man.plugins&&man.plugins["quality-harness@quality-harness"])||[];',
  'const ok=(Array.isArray(e)?e:[e]).filter(x=>x&&has(x.installPath));',
  'ok.sort((a,b)=>{const A=num(a.version),B=num(b.version);return B[1]-A[1]||B[2]-A[2]||B[3]-A[3]});',
  'if(ok.length)root=ok[0].installPath;',
  '}catch{}',
  'let v=[];try{v=f.readdirSync(c)}catch{};',
  'v=v.map(n=>({n,m:/^(\\d+)\\.(\\d+)\\.(\\d+)$/.exec(n)}))',
  '.filter(x=>x.m&&f.existsSync(p.join(c,x.n,"bin")));',
  'v.sort((a,b)=>b.m[1]-a.m[1]||b.m[2]-a.m[2]||b.m[3]-a.m[3]);',
  'process.stdout.write(root||(v.length?p.join(c,v[0].n):""))',
].join('')

/** Marks a file this tool generated, so a later run may replace its own work. */
export const FORWARDER_MARK = 'quality-harness-forwarder'

/**
 * Whether `directory` is on `pathValue`, compared the way the platform compares paths.
 *
 * A forwarder written into a directory nothing searches resolves NOTHING, and this
 * tool has always written one and then described what it would do — never checked
 * that anything could reach it. It installs no PATH entry either: the directory's
 * reachability has been somebody else's shell profile all along.
 *
 * Reported 2026-08-29 from another machine, measured rather than guessed: there,
 * the standalone bin directory was put on PATH only by `.zshrc`, which zsh reads
 * for INTERACTIVE shells. So the forwarder reached a human at a terminal and was
 * structurally absent from the two contexts where staleness is silent — an
 * agent's tool shell and a CI step, both non-interactive by construction. That
 * session's sweep ran a gate two releases old and could not have run anything
 * else. `.zshenv` is the file a non-interactive shell reads; `.zshrc` cannot
 * work for this.
 *
 * `platform` and `pathValue` are parameters because the answer differs by both and
 * a branch with no seam is a branch with no test (CLAUDE.md §7): Windows splits on
 * `;` and compares case-insensitively, POSIX splits on `:` and does not.
 */
export function onSearchPath(directory, pathValue, platform = process.platform) {
  return searchPathIndex(directory, pathValue, platform) >= 0
}

/**
 * Where `directory` sits on `pathValue`, or -1 when nothing searches it.
 *
 * PRESENCE IS NOT PRECEDENCE. `onSearchPath` answers "could a bare name reach
 * this", which is the question a freshly written forwarder asks. "Which copy
 * ANSWERS a bare name" is a different question, and answering it with presence
 * is how the drift notice came to assert that a home directory always wins:
 * reported 2026-09-01 from a Windows machine where the home `.claude/bin` was on no
 * PATH at all and the plugin cache was, so both halves of the claim were
 * inverted and the advice built on them pointed at the wrong file.
 */
export function searchPathIndex(directory, pathValue, platform = process.platform) {
  const windows = platform === 'win32'
  const parts = String(pathValue ?? '').split(windows ? ';' : ':').filter(Boolean)
  const want = normalisePathEntry(directory, windows)
  return parts.findIndex(entry => normalisePathEntry(entry, windows) === want)
}

// Normalised by the TARGET platform's rules, not the host's. `path.normalize` is
// the host's — on macOS it leaves `C:/x` alone, so `C:/x` and `C:\\x` compared
// unequal however `platform` was set, and the seam that exists to make Windows
// reachable from a laptop quietly answered with POSIX rules. Caught 2026-09-01 by
// the first test that passed 'win32' from macOS; production was unaffected,
// because on a real Windows box the host's rules ARE the target's — which is
// exactly why nothing had contradicted it.
const normalisePathEntry = (value, windows) => {
  const rules = windows ? path.win32 : path.posix
  const trimmed = rules.normalize(value).replace(/[\\/]+$/, '')
  return windows ? trimmed.toLowerCase() : trimmed
}

/**
 * Which copy of the gates a BARE name reaches, measured against a real PATH.
 *
 * `known: false` is a first-class answer and the reason this returns an object
 * rather than a boolean. An absent `PATH` is "I could not look", never "the
 * directory is absent" — CLAUDE.md §3: a filter that matched nothing must not
 * borrow the vocabulary of a verdict. Every caller has to render that case as
 * unknown, so it is not possible to reach one by accident.
 *
 * `pathValue` takes NO DEFAULT, deliberately. A default parameter cannot express
 * an absent PATH — passing `undefined` is exactly what selects the default — so a
 * defaulted seam reports the machine's real PATH in the one case the caller meant
 * to say it had none. Caught here 2026-09-01 while writing the test for it.
 */
export function barePathWinner(homeDirectory, pathValue, platform = process.platform) {
  if (pathValue === undefined || pathValue === null) return { known: false, winner: null }
  const windows = platform === 'win32'
  const parts = String(pathValue).split(windows ? ';' : ':').filter(Boolean)
  const standalone = searchPathIndex(path.join(homeDirectory, '.claude', 'bin'), pathValue, platform)
  const cacheRoot = normalisePathEntry(cacheDirectory(homeDirectory), windows)
  // Any version's bin under the cache counts: the question is which TREE answers,
  // and the loader injects whichever version the session pinned.
  const separator = windows ? path.win32.sep : path.posix.sep
  const plugin = parts.findIndex(entry =>
    normalisePathEntry(entry, windows).startsWith(cacheRoot + separator))
  const winner = standalone < 0 && plugin < 0 ? 'neither'
    : standalone < 0 ? 'plugin'
    : plugin < 0 ? 'standalone'
    : standalone < plugin ? 'standalone' : 'plugin'
  return { known: true, winner, standalone, plugin }
}

/**
 * Every directory pairing a standalone install mirrors, as ONE table.
 *
 * The drift notice and the sync tool used to carry separate lists, and they
 * drifted apart exactly as two lists do: reported 2026-09-01, the notice named a
 * stale `facts-gate-dispatch.sh` under the home `.claude/hooks/`, and
 * `sync-standalone.mjs`
 * answered "Nothing to do", because its loop knew only `bin` and `templates`.
 * The file was a gate dispatcher running three of the plugin's five gates, wired
 * in the user's own settings, with no route to notice or repair it.
 *
 * `home` and `shipped` are DIFFERENT NAMES on purpose — the plugin's hooks live
 * under `scripts/` and land in the home `.claude/hooks/`. A single `dir` string reads
 * fine and silently walks a directory the plugin does not have.
 *
 * `whenAbsent: 'create'` belongs to gates alone. A gate that is absent resolves
 * to nothing, so creating it is the point; everything else is refreshed only
 * where the user already keeps one, because a deletion has to stay deleted.
 *
 * `wired` marks the entries that can only answer when the user's own settings
 * name them. This plugin wires its hooks through `${CLAUDE_PLUGIN_ROOT}` and
 * never looks under the home directory, so an unwired copy there is dead — drift
 * nobody can act on, and both consumers must agree about that or one of them
 * offers work the other says is none.
 */
export const SHADOW_SCOPE = [
  { home: 'bin', shipped: 'bin', whenAbsent: 'create', wired: false },
  { home: 'hooks', shipped: 'scripts', whenAbsent: 'skip', wired: true },
  { home: 'templates', shipped: 'templates', whenAbsent: 'skip', wired: false },
  { home: 'skills', shipped: 'skills', leaf: 'SKILL.md', whenAbsent: 'skip', wired: false },
  { home: 'workflows', shipped: 'workflows', whenAbsent: 'skip', wired: false },
]

/**
 * The directories this plugin ships that are deliberately NOT mirrored home-side.
 *
 * MIRRORING IS THE DEFAULT and this is the exception list, which is the whole
 * point of the pairing. The table above was hand-written, so a shipped directory
 * was covered only if somebody remembered it — and on 2026-09-01, the day the
 * hooks gap shipped its fix, `workflows` was still missing: two files under the
 * home were ours, still shipped and drifted, and `grep -n workflows` over the
 * three scanning modules returned nothing. Same defect as GitHub issue #1, one
 * directory over, found by enumerating the class instead of the instance.
 *
 * A test asserts that every shipped directory is either in SHADOW_SCOPE or named
 * here, so the NEXT directory this plugin adds cannot be silently unscanned. It
 * fails loudly and the author decides which list it joins; that decision is a
 * judgement no derivation can make, and leaving it to memory is what produced
 * this entry.
 *
 * WHAT THE RULE CANNOT CATCH, said out loud because a mutation measured it: moving
 * a directory OUT of SHADOW_SCOPE and INTO this set in the same edit is invisible
 * to the check, since that is exactly what a legitimate exclusion looks like. A
 * mutation adding `workflows` here came back GREEN on 2026-09-01 — it changes
 * nothing while SHADOW_SCOPE still covers it, so it was a no-op rather than a gap
 * in the test. The gap it points at is real and is a review question, not a
 * mechanical one: every entry below has to carry the reason it is here.
 */
export const NEVER_MIRRORED = new Set([
  // The eval corpus is the plugin's own test fixtures. Nothing under the home
  // reads it, and its results directory is gitignored (CLAUDE.md §6).
  'evals',
  // `hooks/hooks.json` is the plugin's own hook REGISTRATION, read by the loader
  // from the plugin root. The home `hooks/` directory holds the scripts it points
  // at, which ship under `scripts/` — that asymmetry is the SHADOW_SCOPE entry
  // above, and copying the registration itself home-side would register a second
  // set of hooks nobody asked for.
  'hooks',
  // The plugin manifest. One per installed plugin, resolved by the loader; a copy
  // under the home is not a plugin.
  '.claude-plugin',
])

/**
 * A predicate for "the user's settings name this file", read once per call.
 *
 * Both settings spellings are read and concatenated: a hook wired in
 * `settings.local.json` is as live as one in `settings.json`.
 */
export function wiredInSettings(homeDirectory = os.homedir()) {
  const text = ['settings.json', 'settings.local.json']
    .map(name => {
      try { return readFileSync(path.join(homeDirectory, '.claude', name), 'utf8') } catch { return '' }
    })
    .join('\n')
  return name => text.includes(name)
}

export function forwarderScript(gate, homeDirectory = os.homedir()) {
  const cache = cacheDirectory(homeDirectory).replace(homeDirectory, '$HOME')
  return [
    '#!/bin/sh',
    `# ${FORWARDER_MARK}: resolves the newest installed plugin at call time.`,
    '# Generated by standalone-link.mjs. No version appears here on purpose —',
    '# a copy goes stale, a forwarder cannot. Edit the plugin, not this file.',
    `cache="${cache}"`,
    `root=$(node -e '${RESOLVER}' "$cache" 2>/dev/null)`,
    'if [ -z "$root" ]; then',
    '  echo "quality-harness: no installed plugin under $cache, so this gate did NOT run." >&2',
    '  echo "quality-harness: this is not a pass - an absent checker certifies nothing." >&2',
    '  echo "quality-harness: install or update the plugin, then re-run." >&2',
    // EXIT 4, NOT 0, AND THE COMMENT THAT USED TO SIT HERE WAS WRONG. It read:
    // "a missing plugin is the harness failing to run, never a finding about the
    // user's file. Exiting non-zero would make a project's own gate fail because
    // a tool is absent, which is the block this harness removed." That is
    // CLAUDE.md §3 applied one level too far. §3 is about a gate that RAN and
    // found problems — it advises rather than refusing. A gate that could not run
    // has made no observation at all, and in a shell `exit 0` IS an observation:
    // reported 2026-08-29 with a fixture, `adr-lint <record> && go test ./...`
    // — the shape this project's own task template encourages — sees success and
    // CONTINUES. `adr-verify` then records exit 0 against the task, and the two
    // diagnostic lines went to stderr, which nothing reads back. A tool-written
    // false PASS in a Verification Log, produced by the layer that exists to
    // prevent exactly that.
    //
    // 4 is this repository's own code for "could not check", set by ADR-005 in
    // spec-verify: "4 is reached only when nothing observed failed - as far as I
    // could check, and I could not check everything." The precedent one file over
    // already answered this: adr-verify records a zero exit that scored no tests
    // as exit 1, because a filter matching nothing is not a passing gate.
    '  exit 4',
    'fi',
    `exec "$root/bin/${gate}" "$@"`,
    '',
  ].join('\n')
}

export function forwarderCmd(gate, homeDirectory = os.homedir()) {
  const cache = cacheDirectory(homeDirectory).replace(homeDirectory, '%USERPROFILE%')
  return [
    '@echo off',
    `rem ${FORWARDER_MARK}: resolves the newest installed plugin at call time.`,
    'rem Generated by standalone-link.mjs. PATHEXT includes .CMD, so the bare',
    'rem gate name the skills document resolves here under cmd and PowerShell.',
    'setlocal',
    `set "QH_CACHE=${cache}"`,
    'set "QH_ROOT="',
    `for /f "usebackq delims=" %%r in (\`node -e "${RESOLVER.replaceAll('"', '\\"')}" "%QH_CACHE%"\`) do set "QH_ROOT=%%r"`,
    'if not defined QH_ROOT (',
    '  echo quality-harness: no installed plugin under %QH_CACHE%, so this gate did NOT run.>&2',
    '  echo quality-harness: this is not a pass - an absent checker certifies nothing.>&2',
    '  echo quality-harness: install or update the plugin, then re-run.>&2',
    // Same code as the sh forwarder, for the same reason. A Windows fence chains
    // with `&&` exactly as a POSIX one does.
    '  exit /b 4',
    ')',
    // The py launcher first: a Windows Python is `python.exe`, so `python3` —
    // the name the gate's shebang asks for — often does not exist there.
    //
    // Written as a GOTO, not as `where /q py && (…) || (…)` and not as an IF
    // block either. The chain is not if/else: `||` fires when the GATE exits
    // non-zero, not only when `where` fails, so every failing gate ran twice
    // under two interpreters and the caller received the second one's status.
    // Measured 2026-08-30 on Windows 11, with the whole FAIL block printed twice.
    //
    // The obvious repair — `if errorlevel 1 (…) else (…)` — fixes that and
    // introduces another: an unquoted argument containing `)` closes the block
    // early. `C:\\Program Files (x86)\\…` is exactly that argument, and the
    // ProgramFiles(x86) root is already in resolve_bash's own fallback list. It
    // was measured failing with "was unexpected at this time" and exit 255,
    // gate never run. The `&&` form has the same hazard; this one does not.
    //
    // A bare `exit /b` preserves the preceding command's status, so the python
    // branch propagates exactly as the py branch does.
    'where /q py && goto :usepy',
    `python "%QH_ROOT%\\bin\\${gate}" %*`,
    'exit /b',
    ':usepy',
    `py -3 "%QH_ROOT%\\bin\\${gate}" %*`,
    '',
  ].join('\r\n')
}

const digest = file => {
  try { return createHash('sha256').update(readFileSync(file)).digest('hex') } catch { return null }
}

/**
 * Every digest this plugin has ever installed for `relative`, across the whole
 * cache. A file in the user's home matching one of these is a copy some earlier
 * `--apply` made; anything else may be the user's own work and is left alone.
 */
export function knownDigests(relative, homeDirectory = os.homedir()) {
  const cache = cacheDirectory(homeDirectory)
  const seen = new Set()
  let versions = []
  try { versions = readdirSync(cache) } catch { return seen }
  for (const version of versions) {
    const found = digest(path.join(cache, version, relative))
    if (found) seen.add(found)
  }
  return seen
}

const readOrEmpty = file => {
  try { return readFileSync(file, 'utf8') } catch { return '' }
}

const firstMeaningfulLine = text => text.split(/\r?\n/).find(line => line.trim()) ?? ''

/**
 * Whether `target` is the same artefact as `source`, by the line each kind uses
 * to identify itself. A digest match is the clean answer, but it only fires for
 * versions still in the cache — the standalone set here was four days old and
 * came from a version long since evicted, so digests alone called every real
 * plugin copy a stranger and the check protected nothing it was written for.
 *
 * A gate opens with `"""<name> — executable gate`; a template and a SKILL.md
 * open with a title or a frontmatter fence that names the same thing. Those
 * survive edits to the body, which is exactly what "drifted" means.
 */
/**
 * Every cached release of THIS plugin whose tree holds a file of this basename.
 *
 * Keyed on BASENAME, not on a relative path, because the path is not stable
 * across this project's own history: ADR-008 moved the gates under `plugin/` on
 * 2026-08-28, and the home `hooks/` directory has never shared a name with the
 * plugin directory that fills it. A lookup pinned to one relative path answers
 * "no" for a file that shipped for a year under another.
 *
 * BOUND TO THIS PLUGIN'S CACHE NAMESPACE, and that bound is load-bearing rather
 * than tidy. `sameLineage` compares opening docstrings and a `%~dp0` pattern,
 * neither of which is specific to this plugin, so a walk over `cache/*` would let
 * another vendor's same-named file satisfy the lineage route — and on the machine
 * that authored ADR-019, four files in the home hooks directory belonged to
 * autoresearch and codebase-memory, three of them wired and running.
 *
 * Reads only. Short-circuits per release on the first match, because the question
 * is whether this release knew the name, not how many times.
 */
export function formerlyShipped(name, homeDirectory = os.homedir()) {
  const cache = cacheDirectory(homeDirectory)
  let versions = []
  try { versions = readdirSync(cache) } catch { return [] }
  const found = []
  for (const version of versions.sort()) {
    const hit = firstNamed(path.join(cache, version), name, 4)
    if (!hit) continue
    found.push({
      version,
      relative: path.relative(path.join(cache, version), hit).split(path.sep).join('/'),
      digest: digest(hit),
      file: hit,
    })
  }
  return found
}

/** Depth-bounded search for a file of this basename. */
function firstNamed(root, name, depth) {
  if (depth < 0) return null
  let entries = []
  try { entries = readdirSync(root, { withFileTypes: true }) } catch { return null }
  for (const entry of entries) {
    if (entry.isFile() && entry.name === name) return path.join(root, entry.name)
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const deeper = firstNamed(path.join(root, entry.name), name, depth - 1)
    if (deeper) return deeper
  }
  return null
}

/**
 * What a file under the user's home IS, as far as this plugin can prove.
 *
 * Three states, and the middle one is the whole of ADR-019:
 *
 *   ours-shipped  the plugin ships this basename today -> drift, refresh it
 *   ours-orphan   it does not, and something PROVES we wrote it -> say so
 *   unidentified  nothing proves it -> never call it ours
 *
 * ABSENCE FROM THE CURRENT TREE IS A PRECONDITION, NEVER EVIDENCE. The residual
 * rule — not shipped now, therefore ours — was measured wrong before this was
 * written: it names another tool's live, wired hooks as orphans of this plugin.
 * `unidentified` is the ADR-005 vocabulary for a check that could not determine
 * something, and it is the honest answer for a file whose bytes and lineage
 * markers were both edited. The reported `tests/selftest.sh` is a probable
 * instance; this returns `unidentified` for it rather than guessing.
 */
export function classifyHomeFile({ file, name, shippedNow, homeDirectory = os.homedir() }) {
  if (shippedNow) return { state: 'ours-shipped', route: 'shipped', version: null }
  const mine = readOrEmpty(file)
  if (mine.includes(FORWARDER_MARK)) {
    return { state: 'ours-orphan', route: 'forwarder', version: null }
  }
  const history = formerlyShipped(name, homeDirectory)
  const ours = digest(file)
  const identical = history.find(found => found.digest && found.digest === ours)
  if (identical) {
    return { state: 'ours-orphan', route: 'digest', version: identical.version }
  }
  // Lineage LAST: it is the loose route, so a digest match must have had its
  // chance first, and a `route` of `lineage` in a report means the bytes differ.
  const kin = history.find(found => sameLineage(file, found.file, lineageKind(found.relative)))
  if (kin) return { state: 'ours-orphan', route: 'lineage', version: kin.version }
  return { state: 'unidentified', route: null, version: null }
}

/** Which `sameLineage` arm a formerly-shipped path is judged under. */
function lineageKind(relative) {
  if (relative.endsWith('.cmd')) return 'shim'
  if (relative.startsWith('bin/')) return 'gate'
  return 'file'
}

export function sameLineage(target, source, kind) {
  if (kind === 'skill') {
    const name = /^name:\s*(\S+)/m.exec(readOrEmpty(path.join(target, 'SKILL.md')))?.[1]
    const expected = /^name:\s*(\S+)/m.exec(readOrEmpty(path.join(source, 'SKILL.md')))?.[1]
    return Boolean(name) && name === expected
  }
  const text = readOrEmpty(target)
  if (!text) return false
  if (kind === 'gate') {
    // Two shapes in this set, and only checking the first one silently refused a
    // real plugin copy: most gates open `"""<name> — description`, but
    // adr-retire-check opens with a sentence and no name at all. Compare the
    // subject where there is one, because the description drifts around it
    // (one named a home templates path, the next named the plugin), and the
    // whole opening line where there is not.
    const opening = body => body.split(/\r?\n/).slice(0, 4).find(line => line.startsWith('"""')) ?? ''
    const subject = line => /^"""([\w-]+)\s+—/.exec(line)?.[1] ?? null
    const here = opening(text)
    const there = opening(readOrEmpty(source))
    if (!here || !there) return false
    return subject(here) !== null || subject(there) !== null
      ? subject(here) === subject(there)
      : here === there
  }
  if (kind === 'shim') {
    // Either our forwarder or the copied shim it replaces, both of which name
    // the gate they run.
    return text.includes(FORWARDER_MARK) || /%~dp0[\w-]+/.test(text)
  }
  return firstMeaningfulLine(text) === firstMeaningfulLine(readOrEmpty(source))
}

/**
 * Whether this tool may overwrite `entry.to`. It qualifies when it is absent,
 * when it is a forwarder or link this tool wrote, when its contents match a
 * file some cached version installed, or when it identifies itself as the same
 * artefact. Anything else is reported and left alone.
 *
 * The home config directory holds the user's own tools beside ours — a memory
 * server, a palace backup, three skills this plugin never shipped. Writing a
 * path that merely shares a name would destroy work nobody asked us to touch.
 */
export function replaceable(entry, homeDirectory = os.homedir()) {
  const { to: target, relative, lineage } = entry
  let info
  try { info = lstatSync(target) } catch { return { ok: true, why: 'absent' } }
  if (info.isSymbolicLink()) {
    const points = (() => { try { return readlinkSync(target) } catch { return '' } })()
    // Under the cache, or at exactly what this run would write. The second half
    // matters because the source is whatever the caller resolved: syncing from a
    // checkout rather than the cache produced a link this same function then
    // called a stranger, so the tool could not recognise its own work.
    return points.startsWith(cacheDirectory(homeDirectory)) || points === entry.target
      ? { ok: true, why: 'our link' }
      : { ok: false, why: 'a symlink to something outside this plugin' }
  }
  if (info.isFile() && readOrEmpty(target).includes(FORWARDER_MARK)) {
    return { ok: true, why: 'our forwarder' }
  }
  if (info.isFile() && knownDigests(relative, homeDirectory).has(digest(target))) {
    return { ok: true, why: 'a copy of a released file' }
  }
  if (info.isDirectory() !== (lineage === 'skill')) {
    return { ok: false, why: info.isDirectory() ? 'a directory where a file belongs' : 'not a directory' }
  }
  return sameLineage(target, entry.source ?? entry.target, lineage)
    ? { ok: true, why: 'a drifted copy of this same file' }
    : { ok: false, why: 'not a file this plugin installed — it may be your own' }
}

/** The gates a forwarder is generated for, read from the plugin rather than listed. */
export function gateNames(source) {
  try {
    // withFileTypes, because a dotless name is not the same as a gate. A stray
    // DIRECTORY in bin/ — `__pycache__`, which any Python import of a gate
    // creates unless it sets dont_write_bytecode — satisfies the name test and
    // would get a forwarder generated for it. Found 2026-08-28 when an ad-hoc
    // import during debugging made five suites fail at once.
    return readdirSync(path.join(source, 'bin'), { withFileTypes: true })
      .filter(entry => entry.isFile() && !entry.name.includes('.'))
      .map(entry => entry.name).sort()
  } catch {
    return []
  }
}

/**
 * What `--apply` would do. `forwarder` entries carry their full text so the
 * caller writes exactly what was reported; `link` entries carry a target.
 */
export function linkPlan(source, homeDirectory = os.homedir(), platform = process.platform) {
  const home = path.join(homeDirectory, '.claude')
  const work = []

  for (const gate of gateNames(source)) {
    work.push({
      kind: 'forwarder',
      to: path.join(home, 'bin', gate),
      relative: path.join('bin', gate),
      contents: forwarderScript(gate, homeDirectory),
      source: path.join(source, 'bin', gate),
      lineage: 'gate',
      mode: 0o755,
    })
    // The .cmd sits beside it on every platform. A repository synced from macOS
    // and used from Windows is the normal case, and a shim generated only where
    // it runs is a shim that is never there when it is needed.
    work.push({
      kind: 'forwarder',
      to: path.join(home, 'bin', `${gate}.cmd`),
      relative: path.join('bin', `${gate}.cmd`),
      contents: forwarderCmd(gate, homeDirectory),
      source: path.join(source, 'bin', `${gate}.cmd`),
      lineage: 'shim',
      mode: 0o644,
    })
  }

  // SKILLS ARE DELIBERATELY NOT LINKED, and this is the one place the rule is
  // written down. Linking a personal skill at the plugin's own skill directory
  // makes the two resolve to the SAME path, and the loader then offers one
  // skill rather than two: the bare name survives and `quality-harness:<name>`
  // disappears. Reported 2026-08-27 — "where quality-harness:work skill gone?"
  // — in the session that installed the links, and the namespaced entrypoint is
  // the one the plugin actually documents. A drifting copy is a worse answer
  // than a stale one; an entrypoint that is simply gone is worse than both.
  //
  // A gate has no such collision: nothing serves it by name from two places, so
  // a forwarder there only ever removes drift.
  //
  // TEMPLATES ARE NOT LINKED EITHER, for a different reason, decided 2026-08-28.
  // They never hid anything — no path identity, no lost entrypoint — but nothing
  // reads them: every skill names `${CLAUDE_PLUGIN_ROOT}/templates/...`, which is
  // always the running version, and the bare-name skills that once read the home
  // copies were deleted by ADR-001. What remained was a chore. A link names ONE
  // version, so every release left six links pointing at the previous one and
  // asked for a `--link --apply` to repoint them.
  //
  // Worse than stale: the cache evicts. Measured 2026-08-28 against this
  // machine's own cache — 23 released versions absent, 2.18.1, 2.18.2 and 2.19.1
  // among them, all three released within two days of the links being written.
  // A link naming an evicted version dangles, and a dangling link reads as
  // ABSENT rather than old: `digest()` returns null, so `standaloneDriftNotice`
  // says nothing at all. A stale copy is reported; a vanished link is not.
  //
  // Copy mode still refreshes a template where the user already has one — see
  // `pairs()` in sync-standalone.mjs. That is what serves Windows, where a file
  // symlink needs a privilege an ordinary account lacks and these were always
  // real files rather than links.

  return work.map(entry => ({ ...entry, ...currentState(entry, homeDirectory, platform) }))
}

function currentState(entry, homeDirectory, platform) {
  const permission = replaceable(entry, homeDirectory)
  if (!permission.ok) return { state: 'skipped', why: permission.why }
  if (entry.kind === 'forwarder') {
    // A forwarder carries no version, so identical text means there is nothing
    // to do — not merely that it is current, but that it can never fall behind.
    const same = (() => { try { return readFileSync(entry.to, 'utf8') === entry.contents } catch { return false } })()
    return same ? { state: 'current' } : { state: permission.why === 'absent' ? 'missing' : 'replaced' }
  }
  // Nothing else is planned. Templates stopped being linked on 2026-08-28 and
  // skills never were, so every entry is a forwarder — which is why the whole
  // symlink/copy-only/repoint apparatus that used to live here is gone. A
  // forwarder carries no version; there is nothing to repoint and nothing that
  // can dangle. `platform` is kept because the SHIM is generated for every
  // platform from any platform, and a caller still says which one it means.
  throw new Error(`unplanned entry kind: ${entry.kind}`)
}

/** Where a run's originals are kept. One directory per run, never reused. */
export function backupRoot(stamp, homeDirectory = os.homedir()) {
  return path.join(homeDirectory, '.claude', '.quality-harness-backup', stamp)
}

/**
 * Copy what is about to be replaced, before replacing it.
 *
 * Asked for by the owner on 2026-08-27 — "i need to backup my original ones
 * first then" — and the right answer is that they should not have had to.
 * Every guarantee in this file is about not losing someone's work, and a
 * backup you must remember is the same failure as a sync you must remember.
 *
 * Returns the path written, or null when there was nothing there to keep.
 */
export function archive(entry, stamp, homeDirectory = os.homedir(), makeLink = symlinkSync) {
  let info
  try { info = lstatSync(entry.to) } catch { return null }
  const kept = path.join(backupRoot(stamp, homeDirectory), entry.relative)
  mkdirSync(path.dirname(kept), { recursive: true })
  // A symlink is recreated rather than copied through. `cpSync` with
  // verbatimSymlinks preserves a LIVE link, but it throws ENOENT on a dangling
  // one — and a dangling link is exactly what a home config directory collects,
  // because the checkout a skill pointed at gets moved. Losing the archive step
  // to an exception halfway through a run is how the originals go missing at the
  // moment they matter most. Proved by a mutation that stayed green until the
  // dangling case was tested.
  if (info.isSymbolicLink()) {
    const points = readlinkSync(entry.to)
    try {
      makeLink(points, kept)
    } catch {
      // Windows refuses symlink creation to an unprivileged account, and this
      // threw EPERM on a real machine on 2026-08-27 — so the archive failed, so
      // the repoint failed, and thirteen of nineteen skill links stayed pinned
      // to the previous release. A link's entire content IS its target, so a
      // plain file holding that target loses nothing and always succeeds.
      // Driven by what actually works rather than by a platform guess: some
      // Windows accounts can create symlinks, and this project has been wrong
      // about that before.
      writeFileSync(kept, `${points}\n`)
    }
    return kept
  }
  cpSync(entry.to, kept, { recursive: true, preserveTimestamps: true, verbatimSymlinks: true })
  return kept
}

export function write(entry, stamp = null, homeDirectory = os.homedir(), makeLink = symlinkSync) {
  // The archive happens first or it does not happen. `write` is the only path
  // that removes anything, so putting the copy anywhere else leaves a caller
  // able to skip it.
  const kept = stamp ? archive(entry, stamp, homeDirectory, makeLink) : null
  mkdirSync(path.dirname(entry.to), { recursive: true })
  rmSync(entry.to, { force: true })
  writeFileSync(entry.to, entry.contents, { mode: entry.mode })
  return kept
}
