// Where the plugin lives, as the host names it. Moved out of lifecycle.mjs unchanged (BACKLOG section 375, stage B3) so that the
// modules that need it do not each read the environment for it.
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT
  || path.dirname(path.dirname(fileURLToPath(import.meta.url)))
