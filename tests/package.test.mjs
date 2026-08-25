import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
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
    assert.notEqual(statSync(path).mode & 0o111, 0, `${gate} must be executable`)
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
  assert.equal(manifest.version, '2.1.1')
  assert.equal(manifest.license, 'MIT')
  assert.ok(statSync(join(root, 'tests', 'classify.test.mjs')).isFile())

  const hooks = JSON.parse(readFileSync(join(root, 'hooks', 'hooks.json'), 'utf8'))
  const post = hooks.hooks.PostToolUse.flatMap(group => group.hooks)
  assert.ok(post.every(hook => hook.command === 'node'))
  assert.ok(post.every(hook => hook.args?.[0] === '${CLAUDE_PLUGIN_ROOT}/scripts/run-shell-hook.mjs'))
  assert.ok(post.some(hook => hook.args?.includes('facts-gate-dispatch.sh')))
  assert.ok(post.some(hook => hook.args?.includes('post-edit-check.sh')))

  const attributes = readFileSync(join(root, '.gitattributes'), 'utf8')
  assert.match(attributes, /^\*\.sh text eol=lf$/m)
  assert.match(attributes, /^\*\.mjs text eol=lf$/m)
  assert.match(attributes, /^bin\/\* text eol=lf$/m)

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

  for (const script of ['selftest.sh', 'coverage.sh']) {
    const path = join(root, 'scripts', script)
    assert.ok(statSync(path).isFile(), script)
    assert.notEqual(statSync(path).mode & 0o111, 0, `${script} must be executable`)
  }

  // The self-test must not report a clean run when a check it names was
  // skipped — the verdict line carries the distinction.
  const selftest = readFileSync(join(root, 'scripts', 'selftest.sh'), 'utf8')
  assert.match(selftest, /SKIPPED —/)
  assert.match(selftest, /PARTIAL —/)
})
