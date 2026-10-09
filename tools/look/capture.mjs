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
 */

import { writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

import { budget, readiness } from '../gates/lib.mjs';
import { pick, screensOf } from './screens.mjs';
import { sheets } from './sheet.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

export const THEMES = ['light', 'dark'];

/** The look's widths, read where every number a check asserts is kept. */
export const widths = () => [...budget('look').widths];

/** What a person must never read on a screen, counted on each picture for the reader to look at first. */
export const RAW = {
  /* A template slot that was never filled: `{{revenue.monthly}}`, the audit's first finding on his record. */
  placeholders: /\{\{[^}\n]{1,80}\}\}/gu,
  /* A machine instant in print: 2026-10-06T19:07:01.610Z. */
  instants: /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?\b/gu,
  /* A row's own id, a ULID: 26 characters of Crockford's alphabet. */
  ids: /\b[0-9A-HJKMNP-TV-Z]{26}\b/gu,
  /* An address in the record's own spelling, `tools#8`, where a name belongs. */
  handles: /\b[a-z][a-z_]{2,}#\d+\b/gu,
  /* The words a stuck value prints. */
  stuck: /\b(?:undefined|NaN|null|\[object Object\])\b/gu,
};

/** The raw things in a screen's text, each with up to three examples. */
export function rawIn(text) {
  const out = {};
  for (const [kind, re] of Object.entries(RAW)) {
    const found = [...String(text).matchAll(re)].map((m) => m[0]);
    if (found.length > 0) out[kind] = { count: found.length, e: [...new Set(found)].slice(0, 3) };
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
async function shoot(page, ready, heard, { app, screen, width, theme, out, source, timeoutMs, settleMs }) {
  heard.errors.length = 0;
  heard.failed.length = 0;
  const before = source.counts();
  const started = Date.now();
  await page.goto(`${app}${screen.path}`, { waitUntil: 'domcontentloaded' }).catch((e) => heard.errors.push(`did not open: ${e.message.split('\n')[0]}`));
  const settled = await ready.settled(page);
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
  const base = `${screen.key}-${width}-${theme}`;
  await page.screenshot({ path: join(out, `${base}.png`) });
  await page.screenshot({ path: join(out, `${base}-full.png`), fullPage: true });
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
    raw: rawIn(facts.text),
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
  const picked = await pick(asker(origin));
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
          said.shots.push(await shoot(page, ready, heard, { app, screen, width, theme, out, source, timeoutMs, settleMs }));
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
  said.look.verdict = stuck.length === 0 ? 'every screen drew' : `${stuck.length} of ${said.shots.length} pictures show a screen that never settled or refused`;
  write();
  console.log(`  look: ${said.shots.length} pictures, ${said.missing.length + cannot.length} screens not drawn, in ${out}`);
  if (stuck.length > 0 || ready.nothingDrawn() !== null) process.exitCode = 1;
  return said;
}
