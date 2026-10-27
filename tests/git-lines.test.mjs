// gitLines trims ASCII whitespace only, as the Go core does: a git name may end in other whitespace (a remote `team/peer` +
// U+00A0 was the case R2's sixth verification review found), and trimEnd() would read it as another name.
import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { gitLines } from '../plugin/scripts/tree-facts.mjs'
import { fixtureRepo, git, sandbox } from './hook-golden.mjs'

test('a git line keeps trailing non-ASCII whitespace and loses ASCII whitespace', t => {
  const box = sandbox(t)
  const repo = fixtureRepo(box, 'git-lines', { 'a.txt': 'x\n' })
  writeFileSync(path.join(repo, 'lines.txt'), 'kept \nspace \r\ntab\t\n')
  git(repo, box, 'add', '-A')
  git(repo, box, 'commit', '-q', '-m', 'lines', '--no-gpg-sign')
  const lines = gitLines(repo, ['show', 'HEAD:lines.txt'])
  assert.equal(lines.ok, true)
  assert.deepEqual([...lines], ['kept ', 'space', 'tab'])
})
