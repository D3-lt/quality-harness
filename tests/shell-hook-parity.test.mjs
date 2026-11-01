// ADR-136 T1: the Go core's shell-hook helpers (core/hooks/shellhook.go) answer every row as the Node functions in
// plugin/scripts/run-shell-hook.mjs and plugin/scripts/uninteresting.mjs do. The rows are built here, from the Node exports,
// over both platforms and the inputs the locked tests in tests/lifecycle.test.mjs, tests/observed-events.test.mjs and
// tests/fixture-edit-gate.test.mjs use; the Go test (TestShellHookParity in core/hooks/shellhook_parity_test.go) answers each
// one and says how many it compared. Nothing is stored: both implementations run live.
// persistedEventPath reads process.cwd() (and, on win32, process.env['=D:']) when its arguments are not absolute, so the
// corpus carries that host state and the Go side is handed it through its seams.
// Skipped, with the reason, where `go` is not on PATH: there is no core to compare.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { remove } from './helpers/remove.mjs'
import { required } from './helpers/require.mjs'
import {
  hookArguments, hookFilePathFromPayload, normalizeHookPayload, persistedEventPath, resolveBashExecutable,
  shellHookTimeoutMs, shellRuntimeCrashed,
} from '../plugin/scripts/run-shell-hook.mjs'
import { relativePathIsUninteresting } from '../plugin/scripts/uninteresting.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const coreDir = path.resolve(here, '..', 'core')
const goVersion = spawnSync('go', ['version'], { encoding: 'utf8', timeout: 30_000, windowsHide: true })
const noGo = required('go', goVersion.error || goVersion.status !== 0
  ? `go is not on PATH (${goVersion.error?.code ?? `exit ${goVersion.status}`}), so the Go core cannot be built here` : false)

const PLATFORMS = ['win32', 'linux', 'darwin']
const SCRIPTS = ['facts-gate-dispatch.sh', 'post-edit-check.sh', 'not-wired.sh']

function run(fn, f, ...args) {
  try {
    return { fn, args, want: f(...args) }
  } catch (error) {
    return { fn, args, want: { threw: error.message } }
  }
}

