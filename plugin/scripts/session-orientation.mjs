// The standing paragraphs a session starts with and the decisions handed over at the moment a file is touched: what verifies
// this project, which records are in flight, what governs the path about to change. Moved out of lifecycle.mjs unchanged
// (BACKLOG section 375, stage B4).
import { decisionContext, inside, listedPath, trackedPaths, unmarkedArchives } from './decision-corpus.mjs'
import path from 'node:path'
import { lstatSync, statSync } from 'node:fs'
import { canonical, nearestExistingDirectory } from './event-log.mjs'
import { gitRepositoryLookup } from './tree-facts.mjs'
import { checkCommandOrigin } from './check-command.mjs'
import { checkInCode, pathInCode } from './corpus-text.mjs'
import { alreadyMentionedThisSession, firstMentionHere, firstMentionThisSession } from './session-notes.mjs'
import { shadowInstallNotice, staleVersionNotice } from './install-notices.mjs'
import { readyTaskLines, surfaceReadyLines } from './ready-lines.mjs'

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

export function sessionOrientation(cwd, { once = false } = {}) {
  const directory = nearestExistingDirectory(path.resolve(cwd ?? process.cwd()))
  if (!directory) return ''
  const found = gitRepositoryLookup(directory)
  const repositoryRoot = found.ok ? found.root : null
  const root = repositoryRoot ?? directory
  const lines = []
  // ADR-094 T2: the standing paragraphs below go through `standing`; where the hook asks (startup and
  // resume) each is said once per repository per three days. The could-not-look lines never do (ADR-005).
  const standing = text => { if (!once || firstMentionHere(root, text)) lines.push(text) }
  if (!found.ok) {
    lines.push(`could-not-look: the repository root could not be read (${found.reason}). Whether this directory is a repository, and which check it declares, is unknown.`)
  }

  const { command: check, origin } = found.ok ? checkCommandOrigin(root) : { command: null, origin: 'unproven' }
  if (origin === 'refused') {
    standing('Verification: the check declared in `.quality-harness.json` is a constant success and was refused. Declare a command that can fail.')
  } else if (check) {
    const named = origin === 'declared'
      ? `this project's own check is ${checkInCode(check)}`
      : `no \`check\` is declared in \`.quality-harness.json\`; inferred ${checkInCode(check)} from a manifest — that is not this project's own check, and it may be narrower than this project's own gate (a step the inference did not pick, such as a typecheck or lint), so its pass is not that gate's pass`
    standing(`Verification: ${named}. `
      // ADR-060: a check is an EVENT `qh-check` writes, so how the command is
      // spelled, piped or redirected no longer decides anything — but running it
      // any other way now leaves no record at all, and the orientation has to say
      // so. A peer session testing this branch ran its check directly and was
      // still told the tree was unchecked, which is correct and was not said
      // anywhere (2026-09-18).
      + 'Run it through `qh-check`: that is what records the result where the '
      + 'completion and commit advisories read it. The same command run any other '
      + 'way still proves the work to you, and leaves them nothing to see.')
  }

  const stale = staleVersionNotice()
  if (stale) standing(stale)

  const inside = repositoryRoot !== null
  const listing = inside ? trackedPaths(root) : null
  const ready = readyTaskLines(root, inside, listing)
  if (inside && ready.look === 'UNPROVEN') {
    lines.push('could-not-look: git could not list the tree (UNPROVEN). Ready tasks and corpus existence are not known.')
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
  if (check || ready.lines.length || corpusLook === true || corpusLook === 'UNPROVEN') {
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

  if (ready.lines.length) {
    const shown = surfaceReadyLines(ready.lines)
    standing(['ADR tasks in flight:', ...shown].join('\n'))
  }

  return lines.join('\n\n')
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
