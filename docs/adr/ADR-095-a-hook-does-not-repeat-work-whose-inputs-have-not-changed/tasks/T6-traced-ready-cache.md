# Task ADR-095-T6: the ready-task lines come from a cache whose key is what the gate actually read

**Depends-on:** T1
**Covers:** none — no spec
**Estimated scope:** L (a tracing wrapper, a manifest checker, two callers, tests, a mutant per kind of dependency)
**Owner:** unassigned
**Produces:** `readyCache(root, listing, options)` and `plugin/lib/trace_run.py` — the gate run under a recorder, and a manifest that must still hold for an answer to be reused
**Consumes:** `scripts/hook-cost.mjs --json` (T1)
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `a manifest holds every kind of dependency the gate read`, `a cache that cannot be used is a miss`, `a run during which a dependency changed is not stored`

## Goal

A SessionStart in a corpus whose task directories have not changed starts no `adr-next`, and the answer it gives is one the gate would give again: the cache stores, with each answer, a manifest of everything the gate read while making it (files, directory listings, paths it stat-ed, git commands and their output, the interpreter), and reuses the answer only while every entry of the manifest still holds.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/lib/trace_run.py` | add | runs the gate under a recorder: an audit hook for file opens, directory listings and subprocesses, and a wrapper on `os.stat`/`os.lstat`; writes the manifest and passes the gate's stdout, stderr and exit through |
| `plugin/scripts/ready-cache.mjs` | add | `readyCache`: the lookup key (gate path, directory, working directory, local date, the environment the gate can see), the run under the recorder, the manifest, its validation (re-hash, re-list, re-stat, re-run the recorded git commands and compare their output), the stability check, the atomic store, the cap on entries |
| `plugin/scripts/ready-lines.mjs` | edit | `readyTaskLines` takes the cache as an optional argument, consults it before `spawnGate` and runs the traced gate on a miss; the result carries `cacheProblem` |
| `plugin/scripts/session-orientation.mjs` | edit | passes `readyCache(root, listing)` and says `cacheProblem` once, as a standing paragraph |
| `plugin/scripts/session-notes.mjs` | edit | the PreCompact note passes the same cache |
| `tests/ready-cache.test.mjs` | add | five tests |
| `tests/mutations/plugin/scripts/ready-cache.mjs.json` | add | one entry per kind of dependency and per `Rests-on` name |
| `tests/mutations/plugin/lib/trace_run.py.json` | add | one entry per kind the recorder must record |

## Ordered Steps

1. [S1] Write the five tests of the Tests table and record the red run (TDD red).
2. [S2] Write `trace_run.py` and show, on the real gate, what it records for one task directory: print the manifest's counts per kind and put them in the sign-off [proof: human: the manifest of a real gate run holds files, listings, stats and git commands, and no standard-library file].
3. [S3] Write `readyCache` (key, run, validate, store) and wire it into `readyTaskLines` and the two callers. Every failure to run, read, hash, parse or write is a miss, said once; a miss runs the traced gate and returns its answer unchanged.
4. [S4] Measure with T1 on a clone of this repository and put the first and second SessionStart (children, milliseconds, and the milliseconds of the validation alone) in the sign-off [proof: human: the second start starts no `adr-next` and the validation costs under 150 ms].
5. [S5] Record one killed mutant per kind of dependency (a file's bytes, a file outside the corpus, a directory listing, a stat-ed path, a git command's output, the date, the interpreter) and per `Rests-on` name. [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/ready-cache.test.mjs 2>&1) \
  && for t in 'a second start in an unchanged corpus starts no adr-next and says the same lines' 'a manifest holds every kind of dependency the gate read, and each changes the answer when it changes' 'a cache that cannot be read, written or parsed is a miss, said once, and never an empty answer' 'a run during which a dependency changed is not stored' 'the recorder records what the gate read and leaves the standard library out'; do test "$(printf '%s\n' "$out" | grep -cxE "ok [0-9]+ - $t")" = 1 || exit 1; done
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a second start in an unchanged corpus starts no adr-next and says the same lines` | `tests/ready-cache.test.mjs` | two SessionStart runs against a fixture corpus: the second has zero `adr-next` children and its ready lines equal the first's, byte for byte; and through the real hook program in a corpus nothing has started yet | none | S1, S3 |
| `a manifest holds every kind of dependency the gate read, and each changes the answer when it changes` | `tests/ready-cache.test.mjs` | the dirty twins, each followed by a fresh answer that reflects it: a task file; the owning record; another record's task; a test file a Tests table names, outside the corpus; the project's `.quality-harness.json` check; an empty directory beside the tasks; a file git newly lists; and the local date | none | S1, S2, S3 |
| `a cache that cannot be read, written or parsed is a miss, said once, and never an empty answer` | `tests/ready-cache.test.mjs` | an unreadable entry, a corrupt entry, a forged entry, a state directory that is a file, and a link inside the corpus each run the gate and print its lines; the could-not-use note appears once | none | S1, S3 |
| `a run during which a dependency changed is not stored` | `tests/ready-cache.test.mjs` | a gate run that edits a file it has read is answered but not kept, so a later start with the edited file does not find an answer made from the old one | none | S1, S3 |
| `the recorder records what the gate read and leaves the standard library out` | `tests/ready-cache.test.mjs` | the manifest of a fixture gate lists the files it opened, the directories it listed, the paths it stat-ed (present and absent) and the git commands it ran, and none of the interpreter's own modules | none | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the five tests |
| 2 — something selects it | `readyTaskLines` consults the cache before the gate; removing the lookup turns the first test red |
| 3 — the caller can discover it | n/a: no declared interface |
| 4 — it is used | the second-start measurement of S4, and the outside run |

