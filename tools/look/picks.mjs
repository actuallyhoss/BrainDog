/**
 * The picks page of the frame: every open choice of the look on one page, each option drawn on the frame's
 * specimen at 390 and 1440, dark then light, the recommendation marked, and one press for "yes to every
 * recommendation". It also writes `design/boards/frame/dark.md` and, from the answer, `design/boards/frame/yes.json`.
 *
 *   node tools/look/picks.mjs dark                       write dark.md from the theme's own build
 *   node tools/look/picks.mjs draw [--source lived] [--out <folder>]
 *   node tools/look/picks.mjs page --from <picks drawing folder>
 *   node tools/look/picks.mjs yes "<the words of the yes>" --from <board drawing folder> [--taken <where>] [--seen] [--pick slot=option]...
 *
 * A PICK IS A FOLDER, so a part that brings a choice adds one and changes nothing here: `picks/<pick>/slot.json` says the
 * question, its options and the default, and `picks/<pick>/<option>.css` is the option drawn, put after the product's
 * sheets the way a board's variant is. A pick drawn on the specimen says `shown: "specimen"`; there an option with no
 * sheet is the look as it stands (`live`). A pick about a screen the specimen does not hold is said in words, and its
 * sheet, if it has one, waits for that screen's board.
 *
 * A PICK LEFT BLANK TAKES ITS DEFAULT and is listed "default, not chosen", never as a choice. One taken by default
 * elsewhere (its slot's `taken`) is listed as taken there.
 *
 * `yes` NEVER DRAWS. It reads a drawing of the frame board made by `board.mjs`, takes the yes through `board.mjs`'s own
 * `yesOf` (which refuses a drawing of code that has moved since), and adds the picks. So yes.json is written by a tool
 * from a drawing, as the folder contract says, and the gate (`board-yes`) reads the same hashes.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { argv, exit } from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { BOARDS, readJson } from '../gates/board-yes.mjs';

const here = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(here, '..', '..');

/** The board the picks belong to, and where its picks, its specimen and its dark sheet live. */
export const BOARD = 'frame';
export const PICKS = join(BOARDS, BOARD, 'picks');
export const SPECIMEN = join(BOARDS, BOARD, 'specimen.dog');
export const DARK = join(BOARDS, BOARD, 'dark.md');

/** The page draws each option at the phone and the laptop, dark first: dark is the theme looked at most. */
export const PICK_WIDTHS = [390, 1440];
export const PICK_THEMES = ['dark', 'light'];

/** The units a yes to the frame closes, as the planner counts them. */
export const UNITS = ['EXP-A01', 'EXP-A02'];

/** How a pick is listed: the owner's own choice, the default left in place, or one taken by default elsewhere. */
export const CHOSEN = 'chosen';
export const DEFAULTED = 'default, not chosen';

const NAME = /^[a-z][a-z0-9-]*$/u;

/**
 * Every slot under `picks/`, sorted by folder, each with its options' sheets read. A slot that does not read is refused
 * with its file named: a page that silently dropped a pick would take a yes to fewer choices than it showed.
 */
