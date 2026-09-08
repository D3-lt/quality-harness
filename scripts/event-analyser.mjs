#!/usr/bin/env node
// event-analyser maps repository-owned event declarations and possible work.
// It reads configuration/source; only the explicit record subcommand executes a hook.
import { readFileSync, statSync, realpathSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { loadAcorn } from './untimed-spawns.mjs'
import { analyzeTrace, recordInvocation } from './event-trace.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const normalize = value => value.replaceAll('\\', '/')
const location = (file, line) => ({ file, line })
const MAX_FILE_BYTES = 32 * 1024 * 1024

function readBounded(file, root) {
  if (root) {
    const relative = path.relative(realpathSync(root), realpathSync(file))
    if (relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) throw new Error('source resolves outside the repository')
  }
  if (statSync(file).size > MAX_FILE_BYTES) throw new Error('file exceeds the 32 MiB analysis limit')
  return readFileSync(file, 'utf8')
}

function walk(node, visit) {
  if (!node || typeof node.type !== 'string') return
  visit(node)
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach(child => walk(child, visit))
    else if (value && typeof value.type === 'string') walk(value, visit)
  }
}

function nameOf(node) {
  if (node?.type === 'Identifier') return node.name
  if (node?.type === 'MemberExpression' && !node.computed) return node.property.name
  return null
}

function eventValue(node, event) {
  if (!node) return undefined
  if (node?.type === 'Literal') return node.value
  if (node?.type === 'Identifier' && node.name === 'event') return event
  if (node?.type === 'ArrayExpression') {
    const values = node.elements.map(item => eventValue(item, event))
    return values.every(value => value !== undefined) ? values : undefined
  }
  if (node?.type === 'UnaryExpression' && node.operator === '!') {
    const value = eventValue(node.argument, event)
    return value === undefined ? undefined : !value
  }
  const left = eventValue(node?.left, event)
  const right = eventValue(node?.right, event)
  if (node?.type === 'BinaryExpression' && left !== undefined && right !== undefined) {
    if (node.operator === '===') return left === right
    if (node.operator === '!==') return left !== right
  }
  if (node?.type === 'LogicalExpression') {
    if (node.operator === '&&') return left === false || right === false ? false
      : left === true && right === true ? true : undefined
    if (node.operator === '||') return left === true || right === true ? true
      : left === false && right === false ? false : undefined
  }
  if (node?.type === 'CallExpression' && nameOf(node.callee) === 'includes') {
    const values = eventValue(node.callee.object, event)
    const value = eventValue(node.arguments[0], event)
    if (Array.isArray(values) && value !== undefined) return values.includes(value)
  }
  return undefined
}

