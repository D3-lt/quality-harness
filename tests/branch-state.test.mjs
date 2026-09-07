// CLAUDE.md §15 — the session-start reader, and the arms that must not look alike.
//
// The incident this comes from is one where every check was correct and nobody
// read the failing one (BACKLOG §126), so what matters here is that the reader
// DISTINGUISHES: green, red, still-running and could-not-look are four answers,
// and three of them are not a clean bill. Every arm is driven through the `run`
// seam, so this test needs no network, no remote and no `gh` (CLAUDE.md §7, §9).
import assert from 'node:assert/strict'
import test from 'node:test'

import { budgeted, cached, collect, gitDir, releaseAnchor, render, shell, usableCache } from '../plugin/scripts/branch-state.mjs'

const ok = out => ({ ok: true, out })
const no = note => ({ ok: false, out: '', note })

// One fake process table. Anything not named here answers "not ok", which is
// what an absent binary looks like.
function runner(table) {
  return argv => {
    for (const [prefix, answer] of table) {
      if (argv.join(' ').startsWith(prefix)) return answer
    }
    return no(`no fake for: ${argv.join(' ')}`)
  }
}

const GIT_CLEAN = [
  ['git rev-parse --abbrev-ref', ok('main')],
  ['git rev-parse --short', ok('0a18d04')],
  ['git status --short', ok('')],
  ['git rev-list', ok('0\t0')],
  ['git describe', ok('v2.64.0')],
  ['git diff --name-only', ok('')],
]

test('a green run and a red run do not read alike', () => {
  const green = render(collect(runner([...GIT_CLEAN,
    ['gh run list', ok(JSON.stringify([{ headSha: '0a18d04ff', status: 'completed', conclusion: 'success', databaseId: 1 }]))],
  ])))
  assert.match(green, /every job concluded success/)
  assert.doesNotMatch(green, /COULD NOT LOOK|⚠/)

  const red = render(collect(runner([...GIT_CLEAN,
    ['gh run list', ok(JSON.stringify([{ headSha: '479fbef1', status: 'completed', conclusion: 'failure', databaseId: 2 }]))],
    ['gh run view', ok(JSON.stringify({ jobs: [
      { name: 'coverage floor', conclusion: 'failure' },
      { name: 'selftest (macos-latest)', conclusion: 'success' },
    ] }))],
  ])))
  assert.match(red, /FAILURE/)
  assert.match(red, /coverage floor: failure/, 'name the job, or the reader has to go and look')
  assert.match(red, /A LOCAL GREEN GATE DOES NOT ANSWER THIS/,
    'the whole incident was a local green read as a branch verdict')
})

test('could-not-look and still-running are their own answers, never clean bills', () => {
  // `gh` absent: the exact case where staying quiet would read as green.
  const blind = render(collect(runner(GIT_CLEAN)))
  assert.match(blind, /COULD NOT LOOK/)
  assert.match(blind, /NOT a green branch; an unknown one/)

  const running = render(collect(runner([...GIT_CLEAN,
    ['gh run list', ok(JSON.stringify([{ headSha: 'abcdef01', status: 'in_progress', conclusion: null, databaseId: 3 }]))],
  ])))
  assert.match(running, /still running/)
  assert.doesNotMatch(running, /concluded success/)

  // And no git at all is could-not-look about everything, not a report.
  const noGit = render(collect(() => no('git: command not found')))
  assert.match(noGit, /COULD NOT LOOK — git: command not found/)
  assert.match(noGit, /says nothing about the branch/)
})

test('unreleased plugin changes are named, and an unchanged plugin says nothing', () => {
  const shipped = render(collect(runner([
    ...GIT_CLEAN.filter(([prefix]) => prefix !== 'git diff --name-only'),
    ['git diff --name-only', ok('plugin/bin/adr-verify\nplugin/scripts/lifecycle.mjs')],
    ['gh run list', ok(JSON.stringify([{ headSha: '0a18d04ff', status: 'completed', conclusion: 'success', databaseId: 1 }]))],
  ])))
  assert.match(shipped, /plugin\/ changed in 2 file\(s\) since v2\.64\.0/)

  const parked = render(collect(runner([...GIT_CLEAN,
    ['gh run list', ok(JSON.stringify([{ headSha: '0a18d04ff', status: 'completed', conclusion: 'success', databaseId: 1 }]))],
  ])))
  assert.doesNotMatch(parked, /plugin\/ changed/,
    'an unchanged plugin must not nag — a reminder that always fires is one nobody reads')
})

