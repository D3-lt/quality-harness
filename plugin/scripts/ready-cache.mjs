// The answer `adr-next` gave for a task directory, reused while everything it read to give it still holds (ADR-095 T6). The gate
// runs under a recorder (plugin/lib/trace_run.py) that writes down every file it opens, every directory it lists, every path it asks
// about and every command it starts. The answer is stored with that record, and a later start re-checks it: each file's bytes, each
// directory's names, each path's kind, each command's output, the interpreter. Nothing is enumerated by hand, so a file the gate reads
// because a Tests table names it, a project's declared check, an empty directory or git's object format are dependencies without an
// edit here. An answer made while one of them changed is not stored. Anything that cannot be run, read, hashed, parsed or stored is a
// miss that says so once, and a miss runs the gate and returns its answer unchanged (CLAUDE.md section 16): the cache is never asked
// to prove absence.
import { createHash, randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { stateDir } from './event-log.mjs'
import { PLUGIN_ROOT } from './plugin-root.mjs'

const VERSION = 'ready-cache-v2'
const KEEP_ENTRIES = 100
const MAX_ENTRIES = 200
const ENTRY = /^[0-9a-f]{64}\.json$/
// What the gate or the commands it runs can see of the environment and that a user changes on purpose. A variable the gate reads that is
// not named here (PATH is read when it looks for git) is recorded with its value as a dependency of its own.
const ENVIRONMENT = /^(HOME|USERPROFILE|LANG|LC_[A-Z0-9_]+|TZ|PYTHON[A-Z0-9_]*|GIT_[A-Z0-9_]+|QUALITY_HARNESS_[A-Z0-9_]+)$/
// Windows names its variables without regard to case (the interpreter reads `ComSpec` where the process lists `COMSPEC`), and a copy of
// the environment made with a spread is a plain object that no longer does: there a name matches whatever its spelling.
const ENVIRONMENT_ANYCASE = new RegExp(ENVIRONMENT.source, 'i')

const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const localDate = now => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
const within = (file, prefixes) => prefixes.some(prefix => file === prefix || file.startsWith(prefix + path.sep) || file.startsWith(`${prefix}/`))

// The key is only what a manifest cannot say about itself: which gate, which directory, from where, on which day, under which
// environment. A function of what it is handed.
export function lookupKey({ gate, directory, cwd, date, environment }) {
  return sha(JSON.stringify([VERSION, gate, directory, cwd, date, Object.entries(environment).sort()]))
}

// What a stat said: a file by its size and modification time (the recorder writes the same text), a directory by its kind alone.
function kindOf(file) {
  try {
    const info = statSync(file, { bigint: true })
    return info.isDirectory() ? 'dir' : info.isFile() ? `file:${info.size}:${info.mtimeNs}` : 'other'
  } catch { return null }
}

function listing(directory) {
  try { return readdirSync(directory).filter(name => name !== '__pycache__').sort() } catch { return null }
}

function signature(file) {
  try { const info = statSync(file, { bigint: true }); return [Number(info.size), Number(info.mtimeNs)] } catch { return null }
}

function fileHash(file) {
  try { return sha(readFileSync(file)) } catch { return null }
}

// A command is run again as the gate asked for it: the list it passed, or the line it passed (through the shell, as a line is). A
// shape the recorder could not keep (no list and no line) is not run, and its answer is not kept.
function commandOutput(item) {
  let run
  if (Array.isArray(item.argv) && item.argv.length) run = spawnSync(item.argv[0], item.argv.slice(1), { cwd: item.cwd, timeout: 10_000, windowsHide: true, maxBuffer: 16 * 1024 * 1024 })
  else if (typeof item.line === 'string') run = spawnSync(item.line, { cwd: item.cwd, timeout: 10_000, windowsHide: true, maxBuffer: 16 * 1024 * 1024, shell: true })
  else return null
  if (run.error) return null
  return `${run.status}:${sha(run.stdout ?? Buffer.alloc(0))}`
}

export function readyCache(root, listingOfTree, { now = new Date(), pluginRoot = PLUGIN_ROOT, env = process.env, platform = process.platform } = {}) {
  if (!Array.isArray(listingOfTree)) return null
  let problem = null
  const fail = reason => { problem ??= reason; return null }
  const variable = name => {
    if (env[name] !== undefined || platform !== 'win32') return env[name] ?? null
    const upper = name.toUpperCase()
    const spelled = Object.keys(env).find(candidate => candidate.toUpperCase() === upper)
    return spelled === undefined ? null : env[spelled] ?? null
  }
  const trace = path.join(pluginRoot, 'lib', 'trace_run.py')
  const memo = { files: new Map(), lists: new Map(), kinds: new Map(), commands: new Map() }
  const remembered = (map, key, make) => { if (!map.has(key)) map.set(key, make()); return map.get(key) }
  const folder = () => path.join(stateDir(root), 'ready-cache')

  const keyFor = (gate, directory) => lookupKey({
    gate, directory, cwd: process.cwd(), date: localDate(now),
    environment: Object.fromEntries(Object.keys(env).filter(name => (platform === 'win32' ? ENVIRONMENT_ANYCASE : ENVIRONMENT).test(name)).map(name => [name, env[name]])),
  })

  // Every entry of the manifest must still hold; the first that does not ends the check.
  const holds = entry => {
    if (!entry.python || signature(entry.python.executable)?.join() !== entry.python.signature?.join()) return false
    // An environment variable the gate read is a dependency like a file: its value now is its value then.
    for (const [name, value] of Object.entries(entry.env ?? {})) if (variable(name) !== value) return false
    for (const item of entry.opened) if (remembered(memo.files, item.path, () => fileHash(item.path)) !== item.sha256) return false
    for (const item of entry.listed) if (JSON.stringify(remembered(memo.lists, item.path, () => listing(item.path))) !== JSON.stringify(item.names)) return false
    for (const item of entry.statted) if (remembered(memo.kinds, item.path, () => kindOf(item.path)) !== item.kind) return false
    for (const item of entry.ran) {
      const output = remembered(memo.commands, `${item.cwd}\0${Array.isArray(item.argv) ? item.argv.join('\0') : item.line}`, () => commandOutput(item))
      if (output === null) { fail('a command the gate ran could not be run again'); return false }
      if (output !== item.output) return false
    }
    return true
  }

  const prune = directory => {
    try {
      const names = readdirSync(directory).filter(name => ENTRY.test(name))
      if (names.length <= MAX_ENTRIES) return
      const aged = names.map(name => [name, statSync(path.join(directory, name)).mtimeMs]).sort((a, b) => a[1] - b[1])
      for (const [name] of aged.slice(0, aged.length - KEEP_ENTRIES)) rmSync(path.join(directory, name), { force: true })
    } catch { /* a directory that cannot be pruned only keeps its entries */ }
  }

  const lookup = key => {
    let text
    try { text = readFileSync(path.join(folder(), `${key}.json`), 'utf8') } catch (error) {
      if (error?.code === 'ENOENT') return null
      return fail(`a cache entry could not be read (${error.code ?? error.message})`)
    }
    let entry
    try { entry = JSON.parse(text) } catch { return fail('a cache entry was not JSON') }
    if (entry?.key !== key || entry.version !== VERSION || (entry.answer?.status !== 0 && entry.answer?.status !== 3) || typeof entry.answer?.stdout !== 'string'
      || !Array.isArray(entry.opened) || !Array.isArray(entry.listed) || !Array.isArray(entry.statted) || !Array.isArray(entry.ran)) {
      return fail('a cache entry did not carry the answer it was keyed by')
    }
    return holds(entry) ? { status: entry.answer.status, stdout: entry.answer.stdout, stderr: '' } : null
  }

  // Run the gate under the recorder, return what it returned, and keep it with its manifest unless something it read changed meanwhile.
  const traced = (key, runGate, gate, directory, options) => {
    const manifestFile = path.join(folder(), `${key}.${randomUUID()}.manifest`)
    try { mkdirSync(folder(), { recursive: true }) } catch (error) { fail(`the cache could not be written (${error.code ?? error.message})`); return runGate(gate, [directory, '--json'], options) }
    const result = runGate(trace, [manifestFile, gate, directory, '--json'], options)
    try {
      // A status the gate does not use. The recorder leaves a manifest when it ran to its end, and then the gate exited so itself and
      // that is its answer; with none the recorder died, and the answer is a plain run's, never the traced one's.
      if (result.status !== 0 && result.status !== 3) return existsSync(manifestFile) ? result : runGate(gate, [directory, '--json'], options)
      let manifest
      try { manifest = JSON.parse(readFileSync(manifestFile, 'utf8')) } catch (error) { fail(`the recorder wrote no manifest (${error.code ?? error.message})`); return result }
      if (manifest.env_all === true) { fail('the gate read the whole environment, which is not a dependency that can be checked'); return result }
      const prefixes = manifest.prefixes ?? []
      // Python's own bytecode cache is not something the gate read: it is written by the run, and it changes the directory it sits in.
      // It sits in a __pycache__ directory, or under the prefix PYTHONPYCACHEPREFIX moved it to.
      const bytecode = file => file.split(/[\\/]/).includes('__pycache__') || (typeof manifest.pycache === 'string' && within(file, [manifest.pycache]))
      const readable = Object.entries(manifest.opened).filter(([file]) => !within(file, prefixes) && !bytecode(file) && file !== manifestFile)
      // A file the gate tried to open that was not there is a dependency on its absence, not a reason to keep nothing.
      const opened = readable.filter(([, seen]) => seen)
      const absent = readable.filter(([, seen]) => !seen).map(([file]) => ({ path: file, kind: null }))
      const stable = opened.map(([file, seen]) => signature(file)?.join() === seen.join())
      const listed = Object.entries(manifest.listed).filter(([dir]) => !bytecode(dir)).map(([dir, names]) => ({ path: dir, names: names?.filter(name => name !== '__pycache__') ?? names }))
      const statted = [...Object.entries(manifest.statted).filter(([file]) => file !== manifestFile && !bytecode(file)).map(([file, kind]) => ({ path: file, kind })), ...absent]
      const unchanged = stable.every(Boolean)
        && listed.every(item => JSON.stringify(listing(item.path)) === JSON.stringify(item.names))
        && statted.every(item => kindOf(item.path) === item.kind)
      if (!unchanged) return result // something the gate read changed while it ran: the answer is given, and not kept
      const ran = manifest.ran.map(item => ({ ...item, output: commandOutput(item) }))
      if (ran.some(item => item.output === null)) return result
      const entry = {
        version: VERSION, key, answer: { status: result.status, stdout: result.stdout },
        python: { executable: manifest.python.executable, signature: signature(manifest.python.executable) },
        opened: opened.map(([file]) => ({ path: file, sha256: fileHash(file) })),
        listed, statted, ran, env: manifest.env ?? {},
      }
      if (entry.opened.some(item => item.sha256 === null) || !entry.python.signature) return result
      const temporary = path.join(folder(), `${key}.${randomUUID()}.tmp`)
      writeFileSync(temporary, JSON.stringify(entry), 'utf8')
      renameSync(temporary, path.join(folder(), `${key}.json`))
      prune(folder())
    } catch (error) { fail(`the cache could not be written (${error.code ?? error.message})`) } finally {
      rmSync(manifestFile, { force: true })
      rmSync(`${manifestFile}.part`, { force: true })
    }
    return result
  }

  return {
    problem: () => problem,
    // The gate's answer for a task directory: from the cache while its manifest holds, otherwise from a run of the gate under the recorder.
    answer(directory, runGate, gate, options) {
      // A plugin copy without its recorder is an incomplete copy, and the gate says so in its own words when it is run plainly.
      if (!existsSync(trace)) return runGate(gate, [directory, '--json'], options)
      let key
      try {
        key = keyFor(gate, directory)
        const kept = lookup(key)
        if (kept) return kept
      } catch (error) {
        fail(`the cache could not be used (${error.code ?? error.message})`)
        return runGate(gate, [directory, '--json'], options)
      }
      return traced(key, runGate, gate, directory, options)
    },
  }
}
