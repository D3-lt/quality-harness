import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const testDir = dirname(fileURLToPath(import.meta.url))
const root = resolve(testDir, '..')

const skills = [
  'adr-execute', 'adr-retire', 'adr-write', 'arch-write', 'codex-advise',
  'codex-review', 'execution', 'postmortem', 'quality-policy', 'review',
  'spec-write', 'work',
]
const gates = [
  'adr-debt', 'adr-lint', 'adr-next', 'adr-retire-check', 'adr-verify', 'arch-lint',
  'postmortem-verify', 'spec-verify',
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

test('the publishable plugin has no dependency on a personal install or retired package', () => {
  const textRoots = ['.claude-plugin', 'bin', 'hooks', 'scripts', 'skills', 'templates', 'tests', 'workflows']
  const forbidden = new RegExp([
    String.raw`~\/\.claude`,
    String.raw`\/Users\/zy`,
    ['adr', 'toolkit'].join('-'),
  ].join('|'))
  for (const directory of textRoots) {
    for (const path of filesBelow(join(root, directory))) {
      const text = readFileSync(path, 'utf8')
      assert.doesNotMatch(text, forbidden, path)
    }
  }
})

test('manifest and hook configuration expose the bundled components', () => {
  const manifest = JSON.parse(readFileSync(join(root, '.claude-plugin', 'plugin.json'), 'utf8'))
  assert.equal(manifest.name, 'quality-harness')
  assert.equal(manifest.version, '2.4.0')
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
