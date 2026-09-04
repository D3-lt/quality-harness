// CLAUDE.md §15 — the session-start reader, and the arms that must not look alike.
//
// The incident this comes from is one where every check was correct and nobody
// read the failing one (BACKLOG §126), so what matters here is that the reader
// DISTINGUISHES: green, red, still-running and could-not-look are four answers,
// and three of them are not a clean bill. Every arm is driven through the `run`
// seam, so this test needs no network, no remote and no `gh` (CLAUDE.md §7, §9).
import assert from 'node:assert/strict'
import test from 'node:test'

import { collect, render } from '../scripts/branch-state.mjs'

const ok = out => ({ ok: true, out })
const no = note => ({ ok: false, out: '', note })

// One fake process table. Anything not named here answers "not ok", which is
// what an absent binary looks like.
function runner(table) {
  return argv => {
    for (const [prefix, answer] of table) {
      if (argv.join(' ').startsWith(prefix)) return answer
    }
    return no(`no fake for: ${argv.join(' ')}`)
  }
}

const GIT_CLEAN = [
  ['git rev-parse --abbrev-ref', ok('main')],
  ['git rev-parse --short', ok('0a18d04')],
  ['git status --short', ok('')],
  ['git rev-list', ok('0\t0')],
  ['git describe', ok('v2.64.0')],
  ['git diff --name-only', ok('')],
]

test('a green run and a red run do not read alike', () => {
  const green = render(collect(runner([...GIT_CLEAN,
    ['gh run list', ok(JSON.stringify([{ headSha: '0a18d04ff', status: 'completed', conclusion: 'success', databaseId: 1 }]))],
  ])))
  assert.match(green, /every job concluded success/)
  assert.doesNotMatch(green, /COULD NOT LOOK|⚠/)

  const red = render(collect(runner([...GIT_CLEAN,
    ['gh run list', ok(JSON.stringify([{ headSha: '479fbef1', status: 'completed', conclusion: 'failure', databaseId: 2 }]))],
    ['gh run view', ok(JSON.stringify({ jobs: [
      { name: 'coverage floor', conclusion: 'failure' },
      { name: 'selftest (macos-latest)', conclusion: 'success' },
    ] }))],
  ])))
  assert.match(red, /FAILURE/)
  assert.match(red, /coverage floor: failure/, 'name the job, or the reader has to go and look')
  assert.match(red, /A LOCAL GREEN GATE DOES NOT ANSWER THIS/,
    'the whole incident was a local green read as a branch verdict')
})

test('could-not-look and still-running are their own answers, never clean bills', () => {
  // `gh` absent: the exact case where staying quiet would read as green.
  const blind = render(collect(runner(GIT_CLEAN)))
  assert.match(blind, /COULD NOT LOOK/)
  assert.match(blind, /NOT a green branch; an unknown one/)

  const running = render(collect(runner([...GIT_CLEAN,
    ['gh run list', ok(JSON.stringify([{ headSha: 'abcdef01', status: 'in_progress', conclusion: null, databaseId: 3 }]))],
  ])))
  assert.match(running, /still running/)
  assert.doesNotMatch(running, /concluded success/)

  // And no git at all is could-not-look about everything, not a report.
  const noGit = render(collect(() => no('git: command not found')))
  assert.match(noGit, /COULD NOT LOOK — git: command not found/)
  assert.match(noGit, /says nothing about the branch/)
})

test('unreleased plugin changes are named, and an unchanged plugin says nothing', () => {
  const shipped = render(collect(runner([
    ...GIT_CLEAN.filter(([prefix]) => prefix !== 'git diff --name-only'),
    ['git diff --name-only', ok('plugin/bin/adr-verify\nplugin/scripts/lifecycle.mjs')],
    ['gh run list', ok(JSON.stringify([{ headSha: '0a18d04ff', status: 'completed', conclusion: 'success', databaseId: 1 }]))],
  ])))
  assert.match(shipped, /plugin\/ changed in 2 file\(s\) since v2\.64\.0/)

  const parked = render(collect(runner([...GIT_CLEAN,
    ['gh run list', ok(JSON.stringify([{ headSha: '0a18d04ff', status: 'completed', conclusion: 'success', databaseId: 1 }]))],
  ])))
  assert.doesNotMatch(parked, /plugin\/ changed/,
    'an unchanged plugin must not nag — a reminder that always fires is one nobody reads')
})
