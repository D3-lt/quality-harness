# Completion proof

Use this contract for a substantive completion report or an explicit status request. Lead with the observable result.
Keep the report compact: group claims sharing scope, target and evidence, and expand only material gaps. Routine
conversation and intermediate progress do not need a completion form.

## Independent claims

| Claim | What supports it |
|-------|------------------|
| Implemented | Inspected changes or an artifact implementing the requested scope |
| Verified | The relevant command, observed result and coverage for the identified subject |
| Integrated | The intended entry point actually selecting the behavior in the named environment and artifact |
| Delivered | Observed availability through the requested channel, such as a release and its catalog |
| Effective | An observed requested outcome at a stated scope; comparisons also name baseline and limits |

These are independent claims, not a score or ladder. A released change can have unknown usefulness. Source tests do not
establish that an installed artifact uses the change, and publication does not establish that a running session updated.
Usefulness means the requested outcome; an ordinary fix does not require a general productivity benchmark.

## Evidence and uncertainty

For each claim give its result, scope, observed target and evidence reference or concrete limitation. Put shared identity
once when it applies to several claims. Name the revision, relevant input digest or actual artifact identity and environment;
a version string alone does not identify the executed bytes.

- **Supported:** evidence establishes the claim within that scope. For verification, name the command and exit/result.
- **Contradicted:** an observation establishes failure, such as a relevant check that ran and failed.
- **Unknown:** the observation is unavailable, incomplete or was not made; a command that could not start is not a pass.
- **Stale:** prior evidence no longer establishes the current subject. Retain the historical result and name the current gap.
- **Not-applicable:** the requested goal makes this claim irrelevant; state why. Missing data is unknown instead.

Split partially covered claims: Mac verification can be supported while Windows coverage stays unknown. A failed check
stays contradicted even when other checks pass. Keep actual counts, elapsed time, CPU coverage and estimates distinct;
missing coverage is never zero. A green build, reviewer approval or a model assertion alone cannot prove user benefit.

Reuse existing evidence-validity rules. An older revision's receipt can support current inputs only when their continued
applicability was established; otherwise disclose the limitation. This report references evidence and does not create or
rewrite a tool-written check, mutation, verification or release receipt. Historical task statuses retain their own meaning.

## Compact report example

This is an illustrative shape, not a receipt:

> Implemented and verified: supported for <requested scope> at <observed target>; <change reference>, <command and result>.
> Integrated: unknown for <intended caller/environment>; its actual selection has not been observed.
> Delivered: supported through <observed release and catalog>; the user's active installation was not observed.
> Effective: unknown for <requested outcome>; comparable observations are unavailable.

Preserve the producer's existing requirements for changed files, exact checks, review limits and publication authorization.
Report what remains unknown without demanding another check. Checks stay optional; this contract launches nothing and
adds no publishing refusal, nag or repeated prompt message.

## Handoff and later status

Carry work identity, observed target, scoped claims and authoritative evidence/checkpoint references. Read chronological
project threads and fetch the relevant checkpoint before treating semantic recall as current state. A newer timestamp
does not supersede a different work item; an old pending memory cannot overturn observed delivery of the same target.
Keep unresolved contradictions visible. This guidance does not claim that memory retrieval itself has been fixed.
