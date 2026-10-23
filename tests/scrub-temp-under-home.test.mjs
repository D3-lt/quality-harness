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

// Four review rounds each found one more input where the shorthand showed something v3.8.53 did not, and an open-ended
// enumeration by a reviewer ran out of time, so the property is measured: a marker placed only outside the temp root (run on
// from the bare prefix, a sibling, or after a `..` segment) is never shown more often than a scrubber with no shorthand, whose
// known prefixes are v3.8.53's, shows it. Seeded, so a failure reproduces; 300000 draws found none on 2026-10-23.
test('nothing outside the temp root is shown that a scrubber without the shorthand hides', () => {
  const options = { root: '/work/repo', pluginRoot: '/opt/plugin', home: '/home/someone', tmp: '/home/SOMEON~1/AppData/Local/Temp' }
  const scrub = scrubber({ ...options, tmpResolved: '/home/someone/AppData/Local/Temp' })
  const before = scrubber({ ...options, tmp: '/elsewhere', tmpResolved: '/elsewhere' })
  let seed = 0x9e3779b9
  const draw = n => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) % n
  }
  const pieces = ['/', '\\', ' ', '\t', "'", '"', '`', ')', '(', 'x', '..', '.', '-', ':', '~', '<', '>', 'y z', '\n']
  const shown = text => text.split('SECRET').length - 1
  let differing = 0
  for (let i = 0; i < 20000; i++) {
    const parts = []
    for (let j = draw(7); j > 0; j--) parts.push(pieces[draw(pieces.length)])
    let prefix = ['~/AppData/Local/Temp', '~\\AppData\\Local\\Temp'][draw(2)]
    if (draw(2) === 0) parts.unshift(['SECRET', ' SECRET', '\tSECRET', '-SECRET', '.SECRET'][draw(5)])
    else {
      prefix += ['/', '\\'][draw(2)]
      parts.splice(draw(parts.length + 1), 0, ['/../SECRET', '\\..\\SECRET', '/x/../../SECRET', '/..', '\\..'][draw(5)])
    }
    const input = ['', ' ', '"', "'", '`', 'at ', '(', ':'][draw(8)] + prefix + parts.join('') + ['', ' ', '"', "'", '`', ' then', ')'][draw(7)]
    if (scrub(input) !== before(input)) differing++
    assert.ok(shown(scrub(input)) <= shown(before(input)), JSON.stringify({ input, now: scrub(input), before: before(input) }))
  }
  // DIRTY twin: the measure sees a marker the shorthand shows, so a clean run is not a blind one; and the draws reach inputs
  // the shorthand does change.
  assert.ok(shown(scrub('~/AppData/Local/Temp/SECRET')) > shown(before('~/AppData/Local/Temp/SECRET')))
  assert.ok(differing > 1000, `only ${differing} draws reached the shorthand`)
})
