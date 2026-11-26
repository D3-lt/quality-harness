// Repository-only CI artifact lookup. Ordinary hooks never download provenance.
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { parseCoreManifest } from '../plugin/scripts/native-provenance.mjs'
import { downloadArtifact, downloadNamed, releaseAssetFiles } from './release-assets.mjs'

// BACKLOG §475.2: a workflow from before attempt-qualified names uploaded `qh-core` alone. An attestation of such a run is
// still verified as ADR-131 made it, by the name its own workflow gave; a run from after, by its latest attempt's name.
const ATTEMPT_NAMED = /^ {10}name: qh-core-\$\{\{ github\.run_attempt \}\}$/m

export function loadNativeManifest(id, at, { root = process.cwd(), run = spawnSync } = {}) {
  if (!/^[1-9][0-9]*$/.test(id) || !/^[a-f0-9]{40}$/.test(at)) return { refused: ['native landing run or source commit is malformed'] }
  const options = { cwd: root, encoding: 'utf8', timeout: 120_000, maxBuffer: 1 << 20, windowsHide: true }
  const view = run('gh', ['api', 'repos/{owner}/{repo}/actions/runs/' + id], options)
  if (view.error || view.status !== 0) return { couldNotLook: 'the native landing run could not be read' }
  let observed
  try { observed = JSON.parse(view.stdout) } catch { return { couldNotLook: 'the native landing run returned unreadable metadata' } }
  if (!observed || typeof observed !== 'object' || Array.isArray(observed)
    || typeof observed.head_sha !== 'string' || typeof observed.status !== 'string' || typeof observed.conclusion !== 'string'
    || typeof observed.path !== 'string' || typeof observed.event !== 'string' || typeof observed.head_branch !== 'string') {
    return { couldNotLook: 'the native landing run returned incomplete metadata' }
  }
  if (observed.head_sha !== at || String(observed.id) !== id) return { refused: ['native artifact run belongs to a different source commit or run'] }
  if (observed.path !== '.github/workflows/selftest.yml'
    || !(observed.event === 'workflow_dispatch' || observed.event === 'push' && observed.head_branch === 'land/' + at)) {
    return { refused: ['native artifact is not from the designated full landing workflow'] }
  }
  if (observed.status !== 'completed' || observed.conclusion !== 'success') return { couldNotLook: 'the native landing run has not concluded success' }
  const workflow = run('git', ['show', `${at}:.github/workflows/selftest.yml`], options)
  if (workflow.error || workflow.status !== 0) return { couldNotLook: 'the workflow at the native landing commit could not be read, so the name of its artifact is not known' }
  const directory = mkdtempSync(path.join(os.tmpdir(), 'qh-native-manifest-'))
  try {
    try {
      // `downloadArtifact` refuses an attempt it cannot read, so a run that does not say its attempt is could-not-look.
      if (ATTEMPT_NAMED.test(String(workflow.stdout ?? ''))) downloadArtifact(id, observed.run_attempt, 'qh-core', directory, run, options)
      else downloadNamed(id, 'qh-core', directory, run, options)
    } catch (error) { return { couldNotLook: `the native landing artifact could not be downloaded: ${error.message}` } }
    releaseAssetFiles(directory)
    const manifest = parseCoreManifest(readFileSync(path.join(directory, 'SHA256SUMS.txt'), 'utf8'))
    if (manifest.source?.at !== at || manifest.source?.run !== id) return { refused: ['native manifest does not bind the named landing run and source commit'] }
    return { manifest }
  } catch { return { refused: ['native landing artifact is incomplete or its manifest/checksums do not verify'] } }
  finally { rmSync(directory, { recursive: true, force: true, maxRetries: 2, retryDelay: 20 }) }
}