// Payloads: drive, UNC and relative paths under every path key, the keys missing, non-string values, arrays, nesting, and
// JSON that JSON.parse refuses or re-serializes differently from how it was written.
const objects = [
  {
    cwd: 'C:\\Users\\dev\\project',
    tool_input: { file_path: 'C:\\Users\\dev\\project\\docs\\ADR-001.md', note: 'keep \\ these \\ characters' },
    tool_response: { filePath: '\\\\server\\share\\result.md' },
  },
  { hook_event_name: 'PostToolUse', tool_name: 'Write', tool_input: { file_path: '/repo/docs/ADR-001.md' } },
  { hook_event_name: 'PostToolUse', tool_name: 'NotebookEdit', tool_input: { notebook_path: 'C:\\nb\\a.ipynb' } },
  { hook_event_name: 'Stop', tool_response: { filePath: 'D:\\out\\r.md' } },
  { tool_name: 'Edit', tool_input: { file_path: '', notebook_path: 'C:\\nb\\b.ipynb' } },
  { tool_input: { file_path: null, notebook_path: 'c:\\lower\\x.ipynb' } },
  { tool_input: { file_path: 0, notebook_path: 'C:\\n.ipynb' } },
  { tool_input: { file_path: false }, tool_response: { filePath: 'C:\\r.md' } },
  { tool_input: { notebook_path: null }, tool_response: { filePath: '' } },
  { tool_input: 'C:\\not\\an\\object', tool_response: ['C:\\a'] },
  { tool_input: ['C:\\a'], tool_name: 5, hook_event_name: null },
  { tool_name: ['Write'], hook_event_name: { x: 1 }, tool_input: { file_path: 'C:x\\drive-relative.md' } },
  { cwd: 'c:\\lower', tool_input: { file_path: 'C:/already/forward.md' } },
  { cwd: '\\\\?\\C:\\long', tool_input: { file_path: '\\\\.\\pipe\\x' } },
  { cwd: '\\single\\rooted', tool_input: { file_path: 'relative\\path.md' } },
  { cwd: 'Z:\\', tool_input: { file_path: 'Z:\\' } },
  { cwd: '\\\\', tool_input: { file_path: '\\\\\\\\triple' } },
  { cwd: 5, tool_input: { file_path: { cwd: 'C:\\in\\object' } } },
  { cwd: null, file_path: 'C:\\top\\level.md', filePath: 'C:\\also', notebook_path: '\\\\h\\s' },
  { tool_input: { edits: [{ file_path: 'C:\\in\\array\\object.md' }, 'C:\\bare\\string', ['C:\\nested']] } },
  { tool_input: { file_path: ['C:\\array\\under\\path\\key'] } },
  { deep: { deeper: { deepest: { cwd: 'C:\\d', other: 'C:\\o', n: [1, true, null, { filePath: 'E:\\x' }] } } } },
  { tool_input: { file_path: 'C:\\é\\ünïcode\\😀.md', note: 'line\u2028sep\u2029x\u0001\u001f\t"' } },
  { tool_input: { FILE_PATH: 'C:\\case', File_Path: 'C:\\case2', file_path: 'C:\\Users\\dev\\x.md' } },
  {},
]
const rawPayloads = [
  ...objects.map(o => JSON.stringify(o)),
  JSON.stringify(objects[0], null, 2),
  '{not json', '', '   ', '{}', '[]', 'null', 'true', '5', '"C:\\\\x"', '[1,2]', '{"a":1} x', '{"a":1}{"b":2}',
  '  {"cwd" : "C:\\\\sp" }  \n', '\t{"cwd":"\\u0043:\\\\esc"}\r\n',
  '{"cwd":"C:\\/slash\\/escaped","note":"\\u00e9\\ud83d\\ude00"}',
  '{"n":[1.0,1e2,-0,0.1,1E400,-1e400,123456789012345678901234,5e-7,1e21,1e-6,0.000001,100.50]}',
  '{"a":1,"b":2,"a":3,"cwd":"C:\\\\first","cwd":"D:\\\\second"}',
  '{"b":1,"2":2,"1":3,"01":4,"4294967295":5,"4294967294":6,"-1":7,"0":8}',
  '{"tool_input":{"b":"x","10":"y","9":"z","file_path":"C:\\\\k"}}',
  '{"__proto__":{"cwd":"C:\\\\proto"},"constructor":1}',
  '{"s":"\\u0000\\u0007\\b\\f\\n\\r\\t\\u2028"}',
  '\ufeff{}', '{"a":1,}', '[1,]', '[1 2]', '{"a" 1}', '{"a":1 "b":2}', '[,1]', "{'a':1}", '{"a":NaN}', '{"a":01}',
  '{"a":"raw\ttab"}', '{"a":.5}', '{"a":1.}', '{"a":+1}', '{"a":0x10}', '{"a":"\\x41"}', '{"a":tru}', '{"a"}', '{',
  '{"tool_input":{"file_path":"C:\\\\a"}}  ', '{"hook_event_name":"PreToolUse","tool_name":"Bash"}',
]

