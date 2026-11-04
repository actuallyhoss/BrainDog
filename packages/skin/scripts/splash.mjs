/**
 * The iPhone launch pictures, drawn with `icons.mjs`'s pen.
 *
 * A LAUNCH PICTURE IS THE APP'S FIRST FRAME: the board in its scheme with the mark in the middle, 120 points wide, so
 * opening BrainDog from the Home Screen goes from the picture to the app with nothing jumping. Light on the light board
 * in the house red, dark on the dark board in the dark frame's red. The sizes are `apps/web/src/lib/phone/splash.ts`,
 * which also writes the links, so the two cannot disagree.
 *
 * ANDROID'S MASKABLE ICON IS A KEPT FILE NOW, the red with the mark in white the owner chose (`icons.mjs` says why), and
 * not drawn here. It keeps the mark inside the middle 80% circle every Android launcher's mask leaves whole.
 *
 * RUN BY HAND, as `icons.mjs` is: `node packages/skin/scripts/splash.mjs`. Part of no build.
 */

import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

import { HOUSE } from '@braindog/theme';

import { SCREENS, fileOf } from '../../../apps/web/src/lib/phone/splash.ts';
import { bytes, chunk, layered } from './icons.mjs';

const root = join(import.meta.dirname, '..', '..', '..');
const statics = join(root, 'apps', 'web', 'static');

/** The mark's width on a launch picture, in points. */
const MARK_PT = 120;

/**
 * An 8-bit RGB PNG `w` by `h` of the ground, with a square of the mark's coverage (`side` pixels) laid in the middle.
 * The ground is one colour, so each row outside the mark compresses to almost nothing.
 */
function picture(w, h, side, alpha, ground, ink) {
  const stride = w * 3 + 1;
  const raw = Buffer.alloc(h * stride);
  const ox = Math.round((w - side) / 2);
  const oy = Math.round((h - side) / 2);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const inside = x >= ox && x < ox + side && y >= oy && y < oy + side;
      const a = inside ? Math.min(1, alpha[(y - oy) * side + (x - ox)]) : 0;
      const at = y * stride + 1 + x * 3;
      for (let k = 0; k < 3; k++) raw[at + k] = Math.round(ground[k] * (1 - a) + ink[k] * a);
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(w, 0);
  header.writeUInt32BE(h, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const schemes = {
  light: { ground: bytes(HOUSE.frame.light.board), ink: bytes(HOUSE.schemes.light.accent) },
  dark: { ground: bytes(HOUSE.frame.dark.board), ink: bytes(HOUSE.frame.dark['red-fill']) },
};

/* THE MARK IS DRAWN ONCE PER PIXEL RATIO, as a square exactly its width, and laid on every picture of that ratio. */
const marks = new Map();
for (const s of SCREENS) {
  const side = MARK_PT * s.ratio;
  if (!marks.has(side)) marks.set(side, layered(side, 1));
  for (const scheme of /** @type {const} */ (['light', 'dark'])) {
    const { ground, ink } = schemes[scheme];
    const file = picture(s.w * s.ratio, s.h * s.ratio, side, marks.get(side), ground, ink);
    await writeFile(join(statics, fileOf(s, scheme)), file);
    console.log(`  wrote apps/web/static/${fileOf(s, scheme)}, ${file.length} bytes`);
  }
}
