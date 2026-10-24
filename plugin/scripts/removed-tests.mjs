// The advice a passing check adds when a test file the last pass of the same command ran with is gone and did not move: a test
// that passed is removed with its reason, never unremarked (the owner, 2026-10-24). The check ledger keeps no tree an old pass
// can be read back from (`observe` writes its objects to a scratch directory it removes), so each pass leaves its test files
// here, by path and content, in `passed-tests.json`. It reads git and the working tree, writes only that file, and never
// changes the check's exit (CLAUDE.md §3). A full check's count of passed tests, read from its runners' own summaries as the
// output streams past, is kept beside them, and a pass that ran fewer than the last one says so (the owner, 2026-10-24).
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { StringDecoder } from 'node:string_decoder'
import { stateDir } from './event-log.mjs'

const STATE = 'passed-tests.json'
const SHOWN = 10
export const GONE = 'test file(s) the last pass of this check ran with are gone, and none moved'
export const UNREAD = 'whether a test file was removed since the last pass is not known'
export const TESTS_GONE = 'fewer tests than at the last pass of this check, and the missing ones did not move'
export const SKIPPED = 'tests the last pass of this check ran are skipped in place now'
export const COUNT_DROP = 'fewer tests passed than at the last pass of this check, and no removal above accounts for it'
const REASON = 'A test that passed is removed only with its reason: say why in the commit message, or restore it.'

// A test file by the name its runner collects by default, as each runner documents it: jest, vitest and node --test
// (`*.test.*`, `*.spec.*`), go test (`*_test.go`, outside `testdata` and any name starting with `.` or `_`, which
// `go help packages` says the go tool ignores), pytest (`test_*.py`, `*_test.py`), PHPUnit (`*Test.php`), RSpec (`*_spec.rb`).
// Only this repository's own `*.test.mjs` and `*_test.go` were run. A name not here is not judged at all: a file a runner
// collects by its configuration is missed, and that costs a weaker nudge, never a false one (CLAUDE.md §16).
const TEST_FILE = [
  /\.(?:test|spec)\.[cm]?[jt]sx?$/,
  /(?:^|\/)test_[^/]*\.py$/,
  /_test\.py$/,
  /[^/]Test\.php$/,
  /_spec\.rb$/,
]
const goTest = file => file.endsWith('_test.go') && file.split('/').every(part => part !== 'testdata' && !/^[._]/.test(part))
export const isTestFile = file => goTest(file) || TEST_FILE.some(pattern => pattern.test(file))

