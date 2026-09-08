// Git metadata discovery shared by readers that must not start a process to read a cache.
import { readFileSync, realpathSync, statSync } from 'node:fs'
import path from 'node:path'

function isGitDirectory(directory) {
  try {
    if (!statSync(path.join(directory, 'HEAD')).isFile()) return false
    const head = readFileSync(path.join(directory, 'HEAD'), 'utf8').trim()
    if (!/^(?:ref: refs\/\S+|[a-fA-F0-9]{40}|[a-fA-F0-9]{64})$/.test(head)) return false
    let common = directory
    try {
      const pointer = readFileSync(path.join(directory, 'commondir'), 'utf8').trim()
      if (!pointer) return false
      common = path.resolve(directory, pointer)
    } catch (error) { if (error.code !== 'ENOENT') return false }
    return statSync(path.join(common, 'objects')).isDirectory()
      && statSync(path.join(common, 'refs')).isDirectory()
  } catch { return false }
}

/** findGitDir locates Git metadata for a checkout, worktree or bare repository without spawning Git. */
export function findGitDir(start) {
  // Resolve symlinks before walking parents or resolving relative worktree pointers.
  let here = path.resolve(start)
  try { here = realpathSync(here) } catch {}
  for (;;) {
    if (isGitDirectory(here)) return here
    const candidate = path.join(here, '.git')
    let stat
    try { stat = statSync(candidate) } catch (error) {
      if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') return null
    }
    if (stat) {
      if (stat.isDirectory()) return isGitDirectory(candidate) ? candidate : null
      // Invalid metadata is a boundary, not permission to use a parent's cache.
      if (!stat.isFile()) return null
      try {
        const pointer = /^gitdir: ([^\r\n]+)\r?\n?$/.exec(readFileSync(candidate, 'utf8'))
        const target = pointer ? path.resolve(here, pointer[1].trim()) : null
        return target && isGitDirectory(target) ? target : null
      } catch { return null }
    }
    const parent = path.dirname(here)
    if (parent === here) return null
    here = parent
  }
}