// PATH directories: quoting, whitespace JS trims and Go's TrimSpace does not (and the reverse), both stub directories in
// any case and with a trailing separator, look-alikes the filter must not catch, separators either way, UNC, drive-only,
// relative, reserved device names and empty segments.
const directories = [
  'D:\\Tools\\Git\\bin', '"D:\\Quoted\\bin"', '"', '""', '"D:\\half', 'D:\\half"', '  D:\\Spaced\\bin  ',
  '\ufeffD:\\Bom\\bin', '\u0085D:\\Nel\\bin', '\u00a0D:\\Nbsp\\bin\u3000', 'D:\\Trailing\\bin\\', 'D:/Forward/bin',
  'D:/Forward/bin/', 'D:\\\\Doubled\\\\bin', 'bin', '.', '..\\up', 'C:', 'D:', 'C:rel\\bin', '\\\\srv\\share\\bin',
  '//srv/share/bin', '\\\\srv', '\\\\?\\C:\\Git\\bin', '\\\\.\\pipe', 'C:\\Windows\\System32', 'C:\\WINDOWS\\SYSTEM32\\',
  'C:/Windows/system32/', 'C:\\Windows\\System32\\\\', 'C:\\Users\\dev\\AppData\\Local\\Microsoft\\WindowsApps',
  'C:\\x\\windowsapps/', 'C:\\Tools\\WindowsAppsX', 'C:\\Tools\\XWindowsApps', 'system32', 'C:\\ſystem32',
  'C:\\System32x', 'C:\\x\\System3', 'CON:', 'C:\\x\\NUL:y', 'a\\COM1:\\b', 'LPT¹:', 'C:\\a\\..\\..\\b', 'C:\\é\\😀',
  '\\rooted\\bin', '/', '\\', ' ',
]

function existsOnly(...candidates) {
  const set = new Set(candidates)
  return candidate => set.has(candidate)
}

function bashRows() {
  const rows = []
  const add = (platform, env, existing) => {
    const row = run('resolveBashExecutable', resolveBashExecutable, platform, env, existsOnly(...existing))
    row.args = [platform, env, existing]
    rows.push(row)
  }
  const configured = 'C:\\Program Files\\Git\\bin\\bash.exe'
  for (const platform of PLATFORMS) {
    add(platform, { CLAUDE_CODE_GIT_BASH_PATH: configured }, [])
    add(platform, { CLAUDE_CODE_GIT_BASH_PATH: '' }, [])
    add(platform, {}, [])
  }
  const localRoot = 'C:\\Users\\dev\\AppData\\Local'
  const localBash = path.win32.join(localRoot, 'Programs', 'Git', 'bin', 'bash.exe')
  const alias = 'C:\\Users\\dev\\AppData\\Local\\Microsoft\\WindowsApps\\bash.exe'
  // The locked test's own cases (tests/lifecycle.test.mjs), then each directory found where it is, missing, and as a
  // decoy beside the install-root fallback.
  add('win32', { PATH: 'C:\\Windows\\System32;D:\\Tools\\Git\\bin', LOCALAPPDATA: localRoot }, [localBash, 'D:\\Tools\\Git\\bin\\bash.exe'])
  add('win32', { PATH: 'C:\\Windows\\System32', LOCALAPPDATA: localRoot }, [localBash])
  add('win32', { PATH: 'C:\\Windows\\System32', LOCALAPPDATA: 'C:\\Users\\missing\\AppData\\Local' }, [])
  add('win32', { PATH: `C:\\Windows\\System32;${path.win32.dirname(alias)}`, LOCALAPPDATA: localRoot }, [alias, localBash])
  add('win32', { PATH: `C:\\Windows\\System32;${path.win32.dirname(alias)}`, LOCALAPPDATA: localRoot }, [alias])
  add('win32', { PATH: 'C:\\Tools\\WindowsAppsX' }, ['C:\\Tools\\WindowsAppsX\\bash.exe'])
  for (const directory of directories) {
    const joined = path.win32.join(directory.trim().replace(/^"|"$/g, '') || '.', 'bash.exe')
    add('win32', { PATH: directory }, [joined])
    add('win32', { PATH: directory, LOCALAPPDATA: localRoot }, [joined, localBash])
    add('win32', { PATH: `${directory};D:\\Next\\bin` }, ['D:\\Next\\bin\\bash.exe'])
    add('win32', { Path: directory }, [joined])
    add('win32', {}, [joined])
  }
  // PATH is read before Path, and an empty PATH is still PATH.
  add('win32', { PATH: '', Path: 'D:\\Tools\\Git\\bin' }, ['D:\\Tools\\Git\\bin\\bash.exe'])
  add('win32', { Path: 'D:\\Tools\\Git\\bin' }, ['D:\\Tools\\Git\\bin\\bash.exe'])
  add('win32', { PATH: ';;D:\\Tools\\Git\\bin;;' }, ['D:\\Tools\\Git\\bin\\bash.exe'])
  add('win32', { PATH: 'D:\\a;D:\\b;D:\\c' }, ['D:\\b\\bash.exe', 'D:\\c\\bash.exe'])
  add('win32', { PATH: 'D:\\a:D:\\b' }, ['D:\\b\\bash.exe'])
  // The install roots: each one present alone, the environment overriding each, and SystemDrive's truthiness.
  const fallbacks = [
    'C:\\Program Files\\Git\\bin\\bash.exe', 'C:\\Program Files (x86)\\Git\\bin\\bash.exe', 'E:\\Program Files\\Git\\bin\\bash.exe',
    'E:\\Program Files (x86)\\Git\\bin\\bash.exe', 'F:\\PF\\Git\\bin\\bash.exe', 'G:\\PF86\\Git\\bin\\bash.exe', localBash,
    'L\\Programs\\Git\\bin\\bash.exe', 'Programs\\Git\\bin\\bash.exe', '\\Program Files\\Git\\bin\\bash.exe',
  ]
  const envs = [
    {}, { SystemDrive: 'E:' }, { SystemDrive: '' }, { ProgramFiles: 'F:\\PF' }, { 'ProgramFiles(x86)': 'G:\\PF86' },
    { ProgramFiles: '', 'ProgramFiles(x86)': '' }, { LOCALAPPDATA: localRoot }, { LOCALAPPDATA: '' }, { LOCALAPPDATA: 'L' },
    { LOCALAPPDATA: '.' }, { SystemDrive: '\\', ProgramFiles: 'F:/PF/', LOCALAPPDATA: 'C:\\Users\\dev\\AppData\\Local\\' },
  ]
  for (const env of envs) {
    for (const found of fallbacks) add('win32', env, [found])
    add('win32', env, fallbacks)
  }
  return rows
}

