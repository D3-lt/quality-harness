// BACKLOG §457: a removal that fails names what may still hold the directory. It used to append every process on the machine
// (`ps -Ao … command`), or on Windows every process whose command line merely mentioned git, gh or branch-state, which matched a
// Codex app-server under WSL: home paths and other programs' arguments in a CI log or an adopter's paste (CLAUDE.md §6). Only a
// process whose command line names the directory itself can be its holder, so only those are listed, home shown as `~`.
import { spawnSync } from 'node:child_process'
import os from 'node:os'

// `also`: substrings that mark a holder whose command line does not name the directory, such as branch-state's detached
// refresher, started as `node …/branch-state.mjs --refresh` with the repository only as its cwd (the Codex review of 2da11e87).
// Home is redacted in either separator spelling, and without case where it is a Windows drive path.
export function holdersIn(listing, dir, { home = os.homedir(), also = [] } = {}) {
  const name = String(dir).split(/[\\/]/).filter(Boolean).pop() ?? ''   // both separators, on any host (CLAUDE.md §7)
  const lines = String(listing).split(/\r?\n/).filter(line => (name && line.includes(name)) || also.some(mark => line.includes(mark)))
  const spellings = home ? [...new Set([home, home.replaceAll('\\', '/'), home.replaceAll('/', '\\')])] : []
  const pattern = spellings.length
    ? new RegExp(spellings.map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), /^[A-Za-z]:/.test(home) ? 'gi' : 'g')
    : null
  const shown = lines.map(line => (pattern ? line.replace(pattern, '~') : line))
  return shown.length ? shown.join('\n') : `no running process names ${name}`
}

export function listHolders(dir, { platform = process.platform, run = spawnSync, also = [] } = {}) {
  const listing = platform === 'win32'
    ? run('powershell', ['-NoProfile', '-Command', 'Get-CimInstance Win32_Process | ForEach-Object { "$($_.ProcessId) $($_.ParentProcessId) $($_.CommandLine)" }'],
      { encoding: 'utf8', timeout: 20_000, windowsHide: true })
    : run('ps', ['-Ao', 'pid,ppid,etime,command'], { encoding: 'utf8', timeout: 20_000, windowsHide: true })
  if (!listing.stdout) return `nothing could be listed: ${listing.stderr || listing.error?.message || 'no output'}`
  return holdersIn(listing.stdout, dir, { also })
}
