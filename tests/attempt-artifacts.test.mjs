// BACKLOG §475.2, the residual the scoped verification review of afd51584a left: a release took its run from release-evidence
// and checked the attempt, but downloaded `qh-core`, `qh-plugin` and `outside-run` by name, and `gh run download` takes the
// first unexpired match of the run, which after a re-run can be an earlier attempt's. Each artifact is now named with the
// attempt that made it, each consumer asks for the judged attempt's exact name, and a partial re-run, which leaves the
// judged attempt without one, stops with the remedy.
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { downloadOutsideRun } from '../scripts/release-evidence.mjs'
import { downloadArtifact } from '../scripts/release-assets.mjs'
import { loadNativeManifest } from '../scripts/native-manifest.mjs'
import { SHA, landPush, world } from './helpers/release-world.mjs'
import { remove } from './helpers/remove.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const WORKFLOW = readFileSync(path.join(repoRoot, '.github', 'workflows', 'selftest.yml'), 'utf8').replaceAll('\r\n', '\n')
const RELEASED = ['qh-core', 'qh-plugin', 'outside-run']

/** Every upload or download of a released artifact whose name is not `<name>-${{ github.run_attempt }}`. */
function unbound(workflow) {
  const names = [...workflow.matchAll(/^ {6}- uses: actions\/(upload|download)-artifact@v\d+\n {8}with:\n {10}name: ([^\n]+)$/gm)]
  return names.filter(([, , name]) => RELEASED.some(base => name === base || name.startsWith(`${base}-`)))
    .filter(([, , name]) => !RELEASED.some(base => name === `${base}-\${{ github.run_attempt }}`))
    .map(([, kind, name]) => `${kind} ${name}`)
}

// A fake gh holding the artifacts of one run: each name is a file the download writes, or absent.
function forge(artifacts) {
  const asked = []
  const run = (bin, args) => {
    asked.push(args.join(' '))
    const name = args[args.indexOf('--name') + 1]
    if (!(name in artifacts)) return { status: 1, stdout: '', stderr: 'no artifact matches any of the names or patterns provided\n' }
    writeFileSync(path.join(args[args.indexOf('--dir') + 1], 'made-by'), artifacts[name])
    return { status: 0, stdout: '', stderr: '' }
  }
  return { asked, run }
}

test('every released artifact is named with the attempt that made it', () => {
  assert.deepEqual(unbound(WORKFLOW), [])
  // Four sites, each the same shape: two uploads in core-assets, the outside run's download and upload.
  assert.equal([...WORKFLOW.matchAll(/name: (?:qh-core|qh-plugin|outside-run)-\$\{\{ github\.run_attempt \}\}$/gm)].length, 4)
  const before = WORKFLOW.replaceAll('-${{ github.run_attempt }}', '')
  assert.deepEqual(unbound(before), ['upload qh-core', 'upload qh-plugin', 'download qh-core', 'upload outside-run'])
})

test('two attempts at one sha with different artifacts: the judged attempt\'s own are taken', t => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'qh-attempt-'))
  t.after(() => remove(dir))
  const { asked, run } = forge({ 'qh-core-1': 'attempt 1', 'qh-core-2': 'attempt 2' })
  downloadArtifact('7', '2', 'qh-core', dir, run)
  assert.equal(readFileSync(path.join(dir, 'made-by'), 'utf8'), 'attempt 2')
  downloadArtifact('7', '1', 'qh-core', dir, run)
  assert.equal(readFileSync(path.join(dir, 'made-by'), 'utf8'), 'attempt 1')
  assert.deepEqual(asked, ['run download 7 --name qh-core-2 --dir ' + dir, 'run download 7 --name qh-core-1 --dir ' + dir])
})

