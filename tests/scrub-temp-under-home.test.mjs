// The Windows check of cec6203c: a temp root under the home directory (a Windows %TEMP%) reached the probe's scrubber as `~/…`,
// since the gates write a path under the home that way (BACKLOG §409), and HOME_RELATIVE made all of it `~<path>`, file name
// included. That spelling is the temp root's, so it scrubs to `<tmp>/…` as the absolute spelling does.
import assert from 'node:assert/strict'
import test from 'node:test'
import { scrubber } from '../plugin/scripts/corpus-text.mjs'

test('a temp root under the home, written from the home, is the temp root, and nothing else under the home is', () => {
  const home = '/home/someone'
  const scrub = scrubber({ root: '/work/repo', pluginRoot: '/opt/plugin', home, tmp: '/home/SOMEON~1/AppData/Local/Temp',
    tmpResolved: '/home/someone/AppData/Local/Temp' })
  const said = '[adr-lint] could not run: ~/AppData/Local/Temp/qh-probe-exit-1/docs/adr/ADR-001-a/tasks/T1-locked.md — not a regular file'
  assert.equal(scrub(said), '[adr-lint] could not run: <tmp>/qh-probe-exit-1/docs/adr/ADR-001-a/tasks/T1-locked.md — not a regular file')
  // DIRTY twins: another path under the home is still redacted whole, and a temp root outside the home adds no spelling.
  assert.equal(scrub('see ~/Projects/private/x.md'), 'see ~<path>')
  assert.equal(scrubber({ home, tmp: '/tmp', tmpResolved: '/private/tmp' })('~/AppData/Local/Temp/x.md'), '~<path>')
  // The Codex review of 7df3a7e7 and its two verification rounds: a path whose rest climbs out of the temp root with `..` is
  // read exactly as v3.8.53 read it, which a scrubber with no shorthand (a temp root outside the home) shows, in either
  // separator and inside quotes holding another quote; one that stays inside keeps its tail.
  const before = scrubber({ root: '/work/repo', pluginRoot: '/opt/plugin', home, tmp: '/elsewhere', tmpResolved: '/elsewhere' })
  for (const climbing of ['~/AppData/Local/Temp/../../../Projects/private.md', '~\\AppData\\Local\\Temp\\..\\..\\Projects\\x.md',
    '"~/AppData/Local/Temp/../Example\'s private/x.md"', '`~/AppData/Local/Temp/..`', 'at ~/AppData/Local/Temp/.. then',
    // The verification review of 80e3060a: a sibling of the temp root whose name starts with it, past a space.
    '~/AppData/Local/Temp private/secret.md', '~\\AppData\\Local\\Temp private\\secret.md', '"~/AppData/Local/Temp private/x.md"',
    '`~/AppData/Local/Temp private/x.md`', '~/AppData/Local/TempX/secret.md']) {
    assert.equal(scrub(climbing), before(climbing), climbing)
    assert.doesNotMatch(scrub(climbing), /<tmp>/, climbing)
  }
  assert.equal(scrub('~/AppData/Local/Temp/qh-1/..x/y.md'), '<tmp>/qh-1/..x/y.md')
})
