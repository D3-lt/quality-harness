import { isPotentialMutationCommand, isValidationCommand }
  from '../scripts/lifecycle.mjs'

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