// The per-message form. SessionStart fires once, at the start, which is exactly
// when a session has not yet decided to do anything — so the reader that is
// SEEN is this one, the way agentsmemory's recall is seen on every prompt. One
// line, because a paragraph on every message is one nobody reads by the third.
test('brief is one line, and still shouts when CI is red', () => {
  const green = render(collect(runner([...GIT_CLEAN,
    ['gh run list', ok(JSON.stringify([{ headSha: '0a18d04ff', status: 'completed', conclusion: 'success', databaseId: 1 }]))],
  ])), { brief: true })
  assert.equal(green.split('\n').length, 1, 'a green branch costs one line on every prompt')
  assert.match(green, /every job concluded success/)

  const red = render(collect(runner([...GIT_CLEAN,
    ['gh run list', ok(JSON.stringify([{ headSha: '479fbef1', status: 'completed', conclusion: 'failure', databaseId: 2 }]))],
    ['gh run view', ok(JSON.stringify({ jobs: [{ name: 'windows', conclusion: 'failure' }] }))],
  ])), { brief: true })
  assert.match(red, /⚠ CI/, 'brevity must not cost the alarm')
  assert.match(red, /windows: failure/, 'nor the job name')
  assert.match(red, /A LOCAL GREEN GATE DOES NOT ANSWER THIS/,
    'the one sentence the incident was about survives into brief')
})

// A cache is a speed-up. It is never allowed to be the reason a session is told
// something wrong, so a stale answer SAYS how old it is and an unreadable one is
// simply refreshed rather than trusted or fatal.
test('the cache serves a fresh answer, ages a stale one, and survives a broken file', () => {
  const state = { looked: true, branch: 'main', head: 'abc1234', dirty: 0, ahead: 0,
    ci: { looked: true, sha: 'abc1234', status: 'completed', conclusion: 'success', failed: [] },
    tag: 'v1.0.0', shippedSinceTag: 0 }
  let written = null
  let gathered = 0
  const gather = () => { gathered += 1; return state }

  // Nothing cached yet: gather, and write what was gathered.
  const first = cached(120, { read: () => null, write: p => { written = p }, now: () => 1_000_000, gather })
  assert.equal(gathered, 1)
  assert.equal(first.ageSeconds, 0)
  assert.equal(written.at, 1_000_000, 'the time it was taken travels with it, or staleness is invisible')

  // Inside the window: no new gather, and the age is reported.
  const warm = cached(120, { read: () => written, write: () => {}, now: () => 1_030_000, gather })
  assert.equal(gathered, 1, 'a cached answer must not spawn gh again')
  assert.equal(warm.ageSeconds, 30)

  // Past the window: gathered again.
  cached(120, { read: () => written, write: () => {}, now: () => 1_500_000, gather })
  assert.equal(gathered, 2, 'a stale cache is refreshed, never served as current')

  // Unreadable or malformed: refreshed, never fatal.
  cached(120, { read: () => null, write: () => {}, now: () => 2_000_000, gather })
  assert.equal(gathered, 3)
  cached(120, { read: () => ({ at: 'not a number', state }), write: () => {}, now: () => 2_000_000, gather })
  assert.equal(gathered, 4, 'a corrupt timestamp is not a fresh answer')
})

// The seam itself. `shell` is what every other arm is spared from touching, so
// nothing else exercises it — and a helper whose whole contract is "never
// throws" is exactly the kind that is discovered to throw in production.
test('shell answers for a command that ran and one that could not', () => {
  const ran = shell([process.execPath, '-e', 'process.stdout.write("hello")'])
  assert.equal(ran.ok, true)
  assert.equal(ran.out, 'hello')

  // A binary that does not exist is the ordinary case here: `gh` is absent on
  // plenty of machines, and that must be an answer rather than an exception.
  const absent = shell(['definitely-not-a-binary-here-9a3f', '--version'])
  assert.equal(absent.ok, false)
  assert.equal(absent.out, '')
  assert.ok(absent.note, 'a failure without a reason cannot be reported to anyone')
})

