#!/usr/bin/env python3
"""Generate the DeviceLifeline source app icon.

Writes ``app-icon-source.png`` (1024x1024) to the repository root using only the
Python standard library (``zlib``) — no third-party dependencies. Then run
``pnpm tauri icon app-icon-source.png`` to produce the full platform icon set
into ``src-tauri/icons/``.

App icons are intentionally NOT committed to the repository (they are binary and
regenerated deterministically here), so CI and local builds run this script
before building. The artwork is a simple white ring on the indigo brand color.
"""

import os
import struct
import zlib

SIZE = 1024
BG = b"\x4f\x46\xe5\xff"  # indigo #4F46E5, opaque
FG = b"\xff\xff\xff\xff"  # white, opaque


def _png_bytes() -> bytes:
    r_out = SIZE * 0.34
    r_in = SIZE * 0.20
    center = SIZE / 2.0
    raw = bytearray()
    for y in range(SIZE):
        raw.append(0)  # PNG filter type 0 (None) for this scanline
        for x in range(SIZE):
            dx = x - center + 0.5
            dy = y - center + 0.5
            d2 = dx * dx + dy * dy
            raw += FG if (r_in * r_in) <= d2 <= (r_out * r_out) else BG

    def chunk(tag: bytes, data: bytes) -> bytes:
        crc = zlib.crc32(tag + data) & 0xFFFFFFFF
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", crc)

    ihdr = struct.pack(">IIBBBBB", SIZE, SIZE, 8, 6, 0, 0, 0)  # 8-bit RGBA
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", ihdr)
        + chunk(b"IDAT", zlib.compress(bytes(raw), 9))
        + chunk(b"IEND", b"")
    )


def main() -> None:
    repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    out_path = os.path.join(repo_root, "app-icon-source.png")
    with open(out_path, "wb") as handle:
        handle.write(_png_bytes())
    print(f"wrote {out_path}")


if __name__ == "__main__":
    main()
