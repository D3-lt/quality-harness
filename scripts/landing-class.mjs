#!/usr/bin/env node
// landing-class.mjs — whether this landing's mutation campaign may be skipped: its plugin version is already tagged on
// the forge, so no release is cut from it (ADR-147), or it only re-pins the catalogue (ADR-146).
//
// The seed job of .github/workflows/selftest.yml runs it at the commit checked out with its parent. It answers "skip" only
// for a push to land/<sha> that is one of two things. Either the version in plugin/.claude-plugin/plugin.json has its tag
// `refs/tags/v<version>` on the forge: `scripts/release.mjs` refuses to release such a version, and `release-evidence`
// refuses a run whose shards were skipped whatever skipped them. Or its one commit sits on main's tip and changes
// nothing but the values of `version`, `url` and `sha256` in .claude-plugin/marketplace.json. Everything else is "run",
// and so is everything it could not read: a command that failed or timed out, output that ended early, a state nobody
// listed (CLAUDE.md §16).
//
// It prints one line, appends `skip=1` or `skip=0` to the file GITHUB_OUTPUT names, and exits 0 whatever it found: the
// answer is the output, and a campaign that runs needlessly costs minutes while a job that fails here would skip it.
import { spawnSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'
import { isMainModule } from '../plugin/scripts/main-module.mjs'

const PIN_DIR = '.claude-plugin'
const PIN_FILE = 'marketplace.json'
const PLUGIN = 'quality-harness'
// A pinned value as it stands in the file: printable ASCII with no quote or backslash, so the text between the quotes is
// the value itself and nothing in it needs an escape.
const PLAIN = /^[ !#-[\]-~]*$/
const SHA = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/
const CHILD_TIMEOUT_MS = 60_000
const MANIFEST = 'plugin/.claude-plugin/plugin.json'
// A version as `scripts/release.mjs` reads one before it tags: three runs of digits and nothing else.
const VERSION = /^\d+\.\d+\.\d+$/

/** The three values `scripts/marketplace-source.mjs` pins, read from the catalogue's one entry for this plugin; null when it has no such entry. */
function pinned(text) {
  try {
    const entries = JSON.parse(text).plugins.filter(plugin => plugin?.name === PLUGIN)
    const [entry] = entries
    const values = { version: entry.version, url: entry.source.url, sha256: entry.source.sha256 }
    return entries.length === 1 && Object.values(values).every(value => typeof value === 'string' && PLAIN.test(value)) ? values : null
  } catch {
    return null
  }
}

/**
 * Whether the catalogue file after is the file before with nothing but a new pin. It is not judged by what changed:
 * the file before is taken, each pinned value that differs is put in at the one place its `"key": "old value"` stands,
 * and the result must be the file after, byte for byte. So the only thing a pin can vary is the three values, and an
 * edit anywhere else, a key written twice included, is another file (three review rounds each found one more input a
 * rule over the changed lines read as a pin; the Codex verification of 5aaf5d1bd..4b45a20f5 was the last).
 */
export function pinOnly(before, after) {
  if (!Buffer.isBuffer(before) || !Buffer.isBuffer(after)) return false
  let was, is
  try {
    [was, is] = [before, after].map(side => new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(side))
  } catch {
    return false
  }
  const [old, now] = [pinned(was), pinned(is)]
  if (!old || !now) return false
  let expected = was
  let changed = 0
  for (const key of Object.keys(old)) {
    if (old[key] === now[key]) continue
    const parts = expected.split(`"${key}": "${old[key]}"`)
    if (parts.length !== 2) return false
    expected = parts.join(`"${key}": "${now[key]}"`)
    changed++
  }
  return changed > 0 && expected === is
}

/** The entries of a raw tree object, `<mode> <name>\0<id bytes>` each, or null when the bytes are not that, whole. */
export function treeEntries(tree, width) {
  if (!Buffer.isBuffer(tree) || (width !== 20 && width !== 32)) return null
  const entries = []
  for (let at = 0; at < tree.length;) {
    const [space, nul] = [tree.indexOf(0x20, at), tree.indexOf(0, at)]
    if (space === -1 || nul === -1 || space > nul || nul + 1 + width > tree.length) return null
    const mode = tree.toString('latin1', at, space)
    if (!/^[0-7]+$/.test(mode) || nul === space + 1) return null
    entries.push({ mode, name: tree.subarray(space + 1, nul), id: tree.toString('hex', nul + 1, nul + 1 + width) })
    at = nul + 1 + width
  }
  return entries
}

/**
 * `{ was, is }`, the two object ids of the one entry in which two raw trees differ, when that entry is `name` with the
 * mode `mode` as stored on both sides and every other entry is byte for byte the same; null otherwise. The modes are
 * the tree's own bytes, which a diff listing rewrites before it compares them.
 */
export function onlyChange(before, after, name, mode, width) {
  const [was, is] = [treeEntries(before, width), treeEntries(after, width)]
  if (!was || !is || was.length !== is.length) return null
  let found = null
  for (let index = 0; index < was.length; index++) {
    const [old, now] = [was[index], is[index]]
    if (old.mode === now.mode && old.id === now.id && old.name.equals(now.name)) continue
    if (found || old.mode !== mode || now.mode !== mode || !old.name.equals(Buffer.from(name)) || !now.name.equals(old.name)) return null
    found = { was: old.id, is: now.id }
  }
  return found
}

/**
 * Whether the forge's answer holds this version's own tag (ADR-147 Decision 1): one line that is a full object id, a tab
 * and exactly `refs/tags/v<version>`. `git ls-remote` also prints a ref that only ends in that text, so other lines are
 * ignored and never counted. A version of another shape, or an answer that is not a list of lines, holds no tag.
 */
function tagged(version, tags) {
  if (typeof version !== 'string' || !VERSION.test(version) || !Array.isArray(tags)) return false
  return tags.some(line => {
    if (typeof line !== 'string') return false
    const [id, name, ...more] = line.split('\t')
    return more.length === 0 && SHA.test(id) && name === `refs/tags/v${version}`
  })
}

/**
 * `{ skip, reason }` for what the command read (ADR-146 Decision 1, ADR-147 Decision 1). A fact that is absent or of another shape is a
 * reason to run the campaign, never to skip it.
 */
export function landingClass(facts) {
  const { event, ref, sha, head, parents, main, root, dir, before, after, version, tags } = facts ?? {}
  const run = reason => ({ skip: false, reason })
  if (event !== 'push') return run(`the event is ${event ?? 'unknown'}, not a push`)
  if (typeof sha !== 'string' || !SHA.test(sha)) return run('the pushed sha is not a full sha')
  if (ref !== `refs/heads/land/${sha}`) return run('the ref is not land/<the pushed sha>')
  if (head !== sha) return run('the commit checked out is not the pushed sha, or could not be read')
  // ADR-147: after the event, the ref and the commit checked out, and before anything about the commit's parents. No
  // release is cut from a version that has its tag, whatever this landing changes.
  if (tagged(version, tags)) return { skip: true, reason: `plugin version ${version} already has its tag on the forge, so no release is cut from this landing (ADR-147)` }
  if (!Array.isArray(parents) || parents.length !== 1) return run('the commit does not have exactly one parent, or its parents could not be read')
  if (typeof main !== 'string' || !SHA.test(main)) return run("main's tip could not be read from the forge")
  if (parents[0] !== main) return run("the commit's parent is not main's tip")
  const width = sha.length / 2
  if (!onlyChange(root?.[0], root?.[1], PIN_DIR, '40000', width)) return run("the commit's tree differs from its parent's in more than the catalogue's directory, or could not be read")
  if (!onlyChange(dir?.[0], dir?.[1], PIN_FILE, '100644', width)) return run("the catalogue's directory differs in more than the catalogue file, a regular file on both sides, or could not be read")
  if (!pinOnly(before, after)) return run("the catalogue file changed in more than each plugin's version, url and sha256, or could not be read")
  return { skip: true, reason: 'one commit on main changes only the pinned version, url and sha256 in the catalogue file' }
}

/** What git says here, each answer absent when its command failed. The trees are read raw, as stored. */
export function readFacts(env, cwd, spawn = spawnSync) {
  const git = args => {
    const child = spawn('git', args, { cwd, timeout: CHILD_TIMEOUT_MS, windowsHide: true, maxBuffer: 64 * 1024 * 1024 })
    return !child.error && child.status === 0 && Buffer.isBuffer(child.stdout) ? child.stdout : null
  }
  // A line git printed whole ends in a newline; an answer without one was cut short and is no answer.
  const text = args => { const out = git(args)?.toString('latin1'); return out?.endsWith('\n') ? out.slice(0, -1) : null }
  const head = text(['rev-parse', 'HEAD'])
  const listed = text(['rev-list', '--parents', '-n', '1', 'HEAD'])?.split(' ') ?? null
  const parents = listed && listed[0] === head ? listed.slice(1) : null
  const remote = text(['ls-remote', 'origin', 'refs/heads/main'])?.split('\n') ?? []
  const named = remote.length === 1 ? /^([0-9a-f]+)\trefs\/heads\/main$/.exec(remote[0]) : null
  const one = parents?.length === 1 && head && SHA.test(head) && SHA.test(parents[0])
  const tree = id => git(['cat-file', 'tree', id])
  const root = one ? [tree(parents[0]), tree(head)] : null
  const top = root && onlyChange(root[0], root[1], PIN_DIR, '40000', head.length / 2)
  const dir = top ? [tree(top.was), tree(top.is)] : null
  const file = dir && onlyChange(dir[0], dir[1], PIN_FILE, '100644', head.length / 2)
  return {
    event: env.GITHUB_EVENT_NAME, ref: env.GITHUB_REF, sha: env.GITHUB_SHA, head, parents, main: named ? named[1] : null,
    root, dir, before: file ? git(['cat-file', 'blob', file.was]) : null, after: file ? git(['cat-file', 'blob', file.is]) : null,
  }
}

/**
 * The plugin version at the commit checked out and what the forge lists for its tag (ADR-147 Decision 1), each absent
 * when its command failed, timed out or was cut short. The manifest is the blob's bytes, strict UTF-8 JSON with or
 * without a final newline; the forge is asked only for a version of the released shape, and its answer is whole lines.
 */
export function readRelease(cwd, spawn = spawnSync) {
  const answered = args => {
    const child = spawn('git', args, { cwd, timeout: CHILD_TIMEOUT_MS, windowsHide: true, maxBuffer: 64 * 1024 * 1024 })
    return child.error || child.status !== 0 || !Buffer.isBuffer(child.stdout) ? null : child.stdout
  }
  const none = { version: null, tags: null }
  const manifest = answered(['cat-file', 'blob', `HEAD:${MANIFEST}`])
  if (!manifest) return none
  let version
  try {
    version = JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(manifest)).version
  } catch {
    return none
  }
  if (typeof version !== 'string' || !VERSION.test(version)) return none
  const listed = answered(['ls-remote', 'origin', `refs/tags/v${version}`])?.toString('latin1')
  return { version, tags: listed?.endsWith('\n') ? listed.slice(0, -1).split('\n') : null }
}

if (isMainModule(import.meta.url)) {
  const answer = landingClass({ ...readFacts(process.env, process.cwd()), ...readRelease(process.cwd()) })
  console.log(`landing-class: ${answer.skip ? 'skip' : 'run'} the mutation campaign: ${answer.reason}`)
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `skip=${answer.skip ? 1 : 0}\n`)
}
