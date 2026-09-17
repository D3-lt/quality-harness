# Task ADR-059-T2: A family that can write names no changed path until it uses that channel

**Depends-on:** T1
**Covers:** none — no spec
**Estimated scope:** S (single file)
**Owner:** unassigned
**Produces:** none
**Consumes:** `READ_ARGUMENT_FAMILIES` table and `readsOnlyItsArguments` (T1); `tests/read-only-arguments.test.mjs` (file exists) (T1)
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `the write-channel tests in the family table`, `a used write channel keeping every candidate`, `each named test actually running`, `the regression suites that pin path extraction`

## Goal

`sort`, `uniq`, `find`, `file`, `rg` and the read-only `git` subcommands (`diff`, `log`, `show`, `status`, `rev-parse`, `cat-file`, `grep`) contribute only a redirect target unless the segment uses that family's write channel, as listed in ADR-059's Decision.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/read-only-arguments.test.mjs` | edit | the two tests below |
| `plugin/scripts/lifecycle.mjs` | edit | channel tests for these families in `READ_ARGUMENT_FAMILIES`; the `git` branch of `readsOnlyItsArguments`; `FIND_WRITES` also matches `-fprint0` |

## Ordered Steps

1. [S1] Add the two tests and see the first fail on an assertion (TDD red). The second pins every channel and passes before the change, except `-fprint0` in the reviewer guard; S3's mutants show it can fail.
2. [S2] Add the families with their channel tests:
   - `sort` looks for a single-dash cluster containing `o` and for `--o…`/`--co…`.
   - `uniq` counts operands after options, with `-` as an operand and `-f`, `-s`, `-w` consuming a value; two or more operands use the channel.
   - `find` asks the corrected `FIND_WRITES`.
   - `git` first keeps every candidate for a `-c`/`--config-env` global option or a `GIT_…=` word before the command, then checks the subcommand's own channel options.
   - `rg` also keeps every candidate for a `RIPGREP_CONFIG_PATH=` word before the command.
3. [S3] Run the fence green and record mutants:
   - drop `sort`'s cluster test;
   - drop `sort`'s `--co` prefix;
   - let `uniq` count `-` as an option;
   - restore `FIND_WRITES`' `(?:\s|$)` ending;
   - drop `git`'s `-c` check;
   - drop `git`'s `--output`;
   - drop `rg`'s `--pre`.

   [proof: mutation]

## Acceptance

```bash
set -o pipefail
out=$(node --test --test-reporter=tap --test-name-pattern '^(a family that can write names no changed path until it uses that channel|a used write channel keeps every candidate)$' tests/read-only-arguments.test.mjs 2>&1) \
  && for name in 'a family that can write names no changed path until it uses that channel' 'a used write channel keeps every candidate'; do printf '%s\n' "$out" | grep -qxE "ok [0-9]+ - $name" || { echo "did not run: $name"; exit 1; }; done \
  && node --test tests/lifecycle.test.mjs tests/advice-accuracy.test.mjs tests/reviewer-guard.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `a family that can write names no changed path until it uses that channel` | `tests/read-only-arguments.test.mjs` | the measured reads — `sort`, `uniq`, `find docs -name '*.md'`, `file`, `rg`, `git diff --`, `git log --`, `git show`, `git status`, `git rev-parse`, `git cat-file`, `git grep -n a` — beside a write classify `mutation` and yield no path | — | S1, S2 |
| `a used write channel keeps every candidate` | `tests/read-only-arguments.test.mjs` | each channel still yields its `.md` path: `sort -o F`, `-oF`, `-uo F`, `--output=F`, `--out=F`, `--compress-program=CMD`, `uniq IN OUT`, `uniq - OUT`, `find -delete`, `-exec`, `-fprint0 F`, `file -C`, `git diff/log/show --output=F`, `git -c diff.external=CMD diff`, `GIT_EXTERNAL_DIFF=CMD git diff`, `git grep -O`, `git grep --textconv`, `rg --pre`, `rg --hostname-bin`, `RIPGREP_CONFIG_PATH=F rg`; and `FIND_WRITES` matches `-fprint0` | — | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the two tests |
| 2 — something selects it | `printsOnly` asks the table; each read test asserts `classifyCommand` returns `mutation`; S3's mutants remove a channel test |
| 3 — the caller can discover it | n/a: no declared interface |
| 4 — it is used | ADR-059's Follow-up replay |

## Mutation Log

## Invariants

- A segment that uses its family's channel keeps every candidate, as before this record.
- `git ls-files` (ADR-058 T5) answers as before.
- `FIND_WRITES` only gains matches; the reviewer guard refuses nothing it allowed that did not write.

## Risks

- A configured `diff.external` or textconv driver writes under a plain `git diff`. Advice only; named in ADR-059's Consequences.

## Stop Condition

Stop and ask if a channel measured in ADR-059's Context does not change the tree when re-run on this machine, or if `tests/reviewer-guard.test.mjs` goes red.

## Out of Scope

- `ag`, and GNU findutils primaries beyond `FIND_WRITES` (deferred: docs/BACKLOG.md §220)

## Verification Log
