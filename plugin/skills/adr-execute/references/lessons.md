## Lessons

Append-only, dated. Each earned a real debug cycle.

- **2026-08-20 — an acceptance filter that matches nothing exits 0.** `go test -run
  <no match>`, `phpunit --filter <no match>` and `cargo test <no match>` all print a cheerful
  summary and exit 0, so every TDD task passed its own gate the moment it was authored, with none of
  the work done. `adr-verify` now records such a run as a failure. When you write an acceptance
  fence, ask what it does when the tests do not exist yet — if the answer is "passes", it is not a
  gate.
- **2026-08-20 — a Tests table is a list beside the truth.** Tasks marked `done` across five
  projects named tests that were never written; the acceptance filter had matched some *other*
  existing test sharing its prefix. `adr-lint` now reads the real files.
- **2026-08-20 — amending one section of a document leaves the rest lying.** After a mid-execution
  amendment, the Invariants section still asserted the exact opposite of what shipped, in the same
  file as the note explaining the change. Sweep the whole document — Produces, Invariants, Risks,
  the Tests table — not just the section you were looking at.
- **2026-08-20 — a ruling on a small question can move a pre-registered criterion two documents
  away.** Deciding which eval arms to register silently halved another ADR's irreversible deletion
  trigger. When a decision changes what exists, grep every accepted ADR for what it consumed.

- **2026-08-20 — reading a gate's exit code through a pipe reports the PIPE's status.** `adr-verify
  <file> | tail -20; echo $?` printed 0 while the gate had actually exited 2, and that false reading
  was written into a committed ADR as "the gate silently passes". Run gates bare, or redirect to a
  file and read `$?` — never through `| tail`/`| grep`. Before concluding a gate is broken,
  reproduce its verdict with nothing between it and you.
- **2026-08-20 — prettier rewrote adr-verify's Verification Log and adr-lint then rejected it.** The
  husky format-on-commit pass escaped the dirty-tree marker (`sha*` → `sha\*`), breaking the exact
  grammar that distinguishes a tool-written entry from a hand-typed one. When a gate owns a file,
  add its path to every formatter's ignore list (here `.prettierignore`); otherwise the formatter
  that runs on commit always wins.
- **2026-08-20 — enumerate the shapes the CREATION path can produce before writing tests.** A feature
  passed every gate — an executable spec gate running all 43 bound tests, adr-lint, 1192 passing
  tests, every mechanism mutation-checked — and an independent review then found 11 P1. Every one
  was a record shape the system's own creation contract permits and no test covered: two slots, two
  education legs, an unchanged pay-now add-on, a roomless order, the real expired-then-reactivate
  sequence. Gates verify the tests you wrote pass; mutation proves a test binds to the mechanism it
  names. Neither can invent the test you never wrote. For each shape decide: test it, or refuse it
  with a named error — refusing loudly is a product decision a human can review, mishandling is a
  shortened paid booking discovered on the day.
- **2026-08-20 — re-run the review over your review fixes.** Lap 2 found 5 more P1, three of them
  introduced by lap 1's own repairs: a stamp moved earlier to kill drift stranded a 24 h hold on the
  failure path; a service widened to accept a second state left the button's visibility gate on the
  first; a deliberately superseded payment order was never made terminal, so a late callback could
  apply at a stale amount or double-capture. When a flow supersedes a resource, the old one must be
  terminal or refused at the point of use.
