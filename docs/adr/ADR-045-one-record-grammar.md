# ADR-045: One record grammar, loaded, not copied

**Status:** Accepted
**Date:** 2026-09-11
**Owner:** zy
**Spec:** `docs/specs/2026-09-11-one-record-grammar.md`
**Cross-references:** ADR-005, ADR-010, ADR-011, ADR-017, ADR-020, `plugin/lib/fence.py`, `scripts/coverage.sh`, `.gitattributes`

**Governs:** `plugin/lib/record.py`, `plugin/bin/adr-lint`, `plugin/bin/adr-verify`, `plugin/bin/adr-next`, `plugin/bin/spec-verify`, `plugin/bin/arch-lint`, `plugin/bin/adr-debt`, `plugin/bin/adr-retire-check`, `tests/adr-next.test.mjs`, `tests/gates.test.mjs`, `tests/gate-regressions.py`, `tests/mutations.json`

Class: every definition of the record grammar in the gates, and every git listing named `tracked_paths`. Enumerated 2026-09-11 on `ea12656`:

```
$ rg -n 'def sections_of|def sections\(|def normalize_acceptance|def acceptance_digest' plugin/bin
plugin/bin/adr-debt:232:def sections_of(text):
plugin/bin/arch-lint:60:def sections_of(text):
plugin/bin/adr-next:207:def sections(text):
plugin/bin/adr-next:220:def normalize_acceptance(raw):
plugin/bin/adr-retire-check:109:def sections_of(text):
plugin/bin/adr-verify:240:def normalize_acceptance(raw):
plugin/bin/adr-verify:257:def acceptance_digest(command):
plugin/bin/adr-lint:376:def sections_of(text):
plugin/bin/adr-lint:605:def normalize_acceptance(raw):
plugin/bin/adr-lint:620:def acceptance_digest(command):
plugin/bin/spec-verify:107:def sections_of(text):
$ rg -n 'def tracked_paths' plugin/bin
plugin/bin/adr-lint:3445:def tracked_paths(root):
plugin/bin/arch-lint:279:def tracked_paths(root):
$ rg -n '\(\?=\^## \|\\Z\)' plugin/bin
plugin/bin/adr-verify:666:    m = re.search(rf"(^## {re.escape(section)}\s*\n)(.*?)(?=^## |\Z)", text, re.M | re.S)
plugin/bin/adr-verify:1672:    section = re.search(r"^## Ordered Steps$(?P<body>.*?)(?=^## |\Z)", text,
plugin/bin/adr-verify:1983:    section = re.search(r"^## Verification Log\s*\n(.*?)(?=^## |\Z)",
plugin/bin/adr-verify:2171:    section = re.search(r"^## Acceptance\s*$(.*?)(?=^## |\Z)", text, re.M | re.S)
plugin/bin/adr-verify:2542:    m = re.search(r"^## Acceptance\s*$(.*?)(?=^## |\Z)", text, re.M | re.S)
```

Members in: the eleven `def`s (moved to `plugin/lib/record.py`, copies deleted); adr-verify:2171 and :2542 (the two Acceptance readers, which decide the digest; they move to `sections_of`); adr-lint:3445 (renamed). Members left out: adr-verify:666, :1672, :1983 — fence-blind readers that do not decide a digest; filed in `docs/BACKLOG.md` with this enumeration. arch-lint:279 keeps its name and body. `class Findings`, `_Unreadable`, `scan_code_only` are not grammar and stay per gate.

