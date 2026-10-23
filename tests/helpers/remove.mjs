// A test's directory, removed with retries. A hook a test drives starts children with `detached: true` that outlive it
// (branch-state's refresher, the artifact pass), and one writing during a recursive remove fails it with ENOTEMPTY after
// every assertion passed (BACKLOG §380). The form tests/unused-names.test.mjs already used (ADR-119 T5).
// 25 × 400 ms: on Windows a detached child's exit held a directory past 10 × 200 ms (adr-verify --background's child, the
// 3.8.54 landing check, BACKLOG §407); the patience is paid only when a remove fails, and the locked
// tests/adr-verify-background.test.mjs removes through here too.
import { rmSync } from 'node:fs'

export const remove = dir => rmSync(dir, { recursive: true, force: true, maxRetries: 25, retryDelay: 400 })
