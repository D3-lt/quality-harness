# Task ADR-095-T2: the ready-task lines come from a cache keyed by content

**Depends-on:** T1
**Covers:** none — no spec
**Estimated scope:** M (one new module, two callers, tests)
**Owner:** unassigned
**Produces:** `readyCache(root, listing)` and `readyKey(inputs)` — a SHA-256 over the corpus directory, the gate and the date `adr-next` answers from
**Consumes:** `scripts/hook-cost.mjs --json` (T1)
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `a key covers every input adr-next reads`, `a cache that cannot be used is a miss`, `a hit gives the lines an uncached run gives`

## Goal

A SessionStart in a corpus whose task directories have not changed starts no `adr-next`, and says exactly what an uncached start would say.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/ready-cache.mjs` | add | `readyKey` (pure over the bytes it is handed), the gatherer of the corpus directory, and `readyCache`: lookup, store, and the first reason it could not be used; the directory keeps at most 200 entries, oldest first out |
| `plugin/scripts/ready-lines.mjs` | edit | `readyTaskLines` takes the cache as an optional argument, looks before `spawnGate` and stores a decisive answer after it; the result carries `cacheProblem` |
| `plugin/scripts/session-orientation.mjs` | edit | passes `readyCache(root, listing)` and says `cacheProblem` once, as a standing paragraph |
| `plugin/scripts/session-notes.mjs` | edit | the PreCompact note passes the same cache |
| `tests/ready-cache.test.mjs` | add | four tests |
| `tests/pure-judges.test.mjs` | edit | `readyKey` joins the list held to "reads nothing but what it is handed" |
| `tests/mutations/plugin/scripts/ready-cache.mjs.json` | add | one entry per `Rests-on` name and per input in the key |
| `tests/mutations/plugin/scripts/ready-lines.mjs.json` | edit | one entry: the lookup before `spawnGate` |

## Ordered Steps

1. [S1] Write the four tests of the Tests table and record the red run (TDD red).
2. [S2] Enumerate what `adr-next` reads, with a command, and put the command and the count in the sign-off [proof: acceptance]: `mrw read --grep 'open\(|read_text|read_bytes|subprocess|os\.environ|getenv' plugin/bin/adr-next plugin/lib/record.py`. Anything it reads that is not in the key is added to the key or the task stops.
3. [S3] Write `readyKey`, the gatherer and `readyCache`; a hit is used only when the stored entry parses, carries the same key and a decisive status; every failure to read, hash, parse or write is a miss, said once. Wire the cache into `readyTaskLines` and the two callers.
4. [S4] Write entries to a temporary name and rename; keep the directory to 200 entries.
5. [S5] Measure with T1: the second SessionStart in the unchanged corpus starts no `adr-next`; put the before and after children and milliseconds in the sign-off. [proof: human: the second start's `adr-next` count is 0 and its wall time is below 250 ms on the clone of this repository]
6. [S6] Record one killed mutant per input in the key (a file of the corpus, which files git lists, the date, the directory, `adr-next`, `record.py`) and one per `Rests-on` name. [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/ready-cache.test.mjs 2>&1) \
  && for t in 'a second start in an unchanged corpus starts no adr-next and says the same lines' 'a change to a task file, the owning record, another record, an untracked file or the date is a miss, and each is answered fresh' 'a cache that cannot be read, written or parsed is a miss, said once, and never an empty answer' 'readyKey is a function of the bytes it is handed'; do test "$(printf '%s\n' "$out" | grep -cxE "ok [0-9]+ - $t")" = 1 || exit 1; done
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a second start in an unchanged corpus starts no adr-next and says the same lines` | `tests/ready-cache.test.mjs` | two SessionStart runs against a fixture corpus: the second has zero `adr-next` children and its ready lines equal the first's, byte for byte | none | S1, S3 |
| `a change to a task file, the owning record, another record, an untracked file or the date is a miss, and each is answered fresh` | `tests/ready-cache.test.mjs` | the dirty twins: an edit to a task file, the owning record, another record's task, or a file git does not list each gives a spawn and is then kept; the lines reflect the change; the date and the gate's bytes change the key | none | S1, S3 |
| `a cache that cannot be read, written or parsed is a miss, said once, and never an empty answer` | `tests/ready-cache.test.mjs` | an unreadable directory, a read-only state directory and a corrupt entry each run `adr-next` and print its lines; the could-not-use note appears once | none | S1, S3, S4 |
| `readyKey is a function of the bytes it is handed` | `tests/ready-cache.test.mjs` | `scripts/effect-classes.mjs` finds it pure; equal inputs give equal keys, any one different byte gives a different key | none | S1, S3 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the four tests |
| 2 — something selects it | `readyTaskLines` consults the cache before `spawnGate`; removing the lookup turns the first test red |
| 3 — the caller can discover it | n/a: no declared interface |
| 4 — it is used | the second-start measurement of S5, and the outside run |

