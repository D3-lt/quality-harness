// ADR-113 T5: QUALITY_HARNESS_REQUIRE names, comma-separated, the capabilities a CI job installs on purpose (`go`,
// `config-hooks`). Where one is named, a file that would skip for lack of it fails at load instead and says why: a skip in a
// job that was meant to provide the environment is a check that did not run, read as one that passed. Elsewhere the skip
// keeps its reason. QUALITY_HARNESS_REQUIRE_CLI is older and separate (scripts/selftest.sh).
export function required(capability, reason, env = process.env) {
  if (!reason) return reason
  const named = String(env.QUALITY_HARNESS_REQUIRE ?? '').split(',').map(word => word.trim()).filter(Boolean)
  if (named.includes(capability)) throw new Error(`QUALITY_HARNESS_REQUIRE names ${capability}, and it is missing here: ${reason}`)
  return reason
}
