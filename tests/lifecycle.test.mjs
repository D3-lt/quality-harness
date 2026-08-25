import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, readdir, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  analyzeTranscript,
  bashDeletionMutationPaths,
  bashMarkdownMutationPaths,
  branchViolation,
  isGitPublishCommand,
  isPotentialMutationCommand,
  isValidationCommand,
  shellSegments,
} from '../scripts/lifecycle.mjs'
import {
  hookFilePathFromPayload,
  normalizeHookPayload,
  resolveBashExecutable,
  runWithTimeout,
  shellHookTimeoutMs,
} from '../scripts/run-shell-hook.mjs'

const pluginDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const testTmp = process.platform === 'darwin' ? '/private/tmp' : os.tmpdir()

function transcript(entries) {
  return entries.map(entry => JSON.stringify(entry)).join('\n')
}

function toolUse(id, name, input) {
  return { type: 'assistant', message: { content: [{ type: 'tool_use', id, name, input }] } }
}

function toolResult(id, isError = false, content = 'ok') {
  return { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: id, is_error: isError, content }] } }
}

test('recognizes project verification commands without treating arbitrary shell as evidence', () => {
  assert.equal(isValidationCommand('pnpm test'), true)
  assert.equal(isValidationCommand('cargo check --workspace'), true)
  assert.equal(isValidationCommand('node /plugin/scripts/verify.mjs --cwd /repo -- custom gate'), true)
  assert.equal(isValidationCommand('node --test tests/unit.test.mjs'), true)
  assert.equal(isValidationCommand('pnpm test && pnpm lint'), true)
  assert.equal(isValidationCommand('pnpm test || true'), false)
  assert.equal(isValidationCommand('pnpm test && python3 rewrite.py'), false)
  assert.equal(isValidationCommand('pnpm test | tail -20'), false)
  assert.equal(isValidationCommand('git status --short'), false)
  assert.equal(isValidationCommand('rg test src'), false)
  assert.equal(isValidationCommand('test -n x'), false)
})

test('tracks mutation-capable Bash commands without treating read-only probes as edits', () => {
  assert.equal(isPotentialMutationCommand('python3 rewrite.py'), true)
  assert.equal(isPotentialMutationCommand('printf x > src/generated.txt'), true)
  assert.equal(isPotentialMutationCommand('cp source.txt destination.txt'), true)
  assert.equal(isPotentialMutationCommand('touch generated.txt'), true)
  assert.equal(isPotentialMutationCommand('git restore tracked.txt'), true)
  assert.equal(isPotentialMutationCommand("sed -i '' docs/spec.md"), true)
  assert.equal(isPotentialMutationCommand("sed -i.bak 's/x/y/' docs/spec.md"), true)
  assert.equal(isPotentialMutationCommand("sed --in-place=.bak 's/x/y/' docs/spec.md"), true)
  assert.equal(isPotentialMutationCommand('git reset --hard HEAD~1'), true)
  assert.equal(isPotentialMutationCommand('git -c user.name=Bot commit -m test'), true)
  assert.equal(isPotentialMutationCommand('command git -C /repo -c user.name=Bot restore file'), true)
  assert.equal(isPotentialMutationCommand('git pull --ff-only'), true)
  assert.equal(isPotentialMutationCommand('rsync -a src/ dst/'), true)
  assert.equal(isPotentialMutationCommand('chmod +x script.sh'), true)
  assert.equal(isPotentialMutationCommand('ln -sf a b'), true)
  assert.equal(isPotentialMutationCommand('git status --short'), false)
  assert.deepEqual(
    bashMarkdownMutationPaths("printf x > docs/spec.md", '/repo'),
    ['/repo/docs/spec.md'],
  )
  assert.deepEqual(bashMarkdownMutationPaths('python rewrite.py $DOC/spec.md', '/repo'), [])
  assert.deepEqual(bashMarkdownMutationPaths("sed -i '' docs/specs/*.md", '/repo'), [])
  assert.deepEqual(
    bashDeletionMutationPaths('rm -rf /repo/adr-archive', '/elsewhere'),
    ['/repo/adr-archive'],
  )
  assert.deepEqual(
    bashDeletionMutationPaths('rm -rf docs/adr-archive', '/repo'),
    ['/repo/docs/adr-archive'],
  )
  assert.match(bashDeletionMutationPaths('rm -rf "$ARCHIVE"', '/repo')[0], /Unresolved/)
})

