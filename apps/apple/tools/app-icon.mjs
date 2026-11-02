/**
 * The apps' icon, `BrainDog.icon`: the Icon Composer document both apps are built with, drawn from `MARK` in the house
 * red on the house board, as `apple-touch-icon.png` is.
 *
 *   node apps/apple/tools/app-icon.mjs           write it
 *   node apps/apple/tools/app-icon.mjs --check   fail if it is not what the mark and the palette make now
 *
 * FLAT, AS THE PLAN SAYS AND ROOMY SHOWED WORKS: one layer, glass off, specular off, no shadow, no translucency. iOS 26
 * puts its own edge on every icon; this asks for nothing more. The dark look keeps the mark red on the dark board, and
 * the tinted look lets the system draw the mark in its tint over its own ground ("automatic").
 *
 * A DOCUMENT AND NOT A PNG SET, so Icon Composer opens it to tune by eye and Xcode makes every size from it. The layer
 * is an SVG of the mark's own paths, so the icon cannot drift from the mark the web draws.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { argv, exit } from 'node:process';

import { HOUSE } from '../../../packages/theme/src/index.ts';
import { MARK } from '../../../packages/skin/mark.ts';

const apple = join(import.meta.dirname, '..');
const doc = join(apple, 'BrainDog.icon');

/** How much of the icon's width the mark takes, as the touch icon's `FILL`, so no corner mask cuts it. */
const FILL = 0.62;
const SIDE = 1024;

const channel = (hex, at) => (parseInt(hex.slice(at, at + 2), 16) / 255).toFixed(5);
const srgb = (hex) => `extended-srgb:${channel(hex, 1)},${channel(hex, 3)},${channel(hex, 5)},1.00000`;

function markSvg() {
  const [, , w, h] = MARK.viewBox.split(' ').map(Number);
  const scale = (SIDE * FILL) / w;
  const x = ((SIDE - w * scale) / 2).toFixed(2);
  /* A HAIR ABOVE THE MIDDLE, as the eye reads a mark centred: its weight is in the brain, and the dog's chin hangs. */
  const y = ((SIDE - h * scale) / 2 - SIDE * 0.01).toFixed(2);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${SIDE}" height="${SIDE}" viewBox="0 0 ${SIDE} ${SIDE}">\n` +
    `  <g transform="translate(${x} ${y}) scale(${scale.toFixed(5)})" fill="${HOUSE.frame.light['red-fill']}">\n` +
    MARK.paths.map((d) => `    <path d="${d}"/>\n`).join('') +
    `  </g>\n</svg>\n`
  );
}

function iconJson() {
  const light = HOUSE.frame.light;
  const dark = HOUSE.frame.dark;
  const doc = {
    fill: { solid: srgb(light.board) },
    'fill-specializations': [
      { value: { solid: srgb(light.board) } },
      { appearance: 'dark', value: { solid: srgb(dark.board) } },
    ],
    groups: [
      {
        layers: [
          {
            'fill-specializations': [
              { value: { solid: srgb(light['red-fill']) } },
              { appearance: 'dark', value: { solid: srgb(dark['red-fill']) } },
              { appearance: 'tinted', value: 'automatic' },
            ],
            glass: false,
            'image-name': 'mark.svg',
            name: 'mark',
            position: { scale: 1, 'translation-in-points': [0, 0] },
          },
        ],
        shadow: { kind: 'none', opacity: 0 },
        specular: false,
        translucency: { enabled: false, value: 0 },
      },
    ],
    'supported-platforms': { squares: ['iOS', 'macOS'] },
  };
  return `${JSON.stringify(doc, null, 2)}\n`;
}

const wanted = new Map([
  [join(doc, 'icon.json'), iconJson()],
  [join(doc, 'Assets', 'mark.svg'), markSvg()],
]);

const read = (p) => readFile(p, 'utf8').catch(() => null);
if (argv.includes('--check')) {
  const stale = [];
  for (const [p, t] of wanted) if ((await read(p)) !== t) stale.push(p);
  if (stale.length) {
    console.error(`The app icon is not what the mark and the palette make now; run node apps/apple/tools/app-icon.mjs:\n${stale.join('\n')}`);
    exit(1);
  }
  console.log('BrainDog.icon matches the mark and the palette.');
} else {
  for (const [p, t] of wanted) {
    await mkdir(dirname(p), { recursive: true });
    await writeFile(p, t);
  }
  console.log('wrote apps/apple/BrainDog.icon');
}
