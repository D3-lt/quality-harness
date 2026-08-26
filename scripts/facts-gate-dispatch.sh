#!/bin/bash
# Plugin-local PostToolUse dispatcher: immediately report a matching facts-first gate failure.
# The completion hook reruns this same dispatcher and blocks final completion.
# Gates: spec-verify --draft (spec files), adr-lint (active ADR + task files),
# adr-retire-check (opt-in archive catalogs), arch-lint (architecture files),
# postmortem-verify.
set -u

f=${1-}
[ -z "$f" ] && exit 0
# The hook event this run was dispatched from, empty when the completion and
# commit boundaries rerun the dispatcher themselves. Only an explicit PostToolUse
# relaxes anything below, so an unknown boundary still blocks.
boundary=${2-}

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
BIN=$(dirname "$SCRIPT_DIR")/bin
base=$(basename "$f")
base_lc=$(printf '%s' "$base" | tr '[:upper:]' '[:lower:]')
gate="" out="" rc=0

# A template ships placeholders on purpose, so gating one as a project artifact
# fails by design — and that failure blocked the edit, then every later commit in
# the session, in every repository, because the path stayed in mutationPaths.
# Measured 2026-08-25 against a user-global adr-template.md. Selection is
# the bug: the gates are right to reject a placeholder ADR when asked directly,
# which is what the "placeholder and invalid artifacts are rejected" test pins.
case "$base_lc" in
  *-template.md) exit 0 ;;
esac
case "$(dirname "$f")" in
  */templates|*/templates/) exit 0 ;;
esac

is_postmortem() {
  grep -q '^## Symptom' "$1" && grep -q '^## Root Cause' "$1" \
    && grep -q '^## Investigation' "$1" && grep -q '^## Lesson' "$1"
}

is_archive_catalog() {
  grep -q '^\*\*Lifecycle:\*\* Frozen historical ADR records$' "$1"
}

archive_catalog_for() {
  local dir readme
  dir=$(cd "$(dirname "$1")" 2>/dev/null && pwd -P) || return 1
  while [ "$dir" != "/" ]; do
    readme="$dir/README.md"
    if [ -f "$readme" ] && is_archive_catalog "$readme"; then
      printf '%s\n' "$readme"
      return 0
    fi
    dir=$(dirname "$dir")
  done
  return 1
}

git_archive_catalog_for() {
  # A deleted catalog (or a record whose whole archive directory was deleted)
  # has no live marker to discover. Walk its ancestor paths in the Git preimage
  # so deletion is checked against the catalog that governed before the edit.
  local target="$1" dir repo rel_target rel_dir candidate leaf suffix=""
  case "$target" in
    /*|[A-Za-z]:/*) ;;
    *) target="$PWD/$target" ;;
  esac
  leaf=$(basename "$target")
  dir=$(dirname "$target")
  while [ ! -d "$dir" ] && [ "$dir" != "/" ]; do
    suffix="/$(basename "$dir")$suffix"
    dir=$(dirname "$dir")
  done
  dir=$(cd "$dir" 2>/dev/null && pwd -P) || return 1
  target="$dir$suffix/$leaf"
  repo=$(git -C "$dir" rev-parse --show-toplevel 2>/dev/null) || return 1
  repo=$(cd "$repo" 2>/dev/null && pwd -P) || return 1
  case "$target" in "$repo"/*) ;; *) return 1 ;; esac
  rel_target="${target#"$repo"/}"
  # The target itself may be a deleted archive directory. Try its historical
  # catalog before walking parents (file targets simply miss this probe).
  candidate="$rel_target/README.md"
  if git -C "$repo" show "HEAD:$candidate" 2>/dev/null \
    | grep -q '^\*\*Lifecycle:\*\* Frozen historical ADR records$'; then
    printf '%s/%s\n' "$repo" "$candidate"
    return 0
  fi
  rel_dir=$(dirname "$rel_target")
  while [ "$rel_dir" != "." ] && [ "$rel_dir" != "/" ]; do
    candidate="$rel_dir/README.md"
    if git -C "$repo" show "HEAD:$candidate" 2>/dev/null \
      | grep -q '^\*\*Lifecycle:\*\* Frozen historical ADR records$'; then
      printf '%s/%s\n' "$repo" "$candidate"
      return 0
    fi
    rel_dir=$(dirname "$rel_dir")
  done
  return 1
}

collect_owning_adrs() {
  local search_dir="$1" candidate candidate_id
  for candidate in "$search_dir"/*.md; do
    candidate_id=$(sed -nE '1s/^# (ADR-[^: ]+).*/\1/p' "$candidate")
    if [[ -n "$adr_ref" && -n "$candidate_id" \
          && "$adr_ref" != "$candidate_id" \
          && "$adr_ref" != "$candidate_id"-* ]]; then
      continue
    fi
    is_adr "$candidate" && candidates+=("$candidate")
  done
}

is_adr() {
  grep -q '^## Existing Primitives Audit' "$1" && grep -q '^## Decision' "$1" \
    && grep -q '^## Alternatives Considered' "$1" && grep -q '^## Consequences' "$1"
}

is_architecture() {
  local markers
  if grep -q '^# Architecture:' "$1" \
    && grep -qE '^\*\*(Tier|Gate command|Last full audit):\*\*|^## (Module Map|Dependency Contracts|Concept Ownership \(DRY\)|Composition Root|Test Doubles|Trust & Data Boundaries|Superseded)$' "$1"; then
    return 0
  fi
  markers=$(grep -cE '^\*\*(Tier|Gate command|Last full audit):\*\*|^## (Module Map|Dependency Contracts|Concept Ownership \(DRY\)|Composition Root|Test Doubles|Trust & Data Boundaries|Superseded)$' "$1")
  [ "$markers" -ge 3 ]
}

