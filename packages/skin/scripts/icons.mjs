/**
 * `favicon.ico`, the tab's 16 and 32 pixels drawn from `MARK_SMALL`, and the pen `splash.mjs` draws with.
 *
 * IT WRITES NO `icon-*.png` ANY MORE. The app's icon is the red with the mark in white, drawn larger, which the owner
 * chose (9252bff31) and which was drawn once: `icon-16`, `-32`, `-192`, `-512`, `-maskable-512` and `apple-touch-icon` in
 * `apps/web/static`, the last and `icon-512` in `apps/site/static`, are kept files. This wrote a pale tile over four of them
 * each time it ran. To change them, draw them again and keep what is chosen; `BrainDog.icon` is `apps/apple/tools/app-icon.mjs`.
 *
 * AN IMAGE TOOL IS NOT A DEPENDENCY THIS REPOSITORY HAS, and the mark is two filled paths, so this draws them itself.
 * The path data is read into outlines, each curve is cut into short straight edges, and each pixel is covered by
 * where those edges cross rows sampled inside it, under the nonzero rule, which is SVG's default fill rule. Across a
 * row the coverage is read exactly from the crossings; down it, from the sampled rows. The PNG is written with
 * `node:zlib`, which is all the format needs beyond its checksum.
 *
 * THE FAVICON'S COLOUR COMES FROM `@braindog/theme`, as `theme.mjs`'s does, so a palette change reaches it when this is
 * run again.
 *
 * RUN BY HAND, once after the mark or the palette changes: `node packages/skin/scripts/icons.mjs`. It is part of no
 * build, because a build never writes into `static/`.
 */

import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

import { HOUSE } from '@braindog/theme';

import { MARK, MARK_SMALL } from '../mark.ts';

const root = join(import.meta.dirname, '..', '..', '..');

/** How much of the icon's width the mark takes. The rest is ground, so the mark is not cut by a launcher's mask. */
const FILL = 0.72;

/** Rows sampled inside each pixel. */
const SAMPLES = 16;

/** Straight edges each curve is cut into. */
const STEPS = 32;

/** A path's tokens: a command letter, or a number as SVG writes one (`-.92`, and `2.81.63` as two). */
const TOKEN = /[MmCcSsLlHhVvZz]|-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/gu;

/**
 * A path's `d`, as closed outlines of points in the artwork's own units.
 *
 * ONLY THE COMMANDS A FILLED OUTLINE NEEDS: move, line, the two level lines, the two cubic curves and close. The mark
 * uses no other, and a path that did is refused by name rather than drawn wrong.
 */
