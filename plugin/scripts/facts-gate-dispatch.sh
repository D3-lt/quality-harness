#!/bin/bash
# Plugin-local PostToolUse dispatcher: immediately report a matching facts-first gate failure.
# The completion hook reruns this same dispatcher and reports again; it refuses nothing.
# Gates: spec-verify --draft (spec files), adr-lint (active ADR + task files),
# adr-retire-check (opt-in archive catalogs), arch-lint (architecture files),
# postmortem-verify.
set -u

f=${1-}
[ -z "$f" ] && exit 0
# The hook event this run was dispatched from, empty when the completion and
# commit boundaries rerun the dispatcher themselves. Only an explicit PostToolUse
# relaxes anything below, so an unknown boundary gets the full finding on stderr.
boundary=${2-}

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "${BASH_SOURCE[0]}")" && pwd)
BIN=$(dirname "$SCRIPT_DIR")/bin
base=$(basename "$f")
base_lc=$(printf '%s' "$base" | tr '[:upper:]' '[:lower:]')
gate="" out="" rc=0

# PostToolUse additionalContext is stdout (run-shell-hook wraps it).
# Commit/completion — the path runArtifactGates consumes — reads stderr,
# the same stream as the finding text at the bottom of this file. An
# UNPROVEN that stays on stdout there is dropped: measured 2026-09-12,
# runArtifactGates returned null for a plugin copied without lib/, the
# same as all-passed (ADR-005 / ADR-046 T4).
say_unproven() {
  if [ "$boundary" = "PostToolUse" ]; then
    printf '%s\n' "$1"
  else
    printf '%s\n' "$1" >&2
  fi
}

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
# another one.
#
# ⚠ BYTE-ORIENTED, BECAUSE THE FIRST VERSION OF THIS HELPER ERASED A FILE. It
# read the first line into a variable, and `read` returns non-zero at EOF even
# when it filled that variable — so a one-line record with NO TRAILING NEWLINE
# produced nothing at all. `grep '^# ADR-'` matched such a file BEFORE the helper
# existed and missed it after: a fail-open introduced by the fix for a fail-open,
# caught by review before it shipped (BACKLOG §193). Reading bytes also keeps
# NULs and does not buffer an arbitrarily long first line.
bom_free() {
  if [ "$(head -c 3 -- "$1" 2>/dev/null | od -An -tx1 | tr -d ' \n')" = "efbbbf" ]; then
    tail -c +4 -- "$1"
  else
    cat -- "$1"
  fi
}