**Enforced-by:** `tests/adr-next.test.mjs::a heading inside the Acceptance fence is not a heading: adr-next agrees with adr-verify's digest`, `tests/gates.test.mjs::the record grammar is one module: every gate loads plugin/lib/record.py and none keeps a copy`, `tests/gates.test.mjs::record.py: a fenced ## is not a heading, blank edges are trimmed, and the digest is sha256 of exactly that`, `tests/gates.test.mjs::a gate copied without plugin/lib says so and exits 2; with lib/ beside it, it runs`, `tests/gates.test.mjs::adr-lint's tracked_or_unignored_paths includes an untracked file; arch-lint's tracked_paths excludes it`
**Invalidates:** ADR-011 §Alternatives "One shared grammar module imported by both" — partly. That rejection reasoned from `plugin/bin/`, where `standalone-link.mjs` writes a forwarder per file. `plugin/lib/fence.py` (commit `1a400ca`, 2026-09-06) established the alternative it did not have: a module under `plugin/lib/`, which the package tests do not read as a gate, the forwarders never copy (`standalone-link.mjs` lists `lib` among the directories that stay at the plugin root), and each gate loads from its own path. ADR-011's Python/JS split (`adr-lint` and `lifecycle.mjs` are two languages) is untouched; its decision to ship two implementations of `Governs:` resolution stands. ADR-011 is history and is not edited.
**Served-path change:** `adr-next` and `adr-verify` read an Acceptance fence that contains a `## ` line as adr-lint does, so a task `adr-verify` verified is one `adr-next` reports done; a gate copied without `lib/` says so and exits 2.

## Context

Inherited from `docs/specs/2026-09-11-one-record-grammar.md` §Problem / §Goal. Executed 2026-09-11: a task file whose Acceptance fence holds `## B` reads as sections `['A', 'B', 'Verification Log']` to adr-next and `['A', 'Verification Log']` to adr-lint; `adr-verify` on the same file exits 2 with "no non-empty ```bash fence under ## Acceptance", because its own two Acceptance readers stop at the fenced heading. So the three tools that must agree on one digest (ADR-010, ADR-020) hold three readers, and two of them are wrong in the same way.

ADR-010 accepted the duplication explicitly ("the gates are standalone with no import path — so the trade is accepted") and ADR-020 counted the copies ("exist in three gates"). Both predate `fence.py`. The trade is no longer necessary, and this record is where that is written down.

Debt at authoring (`python3 plugin/bin/adr-debt docs/adr`): none of the deferred rows is this grammar; ADR-011's rejected alternative is the nearest and is addressed above.

## Existing Primitives Audit

- `plugin/lib/fence.py` and its preamble in adr-verify / spec-verify / qh-mcp — **reused as the model.** `record.py` is loaded with the same lines: `realpath(__file__)` → `lib/`, `isfile` check → exit 2 with a sentence, `spec_from_file_location`, displace a foreign module of the same name.
- adr-lint's `sections_of` / `normalize_acceptance` / `acceptance_digest` — **moved verbatim** into `record.py`; they are the fence-aware bodies the other four `sections_of` copies already equal.
- adr-next's `sections` / `normalize_acceptance` / inline sha256 — **deleted**, replaced by the shared three. `sections` differs from `sections_of` in three ways (no fence toggle; `##\s+` rather than `## `; `setdefault` on a repeated heading) and every one of them is a disagreement with the writer of the evidence it reads.
- adr-verify's `acceptance_of` and the recording path's Acceptance regex — **reshaped** to read the section through `sections_of`, then apply `ACCEPTANCE_FENCE` as before. Its other three `(?=^## |\Z)` readers — **left**, filed.
- adr-lint's `tracked_paths` — **renamed**, body unchanged. arch-lint's — **left**.
- `scripts/coverage.sh` — **leave.** It already lists `$ROOT/lib` as a Python source. `.gitattributes` — **leave.** `*.py text eol=lf` covers the new file; asserted with `git check-attr`, not by reading.

## Decision

**The record grammar is one module, `plugin/lib/record.py`, loaded by path from every gate that reads it; the two git listings are named for their rule.**

1. `plugin/lib/record.py` exports `sections_of`, `normalize_acceptance`, `acceptance_digest`. Bodies are adr-lint's, unchanged.
2. `adr-lint`, `adr-verify`, `adr-next`, `spec-verify`, `arch-lint`, `adr-debt`, `adr-retire-check` load it the way `fence.py` is loaded and define none of the three names. A gate without `lib/record.py` beside its `bin/` exits 2 with one sentence naming the file and the directory it looked in.
3. `adr-next` reads sections, normalizes and hashes through the shared functions only. `adr-verify` reads the Acceptance section through `sections_of` in both places that read it.
4. adr-lint's listing is `tracked_or_unignored_paths`; arch-lint's stays `tracked_paths`. Neither body changes.
5. Not shared, by decision: `class Findings`, `_Unreadable`, `scan_code_only`, `tracked_paths`.

