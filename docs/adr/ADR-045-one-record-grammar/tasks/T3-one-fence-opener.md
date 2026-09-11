# Task ADR-045-T3: The Acceptance fence opener is one grammar

**Depends-on:** T1
**Covers:** F-4, UC4-S1, UC4-S2, UC4-S3, UC4-S4
**Estimated scope:** S (one constant in the lib; three gates import it; two CLI tests; catalogue entries)
**Owner:** zy
**Produces:** none
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1

## Goal

`record.ACCEPTANCE_FENCE` is the one definition of which fence under `## Acceptance` is the runnable one — ```bash, ```sh or ```shell, optional trailing whitespace, body to the first closing ``` — and adr-verify, adr-lint (the fence check, the digest path and the human-mutant advisory) and adr-next find the fence with it and nothing else. A ```sh task the writer ran and recorded is digest-checked by the verifier and reported done by the reader; an Acceptance whose fence no gate runs is a blocking finding that names the opener it found, never an empty `acc_all` that skips the digest check.

Decided here: the accepted openers are `bash`, `sh`, `shell`. The regex bytes are adr-verify's and adr-lint's existing `ACCEPTANCE_FENCE` (```` ```(?:bash|sh|shell)\s*\n(.*?)``` ````), so no digest of any fence either gate already accepted changes; `\s*\n` is kept over `[ \t]*\n` because `normalize_acceptance` trims the blank lines `\s*` can swallow and the two spellings hash identically.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/lib/record.py` | edit | `ACCEPTANCE_FENCE`, exported, with the decision above in its comment |
| `plugin/bin/adr-verify` | edit | delete its `ACCEPTANCE_FENCE`; import the shared one; `--help` names the three openers |
| `plugin/bin/adr-lint` | edit | delete its `ACCEPTANCE_FENCE`; the no-fence check and the digest path use the shared constant; the no-fence message names the opener it found |
| `plugin/bin/adr-next` | edit | `acceptance()` finds the fence with the shared constant, not a bare ```bash\n |
| `tests/evidence-chain.test.mjs` | edit | sh / shell / `bash ` recorded then digest-checked; forged digest refused; python fence named |
| `tests/adr-next.test.mjs` | edit | sh / shell / `bash ` recorded by adr-verify is done to adr-next; python is not |
| `tests/gates.test.mjs` | edit | no gate carries an opener regex (shape scan, clean and dirty); the constant's arms on its own |
| `tests/mutations.json` | edit | the sh/shell entry moves to `record.py`; adr-lint digest path and no-fence check; adr-next match |

## Ordered Steps

1. [S1] Bind the failing tests for the Covers IDs — reproduce the fail-open first: a ```sh task recorded by adr-verify, README `done`, adr-lint output identical with the digest forged. [proof: acceptance]
2. [S2] Add `ACCEPTANCE_FENCE` to `record.py`; delete the definitions in adr-verify and adr-lint; route adr-lint's fence check and digest path and adr-next's match through it. [proof: acceptance]
3. [S3] Add the catalogue entries; run each with `node scripts/mutate.mjs --case`. [proof: mutation]

## Acceptance

```bash
node --test --test-name-pattern 'digest-checked by adr-lint, not skipped|an Acceptance fence may be spelled sh or shell' tests/evidence-chain.test.mjs && node --test --test-name-pattern 'sh-labelled Acceptance fence adr-verify recorded' tests/adr-next.test.mjs && node --test --test-name-pattern 'record.py: the opener is bash|the record grammar is one module' tests/gates.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a sh-labelled Acceptance the writer recorded is digest-checked by adr-lint, not skipped` | `tests/evidence-chain.test.mjs` | sh, shell, `bash ` recorded → lint exit 0 with no fence complaint; every digest forged → exit 1 with the digest message; python → blocked, opener named | F-4, UC4-S1, UC4-S2, UC4-S3 | S1, S2 |
| `an Acceptance fence may be spelled sh or shell` | `tests/evidence-chain.test.mjs` | adr-verify still runs all three and refuses python (pre-existing, now bound to the shared constant) | F-4 | S2 |
| `a sh-labelled Acceptance fence adr-verify recorded is done to adr-next` | `tests/adr-next.test.mjs` | the reader sees the fence the writer ran; python is refused and not done | F-4, UC4-S4 | S1, S2 |
| `record.py: the opener is bash, sh or shell; a repeated heading is named; a span is where the reader reads` | `tests/gates.test.mjs` | the constant's arms: three openers with and without trailing spaces, CRLF, `bashful`/python/bare refused | F-4 | S2 |
| `the record grammar is one module: every gate loads plugin/lib/record.py and none keeps a copy` | `tests/gates.test.mjs` | no gate source carries an opener regex; the scan matches the three old shapes when present | F-4 | S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | `ACCEPTANCE_FENCE` is in `record.__all__` |
| 2 — something selects it | adr-verify, adr-lint and adr-next import it by name |
| 3 — the caller can discover it | the one-module test fails on any private opener regex |
| 4 — it is used | a ```sh task is recorded, digest-checked and reported done through three CLIs |

## Mutation Log

## Invariants

- No gate under `plugin/bin` compiles or searches its own Acceptance opener; `rg -n '```\(\?:bash|```bash\\s\*\\n|```bash\\n' plugin/bin` matches only prose.
- The normalized bytes and digest of every fence adr-lint accepted before this task are unchanged.
- An `## Acceptance` with a fence no gate runs is `errors.append` in adr-lint, and `acc_all` is `""` only when adr-lint has already reported that.

## Risks

- A corpus with a ```sh task that adr-lint used to block as "no ```bash fence" now lints clean — the intended change, and the digest check applies to it for the first time; a `done` row there with a stale digest becomes a finding.

## Stop Condition

A green run while any gate defines an opener regex, or while a forged digest on a ```sh task passes adr-lint.

## Out of Scope

- Accepting other labels (`zsh`, `console`) (permanent: boundary: the fence runs through bash; a label no gate runs is a finding, not a fourth opener)
- The `\s*` vs `[ \t]*` spelling (permanent: fact: the two hash identically after `normalize_acceptance`; citation: file `plugin/lib/record.py:57`)

## Notes

Class: `rg -n 'bash' plugin/bin/*` on `01cb598`. Regex hits: adr-verify:446 `ACCEPTANCE_FENCE` (moved), adr-lint:150 `ACCEPTANCE_FENCE` (moved), adr-lint:1433 `"```bash" not in acc` (now the shared constant), adr-lint:1654 `re.search(r"```bash\s*\n…")` (now the shared constant), adr-next:237 `re.search(r"```bash\n…")` (now the shared constant). Every other hit is prose, a comment-syntax table (`.bash: "#"`), `bash -n` / `bash -c` invocations, `resolve_bash`, or arch-lint's runner-name classifier — none decides which fence is the Acceptance. Reproduced before the fix: `python3 plugin/bin/adr-lint` on a ```sh task with README `done` printed "no ```bash fence" and the same lines with the digest forged; after: `[PASS]` clean, and "no exit-0 entry carries the current Acceptance digest" forged.

## Verification Log
