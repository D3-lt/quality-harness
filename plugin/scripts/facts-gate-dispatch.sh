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

# runArtifactGates supplies a private, disposable ledger for one sequential pass.
# Keep ownership resolution here and key the full argv, not an ADR basename.
# The caller retains the first finding; a repeated command need not report it again.
run_adr_lint() {
  local ledger="" key status
  [ "$boundary" = "PostToolUse" ] || ledger=${QUALITY_HARNESS_ADR_LEDGER-}
  printf -v key '%q ' "$BIN/adr-lint" "$@"
  if [ -n "$ledger" ] && grep -Fqx -- "$key" "$ledger" 2>/dev/null; then
    return 0
  fi
  "$BIN/adr-lint" "$@"; status=$?
  # A timed-out or interrupted command has not completed a check.
  if [ -n "$ledger" ] && [ "$status" -lt 128 ]; then
    { printf '%s\n' "$key" >> "$ledger"; } 2>/dev/null || :
  fi
  return "$status"
}

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

# ⚠ A DOCUMENT *ABOUT* POSTMORTEMS IS NOT A POSTMORTEM, and the section headings alone
# cannot tell them apart — the skill that TEACHES this format lists every heading it
# requires, so `plugin/skills/postmortem/SKILL.md` matched and was linted as a malformed
# postmortem on every edit to it. Advice that is always wrong on a whole class of file
# is advice a reader learns to skim (ADR-037), and this one fired inside the plugin that
# ships it. Reported by the dispatcher itself, 2026-09-07.
#
# The discriminator is the FRONTMATTER, which is what `postmortem-verify` actually reads
# and what a document about the format has no reason to carry: a real postmortem
# declares `date`, `category` or `severity`; a guide, a template or a skill declares
# `name`/`description` or nothing. A path under `docs/postmortems/` still routes here
# whatever its frontmatter, because there the author has said what the file is.
# ⚠ A UTF-8 BOM DEFEATS A `^#` ANCHOR ON LINUX AND NOT ON macOS, so the platform
# that develops this cannot see it (CLAUDE.md §7). Measured 2026-09-09 on the
# same file, `EF BB BF # ADR-001: Legacy`:
#
#   GNU grep 3.11 (debian)   ^# ADR-[0-9]  ->  0 matches   (control, no BOM: 1)
#   busybox grep 1.37        ^# ADR-[0-9]  ->  0 matches
#   BSD grep (macOS 15)      ^# ADR-[0-9]  ->  1 match     — skips the BOM itself
#
# So a BOM-led legacy record routed nowhere on Linux and Windows and the boundary
# exited silently — §190's fail-open, preserved by three bytes. Reported by a
# different-lineage review whose own evidence line said BOTH greps miss it; that
# did not reproduce here, because it was read on macOS. The finding was right and
# its measurement was platform-silent.
#
# Stripped rather than anchored around: the title patterns below scan the WHOLE
# file on purpose, and narrowing them to line 1 would trade this silence for
# another one. `read`+`printf` are builtins, so this costs one `tail`.
bom_free() {
  local first
  IFS= read -r first < "$1" || return 0
  printf '%s\n' "${first#$'\xEF\xBB\xBF'}"
  tail -n +2 -- "$1"
}

is_postmortem() {
  grep -q '^## Symptom' "$1" && grep -q '^## Root Cause' "$1" \
    && grep -q '^## Investigation' "$1" && grep -q '^## Lesson' "$1" \
    && awk 'NR==1 && $0!="---" {exit 1} NR>1 && $0=="---" {exit 1}
            /^(date|category|severity):[ \t]/ {found=1; exit 0}
            END {exit found?0:1}' "$1"
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
  local candidates=("$rel_target/README.md") matches=() match
  rel_dir=$(dirname "$rel_target")
  while [ "$rel_dir" != "." ] && [ "$rel_dir" != "/" ]; do
    candidates+=("$rel_dir/README.md")
    rel_dir=$(dirname "$rel_dir")
  done
  # One history read, scoped to these exact paths. NUL framing and literal
  # pathspecs preserve spaces, brackets and non-ASCII names without Git quoting.
  while IFS= read -r -d '' match; do
    matches+=("${match#HEAD:}")
  done < <(git -C "$repo" --literal-pathspecs grep -l -z -G --threads=1 --no-textconv \
    -e '^\*\*Lifecycle:\*\* Frozen historical ADR records$' HEAD -- "${candidates[@]}" 2>/dev/null)
  [ "${#matches[@]}" -gt 0 ] || return 1
  # git grep orders paths lexically; ownership still belongs to the nearest catalog.
  for candidate in "${candidates[@]}"; do
    for match in "${matches[@]}"; do
      if [ "$candidate" = "$match" ]; then
        printf '%s/%s\n' "$repo" "$candidate"
        return 0
      fi
    done
  done
  return 1
}

