// A Workflow script is neither an ES module nor a CommonJS one, and no node parse
// goal accepts it. The Workflow tool's own contract requires the file to BEGIN with
// `export const meta = {...}` — ESM — and documents a top-level `return` as how a
// workflow yields its result — a function body. `node --check` therefore answers a
// question about a dialect it does not implement, and the answer changed under us:
// node v24.11.1 accepted all three shipped workflows and v26.8.1 rejects every one
// with `SyntaxError: Illegal return statement`, while the runtime accepts both.
//
// ⚠ A GREEN `node --check` HERE WAS NEVER EVIDENCE THE RUNTIME WOULD LOAD THE FILE,
// and a red one is not evidence it will not. So this reads the source the way the
// runtime wraps it: strip the one export the format allows, then compile the rest as
// an async function body, where a top-level `return` and a top-level `await` are both
// legal. A real syntax error still throws, which is the whole point — see
// tests/workflow-parse.test.mjs, which shows this returning dirty as well as clean.
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { argv, execPath, exit } from 'node:process'
import { pathToFileURL } from 'node:url'

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor

/**
 * Report why `source` is not a parseable Workflow script, or null when it is.
 * `name` only labels the message; nothing is read from disk here.
 */
export function checkWorkflowSource (source, name = '<source>') {
  // Only a leading `export ` on its own line is removed, and only before a
  // declaration keyword — an `export default` or a bare `export {…}` survives as a
  // syntax error rather than being quietly accepted, because the format does not
  // permit them and silently tolerating one is how a check stops being a check.
  const body = source.replace(/^export (?=(?:const|let|var|function|class|async) )/gm, '')
  try {
    new AsyncFunction(body)
  } catch (err) {
    return `${name}: ${err.message}`
  }
  return null
}

/**
 * Check each named file with `check`; returns the failure messages, empty when all
 * pass. `check` is checkWorkflowSource by default and checkJsSource under `--js`.
 */
export function checkWorkflowFiles (files, check = checkWorkflowSource) {
  return files.map(file => {
    let source
    try {
      source = readFileSync(file, 'utf8')
    } catch (err) {
      // Unreadable is not "does not parse" and must not borrow that word (§3).
      return `${file}: COULD NOT READ — ${err.message}`
    }
    return check(source, file)
  }).filter(Boolean)
}

/**
 * Report why `source` parses as neither an ES module nor a Workflow script, or null
 * when one of them accepts it. `name` only labels the message.
 *
 * ⚠ THE MODULE HALF GOES THROUGH A `.mjs` COPY, NEVER `node --check <the .js file>`.
 * Measured on v24.11.1: `node --check` exits 0 on a `.js` file whose contents include
 * an `export`, whatever syntax error follows it — `export const a = 1` then
 * `const broken = (` is accepted, while the same bytes named `.mjs` are refused. So
 * the obvious call is vacuous on exactly the files most likely to be modules, and a
 * silent advisory would mean nothing (BACKLOG §161, CLAUDE.md §4).
 */
export function checkJsSource (source, name = '<source>') {
  const workflow = checkWorkflowSource(source, name)
  if (workflow === null) return null
  const dir = mkdtempSync(join(tmpdir(), 'qh-parse-'))
  try {
    const copy = join(dir, 'candidate.mjs')
    writeFileSync(copy, source)
    const checked = spawnSync(execPath, ['--check', copy], { encoding: 'utf8', timeout: 60_000 })
    if (checked.status === 0) return null
    // Could-not-spawn is not a syntax error and must not be reported as one (§3).
    if (checked.error) return `${name}: COULD NOT CHECK — ${checked.error.message}`
    // The copy's path is an implementation detail of this check and naming it in the
    // advice sends the reader to a file that has already been deleted.
    // BOTH SPELLINGS OF THE COPY'S PATH, because node reports the resolved one and
    // `/tmp` is a symlink to `/private/tmp` on macOS (CLAUDE.md §7) — substituting
    // only the path we built leaves a `/private/private/…` splice in the advice.
    const said = [realpathSync(copy), copy].reduce((text, path) => text.split(path).join(name),
      `${checked.stderr ?? ''}`).trim().split('\n').slice(0, 4).join('\n')
    return `${name}: parses as neither a module nor a Workflow script\n${said}`
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

if (argv[1] && import.meta.url === pathToFileURL(argv[1]).href) {
  const args = argv.slice(2)
  if (args.includes('--help') || args.includes('-h')) {
    console.log('usage: workflow-parse.mjs [--js] <file>...\n\n' +
      'Parses each file as the Workflow tool loads it: an ESM `export const meta`\n' +
      'header plus an async function body, so a top-level `return` is legal.\n\n' +
      '--js  accept EITHER an ES module or a Workflow script, for an editor-side\n' +
      '      check on a .js file that may be either. The module half goes through a\n' +
      '      .mjs copy, because `node --check` on a .js file containing an `export`\n' +
      '      exits 0 whatever syntax error follows (measured on v24.11.1).\n\n' +
      'Exits 0 when every file passes, 1 naming each that does not, 2 on usage.')
    exit(0)
  }
  const either = args.includes('--js')
  const files = args.filter(arg => arg !== '--js')
  if (files.length === 0) {
    console.error('workflow-parse.mjs: name at least one file')
    exit(2)
  }
  const failures = checkWorkflowFiles(files, either ? checkJsSource : checkWorkflowSource)
  for (const failure of failures) console.error(failure)
  exit(failures.length ? 1 : 0)
}
