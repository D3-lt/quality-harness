import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, realpathSync } from 'node:fs'
import { cp, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  analyzeTranscript,
  artifactGateTimeoutMs,
  bashDeletionMutationPaths,
  bashNavigationImpact,
  mutatesOnlyTempPaths,
  projectCheckCommand,
  budgetExhausted,
  commandInsideWrappers,
  describeCommand,
  sessionOrientation,
  spawnGate,
  adrCorpus,
  validationVerdict,
  shadowInstallNotice,
  staleVersionNotice,
  decisionContext,
  decisionsGoverning,
  pathMatchesDeclaration,
  bashMarkdownMutationPaths,
  isGitPublishCommand,
  isPotentialMutationCommand,
  isValidationCommand,
  runArtifactGates,
  shellSegments,
} from '../scripts/lifecycle.mjs'
import {
  HOOK_SCRIPTS,
  hookArguments,
  hookFilePathFromPayload,
  normalizeHookPayload,
  resolveBashExecutable,
  runWithTimeout,
  shellHookTimeoutMs,
  shellRuntimeCrashed,
} from '../scripts/run-shell-hook.mjs'

const pluginDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const testTmp = process.platform === 'darwin' ? '/private/tmp' : os.tmpdir()

function transcript(entries) {
  return entries.map(entry => JSON.stringify(entry)).join('\n')
}

// A temp directory that looks like a project with a check of its own. The
// evidence gates only speak when they can name the command to run, so a bare
// mkdtemp fixture exercises the silence rather than the gate — which is a real
// behaviour, tested separately, but not the one these fixtures are for.
async function checkedProject(prefix) {
  const dir = await mkdtemp(path.join(testTmp, prefix))
  await writeFile(path.join(dir, 'package.json'), JSON.stringify({ scripts: { test: 'true' } }))
  return dir
}

function toolUse(id, name, input) {
  return { type: 'assistant', message: { content: [{ type: 'tool_use', id, name, input }] } }
}

function toolResult(id, isError = false, content = 'ok') {
  return { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: id, is_error: isError, content }] } }
}

// A real hook payload always names the session directory, so the suite supplies one too.
// Without it the gate falls back to process.cwd() and answers about *this* checkout: on a
// protected branch the branch gate fires first and hides the gate the test is exercising.
// Windows cannot exec a `#!` script: spawning `bin/adr-next` directly there dies
// with status null before the gate can judge anything, and the failure says
// nothing about the gate. Production never reaches the gates by bare exec — the
// hooks go through Git Bash (run-shell-hook.mjs) and a person runs them through
// their interpreter — so naming python3 here is what lets this suite measure the
// GATE on Windows rather than measuring the shebang. On POSIX the shebang is
// real and stays under test.
// A Bash command is a shell string: `\` is an escape there, so interpolating a
// native Windows path into one produces a command whose operand the gate cannot
// see, and the artifact is never gated. Git Bash takes forward slashes, and so
// does every real Bash tool invocation on Windows.
const bashPath = value => value.replaceAll('\\', '/')

function runGate(gatePath, args, options = {}) {
  const [file, argv] = process.platform === 'win32'
    ? ['python3', [gatePath, ...args]]
    : [gatePath, args]
  return spawnSync(file, argv, { encoding: 'utf8', ...options })
}