const timeouts = [
  undefined, '', ' ', '250', ' 250 ', '\t250\n', '\ufeff250', '\u0085250', '\u00a0250\u2028', '99', '100', '110000',
  '110001', '119999', '0', '-250', '+250', '0x64', '0X64', '0x1ADB0', '0x1adb1', '0b1100100', '0B1100100', '0o144',
  '0O144', '-0x64', '+0x64', '1e5', '1E5', '1e+5', '1.1e5', '1.10001e5', '100.0', '100.5', '.5e3', '500.', '1000e-1',
  '250px', '1_000', '00250', '9007199254740993', '1e400', 'Infinity', '-Infinity', '+Infinity', 'infinity', 'NaN',
  '0x', '1e', '.', '+', '-', '0b', '0b2', '0o8', '0xg', ' 1 2 ', '1e2.5', '١٢٣', '２５０', '250\u0000',
]

const banner = '      2 [main] bash (46688) C:\\…\\usr\\bin\\bash.exe: *** fatal error - add_item ("\\??\\C:\\Users\\x", "/", ...) failed'
const stderrs = [
  banner, `gate output\n${banner}\nmore`, 'facts-first gate FAILED: fatal error in the spec',
  '*** fatal error - quoted inside a report', '', '[main] *** fatal error -', '[main] *** fatal error ', '[main]*** fatal error-x',
  '[MAIN] *** FATAL ERROR - x', '[Main] *** Fatal Error x', '[] *** fatal error - x', '[ma1n] *** fatal error - x',
  '[main] *** fatal errorX', '[main] *** fatal error', '[main] ** fatal error - x', '[main]\n*** fatal error - x',
  '[main] x\n[main] *** fatal error - y', `${'x'.repeat(80)}[main] *** fatal error - x`, `${'x'.repeat(81)}[main] *** fatal error - x`,
  `${'x'.repeat(100)}\r[main] *** fatal error - x`, `${'x'.repeat(100)}\u2028[main] *** fatal error - x`,
  `${'x'.repeat(100)}\u2029  3 [sig] *** fatal error - x`, `${'😀'.repeat(40)}[main] *** fatal error - x`,
  `${'😀'.repeat(39)}xx[main] *** fatal error - x`, `${'é'.repeat(80)}[main] *** fatal error - x`,
  `${'é'.repeat(81)}[main] *** fatal error - x`, '[ſ] *** fatal error - x', '[K] *** fatal error - x',
  '[main] *** ſatal error - x', 'a[b] c\r*** fatal error - x', '\r\n[main] *** fatal error - x', '[main] [x] *** fatal error - x',
  '[main [x] *** fatal error - x', '[main] *** fatal error\t- x', '[main] *** fatal error  - x',
]

