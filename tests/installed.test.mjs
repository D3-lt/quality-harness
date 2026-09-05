// ADR-030 T2. Every other suite in this repository reads the CHECKOUT. This one
// reads the plugin as a user receives it: unpacked in the plugin cache, with only
// the files ADR-008 ships. It answers the question ADR-008 opened — is the thing
// we ship the thing we tested — and nothing else; behaviour stays with the
// checkout suites, because two sources of truth for one claim is the defect this
// corpus keeps deleting.
//
// It never writes to the installed copy. A test that repaired what it found would
// make a green run depend on having damaged something.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { runPython } from '../scripts/python-interpreter.mjs'

const testDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(testDir, '..')

/** The gate that resolves the install. Named once: T2 locates it this way or not at all. */
const LOCATOR = join(repoRoot, 'plugin', 'bin', 'qh-root')

// Named INDEPENDENTLY of what the install happens to hold. Deriving the
// expectation from the tree being checked passes against any tree at all, which
// is this repository's own signature defect (ADR-003, ADR-006) and is called out
// in tests/package.test.mjs for the same reason. Version-independent on purpose:
// every one of these has shipped since long before any install a developer has.
const FLOOR = ['.claude-plugin/plugin.json', 'bin', 'hooks', 'scripts', 'skills', 'templates', 'workflows']
const WITHHELD = ['tests', 'docs', '.github', '.claude-plugin/marketplace.json']

/**
 * Where the installed plugin is, asked of `qh-root` and nothing else.
 *
 * `run` is a parameter so both branches are reachable from any machine: a stub
 * drives UNRUN where an install exists, and drives FOUND where none does. It is
 * also what keeps this file's mutants hermetic — a mutant that needs a real
 * install comes back GREEN in CI, where there is none, and a GREEN is a finding
 * about the test rather than a pass.
 *
 * Version ordering is exactly what a naive `ls | tail -1` gets wrong: measured
 * 2026-09-04 on the authoring machine, it answers `2.9.0` where `qh-root`
 * answers `2.59.0`.
 */
function locate(run) {
  const result = run([LOCATOR])
  if (result.status !== 0) {
    return {
      status: 'UNRUN',
      reason: `no installed quality-harness could be resolved by ${LOCATOR}`
        + ` — this check has not run, which is not the same as having passed`
        + `${(result.stderr ?? '').trim() ? `: ${(result.stderr ?? '').trim()}` : ''}`,
    }
  }
  const root = (result.stdout ?? '').trim()
  return { status: 'FOUND', root, version: root.split(/[\\/]/).filter(Boolean).pop() }
}

/**
 * What the installed tree is missing, is leaking, and is merely behind on.
 *
 * Pure: `present`, `checkoutShips` and `version` are given, never read here, so
 * every case is reachable from a fixture. A finding is about THIS install; a
 * note is release lag, which is `qh-doctor`'s and `sync-standalone`'s question
 * and would be a second answer to it here (ADR-005, ADR-030 Primitives Audit).
 */
function surfaceReport({ version, present, checkoutShips }) {
  const held = new Set(present)
  const findings = [
    ...FLOOR.filter(entry => !held.has(entry))
      .map(entry => `installed ${version} is missing ${entry}, which every release ships`),
    ...WITHHELD.filter(entry => held.has(entry))
      .map(entry => `installed ${version} carries ${entry}, which ADR-008 withholds from the plugin`),
  ]
  const notes = checkoutShips.filter(entry => !held.has(entry) && !WITHHELD.includes(entry))
    .map(entry => `the checkout ships ${entry} and installed ${version} does not`
      + ` — release lag, not a defect of the install`)
  return { findings, notes }
}

/**
 * What is wrong with the agent definitions under `root`, if any are there.
 *
 * `root` is a PARAMETER for the reason `run` is: on this machine the installed
 * copy predates `agents/`, so driven only from the real install this branch never
 * executes at all, and a green run would include an assertion block that was never
 * reached. That is CLAUDE.md §4's vacuity class one level up — not a vacuous
 * assertion, an unreached one — and a fixture is what makes it reachable anywhere.
 *
 * An install with no `agents/` at all returns nothing: that is release lag, and
 * `surfaceReport` already reports it as a note.
 */
