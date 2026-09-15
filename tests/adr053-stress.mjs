#!/usr/bin/env node
// Stress leftover class (ADR-054 F-1/F-2/F-3) against oracles from
// docs/specs/2026-09-15-a-go-raw-string-is-not-an-escape.md and ADR-053 T1
// Decision. Not a transcription of PUBLISH_SUFFIX or the hasher quote loop.
//
// Replay:
//   QH_ADR053_STRESS_SEED=<n> node tests/adr053-stress.mjs
//   QH_ADR053_STRESS_MUTANTS=1 node tests/adr053-stress.mjs
// Default QH_ADR053_STRESS_ITERS=80. Leftover tests set 8. Deeper run is env.
//
// Pools enumerated 2026-09-15 (commands, not memory):
//   wrappers: `rg -n 'PUBLISH_SUFFIX' plugin/scripts/lifecycle.mjs`
//     T1 words command|env|sudo|exec|time. Spec invoking args: sudo -n,
//     sudo -n -u ci, env FOO=bar, env -u HOME FOO=bar, command --, time -p.
//     LEFT OUT of invoking: command -v (path lookup). LEFT OUT of the word list:
//     nice / nohup / stdbuf (spec Non-Goals).
//   keep names: `rg -n 'for name in \("expect"' plugin/bin/adr-lint`
//     → expect, require. LEFT OUT: expected, require_once, #[.
//   Go raw: `rg -n 'raw_backtick = go' plugin/lib/record.py`
//     member: raw string whose last content byte is a backslash, then a later
//     comment backtick. Fixture text includes go=True extraction.
//   publish verbs: `rg -n "\['commit', 'push'\]" plugin/scripts/lifecycle.mjs`
//   silent joiners: && and newline (ADR-053 T1). LEFT OUT of silent: || ; |
//   checks: pnpm check (VALIDATION_PATTERNS). LEFT OUT: mrw write --check.
//
// Arm 3 does not apply: leftover class is publishPrecededByValidation /
// extract_test_body / check_tests_can_fail, not a CLI exit-code matrix.
// ADR-053 T2–T4 campaign arms are not this suite.
// Mutants copy plugin/ so node --test parallelism cannot race the live tree.

