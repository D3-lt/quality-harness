#!/usr/bin/env python3
"""Read every coverage.py data file before a combine (BACKLOG §461).

Usage: coverage-data-check.py <data-file>...

`coverage combine` crashes on some unreadable files and skips others with a warning and exit 0, and the wording varies by cause,
so each file is read by coverage.py itself, read-only: a writable read INITIALIZES a SQLite file that has no coverage schema,
turning foreign data into an empty coverage file that passes. One unreadable shape recorded nothing at all: a Python process
killed while creating its data file leaves coverage.py's own tables and not one row in any (run 41872532283 had one). It is
removed and said, since it can hold no measurement; a table coverage.py does not make, one row anywhere, or any other unreadable
file fails, named. These rules were reviewed and verified under ADR-139 T2 (since withdrawn) before they moved here.

Exit: 0 every file readable or left out; 1 a file that cannot be read and is not empty; 2 usage.
"""
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

    bad = []
    for path in paths:
        try:
            CoverageData(basename=path, read_only=True).read()
        except Exception as error:
            if recorded_nothing(path):
                print(f"advice: {os.path.basename(path)} holds tables and no row in any (a process killed while creating it); it recorded nothing and is left out")
                os.remove(path)
            else:
                bad.append(f"{os.path.basename(path)}: {error}")
    for line in bad:
        print(f"FAIL — unreadable coverage data: {line}")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