## Mutation Log
- 2026-10-11 · b10b2c15* · mutant killed · exit 1 · `plugin/scripts/ready-cache.mjs` · leaves a file's bytes out of the key, so an edited record is served its old answer · acceptance-sha256:18ef9cb73f13cf63175b47b1de4507346bc6511d99df995ad0ceaec665f8cf59 · covers:a key covers every input adr-next reads
- 2026-10-11 · b10b2c15* · mutant killed · exit 1 · `plugin/scripts/ready-cache.mjs` · leaves which files git lists out of the key · acceptance-sha256:18ef9cb73f13cf63175b47b1de4507346bc6511d99df995ad0ceaec665f8cf59 · covers:a key covers every input adr-next reads
- 2026-10-11 · b10b2c15* · mutant killed · exit 1 · `plugin/scripts/ready-cache.mjs` · leaves today's date out of the key, so a row dated ahead is judged by yesterday · acceptance-sha256:18ef9cb73f13cf63175b47b1de4507346bc6511d99df995ad0ceaec665f8cf59 · covers:a key covers every input adr-next reads
- 2026-10-11 · b10b2c15* · mutant killed · exit 1 · `plugin/scripts/ready-cache.mjs` · leaves the task directory out of the key · acceptance-sha256:18ef9cb73f13cf63175b47b1de4507346bc6511d99df995ad0ceaec665f8cf59 · covers:a key covers every input adr-next reads
- 2026-10-11 · b10b2c15* · mutant killed · exit 1 · `plugin/scripts/ready-cache.mjs` · leaves the gate's own bytes out of the key, so a new adr-next is answered by the old one's entries · acceptance-sha256:18ef9cb73f13cf63175b47b1de4507346bc6511d99df995ad0ceaec665f8cf59 · covers:a key covers every input adr-next reads
- 2026-10-11 · b10b2c15* · mutant killed · exit 1 · `plugin/scripts/ready-cache.mjs` · does not descend into the corpus directory's subdirectories, so another record's task is not in the key · acceptance-sha256:18ef9cb73f13cf63175b47b1de4507346bc6511d99df995ad0ceaec665f8cf59 · covers:a key covers every input adr-next reads
- 2026-10-11 · b10b2c15* · mutant survived · exit 0 · `plugin/scripts/ready-cache.mjs` · treats every unreadable entry as a plain miss, so a cache that cannot be read is never said · acceptance-sha256:18ef9cb73f13cf63175b47b1de4507346bc6511d99df995ad0ceaec665f8cf59 · covers:a cache that cannot be used is a miss
  ```
  the fence passed with the mechanism broken; it may not materialize, compile, load, or assert on the changed path
  ```
