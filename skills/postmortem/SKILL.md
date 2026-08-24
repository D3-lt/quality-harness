---
name: postmortem
description: Document a material, recurrent, or production-relevant failure—or a genuinely reusable lesson—as a structured postmortem. Use after resolving a qualifying failure or review finding, or whenever the user explicitly asks. Do not auto-trigger for every routine bug, expected test failure, or low-impact one-off fix.
---

# Postmortem

Document a consequential failure or reusable lesson so it can be used for model fine-tuning.

## Invoke When

- The user says "/quality-harness:postmortem" or asks to document a failure
- You resolved a material failure with meaningful user, business, data, security, or operational impact
- You resolved a recurrent failure or a production incident / production-relevant failure mode
- A test or code review exposed a genuinely reusable lesson that applies beyond this one fix

## Do Not Invoke When

- Normal feature work with no bugs
- Refactoring that didn't uncover issues
- Style/formatting-only changes
- Routine low-impact or one-off bugs with no reusable lesson
- Expected TDD-red failures or ordinary test corrections

## Output Location

```
docs/postmortems/YYYY-MM-DD-<slug>.md
```

Create `docs/postmortems/` if it doesn't exist. The slug should be 2-4 words, lowercase, hyphenated (e.g., `null-guard-vat-accessor`, `invoice-emails-silent-failure`).

## Document Structure

Every postmortem MUST follow this exact structure. Do not skip sections. Do not reorder. This schema is parsed programmatically for fine-tuning datasets.

```markdown
---
date: YYYY-MM-DD
category: <one of: null-safety | data-integrity | inconsistency | silent-failure | race-condition | type-error | missing-validation | logic-error | performance | security>
severity: <one of: critical | medium | low>
files_changed:
  - path/to/file1.php
  - path/to/file2.php
tags: [short, relevant, keywords]
---

## Symptom

What was observed — the user-visible or log-visible behavior that indicated something was wrong.
Be specific: include error messages, log lines, or test output.
1-3 sentences.

## Context

What code/feature was involved. Enough for someone unfamiliar to understand the area.
Include file paths and line numbers where relevant.
2-5 sentences.

## Root Cause

The actual flaw — why the code behaved incorrectly.
Include the specific code snippet that was wrong (use a fenced code block).
Be precise: "X did Y because Z" not "there was a problem with X".

## Investigation

How the issue was found — what was checked, what was ruled out, key observations.
This section teaches the model HOW TO DIAGNOSE, not just what the answer was.
Include the reasoning chain: "First I checked X, which showed Y. That ruled out Z. Then I looked at W..."

## Fix

What was changed and why. Include before/after code blocks:

### Before
```<lang>
// the broken code
```

### After
```<lang>
// the fixed code
```

Explain WHY this fix is correct, not just what changed.

## Lesson

One generalized takeaway — something applicable beyond this specific bug.
Write it as an instruction: "Always X when Y" or "Never X without checking Y".
This is the single most important line for fine-tuning — make it crisp.
```

## How To Write Each Section

### Gathering context automatically

Before writing, collect:
1. `git diff` or `git log` for the recent fix commits
2. The test that confirms the fix (if one exists)
3. Any relevant log output the user shared

### Writing for fine-tuning quality

- **Be specific over general.** "The accessor divides by 100 without null guard" beats "there was a null issue."
- **Include real code.** Models learn from concrete examples, not abstract descriptions.
- **The Investigation section is the highest-value section.** It teaches reasoning, not just answers.
- **The Lesson must generalize.** "Always null-guard model accessors that divide raw attributes" is trainable. "Fix Order.php line 451" is not.

### Multiple bugs in one session

If a session found multiple bugs, create ONE postmortem per bug. Each gets its own file. Don't combine unrelated issues into one document.

## After Writing

1. Run `postmortem-verify docs/postmortems/<filename>` — exit 0 required. It checks
   the frontmatter enums, files_changed list, every section present and non-empty, and the
   Before/After code fences. A malformed doc silently poisons the fine-tuning corpus; the script,
   not a read-back, is the gate.
2. Verify the frontmatter `files_changed` matches the actual files touched
3. Do NOT commit automatically — the user may want to review first
4. Report: "Postmortem written to `docs/postmortems/<filename>`, postmortem-verify exit 0. Review and commit when ready."
