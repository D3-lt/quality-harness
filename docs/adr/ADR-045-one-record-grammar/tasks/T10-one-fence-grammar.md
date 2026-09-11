# Task ADR-045-T10: One fence grammar — the walk and the runnable opener are one rule

**Depends-on:** T3, T8
**Covers:** F-11, UC11-S1, UC11-S2
**Estimated scope:** M (the grammar in the lib; five call sites in three gates; the probe's edges; thirteen catalogue entries touched)
**Owner:** zy
**Produces:** none
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1

## Goal

Two grammars for the same three characters: the section walk toggled on any line whose first non-blank characters were ```, and `ACCEPTANCE_FENCE` was an unanchored regex over the section text. So `prose ```bash` was runnable, a ````bash opener matched from its second backtick, an inner ```bash inside a four-backtick fence ran, a ``` inside the command ended the body mid-line (measured: `echo '```'` ran as `echo '`), and a ~~~-fenced heading was a heading. One grammar in `record.py` (`_FENCE`): a fence line is three or more ``` or ~~~ after any leading blanks; what follows is the info string on an opener and must be blank on a closer; a fence closes only on the same marker at least as long; a backtick opener whose info string holds a backtick is not an opener (CommonMark). Every view is a view of it — `sections_of`, `section_span`, `repeated_headings`, `unterminated_fence`, `fence_safe`, `acceptance_fence(section)` (the runnable body: walk fence to fence, take the first backtick opener labelled exactly `bash`, `sh` or `shell` with optional trailing blanks, body to the matching closer) and `first_fence_line`. `ACCEPTANCE_FENCE` no longer exists; adr-verify, adr-lint and adr-next call the function.

Decided here: leading indentation is allowed for every fence line, as the walk has always allowed it (adr-verify's excerpts are two spaces in). The runnable opener is a LINE, not a substring. A 4+-backtick `bash` fence IS runnable (CommonMark: the info string is `bash`), closed only by 4+ backticks.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/lib/record.py` | edit | `_FENCE`, `_RUNNABLE_INFO`, `_fence_opened`, `_fence_closes`; `_scan` on them; `acceptance_fence`, `first_fence_line`; `ACCEPTANCE_FENCE` deleted |
| `plugin/bin/adr-verify` | edit | `acceptance_of` and the recording path call `acceptance_fence` |
| `plugin/bin/adr-lint` | edit | the fence check, the digest path and the human-mutant advisory use `acc_body`; the opener named is `first_fence_line` |
| `plugin/bin/adr-next` | edit | `acceptance()` calls `acceptance_fence`; `unreadable_note` (T8's report, landed here) |
| `tests/gates.test.mjs` | edit | the probe's twelve edges; the one-module message |
| `tests/evidence-chain.test.mjs` | edit | the ~~~bash arm |
| `tests/adr-next.test.mjs` | edit | the open-fence note |
| `tests/mutations.json` | edit | six opener entries retargeted to the function; six new: closer length, closer marker, blank closer, backtick-only runnable, inline-code line, adr-next's note |

## Ordered Steps

1. [S1] Bind the failing tests: the probe's edges (`bash title=x`, `BASH`, `~~~bash`, the inner ```bash, the ``` inside a command) against the old grammar; then recompute digests and section keys over every tracked record with the old and the new `record.py` — must be 0 differences before the gates change. [proof: acceptance]
2. [S2] The grammar; the five call sites; the probe's edges; the cross-gate probe on six inputs through three CLIs. [proof: acceptance]
3. [S3] Catalogue entries; each run with `node scripts/mutate.mjs --case`; the one GREEN (closer marker) named the missing edge, which was added. [proof: mutation]

## Acceptance

```bash
node --test --test-name-pattern 'record.py: the opener is bash|the record grammar is one module' tests/gates.test.mjs && node --test --test-name-pattern 'code fence never closes|sh-labelled Acceptance fence adr-verify recorded' tests/adr-next.test.mjs && node --test --test-name-pattern 'digest-checked by adr-lint, not skipped' tests/evidence-chain.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `record.py: the opener is bash, sh or shell; a repeated heading is named; a span is where the reader reads` | `tests/gates.test.mjs` | the edges: attribute, capital, tilde, prose-before → None; indented → body; inner bash in ```` → None; ````bash with a ``` line inside → body keeps it; open → None; ``` inside the command → command; example fence walked over; tilde-then-bash; a list of lines; a ``` line inside ~~~ does not close it; an inline-code line is not a fence; `first_fence_line` whole | F-11, UC11-S1 | S2 |
| `the record grammar is one module: every gate loads plugin/lib/record.py and none keeps a copy` | `tests/gates.test.mjs` | no gate carries an opener regex or a fence-blind reader; the scan matches the shapes when present | F-11, UC11-S2 | S2 |
| `a task whose code fence never closes is READY with a note saying its sections could not be read` | `tests/adr-next.test.mjs` | the reader says why it could not read, through the CLI | F-11 | S2 |
| `a sh-labelled Acceptance fence adr-verify recorded is done to adr-next` | `tests/adr-next.test.mjs` | the three openers still run and are done through `acceptance_fence` | F-11 | S2 |
| `a sh-labelled Acceptance the writer recorded is digest-checked by adr-lint, not skipped` | `tests/evidence-chain.test.mjs` | the writer's and the verifier's fence are one function; ~~~bash named | F-11 | S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | `acceptance_fence` and `first_fence_line` are in `record.__all__`; `ACCEPTANCE_FENCE` is not |
| 2 — something selects it | `rg -n 'acceptance_fence\(' plugin/bin` → five call sites in three gates |
| 3 — the caller can discover it | the one-module test refuses any private opener regex |
| 4 — it is used | the cross-gate probe: six inputs, three CLIs, identical answers |

## Mutation Log
- 2026-09-11 · eb0fe36* · mutant killed · exit 1 · `plugin/lib/record.py` · a closer that ignores the opening length lets an inner ``` close a ```` fence, so the inner ```bash runs and the four-backtick edges in the probe disagree · acceptance-sha256:8e7d56afeced567b36aec0eb428252a60deb1a3ecca5ce3fbb25de8c9d333432

## Invariants

- Digests and section keys of every tracked record are unchanged (222 files, 97 digests, 0 differences, old grammar vs new).
- `normalize_acceptance` bytes are unchanged.
- No gate carries a fence marker regex; `rg -n '\x60\x60\x60\(\?:bash' plugin/bin` finds nothing.

## Risks

- A record that relied on `prose ```bash` or an unanchored closer being runnable: none in the corpus (recomputed); such a fence is now reported by adr-lint with its first fence line named.
- CommonMark's three-space indentation limit is NOT enforced; any indentation opens a fence, as before. A deeper-indented example would need to be inside a fence to be text — which is how the corpus already writes examples.

## Stop Condition

A green run while any gate finds the runnable fence by a regex of its own, or while `acceptance_fence` and `sections_of` disagree about whether a line is a fence.

## Out of Scope

- Enforcing CommonMark's ≤3-space indentation for a fence opener (permanent: boundary: the walk has allowed any indentation since it existed and adr-verify's own excerpts are indented; changing it would re-read every record)
- Running a `~~~bash` fence (permanent: boundary: the runnable opener is backticks; a tilde fence is named by adr-lint)

## Notes

Cross-gate probe, 2026-09-11, each input as the fixture task's Acceptance through the three CLIs:

| case | adr-verify | adr-lint | adr-next |
|---|---|---|---|
| ```bash title=x | 2 · no non-empty ```bash fence | 1 · opens with ```bash title=x, which is not a runnable | ready; acceptance=None |
| ```BASH | 2 · same | 1 · opens with ```BASH | ready; acceptance=None |
| ~~~bash | 2 · same | 1 · opens with ~~~bash | ready; acceptance=None |
| ```` outer, inner ```bash | 2 · same | 1 · opens with ```` | ready; acceptance=None |
| unterminated | 2 · code fence opened at line N (```bash) is never closed | 1 · same, blocking | ready; unproven names line N |
| indented ```bash | 0 · WROTE this entry | (no fence finding) | 3 · done |

Class: every fence regex in the gates — `rg -n 'ACCEPTANCE_FENCE|\x60\x60\x60' plugin/bin plugin/lib` before and after; five call sites moved, one constant deleted. Found by the second Codex review of ADR-045 (M3).

## Verification Log
- 2026-09-11 · eb0fe36* · exit 0 · `node --test --test-name-pattern 'record.py: the opener is bash|the record grammar is one module' tests/gates.test.mjs && node --test --test-name-pattern 'code fence never closes|sh-labelled Acceptance fence adr-verify recorded' tests/adr-next.test.mjs && node --test --test-name-pattern 'digest-checked by adr-lint, not skipped' tests/evidence-chain.test.mjs` · acceptance-sha256:8e7d56afeced567b36aec0eb428252a60deb1a3ecca5ce3fbb25de8c9d333432 · ms:2609
- 2026-09-11 · eb0fe36* · exit 0 · `node --test --test-name-pattern 'record.py: the opener is bash|the record grammar is one module' tests/gates.test.mjs && node --test --test-name-pattern 'code fence never closes|sh-labelled Acceptance fence adr-verify recorded' tests/adr-next.test.mjs && node --test --test-name-pattern 'digest-checked by adr-lint, not skipped' tests/evidence-chain.test.mjs` · acceptance-sha256:8e7d56afeced567b36aec0eb428252a60deb1a3ecca5ce3fbb25de8c9d333432 · ms:2718
