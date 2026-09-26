# Corpus chaos: the perturbation catalogue

The `## Chaos` section of `SKILL.md` is the protocol; this file is the menu. Every entry is
a way a real repository, a real filesystem or a real person has handed a reader something
nobody wrote a test for. Apply one per round to the **scratch copy**, never to the probed
tree. Each entry gives the kind of input it produces and a portable way to make it (Node
one-liners work on macOS, Linux and Windows; the shell forms are POSIX).

`<f>` is a record, task file, README or log in the scratch copy; `<d>` is a directory there.

## A. Names and paths

| # | Perturbation | Make it |
|---|---|---|
| A1 | Space inside, before, after a name | rename `<f>` to `ADR 007 x.md`, ` T1.md`, `T1.md ` |
| A2 | Unicode normalisation: the same name as NFC and NFD | `node -e "fs.renameSync(f, f.replace('e','é'))"`, then a second file with `é` |
| A3 | Invisible characters | zero-width space (U+200B), right-to-left mark (U+200F), BOM (U+FEFF) at the START of a file name: `node -e "fs.writeFileSync('\ufeffT1.md','x')"` |
| A4 | Homoglyphs | Cyrillic `А` (U+0410) for Latin `A` in `ADR-`, fullwidth digits `０７` (U+FF10, U+FF17) |
| A5 | Shell and glob metacharacters | names holding `*`, `?`, `[1]`, `$HOME`, `` ` ``, `'`, `"`, `;`, `&`, `\|`, `#`, a leading `-`; a backslash splits the name, because the readers treat it as a path separator on every platform (by design, for Windows paths) |
| A6 | Newline, tab or carriage return in a file name (POSIX only) | `node -e "fs.writeFileSync('T1\nT2.md','x')"` |
| A7 | Very long names and paths | a 255-byte component; a path past 260 characters on Windows; 40 nested directories |
| A8 | Case collisions | `README.md` and `readme.md` side by side (Linux); a case-only rename (macOS, Windows) |
| A9 | Symlinks | a loop (`a -> b -> a`), a dangling link, a link leaving the tree, a tasks dir that is a link |
| A10 | The wrong kind of node where a file is expected | a directory named `T1.md`; a FIFO named `ADR-009.md` (`mkfifo`, POSIX); an empty tasks dir; a tasks path that is a file |
| A11 | Reserved Windows names | `CON.md`, `aux`, `nul.md`, a name ending in a dot or a space |

## B. Content and encoding

