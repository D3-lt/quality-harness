// ADR-089 T5: `adr-retire-check --adopt` printed both roots resolved, so a scratch corpus's absolute
// path reached its verdict line, and the two sentences that offer the mode said it "adopts it" while
// it only reports what adopting needs and writes nothing (adoption_report).
import assert from 'node:assert/strict'
import test from 'node:test'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { sessionOrientation, spawnGate } from '../plugin/scripts/lifecycle.mjs'

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const retireCheck = path.join(repoRoot, 'plugin', 'bin', 'adr-retire-check')
const workNext = path.join(repoRoot, 'plugin', 'scripts', 'work-next.mjs')

// A corpus beside an archive-named directory with no Lifecycle marker: what both remedies are about.
function unmarkedArchive(prefix) {
  const root = realpathSync.native(mkdtempSync(path.join(os.tmpdir(), prefix)))
  const write = (relative, text) => {
    mkdirSync(path.join(root, ...relative.split('/').slice(0, -1)), { recursive: true })
    writeFileSync(path.join(root, ...relative.split('/')), text)
  }
  const accepted = n => `# ADR-${n}: x\n\n**Status:** Accepted\n\n## Context\n\nx\n\n## Decision\n\ny\n`
  write('docs/adr/ADR-002-live.md', accepted('002'))
  write('docs/adr/ADR-002-live/tasks/T1-live.md', '# Task ADR-002-T1: live\n')
  write('docs/adr-archive/README.md', '# Old decisions\n\nKept beside the live corpus.\n')
  write('docs/adr-archive/ADR-001-old.md', accepted('001'))
  write('docs/adr-archive/ADR-001-old/tasks/T1-old.md', '# Task ADR-001-T1: old\n')
  const init = spawnSync('git', ['init', '-q', '-b', 'main'], { cwd: root, encoding: 'utf8', timeout: 15_000, windowsHide: true })
  assert.equal(init.status ?? 0, 0, init.stderr)
  return root
}

test('adopt prints no absolute path', () => {
  const root = unmarkedArchive('qh-adopt-path-')
  const elsewhere = realpathSync.native(mkdtempSync(path.join(os.tmpdir(), 'qh-adopt-cwd-')))
  try {
    const verdict = run => `${run.stdout ?? ''}${run.stderr ?? ''}`.split('\n').find(line => /^\[(?:PASS|MIGRATION-REQUIRED)\] /.test(line)) ?? ''
    const inside = spawnGate(retireCheck, ['--adopt', 'docs/adr', 'docs/adr-archive'], { cwd: root, encoding: 'utf8', timeout: 60_000 })
    assert.match(verdict(inside), /^\[(?:PASS|MIGRATION-REQUIRED)\] docs\/adr \+ docs\/adr-archive · /, `${inside.stdout}${inside.stderr}`)
    // Absolute roots outside the working directory: their last component, never the path.
    const outside = spawnGate(retireCheck, ['--adopt', path.join(root, 'docs', 'adr'), path.join(root, 'docs', 'adr-archive')],
      { cwd: elsewhere, encoding: 'utf8', timeout: 60_000 })
    assert.match(verdict(outside), /^\[(?:PASS|MIGRATION-REQUIRED)\] adr \+ adr-archive · /, `${outside.stdout}${outside.stderr}`)
    for (const out of [inside, outside].map(run => `${run.stdout}${run.stderr}`)) {
      assert.ok(!out.includes(root) && !out.includes(path.basename(root)), `no temporary directory in: ${out}`)
    }
    // CLEAN twin: the counts on the verdict line are the same whichever way the roots are named.
    const counts = line => line.slice(line.indexOf(' · '))
    assert.match(counts(verdict(inside)), /^ · 1 active · 1 archived · /)
    assert.equal(counts(verdict(outside)), counts(verdict(inside)))
  } finally {
    rmSync(root, { recursive: true, force: true })
    rmSync(elsewhere, { recursive: true, force: true })
  }
})

test('the adopt remedy says it reports and changes nothing', () => {
  const root = unmarkedArchive('qh-adopt-words-')
  try {
    const text = spawnSync(process.execPath, [workNext], { cwd: root, encoding: 'utf8', timeout: 60_000, windowsHide: true })
    const orientation = sessionOrientation(root)
    for (const [who, said] of [['work-next', `${text.stdout}${text.stderr}`], ['SessionStart', orientation]]) {
      assert.match(said, /`adr-retire-check --adopt <active> <archive>` reports what adopting it needs; it changes nothing/, `${who}: ${said}`)
      assert.doesNotMatch(said, /adopts it/, `${who}: ${said}`)
    }
  } finally { rmSync(root, { recursive: true, force: true }) }
})
