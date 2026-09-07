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
import { fileURLToPath, pathToFileURL } from 'node:url'

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor

// The Workflow tool's contract: the script BEGINS with `export const meta = {...}`,
// and that is the only export the format has. Leading comments and blank lines are
// tolerated because they are ordinary in the shipped files; anything else before the
// header is not a Workflow script.
// ⚠ LEADING WHITESPACE IS OUTSIDE THE COMMENT GROUP. With `\s*` only inside it, a
// blank first line or a UTF-8 BOM made the header unfindable and a correct workflow
// was REFUSED — a gate that fails correct files, which is the same defect as one that
// passes broken ones wearing the other sign.
// ⚠ `\b` AFTER `meta` WAS NOT A BOUNDARY FOR AN IDENTIFIER. It is ASCII-word-based,
// so `export const meta$` and `export const metaπ` both satisfied it while exporting
// a binding that is not `meta`. The format writes `export const meta = {...}`, so the
// assignment is required and no boundary class has to be got right.
const META_HEADER = /^\s*(?:(?:\/\/[^\n]*|\/\*[\s\S]*?\*\/)\s*)*export (?=const meta\s*=)/

/**
 * Report why `source` is not a parseable Workflow script, or null when it is.
 * `name` only labels the message; nothing is read from disk here.
 */
export function checkWorkflowSource (source, name = '<source>') {
  // ⚠ EXACTLY ONE EXPORT IS REMOVED, AND ONLY THE REQUIRED HEADER. A global,
  // multiline strip accepted files this grammar does not have — a missing header, a
  // header that is not first, a second `export const`, an export nested in a block —
  // and rewrote text inside template literals on the way past. Found by a
  // different-lineage review of 2cde29f, 2026-09-07.
  if (!META_HEADER.test(source)) {
    return `${name}: no \`export const meta\` header, so this is not a Workflow script`
  }
  const body = source.replace(META_HEADER, match => match.slice(0, -'export '.length))
  try {
    new AsyncFunction(body)
  } catch (err) {
    // A LATER export is left in place on purpose: the format has one, so a second
    // one reaches the parser and is refused there rather than being stripped silent.
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
      return { file, unchecked: true, message: `${file}: COULD NOT READ — ${err.message}` }
    }
    const message = check(source, file)
    if (message === null) return null
    // ⚠ THE FLAG IS SET WHERE THE FACT IS KNOWN, NOT BY READING THE MESSAGE BACK. A
    // caller that partitioned on `/COULD NOT CHECK/` in the text could be spoofed by a
    // FILENAME containing those words, since the file's own name is in every message.
    return { file, unchecked: kindOf(message, file) !== 'finding', message }
  }).filter(Boolean)
}

/** The message's leading verdict word, read after the file name this tool prefixes. */
function kindOf (message, file) {
  const rest = message.startsWith(`${file}: `) ? message.slice(file.length + 2) : message
  // The COMPLETE token and its delimiter. Unbounded prefixes classified a finding
  // that merely began `COULD NOT CHECKMATE …` as could-not-look — reachable through
  // the exported `check` seam, which any caller may supply.
  return rest.startsWith('COULD NOT CHECK — ') ? 'COULD NOT CHECK'
    : rest.startsWith('COULD NOT READ — ') ? 'COULD NOT READ' : 'finding'
}

// The default temp-directory factory, injectable so a test can make it fail on every
// platform — `TMPDIR` is not what node reads on Windows (CLAUDE.md §7).
const defaultTempDir = () => mkdtempSync(join(tmpdir(), 'qh-parse-'))

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
export function checkJsSource (source, name = '<source>', options = {}) {
  // A `.js` file is ambiguous: either dialect is a legitimate answer for it.
  if (checkWorkflowSource(source, name) === null) return null
  return checkModuleSource(source, name, { ...options, verdict: 'parses as neither a module nor a Workflow script' })
}

/**
 * Report why `source` is not a parseable ES module, or null when it is. This is the
 * whole answer for a `.mjs` file, where the module goal is the only goal there is —
 * a top-level `return` in one is broken, and the Workflow fallback used to accept it.
 */
