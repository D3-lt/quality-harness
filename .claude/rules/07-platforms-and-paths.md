---
paths:
  - "tests/**"
  - "plugin/bin/**"
  - "plugin/scripts/**"
  - "scripts/**"
  - ".gitattributes"
  - ".github/**"
---

# Why §7: platforms, and paths are where they differ

The rules are in `CLAUDE.md` §7. This file is the evidence behind them.

Every rule was paid for by a defect that was invisible on the developer's machine and red on
somebody else's — and the single largest class, the one that keeps recurring, is **a path literal
that was secretly an assertion about the operating system.**

## The ones that actually happened

| what was written | why it was wrong | where it broke |
|---|---|---|
| `docs\/adr\/` in a test regex | `/` is not the separator everywhere | Windows |
| a mutation whose `from` ended in `\n` | the file had no `text eol=lf` attribute, so it was checked out CRLF and matched **nothing** | Windows |
| `PATH: '/nonexistent'` in a test env | means nothing on Windows; the interpreter never started and the test died on `JSON.parse(undefined)` rather than on its property | Windows |
| `".." in pointer.split("/")` | a traversal spelled `..\dir\file` reached neither branch, so a guard **passed while doing nothing** | Windows |
| `block.replace(str(Path.home()), "~")` | `Path.home()` returns `C:\Users\Name` while a Node stack trace in the same output prints forward slashes — so the redaction missed on the one platform CI runs and a laptop cannot | Windows |
| `chmodSync(dir, 0o000)` as a test fixture | no POSIX permission bits on a Git for Windows checkout, so the directory stayed listable and the test asserted nothing there (2026-09-04) | Windows |

## Paths and traversal

- `split("/")` is blind to `..\dir`. Convert first, then split; a containment or traversal guard
  that skips this is a guard that reports safety it never checked.
- `C:\x`, `C:/x` and `/x` are all absolute; a check for only one of them is a check for none.
- Build with `path.join` / `Path`, and where a test needs the repository-relative form, derive it
  (`relative(a, b).split(sep).join('/')`) rather than typing it.
- Windows and macOS are case-insensitive by default; Linux is not. A comparison that must hold
  everywhere is case-insensitive on the first two and exact on Linux — a parameter, not an
  assumption.
- `/tmp` is a symlink to `/private/tmp` on macOS. A temp path you created and one the OS hands back
  can compare unequal. Resolve before comparing.

## Line endings are a path problem in disguise

`.gitattributes` decides what git puts on disk. Any file whose CONTENT you match across a line
boundary needs `text eol=lf`, or the match silently finds nothing on Windows only. The gates need it
because the Windows job executes them; `.gitignore` and `.gitattributes` need it because mutations
match across their lines. **A test asserts this by asking `git check-attr`**, never by reading the
file — what matters is the answer git gives for the path.

## Executing things

- The gates are `#!/usr/bin/env python3` scripts. **Windows cannot exec them**: a direct spawn
  returns status `null`, which is not an error and not a failure. Spawn through the interpreter.
- Git Bash resolution must exclude the `System32` WSL stub and the WindowsApps launcher — both are
  named `bash` and neither is one. Both are filtered, at both sites, by one pattern:
  `[\\/](?:system32|windowsapps)[\\/]?$` in `resolve_bash()` (`plugin/bin/adr-verify`) and in
  `resolveBashExecutable` (`plugin/scripts/run-shell-hook.mjs`). **What makes that sentence usable
  is not this file — it is `tests/gates.test.mjs` and `tests/lifecycle.test.mjs`, which drive each
  resolver through its `(platform, env, exists)` seam on the PATH BACKLOG §91 measured and assert
  the real `ProgramFiles\Git` answer comes back.** Each also asserts a `WindowsAppsX` directory is
  NOT filtered, so the guard is shown capable of the other answer. Re-run those, not this paragraph.

  This entry has been wrong in both directions, which is the part to keep. It first read
  "`resolve_bash()` does this; do not reimplement it" — false for the WindowsApps half from the day
  it was written, and measured false on Windows 11 on 2026-08-30 (BACKLOG §91). It was then
  rewritten to say the hole was open, and went stale the other way when §91 landed: on 2026-09-01 a
  session read it as a live defect and re-derived the whole thing before executing the resolvers and
  finding them already correct. **A rule that asserts a guard handles a case is a hypothesis until
  something executes it.**
- `PATH` differs in separator (`:` vs `;`), in resolution (`which` vs `where`), and in what an
  invalid value does. To test "the tool is absent", empty `PATH` rather than pointing it somewhere
  that only looks absent on your machine.
- A Git for Windows checkout has **no POSIX permission bits** — `statSync` reports the same mode for
  everything. What ships is the mode in git's index, so ask `git ls-files -s`.
- A skip that says why is the honest form when a fixture cannot be built on a platform:
  `{ skip: process.platform === 'win32' ? '<reason>' : false }`. Measure it first — on 2026-09-04 a
  directory-symlink skip added by analogy turned out to remove a test that passed on the Windows
  runner. Split a test so its portable half keeps running.

## The rule that makes all of this testable

**Make the platform a parameter.** `resolve_bash(platform=…)`, `redact_home(block, home=…,
platform=…)`, `leaves_the_tree(pointer)` normalizing both separators everywhere — each one turns
"reachable only on Windows" into "reachable from anywhere". A Windows-only branch with no injectable
seam is a branch with no test, and you will find out in CI at best.

You cannot run Windows locally: `windows-latest` is a VM, not a container, and Docker Desktop on
macOS is a Linux VM with no Windows container mode. So the seam is not a nicety — it is the only way
this code gets tested before it is pushed. When the Windows log is minutes away, wait for it rather
than guessing at the platform difference.
