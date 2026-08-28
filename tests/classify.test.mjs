import { isPotentialMutationCommand, isValidationCommand }
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
]

let bad = 0
for (const [command, want] of cases) {
  const validation = isValidationCommand(command)
  const mutation = isPotentialMutationCommand(command)
  const got = validation ? 'validation' : (mutation ? 'mutation' : 'neither')
  const ok = got === want
  if (!ok) bad += 1
  console.log(`${ok ? 'ok  ' : 'FAIL'}  got=${got.padEnd(10)} want=${want.padEnd(10)} ${command.split('\n')[0].slice(0, 60)}`)
}
console.log(bad ? `\n${bad} case(s) wrong` : '\nall cases correct')
process.exitCode = bad ? 1 : 0
