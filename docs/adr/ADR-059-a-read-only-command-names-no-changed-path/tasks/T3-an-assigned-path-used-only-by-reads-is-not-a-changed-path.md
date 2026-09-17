# Task ADR-059-T3: An assigned path used only by reads is not a changed path

**Depends-on:** T2
**Covers:** none — no spec
**Estimated scope:** S (single file)
**Owner:** unassigned
**Produces:** none
**Consumes:** `READ_ARGUMENT_FAMILIES` table and `readsOnlyItsArguments` (T1), with T2's channel entries in it; `tests/read-only-arguments.test.mjs` (file exists) (T1)
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `the reference scan in the assignment loop`, `an assigned path written, hidden, exported or never referenced still counting`, `each named test actually running`, `the regression suites that pin path extraction`

## Goal

An in-command `NAME=<file>.md` value is not a changed path only when every reference to the name is a plain argument of a segment that reads, under the four conditions in ADR-059's Decision.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/read-only-arguments.test.mjs` | edit | the two tests below |
| `plugin/scripts/lifecycle.mjs` | edit | the assignment loop in `bashMarkdownMutationPaths` defers each assigned `.md` value until a reference scan has run |

## Ordered Steps

1. [S1] Add the two tests, including the measured `T=<task>.md && mrw read "$T" | sed -n '1,90p'; cd plugin/lib && python3 -c '…'`, and see the first fail on an assertion (TDD red). The second pins the kept cases and passes before the change; S3's mutants show it can fail.
2. [S2] Record each assigned `.md` value in a list per name. Then scan `shellCommandRegions(executable)` × `shellSegments(region)` with no directory skip.
   - **A reference:** `$NAME` or `${NAME}` outside single quotes.
   - **Marks the name written:** a reference whose preceding text ends in `>`, or any reference in a segment that is not `printsOnly`.
   - **Keeps every value:** a command with `heredocBodies(command)` non-empty, containing `${!`, or exporting (`export NAME`, `declare -x`, `set -a`, `set -o allexport`).

   After the scan, push the values of names that are written, unreferenced or kept.
3. [S3] Run the fence green and record mutants:
   - drop every assigned value regardless of references;
   - ignore a reference after `>`;
   - skip segments with an unknown directory;
   - ignore heredoc bodies;
   - count a single-quoted `'$NAME'` as a reference;
   - keep only the last value per name.

   [proof: mutation]

## Acceptance

```bash
set -o pipefail
out=$(node --test --test-reporter=tap --test-name-pattern '^(an assigned path used only by reads is not a changed path|an assigned path written, hidden, exported or never referenced is still a changed path)$' tests/read-only-arguments.test.mjs 2>&1) \
  && for name in 'an assigned path used only by reads is not a changed path' 'an assigned path written, hidden, exported or never referenced is still a changed path'; do printf '%s\n' "$out" | grep -qxE "ok [0-9]+ - $name" || { echo "did not run: $name"; exit 1; }; done \
  && node --test tests/lifecycle.test.mjs tests/advice-accuracy.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `an assigned path used only by reads is not a changed path` | `tests/read-only-arguments.test.mjs` | these classify `mutation` and do not yield the assigned path: the measured `T=… && mrw read "$T" \| sed -n …; cd … && python3 -c …`; `D=docs/a.md; cat "$D"; touch b.log`; `T=docs/a.md; cat "$T"; sed -i '' 's/$T/x/' docs/b.md` (a single-quoted `$T` is not a reference) | — | S1, S2 |
| `an assigned path written, hidden, exported or never referenced is still a changed path` | `tests/read-only-arguments.test.mjs` | these still yield the assigned path: `A=docs/a.md; printf x \| tee "$A"`; `T=docs/a.md && python3 plugin/bin/adr-verify "$T"`; `NOTE=docs/a.md; echo "- x" >> "$NOTE"`; `OUT=docs/c.md; cat docs/a.md docs/b.md > "$OUT"`; `F=docs/a.md; head -3 "$F"; pushd plugin; popd; printf x \| tee -a "$F"`; `T=docs/a.md; cat "$T"; echo "$(printf x \| tee "$T")"`; `T=docs/a.md; cat "$T"; bash <<EOF` … `printf x > "$T"` … `EOF`; `T=docs/a.md; N=T; cat "$T"; printf x \| tee "${!N}"`; `T=docs/a.md; printf x \| tee "$T"; T=docs/b.md; cat "$T"` (both values); `T=docs/a.md; export T; ./w.sh` (unrecognised today, so this case holds the rule for when §218 lands); `DOC='docs/a.md' && printf x > docs/b.md` | — | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the two tests |
| 2 — something selects it | `bashMarkdownMutationPaths` is called from `analyzeTranscript` for every `mutation`, which the first test asserts; S3's mutants break the reference scan |
| 3 — the caller can discover it | n/a: no declared interface |
| 4 — it is used | ADR-059's Follow-up replay |

## Mutation Log

## Invariants

- `tests/lifecycle.test.mjs`'s assignment cases (`A=docs/spec.md; printf x | tee "$A"`, the never-referenced `DOC=`, `DOC='docs/My File.md'`) keep their paths.

## Risks

- A reference shape the scan cannot see next to one it can, other than a heredoc or `${!` (for example `eval "tee \$T"`). The value is then dropped although a writer used it; the advisory still fires on the command as a mutation. Named here because no listed guard covers `eval`.

## Stop Condition

Stop and ask if keeping the never-referenced assignment conflicts with a test outside `tests/lifecycle.test.mjs`.

## Out of Scope

- Resolving `$NAME` inside a candidate token such as `$D/tasks/T1.md` (permanent: boundary: it would add reports in segments no family table covers; ADR-059's Alternatives)

## Verification Log
