# Names vulture reports as unused that are kept on purpose, each with the reason
# (CLAUDE.md §13: a deliberate finding is allowlisted with its reason, never ignored).
# vulture reads this file as code: each bare name below counts as used.

# signal.signal() calls a handler with (signum, frame); plugin/bin/adr-verify's
# _restore_and_exit has no use for the frame, and the signature is the signal module's.
frame

# plugin/lib/fence.py: a test double for kernel32.AssignProcessToJobObject(job, process);
# the signature is Windows', not ours.
process

# plugin/bin/spec-verify unpacks a Facts row as (id, assertion, test, tag); the unused
# column is named so the row reads as the table it parses.
assertion

# plugin/lib/fence.py: ctypes structure fields the Windows API reads, not Python.
LimitFlags
dwSize

# Assigned to stop bytecode being written beside a checkout's gates; read by the interpreter.
dont_write_bytecode