test('a partial re-run leaves the judged attempt without its artifact, and the release is told what to do', t => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'qh-attempt-'))
  t.after(() => remove(dir))
  // Attempt 2 re-ran only the failed jobs, so the job that builds the assets kept attempt 1's.
  const partial = forge({ 'qh-core-1': 'attempt 1' })
  assert.throws(() => downloadArtifact('7', '2', 'qh-core', dir, partial.run), /run 7 has no artifact qh-core-2[\s\S]*gh run rerun 7/)
  // Any other failure is said as itself, without that remedy.
  const broken = (bin, args) => ({ status: 1, stdout: '', stderr: 'HTTP 502: Bad Gateway\n' })
  assert.throws(() => downloadArtifact('7', '2', 'qh-core', dir, broken), error => /could not be downloaded[\s\S]*HTTP 502/.test(error.message) && !/gh run rerun/.test(error.message))
  // Neither name nor attempt is guessed: an attempt that is not a positive number asks gh nothing.
  const none = forge({ 'qh-core': 'unnamed' })
  assert.throws(() => downloadArtifact('7', 'unknown', 'qh-core', dir, none.run), /attempt/)
  assert.deepEqual(none.asked, [])
  // gh's other "absent" answer: every artifact of the run is expired or gone.
  const expired = (bin, args) => ({ status: 1, stdout: '', stderr: 'no valid artifacts found to download\n' })
  assert.throws(() => downloadArtifact('7', '2', 'qh-core', dir, expired),
    /run 7 has no artifact qh-core-2 available to download\. Re-run every job[\s\S]*gh run rerun 7/)
})

test('the outside run and the native manifest are read from the judged attempt too', () => {
  const asked = []
  const exec = (bin, args) => { asked.push(args.join(' ')); throw Object.assign(new Error('gone'), { stderr: 'no artifact matches any of the names or patterns provided' }) }
  assert.match(downloadOutsideRun(7, 3, exec).error, /run 7 has no artifact outside-run-3[\s\S]*gh run rerun 7/)
  assert.ok(asked[0].startsWith('run download 7 -n outside-run-3 -D '), asked.join('\n'))
  asked.length = 0
  assert.match(downloadOutsideRun(7, undefined, exec).error, /attempt/)
  assert.deepEqual(asked, [], 'no attempt, no download')

  const at = 'c'.repeat(40)
  const root = mkdtempSync(path.join(os.tmpdir(), 'qh-native-root-'))
  const seen = []
  const ATTEMPT_YAML = '      - uses: actions/upload-artifact@v7\n        with:\n          name: qh-core-${{ github.run_attempt }}\n'
  const LEGACY_YAML = '      - uses: actions/upload-artifact@v7\n        with:\n          name: qh-core\n'
  const view = (attempt, yaml = ATTEMPT_YAML) => (bin, args, options) => {
    seen.push({ call: `${bin} ${args.join(' ')}`, cwd: options?.cwd })
    if (args[0] === 'api') return { status: 0, stdout: JSON.stringify({ id: 7, head_sha: at, status: 'completed', conclusion: 'success', path: '.github/workflows/selftest.yml', event: 'push', head_branch: `land/${at}`, run_attempt: attempt }) }
    if (bin === 'git') return yaml === null ? { status: 128, stdout: '', stderr: 'fatal: bad object' } : { status: 0, stdout: yaml }
    return { status: 1, stdout: '', stderr: 'no artifact matches any of the names or patterns provided' }
  }
  const downloads = () => seen.filter(({ call }) => call.startsWith('gh run download')).map(({ call }) => call.split(' --dir ')[0])
  const missing = loadNativeManifest('7', at, { root, run: view(4) })
  assert.deepEqual(downloads(), ['gh run download 7 --name qh-core-4'], 'a run of an attempt-naming workflow: its latest attempt\'s core')
  assert.ok(seen.every(({ cwd }) => cwd === root), 'every command runs in the root it was given, so gh names that repository')
  assert.match(missing.couldNotLook, /no artifact qh-core-4[\s\S]*gh run rerun 7/, 'the downloader\'s diagnosis is kept')
  seen.length = 0
  loadNativeManifest('7', at, { root, run: view(4, LEGACY_YAML) })
  assert.deepEqual(downloads(), ['gh run download 7 --name qh-core'], 'a run from before attempt names: the name its workflow gave')
  seen.length = 0
  assert.ok(loadNativeManifest('7', at, { root, run: view(undefined) }).couldNotLook, 'a run that does not say its attempt')
  assert.deepEqual(downloads(), [])
  seen.length = 0
  assert.match(loadNativeManifest('7', at, { root, run: view(4, null) }).couldNotLook, /workflow/, 'a workflow git cannot show names nothing')
  assert.deepEqual(downloads(), [])
  remove(root)
})

test('the release hands the judged attempt to the asset download', () => {
  const w = world({ runs: [[landPush()]], attempt: 3, evidenceText: `SUCCESS — evidence\nrelease-evidence judged run 3 attempt 3 at ${SHA}\n` })
  assert.equal(w.run(), 0, w.said.join('\n'))
  assert.ok(w.calls.includes(`node scripts/release-assets.mjs 3 ${SHA} 3`), w.calls.join('\n'))
})
