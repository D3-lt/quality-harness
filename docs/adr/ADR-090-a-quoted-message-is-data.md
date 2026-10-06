# ADR-090: A quoted commit message is data to the publish refusal, and what the shell runs is read as run

**Status:** Accepted
**Date:** 2026-10-06
**Owner:** Zy
**Spec:** None — no spec stage; docs/BACKLOG.md §351 "ADR-086 residual false refusals" and Step 2 of the 2026-10-06 plan `ok-plan-this-properly-flickering-lightning` (harvest the test suites of kenryu42/cc-safety-net and nizos/probity as inputs for the §16 classifier)
**Cross-references:** docs/adr/ADR-061-an-unchecked-publish-is-refused.md, docs/adr/ADR-066-git-refuses-an-unchecked-publish.md, docs/adr/ADR-067-the-publish-classifier-reads-the-command-as-the-shell-splits-it.md, docs/adr/ADR-081-qh-check-reads-its-own-ledger.md, docs/adr/ADR-086-a-fresh-repository-commit-is-not-refused.md, docs/BACKLOG.md, CLAUDE.md, .claude/rules/16-classifiers-are-empirical.md
**Governs:** None — declared by its tasks
**Enforced-by:** None — declared by its tasks. Each task adds one campaign mutation per `Rests-on` name; naming them before they exist would be a pointer to nothing.
**Invalidates:** ADR-086 — Decision 2's raw-text conditions (no `push`, no `!{}` or backtick, no environment name, no arithmetic, no quoted operator) read the text with each quoted commit message masked (T1). ADR-066 — Decision 4's whole-command rules (`GIT_CONFIG*`, `env`, any `$`, `.git/`) read the same masked text (T1). ADR-067 — Decision 1's lexer gains three readings (T2) and Decision 3's wrappers are matched by program name, not by the literal word (T3).
**Served-path change:** PreToolUse rule P stops refusing a commit whose only "code" is a quoted `-m`/`-F` value, in the two places a commit is downgraded from a refusal (ADR-066's armed grammar and ADR-086's fresh repository), and starts refusing four spellings of a publish it read only as a mention: a substitution in an unquoted heredoc body, a substitution after a parameter in double quotes, a `function` body, and a wrapper named by its path.

## Context

- **The false refusal (BACKLOG §351, the Codex re-review of a14a751, P2).** On an unchecked tree, ADR-086's
  fresh-repository commit is refused when its message says "push" or holds a quoted `;`. The record's own
  Follow-up left it open. The Codex review suggested classifying invoked verbs and git argument positions
  instead of raw text.
- **Where raw text decides (enumerated 2026-10-06 at 73f930f).**
  `mrw read --grep '\.test\((text|raw|joined|unquoted)\)|code\.some\(Boolean\)|words\.some\(w => /' plugin/scripts/lifecycle.mjs`
  printed 19 lines. 13 are in the refusal's downgrade path: `freshRepositoryCommit` (`lifecycle.mjs:860`, `:861`,
  `:862`, `:876`), `segmentVerdict` (`:4969`, `:4982`), `freshDirectoryText` (`:5091`, `:5095`) and
  `leavesHookInPlace` (`:5132`, `:5136`, `:5141`, `:5143`, `:5146`). Left out on purpose: `:124`, `:207`,
  `:231` and `:235` read a test run's output, not shell text; `:2513` reads a record; `:4292` is the advisory
  arm, which never refuses (CLAUDE.md §3). The publish finder itself, `publishCommandIn` (`:4272`), already reads
  argv (ADR-067) and is not in the class: a message saying "push" does not make it name a push.
- **Why the raw rules exist.** Each was added because the lexer does not model something: `printf -v
  GIT_CONFIG_COUNT` assigns with no builtin listed (`:5144-5145`), `((X))` assigns a name spelled only in a
  value (`:835-839`), and a quoted span holding an operator may be code an interpreter runs (`:4988-4990`).
  Replacing them with argv rules would reopen what those rounds closed. One position is provably data to the
  shell and to git alike: a wholly quoted, non-dynamic value of a commit's message or file option.
