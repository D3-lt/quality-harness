// Two ways the plugin that answers is not the plugin that was meant to: a second, older copy of the toolkit, and a newer
// version installed beside the one running. Moved out of lifecycle.mjs unchanged (BACKLOG section 375, stage B4).
import os from 'node:os'
import { PLUGIN_ROOT } from './plugin-root.mjs'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { FORWARDER_MARK, SHADOW_SCOPE, barePathWinner, citeOrphan, orphans, wiredInSettings } from './standalone-link.mjs'
import path from 'node:path'

// A second, older copy of this toolkit answering instead of the plugin.
//
// A `.claude/bin/` and `.claude/hooks/` under the user's home hold a standalone
// install that some machines keep as a compatibility entrypoint. It is NOT updated with the
// plugin, and when it drifts it drifts silently: measured 2026-08-26, a
// standalone adr-lint dated 2026-07-30 predated the `acceptance-sha256:`
// digest that adr-verify now writes, so its Verification Log grammar rejected
// the exact lines adr-verify had just produced — and then cascaded into "marked
// done but no exit-0 entry". Direct invocation passed the whole time, which made
// the HOOK look like the unreliable one. A session was spent finding that.
//
// Nothing here is enforced. The harness cannot uninstall a copy it does not own;
// it can say which one it is and what differs, which is the whole cost of the bug.
// `environment` rather than a bare PATH string: a default parameter cannot carry
// "there is no PATH", because passing `undefined` is what SELECTS the default.
// The unmeasurable case is the one §3 is about, so it has to be reachable from a
// test, and an env object is the seam that makes it so.
export function shadowInstallNotice(homeDirectory = os.homedir(), pluginRoot = PLUGIN_ROOT,
  environment = process.env, platform = process.platform) {
  const digest = file => {
    try { return createHash('sha256').update(readFileSync(file)).digest('hex') } catch { return null }
  }
  // A forwarder is CURRENT BY CONSTRUCTION: it carries no version and runs the
  // newest installed plugin, so comparing its bytes to the gate it stands in for
  // says the opposite of the truth. Installing forwarders on 2026-08-27 made this
  // notice report twenty files as drifted in the same session that fixed the
  // drift, and it would have said so every session after.
  //
  // A SYMLINK needs no special case, and giving it one was wrong: a link is only
  // as current as what it points at, so a link left on an older version really is
  // behind and worth saying. The digest comparison already answers that — it
  // reads through the link — and a mutation deleting the special case stayed
  // green precisely because it was doing nothing a live link needed.
  const current = target => {
    try { return readFileSync(target, 'utf8').includes(FORWARDER_MARK) } catch { return false }
  }
  const stale = []
  // The scope is SHADOW_SCOPE, shared with sync-standalone.mjs rather than
  // restated here. The two carried separate lists until 2026-09-01, when this
  // notice named a stale `facts-gate-dispatch.sh` under the home `.claude/hooks/`
  // — a wired gate
  // dispatcher running three of five gates — and the repair tool the notice
  // sends people to answered "Nothing to do", because `hooks` was in one list
  // and not the other.
  const wired = wiredInSettings(homeDirectory)
  for (const scope of SHADOW_SCOPE) {
    const shadow = path.join(homeDirectory, '.claude', scope.home)
    let entries = []
    try { entries = readdirSync(shadow) } catch { continue }
    for (const name of entries) {
      // A skill is a directory, so the comparable file is one level down.
      const ours = scope.leaf
        ? path.join(pluginRoot, scope.shipped, name, scope.leaf)
        : path.join(pluginRoot, scope.shipped, name)
      const theirPath = scope.leaf
        ? path.join(shadow, name, scope.leaf)
        : path.join(shadow, name)
      if (!existsSync(ours)) continue
      if (current(theirPath)) continue
      // A hook under the home directory can only answer if the user's own
      // settings name it: this plugin wires its hooks through
      // ${CLAUDE_PLUGIN_ROOT} and never looks there. Reporting one nothing
      // invokes is drift that cannot be acted on, and it was doing exactly that
      // here — two files, every session, both dead.
      if (scope.wired && !wired(name)) continue
      const theirs = digest(theirPath)
      if (theirs && theirs !== digest(ours)) {
        stale.push(path.join('~', '.claude', scope.home, ...(scope.leaf ? [name, scope.leaf] : [name])))
      }
    }
  }
  // A file a PAST installer left that this plugin no longer ships is a different
  // thing from a drifted copy, and the right action differs: a drifted copy is
  // refreshed, an orphan is not ours to touch. ADR-019 decided that naming it is
  // all that ever happens — identification is positive, and anything the three
  // routes cannot answer is counted rather than named, because on a machine
  // holding other tools' files a list of filenames is a list of accusations.
  const found = orphans(homeDirectory, pluginRoot)
  const retired = found.filter(row => row.state === 'ours-orphan')
  const unknown = found.filter(row => row.state === 'unidentified').length
  if (!stale.length && !retired.length) return ''
  const shown = stale.slice(0, 4).join(', ')
  const gates = stale.filter(entry => entry.includes(path.join('.claude', 'bin')))
  const hooks = stale.filter(entry => entry.includes(path.join('.claude', 'hooks')))
  // WHY the stale copy answers is measured, not asserted. Until 2026-09-01 this
  // sentence claimed unconditionally that the home directory is on PATH and the
  // plugin cache is not; reported from a Windows machine where both halves were
  // inverted — the home `.claude/bin` appeared nowhere on PATH and the cache's bin did,
  // so a bare gate name reached the PLUGIN. Read literally the old wording
  // invited deleting the home `.claude/bin`, which after `--link` is the forwarder set
  // that keeps bare names current — the opposite of the repair.
  //
  // `known: false` is rendered as unknown rather than as "not on PATH" (§3): an
  // absent PATH is a look that could not happen.
  const path_ = barePathWinner(homeDirectory, environment?.PATH, platform)
  // Assembled rather than written down: a literal home path may not appear in
  // anything this repository publishes (CLAUDE.md §6).
  const homeBin = path.join('~', '.claude', 'bin')
  const why = []
  if (gates.length) {
    if (!path_.known) {
      why.push('Which copy answers a gate invoked by BARE NAME depends on your PATH, which this '
        + 'session could not read, so compare the two yourself: `type adr-lint`.')
    } else if (path_.winner === 'standalone') {
      why.push('That copy WINS whenever a gate is invoked by bare name: `' + homeBin + '` sits ahead '
        + 'of the plugin cache on this PATH. So if a gate rejects something adr-verify just wrote, '
        + 'or a hook disagrees with the same tool run by hand, the old copy is answering.')
    } else if (path_.winner === 'plugin') {
      why.push('A bare gate name on this PATH reaches the PLUGIN, not that copy — the plugin cache '
        + 'sits ahead of `' + homeBin + '`. The stale copy still answers wherever it is named by its '
        + 'own path.')
    } else {
      why.push('Neither `' + homeBin + '` nor the plugin cache is on this PATH, so a bare gate name '
        + 'reaches no gate of ours at all; the stale copy answers only where it is named by path.')
    }
  }
  if (hooks.length) {
    why.push('The stale hook is wired in your own settings, so it runs alongside the plugin\'s — '
      + 'PATH does not come into it.')
  }
  // Templates were the drift that actually bit, and PATH has nothing to do with
  // it: an ADR authored from a stale adr-template.md is missing headers the
  // current gates require, so the gate reports a malformed record and the author
  // has no way to see they were writing to last month's shape. Reported
  // 2026-08-26 — a standalone template with no Governs:, no
  // **Data dependency:**, no ## Mutation Log and no ## Reachability table.
  if (stale.some(entry => entry.includes(path.join('.claude', 'templates')))) {
    why.push('A record authored from that template is missing headers the gates require, so the '
      + 'gate reports a malformed record and the author cannot see they were writing to last '
      + "month's shape.")
  }
  // Same failure one layer up: a stale SKILL.md instructs an invocation the
  // current gates no longer accept.
  if (stale.some(entry => entry.includes(path.join('.claude', 'skills')))) {
    why.push('A stale SKILL.md instructs an invocation the current gates no longer accept.')
  }
  const orphanSentence = retired.length
    ? `A past installer also left ${retired.length} file(s) here that this plugin NO LONGER SHIPS: `
      + retired.slice(0, 4).map(row =>
        `${path.join('~', '.claude', row.directory, row.name)} (${citeOrphan(row.evidence)})`)
        .join(', ')
      + `${retired.length > 4 ? `, +${retired.length - 4} more` : ''}. `
      + 'The plugin will not remove them — that is your decision, and nothing here writes to your '
      + `home directory.${unknown ? ` ${unknown} further file(s) in those directories could not be `
        + 'identified as ours either way; they are counted rather than named, because a file this '
        + 'plugin cannot prove it wrote may well be another tool\'s.' : ''}`
    : ''
  if (!stale.length) return orphanSentence
  return `Your plugin is up to date. What is behind is a SEPARATE copy of this toolkit under `
    + `your home directory, which the plugin never updates — ${shown}`
    + `${stale.length > 4 ? `, +${stale.length - 4} more` : ''}. `
    + (why.length ? `${why.join(' ')} ` : '')
    + 'To repair, run `node ' + path.join(pluginRoot, 'scripts', 'sync-standalone.mjs') + '`, which '
    + 'reports the same set this notice does and writes only with --apply; `--link` replaces the '
    + 'gates with forwarders no release can leave behind. A file that already carries the '
    + `\`${FORWARDER_MARK}\` line is current by construction and is not named above — do not `
    + `delete it.${orphanSentence ? ` ${orphanSentence}` : ''}`
}