// The tests a file defines, by name, as each runner was measured to collect them (2026-10-24, one fixture per runner):
// - node:test (node v24.22.1) runs `test(` and `it(` whose first argument is a string literal (quoted, or a template literal
//   with no `${`), the name on the call's line or the next; it skips `.skip(`, `{ skip: true }` and `{ skip: '<reason>' }`,
//   and `.todo` still runs. jest and vitest use the same calls and were not run here.
// - pytest 9.0.3 (Python 3.14) runs `def test_*` and `async def test_*`, top level or in a class, and skips one under
//   `@pytest.mark.skip`; `skipif` depends on its condition and is not read as a skip.
// - go test (go1.27.3) runs `func Test<not a lowercase letter>…(t *testing.T)`, the parameter list on one line or several. A Go
//   skip is `t.Skip` in the body, behind any condition, so none is read.
// PHP and Ruby had no runner here, so their names are not read; the file-level check still covers them.
// ⚠ A FILE IS READ WHOLE OR NOT AT ALL (the Codex review of 225aa0f2, six inputs where a name read wrongly gave false advice). A
// JS file's names count only when every `test(`/`it(` call in it, with any member after it, is a definition this recognises: a
// call at the start of a line whose name is a literal. A name built in a loop, `test.each`, a call inside a one-line `describe`
// or a template with `${}` makes the file unread, and an unread file is compared with nothing, at either pass. A `test(` after a
// quote, a dot or a word character is no call: a code example in a string, `validator.it(`. Lines in a comment (`//`, a block
// comment opened at the start of a line) or a Python triple-quoted string are not read: a test commented out is a test the
// runner no longer runs. What is left is a boundary, not a promise: a line inside a multi-line template literal that starts
// with `test('…'` is read as a definition (CLAUDE.md §16).
const JS_DEFINITION = /^[ \t]*(?:await[ \t]+)?(?:test|it)(\.skip|\.todo|\.only)?[ \t]*\([ \t\r\n]*(?:'((?:\\.|[^'\\\r\n])*)'|"((?:\\.|[^"\\\r\n])*)"|`((?:\\.|[^`\\$])*)`)[ \t\r\n]*(,[ \t\r\n]*\{[^{}]*\})?/gm
// A hook (`test.after(`, `it.beforeEach(`, `test.mock`) defines no test, so it is no call this has to name.
// The parenthesis may follow on a later line (`test\n('b')`, the review of fa59d357): such a call has no definition here, so its
// file is unread rather than read without it. A space alone before it is not a call, so `it (` in prose is not one.
const JS_CALL = /(?<![\w$.'"`])(?:test|it)(?![ \t]*\.[ \t]*(?:after|afterEach|before|beforeEach|mock)\b)(?:[ \t]*\.[ \t]*\w+)*(?:[ \t]*\r?\n[ \t\r\n]*)?\(/g
// A `skip` property, after the brace or a comma: `{ label: 'skip: true,' }` holds the words in a string and is no skip.
const JS_SKIP_OPTION = /[{,][ \t\r\n]*skip[ \t]*:[ \t]*(?:true|'[^'\r\n]+'|"[^"\r\n]+")[ \t\r\n]*[,}]/
const PY_DEF = /^[ \t]*(?:async[ \t]+)?def[ \t]+(test\w*)[ \t]*\(/
const PY_SKIP = /^[ \t]*@pytest\.mark\.skip\b/
const GO_TEST = /^func[ \t]+(Test(?:[^a-z\s(]\w*)?)[ \t]*\([ \t\r\n]*\w+[ \t]+\*testing\.T[ \t\r\n]*,?[ \t\r\n]*\)/gm
const GO_CANDIDATE = /^func[ \t]+(Test(?:[^a-z\s(]\w*)?)[ \t]*\(/gm
// A literal's characters as the runtime sees them, so `'it\'s'` and `"it's"` are one name. Nothing is evaluated.
const ESCAPES = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', v: '\v', 0: '\0' }
const unescaped = text => text.replace(/\\(?:u\{([0-9a-fA-F]+)\}|u([0-9a-fA-F]{4})|x([0-9a-fA-F]{2})|(\r\n|[\s\S]))/g,
  (_, braced, four, two, other) => braced || four || two ? String.fromCodePoint(Number.parseInt(braced || four || two, 16))
    : other === '\n' || other === '\r\n' ? '' : ESCAPES[other] ?? other)

// Where a block comment opens on `line`, or -1: the first `/*` that is not inside a quote on that line and not after a `//`
// that began a comment already. A glob in a string (`'migrations/*.sql'`) is no comment: read as one, it made this repository's
// lifecycle tests unread (measured 2026-10-24, 292 of 326 files read whole, 312 with this).
function commentOpen(line) {
  let quote = null
  for (let at = 0; at < line.length - 1; at++) {
    const char = line[at]
    if (quote) { if (char === '\\') at++; else if (char === quote) quote = null; continue }
    if (char === "'" || char === '"' || char === '`') quote = char
    else if (char === '/' && line[at + 1] === '/') return -1
    else if (char === '/' && line[at + 1] === '*') return at
  }
  return -1
}

// The lines of `text` that are code: not a whole-line comment, and not inside a block comment. A line a block comment opens or
// closes with code beside it, outside the comment, cannot be cut cleanly here (`ends here */ test('b')`, the review of
// 4ff15e21), so the file is unread: null. A comment that opens and closes inside a code line is left in it, where a definition's
// start cannot hide behind it: `/* x */ test('b')` is a call no definition matches, so that file is unread too.
function codeLines(text, comment) {
  const kept = []
  let inBlock = false
  for (const line of text.split('\n')) {
    if (inBlock) {
      const end = line.indexOf('*/')
      if (end < 0) continue
      inBlock = false
      if (line.slice(end + 2).trim()) return null
      continue
    }
    if (comment.test(line)) continue
    const open = commentOpen(line)
    if (open >= 0 && line.indexOf('*/', open + 2) < 0) {
      if (line.slice(0, open).trim()) return null
      inBlock = true
      continue
    }
    kept.push(line)
  }
  return inBlock ? null : kept.join('\n')
}

/** The names a test file defines, `{ run, skip }`, or null when its runner was not measured or the file cannot be read whole. */
export function testNames(file, text) {
  const run = []
  const skip = []
  if (/\.[cm]?[jt]sx?$/.test(file)) {
    const code = codeLines(text, /^[ \t]*(?:\/\/|\*)/)
    if (code === null) return null
    const definitions = [...code.matchAll(JS_DEFINITION)]
    // Each definition must be a call and each call a definition, by where it starts: equal counts of two different sets read a
    // file in part (the verification review of 9cac4e63: `test ('a')` beside `{ test('b') }`).
    const at = match => match.index + match[0].length - match[0].replace(/^[ \t]*(?:await[ \t]+)?/, '').length
    const calls = new Set([...code.matchAll(JS_CALL)].map(match => match.index))
    if (definitions.length !== calls.size || definitions.some(match => !calls.has(at(match)))) return null
    for (const match of definitions) {
      // Options whose skip this cannot know make the file unread: a spread may override it, and a repeated key does.
      if (match[5] && (match[5].includes('...') || (match[5].match(/[{,][ \t\r\n]*skip[ \t]*:/g) ?? []).length > 1)) return null
      const name = unescaped(match[2] ?? match[3] ?? match[4])
      ;(match[1] === '.skip' || (match[5] && JS_SKIP_OPTION.test(match[5])) ? skip : run).push(name)
    }
    return { run, skip }
  }
  if (file.endsWith('.py')) {
    let skipped = false
    let quoted = null
    // The `def`s and `class`es enclosing the line, by indent. pytest collects a test function at the top level or in a class
    // named `Test…`; one inside another function, or in another class, is not collected, and this cannot tell what is: the file
    // is unread (the review of fa59d357: a nested `def test_helper` read as a test).
    const enclosing = []
    for (const line of text.split('\n')) {
      // A line inside a triple-quoted string is text, and is not read. A comment is dropped before its quote marks are counted,
      // and a definition is read before the marks on its own line open a string (`def test_a(): """Doc."""`). A `#` beside an odd
      // number of marks is a comment holding them or a string holding the `#`, which this cannot tell apart: the file is unread.
      const quotes = [...line.matchAll(/"""|'''/g)].map(match => match[0])
      if (quoted) {
        for (const mark of quotes) quoted = quoted === null ? mark : quoted === mark ? null : quoted
        continue
      }
      if (/^[ \t]*(?:#|$)/.test(line)) continue
      if (quotes.length % 2 && line.includes('#')) return null
      const indent = /^[ \t]*/.exec(line)[0].length
      while (enclosing.length && enclosing.at(-1).indent >= indent) enclosing.pop()
      if (PY_SKIP.test(line)) skipped = true
      const def = PY_DEF.exec(line)
      if (def) {
        if (enclosing.some(scope => scope.kind === 'def' || !/^Test/.test(scope.name))) return null
        ;(skipped ? skip : run).push(def[1])
      }
      const scope = /^[ \t]*(?:async[ \t]+)?(def|class)[ \t]+(\w+)/.exec(line)
      if (scope) enclosing.push({ indent, kind: scope[1], name: scope[2] })
      if (def || scope) skipped = false
      for (const mark of quotes) quoted = quoted === null ? mark : quoted === mark ? null : quoted
    }
    return { run, skip }
  }
  if (file.endsWith('.go')) {
    const code = codeLines(text, /^[ \t]*\/\//)
    if (code === null) return null
    const candidates = [...code.matchAll(GO_CANDIDATE)].filter(match => match[1] !== 'TestMain')
    const tests = [...code.matchAll(GO_TEST)]
    if (tests.length !== candidates.length) return null
    for (const match of tests) run.push(match[1])
    return { run, skip }
  }
  return null
}

const gitIn = (root, args) => spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', timeout: 30_000, maxBuffer: 64 * 1024 * 1024, windowsHide: true, env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' } })

// The test files in the working tree as the check's tree holds them (tracked or untracked, not ignored), each by a hash of its
// bytes and, where its runner was measured, the names of its tests; or null when git could not list them. An index entry whose
// file is gone from the disk is not in the tree; a listed file that is there and cannot be read is `unread`, which is not gone.
function testFiles(root) {
  const listed = gitIn(root, ['ls-files', '-z', '--cached', '--others', '--exclude-standard'])
  if (listed.error || listed.status !== 0) return null
  const files = {}
  const tests = {}
  const unread = new Set()
  // A file whose runner was measured and whose names could not be read whole: a test may have moved into it, unseen.
  const unnamed = new Set()
  for (const file of new Set(listed.stdout.split('\0').filter(Boolean))) {
    if (!isTestFile(file)) continue
    let bytes
    try { bytes = readFileSync(path.join(root, file)) } catch (failure) {
      if (failure?.code !== 'ENOENT' && failure?.code !== 'ENOTDIR') unread.add(file)
      continue
    }
    files[file] = createHash('sha256').update(bytes).digest('hex')
    const names = testNames(file, bytes.toString('utf8'))
    if (names) tests[file] = names
    else if (/\.(?:[cm]?[jt]sx?|py|go)$/.test(file)) unnamed.add(file)
  }
  return { files, tests, unread, unnamed }
}

// Whether a path the last pass had is gone from the disk: true when nothing is there, false when something is (a file now
// ignored, so git no longer lists it, is still there and still runnable), null when the disk cannot say. A link is followed: one
// whose target is gone is no test anybody can run (the verification review of 975ce16d).
function goneFromDisk(root, file) {
  try { statSync(path.join(root, file)); return false } catch (failure) {
    return failure?.code === 'ENOENT' || failure?.code === 'ENOTDIR' ? true : null
  }
}

// Whether the pass at `before` is history of `head`: the same commit, or an ancestor of it. A switch to a branch without that
// pass is not a removal, so it says nothing; a commit git cannot place is null.
function onHistory(root, before, head) {
  if (before === head) return true
  if (typeof before !== 'string' || typeof head !== 'string') return false
  const asked = gitIn(root, ['merge-base', '--is-ancestor', before, head])
  return asked.error ? null : asked.status === 0 ? true : asked.status === 1 ? false : null
}

// The entry as this module writes it, or not one at all: a HEAD that is a full sha or null, a map of paths to sha-256s, and,
// from 3.8.57, a map of paths to the names of their tests. An entry written before that has no `tests` and is read as one with
// no names to compare. Anything else is a record this cannot read, never a record of no test files (ADR-005).
const plain = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const names = value => Array.isArray(value) && value.every(name => typeof name === 'string')
const written = entry => plain(entry) && (entry.head === null || (typeof entry.head === 'string' && /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/.test(entry.head)))
  && plain(entry.files) && Object.entries(entry.files).every(([name, hash]) => name !== '' && !name.includes('\0') && typeof hash === 'string' && /^[0-9a-f]{64}$/.test(hash))
  && (entry.tests === undefined || (plain(entry.tests) && Object.values(entry.tests).every(found => plain(found) && names(found.run) && names(found.skip))))
  && (entry.count === undefined || (plain(entry.count) && [entry.count.passed, entry.count.skipped].every(n => Number.isSafeInteger(n) && n >= 0)))

// The tests a run reports it passed and skipped, read from each runner's own summary as the output streams past: the whole run,
// not the tail qh-check keeps, since this repository's summary comes after about 300 KB of output. Measured 2026-10-24, one
// fixture each:
// - node:test v24.22.1, spec and TAP reporters: `ℹ pass N` / `# pass N`, and `skipped N`;
// - pytest 9.0.3, default, -q and -v: `N passed, M skipped … in Xs`;
// - unittest on Python 3.15: `Ran N tests`, then `OK` or `OK (skipped=M)`;
// - go test (go1.27.3) -v: `--- PASS:` and `--- SKIP:` at the start of a line (a subtest is indented);
// - go test -json: the pass or skip event of a top-level test.
// node's dot reporter and plain `go test` print no count, so a run whose output holds no summary has no count, never zero
// (ADR-005). Every summary the output holds is added, so a check that runs several suites is counted whole. This repository's own
// full output held no other line of these shapes (measured the same day).
const ANSI = /\x1b\[[0-9;?]*[A-Za-z]/g
export function testCounter() {
  const decoder = new StringDecoder('utf8')
  let carry = ''
  let passed = 0
  let skipped = 0
  let counted = false
  let ran = null
  const add = (word, n) => { counted = true; if (word === 'pass' || word === 'passed') passed += n; else if (word === 'skip' || word === 'skipped') skipped += n }
  const read = raw => {
    const line = raw.replace(ANSI, '').replace(/\r$/, '')
    let match
    if ((match = /^(?:ℹ|#) (pass|skipped) (\d+)$/.exec(line))) return add(match[1], Number(match[2]))
    if ((match = /^=*[ \t]*((?:\d+ [a-z]+(?:, )?)+) in \d+(?:\.\d+)?s\b/.exec(line))) {
      counted = true
      for (const [, n, word] of match[1].matchAll(/(\d+) ([a-z]+)/g)) add(word, Number(n))
      return
    }
    if ((match = /^Ran (\d+) tests? in /.exec(line))) { ran = Number(match[1]); return }
    if (ran !== null && (match = /^OK(?: \((.*)\))?$/.exec(line))) {
      const said = name => Number(new RegExp(`${name}=(\\d+)`).exec(match[1] ?? '')?.[1] ?? 0)
      add('passed', ran - said('skipped') - said('expected failures'))
      add('skipped', said('skipped'))
      ran = null
      return
    }
    if ((match = /^--- (PASS|SKIP): /.exec(line))) return add(match[1].toLowerCase(), 1)
    if ((match = /"Action":"(pass|skip)".*"Test":"([^"]*)"/.exec(line)) && !match[2].includes('/')) add(match[1], 1)
  }
  return {
    feed: chunk => {
      const lines = (carry + decoder.write(chunk)).split('\n')
      carry = lines.pop()
      for (const line of lines) read(line)
    },
    result: () => {
      read(carry + decoder.end())
      carry = ''
      return counted ? { passed, skipped } : null
    },
  }
}

// `from` less `less`, counting repeats: a name twice in a file is two tests.
function minus(from, less) {
  const left = new Map()
  for (const name of less) left.set(name, (left.get(name) ?? 0) + 1)
  return from.filter(name => {
    const count = left.get(name) ?? 0
    if (count) left.set(name, count - 1)
    return !count
  })
}

const shown = files => files.slice(0, SHOWN).map(file => `\`${file}\``).join(', ') + (files.length > SHOWN ? `, +${files.length - SHOWN} more` : '')
const named = list => list.slice(0, SHOWN).map(name => `\`${name}\``).join(', ') + (list.length > SHOWN ? `, +${list.length - SHOWN} more` : '')

// Within the files both passes had and whose bytes changed: the tests gone from a file that now has fewer, less any name that
// is new somewhere in the tree (a test moved to another file is not gone, and a rename in place keeps the count), and the tests
// the last pass ran that are skipped now. Said beside the file-level sentence, never in place of it.
function testLines(last, now) {
  const before = last.tests
  const all = found => [...found.run, ...found.skip]
  const movedTo = new Set(Object.entries(now.tests).flatMap(([file, found]) => minus(all(found), before[file] ? all(before[file]) : [])))
  const movedBlind = [...now.unnamed].some(file => last.files[file] !== now.files[file])
  const fewer = []
  const skipped = []
  for (const [file, found] of Object.entries(now.tests)) {
    const was = before[file]
    if (!was || last.files[file] === now.files[file]) continue
    // "Did not move" needs every place a test could have moved to read: a changed or new file that could not be read whole may
    // hold it (the review of 4ff15e21), so no test is named gone while one exists.
    if (!movedBlind && all(found).length < all(was).length) {
      const gone = minus(all(was), all(found)).filter(name => !movedTo.has(name))
      if (gone.length) fewer.push(`\`${file}\` (${all(was).length - all(found).length} fewer; not there now: ${named(gone)})`)
    }
    // A skip now is the last pass's running test only where as many fewer of that name run: `test.skip('same')` added beside a
    // `test('same')` that still runs is a new skipped test, not a running one skipped.
    const stoppedRunning = minus(was.run, found.run)
    const nowSkipped = minus(found.skip, was.skip).filter(name => {
      const at = stoppedRunning.indexOf(name)
      if (at >= 0) stoppedRunning.splice(at, 1)
      return at >= 0
    })
    if (nowSkipped.length) skipped.push(`\`${file}\`: ${named(nowSkipped)}`)
  }
  const lines = []
  if (fewer.length) lines.push(`${TESTS_GONE}: ${fewer.slice(0, SHOWN).join('; ')}${fewer.length > SHOWN ? `; +${fewer.length - SHOWN} more file(s)` : ''}. ${REASON}`)
  if (skipped.length) lines.push(`${SKIPPED}: ${skipped.slice(0, SHOWN).join('; ')}${skipped.length > SHOWN ? `; +${skipped.length - SHOWN} more file(s)` : ''}. ${REASON}`)
  return lines
}

/**
 * After a pass of `command` (`record` is its row, `fast` which ledger it is in): the sentence to say, or null, and this pass's
 * test files kept in place of the last one's. Compared only with the last pass of the same command in the same ledger, and only
 * when that pass's HEAD is history of this one. A file is gone when git no longer lists it AND nothing is at its path; it moved,
 * and is not gone, when its exact bytes are at a path the last pass did not have. A move with edits reads as gone, and the
 * sentence names the new test files so that reads as what it is. A path the last pass had that is still on the disk but not
 * listed, or not readable, keeps its last hash, so it is judged again when it does go.
 */
export function removedTestsLine({ root, fast, command, record, counted = null }) {
  const file = path.join(stateDir(root), STATE)
  const key = `${fast ? 'fast' : 'full'} ${command}`
  let state = {}
  let unread = null
  try { state = JSON.parse(readFileSync(file, 'utf8')) } catch (failure) { if (failure?.code !== 'ENOENT') unread = failure.code ?? 'it does not parse' }
  if (!plain(state)) { state = {}; unread ??= 'it is not an object' }
  const last = state[key]
  if (!unread && last !== undefined && !written(last)) unread = 'its entry for this check is not one qh-check writes'
  const now = testFiles(root)
  if (now === null) return `${UNREAD}: git could not list the working tree's files, so this pass's test files are not kept either.`
  const head = record.after?.head ?? null
  const kept = { ...now.files }
  const keptTests = { ...now.tests }
  let line = null
  if (unread) {
    state = {}
    line = `${UNREAD}: ${STATE} could not be read (${unread}); this pass's test files are kept in its place.`
  } else if (last !== undefined) {
    const comparable = onHistory(root, last.head, head)
    if (comparable === null) {
      line = `${UNREAD}: git could not say whether the last pass's commit is history of this one.`
    } else if (comparable) {
      const added = Object.keys(now.files).filter(name => !(name in last.files)).sort()
      const movedTo = new Set(added.map(name => now.files[name]))
      const gone = []
      let unsure = 0
      for (const name of Object.keys(last.files).filter(name => !(name in now.files)).sort()) {
        const absent = now.unread.has(name) ? null : goneFromDisk(root, name)
        if (absent === true && !movedTo.has(last.files[name])) gone.push(name)
        if (absent !== true) { kept[name] = last.files[name]; if (last.tests?.[name]) keptTests[name] = last.tests[name] }
        if (absent === null) unsure += 1
      }
      if (gone.length) {
        line = `${gone.length} ${GONE}: ${shown(gone)}. ${REASON}`
          + (added.length ? ` New test files since that pass: ${shown(added)}; one that is a moved file with edits loses nothing.` : '')
      }
      const inFiles = last.tests ? testLines(last, now) : []
      if (inFiles.length) line = [line, ...inFiles].filter(Boolean).join(' ')
      // The count speaks only where nothing above already named a removal: a test directory dropped from the runner's
      // configuration, or a name this cannot read, is the drop the names cannot see. A fast check may select its tests, so
      // only a full one is counted.
      if (!line && counted && last.count && counted.passed < last.count.passed) {
        line = `${COUNT_DROP}: ${counted.passed} passed, against ${last.count.passed} at that pass`
          + (counted.skipped > last.count.skipped ? `, and ${counted.skipped - last.count.skipped} more skipped` : '') + `. ${REASON}`
      }
      if (unsure) line = `${line ? `${line} ` : ''}${UNREAD} for ${unsure} test file(s) the disk could not be asked about.`
    }
  }
  try {
    mkdirSync(path.dirname(file), { recursive: true })
    // Read again just before the write, so a pass of another command that finished meanwhile keeps its entry: only this
    // command's is replaced. What cannot be read now is what was read before.
    let base = state
    if (!unread) {
      try { const fresh = JSON.parse(readFileSync(file, 'utf8')); if (plain(fresh)) base = fresh } catch { /* the state read above stands */ }
    }
    const temporary = `${file}.${process.pid}.tmp`
    writeFileSync(temporary, `${JSON.stringify({ ...base, [key]: { id: record.id, at: record.after?.at, head, files: kept, tests: keptTests, ...(!fast && counted ? { count: counted } : {}) } })}\n`, 'utf8')
    renameSync(temporary, file)
  } catch (failure) {
    line = `${line ? `${line} ` : ''}This pass's test files could not be kept (${failure.code ?? failure.message}).`
  }
  return line
}