/** inspectDispatch reads literal event branches and local call paths without executing source. */
export function inspectDispatch(source, file, parse) {
  const tree = parse(source)
  const functions = new Map()
  for (const node of tree.body) {
    const declaration = node.type === 'ExportNamedDeclaration' ? node.declaration : node
    if (declaration?.type === 'FunctionDeclaration') functions.set(declaration.id.name, declaration)
  }
  const handler = functions.get('handleHook')
  if (!handler) return null
  // The supported seam is explicit. A renamed/computed discriminator needs a new analyser rule.
  const alias = handler.body.body.find(node => node.type === 'VariableDeclaration'
    && node.declarations.some(d => d.id.name === 'event' && nameOf(d.init) === 'hook_event_name'))
  if (!alias) throw new Error('handleHook event discriminator is not supported')
  const events = new Set()
  walk(handler.body, node => {
    if (node.type === 'BinaryExpression' && ['===', '!=='].includes(node.operator)) {
      if (node.left.type === 'Identifier' && node.left.name === 'event' && typeof node.right.value === 'string') events.add(node.right.value)
      if (node.right.type === 'Identifier' && node.right.name === 'event' && typeof node.left.value === 'string') events.add(node.left.value)
    }
    if (node.type === 'CallExpression' && nameOf(node.callee) === 'includes'
        && node.arguments[0]?.name === 'event' && node.callee.object.type === 'ArrayExpression') {
      for (const item of node.callee.object.elements) if (typeof item?.value === 'string') events.add(item.value)
    }
  })
  const callsIn = node => {
    const calls = new Set()
    walk(node, item => {
      if (item.type === 'CallExpression' && item.callee.type === 'Identifier') calls.add(item.callee.name)
    })
    return calls
  }
  const rows = []
  for (const event of [...events].sort()) {
    const calls = new Set()
    const guards = []
    const add = node => { for (const name of callsIn(node)) calls.add(name) }
    const statements = nodes => {
      for (const node of nodes) {
        if (node.type === 'IfStatement') {
          add(node.test)
          const result = eventValue(node.test, event)
          guards.push({ line: node.loc.start.line, condition: source.slice(node.test.start, node.test.end), result: result ?? 'conditional' })
          const branch = branchNode => branchNode ? statements(branchNode.type === 'BlockStatement' ? branchNode.body : [branchNode]) : false
          if (result === true) { if (branch(node.consequent)) return true }
          else if (result === false) { if (branch(node.alternate)) return true }
          else {
            const a = branch(node.consequent)
            const b = branch(node.alternate)
            if (a && b) return true
          }
        } else if (node.type === 'BlockStatement') {
          if (statements(node.body)) return true
        } else if (!['FunctionDeclaration', 'ClassDeclaration'].includes(node.type)) {
          add(node)
          if (node.type === 'ReturnStatement' || node.type === 'ThrowStatement') return true
        }
      }
      return false
    }
    statements(handler.body.body)
    const reachable = new Set()
    const queue = [...calls]
    for (let index = 0; index < queue.length; index++) {
      const name = queue[index]
      if (reachable.has(name) || !functions.has(name) || name === 'handleHook') continue
      reachable.add(name)
      queue.push(...callsIn(functions.get(name).body))
    }
    rows.push({ event, source: location(file, handler.loc.start.line), calls: [...calls].sort(), guards, reachable: [...reachable].sort() })
  }
  return {
    file, events: rows,
    functions: [...functions].map(([name, node]) => {
      const calls = callsIn(node.body)
      return { name, line: node.loc.start.line, effects: [...calls].filter(call =>
        /^(spawn|spawnSync|exec|execSync|execFile|execFileSync|fork|readFile|readFileSync|readdir|readdirSync|writeFile|writeFileSync|appendFile|appendFileSync|unlink|unlinkSync|mkdir|mkdirSync|stat|statSync|lstat|lstatSync)$/.test(call)) }
    }),
  }
}

function scalar(text) {
  const value = text.trim()
  if (value.startsWith('"') && value.endsWith('"')) {
    try { return JSON.parse(value) } catch { throw new Error('unsupported quoted YAML scalar') }
  }
  if (value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1).replaceAll("''", "'")
  return value
}

function agentHooks(source, file, problems) {
  const lines = source.split(/\r?\n/)
  if (lines[0] !== '---') return []
  const end = lines.indexOf('---', 1)
  if (end < 0) { problems.push(file + ': unclosed frontmatter'); return [] }
  const begin = lines.findIndex((line, i) => i < end && /^hooks:/.test(line))
  if (begin < 0) return []
  if (lines[begin].trim() !== 'hooks:') { problems.push(file + ': unsupported hooks YAML shape'); return [] }
  const rows = []
  let event
  let matcher = '*'
  let current
  for (let i = begin + 1; i < end; i++) {
    const line = lines[i]
    if (!line.trim() || line.trimStart().startsWith('#')) continue
    if (/^\S/.test(line)) break
    const eventMatch = /^  ([A-Za-z][A-Za-z0-9]*):\s*$/.exec(line)
    const field = /^\s+(?:- )?(type|command|timeout|matcher|hooks):\s*(.*?)\s*$/.exec(line)
    if (eventMatch) { event = eventMatch[1]; matcher = '*'; current = null; continue }
    if (!field || !event) { problems.push(file + ':' + (i + 1) + ': unsupported hook YAML'); continue }
    const [, key, value] = field
    if (key === 'matcher') matcher = scalar(value)
    if (key === 'type') {
      current = { event, matcher, type: scalar(value), command: '', args: [], scope: (file.startsWith('plugin/agents/') ? 'agent:' : 'skill:') + file, source: location(file, i + 1) }
      rows.push(current)
    }
    if (key === 'command' || key === 'timeout') {
      if (!current) { problems.push(file + ':' + (i + 1) + ': hook field before type is unsupported'); continue }
      if (key === 'command') { current.command = scalar(value); current.source.line = i + 1 }
      else current.timeoutSeconds = Number(value)
    }
  }
  return rows
}

