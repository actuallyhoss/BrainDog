#!/usr/bin/env python3
"""
Builds the Plus Jakarta Sans the apps ship, from upstream's variable TTF as it came (version 2.071, kept in git history).

    python3 tools/fonts/jakarta.py          (needs fonttools and brotli)

Two changes to upstream, both OFL-permitted (the font declares no Reserved Font Name), both in the file so that the
web app, the site, Safari (which ignores ascent-override) and the iPhone and Mac apps all get the same thing:

  THE LINE. Upstream's ascent 1038 and descent 222 put the capitals 0.036 em low in their line box, and leave no room
  under a g or y at any line height under 1.26, so a button sits low and a clipped row cuts its tails. Ascent 1000 and
  descent 260 hold the same 1.26 em line, so nothing grows, with the capitals on the line's centre and 0.04 em under
  the longest tail.

  THE SPACE. Upstream's word space is 170, about two thirds of a usual one, and at 14px "your work this week" reads as
  one word. 220 is the narrowest that reads as separate words at 14 and does not gap at 56.

The web subset is upstream's Google Fonts Latin set, plus the four arrows and Latin Extended-A so a name like Łukasz
does not change face halfway through. Prints the ?v= they ask for: site/src/app.css, site/src/app.html, web/src/error.html,
web/src/app.html and web/src/lib/ui/style.css all name it.
"""
import hashlib
import io
import subprocess

from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = subprocess.check_output(['git', 'rev-parse', '--show-toplevel'], text=True).strip()
TTF = 'apps/apple/Packages/BrainDogKit/Sources/BrainDogKit/Resources/Fonts/PlusJakartaSans[wght].ttf'
UPSTREAM = 'e754d6fe0'  # the commit that first bundled upstream's file untouched
WEB = ['apps/web/static/fonts/jakarta.woff2', 'apps/site/static/fonts/jakarta.woff2']

ASCENT, DESCENT, SPACE = 1000, 260, 220

LATIN = [*range(0x20, 0x100), *range(0x100, 0x180), 0x131, 0x2BB, 0x2BC, 0x2C6, 0x2DA, 0x2DC, 0x304, 0x308, 0x329,
         *range(0x2000, 0x2070), 0x20AC, 0x2122, 0x2190, 0x2191, 0x2192, 0x2193, 0x2212, 0x2215, 0xFEFF, 0xFFFD]
FEATURES = ['kern', 'mark', 'mkmk', 'ccmp', 'locl', 'liga', 'calt', 'tnum', 'pnum', 'frac', 'numr', 'dnom']


def patched():
    raw = subprocess.check_output(['git', 'show', f'{UPSTREAM}:{TTF}'], cwd=ROOT)
    font = TTFont(io.BytesIO(raw), recalcTimestamp=False)  # the same bytes every run
    font['hhea'].ascent, font['hhea'].descent = ASCENT, -DESCENT
    font['OS/2'].sTypoAscender, font['OS/2'].sTypoDescender = ASCENT, -DESCENT
    for code in (0x20, 0xA0):
        name = font.getBestCmap()[code]
        font['hmtx'][name] = (SPACE, font['hmtx'][name][1])
    return font


font = patched()
font.save(f'{ROOT}/{TTF}')

web = patched()
options = subset.Options()
options.layout_features = FEATURES
options.flavor = 'woff2'
options.name_IDs = ['*']
options.notdef_outline = True
sub = subset.Subsetter(options)
sub.populate(unicodes=LATIN)
sub.subset(web)
web.flavor = 'woff2'
for out in WEB:
    web.save(f'{ROOT}/{out}')
data = open(f'{ROOT}/{WEB[0]}', 'rb').read()
print(f'{len(data)} bytes, ?v={hashlib.sha256(data).hexdigest()[:4]}')