function agentDefinitionFindings(root, version) {
  const directory = join(root, 'agents')
  if (!existsSync(directory)) return []
  const definitions = readdirSync(directory).filter(name => name.endsWith('.md'))
  if (definitions.length === 0) {
    return [`installed ${version} ships agents/ but it holds no definition`]
  }
  return definitions
    .filter(name => !/^---\r?\n[\s\S]*?\r?\n---/.test(readFileSync(join(directory, name), 'utf8')))
    .map(name => `installed ${version}: agent ${name} has no frontmatter,`
      + ` so subagent_type cannot resolve it`)
}

test('an absent install is UNRUN, not a pass and not a finding', () => {
  // Driven by a STUB, never by ambient absence: on a machine with an install this
  // branch would otherwise never execute, and in CI the other test's branch never
  // does. Neither would be a both-directions check anywhere.
  const asked = []
  const absent = locate(argv => { asked.push(argv); return { status: 1, stdout: '', stderr: 'no installed copy\n' } })
  assert.equal(absent.status, 'UNRUN', 'an install that cannot be found is UNRUN')
  assert.match(absent.reason, /qh-root/, 'the UNRUN line must say what it looked with')
  assert.doesNotMatch(absent.reason, /\bFINDING\b/,
    'could-not-look must not borrow the vocabulary of a verdict (ADR-005)')
  assert.match(asked.join(' '), /qh-root/,
    'the install is located with qh-root, never by lexical ordering of directory names')

  // And the other direction, or UNRUN is just what this function always says.
  const found = locate(() => ({ status: 0, stdout: '/somewhere/quality-harness/2.59.0\n', stderr: '' }))
  assert.equal(found.status, 'FOUND')
  assert.equal(found.root, '/somewhere/quality-harness/2.59.0',
    'the located root is the one qh-root printed, verbatim')
  assert.equal(found.version, '2.59.0', 'the version is read from the resolved root')

  // The report, on fixtures, in both directions.
  const clean = surfaceReport({
    version: '2.59.0',
    present: [...FLOOR, 'evals'],
    checkoutShips: [...FLOOR, 'evals'],
  })
  assert.deepEqual(clean.findings, [], `a complete install is clean: ${clean.findings.join(' ')}`)

  const missing = surfaceReport({
    version: '2.59.0',
    present: FLOOR.filter(entry => entry !== 'skills'),
    checkoutShips: FLOOR,
  })
  assert.equal(missing.findings.length, 1, `a missing floor entry is a finding: ${missing.findings}`)
  assert.match(missing.findings[0], /skills/)
  assert.match(missing.findings[0], /2\.59\.0/,
    'every finding names the version it was measured against — the 2026-09-01 confusion')

  const leaked = surfaceReport({ version: '2.59.0', present: [...FLOOR, 'tests'], checkoutShips: FLOOR })
  assert.ok(leaked.findings.some(line => line.includes('tests')),
    `a withheld directory present in the install is a finding: ${leaked.findings}`)

  // A surface the checkout ships and the install lacks is RELEASE LAG, which is
  // qh-doctor's question. It is reported as a note naming both, never as a
  // finding about the install (ADR-005, and T2's S3 amendment).
  // The definitions, driven from a FIXTURE. The installed copy on the authoring
  // machine is 2.59.0, which predates agents/ — so read only from the real
  // install, every line of this checker would sit unexecuted behind an existsSync.
  const fixture = mkdtempSync(join(tmpdir(), 'quality-installed-'))
  assert.deepEqual(agentDefinitionFindings(fixture, '2.59.0'), [],
    'an install with no agents/ is release lag, reported as a note and not here')
  mkdirSync(join(fixture, 'agents'))
  assert.equal(agentDefinitionFindings(fixture, '2.59.0').length, 1,
    'agents/ that ships empty is a finding — a directory nothing can address')
  writeFileSync(join(fixture, 'agents', 'qh-good.md'), '---\nname: qh-good\nmodel: opus\n---\nbody\n')
  assert.deepEqual(agentDefinitionFindings(fixture, '2.59.0'), [],
    'a definition with frontmatter is reachable and is not a finding')
  writeFileSync(join(fixture, 'agents', 'qh-bad.md'), 'no frontmatter here\n')
  const bad = agentDefinitionFindings(fixture, '2.59.0')
  assert.equal(bad.length, 1, `only the unparseable definition is a finding: ${bad}`)
  assert.match(bad[0], /qh-bad\.md/)
  assert.match(bad[0], /2\.59\.0/, 'every finding names the version it was measured against')
  rmSync(fixture, { recursive: true, force: true })

  const lagging = surfaceReport({ version: '2.59.0', present: FLOOR, checkoutShips: [...FLOOR, 'agents'] })
  assert.deepEqual(lagging.findings, [], 'release lag is not a defect of the install')
  assert.ok(lagging.notes.some(line => line.includes('agents') && line.includes('2.59.0')),
    `the lag is reported, naming the version: ${lagging.notes}`)
})

