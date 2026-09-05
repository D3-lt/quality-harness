# Why §15: ask what CI says about this branch before you plan anything on it

The rule is in `CLAUDE.md` §15. This file is the evidence behind it, and it is one incident.

**2026-09-04.** The CI coverage job went red on `main` at 17:20, on `d7a764b`, and stayed red. Four
hours later a session was asked to cut a release. It ran `bash scripts/selftest.sh`, read exit 0,
and reported that ten unreleased plugin commits made a release warranted. Both statements were
true. The branch was red the whole time.

Nothing lied and no gate failed. `selftest.sh` and the CI `coverage floor` job are different checks;
a green one says nothing about the other. What was missing was that **nobody asked**, because a
local green feels like an answer and nothing in the session said otherwise. The same run also
carried a `GREEN` mutation survivor — a second CI signal, reporting correctly, unread (BACKLOG
§126).

So the fix is not another gate. It is the agentsmemory wake-up pattern pointed at the repository:
state the facts a session would otherwise assume, once, unprompted, at the start.

```bash
node plugin/scripts/branch-state.mjs      # branch, dirt, ahead, CI verdict, unreleased plugin change
```

- Wired as **both** a `SessionStart` and a `UserPromptSubmit` hook in the plugin's `hooks.json` (it
  ships with the plugin since 2.75.0, so every adopter gets it; this repository gets it through the
  installed plugin and keeps no copy of its own), so
  it costs no discipline. ⚠ `SessionStart` ALONE IS NOT ENOUGH and that was measured the moment it
  shipped: it fires when a session begins, so the session already running — the one about to plan a
  release on a red branch — never sees it, and one message at the very start is the message a
  session has the least reason to act on. agentsmemory is visible because it hooks
  `UserPromptSubmit` too; this now does the same. The per-message form is ONE LINE WHILE GREEN
  (`--brief`; an alarm adds a second line rather than dropping the failing job names) and reads a
  reads a `.git/`-local cache (`--cached 120`) so it does not spawn `gh` on every prompt — a stale
  answer says how old it is, and an unreadable cache is refreshed rather than trusted.
- It **reads**. It blocks nothing, judges nothing about the work, and exits 0 whatever it finds
  (`CLAUDE.md` §3).
- It **reads**. It blocks nothing, judges nothing about the work, and exits 0 whatever it finds
  (`CLAUDE.md` §3).
- **Could-not-look is said in those words.** An absent `gh`, no network, and a genuinely green
  branch must not look alike — that is ADR-005 applied to this reader, and it is why the "no `gh`"
  arm prints `NOT a green branch; an unknown one` rather than staying quiet.
- **It reports state, never permission.** `scripts/release-evidence.mjs <sha>` is still the only
  thing that answers "may this sha be released", and this reader deliberately does not restate its
  verdict (§13.4).
- `run` is the seam (`CLAUDE.md` §7): every process goes through it, so every arm — red CI, missing
  `gh`, a run still in flight — is reachable from a test on a host with no network and no remote.
