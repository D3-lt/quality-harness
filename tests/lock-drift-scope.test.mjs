// ADR-120 T15, fixed 2026-10-21 after the full check found a boundary dispatch on plugin/bin/adr-next taking 90 s: the
// lock-drift scan gates only a task whose Tests table names the edited file, because a lock hashes test bodies in Tests-table
// files alone (record.py snapshot_lock). A task that lists the file under Affected Files is not gated; one whose Tests table
// names it still is. Run on a staged copy of the dispatcher that logs every file it is handed, so the scan's choice is seen.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { remove } from './helpers/remove.mjs'

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'plugin')
const posixOnly = process.platform === 'win32' && 'the staged dispatcher runs a bash stub with POSIX permission bits'

test('the lock-drift scan gates a task whose Tests table names the file, and not one that only lists it as affected', { skip: posixOnly }, t => {
  const root = realpathSync.native(mkdtempSync(path.join(os.tmpdir(), 'qh-lockscope-')))
  t.after(() => remove(root))
  const scripts = path.join(root, 'plugin', 'scripts')
  const bin = path.join(root, 'plugin', 'bin')
  mkdirSync(scripts, { recursive: true })
  mkdirSync(bin)
  // The scan reads Tests tables with plugin/lib/record.py; without it the scan gates every candidate, the safe direction.
  cpSync(path.join(pluginRoot, 'lib'), path.join(root, 'plugin', 'lib'), { recursive: true })
  const source = readFileSync(path.join(pluginRoot, 'scripts', 'facts-gate-dispatch.sh'), 'utf8')
  const log = path.join(root, 'gated.log')
  // Each run, the outer one and every task the scan gates, logs its own argument first.
  writeFileSync(path.join(scripts, 'facts-gate-dispatch.sh'), source.replace(/\n/, '\nprintf "%s\\n" "$1" >> "$STUB_LOG"\n'))
  writeFileSync(path.join(bin, 'adr-lint'), '#!/bin/bash\nexit 0\n', { mode: 0o755 })
  const project = path.join(root, 'project')
  const tasks = path.join(project, 'docs', 'adr', 'ADR-001-probe', 'tasks')
  mkdirSync(tasks, { recursive: true })
  mkdirSync(path.join(project, 'src'))
  writeFileSync(path.join(project, 'src', 'a.js'), 'x\n')
  writeFileSync(path.join(project, 'src', 'a.test.js'), 'x\n')
  writeFileSync(path.join(project, 'docs', 'adr', 'ADR-001-probe.md'), '# ADR-001: Probe\n\n**Status:** Accepted\n')
  writeFileSync(path.join(tasks, 'T1-affected.md'),
    '# Task ADR-001-T1: affected\n\n## Affected Files\n\n| File | Change | Why |\n|------|--------|-----|\n| `src/a.js` | edit | it changes |\n| `src/a.test.js` | edit | it changes |\n')
  writeFileSync(path.join(tasks, 'T2-tests.md'),
    '# Task ADR-001-T2: tests\n\n## Tests\n\n| Test name | File | Verifies | Covers | Steps |\n|-----------|------|----------|--------|-------|\n| `a works` | `src/a.test.js` | it | — | S1 |\n')
  // The row forms record.py's parser accepts and a cell regex missed (the review of e3764d1a): an escaped pipe in a cell,
  // a row with no leading pipe, an indented row.
  const header = '## Tests\n\n| Test name | File | Verifies | Covers | Steps |\n|-----------|------|----------|--------|-------|\n'
  writeFileSync(path.join(tasks, 'T3-escaped.md'), `# Task ADR-001-T3: escaped\n\n${header}| \`works \\| variant\` | \`src/a.test.js\` | it | — | S1 |\n`)
  writeFileSync(path.join(tasks, 'T4-bare.md'), `# Task ADR-001-T4: bare\n\n${header}\`a bare\` | \`src/a.test.js\` | it | — | S1\n`)
  writeFileSync(path.join(tasks, 'T5-indented.md'), `# Task ADR-001-T5: indented\n\n${header}  | \`an indented\` | \`src/a.test.js\` | it | — | S1 |\n`)
  // And the shapes a fence-tracking, end-anchored reader lost (the review of 42796035): a four-backtick fence holding a
  // triple-backtick line, `~~~` inside a backtick fence, a CRLF task, a heading that ends in a non-breaking space.
  const row = '| `a works` | `src/a.test.js` | it | — | S1 |\n'
  writeFileSync(path.join(tasks, 'T6-long-fence.md'), `# Task ADR-001-T6: long fence\n\n## Acceptance\n\n\`\`\`\`bash\ncat <<EOF\n\`\`\`\nEOF\n\`\`\`\`\n\n${header}${row}`)
  writeFileSync(path.join(tasks, 'T7-tilde.md'), `# Task ADR-001-T7: tilde\n\n## Acceptance\n\n\`\`\`bash\n~~~\n\`\`\`\n\n${header}${row}`)
  writeFileSync(path.join(tasks, 'T8-crlf.md'), `# Task ADR-001-T8: crlf\n\n${header}${row}`.replaceAll('\n', '\r\n'))
  writeFileSync(path.join(tasks, 'T9-nbsp.md'), `# Task ADR-001-T9: nbsp\n\n${header.replace('## Tests', '## Tests ')}${row}`)
  for (const args of [['init', '-q'], ['add', '.']]) {
    const run = spawnSync('git', args, { cwd: project, encoding: 'utf8', timeout: 30_000, windowsHide: true })
    assert.equal(run.status, 0, run.stderr)
  }
  const gated = file => {
    writeFileSync(log, '')
    const run = spawnSync('bash', [path.join(scripts, 'facts-gate-dispatch.sh'), path.join(project, file)],
      { cwd: project, encoding: 'utf8', timeout: 60_000, windowsHide: true, env: { ...process.env, STUB_LOG: log } })
    assert.notEqual(run.error?.code, 'ETIMEDOUT', 'the dispatcher did not finish')
    return existsSync(log) ? readFileSync(log, 'utf8') : ''
  }
  assert.doesNotMatch(gated('src/a.js'), /T1-affected/, 'a task that only lists the file as affected was gated')
  const forTest = gated('src/a.test.js')
  assert.match(forTest, /T2-tests\.md/, 'the task whose Tests table names the file was not gated')
  for (const task of ['T3-escaped', 'T4-bare', 'T5-indented', 'T6-long-fence', 'T7-tilde', 'T8-crlf', 'T9-nbsp']) {
    assert.match(forTest, new RegExp(`${task}\\.md`), `${task} was not gated`)
  }
  assert.doesNotMatch(forTest, /T1-affected/, 'the affected-files task was gated for the test file too')
})
