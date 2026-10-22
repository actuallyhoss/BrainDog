/**
 * The sheet of one board: every picture of a drawing, light and then dark, the screen as it is today beside the
 * candidate and each variant, the checks it is judged by, and what it could not draw yet (EXP-A01 job 2).
 *
 *   node tools/look/board-sheet.mjs <drawing folder>      draws the sheets again from its drawing.json
 *
 * ONE PAGE A THEME, so dark is judged as itself and not as an afterthought of light. A line a drawing: its pictures at
 * every width side by side, named by width, with anything the look counted against them (`sheet.mjs` `flags`), so a
 * fault is said before the picture is looked at. The phone and the laptop (390 and 1440) are what he looks at first,
 * so they lead each line; 1512 and 1728 follow.
 *
 * THE STAND-INS ARE THE ORDER BOOK. A block the renderer cannot draw yet is drawn on the page as a plain note, and here
 * as a dashed tile with the block it needs, counted in the sheet's opening line, so the pages area reads its work off
 * the board.
 *
 * DRAWN ON THE PRODUCT'S OWN BOARD: flat tiles on a flat ground, radius 16, no border and no
 * shadow, colours read from the theme's own sheet so `colour-grep` finds no literal here, and a fault carries a mark
 * and a word as well as the red.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { argv } from 'node:process';
import { pathToFileURL } from 'node:url';

import { flags } from './sheet.mjs';

/** The order widths are laid out in: the two he looks at first, then the rest as drawn. */
export const FIRST = [390, 1440];
const ROW_PX = 300;
const GAP_PX = 12;

const HOUSE = readFileSync(new URL('../../packages/skin/house.css', import.meta.url), 'utf8');
const rolesOf = (block) => {
  const role = (name) => new RegExp(`--${name}:\\s*([^;]+);`, 'u').exec(block)?.[1]?.trim() ?? '';
  return { board: role('board'), tile: role('tile'), ink: role('ink'), muted: role('dim'), late: role('danger') };
};
const darkAt = HOUSE.indexOf("html[data-scheme='dark']");
const BOARD = {
  light: rolesOf(HOUSE.slice(0, HOUSE.indexOf('@media'))),
  dark: rolesOf(HOUSE.slice(darkAt, HOUSE.indexOf('}', darkAt))),
};