## Mutation Log
- 2026-10-11 · 7afd854f* · mutant killed · exit 1 · `plugin/scripts/ready-cache.mjs` · does not re-hash a file the gate read, so an edited record is answered from the old entry · acceptance-sha256:82b02c63612752e6ad9a98a953f22f10369fb3e2977063fb81bdd585f54de473 · covers:a manifest holds every kind of dependency the gate read
- 2026-10-11 · 7afd854f* · mutant killed · exit 1 · `plugin/scripts/ready-cache.mjs` · does not re-list a directory the gate listed, so an empty directory beside the tasks is invisible · acceptance-sha256:82b02c63612752e6ad9a98a953f22f10369fb3e2977063fb81bdd585f54de473 · covers:a manifest holds every kind of dependency the gate read
- 2026-10-11 · 7afd854f* · mutant survived · exit 0 · `plugin/scripts/ready-cache.mjs` · does not re-stat a path the gate asked about, so a file that appears where there was none is invisible · acceptance-sha256:82b02c63612752e6ad9a98a953f22f10369fb3e2977063fb81bdd585f54de473 · covers:a manifest holds every kind of dependency the gate read
  ```
  the fence passed with the mechanism broken; it may not materialize, compile, load, or assert on the changed path
  ```
- 2026-10-11 · 7afd854f* · mutant killed · exit 1 · `plugin/scripts/ready-cache.mjs` · does not check the interpreter that ran the gate · acceptance-sha256:82b02c63612752e6ad9a98a953f22f10369fb3e2977063fb81bdd585f54de473 · covers:a manifest holds every kind of dependency the gate read
- 2026-10-11 · 7afd854f* · mutant killed · exit 1 · `plugin/scripts/ready-cache.mjs` · does not re-stat a path the gate asked about, so a file that appears where there was none is invisible · acceptance-sha256:82b02c63612752e6ad9a98a953f22f10369fb3e2977063fb81bdd585f54de473 · covers:a manifest holds every kind of dependency the gate read
- 2026-10-11 · 7afd854f* · mutant killed · exit 1 · `plugin/scripts/ready-cache.mjs` · does not re-run a command the gate ran, so a change git alone reports is invisible · acceptance-sha256:82b02c63612752e6ad9a98a953f22f10369fb3e2977063fb81bdd585f54de473 · covers:a manifest holds every kind of dependency the gate read
- 2026-10-11 · 7afd854f* · mutant killed · exit 1 · `plugin/scripts/ready-cache.mjs` · leaves the local date out of the key, so a log row dated ahead is judged against yesterday · acceptance-sha256:82b02c63612752e6ad9a98a953f22f10369fb3e2977063fb81bdd585f54de473 · covers:a manifest holds every kind of dependency the gate read
- 2026-10-11 · 7afd854f* · mutant killed · exit 1 · `plugin/scripts/ready-cache.mjs` · leaves the environment out of the key, so another HOME or GIT_ variable is answered from the old entry · acceptance-sha256:82b02c63612752e6ad9a98a953f22f10369fb3e2977063fb81bdd585f54de473 · covers:a manifest holds every kind of dependency the gate read
- 2026-10-11 · 7afd854f* · mutant killed · exit 1 · `plugin/scripts/ready-cache.mjs` · stores an answer made while a file it read changed · acceptance-sha256:82b02c63612752e6ad9a98a953f22f10369fb3e2977063fb81bdd585f54de473 · covers:a manifest holds every kind of dependency the gate read
- 2026-10-11 · 7afd854f* · mutant killed · exit 1 · `plugin/scripts/ready-cache.mjs` · drops a file the gate tried to open that was absent, so creating it is invisible · acceptance-sha256:82b02c63612752e6ad9a98a953f22f10369fb3e2977063fb81bdd585f54de473 · covers:a manifest holds every kind of dependency the gate read
- 2026-10-11 · 7afd854f* · mutant killed · exit 1 · `plugin/lib/trace_run.py` · does not record the modules the gate imported, so an edited helper is answered from its compiled copy · acceptance-sha256:82b02c63612752e6ad9a98a953f22f10369fb3e2977063fb81bdd585f54de473 · covers:a manifest holds every kind of dependency the gate read
- 2026-10-11 · 7afd854f* · mutant killed · exit 1 · `plugin/scripts/ready-cache.mjs` · reads a corrupt entry as an empty answer · acceptance-sha256:82b02c63612752e6ad9a98a953f22f10369fb3e2977063fb81bdd585f54de473 · covers:a cache that cannot be used is a miss
- 2026-10-11 · 7afd854f* · mutant killed · exit 1 · `plugin/scripts/ready-cache.mjs` · stores an answer made while a file it read changed · acceptance-sha256:82b02c63612752e6ad9a98a953f22f10369fb3e2977063fb81bdd585f54de473 · covers:a run during which a dependency changed is not stored
- 2026-10-11 · 7afd854f* · mutant killed · exit 1 · `plugin/lib/trace_run.py` · does not record the files the gate opens · acceptance-sha256:82b02c63612752e6ad9a98a953f22f10369fb3e2977063fb81bdd585f54de473 · covers:a manifest holds every kind of dependency the gate read
- 2026-10-11 · 7afd854f* · mutant killed · exit 1 · `plugin/lib/trace_run.py` · does not record the directories the gate lists · acceptance-sha256:82b02c63612752e6ad9a98a953f22f10369fb3e2977063fb81bdd585f54de473 · covers:a manifest holds every kind of dependency the gate read
- 2026-10-11 · 7afd854f* · mutant killed · exit 1 · `plugin/lib/trace_run.py` · does not record the commands the gate starts · acceptance-sha256:82b02c63612752e6ad9a98a953f22f10369fb3e2977063fb81bdd585f54de473 · covers:a manifest holds every kind of dependency the gate read
- 2026-10-11 · 7afd854f* · mutant survived · exit 0 · `plugin/lib/trace_run.py` · does not wrap the os.path predicates, so a path asked about by exists() is not recorded · acceptance-sha256:82b02c63612752e6ad9a98a953f22f10369fb3e2977063fb81bdd585f54de473 · covers:a manifest holds every kind of dependency the gate read
  ```
  the fence passed with the mechanism broken; it may not materialize, compile, load, or assert on the changed path
  ```
