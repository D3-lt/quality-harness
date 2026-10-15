// Slice 1 of tests/publish-command.test.mjs, run as its own process when QH_TEST_SHARDED=1 (tests/helpers/shard.mjs); with
// sharding off this file runs nothing, since the file itself then runs every test.
if (process.env.QH_TEST_SHARDED === '1') {
  globalThis.QH_TEST_SHARD = 1
  await import('./publish-command.test.mjs')
}
