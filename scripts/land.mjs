#!/usr/bin/env node
// land.mjs — ADR-118: a sha reaches main only after the forge's required checks passed at it, for this repository only.
//
// The forge refuses a push to main whose sha has not passed main's required checks. So the sha is pushed to land/<sha>
// first, CI runs there, and main is fast-forwarded to that same sha once each required check-run at it has succeeded.
// The sha on main is the sha CI ran: no merge commit and no rewrite, so every record citing it still names it.
//
// Usage: node scripts/land.mjs [--wait-max <minutes>] [--dry-run]
//
// Exit codes:
//   0  landed, already on main, or (--dry-run) it would land
//   1  a step failed: the forge or the workflow could not be read, a required check no job declares, a required check
//      that did not succeed, a push that failed or left the forge's main elsewhere
//   2  an action this command does not take: HEAD is not the main branch, or local main moved during the wait
//   3  the wait reached its deadline; it names what it waited for, and running again resumes
import { spawnSync } from 'node:child_process'
import { isMainModule } from '../plugin/scripts/main-module.mjs'
import { declaredJobs, mainProtection } from './release-evidence.mjs'

const POLL_MS = 60_000
// A push runs git's pre-push hook (ADR-066), which reads a ledger and runs no check; the bound is generous, not tight.
const CHILD_TIMEOUT_MS = 600_000

function parsed(text) {
  try { return JSON.parse(text) } catch { return null }
}

/** The required contexts no job of the workflow declares: a check that can never arrive closes main to every landing. */
export function undeclared(required, declared) {
  const jobs = new Set(declared ?? [])
  return required.map(check => check.context).filter(context => !jobs.has(context))
}

/** JSON with every object's keys in order: the forge keeps its own key order, and that is not a difference. */
function canonical(value) {
  return JSON.stringify(value, (_, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : v))
}

/**
 * ADR-118 T2: how the ruleset the forge applied differs from the committed one, one line per difference. The file's
 * fields must be on the forge as written, bypass actors included; the forge's own fields (id, source, links) are not
 * compared. Rules are matched by type both ways, and the required checks as a set of context and app, in any order.
 */
export function rulesetDiffers(committed, applied) {
  if (!applied || typeof applied !== 'object') return ['the applied ruleset could not be read']
  const differs = []
  for (const key of ['name', 'target', 'enforcement', 'conditions', 'bypass_actors']) {
    if (canonical(committed[key]) !== canonical(applied[key])) differs.push(`${key} is ${canonical(applied[key])}, not ${canonical(committed[key])}`)
  }
  const byType = rules => new Map((Array.isArray(rules) ? rules : []).map(rule => [rule?.type, rule]))
  const mine = byType(committed.rules)
  const theirs = byType(applied.rules)
  const checks = rule => (rule.parameters?.required_status_checks ?? []).map(check => `${check.context}@${check.integration_id ?? 'any'}`).sort()
  for (const type of new Set([...mine.keys(), ...theirs.keys()])) {
    if (!mine.has(type) || !theirs.has(type)) { differs.push(`rule ${type} is ${mine.has(type) ? 'missing on the forge' : 'on the forge and not in the file'}`); continue }
    const [ours, forge] = [mine.get(type), theirs.get(type)]
    if (canonical(checks(ours)) !== canonical(checks(forge))) differs.push(`rule ${type} requires ${checks(forge).join(', ')}, not ${checks(ours).join(', ')}`)
    for (const [key, value] of Object.entries(ours.parameters ?? {})) {
      if (key !== 'required_status_checks' && canonical(value) !== canonical(forge.parameters?.[key])) differs.push(`rule ${type} has ${key} ${canonical(forge.parameters?.[key])}, not ${canonical(value)}`)
    }
  }
  return differs
}

/**
 * Each required context's verdict at the sha (ADR-118 Decision 2). Only check-runs with the context's name and its
 * integration count; the newest by `started_at`, then id, decides. `missing` and `pending` are waits, `success` is a
 * pass, and any other conclusion stops, `skipped` and `neutral` included: the forge counts both as passing, and a
 * landing does not.
 */
export function verdicts(required, runs) {
  const at = run => {
    const t = Date.parse(String(run.started_at ?? ''))
    return Number.isNaN(t) ? -Infinity : t
  }
  const newer = (a, b) => (at(a) !== at(b) ? at(a) > at(b) : Number(a.id) > Number(b.id))
  return required.map(({ context, integration }) => {
    const theirs = runs.filter(run => run?.name === context && (integration == null || run?.app?.id === integration))
    const newest = theirs.reduce((best, run) => (!best || newer(run, best) ? run : best), null)
    const verdict = !newest ? 'missing' : newest.status !== 'completed' ? 'pending' : String(newest.conclusion)
    return { context, verdict }
  })
}