const esc = (s) => String(s ?? '').replace(/[&<>"]/gu, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const plural = (n, one) => `${n} ${n === 1 ? one : `${one}s`}`;

/** What each drawing is called on the sheet. */
export const nameOf = (id) => (id === 'today' ? 'As it is today' : id === 'candidate' ? 'The board' : `Choice: ${id.replace(/^variant-/u, '').replace(/[-_]+/gu, ' ')}`);

/** The widths in the sheet's order. */
export const ordered = (widths) => [...FIRST.filter((w) => widths.includes(w)), ...widths.filter((w) => !FIRST.includes(w))];

/** The drawing's lines for one theme: `{ id, name, screen, shots }`, one a drawing and screen, widths in order. */
export function linesOf(drawing, saids, theme) {
  const widths = ordered(drawing.widths);
  const lines = [];
  for (const d of drawing.drawings) {
    const shots = (saids[d.id]?.shots ?? []).filter((s) => s.theme === theme);
    for (const screen of [...new Set(shots.map((s) => s.screen))]) {
      const mine = shots.filter((s) => s.screen === screen).sort((a, b) => widths.indexOf(a.width) - widths.indexOf(b.width));
      lines.push({ id: d.id, name: nameOf(d.id), screen: mine[0].name, shots: mine });
    }
  }
  return lines;
}

/** The sheet of one theme, as a page. Pictures are put inline, so the page needs no server. */
export function boardSheetHtml({ drawing, saids, theme, out, height = 1100 }) {
  const c = BOARD[theme];
  const lines = linesOf(drawing, saids, theme);
  const img = (id, s) => {
    const w = Math.round((ROW_PX * s.width) / height);
    const file = join(out, id, s.image);
    const src = existsSync(file) ? `data:image/png;base64,${readFileSync(file).toString('base64')}` : '';
    return `<figure style="width:${w}px"><img src="${src}" width="${w}" height="${ROW_PX}" alt="${esc(`${s.name} at ${s.width}`)}"><figcaption>${s.width}</figcaption></figure>`;
  };
  const rows = lines.map((l) => {
    const bad = flags(l.shots);
    const said = bad.length === 0 ? '<p class="ok">Drew at every width</p>' : bad.map((b) => `<p class="bad"><span aria-hidden="true">!</span> ${esc(b)}</p>`).join('');
    return `<section class="tile"><h2>${esc(l.name)}</h2><p class="muted">${esc(l.screen)}</p>${said}<div class="line">${l.shots.map((s) => img(l.id, s)).join('')}</div></section>`;
  });
  const missing = drawing.drawings.flatMap((d) => (d.missing ?? []).map((m) => `<p><b>${esc(m.name)}</b>: ${esc(m.why ?? m.missing)}</p>`));
  const checks = drawing.checks.map((k) => `<li>${esc(k.says)}${typeof k.by === 'string' && k.by.startsWith('gate:') ? ` <span class="muted">Held by the ${esc(k.by.slice(5))} check.</span>` : ''}</li>`);
  const stands = drawing.standIns.map((s) => `<section class="tile stand"><h2>${esc(s.name)}</h2><p class="muted">Not drawable yet. It needs ${esc(s.needs)}.</p></section>`);
  return `<!doctype html><meta charset="utf-8"><title>${esc(drawing.title)}, ${theme}</title><style>
    body { margin: 0; padding: 24px; background: ${c.board}; color: ${c.ink}; font: 400 15px/1.45 Geist, system-ui, sans-serif; }
    h1 { font-size: 28px; font-weight: 600; margin: 0 0 4px; } h2 { font-size: 17px; font-weight: 600; margin: 0 0 4px; }
    .lede { font-size: 17px; margin: 0 0 20px; }
    .tile { background: ${c.tile}; border-radius: 16px; padding: 20px; margin-bottom: ${GAP_PX}px; }
    .stand { background: transparent; outline: 2px dashed ${c.muted}; outline-offset: -2px; }
    .line { display: flex; gap: ${GAP_PX}px; align-items: flex-start; margin-top: 12px; }
    p { margin: 0 0 4px; } ul { margin: 0; padding-left: 20px; } li { margin-bottom: 6px; }
    .muted { color: ${c.muted}; font-size: 13px; } .ok { color: ${c.muted}; } .bad { color: ${c.late}; font-weight: 500; }
    figure { margin: 0; flex: none; } img { display: block; border-radius: 8px; object-fit: cover; object-position: top; }
    figcaption { color: ${c.muted}; font-size: 13px; margin-top: 4px; }
  </style>
  <h1>${esc(drawing.title)}, ${theme}</h1>
  <p class="lede">Drawn from ${esc(drawing.record)} at ${ordered(drawing.widths).join(', ')}${drawing.standIns.length > 0 ? `, ${plural(drawing.standIns.length, 'block')} not drawable yet` : ''}.</p>
  ${rows.join('\n')}
  ${missing.length > 0 ? `<section class="tile"><h2>Not drawn</h2>${missing.join('')}</section>` : ''}
  ${checks.length > 0 ? `<section class="tile"><h2>What it is checked for</h2><ul>${checks.join('')}</ul></section>` : ''}
  ${stands.join('\n')}`;
}

/** Each drawing's `said.json`, by its id. A drawing whose look wrote none has no shots. */
export const saidsOf = (out, drawing) =>
  Object.fromEntries(drawing.drawings.map((d) => [d.id, existsSync(join(out, d.id, 'said.json')) ? JSON.parse(readFileSync(join(out, d.id, 'said.json'), 'utf8')) : { shots: [] }]));

/** Both themes' sheets as a page and an image in the drawing folder, with a browser of its own. The file names. */
export async function boardSheets(out) {
  const drawing = JSON.parse(readFileSync(join(out, 'drawing.json'), 'utf8'));
  const saids = saidsOf(out, drawing);
  const height = Object.values(saids).find((s) => s.look?.height)?.look.height ?? 1100;
  const { chromium } = await import('@playwright/test');
  const browser = await chromium.launch();
  const made = [];
  try {
    for (const theme of drawing.themes) {
      const html = boardSheetHtml({ drawing, saids, theme, out, height });
      const name = `board-${drawing.board}-${theme}`;
      writeFileSync(join(out, `${name}.html`), html);
      const width = 2 * 24 + 2 * 20 + drawing.widths.reduce((n, w) => n + Math.round((ROW_PX * w) / height) + GAP_PX, 0);
      const page = await browser.newPage({ viewport: { width, height: 900 }, colorScheme: theme });
      await page.setContent(html, { waitUntil: 'load' });
      await page.screenshot({ path: join(out, `${name}.png`), fullPage: true });
      await page.close();
      made.push(join(out, `${name}.png`));
    }
  } finally {
    await browser.close();
  }
  return made;
}

if (argv[1] && import.meta.url === pathToFileURL(argv[1]).href) for (const f of await boardSheets(resolve(argv[2] ?? '.'))) console.log(`  ${f}`);
