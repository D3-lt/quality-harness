// The paths a session is told it changed are paths that exist
// (docs/audits/2026-09-18-adr-060.md, C2).
//
// `git status --porcelain` QUOTES a name it considers unusual and escapes its
// bytes as octal: `na\303\257ve probe.md`. `statusPaths` stripped the quotes and
// kept the escapes, so the user was shown a path that is not on disk, the row in
// `sessions.jsonl` carried it to the next session, and rule A tried to gate it —
// `UNPROVEN: could not classify …/na\303\257ve probe.md` — at every boundary for
// ever, because a file that does not exist never gets an identity.
//
// Reproduced in the field on 2026-09-19 by pointing the hooks at a scratch clone
// of this repository. `core.quotePath=false` would have fixed the octal half and
// left an embedded quote, backslash or newline wrong; `-z` has no quoting at all.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { observedFacts } from '../plugin/scripts/lifecycle.mjs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const lifecycleScript = join(resolve(dirname(fileURLToPath(import.meta.url)), '..'), 'plugin', 'scripts', 'lifecycle.mjs')

const IDENTITY = { GIT_AUTHOR_NAME: 'qh', GIT_AUTHOR_EMAIL: 'qh@example.invalid',
  GIT_COMMITTER_NAME: 'qh', GIT_COMMITTER_EMAIL: 'qh@example.invalid' }

test('every changed path a session is told about is a path that exists', () => {
  const repo = realpathSync(mkdtempSync(join(tmpdir(), 'qh-status-paths-')))
  try {
    const git = (...args) => {
      const run = spawnSync('git', ['-C', repo, ...args], { encoding: 'utf8', timeout: 30_000, env: { ...process.env, ...IDENTITY } })
      assert.equal(run.status, 0, `git ${args.join(' ')}: ${run.stderr}`)
      return run.stdout
    }
    git('init', '-q')
    writeFileSync(join(repo, 'plain.md'), 'a\n')
    writeFileSync(join(repo, 'to-rename.md'), 'a long enough body that git sees the rename as a rename\n')
    git('add', '-A')
    git('commit', '-q', '-m', 'base')

    // One of each thing porcelain v1 quotes or decorates. A quote and a backslash
    // are legal in a POSIX name and not in a Windows one, so they are POSIX-only.
    const awkward = ['naïve probe.md', 'with space.md', 'tab\there.md']
    if (process.platform !== 'win32') awkward.push('has"quote.md', 'back\\slash.md')
    for (const name of awkward) writeFileSync(join(repo, name), 'x\n')
    writeFileSync(join(repo, 'plain.md'), 'changed\n')
    renameSync(join(repo, 'to-rename.md'), join(repo, 'renamed é.md'))
    git('add', '-A', '--', 'to-rename.md', 'renamed é.md')

    // The control: porcelain v1 really does mangle these, or this test is about nothing.
    assert.match(git('status', '--porcelain', '-uall'), /\\303\\257/, 'git quotes and octal-escapes the non-ASCII name')

    const log = Object.assign([{ event: 'session.started', observation: { ok: true, tree: 'T0' } }], { complete: true })
    const facts = observedFacts(log, repo, { ok: true, tree: 'T1' })
    assert.equal(facts.observed, true, JSON.stringify(facts))
    const missing = facts.files.filter(file => !existsSync(file))
    assert.deepEqual(missing, [], `these were reported as changed and are not on disk:\n  ${missing.join('\n  ')}`)
    // And nothing was dropped to get there: every awkward name, the edit, and the
    // rename's NEW name — once, not the old name and not both.
    const names = facts.files.map(file => file.slice(repo.length + 1)).sort()
    assert.deepEqual(names, [...awkward, 'plain.md', 'renamed é.md'].sort())
  } finally { rmSync(repo, { recursive: true, force: true }) }
})

// The same names, through the real hooks: rule A enumerates its candidates with
// its OWN git calls (`diff --name-only`, `ls-tree`), so fixing `statusPaths`
// alone left the artifact gate chasing `…/na\303\257ve probe.md` — which is
// how the field run read: "UNPROVEN: could not classify" a file that is right there.
test('no hook names, or tries to gate, a path spelled in octal escapes', () => {
  const top = realpathSync(mkdtempSync(join(tmpdir(), 'qh-status-hooks-')))
  try {
    const repo = join(top, 'repo')
    const env = { ...process.env, ...IDENTITY, CLAUDE_PLUGIN_DATA: join(top, 'data'), TMPDIR: top, TMP: top, TEMP: top }
    const run = (command, args, options = {}) => {
      const out = spawnSync(command, args, { encoding: 'utf8', timeout: 120_000, env, ...options })
      assert.equal(out.status, 0, `${command} ${args.join(' ')}: ${out.stderr}`)
      return out
    }
    const git = (...args) => run('git', ['-C', repo, ...args])
    const hook = payload => run(process.execPath, [lifecycleScript], { cwd: top, input: JSON.stringify(payload) })
    run('mkdir', ['-p', repo])
    git('init', '-q')
    writeFileSync(join(repo, 'a.md'), 'a\n')
    writeFileSync(join(repo, '.quality-harness.json'), JSON.stringify({ check: 'true' }))
    git('add', '-A')
    git('commit', '-q', '-m', 'base')
    const session = `status-hooks-${process.pid}`
    hook({ hook_event_name: 'SessionStart', source: 'startup', session_id: session, cwd: repo })
    // Uncommitted AND committed, because rule A reads each through a different call.
    writeFileSync(join(repo, 'na\u00efve probe.md'), 'x\n')
    // A MALFORMED RECORD under an awkward name, committed: rule A must gate it, so
    // its failure text is proof the path ARRIVED at the gate intact. Without that,
    // a path mangled into something nonexistent is simply dropped, and "no octal
    // and no complaint" passes on a gate that was never reached (a GREEN mutant
    // said so, 2026-09-19).
    run('mkdir', ['-p', join(repo, 'docs', 'adr')])
    writeFileSync(join(repo, 'docs', 'adr', 'ADR-900-committéd.md'), '# ADR-900: a record with no sections\n')
    git('add', '--', 'docs/adr/ADR-900-committ\u00e9d.md')
    git('commit', '-q', '-m', 'a committed awkward name')
    const out = hook({ hook_event_name: 'Stop', session_id: session, cwd: repo })
    const said = `${out.stdout}${out.stderr}`
    // The control: the hook DID speak about this tree, so silence is not the pass.
    assert.match(said, /na\u00efve probe\.md/, `the uncommitted name is reported as it is spelled: ${said.slice(0, 600)}`)
    assert.doesNotMatch(said, /\\\\?30[0-9]/, `no octal escape reaches the user: ${said.slice(0, 600)}`)
    assert.doesNotMatch(said, /could not classify/, `and the gate is never sent after a path that is not there: ${said.slice(0, 600)}`)
    assert.match(said, /Artifact validation failed[\s\S]*ADR-900-committ\u00e9d\.md/, `the committed awkward name reached the gate and was judged: ${said.slice(0, 900)}`)
  } finally { rmSync(top, { recursive: true, force: true }) }
})
