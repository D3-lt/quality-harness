// ADR-113 T3: every side door around the evidence is allow-listed with its reason, and a new one fails the gate. Each kind of
// site the sweep finds is planted beside the twin it must not find; and the fast pass, which lets one commit through, is bound
// to the command it ran as well as to the tree, through the hook, so QUALITY_HARNESS_HOOK_IMPL=go holds the Go core to it.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { sweep } from '../scripts/side-door-sweep.mjs'
import { fixtureRepo, runHook, runQhCheck, sandbox } from './hook-golden.mjs'

import { latestFastPass } from '../plugin/scripts/check-ledger.mjs'
import { observe } from '../plugin/scripts/tree-facts.mjs'
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const skip = process.platform === 'win32' && 'the fixtures run sh checks, as the goldens do (BACKLOG section 375)'
const ALLOW = JSON.parse(readFileSync(path.join(repoRoot, 'scripts', 'side-doors.json'), 'utf8'))
const NONE = { writingTools: [], sites: { writer: {}, spawn: {}, tool: {} }, doors: [] }
const NO_HOOKS = { hooks: {} }
// A planted tree: only the files given, with no hooks and an empty list unless a case names them.
const planted = (files, { hooks = NO_HOOKS, allow = NONE } = {}) => sweep({ files: Object.keys(files), read: file => files[file], hooks, allow })
const unlisted = result => result.unlisted.map(site => site.key)
const group = (matcher, script) => ({ matcher, hooks: [{ type: 'command', command: 'node', args: [`\${CLAUDE_PLUGIN_ROOT}/scripts/${script}`] }] })

