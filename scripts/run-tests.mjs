#!/usr/bin/env node
// The runner scripts/selftest.sh starts its test files through, in the order it is given them. Stage 1 of the plan to make the
// check fast without letting it claim more (BACKLOG §378).
//
// ⚠ WHY NOT `node --test`. Measured 2026-10-14 on node 24: `node --test` sorts the files it is given — c, b, a ran as a, b, c —
// so the order scripts/test-order.mjs computed never reached the runner, and an A/B of three pairs measured no gain. node:test's
// run() keeps the order given. This is that call, with the CLI's own pieces around it: the spec reporter on stdout, process
// isolation, and the default concurrency `node --test` uses (one fewer than the available parallelism).
//
// ⚠ THE CLI'S VERDICT, NOT A NEW ONE. It exits 0 only when run()'s overall summary says success, the same verdict `node --test`
// exits on (a failing test or a file that does not load is 1, a failing todo is not), and 1 when no summary came at all: a run
// that could not say how it went did not pass. tests/run-tests.test.mjs compares the two exit codes case by case.
//
// Usage: node scripts/run-tests.mjs [--concurrency N] [--times <file>] [--tap <file>] -- <file>...
import { createWriteStream } from 'node:fs'
import os from 'node:os'
import { PassThrough } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { run } from 'node:test'
import { spec, tap } from 'node:test/reporters'
import { isMainModule } from '../plugin/scripts/main-module.mjs'
import fileTiming from './file-timing-reporter.mjs'

/** The exit code for a run whose overall summary said `success`: 0 only on true; no summary at all did not pass. */
export const exitCodeFor = success => (success === true ? 0 : 1)

const usage = () => {
  process.stderr.write('usage: run-tests.mjs [--concurrency N] [--times <file>] [--tap <file>] -- <file>...\n')
  process.exit(2)
}

async function main(argv) {
  const split = argv.indexOf('--')
  if (split < 0) usage()
  const options = argv.slice(0, split)
  const files = argv.slice(split + 1)
  if (files.length === 0) usage()
  let concurrency = Math.max(1, (os.availableParallelism?.() ?? os.cpus().length) - 1)
  let times = null
  let tapFile = null
  for (let index = 0; index < options.length; index += 2) {
    const [name, value] = [options[index], options[index + 1]]
    if (value === undefined) usage()
    if (name === '--concurrency' && /^[1-9]\d*$/.test(value)) concurrency = Number(value)
    else if (name === '--times') times = value
    else if (name === '--tap') tapFile = value
    else usage()
  }

  const stream = run({ files, concurrency, isolation: 'process' })
  // One stream, several readers: each reader gets every event through its own copy.
  const copy = () => stream.pipe(new PassThrough({ objectMode: true }))
  let success = null
  stream.on('test:summary', data => { if (data.file === undefined) success = data.success })
  const readers = [pipeline(copy(), new spec(), process.stdout, { end: false })]
  if (times) readers.push(pipeline(copy(), fileTiming, createWriteStream(times)))
  if (tapFile) readers.push(pipeline(copy(), tap, createWriteStream(tapFile)))
  await Promise.all(readers)
  process.exitCode = exitCodeFor(success)
}

if (isMainModule(import.meta.url)) await main(process.argv.slice(2))
