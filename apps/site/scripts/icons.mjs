/**
 * The site's glyphs, written from the app's.
 *
 *   node apps/site/scripts/icons.mjs           # write the app's shapes into src/lib/icons.ts
 *   node apps/site/scripts/icons.mjs --check   # change nothing; exit 1 and say why if the file would change
 *
 * WHY. A visitor meets a glyph on the site and meets it again inside the product, so the two have to be one drawing.
 * They were a hand copy, and nothing compared them: the app's `copy` was redrawn and the site kept the old one. This
 * script is the copy, so the comparison is a run of it.
 *
 * WHAT IT WRITES AND WHAT IT LEAVES. `src/lib/icons.ts` holds `SET` in two parts. The first sits between the two
 * marks below and is this script's: one line a glyph, the app's markup for it, in `FROM`'s order. The second is the
 * shapes of the same icon set that the app does not draw, and stays by hand, as do the Lucide three and the table of
 * older names at the foot of that file. A hand shape the app comes to draw is a finding, so the hand part only shrinks.
 *
 * THE APP'S FILE IS READ AS TEXT, as `braindog-render`'s `glyphs.test.ts` reads it: `apps/web/src/lib/ui/icons.ts`
 * keeps one entry a line for exactly that reader, and the site declares no dependency on the app to import it by.
 *
 * THE DOTS. The app writes the heavier stroke of `more` and `drag` into their markup. The site's `Icon.svelte` strokes
 * from `DOTTED` instead, so the attribute is dropped here and `DOTTED` is held to the names that carried it.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const APP = new URL('../../web/src/lib/ui/icons.ts', import.meta.url);
const SITE = new URL('../src/lib/icons.ts', import.meta.url);

export const BEGIN = '  /* icons:app. Written by `scripts/icons.mjs` from the app\'s glyphs. Change the app, then run the script. */';
export const END = '  /* icons:end */';

/**
 * The site's name for a glyph, and the app's name for the same drawing. BY HAND: which of the app's glyphs the site
 * draws, and what it calls them, is the site's to say. The site keeps the icon set's names; the app named some for
 * what they mean in a record (`vault` for the shield, `obligation` for the receipt).
 */
export const FROM = {
  today: 'today',
  work: 'work',
  projects: 'projects',
  money: 'money',
  activity: 'activity',
  decide: 'decide',
  settings: 'settings',
  search: 'search',
  slash: 'slash',
  plus: 'plus',
  check: 'check',
  x: 'close',
  'arrow-right': 'arrow',
  'arrow-left': 'back',
  'arrow-up-right': 'external',
  'chevron-right': 'chevron',
  'chevron-down': 'chevronDown',
  more: 'more',
  filter: 'filter',
  keyboard: 'keyboard',
  grip: 'drag',
  help: 'ask',
  trash: 'trash',
  download: 'download',
  refresh: 'refresh',
  eye: 'eye',
  play: 'play',
  moon: 'moon',
  agent: 'session',
  people: 'people',
  calendar: 'calendar',
  clock: 'clock',
  alert: 'alert',
  receipt: 'obligation',
  home: 'home',
  tag: 'tag',
  file: 'doc',
  inbox: 'inbox',
  zap: 'skill',
  globe: 'globe',
  cloud: 'service',
  plug: 'plug',
  key: 'key',
  lock: 'lock',
  shield: 'vault',
  copy: 'copy',
  link: 'link',
  box: 'thing',
  code: 'code',
  bell: 'bell',
  history: 'history',
  mail: 'mail',
};

const ENTRY = /^  (?:'([a-z-]+)'|([A-Za-z]+)): '(<[^']*>)',$/;
const HEAVY = / stroke-width="[^"]*"/g;

/** The glyphs between `open` and the first `close` after it, by name, one a line. */
function entries(source, open, close) {
  const from = source.indexOf(open);
  const to = from < 0 ? -1 : source.indexOf(close, from);
  const out = new Map();
  if (to < 0) return out;
  for (const line of source.slice(from, to).split('\n')) {
    const m = ENTRY.exec(line);
    if (m) out.set(m[1] ?? m[2], m[3]);
  }
  return out;
}

const key = (name) => (/^[a-z]+$/i.test(name) ? name : `'${name}'`);

