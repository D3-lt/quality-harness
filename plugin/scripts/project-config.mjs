// What the project says about itself in .quality-harness.json: whether the file can be read at all, and which paths it
// declares as prose. Moved out of lifecycle.mjs unchanged (BACKLOG section 375, stage B4). A config that cannot be read is
// said as such, never read as a config that declares nothing (ADR-005).
import { lstatSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

/**
 * Why `.quality-harness.json` cannot be taken as this project's declaration, or null when it is absent or an
 * object. A trailing comma used to read as "declares nothing": `declaredCheckCommand`, `fastCheckCommand` and
 * `proseSpecs` each swallow the parse error, so `qh-check` ran the inferred check in place of the declared one
 * and recorded a pass the publish refusal then trusted. Absent is no declaration; unreadable is UNKNOWN, and a
 * gate that records a pass must not guess what it declared (CLAUDE.md §3, ADR-005).
 */
export function projectConfigProblem(root) {
  let text
  try { text = readFileSync(path.join(root, '.quality-harness.json'), 'utf8') } catch (error) {
    if (error?.code !== 'ENOENT') return `.quality-harness.json could not be read (${error?.code ?? 'unknown error'})`
    // ENOENT is also what a link to nothing says: a dangling link is a declaration nobody can read, not an absent one.
    try { lstatSync(path.join(root, '.quality-harness.json')) } catch { return null }
    return '.quality-harness.json could not be read (a link to nothing)'
  }
  // Windows PowerShell 5.1 and some editors write one. JSON.parse refuses it with an invisible character in the message, so say
  // what it is. It is refused, not stripped: every other reader of this file would have to strip it the same way (a Windows run of 3.8.18).
  if (text.charCodeAt(0) === 0xFEFF) return '.quality-harness.json starts with a byte-order mark (U+FEFF), which JSON does not allow: save it as UTF-8 without a BOM'
  let config
  try { config = JSON.parse(text) } catch (error) {
    return `.quality-harness.json is not valid JSON (${String(error?.message).split('\n')[0]})`
  }
  return config !== null && typeof config === 'object' && !Array.isArray(config) ? null : '.quality-harness.json is not a JSON object'
}

// ADR-094 T3: the paths a project DECLARES as prose in `.quality-harness.json` (`"prose": [pathspecs]`),
// default none. A tree that differs from a passed one only under them may reuse the pass; the project
// asserts that its check reads none of them. A declaration that could hide code is refused whole and
// said, never partly read (CLAUDE.md §16: an unrecognised input is not a safe one). The grammar is
// POSITIVE, because a list of the specs that name too much is an open set (`***` passed the first one):
// a literal path or directory prefix, a literal first directory then a glob, or every file with one
// literal extension. Each must also match a tracked path and no submodule (`rm --cached` would drop the
// gitlink), and none may be able to name `.quality-harness.json` (it holds the check) in any letter case.
// That last is decided on the SPEC, not on a listing: an ignored or untracked config is invisible to a
// listing (found by a Codex review of ADR-094), and with this grammar only the file's own name and a
// `*.json` extension spec can reach a root file.
const PROSE_LITERAL = /^[\w.@+][\w.@+/-]*$/

const PROSE_UNDER = /^[\w.@+][\w.@+-]*\/[\w.@+/*?[\]-]*$/

const PROSE_EXTENSION = /^(?:\*\*\/)?\*\.[A-Za-z0-9]+$/

const PROSE_MOST = 20

// Why a spec is refused before git is asked, or null. Judged by its grammar and its segments, not by what git
// makes of it: git matches `:(top).` and `docs/../src/` to nothing today, which is a quirk, not a guard.
const CONFIG_NAME = '.quality-harness.json'

const specCouldNameConfig = spec => {
  const lower = spec.toLowerCase()
  return lower === CONFIG_NAME || (PROSE_EXTENSION.test(spec) && lower.endsWith('.json'))
}

export function proseSpecProblem(spec) {
  const plain = typeof spec === 'string' && (PROSE_LITERAL.test(spec) || PROSE_UNDER.test(spec) || PROSE_EXTENSION.test(spec))
  if (!plain) return `${JSON.stringify(spec)} is not a plain pathspec (a literal path or directory, a literal directory then a glob, or \`*.ext\`)`
  if (spec.split('/').some(part => part === '.' || part === '..')) return `${JSON.stringify(spec)} would name the whole tree or leave it`
  if (specCouldNameConfig(spec)) return `${JSON.stringify(spec)} could name .quality-harness.json, which holds the check`
  return null
}

export function proseSpecs(root) {
  let config
  try { config = JSON.parse(readFileSync(path.join(root, '.quality-harness.json'), 'utf8')) } catch { return { specs: [], problem: null } }
  if (config === null || typeof config !== 'object' || !('prose' in config)) return { specs: [], problem: null }
  const refuse = reason => ({ specs: [], problem: `the \`prose\` declaration in .quality-harness.json was ignored: ${reason}` })
  const declared = config.prose
  if (!Array.isArray(declared) || declared.length === 0 || declared.length > PROSE_MOST) {
    return refuse(`it must be an array of one to ${PROSE_MOST} pathspecs`)
  }
  for (const spec of declared) {
    const problem = proseSpecProblem(spec)
    if (problem) return refuse(problem)
  }
  for (const spec of declared) {
    const tracked = spawnSync('git', ['-C', root, 'ls-files', '-s', '-z', '--', `:(top)${spec}`], { encoding: 'utf8', timeout: 10_000, windowsHide: true })
    if (tracked.error || tracked.status !== 0) return refuse(`git could not list ${JSON.stringify(spec)}`)
    const entries = tracked.stdout.split('\0').filter(Boolean)
    if (entries.length === 0) return refuse(`${JSON.stringify(spec)} matches no tracked path`)
    if (entries.some(entry => entry.startsWith('160000'))) return refuse(`${JSON.stringify(spec)} matches a submodule`)
  }
  return { specs: declared, problem: null }
}
