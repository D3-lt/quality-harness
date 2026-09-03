import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import test from 'node:test'
import { runPython } from '../scripts/python-interpreter.mjs'
import { fileURLToPath } from 'node:url'

const testDir = dirname(fileURLToPath(import.meta.url))
/** Every file git tracks — the exact set `source: "."` publishes. */
function tracked() {
  return spawnSync('git', ['-C', repoRoot, 'ls-files'], { encoding: 'utf8' })
    .stdout.split('\n').filter(Boolean)
}

/** The repository. `root` is the PLUGIN, which ADR-008 moved below it. */
const repoRoot = resolve(testDir, '..')
const root = join(repoRoot, 'plugin')

const skills = [
  'adr-execute', 'adr-retire', 'adr-write', 'arch-write', 'codex-advise',
  'codex-review', 'execution', 'mutation-audit', 'postmortem', 'quality-policy',
  'review', 'spec-write', 'work',
]
const gates = [
  'adr-debt', 'adr-judge', 'adr-lint', 'adr-next', 'adr-retire-check', 'adr-verify', 'arch-lint',
  'postmortem-verify', 'qh-mcp', 'qh-root', 'spec-verify',
]
const templates = [
  'adr-archive-readme-template.md', 'adr-template.md', 'architecture-template.md',
  'spec-template.md', 'task-template.md', 'tasks-readme-template.md',
]
const workflows = ['consensus.js', 'quality-cycle.js', 'review-ring.js']

// A Git for Windows checkout has no POSIX permission bits: statSync reports 0644
// for every file, so the mode check failed there while the shipped plugin was
// perfectly fine. What actually ships is the mode recorded in git's index, so on
// Windows ask git instead of the filesystem. The assertion is unchanged in
// substance — a gate that is not executable where it matters still fails.
function isExecutable(path) {
  if (process.platform !== 'win32') return (statSync(path).mode & 0o111) !== 0
  const entry = spawnSync('git', ['-C', repoRoot, 'ls-files', '-s', '--', relative(repoRoot, path)], {
    encoding: 'utf8',
  })
  return /^100755 /.test(entry.stdout)
}

function filesBelow(directory) {
  const files = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...filesBelow(path))
    else if (entry.isFile()) files.push(path)
  }
  return files
}

// ADR-008. `marketplace.json`'s `source` is the single thing that decides what a
// user downloads, so the shipped file set is read FROM it rather than from a list
// kept beside it — a list is what e95b0f9 pruned by hand, and 603 K of it grew
// back within two days because nothing checked.
//
// Both ends are named independently on purpose. Deriving the expected set from
// the manifest as well would pass against any tree at all, which is this
// repository's own signature defect (ADR-003, ADR-006).
test('what ships is the plugin and nothing else', () => {
  const marketplace = JSON.parse(readFileSync(join(repoRoot, '.claude-plugin', 'marketplace.json'), 'utf8'))
  const source = marketplace.plugins.find(entry => entry.name === 'quality-harness').source
  const shipRoot = resolve(repoRoot, source)

  assert.notEqual(shipRoot, repoRoot,
    'source names the repository root, so tests/ and docs/ ship to every user')

  const shipped = [
    '.claude-plugin/plugin.json', 'bin', 'evals', 'hooks', 'scripts', 'skills',
    'templates', 'workflows',
  ]
  for (const entry of shipped) assert.ok(existsSync(join(shipRoot, entry)), `${entry} must ship`)

  const withheld = ['tests', 'docs', '.github', 'README.md', 'LICENSE', '.claude-plugin/marketplace.json']
  for (const entry of withheld) assert.ok(!existsSync(join(shipRoot, entry)), `${entry} must not ship`)

  // Nothing may leak IN either: a test file committed under the plugin directory
  // fails here rather than reaching every user, which is the part a one-off
  // cleanup cannot do.
  const prefix = `${relative(repoRoot, shipRoot).split(sep).join('/')}/`
  for (const file of tracked()) {
    if (!file.startsWith(prefix)) continue
    const rest = file.slice(prefix.length)
    assert.ok(shipped.some(entry => rest === entry || rest.startsWith(`${entry}/`)),
      `${file} ships but is not part of the plugin`)
  }

  // The repository's own gates stay outside it: all three read tests/, which
  // does not ship, so shipping them would ship a command that cannot run.
  for (const gate of ['selftest.sh', 'coverage.sh', 'mutate.mjs']) {
    assert.ok(existsSync(join(repoRoot, 'scripts', gate)), `${gate} belongs to the repository`)
    assert.ok(!existsSync(join(shipRoot, 'scripts', gate)), `${gate} must not ship`)
  }

  // Two anchors that the move breaks silently. Asked of git rather than read out
  // of the files, because what matters is the answer git gives for the path as it
  // now stands: `evals/results/` was untracked this session after it carried a
  // personal home path into a public repository, and the Windows job depends on
  // the gates arriving with LF endings.
  const ignored = spawnSync('git', ['-C', repoRoot, 'check-ignore', '-q',
    join(shipRoot, 'evals', 'results', 'probe.json')])
  assert.equal(ignored.status, 0, 'eval results must stay ignored from their new path')
  const eol = spawnSync('git', ['-C', repoRoot, 'check-attr', 'eol', '--',
    join(shipRoot, 'bin', 'adr-lint')], { encoding: 'utf8' })
  assert.match(eol.stdout, /eol: lf$/m, 'the gates must keep LF endings from their new path')
})

// CLAUDE.md and AGENTS.md tell the next agent — and the next team — how to work
// here. Both are at the repository root and neither ships; they are about
// working IN this repository, not about using the plugin.
//
// Every repository path they name is checked, because an instruction file rots
// exactly the way a `Governs:` header does: silently, and only where somebody
// followed it. AGENTS.md is deliberately a pointer rather than a second copy —
// two copies drift, which this project has two accepted decisions about.
test('the instruction files name paths that exist', () => {
  const agents = readFileSync(join(repoRoot, 'AGENTS.md'), 'utf8')
  assert.match(agents, /\(CLAUDE\.md\)/, 'AGENTS.md must point at CLAUDE.md rather than copy it')

  // A backticked token that looks like a repository path: has a slash, no
  // spaces, and is not a URL or a command line. Deliberately narrow — this
  // checks the paths, and a false alarm here is a check people delete.
  const named = text => [...text.matchAll(/`([A-Za-z0-9_.][A-Za-z0-9_./-]*\/[A-Za-z0-9_./*-]*)`/g)]
    .map(hit => hit[1])
    .filter(path => !path.includes('://') && !path.includes('<'))
  // Resolved against what git TRACKS, not against this working tree. The first
  // version used existsSync and passed here while failing on CI: it named
  // `plugin/evals/results/`, which is gitignored, so it exists on the machine
  // that ran the evals and on no fresh checkout. A gate that reads the working
  // tree is a gate whose answer depends on who is asking — and the claim worth
  // making is about the repository anyway. A directory counts when it is the
  // prefix of a tracked file.
  // Tracked, plus untracked-but-not-ignored, which is what git would carry: a
  // file added in the same commit as the sentence naming it is legitimate, and a
  // gitignored one never is.
  const pending = spawnSync('git', ['-C', repoRoot, 'ls-files', '--others', '--exclude-standard'],
    { encoding: 'utf8' }).stdout.split('\n').filter(Boolean)
  const inRepo = new Set([...tracked(), ...pending])
  const exists = path => {
    const clean = path.replace(/\/?\*+$/, '').replace(/\/$/, '')
    return inRepo.has(clean) || [...inRepo].some(file => file.startsWith(`${clean}/`))
  }
  const missing = (text, label) => named(text).filter(path => !exists(path))
    .map(path => `${label}: ${path}`)

  // Shown able to fire first: with both files correct the assertion below is
  // `[] === []`, which is the vacuity ADR-003 forbids.
  assert.deepEqual(missing('see `no/such/path.md` here', 'probe'), ['probe: no/such/path.md'],
    'the check must be able to name a path that does not exist, or it asserts nothing')

  const gone = [...missing(readFileSync(join(repoRoot, 'CLAUDE.md'), 'utf8'), 'CLAUDE.md'),
                ...missing(agents, 'AGENTS.md')]
  assert.deepEqual(gone, [], `an instruction file names a path that no longer exists:\n  ${gone.join('\n  ')}`)
})

