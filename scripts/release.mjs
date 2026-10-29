#!/usr/bin/env node
// release.mjs — CLAUDE.md §13's release chain as one command, for this repository only (ADR-100 T3).
//
// Every step is decided from what can be observed now, never from a state file, so a second run resumes where the first
// stopped: the clean tree, the version against the tags, a full `qh-check` taken here on a machine that was not contended
// across it, the dead-code scan, the push, the push's own run, the dispatched campaign, `release-evidence`, the tag.
//
// Usage: node scripts/release.mjs [--wait-max <minutes>] [--notes-file <path>]
//
// Exit codes:
//   0  released and its verified bundle is advertised by the public marketplace
//   1  a step failed: a red check, a dead-code finding, a push or a gh call that failed, release-evidence exit 1
//   2  a step needs an action this command does not take: an unclean tree, a version to bump, release-evidence's
//      UNPROVEN (an outside run or a review to get), a tag without a release, or a catalogue pin still to promote
//   3  a wait reached its deadline; it names what it waited for, and running again resumes
import { spawnSync } from 'node:child_process'
import { isMainModule } from '../plugin/scripts/main-module.mjs'
import { contention, sampleLoad } from '../plugin/scripts/load.mjs'
import { land } from './land.mjs'
import { CORE_TARGETS, coreAsset } from '../plugin/scripts/core-assets.mjs'
import { PLUGIN_ARCHIVE, PLUGIN_RECEIPT } from './build-plugin.mjs'

const MANIFEST = 'plugin/.claude-plugin/plugin.json'
const POLL_MS = 60_000
// Every child's bound: the full check and the dead-code scan are the longest, well under an hour (CLAUDE.md §2).
// ADR-115: after the check, the load is sampled this often, for at most this long, until it is at or below the core count. The
// 1-minute average keeps about 2% of a load that stopped 4 minutes earlier, so what is left at the bound is other work.
const SETTLE_POLL_MS = 30_000
const SETTLE_MS = 240_000
const CHILD_TIMEOUT_MS = 3_600_000
const runsOf = sha => ['run', 'list', '--commit', sha, '--workflow', 'selftest.yml', '--json', 'databaseId,event,status,conclusion,headSha,headBranch,createdAt']
const DISPATCHES = ['run', 'list', '--workflow', 'selftest.yml', '--event', 'workflow_dispatch', '--json', 'status,headSha', '--limit', '20']

function parsed(text) {
  try { return JSON.parse(text) } catch { return null }
}

/**
 * The chain, with its world as seams: `exec(cmd, args, { stream })` answers `{ status, stdout }`, `now` and `sleep` are the
 * clock. Pure of everything else, so a test drives every branch with a fake git and gh (tests/release.test.mjs).
 */
