#!/usr/bin/env node
// Which processes still name this run's directory? scripts/selftest.sh asks after the suite.
//
// Its own leak check sees direct children only (`pgrep -P $$`), and a grandchild whose parent
// died is re-parented to pid 1, out of that reach (BACKLOG §130). Found 2026-10-15: five lease
// holders from tests/lease.test.mjs, 8 h 51 min old, polling every 20 ms for a file in a temp
// directory long gone. Every one named the run's directory in its arguments, which is the one
// thing such a process cannot shed. POSIX only: on Windows selftest.sh owns no run directory.
//
// Usage: node scripts/run-orphans.mjs <dir> [--grace-ms N] [--kill]
// Exit:  0 none left after the grace · 1 some were (named on stderr; killed with --kill)
//        2 usage · 3 could not look (`ps` did not run): never "none" (ADR-005)
import { spawnSync } from 'node:child_process'
import { isMainModule } from '../plugin/scripts/main-module.mjs'

/** The rows of `ps -Ao pid=,ppid=,args=` whose arguments name `dir` as a path, `self` excluded. */
export function naming(psOutput, dir, self) {
  const named = new RegExp(`(?:^|\\s)${dir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:/|\\s|$)`)
  return psOutput.split('\n').map(line => /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(line)).filter(Boolean)
    .map(([, pid, ppid, args]) => ({ pid: Number(pid), ppid: Number(ppid), args }))
    .filter(row => row.pid !== self && named.test(row.args))
}

function look(dir) {
  const ps = spawnSync('ps', ['-Ao', 'pid=,ppid=,args='], { encoding: 'utf8', timeout: 10_000, windowsHide: true, maxBuffer: 64 * 1024 * 1024 })
  return ps.status === 0 ? naming(ps.stdout, dir, process.pid) : null
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

if (isMainModule(import.meta.url)) {
  const argv = process.argv.slice(2)
  const dir = argv[0]
  const at = argv.indexOf('--grace-ms')
  const grace = at >= 0 ? Number(argv[at + 1]) : 5000
  if (!dir || dir.startsWith('--') || !Number.isFinite(grace) || grace < 0) {
    process.stderr.write('usage: node scripts/run-orphans.mjs <dir> [--grace-ms N] [--kill]\n')
    process.exit(2)
  }
  let left = look(dir)
  for (const end = Date.now() + grace; left?.length && Date.now() < end;) {
    await sleep(100)
    left = look(dir)
  }
  if (left === null) {
    process.stderr.write(`run-orphans: COULD NOT LOOK — ps did not run, so nothing here says no process still names ${dir}\n`)
    process.exit(3)
  }
  if (!left.length) process.exit(0)
  const kill = argv.includes('--kill')
  process.stderr.write(`run-orphans: ${left.length} process(es) still name ${dir}${kill ? ', killed' : ''}:\n`)
  for (const row of left) {
    process.stderr.write(`  ${row.pid} (parent ${row.ppid}) ${row.args.slice(0, 200)}\n`)
    if (kill) try { process.kill(row.pid, 'SIGKILL') } catch { /* it ended on its own */ }
  }
  process.exit(1)
}
