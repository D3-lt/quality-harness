@echo off
where /q py && (py -3 "%~dp0adr-judge" %*) || (python "%~dp0adr-judge" %*)
