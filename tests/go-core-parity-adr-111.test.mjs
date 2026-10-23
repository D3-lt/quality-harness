// ADR-113 T1: the Go core says what the Node path says about ADR-111's rules. The hook-boundary half is the tests that already
// drive those rules (tests/baseline.test.mjs, tests/adr-108.test.mjs, the goldens), run under QUALITY_HARNESS_HOOK_IMPL=go with
// nothing skipped. This file holds what they cannot reach: the lists of what Go lacks are empty, and the check a directory
// infers, ADR-111 T1's pytest sections among them, is the same from `qh check-command` as from checkCommandOrigin.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { remove } from './helpers/remove.mjs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { checkCommandOrigin } from '../plugin/scripts/check-command.mjs'
import { GO_GOLDENS, GO_LACKS, goSkipFor } from './hook-golden.mjs'
import { required } from './helpers/require.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const coreDir = path.resolve(here, '..', 'core')
const goVersion = spawnSync('go', ['version'], { encoding: 'utf8', timeout: 30_000, windowsHide: true })
const noGo = required('go', !process.env.QUALITY_HARNESS_QH_BIN && (goVersion.error || goVersion.status !== 0)
  ? `go is not on PATH (${goVersion.error?.code ?? `exit ${goVersion.status}`}), so the Go core cannot be built here` : false)

// Every directory shape a rung answers, each beside the shape that must answer otherwise.
const PYTEST = '[tool.pytest.ini_options]\n'
const SHAPES = {
  'pyproject section': { 'pyproject.toml': `[project]\nname = "x"\n\n${PYTEST}addopts = "-q"\n` },
  'setup.cfg section': { 'setup.cfg': '[metadata]\nname = x\n\n[tool:pytest]\ntestpaths = tests\n' },
  'delimiter in a comment': { 'pyproject.toml': `# an example delimiter """\n${PYTEST}` },
  'delimiter in a literal string': { 'pyproject.toml': `[project]\nnote = 'has """ inside'\n${PYTEST}` },
  'literal delimiter in a basic string': { 'pyproject.toml': `[project]\nnote = "has ''' inside"\n${PYTEST}` },
  'delimiter after an escaped quote': { 'pyproject.toml': `[project]\nnote = "a \\" ''' b"\n${PYTEST}` },
  'multi-line string closed on its line': { 'pyproject.toml': `[project]\ndescription = """one line"""\n${PYTEST}` },
  'no pytest section': { 'pyproject.toml': '[project]\nname = "x"\n' },
  'setup.cfg without one': { 'setup.cfg': '[metadata]\nname = x\n' },
  'header in a comment': { 'pyproject.toml': `# ${PYTEST.trim()} is configured elsewhere\n[project]\n` },
  'header in a string': { 'pyproject.toml': `[project]\ndescription = "see ${PYTEST.trim()}"\n` },
  'header mid-line': { 'setup.cfg': '[metadata]\nlong = uses [tool:pytest] upstream\n' },
  'inside a multi-line string': { 'pyproject.toml': `[project]\ndescription = """\n${PYTEST}"""\n` },
  'inside a literal multi-line string': { 'pyproject.toml': `[project]\nreadme = '''\n${PYTEST}'''\n` },
  'an INI continuation value': { 'setup.cfg': '[metadata]\nlong_description =\n    [tool:pytest]\n' },
  'an escaped quote inside a multi-line string': { 'pyproject.toml': `[project]\nx = """\na \\""" still inside\n${PYTEST}"""\n` },
  'declared': { '.quality-harness.json': '{"check":"sh check.sh"}\n' },
  'declared constant success': { '.quality-harness.json': '{"check":"true"}\n' },
  'unreadable declaration': { '.quality-harness.json': '{"check":"sh check.sh",}\n' },
  'a script of its own': { 'scripts/selftest.sh': 'exit 0\n' },
  'nothing at all': {},
}

function qhBinary(t) {
  if (process.env.QUALITY_HARNESS_QH_BIN) return process.env.QUALITY_HARNESS_QH_BIN
  const out = mkdtempSync(path.join(os.tmpdir(), 'qh-adr111-bin-'))
  t.after(() => remove(out))
  const bin = path.join(out, process.platform === 'win32' ? 'qh.exe' : 'qh')
  const built = spawnSync('go', ['build', '-o', bin, './cmd/qh'], { cwd: coreDir, encoding: 'utf8', timeout: 300_000, windowsHide: true })
  assert.equal(built.status, 0, `the Go core did not build:\n${built.stderr}`)
  return bin
}

test('the Go core says what the Node path says about ADR-111\'s rules', { skip: noGo }, t => {
  // The lists are empty, and a name in one would skip its test: that is what an empty list is evidence about.
  assert.deepEqual([...GO_LACKS.keys()], [], 'the Go core lacks no rule the Node path has')
  assert.deepEqual([...GO_GOLDENS.keys()], [], 'no transcript is kept for the Go core apart from the shared one')
  assert.ok(goSkipFor('go', new Map([['a planted rule', 'ADR-000']]), 'a planted rule'), 'a named lack skips its test under Go')
  const qh = qhBinary(t)
  const top = mkdtempSync(path.join(os.tmpdir(), 'qh-adr111-'))
  t.after(() => rmSync(top, { recursive: true, force: true }))
  const answers = new Map()
  for (const [name, files] of Object.entries(SHAPES)) {
    const dir = path.join(top, name.replace(/[^a-z0-9]+/gi, '-'))
    mkdirSync(dir, { recursive: true })
    for (const [file, text] of Object.entries(files)) {
      mkdirSync(path.dirname(path.join(dir, file)), { recursive: true })
      writeFileSync(path.join(dir, file), text)
    }
    const node = checkCommandOrigin(dir, { ok: true, root: dir })
    const run = spawnSync(qh, ['check-command', dir], { encoding: 'utf8', timeout: 30_000, windowsHide: true })
    assert.equal(run.status, 0, `${name}: qh check-command failed: ${run.stderr}`)
    const go = JSON.parse(run.stdout)
    // The problem's words come from each path's own JSON parser (core/hooks/checkcmd.go), so only its presence is compared.
    assert.deepEqual({ command: go.command, origin: go.origin, problem: Boolean(go.problem) },
      { command: node.command, origin: node.origin, problem: Boolean(node.problem) }, `${name}: the two paths infer differently`)
    answers.set(name, node.origin)
  }
  // The shapes discriminate: a Go core that answered `none` everywhere, or `inferred` everywhere, fails above.
  assert.deepEqual(new Set(answers.values()), new Set(['inferred', 'none', 'declared', 'refused', 'unreadable']))
  assert.equal(answers.get('pyproject section'), 'inferred')
  assert.equal(answers.get('an escaped quote inside a multi-line string'), 'none')
})