function outlines(d) {
  const tokens = d.match(TOKEN) ?? [];
  const shapes = [];
  let points = [];
  let i = 0;
  let cmd = '';
  let last = '';
  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;
  let controlX = 0;
  let controlY = 0;
  const num = () => Number(tokens[i++]);
  const close = () => {
    if (points.length > 2) shapes.push(points);
    points = [];
  };
  /* A LINE OR CURVE AFTER A CLOSE STARTS WHERE THE CLOSE LEFT THE PEN, which is the outline's first point. */
  const pen = () => {
    if (points.length === 0) points.push([x, y]);
  };
  const cubic = (x1, y1, x2, y2, x3, y3) => {
    for (let s = 1; s <= STEPS; s++) {
      const t = s / STEPS;
      const u = 1 - t;
      const a = u * u * u;
      const b = 3 * u * u * t;
      const c = 3 * u * t * t;
      const e = t * t * t;
      points.push([a * x + b * x1 + c * x2 + e * x3, a * y + b * y1 + c * y2 + e * y3]);
    }
    controlX = x2;
    controlY = y2;
    x = x3;
    y = y3;
  };
  while (i < tokens.length) {
    if (/^[A-Za-z]$/u.test(tokens[i])) cmd = tokens[i++];
    const rel = cmd === cmd.toLowerCase();
    const ox = rel ? x : 0;
    const oy = rel ? y : 0;
    switch (cmd.toUpperCase()) {
      case 'M':
        close();
        x = ox + num();
        y = oy + num();
        startX = x;
        startY = y;
        points.push([x, y]);
        /* A MOVE'S FURTHER PAIRS ARE LINES, in the move's own case. */
        cmd = rel ? 'l' : 'L';
        break;
      case 'L':
        pen();
        x = ox + num();
        y = oy + num();
        points.push([x, y]);
        break;
      case 'H':
        pen();
        x = ox + num();
        points.push([x, y]);
        break;
      case 'V':
        pen();
        y = oy + num();
        points.push([x, y]);
        break;
      case 'C': {
        pen();
        const x1 = ox + num();
        const y1 = oy + num();
        const x2 = ox + num();
        const y2 = oy + num();
        const x3 = ox + num();
        const y3 = oy + num();
        cubic(x1, y1, x2, y2, x3, y3);
        break;
      }
      case 'S': {
        pen();
        /* THE FIRST CONTROL POINT IS THE LAST CURVE'S SECOND, MIRRORED, or the pen itself after anything else. */
        const smooth = /^[CcSs]$/u.test(last);
        const x1 = smooth ? 2 * x - controlX : x;
        const y1 = smooth ? 2 * y - controlY : y;
        const x2 = ox + num();
        const y2 = oy + num();
        const x3 = ox + num();
        const y3 = oy + num();
        cubic(x1, y1, x2, y2, x3, y3);
        break;
      }
      case 'Z':
        x = startX;
        y = startY;
        close();
        break;
      default:
        throw new Error(`The mark's path uses the command ${cmd}, which this drawing does not read.`);
    }
    last = cmd;
  }
  close();
  return shapes;
}

/** How much of each pixel the mark covers, from 0 to 1, row by row, on a square of `size`, the mark `fill` of its width. */
function coverage(shapes, size, fill = FILL) {
  const [, , w, h] = MARK.viewBox.split(' ').map(Number);
  const scale = (size * fill) / w;
  const dx = (size - w * scale) / 2;
  const dy = (size - h * scale) / 2;
  const edges = [];
  for (const shape of shapes) {
    for (let k = 0; k < shape.length; k++) {
      const [ax, ay] = shape[k];
      const [bx, by] = shape[(k + 1) % shape.length];
      if (ay === by) continue;
      edges.push({ x0: ax * scale + dx, y0: ay * scale + dy, x1: bx * scale + dx, y1: by * scale + dy });
    }
  }
  const alpha = new Float64Array(size * size);
  for (let row = 0; row < size; row++) {
    for (let s = 0; s < SAMPLES; s++) {
      const y = row + (s + 0.5) / SAMPLES;
      const crossings = [];
      for (const e of edges) {
        const down = e.y0 < e.y1;
        const top = down ? e.y0 : e.y1;
        const bottom = down ? e.y1 : e.y0;
        if (y < top || y >= bottom) continue;
        crossings.push({ x: e.x0 + ((y - e.y0) / (e.y1 - e.y0)) * (e.x1 - e.x0), turn: down ? 1 : -1 });
      }
      crossings.sort((a, b) => a.x - b.x);
      let winding = 0;
      for (let c = 0; c < crossings.length - 1; c++) {
        winding += crossings[c].turn;
        if (winding !== 0) span(alpha, row * size, size, crossings[c].x, crossings[c + 1].x);
      }
    }
  }
  return alpha;
}

/** One sampled row's inside, from `from` to `to`, added to the pixels it passes over by how much of each it covers. */
function span(alpha, rowAt, size, from, to) {
  const a = Math.max(0, from);
  const b = Math.min(size, to);
  for (let px = Math.floor(a); px < b; px++) {
    const covered = Math.min(px + 1, b) - Math.max(px, a);
    if (covered > 0) alpha[rowAt + px] += covered / SAMPLES;
  }
}

/** A palette colour as three bytes. The theme writes six hex digits; anything else is refused, not guessed at. */
export function bytes(colour) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/iu.exec(colour.trim());
  if (!m) throw new Error(`The palette gave ${colour}, and an icon is drawn in exact bytes from six hex digits.`);
  return [m[1], m[2], m[3]].map((part) => parseInt(part, 16));
}

