// A corpus shaped the way CONSUMER corpora are, not the way this repository writes
// its own. Every shape here was reported by a peer session running these gates
// against a real corpus on 2026-08-30, and each produced a verdict the gate had
// not earned:
//
//   - a task whose code and tests live in a sibling repository (`../` paths)
//   - the task template's own `- [ ] (none at authoring)` placeholder
//   - a `partial` task, and a human-observed task waiting on someone else's access
//   - a Cross-references pointer into another repository
//
// This repository's own 400-test suite found NONE of them, because it only ever
// sees one corpus shape: its own. That is the gap this file exists to close --
// peers found six defects in an hour, and goodwill does not scale to every release.
//
// The assertions here are deliberately about VOCABULARY rather than exit codes
// alone: the class of defect is a gate reporting "I could not look" as "the thing
// is absent", so what matters is which words it uses.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const testDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(testDir, '..')
const bin = join(repoRoot, 'plugin', 'bin')
const corpus = join(testDir, 'fixtures', 'foreign')
const adrDir = join(corpus, 'adr')

// Spawned through the interpreter: the gates are `#!/usr/bin/env python3` scripts
// and Windows cannot exec them (CLAUDE.md §7).
const gate = (name, args) =>
  spawnSync('python3', [join(bin, name), ...args], { cwd: corpus, encoding: 'utf8' })
const said = r => `${r.stdout ?? ''}${r.stderr ?? ''}`

test('a consumer-shaped corpus draws no verdict the gates did not earn', () => {
  const lint = gate('adr-lint', [join(adrDir, 'ADR-001-cross-repo.md'),
    join(adrDir, 'ADR-001-cross-repo', 'tasks')])
  const out = said(lint)

  // A path leaving the repository is "could not look", never "nothing can run this".
  assert.doesNotMatch(out, /describes a test nothing can run/,
    `a sibling-repo test path must not be called absent:\n${out}`)
  assert.match(out, /did NOT run|unproven/i,
    `and the inability must be stated:\n${out}`)

  // Reported ONCE per path. Two Tests rows name one file.
  const outside = out.split('\n').filter(l => l.includes('GuardTest.php'))
  assert.equal(outside.length, 1, `one file is one finding, not one per row:\n${outside.join('\n')}`)

  // `partial` is a status the reader acts on.
  assert.doesNotMatch(out, /does not act on/,
    `partial and the other statuses here are all in the vocabulary:\n${out}`)

  // A Blocked-on naming an explicit observer is not nagged at.
  assert.doesNotMatch(out, /could not find a way to check/,
    `an explicit "checked by:" marker must satisfy the advisory:\n${out}`)

  // The fixture is deliberately incomplete in ordinary ways (it fabricates no
  // digests and carries no killed mutant), so the gate DOES block on it -- and
  // should. What matters is WHY. No blocking finding may be about the cross-repo
  // shape: a consumer whose code legitimately lives in two repositories must be
  // able to reach green by doing ordinary work, never by moving the code or lying
  // about where it lives. A permanently-red gate is one people stop running.
  const blocking = out.split('\n').filter(l => l.trim() && !l.includes('advice:') && !l.startsWith('['))
  const aboutCrossRepo = blocking.filter(l => /sibling_repo|\.\.\//.test(l))
  assert.deepEqual(aboutCrossRepo, [],
    `no BLOCKING finding may be about living in two repositories:\n${aboutCrossRepo.join('\n')}`)
})

test('adr-debt counts a consumer corpus honestly', () => {
  const debt = gate('adr-debt', [adrDir])
  const out = said(debt)
  const summary = out.split('\n').find(l => l.startsWith('[DEBT]')) ?? ''

  // The template's own explicit "none" is not an open item.
  assert.match(summary, /0 open follow-ups/, `an explicit "(none at authoring)" is not debt:\n${out}`)
  // The waiting task is waiting, not debt and not rot.
  assert.match(summary, /1 waiting/, `the Blocked-on task must be counted as waiting:\n${out}`)
  assert.doesNotMatch(out, /\brot\b|overdue/i, `and asked about, not scolded:\n${out}`)
  // A Cross-references pointer into another repository is not a broken pointer.
  assert.match(summary, /0 broken pointers/, `a cross-repo reference is not broken:\n${out}`)
})

test('work-next does not name a finished consumer corpus as unfinished', async () => {
  const { observe } = await import('../plugin/scripts/work-next.mjs')
  const state = observe(corpus)
  const ready = state.ready.map(f => f.split('/').pop())
  // T1 carries exit-0 evidence and T3 is human-observed and signed off nowhere --
  // T3 IS genuinely still waiting, so it may be ready; T1 must not be.
  assert.ok(!ready.includes('T1-code-lives-elsewhere.md'),
    `a task with exit-0 evidence is finished:\n${ready.join('\n')}`)
})