export function release({ exec, log = console.log, now = Date.now, sleep, waitMaxMinutes = 90, notesFile = null, load = () => sampleLoad(), protection }) {
  const ran = (cmd, args, stream = false) => exec(cmd, args, { stream, timeout: CHILD_TIMEOUT_MS })
  const text = (cmd, args) => {
    const answer = ran(cmd, args)
    return answer.status === 0 ? String(answer.stdout ?? '').trim() : null
  }
  // One poll at most a minute, and a deadline per wait: past it the wait is said and the run exits 3. Per wait, not per run
  // (ADR-126 T5): one bound over the landing and the campaign together ran out on 3.8.52 with nothing wrong.
  const waitFor = (what, probe) => {
    const deadline = now() + waitMaxMinutes * 60_000
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
  if (porcelain) {
    // An attestation attest-import wrote and nobody committed: on a sha already on main it is this release's evidence, and
    // nothing is pushed after the landing for git's pre-push hook to see (ADR-126 T4); before the landing it is a change.
    const attestations = porcelain.split('\n').every(line => /^\?\? docs\/corpus-reports\/[^/]+\.json$/.test(line))
    const landed = attestations && ran('git', ['merge-base', '--is-ancestor', sha, 'origin/main']).status === 0
    // Each one must be a file attest-import would have written, digests checked against its commit: an arbitrary JSON in
    // docs/corpus-reports is not evidence (the Codex review of v3.8.52..2ad118d0).
    const unverified = landed ? porcelain.split('\n').map(line => line.slice(3))
      .filter(file => ran('node', ['scripts/attest-import.mjs', '--verify', file]).status !== 0) : []
    if (unverified.length) {
      log(`release: ${unverified.join(', ')} is not an attestation attest-import would file ${at}; move it aside, then run again`)
      return 2
    }
    if (!landed) {
      log(attestations
        ? `release: the working tree holds an uncommitted attestation ${at} before ${sha} has landed; commit it (\`qh-check --fast --commit\`) or move it aside, then run again`
        : `release: the working tree is not clean ${at}; commit or stash, then run again`)
      return 2
    }
  }
  const version = parsed(text('git', ['show', `HEAD:${MANIFEST}`]) ?? '')?.version
  if (typeof version !== 'string' || !/^\d+\.\d+\.\d+$/.test(version)) { log(`release: ${MANIFEST} names no version ${at}`); return 1 }
  const tag = `v${version}`
  const catalogue = () => {
    const checked = ran('node', ['scripts/marketplace-source.mjs', version, '--check'])
    for (const line of String(checked.stdout ?? '').trim().split('\n')) if (line) log(line)
    if (checked.status === 0) return 0
    log('release: ' + tag + ' is published; verify a cold archive install, then generate and land the catalogue pin with: node scripts/marketplace-source.mjs ' + version)
    if (checked.stderr) log(String(checked.stderr).trim())
    return checked.status === 2 ? 2 : 1
  }
  // The forge's tags too: `gh release create` makes its tag there, and a clone that never fetched it reads the version as
  // unreleased (an advisor's review of e6a00957). The branch is fetched in the same call, for the push decision below.
  const fetched = ran('git', ['fetch', '-q', '--tags', 'origin', 'main']).status
  if (fetched !== 0) { log(`release: git fetch exited ${fetched} ${at}; whether ${tag} exists on the forge could not be read`); return 1 }
  // A catalogue that could not be read is not an empty one (the Codex review of ce54814c).
  const listed = text('git', ['tag', '--list', 'v*'])
  if (listed === null) { log(`release: git tag --list failed ${at}; the tags could not be read`); return 1 }
  const tags = listed.split('\n').filter(Boolean)
  if (tags.includes(tag)) {
    const view = ran('gh', ['release', 'view', tag, '--json', 'tagName'])
    if (view.status === 0) { log(`release: ${tag} is already released`); return catalogue() }
    // Only gh's own "release not found" is absence; an auth or network failure is a question nobody answered.
    if (!/release not found/i.test(String(view.stderr ?? ''))) {
      log(`release: gh release view ${tag} failed (${String(view.stderr ?? '').trim().split('\n')[0] || `exit ${view.status}`}); whether it is released could not be read`)
      return 1
    }
    log(`release: ${tag} is already a tag and has no release; bump ${MANIFEST} past it, or release that tag by hand`)
    return 2
  }


  // What release-evidence asks of this clone rather than of CI, asked before anything is checked or leaves this machine
  // (BACKLOG §406). Only the review question since ADR-126 T4: the outside run is asked for once the landing's run is green.
  const local = ran('node', ['scripts/release-evidence.mjs', '--review', sha])
  if (local.status !== 0) {
    for (const line of String(local.stdout ?? '').trim().split('\n')) if (line) log(line)
    log(`release: release-evidence --review exited ${local.status} ${at}; get what it names and commit it, then run again; nothing was checked or pushed`)
    return local.status === 1 ? 1 : 2
  }
  // The full check, then the dead-code scan, both before anything leaves this machine. The check runs here once per release
  // and is never reused (one push per release, one full check right before it: the owner, 2026-10-13), and its pass counts
  // only if the machine was not contended across it, sampled with qh-check's own `contention`. v3.8.25 was pushed on a pass
  // qh-check had itself recorded as unattributable (CLAUDE.md §18, BACKLOG). A contended pass is taken again once the load is
  // below the core count; a second one stops the release with nothing pushed. A load that cannot be read is not contended.
  // ADR-115: the sample at exit held the run's own load, so every pass on a busy machine read as contended. The end sample
  // is now taken once that load has decayed: the load is read every SETTLE_POLL_MS until it is at or below the core count, and
  // a load still above it at SETTLE_MS is other work.
  const quietNow = () => {
    const sample = load()
    return contention(sample.load, sample.load, sample.cores) !== true
  }
  // A sample is read only while the bound holds: a sleep that resumed late took one outside it (the Codex review of 0c137b89).
  const settled = () => {
    const until = now() + SETTLE_MS
    for (;;) {
      if (now() > until) return false
      if (quietNow()) return true
      sleep(SETTLE_POLL_MS)
    }
  }
  const fullCheck = () => {
    const start = load()
    const status = ran('node', ['plugin/scripts/qh-check.mjs', '--again'], true).status
    // A start that cannot be read leaves the pair unjudged, which is not contended, as it was before ADR-115: a settle sample
    // alone is half of a pair (the Codex review of 0c137b89).
    const atStart = contention(start.load, start.load, start.cores)
    return { status, contended: status === 0 && atStart !== null && (atStart || !settled()) }
  }
  let check = fullCheck()
  if (check.status === 0 && check.contended) {
    log(`release: the check passed on a contended machine ${at}; it is taken again once the load is below the core count`)
    const quiet = waitFor('the load to fall below the core count', () => {
      const sample = load()
      return contention(sample.load, sample.load, sample.cores) === false
    })
    if (!quiet) return 3
    check = fullCheck()
    if (check.status === 0 && check.contended) {
      log(`release: the check passed on a contended machine twice ${at}; nothing was pushed: run again when it is quieter`)
      return 2
    }
  }
  if (check.status !== 0) { log(`release: qh-check exited ${check.status} ${at}; nothing was pushed`); return 1 }
  const scan = ran('bash', ['scripts/dead-code-scan.sh'], true).status
  if (scan !== 0) { log(`release: the dead-code scan exited ${scan}${scan === 3 ? ' (a scanner could not run: UNPROVEN)' : ''} ${at}; nothing was pushed`); return 1 }

  // ADR-118: main takes only a sha its required checks passed at, so the sha lands through land/<sha> first. Whether main
  // already has it is land's question, asked once: a second copy here left the first one untested.
  const landed = land({ exec, log, now, sleep, deadline: now() + waitMaxMinutes * 60_000, protection })
  if (landed !== 0) { log(`release: land exited ${landed} ${at}; nothing was dispatched`); return landed }

  // ADR-126 T5: the landing's own push to land/<sha> is the release's run, and the workflow runs it as the full campaign
  // (T1), so nothing is dispatched for it; its every job is waited for, the mutation shards included, which land does not
  // wait for. A forge that requires no check takes main straight (ADR-118) and leaves no landing run: only then is the
  // campaign dispatched, on main, unless one already was.
  const listRuns = () => parsed(text('gh', runsOf(sha)) ?? '') ?? []
  const landingRun = run => run.event === 'push' && run.headBranch === `land/${sha}`
  const dispatchedRun = run => run.event === 'workflow_dispatch' && run.headBranch === 'main'
  const releaseRun = run => landingRun(run) || dispatchedRun(run)
  if (!listRuns().some(releaseRun)) {
    // A second dispatch cancels the first: the concurrency group keys on the event (.github/workflows/selftest.yml:20-22).
    const quiet = waitFor('the other dispatched campaign on main to finish', () => {
      const busy = parsed(text('gh', DISPATCHES) ?? '')
      return Array.isArray(busy) && !busy.some(run => run.status !== 'completed')
    })
    if (!quiet) return 3
    const dispatched = ran('gh', ['workflow', 'run', 'selftest.yml', '--ref', 'main']).status
    if (dispatched !== 0) { log(`release: gh workflow run exited ${dispatched} ${at}`); return 1 }
  }
  const done = waitFor(`every job of the release run of ${sha}`, () => {
    const run = listRuns().find(releaseRun)
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
    // ADR-126 T5: the outside run is asked for once the landing's run is green, which is now. A script cannot reach another
    // session, so it says what to send (CLAUDE.md §18), and the release resumes when the attestation is filed.
    if (/nobody outside has run the readers/.test(String(evidence.stdout ?? ''))) {
      log(`release: ask an outside runner, on a corpus this repository does not own, to run at ${sha}: git fetch origin `
        + `land/${sha} (or main), check it out, then from their repository's root \`node <checkout>/plugin/scripts/corpus-probe.mjs `
        + `--json > new.json\` and \`node <checkout>/plugin/scripts/corpus-probe.mjs --attest <label> new.json --since `
        + `<their report at the last tag>\`. File what they paste with \`node scripts/attest-import.mjs <message>\`, then run again.`)
    }
    return evidence.status === 1 ? 1 : 2
  }
  const prepared = ran('node', ['scripts/release-assets.mjs', String(done.databaseId), sha])
  const assets = prepared.status === 0 ? parsed(prepared.stdout) : null
  const expectedAssets = [...CORE_TARGETS.map(([os, arch]) => coreAsset(os, arch)), 'SHA256SUMS.txt', PLUGIN_ARCHIVE, PLUGIN_RECEIPT].sort()
  const names = Array.isArray(assets) && assets.every(file => typeof file === 'string')
    ? assets.map(file => file.split(/[\\/]/).pop()).sort() : []
  if (JSON.stringify(names) !== JSON.stringify(expectedAssets)) {
    log(`release: native assets could not be verified ${at}: ${String(prepared.stderr ?? '').trim() || 'the complete asset set was not returned'}`)
    return 1
  }
  const notes = notesFile ? ['--notes-file', notesFile] : ['--generate-notes']
  const created = ran('gh', ['release', 'create', tag, '--target', sha, '--latest', ...notes, ...assets], true).status
  if (created !== 0) { log(`release: gh release create exited ${created} for ${tag} at ${sha}`); return 1 }
  log(`release: ${tag} released at ${sha}`)
  return catalogue()
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
    return { status: run.error ? 1 : run.status ?? 1, stdout: run.stdout ?? '', stderr: run.stderr ?? '' }
  }
  const pause = new Int32Array(new SharedArrayBuffer(4))
  process.exit(release({
    exec, waitMaxMinutes: Number.isFinite(minutes) && minutes > 0 ? minutes : 90, notesFile: option(argv, '--notes-file') ?? null,
    sleep: ms => Atomics.wait(pause, 0, 0, ms),
  }))
}