test('a redirect ampersand stays inside its segment', () => {
  // The branch guard classifies per segment, so it has to be tested per segment:
  // `2>&1` split at the bare `&` leaves `… 2>` behind, and a whole-command test
  // stays green while that truncated segment reads as a write.
  const readOnly = 'git ls-remote --heads https://example.invalid/repo.git 2>&1 | head -20'
  assert.deepEqual(shellSegments(readOnly), [
    'git ls-remote --heads https://example.invalid/repo.git 2>&1',
    'head -20',
  ])
  for (const segment of shellSegments(readOnly)) {
    assert.equal(isPotentialMutationCommand(segment), false, segment)
  }
  assert.deepEqual(shellSegments('gh release list >&2'), ['gh release list >&2'])
  assert.equal(isPotentialMutationCommand('gh release list >&2'), false)
  assert.deepEqual(shellSegments('git fsck 2>&-'), ['git fsck 2>&-'])
  assert.deepEqual(shellSegments('echo x &> out.txt'), ['echo x &> out.txt'])

  // `&` still separates a background job, and `&&` still separates two commands.
  assert.deepEqual(shellSegments('sleep 1 & git status --short'), ['sleep 1', 'git status --short'])
  assert.deepEqual(shellSegments('git status --short && git diff'), ['git status --short', 'git diff'])
  // A quoted `>` never turns the next `&` into part of a redirect.
  assert.deepEqual(shellSegments('echo "a>" & git diff'), ['echo "a>"', 'git diff'])

  // `&>f` and `&>>f` write, so keeping them in one segment must not lose them.
  assert.equal(isPotentialMutationCommand('echo x &> out.txt'), true)
  assert.equal(isPotentialMutationCommand('echo x &>> out.txt'), true)
})

test('quoted Markdown and git text are mentions, not permanent lifecycle failures', async () => {
  assert.equal(isGitPublishCommand("printf '%s\\n' 'diagnostic: git commit failed'"), false)
  assert.equal(isGitPublishCommand("cat <<'EOF'\ngit push origin main\nEOF"), false)
  assert.equal(isGitPublishCommand('command -v git commit'), false)
  for (const command of [
    'cd /repo && git commit -m test',
    'git -c user.name=Bot -c user.email=bot@example.invalid commit -m test',
    'git --no-pager push origin main',
    'command git commit -m test',
    'env GIT_AUTHOR_NAME=Bot git commit -m test',
    'GIT_AUTHOR_NAME="Bot User" git commit -m test',
    'env -S "git commit -m test"',
    'env -a custom0 git commit -m test',
    'sudo -u root git commit -m test',
    'sudo -D /tmp git commit -m test',
    'exec git commit -m test',
    'time -p git commit -m test',
    'time -o /tmp/timing git commit -m test',
    '(git commit -m test)',
    '{ git commit -m test; }',
    'bash -c "git commit -m test"',
    'bash -o pipefail -c "git commit -m test"',
    'echo $((1 << 2))\ngit commit -m test',
    '((1 << 2))\ngit commit -m test',
    '"C:\\Tools\\Git\\cmd\\git.exe" -C "C:\\repo" push origin main',
  ]) {
    assert.equal(isGitPublishCommand(command), true, command)
  }
  const quotedHeredocText = [
    'EOF(){ :; }',
    "printf %s 'literal <<EOF'",
    'git commit -m test',
    'EOF',
  ].join('\n')
  assert.equal(isGitPublishCommand(quotedHeredocText), true)
  assert.equal(isGitPublishCommand("cat <<\\EOF\ngit push origin main\nEOF"), false)

  const dir = await mkdtemp(path.join(testTmp, 'quality-hook-quoted-md-'))
  const file = path.join(dir, 'agent.jsonl')
  await writeFile(file, transcript([
    toolUse('b1', 'Bash', {
      command: 'python3 signer.py --human "A1 PROVEN; see $DOC/T9-verdict.md Cleanup"',
    }),
    toolResult('b1'),
    toolUse('t1', 'Bash', { command: 'node --test tests/unit.test.mjs' }),
    toolResult('t1', false, 'tests 1\npass 1'),
  ]))
  const run = spawnSync(process.execPath, [path.join(pluginDir, 'scripts/lifecycle.mjs')], {
    cwd: pluginDir,
    input: JSON.stringify({ hook_event_name: 'Stop', transcript_path: file, cwd: dir }),
    encoding: 'utf8',
  })
  assert.equal(run.status, 0, run.stderr)
  assert.equal(run.stdout, '')
})

