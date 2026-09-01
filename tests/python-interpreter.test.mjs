// The suite's own interpreter resolution, tested on the platform it is about
// from the platform it is not. `pythonArgv` takes `platform` and `resolve` for
// exactly that reason (CLAUDE.md §7): a Windows-only branch with no injectable
// seam is a branch with no test, and CI cannot close the gap either —
// `actions/setup-python` puts a real `python3` on the Windows job's PATH, so the
// Store alias this exists for is structurally unreachable there.
import assert from 'node:assert/strict'
import test from 'node:test'

import { pythonArgv } from '../scripts/python-interpreter.mjs'

test('everywhere but Windows, python3 is the answer and nothing is probed', () => {
  let probed = false
  const resolve = () => { probed = true; return null }
  assert.deepEqual(pythonArgv('darwin', resolve), ['python3'])
  assert.deepEqual(pythonArgv('linux', resolve), ['python3'])
  assert.equal(probed, false,
    'a probe on a platform with no Store alias is three spawns bought for nothing')
})

test('on Windows the answer is whatever answered the probe, not the name python3', () => {
  // `py -3` is the first candidate and carries a flag, so the argv is a LIST
  // rather than a command. A helper that returned only the command would drop
  // the `-3` and run whatever `py` defaults to.
  assert.deepEqual(pythonArgv('win32', () => ['py', '-3']), ['py', '-3'])
  assert.deepEqual(pythonArgv('win32', () => ['python']), ['python'])
})

test('on Windows with nothing answering, the suite refuses rather than guessing', () => {
  // The load-bearing one. Returning a plausible `['python3']` here is precisely
  // the Store-alias defect reproduced inside the helper written to avoid it: the
  // spawn would succeed, print "Python was not found" to stdout, exit 9009, and
  // the suite would report a gate that failed rather than a gate that never ran.
  // An absent checker certifies nothing — CLAUDE.md §3.
  assert.throws(() => pythonArgv('win32', () => null), /no Python 3 on PATH answered/)
})

test('the refusal names the mechanism, so the reader is not left with a bare absence', () => {
  // BACKLOG §85: a gate people cannot act on is a gate they learn to ignore.
  // "not found" would be true and unactionable; the alias is the part nobody
  // guesses, because the thing IS on PATH and IS spawnable.
  assert.throws(() => pythonArgv('win32', () => null), /Store alias|presence is never the evidence/)
})
