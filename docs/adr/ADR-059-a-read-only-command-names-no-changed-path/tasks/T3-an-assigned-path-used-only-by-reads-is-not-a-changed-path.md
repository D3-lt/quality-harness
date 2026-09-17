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
| `tests/advice-accuracy.test.mjs` | edit | a regression pin for the export clause, which the kept test's never-referenced case cannot tell apart |

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
| `an exported name keeps its assigned path after a read` | `tests/advice-accuracy.test.mjs` | `T=docs/BACKLOG.md; cat "$T"; export T; ./w.sh` still yields the assigned path | — | S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the two tests |
| 2 — something selects it | `bashMarkdownMutationPaths` is called from `analyzeTranscript` for every `mutation`, which the first test asserts; S3's mutants break the reference scan |
| 3 — the caller can discover it | n/a: no declared interface |
| 4 — it is used | ADR-059's Follow-up replay |

**A missing opposite, 2026-09-17.** The kept case `T=docs/a.md; export T; ./w.sh` never references `$T`, so it is kept whether or not the export clause exists. A pin where the only reference is a read went into `tests/advice-accuracy.test.mjs`, which this fence runs whole, before the mutants were recorded.

## Mutation Log
- 2026-09-17 · 7777063* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · every assigned name is kept, so a path used only by reads is a changed path again · acceptance-sha256:f1489a1d20e998dbf4d11e796cd3943d66e4c2b07923c3b27eadc52792debf7d · covers:the reference scan in the assignment loop
- 2026-09-17 · 7777063* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · a single-quoted '$T' in a writing segment counts as a reference · acceptance-sha256:f1489a1d20e998dbf4d11e796cd3943d66e4c2b07923c3b27eadc52792debf7d · covers:the reference scan in the assignment loop
- 2026-09-17 · 7777063* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · every assigned value is dropped, including ones a writer uses · acceptance-sha256:f1489a1d20e998dbf4d11e796cd3943d66e4c2b07923c3b27eadc52792debf7d · covers:an assigned path written, hidden, exported or never referenced still counting
- 2026-09-17 · 7777063* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · echo "- x" >> "$NOTE" reads as a read, so the file it appends to is dropped · acceptance-sha256:f1489a1d20e998dbf4d11e796cd3943d66e4c2b07923c3b27eadc52792debf7d · covers:an assigned path written, hidden, exported or never referenced still counting
- 2026-09-17 · 7777063* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · a $(… | tee "$T") body is not its own segment, so the write inside it is missed · acceptance-sha256:f1489a1d20e998dbf4d11e796cd3943d66e4c2b07923c3b27eadc52792debf7d · covers:an assigned path written, hidden, exported or never referenced still counting
- 2026-09-17 · 7777063* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · a heredoc body that writes $T is invisible, so the path is dropped · acceptance-sha256:f1489a1d20e998dbf4d11e796cd3943d66e4c2b07923c3b27eadc52792debf7d · covers:an assigned path written, hidden, exported or never referenced still counting
- 2026-09-17 · 7777063* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · tee "${!N}" writes the name indirectly and the path is dropped · acceptance-sha256:f1489a1d20e998dbf4d11e796cd3943d66e4c2b07923c3b27eadc52792debf7d · covers:an assigned path written, hidden, exported or never referenced still counting
- 2026-09-17 · 7777063* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · an exported name read once is dropped though a child process can write it · acceptance-sha256:f1489a1d20e998dbf4d11e796cd3943d66e4c2b07923c3b27eadc52792debf7d · covers:an assigned path written, hidden, exported or never referenced still counting
- 2026-09-17 · 7777063* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · only the last value per name is kept, so T=a.md written then T=b.md read loses a.md · acceptance-sha256:f1489a1d20e998dbf4d11e796cd3943d66e4c2b07923c3b27eadc52792debf7d · covers:an assigned path written, hidden, exported or never referenced still counting
- 2026-09-17 · 7777063* · mutant killed · exit 1 · `tests/read-only-arguments.test.mjs` · a renamed test selects nothing and the per-name ok grep must refuse it · acceptance-sha256:f1489a1d20e998dbf4d11e796cd3943d66e4c2b07923c3b27eadc52792debf7d · covers:each named test actually running
- 2026-09-17 · 7777063* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · a git revision under a used channel resolves as a changed path; the pin in tests/advice-accuracy.test.mjs kills it · acceptance-sha256:f1489a1d20e998dbf4d11e796cd3943d66e4c2b07923c3b27eadc52792debf7d · covers:the regression suites that pin path extraction
- 2026-09-17 · 7777063* · mutant killed · exit 1 · `plugin/scripts/lifecycle.mjs` · the scan uses the candidate loop traversal, so a tee after popd and a $(…) body are skipped · acceptance-sha256:f1489a1d20e998dbf4d11e796cd3943d66e4c2b07923c3b27eadc52792debf7d · covers:an assigned path written, hidden, exported or never referenced still counting