// The plugin that is RUNNING is not always the newest one installed. Claude Code
// can keep serving a cached version across an update and a restart, and the
// session has no way to tell — every gate, skill and template it uses is then
// last week's, silently. Reported 2026-08-26: "even with updated plugin and
// restart claude uses older cache". Comparing version directories is the only
// check that catches it, because a stale copy is internally consistent.
export function staleVersionNotice(pluginRoot = PLUGIN_ROOT, homeDirectory = os.homedir()) {
  const running = /(\d+\.\d+\.\d+)$/.exec(pluginRoot)?.[1]
  if (!running) return ''
  const cache = path.join(homeDirectory, '.claude', 'plugins', 'cache',
    'quality-harness', 'quality-harness')
  let versions = []
  try { versions = readdirSync(cache) } catch { return '' }
  const order = name => {
    const parts = /^(\d+)\.(\d+)\.(\d+)$/.exec(name)
    return parts ? Number(parts[1]) * 1e6 + Number(parts[2]) * 1e3 + Number(parts[3]) : -1
  }
  const newest = versions.filter(name => existsSync(path.join(cache, name, 'scripts', 'lifecycle.mjs')))
    .sort((a, b) => order(b) - order(a))[0]
  if (!newest || order(newest) <= order(running)) return ''
  return `Heads up: this session is running quality-harness ${running}, but ${newest} is installed. `
    + 'Every gate, skill and template it uses is the older one, and a stale copy is internally '
    + 'consistent so nothing else will say so. Restart Claude Code to pick up the newer one.'
}