function commandWords(command) {
  const words = []
  let word = ''
  let quote = ''
  for (const char of command.trim()) {
    if ((char === '"' || char === "'") && (!quote || quote === char)) { quote = quote ? '' : char; continue }
    if (/\s/.test(char) && !quote) { if (word) words.push(word); word = '' }
    else word += char
  }
  if (quote) return null
  if (word) words.push(word)
  return words
}

function targetsFor(row) {
  // Resolve only the repository's simple interpreter invocations. Shell syntax or
  // unfamiliar launchers need a human; a path printed by echo is not an entrypoint.
  const words = commandWords(row.command)
  if (!words || !/^(node|node\.exe|bash|sh|python3?|python\.exe)$/.test(words[0])
      || /[;&|<>]|\$\(|`/.test(row.command)) return []
  const args = [...words.slice(1), ...row.args]
  const candidate = normalize(args[0] ?? '').replace(/^\$\{CLAUDE_PLUGIN_ROOT\}\//, 'plugin/').replace(/^\$CLAUDE_PLUGIN_ROOT\//, 'plugin/')
  if (!/^(?:plugin|scripts)\//.test(candidate)) return []
  const entry = path.posix.normalize(candidate)
  if (!/^(?:plugin|scripts)\//.test(entry)) return []
  const files = [entry]
  if (entry === 'plugin/scripts/run-shell-hook.mjs' && /^[\w-]+\.sh$/.test(args[1] ?? '')) files.push('plugin/scripts/' + args[1])
  return files
}

function workflow(source, file, problems) {
  const lines = source.split(/\r?\n/)
  const on = lines.findIndex(line => /^(?:on|'on'|"on"):\s*/.test(line))
  const events = []
  const triggerLines = []
  const jobs = []
  let job
  let inJobs = false
  let inOn = false
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (i === on) {
      inOn = true
      triggerLines.push(line)
      const value = line.slice(line.indexOf(':') + 1).trim()
      if (value) {
        const plain = value.replace(/^\[|\]$/g, '')
        if (/^[\w,'"\s-]+$/.test(plain)) events.push(...plain.split(',').map(scalar).filter(Boolean))
        else problems.push(file + ':' + (i + 1) + ': unsupported workflow trigger')
      }
      continue
    }
    if (/^jobs:\s*$/.test(line)) { inJobs = true; inOn = false; continue }
    if (/^\S/.test(line) && !line.startsWith('#')) { inOn = false; inJobs = false }
    if (inOn) {
      triggerLines.push(line)
      const match = /^  ([\w-]+):/.exec(line)
      if (match) events.push(match[1])
    }
    if (!inJobs) continue
    const match = /^  ([\w-]+):\s*$/.exec(line)
    if (match) { job = { name: match[1], source: location(file, i + 1), conditions: [], runs: [], fanout: [] }; jobs.push(job); continue }
    if (!job) continue
    const condition = /^\s+(?:- )?if:\s*(.*)/.exec(line)
    if (condition) job.conditions.push({ line: i + 1, expression: condition[1] })
    const matrix = /^\s+matrix:\s*(.*)/.exec(line)
    if (matrix) {
      const indent = line.search(/\S/)
      let j = i + 1
      while (j < lines.length && (!lines[j].trim() || lines[j].search(/\S/) > indent)) j++
      job.fanout.push(lines.slice(i, j).join('\n').trim())
    }
    // In this repository layout, run steps sit at step-key indentation or start
    // a step item. defaults.run is configuration and never executes a command.
    const run = /^( {6}- | {8})run:\s*(.*)/.exec(line)
    if (run) {
      let command = run[2]
      const runLine = i + 1
      if (/^[|>][-+]?$/.test(command)) {
        const first = i + 1
        while (i + 1 < lines.length && (!lines[i + 1].trim() || lines[i + 1].search(/\S/) > run[1].length)) i++
        command = lines.slice(first, i + 1).join('\n').trim()
      }
      job.runs.push({ source: location(file, runLine), command })
    }
  }
  if (on < 0 || events.length === 0) problems.push(file + ': workflow triggers could not be read')
  if (jobs.length === 0) problems.push(file + ': workflow jobs could not be read')
  return { source: location(file, Math.max(1, on + 1)), events: [...new Set(events)], trigger: triggerLines.join('\n'), jobs }
}

/** analyzeRepository maps tracked declarations and conservative local dispatch paths. */
export function analyzeRepository(root = ROOT, { parse, run = spawnSync } = {}) {
  const listing = run('git', ['-C', root, 'ls-files', '-z', '--cached', '--others', '--exclude-standard'],
    { encoding: 'utf8', timeout: 30_000, maxBuffer: 8 * 1024 * 1024 })
  if (listing.error || listing.status !== 0) throw new Error('git ls-files did not answer; repository scope is unknown')
  const files = new Set(listing.stdout.split('\0').filter(Boolean).map(normalize))
  const problems = []
  const registrations = []
  const workflows = []
  const gitHooks = []
  const dispatch = []
  for (const file of [...files].sort()) {
    if (!/^(plugin\/hooks\/.*\.json|plugin\/(?:agents\/.*\.md|skills\/.*\/SKILL\.md)|\.github\/workflows\/.*\.ya?ml|\.githooks\/[^/]+)$/.test(file)) continue
    let source
    try { source = readBounded(path.join(root, file), root) } catch (error) { problems.push(file + ': ' + error.message); continue }
    try {
      if (file.startsWith('plugin/hooks/')) {
        const document = JSON.parse(source)
        if (!document.hooks || typeof document.hooks !== 'object' || Array.isArray(document.hooks)) throw new Error('hooks must be an object')
        for (const [event, groups] of Object.entries(document.hooks)) {
          if (!Array.isArray(groups)) throw new Error(event + ': expected hook groups')
          for (const group of groups) {
            if (!Array.isArray(group?.hooks)) throw new Error(event + ': expected hooks array')
            if (group.matcher !== undefined && typeof group.matcher !== 'string') throw new Error(event + ': matcher must be a string')
            for (const hook of group.hooks) {
              if (typeof hook?.command !== 'string' || (hook.args !== undefined && (!Array.isArray(hook.args) || !hook.args.every(arg => typeof arg === 'string')))) throw new Error(event + ': unsupported hook command/args')
              registrations.push({
                event, matcher: group.matcher ?? '*', type: hook.type, command: hook.command, args: hook.args ?? [],
                timeoutSeconds: hook.timeout ?? null, scope: 'plugin',
                source: location(file, source.slice(0, source.indexOf(JSON.stringify(event))).split('\n').length),
              })
            }
          }
        }
      } else if (file.startsWith('plugin/agents/') || file.startsWith('plugin/skills/')) {
        registrations.push(...agentHooks(source, file, problems))
      } else if (file.startsWith('.github/')) workflows.push(workflow(source, file, problems))
      else gitHooks.push({ event: path.posix.basename(file), source: location(file, 1), references: [...new Set(source.match(/scripts\/[\w.-]+/g) ?? [])] })
    } catch (error) { problems.push(file + ': ' + error.message) }
  }
  const perEvent = new Map()
  for (const row of registrations) {
    const key = row.source.file + ':' + row.event
    const ordinal = perEvent.get(key) ?? 0
    perEvent.set(key, ordinal + 1)
    row.id = key + ':' + ordinal
    row.targets = targetsFor(row)
    row.targetState = row.targets.length ? (row.targets.every(target => files.has(target)) ? 'listed' : 'missing') : 'unresolved'
    if (!row.command || (row.timeoutSeconds != null && (!Number.isFinite(row.timeoutSeconds) || row.timeoutSeconds <= 0))) problems.push(row.id + ': empty command or invalid timeout')
    if (row.type !== 'command') problems.push(row.id + ': only command hooks are currently resolved')
  }
  if (!parse) problems.push('JavaScript parser unavailable; rerun node with --expose-internals for dispatch analysis')
  else for (const target of new Set(registrations.flatMap(row => row.targets).filter(file => file.endsWith('.mjs')))) {
    if (!files.has(target)) continue
    try {
      const result = inspectDispatch(readBounded(path.join(root, target), root), target, parse)
      if (result) dispatch.push(result)
    } catch (error) { problems.push(target + ': ' + error.message) }
  }
  const diagnostics = []
  for (const row of registrations) {
    if (row.targetState === 'missing') diagnostics.push({ kind: 'missing-target', registrations: [row.id], detail: row.targets.filter(target => !files.has(target)).join(', ') })
    if (row.targetState === 'unresolved') diagnostics.push({ kind: 'unresolved-command', registrations: [row.id], detail: 'No repository-local target resolved; this does not mean the command is unused.' })
  }
  const literalMatchers = matcher => matcher === '*' || matcher === '' ? '*' : /^[\w]+(?:\|[\w]+)*$/.test(matcher) ? matcher.split('|') : null
  for (let i = 0; i < registrations.length; i++) for (let j = i + 1; j < registrations.length; j++) {
    const a = registrations[i]
    const b = registrations[j]
    if (a.event !== b.event) continue
    if (a.command !== b.command || JSON.stringify(a.args) !== JSON.stringify(b.args)) continue
    const x = literalMatchers(a.matcher)
    const y = literalMatchers(b.matcher)
    if (a.matcher === b.matcher || (x && y && (x === '*' || y === '*' || x.some(value => y.includes(value))))) {
      const sameScope = a.scope === b.scope
      diagnostics.push({ kind: sameScope ? 'duplicate-registration' : 'cross-scope-candidate', registrations: [a.id, b.id],
        detail: sameScope
          ? 'Same command has overlapping declarations. Host deduplication and runtime firing are not established by this finding.'
          : 'Same command is declared across scopes. Possible overlap depends on scope activation; these scopes may never coexist. This is reuse to inspect, not proof of duplicate execution.' })
    }
  }
  const sharedWork = []
  const unwiredHandlers = []
  for (const module of dispatch) {
    const wired = registrations.filter(row => row.targets.includes(module.file)).map(row => row.event)
    for (const branch of module.events) if (!wired.includes(branch.event)) unwiredHandlers.push({ event: branch.event, source: branch.source })
    for (const fn of module.functions) {
      const events = module.events.filter(row => wired.includes(row.event) && row.reachable.includes(fn.name)).map(row => row.event)
      if (events.length > 1 && fn.effects.length) sharedWork.push({ ...fn, file: module.file, events })
    }
  }
  const hooksPath = run('git', ['-C', root, 'config', '--get', 'core.hooksPath'], { encoding: 'utf8', timeout: 5_000 })
  const configuredPath = !hooksPath.error && hooksPath.status === 0 ? hooksPath.stdout.trim() : null
  for (const hook of gitHooks) hook.activation = hooksPath.error || ![0, 1].includes(hooksPath.status) ? 'unknown'
    : configuredPath && path.resolve(root, configuredPath) === path.resolve(root, '.githooks') ? 'configured' : 'not configured here'
  return {
    schema: 1, registrations, dispatch, sharedWork, unwiredHandlers, workflows, gitHooks, diagnostics, problems,
    limitations: [
      'Dispatch follows literal event conditions in handleHook and syntactic references between top-level function declarations. It does not propagate arguments into callees, resolve bindings, or model callbacks, closures, loops, dynamic imports or cross-module calls. A function body reference is not proof of execution or I/O.',
      'Agent/skill hook activation depends on the host and active role. Git hook configuration is local; bypasses remain possible.',
      'YAML inspection supports the repository block layout, not arbitrary YAML evaluation. Raw CI trigger filters, matrices and conditions are displayed, not expanded or executed. Git hook references are lexical and can include comments.',
      'No installed user settings, other plugins or remote CI logs are read. Runtime usage needs an explicitly recorded trace.',
    ],
  }
}

function cell(value) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replace(/[\\`*_[\]|]/g, '\\$&').replaceAll('\n', '<br>').replaceAll('\r', '')
}