import { spawnSync } from 'node:child_process'
import {
  cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { runPython } from '../scripts/python-interpreter.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pluginDir = process.env.QH_LEFTOVER_PLUGIN
  ?? path.join(repoRoot, 'plugin')
const SEED = Number(process.env.QH_ADR053_STRESS_SEED ?? '54')
const ITERATIONS = Number(process.env.QH_ADR053_STRESS_ITERS ?? '80')

const lifecycle = await import(
  pathToFileURL(path.join(pluginDir, 'scripts/lifecycle.mjs')).href
)
const {
  isGitPublishCommand,
  isValidationCommand,
  publishPrecededByValidation,
} = lifecycle

const CHECKS = ['pnpm check']
const NOT_CHECKS = ['git add -A', 'echo hi', 'true']
const SILENT_JOIN = ['&&', '\n']
const LOUD_JOIN = ['||', ';', '|']
const PUBLISH = ['git commit -m x', 'git push']
const INVOKING = [
  '',
  'command ',
  'command -- ',
  'env ',
  'env FOO=bar ',
  'env -u HOME FOO=bar ',
  'sudo ',
  'sudo -n ',
  'sudo -n -u ci ',
  'exec ',
  'time ',
  'time -p ',
]
const NON_INVOKING = ['command -v ', 'nice ', 'nohup ', 'stdbuf ']
const PREFIXES = [...INVOKING, ...NON_INVOKING]

function fail(arm, label, detail = {}) {
  console.log(`${arm} FAIL seed=${SEED} ${label}`)
  for (const [key, value] of Object.entries(detail)) {
    console.log(`--- ${key} ---`)
    console.log(typeof value === 'string' ? value : JSON.stringify(value, null, 2))
  }
  process.exit(1)
}

function lcg(seed) {
  let s = seed >>> 0
  return {
    next() {
      s = (Math.imul(1664525, s) + 1013904223) >>> 0
      return s / 0x100000000
    },
    pick(arr) {
      return arr[Math.floor(this.next() * arr.length)]
    },
  }
}

function joinCmd(left, joiner, right) {
  if (joiner === '\n') return `${left}\n${right}`
  return `${left} ${joiner} ${right}`
}

function oracleWant(check, joiner, prefix) {
  if (!CHECKS.includes(check)) return false
  if (!SILENT_JOIN.includes(joiner)) return false
  if (NON_INVOKING.includes(prefix)) return false
  return INVOKING.includes(prefix)
}

function py(args, input) {
  return runPython(args, {
    cwd: repoRoot,
    input,
    encoding: 'utf8',
    env: {
      ...process.env,
      PYTHONPATH: path.join(pluginDir, 'lib'),
      PYTHONUTF8: '1',
      PYTHONIOENCODING: 'utf-8',
      PYTHONDONTWRITEBYTECODE: '1',
    },
  })
}

function arm1(rng) {
  let silent = 0
  let loud = 0
  let wholeFalse = 0
  const grid = []
  for (const check of CHECKS) {
    for (const joiner of [...SILENT_JOIN, ...LOUD_JOIN]) {
      for (const prefix of PREFIXES) {
        for (const publish of PUBLISH) {
          grid.push({
            command: joinCmd(check, joiner, `${prefix}${publish}`),
            want: oracleWant(check, joiner, prefix),
          })
        }
      }
    }
  }
  grid.push({
    command: 'pnpm check && git commit -m x && git push',
    want: true,
  })
  grid.push({ command: 'git commit -m x', want: false })
  grid.push({
    command: 'git add -A && git commit -m x',
    want: false,
  })
  for (let i = 0; i < ITERATIONS; i++) {
    const check = rng.pick([...CHECKS, ...NOT_CHECKS])
    const joiner = rng.pick([...SILENT_JOIN, ...LOUD_JOIN])
    const prefix = rng.pick(PREFIXES)
    const publish = rng.pick(PUBLISH)
    grid.push({
      command: joinCmd(check, joiner, `${prefix}${publish}`),
      want: oracleWant(check, joiner, prefix),
    })
  }

  for (const [index, row] of grid.entries()) {
    let got
    try {
      got = publishPrecededByValidation(row.command)
    } catch (error) {
      fail('arm1', `threw on command[${index}]`, {
        command: row.command, error: String(error),
      })
    }
    if (got !== row.want) {
      fail('arm1', `oracle != product i=${index}`, {
        command: row.command, want: row.want, got,
      })
    }
    if (typeof row.command === 'string'
        && /&&|\|\||;|\n/.test(row.command)
        && isGitPublishCommand(row.command)) {
      if (isValidationCommand(row.command) !== false) {
        fail('arm1', 'whole-compound isValidationCommand must stay false', {
          command: row.command,
        })
      }
      wholeFalse += 1
    }
    if (row.want) silent += 1
    else if (isGitPublishCommand(row.command)) loud += 1
  }
  if (!(silent && loud && wholeFalse)) {
    fail('arm1', `nothing to observe silent=${silent} loud=${loud} wholeFalse=${wholeFalse}`)
  }
  console.log(`arm1 iterations=${grid.length} silent=${silent} loud=${loud} wholeFalse=${wholeFalse}`)
}

function goFixture(inner) {
  return [
    'package p',
    '',
    'func TestA(t *testing.T) {',
    `    s := \`${inner}\``,
    '    // later `glob` and dir/*.go',
    '    x := 1',
    '}',
    '',
    'func TestB(t *testing.T) {',
    '    t.Fatal("x")',
    '}',
    '',
  ].join('\n')
}

function extractGo(text) {
  const src = `
import json, sys
from record import extract_test_body
text = sys.stdin.read()
print(json.dumps({
    "a": extract_test_body(text, "TestA", go=True) is not None,
    "b": extract_test_body(text, "TestB", go=True) is not None,
}))
`
  const run = py(['-c', src], text)
  if (run.status !== 0) {
    fail('arm2', 'extract_test_body spawn failed', {
      stderr: run.stderr, stdout: run.stdout,
    })
  }
  return JSON.parse(run.stdout)
}

function canFail(source, name, filename) {
  const tmp = mkdtempSync(path.join(
    process.platform === 'darwin' ? '/private/tmp' : os.tmpdir(), 'qh-leftover-cf-'))
  const pySrc = `
import importlib.machinery, importlib.util, json, sys
from pathlib import Path
root = Path(sys.argv[1])
lint_path = Path(sys.argv[2])
source = sys.stdin.read()
name = sys.argv[3]
filename = sys.argv[4]
loader = importlib.machinery.SourceFileLoader("adr_lint", str(lint_path))
spec = importlib.util.spec_from_loader(loader.name, loader)
mod = importlib.util.module_from_spec(spec)
loader.exec_module(mod)
class Errs(list):
    def __init__(self):
        super().__init__()
        self.advice = []
    def advise(self, message):
        self.advice.append(message)
(root / filename).write_text(source, encoding="utf-8")
infos = {"T1": {"human": False, "tests": [(name, filename)], "path": Path("T1.md")}}
errors = Errs()
mod.check_tests_can_fail(infos, "| T1 | probe | done |", errors, root)
print(json.dumps({"block": list(errors), "advice": errors.advice}))
`
  try {
    const run = py(
      ['-c', pySrc, tmp, path.join(pluginDir, 'bin/adr-lint'), name, filename],
      source,
    )
    if (run.status !== 0) {
      fail('arm2', 'check_tests_can_fail spawn failed', {
        stderr: run.stderr, stdout: run.stdout,
      })
    }
    return JSON.parse(run.stdout)
  } finally {
    rmSync(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })
  }
}