// ⚠ THE FALLBACK USED TO BE `"."`, and that is worth a test of its own: it put
// the cache in the process's WORKING DIRECTORY, where it could overwrite a
// tracked file and where a repository-controlled file would then be read back as
// this tool's own answer. There is no safe default for "I do not know where .git
// is" — null means "use no cache", which is the only honest option.
test('gitDir asks git, and answers null rather than guessing a directory', () => {
  assert.equal(gitDir(() => ({ ok: true, out: '/somewhere/.git' })), '/somewhere/.git')
  assert.equal(gitDir(() => ({ ok: false, out: '', note: 'not a repository' })), null,
    'a cache directory must never be guessed into a tracked tree')
  assert.equal(gitDir(() => ({ ok: true, out: '' })), null, 'an empty answer is not a path')
})

// A cache file is an INPUT, and nothing had checked it. A future timestamp keeps
// a forged answer fresh for ever; a malformed state threw out of render and took
// the hook's exit code with it — a reader that cannot block a session, blocking
// one. Both are refreshed instead.
test('a cache is only reused when what it holds survives inspection', () => {
  const now = 1_000_000
  const good = { at: now - 1000, state: { looked: true, ci: {} } }
  assert.equal(usableCache(good, now), true)

  assert.equal(usableCache({ at: now + 60_000, state: { looked: true, ci: {} } }, now), false,
    'a future timestamp would never go stale')
  assert.equal(usableCache({ at: now - 1000, state: null }, now), false)
  assert.equal(usableCache({ at: now - 1000, state: { looked: true } }, now), false,
    'a looked state with no ci is what threw out of render')
  assert.equal(usableCache({ at: 'soon', state: { looked: true, ci: {} } }, now), false)
  assert.equal(usableCache(null, now), false)

  // A could-not-look state is a legitimate thing to cache, and has no `ci`.
  assert.equal(usableCache({ at: now - 1000, state: { looked: false, note: 'no git' } }, now), true)

  // And the age never rounds to zero, or a cached answer is indistinguishable
  // from one just taken.
  const warm = cached(120, { read: () => good, write: () => {}, now: () => now, gather: () => { throw new Error('must not gather') } })
  assert.equal(warm.fromCache, true)
  assert.equal(warm.ageSeconds, 1)
})

// One deadline for the whole collection, not one per subprocess. Two `gh` calls
// at 15s each outlive the hook's 20s budget, and a hook killed by its host is a
// hook that blocked a prompt.
test('the collection budget is spent once, and says so when it runs out', () => {
  let clock = 0
  const calls = []
  const run = budgeted(15_000, (argv, options) => { calls.push(options.timeout); return { ok: true, out: 'x' } }, () => clock)

  run(['git', 'status'])
  assert.ok(calls[0] > 0 && calls[0] <= 15_000, 'a command inside the budget gets what is left of it')

  clock = 14_000
  run(['gh', 'run', 'list'])
  assert.equal(calls[1], 1000, 'the second command gets the REMAINDER, never a fresh 15s')

  clock = 20_000
  const spent = run(['gh', 'run', 'view', '1'])
  assert.equal(spent.ok, false, 'past the deadline nothing else is spawned')
  assert.match(spent.note, /budget of 15000ms spent/)
})

