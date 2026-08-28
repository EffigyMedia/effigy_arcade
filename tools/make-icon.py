"""Build the arcade icon from the Effigy Media symbol.

THE SLATS ARE ALL ONE SIZE, AND THAT IS STRUCTURAL RATHER THAN LUCKY. The first
version of this script measured each bar out of effigy.png and rounded its four
edges to the pixel grid independently, so bars that differ by one pixel in the
source - 52 against 53 - landed on different cell counts and the mark came out
visibly uneven. The mark is not six measured rectangles. It is ONE slat
thickness and ONE gap, repeated:

    width  = 6t + 5g          three horizontal slats stacked in a square block,
    height = 3t + 2g          then a gap, then three vertical slats

Measured against the source that holds: t is about 52.7 and g about 16, giving
396 x 190 against the real 394 x 189. So the layout below is built from `t` and
`g` alone and cannot produce an uneven slat.

THE PIXELATION IS ALSO STRUCTURAL, NOT A FILTER. The art is composed one CELL at
a time on a small grid and blown up with NEAREST. A blur-and-posterise pass over
a smooth render leaves half-lit edge pixels and reads as a resized photograph;
this leaves none, and every edge lands on a cell boundary.
"""
import sys
from PIL import Image

BG = (6, 5, 10)                       # --ink, the arcade's black

# Blue into purple into red - the arcade's own palette. The cyan is the
# Originals shelf accent, the magenta the second shelf, and the red is the one
# the driving games warn in.
COLORS = [
    (77, 140, 255), (138, 92, 246), (232, 62, 160),   # the three horizontal slats
    (0, 229, 255),  (124, 92, 255), (255, 51, 85),    # the three vertical slats
]


def slats(t, g):
    """Every rectangle in the mark, in cells, from one thickness and one gap."""
    block = 3 * t + 2 * g                       # the left block is a square
    out = []
    for i in range(3):                          # horizontal, stacked
        y = i * (t + g)
        out.append((0, y, block, y + t))
    for i in range(3):                          # vertical, to the right
        x = block + g + i * (t + g)
        out.append((x, 0, x + t, block))
    return out, 6 * t + 5 * g, block


def dither(x, y):
    """A stable hash in [-1, 1]. No RNG: same input, same icon, every build."""
    h = (x * 374761393 + y * 668265263) & 0xFFFFFFFF
    h = (h ^ (h >> 13)) * 1274126177 & 0xFFFFFFFF
    return ((h >> 16 & 0xFF) / 127.5) - 1.0


def shade(rgb, u, d):
    """`u` is 0 at the slat's top and 1 at its bottom; `d` is the dither."""
    f = (1.22 - 0.42 * u) + d * 0.07            # a sheen, like the mark in metal
    return tuple(max(0, min(255, int(c * f))) for c in rgb)


def build(cells, cell, t, g):
    rects, mw, mh = slats(t, g)
    assert mw <= cells and mh <= cells, 'the mark does not fit the grid'
    img = Image.new('RGB', (cells, cells), BG)
    px = img.load()
    ox, oy = (cells - mw) // 2, (cells - mh) // 2

    for rgb, (x0, y0, x1, y1) in zip(COLORS, rects):
        h = y1 - y0
        for gy in range(y0, y1):
            for gx in range(x0, x1):
                px[ox + gx, oy + gy] = shade(rgb, (gy - y0) / float(h), dither(gx, gy))

    return img.resize((cells * cell, cells * cell), Image.NEAREST)


if __name__ == '__main__':
    out = sys.argv[1] if len(sys.argv) > 1 else '.'
    # 36 x 5 = 180 exactly, 32 x 16 = 512 exactly. Both use the same t and g, so
    # the two icons are the same drawing at two resolutions.
    build(36, 5, 4, 1).save(out + '/icon.png')
    build(32, 16, 4, 1).save(out + '/icon-512.png')
    rects, mw, mh = slats(4, 1)
    print('  slat %d cells, gap %d, mark %dx%d cells - all six slats identical' % (4, 1, mw, mh))
    for f in ('icon.png', 'icon-512.png'):
        print('  %-14s %dx%d' % ((f,) + Image.open(out + '/' + f).size))
