// The path-scoped rules in `.claude/rules/` are delivered by the harness on a
// `Read` and on nothing else. Measured 2026-09-04: `cat` through Bash, `mrw_read`,
// `Write` and `Edit` all injected nothing, while a `Read` of a tracked file
// injected exactly the matching rules. CLAUDE.md §14 mandates reading and writing
// through `mrw`, so a session obeying §14 received none of its rules and could not
// notice — an absent rule is silent, and so is a rule with nothing to say.
//
// Every assertion here that can report "delivered" is also shown reporting
// "delivered nothing" (CLAUDE.md §4), because a hook that always returns a rule
// and a hook that always returns none look identical from a green run.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  MAX_RULES, normalize, globToRegExp, parseRulePaths, loadRules,
  candidatePaths, resolveAgainstGit, matchRules, decide, run,
} from '../scripts/rules-inject.mjs'

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const HOOK = join(repoRoot, 'scripts', 'rules-inject.mjs')


// A `git` that answers from a literal, so the unit tests never go near a real
// repository (CLAUDE.md §9) and the tracked set is stated rather than inherited.
const gitStub = (tracked, root = '/repo') => (args) => {
  if (args[0] === 'rev-parse') return `${root}\n`
  return tracked.join('\n')
}

const RULES = [
  { name: '01.md', patterns: ['plugin/**', '.gitattributes'], body: 'ONE' },
  { name: '02.md', patterns: ['scripts/**'], body: 'TWO' },
  { name: '03.md', patterns: ['**'], body: 'THREE' },
]

test('a glob is anchored at both ends, so a suffix match is not a match', () => {
  assert.ok(globToRegExp('plugin/**').test('plugin/bin/adr-lint'))
  assert.ok(globToRegExp('tests/mutations.json').test('tests/mutations.json'))
  // The dirty half: without anchoring, a nested copy would answer for the real
  // file and a rule would be delivered about a file nobody touched.
  assert.ok(!globToRegExp('tests/mutations.json').test('plugin/tests/mutations.json'))
  assert.ok(!globToRegExp('plugin/**').test('scripts/mutate.mjs'))
})

test('`*` does not cross a separator and `**` does', () => {
  assert.ok(globToRegExp('plugin/bin/*').test('plugin/bin/adr-lint'))
  assert.ok(!globToRegExp('plugin/bin/*').test('plugin/bin/nested/adr-lint'))
  assert.ok(globToRegExp('**').test('anything/at/all.md'))
})

test('a Windows path and a POSIX path are the same path', () => {
  // CLAUDE.md §7 — normalize both separators, and reject a drive prefix.
  assert.equal(normalize('C:\\repo\\plugin\\bin\\x'), 'repo/plugin/bin/x')
  assert.ok(globToRegExp('plugin/**').test(normalize('plugin\\bin\\adr-lint')))
})

test('frontmatter yields its patterns, and malformed frontmatter yields none', () => {
  assert.deepEqual(
    parseRulePaths('---\npaths:\n  - "plugin/**"\n  - ".gitignore"\n---\n\nbody'),
    ['plugin/**', '.gitignore'],
  )
  // Each dirty case would otherwise mint a rule that matches nothing, or throw.
  assert.deepEqual(parseRulePaths('no frontmatter at all'), [])
  assert.deepEqual(parseRulePaths('---\ndescription: x\n---\nbody'), [])
  assert.deepEqual(parseRulePaths(''), [])
})

test('this repository\'s own rules all parse, and all name at least one glob', () => {
  // Read-only, no `git`: the corpus is the thing under test, not a fixture.
  const rules = loadRules(join(repoRoot, '.claude', 'rules'))
  assert.ok(rules.length > 0, 'no rule files parsed out of .claude/rules/')
  for (const rule of rules) {
    assert.ok(rule.patterns.length > 0, `${rule.name} declares no paths:`)
    assert.ok(rule.body.length > 0, `${rule.name} has no body under its frontmatter`)
    assert.ok(!rule.body.startsWith('---'), `${rule.name} kept its frontmatter in the body`)
  }
})

