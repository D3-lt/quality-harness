# `lifecycle.mjs` seam map: an effect-classified call graph

Generated 2026-10-10 at commit `52cd9a66` by a one-off acorn pass (`node --expose-internals`, the parser `scripts/untimed-spawns.mjs` loads) over `plugin/scripts/lifecycle.mjs`. The script is not kept; the method is below, so the map can be regenerated and compared. Tracked by BACKLOG section 375; the diagnosis it serves is `2026-10-10-lifecycle-shape.md`.

## Headline

| | |
|---|---|
| file | 7591 lines |
| top-level functions (declarations and function-valued consts) | 275, 5384 lines, 112 exported |
| calls that stay inside a cluster | 399 of 474 (84%) |
| clusters found | 17 (7 of them under 4 functions) |
| functions with no effect reachable (pure) | 151 functions, 1532 lines (28% of function lines) |
| functions that can reach a git or process spawn | 45 functions, 2205 lines (41%) |

The structure is already modular in the call graph: most calls never leave their cluster. What is missing is the file boundary, and the separation of judging from gathering facts: about two fifths of the function lines reach a spawn, so their verdicts cannot be exercised without a repository.

## Effect classes (transitive: a function that calls an effectful one has its effects)

| class | functions | lines | meaning |
|---|---|---|---|
| pure | 151 | 1532 | no file, process, clock or event effect reachable |
| reads | 18 | 260 | reads files or the event log only |
| writes | 16 | 389 | writes a file, an event, or output |
| spawns | 45 | 2205 | can reach a child process (git, a gate) |
| other | 45 | 998 | imports from another local module, or reads the environment or clock only |

Direct effects, by function that contains the call itself: fs-read 48, fs-write 17, spawn 12, env-clock 50, io-out 6, event-write 8, event-read 10.

## Clusters (label propagation over the call graph, largest first)

| # | name (most common words) | fns | lines | exported | pure | reach a spawn | writes | reads | other |
|---|---|---|---|---|---|---|---|---|---|
| 0 | record/listed/status/frontmatter | 71 | 1280 | 27 | 49 | 3 | 0 | 8 | 11 |
| 1 | pass/artifact/check/session | 39 | 882 | 18 | 8 | 15 | 4 | 1 | 11 |
| 2 | check/command/for/publish | 44 | 758 | 15 | 23 | 13 | 1 | 3 | 4 |
| 3 | code/corpus/path/text | 24 | 650 | 18 | 15 | 6 | 0 | 1 | 2 |
| 4 | session/hook/generation/note | 22 | 572 | 15 | 8 | 2 | 8 | 2 | 2 |
| 5 | git/literal/shell/index | 24 | 381 | 0 | 22 | 0 | 0 | 0 | 2 |
| 6 | directory/fresh/command/commit | 20 | 358 | 6 | 11 | 1 | 0 | 0 | 8 |
| 7 | session/mention/this/advisory | 8 | 148 | 2 | 2 | 2 | 2 | 1 | 1 |
| 8 | artifact/budget/deleted/exhausted | 4 | 117 | 3 | 1 | 2 | 0 | 0 | 1 |
| 9 | test/collect/command/little | 5 | 99 | 1 | 5 | 0 | 0 | 0 | 0 |
| 10 | status/command/list | 2 | 41 | 0 | 0 | 0 | 0 | 0 | 2 |
| 11 | prose/spec/config/could | 3 | 33 | 2 | 2 | 1 | 0 | 0 | 0 |
| 12 | abbreviates/command/encoded/powershell | 3 | 24 | 0 | 3 | 0 | 0 | 0 | 0 |
| 13 | hook/slow/flush/note | 3 | 18 | 3 | 1 | 0 | 1 | 0 | 1 |
| 14 | corpus/dangling/links | 1 | 11 | 1 | 0 | 0 | 0 | 1 | 0 |
| 15 | config/problem/project | 1 | 11 | 1 | 0 | 0 | 0 | 1 | 0 |
| 16 | class/code | 1 | 1 | 0 | 1 | 0 | 0 | 0 | 0 |

