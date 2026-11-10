// ADR-140: the core's Windows job-tree routine and its callers, whose order and fallbacks are platform-neutral Go tests driven
// by fakes (core/hooks/wintree_test.go), so they run on every platform; the kernel32 half runs only on Windows.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { required } from './helpers/require.mjs'

const coreDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'core')
const goVersion = spawnSync('go', ['version'], { encoding: 'utf8', timeout: 30_000, windowsHide: true })
const skip = required('go', goVersion.error || goVersion.status !== 0
  ? `go is not on PATH (${goVersion.error?.code ?? `exit ${goVersion.status}`}), so the Go core cannot be built here` : false)

// Runs the named Go tests and requires each to have passed by name: a pattern that matches nothing exits 0.
function goTests(names) {
  const ran = spawnSync('go', ['test', '-count=1', '-v', '-run', `^(${names.join('|')})$`, './hooks/'], {
    cwd: coreDir, encoding: 'utf8', timeout: 600_000, windowsHide: true,
  })
  const said = `${ran.stdout}\n${ran.stderr}`
  assert.equal(ran.status, 0, said.split('\n').slice(-40).join('\n'))
  for (const name of names) assert.match(said, new RegExp(`^--- PASS: ${name} \\(`, 'm'), `${name} did not pass\n${said}`)
}

test('the job-tree routine takes every branch it claims', { skip }, () => {
  goTests(['TestWinTreeAdoptResumesWhateverTheJob', 'TestWinTreeAdoptKillsWhatItCannotResume', 'TestWinTreeEndPrefersTheJob',
    'TestWinTreeEndFallsBackToTaskkill', 'TestWinTreeReleaseClosesOnlyAHeldJob', 'TestWinTreeReapIsBounded'])
})

test('the shell hook hands the deadline the tree it adopted', { skip }, () => {
  goTests(['TestShellHookAdoptsWhatItStarted'])
})

test('a failed adoption and an unconfirmed cleanup write the trace rows they claim', { skip }, () => {
  goTests(['TestHookTraceRowsOnAdoptionAndCleanup'])
})

test('a run() tree is ended at the deadline and when the command returns', { skip }, () => {
  goTests(['TestWinTreeWatchEndsAtTheDeadline', 'TestWinTreeWatchEndsWhatTheCommandLeft', 'TestWinTreeWatchKillsWhatItCannotResume',
    'TestWinTreeWatchCleanupKeepsTheDeadlineFallback'])
})
