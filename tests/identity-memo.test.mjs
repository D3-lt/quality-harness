// ADR-095 T3: a hook process asks git for the repository's identity once. The identity questions (the toplevel, the paths of the
// index and the objects) cannot change inside one process, so asking them again is repeated work; a question about the TREE can
// change under the hook's own feet and is asked every time. Counted through scripts/hook-cost.mjs (T1), on the real hook program
// and on a fixture program that calls the same functions.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const tool = path.join(repoRoot, 'scripts', 'hook-cost.mjs')
const treeFacts = pathToFileURL(path.join(repoRoot, 'plugin', 'scripts', 'tree-facts.mjs')).href
const scratch = realpathSync.native(mkdtempSync(path.join(os.tmpdir(), 'identity-memo-')))
after(() => rmSync(scratch, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }))

let repos = 0
function repository() {
  const dir = path.join(scratch, `repo-${repos++}`)
  mkdirSync(dir, { recursive: true })
  const git = (...args) => assert.equal(spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8', timeout: 20_000, windowsHide: true }).status, 0)
  git('init', '-q')
  writeFileSync(path.join(dir, 'a.txt'), 'one\n')
  git('add', '-A')
  git('-c', 'user.email=a@b', '-c', 'user.name=n', 'commit', '-q', '-m', 'init')
  return dir
}
function measure(event, dir, { program, out } = {}) {
  const run = spawnSync(process.execPath, [tool, event, dir, '--in-place', '--json', ...(program ? ['--program', program] : [])],
    { encoding: 'utf8', timeout: 120_000, windowsHide: true, env: { ...process.env, ...(out ? { FIXTURE_OUT: out } : {}) } })
  assert.equal(run.status, 0, run.stdout + run.stderr)
  return JSON.parse(run.stdout)
}
const asked = (report, text) => report.children.filter(child => child.cmd.includes(text)).length
const fixture = (name, body) => { const file = path.join(scratch, name); writeFileSync(file, `import { appendFileSync, writeFileSync } from 'node:fs'\nimport { gitRepositoryLookup, observe } from ${JSON.stringify(treeFacts)}\nconst out = process.env.FIXTURE_OUT\n${body}\n`); return file }

test('a Stop event asks git for the repository toplevel once', { skip: 'Node preload cannot trace Go descendants; native lifecycle behavior is checked at its Go boundary' }, () => {
  const report = measure('Stop', repository())
  assert.equal(report.exit, 0)
  assert.equal(asked(report, 'rev-parse --show-toplevel'), 1, report.children.map(child => child.cmd).join('\n'))
  assert.equal(asked(report, 'rev-parse --git-path index'), 1)
})

test('the memo is per directory: two directories in one process are two answers', () => {
  const a = repository()
  const b = repository()
  const out = path.join(scratch, 'two.json')
  const program = fixture('two.mjs', `const answers = [gitRepositoryLookup(${JSON.stringify(a)}), gitRepositoryLookup(${JSON.stringify(b)}), gitRepositoryLookup(${JSON.stringify(a)}), gitRepositoryLookup(${JSON.stringify(b)})]\nwriteFileSync(out, JSON.stringify(answers.map(answer => answer.root)))`)
  const report = measure('Stop', a, { program, out })
  const roots = JSON.parse(readFileSync(out, 'utf8'))
  assert.equal(roots[0], roots[2])
  assert.equal(roots[1], roots[3])
  assert.notEqual(roots[0], roots[1], 'each directory gets its own repository')
  assert.equal(asked(report, 'rev-parse --show-toplevel'), 2, 'one question per directory, not one per call')
})

test('no question about the tree is memoised: a status asked twice around a write sees the write', () => {
  const dir = repository()
  const out = path.join(scratch, 'tree.json')
  const program = fixture('tree.mjs', `const before = observe(${JSON.stringify(dir)})\nappendFileSync(${JSON.stringify(path.join(dir, 'a.txt'))}, 'two\\n')\nconst after = observe(${JSON.stringify(dir)})\nwriteFileSync(out, JSON.stringify({ before: before.tree, after: after.tree, ok: [before.ok, after.ok] }))`)
  const report = measure('Stop', dir, { program, out })
  const seen = JSON.parse(readFileSync(out, 'utf8'))
  assert.deepEqual(seen.ok, [true, true])
  assert.notEqual(seen.before, seen.after, 'the second observation sees the write')
  assert.equal(asked(report, 'add -A'), 2, 'the tree is read both times')
  assert.equal(asked(report, 'write-tree'), 4)
  assert.equal(asked(report, 'rev-parse --show-toplevel'), 1, 'while the identity of the repository is asked once')
  assert.equal(asked(report, 'rev-parse --git-path objects'), 1)
})

test('an answer one caller kept reads the same to the other: observe then lookup, and lookup then observe', () => {
  const dir = repository()
  const out = path.join(scratch, 'both.json')
  const program = fixture('both.mjs', `const first = observe(${JSON.stringify(dir)})\nconst lookedUp = gitRepositoryLookup(${JSON.stringify(dir)})\nwriteFileSync(out, JSON.stringify({ observed: first.ok, lookup: lookedUp }))`)
  measure('Stop', dir, { program, out })
  const seen = JSON.parse(readFileSync(out, 'utf8'))
  assert.equal(seen.observed, true)
  assert.equal(seen.lookup.ok, true, 'the lookup is not handed the other holder\'s shape and read as an empty root')
  assert.ok(seen.lookup.root, 'and it has the root')
  const reverse = fixture('reverse.mjs', `const lookedUp = gitRepositoryLookup(${JSON.stringify(dir)})\nconst second = observe(${JSON.stringify(dir)})\nwriteFileSync(out, JSON.stringify({ observed: second.ok, lookup: lookedUp, tree: typeof second.tree }))`)
  measure('Stop', dir, { program: reverse, out })
  const back = JSON.parse(readFileSync(out, 'utf8'))
  assert.deepEqual([back.observed, back.lookup.ok, back.tree], [true, true, 'string'], 'observe is not handed the lookup\'s shape and read as an empty answer')
})

test('a link repointed at another repository between two asks is another directory, not the old answer', async () => {
  // Found by a Codex review of the release candidate (ADR-095): a memo keyed by the spelling of the directory answered for the old
  // target and a publish check read the wrong repository. A directory link needs no privilege on Windows (a junction).
  const a = repository()
  const b = repository()
  const link = path.join(scratch, `link-${repos}`)
  try { symlinkSync(a, link, process.platform === 'win32' ? 'junction' : 'dir') } catch { return }
  const { gitRepositoryLookup } = await import(treeFacts)
  const first = gitRepositoryLookup(link)
  rmSync(link, { recursive: true, force: true })
  symlinkSync(b, link, process.platform === 'win32' ? 'junction' : 'dir')
  const second = gitRepositoryLookup(link)
  assert.equal(first.root, realpathSync.native(a))
  assert.equal(second.root, realpathSync.native(b), 'the second ask reads the repository the link now points at')
})

test('a path git is given that does not resolve is asked about, never answered from a directory it was spelled near', async () => {
  // Found by the verification review of the release candidate (ADR-095): a key built after path.resolve() had dropped the missing
  // component answered x/.. with the root of the directory it was written beside, where git itself says "not a repository".
  const dir = repository()
  const { gitRepositoryLookup } = await import(treeFacts)
  const here = gitRepositoryLookup(dir)
  assert.equal(here.root, realpathSync.native(dir))
  const spelled = `${dir}${path.sep}__absent__${path.sep}..`
  const odd = gitRepositoryLookup(spelled) // path.join would drop the missing component, which is the point
  // What git says about the path as spelled is the answer, whatever the platform does with a missing component: POSIX says it is not
  // a repository, and Windows collapses `x\..` before it looks.
  const direct = spawnSync('git', ['-C', spelled, 'rev-parse', '--show-toplevel'], { encoding: 'utf8', timeout: 20_000, windowsHide: true })
  assert.equal(odd.root === null, direct.status !== 0, 'git is asked about the path as spelled')
  assert.equal(gitRepositoryLookup(dir).root, here.root, 'and the ordinary answer is still the ordinary answer')
})
