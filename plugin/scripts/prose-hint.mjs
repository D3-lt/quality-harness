// The hint a passing full run may add: it took a while, and followed a change to nothing but text documents (ADR-094 T3).
// Moved out of qh-check.mjs unchanged (BACKLOG section 376). It reads git and the check ledger; it decides nothing about the
// run, and a change it cannot place says nothing.
import { spawnSync } from 'node:child_process'
import { lstatSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { stateDir } from './event-log.mjs'
import { checkEventName } from './check-ledger.mjs'

// ADR-094 T3. A hint, once per repository, after a passing full run that took a while and followed a change to
// nothing but text documents: the project may declare them as `prose`, which is its owner's call. Judged from
// the previous full pass's HEAD (the tree hashes' objects are gone), so a change it cannot place says nothing.
export const PROSE_HINT = 'this run followed a change to nothing but text documents since the last full pass. If this project\'s check does not '
  + 'read them, a "prose": [...] list in .quality-harness.json lets a later change to them alone reuse this pass (a check that does '
  + 'read them makes that reuse wrong, so the declaration is the project owner\'s to approve); a "fastCheck" is the other lever (ADR-081).'
const TEXT_DOCUMENT = /\.(?:md|mdx|txt|rst)$/i
export function proseHintMs(env) {
  const configured = Number(env.QUALITY_HARNESS_PROSE_HINT_MS)
  return Number.isSafeInteger(configured) && configured >= 0 ? configured : 60_000
}
export function previousPassHead(root, command) {
  let text
  try { text = readFileSync(path.join(stateDir(root), 'checks.jsonl'), 'utf8') } catch { return null }
  let latest = null
  for (const line of text.split('\n')) {
    let record
    try { record = JSON.parse(line) } catch { continue }
    if (record?.command === command && checkEventName(record) === 'check.passed' && typeof record.after?.head === 'string') latest = record
  }
  if (!latest) return null
  // The pass is placed by its HEAD only when it was taken on that commit's own tree: a pass over uncommitted code
  // says nothing about what differs from HEAD later (found by a Codex review of ADR-094).
  const tree = spawnSync('git', ['-C', root, 'rev-parse', '--verify', '-q', `${latest.after.head}^{tree}`], { encoding: 'utf8', timeout: 10_000, windowsHide: true })
  return !tree.error && tree.status === 0 && tree.stdout.trim() === latest.after.tree ? latest.after.head : null
}
export function onlyTextChangedSince(root, head) {
  const git = args => spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', timeout: 10_000, windowsHide: true })
  const changed = git(['diff', '--no-renames', '--raw', '-z', head, '--'])
  const untracked = git(['ls-files', '-z', '--others', '--exclude-standard'])
  if (changed.error || changed.status !== 0 || untracked.error || untracked.status !== 0) return false
  // A suffix says nothing about what a path IS: a link, a gitlink or an executable named `*.md` is not a document, and
  // a retargeted link between code files would pass the suffix test (a Codex review of ADR-094). Only a regular file,
  // on both sides of the diff, counts; a path added or removed has mode 000000 on the other side.
  const regular = mode => mode === '000000' || mode === '100644'
  const paths = []
  const fields = changed.stdout.split('\0')
  for (let at = 0; at + 1 < fields.length; at += 2) {
    if (!fields[at].startsWith(':')) return false
    const [before, after] = fields[at].slice(1).split(' ')
    if (!regular(before) || !regular(after)) return false
    paths.push(fields[at + 1])
  }
  for (const file of untracked.stdout.split('\0').filter(Boolean)) {
    try { if (!lstatSync(path.join(root, file)).isFile()) return false } catch { return false }
    paths.push(file)
  }
  return paths.length > 0 && paths.every(file => TEXT_DOCUMENT.test(file))
}