const posixPairs = [
  ['/home/dev/project/docs/adr/ADR-902-bad.md', '/home/dev/project'], ['docs/a.md', '/home/dev/project'],
  ['../x', '/home/dev'], ['/a/b/../c', '/x'], ['a/./b/../../..', '/r'], ['/', '/x'], ['//double//slash/', '/x'],
  ['', '/home/dev'], ['', ''], ['x', ''], ['C:\\x', '/home'], ['a\\b', 'rel'], ['a', 'rel/dir'], ['/abs', 'rel'],
  ['...', '/r'], ['a/..', '/'], ['../../..', '/a'], ['x/', '/r/'], ['é/😀', '/ü'], ['.', '.'], ['..', '..'],
]
const winPairs = [
  ['C:/Users/dev/project/docs/adr/ADR-902-bad.md', 'C:\\Users\\dev\\project'],
  ['C:\\Users\\dev\\project\\docs\\adr\\ADR-902-bad.md', 'C:\\Users\\dev\\project'],
  ['//server/share/docs/a.md', 'C:\\Users\\dev\\project'], ['//server/share', 'C:\\p'], ['//server/share/', 'C:\\p'],
  ['//server', 'C:\\p'], ['\\\\server\\share\\x\\..\\..\\y', 'C:\\p'], ['\\\\?\\C:\\x', 'C:\\p'], ['\\\\.\\pipe\\x', 'C:\\p'],
  ['docs\\a.md', 'C:\\proj'], ['docs/a.md', 'C:/proj/'], ['..\\..\\..\\x', 'C:\\proj'], ['C:\\proj\\.\\a\\', 'C:\\x'],
  ['c:\\x', 'C:\\proj'], ['C:docs\\a.md', 'C:\\proj'], ['c:docs', 'C:\\proj'], ['D:x', 'C:\\proj'], ['D:', 'C:\\proj'],
  ['\\rooted', 'C:\\proj'], ['/rooted/fwd', 'D:\\proj'], ['x', '\\proj'], ['x', '\\\\srv\\sh\\dir'], ['x', '//srv/sh'],
  ['', 'C:\\proj'], ['', ''], ['x', ''], ['x', 'rel'], ['x', 'C:'], ['x', 'C:rel'], ['C:', 'C:\\proj'],
  ['CON', 'C:\\p'], ['a\\NUL:x', 'C:\\p'], ['é\\😀', 'C:\\ü'], ['a/b\\c//d', 'C:\\'], ['..', 'C:\\'], ['C:\\..\\..', 'C:\\p'],
]

const relatives = [
  'tests/fixtures/corpora/x/docs/adr/ADR-001.md', 'node_modules/pkg/docs/adr/ADR-001.md', 'docs/adr/ADR-001.md',
  'spec/adr/ADR-001.md', '../elsewhere/fixtures/ADR-001.md', 'fixtures', 'fixtures/', 'fixtures/a', 'a\\fixtures\\b.md',
  'FIXTURES/x', 'Fixture/x', 'golden-x/a', 'golden_/a', 'golden/a', 'goldenx/a', 'GOLDEN-Y/a', '..\\fixtures\\x',
  'x/../fixtures/a', '', '/', '//fixtures//a', '\\\\vendor\\a', 'Build/x', 'dist', 'dist/x', 'target/sub/x', 'coverage/x',
  '__pycache__/x', '__snapshots__/x', 'testdata/x', 'test/x', 'tests/adr/x', 'a/b/c/vendor/d/e', '.../vendor/x',
  './vendor/x', 'vendor./x', ' vendor/x', 'é/vendor/😀',
  // BACKLOG §439: JavaScript's /i without `u` folds no non-ASCII letter into ASCII (U+017F long s, U+212A Kelvin sign), and its
  // `.` stops at \r, U+2028 and U+2029; Go's (?i) and `.` did neither.
  'fixtureſ/x', 'ſnapshots/x', '__ſnapshots__/x', 'teſtdata/x', 'golden-a\rb/x', 'golden-a b/x', 'golden-a b/x',
  'golden-a\u0085b/x', 'golden-K/x', 'FİXTURES/x', 'golden-a\tb/x',
]