test('candidate paths come out of each tool input shape', () => {
  assert.deepEqual(candidatePaths('Write', { file_path: 'tests/x.mjs' }), ['tests/x.mjs'])
  assert.ok(candidatePaths('Bash', { command: 'cat .gitattributes' }).includes('.gitattributes'))
  // A regexp address contains a colon of its own; splitting on every colon
  // would hand back an empty path and deliver nothing.
  assert.deepEqual(
    candidatePaths('mcp__mrw__mrw_read', { specs: ['a.go:40-60', 'b.go:/func X:/', 'c.go:$'] }),
    ['a.go', 'b.go', 'c.go'],
  )
  assert.deepEqual(
    candidatePaths('mcp__mrw__mrw_write', { plan: '@@ scripts/x.mjs 42 replace\nnew line\n' }),
    ['scripts/x.mjs'],
  )
  // A body line may legitimately begin with `@@` under mrw's raw=true. Reading
  // it as a header would invent a path that was never touched.
  assert.deepEqual(
    candidatePaths('mcp__mrw__mrw_write', { plan: '@@ a.md 1 replace\n@@ not a header\n' }),
    ['a.md'],
  )
  assert.deepEqual(candidatePaths('Grep', { pattern: 'plugin/**' }), [])
})

test('a token that only LOOKS like a path is not an observation that a file was touched', () => {
  const cwd = '/repo'
  const git = gitStub(['plugin/bin/adr-lint'])
  // The clean half: a real tracked path resolves.
  assert.deepEqual(
    resolveAgainstGit(['plugin/bin/adr-lint'], cwd, git),
    ['plugin/bin/adr-lint'],
  )
  // The dirty half, and the whole reason this goes through `git` (CLAUDE.md §8
  // and §3): these are what a Bash command is full of, and injecting a rule on
  // one would report an observation nobody made.
  assert.deepEqual(resolveAgainstGit(['plugin/bin/does-not-exist'], cwd, git), [])
  assert.deepEqual(resolveAgainstGit(['README.md', 'origin/main', 'a.b'], cwd, git), [])
})

test('an absolute path and a root-relative one resolve to the same file', () => {
  const git = gitStub(['scripts/mutate.mjs'])
  assert.deepEqual(resolveAgainstGit(['/repo/scripts/mutate.mjs'], '/repo', git), ['scripts/mutate.mjs'])
  assert.deepEqual(resolveAgainstGit(['scripts/mutate.mjs'], '/repo', git), ['scripts/mutate.mjs'])
})

test('when `git` cannot answer, nothing is delivered rather than everything', () => {
  const broken = () => { throw new Error('not a git repository') }
  assert.deepEqual(resolveAgainstGit(['plugin/bin/adr-lint'], '/repo', broken), [])
})

test('only the rules whose globs match are delivered', () => {
  assert.deepEqual(matchRules(['plugin/bin/x'], RULES).map((r) => r.name), ['01.md', '03.md'])
  assert.deepEqual(matchRules(['scripts/x.mjs'], RULES).map((r) => r.name), ['02.md', '03.md'])
  // The dirty half: a path under no narrow glob still gets the `**` rule and
  // nothing else — if this returned all three, the split would be doing nothing.
  assert.deepEqual(matchRules(['docs/x.md'], RULES).map((r) => r.name), ['03.md'])
})

test('a delivery carries the rule bodies, and a repeat carries nothing', () => {
  const payload = {
    tool_name: 'Bash',
    tool_input: { command: 'cat .gitattributes' },
    cwd: '/repo',
  }
  const git = gitStub(['.gitattributes'])
  const first = decide(payload, RULES, new Set(), { cwd: '/repo', runGit: git })
  assert.ok(first.text.includes('ONE'))
  assert.ok(first.text.includes('THREE'))
  assert.deepEqual(first.names, ['01.md', '03.md'])
  // Dedup: the harness does not re-send a rule it already delivered, and neither
  // does this. Without it, every `cat` in a session re-pays the rule's cost.
  const second = decide(payload, RULES, new Set(['01.md', '03.md']), { cwd: '/repo', runGit: git })
  assert.equal(second, null)
})