test('branch policy follows the target repository for native edits and git -C', async () => {
  const dir = await mkdtemp(path.join(testTmp, 'quality-branch-'))
  const { spawnSync } = await import('node:child_process')
  const initialized = spawnSync('git', ['init', '-b', 'main', dir], { encoding: 'utf8' })
  assert.equal(initialized.status, 0, initialized.stderr)

  assert.match(branchViolation({
    tool_name: 'Edit', cwd: testTmp, tool_input: { file_path: path.join(dir, 'new.txt') },
  }), /protected 'main'/)
  assert.match(branchViolation({
    tool_name: 'Bash', cwd: testTmp,
    tool_input: { command: `git -C "${dir}" commit -m test` },
  }), /protected 'main'/)
  assert.match(branchViolation({
    tool_name: 'Bash', cwd: dir,
    tool_input: { command: "sed -i.bak 's/x/y/' file.txt" },
  }), /protected 'main'/)

  const switched = spawnSync('git', ['-C', dir, 'switch', '-c', 'task/test'], { encoding: 'utf8' })
  assert.equal(switched.status, 0, switched.stderr)
  assert.equal(branchViolation({
    tool_name: 'Write', cwd: testTmp, tool_input: { file_path: path.join(dir, 'new.txt') },
  }), null)

  const protectedDir = await mkdtemp(path.join(testTmp, 'quality-branch-main-'))
  const protectedInit = spawnSync('git', ['init', '-b', 'main', protectedDir], { encoding: 'utf8' })
  assert.equal(protectedInit.status, 0, protectedInit.stderr)

  assert.match(branchViolation({
    tool_name: 'Bash', cwd: testTmp,
    tool_input: {
      command: `git -C "${dir}" status --short && git -C "${protectedDir}" commit -m test`,
    },
  }), /protected 'main'/)
  assert.match(branchViolation({
    tool_name: 'Bash', cwd: protectedDir,
    tool_input: { command: 'cp source.txt destination.txt' },
  }), /protected 'main'/)
  assert.match(branchViolation({
    tool_name: 'Bash', cwd: protectedDir,
    tool_input: { command: 'touch generated.txt' },
  }), /protected 'main'/)
  assert.match(branchViolation({
    tool_name: 'Bash', cwd: testTmp,
    tool_input: { command: `git -C "${protectedDir}" restore tracked.txt` },
  }), /protected 'main'/)
  assert.match(branchViolation({
    tool_name: 'Bash', cwd: testTmp,
    tool_input: {
      command: `GIT_AUTHOR_NAME="Bot User" command git -C "${protectedDir}" -c user.name=Bot commit -m test`,
    },
  }), /protected 'main'/)
  assert.match(branchViolation({
    tool_name: 'Bash', cwd: testTmp,
    tool_input: { command: `git -C "${dir}" -C "${protectedDir}" reset --hard` },
  }), /protected 'main'/)
  assert.match(branchViolation({
    tool_name: 'Bash', cwd: testTmp,
    tool_input: {
      command: `git --git-dir="${protectedDir}/.git" --work-tree="${protectedDir}" reset --hard`,
    },
  }), /protected 'main'/)
  assert.match(branchViolation({
    tool_name: 'Bash', cwd: testTmp,
    tool_input: {
      command: `git -C "${protectedDir}" merge topic -m "consider --ff-only later"`,
    },
  }), /merge without --ff-only/)
  assert.match(branchViolation({
    tool_name: 'Bash', cwd: testTmp,
    tool_input: {
      command: `git -C "${protectedDir}" merge topic -- --ff-only`,
    },
  }), /merge without --ff-only/)
  assert.match(branchViolation({
    tool_name: 'Bash', cwd: testTmp,
    tool_input: {
      command: `git -C "${protectedDir}" -c foo.bar="x --branch y" checkout tracked.txt`,
    },
  }), /protected 'main'/)
  assert.equal(branchViolation({
    tool_name: 'Bash', cwd: protectedDir,
    tool_input: { command: "cat <<'EOF'\ngit commit -m prose\nEOF" },
  }), null)
  const nestedMutation = `git -C "${dir}" status --short $(git -C "${protectedDir}" restore --worktree -- .)`
  assert.match(branchViolation({
    tool_name: 'Bash', cwd: testTmp, tool_input: { command: nestedMutation },
  }), /protected 'main'/)

  const packaged = spawnSync(process.execPath, [path.join(pluginDir, 'scripts/lifecycle.mjs')], {
    input: JSON.stringify({
      hook_event_name: 'PreToolUse', tool_name: 'Bash', cwd: testTmp,
      tool_input: { command: nestedMutation },
    }),
    encoding: 'utf8',
  })
  assert.equal(packaged.status, 2, packaged.stderr)
  assert.match(packaged.stderr, /protected 'main'/)

  assert.equal(branchViolation({
    tool_name: 'Bash', cwd: testTmp,
    tool_input: { command: `git -C "${protectedDir}" switch -c task/new` },
  }), null)
  assert.equal(branchViolation({
    tool_name: 'Bash', cwd: testTmp,
    tool_input: { command: `git -C "${protectedDir}" checkout -b task/newer` },
  }), null)
  assert.equal(branchViolation({
    tool_name: 'Bash', cwd: testTmp,
    tool_input: { command: `git -C "${protectedDir}" merge --ff-only task/test` },
  }), null)

  // Read-only probes stay runnable on a protected branch. These were blocked
  // while `2>&1` split at the bare `&` and left a segment ending in `2>`.
  assert.equal(branchViolation({
    tool_name: 'Bash', cwd: protectedDir,
    tool_input: { command: 'git ls-remote --heads https://example.invalid/repo.git 2>&1 | head -20' },
  }), null)
  assert.equal(branchViolation({
    tool_name: 'Bash', cwd: protectedDir,
    tool_input: { command: 'curl -s https://example.invalid/release 2>&1 | head -5' },
  }), null)
  assert.match(branchViolation({
    tool_name: 'Bash', cwd: protectedDir,
    tool_input: { command: 'git log --oneline &> notes.txt' },
  }), /protected 'main'/)
})