test('every side door is allow-listed with its reason, and a new one fails', { skip: 'ADR-130: compulsory check policy retired' }, t => {
  // The tree as it stands: every site listed, every entry still a site, each with what governs it.
  const run = spawnSync(process.execPath, [path.join(repoRoot, 'scripts', 'side-door-sweep.mjs')], { cwd: repoRoot, encoding: 'utf8', timeout: 60_000, windowsHide: true })
  assert.equal(run.status, 0, `${run.stdout}${run.stderr}`)
  for (const [kind, entries] of Object.entries(ALLOW.sites)) {
    for (const [key, why] of Object.entries(entries)) assert.match(why, /ADR-\d+|BACKLOG §\d+|CLAUDE\.md §\d+/, `${kind} ${key} names what governs it`)
  }

  // A writer of a check ledger or a task log, in each language, and the twins that are not one.
  const writer = "import { appendFileSync } from 'node:fs'\nappendFileSync(path.join(dir, 'checks.jsonl'), row)\n"
  assert.deepEqual(unlisted(planted({ 'plugin/scripts/x.mjs': writer })), ['writer plugin/scripts/x.mjs'])
  for (const [file, text] of [
    ['core/hooks/x.go', 'os.WriteFile(filepath.Join(d, "fast-checks.jsonl"), b, 0o644)\n'],
    ['plugin/lib/x.py', 'with open(task, "a") as f:\n    f.write(VERIFICATION_LOG)\nheading = "## Verification Log"\n'],
    ['plugin/bin/x', '#!/usr/bin/env python3\nopen(p, "w").write(json.dumps(row) + "baseline.jsonl")\n'],
  ]) assert.deepEqual(unlisted(planted({ [file]: text })), [`writer ${file}`], file)
  assert.deepEqual(unlisted(planted({ 'plugin/scripts/x.mjs': '// it appends to checks.jsonl\nappendFileSync(file, row)\n' })), [], 'named only in a comment')
  assert.deepEqual(unlisted(planted({ 'plugin/scripts/x.mjs': "readFileSync(path.join(dir, 'checks.jsonl'))\n" })), [], 'a reader that writes nothing')
  assert.deepEqual(unlisted(planted({ 'plugin/README.md': writer })), [], 'prose is not code')
  // Listed, it is not a finding; an entry no site matches is stale, which fails as an unlisted site does.
  const listed = { ...NONE, sites: { ...NONE.sites, writer: { 'plugin/scripts/x.mjs': 'a planted writer (ADR-113)' } } }
  assert.deepEqual(unlisted(planted({ 'plugin/scripts/x.mjs': writer }, { allow: listed })), [])
  assert.deepEqual(planted({}, { allow: listed }).stale.map(site => site.key), ['writer plugin/scripts/x.mjs'])

  // A spawn of git that publishes or makes a commit, and the twins that are not one.
  for (const [file, text, key] of [
    ['plugin/scripts/y.mjs', "spawnSync('git', ['-C', root, 'push', '--no-verify'], { timeout: 1 })\n", 'push'],
    ['core/hooks/y.go', 'cmd := exec.Command("git", "commit-tree", tree)\n', 'commit-tree'],
    ['plugin/lib/y.py', 'subprocess.run("git -C repo commit -m x", shell=True, timeout=5)\n', 'commit'],
  ]) assert.deepEqual(unlisted(planted({ [file]: text })), [`spawn ${file} ${key}`], file)
  assert.deepEqual(unlisted(planted({ 'plugin/scripts/y.mjs': "if (argv[at] === 'commit') return\nspawnSync('git', ['status'])\nconst rows = [git(['show', head]), 'push']\nconst text = 'run git commit after qh-check'\n" })), [],
    'a verb compared, a git call that publishes nothing, a verb after the call, and prose')

  // Every tool that can write a file, against every command a PreToolUse or PostToolUse group runs. Matchers are read anchored:
  // a tool a matcher only contains is not credited as matched.
  const tools = { ...NONE, writingTools: ['Edit', 'Write', 'mcp__mrw__mrw_write'] }
  const hooks = matcher => ({ hooks: { PostToolUse: [group(matcher, 'lifecycle.mjs')] } })
  assert.deepEqual(unlisted(planted({}, { hooks: hooks('Edit|Write'), allow: tools })), ['tool PostToolUse lifecycle.mjs mcp__mrw__mrw_write'])
  assert.deepEqual(unlisted(planted({}, { hooks: hooks('Edit|Write|mcp__mrw__mrw_write'), allow: tools })), [])
  assert.deepEqual(unlisted(planted({}, { hooks: hooks('Edit|Write|mcp__mrw__mrw_write'), allow: { ...tools, writingTools: ['MultiEdit'] } })), ['tool PostToolUse lifecycle.mjs MultiEdit'],
    'a matcher naming Edit does not credit MultiEdit')

  // The fast pass lets one commit through only for the command it ran: a row whose command is not the declared fastCheck is
  // no fast pass, so the unchecked commit is refused, as with no row at all; the genuine row lets it through.
  const box = sandbox(t)
  const commit = { hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'git commit -am x' } }
  const decision = forged => {
    const repo = fixtureRepo(box, `fast-${forged}`, { '.quality-harness.json': '{"check":"sh check.sh","fastCheck":"sh fast.sh"}\n', 'check.sh': 'exit 0\n', 'fast.sh': 'exit 0\n', 'src/a.js': 'x\n' })
    runHook(box, repo, 'f1', { hook_event_name: 'SessionStart', source: 'startup' })
    writeFileSync(path.join(repo, 'src', 'a.js'), 'y\n')
    assert.equal(runQhCheck(box, repo, ['--fast']).exit, 0)
    if (forged) {
      const ledger = path.join(repo, '.git', 'quality-harness', 'fast-checks.jsonl')
      const rows = readFileSync(ledger, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line))
      writeFileSync(ledger, rows.map(row => `${JSON.stringify({ ...row, command: 'sh other.sh' })}\n`).join(''))
    }
    return runHook(box, repo, 'f1', commit).stdout?.hookSpecificOutput?.permissionDecision ?? 'allow'
  }
  assert.notEqual(decision(false), 'deny', 'a fast pass of the declared fastCheck lets one commit through')
  assert.equal(decision(true), 'deny', 'a fast pass recorded for another command does not')

  // The gate itself fails on a site it was not told about, and names it: a repository with one writer and an empty list.
  const doors = fixtureRepo(box, 'doors', { 'plugin/scripts/x.mjs': writer, 'scripts/side-doors.json': `${JSON.stringify(NONE)}\n`, 'plugin/hooks/hooks.json': '{"hooks":{}}\n' })
  const dirty = spawnSync(process.execPath, [path.join(repoRoot, 'scripts', 'side-door-sweep.mjs')], {
    cwd: doors, encoding: 'utf8', timeout: 60_000, windowsHide: true, env: { ...process.env, QUALITY_HARNESS_SIDE_DOOR_ROOT: doors },
  })
  assert.equal(dirty.status, 1, `${dirty.stdout}${dirty.stderr}`)
  assert.match(dirty.stdout, /unlisted writer plugin\/scripts\/x\.mjs/)
})