function runLifecycleHook(payload, options = {}) {
  return spawnSync(process.execPath, [path.join(pluginDir, 'scripts/lifecycle.mjs')], {
    cwd: testTmp,
    input: JSON.stringify({ cwd: testTmp, ...payload }),
    encoding: 'utf8',
    ...options,
  })
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

  // A shell name in front of the validator does not change what ran.
  assert.equal(isValidationCommand('bash scripts/selftest.sh'), true)
  assert.equal(isValidationCommand('sh ./run-checks.sh'), true)
  assert.equal(isValidationCommand('bash -n scripts/lifecycle.sh'), true)
  assert.equal(isValidationCommand('bash scripts/deploy.sh'), false)
  assert.equal(isValidationCommand('bash scripts/rewrite-tests.sh'), false)
  assert.equal(isValidationCommand('bash -c "rm -rf build"'), false)

  // Running the gate the obvious way must also clear the evidence bar, and must
  // not be recorded as an edit on the way through.
  assert.equal(isPotentialMutationCommand('bash scripts/selftest.sh'), false)
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
  // The gate resolves a relative operand against the session cwd, so what it
  // returns is an ABSOLUTE path in the host platform's shape: `/repo/docs/spec.md`
  // on POSIX, `D:\\repo\\docs\\spec.md` on Windows. Spelling the expectation as a
  // POSIX literal asserted the platform, not the behaviour.
  const under = (...parts) => path.resolve('/repo', ...parts)
  assert.deepEqual(
    bashMarkdownMutationPaths("printf x > docs/spec.md", '/repo'),
    [under('docs/spec.md')],
  )
  assert.deepEqual(bashMarkdownMutationPaths('python rewrite.py $DOC/spec.md', '/repo'), [])
  assert.deepEqual(bashMarkdownMutationPaths("sed -i '' docs/specs/*.md", '/repo'), [])
  assert.deepEqual(
    bashDeletionMutationPaths('rm -rf /repo/adr-archive', '/elsewhere'),
    [path.resolve('/repo/adr-archive')],
  )
  assert.deepEqual(
    bashDeletionMutationPaths('rm -rf docs/adr-archive', '/repo'),
    [under('docs/adr-archive')],
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
  const run = runLifecycleHook({ hook_event_name: 'Stop', transcript_path: file, cwd: dir })
  assert.equal(run.status, 0, run.stderr)
  assert.equal(run.stdout, '')
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
  // A broken invocation, not a verdict — still refused.
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

test('a shell that aborts cannot report a clean gate', async () => {
  // Reported 2026-08-25 on Windows 11: the MSYS runtime died in add_item, bash
  // exited 0 anyway, and four PostToolUse:Edit gates were recorded as passing
  // without ever running. The exit code alone cannot be trusted here.
  const banner = '      2 [main] bash (46688) C:\\…\\usr\\bin\\bash.exe: '
    + '*** fatal error - add_item ("\\??\\C:\\Users\\x", "/", ...) failed'
  assert.equal(shellRuntimeCrashed(banner), true)

  // A real shell producing that banner on stderr while exiting 0 is the case
  // that matters, so drive it through the actual runner rather than a string.
  const crash = await runWithTimeout('bash', ['-c', `printf '%s\\n' ${JSON.stringify(banner)} >&2; exit 0`])
  assert.equal(crash.status, 0)
  assert.equal(shellRuntimeCrashed(crash.stderr), true)

  // Gate findings must stay clean: a gate is allowed to say "fatal error".
  assert.equal(shellRuntimeCrashed('facts-first gate FAILED: fatal error in the spec'), false)
  assert.equal(shellRuntimeCrashed('*** fatal error - quoted inside a report'), false)
  assert.equal(shellRuntimeCrashed(''), false)
  assert.equal(shellRuntimeCrashed(undefined), false)
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
  // Signal delivery and reaping are asynchronous, and `kill(pid, 0)` still
  // succeeds for a killed-but-unreaped process, so a single probe races the
  // kernel — it failed under load the moment an unrelated CPU-heavy test landed
  // beside it. Poll against a deadline: a genuinely surviving descendant still
  // fails, a dying one gets the instant it needs to be reaped.
  const deadline = Date.now() + 2_000
  let descendantAlive = true
  while (descendantAlive && Date.now() < deadline) {
    try {
      process.kill(descendantPid, 0)
      await new Promise(resolve => setTimeout(resolve, 25))
    } catch {
      descendantAlive = false
    }
  }
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

test('command hook advises on subagent completion without later evidence', async () => {
  const dir = await checkedProject('quality-hook-')
  const file = path.join(dir, 'agent.jsonl')
  await writeFile(file, transcript([
    toolUse('e1', 'Edit', { file_path: '/repo/a.js' }),
    toolResult('e1'),
  ]))

  const run = runLifecycleHook({
    hook_event_name: 'SubagentStop', agent_transcript_path: file, cwd: dir,
  })
  assert.equal(run.status, 0)
  assert.match(run.stdout, /"systemMessage"/)
})

test('commit gate advises, never blocks, when this session has unverified edits', async () => {
  const dir = await checkedProject('quality-hook-')
  const file = path.join(dir, 'main.jsonl')
  await writeFile(file, transcript([
    toolUse('e1', 'Edit', { file_path: '/repo/a.js' }),
    toolResult('e1'),
  ]))

  const run = runLifecycleHook({
    hook_event_name: 'PreToolUse', tool_name: 'Bash',
    tool_input: { command: 'git commit -m test' }, transcript_path: file, cwd: dir,
  })
  assert.equal(run.status, 0)
  assert.match(run.stderr, /would publish unchecked/i)
  assert.match(run.stderr, /Changed paths include: \/repo\/a\.js\./)
})

test('reported: finding the repository root does not disqualify the check that follows', () => {
  // blueprints, 2026-08-26. `cd "$(git rev-parse --show-toplevel)" && …
  // ./verify.sh` is how a script finds its own root, and the guard rejected the
  // whole command for containing `$(` — so the project's check ran, passed, and
  // the gate asked for it again at the end of the turn.
  assert.equal(isValidationCommand(
    'cd "$(git rev-parse --show-toplevel)" && BLUEPRINT_VENV=.venv ./verify.sh'), true)
  assert.equal(isValidationCommand('cd "$(git rev-parse --show-toplevel)"\nnpm test'), true)
  assert.equal(isValidationCommand('cd `pwd` && npm test'), true)

  // The guard did not go away, it moved. A substitution anywhere a command can
  // actually run is still opaque, and a `cd` whose argument runs something with
  // effects is not navigation.
  assert.equal(isValidationCommand('npm test $(rm -rf build)'), false)
  assert.equal(isValidationCommand('cd "$(rm -rf x && pwd)" && npm test'), false)
  // Same on its own line, where a plain `cd`-shaped filter would have dropped it
  // unread and let the test below stand as the session's only evidence.
  assert.equal(isValidationCommand('cd "$(rm -rf x && pwd)"\nnpm test'), false)
  assert.equal(isValidationCommand('cd "$(curl -s http://evil)" && npm test'), false)
  assert.equal(isValidationCommand('npm test; rm -rf build'), false)
  assert.equal(isValidationCommand('npm test | tail -3'), false)
  assert.equal(isValidationCommand('npm test > out.txt'), false)
  assert.equal(isValidationCommand('npm test &'), false)
  assert.equal(isValidationCommand('cd /repo && npm test && rm -rf build'), false)
})

test('reported: the changed-path list holds paths, and only ones that changed', async () => {
  // agentsmemory, 2026-08-26. Of five "changed paths" one was real. The list
  // carried a git REVISION resolved as if it were a file —
  // `<repo>/origin/main:docs/adr/BACKLOG.md`, a path that has never existed —
  // and a scratch copy, because `cp <repo file> "$S/"` was accounted by its
  // source instead of its destination.
  const repo = await mkdtemp(path.join(testTmp, 'quality-paths-'))
  await writeFile(path.join(repo, 'BACKLOG.md'), '# Backlog\n')

  // `git show <rev>:<path>` reads out of history. Nothing is written.
  assert.deepEqual(
    bashMarkdownMutationPaths('git show origin/main:docs/adr/BACKLOG.md', repo), [])
  // Selective, not blanket: in one command the revision is dropped and the real
  // path beside it survives. (The guard keys on a colon past the second
  // character, so a Windows `C:\…` drive letter is still a path — not asserted
  // here, because resolving one on POSIX proves nothing either way.)
  // A repo-relative target, not an absolute one: expandExistingGlob refuses any
  // candidate containing a backslash, so a Windows absolute path resolves to
  // nothing and the assertion would be about that instead (run 32957651615).
  assert.deepEqual(
    bashMarkdownMutationPaths('git show origin/main:docs/adr/BACKLOG.md > BACKLOG.md', repo),
    [path.join(repo, 'BACKLOG.md')])

  // pluginDir, not the temp fixture above: a project that lives under the temp
  // root deliberately gets no scratch exemption at all.
  const scratch = path.join(os.tmpdir(), 'qh-copy-target')
  // Copying a repository file INTO scratch writes only the scratch copy.
  assert.equal(mutatesOnlyTempPaths(`S=${scratch}; cp docs/BACKLOG.md "$S/"`, pluginDir), true)
  assert.equal(mutatesOnlyTempPaths(`S=${scratch}; cp a.md b.md "$S/"`, pluginDir), true)
  // Moving it out is authorship: mv removes the source.
  assert.equal(mutatesOnlyTempPaths(`S=${scratch}; mv docs/BACKLOG.md "$S/"`, pluginDir), false)
  // And copying the other way lands in the repository.
  assert.equal(mutatesOnlyTempPaths(`cp ${scratch}/a.md ./docs/BACKLOG.md`, pluginDir), false)

  // The list is five slots wide. Five copies of one marker report one thing —
  // which is what the live session saw, with `cd <repo>` filling every slot.
  const project = await checkedProject('quality-repeats-')
  const file = path.join(project, 'agent.jsonl')
  const same = `cd ${project}\nprintf x > note.txt`
  await writeFile(file, transcript([
    toolUse('b1', 'Bash', { command: same }), toolResult('b1'),
    toolUse('b2', 'Bash', { command: same }), toolResult('b2'),
    toolUse('b3', 'Bash', { command: same }), toolResult('b3'),
  ]))
  const run = runLifecycleHook({ hook_event_name: 'Stop', transcript_path: file, cwd: project })
  const listed = (`${run.stdout}`.match(/Changed paths include: ([^"]*?)\. Run/) ?? [])[1] ?? ''
  const entries = listed.split(', ').filter(Boolean)
  assert.ok(entries.length > 0, run.stdout)
  assert.deepEqual(entries, [...new Set(entries)], `repeated entries: ${listed}`)
})

test('reported: no advisory claims to have blocked anything', async () => {
  // The wording IS the contract. A live 2.3.0 session read "Quality gate blocked
  // git commit/push", believed it had been stopped, committed anyway and then
  // narrated "Committed — the reload cleared the stuck hook": a false belief
  // about the harness AND a false explanation of the success. Advisory text that
  // describes itself as a refusal is the same defect as refusing.
  const dir = await checkedProject('quality-wording-')
  const file = path.join(dir, 'main.jsonl')
  await writeFile(file, transcript([
    toolUse('e1', 'Edit', { file_path: path.join(dir, 'a.js') }), toolResult('e1'),
  ]))
  const missing = path.join(testTmp, 'quality-wording-absent.jsonl')

  const runs = [
    { hook_event_name: 'PreToolUse', tool_name: 'Bash', cwd: dir,
      tool_input: { command: 'git commit -m test' }, transcript_path: file },
    { hook_event_name: 'PreToolUse', tool_name: 'Bash', cwd: dir,
      tool_input: { command: 'git commit -m test' }, transcript_path: missing },
    { hook_event_name: 'PreToolUse', tool_name: 'Bash', cwd: dir,
      tool_input: { command: 'git merge feature' }, transcript_path: file },
    { hook_event_name: 'PreToolUse', tool_name: 'Write', cwd: dir,
      tool_input: { file_path: path.join(dir, 'a.js') }, transcript_path: file },
    { hook_event_name: 'SessionStart', cwd: dir },
    { hook_event_name: 'Stop', transcript_path: file, cwd: dir },
    { hook_event_name: 'TaskCompleted', transcript_path: file, cwd: dir },
  ]
  for (const payload of runs) {
    const run = runLifecycleHook(payload)
    assert.equal(run.status, 0, JSON.stringify(payload))
    const message = `${run.stdout}${run.stderr}`
    // "nothing is blocked" is the disclaimer, not the offence.
    const claims = message.replace(/[Nn]othing (?:is|was) blocked/g, '')
      .match(/\b(?:blocked|blocking|refus\w*|denied|prevented|not allowed|disallowed)\b/gi) ?? []
    assert.deepEqual(claims, [], `${JSON.stringify(payload)} -> ${message}`)
  }
})

test('reported: committing does not make the next commit demand a check of it', async () => {
  // agentsmemory, 2026-08-26, on 2.3.0. `git add -A && git commit …` is itself a
  // git mutation, so the commit landed, was recorded as unverified authorship,
  // and the following push was advised to go verify... the commit. No test could
  // clear it: the loop closed on the publish itself.
  const dir = await checkedProject('quality-loop-')
  const file = path.join(dir, 'main.jsonl')
  await writeFile(file, transcript([
    toolUse('e1', 'Edit', { file_path: path.join(dir, 'a.go') }), toolResult('e1'),
    toolUse('v1', 'Bash', { command: 'go test ./...' }), toolResult('v1'),
    toolUse('c1', 'Bash', { command: 'git add -A && git commit -m done' }), toolResult('c1'),
  ]))

  const state = analyzeTranscript(await readFile(file, 'utf8'), dir)
  // The whole session still knows the commit was authorship — the completion
  // gate's question is unchanged.
  assert.equal(state.hasMutations, true)
  assert.equal(state.verifiedAfterLastMutation, false)
  // But the publish boundary has nothing unchecked after it.
  assert.equal(state.unverifiedSince(state.lastPublish), false)

  const push = runLifecycleHook({
    hook_event_name: 'PreToolUse', tool_name: 'Bash',
    tool_input: { command: 'git push' }, transcript_path: file, cwd: dir,
  })
  assert.equal(push.status, 0)
  assert.equal(`${push.stdout}${push.stderr}`.trim(), '', 'the loop is closed, so the gate is quiet')

  // And the end of the turn asks the same question, so it gets the same answer.
  // blueprints, 2026-08-26: edit, check, commit — and Stop reported that nothing
  // had verified the work, because the commit came after the check.
  const stop = runLifecycleHook({ hook_event_name: 'Stop', transcript_path: file, cwd: dir })
  assert.equal(stop.status, 0)
  assert.equal(`${stop.stdout}${stop.stderr}`.trim(), '', stop.stdout)

  // Editing AFTER the commit is unpublished work, and still draws the advisory.
  await writeFile(file, `${await readFile(file, 'utf8')}\n${transcript([
    toolUse('e2', 'Edit', { file_path: path.join(dir, 'b.go') }), toolResult('e2'),
  ])}`)
  const after = runLifecycleHook({ hook_event_name: 'Stop', transcript_path: file, cwd: dir })
  assert.match(after.stdout, /Changed paths include/)
  assert.match(after.stdout, /b\.go/)
  assert.doesNotMatch(after.stdout, /a\.go/, 'the published half is not re-reported')
})

test('reported: a project that ships a verify script is asked for that script', async () => {
  // blueprints, 2026-08-26. The project ran `./verify.sh` and the gate asked for
  // "the smallest repository-owned test, lint, build, or validation command" —
  // the fallback that names nothing, because this list did not know the name.
  const dir = await mkdtemp(path.join(testTmp, 'quality-verify-'))
  await writeFile(path.join(dir, 'verify.sh'), '#!/usr/bin/env bash\n')
  assert.equal(projectCheckCommand(dir), 'bash verify.sh')

  const nested = await mkdtemp(path.join(testTmp, 'quality-verify-nested-'))
  await mkdir(path.join(nested, 'scripts'), { recursive: true })
  await writeFile(path.join(nested, 'scripts', 'verify.sh'), '#!/usr/bin/env bash\n')
  assert.equal(projectCheckCommand(nested), 'bash scripts/verify.sh')

  // A project's own wrapper wins over the language's default: `go test ./...`
  // is a guess at part of what ./verify.sh does.
  await writeFile(path.join(dir, 'go.mod'), 'module example.com/x\n')
  assert.equal(projectCheckCommand(dir), 'bash verify.sh')
})

test('reported: a project that names no check hears nothing from the evidence gates', async () => {
  // redash-api, 2026-08-26, on 2.3.0: "this is useless.. repeats everywhere even
  // when we do not work with quality harness". The generic fallback — "run the
  // smallest repository-owned test, lint, build, or validation command" — fired
  // at the end of every turn in a repository that had never opted in, naming no
  // command and asking for nothing that could be delivered. A gate with nothing
  // specific to say says nothing.
  const bare = await mkdtemp(path.join(testTmp, 'quality-unopted-'))
  const file = path.join(bare, 'agent.jsonl')
  await writeFile(file, transcript([
    toolUse('e1', 'Write', { file_path: path.join(bare, 'redash_core.py') }), toolResult('e1'),
  ]))
  assert.equal(projectCheckCommand(bare), null, 'the fixture must declare no check')

  for (const event of ['Stop', 'TaskCompleted', 'SubagentStop']) {
    const run = runLifecycleHook({
      hook_event_name: event, transcript_path: file, agent_transcript_path: file, cwd: bare,
    })
    assert.equal(run.status, 0)
    assert.equal(`${run.stdout}${run.stderr}`.trim(), '', `${event} should be silent`)
  }
  const commit = runLifecycleHook({
    hook_event_name: 'PreToolUse', tool_name: 'Bash',
    tool_input: { command: 'git commit -m x' }, transcript_path: file, cwd: bare,
  })
  assert.equal(commit.status, 0)
  assert.equal(`${commit.stdout}${commit.stderr}`.trim(), '')

  // Declare one and the same session gets the same finding it always did, by name.
  await writeFile(path.join(bare, 'package.json'), JSON.stringify({ scripts: { test: 'pytest' } }))
  const named = runLifecycleHook({ hook_event_name: 'Stop', transcript_path: file, cwd: bare })
  assert.match(named.stdout, /npm run test/)
})

test('commit gate recognizes Git global options and executable wrappers', () => {
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
    const run = runLifecycleHook({
      hook_event_name: 'PreToolUse', tool_name: 'Bash',
      tool_input: { command }, transcript_path: missing,
    })
    assert.equal(run.status, 0, command)
    assert.match(run.stderr, /cannot tell whether this change was checked/i, command)
  }
})

test('commit and completion gates fail closed when the transcript is unreadable', () => {
  const missing = path.join(testTmp, 'quality-hook-transcript-does-not-exist.jsonl')

  // Exit 2 alone cannot say which gate answered, so each assertion names its reason.
  const commit = runLifecycleHook({
    hook_event_name: 'PreToolUse', tool_name: 'Bash',
    tool_input: { command: 'git commit -m test' }, transcript_path: missing,
  })
  assert.equal(commit.status, 0)
  assert.match(commit.stderr, /cannot tell whether this change was checked/i)

  const task = runLifecycleHook({ hook_event_name: 'TaskCompleted', transcript_path: missing })
  assert.equal(task.status, 0)
  assert.match(task.stderr, /completion evidence is unavailable/i)

  const stop = runLifecycleHook({ hook_event_name: 'Stop', transcript_path: missing })
  assert.equal(stop.status, 0)
  assert.match(stop.stdout, /"systemMessage"/)
})

test('subagent evidence gate remains active while the parent has background work', async () => {
  const dir = await checkedProject('quality-hook-')
  const file = path.join(dir, 'agent.jsonl')
  await writeFile(file, transcript([
    toolUse('e1', 'Edit', { file_path: '/repo/a.js' }), toolResult('e1'),
  ]))
  const run = runLifecycleHook({
    hook_event_name: 'SubagentStop', agent_transcript_path: file, cwd: dir,
    background_tasks: [{ id: 'parent-task' }],
  })
  assert.match(run.stdout, /"systemMessage"/)
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
  const stop = runLifecycleHook({ hook_event_name: 'Stop', transcript_path: file })
  assert.equal(stop.status, 0, stop.stderr)
  assert.equal(stop.stdout, '')

  const subagent = runLifecycleHook({ hook_event_name: 'SubagentStop', agent_transcript_path: file })
  assert.match(subagent.stdout, /Artifact validation failed/)

  const task = runLifecycleHook({ hook_event_name: 'TaskCompleted', transcript_path: file })
  assert.equal(task.status, 0)
  assert.match(task.stderr, /Artifact validation failed/)
})

test('an invalid Markdown artifact written through Bash is still gated', async () => {
  const dir = await mkdtemp(path.join(testTmp, 'quality-hook-bash-md-'))
  const artifact = path.join(dir, 'invalid-spec.md')
  const file = path.join(dir, 'agent.jsonl')
  await writeFile(artifact, '# Invalid\n\n## Facts\n\n## Grill Log\n')
  await writeFile(file, transcript([
    toolUse('b1', 'Bash', { command: `printf content > "${bashPath(artifact)}"` }), toolResult('b1'),
    toolUse('t1', 'Bash', { command: 'node --test tests/unit.test.mjs' }),
    toolResult('t1', false, 'tests 1\npass 1'),
  ]))
  const run = runLifecycleHook({ hook_event_name: 'SubagentStop', agent_transcript_path: file, cwd: dir })
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
    toolUse('b1', 'Bash', { command: `sed -i '' "${bashPath(specs)}/*.md"` }), toolResult('b1'),
    toolUse('t1', 'Bash', { command: 'node --test tests/unit.test.mjs' }),
    toolResult('t1', false, 'tests 1\npass 1'),
  ]))
  const run = runLifecycleHook({ hook_event_name: 'SubagentStop', agent_transcript_path: file, cwd: dir })
  assert.match(run.stdout, /Artifact validation failed/)
  assert.doesNotMatch(run.stdout, /unresolved path/i)
})

test('an unresolved Bash deletion is answered by the repository, not held against the session', async () => {
  // The sentinel comes from the public classifier so the test cannot drift from it.
  const [sentinel] = bashDeletionMutationPaths('rm -rf "$ARCHIVE"', testTmp)
  const repo = await mkdtemp(path.join(testTmp, 'quality-unresolved-rm-'))
  const fixtures = path.join(pluginDir, 'tests', 'fixtures', 'ok')
  await cp(path.join(fixtures, 'adr-archive'), path.join(repo, 'docs', 'adr-archive'), { recursive: true })
  await cp(path.join(fixtures, 'adr'), path.join(repo, 'docs', 'adr'), { recursive: true })
  spawnSync('git', ['init', '-q', '-b', 'main', repo], { encoding: 'utf8' })
  const git = (...args) => spawnSync('git', ['-C', repo, ...args], { encoding: 'utf8' })
  git('add', '-A')
  git('-c', 'user.email=gate@test', '-c', 'user.name=Gate', 'commit', '-q', '-m', 'archive')

  // A scratch deletion leaves the corpus whole, so the session is not held to a
  // question the repository has already answered.
  assert.equal(runArtifactGates([sentinel], repo), null)

  // When a record really is gone the gate still fails, and now it names the file.
  await rm(path.join(repo, 'docs', 'adr-archive', 'ADR-001-history.md'))
  const removed = runArtifactGates([sentinel], repo)
  assert.match(removed, /ADR-001-history\.md/)
  assert.match(removed, /archive catalog lists ADR-001/)

  // Outside a repository Git cannot answer, so the gate stays closed.
  assert.match(runArtifactGates([sentinel], testTmp), /Git cannot say what is missing/)
})

test('every record gate advises, at the edit and at the boundary alike', async () => {
  const repo = await mkdtemp(path.join(testTmp, 'quality-adr-set-'))
  const fixtures = path.join(pluginDir, 'tests', 'fixtures', 'ok')
  const docs = path.join(repo, 'docs')
  await mkdir(docs, { recursive: true })
  await cp(path.join(fixtures, 'ADR-001-selftest.md'), path.join(docs, 'ADR-001-selftest.md'))
  await cp(path.join(fixtures, 'tasks'), path.join(docs, 'tasks'), { recursive: true })
  const task = path.join(docs, 'tasks', 'T1-fixture.md')
  const dispatch = (event, filePath) => spawnSync(
    process.execPath,
    [path.join(pluginDir, 'scripts', 'run-shell-hook.mjs'), 'facts-gate-dispatch.sh'],
    {
      input: JSON.stringify({
        hook_event_name: event, tool_name: 'Write', tool_input: { file_path: filePath },
      }),
      encoding: 'utf8',
    },
  )

  assert.equal(dispatch('PostToolUse', task).status, 0)

  // Mid-sequence the set is legitimately incomplete: the index cannot list files
  // nobody has written yet. That must not make the next write unperformable.
  await rm(path.join(docs, 'tasks', 'README.md'))
  const edit = dispatch('PostToolUse', task)
  assert.equal(edit.status, 0, edit.stderr)
  // Exit-0 stdout reaches the model only as additionalContext, so the deferral
  // notice must arrive wrapped — a bare print would inform nobody.
  const context = JSON.parse(edit.stdout)
  assert.equal(context.hookSpecificOutput.hookEventName, 'PostToolUse')
  assert.match(context.hookSpecificOutput.additionalContext, /not satisfied yet/)
  assert.match(context.hookSpecificOutput.additionalContext, /no README\.md index/)

  // The commit and completion boundaries rerun the same dispatcher with no
  // boundary argument. The finding arrives there too — it just does not refuse,
  // and runArtifactGates still collects it, which is the half that matters: a
  // finding nobody is told about is worse than one that does not stop you.
  const atBoundary = dispatch('', task)
  assert.equal(atBoundary.status, 0, atBoundary.stderr)
  assert.match(atBoundary.stderr, /no README\.md index/)
  assert.match(runArtifactGates([task], repo), /no README\.md index/)

  // A gate that judges ONE file behaves the same way, and this is the change:
  // blocking at PostToolUse prevented nothing, because the write had already
  // landed and a hook cannot undo it. It cost the turn and protected no file.
  // Across the five gates there are 112 distinct failure messages and no
  // severity concept, so a missing section stopped a turn exactly as hard as a
  // fabricated `done` status.
  const spec = path.join(docs, 'specs', 'invalid.md')
  await mkdir(path.join(docs, 'specs'), { recursive: true })
  await writeFile(spec, '# Invalid\n\n## Facts\n\n## Grill Log\n')
  const specEdit = dispatch('PostToolUse', spec)
  assert.equal(specEdit.status, 0, specEdit.stderr)

  const specContext = JSON.parse(specEdit.stdout).hookSpecificOutput.additionalContext
  assert.match(specContext, /spec-verify/)
  // The advice has to carry the gate's own words, or it is just a mood: an agent
  // told WHICH sections are missing can fix them, one told the artifact is
  // imperfect cannot.
  assert.match(specContext, /no use cases found/)
  assert.match(specContext, /Nothing is blocked/)
  // And the severity split survives the trip: form arrives labelled as advice.
  assert.match(specContext, /advice\s+missing section/)

  // Same at the boundary: reported, not refused. What the harness keeps is the
  // ability to NAME a finding every time it sees one; what it gives up is the
  // ability to stop the call. That was the owner's decision, stated twice.
  const specBoundary = dispatch('', spec)
  assert.equal(specBoundary.status, 0, specBoundary.stderr)
  assert.match(specBoundary.stderr, /no use cases found/)
})

test('both ways the artifact gate can run out of budget reach the same guidance', () => {
  // The outer arm is unreachable on a host fast enough for run-shell-hook.mjs to
  // win the race, which is every POSIX host this suite runs on — so it is asserted
  // directly. windows-latest reached it in 32885035659 and got a bare
  // `spawnSync … ETIMEDOUT`: blocking, but naming no way forward.
  assert.equal(budgetExhausted('quality-harness: facts-gate-dispatch.sh timed out after 100ms'), true)
  assert.equal(budgetExhausted('spawnSync C:\\…\\node.exe ETIMEDOUT', { code: 'ETIMEDOUT' }), true)
  // A gate that reached a verdict is not a budget problem, whatever it says.
  assert.equal(budgetExhausted('ADR-001: Decision section is empty'), false)
  assert.equal(budgetExhausted('spawnSync node ENOENT', { code: 'ENOENT' }), false)
  assert.equal(budgetExhausted('the gate timed out', {}), false)
})

test('the artifact gate budget is raisable, and running out of it names the budget', async () => {
  assert.equal(artifactGateTimeoutMs({}), 30_000)
  assert.equal(artifactGateTimeoutMs({ QUALITY_HARNESS_SHELL_TIMEOUT_MS: '45000' }), 45_000)
  // Out of the runner's own range, or not a number: fall back rather than adopt.
  assert.equal(artifactGateTimeoutMs({ QUALITY_HARNESS_SHELL_TIMEOUT_MS: '10' }), 30_000)
  // Above the ceiling the operator wanted MORE, so clamp — not the default back.
  assert.equal(artifactGateTimeoutMs({ QUALITY_HARNESS_SHELL_TIMEOUT_MS: '999999' }), 110_000)
  assert.equal(artifactGateTimeoutMs({ QUALITY_HARNESS_SHELL_TIMEOUT_MS: 'soon' }), 30_000)

  // A record large enough that the gate cannot read it inside the smallest legal
  // budget. The gate's cost grows with what it reads, which is the whole point:
  // a corpus can outgrow a fixed budget without anything being wrong with it.
  const repo = await mkdtemp(path.join(testTmp, 'quality-gate-budget-'))
  const adr = path.join(repo, 'ADR-999-big.md')
  const filler = Array.from({ length: 400_000 }, (_, index) => `- line ${index} with words to parse`)
  await writeFile(adr, ['# ADR-999: Big', '', '## Existing Primitives Audit', '',
    '## Decision', '', '## Alternatives Considered', '', '## Consequences', '',
    ...filler, ''].join('\n'))

  const previous = process.env.QUALITY_HARNESS_SHELL_TIMEOUT_MS
  process.env.QUALITY_HARNESS_SHELL_TIMEOUT_MS = '100'
  try {
    // The child is given the operator's budget, not a value written over it —
    // the message quotes the number that was set here.
    const starved = runArtifactGates([adr], repo)
    // Which layer noticed depends on the host: the runner reports its own timeout
    // when it outlives the child, and the outer kill margin reports ETIMEDOUT when
    // it does not. Both are the same budget running out, so both must reach the
    // guidance below — asserting only the runner's wording passed here and failed
    // on windows-latest in 32885035659, where the message named no way forward.
    assert.match(starved, /timed out after 100ms|ETIMEDOUT/)
    assert.match(starved, /budget, not a finding/)
    assert.match(starved, /QUALITY_HARNESS_SHELL_TIMEOUT_MS/)
    assert.match(starved, /ADR-999-big\.md/)
    // Still blocking: a gate that did not finish has not cleared the record.
    assert.match(starved, /Artifact validation failed/)
  } finally {
    if (previous === undefined) delete process.env.QUALITY_HARNESS_SHELL_TIMEOUT_MS
    else process.env.QUALITY_HARNESS_SHELL_TIMEOUT_MS = previous
  }

  // With a budget that fits, the same record gets a real verdict about itself.
  const judged = runArtifactGates([adr], repo)
  assert.match(judged, /adr-lint/)
  assert.doesNotMatch(judged, /timed out/)
})

test('scratch writes under the temp root are not the repository\'s edits', async () => {
  // pluginDir stands in for a real (non-temp) project checkout; the scratch
  // base comes from the platform so the truths hold off-macOS too.
  const scratch = path.join(os.tmpdir(), 'qh-scratch')
  assert.equal(mutatesOnlyTempPaths(`printf x > "${scratch}/note.txt"`, pluginDir), true)
  assert.equal(mutatesOnlyTempPaths(`S="${scratch}"\ncat > "$S/commit.txt"`, pluginDir), true)
  assert.equal(mutatesOnlyTempPaths(`mkdir -p "${scratch}/old"`, pluginDir), true)
  assert.equal(mutatesOnlyTempPaths(`rm -rf "${scratch}"`, pluginDir), true)
  assert.equal(mutatesOnlyTempPaths(`git show HEAD:scripts/lifecycle.mjs > "${scratch}/old.mjs"`, pluginDir), true)

  // Anything unprovable, repo-touching, or executed keeps today's answer.
  assert.equal(mutatesOnlyTempPaths('printf x > docs/spec.md', pluginDir), false)
  assert.equal(mutatesOnlyTempPaths(`sed -i '' "${scratch}/x.md"`, pluginDir), false)
  assert.equal(mutatesOnlyTempPaths(`python3 "${scratch}/rewrite.py"`, pluginDir), false)
  // NOT here any more: `cp scripts/lifecycle.mjs "<scratch>/"`. It used to be
  // false, accounted by its source — but cp reads the source and writes only the
  // destination, so nothing in the repository changed. Asserted the other way in
  // the changed-path test above.
  assert.equal(mutatesOnlyTempPaths('cat > "$UNSET_VAR_QH/f"', pluginDir), false)
  assert.equal(mutatesOnlyTempPaths(`rm -rf "${scratch}/a" && printf x > README.md`, pluginDir), false)
  // A project living under the temp root gets no exemption at all.
  assert.equal(mutatesOnlyTempPaths(`printf x > "${scratch}/note.txt"`, testTmp), false)

  // The bypasses the 2.0.17 review demonstrated stay dead:
  // an option can smuggle the destination...
  assert.equal(mutatesOnlyTempPaths(`mv --target-directory=scripts "${scratch}/evil.js"`, pluginDir), false)
  assert.equal(mutatesOnlyTempPaths(`cp -tscripts "${scratch}/evil.js"`, pluginDir), false)
  assert.equal(mutatesOnlyTempPaths(`cp -t scripts "${scratch}/evil.js"`, pluginDir), false)
  // ...a later reassignment must not rewrite an earlier use...
  assert.equal(mutatesOnlyTempPaths(`S=docs\nprintf x > $S/f.md\nS="${scratch}"\nprintf y > $S/g`, pluginDir), false)
  // ...a glued redirect writes even where the mutation classifier is blind...
  assert.equal(mutatesOnlyTempPaths(`echo y > "${scratch}/ok"; echo x>scripts/f`, pluginDir), false)
  // ...and a symlink under the temp root is judged by where it lands, whether
  // it points at a directory, a file, or nothing yet.
  const linkDir = await mkdtemp(path.join(testTmp, 'quality-scratch-link-'))
  const directoryLink = path.join(linkDir, 'repo-link')
  await symlink(pluginDir, directoryLink)
  assert.equal(mutatesOnlyTempPaths(`printf x > "${directoryLink}/smuggled.txt"`, pluginDir), false)
  const fileLink = path.join(linkDir, 'file-link')
  await symlink(path.join(pluginDir, 'README.md'), fileLink)
  assert.equal(mutatesOnlyTempPaths(`printf x > "${fileLink}"`, pluginDir), false)
  const danglingLink = path.join(linkDir, 'dangling-link')
  await symlink(path.join(pluginDir, 'does-not-exist-yet.md'), danglingLink)
  assert.equal(mutatesOnlyTempPaths(`printf x > "${danglingLink}"`, pluginDir), false)

  // A scratch write is invisible to the evidence gate; a repo write is not.
  const scratchOnly = analyzeTranscript(transcript([
    toolUse('b1', 'Bash', { command: `cat > "${scratch}/notes.txt"` }), toolResult('b1'),
  ]), pluginDir)
  assert.equal(scratchOnly.hasMutations, false)
  const verifiedThenScratch = analyzeTranscript(transcript([
    toolUse('e1', 'Edit', { file_path: path.join(pluginDir, 'a.ts') }), toolResult('e1'),
    toolUse('t1', 'Bash', { command: 'pnpm test' }), toolResult('t1', false, '12 passed'),
    toolUse('b1', 'Bash', { command: `cat > "${scratch}/notes.txt"` }), toolResult('b1'),
  ]), pluginDir)
  assert.equal(verifiedThenScratch.verifiedAfterLastMutation, true)
})

test('a deletion and a commit in one command cannot hide what was removed', async () => {
  // The one shape nothing else can check. This hook runs BEFORE the command, so
  // the deletion has not happened and deletedTrackedPaths would answer about an
  // untouched tree; afterwards HEAD has moved and the answer is gone.
  const repo = await mkdtemp(path.join(testTmp, 'quality-launder-'))
  const file = path.join(repo, 'main.jsonl')
  await writeFile(file, transcript([
    toolUse('t1', 'Bash', { command: 'node --test tests/unit.test.mjs' }),
    toolResult('t1', false, 'tests 1\npass 1'),
  ]))
  const attempt = command => runLifecycleHook({
    hook_event_name: 'PreToolUse', tool_name: 'Bash', cwd: repo,
    transcript_path: file, tool_input: { command },
  })

  const blocked = attempt('rm -rf "$ARCHIVE_DIR" && git add -A && git commit -m cover')
  assert.equal(blocked.status, 0)
  assert.match(blocked.stderr, /deletes by an unresolved path and commits in the same breath/)

  // Named explicitly, the repository can answer, so it is allowed through here.
  assert.notEqual(attempt('rm -rf docs/adr-archive && git commit -m x').status, 2)
  assert.notEqual(attempt('git commit -m x').status, 2)
})

test('the artifact pass never outlives the hook it runs inside', async () => {
  // An exhausted window is a blocking failure, not a silent skip: an unread
  // artifact is not a clean one.
  const repo = await mkdtemp(path.join(testTmp, 'quality-window-'))
  const adr = path.join(repo, 'ADR-001-window.md')
  await writeFile(adr, ['# ADR-001: Window', '', '## Existing Primitives Audit', '',
    '## Decision', '', '## Alternatives Considered', '', '## Consequences', ''].join('\n'))
  const exhausted = runArtifactGates([adr], repo, 500)
  assert.match(exhausted, /window was exhausted before/)
  assert.match(exhausted, /Artifact validation failed/)
})

// --- the false blocks users actually reported -------------------------------
//
// Each of these is a shape that stopped real work in a real session. They are
// written as the reports arrived rather than as tidy minimal cases, because the
// tidy version is what passed while the real one failed.

test('reported: a read-only command is not authorship because of how it is spelled', () => {
  // Hit live on 2026-08-26 while trying to WATCH a CI run:
  //   gh run watch 123 > /dev/null 2>&1
  //   -> "Bash would mutate files in protected 'main'. Create a task branch first"
  //
  // `\s*` matched the space, the /dev/null exclusion failed, the engine handed the
  // space back, and the lookahead was re-tried against " /dev/null" — which does
  // not start with /dev/null. So the spacing decided whether reading counted as
  // writing. Recorded in BACKLOG item 6 as "one careful regex away" and left
  // unfixed until it blocked a session.
  const nul = ['>', ' /dev/null'].join('')
  for (const spelling of [`gh run watch 123 ${nul} 2>&1`, `gh run watch 123 >/dev/null`,
    `printf x ${nul}`, `node --test ${nul} 2>&1`]) {
    assert.equal(isPotentialMutationCommand(spelling), false, spelling)
  }

  // Closing a descriptor writes nothing either.
  assert.equal(isPotentialMutationCommand('git fsck 2>&-'), false)
  assert.equal(isPotentialMutationCommand('git fsck 2>&1'), false)

  // The exclusion must stay narrow: a real write is still a write, and a path
  // that merely BEGINS like the null device is not it.
  assert.equal(isPotentialMutationCommand(['printf x ', ' out.txt'].join('>')), true)
  assert.equal(isPotentialMutationCommand(['printf x ', ' /dev/null-backup'].join('>')), true)
  assert.equal(isPotentialMutationCommand(['printf x ', '> appended.log'].join('>')), true)

  // A glued redirect is a redirect. `printf x>out.txt` writes a file, and the
  // old `(?:^|\s)` prefix required whitespace, so the evidence gate never saw it
  // — a fail-open living in the same regex as the two false blocks above.
  assert.equal(isPotentialMutationCommand(['printf x', 'out.txt'].join('>')), true)

  // Quoted segments are stripped before the test, so a `>` that is a comparison
  // in someone else's language is not read as a redirect in this one. That is
  // what makes the glued-redirect fix safe rather than noisy.
  assert.equal(isPotentialMutationCommand("python3 -c 'print(1 if a>b else 2)'"), false)
  assert.equal(isPotentialMutationCommand('echo "a > b"'), false)
})

test('reported: a Windows path is a path, not an escape sequence', () => {
  // `\` is a shell escape on POSIX and the path separator on Windows. The
  // deletion resolver treated it as unresolvable on both, so on Windows EVERY
  // literal path deletion came back <Unresolved Bash deletion> — which is why the
  // sticky sentinel bit hardest there. Caught by the windows job on 2026-08-26,
  // on a test written for the POSIX shape of the same bug.
  //
  // The platform is a parameter so both branches are exercised here rather than
  // on one machine each. mutatesOnlyTempPaths already excluded `\` from its own
  // ambiguous set; the two had simply disagreed.
  const win = String.raw`C:\Users\RUNNER~1\AppData\Local\Temp\scratch`
  const onWindows = bashDeletionMutationPaths(`rm -rf "${win}"`, 'C:\\repo', 'win32')
  assert.ok(!onWindows.includes('<Unresolved Bash deletion>'), JSON.stringify(onWindows))

  // On POSIX the same characters really are escapes, and must stay unresolvable.
  assert.ok(bashDeletionMutationPaths(`rm -rf "${win}"`, '/repo', 'linux')
    .includes('<Unresolved Bash deletion>'))

  // A glob is unresolvable on both, because it names no single path.
  for (const platform of ['win32', 'linux']) {
    assert.ok(bashDeletionMutationPaths('rm -rf build/*', '/repo', platform)
      .includes('<Unresolved Bash deletion>'), platform)
  }
})

test('no finding is ever hidden: every advisory surfaces as a systemMessage', async () => {
  // The owner's rule, stated three times: never block, never hide. The advisory
  // conversion nearly violated the second half — exit-0 stderr alone is surfaced
  // only in transcript view, so a finding written there reaches nobody. Every
  // advisory therefore emits a systemMessage, which the session shows regardless
  // of exit code, alongside stderr for the transcript.
  const repo = await checkedProject('quality-visible-')
  const file = path.join(repo, 'agent.jsonl')
  await writeFile(file, transcript([
    toolUse('e1', 'Write', { file_path: path.join(repo, 'service.py') }), toolResult('e1'),
  ]))

  // A completion boundary with unverified edits: exit 0, and the finding is in
  // BOTH channels.
  const completion = runLifecycleHook({
    hook_event_name: 'TaskCompleted', transcript_path: file, cwd: repo,
  })
  assert.equal(completion.status, 0, completion.stderr)
  assert.match(completion.stdout, /"systemMessage"/, 'the session must see it')
  assert.match(completion.stderr, /\S/, 'the transcript must see it')

  // The commit boundary, same contract.
  const commit = runLifecycleHook({
    hook_event_name: 'PreToolUse', tool_name: 'Bash', cwd: repo,
    transcript_path: file, tool_input: { command: 'git commit -m x' },
  })
  assert.equal(commit.status, 0, commit.stderr)
  assert.match(commit.stdout, /"systemMessage"/)

  // And a clean state stays silent — guidance, not noise.
  const clean = await mkdtemp(path.join(testTmp, 'quality-visible-clean-'))
  const cleanFile = path.join(clean, 'agent.jsonl')
  await writeFile(cleanFile, transcript([
    toolUse('t1', 'Bash', { command: 'npm run test' }),
    toolResult('t1', false, 'tests 1\npass 1'),
  ]))
  const quiet = runLifecycleHook({
    hook_event_name: 'TaskCompleted', transcript_path: cleanFile, cwd: clean,
  })
  assert.equal(quiet.status, 0)
  assert.doesNotMatch(quiet.stdout, /"systemMessage"/)
})

test('reported: a build in a container is a build, not a deletion', () => {
  // depozitas_laravel, 2026-08-26. `docker compose run --rm --no-deps node sh -c
  // 'cd /var/www && npm run build'` was recorded as a MUTATION, so every build
  // demanded another build — a closed loop the session escaped only by running
  // npm ci (37 packages) to make a native build possible.
  //
  // `--rm` was read as the `rm` command: \b treats a hyphen as a word boundary.
  const containerBuild = "docker compose run --rm --no-deps node sh -c 'cd /var/www && npm run build'"
  assert.equal(isPotentialMutationCommand(containerBuild), false, containerBuild)
  assert.equal(isPotentialMutationCommand('docker compose run --rm app npm run build'), false)
  // The same trap sits under every mutator word that is also a flag.
  for (const flag of ['--rm', '--move', '--copy', '--install', '--patch', '--link']) {
    assert.equal(isPotentialMutationCommand(`some-tool ${flag} thing`), false, flag)
  }
  // And a real one is still real.
  assert.equal(isPotentialMutationCommand('rm -rf build'), true)
  assert.equal(isPotentialMutationCommand('docker compose exec -T app rm -rf storage'), true)

  // The other half: nothing containerised counted as validation, so a project
  // whose tests run in a container produced no evidence at all — 286 passing
  // tests, and the completion gate still asking for a check.
  assert.equal(isValidationCommand('docker compose exec -T app php artisan test'), true)
  assert.equal(isValidationCommand(containerBuild), true)
  assert.equal(isValidationCommand('docker exec -u root ctr npm run test'), true)

  // A wrapper judges what it runs — it does not launder what it runs.
  assert.equal(isValidationCommand('docker compose exec -T app rm -rf storage'), false)
  assert.equal(isValidationCommand('docker compose exec -T app php artisan migrate'), false)

  // Two runners that were missing outright, container or not.
  assert.equal(isValidationCommand('php artisan test'), true)
  assert.equal(isValidationCommand('./vendor/bin/phpunit'), true)
  assert.equal(isValidationCommand('php artisan migrate'), false)

  // Only one layer of each wrapper is peeled: guessing deeper is how a wrapper
  // starts hiding a mutation inside a validation.
  assert.equal(commandInsideWrappers('docker compose exec -T app php artisan test'), 'php artisan test')
  assert.equal(commandInsideWrappers('npm run test'), 'npm run test')
})

test('reported: a long session can still commit', async () => {
  // Webitel, 2026-08-26. An ADR/spec session made dozens of edits; every commit
  // re-gated the whole accumulated list against a fixed 45s window, so once the
  // per-file cost crossed it EVERY commit failed, naming a different file as the
  // cutoff each time. Three retries, three different files.
  const entries = []
  for (let index = 0; index < 40; index += 1) {
    entries.push(toolUse(`e${index}`, 'Write', { file_path: `/repo/docs/specs/spec-${index}.md` }),
      toolResult(`e${index}`))
  }
  entries.push(toolUse('c1', 'Bash', { command: 'git commit -m "first batch"' }), toolResult('c1'))
  entries.push(toolUse('last', 'Write', { file_path: '/repo/docs/specs/current.md' }), toolResult('last'))

  const state = analyzeTranscript(transcript(entries))
  assert.ok(state.mutationPaths.length > 40, 'the session still knows everything it touched')
  // But the commit gates one file: the one being published.
  assert.deepEqual(state.mutationPathsSince(state.lastPublish), ['/repo/docs/specs/current.md'])
})

test('reported: the nag says what changed in a form a person can read', async () => {
  // depozitas_laravel, 2026-08-26. The Stop message spliced 120 raw characters of
  // each command into one sentence, so a heredoc put newlines and a mid-token
  // truncation into the text that exists to say WHAT CHANGED:
  //   <Bash mutation: cd /repo
  //   python3 - <<'PY'
  //   import io
  //   p="tests/Unit/Notifications/CustomerEmailTest.p>
  const dir = await checkedProject('quality-nag-')
  const file = path.join(dir, 'agent.jsonl')
  const heredoc = 'cd /repo\npython3 - <<\'PY\'\nimport pathlib\n'
    + 'pathlib.Path("tests/Unit/Notifications/CustomerEmailTest.php").write_text("x")\nPY'
  await writeFile(file, transcript([
    toolUse('b1', 'Bash', { command: heredoc }), toolResult('b1'),
  ]))
  const run = runLifecycleHook({ hook_event_name: 'Stop', transcript_path: file, cwd: dir })
  const message = `${run.stdout}${run.stderr}`
  assert.match(message, /Changed paths include/)
  // The reader must get one line per thing changed. A raw newline inside a
  // marker is what made the report unreadable.
  const markers = message.match(/<Bash mutation: [^>]*>/g) ?? []
  assert.ok(markers.length > 0, message)
  for (const marker of markers) assert.doesNotMatch(marker, /\n/, marker)
})

test('reported: cleaning up a scratch directory does not brick the session', async () => {
  // This repository, 2026-08-26, mid-session. `W=<temp>; rm -rf "$W"` armed the
  // unresolved-deletion sentinel, and because a publish after one failed closed,
  // committing was blocked for the rest of the session. Two commits had to be
  // run by hand through the `!` prefix.
  const repo = await mkdtemp(path.join(testTmp, 'quality-scratch-'))
  const scratch = path.join(os.tmpdir(), 'quality-scratch-target')
  const file = path.join(repo, 'agent.jsonl')
  await writeFile(file, transcript([
    toolUse('b1', 'Bash', { command: `W=${scratch}\nrm -rf "$W"\nmkdir -p "$W"` }), toolResult('b1'),
    toolUse('e1', 'Write', { file_path: path.join(repo, 'notes.md') }), toolResult('e1'),
    toolUse('c1', 'Bash', { command: 'git commit -m one' }), toolResult('c1'),
  ]))

  // The scratch deletion resolves, so nothing is unresolved and nothing sticks.
  const cleaned = bashDeletionMutationPaths(`W=${scratch}\nrm -rf "$W"`, repo)
  assert.ok(!cleaned.includes('<Unresolved Bash deletion>'), JSON.stringify(cleaned))
  const state = analyzeTranscript(await readFile(file, 'utf8'), repo)
  assert.ok(!state.mutationPaths.includes('<Unresolved Bash deletion>'))
})

test('reported: a deletion in one command does not block every commit after it', async () => {
  // The rule that did this was inverted. Measured 2026-08-26: `rm -rf "$X" &&
  // git commit` in ONE command did NOT arm it — both land at the same tool-use
  // position and the comparison was strict — while a deletion followed by a
  // SEPARATE commit did, on every commit for the rest of the session. A separate
  // commit runs the PreToolUse hook first, and runArtifactGates resolves the
  // deletion through deletedTrackedPaths while HEAD still answers. So it fired
  // only on deletions that had already been checked.
  const repo = await mkdtemp(path.join(testTmp, 'quality-sticky-'))
  const file = path.join(repo, 'agent.jsonl')
  await writeFile(file, transcript([
    toolUse('b1', 'Bash', { command: 'rm -rf "$ARCHIVE_DIR"' }), toolResult('b1'),
    toolUse('c1', 'Bash', { command: 'git commit -m one' }), toolResult('c1'),
    toolUse('t1', 'Bash', { command: 'node --test tests/unit.test.mjs' }),
    toolResult('t1', false, 'tests 1\npass 1'),
  ]))
  // The completion boundary must not refuse the session outright.
  const task = runLifecycleHook({ hook_event_name: 'TaskCompleted', transcript_path: file, cwd: repo })
  assert.doesNotMatch(`${task.stdout}${task.stderr}`, /commit has already landed since/)
})

test('the gate names the check this project owns instead of asking for one', async () => {
  // The harness's own repository names its check in a script.
  assert.equal(projectCheckCommand(pluginDir), 'bash scripts/selftest.sh')

  // A package manifest is read for a real script, in lock-file order.
  const node = await mkdtemp(path.join(testTmp, 'quality-check-node-'))
  await writeFile(path.join(node, 'package.json'),
    JSON.stringify({ scripts: { build: 'tsc', test: 'vitest run' } }))
  assert.equal(projectCheckCommand(node), 'npm run test')
  await writeFile(path.join(node, 'pnpm-lock.yaml'), '')
  assert.equal(projectCheckCommand(node), 'pnpm test')

  // An empty or absent scripts block names nothing rather than guessing.
  const bare = await mkdtemp(path.join(testTmp, 'quality-check-bare-'))
  await writeFile(path.join(bare, 'package.json'), JSON.stringify({ name: 'x' }))
  assert.equal(projectCheckCommand(bare), null)

  const make = await mkdtemp(path.join(testTmp, 'quality-check-make-'))
  await writeFile(path.join(make, 'Makefile'), 'all:\n\techo hi\ncheck:\n\techo ok\n')
  assert.equal(projectCheckCommand(make), 'make check')

  // Whatever is offered must be something the evidence rule actually accepts —
  // naming a command the gate would then refuse is worse than naming none.
  for (const command of ['bash scripts/selftest.sh', 'npm run test', 'pnpm test', 'make check',
    'cargo test', 'go test ./...', 'pytest']) {
    assert.equal(isValidationCommand(command), true, command)
  }

  // And the blocking message carries it. The fixture repo sits on a task branch
  // with its own manifest, so this reads the project under test rather than the
  // host checkout — the trap that made this suite branch-sensitive before.
  spawnSync('git', ['init', '-q', '-b', 'task/work', node], { encoding: 'utf8' })
  const file = path.join(node, 'main.jsonl')
  await writeFile(file, transcript([
    toolUse('e1', 'Edit', { file_path: path.join(node, 'a.ts') }), toolResult('e1'),
  ]))
  const run = runLifecycleHook({
    hook_event_name: 'PreToolUse', tool_name: 'Bash',
    tool_input: { command: 'git commit -m test' }, transcript_path: file, cwd: node,
  })
  assert.equal(run.status, 0)
  assert.match(run.stderr, /Run `pnpm test` \(this project's own check\)/)
})

test('a bin/ gate is spawned in a way Windows can actually run', async () => {
  // The gates are `#!` scripts, which Windows cannot exec: a direct spawn returns
  // status null, and readyTaskLines' `continue` turned that into a silently empty
  // session orientation on every Windows session. Exercise the win32 branch HERE
  // by asking for it explicitly — the interpreter it names works on this platform
  // too, so the branch is testable without a Windows box.
  const repo = await mkdtemp(path.join(testTmp, 'quality-spawn-gate-'))
  await cp(path.join(pluginDir, 'tests', 'fixtures', 'ok', 'tasks'),
    path.join(repo, 'tasks'), { recursive: true })
  const tool = path.join(pluginDir, 'bin', 'adr-next')
  const options = { encoding: 'utf8', timeout: 10_000 }

  const windows = spawnGate(tool, [path.join(repo, 'tasks'), '--json'], options, 'win32')
  assert.equal(windows.status, 0, windows.stderr)
  assert.ok(JSON.parse(windows.stdout).ready?.length, 'the win32 branch must reach the gate')

  // The POSIX branch execs the `#!` script itself, which is the thing Windows
  // cannot do — so comparing the two branches is only meaningful where BOTH can
  // run. Asserting it unconditionally made this test fail on the one platform it
  // was written for, which is how it failed on windows-latest in 32884859881.
  if (process.platform !== 'win32') {
    const posix = spawnGate(tool, [path.join(repo, 'tasks'), '--json'], options, 'linux')
    assert.equal(posix.stdout, windows.stdout, 'both branches must read the same corpus')
  }

  // Narrow guard against the exact regression. Exactly one `spawnSync(tool` may
  // exist — spawnGate's own POSIX branch — so a second one means a caller went
  // back to spawning a `#!` gate directly.
  const source = await readFile(path.join(pluginDir, 'scripts', 'lifecycle.mjs'), 'utf8')
  assert.equal((source.match(/spawnSync\(tool\b/g) ?? []).length, 1,
    'a bin/ gate must be spawned through spawnGate, which names the interpreter on Windows')
})

test('adr-next reads the task files, not the index that describes them', async () => {
  const repo = await mkdtemp(path.join(testTmp, 'quality-adr-next-'))
  const tasks = path.join(repo, 'tasks')
  await cp(path.join(pluginDir, 'tests', 'fixtures', 'ok', 'tasks'), tasks, { recursive: true })
  await cp(path.join(pluginDir, 'tests', 'fixtures', 'ok', 'ADR-001-selftest.md'),
    path.join(repo, 'ADR-001-selftest.md'))

  const next = (...args) => runGate(path.join(pluginDir, 'bin', 'adr-next'), args)
  const first = next(path.join(repo, 'ADR-001-selftest.md'))
  assert.equal(first.status, 0, first.stderr)
  assert.match(first.stdout, /Next: T1/)
  // The hint skips shell preamble: `set -e` is not what proves the task.
  assert.match(first.stdout, /acceptance: adr-lint/)
  assert.match(first.stdout, /prove it:\s+adr-verify/)

  // A second task that depends on the first is blocked until T1 has evidence.
  const t1 = await readdir(tasks)
  assert.ok(t1.includes('T1-fixture.md'))
  const t2 = (await import('node:fs/promises')).readFile
  const body = await t2(path.join(tasks, 'T1-fixture.md'), 'utf8')
  await writeFile(path.join(tasks, 'T2-second.md'),
    body.replace(/^# .*$/m, '# Task ADR-001-T2: Second').replace(/^\*\*Depends-on:\*\* .*$/m, '**Depends-on:** T1'))
  const blocked = next(tasks, '--json')
  const report = JSON.parse(blocked.stdout)
  assert.deepEqual(report.ready.map(task => task.id), ['T1'])
  assert.deepEqual(report.blocked.map(task => task.id), ['T2'])
  assert.deepEqual(report.blocked[0].blocked_by, ['T1'])

  // A README claiming everything is done cannot make a task disappear: only a
  // tool-written exit-0 entry whose digest matches the Acceptance counts.
  await writeFile(path.join(tasks, 'README.md'),
    '# Tasks\n\n| Order | Task | Depends-on |\n|---|---|---|\n| 1 | T1 done | none |\n| 2 | T2 done | T1 |\n')
  const stillReady = JSON.parse(next(tasks, '--json').stdout)
  assert.deepEqual(stillReady.ready.map(task => task.id), ['T1'])
  assert.deepEqual(stillReady.done, [])
})

test('every hook script the runner accepts has its arguments wired', () => {
  // The runner rejects anything outside HOOK_SCRIPTS, so the fall-through in
  // hookArguments cannot fire today. It exists for the next script added to the
  // set: without arguments a gate is handed no file, and a gate handed no file
  // exits 0 — a check that silently cannot fail. This test is what makes adding
  // a script without wiring it an error instead of a quiet pass.
  const payload = JSON.stringify({
    hook_event_name: 'PostToolUse', tool_name: 'Write',
    tool_input: { file_path: '/repo/docs/ADR-001.md' },
  })
  for (const script of HOOK_SCRIPTS) {
    const args = hookArguments(script, payload, 'linux')
    assert.ok(Array.isArray(args) && args.length > 0, script)
    assert.ok(args.includes('/repo/docs/ADR-001.md'), `${script} must pass the file path`)
  }
  assert.throws(() => hookArguments('not-wired.sh', payload, 'linux'),
    /hookArguments does not build its arguments/)
})

// --- Wave 2 of docs/TEST-PLAN.md: the escapes, and the hook nothing ever fired.

test('a commit gates what it is publishing, not everything the session touched', () => {
  // mutationPaths is append-only across the whole transcript. Re-gating all of it
  // at every commit meant the per-file cost grew without bound until it exceeded
  // the boundary's 45s window — and from then on EVERY commit failed, whatever
  // was staged, naming a different file as the cutoff each time. Reported from a
  // live 2.1.7 session on 2026-08-26; on this repository's own transcript the
  // accumulated list had reached 390 entries against 33 actually being published.
  const state = analyzeTranscript(transcript([
    toolUse('e1', 'Write', { file_path: '/repo/first.md' }), toolResult('e1'),
    toolUse('c1', 'Bash', { command: 'git commit -m first' }), toolResult('c1'),
    toolUse('e2', 'Write', { file_path: '/repo/second.md' }), toolResult('e2'),
  ]))

  // The whole list is unchanged, because the completion gate and the nag still
  // ask about the session.
  assert.ok(state.mutationPaths.includes('/repo/first.md'))
  assert.ok(state.mutationPaths.includes('/repo/second.md'))

  // What a commit gates is only what came after the last publish.
  const publishing = state.mutationPathsSince(state.lastPublish)
  assert.deepEqual(publishing, ['/repo/second.md'])

  // Before any publish, nothing is pruned — a first commit still gates it all.
  const fresh = analyzeTranscript(transcript([
    toolUse('e1', 'Write', { file_path: '/repo/only.md' }), toolResult('e1'),
  ]))
  assert.deepEqual(fresh.mutationPathsSince(fresh.lastPublish), ['/repo/only.md'])
})

test('a deletion whose path the command itself set is not unresolved', async () => {
  // `W=/tmp/scratch; rm -rf "$W"` names its own path — the value is in the
  // command, in front of the use. Until 2026-08-26 the sentinel armed on every
  // scratch cleanup written that way, and because a publish after an unresolved
  // deletion fails closed, committing was bricked for the rest of the session.
  // It happened here, mid-session, on this repository.
  const repo = await mkdtemp(path.join(testTmp, 'quality-deletion-'))
  const scratch = path.join(os.tmpdir(), 'quality-deletion-target')
  const resolved = bashDeletionMutationPaths(`W=${scratch}\nrm -rf "$W"`, repo)
  assert.ok(!resolved.includes('<Unresolved Bash deletion>'), JSON.stringify(resolved))
  assert.equal(resolved.length, 1)
  // Separator-insensitive: the resolver normalises, and which separator it lands
  // on is not what this test is about.
  assert.match(resolved[0].replaceAll('\\', '/'), /quality-deletion-target$/)

  // The three ways it must STILL refuse, because each would disarm the sentinel
  // on a value the command did not establish.
  const refuses = {
    'a use before its assignment': `rm -rf "$W"\nW=${scratch}`,
    'a value from the ambient environment': 'rm -rf "$HOME/thing"',
    'a glob, which names no single path': `W=${scratch}\nrm -rf "$W"/*`,
  }
  for (const [why, command] of Object.entries(refuses)) {
    assert.ok(bashDeletionMutationPaths(command, repo).includes('<Unresolved Bash deletion>'), why)
  }

  // Ordering is the point: a later reassignment must not reach back.
  const ordered = bashDeletionMutationPaths(`W=${scratch}\nrm -rf "$W"\nW=${repo}`, repo)
  assert.match(ordered[0].replaceAll('\\', '/'), /quality-deletion-target$/)
})

test('an unresolvable Bash write is named in one readable line', async () => {
  // The completion message exists to say what changed. It used to splice 120 raw
  // characters of the command into that sentence, so a heredoc put newlines and a
  // mid-token truncation into it and five of them joined by ", " were unreadable.
  // Reported from a live 2.1.7 session on 2026-08-26.
  // The body has to actually WRITE. A heredoc that only reads is correctly not a
  // mutation — the classifier inspects the script rather than assuming, which is
  // why `python3 -` with unknown stdin counts and this one is judged on content.
  const heredoc = 'cd /repo\npython3 - <<\'PY\'\nimport pathlib\n'
    + 'pathlib.Path("tests/Unit/CustomerEmailTest.php").write_text("x")\nPY'
  const described = describeCommand(heredoc)
  assert.doesNotMatch(described, /\n/, 'a marker must not carry newlines into the sentence')
  // NOT 'cd /repo'. The first line of an agent's Bash call is almost always the
  // move into the repository, so describing it describes the one segment that
  // changed nothing — and five such calls produced five identical markers that
  // said nothing at all. Live 2.3.0 session, 2026-08-26.
  assert.equal(described, "python3 - <<'PY'")

  // Navigation is peeled however it is spelled, and a command that is ONLY
  // navigation still describes itself rather than collapsing to an empty marker.
  assert.equal(describeCommand('cd /repo\ngit add -A && git commit -m x'),
    'git add -A && git commit -m x')
  assert.equal(describeCommand('cd "/a b/repo" && rm -rf build'), 'rm -rf build')
  assert.equal(describeCommand('pushd /repo; touch f'), 'touch f')
  assert.equal(describeCommand('cd /repo'), 'cd /repo')
  assert.equal(describeCommand('cd /repo &&'), 'cd /repo &&')

  // Long single-line commands are cut at a word boundary, not mid-token.
  const long = `git commit -m ${'word '.repeat(40)}`
  const cut = describeCommand(long)
  assert.ok(cut.length <= 73, cut)
  assert.match(cut, /…$/)
  assert.doesNotMatch(cut, /wor…$/, 'cut at a space, not inside a word')

  // Short commands are left exactly as they are.
  assert.equal(describeCommand('rm -rf build'), 'rm -rf build')
  assert.equal(describeCommand(undefined), '')

  // And the marker must stay non-absolute, because that is what keeps an
  // unresolvable command OUT of the artifact gate rather than into it.
  const dir = await mkdtemp(path.join(testTmp, 'quality-marker-'))
  const file = path.join(dir, 'agent.jsonl')
  await writeFile(file, transcript([
    toolUse('b1', 'Bash', { command: heredoc }), toolResult('b1'),
  ]))
  const state = analyzeTranscript(await readFile(file, 'utf8'))
  const marker = state.mutationPaths.find(p => p.startsWith('<Bash mutation:'))
  assert.ok(marker, 'the write is still recorded')
  assert.doesNotMatch(marker, /\n/)
  assert.equal(path.isAbsolute(marker), false)
})

test('SubagentStart states the leaf-role contract, and never blocks', async () => {
  // hooks.json declares this event and the installed plugin registers it, so
  // subagentContract runs on every subagent launch in production. Nothing had
  // ever fired it in a test.
  const dir = await mkdtemp(path.join(testTmp, 'quality-subagent-'))
  const run = runLifecycleHook({ hook_event_name: 'SubagentStart', agent_type: 'explore', cwd: dir })

  assert.equal(run.status, 0, run.stderr)
  const emitted = JSON.parse(run.stdout)
  assert.equal(emitted.hookSpecificOutput.hookEventName, 'SubagentStart')
  assert.match(emitted.hookSpecificOutput.additionalContext, /QUALITY CONTRACT/)
  // A start hook that can block would stop a subagent before it began. There is
  // no decision to make here, so there must be no decision key.
  assert.equal('decision' in emitted, false)
  assert.doesNotMatch(run.stdout, /"decision"/)
})

test('a read-only role is told it is read-only, and an editing role is not', async () => {
  const dir = await mkdtemp(path.join(testTmp, 'quality-subagent-roles-'))
  const contract = agentType =>
    JSON.parse(runLifecycleHook({ hook_event_name: 'SubagentStart', agent_type: agentType, cwd: dir })
      .stdout).hookSpecificOutput.additionalContext

  // Every member of the read-only set, so dropping one from the pattern fails
  // here rather than silently telling an investigator it may edit.
  for (const role of ['explore', 'plan', 'research', 'review', 'audit', 'scout', 'memory']) {
    assert.match(contract(role), /read-only/, role)
    assert.doesNotMatch(contract(role), /smallest coherent diff/, role)
  }
  // And the reverse: an implementation role must not be told to hold back.
  for (const role of ['execution', 'implement', 'fix', undefined]) {
    assert.match(contract(role), /smallest coherent diff/, String(role))
    assert.doesNotMatch(contract(role), /Treat this role as read-only/, String(role))
  }
  // Substring, not equality: `code-reviewer` is a reviewing role.
  assert.match(contract('code-reviewer'), /read-only/)
})

// A docs-only change with no verification after it — the state both escapes exist
// to release, and the state they must not release without their condition.
async function unverifiedDocsChange(name) {
  const dir = await checkedProject(`quality-escape-${name}-`)
  const file = path.join(dir, 'agent.jsonl')
  await writeFile(path.join(dir, 'notes.md'), '# Notes\n')
  await writeFile(file, transcript([
    toolUse('e1', 'Write', { file_path: path.join(dir, 'notes.md') }), toolResult('e1'),
  ]))
  return { dir, file }
}

test('EVIDENCE-LIMITED opens the completion gate only with a stated reason', async () => {
  const { dir, file } = await unverifiedDocsChange('evidence')
  const stop = message => runLifecycleHook({
    hook_event_name: 'Stop', transcript_path: file, cwd: dir, last_assistant_message: message,
  })

  // Negative control first: without the escape this state must block, or every
  // assertion below is about a gate that was open anyway.
  const blocked = stop('Done.')
  assert.match(blocked.stdout, /"systemMessage"/)

  assert.equal(stop('EVIDENCE-LIMITED: no runtime is installed here').stdout, '')

  // A reason short enough to be a shrug is not a reason. `EVIDENCE-LIMITED: x`
  // would otherwise be a two-character bypass of the whole gate.
  assert.match(stop('EVIDENCE-LIMITED: x').stdout, /"systemMessage"/)
  assert.match(stop('EVIDENCE-LIMITED:').stdout, /"systemMessage"/)
})

test('EVIDENCE-LIMITED does not release a code change, however well explained', async () => {
  // The escape exists because prose cannot always be executed. Code can, so
  // docsOnly guards it — and that guard is the difference between an escape and
  // a bypass.
  const dir = await checkedProject('quality-escape-code-')
  const file = path.join(dir, 'agent.jsonl')
  await writeFile(file, transcript([
    toolUse('e1', 'Write', { file_path: path.join(dir, 'service.py') }), toolResult('e1'),
  ]))
  const run = runLifecycleHook({
    hook_event_name: 'Stop', transcript_path: file, cwd: dir,
    last_assistant_message: 'EVIDENCE-LIMITED: the integration environment is unreachable',
  })
  assert.match(run.stdout, /"systemMessage"/)
})

test('an interim answer defers the gate at Stop, and never at TaskCompleted', async () => {
  const { dir, file } = await unverifiedDocsChange('interim')
  const at = (event, message) => runLifecycleHook({
    hook_event_name: event, transcript_path: file, cwd: dir, last_assistant_message: message,
  })

  // Stop fires whenever the assistant yields the turn, including to ask a
  // question. Blocking there would trap a session that is mid-conversation.
  assert.equal(at('Stop', 'I am blocked on which schema you want.').stdout, '')
  assert.equal(at('Stop', 'Waiting for your decision before continuing.').stdout, '')

  // TaskCompleted is a claim that the work is finished. "I am blocked" cannot
  // both be true and finish the task, so the escape must not reach here.
  const claimed = at('TaskCompleted', 'I am blocked on which schema you want.')
  assert.equal(claimed.status, 0)
  assert.match(claimed.stderr, /Changed paths include:.*notes\.md/)

  // And a plain sign-off is not an interim answer at either boundary.
  assert.match(at('Stop', 'All done, shipped it.').stdout, /"systemMessage"/)
})

test('navigation refreshes the tree without counting as authored work', async () => {
  const repo = await mkdtemp(path.join(testTmp, 'quality-navigation-'))
  spawnSync('git', ['init', '-q', '-b', 'main', repo], { encoding: 'utf8' })
  await writeFile(path.join(repo, 'tracked.txt'), 'one\n')
  const git = (...args) => spawnSync('git', ['-C', repo, ...args], { encoding: 'utf8' })
  git('add', '-A')
  git('-c', 'user.email=gate@test', '-c', 'user.name=Gate', 'commit', '-q', '-m', 'init')
  git('branch', 'task/work')

  assert.equal(bashNavigationImpact('git checkout task/work && git pull --ff-only', repo), 'refresh')
  assert.equal(bashNavigationImpact('git switch task/work', repo), 'refresh')
  // A non-fast-forward pull can create a merge commit: authorship, not navigation.
  assert.equal(bashNavigationImpact('git pull', repo), null)
  assert.equal(bashNavigationImpact('git pull --rebase', repo), null)
  assert.equal(bashNavigationImpact('git checkout -b task/next', repo), 'inert')
  assert.equal(bashNavigationImpact('git checkout -b task/next origin/main', repo), 'refresh')
  assert.equal(bashNavigationImpact('git pull --ff-only && rm -rf src', repo), null)
  assert.equal(bashNavigationImpact('git checkout tracked.txt', repo), null)
  assert.equal(bashNavigationImpact('git status', repo), null)

  // A session that only navigated authored nothing and owes nothing.
  const navigationOnly = analyzeTranscript(transcript([
    toolUse('b1', 'Bash', { command: 'git checkout task/work && git pull --ff-only' }), toolResult('b1'),
  ]), repo)
  assert.equal(navigationOnly.hasMutations, false)

  // But navigating after a green run stales that evidence: the tested tree is
  // no longer the current tree.
  const staleAfterSwitch = analyzeTranscript(transcript([
    toolUse('e1', 'Edit', { file_path: path.join(repo, 'a.ts') }), toolResult('e1'),
    toolUse('t1', 'Bash', { command: 'pnpm test' }), toolResult('t1', false, '12 passed'),
    toolUse('b1', 'Bash', { command: 'git checkout task/work' }), toolResult('b1'),
  ]), repo)
  assert.equal(staleAfterSwitch.verifiedAfterLastMutation, false)

  // Creating a branch where you stand changes no tree and stales nothing.
  const branchAfterGreen = analyzeTranscript(transcript([
    toolUse('e1', 'Edit', { file_path: path.join(repo, 'a.ts') }), toolResult('e1'),
    toolUse('t1', 'Bash', { command: 'pnpm test' }), toolResult('t1', false, '12 passed'),
    toolUse('b1', 'Bash', { command: 'git checkout -b task/next' }), toolResult('b1'),
  ]), repo)
  assert.equal(branchAfterGreen.verifiedAfterLastMutation, true)
})

test('session orientation states this project, and only this project', async () => {
  // Everything it says is established from the repository in front of it.
  const here = sessionOrientation(pluginDir)
  assert.match(here, /bash scripts\/selftest\.sh/)

  const repo = await mkdtemp(path.join(testTmp, 'quality-orientation-'))
  spawnSync('git', ['init', '-q', '-b', 'main', repo], { encoding: 'utf8' })
  await writeFile(path.join(repo, 'package.json'), JSON.stringify({ scripts: { test: 'vitest' } }))
  const named = sessionOrientation(repo)
  assert.match(named, /npm run test/)
  // Nothing about git. This harness has no opinion on which branch anyone is
  // on, and says so by saying nothing: the agent knows git, and a repository
  // with a branch policy states it in CLAUDE.md. Told plainly on 2026-08-26.
  assert.doesNotMatch(named, /branch|protected|git switch/i)

  // A directory that is not a repository gets no ADR reading at all: a shared
  // temp directory once yielded another project's tasks, and work from another
  // codebase must never be offered to a session that was not opened on it.
  const loose = await mkdtemp(path.join(testTmp, 'quality-orientation-loose-'))
  await mkdir(path.join(loose, 'docs', 'tasks'), { recursive: true })
  await cp(path.join(pluginDir, 'tests', 'fixtures', 'ok', 'tasks', 'T1-fixture.md'),
    path.join(loose, 'docs', 'tasks', 'T1-fixture.md'))
  assert.doesNotMatch(sessionOrientation(loose), /ADR tasks in flight/)

  // Inside a repository the same records are read.
  spawnSync('git', ['init', '-q', '-b', 'task/work', loose], { encoding: 'utf8' })
  assert.match(sessionOrientation(loose), /ADR tasks in flight/)

  // The hook itself is additive: it never blocks and never exits non-zero.
  const run = runLifecycleHook({ hook_event_name: 'SessionStart', cwd: pluginDir })
  assert.equal(run.status, 0, run.stderr)
  const emitted = JSON.parse(run.stdout)
  assert.equal(emitted.hookSpecificOutput.hookEventName, 'SessionStart')
  assert.doesNotMatch(run.stdout, /"decision"/)
})

test('reported: a scratch directory made the standard way is still scratch', async () => {
  // `W=$(mktemp -d)` is how everyone makes a scratch directory, and every use of
  // it armed the unresolved-deletion sentinel AND counted as repository
  // authorship — so cleaning up after yourself invalidated a check that had
  // already passed. Two causes: the assignment pattern's `\S*` stopped at the
  // space inside the substitution, so the value was never recorded at all, and
  // nothing knew what mktemp -d returns.
  const repo = pluginDir
  const clean = 'W=$(mktemp -d); cp README.md "$W/"; rm -rf "$W"'
  assert.equal(mutatesOnlyTempPaths(clean, repo), true)
  assert.deepEqual(bashDeletionMutationPaths(clean, repo)
    .filter(entry => entry === '<Unresolved Bash deletion>'), [])
  assert.equal(mutatesOnlyTempPaths('rm -rf "$(mktemp -d)"', repo), true)
  assert.equal(mutatesOnlyTempPaths('W=$(mktemp -d -t qh); rm -rf "$W"', repo), true)

  // Only the spellings that cannot name somewhere else. -p and --tmpdir point
  // where they are told, and a bare template is created relative to the working
  // directory by GNU mktemp — `mktemp -d buildXXXXXX` writes into the repo.
  assert.equal(mutatesOnlyTempPaths('W=$(mktemp -d -p .); rm -rf "$W"', repo), false)
  // The glued and `=` spellings are the ones the flag guard exists for: a bare
  // operand is already refused, so without it these would read as scratch.
  assert.equal(mutatesOnlyTempPaths('W=$(mktemp -d -p.); rm -rf "$W"', repo), false)
  assert.equal(mutatesOnlyTempPaths('W=$(mktemp -d --tmpdir=.); rm -rf "$W"', repo), false)
  assert.equal(mutatesOnlyTempPaths('W=$(mktemp -d buildXXXX); rm -rf "$W"', repo), false)
  assert.equal(mutatesOnlyTempPaths('W=$(mktemp); rm -rf "$W"', repo), false)
  assert.equal(mutatesOnlyTempPaths('W=$(pwd); rm -rf "$W"', repo), false)
})

test('reported: naming a gate is not running it, and asking is not writing', async () => {
  // Both from live sessions on 2026-08-26.
  // `which adr-lint adr-verify arch-lint` asks where the gates are and runs
  // none of them; the pattern counted the mention.
  assert.equal(isPotentialMutationCommand('which adr-lint adr-verify arch-lint'), false)
  assert.equal(isPotentialMutationCommand('command -v adr-verify'), false)
  // Running it really is authorship: it writes a Verification Log entry.
  assert.equal(isPotentialMutationCommand('adr-verify docs/tasks/T1.md'), true)
  assert.equal(isPotentialMutationCommand('python3 bin/adr-verify docs/tasks/T1.md'), true)

  // An unrecognised call inside `-c` is treated as a mutation, which made
  // `print(inspect.signature(X.__init__))` authorship and demanded a re-run of
  // the project's check for having looked something up.
  assert.equal(isPotentialMutationCommand(
    'python3 -c "import inspect; print(inspect.signature(int))"'), false)
  assert.equal(isPotentialMutationCommand(
    './.venv/Scripts/python.exe -c "import inspect\nfrom x import Y\nprint(inspect.signature(Y.__init__))"'), false)
  // The conservative default survives: a call nobody recognises still counts.
  assert.equal(isPotentialMutationCommand('python3 -c "open(\'f\',\'w\').write(1)"'), true)
  assert.equal(isPotentialMutationCommand('python3 -c "shutil.rmtree(p)"'), true)
})

test('the harness has no opinion about git branches', async () => {
  // Removed on 2026-08-26: "leave GIT alone... our quality harness is only about
  // ADR skills, not the GIT usage, AI agent already knows how to work here, and
  // even so — CLAUDE.md must be the one who instructs." The guard had just fired
  // on a command whose first act was `git switch -c task/…`, the escape it was
  // itself demanding.
  const repo = await mkdtemp(path.join(testTmp, 'quality-nogit-'))
  spawnSync('git', ['init', '-q', '-b', 'main', repo], { encoding: 'utf8' })
  await writeFile(path.join(repo, 'package.json'), JSON.stringify({ scripts: { test: 'true' } }))
  await writeFile(path.join(repo, 'a.js'), 'x\n')

  const payloads = [
    { hook_event_name: 'PreToolUse', tool_name: 'Write', cwd: repo,
      tool_input: { file_path: path.join(repo, 'a.js') } },
    { hook_event_name: 'PreToolUse', tool_name: 'Bash', cwd: repo,
      tool_input: { command: 'printf x > a.js' } },
    { hook_event_name: 'PreToolUse', tool_name: 'Bash', cwd: repo,
      tool_input: { command: 'git merge feature' } },
    { hook_event_name: 'SessionStart', cwd: repo },
  ]
  for (const payload of payloads) {
    const run = runLifecycleHook(payload)
    assert.equal(run.status, 0)
    const message = `${run.stdout}${run.stderr}`
    assert.doesNotMatch(message, /protected|task branch|git switch|--ff-only/i,
      `${JSON.stringify(payload)} -> ${message}`)
  }

  // The evidence question is untouched: it is about the project's check, not
  // about git, and it still fires at the commit boundary.
  const file = path.join(repo, 'agent.jsonl')
  await writeFile(file, transcript([
    toolUse('e1', 'Edit', { file_path: path.join(repo, 'a.js') }), toolResult('e1'),
  ]))
  const commit = runLifecycleHook({
    hook_event_name: 'PreToolUse', tool_name: 'Bash', cwd: repo,
    tool_input: { command: 'git commit -m x' }, transcript_path: file,
  })
  assert.match(commit.stderr, /would publish unchecked/)
  assert.match(commit.stderr, /npm run test/)
})

// A corpus in the shape a real repository has: an accepted decision with tasks,
// a superseded one, a proposed one that governs nothing yet, and an ARCHIVED
// withdrawn record — because this project's own adr-retire skill states that an
// archived Accepted ADR may still govern, so the archive is part of the corpus.
async function decisionCorpus(prefix) {
  const root = await mkdtemp(path.join(testTmp, prefix))
  await mkdir(path.join(root, 'docs', 'adr', 'tasks'), { recursive: true })
  await mkdir(path.join(root, 'docs', 'adr', 'archive'), { recursive: true })
  const write = (relative, text) => writeFile(path.join(root, relative), text)
  await write('docs/adr/ADR-001-postgres.md',
    '# ADR-001: Use Postgres for the order store\n\n**Status:** Accepted\n'
    + '**Governs:** `src/orders/**`, `migrations/*.sql`\n')
  await write('docs/adr/tasks/T1-schema.md',
    '# Task ADR-001-T1-schema: the orders schema\n\n## Affected Files\n\n'
    + '| File | Change | Why |\n|------|--------|-----|\n'
    + '| `src/orders/schema.ts` | add | the table |\n| `<path>` | add | template placeholder |\n'
    // A LATER section with a table of its own. Without a heading boundary the
    // Affected Files read runs to end-of-file and claims these too.
    + '\n## Tests\n\n| Test | Check |\n|------|-------|\n| `tests/unrelated.spec.ts` | pytest |\n')
  await write('docs/adr/ADR-002-redis.md',
    '# ADR-002: Redis for the work queue\n\n**Status:** Superseded by ADR-004\n'
    + '**Governs:** `src/queue/**`\n')
  await write('docs/adr/ADR-003-idea.md',
    '# ADR-003: Something proposed\n\n**Status:** Proposed\n**Governs:** `src/orders/**`\n')
  await write('docs/adr/archive/ADR-000-mongo.md',
    '# ADR-000: Mongo for everything\n\n**Status:** Withdrawn\n**Governs:**\n'
    + '- type: path\n  pattern: "src/orders/**"\n- type: package\n  pattern: "mongodb@>=6"\n')
  return root
}

test('decisions reach the code: what governs a file, and what was killed there', async () => {
  const root = await decisionCorpus('quality-corpus-')
  const corpus = adrCorpus(root)

  // Proposed governs nothing yet; accepted and archived-withdrawn both count.
  assert.deepEqual(corpus.map(record => record.kind).sort(), ['governing', 'graveyard', 'graveyard'])

  const { governing, graveyard } = decisionsGoverning(['src/orders/schema.ts'], root, corpus)
  assert.deepEqual(governing.map(record => path.basename(record.file)), ['ADR-001-postgres.md'])
  // The graveyard is the half an agent needs most, and it lives in the archive.
  assert.deepEqual(graveyard.map(record => path.basename(record.file)), ['ADR-000-mongo.md'])

  // Resolution comes free from the task table: nothing declares schema.ts by
  // name except `## Affected Files`, which adr-lint already requires.
  const accepted = corpus.find(record => record.kind === 'governing')
  assert.ok(accepted.governs.includes('src/orders/schema.ts'))
  // The template's own placeholder row is not a path.
  assert.ok(!accepted.governs.includes('<path>'))
  // And a table in a LATER section belongs to that section.
  assert.ok(!accepted.governs.includes('tests/unrelated.spec.ts'),
    'the Affected Files read must stop at the next heading')

  // Only `type: path` resolves; the rest is reported, never silently dropped.
  const archived = corpus.find(record => /Withdrawn/.test(record.status))
  assert.deepEqual(archived.governs, ['src/orders/**'])
  assert.deepEqual(archived.unresolved, ['package:mongodb@>=6'])

  const prose = decisionContext(['src/orders/schema.ts'], root)
  assert.match(prose, /Decisions that govern/)
  assert.match(prose, /Already decided against here/)
  assert.match(prose, /not resolved by this tool: package:mongodb@>=6/)
  // Nothing to say is said as nothing.
  assert.equal(decisionContext(['README.md'], root), '')
})

test('reported: a shared tasks directory does not make every record claim its neighbours', async () => {
  // Three ADRs commonly sit beside one `tasks/` directory. Taking every table
  // would have ADR-002 governing the orders schema it never mentions — found
  // while building this, against the fixture above.
  const root = await decisionCorpus('quality-corpus-share-')
  const corpus = adrCorpus(root)
  const redis = corpus.find(record => /Redis/.test(record.title))
  assert.deepEqual(redis.governs, ['src/queue/**'])

  // A task that names no ADR is attributed only when it sits beside exactly one.
  await writeFile(path.join(root, 'docs', 'adr', 'tasks', 'T2-loose.md'),
    '# T2: no back-reference\n\n## Affected Files\n\n| File | Change | Why |\n|---|---|---|\n'
    + '| `src/loose.ts` | add | orphan |\n')
  assert.ok(!adrCorpus(root).some(record => record.governs.includes('src/loose.ts')),
    'an unattributable task file must not be claimed by every record in the directory')
})

test('reported: a symlinked checkout is not an empty corpus', async () => {
  // /tmp is a symlink to /private/tmp on macOS: git answers with the real path
  // while the hook payload carries the spelling, so path.relative produced
  // `../../tmp/...`, every path was filtered as outside the root, and the corpus
  // read as EMPTY — silently, which is the only way this feature can ship
  // looking like a repository that has decided nothing.
  const real = await decisionCorpus('quality-corpus-link-')
  // A genuine symlink, because testTmp is already realpath'd on darwin and the
  // trap would otherwise be invisible on every platform.
  const link = path.join(await mkdtemp(path.join(testTmp, 'quality-corpus-via-')), 'repo')
  await symlink(real, link, 'dir')
  const spelled = path.join(link, 'src', 'orders', 'schema.ts')

  // Root spelled through the link, file spelled through the link.
  assert.match(decisionContext([spelled], link), /Decisions that govern/)
  // The mix that actually happens: git answers with the real path, the hook
  // payload carries the link.
  assert.match(decisionContext([spelled], real), /Decisions that govern/)
  assert.match(decisionContext([path.join(real, 'src', 'orders', 'schema.ts')], link),
    /Decisions that govern/)
})

test('a declaration matches the file, the directory under it, and its globs', () => {
  assert.equal(pathMatchesDeclaration('src/orders/schema.ts', 'src/orders/schema.ts'), true)
  assert.equal(pathMatchesDeclaration('src/orders/deep/a.ts', 'src/orders'), true)
  assert.equal(pathMatchesDeclaration('src/orders/deep/a.ts', 'src/orders/**'), true)
  assert.equal(pathMatchesDeclaration('src/orders/a.ts', 'src/*/a.ts'), true)
  // `*` does not cross a separator; `**` does.
  assert.equal(pathMatchesDeclaration('src/orders/deep/a.ts', 'src/*/a.ts'), false)
  assert.equal(pathMatchesDeclaration('src/ordersX/a.ts', 'src/orders'), false)
  assert.equal(pathMatchesDeclaration('src/orders/a.ts', ''), false)
  assert.equal(pathMatchesDeclaration('migrations/001.sql', 'migrations/*.sql'), true)
})

test('the decision context is delivered once per path per session, and never as a finding', async () => {
  const root = await decisionCorpus('quality-corpus-once-')
  const payload = session => ({
    hook_event_name: 'PreToolUse', tool_name: 'Write', cwd: root, session_id: session,
    tool_input: { file_path: path.join(root, 'src', 'orders', 'schema.ts') },
  })

  const first = runLifecycleHook(payload('session-one'))
  assert.equal(first.status, 0)
  const emitted = JSON.parse(first.stdout)
  assert.equal(emitted.hookSpecificOutput.hookEventName, 'PreToolUse')
  assert.match(emitted.hookSpecificOutput.additionalContext, /ADR-001-postgres\.md/)
  // Delivery, not judgement: no decision, no systemMessage, nothing to answer for.
  assert.doesNotMatch(first.stdout, /"decision"|systemMessage/)
  assert.equal(first.stderr, '')

  // Saying it again at every edit of a hot file is how a delivery becomes a nag.
  assert.equal(runLifecycleHook(payload('session-one')).stdout.trim(), '')
  // A new session has not heard it.
  assert.match(runLifecycleHook(payload('session-two')).stdout, /ADR-001-postgres\.md/)

  // An ungoverned file costs the edit nothing at all.
  const quiet = runLifecycleHook({
    hook_event_name: 'PreToolUse', tool_name: 'Write', cwd: root, session_id: 'session-three',
    tool_input: { file_path: path.join(root, 'README.md') },
  })
  assert.equal(quiet.status, 0)
  assert.equal(`${quiet.stdout}${quiet.stderr}`.trim(), '')
})

test('reported: a stale standalone copy answering instead of the plugin is named', async () => {
  // blueprints, 2026-08-26. the standalone `.claude/bin/adr-lint` was dated 2026-07-30 and
  // predated the `acceptance-sha256:` digest adr-verify now writes, so its
  // Verification Log grammar rejected the exact lines adr-verify had just
  // produced, then cascaded into "marked done but no exit-0 entry". Running the
  // same gate by hand passed the whole time — which made the HOOK look like the
  // unreliable one. A session went into finding that.
  const home = await mkdtemp(path.join(testTmp, 'quality-shadow-'))
  await mkdir(path.join(home, '.claude', 'bin'), { recursive: true })

  // Nothing installed outside the plugin: nothing to say.
  assert.equal(shadowInstallNotice(home, pluginDir), '')

  // An identical copy is not drift — a machine may keep one deliberately.
  await cp(path.join(pluginDir, 'bin', 'adr-lint'), path.join(home, '.claude', 'bin', 'adr-lint'))
  assert.equal(shadowInstallNotice(home, pluginDir), '')

  // A copy that has drifted is exactly the case that cost the session.
  await writeFile(path.join(home, '.claude', 'bin', 'adr-lint'), '#!/usr/bin/env python3\n# July\n')
  const notice = shadowInstallNotice(home, pluginDir)
  assert.match(notice, /~[\\/]\.claude[\\/]bin[\\/]adr-lint/)
  assert.match(notice, /an old copy is answering/)
  assert.match(notice, /adr-verify just wrote/)

  // Templates and skills drift too, and templates is the one that actually bit:
  // an ADR authored from a stale adr-template.md is missing headers the current
  // gates require, so the gate reports a malformed record and the author cannot
  // see they were writing to last month's shape. Reported 2026-08-26 — a
  // standalone template with no Governs:, no **Data dependency:**, no
  // ## Mutation Log and no ## Reachability table.
  await rm(path.join(home, '.claude', 'bin', 'adr-lint'))
  await mkdir(path.join(home, '.claude', 'templates'), { recursive: true })
  await cp(path.join(pluginDir, 'templates', 'adr-template.md'),
    path.join(home, '.claude', 'templates', 'adr-template.md'))
  assert.equal(shadowInstallNotice(home, pluginDir), '',
    `an identical template is not drift: ${shadowInstallNotice(home, pluginDir)}`)
  await writeFile(path.join(home, '.claude', 'templates', 'adr-template.md'), '# ADR-NNN\n')
  assert.match(shadowInstallNotice(home, pluginDir), /templates[\\/]adr-template\.md/)
  assert.match(shadowInstallNotice(home, pluginDir), /missing headers the gates require/)
  await rm(path.join(home, '.claude', 'templates', 'adr-template.md'))

  // A skill is a directory, so the comparable file is one level down.
  await mkdir(path.join(home, '.claude', 'skills', 'adr-write'), { recursive: true })
  await cp(path.join(pluginDir, 'skills', 'adr-write', 'SKILL.md'),
    path.join(home, '.claude', 'skills', 'adr-write', 'SKILL.md'))
  assert.equal(shadowInstallNotice(home, pluginDir), '',
    `an identical skill is not drift: ${shadowInstallNotice(home, pluginDir)}`)
  await writeFile(path.join(home, '.claude', 'skills', 'adr-write', 'SKILL.md'), '# old\n')
  assert.match(shadowInstallNotice(home, pluginDir), /skills[\\/]adr-write[\\/]SKILL\.md/)
  await rm(path.join(home, '.claude', 'skills', 'adr-write', 'SKILL.md'))

  // A file the plugin does not ship is not the plugin's business.
  await writeFile(path.join(home, '.claude', 'bin', 'some-other-tool'), 'x\n')
  assert.equal(shadowInstallNotice(home, pluginDir), '',
    `an unshipped file is not the plugin's business: ${shadowInstallNotice(home, pluginDir)}`)
})

test('the corpus reader handles the spellings real repositories use', async () => {
  const root = await mkdtemp(path.join(testTmp, 'quality-corpus-shapes-'))
  await mkdir(path.join(root, 'docs', 'adr'), { recursive: true })
  const write = (name, text) => writeFile(path.join(root, 'docs', 'adr', name), text)

  // Nygard's original shape: a `## Status` section rather than a header line.
  // Half the corpora in the wild are written this way, and reading only the
  // inline form would classify every one of them as governing nothing.
  await write('0007-nygard.md',
    '# 7. Use event sourcing\n\n## Status\n\nAccepted\n\n## Context\n\n...\n'
    + '\n**Governs:** `src/events/**`\n')
  // A glob no engine can compile must not throw and must not match.
  await write('0008-broken-glob.md',
    '# ADR-0008: Broken matcher\n\n**Status:** Accepted\n**Governs:** `src/[unclosed/**`\n')
  // A record with no status at all is neither governing nor graveyard.
  await write('0009-no-status.md', '# ADR-0009: Nothing declared\n\n**Governs:** `src/**`\n')

  const corpus = adrCorpus(root)
  const nygard = corpus.find(record => /event sourcing/.test(record.title))
  assert.ok(nygard, 'a `## Status` section is a status')
  assert.equal(nygard.kind, 'governing')
  assert.match(decisionContext(['src/events/handler.ts'], root), /0007-nygard\.md/)

  assert.ok(!corpus.some(record => /Nothing declared/.test(record.title)),
    'a record with no status governs nothing')

  // The broken matcher is inert, not fatal.
  assert.doesNotThrow(() => decisionsGoverning(['src/anything.ts'], root, corpus))
  assert.equal(pathMatchesDeclaration('src/x/a.ts', 'src/[unclosed/**'), false)

  // An unreadable corpus costs the edit nothing: the hook swallows it.
  const run = runLifecycleHook({
    hook_event_name: 'PreToolUse', tool_name: 'Write', session_id: 'shapes',
    cwd: path.join(root, 'does', 'not', 'exist'), tool_input: { file_path: 'x.ts' },
  })
  assert.equal(run.status, 0)
})

test('reported: a scratch corpus does not pull the record gates', async () => {
  // Observed 2026-08-26 while building the decision reader, against its own
  // throwaway fixture: `facts-first gate FAILED (ADR ownership) for
  // /tmp/…/tasks/T1-schema.md: expected exactly one owning ADR, found 0` — a
  // finding about a file nobody was shipping, from a corpus built to try
  // something out. A project's records are never under the OS temp root.
  const scratch = path.join(os.tmpdir(), 'quality-scratch-corpus')
  await mkdir(path.join(scratch, 'docs', 'adr', 'tasks'), { recursive: true })
  const orphan = path.join(scratch, 'docs', 'adr', 'tasks', 'T1-orphan.md')
  await writeFile(orphan, '# Task ADR-001-T1-orphan: no owning ADR anywhere\n')

  // pluginDir stands in for a real checkout, which is what makes the temp path
  // scratch rather than the project's own files.
  assert.equal(runArtifactGates([orphan], pluginDir), null)

  // A project that genuinely lives under the temp root keeps full strictness —
  // there the "scratch" files ARE the records, and this suite's own fixtures
  // depend on that.
  const inside = runArtifactGates([orphan], scratch)
  assert.match(String(inside), /ADR ownership|owning ADR/)
})

test('reported: a session running a cached older plugin is told so', async () => {
  // "even with updated plugin and restart claude uses older cache", 2026-08-26.
  // A stale copy is internally consistent — its gates, skills and templates all
  // agree with each other — so nothing inside the session can notice. Comparing
  // installed version directories is the only check that catches it.
  const home = await mkdtemp(path.join(testTmp, 'quality-versions-'))
  const cache = path.join(home, '.claude', 'plugins', 'cache', 'quality-harness', 'quality-harness')
  for (const version of ['2.0.0', '2.9.0', '2.10.0']) {
    await mkdir(path.join(cache, version, 'scripts'), { recursive: true })
    await writeFile(path.join(cache, version, 'scripts', 'lifecycle.mjs'), '// stub\n')
  }

  const stale = staleVersionNotice(path.join(cache, '2.9.0'), home)
  assert.match(stale, /running quality-harness 2\.9\.0, but 2\.10\.0 is installed/)
  assert.match(stale, /Restart Claude Code/)
  // 2.10.0 beats 2.9.0: a string comparison would put 2.9.0 ahead and report
  // the newest version as stale against itself.
  assert.equal(staleVersionNotice(path.join(cache, '2.10.0'), home), '')
  assert.match(staleVersionNotice(path.join(cache, '2.0.0'), home), /2\.10\.0 is installed/)

  // A version directory with no lifecycle.mjs is a partial download, not a
  // newer install to point at.
  await mkdir(path.join(cache, '3.0.0'), { recursive: true })
  assert.equal(staleVersionNotice(path.join(cache, '2.10.0'), home), '')

  // No cache, or a root that is not version-stamped: nothing to say.
  assert.equal(staleVersionNotice(path.join(cache, '2.10.0'), path.join(home, 'absent')), '')
  assert.equal(staleVersionNotice('/opt/quality-harness', home), '')
})

test('the sync command reports before it writes, and syncs from the newest install', async () => {
  const { newestVersion, newestInstalledRoot, plan } =
    await import('../scripts/sync-standalone.mjs')

  // Semver order, not string order.
  assert.equal(newestVersion(['2.9.0', '2.10.0', '2.0.0']), '2.10.0')
  assert.equal(newestVersion(['not-a-version']), null)
  assert.equal(newestVersion([]), null)

  const home = await mkdtemp(path.join(testTmp, 'quality-sync-'))
  const cache = path.join(home, '.claude', 'plugins', 'cache', 'quality-harness', 'quality-harness')
  for (const version of ['2.9.0', '2.10.0']) {
    await mkdir(path.join(cache, version, 'bin'), { recursive: true })
  }
  // Syncing from whatever is EXECUTING would copy the older files over the
  // standalone set and call it done, which is the reported failure exactly.
  const newest = newestInstalledRoot(path.join(cache, '2.9.0'), home)
  assert.equal(newest.version, '2.10.0')
  assert.equal(newest.running, '2.9.0')
  // The ROOT is what gets copied from, and reporting the newer version while
  // copying from the older one is the reported failure with a nicer label.
  assert.equal(newest.root, path.join(cache, '2.10.0'))

  // The plan names only what differs, and says which way.
  await mkdir(path.join(home, '.claude', 'bin'), { recursive: true })
  await cp(path.join(pluginDir, 'bin', 'adr-lint'), path.join(home, '.claude', 'bin', 'adr-lint'))
  await writeFile(path.join(home, '.claude', 'bin', 'adr-judge'), '# stale\n')
  const work = plan(pluginDir, home)
  const state = name => work.find(entry => entry.to.endsWith(name))?.state
  assert.equal(state(path.join('bin', 'adr-lint')), undefined, 'an identical file is not work')
  assert.equal(state(path.join('bin', 'adr-judge')), 'drifted')
  assert.equal(state(path.join('templates', 'adr-template.md')), 'missing')
  assert.equal(state(path.join('skills', 'adr-write', 'SKILL.md')), 'missing')

  // Reporting is the default; --apply is the only thing that writes.
  // The fake newest version needs real content, or the plan is trivially empty
  // and the assertion below would pass without exercising anything.
  await cp(path.join(pluginDir, 'bin', 'adr-judge'),
    path.join(cache, '2.10.0', 'bin', 'adr-judge'))
  const dry = spawnSync(process.execPath,
    [path.join(pluginDir, 'scripts', 'sync-standalone.mjs')],
    { encoding: 'utf8', env: { ...process.env, HOME: home, USERPROFILE: home } })
  assert.equal(dry.status ?? 0, 0)
  assert.match(dry.stdout, /Re-run with --apply/)
  assert.equal(existsSync(path.join(home, '.claude', 'templates', 'adr-template.md')), false,
    'a report must not write anything')

  const broken = spawnSync(process.execPath,
    [path.join(pluginDir, 'scripts', 'sync-standalone.mjs'), '--nope'],
    { encoding: 'utf8', env: { ...process.env, HOME: home, USERPROFILE: home } })
  assert.equal(broken.status, 2, 'a broken invocation is not a verdict')
})

test('adr-state derives what is decided now, instead of asking anyone to maintain it', async () => {
  // A decision corpus records CHANGES: after thirty records, "what governs this
  // area right now" means reading thirty and applying the supersessions by hand.
  // OpenSpec keeps an accumulated `specs/` beside its `changes/`; this derives
  // the same view, because a summary kept beside the truth drifts from it — the
  // failure this project has hit in its own README index twice.
  const root = await decisionCorpus('quality-state-')
  const write = (name, text) => writeFile(path.join(root, 'docs', 'adr', name), text)
  await write('ADR-004-rq.md', '# ADR-004: RQ for queued work\n\n**Status:** Accepted\n'
    + '**Governs:** `src/queue/**`\n')
  await write('ADR-007-rest.md', '# ADR-007: REST for the public API\n\n**Status:** Accepted\n'
    + '**Governs:** `src/api/**`\n')
  await write('ADR-011-graphql.md', '# ADR-011: GraphQL for the public API\n\n**Status:** Accepted\n'
    + '**Governs:** `src/api/**`\n')
  await write('ADR-005-trunk.md', '# ADR-005: Adopt trunk-based development\n\n**Status:** Accepted\n')

  const run = spawnSync(process.execPath,
    [path.join(pluginDir, 'scripts', 'adr-state.mjs'), '--json', root], { encoding: 'utf8' })
  assert.equal(run.status, 0, run.stderr)
  const state = JSON.parse(run.stdout)

  const area = candidate => state.areas.find(entry => entry.path === candidate)
  assert.deepEqual(area('src/queue/**').governedBy.map(record => record.id), ['ADR-004'])
  // The chain is followed: ADR-002 said "Superseded by ADR-004", so the record
  // that governs the queue names what it replaced.
  assert.deepEqual(area('src/queue/**').replaced.map(record => record.id), ['ADR-002'])
  // A withdrawn record governs nothing, even where it declared a path.
  assert.deepEqual(area('src/orders/**').governedBy.map(record => record.id), ['ADR-001'])

  // Two accepted records over the same code is the corpus saying two things and
  // being unable to say which wins — the finding adrkit calls a contradiction.
  assert.deepEqual(state.contested, [{ path: 'src/api/**', records: ['ADR-007', 'ADR-011'] }])

  // A decision nothing points at the code cannot be found by anyone editing it.
  assert.deepEqual(state.governingNothing.map(record => record.id), ['ADR-005'])

  // ADR-004 exists here, so nothing dangles. Remove it and ADR-002's pointer
  // goes nowhere, which is a corpus that lost its own replacement.
  assert.deepEqual(state.danglingSupersession, [])
  await rm(path.join(root, 'docs', 'adr', 'ADR-004-rq.md'))
  const after = JSON.parse(spawnSync(process.execPath,
    [path.join(pluginDir, 'scripts', 'adr-state.mjs'), '--json', root], { encoding: 'utf8' }).stdout)
  assert.deepEqual(after.danglingSupersession.map(record => record.id), ['ADR-002'])

  // It reads and never judges: exit 0 whatever it finds, and a broken
  // invocation is not a verdict about a corpus.
  const prose = spawnSync(process.execPath,
    [path.join(pluginDir, 'scripts', 'adr-state.mjs'), root], { encoding: 'utf8' })
  assert.equal(prose.status, 0)
  assert.match(prose.stdout, /What governs what, as it stands now/)
  assert.match(prose.stdout, /Contested/)
  assert.equal(spawnSync(process.execPath,
    [path.join(pluginDir, 'scripts', 'adr-state.mjs'), '--nope'], { encoding: 'utf8' }).status, 2)

  // A directory with no records says so rather than printing an empty report.
  const empty = spawnSync(process.execPath,
    [path.join(pluginDir, 'scripts', 'adr-state.mjs'), await mkdtemp(path.join(testTmp, 'quality-none-'))],
    { encoding: 'utf8' })
  assert.equal(empty.status, 0)
  assert.match(empty.stdout, /No decision records found/)
})

test('reported: the layouts and scale a real corpus actually has', async () => {
  // Everything here was measured against a 171-record Rust corpus on
  // 2026-08-26. Every one of these was a confident wrong answer, not a gap.
  const root = await mkdtemp(path.join(testTmp, 'quality-realworld-'))
  const adr = path.join(root, 'docs', 'adr')
  // Tasks in a directory NAMED for the record, which is the only layout that
  // corpus uses. Looking beside the record found nothing at all, and 142
  // accepted decisions were reported as governing no code.
  await mkdir(path.join(adr, 'ADR-110', 'tasks'), { recursive: true })
  await writeFile(path.join(adr, 'ADR-110-standalone-agents.md'),
    '# ADR-110: Standalone agents over a shared harness\n\n**Status:** Accepted\n')
  await writeFile(path.join(adr, 'ADR-110', 'tasks', 'T1-crate.md'),
    // No back-reference to ADR-110 anywhere: the directory name is the
    // attribution, and real task files do not repeat it.
    '# T1: the harness crate\n\n## Affected Files\n\n| File | Change | Why |\n|---|---|---|\n'
    + '| `crates/zeus-harness/src/lib.rs` | add | the crate |\n'
    // Prose in cell 0 of the Affected Files table ITSELF, which is where a real
    // corpus put `(T3's two tests)`, `(compile)` and
    // `! rg -iq 'MCP stdio' README.md` — all reported as governed paths.
    + '| (T3\'s two tests) | n/a | covered elsewhere |\n'
    + '| `! rg -iq \'MCP stdio\' README.md` | check | an acceptance command |\n'
    + '| compile | n/a | no path at all |\n\n'
    + '## Tests\n\n| Test | Check |\n|---|---|\n| `tests/a.rs` | cargo test |\n')
  // A second record, so "the one record beside them" can never be the reason
  // attribution works here.
  await writeFile(path.join(adr, 'ADR-111-other.md'),
    '# ADR-111: Something else\n\n**Status:** Accepted\n')
  // A date in a filename is not an ADR number.
  await writeFile(path.join(adr, '2026-03-08-retrospective.md'),
    '# Retrospective\n\n**Status:** Accepted\n')

  const corpus = adrCorpus(root)
  const record = corpus.find(entry => entry.number === 110)
  assert.ok(record, 'the record is found')
  assert.deepEqual(record.governs, ['crates/zeus-harness/src/lib.rs'],
    'tasks resolve from the directory named for the record, and only paths')
  // Not read as a record AT ALL: `2026-03-08-…` begins with four digits and a
  // dash exactly like `0043-thing.md`, so a journal entry became ADR-2026. The
  // filename guard is what stops it; asserting only on the number would pass
  // through adrNumber's own guard and leave this untested.
  assert.ok(!corpus.some(entry => entry.file.endsWith('2026-03-08-retrospective.md')),
    'an ISO-dated file is not a decision record')
  assert.ok(!corpus.some(entry => entry.number === 2026), 'and no ADR-2026 appears')
  // Statuses in the wild carry dates and prose after the word.
  for (const status of ['Accepted — Implemented (2026-03-08)', 'Accepted (revised 2026-03-15)']) {
    await writeFile(path.join(adr, 'ADR-120-variant.md'), `# ADR-120: Variant\n\n**Status:** ${status}\n`)
    assert.equal(adrCorpus(root).find(entry => entry.number === 120)?.kind, 'governing', status)
  }

  // Authority and history are different claims. `Governs:` is a record saying
  // "I am authoritative here"; an Affected Files row says "this change edited
  // that file". Conflating them made every file several ADRs had edited over
  // two years look like decisions contradicting each other — 278 of them.
  await writeFile(path.join(adr, 'ADR-112-also-touches.md'),
    '# ADR-112: Also touches the harness\n\n**Status:** Accepted\n')
  await mkdir(path.join(adr, 'ADR-112', 'tasks'), { recursive: true })
  await writeFile(path.join(adr, 'ADR-112', 'tasks', 'T1.md'),
    '# T1\n\n## Affected Files\n\n| File | Change | Why |\n|---|---|---|\n'
    + '| `crates/zeus-harness/src/lib.rs` | edit | again |\n')
  const state = JSON.parse(spawnSync(process.execPath,
    [path.join(pluginDir, 'scripts', 'adr-state.mjs'), '--json', root], { encoding: 'utf8' }).stdout)
  assert.deepEqual(state.contested, [],
    'two records editing one file over time is history, not a contradiction')
  assert.equal(state.touchedPaths, 1)
  // But both are still the answer to "what relates to this file".
  assert.deepEqual(
    decisionsGoverning(['crates/zeus-harness/src/lib.rs'], root).governing
      .map(entry => entry.number).sort((a, b) => a - b),
    [110, 112])
})

test('a check that could not run is not a finding about the change', async () => {
  // Taken from zeus-eval-harness, whose AcceptanceVerdict is
  // Passed / Failed{exit_code} / Timeout / SpawnError, and whose evidence record
  // keeps `infra_failure_class` apart from an acceptance miss so "the provider
  // was down" never reads as "the work is wrong".
  //
  // This harness had one bit. A check that FAILED, one that TIMED OUT and one
  // that never started because Docker was not running all produced the same
  // sentence. Only the first is about the change — the same mistake fixed one
  // layer down in 2.5.0 and never applied to the project's own check.
  const outcome = (content, isError = false) =>
    ({ type: 'tool_result', content, is_error: isError })

  assert.equal(validationVerdict(outcome('ok\n12 passed'), 'npm test'), 'passed')
  assert.equal(validationVerdict(outcome('FAIL 3 tests', true), 'npm test'), 'failed')
  assert.equal(validationVerdict(outcome('Command exited with code 1'), 'npm test'), 'failed')
  assert.equal(validationVerdict({ exit_code: 2 }, 'npm test'), 'failed')

  // Never got a status. 127 is "not found" and 126 "found but not executable" in
  // every POSIX shell; reading either as "your tests failed" is the accusation.
  for (const [content, label] of [
    ['docker: command not found', 'a missing binary'],
    ['Cannot connect to the Docker daemon. Is the docker daemon running?', 'a dead daemon'],
    ['bash: ./verify.sh: Permission denied', 'a file that will not execute'],
  ]) {
    assert.equal(validationVerdict(outcome(content), 'npm test'), 'unstarted', label)
  }
  assert.equal(validationVerdict({ exit_code: 127 }, 'npm test'), 'unstarted')
  assert.equal(validationVerdict({ exit_code: 126 }, 'npm test'), 'unstarted')

  assert.equal(validationVerdict(outcome('Command timed out after 120s'), 'go test ./...'), 'timeout')
  assert.equal(validationVerdict({ exit_code: 124 }, 'go test ./...'), 'timeout', 'GNU timeout')

  assert.equal(validationVerdict(outcome('Command running in background with ID: x'), 'npm test'),
    'running')
  assert.equal(validationVerdict(outcome('no tests ran'), 'pytest'), 'no-work')

  // End to end: the three cases must not read the same.
  const repo = await checkedProject('quality-verdict-')
  const file = path.join(repo, 'agent.jsonl')
  const say = async (content, isError) => {
    await writeFile(file, transcript([
      toolUse('e1', 'Edit', { file_path: path.join(repo, 'a.js') }), toolResult('e1'),
      toolUse('v1', 'Bash', { command: 'npm test' }), toolResult('v1', isError, content),
    ]))
    const run = runLifecycleHook({ hook_event_name: 'Stop', transcript_path: file, cwd: repo })
    assert.equal(run.status, 0)
    return JSON.parse(run.stdout).systemMessage
  }

  const failed = await say('FAIL 3 tests', true)
  assert.match(failed, /Run `npm run test`/, 'a real failure still asks for the check')
  assert.doesNotMatch(failed, /environment/)

  const unstarted = await say('docker: command not found', false)
  assert.match(unstarted, /never started/)
  assert.match(unstarted, /this environment, not your change/)
  assert.doesNotMatch(unstarted, /Do not add cleanup/,
    'an environment problem is not a scope lecture')

  const timedOut = await say('Command timed out after 120s', false)
  assert.match(timedOut, /killed on its time budget/)
  assert.match(timedOut, /not a verdict about your change/)

  // All three still name what changed, and none of them blocks.
  for (const message of [failed, unstarted, timedOut]) {
    assert.match(message, /Changed paths include: .*a\.js/)
  }
})
