import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const testDir = dirname(fileURLToPath(import.meta.url))
/** Every file git tracks — the exact set `source: "."` publishes. */
function tracked() {
  return spawnSync('git', ['-C', root, 'ls-files'], { encoding: 'utf8' })
    .stdout.split('\n').filter(Boolean)
}

const root = resolve(testDir, '..')

const skills = [
  'adr-execute', 'adr-retire', 'adr-write', 'arch-write', 'codex-advise',
  'codex-review', 'execution', 'mutation-audit', 'postmortem', 'quality-policy',
  'review', 'spec-write', 'work',
]
const gates = [
  'adr-debt', 'adr-judge', 'adr-lint', 'adr-next', 'adr-retire-check', 'adr-verify', 'arch-lint',
  'postmortem-verify', 'qh-root', 'spec-verify',
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
  const entry = spawnSync('git', ['-C', root, 'ls-files', '-s', '--', relative(root, path)], {
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
    try { text = readFileSync(join(root, file), 'utf8') } catch { continue }
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
  const textRoots = ['.claude-plugin', 'bin', 'hooks', 'scripts', 'skills', 'templates', 'tests', 'workflows']
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
    for (const path of filesBelow(join(root, directory))) {
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
  assert.equal(manifest.version, '2.26.0')
  assert.equal(manifest.license, 'MIT')
  assert.ok(statSync(join(root, 'tests', 'classify.test.mjs')).isFile())

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

  const attributes = readFileSync(join(root, '.gitattributes'), 'utf8')
  assert.match(attributes, /^\*\.sh text eol=lf$/m)
  assert.match(attributes, /^\*\.mjs text eol=lf$/m)
  assert.match(attributes, /^bin\/\* text eol=lf$/m)
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
  const workflow = readFileSync(join(root, '.github', 'workflows', 'selftest.yml'), 'utf8')
  assert.match(workflow, /bash scripts\/selftest\.sh/)
  assert.match(workflow, /bash scripts\/coverage\.sh/)
  // The mutation campaign is what measures whether the rest of these detect
  // anything. It ran only on a laptop until 2026-08-26, which made it the one
  // check in this repository that could silently stop being run.
  assert.match(workflow, /node scripts\/mutate\.mjs/)
  assert.match(workflow, /^ {2}mutations:$/m)
  assert.match(workflow, /QUALITY_HARNESS_COVERAGE_STRICT: '1'/)
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
    const path = join(root, 'scripts', script)
    assert.ok(statSync(path).isFile(), script)
    assert.ok(isExecutable(path), `${script} must be executable`)
  }

  // The self-test must not report a clean run when a check it names was
  // skipped — the verdict line carries the distinction.
  const selftest = readFileSync(join(root, 'scripts', 'selftest.sh'), 'utf8')
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
    modules = await Promise.all(['adr-state', 'adr-context', 'verify', 'mutate']
      .map(name => import(pathToFileURL(join(root, 'scripts', `${name}.mjs`)).href)))
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
  const catalogue = JSON.parse(readFileSync(join(root, 'tests', 'mutations.json'), 'utf8'))
  const counts = []
  for (const mutation of catalogue.mutations) {
    const path = join(root, mutation.file)
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
  const catalogue = JSON.parse(readFileSync(join(root, 'tests', 'mutations.json'), 'utf8')).mutations
  // Read from disk, both sides. A list kept beside the truth is a thing somebody
  // has to remember, which is how the standalone copies drifted for three weeks.
  // A dotless NAME is not a gate; a dotless FILE is. A stray directory in
  // bin/ satisfied the old test and made this fail on something nobody shipped.
  const gates = readdirSync(join(root, 'bin'), { withFileTypes: true })
    .filter(e => e.isFile() && !e.name.includes('.')).map(e => e.name).sort()
  assert.ok(gates.length >= 8, `expected the shipped gates, found ${gates.length}`)

  const covered = new Set(catalogue.map(entry => entry.file))
  const uncovered = (names, known) => names.filter(gate => !known.has(`bin/${gate}`))

  // The detector has to be shown capable of firing. Without this the check is
  // satisfied by a complete catalogue and by a predicate that returns nothing at
  // all — `adr-verify --mutant` proved it: replacing the filter with `[]` left
  // the fence GREEN, because an empty list equals an empty list. A gate that
  // cannot fail is the thing ADR-003 forbids, and it appeared in the task that
  // introduces the rule.
  assert.deepEqual(uncovered(['ghost-gate'], new Set(['bin/real-gate'])), ['ghost-gate'],
    'the check must be able to name an uncovered gate, or it asserts nothing')

  const bare = uncovered(gates, covered)
  // Name the gate. "expected 10 to be 11" makes the reader redo the enumeration
  // the test just did, which is how a failing check becomes a check people skip.
  assert.deepEqual(bare, [],
    `these gates ship with no mutation in tests/mutations.json: ${bare.join(', ')}. `
    + 'ADR-003 requires a gate to assert something a deleted line breaks; a gate nothing '
    + 'mutates has never been shown to assert anything at all.')

  // The `.cmd` shims are excluded deliberately: they forward and carry no logic,
  // and tests/standalone-link.test.mjs already asserts every gate has one.
  assert.ok(!covered.has('bin/adr-lint.cmd'), 'shims carry no logic and are not in this class')
})
