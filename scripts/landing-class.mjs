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

const PIN = Buffer.from('.claude-plugin/marketplace.json')
const PIN_DIR = Buffer.from('.claude-plugin')
// The one line shape a pin may change: a pinned key and a string value of printable ASCII with no quote or backslash, the
// indentation and comma kept. A control byte in a value is not a string value (the Codex review of 5aaf5d1bd..5be9e6fa7).
const PINNED_LINE = /^([ \t]*)"(version|url|sha256)": "[ !#-[\]-~]*"(,?)$/
const SHA = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/
const CHILD_TIMEOUT_MS = 60_000

/** Whether two versions of the catalogue file differ only in the values of the pinned keys, line for line, as bytes. */
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
  // The file after the pin is still the JSON it was: strict UTF-8, and it parses.
  try { JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(after)) } catch { return false }
  return true
}

/**
 * `{ skip, reason }` for what the command read (ADR-146 Decision 1). A fact that is absent or of another shape is a
 * reason to run the campaign, never to skip it.
 */
export function landingClass(facts) {
  const { event, ref, sha, head, parents, main, entries, before, after } = facts ?? {}
  const run = reason => ({ skip: false, reason })
  if (event !== 'push') return run(`the event is ${event ?? 'unknown'}, not a push`)
  if (typeof sha !== 'string' || !SHA.test(sha)) return run('the pushed sha is not a full sha')
  if (ref !== `refs/heads/land/${sha}`) return run('the ref is not land/<the pushed sha>')
  if (head !== sha) return run('the commit checked out is not the pushed sha, or could not be read')
  if (!Array.isArray(parents) || parents.length !== 1) return run('the commit does not have exactly one parent, or its parents could not be read')
  if (typeof main !== 'string' || !SHA.test(main)) return run("main's tip could not be read from the forge")
  if (parents[0] !== main) return run("the commit's parent is not main's tip")
  if (!Array.isArray(entries)) return run('what the commit changed could not be read')
  // With trees listed (`-t`) a pin is exactly two entries: the catalogue's directory and the file in it. A tree added or
  // removed beside them, an empty one included, is a third entry, where `-r` alone lists nothing for it.
  if (entries.length !== 2) return run(`the commit changes ${entries.length} tree entries, not the catalogue file and its directory alone`)
  const [dir, entry] = entries
  if (!Buffer.isBuffer(dir?.path) || !dir.path.equals(PIN_DIR) || dir.status !== 'M' || dir.before !== '040000' || dir.after !== '040000') return run("the first changed entry is not the catalogue's directory, modified")
  if (!Buffer.isBuffer(entry?.path) || !entry.path.equals(PIN)) return run('the commit changes another path than the catalogue file')
  if (entry.status !== 'M' || entry.before !== '100644' || entry.after !== '100644') return run('the catalogue file was not modified as a regular file with its mode kept')
  if (!pinOnly(before, after)) return run('the catalogue file changed in more than the values of version, url and sha256, or could not be read')
  return { skip: true, reason: 'one commit on main changes only the values of version, url and sha256 in the catalogue file' }
}

/** The entries of `git diff-tree -r -t --raw -z`, or null when the output is not that, whole. A status keeps its score. */
export function rawEntries(output) {
  if (!Buffer.isBuffer(output)) return null
  if (output.length === 0) return []
  if (output[output.length - 1] !== 0) return null
  const fields = []
  for (let start = 0, end; (end = output.indexOf(0, start)) !== -1; start = end + 1) fields.push(output.subarray(start, end))
  if (fields.length % 2) return null
  const entries = []
  for (let index = 0; index < fields.length; index += 2) {
    const meta = /^:(\d{6}) (\d{6}) (?:[0-9a-f]{40} [0-9a-f]{40}|[0-9a-f]{64} [0-9a-f]{64}) ([A-Z]\d*)$/.exec(fields[index].toString('latin1'))
    if (!meta || fields[index + 1].length === 0) return null
    entries.push({ before: meta[1], after: meta[2], status: meta[3], path: fields[index + 1] })
  }
  return entries
}

/** What git says here, each answer absent when its command failed. */
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
  return {
    event: env.GITHUB_EVENT_NAME, ref: env.GITHUB_REF, sha: env.GITHUB_SHA, head, parents, main: named ? named[1] : null,
    entries: one ? rawEntries(git(['diff-tree', '-r', '-t', '--raw', '-z', '--no-renames', '--ignore-submodules=none', parents[0], head])) : null,
    before: one ? git(['cat-file', 'blob', `${parents[0]}:${PIN}`]) : null,
    after: one ? git(['cat-file', 'blob', `${head}:${PIN}`]) : null,
  }
}

if (isMainModule(import.meta.url)) {
  const answer = landingClass(readFacts(process.env, process.cwd()))
  console.log(`landing-class: ${answer.skip ? 'skip' : 'run'} the mutation campaign: ${answer.reason}`)
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `skip=${answer.skip ? 1 : 0}\n`)
}