/**
 * What `src/lib/icons.ts` should read, given the app's file and the site's as they stand, and everything that is wrong
 * with either. Pure, so the test can hand it an app with a glyph renamed and see it say so.
 *
 * @param {string} app the text of the app's `icons.ts`
 * @param {string} site the text of the site's `icons.ts`
 * @returns {{ text: string, findings: string[] }} `text` is `site` itself when a finding stops the writing
 */
export function plan(app, site) {
  const findings = [];
  const drawn = entries(app, 'export const PATHS = {', '} as const');
  if (drawn.size === 0) return { text: site, findings: ['no glyph could be read from the app: its `PATHS` is not one entry a line any more'] };

  const begin = site.indexOf(BEGIN);
  const end = site.indexOf(END);
  if (begin < 0 || end < begin) return { text: site, findings: ['the two marks are gone from `SET`, so there is nowhere to write'] };

  /* 1. Every glyph the site takes is one the app still draws, under the name `FROM` gives. */
  const lines = [];
  const heavy = [];
  for (const [name, theirs] of Object.entries(FROM)) {
    const markup = drawn.get(theirs);
    if (markup === undefined) {
      findings.push(`the app no longer draws \`${theirs}\`, which the site draws as \`${name}\`: it was renamed or removed`);
      continue;
    }
    if (markup.includes(' stroke-width=')) heavy.push(name);
    lines.push(`  ${key(name)}: '${markup.replace(HEAVY, '')}',`);
  }

  /* 2. A shape kept by hand is one the app does not draw. The day the app draws it, it moves into `FROM`. */
  const taken = new Set(Object.values(FROM));
  const shapes = new Map([...drawn].map(([name, markup]) => [markup.replace(HEAVY, ''), name]));
  for (const [name, markup] of entries(site, END, '} as const;')) {
    if (Object.hasOwn(FROM, name)) findings.push(`\`${name}\` is written twice, by the script and by hand: take the hand line out`);
    else if (drawn.has(name) && !taken.has(name)) findings.push(`the app draws \`${name}\` now: add it to FROM and take the hand line out`);
    else if (shapes.has(markup)) findings.push(`the app draws \`${name}\` now, as \`${shapes.get(markup)}\`: add it to FROM and take the hand line out`);
  }

  /* 3. The dots: the names whose markup carried the heavier stroke are the names `Icon.svelte` strokes heavier. */
  const dotted = /DOTTED[^=]*= new Set<IconName>\(\[([^\]]*)\]\)/.exec(site);
  const said = dotted ? [...dotted[1].matchAll(/'([^']+)'/g)].map((m) => m[1]).sort() : [];
  if (said.join() !== heavy.toSorted().join()) {
    findings.push(`DOTTED says ${said.join(', ') || 'nothing'} and the app strokes ${heavy.join(', ') || 'nothing'} heavier`);
  }

  if (findings.length > 0) return { text: site, findings };
  return { text: `${site.slice(0, begin)}${BEGIN}\n${lines.join('\n')}\n${site.slice(end)}`, findings };
}

/** The glyphs of the written part that differ between two texts of the site's file, by name. */
export function differing(before, after) {
  const was = entries(before, BEGIN, END);
  const is = entries(after, BEGIN, END);
  return [...new Set([...was.keys(), ...is.keys()])].filter((name) => was.get(name) !== is.get(name));
}

/**
 * Run it against the two files on disk. Returns the lines to print and the exit code.
 *
 * @param {{ check: boolean, app?: string }} options `app` stands in for the app's file, for the test
 */
export function run({ check, app = readFileSync(APP, 'utf8') }) {
  const site = readFileSync(SITE, 'utf8');
  const { text, findings } = plan(app, site);
  if (findings.length > 0) return { code: 1, lines: findings };
  if (text === site) return { code: 0, lines: [`icons: ${Object.keys(FROM).length} glyphs, as the app draws them`] };
  const names = differing(site, text);
  if (check) {
    return { code: 1, lines: [`the site draws ${names.join(', ') || 'its glyphs'} differently from the app: run \`node apps/site/scripts/icons.mjs\``] };
  }
  writeFileSync(SITE, text);
  return { code: 0, lines: [`icons: wrote ${names.join(', ') || 'the glyphs again'}`] };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { code, lines } = run({ check: process.argv.includes('--check') });
  for (const line of lines) (code === 0 ? console.log : console.error)(line);
  process.exitCode = code;
}
