// BACKLOG §435: for landed 7bdb0be3 GitHub's default run-jobs endpoint answered HTTP 502 while the same run asked for by its
// explicit latest attempt returned its whole job list, so release-evidence said could-not-look and the release stopped before its
// tag. fetchRun now asks for the latest attempt by number when the default view fails, and reads the attempt and the sha again
// after: an attempt that changed between the reads, a sha that is not the one asked about, or a failure of the explicit query is
// still could-not-look (null), never approval.
import assert from 'node:assert/strict'
import test from 'node:test'
import { fetchRun } from '../scripts/release-evidence.mjs'

const full = 'b'.repeat(40)
const run = { databaseId: 9, status: 'completed', conclusion: 'success', headSha: full, headBranch: `land/${full}`, event: 'push', jobs: [{ name: 'windows', status: 'completed', conclusion: 'success' }] }

// A fake gh: the default view throws as a 502 does unless `defaultWorks`; `attempts` are the latest attempt each read returns.
function forge({ defaultWorks = false, attempts = [2, 2], attemptView = () => JSON.stringify(run), sha = full } = {}) {
  const asked = []
  const reads = [...attempts]
  const exec = (bin, argv) => {
    asked.push([bin, ...argv].join(' '))
    if (bin === 'git') return `${full}\n`
    if (argv[1] === 'list') return JSON.stringify([{ databaseId: 9, event: 'push', createdAt: '2026-11-08T10:00:00Z' }])
    const fields = argv[argv.indexOf('--json') + 1]
    if (fields === 'attempt,headSha') return JSON.stringify({ attempt: reads.shift(), headSha: sha })
    if (argv.includes('--attempt')) return attemptView(argv[argv.indexOf('--attempt') + 1])
    if (defaultWorks) return JSON.stringify(run)
    throw new Error('HTTP 502: Bad Gateway (https://api.github.com/repos/o/r/actions/runs/9/jobs)')
  }
  return { asked, exec }
}

test('a 502 on the default jobs view is answered by the latest attempt asked for by number', () => {
  const { asked, exec } = forge()
  assert.deepEqual(fetchRun(full, exec), run, asked.join('\n'))
  assert.ok(asked.some(a => a.includes('run view 9 --attempt 2 --json') && a.includes('jobs')), asked.join('\n'))
  // The control: a default view that answers is taken as it is, and nothing asks for an attempt.
  const control = forge({ defaultWorks: true })
  assert.deepEqual(fetchRun(full, control.exec), run)
  assert.ok(!control.asked.some(a => a.includes('--attempt') || a.includes('attempt,headSha')), control.asked.join('\n'))
})

test('an attempt that changes between the reads, another sha, or a failing explicit query is could-not-look', () => {
  assert.equal(fetchRun(full, forge({ attempts: [2, 3] }).exec), null, 'a re-run between the reads')
  assert.equal(fetchRun(full, forge({ sha: 'c'.repeat(40) }).exec), null, 'a run of another sha')
  assert.equal(fetchRun(full, forge({ attempts: [null, null] }).exec), null, 'no attempt number in the answer')
  assert.equal(fetchRun(full, forge({ attemptView: () => { throw new Error('HTTP 502') } }).exec), null, 'the explicit query fails too')
  assert.equal(fetchRun(full, forge({ attemptView: () => JSON.stringify({ ...run, headSha: 'c'.repeat(40) }) }).exec), null, 'the attempt view names another sha')
})
