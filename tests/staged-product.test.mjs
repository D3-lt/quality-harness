import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test, { after } from 'node:test'
import { fileURLToPath } from 'node:url'
import { analyzeTranscript, firstMentionThisSession, adrCorpus, decisionsGoverning } from '../plugin/scripts/lifecycle.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pluginDir = path.join(repoRoot, 'plugin')
const testTmp = realpathSync(mkdtempSync(path.join(
  process.platform === 'darwin' ? '/private/tmp' : os.tmpdir(), 'qh-staged-')))
after(() => {
  try { rmSync(testTmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }) }
  catch (error) {
    process.stderr.write(`[staged-product.test] could not remove ${testTmp}: ${error?.message ?? error}\n`)
  }
})

function gitInit(dir) {
  const run = spawnSync('git', ['init', '-q', '-b', 'main'], {
    cwd: dir, encoding: 'utf8', timeout: 15_000,
  })
  assert.equal(run.status ?? 0, 0, run.stderr)
}

function corruptGitIndex(dir) {
  writeFileSync(path.join(dir, '.git', 'index'), 'not-an-index')
}

function plantAccepted(root, rel, id, title = 'Thing') {
  const file = path.join(root, ...rel.split('/'))
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, acceptedRecord(id, title))
  return file
}

function workNext(root, flags = []) {
  return spawnSync(process.execPath, [path.join(pluginDir, 'scripts', 'work-next.mjs'), ...flags, root], {
    encoding: 'utf8', timeout: 60_000,
  })
}

function factsGate(file, boundary = '', env = {}) {
  return spawnSync('bash', [path.join(pluginDir, 'scripts', 'facts-gate-dispatch.sh'), file, boundary], {
    encoding: 'utf8', timeout: 60_000, env: { ...process.env, ...env },
  })
}
function factsHook(file, payload = {}) {
  const env = { ...process.env }
  delete env.QUALITY_HARNESS_SESSION_ID
  return spawnSync(process.execPath, [
    path.join(pluginDir, 'scripts', 'run-shell-hook.mjs'),
    'facts-gate-dispatch.sh',
  ], {
    encoding: 'utf8', timeout: 60_000, env,
    input: JSON.stringify({
      hook_event_name: 'PostToolUse',
      tool_name: 'Edit',
      tool_input: { file_path: file },
      ...payload,
    }),
  })
}

function adrLint(target) {
  return spawnSync('python3', [path.join(pluginDir, 'bin', 'adr-lint'), target], {
    encoding: 'utf8', timeout: 60_000,
  })
}

function posix(value) {
  return String(value).replaceAll('\\', '/')
}

function nextLine(text) {
  const match = text.match(/^Next: (.+)$/m)
  return match ? match[1] : ''
}

function toolTranscript(uses) {
  const lines = []
  for (const use of uses) {
    lines.push(JSON.stringify({
      type: 'assistant',
      message: { content: [{ type: 'tool_use', id: use.id, name: use.name, input: use.input ?? {} }] },
    }))
    lines.push(JSON.stringify({
      type: 'user',
      message: { content: [{ type: 'tool_result', tool_use_id: use.id, content: 'ok' }] },
    }))
  }
  return lines.join('\n')
}

const acceptedRecord = (id, title = 'Thing') =>
  `# ADR-${id}: ${title}\n\n**Status:** Accepted\n\n## Context\n\nx\n`
const readyTask = id =>
  `# Task ADR-${id}\n\n**Depends-on:** none\n\n## Acceptance\n\n\`\`\`bash\ntrue\n\`\`\`\n\n`
  + '## Verification Log\n\n'
const evidencedTask = id =>
  `# Task ADR-${id}\n\n## Acceptance\n\n\`\`\`bash\ntrue\n\`\`\`\n\n`
  + '## Verification Log\n\n- 2026-08-26 · abc1234 · exit 0 · `true` · acceptance-sha256:beef\n'

test('marketplace source is the plugin directory', () => {
  const text = readFileSync(path.join(repoRoot, '.claude-plugin', 'marketplace.json'), 'utf8')
  assert.match(text, /"source"\s*:\s*"\.\/plugin"/)
  assert.ok(existsSync(path.join(pluginDir, 'bin')))
  assert.ok(existsSync(path.join(pluginDir, 'hooks', 'hooks.json')))
  assert.ok(existsSync(path.join(pluginDir, 'skills')))
})

