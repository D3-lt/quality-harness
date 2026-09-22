// What a test that spawns the hooks puts in their environment.
//
// ⚠ A HOOK THAT TAKES LONGER THAN QUALITY_HARNESS_SLOW_HOOK_MS SAYS SO — "the
// PreToolUse hook took 6.0s — the pause has this name" — and that is the product
// working. It is also a line of output, and a test asserting that a hook was SILENT
// then fails on any runner slow enough to cross the threshold. It did: run
// 35439248428, Windows, in a scripted-session test about completion advisories,
// over a commit that had changed nothing on that path. A test that passes only on
// a fast machine is asserting the machine.
//
// So every test about something OTHER than the slow-hook notice switches the notice
// off for the hooks it spawns. The notice has its own test
// (tests/lifecycle.test.mjs, which sets the threshold to 0 to force it).
export const SLOW_HOOK_OFF = String(24 * 60 * 60 * 1000)