export function readSlots(root = ROOT) {
  const dir = join(root, PICKS);
  if (!existsSync(dir)) return [];
  const out = [];
  for (const pick of readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort()) {
    const at = `${PICKS}/${pick}`;
    const read = readJson(join(dir, pick, 'slot.json'));
    if (read.value === undefined) throw new Error(`${at}/slot.json ${read.fix}, and a pick says its question, its options and its default.`);
    const s = read.value;
    if (s.pick !== pick) throw new Error(`${at}/slot.json names the pick ${JSON.stringify(s.pick)}, and its folder is ${pick}.`);
    if (typeof s.asks !== 'string' || s.asks.trim() === '') throw new Error(`${at}/slot.json asks nothing: give it the question as asks.`);
    const options = Array.isArray(s.options) ? s.options : [];
    if (options.length < 2) throw new Error(`${at}/slot.json offers ${options.length} option(s), and a pick is a choice of two or more.`);
    const ids = options.map((o) => o?.id);
    if (ids.some((id) => typeof id !== 'string' || !NAME.test(id)) || new Set(ids).size !== ids.length)
      throw new Error(`${at}/slot.json: each option has an id of its own, in small letters and dashes.`);
    if (options.some((o) => typeof o.says !== 'string' || o.says.trim() === '')) throw new Error(`${at}/slot.json: each option says what it is, as says.`);
    if (!ids.includes(s.default)) throw new Error(`${at}/slot.json marks ${JSON.stringify(s.default)} as the default, and it is not one of ${ids.join(', ')}.`);
    const sheets = readdirSync(join(dir, pick)).filter((f) => f.endsWith('.css'));
    const stray = sheets.find((f) => !ids.includes(f.slice(0, -'.css'.length)));
    if (stray) throw new Error(`${at}/${stray} is a sheet for no option of this pick: name it after one of ${ids.join(', ')}.`);
    out.push({
      pick,
      asks: s.asks.trim(),
      from: typeof s.from === 'string' ? s.from : null,
      why: typeof s.why === 'string' ? s.why : '',
      taken: typeof s.taken === 'string' ? s.taken : null,
      shown: s.shown === 'specimen',
      default: s.default,
      options: options.map((o) => {
        const file = join(dir, pick, `${o.id}.css`);
        const css = existsSync(file) ? readFileSync(file, 'utf8') : null;
        return { id: o.id, says: o.says.trim(), live: o.live === true, css, drawn: s.shown === 'specimen' && (css !== null || o.live === true) };
      }),
    });
  }
  return out;
}

/** `slot=option` pairs, as given on the command line, as `{ slot: option }`. */
export function chosenOf(pairs = []) {
  const out = {};
  for (const p of pairs) {
    const m = /^([a-z][a-z0-9-]*)=([a-z][a-z0-9-]*)$/u.exec(p);
    if (m === null) throw new Error(`A pick is given as slot=option, and ${JSON.stringify(p)} is not.`);
    out[m[1]] = m[2];
  }
  return out;
}

/**
 * Each slot's answer: the owner's choice where one was made, else the marked default, listed as "default, not chosen"
 * (or as taken where its slot's `taken` says). A choice of an option the slot does not offer, or of a slot that is
 * not there, is refused by name.
 */
export function answersOf(slots, chosen = {}) {
  const known = new Set(slots.map((s) => s.pick));
  const stray = Object.keys(chosen).find((k) => !known.has(k));
  if (stray) throw new Error(`There is no pick called ${stray}. The picks are ${[...known].join(', ')}.`);
  return Object.fromEntries(
    slots.map((s) => {
      const said = chosen[s.pick];
      if (said !== undefined && !s.options.some((o) => o.id === said))
        throw new Error(`The ${s.pick} pick offers ${s.options.map((o) => o.id).join(' and ')}, and not ${said}.`);
      if (said !== undefined) return [s.pick, { option: said, how: CHOSEN }];
      return [s.pick, { option: s.default, how: s.taken ? `taken in ${s.taken}` : DEFAULTED }];
    }),
  );
}

/**
 * EVERY DARK ROLE, ITS VALUE AND ITS CONTRAST ON THE BOARD AND ON THE TILE, read from the theme's own build: the same
 * palette `packages/theme/scripts/proof.ts` prints and `house.css` is generated from. The kept `proof.txt` is a print of
 * that script from before the board, the tile and the red, so it is named as the source and not read: a sheet of
 * yesterday's values beside today's skin is the drift this page exists to stop.
 */
