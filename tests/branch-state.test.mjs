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
  // `gh` is asked only where a remote names a GitHub host (issue #12), so a
  // fixture that omits this models a GitLab checkout rather than a GitHub one.
  ['git config --get-regexp', ok('remote.origin.url git@github.com:D3-lt/quality-harness.git')],
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
test('shell pins the language, because the reader matches git\'s own words', () => {
  // `NO_TAGS` tells "positively no tags" from "could not read the tags" by
  // matching git's diagnostic, and git LOCALISES it — so without this pin an
  // untagged repository under any other locale falls through to could-not-look
  // and is told so on every prompt for ever (BACKLOG §152 behind a language
  // barrier). Named by a seventh review round. Asserted on `shell` itself, at the
  // seam that sets it, rather than on a caller that would pass either way.
  const read = shell([process.execPath, '-e', 'process.stdout.write(process.env.LC_ALL ?? "unset")'])
  assert.equal(read.ok, true, read.note)
  assert.equal(read.out, 'C', 'git must speak the language the regexes are written in')
})

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
  ['git config --get-regexp', ok('remote.origin.url git@github.com:D3-lt/quality-harness.git')],
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

// GitHub issue #12, reported 2026-09-07 from a self-hosted GitLab remote on
// Windows 11 / Git Bash, quality-harness 2.85.0: the UserPromptSubmit hook was
// KILLED BY ITS HOST at 20s on three consecutive prompts. Two independent causes,
// and each is enough on its own.
test('`gh` is not asked where no remote names a GitHub host', () => {
  // Measured by the reporter in their checkout: 4,214ms merely to fail with
  // "none of the git remotes configured for this repository point to a known
  // GitHub host" — and in a live session it did not fail fast, it consumed the
  // whole collection budget. The discriminator is local and needs no network.
  const asked = []
  const spy = table => argv => { asked.push(argv.join(' ')); return runner(table)(argv) }
  const gitlab = [...GIT_CLEAN.filter(([p]) => !p.startsWith('git config')),
    ['git config --get-regexp', ok('remote.origin.url git@git.eleving.com:webxx/ocr-ms.git')]]

  const out = render(collect(spy(gitlab)), { brief: true })
  assert.equal(asked.some(a => a.startsWith('gh ')), false,
    `gh was asked about a repository it cannot answer for:\n${asked.join('\n')}`)
  // And it SAYS the question was not put, rather than implying it was asked and
  // came back empty (ADR-005).
  assert.match(out, /no remote names a GitHub host, so `gh` was not asked/)
  assert.match(out, /NOT a green branch; an unknown one/, 'still not a clean bill')

  // The other direction in the same test: a GitHub remote IS asked (CLAUDE.md §4).
  const askedGh = []
  const spy2 = table => argv => { askedGh.push(argv.join(' ')); return runner(table)(argv) }
  render(collect(spy2([...GIT_CLEAN,
    ['gh run list', ok(JSON.stringify([{ headSha: '0a18d04ff', status: 'completed', conclusion: 'success', databaseId: 1 }]))]])))
  assert.equal(askedGh.some(a => a.startsWith('gh run list')), true)

  // ⚠ AND A LOOKUP THAT COULD NOT BE MADE IS NOT A REPOSITORY WITHOUT A GITHUB
  // REMOTE. `git config --get-regexp` exits 1 when nothing matched, which is a
  // real answer; a spent budget or an absent git is not. Rendering both as "no
  // remote names a GitHub host" would be ADR-005 broken by the fix for issue #12.
  const blind = render(collect(runner([...GIT_CLEAN.filter(([p]) => !p.startsWith('git config')),
    ['git config --get-regexp', no('spawnSync git ETIMEDOUT')]])), { brief: true })
  assert.match(blind, /the remotes could not be read \(spawnSync git ETIMEDOUT\)/)
  assert.doesNotMatch(blind, /no remote names a GitHub host/,
    'could-not-look must not borrow the vocabulary of an answer')

  // The other direction, in the same test: exit 1 IS the answer "nothing matched",
  // and it keeps its own words rather than being demoted to could-not-look.
  const none = render(collect(runner([...GIT_CLEAN.filter(([p]) => !p.startsWith('git config')),
    ['git config --get-regexp', { ok: false, out: '', status: 1, note: '' }]])), { brief: true })
  assert.match(none, /no remote names a GitHub host/)
  assert.doesNotMatch(none, /could not be read/)
})

test('the git half is cached BEFORE the network half is attempted', () => {
  // `write` ran only after `gather` returned, so a run the HOST killed left no
  // cache entry at all and the next prompt re-paid in full — three consecutive
  // 20s timeouts, none cheaper than the last. A completed slow run caches its own
  // COULD NOT LOOK; a killed one cached nothing, which is the case that needed
  // the backoff most.
  const writes = []
  const state = cached(120, {
    read: () => null,
    write: payload => writes.push(payload.state),
    now: () => 1000,
    // Stands in for a run killed during the network half: it checkpoints, then
    // never returns.
    gather: checkpoint => {
      checkpoint({ looked: true, branch: 'main', head: 'abc1234', dirty: 0, ahead: 0, behind: 0,
        ci: { looked: false, note: 'this answer was stored before the CI half was gathered' },
        tag: null, shippedSinceTag: null, releaseBlocked: 'stored before the release half was read' })
      return { looked: true, branch: 'main', head: 'abc1234', dirty: 0, ahead: 0, behind: 0,
        ci: { looked: true, sha: 'abc1234', status: 'completed', conclusion: 'success', failed: [] },
        tag: 'v1.0.0', shippedSinceTag: 0, releaseBlocked: null }
    },
  })
  assert.equal(writes.length, 2, 'the checkpoint and the final answer are both persisted')
  assert.equal(writes[0].branch, 'main', 'the git half survives a kill during the network half')
  assert.equal(writes[0].ci.looked, false, 'and the checkpoint does not pretend it has a CI answer')
  assert.equal(usableCache({ at: 1000, state: writes[0] }, 2000), true,
    'a checkpoint must be readable as a cache, or it buys no backoff at all')
  assert.equal(state.state.ci.looked, true, 'the caller still gets the FULL answer, not the checkpoint')
  assert.equal(writes[1].ci.looked, true, 'and the full answer replaces the checkpoint')
})

test('collect checkpoints the git half BEFORE it spawns gh, and the next prompt reads it', () => {
  // Asserted where the mechanism lives. A checkpoint taken AFTER the network call
  // buys nothing, because the network call is the one that gets killed — and the
  // previous test for this drove a hand-written `gather`, which exercised the
  // forwarding in `cached` and nothing at all about `collect`'s ordering.
  const log = []
  const table = [...GIT_CLEAN,
    ['gh run list', ok(JSON.stringify([{ headSha: '0a18d04ff', status: 'completed', conclusion: 'success', databaseId: 1 }]))]]
  const spy = argv => { log.push(argv.join(' ')); return runner(table)(argv) }

  collect(spy, () => log.push('CHECKPOINT'))
  const mark = log.indexOf('CHECKPOINT')
  const network = log.findIndex(c => c.startsWith('gh run list'))
  assert.notEqual(mark, -1, 'collect must checkpoint at all')
  assert.notEqual(network, -1, 'and this fixture must actually reach the network call')
  assert.ok(mark < network, `the checkpoint must precede the network call:\n${log.join('\n')}`)

  // And now the second prompt, for real: a first run killed during the network
  // half, then an actual `cached()` read that must not gather again.
  let store = null
  assert.throws(() => cached(120, {
    read: () => null,
    write: payload => { store = payload },
    now: () => 1000,
    gather: checkpoint => { collect(spy, checkpoint); throw new Error('the host killed the hook') },
  }), /the host killed the hook/)
  assert.ok(store, 'a killed run must leave a cache entry behind, or it buys no backoff at all')

  let gathered = 0
  const second = cached(120, {
    read: () => store,
    write: () => {},
    now: () => 21_000,
    gather: () => { gathered += 1; return {} },
  })
  assert.equal(gathered, 0, 'the second prompt must not re-pay for the run that was killed')
  assert.equal(second.fromCache, true)

  // A floor, never a clean bill: what it serves says what it does not know.
  const out = render(second.state, { brief: true })
  assert.match(out, /COULD NOT LOOK/)
  assert.match(out, /stored before the CI half was gathered/)
  assert.match(out, /main @ 0a18d04/, 'while the git half — the half a session reads — survives')
})
