#!/usr/bin/env node
// landing-class.mjs — ADR-146: whether this landing only re-pins the catalogue, so its mutation campaign may be skipped.
//
// The seed job of .github/workflows/selftest.yml runs it at the commit checked out with its parent. It answers "skip" only
// for a push to land/<sha> whose one commit sits on main's tip and changes nothing but the values of `version`, `url` and
// `sha256` in .claude-plugin/marketplace.json. Everything else is "run", and so is everything it could not read: a
// command that failed or timed out, output that ended early, a state nobody listed (CLAUDE.md §16).
//
// It prints one line, appends `skip=1` or `skip=0` to the file GITHUB_OUTPUT names, and exits 0 whatever it found: the
// answer is the output, and a campaign that runs needlessly costs minutes while a job that fails here would skip it.
import { spawnSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'
import { isMainModule } from '../plugin/scripts/main-module.mjs'

const PIN_DIR = '.claude-plugin'
const PIN_FILE = 'marketplace.json'
// The one line shape a pin may change: a pinned key and a string value of printable ASCII with no quote or backslash, the
// indentation and comma kept. A control byte in a value is not a string value (the Codex review of 5aaf5d1bd..5be9e6fa7).
const PINNED_LINE = /^([ \t]*)"(version|url|sha256)": "[ !#-[\]-~]*"(,?)$/
const SHA = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/
const CHILD_TIMEOUT_MS = 60_000

/** The catalogue as parsed, without the three values a pin sets in each plugin entry; null when it is not that JSON. */
function unpinned(bytes) {
  try {
    const catalogue = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
    if (!Array.isArray(catalogue?.plugins)) return null
    for (const plugin of catalogue.plugins) {
      if (plugin === null || typeof plugin !== 'object' || plugin.source === null || typeof plugin.source !== 'object') return null
      delete plugin.version
      delete plugin.source.url
      delete plugin.source.sha256
    }
    return JSON.stringify(catalogue)
  } catch {
    return null
  }
}

/**
 * Whether two versions of the catalogue file differ only in a pin. Two readings, and both must hold: as bytes, line for
 * line, only lines of the pinned shape differ; as JSON, the two are equal once each plugin entry's `version`,
 * `source.url` and `source.sha256` are set aside. The second is what tells a pin's `version` from a field of the same
 * name anywhere else in the file (the Codex verification of 5aaf5d1bd..4f8ee9d88).
 */
export function pinOnly(before, after) {
  if (!Buffer.isBuffer(before) || !Buffer.isBuffer(after)) return false
  const [was, is] = [before, after].map(side => side.toString('latin1').split('\n'))
  if (was.length !== is.length) return false
  let changed = 0
  for (let index = 0; index < was.length; index++) {
    if (was[index] === is[index]) continue
    const [old, now] = [PINNED_LINE.exec(was[index]), PINNED_LINE.exec(is[index])]
    if (!old || !now || old[1] !== now[1] || old[2] !== now[2] || old[3] !== now[3]) return false
    changed++
  }
  if (changed === 0) return false
  const [rest, kept] = [unpinned(before), unpinned(after)]
  return rest !== null && rest === kept
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
 * `{ skip, reason }` for what the command read (ADR-146 Decision 1). A fact that is absent or of another shape is a
 * reason to run the campaign, never to skip it.
 */
export function landingClass(facts) {
  const { event, ref, sha, head, parents, main, root, dir, before, after } = facts ?? {}
  const run = reason => ({ skip: false, reason })
  if (event !== 'push') return run(`the event is ${event ?? 'unknown'}, not a push`)
  if (typeof sha !== 'string' || !SHA.test(sha)) return run('the pushed sha is not a full sha')
  if (ref !== `refs/heads/land/${sha}`) return run('the ref is not land/<the pushed sha>')
  if (head !== sha) return run('the commit checked out is not the pushed sha, or could not be read')
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

if (isMainModule(import.meta.url)) {
  const answer = landingClass(readFacts(process.env, process.cwd()))
  console.log(`landing-class: ${answer.skip ? 'skip' : 'run'} the mutation campaign: ${answer.reason}`)
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `skip=${answer.skip ? 1 : 0}\n`)
}
