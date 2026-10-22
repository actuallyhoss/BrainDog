/**
 * The pictures of a look: each screen of the set at each width, light and dark, and one line of `said.json` for each
 * (`loop/scope/area-proof-a.md` 2.4, PRF-A02 job 4).
 *
 * `run.mjs` serves the built app and the source, then hands this file `{ origin, app, set, out, source }` and closes
 * when it returns. Nothing here starts a server or opens a record: it drives a headless browser at the look's own
 * address, so a live look reads through the forwarder that cannot press, and every request it would have sent past
 * that is counted against the screen that sent it.
 *
 * WIDTHS ARE `look.widths` in `tools/gates/budgets.json` (390 the phone, 1512 the laptop, 1728 his MacBook's window),
 * the height is the layout gate's `viewportHeightPx`, and the wait is `ready.settleTimeoutMs`, so a look and a gate
 * never disagree about what "drawn" means.
 *
 * READY MEANS THREE THINGS, AND EACH IS WRITTEN DOWN, NOT ASSUMED: the screen said what it settled into
 * (`data-screen` on `<main>`, the gates' readiness contract), nothing in it is still busy (`aria-busy`), and the
 * fonts have loaded. A screen that never settles is still photographed, because the picture of a stuck page is the
 * finding, and its line says so.
 *
 * IMAGES ARE NAMED `<screen>-<width>-<theme>.png` for the first screen and `...-full.png` for the whole page, so the
 * six of a live look are 36 first screens by fixed names whatever the record holds, and the sheet can lay them out.
 *
 * THE THREE QUICK CHECKS READ THESE SAME PICTURES (`words.mjs`, `checks.mjs`): each line keeps the record words its text
 * holds (`raw`), the counts it says (`counts`) and the ages of the figures it draws (`ages`), and `said.json` ends with
 * `checks`, the one line a batch is judged on. Any finding fails the look, as text crossing text does.
 */

import { writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

import { budget, readiness } from '../gates/lib.mjs';
import { agesOf, countsIn, judge, pageFactsIn } from './checks.mjs';
import { pick, screensOf } from './screens.mjs';
import { sheets } from './sheet.mjs';
import { RAW, rawIn, slugsOf } from './words.mjs';

/* THE RAW COUNTING MOVED TO `words.mjs` AND IS STILL THIS FILE'S EXPORT, so the people's walks (`rawIn`) read it where they did. */
export { RAW, rawIn };

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

export const THEMES = ['light', 'dark'];

/** The look's widths, read where every number a check asserts is kept. */
export const widths = () => [...budget('look').widths];

/**
 * EVERY RUN OF TEXT ON THE SCREEN AS THE BOXES IT IS DRAWN IN, run inside the page (`page.evaluate`). Only what a person
 * sees: a node hidden, transparent or skipped is left out, and each box is cut to the boxes of the elements that clip
 * it, so a label cut short by its ellipsis is the part still drawn, while a scroller clips nothing, since what it holds is
 * read by scrolling. Inside `main`, the screen and not the frame, and the whole of it, not only the first screen.
 */
export function textBoxesIn() {
  const root = document.querySelector('main') ?? document.body;
  const clips = new Map();
  /* THE PART OF THE WINDOW AN ELEMENT'S TEXT MAY BE SEEN IN: its clipping ancestors' boxes, met. */
  const clipOf = (el) => {
    if (el === null || el === root.parentElement) return { l: -Infinity, t: -Infinity, r: Infinity, b: Infinity };
    if (clips.has(el)) return clips.get(el);
    const up = clipOf(el.parentElement);
    const cs = getComputedStyle(el);
    let c = up;
    /* WHAT A SCROLLER HOLDS IS STILL THERE TO READ, so only an element that cuts its text off clips it. */
    const cuts = (o) => o === 'hidden' || o === 'clip';
    if (cuts(cs.overflowX) || cuts(cs.overflowY) || cs.contain.includes('paint')) {
      const r = el.getBoundingClientRect();
      c = { l: Math.max(up.l, r.left), t: Math.max(up.t, r.top), r: Math.min(up.r, r.right), b: Math.min(up.b, r.bottom) };
    }
    clips.set(el, c);
    return c;
  };
  const out = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = 0;
  for (let n = walker.nextNode(); n !== null; n = walker.nextNode()) {
    const text = (n.nodeValue ?? '').trim();
    const el = n.parentElement;
    if (text === '' || el === null || el.closest('svg') !== null) continue;
    if (el.checkVisibility && !el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
    node += 1;
    const c = clipOf(el);
    const range = document.createRange();
    range.selectNodeContents(n);
    for (const r of range.getClientRects()) {
      const l = Math.max(r.left, c.l);
      const t = Math.max(r.top, c.t);
      const w = Math.min(r.right, c.r) - l;
      const h = Math.min(r.bottom, c.b) - t;
      if (w >= 3 && h >= 3) out.push({ node, text: text.slice(0, 40), x: Math.round(l), y: Math.round(t), w: Math.round(w), h: Math.round(h) });
    }
  }
  return out;
}

/**
 * WHERE TWO RUNS OF TEXT CROSS (the plan of 20 October, batch 3b: the roadmap read "Proofing press 5 of 8Invoice
 * 2026-049"). Two boxes of different runs cross when they share more than 2px across and at least `share` of the
 * shorter one's height, so two lines that only touch at a tall font's ascent are not a fault. Each pair once, by text.
 */
export function crossings(boxes, share = 0.4) {
  const out = [];
  const seen = new Set();
  for (let i = 0; i < boxes.length; i += 1)
    for (let j = i + 1; j < boxes.length; j += 1) {
      const a = boxes[i];
      const b = boxes[j];
      if (a.node === b.node) continue;
      const across = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const down = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      if (across <= 2 || down < share * Math.min(a.h, b.h)) continue;
      const key = `${a.text}\u0000${b.text}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ a: a.text, b: b.text, at: [Math.max(a.x, b.x), Math.max(a.y, b.y)] });
    }
  return out;
}

/**
 * THE SCREENS A SOURCE NAMES ITSELF (`source.screens`, a board's: `tools/look/board.mjs`), in place of a set's. An
 * entry is a screen as `screensOf` hands one back, `{ key, name, path, why }`, drawn as given (a board's own page), or
 * a key of the named sets, drawn as the record picks it. A key no set knows is said as missing, never dropped.
 */
export async function namedScreens(named, picked, of = screensOf) {
  const keys = named.filter((n) => typeof n === 'string');
  const known = new Map();
  if (keys.length > 0)
    for (const set of ['six', 'nine']) {
      const got = await of(set, picked);
      for (const s of got.screens) known.set(s.key, { screen: s });
      for (const m of got.missing) if (!known.has(m.key)) known.set(m.key, { missing: m });
    }
  const screens = [];
  const missing = [];
  for (const n of named) {
    if (typeof n !== 'string') screens.push(n);
    else if (known.get(n)?.screen) screens.push(known.get(n).screen);
    else missing.push(known.get(n)?.missing ?? { key: n, name: n, missing: `The look has no screen called ${n}.` });
  }
  return { screens, missing };
}

/** Is this screen one the source says it cannot draw: by its name, or a settings area by its own word. */
export function cannotOf(source, screen) {
  const name = screen.name.toLowerCase();
  return (source.cannot ?? []).find((c) => c.screens.some((s) => name === s.toLowerCase() || name.endsWith(`: ${s.toLowerCase()}`)));
}

/** The record's answer to one read, through the look's own server, or `null` for a refusal. */
export const asker = (origin) => async (method, body = {}) => {
  try {
    const res = await fetch(`${origin}/api/${method}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const said = await res.json();
    return said?.ok === true ? said.value : null;
  } catch {
    return null;
  }
};

/**
 * A tally's change across one picture, so writes blocked are counted against the screen that sent them. A nested
 * tally (the live source's `blocked`, by route) is followed, so the line names the route that was refused.
 */
export const since = (before, after) => {
  const out = {};
  for (const [k, v] of Object.entries(after ?? {})) {
    if (typeof v === 'number' && v - (before?.[k] ?? 0) > 0) out[k] = v - (before?.[k] ?? 0);
    else if (v !== null && typeof v === 'object') {
      const inner = since(before?.[k], v);
      if (Object.keys(inner).length > 0) out[k] = inner;
    }
  }
  return out;
};

/** One picture of one screen at one width and theme, and its line of `said.json`. */
async function shoot(page, ready, heard, { app, screen, width, theme, out, source, timeoutMs, settleMs, known, now }) {
  heard.errors.length = 0;
  heard.failed.length = 0;
  const before = source.counts();
  const started = Date.now();
  await page.goto(`${app}${screen.path}`, { waitUntil: 'domcontentloaded' }).catch((e) => heard.errors.push(`did not open: ${e.message.split('\n')[0]}`));
  let settled = await ready.settled(page);
  /* A SCREEN THAT MOVES ON (`/SG2` opens the row it names) settles twice: the picture is of the screen it landed on,
     so once the address has moved off the one asked for, its own `data-screen` is waited for (VERIFY P8). */
  const asked = new URL(`${app}${screen.path}`).pathname;
  if (new URL(page.url()).pathname !== asked) {
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    settled = await ready.settled(page);
  }
  const settleTook = Date.now() - started;
  /* NOTHING STILL BUSY: a part of the screen that says it is reading is waited for, and one that never stops is said. */
  const busy = await page
    .waitForFunction(() => document.querySelector('main [aria-busy="true"]') === null, null, { timeout: timeoutMs })
    .then(() => 'none', () => 'still busy');
  const fonts = await page.evaluate(async () => (await document.fonts.ready).status).catch(() => 'unknown');
  /* THE RECORD MAY KEEP A SCHEME OF ITS OWN (`look.scheme`), which the app adopts after it boots and which the browser's
     light or dark cannot move. The page's attribute is set to the theme asked for, which writes nothing, and the line
     says the record would have drawn the other. */
  const kept = await page.evaluate((t) => {
    const d = document.documentElement;
    const was = d.getAttribute('data-scheme');
    if (was !== null && was !== t) d.setAttribute('data-scheme', t);
    return was;
  }, theme);
  /* An off-screen group of a long list is not laid out until it nears the window, so a full page would show it empty.
     Set through each element's style and not a <style> tag: the app's policy refuses an inline sheet, which printed a
     console error on every picture and left the groups unpainted. */
  await page
    .evaluate(() => {
      for (const el of document.querySelectorAll('.rowgroup')) el.style.setProperty('content-visibility', 'visible', 'important');
    })
    .catch(() => {});
  /* A BOARD'S SKIN (`source.css`), put after the product's own sheets on every picture, so the candidate is the real
     screen with only the board's change. The context bypasses the app's policy for it, and only when there is one. */
  if (typeof source.css === 'string' && source.css.trim() !== '') await page.addStyleTag({ content: source.css }).catch((e) => heard.errors.push(`the board's skin was not put on: ${e.message.split('\n')[0]}`));
  await page.waitForTimeout(settleMs);
  const facts = await page
    .evaluate(() => ({
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      text: (document.querySelector('main') ?? document.body).innerText,
      marked: [...document.querySelectorAll('[data-count]')].map((el) => ({
        of: el.getAttribute('aria-label') ?? el.closest('[aria-label]')?.getAttribute('aria-label') ?? null,
        n: el.getAttribute('data-count'),
      })),
    }))
    .catch(() => ({ overflow: 0, text: '', marked: [] }));
  /* WHAT THE THREE QUICK CHECKS NEED THAT TEXT DOES NOT HOLD (`checks.mjs`): the badge, the More sheet, the key numbers' sentences and the charts' points. */
  const seen = await page.evaluate(pageFactsIn).catch(() => ({ badges: [], more: [], sentences: [], charts: [], decor: [] }));
  /* TEXT THAT CROSSES TEXT, over the whole page and not only the first screen: a fault the look fails on. */
  const crossed = crossings(await page.evaluate(textBoxesIn).catch(() => []));
  const base = `${screen.key}-${width}-${theme}`;
  await page.screenshot({ path: join(out, `${base}.png`) });
  /* THE WHOLE PAGE IS THE SCROLL CONTAINER'S, NOT THE DOCUMENT'S (SF11). The shell scrolls `.body` and holds `html` and
     `body` at the window's height (`app.css`), so a full-page picture of the document was the first screen again. The
     window is made as tall as the container's content plus its top for the picture, and put back after. */
  const viewport = page.viewportSize();
  const tall = await page
    .evaluate(() => {
      const scroller = [...document.querySelectorAll('.body, main')].find((el) => el.scrollHeight > el.clientHeight + 1);
      return scroller ? Math.ceil(scroller.getBoundingClientRect().top + scroller.scrollHeight) : 0;
    })
    .catch(() => 0);
  if (viewport && tall > viewport.height) await page.setViewportSize({ width: viewport.width, height: tall });
  await page.screenshot({ path: join(out, `${base}-full.png`), fullPage: true });
  if (viewport && tall > viewport.height) await page.setViewportSize(viewport);
  /* What went on is not what was refused: `forwarded` is the reads handed to the record, kept apart. */
  const { forwarded = 0, ...blocked } = since(before, source.counts());
  return {
    screen: screen.key,
    name: screen.name,
    route: screen.path,
    picked: screen.why,
    width,
    theme,
    image: `${base}.png`,
    full: `${base}-full.png`,
    settled,
    settleMs: settleTook,
    waited: { screen: settled ?? 'never settled', busy, fonts },
    ...(kept !== null && kept !== theme ? { schemeKept: kept } : {}),
    consoleErrors: [...new Set(heard.errors)].slice(0, 12),
    failedRequests: [...new Set(heard.failed)].slice(0, 12),
    readsForwarded: forwarded,
    writesBlocked: blocked.writes ?? 0,
    refused: blocked,
    overflowPx: Math.max(0, facts.overflow),
    raw: rawIn(facts.text, { all: true, slugs: known.slugs }),
    counts: countsIn(facts.text, seen),
    ages: agesOf(seen, now),
    overlaps: { count: crossed.length, e: crossed.slice(0, 5) },
    marked: facts.marked,
    lint: null,
  };
}

/** The look's pictures and its `said.json`. Called by `run.mjs` with the server already up. */
export default async function capture({ origin, app, set, out, source }) {
  const timeoutMs = budget('ready').settleTimeoutMs;
  const height = budget('layout').viewportHeightPx;
  const settleMs = budget('layout').settleMs;
  const ready = readiness('look', timeoutMs, join(ROOT, 'apps', 'web', 'build'));
  const ask = asker(origin);
  const picked = await pick(ask);
  /* THE RECORD'S OWN CLOCK is what "today" means to the ages (`boot.now`: the seed's is pinned, a live record's is the host's). */
  const booted = Date.parse((await ask('boot'))?.now ?? '');
  const now = Number.isFinite(booted) ? booted : Date.now();
  const known = { slugs: slugsOf(picked.pages) };
  const { screens, missing } = Array.isArray(source.screens) ? await namedScreens(source.screens, picked) : await screensOf(set, picked);
  const cannot = [];
  const drawn = [];
  for (const s of screens) {
    const c = cannotOf(source, s);
    if (c) cannot.push({ screen: s.key, name: s.name, route: s.path, why: c.why });
    else drawn.push(s);
  }
  const { pages: _pages, places, ...rest } = picked;
  const samples = { ...rest, places: Object.fromEntries(Object.entries(places).map(([k, p]) => [k, p && { slug: p.slug, title: p.title }])) };
  const said = {
    look: {
      source: source.name,
      record: source.record,
      set,
      seen: source.seen,
      pressable: source.pressable,
      widths: source.widths ?? widths(),
      themes: THEMES,
      height,
      waitedFor: 'the screen said it settled (data-screen on main), nothing in main is aria-busy, and the fonts have loaded',
      started: new Date().toISOString(),
    },
    picked: samples,
    missing: missing.map((m) => ({ screen: m.key, name: m.name, why: m.missing })),
    cannot,
    sourceCannot: source.cannot ?? [],
    shots: [],
  };
  const write = () => writeFileSync(join(out, 'said.json'), `${JSON.stringify(said, null, 2)}\n`);
  const browser = await chromium.launch();
  try {
    for (const theme of THEMES)
      for (const width of source.widths ?? widths()) {
        const phone = width < 600;
        const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: phone ? 2 : 1, colorScheme: theme, isMobile: phone, hasTouch: phone, bypassCSP: typeof source.css === 'string' });
        const page = await context.newPage();
        const heard = { errors: [], failed: [] };
        page.on('pageerror', (e) => heard.errors.push(String(e.message ?? e).split('\n')[0]));
        page.on('console', (m) => m.type() === 'error' && heard.errors.push(m.text().split('\n')[0]));
        page.on('requestfailed', (r) => heard.failed.push(`${r.method()} ${new URL(r.url()).pathname}: ${r.failure()?.errorText ?? 'failed'}`));
        page.on('response', (r) => r.status() >= 400 && heard.failed.push(`${r.request().method()} ${new URL(r.url()).pathname}: ${r.status()}`));
        for (const screen of drawn) {
          said.shots.push(await shoot(page, ready, heard, { app, screen, width, theme, out, source, timeoutMs, settleMs, known, now }));
          console.log(`  ${screen.key} ${width} ${theme}: ${said.shots.at(-1).settled ?? 'never settled'}`);
          write();
        }
        await context.close();
      }
    said.sheets = await sheets({ browser, out, said });
  } finally {
    await browser.close();
  }
  said.look.closed = new Date().toISOString();
  const stuck = said.shots.filter((s) => s.settled === null || s.settled === 'refused');
  const crossing = said.shots.filter((s) => s.overlaps.count > 0);
  /* THE THREE QUICK CHECKS, ONE LINE (`checks.mjs`): record words, counts that disagree, old numbers with no age. */
  said.checks = judge(said.shots);
  said.look.verdict = [
    stuck.length === 0 ? 'every screen drew' : `${stuck.length} of ${said.shots.length} pictures show a screen that never settled or refused`,
    ...(crossing.length > 0 ? [`${crossing.length} show text crossing text (${crossing.map((s) => `${s.screen} ${s.width} ${s.theme}`).join(', ')})`] : []),
    ...(said.checks.found ? [said.checks.summary] : []),
  ].join('; ');
  write();
  for (const s of crossing) console.log(`  text crosses text on ${s.screen} ${s.width} ${s.theme}: ${s.overlaps.e.map((o) => `"${o.a}" and "${o.b}"`).join('; ')}`);
  console.log(`  look: ${said.shots.length} pictures, ${said.missing.length + cannot.length} screens not drawn, in ${out}`);
  console.log(`  checks: ${said.checks.summary}`);
  for (const line of said.checks.lines) console.log(`    ${line}`);
  console.log(`  checks do not see: ${said.checks.cannot.join('; ')}`);
  if (stuck.length > 0 || crossing.length > 0 || said.checks.found || ready.nothingDrawn() !== null) process.exitCode = 1;
  return said;
}