- **The harvest (2026-10-06).** Inputs only; no code was copied. kenryu42/cc-safety-net (MIT) at 3793a43 and
  nizos/probity (MIT) at 7746e0d were cloned shallowly into a scratch directory, and nothing from them was run.
  Every command shape their test suites treat as a commit, a push, or a wrapper around a destructive command
  was collected; a wrapper was re-written with `git push` as its inner command. probity's gate matches the raw
  pattern `/git commit/` (`src/rules/require-command.test.ts:9`) and contributes two plain rows.
  - **What was measured, and what was read.** Each row went through `publishCommandIn`,
    `mentionsCommitOrPush`, `freshRepositoryCommit(…, {})` and `leavesHookInPlace`, imported from
    `plugin/scripts/lifecycle.mjs` (blob 4e138d6e at 73f930f), as `tests/publish-command.test.mjs` imports them.
    "Unarmed" is rule P on an unchecked tree with a whole log, no fast pass and no `"publish": "warn"`: refused
    when an invocation is proven and no downgrade holds, advised when only a mention is seen, missed when
    neither. "Armed" means only that `leavesHookInPlace` returned true, so git's own hook would judge. Those
    columns are measured. The **Reading** column is NOT: no candidate command was executed (the drafting brief
    forbade it), so P (a publish runs), D (none does) and U (the text cannot know) are this record's reading of
    POSIX shell, to be measured by T2's and T3's executing tests.
  - **Counts.** 78 rows: 76 from cc-safety-net, 2 from probity. 49 publishes refused. 19 publishes advised, none
    missed silently. Of the 10 rows that run no publish or cannot be known, 8 advised and 2 missed, both
    correctly. **No false refusal came from the harvest**; both suites' commit rows are plain. Every false
    refusal below is a row this record built from BACKLOG §351, or one of its own.
  - **The 19 advised publishes, in four groups.**
    - Gaps in what the classifier claims to model, the fail-open findings of this record (six rows, four
      causes): an unquoted heredoc body's substitution (L16, L27; their CR-terminated delimiters make the
      reading hinge on bash's delimiter match, so the cause was re-probed with LF: `cat <<EOF⏎$(git push)⏎EOF`
      gives `publishCommandIn` null, 2026-10-06), a wrapper named by its path (W3, W4; probed too:
      `/bin/env`, `/usr/bin/sudo` and `/usr/bin/time` before `git push` give null, because `programIndex`
      compares `word === 'env'` at `:3831`, not the program's name), the `function` keyword (W31: the lexer
      reads `function g { git push; }` as one command whose argv starts `function`), and a substitution right
      after a parameter inside double quotes (W42: `shellWords('echo "$x$(git push)"')` records no
      substitution, while `"$x $(git push)"` does). `commitOnlyCommand` (`:822`) already treats an unquoted
      heredoc body as code: prior art for the first.
    - By ADR-067's design, unchanged: W15 (a `printf` upstream of `xargs`, `:4022-4024`), W34 (a variable as
      the program), W43 (a dynamic program word).
    - Bash 5.3 or later only: W40, W41 (`${ cmd; }`).
    - Programs the classifier does not model: W19, W20, W23, W24, W25, W28, W29, W37.

    All of them are advised rather than refused only where git's hook is not armed; in an armed session git
    refuses an unchecked commit at the event (ADR-066).

**The rows not refused (harvested):**

