/**
 * One contact sheet a theme for a look: every screen of the set as a line, its three widths side by side
 * (`loop/scope/area-proof-a.md` 2.4, PRF-A02 job 5).
 *
 * THE SHEET IS WHAT THE READER OPENS FIRST, and `rubric.md` is what it reads it against. Each screen carries its name,
 * its address, what it settled into and anything raw `said.json` counted in its text, so a fault is named before the
 * picture is looked at. A screen the look did not draw is listed under the pictures with the reason, never left out.
 *
 * DRAWN ON THE PRODUCT'S OWN BOARD (DIRECTION 39): flat tiles on a flat ground, radius 16, no border and no shadow, and
 * a screen that did not settle carries a mark and a word as well as the red (DIRECTION 42).
 *
 *   node tools/look/sheet.mjs <look folder>      draws the sheets again from its said.json
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { argv } from 'node:process';
import { pathToFileURL } from 'node:url';

/** How tall each picture is on the sheet, and how wide its caption. */
const ROW_PX = 340;
const CAPTION_PX = 260;
const GAP_PX = 12;
/** Screens a sheet holds, so a sheet of every route stays under the tallest picture a browser will take. */
const PER_SHEET = 12;

const BOARD = {
  light: { board: '#F3F4F6', tile: '#FFFFFF', ink: '#111318', muted: '#5B616B', late: '#B3322C' },
  dark: { board: '#0D1014', tile: '#161A20', ink: '#E8EAEE', muted: '#9AA1AC', late: '#F07A73' },
};

const esc = (s) => String(s ?? '').replace(/[&<>"]/gu, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** What a screen's pictures say against it, as short lines: never settled, refused, raw text, sideways overflow. */
export function flags(shots) {
  const out = new Set();
  for (const s of shots) {
    if (s.settled === null) out.add(`never settled at ${s.width}`);
    else if (s.settled === 'refused') out.add(`refused at ${s.width}`);
    if (s.waited?.busy === 'still busy') out.add(`still busy at ${s.width}`);
    if (s.overflowPx > 1) out.add(`${s.overflowPx}px sideways at ${s.width}`);
    if (s.writesBlocked > 0) out.add(`${s.writesBlocked} writes blocked`);
    if (s.consoleErrors?.length > 0) out.add(`${s.consoleErrors.length} console errors at ${s.width}`);
    for (const [kind, { count }] of Object.entries(s.raw ?? {})) out.add(`${count} raw ${kind}`);
  }
  return [...out];
}

/** The sheet of one theme, as a page. Images are read from `out` and put inline, so the page needs no server. */
export function sheetHtml({ said, theme, out, keys: only, part = 1, parts = 1 }) {
  const c = BOARD[theme];
  const widths = said.look.widths;
  const height = said.look.height;
  const shots = said.shots.filter((s) => s.theme === theme);
  const keys = only ?? [...new Set(shots.map((s) => s.screen))];
  const img = (s) => {
    const w = Math.round((ROW_PX * s.width) / height);
    const data = readFileSync(join(out, s.image)).toString('base64');
    return `<figure style="width:${w}px"><img src="data:image/png;base64,${data}" width="${w}" height="${ROW_PX}" alt=""><figcaption>${s.width}</figcaption></figure>`;
  };
  const rows = keys.map((key) => {
    const mine = shots.filter((s) => s.screen === key).sort((a, b) => widths.indexOf(a.width) - widths.indexOf(b.width));
    const first = mine[0];
    const bad = flags(mine);
    const said = bad.length === 0 ? '<p class="ok">Drew at every width</p>' : bad.map((b) => `<p class="bad"><span aria-hidden="true">!</span> ${esc(b)}</p>`).join('');
    return `<section class="tile line"><div class="cap"><h2>${esc(first.name)}</h2><p class="muted">${esc(first.route)}</p>${said}</div>${mine.map(img).join('')}</section>`;
  });
  const gone = [...said.missing, ...said.cannot];
  const goneTile = gone.length === 0 || part !== 1 ? '' : `<section class="tile"><h2>Not drawn</h2>${gone.map((g) => `<p><b>${esc(g.name)}</b>: ${esc(g.why)}</p>`).join('')}</section>`;
  return `<!doctype html><meta charset="utf-8"><style>
    body { margin: 0; padding: 24px; background: ${c.board}; color: ${c.ink}; font: 400 15px/1.45 Geist, system-ui, sans-serif; }
    h1 { font-size: 28px; font-weight: 600; margin: 0 0 4px; } h2 { font-size: 17px; font-weight: 600; margin: 0 0 4px; }
    .lede { font-size: 17px; margin: 0 0 20px; }
    .tile { background: ${c.tile}; border-radius: 16px; padding: 20px; margin-bottom: ${GAP_PX}px; }
    .line { display: flex; gap: ${GAP_PX}px; align-items: flex-start; }
    .cap { width: ${CAPTION_PX}px; flex: none; } .cap p { margin: 0 0 4px; }
    .muted { color: ${c.muted}; font-size: 13px; } .ok { color: ${c.muted}; } .bad { color: ${c.late}; font-weight: 500; }
    figure { margin: 0; flex: none; } img { display: block; border-radius: 8px; object-fit: cover; object-position: top; }
    figcaption { color: ${c.muted}; font-size: 13px; margin-top: 4px; }
  </style>
  <h1>${esc(String(said.look.record).replace(/^./u, (c) => c.toUpperCase()))}, ${esc(said.look.set)}, ${theme}${parts > 1 ? `, ${part} of ${parts}` : ''}</h1>
  <p class="lede">${keys.length} screens at ${widths.join(', ')}. ${said.look.seen ? 'A real record.' : 'An invented record: it never counts as seen.'} ${esc(said.look.verdict ?? '')}</p>
  ${rows.join('\n')}${goneTile}`;
}

/** Every theme's sheet as an image and a page in `out`, drawn with the look's own browser. The file names. */
export async function sheets({ browser, out, said }) {
  const made = [];
  for (const theme of said.look.themes) {
    const keys = [...new Set(said.shots.filter((s) => s.theme === theme).map((s) => s.screen))];
    if (keys.length === 0) continue;
    const parts = Math.ceil(keys.length / PER_SHEET);
    for (let part = 1; part <= parts; part += 1) {
      const html = sheetHtml({ said, theme, out, keys: keys.slice((part - 1) * PER_SHEET, part * PER_SHEET), part, parts });
      const name = `sheet-${said.look.set}-${theme}${parts > 1 ? `-${part}` : ''}`;
      writeFileSync(join(out, `${name}.html`), html);
      const width = CAPTION_PX + said.look.widths.reduce((n, w) => n + Math.round((ROW_PX * w) / said.look.height) + GAP_PX, 0) + 2 * 20 + 2 * 24 + GAP_PX;
      const page = await browser.newPage({ viewport: { width, height: 900 }, colorScheme: theme });
      await page.setContent(html, { waitUntil: 'load' });
      await page.screenshot({ path: join(out, `${name}.png`), fullPage: true });
      await page.close();
      made.push(`${name}.png`);
    }
  }
  return made;
}

if (argv[1] && import.meta.url === pathToFileURL(argv[1]).href) {
  const out = resolve(argv[2] ?? '.');
  const said = JSON.parse(readFileSync(join(out, 'said.json'), 'utf8'));
  const { chromium } = await import('@playwright/test');
  const browser = await chromium.launch();
  try {
    for (const f of await sheets({ browser, out, said })) console.log(`  ${join(out, f)}`);
  } finally {
    await browser.close();
  }
}
