#!/usr/bin/env python3
"""
Outlines the README banner's words from the shipped Plus Jakarta Sans, so the banner loads no font over the network.

    python3 tools/fonts/banner.py          (needs fonttools and uharfbuzz; run tools/fonts/jakarta.py first)

The name at 600 and 30 with the title tracking, the line at 500 and 17, both shaped with the font's own kerning.
"""
import io
import re
import subprocess

import uharfbuzz as hb
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

ROOT = subprocess.check_output(['git', 'rev-parse', '--show-toplevel'], text=True).strip()
TTF = f'{ROOT}/apps/apple/Packages/BrainDogKit/Sources/BrainDogKit/Resources/Fonts/PlusJakartaSans[wght].ttf'
NAME, LINE = 'BrainDog', 'Your agents keep track. You make the calls.'


def outline(text, weight, size, track):
    font = instantiateVariableFont(TTFont(TTF), {'wght': weight})
    out = io.BytesIO()
    font.save(out)
    shaper = hb.Font(hb.Face(out.getvalue()))
    buf = hb.Buffer()
    buf.add_str(text)
    buf.guess_segment_properties()
    hb.shape(shaper, buf, {'kern': True, 'liga': True, 'tnum': True})
    glyphs, order = font.getGlyphSet(), font.getGlyphOrder()
    scale = size / font['head'].unitsPerEm
    pen, x = SVGPathPen(glyphs, ntos=lambda v: f'{round(v, 2):g}'), 0.0
    for info, pos in zip(buf.glyph_infos, buf.glyph_positions):
        moved = TransformPen(pen, (scale, 0, 0, -scale, x + pos.x_offset * scale, 0))
        glyphs[order[info.codepoint]].draw(moved)
        x += pos.x_advance * scale + track * size
    return pen.getCommands(), x


name, name_w = outline(NAME, 600, 30, -0.021)
line, line_w = outline(LINE, 500, 17, 0)
print(f'name {name_w:.1f} wide, line {line_w:.1f} wide')

for scheme in ('dark', 'light'):
    path = f'{ROOT}/.github/media/banner-{scheme}.svg'
    svg = open(path).read()
    fills = re.findall(r'<path fill="(#[0-9A-F]+)" transform="translate\([^"]*"', svg)
    keep = svg[:svg.index('  <path fill="')]
    keep = re.sub(r'The words are outlined from [^.]*\.', 'The words are outlined from Plus Jakarta Sans (tools/fonts/banner.py).', keep)
    tail = f'  <path fill="{fills[0]}" transform="translate(110 53)" d="{name}"/>\n  <path fill="{fills[1]}" transform="translate(111 82)" d="{line}"/>\n</svg>\n'
    open(path, 'w').write(keep + tail)
