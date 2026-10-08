// BACKLOG §356: an outside run's --diff showed one added advice line, "cross-record dependency cycles
// were NOT checked: this corpus could not be listed from git", which no change between the two releases
// could produce. It said what that run could not see, not what the corpus is, and a reader chased a
// regression. A could-not-look advice line that comes or goes is marked as about the run; every other
// advice line is printed as before, and neither is hidden.
import assert from 'node:assert/strict'
import test from 'node:test'

import { diffReports } from '../plugin/scripts/corpus-probe.mjs'

const report = advice => ({ look: 'ok', corpora: ['docs/adr'], adrLint: [{ file: 'docs/adr/ADR-001-x.md', verdict: 'PASS', advice }] })
const CYCLES = 'advice: cross-record dependency cycles were NOT checked: this corpus could not be listed from git'
const ORDINARY = 'advice: ADR-001-x.md: no **Spec:** header'

test('a could-not-look advice line that came or went is marked as about the run', () => {
  const added = diffReports(report([]), report([CYCLES])).filter(line => line.includes('NOT checked'))
  assert.equal(added.length, 1, added.join('\n'))
  assert.match(added[0], /^adrLint docs\/adr\/ADR-001-x\.md advice: \+ /)
  assert.match(added[0], /— could-not-look: about this run, not the corpus; re-run before reading it as a change$/)
  const removed = diffReports(report([CYCLES]), report([])).filter(line => line.includes('NOT checked'))
  assert.match(removed[0], /advice: - .*— could-not-look: about this run/)
})

test('an ordinary advice line that came or went is printed unmarked', () => {
  const added = diffReports(report([]), report([ORDINARY])).filter(line => line.includes('Spec'))
  assert.deepEqual(added, [`adrLint docs/adr/ADR-001-x.md advice: + ${ORDINARY}`])
})
