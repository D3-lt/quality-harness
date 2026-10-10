// What a function can reach, transitively, across the plugin's own modules: a file read or write, a process, the clock or the
// environment, an output stream. BACKLOG section 375, stage C: a judge that is meant to be a function of its facts says so
// here, and a later change that makes it read the world fails this check instead of reviewing well.
//
//   node --expose-internals scripts/effect-classes.mjs [--root DIR] <file::function>...   exits 0 when every named function
//   reaches no effect, 1 when one does (and names the path), 2 when nothing was named, a function or file cannot be found or read,
//   or Node was started without --expose-internals (UNRUN, never "pure").
//
// A call is followed through the file's own declarations and its named imports from other plugin files. A call through a
// parameter, a method or a value (`log.some`, `read(...)`) is not followed: such a function is pure only because what it is
// handed is, and that is what its facts are for. A module that is not a plugin file and not a Node built-in this table knows
// is an effect of its own kind, so an unknown import never reads as pure (ADR-005).
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { isMainModule } from '../plugin/scripts/main-module.mjs'

const FS_READ = new Set(['readFileSync', 'readdirSync', 'statSync', 'lstatSync', 'existsSync', 'realpathSync', 'readlinkSync', 'openSync', 'readSync', 'accessSync', 'opendirSync', 'fstatSync', 'readFile', 'closeSync', 'readdir', 'stat', 'lstat', 'realpath', 'readlink', 'access', 'open'])
const FS_WRITE = new Set(['writeFileSync', 'appendFileSync', 'mkdirSync', 'rmSync', 'unlinkSync', 'renameSync', 'copyFileSync', 'utimesSync', 'symlinkSync', 'writeSync', 'cpSync', 'rmdirSync', 'chmodSync', 'linkSync', 'mkdtempSync', 'writeFile', 'appendFile', 'mkdir', 'rm', 'unlink', 'rename', 'copyFile', 'cp'])
const SPAWN = new Set(['spawnSync', 'spawn', 'execFileSync', 'execSync', 'execFile', 'fork'])
// Node built-ins that are pure to call, by module: everything else from a `node:` module is an effect of its own kind, so an
// export this table has not heard of (createReadStream, truncateSync, randomBytes) never reads as pure.
const PURE_BUILTINS = new Map([['node:path', '*'], ['node:url', '*'], ['node:string_decoder', '*'], ['node:util', '*'], ['node:assert', '*'], ['node:assert/strict', '*'], ['node:crypto', ['createHash']]])

// Globals whose use is an effect of its own: output, timers, the network, evaluation, the environment as a whole.
const EFFECT_GLOBALS = new Set(['console', 'performance', 'setTimeout', 'setInterval', 'setImmediate', 'queueMicrotask', 'fetch', 'require', 'eval', 'Function', 'globalThis', 'process'])

const kids = node => { const out = []; for (const key of Object.keys(node)) { if (key === 'loc') continue; const value = node[key]; if (Array.isArray(value)) value.forEach(item => item && typeof item.type === 'string' && out.push(item)); else if (value && typeof value.type === 'string') out.push(value) } return out }
const walk = (node, visit, parent = null) => { visit(node, parent); kids(node).forEach(child => walk(child, visit, node)) }

