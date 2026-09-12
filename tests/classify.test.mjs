import assert from 'node:assert/strict'
import test from 'node:test'
import { classifyCommand, isPotentialMutationCommand, isValidationCommand }
  from '../plugin/scripts/lifecycle.mjs'

const RO_HEREDOC = `python3 - <<'PYEOF'
import json
from pathlib import Path
d = json.loads((Path.home() / ".claude/plugins/installed_plugins.json").read_text(encoding="utf-8"))
print(json.dumps(d, indent=1)[:800])
PYEOF`

const RW_HEREDOC = `python3 - <<'PYEOF'
from pathlib import Path
p = Path("x.md")
p.write_text("hello", encoding="utf-8")
PYEOF`

const EXEC_HEREDOC = `python3 - <<'PYEOF'
import subprocess
subprocess.run(["git", "push"])
PYEOF`

const cases = [
  ['python kit/derive_shapes.py verify', 'validation'],
  ['python -m unittest discover -s kit -q', 'validation'],
  ['python kit/check_skill.py spine skill/_shared/session-spine.md', 'validation'],
  ['python kit/check_skill.py evals docs/adr/A/evals.md', 'validation'],
  ['/c/Users/dev/.claude/bin/adr-lint docs/adr/A.md', 'validation'],
  ['python /p/bin/adr-lint docs/adr/A.md', 'validation'],
  ['python /p/bin/adr-verify docs/adr/T7.md', 'mutation'],
  ['python kit/package_skill.py', 'mutation'],
  ['git commit -q -m x', 'mutation'],
  ['cd /repo && python kit/derive_shapes.py verify', 'validation'],
  [RO_HEREDOC, 'neither'],
  [RW_HEREDOC, 'mutation'],
  [EXEC_HEREDOC, 'mutation'],
  ['python3 -c "print(1+1)"', 'neither'],
  ['node -e "console.log(process.version)"', 'neither'],
  ['python3 -c "open(\'x\',\'w\').write(\'y\')"', 'mutation'],
  ['python3 mystery_script.py', 'mutation'],
  [`${RO_HEREDOC}\npython3 other.py`, 'mutation'],
  [`git commit -q -F - <<'EOF'\nmsg\nEOF`, 'mutation'],
  ['/p/bin/adr-verify docs/adr/T7.md', 'mutation'],
  ['python create_test_fixture.py', 'mutation'],
  ['python update_tests.py', 'mutation'],
  ['python validate_and_rewrite.py', 'mutation'],
  ['python kit/check_skill.py rewrite docs/adr/A.md', 'mutation'],
  ['python validate_and_rewrite.py verify', 'mutation'],
  ['python create_test_fixture.py test', 'mutation'],
  ['python check_and_fix.py audit', 'mutation'],
  ['python update_tests.py test', 'mutation'],
  ['python remove_check.py status', 'mutation'],
  ['python3 -c "os.remove(\'x\')"', 'mutation'],
  ['node -e "fs.rmSync(\'x\')"', 'mutation'],
  ['ruby -e "File.write(\'x\', \'y\')"', 'mutation'],
  ['python3 -c "from pathlib import Path; print(Path(\'x\').read_text())"', 'neither'],
  // An interpreter named in an ARGUMENT is not an interpreter run. Reproduced
  // 2026-08-25 against a repository whose record was named
  // `0015-rq-for-queued-work-in-both-python-stacks.md`: reading it counted as a
  // mutation and pulled the record into the artifact gate.
  ['cat docs/adr/0015-rq-for-queued-work-in-both-python-stacks.md', 'neither'],
  ['grep -q pending docs/adr/0010-the-node-stack-renders-screens.md', 'neither'],
  ['head -20 docs/ruby-migration.md', 'neither'],
  // ...but it still counts wherever it really is the command.
  ['/usr/bin/python3 rewrite.py', 'mutation'],
  ['env FOO=bar python rewrite.py', 'mutation'],
  ['bash -c "python rewrite.py"', 'mutation'],
  // Setting a tool path on its own line is the ordinary way these gates get
  // run, and the whole command used to be discarded for containing a newline,
  // so the run never counted as evidence. Same repository, same session.
  ['P=/p/bin\n"$P/adr-lint" docs/adr/0015-rq-for-queued-work-in-both-python-stacks.md', 'validation'],
  ['cd /repo\npnpm test', 'validation'],
  ['pnpm test\npnpm lint', 'validation'],
  // ...but a mutation on the line above a test still cannot launder itself.
  ['rm -rf build\npnpm test', 'mutation'],
  ['P=/p/bin\n$P/adr-verify docs/adr/T7.md', 'mutation'],
  // A piped test run is not evidence — a pipe hides the exit code — but it is
  // not an edit either. Reported 2026-08-25: filtering a test run through tail
  // recorded it as a mutation, so checking your work raised the bar it was meant
  // to clear. 'neither' is the honest verdict for all of these.
  ["python -m unittest discover -s kit -p 'test_x.py' 2>&1 | tail -4", 'neither'],
  ['cd /repo && git status --short && python -m unittest discover -s kit | tail -4', 'neither'],
  ['pytest -q 2>&1 | tail -20', 'neither'],
  ['node --test tests/unit.test.mjs 2>/dev/null | grep pass', 'neither'],
  // ...and a real edit in the same chain is still a mutation.
  ['python -m unittest discover -s kit | tail -4 ; rm -rf build', 'mutation'],
  ['python -m unittest discover -s kit && python rewrite.py', 'mutation'],
  ['rm -rf build', 'mutation'],
  ['bash scripts/selftest.sh', 'validation'],
  ['echo "== cache versions"', 'neither'],
  ['ls -la', 'neither'],
  ['Remove-Item -Recurse build', 'unrecognised'],
  ['cmd.exe /c del x.md', 'unrecognised'],
  ['pwsh -Command Set-Content x.md hi', 'unrecognised'],
  ['powershell.exe -Command Remove-Item -Recurse build', 'unrecognised'],
  ['pwsh -Command rm -rf build', 'unrecognised'],
  ['cmd /c rmdir /s /q build', 'unrecognised'],
  ['cmd.exe /c rmdir /s /q build', 'unrecognised'],
  ['pwsh -Command Remove-Item -Recurse build', 'unrecognised'],
  ['zsh -c "echo ${#files}"', 'neither'],
  ['zsh -c "rm -rf ${(s: :)files}"', 'mutation'],
]

