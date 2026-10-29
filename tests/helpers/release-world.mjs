// The fake git, gh and checks scripts/release.mjs runs against, shared by every release test (ADR-100 T3, ADR-126): nothing
// here reaches a real remote, and the script is driven through its exported `release` (CLAUDE.md §9).
import { release } from '../../scripts/release.mjs'

export const SHA = 'a'.repeat(40)
// Runs on main, the dispatch the newer of the two (ADR-118: only a dispatch on main newer than main's push run is reused).
export const push = (status = 'completed') => ({ databaseId: 1, event: 'push', status, headSha: SHA, headBranch: 'main', createdAt: '2026-10-20T00:00:00Z' })
export const dispatch = (status = 'completed') => ({ databaseId: 2, event: 'workflow_dispatch', status, headSha: SHA, headBranch: 'main', createdAt: '2026-10-20T00:00:01Z' })
export const landPush = () => ({ databaseId: 3, event: 'push', status: 'completed', headSha: SHA, headBranch: `land/${SHA}`, createdAt: '2026-10-19T23:59:00Z' })
export const LANDING = `git push origin ${SHA}:refs/heads/land/${SHA}`
export const MAIN_PUSH = `git push origin ${SHA}:refs/heads/main`

// A world the fake answers from. `runs` is a list of answers to `gh run list --commit`, the last one repeated.
export function world(overrides = {}) {
  const state = {
    version: '1.0.1', tags: ['v1.0.0'], remoteTags: [], released: false, porcelain: '', origin: SHA,
    check: 0, deadCode: 0, evidence: [0], runs: [[push(), dispatch()]], inFlight: [],
    // The forge as land reads it: unprotected unless a test says otherwise, so main is pushed straight (ADR-118).
    protection: { state: 'unprotected', text: "forge: main's rules require no status check", required: [] },
    workflow: 'jobs:\n  windows:\n    name: windows\n',
    checkRuns: [{ total_count: 1, check_runs: [{ id: 1, name: 'windows', status: 'completed', conclusion: 'success', started_at: '2026-10-20T00:00:00Z', app: { id: 15368 } }] }],
    ...overrides,
  }
  const calls = []
  let runCalls = 0
  let evidenceCalls = 0
  const exec = (cmd, args) => {
    const line = [cmd, ...args].join(' ')
    calls.push(line)
    const ok = (stdout = '') => ({ status: 0, stdout, stderr: '' })
    if (line === 'git rev-parse HEAD') return ok(`${SHA}\n`)
    if (line === 'git status --porcelain') return ok(state.porcelain)
    if (line === 'git show HEAD:plugin/.claude-plugin/plugin.json') return ok(JSON.stringify({ version: state.version }))
    if (line.startsWith('git tag --list')) return state.tagListFails ? { status: 128, stdout: '', stderr: 'fatal' } : ok(state.tags.join('\n'))
    if (line.startsWith('gh release view')) return state.released ? ok('{}') : { status: 1, stdout: '', stderr: state.viewError ?? 'release not found' }
    if (line.startsWith('node plugin/scripts/qh-check.mjs')) {
      state.checks = (state.checks ?? 0) + 1
      return { status: state.check, stdout: '', stderr: '' }
    }
    if (line === 'bash scripts/dead-code-scan.sh') return { status: state.deadCode, stdout: '', stderr: '' }
    if (line === 'git fetch -q --tags origin main') {
      if (state.fetchFails) return { status: 128, stdout: '', stderr: 'fatal: unable to access' }
      state.tags = [...new Set([...state.tags, ...state.remoteTags])]
      return ok()
    }
    if (line === 'git rev-parse origin/main') return ok(`${state.origin}\n`)
    if (line.startsWith('git merge-base --is-ancestor')) return { status: state.origin === SHA ? 0 : 1, stdout: '', stderr: '' }
    if (line === MAIN_PUSH) { state.origin = SHA; return ok() }
    // What land asks (ADR-118): the branch, local main, the forge's main, the workflow, the landing and its check-runs.
    if (line === 'git symbolic-ref --short HEAD') return ok('main\n')
    if (line === 'git rev-parse refs/heads/main') return ok(`${SHA}\n`)
    if (line === 'git fetch -q origin main') return ok()
    if (line === 'git ls-remote origin refs/heads/main') return ok(`${state.origin}\trefs/heads/main\n`)
    if (line === `git show ${SHA}:.github/workflows/selftest.yml`) return ok(state.workflow)
    if (line === LANDING || line === `git push origin --delete land/${SHA}`) return ok()
    // `checkRunsSeq`, when given, is a list of answers to the check-runs read, the last one repeated (ADR-126 T5's waits).
    if (line.startsWith(`gh api repos/{owner}/{repo}/commits/${SHA}/check-runs`)) {
      if (!state.checkRunsSeq) return ok(JSON.stringify(state.checkRuns))
      const answer = state.checkRunsSeq[Math.min(state.checkReads ?? 0, state.checkRunsSeq.length - 1)]
      state.checkReads = (state.checkReads ?? 0) + 1
      return ok(JSON.stringify([answer]))
    }
    if (line.startsWith('gh run list --commit')) {
      const answer = state.runs[Math.min(runCalls, state.runs.length - 1)]
      if (answer.some(row => row.event === 'push')) state.pushSeen = true
      if (answer.some(row => row.event === 'push' && row.headBranch === 'main')) state.mainPushSeen = true
      runCalls += 1
      return ok(JSON.stringify(answer))
    }
    if (line.startsWith('gh run list --workflow')) return ok(JSON.stringify(state.inFlight))
    if (line === 'gh workflow run selftest.yml --ref main') { state.dispatchSawPush = state.pushSeen === true; state.dispatchSawMainPush = state.mainPushSeen === true; return ok() }
    if (line === `node scripts/release-evidence.mjs --local ${SHA}`) {
      return { status: state.local ?? 0, stdout: `${state.local ? 'UNPROVEN' : 'READY'} — local evidence\n`, stderr: '' }
    }
    // ADR-126 T4: the question asked before anything lands. `review` decides it, else `local` (BACKLOG §406's world).
    if (line === `node scripts/release-evidence.mjs --review ${SHA}`) {
      const code = state.review ?? state.local ?? 0
      return { status: code, stdout: `${code ? 'UNPROVEN' : 'READY'} — review evidence\n`, stderr: '' }
    }
    // ADR-126 T4: an uncommitted attestation is verified before it is evidence. `verify` decides it.
    if (line.startsWith('node scripts/attest-import.mjs --verify ')) return { status: state.verify ?? 0, stdout: '', stderr: '' }
    if (line.endsWith(`scripts/release-evidence.mjs ${SHA}`)) {
      const code = state.evidence[Math.min(evidenceCalls, state.evidence.length - 1)]
      evidenceCalls += 1
      return { status: code, stdout: state.evidenceText ?? `${code === 0 ? 'SUCCESS' : 'UNPROVEN'} — evidence\n`, stderr: '' }
    }
    if (line.startsWith('node scripts/release-assets.mjs ')) return {
      status: state.assetFailure ?? 0, stdout: JSON.stringify(state.assetFiles ?? [
        'qh-assets/qh-linux-amd64', 'qh-assets/qh-linux-arm64', 'qh-assets/qh-darwin-amd64',
        'qh-assets/qh-darwin-arm64', 'qh-assets/qh-windows-amd64.exe', 'qh-assets/SHA256SUMS.txt',
        'qh-plugin/quality-harness.zip', 'qh-plugin/quality-harness.zip.json',
      ]), stderr: '',
    }
    if (line.startsWith('gh release create')) { state.released = true; return ok() }
    if (line.startsWith('node scripts/marketplace-source.mjs ')) return { status: state.marketplace ?? 0, stdout: 'marketplace checked\n', stderr: '' }
    throw new Error(`the fake has no answer for: ${line}`)
  }
  let clock = 0
  const said = []
  // The load each sample reads, the last one repeated: a quiet machine unless a test says otherwise, so the real machine's
  // load never decides a test.
  let loadCalls = 0
  const load = () => {
    const loads = state.loads ?? [1]
    return { load: loads[Math.min(loadCalls++, loads.length - 1)], cores: 10 }
  }
  const run = (extra = {}) => release({ exec, log: line => said.push(line), now: () => clock, sleep: ms => { clock += ms }, load, protection: () => state.protection, ...extra })
  return { state, calls, said, run }
}

export const pushed = calls => calls.some(line => line === MAIN_PUSH)
export const dispatched = calls => calls.some(line => line === 'gh workflow run selftest.yml --ref main')
export const tagged = calls => calls.find(line => line.startsWith('gh release create'))