- **2026-08-20 — a `tests > 0` guard does not save a fence that also names already-green suites.**
  The known hole is "a filter matching nothing exits 0", and the usual cure is to assert the run
  scored at least one test. That cure is blind to the opposite shape: a filter naming the new class
  AND the regression suites is satisfied by the regression suites alone, truthfully reporting 13
  passing tests while the new class does not exist. `adr-verify`'s `scored_nothing()` cannot catch
  it either — it asks about the COUNT of tests, never their IDENTITY. Run the new unit alone first,
  then the regression suites, as two chained commands. A candidate gate ("a task's first
  Verification Log entry must be non-zero") was measured against the corpus and rejected: 41 task
  files across five repos already open with exit 0, and it conflates a missing red run with a
  broken fence.
- **2026-08-20 — a template is not compiled until it is rendered, and no gate renders it.** An
  ADR shipped a mail view that could not compile AT ALL; `php -l`, the formatter and 1219 green
  tests all missed it, because `Mail::fake()`/`assertQueued` prove a message was queued, never that
  it can be built, and the send sat inside a side-effect guard that swallowed the throw. Any lazily
  compiled artifact — Blade/Jinja/ERB views, migrations only run on deploy, config only parsed on
  boot — needs a gate that compiles every one of them, not a test of the few with fixtures.
- **2026-08-20 — ask of each fix from the previous review lap: which test would go red if I
  reverted it?** Of a 28-finding review, one fix (a timezone on a date picker) had no test at all in
  either the regression file or the suite it belonged to, so the bug it repaired was free to return.
  A review lap's fixes deserve the same mutation check as the original code.
- **2026-08-22 — nothing in the chain ever read the ADR's own Status.** Every gate reads the TASK
  files, so ADR-088 was authored `Proposed`, executed, verified with exit-0 adr-verify entries,
  committed and shipped to production with its record still saying the decision had not been taken.
  The precondition was stated in prose at the top of this skill and never bound to a check.
  `adr-lint` now refuses a `done` task under Proposed/Draft/Rejected. When a precondition lives in
  prose, ask which executable check reads it — if none does, it is a habit, not a gate.
- **2026-08-20 — inline tasks cannot produce a tool-written Verification Log.** `adr-verify` reads a
  `## Acceptance` section, while the ADR template's inline-task style uses bold `**Acceptance**`. An
  ADR with ≤3 inline tasks therefore has no machine-checkable completion evidence. If completion
  needs to be provable, split even a 2-task ADR into `tasks/` files.

### 2026-08-21 — a structural assertion over a config file must anchor on the KEY, not the words

Two tests over `bitbucket-pipelines.yml` asserted a step does/does not carry a setting, by substring.
Both were wrong in the same way: the steps' own COMMENTS discuss the setting. `# NO \`trigger: manual\`.
Bitbucket rejects…` contains `trigger: manual`, and two steps explain in prose why they pin
`run-as-user: 0` — so a mutant that DELETED the real key still passed, and the test was decoration
after being declared mutation-checked.

Assert `/^\s+key:\s*value\s*$/m`, never `assertStringContains('key: value')`. A `#` comment cannot
match `^\s+key:`, which is what separates the setting from the discussion of the setting.

The reason it stayed invisible for a round: **a mutation harness whose edit silently no-ops reports a
clean pass.** Python's `str.replace` returns the original string when the pattern is absent, so
`s.replace(old,new)` without `assert s.count(old)==1` prints "mutant applied" for a file that never
changed. Assert the edit LANDED, then assert the test went red — two independent ways a mutant proves
nothing, and they stack.

### 2026-08-21 — `done` is not the only status whose Tests table must be true

`adr-lint`'s Tests-table checks iterated `done_task_ids()`, so a task marked `blocked` on something
outside the repo — a root-owned allow-list, a vendor account — was skipped entirely. But its
acceptance fence was GREEN, which means the tests it names ran. A renamed test left a stale row in a
blocked task's table and a full lint pass reported PASS: the "list kept beside the truth" failure,
surviving inside the gate built to catch it.

Fixed mechanically: `evidenced_task_ids()` returns tasks that are `done` OR carry an exit-0
adr-verify entry, and both table checks iterate it. When a gate keys off a human-written status
field, ask which OTHER states have already produced the evidence the check is about.



### 2026-08-21 — the pipeline proved commands exit 0 and never proved one could exit non-zero

Stated once, because it explains a whole class: every gate here verifies a command succeeded. Nothing
verified a command can FAIL. So a test bound to nothing passes exactly like a test bound to the
mechanism, and the only artifact that would have caught it — the task template's `## Mutants` table —
was hand-filled. That is the same fabrication hole the Verification Log was built to close, sitting
one section further down, and `check_tests_can_fail`'s own docstring named it ("Only a compiling
mutant proves the latter, which is why the task template asks for one separately").

Closed mechanically rather than with another paragraph. `adr-verify --mutant <file> --from --to
--why` applies the edit (refusing one that is absent, non-unique, or comment-only), syntax-checks the
result, runs the task's own Acceptance fence, restores the file in a `finally`, and writes
`- DATE · sha · mutant <killed|survived|inconclusive> · exit N · \`file\` · why · acceptance-sha256:<digest>` into a
`## Mutation Log`. `adr-lint` enforces that grammar and requires ≥1 `killed` entry for any task whose
acceptance was recorded on or after the cutover `2026-08-22`.

The cutover is the part worth copying. Requiring evidence retroactively would have turned four
corpora red at once, and a gate that does that is a gate people switch off — so the rule binds only
to work that CAN comply. Verified: zero new alarms across all four corpora, and three gate-mutants
(pull the cutover back; strip the killed entry leaving only `survived`; hand-type an entry) each go
red.


### 2026-08-21 — asserting a CONFIGURED PROPERTY is not asserting a BEHAVIOUR

A task promised "signing in lands on the reservations list". The framework offered
`Panel::homeUrl()`; it was set, a test asserted `getHomeUrl()` returned the right URL, the test
passed, and sign-in still landed on the dashboard. `getHomeUrl()` is read in exactly two places in
that framework version — the sidebar and topbar Blade views — so it sets where the LOGO links. The
redirect came from `LoginResponse::toResponse()` → `redirect()->intended(Filament::getUrl())`.

Two rules, and the second is the general one:

- **A setter whose NAME implies a behaviour is worth one grep for who READS it.**
  `grep -rn "getTheThing" vendor/ | grep -v "function getTheThing"`. If the only hits are view
  templates, you configured a link, not a behaviour.
- **`assertSame($expected, $obj->getX())` proves the setter stored the value and nothing more.**
  Drive the real flow instead — fill the form, call the action, assert the redirect — then mutate
  the mechanism to prove the test binds to it.

Worth recording precisely because the ADR in question existed to fix a capability that "passed
every test it had while rendering nowhere the user looked", and reproduced that defect one task
later, in the same document. Knowing a failure mode does not protect you from it; running the mutant
does. Config-only assertions are invisible to every gate here — such a test genuinely CAN fail, just
not for the reason anyone cares about — so this one is caught by an independent reviewer or not at
all.
