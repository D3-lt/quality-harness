import assert from 'node:assert/strict'
import test from 'node:test'
import { slowHookNote } from '../plugin/scripts/lifecycle.mjs'
import { hookSaid } from './hook-env.mjs'

test('a pause line is silence, and an advisory beside it is still a finding', () => {
  const note = slowHookNote('PreToolUse', 6_000)
  const only = JSON.stringify({ systemMessage: note })
  const quiet = hookSaid(only + '\n', note + '\n')
  assert.equal(quiet.stdout, '')
  assert.equal(quiet.stderr, '')
  assert.equal(quiet.text, '')

  const advisory = 'quality-harness: this repository is unchecked'
  const both = JSON.stringify({ systemMessage: advisory + '\n' + note })
  const said = hookSaid(both, advisory + '\n' + note + '\n')
  assert.match(said.stdout, /unchecked/)
  assert.match(said.stderr, /unchecked/)
  assert.doesNotMatch(said.text, /pause has this name/)
})
