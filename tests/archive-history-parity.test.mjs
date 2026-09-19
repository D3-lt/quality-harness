// Two implementations of one question give one answer
// (docs/audits/2026-09-18-adr-060.md, B7).
//
// "Which archive catalog owned this record?" is asked twice: by the bash dispatcher
// at the per-edit boundary (`git_archive_catalog_for`), and in bulk by
// `archiveHistory` at the commit and turn-end boundary, which pre-computes the answer
// and hands it to the dispatcher. Both read the session's history "nearest base
// first" — and meant different things by it:
//
//   bash   the first base in which a candidate README IS A CATALOG
//   JS     the first base in which a candidate README EXISTS, catalog or not
//
// So when a README carried the Lifecycle marker at the session's first HEAD and no
// longer carries it at HEAD, bash finds the historical catalog and runs
// `adr-retire-check`, while JS answers "no catalog" — and since `archiveHistory`
// only engages in a batch, the SAME record got one gate per edit and a different
// gate at the boundary that is supposed to be authoritative. Nothing compared them.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { archiveHistory, resolveBashExecutable } from '../plugin/scripts/run-shell-hook.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dispatcher = join(repoRoot, 'plugin', 'scripts', 'facts-gate-dispatch.sh')
const IDENTITY = { GIT_AUTHOR_NAME: 'qh', GIT_AUTHOR_EMAIL: 'qh@example.invalid',
  GIT_COMMITTER_NAME: 'qh', GIT_COMMITTER_EMAIL: 'qh@example.invalid' }
const MARKER = '**Lifecycle:** Frozen historical ADR records'

test('the bulk lookup and the per-file lookup name the same archive catalog', () => {
  const repo = realpathSync.native(mkdtempSync(join(tmpdir(), 'qh-archive-parity-')))
  try {
    const git = (...args) => {
      const out = spawnSync('git', ['-C', repo, ...args], { encoding: 'utf8', timeout: 30_000, env: { ...process.env, ...IDENTITY } })
      assert.equal(out.status, 0, `git ${args.join(' ')}: ${out.stderr}`)
      return out.stdout.trim()
    }
    mkdirSync(join(repo, 'docs', 'arch'), { recursive: true })
    git('init', '-q')
    writeFileSync(join(repo, 'docs', 'arch', 'README.md'), `# ADR Archive\n\n${MARKER}\n`)
    writeFileSync(join(repo, 'docs', 'arch', 'ADR-001-old.md'), '# ADR-001: old\n\n**Status:** Accepted\n')
    writeFileSync(join(repo, 'docs', 'arch', 'ADR-002-other.md'), '# ADR-002: other\n\n**Status:** Accepted\n')
    git('add', '-A')
    git('commit', '-q', '-m', 'an archive')
    const older = git('rev-parse', 'HEAD')
    // The README stops being a catalog. It still EXISTS at the nearer base.
    writeFileSync(join(repo, 'docs', 'arch', 'README.md'), '# Just notes now\n')
    git('add', '-A')
    git('commit', '-q', '-m', 'the marker goes')
    const nearer = git('rev-parse', 'HEAD')

    const records = ['ADR-001-old.md', 'ADR-002-other.md'].map(name => join(repo, 'docs', 'arch', name))
    const bases = `${nearer} ${older}`
    const previous = process.env.QUALITY_HARNESS_HISTORY_BASES
    process.env.QUALITY_HARNESS_HISTORY_BASES = bases
    let bulk
    try { bulk = archiveHistory(records, Date.now() + 30_000) } finally {
      if (previous === undefined) delete process.env.QUALITY_HARNESS_HISTORY_BASES
      else process.env.QUALITY_HARNESS_HISTORY_BASES = previous
    }
    assert.equal(bulk.size, 2, 'the bulk lookup answered for both records — a batch of two is what engages it')

    // What the PER-FILE lookup concludes, observed from outside: handed no
    // pre-computed answer, the dispatcher finds a catalog and runs the retire check.
    const bash = resolveBashExecutable()
    assert.ok(bash, 'bash is needed to run the dispatcher')
    const perFile = spawnSync(bash, [dispatcher, records[0]], { encoding: 'utf8', timeout: 60_000,
      env: { ...process.env, ...IDENTITY, QUALITY_HARNESS_HISTORY_BASES: bases } })
    const said = `${perFile.stdout}${perFile.stderr}`
    assert.match(said, /adr-retire-check/, `the control: the per-file lookup found the historical catalog — ${said.slice(0, 300)}`)

    const catalog = join(repo, 'docs', 'arch', 'README.md')
    for (const record of records) {
      assert.equal(bulk.get(record), catalog,
        `the bulk lookup must name the same catalog for ${record.slice(repo.length + 1)}, or the two boundaries run different gates`)
    }
  } finally { rmSync(repo, { recursive: true, force: true }) }
})