// The Codex review of 6641c951..4db47214: a listed file that could not be read was skipped, and the sweep exited 0 having
// read less than it listed. Now it is UNRUN and names the file; a file gone from the disk holds nothing and is not.
test('a listed file the sweep cannot read is UNRUN, not swept clean', { skip: (skip || (process.getuid?.() === 0 && 'root reads a file whose mode forbids it')) }, t => {
  const box = sandbox(t)
  const NONE_JSON = `${JSON.stringify(NONE)}\n`
  const doors = fixtureRepo(box, 'unreadable', { 'plugin/scripts/x.mjs': 'export const x = 1\n', 'plugin/scripts/gone.mjs': 'export const y = 1\n', 'scripts/side-doors.json': NONE_JSON, 'plugin/hooks/hooks.json': '{"hooks":{}}\n' })
  const sweepAt = () => spawnSync(process.execPath, [path.join(repoRoot, 'scripts', 'side-door-sweep.mjs')], {
    cwd: doors, encoding: 'utf8', timeout: 60_000, windowsHide: true, env: { ...process.env, QUALITY_HARNESS_SIDE_DOOR_ROOT: doors },
  })
  rmSync(path.join(doors, 'plugin', 'scripts', 'gone.mjs'))
  assert.equal(sweepAt().status, 0, 'a listed file gone from the disk holds no door')
  chmodSync(path.join(doors, 'plugin', 'scripts', 'x.mjs'), 0o000)
  const run = sweepAt()
  chmodSync(path.join(doors, 'plugin', 'scripts', 'x.mjs'), 0o644)
  assert.equal(run.status, 2, `${run.stdout}${run.stderr}`)
  assert.match(run.stderr, /UNRUN — could not read plugin\/scripts\/x\.mjs/)
})

