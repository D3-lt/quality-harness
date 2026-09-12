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
  a `.git/`-local cache (`--cached 120`) so it does not spawn `gh` on every prompt — a stale
  answer says how old it is, and an unreadable cache is refreshed rather than trusted.
- **An unchanged `--brief` line is unread.** Reprint it only when the line changed or
  CI is in alarm. SessionStart still prints the full form once. Field 2026-09-12:
  a session skipped the same brief for most of a turn because the content had not
  moved; under the reader rule that skip had to be said and then the reprint itself
  had to stop.
- **The release line NAMES its anchor and points at the check; it does not conclude** (BACKLOG §157).
  `git describe` reads LOCAL refs and `gh release create` tags the remote, so the machine that cuts
  the releases is the one whose anchor goes stale — it printed "a green shipped change is released,
  not parked" over four already-published releases, on every prompt. The count was true and the
  conclusion was false. It now says *"since v2.81.0, the newest tag THIS CLONE holds — … check `gh
  release view` before treating this as unreleased"*.
- ⚠ **A forge lookup was built for this and REMOVED.** It asked `gh release view` and anchored on the
  published release; it worked, and five different-lineage review rounds each found a real defect in
  it — every one in classifying how `gh` can fail (a spent budget, an auth error, a 404 meaning four
  different things, a draft, a release off a divergent branch, a repository not on GitHub, the same
  repository without `gh`). The defect never required the reader to know the published release, only
  to stop claiming it did. **Exact release evidence belongs to `scripts/release-evidence.mjs`**,
  which §13.5 already makes the only answer to "may this be released" and which may take as long as
  it likes. A reader that fires on every prompt may not.
- It **reads**. It blocks nothing, judges nothing about the work, and exits 0 whatever it finds
  (`CLAUDE.md` §3).
- **Could-not-look is said in those words.** An absent `gh`, no network, and a genuinely green
  branch must not look alike — that is ADR-005 applied to this reader, and it is why the "no `gh`"
  arm prints `NOT a green branch; an unknown one` rather than staying quiet. The release line says
  it too: a diff that never ran and one that ran and found nothing were both rendered as SILENCE
  until 2026-09-07, so a spent collection budget read as "nothing to release". `budgeted` marks a
  command it PREVENTED, which is what makes the two distinguishable at all.
- ⚠ **`gh` IS NOT ASKED WHERE `gh` CANNOT ANSWER, and that gate had to be built twice.** Reported
  from outside (GitHub issue #12, BACKLOG §158): on a checkout whose only remote is a self-hosted
  GitLab, `gh run list` took 4,214ms merely to fail, and in a live session it spent the whole
  collection budget — so the HOST killed the hook at 20s and discarded the whole render, including
  the git half. A reader built to end a silence produced one, on every prompt. The discriminator is
  local: `git config --get-regexp '^remote\..*\.url$'`. **And the skip must not speak for a lookup
  that never happened** — that command exits 1 when nothing matched, which is a real answer, while a
  spent budget or an absent git is not. The first fix folded both into "no remote names a GitHub
  host"; `shell` now carries the exit status so the two keep different words.
- **A killed run leaves a cache entry.** `cached` used to write only after `gather` returned, so a
  host kill cached nothing and the next prompt re-paid in full — three consecutive 20s timeouts,
  none cheaper than the last. `collect` checkpoints the git half BEFORE `gh` is attempted, and that
  checkpoint says in its own notes what it does not yet know. A floor, never a clean bill.
- **It reports state, never permission.** `scripts/release-evidence.mjs <sha>` is still the only
  thing that answers "may this sha be released", and this reader deliberately does not restate its
  verdict (§13.4).
- `run` is the seam (`CLAUDE.md` §7): every process goes through it, so every arm — red CI, missing
  `gh`, a run still in flight — is reachable from a test on a host with no network and no remote.
