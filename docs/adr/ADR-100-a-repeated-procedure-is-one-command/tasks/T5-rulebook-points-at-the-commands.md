# Task ADR-100-T5: CLAUDE.md §12 and §13 point at the commands that now carry their procedure

**Depends-on:** T1, T2, T3, T4
**Covers:** none — no spec
**Estimated scope:** S (the rulebook and two rule files)
**Owner:** unassigned
**Produces:** none
**Consumes:** `reviews.jsonl` (T1), `qh-check --commit` (T2), `scripts/release.mjs` (T3), `scripts/fast-check.mjs` (T4)
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** none — the fence greps one file for the commands and the anchors

## Goal

The rulebook says to run the commands, keeps every cited heading, and moves the procedure's evidence into the rule files.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `CLAUDE.md` | edit | §12 names the launcher and its record; §13's steps become `node scripts/release.mjs` and what it stops for; §2's commit lines name `qh-check --commit` |
| `.claude/rules/12-reviews.md`, `.claude/rules/13-releasing.md` | edit | the evidence the shortened sections no longer carry |
| `AGENTS.md` | edit, if it restates a changed rule | its "never chain a commit after a test" line names the one sanctioned chain |

## Ordered Steps

1. [S1] Run the Acceptance fence red (the commands are not named yet). [proof: acceptance]
2. [S2] Edit §2, §12 and §13, keeping `## 12. Reviews` and `## 13. Releasing` and every rule a record cites by number. Re-read §13 step 6 against `.github/workflows/selftest.yml:19-21` first: the concurrency group keys on the event, so a push no longer cancels a dispatch run, and a second dispatch cancels the first; the rule is restated as that, with the workflow line cited. [proof: acceptance]
3. [S3] Move the evidence to the rule files; state no counts (CLAUDE.md's own rule). [proof: human: the reviewer reads the diff and finds no procedure step dropped without a command or a rule file carrying it]

## Acceptance

```bash
grep -qE '^## 12\. Reviews$' CLAUDE.md && grep -qE '^## 13\. Releasing$' CLAUDE.md \
  && grep -q 'node scripts/release.mjs' CLAUDE.md && grep -q 'qh-check --commit' CLAUDE.md \
  && grep -q 'reviews.jsonl' CLAUDE.md && node --test tests/package.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `nothing tracked in this repository names a personal filesystem path` | `tests/package.test.mjs` | existing, unchanged: the edited files name no home path | — | S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the edited sections |
| 2 — something selects it | CLAUDE.md is loaded into every session here |
| 3 — the caller can discover it | the section anchors records cite |
| 4 — it is used | nothing measures this yet |

## Mutation Log
- 2026-10-13 · e6a00957* · mutant killed · exit 1 · `CLAUDE.md` · the rulebook stops naming the command that carries §13, and the agent repeats the chain by hand · acceptance-sha256:999afd50004b422cac64c8d04a77797df26358a5128723d4ad89aa2d002def86

## Invariants

- Every `CLAUDE.md §N` a record or source comment cites still resolves to a heading.

## Risks

- A rule shortened past what the command enforces: S3's human proof reads the diff for it.

## Stop Condition

Stop and ask if a §13 step has no command or rule file to carry it after T3.

## Out of Scope

- Any section other than §2, §12 and §13.

## Verification Log
- 2026-10-13 · e6a00957* · exit 1 · `grep -qE '^## 12\. Reviews$' CLAUDE.md && grep -qE '^## 13\. Releasing$' CLAUDE.md \ …` · acceptance-sha256:999afd50004b422cac64c8d04a77797df26358a5128723d4ad89aa2d002def86 · ms:32 · test-lock-sha256:b51e55e9016d2761e43afc1d25acf4fbb87f19f87731260015aca429e663cc95 · test-lock-b64:Y2hlY2tAMglmN2UyNTFiNTAzY2FlZmVjYmExMTIyMWFkMmNjMjIyNzcwNjE0MDU3M2JlYTIwZDYxZDk5ODdkYTdiNjA1MjU2CmJvZHkJdGVzdHMvcGFja2FnZS50ZXN0Lm1qcwlhIENMSSBlbnRyeSBndWFyZCByZXNvbHZlcyBvbiBXaW5kb3dzLCBub3Qgb25seSB3aGVyZSBhcmd2IGlzIGFscmVhZHkgYSBVUkwgcGF0aAk3MTU0NTRiZmI0MjE1ZGZhYWZmZWU2NzVmMTAxYTUyY2U1NzZjMjk2MzRiNGNiMzg5ZjFkY2I1YmUyM2M5OTU2CmJvZHkJdGVzdHMvcGFja2FnZS50ZXN0Lm1qcwlhIGZlbmNlIHdob3NlIHJ1bm5lciBuZXZlciBzdGFydHMgbXVzdCBmYWlsCTNlNDQ4N2Y1ZjM3YmI2ODAyYjMzZWYyZGU0ODMzYjU2MTRhMTFhYjk2NjgzNmRjZTk1OTdlOThlOTAzOTRmNjgKYm9keQl0ZXN0cy9wYWNrYWdlLnRlc3QubWpzCWEgbXV0YXRpb24gdGhhdCBtYXRjaGVzIGFjcm9zcyBsaW5lcyB0YXJnZXRzIGEgZmlsZSBnaXQgY2hlY2tzIG91dCB3aXRoIExGCThkODM2N2M5NTQ4MDM2ZGFmMTZiN2Q4MzQwZWZlY2E5Y2U4NTBlZGJhZjQzNWQ1MjdlMTVhYjhjMzk5MTMzMjMKYm9keQl0ZXN0cy9wYWNrYWdlLnRlc3QubWpzCWEgcGx1Z2luIHZhbGlkYXRlIHRoYXQgZGllcyBzYXlpbmcgbm90aGluZyBpcyBVTlJVTiwgbm90IGEgZmluZGluZyBhYm91dCB0aGUgbWFuaWZlc3QJOGRiYjUyZmNkYjk3NzQwMmZlYTM4MzI4ODQ4MzE4NmMyOWMwNWU5YjA4NGEwMmUzZTdiNWM1YzJkOGNhMDA1OQpib2R5CXRlc3RzL3BhY2thZ2UudGVzdC5tanMJYWRyLWV4ZWN1dGUgc2F5cyB0aGUgbXV0YXRpb24gcGFzcyBhbHJlYWR5IHJlY29yZHMgdGhlIHZlcmlmaWNhdGlvbiBlbnRyeQk5YTU5MzUzZWIwNWZlZjhiZmUwOGVjYzJmNGY2ZjA1NTcxYmFlNjg0OGI0OTJiNjQ2MTllYTY2ZDI0ZDRmZWQxCmJvZHkJdGVzdHMvcGFja2FnZS50ZXN0Lm1qcwlhbiBhZ2VudCBkZWZpbml0aW9uJ3MgbmFtZSBtYXRjaGVzIGl0cyBmaWxlCWE3ZDM1OWE1YzRiNDgzZjFjNTM5ZTJhMjc0Y2YyNDI1NjIxZGMyYzVhY2NlODQ2NjNhMWZmMjcyODRiNTkzZGQKYm9keQl0ZXN0cy9wYWNrYWdlLnRlc3QubWpzCWFuIGFydGlmYWN0IHVwbG9hZCBvZiBhIGRvdGZpbGUgYXNrcyBmb3IgaGlkZGVuIGZpbGVzLCBvciBpdCB1cGxvYWRzIG5vdGhpbmcgYW5kIHNheXMgc3VjY2VzcwlhYjFiNTU4ODUzNWIyMjJlYzhhN2QzNjliYmY5ZDEwNDNjMjc4MmMyMDFiYzE5MjZkY2ZjNTU3MzM3MDg5NTcxCmJvZHkJdGVzdHMvcGFja2FnZS50ZXN0Lm1qcwljb2RlIHRoYXQgc2hpcHMgaXMgY2hlY2tlZCBvdXQgTEYgd2hhdGV2ZXIgaXRzIGV4dGVuc2lvbgk5NmI4MjA4ZjA5NDVkYjU5MjRkYjY1YmNjZGMxYjRhZjdhMDU3MGU5NDU1OTE1ZGU0YmExNWFmODI1OTIwYjFiCmJvZHkJdGVzdHMvcGFja2FnZS50ZXN0Lm1qcwljb250aW51b3VzIGludGVncmF0aW9uIHJ1bnMgdGhlIGNoZWNrcyB0aGlzIHJlcG9zaXRvcnkgb3ducwljMGRkNDAxMDQ5MzIxZjlmNmZkNzdkYjQwN2QxYmIwYzViOTczMTY3NWFhYjllMDExNDk2ZWY2NzgwODRmYWYxCmJvZHkJdGVzdHMvcGFja2FnZS50ZXN0Lm1qcwlldmVyeSBQeXRob24gZ2F0ZSBzYXlzIGl0cyBvdXRwdXQgaXMgVVRGLTgsIHdoYXRldmVyIHRoZSBjb25zb2xlIGNvZGVwYWdlIGlzCTYwNDYyMTJmNzZmOWJhNjY1MzcyMjQ2OTM0NzhjMzY3OWUxMDY1YzM4OTFmMWQ5OGVmN2UxNGZlOWEzNTgzMjMKYm9keQl0ZXN0cy9wYWNrYWdlLnRlc3QubWpzCWV2ZXJ5IGNhdGFsb2d1ZSBlbnRyeSBuYW1lcyB0ZXN0cyB0aGUgY2FtcGFpZ24gY2FuIGFjdHVhbGx5IHNwYXduCWI5MDEyZmQ2OThkZjliZWI5NzgxY2M3MjIyMWYxNzVmM2FjODgyMzgxZDc3NzRlYmY4OWFmZDJlNDk0MDc4ZDUKYm9keQl0ZXN0cy9wYWNrYWdlLnRlc3QubWpzCWV2ZXJ5IGNhdGFsb2d1ZSBlbnRyeSBzdGlsbCBtYXRjaGVzIHRoZSBzb3VyY2UgaXQgbXV0YXRlcywgZXhhY3RseSBvbmNlCTk3M2U3ZDdmOTY4YWZiMjUwOGFhYjMyNTA0M2M4ODZiOWI3Yzg0ZTZmNzYzYjdjYWMyMDZkODgyMzQwNmMxNzgKYm9keQl0ZXN0cy9wYWNrYWdlLnRlc3QubWpzCWV2ZXJ5IGNhdGFsb2d1ZSBtdXRhbnQgc3RpbGwgcGFyc2VzLCBzbyBhIGtpbGwgaXMgYmVoYXZpb3VyYWwJYzA4ZGQ3ZjgwYmY2ZTRhNzQ0NTBhOGExNWQ0NWUwYTA5NDUwYjBmMzgxNzJlZTE5NTAzYjE1ZjFmYzNmNDBjZApib2R5CXRlc3RzL3BhY2thZ2UudGVzdC5tanMJZXZlcnkgbXV0YXRpb24gc2hhcmQgY29tcHV0ZXMgaXRzIHNsaWNlIGZyb20gb25lIHNuYXBzaG90LCBub3QgaXRzIG93biBjYWNoZSBsb29rdXAJNDE0MTU1NjFiZjc3NWRhYmYxYjA4Mzg1NzAwNzIzMmJlZjEwNTk2ZTNiOGNmOTljZTQ5MzdiNjVlYzIyZDQ2Mgpib2R5CXRlc3RzL3BhY2thZ2UudGVzdC5tanMJZXZlcnkgcGF0aCBhbiBldmFsIHJ1biB3cml0ZXMgdG8gaXMgaWdub3JlZCwgd2hlcmV2ZXIgaXQgaXMgcnVuIGZyb20JNzYyOTMxMTljMzI1MDdhNDZhZGZiYTAzYWQ2Y2Y2NDJiNDE3N2E5NjE4OGM1YzZlMDliODk5ODBjOTljZDQ3ZApib2R5CXRlc3RzL3BhY2thZ2UudGVzdC5tanMJZXZlcnkgc2hpcHBlZCBhZ2VudCBkZWZpbml0aW9uIG5hbWVzIGEgY2FwYWJpbGl0eSBjbGFzcwk4N2Q5ZjEwOWIxMDA2NWU5N2VhMTRiZjdlMWVkMjQ4Nzc4MWY4ZDhjNGFiODBhZTI2MzFhZTg4NDEwMTZmYjY3CmJvZHkJdGVzdHMvcGFja2FnZS50ZXN0Lm1qcwlldmVyeSBzaGlwcGVkIGdhdGUgY2FycmllcyBhdCBsZWFzdCBvbmUgbXV0YXRpb24JZjE2Mjg2ODUxN2Q4NWJlYmY1ZTU5MjAxODg4MDk0ZjJlYjlkNzA3OWJlOGEwNWNlNmMxZDMzMjBmODcyNGE0Mwpib2R5CXRlc3RzL3BhY2thZ2UudGVzdC5tanMJaW1wb3J0aW5nIGEgc2NyaXB0IHJ1bnMgaXRzIENMSSBvbiBub2JvZHkJYjYwY2Q0Y2I0NWE4YzZmYjA3MDc2MTYzZjUxN2UwYmJkMDNiZmRkMzM5NTYwODcwMzBhYTkxMjZmMzJlZGU4MApib2R5CXRlc3RzL3BhY2thZ2UudGVzdC5tanMJbWFuaWZlc3QgYW5kIGhvb2sgY29uZmlndXJhdGlvbiBleHBvc2UgdGhlIGJ1bmRsZWQgY29tcG9uZW50cwlhYjY5ZmVmYTM3ZDg5OGI2OGE1YjlhOTAzNDM4MTRlNzgxMDQyOTM3MWIwODM5OTMzMmU5MmVjZDNlZWUyNWY5CmJvZHkJdGVzdHMvcGFja2FnZS50ZXN0Lm1qcwlubyBhY2NlcHRhbmNlIGZlbmNlIGRpc2NhcmRzIGl0cyBydW5uZXIgZXhpdCBzdGF0dXMJN2U1MDU5NzBkYjhmZmZkNWI5M2U0YjU4Zjk3NmQwMzY2MjY4MzhjNjRkMTk5NDhjOGNkNDkzZGY2NzBmMDllYQpib2R5CXRlc3RzL3BhY2thZ2UudGVzdC5tanMJbm8gam9iIGluIHRoZSByZWxlYXNlIHdvcmtmbG93IGlzIGNvbmRpdGlvbmVkIHNvIGEgZGlzcGF0Y2hlZCBydW4gc2tpcHMgaXQJNDg5YTc1NDM4YmRlMDkzODA3NmY4NGVmYzBmNTJkN2FmZGMzZGY5MzMxZTI5MGQzOWJlZTc5YWIyZWE3YTdlZApib2R5CXRlc3RzL3BhY2thZ2UudGVzdC5tanMJbm8gbXV0YXRpb24gdG9vbCBsZWZ0IGEgZ2F0ZSBuZXV0ZXJlZCBpbiB0aGlzIHRyZWUJOGRmMDI2YWMwM2U3NTljNWU2MzcxZGUwZmNlY2MzZmE3MDViYmU5YWQwMDk0MmJkZTY4ZTNhYmYzMWFlMmM2NApib2R5CXRlc3RzL3BhY2thZ2UudGVzdC5tanMJbm8gdHJhY2tlZCBwYXRoIGlzIGxvbmcgZW5vdWdoIHRvIGZhaWwgYSBkZWZhdWx0IFdpbmRvd3MgaW5zdGFsbAlmN2U2YjdiNmZjNWY2MzZlMjQzNzNhOGNjZjY2ZGVhYTBjZWZiZDkyOGI4MzcxY2FjNDBiMzZiMzFjNWFjMmE1CmJvZHkJdGVzdHMvcGFja2FnZS50ZXN0Lm1qcwlub3RoaW5nIHRyYWNrZWQgaW4gdGhpcyByZXBvc2l0b3J5IG5hbWVzIGEgcGVyc29uYWwgZmlsZXN5c3RlbSBwYXRoCTc0YjVhODJkOGFjYjgwNmZlZTQwNzFkZDRjYWM5YTJjYzdmOGNhMDZjNzU4MjkyOTE2NDljOGIxNDIwNmQzNzIKYm9keQl0ZXN0cy9wYWNrYWdlLnRlc3QubWpzCXNlbGZ0ZXN0IHByaW50cyBpdHMgdmVyZGljdCBhcyB0aGUgbGFzdCB0aGluZyBpdCBkb2VzCTUyNjEyNmQ1NWYyYzI3M2NhNDczZTNhMGU1MDdiYjhiMzExYTkwYzQ4ODhmMzVlODg1ZDM2MjQ0Y2Y1OTAyOTMKYm9keQl0ZXN0cy9wYWNrYWdlLnRlc3QubWpzCXNoaXBwZWQgZ3VpZGFuY2UgdGVhY2hlcyBnZW5lcmF0ZWQgcmVzdG9yZSB0cmFuc2FjdGlvbnMJOTc0YzRhY2YzNzlmYjY3N2M0MDI5NzNmY2YxZTk5YTE1ZTk2YWE5ZDY1ZWU4MGEzZTcxMzZmNmFjMjY1OGIyMgpib2R5CXRlc3RzL3BhY2thZ2UudGVzdC5tanMJdGhlIFJFQURNRSBuYW1lcyBldmVyeSBza2lsbCBhbmQgZ2F0ZSB0aGlzIHBsdWdpbiBzaGlwcwkyM2IxYWUwMDNkY2M4Mzk2ZWI4NzM4YmU2NDUwNmQ0YzhjM2ZmNmJiZmRiMmM4YTcyNGIwZjkyNTkzNDFhMTg5CmJvZHkJdGVzdHMvcGFja2FnZS50ZXN0Lm1qcwl0aGUgYmFja2xvZyBpbmRleCBkb2VzIG5vdCB1bmRlcnNlbGwgd2hhdCB0aGUgYmFja2xvZyBzYXlzIGl0IGZpbmlzaGVkCWViZTUyMTVmMDhlNjNmM2Y1NWFlMGRjYTk2OWI5ODMwNzllYjIwNTg5NTMwYzBiODg1OTQwNWMzODM0OGQ4NmUKYm9keQl0ZXN0cy9wYWNrYWdlLnRlc3QubWpzCXRoZSBiYWNrbG9nIGluZGV4IGRvZXMgbm90IHVuZGVyc2VsbCB3aGF0IHRoZSBiYWNrbG9nIHNheXMgaXQgZmluaXNoZWQsIGFyY2hpdmVkIHNlY3Rpb25zIGluY2x1ZGVkCTBkNGVjOWMzZjBmNzM0ZmUzM2NjYzQ5YmViNTdmNmE5YWYwN2Y3MmE1NWU1N2RhNWM5MTQ4NGEyODNiNWUzNGIKYm9keQl0ZXN0cy9wYWNrYWdlLnRlc3QubWpzCXRoZSBob29rIGNvdmVycyBzaGlwcGVkIC5zaCBhbmQgbGVhdmVzIHRoZSAuY21kIHNoaW1zIGFsb25lCWE5MmU5YTA4ZjNjMDY5NmYyODdmZjgxZWYwNzE0ODJlZjQ4ZDI0MTJkZTZjYTA2MTZhZjM3NjIyNzBlNDdiOTAKYm9keQl0ZXN0cy9wYWNrYWdlLnRlc3QubWpzCXRoZSBpbnN0cnVjdGlvbiBmaWxlcyBuYW1lIHBhdGhzIHRoYXQgZXhpc3QJNTlkYzdjZTY5YjY0N2FkN2FlYmMxZTgxNTMxMDBlNGExYjcxYjA0MGVmZTdlOWU1MTMzZGJmZjk3YmI4Y2VlNwpib2R5CXRlc3RzL3BhY2thZ2UudGVzdC5tanMJdGhlIHBsdWdpbiBjb250YWlucyB0aGUgY29tcGxldGUgcmV1c2FibGUgZGVjaXNpb24gbGlmZWN5Y2xlCWY4ZDdkMGFiOTRjNzM5ZjBkMzY3ZDI4YmY5NGU0MDVmNDg3MDU3YmJjZjcxNDhhN2M2OWI0ZGQzM2M4Y2M0ODMKYm9keQl0ZXN0cy9wYWNrYWdlLnRlc3QubWpzCXRoZSBwcmUtY29tbWl0IGhvb2sgcmVmdXNlcyBhIGNvbW1pdCB0YWtlbiBtaWQtbXV0YXRpb24sIGFuZCBvbmx5IHRoZW4JZjZkYjJlNGRkMDRjZWEyMzYwZjViNmU3YjQ1NGU5NzlkZTZjZTlhMGQzODcxYmQ0NmRlNTdmMWIxYmIxZWM1ZQpib2R5CXRlc3RzL3BhY2thZ2UudGVzdC5tanMJdGhlIHByZS1jb21taXQgaG9vayByZWZ1c2VzIGEgc3RhZ2VkIHNoaXBwZWQgZmlsZSB0aGF0IG5vdGhpbmcgbXV0YXRlcwkxYzdhNTY3YmRiMjU4MDY3NmFiNmJkZWY2MjEyZjQzOWI3M2ViNWU2NjIxNDEwYTJkNDQ5MTUwMTg5MjIxZTc4CmJvZHkJdGVzdHMvcGFja2FnZS50ZXN0Lm1qcwl0aGUgcHVibGlzaGFibGUgcGx1Z2luIGhhcyBubyBkZXBlbmRlbmN5IG9uIGEgcGVyc29uYWwgaW5zdGFsbCBvciByZXRpcmVkIHBhY2thZ2UJODk0Y2ZjYTJhMzYyY2E4YTdlOTYxYTdhZWNmNDViYTA4ZjMzZjg0ODBjMTM2NzYwMDQ4ZmIyODc2YzAwNTI5Ngpib2R5CXRlc3RzL3BhY2thZ2UudGVzdC5tanMJdGhlIHN0YWdlZCBndWFyZCByZWFkcyB0aGUgY2F0YWxvZ3VlIGFzIHN0YWdlZCwgYW5kIGZhbGxzIGJhY2sgb25seSB3aGVuIGl0IGNhbm5vdAk1MjliNmJlNGQ0YzlhYjBhMGI0MTBmNmEwYjQ5MmFhNjI1NDFjYzRjZDNhNTk5MzMxOTFmN2I0NjM1MjU2NjliCmJvZHkJdGVzdHMvcGFja2FnZS50ZXN0Lm1qcwl0aGUgc3RhZ2VkLW11dGF0aW9uIGd1YXJkIGZpbmRzIGFuIHVuY292ZXJlZCBhZGRpdGlvbiwgYW5kIG9ubHkgdGhhdAljODVjZTFlMjk0MmIwNjJlNjljZDUwZDAzNmE0YjljOGU1ZjQ0OGM5ZjhkZWM0YjBiNTM4NGRkMzUzNDdjYjhhCmJvZHkJdGVzdHMvcGFja2FnZS50ZXN0Lm1qcwl3aGF0IHNoaXBzIGlzIHRoZSBwbHVnaW4gYW5kIG5vdGhpbmcgZWxzZQljODcwNTY0MDRkMDJhMTgzNTA5ZDU1NWY4MzFjODBhNTEwMTY2NTU2NWFlNTlmNGIyYmIzNGE3MDcyZjZjNTYx
  ```
  ```
- 2026-10-13 · e6a00957* · exit 1 · `grep -qE '^## 12\. Reviews$' CLAUDE.md && grep -qE '^## 13\. Releasing$' CLAUDE.md \ …` · acceptance-sha256:999afd50004b422cac64c8d04a77797df26358a5128723d4ad89aa2d002def86 · ms:7202
  ```
  --- last 10 line(s) of stdout (of 75 after folding 75 raw)
        at Test.postRun (node:internal/test_runner/test:1542:19)
        at Test.run (node:internal/test_runner/test:1467:12)
        at async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3) {
      generatedMessage: false,
      code: 'ERR_ASSERTION',
      actual: [ 'CLAUDE.md: origin/main' ],
      expected: [],
      operator: 'deepStrictEqual',
      diff: 'simple'
    }
  ```
- 2026-10-13 · e6a00957* · exit 0 · `grep -qE '^## 12\. Reviews$' CLAUDE.md && grep -qE '^## 13\. Releasing$' CLAUDE.md \ …` · acceptance-sha256:999afd50004b422cac64c8d04a77797df26358a5128723d4ad89aa2d002def86 · ms:7155
- 2026-10-13 · e6a00957* · exit 0 · `grep -qE '^## 12\. Reviews$' CLAUDE.md && grep -qE '^## 13\. Releasing$' CLAUDE.md \ …` · acceptance-sha256:999afd50004b422cac64c8d04a77797df26358a5128723d4ad89aa2d002def86 · ms:7324
