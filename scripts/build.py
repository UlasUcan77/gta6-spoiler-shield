"""Package the extension into dist/gta6-spoiler-shield-v<version>.zip for the Chrome Web Store.

Usage: python scripts/build.py
"""
import json
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
INCLUDE = ["manifest.json", "src", "popup", "_locales", "icons"]
SKIP = {"icon512.png"}  # source art, not needed inside the package


def main():
    version = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))["version"]
    dist = ROOT / "dist"
    dist.mkdir(exist_ok=True)
    out = dist / f"gta6-spoiler-shield-v{version}.zip"

    files = []
    for entry in INCLUDE:
        p = ROOT / entry
        files.extend(sorted(x for x in p.rglob("*") if x.is_file()) if p.is_dir() else [p])

    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        for f in files:
            if f.name in SKIP:
                continue
            z.write(f, f.relative_to(ROOT).as_posix())

    print(f"built {out.relative_to(ROOT)} ({out.stat().st_size // 1024} KB, {len(files)} files)")


if __name__ == "__main__":
    main()
