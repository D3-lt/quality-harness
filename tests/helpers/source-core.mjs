// Standalone fences build the checkout they test. Full suites pass one source binary to all workers.
import { mkdtempSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { buildCore } from '../../scripts/build-core.mjs'
import { remove } from './remove.mjs'

export function sourceCore() {
  if (process.env.QUALITY_HARNESS_QH_BIN) return process.env.QUALITY_HARNESS_QH_BIN
  const directory = mkdtempSync(path.join(os.tmpdir(), 'qh-source-'))
  process.on('exit', () => remove(directory))
  const binary = path.join(directory, process.platform === 'win32' ? 'qh.exe' : 'qh')
  buildCore({ goos: process.platform === 'win32' ? 'windows' : process.platform,
    goarch: process.arch === 'x64' ? 'amd64' : process.arch, output: binary, version: 'dev' })
  process.env.QUALITY_HARNESS_QH_BIN = binary
  return binary
}
