// The standing paragraphs a session starts with and the decisions handed over at the moment a file is touched: what verifies
// this project, and what governs the path about to change. Which ADR task is ready is work-next's to say (ADR-099). Moved out
// of lifecycle.mjs (BACKLOG section 375, stage B4).
import { decisionContext, listedPath, trackedPaths, unmarkedArchives } from '../../../plugin/scripts/decision-corpus.mjs'
import path from 'node:path'
import { lstatSync, statSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { canonical, nearestExistingDirectory } from '../../../plugin/scripts/event-log.mjs'
import { gitRepositoryLookup } from './tree-facts.mjs'
import { checkCommandOrigin } from './check-command.mjs'
import { checkInCode, pathInCode } from '../../../plugin/scripts/corpus-text.mjs'
import { alreadyMentionedThisSession, firstMentionHere, firstMentionThisSession } from './session-notes.mjs'
import { shadowInstallNotice, staleVersionNotice } from '../../../plugin/scripts/install-notices.mjs'
import { itemMarker } from './said-per-context.mjs'

// What a session would otherwise learn by hitting a wall. Additive only: this
// hook can never block, and says nothing it cannot establish from the project
// itself — an empty orientation is correct for a project with no conventions.
// --- Decisions that reach the code -----------------------------------------
//
// Everything above answers "is this work proved?". This answers a question the
// harness had never asked: "what has already been decided about the file you are
// about to change?" — which is the difference between a tool that reports on you
// and a tool that hands you something.
//
// The idea and its vocabulary are lifted from adrkit (mbeacom/adrkit, Apache-2.0),
// which added an `affects:` field so tooling can resolve which decisions govern a
// change, and deliberately surfaces the graveyard of superseded and withdrawn
// records so an agent stops re-proposing an approach somebody already killed.
// Two things are ours: resolution needs no new header, because every task file in
// this corpus already carries a machine-readable `## Affected Files` table that
// adr-lint requires; and nothing here is a finding, so nothing here can fail.
//
// Resolution is a pure function of (corpus, paths) — same corpus, same paths,
// same answer — and runs entirely in this process. A subprocess per record at
// the edit boundary would rebuild the artifact-gate budget problem somewhere
// much hotter.

const CORPUS_DIR_NAMES = ['docs/adr', 'docs/specs', 'docs/decisions', 'adr', 'specs']

export function hasDecisionCorpus(root, listing = trackedPaths(root), platform = process.platform) {
  if (listing == null) return 'UNPROVEN'
  for (const rel of listing) {
    const norm = listedPath(rel, platform)
    for (const dir of CORPUS_DIR_NAMES) {
      if (norm === dir || norm.startsWith(`${dir}/`)) return true
    }
  }
  return false
}

// A corpus directory that is a link whose target is gone — a dangling symlink, or a junction left
// behind on Windows. The corpus behind it could not be read, and work-next said "No QH corpus is in
// use" over it (BACKLOG §350 C10, a Windows chaos run of 3.8.3). The paths found, absolute.
export function danglingCorpusLinks(root) {
  const found = []
  for (const dir of CORPUS_DIR_NAMES) {
    const at = path.join(root, ...dir.split('/'))
    let link
    try { link = lstatSync(at).isSymbolicLink() } catch { continue }
    if (!link) continue
    try { statSync(at) } catch { found.push(at) }
  }
  return found
}

// `say(text, root)`, when given, decides each standing paragraph (ADR-122 Decision 8: once per context, judged by the hook that
// knows the context); `mark` appends the item's said-per-context marker to each one said, so a later look can find it.
export function sessionOrientation(cwd, { once = false, say = null, mark = false } = {}) {
  const directory = nearestExistingDirectory(path.resolve(cwd ?? process.cwd()))
  if (!directory) return ''
  const found = gitRepositoryLookup(directory)
  const repositoryRoot = found.ok ? found.root : null
  const root = repositoryRoot ?? directory
  const lines = []
  // ADR-094 T2: the standing paragraphs below go through `standing`; where the hook asks, each is said once per context
  // (ADR-122 Decision 8), or once per repository per three days when only `once` is asked. The could-not-look lines never are.
  const standing = text => {
    if (say ? say(text, root) : (!once || firstMentionHere(root, text))) lines.push(mark ? `${text} ${itemMarker('standing', text)}` : text)
  }
  if (!found.ok) {
    lines.push(`could-not-look: the repository root could not be read (${found.reason}). Whether this directory is a repository, and which check it declares, is unknown.`)
  }

  const { command: check, origin } = found.ok ? checkCommandOrigin(root) : { command: null, origin: 'unproven' }
  if (origin === 'unreadable') {
    standing(`Verification: ${checkCommandOrigin(root).problem}, so no check can pass here and \`qh-check\` will not guess what it declares. Fix the file.`)
  }
  if (origin === 'refused') {
    standing('Verification: the check declared in `.quality-harness.json` is a constant success and was refused. Declare a command that can fail.')
  } else if (check) {
    const named = origin === 'declared'
      ? `this project's own check is ${checkInCode(check)}`
      : `no \`check\` is declared in \`.quality-harness.json\`; inferred ${checkInCode(check)} from a manifest — that is not this project's own check, and it may be narrower than this project's own gate (a step the inference did not pick, such as a typecheck or lint), so its pass is not that gate's pass`
    standing(`Verification: ${named}. `
      + '`qh-check` optionally records a run for status and reports (ADR-130).')
  }

  const stale = staleVersionNotice()
  if (stale) standing(stale)

  const inside = repositoryRoot !== null
  const listing = inside ? trackedPaths(root) : null
  if (inside && listing == null) {
    lines.push('could-not-look: git could not list the tree (UNPROVEN), so corpus existence is not known.')
  }
  const corpusLook = inside ? hasDecisionCorpus(root, listing) : false
  // Only where there is a decision corpus: a repository that never opted in was
  // told to adopt its blog's `content/archive/` (cold review of 833ea52).
  if (corpusLook === true) {
    // The name test: SessionStart opens no record content (CLAUDE.md §19, ADR-092 Decision 11).
    for (const archive of unmarkedArchives(root, listing)) {
      standing(`${pathInCode(archive)} looks like an archive but has no Lifecycle marker, so it is read as live — `
        + '`adr-retire-check --adopt <active> <archive>` reports what adopting it needs; it changes nothing (skills/adr-retire §Existing Archives).')
    }
  }

  // A stale standalone copy can only give a wrong answer where a gate actually
  // runs, so the warning belongs in a repository that has a corpus for one to
  // read. Ungated it opened every session in every repository — including ones
  // that never opted into this lifecycle at all, which is the noise this
  // project was told is worse than not shipping the plugin.
  // Git-fail is UNPROVEN, not "no corpus" — a false would skip this notice.
  // ADR-107 T3: a session with mrw on PATH is pointed to it, in a repository that opted into this lifecycle, once.
  if ((check || corpusLook === true) && mrwOnPath()) {
    standing('mrw is on PATH: read every site you will touch in one `mrw read`, and apply every edit as one `mrw write` plan '
      + '(the `execution` skill\'s "Read and edit in batches").')
  }

  if (check || corpusLook === true || corpusLook === 'UNPROVEN') {
    const shadow = shadowInstallNotice()
    if (shadow) {
      standing(`${shadow} \`node \${CLAUDE_PLUGIN_ROOT}/scripts/sync-standalone.mjs\` reports `
        + 'what differs. `--apply` copies over it, which is the fix you have to remember again '
        + 'next release; `--link` turns each gate into a forwarder that resolves the newest '
        + 'installed plugin at call time, so no release touches a gate again — and a gate is now '
        + 'the only thing it links, so there is nothing left to repoint after an update. A TEMPLATE '
        + 'is refreshed only where you already keep one, and a bare-name SKILL is better deleted '
        + 'than synced: it duplicates one the '
        + 'plugin already serves as `quality-harness:<name>`, and linking it at the plugin own '
        + 'directory hides the namespaced entrypoint outright.')
    }
  }

  return lines.join('\n\n')
}

// mrw as the platform would resolve it from PATH, with no shell: the first directory holding the name wins, and it is named
// only when it answers `--version` in mrw's own shape, so a different tool called mrw is never pointed to (ADR-107 T3).
// QUALITY_HARNESS_NO_MRW=1 asks about the project, not the machine: corpus-probe sets it, since what a probe reports is about
// the corpus it reads, and a line that depends on the prober's PATH would read as a change in that corpus.
export function mrwOnPath(env = process.env, platform = process.platform, version = mrwVersion) {
  if (env.QUALITY_HARNESS_NO_MRW === '1') return null
  const windows = platform === 'win32'
  const name = windows ? 'mrw.exe' : 'mrw'
  for (const dir of String((windows ? env.Path ?? env.PATH : env.PATH) ?? '').split(windows ? ';' : ':').filter(Boolean)) {
    const candidate = path.join(dir, name)
    let found
    try { found = statSync(candidate) } catch { continue }
    if (!found.isFile() || (!windows && (found.mode & 0o111) === 0)) continue
    return /^mrw version v\d+\.\d+/.test(version(candidate, env)) ? candidate : null
  }
  return null
}

function mrwVersion(file, env) {
  const out = spawnSync(file, ['--version'], { encoding: 'utf8', timeout: 2000, windowsHide: true, env })
  return out.status === 0 ? String(out.stdout) : ''
}

// The governing and killed decisions for whatever this call is about to touch.
// Wrapped so a corpus this tool cannot read costs the edit nothing.
export function decisionContextFor(input) {
  const cwd = typeof input.cwd === 'string' && path.isAbsolute(input.cwd) ? input.cwd : process.cwd()
  const target = input.tool_input?.file_path ?? input.tool_input?.notebook_path
  if (typeof target !== 'string' || !target) return ''
  const resolved = canonical(path.resolve(cwd, target))
  // Only skip work for context already emitted. A miss or failed discovery must
  // remain eligible when a governing record is added later in the same session.
  if (alreadyMentionedThisSession(input.session_id, resolved)) return ''
  const directory = nearestExistingDirectory(path.resolve(cwd))
  const found = directory ? gitRepositoryLookup(directory) : { ok: false, root: null, reason: 'no directory' }
  if (directory && !found.ok) return 'could-not-look: the repository root could not be read, so which decisions govern this edit is unknown.'
  const root = directory ? canonical(found.root ?? directory) : null
  if (!root) return ''
  let context
  try { context = decisionContext([resolved], root) } catch { return '' }
  if (!context) return ''
  return firstMentionThisSession(input.session_id, resolved) ? context : ''
}