test('every shipped surface is reachable from the installed plugin', () => {
  const install = locate(argv => runPython(argv, { encoding: 'utf8' }))
  if (install.status === 'UNRUN') {
    // Printed, never silent. A machine with no install has not passed this check
    // and must not be told it did.
    console.log(`UNRUN: ${install.reason}`)
    return
  }
  const { root, version } = install
  const present = readdirSync(root, { withFileTypes: true })
    .filter(entry => entry.isDirectory() || entry.isFile()).map(entry => entry.name)
    .concat(existsSync(join(root, '.claude-plugin', 'plugin.json')) ? ['.claude-plugin/plugin.json'] : [])
    .concat(existsSync(join(root, '.claude-plugin', 'marketplace.json')) ? ['.claude-plugin/marketplace.json'] : [])

  const checkoutShips = readdirSync(join(repoRoot, 'plugin'), { withFileTypes: true })
    .filter(entry => entry.isDirectory()).map(entry => entry.name)
  const report = surfaceReport({ version, present, checkoutShips })
  for (const note of report.notes) console.log(`NOTE: ${note}`)
  assert.deepEqual(report.findings, [], report.findings.join('\n'))

  // A gate is reachable when its interpreter STARTS and its module IMPORTS. Not
  // an exit code: measured 2026-09-04, `--help` exits 1 from adr-lint and 2 from
  // adr-verify, so a status assertion would encode a per-gate quirk rather than
  // reachability. Spawned through runPython, never a bare `python3` — CLAUDE.md
  // §7's WindowsApps alias and the un-exec'able `#!` are both live there.
  const gates = readdirSync(join(root, 'bin'), { withFileTypes: true })
    .filter(entry => entry.isFile() && !entry.name.endsWith('.cmd')).map(entry => entry.name)
  assert.ok(gates.length > 5, `${version}: the sweep must have found real gates, read ${gates.length}`)
  for (const gate of gates) {
    const run = runPython([join(root, 'bin', gate), '--help'], { encoding: 'utf8' })
    assert.notEqual(run.status, null, `${version}: ${gate} did not start at all`)
    assert.doesNotMatch(run.stderr ?? '', /Traceback \(most recent call last\)|SyntaxError|ModuleNotFoundError/,
      `${version}: ${gate} is installed but does not import: ${(run.stderr ?? '').slice(0, 400)}`)
  }

  const skills = readdirSync(join(root, 'skills'), { withFileTypes: true })
    .filter(entry => entry.isDirectory()).map(entry => entry.name)
  assert.ok(skills.length > 5, `${version}: the sweep must have found real skills, read ${skills.length}`)
  for (const skill of skills) {
    const body = join(root, 'skills', skill, 'SKILL.md')
    assert.ok(existsSync(body), `${version}: skill ${skill} has no SKILL.md in the install`)
    assert.match(readFileSync(body, 'utf8'), /^---\r?\n[\s\S]*?\r?\n---/,
      `${version}: skill ${skill} has no parseable frontmatter, so the host cannot route to it`)
  }

  const workflows = readdirSync(join(root, 'workflows')).filter(name => name.endsWith('.js'))
  assert.ok(workflows.length >= 3, `${version}: expected the shipped workflows, read ${workflows.length}`)
  for (const workflow of workflows) {
    const parsed = spawnSync(process.execPath, ['--check', join(root, 'workflows', workflow)],
      { encoding: 'utf8', timeout: 60_000 })
    assert.equal(parsed.status, 0,
      `${version}: workflow ${workflow} does not parse as installed: ${parsed.stderr}`)
  }

  // Agent definitions, through the same checker the fixtures above drive. An
  // install that predates them returns nothing here and is reported as a note.
  const definitions = agentDefinitionFindings(root, version)
  assert.deepEqual(definitions, [], definitions.join('\n'))
})