- 2026-10-11 · 7afd854f* · mutant survived · exit 0 · `plugin/lib/trace_run.py` · does not wrap os.stat or os.lstat · acceptance-sha256:82b02c63612752e6ad9a98a953f22f10369fb3e2977063fb81bdd585f54de473 · covers:a manifest holds every kind of dependency the gate read
  ```
  the fence passed with the mechanism broken; it may not materialize, compile, load, or assert on the changed path
  ```
- 2026-10-11 · 7afd854f* · mutant killed · exit 1 · `plugin/lib/trace_run.py` · does not name the interpreter's own prefixes, so the standard library is recorded as read · acceptance-sha256:82b02c63612752e6ad9a98a953f22f10369fb3e2977063fb81bdd585f54de473 · covers:a manifest holds every kind of dependency the gate read
- 2026-10-11 · 7afd854f* · mutant killed · exit 1 · `plugin/lib/trace_run.py` · does not wrap os.stat or os.lstat, so a path a gate stats directly or through pathlib is not recorded · acceptance-sha256:82b02c63612752e6ad9a98a953f22f10369fb3e2977063fb81bdd585f54de473 · covers:a manifest holds every kind of dependency the gate read

## Invariants

- The lines a hit yields are byte-identical to an uncached run's (ADR-040, ADR-094).
- A failure of the cache is a run of `adr-next`, never an empty list of tasks (CLAUDE.md §16, ADR-005).
- Nothing is enumerated by hand: a dependency is what the recorder saw, so a new read in the gate is a dependency without an edit here.
- `adr-next` is unchanged.