test('a call that would deliver more than the cap NAMES what it withheld', () => {
  const many = Array.from({ length: MAX_RULES + 2 }, (_, i) => ({
    name: `${String(i).padStart(2, '0')}.md`, patterns: ['**'], body: `BODY${i}`,
  }))
  const git = gitStub(['a.md'])
  const outcome = decide(
    { tool_name: 'Bash', tool_input: { command: 'cat a.md' }, cwd: '/repo' },
    many, new Set(), { cwd: '/repo', runGit: git },
  )
  assert.equal(outcome.names.length, MAX_RULES)
  // A silent truncation would read as "here is everything that governs this"
  // — CLAUDE.md §3. The withheld ones must be named.
  assert.match(outcome.text, /not delivered here/)
  assert.ok(outcome.text.includes(`${String(MAX_RULES + 1).padStart(2, '0')}.md`))
  // And the ones under the cap really are delivered, not merely counted.
  assert.ok(outcome.text.includes('BODY0'))
})

test('garbage in means nothing out, never a throw', () => {
  // The failure mode this guards is silence-by-crash: a hook that throws takes
  // the user's turn with it, and it is a convenience, not a gate (CLAUDE.md §3).
  assert.equal(run('not json at all'), null)
  assert.equal(run(''), null)
  assert.equal(run('{}', { rulesDir: '/nonexistent' }), null)
  assert.equal(run(JSON.stringify({ tool_name: 'Bash' }), { rulesDir: '/nonexistent' }), null)
})

