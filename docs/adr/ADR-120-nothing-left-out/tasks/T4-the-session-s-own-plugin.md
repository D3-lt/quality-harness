# Task ADR-120-T4: Forwarders run the session's own plugin

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** S
**Owner:** Zy
**Produces:** `export QH_PLUGIN_ROOT` in the SessionStart env file, from Node and Go; the resolvers preferring it
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1

## Goal

A home-directory forwarder (`adr-verify`, `adr-lint`, …) runs the plugin copy the session's hooks run, not the newest installed
one, so an older writer and a newer hook no longer meet (BACKLOG §389).

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/plugin-root.test.mjs` | create | the resolver order and the env line, Node and Go (0 locks: new) |
| `plugin/scripts/publish-verdict.mjs` | edit | `offerPublishHook` (:142-162) writes `export QH_PLUGIN_ROOT=…` as its own line, before the git-hook probe and with its own idempotence, so a failed probe or an older `hook.qh-publish-` block (:151-154) does not skip it |
| `core/hooks/orientation.go` | edit | its `offerPublishHook` (:573-579, called at :635) writes the same line the same way, with `pluginRoot()` |
| `plugin/scripts/standalone-link.mjs` | edit | `RESOLVER` (:74-91) prefers `QH_PLUGIN_ROOT`, then `CLAUDE_PLUGIN_ROOT`, each only with `bin/` |
| `plugin/bin/qh-root` | edit | `resolve()` (:79-89) the same order |
| `tests/mutations/plugin/scripts/standalone-link.mjs.json`, `tests/mutations/plugin/bin/qh-root.json`, `tests/mutations/plugin/scripts/publish-verdict.mjs.json` | edit | one entry per mechanism |

## Ordered Steps

1. [S1] Write the failing tests and record the red run: the `RESOLVER` given `QH_PLUGIN_ROOT` naming a copy with `bin/` prints that copy over a newer installed one; one without `bin/` falls through to `CLAUDE_PLUGIN_ROOT`, then to the installed copy; `qh-root` agrees; a SessionStart writes the export once per env file in Node and in Go, including when the env file already holds an older export block and when git's hook probe fails.
2. [S2] Add the export to both writers, as its own line, ahead of and independent of the git-hook export block.
3. [S3] Change both resolvers' order.
4. [S4] Refresh this machine's forwarders with `node plugin/scripts/sync-standalone.mjs --link --apply` (`--link` alone only reports, `sync-standalone.mjs:271-273`), then run one forwarder (`adr-lint --version`) and record which root it ran. The record carries the output with the home directory written as `~` (CLAUDE.md §6). [proof: human: the home directory is outside the repository]
5. [S5] Record a killed mutant per mechanism, with catalogue entries. [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/plugin-root.test.mjs 2>&1) \
  && for n in "a forwarder runs the copy the session names, over a newer installed one" \
      "a named copy without bin falls through, in order" \
      "the session start writes the plugin root once, whatever the git hook probe found" \
      "the Go session start writes the same plugin root line"; do
    test "$(printf '%s\n' "$out" | sed -n 's/^ok [0-9][0-9]* - //p' | grep -cxF -- "$n")" = 1 || exit 1
  done
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a forwarder runs the copy the session names, over a newer installed one` | `tests/plugin-root.test.mjs` | `RESOLVER` and `qh-root` order | — | S1, S3 |
| `a named copy without bin falls through, in order` | `tests/plugin-root.test.mjs` | the fall-through | — | S1, S3 |
| `the session start writes the plugin root once, whatever the git hook probe found` | `tests/plugin-root.test.mjs` | Node: once, with an older block present, with the probe failed | — | S1, S2 |
| `the Go session start writes the same plugin root line` | `tests/plugin-root.test.mjs` | Go's writer, through the built core | — | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the new tests |
| 2 — something selects it | `onSessionStart` and Go's session start call `offerPublishHook`; the forwarders run `RESOLVER` |
| 3 — the caller can discover it | the forwarders `sync-standalone --link --apply` writes |
| 4 — it is used | every bare `adr-verify`/`adr-lint` from a session's Bash |

## Mutation Log

## Invariants

- A shell with neither variable resolves exactly as today.
- The env file is appended to, never rewritten; the git-hook export block is unchanged.

## Risks

- The env file reaches Bash only from the next prompt (`publish-verdict.mjs:134-136`): until then the order is today's.

## Stop Condition

Stop if a SessionStart env file is shared between two sessions running different plugin copies: the export would name the
wrong one, and the design needs a per-session key.

## Out of Scope

- A pointer file keyed by session id (permanent: boundary: rejected in ADR-120's Alternatives; the env file already carries this plugin's exports)

## Verification Log