Strongest calls between clusters (from > to, number of distinct caller-callee pairs): 4 > 1 12, 2 > 1 8, 1 > 2 6, 3 > 0 6, 4 > 2 5, 7 > 4 4, 10 > 5 2, 1 > 0 2, 2 > 3 2, 0 > 3 2, 1 > 3 2, 3 > 2 2.

### 0. record/listed/status/frontmatter

`walk`, `outsideRoot`, `writtenOutside`, `posixListed`, `listedPath`, `listedAbsolute`, `listedReadme`, `underFrozenArchive`, `frozenArchiveOf`, `unmarkedArchives`, `linksIn`, `onceByRealPath`, `aliasReason`, `undecidedReason`, `newestTaskChange`, `taskDirectories`, `numberId`, `titleLine`, `recordId`, `referencesIn`, `referencesWithProvenance`, `markdownSection`, `edgeTrim`, `fencedLines`, `fenceStep`, `indentColumns`, `frontmatterBlock`, `frontmatterClose`, `frontmatterValue`, `inlineStatus`, `rawStatus`, `recordStatus`, `statusSection`, `recordStatusKind`, `statusKind`, `catalogCells`, `listedNamesIn`, `catalogDirectoryFor`, `archiveDecisionEffect`, `globToRegExp`, `pathMatchesDeclaration`, `declaredEnforcement`, `declaredGoverns`, `affectedFiles`, `adrNumber`, `corpusReader`, `taskDirectoriesFor`, `taskFilesFor`, `nameArmSpelling`, `inside`, `listedRelative`, `recordPlacement`, `separatorsOf`, `directoriesOf`, `spelledRelatives`, `keptWhereRecordsAre`, `recordDiscriminators`, `recognisedAsRecord`, `corpusEligible`, `readRegularText`, `lineStream`, `screenAdmits`, `stepWalk`, `recordFilesFromListing`, `adrCorpus`, `frontmatterSupersededBy`, `rawIndex`, `supersessionTarget`, `relativeWithinRoot`, `decisionsGoverning`, `decisionContext`

### 1. pass/artifact/check/session

`tempRoots`, `underTempRoot`, `projectCheckCommand`, `latestFastPass`, `unseenWriteSince`, `passedAlready`, `gitRepositoryRoot`, `queueAction`, `locationKey`, `previousSessionHere`, `previousSessionNotice`, `readOnlyRole`, `observeBudgetMs`, `observe`, `checkEventName`, `importCheckRecords`, `ledgerBoundLog`, `sameObservation`, `recordFileWritten`, `ledgerRecordCount`, `observedClean`, `mark`, `gitLines`, `reviewChangedState`, `harnessPathspecs`, `statusPaths`, `sessionCommits`, `alreadyAnswered`, `answeredBlobs`, `artifactRule`, `passBudgetMs`, `passFiles`, `claimPassLock`, `releasePassLock`, `passKey`, `importPassVerdicts`, `startArtifactPass`, `runArtifactPass`, `passTargets`

### 2. check/command/for/publish

`docsOnly`, `evidenceLimited`, `interimResponse`, `unverifiedDisclosure`, `completionClaim`, `declaredCheckCommand`, `publishSetting`, `publishSettingNote`, `constantSuccessCheck`, `packageManagerCommand`, `makeTargetCommand`, `fastCheckCommand`, `checkCommandOrigin`, `gitRepositoryLookup`, `runTheCheckSentence`, `recordClaim`, `evidenceNudge`, `declaredCapability`, `subagentContract`, `observedFacts`, `sessionBaseline`, `lateBaselineAllowed`, `checkEventsFor`, `latestCheckFor`, `latestRecordedCheck`, `latestOf`, `treeChecked`, `checkStanding`, `checkRevision`, `inferredCheckCaveat`, `publishVerdict`, `emittedFor`, `namedByReview`, `namedByPublish`, `unobservableWrites`, `revisionFor`, `unseenPathNote`, `uncheckedWorkReason`, `uncheckedCommitsReason`, `couldNotLookReason`, `logIncomplete`, `tornRecord`, `ledgerEvidence`, `completionRules`

### 3. code/corpus/path/text