test('requires successful verification after the final edit', () => {
  const before = analyzeTranscript(transcript([
    toolUse('t1', 'Bash', { command: 'pnpm test' }),
    toolResult('t1'),
    toolUse('e1', 'Edit', { file_path: '/repo/src/a.ts' }),
    toolResult('e1'),
  ]))
  assert.equal(before.verifiedAfterLastMutation, false)

  const after = analyzeTranscript(transcript([
    toolUse('e1', 'Edit', { file_path: '/repo/src/a.ts' }),
    toolResult('e1'),
    toolUse('t1', 'Bash', { command: 'pnpm test' }),
    toolResult('t1'),
  ]))
  assert.equal(after.verifiedAfterLastMutation, true)
})

test('only executed tool calls count as mutations', () => {
  const pending = analyzeTranscript(transcript([
    toolUse('e1', 'Edit', { file_path: '/repo/src/a.ts' }),
  ]))
  assert.equal(pending.hasMutations, false)
  assert.deepEqual(pending.mutationPaths, [])

  const blocked = analyzeTranscript(transcript([
    toolUse('e1', 'Edit', { file_path: '/repo/src/a.ts' }),
    toolResult('e1', true, 'PreToolUse:Edit hook error: Quality gate blocked'),
  ]))
  assert.equal(blocked.hasMutations, false)
  assert.deepEqual(blocked.mutationPaths, [])

  const failedAfterStarting = analyzeTranscript(transcript([
    toolUse('e1', 'Edit', { file_path: '/repo/src/a.ts' }),
    toolResult('e1', true, 'write failed after replacing one section'),
  ]))
  assert.equal(failedAfterStarting.hasMutations, true)
  assert.deepEqual(failedAfterStarting.mutationPaths, ['/repo/src/a.ts'])
})

test('failed verification does not satisfy the gate', () => {
  const state = analyzeTranscript(transcript([
    toolUse('e1', 'Write', { file_path: '/repo/a.py' }),
    toolResult('e1'),
    toolUse('t1', 'Bash', { command: 'pytest -q' }),
    toolResult('t1', true, '1 failed'),
  ]))
  assert.equal(state.verifiedAfterLastMutation, false)
})

test('the latest validation result determines whether post-edit evidence is verified', () => {
  const failedAfterPass = analyzeTranscript(transcript([
    toolUse('e1', 'Edit', { file_path: '/repo/a.py' }), toolResult('e1'),
    toolUse('t1', 'Bash', { command: 'pytest -q' }), toolResult('t1', false, '3 passed'),
    toolUse('t2', 'Bash', { command: 'pytest -q' }), toolResult('t2', true, '1 failed'),
  ]))
  assert.equal(failedAfterPass.verifiedAfterLastMutation, false)

  const successfulRerun = analyzeTranscript(transcript([
    toolUse('e1', 'Edit', { file_path: '/repo/a.py' }), toolResult('e1'),
    toolUse('t1', 'Bash', { command: 'pytest -q' }), toolResult('t1', false, '3 passed'),
    toolUse('t2', 'Bash', { command: 'pytest -q' }), toolResult('t2', true, '1 failed'),
    toolUse('t3', 'Bash', { command: 'pytest -q' }), toolResult('t3', false, '3 passed'),
  ]))
  assert.equal(successfulRerun.verifiedAfterLastMutation, true)
})

test('explicit non-zero process metadata cannot satisfy the gate', () => {
  const state = analyzeTranscript(transcript([
    toolUse('e1', 'Write', { file_path: '/repo/a.py' }), toolResult('e1'),
    toolUse('t1', 'Bash', { command: 'pytest -q' }),
    toolResult('t1', false, 'Process exited with code 1'),
  ]))
  assert.equal(state.verifiedAfterLastMutation, false)
})

test('aggregate Cargo output must include at least one executed test', () => {
  const zero = analyzeTranscript(transcript([
    toolUse('e1', 'Edit', { file_path: '/repo/src/lib.rs' }), toolResult('e1'),
    toolUse('t1', 'Bash', { command: 'cargo test' }),
    toolResult('t1', false, 'running 0 tests\ntest result: ok. 0 passed; 0 failed'),
  ]))
  assert.equal(zero.verifiedAfterLastMutation, false)

  const mixed = analyzeTranscript(transcript([
    toolUse('e1', 'Edit', { file_path: '/repo/src/lib.rs' }), toolResult('e1'),
    toolUse('t1', 'Bash', { command: 'cargo test' }),
    toolResult('t1', false, 'running 0 tests\ntest result: ok. 0 passed\nrunning 3 tests\ntest result: ok. 3 passed'),
  ]))
  assert.equal(mixed.verifiedAfterLastMutation, true)
})

