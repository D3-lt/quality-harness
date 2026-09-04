---
name: operating
description: Operate the harness itself — what is actually installed, whether a home gate is a forwarder or a stale copy, how to verify an upgrade, and how to read a lint finding's severity. Use when a gate behaves unexpectedly, after `claude plugin update`, when a standalone copy may be shadowing the plugin, when deciding whether a finding blocks, or when a session is about to write operating instructions into a project's CLAUDE.md. Do not use for authoring or executing a record — that is `adr-write` and `adr-execute`.
---

# Operating the harness

**Resolving `${CLAUDE_PLUGIN_ROOT}`.** Paths below use it. If it reaches you as
literal text rather than a directory, this skill was loaded under its bare name
from a personal skills directory — which is not a plugin, so the placeholder is
never substituted there. Run `qh-root` and use what it prints in place of it.

**Ask, do not remember.** Everything countable about an install is a command away:

    node "${CLAUDE_PLUGIN_ROOT}/scripts/qh-doctor.mjs"

It prints the resolved root and version, what the plugin ships, every home gate
classified, drift, and the lint's severity split. Exit `0` nothing to act on, `1` a
copy is installed, `2` could not look.

This page holds only what that command cannot print. If you find yourself about to
write a count, a list of skills, or a lint finding's verdict into a project's
instructions — stop, and write the command instead. That habit is the whole of this
page, and it was paid for: an adopting user carried a page of harness instructions
in their global config, and the parts that rotted were exactly the parts that
restated something countable, every one of them making the tool look stricter and
narrower than it is.

## A copy is not a stale forwarder, and the difference decides what you do

- A **forwarder** carries the line `quality-harness-forwarder` and resolves the
  newest installed plugin *at call time*. It is current by construction. **Never
  delete one.** An earlier version of the adopter's own notes advised deleting
  them, and that advice would have broken a working install.
- A **copy** is a real file standing where a forwarder should be — a fork that no
  release ever updates. It is the one state that is a finding, and it is not
  cosmetic: a standalone gate has been measured passing a record the plugin's own
  gate rejected. Repair it with
  `node "${CLAUDE_PLUGIN_ROOT}/scripts/sync-standalone.mjs" --link --apply`.
- **Anything else is `unidentifiable`, and that is an answer, not a gap.** The
  plugin refuses to characterise a file it cannot prove it wrote (ADR-019). Another
  tool's binary living in the same directory is not yours to touch.

Delete a home entry only when `grep -q quality-harness-forwarder` **fails** on it
*and* you know what wrote it.

## Verifying an upgrade: ask the gate you are about to trust

`claude plugin update` prints "Restart to apply changes", and a session that keeps
invoking gates by bare name goes on running the old build with no warning.

**Ask the gate itself.** Every gate answers `--version` with the version of the tree
IT was loaded from, read from the manifest beside it:

    $ adr-lint --version
    adr-lint 2.63.0 (/Users/you/.claude/plugins/cache/quality-harness/quality-harness/2.63.0)

Ask the gate whose output you are questioning, not a resolver. `qh-root` and
`qh-doctor` answer "which copy is newest on this machine" — a different question,
and on a machine where both PATH mechanisms are present it can be a different
install from the one that just ran. That is why each gate answers for itself, and
why two gates disagreeing is a finding rather than a glitch (ADR-031).

Two calls still earn their place when the answer surprises you:

1. `which <gate>` — a forwarder means current by construction; a real file under a
   version directory is pinned to whatever was installed when the session started,
   and needs `/reload-plugins`.
2. `node "${CLAUDE_PLUGIN_ROOT}/scripts/qh-doctor.mjs"` — the fuller inventory:
   what is installed, and how many findings block versus advise.

⚠ This section used to open "Verifying an upgrade takes three calls, because no
gate answers `--version`", and its third step was to run a gate against a real
record and diff the output against the bare name. That was true until 2026-09-04
and is the workaround GitHub issue #9's adopter had to invent. ADR-031 removed the
need for it.

## Severity is a word, and the word is checkable

`errors.append(...)` fails the lint. `errors.advise(...)` does not. "The gate
complained" and "the gate refused" are different statements, and the split moves
between releases — `qh-doctor` prints the current one. Never quote it from memory,
and never harden it in prose: instructing an agent that advice is a blocker trains
it to stop on findings the gate deliberately softened.

## The template is authoritative, and any restatement of it is already losing

Out of Scope dispositions, permanent bases, citation forms, the section list — all
of it lives in `${CLAUDE_PLUGIN_ROOT}/templates/adr-template.md`. Read that file.
A summary of it in a project's instructions will be narrower than the real
vocabulary, and the cost is silent: forms nobody knows exist are forms nobody
writes, so a shipped capability goes unused because the only document its author
reads never mentioned it.

## What belongs in a project's own instructions

Only what is true of that project and false elsewhere: when a record is required,
path conventions, house thresholds, how this composes with the rest of their stack.
The test is one sentence — *would this still be true in a repository that shares no
code with ours?* If yes, it belongs here or in `qh-doctor`, not in their config.
