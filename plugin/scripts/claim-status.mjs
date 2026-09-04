// claim-status.mjs — one boolean, and the reason it is its own file.
//
// ADR-035's `asserted` arm was withdrawn on 2026-09-04 by the criterion the
// record pre-registered against it (BACKLOG §124, §126). Everything that PRINTS
// a false-success number has to say so, or a structural zero reads as a clean
// measurement — so `claims-rate`, `qh-doctor`, `eval-false-claims` and
// `claims-calibrate` all need this fact.
//
// ⚠ WHY IT IS NOT IN `lifecycle.mjs`, where it started: `qh-doctor` is the
// command someone runs when their install is BROKEN, and importing a 3,300-line
// hook entry point for one boolean means a corrupt or incompatible
// `lifecycle.mjs` stops the diagnostic tool from starting at all. A file that
// declares one constant and imports nothing cannot do that. Raised by the Codex
// review of 0a18d04 as its own finding, and it is right.
//
// ⚠ THIS IS A LABEL, NOT A SWITCH. Setting it to `false` restores no classifier;
// `completionClaim` has none to restore. `tests/claims-rate.test.mjs` asserts
// that the label matches the classifier that actually exists, so a lone edit
// here fails rather than quietly telling every reporter the arm is live.
export const ASSERTION_ARM_WITHDRAWN = true