/**
 * The landing, with its world as seams like `release` (scripts/release.mjs): `exec(cmd, args, { stream })` answers
 * `{ status, stdout }`, `now` and `sleep` are the clock, `protection` is the forge's rules as `mainProtection` reads them.
 */
export function land({ exec, log = console.log, now = Date.now, sleep, waitMaxMinutes = 90, deadline = now() + waitMaxMinutes * 60_000, dryRun = false, protection = () => mainProtection() }) {
  const ran = (cmd, args, stream = false) => exec(cmd, args, { stream, timeout: CHILD_TIMEOUT_MS })
  const text = (cmd, args) => {
    const answer = ran(cmd, args)
    return answer.status === 0 ? String(answer.stdout ?? '').trim() : null
  }
  const sha = text('git', ['rev-parse', 'HEAD'])
  if (!/^[0-9a-f]{40}$/.test(sha ?? '')) { log('land: HEAD could not be read as a full sha'); return 1 }
  const at = `at ${sha}`
  // HEAD is the main branch at the start and again before the push: a landing that moved under it is stopped and said.
  const onMain = () => text('git', ['rev-parse', 'refs/heads/main']) === sha
  if (text('git', ['symbolic-ref', '--short', 'HEAD']) !== 'main' || !onMain()) {
    log(`land: HEAD is not the main branch ${at}; check out main at the sha to land, then run again`)
    return 2
  }
  const fetched = ran('git', ['fetch', '-q', 'origin', 'main']).status
  if (fetched !== 0) { log(`land: git fetch exited ${fetched} ${at}; whether main already has it could not be read`); return 1 }
  // A dry run asks about the forge whether or not the sha is already on main: T2's fence runs on a synchronized main, and
  // returning here passed it with no ruleset read (the Codex review of 477e8c1a). Asked before the tree is: a sha already on
  // main pushes nothing, so a release resumed after its landing is not refused for the attestation it now holds (ADR-126 T4).
  if (ran('git', ['merge-base', '--is-ancestor', sha, 'origin/main']).status === 0 && !dryRun) { log(`land: ${sha} is already on main`); return 0 }
  // git's pre-push hook judges the working tree (ADR-066), so a landing begun on an edited tree waited out CI and was then
  // turned away at main (the first landing through the ruleset, 2026-10-20). Said before anything is pushed.
  const porcelain = text('git', ['status', '--porcelain'])
  if (porcelain === null) { log(`land: git status failed ${at}`); return 1 }
  if (porcelain && !dryRun) { log(`land: the working tree is not clean ${at}; commit or stash, then run again`); return 2 }

  const forge = protection()
  log(forge.text)
  // Only rules that read as none go straight to main; rules that could not be read are not none (ADR-005).
  if (forge.state !== 'protected' && forge.state !== 'unprotected') { log(`land: nothing was pushed ${at}`); return 1 }
  const required = forge.state === 'protected' ? forge.required ?? [] : []
  if (required.length) {
    const declared = declaredJobs(text('git', ['show', `${sha}:.github/workflows/selftest.yml`]))
    if (!declared) { log(`land: the workflow at ${sha} could not be read, so whether main's required checks can arrive is not known; nothing was pushed`); return 1 }
    const never = undeclared(required, declared)
    if (never.length) { log(`land: main requires ${never.join(', ')}, which no job of the workflow at ${sha} declares, so no landing can pass; nothing was pushed`); return 1 }
  }
  // ADR-118 T2: a dry run pushes nothing, and passes only when main carries exactly the committed ruleset.
  if (dryRun) {
    if (!required.length) { log(`land: main requires no check, so .github/rulesets/main.json is not applied ${at}`); return 1 }
    const committed = parsed(text('git', ['show', `${sha}:.github/rulesets/main.json`]) ?? '')
    if (!committed?.name) { log(`land: .github/rulesets/main.json at ${sha} could not be read`); return 1 }
    const listed = parsed(text('gh', ['api', 'repos/{owner}/{repo}/rulesets', '--paginate', '--slurp']) ?? '')
    const named = Array.isArray(listed) ? listed.flat().filter(ruleset => ruleset?.name === committed.name) : null
    if (!named) { log("land: the forge's rulesets could not be listed"); return 1 }
    if (named.length !== 1) { log(`land: the forge has ${named.length} ruleset(s) named "${committed.name}", not one`); return 1 }
    const id = named[0].id
    const differs = rulesetDiffers(committed, parsed(text('gh', ['api', `repos/{owner}/{repo}/rulesets/${id}`]) ?? ''))
    if (differs.length) { log(`land: ruleset ${id} on the forge is not the committed one: ${differs.join('; ')}`); return 1 }
    log(`land: main carries the committed ruleset (id ${id}); ${sha} would land through land/${sha} once ${required.length} required check(s) pass there`)
    return 0
  }

  if (required.length) {
    const branch = `land/${sha}`
    const staged = ran('git', ['push', 'origin', `${sha}:refs/heads/${branch}`], true).status
    if (staged !== 0) { log(`land: git push to ${branch} exited ${staged}; nothing was pushed to main`); return 1 }
    // ADR-126 T6: what a Windows peer runs at the sha while CI does, so a Windows-only defect shows up during the wait. It
    // names the public remote and the sha only (CLAUDE.md §6); `-c core.longpaths=true` is what a deep Windows clone needs (§7).
    log(`land: ${branch} is pushed; a Windows peer can check it now: git clone -c core.longpaths=true https://github.com/D3-lt/quality-harness.git qh-${sha.slice(0, 8)} && cd qh-${sha.slice(0, 8)} && git fetch -q origin ${branch} && git checkout -q --detach ${sha} && bash scripts/selftest.sh`)
    // Every check-run at the sha, every page: a required run on a later page is still a run (ADR-118 Decision 2).
    const runsAt = () => {
      const pages = parsed(text('gh', ['api', `repos/{owner}/{repo}/commits/${sha}/check-runs?filter=all&per_page=100`, '--paginate', '--slurp']) ?? '')
      return Array.isArray(pages) && pages.every(page => Array.isArray(page?.check_runs)) ? pages.flatMap(page => page.check_runs) : null
    }
    for (;;) {
      const runs = runsAt()
      // An answer gh could not give is waited past, never read as a verdict.
      const states = runs ? verdicts(required, runs) : required.map(({ context }) => ({ context, verdict: 'unread' }))
      const stopped = states.filter(state => !['success', 'pending', 'missing', 'unread'].includes(state.verdict))
      if (stopped.length) {
        log(`land: ${stopped.map(state => `${state.context} concluded ${state.verdict}`).join(', ')} ${at}; main was not pushed, and ${branch} is kept for the run`)
        return 1
      }
      const waiting = states.filter(state => state.verdict !== 'success')
      if (!waiting.length) break
      if (now() >= deadline) {
        log(`land: waited for ${waiting.map(state => `${state.context} (${state.verdict})`).join(', ')} at ${sha} and it did not pass in time; run again to resume`)
        return 3
      }
      sleep(POLL_MS)
    }
  }
  if (!onMain()) { log(`land: local main moved during the wait ${at}; nothing was pushed to main`); return 2 }
  // The captured sha, never `main`: `git push origin main` resolves the local branch when it runs, so a branch moved
  // after the check above would push a sha nobody checked (the Codex review of 81571b37..7782862e). No force: the
  // forge's main must fast-forward to it.
  const pushed = ran('git', ['push', 'origin', `${sha}:refs/heads/main`], true).status
  if (pushed !== 0) { log(`land: git push origin ${sha}:refs/heads/main exited ${pushed} ${at}`); return 1 }
  const remote = text('git', ['ls-remote', 'origin', 'refs/heads/main'])?.split(/\s/)[0]
  if (remote !== sha) { log(`land: the forge's main is ${remote || 'unreadable'} after the push, not ${sha}`); return 1 }
  if (required.length) {
    const deleted = ran('git', ['push', 'origin', '--delete', `land/${sha}`]).status
    if (deleted !== 0) log(`land: land/${sha} could not be deleted (git exited ${deleted}); delete it by hand`)
  }
  log(`land: ${sha} is on main`)
  return 0
}