/** The CRC-32 every PNG chunk ends with, over its type and its data. */
const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc(data) {
  let c = 0xffffffff;
  for (const byte of data) c = CRC[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'latin1');
  const sum = Buffer.alloc(4);
  sum.writeUInt32BE(crc(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, sum]);
}

/**
 * EACH PATH IS COVERED ON ITS OWN AND LAID OVER THE ONE BEFORE, as SVG paints two paths in one group. Wound together,
 * a path drawn the other way round inside another would cancel it and leave a hole the favicon does not have.
 */
export function layered(size, fill = FILL) {
  const out = new Float64Array(size * size);
  for (const d of MARK.paths) {
    const cover = coverage(outlines(d), size, fill);
    for (let p = 0; p < out.length; p++) out[p] = out[p] + Math.min(1, cover[p]) * (1 - out[p]);
  }
  return out;
}

/**
 * AN 8-BIT RGBA PNG OF THE MARK ON NOTHING, for a browser tab: a tab draws its own ground, light or dark, and a square
 * of the house ground on a dark tab bar read as a hole (the scope of 24 October).
 */
function pngClear(size, alpha, ink) {
  const stride = size * 4 + 1;
  const raw = Buffer.alloc(size * stride);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const at = y * stride + 1 + x * 4;
      raw[at] = ink[0];
      raw[at + 1] = ink[1];
      raw[at + 2] = ink[2];
      raw[at + 3] = Math.round(Math.min(1, alpha[y * size + x]) * 255);
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * `favicon.ico`, THE ONE ADDRESS EVERY BROWSER AND CRAWLER ASKS WHATEVER THE PAGE SAYS, and it was a 404 on brain.dog.
 * The format is a directory of images, and each one may be a PNG whole, which every browser that reads an icon reads.
 */
function ico(images) {
  const head = Buffer.alloc(6 + 16 * images.length);
  head.writeUInt16LE(0, 0);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(images.length, 4);
  let offset = head.length;
  images.forEach(({ size, file }, i) => {
    const at = 6 + 16 * i;
    head[at] = size >= 256 ? 0 : size;
    head[at + 1] = size >= 256 ? 0 : size;
    head.writeUInt16LE(1, at + 4);
    head.writeUInt16LE(32, at + 6);
    head.writeUInt32LE(file.length, at + 8);
    head.writeUInt32LE(offset, at + 12);
    offset += file.length;
  });
  return Buffer.concat([head, ...images.map((m) => m.file)]);
}

/** The tab's sizes, each drawn from `MARK_SMALL`: its own pixels at 16, each as four at 32. */
const TAB = [16, 32];

/**
 * THE SMALL MARK'S PIXELS AT `size`, a whole multiple of its grid, so every pixel is wholly the mark or wholly not: at
 * 16 pixels the big mark's curves left nothing whole, and the dog and the brain's edge went with them.
 */
function pixels(size) {
  const k = size / MARK_SMALL.size;
  if (!Number.isInteger(k)) throw new Error(`The small mark is drawn at whole multiples of ${MARK_SMALL.size} pixels, and ${size} is not one.`);
  const out = new Float64Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) out[y * size + x] = MARK_SMALL.rows[Math.floor(y / k)][Math.floor(x / k)] === '#' ? 1 : 0;
  return out;
}

/* WRITTEN ONLY WHEN RUN, so `splash.mjs` can draw with the same pen without writing these files again. */
if (process.argv[1] === import.meta.filename) {
  /* THE TAB'S OWN, IN THE FAVICON'S RED (`theme.mjs` writes `mark.svg` in the same), into both apps' static folders: the
     site answers brain.dog/favicon.ico and the app its own path. */
  const red = bytes(HOUSE.frame.light['red-fill']);
  const tab = TAB.map((size) => ({ size, file: pngClear(size, pixels(size), red) }));
  const icon = ico(tab);
  for (const app of ['web', 'site']) {
    await writeFile(join(root, 'apps', app, 'static', 'favicon.ico'), icon);
    console.log(`  wrote apps/${app}/static/favicon.ico, ${icon.length} bytes`);
  }
}
