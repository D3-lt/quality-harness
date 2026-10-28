#!/usr/bin/env node
// Retained CLI spelling; the reviewer guard is the Go hook's guard.
import { execNative } from './native-cli.mjs'
import { isMainModule } from './main-module.mjs'

if (isMainModule(import.meta.url)) process.exitCode = execNative(['reviewer-guard'])
