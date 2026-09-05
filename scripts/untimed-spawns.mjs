#!/usr/bin/env node
// BACKLOG §130 — every child a process spawns carries a timeout, JavaScript side.
//
// `scripts/untimed-children.py` answers this for the Python gates. The shipped
// JavaScript and the suite were counted by grep ("~116 without `timeout` on the
// call's first line, which over-counts multi-line options and is a place to
// look, not a number to trust"). This is the AST-level count that grep could
// not be: a multi-line call is one call, an options object is read for a
// `timeout` key wherever it sits, and a call whose options this tool cannot
// read (a variable, a spread) is UNKNOWN — reported as a place to look, never
// as clean and never as a finding (ADR-005).
//
// The parser is the acorn Node ships for its own REPL, reached through
// `--expose-internals`. No dependency, but a private path: when it is not
// there this tool says UNRUN and exits 2, which is not a pass.
//
//   node --expose-internals scripts/untimed-spawns.mjs [--json] [path ...]
//
// Exit: 0 nothing untimed · 1 at least one untimed call · 2 could not run.
//
// A call may be acknowledged with a comment on the line above it or the same
// line: `// untimed-spawn: <reason>`. It is then reported as acknowledged, not
// untimed — the reason is read by a person, and a bare acknowledgement is
// refused as untimed.
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const SPAWNERS = new Set(['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork'])
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(SCRIPT_DIR, '..')

export function loadAcorn(require = createRequire(import.meta.url)) {
  try {
    return require('internal/deps/acorn/acorn/dist/acorn')
  } catch (error) {
    return { unavailable: `${error?.code ?? error?.name ?? 'Error'}: ${error?.message ?? error}` }
  }
}

function calleeName(callee) {
  if (callee.type === 'Identifier') return callee.name
  if (callee.type === 'MemberExpression' && !callee.computed && callee.property.type === 'Identifier') {
    return callee.property.name
  }
  return null
}

// The options argument, by the signatures child_process documents: the last
// argument when it is an object, for every spawner; exec/execSync take
// (command[, options][, callback]) and the object is still the last non-callback.
function optionsArgument(args) {
  const candidates = args.filter(arg => arg.type !== 'FunctionExpression' && arg.type !== 'ArrowFunctionExpression')
  const last = candidates.at(-1)
  if (!last || last.type === 'ArrayExpression' || last.type === 'Literal' || last.type === 'TemplateLiteral') return null
  return last
}

function classify(options) {
  if (!options) return 'untimed'
  if (options.type !== 'ObjectExpression') return 'unknown'
  let spread = false
  for (const property of options.properties) {
    if (property.type === 'SpreadElement') { spread = true; continue }
    const key = property.key
    const name = key.type === 'Identifier' ? key.name : key.type === 'Literal' ? String(key.value) : null
    if (name === 'timeout') return 'timed'
  }
  return spread ? 'unknown' : 'untimed'
}

function acknowledgement(lines, line) {
  for (const candidate of [lines[line - 1], lines[line - 2]]) {
    const match = /\/\/\s*untimed-spawn:\s*(.*)$/.exec(candidate ?? '')
    if (match) return match[1].trim()
  }
  return null
}

function walk(node, visit) {
  if (!node || typeof node.type !== 'string') return
  visit(node)
  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'start' || key === 'end') continue
    const value = node[key]
    if (Array.isArray(value)) value.forEach(child => walk(child, visit))
    else if (value && typeof value.type === 'string') walk(value, visit)
  }
}

