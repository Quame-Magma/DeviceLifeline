#!/usr/bin/env python3
"""Prepare the DeviceLifeline source app icon.

The repository root ``icon.png`` is the canonical transparent artwork supplied by the
product owner. This script copies it to ``app-icon-source.png`` so the standard
Tauri command can regenerate platform icons:

    pnpm tauri icon app-icon-source.png

``app-icon-source.png`` and ``src-tauri/icons/`` are generated artifacts and are
not committed.
"""

from pathlib import Path
import shutil


def main() -> None:
    repo_root = Path(__file__).resolve().parent.parent
    source_path = repo_root / "icon.png"
    out_path = repo_root / "app-icon-source.png"

    if not source_path.is_file():
        raise SystemExit(
            "icon.png was not found at the repository root. "
            "Add the approved DeviceLifeline icon, then rerun this script."
        )

    shutil.copyfile(source_path, out_path)
    print(f"copied {source_path} to {out_path}")


if __name__ == "__main__":
    main()
