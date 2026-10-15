// One test file run as several processes: stage 2 of the plan to make the check fast (BACKLOG §378).
//
// `sharded(test, { of: N })` returns a `test` that registers only every Nth top-level test, counted in declaration order, when
// QH_TEST_SHARDED=1; the slice is globalThis.QH_TEST_SHARD (0 for the file itself), which a shard file sets before importing it.
// Unsharded it is `test` itself, so running the file directly, as every acceptance fence does, runs every test. Round robin needs
// no table of times kept beside the suite: the slices are as even as the tests are, and every test is in exactly one.
// The bodies stay where they are, byte for byte: the locks that name them by file still find them (CLAUDE.md §2).
export function sharded(test, { of, env = process.env, shard = globalThis.QH_TEST_SHARD ?? 0 }) {
  if (env.QH_TEST_SHARDED !== '1') return test
  let index = 0
  const slice = (...args) => (index++ % of === shard ? test(...args) : undefined)
  return Object.assign(slice, test)
}