test('Node test output must include executed work', () => {
  const zero = analyzeTranscript(transcript([
    toolUse('e1', 'Edit', { file_path: '/repo/src/a.mjs' }), toolResult('e1'),
    toolUse('t1', 'Bash', { command: 'node --test' }),
    toolResult('t1', false, 'tests 0\npass 0\nfail 0'),
  ]))
  assert.equal(zero.verifiedAfterLastMutation, false)

  const one = analyzeTranscript(transcript([
    toolUse('e1', 'Edit', { file_path: '/repo/src/a.mjs' }), toolResult('e1'),
    toolUse('t1', 'Bash', { command: 'node --test' }),
    toolResult('t1', false, 'tests 1\npass 1\nfail 0'),
  ]))
  assert.equal(one.verifiedAfterLastMutation, true)
})

test('documented custom-validator wrapper executes through Node', () => {
  const run = spawnSync(process.execPath, [
    path.join(pluginDir, 'scripts/verify.mjs'),
    '--cwd', pluginDir,
    '--', process.execPath, '--check', path.join(pluginDir, 'scripts/lifecycle.mjs'),
  ], { encoding: 'utf8' })
  assert.equal(run.status, 0, run.stderr)
})

test('shell-hook runner normalizes Windows hook paths without changing prose', () => {
  const payload = JSON.stringify({
    cwd: 'C:\\Users\\dev\\project',
    tool_input: {
      file_path: 'C:\\Users\\dev\\project\\docs\\ADR-001.md',
      note: 'keep \\ these \\ characters',
    },
    tool_response: { filePath: '\\\\server\\share\\result.md' },
  })
  assert.deepEqual(JSON.parse(normalizeHookPayload(payload, 'win32')), {
    cwd: 'C:/Users/dev/project',
    tool_input: {
      file_path: 'C:/Users/dev/project/docs/ADR-001.md',
      note: 'keep \\ these \\ characters',
    },
    tool_response: { filePath: '//server/share/result.md' },
  })
  assert.equal(normalizeHookPayload(payload, 'linux'), payload)
  assert.equal(
    hookFilePathFromPayload(payload, 'win32'),
    'C:/Users/dev/project/docs/ADR-001.md',
  )
  assert.equal(hookFilePathFromPayload('{not json', 'win32'), null)
  assert.equal(hookFilePathFromPayload('{}', 'win32'), null)
})

test('shell-hook runner rejects scripts outside its fixed hook set', () => {
  const run = spawnSync(process.execPath, [
    path.join(pluginDir, 'scripts', 'run-shell-hook.mjs'),
    '../untrusted.sh',
  ], { input: '{}', encoding: 'utf8' })
  assert.equal(run.status, 2)
  assert.match(run.stderr, /unsupported shell hook/)
})

test('shell-hook runner honors Claude Code Git Bash configuration on Windows', () => {
  const configured = 'C:\\Program Files\\Git\\bin\\bash.exe'
  assert.equal(
    resolveBashExecutable('win32', { CLAUDE_CODE_GIT_BASH_PATH: configured }),
    configured,
  )
  const localRoot = 'C:\\Users\\dev\\AppData\\Local'
  const localBash = path.win32.join(localRoot, 'Programs', 'Git', 'bin', 'bash.exe')
  const pathBash = 'D:\\Tools\\Git\\bin\\bash.exe'
  const exists = candidate => candidate === localBash || candidate === pathBash
  assert.equal(resolveBashExecutable('win32', {
    PATH: `C:\\Windows\\System32;${path.win32.dirname(pathBash)}`,
    LOCALAPPDATA: localRoot,
  }, exists), pathBash)
  assert.equal(resolveBashExecutable('win32', {
    PATH: 'C:\\Windows\\System32',
    LOCALAPPDATA: localRoot,
  }, exists), localBash)
  assert.equal(resolveBashExecutable('win32', {
    PATH: 'C:\\Windows\\System32',
    LOCALAPPDATA: 'C:\\Users\\missing\\AppData\\Local',
  }, () => false), null)
  assert.equal(resolveBashExecutable('linux', { CLAUDE_CODE_GIT_BASH_PATH: configured }), 'bash')
})