function option(argv, name) {
  const index = argv.indexOf(name)
  return index >= 0 ? argv[index + 1] : undefined
}

if (isMainModule(import.meta.url)) {
  const argv = process.argv.slice(2)
  const known = new Set(['--wait-max', '--dry-run'])
  const unknown = argv.filter((word, index) => word.startsWith('--') && !known.has(word) && argv[index - 1] !== '--wait-max')
  if (unknown.length || argv.includes('--help')) {
    process.stderr.write('usage: node scripts/land.mjs [--wait-max <minutes>] [--dry-run]\n')
    process.exit(argv.includes('--help') ? 0 : 2)
  }
  const minutes = Number(option(argv, '--wait-max') ?? 90)
  const exec = (cmd, args, { stream, timeout }) => {
    const run = spawnSync(cmd, args, { encoding: 'utf8', stdio: stream ? 'inherit' : ['ignore', 'pipe', 'pipe'], timeout, windowsHide: true })
    return { status: run.error ? 1 : run.status ?? 1, stdout: run.stdout ?? '', stderr: run.stderr ?? '' }
  }
  const pause = new Int32Array(new SharedArrayBuffer(4))
  process.exit(land({
    exec, waitMaxMinutes: Number.isFinite(minutes) && minutes > 0 ? minutes : 90, dryRun: argv.includes('--dry-run'),
    sleep: ms => Atomics.wait(pause, 0, 0, ms),
  }))
}