export function scanSource(acorn, source, file) {
  const findings = []
  let tree
  try {
    tree = acorn.parse(source, { ecmaVersion: 'latest', sourceType: 'module', locations: true, allowHashBang: true, allowReturnOutsideFunction: true })
  } catch (error) {
    return { file, unparsed: `${error.message}` , findings }
  }
  const lines = source.split('\n')
  walk(tree, node => {
    if (node.type !== 'CallExpression') return
    const name = calleeName(node.callee)
    if (!name || !SPAWNERS.has(name)) return
    // `regex.exec(...)`, `promise.then(...)`: only child_process names, and only
    // when the receiver is not something that plainly is not child_process.
    if (name === 'exec' && node.callee.type === 'MemberExpression') {
      const object = node.callee.object
      const receiver = object.type === 'Identifier' ? object.name : null
      if (receiver === null || !/^(cp|child_process|childProcess|process)$/i.test(receiver)) return
    }
    const line = node.loc.start.line
    let verdict = classify(optionsArgument(node.arguments))
    let reason = null
    if (verdict === 'untimed') {
      reason = acknowledgement(lines, line)
      if (reason) verdict = 'acknowledged'
      else if (reason === '') verdict = 'untimed'
    }
    findings.push({ file, line, call: name, verdict, reason })
  })
  return { file, findings }
}

export function trackedJavaScript(root = ROOT, run = spawnSync) {
  const listing = run('git', ['-C', root, 'ls-files', '--cached', '--others', '--exclude-standard', '--', '*.mjs', '*.js', '*.cjs'],
    { encoding: 'utf8', timeout: 30_000 })
  if (listing.error || listing.status !== 0) return null
  return listing.stdout.split(/\r?\n/).filter(Boolean)
    .filter(file => !/^tests\/fixtures\//.test(file))
    .map(file => path.join(root, file))
}

export function report(results, { json = false } = {}) {
  const all = results.flatMap(result => result.findings)
  const by = verdict => all.filter(finding => finding.verdict === verdict)
  const unparsed = results.filter(result => result.unparsed)
  if (json) {
    return JSON.stringify({
      timed: by('timed').length, untimed: by('untimed'), unknown: by('unknown'),
      acknowledged: by('acknowledged'), unparsed: unparsed.map(result => ({ file: result.file, error: result.unparsed })),
    }, null, 2)
  }
  const lines = []
  for (const finding of by('untimed')) {
    lines.push(`${path.relative(ROOT, finding.file)}:${finding.line}: ${finding.call}() names no timeout`)
  }
  for (const finding of by('unknown')) {
    lines.push(`${path.relative(ROOT, finding.file)}:${finding.line}: ${finding.call}() options could not be read here (a variable or a spread) — UNKNOWN, a place to look`)
  }
  for (const finding of by('acknowledged')) {
    lines.push(`${path.relative(ROOT, finding.file)}:${finding.line}: ${finding.call}() acknowledged untimed: ${finding.reason}`)
  }
  for (const result of unparsed) lines.push(`${path.relative(ROOT, result.file)}: could not parse — ${result.unparsed}`)
  lines.push(`${by('timed').length} timed · ${by('untimed').length} untimed · ${by('unknown').length} unknown · ${by('acknowledged').length} acknowledged · ${unparsed.length} unparsed`)
  return lines.join('\n')
}

export function main(argv = process.argv.slice(2), { acorn = loadAcorn(), stdout = process.stdout, stderr = process.stderr } = {}) {
  if (acorn.unavailable) {
    stderr.write(`UNRUN: the parser this tool needs (Node's internal acorn, via --expose-internals) is not available — ${acorn.unavailable}. Nothing here has been checked, which is not the same as clean.\n`)
    return 2
  }
  const json = argv.includes('--json')
  const named = argv.filter(arg => arg !== '--json')
  const files = named.length ? named.map(file => path.resolve(file)) : trackedJavaScript()
  if (files === null) {
    stderr.write('UNRUN: git ls-files did not answer, so the set of files to check is unknown.\n')
    return 2
  }
  const results = files.map(file => scanSource(acorn, readFileSync(file, 'utf8'), file))
  stdout.write(`${report(results, { json })}\n`)
  const untimed = results.some(result => result.findings.some(finding => finding.verdict === 'untimed'))
  return untimed ? 1 : 0
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main()
}