collect_owning_adrs() {
  local search_dir="$1" candidate candidate_id
  for candidate in "$search_dir"/*.md; do
    candidate_id=$(bom_free "$candidate" | sed -nE '1s/^# (ADR-[^: ]+).*/\1/p')
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
  if bom_free "$1" | grep -q '^# Architecture:' \
    && grep -qE '^\*\*(Tier|Gate command|Last full audit):\*\*|^## (Module Map|Dependency Contracts|Concept Ownership \(DRY\)|Composition Root|Test Doubles|Trust & Data Boundaries|Superseded)$' "$1"; then
    return 0
  fi
  markers=$(grep -cE '^\*\*(Tier|Gate command|Last full audit):\*\*|^## (Module Map|Dependency Contracts|Concept Ownership \(DRY\)|Composition Root|Test Doubles|Trust & Data Boundaries|Superseded)$' "$1")
  [ "$markers" -ge 3 ]
}

archive_readme=$(archive_catalog_for "$f")
if [ -z "$archive_readme" ]; then
  # Batch argument 3 is a completed read of these same historical candidates.
  # A missing argument keeps the standalone lookup; empty means no catalog found.
  if [ "${3+x}" = x ]; then archive_readme=$3
  else archive_readme=$(git_archive_catalog_for "$f")
  fi

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
# ...or a file whose TITLE says it is a record. Reported 2026-09-09 (BACKLOG §190):
# §185 stopped legacy records being misrouted to the task branch, and nothing
# claimed them instead — so the commit boundary went SILENT on records that fail
# adr-lint when it is invoked directly. That traded a false failure for no
# failure, which is the worse direction. `is_adr` requires a section half of any
# older corpus predates, and those corpora also name records without the `ADR-`
# prefix, so neither existing arm sees them. The title does — with the same
# `-T<n>` discriminator §185 used, so a task is still a task.
elif [[ "$base" == ADR-*.md ]] || is_adr "$f" \
    || { bom_free "$f" | grep -qE '^# ADR-[0-9]' \
         && ! bom_free "$f" | grep -qE '^# (Task )?ADR-[A-Za-z0-9._-]*-T[0-9]+'; }; then
  gate="adr-lint"
  out=$(run_adr_lint "$f" 2>&1); rc=$?
# A TASK, and the `Task ` prefix is the signal — it used to be parsed and thrown
# away. Reported 2026-09-08 from a 77-record corpus where this produced 34 false
# failures in one commit (BACKLOG §185): `is_adr` requires `## Existing Primitives
# Audit`, a section that post-dates half of any older corpus, so every record
# without it fell through to here — and a record titled `# ADR-001: …` matched
# `^# (Task )?ADR-`. It was then told its owning ADR was missing, while the record
# IS the ADR. Section presence is not a proxy for record-ness; the title is.
elif [[ "$f" == */tasks/*.md ]] || bom_free "$f" | grep -qE '^# Task ADR-[A-Za-z0-9._-]+' \
    || bom_free "$f" | grep -qE '^# (Task )?ADR-[A-Za-z0-9._-]*-T[0-9]+'; then
  # Resolve the ADR id from the task itself. Never pick the first nearby ADR: a wrong green
  # verdict is worse than an explicit ambiguity failure.
  tdir=$(dirname "$f"); parent=$(dirname "$tdir")
  adr_ref=$(bom_free "$f" | sed -nE '1s/^# (Task )?(ADR-[^: ]+).*/\2/p')
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
    exit 0
  fi
  gate="adr-lint"
  out=$(run_adr_lint "${candidates[0]}" "$tdir" 2>&1); rc=$?
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

# NOTHING HERE REFUSES A CALL. Every boundary informs; the decision stays with
# the agent and its owner.
#
# This boundary was the first to change, for a reason that turned out to apply
# everywhere: the write has already happened and a PostToolUse hook cannot undo
# it, so refusing cost the turn and protected no file. The rest followed once
# blocking had refused legitimate work six times across three projects in a day.
# An agent that loses turns to a gate learns to route around the gate.
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
  printf '%s is not satisfied yet for %s.\n\n%s\n\nFix it now while it is small, or note why it stands. Nothing is blocked — this is what the gate sees, not a refusal.\n' \
    "$gate" "$f" "$out"
  exit 0
fi

# Advisory, like every other finding this harness reports. It names what it
# found and leaves the decision where it belongs; it does not refuse the call.
printf '%s is not satisfied for %s:\n\n%s\n\nFix the artifact, not the gate.\n' \
  "$gate" "$f" "$out" >&2
exit 0
