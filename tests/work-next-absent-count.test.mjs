// BACKLOG §351 item 21.3 (a Windows chaos round, at 2daedc4): in a sparse checkout work-next said
// "0 task file(s)" while git tracked two. The directory was already named UNPROVEN; the count was the
// untrue sentence. It now says how many task files git lists that are not on disk, in the text and in
// the JSON. Deleting the staged files reproduces what a sparse checkout leaves: listed, not on disk.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const workNext = join(repoRoot, 'plugin', 'scripts', 'work-next.mjs')
const temps = []
test.after(() => { for (const dir of temps) rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }) })

function corpus(mode) {
  const repo = mkdtempSync(join(tmpdir(), 'qh-absent-count-'))
  temps.push(repo)
  const tasks = join(repo, 'docs', 'adr', 'ADR-001-a', 'tasks')
  mkdirSync(tasks, { recursive: true })
  writeFileSync(join(repo, 'docs', 'adr', 'ADR-001-a.md'), '# ADR-001: A\n\n**Status:** Accepted\n')
  for (const id of ['T1', 'T2']) writeFileSync(join(tasks, `${id}-a.md`), `# ${id}: t\n\n**Depends-on:** none\n\n## Acceptance\n\n\`\`\`bash\ntrue\n\`\`\`\n`)
  // Git runs only in a directory this file made (CLAUDE.md §9); staging is enough for `git ls-files`.
  for (const args of [['init', '-q'], ['add', '-A']]) {
    assert.equal(spawnSync('git', args, { cwd: repo, timeout: 30_000, windowsHide: true }).status, 0)
  }
  if (mode === 'removed') for (const id of ['T1', 'T2']) rmSync(join(tasks, `${id}-a.md`))
  // A directory that denies traversal: the files are there, and stat fails with EACCES, not ENOENT.
  if (mode === 'locked') chmodSync(tasks, 0o000)
  try {
    const run = args => spawnSync(process.execPath, [workNext, ...args], { cwd: repo, encoding: 'utf8', timeout: 60_000, windowsHide: true })
    const text = run([])
    const json = run(['--json'])
    assert.equal(json.status, 0, json.stderr)
    return { text: text.stdout, json: JSON.parse(json.stdout) }
  } finally {
    if (mode === 'locked') chmodSync(tasks, 0o755)
  }
}

test('task files git lists that are not on disk are counted as that, not as no task files', () => {
  const sparse = corpus('removed')
  assert.match(sparse.text, /0 task file\(s\) on disk, and 2 that git lists and the disk does not hold, 0 spec\(s\)/, sparse.text)
  assert.equal(sparse.json.tasks, 0, JSON.stringify(sparse.json))
  assert.equal(sparse.json.tasksNotOnDisk, 2, JSON.stringify(sparse.json))
  // The control: every listed task is on disk, and nothing is said about the disk.
  const whole = corpus('whole')
  assert.match(whole.text, /\b2 task file\(s\), 0 spec\(s\)/, whole.text)
  assert.doesNotMatch(whole.text, /the disk does not hold/, whole.text)
  assert.equal(whole.json.tasksNotOnDisk, 0, JSON.stringify(whole.json))
  assert.equal(whole.json.tasksUninspected, 0, JSON.stringify(whole.json))
})

// A gpt-6.1-sol review of 3.8.14: a failed stat that is not ENOENT was counted as "the disk does not
// hold", a claim of absence nobody observed. It is counted as not inspectable instead.
test('a listed task file that could not be inspected is not called absent', t => {
  if (process.platform === 'win32') { t.skip('no POSIX permission bits on a Windows checkout (CLAUDE.md §7)'); return }
  if (process.getuid?.() === 0) { t.skip('root traverses a mode-000 directory'); return }
  const locked = corpus('locked')
  assert.match(locked.text, /0 task file\(s\) on disk, and 2 that git lists and could not be inspected, 0 spec\(s\)/, locked.text)
  assert.doesNotMatch(locked.text, /the disk does not hold/, locked.text)
  assert.equal(locked.json.tasksNotOnDisk, 0, JSON.stringify(locked.json))
  assert.equal(locked.json.tasksUninspected, 2, JSON.stringify(locked.json))
})
