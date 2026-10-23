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

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const coreDir = join(repoRoot, 'core')
const goVersion = spawnSync('go', ['version'], { encoding: 'utf8', timeout: 30_000, windowsHide: true })
const noGo = required('go', goVersion.error || goVersion.status !== 0
  ? `go is not on PATH (${goVersion.error?.code ?? `exit ${goVersion.status}`}), so the Go core cannot be checked here` : false)
const gofmt = (args, input) => spawnSync('gofmt', args, { input, encoding: 'utf8', timeout: 120_000, windowsHide: true })
const git = args => spawnSync('git', args, { cwd: repoRoot, encoding: 'utf8', maxBuffer: 1 << 26, timeout: 60_000, windowsHide: true })

// What git stores, not what the disk holds: a Windows clone made before *.go took eol=lf keeps CRLF in every file a later
// checkout did not rewrite, and gofmt listed 30 of them there (the Windows check of cec6203c).
test('every Go file in the core is as gofmt writes it', { skip: noGo }, () => {
  const listed = git(['ls-files', '-z', '--', 'core/*.go'])
  assert.equal(listed.status, 0, `git could not list the core: ${listed.error?.message ?? listed.stderr}`)
  const files = listed.stdout.split('\0').filter(Boolean)
  assert.ok(files.length > 0, 'the core has Go files')
  const unformatted = files.filter(file => {
    const blob = git(['show', `:${file}`])
    assert.equal(blob.status, 0, `git could not show ${file}: ${blob.stderr}`)
    const checked = gofmt(['-l'], blob.stdout)
    assert.equal(checked.status, 0, `gofmt could not run on ${file}: ${checked.error?.message ?? checked.stderr}`)
    return checked.stdout.trim() !== ''
  })
  assert.deepEqual(unformatted, [], `not gofmt-formatted (run gofmt -w on each):\n${unformatted.join('\n')}`)
  // DIRTY twins: a file gofmt would rewrite is listed, and so is a CRLF one, which is why the disk is not asked.
  assert.equal(gofmt(['-l'], 'package x\n\n\nvar  a = 1\n').stdout.trim(), '<standard input>')
  assert.equal(gofmt(['-l'], 'package x\r\n\r\nvar a = 1\r\n').stdout.trim(), '<standard input>')
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