export function checkModuleSource (source, name = '<source>', { spawn = spawnSync, makeTempDir = defaultTempDir, verdict = 'does not parse as an ES module' } = {}) {
  // ⚠ OUTSIDE THE `try`, MAKING THE TEMP DIRECTORY IS ITSELF A THING THAT CAN FAIL.
  // An unusable temp directory threw past every handler here, so the hook printed a
  // raw stack and its `|| true` turned that into advice nobody could act on. A
  // resource this check needs and cannot get is could-not-look, not a syntax error
  // (ADR-005).
  //
  // ⚠ AND IT IS A SEAM, NOT AN ENVIRONMENT VARIABLE. A test that broke this by setting
  // `TMPDIR` proved nothing on Windows, where node reads `TEMP`/`TMP` instead — CI
  // went red with the check cheerfully succeeding. The platform is a parameter
  // (CLAUDE.md §7).
  let dir
  try {
    dir = makeTempDir()
  } catch (err) {
    return `${name}: COULD NOT CHECK — no usable temporary directory (${err.message})`
  }
  try {
    const copy = join(dir, 'candidate.mjs')
    writeFileSync(copy, source)
    const checked = spawn(execPath, ['--check', copy], { encoding: 'utf8', timeout: 60_000 })
    // ⚠ READ THE FAILURE FIELDS BEFORE THE STATUS, NOT AFTER. `spawnSync` can return
    // status 0 ALONGSIDE an ETIMEDOUT error, and a killed child returns a null status
    // with no error at all — so `status === 0` tested first hands back a clean answer
    // for a check that never finished, and the null case falls through to a verdict
    // nothing measured. Found by a different-lineage review of 2cde29f, 2026-09-07.
    if (checked.error) return `${name}: COULD NOT CHECK — ${checked.error.message}`
    if (checked.signal) return `${name}: COULD NOT CHECK — the parse was killed by ${checked.signal}`
    if (typeof checked.status !== 'number') {
      return `${name}: COULD NOT CHECK — the parse returned no exit status`
    }
    if (checked.status === 0) return null
    // The copy's path is an implementation detail of this check and naming it in the
    // advice sends the reader to a file that has already been deleted.
    // BOTH SPELLINGS OF THE COPY'S PATH, because node reports the resolved one and
    // `/tmp` is a symlink to `/private/tmp` on macOS (CLAUDE.md §7) — substituting
    // only the path we built leaves a `/private/private/…` splice in the advice.
    const said = [realpathSync(copy), copy].reduce((text, path) => text.split(path).join(name),
      `${checked.stderr ?? ''}`).trim().split('\n').slice(0, 4).join('\n')
    return `${name}: ${verdict}\n${said}`
  } catch (err) {
    return `${name}: COULD NOT CHECK — ${err.message}`
  } finally {
    // Cleanup must not be able to replace the answer: `force` swallows a missing
    // directory, and a throw here would discard a verdict already decided above.
    try { rmSync(dir, { recursive: true, force: true }) } catch { /* the tmpdir outlives us */ }
  }
}

// ⚠ COMPARE RESOLVED PATHS, NOT THE URL AND argv[1] AS GIVEN. `/var` is a symlink to
// `/private/var` on macOS and `/tmp` to `/private/tmp` (CLAUDE.md §7), so a script
// invoked through the unresolved spelling has an `import.meta.url` that does not
// match — and this block then silently does nothing while exiting 0, which is the
// most flattering failure a checker can have. Caught by a test that ran the hook from
// a temporary directory, 2026-09-07.
const invokedDirectly = () => {
  if (!argv[1]) return false
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(argv[1])
  } catch {
    return import.meta.url === pathToFileURL(argv[1]).href
  }
}

if (invokedDirectly()) {
  const args = argv.slice(2)
  if (args.includes('--help') || args.includes('-h')) {
    console.log('usage: workflow-parse.mjs [--js] <file>...\n\n' +
      'Parses each file as the Workflow tool loads it: an ESM `export const meta`\n' +
      'header plus an async function body, so a top-level `return` is legal.\n\n' +
      '--js  accept EITHER an ES module or a Workflow script, for an editor-side\n' +
      '      check on a .js file that may be either. The module half goes through a\n' +
      '      .mjs copy, because `node --check` on a .js file containing an `export`\n' +
      '      exits 0 whatever syntax error follows (measured on v24.11.1).\n\n' +
      'Exits 0 when every file passes, 1 naming each that does not, 2 on usage, and 4\n' +
      'when it could not complete — a caller that treats 4 as a finding is reporting an\n' +
      'observation nothing made.')
    exit(0)
  }
  // ⚠ THREE MODES, BECAUSE THE EXTENSION SELECTS THE PARSE GOAL. `--js` accepts an
  // ES module OR a Workflow script, which is right for a `.js` file and WRONG for a
  // `.mjs` one: node's module goal is the only goal a `.mjs` has, so the Workflow
  // fallback would silently accept a top-level `return` that the runtime refuses.
  const mode = args.includes('--module') ? checkModuleSource
    : args.includes('--js') ? checkJsSource
      : checkWorkflowSource
  const files = args.filter(arg => arg !== '--js' && arg !== '--module')
  if (files.length === 0) {
    console.error('workflow-parse.mjs: name at least one file')
    exit(2)
  }
  // ⚠ EXIT 4, NOT 1, FOR A CHECK THAT DID NOT COMPLETE. A caller can only tell a
  // finding from a crash by the code, and node's own startup failures already own 1
  // — so an uncaught throw here would arrive at the post-edit hook as "the checker
  // looked and found this stack trace" (ADR-005, and CLAUDE.md §3).
  let outcomes
  try {
    outcomes = checkWorkflowFiles(files, mode)
  } catch (err) {
    console.error(`workflow-parse.mjs: UNRUN — the check did not complete: ${err.message}`)
    exit(4)
  }
  for (const outcome of outcomes) console.error(outcome.message)
  // ⚠ A MARKER ON STDOUT, BECAUSE AN EXIT CODE CANNOT CARRY THIS. If this file is
  // itself unparseable or its interpreter dies, node exits 1 — the code that means
  // "the checker looked and found something" — and its stack trace is then printed to
  // the user as if it described THEIR file. A caller that requires this line has
  // positive evidence the check ran; its absence is could-not-look (ADR-005).
  //
  // ⚠ AND `process.exitCode`, NEVER `exit()` AFTER WRITING. `exit()` can discard a
  // pipe's pending stdout, so the very line that says the check completed is the line
  // most likely to be lost — node's own documentation warns about this.
  console.log('QH-PARSE-COMPLETE')
  // ⚠ ANY UNCHECKED FILE DOMINATES. "I did not look at all of them" must not be
  // masked by "and here is what I found in the rest": a status-only caller reading 1
  // would take a partial run for a complete one. The messages are all still printed.
  process.exitCode = outcomes.some(outcome => outcome.unchecked) ? 4
    : outcomes.length ? 1
      : 0
}
