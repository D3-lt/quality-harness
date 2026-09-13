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
  PYTHONUTF8: '1',
  PYTHONIOENCODING: 'utf-8',
  PYTHONWARNDEFAULTENCODING: '1',
  PYTHONWARNINGS: 'error::EncodingWarning',
  // A same-size edit inside one second leaves `__pycache__` looking valid, so a
  // spawned gate can import the PREVIOUS record.py — which is how a mutation
  // campaign reported a live defect as unnoticed (scripts/mutate.mjs childEnv).
  PYTHONDONTWRITEBYTECODE: '1',
  PYTHONPYCACHEPREFIX: mkdtempSync(join(os.tmpdir(), 'qh-pyc-')),
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

test('a brace inside a string does not keep the first-red hash after the assertion moves', () => {
  // arch-lint already paid for this class: raw `{`/`}` counting treats `}` in a
  // string as the closer and hashes a prefix. Changing the omitted assertion
  // must refuse done. Do not hash with code_only — ADR-050 keeps string bytes.
  const dir = tmpRepo()
  try {
    writeFileSync(join(dir, 'prod.mjs'), 'export const code = 1\n')
    mkdirSync(join(dir, 'tests'), { recursive: true })
    writeFileSync(join(dir, 'tests', 'lock-subject.test.mjs'),
      "import test from 'node:test'\n"
      + "import assert from 'node:assert/strict'\n"
      + "import { code } from '../prod.mjs'\n"
      + "test('locked dirty', () => {\n"
      + "  const token = '}'\n"
      + '  assert.equal(code, 1)\n'
      + '})\n')
    const suffix = recordOp({ op: 'suffix', root: dir, text: taskMarkdown([NAMED_ROW]) }).suffix
    assert.match(suffix, /test-lock-sha256:[0-9a-f]{64}/)
    const row = `- 2026-09-13 · no-git · exit 2 · \`node --test tests/lock-subject.test.mjs\` · acceptance-sha256:${'0'.repeat(64)} · ms:12${suffix}`
    writeFileSync(join(dir, 'tests', 'lock-subject.test.mjs'),
      "import test from 'node:test'\n"
      + "import assert from 'node:assert/strict'\n"
      + "import { code } from '../prod.mjs'\n"
      + "test('locked dirty', () => {\n"
      + "  const token = '}'\n"
      + '  assert.equal(code, 2)\n'
      + '})\n')
    const got = findings(dir, [row])
    assert.ok(got.blocks.some(b => b.includes('locked dirty') && b.includes('hash moved')),
      got.blocks.join('\n'))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
test('a Go func Test is hashed, and rewriting the assertion refuses done', () => {
  // 2.98.0 ran .go through the BDD it(/test( extractors, so every func Test was
  // unproven and done was refused. Same outer boundary as the JS lock: suffix
  // then lock_findings. A `}` in a raw string must not close the body.
  const dir = tmpRepo()
  const rel = 'tests/lock_subject_test.go'
  const named = [['TestLockDirty', rel]]
  const rowLine = '| `TestLockDirty` | `tests/lock_subject_test.go` | lock | F-1 |'
  try {
    mkdirSync(join(dir, 'tests'), { recursive: true })
    writeFileSync(join(dir, rel),
      'package lock\n\nimport "testing"\n\n'
      + 'func TestLockDirty(t *testing.T) {\n'
      + '\ttoken := `}`\n'
      + '\tif got, want := 2, 2; got != want {\n'
      + '\t\tt.Fatalf("got %d want %d", got, want)\n'
      + '\t}\n'
      + '}\n')
    const suffix = recordOp({ op: 'suffix', root: dir, text: taskMarkdown([rowLine]) }).suffix
    assert.match(suffix, /test-lock-sha256:[0-9a-f]{64}/)
    const row = `- 2026-09-13 · no-git · exit 2 · \`go test .\` · acceptance-sha256:${'0'.repeat(64)} · ms:12${suffix}`
    const locked = findings(dir, [row], named)
    assert.deepEqual(locked.blocks, [], locked.blocks.join('\n'))
    writeFileSync(join(dir, rel),
      'package lock\n\nimport "testing"\n\n'
      + 'func TestLockDirty(t *testing.T) {\n'
      + '\ttoken := `}`\n'
      + '\tif got, want := 2, 1; got != want {\n'
      + '\t\tt.Fatalf("got %d want %d", got, want)\n'
      + '\t}\n'
      + '}\n')
    const moved = findings(dir, [row], named)
    assert.ok(moved.blocks.some(b => b.includes('TestLockDirty') && b.includes('hash moved')),
      moved.blocks.join('\n'))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a Go func Fuzz target is hashed, and rewriting its body refuses done', () => {
  // memory-runtime, 2026-09-13: a Tests-table row naming `FuzzX` locked as
  // unproven because the matcher was anchored to the literal `Test`. `go test`
  // runs a fuzz target's seed corpus like any test, so its body is the same
  // risk. The file also holds a Test so both names are seen side by side.
  const dir = tmpRepo()
  const rel = 'tests/lock_subject_test.go'
  const named = [['FuzzLockDirty', rel]]
  const rowLine = '| `FuzzLockDirty` | `tests/lock_subject_test.go` | lock | F-1 |'
  const source = want => 'package lock\n\nimport "testing"\n\n'
    + 'func TestAlpha(t *testing.T) {\n'
    + '\tif 1 != 1 {\n\t\tt.Fatal("alpha")\n\t}\n'
    + '}\n\n'
    + 'func FuzzLockDirty(f *testing.F) {\n'
    + '\tf.Add(2)\n'
    + '\tf.Fuzz(func(t *testing.T, n int) {\n'
    + `\t\tif n%1 != 0 || 2 != ${want} {\n`
    + '\t\t\tt.Fatalf("got %d", n)\n'
    + '\t\t}\n'
    + '\t})\n'
    + '}\n'
  try {
    mkdirSync(join(dir, 'tests'), { recursive: true })
    writeFileSync(join(dir, rel), source(2))
    const suffix = recordOp({ op: 'suffix', root: dir, text: taskMarkdown([rowLine]) }).suffix
    assert.match(suffix, /test-lock-sha256:[0-9a-f]{64}/)
    const row = `- 2026-09-13 · no-git · exit 2 · \`go test .\` · acceptance-sha256:${'0'.repeat(64)} · ms:12${suffix}`
    const locked = findings(dir, [row], named)
    assert.deepEqual(locked.blocks, [], `a fuzz target must lock with a body, not as unproven:\n${locked.blocks.join('\n')}`)
    writeFileSync(join(dir, rel), source(1))
    const moved = findings(dir, [row], named)
    assert.ok(moved.blocks.some(b => b.includes('FuzzLockDirty') && b.includes('hash moved')),
      moved.blocks.join('\n'))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
test('a Go Testfoo (lowercase after Test) stays unproven', () => {
  // go/testing isTest: next rune after Test must not be lowercase. Matching
  // Testfoo would hash a function go test does not run.
  const dir = tmpRepo()
  const rel = 'tests/lock_subject_test.go'
  try {
    mkdirSync(join(dir, 'tests'), { recursive: true })
    writeFileSync(join(dir, rel),
      'package lock\n\nimport "testing"\n\n'
      + 'func Testfoo(t *testing.T) {\n'
      + '\tt.Fatal("not a test")\n'
      + '}\n')
    const suffix = recordOp({
      op: 'suffix',
      root: dir,
      text: taskMarkdown(['| `Testfoo` | `tests/lock_subject_test.go` | lock | F-1 |']),
    }).suffix
    const row = `- 2026-09-13 · no-git · exit 2 · \`go test .\` · acceptance-sha256:${'0'.repeat(64)} · ms:12${suffix}`
    const got = findings(dir, [row], [['Testfoo', rel]])
    assert.ok(got.blocks.some(b => b.includes('Testfoo') && /could not be hashed/.test(b)),
      got.blocks.join('\n'))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
test('a PHPUnit function test is hashed, and rewriting the assertion refuses done', () => {
  // spec-verify already paid for class-body function test*; 2.98.0 ran .php
  // through BDD it(/test(, so PHPUnit methods were unproven. PSR-12 puts `{`
  // on the next line after `: void`. A `}` in a string must not close the body.
  const dir = tmpRepo()
  const rel = 'tests/LockSubjectTest.php'
  const named = [['testLockDirty', rel]]
  const rowLine = '| `testLockDirty` | `tests/LockSubjectTest.php` | lock | F-1 |'
  try {
    mkdirSync(join(dir, 'tests'), { recursive: true })
    writeFileSync(join(dir, rel),
      '<?php\n'
      + 'final class LockSubjectTest extends TestCase\n'
      + '{\n'
      + '    public function testLockDirty(): void\n'
      + '    {\n'
      + "        $token = '}';\n"
      + '        $this->assertSame(2, 2);\n'
      + '    }\n'
      + '}\n')
    const suffix = recordOp({ op: 'suffix', root: dir, text: taskMarkdown([rowLine]) }).suffix
    assert.match(suffix, /test-lock-sha256:[0-9a-f]{64}/)
    const row = `- 2026-09-13 · no-git · exit 2 · \`vendor/bin/phpunit\` · acceptance-sha256:${'0'.repeat(64)} · ms:12${suffix}`
    const locked = findings(dir, [row], named)
    assert.deepEqual(locked.blocks, [], locked.blocks.join('\n'))
    writeFileSync(join(dir, rel),
      '<?php\n'
      + 'final class LockSubjectTest extends TestCase\n'
      + '{\n'
      + '    public function testLockDirty(): void\n'
      + '    {\n'
      + "        $token = '}';\n"
      + '        $this->assertSame(2, 1);\n'
      + '    }\n'
      + '}\n')
    const moved = findings(dir, [row], named)
    assert.ok(moved.blocks.some(b => b.includes('testLockDirty') && b.includes('hash moved')),
      moved.blocks.join('\n'))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a Pest test() in a .php file is still hashed', () => {
  // If .php became PHPUnit-only, Pest bindings would stay unproven.
  const dir = tmpRepo()
  const rel = 'tests/LockSubjectPest.php'
  const named = [['locked dirty', rel]]
  const rowLine = '| `locked dirty` | `tests/LockSubjectPest.php` | lock | F-1 |'
  try {
    mkdirSync(join(dir, 'tests'), { recursive: true })
    writeFileSync(join(dir, rel),
      '<?php\n'
      + "test('locked dirty', function () {\n"
      + "    $token = '}';\n"
      + '    expect(2)->toBe(2);\n'
      + '});\n')
    const suffix = recordOp({ op: 'suffix', root: dir, text: taskMarkdown([rowLine]) }).suffix
    assert.match(suffix, /test-lock-sha256:[0-9a-f]{64}/)
    const row = `- 2026-09-13 · no-git · exit 2 · \`vendor/bin/pest\` · acceptance-sha256:${'0'.repeat(64)} · ms:12${suffix}`
    const locked = findings(dir, [row], named)
    assert.deepEqual(locked.blocks, [], locked.blocks.join('\n'))
    writeFileSync(join(dir, rel),
      '<?php\n'
      + "test('locked dirty', function () {\n"
      + "    $token = '}';\n"
      + '    expect(2)->toBe(1);\n'
      + '});\n')
    const moved = findings(dir, [row], named)
    assert.ok(moved.blocks.some(b => b.includes('locked dirty') && b.includes('hash moved')),
      moved.blocks.join('\n'))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a PHP file-level function test* stays unproven', () => {
  // spec-verify: PHPUnit tests are class methods. Hashing a file-level
  // function test* would lock a helper PHPUnit does not run.
  const dir = tmpRepo()
  const rel = 'tests/LockHelper.php'
  try {
    mkdirSync(join(dir, 'tests'), { recursive: true })
    writeFileSync(join(dir, rel),
      '<?php\n'
      + 'function testLockDirty() {\n'
      + '    return 1;\n'
      + '}\n')
    const suffix = recordOp({
      op: 'suffix',
      root: dir,
      text: taskMarkdown(['| `testLockDirty` | `tests/LockHelper.php` | lock | F-1 |']),
    }).suffix
    const row = `- 2026-09-13 · no-git · exit 2 · \`vendor/bin/phpunit\` · acceptance-sha256:${'0'.repeat(64)} · ms:12${suffix}`
    const got = findings(dir, [row], [['testLockDirty', rel]])
    assert.ok(got.blocks.some(b => b.includes('testLockDirty') && /could not be hashed/.test(b)),
      got.blocks.join('\n'))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a Rust #[test] fn is hashed, and rewriting the assertion refuses done', () => {
  // spec-verify already paid for #[test]/#[tokio::test] fn; 2.98.0 ran .rs
  // through BDD, so every #[test] fn was unproven. A `}` in a string must not
  // close the body.
  const dir = tmpRepo()
  const rel = 'tests/lock_subject.rs'
  const named = [['lock_dirty', rel]]
  const rowLine = '| `lock_dirty` | `tests/lock_subject.rs` | lock | F-1 |'
  try {
    mkdirSync(join(dir, 'tests'), { recursive: true })
    writeFileSync(join(dir, rel),
      '#[test]\n'
      + 'fn lock_dirty() {\n'
      + '    let token = "}";\n'
      + '    assert_eq!(2, 2);\n'
      + '}\n')
    const suffix = recordOp({ op: 'suffix', root: dir, text: taskMarkdown([rowLine]) }).suffix
    assert.match(suffix, /test-lock-sha256:[0-9a-f]{64}/)
    const row = `- 2026-09-13 · no-git · exit 2 · \`cargo test\` · acceptance-sha256:${'0'.repeat(64)} · ms:12${suffix}`
    const locked = findings(dir, [row], named)
    assert.deepEqual(locked.blocks, [], locked.blocks.join('\n'))
    writeFileSync(join(dir, rel),
      '#[test]\n'
      + 'fn lock_dirty() {\n'
      + '    let token = "}";\n'
      + '    assert_eq!(2, 1);\n'
      + '}\n')
    const moved = findings(dir, [row], named)
    assert.ok(moved.blocks.some(b => b.includes('lock_dirty') && b.includes('hash moved')),
      moved.blocks.join('\n'))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
test('a PHPUnit #[Test] method is hashed, and rewriting the assertion refuses done', () => {
  // spec-verify hashes PHP 8 #[Test] methods that do not start with test.
  // The hasher reads this fixture; it does not execute PHP.
  const dir = tmpRepo()
  const rel = 'tests/LockAttrTest.php'
  const named = [['it_attr_locks', rel]]
  const rowLine = '| `it_attr_locks` | `tests/LockAttrTest.php` | lock | F-1 |'
  try {
    mkdirSync(join(dir, 'tests'), { recursive: true })
    writeFileSync(join(dir, rel),
      '<?php\n'
      + 'final class LockAttrTest extends TestCase\n'
      + '{\n'
      + '    #[Test]\n'
      + '    public function it_attr_locks(): void\n'
      + '    {\n'
      + "        $token = '}';\n"
      + '        $this->assertSame(2, 2);\n'
      + '    }\n'
      + '}\n')
    const suffix = recordOp({ op: 'suffix', root: dir, text: taskMarkdown([rowLine]) }).suffix
    assert.match(suffix, /test-lock-sha256:[0-9a-f]{64}/)
    const row = `- 2026-09-13 · no-git · exit 2 · \`vendor/bin/phpunit\` · acceptance-sha256:${'0'.repeat(64)} · ms:12${suffix}`
    const locked = findings(dir, [row], named)
    assert.deepEqual(locked.blocks, [], locked.blocks.join('\n'))
    writeFileSync(join(dir, rel),
      '<?php\n'
      + 'final class LockAttrTest extends TestCase\n'
      + '{\n'
      + '    #[Test]\n'
      + '    public function it_attr_locks(): void\n'
      + '    {\n'
      + "        $token = '}';\n"
      + '        $this->assertSame(2, 1);\n'
      + '    }\n'
      + '}\n')
    const moved = findings(dir, [row], named)
    assert.ok(moved.blocks.some(b => b.includes('it_attr_locks') && b.includes('hash moved')),
      moved.blocks.join('\n'))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a PHPUnit @test docblock method is hashed, and rewriting the assertion refuses done', () => {
  // PHPUnit 8.5 @test annotation. Docblocks are comments, so the masker
  // cannot be the only view.
  const dir = tmpRepo()
  const rel = 'tests/LockDocTest.php'
  const named = [['it_docblock_locks', rel]]
  const rowLine = '| `it_docblock_locks` | `tests/LockDocTest.php` | lock | F-1 |'
  try {
    mkdirSync(join(dir, 'tests'), { recursive: true })
    writeFileSync(join(dir, rel),
      '<?php\n'
      + 'final class LockDocTest extends TestCase\n'
      + '{\n'
      + '    /**\n'
      + '     * @test\n'
      + '     */\n'
      + '    public function it_docblock_locks()\n'
      + '    {\n'
      + "        $token = '}';\n"
      + '        $this->assertSame(2, 2);\n'
      + '    }\n'
      + '}\n')
    const suffix = recordOp({ op: 'suffix', root: dir, text: taskMarkdown([rowLine]) }).suffix
    assert.match(suffix, /test-lock-sha256:[0-9a-f]{64}/)
    const row = `- 2026-09-13 · no-git · exit 2 · \`vendor/bin/phpunit\` · acceptance-sha256:${'0'.repeat(64)} · ms:12${suffix}`
    const locked = findings(dir, [row], named)
    assert.deepEqual(locked.blocks, [], locked.blocks.join('\n'))
    writeFileSync(join(dir, rel),
      '<?php\n'
      + 'final class LockDocTest extends TestCase\n'
      + '{\n'
      + '    /**\n'
      + '     * @test\n'
      + '     */\n'
      + '    public function it_docblock_locks()\n'
      + '    {\n'
      + "        $token = '}';\n"
      + '        $this->assertSame(2, 1);\n'
      + '    }\n'
      + '}\n')
    const moved = findings(dir, [row], named)
    assert.ok(moved.blocks.some(b => b.includes('it_docblock_locks') && b.includes('hash moved')),
      moved.blocks.join('\n'))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a brace inside a Rust raw string does not keep the first-red hash after the assertion moves', () => {
  const dir = tmpRepo()
  const rel = 'tests/lock_subject.rs'
  const named = [['lock_dirty', rel]]
  const rowLine = '| `lock_dirty` | `tests/lock_subject.rs` | lock | F-1 |'
  try {
    mkdirSync(join(dir, 'tests'), { recursive: true })
    writeFileSync(join(dir, rel),
      '#[test]\n'
      + 'fn lock_dirty() {\n'
      + '    let token = r#" foo " } bar "#;\n'
      + '    assert_eq!(2, 2);\n'
      + '}\n')
    const suffix = recordOp({ op: 'suffix', root: dir, text: taskMarkdown([rowLine]) }).suffix
    assert.match(suffix, /test-lock-sha256:[0-9a-f]{64}/)
    const row = `- 2026-09-13 · no-git · exit 2 · \`cargo test\` · acceptance-sha256:${'0'.repeat(64)} · ms:12${suffix}`
    const locked = findings(dir, [row], named)
    assert.deepEqual(locked.blocks, [], locked.blocks.join('\n'))
    writeFileSync(join(dir, rel),
      '#[test]\n'
      + 'fn lock_dirty() {\n'
      + '    let token = r#" foo " } bar "#;\n'
      + '    assert_eq!(2, 1);\n'
      + '}\n')
    const moved = findings(dir, [row], named)
    assert.ok(moved.blocks.some(b => b.includes('lock_dirty') && b.includes('hash moved')),
      moved.blocks.join('\n'))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a Go t.Run name is hashed, and rewriting the assertion refuses done', () => {
  // adr-lint test_body already paid for t.Run("name". The lock hasher's .go
  // path was func Test only, so a Tests-table subtest name stayed unproven.
  const dir = tmpRepo()
  const rel = 'tests/lock_subject_test.go'
  const named = [['locked dirty', rel]]
  const rowLine = '| `locked dirty` | `tests/lock_subject_test.go` | lock | F-1 |'
  try {
    mkdirSync(join(dir, 'tests'), { recursive: true })
    writeFileSync(join(dir, rel),
      'package lock\n\nimport "testing"\n\n'
      + 'func TestLockDirty(t *testing.T) {\n'
      + '\tt.Run("locked dirty", func(t *testing.T) {\n'
      + '\t\ttoken := `}`\n'
      + '\t\tif got, want := 2, 2; got != want {\n'
      + '\t\t\tt.Fatalf("got %d want %d", got, want)\n'
      + '\t\t}\n'
      + '\t})\n'
      + '}\n')
    const suffix = recordOp({ op: 'suffix', root: dir, text: taskMarkdown([rowLine]) }).suffix
    assert.match(suffix, /test-lock-sha256:[0-9a-f]{64}/)
    const row = `- 2026-09-13 · no-git · exit 2 · \`go test .\` · acceptance-sha256:${'0'.repeat(64)} · ms:12${suffix}`
    const locked = findings(dir, [row], named)
    assert.deepEqual(locked.blocks, [], locked.blocks.join('\n'))
    writeFileSync(join(dir, rel),
      'package lock\n\nimport "testing"\n\n'
      + 'func TestLockDirty(t *testing.T) {\n'
      + '\tt.Run("locked dirty", func(t *testing.T) {\n'
      + '\t\ttoken := `}`\n'
      + '\t\tif got, want := 2, 1; got != want {\n'
      + '\t\t\tt.Fatalf("got %d want %d", got, want)\n'
      + '\t\t}\n'
      + '\t})\n'
      + '}\n')
    const moved = findings(dir, [row], named)
    assert.ok(moved.blocks.some(b => b.includes('locked dirty') && b.includes('hash moved')),
      moved.blocks.join('\n'))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a Go method Test is hashed, and rewriting the assertion refuses done', () => {
  // Package-level `func Test` does not match `func (s *T) TestXxx`.
  const dir = tmpRepo()
  const rel = 'tests/lock_subject_test.go'
  const named = [['TestLockDirty', rel]]
  const rowLine = '| `TestLockDirty` | `tests/lock_subject_test.go` | lock | F-1 |'
  try {
    mkdirSync(join(dir, 'tests'), { recursive: true })
    writeFileSync(join(dir, rel),
      'package lock\n\nimport "testing"\n\n'
      + 'type S struct{}\n\n'
      + 'func (s *S) TestLockDirty(t *testing.T) {\n'
      + '\ttoken := `}`\n'
      + '\tif got, want := 2, 2; got != want {\n'
      + '\t\tt.Fatalf("got %d want %d", got, want)\n'
      + '\t}\n'
      + '}\n')
    const suffix = recordOp({ op: 'suffix', root: dir, text: taskMarkdown([rowLine]) }).suffix
    assert.match(suffix, /test-lock-sha256:[0-9a-f]{64}/)
    const row = `- 2026-09-13 · no-git · exit 2 · \`go test .\` · acceptance-sha256:${'0'.repeat(64)} · ms:12${suffix}`
    const locked = findings(dir, [row], named)
    assert.deepEqual(locked.blocks, [], locked.blocks.join('\n'))
    writeFileSync(join(dir, rel),
      'package lock\n\nimport "testing"\n\n'
      + 'type S struct{}\n\n'
      + 'func (s *S) TestLockDirty(t *testing.T) {\n'
      + '\ttoken := `}`\n'
      + '\tif got, want := 2, 1; got != want {\n'
      + '\t\tt.Fatalf("got %d want %d", got, want)\n'
      + '\t}\n'
      + '}\n')
    const moved = findings(dir, [row], named)
    assert.ok(moved.blocks.some(b => b.includes('TestLockDirty') && b.includes('hash moved')),
      moved.blocks.join('\n'))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a shell test_* function is hashed, and rewriting the assertion refuses done', () => {
  // spec-verify already paid for shell functions whose leaf starts with test.
  const dir = tmpRepo()
  const rel = 'tests/lock_subject.sh'
  const named = [['test_lock_dirty', rel]]
  const rowLine = '| `test_lock_dirty` | `tests/lock_subject.sh` | lock | F-1 |'
  try {
    mkdirSync(join(dir, 'tests'), { recursive: true })
    writeFileSync(join(dir, rel),
      'test_lock_dirty() {\n'
      + "  token='}'\n"
      + '  [ 2 -eq 2 ]\n'
      + '}\n')
    const suffix = recordOp({ op: 'suffix', root: dir, text: taskMarkdown([rowLine]) }).suffix
    assert.match(suffix, /test-lock-sha256:[0-9a-f]{64}/)
    const row = `- 2026-09-13 · no-git · exit 2 · \`bash tests/lock_subject.sh\` · acceptance-sha256:${'0'.repeat(64)} · ms:12${suffix}`
    const locked = findings(dir, [row], named)
    assert.deepEqual(locked.blocks, [], locked.blocks.join('\n'))
    writeFileSync(join(dir, rel),
      'test_lock_dirty() {\n'
      + "  token='}'\n"
      + '  [ 2 -eq 1 ]\n'
      + '}\n')
    const moved = findings(dir, [row], named)
    assert.ok(moved.blocks.some(b => b.includes('test_lock_dirty') && b.includes('hash moved')),
      moved.blocks.join('\n'))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a Go signature comment does not keep the first-red hash after the assertion moves', () => {
  // A `{` in /* */ after the signature paren is not the body. Unmasked
  // find("{") / depth-0 after `)` hashed `{}` and left done permitted.
  const dir = tmpRepo()
  const rel = 'tests/lock_subject_test.go'
  const named = [['TestLockDirty', rel]]
  const rowLine = '| `TestLockDirty` | `tests/lock_subject_test.go` | lock | F-1 |'
  try {
    mkdirSync(join(dir, 'tests'), { recursive: true })
    writeFileSync(join(dir, rel),
      'package lock\n\nimport "testing"\n\n'
      + 'func TestLockDirty(t *testing.T) /* {} */ {\n'
      + '\tif got, want := 2, 2; got != want {\n'
      + '\t\tt.Fatalf("got %d want %d", got, want)\n'
      + '\t}\n'
      + '}\n')
    const suffix = recordOp({ op: 'suffix', root: dir, text: taskMarkdown([rowLine]) }).suffix
    assert.match(suffix, /test-lock-sha256:[0-9a-f]{64}/)
    const row = `- 2026-09-13 · no-git · exit 2 · \`go test .\` · acceptance-sha256:${'0'.repeat(64)} · ms:12${suffix}`
    const locked = findings(dir, [row], named)
    assert.deepEqual(locked.blocks, [], locked.blocks.join('\n'))
    writeFileSync(join(dir, rel),
      'package lock\n\nimport "testing"\n\n'
      + 'func TestLockDirty(t *testing.T) /* {} */ {\n'
      + '\tif got, want := 2, 1; got != want {\n'
      + '\t\tt.Fatalf("got %d want %d", got, want)\n'
      + '\t}\n'
      + '}\n')
    const moved = findings(dir, [row], named)
    assert.ok(moved.blocks.some(b => b.includes('TestLockDirty') && b.includes('hash moved')),
      moved.blocks.join('\n'))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a Go t.Run that names a helper stays unproven', () => {
  // t.Run("name", helper) has no closure `{`. Hashing the next func is the
  // wrong body; could-not-look is UNPROVEN, not a hash of helper.
  const dir = tmpRepo()
  const rel = 'tests/lock_subject_test.go'
  try {
    mkdirSync(join(dir, 'tests'), { recursive: true })
    writeFileSync(join(dir, rel),
      'package lock\n\nimport "testing"\n\n'
      + 'func TestLockDirty(t *testing.T) {\n'
      + '\tt.Run("locked dirty", helper)\n'
      + '}\n'
      + 'func helper(t *testing.T) {\n'
      + '\tif got, want := 2, 2; got != want {\n'
      + '\t\tt.Fatalf("got %d want %d", got, want)\n'
      + '\t}\n'
      + '}\n')
    const suffix = recordOp({
      op: 'suffix',
      root: dir,
      text: taskMarkdown(['| `locked dirty` | `tests/lock_subject_test.go` | lock | F-1 |']),
    }).suffix
    const row = `- 2026-09-13 · no-git · exit 2 · \`go test .\` · acceptance-sha256:${'0'.repeat(64)} · ms:12${suffix}`
    const got = findings(dir, [row], [['locked dirty', rel]])
    assert.ok(got.blocks.some(b => b.includes('locked dirty') && /could not be hashed/.test(b)),
      got.blocks.join('\n'))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a Go t.Run that names a helper is not the next callback', () => {
  // t.Run("name", helper) then a sibling t.Run with a func. The first `{`
  // after the helper comma is the sibling's body — UNPROVEN, not that hash.
  const dir = tmpRepo()
  const rel = 'tests/lock_subject_test.go'
  try {
    mkdirSync(join(dir, 'tests'), { recursive: true })
    writeFileSync(join(dir, rel),
      'package lock\n\nimport "testing"\n\n'
      + 'func TestLockDirty(t *testing.T) {\n'
      + '\tt.Run("locked dirty", helper)\n'
      + '\tt.Run("other", func(t *testing.T) {\n'
      + '\t\tif 1 != 1 { t.Fatal("other") }\n'
      + '\t})\n'
      + '}\n')
    const suffix = recordOp({
      op: 'suffix',
      root: dir,
      text: taskMarkdown(['| `locked dirty` | `tests/lock_subject_test.go` | lock | F-1 |']),
    }).suffix
    const row = `- 2026-09-13 · no-git · exit 2 · \`go test .\` · acceptance-sha256:${'0'.repeat(64)} · ms:12${suffix}`
    const got = findings(dir, [row], [['locked dirty', rel]])
    assert.ok(got.blocks.some(b => b.includes('locked dirty') && /could not be hashed/.test(b)),
      got.blocks.join('\n'))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a Rust raw string does not swallow a same-line assertion', () => {
  // r#""//"# then assert_eq on the same line. C-style // in the digest
  // eats the assertion; invert must still move the hash.
  const dir = tmpRepo()
  const rel = 'tests/lock_subject.rs'
  const named = [['lock_dirty', rel]]
  const rowLine = '| `lock_dirty` | `tests/lock_subject.rs` | lock | F-1 |'
  try {
    mkdirSync(join(dir, 'tests'), { recursive: true })
    writeFileSync(join(dir, rel),
      '#[test]\n'
      + 'fn lock_dirty() {\n'
      + '    let _ = r#""//"#; assert_eq!(2, 2);\n'
      + '}\n')
    const suffix = recordOp({ op: 'suffix', root: dir, text: taskMarkdown([rowLine]) }).suffix
    assert.match(suffix, /test-lock-sha256:[0-9a-f]{64}/)
    const row = `- 2026-09-13 · no-git · exit 2 · \`cargo test\` · acceptance-sha256:${'0'.repeat(64)} · ms:12${suffix}`
    const locked = findings(dir, [row], named)
    assert.deepEqual(locked.blocks, [], locked.blocks.join('\n'))
    writeFileSync(join(dir, rel),
      '#[test]\n'
      + 'fn lock_dirty() {\n'
      + '    let _ = r#""//"#; assert_eq!(2, 1);\n'
      + '}\n')
    const moved = findings(dir, [row], named)
    assert.ok(moved.blocks.some(b => b.includes('lock_dirty') && b.includes('hash moved')),
      moved.blocks.join('\n'))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a shell URL does not keep the first-red hash after the assertion moves', () => {
  // https:// on the same line as the assertion. C-style // in the digest
  // eats from the URL through the test; invert must still move the hash.
  const dir = tmpRepo()
  const rel = 'tests/lock_subject.sh'
  const named = [['test_lock_dirty', rel]]
  const rowLine = '| `test_lock_dirty` | `tests/lock_subject.sh` | lock | F-1 |'
  try {
    mkdirSync(join(dir, 'tests'), { recursive: true })
    writeFileSync(join(dir, rel),
      'test_lock_dirty() {\n'
      + '  : https://example.invalid/#fragment; [ 2 -eq 2 ]\n'
      + '}\n')
    const suffix = recordOp({ op: 'suffix', root: dir, text: taskMarkdown([rowLine]) }).suffix
    assert.match(suffix, /test-lock-sha256:[0-9a-f]{64}/)
    const row = `- 2026-09-13 · no-git · exit 2 · \`bash tests/lock_subject.sh\` · acceptance-sha256:${'0'.repeat(64)} · ms:12${suffix}`
    const locked = findings(dir, [row], named)
    assert.deepEqual(locked.blocks, [], locked.blocks.join('\n'))
    writeFileSync(join(dir, rel),
      'test_lock_dirty() {\n'
      + '  : https://example.invalid/#fragment; [ 2 -eq 1 ]\n'
      + '}\n')
    const moved = findings(dir, [row], named)
    assert.ok(moved.blocks.some(b => b.includes('test_lock_dirty') && b.includes('hash moved')),
      moved.blocks.join('\n'))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('an escaped shell separator does not keep the first-red hash after the assertion moves', () => {
  // `\;#` is not a comment start. Treating an escaped `;` as a boundary
  // swallows the assertion; invert must still move the hash.
  const dir = tmpRepo()
  const rel = 'tests/lock_subject.sh'
  const named = [['test_lock_dirty', rel]]
  const rowLine = '| `test_lock_dirty` | `tests/lock_subject.sh` | lock | F-1 |'
  try {
    mkdirSync(join(dir, 'tests'), { recursive: true })
    writeFileSync(join(dir, rel),
      'test_lock_dirty() {\n'
      + '  : word\\;#fragment; [ 2 -eq 2 ]\n'
      + '}\n')
    const suffix = recordOp({ op: 'suffix', root: dir, text: taskMarkdown([rowLine]) }).suffix
    assert.match(suffix, /test-lock-sha256:[0-9a-f]{64}/)
    const row = `- 2026-09-13 · no-git · exit 2 · \`bash tests/lock_subject.sh\` · acceptance-sha256:${'0'.repeat(64)} · ms:12${suffix}`
    const locked = findings(dir, [row], named)
    assert.deepEqual(locked.blocks, [], locked.blocks.join('\n'))
    writeFileSync(join(dir, rel),
      'test_lock_dirty() {\n'
      + '  : word\\;#fragment; [ 2 -eq 1 ]\n'
      + '}\n')
    const moved = findings(dir, [row], named)
    assert.ok(moved.blocks.some(b => b.includes('test_lock_dirty') && b.includes('hash moved')),
      moved.blocks.join('\n'))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a Rust nested comment does not keep the first-red hash after the assertion moves', () => {
  const dir = tmpRepo()
  const rel = 'tests/lock_subject.rs'
  const named = [['lock_dirty', rel]]
  const rowLine = '| `lock_dirty` | `tests/lock_subject.rs` | lock | F-1 |'
  try {
    mkdirSync(join(dir, 'tests'), { recursive: true })
    writeFileSync(join(dir, rel),
      '#[test]\n'
      + 'fn lock_dirty() {\n'
      + '    let token = "x"; /* outer /* inner */ } */\n'
      + '    assert_eq!(2, 2);\n'
      + '}\n')
    const suffix = recordOp({ op: 'suffix', root: dir, text: taskMarkdown([rowLine]) }).suffix
    assert.match(suffix, /test-lock-sha256:[0-9a-f]{64}/)
    const row = `- 2026-09-13 · no-git · exit 2 · \`cargo test\` · acceptance-sha256:${'0'.repeat(64)} · ms:12${suffix}`
    const locked = findings(dir, [row], named)
    assert.deepEqual(locked.blocks, [], locked.blocks.join('\n'))
    writeFileSync(join(dir, rel),
      '#[test]\n'
      + 'fn lock_dirty() {\n'
      + '    let token = "x"; /* outer /* inner */ } */\n'
      + '    assert_eq!(2, 1);\n'
      + '}\n')
    const moved = findings(dir, [row], named)
    assert.ok(moved.blocks.some(b => b.includes('lock_dirty') && b.includes('hash moved')),
      moved.blocks.join('\n'))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a shell heredoc does not keep the first-red hash after the assertion moves', () => {
  const dir = tmpRepo()
  const rel = 'tests/lock_subject.sh'
  const named = [['test_lock_dirty', rel]]
  const rowLine = '| `test_lock_dirty` | `tests/lock_subject.sh` | lock | F-1 |'
  try {
    mkdirSync(join(dir, 'tests'), { recursive: true })
    writeFileSync(join(dir, rel),
      'test_lock_dirty() {\n'
      + '  cat <<EOF\n'
      + '}\n'
      + 'EOF\n'
      + '  [ 2 -eq 2 ]\n'
      + '}\n')
    const suffix = recordOp({ op: 'suffix', root: dir, text: taskMarkdown([rowLine]) }).suffix
    assert.match(suffix, /test-lock-sha256:[0-9a-f]{64}/)
    const row = `- 2026-09-13 · no-git · exit 2 · \`bash tests/lock_subject.sh\` · acceptance-sha256:${'0'.repeat(64)} · ms:12${suffix}`
    const locked = findings(dir, [row], named)
    assert.deepEqual(locked.blocks, [], locked.blocks.join('\n'))
    writeFileSync(join(dir, rel),
      'test_lock_dirty() {\n'
      + '  cat <<EOF\n'
      + '}\n'
      + 'EOF\n'
      + '  [ 2 -eq 1 ]\n'
      + '}\n')
    const moved = findings(dir, [row], named)
    assert.ok(moved.blocks.some(b => b.includes('test_lock_dirty') && b.includes('hash moved')),
      moved.blocks.join('\n'))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a Pest arrow test does not borrow the next test body', () => {
  // `fn () => expect(...)` has no `{`. An unbounded search for one lands in the
  // NEXT test's block, so the lock followed that body and ignored its own.
  const dir = tmpRepo()
  const rel = 'tests/LockArrowPest.php'
  const named = [['locked dirty', rel]]
  const rowLine = '| `locked dirty` | `tests/LockArrowPest.php` | lock | F-1 |'
  const source = (own, other) => '<?php\n'
    + `test('locked dirty', fn () => expect(2)->toBe(${own}));\n`
    + "test('other', function () {\n"
    + `    expect(1)->toBe(${other});\n`
    + '});\n'
  try {
    mkdirSync(join(dir, 'tests'), { recursive: true })
    writeFileSync(join(dir, rel), source(2, 1))
    const suffix = recordOp({ op: 'suffix', root: dir, text: taskMarkdown([rowLine]) }).suffix
    assert.match(suffix, /test-lock-sha256:[0-9a-f]{64}/)
    const row = `- 2026-09-13 · no-git · exit 2 · \`vendor/bin/pest\` · acceptance-sha256:${'0'.repeat(64)} · ms:12${suffix}`
    const locked = findings(dir, [row], named)
    assert.deepEqual(locked.blocks, [], locked.blocks.join('\n'))
    writeFileSync(join(dir, rel), source(2, 9))
    const otherMoved = findings(dir, [row], named)
    assert.equal(otherMoved.blocks.some(b => b.includes('locked dirty')), false,
      `the other test's body moved this lock:\n${otherMoved.blocks.join('\n')}`)
    writeFileSync(join(dir, rel), source(1, 1))
    const moved = findings(dir, [row], named)
    assert.ok(moved.blocks.some(b => b.includes('locked dirty') && b.includes('hash moved')),
      moved.blocks.join('\n'))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a PHP heredoc URL does not keep the first-red hash after its content moves', () => {
  // `//` inside <<<'EOT' is text, not a C comment. Stripping it ate the rest of
  // the heredoc line, so `/ok` → `/bad` left the digest unchanged.
  const dir = tmpRepo()
  const rel = 'tests/LockHeredocTest.php'
  const named = [['testLockedDirty', rel]]
  const rowLine = '| `testLockedDirty` | `tests/LockHeredocTest.php` | lock | F-1 |'
  const source = tail => '<?php\n'
    + 'final class LockHeredocTest extends TestCase\n'
    + '{\n'
    + '    public function testLockedDirty(): void\n'
    + '    {\n'
    + "        $expected = <<<'EOT'\n"
    + `        https://example.invalid/${tail}\n`
    + '        EOT;\n'
    + "        $this->assertSame($expected, route('x'));\n"
    + '    }\n'
    + '}\n'
  try {
    mkdirSync(join(dir, 'tests'), { recursive: true })
    writeFileSync(join(dir, rel), source('ok'))
    const suffix = recordOp({ op: 'suffix', root: dir, text: taskMarkdown([rowLine]) }).suffix
    assert.match(suffix, /test-lock-sha256:[0-9a-f]{64}/)
    const row = `- 2026-09-13 · no-git · exit 2 · \`vendor/bin/phpunit\` · acceptance-sha256:${'0'.repeat(64)} · ms:12${suffix}`
    const locked = findings(dir, [row], named)
    assert.deepEqual(locked.blocks, [], locked.blocks.join('\n'))
    writeFileSync(join(dir, rel), source('bad'))
    const moved = findings(dir, [row], named)
    assert.ok(moved.blocks.some(b => b.includes('testLockedDirty') && b.includes('hash moved')),
      moved.blocks.join('\n'))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a shell heredoc line beginning with # is not a comment in the digest', () => {
  // Inside <<EOF a `#` line is data. The shell comment rule saw a newline before
  // it and stripped the line, so `# ok` → `# bad` left the digest unchanged.
  const dir = tmpRepo()
  const rel = 'tests/lock_subject.sh'
  const named = [['test_lock_dirty', rel]]
  const rowLine = '| `test_lock_dirty` | `tests/lock_subject.sh` | lock | F-1 |'
  const source = word => 'test_lock_dirty() {\n'
    + '  expected=$(cat <<EOF\n'
    + `# ${word}\n`
    + 'EOF\n'
    + ')\n'
    + '  [ "$expected" = "# ok" ]\n'
    + '}\n'
  try {
    mkdirSync(join(dir, 'tests'), { recursive: true })
    writeFileSync(join(dir, rel), source('ok'))
    const suffix = recordOp({ op: 'suffix', root: dir, text: taskMarkdown([rowLine]) }).suffix
    assert.match(suffix, /test-lock-sha256:[0-9a-f]{64}/)
    const row = `- 2026-09-13 · no-git · exit 2 · \`bash tests/lock_subject.sh\` · acceptance-sha256:${'0'.repeat(64)} · ms:12${suffix}`
    const locked = findings(dir, [row], named)
    assert.deepEqual(locked.blocks, [], locked.blocks.join('\n'))
    writeFileSync(join(dir, rel), source('bad'))
    const moved = findings(dir, [row], named)
    assert.ok(moved.blocks.some(b => b.includes('test_lock_dirty') && b.includes('hash moved')),
      moved.blocks.join('\n'))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a regex literal that closes the call is UNPROVEN, not a truncated hash', () => {
  // Codex 2026-09-13: `/[)]/` closes the apparent call, so the expression body
  // was `/[` — a PROVEN hash of a prefix, and moving the assertion after it
  // did not move the lock. The masker does not know regex literals; the
  // extractor must refuse an unbalanced slice rather than hash it (ADR-005).
  const dir = tmpRepo()
  const rel = 'tests/lock-subject.test.mjs'
  const named = [['locked dirty', rel]]
  const rowLine = '| `locked dirty` | `tests/lock-subject.test.mjs` | lock | F-1 |'
  try {
    mkdirSync(join(dir, 'tests'), { recursive: true })
    writeFileSync(join(dir, rel),
      "test('locked dirty', () => /[)]/.test(')') && assert.fail('bad'))\n")
    const suffix = recordOp({ op: 'suffix', root: dir, text: taskMarkdown([rowLine]) }).suffix
    const row = `- 2026-09-13 · no-git · exit 2 · \`node --test\` · acceptance-sha256:${'0'.repeat(64)} · ms:12${suffix}`
    const got = findings(dir, [row], named)
    assert.ok(got.blocks.some(b => b.includes('locked dirty') && /could not be hashed/.test(b)),
      `a truncated expression must be UNPROVEN, not locked:\n${got.blocks.join('\n')}`)
    // Codex, second pass: `/\)/` has no bracket to unbalance, so a balance test
    // alone still hashed `/\`. A `/` outside a string is a regex or a division
    // and the masker knows neither — the expression is refused, not parsed.
    // Its OWN lock row: reusing the first row would report the first fixture's
    // UNPROVEN entry and prove nothing about this file (a vacuous pass, found
    // when the mutant that drops the refusal survived it).
    writeFileSync(join(dir, rel),
      "test('locked dirty', () => /\\)/.test(')') && assert.equal(1, 2))\n")
    const escapedSuffix = recordOp({ op: 'suffix', root: dir, text: taskMarkdown([rowLine]) }).suffix
    const escapedRow = `- 2026-09-13 · no-git · exit 2 · \`node --test\` · acceptance-sha256:${'0'.repeat(64)} · ms:12${escapedSuffix}`
    const escaped = findings(dir, [escapedRow], named)
    assert.ok(escaped.blocks.some(b => b.includes('locked dirty') && /could not be hashed/.test(b)),
      `an escaped paren in a regex must be UNPROVEN, not locked:\n${escaped.blocks.join('\n')}`)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a heredoc inside a command substitution inside arithmetic is still a heredoc', () => {
  // Codex 2026-09-13, fifth pass: `n=$(( $(if false; then cat <<EOF` put a real
  // heredoc between `((` and `))`. Calling that `<<` a shift left the payload
  // unmasked, its `}` closed the function early, and the lock held a PROVEN
  // hash of a prefix that no assertion edit could move. Only purely arithmetic
  // text between `((` and `<<` makes a shift; a `$(`, quote or `;` makes it a
  // heredoc. Same for a `((` carried by a multi-line string on the opener line.
  const dir = tmpRepo()
  const rel = 'tests/lock_subject.sh'
  const named = [['test_lock_dirty', rel]]
  const rowLine = '| `test_lock_dirty` | `tests/lock_subject.sh` | lock | F-1 |'
  const shapes = {
    substitution: rhs => 'test_lock_dirty() {\n'
      + '  n=$(( $(if false; then cat <<EOF\n}\nEOF\nfi; echo 1) + 0 ))\n'
      + `  [ 1 -eq ${rhs} ]\n`
      + '}\n',
    multilineString: rhs => 'test_lock_dirty() {\n'
      + '  p="first\n'
      + '(( \\""; if false; then cat <<EOF\n}\nEOF\nfi\n'
      + `  [ 1 -eq ${rhs} ]\n`
      + '}\n',
  }
  try {
    mkdirSync(join(dir, 'tests'), { recursive: true })
    for (const [label, source] of Object.entries(shapes)) {
      writeFileSync(join(dir, rel), source(2))
      const suffix = recordOp({ op: 'suffix', root: dir, text: taskMarkdown([rowLine]) }).suffix
      assert.match(suffix, /test-lock-sha256:[0-9a-f]{64}/, label)
      const row = `- 2026-09-13 · no-git · exit 2 · \`bash tests/lock_subject.sh\` · acceptance-sha256:${'0'.repeat(64)} · ms:12${suffix}`
      const locked = findings(dir, [row], named)
      assert.deepEqual(locked.blocks, [], `${label}:\n${locked.blocks.join('\n')}`)
      writeFileSync(join(dir, rel), source(1))
      const moved = findings(dir, [row], named)
      assert.ok(moved.blocks.some(b => b.includes('test_lock_dirty') && b.includes('hash moved')),
        `${label}: the assertion after the heredoc must be in the hash:\n${moved.blocks.join('\n')}`)
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a "((" inside a string does not stop a later heredoc from being seen', () => {
  // Codex 2026-09-13, fourth pass: `_in_arithmetic` searched raw text, so a
  // `pattern='(('` two lines up made every later `<<` a shift. The heredoc was
  // then not masked, its `}` payload closed the function early, and the lock
  // held a PROVEN hash of a prefix that no later assertion edit could move.
  const dir = tmpRepo()
  const rel = 'tests/lock_subject.sh'
  const named = [['test_lock_dirty', rel]]
  const rowLine = '| `test_lock_dirty` | `tests/lock_subject.sh` | lock | F-1 |'
  const source = rhs => 'test_lock_dirty() {\n'
    + "  pattern='(('\n"
    + '  cat <<EOF\n'
    + '}\n'
    + 'EOF\n'
    + `  [ 1 -eq ${rhs} ]\n`
    + '}\n'
  try {
    mkdirSync(join(dir, 'tests'), { recursive: true })
    writeFileSync(join(dir, rel), source(2))
    const suffix = recordOp({ op: 'suffix', root: dir, text: taskMarkdown([rowLine]) }).suffix
    assert.match(suffix, /test-lock-sha256:[0-9a-f]{64}/)
    const row = `- 2026-09-13 · no-git · exit 2 · \`bash tests/lock_subject.sh\` · acceptance-sha256:${'0'.repeat(64)} · ms:12${suffix}`
    const locked = findings(dir, [row], named)
    assert.deepEqual(locked.blocks, [], locked.blocks.join('\n'))
    writeFileSync(join(dir, rel), source(1))
    const moved = findings(dir, [row], named)
    assert.ok(moved.blocks.some(b => b.includes('test_lock_dirty') && b.includes('hash moved')),
      `the assertion after the heredoc must be in the hash:\n${moved.blocks.join('\n')}`)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a comment on a heredoc opener line is still a comment', () => {
  // Codex 2026-09-13: `cat <<EOF # one` copied the whole opener line into the
  // digest, so editing the comment refused done. The opener token is code, the
  // rest of its line is code, only the payload is data.
  const dir = tmpRepo()
  const rel = 'tests/lock_subject.sh'
  const named = [['test_lock_dirty', rel]]
  const rowLine = '| `test_lock_dirty` | `tests/lock_subject.sh` | lock | F-1 |'
  const source = (comment, payload) => 'test_lock_dirty() {\n'
    + `  cat <<EOF # ${comment}\n`
    + `${payload}\n`
    + 'EOF\n'
    + '}\n'
  try {
    mkdirSync(join(dir, 'tests'), { recursive: true })
    writeFileSync(join(dir, rel), source('one', 'payload'))
    const suffix = recordOp({ op: 'suffix', root: dir, text: taskMarkdown([rowLine]) }).suffix
    assert.match(suffix, /test-lock-sha256:[0-9a-f]{64}/)
    const row = `- 2026-09-13 · no-git · exit 2 · \`bash tests/lock_subject.sh\` · acceptance-sha256:${'0'.repeat(64)} · ms:12${suffix}`
    const locked = findings(dir, [row], named)
    assert.deepEqual(locked.blocks, [], locked.blocks.join('\n'))
    writeFileSync(join(dir, rel), source('two', 'payload'))
    const commentOnly = findings(dir, [row], named)
    assert.deepEqual(commentOnly.blocks, [], `a comment-only edit moved the lock:\n${commentOnly.blocks.join('\n')}`)
    writeFileSync(join(dir, rel), source('one', 'changed'))
    const moved = findings(dir, [row], named)
    assert.ok(moved.blocks.some(b => b.includes('test_lock_dirty') && b.includes('hash moved')),
      moved.blocks.join('\n'))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('the hasher survives seeded stress against bash and a generator oracle', (t) => {
  // stress-testing skill, adapted: arm 1 generates shell test bodies from pools
  // that mix data and comment shapes (heredocs, URL fragments, escaped
  // separators) and asks BASH whether the edit is observable — an observable
  // edit must move the digest, a comment-only one must not. Arm 2 writes BDD
  // files and remembers each callback; the extractor must hand back exactly
  // that, never a neighbour's. The oracles come from the promise, not the code.
  // Replay a failure with QH_STRESS_SEED=<seed> PYTHONPATH=plugin/lib python3
  // tests/test-lock-stress.py.
  // `-B` and a per-run cache prefix, because a stale `.pyc` decided a whole
  // measurement once: an edit inside the same second that left the file the
  // same SIZE produced bytecode Python still considered valid, so twelve seeds
  // measured the previous `record.py` and reported the fixed defect as open.
  const run = spawnSync('python3', ['-B', join(testDir, 'test-lock-stress.py')],
    { cwd: repoRoot, env: { ...pyEnv, PYTHONPYCACHEPREFIX: mkdtempSync(join(os.tmpdir(), 'qh-pyc-')) },
      encoding: 'utf8', timeout: 120_000 })
  assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`)
  // Selection is evidence: an arm that ran zero iterations exits 0 too.
  assert.match(run.stdout, /^arm2 iterations=[1-9]\d* php=[1-9]\d* js=[1-9]\d*$/m, run.stdout)
  assert.match(run.stdout, /^arm3 iterations=[1-9]\d* refused=[1-9]\d* allowed=[1-9]\d* no_lock_block=[1-9]\d* no_lock_advice=[1-9]\d* later_red=[1-9]\d*$/m,
    run.stdout)
  const unrun = run.stdout.match(/^arm1 UNRUN .*$/m)
  if (unrun) {
    // The bash the Windows runner hands Python is not the one the fence runs
    // under, and the arm said so (CI 34764859969: observable=0). Elsewhere bash
    // is what selftest.sh itself runs in, so UNRUN there is a real failure.
    assert.equal(process.platform, 'win32', `the bash oracle is required here:\n${run.stdout}`)
    t.skip(unrun[0])
    return
  }
  assert.match(run.stdout, /^arm1 iterations=[1-9]\d* observable=[1-9]\d* comment_only=[1-9]\d*$/m,
    run.stdout)
})

test('a later red carrying a different lock hash refuses done', () => {
  // ADR-050 §Decision: "done is refused … when a later red presents a different
  // hash." The reader took only the FIRST red and never looked at a second, so
  // a log holding two different locks passed whenever the tree still matched the
  // first one. Found by the verdict-layer stress arm, 2026-09-13, iteration 54.
  const dir = tmpRepo()
  const rel = 'tests/lock_subject.sh'
  const named = [['test_lock_dirty', rel]]
  const rowLine = '| `test_lock_dirty` | `tests/lock_subject.sh` | lock | F-1 |'
  const source = rhs => `test_lock_dirty() {\n  [ 2 -eq ${rhs} ]\n}\n`
  try {
    mkdirSync(join(dir, 'tests'), { recursive: true })
    writeFileSync(join(dir, rel), source(2))
    const first = recordOp({ op: 'suffix', root: dir, text: taskMarkdown([rowLine]) }).suffix
    writeFileSync(join(dir, rel), source(1))
    const second = recordOp({ op: 'suffix', root: dir, text: taskMarkdown([rowLine]) }).suffix
    assert.notEqual(first, second, 'the two reds must pin different bodies')
    writeFileSync(join(dir, rel), source(2))
    const row = digest => `- 2026-09-13 · no-git · exit 2 · \`bash tests/lock_subject.sh\` · acceptance-sha256:${digest.repeat(64)} · ms:12`
    // The tree matches the FIRST lock, so nothing has moved by the old reading.
    const agreeing = findings(dir, [`${row('0')}${first}`], named)
    assert.deepEqual(agreeing.blocks, [], agreeing.blocks.join('\n'))
    const conflicting = findings(dir, [`${row('0')}${first}`, `${row('1')}${second}`], named)
    assert.ok(conflicting.blocks.some(b => /later red row carries a different/.test(b)),
      `a second red pinning other bodies must refuse:\n${conflicting.blocks.join('\n')}`)
    // A later red that carries NO lock is the writer's own shape and is fine.
    const ordinary = findings(dir, [`${row('0')}${first}`, row('1')], named)
    assert.deepEqual(ordinary.blocks, [], ordinary.blocks.join('\n'))
    // And a sha-shaped string in the COMMAND is not a lock: the field is read
    // from the end of the row, or a fence whose text mentions one would refuse
    // a task whose tests never moved (Codex, pass 7).
    const shaInCommand = `- 2026-09-13 · no-git · exit 2 · \`grep test-lock-sha256:${'c'.repeat(64)} log\` · acceptance-sha256:${'1'.repeat(64)} · ms:12`
    const commandOnly = findings(dir, [`${row('0')}${first}`, shaInCommand], named)
    assert.deepEqual(commandOnly.blocks, [],
      `a sha in the command text must not read as a later lock:\n${commandOnly.blocks.join('\n')}`)
    const asFirst = findings(dir, [shaInCommand], named)
    assert.ok(asFirst.blocks.some(b => /no first-red test-lock-sha256/.test(b)), asFirst.blocks.join('\n'))
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

// Swift: a first red on a Swift task used to lock every row `unproven` because
// `.swift` fell through to the BDD reader (measured 2026-09-13 on 2.98.1 from
// an iOS repository whose ADR names Swift Testing and XCTest functions).
function swiftLock(rel, rowName, before, after, runner = 'swift test') {
  const dir = tmpRepo()
  const named = [[rowName, rel]]
  const rowLine = `| \`${rowName}\` | \`${rel}\` | lock | F-1 |`
  try {
    mkdirSync(join(dir, dirname(rel)), { recursive: true })
    writeFileSync(join(dir, rel), before)
    const suffix = recordOp({ op: 'suffix', root: dir, text: taskMarkdown([rowLine]) }).suffix
    assert.match(suffix, /test-lock-sha256:[0-9a-f]{64}/)
    const payload = Buffer.from(suffix.split('test-lock-b64:')[1], 'base64url').toString('utf8')
    assert.ok(!payload.includes('unproven'), `first red locked an unproven row:\n${payload}`)
    const row = `- 2026-09-13 · no-git · exit 1 · \`${runner}\` · acceptance-sha256:${'0'.repeat(64)} · ms:12${suffix}`
    const locked = findings(dir, [row], named)
    assert.deepEqual(locked.blocks, [], locked.blocks.join('\n'))
    writeFileSync(join(dir, rel), after)
    return findings(dir, [row], named)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

function swiftNames(source) {
  const r = python(
    'import json, sys\nfrom record import extract_test_names\n'
    + 'print(json.dumps(extract_test_names(sys.stdin.read(), swift=True)))',
    source)
  assert.equal(r.status, 0, r.stderr)
  return JSON.parse(r.stdout)
}

test('a Swift Testing @Test func is hashed, and rewriting the assertion refuses done', () => {
  const body = expect => 'import Testing\n'
    + '@Suite struct LockSubjectTests {\n'
    + '  @Test(.disabled("}")) func skippedOne() {}\n'
    + '  @Test("display {name}", arguments: [1, 2])\n'
    + '  @MainActor func lockDirty(value: Int) async throws {\n'
    + '    let token = "}"\n'
    + `    #expect(${expect})\n`
    + '  }\n'
    + '}\n'
  const moved = swiftLock('Tests/LockSubjectTests.swift', 'lockDirty',
    body('value == value'), body('value != value'))
  assert.ok(moved.blocks.some(b => b.includes('lockDirty') && b.includes('hash moved')),
    moved.blocks.join('\n'))
})

test('an XCTest test method is hashed, and rewriting the assertion refuses done', () => {
  const body = expected => 'import XCTest\n'
    + 'final class LockSubjectTests: XCTestCase {\n'
    + '  override func setUp() { super.setUp() }\n'
    + '  func testLockDirty() throws {\n'
    + '    let token = "}"\n'
    + `    XCTAssertEqual(2, ${expected})\n`
    + '  }\n'
    + '}\n'
  const moved = swiftLock('UITests/LockSubjectTests.swift', 'testLockDirty', body('2'), body('1'),
    'xcodebuild test')
  assert.ok(moved.blocks.some(b => b.includes('testLockDirty') && b.includes('hash moved')),
    moved.blocks.join('\n'))
})

test('Swift test names are the @Test funcs and argument-less XCTest methods only', () => {
  const names = swiftNames('import Testing\nimport XCTest\n'
    + '// @Test func commentedOut() {}\n'
    + 'let text = "@Test func inAString() {}"\n'
    + '@Test func plain() {}\n'
    + '@Test(arguments: [1]) static func withArgs(x: Int) {}\n'
    + 'final class C: XCTestCase {\n'
    + '  func testNoArgs() {}\n'
    + '  func testTakesAnArgument(_ x: Int) {}\n'
    + '  func helperNotATest() {}\n'
    + '}\n')
  assert.deepEqual(names.sort(), ['plain', 'testNoArgs', 'withArgs'])
})

test('a brace inside a Swift multi-line, raw or interpolated string does not keep the first-red hash after the assertion moves', () => {
  const body = expect => 'import Testing\n'
    + '@Test func lockDirty() {\n'
    + '  let doc = """\n'
    + '    } // not a comment\n'
    + '    """\n'
    + '  let raw = #"a"}\\(not interpolated)"#; #expect(' + expect + ')\n'
    + '  let interp = "a \\(label("}")) b \\(label("(")) c"\n'
    + '}\n'
    + 'func label(_ s: String) -> String { s }\n'
  const moved = swiftLock('Tests/LockStrings.swift', 'lockDirty', body('2 == 2'), body('2 == 1'))
  assert.ok(moved.blocks.some(b => b.includes('lockDirty') && b.includes('hash moved')),
    moved.blocks.join('\n'))
})

test('a Swift nested block comment does not keep the first-red hash after the assertion moves', () => {
  const body = expect => 'import Testing\n'
    + '@Test func lockDirty() {\n'
    + '  let token = "x" /* outer /* inner */ } */\n'
    + `  #expect(${expect})\n`
    + '}\n'
  const moved = swiftLock('Tests/LockComments.swift', 'lockDirty', body('2 == 2'), body('2 == 1'))
  assert.ok(moved.blocks.some(b => b.includes('lockDirty') && b.includes('hash moved')),
    moved.blocks.join('\n'))
})

test('rewording a Swift comment inside a locked test does not move its hash', () => {
  const body = note => 'import Testing\n'
    + '@Test func lockDirty() {\n'
    + `  // ${note}\n`
    + '  #expect(2 == 2)\n'
    + '}\n'
  const moved = swiftLock('Tests/LockCommentOnly.swift', 'lockDirty', body('first wording'), body('second wording'))
  assert.deepEqual(moved.blocks, [], moved.blocks.join('\n'))
})

// Codex review of 4678b63 (2026-09-13): each of these kept the first-red hash
// after the assertion moved, or left a declared test unnamed.
function swiftMoved(rel, before, after, name = 'probe') {
  const moved = swiftLock(rel, name, before, after)
  assert.ok(moved.blocks.some(b => b.includes(name) && b.includes('hash moved')),
    moved.blocks.join('\n'))
}

test('a Swift body that might hold a bare regex literal is UNPROVEN, not a possibly truncated hash', () => {
  // Codex re-review of d6e736d: telling `/…/` from division needs the type
  // checker, so a code slash with a brace, slash, star or backslash after it on
  // its line refuses the body instead of hashing what may be a prefix.
  for (const [rel, line] of [
    ['Tests/LockBareRegex.swift', 'let r = /[}]/'],
    ['Tests/LockRegexAfterComment.swift', 'let r = /* note */ /[}]/'],
    ['Tests/LockRegexCondition.swift', 'if /[}]/ ~= "}" {}'],
    ['Tests/LockRegexEscapedSpace.swift', 'let r = /[}]\\ /'],
    ['Tests/LockForceUnwrapDivision.swift', 'let r = total!/f("x/}")'],
  ]) {
    swiftUnproven(rel, `@Test func probe() {\n  ${line}\n  #expect(2 == 2)\n}\n`)
  }
})

test('spaced and compact Swift division keep a proven hash that moves with the assertion', () => {
  const body = expect => '@Test func probe() {\n  let ratio = total / count / 2\n  let avg = sum/count\n'
    + `  #expect(${expect})\n}\n`
  swiftMoved('Tests/LockDivision.swift', body('2 == 2'), body('2 == 1'))
})

test('an escaped delimiter inside an extended Swift regex does not end it early', () => {
  const body = expect => '@Test func probe() {\n  let r = #/a\\/#\\}b/#\n'
    + `  #expect(${expect})\n}\n`
  swiftMoved('Tests/LockExtendedRegex.swift', body('2 == 2'), body('2 == 1'))
})

test('a Swift regex literal holding // does not strip a same-line assertion from the digest', () => {
  const body = expect => '@Test func probe() {\n'
    + `  let r = #/https?://example.com/#; #expect(${expect})\n}\n`
  swiftMoved('Tests/LockRegexDigest.swift', body('2 == 2'), body('2 == 1'))
})

test('a comment inside a Swift interpolation does not end the interpolation', () => {
  const body = expect => '@Test func probe() {\n  let s = "\\(/* ) */ "}")"\n'
    + `  #expect(${expect})\n}\n`
  swiftMoved('Tests/LockInterpolationComment.swift', body('2 == 2'), body('2 == 1'))
})

test('a Swift test name declared in two suites locks every declaration', () => {
  const body = expect => 'import Testing\n'
    + 'struct A { @Test func probe() { #expect(1 == 1) } }\n'
    + `struct B { @Test func probe() { #expect(${expect}) } }\n`
  swiftMoved('Tests/LockDuplicateNames.swift', body('2 == 2'), body('2 == 1'))
})

test('a Swift test with a backticked name is hashed', () => {
  const body = expect => `@Test func \`default\`() {\n  #expect(${expect})\n}\n`
  swiftMoved('Tests/LockBacktickName.swift', body('2 == 2'), body('2 == 1'), 'default')
})

test('rewording a comment inside a Swift interpolation does not move the hash', () => {
  const body = note => `@Test func probe() {\n  let s = "\\(1 /* ${note} */)"\n  #expect(2 == 2)\n}\n`
  const moved = swiftLock('Tests/LockInterpolationCommentOnly.swift', 'probe', body('first wording'), body('second wording'))
  assert.deepEqual(moved.blocks, [], moved.blocks.join('\n'))
})

function swiftUnproven(rel, source, name = 'probe') {
  const dir = tmpRepo()
  const rowLine = `| \`${name}\` | \`${rel}\` | lock | F-1 |`
  try {
    mkdirSync(join(dir, dirname(rel)), { recursive: true })
    writeFileSync(join(dir, rel), source)
    const suffix = recordOp({ op: 'suffix', root: dir, text: taskMarkdown([rowLine]) }).suffix
    const payload = Buffer.from(suffix.split('test-lock-b64:')[1], 'base64url').toString('utf8')
    assert.ok(payload.includes(`unproven\t${rel}\t${name}`), `expected UNPROVEN for ${rel}:\n${payload}`)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

test('a backticked XCTest method sharing a name with a plain one locks both bodies', () => {
  const body = expected => 'import XCTest\n'
    + 'final class A: XCTestCase {\n  func testProbe() { XCTAssertEqual(2, 2) }\n}\n'
    + `final class B: XCTestCase {\n  func \`testProbe\`() { XCTAssertEqual(2, ${expected}) }\n}\n`
  swiftMoved('UITests/LockBacktickXCTest.swift', body('2'), body('1'), 'testProbe')
})

// Third Codex pass on the refusal (2026-09-13): parser-valid Swift that still
// kept the hash, and ordinary division it refused.
test('a bare regex inside an interpolation, or outside the test, makes the Swift file UNPROVEN', () => {
  swiftUnproven('Tests/LockRegexInTripleInterpolation.swift',
    '@Test func probe() {\n let s = """\n \\({\n  let r = /[\\/*]/\n  #expect(2 == 2)\n  // */\n  return 0\n }())\n """\n}\n')
  swiftUnproven('Tests/LockRegexInInterpolation.swift',
    '@Test func probe() {\n let s = "\\({ let r = /[\\/*]/; #expect(2 == 2); let t = #""*/""#; return 0 }())"\n}\n')
  swiftUnproven('Tests/LockRegexOutsideTest.swift',
    'let helper = /[}/*]/\n@Test func probe() { #expect(3 == 3) }\n')
})

test('compact division, a trailing comment after division and a URL string keep a proven Swift hash', () => {
  const body = expect => '@Test func probe() {\n  let x = 8/2*3\n  let y = 8/2 // divide\n'
    + `  let u = "https://example.com/a/b"\n  #expect(${expect})\n}\n`
  swiftMoved('Tests/LockDivisionControls.swift', body('2 == 2'), body('2 == 1'))
})

test('an XCTest method declared inline on its class line is hashed', () => {
  const body = expected => `final class C: XCTestCase { func testInline() { XCTAssertEqual(1, ${expected}) } }\n`
  swiftMoved('UITests/LockInlineXCTest.swift', body('1'), body('2'), 'testInline')
})

// Fourth Codex pass (2026-09-13).
test('a multi-line XCTest signature and a qualified @Testing.Test are locked beside a same-named test', () => {
  const xctest = expected => 'import XCTest\nfinal class A: XCTestCase {\n  func testProbe() { XCTAssertEqual(1, 1) }\n}\n'
    + `final class B: XCTestCase {\n  func testProbe(\n  ) { XCTAssertEqual(2, ${expected}) }\n}\n`
  swiftMoved('UITests/LockMultilineXCTest.swift', xctest('2'), xctest('1'), 'testProbe')
  const qualified = expect => 'import Testing\nstruct A { @Test func probe() { #expect(1 == 1) } }\n'
    + `struct B { @Testing.Test func probe() { #expect(${expect}) } }\n`
  swiftMoved('Tests/LockQualifiedTest.swift', qualified('2 == 2'), qualified('2 == 1'))
})

test('whitespace inside a Swift string literal is part of the locked body', () => {
  swiftMoved('Tests/LockStringWhitespace.swift',
    '@Test func probe() { #expect("a  b" == "a b") }\n',
    '@Test func probe() { #expect("a b" == "a b") }\n')
  swiftMoved('Tests/LockMultilineStringWhitespace.swift',
    '@Test func probe() {\n  let s = """\n    a  b\n    """\n  #expect(s == "a b")\n}\n',
    '@Test func probe() {\n  let s = """\n    a b\n    """\n  #expect(s == "a b")\n}\n')
})

test('division with no closing slash on its line keeps a proven Swift hash, a quote inside a possible regex refuses', () => {
  swiftMoved('Tests/LockInlineDivision.swift',
    '@Test func probe() { let x = 8/2; #expect(x == 4) }\n',
    '@Test func probe() { let x = 8/2; #expect(x == 5) }\n')
  swiftMoved('Tests/LockChainedDivision.swift',
    '@Test func probe() {\n  let x = 8/2/2\n  #expect(x == 2)\n}\n',
    '@Test func probe() {\n  let x = 8/2/2\n  #expect(x == 3)\n}\n')
  swiftUnproven('Tests/LockQuoteRegex.swift',
    '@Test func probe() { let r = /"/; let s = "}"; #expect(2 == 2) }\n')
})

// Fifth Codex pass (2026-09-13).
test('whitespace inside a possible bare Swift regex literal is part of the locked body', () => {
  swiftMoved('Tests/LockRegexWhitespace.swift',
    '@Test func probe() {\n  #expect("a b".wholeMatch(of: /a  b/) == nil)\n}\n',
    '@Test func probe() {\n  #expect("a b".wholeMatch(of: /a b/) == nil)\n}\n')
})

test('spaced and intervening qualified attributes lock a same-named Swift test, an unrecognised one refuses', () => {
  const pair = (attr, expect) => 'import Testing\nstruct A { @Test func probe() { #expect(1 == 1) } }\n'
    + `struct B { ${attr} func probe() { #expect(${expect}) } }\n`
  swiftMoved('Tests/LockSpacedQualified.swift', pair('@Testing . Test', '2 == 2'), pair('@Testing . Test', '2 == 1'))
  swiftMoved('Tests/LockInterveningQualified.swift',
    pair('@Test @_Concurrency.MainActor', '2 == 2'), pair('@Test @_Concurrency.MainActor', '2 == 1'))
  swiftUnproven('Tests/LockUnrecognisedAttribute.swift', pair('@MyMacro', '2 == 2'))
})

test('a trailing comment after inline Swift division keeps a proven hash', () => {
  swiftMoved('Tests/LockDivisionTrailingComment.swift',
    '@Test func probe() { let x = 8/2; #expect(x == 4) } // comment\n',
    '@Test func probe() { let x = 8/2; #expect(x == 5) } // comment\n')
})

// Sixth Codex pass (2026-09-13).
test('an apostrophe inside a possible Swift regex refuses the file', () => {
  swiftUnproven('Tests/LockApostropheRegex.swift',
    'import Testing\n@Test func probe() {\n let r = /\'/; let s = "\'//"; #expect(2 == 2)\n}\n')
})
