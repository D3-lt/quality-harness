import assert from 'node:assert/strict'
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs'

import os from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const testDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(testDir, '..')
const root = join(repoRoot, 'plugin')
const bin = join(root, 'bin')
const { NODE_TEST_CONTEXT: _nestedRunner, ...envSansTestContext } = process.env
const pyEnv = {
  ...envSansTestContext,
  PYTHONPATH: join(root, 'lib'),
  PYTHONWARNDEFAULTENCODING: '1',
  PYTHONWARNINGS: 'error::EncodingWarning',
}

function python(src, input) {
  return spawnSync('python3', ['-c', src], {
    cwd: repoRoot,
    env: pyEnv,
    input,
    encoding: 'utf8',
    timeout: 30_000,
  })
}

function recordOp(payload) {
  const src = `
import json, sys
from pathlib import Path
from record import (
    first_red_lock_suffix, lock_findings, lock_blocks_done, TEST_HASH_REQUIRED_FROM,
)
req = json.load(sys.stdin)
root = Path(req["root"]) if req.get("root") else None
op = req["op"]
if op == "suffix":
    print(json.dumps({"suffix": first_red_lock_suffix(req["text"], root)}))
elif op == "findings":
    blocks, advice = lock_findings(
        req["vlog"], root=root,
        tests=[tuple(t) for t in req["tests"]],
        label=req.get("label", "T1"))
    print(json.dumps({"blocks": blocks, "advice": advice}))
elif op == "blocks_done":
    print(json.dumps({"blocks": lock_blocks_done(req["text"], root)}))
elif op == "cutover":
    print(json.dumps({"from": TEST_HASH_REQUIRED_FROM}))
else:
    raise SystemExit("unknown op")
`
  const r = python(src, JSON.stringify(payload))
  assert.equal(r.status, 0, `record op ${payload.op}\n${r.stdout}\n${r.stderr}`)
  return JSON.parse(r.stdout)
}

function lintOp(payload) {
  const src = `
import importlib.machinery, importlib.util, json, sys
from pathlib import Path
p = Path(${JSON.stringify(join(bin, 'adr-lint'))})
loader = importlib.machinery.SourceFileLoader("adr_lint_lock", str(p))
mod = importlib.util.module_from_spec(importlib.util.spec_from_loader(loader.name, loader))
loader.exec_module(mod)
req = json.load(sys.stdin)
errors = mod.Findings()
infos = req["infos"]
for inf in infos.values():
    inf["path"] = Path(inf["path"])
mod.check_test_lock(infos, req["readme"], errors, Path(req["root"]) if req.get("root") else None)
print(json.dumps({"errors": list(errors), "advice": list(errors.advice)}))
`
  const r = python(src, JSON.stringify(payload))
  return r
}

function lintCli(dir, vlogRows) {
  const adr = join(dir, 'ADR-001-probe.md')
  mkdirSync(join(dir, 'ADR-001-probe', 'tasks'), { recursive: true })
  writeFileSync(adr, [
    '# ADR-001: Probe', '',
    '**Status:** Accepted',
    '**Spec:** None — no spec stage',
    '**Served-path change:** None — this decision changes no served path.', '',
    '## Existing Primitives Audit', '', 'Nothing existing covers it.', '',
    '## Decision', '', 'Lock.', '',
    '## Alternatives Considered', '', '- Doing nothing — rejected, the bug persists.', '',
    '## Consequences', '', 'Locked.', '',
    '## Wiring & Contract Changes', '', 'None.', '',
    '## Out of Scope', '', '- The other thing (deferred: ADR-002)', '',
  ].join('\n'))
  writeFileSync(join(dir, 'ADR-001-probe', 'tasks', 'README.md'), [
    '# Tasks', '',
    '| ID | Goal | Status | Depends-on | Notes |',
    '|----|------|--------|------------|-------|',
    '| T1 | lock | done | | |',
    '',
  ].join('\n'))
  writeFileSync(join(dir, 'ADR-001-probe', 'tasks', 'T1-lock.md'), [
    '# Task ADR-001-T1: lock',
    '',
    '## Tests',
    '',
    '| Test name | File | Verifies | Covers |',
    '|-----------|------|----------|--------|',
    NAMED_ROW,
    '',
    '## Verification Log',
    '',
    ...vlogRows,
    '',
  ].join('\n'))
  const git = spawnSync('git', ['init', '-q'], { cwd: dir, encoding: 'utf8', timeout: 10_000 })
  assert.equal(git.status, 0, git.stderr)
  return spawnSync('python3', [join(bin, 'adr-lint'), adr], {
    cwd: dir,
    env: pyEnv,
    encoding: 'utf8',
    timeout: 30_000,
  })
}

