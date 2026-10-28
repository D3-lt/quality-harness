// Repository-only native production scope, source hashing and manifest construction.
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { lstatSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { READER_DIRECTORIES } from '../plugin/scripts/reader-paths.mjs'
import { parseCoreManifest } from '../plugin/scripts/native-provenance.mjs'

// Include embedded data and assembly; only tests and explicit build outputs are excluded.
const NATIVE_BUILD_FILES = ['scripts/build-core.mjs', 'scripts/native-source.mjs', 'plugin/scripts/core-assets.mjs', 'plugin/.claude-plugin/plugin.json', '.github/workflows/selftest.yml']
export const NATIVE_READER_ROOTS = ['core', ...NATIVE_BUILD_FILES]
export function isNativeReaderPath(file) {
  const name = String(file).replaceAll('\\', '/')
  return NATIVE_BUILD_FILES.includes(name)
    || (name.startsWith('core/') && !name.startsWith('core/bin/') && !name.endsWith('_test.go'))
}
export function isReaderPath(file) {
  const name = String(file).replaceAll('\\', '/')
  return READER_DIRECTORIES.some(directory => name.startsWith('plugin/' + directory + '/'))
    || isNativeReaderPath(name)
}
function hashSources(files, read) {
  const hash = createHash('sha256')
  for (const file of [...files].sort()) {
    hash.update(file + '\0')
    const bytes = read(file)
    hash.update(/\.(?:go|mod|sum|mjs)$/.test(file) ? bytes.toString('utf8').replaceAll('\r\n', '\n') : bytes)
    hash.update('\0')
  }
  return hash.digest('hex')
}
export function nativeSourcesAt(git, at) {
  const listing = git('ls-tree', '-r', '-z', at, '--', ...NATIVE_READER_ROOTS)
  if (listing.error || listing.status !== 0) return null
  const files = String(listing.stdout).split('\0').filter(Boolean).flatMap(line => {
    const tab = line.indexOf('\t')
    const meta = line.slice(0, tab), name = line.slice(tab + 1)
    return /^(100644|100755) /.test(meta) && isNativeReaderPath(name) ? [name] : []
  })
  if (!files.some(file => file.startsWith('core/') && file.endsWith('.go'))) return null
  try {
    return hashSources(files, file => {
      const answer = git('show', at + ':' + file)
      if (answer.error || answer.status !== 0) throw new Error('unreadable native blob')
      return answer.stdout
    })
  } catch { return null }
}
export function nativeSourceIdentity(root, { run = args => spawnSync('git', ['-C', root, ...args],
  { timeout: 30_000, maxBuffer: 8 << 20, windowsHide: true, env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' } }) } = {}) {
  const head = run(['rev-parse', 'HEAD'])
  const at = !head.error && head.status === 0 ? String(head.stdout).trim() : ''
  const listing = run(['ls-files', '-z', '--cached', '--others', '--', ...NATIVE_READER_ROOTS])
  if (head.error || !/^[0-9a-f]{40}$/.test(at) || listing.error || listing.status !== 0) {
    return { at: null, sources: null, reason: 'native source checkout could not be read' }
  }
  const files = [...new Set(String(listing.stdout).split('\0').filter(isNativeReaderPath))]
  if (!files.some(file => file.startsWith('core/') && file.endsWith('.go'))) {
    return { at: null, sources: null, reason: 'native production sources were not found' }
  }
  try {
    const sources = hashSources(files, file => {
      const absolute = path.join(root, file)
      if (!lstatSync(absolute).isFile()) throw new Error('native input is not a regular file')
      return readFileSync(absolute)
    })
    const git = (...args) => run(args)
    const committed = nativeSourcesAt(git, at)
    return { at: committed === sources ? at : null, sources,
      ...(committed === sources ? {} : { reason: 'native production inputs differ from HEAD or could not be compared' }) }
  } catch { return { at: null, sources: null, reason: 'native production inputs could not be read' } }
}
export function coreManifest(source, entries) {
  if (source.at !== null && !/^[0-9a-f]{40}$/.test(source.at)) throw new Error('invalid native source commit')
  if (!/^[0-9a-f]{64}$/.test(source.sources) || (source.run !== null && !/^[1-9][0-9]*$/.test(source.run))) throw new Error('invalid native source identity')
  const text = '# qh-core-source-v1 ' + (source.at ?? '-') + ' ' + source.sources + ' ' + (source.run ?? '-') + '\n'
    + entries.map(([name, sha]) => sha + '  ' + name).join('\n') + '\n'
  parseCoreManifest(text)
  return text
}
export function nativeContractAt(git, at) {
  const listing = git('ls-tree', '--name-only', at, '--', 'plugin/scripts/native-provenance.mjs')
  return listing.error || listing.status !== 0 ? null : String(listing.stdout).trim() !== ''
}