| # | Perturbation | Make it |
|---|---|---|
| B1 | UTF-8 BOM on a record, a task, a JSON payload | prepend U+FEFF: `node -e "fs.writeFileSync(f,'\ufeff'+fs.readFileSync(f,'utf8'))"` |
| B2 | UTF-16LE (with and without BOM), Latin-1, Windows-1252 smart quotes | `node -e "fs.writeFileSync(f, Buffer.from(fs.readFileSync(f,'utf8'),'utf16le'))"` |
| B3 | Invalid UTF-8 | insert bytes `\xc3\x28` or a lone `\xff` into a header line |
| B4 | Line endings | CRLF everywhere, CR only, mixed per line, no final newline, 10 000 blank lines |
| B5 | Binary where text is expected | a PNG or a zip renamed to `.md`; NUL bytes inside a `**Status:**` line |
| B6 | Size | 0 bytes; one 5 MB line; a record just over and just under 512 KiB |
| B7 | Whitespace that is not a space | NBSP (U+00A0), tabs, em space (U+2003) in `**Status:**`, in table pipes, before a heading `#`; write them as `\u00a0` and `\u2003` in a `node -e` string |
| B8 | Header near-misses | `**status:**`, `**Status**:`, `Status：` (fullwidth colon, U+FF1A), `**Status:** Accepted <!-- no -->`, the header inside a code fence, twice with different values.; for a spec's Status, also an indented code block, a fence after a list marker, `<pre>`, and an HTML attribute value |
| B9 | Markdown that parses unlike it looks | a `|` inside backticks in a table cell, a table with a missing or extra column, a heading inside an HTML comment, a fenced block never closed |
| B10 | Escapes and quotes | `\'`, `\"`, `` \` ``, emoji, `${}` in a test title; a sign-off quoting program output that says "failed". Build them with `node -e` escapes (`\x60`, `\x24`) or your file tool, not shell literals |

## C. Structure and identity

| # | Perturbation | Make it |
|---|---|---|
| C1 | Two records with one number, or one record under two names | copy `ADR-007-x.md` to `ADR-007-y.md` |
| C2 | A task whose owner is missing, ambiguous, or in another corpus root | delete or duplicate the record beside a `tasks/` dir |
| C3 | Dependency shapes | `Depends-on:` naming itself, a cycle, a task that does not exist, 200 dependents |
| C4 | Status values nobody lists | `Accepted (partially)`, `accepted`, `ACCEPTED`, `Implemented`, an empty value |
| C5 | Nesting | `tasks/tasks/T1.md`, a record inside its own tasks dir, an archive inside an archive |
| C6 | A second corpus root appears | `docs/adr` and `adr/` and `decisions/` all at once |

## D. Ledgers and logs (the evidence a reader trusts)

| # | Perturbation | Make it |
|---|---|---|
| D1 | A Verification Log cut mid-line | truncate `<f>` inside its last row |
| D2 | Rows that lie | a duplicate row, rows out of order, `exit 0` beside a failing command, a 7-char and a 41-char sha, a sha of no commit |
| D3 | Dates that cannot be right | `2099-01-01`, `1970-01-01`, `2026-02-30`, a date with a time zone suffix |
| D4 | A local ledger damaged | in the scratch copy's `.git/quality-harness/`: `checks.jsonl` truncated, a garbage JSON line, a 5 MB line, binary bytes, the file replaced by a directory |
| D5 | An event log or state file from another version | an unknown field, a missing required field, `null` where an object was |

## E. Time

| # | Perturbation | Make it |
|---|---|---|
| E1 | Files dated in the future and the far past | `touch -t 209901010000 <f>`, `touch -t 197001020000 <f>`; on Windows `(Get-Item f).LastWriteTime = '2099-01-01'` |
| E2 | Time zones at the edge | run the readers under `TZ=Pacific/Kiritimati` (UTC+14) and `TZ=Etc/GMT+12` (UTC−12) |
| E3 | Locale | `LC_ALL=tr_TR.UTF-8` (the dotted/dotless i breaks case folding), `LANG=C` (no UTF-8 at all) |
| E4 | Time moving under the run | edit a task between two probe runs; commit in the scratch copy while a reader runs; a git HEAD older than the working files |
| E5 | Slow or stalled I/O | a reader pointed at a FIFO nobody writes (POSIX), a network mount if one exists; never install faking tools |

## F. Process, abort and locking

| # | Perturbation | Make it |
|---|---|---|
| F1 | Abort mid-run | start a reader and `kill -9` it after 200 ms (`taskkill /F /PID` on Windows); then look for leftovers, half-written files, a stale lock |
| F2 | Two at once | two probes, or two `adr-verify` runs, on the same scratch copy at the same moment |
| F3 | Locks already held | create `.git/index.lock` in the scratch copy; open a file with an exclusive lock (Windows: keep it open in another process) |
| F4 | Nothing is writable | a read-only scratch copy (`chmod -R a-w`, `attrib +R /S`); `TMPDIR`/`TEMP` pointing at a missing or read-only directory — ⚠ `chmod` changes nothing on Git for Windows: use `attrib +R /S /D` or `icacls <d> /deny %USERNAME%:W` there, and check it took before reading the result |
| F5 | The environment is missing pieces | `PATH` without git or python; `HOME` unset; `node` on PATH but an old major |
| F6 | Git in an unusual state | detached HEAD, a shallow clone, mid-rebase, mid-merge with conflicts, a worktree, a submodule, a bare `.git` file pointing elsewhere, no commits at all |
| F7 | Unexpected stdin | a hook fed empty stdin, half a JSON object, binary bytes, a 10 MB payload, two JSON objects, JSON with a BOM |
| F8 | A capture in the wrong encoding | pipe a hook payload through Windows PowerShell 5 (its `>` and pipes write UTF-16LE); feed a UTF-16 payload to a hook. ⚠ Run the probe itself from Git Bash, or a capture read in the wrong encoding becomes a false lead |

## G. Order: reading and writing in the wrong sequence

| # | Perturbation | Make it |
|---|---|---|
| G1 | Write before read | edit a task, then ask the reader that caches it; change a file between a `read` and a `write` of a tool that promises read-before-write |
| G2 | Read something that is not what it claims | point a reader at a binary, a directory, `/dev/null`, `/dev/zero` (bounded!), a file deleted a moment ago |
| G3 | Undo halfway | `git stash` mid-run; delete the tasks dir a reader just listed |

## H. Your own

At least one per round that is **not in this file**. Name it, say how you made it, and it
joins this catalogue in the next release if it found anything. The catalogue is the floor
of the imagination, not the ceiling: the defect that matters next is the one nobody listed.
