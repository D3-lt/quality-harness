# Task ADR-095-T2: the ready-task lines come from a cache keyed by content

**Depends-on:** T1
**Covers:** none — no spec
**Estimated scope:** M (one module, the sweep, tests)
**Owner:** unassigned
**Produces:** `readyKey(inputs)` — a SHA-256 over the bytes `adr-next` reads for a task directory
**Consumes:** `scripts/hook-cost.mjs --json` (T1)
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `a key covers every input adr-next reads`, `a cache that cannot be used is a miss`, `a hit gives the lines an uncached run gives`

## Goal

A SessionStart in a corpus whose task directories have not changed starts no `adr-next`, and says exactly what an uncached start would say.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/ready-lines.mjs` | edit | `readyKey` (pure over the bytes it is handed), the gatherer that reads them, and the lookup before `spawnGate`; a hit returns the stored stdout and exit |
| `plugin/scripts/housekeeping.mjs` | edit | the daily sweep also removes `ready-cache` entries older than seven days |
| `tests/ready-cache.test.mjs` | add | four tests |
| `tests/pure-judges.test.mjs` | edit | `readyKey` joins the list held to "reads nothing but what it is handed" |
| `tests/mutations/plugin/scripts/ready-lines.mjs.json` | edit | one entry per `Rests-on` name |
| `tests/mutations/plugin/scripts/housekeeping.mjs.json` | edit | one entry for the sweep |

## Ordered Steps

1. [S1] Write the four tests of the Tests table and record the red run (TDD red).
2. [S2] Enumerate what `adr-next` reads, with a command, and put the command and the count in the sign-off [proof: acceptance]: `mrw read --grep 'open\(|read_text|read_bytes|subprocess|os\.environ|getenv' plugin/bin/adr-next plugin/lib/record.py`. Anything it reads that is not in the key is added to the key or the task stops.
3. [S3] Write `readyKey` and the gatherer; a hit is used only when the stored entry parses and carries the same key; every failure to read, hash, parse or write is a miss, said once.
4. [S4] Extend the sweep. Write entries to a temporary name and rename.
5. [S5] Measure with T1: the second SessionStart in the unchanged corpus starts no `adr-next`; put the before and after children and milliseconds in the sign-off. [proof: human: the second start's `adr-next` count is 0 and its wall time is below 250 ms on the clone of this repository]
6. [S6] Record one killed mutant per input in the key (a task file, the record, `adr-next`, `record.py`, the object format) and one per `Rests-on` name. [proof: mutation]

## Acceptance

```bash
out=$(node --test --test-reporter=tap tests/ready-cache.test.mjs 2>&1) \
  && for t in 'a second start in an unchanged corpus starts no adr-next and says the same lines' 'a change to a task file, the owning record, adr-next or record.py is a miss, and each is answered fresh' 'a cache that cannot be read, written or parsed is a miss, said once, and never an empty answer' 'readyKey is a function of the bytes it is handed'; do test "$(printf '%s\n' "$out" | grep -cxE "ok [0-9]+ - $t")" = 1 || exit 1; done
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a second start in an unchanged corpus starts no adr-next and says the same lines` | `tests/ready-cache.test.mjs` | two SessionStart runs against a fixture corpus: the second has zero `adr-next` children and its ready lines equal the first's, byte for byte | none | S1, S3 |
| `a change to a task file, the owning record, adr-next or record.py is a miss, and each is answered fresh` | `tests/ready-cache.test.mjs` | the dirty twins: one byte changed in each input gives a new key and a spawn; the lines reflect the change | none | S1, S3 |
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

## Invariants

- The lines a hit yields are byte-identical to an uncached run's (ADR-040, ADR-094).
- A failure of the cache is a run of `adr-next`, never an empty list of tasks (CLAUDE.md §16, ADR-005).
- `adr-next` is unchanged.

## Risks

- An input of `adr-next` nobody listed: S2 enumerates the reads with a command, and the Stop Condition applies.

## Stop Condition

Stop and ask if `adr-next` reads anything outside the task directory, the record, `record.py` and git's object format that changes its answer (the clock, an environment variable, another record): the key must include it or the cache is not sound.

## Out of Scope

- Running the misses concurrently (deferred: docs/BACKLOG.md §378)

## Verification Log
