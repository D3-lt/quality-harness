# Spec: Compose the statusline segment; do not replace statusLine

> **Date:** 2026-09-10 · **Status:** Ready-for-ADR
> **Owner:** zy · **Becomes:** ADR-044
> **Gate:** Status may become Ready-for-ADR only after `spec-verify --spec <this file>` exits 0.
> **Cross-references:** docs/INSTALL.md, plugin/README.md (The status line), plugin/scripts/statusline.mjs, plugin/hooks/hooks.json, docs/specs/2026-09-10-layer-from-stages-catalog.md (sibling leftover: `--json` `layer`, not this Goal), docs/specs/2026-09-10-statusline-layer-unproven-as-advise.md (ADR-042), docs/adr/ADR-038-a-staged-product-not-a-funnel.md, docs/adr/ADR-042-unproven-write-is-advise.md

## Problem

An adopting engineer replaced their whole Claude dashboard because the only copyable `statusLine.command` is `node "$(qh-root)/scripts/statusline.mjs" <<< "$input"` (INSTALL.md:85, plugin/README.md:31, statusline.mjs:20). Prose already said "add the segment" / "Add this to your own command"; the paste surface is still a replacement. Their old host script still exists. `hooks.json` has no `statusLine`.

## Goal

Every shipped copy-paste for the QH segment shows compose: keep the host command, append QH stdout from the same `$input`. QH does not set Claude's bar.

## Actors

| Actor | Kind | Goal |
|-------|------|------|
| adopting engineer | human role | paste the recipe without replacing an existing dashboard |
| shipped copy-paste | system | INSTALL.md and plugin/README.md (and the statusline.mjs header) show compose, not a standalone command |
| `statusline.mjs` | system | keep printing one line or empty and exiting 0; this fact does not add a layer token |
| Claude Code `statusLine` | system | remain user-owned, including any `refreshInterval` |

## Use Cases

### UC-1: An adopting engineer pastes a compose recipe that keeps the host command

- **Trigger:** they follow INSTALL or plugin README to wire the QH segment · **Preconditions:** they may already have a `statusLine.command` (a host dashboard script) and may have `refreshInterval`
- **Main flow:**
  1. They copy the shipped recipe, not a nearby sentence.
  2. The recipe keeps the host command, feeds the same `$input` to `statusline.mjs`, and appends that stdout (one line or empty, exit 0).
  3. Any existing `refreshInterval` stays; the recipe does not tell them to delete it.
- **Failure paths:**
  - a. at step 1, the only copyable block is the QH one-liner → they paste it as the whole `statusLine.command` and the host dashboard disappears (the live miss).
  - b. at preconditions, they have no host command yet → still user-wired; QH does not set Claude's bar; `hooks.json` has no `statusLine`.
  - c. at step 3, the recipe requires deleting `refreshInterval` → forbidden.
  - d. after claims QH installed Claude's bar → forbidden.
- **Postconditions:** the copy-paste itself shows compose. Host command remains. QH stdout from the same `$input` is appended. `refreshInterval` is not required to be deleted. No layer token on the segment. Does not reverse ADR-038–042.

## Scenarios

### UC1-S1 [happy] the copy-paste recipe shows compose of host command plus QH stdout [@implemented] → `tests/statusline.test.mjs::statusline segment: copy-paste is compose not a replacement command` cmd:`node --test --test-name-pattern 'statusline segment: copy-paste is compose not a replacement command' tests/statusline.test.mjs`

```gherkin
Given a host statusLine.command already exists and may set refreshInterval
When the adopting engineer follows the shipped copy-paste in INSTALL or plugin README
Then that recipe keeps the host command
And it feeds the same $input to statusline.mjs
And it appends that script's stdout (one line or empty, exit 0)
And it is not the QH one-liner as the entire statusLine.command
```

### UC1-S2 [failure] the only copyable snippet is not a replacement of statusLine.command [@implemented] → `tests/statusline.test.mjs::statusline segment: copy-paste is compose not a replacement command` cmd:`node --test --test-name-pattern 'statusline segment: copy-paste is compose not a replacement command' tests/statusline.test.mjs`

```gherkin
Given the class of copyable snippets: docs/INSTALL.md, plugin/README.md, plugin/scripts/statusline.mjs header
When those files are the paste surface
Then none of them is a standalone statusLine.command that replaces the host command
And the after shows compose (keep host command, append QH stdout from the same $input)
```

### UC1-S3 [failure] the recipe does not require deleting refreshInterval and does not claim QH set the bar [@implemented] → `tests/statusline.test.mjs::statusline segment: recipe does not delete refreshInterval or claim QH set the bar` cmd:`node --test --test-name-pattern 'statusline segment: recipe does not delete refreshInterval or claim QH set the bar' tests/statusline.test.mjs`

```gherkin
Given a host statusLine that already has refreshInterval
When the shipped recipe is applied
Then refreshInterval is not required to be deleted
And the recipe does not claim QH set Claude's bar
And plugin/hooks/hooks.json still has no statusLine
```

### UC1-S4 [failure] this fact does not put a layer token on the statusline [@implemented] → `tests/statusline.test.mjs::the wired statusline segment does not grow a layer token` cmd:`node --test --test-name-pattern 'the wired statusline segment does not grow a layer token' tests/statusline.test.mjs`

```gherkin
Given statusline.mjs render() and the sibling --json layer spec
When this fact's after is applied
Then render() still has no layer token
And layer on the bar stays a third leftover, not this Goal
```

## Facts

