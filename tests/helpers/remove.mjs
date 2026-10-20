// A test's directory, removed with retries. A hook a test drives starts children with `detached: true` that outlive it
// (branch-state's refresher, the artifact pass), and one writing during a recursive remove fails it with ENOTEMPTY after
// every assertion passed (BACKLOG §380). The form tests/unused-names.test.mjs already used (ADR-119 T5).
import { rmSync } from 'node:fs'

export const remove = dir => rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })
