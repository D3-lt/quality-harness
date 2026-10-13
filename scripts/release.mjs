#!/usr/bin/env node
// release.mjs — CLAUDE.md §13's release chain as one command, for this repository only (ADR-100 T3).
//
// Every step is decided from what can be observed now, never from a state file, so a second run resumes where the first
// stopped: the clean tree, the version against the tags, a full `qh-check` pass (qh-check reuses one already taken on this
// tree, ADR-081), the dead-code scan, the push, the push's own run, the dispatched campaign, `release-evidence`, the tag.
//
// Usage: node scripts/release.mjs [--wait-max <minutes>] [--notes-file <path>]
//
// Exit codes:
//   0  released (or already released at this version)
//   1  a step failed: a red check, a dead-code finding, a push or a gh call that failed, release-evidence exit 1
//   2  a step needs an action this command does not take: an unclean tree, a version to bump, release-evidence's
//      UNPROVEN (an outside run or a review to get), a tag without a release
//   3  a wait reached its deadline; it names what it waited for, and running again resumes
import { spawnSync } from 'node:child_process'
import { isMainModule } from '../plugin/scripts/main-module.mjs'

const MANIFEST = 'plugin/.claude-plugin/plugin.json'
const POLL_MS = 60_000
// Every child's bound: the full check and the dead-code scan are the longest, well under an hour (CLAUDE.md §2).
const CHILD_TIMEOUT_MS = 3_600_000
const runsOf = sha => ['run', 'list', '--commit', sha, '--workflow', 'selftest.yml', '--json', 'databaseId,event,status,conclusion,headSha']
const DISPATCHES = ['run', 'list', '--workflow', 'selftest.yml', '--event', 'workflow_dispatch', '--json', 'status,headSha', '--limit', '20']

function parsed(text) {
  try { return JSON.parse(text) } catch { return null }
}

/**
 * The chain, with its world as seams: `exec(cmd, args, { stream })` answers `{ status, stdout }`, `now` and `sleep` are the
 * clock. Pure of everything else, so a test drives every branch with a fake git and gh (tests/release.test.mjs).
 */