test('end to end, in a repository the test creates: mrw_read delivers what Read would', (t) => {
  // CLAUDE.md §9 — `git` is only ever spawned in a directory this test made.
  // Named `sandbox`, never `repoRoot`, so a rename cannot cross that line.
  const sandbox = mkdtempSync(join(tmpdir(), 'rules-inject-'))
  t.after(() => rmSync(sandbox, { recursive: true, force: true }))

  mkdirSync(join(sandbox, '.claude', 'rules'), { recursive: true })
  mkdirSync(join(sandbox, 'scripts'), { recursive: true })
  writeFileSync(join(sandbox, '.claude', 'rules', '02-running.md'),
    '---\npaths:\n  - "scripts/**"\n---\n\nRUN THE CHECKS THE WAY THEY ARE MEANT TO BE RUN\n')
  writeFileSync(join(sandbox, '.claude', 'rules', '13-releasing.md'),
    '---\npaths:\n  - ".github/**"\n---\n\nA GREEN SHIPPED CHANGE IS RELEASED\n')
  writeFileSync(join(sandbox, 'scripts', 'selftest.sh'), '#!/usr/bin/env bash\n')

  const git = (...args) => execFileSync('git', args, { cwd: sandbox, encoding: 'utf8', timeout: 60_000 })
  git('init', '-q')
  git('add', '-A')

  // ⚠ A UNIQUE SESSION PER CALL. The first version of this test used fixed ids,
  // and the dedup state they wrote under the system temp directory OUTLIVED the
  // run: it passed standalone, then failed under `selftest.sh` and every time
  // after, because the hook correctly refused to re-send a rule it had already
  // delivered to `end-to-end-read`. A fixture that is green exactly once reads
  // as a flake, which is the most expensive way for a real behaviour to be
  // discovered. `session_id` sits before the spread so a case that cares about
  // the session can still pin it.
  const hook = (payload) => execFileSync('node', [HOOK], {
    cwd: sandbox,
    encoding: 'utf8',
    input: JSON.stringify({ cwd: sandbox, session_id: randomUUID(), ...payload }), timeout: 60_000,
  })

  // The regression runs through the same call the report came through
  // (CLAUDE.md §4): `mrw_read` is the read path §14 mandates, and it is the one
  // that delivered nothing.
  const read = hook({
    tool_name: 'mcp__mrw__mrw_read',
    tool_input: { specs: ['scripts/selftest.sh:1-4'] },
  })
  assert.match(read, /RUN THE CHECKS/)
  // And the rule that does NOT govern that file stays out, or the delivery is
  // just the whole rulebook again.
  assert.ok(!read.includes('A GREEN SHIPPED CHANGE'))

  // Bash, the other unserved read path.
  const bash = hook({
    tool_name: 'Bash',
    tool_input: { command: 'bash scripts/selftest.sh' },
  })
  assert.match(bash, /RUN THE CHECKS/)

  // A tool call that touches no tracked file delivers nothing at all.
  const quiet = hook({
    tool_name: 'Bash',
    tool_input: { command: 'echo hello world' },
  })
  assert.equal(quiet.trim(), '')

  // Dedup, through the CLI rather than the unit seam — this is the behaviour
  // that made the fixture above green exactly once, so it is worth an assertion
  // rather than a comment. One session asking twice is told once.
  const session = randomUUID()
  const twice = () => hook({
    session_id: session,
    tool_name: 'Bash',
    tool_input: { command: 'bash scripts/selftest.sh' },
  })
  assert.match(twice(), /RUN THE CHECKS/)
  assert.equal(twice().trim(), '')

  // ⚠ THE UNTRACKED HALF, reported from outside and regressed at the outermost
  // boundary through the same call the report came through (CLAUDE.md §4). Two
  // peer sessions independently read the fix and asked the same question: a
  // newly-created file is not in `git ls-files`, so does a `Write` deliver
  // nothing — the case the hook exists to cover?
  //
  // It delivers, because PostToolUse runs AFTER the write: the file is on disk
  // by the time the hook resolves it, and `--others --exclude-standard` lists
  // it. But the doubt was worth more than the answer, because until this
  // assertion existed every hook call in this fixture ran after `git add -A` —
  // so `--others` was never exercised, and deleting it from the source would
  // have left the whole suite green. A flag no test can see the absence of is
  // not covered by the tests that pass over it.
  const created = join(sandbox, 'scripts', 'brand-new.mjs')
  writeFileSync(created, '// never added, never committed\n')
  assert.equal(
    git('ls-files', '--cached').includes('brand-new'), false,
    'the fixture must be UNTRACKED or it proves nothing about --others',
  )
  const fresh = hook({
    tool_name: 'Write',
    tool_input: { file_path: 'scripts/brand-new.mjs' },
  })
  assert.match(fresh, /RUN THE CHECKS/)

  // And the boundary that makes `--exclude-standard` a decision rather than an
  // accident: a new file under an IGNORED path is not repository content, so it
  // draws no rule even though a rule globs it.
  //
  // ⚠ THE IGNORED FILE MUST SIT UNDER A GLOB THAT MATCHES IT, and the first
  // version of this did not. It used `scratch/build.mjs`, which no rule in this
  // fixture globs — so it asserted an empty delivery for a path that could never
  // have produced one, and passed with `--exclude-standard` deleted from the
  // source. Mutating that flag away scored SURVIVED, which is how the vacuity
  // was found; nothing in a green run says an assertion is asserting nothing.
  // `scripts/generated/` is ignored AND globbed by the `scripts/**` rule, so the
  // only thing that can keep the delivery empty is the flag under test.
  writeFileSync(join(sandbox, '.gitignore'), 'scripts/generated/\n')
  mkdirSync(join(sandbox, 'scripts', 'generated'), { recursive: true })
  writeFileSync(join(sandbox, 'scripts', 'generated', 'build.mjs'), '// generated\n')
  const ignored = hook({
    tool_name: 'Write',
    tool_input: { file_path: 'scripts/generated/build.mjs' },
  })
  assert.equal(ignored.trim(), '')
})

test('the hook exits 0 on garbage, so a broken hook never takes the turn', () => {
  for (const input of ['', 'not json', '{"tool_name":']) {
    const result = execFileSync('node', [HOOK], {
      cwd: repoRoot, encoding: 'utf8', input, timeout: 60_000,
    })
    // execFileSync throws on a non-zero exit, so reaching here IS the assertion
    // that the exit code was 0; the empty stdout is the second half.
    assert.equal(result.trim(), '')
  }
})
