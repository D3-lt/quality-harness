#!/usr/bin/env node
// The session orientation as a command, for a client that runs no hooks
// (BACKLOG §136). Claude Code gets this text from the SessionStart hook; Claude
// Desktop reaches the plugin only over MCP, so `qh_orientation` runs this with
// the repository the caller named as its cwd and returns the same text.
//
//   node orientation.mjs [directory]
//
// Prints the orientation, or one line saying there is nothing to orient in that
// directory — never nothing at all, because an empty answer over MCP reads as
// "this tool does not work" and a named absence does not (ADR-005). Exit 0
// either way; a directory that does not exist is exit 2 with the reason.
import { statSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { sessionOrientation } from './lifecycle.mjs'

export function main(argv = process.argv.slice(2), stdout = process.stdout, stderr = process.stderr) {
  const directory = path.resolve(argv.find(arg => !arg.startsWith('--')) ?? process.cwd())
  let isDirectory = false
  try { isDirectory = statSync(directory).isDirectory() } catch { isDirectory = false }
  if (!isDirectory) {
    stderr.write(`orientation: no such directory ${directory}\n`)
    return 2
  }
  const text = sessionOrientation(directory).trim()
  // A neutral absence: what the orientation would say here is nothing, which is
  // not three claims about what the directory lacks.
  stdout.write(`${text || `Nothing to orient in ${directory}: the orientation is empty for this directory.`}\n`)
  return 0
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main()
}
