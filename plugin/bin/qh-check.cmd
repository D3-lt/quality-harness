@echo off
rem Windows cannot run a `#!` script: an extensionless file has no association,
rem so PowerShell offers to pick an application for it and cmd reports nothing.
rem PATHEXT includes .CMD, so `qh-check` resolves here and names the interpreter.
rem The py launcher is preferred because a Windows Python is `python.exe`, not
rem `python3`. ONE interpreter and its exit code, with no parenthesised block:
rem see qh-root.cmd for the two failures that rule out `A && B || C` and `( )`.
where /q py && goto :usepy
python "%~dp0qh-check" %*
exit /b
:usepy
py -3 "%~dp0qh-check" %*
