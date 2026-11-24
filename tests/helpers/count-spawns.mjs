// Preloaded with `node --import`: records every adr-next a program starts through spawnSync, in order, as the arguments
// the gate was given, and prints them to stderr as its last line. For a test that must tell one batch process from a
// process per directory, and see which directories were asked again.
import childProcess from 'node:child_process'
import { syncBuiltinESMExports } from 'node:module'

const started = []
const real = childProcess.spawnSync
childProcess.spawnSync = (command, args, options) => {
  const words = [command, ...(Array.isArray(args) ? args : [])].map(String)
  const gate = words.findIndex(word => word.split(/[\\/]/).pop() === 'adr-next')
  if (gate >= 0) started.push(words.slice(gate + 1))
  return real(command, args, options)
}
syncBuiltinESMExports()
process.on('exit', () => process.stderr.write(`\nadr-next started: ${JSON.stringify(started)}\n`))