// ADR-130: retained behavior, with the retired publish-policy expectations removed.
test("side-door inventory and fast ledger binding remain enforced for optional checks", { skip }, t => {
  // The tree as it stands: every site listed, every entry still a site, each with what governs it.
  const run = spawnSync(process.execPath, [path.join(repoRoot, 'scripts', 'side-door-sweep.mjs')], { cwd: repoRoot, encoding: 'utf8', timeout: 60_000, windowsHide: true })
  assert.equal(run.status, 0, `${run.stdout}${run.stderr}`)
  for (const [kind, entries] of Object.entries(ALLOW.sites)) {
    for (const [key, why] of Object.entries(entries)) assert.match(why, /ADR-\d+|BACKLOG §\d+|CLAUDE\.md §\d+/, `${kind} ${key} names what governs it`)
  }

  // A writer of a check ledger or a task log, in each language, and the twins that are not one.
  const writer = "import { appendFileSync } from 'node:fs'\nappendFileSync(path.join(dir, 'checks.jsonl'), row)\n"
  assert.deepEqual(unlisted(planted({ 'plugin/scripts/x.mjs': writer })), ['writer plugin/scripts/x.mjs'])
  for (const [file, text] of [
    ['core/hooks/x.go', 'os.WriteFile(filepath.Join(d, "fast-checks.jsonl"), b, 0o644)\n'],
    ['plugin/lib/x.py', 'with open(task, "a") as f:\n    f.write(VERIFICATION_LOG)\nheading = "## Verification Log"\n'],
    ['plugin/bin/x', '#!/usr/bin/env python3\nopen(p, "w").write(json.dumps(row) + "baseline.jsonl")\n'],
  ]) assert.deepEqual(unlisted(planted({ [file]: text })), [`writer ${file}`], file)
  assert.deepEqual(unlisted(planted({ 'plugin/scripts/x.mjs': '// it appends to checks.jsonl\nappendFileSync(file, row)\n' })), [], 'named only in a comment')
  assert.deepEqual(unlisted(planted({ 'plugin/scripts/x.mjs': "readFileSync(path.join(dir, 'checks.jsonl'))\n" })), [], 'a reader that writes nothing')
  assert.deepEqual(unlisted(planted({ 'plugin/README.md': writer })), [], 'prose is not code')
  // Listed, it is not a finding; an entry no site matches is stale, which fails as an unlisted site does.
  const listed = { ...NONE, sites: { ...NONE.sites, writer: { 'plugin/scripts/x.mjs': 'a planted writer (ADR-113)' } } }
  assert.deepEqual(unlisted(planted({ 'plugin/scripts/x.mjs': writer }, { allow: listed })), [])
  assert.deepEqual(planted({}, { allow: listed }).stale.map(site => site.key), ['writer plugin/scripts/x.mjs'])

  // A spawn of git that publishes or makes a commit, and the twins that are not one.
  for (const [file, text, key] of [
    ['plugin/scripts/y.mjs', "spawnSync('git', ['-C', root, 'push', '--no-verify'], { timeout: 1 })\n", 'push'],
    ['core/hooks/y.go', 'cmd := exec.Command("git", "commit-tree", tree)\n', 'commit-tree'],
    ['plugin/lib/y.py', 'subprocess.run("git -C repo commit -m x", shell=True, timeout=5)\n', 'commit'],
  ]) assert.deepEqual(unlisted(planted({ [file]: text })), [`spawn ${file} ${key}`], file)
  assert.deepEqual(unlisted(planted({ 'plugin/scripts/y.mjs': "if (argv[at] === 'commit') return\nspawnSync('git', ['status'])\nconst rows = [git(['show', head]), 'push']\nconst text = 'run git commit after qh-check'\n" })), [],
    'a verb compared, a git call that publishes nothing, a verb after the call, and prose')

  // Every tool that can write a file, against every command a PreToolUse or PostToolUse group runs. Matchers are read anchored:
  // a tool a matcher only contains is not credited as matched.
  const tools = { ...NONE, writingTools: ['Edit', 'Write', 'mcp__mrw__mrw_write'] }
  const hooks = matcher => ({ hooks: { PostToolUse: [group(matcher, 'lifecycle.mjs')] } })
  assert.deepEqual(unlisted(planted({}, { hooks: hooks('Edit|Write'), allow: tools })), ['tool PostToolUse lifecycle.mjs mcp__mrw__mrw_write'])
  assert.deepEqual(unlisted(planted({}, { hooks: hooks('Edit|Write|mcp__mrw__mrw_write'), allow: tools })), [])
  assert.deepEqual(unlisted(planted({}, { hooks: hooks('Edit|Write|mcp__mrw__mrw_write'), allow: { ...tools, writingTools: ['MultiEdit'] } })), ['tool PostToolUse lifecycle.mjs MultiEdit'],
    'a matcher naming Edit does not credit MultiEdit')

  // The fast pass lets one commit through only for the command it ran: a row whose command is not the declared fastCheck is
  // no fast pass, so the unchecked commit is refused, as with no row at all; the genuine row lets it through.
  const box = sandbox(t)
  const commit = { hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'git commit -am x' } }
  const decision = forged => {
    const repo = fixtureRepo(box, `fast-${forged}`, { '.quality-harness.json': '{"check":"sh check.sh","fastCheck":"sh fast.sh"}\n', 'check.sh': 'exit 0\n', 'fast.sh': 'exit 0\n', 'src/a.js': 'x\n' })
    runHook(box, repo, 'f1', { hook_event_name: 'SessionStart', source: 'startup' })
    writeFileSync(path.join(repo, 'src', 'a.js'), 'y\n')
    assert.equal(runQhCheck(box, repo, ['--fast']).exit, 0)
    if (forged) {
      const ledger = path.join(repo, '.git', 'quality-harness', 'fast-checks.jsonl')
      const rows = readFileSync(ledger, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line))
      writeFileSync(ledger, rows.map(row => `${JSON.stringify({ ...row, command: 'sh other.sh' })}\n`).join(''))
    }
    return latestFastPass(repo, observe(repo).tree) !== null
  }
  assert.equal(decision(false), true, 'a pass for the declared fastCheck is evidence')
  assert.equal(decision(true), false, 'a pass for another command is not evidence')

  // The gate itself fails on a site it was not told about, and names it: a repository with one writer and an empty list.
  const doors = fixtureRepo(box, 'doors', { 'plugin/scripts/x.mjs': writer, 'scripts/side-doors.json': `${JSON.stringify(NONE)}\n`, 'plugin/hooks/hooks.json': '{"hooks":{}}\n' })
  const dirty = spawnSync(process.execPath, [path.join(repoRoot, 'scripts', 'side-door-sweep.mjs')], {
    cwd: doors, encoding: 'utf8', timeout: 60_000, windowsHide: true, env: { ...process.env, QUALITY_HARNESS_SIDE_DOOR_ROOT: doors },
  })
  assert.equal(dirty.status, 1, `${dirty.stdout}${dirty.stderr}`)
  assert.match(dirty.stdout, /unlisted writer plugin\/scripts\/x\.mjs/)
})