function nextIsDone(payload) {
  const src = `
import importlib.machinery, importlib.util, json, sys
from pathlib import Path
p = Path(${JSON.stringify(join(bin, 'adr-next'))})
loader = importlib.machinery.SourceFileLoader("adr_next_lock", str(p))
mod = importlib.util.module_from_spec(importlib.util.spec_from_loader(loader.name, loader))
loader.exec_module(mod)
req = json.load(sys.stdin)
root = Path(req["root"]) if req.get("root") else None
print(json.dumps({"done": bool(mod.is_done(
    req["text"], req["digest"], False, req.get("fence"), req.get("first"), root))}))
`
  const r = python(src, JSON.stringify(payload))
  return r
}

function tmpRepo() {
  const dir = mkdtempSync(join(os.tmpdir(), 'quality-harness-lock-'))
  return dir
}

function writeSubject(dir, extras = '') {
  mkdirSync(join(dir, 'tests'), { recursive: true })
  writeFileSync(join(dir, 'tests', 'lock-subject.test.mjs'),
    "import test from 'node:test'\n"
    + "import assert from 'node:assert/strict'\n"
    + "test('locked dirty', () => {\n"
    + '  assert.equal(2, 2)\n'
    + '})\n'
    + extras)
}

function taskMarkdown(testsRows, vlog = []) {
  return [
    '# Task ADR-050-T1: lock probe',
    '',
    '## Tests',
    '',
    '| Test name | File | Verifies | Covers |',
    '|-----------|------|----------|--------|',
    ...testsRows,
    '',
    '## Verification Log',
    '',
    ...vlog,
    '',
  ].join('\n')
}

const NAMED = [['locked dirty', 'tests/lock-subject.test.mjs']]
const NAMED_ROW = '| `locked dirty` | `tests/lock-subject.test.mjs` | lock | F-1 |'

function suffixFor(dir, extras = '') {
  writeSubject(dir, extras)
  const text = taskMarkdown([NAMED_ROW])
  return recordOp({ op: 'suffix', root: dir, text })
}

function redRow(dir, extras = '', date = '2026-09-13') {
  const suffix = suffixFor(dir, extras).suffix
  assert.match(suffix, /test-lock-sha256:[0-9a-f]{64}/, 'first-red suffix must carry a hash')
  return `- ${date} · no-git · exit 2 · \`node --test tests/lock-subject.test.mjs\` · acceptance-sha256:${'0'.repeat(64)} · ms:12${suffix}`
}

function findings(dir, vlog, tests = NAMED) {
  return recordOp({ op: 'findings', root: dir, vlog, tests, label: 'T1' })
}

