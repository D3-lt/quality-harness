// The answer `adr-next` gave for a task directory, kept by the content that produced it (ADR-095 T2). A session start, a resume
// and a compaction each ran `adr-next` once per recently changed task directory, six serial Python runs of 1.0 to 1.4 s in all,
// over inputs that had not changed since the last start. An answer is reused only when every input that could change it is
// byte-identical; anything that cannot be read, hashed or stored is a miss, and a miss runs `adr-next` as before (CLAUDE.md
// section 16): the cache is never asked to prove absence.
//
// What `adr-next` reads is more than its task directory. A task may depend on a task of another record (a qualified id), its
// record is found among the siblings, and a log row dated more than a day ahead is judged against today. So the key covers the
// whole corpus directory (the grandparent of the task directory) as it is on disk, which files git tracks there, the three files
// that make up the gate, and today's date. A link or a special file anywhere in that tree, or a tree past the caps, is not hashed:
// it is a miss that says why.
import { createHash, randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { stateDir } from './event-log.mjs'
import { PLUGIN_ROOT } from './plugin-root.mjs'

const VERSION = 'ready-cache-v1'
const CORPUS_MAX_FILES = 5000
const CORPUS_MAX_BYTES = 64 * 1024 * 1024
const KEEP_ENTRIES = 100
const MAX_ENTRIES = 200
const ENTRY = /^[0-9a-f]{64}\.json$/

// A function of the bytes it is handed and of nothing else: equal inputs give equal keys, and any one different byte, name,
// date or path gives a different one. Each piece is framed by its own digest, so bytes cannot slide between neighbours.
export function readyKey({ tools, date, directory, corpusRoot, tracked, corpus }) {
  const outer = createHash('sha256')
  const piece = (label, value) => {
    outer.update(label)
    outer.update(createHash('sha256').update(value).digest())
  }
  piece('version', VERSION)
  for (const [name, bytes] of tools) { piece('tool', name); piece('toolbytes', bytes) }
  piece('date', date)
  piece('directory', directory)
  piece('corpus', corpusRoot)
  for (const entry of tracked) piece('tracked', entry)
  for (const [name, bytes] of corpus) { piece('file', name); piece('bytes', bytes) }
  return outer.digest('hex')
}

const localDate = now => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

// Every file under the corpus directory, by relative path and content, in a fixed order. { problem } instead when the tree holds a
// link, a special file or too much to hash, or when anything in it cannot be read.
export function gatherCorpus(corpusRoot) {
  const entries = []
  let bytes = 0
  const walk = (directory, prefix) => {
    const found = readdirSync(directory, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    for (const entry of found) {
      const name = prefix ? `${prefix}/${entry.name}` : entry.name
      const full = path.join(directory, entry.name)
      if (entry.isDirectory()) { walk(full, name); continue }
      if (!entry.isFile()) throw Object.assign(new Error('link or special file'), { reason: `${name} is a link or a special file, which this cache does not follow` })
      const data = readFileSync(full)
      bytes += data.length
      if (entries.length >= CORPUS_MAX_FILES || bytes > CORPUS_MAX_BYTES) throw Object.assign(new Error('too large'), { reason: 'the corpus directory is past the size this cache will hash' })
      entries.push([name, data])
    }
  }
  try { walk(corpusRoot, '') } catch (error) { return { problem: error.reason ?? `the corpus directory could not be read (${error.code ?? error.message})` } }
  return { entries }
}

// root: the repository; listing: the paths git lists in it (null where git could not list the tree, and then there is no cache).
// `lookup` returns a stored result or null; `store` keeps a decisive result; `problem` is the first reason the cache could not be
// used, or null. None of them throws.
export function readyCache(root, listing, { now = new Date(), pluginRoot = PLUGIN_ROOT } = {}) {
  if (!Array.isArray(listing)) return null
  let problem = null
  const fail = reason => { problem ??= reason; return null }
  let tools
  const gate = () => {
    if (tools !== undefined) return tools
    try {
      tools = [['adr-next', ['bin', 'adr-next']], ['record.py', ['lib', 'record.py']], ['plugin.json', ['.claude-plugin', 'plugin.json']]]
        .map(([name, parts]) => [name, readFileSync(path.join(pluginRoot, ...parts))])
    } catch (error) { tools = null; fail(`the gate's own files could not be read (${error.code ?? error.message})`) }
    return tools
  }
  const corpora = new Map()
  const keyFor = directory => {
    const corpusRoot = path.dirname(path.dirname(directory))
    const relative = path.relative(root, corpusRoot)
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return fail('the task directory is not inside a corpus directory below the repository')
    const files = gate()
    if (!files) return null
    if (!corpora.has(corpusRoot)) corpora.set(corpusRoot, gatherCorpus(corpusRoot))
    const corpus = corpora.get(corpusRoot)
    if (corpus.problem) return fail(corpus.problem)
    const prefix = `${relative.split(path.sep).join('/')}/`
    const tracked = listing.filter(entry => entry.startsWith(prefix)).sort()
    return readyKey({ tools: files, date: localDate(now), directory, corpusRoot, tracked, corpus: corpus.entries })
  }
  const entryFile = key => path.join(stateDir(root), 'ready-cache', `${key}.json`)
  const prune = directory => {
    try {
      const names = readdirSync(directory).filter(name => ENTRY.test(name))
      if (names.length <= MAX_ENTRIES) return
      const aged = names.map(name => [name, statSync(path.join(directory, name)).mtimeMs]).sort((a, b) => a[1] - b[1])
      for (const [name] of aged.slice(0, aged.length - KEEP_ENTRIES)) rmSync(path.join(directory, name), { force: true })
    } catch { /* a directory that cannot be pruned only keeps its entries */ }
  }
  return {
    problem: () => problem,
    lookup(directory) {
      try {
        const key = keyFor(directory)
        if (!key) return null
        let text
        try { text = readFileSync(entryFile(key), 'utf8') } catch (error) {
          if (error?.code === 'ENOENT') return null
          return fail(`a cache entry could not be read (${error.code ?? error.message})`)
        }
        let entry
        try { entry = JSON.parse(text) } catch { return fail('a cache entry was not JSON') }
        if (entry?.key !== key || (entry.status !== 0 && entry.status !== 3) || typeof entry.stdout !== 'string') return fail('a cache entry did not carry the answer it was keyed by')
        return { status: entry.status, stdout: entry.stdout, stderr: '' }
      } catch (error) { return fail(`the cache could not be used (${error.code ?? error.message})`) }
    },
    store(directory, run) {
      if (!run || (run.status !== 0 && run.status !== 3) || typeof run.stdout !== 'string') return
      try {
        const key = keyFor(directory)
        if (!key) return
        const folder = path.join(stateDir(root), 'ready-cache')
        mkdirSync(folder, { recursive: true })
        const temporary = path.join(folder, `${key}.${randomUUID()}.tmp`)
        writeFileSync(temporary, JSON.stringify({ key, status: run.status, stdout: run.stdout }), 'utf8')
        renameSync(temporary, entryFile(key))
        prune(folder)
      } catch (error) { fail(`the cache could not be written (${error.code ?? error.message})`) }
    },
  }
}