test('the historical classify table still holds under four-way classify', () => {
  for (const [command, want] of cases) {
    assert.equal(classifyCommand(command), want, command.split('\n')[0])
  }
})

test('recognised POSIX rm is mutation and selftest is validation', () => {
  assert.equal(classifyCommand('rm -rf build'), 'mutation')
  assert.equal(classifyCommand('bash scripts/selftest.sh'), 'validation')
  assert.notEqual(classifyCommand('rm -rf build'), 'unrecognised')
  assert.notEqual(classifyCommand('bash scripts/selftest.sh'), 'unrecognised')
  // Dirty: false+false is not the four-way result (CLAUDE.md §4).
  assert.equal(classifyCommand('Remove-Item -Recurse build'), 'unrecognised')
})

test('an unrecognised PowerShell or cmd write is not neither', () => {
  for (const command of [
    'Remove-Item -Recurse build',
    'cmd.exe /c del x.md',
    'pwsh -Command Set-Content x.md hi',
  ]) {
    assert.equal(classifyCommand(command), 'unrecognised', command)
    assert.notEqual(classifyCommand(command), 'neither', command)
    const collapsed = isValidationCommand(command)
      ? 'validation'
      : (isPotentialMutationCommand(command) ? 'mutation' : 'neither')
    assert.equal(collapsed, 'neither', `${command}: the booleans still miss it`)
  }
  assert.equal(classifyCommand('rm -rf build'), 'mutation')
  assert.equal(classifyCommand('bash scripts/selftest.sh'), 'validation')
})

test('POSIX rm as the executable stays mutation', () => {
  assert.equal(classifyCommand('rm -rf build'), 'mutation')
  assert.notEqual(classifyCommand('rm -rf build'), 'unrecognised')
  assert.equal(classifyCommand('pwsh -Command rm -rf build'), 'unrecognised')
})

test('pwsh or cmd with POSIX letters in the payload is unrecognised, not mutation', () => {
  for (const command of [
    'pwsh -Command rm -rf build',
    'cmd /c rmdir /s /q build',
    'cmd.exe /c rmdir /s /q build',
    'pwsh -Command Remove-Item -Recurse build',
  ]) {
    assert.equal(classifyCommand(command), 'unrecognised', command)
    assert.notEqual(classifyCommand(command), 'mutation', command)
    assert.equal(isPotentialMutationCommand(command) || command.includes('Remove-Item'),
      true, `${command}: substring still matches or is the Remove-Item sibling`)
  }
  assert.equal(isPotentialMutationCommand('pwsh -Command rm -rf build'), true,
    'the boolean still sees letters rm — classify must not')
  assert.equal(isPotentialMutationCommand('cmd /c rmdir /s /q build'), true)
  assert.equal(classifyCommand('zsh -c "echo ${#files}"'), 'neither')
  assert.notEqual(classifyCommand('zsh -c "echo ${#files}"'), 'mutation')
})