export function release({ exec, log = console.log, now = Date.now, sleep, waitMaxMinutes = 90, notesFile = null }) {
  const ran = (cmd, args, stream = false) => exec(cmd, args, { stream, timeout: CHILD_TIMEOUT_MS })
  const text = (cmd, args) => {
    const answer = ran(cmd, args)
    return answer.status === 0 ? String(answer.stdout ?? '').trim() : null
  }
  const deadline = now() + waitMaxMinutes * 60_000
  // One poll at most a minute, and a deadline: past it the wait is said and the run exits 3.
  const waitFor = (what, probe) => {
    for (;;) {
      const found = probe()
      if (found) return found
      if (now() >= deadline) {
        log(`release: waited ${waitMaxMinutes} min for ${what} and it did not come; run again to resume`)
        return null
      }
      sleep(POLL_MS)
    }
  }

  // The sha, read once and named in every later step.
  const sha = text('git', ['rev-parse', 'HEAD'])
  if (!/^[0-9a-f]{40}$/.test(sha ?? '')) { log('release: HEAD could not be read as a full sha'); return 1 }
  const at = `at ${sha}`
  const porcelain = text('git', ['status', '--porcelain'])
  if (porcelain === null) { log(`release: git status failed ${at}`); return 1 }
  if (porcelain) { log(`release: the working tree is not clean ${at}; commit or stash, then run again`); return 2 }
  const version = parsed(text('git', ['show', `HEAD:${MANIFEST}`]) ?? '')?.version
  if (typeof version !== 'string' || !/^\d+\.\d+\.\d+$/.test(version)) { log(`release: ${MANIFEST} names no version ${at}`); return 1 }
  const tag = `v${version}`
  const tags = (text('git', ['tag', '--list', 'v*']) ?? '').split('\n').filter(Boolean)
  if (tags.includes(tag)) {
    if (ran('gh', ['release', 'view', tag, '--json', 'tagName']).status === 0) { log(`release: ${tag} is already released`); return 0 }
    log(`release: ${tag} is already a tag and has no release; bump ${MANIFEST} past it, or release that tag by hand`)
    return 2
  }

  // The full check, then the dead-code scan, both before anything leaves this machine.
  const check = ran('node', ['plugin/scripts/qh-check.mjs'], true).status
  if (check !== 0) { log(`release: qh-check exited ${check} ${at}; nothing was pushed`); return 1 }
  const scan = ran('bash', ['scripts/dead-code-scan.sh'], true).status
  if (scan !== 0) { log(`release: the dead-code scan exited ${scan}${scan === 3 ? ' (a scanner could not run: UNPROVEN)' : ''} ${at}; nothing was pushed`); return 1 }

  ran('git', ['fetch', '-q', 'origin', 'main'])
  if (ran('git', ['merge-base', '--is-ancestor', sha, 'origin/main']).status !== 0) {
    const pushed = ran('git', ['push', 'origin', 'main'], true).status
    if (pushed !== 0) { log(`release: git push exited ${pushed} ${at}`); return 1 }
  }

  // The push's own run must exist before the dispatch, or the dispatch can be the newer of the two by a second (BACKLOG §159).
  const listRuns = () => parsed(text('gh', runsOf(sha)) ?? '') ?? []
  const withPush = waitFor(`the push run of ${sha}`, () => {
    const runs = listRuns()
    return runs.some(run => run.event === 'push') ? runs : null
  })
  if (!withPush) return 3
  if (!withPush.some(run => run.event === 'workflow_dispatch')) {
    // A second dispatch cancels the first: the concurrency group keys on the event (.github/workflows/selftest.yml:19-21).
    const quiet = waitFor('the other dispatched campaign on main to finish', () => {
      const busy = parsed(text('gh', DISPATCHES) ?? '')
      return Array.isArray(busy) && !busy.some(run => run.status !== 'completed')
    })
    if (!quiet) return 3
    const dispatched = ran('gh', ['workflow', 'run', 'selftest.yml', '--ref', 'main']).status
    if (dispatched !== 0) { log(`release: gh workflow run exited ${dispatched} ${at}`); return 1 }
  }
  const done = waitFor(`every job of the dispatched campaign of ${sha}`, () => {
    const run = listRuns().find(row => row.event === 'workflow_dispatch')
    return run?.status === 'completed' ? run : null
  })
  if (!done) return 3

  let evidence = null
  const cleared = waitFor(`release-evidence to say the run of ${sha} is finished`, () => {
    evidence = ran('node', ['scripts/release-evidence.mjs', sha])
    return evidence.status === 3 ? null : evidence
  })
  if (!cleared) return 3
  for (const line of String(evidence.stdout ?? '').trim().split('\n')) if (line) log(line)
  if (evidence.status !== 0) {
    log(`release: release-evidence exited ${evidence.status} for ${sha}; ${tag} was not tagged`)
    return evidence.status === 1 ? 1 : 2
  }
  const notes = notesFile ? ['--notes-file', notesFile] : ['--generate-notes']
  const created = ran('gh', ['release', 'create', tag, '--target', sha, '--latest', ...notes], true).status
  if (created !== 0) { log(`release: gh release create exited ${created} for ${tag} at ${sha}`); return 1 }
  log(`release: ${tag} released at ${sha}`)
  return 0
}

function option(argv, name) {
  const index = argv.indexOf(name)
  return index >= 0 ? argv[index + 1] : undefined
}

if (isMainModule(import.meta.url)) {
  const argv = process.argv.slice(2)
  const known = new Set(['--wait-max', '--notes-file'])
  const unknown = argv.filter((word, index) => word.startsWith('--') && !known.has(word) && !known.has(argv[index - 1]))
  if (unknown.length || argv.includes('--help')) {
    process.stderr.write('usage: node scripts/release.mjs [--wait-max <minutes>] [--notes-file <path>]\n')
    process.exit(argv.includes('--help') ? 0 : 2)
  }
  const minutes = Number(option(argv, '--wait-max') ?? 90)
  const exec = (cmd, args, { stream, timeout }) => {
    const run = spawnSync(cmd, args, { encoding: 'utf8', stdio: stream ? 'inherit' : ['ignore', 'pipe', 'pipe'], timeout, windowsHide: true })
    return { status: run.error ? 1 : run.status ?? 1, stdout: run.stdout ?? '' }
  }
  const pause = new Int32Array(new SharedArrayBuffer(4))
  process.exit(release({
    exec, waitMaxMinutes: Number.isFinite(minutes) && minutes > 0 ? minutes : 90, notesFile: option(argv, '--notes-file') ?? null,
    sleep: ms => Atomics.wait(pause, 0, 0, ms),
  }))
}
