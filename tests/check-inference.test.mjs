// ADR-111 T1. A Python repository that configures pytest only in pyproject.toml or setup.cfg had no inferred check, so the
// turn end said nothing at all (Stage 5, 2026-10-18: an attempt in a repository whose pytest lives in setup.cfg's
// [tool:pytest]). The section header is the signal, at the start of a line; a manifest that only mentions it is not.
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { checkCommandOrigin } from '../plugin/scripts/check-command.mjs'

function inferredIn(files) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'qh-infer-'))
  try {
    for (const [name, text] of Object.entries(files)) writeFileSync(path.join(dir, name), text)
    return checkCommandOrigin(dir, { ok: true, root: dir })
  } finally { rmSync(dir, { recursive: true, force: true }) }
}

test('pytest configured in pyproject.toml or setup.cfg is inferred', () => {
  assert.deepEqual(inferredIn({ 'pyproject.toml': '[project]\nname = "x"\n\n[tool.pytest.ini_options]\naddopts = "-q"\n' }), { command: 'pytest', origin: 'inferred' })
  assert.deepEqual(inferredIn({ 'setup.cfg': '[metadata]\nname = x\n\n[tool:pytest]\ntestpaths = tests\n', 'setup.py': 'from setuptools import setup\nsetup()\n' }), { command: 'pytest', origin: 'inferred' })
  // Codex verification review: a delimiter inside a comment or an ordinary string opens no multi-line string, so the header
  // after it is still read.
  const pytest = { command: 'pytest', origin: 'inferred' }
  assert.deepEqual(inferredIn({ 'pyproject.toml': '# an example delimiter """\n[tool.pytest.ini_options]\n' }), pytest, 'a delimiter in a comment')
  assert.deepEqual(inferredIn({ 'pyproject.toml': "[project]\nnote = 'has \"\"\" inside'\n[tool.pytest.ini_options]\n" }), pytest, 'a delimiter in a literal string')
  assert.deepEqual(inferredIn({ 'pyproject.toml': "[project]\nnote = \"has ''' inside\"\n[tool.pytest.ini_options]\n" }), pytest, 'a literal delimiter in a basic string')
  assert.deepEqual(inferredIn({ 'pyproject.toml': "[project]\nnote = \"a \\\" ''' b\"\n[tool.pytest.ini_options]\n" }), pytest, 'a delimiter after an escaped quote in a basic string')
  assert.deepEqual(inferredIn({ 'pyproject.toml': '[project]\ndescription = """one line"""\n[tool.pytest.ini_options]\n' }), pytest, 'a multi-line string closed on its own line')
})

test('a manifest that does not configure pytest infers nothing from these rungs', () => {
  const none = { command: null, origin: 'none' }
  assert.deepEqual(inferredIn({ 'pyproject.toml': '[project]\nname = "x"\n' }), none)
  assert.deepEqual(inferredIn({ 'setup.cfg': '[metadata]\nname = x\n' }), none)
  assert.deepEqual(inferredIn({ 'pyproject.toml': '# [tool.pytest.ini_options] is configured elsewhere\n[project]\nname = "x"\n' }), none, 'a header inside a comment')
  assert.deepEqual(inferredIn({ 'pyproject.toml': '[project]\ndescription = "see [tool.pytest.ini_options]"\n' }), none, 'a header inside a string')
  assert.deepEqual(inferredIn({ 'setup.cfg': '[metadata]\nlong = uses [tool:pytest] upstream\n' }), none, 'a header mid-line')
  // Codex review of v3.8.44..3c42f633: a header on its own line inside a TOML multi-line string, or an indented INI
  // continuation value, is a value, not a section.
  assert.deepEqual(inferredIn({ 'pyproject.toml': '[project]\ndescription = """\n[tool.pytest.ini_options]\n"""\n' }), none, 'inside a TOML multi-line string')
  assert.deepEqual(inferredIn({ 'pyproject.toml': "[project]\nreadme = '''\n[tool.pytest.ini_options]\n'''\n" }), none, 'inside a TOML literal multi-line string')
  assert.deepEqual(inferredIn({ 'setup.cfg': '[metadata]\nlong_description =\n    [tool:pytest]\n' }), none, 'an indented INI continuation value')
})
