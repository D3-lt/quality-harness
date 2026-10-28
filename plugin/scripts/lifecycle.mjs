#!/usr/bin/env node
// Retained CLI spelling; the hook registry launches the native core directly.
import { execNative } from './native-cli.mjs'
import { isMainModule } from './main-module.mjs'

if (isMainModule(import.meta.url)) {
  const args = process.argv.slice(2)
  const native = args[0] === '--artifact-pass' ? ['hook', '--artifact-pass', args[1]]
    : args[0] === '--first-mention' ? ['first-mention', ...args.slice(1)]
      : ['hook', 'legacy']
  process.exitCode = execNative(native, args[0] === '--session-end' ? process.env.QUALITY_HARNESS_HOOK_INPUT || '' : undefined)
}