export async function darkRoles() {
  const theme = await import('../../packages/theme/src/index.ts');
  const p = theme.HOUSE.schemes.dark;
  const ratio = (a, b) => theme.contrast(theme.parseColour(a), theme.parseColour(b));
  return Object.entries(p)
    .filter(([, v]) => typeof v === 'string' && /^#[0-9A-Fa-f]{6}$/u.test(v))
    .map(([role, value]) => {
      const fill = ON_FILL[role];
      const own = fill && typeof p[fill] === 'string' ? { fill, ratio: ratio(value, p[fill]) } : null;
      return { role, value, board: ratio(value, p.board), tile: ratio(value, p.tile), own };
    });
}

/** The words that sit on a fill and never on the board: measured on that fill too, or the table reads them as unreadable. */
const ON_FILL = { 'on-action': 'action', 'accent-ink': 'accent' };

/** What a role is for, in a word a person reads; a role not named here is listed by its own name. */
const ROLE_SAYS = {
  board: 'the board', tile: 'a tile', field: 'a control on a tile', ink: 'body text', ink2: 'second text', dim: 'quiet text',
  faint: 'the quietest text', line: 'a hairline', edge: 'an edge that must be seen', earn: 'money in, done',
  warn: 'at risk', danger: 'late and needs you, as a mark', 'danger-text': 'late and needs you, as words',
  info: 'information', action: 'the working red', 'action-hover': 'the working red, hovered', 'action-text': 'the working red as words',
  'on-action': 'words on the working red', accent: 'the brand red', 'accent-text': 'the brand red as words',
  sunk: 'below the board', bg: 'the page behind a sheet', s1: 'a raised step', s2: 'a second raised step', s3: 'a third raised step',
  'earn-fill': 'money in, done, as a fill', 'warn-fill': 'at risk, as a fill', 'danger-fill': 'late, as a fill',
  'info-fill': 'information, as a fill', live: 'arrived just now', 'live-fill': 'arrived just now, as a fill',
  'accent-edge': 'the brand red as an edge', 'accent-ink': 'words on the brand red', 'accent-hover': 'the brand red, hovered',
  'accent-press': 'the brand red, pressed', 'action-tint-1': 'a chosen place', 'action-tint-2': 'a chosen place, hovered',
  'focus-in': 'the focus ring, inside', 'focus-out': 'the focus ring, outside',
};

/** What a role is for, and for words that sit on a fill, how well they read on it. */
const roleSays = (r) => `${ROLE_SAYS[r.role] ?? r.role}${r.own ? `, ${r.own.ratio.toFixed(2)} on it` : ''}`;

/** The text of `dark.md`. Words need 4.5 on their ground, a mark or a line 3; words on a fill are measured on it too. */
export function darkMd(roles) {
  const n = (x) => x.toFixed(2);
  const lines = roles.map((r) => `| ${r.role} | ${roleSays(r)} | \`${r.value}\` | ${n(r.board)} | ${n(r.tile)} |`);
  return [
    '# The dark roles',
    '',
    'Generated by `node tools/look/picks.mjs dark` from the theme\'s own build (`packages/theme/src`): the palette',
    '`packages/theme/scripts/proof.ts` prints and `packages/skin/house.css` is generated from. The kept',
    '`packages/theme/proof.txt` is an older print of that script, from before the board, the tile and the red, so it is',
    'not read. Do not edit this file: change the seed or the profile and run the command again.',
    '',
    'Contrast is measured against the board and against the tile. Words need 4.5 on their ground; a mark, a line or an',
    'edge needs 3. Words that only ever sit on a fill (the label of a red button) say how well they read on it.',
    '',
    '| Role | What it is for | Value | On the board | On a tile |',
    '|---|---|---|---|---|',
    ...lines,
    '',
  ].join('\n');
}

/**
 * THE MEASUREMENTS OF `tokens.css` BESIDE THE REFERENCE KIT'S, where both name a number. Each is read from
 * its file, the token by name and the kit by the sentence it is written in, so neither side is typed here. A side its
 * file no longer says is listed as not found, never dropped.
 */
export const MEASURES = [
  { name: 'Rail width', token: '--rail', kit: /\*\*Rail:\*\*\s*(\d+) total/u },
  { name: 'A rail place, height', token: '--rail-item-h', kit: /Rows are (\d+) tall/u },
  { name: 'A control, height', token: '--btn-h', kit: /A (\d+)px circle, or a capsule/u },
  { name: 'A control in a panel, height', token: '--btn-h-sm', kit: /drops to (\d+) \//u },
  { name: 'A control, text size', token: '--fs-meta', kit: /\| Control \| (\d+) medium/u },
  { name: 'A table row, height', token: '--row-h', kit: /Rows: (\d+) min height/u },
  { name: 'A field, corner', token: '--r-pop', kit: /Inputs\.\*\* Padding [\d/]+, radius (\d+)/u },
  { name: 'A tile, corner', token: '--r-tile', kit: /The card is radius (\d+)/u },
  { name: 'The grid step', token: '--sp-1', kit: /\*\*Grid:\*\*\s*(\d+)px/u },
];

/** Each measure as `{ name, ours, kit }`, numbers in px or `null` where its file does not say. */
export function measuresOf(tokens, kit) {
  return MEASURES.map((m) => {
    const t = new RegExp(`${m.token}:\\s*(\\d+(?:\\.\\d+)?)px`, 'u').exec(tokens);
    const k = m.kit.exec(kit);
    return { name: m.name, ours: t ? Number(t[1]) : null, kit: k ? Number(k[1]) : null };
  });
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/gu, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** The page's own colours, the live dark and light board, tile, ink, quiet text and working red, from `house.css`. */
export function pageColours(house) {
  const role = (block, name) => new RegExp(`--${name}:\\s*([^;]+);`, 'u').exec(block)?.[1]?.trim() ?? '';
  const of = (block) => ({ board: role(block, 'board'), tile: role(block, 'tile'), ink: role(block, 'ink'), dim: role(block, 'ink-3'), red: role(block, 'red-fill'), redText: role(block, 'red'), onRed: role(block, 'on-red') });
  const darkAt = house.indexOf('prefers-color-scheme: dark');
  return { light: of(house.slice(0, darkAt === -1 ? undefined : darkAt)), dark: of(darkAt === -1 ? '' : house.slice(darkAt)) };
}

/** The pictures one option shows, in the page's order: dark then light, 390 then 1440. Paths are the drawing's own. */
export function shotsOf(images = {}) {
  const out = [];
  for (const theme of PICK_THEMES)
    for (const width of PICK_WIDTHS) {
      const name = Object.keys(images).find((f) => f.endsWith(`-${width}-${theme}.png`));
      if (name) out.push({ theme, width, src: name });
    }
  return out;
}

/**
 * The picks page, whole. `drawn[pick][option]` and `drawn['as-it-stands']` hold each drawing's images by path; an option
 * with no drawing is said in words. Every pick is a set of radios with the default ticked and marked, so "yes to every
 * recommendation" is one press, and the answer is shown back in words before it is sent.
 */
export function picksHtml({ slots, drawn = {}, record = 'a copy of your record', dark = [], measures = [], colours }) {
  const c = colours;
  const stands = drawn['as-it-stands'] ?? {};
  const fig = (s) => `<figure class="w${s.width}"><img src="${esc(s.src)}" alt="${esc(`At ${s.width}, ${s.theme}`)}" loading="lazy"><figcaption>${s.width}, ${s.theme}</figcaption></figure>`;
  const option = (slot, o) => {
    const images = !o.drawn ? null : o.css !== null ? drawn[slot.pick]?.[o.id] : stands;
    const shots = shotsOf(images ?? {});
    const mark = o.id === slot.default ? ' <span class="rec">Recommended</span>' : '';
    const words = slot.shown ? 'Said in words: nothing draws this one on the sample page yet.' : 'Said in words: it is about a screen the sample page does not hold.';
    const how = o.drawn ? (shots.length === 0 ? '<p class="quiet">Not drawn yet.</p>' : `<div class="shots">${shots.map(fig).join('')}</div>`) : `<p class="quiet">${words}</p>`;
    const live = o.live ? '<p class="quiet">As it is today.</p>' : '';
    return `<label class="opt"><input type="radio" name="${esc(slot.pick)}" value="${esc(o.id)}"${o.id === slot.default ? ' checked data-default' : ''}><span><b>${esc(o.says)}</b>${mark}</span>${live}${how}</label>`;
  };
  const rows = slots.map((s) => {
    const said = s.taken ? `<p class="quiet">Taken for you in ${esc(s.taken)}. One word turns it back.</p>` : '';
    return `<section class="tile pick" data-pick="${esc(s.pick)}"><h2>${esc(s.asks)}</h2><p class="why">${esc(s.why)}</p>${said}<div class="opts">${s.options.map((o) => option(s, o)).join('')}</div></section>`;
  });
  const darkRows = dark.map((r) => `<tr><td>${esc(roleSays(r))}</td><td class="num"><span class="sw" style="background:${esc(r.value)}"></span>${esc(r.value)}</td><td class="num">${r.board.toFixed(2)}</td><td class="num">${r.tile.toFixed(2)}</td></tr>`);
  const measureRows = measures.map((m) => `<tr><td>${esc(m.name)}</td><td class="num">${m.ours === null ? 'not found' : `${m.ours}px`}</td><td class="num">${m.kit === null ? 'not found' : `${m.kit}px`}</td></tr>`);
  const open = slots.filter((s) => !s.taken).length;
  const theme = (k) => `--board:${c[k].board};--tile:${c[k].tile};--ink:${c[k].ink};--dim:${c[k].dim};--red:${c[k].red};--red-text:${c[k].redText};--on-red:${c[k].onRed};`;
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>The look sheet</title><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&display=swap"><style>
  :root { ${theme('light')} color-scheme: light dark; }
  @media (prefers-color-scheme: dark) { :root:not([data-theme='light']) { ${theme('dark')} } }
  :root[data-theme='dark'] { ${theme('dark')} }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 24px clamp(16px, 3vw, 40px); background: var(--board); color: var(--ink); font: 400 15px/1.5 Geist, system-ui, sans-serif; }
  h1 { font-size: 28px; font-weight: 600; margin: 0 0 4px; } h2 { font-size: 17px; font-weight: 600; margin: 0 0 4px; }
  .lede { font-size: 17px; margin: 0 0 20px; } .why, .quiet { color: var(--dim); margin: 0 0 8px; }
  .tile { background: var(--tile); border-radius: 16px; padding: 20px; margin-bottom: 12px; }
  .opts { display: grid; gap: 12px; } .opt { display: grid; gap: 8px; cursor: pointer; }
  .opt > span { display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; } input { accent-color: var(--red); margin-right: 8px; }
  .rec { color: var(--red-text); font-weight: 500; }
  .shots { display: flex; gap: 12px; overflow-x: auto; padding-bottom: 4px; }
  figure { margin: 0; flex: none; } figcaption { color: var(--dim); font-size: 15px; }
  img { display: block; border-radius: 8px; height: 320px; width: auto; object-fit: cover; object-position: top; background: var(--board); }
  .bar { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; }
  button { font: 500 15px Geist, system-ui, sans-serif; border: 0; border-radius: 8px; padding: 0 16px; height: 40px; cursor: pointer; }
  .primary { background: var(--red); color: var(--on-red); } .plain { background: var(--board); color: var(--ink); }
  textarea { width: 100%; min-height: 72px; font: inherit; color: inherit; background: var(--board); border: 0; border-radius: 8px; padding: 12px; }
  table { border-collapse: collapse; width: 100%; } td, th { text-align: left; padding: 6px 12px 6px 0; } th { font-weight: 500; color: var(--dim); }
  .num { font-variant-numeric: tabular-nums; white-space: nowrap; } .sw { display: inline-block; width: 12px; height: 12px; border-radius: 999px; margin-right: 8px; vertical-align: middle; }
  .scroll { overflow-x: auto; } #answer { white-space: pre-wrap; margin: 12px 0 0; }
  </style>
  <h1>The look sheet</h1>
  <p class="lede">${open} choice${open === 1 ? '' : 's'} about the frame. Those that show on a sample page are drawn on ${esc(record)} at 390 and 1440, dark then light. A choice you leave takes the one marked Recommended.</p>
  <section class="tile"><div class="bar"><button class="primary" type="button" id="all">Yes to every recommendation</button><button class="plain" type="button" id="mine">Show my answer</button></div>
  <textarea id="words" aria-label="Anything you want to say with your answer" placeholder="Anything you want to say with your answer"></textarea><p id="answer" class="quiet" aria-live="polite"></p></section>
  ${rows.join('\n  ')}
  ${darkRows.length > 0 ? `<section class="tile"><h2>Every colour in dark, and how well it reads</h2><p class="why">Words need 4.5 on their ground, a mark or a line 3. The label of a red button is measured on the red.</p><div class="scroll"><table><tr><th>What it is for</th><th>Colour</th><th>On the board</th><th>On a tile</th></tr>${darkRows.join('')}</table></div></section>` : ''}
  ${measureRows.length > 0 ? `<section class="tile"><h2>Our sizes beside the reference kit's</h2><div class="scroll"><table><tr><th>What</th><th>Ours</th><th>The kit's</th></tr>${measureRows.join('')}</table></div></section>` : ''}
  <script>
  const picks = [...document.querySelectorAll('.pick')];
  const say = (all) => {
    const lines = picks.map((p) => { const on = p.querySelector('input:checked'); return p.querySelector('h2').textContent + ': ' + on.closest('.opt').querySelector('b').textContent + (on.hasAttribute('data-default') ? ' (recommended)' : ''); });
    document.getElementById('answer').textContent = (all ? 'Yes to every recommendation.\\n' : '') + lines.join('\\n');
  };
  document.getElementById('all').addEventListener('click', () => { for (const i of document.querySelectorAll('input[data-default]')) i.checked = true; say(true); });
  document.getElementById('mine').addEventListener('click', () => say(false));
  </script></html>
`;
}

/** The four boards drawn by hand on 8 October, which the sheet is judged beside. */
export const OCT8 = join('loop', 'design', 'boards-oct8', 'project');
const OCT8_BOARDS = [
  { file: 'Main.dc.html', name: 'Today, dark', width: 1440 },
  { file: 'TodayLight.dc.html', name: 'Today, light', width: 1440 },
  { file: 'Decide.dc.html', name: 'Decide, dark', width: 1440 },
  { file: 'Phone.dc.html', name: 'Today on a phone', width: 390 },
];

/**
 * Draw the picks: the specimen as it stands, then once with each option's sheet, at 390 and 1440 in both themes, on a
 * copy of a record (never live), through the same server, install and capture a board uses. Writes `picks.json` and
 * the page beside the pictures. The four boards of 8 October are pictured too, when their files are there.
 */
export async function drawPicks({ source: asked, out: given } = {}, root = ROOT) {
  const board = await import('./board.mjs');
  const { parseDog } = await import('../../packages/dog/src/index.ts');
  const got = parseDog(readFileSync(join(root, SPECIMEN), 'utf8'));
  if (!got.ok) throw new Error(`${SPECIMEN} does not read as a page, at line ${got.line}: ${got.fix}`);
  const body = got.value;
  const slots = readSlots(root);
  const want = asked ?? board.sourceOf('lived');
  const { appShell, webBuildUnmet } = await import('../gates/lib.mjs');
  if (!existsSync(appShell(join(root, 'apps', 'web', 'build')))) throw new Error('There is no built app to draw. Run pnpm --filter @braindog/web build first.');
  const stale = await webBuildUnmet(root);
  if (stale !== null) throw new Error(`${stale}. Run pnpm --filter @braindog/web build first.`);
  const source = await board.openFor(want);
  const out = given === undefined ? join(root, board.DRAWINGS, `picks-${new Date().toISOString().slice(0, 16).replace(':', '-')}`) : resolve(given);
  mkdirSync(out, { recursive: true });
  const { serve } = await import('./run.mjs');
  const { answers } = await import('../gates/record.mjs');
  const { default: capture } = await import('./capture.mjs');
  const runs = [{ key: 'as-it-stands', css: undefined }, ...slots.flatMap((s) => s.options.filter((o) => o.drawn && o.css !== null).map((o) => ({ key: `${s.pick}/${o.id}`, css: o.css })))];
  const drawing = { board: BOARD, record: source.record, source: source.name, at: new Date().toISOString(), commit: board.commitOf(root), widths: PICK_WIDTHS, themes: PICK_THEMES, drawn: {} };
  let served = null;
  try {
    served = await serve(source, { build: join(root, 'apps', 'web', 'build') });
    await answers(served.origin);
    await board.install(served.origin, body, new Map());
    const screens = board.screensFor({ screens: [] }, body);
    for (const r of runs) {
      const folder = join(out, r.key);
      mkdirSync(folder, { recursive: true });
      await capture({ origin: served.origin, app: served.app, set: BOARD, out: folder, source: { ...source, widths: PICK_WIDTHS, screens, ...(r.css === undefined ? {} : { css: r.css }) } });
      const [pick, option] = r.key.split('/');
      const images = board.imagesIn(folder, `${r.key}/`);
      if (option === undefined) drawing.drawn[pick] = images;
      else drawing.drawn[pick] = { ...(drawing.drawn[pick] ?? {}), [option]: images };
      writeFileSync(join(out, 'picks.json'), `${JSON.stringify(drawing, null, 2)}\n`);
    }
  } finally {
    await served?.close();
    await source.close();
  }
  drawing.oct8 = await drawOct8(root, out);
  writeFileSync(join(out, 'picks.json'), `${JSON.stringify(drawing, null, 2)}\n`);
  await writePage(out, root);
  return { out, drawing };
}

/** Pictures of the four boards of 8 October, as files in the drawing, or an empty list when they are not here. */
async function drawOct8(root, out) {
  const there = OCT8_BOARDS.filter((b) => existsSync(join(root, OCT8, b.file)));
  if (there.length === 0) return [];
  const { chromium } = await import('@playwright/test');
  const browser = await chromium.launch();
  const done = [];
  try {
    mkdirSync(join(out, 'oct8'), { recursive: true });
    for (const b of there) {
      const page = await browser.newPage({ viewport: { width: b.width, height: 1100 } });
      await page.goto(pathToFileURL(join(root, OCT8, b.file)).href, { waitUntil: 'load' });
      const src = `oct8/${b.file.replace(/\.dc\.html$/u, '')}.png`;
      await page.screenshot({ path: join(out, src) });
      await page.close();
      done.push({ name: b.name, src, width: b.width });
    }
  } finally {
    await browser.close();
  }
  return done;
}

/** The record a drawing was made on, as he reads it. */
const RECORD_SAYS = { seed: 'a sample record', lived: 'a copy of your record', file: 'a copy of a record', shape: 'the shape of your record' };

/** Write `index.html` into a picks drawing, from its `picks.json`, the slots, the dark roles and the measures as they are. */
export async function writePage(out, root = ROOT) {
  const drawing = JSON.parse(readFileSync(join(out, 'picks.json'), 'utf8'));
  const read = (f) => (existsSync(join(root, f)) ? readFileSync(join(root, f), 'utf8') : '');
  let html = picksHtml({
    slots: readSlots(root),
    drawn: drawing.drawn,
    record: RECORD_SAYS[drawing.source] ?? `the ${drawing.source} record`,
    dark: await darkRoles(),
    measures: measuresOf(read('packages/skin/tokens.css'), read('loop/KIT-REFERENCE.md')),
    colours: pageColours(read('packages/skin/house.css')),
  });
  const oct8 = drawing.oct8 ?? [];
  if (oct8.length > 0) {
    const figs = oct8.map((b) => `<figure class="w${b.width}"><img src="${esc(b.src)}" alt="${esc(b.name)}" loading="lazy"><figcaption>${esc(b.name)}</figcaption></figure>`).join('');
    html = html.replace('<section class="tile pick"', `<section class="tile"><h2>The four boards of 8 October</h2><p class="why">The frame was taken as yes on these. Each sample page below is judged beside them.</p><div class="shots">${figs}</div></section>\n  <section class="tile pick"`);
  }
  writeFileSync(join(out, 'index.html'), html);
  return join(out, 'index.html');
}

/**
 * The yes to the frame, with its picks: `board.mjs`'s `yesOf` over a drawing of the frame board (it refuses one of code
 * that has moved since), the units the planner counts, and each pick as chosen, defaulted or taken. Returns the yes.
 */
export async function yesWithPicks(root, drawing, { said, taken, seen = false, chosen = {}, at = new Date() }) {
  const { yesOf } = await import('./board.mjs');
  const yes = yesOf(root, BOARD, drawing, { said, taken, seen, units: UNITS, at });
  return { ...yes, picks: answersOf(readSlots(root), chosen) };
}

/** `dark`, `draw`, `page` or `yes`, and their flags. A flag a command does not take is refused. */
export function parseArgs(args) {
  const [command, ...rest] = args;
  if (!['dark', 'draw', 'page', 'yes'].includes(command)) throw new Error('picks.mjs takes dark, draw, page or yes.');
  const out = { command, picks: [], seen: false };
  const takes = { dark: [], draw: ['source', 'out'], page: ['from'], yes: ['from', 'taken', 'pick'] }[command];
  for (let i = 0; i < rest.length; i += 1) {
    const a = rest[i];
    if (a === '--seen' && command === 'yes') {
      out.seen = true;
      continue;
    }
    const m = /^--([a-z]+)(?:=(.*))?$/u.exec(a);
    if (m === null) {
      if (command !== 'yes' || out.said !== undefined) throw new Error(`picks.mjs ${command} does not take ${a}.`);
      out.said = a;
      continue;
    }
    if (!takes.includes(m[1])) throw new Error(`picks.mjs ${command} does not take --${m[1]}.`);
    const value = m[2] ?? rest[(i += 1)];
    if (value === undefined) throw new Error(`--${m[1]} needs a value.`);
    if (m[1] === 'pick') out.picks.push(value);
    else out[m[1]] = value;
  }
  if ((command === 'page' || command === 'yes') && out.from === undefined) throw new Error(`picks.mjs ${command} needs --from <the drawing folder>.`);
  if (command === 'yes' && (out.said ?? '').trim() === '') throw new Error('A yes holds the words said: picks.mjs yes "<the words of the yes>" --from <the frame drawing>.');
  return out;
}

async function main() {
  const asked = parseArgs(argv.slice(2));
  if (asked.command === 'dark') {
    writeFileSync(join(ROOT, DARK), darkMd(await darkRoles()));
    console.log(`  picks: the dark roles are in ${DARK}`);
    return;
  }
  if (asked.command === 'page') {
    console.log(`  picks: the page is ${await writePage(resolve(asked.from))}`);
    return;
  }
  if (asked.command === 'yes') {
    const drawing = JSON.parse(readFileSync(join(resolve(asked.from), 'drawing.json'), 'utf8'));
    const yes = await yesWithPicks(ROOT, drawing, { said: asked.said, taken: asked.taken, seen: asked.seen, chosen: chosenOf(asked.picks) });
    writeFileSync(join(ROOT, BOARDS, BOARD, 'yes.json'), `${JSON.stringify(yes, null, 2)}\n`);
    const left = Object.values(yes.picks).filter((p) => p.how === DEFAULTED).length;
    console.log(`  picks: the yes to the ${BOARD} board is kept, naming ${Object.keys(yes.images).length} pictures, ${Object.keys(yes.picks).length} picks (${left} default, not chosen).`);
    return;
  }
  const { sourceOf } = await import('./board.mjs');
  const { out } = await drawPicks({ source: asked.source === undefined ? undefined : sourceOf(asked.source), out: asked.out });
  console.log(`  picks: drawn in ${out}, the page is ${join(out, 'index.html')}`);
}

if (argv[1] && import.meta.url === pathToFileURL(argv[1]).href)
  main().catch((e) => {
    console.error(`  picks refused: ${e instanceof Error ? e.message : String(e)}`);
    exit(1);
  });