/** formatReport renders an actionable Markdown inventory with evidence limits. */
export function formatReport(report) {
  const lines = ['# Event analyser', '', 'Status: ' + (report.problems.length ? 'PARTIAL' : 'analysed') + '. Static wiring is not runtime execution.', '',
    '| Event / scope | Handler ID | Targets | Matcher | Timeout (s) | Source |',
    '| --- | --- | --- | --- | --- | --- |']
  for (const row of report.registrations) lines.push('| ' + [row.event + ' / ' + row.scope, row.id,
    row.targets.join(' → ') || row.command, row.matcher, row.timeoutSeconds ?? 'host default', row.source.file + ':' + row.source.line].map(cell).join(' | ') + ' |')
  lines.push('', '## Shared function references', '', 'These syntactic call paths share functions with I/O-like call names. Callee arguments and guards can prevent execution; measure these candidates before treating them as repeated work.', '')
  for (const row of report.sharedWork) lines.push('- ' + cell(row.file + ':' + row.line + ' ' + row.name + ' → ' + row.events.join(', ') + ' (' + row.effects.join(', ') + ')'))
  lines.push('', '## Dispatch conditions', '')
  for (const module of report.dispatch) for (const row of module.events) {
    lines.push('- ' + cell(row.event + ' → ' + row.calls.join(', ')))
    const conditional = row.guards.filter(guard => guard.result === 'conditional')
    for (const guard of conditional) lines.push('  - ' + cell(module.file + ':' + guard.line + ' if ' + guard.condition))
  }
  lines.push('', '## Wiring findings', '')
  for (const row of report.diagnostics) lines.push('- ' + cell(row.kind + ': ' + row.registrations.join(', ') + ' — ' + row.detail))
  for (const row of report.unwiredHandlers) lines.push('- ' + cell('Unregistered handler: ' + row.event + ' at ' + row.source.file + ':' + row.source.line))
  if (!report.diagnostics.length && !report.unwiredHandlers.length) lines.push('No wiring findings in the supported scope.')
  lines.push('', '## Git and CI', '')
  for (const row of report.gitHooks) lines.push('- ' + cell('Git ' + row.event + ': ' + row.activation + '; ' + row.source.file + ' → references ' + row.references.join(', ')))
  for (const flow of report.workflows) {
    lines.push('- ' + cell(flow.source.file + ':' + flow.source.line + ' — ' + flow.events.join(', ')), '  - Trigger configuration: ' + cell(flow.trigger))
    for (const job of flow.jobs) {
      lines.push('  - Job ' + cell(job.name) + ': ' + job.runs.length + ' run declarations; matrix: ' + (job.fanout.length ? cell(job.fanout.join('; ')) : 'none'))
      for (const condition of job.conditions) lines.push('    - Condition at line ' + condition.line + ': ' + cell(condition.expression))
      for (const run of job.runs) lines.push('    - ' + cell(run.source.file + ':' + run.source.line + ' ' + run.command))
    }
  }
  lines.push('', '## Observed runtime', '')
  if (!report.runtime) lines.push('UNOBSERVED — provide --trace FILE. No handler is called unused merely because no trace was supplied.')
  else {
    lines.push('| Handler | Runs | Total ms | p95 ms | Peak overlap | Unfinished | Failures | Timeouts |', '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |')
    for (const row of report.runtime.handlers) {
      lines.push('| ' + [row.handler, row.invocations, row.totalMs.toFixed(1), row.p95Ms?.toFixed(1) ?? 'unknown', row.maxConcurrent, row.unfinished, row.failures, row.timeouts].map(cell).join(' | ') + ' |')
    }
    for (const row of report.runtime.handlers) {
      if (row.outputLimits || row.cleanupUnconfirmed) lines.push('- ' + cell(row.handler) + ': output limits ' + row.outputLimits + '; cleanup unconfirmed ' + row.cleanupUnconfirmed)
      if (row.outcomes) lines.push('- ' + cell(row.handler) + ' outcomes: ' + Object.entries(row.outcomes).map(([outcome, count]) => cell(outcome) + ' ' + count).join(', '))

    }
    for (const row of report.runtime.repeatedInputs) lines.push('- ' + cell('Repeated identical input: ' + row.handler + ' (' + row.event + ') × ' + row.count))
    lines.push('', 'Observed runs: ' + report.runtime.observed + '; peak overlap: ' + report.runtime.maxConcurrent + '; copied observations ignored: ' + report.runtime.ignoredDuplicates + '.')
    if (report.runtime.notObserved.length) lines.push('Not observed in this trace: ' + report.runtime.notObserved.map(cell).join(', '))
    lines.push('', report.runtime.limitation)
  }
  lines.push('', '## Limits and incomplete evidence', '')
  lines.push(...report.limitations.map(line => '- ' + cell(line)), ...report.problems.map(line => '- PARTIAL: ' + cell(line)))
  return lines.join('\n')
}