test('shell-hook timeout stays below its host deadline and kills the process tree', async () => {
  assert.equal(shellHookTimeoutMs({}), 110_000)
  assert.equal(shellHookTimeoutMs({ QUALITY_HARNESS_SHELL_TIMEOUT_MS: '250' }), 250)
  assert.equal(shellHookTimeoutMs({ QUALITY_HARNESS_SHELL_TIMEOUT_MS: '119999' }), 110_000)
  const started = Date.now()
  const childScript = [
    "const { spawn } = require('node:child_process')",
    "const descendant = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 5000)'], { stdio: 'ignore' })",
    'process.stdout.write(String(descendant.pid))',
    'setTimeout(() => {}, 5000)',
  ].join('; ')
  const run = await runWithTimeout(process.execPath, [
    '-e',
    childScript,
  ], { timeoutMs: 100 })
  assert.equal(run.timedOut, true)
  assert.ok(Date.now() - started < 3_000)
  const descendantPid = Number(run.stdout)
  assert.equal(Number.isInteger(descendantPid), true)
  let descendantAlive = false
  try {
    process.kill(descendantPid, 0)
    descendantAlive = true
  } catch {}
  if (descendantAlive) {
    try { process.kill(descendantPid, 'SIGKILL') } catch {}
  }
  assert.equal(descendantAlive, false, `descendant process ${descendantPid} survived timeout`)
})

test('masked, zero-work, and stale validation cannot satisfy the gate', () => {
  const masked = analyzeTranscript(transcript([
    toolUse('e1', 'Edit', { file_path: '/repo/a.ts' }), toolResult('e1'),
    toolUse('t1', 'Bash', { command: 'pnpm test || true' }), toolResult('t1', false, '1 failed'),
  ]))
  assert.equal(masked.verifiedAfterLastMutation, false)

  const zeroWork = analyzeTranscript(transcript([
    toolUse('e1', 'Edit', { file_path: '/repo/a.ts' }), toolResult('e1'),
    toolUse('t1', 'Bash', { command: 'pnpm test --filter missing' }), toolResult('t1', false, 'No tests found'),
  ]))
  assert.equal(zeroWork.verifiedAfterLastMutation, false)

  const stale = analyzeTranscript(transcript([
    toolUse('e1', 'Edit', { file_path: '/repo/a.ts' }), toolResult('e1'),
    toolUse('t1', 'Bash', { command: 'pnpm test' }), toolResult('t1', false, '12 passed'),
    toolUse('b1', 'Bash', { command: 'python3 rewrite.py' }), toolResult('b1'),
  ]))
  assert.equal(stale.verifiedAfterLastMutation, false)

  const sedAfterTest = analyzeTranscript(transcript([
    toolUse('e1', 'Edit', { file_path: '/repo/a.ts' }), toolResult('e1'),
    toolUse('t1', 'Bash', { command: 'pnpm test' }), toolResult('t1', false, '12 passed'),
    toolUse('b1', 'Bash', { command: "sed -i '' docs/spec.md" }), toolResult('b1'),
  ]), '/repo')
  assert.equal(sedAfterTest.verifiedAfterLastMutation, false)

  for (const command of [
    'git reset --hard HEAD~1', 'git pull --ff-only', 'rsync -a src/ dst/',
    'chmod +x script.sh', 'ln -sf a b',
  ]) {
    const staleAfterCommonMutator = analyzeTranscript(transcript([
      toolUse('e1', 'Edit', { file_path: '/repo/a.ts' }), toolResult('e1'),
      toolUse('t1', 'Bash', { command: 'pnpm test' }), toolResult('t1', false, '12 passed'),
      toolUse('b1', 'Bash', { command }), toolResult('b1'),
    ]))
    assert.equal(staleAfterCommonMutator.verifiedAfterLastMutation, false, command)
  }
})

test('unfinished background validation cannot satisfy the gate', () => {
  const state = analyzeTranscript(transcript([
    toolUse('e1', 'Edit', { file_path: '/repo/a.ts' }), toolResult('e1'),
    toolUse('t1', 'Bash', { command: 'pnpm test', run_in_background: true }),
    toolResult('t1', false, 'Command running in background with ID 42'),
  ]))
  assert.equal(state.verifiedAfterLastMutation, false)
})

test('advisory Python syntax check creates no project bytecode', async () => {
  const dir = await mkdtemp(path.join(testTmp, 'quality-python-check-'))
  const source = path.join(dir, 'probe.py')
  await writeFile(source, 'VALUE = 1\n')
  const { spawnSync } = await import('node:child_process')
  const run = spawnSync(process.execPath, [
    path.join(pluginDir, 'scripts', 'run-shell-hook.mjs'),
    'post-edit-check.sh',
  ], {
    input: JSON.stringify({ tool_name: 'Write', tool_input: { file_path: source } }),
    encoding: 'utf8',
  })
  assert.equal(run.status, 0, run.stderr)
  assert.deepEqual(await readdir(dir), ['probe.py'])
})

