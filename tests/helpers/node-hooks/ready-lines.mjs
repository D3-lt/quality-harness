// The gate spawner every reader shares (on Windows, an interpreter probe cached for the life of the process, here and nowhere
// else) and the one-line headline of an advisory. The SessionStart ready-task lines that gave this file its name were removed by
// ADR-099: `work-next` says which task is ready. Moved out of lifecycle.mjs (BACKLOG section 375, stage B4).
import { spawnSync } from 'node:child_process'

// ADVISORY ONLY. This harness does not refuse a tool call — it tells the agent
// what it found and leaves the decision where it belongs.
//
// It used to block, and across three projects in one day it refused legitimate
// work six times: a commit gate that degraded with session length until nothing
// could be committed, a deletion sentinel that fired only on deletions already
// checked, a read-only `> /dev/null` read as authorship, an unfilled template
// shape stopping an edit that had already landed. Every one of those was the
// harness fighting its user, and the pattern is what it teaches: an agent that
// loses turns to a gate learns to route around the gate, and then the gate
// protects nothing at all.
//
// So a finding is now information, delivered at the moment it can still be acted
// on. What the harness gives up is the ability to STOP a fabricated claim; what
// it keeps is the ability to name one, loudly, every time it sees it. That was
// the owner's call, made explicitly and more than once.
// The one line a person sees. The full text is for the agent; the person needs
// to know a finding was made and where it went, not to read the instruction.
export function advisoryHeadline(reason) {
  const first = String(reason).split('\n').find(line => line.trim()) ?? String(reason)
  // ⚠ EVERY ADVISORY BEGINS `quality-harness: `, so "the first sentence", split
  // after a `.` or a `:`, was always that prefix and nothing else: the person read
  // "quality-harness advised the agent: quality-harness: (full text…)" — told a
  // finding was made and nothing about it. Two peer sessions flagged the line on
  // 2026-09-19. The caller already says who is speaking, so the prefix goes; and
  // only a FULL STOP ends the sentence, since these messages use `:` and `—` mid-clause.
  const sentence = first.trim().replace(/^quality-harness:\s*/i, '').split(/(?<=\.)\s/)[0]
  return sentence.length > 140 ? `${sentence.slice(0, 137)}…` : sentence
}

// The gates in bin/ are `#!/usr/bin/env python3` scripts. Windows cannot exec a
// `#!` script, so spawning one directly returns status null — and the SessionStart ready-task reader's
// `continue` (removed by ADR-099) swallowed that, leaving session orientation silently empty on every
// Windows session. Measured 2026-08-25 on windows-latest, where the hook produced
// nothing and reported no error. Name the interpreter there instead.
//
// Naming it is not the same as finding it. `python3` on a stock Windows 11 is an
// App Execution Alias under WindowsApps: a real, spawnable exe that is not Python.
// It prints "Python was not found; run without arguments to install from the
// Microsoft Store" to STDOUT — nothing on stderr — and exits 9009. So it sets no
// `error`, and an `error`-keyed fallback never fires; every gate came back 9009,
// which is neither 0 nor 3, and that ready-task reader swallowed it into the exact empty
// orientation the paragraph above says was fixed. Measured 2026-08-30 on Windows
// 11 build 26200.9168, where `py -3` ran the same gate and exited 3.
//
// Do not key the fallback on 9009 either. That is cmd.exe's own "command not
// found" code, borrowed by the alias, so it cannot separate "the interpreter never
// ran" from "the gate ran and returned 9009". The only honest question is whether
// the candidate answered AS PYTHON, which is why this probes for a known answer
// rather than detecting by name. resolve_bash() decides by directory name instead:
// it skips the System32 WSL stub and the WindowsApps Store alias (plugin/lib/fence.py,
// BACKLOG §91), but still trusts an isfile() of anything else on PATH. Probe; do not
// trust a name or an isfile().
// BACKLOG §93. The probe asked for the MAJOR version and threw the rest away, so
// a box with 3.14 and 3.10 both on PATH — four years and one semantic change
// apart — answered `3` either way and nothing recorded which one ran. §90 is the
// case where that mattered: the same guard returned different answers on each.
// Costs one format string; the acceptance check below still turns on the major.
const PYTHON_PROBE = 'import sys;print("%d.%d" % sys.version_info[:2])'

// Preference order. `py -3` is the launcher Windows actually ships for this and
// is the one standalone-link.mjs's cmd forwarder already reaches for; a bare
// `python` is next; `python3` is last because on Windows it is most often the
// alias. Every one of them is probed regardless — presence is never the evidence.
const WINDOWS_PYTHONS = [['py', '-3'], ['python'], ['python3']]

/**
 * The argv prefix that runs a real Python 3 on this machine, or null if nothing
 * on PATH answered as one. Windows only; POSIX execs the shebang itself.
 *
 * `candidates` and `run` are injected so the alias case is reachable from macOS
 * and Linux — a Windows-only branch with no seam is a branch with no test, and
 * that is precisely how the alias shipped past a suite that exercises the win32
 * branch on boxes where `python3` happens to be genuine.
 */
export function resolvePython(platform = process.platform, candidates = WINDOWS_PYTHONS, run = spawnSync) {
  if (platform !== 'win32') return null
  for (const [command, ...prefix] of candidates) {
    const probe = run(command, [...prefix, '-c', PYTHON_PROBE], { encoding: 'utf8', timeout: 10_000, windowsHide: true })
    const answered = (probe.stdout ?? '').trim()
    // Keyed on the MAJOR: any 3.x is a real Python 3.
    if (probe.status === 0 && /^3(\.\d+)?$/.test(answered)) {
      return [command, ...prefix]
    }
  }
  return null
}

// Resolved once per process: work-next calls spawnGate per task directory,
// and re-probing three interpreters for each would cost more than the gates.
// `??=` would not do it — a machine with no Python resolves to null and would be
// re-probed on every call, three failed spawns each, exactly when probing is most
// expensive. The sentinel makes "asked, and the answer was none" a cached answer.
const UNPROBED = Symbol('python interpreter not yet resolved')

let cachedPython = UNPROBED

export function spawnGate(tool, args, options = {}, platform = process.platform, python) {
  // Hidden, and on Windows it is the whole point: a hook runs with no console, so a
  // child without windowsHide gets a console of its own, which Windows Terminal
  // opens as a tab that flashes (reported on 3.1.0, 2026-09-28).
  if (platform !== 'win32') return spawnSync(tool, args, { windowsHide: true, ...options })
  if (python === undefined && cachedPython === UNPROBED) cachedPython = resolvePython(platform)
  const interpreter = python !== undefined ? python : cachedPython
  if (!interpreter) {
    // No verdict here. A gate that could not start has not found anything, and
    // saying so is the whole of rule 3 — the shape matches spawnSync's own
    // "could not spawn" result so callers need no new branch to tell them apart.
    return {
      error: new Error('quality-harness: no Python 3 on PATH answered a version probe, so this gate did NOT run'),
      status: null, stdout: '', signal: null,
      stderr: 'quality-harness: no Python 3 found on PATH — an absent checker certifies nothing.\n',
    }
  }
  const [command, ...prefix] = interpreter
  return spawnSync(command, [...prefix, tool, ...args], { windowsHide: true, ...options })
}
