// The bash a test spawns: the one the product resolves (run-shell-hook.mjs), so a Windows PATH that lists WSL's
// system32\bash.exe first does not decide which shell runs a POSIX script. With none found the bare name is spawned, and the
// failure is the spawn's own, named in the test's output.
import { resolveBashExecutable } from '../../plugin/scripts/run-shell-hook.mjs'

// `exists` left out is the resolver's own default, existsSync.
export const testBash = (platform = process.platform, env = process.env, exists = undefined) =>
  resolveBashExecutable(platform, env, exists) ?? 'bash'