test('successful negative-control suites are not rejected by their output text', () => {
  const state = analyzeTranscript(transcript([
    toolUse('e1', 'Edit', { file_path: '/repo/a.ts' }), toolResult('e1'),
    toolUse('t1', 'Bash', { command: './selftest.sh' }),
    toolResult('t1', false, 'negative fixture expected exit 1\nPASS — 47 checks'),
  ]))
  assert.equal(state.verifiedAfterLastMutation, true)
})

test('command hook blocks subagent completion without later evidence', async () => {
  const dir = await mkdtemp(path.join(testTmp, 'quality-hook-'))
  const file = path.join(dir, 'agent.jsonl')
  await writeFile(file, transcript([
    toolUse('e1', 'Edit', { file_path: '/repo/a.js' }),
    toolResult('e1'),
  ]))

  const { spawnSync } = await import('node:child_process')
  const script = path.join(pluginDir, 'scripts/lifecycle.mjs')
  const run = spawnSync(process.execPath, [script], {
    cwd: pluginDir,
    input: JSON.stringify({ hook_event_name: 'SubagentStop', agent_transcript_path: file }),
    encoding: 'utf8',
  })
  assert.equal(run.status, 0)
  assert.match(run.stdout, /"decision":"block"/)
})

test('commit gate uses exit 2 when this session has unverified edits', async () => {
  const dir = await mkdtemp(path.join(testTmp, 'quality-hook-'))
  const file = path.join(dir, 'main.jsonl')
  await writeFile(file, transcript([
    toolUse('e1', 'Edit', { file_path: '/repo/a.js' }),
    toolResult('e1'),
  ]))

  const { spawnSync } = await import('node:child_process')
  const script = path.join(pluginDir, 'scripts/lifecycle.mjs')
  const run = spawnSync(process.execPath, [script], {
    cwd: pluginDir,
    input: JSON.stringify({
      hook_event_name: 'PreToolUse', tool_name: 'Bash',
      tool_input: { command: 'git commit -m test' }, transcript_path: file, cwd: testTmp,
    }),
    encoding: 'utf8',
  })
  assert.equal(run.status, 2)
  assert.match(run.stderr, /blocked git commit\/push/i)
})

test('commit gate recognizes Git global options and executable wrappers', () => {
  const script = path.join(pluginDir, 'scripts/lifecycle.mjs')
  const missing = path.join(testTmp, 'quality-hook-transcript-does-not-exist.jsonl')
  for (const command of [
    'git -c user.name=Bot commit -m test',
    'git --no-pager push origin main',
    'command git commit -m test',
    'env GIT_AUTHOR_NAME=Bot git commit -m test',
    'GIT_AUTHOR_NAME="Bot User" git commit -m test',
    'env -S "git commit -m test"',
    'exec git commit -m test',
    'time -p git commit -m test',
    '(git commit -m test)',
    '{ git commit -m test; }',
    'bash -c "git commit -m test"',
    'bash -o pipefail -c "git commit -m test"',
    'echo $((1 << 2))\ngit commit -m test',
    '((1 << 2))\ngit commit -m test',
    ['EOF(){ :; }', "printf %s 'literal <<EOF'", 'git commit -m test', 'EOF'].join('\n'),
  ]) {
    const run = spawnSync(process.execPath, [script], {
      cwd: pluginDir,
      input: JSON.stringify({
        hook_event_name: 'PreToolUse', tool_name: 'Bash',
        tool_input: { command }, transcript_path: missing,
      }),
      encoding: 'utf8',
    })
    assert.equal(run.status, 2, command)
    assert.match(run.stderr, /refusing git commit\/push/i, command)
  }
})

test('commit and completion gates fail closed when the transcript is unreadable', async () => {
  const { spawnSync } = await import('node:child_process')
  const script = path.join(pluginDir, 'scripts/lifecycle.mjs')
  const missing = path.join(testTmp, 'quality-hook-transcript-does-not-exist.jsonl')

  const commit = spawnSync(process.execPath, [script], {
    cwd: pluginDir,
    input: JSON.stringify({
      hook_event_name: 'PreToolUse', tool_name: 'Bash',
      tool_input: { command: 'git commit -m test' }, transcript_path: missing,
    }),
    encoding: 'utf8',
  })
  assert.equal(commit.status, 2)

  const task = spawnSync(process.execPath, [script], {
    cwd: pluginDir,
    input: JSON.stringify({ hook_event_name: 'TaskCompleted', transcript_path: missing }),
    encoding: 'utf8',
  })
  assert.equal(task.status, 2)

  const stop = spawnSync(process.execPath, [script], {
    cwd: pluginDir,
    input: JSON.stringify({ hook_event_name: 'Stop', transcript_path: missing }),
    encoding: 'utf8',
  })
  assert.equal(stop.status, 0)
  assert.match(stop.stdout, /"decision":"block"/)
})