## Risks

- A read the recorder cannot see (a C-level call that bypasses `os.stat`, a read through a file descriptor passed in): the manifest is a floor, and the stability check and the date in the key are the rest; the review of this task asks for such a read.

## Stop Condition

Stop and ask if the recorder is found not to see a kind of read the gate makes, or if validating a manifest costs more than a quarter of running the gate.

## Out of Scope

- Running the misses concurrently (deferred: docs/BACKLOG.md §378)

## Verification Log
- 2026-10-11 · 7afd854f* · exit 1 · `out=$(node --test --test-reporter=tap tests/ready-cache.test.mjs 2>&1) \ …` · acceptance-sha256:82b02c63612752e6ad9a98a953f22f10369fb3e2977063fb81bdd585f54de473 · ms:313 · test-lock-sha256:44b781da73baa2e36b85839a9054434c6da307afb5e8fbacdfbc203fb70c6ade · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvcmVhZHktY2FjaGUudGVzdC5tanMJYSBjYWNoZSB0aGF0IGNhbm5vdCBiZSByZWFkLCB3cml0dGVuIG9yIHBhcnNlZCBpcyBhIG1pc3MsIHNhaWQgb25jZSwgYW5kIG5ldmVyIGFuIGVtcHR5IGFuc3dlcgkzZmQyYWZhOWZiMDU4ZWM2MDNhMzBlNGJiYmY3ZmRkM2I1ZDA4MTg2NzFkYzg5NGJlZWY5NzE0Mjg5YzQ5YzI5CmJvZHkJdGVzdHMvcmVhZHktY2FjaGUudGVzdC5tanMJYSBtYW5pZmVzdCBob2xkcyBldmVyeSBraW5kIG9mIGRlcGVuZGVuY3kgdGhlIGdhdGUgcmVhZCwgYW5kIGVhY2ggY2hhbmdlcyB0aGUgYW5zd2VyIHdoZW4gaXQgY2hhbmdlcwliNWJiMzVmNzMxZTNkYWEwOTgzZWJmNzdkODZhM2Y2MzA1NDFjYjM3OTZkYzQ1ZDRmNGM5MzcyZDQ5ODI4MzRlCmJvZHkJdGVzdHMvcmVhZHktY2FjaGUudGVzdC5tanMJYSBydW4gZHVyaW5nIHdoaWNoIGEgZGVwZW5kZW5jeSBjaGFuZ2VkIGlzIG5vdCBzdG9yZWQJOTM5MGJlNzU4Mjc3M2Q0NDAyNDJjYWE3YjA1YjI0MGRmNzVkMTg5MzA3ZDIyNTkzNzFjY2ZjNmY3MjgyMmNmMwpib2R5CXRlc3RzL3JlYWR5LWNhY2hlLnRlc3QubWpzCWEgc2Vjb25kIHN0YXJ0IGluIGFuIHVuY2hhbmdlZCBjb3JwdXMgc3RhcnRzIG5vIGFkci1uZXh0IGFuZCBzYXlzIHRoZSBzYW1lIGxpbmVzCTRhZWVkY2ExMDBhODY1Nzg0YzdmZGMzMDFjZDE1Zjc4OTNlM2VjNThhZTMwMTY3NGMyNDk5ZWNlNzNiNjk3ZDIKYm9keQl0ZXN0cy9yZWFkeS1jYWNoZS50ZXN0Lm1qcwl0aGUgcmVjb3JkZXIgcmVjb3JkcyB3aGF0IHRoZSBnYXRlIHJlYWQgYW5kIGxlYXZlcyB0aGUgc3RhbmRhcmQgbGlicmFyeSBvdXQJZWY5MjNkNjFhZjM5OTczZjFhODBkYzUwYTZiZTY4YjcyMjQ3OWE1ZTdlNzY3YWM3OWVhMTJkMmE5MzhmMDNkOQ
  ```
  ```
