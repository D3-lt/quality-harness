#!/usr/bin/env node
// A read-only role is read-only by contract, and a contract with no check is a
// sentence (BACKLOG §135). The reviewer agents omit Edit and Write from their
// tools, and keep Bash — which writes, through `sed -i`, a heredoc, `git
// commit`. This hook is declared in those agents' own frontmatter, so it runs
// only inside them, and refuses a Bash command the mutation classifier reads as
// a write outside the temp roots, and any Edit/Write/MultiEdit/NotebookEdit call.
//
// Exit 2 with the reason on stderr is the hook contract for a refusal. This is
// not a quality gate advising on work (CLAUDE.md §3); it is the boundary of a
// role that says "never edits", enforced where the tool list could not reach.
// Everything else — reads, greps, git diff, scratch writes under the temp
// roots, a command this hook cannot parse — passes, and a payload this hook
// cannot read passes too: a guard that fails closed on its own bug would stop
// a reviewer from reading, which is the one thing it exists to do.
import { pathToFileURL } from 'node:url'
import { readOnlyVerdict } from './lifecycle.mjs'

// The verdict is lifecycle.mjs's (readOnlyVerdict); this file is the CLI the
// agents' frontmatter names, kept so a frontmatter hook that DOES fire on some
// host refuses the same way. Re-exported under its old name for the tests.
export const verdict = readOnlyVerdict

export async function main(stdin = process.stdin, stderr = process.stderr) {
  let text = ''
  try { for await (const chunk of stdin) text += chunk } catch { return 0 }
  let input
  try { input = JSON.parse(text) } catch { return 0 }
  let reason = null
  try { reason = verdict(input) } catch { return 0 }
  if (!reason) return 0
  stderr.write(`quality-harness reviewer guard: ${reason}\n`)
  return 2
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main()
}
