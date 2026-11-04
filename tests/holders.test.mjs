// BACKLOG §457: a failed removal lists only the processes whose command line names the directory, never the whole machine, and
// shows the home directory as `~` (CLAUDE.md §6).
import assert from 'node:assert/strict'
import test from 'node:test'
import { holdersIn, listHolders } from './helpers/holders.mjs'

test('a failed removal names only the processes that name its directory, with home shown as ~', () => {
  const home = ['', 'home', 'alice'].join('/')
  const dir = `${home}/tmp/qh-brief-AbC123`
  const listing = [
    '  PID  PPID ELAPSED COMMAND',
    `  101     1   00:01 node ${home}/tmp/qh-brief-AbC123/.git/refresh.mjs`,
    `  202     1   01:00 /usr/bin/codex app-server --config ${home}/.codex/secret.toml`,
    '  303     1   02:00 git -C /elsewhere status',
  ].join('\n')
  const shown = holdersIn(listing, dir, home)
  assert.match(shown, /101 .*~\/tmp\/qh-brief-AbC123\/\.git\/refresh\.mjs/, 'the holder, home as ~')
  assert.doesNotMatch(shown, /codex|secret|elsewhere/, 'no other process')
  assert.ok(!shown.includes(home), 'no home path')
  assert.equal(holdersIn('  PID COMMAND\n 1 init', dir, home), 'no running process names qh-brief-AbC123', 'none is said')

  const seen = []
  const run = (cmd, args) => { seen.push(cmd); return { stdout: listing } }
  assert.match(listHolders(dir, { platform: 'win32', run }), /101/)
  assert.match(listHolders(dir, { platform: 'linux', run }), /101/)
  assert.deepEqual(seen, ['powershell', 'ps'], 'each platform asks its own lister')
  assert.match(listHolders(dir, { run: () => ({ stdout: '', stderr: 'ps: not found' }) }), /nothing could be listed: ps: not found/)
})
