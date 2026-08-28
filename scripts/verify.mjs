#!/usr/bin/env node
// verify.mjs — run a project's own verification command in its own directory.
//
// Everything below used to execute at MODULE SCOPE, which meant that importing
// this file — to test one of its argument checks, or by a tool walking the
// directory — SPAWNED whatever command the ambient process.argv happened to
// name. Of the four scripts BACKLOG §27 found running their CLI on import this
// was the one that ran someone else's code to do it. Guarded 2026-08-28.

import { spawn } from 'node:child_process'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

/** The parsed invocation, or a usage error. Pure, so the checks are testable. */
export function parse(argv) {
  const separator = argv.indexOf('--')
  const cwdIndex = argv.indexOf('--cwd')
  if (separator < 0 || cwdIndex < 0 || cwdIndex + 1 >= separator || separator === argv.length - 1) {
    return { error: 'usage: verify.mjs --cwd <absolute-project-path> -- <command> [args...]' }
  }
  const cwd = argv[cwdIndex + 1]
  if (!path.isAbsolute(cwd) || cwd.includes('\0')) {
    return { error: '--cwd must be an absolute path without NUL bytes' }
  }
  const [command, ...commandArgs] = argv.slice(separator + 1)
  return { cwd, command, commandArgs }
}

export function main(argv, spawnFn = spawn) {
  const parsed = parse(argv)
  if (parsed.error) {
    process.stderr.write(`${parsed.error}\n`)
    return 2
  }
  const child = spawnFn(parsed.command, parsed.commandArgs,
    { cwd: parsed.cwd, stdio: 'inherit', shell: false })

  child.on('error', error => {
    process.stderr.write(`verification command failed to start: ${error.message}\n`)
    process.exitCode = 127
  })

  child.on('exit', (code, signal) => {
    if (signal) {
      process.stderr.write(`verification command terminated by ${signal}\n`)
      process.exitCode = 1
      return
    }
    process.exitCode = code ?? 1
  })
  return null
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const code = main(process.argv.slice(2))
  if (code !== null) process.exitCode = code
}