`surfaceReadyLines`, `resolvePython`, `spawnGate`, `quotedCorpusText`, `corpusText`, `scrubber`, `gateSaid`, `visiblePath`, `terminalText`, `codeSpan`, `untagged`, `shownPath`, `pathInCode`, `commandInCode`, `checkInCode`, `ownerCaveat`, `missingOwnerCaveat`, `readyTaskLines`, `trackedPaths`, `sessionStateNote`, `shadowInstallNotice`, `staleVersionNotice`, `hasDecisionCorpus`, `sessionOrientation`

### 4. session/hook/generation/note

`hasBackgroundWork`, `emitJson`, `sessionGenerationPath`, `sessionGeneration`, `bumpSessionGeneration`, `sessionNotePath`, `readSessionNote`, `replaceSessionNote`, `saidMarkerDirectory`, `sweepStaleMarkers`, `claimDailySweep`, `sweepStaleSessionLogs`, `firstMentionHere`, `claimCompaction`, `containsCommitOrPush`, `mentionsCommitOrPush`, `readOnlyVerdict`, `recordHookEvent`, `publishHookExports`, `awaitingArming`, `offerPublishHook`, `handleHook`

### 5. git/literal/shell/index

`literalAt`, `literalScanner`, `insideLiteral`, `programName`, `isGit`, `isFlag`, `wrapperWord`, `programIndex`, `gitVerbIndex`, `dryRun`, `gitAliases`, `gitSplit`, `aliasFor`, `shellQuote`, `gitInvocation`, `gitRunsCommands`, `xargsInvocations`, `shellRuns`, `shellString`, `decodedPowerShell`, `literalOutput`, `stdinScripts`, `publishInText`, `publishInCommand`

### 6. directory/fresh/command/commit

`commitOnlyCommand`, `freshRepositoryCommit`, `publishCommandIn`, `valuedLetter`, `plainGitArguments`, `segmentVerdict`, `plainPublishes`, `mentionedNames`, `assignmentCounts`, `runsInThisShell`, `freshDirectoryVariables`, `namesShellSpecial`, `hasDotSegment`, `literalDirectoryVariables`, `directoryOperands`, `maskedMessages`, `usesAreOperands`, `freshDirectoryText`, `leavesHookInPlace`, `publishUnchecked`

### 7. session/mention/this/advisory

`advisoryHeadline`, `sessionMentionPath`, `alreadyMentionedThisSession`, `firstMentionThisSession`, `decisionContextFor`, `deliver`, `readStdin`, `main`

### 8. artifact/budget/deleted/exhausted

`deletedTrackedPaths`, `artifactGateTimeoutMs`, `budgetExhausted`, `runArtifactGates`

### 9. test/collect/command/little

`collectStrings`, `testCommand`, `reportsZeroTestWork`, `saidLittle`, `validationVerdict`

### 10. status/command/list

`listStatus`, `commandStatus`

### 11. prose/spec/config/could

`specCouldNameConfig`, `proseSpecProblem`, `proseSpecs`

### 12. abbreviates/command/encoded/powershell

`abbreviates`, `POWERSHELL_ENCODED`, `startedCommand`

### 13. hook/slow/flush/note

`slowHookThresholdMs`, `slowHookNote`, `flushOutput`

### 14. corpus/dangling/links

`danglingCorpusLinks`

### 15. config/problem/project

`projectConfigProblem`

### 16. class/code

`codeClass`

## Events this file writes or tests for

Only the sites in `lifecycle.mjs` are seen; `qh-check` and the other scripts write events this pass cannot see, so "no producer" below means "not produced in this file".