# The file as its structure reads: BOM-free, CR-free, and every fenced code block
# blanked line for line, so an example in a document is not the document's own
# title or sections (BACKLOG §297). A tutorial's example task, inside a ```` fence,
# routed the tutorial as a task and told it its owning ADR was missing. The fence
# grammar is `record.py`'s: an opener of three or more backticks or tildes after
# any indent (a backtick opener whose info string holds a backtick is not one),
# closed by the same character at least as long with only blanks after it. An
# unclosed fence runs to the end, as it does there. An HTML comment block and a
# `<pre>` block are blanked too: a task title inside either still routed the doc as a
# task (a Windows chaos round on 2.111.0-rc, §297's siblings).
unfenced() {
  bom_free "$1" | awk '
    {
      line = $0
      sub(/\r$/, "", line)
      lead = ""; rest = ""
      if (match(line, /^[ \t]*(`{3,}|~{3,})/)) {
        lead = substr(line, 1, RSTART + RLENGTH - 1); sub(/^[ \t]*/, "", lead)
        rest = substr(line, RSTART + RLENGTH)
      }
      if (fence == "") {
        if (comment) { if (index(line, "-->")) comment = 0; print ""; next }
        if (pre) { if (tolower(line) ~ /<\/pre[ \t]*>/) pre = 0; print ""; next }
        if (line ~ /^[ \t]*<!--/) { if (!index(line, "-->")) comment = 1; print ""; next }
        if (tolower(line) ~ /^[ \t]*<pre([ \t>]|$)/) { if (tolower(line) !~ /<\/pre[ \t]*>/) pre = 1; print ""; next }
        if (lead != "" && !(substr(lead, 1, 1) == "`" && index(rest, "`"))) { fence = lead; print ""; next }
        print line
        next
      }
      if (lead != "" && substr(lead, 1, 1) == substr(fence, 1, 1) && length(lead) >= length(fence) && rest ~ /^[ \t]*$/) fence = ""
      print ""
    }'
}

is_postmortem() {
  local text
  text=$(unfenced "$1")
  grep -q '^## Symptom' <<< "$text" && grep -q '^## Root Cause' <<< "$text" \
    && grep -q '^## Investigation' <<< "$text" && grep -q '^## Lesson' <<< "$text" \
    && awk 'NR==1 && $0!="---" {exit 1} NR>1 && $0=="---" {exit 1}
            /^(date|category|severity):[ \t]/ {found=1; exit 0}
            END {exit found?0:1}' "$1"
}

is_archive_catalog() {
  grep -q '^\*\*Lifecycle:\*\* Frozen historical ADR records$' "$1"
}

archive_catalog_for() {
  local dir readme
  dir=$(CDPATH= cd -- "$(dirname "$1")" 2>/dev/null && pwd -P) || return 1
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

# Sets in_repo and in_repo_rel to the repository holding $1 and $1's path inside it, through the nearest directory
# that still exists (the path itself may be deleted). Fails when no repository holds it.
repo_path_of() {
  local target="$1" dir leaf suffix=""
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
  in_repo=$(git -C "$dir" rev-parse --show-toplevel 2>/dev/null) || return 1
  in_repo=$(cd "$in_repo" 2>/dev/null && pwd -P) || return 1
  case "$target" in "$in_repo"/*) ;; *) return 1 ;; esac
  in_repo_rel="${target#"$in_repo"/}"
}

# The history bases, one per line, by `historyBases` in run-shell-hook.mjs: split on commas and whitespace, a name
# outside that rule dropped, HEAD when none is left. The batch answers from the same list (Codex review, 2026-10-12:
# `HEAD,<sha>` was two bases there and one unreadable base here, so the two said different things about one path).
history_bases() {
  local raw="${QUALITY_HARNESS_HISTORY_BASES-}" base found="" list=()
  # read -a, not an unquoted expansion: a `*` in the variable must not glob into file names.
  IFS=$' \t\n\r\v\f,' read -r -d '' -a list <<< "$raw" || true
  for base in ${list[@]+"${list[@]}"}; do
    [[ "$base" =~ ^[A-Za-z0-9._/^~-]{1,200}$ ]] || continue
    printf '%s\n' "$base"
    found=1
  done
  [ -n "$found" ] || printf 'HEAD\n'
}

# Whether a missing path was a tracked FILE in one of the history bases (BACKLOG §378): its former kind is then
# established. A directory, a path git never held, or no repository at all is not established.
git_was_file() {
  local in_repo in_repo_rel base
  repo_path_of "$1" || return 1
  for base in $(history_bases); do
    [ "$(git -C "$in_repo" cat-file -t "$base:$in_repo_rel" 2>/dev/null)" = blob ] && return 0
  done
  return 1
}

git_archive_catalog_for() {
  # A deleted catalog (or a record whose whole archive directory was deleted)
  # has no live marker to discover. Walk its ancestor paths in the Git preimage
  # so deletion is checked against the catalog that governed before the edit.
  local repo rel_target rel_dir candidate in_repo in_repo_rel
  repo_path_of "$1" || return 1
  repo=$in_repo
  rel_target=$in_repo_rel
  # The target itself may be a deleted archive directory. Try its historical
  # catalog before walking parents (file targets simply miss this probe).
  local candidates=("$rel_target/README.md") matches=() match
  rel_dir=$(dirname "$rel_target")
  while [ "$rel_dir" != "." ] && [ "$rel_dir" != "/" ]; do
    candidates+=("$rel_dir/README.md")
    rel_dir=$(dirname "$rel_dir")
  done
  # One history read per base, scoped to these exact paths. NUL framing and
  # literal pathspecs preserve spaces, brackets and non-ASCII names without Git
  # quoting. The bases are the session's first HEAD and then HEAD (ADR-060 T6):
  # a record deleted AND COMMITTED this session is gone from HEAD, and only an
  # earlier revision can still say which archive owned it. Unset means HEAD, so
  # every caller that passes nothing keeps the behaviour it had.
  local base
  for base in $(history_bases); do
    while IFS= read -r -d '' match; do
      matches+=("${match#"$base":}")
    done < <(git -C "$repo" --literal-pathspecs grep -l -z -G --threads=1 --no-textconv \
      -e '^\*\*Lifecycle:\*\* Frozen historical ADR records$' "$base" -- "${candidates[@]}" 2>/dev/null)
    [ "${#matches[@]}" -gt 0 ] && break
  done
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

# Whether a record's own id is compatible with the task's: a task naming `ADR-<id>` is owned only by that record, and a
# record or task with no id is not ruled out by it.
named_by_task() {
  local candidate_id
  candidate_id=$(bom_free "$1" | sed -nE '1s/^# (ADR-[^: ]+).*/\1/p')
  [[ -z "$adr_ref" || -z "$candidate_id" || "$adr_ref" == "$candidate_id" || "$adr_ref" == "$candidate_id"-* ]]
}

collect_owning_adrs() {
  local search_dir="$1" candidate
  for candidate in "$search_dir"/*.md; do
    named_by_task "$candidate" || continue
    is_adr "$candidate" && candidates+=("$candidate")
  done
}

is_adr() {
  local text
  text=$(unfenced "$1")
  grep -q '^## Existing Primitives Audit' <<< "$text" && grep -q '^## Decision' <<< "$text" \
    && grep -q '^## Alternatives Considered' <<< "$text" && grep -q '^## Consequences' <<< "$text"
}

is_architecture() {
  local markers text
  text=$(unfenced "$1")
  if grep -q '^# Architecture:' <<< "$text" \
    && grep -qE '^\*\*(Tier|Gate command|Last full audit):\*\*|^## (Module Map|Dependency Contracts|Concept Ownership \(DRY\)|Composition Root|Test Doubles|Trust & Data Boundaries|Superseded)$' <<< "$text"; then
    return 0
  fi
  markers=$(grep -cE '^\*\*(Tier|Gate command|Last full audit):\*\*|^## (Module Map|Dependency Contracts|Concept Ownership \(DRY\)|Composition Root|Test Doubles|Trust & Data Boundaries|Superseded)$' <<< "$text")
  [ "$markers" -ge 3 ]
}

# ADR-120 T15: a test file edited this session that a task's lock may hold. A lock hashes test bodies in the files a task's
# Tests table names (record.py snapshot_lock), so only a task whose Tests table names the file in its File column can lock a
# body in it; one that lists it under Affected Files cannot, and is not gated (measured 2026-10-21: plugin/bin/adr-next is
# named by 25 task files, all as an affected file, and gating each made one boundary dispatch take 90 s). Those tasks are
# gated as themselves, their owning record resolved as for any task, and what they say about THIS file's locked tests is the
# advice: which task, which test, and the relock. At the commit and turn-end boundaries only: a test is edited many times
# before the change is reviewed, and the relock waits for the review. Said on stderr, where the batch reads findings. A task
# not claimed done has no lock to withhold, and says nothing.
lock_drift() {
  local in_repo in_repo_rel task said line pattern
  [ "$boundary" = "PostToolUse" ] && return 0
  repo_path_of "$1" || return 0
  # A Tests row is `| name | file | …`: the file in the second cell. The path is a literal, so its regex characters are escaped.
  pattern="^\|[^|]*\|[^|]*$(printf '%s' "$in_repo_rel" | sed 's/[][\.*^$+?(){}|]/\\&/g')"
  while IFS= read -r -d '' task; do
    said=$("$BASH" "${BASH_SOURCE[0]}" "$in_repo/$task" 2>&1) || :
    while IFS= read -r line; do
      printf 'lock drift: %s\n' "${line#"${line%%[![:space:]]*}"}" >&2
    done < <(printf '%s\n' "$said" | grep -F -- "locked test \`$in_repo_rel\`")
  done < <(git -C "$in_repo" grep --untracked -l -z -E --threads=1 --no-textconv -e "$pattern" -- 'tasks/*.md' '*/tasks/*.md' 2>/dev/null)
}

# ADR-120 T15: a spec the gate skips: one git marks `linguist-generated`, or one the project lists under `ignore`. Only a
# positive answer skips, so a missing node, a refused declaration or a repository git cannot read leaves the spec gated; a
# refusal is said, because the project believes something is skipped that is not.
spec_skipped() {
  local verdict status
  command -v node >/dev/null 2>&1 || return 1
  verdict=$(node "$SCRIPT_DIR/spec-skip.mjs" "$1" 2>/dev/null); status=$?
  [ "$status" -eq 2 ] && say_unproven "$verdict"
  [ "$status" -eq 0 ]
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
  # Missing is could-not-look (ADR-005 / F-15), never a clean skip. Unreadable
  # existing files still fall through: -f is true, ADR-*.md can match by name,
  # and the UNPROVEN arm below names a file that exists but cannot be read.
  if [ ! -f "$f" ]; then
    # Only Markdown can be a record, and an existing file of another kind exits 0
    # below, so a deleted `x.mjs` that history shows was a tracked file had nothing
    # to classify (BACKLOG §378). A Markdown name, a directory (dotted or not) and a
    # path git never held keep their could-not-look: their former kind is unknown.
    # Batch argument 4 is the same answer, read in the batch's one history query; absent, ask git here.
    case "$base_lc" in
      *.md) ;;
      *.*) if [ "${4+x}" = x ]; then [ "$4" = file ] && exit 0; else git_was_file "$f" && exit 0; fi ;;
    esac
    say_unproven "$(printf 'UNPROVEN: could not classify %s' "$f")"
    exit 0
  fi
  case "$f" in
    *.md) ;;
    *) lock_drift "$f"; exit 0 ;;
  esac
fi
# A tasks index (`tasks/README.md`) is derived from its task files (§10), and its
# `# ADR-064 tasks` title reads as a record's (BACKLOG §285); see the record arm.
tasks_index=0
# Both names case-insensitive, like `base_lc` (CLAUDE.md §7; Codex review of 12a1341).
# The directory as the filesystem names it, so `tasks/./T1.md` is in `tasks/` (Codex review of 9fcee428); a deleted
# file's directory may be gone, and is then read as written. CDPATH is cleared: under it, cd prints where it went, and
# that line became part of the directory (Codex review of 53c6d167).
parent_dir=$(CDPATH= cd -- "$(dirname "$f")" 2>/dev/null && pwd) || parent_dir=$(dirname "$f")
tasks_dir_lc=$(basename "$parent_dir" | tr '[:upper:]' '[:lower:]')
[[ "$base_lc" == readme.md && "$tasks_dir_lc" == tasks ]] && tasks_index=1
# Titles are read from the unfenced text: a record's or a task's title is its own,
# never an example's (BACKLOG §297).
structure=$(unfenced "$f" 2>/dev/null)
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
# `-T<n>` discriminator §185 used, so a task is still a task — or ` T<n>`, the id spelled with a space (BACKLOG §381 item 12).
# ⚠ NOT A TASKS INDEX. `tasks/README.md` is titled `# ADR-064 tasks`, which the
# title test below reads as a record, so adr-lint was handed the index itself and
# answered not-recognised as UNPROVEN on every commit that touched one (BACKLOG
# §285). The index is derived from the task files (§10); it falls through to the
# task arm, which lints the record that owns it.
elif [ "$tasks_index" = 0 ] \
    && { [[ "$base" == ADR-*.md ]] || is_adr "$f" \
    || { grep -qE '^# ADR-[0-9]' <<< "$structure" \
         && ! grep -qE '^# (Task )?ADR-[A-Za-z0-9._-]*[- ]T[0-9]+' <<< "$structure"; }; }; then
  gate="adr-lint"
  out=$(run_adr_lint "$f" 2>&1); rc=$?
# A TASK, and the `Task ` prefix is the signal — it used to be parsed and thrown
# away. Reported 2026-09-08 from a 77-record corpus where this produced 34 false
# failures in one commit (BACKLOG §185): `is_adr` requires `## Existing Primitives
# Audit`, a section that post-dates half of any older corpus, so every record
# without it fell through to here — and a record titled `# ADR-001: …` matched
# `^# (Task )?ADR-`. It was then told its owning ADR was missing, while the record
# IS the ADR. Section presence is not a proxy for record-ness; the title is.
# An index goes HERE, whatever its path looks like: a relative `tasks/README.md`
# has no slash before `tasks/`, and excluding it above sent it nowhere.
# A file in `tasks/` ITSELF, never one nested below it: bash's `*` crosses `/`, so `*/tasks/*.md` claimed
# `bench/tasks/<fixture>/base/guide.md` and said its owning ADR was missing (an outside report, 2026-10-14; work-next
# learned the same about Ansible's `roles/*/tasks/files/notes.md`, ADR-099). A task title still claims a file anywhere,
# its id spelled `-T<n>` or ` T<n>`, as the record arm above excludes both (the review of v3.8.35..e957da1e).
elif { [ "$tasks_dir_lc" = tasks ] && [[ "$base_lc" == *.md ]]; } || grep -qE '^# Task ADR-[A-Za-z0-9._-]+' <<< "$structure" \
    || grep -qE '^# (Task )?ADR-[A-Za-z0-9._-]*[- ]T[0-9]+' <<< "$structure"; then
  # Resolve the ADR id from the task itself. Never pick the first nearby ADR: a wrong green
  # verdict is worse than an explicit ambiguity failure.
  tdir=$parent_dir; parent=$(dirname "$tdir")
  adr_ref=$(bom_free "$f" | sed -nE '1s/^# (Task )?(ADR-[^: ]+).*/\2/p')
  candidates=()
  shopt -s nullglob
  # Never above the repository: one directory up from a top-level folder is outside it, and a record another session left
  # there (the shared temp directory, 2026-10-19) is not this task's owner. That holds for the first search as well as the
  # widened one: a task at the repository's root has its parent outside it (the Codex review of aae06d72..90b9ceaf).
  # Outside any repository both searches stand.
  top=$(git -C "$tdir" rev-parse --show-toplevel 2>/dev/null) || top=''
  in_repository() { [ -z "$top" ] || [[ "$(cd "$1" 2>/dev/null && pwd -P)/" == "$(cd "$top" 2>/dev/null && pwd -P)/"* ]]; }
  if in_repository "$parent"; then collect_owning_adrs "$parent"; fi
  # A record that owns its own directory is unambiguous inside it. Widening to
  # the directory above pulls in every unrelated record, and the id filter can
  # only rescue that when every one is titled `# ADR-<id>`: measured 2026-08-25,
  # a repository using date-named records reported "found 22" for a task whose
  # owner sat right beside its tasks/ directory. Widen only when the record is
  # genuinely not there.
  if [ "${#candidates[@]}" -eq 0 ]; then
    widen=$(dirname "$parent")
    if in_repository "$widen"; then
      # The record BESIDE the directory owns it, `docs/adr/<slug>.md` for `docs/adr/<slug>/tasks/`, as adr-lint pairs them.
      # Widening past it counted every record in docs/adr: "found 23" from a date-named corpus (an outside report, 2026-10-20).
      sibling="$widen/$(basename "$parent").md"
      # The id filter every other candidate meets applies to it too (the Codex review of cdcfcf84..290669db).
      if [ -f "$sibling" ] && named_by_task "$sibling" && is_adr "$sibling"; then
        candidates=("$sibling")
      else
        collect_owning_adrs "$widen"
      fi
    fi
  fi
  shopt -u nullglob
  if [ "${#candidates[@]}" -ne 1 ]; then
    # An index whose owner cannot be told apart has nothing of its own to report:
    # the ownership finding belongs to its task files, which carry it at commit.
    # Said by the index it would replace one noise line with another (§285).
    [ "$tasks_index" = 1 ] && exit 0
    # Ownership is a SET property too: mid-sequence the owning ADR may simply
    # not be written yet, which is the same legitimate incompleteness the
    # boundary rule below exists for.
    if [ "$boundary" = "PostToolUse" ]; then
      printf 'facts-first gate (ADR ownership) not satisfied yet for %s: expected exactly one owning ADR%s, found %s. Nothing is blocked, and it is not checked again until the file changes.\n' \
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
  if spec_skipped "$f"; then exit 0; fi
  gate="spec-verify --draft"
  out=$("$BIN/spec-verify" --draft "$f" 2>&1); rc=$?
elif [[ "$base_lc" == "architecture.md" ]] \
  || is_architecture "$f"; then
  gate="arch-lint"
  out=$("$BIN/arch-lint" "$f" 2>&1); rc=$?
fi

if [ -z "$gate" ]; then
  # Two different misses, on two different streams, and the stream is the contract.
  #   UNPROVEN        could-not-look. STDERR, via say_unproven, so it survives the
  #                   batch boundary, which takes its findings from stderr.
  #   not-recognised  a real observation: this file was read and is not a QH record.
  #                   STDOUT, for a caller that asks about one file directly. The
  #                   batch boundary parses stdout as JSON lines ONLY and so drops it
  #                   — deliberately: on stderr, every commit touching any Markdown
  #                   file would report a "failure" about a file that is fine.
  # ⚠ This comment used to say a miss "is a named state … at commit". For
  # not-recognised it was named to nobody there, and every test merged the two
  # streams, so nothing could tell (audit 2026-09-18, B8). Never a PostToolUse
  # finding for a file that is not a QH record (ADR-053 T4). Corpus gates do not run.
  if [ ! -e "$f" ] || [ ! -r "$f" ]; then
    say_unproven "$(printf 'UNPROVEN: could not classify %s' "$f")"
    exit 0
  fi
  if [ "$boundary" = "PostToolUse" ]; then
    exit 0
  fi
  printf 'not-recognised: %s is not a QH record or task\n' "$f"
  exit 0
fi
[ "$rc" -eq 0 ] && exit 0

# A GATE THAT COULD NOT RUN HAS NOT FOUND ANYTHING (ADR-005; ADR-046 T1). Every
# gate dispatched here reserves one exit code for "nothing was checked" — its
# lib missing beside a copied bin/, a bound test that could not start — and
# until 2026-09-11 that code fell through to the finding text below: "adr-lint is
# not satisfied … Fix the artifact, not the gate", about a record the gate never
# opened. The code is the GATE'S, read from its Exit block and verified by running
# each gate with its lib removed (ADR-045 T4):
#
#   adr-lint 2 · arch-lint 2 · adr-retire-check 2 · spec-verify 4 ·
#   postmortem-verify 2
#
# The line is the UNPROVEN vocabulary the rest of this file already uses, and
# it exits 0 like everything else here. The stream is say_unproven's, so a
# commit/completion consumer that reads stderr (runArtifactGates) sees it.
unrun_exit() {
  case "$1" in
    "spec-verify --draft") printf '4' ;;
    adr-lint|arch-lint|adr-retire-check|postmortem-verify) printf '2' ;;
    *) printf '' ;;
  esac
}
if [ -n "$(unrun_exit "$gate")" ] && [ "$rc" -eq "$(unrun_exit "$gate")" ]; then
  # The gate's own sentence, which says WHY it could not run; its first line
  # when it wrote none (stderr is merged into $out above, and on this path the
  # gates write nothing to stdout).
  reason=$(printf '%s\n' "$out" | grep -m1 'could not run' || printf '%s\n' "$out" | head -n1)
  say_unproven "$(printf 'UNPROVEN: %s could not run (exit %s): %s' "$gate" "$rc" "$reason")"
  exit 0
fi
# adr-lint's exit 3 is [UNPROVEN]: nothing blocks, and something its verdict rests on could not be
# read (BACKLOG §350 C8). It is not "not satisfied": that would report a finding it did not make.
if [ "$gate" = "adr-lint" ] && [ "$rc" -eq 3 ]; then
  reason=$(printf '%s\n' "$out" | grep -m1 'unproven:' | sed 's/^ *unproven: //' || true)
  say_unproven "$(printf 'UNPROVEN: adr-lint could not decide (exit 3): %s' "${reason:-it said nothing}")"
  exit 0
fi

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