| ID | Assertion (invariant / behavior) | Test (`path::name`) | Tag | Cmd (optional) |
|----|----------------------------------|---------------------|-----|----------------|
| F-1 | Accepted. Current: the only copyable statusLine.command is `node "$(qh-root)/scripts/statusline.mjs" <<< "$input"`. Enumerated 2026-09-10 with `rg -n 'node "$(qh-root)/scripts/statusline.mjs"'` on git-tracked files excluding specs and ADRs: docs/INSTALL.md:85, plugin/README.md:31, plugin/scripts/statusline.mjs:20 (header). All three are that one-liner. INSTALL says "Add this to your own command"; README says "add the segment to your own command"; neither copyable block shows compose. Same-day class check: `rg -n 'statusline\|statusLine'` on plugin/scripts/qh-doctor.mjs, docs/ONBOARDING.md, README.md, plugin/evals/README.md — no hits. `rg refreshInterval` in INSTALL, plugin README, statusline.mjs: no hits. plugin/hooks/hooks.json has no statusLine. statusline.mjs CLI executed 2026-09-10: empty stdin and non-JSON stdin print nothing and exit 0. After: every member of that copyable class (INSTALL, plugin README, statusline.mjs header) shows compose — keep the host command, feed the same `$input` to statusline.mjs, append its stdout. Must not claim QH sets Claude's bar. Must not require deleting refreshInterval. This fact does not add a layer token to the segment. Does not reverse ADR-038–042. Layer F-1 is `--json` only. No peel-cat. Why it can fail: a paste of the one-liner replaces the host command (live: dashboard gone, old host script still on disk); a recipe that deletes refreshInterval; claiming hooks.json installed the bar; mixing the statusline layer token into this Goal. | `tests/statusline.test.mjs::statusline segment: copy-paste is compose not a replacement command` | @implemented | node --test --test-name-pattern 'statusline segment:' tests/statusline.test.mjs |

## Domain

**segment** = `statusline.mjs` stdout: one line or empty, exit 0. **compose** = keep the host `statusLine.command`, append that stdout from the same `$input`. **host command** = the user's existing `statusLine.command` (a dashboard script is one member). **refreshInterval** = Claude Code's optional host field on `statusLine`; this fact does not require deleting it. **layer on the bar** = a third leftover; the sibling spec owns `--json` `layer`. Ubiquitous language already decided: the plugin cannot set Claude's `statusLine` (README, ADR-042).

## Contracts Touched

| Surface | Change | Consumers |
|---------|--------|-----------|
| `docs/INSTALL.md` copyable recipe | reshape to compose, not a standalone command | GitHub install readers |
| `plugin/README.md` copyable recipe | reshape to compose, not a standalone command | marketplace / cache readers |
| `plugin/scripts/statusline.mjs` header | same class as the copyable one-liner | anyone reading the script as a recipe |
| `plugin/hooks/hooks.json` | none (still no `statusLine`) | every Claude Code session with the plugin enabled |

## Non-Goals

- A layer token on the user-wired statusline (third leftover; layer F-1 is `--json` only).
- QH setting Claude Code's `statusLine` (the plugin cannot set the bar; `hooks.json` has no `statusLine`).
- Peel `cat` / `pwd` / `git status` / unknown `neither` (CLAUDE.md §16; ADR-041 left those unpeeled).
- Reverse ADR-038–042 (empty tree still Core; listing rules; probe prefix; UNPROVEN-write Advise; `--json` `layer` stays the sibling spec).
- Mixing this Goal into `docs/specs/2026-09-10-layer-from-stages-catalog.md`.
- Shipping a host adapter that writes the user's Claude settings.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|-----------|
| Paste of the one-liner replaces the host dashboard | High | High | F-1: the copyable block itself shows compose |
| Recipe requires deleting refreshInterval | Med | High | F-1: must not require deleting it |
| After claims QH installed Claude's bar | High | High | Non-goal; hooks.json has no statusLine |
| INSTALL and README drift | Med | High | Class is every copyable member, not INSTALL alone |
| This Goal grows a layer token on the bar | Med | High | Non-goal; leftover stays a later grill |

## Open Questions

<!-- F-1 Accepted 2026-09-10. Class fully named (INSTALL, plugin README, statusline.mjs header). Grill enough: doctor, ONBOARDING, root README, plugin/evals README have no paste member. Leftovers: layer on the bar (not this spec); QH sets the bar (Non-Goal). -->

## Verify

```bash
python3 plugin/bin/spec-verify --spec docs/specs/2026-09-10-statusline-snippet-is-a-segment.md
```

## Grill Log (appendix)

| # | Question | Fact | Decision |
|---|----------|------|----------|
| 1 | Current / after / why it can fail: the shipped snippet is a segment you compose, not a replacement of statusLine; keep host command, append QH stdout from the same $input; must not claim QH sets the bar; must not require deleting refreshInterval; no layer on the bar; no peel-cat; do not reverse ADR-038–042? | F-1 | Accepted. After: INSTALL, plugin README, and the statusline.mjs header show compose (keep host command, same `$input` into statusline.mjs, append stdout). Must not claim QH sets Claude's bar. Must not require deleting refreshInterval. No layer token on the segment. Does not reverse ADR-038–042. Layer F-1 is `--json` only. |
| 2 | Another paste/docs member of the same class (doctor, ONBOARDING, another README)? | non-behavioral | grill enough. Enumerated 2026-09-10: qh-doctor.mjs, docs/ONBOARDING.md, README.md, plugin/evals/README.md have no statusline/statusLine. Leftovers: layer on the bar; QH sets the bar (Non-Goal). |
