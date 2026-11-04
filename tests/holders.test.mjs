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
    `  404     1   00:02 /usr/bin/node ${home}/src/qh/plugin/scripts/branch-state.mjs --refresh`,
  ].join('\n')
  const shown = holdersIn(listing, dir, { home })
  assert.match(shown, /101 .*~\/tmp\/qh-brief-AbC123\/\.git\/refresh\.mjs/, 'the holder, home as ~')
  assert.doesNotMatch(shown, /codex|secret|elsewhere/, 'no other process')
  assert.doesNotMatch(shown, /404/, 'a refresher is not listed unless asked for')
  assert.ok(!shown.includes(home), 'no home path')
  assert.equal(holdersIn('  PID COMMAND\n 1 init', dir, { home }), 'no running process names qh-brief-AbC123', 'none is said')
  // The detached refresher's command line names its script, not the directory it holds (its cwd).
  assert.match(holdersIn(listing, dir, { home, also: [['branch-state.mjs', '--refresh']] }), /404 .*~\/src\/qh\/plugin\/scripts\/branch-state\.mjs --refresh/)
  // On Windows the script path may be quoted, so the two parts are not adjacent (the Codex verification of 36cda377).
  const quoted = '505 1 node "C:/source code/qh/plugin/scripts/branch-state.mjs" --refresh'
  assert.match(holdersIn(quoted, dir, { home, also: [['branch-state.mjs', '--refresh']] }), /505/)
  assert.doesNotMatch(holdersIn('606 1 node other.mjs --refresh', dir, { home, also: [['branch-state.mjs', '--refresh']] }), /606/, 'every part must appear')

  // A Windows home in every spelling a command line can carry it in.
  const winHome = 'C:\\Users\\Alice'
  const winListing = [
    '12 1 node C:\\Users\\Alice\\AppData\\Local\\Temp\\qh-brief-AbC123\\x.mjs',
    '13 1 node C:/Users/Alice/AppData/Local/Temp/qh-brief-AbC123/y.mjs',
    '14 1 node c:\\users\\alice\\AppData\\Local\\Temp\\qh-brief-AbC123\\z.mjs',
  ].join('\r\n')
  const winShown = holdersIn(winListing, 'C:\\Users\\Alice\\AppData\\Local\\Temp\\qh-brief-AbC123', { home: winHome })
  assert.equal(winShown.split('\n').length, 3)
  assert.doesNotMatch(winShown, /alice/i, `every spelling redacted:\n${winShown}`)

  const seen = []
  const run = (cmd, args) => { seen.push(cmd); return { stdout: listing } }
  assert.match(listHolders(dir, { platform: 'win32', run }), /101/)
  assert.match(listHolders(dir, { platform: 'linux', run }), /101/)
  assert.deepEqual(seen, ['powershell', 'ps'], 'each platform asks its own lister')
  assert.match(listHolders(dir, { run: () => ({ stdout: '', stderr: 'ps: not found' }) }), /nothing could be listed: ps: not found/)
})
