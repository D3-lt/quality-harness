#!/usr/bin/env node

import { spawn } from 'node:child_process'
import path from 'node:path'

const argv = process.argv.slice(2)
const separator = argv.indexOf('--')
const cwdIndex = argv.indexOf('--cwd')

if (separator < 0 || cwdIndex < 0 || cwdIndex + 1 >= separator || separator === argv.length - 1) {
  process.stderr.write('usage: verify.mjs --cwd <absolute-project-path> -- <command> [args...]\n')
  process.exit(2)
}

const cwd = argv[cwdIndex + 1]
if (!path.isAbsolute(cwd) || cwd.includes('\0')) {
  process.stderr.write('--cwd must be an absolute path without NUL bytes\n')
  process.exit(2)
}

const [command, ...commandArgs] = argv.slice(separator + 1)
const child = spawn(command, commandArgs, { cwd, stdio: 'inherit', shell: false })

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