export function analyse({ root, read = file => readFileSync(file, 'utf8'), acorn }) {
  const modules = new Map()
  const load = file => {
    const full = path.resolve(root, file)
    if (modules.has(full)) return modules.get(full)
    let text
    try { text = read(full) } catch (error) { throw Object.assign(new Error(`could not read ${file}: ${error.code ?? error.message}`), { unread: true }) }
    const tree = acorn.parse(text.replace(new RegExp('[\u2028\u2029]', 'g'), ' '), { ecmaVersion: 'latest', sourceType: 'module', allowHashBang: true })
    const decls = new Map(); const imports = new Map()
    for (const node of tree.body) {
      if (node.type === 'ImportDeclaration') {
        for (const spec of node.specifiers) imports.set(spec.local.name, { source: node.source.value, imported: spec.type === 'ImportSpecifier' ? spec.imported.name : spec.type === 'ImportNamespaceSpecifier' ? '*' : 'default' })
        continue
      }
      const decl = node.type === 'ExportNamedDeclaration' ? node.declaration : node
      if (decl?.type === 'FunctionDeclaration') decls.set(decl.id.name, decl)
      else if (decl?.type === 'VariableDeclaration') for (const one of decl.declarations) if (one.id.type === 'Identifier') decls.set(one.id.name, one.init ?? one)
    }
    const module = { full, decls, imports }
    modules.set(full, module)
    return module
  }
  const memo = new Map()
  // Returns the shortest evidence of an effect reachable from file::name, or null.
  const effectOf = (file, name, stack = new Set()) => {
    const full = path.resolve(root, file)
    const key = `${full}::${name}`
    if (memo.has(key)) return memo.get(key)
    if (stack.has(key)) return null
    const module = load(full)
    const body = module.decls.get(name)
    if (!body) throw Object.assign(new Error(`${file} declares no ${name}`), { missing: true })
    stack.add(key)
    let found = null
    const note = (what, parent) => { if (!found) found = what }
    walk(body, (node, parent) => {
      if (found) return
      if (node.type === 'NewExpression' && node.callee.name === 'Date') return note('the clock (new Date)')
      if (node.type === 'ImportExpression') return note('a dynamic import')
      if (node.type === 'MemberExpression' && !node.computed) {
        const object = node.object.type === 'Identifier' ? node.object.name : null
        if (object === 'process' && node.property.name !== 'platform') return note(`process.${node.property.name}`)
        if (object === 'Date' && node.property.name === 'now') return note('the clock (Date.now)')
        if (object === 'Math' && node.property.name === 'random') return note('randomness (Math.random)')
      }
      if (node.type !== 'Identifier') return
      if (parent?.type === 'MemberExpression' && parent.property === node && !parent.computed) return
      if (parent?.type === 'Property' && parent.key === node && !parent.computed && !parent.shorthand) return
      const local = node.name
      if (local === 'process' && parent?.type === 'MemberExpression' && parent.object === node && !parent.computed && parent.property.name === 'platform') return
      if (EFFECT_GLOBALS.has(local) && !module.imports.has(local) && !module.decls.has(local)) return note(`the global ${local}`)
      if (local === name && parent?.type === 'FunctionDeclaration') return
      const imported = module.imports.get(local)
      if (imported) {
        if (imported.source.startsWith('node:')) {
          if (FS_READ.has(imported.imported)) return note(`a file read (${imported.imported})`)
          if (FS_WRITE.has(imported.imported)) return note(`a file write (${imported.imported})`)
          if (SPAWN.has(imported.imported)) return note(`a process (${imported.imported})`)
          const pure = PURE_BUILTINS.get(imported.source)
          if (pure === '*' || (Array.isArray(pure) && pure.includes(imported.imported))) return
          return note(`the machine or an unlisted built-in (${imported.source}${imported.imported === 'default' ? '' : ` ${imported.imported}`})`)
        }
        if (imported.source.startsWith('.')) {
          const target = path.resolve(path.dirname(full), imported.source)
          if (imported.imported === '*' || imported.imported === 'default') return note(`a namespace or default import of ${imported.source}`)
          let inner
          try { inner = effectOf(target, imported.imported, stack) } catch (error) { if (error.missing) return note(`${imported.imported} from ${imported.source}, which this check cannot find`); throw error }
          if (inner) return note(`${imported.imported} (${path.basename(target)}) -> ${inner}`)
          return
        }
        return note(`an import from ${imported.source}`)
      }
      if (local !== name && module.decls.has(local) && parent?.type !== 'VariableDeclarator') {
        const inner = effectOf(full, local, stack)
        if (inner) return note(`${local} -> ${inner}`)
      }
    })
    stack.delete(key)
    // An effect found is final; "none found" is final only for the outermost call, since a function met inside a cycle was
    // judged without the one that called it.
    if (found !== null || stack.size === 0) memo.set(key, found)
    return found
  }
  return { effectOf }
}

export function main(argv, { acorn, stdout = process.stdout, stderr = process.stderr } = {}) {
  let root = process.cwd()
  const targets = []
  for (let i = 0; i < argv.length; i++) { if (argv[i] === '--root') root = path.resolve(argv[++i]); else targets.push(argv[i]) }
  if (!targets.length) { stderr.write('effect-classes: UNRUN — no function was named (file::function).\n'); return 2 }
  const { effectOf } = analyse({ root, acorn })
  let code = 0
  for (const target of targets) {
    const [file, name] = target.split('::')
    if (!file || !name) { stderr.write(`effect-classes: UNRUN — ${target} is not file::function.\n`); return 2 }
    let effect
    try { effect = effectOf(file, name) } catch (error) { stderr.write(`effect-classes: UNRUN — ${error.message}\n`); return 2 }
    if (effect) { stdout.write(`${target}: reaches ${effect}\n`); code = 1 } else stdout.write(`${target}: pure\n`)
  }
  return code
}

if (isMainModule(import.meta.url)) {
  let acorn
  try { acorn = createRequire(import.meta.url)('internal/deps/acorn/acorn/dist/acorn') } catch {
    process.stderr.write('effect-classes: UNRUN — it reads syntax trees through the acorn that Node bundles, which needs `node --expose-internals`.\n')
    process.exitCode = 2
  }
  if (acorn) process.exitCode = main(process.argv.slice(2), { acorn })
}
