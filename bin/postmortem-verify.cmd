@echo off
rem Windows cannot run a `#!` script: an extensionless file has no association,
rem so PowerShell offers to pick an application for it and cmd reports nothing.
rem PATHEXT includes .CMD, so `postmortem-verify <args>` resolves here and names the interpreter.
rem The py launcher is preferred because a Windows Python is `python.exe`, not
rem `python3` — the name the shebang asks for often does not exist there.
where /q py && (py -3 "%~dp0postmortem-verify" %*) || (python "%~dp0postmortem-verify" %*)