| Row | Source | Command | Reading | Unarmed | Group |
|---|---|---|---|---|---|
| L16 | csn tests/gate/behavioral-contract-cases.ts:1009 | `cat <<EOF⏎EOF\r⏎cat <<'EOF'⏎$(git push --force)⏎EOF` | P | advised | in-model gap: unquoted heredoc body |
| L26 | csn tests/gate/secret/secret-protection.test.ts:1849 | `git stash push -m credentials` | D | advised | correct: no publish runs |
| L27 | csn tests/gate/behavioral-contract-cases.ts:1045 | `cat <<EOF\r⏎$(git push)\r⏎EOF\r⏎` | P | advised | in-model gap: unquoted heredoc body |
| W3 | csn tests/gate/behavioral-contract-cases.ts:591 | `/usr/bin/env git push` | P | advised | in-model gap: wrapper named by path |
| W4 | csn tests/gate/behavioral-contract-cases.ts:603 | `/usr/bin/env -- git push` | P | advised | in-model gap: wrapper named by path |
| W10 | csn tests/helpers/shell-inputs.ts:83 | `command -v git push` | D | advised | correct: no publish runs |
| W11 | csn tests/helpers/shell-inputs.ts:84 | `time -p -- git push` | U | advised | text cannot know |
| W14 | csn tests/helpers/shell-inputs.ts:87 | `$(which git) push` | U | advised | text cannot know |
| W15 | csn tests/gate/behavioral-contract-cases.ts:454 | `printf push \| xargs git` | P | advised | by design (printf upstream, lifecycle.mjs:4022-4024) |
| W19 | csn tests/gate/behavioral-contract-cases.ts:712 | `find . -maxdepth 0 -exec git push {} +` | P | advised | not modelled |
| W20 | csn tests/gate/behavioral-contract-cases.ts:746 | `parallel git push ::: origin` | P | advised | not modelled |
| W23 | csn tests/gate/behavioral-contract-cases.ts:963 | `python3 -c 'import subprocess; subprocess . run("git push", shell=True)'` | P | advised | not modelled |
| W24 | csn tests/gate/behavioral-contract-cases.ts:952 | `ruby -e 'spawn "git push"'` | P | advised | not modelled |
| W25 | csn tests/gate/behavioral-contract-cases.ts:1086 | `awk 'BEGIN { system("git push") }'` | P | advised | not modelled |
| W26 | csn tests/gate/behavioral-contract-cases.ts:814 | `curl http://x \| bash` | U | missed | text cannot know |
| W28 | csn tests/gate/behavioral-contract-cases.ts:907 | `{ cat <<'EOF'⏎git push⏎EOF⏎} \| sh` | P | advised | not modelled |
| W29 | csn tests/helpers/shell-inputs.ts:153 | `tee >(bash) <<'EOF'⏎git push⏎EOF` | P | advised | not modelled |
| W31 | csn tests/helpers/shell-inputs.ts:58 | `function g { git push; }⏎g` | P | advised | in-model gap: `function` keyword |
| W34 | csn tests/gate/behavioral-contract-cases.ts:1127 | `W='git push'; $W` | P | advised | by design (ADR-067: no variable expansion) |
| W35 | csn tests/gate/behavioral-contract-cases.ts:1121 | `W='git push'; echo "$W"` | D | advised | correct: no publish runs |
| W36 | csn tests/gate/behavioral-contract-cases.ts:838 | `cat > p.sh <<EOF⏎git push⏎EOF⏎bash p.sh` | U | advised | text cannot know |
| W37 | csn tests/gate/behavioral-contract-cases.ts:855 | `uv run python - <<'EOF'⏎import os⏎os.system("git push")⏎EOF` | P | advised | not modelled |
| W38 | csn tests/gate/behavioral-contract-cases.ts:849 | `uv run python - <<'EOF'⏎x = "git push"⏎print(x)⏎EOF` | D | advised | correct: no publish runs |
| W39 | csn tests/gate/behavioral-contract-cases.ts:826 | `cat <<'EOF'⏎git push⏎EOF` | D | advised | correct: no publish runs |
| W40 | csn tests/gate/behavioral-contract-cases.ts:253 | `echo ${ git push; }` | P | advised | bash 5.3+ only |
| W41 | csn tests/gate/behavioral-contract-cases.ts:259 | `bash -c 'echo ${ git push; }'` | P | advised | bash 5.3+ only |
| W42 | csn tests/gate/behavioral-contract-cases.ts:283 | `echo "$x$(git push)"` | P | advised | in-model gap: `"$x$(…)"` lexer drop |
| W43 | csn tests/gate/behavioral-contract-cases.ts:236 | `$(printf g)it push` | P | advised | by design (ADR-067: a dynamic program is a mention) |
| W51 | csn tests/helpers/shell-inputs.ts:84 | `time -p -- ! X=1 git status` | D | missed | correct: no publish runs |

