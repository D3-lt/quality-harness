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
- 2026-09-17 · 332a707* · exit 0 · `adr-verify --relock --replace-hashes` · acceptance-sha256:f1489a1d20e998dbf4d11e796cd3943d66e4c2b07923c3b27eadc52792debf7d · ms:0 · test-lock-sha256:5e1a82d42225a8bbab8e689ef8d41146d95de54a1a7d7b8dc409e22c13ba9f3c · test-lock-b64:Y2hlY2sJZjdlMjUxYjUwM2NhZWZlY2JhMTEyMjFhZDJjYzIyMjc3MDYxNDA1NzNiZWEyMGQ2MWQ5OTg3ZGE3YjYwNTI1Ngpib2R5CXRlc3RzL2FkdmljZS1hY2N1cmFjeS50ZXN0Lm1qcwlhIHJldmlzaW9uIHBhdGggdW5kZXIgYSB1c2VkIGdpdCBjaGFubmVsIGlzIG5vdCBhIGNoYW5nZWQgcGF0aAk0MzY1NmU4ODJkMmM0NTNlODI0NzQyYWQ2MmJjZDNlMjc2YzA0YjJkZjVhM2MxM2NhZmU5MzIxYWI2NTUyNWJlCmJvZHkJdGVzdHMvYWR2aWNlLWFjY3VyYWN5LnRlc3QubWpzCWEgdGltZW91dCB3cmFwcGVyIGRvZXMgbm90IGxhdW5kZXIgYSBtdXRhdGlvbgk5N2MzY2U5MmEwNjIxMWU1Y2YwNzI3MTdlNDljMjkwMDkxNzBlYmYwMjgzMjlkMjE2ODNiOWJiODZhMTQ0YzEyCmJvZHkJdGVzdHMvYWR2aWNlLWFjY3VyYWN5LnRlc3QubWpzCWEgdGltZW91dC13cmFwcGVkIGNoZWNrIGlzIGEgY2hlY2sJMGMxYzYzNmUxMGZkNjM0YjAxNTA4NzFmNTNiN2MyNjZiYTdiNDNmMjU2M2M3ZmJmNTBkMTg0MjkxZjhlNWI3ZApib2R5CXRlc3RzL2FkdmljZS1hY2N1cmFjeS50ZXN0Lm1qcwlhIHdyYXBwZXIgZmlsZSBvcGVyYW5kIGlzIHN0aWxsIGEgY2hhbmdlZCBwYXRoCWIwYmE2NjY5N2RjZmNhZjRlYTRiYzQ5NDkzOWY3ZTY1YjEzNThlYjdiYjJlMmZlNWZlZTdjMzYwMDM1YmE3NDQKYm9keQl0ZXN0cy9hZHZpY2UtYWNjdXJhY3kudGVzdC5tanMJYSB3cml0ZSBiZXNpZGUgYSByZWFkIGlzIHN0aWxsIGEgY2hhbmdlZCBwYXRoCTQyMTQyYTg2MDZmZDYxYjM1NjA5NjI4MWE2YWJkYWJjOWZhZDlmZTU2NzFjMWM5MmNkYzczY2I3MjdiODg1NjMKYm9keQl0ZXN0cy9hZHZpY2UtYWNjdXJhY3kudGVzdC5tanMJYW4gZWNobyByZWRpcmVjdCB0YXJnZXQgaXMgc3RpbGwgYSBjaGFuZ2VkIHBhdGgJNGI2MjhkNjA4ZDYwZTlhNWY3MWUyNWIzYmRmNGM2NDZjNmQ1NzY3ZGIyYTQ0NWI3NjU0MDJjNTk3ODdjYWYzZQpib2R5CXRlc3RzL2FkdmljZS1hY2N1cmFjeS50ZXN0Lm1qcwlhbiBleHBvcnRlZCBuYW1lIGtlZXBzIGl0cyBhc3NpZ25lZCBwYXRoIGFmdGVyIGEgcmVhZAk5MTFmYWQ1YWU0YmYwYWMwNTczYmMwNTAxZWIxOWNkODZhOTJjZWQwZTEzMTJhOWM3ZTFhOTcwMzljYjM3M2NkCmJvZHkJdGVzdHMvYWR2aWNlLWFjY3VyYWN5LnRlc3QubWpzCWVjaG8gYW5kIHByaW50ZiBhcmd1bWVudHMgYXJlIG5vdCBjaGFuZ2VkIHBhdGhzCWQ1NTZjYzcyMjA0NmY4N2IyMGM0ZTk5N2NjMzAwNzU2YzIwMGNjMGFjNWNhMzU5YjU4M2NiYWZiMzc5MTJjNmUKYm9keQl0ZXN0cy9hZHZpY2UtYWNjdXJhY3kudGVzdC5tanMJbXJ3IHJlYWQgaXMgYSByZWFkLCBub3QgYW4gdW5wcm92ZW4gd3JpdGUJYjljMjYyYjRlNjM3YjNiZTUwNTdjNWM1ODhhZmUxYjNiMWEwMDFjZjFmMGM3ZjVlYzJjNTM1MzlkNWEyODA3Mgpib2R5CXRlc3RzL2FkdmljZS1hY2N1cmFjeS50ZXN0Lm1qcwltcncgd3JpdGUgaXMgc3RpbGwganVkZ2VkIGFzIGEgd3JpdGUJODE5YzU2ZGM4N2E3M2QyNDM5ZDA2OTI5YTUwMmY1ZDBkODM3MDVkNjhhNjM5ODJlMjRhYjgzZmQ3NDFhZmM0Mwpib2R5CXRlc3RzL2FkdmljZS1hY2N1cmFjeS50ZXN0Lm1qcwlyZWFkLW9ubHkgYXJndW1lbnRzIGFyZSBub3QgY2hhbmdlZCBwYXRocwkxMTE1MGE2N2VlMzkwYmRjNjNlMzEwNmFhMTg3MDZlZjQxMjljNTYzOTM0M2M3NjRlNzQ1YTNjMWZlNmYwMDRjCmJvZHkJdGVzdHMvcmVhZC1vbmx5LWFyZ3VtZW50cy50ZXN0Lm1qcwlhIGNoYW5uZWwtZnJlZSByZWFkIG5hbWVzIG5vIGNoYW5nZWQgcGF0aAlmMjRjMjBiZjIzNzBhYmE4ZTBmM2ZkYjc1ZTIwM2UyMzg2ZmY1YzNmY2QwOGM5MDI4MjRjMDU3ZDAxYzgyYjg4CmJvZHkJdGVzdHMvcmVhZC1vbmx5LWFyZ3VtZW50cy50ZXN0Lm1qcwlhIGNvbnRpbnVlZCByZWRpcmVjdCB0YXJnZXQga2VlcHMgaXRzIHBhdGgJNjg1ZDg2MDM1NzNjZjUxNWI4MzdlNTA2MmJkMWJlYTAxYmRhMzkxNWJlNTE5N2Q2MDI3NDdmYzVkMzUxN2IwMQpib2R5CXRlc3RzL3JlYWQtb25seS1hcmd1bWVudHMudGVzdC5tanMJYSBmYWlsZWQgY29tbWFuZCB0aGF0IGFsc28gd3JpdGVzIGlzIHN0aWxsIGEgd3JpdGUJYjg3M2QyYmEyODNjZmRjMDFlZTg0MDE4NjIzY2RjZThhY2MwZjM2MGVlYzA4OGM5MmFiMWFiNmViYjU3OTIxYQpib2R5CXRlc3RzL3JlYWQtb25seS1hcmd1bWVudHMudGVzdC5tanMJYSBmYWlsZWQgY29tbWFuZCB3aXRoIG5vIHdyaXRlIGlzIHN0aWxsIG5vIHdyaXRlCTlmYWFhOWRmMjliNTdlYTFjMTE4ZjNkZDBkZDU1YzU5YWZhZmRkMzRmZWE3MGY1MmMwOTc3ZTM1NTRhYzU5OTQKYm9keQl0ZXN0cy9yZWFkLW9ubHktYXJndW1lbnRzLnRlc3QubWpzCWEgZmFtaWx5IHRoYXQgY2FuIHdyaXRlIG5hbWVzIG5vIGNoYW5nZWQgcGF0aCB1bnRpbCBpdCB1c2VzIHRoYXQgY2hhbm5lbAk4ZDY2ZDA3MDk5OTkwMWQ1MGFmYTg3OWY4YzAxOWEwZjZmZDhjOTRkODY0OTdiNjQ2M2EyYmY5ODRmYjE1MDJjCmJvZHkJdGVzdHMvcmVhZC1vbmx5LWFyZ3VtZW50cy50ZXN0Lm1qcwlhIHJlYWQgd2l0aG91dCBpdHMgY2hhbm5lbCBpcyBzdGlsbCBub3QgYSB3cml0ZQliOWE1MjgwZjBiNzViNjc2YmY2ZGI0NTVlNjQxMTJjMjlmMjc0ZGY1MDVhMjRhNDA1NDYyZDIxNDE4YmUwNWVjCmJvZHkJdGVzdHMvcmVhZC1vbmx5LWFyZ3VtZW50cy50ZXN0Lm1qcwlhIHJlZGlyZWN0IGJlc2lkZSBhIGNoYW5uZWwtZnJlZSByZWFkIGlzIHN0aWxsIGEgY2hhbmdlZCBwYXRoCTE3M2IyNGRhNmIxZmYyYjg5OTRiZDU5ZGY2N2I1M2U3ZDc3MjNkYzlhNzYwODNhNDllYTNhY2MxZjA3YjUyZTcKYm9keQl0ZXN0cy9yZWFkLW9ubHktYXJndW1lbnRzLnRlc3QubWpzCWEgdXNlZCB3cml0ZSBjaGFubmVsIGlzIGEgd3JpdGUgdG8gdGhlIGNsYXNzaWZpZXIgYW5kIHRoZSBndWFyZAk1MTg0MmVkNmI2YjRhYTUzZjQ5MTYwNzI0YzJhMjE2ODE1YTMzYTA3Mzk4NjZjNWZlYzdhYWVlYzAyMmYxZDJmCmJvZHkJdGVzdHMvcmVhZC1vbmx5LWFyZ3VtZW50cy50ZXN0Lm1qcwlhIHVzZWQgd3JpdGUgY2hhbm5lbCBrZWVwcyBldmVyeSBjYW5kaWRhdGUJNGNlNGE4ZWMyMGY1N2Y5MzgwZjY0NDhmOWM3ZTQ0N2Y0NDUyNTk5MjFlMGM5YTU1NjllZDE1ZTA5NjBjMmIwMgpib2R5CXRlc3RzL3JlYWQtb25seS1hcmd1bWVudHMudGVzdC5tanMJYSB2YXJpYWJsZSBpbiBhIHJlYWQgb3BlcmFuZCBpcyBzdGlsbCBub3QgYSBjaGFuZ2VkIHBhdGgJMTNkZDg1N2JkNjYxYzMwM2RiZmRlNjc1ZDViZWI3ZWNjNjQ4MzBlYjM1ODljMTM4NzhmZDcxN2UyM2M3NmUzMQpib2R5CXRlc3RzL3JlYWQtb25seS1hcmd1bWVudHMudGVzdC5tanMJYSB2YXJpYWJsZSBpbnNpZGUgYSByZWRpcmVjdCB0YXJnZXQgaXMgc3RpbGwgYSBjaGFuZ2VkIHBhdGgJZTY3ZDRjYjUyZjZmMTM4N2QyODM0N2QzMzk2M2QzY2YxNGI2ZDgwNDU1ZjE2NWI5ZmM5Njc4MDlkYzIxNWYxYgpib2R5CXRlc3RzL3JlYWQtb25seS1hcmd1bWVudHMudGVzdC5tanMJYW4gYXNzaWduZWQgcGF0aCB1c2VkIG9ubHkgYnkgcmVhZHMgaXMgbm90IGEgY2hhbmdlZCBwYXRoCWE4ZmZhNjUzMmY1ZmFmODM3YWFmNzdjYjA4ZTZjY2FkOTE5MDQ2ZDExMDM3ZjQwNTgwYzhiZTRkZmI0YzQxYjYKYm9keQl0ZXN0cy9yZWFkLW9ubHktYXJndW1lbnRzLnRlc3QubWpzCWFuIGFzc2lnbmVkIHBhdGggd3JpdHRlbiwgaGlkZGVuLCBleHBvcnRlZCBvciBuZXZlciByZWZlcmVuY2VkIGlzIHN0aWxsIGEgY2hhbmdlZCBwYXRoCTNkOWYzZmJmZTBhNDM5YWM2N2FhNThhMTQ0NWM4MWU5YzFmZDNmNDMyNDUyZWY1NWFlMTM4YmE3MDRlN2U2ZTkKYm9keQl0ZXN0cy9yZWFkLW9ubHktYXJndW1lbnRzLnRlc3QubWpzCWFuIGVzY2FwZWQgcXVvdGUgZG9lcyBub3QgaGlkZSBhIHJlZGlyZWN0IHRhcmdldAk1MzU0YWIyMmU0NDFiZmU4NTc0MDMyNGFhZDE5ZWQ2YzgyMmMwZTQ3YjQ1ZjU3Nzc5YzRlMjM0ODhmODk4Mzk3CmJvZHkJdGVzdHMvcmVhZC1vbmx5LWFyZ3VtZW50cy50ZXN0Lm1qcwlhbiBlc2NhcGVkIHF1b3RlIGluIGEgcmVhZCBvcGVyYW5kIGlzIHN0aWxsIGEgcmVhZAkyN2E5MzNjNWE0NmJlYTNhM2NhNTYzMTdjZjYyZmE1ZDg1ZDdjZWRkYTIxYTI1ZjA4OWY3OTBkZWU5MWFlNmVjCmJvZHkJdGVzdHMvcmVhZC1vbmx5LWFyZ3VtZW50cy50ZXN0Lm1qcwl0aGUgcmVsZWFzZWQgcXVvdGUgc3RyaXAgc3RpbGwgc2VlcyB0aGVzZSB3cml0ZXMJNjFlNGQ5YzJhZjAwOTJjMmZiZWM2ZWU1ZjgxM2YxN2NmZDA3OWVlOWZlYzNjYTljOTNjNmM2NDkxZjQ1ZjJlMA · test-lock-kind:replace
- 2026-09-17 · 332a707* · exit 0 · `set -o pipefail …` · acceptance-sha256:f1489a1d20e998dbf4d11e796cd3943d66e4c2b07923c3b27eadc52792debf7d · ms:22277