// The honesty defect the reader exists to prevent, found in the reader: a failed
// `git status` became `dirty: null`, and a truthiness test rendered that as
// "clean" — stating more than was observed, in the tool whose whole job is not
// to (CLAUDE.md §3).
test('a cleanliness read that failed is not reported as clean', () => {
  const blind = render(collect(runner([
    ['git rev-parse --abbrev-ref', ok('main')],
    ['git rev-parse --short', ok('abc1234')],
    ['git rev-list', ok('0\t0')],
    ['git describe', ok('v1.0.0')],
    ['git diff --name-only', ok('')],
    ['gh run list', ok(JSON.stringify([{ headSha: 'abc1234', status: 'completed', conclusion: 'success', databaseId: 1 }]))],
  ])))
  assert.match(blind, /cleanliness COULD NOT LOOK/)
  // `/, clean/` also matches inside ", cleanliness" — the assertion passed for
  // the wrong reason until it did not.
  assert.doesNotMatch(blind, /, clean(?![a-z])/, 'an unread working tree is not a clean one')
})

// BACKLOG §157 — the release line, which until now had no test at all, which is
// how it came to print a false conclusion on every prompt for four releases.
//
// The real shape, 2026-09-07: HEAD is v2.85.0 on the forge, the newest LOCAL tag
// is v2.81.0 because `gh release create` tags the remote and this clone never
// fetched, and the line read "plugin/ changed in 8 file(s) since v2.81.0 — §13: a
// green shipped change is released, not parked." The count was true. The advice
// was false. Everything below is driven through the `run` seam — no network, no
// remote, no `gh` (CLAUDE.md §7).
const RELEASED_SHA = '46a265611ecf407b1fab10faa2c364c1e0e3b188'
const STALE_LOCAL_TAG = [
  ['git rev-parse --abbrev-ref', ok('main')],
  ['git rev-parse --short', ok('46a2656')],
  ['git status --short', ok('')],
  ['git rev-list', ok('0\t0')],
  ['gh run list', ok(JSON.stringify([{ headSha: '46a2656', status: 'completed', conclusion: 'success', databaseId: 1 }]))],
  ['git describe', ok('v2.81.0')],
  ['git diff --name-only v2.81.0..HEAD', ok('plugin/.claude-plugin/plugin.json\nplugin/bin/adr-lint')],
]

const FORGE = ok(JSON.stringify({
  tagName: 'v2.85.0', targetCommitish: RELEASED_SHA, isDraft: false, isPrerelease: false,
}))

test('the forge anchor decides, and it is shown answering BOTH ways', () => {
  // One test, both directions, because an anchor that can only ever say "nothing
  // to release" is not an anchor, it is the alarm switched off — and a
  // different-lineage review pointed out that keeping the counterexample in a
  // separate test is exactly what CLAUDE.md §4 forbids.
  const forge = shipped => render(collect(runner([...STALE_LOCAL_TAG,
    ['gh release view', FORGE],
    ['git merge-base --is-ancestor', ok('')],
    [`git diff --name-only ${RELEASED_SHA}..HEAD`, ok(shipped)],
  ])))

  const clean = forge('')
  assert.doesNotMatch(clean, /not parked/, 'HEAD is the release; there is nothing to release')
  assert.doesNotMatch(clean, /v2\.81\.0/, 'the stale local tag must not be quoted as the anchor')

  const dirty = forge('plugin/bin/adr-verify')
  assert.match(dirty, /changed in 1 file\(s\) since v2\.85\.0 — §13/)
  assert.doesNotMatch(dirty, /THIS CLONE/, 'the anchor came from the forge, so it is not hedged')
})

test('a local tag NEWER than the release does not hide the work between them', () => {
  // The shape the first version of this missed, named by a different-lineage
  // review 2026-09-07: the forge used to be asked only when the LOCAL diff was
  // non-empty. Tag HEAD locally and that diff is empty, so nothing was asked and
  // nothing was said — while everything between the release and that tag was
  // genuinely unreleased. Saving a subprocess by deciding in advance that the
  // answer will not change is the same mistake as not looking.
  const out = render(collect(runner([
    ['git rev-parse --abbrev-ref', ok('main')],
    ['git rev-parse --short', ok('46a2656')],
    ['git status --short', ok('')],
    ['git rev-list', ok('0\t0')],
    ['gh run list', ok(JSON.stringify([{ headSha: '46a2656', status: 'completed', conclusion: 'success', databaseId: 1 }]))],
    ['git describe', ok('v2.86.0')],
    ['git diff --name-only v2.86.0..HEAD', ok('')],
    ['gh release view', FORGE],
    ['git merge-base --is-ancestor', ok('')],
    [`git diff --name-only ${RELEASED_SHA}..HEAD`, ok('plugin/bin/adr-verify\nplugin/bin/adr-next')],
  ])))
  assert.match(out, /changed in 2 file\(s\) since v2\.85\.0 — §13/)
})