## Alternatives Considered

- **Fix adr-next's `sections` in place and keep the copies.** Rejected: the fourth copy of a function that had already drifted once. The finding is about the class.
- **Share `class Findings` too.** Rejected: each gate's `Findings` docstring is that gate's block/advise policy (CLAUDE.md §3), and a shared class would make a policy change in one gate a behaviour change in six.
- **Rename arch-lint's listing to `committed_paths`.** Rejected: `ls-files --cached` lists the index, and a staged file is in the index without being committed. The name would be false on the case the docstring is about.
- **Rename adr-lint's to `tracked_or_added_paths`.** Rejected: in git, "added" means staged. adr-lint's second call lists files that are not staged at all. `tracked_or_unignored_paths` names the two `ls-files` calls it makes.
- **Make every `(?=^## |\Z)` reader in adr-verify fence-aware now.** Deferred: 666 rewrites text by position and 1983 reads the log; neither decides a digest, and each needs its own regression. Filed.

## Component / Boundary Impact

| Component | Ownership after change | Why it changes |
|----------|------------------------|----------------|
| `plugin/lib/record.py` | plugin lib (shared, loaded by path) | new home of the grammar |
| `plugin/bin/adr-next` | reader of evidence | fence-aware; shared digest |
| `plugin/bin/adr-verify` | writer of evidence | Acceptance read fence-aware; shared digest |
| `plugin/bin/adr-lint`, `spec-verify`, `arch-lint`, `adr-debt`, `adr-retire-check` | readers of records | copies deleted; loader preamble |
| `plugin/bin/adr-lint` `tracked_or_unignored_paths` | pointer resolution | named for its rule |
| `tests/mutations.json` | mutation campaign | entries on `plugin/lib/record.py` and the new preambles |

## Wiring & Contract Changes

Inherited from the spec §Contracts Touched; delta: none.

## Inter-task Contracts

None. T2 does not depend on T1; the rename touches no grammar.

## Implementation

See `docs/adr/ADR-045-one-record-grammar/tasks/README.md`.

## Consequences

- **Positive:** one computation of the digest; a `## ` line in a fence is text to every gate; a copied gate says why it cannot run.
- **Negative:** five gates that ran on their own now need `lib/` beside `bin/` — the shape every install and every forwarder already has, and the shape a stale copy does not.
- **Neutral:** no existing `acceptance-sha256:` changes; only a fence containing a `## ` line ever had two readings.

## Out of Scope

Inherited from the spec §Non-Goals; delta: none.

- Sharing `class Findings`, `_Unreadable`, `scan_code_only`, `tracked_paths` (permanent: boundary: each is one gate's policy or one gate's helper)
- adr-verify:666, :1672, :1983 fence-blind readers (deferred: `docs/BACKLOG.md`, filed 2026-09-11 with the enumeration above; none decides a digest)
- adr-next matching only a bash-labelled Acceptance fence while adr-verify also reads sh and shell labels (deferred: `docs/BACKLOG.md`)
- Editing ADR-011 (permanent: boundary: records are history, CLAUDE.md §10)
- Moving `fence.py` or any tracked path (permanent: boundary: no `Governs:` or `file:` path changes but the additions here)

## Risks

Inherited from the spec §Risks; delta: none.

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| A gate resolves `lib/` from cwd or PATH | Med | High | `fence.py` preamble verbatim; no-lib test runs from the repository cwd against a gate in a temp `bin/` |
| A digest changes for an existing fence | Low | High | `normalize_acceptance` bytes unchanged; only a fenced `## ` line ever differed |
| A copied gate dies for a helper | Med | Med | one sentence, exit 2, and the same gate shown running with `lib/` |
| The rename misses a call site | Low | High | `rg` before and after; the test asserts the old name is absent from adr-lint |

## Rollback

Restore the eleven `def`s from `ea12656`, delete `plugin/lib/record.py` and the preambles, rename `tracked_or_unignored_paths` back. No persistent state; no evidence row changes either way.

## Follow-ups

- [ ] adr-verify:666 / :1672 / :1983 — fence-aware readers, each with its own regression (`docs/BACKLOG.md`).
