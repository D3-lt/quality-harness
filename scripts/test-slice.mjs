#!/usr/bin/env node
// ADR-139 T1: the i-th of n slices of a list of test files, for a CI job that runs one shard of the suite.
// Usage: node scripts/test-slice.mjs <i>/<n> <file>... — prints the slice, one name per line; exit 2 on a bad <i>/<n>.
// The list is sorted by name with `/` separators, compared by code unit (never the locale), and every n-th file from position
// i - 1 is taken: every file lands in exactly one slice, and the same slice on every platform whatever order the files came in.
import { isMainModule } from '../plugin/scripts/main-module.mjs'

const normal = name => name.replaceAll('\\', '/')

export function sliceFiles(files, i, n) {
  const sorted = [...files].sort((a, b) => {
    const x = normal(a)
    const y = normal(b)
    return x < y ? -1 : x > y ? 1 : 0
  })
  return sorted.filter((_, at) => at % n === i - 1)
}

function main(argv) {
  const match = /^([1-9]\d*)\/([1-9]\d*)$/.exec(argv[0] ?? '')
  if (!match || Number(match[1]) > Number(match[2])) {
    process.stderr.write(`test-slice: "${argv[0] ?? ''}" is not <i>/<n> with 1 <= i <= n\n`)
    return 2
  }
  for (const file of sliceFiles(argv.slice(1), Number(match[1]), Number(match[2]))) process.stdout.write(`${file}\n`)
  return 0
}

if (isMainModule(import.meta.url)) process.exitCode = main(process.argv.slice(2))