| event | written by | tested by |
|---|---|---|
| `action.emitted` | `deliver` | `emittedFor`, `importPassVerdicts`, `namedByPublish`, `namedByReview`, `publishUnchecked`, `reviewChangedState`, `startArtifactPass` |
| `artifact.gated` | `importPassVerdicts` | `answeredBlobs`, `importPassVerdicts` |
| `artifact.pass` | `startArtifactPass` | `importPassVerdicts` |
| `check.passed` | (not in this file) | `checkStanding`, `latestOf`, `unobservableWrites` |
| `check.source-unreadable` | `publishVerdict`, `recordHookEvent` | `ledgerBoundLog`, `recordHookEvent` |
| `check.unresolved` | (not in this file) | `checkStanding` |
| `context.compacting` | (not in this file) | `handleHook` |
| `file.written` | `recordFileWritten` | `artifactRule`, `lateBaselineAllowed`, `unobservableWrites` |
| `note.served` | `handleHook` | `handleHook` |
| `pass.ended` | `runArtifactPass` | `importPassVerdicts` |
| `pass.finding` | `passTargets`, `runArtifactPass` | `importPassVerdicts` |
| `pass.gated` | `passTargets` | `importPassVerdicts`, `passKey` |
| `pass.started` | `runArtifactPass` | (none in this file) |
| `publish.hook-ran` | (not in this file) | `awaitingArming`, `publishUnchecked` |
| `publish.offered` | `offerPublishHook` | (none in this file) |
| `publish.unarmed` | `offerPublishHook` | (none in this file) |
| `session.started` | `recordHookEvent` | `publishVerdict`, `sessionBaseline` |
| `skill.invoked` | `handleHook` | (none in this file) |
| `subagent.started` | (not in this file) | `reviewChangedState` |

## What other scripts import from it (the surface a facade must keep)

| script | names imported |
|---|---|
| `adr-context.mjs` | 3: `adrCorpus`, `decisionsGoverning`, `trackedPaths` |
| `adr-state.mjs` | 5: `adrCorpus`, `quotedCorpusText`, `recordStatusKind`, `terminalText`, `trackedPaths` |
| `corpus-probe.mjs` | 6: `adrCorpus`, `resolvePython`, `scrubber`, `spawnGate`, `trackedPaths`, `undecidedReason` |
| `orientation.mjs` | 1: `sessionOrientation` |
| `publish-hook.mjs` | 4: `importCheckRecords`, `observe`, `observeBudgetMs`, `publishVerdict` |
| `qh-check.mjs` | 11: `checkCommandOrigin`, `checkEventName`, `fastCheckCommand`, `firstMentionHere`, `observe`, `observeBudgetMs`, `passedAlready`, `projectConfigProblem`, `proseSpecs`, `stateDir`, `validationVerdict` |
| `reviewer-guard.mjs` | 1: `readOnlyVerdict` |
| `statusline.mjs` | 6: `latestCheckFor`, `logIncomplete`, `projectCheckCommand`, `readEvents`, `sessionBaseline`, `sessionLogFile` |
| `work-next.mjs` | 17: `RECORD_DIRECTORY`, `adrCorpus`, `aliasReason`, `corpusEligible`, `danglingCorpusLinks`, `frozenArchiveOf`, `listedUnderUninterestingDirectory`, `onceByRealPath`, `pathInCode`, `readRegularText`, `recordId`, `recordStatus`, `spawnGate`, `terminalText`, `trackedPaths`, `undecidedReason`, `visiblePath` |

## Method and limits

- Functions: top-level declarations and function-valued `const`s. Class bodies and top-level data tables are not counted, so function lines are less than file lines.
- Edges: any identifier reference to another top-level function (a call, or a function passed as a value). Local shadowing is ignored, which can add an edge that is not real.
- Effects, direct: the calls `readFileSync`, `statSync` and their kin (read); `writeFileSync`, `appendFileSync`, `mkdirSync`, `rmSync` and kin (write); `spawn`, `spawnSync`, `execFileSync` (spawn); `Date`, `process.env`, `process.cwd`, `randomUUID` (environment); stdout and stderr writes; `appendEvent` and `readEvents`. A call into another local module is `other`, so a function is pure only when it touches none of these. Transitive closure by fixpoint.
- Clusters: deterministic label propagation (sorted order, ties to the smaller label) over the undirected graph; no function was a hub at the 22-caller threshold. Names are the most common words in the members' names: a label for a reader, not a verdict.
- Not seen: calls made through `Reflect`, computed property names, or a function reached only from another module; events produced outside this file.

## The pure functions (candidates to move first; `*` is exported)

