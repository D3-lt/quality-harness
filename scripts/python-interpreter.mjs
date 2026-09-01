// python-interpreter.mjs — spawn the Python that answered, not the one named `python3`.
//
// Repository tooling only; this never ships. `plugin/` carries its own copy of
// the decision in `resolvePython`, which is imported here rather than repeated —
// there is one rule about which interpreter is real and it lives in the plugin.
//
// WHY THIS EXISTS. Stock Windows ships `python3` as an App Execution Alias: a
// 0-byte reparse point that spawns, writes "Python was not found" to STDOUT,
// leaves stderr empty, and exits 9009. It is not an error and `spawnSync` sets no
// `error`, so a bare `spawnSync('python3', …)` looks like a gate that ran and
// failed. Measured 2026-08-30 on Windows 11 build 26200.9168 (BACKLOG §88), where
// the same alias later returned `Python 3.14.7` and exit 0 after an install — so
// `python3` on Windows is not a decoy, it is an UNKNOWN, and only a probe settles
// it. Nothing here keys on 9009: that is cmd.exe's own "command not found" code
// and cannot separate "the interpreter never ran" from "the gate returned 9009".
//
// CI cannot catch this. `actions/setup-python` puts a real `python3` on the
// Windows job's PATH, so the alias is structurally unreachable there — the reason
// §88's fix needed an injectable seam and the reason this helper has one too.
import { spawnSync } from 'node:child_process'

import { resolvePython } from '../plugin/scripts/lifecycle.mjs'

// Resolved once per process. `readyTaskLines` learned the same lesson in the
// plugin: re-probing three interpreters per call costs more than the work, and
// `??=` would re-probe forever on a machine with no Python — exactly when
// probing is most expensive. A sentinel makes "asked, and the answer was none"
// a cached answer.
const UNPROBED = Symbol('python interpreter not yet resolved')
let cached = UNPROBED

/**
 * The argv prefix that runs Python 3 here, as `[command, ...flags]`.
 *
 * `platform` and `resolve` are parameters so the Windows branch is reachable
 * from a machine that is not Windows. That is CLAUDE.md §7's rule: a
 * Windows-only branch with no injectable seam is a branch with no test.
 *
 * @throws when the platform is win32 and no candidate answered a version probe.
 *   A suite that cannot find its interpreter has NOT passed, and returning a
 *   plausible-looking `['python3']` would let it report exactly that.
 */
export function pythonArgv(platform = process.platform, resolve = resolvePython) {
  if (platform !== 'win32') return ['python3']
  const found = resolve(platform)
  if (!found) {
    throw new Error(
      'python-interpreter: no Python 3 on PATH answered a version probe. '
      + 'On Windows `python3` may be a 0-byte Store alias that spawns and is not Python, '
      + 'so presence is never the evidence — see docs/BACKLOG.md §88.')
  }
  return found
}

/**
 * Run a Python script, resolving the interpreter first.
 *
 * A drop-in for `spawnSync('python3', args, options)`: same argument order, same
 * return value.
 */
export function runPython(args, options = {}, platform = process.platform, resolve = resolvePython) {
  if (cached === UNPROBED || platform !== process.platform) {
    const argv = pythonArgv(platform, resolve)
    if (platform === process.platform) cached = argv
    const [command, ...prefix] = argv
    return spawnSync(command, [...prefix, ...args], options)
  }
  const [command, ...prefix] = cached
  return spawnSync(command, [...prefix, ...args], options)
}
