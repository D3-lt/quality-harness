# Update

Installing is two lines and rarely goes wrong. Updating is where the silent failures live: a copy
that stayed old, a Desktop registration that never moved, a bare name that reaches last month's
gate. This page is those failures, with the check that catches each.

Measured on 2026-09-04 against plugin 2.64.0 and Claude Code 2.1.260 unless a line says
otherwise.

## When there is one

Releases are tagged on GitHub — <https://github.com/D3-lt/quality-harness/releases> — and every
release bumps `version` in the plugin manifest, which is the only thing Claude Code compares. A
change that does not bump it is not an update, and a bump with nothing shipped is not one either;
the release notes say which happened.

Third-party marketplaces have auto-update **off** by default (Claude Code's documentation), so
nothing fetches a new version for you unless you turn it on under `/plugin` → Marketplaces.

## Update

In a session:

```text
/plugin marketplace update quality-harness
/plugin update quality-harness@quality-harness
```

From a shell:

```bash
claude plugin marketplace update quality-harness
claude plugin update quality-harness@quality-harness
```

The first refreshes the catalogue; the second installs what it now lists. `claude plugin update`
says it itself: **restart required to apply**. In a running session, `/reload-plugins` does the
same, and `/reload-plugins --force` if it warns about the prompt cache.

## Check it took

```bash
claude plugin list          # Version: must be the one you expected
adr-lint --version          # the copy a bare name reaches, with its directory
```

The second line is the one that matters. `Version:` in `plugin list` says what is *installed*;
`adr-lint --version` says what *runs* when you type the name, and on a machine that ever had a
standalone copy the two can differ. Read the path it prints.

## What an update leaves behind

**Every previous version stays on disk.** Claude Code installs the new version beside the old
under `~/.claude/plugins/cache/quality-harness/quality-harness/<version>/` and points
`~/.claude/plugins/installed_plugins.json` at the new one. Measured on this machine on
2026-09-04: sixty-four version directories, 80 MB, after about two weeks of releases.
`claude plugin prune` does not touch them — it removes unused *dependencies*. Deleting every
directory except the one `installed_plugins.json` names is safe; the forwarders below resolve the
newest by reading that file first.

**Forwarders follow; copies do not.** If you created `~/.claude/bin/` entries with
`sync-standalone.mjs --link`, they resolve the newest install at every call and need nothing from
you. If something on the machine wrote *copies* there instead, they are now one release behind
and the session-start notice will say so. Replace them:

```bash
node "$(qh-root)/scripts/sync-standalone.mjs"          # reports, writes nothing
node "$(qh-root)/scripts/sync-standalone.mjs" --link   # replaces each gate with a forwarder
```

Never `--apply`; that writes another copy, stale by the next release.

## Claude Desktop after an update

The Desktop registration in `claude_desktop_config.json` names an absolute path to `qh-mcp`, and
nothing updates that line.

- **Path under the plugin cache** (`.../2.63.0/bin/qh-mcp`): Desktop keeps running 2.63.0,
  silently, until you edit the version in the path and restart Desktop. Ask a gate through the
  client — any tool's output carries the version of the tree it loaded — or run the probe in
  [mcp.md](mcp.md) against the new path first.
- **Path into a git checkout**: Desktop runs whatever is on disk at call time. `git pull` is the
  update. The cost is that it also runs a checkout mid-edit, mid-rebase, or with a mutation
  campaign in flight — a gate with a finding deliberately removed, spawned by a client that cannot
  see the tree. If you develop the plugin on the same machine you use it from Desktop, point
  Desktop at the cache and accept the re-point.

Either way: **restart Desktop.** The config is read at startup, and an unrestarted Desktop looks
exactly like a broken server.

## Records after an update

An update never invalidates evidence. A Verification Log entry binds a run to the **fence it ran**
— date, sha, exit code, a digest of the command — and no gate version appears in it, so a newer
`adr-verify` reads every older entry as it was.

What an update *can* do is report findings on a record that was clean before, because a gate
learned to see something. Read those as the gate improving, not the record regressing. The
findings that fail and the ones that only advise are printed separately;
`node "$(qh-root)/scripts/qh-doctor.mjs"` shows the split for the version you now have. **Never
edit a log to satisfy a new advisory** — re-run on a clean tree, or leave the row and say why.

## Rolling back

`claude plugin install` takes no version argument (its `--help` on 2.1.260 offers none), so there
is no supported pin. Two things that do work:

- **One session on an older cached copy**, without touching the install:

  ```bash
  claude --plugin-dir ~/.claude/plugins/cache/quality-harness/quality-harness/<version>
  ```

  A `--plugin-dir` plugin with the same name as an installed one wins for that session.
- **Report first.** If the new version is wrong about your corpus, the fastest fix is an issue
  with the gate's output pasted in; the project treats "a check people learn to ignore" as worse
  than no check, and a wrong finding is the defect it most wants to hear about.

## Updating a checkout you develop in

`git pull`, then `bash scripts/selftest.sh` before trusting anything, and call every gate by its
working-tree path (`python3 plugin/bin/adr-lint`) — a bare name still reaches the *installed*
release, which after a pull is the older one.