**The 49 publishes refused (harvested), each correctly:** L1 `git commit -m feat` (probity src/rules/require-command.test.ts:15); L2 `git commit` (probity src/rules/utils/match-paths.test.ts:63); L3 `GITHUB_TOKEN=x git push --force origin main` (csn tests/core/denial.test.ts:243); L4 `git push --force origin main; echo 1` (csn tests/core/denial.test.ts:49); L5 `git -c commit.gpgsign=false -c user.name=n -c user.email=e@localhost commit -m "chore: update plugin"` (csn tests/cli/install/index.test.ts:1064); L6 `git push origin HEAD` (csn tests/cli/install/index.test.ts:1065); L7 `git push -f origin main` (csn tests/gate/analyzer/mid.test.ts:135); L8 `git push origin +main` (csn tests/gate/analyzer/git-rules.test.ts:130); L9 `git push origin :main` (csn tests/gate/analyzer/git-rules.test.ts:131); L10 `git push --mirror origin` (csn tests/gate/analyzer/git-rules.test.ts:128); L11 `git push --delete origin main` (csn tests/gate/analyzer/git-rules.test.ts:129); L12 `git push --force-with-lease origin main` (csn tests/gate/behavioral-contract-cases.ts:665); L13 `git commit -m "fix: adjust parser"` (csn tests/gate/behavioral-contract-cases.ts:91); L14 `bash -c 'git commit --amend'` (csn tests/gate/behavioral-contract-cases.ts:554); L15 `cd /tmp/a; git push --force origin main` (csn tests/gate/behavioral-contract-cases.ts:1209); L17 `git commit -F- <<EOF⏎message with rm -rf /⏎EOF` (csn tests/helpers/shell-inputs.ts:55); L18 `git commit --message credentials` (csn tests/gate/secret/secret-protection.test.ts:1831); L19 `git commit --message=credentials` (csn tests/gate/secret/secret-protection.test.ts:1836); L20 `git commit -am credentials` (csn tests/gate/secret/secret-protection.test.ts:1842); L21 `git commit -nm credentials` (csn tests/gate/secret/secret-protection.test.ts:1843); L22 `git commit -enm credentials` (csn tests/gate/secret/secret-protection.test.ts:1846); L23 `git commit -F credentials` (csn tests/gate/secret/secret-protection.test.ts:1890); L24 `git commit -Fm credentials` (csn tests/gate/secret/secret-protection.test.ts:1895); L25 `git commit -- -m credentials` (csn tests/gate/secret/secret-protection.test.ts:1910); W1 `sh -c 'git push'` (csn tests/gate/behavioral-contract-cases.ts:225); W2 `eval 'git push'` (csn tests/gate/behavioral-contract-cases.ts:533); W5 `env -u X -C /tmp git push` (csn tests/helpers/shell-inputs.ts:80); W6 `env -S "git push"` (csn tests/helpers/shell-inputs.ts:80); W7 `sudo -u root -- git push` (csn tests/helpers/shell-inputs.ts:81); W8 `sudo git push` (csn tests/gate/behavioral-contract-cases.ts:1109); W9 `command -p git push` (csn tests/helpers/shell-inputs.ts:82); W12 `time git push` (csn tests/helpers/shell-inputs.ts:85); W13 `"time" git push` (csn tests/helpers/shell-inputs.ts:86); W16 `printf x \| xargs -I{} sh -c "git push"` (csn tests/gate/behavioral-contract-cases.ts:729); W17 `find . -name '*.log' \| xargs -I{} sh -c 'git push'` (csn tests/gate/behavioral-contract-cases.ts:924); W18 `xargs -0 git push < list` (csn tests/helpers/shell-inputs.ts:130); W21 `python -c "import os; os.system('git push')"` (csn tests/gate/behavioral-contract-cases.ts:443); W22 `python3 -c "import subprocess; subprocess.run('git push', shell=True)"` (csn tests/gate/behavioral-contract-cases.ts:896); W27 `cat <<EOF \| bash⏎git push⏎EOF` (csn tests/helpers/shell-inputs.ts:145); W30 `f() { git push; }; f` (csn tests/helpers/shell-inputs.ts:57); W32 `( cd /tmp && git push )` (csn tests/helpers/shell-inputs.ts:60); W33 `{ git push; } > out` (csn tests/helpers/shell-inputs.ts:61); W44 `eval $(opam env) && git push` (csn tests/gate/behavioral-contract-cases.ts:946); W45 `git -c core.hooksPath=/tmp/hooks push` (csn tests/helpers/shell-inputs.ts:132); W46 `GIT_DIR=/tmp/a/.git git push` (csn tests/gate/behavioral-contract-cases.ts:1233); W47 `R=/tmp/a; cd $R; git push` (csn tests/gate/behavioral-contract-cases.ts:1185); W48 `for c in a b; do R=/tmp/$c; cd $R; git push; done` (csn tests/gate/behavioral-contract-cases.ts:1244); W49 `cd /tmp/a && git status \| head -1 && git push` (csn tests/gate/behavioral-contract-cases.ts:1308); W50 `cd /tmp/missing && printf ready⏎git push` (csn tests/gate/behavioral-contract-cases.ts:1338)