const HELP = 'Usage:\n  node --expose-internals scripts/event-analyser.mjs [--root DIR] [--json] [--trace FILE]\n  node scripts/event-analyser.mjs record --trace FILE --id HANDLER_ID [--timeout-ms 10000] -- COMMAND [ARG...]\n\nAnalysis never executes hooks. Recording is opt-in, buffers at most 4 MiB of output, and defaults to a 10s timeout.\nExit 0: report complete (findings may exist); 2: invalid input or incomplete evidence. Recording preserves a normal child exit code.\n'

/** main implements explicit read-only analysis or bounded recording. */
export async function main(argv = process.argv.slice(2), io = {}) {
  const stdout = io.stdout ?? process.stdout
  const stderr = io.stderr ?? process.stderr
  const record = argv[0] === 'record'
  let root = ROOT
  let json = false
  let trace
  let handlerId
  let timeoutMs = 10_000
  let command
  let args = []
  try {
    for (let i = record ? 1 : 0; i < argv.length; i++) {
      const arg = argv[i]
      if (arg === '--help' || arg === '-h') { stdout.write(HELP); return 0 }
      if (arg === '--' && record) { command = argv[++i]; args = argv.slice(i + 1); break }
      if (arg === '--json' && !record) { json = true; continue }
      if (!['--root', '--trace', '--id', '--timeout-ms'].includes(arg) || i + 1 >= argv.length || argv[i + 1].startsWith('--')) throw new Error('Unknown or incomplete option: ' + arg)
      const value = argv[++i]
      if (arg === '--root' && !record) root = path.resolve(value)
      else if (arg === '--trace') trace = value
      else if (arg === '--id' && record) handlerId = value
      else if (arg === '--timeout-ms' && record) timeoutMs = Number(value)
      else throw new Error('Option is not valid in this mode: ' + arg)
    }
    if (record) {
      if (!trace || !handlerId || !command || !Number.isSafeInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 110_000) throw new Error('record needs --trace, --id, a command, and timeout 100..110000 ms')
      const chunks = []
      let bytes = 0
      for await (const chunk of io.stdin ?? process.stdin) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
        bytes += buffer.length
        if (bytes > MAX_FILE_BYTES) throw new Error('hook input exceeds 32 MiB')
        chunks.push(buffer)
      }
      const raw = Buffer.concat(chunks)
      const result = await recordInvocation({ traceFile: trace, handlerId, command, args, raw, timeoutMs })
      if (result.stdout) stdout.write(result.stdout)
      if (result.stderr) stderr.write(result.stderr)
      if (result.traceError || result.error || result.timedOut || result.outputLimitExceeded || result.cleanupConfirmed === false) {
        stderr.write('PARTIAL: diagnostic invocation or trace recording failed, timed out, exceeded its output limit, or cleanup is unconfirmed; inspect the trace.\n')
        return 2
      }
      return Number.isInteger(result.status) ? result.status : 2
    }
    const acorn = io.acorn ?? loadAcorn()
    const parse = acorn.unavailable ? undefined : source => acorn.parse(source, { ecmaVersion: 'latest', sourceType: 'module', locations: true, allowHashBang: true })
    const report = analyzeRepository(root, { parse, run: io.run })
    if (trace) {
      report.runtime = analyzeTrace(readBounded(trace), report.registrations)
      report.problems.push(...report.runtime.problems)
    }
    stdout.write((json ? JSON.stringify(report, null, 2) : formatReport(report)) + '\n')
    return report.problems.length ? 2 : 0
  } catch (error) {
    stderr.write('UNRUN: ' + error.message + '\n')
    return 2
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await main()
