"""Build or inspect the release ZIP against an exact Git archive and verified native assets."""
import hashlib
import json
from pathlib import Path
import stat
import sys
import tarfile
import zipfile

LIMIT = 64 * 1024 * 1024


SURFACES = {"agents", "bin", "evals", "hooks", "lib", "scripts", "skills", "templates", "workflows"}

def bundle(mode, source, assets, destination):
    expected = {}
    with tarfile.open(source) as archive:
        for member in archive:
            if member.isdir():
                continue
            name = member.name
            if (not member.isfile() or name.startswith(("/", "\\"))
                    or "\\" in name or ":" in name or ".." in name.split("/")
                    or (name not in (".claude-plugin/plugin.json", "README.md")
                        and name.split("/")[0] not in SURFACES)):
                raise ValueError("unsupported plugin source entry: " + name)
            expected[name] = (archive.extractfile(member).read(), member.mode & 0o777)
    metadata = json.loads(expected[".claude-plugin/plugin.json"][0])
    expected[".claude-plugin/bundle.json"] = (
        (json.dumps({"schema": "qh-plugin-bundle-v1", "version": metadata["version"]}, sort_keys=True) + "\n").encode(), 0o644)
    for file in Path(assets).iterdir():
        content = file.read_bytes()
        executable = file.name != "SHA256SUMS.txt"
        expected["native/" + file.name] = (content, 0o755 if executable else 0o644)
        if executable:
            expected["native/" + file.name + ".sha256"] = (
                (hashlib.sha256(content).hexdigest() + "\n").encode(), 0o644)
    if mode == "build":
        with zipfile.ZipFile(destination, "x", compression=zipfile.ZIP_DEFLATED) as archive:
            for name, (content, permissions) in sorted(expected.items()):
                entry = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
                entry.create_system = 3
                entry.compress_type = zipfile.ZIP_DEFLATED
                entry.external_attr = (stat.S_IFREG | permissions) << 16
                archive.writestr(entry, content)
    if Path(destination).stat().st_size > LIMIT:
        raise ValueError("plugin archive exceeds its size bound")
    with zipfile.ZipFile(destination) as archive:
        entries = archive.infolist()
        names = [entry.filename for entry in entries]
        if len(set(names)) != len(names) or set(names) != set(expected):
            raise ValueError("plugin archive contains missing, duplicate or unexpected paths")
        if sum(entry.file_size for entry in entries) > LIMIT:
            raise ValueError("expanded plugin archive exceeds its size bound")
        for entry in entries:
            content, permissions = expected[entry.filename]
            mode_bits = entry.external_attr >> 16
            # Bound inflation by the trusted source size, rather than trusting ZIP metadata.
            with archive.open(entry) as stream:
                actual = stream.read(len(content) + 1)
            if (entry.file_size != len(content) or actual != content
                    or stat.S_IFMT(mode_bits) != stat.S_IFREG
                    or stat.S_IMODE(mode_bits) != permissions):
                raise ValueError("plugin archive bytes or permissions differ: " + entry.filename)
    return {"version": metadata["version"], "files": len(expected)}


if __name__ == "__main__":
    try:
        print(json.dumps(bundle(*sys.argv[1:])))
    except (OSError, ValueError, KeyError, tarfile.TarError, zipfile.BadZipFile) as error:
        sys.exit("plugin-bundle: " + str(error))

