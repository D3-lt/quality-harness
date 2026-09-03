// BACKLOG §112 — the tutorial's transcripts were hand-copied, and nothing re-checked them.
//
// `docs/TUTORIALS.md` shows real terminal output, which was a deliberate choice
// over illustrative transcripts: a tutorial whose output was written by hand is a
// fabricated verification log with a different file extension. But a human copied
// it in, so when a gate's wording changes the page goes stale silently and reads
// exactly as it does now.
//
// §112 named the cheap fix and rejected it. Asserting the exact strings would break
// on every wording change, and this project edits gate messages often and on
// purpose — a check that fails for the right reason too often gets deleted. What
// matters is the two OUTCOMES: `mutant killed` for a test that is load-bearing, and
// `NOT evidence` for one that cannot fail. Those are the product's whole claim, and
// they are what this file asserts.
//
// THE SETUP IS EXTRACTED FROM THE PAGE, NEVER RESTATED HERE. A copy of the
// tutorial's code kept beside the tutorial is the same defect one level down — the
// hand-written list this project keeps refusing (SHADOW_SCOPE, the README surface
// list). So every artifact below is parsed out of `docs/TUTORIALS.md`, and editing
// the page changes what runs.
//
// The two halves are each other's vacuity proof, in the same test: the SAME
// mutation command reports `mutant killed` against the real assertion and
// `NOT evidence` against the weakened one. A check that could only ever report
// clean would pass the first half and be unable to fail the second.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import { delimiter, dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const testDir = dirname(fileURLToPath(import.meta.url))
// `repoRoot` is THIS repository and is only ever read. Every write goes to
// `tutorialRepo`, a temp directory this file created. The names are deliberately
// unalike: CLAUDE.md §9 records the day a blanket rename bound a `git -C <temp>`
// helper to the real root and the suite committed to `main`.
const repoRoot = resolve(testDir, '..')
const bin = join(repoRoot, 'plugin', 'bin')
const tutorialPage = join(repoRoot, 'docs', 'TUTORIALS.md')

const env = { ...process.env, PATH: `${bin}${delimiter}${process.env.PATH ?? ''}` }

// Windows cannot exec a `#!` script, so a direct spawn returns status `null` —
// not an error and not a failure. Same seam as tests/evidence-chain.test.mjs.
const GATE_NAMES = new Set(readdirSync(bin, { withFileTypes: true })
  .filter(entry => entry.isFile() && !entry.name.includes('.')).map(entry => entry.name))

function run(command, args, cwd) {
  const [file, argv] = process.platform === 'win32' && GATE_NAMES.has(command)
    ? ['python3', [join(bin, command), ...args]]
    : [command, args]
  return spawnSync(file, argv, { cwd, env, encoding: 'utf8', timeout: 120_000 })
}

const page = readFileSync(tutorialPage, 'utf8')

// The heredoc payloads the tutorial tells a reader to write. Anchored on the
// heredoc opener rather than on a fence index, so inserting a code block earlier
// in the page does not silently repoint this at something else.
function heredoc(name) {
  const match = page.match(new RegExp(String.raw`cat > ${name} <<'EOF'\n([\s\S]*?)\nEOF`))
  assert.ok(match, `docs/TUTORIALS.md no longer writes ${name} with a heredoc`)
  return `${match[1]}\n`
}

// The task file is the page's only ````markdown block.
function taskFile() {
  const match = page.match(/````markdown\n([\s\S]*?)\n````/)
  assert.ok(match, 'docs/TUTORIALS.md no longer carries the task file as a ````markdown block')
  return `${match[1]}\n`
}

// The mutation the tutorial runs, taken from the command it prints.
function mutationArgs() {
  const match = page.match(
    /--mutant (\S+)\s*\\?\s*\n?\s*--from '([^']*)' --to '([^']*)'\s*\\?\s*\n?\s*--why '([^']*)'/)
  assert.ok(match, 'docs/TUTORIALS.md no longer prints a --mutant invocation this can replay')
  const [, mutant, from, to, why] = match
  return ['--mutant', mutant, '--from', from, '--to', to, '--why', why]
}

