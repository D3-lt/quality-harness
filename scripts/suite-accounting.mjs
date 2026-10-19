#!/usr/bin/env node
// ADR-113 T5: every test file is accounted for. The selftest collects `tests/*.test.mjs` by a glob, so a test file in a
// subfolder or with another suffix never ran and nothing said so, and a file that registered no test, or a skip that gave no
// reason, passed as quietly as a test that ran. Two questions, both answered from what git lists (CLAUDE.md §8):
//   - reach: every test-shaped file is either one the glob collects, or a Python file or a Go test a collected test names
//     outside a comment (a Python file by its name, a Go test by a `Test…` function it declares);
//   - the run (`--row`, the row scripts/file-timing-reporter.mjs wrote for this run): a collected file that registered no
//     test fails unless EXEMPT names it with the file that carries its tests, and that file ran some; and every skip with no
//     reason is named.
// A file whose every test skipped, each with its reason, is accounted for: an environment it lacks is a skip, and
// QUALITY_HARNESS_REQUIRE (tests/helpers/require.mjs) is what makes that a failure where a job provides the environment.
//
//   node scripts/suite-accounting.mjs [--row <file>]
//
// Exit: 0 every file accounted for · 1 a finding · 2 could not run (no git listing, or a row that cannot be read).
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { isMainModule } from '../plugin/scripts/main-module.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const COLLECTED = /^tests\/[^/]+\.test\.mjs$/
const TEST_SHAPED = /(?:\.(?:test|spec)\.[cm]?[jt]s|_test\.go|\.py)$/
const NOT_TESTS = /^tests\/(?:fixtures|goldens|mutations)\//
const COMMENT = /^\s*(?:\/\/|\/\*|\*)/

// The files that register their tests through tests/helpers/shard.mjs: node names such a test by the file that called test(),
// so the helper's row carries them and these read 0 (scripts/file-timing-reporter.mjs, measured 2026-10-15).
const SHARDED = { carriedBy: 'tests/helpers/shard.mjs', why: 'its tests register through tests/helpers/shard.mjs, whose row carries them' }
const EXEMPT = {
  'tests/publish-command.test.mjs': SHARDED,
  'tests/publish-command.shard-1.test.mjs': SHARDED,
  'tests/publish-command.shard-2.test.mjs': SHARDED,
}

export function unreached({ files, read }) {
  const code = files.filter(file => COLLECTED.test(file))
    .flatMap(file => String(read(file) ?? '').split('\n').filter(line => !COMMENT.test(line)))
  const named = word => code.some(line => line.includes(word))
  return files.filter(file => (file.startsWith('tests/') || file.startsWith('core/')) && !NOT_TESTS.test(file)
    && TEST_SHAPED.test(file) && !COLLECTED.test(file)).filter(file => {
    if (file.endsWith('.py')) return !named(path.posix.basename(file))
    if (file.endsWith('_test.go')) return ![...String(read(file) ?? '').matchAll(/^func (Test\w+)\(/gm)].some(match => named(match[1]))
    return true
  })
}

export function rowFindings(row, exempt = EXEMPT) {
  const files = Array.isArray(row?.files) ? row.files : null
  if (!files) return [{ kind: 'unreadable', text: 'the run left no per-file row, so what it ran cannot be counted' }]
  const byFile = new Map(files.map(entry => [entry.file, entry]))
  const found = []
  for (const entry of files) {
    const excused = exempt[entry.file]
    if (excused && entry.tests > 0) {
      found.push({ kind: 'stale', text: `${entry.file} ran ${entry.tests} test(s) of its own, so its exemption (${excused.why}) is stale; remove it` })
    } else if (excused && !((byFile.get(excused.carriedBy)?.tests ?? 0) > 0)) {
      found.push({ kind: 'uncarried', text: `${entry.file} is exempt because ${excused.why}, and ${excused.carriedBy} ran no test in this run` })
    } else if (!excused && COLLECTED.test(entry.file) && entry.tests === 0) {
      found.push({ kind: 'zero', text: `${entry.file} registered no test, so it passed having checked nothing` })
    }
    for (const name of entry.reasonless ?? []) {
      found.push({ kind: 'reasonless', text: `${entry.file}: «${name}» skips with no reason; give the skip its reason as a string` })
    }
  }
  return found
}

function main(argv) {
  const listed = spawnSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8', timeout: 30_000, windowsHide: true })
  if (listed.status !== 0) {
    process.stderr.write(`suite-accounting: UNRUN — git ls-files failed: ${listed.stderr || listed.error?.message}\n`)
    return 2
  }
  const files = listed.stdout.split('\0').filter(Boolean)
  const read = file => { try { return readFileSync(path.join(ROOT, file), 'utf8') } catch { return null } }
  const findings = unreached({ files, read }).map(file => ({ kind: 'unreached', text: `${file} is a test file nothing runs: move it to tests/<name>.test.mjs, or run it from one that is` }))
  const at = argv.indexOf('--row')
  if (at >= 0) {
    let row = null
    try { row = JSON.parse(readFileSync(argv[at + 1], 'utf8').trim().split('\n').at(-1)) } catch { /* said below */ }
    const counted = rowFindings(row)
    if (counted.some(found => found.kind === 'unreadable')) {
      process.stderr.write(`suite-accounting: UNRUN — ${counted[0].text}\n`)
      return 2
    }
    findings.push(...counted)
  }
  for (const found of findings) process.stdout.write(`suite-accounting: ${found.kind} — ${found.text}\n`)
  const collected = files.filter(file => COLLECTED.test(file)).length
  process.stdout.write(`suite-accounting: ${collected} collected test file(s); ${findings.length} finding(s)${at >= 0 ? '' : ' (reach only: no --row)'}\n`)
  return findings.length ? 1 : 0
}

if (isMainModule(import.meta.url)) process.exitCode = main(process.argv.slice(2))