test('is_adr still requires the four QH sections', () => {
  const text = readFileSync(path.join(pluginDir, 'scripts', 'facts-gate-dispatch.sh'), 'utf8')
  assert.match(text, /Existing Primitives Audit/)
  assert.match(text, /## Decision/)
  assert.match(text, /Alternatives Considered/)
  assert.match(text, /## Consequences/)
  assert.match(text, /is_adr\(\)/)
})

test('qh-mcp still excludes verify gates', () => {
  const text = readFileSync(path.join(pluginDir, 'bin', 'qh-mcp'), 'utf8')
  assert.doesNotMatch(text, /reading_tool\(\s*"qh_(?:adr|spec)_verify"/)
  assert.doesNotMatch(text, /adr-verify|spec-verify/)
})

test('hooks stay always-on with no stage switch', () => {
  const hooks = JSON.parse(readFileSync(path.join(pluginDir, 'hooks', 'hooks.json'), 'utf8'))
  for (const event of ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse']) {
    assert.ok(hooks.hooks[event], event)
  }
  const post = JSON.stringify(hooks.hooks.PostToolUse)
  assert.match(post, /facts-gate-dispatch\.sh/)
  assert.match(post, /post-edit-check\.sh/)
  assert.doesNotMatch(JSON.stringify(hooks), /opt-?in|stage[_-]?switch|enabledWhen|corpusOnly/i)
})

test('plugin ships no CORE.md', () => {
  const listed = spawnSync('git', ['-C', repoRoot, 'ls-files', '--', 'plugin/CORE.md'], {
    encoding: 'utf8', timeout: 15_000,
  })
  assert.equal(listed.status, 0, listed.stderr)
  assert.equal(listed.stdout.trim(), '')
  assert.equal(existsSync(path.join(pluginDir, 'CORE.md')), false)
})

test('first shipped README command does not require CLAUDE_PLUGIN_ROOT', () => {
  const text = readFileSync(path.join(pluginDir, 'README.md'), 'utf8')
  const command = text.split('\n').map(line => line.trim()).find(line =>
    /qh-doctor|node /.test(line) && !line.startsWith('#') && !line.startsWith('Ask'))
  assert.ok(command, 'README names a first command')
  assert.doesNotMatch(command, /CLAUDE_PLUGIN_ROOT/)
  assert.doesNotMatch(command, /\$\{CLAUDE_PLUGIN_ROOT\}/)
  assert.match(command, /qh-doctor|qh-root|plugin\/scripts\/qh-doctor/)
})

test('adr-lint still refuses a directory and docs name a file', () => {
  const dir = mkdtempSync(path.join(testTmp, 'lint-dir-'))
  mkdirSync(path.join(dir, 'docs', 'adr'), { recursive: true })
  const result = adrLint(path.join(dir, 'docs', 'adr'))
  assert.notEqual(result.status, 0)
  assert.match(`${result.stdout}${result.stderr}`, /expected a record FILE/)
  const install = readFileSync(path.join(repoRoot, 'docs', 'INSTALL.md'), 'utf8')
  assert.doesNotMatch(install, /adr-lint docs\/adr\s*$/m)
  assert.match(install, /adr-lint[^\n]*\.(md)/)
})

test('an empty tree is not routed to spec-write', async () => {
  const { observe, nextStage } = await import('../plugin/scripts/work-next.mjs')
  const root = mkdtempSync(path.join(testTmp, 'empty-'))
  gitInit(root)
  const state = observe(root)
  assert.notEqual(nextStage(state)?.id, 'spec-write')
  const run = workNext(root)
  assert.equal(run.status, 0, run.stderr)
  assert.match(run.stdout, /no QH corpus is in use/i)
  assert.doesNotMatch(run.stdout, /^Next: \/spec-write/m)
  assert.doesNotMatch(run.stdout, /^Next: \/quality-harness:spec-write/m)
  const next = nextLine(run.stdout)
  assert.ok(next === '' || /verify|execute|current work/i.test(next), next)
})

test('task files with no records are a discovery failure, not spec-write', async () => {
  const { observe, nextStage } = await import('../plugin/scripts/work-next.mjs')
  const root = mkdtempSync(path.join(testTmp, 'orphan-tasks-'))
  mkdirSync(path.join(root, 'docs', 'adr', 'thing', 'tasks'), { recursive: true })
  writeFileSync(path.join(root, 'docs', 'adr', 'thing', 'tasks', 'T1.md'), readyTask('001-T1'))
  gitInit(root)
  const state = observe(root)
  assert.ok(state.tasks > 0)
  assert.equal(state.records, 0)
  assert.notEqual(nextStage(state)?.id, 'spec-write')
  const run = workNext(root)
  assert.match(run.stdout, /discovery failure/)
  assert.doesNotMatch(run.stdout, /^Next: \/spec-write/m)
})

test('could-not-look is UNPROVEN, not an empty corpus', async () => {
  const { observe, nextStage } = await import('../plugin/scripts/work-next.mjs')
  const root = mkdtempSync(path.join(testTmp, 'no-git-'))
  const state = observe(root)
  assert.equal(state.look, 'UNPROVEN')
  assert.notEqual(nextStage(state)?.id, 'spec-write')
  const run = workNext(root)
  assert.match(run.stdout, /UNPROVEN|could-not-look|could not look/i)
  assert.doesNotMatch(run.stdout, /write a spec/i)
  assert.doesNotMatch(run.stdout, /^Next: \/spec-write/m)
  assert.doesNotMatch(run.stdout, /^Next: \/quality-harness:spec-write/m)
})

test('observe passes the listing into adrCorpus', async () => {
  const src = readFileSync(path.join(pluginDir, 'scripts', 'work-next.mjs'), 'utf8')
  assert.match(src, /adrCorpus\(directory,\s*\{\s*tracked:\s*listing\s*\}\)/)
})

test('a failed listing is not a disk corpus of records', async () => {
  const { observe, nextStage } = await import('../plugin/scripts/work-next.mjs')
  const root = mkdtempSync(path.join(testTmp, 'records-no-git-'))
  plantAccepted(root, 'docs/adr/ADR-001-disk.md', '001', 'On disk')
  const state = observe(root)
  assert.equal(state.look, 'UNPROVEN')
  assert.equal(state.records, 0)
  assert.equal(state.accepted, 0)
  assert.notEqual(nextStage(state)?.id, 'spec-write')
  const run = workNext(root)
  assert.match(run.stdout, /UNPROVEN/)
  assert.doesNotMatch(run.stdout, /no QH corpus is in use/i)
  const json = JSON.parse(workNext(root, ['--json']).stdout)
  assert.equal(json.look, 'UNPROVEN')
  assert.equal(json.records, 0)
})

test('disk-only record files are not the corpus', async () => {
  const { observe } = await import('../plugin/scripts/work-next.mjs')
  const root = mkdtempSync(path.join(testTmp, 'records-ignored-'))
  writeFileSync(path.join(root, '.gitignore'), 'secret/\n')
  plantAccepted(root, 'docs/adr/ADR-001-listed.md', '001', 'Listed')
  plantAccepted(root, 'docs/adr/secret/ADR-002-hidden.md', '002', 'Hidden')
  gitInit(root)
  const state = observe(root)
  assert.equal(state.look, 'ok')
  assert.equal(state.records, 1)
  const names = adrCorpus(root).map(record => path.basename(record.file))
  assert.deepEqual(names, ['ADR-001-listed.md'])
})

test('leftover adrCorpus callers use the listing, not the disk', async () => {
  const listed = mkdtempSync(path.join(testTmp, 'leftover-listed-'))
  writeFileSync(path.join(listed, '.gitignore'), 'secret/\n')
  plantAccepted(listed, 'docs/adr/ADR-001-listed.md', '001', 'Listed')
  plantAccepted(listed, 'docs/adr/secret/ADR-002-hidden.md', '002', 'Hidden')
  gitInit(listed)
  const state = spawnSync(process.execPath, [path.join(pluginDir, 'scripts', 'adr-state.mjs'), '--json', listed], {
    encoding: 'utf8', timeout: 30_000,
  })
  assert.equal(state.status, 0, state.stderr)
  assert.equal(JSON.parse(state.stdout).read, 1)
  const ctx = spawnSync(process.execPath, [path.join(pluginDir, 'scripts', 'adr-context.mjs'), 'docs/adr/ADR-001-listed.md'], {
    encoding: 'utf8', timeout: 30_000, cwd: listed,
  })
  assert.equal(ctx.status, 0, ctx.stderr)
  assert.doesNotMatch(ctx.stdout, /UNPROVEN/)
  assert.doesNotMatch(ctx.stdout, /ADR-002-hidden/)
  const fromDefault = decisionsGoverning(['docs/adr/ADR-001-listed.md'], listed)
  assert.equal(fromDefault.look, 'ok')
  assert.equal(fromDefault.governing.length, 0)

  const failed = mkdtempSync(path.join(testTmp, 'leftover-fail-'))
  plantAccepted(failed, 'docs/adr/ADR-001-disk.md', '001', 'On disk')
  gitInit(failed)
  corruptGitIndex(failed)
  const unproven = spawnSync(process.execPath, [path.join(pluginDir, 'scripts', 'adr-state.mjs'), failed], {
    encoding: 'utf8', timeout: 30_000,
  })
  assert.equal(unproven.status, 0, unproven.stderr)
  assert.match(unproven.stdout, /UNPROVEN/)
  assert.doesNotMatch(unproven.stdout, /No decision records found/)
  assert.doesNotMatch(unproven.stdout, /1 record\(s\) read/)
  const unprovenCtx = spawnSync(process.execPath, [path.join(pluginDir, 'scripts', 'adr-context.mjs'), 'docs/adr/ADR-001-disk.md'], {
    encoding: 'utf8', timeout: 30_000, cwd: failed,
  })
  assert.equal(unprovenCtx.status, 0, unprovenCtx.stderr)
  assert.match(unprovenCtx.stdout, /UNPROVEN/)
  assert.doesNotMatch(unprovenCtx.stdout, /No decision records found/)
  const dg = decisionsGoverning(['docs/adr/ADR-001-disk.md'], failed)
  assert.equal(dg.look, 'UNPROVEN')
  assert.equal(dg.governing.length, 0)
  assert.equal(adrCorpus(failed).length, 0)
})

test('null-stage leftover is not spec-write', async () => {
  const { observe, nextStage } = await import('../plugin/scripts/work-next.mjs')
  const root = mkdtempSync(path.join(testTmp, 'settled-'))
  mkdirSync(path.join(root, 'docs', 'adr', 'tasks'), { recursive: true })
  writeFileSync(path.join(root, 'docs', 'adr', 'ADR-001-settled.md'), acceptedRecord('001', 'Settled'))
  writeFileSync(path.join(root, 'docs', 'adr', 'tasks', 'T1.md'), evidencedTask('001-T1'))
  gitInit(root)
  assert.equal(nextStage(observe(root)), null)
  const run = workNext(root)
  assert.match(run.stdout, /Nothing in the QH corpus is waiting|Nothing in the corpus is waiting/)
  assert.doesNotMatch(run.stdout, /begins at \/spec-write/)
  assert.doesNotMatch(run.stdout, /begins at \/adr-write/)
  assert.doesNotMatch(run.stdout, /begins at \/quality-harness:spec-write/)
})

test('work-next skill names are namespaced and CLI gates are not', async () => {
  const { observe } = await import('../plugin/scripts/work-next.mjs')
  const root = mkdtempSync(path.join(testTmp, 'names-'))
  gitInit(root)
  observe(root)
  const structured = JSON.parse(workNext(root, ['--json']).stdout)
  for (const stage of structured.stages) {
    if (stage.id === 'adr-verify' || stage.entry.startsWith('adr-verify')) {
      assert.doesNotMatch(stage.entry, /^\/quality-harness:adr-verify/)
      assert.match(stage.entry, /^adr-verify\b/)
      continue
    }
    if (stage.id === 'core' || /verify or execute/i.test(stage.entry)) continue
    if (/^\/quality-harness:/.test(stage.entry) || stage.id === 'spec-write'
      || stage.id.startsWith('adr-write') || stage.id === 'adr-execute'
      || stage.id === 'adr-retire' || stage.id === 'arch-write') {
      assert.match(stage.entry, /^\/quality-harness:/, stage.id)
    }
  }
  const catalog = structured.stages.map(stage => stage.entry).join('\n')
  assert.match(catalog, /\/quality-harness:spec-write|\/quality-harness:adr-write/)
  assert.match(catalog, /adr-verify <task file>/)
})

test('the two adr-write arms print different because-lines', async () => {
  const { observe, nextStage } = await import('../plugin/scripts/work-next.mjs')
  const noTasks = mkdtempSync(path.join(testTmp, 'no-tasks-'))
  mkdirSync(path.join(noTasks, 'docs', 'adr'), { recursive: true })
  writeFileSync(path.join(noTasks, 'docs', 'adr', 'ADR-001-lone.md'), acceptedRecord('001'))
  gitInit(noTasks)
  const noTaskStage = nextStage(observe(noTasks))
  assert.equal(noTaskStage.entry, '/quality-harness:adr-write')
  assert.match(noTaskStage.when, /no task/i)
  assert.doesNotMatch(noTaskStage.when, /Ready-for-ADR/)
  const printed = workNext(noTasks).stdout
  assert.doesNotMatch(printed, /a spec is Ready-for-ADR/)
  assert.match(printed, /no task/i)

  const ready = mkdtempSync(path.join(testTmp, 'ready-spec-'))
  mkdirSync(path.join(ready, 'docs', 'specs'), { recursive: true })
  mkdirSync(path.join(ready, 'docs', 'adr'), { recursive: true })
  mkdirSync(path.join(ready, 'docs', 'adr', 'tasks'), { recursive: true })
  writeFileSync(path.join(ready, 'docs', 'adr', 'ADR-001-other.md'), acceptedRecord('001', 'Other'))
  writeFileSync(path.join(ready, 'docs', 'adr', 'tasks', 'T1.md'), evidencedTask('001-T1'))
  writeFileSync(path.join(ready, 'docs', 'specs', '2026-09-09-ready.md'), [
    '# Spec: Ready',
    '',
    '> **Date:** 2026-09-09 · **Status:** Ready-for-ADR',
    '',
    '## Facts',
    '',
    '| ID | Assertion | Test | Tag |',
    '|----|-----------|------|-----|',
    '| F-99 | uncovered | `tests/x.test.mjs::x` | @spec |',
    '',
  ].join('\n'))
  gitInit(ready)
  const readyStage = nextStage(observe(ready))
  assert.equal(readyStage.entry, '/quality-harness:adr-write')
  assert.match(readyStage.when, /Ready-for-ADR/)
  assert.match(workNext(ready).stdout, /Ready-for-ADR/)
})

test('a Ready-for-ADR spec with no covering record goes to adr-write', async () => {
  const { observe, nextStage } = await import('../plugin/scripts/work-next.mjs')
  const root = mkdtempSync(path.join(testTmp, 'uncovered-'))
  mkdirSync(path.join(root, 'docs', 'specs'), { recursive: true })
  writeFileSync(path.join(root, 'docs', 'specs', '2026-09-09-ready.md'), [
    '# Spec: Ready',
    '',
    '> **Date:** 2026-09-09 · **Status:** Ready-for-ADR',
    '',
    '## Facts',
    '',
    '| ID | Assertion | Test | Tag |',
    '|----|-----------|------|-----|',
    '| F-88 | uncovered | `tests/x.test.mjs::x` | @spec |',
    '',
  ].join('\n'))
  gitInit(root)
  const stage = nextStage(observe(root))
  assert.equal(stage.id, 'adr-write')
  assert.equal(stage.entry, '/quality-harness:adr-write')
  const run = workNext(root)
  assert.match(run.stdout, /^Next: \/quality-harness:adr-write/m)
  assert.match(run.stdout, /Ready-for-ADR/)
  assert.match(run.stdout, /no record Covers/i)
})

test('unreadable spec Status is UNPROVEN, not not-Ready-for-ADR', async () => {
  const { observe, nextStage } = await import('../plugin/scripts/work-next.mjs')
  const root = mkdtempSync(path.join(testTmp, 'unread-spec-'))
  mkdirSync(path.join(root, 'docs', 'specs'), { recursive: true })
  writeFileSync(path.join(root, 'docs', 'specs', '2026-09-09-blank.md'), '# Spec: Blank\n\n## Facts\n\nNo status.\n')
  gitInit(root)
  const state = observe(root)
  assert.ok((state.unprovenSpecs ?? []).length > 0 || state.look === 'UNPROVEN'
    || (state.specStatusUnproven === true))
  const stage = nextStage(state)
  assert.notEqual(stage?.when, 'a spec is Ready-for-ADR and no record Covers its facts')
  const run = workNext(root)
  assert.match(run.stdout, /UNPROVEN/)
  assert.doesNotMatch(run.stdout, /no Ready-for-ADR spec/)
})

test('disk-only specs and tasks are not the corpus; git failure is UNPROVEN', async () => {
  const { observe } = await import('../plugin/scripts/work-next.mjs')
  const root = mkdtempSync(path.join(testTmp, 'ignored-'))
  mkdirSync(path.join(root, 'docs', 'specs'), { recursive: true })
  mkdirSync(path.join(root, 'docs', 'adr', 'ADR-001', 'tasks'), { recursive: true })
  writeFileSync(path.join(root, '.gitignore'), 'docs/specs/\ndocs/adr/**/tasks/\n')
  writeFileSync(path.join(root, 'docs', 'specs', 'hidden.md'), '# Spec\n\n**Status:** Ready-for-ADR\n')
  writeFileSync(path.join(root, 'docs', 'adr', 'ADR-001', 'tasks', 'T1.md'), readyTask('001-T1'))
  gitInit(root)
  const state = observe(root)
  assert.equal(state.look, 'ok')
  assert.equal(state.specs, 0)
  assert.equal(state.tasks, 0)

  const archived = mkdtempSync(path.join(testTmp, 'archive-tasks-'))
  mkdirSync(path.join(archived, 'docs', 'adr-archive', 'ADR-012', 'tasks'), { recursive: true })
  writeFileSync(path.join(archived, 'docs', 'adr-archive', 'ADR-012', 'tasks', 'T1.md'), readyTask('012-T1'))
  gitInit(archived)
  assert.equal(observe(archived).tasks, 0)
})

test('Proposed and Draft unfinished tasks are named, not finished or spec-write', async () => {
  const { observe, nextStage } = await import('../plugin/scripts/work-next.mjs')
  const root = mkdtempSync(path.join(testTmp, 'draft-tasks-'))
  mkdirSync(path.join(root, 'docs', 'adr', 'ADR-002-proposed', 'tasks'), { recursive: true })
  writeFileSync(path.join(root, 'docs', 'adr', 'ADR-002-proposed.md'),
    '# ADR-002: Later\n\n**Status:** Proposed\n\n## Context\n\nx\n')
  writeFileSync(path.join(root, 'docs', 'adr', 'ADR-002-proposed', 'tasks', 'T1.md'), readyTask('002-T1'))
  gitInit(root)
  const state = observe(root)
  assert.ok(state.notYetDecided.some(file => posix(file).endsWith('T1.md')))
  assert.notEqual(nextStage(state)?.id, 'spec-write')
  const run = workNext(root)
  assert.match(run.stdout, /not counted as ready|cannot execute|Proposed/)
  assert.doesNotMatch(run.stdout, /the corpus is finished/)
  assert.doesNotMatch(run.stdout, /^Next: \/spec-write/m)
  assert.doesNotMatch(run.stdout, /^Next: \/quality-harness:spec-write/m)
})

test('a QH-shaped record still reaches adr-lint', () => {
  const root = mkdtempSync(path.join(testTmp, 'qh-record-'))
  const file = path.join(root, 'ADR-001-probe.md')
  writeFileSync(file, [
    '# ADR-001: Probe',
    '',
    '**Status:** Accepted',
    '',
    '## Existing Primitives Audit',
    '',
    'None — probe.',
    '',
    '## Decision',
    '',
    'Probe.',
    '',
    '## Alternatives Considered',
    '',
    '- **None:** none.',
    '',
    '## Consequences',
    '',
    '- Neutral: probe.',
    '',
  ].join('\n'))
  const run = factsGate(file)
  assert.equal(run.status, 0, run.stderr)
  assert.match(`${run.stdout}${run.stderr}`, /adr-lint|Existing Primitives|not satisfied/)
  assert.doesNotMatch(`${run.stdout}${run.stderr}`, /not-recognised/)
})

test('a MADR file is not-recognised, not a failed record', () => {
  const root = mkdtempSync(path.join(testTmp, 'madr-'))
  const file = path.join(root, '0001-use-postgres.md')
  writeFileSync(file, [
    '# 1. Use Postgres',
    '',
    '## Status',
    '',
    'Accepted',
    '',
    '## Context',
    '',
    'Need a database.',
    '',
    '## Decision',
    '',
    'Postgres.',
    '',
    '## Consequences',
    '',
    'OK.',
    '',
  ].join('\n'))
  const dispatched = factsGate(file)
  assert.equal(dispatched.status, 0)
  assert.match(`${dispatched.stdout}${dispatched.stderr}`, /not-recognised/)
  assert.doesNotMatch(`${dispatched.stdout}${dispatched.stderr}`, /NOT A DECISION RECORD|not a decision record/i)
  const direct = adrLint(file)
  assert.match(`${direct.stdout}${direct.stderr}`, /not-recognised/)
  assert.doesNotMatch(`${direct.stdout}${direct.stderr}`, /NOT A DECISION RECORD/)
})

test('an unreadable file is UNPROVEN, not a clean skip', () => {
  // Class: silent missing-file arms in facts-gate-dispatch.sh. Command (2026-09-10):
  //   rg -n '\[ -f .* \] \|\| exit 0|^\s+\*\) exit 0' plugin/scripts/facts-gate-dispatch.sh
  // Members then: 211 `*.md) [ -f "$f" ] || exit 0` (the miss); 212 `*) exit 0`
  // (unclassified, including a missing non-md path). Same UNPROVEN vocabulary.
  const root = mkdtempSync(path.join(testTmp, 'unread-md-'))
  const missing = path.join(root, 'missing.md')
  const absent = factsGate(missing)
  assert.equal(absent.status, 0)
  const absentSaid = `${absent.stdout}${absent.stderr}`
  assert.ok(absentSaid.trim(), 'a missing *.md must name the miss, not print 0 bytes')
  assert.match(absentSaid, /UNPROVEN/)
  assert.doesNotMatch(absentSaid, /definitely not a record/i)

  const absentOther = factsGate(path.join(root, 'missing.js'))
  assert.equal(absentOther.status, 0)
  const otherSaid = `${absentOther.stdout}${absentOther.stderr}`
  assert.ok(otherSaid.trim(), 'a missing unclassified path must name the miss, not skip')
  assert.match(otherSaid, /UNPROVEN/)

  const present = path.join(root, 'notes.md')
  writeFileSync(present, '# Notes\n\nNot a record.\n')
  const named = factsGate(present)
  assert.match(`${named.stdout}${named.stderr}`, /not-recognised/)
  assert.doesNotMatch(`${named.stdout}${named.stderr}`, /definitely not a record/i)

  if (process.platform === 'win32') return
  const locked = path.join(root, 'locked.md')
  writeFileSync(locked, '# Notes\n\nUnreadable.\n')
  chmodSync(locked, 0o000)
  try {
    const unread = factsGate(locked)
    assert.equal(unread.status, 0)
    const unreadSaid = `${unread.stdout}${unread.stderr}`
    assert.ok(unreadSaid.trim(), 'an unreadable *.md must name UNPROVEN, not skip')
    assert.match(unreadSaid, /UNPROVEN/)
    assert.doesNotMatch(unreadSaid, /definitely not a record/i)
  } finally {
    chmodSync(locked, 0o644)
  }
})

test('PostToolUse names not-recognised once per file per session via firstMentionThisSession', () => {
  const root = mkdtempSync(path.join(testTmp, 'once-'))
  const file = path.join(root, 'notes.md')
  writeFileSync(file, '# Notes\n\nHouse notes, not a QH record.\n')
  const session = `staged-once-${Date.now()}`
  const first = factsHook(file, { session_id: session })
  const second = factsHook(file, { session_id: session })
  assert.equal(first.status, 0, first.stderr)
  assert.match(`${first.stdout}${first.stderr}`, /not-recognised/)
  assert.doesNotMatch(`${second.stdout}${second.stderr}`, /not-recognised/)
  const commit = factsHook(file, { session_id: session, hook_event_name: 'PreToolUse' })
  assert.match(`${commit.stdout}${commit.stderr}`, /not-recognised/)
  const always = adrLint(file)
  assert.match(`${always.stdout}${always.stderr}`, /not-recognised/)
  const dispatcher = readFileSync(path.join(pluginDir, 'scripts', 'facts-gate-dispatch.sh'), 'utf8')
  assert.match(dispatcher, /first-mention|firstMentionThisSession/)
  assert.equal(firstMentionThisSession(session, `not-recognised:${posix(file)}`), false)
})

test('post-edit-check still runs on unclassified files', () => {
  const hooks = readFileSync(path.join(pluginDir, 'hooks', 'hooks.json'), 'utf8')
  assert.match(hooks, /post-edit-check\.sh/)
  const script = path.join(pluginDir, 'scripts', 'post-edit-check.sh')
  assert.ok(existsSync(script))
  const root = mkdtempSync(path.join(testTmp, 'syntax-'))
  const file = path.join(root, 'notes.md')
  writeFileSync(file, '# Notes\n')
  const run = spawnSync('bash', [script, 'Edit', file], {
    encoding: 'utf8', timeout: 30_000,
  })
  assert.ok(run.status === 0 || run.stdout || run.stderr === '')
})

test('an MCP write is UNPROVEN authorship, not no mutation', () => {
  const state = analyzeTranscript(toolTranscript([
    { id: 'm1', name: 'mcp__mrw__mrw_write', input: { plan: 'docs/a.md' } },
  ]))
  assert.equal(state.authorship, 'UNPROVEN')
  assert.equal(state.lastMutation, -1)
  assert.deepEqual(state.mutationPaths, [])
  assert.notEqual(state.hasMutations, false)
  assert.ok(state.hasMutations === true || state.authorship === 'UNPROVEN')
})

test('a native Edit or Write is still a mutation', () => {
  const edit = analyzeTranscript(toolTranscript([
    { id: 'e1', name: 'Edit', input: { file_path: '/tmp/x.md' } },
  ]))
  assert.notEqual(edit.authorship, 'UNPROVEN')
  assert.notEqual(edit.lastMutation, -1)
  assert.ok(edit.hasMutations)
  const write = analyzeTranscript(toolTranscript([
    { id: 'w1', name: 'Write', input: { file_path: '/tmp/y.md' } },
  ]))
  assert.notEqual(write.lastMutation, -1)
})

test('no in-process plugin registry was added', () => {
  const work = readFileSync(path.join(pluginDir, 'scripts', 'work-next.mjs'), 'utf8')
  const dispatch = readFileSync(path.join(pluginDir, 'scripts', 'facts-gate-dispatch.sh'), 'utf8')
  assert.doesNotMatch(work, /pluginRegistry|format-plugin|in-process registry/i)
  assert.doesNotMatch(dispatch, /pluginRegistry|format-plugin/)
})

test('layer from STAGES: empty tree --json is core', () => {
  const root = mkdtempSync(path.join(testTmp, 'layer-empty-'))
  gitInit(root)
  const run = workNext(root, ['--json'])
  assert.equal(run.status, 0, run.stderr)
  const json = JSON.parse(run.stdout)
  assert.equal(json.look, 'ok')
  assert.equal(json.next?.id, 'core')
  assert.equal(json.layer, 'core')
  assert.notEqual(json.next?.id, 'session')
  assert.notEqual(json.next?.id, 'spec-write')
  assert.notEqual(json.layer, 'session')
})

test('layer from STAGES: catalog ids are corpus never session', async () => {
  const { STAGES, productLayer } = await import('../plugin/scripts/work-next.mjs')
  assert.ok(Array.isArray(STAGES) && STAGES.length > 0)
  assert.ok(!STAGES.some(stage => stage.id === 'session'))
  for (const stage of STAGES) {
    const layer = productLayer('ok', stage.id)
    assert.equal(layer, stage.id === 'core' ? 'core' : 'corpus', stage.id)
    assert.notEqual(layer, 'session')
  }
  assert.equal(productLayer('ok', null), 'corpus')
  const noTasks = mkdtempSync(path.join(testTmp, 'layer-no-tasks-'))
  mkdirSync(path.join(noTasks, 'docs', 'adr'), { recursive: true })
  writeFileSync(path.join(noTasks, 'docs', 'adr', 'ADR-001-lone.md'), acceptedRecord('001'))
  gitInit(noTasks)
  const json = JSON.parse(workNext(noTasks, ['--json']).stdout)
  assert.equal(json.next?.id, 'adr-write-no-tasks')
  assert.equal(json.layer, 'corpus')
  assert.notEqual(json.layer, 'session')
})

test('layer from STAGES: UNPROVEN look has no layer key', () => {
  const root = mkdtempSync(path.join(testTmp, 'layer-unproven-'))
  const run = workNext(root, ['--json'])
  assert.equal(run.status, 0, run.stderr)
  const json = JSON.parse(run.stdout)
  assert.equal(json.look, 'UNPROVEN')
  assert.equal(json.next, null)
  assert.equal('layer' in json, false)
})

test('layer from STAGES: leftover next null is corpus', () => {
  const root = mkdtempSync(path.join(testTmp, 'layer-leftover-'))
  mkdirSync(path.join(root, 'docs', 'adr', 'tasks'), { recursive: true })
  writeFileSync(path.join(root, 'docs', 'adr', 'ADR-001-settled.md'), acceptedRecord('001', 'Settled'))
  writeFileSync(path.join(root, 'docs', 'adr', 'tasks', 'T1.md'), evidencedTask('001-T1'))
  gitInit(root)
  const run = workNext(root, ['--json'])
  assert.equal(run.status, 0, run.stderr)
  const json = JSON.parse(run.stdout)
  assert.equal(json.look, 'ok')
  assert.equal(json.next, null)
  assert.equal(json.layer, 'corpus')
  assert.notEqual(json.layer, 'session')
})