// The weakened assertion the page tells the reader to paste in. It is the whole
// point of Tutorial 2, so its absence must fail loudly rather than skip the half
// of this test that can go red.
function weakenedTest() {
  const match = page.match(/```python\n([\s\S]*?)\n```/)
  assert.ok(match, 'docs/TUTORIALS.md no longer shows the weakened test')
  return match[1]
}

// The task path the page tells the reader to create, so a rename on the page moves
// this too.
function taskPath() {
  const match = page.match(/(docs\/adr\/[^\s`]+\/tasks\/[^\s`]+\.md)/)
  assert.ok(match, 'docs/TUTORIALS.md no longer names a task file path')
  return match[1]
}

const temps = []
test.after(() => {
  for (const temp of temps) rmSync(temp, { recursive: true, force: true })
})

// The throwaway repository from "Set up a throwaway repository", built from the
// page's own heredocs. The page's `mkdir /tmp/qh-tutorial` is not replayed: a
// literal temp path is an assertion about the operating system (CLAUDE.md §7), and
// the directory is the one thing here a reader substitutes anyway.
function throwawayRepo() {
  const temp = mkdtempSync(join(os.tmpdir(), 'qh-tutorial-'))
  temps.push(temp)
  const tutorialRepo = join(temp, 'work')
  mkdirSync(tutorialRepo)

  const git = (...args) => spawnSync('git', args, { cwd: tutorialRepo, encoding: 'utf8' })
  git('init', '-b', 'main', '.')
  git('config', 'user.email', 'tutorial@example.invalid')
  git('config', 'user.name', 'tutorial')

  writeFileSync(join(tutorialRepo, 'duration.py'), heredoc('duration.py'))
  writeFileSync(join(tutorialRepo, 'test_duration.py'), heredoc('test_duration.py'))

  const task = taskPath()
  mkdirSync(join(tutorialRepo, dirname(task)), { recursive: true })
  writeFileSync(join(tutorialRepo, task), taskFile())

  git('add', '-A')
  git('commit', '-qm', 'init')
  return { tutorialRepo, task }
}

test('the tutorial walkthrough still produces the two outcomes it prints', () => {
  const { tutorialRepo, task } = throwawayRepo()
  const args = mutationArgs()

  // Tutorial 2, first half: the assertion is real, so breaking the parser must be
  // noticed. `mutant killed` and exit 0 are one claim — a survivor exits 1.
  const killed = run('adr-verify', [task, ...args], tutorialRepo)
  const killedOut = `${killed.stdout}${killed.stderr}`
  assert.equal(killed.status, 0,
    `the tutorial's mutation must be killed\n${killedOut}`)
  assert.match(killedOut, /mutant killed/,
    `the page prints "mutant killed" here\n${killedOut}`)

  // The mutant is restored, or the second half would measure a broken parser
  // rather than a weakened test.
  assert.equal(readFileSync(join(tutorialRepo, 'duration.py'), 'utf8'), heredoc('duration.py'),
    'adr-verify must restore the file it broke')

  // Tutorial 2, second half: the same mutation against an assertion that cannot
  // fail. This is the half that proves the first half was not vacuous.
  const source = readFileSync(join(tutorialRepo, 'test_duration.py'), 'utf8')
  const weakened = weakenedTest()
  const method = source.match(/ {4}def test_plain_seconds\(self\):\n(?: {8}.*\n?)*/)
  assert.ok(method, 'the tutorial test no longer has the method the page weakens')
  writeFileSync(join(tutorialRepo, 'test_duration.py'),
    source.replace(method[0], `${weakened.replace(/^/gm, '    ').replace(/^\s+$/gm, '')}\n`))

  const survived = run('adr-verify', [task, ...args], tutorialRepo)
  const survivedOut = `${survived.stdout}${survived.stderr}`
  assert.equal(survived.status, 1,
    `a surviving mutant must exit 1\n${survivedOut}`)
  assert.match(survivedOut, /NOT evidence/,
    `the page prints "NOT evidence" here\n${survivedOut}`)
})
