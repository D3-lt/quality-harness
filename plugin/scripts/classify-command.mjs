// Four-way classify for a Bash command: mutation | validation | neither | unrecognised.
//
// Family is the executable (commandInvocation / executableName), not a denylist
// substring of the whole string. A POSIX nested shell's -c body is classified as
// its own command; pwsh / powershell / cmd are not that peel (ADR-047, CLAUDE.md §16).
//
// MEASURED_FAMILIES is copied from lists the Session classifier has already
// executed (POSIX mutation verbs, INTERPRETER_WORD, READ_ONLY_CHILD,
// VALIDATION_PATTERNS first tokens, nestedShellScript's five names). A family
// absent here is unrecognised — false+false is not "a write that did not happen".
// Foreign shells are unrecognised before the mutation boolean, so letters `rm`
// in a pwsh -Command payload are not a recognised mutation.

export const POSIX_NESTED_SHELLS = new Set(['bash', 'dash', 'ksh', 'sh', 'zsh'])

// Measured 2026-09-12: executableName strips .exe, so cmd.exe → cmd.
export const FOREIGN_SHELL_FAMILIES = new Set(['pwsh', 'powershell', 'cmd'])

export const MEASURED_FAMILIES = new Set([
  ...POSIX_NESTED_SHELLS,
  'rm', 'mv', 'cp', 'install', 'mkdir', 'rmdir', 'touch', 'truncate', 'tee',
  'dd', 'patch', 'apply_patch', 'rsync', 'chmod', 'chown', 'ln',
  'python', 'python3', 'node', 'ruby', 'perl', 'php',
  'grep', 'rg', 'ag', 'cat', 'head', 'tail', 'wc', 'sort', 'uniq', 'cut', 'tr',
  'ls', 'find', 'stat', 'file', 'which', 'echo', 'printf', 'true', 'pwd', 'date',
  'basename', 'dirname', 'realpath', 'readlink', 'diff', 'cmp', 'md5sum',
  'sha256sum', 'jq', 'column', 'nl',
  // ⚠ `composer` IS DELIBERATELY ABSENT, and the reason is worth keeping because
  // adding it looked obviously right. It was added here for one day, to stop a
  // successful `composer test` reading as `unrecognised` — and a different-lineage
  // review measured the cost: naming the FAMILY moved `composer update`,
  // `composer dump-autoload` and `composer run-script deploy` from `unrecognised`
  // to `neither`, so a command that rewrites composer.lock stopped counting as a
  // potential mutation. That is §16's direction-of-failure rule exactly: "not
  // recognised as X" is never "known to be not-X", and a family is an open input
  // space where only some members are read-only.
  //
  // The rung that made it necessary is gone instead, so nothing now offers a
  // composer command as a check and nothing needs to accept one as evidence.
  'git', 'npm', 'pnpm', 'yarn', 'bun', 'npx',
  'cargo', 'go', 'gofmt', 'black', 'ruff', 'prettier',
  'docker', 'podman', 'make', 'just', 'sed',
  'cd', 'pushd', 'popd',
  'env', 'sudo', 'command', 'exec', 'time',
  'pytest', 'phpunit', 'pest', 'rspec', 'tsc', 'eslint', 'mypy', 'pyright',
  'shellcheck', 'artisan', 'dotnet', 'swift', 'bundle',
  'adr-lint', 'adr-verify', 'adr-debt', 'spec-verify', 'arch-lint',
  'postmortem-verify', 'adr-retire-check',
  'claude',
  'test',
  'gh',
])

function familyOf(segment, hooks) {
  const invocation = hooks.commandInvocation(segment)
  if (!invocation) return ''
  return (hooks.executableName(invocation.words[invocation.index]) ?? '').toLowerCase()
}

export function classifyCommand(command, hooks, depth = 0) {
  if (typeof command !== 'string') return 'neither'
  if (depth > 4) return 'unrecognised'

  const stripped = typeof hooks.withoutHeredocBodies === 'function'
    ? hooks.withoutHeredocBodies(command)
    : command
  const segments = hooks.shellSegments(stripped)
  if (segments.length === 0) return 'neither'

  for (const segment of segments) {
    const nested = hooks.nestedShellScript(segment)
    if (nested) {
      const inner = classifyCommand(nested, hooks, depth + 1)
      if (inner === 'unrecognised' || inner === 'mutation') {
        return inner
      }
      continue
    }
    // Foreign family first: pwsh -Command rm is unrecognised, not mutation.
    if (FOREIGN_SHELL_FAMILIES.has(familyOf(segment, hooks))) return 'unrecognised'
  }

  // A family outside MEASURED_FAMILIES may still carry one measured read-only
  // subcommand (`mrw read`, ADR-058 T2). Both family checks below ask the hook,
  // which admits that invocation only; its redirects and sibling segments are
  // still judged by the mutation check at the end.
  //
  // Bare PATH family first: VALIDATION_PATTERNS admits any first word containing
  // selftest/check, which certified an unpublished name. A path-shaped executable
  // still goes through isValidationCommand (`./scripts/selftest.sh`). CLAUDE.md §16.
  for (const segment of segments) {
    if (hooks.nestedShellScript(segment)) continue
    const invocation = hooks.commandInvocation(segment)
    if (!invocation) continue
    const word = invocation.words[invocation.index] ?? ''
    const family = familyOf(segment, hooks)
    if (family && !/[/\\]/.test(word) && !MEASURED_FAMILIES.has(family)
      && !hooks.isRecognisedReadInvocation?.(segment)) return 'unrecognised'
  }

  if (hooks.isValidationCommand(command)) return 'validation'

  for (const segment of segments) {
    if (hooks.nestedShellScript(segment)) continue
    const family = familyOf(segment, hooks)
    if (family && !MEASURED_FAMILIES.has(family)
      && !hooks.isRecognisedReadInvocation?.(segment)) return 'unrecognised'
  }

  // A measured read family that uses its write channel (ADR-059 T4): one that
  // runs a program is unrecognised, one that writes a file is a mutation.
  const channel = typeof hooks.writeChannelOf === 'function' ? hooks.writeChannelOf(command) : null
  if (channel === 'unrecognised') return 'unrecognised'
  if (channel === 'mutation' || hooks.isPotentialMutationCommand(command)) return 'mutation'
  return 'neither'
}
