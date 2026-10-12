// ADR-096: turn-end findings reach the agent. A synchronous hook's systemMessage is shown to the user only, so the turn-end rules
// had never reached the agent; at Stop they now go into the agent's context and the turn continues once. These tests pin where each
// finding goes, and that the rulebook says what the hook does.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// The text of one numbered section of CLAUDE.md, from its heading to the next.
function section(number) {
  const text = readFileSync(path.join(repoRoot, 'CLAUDE.md'), 'utf8')
  const start = text.search(new RegExp(`^## ${number}\\. `, 'm'))
  assert.ok(start >= 0, `CLAUDE.md has a section ${number}`)
  const next = text.slice(start + 1).search(/^## \d+\. /m)
  return next < 0 ? text.slice(start) : text.slice(start, start + 1 + next)
}

test('CLAUDE.md section 3 names a turn that continues as an act, not a refusal', () => {
  const rules = section(3)
  assert.match(rules, /continue[s]? (?:a|the) turn/i, 'section 3 says a hook may continue a turn')
  assert.match(rules, /ADR-096/, 'and names the record that decided it')
  assert.match(rules, /Two refusals are sanctioned, and no others/, 'and still names exactly two refusals')
})