test('a clone with no local tag at all still gets the forge answer', () => {
  const out = render(collect(runner([
    ['git rev-parse --abbrev-ref', ok('main')],
    ['git rev-parse --short', ok('46a2656')],
    ['git status --short', ok('')],
    ['git rev-list', ok('0\t0')],
    ['gh run list', ok(JSON.stringify([{ headSha: '46a2656', status: 'completed', conclusion: 'success', databaseId: 1 }]))],
    ['git describe', no('fatal: No names found')],
    ['gh release view', FORGE],
    ['git merge-base --is-ancestor', ok('')],
    [`git diff --name-only ${RELEASED_SHA}..HEAD`, ok('plugin/bin/adr-verify')],
  ])))
  assert.match(out, /changed in 1 file\(s\) since v2\.85\.0 — §13/)
})

test('without `gh` the anchor is local, and the line SAYS the anchor is local', () => {
  // ADR-005 on the anchor itself: "the newest tag this clone knows" and "the
  // newest release" are different observations and must not print alike. Most
  // adopters live here — no gh, no GitHub, or no releases cut at all.
  const out = render(collect(runner(STALE_LOCAL_TAG)))
  assert.match(out, /changed in 2 file\(s\) since v2\.81\.0, the newest tag THIS CLONE knows/)
  assert.match(out, /a release tagged on the forge would not be here/)
})

test('a targetCommitish that is a branch name is refused, not diffed against', () => {
  // THE ARM THAT WOULD FAIL SILENTLY AND FLATTER. `targetCommitish` is a branch
  // name for a release cut from a branch; `git diff main..HEAD` is empty on main,
  // so accepting it would report "nothing unreleased" for ever. Only 40 hex.
  assert.equal(releaseAnchor(runner([
    ['gh release view', ok(JSON.stringify({ tagName: 'v2.85.0', targetCommitish: 'main' }))],
    ['git merge-base --is-ancestor', ok('')],
  ])), null)
})

test('a release that is not an ancestor of HEAD is refused, not anchored on', () => {
  // EXISTING IS NOT ANCESTRY, and the old guard (`cat-file -e`) only proved the
  // first. A fetched release branch satisfies it, and a diff from a commit HEAD
  // does not descend from answers a question nobody asked.
  assert.equal(releaseAnchor(runner([
    ['gh release view', FORGE],
    ['git merge-base --is-ancestor', no('')],
  ])), null)
})

test('a draft or prerelease is not what shipped, so it is not the anchor', () => {
  const view = extra => runner([
    ['gh release view', ok(JSON.stringify({
      tagName: 'v2.86.0-rc1', targetCommitish: RELEASED_SHA, isDraft: false, isPrerelease: false, ...extra,
    }))],
    ['git merge-base --is-ancestor', ok('')],
  ])
  assert.equal(releaseAnchor(view({ isDraft: true })), null)
  assert.equal(releaseAnchor(view({ isPrerelease: true })), null)
  // Shown accepting the published one in the same test, or refusing everything
  // would satisfy both assertions above (CLAUDE.md §4).
  assert.equal(releaseAnchor(view({}))?.name, 'v2.86.0-rc1')
})

test('an answer that is not an answer leaves the anchor local', () => {
  assert.equal(releaseAnchor(runner([['gh release view', no('gh: command not found')]])), null)
  assert.equal(releaseAnchor(runner([['gh release view', ok('not json')]])), null)
  assert.equal(releaseAnchor(runner([
    ['gh release view', ok(`{"targetCommitish":"${RELEASED_SHA}"}`)],
    ['git merge-base --is-ancestor', ok('')],
  ])), null, 'a release with no tagName names nothing')
})