- 2026-10-11 · b10b2c15* · mutant killed · exit 1 · `plugin/scripts/ready-cache.mjs` · serves an entry without checking it carries the key it is filed under · acceptance-sha256:18ef9cb73f13cf63175b47b1de4507346bc6511d99df995ad0ceaec665f8cf59 · covers:a cache that cannot be used is a miss
- 2026-10-11 · b10b2c15* · mutant killed · exit 1 · `plugin/scripts/ready-cache.mjs` · stores an empty answer, so a hit gives other lines than an uncached run · acceptance-sha256:18ef9cb73f13cf63175b47b1de4507346bc6511d99df995ad0ceaec665f8cf59 · covers:a hit gives the lines an uncached run gives
- 2026-10-11 · b10b2c15* · mutant killed · exit 1 · `plugin/scripts/ready-lines.mjs` · never consults the cache, so every start runs adr-next again · acceptance-sha256:18ef9cb73f13cf63175b47b1de4507346bc6511d99df995ad0ceaec665f8cf59 · covers:a hit gives the lines an uncached run gives
- 2026-10-11 · b10b2c15* · mutant killed · exit 1 · `plugin/scripts/ready-cache.mjs` · treats every unreadable entry as a plain miss, so a cache that cannot be read is never said · acceptance-sha256:18ef9cb73f13cf63175b47b1de4507346bc6511d99df995ad0ceaec665f8cf59 · covers:a cache that cannot be used is a miss

## Invariants

- The lines a hit yields are byte-identical to an uncached run's (ADR-040, ADR-094).
- A failure of the cache is a run of `adr-next`, never an empty list of tasks (CLAUDE.md §16, ADR-005).
- `adr-next` is unchanged.

## Risks

- An input of `adr-next` nobody listed: S2 enumerates the reads with a command, and the Stop Condition applies.

## Stop Condition

Stop and ask if `adr-next` reads anything the key does not cover and that changes its answer: the key must include it or the cache is not sound. FOUND at S2 (2026-10-11): it does read beyond the task directory — the other records' tasks (a qualified `Depends-on`), the sibling records, which files git lists, and today's date (`record.py` judges a log row dated more than a day ahead). The key therefore covers the whole corpus directory as it is on disk, the tracked listing under it, the gate's three files and the local date; the narrower key this task first described would have served a stale answer after an edit to another record.

## Out of Scope

- Running the misses concurrently (deferred: docs/BACKLOG.md §378)

## Verification Log
- 2026-10-11 · b10b2c15* · exit 1 · `out=$(node --test --test-reporter=tap tests/ready-cache.test.mjs 2>&1) \ …` · acceptance-sha256:18ef9cb73f13cf63175b47b1de4507346bc6511d99df995ad0ceaec665f8cf59 · ms:1313 · test-lock-sha256:6108c2e498e31edb29a0189fcf76b903d73e8344bac919430cda64bf74dc499e · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvcmVhZHktY2FjaGUudGVzdC5tanMJYSBjYWNoZSB0aGF0IGNhbm5vdCBiZSByZWFkLCB3cml0dGVuIG9yIHBhcnNlZCBpcyBhIG1pc3MsIHNhaWQgb25jZSwgYW5kIG5ldmVyIGFuIGVtcHR5IGFuc3dlcglhMzEwZWMzNGZjYjBhZGE1MmM1NGU0NGM1ZmRlOTU2YTUwMjBhNjNlNDIwNDVlNmJlMzllMDc3YzQxY2UyMjIyCmJvZHkJdGVzdHMvcmVhZHktY2FjaGUudGVzdC5tanMJYSBjaGFuZ2UgdG8gYSB0YXNrIGZpbGUsIHRoZSBvd25pbmcgcmVjb3JkLCBhbm90aGVyIHJlY29yZCwgYW4gdW50cmFja2VkIGZpbGUgb3IgdGhlIGRhdGUgaXMgYSBtaXNzLCBhbmQgZWFjaCBpcyBhbnN3ZXJlZCBmcmVzaAk5MmE0NmNlNzVkOWU2Zjg1OGQ2Yjg2YjViMmY1MGIzZmQ1ZWYyMWNiNTNiYjgzZWNhYjlmNGRmMjBlMDBkMjQ2CmJvZHkJdGVzdHMvcmVhZHktY2FjaGUudGVzdC5tanMJYSBzZWNvbmQgc3RhcnQgaW4gYW4gdW5jaGFuZ2VkIGNvcnB1cyBzdGFydHMgbm8gYWRyLW5leHQgYW5kIHNheXMgdGhlIHNhbWUgbGluZXMJMmY5MzQ4Yjk3OTc2MWRjZjBmMjNmZGE2Yjk2ZGY5ZWUwYjQ2N2NkMTVlODhhYTZkM2VkZjBhYTc2ODYxNjNiNQpib2R5CXRlc3RzL3JlYWR5LWNhY2hlLnRlc3QubWpzCXJlYWR5S2V5IGlzIGEgZnVuY3Rpb24gb2YgdGhlIGJ5dGVzIGl0IGlzIGhhbmRlZAk0MzZjZTk2OGQ2OGYwM2E5MjRlYWQ0NWZjZWQ2ZTVkZjk4OGU4MzdmN2E4NTM4NTRmNmI2NDliNWQzYjRjZDIz
  ```
  ```
