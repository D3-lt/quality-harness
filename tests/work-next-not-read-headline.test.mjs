// BACKLOG §355 (the front-matter corpora), owner's decision 2026-10-08: fix the headline only. Over a
// corpus of dated records whose front matter carries no Status, every file was named as not read and
// work-next then said "No QH corpus is in use", untrue over that many named record-shaped files. ADR-092
// Decision 9 keeps the look ok, and the stage is unchanged; only the sentences say what was observed.
// Invented names; the shape is a public corpus's (`adr/YYYY-MM-DD-<slug>.md`, YAML front matter).
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const temps = []
test.after(() => { for (const dir of temps) rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }) })

function workNext(files) {
  const repo = mkdtempSync(join(tmpdir(), 'qh-not-read-headline-'))
  temps.push(repo)
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(dirname(join(repo, name)), { recursive: true })
    writeFileSync(join(repo, name), text)
  }
  // Git runs only in a directory this file made (CLAUDE.md §9); staging is enough for `git ls-files`.
  for (const args of [['init', '-q'], ['add', '-A']]) {
    assert.equal(spawnSync('git', args, { cwd: repo, timeout: 30_000, windowsHide: true }).status, 0)
  }
  const r = spawnSync(process.execPath, [join(repoRoot, 'plugin', 'scripts', 'work-next.mjs')],
    { cwd: repo, encoding: 'utf8', timeout: 60_000, windowsHide: true })
  assert.equal(r.status, 0, r.stderr)
  return r.stdout
}

const dated = slug => `---\ntitle: ${slug}\ndate: 2021-03-04\narea: billing\n---\n\n## Context\n\nWhy.\n\n## Decision\n\nWhat.\n`

test('a corpus whose records were all named as not read is not called no corpus', () => {
  const out = workNext({ 'adr/2021-03-04-split-invoices.md': dated('split'), 'adr/2021-04-05-merge-carts.md': dated('merge') })
  assert.match(out, /not read: 2 file\(s\)/, out)
  assert.match(out, /No record this reader recognises is in use: the 2 record-shaped file\(s\) named above were not read, so this is not "no corpus"\./, out)
  assert.match(out, /because no record this reader recognises is in use\./, out)
  assert.doesNotMatch(out, /No QH corpus is in use/, out)
  // The control: a repository with no record-shaped file at all still says there is no corpus.
  const empty = workNext({ 'README.md': '# A project\n' })
  assert.match(empty, /No QH corpus is in use\./, empty)
  assert.match(empty, /because no QH corpus is in use\./, empty)
})
