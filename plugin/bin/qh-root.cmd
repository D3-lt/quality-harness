@echo off
rem Windows cannot run a `#!` script: an extensionless file has no association,
rem so PowerShell offers to pick an application for it and cmd reports nothing.
rem PATHEXT includes .CMD, so `qh-root` resolves here and names the interpreter.
rem The py launcher is preferred because a Windows Python is `python.exe`, not
rem `python3` — the name the shebang asks for often does not exist there.
rem ONE interpreter, and its exit code. `A && B || C` is not if/else in
rem cmd: `||` fires on B failing, not only on A. So every FAILING gate ran
rem twice - once under py -3, then again under python - and the caller got
rem python's exit code, not the gate's. Measured 2026-08-30 on Windows 11:
rem a failing adr-lint printed its whole FAIL block twice.
rem
rem NO PARENTHESISED BLOCK. An unquoted argument containing `)` closes the
rem block early - `C:\Program Files (x86)\...` is that argument, and this
rem resolver already knows that path. Measured: the gate never ran and cmd
rem exited 255. `goto` plus a bare `exit /b`, which preserves the preceding
rem command status, selects one interpreter and propagates it untouched.
where /q py && goto :usepy
python "%~dp0qh-root" %*
exit /b
:usepy
py -3 "%~dp0qh-root" %*