- 2026-10-11 · 7afd854f* · exit 0 · `out=$(node --test --test-reporter=tap tests/ready-cache.test.mjs 2>&1) \ …` · acceptance-sha256:82b02c63612752e6ad9a98a953f22f10369fb3e2977063fb81bdd585f54de473 · ms:4930
- 2026-10-11 · 7afd854f* · exit 0 · `out=$(node --test --test-reporter=tap tests/ready-cache.test.mjs 2>&1) \ …` · acceptance-sha256:82b02c63612752e6ad9a98a953f22f10369fb3e2977063fb81bdd585f54de473 · ms:5036
- 2026-10-11 · 7afd854f* · exit 0 · `out=$(node --test --test-reporter=tap tests/ready-cache.test.mjs 2>&1) \ …` · acceptance-sha256:82b02c63612752e6ad9a98a953f22f10369fb3e2977063fb81bdd585f54de473 · ms:4852
- 2026-10-11 · 7afd854f* · exit 0 · `out=$(node --test --test-reporter=tap tests/ready-cache.test.mjs 2>&1) \ …` · acceptance-sha256:82b02c63612752e6ad9a98a953f22f10369fb3e2977063fb81bdd585f54de473 · ms:4783
- 2026-10-11 · 7afd854f* · exit 0 · `out=$(node --test --test-reporter=tap tests/ready-cache.test.mjs 2>&1) \ …` · acceptance-sha256:82b02c63612752e6ad9a98a953f22f10369fb3e2977063fb81bdd585f54de473 · ms:5653
- 2026-10-11 · 7afd854f* · exit 0 · `out=$(node --test --test-reporter=tap tests/ready-cache.test.mjs 2>&1) \ …` · acceptance-sha256:82b02c63612752e6ad9a98a953f22f10369fb3e2977063fb81bdd585f54de473 · ms:4962
- 2026-10-11 · 7afd854f* · exit 0 · `out=$(node --test --test-reporter=tap tests/ready-cache.test.mjs 2>&1) \ …` · acceptance-sha256:82b02c63612752e6ad9a98a953f22f10369fb3e2977063fb81bdd585f54de473 · ms:5417
- 2026-10-11 · 7afd854f* · exit 0 · `out=$(node --test --test-reporter=tap tests/ready-cache.test.mjs 2>&1) \ …` · acceptance-sha256:82b02c63612752e6ad9a98a953f22f10369fb3e2977063fb81bdd585f54de473 · ms:5199
- 2026-10-11 · 7afd854f* · exit 0 · `out=$(node --test --test-reporter=tap tests/ready-cache.test.mjs 2>&1) \ …` · acceptance-sha256:82b02c63612752e6ad9a98a953f22f10369fb3e2977063fb81bdd585f54de473 · ms:4685
- 2026-10-11 · 7afd854f* · exit 0 · `out=$(node --test --test-reporter=tap tests/ready-cache.test.mjs 2>&1) \ …` · acceptance-sha256:82b02c63612752e6ad9a98a953f22f10369fb3e2977063fb81bdd585f54de473 · ms:4824
- 2026-10-11 · 7afd854f* · exit 0 · `out=$(node --test --test-reporter=tap tests/ready-cache.test.mjs 2>&1) \ …` · acceptance-sha256:82b02c63612752e6ad9a98a953f22f10369fb3e2977063fb81bdd585f54de473 · ms:4698
- 2026-10-11 · 7afd854f* · exit 0 · `out=$(node --test --test-reporter=tap tests/ready-cache.test.mjs 2>&1) \ …` · acceptance-sha256:82b02c63612752e6ad9a98a953f22f10369fb3e2977063fb81bdd585f54de473 · ms:4920
- 2026-10-11 · 7afd854f* · exit 0 · `out=$(node --test --test-reporter=tap tests/ready-cache.test.mjs 2>&1) \ …` · acceptance-sha256:82b02c63612752e6ad9a98a953f22f10369fb3e2977063fb81bdd585f54de473 · ms:4496
- 2026-10-11 · 7afd854f* · exit 0 · `out=$(node --test --test-reporter=tap tests/ready-cache.test.mjs 2>&1) \ …` · acceptance-sha256:82b02c63612752e6ad9a98a953f22f10369fb3e2977063fb81bdd585f54de473 · ms:5164
- 2026-10-11 · 7afd854f* · exit 0 · `out=$(node --test --test-reporter=tap tests/ready-cache.test.mjs 2>&1) \ …` · acceptance-sha256:82b02c63612752e6ad9a98a953f22f10369fb3e2977063fb81bdd585f54de473 · ms:4608
- 2026-10-11 · 7afd854f* · exit 0 · `out=$(node --test --test-reporter=tap tests/ready-cache.test.mjs 2>&1) \ …` · acceptance-sha256:82b02c63612752e6ad9a98a953f22f10369fb3e2977063fb81bdd585f54de473 · ms:5038
- 2026-10-11 · 7afd854f* · exit 0 · `out=$(node --test --test-reporter=tap tests/ready-cache.test.mjs 2>&1) \ …` · acceptance-sha256:82b02c63612752e6ad9a98a953f22f10369fb3e2977063fb81bdd585f54de473 · ms:4937
- 2026-10-11 · 7afd854f* · exit 0 · `out=$(node --test --test-reporter=tap tests/ready-cache.test.mjs 2>&1) \ …` · acceptance-sha256:82b02c63612752e6ad9a98a953f22f10369fb3e2977063fb81bdd585f54de473 · ms:4949
- 2026-10-11 · 7afd854f* · exit 0 · `out=$(node --test --test-reporter=tap tests/ready-cache.test.mjs 2>&1) \ …` · acceptance-sha256:82b02c63612752e6ad9a98a953f22f10369fb3e2977063fb81bdd585f54de473 · ms:4853
- 2026-10-11 · 7afd854f* · exit 0 · `out=$(node --test --test-reporter=tap tests/ready-cache.test.mjs 2>&1) \ …` · acceptance-sha256:82b02c63612752e6ad9a98a953f22f10369fb3e2977063fb81bdd585f54de473 · ms:6127
- 2026-10-11 · human-observed · observed: S2 the manifest of a real adr-next run over this ADR's task directory holds 16 files, 3 directory listings, 31 stat-ed paths and 3 git commands, with 92 standard-library files left out; S4 on a clone of this repository, hook-cost SessionStart first start 1405 ms with 33 children, 6 of them the gate, second start 117 ms with 10 children, 0 of them the gate (101 ms without the preload), at load 4.8 on 10 cores
- 2026-10-11 · 7afd854f* · exit 0 · `out=$(node --test --test-reporter=tap tests/ready-cache.test.mjs 2>&1) \ …` · acceptance-sha256:82b02c63612752e6ad9a98a953f22f10369fb3e2977063fb81bdd585f54de473 · ms:4950
- 2026-10-11 · 7afd854f* · exit 0 · `adr-verify --relock --replace-hashes` · acceptance-sha256:82b02c63612752e6ad9a98a953f22f10369fb3e2977063fb81bdd585f54de473 · ms:0 · test-lock-sha256:d06125d0ac3492f095052be2ceca747f72ec5204a96ee8f9f4e661989049ca34 · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvcmVhZHktY2FjaGUudGVzdC5tanMJYSBjYWNoZSB0aGF0IGNhbm5vdCBiZSByZWFkLCB3cml0dGVuIG9yIHBhcnNlZCBpcyBhIG1pc3MsIHNhaWQgb25jZSwgYW5kIG5ldmVyIGFuIGVtcHR5IGFuc3dlcgliMmFhMzY5MmE0MDVlNWQ5Y2Q5ZDcwZGMwMTU3NWMwMjI2OGNjNDBlMzA3ZjY0YTgxYjFmOWM0MTFkZWY0NmFkCmJvZHkJdGVzdHMvcmVhZHktY2FjaGUudGVzdC5tanMJYSBtYW5pZmVzdCBob2xkcyBldmVyeSBraW5kIG9mIGRlcGVuZGVuY3kgdGhlIGdhdGUgcmVhZCwgYW5kIGVhY2ggY2hhbmdlcyB0aGUgYW5zd2VyIHdoZW4gaXQgY2hhbmdlcwkzMjMyY2Y1NjljMWU3YTdmNjkxZjRlZjIyODhhMDNmNGE4ZTdlYTVmNjUxMGM5ODljMzUyMTM2YzhhOGJiMTU5CmJvZHkJdGVzdHMvcmVhZHktY2FjaGUudGVzdC5tanMJYSBydW4gZHVyaW5nIHdoaWNoIGEgZGVwZW5kZW5jeSBjaGFuZ2VkIGlzIG5vdCBzdG9yZWQJOTM5MGJlNzU4Mjc3M2Q0NDAyNDJjYWE3YjA1YjI0MGRmNzVkMTg5MzA3ZDIyNTkzNzFjY2ZjNmY3MjgyMmNmMwpib2R5CXRlc3RzL3JlYWR5LWNhY2hlLnRlc3QubWpzCWEgc2Vjb25kIHN0YXJ0IGluIGFuIHVuY2hhbmdlZCBjb3JwdXMgc3RhcnRzIG5vIGFkci1uZXh0IGFuZCBzYXlzIHRoZSBzYW1lIGxpbmVzCTJhMjFkZDJjMThhNmViNGM5YjRiODRkMTlhMmNjNjUxM2RmM2U5ZTU5NmY0NjJjNzk0MmE1MGYwMWE1NWM2YTMKYm9keQl0ZXN0cy9yZWFkeS1jYWNoZS50ZXN0Lm1qcwl0aGUgcmVjb3JkZXIgcmVjb3JkcyB3aGF0IHRoZSBnYXRlIHJlYWQgYW5kIGxlYXZlcyB0aGUgc3RhbmRhcmQgbGlicmFyeSBvdXQJMmE2ZTZlZmZhZmRlMzcyMDdhNGFiNWVjYTRmOTJhZDM5ZDQwNzZiMGEyMWY5MzA1YzQ4YzZlZjllMWVkYTcxOA · test-lock-kind:replace