test('subagent evidence gate remains active while the parent has background work', async () => {
  const dir = await mkdtemp(path.join(testTmp, 'quality-hook-'))
  const file = path.join(dir, 'agent.jsonl')
  await writeFile(file, transcript([
    toolUse('e1', 'Edit', { file_path: '/repo/a.js' }), toolResult('e1'),
  ]))
  const { spawnSync } = await import('node:child_process')
  const run = spawnSync(process.execPath, [path.join(pluginDir, 'scripts/lifecycle.mjs')], {
    cwd: pluginDir,
    input: JSON.stringify({
      hook_event_name: 'SubagentStop', agent_transcript_path: file,
      background_tasks: [{ id: 'parent-task' }],
    }),
    encoding: 'utf8',
  })
  assert.match(run.stdout, /"decision":"block"/)
})

test('Stop stays Node-only while strict completion boundaries run artifact gates', async () => {
  const dir = await mkdtemp(path.join(testTmp, 'quality-hook-'))
  const artifact = path.join(dir, 'invalid-spec.md')
  const file = path.join(dir, 'agent.jsonl')
  await writeFile(artifact, '# Invalid\n\n## Facts\n\n## Grill Log\n')
  await writeFile(file, transcript([
    toolUse('e1', 'Write', { file_path: artifact }), toolResult('e1'),
    toolUse('t1', 'Bash', { command: 'node --test tests/unit.test.mjs' }),
    toolResult('t1', false, 'tests 1\npass 1'),
  ]))
  const { spawnSync } = await import('node:child_process')
  const script = path.join(pluginDir, 'scripts/lifecycle.mjs')

  const stop = spawnSync(process.execPath, [script], {
    cwd: pluginDir,
    input: JSON.stringify({ hook_event_name: 'Stop', transcript_path: file }),
    encoding: 'utf8',
  })
  assert.equal(stop.status, 0, stop.stderr)
  assert.equal(stop.stdout, '')

  const subagent = spawnSync(process.execPath, [script], {
    cwd: pluginDir,
    input: JSON.stringify({ hook_event_name: 'SubagentStop', agent_transcript_path: file }),
    encoding: 'utf8',
  })
  assert.match(subagent.stdout, /Artifact validation failed/)

  const task = spawnSync(process.execPath, [script], {
    cwd: pluginDir,
    input: JSON.stringify({ hook_event_name: 'TaskCompleted', transcript_path: file }),
    encoding: 'utf8',
  })
  assert.equal(task.status, 2)
  assert.match(task.stderr, /Artifact validation failed/)
})

test('an invalid Markdown artifact written through Bash is still gated', async () => {
  const dir = await mkdtemp(path.join(testTmp, 'quality-hook-bash-md-'))
  const artifact = path.join(dir, 'invalid-spec.md')
  const file = path.join(dir, 'agent.jsonl')
  await writeFile(artifact, '# Invalid\n\n## Facts\n\n## Grill Log\n')
  await writeFile(file, transcript([
    toolUse('b1', 'Bash', { command: `printf content > "${artifact}"` }), toolResult('b1'),
    toolUse('t1', 'Bash', { command: 'node --test tests/unit.test.mjs' }),
    toolResult('t1', false, 'tests 1\npass 1'),
  ]))
  const { spawnSync } = await import('node:child_process')
  const run = spawnSync(process.execPath, [path.join(pluginDir, 'scripts/lifecycle.mjs')], {
    cwd: pluginDir,
    input: JSON.stringify({ hook_event_name: 'SubagentStop', agent_transcript_path: file, cwd: dir }),
    encoding: 'utf8',
  })
  assert.match(run.stdout, /Artifact validation failed/)
})

test('globbed Markdown Bash mutations gate the files that actually exist without poisoning prose', async () => {
  const dir = await mkdtemp(path.join(testTmp, 'quality-hook-bash-glob-'))
  const file = path.join(dir, 'agent.jsonl')
  const specs = path.join(dir, 'docs', 'specs')
  const artifact = path.join(specs, 'invalid.md')
  await mkdir(specs, { recursive: true })
  await writeFile(artifact, '# Invalid\n\n## Facts\n\n## Grill Log\n')
  await writeFile(file, transcript([
    toolUse('b1', 'Bash', { command: `sed -i '' "${specs}/*.md"` }), toolResult('b1'),
    toolUse('t1', 'Bash', { command: 'node --test tests/unit.test.mjs' }),
    toolResult('t1', false, 'tests 1\npass 1'),
  ]))
  const { spawnSync } = await import('node:child_process')
  const run = spawnSync(process.execPath, [path.join(pluginDir, 'scripts/lifecycle.mjs')], {
    cwd: pluginDir,
    input: JSON.stringify({ hook_event_name: 'SubagentStop', agent_transcript_path: file, cwd: dir }),
    encoding: 'utf8',
  })
  assert.match(run.stdout, /Artifact validation failed/)
  assert.doesNotMatch(run.stdout, /unresolved path/i)
})
