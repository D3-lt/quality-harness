// ADR-120 T15: the spec gate skips a path git marks `linguist-generated` or the project lists in `"ignore"`, and gates the
// same spec anywhere else. A generated spec is not authored, so a structure finding about it has no author to act on it.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { runArtifactGates } from './helpers/node-hooks/artifact-pass.mjs'
import { resolveBashExecutable } from '../plugin/scripts/run-shell-hook.mjs'

const dispatcher = join(resolve(dirname(fileURLToPath(import.meta.url)), '..'), 'plugin', 'scripts', 'facts-gate-dispatch.sh')
const BROKEN = '# Broken spec\n\n## Facts\n\n## Grill Log\n'

// A repository holding the same broken spec at every path given, with the attributes and config as given.
function fixture({ paths, attributes = '', config = null }) {
  const dir = realpathSync.native(mkdtempSync(join(os.tmpdir(), 'qh-specignore-')))
  const init = spawnSync('git', ['init', '-q'], { cwd: dir, encoding: 'utf8', timeout: 10_000, windowsHide: true })
  assert.equal(init.status, 0, init.stderr)
  for (const rel of paths) {
    mkdirSync(join(dir, dirname(rel)), { recursive: true })
    writeFileSync(join(dir, rel), BROKEN)
  }
  if (attributes) writeFileSync(join(dir, '.gitattributes'), attributes)
  if (config !== null) writeFileSync(join(dir, '.quality-harness.json'), typeof config === 'string' ? config : JSON.stringify(config))
  return dir
}

test('a generated or ignored spec is not gated, and the same spec elsewhere still is', () => {
  const bash = resolveBashExecutable()
  assert.ok(bash, 'bash is needed to run the dispatcher')
  const paths = ['docs/specs/own.md', 'docs/specs/gen/made.md', 'docs/specs/upstream/theirs.md', 'docs/specs/literal.md',
    'docs/specs/notgen/kept.md', 'docs/specs/off/kept.md']
  const dir = fixture({
    paths,
    attributes: 'docs/specs/gen/** linguist-generated\ndocs/specs/notgen/** -linguist-generated\ndocs/specs/off/** linguist-generated=false\n',
    config: { ignore: ['docs/specs/upstream/*', 'docs/specs/literal.md'] },
  })
  try {
    const gate = rel => runArtifactGates([join(dir, rel)], dir)
    // Dirty: the same broken spec, outside every rule, is gated.
    for (const rel of ['docs/specs/own.md', 'docs/specs/notgen/kept.md', 'docs/specs/off/kept.md']) {
      const said = gate(rel)
      assert.match(String(said), /spec-verify --draft is not satisfied for /, `${rel} must still be gated:\n${said}`)
    }
    // Clean: marked generated, listed by glob, listed by literal path.
    for (const rel of ['docs/specs/gen/made.md', 'docs/specs/upstream/theirs.md', 'docs/specs/literal.md']) {
      assert.equal(gate(rel), null, `${rel} is skipped`)
    }
    // Per edit as well: the dispatcher itself says nothing about a skipped spec, and gates its twin.
    const edit = rel => spawnSync(bash, [dispatcher, join(dir, rel), 'PostToolUse'], { encoding: 'utf8', timeout: 60_000 })
    const skipped = edit('docs/specs/gen/made.md')
    assert.equal(`${skipped.stdout}${skipped.stderr}`, '')
    assert.match(edit('docs/specs/own.md').stdout, /spec-verify --draft is not satisfied yet/)
  } finally { rmSync(dir, { recursive: true, force: true }) }

  // A declaration that could hide code is refused whole and said, and nothing is skipped by it (CLAUDE.md §16).
  for (const config of [{ ignore: ['**'] }, { ignore: 'docs/specs/upstream/*' }, { ignore: [] }]) {
    const refused = fixture({ paths: ['docs/specs/upstream/theirs.md'], config })
    try {
      const said = String(runArtifactGates([join(refused, 'docs/specs/upstream/theirs.md')], refused))
      assert.match(said, /spec-verify --draft is not satisfied for /, `${JSON.stringify(config)}: still gated\n${said}`)
      assert.match(said, /UNPROVEN: the `ignore` declaration in \.quality-harness\.json was ignored/, `${JSON.stringify(config)}: the refusal is said\n${said}`)
    } finally { rmSync(refused, { recursive: true, force: true }) }
  }
})