`walk 9`, `collectStrings 11`, `testCommand 3`, `reportsZeroTestWork 37`, `saidLittle 3`, `validationVerdict 45*`, `budgetExhausted 3*`, `docsOnly 3`, `evidenceLimited 3`, `interimResponse 4`, `unverifiedDisclosure 6`, `completionClaim 6*`, `hasBackgroundWork 4`, `publishSettingNote 5`, `specCouldNameConfig 4`, `proseSpecProblem 7*`, `declaredCapability 8`, `queueAction 3`, `emitJson 3`, `slowHookNote 3*`, `advisoryHeadline 11`, `posixListed 3*`, `surfaceReadyLines 26*`, `listedAbsolute 4`, `listedReadme 7*`, `aliasReason 4*`, `undecidedReason 5*`, `quotedCorpusText 3*`, `corpusText 9`, `scrubber 47*`, `gateSaid 9`, `visiblePath 4*`, `terminalText 3*`, `codeSpan 5*`, `untagged 3`, `shownPath 3`, `pathInCode 3*`, `commandInCode 10*`, `checkInCode 3*`, `ownerCaveat 9`, `missingOwnerCaveat 6`, `numberId 1`, `titleLine 9*`, `recordId 16*`, `referencesIn 3*`, `referencesWithProvenance 16`, `markdownSection 11`, `codeClass 1`, `edgeTrim 1`, `fencedLines 11`, `fenceStep 11`, `indentColumns 9`, `frontmatterBlock 4*`, `frontmatterClose 7`, `frontmatterValue 5`, `inlineStatus 17`, `rawStatus 3`, `recordStatus 4*`, `statusSection 14`, `recordStatusKind 4*`, `statusKind 4`, `catalogCells 11`, `listedNamesIn 2`, `catalogDirectoryFor 15`, `archiveDecisionEffect 59`, `globToRegExp 21`, `pathMatchesDeclaration 7*`, `declaredEnforcement 21*`, `declaredGoverns 28`, `affectedFiles 17`, `adrNumber 4`, `taskDirectoriesFor 27`, `nameArmSpelling 1*`, `inside 4`, `listedRelative 16`, `recordPlacement 7`, `separatorsOf 1`, `spelledRelatives 6`, `keptWhereRecordsAre 9`, `recordDiscriminators 11`, `lineStream 25*`, `stepWalk 8`, `frontmatterSupersededBy 15`, `rawIndex 9`, `supersessionTarget 26`, `sessionGenerationPath 4`, `sessionNotePath 4`, `saidMarkerDirectory 3*`, `literalAt 22`, `literalScanner 4`, `insideLiteral 29`, `programName 1`, `isGit 1`, `isFlag 1`, `wrapperWord 1`, `programIndex 44`, `gitVerbIndex 8`, `dryRun 11`, `gitAliases 9`, `gitSplit 25`, `aliasFor 4`, `shellQuote 1`, `gitInvocation 17`, `gitRunsCommands 25`, `xargsInvocations 26`, `shellRuns 14`, `abbreviates 2`, `POWERSHELL_ENCODED 1`, `shellString 14`, `decodedPowerShell 1`, `startedCommand 21`, `literalOutput 11`, `stdinScripts 14`, `mentionsCommitOrPush 9*`, `readOnlyRole 5*`, `checkEventName 19*`, `sameObservation 3*`, `sessionBaseline 3*`, `checkEventsFor 4`, `latestCheckFor 9*`, `latestRecordedCheck 3`, `latestOf 45`, `treeChecked 3`, `checkStanding 11`, `checkRevision 3`, `publishHookExports 32*`, `awaitingArming 4`, `valuedLetter 4`, `plainGitArguments 17`, `segmentVerdict 22`, `mentionedNames 13`, `assignmentCounts 10`, `runsInThisShell 4`, `namesShellSpecial 1`, `hasDotSegment 1`, `literalDirectoryVariables 24*`, `directoryOperands 20`, `usesAreOperands 4`, `mark 6`, `emittedFor 3`, `namedByReview 4`, `namedByPublish 4`, `revisionFor 5`, `unseenPathNote 5`, `logIncomplete 10*`, `tornRecord 3*`, `ledgerEvidence 21`, `alreadyAnswered 10*`, `answeredBlobs 11*`, `passKey 6`, `readStdin 5`