**The value rows and their twins (this record's, 2026-10-06).** `F…` stands for
`R=$(mktemp -d) && cd "$R" && git init -q && git commit --allow-empty ` (ADR-086's unarmed fresh repository) and
`A…` for `cd /tmp/scratch && git commit ` (an armed session committing in another repository, where git's hook
would pass it). "Result" is the context's column: unarmed for `fresh`, armed for `armed`. The message forms
follow cc-safety-net `tests/gate/secret/secret-protection.test.ts:1828-1910`.

| Row | Context | Command | Reading | Result | Source |
|---|---|---|---|---|---|
| D1 | fresh | `F… -m "push the fix"` | D | refused | BACKLOG §351 |
| D2 | fresh | `F… -m "a;b"` | D | refused | BACKLOG §351 |
| D3 | fresh | `F… -m "use ((x)) here"` | D | refused | BACKLOG §351 (task brief) |
| D4 | fresh | `F… -m "let it be"` | D | refused | BACKLOG §351 (task brief) |
| D5 | fresh | `F… --message="push the fix"` | D | refused | cc-safety-net secret-protection.test.ts:1836 form |
| D6 | fresh | `F… -m 'push; then {braces} and !bang'` | D | refused | ours |
| D7 | fresh | `F… -m "fix PATH handling"` | D | refused | ours |
| D8 | fresh | `F… -m "a\|b"` | D | refused | ours |
| D9 | armed | `A… -m "fix PATH handling"` | D | refused | ours |
| D10 | armed | `A… -m "push the fix"` | D | git-hook | ours |
| D11 | armed | `A… -m "see .git/config"` | D | refused | ours |
| D12 | armed | `A… -m 'costs $5'` | D | refused | ours |
| D13 | armed | `A… -m "env cleanup"` | D | refused | ours |
| D14 | armed | `A… -m "let it be"` | D | git-hook | ours |
| D15 | armed | `cd /tmp/scratch && git add push.md && git commit -m x` | D | refused | ours (segmentVerdict word test) |
| D16 | armed | `A… -m "a;b"` | D | git-hook | ours |
| T1 | fresh | `F… -m "$(git push)"` | P | refused | twin |
| T2 | fresh | `` F… -m "`git push`" `` | P | refused | twin |
| T3 | fresh | `F… --message="$(git push)"` | P | refused | twin |
| T4 | fresh | `F… -m "$GIT_DIR"` | U | refused | twin |
| T5 | fresh | `F… -m x; git push` | P | refused | twin |
| T6 | fresh | `F… -F <(git push)` | P | refused | twin |
| T7 | fresh | `F… -m "$(cd /orig && git commit -qm y)"` | P | refused | twin |
| T8 | fresh | `F… -m x && git push` | P | refused | twin |
| T9 | fresh | `F… -m "${x:-$(git push)}"` | P | refused | twin |
| T10 | armed | `A… -m "$(git -C /orig commit -qm y)"` | P | refused | twin |
| T11 | armed | `A… -nm "push"` | P | refused | twin (-n skips hooks; cc-safety-net secret-protection.test.ts:1843 form) |
| T12 | armed | `A… -m x; GIT_CONFIG_COUNT=0 git commit -qm y` | P | refused | twin |
| T13 | armed | `A… -m 'x' -m "$(git config hook.qh-publish-commit.enabled false)"` | P | refused | twin |
| T14 | fresh | `F… -m '$(git push)'` | D | refused | data (single quotes do not expand) |


So 14 correct commands are refused today: D1–D16 less D10, D14 and D16 (left to git's hook), plus T14, a
single-quoted value. All 13 code-again twins (T1–T13) are refused, as they must stay. Four more twins this
record adds were run the same day and are refused today: `F… -m "push" && git push`, `F… -- -m "push"`,
`F… -Fm "push"` (git reads `m` as the file and `"push"` as a pathspec), and the armed
`A… -m {x,--no-verify}`, which brace expansion turns into a hook-skipping flag.

- **CLAUDE.md §16 governs this change.** An exemption turns a refusal into advice and is attacked from the side
  it opens, so each data row has its code-again twin beside it, and the twins are the larger half of every
  test. A full shell parser would be a new, confident classifier, which is the §16 risk itself; this record
  masks one position the shell and git both treat as one literal word, and fixes four readings of the existing
  lexer and walk where the harvest showed them wrong.

## Existing Primitives Audit

- **`shellWords`** (`plugin/scripts/shell-words.mjs:26`): reused for T1 as is (`argv`, `quoted`, `dynamic`).
  T2 changes three of its readings and adds no field.
- **`plainGitArguments`** (`lifecycle.mjs:4941`): its short-cluster rule — a valued letter takes the rest of its
  cluster, or the next word when it ends the cluster — is the rule T1 uses to find a value. T1 shares it, not
  restates it. `VERB_VALUED` (`:3874`) is not reused: it reads `-Fm` as a cluster ending in `m` and so takes
  the NEXT word as the value, which is not what git does (Follow-ups).
- **`gitVerbIndex`** (`:3858`): finds the verb past git's own options; T1 masks only when it is the literal
  `commit`.
- **`freshDirectoryText`** (`:5090`): the in-file precedent for rewriting text before the raw rules read it,
  including its guard that the replaced spelling occurs exactly once (`:5101`).
- **`programName`** and **`programIndex`** (`:3800`): T3 matches the wrappers by `programName`, as `isGit`
  (`:3793`) already matches git in any directory.
- **The executing harness** of ADR-067 T1 (`tests/shell-words.test.mjs`) and ADR-086 T2 (`the fresh-repository
  rows commit where the classifier says they do`): T1-T3 run their rows under a real shell the same way.

## Decision

1. **A quoted message value is masked before the downgrade rules read the text (T1).** A *message value* is an
   argv word that:
   - stands as the value of `-m`, `--message`, `-F` or `--file`, or as the tail of `--message=` or `--file=`,
     or as the value of a short cluster by `plainGitArguments`' rule (`-am` takes the next word; `-Fm` takes
     `m`), before any `--`;
   - in a command whose program word is literally `git`, not dynamic, and whose verb by `gitVerbIndex` is the
     literal `commit`;
   - whose value part (the whole word after `-m`, `--message`, `-F` or `--file`, or the text after `=` or after
     the valued letter) was written as one single-quoted or one double-quoted span with nothing else in that
     part, so `--message="x"` and `-m"x"` qualify and `--message=x"y"` does not; and whose word is not
     `dynamic` (so no `$`, backtick or glob the shell would expand). Masking keys on `dynamic`, never on
     `substitutions`, because W42 shows a substitution the lexer can miss;
   - and whose quoted spelling occurs exactly once in the whole text.

   `freshRepositoryCommit`, `freshDirectoryText` and `leavesHookInPlace` each first replace every message
   value's quoted spelling with the plain word `msg`, then run every rule they have today over that text.
   Nothing is masked anywhere else: `publishCommandIn`, `commitOnlyCommand`, `mentionsCommitOrPush`, the reviewer
   guard and `publishVerdict` read the command as they do today. A value that fails any condition keeps
   today's verdict.
2. **The lexer reads three things as the shell runs them (T2).**
   - The body of a heredoc whose delimiter is unquoted: its `$(…)` and backtick spans are command
     substitutions of its command, as POSIX expands that body. A quoted delimiter's body, and a `\$(` in an
     unquoted body, stay data.
   - A substitution right after a parameter inside double quotes (`"$x$(…)"`) is recorded, as `"$x $(…)"` and
     `"${x}$(…)"` already are.
   - `function NAME { …; }` and `function NAME () { …; }`: the body's commands are commands.
3. **A wrapper named by an absolute path is that wrapper (T3).** `programIndex` matches `exec`, `nohup`,
   `doas`, `command`, `time`, `nice`, `sudo`, `timeout`, `xargs` and `env` by `programName` when the word is an
   absolute path, so `/usr/bin/env git push` is the `git push` it runs. A relative path (`./env`) is a program
   of the user's and stays a mention.

**This fails if**, through the real PreToolUse hook, any twin row in T1-T3 is not refused on an unchecked tree;
if any data row is refused; or if an executing test shows a data row running a publish, or a twin row not
running one. The readings are POSIX `sh`, bash and zsh under the Bash tool. T2's rows are measured where those
shells exist and skipped with the reason where they do not; `${ cmd; }` is bash 5.3 or later and is out of
scope here.

## Alternatives Considered

- **(a) Do nothing.** Rejected. The 14 false refusals cost a turn each and teach a session to stage git through
  a script, the channel BACKLOG §269 measured carrying a real unchecked publish (ADR-086 Alternatives (a)). The
  six advised publishes are a fail-open in every unarmed session, and the owner's rule is that a fail-open is
  fixed before a release.
- **(b) Classify invoked verbs and argument positions everywhere (the Codex suggestion, in full).** Replace
  each raw rule with an argv rule: a `push` only as git's verb, an operator only where a shell runs it.
  Rejected. The raw rules stand in for what the lexer does not model (`printf -v`, `((X))`, `let`, a quoted
  operator an interpreter runs), and each rewrite would have to re-prove what three Codex rounds on ADR-066 and
  two on ADR-086 found. `publishCommandIn` also names only the first invocation (`:810-812`), so it cannot
  replace the `push` check: `… git commit -m x && git push` would pass.
- **(c) A full POSIX shell parser.** Rejected under CLAUDE.md §16: a confident parser is a new classifier
  over an open input space, and ADR-067 Alternatives already rejected an npm parser (zero runtime
  dependencies, ADR-008).
- **(d) The narrow exemption, as decided.** Chosen: one position, keyed on the lexer's `dynamic`, with a
  uniqueness guard, plus the four lexer and walk readings the harvest showed wrong.
- **(e) Also mask an unquoted value (`-m push`).** Rejected. Brace expansion turns `-m {x,--no-verify}` into a
  message and a hook-skipping flag, and only a quoted span is provably one literal word.
- **(f) Treat `-m "$(cat <<'EOF' … EOF)"` as data.** Not taken here (Follow-ups). It is the common commit
  spelling, but a substitution runs a program, and proving that one is `cat` of a quoted heredoc is a second
  exemption with its own twins.
- **(g) Model the eight unmodelled programs too** (`find -exec`, `parallel`, `ruby -e`, `awk system()`, a
  group piped to `sh`, `tee >(bash)`, `uv run python -`, a spaced `subprocess . run`). Deferred: each is a new
  name in an open set and needs its own measured rows (§16); all eight are advised, never silent.

## Component / Boundary Impact

None — internal to rule P: `plugin/scripts/lifecycle.mjs` and the lexer it reads, `plugin/scripts/shell-words.mjs`. The host boundary, git's hook, the advisory arm and the session log are unchanged.

## Wiring & Contract Changes

| Surface | Change | Producer | Consumer(s) |
|---------|--------|----------|-------------|
| PreToolUse `permissionDecision` for a Bash commit with a quoted message | armed: ADR-066's advice instead of `deny` where only the value blocked; unarmed fresh repository: ADR-086's advice instead of `deny` | T1 | Claude Code |
| PreToolUse `permissionDecision` for a Bash or PowerShell publish in an unquoted heredoc body, after a quoted parameter, or in a `function` body | `deny` on an unchecked tree instead of the mention advisory | T2 | Claude Code, the reviewer guard (`readOnlyVerdict`) |
| `shellWords()` | `substitutions` include an unquoted heredoc body's and a parameter-adjacent one's; a `function` body is split into its commands | T2 | `publishCommandIn`, `plainPublishes`, `freshDirectoryVariables`, `commitOnlyCommand` |
| PreToolUse `permissionDecision` for a wrapper named by an absolute path | `deny` on an unchecked tree instead of the mention advisory | T3 | Claude Code, the reviewer guard |

## Inter-task Contracts

None — the three tasks touch different functions and share no new symbol; T1 reads `shellWords` as it is today, and T2's changes only add substitutions and commands that T1's conditions already exclude.

## Implementation

See `docs/adr/ADR-090-a-quoted-message-is-data/tasks/README.md`.

## Consequences

- **Positive:** a scratch-repository commit whose message mentions "push", PATH, `.git/` or a `$` in single
  quotes is no longer refused, so it needs no script around git. Four spellings that ran a publish unrefused
  are refused.
- **Negative:**
  - The common Claude Code spelling `git commit -m "$(cat <<'EOF' … EOF)"` is dynamic, so it is not masked and
    stays refused in both downgrades. T1 helps only a session that writes a quoted literal message.
  - An unquoted value (`-m push`) stays refused in the fresh-repository chain.
  - T2 widens what `readOnlyVerdict` refuses for a read-only role by the same four spellings, which is correct
    for a role that may not publish.
  - The masking is one more text rewrite before the raw rules, beside `freshDirectoryText`'s.
- **Neutral:** no new advisory text and no new key; the advice a downgraded commit gets is ADR-066's or
  ADR-086's, unchanged.

## Out of Scope

- `${ cmd; }` and `${| cmd; }` (bash 5.3 or later) (deferred: docs/adr/ADR-090-a-quoted-message-is-data.md Follow-ups, an owner decision: whether the lexer reads a construct only one shell version has)
- The eight programs the classifier does not model, rows W19, W20, W23, W24, W25, W28, W29, W37 (deferred: docs/adr/ADR-090-a-quoted-message-is-data.md Follow-ups, an owner decision: which to measure and model)
- `git add push.md && git commit -m x` refused when armed, by `segmentVerdict`'s word test on a pathspec (`:4982`) (deferred: docs/adr/ADR-090-a-quoted-message-is-data.md Follow-ups, an owner decision)
- `git -c commit.gpgsign=false … commit` refused when armed, because ADR-066's grammar admits only `-c user.*` (L5) (deferred: docs/adr/ADR-090-a-quoted-message-is-data.md Follow-ups, an owner decision)
- `VERB_VALUED` reading `-Fm` as taking the next word, so `git commit -Fm --dry-run` is read as a commit (deferred: docs/adr/ADR-090-a-quoted-message-is-data.md Follow-ups, an owner decision)
- `-m "$(cat <<'EOF' … EOF)"` as data (deferred: docs/adr/ADR-090-a-quoted-message-is-data.md Follow-ups, Alternatives (f))
- A variable or a dynamic word as the program, and a `printf` upstream of `xargs` (permanent: boundary: ADR-067 Decision 3 and its Alternatives reject expanding a variable for a refusal, and `lifecycle.mjs:4022-4024` leaves that upstream to advice)
- An unquoted message value (permanent: boundary: only a quoted span is provably one literal word; Alternatives (e))
- PowerShell (permanent: boundary: `shellWords` reads POSIX shell text, as ADR-086 Out of Scope says)
- ADR-060's reviewer guard as a downgrade (permanent: boundary: a read-only role commits nowhere, whatever the message says)

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| A masked value hides code the shell runs | Low | High | masking keys on `dynamic` and a single quoted span, never on `substitutions`; the uniqueness guard keeps a spelling that also stands as code (twin: `A… -m '.git/hooks' && cp x '.git/hooks'`); T1's executing test runs every data row |
| T2 reads a heredoc body as code where the shell does not | Med | Med | a quoted delimiter and an escaped `\$(` are twins; T2's rows run under bash and zsh with recording stand-ins, as ADR-067 T1's do |
| T3 refuses a program the user named `env` that does not run git | Low | Low | only an absolute path counts; `./env git push` stays a mention (twin) |
| A locked test body would have to change | Low | Med | 115 locks on `tests/publish-command.test.mjs` and 3 on `tests/shell-words.test.mjs` (`scripts/test-locks.py`, 2026-10-06); every task adds tests beside them |

## Rollback

None — no persistent state, contract or external integration changes. Reverting T1-T3's commits restores today's verdicts; no log event or key is added.

## Follow-ups

- [ ] Owner decision: model `${ cmd; }` (bash 5.3 or later) in the lexer, or leave it advised.
- [ ] Owner decision: which of the eight unmodelled programs (W19, W20, W23, W24, W25, W28, W29, W37) to measure and model, each with its own rows; this drafting session was not permitted to edit docs/BACKLOG.md, so each needs filing there.
- [ ] Owner decision: `segmentVerdict`'s word test refusing `git add push.md && git commit -m x` when armed (`lifecycle.mjs:4982`).
- [ ] Owner decision: ADR-066's armed grammar refusing `-c commit.gpgsign=false` (L5).
- [ ] Owner decision: `VERB_VALUED` (`lifecycle.mjs:3875`) reads `-Fm` as taking the next word; git reads `m` as the file.
- [ ] Owner decision: is `-m "$(cat <<'EOF' … EOF)"` worth its own exemption and twins (Alternatives (f))?
- [x] Executed 2026-10-06: T1-T3 done, each with its red run, killed mutants and catalogue entries (`tests/mutations.json`, labels `ADR-090 T1:`/`T2:`/`T3:`); T1's lock map was retaken with `adr-verify --relock --replace-hashes` after a reviewed swap of one arithmetic row.
