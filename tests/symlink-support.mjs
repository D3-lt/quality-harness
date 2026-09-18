// Creating a symlink on Windows needs SeCreateSymbolicLinkPrivilege, which an
// ordinary account does not have: Developer Mode off, shell not elevated,
// `AllowDevelopmentWithoutDevLicense = 0`, and `fs.symlinkSync` is EPERM -4048.
// That is the DEFAULT configuration, not an exotic one — GitHub's windows-latest
// runner holds the privilege, so CI can never see it.
//
// Measured 2026-09-18 by a Windows 11 Pro (26200) session running this suite:
// 1,141 of 1,168 passed and every one of the 6 failures was this, in four files,
// while three other tests already skipped it with a stated reason. The fix was
// never a missing guard — it was a guard applied inconsistently.
//
// Two repairs, and which is right depends on what the test needs:
//
//   linkDirectory  — a DIRECTORY link. A junction satisfies it and needs no
//                    privilege at all, so the test RUNS on Windows instead of
//                    being skipped. tests/event-analyser.test.mjs already does
//                    this; that is why it passes on the same account.
//   symlinkOrSkip  — a FILE link, or a deliberately dangling one, where only a
//                    real symlink will do. Skip with the reason said out loud,
//                    never fail as though the gate had answered (CLAUDE.md §3:
//                    could-not-look is its own verdict, never a finding).
import { symlinkSync } from 'node:fs'

/** Link a directory: a junction on Windows, an ordinary directory symlink elsewhere. */
export function linkDirectory(target, link) {
  symlinkSync(target, link, process.platform === 'win32' ? 'junction' : 'dir')
}

/**
 * Create a symlink, or skip this test saying why it could not be built here.
 * Returns false when it skipped, so the caller returns rather than asserting on
 * a fixture that does not exist.
 */
export function symlinkOrSkip(t, target, link, type) {
  try {
    symlinkSync(target, link, type)
    return true
  } catch (error) {
    if (process.platform === 'win32' && error?.code === 'EPERM') {
      t.skip('symlink is EPERM for this account (Windows without Developer Mode or an '
        + `elevated shell), so the symlink arm cannot be built here: ${error.message}`)
      return false
    }
    throw error
  }
}
