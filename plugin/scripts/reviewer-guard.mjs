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
import { isPotentialMutationCommand, mutatesOnlyTempPaths, isGitPublishCommand } from './lifecycle.mjs'

const EDITING_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])

// Interactive editors and anything that opens a file to write it. A reviewer
// has no business in one; the classifier reads none of them as a mutation.
const EDITORS = /(?:^|[\s;&|(])(?:vim?|nvim|nano|emacs|ed|ex|pico|micro|code|subl|open\s+-e)\b/

// Payloads a shell would run: `bash -c '…'`, `$(…)`, backticks. The classifier
// looks at the outer command; these are the inner ones, each judged as a
// command of its own (Codex review, 2026-09-05: all three passed the first
// shape of this guard).
function innerCommands(command) {
  const inner = []
  for (const match of command.matchAll(/\b(?:ba|z|da)?sh\s+(?:-[a-zA-Z]*\s+)*-c\s+(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)')/g)) {
    inner.push(match[1] ?? match[2])
  }
  for (const match of command.matchAll(/\$\(((?:[^()]|\([^()]*\))*)\)/g)) inner.push(match[1])
  for (const match of command.matchAll(/`([^`]*)`/g)) inner.push(match[1])
  return inner.filter(text => text && text.trim())
}

function bashVerdict(command, cwd, depth = 0) {
  if (isGitPublishCommand(command)) {
    return 'This role is read-only: it does not commit, push, or stage. Name the commit you would make in the review.'
  }
  if (EDITORS.test(command)) {
    return 'This role is read-only: an editor is not available to it. Read the file and report the change you would make.'
  }
  if (isPotentialMutationCommand(command) && !mutatesOnlyTempPaths(command, cwd)) {
    return 'This role is read-only: that command writes outside the temp roots. Read, grep, diff and run checks; report the edit rather than making it.'
  }
  if (depth < 3) {
    for (const inner of innerCommands(command)) {
      const reason = bashVerdict(inner, cwd, depth + 1)
      if (reason) return reason
    }
  }
  return null
}

export function verdict(input) {
  const tool = input?.tool_name
  if (EDITING_TOOLS.has(tool)) {
    return `This role is read-only: ${tool} is not available to it. Report the change you would make; do not make it.`
  }
  if (tool !== 'Bash') return null
  const command = input?.tool_input?.command
  if (typeof command !== 'string' || !command.trim()) return null
  const cwd = typeof input?.cwd === 'string' ? input.cwd : process.cwd()
  return bashVerdict(command, cwd)
}

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
