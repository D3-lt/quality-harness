// A local, untracked copy with the same name as a tracked test file. The
// fixture's .gitignore ignores this directory, so git never lists it; a Tests
// row naming `lib_tests.rs` must resolve to tests/lib_tests.rs through git, not
// be made ambiguous by what happens to be on the disk (BACKLOG §281 item 4).
