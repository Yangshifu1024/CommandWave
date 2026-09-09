#!/usr/bin/env python3
"""Generate the CommandWave app icon (1024x1024 PNG) without external deps.

Renders a dark rounded-square with a terminal prompt glyph ">_" using
2x supersampling for smooth edges.
"""
import math
import struct
import sys
import zlib

SIZE = 1024
SS = 2  # supersample factor
CANVAS = SIZE * SS


def clamp(v, lo, hi):
    return lo if v < lo else hi if v > hi else v


def sd_rounded_box(px, py, cx, cy, hx, hy, r):
    """Signed distance to a rounded box centered at (cx,cy), half extents
    (hx,hy), corner radius r. Negative inside."""
    qx = abs(px - cx) - hx + r
    qy = abs(py - cy) - hy + r
    return min(max(qx, qy), 0.0) + math.hypot(max(qx, 0.0), max(qy, 0.0)) - r


def sd_segment(px, py, ax, ay, bx, by, half_w):
    """Signed distance to a capsule (thick line segment)."""
    vx = bx - ax
    vy = by - ay
    wx = px - ax
    wy = py - ay
    t = (wx * vx + wy * vy) / (vx * vx + vy * vy)
    t = clamp(t, 0.0, 1.0)
    dx = px - (ax + t * vx)
    dy = py - (ay + t * vy)
    return math.hypot(dx, dy) - half_w


def mix(c1, c2, a):
    return tuple(round(c1[i] * (1 - a) + c2[i] * a) for i in range(3))


def render_row(y):
    row = bytearray()
    fy = y + 0.5
    for x in range(CANVAS):
        fx = x + 0.5
        # Background: rounded square with vertical gradient
        bg_dist = sd_rounded_box(fx, fy, CANVAS / 2, CANVAS / 2, CANVAS / 2 - 90, CANVAS / 2 - 90, 400)
        alpha = clamp(0.5 - bg_dist, 0.0, 1.0)
        t = fy / CANVAS
        base = mix((42, 50, 66), (18, 22, 30), t)

        # Prompt glyph: chevron ">" and underscore
        fg = sd_segment(fx, fy, 430, 450, 810, 1024, 95)
        fg = min(fg, sd_segment(fx, fy, 810, 1024, 430, 1598, 95))
        fg = min(fg, sd_rounded_box(fx, fy, 1265, 1480, 300, 80, 80))
        cov = clamp(0.5 - fg, 0.0, 1.0)
        col = mix(base, (240, 246, 255), cov)
        row += bytes(col) + bytes([round(alpha * 255)])
    return row


def main():
    print(f"Rendering {CANVAS}x{CANVAS} (supersampled)...")
    rows = [render_row(y) for y in range(CANVAS)]

    print(f"Downsampling to {SIZE}x{SIZE}...")
    out_rows = []
    for oy in range(SIZE):
        r0 = rows[oy * SS]
        r1 = rows[oy * SS + 1]
        out = bytearray([0])  # filter byte
        for ox in range(SIZE):
            for c in range(4):
                s = r0[ox * SS * 4 + c] + r0[ox * SS * 4 + 4 + c]
                s += r1[ox * SS * 4 + c] + r1[ox * SS * 4 + 4 + c]
                out.append(s // 4)
        out_rows.append(bytes(out))

    def chunk(tag, data):
        c = struct.pack(">I", len(data)) + tag + data
        return c + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    ihdr = struct.pack(">IIBBBBB", SIZE, SIZE, 8, 6, 0, 0, 0)
    png = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", ihdr)
        + chunk(b"IDAT", zlib.compress(b"".join(out_rows), 9))
        + chunk(b"IEND", b"")
    )
    path = sys.argv[1] if len(sys.argv) > 1 else "app-icon.png"
    with open(path, "wb") as f:
        f.write(png)
    print(f"Wrote {path} ({len(png)} bytes)")


if __name__ == "__main__":
    main()
