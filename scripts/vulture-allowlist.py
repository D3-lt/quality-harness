# Names vulture reports as unused that are kept on purpose, each with the reason
# (CLAUDE.md §13: a deliberate finding is allowlisted with its reason, never ignored).
# vulture reads this file as code: each bare name below counts as used EVERYWHERE, so
# a name here hides every unused variable of that name in every file. Only names that
# cannot be renamed belong here. An unused parameter or unpacked column is renamed
# with a leading underscore instead, which vulture skips at that one site (a planted
# `process = 1` went unreported while `process` was listed, 2026-09-28).

# plugin/lib/fence.py: ctypes structure fields the Windows API reads, not Python.
LimitFlags
dwSize

# Assigned to stop bytecode being written beside a checkout's gates; read by the interpreter.
dont_write_bytecode
