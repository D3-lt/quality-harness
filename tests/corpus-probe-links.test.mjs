// A Windows chaos round of v3.8.73 (2026-11-10): a record's tasks directory that was an NTFS junction to a directory outside the
// tree made corpus-report count 0 tasks while work-next and adr-lint read 3, and the probe named it nowhere: corpus-report puts
// such a link in `unreadableDirs`, and the probe's corpusReport entry dropped that field. A junction is a symbolic link to Node,
// so a directory symlink is the same shape on every platform (`junction` is the type Windows takes without privilege).
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { probe } from '../plugin/scripts/corpus-probe.mjs'
import { remove } from './helpers/remove.mjs'

test('probe: a tasks directory corpus-report does not follow is named in its corpusReport entry', t => {
  const top = realpathSync.native(mkdtempSync(path.join(os.tmpdir(), 'qh-probe-links-')))
  t.after(() => remove(top))
  const repo = path.join(top, 'repo'), outside = path.join(top, 'outside-tasks')
  const adr = path.join(repo, 'docs', 'adr')
  mkdirSync(path.join(adr, 'ADR-001-linked'), { recursive: true })
  mkdirSync(outside)
  writeFileSync(path.join(adr, 'ADR-001-linked.md'), '# ADR-001: Linked\n\n**Status:** Accepted\n\n## Decision\n\nx\n')
  writeFileSync(path.join(outside, 'T1-a.md'), '# Task\n\n## Verification Log\n- 2026-09-04 · abc1234 · exit 1 · `x` · acceptance-sha256:aa\n')
  symlinkSync(outside, path.join(adr, 'ADR-001-linked', 'tasks'), process.platform === 'win32' ? 'junction' : 'dir')
  for (const args of [['init', '-q'], ['add', '-A'], ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'x']]) {
    assert.equal(spawnSync('git', args, { cwd: repo, encoding: 'utf8', timeout: 30_000, windowsHide: true }).status, 0, args.join(' '))
  }
  const report = probe(repo)
  const entry = report.corpusReport.find(e => e.root === 'docs/adr')
  assert.ok(entry, JSON.stringify(report.corpusReport))
  assert.deepEqual(entry.unreadableDirs, ['ADR-001-linked/tasks'], JSON.stringify(entry))
  // DIRTY twin's clean half: a corpus whose tasks are a plain directory names none.
  const plainRepo = path.join(top, 'plain')
  mkdirSync(path.join(plainRepo, 'docs', 'adr', 'ADR-001-plain', 'tasks'), { recursive: true })
  writeFileSync(path.join(plainRepo, 'docs', 'adr', 'ADR-001-plain.md'), '# ADR-001: Plain\n\n**Status:** Accepted\n\n## Decision\n\nx\n')
  writeFileSync(path.join(plainRepo, 'docs', 'adr', 'ADR-001-plain', 'tasks', 'T1-a.md'), '# Task\n')
  assert.equal(spawnSync('git', ['init', '-q'], { cwd: plainRepo, timeout: 30_000, windowsHide: true }).status, 0)
  const plain = probe(plainRepo).corpusReport.find(e => e.root === 'docs/adr')
  assert.deepEqual(plain?.unreadableDirs, [], JSON.stringify(plain))
})
