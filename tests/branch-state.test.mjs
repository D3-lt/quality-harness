// CLAUDE.md §15 — the session-start reader, and the arms that must not look alike.
//
// The incident this comes from is one where every check was correct and nobody
// read the failing one (BACKLOG §126), so what matters here is that the reader
// DISTINGUISHES: green, red, still-running and could-not-look are four answers,
// and three of them are not a clean bill. Every arm is driven through the `run`
// seam, so this test needs no network, no remote and no `gh` (CLAUDE.md §7, §9).
import assert from 'node:assert/strict'
import test from 'node:test'

import { budgeted, cached, collect, gitDir, render, shell, usableCache } from '../plugin/scripts/branch-state.mjs'

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
  // ⚠ AND IT IS MARKED, not merely failed. The release line distinguishes "the
  // question could not be put" from "there is nothing to release", and a spent
  // budget is the first — but only if the refusal carries something structural to
  // branch on. Asserted HERE, on `budgeted` itself: the render test that covers
  // the COULD NOT LOOK line injects its own runner, so it exercises the flag and
  // not the code that sets it. That gap showed up as a GREEN mutant.
  assert.equal(spent.budget, true, 'a prevented command must be distinguishable from one that answered no')
  const answered = budgeted(15_000, () => ({ ok: false, out: '', note: 'gh: not found' }), () => 0)(['gh'])
  assert.equal(answered.budget, undefined, 'a command that RAN and failed is not a budget refusal')
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

// BACKLOG §157 — the release line, which had no test at all until 2026-09-07,
// which is how it came to print a false conclusion on every prompt for four
// releases: "plugin/ changed in 8 file(s) since v2.81.0 — a green shipped change
// is released, not parked", while HEAD WAS the newest release. `git describe`
// reads LOCAL refs and `gh release create` tags the remote, so the machine that
// cuts the releases is the one whose anchor goes stale.
//
// ⚠ The first fix asked the forge. It worked, and five review rounds each found a
// real defect in classifying how `gh` can fail. The shipped answer states what
// this reader can OBSERVE and names what it cannot — see the collector's comment.
const RELEASE_PENDING = [
  ['git rev-parse --abbrev-ref', ok('main')],
  ['git rev-parse --short', ok('46a2656')],
  ['git status --short', ok('')],
  ['git rev-list', ok('0\t0')],
  ['gh run list', ok(JSON.stringify([{ headSha: '46a2656', status: 'completed', conclusion: 'success', databaseId: 1 }]))],
  ['git describe', ok('v2.81.0')],
  ['git diff --name-only v2.81.0..HEAD', ok('plugin/.claude-plugin/plugin.json\nplugin/bin/adr-lint')],
]

test('the release line NAMES its anchor as local and points at the check', () => {
  const out = render(collect(runner(RELEASE_PENDING)), { brief: true })
  // ⚠ THE WORDING IS THE PRODUCT HERE, so it is asserted precisely. A first
  // replacement said "the newest tag THIS CLONE holds" and that a forge release
  // "is not here" — both claims this reader cannot make. `git describe --tags
  // --abbrev=0` establishes the newest tag REACHABLE FROM HEAD and nothing about
  // the forge at all. Named by a sixth review round, on the sentence written to
  // fix an overclaim.
  assert.match(out, /changed in 2 file\(s\) since v2\.81\.0, the newest tag reachable from HEAD in this clone/)
  assert.match(out, /a forge release MAY NOT be tagged here/)
  assert.match(out, /gh release view/, 'the reader cannot answer this; it must say who can')
  // The sentence that was FALSE for four releases must not come back. A count
  // from a local tag is not evidence that anything is unreleased.
  assert.doesNotMatch(out, /a green shipped change is released, not parked/,
    `the reader asserted a conclusion it cannot observe:\n${out}`)

  // Shown able to answer the other way in the same test (CLAUDE.md §4): nothing
  // changed under plugin/ means the line does not appear at all.
  const quiet = render(collect(runner([...RELEASE_PENDING.slice(0, 6),
    ['git diff --name-only v2.81.0..HEAD', ok('')]])), { brief: true })
  assert.doesNotMatch(quiet, /changed in/, `an unchanged plugin has nothing to say:\n${quiet}`)
})

test('a spent budget says COULD NOT LOOK, it does not say nothing to release', () => {
  // `shippedSinceTag` is null for a diff that never ran and 0 for one that ran and
  // found nothing, and the render printed nothing for both — so a collection
  // budget spent on the CI calls produced a clean, green, entirely silent report
  // on a branch with unreleased work. Probed by a different-lineage review with a
  // slow `gh` rather than argued about, and it is the one finding from the forge
  // version that outlived it.
  const out = render(collect(argv => {
    if (argv[0] === 'git' && (argv[1] === 'describe' || argv[1] === 'diff')) {
      return { ok: false, out: '', budget: true, note: 'budget of 8000ms spent' }
    }
    return runner(RELEASE_PENDING)(argv)
  }), { brief: true })
  assert.match(out, /COULD NOT LOOK at the release state/, `a spent budget read as clean:\n${out}`)
  assert.match(out, /not "nothing to release"/)

  // And a diff that FAILED for a reason that is not the budget says so too.
  const failed = render(collect(runner([...RELEASE_PENDING.slice(0, 6),
    ['git diff --name-only v2.81.0..HEAD', no('fatal: bad revision')]])), { brief: true })
  assert.match(failed, /COULD NOT LOOK at the release state/)
})

test('a clone with no tags at all is silent, not uncertain', () => {
  // There is genuinely nothing to compare against, and §152 is about advice that
  // fires every run: a repository that has never tagged must not be told so on
  // every prompt for its whole life.
  const out = render(collect(runner([...RELEASE_PENDING.slice(0, 5),
    ['git describe', no('fatal: No names found, cannot describe anything.')]])), { brief: true })
  assert.doesNotMatch(out, /COULD NOT LOOK at the release state/, `an untagged repository was shouted at:\n${out}`)
  assert.doesNotMatch(out, /changed in/)
})

test('a `git describe` that FAILED is not a repository with no tags', () => {
  // Only the budget arm was checked, so a permission error, a corrupt ref and a
  // transient failure were all silence — the same honesty defect as the diff path,
  // in the line above it. `No names found` is git POSITIVELY saying there is
  // nothing to describe; anything else is a question this could not put.
  const out = render(collect(runner([...RELEASE_PENDING.slice(0, 5),
    ['git describe', no('fatal: not a git repository: .git/refs')]])), { brief: true })
  assert.match(out, /COULD NOT LOOK at the release state/, `a failed describe read as untagged:\n${out}`)
  assert.match(out, /the newest tag could not be read/)
})