test('first-red hashes still match at done', () => {
  const dir = tmpRepo()
  try {
    const row = redRow(dir)
    const got = findings(dir, [row])
    assert.deepEqual(got.blocks, [], got.blocks.join('\n'))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('rewriting a locked assertion refuses done', () => {
  const dir = tmpRepo()
  try {
    const row = redRow(dir)
    writeFileSync(join(dir, 'tests', 'lock-subject.test.mjs'),
      "import test from 'node:test'\n"
      + "import assert from 'node:assert/strict'\n"
      + "test('locked dirty', () => {\n"
      + '  assert.equal(1, 2)\n'
      + '})\n')
    const got = findings(dir, [row])
    assert.ok(got.blocks.some(b => b.includes('locked dirty') && b.includes('hash moved')),
      got.blocks.join('\n'))
    const linted = lintOp({
      root: dir,
      readme: '| T1 | lock | done |',
      infos: {
        T1: {
          human: false,
          path: join(dir, 'T1.md'),
          tests: NAMED,
          vlog: [row],
        },
      },
    })
    assert.equal(linted.status, 0, linted.stderr)
    const lintOut = JSON.parse(linted.stdout)
    assert.ok(lintOut.errors.some(e => e.includes('locked dirty') && e.includes('hash moved')),
      lintOut.errors.join('\n'))
    const cli = lintCli(dir, [row])
    const cliOut = `${cli.stdout}\n${cli.stderr}`
    assert.match(cliOut, /locked dirty/, cliOut)
    assert.match(cliOut, /hash moved/, cliOut)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('first TDD-red row carries a tool-written hash for each named test', () => {
  const dir = tmpRepo()
  try {
    writeSubject(dir)
    writeFileSync(join(dir, 'prod.mjs'), 'export const code = 0\n')
    writeFileSync(join(dir, 'tests', 'lock-subject.test.mjs'),
      "import test from 'node:test'\n"
      + "import assert from 'node:assert/strict'\n"
      + "import { code } from '../prod.mjs'\n"
      + "test('locked dirty', () => {\n"
      + '  assert.equal(code, 2)\n'
      + '})\n')
    const task = join(dir, 'T1.md')
    writeFileSync(task, [
      '# Task ADR-050-T1: lock probe',
      '',
      '## Goal',
      '',
      'TDD-red lock.',
      '',
      '## Affected Files',
      '',
      '| File | Change | Why |',
      '|------|--------|-----|',
      '| `prod.mjs` | add | product |',
      '',
      '## Ordered Steps',
      '',
      '1. [S1] Confirm the failing test.',
      '',
      '## Acceptance',
      '',
      '```bash',
      'node --test tests/lock-subject.test.mjs',
      '```',
      '',
      '## Tests',
      '',
      '| Test name | File | Verifies | Covers |',
      '|-----------|------|----------|--------|',
      NAMED_ROW,
      '',
      '## Invariants',
      '',
      '- lock',
      '',
      '## Risks',
      '',
      '- none',
      '',
      '## Stop Condition',
      '',
      'Stop.',
      '',
      '## Out of Scope',
      '',
      '- none',
      '',
      '## Verification Log',
      '',
    ].join('\n'))
    const git = spawnSync('git', ['init', '-q'], { cwd: dir, encoding: 'utf8', timeout: 10_000 })
    assert.equal(git.status, 0, git.stderr)
    const verified = spawnSync('python3', [join(bin, 'adr-verify'), task, '--cwd', dir], {
      cwd: dir,
      env: pyEnv,
      encoding: 'utf8',
      timeout: 30_000,
    })
    assert.notEqual(verified.status, 0, `writer must record TDD-red\n${verified.stdout}\n${verified.stderr}`)
    const logged = spawnSync('python3', ['-c',
      'from pathlib import Path; import sys; print(Path(sys.argv[1]).read_text(encoding="utf-8"))',
      task], { cwd: repoRoot, env: pyEnv, encoding: 'utf8', timeout: 10_000 })
    assert.match(logged.stdout, /test-lock-sha256:[0-9a-f]{64}/, logged.stdout)
    assert.match(logged.stdout, /test-lock-b64:[A-Za-z0-9_-]+/, logged.stdout)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('missing or unreadable named test refuses done as UNPROVEN', () => {
  const dir = tmpRepo()
  try {
    writeSubject(dir)
    const ghost = taskMarkdown(['| `ghost` | `tests/lock-subject.test.mjs` | lock | F-2 |'])
    const suffix = recordOp({ op: 'suffix', root: dir, text: ghost }).suffix
    const row = `- 2026-09-13 · no-git · exit 2 · \`node --test tests/lock-subject.test.mjs\` · acceptance-sha256:${'0'.repeat(64)} · ms:12${suffix}`
    const got = findings(dir, [row], [['ghost', 'tests/lock-subject.test.mjs']])
    assert.ok(got.blocks.some(b => /UNPROVEN/.test(b) && /ghost/.test(b)),
      got.blocks.join('\n'))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('pre-cutover done without hashes is advised', () => {
  const dir = tmpRepo()
  try {
    writeSubject(dir)
    const row = `- 2026-08-22 · no-git · exit 2 · \`node --test tests/lock-subject.test.mjs\` · acceptance-sha256:${'0'.repeat(64)} · ms:12`
    const got = findings(dir, [row])
    assert.deepEqual(got.blocks, [], got.blocks.join('\n'))
    assert.ok(got.advice.some(a => /UNPROVEN/.test(a) && /advisory/.test(a)),
      got.advice.join('\n'))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('post-cutover done without first-red hashes is refused', () => {
  const dir = tmpRepo()
  try {
    writeSubject(dir)
    const row = `- 2026-09-13 · no-git · exit 2 · \`node --test tests/lock-subject.test.mjs\` · acceptance-sha256:${'0'.repeat(64)} · ms:12`
    const got = findings(dir, [row])
    assert.ok(got.blocks.some(b => /no first-red test-lock-sha256/.test(b) && /UNPROVEN/.test(b)),
      got.blocks.join('\n'))
    const cutover = recordOp({ op: 'cutover' })
    assert.equal(got.blocks.some(b => b.includes(cutover.from)), true)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a new test name in the same file does not refuse done', () => {
  const dir = tmpRepo()
  try {
    const row = redRow(dir)
    writeFileSync(join(dir, 'tests', 'lock-subject.test.mjs'),
      "import test from 'node:test'\n"
      + "import assert from 'node:assert/strict'\n"
      + "test('locked dirty', () => {\n"
      + '  assert.equal(2, 2)\n'
      + '})\n'
      + "test('new dirty', () => {\n"
      + '  assert.equal(1, 1)\n'
      + '})\n')
    const got = findings(dir, [row])
    assert.deepEqual(got.blocks, [], got.blocks.join('\n'))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('rewriting a sibling not listed in the Tests table refuses done', () => {
  const dir = tmpRepo()
  try {
    const row = redRow(dir,
      "test('sibling dirty', () => {\n"
      + '  assert.equal(2, 2)\n'
      + '})\n')
    writeFileSync(join(dir, 'tests', 'lock-subject.test.mjs'),
      "import test from 'node:test'\n"
      + "import assert from 'node:assert/strict'\n"
      + "test('locked dirty', () => {\n"
      + '  assert.equal(2, 2)\n'
      + '})\n'
      + "test('sibling dirty', () => {\n"
      + '  assert.equal(1, 2)\n'
      + '})\n')
    const got = findings(dir, [row])
    assert.ok(got.blocks.some(b => b.includes('sibling dirty') && b.includes('hash moved')),
      got.blocks.join('\n'))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a declared check string unchanged at done is allowed', () => {
  const dir = tmpRepo()
  try {
    writeFileSync(join(dir, '.quality-harness.json'), '{"check":"node --test tests/lock-subject.test.mjs"}\n')
    const row = redRow(dir)
    const got = findings(dir, [row])
    assert.deepEqual(got.blocks, [], got.blocks.join('\n'))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('rewriting or deleting check refuses done', () => {
  const dir = tmpRepo()
  try {
    writeFileSync(join(dir, '.quality-harness.json'), '{"check":"node --test tests/lock-subject.test.mjs"}\n')
    const row = redRow(dir)
    writeFileSync(join(dir, '.quality-harness.json'), '{"check":"true"}\n')
    const rewritten = findings(dir, [row])
    assert.ok(rewritten.blocks.some(b => /check string moved/.test(b)),
      rewritten.blocks.join('\n'))
    writeFileSync(join(dir, '.quality-harness.json'), '{"strictFrom":"ADR-0001"}\n')
    const deleted = findings(dir, [row])
    assert.ok(deleted.blocks.some(b => /check was locked and is now/.test(b)),
      deleted.blocks.join('\n'))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a comment-only or whitespace-only edit does not refuse done', () => {
  const dir = tmpRepo()
  try {
    const row = redRow(dir)
    writeFileSync(join(dir, 'tests', 'lock-subject.test.mjs'),
      "import test from 'node:test'\n"
      + "import assert from 'node:assert/strict'\n"
      + "test('locked dirty', () => {\n"
      + '  // format only\n'
      + '  assert.equal(2, 2)\n'
      + '})\n')
    const got = findings(dir, [row])
    assert.deepEqual(got.blocks, [], got.blocks.join('\n'))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('an assertion edit still refuses done', () => {
  const dir = tmpRepo()
  try {
    const row = redRow(dir)
    writeFileSync(join(dir, 'tests', 'lock-subject.test.mjs'),
      "import test from 'node:test'\n"
      + "import assert from 'node:assert/strict'\n"
      + "test('locked dirty', () => {\n"
      + '  assert.equal("exit 1", "exit 2")\n'
      + '})\n')
    const got = findings(dir, [row])
    assert.ok(got.blocks.some(b => b.includes('locked dirty') && b.includes('hash moved')),
      got.blocks.join('\n'))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('writer, done, and is_done agree on the same hashes', () => {
  const dir = tmpRepo()
  try {
    const row = redRow(dir)
    const fromLint = findings(dir, [row])
    const blocked = recordOp({
      op: 'blocks_done',
      root: dir,
      text: taskMarkdown([NAMED_ROW], [row]),
    })
    assert.deepEqual(fromLint.blocks, [], fromLint.blocks.join('\n'))
    assert.equal(blocked.blocks, false)
    const same = recordOp({ op: 'cutover' })
    const identity = python(`
import importlib.machinery, importlib.util, json
from pathlib import Path
from record import lock_findings, TEST_HASH_REQUIRED_FROM
def load(p, n):
    loader = importlib.machinery.SourceFileLoader(n, str(p))
    mod = importlib.util.module_from_spec(importlib.util.spec_from_loader(loader.name, loader))
    loader.exec_module(mod)
    return mod
lint = load(Path(${JSON.stringify(join(bin, 'adr-lint'))}), "adr_lint_id")
nxt = load(Path(${JSON.stringify(join(bin, 'adr-next'))}), "adr_next_id")
print(json.dumps({
    "lint_fn": lint.lock_findings is lock_findings,
    "next_from": nxt.TEST_HASH_REQUIRED_FROM,
    "lint_from": lint.TEST_HASH_REQUIRED_FROM,
    "record_from": TEST_HASH_REQUIRED_FROM,
}))
`)
    assert.equal(identity.status, 0, identity.stderr)
    const ids = JSON.parse(identity.stdout)
    assert.equal(ids.lint_fn, true)
    assert.equal(ids.next_from, ids.record_from)
    assert.equal(ids.lint_from, ids.record_from)
    assert.equal(ids.record_from, same.from)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('is_done refuses when a locked hash moved', () => {
  const dir = tmpRepo()
  try {
    const row = redRow(dir)
    writeFileSync(join(dir, 'tests', 'lock-subject.test.mjs'),
      "import test from 'node:test'\n"
      + "import assert from 'node:assert/strict'\n"
      + "test('locked dirty', () => {\n"
      + '  assert.equal(1, 2)\n'
      + '})\n')
    const digest = '0'.repeat(64)
    const text = taskMarkdown([NAMED_ROW], [
      row,
      `- 2026-09-13 · no-git · exit 0 · \`node --test tests/lock-subject.test.mjs\` · acceptance-sha256:${digest} · ms:12`,
    ])
    const r = nextIsDone({
      text,
      digest,
      root: dir,
      fence: 'node --test tests/lock-subject.test.mjs',
      first: 'node --test tests/lock-subject.test.mjs',
    })
    assert.equal(r.status, 0, r.stderr)
    assert.equal(JSON.parse(r.stdout).done, false)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('still-absent check at done is allowed', () => {
  const dir = tmpRepo()
  try {
    const row = redRow(dir)
    const got = findings(dir, [row])
    assert.deepEqual(got.blocks, [], got.blocks.join('\n'))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('introducing check after first-red refuses done', () => {
  const dir = tmpRepo()
  try {
    const row = redRow(dir)
    writeFileSync(join(dir, '.quality-harness.json'), '{"check":"node --test"}\n')
    const got = findings(dir, [row])
    assert.ok(got.blocks.some(b => /absent at first-red/.test(b)),
      got.blocks.join('\n'))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('unknown keys in quality-harness json are not a lock', () => {
  const dir = tmpRepo()
  try {
    const row = redRow(dir)
    writeFileSync(join(dir, '.quality-harness.json'),
      JSON.stringify({ hooks: { pre: 'rm -rf .' }, strictFrom: 'ADR-0001' }))
    const got = findings(dir, [row])
    assert.deepEqual(got.blocks, [], got.blocks.join('\n'))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
