// Repository-only CI artifact lookup. Ordinary hooks never download provenance.
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { parseCoreManifest } from '../plugin/scripts/native-provenance.mjs'
import { releaseAssetFiles } from './release-assets.mjs'

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
  const directory = mkdtempSync(path.join(os.tmpdir(), 'qh-native-manifest-'))
  try {
    const downloaded = run('gh', ['run', 'download', id, '--name', 'qh-core', '--dir', directory], options)
    if (downloaded.error || downloaded.status !== 0) return { couldNotLook: 'the native landing artifact could not be downloaded' }
    releaseAssetFiles(directory)
    const manifest = parseCoreManifest(readFileSync(path.join(directory, 'SHA256SUMS.txt'), 'utf8'))
    if (manifest.source?.at !== at || manifest.source?.run !== id) return { refused: ['native manifest does not bind the named landing run and source commit'] }
    return { manifest }
  } catch { return { refused: ['native landing artifact is incomplete or its manifest/checksums do not verify'] } }
  finally { rmSync(directory, { recursive: true, force: true, maxRetries: 2, retryDelay: 20 }) }
}