// BACKLOG §46. An acceptance fence must fail when its runner never starts, and
// the `… | tee X; ! grep …` form does not: the pipeline's exit status is tee's,
// `;` discards it, and the absent runner's message matches none of the grep
// patterns. Measured 2026-08-28 — `nosuchrunner --test x` exits 0 through that
// form and 127 through `set -o pipefail` and `&&`.
//
// adr-verify does not catch it either: scored_nothing() knows only a runner's
// own "nothing to run" vocabulary, and environment_failure() is consulted only
// when the exit code is already non-zero. So such a fence is recorded as a
// tool-written exit-0 claim, which is a hole in the anti-fabrication chain.
//
// This is a check on SHAPE, and this project normally rejects those (ADR-003).
// It earns the exception because the property is about the shell's exit-status
// plumbing rather than about behaviour: the fences here run real suites that
// pass, so no behavioural test over this corpus can distinguish the two forms.
// The behavioural half lives in `a fence whose runner never starts must fail`
// below, which runs both forms and asserts they differ.
test('no acceptance fence discards its runner exit status', () => {
  const offenders = []
  const check = (file, text) => {
    for (const fence of text.matchAll(/```bash\n([\s\S]*?)```/g)) {
      const body = fence[1]
      if (!body.includes('| tee ')) continue
      // `set -o pipefail` plus `&&` keeps the runner's status; `;` throws it away.
      if (!/set -o pipefail/.test(body) || /\|\s*tee\s+\S+\s*;/.test(body)) {
        offenders.push(file)
      }
    }
  }
  for (const file of tracked()) {
    if (!file.endsWith('.md')) continue
    if (!/docs\/adr\/.*\/tasks\/|templates\//.test(file)) continue
    const text = readFileSync(join(repoRoot, file), 'utf8')
    check(file, text)
    // And the RECOMMENDED form, wherever it is written. The template taught this
    // defect from an indented block rather than a ```bash fence, so the check
    // above could not see the one file that spread it to ten others.
    //
    // The log sections are EXEMPT, and that is not a loophole. A Verification or
    // Mutation Log entry quotes the command it actually ran; when a fence is
    // repaired the old entries keep naming the old command, because the log is
    // append-only and rewriting it is the fabrication this corpus exists to
    // prevent. Flagging recorded history would make the only correct response
    // an edit nobody is allowed to make.
    // TEMPLATES ONLY, and the narrowing is the finding. Prose cannot be told
    // apart from what it describes: a task file explaining "the `| tee X; !grep`
    // form returns 0" matches the same pattern as one recommending it, and a
    // Verification Log entry quotes the command it actually ran — append-only,
    // so the only way to satisfy a check over it is an edit nobody may make.
    // What must not teach the defect is the template every user receives.
    if (!file.startsWith('plugin/templates/')) continue
    for (const line of text.split('\n')) {
      if (/\|\s*tee\s+\S+\s*;/.test(line)) offenders.push(`${file} (recommends it)`)
    }
  }

  // Shown able to fire before it is trusted.
  const probe = []
  ;(() => {
    const saved = offenders.length
    check('probe', '```bash\nnode --test x 2>&1 | tee /tmp/o; ! grep -q FAIL /tmp/o\n```')
    probe.push(...offenders.splice(saved))
  })()
  assert.deepEqual(probe, ['probe'],
    'the check must be able to name a fence that discards its status, or it asserts nothing')

  assert.deepEqual(offenders, [],
    `these fences pass when their runner never starts (BACKLOG §46):\n  ${offenders.join('\n  ')}`)
})

test('a fence whose runner never starts must fail', () => {
  // The behavioural half: run both forms against a runner that does not exist.
  const out = join(mkdtempSync(join(tmpdir(), 'qh-fence-')), 'o')
  const broken = `nosuchrunner --test x 2>&1 | tee ${out}; ! grep -qE "no tests to run|^FAIL" ${out}`
  const fixed = `set -o pipefail\nnosuchrunner --test x 2>&1 | tee ${out} && ! grep -qE "no tests to run|^FAIL" ${out}`
  const run = f => spawnSync('bash', ['-c', f], { encoding: 'utf8' }).status
  assert.equal(run(broken), 0, 'the old form passes with the runner absent — that is the defect')
  assert.notEqual(run(fixed), 0, 'the form this project now uses does not')
})

test('the plugin contains the complete reusable decision lifecycle', () => {
  for (const skill of skills) {
    assert.ok(statSync(join(root, 'skills', skill, 'SKILL.md')).isFile(), skill)
  }
  for (const gate of gates) {
    const path = join(root, 'bin', gate)
    assert.ok(statSync(path).isFile(), gate)
    assert.ok(isExecutable(path), `${gate} must be executable`)
  }
  for (const template of templates) {
    assert.ok(statSync(join(root, 'templates', template)).isFile(), template)
  }
  for (const workflow of workflows) {
    assert.ok(statSync(join(root, 'workflows', workflow)).isFile(), workflow)
  }
})

test('shipped guidance teaches generated restore transactions', () => {
  const surfaces = [
    ['task template', readFileSync(join(root, 'templates', 'task-template.md'), 'utf8')],
    ['adr-execute skill', readFileSync(join(root, 'skills', 'adr-execute', 'SKILL.md'), 'utf8')],
  ]
  const nearEitherWay = (text, left, right, distance = 240) =>
    new RegExp(`(?:${left})[\\s\\S]{0,${distance}}(?:${right})|(?:${right})[\\s\\S]{0,${distance}}(?:${left})`, 'i')
      .test(text)

  for (const [label, text] of surfaces) {
    assert.match(text, /--also-restore\b/, `${label} does not expose the CLI option`)
    assert.ok(nearEitherWay(text, '--also-restore', 'repeat(?:able|ed)|once per|for each'),
      `${label} does not say --also-restore is repeatable`)
    assert.ok(nearEitherWay(text, 'Acceptance (?:command|fence)|recorded Acceptance',
      'materializ|generat|writ'),
    `${label} does not require the recorded Acceptance fence itself to materialize the output`)
    assert.match(text,
      /(?:does not|doesn't|never|no)\s+(?:infer|guess|auto.?detect)|(?:suffix|auto.?detect)[\s\S]{0,100}(?:not|never)/i,
      `${label} promises suffix inference or automatic discovery`)
    assert.ok(nearEitherWay(text, 'undeclared', 'not restor|never restor|outside (?:the )?transaction'),
      `${label} does not disclaim rollback of undeclared side effects`)
    assert.ok(nearEitherWay(text, 'interrupt|killed', 'unknown|changed')
      && nearEitherWay(text, 'unknown|changed', 'human|manual|reconcil'),
    `${label} does not reserve interrupted unknown bytes for human reconciliation`)
    assert.ok(nearEitherWay(text, 'declar(?:e|ing|ation)|--also-restore',
      'grant(?:s|ed)?|authori[sz](?:e|es|ed|ation)', 320),
    `${label} does not say declaration grants restore authority`)
    assert.ok(nearEitherWay(text, 'live\\s+(?:run|cleanup)|in-process\\s+(?:run|cleanup)', 'overwrit', 320)
      && nearEitherWay(text, 'live\\s+(?:run|cleanup)|in-process\\s+(?:run|cleanup)', 'delet', 320),
    `${label} does not warn that live cleanup may overwrite existing bytes and delete an absent-at-entry leaf`)
    assert.match(text, /concurrent(?:ly)?[\s-]*(?:edit|change|work)/i,
      `${label} does not name the concurrent-edit risk`)
    assert.ok(nearEitherWay(text, 'concurrent', 'overwrit|delet|discard|lost', 320),
      `${label} does not warn that live restore authority can destroy a concurrent edit`)
  }
})

/**
 * Sections whose BODY declares a closure that the HEADING never mentions.
 *
 * Returned rather than asserted so the same function can be shown finding one —
 * a check that only ever reports "clean" is a check nobody has seen work.
 */
function backlogHeadingsThatUndersell(text) {
  // The corpus's OWN closure vocabulary, widened 2026-09-02 after the case fix.
  // `Done` is the commonest spelling in this file by a wide margin — eleven
  // sections declared a closure with it, each naming the commit that did the
  // work, and the six-word list saw none of them. Same defect as the case
  // rule one vocabulary over: a gate whose words are not the corpus's words
  // reports clean over the thing it was written to find.
  const words = 'CLOSED|FIXED|DECIDED|WITHDRAWN|SUPERSEDED|RESOLVED|DONE|LANDED|SHIPPED|COMPLETE'
  // Case-INSENSITIVE on both sides, and the asymmetry it replaces was the defect:
  // the heading test below has always carried `i` while this one did not, so the
  // same six words were read under two different rules. The corpus writes its
  // bolded openers in sentence case — `**Fixed**`, `**Partly fixed.**`,
  // `**Closed — Windows is green**` — and never in caps, so the caps-only body
  // rule matched none of them. Measured 2026-09-02 over 103 sections: 0 findings
  // with 'm', 3 with 'mi', and all three were real (§17, §89, §91), each with a
  // bolded closure in the body and no marker in the heading.
  const declaresClosure = new RegExp(String.raw`^\s*\*\*(?:PARTLY\s+)?(?:${words})\b`, 'mi')
  const heading = /^##\s+(\d+)(?:\s*\(superseded\))?\.\s*(.+)$/gm
  const sections = [...text.matchAll(heading)]
  const found = []
  for (const [index, section] of sections.entries()) {
    const end = sections[index + 1]?.index ?? text.length
    const body = text.slice(section.index + section[0].length, end)
    // WORD-BOUNDED on the heading side. Unanchored, `unresolved` matches
    // RESOLVED and `incomplete` matches COMPLETE, so a section exempts itself by
    // accident of wording — §1 did exactly that ("one unresolved Bash path")
    // and hid a `**Done — a48c608**` body for weeks. Widening the vocabulary
    // made the trap bigger, which is how it was found.
    if (declaresClosure.test(body) && !new RegExp(`\\b(?:${words})\\b`, 'i').test(section[2])) {
      found.push(`§${section[1]} ${section[2].slice(0, 60)}`)
    }
  }
  return found
}

test('the backlog index does not undersell what the backlog says it finished', () => {
  // ONE DIRECTION ONLY, and the direction was chosen by enumerating rather than
  // by taste. The house style puts the status in the HEADING and does not repeat
  // it in the body: measured 2026-08-29 over 56 sections, a two-directional rule
  // flagged 7 correct entries (§26, §27, §28, §29, §31, §32, §34) whose headings
  // read "CLOSED …" with no marker in the prose below. A gate that fires on the
  // convention is a gate people switch off.
  //
  // What is left is the drift that actually happened, twice, and was fixed by
  // hand on 2026-08-29: §45's body said its mechanism had shipped in ADR-011
  // while its heading still described the open defect, and §46 carried "CLOSED
  // 2026-08-28" in its first line and nothing in its title. An index that
  // understates its own corpus sends the next session to re-do finished work —
  // this repository's `Governs:` rot, one document over.
  const backlog = readFileSync(join(repoRoot, 'docs', 'BACKLOG.md'), 'utf8')
  assert.deepEqual(backlogHeadingsThatUndersell(backlog), [],
    'these sections announce a closure in the body that their heading never mentions')

  // ...and it can say the other thing. Without this the assertion above passes
  // just as well against a checker that returns [] unconditionally, at full line
  // and branch coverage (CLAUDE.md §4).
  const drifted = '## 45. A `Governs:` path that names nothing is not reported\n\n'
    + '**CLOSED 2026-08-29 by ADR-011.** The lint resolves it now.\n'
  assert.deepEqual(backlogHeadingsThatUndersell(drifted),
    ['§45 A `Governs:` path that names nothing is not reported'],
    'the real §45, as it stood before the heading was corrected')

  // The corpus's OWN spelling, which is sentence case and never caps. Without
  // this the 'i' flag above is a free variable: every other fixture here is
  // written in caps, so dropping the flag leaves them all green while the three
  // real sections (§17 stale 8 days, §89 and §91 stale 3 each) go unseen again.
  const sentenceCase = '## 91. `resolve_bash()` returns the WindowsApps Store alias\n\n'
    + '**Fixed** by filtering WindowsApps exactly as System32 is filtered.\n'
  assert.deepEqual(backlogHeadingsThatUndersell(sentenceCase),
    ['§91 `resolve_bash()` returns the WindowsApps Store alias'],
    'the real §91, as it stood before its heading was corrected')

  // ...including the PARTLY form, which is how a half-closed entry announces
  // itself — §89's own body word for word.
  const partly = '## 89. `.gitattributes` pins `*.mjs` but not `*.js`\n\n**Partly fixed.**\n'
  assert.deepEqual(backlogHeadingsThatUndersell(partly),
    ['§89 `.gitattributes` pins `*.mjs` but not `*.js`'])

  // And the convention itself is not a finding, in both of its spellings.
  const conventional = '## 46. CLOSED 2026-08-28 — a fence that passed with no runner\n\n'
    + '**CLOSED 2026-08-28.** The template recommends pipefail now.\n'
    + '## 38. One of three closed 2026-08-28; the two runner questions stay open\n\n'
    + '**CLOSED 2026-08-28** for the first of them.\n'
  assert.deepEqual(backlogHeadingsThatUndersell(conventional), [])
})

test('every path an eval run writes to is ignored, wherever it is run from', () => {
  // CLAUDE.md §6 says eval results are never committed, and §1 says a .gitignore
  // rule that stops matching does not warn. Both fired together on 2026-09-02:
  // ADR-008 moved the plugin under `plugin/`, the ignore rule moved with it, and
  // `claude plugin eval .` run from the repo root still writes `./evals/results/`
  // — which was unignored and showed as `?? evals/`, one `git add -A` away from
  // committing transcripts and whatever corpus they were taken against.
  //
  // ASKED OF GIT, never read out of the file: what matters is the answer git
  // gives for the path, which is the same reason the line-ending test uses
  // `git check-attr` rather than reading .gitattributes.
  //
  // ⚠ AND THE PATTERN MUST NOT NEED THE DIRECTORY TO EXIST. Written first as
  // `evals/results/` — a trailing slash means "directory", and git can only know
  // a path is a directory if it is THERE. It passed here, where an eval run had
  // just created it, and failed on all four CI platforms where a fresh checkout
  // has no `evals/` at all. CLAUDE.md §8, committed inside a guard about
  // invisible state: a check whose answer depends on what is on your disk is not
  // a check. The bare paths below are the assertion that this stays true.
  for (const path of ['evals/results', 'plugin/evals/results',
    'evals/results/2026-01-01T00-00-00Z/report.html',
    'plugin/evals/results/2026-01-01T00-00-00Z/report.html']) {
    const asked = spawnSync('git', ['check-ignore', '-q', path], { cwd: repoRoot })
    assert.equal(asked.status, 0,
      `${path} is not ignored — an eval run writing there would be committable, and `
      + 'the results carry transcripts and another corpus\'s content (CLAUDE.md §6)')
  }
  // ...and the check is shown capable of the other answer, or it passes equally
  // against a `check-ignore` that always succeeds.
  const tracked = spawnSync('git', ['check-ignore', '-q', 'README.md'], { cwd: repoRoot })
  assert.notEqual(tracked.status, 0, 'a tracked file must not report as ignored')
})

test('the pre-commit hook refuses a commit taken mid-mutation, and only then', () => {
  // The moment-of-mistake guard for a defect that reached `main` TWICE on
  // 2026-09-02 and was then reproduced deliberately in a throwaway clone:
  // `unasserted.mjs` neuters one `errors.append(...)` at a time, and a
  // `git add -A` during that window commits a shipped gate with a finding
  // replaced by `pass`.
  //
  // It is invisible where anyone would look: the journal is gitignored so
  // `git status` reads normally, and the neutered gate is one more modified file
  // in a commit whose subject says "docs". The suite's sibling check catches it,
  // but a docs commit does not run the suite — which is exactly how both real
  // instances got through.
  //
  // DRIVEN, not read. Asserting the file contains a string would be the contract
  // test BACKLOG §80 is about; this runs the hook in a scratch repo and checks
  // what it does.
  const hook = join(repoRoot, '.githooks', 'pre-commit')
  assert.ok(existsSync(hook), 'the hook must exist to be installable')

  const scratch = mkdtempSync(join(tmpdir(), 'qh-hook-'))
  const run = () => spawnSync('bash', [hook], { cwd: scratch, encoding: 'utf8' })
  const git = (...args) => spawnSync('git', args, { cwd: scratch, encoding: 'utf8' })
  git('init', '-q', '-b', 'main', '.')

  // NOTHING IN FLIGHT: the hook must stay out of the way. Without this the
  // assertion below is satisfied by a hook that refuses every commit.
  assert.equal(run().status, 0, 'an honest tree must commit freely')

  for (const journal of ['.unasserted-inflight.json', '.mutate-inflight.json']) {
    writeFileSync(join(scratch, journal), JSON.stringify({ file: 'plugin/bin/adr-lint' }))
    const refused = run()
    assert.equal(refused.status, 1, `${journal} must refuse the commit`)
    assert.match(refused.stderr, /REFUSED/, journal)
    assert.match(refused.stderr, /plugin\/bin\/adr-lint/,
      'the refusal must name the file that is neutered right now, not just complain')
    rmSync(join(scratch, journal))
  }
  assert.equal(run().status, 0, 'and it stands down again once the journal is gone')
  rmSync(scratch, { recursive: true, force: true })
})

test('no mutation tool left a gate neutered in this tree', () => {
  // Learned the hard way 2026-09-02, twice in one hour. `scripts/unasserted.mjs`
  // neuters one `errors.append(...)` at a time and restores it; `git add -A`
  // during that window commits a SHIPPED GATE with a finding replaced by `pass`.
  // Two commits went out that way — different lines, because each `add -A`
  // caught a different moment of the sweep — and nothing complained, because a
  // neutered gate is valid Python that simply reports one thing less.
  //
  // Both tools journal before they edit, precisely so an interrupted run can be
  // repaired. That journal is therefore an exact signal that a mutation is in
  // flight and the tree must not be trusted, let alone committed.
  // ⚠ NOT while a mutation tool is legitimately running, which is its own trap.
  // Both tools write the journal and THEN run this suite to judge a mutant, so a
  // guard that fires on the journal alone deadlocks them: the sweep's baseline
  // fails, it refuses, and the journal it already wrote fails every later run
  // too. Caught 2026-09-02 by doing exactly that. The tools declare themselves.
  if (process.env.QUALITY_HARNESS_MUTATION_IN_FLIGHT === '1') return
  for (const journal of ['.unasserted-inflight.json', '.mutate-inflight.json']) {
    assert.ok(!existsSync(join(repoRoot, journal)),
      `${journal} exists, so a mutation tool is mid-run or was killed: this tree has a gate `
      + 'neutered right now. Re-run that tool to restore, or `git checkout --` the file it names. '
      + 'Do NOT commit — a committed `pass` where a finding was is a gate that silently stopped '
      + 'reporting.')
  }
})

test('every catalogue mutant still parses, so a kill is behavioural', () => {
  // BACKLOG §102. A mutant that does not PARSE is counted RED: the suite dies at
  // import, mutate.mjs reads a non-zero exit, and the entry joins the
  // `N/N noticed` headline having asserted nothing. It proves the file is fed to
  // a parser, which was never in doubt.
  //
  // The precedent already points this way — this repository decided an
  // abnormally terminated mutant is INCONCLUSIVE rather than killed, because a
  // false survivor costs a rerun while a false kill permanently credits proof
  // nobody observed. A syntax-error mutant credits exactly that.
  //
  // Fixed here as an AUTHORING defect rather than a new verdict class, which is
  // what §102 argued was the smaller change: a mutant is supposed to change
  // BEHAVIOUR, and one changing only syntax tests nothing. That also leaves the
  // campaign's exit code and its headline meaning what they always did.
  //
  // §102 measured one such entry; by the time this landed there were two, which
  // is why it is a check and not a one-time cleanup.
  const catalogue = JSON.parse(readFileSync(join(repoRoot, 'tests', 'mutations.json'), 'utf8'))
  const unparseable = []
  for (const entry of catalogue.mutations) {
    const target = join(repoRoot, entry.file)
    if (!existsSync(target)) continue
    const source = readFileSync(target, 'utf8')
    if (source.split(entry.from).length - 1 !== 1) continue
    const mutated = source.replace(entry.from, entry.to)
    const isJs = /\.(mjs|js)$/.test(entry.file)
    const isPy = entry.file.startsWith('plugin/bin/') || entry.file.endsWith('.py')
    if (!isJs && !isPy) continue
    const scratch = join(mkdtempSync(join(tmpdir(), 'qh-parse-')), isJs ? 'm.mjs' : 'm.py')
    writeFileSync(scratch, mutated)
    const check = isJs
      ? spawnSync(process.execPath, ['--check', scratch], { encoding: 'utf8' })
      : runPython(['-c', `import ast,sys;ast.parse(open(sys.argv[1],encoding="utf-8").read())`, scratch],
        { encoding: 'utf8' })
    if (check.status !== 0) unparseable.push(entry.label)
  }
  assert.deepEqual(unparseable, [],
    'these mutants do not parse, so their RED says the file reached a parser and nothing more')
})

test('nothing tracked in this repository names a personal filesystem path', () => {
  // Everything here SHIPS. `marketplace.json` says `"source": "."`, so the
  // plugin is the whole repository and every tracked file lands in every user's
  // plugin cache. A path under someone's home directory is a leak into a public
  // repo, and it is never legitimate anywhere — not in code, not in prose, and
  // not in a measurement artefact.
  //
  // Found 2026-08-28: 18 committed eval results carried the author's home path,
  // and the gate below — written for exactly this string — could not see them,
  // because its roots list does not include `evals`. A gate for a leak that
  // cannot look where the leak is.
  //
  // Deliberately SEPARATE from the dependency check below, and deliberately
  // wider. The two forbid different things for different reasons: the home
  // config directory is a DEPENDENCY concern, and it is legitimately discussed
  // in docs/ — five ADR and backlog lines describe the defects it caused, which
  // is why that check keeps its narrow roots. A personal path is never
  // discussed, only leaked.
  // A FIXTURE path is not a leak. `/Users/dev/` in a test is the point of the
  // test; `/Users/<a real person>/` in a measurement artefact is the defect.
  // The allowlist is short and obvious on purpose — anything not on it is
  // treated as somebody's real home directory, which is the safe direction here
  // (a false alarm costs one rename; a miss ships to every user).
  const SYNTHETIC = new Set(['dev', 'someone', 'example', 'user', 'test', 'you', 'me', 'alice', 'bob'])
  const personal = /\/(?:Users|home)\/([A-Za-z][A-Za-z0-9._-]*)\//g
  const named = text => [...text.matchAll(personal)]
    .map(hit => hit[1]).filter(name => !SYNTHETIC.has(name.toLowerCase()))
  const offenders = []
  for (const file of tracked()) {
    if (/\.(png|jpg|jpeg|gif|ico|pdf|zip|woff2?)$/i.test(file)) continue
    let text
    try { text = readFileSync(join(repoRoot, file), 'utf8') } catch { continue }
    for (const name of new Set(named(text))) offenders.push(`${file}: /Users/${name}/`)
  }
  // Shown able to fire before it is trusted: with a clean tree the assertion
  // below is `[] === []`, which is exactly the vacuity ADR-003 forbids.
  // Both directions, assembled at runtime so this probe is not itself a tracked
  // personal path. Without the first line the check passes on a clean tree AND
  // on a broken pattern — the vacuity ADR-003 forbids; without the second it
  // would fail forever on the repository's own fixtures.
  const home = name => `const p = "/${'Users'}/${name}/x"`
  assert.deepEqual(named(home('zaphod')), ['zaphod'],
    'the check must be able to name a real home path, or it asserts nothing')
  assert.deepEqual(named(home('dev')), [], 'a synthetic fixture path is not a leak')
  assert.deepEqual(offenders, [], `a personal path ships to every user:\n  ${offenders.join('\n  ')}`)
})

test('the publishable plugin has no dependency on a personal install or retired package', () => {
  // ADR-008 put the product under `plugin/` and left the repository's own gates
  // and tests above it. Both sides are swept: the rule is about what this
  // project may depend on, not only about what it publishes.
  const textRoots = [
    ...['.claude-plugin', 'bin', 'hooks', 'scripts', 'skills', 'templates', 'workflows']
      .map(name => join(root, name)),
    ...['scripts', 'tests'].map(name => join(repoRoot, name)),
  ]
  const forbidden = new RegExp([
    String.raw`~\/\.claude`,
    String.raw`\/Users\/zy`,
    ['adr', 'toolkit'].join('-'),
  ].join('|'))
  // shadowInstallNotice READS the standalone install under the user's home to
  // warn that a stale copy is answering instead of the plugin. That is the
  // opposite of depending on one — a plugin that cannot name the copy shadowing
  // it leaves the user debugging a false alarm for a session, which is what
  // happened on 2026-08-26. It builds those paths from os.homedir() rather than
  // writing one down, and the second assertion holds the line that matters:
  // nothing is ever EXECUTED from there.
  for (const directory of textRoots) {
    for (const path of filesBelow(directory)) {
      const text = readFileSync(path, 'utf8')
      assert.doesNotMatch(text, forbidden, path)
      // Never EXECUTED from there, only compared.
      assert.doesNotMatch(text, /(?:spawnSync|execFile|exec)\([^)]*\.claude[\\/](?:bin|hooks)/, path)
    }
  }
})

test('manifest and hook configuration expose the bundled components', () => {
  const manifest = JSON.parse(readFileSync(join(root, '.claude-plugin', 'plugin.json'), 'utf8'))
  assert.equal(manifest.name, 'quality-harness')
  // The SHAPE, not the number. A literal here is a second place to edit at every
  // release that asserts nothing the manifest does not already say — the exact
  // "list kept beside the truth" this project rejects everywhere else, and it
  // made 2.29.0 fail its own suite for no reason. Semver is what actually has to
  // hold: the installer orders cached versions with it.
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/, 'the plugin version must be semver')
  assert.equal(manifest.license, 'MIT')
  assert.ok(statSync(join(repoRoot, 'tests', 'classify.test.mjs')).isFile())

  const hooks = JSON.parse(readFileSync(join(root, 'hooks', 'hooks.json'), 'utf8'))
  const post = hooks.hooks.PostToolUse.flatMap(group => group.hooks)
  assert.ok(post.every(hook => hook.command === 'node'))
  assert.ok(post.every(hook => hook.args?.[0] === '${CLAUDE_PLUGIN_ROOT}/scripts/run-shell-hook.mjs'))
  assert.ok(post.some(hook => hook.args?.includes('facts-gate-dispatch.sh')))
  assert.ok(post.some(hook => hook.args?.includes('post-edit-check.sh')))

  // Every event lifecycle.mjs handles must actually be declared, or the handler
  // is dead in production while its tests stay green. SubagentStart was the one
  // nothing had ever fired.
  for (const event of ['SessionStart', 'SubagentStart', 'SubagentStop', 'Stop', 'TaskCompleted', 'PreToolUse']) {
    const declared = (hooks.hooks[event] ?? []).flatMap(group => group.hooks)
    assert.ok(declared.length > 0, `${event} is handled but not declared`)
    assert.ok(declared.some(hook => hook.args?.some(arg => arg.endsWith('lifecycle.mjs'))),
      `${event} must be routed to lifecycle.mjs`)
  }

  // Windows cannot run a `#!` script, and an extensionless file has no
  // association there — PowerShell offers to pick an application for it and cmd
  // reports nothing at all. Reported live on 2026-08-26: `/adr-write` on Windows
  // ran adr-debt and got a file-open dialog. PATHEXT includes .CMD, so a shim
  // beside each gate makes the documented `adr-debt docs/adr` resolve.
  for (const gate of gates) {
    const shim = join(root, 'bin', `${gate}.cmd`)
    assert.ok(statSync(shim).isFile(), `${gate} has no Windows shim`)
    const text = readFileSync(shim, 'utf8')
    // The py launcher first: a Windows Python is `python.exe`, so `python3` —
    // the name the shebang asks for — often does not exist there.
    assert.match(text, /where \/q py/, gate)
    assert.match(text, new RegExp(`%~dp0${gate}`), gate)
    // cmd needs CRLF; a shim checked out with LF fails in confusing ways.
    assert.match(text, /\r\n/, `${gate}.cmd must use CRLF`)
  }

  const attributes = readFileSync(join(repoRoot, '.gitattributes'), 'utf8')
  assert.match(attributes, /^\*\.sh text eol=lf$/m)
  assert.match(attributes, /^\*\.mjs text eol=lf$/m)
  assert.match(attributes, /^plugin\/bin\/\* text eol=lf$/m)
  // The skills and templates are parsed by the gates and asserted on by this
  // suite; a CRLF checkout on Windows broke a multi-line regex in a SKILL.md.
  assert.match(attributes, /^\*\.md text eol=lf$/m)
  assert.match(attributes, /^\*\.cmd text eol=crlf$/m)

  const codexReview = readFileSync(join(root, 'skills', 'codex-review', 'SKILL.md'), 'utf8')
  assert.match(codexReview, /advertise `review \[OPTIONS\] \[PROMPT\]`[\s\S]*reject an actual selector-plus-prompt/)
  assert.match(codexReview, /exec <optional-ignore-user-config>[\s\S]*-o "<absolute-unique-output>" \\\n\s+"CODEX-REVIEW-LEAF:/)
  assert.doesNotMatch(codexReview, /\n\s+review <--uncommitted\|--commit SHA\|--base REF>/)
})

test('continuous integration runs the checks this repository owns', () => {
  // A CI file that drifts away from the project's own gate is decoration. These
  // assertions bind the workflow to the scripts a human runs, so deleting or
  // renaming either breaks the suite rather than quietly un-gating the branch.
  const workflow = readFileSync(join(repoRoot, '.github', 'workflows', 'selftest.yml'), 'utf8')
  assert.match(workflow, /bash scripts\/selftest\.sh/)
  assert.match(workflow, /bash scripts\/coverage\.sh/)
  // The mutation campaign is what measures whether the rest of these detect
  // anything. It ran only on a laptop until 2026-08-26, which made it the one
  // check in this repository that could silently stop being run.
  assert.match(workflow, /node scripts\/mutate\.mjs/)
  assert.match(workflow, /^ {2}mutations:$/m)
  // ADR-023 T1. The shard count appears in THREE places — the job name, the
  // matrix list, and the `--shard i/n` argument — and a job named `x/8` running
  // `--shard x/4` silently skips half the catalogue while reporting success.
  // Derived from the file rather than hardcoded, so raising the count again is
  // one edit and this still checks that the three agree.
  const shardName = workflow.match(/^ {4}name: mutations \$\{\{ matrix\.shard \}\}\/(\d+)$/m)
  const shardArg = workflow.match(/--shard \$\{\{ matrix\.shard \}\}\/(\d+)/)
  const shardList = workflow.match(/^ {8}shard: \[([\d, ]+)\]$/m)
  assert.ok(shardName && shardArg && shardList, 'the mutation job must name its shard count in all three places')
  const declared = Number(shardName[1])
  assert.equal(Number(shardArg[1]), declared, 'the --shard argument disagrees with the job name')
  assert.equal(shardList[1].split(',').length, declared, 'the matrix has a different number of shards than the job name claims')
  assert.deepEqual(shardList[1].split(',').map(s => Number(s.trim())),
    Array.from({ length: declared }, (_, i) => i + 1),
    'the matrix must list every shard from 1 to n exactly once — a gap drops entries silently')
  assert.match(workflow, /QUALITY_HARNESS_COVERAGE_STRICT: '1'/)
  // ADR-023 T3. Reuse is for iteration and never for a released artifact: a tag
  // and `main` must pass --no-cache so the campaign measures every entry. This
  // is the line that SELECTS the full run, and without it T2's reuse silently
  // applies to releases — a tag partly evidenced by verdicts taken elsewhere.
  // Both refs are named, because a condition matching neither permits reuse
  // everywhere and still looks like a guard.
  const forced = workflow.match(/mutate\.mjs --shard \$\{\{ matrix\.shard \}\}\/\d+ --no-cache/)?.[0] ?? ''
  assert.match(forced, /--no-cache/, 'the mutation job must be able to force a full campaign')
  const condition = workflow.match(/QUALITY_HARNESS_FULL_CAMPAIGN: [^\n]*/)?.[0] ?? ''
  assert.match(condition, /refs\/tags\//, 'a tag must force a full campaign')
  assert.match(condition, /refs\/heads\/main/, 'main must force a full campaign')
  // Pull requests must be covered; a workflow that only runs on push to main
  // reports regressions after they land.
  assert.match(workflow, /^\s{2}pull_request:/m)
  // CI answered on 2026-08-25 that `claude plugin validate` needs no credentials,
  // so the self-test must not be allowed to skip it there. Exactly one job may
  // still be informational — windows — and a second `continue-on-error` would
  // mean a check quietly stopped gating.
  assert.match(workflow, /QUALITY_HARNESS_REQUIRE_CLI: '1'/)
  // Every job gates now. A `continue-on-error` reappearing means a check went
  // back to reporting instead of blocking, which is the state this project spent
  // the whole Windows exercise leaving.
  assert.equal((workflow.match(/^\s*continue-on-error: true$/gm) ?? []).length, 0)
  assert.match(workflow, /^ {2}windows:$/m)
  // Requiring the CLI in a job that never installs it is how both selftest jobs
  // went red on b144d22: the flag is a promise the job has to keep. Checked per
  // job, because the install living in a *different* job is exactly the mistake.
  const jobs = workflow.split(/^ {2}(?=[A-Za-z][\w-]*:$)/m).slice(1)
  for (const job of jobs) {
    if (!job.includes('QUALITY_HARNESS_REQUIRE_CLI')) continue
    assert.match(job, /npm install -g @anthropic-ai\/claude-code/,
      `${job.split('\n', 1)[0]} requires the CLI but never installs it`)
  }

  for (const script of ['selftest.sh', 'coverage.sh']) {
    const path = join(repoRoot, 'scripts', script)
    assert.ok(statSync(path).isFile(), script)
    assert.ok(isExecutable(path), `${script} must be executable`)
  }

  // The self-test must not report a clean run when a check it names was
  // skipped — the verdict line carries the distinction.
  const selftest = readFileSync(join(repoRoot, 'scripts', 'selftest.sh'), 'utf8')
  assert.match(selftest, /SKIPPED —/)
  assert.match(selftest, /PARTIAL —/)
})

test('importing a script runs its CLI on nobody', async () => {
  // BACKLOG §27. Four scripts ran their whole CLI at module scope, so importing
  // one — to test it, or from any tool walking the directory — executed it.
  // scripts/verify.mjs was the sharp one: it SPAWNED whatever command the
  // ambient process.argv named. mutate.mjs was the expensive one: its verdict
  // logic had no test for its entire life precisely because nothing could import
  // it without starting a campaign.
  //
  // Asserted by importing for real. A comment saying "guarded" is not a guard,
  // and this is the check that fails if a fifth script is added without one.
  const written = []
  const stdout = process.stdout.write.bind(process.stdout)
  const stderr = process.stderr.write.bind(process.stderr)
  process.stdout.write = chunk => { written.push(String(chunk)); return true }
  process.stderr.write = chunk => { written.push(String(chunk)); return true }
  let modules
  try {
    // mutate.mjs stayed at the repository root when ADR-008 moved the product:
    // it reads tests/mutations.json, which does not ship.
    modules = await Promise.all([
      ...['adr-state', 'adr-context', 'verify'].map(name => join(root, 'scripts', `${name}.mjs`)),
      join(repoRoot, 'scripts', 'mutate.mjs'),
    ].map(file => import(pathToFileURL(file).href)))
  } finally {
    process.stdout.write = stdout
    process.stderr.write = stderr
  }
  assert.deepEqual(written, [], `importing a script wrote output:\n${written.join('')}`)
  // And each one still offers the CLI it used to run — guarded, not deleted.
  for (const module of modules) assert.equal(typeof module.main, 'function')
})

test('every catalogue entry still matches the source it mutates, exactly once', () => {
  // A mutation whose `from` no longer appears replaces nothing, the suite passes,
  // and the runner reports STALE — a verdict that is NOT a kill but sits in a
  // campaign summary next to 201 that are. Found 2026-08-28: refactoring away a
  // branch left `link: Windows falls back to a copy for a file symlink` matching
  // zero times, and the only signal was "201/202 mutations were noticed" at the
  // end of a 37-minute run whose per-case lines had already scrolled past.
  //
  // The runner cannot answer this any sooner — it learns the count by applying
  // each mutation in turn. Reading it off the tree costs milliseconds, so the
  // same defect surfaces in the suite instead of at the end of the campaign.
  const catalogue = JSON.parse(readFileSync(join(repoRoot, 'tests', 'mutations.json'), 'utf8'))
  const counts = []
  for (const mutation of catalogue.mutations) {
    const path = join(repoRoot, mutation.file)
    const text = existsSync(path) ? readFileSync(path, 'utf8') : null
    counts.push({
      label: mutation.label,
      file: mutation.file,
      matches: text === null ? 'file missing' : text.split(mutation.from).length - 1,
    })
  }
  // Shown capable of firing before it is trusted, the way ADR-003's own gate had
  // to be: with a fully-matching catalogue, a predicate that returns nothing is
  // indistinguishable from one that finds nothing wrong.
  assert.deepEqual(
    [{ label: 'demo', file: 'x', matches: 0 }].filter(entry => entry.matches !== 1),
    [{ label: 'demo', file: 'x', matches: 0 }],
    'the check must be able to name a stale entry, or it asserts nothing',
  )
  // The enumeration itself, not just the predicate over it. `mutate.mjs --case`
  // reported GREEN on 2026-08-28 with the loop emptied: no entries read, so no
  // stale entries found, so the assertion below passed with the check gutted.
  // The guard above survived it too, because a hardcoded literal proves the
  // FILTER can fire and says nothing about what was fed to it. Same shape as
  // ADR-003 T1's first version, in the test written to enforce ADR-003.
  assert.equal(counts.length, catalogue.mutations.length,
    'every catalogue entry must be read, or this asserts something about a shorter list')
  assert.ok(counts.length > 50, `expected the shipped catalogue, read ${counts.length}`)

  const stale = counts.filter(entry => entry.matches !== 1)
  assert.deepEqual(stale, [], `these mutations no longer target one place:\n${
    stale.map(e => `  ${e.label} — ${e.file} matches ${e.matches}x`).join('\n')}`)
})

// Fourth instance of one class: a text literal that is secretly an assertion
// about the operating system. A catalogue entry whose `from` embeds a newline
// matches nothing on a CRLF checkout, so the campaign reports STALE — on
// Windows only, where nobody develops. Found by CI on 2026-08-28 for a mutation
// on `.gitignore`, which no rule in `.gitattributes` covered; every source file
// was already covered by `*.sh`, `*.md`, `*.mjs` or `plugin/bin/*`, and the
// dotfiles were the gap.
//
// Asked of git rather than read out of `.gitattributes`, so what is checked is
// the answer git actually gives for the path.
test('a mutation that matches across lines targets a file git checks out with LF', () => {
  const catalogue = JSON.parse(readFileSync(join(repoRoot, 'tests', 'mutations.json'), 'utf8')).mutations
  const eolOf = file => spawnSync('git', ['-C', repoRoot, 'check-attr', 'eol', '--', file],
    { encoding: 'utf8' }).stdout.trim().split(': ').pop()

  const risky = files => files.filter(file => eolOf(file) !== 'lf')

  // Shown able to fire before it is trusted: with every file attributed, the
  // assertion below is `[] === []` — the vacuity ADR-003 forbids. `LICENSE` has
  // no eol rule and is not meant to.
  assert.deepEqual(risky(['LICENSE']), ['LICENSE'],
    'the check must be able to name an unattributed file, or it asserts nothing')

  const multiline = [...new Set(catalogue
    .filter(entry => entry.from.includes('\n') || entry.to.includes('\n'))
    .map(entry => entry.file))]
  assert.ok(multiline.length > 0, 'expected some catalogue entries to match across lines')
  const exposed = risky(multiline)
  assert.deepEqual(exposed, [],
    `these files are mutated across a line boundary but git may check them out with CRLF, so the `
    + `campaign goes STALE on Windows only: ${exposed.join(', ')}`)
})

// Asked of git, never read out of `.gitattributes`: what matters is the answer
// git gives for the path, and a rule that stops matching does not warn.
test('code that ships is checked out LF whatever its extension', () => {
  // `*.mjs` was pinned and `*.js` was not, so plugin/scripts/*.mjs arrived LF on
  // Windows while plugin/workflows/*.js arrived CRLF — same repository, same kind
  // of code, opposite checkout. Measured 2026-08-30 on a Windows 11 box with
  // core.autocrlf=true, which is the Git-for-Windows default and therefore what a
  // contributor gets. The hazard is not today's behaviour; it is that anyone
  // seeing .mjs pinned will assume .js is, and §1 records four things that break
  // silently when a file moves — an unpinned extension is a fifth.
  const eolOf = file => spawnSync('git', ['-C', repoRoot, 'check-attr', 'eol', '--', file],
    { encoding: 'utf8' }).stdout.trim().split(': ').pop()

  // Shown able to fire first, or the assertion below is `[] === []`. LICENSE has
  // no eol rule and is deliberately not meant to.
  assert.equal(eolOf('LICENSE'), 'unspecified',
    'the check must be able to see an unattributed file, or it asserts nothing')

  // Every tracked file whose extension implies executable source. Resolved
  // against `git ls-files`, not the working tree: a check whose answer depends on
  // what is on this disk is not a check (§8).
  const tracked = spawnSync('git', ['-C', repoRoot, 'ls-files'], { encoding: 'utf8' })
    .stdout.split('\n').filter(Boolean)
  const source = tracked.filter(file => /\.(js|mjs|py|sh)$/.test(file))
  assert.ok(source.length > 0, 'expected tracked source files to check')

  const crlfRisk = source.filter(file => eolOf(file) !== 'lf')
  assert.deepEqual(crlfRisk, [],
    'these ship as source but git may hand them to a Windows checkout with CRLF: '
    + crlfRisk.join(', '))

  // The parity that was actually missing, stated so it cannot regress quietly.
  assert.equal(eolOf('plugin/workflows/consensus.js'), eolOf('plugin/scripts/lifecycle.mjs'),
    '.js and .mjs must be checked out the same way')
})

test('every shipped gate carries at least one mutation', () => {
  // ADR-003: a gate asserts behaviour, not shape. The floor beneath that rule is
  // that somebody wrote a mutation for each gate at all — and until this test the
  // invariant held across all ten by accident, with nothing asserting it. That is
  // the same shape as every defect this corpus was built to catch: a property
  // that is true, useful, and unguarded.
  //
  // A COUNT IS ITSELF A SHAPE CHECK and one entry satisfies it. This says only
  // "somebody wrote a mutation for this gate"; whether it is noticed is what
  // `scripts/mutate.mjs` answers by reporting RED or GREEN, and that campaign is
  // the real assertion. Claiming more here would be the swap ADR-003 forbids.
  const catalogue = JSON.parse(readFileSync(join(repoRoot, 'tests', 'mutations.json'), 'utf8')).mutations
  // Read from disk, both sides. A list kept beside the truth is a thing somebody
  // has to remember, which is how the standalone copies drifted for three weeks.
  // A dotless NAME is not a gate; a dotless FILE is. A stray directory in
  // bin/ satisfied the old test and made this fail on something nobody shipped.
  const gates = readdirSync(join(root, 'bin'), { withFileTypes: true })
    .filter(e => e.isFile() && !e.name.includes('.')).map(e => e.name).sort()
  assert.ok(gates.length >= 8, `expected the shipped gates, found ${gates.length}`)

  const covered = new Set(catalogue.map(entry => entry.file))
  // Catalogue paths are repository-relative, and ADR-008 moved bin/ under the
  // plugin. Derived rather than written down, so the prefix cannot be the thing
  // that rots the next time the boundary moves.
  const binPrefix = `${relative(repoRoot, join(root, 'bin')).split(sep).join('/')}/`
  const uncovered = (names, known) => names.filter(gate => !known.has(`${binPrefix}${gate}`))

  // The detector has to be shown capable of firing. Without this the check is
  // satisfied by a complete catalogue and by a predicate that returns nothing at
  // all — `adr-verify --mutant` proved it: replacing the filter with `[]` left
  // the fence GREEN, because an empty list equals an empty list. A gate that
  // cannot fail is the thing ADR-003 forbids, and it appeared in the task that
  // introduces the rule.
  assert.deepEqual(uncovered(['ghost-gate'], new Set([`${binPrefix}real-gate`])), ['ghost-gate'],
    'the check must be able to name an uncovered gate, or it asserts nothing')

  // SHIPPED SCRIPTS TOO, and from the INDEX rather than the disk. The scope was
  // bin/ alone, and plugin/scripts/ ships executable logic as well -- including
  // post-edit-check.sh, a PostToolUse hook that runs after EVERY Edit/Write. It
  // carried no mutation and no behavioural test, and this check could not see it.
  //
  // Three escape hatches went with the first version of the widening and a review
  // named all three: a >= 60 line threshold nothing asserted, an extension list
  // that admitted .sh and .mjs only, and readdirSync, which answers "is this on
  // THIS machine" rather than "is this in the repository" (CLAUDE.md §8).
  //
  // So: every tracked file under plugin/scripts/, recursively, whatever its
  // extension. Trivial forwarders are named EXPLICITLY below rather than excluded
  // by a rule, because a rule is what a new file slips through.
  const shippedScripts = spawnSync('git', ['ls-files', '--', 'plugin/scripts'],
    { cwd: repoRoot, encoding: 'utf8' })
  assert.equal(shippedScripts.status, 0, 'git must list the shipped scripts')
  const scriptPaths = shippedScripts.stdout.split('\n').filter(Boolean)
  assert.ok(scriptPaths.length >= 5, `expected the shipped scripts, found ${scriptPaths.length}`)

  // A forwarder has no behaviour to assert. Each entry is a claim someone can
  // check, and a file that stops being trivial has to be removed from the list
  // deliberately -- which is the point.
  const trivial = new Set([])
  const bareScripts = scriptPaths.filter(p => !covered.has(p) && !trivial.has(p))
  // Shown capable of naming one, for the same reason the bin/ predicate is.
  assert.deepEqual(['plugin/scripts/ghost.sh'].filter(p => !new Set(['plugin/scripts/real.sh']).has(p)),
    ['plugin/scripts/ghost.sh'], 'the scripts predicate must be able to name an uncovered script')
  assert.deepEqual(bareScripts, [],
    `these shipped scripts carry no mutation in tests/mutations.json: ${bareScripts.join(', ')}. `
    + 'A shipped script nothing mutates has never been shown to assert anything, and a hook that '
    + 'runs on every edit is the last place that should be true. If one is a trivial forwarder, '
    + 'name it in `trivial` above with the reason.')

  const bare = uncovered(gates, covered)
  // Name the gate. "expected 10 to be 11" makes the reader redo the enumeration
  // the test just did, which is how a failing check becomes a check people skip.
  assert.deepEqual(bare, [],
    `these gates ship with no mutation in tests/mutations.json: ${bare.join(', ')}. `
    + 'ADR-003 requires a gate to assert something a deleted line breaks; a gate nothing '
    + 'mutates has never been shown to assert anything at all.')

  // The `.cmd` shims are excluded deliberately: they forward and carry no logic,
  // and tests/standalone-link.test.mjs already asserts every gate has one.
  assert.ok(!covered.has(`${binPrefix}adr-lint.cmd`), 'shims carry no logic and are not in this class')
})

test('the README names every skill and gate this plugin ships', () => {
  // A feature list kept BESIDE the truth is a thing somebody has to remember, and
  // this one had stopped being remembered: measured 2026-09-01, nine shipped
  // components appeared nowhere in it — the `mutation-audit` skill, four gates
  // (`adr-judge`, `adr-next`, `qh-mcp`, `qh-root`) and three corpus readers.
  // Same class as the hand-written SHADOW_SCOPE that missed `workflows`, and the
  // fix is the same shape: derive the expectation from what ships.
  //
  // README, not the plugin: this file never ships (ADR-008), which is exactly why
  // nothing else checks it.
  const readme = readFileSync(join(repoRoot, 'README.md'), 'utf8')
  const shipped = readdirSync(join(root, 'skills'), { withFileTypes: true })
    .filter(entry => entry.isDirectory()).map(entry => entry.name)
  const gates = readdirSync(join(root, 'bin'), { withFileTypes: true })
    .filter(entry => entry.isFile() && !entry.name.endsWith('.cmd'))
    .map(entry => entry.name)

  const missing = [...shipped, ...gates].filter(name => !readme.includes(name))
  assert.deepEqual(missing, [],
    `these ship and the README never names them: ${missing.join(', ')}`)

  // And the list must be shown able to be wrong, or it passes for any README that
  // happens to contain a lot of words (CLAUDE.md §4).
  assert.ok(!readme.includes('adr-nonexistent-gate'),
    'the check reads the real README rather than a fixture')
  assert.ok(shipped.length > 5 && gates.length > 5,
    `the expectation must be derived from a real tree: ${shipped.length}/${gates.length}`)
})

// ADR-025 T2. The saving T1 makes available is only taken if the skill stops
// prescribing the second run, and the exceptions have to be named with it — a
// sentence that reads as "you can skip validating" would remove a check rather
// than a duplicate.
test('adr-execute says the mutation pass already records the verification entry', () => {
  const skill = readFileSync(join(root, 'skills', 'adr-execute', 'SKILL.md'), 'utf8')
  assert.match(skill, /--mutant[\s\S]{0,400}?records? (?:the|its) [Vv]erification [Ll]og entry/,
    'the skill must say the mutation pass records the verification entry')
  // Both exceptions, or the advice is read as "one run is enough, always".
  assert.match(skill, /Red step[\s\S]{0,300}?(?:different tree|own run)/,
    'the Red step keeps its own run — it is taken on a different tree')
  assert.match(skill, /no mutation to record[\s\S]{0,200}?adr-verify/,
    'a task with no mutation still runs adr-verify on its own')
})

test('a CLI entry guard resolves on Windows, not only where argv is already a URL path', () => {
  // Found 2026-09-03 by the Windows job, and the symptom was the worst kind:
  // `scripts/backlog-claim-sweep.mjs` exited 0 having printed NOTHING, and the
  // only evidence was an empty string in an assertion message.
  //
  // `import.meta.url` is `file:///D:/a/repo/scripts/x.mjs` on Windows while
  // `process.argv[1]` is `D:\a\repo\scripts\x.mjs`, so a `file://${argv}`
  // template never matches, `main()` never runs, and the script reports a clean
  // exit for work it did not do. Six root scripts carried it, including
  // `release-evidence.mjs` — the gate that clears a release — and the three the
  // README tells a reader to re-derive its published numbers with.
  //
  // Derived from `git ls-files`, never from a hand-kept list, so a new script
  // cannot reintroduce it unnoticed (the same rule as the shipped-surface sweep
  // above).
  const guarded = tracked().filter(f => f.endsWith('.mjs'))
    .map(f => ({ file: f, text: readFileSync(join(repoRoot, f), 'utf8') }))
    .filter(({ text }) => text.includes('process.argv[1]') && text.includes('import.meta.url'))

  // A bare `file://` + argv template. `new URL('file://' + argv).href` is fine —
  // measured: it normalises the separators and the drive to the same href
  // `import.meta.url` carries — and so is `pathToFileURL`.
  const broken = guarded.filter(({ text }) => /===\s*`file:\/\/\$\{process\.argv\[1\]\}`/.test(text))
  assert.deepEqual(broken.map(b => b.file), [],
    'these compare import.meta.url against a raw path and are inert on Windows')

  // Shown able to be wrong, or it passes for a repository with no CLI at all.
  assert.ok(guarded.length > 5,
    `the sweep must have found real entry guards to judge: ${guarded.length}`)
  // ASSEMBLED, not written out: a literal of the broken form in this file makes
  // the sweep above flag its own test, which it duly did on the first run.
  const brokenForm = ['if (import.meta.url === `file://', '${process', '.argv[1]}`) main()'].join('')
  assert.match(brokenForm, /===\s*`file:\/\/\$\{process\.argv\[1\]\}`/,
    'the detector must still recognise the broken form it was written for')
})
