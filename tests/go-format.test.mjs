// The Go core is formatted by gofmt and vetted by go vet on every gate (the owner, 2026-10-12: a useful static check is
// wired in, not run voluntarily). Nothing ran either, and two files drifted from gofmt unnoticed (found 2026-10-23).
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { remove } from './helpers/remove.mjs'
import { required } from './helpers/require.mjs'

const coreDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'core')
const goVersion = spawnSync('go', ['version'], { encoding: 'utf8', timeout: 30_000, windowsHide: true })
const noGo = required('go', goVersion.error || goVersion.status !== 0
  ? `go is not on PATH (${goVersion.error?.code ?? `exit ${goVersion.status}`}), so the Go core cannot be checked here` : false)
const gofmt = args => spawnSync('gofmt', args, { encoding: 'utf8', timeout: 120_000, windowsHide: true })

test('every Go file in the core is as gofmt writes it', { skip: noGo }, () => {
  const listed = gofmt(['-l', coreDir])
  assert.equal(listed.status, 0, `gofmt could not run: ${listed.error?.message ?? listed.stderr}`)
  assert.equal(listed.stdout.trim(), '', `not gofmt-formatted (run gofmt -w on each):\n${listed.stdout}`)
  // DIRTY twin: a file gofmt would rewrite is listed.
  const dir = mkdtempSync(join(tmpdir(), 'qh-gofmt-'))
  try {
    writeFileSync(join(dir, 'x.go'), 'package x\n\n\nvar  a = 1\n')
    assert.match(gofmt(['-l', dir]).stdout, /x\.go/)
  } finally { remove(dir) }
})

test('go vet finds nothing in the core', { skip: noGo }, () => {
  const vet = spawnSync('go', ['vet', './...'], { cwd: coreDir, encoding: 'utf8', timeout: 600_000, windowsHide: true })
  assert.equal(vet.status, 0, `go vet:\n${vet.stdout}${vet.stderr}`)
})
