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
  // The Codex review of 7df3a7e7: a `..` segment climbs out of a known prefix, so that path is redacted whole, in either
  // separator, from the shorthand and from an absolute spelling alike; one that stays inside keeps its tail.
  assert.equal(scrub('~/AppData/Local/Temp/../../../Projects/private.md'), '~<path>')
  assert.equal(scrub('~\\AppData\\Local\\Temp\\..\\..\\..\\Projects\\private.md'), '~<path>')
  assert.equal(scrub('/home/SOMEON~1/AppData/Local/Temp/../../x/private.md'), '<path>')
  assert.equal(scrub('/work/repo/../sibling/x.md'), '<path>')
  assert.equal(scrub('/work/repo/docs/..x/y.md'), './docs/..x/y.md')
  // The verification review of 82289dc7: in the single-backslash spelling the patterns below know no root, so a climbing path
  // is redacted where its prefix is found, for every known prefix.
  assert.equal(scrub('\\home\\SOMEON~1\\AppData\\Local\\Temp\\..\\..\\..\\Projects\\private.md'), '<path>')
  assert.equal(scrub('\\home\\someone\\..\\other\\x.md'), '<path>')
  assert.equal(scrub('\\work\\repo\\..\\sibling\\x.md'), '<path>')
})