## Invariants

- `tests/lifecycle.test.mjs`'s assignment cases (`A=docs/spec.md; printf x | tee "$A"`, the never-referenced `DOC=`, `DOC='docs/My File.md'`) keep their paths.

## Risks

- A reference shape the scan cannot see next to one it can, other than a heredoc or `${!` (for example `eval "tee \$T"`). The value is then dropped although a writer used it; the advisory still fires on the command as a mutation. Named here because no listed guard covers `eval`.

## Stop Condition

Stop and ask if keeping the never-referenced assignment conflicts with a test outside `tests/lifecycle.test.mjs`.

## Out of Scope

- Resolving `$NAME` inside a candidate token such as `$D/tasks/T1.md` (permanent: boundary: it would add reports in segments no family table covers; ADR-059's Alternatives)

## Verification Log
- 2026-09-17 · 7777063* · exit 1 · `set -o pipefail …` · acceptance-sha256:f1489a1d20e998dbf4d11e796cd3943d66e4c2b07923c3b27eadc52792debf7d · ms:244 · test-lock-sha256:3e19b770ca67e8e8ae16e6d04282925b80f10fd9239023a6e28c8387e5e7adf8 · test-lock-b64:Y2hlY2sJZjdlMjUxYjUwM2NhZWZlY2JhMTEyMjFhZDJjYzIyMjc3MDYxNDA1NzNiZWEyMGQ2MWQ5OTg3ZGE3YjYwNTI1Ngpib2R5CXRlc3RzL3JlYWQtb25seS1hcmd1bWVudHMudGVzdC5tanMJYSBjaGFubmVsLWZyZWUgcmVhZCBuYW1lcyBubyBjaGFuZ2VkIHBhdGgJZjI0YzIwYmYyMzcwYWJhOGUwZjNmZGI3NWUyMDNlMjM4NmZmNWMzZmNkMDhjOTAyODI0YzA1N2QwMWM4MmI4OApib2R5CXRlc3RzL3JlYWQtb25seS1hcmd1bWVudHMudGVzdC5tanMJYSBmYW1pbHkgdGhhdCBjYW4gd3JpdGUgbmFtZXMgbm8gY2hhbmdlZCBwYXRoIHVudGlsIGl0IHVzZXMgdGhhdCBjaGFubmVsCThkNjZkMDcwOTk5OTAxZDUwYWZhODc5ZjhjMDE5YTBmNmZkOGM5NGQ4NjQ5N2I2NDYzYTJiZjk4NGZiMTUwMmMKYm9keQl0ZXN0cy9yZWFkLW9ubHktYXJndW1lbnRzLnRlc3QubWpzCWEgcmVkaXJlY3QgYmVzaWRlIGEgY2hhbm5lbC1mcmVlIHJlYWQgaXMgc3RpbGwgYSBjaGFuZ2VkIHBhdGgJMTczYjI0ZGE2YjFmZjJiODk5NGJkNTlkZjY3YjUzZTdkNzcyM2RjOWE3NjA4M2E0OWVhM2FjYzFmMDdiNTJlNwpib2R5CXRlc3RzL3JlYWQtb25seS1hcmd1bWVudHMudGVzdC5tanMJYSB1c2VkIHdyaXRlIGNoYW5uZWwga2VlcHMgZXZlcnkgY2FuZGlkYXRlCTRjZTRhOGVjMjBmNTdmOTM4MGY2NDQ4ZjljN2U0NDdmNDQ1MjU5OTIxZTBjOWE1NTY5ZWQxNWUwOTYwYzJiMDIKYm9keQl0ZXN0cy9yZWFkLW9ubHktYXJndW1lbnRzLnRlc3QubWpzCWFuIGFzc2lnbmVkIHBhdGggdXNlZCBvbmx5IGJ5IHJlYWRzIGlzIG5vdCBhIGNoYW5nZWQgcGF0aAlhOGZmYTY1MzJmNWZhZjgzN2FhZjc3Y2IwOGU2Y2NhZDkxOTA0NmQxMTAzN2Y0MDU4MGM4YmU0ZGZiNGM0MWI2CmJvZHkJdGVzdHMvcmVhZC1vbmx5LWFyZ3VtZW50cy50ZXN0Lm1qcwlhbiBhc3NpZ25lZCBwYXRoIHdyaXR0ZW4sIGhpZGRlbiwgZXhwb3J0ZWQgb3IgbmV2ZXIgcmVmZXJlbmNlZCBpcyBzdGlsbCBhIGNoYW5nZWQgcGF0aAkzZDlmM2ZiZmUwYTQzOWFjNjdhYTU4YTE0NDVjODFlOWMxZmQzZjQzMjQ1MmVmNTVhZTEzOGJhNzA0ZTdlNmU5
  ```
  ```
- 2026-09-17 · 7777063* · exit 0 · `set -o pipefail …` · acceptance-sha256:f1489a1d20e998dbf4d11e796cd3943d66e4c2b07923c3b27eadc52792debf7d · ms:25190
- 2026-09-17 · 7777063* · exit 0 · `set -o pipefail …` · acceptance-sha256:f1489a1d20e998dbf4d11e796cd3943d66e4c2b07923c3b27eadc52792debf7d · ms:24317
- 2026-09-17 · 7777063* · exit 0 · `set -o pipefail …` · acceptance-sha256:f1489a1d20e998dbf4d11e796cd3943d66e4c2b07923c3b27eadc52792debf7d · ms:24433
- 2026-09-17 · 7777063* · exit 0 · `set -o pipefail …` · acceptance-sha256:f1489a1d20e998dbf4d11e796cd3943d66e4c2b07923c3b27eadc52792debf7d · ms:24594
- 2026-09-17 · 7777063* · exit 0 · `set -o pipefail …` · acceptance-sha256:f1489a1d20e998dbf4d11e796cd3943d66e4c2b07923c3b27eadc52792debf7d · ms:29678
- 2026-09-17 · 7777063* · exit 0 · `set -o pipefail …` · acceptance-sha256:f1489a1d20e998dbf4d11e796cd3943d66e4c2b07923c3b27eadc52792debf7d · ms:29123
- 2026-09-17 · 7777063* · exit 0 · `set -o pipefail …` · acceptance-sha256:f1489a1d20e998dbf4d11e796cd3943d66e4c2b07923c3b27eadc52792debf7d · ms:28458
- 2026-09-17 · 7777063* · exit 0 · `set -o pipefail …` · acceptance-sha256:f1489a1d20e998dbf4d11e796cd3943d66e4c2b07923c3b27eadc52792debf7d · ms:30575
- 2026-09-17 · 7777063* · exit 0 · `set -o pipefail …` · acceptance-sha256:f1489a1d20e998dbf4d11e796cd3943d66e4c2b07923c3b27eadc52792debf7d · ms:25346
- 2026-09-17 · 7777063* · exit 0 · `set -o pipefail …` · acceptance-sha256:f1489a1d20e998dbf4d11e796cd3943d66e4c2b07923c3b27eadc52792debf7d · ms:24604
- 2026-09-17 · 7777063* · exit 0 · `set -o pipefail …` · acceptance-sha256:f1489a1d20e998dbf4d11e796cd3943d66e4c2b07923c3b27eadc52792debf7d · ms:24421
- 2026-09-17 · 7777063* · exit 0 · `set -o pipefail …` · acceptance-sha256:f1489a1d20e998dbf4d11e796cd3943d66e4c2b07923c3b27eadc52792debf7d · ms:27229