- 2026-10-11 · b10b2c15* · exit 0 · `out=$(node --test --test-reporter=tap tests/ready-cache.test.mjs 2>&1) \ …` · acceptance-sha256:18ef9cb73f13cf63175b47b1de4507346bc6511d99df995ad0ceaec665f8cf59 · ms:3813
- 2026-10-11 · b10b2c15* · exit 0 · `out=$(node --test --test-reporter=tap tests/ready-cache.test.mjs 2>&1) \ …` · acceptance-sha256:18ef9cb73f13cf63175b47b1de4507346bc6511d99df995ad0ceaec665f8cf59 · ms:3512
- 2026-10-11 · b10b2c15* · exit 0 · `out=$(node --test --test-reporter=tap tests/ready-cache.test.mjs 2>&1) \ …` · acceptance-sha256:18ef9cb73f13cf63175b47b1de4507346bc6511d99df995ad0ceaec665f8cf59 · ms:4127
- 2026-10-11 · b10b2c15* · exit 0 · `out=$(node --test --test-reporter=tap tests/ready-cache.test.mjs 2>&1) \ …` · acceptance-sha256:18ef9cb73f13cf63175b47b1de4507346bc6511d99df995ad0ceaec665f8cf59 · ms:3907
- 2026-10-11 · b10b2c15* · exit 0 · `out=$(node --test --test-reporter=tap tests/ready-cache.test.mjs 2>&1) \ …` · acceptance-sha256:18ef9cb73f13cf63175b47b1de4507346bc6511d99df995ad0ceaec665f8cf59 · ms:3727
- 2026-10-11 · b10b2c15* · exit 0 · `out=$(node --test --test-reporter=tap tests/ready-cache.test.mjs 2>&1) \ …` · acceptance-sha256:18ef9cb73f13cf63175b47b1de4507346bc6511d99df995ad0ceaec665f8cf59 · ms:3338
- 2026-10-11 · b10b2c15* · exit 0 · `out=$(node --test --test-reporter=tap tests/ready-cache.test.mjs 2>&1) \ …` · acceptance-sha256:18ef9cb73f13cf63175b47b1de4507346bc6511d99df995ad0ceaec665f8cf59 · ms:4681
- 2026-10-11 · b10b2c15* · exit 0 · `out=$(node --test --test-reporter=tap tests/ready-cache.test.mjs 2>&1) \ …` · acceptance-sha256:18ef9cb73f13cf63175b47b1de4507346bc6511d99df995ad0ceaec665f8cf59 · ms:3570
- 2026-10-11 · b10b2c15* · exit 0 · `out=$(node --test --test-reporter=tap tests/ready-cache.test.mjs 2>&1) \ …` · acceptance-sha256:18ef9cb73f13cf63175b47b1de4507346bc6511d99df995ad0ceaec665f8cf59 · ms:3958
- 2026-10-11 · b10b2c15* · exit 0 · `out=$(node --test --test-reporter=tap tests/ready-cache.test.mjs 2>&1) \ …` · acceptance-sha256:18ef9cb73f13cf63175b47b1de4507346bc6511d99df995ad0ceaec665f8cf59 · ms:3767
- 2026-10-11 · b10b2c15* · exit 0 · `out=$(node --test --test-reporter=tap tests/ready-cache.test.mjs 2>&1) \ …` · acceptance-sha256:18ef9cb73f13cf63175b47b1de4507346bc6511d99df995ad0ceaec665f8cf59 · ms:4316
- 2026-10-11 · human-observed · observed by the executing session on macOS, 2026-10-11: S2 enumerated what the gate reads with mrw read --grep over plugin/bin/adr-next and plugin/lib/record.py (23 read sites in adr-next, 1 clock read in record.py); beyond the task directory it reads the other records' tasks (a qualified Depends-on), the sibling records, git's listing (one git ls-files) and today's date, so the key covers the whole corpus directory (415 files, 5.1 MB, hashed in 12 ms), the tracked listing under it, the gate's three files and the local date, which is wider than the task first described and is recorded in its guard clause; S5 measured with scripts/hook-cost.mjs SessionStart on a clone of this repository at a load near 14: the first event takes 1.3 to 1.5 s with 6 adr-next children, the second event 103 to 109 ms with 0 adr-next children and 4 children in all (was 1.09 s and 10); one mutant survived at first (every read error treated as a plain miss) and a test of an entry the reader may not read now kills it; approved
- 2026-10-11 · b10b2c15* · exit 0 · `adr-verify --relock --replace-hashes` · acceptance-sha256:18ef9cb73f13cf63175b47b1de4507346bc6511d99df995ad0ceaec665f8cf59 · ms:0 · test-lock-sha256:569c12f5bcd2da6a8c4fdbe3068b4d712c22bcb5bf212b743c5c10b4efd58dc0 · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvcmVhZHktY2FjaGUudGVzdC5tanMJYSBjYWNoZSB0aGF0IGNhbm5vdCBiZSByZWFkLCB3cml0dGVuIG9yIHBhcnNlZCBpcyBhIG1pc3MsIHNhaWQgb25jZSwgYW5kIG5ldmVyIGFuIGVtcHR5IGFuc3dlcgk0MDQ0ZGMwYjIwYTBhZTlhOTlhYWUzMjRlY2Q2NGIwOTI5NWZlNjBjZjgzYTI1NGYyOTZiMzFiMjFjMjcyOGM5CmJvZHkJdGVzdHMvcmVhZHktY2FjaGUudGVzdC5tanMJYSBjaGFuZ2UgdG8gYSB0YXNrIGZpbGUsIHRoZSBvd25pbmcgcmVjb3JkLCBhbm90aGVyIHJlY29yZCwgYW4gdW50cmFja2VkIGZpbGUgb3IgdGhlIGRhdGUgaXMgYSBtaXNzLCBhbmQgZWFjaCBpcyBhbnN3ZXJlZCBmcmVzaAk5MmE0NmNlNzVkOWU2Zjg1OGQ2Yjg2YjViMmY1MGIzZmQ1ZWYyMWNiNTNiYjgzZWNhYjlmNGRmMjBlMDBkMjQ2CmJvZHkJdGVzdHMvcmVhZHktY2FjaGUudGVzdC5tanMJYSBzZWNvbmQgc3RhcnQgaW4gYW4gdW5jaGFuZ2VkIGNvcnB1cyBzdGFydHMgbm8gYWRyLW5leHQgYW5kIHNheXMgdGhlIHNhbWUgbGluZXMJMmY5MzQ4Yjk3OTc2MWRjZjBmMjNmZGE2Yjk2ZGY5ZWUwYjQ2N2NkMTVlODhhYTZkM2VkZjBhYTc2ODYxNjNiNQpib2R5CXRlc3RzL3JlYWR5LWNhY2hlLnRlc3QubWpzCXJlYWR5S2V5IGlzIGEgZnVuY3Rpb24gb2YgdGhlIGJ5dGVzIGl0IGlzIGhhbmRlZAk0MzZjZTk2OGQ2OGYwM2E5MjRlYWQ0NWZjZWQ2ZTVkZjk4OGU4MzdmN2E4NTM4NTRmNmI2NDliNWQzYjRjZDIz · test-lock-kind:replace
