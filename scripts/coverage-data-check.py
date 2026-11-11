#!/usr/bin/env python3
"""Read every coverage.py data file before a combine (BACKLOG §461).

Usage: coverage-data-check.py <data-file>...

`coverage combine` crashes on some unreadable files and skips others with a warning and exit 0, and the wording varies by cause,
so each file is read by coverage.py itself, read-only: a writable read INITIALIZES a SQLite file that has no coverage schema,
turning foreign data into an empty coverage file that passes. Two unreadable shapes recorded nothing at all: a Python process
killed while creating its data file leaves coverage.py's own tables and not one row in any (run 41872532283 had one), or, killed
before coverage.py wrote even its schema, a SQLite file with no table at all or an empty file (run 42775416426, BACKLOG §464:
"no such table: coverage_schema"). Each is removed and said, since it can hold no measurement; a table coverage.py does not make,
one row anywhere, or any other unreadable file fails, named. These rules were reviewed and verified under ADR-139 T2 (since
withdrawn) before they moved here.

Exit: 0 every file readable or left out; 1 a file that cannot be read and is not empty; 2 usage; 3 UNRUN, coverage.py too old to
read a file read-only (nothing judged).
"""
import inspect
import os
import sqlite3
import sys

# The tables coverage.py's SQLite data file is made of. Any other table makes a file foreign, whatever it holds.
COVERAGE_TABLES = {"coverage_schema", "meta", "file", "context", "line_bits", "arc", "tracer"}


def recorded_nothing(path):
    try:
        con = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
        try:
            tables = [row[0] for row in con.execute("select name from sqlite_master where type = 'table'")]
            # Killed before coverage.py made its schema: an empty file, or a database whose schema is empty. A view, an index
            # or a trigger is a schema someone made, so it is not empty (the Codex review of ca71fd49..05585b3e).
            if con.execute("select count(*) from sqlite_master").fetchone()[0] == 0:
                return True
            if "coverage_schema" not in tables or "file" not in tables or not set(tables) <= COVERAGE_TABLES:
                return False
            return all(con.execute(f'select count(*) from "{table}"').fetchone()[0] == 0 for table in tables)
        finally:
            con.close()
    except Exception:
        return False


def main(paths):
    if not paths:
        print("usage: coverage-data-check.py <data-file>...", file=sys.stderr)
        return 2
    from coverage import CoverageData
    # `read_only` arrived in coverage.py 7.17.1 (measured 2026-11-11 over 7.13.4 to 7.17.2). An older one raises its own TypeError
    # on every file, which used to be said as unreadable data (a Windows peer, coverage.py 7.13.4); that is a tool we could not
    # run, not a finding about the data.
    if "read_only" not in inspect.signature(CoverageData.__init__).parameters:
        import coverage

        print(f"UNRUN — coverage.py {coverage.__version__} cannot read a data file read-only; it needs 7.17.1 or later. Nothing was judged.")
        return 3

    bad = []
    for path in paths:
        try:
            CoverageData(basename=path, read_only=True).read()
        except Exception as error:
            if recorded_nothing(path):
                print(f"advice: {os.path.basename(path)} holds no row in any table (a process killed while creating it); it recorded nothing and is left out")
                os.remove(path)
            else:
                bad.append(f"{os.path.basename(path)}: {error}")
    for line in bad:
        print(f"FAIL — unreadable coverage data: {line}")
    return 1 if bad else 0


if __name__ == "__main__":
    # A Windows console's code page turns the em dash into mojibake (a Windows peer and run 42985449785); say it in UTF-8.
    for stream in (sys.stdout, sys.stderr):
        stream.reconfigure(encoding="utf-8", errors="replace")
    sys.exit(main(sys.argv[1:]))