function arm2(rng) {
  let goOk = 0
  let phpDead = 0
  let swiftKeep = 0
  let swiftEmpty = 0
  const fixtures = [
    goFixture('dir\\'),
    goFixture(`${rng.pick(['a', 'path', 'tmp'])}\\`),
  ]
  for (let i = 0; i < ITERATIONS; i++) {
    fixtures.push(goFixture(`${rng.pick(['x', 'ab', 'dir'])}${rng.pick(['', 'z'])}\\`))
  }
  for (const [index, text] of fixtures.entries()) {
    const got = extractGo(text)
    if (got.a !== true || got.b !== true) {
      fail('arm2', `Go raw extract i=${index}`, { text, got })
    }
    goOk += 1
  }

  const php = '<?php\nit("x", function () {\n    #expect a result here\n});\n'
  const phpVerdict = canFail(php, 'x', 'ExpectCommentTest.php')
  if (!(phpVerdict.block.length > 0
      && /calls nothing and asserts nothing/.test(phpVerdict.block.join('\n')))) {
    fail('arm2', 'PHP #expect comment was a fail word', phpVerdict)
  }
  phpDead += 1

  const swift = 'import Testing\n@Test func expectOnly() {\n  #expect(2 == 2)\n}\n'
  const swiftVerdict = canFail(swift, 'expectOnly', 'ExpectOnly.swift')
  if (swiftVerdict.block.length > 0) {
    fail('arm2', 'Swift #expect-only blocked', swiftVerdict)
  }
  swiftKeep += 1

  const empty = 'import Testing\n@Test func deadBody() {\n}\n'
  const emptyVerdict = canFail(empty, 'deadBody', 'Empty.swift')
  if (!(emptyVerdict.block.length > 0)) {
    fail('arm2', 'empty Swift body did not block', emptyVerdict)
  }
  swiftEmpty += 1

  if (!(goOk && phpDead && swiftKeep && swiftEmpty)) {
    fail('arm2', `nothing to observe go=${goOk} php=${phpDead} swift=${swiftKeep} empty=${swiftEmpty}`)
  }
  console.log(`arm2 go=${goOk} phpDead=${phpDead} swiftKeep=${swiftKeep} swiftEmpty=${swiftEmpty}`)
}

const HAND_MUTANTS = [
  {
    label: 're-enable hasher C-escape inside Go backticks (end += 2 / go=True raw_backtick)',
    rel: 'lib/record.py',
    from: '                if not raw_backtick and text[end] == "\\\\":\n                    end += 2',
    to: '                if text[end] == "\\\\":\n                    end += 2',
    arm: '2',
  },
  {
    label: 'drop wrapper-arg stripping so sudo -n advises',
    rel: 'scripts/lifecycle.mjs',
    from: 'const PUBLISH_SUFFIX = /(?:&&|\\r?\\n)\\s*(?:(?:command(?:\\s+--)?|env(?:\\s+(?:-u\\s+\\S+|[A-Za-z_][\\w]*=\\S+))*|sudo(?:\\s+(?:-n|-u\\s+\\S+))*|exec|time(?:\\s+-p)?)\\s+)*(?:git\\s+(?:commit|push)\\b[^|;\\n]*)$/',
    to: 'const PUBLISH_SUFFIX = /(?:&&|\\r?\\n)\\s*(?:(?:command|env|sudo|exec|time)\\s+)*(?:git\\s+(?:commit|push)\\b[^|;\\n]*)$/',
    arm: '1',
  },
  {
    label: 'keep PHP #expect a result here as a fail word',
    rel: 'bin/adr-lint',
    from: '                keep_swift_macros = swift and any(',
    to: '                keep_swift_macros = True and any(',
    arm: '2',
  },
  {
    label: 'a mutant that does not parse is INCONCLUSIVE',
    rel: 'lib/record.py',
    from: '            raw_backtick = go and quote == "`"',
    to: '            raw_backtick = go and quote == "`',
    arm: '2',
    inconclusive: true,
  },
]