function rowsFor() {
  const rows = []
  for (const raw of rawPayloads) {
    for (const platform of PLATFORMS) {
      rows.push(run('normalizeHookPayload', normalizeHookPayload, raw, platform))
      rows.push(run('hookFilePathFromPayload', hookFilePathFromPayload, raw, platform))
      for (const script of SCRIPTS) rows.push(run('hookArguments', hookArguments, script, raw, platform))
    }
  }
  rows.push(...bashRows())
  for (const value of timeouts) {
    const env = value === undefined ? {} : { QUALITY_HARNESS_SHELL_TIMEOUT_MS: value }
    rows.push(run('shellHookTimeoutMs', shellHookTimeoutMs, env))
  }
  for (const stderr of stderrs) rows.push(run('shellRuntimeCrashed', shellRuntimeCrashed, stderr))
  for (const [file, cwd] of posixPairs) {
    for (const platform of ['linux', 'darwin']) rows.push(run('persistedEventPath', persistedEventPath, file, cwd, platform))
  }
  for (const [file, cwd] of [...winPairs, ...posixPairs]) rows.push(run('persistedEventPath', persistedEventPath, file, cwd, 'win32'))
  for (const relative of relatives) rows.push(run('relativePathIsUninteresting', relativePathIsUninteresting, relative))
  return rows
}

// What persistedEventPath reads from the process when its arguments are not absolute.
function host() {
  const drives = Object.fromEntries(Object.entries(process.env).filter(([k]) => k.startsWith('=')))
  return { cwd: process.cwd(), windows: process.platform === 'win32', env: drives }
}

test('the core answers every shell-hook row as the Node functions do', { skip: noGo }, t => {
  const scratch = mkdtempSync(path.join(os.tmpdir(), 'qh-shparity-'))
  t.after(() => remove(scratch))
  const rows = rowsFor()
  assert.ok(rows.length > 1000, `only ${rows.length} rows were built, so the comparison would prove little`)
  // Every class of answer is present, or a row class the Go side gets wrong could be one nobody wrote.
  for (const fn of ['normalizeHookPayload', 'hookFilePathFromPayload', 'hookArguments', 'resolveBashExecutable',
    'shellHookTimeoutMs', 'shellRuntimeCrashed', 'persistedEventPath', 'relativePathIsUninteresting']) {
    const answers = new Set(rows.filter(r => r.fn === fn).map(r => JSON.stringify(r.want)))
    assert.ok(answers.size > 1, `${fn} has one answer over every row, so its rows distinguish nothing`)
  }
  const corpus = path.join(scratch, 'corpus.json')
  writeFileSync(corpus, JSON.stringify({ host: host(), rows }))
  const ran = spawnSync('go', ['test', '-count=1', '-v', '-run', '^TestShellHookParity$', './hooks/'], {
    cwd: coreDir, encoding: 'utf8', timeout: 600_000, windowsHide: true, env: { ...process.env, QH_SHELL_HOOK_CORPUS: corpus },
  })
  const said = `${ran.stdout}\n${ran.stderr}`
  assert.equal(ran.status, 0, `the Go shell-hook helpers disagree with the Node ones (or did not run):\n${said.split('\n').slice(-60).join('\n')}`)
  // A Go test that skipped, or matched nothing, exits 0 too: the count it compared is what says it ran, over every row.
  assert.match(said, new RegExp(`${rows.length} rows compared, 0 disagreements`))
})
