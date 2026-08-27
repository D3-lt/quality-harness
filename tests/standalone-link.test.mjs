import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  chmodSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  FORWARDER_MARK, RESOLVER, archive, backupRoot, cacheDirectory, forwarderCmd, forwarderScript,
  linkPlan, replaceable, sameLineage, write,
} from '../scripts/standalone-link.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function home(files = {}) {
  const directory = mkdtempSync(path.join(tmpdir(), 'link-'))
  for (const [relative, contents] of Object.entries(files)) {
    const full = path.join(directory, relative)
    mkdirSync(path.dirname(full), { recursive: true })
    writeFileSync(full, contents)
  }
  return directory
}

/** Run the resolver exactly as a forwarder does, against a fabricated cache. */
function resolve(versions, directory) {
  const cache = cacheDirectory(directory)
  for (const [name, hasBin] of Object.entries(versions)) {
    mkdirSync(path.join(cache, name, hasBin ? 'bin' : 'docs'), { recursive: true })
  }
  return spawnSync(process.execPath, ['-e', RESOLVER, cache], { encoding: 'utf8' }).stdout
}

test('the resolver orders versions numerically, not lexically', () => {
  // The cache on the machine this was written for holds 2.0.4, 2.0.10, 2.1.7 and
  // 2.15.0 together. Lexical order puts 2.0.4 above 2.0.10 and 2.9.0 above
  // 2.15.0, so a forwarder sorting as strings would silently run last month's
  // gate and produce a verdict nobody could explain.
  const directory = home()
  try {
    assert.equal(path.basename(resolve({ '2.0.4': true, '2.0.10': true }, directory)), '2.0.10')
    assert.equal(path.basename(resolve({ '2.9.0': true, '2.15.0': true }, directory)), '2.15.0')
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('the resolver ignores a cached version with no gates in it', () => {
  const directory = home()
  try {
    assert.equal(path.basename(resolve({ '2.1.0': true, '2.99.0': false }, directory)), '2.1.0')
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('the resolver says nothing rather than guessing when the cache is absent', () => {
  const directory = home()
  try {
    assert.equal(spawnSync(process.execPath,
      ['-e', RESOLVER, path.join(directory, 'nowhere')], { encoding: 'utf8' }).stdout, '')
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('a forwarder pins no version, which is the whole point of it', () => {
  // A copy goes stale because it carries a version. If one ever appears in this
  // text, the forwarder has become a copy with extra steps.
  for (const text of [forwarderScript('adr-lint'), forwarderCmd('adr-lint')]) {
    assert.doesNotMatch(text, /\d+\.\d+\.\d+/, text)
    assert.match(text, /adr-lint/)
    assert.ok(text.includes(FORWARDER_MARK))
  }
})

test('a forwarder reports a missing plugin and still exits 0', () => {
  // The harness failing to run is never a finding about the user's file. A
  // non-zero here would make a project's own gate fail because a tool is
  // absent, which is the block this harness spent a release removing.
  const directory = home()
  const script = path.join(directory, 'adr-lint')
  writeFileSync(script, forwarderScript('adr-lint', path.join(directory, 'empty')))
  chmodSync(script, 0o755)
  try {
    const run = spawnSync(script, [], { encoding: 'utf8', env: { ...process.env, HOME: directory } })
    assert.equal(run.status, 0, run.stderr)
    assert.match(run.stderr, /nothing is blocked/)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('the Windows forwarder uses CRLF and resolves the bare name through PATHEXT', () => {
  const text = forwarderCmd('adr-lint')
  assert.match(text, /\r\n/, 'cmd needs CRLF; an LF shim fails in confusing ways')
  assert.match(text, /where \/q py/, 'a Windows Python is python.exe, not python3')
  assert.doesNotMatch(text, /\$HOME/, 'cmd does not expand $HOME')
  assert.match(text, /%USERPROFILE%/)
})

test('a real forwarder resolves and runs the gate it names', () => {
  const directory = home()
  const script = path.join(directory, 'adr-lint')
  writeFileSync(script, forwarderScript('adr-lint', directory))
  chmodSync(script, 0o755)
  // A cache holding this very checkout, so the forwarder runs a real gate.
  const cache = path.join(cacheDirectory(directory), '9.9.9')
  mkdirSync(path.dirname(cache), { recursive: true })
  symlinkSync(root, cache, 'dir')
  try {
    const run = spawnSync(script, ['ADR-001-selftest.md', 'tasks'], {
      cwd: path.join(root, 'tests', 'fixtures', 'ok'),
      encoding: 'utf8',
      env: { ...process.env, HOME: directory },
    })
    assert.equal(run.status, 0, `${run.stdout}${run.stderr}`)
    assert.match(run.stdout, /\[PASS\]/)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('a gate is recognised by its subject, and by its opening line when it has no subject', () => {
  // Both shapes ship in this set. Checking only the first one refused
  // adr-retire-check, a genuine plugin copy, and left it drifted.
  const directory = home({
    'named': '#!/usr/bin/env python3\n"""adr-lint — a description that has since changed.\n',
    // Verbatim: a gate with no subject is matched on its whole opening line, so
    // a paraphrase is a different gate as far as this check is concerned.
    'unnamed': '#!/usr/bin/env python3\n"""Verify an opt-in ADR archive catalog and its active discovery/obligation receipts.\n',
    'reworded': '#!/usr/bin/env python3\n"""Verify an opt-in ADR archive catalog.\n',
    'mine': '#!/usr/bin/env python3\n"""my own tool that happens to share a name.\n',
  })
  try {
    assert.ok(sameLineage(path.join(directory, 'named'), path.join(root, 'bin', 'adr-lint'), 'gate'))
    assert.ok(sameLineage(path.join(directory, 'unnamed'),
      path.join(root, 'bin', 'adr-retire-check'), 'gate'))
    assert.ok(!sameLineage(path.join(directory, 'mine'), path.join(root, 'bin', 'adr-lint'), 'gate'))
    // Deliberately conservative: with no subject to anchor on there is nothing
    // left that survives a reworded description, so this reports and skips
    // rather than overwriting a file it cannot identify.
    assert.ok(!sameLineage(path.join(directory, 'reworded'),
      path.join(root, 'bin', 'adr-retire-check'), 'gate'))
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('a file this plugin never installed is left alone', () => {
  // The home config directory holds the user's own tools beside ours. Overwriting
  // one because it shares a name would destroy work nobody asked us to touch.
  const directory = home({
    '.claude/bin/adr-lint': '#!/usr/bin/env python3\n"""my own tool, same name.\n',
  })
  try {
    const entry = linkPlan(root, directory).find(e => e.to.endsWith(`bin${path.sep}adr-lint`))
    assert.equal(entry.state, 'skipped')
    assert.match(entry.why, /may be your own/)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('a forwarder this tool wrote may be rewritten by it', () => {
  const directory = home({ '.claude/bin/adr-lint': `#!/bin/sh\n# ${FORWARDER_MARK}\necho old\n` })
  try {
    const entry = linkPlan(root, directory).find(e => e.to.endsWith(`bin${path.sep}adr-lint`))
    assert.equal(entry.state, 'replaced')
    assert.equal(replaceable(entry, directory).why, 'our forwarder')
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('a symlink pointing outside this plugin is left alone', () => {
  const directory = home({ 'elsewhere/adr-lint': 'not ours\n' })
  mkdirSync(path.join(directory, '.claude', 'bin'), { recursive: true })
  symlinkSync(path.join(directory, 'elsewhere', 'adr-lint'),
    path.join(directory, '.claude', 'bin', 'adr-lint'))
  try {
    const entry = linkPlan(root, directory).find(e => e.to.endsWith(`bin${path.sep}adr-lint`))
    assert.equal(entry.state, 'skipped')
    assert.match(entry.why, /outside this plugin/)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('a skill this plugin does not ship is unreachable, not merely unlisted', () => {
  // The guard that matters. autoresearch, codebase-memory and the aiagentmemory
  // binaries live in the same directories as ours; the plan is built from the
  // PLUGIN's contents, so no path to them can be constructed at all.
  const directory = home({
    '.claude/skills/autoresearch/SKILL.md': '---\nname: autoresearch\n---\n',
    '.claude/bin/aiagentmemory': '#!/bin/sh\n',
  })
  try {
    const targets = linkPlan(root, directory).map(entry => entry.to)
    assert.ok(!targets.some(target => target.includes('autoresearch')))
    assert.ok(!targets.some(target => target.includes('aiagentmemory')))
    assert.ok(targets.some(target => target.endsWith(`skills${path.sep}adr-write`)))
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('on Windows a template falls back to a copy rather than failing late', () => {
  // A file symlink needs a privilege an ordinary account does not have, and a
  // junction covers directories only. Saying so up front beats a run that
  // reports thirty successes and then throws on the templates.
  const directory = home()
  try {
    const entry = linkPlan(root, directory, 'win32')
      .find(e => e.to.endsWith(`templates${path.sep}adr-template.md`))
    assert.equal(entry.state, 'copy-only')
    assert.match(entry.why, /Windows/)
    // A skill is a directory, so it still links there.
    const skill = linkPlan(root, directory, 'win32')
      .find(e => e.to.endsWith(`skills${path.sep}adr-write`))
    assert.equal(skill.directory, true)
    assert.notEqual(skill.state, 'copy-only')
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('every gate the plugin ships gets both a forwarder and a Windows shim', () => {
  const directory = home()
  try {
    const plan = linkPlan(root, directory)
    const gates = plan.filter(e => e.lineage === 'gate').map(e => path.basename(e.to)).sort()
    const shims = plan.filter(e => e.lineage === 'shim').map(e => path.basename(e.to, '.cmd')).sort()
    assert.deepEqual(gates, shims, 'a gate with no shim is unreachable from Windows')
    assert.ok(gates.includes('adr-verify'))
    // Names matching is not enough: a .cmd holding a `#!/bin/sh` body has the
    // right name and is inert on Windows, which is the whole failure the shim
    // exists to prevent. Found 2026-08-27 by a mutation that swapped the two
    // generators and stayed green.
    for (const shim of plan.filter(e => e.lineage === 'shim')) {
      assert.match(shim.contents, /^@echo off\r\n/, path.basename(shim.to))
      assert.doesNotMatch(shim.contents, /^#!/, path.basename(shim.to))
    }
    for (const gate of plan.filter(e => e.lineage === 'gate')) {
      assert.match(gate.contents, /^#!\/bin\/sh\n/, path.basename(gate.to))
    }
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('the original is kept before it is replaced', () => {
  // Asked for on 2026-08-27 — "i need to backup my original ones first then" —
  // and the right answer is that nobody should have to. A backup you must
  // remember is the same failure as a sync you must remember.
  const directory = home({ '.claude/bin/adr-lint': '#!/usr/bin/env python3\n"""adr-lint — old.\n' })
  try {
    const entry = linkPlan(root, directory).find(e => e.to.endsWith(`bin${path.sep}adr-lint`))
    assert.equal(entry.state, 'replaced')
    const kept = write(entry, 'stamp', directory)
    assert.equal(readFileSync(kept, 'utf8'), '#!/usr/bin/env python3\n"""adr-lint — old.\n')
    assert.ok(kept.startsWith(backupRoot('stamp', directory)))
    // And the new one is in place, so the archive is not a substitute for the work.
    assert.ok(readFileSync(entry.to, 'utf8').includes(FORWARDER_MARK))
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('a skill directory is kept whole, not just its SKILL.md', () => {
  const directory = home({
    '.claude/skills/adr-write/SKILL.md': '---\nname: adr-write\n---\nold\n',
    '.claude/skills/adr-write/references/notes.md': 'a reference nothing else records\n',
  })
  try {
    const entry = linkPlan(root, directory).find(e => e.to.endsWith(`skills${path.sep}adr-write`))
    const kept = write(entry, 'stamp', directory)
    assert.equal(readFileSync(path.join(kept, 'references', 'notes.md'), 'utf8'),
      'a reference nothing else records\n')
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('a symlink is archived as a symlink, not as what it points at', () => {
  // The home skills directory holds a tracked symlink out to another repository.
  // Copying through it would pull that whole repository into a backup directory
  // and call it an original.
  const directory = home({ 'elsewhere/SKILL.md': '---\nname: adr-write\n---\n' })
  mkdirSync(path.join(directory, '.claude', 'skills'), { recursive: true })
  symlinkSync(path.join(directory, 'elsewhere'),
    path.join(directory, '.claude', 'skills', 'adr-write'), 'dir')
  try {
    const kept = archive({
      to: path.join(directory, '.claude', 'skills', 'adr-write'),
      relative: path.join('skills', 'adr-write'),
    }, 'stamp', directory)
    assert.ok(lstatSync(kept).isSymbolicLink(), 'the backup must not dereference it')
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('nothing to keep is not an error', () => {
  const directory = home()
  try {
    assert.equal(archive({
      to: path.join(directory, 'absent'), relative: 'absent',
    }, 'stamp', directory), null)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