function syntaxCheck(file) {
  if (file.endsWith('.mjs') || file.endsWith('.js')) {
    const run = spawnSync(process.execPath, ['--check', file], {
      encoding: 'utf8', timeout: 10_000,
    })
    return run.status === 0 ? null : (run.stderr || run.stdout)
  }
  const run = spawnSync('python3', ['-m', 'py_compile', file], {
    encoding: 'utf8', timeout: 10_000,
  })
  return run.status === 0 ? null : (run.stderr || run.stdout)
}

function runArm(arm, env) {
  const args = [fileURLToPath(import.meta.url)]
  if (arm) args.push('--arm', arm)
  return spawnSync(process.execPath, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    timeout: 120_000,
    env,
  })
}

function proveMutants() {
  const baseEnv = {
    ...process.env,
    QH_ADR053_STRESS_MUTANTS: '0',
    QH_ADR053_STRESS_ITERS: process.env.QH_ADR053_STRESS_ITERS ?? '40',
    QH_ADR053_STRESS_SEED: String(SEED),
  }
  const baseline = runArm(null, baseEnv)
  if (baseline.status !== 0) {
    fail('mutants', 'unmutated baseline is red', {
      out: `${baseline.stdout}${baseline.stderr}`,
    })
  }
  let killed = 0
  let inconclusive = 0
  for (const mutant of HAND_MUTANTS) {
    const tmp = mkdtempSync(path.join(
      process.platform === 'darwin' ? '/private/tmp' : os.tmpdir(), 'qh-leftover-mut-'))
    const destRoot = path.join(tmp, 'plugin')
    try {
      cpSync(pluginDir, destRoot, { recursive: true })
      const destFile = path.join(destRoot, mutant.rel)
      const original = readFileSync(destFile, 'utf8')
      const count = original.split(mutant.from).length - 1
      if (count !== 1) {
        fail('mutants', `${mutant.label} --from matched ${count} times, want 1`, {
          file: destFile, from: mutant.from,
        })
      }
      writeFileSync(destFile, original.replace(mutant.from, mutant.to))
      const syntax = syntaxCheck(destFile)
      if (syntax) {
        if (!mutant.inconclusive) {
          fail('mutants', `${mutant.label} INCONCLUSIVE (does not parse)`, { error: syntax })
        }
        inconclusive += 1
        console.log(`mutant INCONCLUSIVE: ${mutant.label}`)
        continue
      }
      if (mutant.inconclusive) {
        fail('mutants', `${mutant.label} parsed; expected INCONCLUSIVE`)
      }
      const env = {
        ...baseEnv,
        QH_LEFTOVER_PLUGIN: destRoot,
        PYTHONPATH: path.join(destRoot, 'lib'),
      }
      const run = runArm(mutant.arm, env)
      const out = `${run.stdout}${run.stderr}`
      if (run.status === 0) fail('mutants', `${mutant.label} SURVIVED`, { out })
      if (!out.includes(' FAIL seed=')) {
        fail('mutants', `${mutant.label} INCONCLUSIVE (no FAIL line)`, {
          code: run.status, out,
        })
      }
      killed += 1
      console.log(`mutant killed: ${mutant.label}`)
    } finally {
      rmSync(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })
    }
  }
  const wantKill = HAND_MUTANTS.filter(row => !row.inconclusive).length
  if (killed !== wantKill) fail('mutants', `killed=${killed} want ${wantKill}`)
  if (inconclusive !== HAND_MUTANTS.filter(row => row.inconclusive).length) {
    fail('mutants', `inconclusive=${inconclusive}`)
  }
  console.log(`mutants killed=${killed} inconclusive=${inconclusive}`)
}

function main(argv) {
  const rng = lcg(SEED)
  let want = null
  let mutants = process.env.QH_ADR053_STRESS_MUTANTS === '1'
  const args = [...argv]
  if (args.includes('--mutants')) {
    mutants = true
    args.splice(args.indexOf('--mutants'), 1)
  }
  if (args[0] === '--arm') {
    want = args[1]
    args.splice(0, 2)
  }
  if (args.length) fail('main', `unknown args ${args.join(' ')}`)
  if (mutants && want === null) {
    proveMutants()
    return
  }
  if (want === null || want === '1') arm1(lcg(SEED ^ 1))
  if (want === null || want === '2') arm2(lcg(SEED ^ 2))
}

main(process.argv.slice(2))