archive_readme=$(archive_catalog_for "$f")
if [ -z "$archive_readme" ]; then
  archive_readme=$(git_archive_catalog_for "$f")
fi
if [ -z "$archive_readme" ]; then
  case "$f" in
    *.md) [ -f "$f" ] || exit 0 ;;
    *) exit 0 ;;
  esac
fi
if [ -n "$archive_readme" ]; then
  gate="adr-retire-check"
  out=$("$BIN/adr-retire-check" "$archive_readme" 2>&1); rc=$?
elif [[ "$f" == */docs/postmortems/*.md ]] || is_postmortem "$f"; then
  gate="postmortem-verify"
  out=$("$BIN/postmortem-verify" "$f" 2>&1); rc=$?
elif [[ "$base" == ADR-*.md ]] || is_adr "$f"; then
  gate="adr-lint"
  out=$("$BIN/adr-lint" "$f" 2>&1); rc=$?
elif [[ "$f" == */tasks/*.md ]] || grep -qE '^# (Task )?ADR-[A-Za-z0-9._-]+' "$f"; then
  # Resolve the ADR id from the task itself. Never pick the first nearby ADR: a wrong green
  # verdict is worse than an explicit ambiguity failure.
  tdir=$(dirname "$f"); parent=$(dirname "$tdir")
  adr_ref=$(sed -nE '1s/^# (Task )?(ADR-[^: ]+).*/\2/p' "$f")
  candidates=()
  shopt -s nullglob
  collect_owning_adrs "$parent"
  # A record that owns its own directory is unambiguous inside it. Widening to
  # the directory above pulls in every unrelated record, and the id filter can
  # only rescue that when every one is titled `# ADR-<id>`: measured 2026-08-25,
  # a repository using date-named records reported "found 22" for a task whose
  # owner sat right beside its tasks/ directory. Widen only when the record is
  # genuinely not there.
  if [ "${#candidates[@]}" -eq 0 ]; then
    collect_owning_adrs "$(dirname "$parent")"
  fi
  shopt -u nullglob
  if [ "${#candidates[@]}" -ne 1 ]; then
    # Ownership is a SET property too: mid-sequence the owning ADR may simply
    # not be written yet, which is the same legitimate incompleteness the
    # boundary rule below exists for.
    if [ "$boundary" = "PostToolUse" ]; then
      printf 'facts-first gate (ADR ownership) not satisfied yet for %s: expected exactly one owning ADR%s, found %s. It blocks at commit and completion.\n' \
        "$f" "${adr_ref:+ ($adr_ref)}" "${#candidates[@]}"
      exit 0
    fi
    printf 'facts-first gate FAILED (ADR ownership) for %s: expected exactly one owning ADR%s, found %s.\n' \
      "$f" "${adr_ref:+ ($adr_ref)}" "${#candidates[@]}" >&2
    exit 2
  fi
  gate="adr-lint"
  out=$("$BIN/adr-lint" "${candidates[0]}" "$tdir" 2>&1); rc=$?
elif [[ "$f" == */docs/specs/*.md ]] \
  || { grep -q '^## Facts' "$f" 2>/dev/null && grep -q '^## Grill Log' "$f" 2>/dev/null; }; then
  # facts-first spec (structure-only draft gate while authoring; --spec stays a deliberate step)
  gate="spec-verify --draft"
  out=$("$BIN/spec-verify" --draft "$f" 2>&1); rc=$?
elif [[ "$base_lc" == "architecture.md" ]] \
  || is_architecture "$f"; then
  gate="arch-lint"
  out=$("$BIN/arch-lint" "$f" 2>&1); rc=$?
fi

[ -z "$gate" ] && exit 0
[ "$rc" -eq 0 ] && exit 0

# BLOCKING AT THIS BOUNDARY PREVENTS NOTHING. The write has already happened and
# a PostToolUse hook cannot undo it, so refusing here costs the turn and protects
# no file. What protects the repository is the commit and completion boundaries,
# which rerun this same dispatcher with no boundary argument and do exit 2.
#
# So this boundary informs instead: the finding reaches the agent at the moment
# it can still act on it, and says plainly what it will cost later. An agent that
# knows a commit is going to fail has second thoughts; an agent that loses its
# turn to a structural nitpick learns to route around the gate.
#
# adr-lint and adr-retire-check were already relaxed here for a narrower reason —
# they judge a SET, and mid-sequence that set is legitimately incomplete: a
# contract row names T3 before T3 is written, an index cannot list files nobody
# has written yet. Measured 2026-08-25: three consecutive writes of one ADR-028
# task set, each blocked on the absence of the next file. The findings were right
# and the moment was wrong.
#
# That turned out to be true of every gate here, not only those two. Across the
# five gates there are 112 distinct failure messages and no severity concept
# anywhere, so a missing `## Consequences` stopped a turn exactly as hard as a
# fabricated `done` status.
if [ "$boundary" = "PostToolUse" ]; then
  printf '%s is not satisfied yet for %s.\n\nNothing is blocked right now — this write has already landed, and a PostToolUse hook cannot undo it. But this WILL block `git commit` and completion until the artifact is fixed:\n\n%s\n\nFix it now while it is small, or keep going and fix it before you commit.\n' \
    "$gate" "$f" "$out"
  exit 0
fi

printf 'facts-first gate FAILED (%s, exit %s) for %s:\n%s\n\nFix the artifact, not the gate.\n' \
  "$gate" "$rc" "$f" "$out" >&2
exit 2
